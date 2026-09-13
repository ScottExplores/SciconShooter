# L2 calibration design notes — not a frozen fitting protocol

September 13, 2026. No response fit or independent-unit split has been executed.
The acquired Dryad data and their unresolved identity crosswalk take precedence
over the earlier aggregate-only fallback. Resolve the inventory issues before
freezing cohort membership and a fit/evaluation protocol.

## Measurement and independence

Keep search and experimental recordings separate. The source-selected ROI list
is an existing selection decision; report that decision and its missingness.
Keep both polarities, ROIs, repeated fields and recordings of one animal together.
Consider date/session dependence when defining the split. Previously published
aggregate curves and the source model were developed using related source data;
a new internal holdout does not become an untouched external replication.

Use source stimulus transition times, imaging times, normalization and averaging
windows. Do not infer high/low luminance from filenames or equate PWM ratios with
retinal radiance. Do not merge inconsistent fly labels by guessing. Test any
aggregate correspondence only with a declared provenance purpose, and disclose
the resulting exposure before a holdout claim.

Persistent adaptation may carry across the 500-ms gray intervals. A continuous
stimulus-history model with a fixed warmup rule is preferable to silently resetting
each averaged flash. The observed signal remains terminal ASAP2f fluorescence;
an affine latent-state observation does not calibrate millivolts or release.

## Numerical checks before fitting

For latent state `(v,y)`, branch coefficient `c` is `g` for `v<=0` and `1-g`
for `v>0`. The homogeneous branch matrix is

```text
A_c = [[-1/tv, -w/tv], [c/ty, -1/ty]]
```

With positive time constants, nonnegative `w`, and `g` in `[0,1]`, each continuous
branch is Hurwitz. Explicit Euler must satisfy `abs(1+h*lambda)<1` for every
eigenvalue of both matrices. Equality is not strict stability. Branch stability
alone is not a global switching proof and never establishes time-step accuracy.
Compare predictions after the observation operator at `h` and `h/2`.

A stronger sufficient zero-input switching certificate is available for `w>0`
and `0<g<1`. The piecewise energy
`V=0.5*tv*c(v)*v^2 + 0.5*w*ty*y^2` has continuous derivative
`dV/dt=-c(v)*v^2-w*y^2`. With
`P=diag(tv*max(g,1-g), w*ty)` and `E_c=diag(c,w)`, define `K` as the maximum
generalized eigenvalue of `(A_c.T*P*A_c, E_c)` across the two branches.
The conservative Euler condition `h<2/K` guarantees decreasing zero-input energy
even across a branch change. Failure of this sufficient certificate means
**uncertified by this bound**, not demonstrated instability. Compute using
symmetric whitening, not an explicit matrix inverse. The `w=0` null uses zero
feedback state; its relevant scalar condition is `h<2*tv`.

Record invalid parameters, branch instability, an unmet sufficient certificate,
nonfinite trajectories and failed convergence as different statuses. Do not clip
trajectories or silently adjust the time step to obtain a fit. A literal author
8.333-ms recurrence comparison and a finer-step measurement model are separate
versions; they need not share a conservative switching certificate.

## Identifiability and comparisons

Fixing the ordinary output gain to one supplies an arbitrary latent scale for
zero-state fits. It removes the amplitude gauge demonstrated by the numerical
tests, but it does not calibrate biological voltage. If only one voltage-sign
branch is observed, only the product `w*c` may be identifiable. With `w=0`, `g`
and `ty` do not affect fluorescence and must not be fitted as if informed by data.
Unknown stimulus amplitude, indicator kinetics, initialization and timing add
further ambiguities. Effective feedback does not identify a particular neuron.

Before seeing fitting results, freeze bounds, normalization, initial state,
optimization seed/starts and a total evaluation/resource budget. Bounds are
computational assumptions, not measured physiological ranges. Retain all starts,
failures, boundary solutions and prediction spread. Changing bounds creates a
new version. Compare a full-feedback model, a frozen-parameter feedback-off
intervention, and a separately refitted no-feedback model; those answer different
questions. Use the same computational budget for the model fits.

If only aggregate correspondence can ultimately be established, keep the result
descriptive: no time-point train/test split, biological confidence interval, or
claim of held-out animals. For a literal author-anchored fit, exclude sample zero
from every comparative error metric and also report the original full loss;
the anchored first residual is forced to zero. Timing sensitivity should first
hold fitted parameters fixed and distinguish solver, pulse duration, onset and
observation-window changes.

None of these checks passes the whole-CNS vision, decoder, conditioning or game
learning gates. This document records design reasoning for the next protocol;
it authorizes no training and reports no biological fit.
