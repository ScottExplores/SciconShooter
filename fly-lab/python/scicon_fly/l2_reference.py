"""Numerical re-expression of the author's L2 latent feedback model.

Source: ClandininLab/L1L2-recurrent-feedback commit
7fa5829e37d566e02beaaa87efd6a0f1de4e48c0, flash notebook cells 4 and 8.
This module was written from static inspection; it neither executes that
notebook nor loads experimental responses. It is not a MaleCNS circuit,
physiological validation, learned policy, or fit to biological data.

The input at index i advances old state i-1 to state i, matching the author's
discrete indexing. Index zero describes initial state; stimulus[0] is unused.
v and y update simultaneously by explicit Euler. The observation is an affine
latent-to-fluorescence proxy, not an explicit voltage-indicator/exposure model.
Finite trajectories do not establish dynamical stability or integration accuracy.
"""
from __future__ import annotations

from dataclasses import dataclass, fields
import math
from numbers import Real
from typing import Literal

import numpy as np


def _finite_scalar(value, name: str) -> float:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, Real):
        raise ValueError(f"{name} must be a finite real scalar")
    try:
        result = float(value)
    except OverflowError as exc:
        raise ValueError(f"{name} must fit a finite float64 scalar") from exc
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite real scalar")
    return result


@dataclass(frozen=True)
class L2ReferenceParameters:
    """All parameters explicit, with time constants in seconds.

    tv_s and ty_s must be positive; g must lie in [0, 1]. Unlike the author
    notebook, invalid g is rejected rather than clipped. Remaining parameters
    are finite signed scalars, reflecting the author's unconstrained numerical
    family. Any physiological or fitting bounds belong in the caller's protocol.
    No published fitted values are installed as hidden defaults.
    """

    tv_s: float
    ty_s: float
    w: float
    g: float
    input_positive: float
    input_negative: float
    output_bias: float
    output_gain: float

    def __post_init__(self):
        for field in fields(self):
            object.__setattr__(self, field.name,
                               _finite_scalar(getattr(self, field.name), field.name))
        if self.tv_s <= 0 or self.ty_s <= 0:
            raise ValueError("tv_s and ty_s must be positive")
        if not 0 <= self.g <= 1:
            raise ValueError("g must be in [0, 1]; parameters are not clipped")


@dataclass(frozen=True)
class L2ReferenceResult:
    """Full float64 trajectories, with read-only arrays and initial state included."""

    v: np.ndarray
    y: np.ndarray
    fluorescence: np.ndarray

    @property
    def pred(self) -> np.ndarray:
        """Alias for the predicted fluorescence, in the caller's declared units."""
        return self.fluorescence


def simulate_l2_reference(
    parameters: L2ReferenceParameters,
    stimulus,
    *,
    dt_s: float,
    initial_v: float,
    initial_y: float = 0.0,
    feedback: bool = True,
    first_sample_mode: Literal["observation", "author_target_anchor"] = "observation",
) -> L2ReferenceResult:
    """Integrate explicit initial state against a finite, nonempty 1-D input.

    For each index i>=1, with both derivatives evaluated on the previous state:

      dy/dt = (-y + v * ((1-g) if v>0 else g)) / ty_s
      dv/dt = (-v - w*y - stimulus[i]*polarity_gain) / tv_s

    polarity_gain is input_positive for stimulus[i]>0, input_negative otherwise.
    feedback=False requires initial_y=0 and keeps y exactly zero; it does not
    silently discard a requested feedback initial state.

    Normally every prediction is -output_gain*(v+output_bias). In the explicit
    author_target_anchor mode ONLY the first prediction is -initial_v. To
    reproduce the author's target-dependent first sample, the caller would set
    initial_v=-target[0]. The caller owns/discloses that use; no target is accepted
    here. Both modes have identical dynamics after the same initial state.

    Nonfinite inputs or parameters raise ValueError; nonfinite calculated state
    or observations raise FloatingPointError without returning partial results.
    No clipping, parameter fitting, timestep adjustment or input mutation occurs.
    """
    if not isinstance(parameters, L2ReferenceParameters):
        raise ValueError("parameters must be L2ReferenceParameters")
    dt_s = _finite_scalar(dt_s, "dt_s")
    if dt_s <= 0:
        raise ValueError("dt_s must be positive")
    initial_v = _finite_scalar(initial_v, "initial_v")
    initial_y = _finite_scalar(initial_y, "initial_y")
    if not isinstance(feedback, (bool, np.bool_)):
        raise ValueError("feedback must be boolean")
    if not feedback and initial_y != 0:
        raise ValueError("feedback=False requires initial_y=0")
    if (not isinstance(first_sample_mode, str)
            or first_sample_mode not in ("observation", "author_target_anchor")):
        raise ValueError("first_sample_mode must be observation or author_target_anchor")
    raw = np.asarray(stimulus)
    if raw.ndim != 1 or raw.size == 0 or raw.dtype.kind not in "fiu":
        raise ValueError("stimulus must be a nonempty 1-D real numeric vector")
    source = np.array(raw, dtype=np.float64, copy=True)
    if not np.isfinite(source).all():
        raise ValueError("stimulus must be finite")

    p = parameters
    v_trace = np.empty(source.size, dtype=np.float64)
    y_trace = np.empty(source.size, dtype=np.float64)
    prediction = np.empty(source.size, dtype=np.float64)
    v, y = initial_v, initial_y
    v_trace[0], y_trace[0] = v, y
    prediction[0] = (-v if first_sample_mode == "author_target_anchor"
                     else -p.output_gain * (v + p.output_bias))
    if not math.isfinite(float(prediction[0])):
        raise FloatingPointError("Nonfinite L2 observation at initial sample")

    for i in range(1, source.size):
        contrast = float(source[i])
        gain = p.input_positive if contrast > 0 else p.input_negative
        dv = (-v - p.w * y - contrast * gain) / p.tv_s * dt_s
        if feedback:
            feedback_gain = 1 - p.g if v > 0 else p.g
            dy = (-y + v * feedback_gain) / p.ty_s * dt_s
            next_y = y + dy
        else:
            next_y = 0.0
        next_v = v + dv
        observed = -p.output_gain * (next_v + p.output_bias)
        if not all(math.isfinite(value) for value in (next_v, next_y, observed)):
            raise FloatingPointError(f"Nonfinite L2 dynamics or observation at sample {i}")
        v, y = next_v, next_y
        v_trace[i], y_trace[i], prediction[i] = v, y, observed

    for array in (v_trace, y_trace, prediction):
        array.flags.writeable = False
    return L2ReferenceResult(v_trace, y_trace, prediction)
