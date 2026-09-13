"""Small deterministic graded-circuit diagnostic, not validated fly physiology.

The state is deviation from an assumed adapted operating point. Presynaptic
release is ``r = clip(r0 + v, 0, rmax)``. The equations are
``tau_v * dv/dt = -v + u + W @ (r - r0) - a`` and
``tau_a * da/dt = -a + alpha * v``. Removing baseline synaptic current makes
v=a=0 an exact equilibrium for zero input; this is an engineering assumption,
not a fitted tonic-current measurement. Release has arbitrary model units.

All updates use old states simultaneously and explicit Euler integration.
The timestep bound is an accuracy precaution, NOT a recurrent stability proof.
Anatomical contacts are never normalized, masked, or modified in place.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
import math
from numbers import Real

import numpy as np

from .model import SparseGraph, canonical_hash


def _numeric(value, name):
    raw = np.asarray(value)
    if raw.dtype.kind not in "fiu" or raw.ndim > 1:
        raise ValueError(f"{name} must be a numeric scalar or vector")
    result = np.array(raw, dtype=np.float64, copy=True)
    if not np.isfinite(result).all():
        raise ValueError(f"{name} must be finite")
    result.flags.writeable = False
    return result


def _vector(value, length, name):
    result = _numeric(value, name)
    if result.ndim == 0:
        result = np.full(length, float(result), dtype=np.float64)
    elif result.shape != (length,):
        raise ValueError(f"{name} must have shape ({length},)")
    result.flags.writeable = False
    return result


@dataclass(frozen=True)
class GradedParameters:
    """Declared engineering parameters; neuron fields accept scalar or vector."""

    dt_ms: float = 0.1
    tau_v_ms: object = 20.0
    tau_a_ms: object = 100.0
    baseline_release: object = 1.0
    maximum_release: object = 10.0
    adaptation_strength: object = 0.0

    def __post_init__(self):
        if (isinstance(self.dt_ms, (bool, np.bool_)) or not isinstance(self.dt_ms, Real)
                or not math.isfinite(self.dt_ms) or self.dt_ms <= 0):
            raise ValueError("dt_ms must be a finite positive scalar")
        object.__setattr__(self, "dt_ms", float(self.dt_ms))
        for field in fields(self):
            if field.name == "dt_ms":
                continue
            value = _numeric(getattr(self, field.name), field.name)
            if field.name in {"tau_v_ms", "tau_a_ms", "maximum_release"}:
                if np.any(value <= 0):
                    raise ValueError(f"{field.name} must be positive")
            elif np.any(value < 0):
                raise ValueError(f"{field.name} must be nonnegative")
            object.__setattr__(self, field.name, float(value) if value.ndim == 0 else value)


class GradedModel:
    """Dense target-by-source transmission for explicitly bounded small circuits.

    SparseGraph CSR rows are presynaptic. Each anatomical edge contributes
    sign[pre] * contacts[edge] * edge_gains[edge] * edge_mask[edge]
    to W[post, pre]. Repeated edges add; zero transmitter signs remain zero.
    The boolean mask enables transmission; False blocks it without altering
    contact counts or cell dynamics. The baseline-release subtraction also
    applies to lesions, retaining the same engineered adapted operating point.
    """

    backend_version = "graded-deviation-euler-v1"
    maximum_dense_neurons = 2048

    def __init__(self, graph: SparseGraph, parameters=None, *, edge_gains, edge_mask=None):
        if not isinstance(graph, SparseGraph):
            raise ValueError("graph must be a validated SparseGraph")
        if graph.n > self.maximum_dense_neurons:
            raise ValueError("Dense graded diagnostic is limited to 2048 neurons")
        parameters = parameters if parameters is not None else GradedParameters()
        if not isinstance(parameters, GradedParameters):
            raise ValueError("parameters must be GradedParameters")
        self.graph = graph
        normalized = {field.name: _vector(getattr(parameters, field.name), graph.n, field.name)
                      for field in fields(parameters) if field.name != "dt_ms"}
        self.parameters = GradedParameters(dt_ms=parameters.dt_ms, **normalized)
        p = self.parameters
        if np.any(p.baseline_release > p.maximum_release):
            raise ValueError("baseline_release must not exceed maximum_release")
        if p.dt_ms > min(float(p.tau_v_ms.min()), float(p.tau_a_ms.min())) / 10:
            raise ValueError("dt_ms must be at most min(tau_v_ms, tau_a_ms) / 10")
        self.parameter_manifest = {"dt_ms": p.dt_ms, **{name: value.tolist() for name, value in normalized.items()}}
        self.parameter_hash = canonical_hash(self.parameter_manifest)

        self.edge_gains = _vector(edge_gains, graph.e, "edge_gains")
        if np.any(self.edge_gains < 0):
            raise ValueError("edge_gains must be nonnegative; signs belong to modeled connection effects")
        if edge_mask is None:
            edge_mask = np.ones(graph.e, dtype=np.bool_)
        mask = np.asarray(edge_mask)
        if mask.shape != (graph.e,) or mask.dtype != np.bool_:
            raise ValueError("edge_mask must be an edge-sized boolean vector")
        self.edge_mask = np.array(mask, copy=True)
        self.edge_mask.flags.writeable = False
        pre = np.repeat(np.arange(graph.n), np.diff(graph.indptr))
        with np.errstate(over="ignore", invalid="ignore"):
            weighted_edges = graph.contacts * graph.signs[pre] * self.edge_gains * self.edge_mask
        if not np.isfinite(weighted_edges).all():
            raise ValueError("Modeled edge weights overflowed")
        transmission = np.zeros((graph.n, graph.n), dtype=np.float64)
        with np.errstate(over="ignore", invalid="ignore"):
            np.add.at(transmission, (graph.indices, pre), weighted_edges)
        if not np.isfinite(transmission).all():
            raise ValueError("Summed modeled edge weights overflowed")
        transmission.flags.writeable = False
        self.transmission = transmission
        self.connection_hash = canonical_hash({"graphIdentity": graph.identity,
                                                "edgeGains": self.edge_gains.tolist(),
                                                "edgeMask": self.edge_mask.tolist(),
                                                "orientation": "target-by-source"})
        self.reset()

    @property
    def v(self):
        return self._v.copy()

    @property
    def a(self):
        return self._a.copy()

    @property
    def release(self):
        p = self.parameters
        return np.clip(p.baseline_release + self._v, 0, p.maximum_release)

    def reset(self):
        self._v = np.zeros(self.graph.n, dtype=np.float64)
        self._a = np.zeros(self.graph.n, dtype=np.float64)
        self.clock = 0
        return self.state_dict()

    def state_dict(self):
        return {"v": self.v, "a": self.a, "release": self.release,
                "clock": np.array(self.clock, dtype=np.int64)}

    def advance(self, drive, steps=1):
        """Hold an input vector constant; atomically return a copied final state.

        A nonfinite update raises without committing a partial batch. No random
        stream, plasticity, reward, sensory polarity, or game state exists here.
        """
        drive = _numeric(drive, "drive")
        if drive.shape != (self.graph.n,):
            raise ValueError("drive must be a neuron-sized vector")
        if (isinstance(steps, (bool, np.bool_)) or not isinstance(steps, (int, np.integer))
                or not 0 < steps <= 1_000_000):
            raise ValueError("steps must be a positive integer no greater than 1000000")
        p = self.parameters
        v, a = self._v.copy(), self._a.copy()
        for _ in range(int(steps)):
            with np.errstate(over="ignore", invalid="ignore"):
                release = np.clip(p.baseline_release + v, 0, p.maximum_release)
                current = self.transmission @ (release - p.baseline_release)
                next_v = v + (p.dt_ms / p.tau_v_ms) * (-v + drive + current - a)
                next_a = a + (p.dt_ms / p.tau_a_ms) * (-a + p.adaptation_strength * v)
            if not np.isfinite(next_v).all() or not np.isfinite(next_a).all():
                raise FloatingPointError("Nonfinite graded dynamics; batch was not committed")
            v, a = next_v, next_a
        self._v, self._a = v, a
        self.clock += int(steps)
        return self.state_dict()
