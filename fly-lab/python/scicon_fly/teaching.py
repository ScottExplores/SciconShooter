"""A bounded synthetic timing-rule demonstration, never a biological gate.

The four artificial neurons use the existing LIFModel. Engineered current
pulses elicit spikes; those measured counts enter CompartmentPlasticity.
All parameters and success criteria below are fixed before any run. No
parameter search, favorable-seed selection, vision, choice, or game score is
part of this experiment.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path

import numpy as np

from .model import LIFModel, LIFParameters, SparseGraph, canonical_hash, file_hash
from .plasticity import CompartmentPlasticity, PlasticityParameters


SCHEMA_VERSION = 1
CLASSIFICATION = "SYNTHETIC_TEACHING_EXPERIMENT"
BIN_SECONDS = 0.01
PROBE_SECONDS = 0.30
CUE_SECONDS = 0.20
REWARD_SECONDS = 0.10
PAIRED_GAP_SECONDS = 0.05
UNPAIRED_GAP_SECONDS = 1.0
SLOT_SECONDS = 2.5
TRIALS = 3
INPUT_MV = 35.0
NODES = [
    {"id": "1", "label": "Cue A", "role": "synthetic KC-like cue", "synthetic": True},
    {"id": "2", "label": "Cue B", "role": "synthetic KC-like cue", "synthetic": True},
    {"id": "3", "label": "Readout", "role": "synthetic MBON-like readout", "synthetic": True},
    {"id": "4", "label": "Reward", "role": "synthetic DAN-like reward", "synthetic": True},
]
LIF_PARAMETERS = LIFParameters(dt_ms=1.0, delay_ms=2.0, refractory_ms=2.0)
PLASTICITY_PARAMETERS = PlasticityParameters(
    kc_trace_seconds=0.1, dan_trace_seconds=0.1, eta=0.00015,
)


def _validate(seed, rewarded_cue):
    if type(seed) is not int or not 0 <= seed <= 4294967295:
        raise ValueError("Seed must be a whole number in [0,4294967295]")
    if type(rewarded_cue) is not str or rewarded_cue not in ("A", "B"):
        raise ValueError("Rewarded cue must be A or B")


def make_circuit():
    """Two identical excitatory cue edges; reward coupling is synthetic."""
    graph = SparseGraph(
        [1, 2, 3, 4], [0, 1, 2, 2, 2], [2, 2], [80, 80], [1, 1, 0, 0],
        {"synthetic": True, "source": CLASSIFICATION,
         "purpose": "Artificial four-neuron numerical teaching circuit; no connectome mapping"},
        {"neuron_types": ["SYNTHETIC_KC_A", "SYNTHETIC_KC_B", "SYNTHETIC_MBON", "SYNTHETIC_DAN"]},
    )
    manifest = {
        "graphHash": graph.identity, "synthetic": True,
        "edges": [
            {"kcId": str(cue), "mbonId": "3", "compartment": "SYNTHETIC_TEACHING",
             "evidence": ["ENGINEERED_SYNTHETIC_ASSIGNMENT_ONLY"],
             "dan": [{"id": "4", "gain": 1.0}]}
            for cue in (1, 2)
        ],
        "parameters": asdict(PLASTICITY_PARAMETERS),
    }
    return graph, LIFModel(graph, LIF_PARAMETERS), CompartmentPlasticity(graph, manifest)


def _memory(model, rule):
    return {"efficacy": model.efficacy.copy(), **rule.state_dict()}


def _same_memory(left, right):
    return all(np.array_equal(left[key], right[key]) for key in left)


def _memory_hash(value):
    return canonical_hash({key: values.tolist() for key, values in value.items()})


class _Recorder:
    def __init__(self, model, rule, record):
        self.model, self.rule = model, rule
        self.record = record
        self.frames = []
        self.bins = 0

    def advance(self, drive, phase, cue=None, *, frozen=False):
        counts = self.model.advance(drive, round(BIN_SECONDS * 1000 / LIF_PARAMETERS.dt_ms))
        # Counts come exclusively from threshold crossings in LIFModel.
        self.rule.advance(counts, BIN_SECONDS, self.model.efficacy, frozen=frozen)
        self.bins += 1
        if self.record:
            self.frames.append({
                "timeSeconds": round(self.bins * BIN_SECONDS, 8), "binSeconds": BIN_SECONDS,
                "phase": phase, "cue": cue, "reward": bool(drive[3]),
                "spikes": counts.tolist(), "efficacy": self.model.efficacy.tolist(),
                "driveMv": list(drive), "plasticityFrozen": frozen,
            })
        return counts

    def probe(self, phase):
        before = _memory(self.model, self.rule)
        result = {}
        reward_spikes = 0
        for cue_index, cue in enumerate(("A", "B")):
            # Remove voltage, synaptic current, delayed spikes, refractory
            # state and clock; external efficacy and plasticity are preserved.
            self.model.reset(keep_weights=True)
            drive = [0.0] * 4
            drive[cue_index] = INPUT_MV
            total = np.zeros(4, dtype=np.int64)
            for _ in range(round(PROBE_SECONDS / BIN_SECONDS)):
                total += self.advance(drive, phase, cue, frozen=True)
            result[cue] = int(total[2])
            reward_spikes += int(total[3])
        after = _memory(self.model, self.rule)
        return result, {
            "frozen": True, "memoryUnchanged": _same_memory(before, after),
            "memoryBeforeHash": _memory_hash(before), "memoryAfterHash": _memory_hash(after),
            "efficacyBefore": before["efficacy"].tolist(),
            "efficacyAfter": after["efficacy"].tolist(), "rewardSpikes": reward_spikes,
        }


def _condition(condition, rewarded_cue, trial_order, *, record):
    _, model, rule = make_circuit()
    recorder = _Recorder(model, rule, record)
    pre, pre_check = recorder.probe("pre-probe")
    model.reset(keep_weights=True)
    before = model.efficacy.tolist()
    train_spikes = np.zeros(4, dtype=np.int64)
    dose = np.zeros(4, dtype=np.float64)
    frozen = condition == "frozen"
    reward_start = round((CUE_SECONDS + (UNPAIRED_GAP_SECONDS if condition == "unpaired" else PAIRED_GAP_SECONDS)) / BIN_SECONDS)
    for order in trial_order:
        for cue in order:
            index = ("A", "B").index(cue)
            for tick in range(round(SLOT_SECONDS / BIN_SECONDS)):
                drive = [0.0] * 4
                active_cue = cue if tick < round(CUE_SECONDS / BIN_SECONDS) else None
                if active_cue:
                    drive[index] = INPUT_MV
                reward = cue == rewarded_cue and reward_start <= tick < reward_start + round(REWARD_SECONDS / BIN_SECONDS)
                if reward:
                    drive[3] = INPUT_MV
                phase = "training-cue" if active_cue else "training-reward" if reward else "training-rest"
                train_spikes += recorder.advance(drive, phase, active_cue, frozen=frozen)
                dose += np.asarray(drive) * BIN_SECONDS
    after = model.efficacy.tolist()
    trained_model, trained_rule = model.state_dict(), rule.state_dict()
    post, post_check = recorder.probe("post-probe")
    evaluation_checks = {"pre": pre_check, "post": post_check}
    interventions = {}
    if condition == "paired":
        sham_before = _memory(model, rule)
        model.reset(keep_weights=True)
        sham_reset = _memory(model, rule)
        sham_probe, sham_check = recorder.probe("sham-probe")
        interventions["sham"] = {
            "preResetEfficacy": sham_before["efficacy"].tolist(),
            "postResetEfficacy": sham_reset["efficacy"].tolist(),
            "memoryPreserved": _same_memory(sham_before, sham_reset), "probe": sham_probe,
        }
        erased_before = model.efficacy.tolist()
        rule.reset()
        model.reset()  # Reset external efficacy too: rule.reset alone is insufficient.
        erased_after = model.efficacy.tolist()
        erased_probe, erased_check = recorder.probe("erased-probe")
        interventions["erased"] = {
            "preResetEfficacy": erased_before, "postResetEfficacy": erased_after,
            "plasticityStateZero": all(not np.any(v) for v in rule.state_dict().values()),
            "probe": erased_probe,
        }
        model.restore(trained_model)
        rule.restore(trained_rule)
        restored_probe, restored_check = recorder.probe("restored-probe")
        interventions["restored"] = {
            "efficacy": model.efficacy.tolist(), "probe": restored_probe,
            "method": "Restore the saved trained neural and plasticity arrays, then reset transients for frozen probes",
        }
        evaluation_checks.update(sham=sham_check, erased=erased_check, restored=restored_check)
    return {
        "id": condition, "label": {"paired": "Cue before reward", "unpaired": "Temporally unpaired", "frozen": "Plasticity frozen"}[condition],
        "pre": pre, "post": post, "frames": recorder.frames,
        "efficacyBefore": before, "efficacyAfter": after,
        "evaluationFrozen": all(v["memoryUnchanged"] and v["rewardSpikes"] == 0 for v in evaluation_checks.values()),
        "evaluationEfficacyBeforeAfter": evaluation_checks,
        "trainingPlasticityFrozen": frozen, "trainingSpikeCounts": train_spikes.tolist(),
        "trainingDriveDoseMvSeconds": dose.tolist(),
    }, interventions


def _criteria(rewarded_cue, conditions, interventions):
    paired, unpaired, frozen = conditions
    other = "B" if rewarded_cue == "A" else "A"
    before, after = paired["pre"][rewarded_cue], paired["post"][rewarded_cue]
    suppression = before - after
    unpaired_change = max(abs(unpaired["pre"][cue] - unpaired["post"][cue]) for cue in ("A", "B"))
    rows = []

    def add(name, passed, observed, expected):
        rows.append({"id": f"{name}_{rewarded_cue}", "pass": bool(passed), "observed": observed, "expected": expected})

    add("paired_suppression", before > 0 and suppression >= 1 and suppression / before >= 0.2,
        {"pre": before, "post": after, "suppressionSpikes": suppression}, ">=1 spike and >=20% lower rewarded-cue readout")
    add("cue_specificity", paired["pre"][other] == paired["post"][other],
        {"pre": paired["pre"][other], "post": paired["post"][other]}, "Other cue readout unchanged")
    add("unpaired_control", unpaired_change <= 1 and suppression > unpaired_change and max(abs(v - 1) for v in unpaired["efficacyAfter"]) < 0.01,
        {"maxAbsoluteSpikeChange": unpaired_change, "efficacyAfter": unpaired["efficacyAfter"]}, "<=1 spike change; <0.01 efficacy drift; smaller than paired suppression")
    add("frozen_control", frozen["pre"] == frozen["post"] and frozen["efficacyBefore"] == frozen["efficacyAfter"] == [1.0, 1.0] and frozen["trainingSpikeCounts"][3] > 0,
        {"pre": frozen["pre"], "post": frozen["post"], "efficacyAfter": frozen["efficacyAfter"], "rewardSpikes": frozen["trainingSpikeCounts"][3]}, "Reward delivered, no readout or efficacy change")
    input_counts = [[row["trainingSpikeCounts"][i] for i in (0, 1, 3)] for row in conditions]
    add("matched_dose", all(row["trainingDriveDoseMvSeconds"] == paired["trainingDriveDoseMvSeconds"] for row in conditions) and input_counts[0] == input_counts[1] == input_counts[2],
        {"driveDoseMvSeconds": [row["trainingDriveDoseMvSeconds"] for row in conditions], "cueA_cueB_rewardSpikes": input_counts}, "Identical cue and reward current doses and elicited input spike totals")
    add("frozen_evaluation", all(row["evaluationFrozen"] for row in conditions),
        [row["evaluationFrozen"] for row in conditions], "All probes preserve efficacy, traces, u and w; zero reward spikes")
    erased, sham, restored = (interventions[key] for key in ("erased", "sham", "restored"))
    add("erasure", erased["probe"] == paired["pre"] and erased["postResetEfficacy"] == [1.0, 1.0] and erased["plasticityStateZero"], erased,
        "Reset rule state AND external efficacy restores pretraining readout")
    add("sham", sham["memoryPreserved"] and sham["probe"] == paired["post"], sham,
        "Resetting transients preserves trained efficacy and readout")
    add("restoration", restored["probe"] == paired["post"] and restored["efficacy"] == paired["efficacyAfter"], restored,
        "Restoring saved trained arrays recovers the trained readout")
    return rows


def run_experiment(seed, rewarded_cue):
    _validate(seed, rewarded_cue)
    rng = np.random.default_rng(seed)
    trial_order = [rng.permutation(["A", "B"]).tolist() for _ in range(TRIALS)]
    experiments = {}
    checks = []
    for cue in ("A", "B"):
        conditions, interventions = [], {}
        for condition in ("paired", "unpaired", "frozen"):
            result, intervention = _condition(condition, cue, trial_order, record=cue == rewarded_cue)
            conditions.append(result)
            interventions.update(intervention)
        cue_checks = _criteria(cue, conditions, interventions)
        checks.extend(cue_checks)
        experiments[cue] = {"conditions": conditions, **interventions, "pass": all(row["pass"] for row in cue_checks)}
    selected = experiments[rewarded_cue]
    graph, _, _ = make_circuit()
    protocol = {
        "synthetic": True, "cueInput": "Engineered 35 mV direct current to the nominated cue neuron; no images or visual transducer",
        "rewardInput": "Engineered 35 mV direct current to the synthetic DAN-like neuron; its spikes are model-generated",
        "pairingOrder": "Cue offset precedes reward onset; no simultaneous cue/reward pulses",
        "pairingRationale": "The existing signed KC-DAN timing rule depresses forward pairing. Identical simultaneous proportional traces would cancel.",
        "cueRewardGapSeconds": PAIRED_GAP_SECONDS, "unpairedCueRewardGapSeconds": UNPAIRED_GAP_SECONDS,
        "unpairedGapTraceConstants": UNPAIRED_GAP_SECONDS / PLASTICITY_PARAMETERS.kc_trace_seconds,
        "cueDurationSeconds": CUE_SECONDS, "rewardDurationSeconds": REWARD_SECONDS,
        "slotDurationSeconds": SLOT_SECONDS, "trials": TRIALS, "trialOrder": trial_order,
        "probeDurationSeconds": PROBE_SECONDS, "frameBinSeconds": BIN_SECONDS,
        "readout": "Actual shared readout spike count in each separate 0.30 s cue probe",
        "probeReset": "Reset voltage, synaptic current, delay queue, refractory state and clock; preserve efficacy and all plasticity state",
        "probeFreeze": "All plasticity frozen, including trace evolution and passive decay; reward input is zero",
        "seedUse": "Seed chooses A/B presentation order only; neuron dynamics are deterministic and identical for both cues",
        "parameters": {"lif": asdict(LIF_PARAMETERS), "plasticity": asdict(PLASTICITY_PARAMETERS), "inputMv": INPUT_MV, "contactsPerCueEdge": 80},
        "parameterSelection": "One declared toy parameterization. No search or parameter adjustment based on run outcomes.",
    }
    counterbalance = {}
    for cue, experiment in experiments.items():
        counterbalance[cue] = {
            "rewardedCue": cue, "pass": experiment["pass"],
            "conditions": [{key: value for key, value in row.items() if key != "frames"} for row in experiment["conditions"]],
            **{key: experiment[key] for key in ("erased", "sham", "restored")},
        }
    return {
        "schemaVersion": SCHEMA_VERSION, "classification": CLASSIFICATION, "seed": seed,
        "rewardedCue": rewarded_cue, "nodes": NODES,
        "edges": [{"source": str(cue), "target": "3", "kind": "plastic excitatory", "synthetic": True, "efficacyIndex": cue - 1} for cue in (1, 2)],
        "rewardCouplings": [{"source": "4", "targetEdgeIndex": edge, "gain": 1.0, "synthetic": True, "kind": "declared modulatory coupling"} for edge in (0, 1)],
        "conditions": selected["conditions"],
        **{key: selected[key] for key in ("erased", "sham", "restored")},
        "counterbalance": counterbalance, "criteria": {"pass": all(row["pass"] for row in checks), "results": checks},
        "protocol": protocol,
        "sourceProof": {
            "models": ["scicon_fly.model.LIFModel", "scicon_fly.plasticity.CompartmentPlasticity"],
            "syntheticGraph": True, "graphHash": graph.identity, "graphManifest": graph.manifest,
            "graphArrays": {key: getattr(graph, key).tolist() for key in ("ids", "indptr", "indices", "contacts", "signs")},
            "dimensions": {"neurons": 4, "anatomicalEdges": 2, "plasticEdges": 2, "rewardCouplings": 2},
            "parameters": protocol["parameters"],
            "moduleSha256": {name: file_hash(Path(__file__).with_name(name)) for name in ("teaching.py", "model.py", "plasticity.py")},
        },
        "limitations": [
            "Entire graph, cell roles, reward coupling and current inputs are engineered synthetic assignments; there is no MaleCNS mapping.",
            "This demonstrates this existing mathematical plasticity rule in one tiny circuit. It does not establish biological fly learning or validate a biological training gate.",
            "No vision, preference, choice, game play, or score is simulated. Reduced readout firing is the only learned output metric.",
            "Two cue counterbalances are deterministic symmetry checks, not independent animals or statistical replication.",
            "Playback shows recorded numerical bins from a completed calculation; it is not live neural streaming. Spikes are counts per 10 ms bin.",
            "Timing, current amplitudes, synaptic contacts and short trace constants were chosen as a teaching parameterization, not fitted to measured physiology.",
        ],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", required=True, type=int)
    parser.add_argument("--rewarded-cue", required=True, choices=("A", "B"))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args(argv)
    _validate(args.seed, args.rewarded_cue)
    # Reserve the exact requested file before computation; never overwrite a
    # prior successful, failed, or interrupted attempt.
    with args.output.open("x", encoding="utf-8") as stream:
        result = run_experiment(args.seed, args.rewarded_cue)
        json.dump(result, stream, allow_nan=False, separators=(",", ":"))
        stream.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
