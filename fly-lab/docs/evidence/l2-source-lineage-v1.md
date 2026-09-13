# L2 source-processing audit

September 13, 2026. Static source inspection only. The inspected files are pinned
to author repository commit `7fa5829e37d566e02beaaa87efd6a0f1de4e48c0`; byte sizes
and Git blob identities were verified before reading. Downloaded source was
never executed. Original files and acquisition manifests remain in ignored
`data/raw/vision-physiology/pang-2025/lineage-v1/`.

The author’s [ROI loader](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/loadROIData.m)
matches recording labels to a metadata table and copies the numeric fly ID,
genotype and other fields. The inspected code does not supply an explicit
old-to-release rename table or a universal numeric-ID offset. This is compatible
with the MAT and workbook representing different metadata namespaces, but it
does not itself establish when or why identifiers changed. The explicit workbook
notes and recording checks in [the crosswalk](l2-workbook-crosswalk-v1.md) provide
the supported associations.

The deposited [example metadata log](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_example_spreadsheet/2p_imaging_log.txt)
contains none of the disputed 170607 or 170622 labels. It cannot substitute for
the exact historical metadata used to generate this MAT. The inspection was
bounded to relevant pinned files, not a complete audit of every historical
repository revision or unpublished lab record.

The [selection script](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/selectTimeSeries_L2Project_FFFoG_v2.m)
declares separate untreated L2 branches for projector PWM 200 and 20, with other
filters including motion flags, layer and optical settings. Its high-PWM branch
combines search and experimental stimuli and sets a 120-Hz response grid. It is
an interactive analysis recipe with multiple condition blocks and intermediate
concatenation steps; executing the entire file unchanged would not establish
that its exact historical selection and execution sequence had been reproduced.

The [ROI filtering function](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/filterROIs_stimLockedPlots_FFFoG.m)
obtains a manual responding/inverted/nonresponding choice after displaying the
recording responses. Its comments direct attention to the reference stimulus,
but the display includes experimental responses. The published `iResp` list is
therefore an existing source selection to preserve and disclose, not a fresh,
blinded selection by this project. The inspected implementation does not prove
which information informed each historical choice. No cells will be reselected
to improve a model fit.

Finally, the [mean exporter](https://github.com/ClandininLab/L1L2-recurrent-feedback/blob/7fa5829e37d566e02beaaa87efd6a0f1de4e48c0/imaging-analysis/HHY_stimulusSpecificAnalysisScripts/shortFlashProcessed_saveMean.m)
takes `iResp`, experimental column two, and averages the selected ROI response
vectors equally for each polarity. This defines a concrete mathematical
provenance check: compare that unmodified average with the deposited high/low
aggregate files. The separately frozen `l2-aggregate-lineage-v1` protocol allows
no sign change, normalization, timing shift, subset adjustment or fitting to
force agreement. A numerical match would link processed data products, not
validate microscopy preprocessing or physiology.

All findings here concern source processing and interpretation. They do not
pass visual, conditioning or gameplay-learning gates. The separate GitHub
repository/data-file license status remains distinct from Dryad's CC0 release.
