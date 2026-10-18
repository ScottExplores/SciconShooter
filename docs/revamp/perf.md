# Rendering performance — Job J

Branch: `r2/J`, baseline `176863a`. Local production builds, Chrome 155,
Playwright Core, SwiftShader, mobile 390×844 / DPR 2. No external API writes.

## Measurement and interpretation

The ordinary QA runner remains unchanged. It counts completed game renders,
includes screenshots/video overhead, and still requires median FPS ≥30. Neither
the fixed 60 Hz simulation nor world dimensions are changed by the new governor.
The renderer no longer caps phone presentation at 50 Hz: both device classes can
present at 60 Hz, with a 0.5 ms tolerance for rounded rAF timestamps.

`tools-revamp/perf/profile.mjs` uses the existing offline server/browser fixtures
and `browser.startTracing()`/`stopTracing()`. `?perf=1` loads a separate diagnostic
chunk. `RendererProfiler` wraps sync phases with `performance.now()`, counts
Graphics clears and actual Pixi filter passes, and reports particle pool/cached
geometry counters. The browser script counts WebGL draw calls, texture image
uploads, and framebuffer binds. No `gl.finish()` or forced GPU readback is added.
The profiler is opt-in independently of `qa=1`; it does not change quality.

Timings measure CPU submission, not GPU completion. Trace event durations are
inclusive/nested and must not be added together. Profiling has overhead; traces
are for attribution, while the uninstrumented QA/smoke runs determine the gate.

```sh
npm run build
node tools-revamp/perf/profile.mjs --stage mission-1 --seconds 12 \
  --output /workspace/scicon-revamp/qa/J-profile-example
node tools-revamp/perf/profile.mjs --stage boss --seconds 12 \
  --output /workspace/scicon-revamp/qa/J-profile-boss-example
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id J-check
node --test tests-revamp/F/smoke.test.mjs
node tools-revamp/perf/bundle-report.mjs --out /tmp/J-bundles.json
```

## Top costs in the original renderer

The instrumented baseline is retained at
`/workspace/scicon-revamp/qa/J-profile-before/` (trace, trace-summary JSON,
profile JSON and screenshot). An untouched baseline build is preserved at
`/tmp/J-baseline-dist`; full baseline QA is `J-before`.

| Cost | Baseline evidence | Response |
| --- | --- | --- |
| GPU/software raster and canvas readback | `GLES2::ReadPixels` 11,804 ms across 79 calls, ~149 ms/call during the contended trace; total renderer JS only 4.51 ms/render | Single-sampler background quads, smaller actor batch shader, fewer optional planes in Auto/Low; preserve full DPR2 output |
| Pixi CPU submission | 3.21 ms/render, about 20.5 draws/render | Actor sampler budget 8; large backgrounds use their own single-texture path |
| Entity sync/Graphics churn | 0.77 ms/render; 46.3 clears/entity-sync, 68.5 total clears/render | Conservative transient culling, shared white pixel-particle quads, retained pooled effect geometry |
| Full-plane blur and per-hit filter work | Two authored soft background planes; 13 observed filter passes in 93 frames after legacy performance mode had already disabled most background blur | Bake background softness once per source/viewport; cache white alpha silhouettes per renderer |
| Effect animation | 2.30 clears/render in effect update | Shared immutable ring/shockwave/muzzle/smoke contexts; cached frame geometry and sprite-only animation |
| Texture churn | 52 upload calls during 93 observed frames | Reuse derived textures/geometry; preserve existing source texture bank and sprite pools |
| React/layout | No dominant layout span in trace; main HUD already change-aware/180–650 ms | Keep existing stat cadence; suppress identical 8 Hz wing snapshots; no per-frame quality state in React |

The host was substantially oversubscribed: the untouched full run started with a
1-minute load average of 48.4 on eight CPUs; the original smoke measured 8.1 FPS
while host load rose from 19.75 to 30.81. This is slower than the earlier round-1
16–20 FPS reports. Host load is context, not grounds to relax the gate. Sequential
captures are not controlled hardware benchmarks and cannot isolate causal speedup.

## Final renderer traces

Final traces, profiles and screenshots are in
`/workspace/scicon-revamp/qa/J-profile-final-mission/` and
`/workspace/scicon-revamp/qa/J-profile-flash-boss/`. Each captures 12 samples after
startup. Mission 1 precedes the last boss-only flash batch hook. The original
trace contains Mission 1 only; the boss column is final
diagnostic attribution, not a before/after boss comparison.

| Metric | Original Mission 1 | Final Mission 1 | Final boss |
| --- | --- | --- | --- |
| Observed renders | 93 | 255 | 339 |
| CPU sync, ms/render | 4.51 | 2.57 | 2.11 |
| Pixi CPU submission, ms/render | 3.21 | 1.77 | 1.44 |
| Entity sync, ms/render | .77 | .47 | .32 |
| Graphics clears/render | 68.46 | 53.23 | 52.58 |
| Effect clears/render | 2.30 | .23 | 0 |
| Observed GL draws/render, approximately | 20.53 | 30.69 | 28.32 |
| Filter passes in capture | 13 | 4 | 1 |
| Texture upload calls in capture | 52 | 44 | 52 |
| Raster resolution | 1.35 | 2 | 2 |

The final atlas contains 52 mission / 40 boss textures, copied once per entry,
with a 16 MiB page and no disabled/fallback state during ordinary play. Actual
actor batches use eight samplers; selected large sprites use one sampler in
three mission / 4.40 boss draws per frame. The extra .40 boss draws route active
cached hit-flash silhouettes through the same one-texture path as the hull.
Final boss cue geometry clears average 1.10/frame, versus 4/frame in the
intermediate uncached boss diagnostic.

Draw count increased: single-texture large-sprite boundaries trade extra batches
for simpler large-area shaders, while DPR 2 renders more pixels. This is not a
claim that every counter improved. Dynamic projectile/HUD paths still rebuild
Graphics; software raster/readback remains the main frame-time limit. CPU
submission figures include atlas blits and are normalized by completed scene
renders. Upload/filter totals span different render counts and scene progress.
The final mission trace ran under host load 18.78→22.32; the boss trace ran at
7.03→9.58. Treat these as attribution evidence, not controlled FPS benchmarks.

Readback still dominates the final traces: `GLES2::ReadPixels` accounts for
10,634 ms across 206 mission calls (~51.6 ms/call), and 10,647 ms across 268 boss
calls (~39.7 ms/call). Those inclusive spans include waiting on the software GPU;
they are not extra renderer JavaScript. Remaining DOM glows are retained, while
the sampled game HUD has no live backdrop filters.

## Infrastructure changes and ownership

- `RendererBudget`: cap raster resolution at `min(DPR, 2)` (old phone cap was
  1.35), disable antialiasing as before, preserve nearest sampling of pixel art,
  and cap actor batches at eight textures. One/four-sampler global experiments
  increased draw fragmentation and were not retained. The chosen split keeps
  actor batching and removes multi-texture selection from large background fills.
- `BackgroundQuad`: immutable unit quad using Pixi's single-texture mesh shader.
  Each mesh owns/disposes its geometry. The redundant background rectangle is
  omitted only when the renderer's identical opaque clear supplies it.
- `SelectedSpriteBatcher`: a renderer-local WebGL enqueue hook sends marked boss
  hulls and terrain props to a separate one-texture
  batcher. It delegates vertex packing to Pixi, preserving trim, rotated UVs,
  anchors, color, blend mode, rounding and filters. Small textured actors retain
  the eight-texture batch. The extension owns its geometry and shares an isolated
  shader; cleanup restores the hook. WebGPU keeps Pixi's ordinary path. Tests
  compare packed vertex bytes and protect this Pixi 8.19 integration on upgrades.
  Routing every white primitive here was rejected: the diagnostic draw count
  rose from ~25 to ~67/frame. Small solids remain in the ordinary batch; the
  targeted variant recorded ~29/frame with four single-texture draws/frame.
  The active installation explicitly sets `routeWhiteGeometry: false`.
- `RuntimeTextureAtlas`: `PixiTextureBank.get()` lazily copies eligible loaded
  textures into one renderer-owned 2048×2048 RGBA page (16 MiB, resolution 1,
  nearest sampling). Full, unrotated, untrimmed textures up to 256×256 use shelf
  packing with a one-pixel gutter and a 2,048-entry cap. One reused Sprite copies
  each source into the same RenderTexture; only the first copy clears the page.
  Later copies use `clear: false`, avoiding a full-page upload. Original logical
  bounds/default anchors remain intact. Unsupported sampling/layout, oversize,
  overflow, source mutation and context restoration retain or restore original
  textures. Preloading still owns original sources; disposal frees only derived
  views and the page. Atlas entry/copy/allocated-byte counts appear in profiling.
- `BackgroundTextureCache`: bake authored softness once, with adjacent tile
  copies to preserve vertical seams. Profile/size changes dispose derived
  textures; same-size resize reuses them. Source artwork is never destroyed.
  Covered alpha-1 base profiles also bake their existing sector tint/grade,
  removing the full-screen overlay pass. The base first composites over the
  renderer clear color; transparent foreground planes keep their alpha. Applying
  the same affine RGB transform per plane then matches the original final grade.
  Non-covering/ground profiles and standalone renderer fallback keep the overlay.
- `HitFlashTextureCache`: derive the existing white alpha silhouette, keeping
  original logical/trim bounds. Bound to 64 textures / 8M pixels; overflow uses
  the existing filter. Legacy non-receipt flashes retain their ownership. This
  does not retune Job I's flash timing, alpha, or artwork.
- Generated background and flash caches listen for WebGL context restoration.
  The callback only marks GPU contents dirty. Before the next scene render the
  environment rebuilds and rebinds every background plane; active flashes ask
  for a regenerated mask on demand. Disposal removes the listeners. Original
  source pixels remain available for restoration. Cache disposal also detaches
  owned texture/sampler bindings from Pixi 8.19's shared mesh shader before
  destroying a source. Otherwise Pixi destroys the retained BindGroup and the
  next mesh draw crashes. Real Shader/BindGroup regression tests cover clear,
  restore and destroy; this narrow adaptor coupling needs review on Pixi upgrades.
- `EntityPresentationBudget`: cull only transients whose expanded visual bounds
  are wholly outside the camera-transformed viewport. Beams, telegraphs and
  enemies are excluded. Keep existing pooled views marked seen while culled.
  Pixel debris uses a tinted shared white texture instead of rebuilt rectangles.
- `EffectGeometryCache`: 512 retained contexts, reference-counted LRU eviction,
  96 animation subdivisions. Motion/lifetime/alpha remain continuous; maximum
  ring-radius quantization is below 0.75 world pixels for tested effect sizes.
  Active contexts cannot be evicted. Disposal releases owned geometry only.
- Fix afterimage visibility so previously allocated children respect a reduced
  trail cap. View/effect pools remain renderer-owned and bounded.
- HUD controls use static navy glass gradients with existing colored glows and
  pixel icons. They no longer blur the changing WebGL canvas underneath each
  control. This applies to ordinary play at every quality setting.
- `BossCueGeometry`: retain emitter/bracket paths, status and intro rectangles,
  and halo ellipses. Translation and halo opacity update continuously without
  path rebuilds; health, exposure, break, size and HUD-style changes invalidate
  immediately. Hazard geometry and attack/telegraph timing remain unchanged.

New implementation lives under `services/revamp/performance/`. Hooks in shared
files are marked `REVAMP(J)`. `services/gameLogic.ts` and StartScreen are untouched.
No original or new art assets, APIs, game rules, reward rules, or content change.

## Auto / High / Low

The pause settings selector persists `scicon:render-quality:v1`. React subscribes
only to the user's mode, not frame samples or tier changes. Auto averages 1-second
windows; two seconds below 50 FPS steps down one tier. Eight seconds above 57 FPS
recovers one tier. Paused/hidden frames and ≥1000 ms gaps reset measurement without
resetting the learned tier. Sustained visible 300 ms frames still step down to
Low; explicit hidden/pause exclusion prevents false pressure. Hysteresis
prevents rapid oscillation.

| Tier | Particle scale | Trail scale | Background detail |
| --- | --- | --- | --- |
| High | 1 | 1 | All authored planes/stars |
| Medium | .65 | .7 | Omit one optional star plane; 75% of small stars |
| Low | .4 | .4 | Base + nearest star plane; 50% of small stars |

Two-plane authored landmark environments and large terrain props remain present
at every tier. Telegraphs, bullets, enemies, hitboxes, input, and simulation are
not governed. Reduced motion caps particles at .65 and trails at .4 even in High.
High fixes the new governor to its full budget; pre-existing engine safety caps
remain independent. In particular, the existing engine performance flag must not
be disabled to implement a visual preference because it also affects old threat
budgets. This patch neither adds nor changes those simulation rules.

## Load-time splitting

The main bundle's cached wallet-identity and quota/access dependencies previously
pulled in the wallet SDK despite a lazy WalletRuntime. Pure cache parsing now has
a small module; payment/recovery methods import the SDK when needed. Idle wallet
warm-up starts after the first usable menu, retaining the existing connect path.
App itself is lazy so desktop launch and explicit BossLab avoid the lobby graph.
Boss rigs and labs already have real GameStage/BossLab lazy boundaries; no async
pose-loading race was added inside combat.

Bundle reports: `/workspace/scicon-revamp/qa/J-bundles/{before,final}.json`.
Sizes are decimal kB; mobile home counts its complete static dependency closure,
including lazy App. It does not claim the small entry file is the whole app.

| JS payload | Before raw / gzip | After raw / gzip |
| --- | --- | --- |
| Entry/desktop shell | 2,819.06 / 613.37 | 205.68 / 63.63 |
| Mobile home dependency closure | 2,819.06 / 613.37 | 2,193.70 / 401.10 |
| GameCanvas chunk | 1,515.07 / 428.67 | 1,540.21 / 436.09 |
| Gameplay dependency closure | 4,350.22 / 1,047.35 | 3,750.09 / 842.53 |
| All JS including deferred features | 4,707.94 / 1,153.90 | 4,738.15 / 1,166.48 |

Mobile home gzip is down 34.61%; total JS rises 1.09% gzip from infrastructure.
The separate wallet chunk is 627.38 kB / 215.87 gzip. Local loading checks observed
mobile PLAY at 1,751 ms, first wallet request at 2,543 ms; desktop launch at 581 ms
and BossLab at 3,899 ms. All three paths had zero browser errors. These are local
observations, not network-throttled device claims. Live wallet payments were not
performed; existing validation/security tests and offline loading paths were used.

## Final validation

The normal-duration mobile `J-flash` playthrough passes both requested scenarios:

| Scenario | Duration | Median / p10 / minimum FPS | Browser errors |
| --- | --- | --- | --- |
| Mission 1 | 60.5 s | 48.5 / 39.0 / 22.0 | 0 |
| Boss | 45.1 s | 42.5 / 24.0 / 20.0 | 0 |

Artifacts: `/workspace/scicon-revamp/qa/J-flash/report.json`, screenshots and clips.
The world remains 390×844, normal damage is enabled, and screenshot/video
recording remains enabled. Host load was 6.41→11.77 on eight CPUs, compared with
48.4 at the baseline start. The FPS gate passes; the baseline-to-final ratio is
not a controlled speedup measurement. Minimum FPS still exposes transient dips.

Keep the failed repeats alongside acceptance: `J-final` recorded 28.0 / 29.7 FPS
with host load 7.68→22.74 and a 94.6 s boss sampling gap; `J-recheck` recorded
50.5 / 25.7 before the final boss-flash batch hook, at load 8.08→12.45. These
runs show substantial variation. The final passing run is not proof that the
last hook alone caused the difference, or a guarantee under arbitrary contention.

The full revamp suite passes 299/299, including the unmodified built-dist smoke
at 54.0 median / 26.9 minimum FPS. Smoke artifacts are
`/workspace/scicon-revamp/qa/smoke-2026-10-18T02-35-31-286Z/`.
Build, typecheck, exact legacy parity, visual critique, limitations and merge
hooks are recorded in `REVAMP_NOTES_J.md`. Real low-end Android GPU, touch,
battery and audio testing remain outside this headless run.

## Round 3 — Job L regression investigation

Reference: round-2 commit `8ffbd9e`; comparison: round-3 K/N/P/Q merge before L.
The historical 57.5 FPS Mission 1 result is not a same-session control. The first
alternating, uninstrumented mobile runs used normal 60/45-second Mission 1/boss
captures, normal damage, DPR 2, screenshots and `--no-video` on both builds:

| Run, in execution order | Mission 1 median FPS | Boss median FPS | Host 1m load, start → end |
| --- | --- | --- | --- |
| `L-ref-before-1` | 18.8 | 22.0 | 17.66 → 23.60 |
| `L-current-before-1` | 19.3 | 24.2 | 26.91 → 25.37 |
| `L-ref-before-2` | 25.0 | 29.0 | 25.37 → 19.31 |
| `L-current-before-2` | 12.1 | 14.9 | 19.31 → 38.33 |

All eight scenario medians miss the unchanged 30 FPS gate, with zero recorded
browser/runtime errors. Median-of-run-medians current/reference ratios are
0.717 for Mission 1 and 0.767 for boss. Those ratios record the failed baseline;
they do not isolate a code regression. In particular, the second current run
experienced rising load 19→38 while its preceding reference improved at 25→19
on eight CPUs. Raw reports remain under the four run names above; the compact
comparison is `/workspace/scicon-revamp/qa/L-validation/before-comparison.json`.

### Attribution

Sequential 12-second Mission 1 traces identify a large software GPU/readback
cost. `GLES2::ReadPixels` occupies roughly 9.7 seconds of each trace, nested in
the browser's layer commit and GPU command waits. CPU renderer sync is much
smaller. These inclusive events overlap and must not be summed.

| Diagnostic | Output pixels | Mean renderer sync | GL draws/render | Graphics clears/render | Mean ReadPixels call |
| --- | --- | --- | --- | --- | --- |
| `L-trace-reference` | 780×1688 | 3.17 ms | 34.9 | 168.4 | 24.1 ms |
| `L-trace-before` | 780×1688 | 4.86 ms | 31.9 | 169.9 | 39.7 ms |
| `L-trace-native-diagnostic` | 390×844 | 3.02 ms | 31.4 | 165.1 | 23.8 ms |

All three settle at Low decorative detail and record zero filter passes or
browser errors. Reference/current-before atlas entries are 58/53, with no atlas
disablement. The current trace records 60 uploads over 299 renders; source
inspection confirms N retains its geometry and generated textures and moves
them using transforms. There is no demonstrated per-frame N redraw, texture
generation or filter loop. Its nebula is already a 128×256 nearest-sampled
source. P's additive engine glows are already hidden at Low; its HUD still uses
the existing throttled publication path. Most entity Graphics clears predate P.
The current build's draws per render are lower, so a draw-call explosion does
not explain these captures.

The native-resolution diagnostic reduces backing pixels fourfold while CSS
size stays 390×844. Its 33.6 FPS median of profiler samples versus 20.2 before,
at nearby but unequal host loads around 30, supports raster/readback pressure
as a useful optimization target. This is attribution evidence, not an ordinary
QA acceptance result or a measured production speedup. The diagnostic explicitly
emulated DPR 1. Full `profile.json`, `trace-summary.json`, Chrome traces and PNGs
are retained under `/workspace/scicon-revamp/qa/L-trace-{reference,before,native-diagnostic}/`.

### Implementation and quality contract

- N's opaque nebula stays in its native 128×256 buffer instead of being copied
  into a 1024² atlas; its existing single-texture mesh uses opaque rendering.
  Palette, parallax, stars, landmarks, events and High artwork are retained.
- Text effects retain unchanged label text through animation frames instead of
  assigning empty text and restoring it every render. Existing pooling remains.
- `AdaptiveRasterResolution` is a production fallback after J's detail budget
  is exhausted. Auto reduces one decorative tier after two seconds below 50 FPS,
  or one second below 30 FPS. Once Low, output changes to resolution 1 after two
  additional seconds averaging below 40 FPS, or one second below 20 FPS. Recovery requires the detail
  governor to return through Medium to High, followed by eight additional seconds
  averaging at least 57 FPS. One-second windows average frame pressure; paused,
  hidden, invalid and ≥1000 ms samples reset measurement but retain learned output.
- Explicit High immediately restores the renderer's startup `min(DPR, 2)`;
  explicit Low selects resolution 1. Startup DPR stays fixed for the renderer's
  lifetime, matching prior behavior and the background cache's full resolution.
  Derived legacy backgrounds always bake at that full resolution, including
  scenes first visited during fallback and regeneration after context restoration.
- Resizing occurs only when output resolution changes. The helper restores the
  canvas CSS width/height after Pixi autoDensity writes, uses `image-rendering:
  pixelated` while reduced, then restores the previous style. The DOM HUD keeps
  its original resolution. World size, camera, touch mapping, simulation,
  collision, attack timing and reward rules are unchanged.

Auto deliberately lowers output resolution under sustained pressure; this is a
quality tradeoff, not pixel-for-pixel equivalence with High. High remains available
without this fallback. Native DPR-1 screens cannot be reduced further. Software
Chrome evidence does not establish real-phone GPU, battery or touch performance.

### Reproduction and acceptance status

Use immutable built snapshots and unused run IDs. Run CPU-heavy suites and
profiling separately from acceptance; retain failures and all alternating legs.
The comparison tool records executable/argument arrays, hashes, host loads,
errors, individual medians and their median-of-medians. It does not change QA
thresholds, duration, device DPR or simulation settings.

```sh
# Build reference once in /tmp/L-ref (git worktree at 8ffbd9e, node_modules symlink).
# From that worktree: npx vite build --outDir /tmp/L-ref-dist
npm run build
cp -a dist /tmp/L-review-dist # use a fresh snapshot path
node tools-revamp/perf/compare.mjs --reference /tmp/L-ref-dist \
  --current /tmp/L-review-dist --runs 2 --run-id L-review-ab
node tools-revamp/perf/profile.mjs --dist /tmp/L-review-dist --stage mission-1 --seconds 12 \
  --quality high --dpr 2 --output /workspace/scicon-revamp/qa/L-high-profile-new
node tools-revamp/perf/raster-check.mjs --dist /tmp/L-review-dist \
  --output /workspace/scicon-revamp/qa/L-raster-check-new
node --test tests-revamp/L/raster.test.mjs tests-revamp/J/contextRestore.test.mjs
SCICON_QA_DIST=/tmp/L-review-dist node --test tests-revamp/F/smoke.test.mjs
npm run qa:ui -- --dist /tmp/L-review-dist --run-id L-ui-new
```

`profile.mjs --dpr 1` is a labeled device-emulation diagnostic only; it is never
used by `compare.mjs` or ordinary QA. `raster-check.mjs` exercises real persisted
High→Low→High settings on 360×640, 390×844 and desktop, checking output size,
unchanged canvas rectangle/world, frame advancement and screenshots. It is a
transition check, not an FPS benchmark or proof of Auto fallback timing.

Final ordinary comparison: `/workspace/scicon-revamp/qa/L-final-ab-complete/`
(`compare.json` and `compare.md`), using the frozen `/tmp/L-severe-dist` build.
Order was reference 1, current 1, reference 2, current 2; all four legs completed.

| Build/run | Mission 1 median FPS | Boss median FPS | Host load 1m start → end |
| --- | ---: | ---: | --- |
| Reference 1 | 23.0 | 26.5 | 13.92 → 18.13 |
| Current 1 | 52.0 | 51.4 | 18.13 → 22.35 |
| Reference 2 | 26.5 | 27.5 | 22.35 → 16.34 |
| Current 2 | 55.0 | 56.5 | 16.34 → 17.07 |

Median-of-run-medians: **53.5 versus 24.75 FPS** for Mission 1 (ratio **2.162**),
and **53.95 versus 27.0 FPS** for boss (ratio **1.998**). Both relative ≥.9 targets
and the current Mission 1 ≥45 target are met in this session. All four current
scenarios pass ordinary QA. The comparison's overall status intentionally remains
**failed** because all four reference scenarios fail the unchanged 30 FPS gate;
there are no current scenario failures. One-minute load at leg boundaries ranged
from 13.92 to 22.35 on an eight-core host. These results do not establish quiet-host
or phone-GPU performance, nor isolate every component's contribution to the gain.

The earlier `L-final-ab/` attempt terminated with shell exit 143 during its second
reference boss capture. Its original partial reports and `INTERRUPTED.md` remain
available. Its completed current medians (46.9/57.5 FPS) are corroborating evidence,
not substituted into the completed comparison. Initial baseline and failed smoke
runs also remain available.

Final validation on the same frozen build (full suites used `--test-concurrency=2`):

- `npm run build` and `npx tsc --noEmit`: pass; zero TypeScript errors.
- Full revamp suite: **405 passed, 0 failed** (`L-validation/revamp-final.log`).
  This includes smoke at **52 median FPS**. Separate smoke passes all five checks
  at **54 median FPS** (`smoke-2026-10-18T05-36-38-440Z/smoke.json`). Earlier
  failed smoke runs at 8.9, 17.9 and 25 FPS are retained, not overwritten.
- Full legacy suite: **1782 passed, 7 failed, 12 skipped**, identical to baseline.
  `L-validation/legacy-complete-parity.json` verifies exact failure names after
  removing only checkout path prefixes. Six files require the unavailable local
  Director `pngjs`; the seventh is the inherited non-boss matrix assertion.
- Final setting transitions: all **9 phases pass** under `L-raster-final/`.
  Mobile backing sizes are 780×1688 → 390×844 → 780×1688; CSS rectangles and
  logical world dimensions remain fixed. Desktop DPR 1 stays native throughout.
- Final opt-in traces (`L-trace-final-auto/`, `L-trace-final-high/`) confirm Auto
  uses resolution 1 and High uses 2 at the same emulated DPR 2. Auto's backdrop
  update averages **0.045 ms**, with zero Graphics clears and a healthy atlas.
  These instrumented, nonalternating traces are diagnostics, not the acceptance
  comparison. High's 22.1 FPS trace confirms full detail remains costly on this
  software renderer; no High-mode speedup is claimed from the Auto result.
- UI full matrix: **436/436 cases pass, zero overflows, navigation failures,
  blank screens or coverage/browser errors**. All seven natural gameplay-victory
  cases pass. `L-ui/report.md` combines `L-ui-short` (186 cases) and
  `L-ui-standard` (250 cases) with the existing `ui-report.mjs` coverage checker;
  original reports, per-case build paths and 1418 screenshot references remain
  available. Both groups used the same frozen build, after all FPS measurements.

Visually reviewed final captures include
`L-final-ab-complete/current-2/mobile/mission-1/007-time-30s.png`,
`L-final-ab-complete/current-2/mobile/boss/009-time-30s.png`,
`L-raster-final/mobile/03-high-restored.png` and
`L-raster-final/360x640/02-low.png`, all below `/workspace/scicon-revamp/qa/`.
The dark sector palette, station silhouettes, bright ships/pickups and boss
telegraph lanes remain legible. Native output has visibly chunkier diagonal
edges; High restores finer edges and its decorative effects. The short viewport
retains its letterbox and HUD clearance. Opening wave/enemy banners can overlap
in the short capture; their existing placement is outside this performance fix.
These screenshots depict different simulation moments, not a pixel-diff proof.

Changes remain uncommitted: Git rejected staging because worktree metadata is
read-only. No push, deployment or external write API was performed.
