"""Sparse, deterministic reference dynamics; anatomy is never mutable efficacy.

This is a Shiu-inspired point-neuron model, not measured MaleCNS physiology.
All time is simulated time. No pixels, reward, or game state belong here.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
from typing import Mapping

import numpy as np


def canonical_hash(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def file_hash(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _readonly(value, dtype):
    value = np.array(value, dtype=dtype, copy=True)
    value.flags.writeable = False
    return value


class SparseGraph:
    """CSR rows are presynaptic; contacts remain unsigned structural counts."""

    def __init__(self, ids, indptr, indices, contacts, signs, manifest, annotations=None):
        self.ids = _readonly(ids, np.uint64)
        self.indptr = _readonly(indptr, np.int64)
        self.indices = _readonly(indices, np.int32)
        self.contacts = _readonly(contacts, np.float64)
        self.signs = _readonly(signs, np.float64)
        self.manifest = json.loads(json.dumps(manifest, allow_nan=False))
        self.annotations = {k: _readonly(v, str) for k, v in (annotations or {}).items()}
        self.n = len(self.ids)
        self.e = len(self.indices)
        if self.n == 0 or len(np.unique(self.ids)) != self.n:
            raise ValueError("Graph needs unique exact neuron IDs")
        if self.indptr.shape != (self.n + 1,) or self.indptr[0] != 0 or self.indptr[-1] != self.e or np.any(np.diff(self.indptr) < 0):
            raise ValueError("Invalid CSR pointers")
        if self.contacts.shape != (self.e,) or self.signs.shape != (self.n,):
            raise ValueError("Graph array dimensions disagree")
        if np.any(self.indices < 0) or np.any(self.indices >= self.n):
            raise ValueError("Connection endpoint outside retained graph")
        if not np.isfinite(self.contacts).all() or np.any(self.contacts <= 0) or not np.isin(self.signs, [-1, 0, 1]).all():
            raise ValueError("Contacts must be positive; modeled signs must be -1, 0, or +1")
        if any(v.shape != (self.n,) for v in self.annotations.values()):
            raise ValueError("Annotation dimensions disagree")
        h = hashlib.sha256()
        for name in ("ids", "indptr", "indices", "contacts", "signs"):
            a = getattr(self, name)
            h.update(name.encode()); h.update(a.dtype.str.encode()); h.update(memoryview(a).cast("B"))
        h.update(canonical_hash(self.manifest).encode())
        for name, a in sorted(self.annotations.items()):
            h.update(name.encode()); h.update(memoryview(a).cast("B"))
        self.identity = h.hexdigest()
        self._id_index = {int(body): i for i, body in enumerate(self.ids)}

    @classmethod
    def load(cls, path, manifest_path):
        manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
        expected = manifest.get("graph_sha256")
        if expected and file_hash(path) != expected:
            raise ValueError("Graph file hash does not match manifest")
        with np.load(path, allow_pickle=False) as z:
            keys = ("ids", "indptr", "indices", "contacts", "signs")
            annotations = {k: z[k] for k in ("neuron_types", "neuron_regions", "neurotransmitters") if k in z}
            return cls(*(z[k] for k in keys), manifest, annotations)

    def neuron_index(self, body_id):
        # Reject floating-point IDs: large connectome IDs must never round.
        if isinstance(body_id, (float, np.floating, bool)):
            raise ValueError("Neuron IDs must be exact integers or decimal strings")
        try:
            return self._id_index[int(body_id)]
        except (KeyError, ValueError, TypeError) as exc:
            raise ValueError(f"Unknown neuron ID: {body_id}") from exc

    def edge_index(self, pre_id, post_id):
        i, j = self.neuron_index(pre_id), self.neuron_index(post_id)
        lo, hi = self.indptr[i:i + 2]
        hit = np.flatnonzero(self.indices[lo:hi] == j)
        if len(hit) != 1:
            raise ValueError("Plasticity requires exactly one existing directed edge")
        return int(lo + hit[0])

    def baseline_weights(self, gain):
        result = self.contacts * gain
        for i in range(self.n):
            result[self.indptr[i]:self.indptr[i + 1]] *= self.signs[i]
        result.flags.writeable = False
        return result


@dataclass(frozen=True)
class LIFParameters:
    dt_ms: float = 0.1
    rest_mv: float = -52.0
    reset_mv: float = -52.0
    threshold_mv: float = -45.0
    membrane_ms: float = 20.0
    synapse_ms: float = 5.0
    refractory_ms: float = 2.2
    delay_ms: float = 1.8
    mv_per_contact: float = 0.275

    def __post_init__(self):
        if not all(math.isfinite(v) for v in asdict(self).values()):
            raise ValueError("All model parameters must be finite")
        if min(self.dt_ms, self.membrane_ms, self.synapse_ms, self.mv_per_contact) <= 0 or self.delay_ms < self.dt_ms or self.refractory_ms < 0:
            raise ValueError("Invalid time constants/gain")
        if self.threshold_mv <= max(self.rest_mv, self.reset_mv):
            raise ValueError("Rest and reset must be below threshold")
        for duration in (self.delay_ms, self.refractory_ms):
            if not math.isclose(duration / self.dt_ms, round(duration / self.dt_ms), abs_tol=1e-8):
                raise ValueError("Delay and refractory period must be integral timesteps")


class LIFModel:
    """Exact subthreshold evolution with sparse spike-triggered transmission.

    Schedule: evolve nonrefractory states, threshold, delayed arrivals, reset.
    Incoming synaptic writes during refractory periods are discarded. Delayed
    events store source spikes: efficacy is read when transmission is delivered.
    """

    def __init__(self, graph: SparseGraph, parameters=None):
        self.graph = graph
        self.parameters = parameters or LIFParameters()
        self.parameter_hash = canonical_hash(asdict(self.parameters))
        self.baseline = graph.baseline_weights(self.parameters.mv_per_contact)
        self.efficacy = np.ones(graph.e, dtype=np.float64)
        self.delay_steps = round(self.parameters.delay_ms / self.parameters.dt_ms)
        self.refractory_steps = round(self.parameters.refractory_ms / self.parameters.dt_ms)
        self.reset()

    def reset(self, keep_weights=False):
        self.v = np.full(self.graph.n, self.parameters.rest_mv)
        self.g = np.zeros(self.graph.n, dtype=np.float64)
        self.last_spike = np.full(self.graph.n, -10**12, dtype=np.int64)
        self.queue = np.zeros((self.delay_steps + 1, self.graph.n), dtype=np.bool_)
        self.clock = 0
        self.total_spikes = 0
        if not keep_weights:
            self.efficacy[:] = 1.0

    def advance(self, drive, steps=1, *, silenced=None):
        p = self.parameters
        drive = np.asarray(drive, dtype=np.float64)
        if drive.shape != (self.graph.n,) or not np.isfinite(drive).all():
            raise ValueError("Drive must be a finite neuron-sized vector")
        if isinstance(steps, bool) or int(steps) != steps or not 0 < steps <= 1_000_000:
            raise ValueError("steps must be a positive bounded integer")
        if silenced is not None:
            silenced = np.asarray(silenced)
            if silenced.shape != (self.graph.n,) or silenced.dtype != np.bool_:
                raise ValueError("Silencing mask must be a neuron-sized boolean vector")
            self.v[silenced] = p.reset_mv
            self.g[silenced] = 0
            self.queue[:, silenced] = False
        am, ag = math.exp(-p.dt_ms / p.membrane_ms), math.exp(-p.dt_ms / p.synapse_ms)
        cross = (p.dt_ms / p.membrane_ms * am if p.membrane_ms == p.synapse_ms
                 else p.synapse_ms / (p.membrane_ms - p.synapse_ms) * (am - ag))
        counts = np.zeros(self.graph.n, dtype=np.int64)
        for _ in range(int(steps)):
            # Brian2 timestep-based refractory release: elapsed >= refractory.
            free = self.clock - self.last_spike >= self.refractory_steps
            if silenced is not None:
                free &= ~silenced
            oldg = self.g[free]
            self.v[free] = p.rest_mv + (self.v[free] - p.rest_mv) * am + drive[free] * (1 - am) + oldg * cross
            self.g[free] = oldg * ag
            spikes = np.flatnonzero(free & (self.v > p.threshold_mv))
            counts[spikes] += 1
            due = self.queue[self.clock % len(self.queue)]
            sources = np.flatnonzero(due)
            due[:] = False
            for source in sources:
                lo, hi = self.graph.indptr[source:source + 2]
                target = self.graph.indices[lo:hi]
                selected = free[target]
                np.add.at(self.g, target[selected], self.baseline[lo:hi][selected] * self.efficacy[lo:hi][selected])
            self.queue[(self.clock + self.delay_steps) % len(self.queue), spikes] = True
            self.v[spikes] = p.reset_mv
            self.g[spikes] = 0
            self.last_spike[spikes] = self.clock
            self.clock += 1
        self.total_spikes += int(counts.sum())
        return counts

    def state_dict(self):
        return {"v": self.v.copy(), "g": self.g.copy(), "last_spike": self.last_spike.copy(),
                "queue": self.queue.copy(), "efficacy": self.efficacy.copy(),
                "clock": np.array(self.clock, dtype=np.int64), "total_spikes": np.array(self.total_spikes, dtype=np.int64)}

    def validate_state(self, state):
        expected = self.state_dict()
        if set(state) != set(expected):
            raise ValueError("Incomplete neural checkpoint")
        for k, a in state.items():
            if a.shape != expected[k].shape or a.dtype != expected[k].dtype:
                raise ValueError(f"Checkpoint shape/dtype mismatch: {k}")
            if a.dtype.kind == "f" and not np.isfinite(a).all():
                raise ValueError("Nonfinite checkpoint")
        if int(state["clock"]) < 0 or int(state["total_spikes"]) < 0 or np.any(state["efficacy"] < 0):
            raise ValueError("Invalid checkpoint counters/efficacy")

    def restore(self, state):
        self.validate_state(state)
        for k in ("v", "g", "last_spike", "queue", "efficacy"):
            setattr(self, k, state[k].copy())
        self.clock, self.total_spikes = int(state["clock"]), int(state["total_spikes"])


def save_checkpoint(path, identity: Mapping, states: Mapping[str, Mapping[str, np.ndarray]]):
    """Non-pickle NPZ plus SHA256; caller supplies ALL component states/identities."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {f"{component}__{key}": np.asarray(value) for component, state in states.items() for key, value in state.items()}
    if any(a.dtype.hasobject for a in payload.values()):
        raise ValueError("Object arrays/pickle are forbidden")
    payload["metadata"] = np.frombuffer(json.dumps({"version": 1, "identity": identity}, sort_keys=True, allow_nan=False).encode(), dtype=np.uint8)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            np.savez_compressed(stream, **payload)
            stream.flush(); os.fsync(stream.fileno())
        digest = file_hash(temporary)
        os.replace(temporary, path)
        checksum = path.with_suffix(path.suffix + ".sha256")
        checksum_tmp = checksum.with_suffix(checksum.suffix + ".tmp")
        checksum_tmp.write_text(digest + "\n", encoding="ascii")
        os.replace(checksum_tmp, checksum)
        return digest
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_checkpoint(path, identity):
    path = Path(path)
    expected = path.with_suffix(path.suffix + ".sha256").read_text(encoding="ascii").strip()
    if file_hash(path) != expected:
        raise ValueError("Checkpoint checksum mismatch")
    with np.load(path, allow_pickle=False) as z:
        meta = json.loads(z["metadata"].tobytes())
        if meta != {"version": 1, "identity": identity}:
            raise ValueError("Checkpoint source/model/mapping identity mismatch")
        states = {}
        for key in z.files:
            if key == "metadata":
                continue
            component, field = key.split("__", 1)
            states.setdefault(component, {})[field] = z[key].copy()
    return states
