# Round 2 — G: legacy test reconciliation

Legacy suite: **240 failures → 14**, below remaster's **44**. Final run: **1,766 pass / 14 fail / 12 existing skips**, 1,792 entries. The larger count reflects previously aborted suites now loading, plus explicit regression coverage. No deleted tests, new skips, unconditional passes, weakened FPS thresholds, or fabricated measurement evidence.

The complete [reconciliation report](docs/revamp/test-reconciliation.md) classifies all 240 starting failures, lists all 90 touched test files, and compares every remaining failure with remaster.

## Changes and files

- **Receipt/leaderboard correctness:** `api/leaderboard.js` preserves cutoff, session and wallet error precedence before storage reads. E's durable-receipt verification still runs before any score write/replay; explicit proposal recovery still checks canonical metrics and provenance. `tests/helpers/weeklyDurableFixtures.cjs` supplies faithful paired storage rows; negative tests retain independent mocks and strict no-storage counters.
- **ResearchHub identity failures:** `api/researchhub-proposals.js` and `services/revamp/researchhub/serverFeed.js` return 502 when an explicitly requested identity cannot be resolved. Ordinary feed caching remains. Responses expose only a bounded upstream status, never arbitrary transport details.
- **Historical campaign saves:** new `shared/campaignWaveMigration.js`, called from `services/campaignProgression.ts` and `api/_lib/walletProfiles.js`, maps only exact historical per-mission wave IDs. Foreign/current-revision aliases are rejected. Shortened unfinished missions do not become automatic clears/stars/payouts; receipt claims and replay epochs survive. New `tests/campaignCheckpointMigration.test.cjs` exercises browser/server behavior together.
- **Reward collection / preview lifecycle:** new `services/gameplay/missionRewardWindow.ts` restores the five-second major-boss collection window even with zero authored delay, while keeping ordinary sweeps and longer authored windows. Exact Boss Sandbox weapon previews retain their existing lifecycle. New `tests-revamp/G/runtime-contracts.test.mjs` checks 300 movable collection ticks and exactly-once coin banking in the real engine.
- **Authoring/preview correctness:** Director validation accepts the same bounded revamp vocabulary as the browser; support preview declares only the formation pack its chosen cohort uses. The enemy-introduction auditor understands B's additional roles but still reports genuine coverage/readability defects.
- **Test reconciliation:** real recursive TS loading in `tests/helpers/loadService.cjs`; shared bounded authoring checks in `tests/helpers/campaignRevampAssertions.cjs`; faithful audio activation/WebAudio fixtures; current A–F UI, choreography, wave, weekly and narrative assertions. Original security, purchase, session, settlement and lifecycle guarantees remain tested. `docs/CAMPAIGN_ECONOMY_SIMULATION.md` regenerated from current authored data.

## Shared-file hooks

`services/gameLogic.ts` has only the annotated `// REVAMP(G):` helper import, reward-window delegation and explicit preview guard (14 changed lines). `App.tsx`, `components/StartScreen.tsx` and `services/pixi/PixiGameRenderer.ts` are untouched. Integration should preserve all three engine hooks.

No campaign JSON, original artwork, dependency manifests or lockfiles changed. No new API function: top-level `api/*.js` remains **12**. No push, deployment or external write API was used.

## Validation

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id G-after
```

- Production build **passes** (including Director exclusion); TypeScript **zero diagnostics**.
- Legacy: **1,766 pass / 14 fail / 12 unchanged skips**.
- Revamp: **247 pass / 2 fail**. Both failure entries are F's existing active-game FPS assertion and its parent suite; G's three new tests pass. The FPS gate remains at 30.
- Full logs, supplied baseline lists and machine-readable failure details: `/workspace/scicon-revamp/qa/G-reconciliation/`.
- Browser checks use local offline API fixtures, seeded normal play (`god=false`), mobile 390×844, Chromium/SwiftShader. Browser evidence is diagnostic and does not establish physical-device performance or full-campaign completion.

## Remaining failures and integration follow-up

Seven remaining entries also fail in remaster: six asset suites cannot import the missing `director/node_modules/pngjs`, and the runtime-matrix digest is stale. Seven additional entries remain visible: one matrix revision check and six assertions exposing missing Protocol Vanguard coverage / a three-family debut in Mission 17 Wave 3. Job I owns campaign-content changes. Rerun the actual 600-cell matrix after runtime/content tuning; never relabel old results with a new digest.

The mobile QA/F smoke FPS requirement remains failing in this shared headless environment; no performance improvement is claimed. All captured browser console/page errors are reported in the linked QA evidence.

## Knobs

- Major-boss minimum collection: `5` seconds in `services/gameplay/missionRewardWindow.ts`; regular live-coin sweep: `2.5` seconds. Longer authored durations win. Continuous Weekly bypass remains in the engine.
- Checkpoint migration: revision boundary `25`; immutable historical wave suffixes in `shared/campaignWaveMigration.js`. Do not regenerate historical aliases from job I's current content.
- Authoring bounds: shared test helper plus Director/browser schema. Update bounds only with documented design changes; retain every coverage, reward-conservation and negative-validation check.

## Screenshots and visual review

Inspected before/after PNGs (initial G capture, not clean remaster):

| Stage | Before | After |
| --- | --- | --- |
| Mission 1 | `/workspace/scicon-revamp/qa/G-before/mobile/mission-1/008-time-40s.png` | `/workspace/scicon-revamp/qa/G-after/mobile/mission-1/009-time-40s.png` |
| Boss | `/workspace/scicon-revamp/qa/G-before/mobile/boss/004-time-20s.png` | `/workspace/scicon-revamp/qa/G-after/mobile/boss/004-time-20s.png` |

Before median FPS: Mission 1 **5.1**, boss **11**. After: Mission 1 **9.7**, boss **6.7**. All four have zero console/page errors. Both runs fail the unchanged 30 FPS gate. Shared host load and overlapping final legacy verification prevent a performance comparison; differing wall-clock captures are not identical simulation frames.

Visual critique: art palette, silhouettes, HUD and touch buttons remain coherent. The utility-wing notice covers the active boss; bright scenery competes with projectiles; opening density still feels sparse; impact flashes can obscure boss detail. These existing polish issues remain for the content/rendering jobs. The full QA reports, videos and PNG sequences are in `/workspace/scicon-revamp/qa/G-before/` and `/workspace/scicon-revamp/qa/G-after/`.

## Commit handoff

Git staging failed creating `/workspace/scicon-revamp/gh/.git/worktrees/w2-G/index.lock` because Git metadata is read-only. Changes remain uncommitted for the integrator, following the requested fallback. Suggested logical commits: security/save migration + fixtures; authoring/runtime corrections + assertions; final reconciliation/evidence notes.
