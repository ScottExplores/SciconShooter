# L2 measurement crosswalk v1

Checked 2026-09-13. **Static source audit and arithmetic only; no model fitting, simulation, or gate change.** The [machine-readable record](l2-measurement-crosswalk-v1.json) contains source hashes and exact calculations. This supplements the [aggregate-target inventory](graded-off-l2-target-inventory-v1.md); it does not establish the missing link from those two small MAT files to individual experimental records.

## What the experimental measurement represents

[Pang et al., Methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC11769683/) reports 20 ms flashes separated by 500 ms gray, native flash-imaging acquisition at 82.4 Hz, and stimulus-locked averaging at 120 Hz. Photodiode timing provides stimulus alignment. The measured signal is ASAP2f fluorescence at L2 medulla terminals, not spikes or absolute membrane voltage. Depolarization decreases fluorescence. Bleaching correction uses a two-exponential baseline fitted to the last quarter of each gray period. The paper displays negative percent change so depolarization points upward. It separately reports a fitted input delay of 16.7 ms, interpreted as an approximation to omitted phototransduction. That fitted delay is not an independently measured conduction delay. Female physiology transferred to the MaleCNS specimen remains an assumption.

## Timing: resolved conventions and remaining mismatch

The pinned [20 ms/500 ms stimulus definition](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/stimulus/fullfield_LDflash20ms_Gray500ms.txt) agrees with the paper: intensity levels 0 and 1 from gray 0.5, hence Weber contrasts -1 and +1. The separate 750 ms example is not needed for this protocol.

The [averaging implementation](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/compute_meanResp_err_moveAvg_FFFoG.m#L155) resolves a consequential ambiguity. Its comment calls timestamps bin centers, but the code assigns the **right edge**. With width and shift both 1/120 s, the sample labeled `t` averages frames with relative times in `(t - 1/120, t]`. The `t=0` sample can contain pre-transition frames. Treating these labels as centers would misalign the observation window by 4.1667 ms. This is a consequence of the published algorithm, not a measured correction to apply blindly to the aggregate files: their exact upstream export is still unverified.

The [flash notebook, cells 4 and 7](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/computational-model/L1_2responses_to_flashes.ipynb) sets input indices 2, 3, and 4 to unit contrast. On its grid:

| Quantity | Arithmetic result | Interpretation |
|---|---:|---|
| Step | 8.3333 ms | Export/model grid, not original camera rate |
| Nominal first nonzero sample | 16.6667 ms | Consistent with the paper's rounded fitted delay |
| Three full integration steps | 25 ms | 5 ms longer than the physical 20 ms pulse |
| Absolute contrast-time | 0.025 contrast·s | 25% larger than 0.020 at the same unit contrast |
| Mean-window center versus label | 4.1667 ms | Right-edge timestamps must be honored |

The recurrence consumes input index `i` while advancing from output index `i-1` to `i`. Under a piecewise-constant interpretation on each preceding integration interval, this charges the three nonzero inputs over `(8.3333, 33.3333]` ms. A left-held interpretation of the plotted samples would instead occupy `[16.6667, 41.6667)` ms. These descriptions differ by one step; neither independently proves the physical response latency. The duration/dose calculation is valid under both. The first nonzero plotted output can already contain a full integration step of input.

An exact 20 ms pulse is 2.4 grid intervals. Using two full bins and 0.4 of a third preserves its area when aligned at a bin edge, but changing that input alone does **not** reproduce the original notebook or guarantee correct nonlinear dynamics. A future measurement-based variant should integrate at actual transition times and then apply the observation windows. Reproducing the author's discretization and improving temporal fidelity must be separately named experiments.

## Sign and normalization: avoid double inversion

The [bleaching function](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/computeDFF.m#L48) computes fluorescence divided by the fitted baseline minus one. The [ROI filter](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/filterROIs_stimLockedPlots_FFFoG.m#L89) stores those averaged values without multiplying them by -1; its `inv` option reverses the display axis. The [exporter](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/shortFlashProcessed_saveMean.m) averages selected ROI rows equally. Thus raw-fluorescence sign is supported by the source chain, conditional on confirming these files' provenance. Dark/light are response rows 0/1 in Python; they are not the high/low filenames.

For aggregate matrix `D` with both high-luminance rows, the notebook defines one joint mean `mu` and population standard deviation `sigma` across all 126 entries. Both rows use `z=(D-mu)/sigma`. This is not a per-trial normalization and the resulting zero is not the gray physiological baseline. Its final plot undoes this scaling, then reverses the sign; multiplying by 100 would additionally be necessary to label the output as negative percent fluorescence change. The notebook itself labels arbitrary units.

Static algebra identifies the notebook observation map after the first sample:

```text
normalized predicted fluorescence = -a * (v + b)
predicted fluorescence = mu - sigma * a * (v + b)
depolarization-up display = -predicted fluorescence
```

Here `a` and `b` are fitted output gain and bias; `v` is an effective latent model variable. The notebook has no explicit indicator-response kernel or imaging-exposure model. Adding such a kernel may be warranted for a physiological model, but its parameters need evidence; adding one to the author reproduction would change the model.

Initialization also uses the target: `v[0]=-z[0]`, and the returned first prediction equals `z[0]` exactly, bypassing the later affine map. Two of the 126 fitted entries therefore have forced zero residuals (1.5873%). Any later predictive test must specify an initial state from a permitted pre-stimulus record or fixed equilibration and disclose whether the first sample is excluded from scoring. This arithmetic does not measure how much the remaining trajectory benefits from target-dependent initialization.

## High/low luminance remains only partly identified

The [experiment-selection script](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/selectTimeSeries_L2Project_FFFoG_v2.m#L336) separates untreated L2 records using projector PWM 200 and 20 and saves names ending in `_200pwm` and `_20pwm`. The [comparison script](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/plot_shortFlash_compareGenotypes_L2Project.m#L103) compares those conditions. This makes that pairing a plausible origin for `highLum`/`lowLum`, but no inspected rename/export manifest proves it. Do not infer absolute radiance, a tenfold effective retinal illumination ratio, disjoint flies, or a matched within-fly design from the filenames or PWM ratio.

The notebook loads low-luminance data but overwrites its response variable with the high-luminance dark row before fitting. It therefore does not validate across luminance. Its malformed selection assertion and undefined time-vector variables still prevent an unchanged clean execution.

## Next measurement-based comparison

Before an independent biological fit, obtain the selected ROI/fly records, precise acquisition and stimulus timestamps, genotype/treatment/PWM metadata, baseline processing settings, and the aggregate-to-record mapping. Recompute the source aggregate and verify equality within documented export tolerance. Freeze a split by **fly**, keeping both polarities and repeated recordings from one fly together; do not split the 126 time points as if they were independent animals. Assess uncertainty at fly level while reporting the author's ROI-weighted mean separately.

A candidate observation operator must explicitly map modeled L2 terminal state through a declared fluorescence response, actual temporal sampling and right-edge windows, ROI aggregation, and a frozen training-derived normalization. A latent affine fit is acceptable as descriptive calibration, but it does not calibrate millivolts or synaptic release. Aggregate curves alone cannot identify indicator kinetics, fly variability, stimulus jitter, omitted recurrent inputs, or all neural parameters. Even a good fit would concern this L2 sensory boundary, not whole-CNS vision or learned Scicon play.
