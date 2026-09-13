# Continuous Boss Practice

This is one ongoing local session with a public, read-only image feed. It alternates up to 180 simulated seconds of **Gatekeeper Prime** and 30 seconds of **Orbit Entry** enemies. The real game's engine, damage, boss phases and renderer supply the gameplay. The fixed-loadout player is invulnerable, stays in a horizontal band and fires continuously. Normal gameplay is unchanged.

**The initial controller is a random validation baseline. It has no neural worker and is not learning.** It establishes that the arena, actual damage events, persistent accounting and live broadcast work. No drawing animation is evidence of neural activity. A real model may only supply measured neuron IDs after its own sensory/decoder validation; neural training retains the coordinator's existing dataset-bound admission gates.

## Start and stop privately

Start the private lab web server, then run from `fly-lab`:

```powershell
.venv\Scripts\python.exe scripts/run-continuous.py --controller random --session boss-practice-v1 --boss-seconds 180 --wave-seconds 30 --disk-budget-gib 8 --render-profile local-d3d11
```

Use `--max-decisions 40` only for a bounded verification. Omit it for ongoing operation. Add `--resume` to continue an existing session's cumulative totals. The process must remain awake; a screen turning off is harmless, system sleep pauses the experiment. The runner caps random-controller stepping at 20 decisions per wall-clock second, and slower execution never skips simulated ticks.

For a hidden background run, the private coordinator accepts a graceful stop request:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8766/continuous/stop -Headers @{ 'X-Scicon-Lab' = '1' } -ContentType application/json -Body '{}'
```

The stop request is bound to the exact process creation time. Public viewers have no control endpoint. While the runner owns its OS lock, the private API rejects launching a competing experiment or replay. A stopped/crashed feed retains its last real frame and is visibly offline.

## Measurements and reward

Each confirmed **player-caused boss hull HP loss** contributes its actual applied amount to the proposed reward. Boss component damage, blocked shots, firing commands, score and coins do not contribute. Two hits in one tick remain two hits; identity is `(run ID, command sequence, event index)`. Cumulative score and cumulative hull damage are separate counters.

The baseline computes this candidate reward but delivers nothing to a neural model: `neural=null`, `deliveryStatus=no-neural-worker`, and delivered reward is zero. A gated plastic worker may later receive the numeric reinforcement through the existing separate channel. This would be an engineered modulation signal, not measured biological dopamine.

The private ledger also stores actual player and boss positions, horizontal overlap and viewport bounds at each decision. These are privileged observer measurements, never policy inputs. Native intro is excluded from their aggregate denominators. A crash-recovered game-journal row can lack its observer sample; coverage counts expose that limitation instead of inventing a position. Damage per simulated second and the fraction of boss-visible decisions with horizontal overlap are descriptive measures, not demonstrations of learning. A growing cumulative score alone proves only continued play.

## Persistence and restart

`runtime/continuous/sessions/SESSION/session.sqlite3` uses full-synchronous SQLite transactions. Unique `(bout, command sequence)` rows and cumulative counters commit together. Conflicting duplicates, missing command sequences, corrupt checkpoints or partial journal records fail visibly.

The real game is reset between private bouts, and each bout remains an immutable experiment under `experiments/`. The public display carries the same session totals forward. On a process restart, complete fsynced game-journal rows are recovered exactly once; an interrupted phase starts a new attempt while preserving confirmed measurements. That is explicit interruption recovery, not an exact mid-frame game checkpoint.

Consecutive gated neural bouts preserve learned efficacies and reset transient sensory/decoder state. Automatic recovery of a plastic model after a process restart is deliberately blocked until a complete checkpoint has been restored and audited; memory will never silently reset while the display says learning continued. The random baseline has no learned memory to preserve.

An 8 GiB default session budget and 2 GiB free-disk threshold stop the runner visibly. A reserve covers finalization. Data is never silently deleted or rotated away. An operator can explicitly increase `--disk-budget-gib` when resuming; changes to the scientific configuration or source require a new versioned session. Byte checks occur once per simulated second, so threshold enforcement is sampled with a finalization reserve rather than an operating-system quota.

## Live publication contract

`runtime/continuous/latest.json` atomically contains a flat local snapshot and its JPEG bytes plus SHA-256. The image and measurements therefore belong to the same revision. A read-only `GET /continuous/live` on loopback port 8766 verifies that hash and returns the website's nested `schemaVersion:1` contract with an image data URI. Snapshot revisions increase across restarts; public telemetry is sampled at at most 4 Hz. Full scientific event logs are retained separately.

The public publisher must authenticate its outbound writes and whitelist only display fields. Neither the hosted site nor a viewer can invoke the local game API. Source anatomy can always be displayed, but neuron lighting must come from `neural.sampledNeurons`, never movement commands, reward calculations or decorative traveling pulses.

## Validation

`python/tests/test_continuous.py` covers exact-once accounting, restart recovery, conflicting duplicates, phase order, reward/delivery distinction, disk stop, exclusive ownership and coherent image checksums. Existing reward/orchestration tests continue to cover frozen evaluation and dataset-bound neural admission. The canonical arena fixtures independently test the real boss, fixed controls, invulnerability and unchanged ordinary-game defaults.
