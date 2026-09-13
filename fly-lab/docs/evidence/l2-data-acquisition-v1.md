# Selected L2 physiology acquisition: 13 September 2026

**No new usable physiology recordings were acquired.** Three normal public Dryad download links each returned HTTP 200 and a roughly 4.3-KB HTML page titled `Validating...`. File size, content signature and SHA256 checks rejected all three responses. The existing two GitHub aggregate curves remain available; these do not contain individual-fly observations.

[The machine-readable record](l2-data-acquisition-v1.json) preserves requested URLs, timestamps, expected and observed hashes, response MIME types and local evidence paths. The rejected HTML responses and original public API metadata are retained in the ignored `data/raw/vision-physiology/pang-2025/acquisition-v1/` directory. No downloaded code was executed, no MAT or spreadsheet was parsed, and no fitting or gate changes occurred.

The ordinary public [dataset metadata API](https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.ngf1vhj4c) was accessible. It identifies published version 3 (335185) and a CC0 data license. Its individual file metadata provides exact verification targets:

| Requested file | Expected bytes | Expected SHA256 |
|---|---:|---|
| [L2_ASAP2f.mat](https://datadryad.org/api/v2/files/3732211) | 117,007,438 | `31e3942cee9025c152f96f929d30357ff14e6cf3b4f3c972f005c89524e946df` |
| [L1L2_Metadata.xlsx](https://datadryad.org/api/v2/files/3732249) | 195,431 | `0c6c428b1a297fb7c63b24a6f1a6e60516320ca6bde550614639d865dcdcfcea` |
| [README.md](https://datadryad.org/api/v2/files/3732251) | 15,130 | `fbedd08a47ba0927cf416c1a8d73bdd889e5779c309f79f94970b02c1f7f87e7` |

The MAT file's API MIME value is empty; a future successful acquisition must use its signature, exact size and published digest, rather than treating an absent MIME type as a failure by itself.

Dryad's [official API account documentation](https://github.com/datadryad/dryad-app/blob/main/documentation/apis/api_accounts.md) says file downloads require a token. No authorized token was supplied, so protected API downloads were not attempted. We stopped the download attempts after the three public links; no challenge, authentication or access control was bypassed, and the 49.6-GB full release was not requested.

The next dependency is obtaining these selected files through the [ordinary Dryad dataset page](https://datadryad.org/dataset/doi:10.5061/dryad.ngf1vhj4c) or authorized API access. Do not repeatedly retry an unchanged challenge. Verify the bytes and hashes above before inspection. The public README lists 13 untreated L2 fly identifiers, but their actual selected-ROI records, timing and normalization remain unverified until acquisition. Freeze a biological-fly split before fitting; a fit to existing aggregate means cannot supply independent validation.
