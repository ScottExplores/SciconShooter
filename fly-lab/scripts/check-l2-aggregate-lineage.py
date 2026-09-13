"""Frozen source-aggregation comparison only; no fitting or biological gate.

First run --freeze, then --run using the isolated vision-reference environment.
Freeze reads file bytes for hashing but does not parse response arrays. The
supervised worker then opens sources read-only and compares the unmodified
selected-ROI means with both author aggregates. Only descriptors are exported.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import subprocess
import sys
import time


LAB = Path(__file__).resolve().parents[1]
PROTOCOL = LAB / "configs/candidates/l2-aggregate-lineage-v1.json"
FREEZE = LAB / "docs/evidence/l2-aggregate-lineage-v1-freeze.json"
OUTPUT = LAB / "docs/evidence/l2-aggregate-lineage-v1.json"
EXPORTER = LAB / "data/raw/vision-physiology/pang-2025/imaging-analysis__HHY_stimulusSpecificAnalysisScripts__shortFlashProcessed_saveMean.m"
EXPORTER_SHA = "e5c9daf537b4a3f20c7708e3b1c6ccac66b37f3e1cba943a1ffa4c6c6c447cb7"
THREAD_VARIABLES = ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS",
                    "NUMEXPR_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "BLIS_NUM_THREADS")


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def local_path(relative):
    path = (LAB / relative).resolve()
    if not path.is_relative_to(LAB):
        raise ValueError("Protocol source path escapes laboratory root")
    return path


def read_protocol():
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    if (protocol["id"] != "l2-aggregate-lineage-v1" or protocol["fitting_allowed"]
            or protocol["gates_may_change"] or protocol["polarity_order"] != ["dark", "light"]
            or protocol["expected_matlab_roi_rows"] != 214
            or protocol["expected_source_selected_rows"] != 103
            or protocol["expected_samples_per_polarity"] != 63
            or [x["label"] for x in protocol["comparisons"]] != ["author_highLum", "author_lowLum"]):
        raise ValueError("Protocol scope or dimensions differ from this versioned runner")
    resources = protocol["resources"]
    if resources != {"numerical_threads": 2,
                     "maximum_sampled_owned_process_tree_rss_bytes": 4294967296,
                     "maximum_wall_seconds": 2700}:
        raise ValueError("Unexpected resource policy")
    for key in ("maximum_absolute_response_difference_for_match",
                "maximum_absolute_time_difference_seconds_for_match"):
        if protocol[key] != 1e-12:
            raise ValueError("This runner requires the original 1e-12 comparison tolerances")
    return protocol


def source_identities(protocol):
    records = []
    for source in [protocol["source_mat"], *protocol["comparisons"]]:
        path = local_path(source["path"])
        actual = digest(path)
        if actual != source["sha256"]:
            raise ValueError(f"Source hash mismatch: {source['path']}")
        records.append({"path": source["path"], "bytes": path.stat().st_size, "sha256": actual})
    if digest(EXPORTER) != EXPORTER_SHA:
        raise ValueError("Pinned static MATLAB exporter reference changed")
    records.append({"path": EXPORTER.relative_to(LAB).as_posix(),
                    "bytes": EXPORTER.stat().st_size, "sha256": EXPORTER_SHA,
                    "role": "static mathematical aggregation reference; never executed"})
    return records


def write_new(path, result):
    path = Path(path)
    if path.exists():
        raise FileExistsError(f"Preserve existing artifact: {path.name}")
    temporary = path.with_name(path.name + ".writing")
    with temporary.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    temporary.rename(path)


def freeze():
    if OUTPUT.exists():
        raise FileExistsError("A comparison result already exists; do not retroactively freeze")
    protocol = read_protocol()
    record = {"schema_version": 1, "status": "FROZEN_BEFORE_FIRST_RESPONSE_COMPARISON",
              "created_utc": now(), "protocol_path": PROTOCOL.relative_to(LAB).as_posix(),
              "protocol_sha256": digest(PROTOCOL),
              "runner_path": Path(__file__).resolve().relative_to(LAB).as_posix(),
              "runner_sha256": digest(__file__), "source_identities": source_identities(protocol),
              "comparison_protocol": protocol,
              "method": "Only file-byte hashing and protocol parsing have occurred in this freeze command. No response arrays loaded, averaged, transformed or compared.",
              "algorithm_details": [
                  "Read original one-based iResp in stored order; require 103 unique valid rows among214.",
                  "Dereference experimental column2 only; HDF5 struct axes are[2,214], each t/rats cell[2,1], each vector[63,1].",
                  "Require all selected time vectors exactly equal to the first selected dark vector, and strictly increasing. No alignment correction is permitted.",
                  "Use NumPy float64 arithmetic mean across selected ROI axis in original order independently for dark/light; do not use SEM or trial-count weighting.",
                  "Compare both unchanged MAT meanResp[2,63] and t[1,63] with fixed absolute1e-12 tolerances; all difference metrics are absolute, no relative tolerance.",
                  "A mismatch is a completed provenance result; invalid sources or resource interruption are recorded distinctly.",
              ], "runtime_versions": {name: version(name) for name in ("numpy", "scipy", "h5py", "psutil")}}
    write_new(FREEZE, record)
    print(json.dumps({"freeze": str(FREEZE), "freeze_sha256": digest(FREEZE),
                      "runner_sha256": record["runner_sha256"], "responses_compared": False}))


def verify_freeze():
    record = json.loads(FREEZE.read_text(encoding="utf-8"))
    protocol = read_protocol()
    if (record["status"] != "FROZEN_BEFORE_FIRST_RESPONSE_COMPARISON"
            or record["protocol_sha256"] != digest(PROTOCOL)
            or record["runner_sha256"] != digest(__file__)
            or record["comparison_protocol"] != protocol
            or record["source_identities"] != source_identities(protocol)):
        raise ValueError("Frozen protocol, runner or source identity changed; do not run")
    return protocol, record


def compare():
    protocol, frozen = verify_freeze()
    import h5py
    import numpy as np
    from scipy.io import loadmat

    comparison_started = now()
    n, samples = protocol["expected_source_selected_rows"], protocol["expected_samples_per_polarity"]
    with h5py.File(local_path(protocol["source_mat"]["path"]), "r") as handle:
        data = handle["roiDataMat"]
        if data["rats"].shape != (2, 214) or data["t"].shape != (2, 214):
            raise ValueError("Unexpected HDF5 ROI struct axes")
        selected_node = handle["iResp"]
        if selected_node.dtype.kind not in "fiu" or selected_node.size != n:
            raise ValueError("Unexpected iResp type or count")
        selected_raw = np.asarray(selected_node[()]).reshape(-1)
        if (not np.isfinite(selected_raw).all() or not np.all(selected_raw == np.floor(selected_raw))
                or np.unique(selected_raw).size != n or np.any(selected_raw < 1)
                or np.any(selected_raw > 214)):
            raise ValueError("Invalid selected one-based ROI rows")
        selected = selected_raw.astype(np.int64)
        responses = np.empty((n, 2, samples), dtype=np.float64)
        first_time = None
        for selected_index, matlab_row in enumerate(selected):
            row = int(matlab_row) - 1
            for field in ("t", "rats"):
                cell = handle[data[field][1, row]]
                if cell.shape != (2, 1) or h5py.check_dtype(ref=cell.dtype) is None:
                    raise ValueError(f"Unexpected {field} polarity-cell layout at selected row")
                for polarity, reference in enumerate(cell[()].reshape(-1)):
                    node = handle[reference]
                    if (node.shape != (samples, 1) or node.dtype.kind not in "fiu"
                            or bool(node.attrs.get("MATLAB_empty", False))):
                        raise ValueError(f"Invalid {field} vector shape/type at selected row")
                    values = np.array(node[()], dtype=np.float64).reshape(-1)
                    if not np.isfinite(values).all():
                        raise ValueError(f"Nonfinite {field} values in source-selected response")
                    if field == "t":
                        if not np.all(np.diff(values) > 0):
                            raise ValueError("Source time vector is not strictly increasing")
                        if first_time is None:
                            first_time = values.copy()
                        elif not np.array_equal(values, first_time):
                            raise ValueError("Selected time grids differ; no alignment changes allowed")
                    else:
                        responses[selected_index, polarity] = values
        mean_response = np.mean(responses, axis=0, dtype=np.float64)
        if not np.isfinite(mean_response).all():
            raise ValueError("Nonfinite source-selected aggregate")

    comparisons = []
    for target in protocol["comparisons"]:
        loaded = loadmat(local_path(target["path"]))
        if set(name for name in loaded if not name.startswith("__")) != {"meanResp", "t"}:
            raise ValueError("Unexpected author aggregate variables")
        response, target_time = loaded["meanResp"], loaded["t"]
        if (response.shape != (2, samples) or target_time.shape != (1, samples)
                or response.dtype.kind != "f" or target_time.dtype.kind != "f"
                or not np.isfinite(response).all() or not np.isfinite(target_time).all()):
            raise ValueError("Invalid author aggregate shape, type or finite values")
        response_difference = np.abs(mean_response-response)
        time_difference = np.abs(first_time-target_time.reshape(-1))
        max_response, max_time = float(response_difference.max()), float(time_difference.max())
        response_matches = max_response <= protocol["maximum_absolute_response_difference_for_match"]
        time_matches = max_time <= protocol["maximum_absolute_time_difference_seconds_for_match"]
        comparisons.append({"label": target["label"], "target_path": target["path"],
                            "status": "MATCH" if response_matches and time_matches else "MISMATCH",
                            "response_shape": list(response.shape), "time_shape": list(target_time.shape),
                            "all_values_finite": True, "response_matches": response_matches,
                            "time_matches": time_matches,
                            "maximum_absolute_response_difference": max_response,
                            "mean_absolute_response_difference": float(response_difference.mean()),
                            "response_differences_by_polarity": [
                                {"polarity": label, "maximum_absolute_difference": float(response_difference[i].max()),
                                 "mean_absolute_difference": float(response_difference[i].mean())}
                                for i, label in enumerate(protocol["polarity_order"])],
                            "maximum_absolute_time_difference_seconds": max_time,
                            "mean_absolute_time_difference_seconds": float(time_difference.mean())})
    if source_identities(protocol) != frozen["source_identities"]:
        raise ValueError("Source identity changed during comparison")
    if digest(PROTOCOL) != frozen["protocol_sha256"] or digest(__file__) != frozen["runner_sha256"]:
        raise ValueError("Protocol or runner changed during comparison")
    return {"schema_version": 1, "status": "SOURCE_AGGREGATE_COMPARISON_COMPLETE",
            "comparison_started_utc": comparison_started, "comparison_completed_utc": now(),
            "freeze_path": FREEZE.relative_to(LAB).as_posix(), "freeze_sha256": digest(FREEZE),
            "protocol_sha256": frozen["protocol_sha256"], "runner_sha256": frozen["runner_sha256"],
            "source_identities": frozen["source_identities"], "source_hashes_verified_before_and_after": True,
            "roi_rows_all": 214, "roi_rows_selected": n, "selected_rows_unique": True,
            "selected_order_int64_little_endian_sha256": hashlib.sha256(selected.astype("<i8").tobytes()).hexdigest(),
            "source_response_shape": list(responses.shape), "source_response_elements_read": int(responses.size),
            "source_response_elements_finite": int(np.isfinite(responses).sum()),
            "source_time_vectors_read": n*2, "source_time_grids_exactly_equal": True,
            "aggregate_shape": list(mean_response.shape), "polarity_order": protocol["polarity_order"],
            "comparisons": comparisons,
            "fixed_tolerances": {"maximum_absolute_response_difference": 1e-12,
                                 "maximum_absolute_time_difference_seconds": 1e-12},
            "transformations_applied": [], "fitting_performed": False, "gates_changed": False,
            "response_values_exported": False, "data_exposure": protocol["data_exposure"],
            "limitations": protocol["limitations"],
            "runtime": {"python": sys.version.split()[0], "numpy": np.__version__,
                        "h5py": h5py.__version__, "scipy": version("scipy")}}


def worker(output):
    try:
        result = compare()
    except Exception as exc:
        result = {"schema_version": 1, "status": "INVALID_SOURCE_COMPARISON",
                  "failed_utc": now(), "error_type": type(exc).__name__, "error": str(exc)[:1000],
                  "data_exposure": "An interrupted source-validation attempt may have read selected and aggregate responses; no fitting or holdout evaluation was performed.",
                  "response_values_exported": False, "fitting_performed": False, "gates_changed": False}
    write_new(output, result)


def supervise(output):
    protocol, _ = verify_freeze()
    output = output.resolve()
    pending = output.with_name(output.stem + ".pending.json")
    for path in (output, pending):
        if path.exists() or path.with_name(path.name + ".writing").exists():
            raise FileExistsError("Preserve existing result or pending attempt; choose a fresh output")
    import psutil
    env = os.environ.copy()
    for key in THREAD_VARIABLES:
        env[key] = "2"
    command = [sys.executable, str(Path(__file__).resolve()), "--worker", "--output", str(pending)]
    start = time.monotonic()
    process = subprocess.Popen(command, env=env)
    observed = psutil.Process(process.pid)
    peak, polls, pids, failure = 0, 0, set(), None
    while process.poll() is None:
        owned = []
        try:
            owned = [observed, *observed.children(recursive=True)]
            rss = 0
            for member in owned:
                try:
                    rss += member.memory_info().rss
                    pids.add(member.pid)
                except psutil.NoSuchProcess:
                    continue
            peak, polls = max(peak, rss), polls+1
            if rss > protocol["resources"]["maximum_sampled_owned_process_tree_rss_bytes"]:
                failure = "Sampled owned-process-tree RSS exceeded 4 GiB"
            if time.monotonic()-start > protocol["resources"]["maximum_wall_seconds"]:
                failure = "Comparison exceeded 45 minutes"
        except psutil.NoSuchProcess:
            pass
        if failure:
            for member in reversed(owned):
                try:
                    member.kill()
                except psutil.NoSuchProcess:
                    pass
            break
        time.sleep(.05)
    exit_code = process.wait()
    if failure or exit_code or not pending.exists():
        result = {"schema_version": 1, "status": "INTERRUPTED_SOURCE_COMPARISON",
                  "error": failure or f"Worker exited {exit_code} without a complete result",
                  "completed_utc": now(), "pending_evidence_preserved": pending.exists(),
                  "data_exposure": "Response arrays may have been read in this interrupted source-validation attempt; no fitting or holdout evaluation was authorized.",
                  "response_values_exported": False, "fitting_performed": False, "gates_changed": False}
    else:
        result = json.loads(pending.read_text(encoding="utf-8"))
    result["resource_audit"] = {"thread_environment_limits": {key: 2 for key in THREAD_VARIABLES},
                                "sampled_owned_process_tree_peak_rss_bytes": peak,
                                "sampled_process_count": len(pids), "sample_count": polls,
                                "sample_interval_seconds": .05, "wall_seconds": time.monotonic()-start,
                                "worker_exit_code": exit_code, "guard_failure": failure,
                                "memory_limit_bytes": 4294967296, "time_limit_seconds": 2700,
                                "scope": "Spawned Python launcher and recursively discovered child processes; only this owned tree is killed on a guard failure.",
                                "limitation": "Sampled RSS threshold, not an OS allocation limit; transient unsampled peaks remain possible."}
    write_new(output, result)
    # Keep the pre-resource worker record in the ignored runtime tree instead of
    # silently deleting an intermediate scientific attempt.
    if pending.exists():
        archive = LAB / "runtime/vision-reference/results"
        archive.mkdir(parents=True, exist_ok=True)
        archived = archive / (output.stem + ".worker-" + str(time.time_ns()) + ".json")
        pending.rename(archived)
    print(json.dumps({"output": str(output), "status": result["status"],
                      "comparisons": result.get("comparisons", []), "resources": result["resource_audit"]}))
    if result["status"] != "SOURCE_AGGREGATE_COMPARISON_COMPLETE":
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--freeze", action="store_true")
    action.add_argument("--run", action="store_true")
    action.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    if args.freeze:
        freeze()
    elif args.worker:
        worker(args.output)
    else:
        supervise(args.output)


if __name__ == "__main__":
    main()
