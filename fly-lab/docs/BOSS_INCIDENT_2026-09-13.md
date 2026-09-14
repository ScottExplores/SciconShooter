# Boss experiment paused by a storage-check race

Detected by the hourly follow-up on September 13, 2026, at 17:36 PDT.
The runner had stopped at 16:44:05 PDT (23:44:05 UTC).

The simulation stopped because its disk-usage scan attempted to inspect
`broadcast/sequence.json.tmp` after the publisher had renamed that temporary
file into its final filename. The publisher uses an ordinary atomic-write
pattern; the recursive scanner did not tolerate a temporary file disappearing
between directory listing and `stat`. This is a software coordination failure,
not a neural result, disk exhaustion or evidence that the model learned anything.

## State preserved

- Session remains `boss-learning-live-v2-494657ea`.
- Runner PID 26628 exited. No replacement runner was launched.
- Publisher PID 7332 remained alive and had published the explicit error state.
- The public browser visibly showed **FEED STOPPED**, the last captured game
  frame and unavailable current activity values. No fake activity was supplied.
- The journal contains 62,293 valid chained records and 62,100 game steps.
- There are 77 completed bouts: 38 training bouts and 39 frozen evaluations.
- The final bout, `bout-000078`, has 900 logged game steps (45 simulated seconds)
  after the saved checkpoint. It remains unfinished, not a completed result.
- The existing model checkpoint's original bytes pass their integrity check.
  The journal passes the independent audit, but the checkpoint predates the
  journal, so current checkpoint-to-ledger weight comparison was **not** possible.
- Approximately 176 MB was in use and 478 GB remained free at discovery.

The last clean checkpoint was saved at `2026-09-13T23:42:57.170Z`, decision
sequence 61200, bout 78 tick zero. Its journal hash is
`d7097cff498bf34dfee72a903ffba3da98d5b226c0a7869d3fd3d051ebd54515`.
The valid current journal ends at sequence 62100, tick 2700, chain hash
`ed2774e282a6ec65d8a842c7817ad597354d0181fa51ee052658dc7dd258c750`.
Journal file SHA-256:
`d92967ac39951c548c55e045d575ca48fff5e167176000e09ce053da7f7e2ba8`.

The original checkpoint, owner status and last public snapshot were copied to
`runtime/boss-learning-v1/boss-learning-live-v2/incident-20260914T0036Z/`.
The preserved `resume.json` file SHA-256 is
`b833fa3223cd2f468e9a213d8dfe36a0288c061cf854b79daa34c0694f301ef3`.
No journal records, memory or failed attempts were deleted or overwritten.

## Why ordinary restart is not sufficient

The documented resume path requires the checkpoint journal hash to equal the
current journal hash. It deliberately rejects this mismatch before game replay.
Its later replay restores the game from a matching model checkpoint; it does not
reconstruct additional neural updates missing from that checkpoint. Marking the
old checkpoint current, truncating the journal or starting fresh would lose or
misrepresent recorded work. None of those actions was taken.

The monitor's authorization permits documented same-session recovery and forbids
bypassing integrity/source checks. An unimplemented checkpoint reconstruction or
an undisclosed changed source version is outside that recovery path. The stopped
session therefore remains preserved for a tested repair. The hourly monitor was
deleted because repeatedly checking this unchanged known failure will not
restart it safely. Recreate monitoring after a verified repair.

## Requirements for the repair

1. Fix the file-list/stat race with a focused regression test that removes or
   renames a publisher temporary file between those operations. Keep real
   filesystem errors and storage-budget enforcement visible.
2. Implement and test explicit reconstruction of the missing neural and runner
   state from the preserved checkpoint plus the complete 900-step journal tail.
   Verify each model decision, reward, efficacy update and replayed game/frame
   hash. Preserve pending action intervals and random state. Stop on any mismatch.
3. Preserve the original artifacts, write a separate recovery report and candidate
   checkpoint, and independently compare recovered weights with the complete
   ledger. Never silently alter the checkpoint's integrity identity.
4. Record operational source changes as an explicit version/migration, keeping
   model parameters, anatomy, sensory coding and game methods unchanged. The
   existing source-identity check must not simply be disabled or overwritten.
5. Resume only the verified continuation, check the real public feed, then
   reinstate its health monitor. Keep earlier negative scientific reports intact.

Latest completed evaluation was after 36 training bouts, still below the
starting performance. This incident does not change the scientific interpretation
in [the progress report](BOSS_PROGRESS_2026-09-13.md).

[Independent incident audit](evidence/boss-learning-incident-audit-20260914T0036Z.json).
