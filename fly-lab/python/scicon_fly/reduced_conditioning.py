"""Direct-input conditioning on an audited, reduced MaleCNS gamma1pedc circuit.

This is a NEW phenomenological rate model, not the whole-brain LIF model and
not a reproduction of Hige et al. Its predicted depression is explicit in the
rule. Real contact counts determine a feed-forward MBON input; externally
driven KC and DAN rates bypass perception. No behavioral readout exists.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import sys
import time

import numpy as np

LAB_ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    {"title": "MaleCNS v1.0 released connectivity and annotations", "url": "https://male-cns.janelia.org/download/"},
    {"title": "Li et al. 2020: MBON11 and PPL101 compartment crosswalk", "url": "https://elifesciences.org/articles/62576"},
    {"title": "Hige et al. 2015: cue-specific KC to MBON depression after DAN pairing", "url": "https://pubmed.ncbi.nlm.nih.gov/26637800/"},
]


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def write_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(canonical(value) + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def now():
    return datetime.now(timezone.utc).isoformat()


def extract_circuit(config):
    """Keep all right gamma KCs with BOTH required real directed connections.

    DAN-to-KC contacts are eligibility evidence only, not measured receptor
    counts or a physiological dopamine gain. Contact locations are unavailable
    here; same-compartment assignment uses types and published crosswalk.
    """
    import pyarrow.feather as feather
    import pyarrow.compute as pc
    import pyarrow as pa

    folder = LAB_ROOT / "data/compiled" / config["graphRelease"]
    metadata = json.loads((folder / "manifest.json").read_text())
    actual_hash = digest(folder / "graph.npz")
    if metadata.get("synthetic") is not False or actual_hash != metadata["graph_sha256"]:
        raise ValueError("Assay requires the verified real released graph")
    with np.load(folder / "graph.npz", allow_pickle=False) as z:
        ids, types, sides = z["ids"], z["neuron_types"], z["neuron_sides"]
        indptr, indices, contacts = z["indptr"], z["indices"], z["contacts"]
        nts = z["neurotransmitters"]
        lookup = {str(int(i)): j for j, i in enumerate(ids)}
        mb, dan = lookup[config["mbonId"]], lookup[config["danId"]]
        if (types[mb], types[dan], sides[mb], sides[dan], nts[dan]) != ("MBON11", "PPL101", "R", "R", "dopamine"):
            raise ValueError("Pinned neuron identities/hemisphere/transmitter changed")
        dan_contacts = {int(j): int(c) for j, c in zip(indices[indptr[dan]:indptr[dan+1]], contacts[indptr[dan]:indptr[dan+1]])}
        eligible, excluded = [], []
        for kc in np.flatnonzero(np.char.startswith(types, "KCg") & (sides == "R")):
            hit = np.flatnonzero(indices[indptr[kc]:indptr[kc+1]] == mb)
            if not len(hit):
                continue
            if len(hit) != 1 or nts[kc] != "acetylcholine":
                raise ValueError("KC annotation/unique connection verification failed")
            item = {"kcId": str(int(ids[kc])), "kcType": str(types[kc]), "mbonId": config["mbonId"],
                    "contacts": int(contacts[indptr[kc]+hit[0]]), "danId": config["danId"],
                    "danToKcContacts": dan_contacts.get(int(kc), 0)}
            (eligible if item["danToKcContacts"] > 0 else excluded).append(item)
        selected = {lookup[e["kcId"]] for e in eligible} | {mb, dan}
        modeled_pairs = {(lookup[e["kcId"]], mb) for e in eligible}
        omitted = []
        for pre in sorted(selected):
            for post, count in zip(indices[indptr[pre]:indptr[pre+1]], contacts[indptr[pre]:indptr[pre+1]]):
                if int(post) in selected and (pre, int(post)) not in modeled_pairs:
                    omitted.append({"preId": str(int(ids[pre])), "postId": str(int(ids[post])), "contacts": int(count)})

    raw_path = LAB_ROOT / "data/raw" / config["graphRelease"] / "body-annotations-male-cns-v1.0-minconf-0.5.feather"
    if digest(raw_path) != metadata["sources"]["annotations"]["sha256"]:
        raise ValueError("Annotation source checksum differs")
    table = feather.read_table(raw_path)
    selected_ids = [int(e["kcId"]) for e in eligible] + [int(config["mbonId"]), int(config["danId"])]
    records = table.filter(pc.is_in(table["bodyId"], value_set=pa.array(selected_ids))).select(
        ["bodyId", "type", "instance", "somaSide", "hemibrainType", "somaLocation"]).to_pylist()
    neurons = [{"id": str(r["bodyId"]), "type": r["type"], "instance": r["instance"],
                "hemibrainType": r["hemibrainType"], "side": r["somaSide"],
                "role": "MBON" if str(r["bodyId"]) == config["mbonId"] else "DAN" if str(r["bodyId"]) == config["danId"] else "KC",
                "soma": r["somaLocation"]} for r in records]
    if len(neurons) != len(eligible)+2 or len(eligible) < 40:
        raise ValueError("Selected anatomy could not be verified")
    return {
        "compartment": config["compartment"], "neuronCount": len(neurons), "kcCount": len(eligible),
        "mbonId": config["mbonId"], "danId": config["danId"], "neurons": neurons,
        "contactCount": sum(e["contacts"] for e in eligible),
        "danToKcContactCount": sum(e["danToKcContacts"] for e in eligible), "edges": eligible,
        "graphSha256": actual_hash, "graphManifestSha256": digest(folder / "manifest.json"),
        "rawSources": metadata["sources"], "sourceNeuronCount": len(ids), "sourceEdgeCount": len(indices),
        "excludedKcsWithoutObservedDanContact": excluded, "omittedInternalConnections": omitted,
        "selection": "Every right KCg* with acetylcholine annotation and positive KC->11402 AND11327->KC contacts. No strength threshold or outcome selection.",
        "modelBoundary": "Only KC->MBON contacts carry rate input. DAN->KC establishes candidate plastic edges; DAN modulation is uniform. All other edges and all external cells are omitted, including feedback.",
        "coordinateUnits": "Original released somaLocation coordinates; visualization may affine-rescale them. These are soma locations, not active synapse positions.",
        "compartmentEvidence": "Actual instances MBON11(y1pedc>a/B)_R and PPL101(y1ped)_R agree with the Li2020 type crosswalk. Synapse-level compartment locations were not retrieved.",
    }


class ReducedRateCircuit:
    """Exact first-order filters; declared multiplicative eligibility depression.

    rKC approaches external cue*20Hz*fixed gain; rDAN approaches external
    reinforcement*20Hz. e approaches rKC/20Hz with tau=.5s. For each step,
    w <- max(.1, w*exp(-eta*e*(rDAN/20)*dt)). MBON approaches the sum of
    contact-count-normalized KC rates times efficacy. This fixed denominator
    includes all retained KC contacts, never just the currently active cue.
    Rates are model variables; no stochastic or measured spikes are implied.
    """
    def __init__(self, contacts, config, gains=None):
        self.config = config
        self.contacts = np.asarray(contacts, dtype=np.float64)
        if self.contacts.ndim != 1 or not len(self.contacts) or np.any(self.contacts <= 0):
            raise ValueError("Contacts must be a positive vector")
        self.gains = np.ones(len(self.contacts)) if gains is None else np.array(gains, dtype=np.float64)
        if self.gains.shape != self.contacts.shape or not np.isfinite(self.gains).all() or np.any(self.gains <= 0):
            raise ValueError("Invalid fixed KC gains")
        self.baseline = self.contacts / self.contacts.sum()
        self.config_hash = hashlib.sha256(canonical(config).encode()).hexdigest()
        self.contacts_hash = hashlib.sha256(self.contacts.tobytes()).hexdigest()
        self.efficacy = np.ones(len(self.contacts))
        self.time = 0.0
        self.reset_transient()

    def reset_transient(self):
        self.kc = np.zeros(len(self.contacts))
        self.eligibility = np.zeros(len(self.contacts))
        self.dan = 0.0
        self.mbon = 0.0

    def step(self, cue_mask, reinforcement, *, frozen=False):
        c = self.config
        cue_mask = np.asarray(cue_mask, dtype=np.float64)
        if cue_mask.shape != self.contacts.shape or not np.isin(cue_mask, [0, 1]).all() or reinforcement not in (0, 1):
            raise ValueError("Cue and reinforcement are bounded direct inputs")
        dt = c["dtSeconds"]
        a = math.exp(-dt / c["cellTimeConstantSeconds"])
        self.kc = a*self.kc + (1-a)*cue_mask*c["kcDriveHz"]*self.gains
        self.dan = a*self.dan + (1-a)*reinforcement*c["danDriveHz"]
        if not frozen:
            ae = math.exp(-dt/c["eligibilityTimeConstantSeconds"])
            self.eligibility = ae*self.eligibility+(1-ae)*self.kc/c["kcDriveHz"]
            self.efficacy *= np.exp(-c["etaPerSecond"]*self.eligibility*self.dan/c["danDriveHz"]*dt)
            np.clip(self.efficacy, c["minimumEfficacy"], c["maximumEfficacy"], out=self.efficacy)
        drive = float(np.dot(self.baseline*self.efficacy, self.kc))*c["mbonGain"]
        self.mbon = a*self.mbon+(1-a)*drive
        self.time += dt

    def state_dict(self):
        return {"configHash": self.config_hash, "contactsHash": self.contacts_hash,
                "efficacy": self.efficacy.tolist(), "kc": self.kc.tolist(), "eligibility": self.eligibility.tolist(),
                "dan": self.dan, "mbon": self.mbon, "time": self.time, "gains": self.gains.tolist()}

    def restore(self, state):
        expected = set(self.state_dict())
        if set(state) != expected:
            raise ValueError("Checkpoint fields differ")
        if state["configHash"] != self.config_hash or state["contactsHash"] != self.contacts_hash:
            raise ValueError("Checkpoint model/anatomy mismatch")
        vectors = {k: np.asarray(state[k], dtype=np.float64) for k in ("efficacy", "kc", "eligibility", "gains")}
        if any(v.shape != self.contacts.shape or not np.isfinite(v).all() for v in vectors.values()):
            raise ValueError("Checkpoint dimensions/nonfinite value")
        if not np.array_equal(vectors["gains"], self.gains):
            raise ValueError("Checkpoint fixed gain mismatch")
        if np.any(vectors["efficacy"] < self.config["minimumEfficacy"]) or np.any(vectors["efficacy"] > self.config["maximumEfficacy"]):
            raise ValueError("Checkpoint efficacy out of bounds")
        if any(np.any(vectors[k] < 0) for k in ("kc", "eligibility")) or any(not math.isfinite(state[k]) or state[k] < 0 for k in ("dan", "mbon", "time")):
            raise ValueError("Checkpoint negative/nonfinite state")
        for k, v in vectors.items():
            setattr(self, k, v.copy())
        for k in ("dan", "mbon", "time"):
            setattr(self, k, float(state[k]))


def make_inputs(n, seed, config):
    rng = np.random.default_rng(seed)
    selected = rng.permutation(n)
    count = max(1, round(n*config["cueFraction"]))
    masks = {}
    for i, cue in enumerate(("A", "B")):
        masks[cue] = np.zeros(n)
        masks[cue][selected[i*count:(i+1)*count]] = 1
    gains = rng.uniform(*config["replicaKcGainRange"], n)
    return masks, gains


def run_replica(circuit, config, condition, seed, reinforced_cue, *, replay=False, watchdog=lambda: None):
    contacts = [e["contacts"] for e in circuit["edges"]]
    ids = [e["kcId"] for e in circuit["edges"]]
    masks, gains = make_inputs(len(ids), seed, config)
    model = ReducedRateCircuit(contacts, config, gains)
    other_cue = "B" if reinforced_cue == "A" else "A"
    zero = np.zeros(len(ids))
    sample = [int(i) for cue in ("A", "B") for i in np.flatnonzero(masks[cue])[:config["sampledKcsPerCue"]]]
    frames = []
    sample_every = round(config["samplePeriodSeconds"]/config["dtSeconds"])
    frame_steps = 0
    frozen_checks = []

    def advance(mask, reinforcement, stage, cue, trial, frozen):
        nonlocal frame_steps
        model.step(mask, reinforcement, frozen=frozen)
        if replay and frame_steps % sample_every == 0:
            frames.append({"timeSeconds": round(model.time, 6), "stage": stage, "trial": trial, "cue": cue,
                           "reinforcementInput": reinforcement, "danRateHz": model.dan, "mbonRateHz": model.mbon,
                           "meanEfficacy": float(model.efficacy.mean()),
                           "csPlusMeanEfficacy": float(model.efficacy[masks[reinforced_cue].astype(bool)].mean()),
                           "csMinusMeanEfficacy": float(model.efficacy[masks[other_cue].astype(bool)].mean()),
                           "cellRatesHz": [float(model.kc[i]) for i in sample] + [model.dan, model.mbon]})
        frame_steps += 1

    def probe(stage):
        responses = {}
        before_weights = model.efficacy.copy()
        for cue in ("A", "B"):
            model.reset_transient()
            trace_before = model.eligibility.copy()
            values = []
            for tick in range(round(config["probeSeconds"]/config["dtSeconds"])):
                advance(masks[cue], 0, stage, cue, 0, True)
                if tick*config["dtSeconds"] >= config["probeMeasureStartSeconds"]:
                    values.append(model.mbon)
            responses[cue] = float(np.mean(values))
            frozen_checks.append(bool(np.array_equal(trace_before, model.eligibility)))
        frozen_checks.append(bool(np.array_equal(before_weights, model.efficacy)))
        return responses

    pre = probe("pre")
    model.reset_transient()
    slots = 2*config["trainingPairs"]
    for slot in range(slots):
        watchdog()
        cue = "A" if slot % 2 == 0 else "B"
        for tick in range(round(config["slotSeconds"]/config["dtSeconds"])):
            t = tick*config["dtSeconds"]
            cue_on = config["cueStartSeconds"] <= t < config["cueStartSeconds"]+config["cueSeconds"]
            reinforcement_start = config["unpairedReinforcementStartSeconds"] if condition == "unpaired" else config["backwardReinforcementStartSeconds"] if condition == "backward" else config["pairedReinforcementStartSeconds"]
            reinforcement = int(cue == reinforced_cue and condition != "absent" and reinforcement_start <= t < reinforcement_start+config["reinforcementSeconds"])
            advance(masks[cue] if cue_on else zero, reinforcement, "training", cue if cue_on else None, slot//2+1, condition == "frozen")
    trained = model.efficacy.copy()
    checkpoint = model.state_dict()
    restored = ReducedRateCircuit(contacts, config, gains)
    restored.restore(json.loads(canonical(checkpoint)))
    roundtrip = canonical(restored.state_dict()) == canonical(checkpoint)
    model.step(masks[other_cue], 0, frozen=True)
    restored.step(masks[other_cue], 0, frozen=True)
    continuation = canonical(restored.state_dict()) == canonical(model.state_dict())
    model.restore(checkpoint)
    if condition == "erased":
        model.efficacy[:] = 1.0
    post = probe("post")
    suppression = {cue: 1-post[cue]/pre[cue] for cue in ("A", "B")}
    result = {"condition": condition, "seed": seed, "reinforcedCue": reinforced_cue,
              "preResponseHz": pre, "postResponseHz": post, "suppression": suppression,
              "specificSuppression": suppression[reinforced_cue]-suppression[other_cue],
              "csPlusSuppression": suppression[reinforced_cue], "csMinusSuppression": suppression[other_cue],
              "trainedChangedEdges": int(np.count_nonzero(np.abs(trained-1)>1e-12)),
              "trainedMeanEfficacy": float(trained.mean()), "postMeanEfficacy": float(model.efficacy.mean()),
              "checkpointRoundtripExact": roundtrip, "checkpointContinuationExact": continuation,
              "evaluationImmutable": all(frozen_checks),
              "cueIds": {cue: [ids[int(i)] for i in np.flatnonzero(masks[cue])] for cue in ("A", "B")}}
    replay_data = None
    if replay:
        lookup = {n["id"]: n for n in circuit["neurons"]}
        sampled = [{"id": ids[i], "type": lookup[ids[i]]["type"], "role": "KC", "cue": "A" if masks["A"][i] else "B"} for i in sample]
        sampled += [{"id": circuit["danId"], "type": "PPL101", "role": "DAN", "cue": None}, {"id": circuit["mbonId"], "type": "MBON11", "role": "MBON", "cue": None}]
        replay_data = {"label": "Recorded model activity", "condition": condition, "seed": seed, "reinforcedCue": reinforced_cue,
                       "durationSeconds": round(model.time, 6), "samplePeriodSeconds": config["samplePeriodSeconds"],
                       "sampledCells": sampled, "frames": frames}
    return result, checkpoint, replay_data


def summarize(results, config):
    labels = {"paired": "Cue and reinforcement paired", "unpaired": "Same reinforcement, delayed", "backward": "Reinforcement before cue",
              "absent": "No reinforcement", "frozen": "Plasticity disabled", "erased": "Memory erased after training"}
    summaries = []
    for condition in config["conditions"]:
        group = [r for r in results if r["condition"] == condition]
        x = [r["specificSuppression"] for r in group]
        summaries.append({"condition": condition, "label": labels[condition], "n": len(group),
                          "meanSpecificSuppression": float(np.mean(x)), "minSpecificSuppression": min(x), "maxSpecificSuppression": max(x),
                          "meanCsPlusSuppression": float(np.mean([r["csPlusSuppression"] for r in group])),
                          "meanCsMinusSuppression": float(np.mean([r["csMinusSuppression"] for r in group]))})
    by = {s["condition"]: s for s in summaries}
    thresholds = config["prespecifiedChecks"]
    checks = [
        {"id": "selective-depression", "label": "Paired cue changes more than other cue", "passed": by["paired"]["minSpecificSuppression"] >= thresholds["pairedSpecificSuppressionMinimum"], "detail": "Minimum paired specificity across assignments compared with predeclared 5% engineering threshold."},
        {"id": "timing-control", "label": "Pairing exceeds delayed reinforcement", "passed": by["paired"]["meanSpecificSuppression"]-by["unpaired"]["meanSpecificSuppression"] >= thresholds["pairedMinusUnpairedMinimum"], "detail": "Same reinforcement amount; shifted timing. Predeclared gap is 4 percentage points."},
        {"id": "frozen-control", "label": "Disabled plasticity leaves response unchanged", "passed": all(max(abs(x) for x in r["suppression"].values()) <= thresholds["frozenMaximumAbsoluteChange"] for r in results if r["condition"] == "frozen"), "detail": "Exact pre/post frozen-efficacy comparison."},
        {"id": "erasure-control", "label": "Erasing efficacy changes restores response", "passed": all(max(abs(x) for x in r["suppression"].values()) <= thresholds["erasedMaximumAbsoluteChange"] for r in results if r["condition"] == "erased"), "detail": "Restores baseline efficacies and resets transients before the probe."},
        {"id": "cue-specificity", "label": "Other cue changes less than 1%", "passed": all(abs(r["csMinusSuppression"]) <= thresholds["unreinforcedCueMaximumSuppression"] for r in results if r["condition"] == "paired"), "detail": "Disjoint engineered KC patterns; biological cue overlap is not tested."},
        {"id": "checkpoint", "label": "Checkpoint restores exact state and continuation", "passed": all(r["checkpointRoundtripExact"] and r["checkpointContinuationExact"] for r in results), "detail": "Every condition saves all mutable rates, traces, efficacies and simulated time; JSON roundtrip and one-step continuation match exactly."},
        {"id": "frozen-evaluation", "label": "Probes cannot update efficacy or plasticity traces", "passed": all(r["evaluationImmutable"] for r in results), "detail": "Direct array equality checks around all pre/post probes."},
    ]
    return summaries, checks


def run_study(config_path, output):
    import psutil
    output = Path(output)
    if output.exists():
        raise FileExistsError("Output exists: use a new directory; prior outcomes cannot be overwritten")
    config = json.loads(Path(config_path).read_text())
    started = time.monotonic()
    maximum_rss = 0

    def watchdog():
        nonlocal maximum_rss
        maximum_rss = max(maximum_rss, psutil.Process().memory_info().rss)
        if time.monotonic()-started > config["maximumWallSeconds"] or maximum_rss > config["maximumRssGiB"]*1024**3:
            raise RuntimeError("Declared time or memory budget reached; incomplete assay is not success")

    circuit = extract_circuit(config)
    watchdog()
    # Freeze method, source and anatomy before computing the first condition.
    source_paths = [Path(__file__), Path(config_path), LAB_ROOT / "scripts/run-reduced-conditioning.py"]
    freeze = {"frozenAt": now(), "protocol": config, "sourceHashes": {str(p.relative_to(LAB_ROOT)): digest(p) for p in source_paths},
              "circuitHash": hashlib.sha256(canonical(circuit).encode()).hexdigest(),
              "environment": {"python": sys.version, "numpy": np.__version__, "platform": platform.platform(), "threadLimit": 2},
              "outcomesComputed": False, "scope": "Prespecified locally before this execution; not externally preregistered."}
    write_new(output / "frozen-protocol.json", freeze)
    write_new(output / "circuit.json", circuit)
    results, checkpoints, replay = [], [], None
    for seed in config["seeds"]:
        for cue in config["reinforcedCues"]:
            for condition in config["conditions"]:
                selected_replay = seed == config["seeds"][0] and cue == "A" and condition == "paired"
                result, checkpoint, recording = run_replica(circuit, config, condition, seed, cue, replay=selected_replay, watchdog=watchdog)
                results.append(result)
                checkpoints.append({"condition": condition, "seed": seed, "reinforcedCue": cue, "state": checkpoint})
                if recording:
                    replay = recording
        print(f"Completed input-assignment seed {seed}: {len(results)} condition executions", flush=True)
    watchdog()
    for path in source_paths:
        if digest(path) != freeze["sourceHashes"][str(path.relative_to(LAB_ROOT))]:
            raise RuntimeError("Source changed after protocol freeze; refuse a completed artifact")
    summaries, checks = summarize(results, config)
    full = {"schemaVersion": 1, "kind": "scicon-real-circuit-conditioning-v1", "experimentId": config["experimentId"],
            "title": "Can one cue leave a trace in a fly learning circuit?", "status": "complete", "completedAt": now(),
            "claim": "This reduced model exhibits cue-specific depression under the declared learning rule." if all(c["passed"] for c in checks) else "The declared reduced model did not meet all engineering validation criteria.",
            "evidenceStatus": "MODEL_MECHANISM_CHECK_PASSED" if all(c["passed"] for c in checks) else "MODEL_MECHANISM_CHECK_INCOMPLETE",
            "limitations": [
                "Actual MaleCNS IDs and contact counts; invented physiological rate parameters and plasticity equation, not measured fly activity.",
                "Two cues are assigned directly to disjoint KC subsets, bypassing eyes, sensory pathways and odor receptors.",
                "PPL101 modulation represents aversive reinforcement. No chemical dopamine, pleasure, game score, movement or firing is modeled.",
                "The depression direction is encoded in the rule. Controls verify implementation and attribution, not a new biological discovery or full-model validation.",
                "All rates are modeled Hz, not recorded or generated spike counts. Replay samples only 18 identified cells every 0.2 simulated seconds.",
                "Eight assignment seeds and both cue assignments use the same anatomical specimen, not sixteen animals or independent biological replicas.",
                "Feedback, other MBONs and DANs, other brain regions and VNC are omitted; no intact-connectome advantage is tested.",
                "Within-run retained efficacy and exact checkpoint restoration are tested; biological long-term retention is not.",
                "Whole-brain vision, motor decoding, conditioning and game-learning gates remain unchanged."
            ], "sources": SOURCES, "circuit": {k: circuit[k] for k in ("compartment", "neuronCount", "kcCount", "mbonId", "danId", "contactCount", "danToKcContactCount", "graphSha256", "neurons")},
            "protocol": config, "frozenProtocolSha256": digest(output / "frozen-protocol.json"),
            "checks": checks, "results": summaries, "replicas": results, "replay": replay,
            "execution": {"wallSeconds": time.monotonic()-started, "peakObservedRssBytes": maximum_rss, "executions": len(results)}}
    write_new(output / "public-experiment.json", full)
    write_new(output / "checkpoints.json", checkpoints)
    write_new(output / "checksums.json", {p.name: digest(p) for p in sorted(output.iterdir()) if p.is_file()})
    return full
