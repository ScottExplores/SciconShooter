# Job S — pixel-art explosions and boss destruction

Worktree `/workspace/scicon-revamp/w5-S`, supplied branch `r5/S`, base `7b651a6`.

## Changes

Replaced the oversized 16×16 boss-damage pop used for deaths with a procedural,
palette-locked explosion atlas. Scott's original art files are untouched.
Small and medium explosions have ten frames; large and mega have twelve.
Round scalloped fireballs ignite white/yellow, expand through orange/red, then
dissolve through dithered edges. Separate smoke puffs, eight-direction spark
trails, rotating metal chips and expanding pixel rings share the atlas.

The atlas is generated once while constructing the renderer: 1024×384 RGBA,
116 frame views, 1.5 MiB. Every frame uses nearest sampling and a fixed integer
scale. Sprites reuse ArcadeEffectPool's existing capacity, recycling and quality
retirement rules; there is no extra particle pool or per-frame geometry upload.
Low/Auto-slow reduce secondary particles. Reduced motion removes explosion
rings, reduces travel and density, and suppresses boss camera motion, fullscreen
flash and distortion. Existing small impact/damage-pop art remains in use at
contact scale. Existing preallocated local light accents remain bounded.

Boss deaths use one 2.4-second presentation (1.85 seconds for mini-bosses).
Medium/large bursts walk the hull and available component positions, starting
at destroyed sockets. The rendered hull pose is captured once before its entity
view is retired, with UI/contact accents excluded. It stays visible until the
final mega at 1.44 seconds (1.05 for minis), then breaks into six shared-texture
art pieces on High or three on Low. Camera shake ramps toward the finale;
a single <=0.11-opacity, 55ms white flash is disabled by motion/shake reductions.
A 360ms background-only shockwave displaces at most three pixels in explicit
High mode. Bullets, player and HUD are never filtered. Existing hit-stop,
slow motion, coin rain, reward amounts and collection remain simulation-owned.
The existing Screen shake OFF toggle also disables the new camera movement.

The previous renderer death chain and Feel kill chain are suppressed when the
new sequence owns that death. Special Octarch/Singularity terminal hooks start
before their delayed rewards; the later common kill receipt is deduplicated.
Revival and escape do not trigger terminal presentation. Authored mini-bosses'
lingering live death views are hidden while the retained pose owns presentation.
Their delayed legacy death sprite is suppressed while the new sequence owns
the member; its original fallback remains available without that ownership.

## Reusable API / integration with O

```ts
import { playBossDeathSequence } from './services/revamp/vfx/BossDeathSequence';
// At confirmed terminal death, while the live hull view still exists:
playBossDeathSequence(engine, boss, isMiniBoss);
// Renderer-side part/kill effects, all sharing the bounded pool:
effectPool.spawnPixelExplosion(x, y, size, 'large', deterministicVisualSeed);
```

The first API is renderer-independent, has no timers, does not draw gameplay RNG,
mutate hulls, cancel hazards, award coins or alter score. Calls for the same
entity are idempotent even when O, C and the common receipt all invoke it.
`hasBossDeathSequence(engine, hull)` provides a read-only ownership check for
legacy presentation fallbacks, including after a renderer consumes the request.
The engine feel reset-generation clears its bounded pending queue. Existing
terminal logic must continue to own hazard cleanup, rewards and mission timing.
Four simultaneous death snapshots and 64 recent entity IDs are retained at most.
Renderer reset, teardown and context loss release snapshot textures/listeners;
a resumed tab skips stale bursts instead of dumping them into one frame.

## Files and shared hooks

- `services/revamp/vfx/PixelExplosionAtlas.ts`: pure procedural raster authoring,
  palette and atlas ownership.
- `services/revamp/vfx/PixelExplosionRenderer.ts`: analytic particles, fixed pixel
  scale, deterministic recipes and quality controls.
- `services/revamp/vfx/BossDeathSequence.ts`: public queue/API and pure timeline.
- `services/revamp/vfx/BossDeathPresentation.ts`: retained hull, fragments, lifecycle.
- `services/revamp/vfx/BossShockwave.ts`: optional scoped background shader.
- `services/pixi/ArcadeEffectPool.ts`: route kill explosion APIs through pooled atlas.
- `services/revamp/feel/{FeelGameplay,FeelRuntime,FeelPresentation}.ts`: terminal
  receipt metadata and duplicate-chain suppression; ordinary kills keep their tiers.
- `services/revamp/bosses/engineAdapter.ts`: three-line C defeat hook.
- `services/gameLogic.ts`: five added lines, marked `REVAMP(S)`, for the import,
  Octarch/Singularity terminal hooks and mini-boss legacy-sprite suppression.
- `services/pixi/PixiGameRenderer.ts`: twelve added lines, marked `REVAMP(S)`, for
  ownership, pre-retirement snapshot, duplicate suppression and cleanup.
- `tests-revamp/S/`: raster topology/palette/pool, timeline/replay, actual Pixi
  snapshot lifecycle, accessibility and shader lifecycle checks.
- `tools-revamp/qa/explosion-capture.mjs`: offline natural-kill video capture and
  PNG extraction every 150ms, with High/Low/reduced-motion options.
- `artifacts/campaign-balance/nonboss-runtime-matrix.json` and
  `docs/CAMPAIGN_NONBOSS_BALANCE_MATRIX.md`: regenerated all 600 real simulation
  trials because the shared engine source digest changed. Every gameplay row
  field matches HEAD exactly; only cosmetic `maximumActiveEntities` varies
  (221 cells, global peak remains 125). Outcomes remain 590 clears / 8 deaths / 2 timeouts;
  median clear time 42.3s and maximum hostile projectiles 51. Existing timing
  breaches remain visible; no assertion or quality gate was weakened.
  Five bounded official mission batches avoid the environment's process cutoff;
  raw trials and hashes of the unchanged canonical aggregation are retained in
  `validation/matrix-final-chunks/` and `matrix-final-composition-proof.json`.
  Regenerate this source-digested evidence again after other branches' engine
  edits merge, using `node tools/simulate-campaign-nonboss-balance.mjs --write`.

No App.tsx, StartScreen.tsx, API, original art or unrelated project changes.
Top-level `api/*.js` count remains 12. No external writes, push or deployment.

## Tuning

`PIXEL_EXPLOSION_SPECS` owns frame count/duration/native edge and particle counts.
`pixelExplosionScale` controls integer scale caps. `BOSS_DEATH_*` / `MINI_DEATH_*`
own timeline and finale duration. `bossDeathTimeline` controls hull walk and
<=88-world-pixel early blast requests; mega is capped at 216. `bossDeathPose`
owns camera/flash envelopes and fragment fade. `BossShockwave` owns 360ms / 3px
limits. Quality changes never alter collision geometry, world size or rewards.

## Visual evidence

Artifact root: `/workspace/scicon-revamp/qa/S-explosions/`.

- Before boss: `before/boss/frame-010.png` — oversized opaque yellow/orange block.
- First after boss: `after-first/boss/frame-005.png` — small walking blasts with
  readable hull; `frame-010.png` — rounded mega and separating art pieces;
  `frame-013.png` — fading debris and embers; `frame-016.png` — clear aftermath.
- Before/after regular: `before/regular/` and `after-first/regular/`, including
  `after-first/regular/frame-005.png`.
- Final snapshot: `after-final/boss/` (37 frames), `after-final/regular/`
  (21 frames), and `after-final/mini/` (37 frames), each at 150ms intervals.
  Reviewed final boss `frame-016.png` (readable hull and local bursts),
  `frame-022.png` (round finale), `frame-025.png` (separating pieces), and regular
  `frame-009.png`. Mini-boss capture confirms the legacy fireball is suppressed.
- `high-final/boss/`, `low-final/boss/`, `reduced-final/boss/`: final quality and
  accessibility variants. High has six hull fragments and a brief background
  distortion; Low has three pieces and fewer secondary bursts. Reduced motion
  keeps the hull nearly stationary while it fades. All six final stage/mode
  captures passed with zero console/page errors and were visually inspected.
  Low/reduced `frame-018.png` shows the finale. Their video clocks drifted about
  five seconds from telemetry; corrected clips align to the recording end, with
  offsets recorded. Original misaligned extractions remain in `boss/unaligned/`.
- Capture directories contain natural-kill MP4s, 150ms PNG sequences and
  timestamped telemetry reports. No HP, gameplay-clock or reward mutation is used.
- `atlas-review/sequences.png`: all authored frame rows, visually inspected.
- `index.html`: local before/after video and contact-sheet review page.
- `shockwave-fixture/`: real Chrome/WebGL before/active/after. Distortion changes
  only the expanding background annulus; foreground and expired frame match.

Visual review: early blasts remain local and the cyan hull stays legible. The
finale is a round dithered plume with a hot core and visible hull separation.
Smoke is intentionally dark against space; embers are easier to see than smoke
on the darkest backgrounds. The inherited MISSION COMPLETE toast still appears
below the hull and the existing coin receipts cluster near the player. Those
unchanged labels do not cover the new hull breakup in the reviewed captures.

## Validation and remaining limits

Build and typecheck pass; all 32 new S tests pass. Final logs are
`validation/build-complete.log` and `types-complete.log`. The immutable final
browser snapshot is `/tmp/S-complete-dist`; its full file manifest is
`validation/complete-build-manifest.json` (SHA256
`036cf549b2120c3033c6d20de3215075bb75491c7477766e2668d13359ab565f`).

The full UI audit passes **436/436 cases, zero overflows and zero browser errors**
across all seven viewports. Final report:
`/workspace/scicon-revamp/qa/S-ui-complete/report.json` (and `report.md`). The
initial process was externally terminated after 174 passing cases; remaining
262 cases ran in bounded device batches. The official composer verifies every
unique screen/device pair and the unchanged geometry-checker hash. Initial cases
use `/tmp/S-first-dist`, and remaining cases use `/tmp/S-complete-dist`; per-case
build/source provenance is retained. CSS, art, fonts and audio are identical
between these snapshots; later product fixes affect only VFX. The combined
`build-provenance.json` records both full manifests and confirms no duplicate
cases or geometry-checker mismatch.

The full legacy suite reports **1782 passed / 7 failed / 12 skipped (1801 tests)**,
exactly matching baseline failure names, with zero additions. The inherited
failures concern six missing-art/test-loader fixtures and the non-boss matrix's
existing first-threat/dead-air pacing gate. Evidence:
`validation/complete-legacy.log`, `complete-legacy-comparison.json`, and
`matrix-final-comparison.json`. The initial changed run exposed a lighting source
contract and stale source digest; the bounded light accents were retained and
the real 600-trial evidence was regenerated before this final passing comparison.

All 64 revamp test files other than the separately isolated FPS smoke have run:
**406 passed / 2 failed (408 tests)**. The only failures are the same two inherited
J context-restoration fixtures (`getMutedBackground` stub and active `hitFlash`
texture). `validation/complete-revamp-nosmoke.log` and its comparison JSON preserve
the exact names. The separately isolated FPS smoke ran twice: all functional
checks pass, while the unchanged 30 FPS assertion and its parent fail at medians
29.7 and 27.2. Together the 65 revamp files report **409 passed / 4 inherited
failures (413 tests)**, with no skipped files or new failure names. The baseline
had the same four failures (377 passed / 381 tests, FPS 16.1 under earlier load).
Logs: `complete-smoke.log` and `complete-smoke-recheck.log`; combined comparison:
`complete-revamp-comparison.json`.

The standard mobile Mission 1/boss run (`S-final`) has zero console, page or game
errors, but fails the unchanged FPS gate at **25.2 / 26.2 FPS** with video.
Sequential full-duration still-only runs measured **29.5 / 39.5** on the final
build (`S-final-stills`) and **25.7 / 24.7** on the original build
(`S-baseline-stills`). These show no observed slowdown from S; changing shared
host load prevents claiming a controlled speedup. This host exposes eight CPUs
and had load averages around 15–25 during checks. **The 30 FPS gate remains
unmet for Mission 1 and the default video run**, including the baseline.
`validation/performance-comparison.json` links every retained report. No gate,
duration, gameplay setting or FPS measurement was weakened to claim a pass.

Reproduce:

```sh
npm run build
npx tsc --noEmit
node --test tests/*.test.cjs
node --test --test-concurrency=1 tests-revamp/*/*.test.mjs
npm run qa:ui -- --run-id S-ui-review
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id S-review
node tools-revamp/qa/explosion-capture.mjs --phase after-review --stages boss,regular,mini
node tools-revamp/qa/explosion-capture.mjs --phase high-review --quality high --stages boss
node tools-revamp/qa/explosion-capture.mjs --phase low-review --quality low --stages boss
node tools-revamp/qa/explosion-capture.mjs --phase reduced-review --quality high --reduced-motion --stages boss
```

Use unused run IDs. Captures serve stable built snapshots and fulfill external
traffic offline. PNGs extracted at 150ms have video/telemetry timestamp uncertainty;
they demonstrate real progression, not exact simulation-frame registration.
Physical-phone GPU, audio and every authored boss identity still need human
playtesting; deterministic lifecycle tests cover shared major/mini routing.

## Commit handoff

A local implementation commit was attempted after focused checks. Git rejected
the staging step because `/workspace/scicon-revamp/gh/.git/worktrees/w5-S/index.lock`
is on a read-only filesystem. Changes remain uncommitted for the integrator;
no alternate metadata, push or deployment workaround was used. Suggested logical
commits: explosion atlas/pool and death integration; QA tests/tool and handoff.
