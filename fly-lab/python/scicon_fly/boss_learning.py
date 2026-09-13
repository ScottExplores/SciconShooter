"""Reduced MaleCNS beta'2a game controller with explicitly engineered interfaces.

One real MBON is probed with three action-conditioned sparse KC inputs. These
are computational probes, not three invented MBONs or reconstructed motor paths.
Positive hull damage supplies imposed PAM02 modulation; eligible real KC->MBON
efficacies change. Neither game coordinates nor a target-following policy enter
this module. Pixel feature extraction is an external, declared interface.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path

import numpy as np

MODEL_VERSION = "malecns-pam02-boss-v1"
ACTIONS = ("W", "idle", "E")
PARAMETERS = {
    "kcHz": 20.0, "danHz": 20.0, "eligibilitySeconds": 0.65,
    "etaPerSecond": 0.12, "minimumEfficacy": 0.1,
    "damageForUnitDose": 2.0, "softmaxGain": 7.0, "exploration": 0.12,
    "activeFractionPerAction": 0.15, "playerXScale": 0.4,
    "defaultDtSeconds": 0.2,
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def identity(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


class BossLearningController:
    """Persistent connection efficacies are the only learned policy parameters.

    Frozen random receptive-field centers and action assignments encode a
    pixel-derived state. Each candidate probes the same anatomical MBON with
    a different sparse KC input. The fixed decoder favors reward-depressed
    MBON responses, after a reward-free baseline normalization. Reward updates
    the preceding chosen input's decaying eligibility, never all candidates.
    """
    def __init__(self, circuit, seed=1924, learning=True):
        if isinstance(circuit, (str, Path)):
            circuit = json.loads(Path(circuit).read_text(encoding="utf-8"))
        self.circuit = copy.deepcopy(circuit)
        if circuit.get("modelVersion") != MODEL_VERSION or circuit.get("synthetic") is not False:
            raise ValueError("A frozen real MaleCNS PAM02 circuit is required")
        if circuit.get("parameters") != PARAMETERS:
            raise ValueError("Model parameters differ from frozen version")
        self.circuit_hash = identity(circuit)
        self.seed = int(seed)
        self.rng = np.random.default_rng(self.seed)
        self.edges = circuit["edges"]
        self.contacts = np.array([e["contacts"] for e in self.edges], dtype=float)
        self.ids = [e["kcId"] for e in self.edges]
        if len(self.contacts) < 60 or len(set(self.ids)) != len(self.ids) or not np.isfinite(self.contacts).all() or np.any(self.contacts <= 0):
            raise ValueError("Invalid real KC contact vector")
        if any(not e["danContacts"] or any(x["contacts"] <= 0 for x in e["danContacts"]) for e in self.edges):
            raise ValueError("Every plastic edge needs observed nominated DAN contacts")
        self.neurons = {n["id"]: n for n in circuit["neurons"]}
        if any(self.neurons[k]["role"] != "KC" for k in self.ids):
            raise ValueError("KC identity mismatch")
        self.n = len(self.contacts)
        # Generated without gameplay or reinforcement. Every anatomical KC is
        # assigned exactly once to an engineered efference-copy action group.
        perm = self.rng.permutation(self.n)
        self.groups = np.empty(self.n, dtype=int)
        for a, indices in enumerate(np.array_split(perm, 3)):
            self.groups[indices] = a
        self.centers = np.column_stack((self.rng.uniform(-1, 1, self.n), self.rng.uniform(0, 1, self.n)))
        self.gains = self.rng.uniform(.8, 1.2, self.n)
        self.weights = np.ones(self.n)
        self.learning = bool(learning)
        self.lifetime_updates = 0
        self.total_reinforcement = 0.0
        self.reset(preserve_efficacy=True, learning=learning)

    def reset(self, preserve_efficacy=True, learning=None, policy_seed=None):
        if learning is not None:
            self.learning = bool(learning)
        if policy_seed is not None:
            self.rng = np.random.default_rng(int(policy_seed))
        if not preserve_efficacy:
            self.weights[:] = 1
            self.lifetime_updates = 0
            self.total_reinforcement = 0.0
        self.eligibility = np.zeros(self.n)
        self.kc = np.zeros(self.n)
        self.dan_hz = 0.0
        self.mbon_hz = 0.0
        self.has_previous = False
        self.time_seconds = 0.0
        self.steps = 0
        self.last_action = None
        self.last_features = None
        return self.status()

    @staticmethod
    def _features(features):
        allowed = {"targetOffset", "targetVisible", "playerX", "confidence", "playerVisible"}
        if not isinstance(features, dict) or set(features) - allowed:
            raise ValueError("Policy accepts declared pixel features only")
        if type(features.get("targetVisible")) is not bool:
            raise ValueError("targetVisible must be boolean")
        offset, player = features.get("targetOffset"), features.get("playerX")
        if type(offset) not in (int, float) or type(player) not in (int, float) or not math.isfinite(offset) or not math.isfinite(player) or not -1 <= offset <= 1 or not 0 <= player <= 1:
            raise ValueError("Pixel features outside frozen bounds")
        if "playerVisible" in features and type(features["playerVisible"]) is not bool:
            raise ValueError("playerVisible must be boolean")
        if "confidence" in features and (type(features["confidence"]) not in (int, float) or not math.isfinite(features["confidence"]) or not 0 <= features["confidence"] <= 1):
            raise ValueError("Invalid pixel confidence")
        return {"targetOffset": float(offset), "targetVisible": features["targetVisible"] and features.get("playerVisible", True),
                "playerX": float(player), "playerVisible": features.get("playerVisible", True),
                "confidence": float(features.get("confidence", 1))}

    def _codes(self, features):
        codes = np.zeros((3, self.n))
        if not features["targetVisible"]:
            return codes
        # Random receptive fields provide no preferred left/right behavior.
        distance = (self.centers[:, 0]-features["targetOffset"])**2 + PARAMETERS["playerXScale"]*(self.centers[:, 1]-features["playerX"])**2
        for a in range(3):
            group = np.flatnonzero(self.groups == a)
            count = max(1, round(len(group)*PARAMETERS["activeFractionPerAction"]))
            chosen = group[np.argsort(distance[group], kind="stable")[:count]]
            codes[a, chosen] = self.gains[chosen]
        return codes

    def action_probabilities(self, features):
        features = self._features(features)
        codes = self._codes(features)
        baseline = codes @ self.contacts
        raw = codes @ (self.contacts*self.weights)
        ratio = np.divide(raw, baseline, out=np.ones(3), where=baseline > 0)
        logits = PARAMETERS["softmaxGain"]*(1-ratio)
        preference = np.exp(logits-logits.max())
        preference /= preference.sum()
        epsilon = PARAMETERS["exploration"]
        probabilities = (1-epsilon)*preference + epsilon/3
        return probabilities, codes, raw*PARAMETERS["kcHz"]/self.contacts.sum(), ratio

    def _reinforce(self, reinforcement, dt_seconds):
        if type(reinforcement) not in (int, float) or not math.isfinite(reinforcement) or reinforcement < 0:
            raise ValueError("PAM02 channel accepts finite nonnegative hull damage")
        if type(dt_seconds) not in (int, float) or not math.isfinite(dt_seconds) or not (1/60-1e-9) <= dt_seconds <= 1:
            raise ValueError("Declared action interval must be 1/60..1 simulated seconds")
        if reinforcement and not self.has_previous:
            raise ValueError("No previous action to reinforce")
        if reinforcement and not self.learning:
            raise ValueError("Frozen evaluation accepts no reinforcement")
        before = self.weights.copy()
        dose = min(float(reinforcement)/PARAMETERS["damageForUnitDose"], 1.0) if self.learning else 0.0
        self.dan_hz = PARAMETERS["danHz"]*dose
        if self.learning:
            # Engineered action-credit gate: the environment reports reward
            # for the immediately preceding held action. Older contexts retain
            # a decaying trace, but another action's KC group is not reinforced.
            credited = self.eligibility*(self.groups == self.last_action) if self.last_action is not None else np.zeros(self.n)
            self.weights *= np.exp(-PARAMETERS["etaPerSecond"]*dose*credited*dt_seconds)
            np.clip(self.weights, PARAMETERS["minimumEfficacy"], 1.0, out=self.weights)
            self.eligibility *= math.exp(-dt_seconds/PARAMETERS["eligibilitySeconds"])
            self.total_reinforcement += reinforcement
        changed = np.flatnonzero(self.weights != before)
        self.lifetime_updates += len(changed)
        if self.has_previous:
            self.time_seconds += dt_seconds
        ledger = [{"sourceId": self.ids[i], "targetId": self.circuit["mbonId"],
                   "before": float(before[i]), "after": float(self.weights[i]), "delta": float(self.weights[i]-before[i])}
                  for i in changed]
        return dose, ledger

    def reinforce(self, reinforcement=0, dt_seconds=.2):
        dose, ledger = self._reinforce(reinforcement, dt_seconds)
        self.mbon_hz = float(self.kc @ (self.contacts*self.weights)/self.contacts.sum())
        self.has_previous = False
        return {"ok": True, "neural": self._telemetry(dose, ledger, reinforcement)}

    def act(self, features, reinforcement=0, dt_seconds=.2):
        features = self._features(features)
        # Incoming reward belongs to the previous action interval. Efficacy
        # changes precede the next observation's three computational probes.
        dose, ledger = self._reinforce(reinforcement, dt_seconds)
        probabilities, codes, probes, ratio = self.action_probabilities(features)
        a = int(self.rng.choice(3, p=probabilities))
        self.kc = codes[a]*PARAMETERS["kcHz"]
        self.mbon_hz = float(probes[a])
        if self.learning:
            # Bounded replacing trace tracks chosen action inputs only.
            self.eligibility = np.maximum(self.eligibility, np.minimum(codes[a], 1.0))
        self.has_previous = True
        self.steps += 1
        self.last_action = a
        self.last_features = features
        neural = self._telemetry(dose, ledger, reinforcement)
        neural.update({"probabilities": dict(zip(ACTIONS, map(float, probabilities))),
                       "candidateMbonHz": dict(zip(ACTIONS, map(float, probes))),
                       "candidateResponseRatio": dict(zip(ACTIONS, map(float, ratio))),
                       "candidateInterpretation": "Three computational probes of the same MBON; only chosen input shown as activity",
                       "features": features, "visionUsable": features["targetVisible"],
                       "visionStatus": "PIXEL_FEATURES_AVAILABLE" if features["targetVisible"] else "TARGET_OR_PLAYER_NOT_DETECTED_UNINFORMED_EXPLORATION"})
        return {"ok": True, "action": {"movement": ACTIONS[a], "fire": True}, "neural": neural}

    def _telemetry(self, dose, ledger, reinforcement):
        active = np.flatnonzero(self.kc > 0)
        sample_indices = list(active[:14])
        if len(sample_indices) < 14:
            sample_indices += [i for i in range(self.n) if i not in sample_indices][:14-len(sample_indices)]
        samples = [{"id": self.ids[i], "type": self.neurons[self.ids[i]]["type"], "role": "KC", "hz": float(self.kc[i])} for i in sample_indices]
        samples += [{"id": str(i), "type": "PAM02", "role": "DAN", "hz": self.dan_hz} for i in self.circuit["danIds"]]
        samples += [{"id": self.circuit["mbonId"], "type": "MBON01", "role": "MBON", "hz": self.mbon_hz}]
        return {"modelVersion": MODEL_VERSION, "circuitHash": self.circuit_hash,
                "scope": "REDUCED_MALECNS_PAM02_ACTION_CONDITIONED_MODEL", "mode": "training" if self.learning else "frozen",
                "neuronCount": len(self.circuit["neurons"]), "kcCount": self.n,
                "activeNeurons": int(np.count_nonzero(self.kc)) + (len(self.circuit["danIds"]) if self.dan_hz else 0) + int(self.mbon_hz > 0),
                "samples": samples, "activityKind": "MODELED_RATES_HZ_NOT_SPIKES",
                "kcHz": float(self.kc.mean()), "danHz": self.dan_hz, "mbonHz": self.mbon_hz,
                "meanEfficacy": float(self.weights.mean()), "minimumEfficacy": float(self.weights.min()),
                "changedWeightsSinceInitialization": int(np.count_nonzero(self.weights != 1)), "changedThisStep": len(ledger),
                "changedWeights": int(np.count_nonzero(self.weights != 1)), "plasticityChanges": ledger,
                "lifetimeWeightUpdates": self.lifetime_updates, "deliveredReinforcement": float(reinforcement),
                "reinforcementDose": dose, "plasticityFrozen": not self.learning,
                "simTimeSeconds": self.time_seconds, "steps": self.steps,
                "evidenceForLearning": "UNDETERMINED_REQUIRES_MATCHED_FROZEN_EVALUATION"}

    def status(self):
        return {"ok": True, "modelVersion": MODEL_VERSION, "circuitHash": self.circuit_hash,
                "parameters": PARAMETERS.copy(), "neuronCount": len(self.circuit["neurons"]),
                "kcCount": self.n, "mbonId": self.circuit["mbonId"], "danIds": self.circuit["danIds"],
                "neurons": self.circuit["neurons"], "learning": self.learning, "weightHash": identity(self.weights.tolist()),
                "neural": self._telemetry(0, [], 0),
                "interface": "Pixel-derived features -> fixed random action-conditioned KC input -> real KC-MBON contacts -> fixed probabilistic readout",
                "scope": "Reduced model; no reconstructed optic lobe, VNC or natural motor pathway"}

    def state_dict(self):
        state = {"schemaVersion": 1, "modelVersion": MODEL_VERSION, "circuitHash": self.circuit_hash,
                 "seed": self.seed, "learning": self.learning, "weights": self.weights.tolist(),
                 "eligibility": self.eligibility.tolist(), "kc": self.kc.tolist(),
                 "groups": self.groups.tolist(), "centers": self.centers.tolist(), "gains": self.gains.tolist(),
                 "danHz": self.dan_hz, "mbonHz": self.mbon_hz, "hasPrevious": self.has_previous,
                 "timeSeconds": self.time_seconds, "steps": self.steps, "lastAction": self.last_action,
                 "lastFeatures": self.last_features, "lifetimeUpdates": self.lifetime_updates,
                 "totalReinforcement": self.total_reinforcement, "rng": copy.deepcopy(self.rng.bit_generator.state)}
        return {"state": state, "sha256": identity(state)}

    def restore(self, checkpoint):
        if set(checkpoint) != {"state", "sha256"} or identity(checkpoint["state"]) != checkpoint["sha256"]:
            raise ValueError("Corrupt checkpoint checksum")
        s = checkpoint["state"]
        if s.get("schemaVersion") != 1 or s.get("modelVersion") != MODEL_VERSION or s.get("circuitHash") != self.circuit_hash or s.get("seed") != self.seed:
            raise ValueError("Checkpoint model/circuit/seed differs")
        arrays = {k: np.asarray(s[k], dtype=float) for k in ["weights", "eligibility", "kc", "centers", "gains", "groups"]}
        for k, a in arrays.items():
            expected = (self.n, 2) if k == "centers" else (self.n,)
            if a.shape != expected or not np.isfinite(a).all():
                raise ValueError("Invalid checkpoint shape/value")
        if np.any(arrays["weights"] < PARAMETERS["minimumEfficacy"]) or np.any(arrays["weights"] > 1) or np.any(arrays["eligibility"] < 0) or np.any(arrays["eligibility"] > 1):
            raise ValueError("Invalid efficacy/eligibility bounds")
        if not np.array_equal(arrays["groups"], self.groups) or not np.array_equal(arrays["centers"], self.centers) or not np.array_equal(arrays["gains"], self.gains):
            raise ValueError("Frozen input coding changed")
        rng = np.random.default_rng()
        rng.bit_generator.state = copy.deepcopy(s["rng"])
        for k in ["danHz", "mbonHz", "timeSeconds", "totalReinforcement"]:
            if type(s[k]) not in (int, float) or not math.isfinite(s[k]) or s[k] < 0:
                raise ValueError("Invalid checkpoint scalar")
        if type(s["learning"]) is not bool or type(s["hasPrevious"]) is not bool or any(type(s[k]) is not int or s[k] < 0 for k in ["steps", "lifetimeUpdates"]):
            raise ValueError("Invalid checkpoint state")
        if s["lastAction"] not in (None, 0, 1, 2):
            raise ValueError("Invalid previous action")
        if s["lastFeatures"] is not None:
            self._features(s["lastFeatures"])
        self.weights = arrays["weights"].copy(); self.eligibility = arrays["eligibility"].copy(); self.kc = arrays["kc"].copy()
        self.learning = s["learning"]; self.dan_hz = s["danHz"]; self.mbon_hz = s["mbonHz"]
        self.has_previous = s["hasPrevious"]; self.time_seconds = s["timeSeconds"]; self.steps = s["steps"]
        self.last_action = s["lastAction"]; self.last_features = copy.deepcopy(s["lastFeatures"])
        self.lifetime_updates = s["lifetimeUpdates"]; self.total_reinforcement = s["totalReinforcement"]; self.rng = rng
        return {"ok": True, "restored": True, "circuitHash": self.circuit_hash}


def serve():
    import argparse
    import sys
    parser = argparse.ArgumentParser()
    parser.add_argument("--circuit", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=1924)
    args = parser.parse_args()
    controller = BossLearningController(args.circuit, args.seed)
    for line in sys.stdin:
        request = {}
        try:
            if len(line) > 2_000_000:
                raise ValueError("Command too large")
            request = json.loads(line)
            op = request.get("op")
            if op in ("status", "initialize"):
                reply = controller.status()
            elif op == "reset":
                reply = controller.reset(request.get("preserveEfficacy", True), request.get("learning", True), request.get("seed"))
            elif op == "step":
                reply = controller.act(request["features"], request.get("reinforcement", 0), request.get("dtSeconds", .2))
            elif op == "reinforce":
                reply = controller.reinforce(request.get("reinforcement", 0), request.get("dtSeconds", .2))
            elif op == "checkpoint":
                reply = {"ok": True, "checkpoint": controller.state_dict(), "weightHash": identity(controller.weights.tolist())}
            elif op == "restore":
                reply = controller.restore(request["checkpoint"])
            elif op == "close":
                reply = {"ok": True, "closed": True}
            else:
                raise ValueError("Unknown command")
        except Exception as exc:
            reply = {"ok": False, "error": str(exc)}
        if "id" in request:
            reply["id"] = request["id"]
        print(canonical(reply), flush=True)
        if reply.get("closed"):
            break


if __name__ == "__main__":
    serve()
