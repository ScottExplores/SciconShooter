# J — Rendering performance

Branch `r2/J`, baseline `176863a`. Implementation and verification are local.

**The requested headless performance gates pass.** The final normal-duration
mobile playthrough, `J-flash`, records **48.5 median FPS in Mission 1** and
**42.5 FPS in the boss scenario**, with zero browser errors. The unchanged
built-dist smoke records **54.0 median FPS**, and all **299 revamp tests pass**.
The production build passes and TypeScript reports zero errors. This is local
SwiftShader evidence, not a real-phone performance guarantee.

## Changes

- Added opt-in Chrome tracing and renderer diagnostics under
  `tools-revamp/perf/` and `services/revamp/performance/RendererProfiler.ts`.
  `?perf=1` measures sync phases, Graphics clears, filter passes, particle/cache
  counts, draw calls, texture uploads, and framebuffer binds. Normal QA remains
  unchanged. Attribution and measurement limits are in [perf.md](docs/revamp/perf.md).
- Reduced large-background shader work with single-texture, immutable Pixi mesh
  quads. Authored background softness is baked once per texture/viewport, with
  neighboring tile copies preserving seams. Derived resources are disposed on
  profile/size changes; original artwork is retained. Ordinary actors use eight
  texture samplers; marked large boss hull/flash and terrain Sprites use a
  separate one-texture batch with stock Pixi vertex packing. `routeWhiteGeometry: false` keeps small
  solids in ordinary batches after broad white-texture routing increased draws.
- Added a renderer-owned runtime atlas through `PixiTextureBank.get()`. Eligible
  loaded textures share one 2048×2048, resolution-1 nearest page, with one-pixel
  gutters, 256×256 input limits, and a 2,048-entry cap. Sources copy once into the
  same RenderTexture; later inserts use `clear: false`. Unsupported layouts or
  sampling, oversize and overflow retain originals. Source mutation/context
  restoration safely restores original pixels for existing Sprites. Preloading
  and source ownership are unchanged; cleanup destroys only atlas resources.
- Folded the existing full-screen sector grade into cached parallax textures
  when an alpha-1 base covers the viewport. The affine color transform preserves
  overlay-plane alpha; the base first composites over the existing clear color.
  Ground/non-covering profiles retain the original overlay. Dynamic stars and
  terrain props keep their existing colors and layer order.
- Cached white alpha silhouettes for hit flashes while preserving source trim
  bounds and existing flash timing/opacity. The cache has texture/pixel limits and
  falls back to the existing filter when full. This is renderer infrastructure;
  it does not retune Job I's projectile or hit-flash artwork.
- Made generated background and hit-flash caches recover from WebGL context
  restoration. Context callbacks only mark lost contents dirty; the next frame
  rebuilds/rebinds backgrounds and active flashes on demand. Disposal removes
  the listeners and frees only derived resources. Before destroying backgrounds,
  detach their texture/sampler bindings from Pixi's shared mesh shader; leaving
  a disposed source bound invalidates its BindGroup and crashes the next draw.
  Real Pixi regressions cover clear, restore and destroy.
- Culled only offscreen transient visuals using expanded bounds and the encounter
  camera transform. Beams, enemy bodies, and mandatory telegraphs remain visible.
  Culled pooled views stay marked as seen so they are not reallocated on reentry.
  Pixel particles reuse tinted white quads instead of rebuilt rectangles.
- Added shared immutable effect geometry for rings, shockwaves, muzzle flashes,
  and smoke. The reference-counted cache retains at most 512 contexts in the
  production pool; active geometry is never evicted. Sprite explosion/debris
  animation no longer clears empty Graphics each frame. Motion, opacity and
  lifetimes remain continuous, with subpixel geometry sampling error.
- Fixed afterimage visibility so a lower trail cap also hides already allocated
  children. Existing sprite, particle and light pools remain bounded.
- Retained boss emitter/bracket, status-strip, intro-card and halo geometry.
  Hardware moves in local coordinates; HP/state/size changes redraw immediately.
  Halo pulse opacity remains continuous, with its constant fill kept separate.
  Locked attack hazards and telegraph timing are unchanged.
- Added persisted **Auto / High / Low** visual quality in pause settings. Auto
  reduces optional particles, trails and background detail under sustained frame
  pressure. It does not alter the simulation, collision, input, world size,
  projectiles, telegraphs, rewards, or gameplay random source.
- Allowed the same 60 Hz presentation cadence on phones and desktop, with a
  0.5 ms tolerance for rounded rAF timestamps. The fixed 60 Hz simulation is
  unchanged. Raster output is capped at `min(DPR, 2)` with antialiasing disabled;
  this raises the old 1.35 mobile cap to native DPR 2 for crisp pixel art.
- Suppressed identical 8 Hz React wing snapshots. Existing main-HUD change
  detection and 180–650 ms update cadence remain in place; quality samples stay
  outside React state.
- Replaced live canvas backdrop blur beneath HUD controls with static navy glass
  gradients, preserving their existing colored glows, pixel icons and borders.
- Separated cached wallet identity parsing from the wallet SDK, deferred payment
  imports until needed, and delayed idle wallet warming until the menu is usable.
  App now has a lazy boundary so desktop launch and explicit BossLab routes do
  not load the lobby graph. Existing GameStage/BossLab boundaries already defer
  boss/lab code; no asynchronous pose-loading race was introduced into combat.

No original art files, campaign content, simulation rules, reward rules, API
routes, or migrations were changed. No new art was necessary. Nothing named City
Mechanical or scooter was touched. No push, deployment, or external write API was
performed.

## Files and merge hooks

| Files | Responsibility |
| --- | --- |
| `services/revamp/performance/AdaptiveRenderQuality.ts`, `RenderQualitySettings.ts`, `RenderQualityControls.tsx`, `render-quality.css` | Governor, persisted mode and settings control |
| `services/revamp/performance/RendererBudget.ts`, `BackgroundQuad.ts`, `BackgroundTextureCache.ts`, `HitFlashTextureCache.ts`, `EntityPresentationBudget.ts` | Render budget, retained background geometry/textures, flash caching and conservative culling |
| `services/revamp/performance/SelectedSpriteBatcher.ts`, `RuntimeTextureAtlas.ts`, `services/pixi/PixiTextureBank.ts` | Selected large-sprite batching and bounded shared texture page, with original-source ownership retained |
| `services/revamp/performance/EffectGeometryCache.ts`, `RenderCadence.ts`, `wingHudEquality.ts`, `RendererProfiler.ts` | Effect-resource lifetime, presentation cadence, HUD equality and diagnostics |
| `services/revamp/performance/BossCueGeometry.ts`, `services/revamp/bosses/BossPolishPresentation.ts` | Retained boss hardware/HUD/halo geometry with immediate state invalidation |
| `services/revamp/performance/hud-compositing.css`, `components/GameStage.tsx` | Static HUD glass instead of repeated canvas backdrop blur |
| `services/pixi/ArcadeEffectPool.ts` | Shared effect contexts, sprite-only animation and cleanup |
| `services/pixi/PixiEnvironment.ts` | Background cache/quad hooks and optional visual detail budget |
| `services/revamp/feel/FeelPresentation.ts`, `FeelSettingsControls.tsx` | Cached flash integration and quality settings row |
| `services/baseAccountCache.ts`, `baseAccountWallet.ts`, `playerShipAccessService.ts`, `walletPurchaseService.ts`, `index.tsx` | Lightweight startup identity, deferred SDK imports and App boundary |
| `tools-revamp/perf/profile.mjs`, `bundle-report.mjs` | Offline profiling and static dependency-closure size reports |
| `tests-revamp/J/*.test.mjs` | Governor/cadence, HUD snapshots, real Pixi cache ownership, culling, resource limits and chunk boundaries |
| `tests/pixiEnvironmentPreload.test.cjs`, `pixiParallaxMotion.test.cjs`, `pixiEnvironmentRoute.test.cjs`, `pixiRendererArchitecture.test.cjs` | Load new real helper dependencies in existing VM tests; require updated pause/filter hooks without weakening behavior assertions |
| `styles/tailwind.generated.css` | Regenerated styles for the settings/startup additions |

Shared-file hooks are marked `// REVAMP(J):`:

- `services/pixi/PixiGameRenderer.ts`: budget/cache ownership and disposal,
  optional profiler, governor observation, transient culling, retained particle
  presentation, actual afterimage visibility caps, selected large-sprite batching
  and renderer-owned texture atlas initialization.
- `components/GameCanvas.tsx`: presentation cadence, pause-aware quality sampling,
  and equality checks before publishing wing HUD snapshots.
- `App.tsx`: lightweight cached identity import and menu-ready wallet warming.
- `services/gameLogic.ts` and `components/StartScreen.tsx` are untouched.

## Measurements and bundles

Baseline tracing found renderer CPU sync averaging 4.51 ms, including 3.21 ms in
Pixi submission and 0.77 ms in entity sync, while the software-rendered frame took
far longer. There were 68.5 Graphics clears per render. Canvas/GPU readback and
SwiftShader raster work dominated the contended capture; CPU timings are not GPU
completion timings. Final Mission 1 tracing measures 2.57 ms total renderer CPU
sync, 1.77 ms Pixi submission, and 53.23 Graphics clears/render. Effects alone go
from 2.30 to .23 clears/render. Final boss tracing measures 2.11 ms sync and zero
effect clears/render. The atlas contains 52 mission / 40 boss entries. Draws
increase to about 30.69 / 28.32 per frame as large sprites use simpler separate
shaders, and output rises from 1.35 to DPR 2. Full metrics and interpretation are
in [perf.md](docs/revamp/perf.md); diagnostic traces are not FPS gate passes.

The baseline full mobile run recorded 8.5 FPS in Mission 1 and 5.8 FPS in the boss.
Host load was 48.4 at start on eight logical CPUs. The final `J-flash` run records
48.5 and 42.5 respectively, with host load 6.41 at start and 11.77 at end. Changing
contention prevents interpreting these sequential captures as a controlled
speedup benchmark. Both retain normal damage, the 390×844 world,
screenshots/video overhead, and the unchanged gate.

Failed repeats remain inspectable: `J-final` measured 28.0 / 29.7 FPS as host load
rose 7.68→22.74, with a 94.6 s boss sampling gap. `J-recheck` measured 50.5 / 25.7
before the final boss-flash batching hook, at load 8.08→12.45. The final `J-flash`
passes both medians. These runs demonstrate variability; they do not establish
that the final hook alone caused the difference or guarantee ≥30 under contention.

Recorded bundle snapshots are
`/workspace/scicon-revamp/qa/J-bundles/before.json` and `final.json`. The latter
records the final accepted build. Values below are decimal kB, raw / gzip. Mobile home includes
the entire static dependency closure of lazy App, rather than only the entry.

| JavaScript payload | Before | Recorded after |
| --- | --- | --- |
| Entry / desktop shell | 2,819.06 / 613.37 | 205.68 / 63.63 |
| Mobile home closure | 2,819.06 / 613.37 | 2,193.70 / 401.10 |
| GameCanvas chunk | 1,515.07 / 428.67 | 1,540.21 / 436.09 |
| Gameplay closure | 4,350.22 / 1,047.35 | 3,750.09 / 842.53 |
| All JS including deferred features | 4,707.94 / 1,153.90 | 4,738.15 / 1,166.48 |

Mobile home gzip fell 34.61%; total gzip rose 1.09%.
The deferred wallet SDK chunk is 627.38 kB raw / 215.87 kB gzip. Local loading
checks observed mobile PLAY at 1,751 ms, desktop launch at 581 ms, and BossLab at
3,899 ms, without browser errors. These are local observations, not throttled
network or real-device guarantees; live payments were not exercised.

## Verification

- `npm run build` passed, including Director exclusion:
  `/tmp/J-flash-build.log`. Vite still reports existing large chunks.
  `npx tsc --noEmit` produced zero diagnostics:
  `/tmp/J-flash-typecheck.log`. No application source changed after this build.
- Full legacy suite on the final application source:
  **1,733 tests; 1,481 pass; 240 fail; 12 skipped**. The 240 failing names exactly
  match the baseline: zero added and zero resolved. Logs are
  `/tmp/J-baseline-legacy.log`, `/tmp/J-flash-legacy.log`; exact baseline names are
  in `/tmp/J-baseline-legacy-failures.json` and the comparison is
  `/tmp/J-flash-test-comparison.json`. Existing wallet/leaderboard and campaign
  failures remain outside Job J; this is parity, not a fully green legacy suite.
- Full revamp suite passed: **299/299**, including all 53 new J tests and the
  built-dist F smoke. Command: `node --test --test-concurrency=1
  tests-revamp/*/*.test.mjs`; log: `/tmp/J-flash-revamp.log`. Test files ran
  serially to avoid CPU suites competing with SwiftShader. The baseline
  non-smoke result was 241/241.
- Baseline smoke passed startup, live/nonblank mission and offline API checks,
  but failed its FPS assertion at 8.1 median / 4.3 minimum. TAP counts are 3 pass
  and 2 fail, including the parent of that one failed assertion. Artifacts:
  `/workspace/scicon-revamp/qa/smoke-2026-10-18T01-05-20-180Z/`.
  Final built-dist smoke passes all four checks at **54.0 median / 26.9 minimum
  FPS**, with zero page/console errors. Host load was 2.35→6.16. Final artifacts:
  `/workspace/scicon-revamp/qa/smoke-2026-10-18T02-35-31-286Z/`.
- Settings checks passed at 390×844 and 360×640: mode changes, remount persistence,
  reduced-motion caps, zero browser errors, 44 px selector height, and identical
  390×844 simulation world. Evidence:
  `/workspace/scicon-revamp/qa/J-settings/report.json` and its four screenshots.
  QA storage is disposable; durable-storage behavior is covered by focused tests.
- Forced real `WEBGL_lose_context` loss/restoration passes with zero page/console
  errors: `/workspace/scicon-revamp/qa/J-context-restore-final/report.json`.
  Before/after/settled screenshots were opened: background, ships, projectiles,
  pickups and HUD survive; simulation frames advance 235→529→700. A scene-only
  region away from DOM overlays remains nonblank. The atlas restores originals;
  backgrounds and active masks regenerate. Earlier failed recovery probes are
  retained separately. This functional check is not an FPS acceptance run.
- Final `J-flash` passes both requested mobile scenarios at their normal 60 s /
  45 s duration, with zero page/console errors and normal damage enabled.
  Earlier failed candidates remain in the artifact directory as diagnostics.

| Scenario | Median / p10 / minimum FPS | Active samples | Maximum sample gap |
| --- | --- | --- | --- |
| Mission 1 | 48.5 / 39.0 / 22.0 | 53 | 2.0 s |
| Boss | 42.5 / 24.0 / 20.0 | 39 | 1.8 s |

## Screenshots and visual review

The following before/after PNGs were opened and inspected:

| Scene | Before | Final after capture |
| --- | --- | --- |
| Mission 1, about 15 s | [PNG](/workspace/scicon-revamp/qa/J-before/mobile/mission-1/003-time-15s.png) | [PNG](/workspace/scicon-revamp/qa/J-flash/mobile/mission-1/003-time-15s.png) |
| Boss, about 20 s | [PNG](/workspace/scicon-revamp/qa/J-before/mobile/boss/004-time-20s.png) | [PNG](/workspace/scicon-revamp/qa/J-flash/mobile/boss/004-time-20s.png) |

The after captures retain Scott's ship/enemy silhouettes, palette, large planet,
HUD and skill controls. DPR 2 gives noticeably crisper ship outlines and boss
health framing. Optional small background detail is reduced in Auto under load;
the large scene artwork remains recognizable. The captures show different game
states at nearby wall times, so they do not establish identical flash timing or
pixel-for-pixel rendering parity.

The central tutorial panels still cover enemies and the boss, and the bright
large planet still competes with combat. Those existing presentation issues
remain for the parallel UI/art jobs. The final 20 s capture shows the detailed
cyan boss; diagnostic screenshots also show the existing strong white flash.
The final medians clear the gate, but minimum FPS still shows
transient dips. Screenshots cannot certify animation smoothness, touch feel,
audio or human dodgeability.

Full reports and clips are retained at
`/workspace/scicon-revamp/qa/J-before/report.md` and
`/workspace/scicon-revamp/qa/J-flash/report.md`, with `clip.mp4` / `clip.gif` in
each `mobile/mission-1` and `mobile/boss` folder. Baseline trace evidence is
`/workspace/scicon-revamp/qa/J-profile-before/`; final diagnostic traces are
`/workspace/scicon-revamp/qa/J-profile-final-mission/` and
`/workspace/scicon-revamp/qa/J-profile-flash-boss/`. Intermediate sampler/plane
experiments are diagnostic artifacts, not acceptance runs.

## Knobs and reproduction

| Knob | Location / value |
| --- | --- |
| Visual preference | `RenderQualitySettings.ts`, storage key `scicon:render-quality:v1`; Auto / High / Low |
| Downgrade / recovery | `AdaptiveRenderQuality.ts`: 1 s average windows; 2 s below 50 FPS to downgrade; 8 s above 57 FPS to recover |
| Pause / long gaps | Paused/hidden frames and gaps ≥1000 ms reset sampling without discarding the learned tier; sustained visible 300 ms frames still step down |
| Particle / trail scales | High 1 / 1; Medium .65 / .7; Low .4 / .4 |
| Background detail | High all planes; Medium omits one optional star plane; Low base + nearest stars; authored two-plane landmarks and terrain props retained |
| Reduced motion | Particle scale ≤.65, trail scale ≤.4 even in High |
| Resolution | `RendererBudget.ts`: `min(DPR, 2)`; nearest pixel-art sampling, no antialiasing |
| Actor samplers | `RendererBudget.ts`: 8; selected large boss/terrain Sprites use one sampler via `SelectedSpriteBatcher.ts`, with `routeWhiteGeometry: false` |
| Runtime atlas | `RuntimeTextureAtlas.ts`: one 2048² RGBA page (16 MiB), resolution 1, nearest, 1 px gutters, ≤256² inputs, ≤2,048 entries; unsupported/overflow inputs keep originals |
| Effect geometry | `EffectGeometryCache.ts`: 512 contexts, 96 animation subdivisions; tested maximum radius sampling error <.75 world px |
| Hit-flash cache | `HitFlashTextureCache.ts`: 64 textures / 8M pixels, then existing filter fallback |

High fixes the new governor's budget; the pre-existing engine safety caps remain
independent. They are not disabled by this visual preference because that older
flag also participates in existing threat budgets. Job J does not change those
simulation rules.

```sh
npm run build
npx tsc --noEmit
node --test tests-revamp/J/*.test.mjs
node --test tests/*.test.cjs
node --test tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id J-final-check
node tools-revamp/perf/profile.mjs --stage boss --seconds 12 --output /workspace/scicon-revamp/qa/J-final-profile
node tools-revamp/perf/bundle-report.mjs --out /tmp/J-final-bundles.json
```

The QA harness serves the existing build with local fixtures. Run performance
captures sequentially, without concurrent CPU suites. The tsc/Vite wrappers use
shared locks; let them finish. No simulation-rate reduction, QA-only effect
disablement, FPS substitution or gate relaxation is used.

## Limits and commit handoff

Real low-end Android GPU, battery, touch and audio verification remain outside
this headless evidence. Targeted Mission 1/boss coverage does not certify all 15
bosses or every planet profile. Cached textures trade bounded GPU memory for
less repeated work; the atlas alone uses up to 16 MiB per renderer. The 240
inherited legacy failures remain outside Job J. Live wallet payments were not run.

Changes remain **uncommitted because Git metadata is read-only** in this worktree.
The integrator must create the logical commits; no metadata workaround or push
was attempted. Suggested groups: renderer profiling/caches; governor/cadence/HUD;
startup chunk boundaries; tests and documentation. Preserve unrelated work and
coordinate Job I when merging the marked renderer presentation hooks.
