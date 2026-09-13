"""A fixed engineered neural-to-Move9+fire interface, with evidence provenance."""
import math
import numpy as np
from .model import canonical_hash
from .vision import validate_mapping

MOVEMENTS = ("idle", "N", "NE", "E", "SE", "S", "SW", "W", "NW")
_DIRECTIONS = {(0, 0): "idle", (0, -1): "N", (1, -1): "NE", (1, 0): "E", (1, 1): "SE", (0, 1): "S", (-1, 1): "SW", (-1, 0): "W", (-1, -1): "NW"}


class FixedDecoder:
    def __init__(self, graph, manifest, *, assay_only=False):
        validate_mapping(graph, manifest, "engineered decoder", assay_only=assay_only)
        self.graph, self.manifest = graph, manifest
        self.weights = np.zeros((3, graph.n))
        self.threshold = np.zeros(3)
        channels = manifest.get("channels", {})
        if set(channels) != {"x", "y", "fire"}:
            raise ValueError("Decoder requires explicit x, y and fire channels")
        for i, name in enumerate(("x", "y", "fire")):
            channel = channels[name]
            if not channel.get("neurons") or not channel.get("evidence"):
                raise ValueError("Each engineered channel needs neurons and provenance")
            for term in channel["neurons"]:
                self.weights[i, graph.neuron_index(term["id"])] += float(term["gain"])
            self.threshold[i] = float(channel["thresholdHz"])
        self.tau_ms = float(manifest.get("filterMs", 100))
        if not np.isfinite(self.weights).all() or not np.isfinite(self.threshold).all() or np.any(self.threshold <= 0) or not math.isfinite(self.tau_ms) or self.tau_ms <= 0:
            raise ValueError("Invalid fixed decoder constants")
        self.identity = canonical_hash(manifest)
        self.rates = np.zeros(3)

    def reset(self):
        self.rates[:] = 0

    def decode(self, counts, interval_ms):
        if not math.isfinite(interval_ms) or interval_ms <= 0:
            raise ValueError("Invalid decoder interval")
        counts = np.asarray(counts)
        if counts.shape != (self.graph.n,) or not np.isfinite(counts).all() or np.any(counts < 0):
            raise ValueError("Invalid neural counts")
        current = self.weights @ counts * (1000 / interval_ms)
        self.rates += -math.expm1(-interval_ms / self.tau_ms) * (current - self.rates)
        x = int(self.rates[0] > self.threshold[0]) - int(self.rates[0] < -self.threshold[0])
        y = int(self.rates[1] > self.threshold[1]) - int(self.rates[1] < -self.threshold[1])
        return {"movement": _DIRECTIONS[x, y], "fire": bool(self.rates[2] > self.threshold[2])}

    def state_dict(self):
        return {"rates": self.rates.copy()}

    def restore(self, state):
        a = state.get("rates")
        if set(state) != {"rates"} or a.shape != (3,) or a.dtype != self.rates.dtype or not np.isfinite(a).all():
            raise ValueError("Invalid decoder checkpoint")
        self.rates[:] = a
