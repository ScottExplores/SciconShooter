# L2 aggregate lineage check v1

**The original selected-ROI mean exactly reproduces the author's high-luminance aggregate.** The separately deposited low-luminance response does not match. This is a processed-data provenance result, not a model fit, biological validation or evidence of learning.

[Frozen protocol and source hashes](l2-aggregate-lineage-v1-freeze.json) · [complete result descriptors](l2-aggregate-lineage-v1.json) · [independent comparison runner](../../scripts/check-l2-aggregate-lineage.py) · [separate workbook identity audit](l2-workbook-crosswalk-v1.md).

The freeze was written before the first comparison and records the protocol, runner, all three input-file hashes and pinned MATLAB exporter reference. Source identities were verified before and after calculation. The runner was written independently from the declared averaging operation; no author code was executed.

## Comparison

The run used all 103 original `iResp` entries in their stored order, among 214 source ROI rows. It read experimental column 2 only, preserving dark/light order. All 12,978 response entries were finite. Each selected ROI/polarity had 63 samples, and all 206 source time vectors were exactly equal.

For each polarity, the run computed the equal-weight arithmetic mean across selected ROI rows, matching the original export operation. It applied no normalization, sign inversion, smoothing, shift, row permutation, response-based selection or fitted transformation. The response and time match thresholds were both fixed at maximum absolute difference 1e-12 before comparison.

| Author target | Response result | Maximum absolute response difference | Mean absolute response difference | Maximum time difference |
|---|---|---:|---:|---:|
| `L2_highLum.mat` | Exact numerical match | 0 | 0 | 0 s |
| `L2_lowLum.mat` | Mismatch preserved | 0.019440958492522788 | 0.002038323481731584 | 0 s |

The high-luminance match covers all 126 response entries and all 63 time entries, not just selected peaks or a correlation statistic. It concerns decoded numerical arrays; the two source file containers are different files with different hashes.

For the low-luminance comparison, maximum absolute differences were 0.0159922678303757 for dark and 0.019440958492522788 for light. No alternate selection or transformation was searched to reduce those differences. This mismatch does not make the low-luminance data invalid; it establishes that this particular source-selected aggregate is a different response product. The low-luminance source-to-ROI association remains unresolved.

## Interpretation and exposure

Combined with the separate metadata crosswalk, the exact high-luminance match links the small author aggregate to the selected processed release records under the declared operation. It does not independently validate animal identities, microscopy preprocessing, absolute illumination, membrane-voltage or release units, physiological mechanisms, MaleCNS transfer or game learning.

This source-validation check read **every selected response**, including records that may later be assigned to an assessment partition. No response arrays are exported here, but that does not make the records unseen. Any later assessment must be described as excluded from fitting, with this exposure and the author's prior aggregate/model use disclosed. Its biological unit remains the fly rather than an ROI or time point.

The selected records also retain continuous fluorescence and stimulus timing. A later calibration should account for the actual randomized flash history, or prespecify a history-sensitivity analysis. A feedback time constant near 561 ms is comparable with the 500 ms gray interval, so zeroing modeled feedback before each flash cannot be assumed to reproduce the measurement boundary condition.

No numerical, vision, decoder, conditioning or learning gate changed. Dryad's release license remains separate from the licensing of the GitHub files and code.

## Execution and reproduction

The one supervised comparison completed in 2.17 seconds with 81,649,664 bytes peak sampled RSS across two owned processes. Numerical-library thread environment limits were set to two. The guard sampled the spawned Python launcher and its child tree every 50 ms, with a 4-GiB threshold and 45-minute deadline. Sampling is not an OS-enforced memory ceiling; an unsampled transient peak remains possible. No guard fired.

Run from `fly-lab` using the isolated reference environment:

```text
runtime/vision-reference/.venv/Scripts/python.exe scripts/check-l2-aggregate-lineage.py --run --output runtime/vision-reference/l2-aggregate-lineage-fresh-repeat.json
```

The existing freeze must match the current protocol, runner and input bytes. The runner refuses to overwrite completed output or a pending attempt. A mismatch is retained as a completed comparison; invalid inputs and interruptions receive distinct failure states. The pre-resource worker record is preserved under ignored `runtime/vision-reference/results/`. A repeat should reproduce all scientific descriptors, while timestamps and resource measurements may differ.

The [independent repeat record](l2-aggregate-lineage-v1-independent-check.json) confirms identical scientific descriptors, including the exact high-luminance match and retained low-luminance mismatch. The repeat took 1.06 seconds with 79,540,224 bytes peak sampled owned-tree RSS. Read-only peer review found no concrete issues; no biological gate changed.
