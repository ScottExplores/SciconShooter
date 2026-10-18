# Round 3 — G: reconcile the dense campaign

Legacy failures: **44 → 7**, below the requested **≤14**. Final: **1,782 pass / 7 fail / 12 unchanged skips** (1,801 entries). The starting baseline was **1,736 / 44 / 12**. This work uses the supplied `r3/G` checkout. The detailed [reconciliation report](docs/revamp/test-reconciliation.md#round-3--reconciliation-after-job-i) accounts for all 44 starting failures and preserves the round-2 history.

## Changes and files

- **Safe historical saves:** `shared/campaignWaveMigration.js`, `services/campaignProgression.ts`, and `api/_lib/walletProfiles.js` prevent old revision-25 partial checkpoints from becoming clears after I shortened Missions. Generated content advances to revision 26. Exact historical IDs, genuine clears, claimed rewards, result receipts, and replay epochs survive; unknown/foreign/current-revision retired aliases remain rejected.
- **Authoring parity:** Director server validation and its formation editor match browser density/cadence, vocabulary, cycle and group bounds. Positive/negative parity, editor preservation, and compile/decompile tests cover the real schema.
- **Real content defects:** `services/revamp/curve/authorCampaign.mjs` restores the Vanguard pair in Mission 4 and introduces Research Drone in Mission 17 before its crowded third-wave debut. Existing M4 grid cadence, M17 cohort size/health/rewards, pressure budgets, and all mission reward/graph/branch identities survive. Missions 1 and 2 are byte-identical to the starting campaign. Generated campaign and curve report, introduction audit, and focused roster tests now cover all 34 roles, 25 art families, and 52 packs.
- **Honest invariant tests:** shared `tests/helpers/campaignRevampAssertions.cjs` verifies dense grids, exactly two specialists, limited beats, varied curved entries, pressure/recovery, slot geometry, spawn timing, projectiles, telegraphs, pickups, and terminal encounters. Remaining updates cover current record art, enemy-only arrival counts, and I's explicitly QA-gated loadout branch.
- **Reward pacing:** `tools-revamp/measure-opening.mjs` records actual configured collection duration. The opening test retains ordinary total time ≤90 seconds, requires the major-boss five-second collection, bounds its encounter to 60–90 seconds, and allows total time ≤92.5 seconds only for the restored 2.5-second increment. Real-engine collection and exactly-once coin banking regressions remain passing.
- **Generated evidence:** refreshed `docs/CAMPAIGN_ECONOMY_SIMULATION.md` and `artifacts/campaign-balance/nonboss-runtime-matrix.json` with its Markdown report. The matrix uses the same 390×844 world on both hosts and current Campaign flight/wing controllers, includes extracted runtime modules in its digest, and checks all 300 mobile/desktop pairs. Controlled power/support fixtures are documented; balance thresholds remain strict.

## Shared-file hooks and boundaries

No new edits to `services/gameLogic.ts`, `services/pixi/PixiGameRenderer.ts`, `App.tsx`, or `components/StartScreen.tsx`. Preserve G's existing reward-window/preview hooks and I's existing dense-formation/QA loadout hooks when integrating. No art files, dependency manifests, lockfiles, or prohibited City Mechanical/scooter files changed. Top-level `api/*.js` remains **12**. No push, deploy, or external write API was used.

## How to test

```sh
node tools-revamp/curve-report.mjs --check
node tools-revamp/validate-campaign.mjs
node tools/restage-enemy-introductions.mjs --check
node tools/simulate-campaign-economy.mjs
node tools/simulate-campaign-nonboss-balance.mjs --write
npx tsc --noEmit
npm run build
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id G-r3-after
```

Use a new run ID on repeat. Final logs, before/final failure detail, offline dependency evidence, targeted 101-test schema/migration run, and pacing comparison live in `/workspace/scicon-revamp/qa/G-r3-verification/`.

## Final validation and remaining gaps

- Production build passes; TypeScript has **zero errors**. Full legacy: **1,782 pass / 7 fail / 12 unchanged skips**.
- Full revamp: **267 pass / 2 fail**, both the existing headless FPS assertion and its parent. The final stricter pacing/reward check passes **6/6**; focused schema/migration coverage passes **101/101**, plus **8/8** parity checks.
- Six legacy failures are inherited missing `director/node_modules/pngjs` imports. The dependency is unavailable offline; no install was attempted.
- The seventh is the unchanged strict runtime-matrix timing gate: **48 first-visible delay breaches / 216 dead-air breaches**. All 600 measured cells and current digest are checked in: **592 clears / 6 deaths / 2 timeouts**. This supports clear-route coverage for all 50 Missions, not timing/balance approval. Worst examples: M14 Wave 1 visibility **2.22s**, M12B Wave 3 dead air **5.83s**; 212 dead-air cases belong to later authored waves.
- All authoritative device-pair fields match. Mixed entity totals include cosmetic particles with random lifetimes and differ by at most two in 120 pairs; only that field is excluded from equality and is independently bounded below 132. Raw counts and comparison details are preserved. Seeded gameplay is deterministic; cosmetic totals are not.
- Economy report/check passes unchanged conservation guarantees (**5/5**); authored expected income is 20,820 and clear-only income 18,345 after I's shorter wave lists. Campaign validator, introduction audit, generator check and diff check pass.

## Knobs and limits

Revision-25 historical IDs in `shared/campaignWaveMigration.js` are immutable history, never regenerated from current content. Tune authored formations in `authorCampaign.mjs`, then regenerate/check through `curve-report.mjs`. Vanguard pressure belongs to its own cooldown; the ordinary grid's cadence is unchanged. Mission 17's Research Drone fires at six-second intervals. Reward collection stays five seconds for a major boss and 2.5 seconds for an ordinary live-coin sweep.

Matrix fixtures are balance stress probes, not evidence that a first-time player has earned those upgrades. No renderer FPS is measured by that tool. Headless QA uses normal damage, fixed seed, local fixtures, and software rendering; its 30 FPS threshold is unchanged.

## Screenshots and review

| Stage | Before | After |
| --- | --- | --- |
| Mission 1 | `/workspace/scicon-revamp/qa/I-hud-final/mobile/mission-1/001-time-5s.png` | `/workspace/scicon-revamp/qa/G-r3-after/mobile/mission-1/001-time-5s.png` |
| Boss | `/workspace/scicon-revamp/qa/I-hud-final/mobile/boss/002-time-10s.png` | `/workspace/scicon-revamp/qa/G-r3-after/mobile/boss/002-time-10s.png` |

Viewed all four PNGs. The dense rows, crisp hulls, distinct projectiles, and intact boss surface detail remain coherent. Large left controls/phase banners and occasional score-popup overlap remain polish limitations. These are different simulation instants, not frame-identical comparisons. Full images/videos: `/workspace/scicon-revamp/qa/G-r3-after/`.

Mobile QA has zero console/page errors and the same 390×844 world in both scenarios. Mission 1 observes 28 enemies, eight hostile bullets and no damage; boss observes 20 hostile bullets, two lost lives and no death. Both fail only the existing FPS gate (7/8 median); no device-performance or full-Mission browser-completion claim is made. Fixed-step pacing tests separately establish completion.

## Commit handoff

Staging was rejected with `Unable to create '/workspace/scicon-revamp/gh/.git/worktrees/w3-G/index.lock': Read-only file system`. Changes remain uncommitted for the integrator as requested. Suggested commits: migration/schema correctness; authored coverage and dense-content assertions; regenerated evidence and reconciliation notes. No alternate Git metadata workaround was used.
