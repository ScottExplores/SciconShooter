# Job H — animated, readable pixel UI

Branch: `r2/H`. Original art files are preserved. No combat/Pixi changes, API endpoints, external writes, deployment, or City Mechanical/scooter changes.

Commit attempt failed because `/workspace/scicon-revamp/gh/.git/worktrees/w2-H/index.lock`
cannot be created on the read-only Git filesystem. Changes remain uncommitted for
the integrator, following the task's explicit fallback. No permission or metadata
workaround was attempted.

## Changes

- Restored the home title with a locally bundled Pixelify Sans wordmark, moved Daily Gift into the header flow, and gave the hero ship enough vertical space. Weekly funding and long winner/proposal copy wrap instead of colliding with the gift tab or pager.
- Shared CSS motion adds title glow, stepped ship idle/thrusters, drifting stars, active-tab beacons, panel entries, button press feedback and bounded pixel ripples. `AnimatedNumber` provides score/progress count-up; `UiPresence` provides an inert closing state and timed removal. Reduced motion responds live, including React ship sprite intervals.
- Rebuilt victory content inside the original frame: banner entrance/shine, count-up, three medal stamps, reward flips, coin particles, discovery card, and a prominent next-mission CTA. Reward values come from accepted campaign settlement and revamp progression; collected Tokens are not added twice. Defeat and weekly results use the original defeat frame with staged presentation and count-up.
- Repaired campaign briefing compression, Hangar currency/card labels and overlapping ship controls, daily reward amounts/claim banner, Signals titles/authors, trophy/past-pick labels, and pause music controls. Long content grows or scrolls vertically. Treasury and record preview have named modal scopes. Long trophy proposal copy flows below the original gold plaque. Shared CSS gives the gameplay token counter a complete glyph cell and separates wing/ability targets on short phones; simulation and input logic are unchanged.
- Prevented dashboard refreshes from remounting the Trophies/More subtree and losing scroll/focus. Decorative nav icons no longer intercept adjacent tab clicks.
- Added `npm run qa:ui`: offline Playwright screenshots plus text Range/box/panel/clipping checks, native field-label measurements, and sibling-control collision checks. Covers populated/empty menus, nested panels, result/story/loading/pause fixtures, and a separate actual-play victory path. Screens with failed navigation or no auditable content fail the report.

## Files and merge hooks

| Area | Files |
| --- | --- |
| Shared motion/font | `styles/revamp-ui.css`, `components/revamp/UiMotion.tsx`, `components/PixelActionButton.tsx`, `public/fonts/pixelify-sans.ttf`, accompanying OFL license/source README |
| Home/menu layout | `components/revamp/HomeFlightDeckBrand.tsx`, `styles/revamp-layout.css`, `components/StartScreen.tsx`, `components/DesktopMobileLaunchShell.tsx`, `components/desktop-mobile-launch-shell.css`, `components/campaign-map.css`, `components/revamp/SignalsPanel.tsx`, `styles/pause-menu.css`, `components/boss-archive/boss-archive.css` |
| Hangar/rewards/loading | `components/SquadHangar.tsx`, `components/ShipCarousel.tsx`, `components/RewardCenter.tsx`, `components/MissionLoadingScreen.tsx`, `components/mission-loading-screen.css` |
| Results | `components/WaveVictoryOverlay.tsx`, `components/revamp/ResultRewards.tsx`, `components/wave-victory.css`, `components/game-over-presentation.css`, `components/MissionRecordPreview.tsx`, `components/WeeklyProposalSelection.tsx`, `shared/record-card/renderRecordCardSvg.mjs` |
| Audit | `tools-revamp/qa/ui-audit.mjs`, `ui-geometry.mjs`, `ui-svg-geometry.mjs`, `ui-fixtures.mjs`, `ui-report.mjs`, `services/revamp/qa/ui.ts`, `tests-revamp/H/`, `docs/revamp/qa.md`, `package.json`; regenerated `styles/tailwind.generated.css` |
| Existing test contracts | `tests/onboardingUi.test.cjs`, `tests/rewardProgression.test.cjs` now assert the in-flow gift entry; `tests/recordCardRenderer.test.cjs` checks full long content and separated SVG columns instead of a fixed font size; `tests/stageTerminology.test.cjs` tracks the record-card cache revision |

Shared-file changes are marked `// REVAMP(H)` (or JSX/CSS equivalent). `index.tsx` imports the shared stylesheet. `StartScreen.tsx` imports the home component/layout stylesheet, replaces the old compact-title/edge-gift markup, adds the screen transition key, fixes two nested render helpers, and adds Treasury semantics. `App.tsx` has two score ticker substitutions and a guarded presentation bridge. The bridge requires **both** `qa=1` and `uiAudit=1`; fixture state freezes GameStage and GAMEOVER settlement, creates no verified receipt, is unavailable with an active wallet, and requires reload to resume gameplay. Pilot/profile/streak saves and wallet syncing are suppressed while a presentation fixture is active; its interactions remain in memory. Natural victory runs without `uiAudit=1`. The desktop shell reserves caption space around the same 390×844 game world; its caption is a sibling of the bordered iframe so neither its text nor its layout depends on clipping.

## Test commands

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test --test-concurrency=1 tests-revamp/*/*.test.mjs
npm run qa:ui -- --run-id H-ui-review
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id H-playthrough-review
```

Choose an unused run ID for each capture. For a focused UI iteration: `npm run qa:ui -- --devices 360x640 --screens home,hangar,victory --no-natural-victory --run-id H-check`. Partial runs are explicitly labeled and do not establish a full pass. A stable `--dist /tmp/...` snapshot prevents another build from removing lazy chunks during navigation. Run browser suites sequentially on this shared SwiftShader host.

## Validation and screenshots

- **Build / types:** final `npm run build` passed (18.88s); `npx tsc --noEmit` exited 0. `git diff --check` is clean.
- **UI audit:** **234/234 cases, zero overflows, navigation failures, blank screens, or browser/coverage errors**. Report: `/workspace/scicon-revamp/qa/H-ui-verified/report.md` (JSON alongside). The four sizes have 58, 58, 58, and 60 cases respectively; 690 PNGs cover the scroll positions. Genuine gameplay victory passed at every size. Per-case build/source provenance is retained; final QA persistence guards do not alter the visible layout.
- **Legacy suite:** **1,480 passed / 241 failed / 12 skipped**, 1,733 total. Every failing test name matches the starting baseline exactly; zero new failures. Final rerun includes the fixture save guards.
- **Revamp suite:** **254 passed / 2 failed**, 256 total. The only failing assertion is F's median FPS ≥30 check; Node also counts its parent smoke test as failed. The untouched built baseline fails the same assertion and parent. All **10 H tests pass**, including normal guest-save behavior, fixture isolation, planted DOM/SVG faults, and report coverage checks.
- **Performance evidence:** built baseline smoke median 5.6 FPS; final smoke 16.5 FPS. Both fail the 30 FPS gate. These shared-host samples do not establish a performance improvement. Final mission/boss playthrough details follow below.

Logs, baseline comparison, scope check, and evidence-link validation are under `/workspace/scicon-revamp/qa/H-validation/`. All 214 screenshot-index links resolve. The complete before/after inventory is `/workspace/scicon-revamp/qa/H-validation/screenshot-index.md`. Top-level `api/*.js` remains 12; original art and combat renderer files are unchanged.

Before images supplied with the task: `/workspace/scicon-revamp/qa/AFTER-r1/` (round-one state) and `/workspace/scicon-revamp/qa/BEFORE/` (earlier remaster). Additional original-source captures: `/workspace/scicon-revamp/qa/H-before-ui/360x640/` and `/workspace/scicon-revamp/qa/H-before-complete/360x640/`. A filename ending in `-error.png` documents a navigation failure and is not a valid panel capture. Additional original-style captures under `/workspace/scicon-revamp/qa/H-before-fixture/` and `/workspace/scicon-revamp/qa/H-before-fixture-desktop/` fill the remaining states. These use a separate original-source build with only the guarded QA presentation bridge added; all 66 original component/style/record-renderer hashes match. Exact instrumentation and build/type-check evidence: `/workspace/scicon-revamp/qa/H-before-instrumentation/BEFORE_INSTRUMENTATION.md`. The screenshot index now covers before evidence for all 58 UI states and both desktop shell states, with no broken historical links.

| Main screen | Before (relative names use `/workspace/scicon-revamp/qa/AFTER-r1/`) | Final after |
| --- | --- | --- |
| Home | `small-home.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/home.png` |
| Campaign | `small-menu-3-Open_Campaign_Map.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/campaign-map.png` |
| Weekly entry | `/workspace/scicon-revamp/qa/H-before-ui/360x640/weekly-entry.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/weekly-entry.png` |
| Hangar | `small-menu-7-Hangar.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/hangar.png` |
| Signals | `small-menu-5-Signals.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/signals.png` |
| Trophies | `small-menu-6-Trophies.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/trophies-weekly.png` |
| More | `small-menu-8-More_daily_gift_ready.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/more.png` |
| Victory | `small-win-9000ms.png` | `/workspace/scicon-revamp/qa/H-ui-verified/360x640/victory.png` |

For a comparison with identical result data, use `/workspace/scicon-revamp/qa/H-before-fixture/360x640/victory.png` and `/workspace/scicon-revamp/qa/H-ui-verified/360x640/victory.png`. The original frame is preserved; the title, stat labels, medals, rewards, and buttons now occupy separate readable regions.

Final requested gameplay diagnostic: `/workspace/scicon-revamp/qa/H-playthrough-verified/report.md`. Both scenarios have zero browser errors, correct 390×844 world dimensions, advancing simulation, and visible boss coverage. The FPS gate remains failed: mission 1 median **13.3 FPS**, boss **18.3 FPS**, on shared CPU SwiftShader. Screenshots were opened and reviewed: HUD labels and controls fit, and boss phase/attack labels remain readable. The mission-end image catches the opening reward animation; the settled natural result is `/workspace/scicon-revamp/qa/H-ui-verified/390x844/victory-gameplay.png`. Videos and per-sample telemetry remain with the report. Combat performance is an outstanding limitation outside H's UI scope.

Reduced-motion diagnostics confirmed the local pixel font loaded, live OS preference changes stopped the sprite timers, and no active UI animations remained. The QA storage shim already isolates native saves; H's additional guards also prevent fixture interactions from committing synthetic data into the temporary profile or entering wallet sync. A runtime regression verifies ordinary guest daily-gift saves still work before a fixture begins.

## Tuning and limits

- Motion: `--sci-ui-enter-ms` 260ms, `--sci-ui-ease`, `--sci-pixel-font`; ship idle 3.2s, thruster 420ms, logo 5.2s, starfield 30/36s. `AnimatedNumber` exposes duration/delay; `UiPresence` defaults to 150ms exit.
- Result sequence: banner 0–0.6s, score 0.35–1.3s, medals 0.65–1.4s, rewards 0.95–1.6s, coin burst 1.15–2.1s, discovery 1.35–1.85s, CTA 1.5–2s. Reduced motion shows settled content immediately.
- Phone hero stage 140px, 104px ship at short heights; Hangar stage 15.25rem mobile/19rem larger layout; gift grid uses 4 columns at ≤390px.
- Pixel art uses nearest-neighbor rendering and stepped integer translations where practical; responsive original frame art still scales to fit the viewport. Body text keeps the existing readable sans-serif. Pixelify Sans 400–700 is local and licensed SIL OFL 1.1.
- Geometry checks cannot infer the painted inside edge of decorative frame images. Visual review supplements the automated report. Normal scroll boundaries, closed details, inactive clipped slides, screen-reader-only labels, and obscured modal backgrounds are intentional exclusions; visible aria-hidden counters and overlapping controls remain checked.
- Screenshots verify settled layout; they do not prove every animation frame, physical-device GPU performance, authenticated wallet flows, or production API behavior. Only Reward Center currently uses the shared delayed close helper; other modal exits retain their existing lifecycle.
