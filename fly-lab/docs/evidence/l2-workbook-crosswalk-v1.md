# L2 workbook crosswalk v1

**The workbook explicitly documents the two renames that caused the earlier selected-record conflicts.** This audit examined all seven sheets, including the comments column omitted from the original compact inventory. It preserves both namespaces and checks the author-declared association against recording metadata; it does not change any original record, inspect neural responses, fit a model or freeze a split.

[Machine-readable audit](l2-workbook-crosswalk-v1.json) · [reproducible metadata-only script](../../scripts/audit-l2-workbook-crosswalk.py) · [earlier inventory](l2-dryad-inventory-v2.md).

## Explicit source evidence

| Original MAT prefix / numeric ID | Workbook release prefix / numeric ID | Comment location in All Metadata | Same comment in figure sheet |
|---|---|---|---|
| `170607_fly1` / 104 | `170607_fly4` / 404 | V297, recording A297 | V111, recording A111 |
| `170607_fly2` / 105 | `170607_fly5` / 405 | V305, recording A305 | V120, recording A120 |

The first comment explicitly says that FLY1 was manually renamed to distinguish another 170607 folder; the second says the same for FLY2. Both occur on the corresponding new release labels in the `Figs1,3,5 (L1L2 ±CDM)` sheet as well as `All Metadata`. Exact source strings and cell addresses are retained in JSON. A third documented rename, `170628_fly1` to `170628_fly10`, appears elsewhere in the workbook; it has no corresponding prefix in this MAT file and is not applied to any of its records.

The `List of flies` sheet independently within this workbook assigns B6/B7 (`170607_fly4`/`fly5`) to `L2>>ASAP2f (21Dhh-ASAP2f)`. Its B138/B139 assign the other folder's fly1/fly3 to the TNT condition, and B147 assigns fly2 to the lexA control. These are corroborating workbook views, not independent biological experiments.

## Recording checks and scope of the resolution

Replacing only the explicitly documented prefix while preserving each LDM recording suffix yields 12 unique release-record matches: eight recordings for old fly1 and four for old fly2. All 12 agree with MAT metadata on genotype, stimulus name, frame count, z-depth, laser wavelength and dither setting. All 60 matched recording rows also appear on the figure-specific sheet. Their nonempty metadata values agree, including laser settings and rename comments; 31 rows differ only because `All Metadata` stores an empty comments cell where the figure sheet omits that cell. Those storage differences remain recorded in JSON. No approximate matching, inferred recording-number offset or global numeric-ID transformation was applied.

Across the entire MAT file:

- 48 recordings agree by unchanged label and shared metadata.
- 12 agree through the author-documented renames and shared metadata.
- Four `170622_fly2` recordings remain unmatched and contain zero selected ROI rows. They remain in the audit explicitly.

All 103 source-selected ROI rows therefore have a supported release-record association. Their 13 resulting release-prefix groups exactly match the untreated L2 group list. This resolves the **selected-record join problem** at the level of author provenance and matching metadata. It is not independent proof of animal identity or genotype, does not turn ROI rows into independent animals, and does not validate physiological dynamics.

The separate numeric-ID namespaces are retained. Six MAT prefix groups have workbook IDs 300 higher; seven selected groups have unchanged IDs. The unselected unmatched group has no workbook association. This is a measured set of per-group correspondences, not permission to add 300 to every identifier.

Only wavelength and dither settings can be compared directly with MAT laser metadata. Transmission, detector gain/offset, rotation, layer and PWM are available in the workbook, but absent from the direct MAT metadata fields inspected here. Agreement between workbook tabs cannot substitute for an independent MAT measurement of those settings.

## Reproduction and remaining work

Run `runtime/vision-reference/.venv/Scripts/python.exe scripts/audit-l2-workbook-crosswalk.py` from `fly-lab`, or use `--output` with a fresh path for a repeat. The script verifies published source hashes before and after the audit and refuses to overwrite completed output. It reads XLSX ZIP/XML and only the eight named MAT metadata fields plus `iResp`; it never dereferences response datasets or executes author code.

The initial run took 1.92 seconds and approximately 85.8 MiB peak sampled RSS across the owned Python launcher and child, with two thread limits, a 4-GiB sampled threshold and a 45-minute timeout. Sampling is not an OS-enforced memory ceiling. Independent verification can compare all output fields except resource timing/memory measurements.

The next protocol can reference this explicit crosswalk while preserving the original labels. It still needs a prespecified split that keeps all recordings from each release-prefix group together, a declared treatment of the author's ROI-selection procedure, and a measurement model. The provenance of the separate GitHub high/low-luminance aggregate curves remains unresolved. No calibration, split or validation gate changed in this audit.
