"""Experimental compartment-restricted KC--DAN timing rule.

Inspired by Huang, Luo et al. Nature 2024 (doi:10.1038/s41586-024-07819-w)
and Hige et al. Neuron 2015 (doi:10.1016/j.neuron.2015.11.003). This is an
explicit new whole-graph adaptation, not a reproduction of either experiment.
No MBON postsynaptic-spike or game-success term enters the update.
"""
from dataclasses import asdict, dataclass
import math
import re
import numpy as np
from .model import canonical_hash


@dataclass(frozen=True)
class PlasticityParameters:
    kc_trace_seconds: float = 1.0
    dan_trace_seconds: float = 1.0
    memory_seconds: float = 1800.0
    efficacy_seconds: float = 0.05
    eta: float = 0.001
    minimum_fraction: float = 0.1
    maximum_fraction: float = 2.0
    maximum_bin_seconds: float = 0.01

    def __post_init__(self):
        if not all(math.isfinite(v) for v in asdict(self).values()):
            raise ValueError("Nonfinite plasticity parameter")
        if min(self.kc_trace_seconds, self.dan_trace_seconds, self.memory_seconds, self.efficacy_seconds, self.maximum_bin_seconds) <= 0:
            raise ValueError("Plasticity timescales must be positive")
        if self.memory_seconds <= self.efficacy_seconds or self.eta < 0 or not 0 < self.minimum_fraction <= 1 <= self.maximum_fraction:
            raise ValueError("Invalid efficacy bounds or memory timescales")


class CompartmentPlasticity:
    def __init__(self, graph, manifest, parameters=None):
        self.graph = graph
        self.manifest = manifest
        self.parameters = parameters or PlasticityParameters(**manifest.get("parameters", {}))
        if manifest.get("graphHash") != graph.identity:
            raise ValueError("Plasticity manifest graph mismatch")
        entries = manifest.get("edges", [])
        if not entries:
            raise ValueError("No verified existing KC-to-MBON edges were supplied")
        self.edge = np.array([graph.edge_index(e["kcId"], e["mbonId"]) for e in entries], dtype=np.int64)
        self.pre = np.array([graph.neuron_index(e["kcId"]) for e in entries], dtype=np.int64)
        if len(np.unique(self.edge)) != len(entries) or not np.all(graph.signs[self.pre] == 1):
            raise ValueError("Plastic edges must be unique excitatory KC edges")
        dan_ids = sorted({str(d["id"]) for e in entries for d in e.get("dan", [])})
        if not dan_ids:
            raise ValueError("Plastic edges require identified compartment DAN coupling")
        self.dan = np.array([graph.neuron_index(i) for i in dan_ids], dtype=np.int64)
        self.coupling = np.zeros((len(entries), len(dan_ids)))
        for i, e in enumerate(entries):
            if not e.get("compartment") or not e.get("evidence"):
                raise ValueError("Compartment and evidence are mandatory for each plastic edge")
            for d in e["dan"]:
                g = float(d["gain"])
                if not math.isfinite(g) or g <= 0:
                    raise ValueError("DAN coupling must be positive and finite")
                self.coupling[i, dan_ids.index(str(d["id"]))] += g
        if not graph.manifest.get("synthetic", False):
            types = graph.annotations.get("neuron_types")
            if types is None:
                raise ValueError("Real graphs require cell-type annotations")
            for e, kc in zip(entries, self.pre):
                mb = graph.neuron_index(e["mbonId"])
                if not re.match(r"^(KC|Kenyon)", types[kc], re.I) or not re.match(r"^MBON", types[mb], re.I):
                    raise ValueError("Cell annotations do not verify a KC-to-MBON edge")
            if any(not re.match(r"^(PPL|PAM|DAN)", types[d], re.I) for d in self.dan):
                raise ValueError("Cell annotations do not identify the nominated DANs")
        baseline = manifest.get("danBaselineHz", {})
        self.dan_baseline = np.array([float(baseline.get(i, 0)) for i in dan_ids])
        if not np.isfinite(self.dan_baseline).all() or np.any(self.dan_baseline < 0):
            raise ValueError("Invalid declared DAN baseline")
        self.identity = canonical_hash({"manifest": manifest, "parameters": asdict(self.parameters)})
        self.reset()

    def reset(self):
        self.kc_trace = np.zeros(len(self.edge))
        self.dan_trace = np.zeros(len(self.dan))
        self.u = np.zeros(len(self.edge))
        self.w = np.zeros(len(self.edge))

    def advance(self, counts, dt_seconds, efficacy, *, frozen=False):
        p = self.parameters
        if not math.isfinite(dt_seconds) or not 0 < dt_seconds <= p.maximum_bin_seconds + 1e-12:
            raise ValueError("Plasticity interval exceeds configured rate bin")
        if frozen:
            return  # Freeze traces, passive decay AND efficacies, not only eta.
        counts = np.asarray(counts)
        if counts.shape != (self.graph.n,) or not np.isfinite(counts).all() or np.any(counts < 0):
            raise ValueError("Invalid spike counts")
        h = dt_seconds
        kc = counts[self.pre] / h
        dan = counts[self.dan] / h - self.dan_baseline
        ak, ad = math.exp(-h / p.kc_trace_seconds), math.exp(-h / p.dan_trace_seconds)
        kmid = self.kc_trace * math.sqrt(ak) + kc * (1 - math.sqrt(ak))
        dmid = self.dan_trace * math.sqrt(ad) + dan * (1 - math.sqrt(ad))
        forcing = p.eta * (kc * (self.coupling @ dmid) - (self.coupling @ dan) * kmid)
        self.kc_trace[:] = self.kc_trace * ak + kc * (1 - ak)
        self.dan_trace[:] = self.dan_trace * ad + dan * (1 - ad)
        eu, ew = math.exp(-h / p.memory_seconds), math.exp(-h / p.efficacy_seconds)
        c = p.memory_seconds / (p.memory_seconds - p.efficacy_seconds) * (eu - ew)
        old_u = self.u.copy()
        self.u[:] = old_u * eu + forcing * p.memory_seconds * (-math.expm1(-h / p.memory_seconds))
        self.w[:] = self.w * ew + old_u * c + forcing * p.memory_seconds * (-math.expm1(-h / p.efficacy_seconds) - c)
        np.clip(self.u, p.minimum_fraction - 1, p.maximum_fraction - 1, out=self.u)
        np.clip(self.w, p.minimum_fraction - 1, p.maximum_fraction - 1, out=self.w)
        efficacy[self.edge] = 1 + self.w

    def state_dict(self):
        return {k: getattr(self, k).copy() for k in ("kc_trace", "dan_trace", "u", "w")}

    def retain(self, seconds, efficacy):
        """Analytic passive retention with zero KC and centered DAN input.

        This advances the DECLARED experimental memory rule, not a sleeping
        simulated animal. No full-network activity is integrated. Frozen
        evaluation never calls this method. Trace decay and lagged efficacy
        relaxation are included, so this is not just multiplying weights.
        """
        if type(seconds) not in {int, float} or not math.isfinite(seconds) or not 0 <= seconds <= 604800:
            raise ValueError("Retention must be finite modeled seconds in [0,604800]")
        p = self.parameters
        eu, ew = math.exp(-seconds / p.memory_seconds), math.exp(-seconds / p.efficacy_seconds)
        cross = p.memory_seconds / (p.memory_seconds-p.efficacy_seconds) * (eu-ew)
        self.w[:] = self.w*ew + self.u*cross
        self.u *= eu
        self.kc_trace *= math.exp(-seconds/p.kc_trace_seconds)
        self.dan_trace *= math.exp(-seconds/p.dan_trace_seconds)
        np.clip(self.w, p.minimum_fraction-1, p.maximum_fraction-1, out=self.w)
        efficacy[self.edge] = 1+self.w

    def restore(self, state):
        expected = self.state_dict()
        if set(state) != set(expected) or any(state[k].shape != v.shape or state[k].dtype != v.dtype or not np.isfinite(state[k]).all() for k, v in expected.items()):
            raise ValueError("Invalid plasticity checkpoint")
        p = self.parameters
        if any(np.any(state[k] < p.minimum_fraction - 1) or np.any(state[k] > p.maximum_fraction - 1) for k in ("u", "w")):
            raise ValueError("Plasticity checkpoint exceeds bounds")
        for k in expected:
            getattr(self, k)[:] = state[k]

    def summary(self):
        return {"eligibleEdges": len(self.edge), "changedEdges": int(np.count_nonzero(np.abs(self.w) > 1e-12)),
                "meanEfficacy": float(np.mean(1 + self.w)), "minEfficacy": float(np.min(1 + self.w)),
                "maxEfficacy": float(np.max(1 + self.w)), "interpretation": "EXPERIMENTAL_MODEL"}
