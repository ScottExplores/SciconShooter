"""Version-pinned MaleCNS acquisition and transparent sparse graph compilation.

The downloader uses only the standard library. Compilation needs NumPy,
PyArrow and SciPy from the lab's private virtual environment. Nothing is fetched
when importing this module. Raw files are never silently replaced.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import time
from typing import Any
import urllib.error
import urllib.request
from datetime import datetime, timezone

LAB_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = LAB_ROOT / "configs" / "datasets.json"
DEFAULT_DATA = LAB_ROOT / "data"
CHUNK_BYTES = 4 * 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def hash_file(path: Path) -> tuple[str, str, int]:
    sha, md5, size = hashlib.sha256(), hashlib.md5(), 0
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(CHUNK_BYTES), b""):
            sha.update(block)
            md5.update(block)
            size += len(block)
    return sha.hexdigest(), base64.b64encode(md5.digest()).decode("ascii"), size


def validate_source_spec(spec: dict[str, Any]) -> None:
    filename = spec["filename"]
    if Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise ValueError("Dataset filename must be a basename")
    url = spec["url"]
    if not url.startswith("https://storage.googleapis.com/flyem-male-cns/v1.0/"):
        raise ValueError("Only the pinned official MaleCNS v1.0 bucket is permitted")
    digest = spec.get("sha256")
    if digest is not None and not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise ValueError("sha256 must be a lowercase 64-character hex digest")


def remote_metadata(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, method="HEAD", headers={"Accept-Encoding": "identity"})
    with urllib.request.urlopen(request, timeout=60) as response:
        hashes = ",".join(response.headers.get_all("x-goog-hash", []))
        md5 = next((item.strip()[4:] for item in hashes.split(",") if item.strip().startswith("md5=")), None)
        return {
            "url": url,
            "etag": response.headers.get("ETag"),
            "generation": response.headers.get("x-goog-generation"),
            "size_bytes": int(response.headers["Content-Length"]),
            "md5_base64": md5,
        }


def verify_file(path: Path, spec: dict[str, Any], metadata: dict[str, Any]) -> dict[str, Any]:
    sha, md5, size = hash_file(path)
    if spec.get("size_bytes") and size != spec["size_bytes"]:
        raise ValueError(f"Pinned size mismatch for {path.name}")
    if size != metadata["size_bytes"]:
        raise ValueError(f"Size mismatch for {path.name}: {size} != {metadata['size_bytes']}")
    if metadata.get("md5_base64") and md5 != metadata["md5_base64"]:
        raise ValueError(f"Official GCS MD5 mismatch for {path.name}")
    if spec.get("sha256") and sha != spec["sha256"]:
        raise ValueError(f"Pinned SHA-256 mismatch for {path.name}; existing raw data left untouched")
    return {**metadata, "sha256": sha, "size_bytes": size, "verified_at": utc_now(), "sha256_pin_verified": bool(spec.get("sha256"))}


def download_file(spec: dict[str, Any], raw_dir: Path, *, retries: int = 3) -> dict[str, Any]:
    """Resume an unchanged GCS object and promote only a fully verified file.

    Partial bytes are paired with the object generation, size and ETag. A server
    ignoring Range causes a clean restart of the partial file, never append.
    Existing final files require matching recorded/pinned identity and are read
    only. An exclusive lock rejects overlapping writers.
    """
    validate_source_spec(spec)
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_dir / spec["filename"]
    provenance_path = path.with_name(path.name + ".provenance.json")
    if path.exists():
        if not provenance_path.exists():
            raise ValueError(f"Unrecorded raw file {path}; refuse to overwrite or trust it")
        recorded = read_json(provenance_path)
        if recorded.get("url") != spec["url"]:
            raise ValueError("Existing raw file source differs from configured source")
        verified = verify_file(path, {**spec, "sha256": spec.get("sha256") or recorded["sha256"]}, recorded)
        return {**recorded, "last_verified_at": verified["verified_at"]}

    lock = path.with_name(path.name + ".download.lock")
    try:
        lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise RuntimeError(f"Download already locked: {lock}; inspect the owner process before removing a stale lock") from error
    try:
        with os.fdopen(lock_fd, "w") as stream:
            stream.write(str(os.getpid()))
        metadata = remote_metadata(spec["url"])
        partial = path.with_name(path.name + ".part")
        partial_meta = path.with_name(path.name + ".part.json")
        identity_keys = ("url", "etag", "generation", "size_bytes", "md5_base64")
        if partial.exists():
            existing = read_json(partial_meta) if partial_meta.exists() else {}
            if any(existing.get(key) != metadata.get(key) for key in identity_keys):
                raise ValueError(f"Partial source identity changed for {path.name}; retain it for inspection")
            if partial.stat().st_size > metadata["size_bytes"]:
                raise ValueError("Partial file is larger than the official object")
        else:
            atomic_json(partial_meta, metadata)
        remaining = metadata["size_bytes"] - (partial.stat().st_size if partial.exists() else 0)
        if shutil.disk_usage(raw_dir).free < remaining + 256 * 1024 * 1024:
            raise OSError("Not enough free disk space for the pinned raw object")

        for attempt in range(retries):
            offset = partial.stat().st_size if partial.exists() else 0
            if offset == metadata["size_bytes"]:
                break
            headers = {"Accept-Encoding": "identity"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
                if metadata.get("etag"):
                    headers["If-Range"] = metadata["etag"]
            try:
                with urllib.request.urlopen(urllib.request.Request(spec["url"], headers=headers), timeout=90) as response:
                    for header, key in (("ETag", "etag"), ("x-goog-generation", "generation")):
                        if metadata.get(key) and response.headers.get(header) != metadata[key]:
                            raise ValueError("Object identity changed between HEAD and GET")
                    status = response.status
                    if offset and status == 206:
                        expected = f"bytes {offset}-{metadata['size_bytes'] - 1}/{metadata['size_bytes']}"
                        if response.headers.get("Content-Range") != expected:
                            raise ValueError("Invalid Content-Range for resumed download")
                        mode = "ab"
                    elif status == 200:
                        mode, offset = "wb", 0
                    else:
                        raise ValueError(f"Unexpected HTTP status {status}")
                    with partial.open(mode) as stream:
                        received = offset
                        last_report = time.monotonic()
                        while block := response.read(CHUNK_BYTES):
                            received += len(block)
                            if received > metadata["size_bytes"]:
                                raise ValueError("Response exceeded official object length")
                            stream.write(block)
                            if time.monotonic() - last_report >= 20:
                                print(f"download {path.name}: {received}/{metadata['size_bytes']} bytes", flush=True)
                                last_report = time.monotonic()
                        stream.flush()
                        os.fsync(stream.fileno())
                if received != metadata["size_bytes"]:
                    raise OSError("Incomplete response; partial download retained")
                break
            except (OSError, urllib.error.URLError):
                if attempt + 1 == retries:
                    raise
                time.sleep(min(2 ** attempt, 4))
        provenance = verify_file(partial, spec, metadata)
        provenance["sha256_pinned_before_download"] = bool(spec.get("sha256"))
        # Record first; an interrupted rename can be safely retried from .part.
        atomic_json(provenance_path, provenance)
        os.replace(partial, path)
        partial_meta.unlink(missing_ok=True)
        print(f"verified {path.name}: sha256={provenance['sha256']}", flush=True)
        return provenance
    finally:
        lock.unlink(missing_ok=True)


def prepare_sources(config_path: Path = DEFAULT_CONFIG, data_dir: Path = DEFAULT_DATA, *, names: list[str] | None = None) -> dict[str, Any]:
    config = read_json(config_path)
    records = {}
    raw_dir = data_dir / "raw" / config["release"]
    for name in names or list(config["files"]):
        records[name] = download_file(config["files"][name], raw_dir)
    return records


def inspect_sources(config_path: Path = DEFAULT_CONFIG, data_dir: Path = DEFAULT_DATA) -> dict[str, Any]:
    import pyarrow as pa
    import pyarrow.ipc as ipc
    config = read_json(config_path)
    result = {}
    for name, spec in config["files"].items():
        path = data_dir / "raw" / config["release"] / spec["filename"]
        if not path.exists():
            result[name] = {"status": "not_downloaded"}
            continue
        with pa.memory_map(str(path), "r") as source:
            reader = ipc.open_file(source)
            result[name] = {"schema": str(reader.schema), "record_batches": reader.num_record_batches, "rows": sum(reader.get_batch(i).num_rows for i in range(reader.num_record_batches))}
    return result


def _column(table: Any, names: tuple[str, ...], *, required: bool = True) -> str | None:
    for name in names:
        if name in table.column_names:
            return name
    if required:
        raise ValueError(f"Expected one of {names}; got {table.column_names}")
    return None


def _text_values(table: Any, names: tuple[str, ...], default: str = "") -> list[str]:
    name = _column(table, names, required=False)
    if name is None:
        return [default] * table.num_rows
    return [default if value is None else str(value) for value in table[name].to_pylist()]


def canonical_nt(value: Any) -> str:
    if value is None:
        return "unknown"
    name = str(value).strip().lower()
    aliases = {"ach": "acetylcholine", "gaba": "gaba", "glu": "glutamate", "his": "histamine", "da": "dopamine", "dop": "dopamine", "oa": "octopamine", "5ht": "serotonin", "5-ht": "serotonin", "": "unknown", "nan": "unknown", "none": "unknown", "unclear": "unknown"}
    return aliases.get(name, name)


def neuron_mask(superclasses: list[str], statuses: list[str]) -> Any:
    import numpy as np
    # Preserve tbc classes; absence of a name/status is not itself exclusion.
    explicit_non_neuronal = {"glia", "glial", "trachea", "tracheal", "non-neuronal", "non_neuronal", "non_neuron"}
    return np.array([bool(group.strip()) and group.strip().lower() not in explicit_non_neuronal and status.strip().lower() not in explicit_non_neuronal for group, status in zip(superclasses, statuses)], dtype=bool)


def compile_csr(ids: Any, source_ids: Any, target_ids: Any, contacts: Any) -> tuple[Any, Any, Any, dict[str, int]]:
    """Compile a small in-memory edge table; also used to validate source semantics."""
    import numpy as np
    from scipy.sparse import coo_matrix
    ids = np.asarray(ids, dtype=np.uint64)
    if len(ids) == 0 or np.any(ids[1:] <= ids[:-1]):
        raise ValueError("Neuron IDs must be nonempty, sorted and unique")
    source_ids, target_ids = np.asarray(source_ids, dtype=np.uint64), np.asarray(target_ids, dtype=np.uint64)
    counts = np.asarray(contacts)
    if len(source_ids) != len(target_ids) or len(counts) != len(source_ids):
        raise ValueError("Edge columns have different lengths")
    if np.any(~np.isfinite(counts)) or np.any(counts <= 0) or np.any(counts != np.floor(counts)):
        raise ValueError("Contact counts must be positive finite integers")
    pre, post = np.searchsorted(ids, source_ids), np.searchsorted(ids, target_ids)
    keep = (pre < len(ids)) & (post < len(ids))
    keep &= (ids[np.minimum(pre, len(ids) - 1)] == source_ids) & (ids[np.minimum(post, len(ids) - 1)] == target_ids)
    matrix = coo_matrix((counts[keep].astype(np.uint64), (pre[keep], post[keep])), shape=(len(ids), len(ids))).tocsr()
    matrix.sum_duplicates()
    matrix.sort_indices()
    if matrix.data.max(initial=0) > np.iinfo(np.uint32).max:
        raise OverflowError("A directed pair exceeds uint32 contact capacity")
    return matrix.indptr.astype(np.int64), matrix.indices.astype(np.int32), matrix.data.astype(np.uint32), {"input_rows": len(counts), "retained_rows": int(keep.sum()), "excluded_rows": int((~keep).sum()), "merged_duplicate_rows": int(keep.sum() - matrix.nnz)}


def compile_dataset(config_path: Path = DEFAULT_CONFIG, data_dir: Path = DEFAULT_DATA) -> dict[str, Any]:
    import numpy as np
    import pyarrow as pa
    import pyarrow.feather as feather
    import pyarrow.ipc as ipc
    from collections import Counter
    from scipy.sparse import coo_matrix

    started = time.monotonic()
    config = read_json(config_path)
    raw_dir = data_dir / "raw" / config["release"]
    provenance = {}
    for name, spec in config["files"].items():
        path = raw_dir / spec["filename"]
        recorded = read_json(path.with_name(path.name + ".provenance.json"))
        provenance[name] = verify_file(path, {**spec, "sha256": spec.get("sha256") or recorded["sha256"]}, recorded)
    annotations = feather.read_table(raw_dir / config["files"]["annotations"]["filename"])
    body_col = _column(annotations, ("body", "bodyId", "body_id"))
    groups = _text_values(annotations, ("superclass", "super_class"))
    if not any(groups):
        raise ValueError("No superclass annotations found; cannot infer neuronal identity")
    statuses = _text_values(annotations, ("status",))
    include = neuron_mask(groups, statuses)
    all_ids = np.asarray(annotations[body_col].to_numpy(), dtype=np.uint64)
    selected = np.flatnonzero(include)
    selected = selected[np.argsort(all_ids[selected], kind="stable")]
    ids = all_ids[selected]
    if len(ids) == 0 or np.any(ids[1:] == ids[:-1]):
        raise ValueError("Invalid retained node set")
    def selected_text(names: tuple[str, ...]) -> Any:
        return np.asarray(_text_values(annotations, names), dtype=str)[selected]
    types = selected_text(("type", "cell_type"))
    superclasses = np.asarray(groups, dtype=str)[selected]
    regions = selected_text(("somaNeuromere", "soma_neuromere", "somaSide", "soma_side", "rootSide"))
    sides = selected_text(("somaSide", "soma_side", "rootSide"))
    assigned_ol_hex = np.full((len(ids), 2), np.nan, dtype=np.float32)
    for axis, name in enumerate(("assignedOlHex1", "assignedOlHex2")):
        if name in annotations.column_names:
            assigned_ol_hex[:, axis] = np.asarray(annotations[name].to_numpy(), dtype=np.float32)[selected]
    nts = feather.read_table(raw_dir / config["files"]["neurotransmitters"]["filename"])
    nt_id_col = _column(nts, ("body", "bodyId", "body_id"))
    nt_col = _column(nts, ("consensus_nt", "consensusNt", "predictedNt", "predicted_nt", "nt"))
    nt_lookup = {int(body): canonical_nt(nt) for body, nt in zip(nts[nt_id_col].to_pylist(), nts[nt_col].to_pylist())}
    neurotransmitters = np.asarray([nt_lookup.get(int(body), "unknown") for body in ids], dtype=str)
    sign_map = config["neurotransmitter_signs"]
    signs = np.asarray([sign_map.get(nt, 0) for nt in neurotransmitters], dtype=np.float64)
    unsupported = sorted(set(neurotransmitters.tolist()) - set(sign_map))

    source_chunks, target_chunks, contact_chunks = [], [], []
    input_rows = retained_rows = source_contact_sum = 0
    weights_path = raw_dir / config["files"]["weights"]["filename"]
    with pa.memory_map(str(weights_path), "r") as source:
        reader = ipc.open_file(source)
        names = reader.schema.names
        pre_col = next((name for name in ("body_pre", "bodyId_pre", "source") if name in names), None)
        post_col = next((name for name in ("body_post", "bodyId_post", "target") if name in names), None)
        weight_col = next((name for name in ("weight", "syn_count", "contact_count") if name in names), None)
        if not all((pre_col, post_col, weight_col)):
            raise ValueError(f"Unrecognized weights schema: {names}")
        for number in range(reader.num_record_batches):
            batch = reader.get_batch(number)
            pre_ids = np.asarray(batch.column(names.index(pre_col)).to_numpy(), dtype=np.uint64)
            post_ids = np.asarray(batch.column(names.index(post_col)).to_numpy(), dtype=np.uint64)
            counts = np.asarray(batch.column(names.index(weight_col)).to_numpy())
            if np.any(~np.isfinite(counts)) or np.any(counts <= 0) or np.any(counts != np.floor(counts)):
                raise ValueError("Invalid released contact counts")
            source_contact_sum += int(counts.sum(dtype=np.uint64))
            pre, post = np.searchsorted(ids, pre_ids), np.searchsorted(ids, post_ids)
            keep = (pre < len(ids)) & (post < len(ids))
            keep &= (ids[np.minimum(pre, len(ids) - 1)] == pre_ids) & (ids[np.minimum(post, len(ids) - 1)] == post_ids)
            source_chunks.append(pre[keep].astype(np.int32))
            target_chunks.append(post[keep].astype(np.int32))
            contact_chunks.append(counts[keep].astype(np.uint64))
            input_rows += len(counts)
            retained_rows += int(keep.sum())
            if number and number % 400 == 0:
                print(f"compile: scanned {input_rows} segment pairs; retained {retained_rows}", flush=True)
    pre, post, counts = np.concatenate(source_chunks), np.concatenate(target_chunks), np.concatenate(contact_chunks)
    del source_chunks, target_chunks, contact_chunks
    matrix = coo_matrix((counts, (pre, post)), shape=(len(ids), len(ids))).tocsr()
    matrix.sum_duplicates()
    matrix.sort_indices()
    del pre, post, counts
    if matrix.data.max(initial=0) > np.iinfo(np.uint32).max:
        raise OverflowError("Contact count exceeds uint32")
    arrays = {
        "ids": ids,
        "indptr": matrix.indptr.astype(np.int64),
        "indices": matrix.indices.astype(np.int32),
        "contacts": matrix.data.astype(np.uint32),
        "signs": signs,
        "neuron_types": types,
        "neuron_regions": regions,
        "neurotransmitters": neurotransmitters,
        "neuron_superclasses": superclasses,
        "neuron_sides": sides,
        "assigned_ol_hex": assigned_ol_hex,
    }
    from scipy.sparse.csgraph import connected_components
    weak_components = connected_components(matrix, directed=True, connection="weak", return_labels=False)
    strong_components = connected_components(matrix, directed=True, connection="strong", return_labels=False)
    out_degree = np.diff(matrix.indptr)
    in_degree = np.bincount(matrix.indices, minlength=len(ids))
    autapses = int(np.count_nonzero(matrix.diagonal()))
    contact_sum = int(matrix.data.sum(dtype=np.uint64))
    zero_pre_edges = int(out_degree[signs == 0].sum())
    # Summing rows via sparse reduction handles empty rows exactly.
    zero_pre_contacts = int(np.asarray(matrix.sum(axis=1)).ravel()[signs == 0].sum(dtype=np.uint64))
    nt_counts = dict(Counter(neurotransmitters.tolist()))
    group_counts = dict(Counter(superclasses.tolist()))
    populations = {}
    for label, pattern in {"kenyon_cells": r"^KC", "mushroom_body_outputs": r"^MBON", "dopamine_named": r"^(PAM|PPL)", "descending_named": r"^DN", "lamina_L1_L2_L3": r"^L[123](?:_|$)", "visual_gamma_KC_candidates": r"^KCg-d$", "visual_alpha_beta_KC_candidates": r"^KCab-p$"}.items():
        population_ids = [str(int(body)) for body, celltype in zip(ids, types) if re.search(pattern, celltype, re.IGNORECASE)]
        populations[label] = {"candidate_count": len(population_ids), "selection_regex": pattern, "validated_functional_mapping": False, "example_ids": population_ids[:12]}

    output_dir = data_dir / "compiled" / config["release"]
    output_dir.mkdir(parents=True, exist_ok=True)
    graph_path = output_dir / "graph.npz"
    manifest_path = output_dir / "manifest.json"
    configuration_hash = hashlib.sha256(json.dumps(config, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if graph_path.exists() or manifest_path.exists():
        if not (graph_path.exists() and manifest_path.exists()):
            raise ValueError("Incomplete existing compiled artifact; inspect before replacing")
        existing = read_json(manifest_path)
        if existing.get("configuration_sha256") != configuration_hash:
            raise ValueError("Compiled configuration changed; use a new data directory for a named model variant")
        if hash_file(graph_path)[0] != existing["graph_sha256"]:
            raise ValueError("Compiled graph was modified")
        return existing
    temp = output_dir / "graph.npz.part"
    with temp.open("wb") as stream:
        np.savez_compressed(stream, **arrays)
        stream.flush()
        os.fsync(stream.fileno())
    graph_sha = hash_file(temp)[0]
    manifest = {
        "schema_version": 1,
        "dataset": config["dataset"],
        "release": config["release"],
        "synthetic": bool(config.get("synthetic", False)),
        "created_at": utc_now(),
        "source": config["source_page"],
        "license": config["license"],
        "attribution": config["attribution"],
        "sources": provenance,
        "source_schema_columns": {"annotations": annotations.column_names, "neurotransmitters": nts.column_names, "weights": names},
        "configuration_sha256": configuration_hash,
        "compiler_sha256": hash_file(Path(__file__))[0],
        "graph_sha256": graph_sha,
        "graph_path": str(graph_path.resolve()),
        "node_policy": config["node_policy"],
        "edge_policy": config["edge_policy"],
        "sign_policy": config["sign_policy_note"],
        "transmitter_signs": sign_map,
        "counts": {"annotation_rows": annotations.num_rows, "neurons": len(ids), "excluded_annotation_rows": int((~include).sum()), "source_segment_pair_rows": input_rows, "source_all_segment_contacts": source_contact_sum, "retained_pair_rows_before_merge": retained_rows, "directed_edges": matrix.nnz, "synaptic_contacts": contact_sum, "merged_duplicate_rows": retained_rows - matrix.nnz, "autapses": autapses, "zero_indegree_neurons": int((in_degree == 0).sum()), "zero_outdegree_neurons": int((out_degree == 0).sum()), "weak_components": weak_components, "strong_components": strong_components, "zero_fast_sign_neurons": int((signs == 0).sum()), "zero_fast_sign_edges": zero_pre_edges, "zero_fast_sign_contacts": zero_pre_contacts},
        "neurotransmitter_counts": nt_counts,
        "unsupported_transmitter_labels": unsupported,
        "superclass_counts": group_counts,
        "population_candidates": populations,
        "array_bytes": {name: array.nbytes for name, array in arrays.items()},
        "total_array_bytes": sum(array.nbytes for array in arrays.values()),
        "compile_seconds": round(time.monotonic() - started, 3),
        "mapping_status": {"retinal": "NOT_VALIDATED", "effector": "NOT_VALIDATED", "visual_KC": "NOT_VALIDATED", "modulation": "NOT_VALIDATED"},
        "limitations": ["Anatomical contact counts are not measured synaptic conductances.", "Neuron regions describe a source annotation, not exclusive synaptic ROI membership.", "Unknown and modulatory neurotransmitters remain nodes/edges but have zero modeled fast-transmission sign.", "Population regex matches are candidates only; no automatic game action or retinal mapping is inferred."],
    }
    os.replace(temp, graph_path)
    atomic_json(manifest_path, manifest)
    examples = []
    # IDs are decimal strings: safe across JS datasets with wider identifiers.
    sample_indices = np.linspace(0, len(ids) - 1, min(256, len(ids)), dtype=int)
    for index in sample_indices:
        examples.append({"id": str(int(ids[index])), "type": str(types[index]), "superclass": str(superclasses[index]), "region": str(regions[index]), "side": str(sides[index]), "neurotransmitter": str(neurotransmitters[index]), "assigned_ol_hex": [float(value) if np.isfinite(value) else None for value in assigned_ol_hex[index]], "in_degree": int(in_degree[index]), "out_degree": int(out_degree[index])})
    atomic_json(output_dir / "neuron-sample.json", {"dataset": config["dataset"], "graph_sha256": graph_sha, "selection": "256 evenly spaced sorted IDs; metadata only, no inferred geometry", "neurons": examples})
    return manifest


def fetch_morphology(data_dir: Path = DEFAULT_DATA, *, max_segments: int = 8000) -> dict[str, Any]:
    """A small authentic SWC sample, with units and sampling explicitly recorded."""
    import numpy as np
    graph_path = data_dir / "compiled" / "v1.0" / "graph.npz"
    with np.load(graph_path, allow_pickle=False) as graph:
        ids = graph["ids"]
        types = graph["neuron_types"]
        groups = graph["neuron_superclasses"]
        regions = graph["neuron_regions"]
        selected = []
        for celltype in ("L1", "KCg-d", "KCab-p", "MBON01", "PPL101", "PAM11"):
            matches = np.flatnonzero(types == celltype)
            if len(matches):
                selected.append(int(matches[0]))
        for group in ("descending_neuron", "vnc_motor"):
            matches = np.flatnonzero(groups == group)
            if len(matches):
                selected.append(int(matches[0]))
    neurons, errors = [], []
    base = "https://storage.googleapis.com/flyem-male-cns/v1.0/segmentation/skeletons-malecns/skeletons-swc/"
    raw = data_dir / "raw" / "v1.0" / "skeletons"
    for index in dict.fromkeys(selected):
        body = str(int(ids[index]))
        spec = {"filename": body + ".swc", "url": base + body + ".swc"}
        try:
            provenance = download_file(spec, raw)
            positions, parents = {}, {}
            for line in (raw / spec["filename"]).read_text(encoding="utf-8").splitlines():
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                values = line.split()
                if len(values) != 7:
                    raise ValueError("Malformed SWC row")
                node, parent = int(values[0]), int(values[6])
                xyz = [float(value) * 8 for value in values[2:5]]
                if not np.all(np.isfinite(xyz)) or node in positions:
                    raise ValueError("Invalid or duplicate SWC node")
                positions[node], parents[node] = xyz, parent
            edges = [(node, parent) for node, parent in parents.items() if parent in positions]
            original_edges = len(edges)
            if len(edges) > max_segments:
                edges = [edges[int(k)] for k in np.linspace(0, len(edges) - 1, max_segments, dtype=int)]
            retained = sorted({node for edge in edges for node in edge})
            mapping = {node: offset for offset, node in enumerate(retained)}
            neurons.append({"id": body, "type": str(types[index]), "region": str(regions[index]), "superclass": str(groups[index]), "source": spec["url"], "sha256": provenance["sha256"], "points": [positions[node] for node in retained], "segments": [[mapping[a], mapping[b]] for a, b in edges], "original_segment_count": original_edges, "displayed_segment_count": len(edges), "sampled": original_edges != len(edges)})
        except (OSError, ValueError, urllib.error.URLError) as error:
            errors.append({"id": body, "error": str(error)})
    result = {"status": "available" if neurons else "unavailable", "dataset": "male-cns:v1.0", "source": "https://male-cns.janelia.org/download/", "units": "nm", "coordinate_transform": "Official SWC coordinates (8 nm units) multiplied by 8; no inferred positions", "selection": "First sorted ID in six named cell types and descending/vnc_motor superclasses; visualization sample, not functional mapping", "sampling": f"At most {max_segments} actual parent-child segments per neuron, evenly indexed if needed", "neurons": neurons, "errors": errors}
    atomic_json(data_dir / "compiled" / "morphology.json", result)
    return {"status": result["status"], "neurons": len(neurons), "errors": errors, "path": str((data_dir / "compiled" / "morphology.json").resolve())}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("download", "inspect", "compile", "prepare", "morphology"))
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--files", nargs="+", choices=("annotations", "neurotransmitters", "weights"))
    args = parser.parse_args(argv)
    if args.command in ("download", "prepare"):
        records = prepare_sources(args.config, args.data_dir, names=args.files)
        print(json.dumps(records, indent=2), flush=True)
    if args.command == "inspect":
        print(json.dumps(inspect_sources(args.config, args.data_dir), indent=2), flush=True)
    if args.command in ("compile", "prepare"):
        print(json.dumps(compile_dataset(args.config, args.data_dir), indent=2), flush=True)
    if args.command == "morphology":
        print(json.dumps(fetch_morphology(args.data_dir), indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
