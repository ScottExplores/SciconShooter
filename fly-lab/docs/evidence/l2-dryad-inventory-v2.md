# L2 Dryad recording inventory v2

Version 2 corrects two review findings without changing membership or missingness counts. The release intends untreated female L2 ASAP2f recordings; conflicting per-record genotype and animal identities remain unresolved. For MATLAB_empty fields, the descriptor now preserves HDF5 container shape [2] separately from stored dimension metadata [0, 0] and logical MATLAB shape [0, 0]. An empty array is not a length-two response vector.

The original version 1 JSON, independent check and exact inspector snapshot are preserved; version 2 does not overwrite those evidence files.

The three selected Dryad files are now available and match the published byte counts and SHA256 identities. This audit examines membership, metadata, array structure and finite-value counts. **It does not fit parameters, export fluorescence response values or freeze a train/holdout split.** The split must wait because the MAT file and release spreadsheet contain unresolved identity and genotype conflicts.

[Inventory JSON](l2-dryad-inventory-v2.json) · [reproducible inspector](../../scripts/inspect-l2-dryad.py) · [successful acquisition record](l2-data-acquisition-v2.md).

## What was verified

`L2_ASAP2f.mat` is MATLAB 7.3/HDF5. In MATLAB, `roiDataMat` has 214 rows and two recording columns; HDF5 stores the reference-array axes in reverse order, 2 × 214. Column 1 contains search recordings, column 2 experimental recordings. `iResp` contains 103 unique, valid, one-based row indices. These are **selected ROI rows**, not 103 independently verified physical cells or flies.

There are 14 distinct fly groups in the MAT series-ID namespace, 13 with selected rows, across 32 search/experimental recording pairs. One group, `170622_fly2`, contributes 13 rows and zero selected rows. No `(experimental series ID, ROI mask)` keys are duplicated. Local mask indices differ between search and experimental columns in 23 rows; fly-prefix, genotype and depth labels agree across each pair. Different local mask numbers must not be treated as tracked physical-cell identities.

| MAT series-prefix group | All ROI rows | Selected rows |
|---|---:|---:|
| 170519_fly1 | 14 | 4 |
| 170524_fly1 | 15 | 6 |
| 170524_fly2 | 8 | 6 |
| 170606_fly4 | 20 | 14 |
| 170607_fly1 | 23 | 17 |
| 170607_fly2 | 12 | 6 |
| 170609_fly4 | 9 | 7 |
| 170611_fly3 | 6 | 4 |
| 170611_fly4 | 18 | 3 |
| 170611_fly5 | 22 | 15 |
| 170611_fly7 | 7 | 4 |
| 170622_fly2 | 13 | 0 |
| 170625_fly1 | 22 | 7 |
| 170625_fly2 | 25 | 10 |

## Crosswalk blockers

Of 64 distinct recording-series labels, 58 exactly match a row in the spreadsheet's `All Metadata` sheet. Ten of these exact matches have **substantive genotype conflicts**, while their stimulus names agree:

- The MAT labels every record `21Dhh-ASAP2f`. Six matched recordings under `170607_fly1` instead carry spreadsheet genotype `GMR16H03-lexA_lexAop-ASAP2f_lexAop-TNT`.
- Four matched recordings under `170607_fly2` carry spreadsheet genotype `GMR16H03-lexA_lexAop-ASAP2f`.
- Six recording labels have no exact spreadsheet match: `170607_fly1_LDM_006` and `_007` include four selected ROI rows; four recordings under `170622_fly2` include no selected rows.

Together these issues affect 23 selected ROI rows across two MAT fly groups: 19 have conflicting genotype metadata and four lack a matching recording pair. The README names `170607_fly4` and `170607_fly5` among its untreated flies, while the MAT uses `170607_fly1` and `170607_fly2`. This suggests a provenance issue worth investigating; it does **not** authorize silently renaming or merging them.

The numeric `flyID` field is another namespace, not the local `fly1` filename suffix. The 14 MAT numeric IDs map one-to-one to the 14 MAT series-prefix groups; this file shows no numeric-ID merging or splitting between those groups. Some numeric IDs differ from the spreadsheet, for example MAT 79 versus spreadsheet 379 for `170519_fly1`; others agree. Both values are preserved. A global numeric offset is not established across the release. JSON fields named `biological_fly_id` are explicitly provisional labels extracted from series prefixes; they do not establish resolved workbook animal identities or 13 verified independent physical flies.

## Timing, conditions and missingness

All 32 experimental MAT series declare `fullfield_LDflash20ms_Gray500ms`, 20-ms flashes and 500-ms gray intervals. Declared luminance values are 0 and 1 for the flashes and 0.5 for gray. The reconstructed transition intervals vary slightly; for example one series has 19.4–19.6-ms flash intervals and 500.4–510.6-ms gray intervals. These are stimulus metadata, not estimates of neural latency. Event counts differ among recordings, so do not assume identical trial counts from the protocol name.

All 58 exact spreadsheet matches list PWM 200; conflicting genotype rows cannot establish the illumination condition of the intended untreated recording. This audit therefore cannot identify the GitHub `highLum`/`lowLum` aggregate provenance. No aggregate response comparison was performed.

Each experimental response polarity has 63 time points, 0 through 0.5166667 seconds with 1/120-second spacing; `interpFrameRate=120`, `binWidthMult=1`. This is the processed response grid, not the native microscope sampling rate. Experimental `rats`, `stdErrs`, `dFF` and their time arrays have no nonfinite entries. Search `rats` and `stdErr` contain six nonfinite entries in each of 13 unselected rows; selected rows have none. Search `t` is empty, and search responses use a different array schema. The empty `stdErr` versus `stdErrs` fields are preserved rather than interpreted as zero uncertainty.

## Reproduction and scope

Use the existing `runtime/vision-reference/.venv/Scripts/python.exe` to run `scripts/inspect-l2-dryad.py`. For an independent repeat, pass `--output` with a fresh path; the script refuses to overwrite a completed inventory. The primary agent independently repeated the corrected audit and verified exact equality of all non-resource fields, preserved v1 source/artifact hashes, all four corrected empty-dimension descriptors, and unchanged membership/conflict results. See [independent check](l2-dryad-inventory-v2-independent-check.json). Source hashes were checked before and after each read-only audit. The version 2 initial run took 3.86 seconds with approximately 94.9 MiB peak sampled RSS; the independent repeat took 4.063 seconds and approximately 94.6 MiB. Both measured the owned launcher and Python child, with two thread limits, a 4-GiB sampled threshold and a 45-minute timeout. RSS sampling does not impose an OS allocation ceiling.

A superseded preliminary output is retained under ignored raw data. It incorrectly compared numeric IDs with local filename suffixes and measured only launcher memory; its identity warnings and memory figure must not be used. The final JSON explicitly records that limitation.

No new dependency, downloaded author code execution, raw microscopy archive, model change or gate update was involved. Next resolve the conflicting source namespaces using provenance evidence, then prespecify a split by biological fly that keeps all repeated records together. The existing physiological curves alone cannot resolve those identifiers.
