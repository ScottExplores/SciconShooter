# L2 calibration cohort: membership and assignment freeze v1

**The 103 source-selected ROI rows are now assigned to development or reserved internal assessment, excluded from fitting.** The split is by recording date: all release groups from one date stay together, along with both response polarities, all included ROI rows and their search/experimental recordings. No response values were read to make the assignment.

[Prespecified policy](../../configs/candidates/l2-calibration-cohort-v1.json) · [complete assignment and 214-row ledger](l2-calibration-cohort-v1-freeze.json) · [reproducible freezer](../../scripts/freeze-l2-calibration-cohort.py).

| Partition | Recording dates (YYMMDD) | Release groups | Source-selected ROI rows |
|---|---|---:|---:|
| Development | 170606, 170609, 170611, 170625 | 8 | 64 |
| Reserved internal assessment | 170519, 170524, 170607 | 5 | 39 |

The five assessment groups are `170519_fly1`, `170524_fly1`, `170524_fly2`, `170607_fly4` and `170607_fly5`. The last two preserve their original MAT labels alongside the author-documented release labels; no source record was renamed. Original numeric-ID namespaces are retained separately.

## Prespecified assignment rule

The root agent specified the policy before the ranking was computed. The policy file was saved first, at declared time 2026-09-13 17:46:49 UTC, with SHA256 `7f83391651817564115204d02d1cd8d1340780000b93043db4a3c31e724d956d`. The freezer pins that exact hash and refuses a changed policy.

All 35 choices of three assessment dates from the seven selected dates were enumerated. Ranking used, in order:

1. Absolute difference between assessment release-group count and the target of five.
2. SHA256 of UTF-8 `scicon-l2-internal-assessment-v1|` followed by the comma-joined sorted assessment dates.
3. The sorted date tuple as a final lexical tie-break.

The first ranked candidate was accepted once. The complete ordered candidate list, exact hash inputs and hashes are retained. No random-number generator, reroll, response value, fit result or ROI count enters the ranking. The table's ROI counts were calculated after assignment for accounting; the balancing unit was release groups.

## Membership and provenance

All original `iResp` entries are preserved in stored order. The full ledger accounts for **214 original ROI rows: 103 source-selected and 111 source-unselected**. No new discretionary exclusion was introduced. The 13 unselected rows from unmatched `170622_fly2` remain explicit, with unresolved source status and no fitting/assessment partition.

Checks require the selected release groups to equal the author's 13-group untreated L2 list, preserve selected-row uniqueness, keep each search/experimental pair in one canonical group, retain numeric-ID namespaces, reject canonical-series collisions, and keep dates disjoint. Input hashes bind the original MAT identity, [inventory v2](l2-dryad-inventory-v2.json) and [author-documented crosswalk](l2-workbook-crosswalk-v1.json).

This is **reserved internal assessment**, not untouched or unseen data. The aggregate-provenance check has already examined all selected response vectors, and the author's model, aggregate construction and ROI-selection process involved these data. The assignment excludes the reserved partition from subsequent fitting; it cannot undo those prior exposures or establish a new independent biological cohort.

## Reproduction and boundary

Run `fly-lab/.venv/Scripts/python.exe fly-lab/scripts/freeze-l2-calibration-cohort.py` from the repository root. The original output cannot be overwritten. Independent verification may use `--output` with a fresh path and compare all scientific/assignment fields, ignoring the computation timestamp and resource measurements. The initial bounded run took 0.375 seconds and approximately 27.2 MiB peak sampled RSS across the owned Python launcher and child. It enforced two thread limits, a 4-GiB sampled threshold and a 45-minute timeout; sampled RSS is not an OS allocation ceiling.

Only membership and assignment are frozen here. Physiological parameter bounds, the observation operator, fitting objective and assessment success criteria still require a separate protocol. No parameter fitting, training or validation-gate change occurred.

The [independent repeat](l2-calibration-cohort-v1-independent-check.json) reproduced all assignment fields. A separate enumeration reproduced all 35 rankings and the chosen partition. Read-only peer review found no concrete issues. These checks validate this assignment procedure, not biological independence or model performance.
