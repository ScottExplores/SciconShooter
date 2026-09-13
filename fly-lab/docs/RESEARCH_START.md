# Research start: a bounded first data collection

The research project is active. The current task is to establish a useful sensory model and reproducible controls. Neural game training is not running: the candidate vision and decoder screens failed, and conditioning has not been demonstrated. A computer staying awake does not resolve those scientific failures.

The first batch is complete: [measured results, representative replay and next decision](RESEARCH_START_RESULTS.md).

## Work authorized and started

1. Diagnose the frozen candidate's actual anatomical routes separately from its dynamic response. Preserve the failed candidate and its evidence. Do not reverse transmitter signs, change game-informed thresholds, or mark a gate passed to create a demonstration.
2. Collect the versioned `configs/baseline-v1.json` engineering batch: three development seeds, idle and random movement, constant fire in both conditions, native ORBIT ENTRY rules, up to 30 simulated seconds per episode. These six episodes contain no neural model or training. They characterize gameplay and recording/compute cost; they are not the eventual matched neural-action control.
3. Verify exports and strictly replay a representative episode. Keep every attempted run, including failures. A short time-limited episode does not establish mission completion or survival beyond the limit.
4. Prepare a local ResearchHub feasibility proposal. Scientific collaborators, recipient eligibility, final methods and budget remain to be resolved before publication or fundraising.

The baseline's seed order is fixed and alternates controller order. Environment and presentation seeds match within each pair, while actions can change subsequent game events. Seeds 31001–31003 are development seeds and must not enter sealed evaluation. No significance test or learning estimate is produced from three engineering pairs.

## Run the baseline again

Start the private lab normally. Keep other live, replay, encoding and neural jobs paused during measurement. The CLI owns a separate game instance and preserves the dashboard's current episode. It does not acquire a lock across other processes, so this is an operator requirement. Completed exports appear in the existing experiment library.

From `fly-lab` in PowerShell:

```powershell
$env:PYTHONPATH = 'python'
.\.venv\Scripts\python.exe -m scicon_fly.baseline configs/baseline-v1.json --output runtime/baseline-NEW-UNIQUE-ID --max-wall-minutes 30
```

Choose an unused output folder. The runner refuses to overwrite a prior batch, freezes the schedule and source identities, verifies each completed export, and closes its owned browser. Ctrl+C records the interruption and closes that instance. The wall-time budget is checked between commands; an in-flight command, finalization and cleanup can exceed it. It is not an operating-system deadline. A hard process kill can leave an incomplete attempt, which must be inspected rather than counted as completed.

`episodes.json` contains per-seed results, movement occupancy/switching, all-fire verification, source/runtime/checksum identities, time and memory measurements. `results.json` exists only after the planned batch completes. `interrupted.json` identifies an unfinished batch. Timing includes synchronous stepping, record writes, finalization and process-tree sampling, and excludes reset/post-run checksum verification. RSS is sampled and summed across owned processes, may double-count shared pages, and excludes the separate Vite/dashboard process. This benchmark says nothing about full neural throughput.

The frozen profile is this Windows machine's `local-d3d11`, verified by the driver. A different renderer requires a separate protocol version and separately validated pixel identity.

## What Scott needs to do

The existing PC can run bounded jobs with its screen off while Windows stays awake and it remains plugged in. Nothing needs to run continuously to preserve finalized exports or neural checkpoints. The current reference neural backend is far slower than real time, so long training schedules need measured budgets and validated optimization first.

The Raspberry Pi is optional. It does not add its processor to the PC merely by being connected. It could later host a display, a small orchestration service or independent lightweight jobs after device-specific testing. No purchase or Pi setup is needed for this stage.

The most useful external help is a Drosophila vision/connectomics collaborator to review the retinal boundary, graded dynamics and transmitter/receptor assumptions. The [ResearchHub draft](RESEARCHHUB_PROPOSAL_DRAFT.md) describes that scope and the funding questions. It is a working draft, not a submitted campaign or a commitment to spend money.

## Real game, family play and weekly scores

The lab already imports the real Scicon engine and renderer. Its private session removes progression, account persistence and external APIs so that the experiment is repeatable. The first task is authored ORBIT ENTRY with three lives; the ordinary Weekly Run has generated endurance stages and ten starting lives. Scores from those environments are not interchangeable.

Family members can play the ordinary local game at `http://127.0.0.1:5179/?display=mobile-frame`. Casual playtesting can reveal confusing controls or game behavior, but it is not a controlled human-versus-model experiment. Formal comparison would need matched settings, recorded inputs, measured latency, separate participant identifiers and a protocol. The lab's existing manual input uses an HTTP-stepped clock with different pacing from the normal game; do not merge those scores into one comparison.

A future exhibition profile named for the model is feasible once it can control the game. Record its model/checkpoint identity, give it clearly labeled exhibition scores, and validate a separate weekly adapter against the actual weekly rules. Existing production submissions require admission, receipts and server verification; assigning a name to a lab export does not make it an eligible weekly result. Bot eligibility must be decided explicitly before ranked participation. Human review should remain responsible for upgrades, spending, wallet authorization and research-proposal selection; a movement decoder does not establish comprehension of proposals.

No production game code, wallet, leaderboard, proposal submission or account has been changed by this research start.
