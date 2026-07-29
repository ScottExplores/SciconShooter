# Campaign save migration: revision 21 to 22

Campaign revision 22 expands the authored route from fixed three-Wave Missions
to dynamic Mission lengths. Current client and wallet saves use Campaign
progress schema version 4; older version-3 checkpoints are migrated into the
authored Campaign graph without guessing an ambiguous route.

## Migration source

`game-config/campaign-migration-v22.json` is the audited migration manifest. It
preserves all 20 Mission IDs and maps each revision-21 Wave/checkpoint ID to its
revision-22 equivalent. Both `services/campaignProgression.ts` and
`api/_lib/walletProfiles.js` consume that same manifest.

## Rules

- A completed legacy Mission remains completed and owns every authored v22 Wave.
- A partial legacy Mission maps its furthest known legacy checkpoint, fills the
  contiguous authored prefix through that checkpoint, and unlocks exactly the
  immediate next Wave.
- Unknown, cross-Mission, non-contiguous, or future-revision Wave IDs are
  discarded.
- The continue checkpoint is derived from the furthest valid unlocked
  Mission/Wave pair. A replay or merge cannot move it backward.
- Completed Waves, results, reward receipts, mastery, branches, and records merge
  monotonically. A worse replay cannot remove any of them.
- Mission stars are evaluated only on a final-Wave result. Performance mastery
  additionally requires `masteryEligible: true`, which is valid only for a run
  launched at Wave 1 with whole-Mission metrics. A resumed later-Wave run can
  earn the completion star, but not performance stars or the mastery-set bonus.
- First-clear, boss, star, and mastery-set rewards are stable one-time receipts.
  Replay income is rate-limited to one reduced full-Mission payout per Mission
  per UTC date. `replayRewardEpochByMission` stores the latest paid date and
  merges by the later date, preventing same-day result-ID farming and clock
  rollback alternation.

## Wallet merge and receipt retention

An authenticated wallet save sanitizes both the canonical cloud snapshot and
the active device snapshot before merging them. Mission completion, contiguous
Wave progress, stars, best records, unlocks, result IDs, reward claims,
completion records, and replay epochs merge monotonically. A stale device may
add valid newer progress, but it cannot erase the wallet's existing Campaign
history. Conflicting graph choices continue to prefer the already committed
cloud route.

Receipt history is intentionally bounded to keep wallet profiles small:

- 768 permanent Campaign reward claim IDs;
- 384 processed Campaign result IDs;
- 96 detailed Campaign completion records; and
- 1,024 wallet credit IDs shared by Campaign and server-settled branch rewards.

Cross-device merges retain the newest unique tail within each bound. Date-scoped
daily replay IDs are not stored in the permanent reward ledger because the
per-Mission replay epoch is their canonical one-per-day guard; replay churn
therefore cannot evict first-clear, star, boss, or mastery receipts. Canonical
server-settled branch receipts are reserved before ordinary Campaign credit IDs
are trimmed. The remaining bounded arrays are a replay-resistance cache, not an
authoritative gameplay ledger: durable Mission/star state and the replay epoch
are the long-lived guards after an old attempt/result receipt ages out.

## Runtime settlement contract

The game must call `applyCampaignCompletion` after every authored Wave with the
exact `campaignId`, `campaignRevision`, `missionId`, and `waveId`, plus a stable
unique `resultId`. Internal Waves set `stageComplete: false`; only the authored
final Wave sets it to `true`.

Credit only the returned grants from an accepted settlement, and persist the
returned Campaign progress in the same settlement workflow. For post-loot
metrics, call `finalizeCampaignCompletionMetrics` with the same result ID and the
same mastery eligibility. Launch Continue from `recommendedMissionId` and
`recommendedWaveId`; replay selection must not overwrite that durable
checkpoint.

## Operational notes

- The migration is idempotent; re-sanitizing an already migrated save produces
  the same progress apart from normal `updatedAt` handling.
- The wallet API is a strict sanitizer and persistence boundary, not a complete
  authoritative gameplay verifier. High-value rewards still require the
  existing signed-receipt/server-replay security roadmap.
- Keep the migration manifest while any revision-21 cloud or local save may
  still return. Removing aliases early would safely fall back to Wave 1, but
  would lose legitimate partial checkpoints.
