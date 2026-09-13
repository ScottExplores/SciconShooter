"""Verify each actual-graph timestep, separately from performance measurements."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time

import numpy as np
from scicon_fly.lif_fast import FastLIFModel
from scicon_fly.model import LIFModel, SparseGraph, file_hash


def main():
    started = time.perf_counter()
    root = Path(__file__).resolve().parents[2]
    graph = SparseGraph.load(root / "data/compiled/v1.0/graph.npz", root / "data/compiled/v1.0/manifest.json")
    reference, candidate = LIFModel(graph), FastLIFModel(graph)
    selected = np.flatnonzero(graph.annotations["neuron_types"] == "L1")[:16]
    cases = []
    for name in ["silent", "first16_L1_20mV"]:
        reference.reset(); candidate.reset()
        drive = np.zeros(graph.n)
        if name != "silent":
            drive[selected] = 20
        histories = [hashlib.sha256(), hashlib.sha256()]
        for tick in range(200):
            if time.perf_counter() - started > 180:
                raise TimeoutError("Trajectory check exceeded three-minute budget")
            spikes = [reference.advance(drive), candidate.advance(drive)]
            assert spikes[0].tobytes() == spikes[1].tobytes(), (name, tick, "spike bins")
            for field in ["v", "g", "last_spike", "queue"]:
                arrays = [getattr(reference, field), getattr(candidate, field)]
                assert arrays[0].tobytes() == arrays[1].tobytes(), (name, tick, field)
                for h, value in zip(histories, arrays):
                    h.update(field.encode()); h.update(memoryview(value).cast("B"))
            for h, value in zip(histories, spikes):
                h.update(b"spikes"); h.update(memoryview(value).cast("B"))
            assert reference.clock == candidate.clock and reference.total_spikes == candidate.total_spikes
        assert reference.efficacy.tobytes() == candidate.efficacy.tobytes()
        assert reference.baseline.tobytes() == candidate.baseline.tobytes()
        hashes = [h.hexdigest() for h in histories]
        assert hashes[0] == hashes[1]
        cases.append({"condition": name, "steps": 200, "dtMs": .1, "totalSpikes": reference.total_spikes,
                      "allDynamicStateBytesAndSpikeBinsEqualEveryTick": True,
                      "efficacyAndBaselineBytesEqual": True, "referenceTrajectorySha256": hashes[0],
                      "candidateTrajectorySha256": hashes[1]})
        print(json.dumps(cases[-1]), flush=True)
    report = {"version": 1, "scope": "ACTUAL_GRAPH_NUMERICAL_TRAJECTORY_NOT_BIOLOGICAL_VALIDATION",
              "utc": datetime.now(timezone.utc).isoformat(), "neurons": graph.n, "edges": graph.e,
              "graphIdentity": graph.identity, "nominatedNeuronIds": [str(x) for x in graph.ids[selected]],
              "sourceFiles": {str(p.relative_to(root)): file_hash(p) for p in
                              [Path(__file__), root / "python/scicon_fly/model.py", root / "python/scicon_fly/lif_fast.py"]},
              "cases": cases, "totalWallSeconds": time.perf_counter() - started,
              "defaultBackendChanged": False, "trainingAllowed": False}
    with (root / "docs/evidence/lif-fast-benchmark-trajectory.json").open("x", encoding="utf8") as stream:
        json.dump(report, stream, indent=2, allow_nan=False); stream.write("\n")


if __name__ == "__main__":
    main()
