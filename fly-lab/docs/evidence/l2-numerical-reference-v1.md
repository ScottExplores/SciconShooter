# L2 latent feedback numerical reference

September 13, 2026. Scope: **REFERENCE EQUATIONS ONLY**. No parameters have
been fitted, and no validation gate changes follow from these tests.

`python/scicon_fly/l2_reference.py` independently re-expresses the equations
statically inspected in the [author's flash notebook](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/computational-model/L1_2responses_to_flashes.ipynb),
commit `7fa5829e37d566e02beaaa87efd6a0f1de4e48c0`. No downloaded notebook or
author code was executed. This is an effective two-state L2 model, separate
from the 57-cell MaleCNS diagnostic and the whole-CNS worker.

The core takes explicit parameters, initial state, stimulus and time step, and
returns complete latent-state and fluorescence-proxy trajectories. It preserves
the simultaneous Euler recurrence: input index `i` advances state `i-1` to `i`;
index zero is unused. Ordinary observation applies `-a*(v+b)` to every sample.
The separately named `author_target_anchor` mode reproduces the author's special
first prediction `-initial_v`; the caller would supply `initial_v=-target[0]` and
must disclose that target-dependent initialization. Targets are not accepted
inside the numerical core. Neither state is a calibrated millivolt measurement.

Time constants must be positive, the feedback asymmetry `g` must lie in `[0,1]`,
and all parameters and trajectories must remain finite. Unlike the source,
out-of-range `g` is rejected rather than clipped. Other signed parameters remain
available for numerical comparison with the unconstrained source family. Future
fits must freeze their own justified bounds, numerical stability checks,
observation operator and resource budget; a finite trajectory is not evidence of
stability or physiology. A feedback-disabled run requires zero initial feedback
state and keeps that state zero.

## Verification

The focused suite contains **44 passing tests**, independently rerun by the
primary agent in 0.38 seconds. It compares both sign branches with a separately
assembled state-transition matrix, checks a no-feedback geometric solution and
convergence toward its continuous analytical solution, and explicitly detects
sequential rather than simultaneous state updates. Other checks cover sample-zero
semantics, invalid parameters, nonfinite dynamics, read-only outputs and input
preservation.

A mathematical scale-equivalence test demonstrates a scientific limitation:
multiplying latent states, both input gains and output bias by a positive factor,
and dividing output gain by that factor, leaves ordinary fluorescence predictions
unchanged. A zero-initial-state fit consequently cannot identify all eight
parameters' absolute scales. An arbitrarily fixed output gain can define a
computational convention; it cannot establish absolute voltage or synaptic
release units. The special author anchor does not resolve that physiological
ambiguity.

Run from the private lab with its Python environment:

```powershell
$env:PYTHONPATH='python'
& .venv/Scripts/python.exe -m pytest python/tests/test_l2_reference.py -q
```

Use the existing lab interpreter, without changing the independent FlyVis
reference environment.

## Next use

The original fallback was a clearly labeled descriptive fit to two aggregate
curves. Normal browser acquisition has now provided individual-fly records, so
that fallback is deferred while their identities and measurement timing are
audited. Freeze the usable cohort, independent-unit split, preprocessing,
initialization and fit budget before reading held-out responses. Published
aggregate curves and source-model development already involve source-data
exposure; any new internal holdout must disclose that limitation.

A successful L2 fluorescence comparison would still leave retinal replacement,
indicator kinetics, female-to-MaleCNS transfer, omitted circuit inputs and
downstream visual processing uncertain. It would not pass whole-CNS vision,
conditioning or gameplay learning by itself.

Repeated-flash history also needs an explicit choice. A slowly adapting model
can retain state through the 500-ms gray intervals. Resetting it before every
averaged flash is not automatically equivalent to the randomized repeated
stimuli in the experiment. The newly available stimulus sequences make a
continuous-history comparison possible; initialization and warmup must be
frozen before fitting rather than selected afterward for a better match.
