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
