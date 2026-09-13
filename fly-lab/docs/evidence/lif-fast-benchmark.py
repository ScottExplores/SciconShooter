"""Bounded optional-backend benchmark. Run from fly-lab with PYTHONPATH=python.

No training, default-backend change, or biological gate update. The actual-graph
stimulus matches assays.full_graph_sanity: first 16 annotated L1 cells, 20 mV,
20 ms. Integration timing excludes initialization, reset, and correctness checks.
"""
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import statistics
import time

import numpy as np
import psutil

from scicon_fly.model import LIFModel, SparseGraph, file_hash
from scicon_fly.lif_fast import FastLIFModel


ROOT = Path(__file__).resolve().parents[2]
START = time.perf_counter()


def check_budget():
    if time.perf_counter() - START > 180:
        raise TimeoutError("Three-minute benchmark budget exhausted")


def state_identity(model):
    result = {}
    for name in ["v", "g", "last_spike", "queue", "efficacy"]:
        value = getattr(model, name)
        result[name] = hashlib.sha256(memoryview(value).cast("B")).hexdigest()
    result.update(clock=model.clock, total_spikes=model.total_spikes)
    return result


def run_case(name, graph, drive, models):
    steps = 200
    # Both backends warm up on this exact condition, outside measured time.
    for model in models.values():
        check_budget(); model.reset(); model.advance(drive, steps)
    trials = []
    for repeat in range(3):
        row = {"repeat": repeat + 1, "order": ["reference", "candidate"] if repeat % 2 == 0 else ["candidate", "reference"]}
        states, spikes = {}, {}
        for backend in row["order"]:
            check_budget()
            model = models[backend]
            model.reset()
            started = time.perf_counter()
            counts = model.advance(drive, steps)
            row[backend + "WallSeconds"] = time.perf_counter() - started
            states[backend] = state_identity(model)
            spikes[backend] = counts
        assert states["reference"] == states["candidate"], (name, "complete state mismatch")
        assert np.array_equal(spikes["reference"], spikes["candidate"]), (name, "spike-count mismatch")
        row.update(exactState=True, exactSpikeCounts=True, totalSpikes=int(spikes["reference"].sum()),
                   activeNeurons=int(np.count_nonzero(spikes["reference"])), state=states["candidate"])
        trials.append(row)
    reference = statistics.median(row["referenceWallSeconds"] for row in trials)
    candidate = statistics.median(row["candidateWallSeconds"] for row in trials)
    result = {"name": name, "synthetic": graph.manifest.get("synthetic", False), "graphIdentity": graph.identity,
              "neurons": graph.n, "directedPairs": graph.e, "modeledMs": steps * models["reference"].parameters.dt_ms,
              "driveIds": [str(x) for x in graph.ids[np.flatnonzero(drive)]],
              "driveMv": drive[np.flatnonzero(drive)].tolist(), "trials": trials,
              "referenceMedianSeconds": reference, "candidateMedianSeconds": candidate,
              "medianSpeedup": reference / candidate,
              "candidateWallSecondsPerSimulatedSecond": candidate / .02}
    print(json.dumps({k: result[k] for k in ["name", "referenceMedianSeconds", "candidateMedianSeconds", "medianSpeedup"]}), flush=True)
    return result


def main():
    graph_path = ROOT / "data/compiled/v1.0/graph.npz"
    manifest_path = ROOT / "data/compiled/v1.0/manifest.json"
    started = time.perf_counter()
    graph = SparseGraph.load(graph_path, manifest_path)
    loaded = time.perf_counter() - started
    assert graph.n == 166700 and not graph.manifest.get("synthetic", False)
    selected = np.flatnonzero(graph.annotations["neuron_types"] == "L1")[:16]
    assert len(selected) == 16
    started = time.perf_counter()
    models = {"reference": LIFModel(graph), "candidate": FastLIFModel(graph)}
    initialized = time.perf_counter() - started
    silent = np.zeros(graph.n)
    stimulated = silent.copy(); stimulated[selected] = 20
    results = [run_case("actual_graph_silent", graph, silent, models),
               run_case("actual_graph_first16_L1_20mV", graph, stimulated, models)]
    parameters = asdict(models["reference"].parameters)
    scratch_bytes = sum(getattr(models["candidate"], name).nbytes for name in
                        ["_elapsed", "_free", "_spiking", "_voltage", "_synaptic", "_drive"])
    del models, graph
    n = 256
    rng = np.random.default_rng(991)
    graph = SparseGraph(np.arange(n, dtype=np.uint64) + 1, np.arange(n + 1) * 4,
                        np.array([(cell + offset) % n for cell in range(n) for offset in [1, 2, 3, 7]]),
                        rng.integers(15, 60, n * 4), np.where(np.arange(n) % 5 == 0, -1, 1),
                        {"synthetic": True, "purpose": "ACTIVE_NUMERICAL_FIXTURE_ONLY"})
    drive = np.zeros(n); drive[:32] = 40
    models = {"reference": LIFModel(graph), "candidate": FastLIFModel(graph)}
    results.append(run_case("synthetic_active_256", graph, drive, models))
    assert results[-1]["trials"][0]["totalSpikes"] > 0
    files = [Path(__file__), ROOT / "python/scicon_fly/model.py", ROOT / "python/scicon_fly/lif_fast.py",
             ROOT / "python/tests/test_lif_fast.py", ROOT / "requirements.lock.txt"]
    report = {"version": 1, "scope": "OPTIONAL_BACKEND_NUMERICAL_MICROBENCHMARK_ONLY", "trainingAllowed": False,
              "defaultBackendChanged": False, "utc": datetime.now(timezone.utc).isoformat(),
              "platform": platform.platform(), "processor": platform.processor(), "python": platform.python_version(),
              "numpy": np.__version__, "logicalCpus": psutil.cpu_count(), "parameters": parameters,
              "actualGraphLoadSeconds": loaded, "bothActualModelsInitializeSeconds": initialized,
              "candidateAdditionalScratchBytes": scratch_bytes,
              "graphFileSha256": file_hash(graph_path), "manifestFileSha256": file_hash(manifest_path),
              "sourceFiles": {p.relative_to(ROOT).as_posix(): file_hash(p) for p in files},
              "method": "One same-condition warmup per backend; 3 interleaved trials; 200 timesteps per advance; resets and complete-state SHA256 comparisons outside timing; every checkpoint field and spike-count vector exact.",
              "independentOracle": {"test": "python/tests/test_lif_fast.py::test_brian2_independent_equations_and_exact_spike_bins",
                                    "equations": "Independent Brian2 NeuronGroup and Synapses with exact integrator", "voltageAndConductanceAtolMv": 2e-10, "spikeBins": "exact"},
              "limitations": ["Bounded 20 ms probes, not an end-to-end worker, game, or training benchmark.",
                              "No graph pruning, biological validation, sensory calibration or learned behavior.",
                              "Parent reported concurrent Torch installation/disk writes; background contention may affect ratios.",
                              "Numerical equality is established on the recorded probes and focused tests, not proof over all floating-point states."],
              "cases": results, "totalWallSeconds": time.perf_counter() - START}
    check_budget()
    target = ROOT / "docs/evidence/lif-fast-benchmark.json"
    with target.open("x", encoding="utf8") as stream:
        json.dump(report, stream, indent=2, allow_nan=False)
        stream.write("\n")
    print(str(target), flush=True)


if __name__ == "__main__":
    main()
