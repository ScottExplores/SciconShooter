"""Replica-level estimation; episodes of one learned brain are not replicates."""
import math
import numpy as np
from scipy import stats


def holm_adjust(p_values):
    p = np.asarray(p_values, dtype=float)
    if p.ndim != 1 or not np.isfinite(p).all() or np.any(p < 0) or np.any(p > 1):
        raise ValueError("p-values must be finite probabilities")
    order = np.argsort(p, kind="stable")
    adjusted = np.minimum(1, np.maximum.accumulate((len(p) - np.arange(len(p))) * p[order]))
    result = np.empty_like(p); result[order] = adjusted
    return result.tolist()


def paired_replica_estimate(before, after, *, seed=0, bootstrap_samples=10000, confidence=.95):
    """Input arrays are replica × matched held-out seed (or replica means)."""
    a, b = np.asarray(before, dtype=float), np.asarray(after, dtype=float)
    if a.shape != b.shape or a.ndim not in (1, 2) or not np.isfinite(a).all() or not np.isfinite(b).all() or len(a) < 2:
        raise ValueError("At least two complete paired independent replicas are required")
    if type(bootstrap_samples) is not int or not 100 <= bootstrap_samples <= 1_000_000 or not 0 < confidence < 1:
        raise ValueError("Invalid confidence/bootstrap budget")
    delta = b - a
    if delta.ndim == 2:
        if delta.shape[1] == 0:
            raise ValueError("No held-out seeds")
        delta = delta.mean(axis=1)
    n = len(delta)
    rng = np.random.Generator(np.random.PCG64(seed))
    # Bounded batches avoid allocating a bootstrap_samples × huge-cohort matrix.
    boot = np.empty(bootstrap_samples)
    for start in range(0, bootstrap_samples, 500):
        size = min(500, bootstrap_samples-start)
        boot[start:start+size] = delta[rng.integers(0, n, (size, n))].mean(axis=1)
    alpha = (1-confidence)/2
    ci = np.quantile(boot, [alpha, 1-alpha]).tolist()
    mean, sd = float(delta.mean()), float(delta.std(ddof=1))
    # Paired sign-flip randomization, two-sided, exact for n <= 18.
    if n <= 18:
        exceed = total = 0
        for start in range(0, 2**n, 4096):
            bits = (np.arange(start, min(start+4096, 2**n), dtype=np.uint64)[:, None] >> np.arange(n, dtype=np.uint64)) & 1
            values = ((2*bits.astype(float)-1)*delta).mean(axis=1)
            exceed += int(np.count_nonzero(np.abs(values) >= abs(mean)-1e-12)); total += len(values)
        p = exceed/total
        method = "exact_paired_sign_flip"
    else:
        exceed = 0
        for start in range(0, bootstrap_samples, 500):
            size = min(500, bootstrap_samples-start)
            values = ((rng.integers(0, 2, (size, n))*2-1)*delta).mean(axis=1)
            exceed += int(np.count_nonzero(np.abs(values) >= abs(mean)-1e-12))
        p = (exceed+1)/(bootstrap_samples+1)
        method = "monte_carlo_paired_sign_flip"
    return {"replicas": n, "replicaDeltas": delta.tolist(), "meanDelta": mean,
            "confidence": confidence, "bootstrapCI": ci, "pairedStandardizedEffect": mean/sd if sd > 0 else None,
            "pValue": p, "test": method, "assumption": "independent replica pairs; sign-flip exchangeability under the null",
            "learningClaim": "NOT_AUTOMATIC", "bootstrapSeed": int(seed)}


def factorial_interaction(intact_fixed, intact_plastic, shuffled_fixed, shuffled_plastic, **kwargs):
    arrays = [np.asarray(a, dtype=float) for a in (intact_fixed, intact_plastic, shuffled_fixed, shuffled_plastic)]
    if any(a.shape != arrays[0].shape for a in arrays):
        raise ValueError("Factorial conditions must share replica and evaluation-seed axes")
    intact_gain, shuffled_gain = arrays[1]-arrays[0], arrays[3]-arrays[2]
    result = paired_replica_estimate(shuffled_gain, intact_gain, **kwargs)
    result["estimand"] = "(intact_plastic - intact_fixed) - (shuffled_plastic - shuffled_fixed)"
    return result


def required_replicas(minimum_delta, paired_sd, *, power=.8, alpha=.05, comparisons=1):
    """Conservative normal approximation for a paired comparison, not a guarantee."""
    if not all(math.isfinite(v) for v in (minimum_delta, paired_sd, power, alpha)) or minimum_delta <= 0 or paired_sd <= 0 or not 0 < power < 1 or not 0 < alpha < 1 or type(comparisons) is not int or comparisons < 1:
        raise ValueError("Supply positive pilot SD/effect and valid design probabilities")
    critical = stats.norm.ppf(1-alpha/(2*comparisons)) + stats.norm.ppf(power)
    n = max(2, math.ceil((critical*paired_sd/minimum_delta)**2))
    return {"independentReplicasPerCondition": n, "powerTarget": power, "alpha": alpha,
            "minimumMeaningfulDelta": minimum_delta, "pilotPairedSD": paired_sd,
            "method": "paired_normal_approximation_bonferroni", "status": "PLANNING_ESTIMATE",
            "limitation": "Validate by simulation for the final endpoint; episodes cannot substitute for independent training replicas."}


def restricted_survival(times, censored, horizon):
    """Mean min(T,horizon) only when all censoring is administrative at horizon."""
    t, c = np.asarray(times, dtype=float), np.asarray(censored, dtype=bool)
    if t.shape != c.shape or t.ndim != 1 or len(t) == 0 or not np.isfinite(t).all() or np.any(t < 0) or not math.isfinite(horizon) or horizon <= 0:
        raise ValueError("Invalid survival observations")
    if np.any(t > horizon + 1e-8) or np.any(c & (np.abs(t-horizon) > 1e-8)):
        raise ValueError("Early censoring requires a prespecified survival analysis; do not count crashes as deaths")
    return {"restrictedMean": float(np.minimum(t, horizon).mean()), "horizon": horizon,
            "episodes": len(t), "administrativelyCensored": int(c.sum())}
