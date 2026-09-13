# Continued research checkpoint

Updated September 13, 2026, morning (America/Los_Angeles).

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
4. Seek the selected processed L2 dataset/metadata for fly-level uncertainty
   through normal official download paths. Dryad direct streams returned an
   anti-bot HTML challenge; preserve that failure, validate signatures, and do
   not bypass access controls or download the full 49.6-GB release. The targeted
   L2 MAT is listed as 117.01 MB. A second bounded acquisition audit is saved in
   `docs/evidence/l2-data-acquisition-v1.md/json`: public API metadata worked and
   supplied exact size/hash targets; three public file responses were rejected
   as HTML. Do not repeat those unchanged requests. An ordinary browser
   download through the source site or authorized API access remains an avenue;
   do not bypass challenges. The small aggregate files do not permit a
   biological held-out split. License/provenance of GitHub aggregates remains
   distinct from the CC0 Dryad release.
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
