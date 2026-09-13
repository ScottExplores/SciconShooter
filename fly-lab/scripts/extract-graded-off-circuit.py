"""Extract the nominated anatomical OFF-pathway patch without fitting physiology.

Run from the repository root with fly-lab/.venv/Scripts/python.exe. The output
is deterministic and contains no response measurements or validation promotion.
"""
from __future__ import annotations

import os

for _name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[_name] = "2"
os.environ["PYTHON_DOTENV_DISABLED"] = "1"

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import platform
import sys
import tempfile
import threading
import time

import numpy as np
import psutil
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.feather as feather

LAB = Path(__file__).resolve().parents[1]
ROOT = LAB.parent
sys.path.insert(0, str(LAB / "python"))
from scicon_fly.model import SparseGraph, file_hash

TYPE_ORDER = ("L2", "Tm1", "Tm2")


def summarize(rows, *, incoming, graph):
    """Rows contain (global source, global target, integer contacts)."""
    groups = defaultdict(lambda: [0, 0])
    outside = set()
    for source, target, contacts in rows:
        other = source if incoming else target
        outside.add(other)
        key = (str(graph.annotations["neuron_types"][other]),
               str(graph.annotations["neurotransmitters"][other]), int(graph.signs[source]))
        groups[key][0] += 1
        groups[key][1] += contacts
    return {
        "directedPairs": len(rows),
        "contacts": sum(r[2] for r in rows),
        "distinctOutsideNeurons": len(outside),
        "byOutsideTypeTransmitterAndSourceSign": [
            {"outsideType": key[0], "outsideNeurotransmitter": key[1],
             "sourceSign": key[2], "directedPairs": value[0], "contacts": value[1]}
            for key, value in sorted(groups.items())
        ],
    }


def extract_edges(graph, selected):
    """Scan sparse rows; never allocate a neuron-by-neuron adjacency matrix."""
    selected = np.asarray(selected, dtype=np.int64)
    if len(np.unique(selected)) != len(selected) or np.any(selected < 0) or np.any(selected >= graph.n):
        raise ValueError("Selected indices must be unique retained neurons")
    compact = np.full(graph.n, -1, dtype=np.int32)
    compact[selected] = np.arange(len(selected), dtype=np.int32)
    internal, incoming, outgoing = [], [], []
    for source in range(graph.n):
        lo, hi = graph.indptr[source:source + 2]
        targets, contacts = graph.indices[lo:hi], graph.contacts[lo:hi]
        if compact[source] >= 0:
            for target, count in zip(targets, contacts):
                if float(count) != int(count):
                    raise ValueError("Anatomical contact counts must be integers")
                target, count = int(target), int(count)
                if compact[target] >= 0:
                    internal.append({"source": int(compact[source]), "target": int(compact[target]),
                                     "contacts": count, "sourceSign": int(graph.signs[source])})
                else:
                    outgoing.append((source, target, count))
        else:
            for offset in np.flatnonzero(compact[targets] >= 0):
                count = contacts[offset]
                if float(count) != int(count):
                    raise ValueError("Anatomical contact counts must be integers")
                incoming.append((source, int(targets[offset]), int(count)))
    internal.sort(key=lambda e: (e["source"], e["target"]))
    if len({(e["source"], e["target"]) for e in internal}) != len(internal):
        raise ValueError("Compiled graph contains duplicate selected directed pairs")

    # Independent chunked target scan checks the incoming partition, including
    # retained autapses. Only one million edge entries are inspected at a time.
    selected_mask = compact >= 0
    inbound_pairs = inbound_contacts = 0
    for lo in range(0, graph.e, 1_000_000):
        hi = min(lo + 1_000_000, graph.e)
        mask = selected_mask[graph.indices[lo:hi]]
        inbound_pairs += int(np.count_nonzero(mask))
        inbound_contacts += int(graph.contacts[lo:hi][mask].sum())
    outbound_pairs = sum(int(graph.indptr[i + 1] - graph.indptr[i]) for i in selected)
    outbound_contacts = sum(int(graph.contacts[graph.indptr[i]:graph.indptr[i + 1]].sum()) for i in selected)
    internal_contacts = sum(e["contacts"] for e in internal)
    if (len(internal) + len(incoming), internal_contacts + sum(r[2] for r in incoming)) != (inbound_pairs, inbound_contacts):
        raise ValueError("Incoming conservation check failed")
    if (len(internal) + len(outgoing), internal_contacts + sum(r[2] for r in outgoing)) != (outbound_pairs, outbound_contacts):
        raise ValueError("Outgoing conservation check failed")
    return internal, incoming, outgoing


def source_record(path):
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": file_hash(path), "sizeBytes": path.stat().st_size}


def extract(inventory_path, side):
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    nominations = [r for r in inventory["diagnosticNomination"] if r["somaSide"] == side]
    if len(nominations) != 1:
        raise ValueError("Exactly one existing nomination is required")
    nomination = nominations[0]
    graph_path, manifest_path = LAB / "data/compiled/v1.0/graph.npz", LAB / "data/compiled/v1.0/manifest.json"
    annotations_path = LAB / "data/raw/v1.0/body-annotations-male-cns-v1.0-minconf-0.5.feather"
    nt_path = LAB / "data/raw/v1.0/body-neurotransmitters-male-cns-v1.0.feather"
    required = (graph_path, manifest_path, annotations_path, nt_path)
    inventory_hashes = {r["path"]: r["sha256"] for r in inventory["sources"]}
    source_records = [source_record(p) for p in required]
    for record in source_records:
        if inventory_hashes.get(record["path"]) != record["sha256"]:
            raise ValueError(f"Frozen inventory source mismatch: {record['path']}")
    graph = SparseGraph.load(graph_path, manifest_path)
    if graph.identity != inventory["graphIdentity"]:
        raise ValueError("Graph identity differs from prior nomination")
    if graph.manifest.get("synthetic") is not False:
        raise ValueError("This extractor requires the released non-synthetic graph")

    by_type = nomination["bodyIdsByType"]
    if set(by_type) != set(TYPE_ORDER) or any(len(by_type[t]) != 19 for t in TYPE_ORDER):
        raise ValueError("Nomination must contain exactly 19 bodies of each declared type")
    exact_ids = [str(b) for t in TYPE_ORDER for b in sorted(by_type[t], key=int)]
    if any(not b.isdecimal() for b in exact_ids) or len(set(exact_ids)) != 57:
        raise ValueError("Nomination IDs must be unique exact decimal strings")
    selected = [graph.neuron_index(b) for b in exact_ids]
    pa.set_cpu_count(2)
    pa.set_io_thread_count(2)
    annotation_columns = ["bodyId", "type", "somaSide", "rootSide", "assignedOlHex1", "assignedOlHex2", "statusLabel", "superclass"]
    raw_annotations = feather.read_table(annotations_path, columns=annotation_columns)
    id_values = pa.array([int(b) for b in exact_ids], type=pa.int64())
    raw_annotations = raw_annotations.filter(pc.is_in(raw_annotations["bodyId"], value_set=id_values)).to_pylist()
    if len(raw_annotations) != 57 or len({r["bodyId"] for r in raw_annotations}) != 57:
        raise ValueError("Raw annotations require one row per nominated body")
    annotations = {r["bodyId"]: r for r in raw_annotations}
    raw_nt = feather.read_table(nt_path)
    raw_nt = raw_nt.filter(pc.is_in(raw_nt["body"], value_set=id_values)).to_pylist()
    if len(raw_nt) != 57 or len({r["body"] for r in raw_nt}) != 57:
        raise ValueError("Raw neurotransmitters require one row per nominated body")
    nts = {r["body"]: r for r in raw_nt}
    columns = {tuple(c) for c in nomination["columns"]}
    neurons = []
    for local, (body, global_index) in enumerate(zip(exact_ids, selected)):
        row, nt = annotations[int(body)], nts[int(body)]
        expected_type = TYPE_ORDER[local // 19]
        if row["type"] != expected_type or str(graph.annotations["neuron_types"][global_index]) != expected_type:
            raise ValueError("Nominated type differs from raw/compiled annotation")
        if row["somaSide"] != side or (row["assignedOlHex1"], row["assignedOlHex2"]) not in columns:
            raise ValueError("Nominated side/column differs from raw annotation")
        neurotransmitter = str(graph.annotations["neurotransmitters"][global_index])
        if neurotransmitter != nt["consensus_nt"]:
            raise ValueError("Compiled and raw consensus neurotransmitter differ")
        neurons.append({"index": local, "bodyId": body, "type": expected_type,
                        "graphIndex": global_index, "somaSide": row["somaSide"], "rootSide": row["rootSide"],
                        "assignedOlHex1": row["assignedOlHex1"], "assignedOlHex2": row["assignedOlHex2"],
                        "statusLabel": row["statusLabel"], "superclass": row["superclass"],
                        "neurotransmitter": neurotransmitter, "sourceSign": int(graph.signs[global_index]),
                        "rawNt": {k: v for k, v in nt.items() if k != "body"}})
    for cell_type in TYPE_ORDER:
        cells = [r for r in neurons if r["type"] == cell_type]
        if len({(r["assignedOlHex1"], r["assignedOlHex2"]) for r in cells}) != 19:
            raise ValueError("Duplicate same-type nominated column; no silent reduction is permitted")

    internal, incoming, outgoing = extract_edges(graph, selected)
    all_rows = {"incoming": incoming, "outgoing": outgoing}
    per_neuron = []
    for neuron in neurons:
        global_index = neuron["graphIndex"]
        item = {"index": neuron["index"], "bodyId": neuron["bodyId"], "type": neuron["type"]}
        for direction, rows in all_rows.items():
            item[direction] = summarize([r for r in rows if r[1 if direction == "incoming" else 0] == global_index],
                                        incoming=direction == "incoming", graph=graph)
        per_neuron.append(item)
    per_type = []
    for cell_type in TYPE_ORDER:
        selected_type = {r["graphIndex"] for r in neurons if r["type"] == cell_type}
        item = {"type": cell_type, "neurons": len(selected_type)}
        for direction, rows in all_rows.items():
            item[direction] = summarize([r for r in rows if r[1 if direction == "incoming" else 0] in selected_type],
                                        incoming=direction == "incoming", graph=graph)
        per_type.append(item)
    pathways = defaultdict(lambda: [0, 0])
    for edge in internal:
        key = (neurons[edge["source"]]["type"], neurons[edge["target"]]["type"])
        pathways[key][0] += 1
        pathways[key][1] += edge["contacts"]
    for target in ("Tm1", "Tm2"):
        expected = nomination["directContacts"][target]["selectedTargets"]
        if pathways[("L2", target)] != [expected["directedPairs"], expected["contacts"]]:
            raise ValueError("Selected direct pathway differs from prior independent inventory")
    return {
        "schemaVersion": 1, "kind": "malecns-graded-off-anatomical-patch", "synthetic": False,
        "evidenceScope": "ANATOMICAL_EXTRACTION_ONLY", "trainingAllowed": False,
        "selection": {"somaSide": side, "typeOrder": list(TYPE_ORDER), "bodyOrderWithinType": "ascending exact integer bodyId",
                      "nomination": nomination, "geometryMeaning": "Published optic-column labels, not calibrated visual angles or retinal positions"},
        "provenance": {"dataset": graph.manifest["dataset"], "source": graph.manifest["source"],
                       "license": graph.manifest["license"], "attribution": graph.manifest["attribution"],
                       "graphIdentity": graph.identity, "graphCounts": graph.manifest["counts"],
                       "sources": [source_record(inventory_path), *source_records, source_record(Path(__file__).resolve()),
                                   source_record(LAB / "python/scicon_fly/model.py")],
                       "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pyarrow": pa.__version__}},
        "neurons": neurons, "internalEdges": internal,
        "internalSummary": {"neurons": len(neurons), "directedPairs": len(internal), "contacts": sum(e["contacts"] for e in internal),
                            "autapses": sum(e["source"] == e["target"] for e in internal),
                            "pathways": [{"sourceType": k[0], "targetType": k[1], "directedPairs": v[0], "contacts": v[1]}
                                         for k, v in sorted(pathways.items())]},
        "boundaries": {
            "definitions": {"incoming": "All contacts from retained neurons outside this patch to selected neurons",
                            "outgoing": "All contacts from selected neurons to retained neurons outside this patch",
                            "sourceSign": "Copied modeled fast sign of the actual presynaptic neuron; not measured receptor-specific polarity",
                            "distinctOutsideNeurons": "Unique outside bodies within the stated group; do not sum across groups",
                            "scope": "Boundary counts reference the retained graph, not unassigned segments excluded by the compiler",
                            "defaultTreatment": "No boundary transmission is simulated by this extraction; any later closure or external drive must be declared"},
            "perNeuron": per_neuron, "perType": per_type,
            "total": {direction: summarize(rows, incoming=direction == "incoming", graph=graph) for direction, rows in all_rows.items()},
        },
        "assumptions": [graph.manifest["sign_policy"], "Contact counts are anatomical multiplicities, not fitted conductance or physiological weights.",
                        "Every internal pair is retained, including cross-column, recurrent, weak and self connections; no new contact threshold is applied.",
                        "Raw ground_truth neurotransmitter fields do not establish per-cell experimental measurement.",
                        "The patch omits photoreceptors and other visual populations and is not the whole MaleCNS connectome.",
                        "No resting release, membrane constant, gain, adaptation, receptor model or sensory response is inferred here."],
        "verification": {"exactNominationIds": True, "rawAndCompiledTypesAndNtMatch": True, "sideAndColumnLabelsMatch": True,
                         "noDuplicateNominatedTypeColumn": True, "allInternalDirectedPairsPreserved": True,
                         "incomingAndOutgoingConservationIndependentChecks": True, "independentInventoryFeedforwardTotalsMatch": True,
                         "sourceHashesAndGraphIdentityMatchInventory": True},
        "reproduction": {"workingDirectory": ".", "command": f"fly-lab/.venv/Scripts/python.exe fly-lab/scripts/extract-graded-off-circuit.py --side {side}",
                         "comparison": "With the same inputs and runtime versions, serialized output bytes are deterministic. Use --check to compare without writing.",
                         "resourceLimits": {"numericThreads": 2, "sampledRssBytes": 4 * 1024**3, "wallSeconds": 1200}},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--side", choices=("R", "L"), default="R")
    parser.add_argument("--inventory", type=Path, default=LAB / "docs/evidence/vision-boundary-inventory-v1.json")
    parser.add_argument("--output", type=Path, default=LAB / "docs/evidence/graded-off-circuit-v1.json")
    parser.add_argument("--check", action="store_true", help="Recompute and byte-compare an existing artifact")
    args = parser.parse_args()
    if args.side != "R" and args.output == LAB / "docs/evidence/graded-off-circuit-v1.json":
        parser.error("A different side requires a separately named --output")
    start = time.monotonic()
    process, stop = psutil.Process(), threading.Event()
    resources = {"peakSampledRssBytes": 0}

    def watchdog():
        while not stop.wait(0.1):
            rss = process.memory_info().rss
            resources["peakSampledRssBytes"] = max(rss, resources["peakSampledRssBytes"])
            if rss > 4 * 1024**3 or time.monotonic() - start > 1200:
                print("Extraction exceeded its sampled resource limit", file=sys.stderr, flush=True)
                os._exit(70)

    thread = threading.Thread(target=watchdog, daemon=True)
    thread.start()
    try:
        result = extract(args.inventory.resolve(), args.side)
        data = (json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")
        if args.check:
            if args.output.read_bytes() != data:
                raise ValueError("Recomputed artifact bytes differ")
        else:
            if args.output.exists():
                raise FileExistsError("Evidence already exists; use --check or a new versioned output")
            args.output.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(prefix=args.output.name + ".", suffix=".tmp", dir=args.output.parent)
            try:
                with os.fdopen(fd, "wb") as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, args.output)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        print(json.dumps({"status": "MATCH" if args.check else "WRITTEN", "sha256": hashlib.sha256(data).hexdigest(),
                          "output": str(args.output), "summary": result["internalSummary"], "wallSeconds": time.monotonic() - start,
                          **resources}, allow_nan=False))
    finally:
        stop.set()
        thread.join(timeout=1)


if __name__ == "__main__":
    main()
