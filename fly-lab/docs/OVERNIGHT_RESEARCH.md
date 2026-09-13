# Continued research checkpoint

Updated September 13, 2026, morning (America/Los_Angeles).

## Current direction: a spectator website

Scott clarified again that the primary product is a simple read-only display,
using the larger Watch anatomy and game view. The default routes, `#watch` and
`#live`, now show Spectator. Research controls remain reachable at `#research`
and Watch preparation tools at `#watch-tools`; they are absent from the public
viewer. Existing physiology work and the hourly automation remain paused.

The first public version is explicitly a recorded showcase, not an endlessly
running or learning fly. It plays two existing verified random-baseline episodes
in sequence, hides the lives counter, and derives sequence points from the actual
recorded scores. Playback loops reset the total rather than earning new scores.
Green point flashes are display cues, not simulated dopamine. Cyan/amber anatomy
illustrations reflect image changes/actions, not neuron recordings. No neural
gates, reward rules, game physics or training outcomes changed.

The separate Sites checkout is
`C:/Users/scott/Documents/ChatGPT/Science/scicon-fly-watch`, with its persistent
Site ID in `.openai/hosting.json`. It contains only the static spectator bundle,
two verified recordings, lightweight source anatomy and provenance. Reuse that
Site for future display updates. A truly live public feed, persistent exhibition
ledger, automatic fresh matches and learned controller are still unimplemented;
do not silently present replay as any of those capabilities.

## Earlier direction and research checkpoint (preserved)

Scott asked to simplify the project around a real connectome experiment in
Scicon Shooter. He has not chosen a generic engineered game controller as a
replacement. The synthetic four-neuron demonstration is only an educational
example and does not meet that goal. Preserve it and its evidence, but move it
out of the main navigation. Keep the familiar Live game/anatomy arrangement,
plain controller identity and actual validation status; put technical controls
and additional pages under Advanced. No game is silently learning.

The hourly continuation is PAUSED while this direction is clarified. Do not
continue the older physiology fitting checklist automatically. Three unqualified
drafts from the interrupted follow-up are preserved under
`runtime/paused-physiology-20260913/`; they were never frozen or fitted. Only one
development row's allowed timing metadata was inspected; no response or reserved
assessment arrays were decoded. The draft timing script has only a syntax check,
not completed tests. Its outstanding review findings are in that folder's README.

The recommended single experiment remains: determine whether a declared model
using actual MaleCNS wiring can improve on ORBIT ENTRY through rewarded practice,
with saved memory and frozen comparison runs. Start with one isolated mission.
Do not claim success from activity, changed weights or isolated lucky scores.
The current candidate's vision/decoder failures remain visible. Simplifying the
presentation must not change scientific gates, invent anatomical activity, or
substitute a generic game policy without Scott choosing that scope. Public
viewing and local weekly-scenario transfer are later steps; production weekly
submissions, scores, wallets and funding are not authorized by this discussion.

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

### Current user priority: a small demonstrable learning experiment

Scott requested a simpler tangible result on September 13 after viewing Impact
Fly. Its own About panel explicitly describes a simulated funding wallet with
no money transferred and says odor-guided attraction is not demonstrated.
The earlier Dryad download succeeded without a login; no user action is pending.

The small demonstration is now implemented at `http://127.0.0.1:5180/#learn`.
The first saved run, `f20eb709b5f742268655154d35a85378`, passed its 18 declared
criteria. In both cue assignments, the paired cue's frozen probe changed from
16 to 10 output spikes; the other cue remained at 16. Unpaired and frozen
controls remained at 16. Erasure removed the effect; sham and restoration
preserved it. The worker took 4.125 seconds with 49.48 MiB sampled peak RSS.
See `docs/evidence/teaching-demo-v1.md` for source hashes and scope.

This is an explicitly synthetic four-neuron teaching circuit using the existing
numerical/plasticity code. It demonstrates the engineered learning mechanism;
it is not a MaleCNS result and changed no research gate. Its schematic lights
use actual emitted spikes, separately from prescribed input currents. The
private endpoint and Learn page provide bounded calculations, recorded playback
and complete JSON downloads. Do not rerun this demo merely to keep work active.
The larger study is preserved. After this display milestone, resume the bounded
physiology protocol work below without treating the teaching result as evidence
that the fly can see, choose an action or learn Scicon Shooter.

### September 13, 10:55 PDT: source lineage resolved and cohort assigned

Explicit author rename comments in the workbook resolve the selected-record
discrepancies from inventory v2. All 103 source-selected ROI rows now have
supported associations: 48 series keep their labels and 12 match documented
renames with shared metadata agreement. Four unmatched series contribute zero
selected rows. These are source-record associations, not independent animal
verification. See `docs/evidence/l2-workbook-crosswalk-v1.md/json` and its
independent check.

The frozen, unmodified mean of all 103 selected rows exactly reproduces the
high-luminance aggregate, including both response curves and time entries.
The low-luminance target does not match (maximum absolute response difference
0.019440958492522788); its provenance remains unresolved. No alternate subset
or transformation was searched. Read `l2-aggregate-lineage-v1.md/json` and
`l2-source-lineage-v1.md/json`. The independent repeat reproduced every
scientific descriptor in 1.06 seconds at 75.9 MiB peak sampled owned-tree RSS.

The metadata-only cohort policy is frozen before fitting. All 35 three-of-seven
assessment-date combinations were ranked by the prespecified group-count target
and fixed SHA256 tie-break. Development has eight groups on four dates (64
selected rows); reserved internal assessment has five groups on three dates
(39 rows). Keep all included recordings and polarities from a date together.
The complete 214-row ledger retains 111 source-unselected rows. Read
`docs/evidence/l2-calibration-cohort-v1-freeze.md/json` and its candidate policy.
An independent repeat and separate enumeration reproduced the assignment.
Peer review found no concrete issues in either new runner.

The reserved partition is **excluded from fitting, not unseen**: aggregation
read every selected response and the authors used these data previously. Do
not erase that exposure history or call this a new independent biological
cohort. The cohort also inherits the author's manual ROI selection. The source
audit is scoped static inspection, not full-history pipeline reproduction.
No physiology fit, game training or gate change occurred.

Next freeze the actual development-calibration protocol: target-free
initialization, input/measurement timing, parameter bounds, normalization,
equal-group objective and reserved-assessment criteria. Account explicitly for
the approximately 561-ms feedback constant versus 500-ms gray interval and the
author's effective 25-ms discrete pulse versus 20-ms nominal flash. Specify
history/reset sensitivity before examining fit outcomes. Use the validated L2
numerical core and frozen development membership; keep assessment excluded
from parameter and method selection. Game learning is not justified yet.

The earlier checklist below is retained as history. Source acquisition,
selected-record reconciliation and high-luminance provenance are now complete.
Low-luminance identity and physiological calibration remain unresolved work.

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
