"""Restricted JSON-lines neural worker. Never receives evaluator/game state.

Example: python -m scicon_fly.worker --graph graph.npz --manifest manifest.json
 --vision retina.json --decoder decoder.json --plasticity plasticity.json
 --gates gates.json --checkpoint-dir fly-lab/runtime/neural --deny-root experiments
"""
from __future__ import annotations
import argparse
import json
import math
import os
from pathlib import Path
import sys
import numpy as np
from .assays import gate_report, require_training_gates
from .decoder import FixedDecoder
from .controls import LesionProtocol
from .model import LIFModel, LIFParameters, SparseGraph, load_checkpoint, save_checkpoint, file_hash, canonical_hash
from .plasticity import CompartmentPlasticity
from .vision import VisualTransducer, decode_observation


def install_filesystem_boundary(denied_roots):
    """Defense in depth for trusted Python; NOT an adversarial OS sandbox.

    Resolve paths (including symlinks) before containment. Do not permit the
    worker to read evaluator artifacts just because they share a user account.
    Native code/OS privileges are outside this audit-hook security model.
    """
    roots = tuple(Path(p).resolve() for p in denied_roots)

    def check_path(value):
        if isinstance(value, (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(value)).resolve()
            for root in roots:
                if path == root or root in path.parents:
                    raise PermissionError("Neural worker cannot access evaluator files")

    def hook(event, args):
        if event in {"open", "os.listdir", "os.scandir", "os.remove", "os.rmdir", "os.mkdir", "os.chdir", "os.chmod", "os.truncate"} and args:
            check_path(args[0])
        elif event in {"os.rename", "os.link", "os.symlink"}:
            for value in args[:2]:
                check_path(value)
    sys.addaudithook(hook)


class WorkerSession:
    def __init__(self, graph, vision_manifest, decoder_manifest, *, plasticity_manifest=None,
                 parameters=None, gates=None, interval_ms=50., checkpoint_dir="fly-lab/runtime/neural", allow_synthetic_fixture=False,
                 lesion_manifest=None):
        if graph.manifest.get("synthetic", False) and not allow_synthetic_fixture:
            raise ValueError("SYNTHETIC fixtures are restricted to explicit numerical/conditioning tests")
        self._synthetic_fixture = bool(graph.manifest.get("synthetic", False))
        if not math.isfinite(interval_ms) or not 0 < interval_ms <= 1000:
            raise ValueError("Invalid control interval")
        self.graph = graph
        self.brain = LIFModel(graph, parameters)
        self.vision = VisualTransducer(graph, vision_manifest)
        self.decoder = FixedDecoder(graph, decoder_manifest)
        self.plasticity = CompartmentPlasticity(graph, plasticity_manifest) if plasticity_manifest else None
        self.lesions = LesionProtocol(graph, lesion_manifest)
        self.interval_ms = float(interval_ms)
        self.checkpoint_dir = Path(checkpoint_dir).resolve()
        self.identity = {"graph": graph.identity, "dynamics": self.brain.parameter_hash,
                         "vision": self.vision.identity, "decoder": self.decoder.identity,
                         "plasticity": self.plasticity.identity if self.plasticity else None,
                         "lesions": self.lesions.identity, "intervalMs": self.interval_ms, "workerSchema": 2}
        self.gates = gates if gates is not None else gate_report(self.identity)
        self._training_evidence_cache = None
        self.reinforcement_drives = np.zeros((2, graph.n))  # negative, positive
        reinforcement = (plasticity_manifest or {}).get("reinforcement", {})
        self.pulse_duration_ms = float(reinforcement.get("durationMs", 200))
        self.maximum_reinforcement = float(reinforcement.get("maximumMagnitude", 5))
        if not all(math.isfinite(v) and v > 0 for v in (self.pulse_duration_ms, self.maximum_reinforcement)):
            raise ValueError("Invalid reinforcement constants")
        if not math.isclose(self.pulse_duration_ms / self.brain.parameters.dt_ms, round(self.pulse_duration_ms / self.brain.parameters.dt_ms), abs_tol=1e-8):
            raise ValueError("Reinforcement pulse duration must be integral neural steps")
        for channel, terms in enumerate((reinforcement.get("negativeNeurons", reinforcement.get("neurons", [])), reinforcement.get("positiveNeurons", []))):
            for term in terms:
                i = graph.neuron_index(term["id"])
                gain = float(term["gainMv"])
                if not math.isfinite(gain) or gain <= 0 or self.plasticity is None or i not in self.plasticity.dan:
                    raise ValueError("Artificial reinforcement must address identified compartment DANs")
                self.reinforcement_drives[channel, i] += gain
        self.reinforcement_queue = np.zeros((round(self.pulse_duration_ms / self.brain.parameters.dt_ms), 2))
        self.frame = 0
        self.terminal = False
        self.last_drive = np.zeros(graph.n)
        self.retention_seconds = 0.
        self.last_mode = 0  # none, training, frozen
        self.memory_origin = np.zeros(32, dtype=np.uint8)

    def _require_training(self):
        """Apply the same evidence boundary to direct CLI and server sessions.

        A successful verification is cached for this exact identity/gate
        snapshot; failures are never cached. Synthetic fixtures already need
        explicit construction opt-in and cannot stand in for real evidence.
        """
        require_training_gates(self.gates, self.identity)
        if self._synthetic_fixture:
            return
        snapshot = canonical_hash({"identity": self.identity, "gates": self.gates})
        if snapshot != self._training_evidence_cache:
            # Lazy import avoids validation -> assays/artifacts import cycles.
            from .validation import validate_gate_evidence
            validate_gate_evidence(self.gates, self.identity, synthetic=False)
            self._training_evidence_cache = snapshot

    def _checkpoint_path(self, name):
        if not isinstance(name, str) or Path(name).name != name or not name.endswith(".npz") or name in {".npz", "..npz"}:
            raise ValueError("Checkpoint name must be a simple .npz filename")
        path = (self.checkpoint_dir / name).resolve()
        if path.parent != self.checkpoint_dir:
            raise ValueError("Checkpoint path escapes worker storage")
        return path

    def _states(self):
        states = {"brain": self.brain.state_dict(), "vision": self.vision.state_dict(), "decoder": self.decoder.state_dict(),
                  "worker": {"frame": np.array(self.frame, dtype=np.int64), "reinforcement_queue": self.reinforcement_queue.copy(),
                             "last_drive": self.last_drive.copy(), "terminal": np.array(self.terminal, dtype=np.bool_),
                             "retention_seconds": np.array(self.retention_seconds, dtype=np.float64), "last_mode": np.array(self.last_mode, dtype=np.int8),
                             "memory_origin": self.memory_origin.copy()}}
        if self.plasticity:
            states["plasticity"] = self.plasticity.state_dict()
        return states

    def _restore(self, states):
        expected = self._states()
        if set(states) != set(expected):
            raise ValueError("Checkpoint missing a mutable worker component")
        for name, fields in expected.items():
            if set(states[name]) != set(fields):
                raise ValueError("Checkpoint component fields differ")
            for key, value in fields.items():
                a = states[name][key]
                if a.shape != value.shape or a.dtype != value.dtype or (a.dtype.kind == "f" and not np.isfinite(a).all()):
                    raise ValueError("Checkpoint component shape/dtype/finite check failed")
        self.brain.validate_state(states["brain"])
        w = states["worker"]
        if int(w["frame"]) < 0 or np.any(w["reinforcement_queue"] < 0) or float(w["retention_seconds"]) < 0 or int(w["last_mode"]) not in (0, 1, 2):
            raise ValueError("Invalid worker checkpoint counters")
        if not bool(w["terminal"]) and int(states["brain"]["clock"]) != round(int(w["frame"])*self.interval_ms/self.brain.parameters.dt_ms):
            raise ValueError("Checkpoint neural clock and frame count disagree")
        # Components perform semantic validation; roll back atomically on error.
        try:
            self.vision.restore(states["vision"])
            self.decoder.restore(states["decoder"])
            if self.plasticity:
                self.plasticity.restore(states["plasticity"])
                efficacy = states["brain"]["efficacy"]
                mask = np.ones(self.graph.e, dtype=bool); mask[self.plasticity.edge] = False
                if not np.all(efficacy[mask] == 1) or not np.allclose(efficacy[self.plasticity.edge], 1+self.plasticity.w, rtol=0, atol=1e-12):
                    raise ValueError("Checkpoint changed a nonplastic edge or efficacy is inconsistent")
            elif not np.all(states["brain"]["efficacy"] == 1):
                raise ValueError("Fixed model checkpoint altered efficacy")
            self.brain.restore(states["brain"])
        except Exception:
            self.vision.restore(expected["vision"]); self.decoder.restore(expected["decoder"])
            if self.plasticity:
                self.plasticity.restore(expected["plasticity"])
            self.brain.restore(expected["brain"])
            raise
        self.frame = int(w["frame"])
        self.reinforcement_queue[:] = w["reinforcement_queue"]
        self.last_drive[:] = w["last_drive"]
        self.terminal = bool(w["terminal"])
        self.retention_seconds = float(w["retention_seconds"])
        self.last_mode = int(w["last_mode"])
        self.memory_origin[:] = w["memory_origin"]

    def _validate_reward(self, reward):
        if type(reward) not in {int, float} or not math.isfinite(reward) or abs(reward) > self.maximum_reinforcement:
            raise ValueError("Reinforcement must be a finite signed scalar within the declared maximum; no clipping is performed")
        if reward and not np.any(self.reinforcement_drives[int(reward > 0)]):
            raise ValueError("No verified positive or negative reinforcement mapping for this reward sign")

    def _schedule_reward(self, reward):
        self._validate_reward(reward)
        if reward:
            # All slots represent the next complete pulse interval. Additive
            # superposition preserves every event's dose without hidden clipping.
            self.reinforcement_queue[:, int(reward > 0)] += abs(float(reward))

    def _advance_interval(self, drive, steps, frozen):
        if type(steps) is not int or steps < 0:
            raise ValueError("Neural interval must be nonnegative integer steps")
        total = np.zeros(self.graph.n, dtype=np.int64)
        dose = np.zeros(2)
        ledger = []
        remaining = steps
        while remaining:
            max_bin = self.plasticity.parameters.maximum_bin_seconds if self.plasticity else .01
            slot = self.brain.clock % len(self.reinforcement_queue)
            chunk = min(remaining, len(self.reinforcement_queue)-slot, max(1, math.floor(max_bin*1000/self.brain.parameters.dt_ms+1e-8)))
            amplitude = self.reinforcement_queue[slot].copy()
            changes = np.flatnonzero(np.any(self.reinforcement_queue[slot:slot+chunk] != amplitude, axis=1))
            if len(changes):
                chunk = int(changes[0])
            current = drive + amplitude @ self.reinforcement_drives
            self.reinforcement_queue[slot:slot+chunk] = 0
            counts = self.brain.advance(current, chunk, silenced=self.lesions.mask("frozen" if frozen else "training"))
            if self.plasticity:
                before = self.plasticity.w.copy()
                self.plasticity.advance(counts, chunk*self.brain.parameters.dt_ms/1000, self.brain.efficacy, frozen=frozen)
                for changed in np.flatnonzero(self.plasticity.w != before):
                    edge = self.plasticity.edge[changed]
                    ledger.append({"edgeIndex": int(edge), "sourceId": str(self.graph.ids[self.plasticity.pre[changed]]),
                                   "targetId": str(self.graph.ids[self.graph.indices[edge]]), "tick": self.brain.clock,
                                   "simTimeMs": self.brain.clock*self.brain.parameters.dt_ms,
                                   "before": float(1+before[changed]), "after": float(1+self.plasticity.w[changed]),
                                   "delta": float(self.plasticity.w[changed]-before[changed]), "kind": "plasticity_rate_bin_update"})
            total += counts; dose += amplitude*chunk*self.brain.parameters.dt_ms; remaining -= chunk
        return total, dose, ledger

    def _activity_summary(self, counts, duration_ms):
        active = np.flatnonzero(counts)
        selected = active[np.lexsort((self.graph.ids[active], -counts[active]))[:12]]
        types = self.graph.annotations.get("neuron_types")
        populations = {}
        for i in active:
            name = str(types[i]) if types is not None and types[i] else "UNANNOTATED"
            entry = populations.setdefault(name, {"activeNeurons": 0, "spikes": 0})
            entry["activeNeurons"] += 1; entry["spikes"] += int(counts[i])
        return {"sampledNeurons": [{"id": str(self.graph.ids[i]), "type": str(types[i]) if types is not None else None,
                    "spikes": int(counts[i]), "rateHz": float(counts[i]*1000/duration_ms) if duration_ms else 0.,
                    "voltageMv": float(self.brain.v[i]), "synapticMv": float(self.brain.g[i])} for i in selected],
                "samplePolicy": "up to 12 most spiking neurons; tie by exact ID", "activePopulations": populations}

    def handle(self, request):
        if not isinstance(request, dict):
            raise ValueError("Request must be a JSON object")
        op = request.get("op")
        allowed = {"reset": {"op", "preserveEfficacy"}, "step": {"op", "observation", "reinforcement", "mode"},
                   "checkpoint": {"op", "name"}, "restore": {"op", "name"}, "status": {"op"},
                   "reinforce": {"op", "reinforcement"}, "retain": {"op", "seconds"}}
        allowed["transferMemory"] = {"op", "name", "sourceIdentity"}
        if op not in allowed or set(request) - allowed[op]:
            raise ValueError("Unsupported operation or privileged/unrecognized request fields")
        if op == "status":
            return {"ok": True, "identity": self.identity, "gates": self.gates,
                    "synthetic": bool(self.graph.manifest.get("synthetic", False)), "model": "Shiu-inspired reference LIF; engineered interfaces"}
        if op == "reset":
            keep = request.get("preserveEfficacy", False)
            if type(keep) is not bool:
                raise ValueError("preserveEfficacy must be boolean")
            self.brain.reset(keep_weights=keep)
            self.vision.reset(); self.decoder.reset()
            if self.plasticity:
                if keep:
                    self.plasticity.kc_trace[:] = 0; self.plasticity.dan_trace[:] = 0
                else:
                    self.plasticity.reset()
            self.frame = 0; self.reinforcement_queue[:] = 0
            self.terminal = False; self.last_drive[:] = 0
            self.last_mode = 0
            if not keep:
                self.retention_seconds = 0.
                self.memory_origin[:] = 0
            return {"ok": True, "action": {"movement": "idle", "fire": False}, "identity": self.identity}
        if op in {"checkpoint", "restore"}:
            path = self._checkpoint_path(request["name"])
            if op == "checkpoint":
                digest = save_checkpoint(path, self.identity, self._states())
                return {"ok": True, "name": path.name, "sha256": digest}
            self._restore(load_checkpoint(path, self.identity))
            return {"ok": True, "name": path.name, "simTimeMs": self.brain.clock*self.brain.parameters.dt_ms}
        if op == "transferMemory":
            # Explicit acquisition/expression intervention transfer. All model
            # identities except lesion scope must remain exactly identical.
            source = request.get("sourceIdentity")
            if not isinstance(source, dict) or set(source) != set(self.identity) or any(source[k] != value for k,value in self.identity.items() if k != "lesions"):
                raise ValueError("Memory transfer permits only the lesion identity to differ")
            self._require_training()
            path = self._checkpoint_path(request["name"])
            self._restore(load_checkpoint(path, source))
            self.handle({"op": "reset", "preserveEfficacy": True})
            digest = file_hash(path)
            self.memory_origin[:] = np.frombuffer(bytes.fromhex(digest), dtype=np.uint8)
            return {"ok": True, "sourceCheckpointSha256": digest, "sourceIdentity": source, "identity": self.identity,
                    "transfer": "LEARNED_MEMORY_ONLY_TRANSIENTS_RESET", "plasticity": self.plasticity.summary() if self.plasticity else None}
        if op == "retain":
            if self.plasticity is None or np.any(self.reinforcement_queue):
                raise ValueError("Passive retention requires a plastic model and flushed reinforcement pulses")
            self._require_training()
            seconds = request.get("seconds")
            before = self.plasticity.w.copy()
            self.plasticity.retain(seconds, self.brain.efficacy)
            self.retention_seconds += seconds
            self.terminal = True
            ledger = [{"edgeIndex": int(self.plasticity.edge[i]), "sourceId": str(self.graph.ids[self.plasticity.pre[i]]),
                       "targetId": str(self.graph.ids[self.graph.indices[self.plasticity.edge[i]]]),
                       "tick": self.brain.clock, "simTimeMs": self.brain.clock*self.brain.parameters.dt_ms,
                       "before": float(1+before[i]), "after": float(1+self.plasticity.w[i]), "delta": float(self.plasticity.w[i]-before[i]),
                       "kind": "analytic_passive_retention", "retentionSeconds": seconds} for i in np.flatnonzero(before != self.plasticity.w)]
            return {"ok": True, "summary": {"retentionSeconds": self.retention_seconds,
                    "fullNetworkTimeMs": self.brain.clock*self.brain.parameters.dt_ms,
                    "retentionModel": "ANALYTIC_PASSIVE_ZERO_CENTERED_INPUT", "plasticity": self.plasticity.summary(),
                    "plasticityChanges": ledger, "plasticityLedger": "COMPLETE_ANALYTIC_RETENTION_UPDATES"}}
        if op == "reinforce":
            # Declared postepisode interval: hold the last observed retinal drive,
            # deliver the terminal US and eligibility updates, produce NO action.
            reward = request.get("reinforcement")
            if self.terminal or self.frame == 0 or self.plasticity is None or self.last_mode != 1:
                raise ValueError("Terminal reinforcement requires an active trained episode")
            self._validate_reward(reward)
            self._require_training()
            self._schedule_reward(reward)
            total_steps = len(self.reinforcement_queue) if np.any(self.reinforcement_queue) else 0
            total, dose, ledger = self._advance_interval(self.last_drive, total_steps, frozen=False)
            self.terminal = True
            return {"ok": True, "summary": {"activeNeurons": int(np.count_nonzero(total)), "spikes": int(total.sum()),
                    "simTimeMs": self.brain.clock*self.brain.parameters.dt_ms, "terminalNeuralMs": total_steps*self.brain.parameters.dt_ms,
                    "reinforcementDoseMs": {"negative": float(dose[0]), "positive": float(dose[1])},
                    "plasticityChanges": ledger, "plasticityLedger": "COMPLETE_RATE_BIN_EFFICACY_UPDATES",
                    **self._activity_summary(total, total_steps*self.brain.parameters.dt_ms),
                    "plasticity": self.plasticity.summary(), "evidenceForLearning": "UNKNOWN"}}
        if self.terminal:
            raise ValueError("A terminal reinforcement interval must be followed by reset before more game steps")
        mode = request.get("mode", "frozen")
        if mode not in {"frozen", "training"}:
            raise ValueError("Mode must be frozen or training")
        mode_number = 1 if mode == "training" else 2
        if self.last_mode and self.last_mode != mode_number:
            raise ValueError("Training/evaluation transitions require reset with preserveEfficacy")
        reward = request.get("reinforcement", 0)
        self._validate_reward(reward)
        if mode == "frozen" and reward != 0:
            raise ValueError("Frozen evaluation accepts no imposed reinforcement")
        if mode == "training":
            if not self.plasticity:
                raise ValueError("No experimental plasticity model is configured")
            self._require_training()
        frame = decode_observation(request["observation"])
        drive = self.vision.encode(frame, self.interval_ms)
        self.last_drive[:] = drive
        self._schedule_reward(reward)
        if mode == "frozen":
            self.reinforcement_queue[:] = 0
        target_clock = round((self.frame+1)*self.interval_ms / self.brain.parameters.dt_ms)
        total, delivered, ledger = self._advance_interval(drive, target_clock-self.brain.clock, frozen=mode == "frozen")
        self.frame += 1
        self.last_mode = 1 if mode == "training" else 2
        action = self.decoder.decode(total, self.interval_ms)
        summary = {"activeNeurons": int(np.count_nonzero(total)), "spikes": int(total.sum()),
                   "simTimeMs": self.brain.clock*self.brain.parameters.dt_ms, "frames": self.frame,
                   "neuronCount": self.graph.n, "connectionCount": self.graph.e,
                   "reinforcementDoseMs": {"negative": float(delivered[0]), "positive": float(delivered[1])},
                   "decoderRatesHz": self.decoder.rates.tolist(), "retinalSamples": self.vision.filtered.tolist(),
                   "plasticity": self.plasticity.summary() if self.plasticity else None,
                   "plasticityChanges": ledger, "plasticityLedger": "COMPLETE_RATE_BIN_EFFICACY_UPDATES",
                   **self._activity_summary(total, self.interval_ms),
                   "lesionCount": int(np.count_nonzero(self.lesions.masks[mode])),
                   "synthetic": bool(self.graph.manifest.get("synthetic", False)), "evidenceForLearning": "UNKNOWN"}
        return {"ok": True, "action": action, "summary": summary}


def _read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8")) if path else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("graph", "manifest", "vision", "decoder"):
        p.add_argument("--"+name, required=True)
    for name in ("plasticity", "parameters", "gates", "lesions"):
        p.add_argument("--"+name)
    p.add_argument("--interval-ms", type=float, default=50.)
    p.add_argument("--checkpoint-dir", default="fly-lab/runtime/neural")
    p.add_argument("--deny-root", action="append", default=[])
    p.add_argument("--allow-synthetic-fixture", action="store_true", help="Numerical/conditioning test fixtures ONLY")
    args = p.parse_args()
    try:
        session = WorkerSession(SparseGraph.load(args.graph, args.manifest), _read_json(args.vision), _read_json(args.decoder),
                                plasticity_manifest=_read_json(args.plasticity), parameters=LIFParameters(**(_read_json(args.parameters) or {})),
                                gates=_read_json(args.gates), interval_ms=args.interval_ms, checkpoint_dir=args.checkpoint_dir,
                                allow_synthetic_fixture=args.allow_synthetic_fixture, lesion_manifest=_read_json(args.lesions))
        install_filesystem_boundary(args.deny_root)
        print(json.dumps({"event": "ready", **session.handle({"op": "status"})}, allow_nan=False), file=sys.stderr, flush=True)
    except Exception as exc:
        print(json.dumps({"event": "blocked", "ok": False, "error": str(exc), "evidenceForLearning": "UNKNOWN"}), file=sys.stderr, flush=True)
        return 2
    for line in sys.stdin:
        try:
            if len(line) > 6_000_000:
                raise ValueError("Observation exceeds protocol limit")
            result = session.handle(json.loads(line))
        except Exception as exc:
            result = {"ok": False, "error": str(exc)}
        print(json.dumps(result, allow_nan=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
