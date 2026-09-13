# Selected L2 physiology data acquired through the official browser interface

On September 13, 2026, the ordinary download links on the [Dryad dataset
page](https://datadryad.org/dataset/doi:10.5061/dryad.ngf1vhj4c) successfully
downloaded the three selected files. This resolves the access limitation recorded
in `l2-data-acquisition-v1.json`; the failed attempt remains preserved.

The browser saved files in the normal Downloads directory. Each byte count and
SHA-256 was checked against the previously acquired official API metadata **before
parsing**, then the files were copied into the ignored local research-data
directory `data/raw/vision-physiology/pang-2025/dryad-v3/`. No authentication,
CAPTCHA solving, cookie extraction, challenge bypass, or protected API download
was used. No complete 49.6-GB release was requested. The selected files total
117,217,999 bytes (about 112 MiB).

| File | Bytes | SHA-256 |
|---|---:|---|
| L2_ASAP2f.mat | 117,007,438 | `31e3942cee9025c152f96f929d30357ff14e6cf3b4f3c972f005c89524e946df` |
| L1L2_Metadata.xlsx | 195,431 | `0c6c428b1a297fb7c63b24a6f1a6e60516320ca6bde550614639d865dcdcfcea` |
| README.md | 15,130 | `fbedd08a47ba0927cf416c1a8d73bdd889e5779c309f79f94970b02c1f7f87e7` |

The release is Dryad version 3 (version ID 335185), licensed CC0 according to the
official metadata. That license applies to this data release; it does not establish
a license for the separate GitHub software or its aggregate MAT files.

Acquisition alone validates neither the biological model nor a study outcome.
The README describes individually identified female flies, selected ROIs,
stimulus-aligned responses, continuous processed fluorescence, and stimulus
timestamps. The actual schema, exclusions, per-fly grouping and correspondence
to the small author high/low-luminance averages require an independent inventory
before a calibration protocol is frozen. Original published ROI selection is
already a source selection decision, not newly blinded sampling.

No model fitting, gameplay training, or validation-gate change was performed as
part of acquisition. See `l2-dryad-inventory-v1.md` for the subsequent inspection.
