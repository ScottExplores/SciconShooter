# Continued research checkpoint

Updated September 13, 2026, morning (America/Los_Angeles).

## Latest continuation: individual physiology data acquired

The first hourly follow-up resolved the Dryad download limitation through the
ordinary browser interface. The selected processed L2 MAT, metadata workbook
and README were all verified against the exact published byte counts and
SHA-256 targets before parsing, then copied to
`data/raw/vision-physiology/pang-2025/dryad-v3/`. Only about 112 MiB was acquired;
the full release was not downloaded. Preserve the earlier unsuccessful HTTP
attempt record as well as the new `docs/evidence/l2-data-acquisition-v2.md/json`.

A separately authored latent L2 numerical reference is now available at
`python/scicon_fly/l2_reference.py`, with 44 passing focused tests. It reproduces
the explicitly documented recurrence and initialization alternatives. It does
not load biological targets or calibrate physiology. The scale-equivalence
test demonstrates that fluorescence alone cannot identify absolute latent
voltage when input and output gains can trade off. See
`docs/evidence/l2-numerical-reference-v1.md`.

The aggregate-only fit is deferred: individual-fly data provide a stronger next
avenue. Complete the actual dataset inventory, freeze independent-unit grouping
and measurement preprocessing, and lock a calibration/evaluation protocol before
any parameter fitting. Do not infer that the small GitHub aggregates constitute
held-out data or that a new split erases earlier published-model/data exposure.
The whole-CNS vision and decoder gates remain failed; conditioning and learning
remain untested. The app continues to show a labeled recorded baseline.

The current inventory is `docs/evidence/l2-dryad-inventory-v2.md/json`, with
an independent repeat record beside it. All non-resource output fields
reproduced exactly. The repeat took 4.063 seconds and approximately 94.6 MiB
sampled RSS over the owned launcher and child; the guard now sums that tree,
not merely the Windows venv launcher. A preliminary wrong numeric-ID comparison
and wrapper-only memory measurement are preserved and explicitly superseded.
The first completed inventory (v1) is also preserved. Independent review led to
v2: empty MATLAB arrays now distinguish logical dimensions from HDF5 storage,
and the release's intended condition is qualified rather than asserted as
verified for every recording. Membership and metadata-conflict results did not
change. The v1 inspector snapshot is retained with the ignored acquired files.

There are 214 ROI rows and 103 source-selected rows, in 14 MAT series-prefix
groups (13 selected). These prefixes are provisional animal labels. Of 64
recording series, 58 exactly match the workbook; ten matches have substantive
genotype conflicts and six are absent. This affects **23 selected rows**:
19 conflicting and four without matching series. MAT `170607_fly1/fly2` differ
from README `170607_fly4/fly5`; never silently rename or merge them. The MAT's
numeric fly IDs are another namespace, not local filename suffixes.

**Next continuation:** investigate source export/selection history and the
workbook's relevant figure sheets for evidence resolving these identities.
Use existing downloaded files and the pinned author repository first. No
response-fit or train/holdout split has been frozen. If provenance cannot be
resolved, explicitly version an analysis limited to verifiable records, with
selection limitations, or document the external evidence needed. Do not
change ambiguous labels to make the data usable. Prospective numerical and
measurement considerations are saved in
`docs/evidence/l2-calibration-design-notes-v1.md`; these are not a frozen fit
protocol. The hourly continuation remains active.

## What actually happened

The earlier 29 FlyVis visual trials and 12 pathway trials completed at commit
`eec8d612`. The subsequent request to continue overnight did not establish a
durable runner before the session stopped. No new 57-cell experiment or game
training ran overnight. Scott was told this explicitly when he asked for status.

An hourly thread heartbeat was successfully created on September 13:
`continue-scicon-fly-lab-research`. This schedules further agent work while the
local Codex environment is available; it is not evidence that any simulation is
currently running, and cannot execute while the computer is asleep or off.

## Current work and completed result

The separately versioned 57-cell right-side MaleCNS L2/Tm1/Tm2 diagnostic is now
implemented and its 45 trials completed on September 13 at 15:42 UTC. All eight
prespecified engineering checks passed in 29.95 seconds with 110.6 MiB peak
sampled RSS. Full record:
`runtime/graded-off/results/diagnostic-v1-20260913-first/`.
Report: `docs/evidence/graded-off-diagnostic-v1/README.md`.
The full Python suite passed: 226 tests. No game-learning batch or diagnostic
worker is currently running. The private dashboard/coordinator were stopped
when checked this morning. Do not claim that the game is actively training.

Later in the morning Scott asked to continue through completion of the studies,
open the app, and verify the brain display. The existing hourly heartbeat was
updated (not duplicated) to follow the full approved phased study to an auditable
conclusion, subject to scientific prerequisites and real external dependencies.
The private app is now running from the canonical checkout on 5180/8766; its
owned launch record is `runtime/launch/current.json` (supervisor PID 13240 when
started at 09:02 local time after the final display changes; recheck
ownership/liveness before any operation).
Watch is open on the already recorded random baseline
`20260913T065659-7c5f0b2c`, not a new episode. Playback does not train.

The source-anatomy display was verified against the cached annotation and
morphology sources. Watch has 43,864 source soma positions and two selected
skeletons. Its electric cues were image/control illustrations, not neural
activity. They now default off, with a prominent explanation; replay explicitly
says it does not train. Actual model telemetry remains separate from geometry.
Disconnections now clear stale Watch activity and label retained Live telemetry
as previously recorded. Typecheck, 16 JS tests and the private build passed;
desktop/mobile replay and disconnection behavior passed frontend verification.
The phone layout now expands around the anatomical explanation and does not
overlap its preview/readouts or playback controls. QA artifacts are outside the
repository at
`C:/Users/scott/Documents/ChatGPT/Science/display-truth-qa-1789315339226/`.

The diagnostic uses the actual nominated anatomy, but assumed baseline release,
gain, adaptation and time constants. Its first purpose is to check stable,
causally transmitted responses under those explicit assumptions. A successful
reduced-circuit engineering test does not pass the whole-CNS vision gate.

## Next steps and limits

1. The circuit, numerical core, protocol freeze and first assay are complete.
   Preserve those exact source bytes and original artifacts. Do not repeat the
   run merely to keep a process busy or change v1 until a failure justifies it.
2. Read `docs/evidence/graded-off-physiology-sources-v1.md` and
   `graded-off-l2-target-inventory-v1.md/json`. Tiny author L2 high/low-luminance
   MAT files have been acquired and safely inspected; each contains two mean
   curves and a time vector, but no fly IDs, uncertainty or stimulus metadata.
3. The source/measurement crosswalk is complete as a static audit:
   `docs/evidence/l2-measurement-crosswalk-v1.md/json`. It resolves fluorescence
   sign and joint scaling and identifies a 25% excess pulse integral in the
   author's discretized input, a right-edge observation-window convention and
   target-dependent initialization. The paper's fitted 16.7-ms input delay is
   explicit. High/low luminance-to-ROI provenance remains unresolved. No author
   notebook was executed, no fitting occurred and no gate was changed.
4. The selected processed L2 data/metadata are now acquired and verified through
   ordinary official browser downloads; do not download them again. See
   `docs/evidence/l2-data-acquisition-v2.md/json` and the new inventory. Preserve
   the earlier HTML rejection records. Resolve the inventory's recording/fly
   identity and condition-label discrepancies before declaring an independent
   biological split. The small aggregate files alone do not permit that split.
   License/provenance of GitHub aggregates remains distinct from the CC0 Dryad
   release. No full raw microscopy archive is needed at this stage.
5. Before fitting, freeze a new bounded calibration protocol and measurement
   model. If only aggregate data are accessible, explicitly label any fit as
   descriptive and unvalidated; do not turn curve matching into a gate pass.
   Keep timing/normalization alternatives as declared sensitivity analyses,
   not choices made to obtain a desired conclusion. Independently validated
   L2 response plus boundary sensitivity is the next useful sensory milestone.

Never duplicate an active worker. Use at most two threads per compute job, a
sampled 4-GiB process-memory watchdog and at most 45 minutes per job. Inspect
owned processes and records at every follow-up. Do not change the production
game, wallets, funding systems, high scores or unrelated working-tree files.
No pushing, publishing, purchases or large game-training studies. Keep the
validation gates unchanged unless identity-bound evidence actually satisfies
their declared requirements. The current vision and decoder candidates failed;
conditioning and learning are not yet tested.

After a phase milestone, proceed to the next scientifically warranted phase;
Scott explicitly extended continuation through the studies. Pause the heartbeat
through the app tool only on an auditable study conclusion, Scott's stop request,
or a real need for external evidence/resources/user action with no useful
independent authorized work remaining. An honest negative or feasibility-limited
conclusion is acceptable. Do not claim the full project completed because the
small circuit works. Update this file and `SCOTT_RESEARCH_JOURNAL.md` after every
substantive result. Quiet, unchanged checks do not need a notification.
