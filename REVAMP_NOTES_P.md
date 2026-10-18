# P — Phone combat layout and living arcade feedback

Implemented in the supplied `r4/P` worktree. The task's supplied checkout takes precedence over the older Windows checkout references in `docs/AI_COLLAB_WORKFLOW.md`. Scott's original art is retained. No City Mechanical/scooter files, API handlers, external write APIs, pushes, or deployments were used. Top-level `api/*.js` remains 12.

## Changes

- The player HUD is one 44px control row. Wing specials and auto-cast are inline controls; the large Offense card and separate lower pill are gone. Bomb and ship ability are 52px targets in opposite bottom corners, at 68% opacity when idle. Touch handlers, cooldowns, manual wing casting, auto preference, pause, and tutorial targets remain active. Full counter values remain accessible; large values abbreviate visually.
- Regular enemy scale is globally 1.35, previously 1.1. Dense drones grow from 36×36 to 44×44 world pixels, about 33px on the 360×640 letterboxed arena. Rendering, collision bounds, and the existing formation separation solver consume the same dimensions. The 390×844 simulation world, boss sizes, reward rules, and device fairness are unchanged.
- Regular hulls have restrained idle/exhaust motion and retained additive pixel engine accents. Glow visibility stays stable between frames: quality changes and recycled actor roles update it without repeatedly invalidating Pixi render instructions. Pickups have first-sight bursts, bob/glints, budgeted magnet trails, and local collection flashes. Existing reward text pops and floats. Counter ticks use one 200ms CSS animation per value change, without per-frame React updates.
- Power-up, perfect-wave, chain, and wave feedback share compact header space. Boss warnings reuse Scott's frame in a small header, replacing the full-screen red strobe and central warning. Boss health/name, phase/attack status, and introduction cards are compact and avoid overlapping the player HUD. Boss headers take priority over cosmetic reward toasts; local pickup feedback still appears.
- Existing A hit flashes, event-sized shake/hit-stop, explosion pools, and I projectile/wing animation remain authoritative. New optional glow/trails/bursts use J's governor and existing bounded pools. Reduced motion removes decorative travel/pulses; original steering and mandatory warnings remain readable. No new bitmap assets or per-object blur filters were added.
- Canvas headers account for extra DOM HUD safe-area height using a cached resize measurement. This changes presentation only, including on notched phones; it does not move the arena or collision geometry.

## Files and integration hooks

New modules: `components/revamp/HudCounter.tsx`, `combat-hud.css`; `services/revamp/enemies/EnemyReadability.ts`; `services/revamp/feel/AliveFeedback.ts`; `services/revamp/presentation/{BossHudLayout,CombatHeaderInsets,CompactBossWarning}.ts`.

Existing presentation modules: `UIOverlay.tsx`, `GameStage.tsx`, `WingSupportHud.tsx/.css`, `CombatSpriteMotion.ts`, `FeelPresentation.ts`, `CombatCalloutLayout.ts`, `CompactFormationIntro.ts`, `BossPolishPresentation.ts`, and `BossCueGeometry.ts`. Tailwind output was regenerated.

Shared-file hooks are marked `// REVAMP(P):`:

- `App.tsx`: moves the existing wing JSX into the HUD's `wingControls` prop.
- `services/gameLogic.ts`: imports the shared size constant and emits a presentation receipt for other accepted power-ups.
- `services/pixi/PixiGameRenderer.ts`: delegates label/motion/budget/header layout, safe-area measurement/disposal, and the compact warning. Old central warning implementation was removed.
- `components/StartScreen.tsx`: untouched.

QA additions: named 360×640/390×844 playthrough devices, `tools-revamp/qa/phone-hud.mjs`, and `tests-revamp/P/`. Existing I/J and legacy presentation assertions track the intentional new scale/header geometry without changing collision, frame-rate, security, or campaign timing gates. The campaign matrix generator includes the new size module in its source digest and regenerates actual simulation evidence.

## Validation

`npm run build` passes, including Director exclusion, and `npx tsc --noEmit` exits 0 with no errors. Both were rerun after the final retained-glow optimization. Logs: `validation/P-optimized-build.log` and `validation/P-optimized-types.log`. Final capture snapshot: `/tmp/P-optimized-dist`.

Full `qa:ui` passes: **234 screen/device cases, 691 screenshots, 0 overflows, 0 navigation failures, 0 blank screens, 0 browser errors**. It covers 360×640, 390×844, 430×932, desktop, and natural gameplay victories. Report: `/workspace/scicon-revamp/qa/P-ui/report.md`. This audit uses `/tmp/P-acceptance-dist`; later runtime changes move the canvas first-sighting label from y65 to y74 plus its safe-area inset and avoid redundant engine-glow visibility toggles. Focused checks and final gameplay captures cover those changes. DOM/CSS match the audited build.

Full legacy suite: **1,781 pass / 8 fail / 12 skipped**, exactly matching baseline, including the same eight failure names. Six failures require the absent `director/node_modules/pngjs`; the other two are the inherited strict non-boss timing gate and the StartScreen wordmark assertion. The final suite used `--test-concurrency=2` to reduce shared-host load, with every legacy file included. It was rerun after the final optimization. See `validation/P-complete-legacy.log` and `validation/legacy-complete-comparison.json`.

Full revamp suite after the final optimization: **348 pass / 4 fail**, versus baseline **327 pass / 5 fail**. No new failure names. The remaining failures are F's browser FPS check (17.1 FPS, plus its parent test) and two inherited J context-restoration fixture errors. H's baseline archive-reveal timeout passed in the final run. See `validation/P-complete-revamp.log` and `validation/revamp-complete-comparison.json`. The first-sighting safe-area correction also passed all 29 focused I/P checks; the final full suite includes that correction and the new glow regression check.

**The required 30 FPS median gate remains unmet overall.** The original complete final set missed the gate in three of four cases; subsequent retries are recorded below. These were separate sequential processes against the same immutable build (`distIndexSha256` prefix `82732d96ee55`), retaining the original normal-damage bot, 60-second Mission 1 / 45-second boss durations, video capture, and acceptance thresholds. Both sizes use the same 390×844 world. All four have zero browser/runtime errors and complete reports/clips; both dedicated boss runs observe the boss and its defeat. This is not an overall acceptance pass.

| Final case | Median / p10 FPS | Gate | Host load, start→end |
| --- | --- | --- | --- |
| 360×640 Mission 1 | 28.0 / 22.5 | Fail | 23.53→20.98 |
| 360×640 boss | 30.8 / 22.4 | Pass | 21.46→21.55 |
| 390×844 Mission 1 | 19.0 / 16.3 | Fail | 21.24→25.10 |
| 390×844 boss | 10.5 / 8.7 | Fail | 25.25→33.74 |

After the original set, host load briefly fell near the earlier J reference range. Three failed scenarios were repeated sequentially on the **same unchanged build and capture settings**. The 390px boss passed in that window; load rose again during Mission 1. These results support contention as a contributor but do not establish controlled performance parity or excuse the remaining failures.

| Retry | Median / p10 FPS | Gate | Host load, start→end |
| --- | --- | --- | --- |
| `retry-390-boss` | 38.0 / 25.0 | passed | 7.52→13.28 |
| `retry-390-mission` | 14.6 / 10.1 | failed | 13.26→22.12 |
| `retry-360-mission` | 12.2 / 7.8 | failed | 28.11→26.36 |

The latest per-scenario aggregate is `/workspace/scicon-revamp/qa/P-alive/latest-report.json`; original results remain in `final-report.json`. `review.html` shows the latest per-scenario images and clips and links both reports. Each `retry-*` folder also retains its complete individual report and full recording. `validation/latest-clips.json` verifies the eight before/latest MP4s. Both dedicated boss sizes have passing captures; Mission 1 acceptance remains open. No further F smoke was run after load rose; the previously recorded full suites remain authoritative.

Aggregate evidence for the original complete set: `/workspace/scicon-revamp/qa/P-alive/final-report.json`; full individual reports are in each `final-*` folder below. Eight logical CPUs were available. Recorded load is context, not a waiver or proof of the cause. An isolated F smoke also recorded 17.5 FPS; startup, live rendering, and offline API checks passed (`validation/P-isolated-smoke.log`). Two earlier multi-scenario processes exited 143 for an unreported reason; their checkpointed partial reports and recordings remain separately labeled under `interrupted-after/` and `incomplete-four-scenarios/`. The four separate final processes completed normally.

Sequential diagnostic profiles recorded baseline/final medians of 20.25/15.75 FPS, approximately 35.48/36.18 draws per frame, zero filter passes, and Low visual quality. Average measured renderer sync was 4.12/5.82ms. Host load at capture start was 17.78/26.59 on eight logical CPUs, so these runs do not establish a controlled before/after performance difference or prove that contention alone explains the failures. Raw profiles and `validation/profile-comparison.json` retain this evidence. A separate source/profile review found no additional demonstrated P regression: Graphics clears/frame stay approximately 173, measured feel work is 0.055→0.111ms and effects 0.046→0.214ms, with most renderer growth in Pixi submission (2.60→3.96ms). Those uncontrolled samples do not establish causality. No FPS threshold, simulation rate, or capture quality was lowered to obtain a pass.

A later static review removed an unnecessary hidden→visible toggle on retained enemy glows, which otherwise invalidated Pixi's render group every High/Medium frame. This does not explain the Low-quality failures above, where glows are already hidden. The focused feedback test file passes after the fix, including stable visibility over consecutive High frames, an immediate Low transition, and correct cleanup when views change actor role (`validation/P-glow-visibility-test.log`). Final build, typecheck, and both complete suites include this optimization.

Focused engine evidence: all 25 scale/formation/pacing checks passed. Six opening-sector missions/routes at seed 12345 complete in 62.27–85.23s (Mission 1 65.93s). All 18 coverage runs across seeds 12345, 54321, and 1 complete; normal-damage Mission 1 retains 3, 2, and 2 lives respectively. These automated pilots establish reproducible engine behavior, not human dodgeability.

Baseline full legacy: 1,781 pass / 8 fail / 12 skipped. Baseline full revamp: 327 pass / 5 fail (FPS assertion and parent, an archive-reveal click timeout, and two pre-existing J context-restoration fixture failures). Logs are preserved in `/workspace/scicon-revamp/qa/P-alive/validation/`.

The actual 600-cell campaign matrix was regenerated for the larger collision dimensions; its digest now includes `EnemyReadability.ts`. All 300 mobile/desktop pairs match on gameplay fields; the comparison excludes display dimensions and the mixed cosmetic-particle entity peak, as the existing parity test specifies. Outcomes changed from 592 clears / 6 deaths / 2 timeouts to 590 / 8 / 2, and median clear time changed from 44.4s to 42.3s. M6 expected/no-support now clears; M13 expected/no-support now times out; M14 upgraded/no-support now dies, identically on both devices. Every mission retains a clear route with no power/support inversions. Peak hostile bullets are 51 (ceiling 80), active entities 125 (ceiling 132), and no performance fallback activates. The inherited timing failure remains: first-threat breaches improve 48→18, while dead-air breaches change 216→230 (maximum 5.83→5.90s). These limitations are preserved in the evidence and were not hidden by relaxing assertions. See `validation/P-nonboss-comparison.json` and `docs/CAMPAIGN_NONBOSS_BALANCE_MATRIX.md`.

## Screenshots, clips, and visual review

All evidence is under `/workspace/scicon-revamp/qa/P-alive/`:

- `before/`: untouched baseline build, both requested sizes, Mission 1 and boss, 20 seconds per scenario, screenshots and MP4/WebM/GIF clips.
- `candidate/`: first layout iteration, 15 seconds per scenario. These exposed chain/HUD and boss-name overlaps, which were corrected. Baseline and candidate FPS runs were below 30 under host contention; they remain preserved and are not acceptance claims.
- `hud-candidate/`: original live interaction checks passed; its standalone large-counter fixture lacked viewport metadata and is not valid size evidence. The corrected harness asserts viewport dimensions explicitly.
- `hud-final/`: both requested viewports pass real manual wing/auto, bomb, ability cooldown, pause/resume, and live reduced-motion checks. Every visible control is at least 44px; none overlaps another control or enters the middle 80%; both views retain a 390×844 world. Production-component fixtures with two wings, 10 lives, 99 bombs, and 999M counters pass text and control geometry checks. Simulated 47px top-padding probes are labeled separately. Viewed the live and safe-area PNGs; sampled centered-player positions remain clear and wave/chain labels no longer collide with the HUD. Extreme steering can still take a trailing wing behind a corner button.

Open `/workspace/scicon-revamp/qa/P-alive/review.html` for paired before/latest PNGs and embedded clips. The table below preserves the original complete final set; retry screenshots and clips are linked in their individual reports. All links below are relative to `/workspace/scicon-revamp/qa/P-alive/`.

| Device / scene | Before PNG | Final PNG | Final short clip |
| --- | --- | --- | --- |
| 360×640 Mission 1 | `before/360x640/mission-1/002-time-10s.png` | `final-360-mission/360x640/mission-1/002-time-10s.png` | `final-360-mission/360x640/mission-1/clip.mp4` |
| 360×640 boss | `before/360x640/boss/002-time-10s.png` | `final-360-boss/360x640/boss/003-time-10s.png` | `final-360-boss/360x640/boss/clip.mp4` |
| 390×844 Mission 1 | `before/390x844/mission-1/002-time-10s.png` | `final-390-mission/390x844/mission-1/002-time-10s.png` | `final-390-mission/390x844/mission-1/clip.mp4` |
| 390×844 boss | `before/390x844/boss/002-time-10s.png` | `final-390-boss/390x844/boss/002-time-10s.png` | `final-390-boss/390x844/boss/clip.mp4` |

Before short clips are `before/<device>/<scene>/clip.mp4`. Each final folder has a complete `report.md`/`report.json`, screenshots every five seconds plus event captures, a full WebM, and MP4/GIF extracts. `validation/clips.json` records ffprobe verification for all eight before/final MP4 clips: H.264, the requested viewport dimensions, approximately ten seconds each. Screenshots preserve device pixel ratio and are larger than their CSS viewport dimensions.

Viewed representative PNGs from every final case and the baseline. Before, the large wing card covers the wing and stacked abilities occupy the left lane. After, persistent controls clear the central movement area, larger red hulls remain distinct in the grid and curved entries, and boss name/HP/phase/attack labels are separated. The original boss art retains its scale and detail. The final 390px boss capture visibly reaches the 70-coin reward with one life remaining.

Remaining visual limitations: a trailing wing can pass behind the bottom-left bomb control at extreme steering positions; the existing opening tutorial strip briefly crosses the player before disappearing; nearby score receipts can overlap during clustered kills. These transient effects and edge cases are not evidence of universally unobstructed sprites. The thin HUD has functional 44px controls and deliberately compact numeric text. High/Medium engine glows are disabled by the governor in the Low-tier FPS captures, so those recordings do not prove sustained high-quality effects performance.

## Reproduce and tune

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test --test-concurrency=1 tests-revamp/*/*.test.mjs
node tools-revamp/qa/phone-hud.mjs --run-id P-hud-review
npm run qa:ui -- --run-id P-ui-review
npm run qa:playthrough -- --devices 360x640,390x844 --stages mission-1,boss --output /workspace/scicon-revamp/qa/P-alive --run-id P-review
```

Use unused run IDs. Browser QA serves a stable built snapshot through local offline fixtures. Run CPU-heavy simulation/tests separately from FPS acceptance runs. A god-mode run proves encounter coverage only; normal-damage runs retain their original bot and combat rules.

Tuning: `READABLE_REGULAR_ENEMY_SCALE=1.35`; `combat-hud.css` controls 44/52px targets, corner offsets, idle opacity, and 200ms ticks; `AliveFeedback.ts` controls 135ms pop/155ms settle, 8-world-pixel extra float, 84-frame glints, and 1–3 trail marks. `FeelPresentation.ts` caps new first-sight bursts to 2–4 per render according to quality. Header positions and boss frame ratio live in the presentation modules. A/J's shake, hit-stop, quality hysteresis, and pool ceilings remain unchanged.

## Limits and commit handoff

The unresolved FPS gate needs a controlled run on an idle comparable host and further profiling if it remains below 30; loaded baseline/final runs cannot establish performance parity. Physical-phone GPU, touch ergonomics, battery, and audio still need an on-device playtest. Headless captures do not certify every campaign encounter. Simulated 47px top-safe-area captures are explicitly labeled presentation probes, not hardware measurements.

Local commit attempt failed with `Unable to create '/workspace/scicon-revamp/gh/.git/worktrees/w4-P/index.lock': Read-only file system`. Changes remain uncommitted for the integrator, as requested; no alternate Git metadata workaround was used. Suggested logical commits: phone HUD; enemy scale and regenerated simulation evidence; feel/header presentation; QA and handoff.
