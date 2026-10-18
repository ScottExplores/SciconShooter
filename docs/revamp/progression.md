# The Open Science Frontier — progression tuning

Job D implements an additive Campaign progression layer. Science Credits use the existing coin balance with a separate allowance proven by gameplay earnings; Research Data lives in the versioned permanent profile. Purchased Tokens and unproven legacy balances cannot directly fund the new combat tree. Nothing spends wallet RSC or grants a Weekly Run combat advantage. All entitlement rewards use existing ship artwork or procedural accents/trails.

## First hour

The clock below is **active mission time**, accumulated once when each mission result settles. Failed attempts still contribute time. Unlocks appear on the next results screen, so actual presentation can be one mission later than the threshold. Returning to the menu does not advance this clock.

| Active time | Unlock ID | Reward | Implementation identity |
| --- | --- | --- | --- |
| Start | `wing-left` | Citation Dart offense wing | Existing `citation-dart` art |
| First successful mission | `wing-right` | Quorum Crab utility wing | Existing `quorum-crab` art; independent of elapsed time |
| 5 min | `trail-ion` | Ion wake | Procedural `revamp-trail-ion` |
| 10 min | `tree-rank-2` | Second node in every branch becomes purchasable | Prerequisites and both currency costs still apply |
| 15 min | `wing-photon` | Photon Manta laser wing | Existing `photon-manta` art |
| 20 min | `skin-frontier` | Frontier cyan accent | Procedural `revamp-skin-frontier`; original sprites preserved |
| 25 min | `tree-rank-3` | Third node in every branch | Purchase choice, no automatic stat increase |
| 30 min | `story-vega` | Dr. Vega field log | `frontier-vega-log` |
| 35 min | `wing-axiom` | Axiom Orbiter utility wing | Existing `axiom-orbiter` art |
| 40 min | `tree-rank-4` | Fourth node in every branch | Purchase choice |
| 45 min | `trail-aurora` | Aurora research trail | Procedural `revamp-trail-aurora` |
| 50 min | `wing-archive` | Archive Beetle homing wing | Existing `archive-beetle` art |
| 55 min | `tree-rank-5` | Fifth node in every branch | Branch capstone access |
| 60 min | `story-frontier` | Explorer frontier log | `frontier-explorer-log` |

Source of truth: `REVAMP_UNLOCK_CADENCE` in `services/revamp/progression/core.js`. The first right wing is a successful-mission entitlement, not a timed entitlement; its `atMinutes: 1` value is presentation guidance for the opening mission.

## Upgrade tree

Every branch has five sequential nodes. Costs are identical across branches so the decision is about play style. Rank availability is 0 / 10 / 25 / 40 / 55 active minutes. Existing hangar upgrades remain separate.

Campaign wing level is `min(5, 1 + Support research nodes)`: every owned wing starts at level 1, the first four earned Support nodes raise all wings through level 5, and the fifth adds the capstone stat bonuses. Level 5 evolves each wing's special. Purchased legacy wing levels never increase this Campaign rank; their stored values and existing modes remain intact. The hangar labels this distinction. Each wing's base sustained fire budget is 15 / 16.25 / 17.5 / 18.75 / 20 percent of primary weapon DPS, before earned Support bonuses.

| Node | Science Credits | Research Data |
| --- | ---: | ---: |
| 1 | 40 | 1 |
| 2 | 100 | 2 |
| 3 | 210 | 3 |
| 4 | 420 | 5 |
| 5 | 750 | 8 |
| One complete branch | 1,520 | 19 |
| All 25 nodes | 7,600 | 95 |

| Branch | Node 1 | Node 2 | Node 3 | Node 4 | Node 5 | Maximum cumulative effect |
| --- | --- | --- | --- | --- | --- | --- |
| Firepower | Main damage +4% | +4% | +4% | +4% | +4%, one extra projectile | Main damage ×1.20, one extra projectile |
| Survival | Starting shield +1 | Hit recovery +10% | Shield +1 | Hit recovery +10% | One extra starting life | Shield +2, recovery ×1.20, +1 life |
| Support | Wing damage +4% | Cooldown −4% | Damage +4% | Cooldown −4% | Damage +4%, cooldown −4% | Wing damage ×1.12, cooldown ×0.88 |
| Fortune | Collection radius +10% | Credits +4% | Radius +10% | Credits +4% | Radius +10%, credits +4% | Radius ×1.30, earned run credits ×1.12 |
| Overdrive | Charge +8% | Duration +10% | Charge +8% | Duration +10% | Charge +8%, duration +10% | Charge ×1.24, duration ×1.30 |

Percentages add within the branch before producing one multiplier. Fortune applies to gameplay earnings, not reward grants, purchased balances, or RSC. Gameplay consumers must bypass all permanent combat bonuses for Weekly Run. The host also reconciles Survival with the existing life/shield ceilings.

Campaign wing level is `min(5, 1 + earned Support nodes)`, independent of legacy Token-purchased hangar levels. Support nodes 1–4 therefore advance both equipped Campaign wings from level 1 through the level 5 evolution; node 5 adds the listed damage/cooldown capstone. Existing non-Campaign loadouts retain their legacy levels. This prevents purchased Tokens from accelerating the new Campaign wing growth.

Tuning knobs: `REVAMP_CREDIT_COSTS`, `REVAMP_RESEARCH_COSTS`, `REVAMP_TREE_UNLOCK_MINUTES`, and `getRevampBonuses`. The early tree is deliberately affordable after one clear, while a complete branch remains a longer choice. Time unlocks never silently buy nodes.

## Mission medals and Data

| Medal | Requirement in a successful mission | First-time Data |
| --- | --- | ---: |
| Frontier clear | Mission cleared | 1 |
| Precision | At least 90% of spawned targets destroyed | 1 |
| Untouched | Zero damage taken | 2 |

The 90% medal requires a positive spawned-target count and `kills <= spawned`; a zero-target mission cannot receive it. All supplied counters must be finite and nonnegative. Damage is tested without rounding, so even fractional damage invalidates Untouched. Failed missions earn no medals. Replays may earn missing medals, but each mission/medal combination pays Data once. A duplicate result receipt cannot advance goals, time, or rewards.

Four Data for a perfect first clear supports an immediate meaningful branch choice. Across 60 missions, first-time medal supply is at most 240 Data, with additional daily/weekly sources. Replay farming of already-earned medals produces no Data; repeated clears can still advance active goals.

## Goals and login

Three daily goals are chosen deterministically from five event types using the pilot's **local calendar date**. Weekly goals include all five types and seed their targets from the **local ISO week** (Monday boundary, ISO week-year). This is separate from the competitive Weekly Run season boundary.

| Goal type | Daily target choices | Daily reward (Credits / Data) | Weekly target choices | Weekly reward (Credits / Data) |
| --- | --- | --- | --- | --- |
| Destroy enemies | 100 / 150 / 200 | 45 / 1 | 1,200 / 1,500 / 1,800 | 200 / 4 |
| No-hit mission clears | 1 | 60 / 2 | 3 / 4 | 250 / 5 |
| Boss parts broken | 1 / 2 | 55 / 2 | 6 / 8 | 225 / 4 |
| Power-ups collected | 6 / 8 / 10 | 40 / 1 | 40 / 50 | 175 / 3 |
| Mission clears | 2 / 3 | 60 / 2 | 10 / 12 | 250 / 5 |

Each goal pays once. Claiming all five weekly rewards grants either the Frontier accent or Aurora trail, deterministically chosen by week. These are the same cosmetic entitlements offered by cadence and may be unlocked earlier this way; duplicates grant no combat advantage. Claims are available during their active day/week. There are no streak multipliers, attendance requirements, lost upgrades, or lost currency for missing a day. Current and best login streaks are informational only.

Gameplay integration should flush **cumulative** run counters with stable IDs, for example `{ id: runId + ':' + localDate + ':kills', runId, kind: 'kills', amount: totalForThatDate, mode: 'total' }`. Updating the same receipt uses the highest observed total, so repeated UI flushes and sync retries cannot double count it. Counters must reset when the local date changes. Delta mode is supported only with a distinct receipt per delta.

`settleRevampMission` always records clears and no-hit clears. It does **not** record kills, parts, or pickups by default because the gameplay flush already did. `recordCombatEvents: true` is available for isolated simulations without live flushing. Settlement `durationMs` is the mission segment duration, not the lifetime of a reusable game engine. Its `scienceCreditsEarned` input includes only the mission grant actually credited at that step, excluding all wallet purchases. When the final collected-coin sweep and any late mastery grants are credited, `recordRevampEarnedCredits` registers a separate durable receipt for that actual amount. This helper grants no currency, medals, playtime, or goal progress itself. A duplicate or zero-value final callback cannot add earnings twice or erase the initial receipt.

## Persistence and migration

`PermanentSquadState.revamp` is optional in old saved data and sanitized into `RevampProgress` version 1. Existing permanent and wallet profile envelope versions remain intact. The same UMD rules in `core.js` are imported by the typed browser facade and required by the existing wallet API sanitizer, preventing divergent client/server schemas. The existing localStorage and wallet snapshot flow carry the additive field; no endpoint or database migration is required.

The authoritative Research Data calculation is:

```
legacy migrated Data + first-time mission medals + claimed goal Data − purchased-node costs
```

Displayed `researchData`, `researchDebt`, and branch levels are derived. Version 1 never trusts a standalone `researchData` counter. An older unversioned Data balance migrates once into `legacyResearchData`. Invalid numbers, invalid IDs, duplicate receipts, unsupported goal IDs, and invalid cosmetic selections are rejected or normalized.

Science Credit allowance is derived from `earnedCreditsByRunId` plus claimed-goal Credits, less tree purchase debits. Mission earning records require a matching durable settlement receipt. Repeated settlement/sync never adds them twice; conflicting duplicate amounts merge conservatively using the smaller value. Standalone `scienceCreditsEarned` and `scienceCreditsSpent` fields are recomputed, not trusted. `getRevampSpendableCredits(state, balance)` exposes the lesser of proven unused earnings and `max(0, balance - paidCreditReserve)`. The reserve is the server-owned purchased-token subset, reconciled from authoritative wallet entitlements after cloud sync, purchases, and paid spends. The API overrides incoming reserve values and rejects a new tree debit that would cross the protected paid balance. This also prevents a paid refill from reactivating historical earnings already spent in the legacy hangar. Conservative local merges choose the larger reserve; only an authoritative wallet settlement can lower it.

Existing profiles start with zero unproven earning allowance and begin accruing it through new flights and goals. An old profile without `paidCreditReserve` defaults to zero locally until its first authoritative wallet synchronization supplies the actual purchased-token reserve. New paid purchases update the reserve before hydration. No new field is trusted as authority over wallet entitlements, and no paid-currency schema changes are required.

Mission-result IDs and goal-claim IDs remain durable. Recent event detail is retained for the current/preceding goal period window and pruned when new gameplay events arrive. Stable cumulative IDs keep each run to approximately one receipt per event kind/date. Purchase receipts merge by identity; earned rewards never merge by adding balances. Concurrent distinct offline purchases retain both debits. If their combined Research Data cost exceeds earnings, the debt persists and blocks further purchases until covered. A missing node predecessor disables its bonus without refunding its already-recorded cost. Coin reconciliation remains owned by the existing wallet conflict flow; `getRevampCreditLedger` exposes total earned/spent Credits for conservative legacy-profile migration.

Active playtime merges using the greater total, rather than adding potentially overlapping run histories. This can lose unsynced playtime from genuinely independent simultaneous devices; it cannot count the same synced run twice. UI preferences merge deterministically in the pure fallback merge; the host wallet conflict flow should preserve the pilot's explicit snapshot choice.

The existing API retains its 256 KiB sanitized snapshot cap. Permanent receipts are intentionally never dropped merely to fit a limit, since doing so could allow old rewards to replay. Very long-lived profiles may eventually need server-owned compact receipt ranges or a larger server schema; this change does not weaken the cap. Old local event detail can temporarily reappear through a stale snapshot merge until the next gameplay flush prunes it.

## Validation

Run `node --test tests-revamp/D/progression.test.mjs`. Tests cover malformed-state migration, exact medal thresholds, result/reward idempotency, all 25 node purchases, rank gates, conservative offline merge debt, deterministic daily/weekly rotation, ISO year rollover, local date and daylight-saving boundaries, cumulative event counters, weekly cosmetics, durable receipts after pruning, positive login streaks, and the complete first-hour cadence. Root integration also runs `npx vite build` and compares `npx tsc --noEmit` to the repository's existing baseline.

Remaining balance work: use actual mobile mission completion times and credit yields to adjust node costs and daily target choices. Unlocked cadence story logs are readable in the Research panel, backed by `FRONTIER_FIELD_LOGS` in `services/storyBeats.ts`. No telemetry or external write is needed to tune the pure rules locally.
