# Job I — Combat feel, dense openings and animated sprites

Implemented in the supplied `r2/I` worktree. The explicit branch/worktree instructions take precedence over the old Windows paths in `docs/AI_COLLAB_WORKFLOW.md`. No existing art files were edited, deleted or replaced. No API handlers, deployment settings, wallet rules or external write APIs were changed or used.

## Player-facing changes

- Opening formations contain 30–32 hulls, including two special enemies. Mirrored curved entries assemble into breathing grids; small groups peel into announced dives while the remaining rank fires staggered slow rounds. The final six survivors regroup through an eased, shootable transition instead of lingering at the edges. Regrouped divers retain bounded stationary fire.
- Mission 1 has two full grids, the six-second power drop, magnet, brief breathers and Peer Reviewer. Missions 2–5 and the optional route use three grids or two grids plus an encounter. The same generator rebuilds sectors 2–3 so the 7% regular-pressure growth and 10% sector reset remain coherent.
- Spawn admission now accommodates the complete authored formation independently of its slow-fire pressure index. Reduced-effects mode cannot lower simulation admission. Shield Bearers expose their hull for 90 of every 240 active ticks; both the shield drawing and collision gate use the same combat clock.
- Accepted hits produce a 50 ms warm additive tint at 30% opacity, with a 125 ms per-target cooldown. Bosses and mini-bosses light only the impact point; the whole-sprite white filter and sustained legacy wash are removed. Existing contact sparks remain authoritative.
- Player bolts have chunky cores and ship-family colours; hostile rounds have dark outlines, bright cores, faint halos and source-family glyphs. Solid hostile bounds follow both collision axes. Special authored hazards retain their own presentation. Muzzle effects reconstruct the shot origin across multiple fixed simulation steps.
- Regular enemy engines animate in stepped frames; unanimated hulls pulse subtly. Existing player banking and thruster strips gain a small idle bob. Pickups retain their spin strips and add bob, glints and magnet trails. Explosion playback adds stepped punch and ember stages over Scott's original frames.
- Wings render at 76% of the player's nominal visual span, with idle bob, spring banking and animated thrusters. Campaign spacing is ±76 world pixels, with edge staggering to keep the player's centre visible. Actual wing projectiles start at the enlarged nose; damage, cadence and shot counts are unchanged.
- The wing auto-cast toggle moves to the lower-left margin after browser review found its old central position covering the wing muzzle and player hull. Its 44 px touch target and behavior remain intact.
- A single Mission 1 steering strip lasts about three seconds or dismisses on actual canvas steering. Authored boss/mini-boss waves suppress it completely. Dense-wave titles use a small 1.35-second header strip; enemy introductions and the chain counter stay above the formation. The chain counter hides during bosses.
- Far layers and planet props use 42% exposure and cached 40% desaturation; stars are subdued and space props move toward the margins. Existing parallax remains. Derived textures are retired with their atlas views; original asset textures remain untouched. No per-frame colour filters were added.

## Measured pacing and limits

`tools-revamp/measure-opening.mjs` runs the real engine, ordinary baseline ResearchHub loadout, earned wings, seeded QA pilot and fixed 60 Hz steps. It records actual damage sources, assembly, bullets, kills and completion, including hit-stop and transitions. It does not use forced kills or renderer timing.

| Mission | Completion, seed 12345, god coverage |
| --- | ---: |
| 1 — Operation Open Galaxy | 65.93 s |
| 2 — Citation Storm | 63.87 s |
| 3 — Paywall Siege | 62.37 s |
| 4 — Open Galaxy | 63.40 s |
| 5 — Bastion Protocol | 89.75 s |
| Open Orbit optional route | 68.18 s |

Normal-damage Mission 1 at seed 12345 also clears in **65.93 s**, with **61 kills, three lives, first enemy at 0.20 s, 28 visible enemies, 25 holding and eight enemy bullets**. Its assembled grid appears within eight seconds. Seed 54321 clears in 82.07 s with three lives. Seed 1 defeats the reactive pilot at 39.25 s; the pilot also loses missions 3–5 at seed 12345. These results are preserved: god coverage establishes timing, not human survival or dodgeability. The pilot underestimates some actual hull clearance and does not master every dive/boss pattern. No bot behavior or QA gates were weakened.

First-boss canonical authoring now uses 160 hull HP and 52.8 HP per cannon (33%), retaining its stable event ID, rewards, phases and mechanics. `campaignBossEconomy.ts` and the promotion check agree, so later boss promotion does not overwrite the pacing. Later bosses retain their existing HP; their complete mission durations are outside this opening-sector timing proof.

## Files and shared hooks

- Campaign: `services/revamp/curve/{authorCampaign.mjs,difficultyCurve.ts}`, new `services/revamp/formations/DenseFormationFire.ts`, `EnemyBehaviorRuntime.ts`, `RevampCombatBridge.ts`, `services/campaignBossEconomy.ts`, generated campaign/escalation JSON, `game-config/validate.ts`, curve-report tool and `docs/revamp/difficulty-curve.md`.
- Rendering: `FeelPresentation.ts`, new `CombatSpriteMotion.ts` and `ProjectileReadability.ts`, `ArcadeEffectPool.ts`, wing runtime/tuning and `WingSupportHud.css`, new `services/revamp/presentation/{CompactFormationIntro,backgroundGrade,firstFlightHint}.ts`, `PixiEnvironment.ts`, `PixiTextureBank.ts`, and `FirstFlightHint` component/CSS.
- Verification: `tests-revamp/I/`, focused B/D assertions, and legacy rendering/pacing assertions migrated from intentionally replaced behavior. Wallet, security and leaderboard tests are untouched. `supportShipPreview.ts` keeps six-ship preview cohorts so the larger campaign template can still assemble and demonstrate defensive support fire.
- `services/gameLogic.ts`: small `// REVAMP(I):` hooks for projectile-family metadata, wing muzzle origin, device-independent admission and the authored cohort release clock.
- `services/pixi/PixiGameRenderer.ts`: small delegated animation/intro hooks, wing body/thruster hooks, compact enemy callout positioning, and removal of the obsolete whitewash.
- `App.tsx`: marked hooks pass live mission/wave/boss/active state to the hint and make noncompetitive QA Campaign launches use the Campaign loadout. `StartScreen.tsx` is untouched.

## Reproduction

```sh
node tools-revamp/curve-report.mjs --write
node tools-revamp/curve-report.mjs --check
node tools-revamp/validate-campaign.mjs
node tools-revamp/measure-opening.mjs --output /tmp/I-normal.json
node tools-revamp/measure-opening.mjs --god --output /tmp/I-coverage.json
node --test tests-revamp/I/*.test.mjs tests-revamp/B/*.test.mjs tests-revamp/D/*.test.mjs
npx tsc --noEmit
npm run build
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --seconds 75 --run-id I-campaign-final
npm run qa:playthrough -- --devices mobile --stages boss --god --seconds 90 --run-id I-campaign-god
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --seconds 20 --run-id I-hud-final
```

Use a fresh run ID for subsequent captures. The harness serves built `dist` on loopback and fulfills external requests offline. Browser plugin unavailable; used the repository's Playwright/system Chrome workflow. Main viewport is 390×844 at DPR 2. The observed world is 390×844.

## Evidence and self-review

Before:
- `/workspace/scicon-revamp/qa/I-before-mission/mobile/mission-1/001-time-5s.png`
- `/workspace/scicon-revamp/qa/I-before/mobile/boss/001-time-5s.png`

First visual iteration:
- `/workspace/scicon-revamp/qa/I-visual-v1/mobile/mission-1/001-time-5s.png`
- `/workspace/scicon-revamp/qa/I-visual-v1/mobile/boss/001-time-5s.png`

The comparison shows the formerly empty opening becoming a grid, the whitewashed boss returning to detailed cyan/gold art, and brighter combat over quieter scenery. Review found and fixed the chain counter covering a top-row enemy, oversized entry titles obscuring curves, and widened wings needing coherent muzzle positions. Headless SwiftShader FPS remains below the harness's 30 FPS gate; no device-GPU or subjective audio-quality claim is made. Final verification results and artifact paths follow below.

## Final automated verification

- `npm run build`: passed, including Director exclusion. Existing large-chunk warnings remain.
- `npx tsc --noEmit`: **zero errors**, matching the supplied clean TypeScript baseline.
- Complete campaign validator: **60 missions, 34 roles, 51 packs**; curve authoring/idempotence check passed. Canonical boss promotion is current.
- Full legacy suite: **1,485 passed / 236 failed / 12 skipped**, versus baseline **1,481 / 240 / 12**. Exact failure-name comparison found **zero new failures**. Four previously failing campaign/preview contracts now pass; remaining failures are outside this job.
- Full revamp suite: **264 passed / 2 failed**, versus baseline **244 / 2**. The same single underlying SwiftShader FPS assertion and its parent fail; final smoke median was **14.6 FPS**, below the unchanged 30 FPS gate. Startup, nonblank rendering, advancing simulation, console health and offline fixture checks pass. This full rerun includes the QA loadout correction, its two policy regressions and the final HUD CSS.
- Full-mission mobile/desktop/reduced-effects simulation snapshots are identical. Focused timing/density tests pass for the entire opening sector and route.
- `git diff --check` passes. Top-level `api/*.js` remains **12**. Changed art files: **zero**.
- Machine-readable baseline/final test comparisons, build/typecheck logs and normal/god pacing telemetry: `/workspace/scicon-revamp/qa/I-verification/`.
- Real browser hint proof: **27 px tall**, visible for **3.138 seconds** without input; an actual canvas touch dismisses it **0.9 ms** after the input event. Boss intro has no hint, with zero page/console errors. Screenshot: `/workspace/scicon-revamp/qa/I-hint-proof/mission-1-hint-first-frame.png`; exact observations: adjacent `hint-proof.json`. Earlier attempts in `I-hint-check*` exposed screenshot/assertion deadlines under host load; this final observer-based proof measures the actual DOM/input timing without changing gameplay clocks.

## Mobile captures and QA launch diagnosis

`/workspace/scicon-revamp/qa/I-final/report.md` and adjacent `report.json` preserve the first final-build normal-damage run. Mission 1 samples reached **29 enemies / six hostile bullets**; the reactive QA pilot lost three lives and died at observed 23.9 seconds. The boss run reached defeat with one life remaining and up to 15 hostile bullets. Both scenarios had **zero page/console errors** and the same **390×844 world**. Their median FPS was **10.3 / 13.4**, so both reports fail the unchanged performance gate.

Investigating the M1 discrepancy found an existing QA launch bug: QA uses the noncompetitive `campaign-lab` run mode, which selected the legacy loadout even after the progression hook granted Citation Dart. This made the wing fire immediately with legacy damage/cadence and omitted Campaign's deployment and special behavior. A real-engine reproduction with that exact loadout died at **23.9167 simulation seconds / 26 kills / four survivors**, matching the browser; normal Campaign clears in 65.93 seconds. Player/enemy collision dimensions do not depend on loaded image dimensions. The small App hook now selects the Campaign loadout for QA Campaign launches while retaining noncompetitive mode and settlement exclusions. The bot, damage model, fixture power and QA gates are unchanged. The earlier captures remain useful visual evidence but are not Campaign balance evidence.

The pre-fix explicit `--god` boss capture completed its 90-second observation in `/workspace/scicon-revamp/qa/I-final-god/`: boss defeat was visible by observed 27.4 seconds, zero damage/deaths, 15 hostile bullets maximum, zero page/console errors. Median **12.8 FPS** still fails the performance gate. Its `mobile/boss/clip.mp4` is verified H.264, 390×844, 9.96 seconds. The short desktop capture in `I-final-desktop` also has zero page/console errors and the identical 390×844 world; median 21 FPS remains below the gate.

Final screenshots reviewed at full size:
- `/workspace/scicon-revamp/qa/I-final/mobile/mission-1/001-time-5s.png` — dense, separated grid, clear projectiles and enlarged wing.
- `/workspace/scicon-revamp/qa/I-final/mobile/mission-1/005-time-20s.png` — readable surviving formation and hostile rounds near the player.
- `/workspace/scicon-revamp/qa/I-final/mobile/boss/002-time-10s.png` — detailed cyan/gold boss, broken cannon, no tutorial or white wash.
- `/workspace/scicon-revamp/qa/I-final-god/mobile/boss/006-boss-phase.png` — boss defeat and reward effects in explicit god coverage.

Short clips: `/workspace/scicon-revamp/qa/I-final/mobile/mission-1/clip.mp4` and `/workspace/scicon-revamp/qa/I-final/mobile/boss/clip.mp4`. The Mission 1 clip is verified H.264, 390×844, 10 seconds. Full source WebM recordings and GIF previews sit beside them. The final independent visual/code review found no additional blocking issue. Existing post-defeat banners remain large; combat readability was the focus of this pass.

With the actual Campaign wing runtime visible, review caught the old central `WingSupportHud` auto-cast pill covering a wing's nose and, during the boss, the player's hull. The final CSS moves this intact control to the lower-left margin. No HUD controls were disabled to hide it.

## Corrected Campaign capture

`/workspace/scicon-revamp/qa/I-campaign-final/report.md` records 75 seconds per mobile scenario after the launch correction. Mission 1 clears with **61 kills, three lives and zero damage**, reaching **28 simultaneous visible enemies and eight hostile bullets**. The visible result card reports 1:00 flight time; the 60 Hz measurement including transitions is 65.93 seconds. The normal boss also clears, retaining one life. Both scenarios report **zero page/console errors**, fixed **390×844 world**, and median FPS **13.5 / 9.8**. Their only report failure is the unchanged 30 FPS gate.

Reviewed screenshots:
- `/workspace/scicon-revamp/qa/I-campaign-final/mobile/mission-1/001-time-5s.png` — assembled grid, specials peeling off, clear fire.
- `/workspace/scicon-revamp/qa/I-campaign-final/mobile/mission-1/003-time-15s.png` — enlarged Campaign wing and separate fire lanes; exposed the old central toggle placement.
- `/workspace/scicon-revamp/qa/I-campaign-final/mobile/mission-1/018-time-66s.png` — actual victory, 61 enemies, three lives.
- `/workspace/scicon-revamp/qa/I-campaign-final/mobile/boss/002-time-10s.png` — phase-two lane telegraph and intact detailed boss art; exposed the same toggle over the player.

Clip: `/workspace/scicon-revamp/qa/I-campaign-final/mobile/mission-1/clip.mp4` — verified H.264, 390×844, 9.96 seconds. These captures precede only the final CSS relocation of the toggle; combat code is unchanged by that relocation.

The corrected-loadout `--god` boss run is `/workspace/scicon-revamp/qa/I-campaign-god/report.md`: actual boss defeat, three lives, zero damage/deaths, up to 20 hostile bullets, no page/console errors, 390×844 world. Median 12.3 FPS fails the unchanged performance gate. Reviewed defeat screenshot: `mobile/boss/007-boss-phase.png`; short clip: `mobile/boss/clip.mp4` under that run directory.

## Final HUD verification

After the CSS relocation, rebuilt and reran TypeScript plus both full test suites with the results above. `/workspace/scicon-revamp/qa/I-hud-final/report.md` then captured 20 seconds each of mobile Mission 1 and boss on that build. This short pass verifies placement; the longer preceding runs establish completion and god coverage. Viewed both screenshots below: the player and wing noses are now unobstructed, the toggle sits at the lower-left edge, and no tutorial appears in the boss scene. Both scenarios retain 390×844 world and zero page/console errors; median 14.2 / 15.4 FPS still fails the unchanged performance gate.

Final after screenshots and clip:
- `/workspace/scicon-revamp/qa/I-hud-final/mobile/mission-1/001-time-5s.png` — dense opening.
- `/workspace/scicon-revamp/qa/I-hud-final/mobile/mission-1/003-time-15s.png` — clear player/wing silhouettes and muzzle lanes.
- `/workspace/scicon-revamp/qa/I-hud-final/mobile/boss/002-time-10s.png` — preserved boss detail and unobstructed player.
- `/workspace/scicon-revamp/qa/I-hud-final/mobile/mission-1/clip.mp4` — final short combat clip.

## Tuning knobs

- Formation count, role mix, slot spacing, pickup timing and wave beats: `authorCampaign.mjs`. Regenerate through the tool, not by hand-editing JSON.
- Pressure growth/reset and focused DPS/TTK assumptions: `difficultyCurve.ts`. Pressure is separate from admission capacity and is not a claim of equal live bullet counts.
- Staggered fire, six-survivor regroup and cadence: `DenseFormationFire.ts`. Existing 42-tick entry grace, 48-tick edge warning and shared hostile-bullet caps remain.
- `HIT_TINT_DURATION_MS=50`, `HIT_TINT_COOLDOWN_MS=125` in `FeelPresentation.ts`; `WING_VISUAL_RATIO=.76` in `CombatSpriteMotion.ts`; wing offset/muzzle constants in `wingTuning.ts`.
- `FAR_BACKGROUND_EXPOSURE=.42`, star exposure `.54`, desaturation `.40`, and `FIRST_FLIGHT_HINT_MS=3000` in their presentation modules.

## Commit handoff

Staging failed with `fatal: Unable to create '/workspace/scicon-revamp/gh/.git/worktrees/w2-I/index.lock': Read-only file system`. Changes remain uncommitted, as requested for this case; no alternate metadata workaround was used. Suggested logical commits: campaign/choreography, combat rendering/wings, tutorial/background, and verification/handoff. No push or deploy occurred.
