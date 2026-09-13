# Author L2 response targets: inventory v1

Checked 2026-09-13. Two small author-deposited MAT files were downloaded and parsed without executing author code. [Machine-readable inventory](graded-off-l2-target-inventory-v1.json) records exact URLs, hashes, schemas and limitations. No fitting, model update or gate change was performed.

## Measured file contents

Both files come from [ClandininLab/L1L2-recurrent-feedback](https://github.com/ClandininLab/L1L2-recurrent-feedback/tree/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0), commit `7fa5829e37d566e02beaaa87efd6a0f1de4e48c0`.

| File | Bytes | SHA256 |
|---|---:|---|
| L2_highLum.mat | 1,463 | `1c9266f5c387a217013f8715a49f6351f78e9a9de9894a5ac2892b2a06cf6e36` |
| L2_lowLum.mat | 1,459 | `49c0e5587618f9d11e0dea12a218b6eecd511e563d8d42ad986e9c410c6d012c` |

Each contains only `meanResp` (float64, 2 by 63; all 126 values finite) and `t` (float64, 1 by 63; all finite). The time grids are exactly equal and strictly increasing: 0 through 0.5166666667, spaced at 1/120 within floating-point precision. Seconds are supported by the surrounding author export/analysis convention; the MAT files themselves contain no units. This grid does not establish the original microscope's sampling rate.

Neither file contains individual cells, fly IDs, SEM, trial records, luminance calibration or stimulus metadata. Aggregate curves cannot support biological replication or a trial-level held-out evaluation. The files remain under ignored `data/raw/vision-physiology/pang-2025/`; the inventory redistributes descriptors, not response values.

## Crosswalk requiring care

The [author MATLAB exporter](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/shortFlashProcessed_saveMean.m) averages selected ROI responses in epoch order 1, 2. The [Dryad README](https://datadryad.org/dataset/doi:10.5061/dryad.ngf1vhj4c) labels those epochs dark, light. This supports the row interpretation but does not identify which ROI records produced these particular small files.

Static [notebook inspection](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/computational-model/L1_2responses_to_flashes.ipynb) finds joint mean subtraction and standard-deviation scaling across the two high-luminance rows, followed by plotting-sign reversal. The loaded low-luminance response is overwritten before fitting. An assertion and undefined time-vector names also require explicit corrections before reproduction. We applied none of these operations.

The notebook's three nonzero input samples span 25 ms on this grid; the [paper's methods](https://pmc.ncbi.nlm.nih.gov/articles/PMC11769683/) report 20-ms flashes and 500-ms gray interleaves. Discrete stimulus placement, binning and photodiode alignment must be reconciled. The nominal notebook sample timing is not the measured experimental timing. Likewise, the filenames do not identify absolute luminance or prove distinct fly cohorts.

## Next scientific step

These files establish that numerical aggregate targets are available. Before fitting, verify the aggregate-to-ROI crosswalk, fluorescence units, baseline scaling and stimulus timing. Obtain fly-level records to estimate uncertainty and declare an independent validation split. A fit to both aggregate curves alone is descriptive calibration, not independent validation.

Dryad declares CC0 for its separate release. We did not verify a license for these GitHub files or establish byte/content correspondence with the Dryad export, so no response values are copied into tracked artifacts. No LICENSE file appeared in the inspected code tree; the linked Zenodo archive's license remains unverified. These are distinct data/code provenance questions.

Verification: exact MAT signatures and variable sets, dimensions, finite values, positive time differences, nominal spacing and equality of time grids passed direct assertions using SciPy. No author notebook was executed. A numerical descriptor inventory cannot validate the reduced MaleCNS circuit or whole-CNS vision.
