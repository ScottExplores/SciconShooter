"""Explicit controls: constrained anatomy randomization and timing-matched actions."""
from copy import deepcopy
import json
import numpy as np
from .model import SparseGraph, canonical_hash
from .decoder import MOVEMENTS


class LesionProtocol:
    """Preregistered idealized cell silencing, independent of game outcomes.

    Acquisition acts during training (including terminal US); expression acts
    only during frozen evaluation. Anatomy/efficacy are retained. This clamp
    is an engineered intervention, not a model of a particular genetic tool.
    """
    def __init__(self, graph, manifest=None):
        self.manifest = deepcopy(manifest)
        self.masks = {phase: np.zeros(graph.n, dtype=bool) for phase in ("training", "frozen")}
        if manifest is not None:
            if manifest.get("graphHash") != graph.identity or not manifest.get("evidence"):
                raise ValueError("Lesions require a matching graph and explicit nomination evidence")
            entries = manifest.get("lesions", [])
            if not entries:
                raise ValueError("Lesion manifest has no nominated cells")
            for entry in entries:
                scope = entry.get("scope")
                if scope not in {"acquisition", "expression", "both"} or not entry.get("neuronIds"):
                    raise ValueError("Lesion needs neuronIds and acquisition/expression/both scope")
                ids = [graph.neuron_index(body) for body in entry["neuronIds"]]
                for phase in ("training", "frozen"):
                    if scope == "both" or scope == {"training": "acquisition", "frozen": "expression"}[phase]:
                        self.masks[phase][ids] = True
        for mask in self.masks.values():
            mask.flags.writeable = False
        self.identity = canonical_hash(manifest)

    def mask(self, mode):
        if mode not in self.masks:
            raise ValueError("Unknown lesion phase")
        value = self.masks[mode]
        return value if np.any(value) else None


def constrained_shuffle(graph, seed, swaps_per_edge=5, strata=None, protected_edges=None):
    """Directed double-edge swaps preserve in/out-degree and edge-weight source.

    Swaps occur only within identical pre/post strata AND identical contact
    counts. Consequently per-neuron weighted input/output strengths are also
    preserved. Never permit new loops or parallel edges. Unsuccessful swaps
    are reported; a low-mixing control must not be treated as a valid null.
    Caller supplies frozen hemisphere/type strata; absent strata use NT sign.
    Optional protected_edges are unique exact edge indices in the INPUT graph.
    Their source/target/contact mapping is retained; output CSR sorting may
    change their numeric indices. Protected anatomy limits inference to the
    remaining topology conditional on those frozen connections.
    """
    if not np.isfinite(swaps_per_edge) or not 0 <= swaps_per_edge <= 100:
        raise ValueError("Invalid swap budget")
    strata = list(map(str, graph.signs if strata is None else strata))
    if len(strata) != graph.n:
        raise ValueError("Strata must identify every neuron")
    protected = np.asarray([] if protected_edges is None else protected_edges)
    mixed_booleans = isinstance(protected_edges, (list, tuple)) and any(isinstance(value, (bool, np.bool_)) for value in protected_edges)
    if protected.ndim != 1 or (protected.size and protected.dtype.kind not in "iu") or mixed_booleans:
        raise ValueError("Protected edges must be a vector of exact integer edge indices")
    if np.any(protected < 0) or np.any(protected >= graph.e) or len(np.unique(protected)) != len(protected):
        raise ValueError("Protected edge indices must be unique and inside the input graph")
    protected = np.sort(protected.astype(np.int64))
    protected_hash = canonical_hash({"parentGraphHash": graph.identity, "edgeIndices": protected.tolist()})
    protected_mask = np.zeros(graph.e, dtype=bool) if len(protected) else None
    if protected_mask is not None:
        protected_mask[protected] = True
    pre = np.repeat(np.arange(graph.n, dtype=np.int32), np.diff(graph.indptr))
    post = graph.indices.copy()
    # Encoded directed pairs avoid millions of Python two-integer tuples on
    # the full graph. This is still an offline, memory-budgeted operation.
    existing = {int(a)*graph.n+int(b) for a,b in zip(pre,post)}
    if len(existing) != graph.e:
        raise ValueError("Shuffle requires merged duplicate connections")
    groups = {}
    for e, (a, b) in enumerate(zip(pre, post)):
        if protected_mask is not None and protected_mask[e]:
            continue
        key = (strata[a], strata[b], float(graph.contacts[e]), float(graph.signs[a]))
        groups.setdefault(key, []).append(e)
    for key in groups:
        groups[key] = np.asarray(groups[key], dtype=np.int64)
    rng = np.random.Generator(np.random.PCG64(seed))
    accepted = attempted = 0
    for group in groups.values():
        if len(group) < 2:
            continue
        for _ in range(round(len(group) * swaps_per_edge)):
            attempted += 1
            e, f = group[rng.choice(len(group), 2, replace=False)]
            a, b, c, d = int(pre[e]), int(post[e]), int(pre[f]), int(post[f])
            if a == c or b == d or a == d or c == b or a*graph.n+d in existing or c*graph.n+b in existing:
                continue
            existing.remove(a*graph.n+b); existing.remove(c*graph.n+d)
            existing.add(a*graph.n+d); existing.add(c*graph.n+b)
            post[e], post[f] = d, b
            accepted += 1
    order = np.lexsort((post, pre))
    manifest = deepcopy(graph.manifest)
    manifest.pop("graph_sha256", None)
    manifest.update({"control": "constrained_double_edge_swap", "parentGraphHash": graph.identity, "shuffleSeed": int(seed),
                     "protectedInputEdgeIndices": protected.tolist(), "protectedMappingHash": protected_hash})
    shuffled = SparseGraph(graph.ids, graph.indptr, post[order], graph.contacts[order], graph.signs, manifest, graph.annotations)
    changed = sum(int(a)*graph.n+int(b) not in existing for a,b in zip(pre,graph.indices))
    report = {"attemptedSwaps": attempted, "acceptedSwaps": accepted, "changedConnections": changed,
              "changedFraction": changed / graph.e if graph.e else 0, "seed": int(seed),
              "protectedConnections": len(protected), "protectedFraction": len(protected)/graph.e if graph.e else 0,
              "protectedMappingHash": protected_hash, "mutableConnections": graph.e-len(protected),
              "changedMutableFraction": changed/(graph.e-len(protected)) if graph.e > len(protected) else 0,
              "inferenceScope": "remaining topology conditional on protected connections" if len(protected) else "retained topology within declared shuffle constraints",
              "invariants": ["in_degree", "out_degree", "weighted_in_strength", "weighted_out_strength", "stratum_pair_contact_distribution", "no_new_loops", "no_parallel_edges"],
              "activityMatching": "NOT_RUN", "mixingAdequacy": "REQUIRES_PREREGISTERED_THRESHOLD"}
    return shuffled, report


def yoked_schedule(schedule, seed, minimum_shift_bins=1):
    """Circularly shift exact doses independently of the recipient's outcomes."""
    values = np.asarray(schedule, dtype=np.float64)
    if values.ndim != 1 or not np.isfinite(values).all():
        raise ValueError("Schedule must be a finite vector")
    if type(minimum_shift_bins) is not int or minimum_shift_bins < 1 or len(values) < 2 * minimum_shift_bins + 1:
        raise ValueError("Too few bins for the declared temporal separation")
    rng = np.random.Generator(np.random.PCG64(seed))
    shift = int(rng.integers(minimum_shift_bins, len(values) - minimum_shift_bins + 1))
    return np.roll(values, shift), {"shiftBins": shift, "dose": float(values.sum()), "seed": int(seed), "recipientDependent": False}


class TimingMatchedRandom:
    """Random permutations of observed action bouts preserve joint dwell times.

    Use a preregistered calibration/fixed-policy sequence, never held-out test
    results. Exact action occupancy and fire duty cycle are preserved per cycle;
    the ordering changes. Temporal autocorrelation is measured, not promised.
    """
    def __init__(self, calibration_actions, seed):
        if not calibration_actions:
            raise ValueError("A calibration sequence is required")
        self.bouts = []
        for action in calibration_actions:
            if set(action) != {"movement", "fire"} or action["movement"] not in MOVEMENTS or type(action["fire"]) is not bool:
                raise ValueError("Invalid Move9+fire calibration action")
            value = (action["movement"], action["fire"])
            if self.bouts and self.bouts[-1][0] == value:
                self.bouts[-1] = (value, self.bouts[-1][1] + 1)
            else:
                self.bouts.append((value, 1))
        self.rng = np.random.Generator(np.random.PCG64(seed))
        self.order = self.rng.permutation(len(self.bouts))
        self.cursor = self.elapsed = 0

    def next_action(self):
        if self.cursor == len(self.order):
            self.order = self.rng.permutation(len(self.bouts)); self.cursor = self.elapsed = 0
        (movement, fire), duration = self.bouts[self.order[self.cursor]]
        self.elapsed += 1
        if self.elapsed == duration:
            self.cursor += 1; self.elapsed = 0
        return {"movement": movement, "fire": fire}

    def state_dict(self):
        return {"order": self.order.copy(), "cursor": np.array(self.cursor, dtype=np.int64),
                "elapsed": np.array(self.elapsed, dtype=np.int64),
                "rng": np.frombuffer(json.dumps(self.rng.bit_generator.state, sort_keys=True).encode(), dtype=np.uint8).copy()}

    def restore(self, state):
        order = state["order"]
        cursor, elapsed = int(state["cursor"]), int(state["elapsed"])
        if set(state) != {"order", "cursor", "elapsed", "rng"} or sorted(order.tolist()) != list(range(len(self.bouts))) or not 0 <= cursor <= len(order):
            raise ValueError("Invalid random-control checkpoint")
        if elapsed < 0 or (cursor == len(order) and elapsed != 0) or (cursor < len(order) and elapsed >= self.bouts[order[cursor]][1]):
            raise ValueError("Invalid action-bout cursor")
        rng = np.random.Generator(np.random.PCG64())
        rng.bit_generator.state = json.loads(state["rng"].tobytes())
        self.rng, self.order, self.cursor, self.elapsed = rng, order.copy(), cursor, elapsed
