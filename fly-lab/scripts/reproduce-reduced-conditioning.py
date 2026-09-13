"""Verify and recompute the packaged reduced assay without the full dataset.

Only NumPy is required. Hash checks establish identity to the included frozen
artifact, not an external digital signature. Full-source re-extraction remains
the separate run-reduced-conditioning.py procedure.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys

for key in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ[key] = "2"

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--evidence", type=Path, default=ROOT / "evidence/reduced-conditioning-v1")
parser.add_argument("--all", action="store_true", help="Repeat all 96 executions instead of the first seed's six conditions")
args = parser.parse_args()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


evidence = args.evidence.resolve()
for name, expected in json.loads((evidence / "checksums.json").read_text()).items():
    if Path(name).name != name or sha(evidence / name) != expected:
        raise SystemExit(f"Artifact checksum mismatch: {name}")
frozen = json.loads((evidence / "frozen-protocol.json").read_text())
for name, expected in frozen["sourceHashes"].items():
    parts = name.replace("\\", "/").split("/")
    if ".." in parts or sha(ROOT.joinpath(*parts)) != expected:
        raise SystemExit(f"Frozen source mismatch: {name}")

module_path = ROOT / "python/scicon_fly/reduced_conditioning.py"
spec = importlib.util.spec_from_file_location("frozen_reduced_conditioning", module_path)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
circuit = json.loads((evidence / "circuit.json").read_text())
if hashlib.sha256(model.canonical(circuit).encode()).hexdigest() != frozen["circuitHash"]:
    raise SystemExit("Circuit does not match prespecified hash")
published = json.loads((evidence / "public-experiment.json").read_text())
if published["protocol"] != frozen["protocol"] or published["frozenProtocolSha256"] != sha(evidence / "frozen-protocol.json"):
    raise SystemExit("Published and frozen protocol differ")
reference_checkpoints = json.loads((evidence / "checkpoints.json").read_text())


def compare(actual, expected, label):
    """Exact equality is reported; tight numeric tolerance permits platforms."""
    import math
    if isinstance(expected, dict):
        if set(actual) != set(expected):
            raise AssertionError(f"Keys differ: {label}")
        return all([compare(actual[k], v, label+"."+k) for k, v in expected.items()])
    if isinstance(expected, list):
        if len(actual) != len(expected):
            raise AssertionError(f"Length differs: {label}")
        return all([compare(x, y, label) for x, y in zip(actual, expected)])
    if isinstance(expected, float):
        if not math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-12):
            raise AssertionError(f"Numerical mismatch: {label}: {actual} vs {expected}")
        return actual == expected
    if actual != expected:
        raise AssertionError(f"Value mismatch: {label}")
    return True


count = 0
exact = True
for expected in published["replicas"]:
    if not args.all and (expected["seed"] != frozen["protocol"]["seeds"][0] or expected["reinforcedCue"] != "A"):
        continue
    record = expected["seed"] == published["replay"]["seed"] and expected["reinforcedCue"] == "A" and expected["condition"] == "paired"
    result, checkpoint, replay = model.run_replica(circuit, frozen["protocol"], expected["condition"], expected["seed"], expected["reinforcedCue"], replay=record)
    exact = compare(result, expected, "result") and exact
    saved = next(c for c in reference_checkpoints if all(c[k] == expected[k] for k in ("condition", "seed", "reinforcedCue")))
    exact = compare(checkpoint, saved["state"], "checkpoint") and exact
    if record:
        exact = compare(replay, published["replay"], "replay") and exact
    count += 1
print(json.dumps({"status": "PASS", "executionsReproduced": count, "exactNumericalEquality": exact,
                  "tolerance": {"relative": 1e-10, "absolute": 1e-12}, "fullDatasetNeeded": False,
                  "interpretation": "Recomputed frozen model results; not independent biological validation."}, indent=2))
