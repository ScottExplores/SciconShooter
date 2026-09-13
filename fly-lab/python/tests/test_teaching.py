"""Integrity and causal controls for the explicitly synthetic teaching task."""
import json

import numpy as np
import pytest

from scicon_fly import teaching


@pytest.fixture(scope="module")
def result():
    return teaching.run_experiment(42, "A")


def test_reproducible_results_include_both_counterbalances(result):
    assert teaching.run_experiment(42, "A") == result
    assert result["classification"] == "SYNTHETIC_TEACHING_EXPERIMENT"
    assert result["criteria"]["pass"]
    assert set(result["counterbalance"]) == {"A", "B"}
    for cue, report in result["counterbalance"].items():
        paired, unpaired, frozen = report["conditions"]
        other = "B" if cue == "A" else "A"
        assert report["pass"]
        assert paired["post"][cue] < paired["pre"][cue]
        assert paired["post"][other] == paired["pre"][other]
        assert unpaired["post"] == unpaired["pre"]
        assert frozen["post"] == frozen["pre"]


def test_selected_counterbalance_changes_only_recorded_presentation(result):
    swapped = teaching.run_experiment(42, "B")
    assert swapped["counterbalance"] == result["counterbalance"]
    assert swapped["conditions"][0]["post"] == swapped["counterbalance"]["B"]["conditions"][0]["post"]
    assert swapped["conditions"][0]["post"]["B"] < swapped["conditions"][0]["pre"]["B"]
    assert all(row["frames"] for row in swapped["conditions"])


def test_saved_numerical_frames_are_the_reported_measurements(result):
    for condition in result["conditions"]:
        frames = condition["frames"]
        assert [frame["timeSeconds"] for frame in frames] == [round((i + 1) * .01, 8) for i in range(len(frames))]
        for frame in frames:
            assert len(frame["spikes"]) == 4 and len(frame["efficacy"]) == 2
            assert all(type(value) is int and value >= 0 for value in frame["spikes"])
            assert all(np.isfinite(frame["efficacy"]))
            assert frame["binSeconds"] == .01
            assert frame["driveMv"][2] == 0  # Never prescribe the output.
        for prefix in ("pre", "post"):
            for cue in ("A", "B"):
                probe = [f for f in frames if f["phase"] == prefix + "-probe" and f["cue"] == cue]
                assert len(probe) == 30
                assert sum(f["spikes"][2] for f in probe) == condition[prefix][cue]
                assert all(f["plasticityFrozen"] and not f["reward"] and f["spikes"][3] == 0 for f in probe)
        training = [f for f in frames if f["phase"].startswith("training-")]
        np.testing.assert_array_equal(np.sum([f["spikes"] for f in training], axis=0), condition["trainingSpikeCounts"])
        assert all(not (f["cue"] and f["reward"]) for f in training)


def test_actual_lif_and_rule_produce_every_recorded_bin(monkeypatch):
    emitted = []
    original = teaching.LIFModel.advance

    def tracked(self, *args, **kwargs):
        counts = original(self, *args, **kwargs)
        emitted.append(counts.tolist())
        return counts

    monkeypatch.setattr(teaching.LIFModel, "advance", tracked)
    condition, _ = teaching._condition("paired", "A", [["A", "B"]] * 3, record=True)
    assert emitted == [frame["spikes"] for frame in condition["frames"]]
    assert condition["efficacyAfter"][0] < condition["efficacyBefore"][0]
    assert condition["pre"]["A"] > condition["post"]["A"]


def test_disabling_the_update_rule_fails_learning_criteria(monkeypatch):
    monkeypatch.setattr(teaching.CompartmentPlasticity, "advance", lambda *args, **kwargs: None)
    nonlearning = teaching.run_experiment(42, "A")
    assert not nonlearning["criteria"]["pass"]
    assert not next(row for row in nonlearning["criteria"]["results"] if row["id"] == "paired_suppression_A")["pass"]
    for report in nonlearning["counterbalance"].values():
        for condition in report["conditions"]:
            assert condition["pre"] == condition["post"]
            assert condition["efficacyBefore"] == condition["efficacyAfter"] == [1., 1.]


def test_frozen_probes_preserve_nonzero_traces_and_passive_memory():
    _, model, rule = teaching.make_circuit()
    model.efficacy[:] = [.8, 1.1]
    rule.kc_trace[:] = [7., 9.]
    rule.dan_trace[:] = 5.
    rule.u[:] = [-.3, .2]
    rule.w[:] = [-.2, .1]
    memory = teaching._memory(model, rule)
    model.advance([35., 35., 0., 35.], 20)
    recorder = teaching._Recorder(model, rule, True)
    _, check = recorder.probe("test-probe")
    assert check["memoryUnchanged"] and check["rewardSpikes"] == 0
    assert check["memoryBeforeHash"] == check["memoryAfterHash"]
    assert teaching._same_memory(memory, teaching._memory(model, rule))
    assert all(frame["plasticityFrozen"] for frame in recorder.frames)


def test_erasure_sham_and_restore_are_distinct_causal_interventions(result):
    for report in result["counterbalance"].values():
        paired = report["conditions"][0]
        erased, sham, restored = (report[key] for key in ("erased", "sham", "restored"))
        assert erased["probe"] == paired["pre"]
        assert erased["postResetEfficacy"] == [1., 1.]
        assert erased["plasticityStateZero"]
        assert sham["probe"] == restored["probe"] == paired["post"]
        assert sham["memoryPreserved"]
        assert sham["preResetEfficacy"] == sham["postResetEfficacy"] == restored["efficacy"] == paired["efficacyAfter"]


def test_unpaired_and_frozen_controls_have_identical_engineered_input_doses(result):
    assert result["protocol"]["unpairedGapTraceConstants"] >= 10
    for report in result["counterbalance"].values():
        conditions = report["conditions"]
        assert all(row["trainingDriveDoseMvSeconds"] == conditions[0]["trainingDriveDoseMvSeconds"] for row in conditions)
        inputs = [[row["trainingSpikeCounts"][i] for i in (0, 1, 3)] for row in conditions]
        assert inputs[0] == inputs[1] == inputs[2]
        assert all(value > 0 for value in inputs[0])
        assert all(row["evaluationFrozen"] for row in conditions)
        assert conditions[2]["trainingPlasticityFrozen"]


def test_synthetic_provenance_and_raw_graph_are_explicit(result):
    proof = result["sourceProof"]
    assert proof["syntheticGraph"] and proof["graphManifest"]["synthetic"]
    assert all(node["synthetic"] for node in result["nodes"])
    assert all(edge["synthetic"] for edge in result["edges"])
    assert set(proof["moduleSha256"]) == {"teaching.py", "model.py", "plasticity.py"}
    assert all(len(value) == 64 for value in proof["moduleSha256"].values())
    assert proof["dimensions"] == {"neurons": 4, "anatomicalEdges": 2, "plasticEdges": 2, "rewardCouplings": 2}
    assert proof["graphArrays"]["contacts"] == [80., 80.]
    json.dumps(result, allow_nan=False)


@pytest.mark.parametrize("seed,cue", [(-1, "A"), (4294967296, "A"), (True, "A"), (1.0, "A"), ("1", "A"), (None, "A"), (0, "C"), (0, True), (0, ["A"])])
def test_invalid_inputs_rejected_before_simulation(seed, cue):
    with pytest.raises(ValueError):
        teaching.run_experiment(seed, cue)


@pytest.mark.parametrize("seed", [0, 4294967295])
def test_uint32_boundaries_are_valid(seed):
    teaching._validate(seed, "A")
    teaching._validate(seed, "B")


def test_cli_reserves_output_and_refuses_overwrite(tmp_path, monkeypatch, result):
    target = tmp_path / "result.json"
    monkeypatch.setattr(teaching, "run_experiment", lambda seed, cue: result)
    assert teaching.main(["--seed", "42", "--rewarded-cue", "A", "--output", str(target)]) == 0
    assert json.loads(target.read_text(encoding="utf-8")) == result
    prior = target.read_bytes()
    monkeypatch.setattr(teaching, "run_experiment", lambda *args: pytest.fail("Overwrite must be rejected before computation"))
    with pytest.raises(FileExistsError):
        teaching.main(["--seed", "42", "--rewarded-cue", "A", "--output", str(target)])
    assert target.read_bytes() == prior
