# Job L — round-3 performance investigation

Working checkout: `/workspace/scicon-revamp/w5-L`, branch `r5/L`, starting HEAD
`7b651a65eee923838b6a2939355a43498c1d0243`. This supplied checkout takes
precedence over the older Windows/experimental-branch workflow.

The completed two-pair alternating comparison meets the requested performance
targets: current Mission 1 medians **52/55 FPS**, aggregate **53.5**, versus
reference **23/26.5**, aggregate **24.75** (ratio **2.162**). Boss is **51.4/56.5**,
aggregate **53.95**, versus reference **26.5/27.5**, aggregate **27** (ratio
**1.998**). All four current scenarios pass. The comparison retains its overall
failed status because the reference scenarios miss the unchanged 30 FPS gate.
No quiet-host or physical-device result is inferred. Standalone smoke now passes
at **54 median FPS**; all **405 revamp tests pass**. The full legacy suite matches
baseline. The complete UI audit passes
**436/436 cases with zero overflows** across all seven viewports.

## Findings and changes

The historical 57.5 FPS round-2 result could not be reproduced on the shared
host. The first same-session reference/current/reference/current comparison
recorded Mission 1 medians **18.8 / 19.3 / 25.0 / 12.1**, with boss medians
**22.0 / 24.2 / 29.0 / 14.9**. All failed the ordinary 30 FPS gate. The resulting
current/reference median-of-run-medians ratios were .717 and .767, but host load
rose sharply during the last current run. These results do not conclusively
attribute the slowdown to one N or P feature.

Chrome traces identify software rasterization/readback pressure: approximately
9.7 seconds of inclusive `GLES2::ReadPixels` time per trace, compared with
3.17–4.86 ms mean renderer CPU sync. Current draw calls per render were lower
than reference; no per-frame nebula generation, filter loop, atlas disablement
or draw-call explosion was demonstrated. A labeled native-DPR diagnostic
reduced framebuffer pixels fourfold and raised its sampled median from 20.2 to
33.6 FPS under nearby but unequal host loads. This supports reducing raster
cost under pressure; it is not controlled proof of a production speedup.

Implemented changes:

- Keep N's fully opaque nebula in its existing native 128×256 CPU-backed texture
  instead of copying it into the 1024² atlas. Its two single-texture seam meshes
  use opaque rendering; transparent landmarks and silhouettes retain normal
  inherited blending. Existing pixels, tint, scrolling and all sector art remain.
- Preserve pooled text-effect labels between animation frames, avoiding an empty
  string assignment followed by restoring the same text every render.
- Add a renderer-owned native-resolution fallback after optional decorative
  detail reaches Low. High immediately restores the original `min(DPR, 2)`;
  explicit Low selects resolution 1. Auto recovers more slowly than it reduces.
- Preserve the fitted canvas CSS box during Pixi autoDensity resizing. Apply
  `image-rendering: pixelated` only below full output resolution, restoring the
  previous style afterward. DOM HUD resolution remains unchanged.
- Capture the startup full resolution for derived background bakes. A special
  scene first visited during Low, or regenerated after context restoration, keeps
  its full-quality source for a later return to High without rebaking on every
  output transition.
- Add opt-in backdrop CPU/atlas diagnostics, reproducible alternating A/B
  aggregation, real-setting raster-transition captures, and focused tests.

High retains all existing artwork and features. Auto/Low deliberately trade
output resolution for smoother rendering under sustained pressure; their image
is not pixel-identical to High. World dimensions remain 390×844. Simulation,
camera, collisions, touch mapping, attack timing, difficulty and rewards are
unchanged. Scott's original art is untouched, no new art files are needed,
and no protected unrelated project was changed. Top-level `api/*.js` remains 12.

## Files and shared hooks

| Files | Purpose |
| --- | --- |
| `services/revamp/performance/AdaptiveRasterResolution.ts` | Raster pressure/recovery policy and CSS-preserving output resize |
| `services/revamp/performance/AdaptiveRenderQuality.ts` | Faster decorative tier reduction only for sustained severe pressure |
| `services/revamp/performance/RendererBudget.ts`, `BackgroundTextureCache.ts` | Retain startup full-quality bake resolution independently of current output |
| `services/revamp/performance/RenderQualityControls.tsx` | Explain that Auto may adjust pixel resolution |
| `services/revamp/backgrounds/BackdropTextures.ts`, `SectorBackdrop.ts` | Native opaque nebula source; existing retained art and layout |
| `services/revamp/performance/RendererProfiler.ts` | Time sector backdrop separately and expose its read-only snapshot |
| `services/pixi/PixiGameRenderer.ts` | Small `REVAMP(L)` raster and text-retention hooks |
| `tools-revamp/perf/compare.mjs` | Alternating immutable builds; all measured legs, errors, hashes and host load retained |
| `tools-revamp/perf/profile.mjs` | Explicit diagnostic quality and DPR selection using real persisted settings |
| `tools-revamp/perf/raster-check.mjs` | High→Low→High on 360×640, mobile and desktop through offline QA |
| `tests-revamp/L/compare.test.mjs`, `raster.test.mjs` | Measurement integrity, pressure/recovery, CSS sizing and raster policy |
| `tests-revamp/N/runtime.test.mjs` | Exact native pixels/opacity, alpha inheritance, atlas/native ownership and restoration |
| `tests-revamp/J/contextRestore.test.mjs`, `quality.test.mjs` | Full-quality cache restoration, current flash contracts, severe governor timing |
| `tests/pixiEnvironmentPreload.test.cjs`, `pixiParallaxMotion.test.cjs` | Execute the real added renderer-budget dependency in existing VM fixtures |
| `docs/revamp/perf.md`, `REVAMP_NOTES_L.md` | Attribution, acceptance evidence and handoff |

The shared renderer hooks are one import/owned raster-policy instance, startup
DPR capture, a three-line observation/application dispatch immediately after J's
detail governor, and conditional clearing of text only when a pooled effect view
changes away from text. No edits to `services/gameLogic.ts`, `App.tsx` or
`components/StartScreen.tsx` are required.

For the parallel O/R integration, `renderer.resolution` is now adaptive output;
`renderer.screen` and the engine world retain their logical size. Full-quality
derived background bakes that must survive a later High transition should use
`fullRenderResolution(renderer)`; native pixel-art sources retain their authored
resolution. Incoming boss/background logic should keep simulation independent
of output DPR.

The inherited J context-restoration fixtures were stale: the texture-bank mock
lacked the merged muted-background methods, and a flash assertion expected an
older boss silhouette behavior. Tests now exercise current actor additive tint,
boss contact-only light, derived-mask restoration and original-art ownership.
The production flash behavior was not changed to satisfy those tests.

## Tuning knobs

`RENDER_QUALITY_TUNING` in `AdaptiveRenderQuality.ts` controls decorative tiers.
Windows are 1000 ms. Ordinary pressure below 50 FPS needs 2000 ms before one
tier reduction; **severe pressure below 30 FPS needs 1000 ms**. Recovery above
57 FPS needs 8000 ms per tier. Budgets remain High 1/1/1, Medium .65/.7/.75,
Low .4/.4/.5 for particles/trails/backgrounds.

`RASTER_RESOLUTION_TUNING` in `AdaptiveRasterResolution.ts` starts collecting
downgrade evidence only at Low decorative detail. Its 1000 ms windows require
2000 ms below 40 FPS, or **1000 ms below 20 FPS**, before Auto selects resolution
1. Recovery requires decorative detail to return through Medium to High and
then another 8000 ms at least 57 FPS. Paused/hidden, invalid or ≥1000 ms-gap
samples reset measurement without discarding the learned automatic output.
Explicit High/Low takes effect immediately and does not rewrite the learned
Auto choice. Startup DPR stays fixed for the renderer's lifetime, as before.

The native nebula dimensions and palette remain in `backgrounds/pixelArt.ts`;
no art/layout tuning was introduced. One atlas remains bounded at 1024²; native
nebula ownership follows the same mission lifetime and context-safe disposal.

## Reproduction

Use new output directories/run IDs; diagnostics preserve existing artifacts.
Keep CPU-heavy suites and Chrome profiling separate from performance acceptance.
The repository's build/typecheck flock wrappers remain in use.

```sh
# Reference checkout prepared once at commit 8ffbd9e with node_modules linked.
# In /tmp/L-ref: npx vite build --outDir /tmp/L-ref-dist
npm run build
npx tsc --noEmit
cp -a dist /tmp/L-review-dist # use a fresh snapshot path
node --test tests-revamp/L/*.test.mjs tests-revamp/N/*.test.mjs tests-revamp/J/quality.test.mjs tests-revamp/J/contextRestore.test.mjs
node --test --test-concurrency=2 tests/*.test.cjs
SCICON_QA_DIST=/tmp/L-review-dist node --test --test-concurrency=2 tests-revamp/*/*.test.mjs
SCICON_QA_DIST=/tmp/L-review-dist node --test tests-revamp/F/smoke.test.mjs
node tools-revamp/perf/compare.mjs --reference /tmp/L-ref-dist --current /tmp/L-review-dist --runs 2 --run-id L-review-ab
node tools-revamp/perf/raster-check.mjs --dist /tmp/L-review-dist --output /workspace/scicon-revamp/qa/L-review-raster
npm run qa:ui -- --dist /tmp/L-review-dist --run-id L-review-ui
node tools-revamp/perf/profile.mjs --dist /tmp/L-review-dist --stage mission-1 --quality high --dpr 2 --seconds 12 --output /workspace/scicon-revamp/qa/L-review-profile
```

The comparison retains ordinary mobile DPR 2, normal damage, seed 12345,
60-second Mission 1/45-second boss, screenshots and no video. Failed legs with
real game FPS remain in its median-of-run-medians; browser-rAF fallback values
do not enter ratios. An even run count uses the mean of its middle pair.
Missing legs cannot pass. The ≥.9 relative target uses unrounded ratios, and no
ordinary QA threshold is relaxed. `profile.mjs --dpr 1` is a labeled attribution
diagnostic, never the acceptance device profile.

## Validation and retained evidence

- Frozen builds: reference `/tmp/L-ref-dist`, pre-L `/tmp/L-before-dist`, first
  implementation `/tmp/L-final-dist`, latest severe-pressure implementation
  `/tmp/L-severe-dist`. Completed comparison hashes: reference index
  `52d495b238707879082c93e4a9dcd719fccbc259cf0f9d1d485600fcf16c3190`, current index
  `d1bf4055f0936ee50481d2aba5a6781fe3248ad0c7f5c0eb692f42e0e278e028`.
- Initial alternating reports: `/workspace/scicon-revamp/qa/L-ref-before-{1,2}/`
  and `L-current-before-{1,2}/`; aggregate `L-validation/before-comparison.json`.
- Traces, phase/GL counters and images:
  `/workspace/scicon-revamp/qa/L-trace-{reference,before,native-diagnostic}/`.
- Build/typecheck of the latest snapshot: `L-validation/build-severe.log` passes
  with the existing chunk-size warning and Director exclusion check;
  `L-validation/tsc-severe.log` contains no TypeScript errors.
- Focused N/compare tests: 32/32 pass in `L-validation/background-compare.log`.
  Later focused aggregate: 40/40 pass in `focused-final.log`; latest severe
  policy checks: 24/24 pass in `severe-pressure.log`.
- Legacy baseline and latest completed run: **1782 passed, 7 failed, 12 skipped**
  in both `legacy-before.log` and `legacy-complete.log`.
  `legacy-complete-parity.json` confirms exact failure-name parity after removing
  only the two checkout path prefixes. Six failures are unavailable
  `director/node_modules/pngjs`; the seventh is the inherited campaign matrix
  coverage assertion.
- Revamp baseline: **377 passed, 4 failed** in `revamp-before.log`: smoke FPS
  and its parent, plus the two stale J fixtures described above. An intermediate
  post-fix run has **401 passed, 2 failed** in `revamp-after.log`. The final full
  suite passes **405/405** in `revamp-final.log`, including smoke at **52 FPS**.
- Smoke failures remain intact: baseline 18.0 FPS, intermediate full-suite 8.9,
  isolated 17.9, early severe-pressure isolated **25.0**. Failed artifacts:
  `/workspace/scicon-revamp/qa/smoke-2026-10-18T05-18-40-859Z/`; log
  `/workspace/scicon-revamp/qa/L-validation/smoke-severe.log`.
- Final standalone smoke passes **5/5**, median **54 FPS**, minimum 21.1:
  `/workspace/scicon-revamp/qa/smoke-2026-10-18T05-36-38-440Z/smoke.json` and
  `L-validation/smoke-final.log`. No smoke or playthrough thresholds changed.
- High→Low→High on `/tmp/L-severe-dist` passes all **9 phases**, world/CSS
  checks and browser/runtime error checks in `L-raster-final/report.json`.
  Mobile backing sizes are 780×1688 → 390×844 → 780×1688; desktop DPR 1 remains
  390×844. This proves setting transitions, not Auto activation or FPS acceptance.
  The earlier failed diagnostic remains in `L-raster-check/`.

Before screenshots:
`/workspace/scicon-revamp/qa/L-current-before-1/mobile/mission-1/000-mission-start.png`,
`.../002-time-10s.png`, and `/workspace/scicon-revamp/qa/L-trace-before/profile.png`.
After implementation transition screenshots:
`/workspace/scicon-revamp/qa/L-raster-final/mobile/01-high.png`,
`02-low.png`, `03-high-restored.png`, with equivalent files under `360x640/`
and `desktop/`. These captures come from different simulation moments and are
not pixel-difference comparisons. Final visual observations follow below.

## Completed A/B and visual review

Final complete comparison: `/workspace/scicon-revamp/qa/L-final-ab-complete/compare.md`
with JSON, raw samples, invocation/build hashes and all eight scenario results.
The run order is reference 1 → current 1 → reference 2 → current 2.

| Build/run | Mission 1 median | Boss median | Host load 1m start → end |
| --- | ---: | ---: | --- |
| Reference 1 | 23.0 | 26.5 | 13.92 → 18.13 |
| Current 1 | 52.0 | 51.4 | 18.13 → 22.35 |
| Reference 2 | 26.5 | 27.5 | 22.35 → 16.34 |
| Current 2 | 55.0 | 56.5 | 16.34 → 17.07 |

Both ≥.9 relative targets and the current Mission 1 ≥45 target pass. All current
scenarios have complete duration/coverage, nonblank output, game-render-loop FPS,
advancing simulation, fixed 390×844 world and zero browser/runtime errors. The
reference's below-30 failures keep the combined report's overall status failed.
This is shared-host SwiftShader evidence; it does not reproduce the historical
quiet-host reference or establish performance on a physical phone.

The earlier `L-final-ab/` attempt ended with shell exit 143 during the second
reference boss capture. Its partial reports and `INTERRUPTED.md` are retained.
Completed current medians there were 46.9/57.5 FPS; they are not substituted into
the completed comparison above. The fresh comparison completed while its process was
regularly polled. The cause of the earlier exit 143 was not established.

Final diagnostic traces at `L-trace-final-auto/` and `L-trace-final-high/` confirm
Auto resolution 1 and explicit High resolution 2 at device DPR 2. Auto's sector
update averages 0.045 ms with zero Graphics clears; the backdrop atlas remains
healthy. The instrumented High capture measures 22.1 FPS with full detail under
load, so the Auto improvement is not a claim that forced High is now cheap.
The high-quality source art is preserved while Auto deliberately reduces output.

Reviewed final gameplay screenshots:

- `/workspace/scicon-revamp/qa/L-final-ab-complete/current-2/mobile/mission-1/007-time-30s.png`
- `/workspace/scicon-revamp/qa/L-final-ab-complete/current-2/mobile/boss/009-time-30s.png`
- `/workspace/scicon-revamp/qa/L-raster-final/mobile/03-high-restored.png`
- `/workspace/scicon-revamp/qa/L-raster-final/360x640/02-low.png`

The dark blue sector scenery and station silhouettes remain behind bright enemy
formations, ships, pickups and coin popups. Boss warning lanes and break markers
remain readable. Native output has chunkier diagonals, while High restores finer
edges and full decorative effects. The short viewport keeps its letterbox and
HUD clearance. Existing opening wave/enemy banner placement can overlap in the
short capture; that presentation issue was not changed by this performance work.

## UI validation

The full seven-viewport matrix passes **436/436 cases**, with **0 overflows,
0 failed cases, 0 navigation failures, 0 blank screens and 0 coverage/browser
errors**. Natural gameplay victory passes on every viewport. All 1418 screenshot
references are retained in the combined report and original groups.

Final report: `/workspace/scicon-revamp/qa/L-ui/report.md` (JSON alongside).
The existing coverage-checking `ui-report.mjs` combines two disjoint groups on
the same frozen `/tmp/L-severe-dist` build, with case-level provenance:

- `L-ui-short`: 186 cases at 360×560, 390×664, 412×700; 702 screenshot references.
- `L-ui-standard`: 250 cases at 360×640, 390×844, 430×932, desktop; 716 screenshot references.

Actual commands, run after all FPS measurements:

```sh
npm run qa:ui -- --dist /tmp/L-severe-dist --run-id L-ui-short --devices 360x560,390x664,412x700
npm run qa:ui -- --dist /tmp/L-severe-dist --run-id L-ui-standard --devices 360x640,390x844,430x932,desktop
node tools-revamp/qa/ui-report.mjs L-ui /workspace/scicon-revamp/qa/L-ui-short/report.json /workspace/scicon-revamp/qa/L-ui-standard/report.json
```

No case was retried or omitted. Visually inspected
`L-ui-short/360x560/victory-long.png` and
`L-ui-standard/360x640/settings.png`: long result content retains its deliberate
inner scrolling while the title, score and actions fit; menu panels and controls
retain their styling. Final gameplay-victory screenshots exist for all devices
under `L-ui/<device>/victory-gameplay.png`.

## Commit handoff and limits

Git metadata is read-only at
`/workspace/scicon-revamp/gh/.git/worktrees/w5-L`; the local staging/commit attempt
was blocked creating its lock. Changes remain uncommitted for the integrator;
no metadata workaround was used. Suggested logical commits are renderer/native
texture fixes; profiling/A-B/raster tooling and tests; completed evidence/docs.

No push, deployment or external write API was performed. Real low-end Android
GPU, battery, thermal and physical-touch validation remains outside this headless
session. Under arbitrary shared-host contention even native output may remain
below 30 FPS; that limitation does not waive the requested acceptance gates.
