"""Optional allocation-reduced implementation of the reference LIF equations.

This backend is not selected by the worker. It retains every cell and edge,
uses float64 NumPy operations in the reference arithmetic order, and preserves
the reference event schedule. Scratch buffers are not checkpoint state.
"""
from __future__ import annotations

import math
import numpy as np

from .model import LIFModel


class FastLIFModel(LIFModel):
    """Preallocated dense evolution with unchanged sparse transmission."""

    backend_version = "numpy-preallocated-lif-v1"

    def reset(self, keep_weights=False):
        super().reset(keep_weights=keep_weights)
        n = self.graph.n
        self._elapsed = np.empty(n, dtype=np.int64)
        self._free = np.empty(n, dtype=np.bool_)
        self._spiking = np.empty(n, dtype=np.bool_)
        self._voltage = np.empty(n, dtype=np.float64)
        self._synaptic = np.empty(n, dtype=np.float64)
        self._drive = np.empty(n, dtype=np.float64)

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
        # The public reference API permits drive to alias v or g. Preserve its
        # changing-drive semantics rather than caching that special case.
        changing_drive = np.shares_memory(drive, self.v) or np.shares_memory(drive, self.g)
        if not changing_drive:
            np.multiply(drive, 1 - am, out=self._drive)
        for _ in range(int(steps)):
            np.subtract(self.clock, self.last_spike, out=self._elapsed)
            np.greater_equal(self._elapsed, self.refractory_steps, out=self._free)
            if silenced is not None:
                self._free[silenced] = False
            free = self._free
            if changing_drive:
                np.multiply(drive, 1 - am, out=self._drive)
            # Keep the exact order of the four terms in LIFModel.advance; no
            # fused operations, reduced precision, or event/edge reordering.
            np.subtract(self.v, p.rest_mv, out=self._voltage)
            np.multiply(self._voltage, am, out=self._voltage)
            np.add(p.rest_mv, self._voltage, out=self._voltage)
            np.add(self._voltage, self._drive, out=self._voltage)
            np.multiply(self.g, cross, out=self._synaptic)
            np.add(self._voltage, self._synaptic, out=self._voltage)
            np.copyto(self.v, self._voltage, where=free)
            np.multiply(self.g, ag, out=self.g, where=free)
            np.greater(self.v, p.threshold_mv, out=self._spiking)
            np.logical_and(free, self._spiking, out=self._spiking)
            spikes = np.flatnonzero(self._spiking)
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
