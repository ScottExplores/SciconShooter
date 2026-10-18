# JOB D — Meta progression, wings and The Open Science Frontier

Implemented on `rv/D`, preserving Scott's existing sprites and all original art files. No new endpoint, database column, art generation, external API write, push or deployment. Top-level `api/*.js` remains at the Hobby limit of 12.

## Player-facing changes

- New-player PLAY launches Mission 1 directly. Cold-open comms and short steering/wing hints overlay active play; no tutorial modal chain. The free Citation Dart joins after 600 active simulation frames. The first successful mission grants the Quorum Crab right wing and announces it in results; continuing adopts that wing without resetting the engine or the left wing's cooldown.
- Left wing is offense; right wing is utility. Both use a damped spring at ±38 world pixels, lag-driven tilt, and existing ship textures. Passive fire scales from 15% to 20% of main DPS at levels 1–5. Specials have 8–20 second cooldowns, large touch buttons and a saved auto-cast toggle. Level 5 evolves each special. Campaign wing ranks follow earned Support research, independently of purchased legacy levels.
- Five research branches with five nodes each: Firepower, Survival, Support, Fortune and Overdrive. Earned Science Credits share the existing coin balance; purchased Tokens are reserved and cannot fund this tree. Research Data comes from medals/goals. Upgrade effects apply to ordinary Campaign and Campaign replay; Weekly Run, archive challenges and lab loadouts keep their existing rules.
- Clear, ≥90% kills and no-hit research medals award Data once per mission/medal. Replays can improve medals. Results count up score/currency, display medals and announce discoveries. Campaign map shows these medals alongside existing route mastery.
- Home's Frontier log has three locally seeded daily goals, five ISO-week goals, claim buttons, an informational login streak, research tree, earned procedural cosmetics and readable field logs. Gameplay emits kill, pickup and part-break events; settlements add clear/no-hit goals. Failed attempts retain event progress and contribute active time.
- Forty sector beats plus a cold open tell **The Open Science Frontier** with Explorer, Dr. Vega and the Paywall Syndicate. Every sector has an intro, midpoint twist, boss taunt and liberation line. Inline transmissions auto-dismiss, are skippable, and preserve movement. Two earned field logs extend the story.
- Active-time discoveries at approximately five-minute intervals through the first hour. Full cadence, currency costs, medal rules, goal targets and persistence details: [docs/revamp/progression.md](docs/revamp/progression.md).

## Files and integration boundaries

| Area | Files |
| --- | --- |
| Versioned pure rules and shared API sanitizer | `services/revamp/progression/core.js`, `index.ts`, `types.ts`, `earnedWingEntitlements.js` |
| Gameplay/persistence adapters | `services/revamp/runtime/flight.ts`, `profile.ts`, `useProgression.ts` |
| Wing simulation, tuning, procedural cosmetics | `services/revamp/wings/wingRuntime.ts`, `wingTuning.ts`, `wingCosmetics.ts` |
| Story routing | `services/revamp/story/campaignStory.ts`, `services/storyBeats.ts`, `services/storyTransmissionSchedule.ts` |
| New UI | `components/revamp/ProgressionPanel.tsx`, `MissionMedals.tsx`, `useCountUp.ts`, `WingSupportHud.tsx`, `FirstFlightHint.tsx`, adjacent CSS |
| Existing UI integration | `StartScreen.tsx`, `SquadHangar.tsx`, `SupportShipPreviewDialog.tsx`, `WaveVictoryOverlay.tsx`, `CampaignMap.tsx`, `StoryTransmission.tsx`, `story-transmission.css` |
| Profile integration | `services/squadProgression.ts`, `services/walletProfileDirtyStore.ts`, `api/_lib/walletProfiles.js` |
| Verification | `tests-revamp/D/*.test.mjs`, optional `tests-revamp/D/mobile-smoke.mjs` |

Shared-file hook comments use `// REVAMP(D):`:

- `App.tsx`: build Campaign loadout; mount inline comms; commit meta through the existing campaign journal/dirty marker; settle research receipts; preserve purchased-credit reserve on wallet hydration; hand earned wings to a continuing engine; wire HUD/home/results/map.
- `services/gameLogic.ts`: create optional Campaign runtime; observe actual targets/hits; emit goal events; apply research projectile/shield/Fortune/Overdrive modifiers; delegate wing simulation; snapshot mission metrics; adopt next mission loadout at a settled boundary. No new simulation clock or world size.
- `services/pixi/PixiGameRenderer.ts`: read spring tilt/evolution halo and draw optional earned cosmetics through existing pooled Graphics. Original textures remain untouched.
- `components/GameCanvas.tsx`: pass typed commands, publish wing snapshots at 8 Hz, retain summaries on failure and adopt the settled loadout before continuing.

`PermanentSquadState.revamp` is version 1 inside the existing snapshot envelope. Old profiles sanitize to an empty research ledger. Local storage and the existing wallet snapshot sync carry it. Durable result/purchase/claim receipts prevent reward replay; event receipts use absolute totals so storage retries cannot duplicate kills. The API uses the same pure sanitizer, keeps the 256 KiB cap and existing purchase protection, and derives the paid reserve from authoritative entitlements. Earned wing grants are bounded level-1 entitlements, not arbitrary incoming ownership/levels. No schema migration or endpoint is needed.

## How to test

```sh
node --test tests-revamp/D/*.test.mjs
npx vite build
npx tsc --noEmit
```

The typecheck baseline has six existing errors in `services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts`: two missing prototype JSON imports and four unknown atlas coordinates. This job must leave that exact error set unchanged. Vite's existing large-chunk warning is informational.

Final validation: **54/54 focused tests passed**, Vite production build passed, and `tsc --noEmit` output exactly matched the captured six-error baseline (`diff` empty). Browser smoke reported zero page errors, 25 research nodes and a reachable Continue action. The 390×844 direct-PLAY checks reached the first-flight flow within 0.7–2.1 seconds after initial home loading. Screenshots include the compact 320×568 medals and first-unlock layout.

Optional browser smoke after building (requires Playwright and Chrome installed locally; neither is added as a dependency):

```sh
REVAMP_PLAYWRIGHT_MODULE=/path/to/@playwright/test/index.js \
REVAMP_CHROME=/usr/bin/google-chrome \
REVAMP_QA_DIR=/tmp/scicon-D-qa \
node tests-revamp/D/mobile-smoke.mjs
```

The browser harness intercepts all API/external traffic, launches a fresh mobile profile at 390×844/DPR 2/touch, checks the 25 research nodes and immediate PLAY flow, observes wing deployment, and checks results at 390×844 and 320×568. Results use an explicit fixture; this is not a claim of a complete autoplay mission. Screenshots/report from this workspace are under `/workspace/scicon-revamp/qa/D-*`. Actual-engine tests separately exercise damage, shields, target counters, cooldown pause behavior and continuous mission handoff.

Manual checks: clear Mission 1, inspect first-unlock/Data medals, Continue into Mission 2, toggle wing auto-cast, return Home, buy an earned Support node, claim a completed goal, equip a trail, reload, and inspect retained state. Use preview to inspect all six special types and their evolved versions. Test wallet merge conflicts against a local stub before any live sync exercise.

## Tuning knobs

- `core.js`: credit/Data costs, five rank gates, goal pools/targets/rewards, medal payouts, first-hour cadence and cumulative branch bonuses.
- `wingTuning.ts`: passive ratios, cooldown floors, ±38px spacing and spring/tilt constants. `wingRuntime.ts`: entrance at 600 ticks, active skill damage/radius/duration and evolution changes.
- `flight.ts`: research Overdrive kill charge and active duration; fractional Fortune accumulator; regular target classes included in accuracy medals.
- `campaignStory.ts`: authored-sector cue mapping and readable auto-dismiss duration. `storyBeats.ts`: every narrative line and field log.
- New component CSS: safe-area spacing, thumb targets, reduced motion, compact result layout. No viewport-dependent combat tuning.

## Known gaps and handoff

- JOB D supplies direct entry, inline onboarding, the timed wing entrance and first-clear reward. It does not retime authored Mission 1 waves, drops or boss placement to force a 60-second clear; that content remains for the enemy/boss/pacing jobs. Existing mission IDs, boss order, route gates and legacy mastery are preserved. Narrative sector aliases follow the requested story while mapping to installed sector membership.
- The new tree and Campaign wing ranks are earned-only. Existing main-ship/shop economy and non-Campaign loadouts remain legacy behavior; redesigning those wallet flows was explicitly outside this job. Competitive paths receive none of the new research bonuses.
- No live wallet/Supabase round-trip or prize/leaderboard operation was performed. Tests cover schema round-trip, entitlement protection, merge conflicts and local transactions without external writes. Existing ResearchHub/Weekly UI remains wired to its original flows.
- Final balance still needs real-device playthrough data: mission durations, earned credits per minute and useful active-skill opportunities. The first-hour clock settles at results, so a threshold may be shown one mission later. Concurrent independent offline playtime merges conservatively using max rather than sum. Very long-lived receipts may eventually need server compaction before the existing 256 KiB cap.
- `docs/AI_COLLAB_WORKFLOW.md`, required by AGENTS/CLAUDE, is absent in this snapshot and nearby supplied checkouts. Explicit user instructions and existing repository conventions were followed.
- This environment mounts the normal worktree Git administrative directory read-only. Real commits on `rv/D` were made with writable alternate Git metadata at `/tmp/revamp-D-gitmeta`, pointing at the shared repository. Inspect current clean status with `GIT_DIR=/tmp/revamp-D-gitmeta GIT_WORK_TREE=/workspace/scicon-revamp/wt-D git status`. The normal worktree index is stale; once its administrative directory is writable, `git reset --mixed HEAD` refreshes that index without changing files. Do not interpret its stale staged deletions as the committed tree.
