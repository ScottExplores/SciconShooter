# Job Q — result safe rectangles, centering and living frames

Worktree: `/workspace/scicon-revamp/w4-Q`, branch `r4/Q` (the supplied checkout).
Scott's original art is preserved. No home-screen layout, combat, API, wallet,
or reward-calculation changes. No external writes, push or deployment.

## Changes

- Victory and campaign/boss completion reserve a measured rectangle inside the
  original record frame. Long mission names, full scores, all three medals,
  campaign reward, Research Data and frontier unlocks remain available in an
  independently scrolling region. A small cue indicates more rewards below.
- Continue and Hangar / Campaign Map / Return Home remain outside the scrolling
  region. Defeat, boss defeat and weekly results similarly pin their action dock
  while only the summary scrolls. Dynamic viewport units and all four safe-area
  insets bound the complete presentation.
- Result controls are opaque and full size from first paint. Defeat entrance
  motion applies to the decorative frame and summary, with no delayed action dock
  or footer. The weekly score retains its gold color through the count-up spans.
  Pressed result controls use brightness feedback without shrinking their target.
- The desktop launcher scales its fixed-size iframe. A result-only hook compensates
  button minimum height for that scale, preserving at least 44 visible CSS pixels
  without changing the shell or simulation world.
- Centered stat cells, full-width reward labels/values and balanced result rows
  replace the offset icon/text groups. The banner title fits its painted cavity.
- Shared frame effects add traveling edge light, a masked gold-metal sweep, and
  breathing/glinting crown and bottom gems. Existing medal stamps/sparkles,
  count-up scores and reward reveals remain. New looping effects animate only
  transforms/opacity, use no render loop and disappear with reduced motion.
- UI audit now checks each centered line/value (>3px deviation), declared image
  frame interiors, visual viewport / env safe-area bounds and declared minimum
  targets (including desktop iframe scale). Icon capsules and independent badges
  are measured as their actual designed groups; planted regressions cover both.
  SVG labels use their declared bounds and actual rendered image scale. Vertical
  alignment measures the complete text group even when a normal scrollport shows
  only part of it; horizontal alignment still checks each exposed line.
- The all-screen audit also caught wrapped Daily Gift amounts at 412/430px.
  The existing four-column phone reward grid now extends through 430px; all
  reward text, art, and padding remain intact. This is scoped to Reward Center.
- Matrix retains 360×640 and 390×844, adds 360×560, 390×664 and 412×700, and includes
  430×932 plus the real 1280×800 desktop launcher/iframe. Added longest-authored-name,
  campaign-complete, boss-victory and boss-defeat fixtures to the existing isolated
  bridge. Production result components and real authored names are used.

## Frame measurements and knobs

The source art has an opaque dark cavity, rather than an alpha hole. Alpha was
checked together with central dark-color runs and visual inspection. Bounds are
conservative rectangles clear of beveled corners, lamps and inward metal notches.
`data-frame-inner-rect="left top right bottom"` declares percentage coordinates
of the frame element, not CSS inset distances. CSS and the checker use the same
coordinates. A scrollport clips content to that region; its later slices are
also inspected.

| Panel | Original PNG size | Declared safe rectangle |
| --- | --- | --- |
| `record-card-body.png` | 343×583 | `18.5 16 81.5 84` (x64..279, y94..489) |
| Winged victory header / `plaque-body.png` | 581×282 | `20.5 47 79.5 77.4` after the existing image placement |
| `scicon-game-over-panel-tall.png` | 768×1024 | `19 13 81 87` |
| `scicon-defeated-plaque.png` | 960×225 | `27 18 73 66` |
| Hangar animated trace label (all 24 frames) | 320×96 | `7.5 25 92.5 75` (alpha ≤1 inside x24..296/y24..72) |
| Cyan token-exchange button face | Procedural CSS | `14 16 86 72` (above the painted lower rail) |

Frame light timing lives in `components/revamp/frame-effects.css`: 3.6s rail
travel, 2.8s gem breathing, 4.6s glint and 6.8s metal sweep. The effects are
pointer-transparent and masked to retained art; reduced motion removes them.
`--result-target-size` defaults to 44px and increases only for a scaled iframe.
No requestAnimationFrame loop is added by the new result components.
Defeat's summary gap is 8px, reduced to 6px below 740px height; its action dock
keeps a 6px gap. These presentation knobs live at the `REVAMP(Q)` block near the
end of `components/game-over-presentation.css`.

## Files and shared hooks

- `components/WaveVictoryOverlay.tsx`, `wave-victory.css`,
  `components/revamp/ResultRewards.tsx`: frame-safe victory content and action dock.
- `components/GameOverPresentation.tsx`, `game-over-presentation.css`: defeat and
  weekly frame, safe area, scrolling summary and fixed controls.
- `components/SquadHangar.tsx`: measured trace-frame and token-button face
  declarations, with no Hangar layout or purchase behavior change.
- `components/UIOverlay.tsx`, `mission-loading-screen.css`: balance the existing
  total horizontal padding around the HUD score and Cancel launch label; outer
  widths and the HUD's numeric glyph budget remain unchanged.
- `styles/revamp-ui.css`: extend the Daily Gift phone grid breakpoint to 430px.
- `components/revamp/{FrameEffects.tsx,frame-effects.css,ResultScroll.tsx,useResultViewport.ts}`:
  reusable light treatment, overflow cue and desktop target compensation.
- `services/revamp/qa/ui.ts`: additional guarded fixtures; no real persistence.
- `tools-revamp/qa/{ui-audit.mjs,ui-geometry.mjs,ui-svg-geometry.mjs,result-capture.mjs}`: matrix,
  geometry checks, before/after snapshots, live resize, positive safe-area
  emulation and motion evidence. `tests-revamp/Q/` plants real browser faults.
- `tools-revamp/qa/ui-report.mjs`: rejects incomplete coverage and reports made
  with an older geometry engine; every case retains its build/checker provenance.
- `tests-revamp/H/ui-report.test.mjs`: derives expected case count from the device
  matrix instead of hardcoding four sizes. Coverage assertions remain intact.
- `docs/revamp/qa.md`: new contracts and reproduction instructions.

`App.tsx` hooks are marked `REVAMP(Q)`: wrap each game-over summary/action group
and extend the existing presentation-only QA scene switch. Game state, settlement,
callbacks and save guards are retained. `services/gameLogic.ts`,
`services/pixi/PixiGameRenderer.ts`, and `components/StartScreen.tsx` are untouched.

## Verification

Final build (`npm run build`, including Director exclusion) and `npx tsc --noEmit` pass.
Logs: `Q-results/validation/final-build.log` and `final-types.log` under the QA
artifact root. Final source snapshot: `/tmp/Q-gift-fixed-yav35rc5/dist`.
Earlier result captures use `/tmp/Q-verified-dist`; the only subsequent product
change is the scoped Daily Gift breakpoint. The stale `/tmp/Q-final-dist` and its
failed recheck are retained as diagnostics, not accepted final evidence.

The final full revamp suite completed: **335 passed / 2 failed (337 total)**.
The only failures are unchanged Job J fixture expectations (`getMutedBackground`
stub and boss `hitFlash`); pristine HEAD reproduces exactly the same two failures
(3 passed / 2 failed). The final FPS smoke passes at **58.0 FPS median**
(29.2 minimum), with no concurrent UI browsers. Final logs and telemetry:
`Q-results/validation/final-revamp.log`, `final-smoke.json`.
Evidence: `Q-results/validation/contextRestore-pristine-head.log`,
`contextRestore-pristine-head-manifest.json`, and `contextRestore-comparison.json`
under the QA artifact root. All 16 imported runtime source files and the test
are unchanged against HEAD.

Earlier high-load diagnostics are retained: the untouched build failed the
identical FPS smoke at 21.9 FPS (`/tmp/Q-baseline-smoke.log`); earlier changed
build runs measured 17.8 and 28.0 FPS. Host load was around 20–22 across 8 logical
CPUs, versus 8.5–9.7 during the final passing smoke. Those failures were not waived
or overwritten, and the 30 FPS gate is unchanged.
The first combined playthrough ended with SIGTERM during boss capture and is
retained as incomplete at `/workspace/scicon-revamp/qa/Q-results-gameplay/`.
Mission 1 before interruption measured 20.7 FPS; final complete runs are below.

Result-specific evidence passes: **40 cases, 0 geometry/control/browser faults**.
All **44 held-button checks** remain at least 44 outer-screen CSS pixels;
**10 entrance samples** keep defeat/weekly controls fully opaque and stationary.
The actual env probe observes top/right/bottom/left insets of 24/16/28/16px.
Live resizing to 412×560, all count-up final values, and a live reduced-motion
preference change pass (zero running animations afterward).
Reports: `/workspace/scicon-revamp/qa/Q-results/after/report.md` and
`/workspace/scicon-revamp/qa/Q-results/index.md`.

The complete UI matrix passes **436/436 cases, zero violations, zero browser or
coverage errors, zero navigation failures, and zero blank screens**.
Report: `/workspace/scicon-revamp/qa/Q-ui/report.md` (JSON and screenshots alongside).
It includes 32,756 DOM center checks, 308 SVG center checks, 3,659 frame-interior
text checks, and 13,512 safe-control checks. All 29 batches use the same strict
DOM/SVG checker hash (`8f2c506366fae4df12142d16a68e4aab562ce461c0573db7adb68162df2bcae2`).
415 unaffected cases use the verified result build; 21 home/gift guards use the
final gift-fixed build. Each case retains its build and source report provenance.
All original failed/interrupted diagnostics remain available; missing cases and
older checker versions cannot be composed into a passing report.

Complete per-stage gameplay checks pass on the final build, without god mode:

| Stage | Duration | Median / P10 FPS | Largest sample / screenshot gap | Result |
| --- | --- | --- | --- | --- |
| Mission 1 | 60.2s | 57.5 / 48.0 | 1.5s / 5.5s | Passed |
| Boss | 45.7s | 53.5 / 42.4 | 1.7s / 5.5s | Passed; boss HP observed |

Reports and visually reviewed screenshots:
`/workspace/scicon-revamp/qa/Q-final-mission-1-stills/` and
`/workspace/scicon-revamp/qa/Q-final-boss-stills/`.
Both have zero runtime/browser errors, retain the 390×844 simulation world,
and keep the unchanged 30 FPS and capture-completeness gates.
These completed runs use `--no-video`: a prior video-enabled Mission 1 run at
36 FPS stalled for 56.8 seconds and correctly failed evidence completeness.
That failed run, including its video, is retained at `Q-final-mission-1/`.
The final still-image runs capture continuously every ~5 seconds and at state
changes; they do not claim complete video evidence.

The baseline and final full post-change legacy suite both report **1,781 passed /
8 failed / 12 skipped (1,801 total)**. The eight failure names match exactly;
zero additions. Logs: `/tmp/Q-baseline-legacy.log`, `/tmp/Q-final-legacy.log`.
Comparison: `/workspace/scicon-revamp/qa/Q-results/validation/legacy-final-comparison.json`.
The remaining inherited failures concern missing art, runtime-matrix fixtures,
combat test loading and the existing phone-home wordmark assertion.

## Screenshots and visual review

Before images and report: `/workspace/scicon-revamp/qa/Q-results/before/`.
After images and report: `/workspace/scicon-revamp/qa/Q-results/after/`.
Each has `360x560`, `390x664`, `412x700`, `430x932`, `desktop` directories.
[Comparison index](/workspace/scicon-revamp/qa/Q-results/index.md) links all five
matching before/after sets. Representative minimum-height comparison:
[before](/workspace/scicon-revamp/qa/Q-results/before/360x560/victory.png) /
[after](/workspace/scicon-revamp/qa/Q-results/after/360x560/victory.png).
[Tall long-content result](/workspace/scicon-revamp/qa/Q-results/after/430x932/victory-long.png)
shows all rewards and controls within the original frame.
Files named `victory.png`, `defeat.png`, `weekly-result.png` are matching before/
after fixtures; `*-scroll-*.png` cover complete inner content. After also includes
`victory-long`, `boss-result`, `boss-defeat`, `campaign-complete`, motion samples,
live viewport shrink and nonzero safe-area samples. The old bridge does not
support the added scenes, so they are explicitly additional after coverage.

The baseline 360×560 victory cuts Continue at the bottom and places the three
secondary controls offscreen. The revised capture keeps every action visible
while long content scrolls wholly inside the frame. Medal/reward alignment is
balanced, and the frame/gems retain Scott's palette and crisp pixel art. Short
screens intentionally require inner scrolling; no reward data is hidden or removed.

Two inherited transient layers remain visible in the gameplay evidence. The
in-canvas `MISSION COMPLETE!` toast fits the viewport but overlaps the left
ability rail; it is outside this DOM/SVG geometry audit. The Dr. Vega victory
transmission intentionally overlays the result header for 5.88 seconds, with an
immediate Skip action. Result navigation stays visible. These unchanged combat
and story layers are separate from the settled result layout; future polish can
reserve a HUD-safe toast lane and a story region instead of overlapping content.
The corresponding source locations are `services/gameLogic.ts:6069`,
`services/pixi/PixiGameRenderer.ts:6496`, and the existing victory-story callsite
in `App.tsx:6041`. No story or combat behavior was changed for this job.

## Reproduce

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test --test-concurrency=1 tests-revamp/*/*.test.mjs
npm run qa:ui -- --run-id Q-ui-review
node tools-revamp/qa/result-capture.mjs --phase after --output /workspace/scicon-revamp/qa/Q-results-review
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id Q-results-review
# The completed per-stage evidence above used --no-video to avoid encoder stalls:
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --no-video --run-id Q-results-stills-review
```

Raw build/type/test logs are retained in `/workspace/scicon-revamp/qa/Q-results/validation/`.

Use stable build snapshots for long browser batches. Let tsc/Vite flock wrappers
finish. Run gameplay FPS captures without concurrent browser or CPU suites.
Headless evidence cannot establish real-phone touch, audio or GPU performance.

## Commit handoff

A local logical commit was attempted. Git cannot create
`/workspace/scicon-revamp/gh/.git/worktrees/w4-Q/index.lock` because the Git metadata
filesystem is read-only. Changes remain uncommitted for the integrator, as allowed
by the task. No push, deploy or external write was attempted.
