# Job N — sector backgrounds

Implemented in the supplied `/workspace/scicon-revamp/w4-N` checkout on `r4/N`,
starting at `857d2175d51e97ea9a47a7be15a5cef7f3429147`. The supplied worktree
instruction takes precedence over the older Windows/experimental-branch workflow.

## What changed

Ten procedural pixel-art worlds now follow the **actual campaign sectors**,
including alternate graph routes and mastery branches:

| Sector | Theme | Defining scenery |
| --- | --- | --- |
| Breakwater | Breakwater Docks | Orbital docks and salvage |
| Redline Frontier | Redline Furnaces | Industrial tanks and refinery spines |
| Gravity Rift | Gravity Fracture | Jagged void fissure and suspended rubble |
| Terminus Frontier | Terminus Graveyard | Severed hull ribs and wreck fields |
| Prism Expanse | Prism Gardens | Faceted crystal clusters |
| Rail Meridian | Meridian Railway | Parallel rails and truss bridges |
| Singularity Reach | Singularity Tide | Dark singularity and accretion disk |
| Gyroscope Array | Gyroscope Orbits | Intersecting orbital rings |
| Hammerhead Line | Hammerhead Bastions | Armored curtain walls and recessed bays |
| Crownclaw Frontier | Crownclaw Vaults | Stacked diamond archive vaults |

Mission IDs seed a private cosmetic RNG. Consecutive missions alternate the main
landmark side, composition, secondary silhouette, cloud pattern, and event order.
Unmapped special scenes retain their authored environment. No gameplay RNG,
world dimensions, collisions, difficulty, rewards, or simulation timing changes.

Six retained depth planes contain an opaque low-resolution nebula, three star
speeds, landmarks/rare planets, an edge fleet, debris, and set pieces. Nebula noise
is baked once to a 128×256 nine-color texture, sampled nearest-neighbor, slowly
scrolled and tinted. Ringed, cratered, banded gas and fractured planets appear
sparingly. All pixel artwork is generated in memory; Scott's art files remain
unchanged.

Capital-ship flybys, station fly-throughs and asteroid showers use a deterministic
58-second schedule with gaps between events. Wave revisions, boss arrivals and
stage takeoff trigger short edge-only star stretches. Boss entry smoothly applies
the sector's boss color grade. Tiny distant ships exchange fixed beams and muted
flashes at the edge; there are no background rounds crossing the combat lane.

## Implementation and merge hooks

| File | Purpose |
| --- | --- |
| `services/revamp/backgrounds/themes.ts` | Ten palettes, sector/branch resolution, private RNG |
| `services/revamp/backgrounds/layout.ts` | Seeded placements and varied event order |
| `services/revamp/backgrounds/pixelArt.ts` | Integer raster primitives and baked nebula/landmark/planet/ship/debris art |
| `services/revamp/backgrounds/timeline.ts` | Event sampling, warp envelope, quality budgets |
| `services/revamp/backgrounds/BackdropTextures.ts` | Bounded atlas and safe texture disposal |
| `services/revamp/backgrounds/SectorBackdrop.ts` | Six-plane renderer and optional read-only QA snapshot |
| `tests-revamp/N/*.test.mjs` | Theme, pixel, timeline and real-Pixi lifecycle coverage |
| `tools-revamp/qa/background-gallery.mjs` | Offline real-mission gallery capture |

Shared renderer hooks are marked `// REVAMP(N):`:

- `services/pixi/PixiGameRenderer.ts`: import/owned presenter; one sync dispatch
  using J's existing background quality budget; destruction before renderer
  teardown. The renderer supplies its existing world and campaign.
- `services/pixi/PixiEnvironment.ts`: `setBackdropVisible` toggles only legacy
  objects owned by that environment. Existing visibility/culling and all original
  art remain available for fallback scenes.
- No edits to `services/gameLogic.ts`, `App.tsx`, `components/StartScreen.tsx`,
  campaign JSON, APIs, dependencies, or original public art.

## Readability, quality and lifecycle

Large scenery stays on the shoulders. Its alpha is capped at .61; cinematic
ships/stations peak at .65/.64. The nebula center is darker than its edges;
foreground ships and bullets retain their existing bright outlines and colors.
Streaks are restricted to the outer 16% on each side. No full-screen flash,
post-process filter or per-frame noise generation is added.
Broad landmarks, capital ships and transit gates use J's existing one-sampler
sprite path; the full-screen nebula uses its one-sampler mesh path. Tiny stars
and debris remain batched normally.

Auto/High/Low uses J's existing governor (1/.75/.5). Star counts are 54/39/24,
debris counts 12/8/4. Low preserves the main sector signature and all three star
depths while dropping the secondary landmark and distant battle. OS reduced
motion disables fast set pieces, streaks and battle flashes; ordinary parallax
slows to 12%. Pause freezes the presentation timeline with simulation frames.

One `RuntimeTextureAtlas` page is capped at 1024² RGBA (4 MiB), 32 entries, with
less than 1 MiB of immutable CPU-backed source pixels. Each active mission uses
8–9 entries and fewer than 100 retained display objects. There are no texture
copies/allocations during animation. Mission changes release the prior atlas;
context restoration falls back to valid originals. The shared Pixi mesh shader's
owned bindings are detached before disposal to preserve its resource group.

## Validation and evidence

- `npm run build`: passes, including Director exclusion (existing chunk-size warning).
- `npx tsc --noEmit`: passes with zero errors.
- N's focused tests: 24/24 pass. With J's selected-sprite-batcher checks: 30/30 pass.
  These exercise actual Pixi resource ownership, not only source-string checks.
- Final normal-damage mobile playthrough, with default video recording:

  | Scenario | Duration | Median FPS | Evidence |
  | --- | --- | --- | --- |
  | Mission 1 | 60 seconds | **36.8** | `/workspace/scicon-revamp/qa/N-final-verified/report.json` |
  | Boss | 45 seconds | **38.5** | `/workspace/scicon-revamp/qa/N-final-boss-recheck/report.json` |

  Both scenarios pass their original FPS, active-frame, capture-gap, canvas,
  browser-error and 390×844 world checks. Boss coverage is from the separate
  recheck because `N-final-verified`'s first boss capture had a 72.8-second sampling
  gap despite 38.5 sampled FPS. The failed report remains intact. No gate was
  relaxed, and the already-passing mission was not repeated.
- Final gallery: **12/12 captures pass**, all ten sectors plus natural capital
  flyby and station transit. All use real mission launches and fixed QA seed.
  Short gallery FPS samples describe startup; they are not the full playthrough
  performance gate above.
- Extra browser checks pass: High reports quality 1; Low plus OS reduced motion
  reports quality .5, reduced motion true and warp 0. Both preserve the same
  first-mission seed. The next mission has a new seed/variant in the same theme.
- Full legacy suite: **1,781 passed, 8 failed, 12 skipped** (1,801 tests).
  All eight failure names match the saved baseline exactly; there are no new
  failures. Full log and comparison:
  `/workspace/scicon-revamp/qa/N-backgrounds/final-legacy.log` and
  `final-legacy-summary.json`.
- Full UI audit: **234/234 cases pass, zero overflows**, zero navigation
  failures, blank screens or browser errors. Includes 58 cases at each of
  360×640, 390×844 and 430×932, plus 60 desktop iframe/launcher cases; all four
  devices also reached a natural gameplay victory. Evidence:
  `/workspace/scicon-revamp/qa/N-ui/report.json` and `report.md`.
- Full revamp suite: **352 passed, 4 failed** (356 tests), including all 24 N
  tests passing. The failures are the two existing J context-restoration mocks
  and F's short FPS assertion plus its parent test. F measured **29.2 FPS**
  against a 30 FPS threshold; the same assertion failed on the frozen built
  baseline at 22.2 FPS. H's browser-isolation check passes. No new functional
  failure was found, and the failed smoke report is retained alongside the
  separate full-duration passing performance coverage above. Logs/comparison:
  `/workspace/scicon-revamp/qa/N-backgrounds/final-revamp.log` and
  `final-revamp-summary.json`. These full suites are **not entirely green**;
  unrelated baseline failures were not changed or suppressed.

Consolidated evidence index:
`/workspace/scicon-revamp/qa/N-backgrounds/final-validation.json`.

Baseline evidence is retained in
`/workspace/scicon-revamp/qa/N-backgrounds/baseline-test-summary.json`.
The inherited legacy suite had 1,781 passed, 8 failed and 12 skipped. Six failures
are missing `director/node_modules/pngjs`; two are pre-existing campaign-matrix
and home-wordmark assertions. The initial revamp baseline had 324 passed and 4
failed: two tests ran before `dist` existed, plus two stale J renderer mocks.
Rechecking the frozen built baseline resolved H's missing-dist failure; F's
remaining failure was its FPS assertion (22.2 FPS), not an app exception.

The frozen baseline build is `/tmp/scicon-N-before-dist`. Its short normal-damage
mobile playthrough recorded 36 FPS mission 1 and 16.5 FPS boss under the shared
host load; it did not reproduce the earlier ~55 FPS reference. These baseline
failures and reports are preserved rather than hidden by changing gates.

The first full current-build run (`N-final-playthrough`) had a 7.6 FPS mission-1
failure and a passing 38.5 FPS boss. A same-host frozen-baseline video diagnostic
also failed mission 1 at 14.5 FPS; the current build without video passed both
short stages at 39.8/42 FPS (`N-final-no-video-check`). These are diagnostic runs,
not the final gate evidence. Routing the new broad silhouettes through J's
one-sampler batcher preceded the final passing coverage above. Host load varied,
so the measurements do not establish a controlled percentage speedup.

Before screenshots of all ten sectors:
`/workspace/scicon-revamp/qa/N-backgrounds/before/01-sector-open-orbit.png`
through `10-sector-crownclaw-frontier.png`, with `report.json` and `report.md`.

The first visual iteration is retained at
`/workspace/scicon-revamp/qa/N-backgrounds/after-v1/` (all 12 captures passed).
Visual review prompted more distinct rift, fortress and archive silhouettes,
slightly clearer stars, per-sector boss tint and separated event windows.

Final gallery and review evidence:

- `/workspace/scicon-revamp/qa/N-backgrounds/gallery.html`: labeled, clickable
  gallery of all 12 original captures.
- `/workspace/scicon-revamp/qa/N-backgrounds/contact-sheet.png`: 1200×1000 overview.
- `/workspace/scicon-revamp/qa/N-backgrounds/after/01-sector-open-orbit.png`
  through `10-sector-crownclaw-frontier.png`: final per-sector mobile screenshots.
- `/workspace/scicon-revamp/qa/N-backgrounds/after/11-set-piece-1.png` and
  `12-set-piece-2.png`: naturally timed capital flyby and station fly-through.
- `/workspace/scicon-revamp/qa/N-backgrounds/{high,low-reduced,variation}/`:
  screenshots and state reports proving settings and neighboring-mission variety.
- Each gallery directory retains `report.json` and `report.md`, with exact
  mission URLs, build checksum, errors, world size and backdrop telemetry.

Visual self-review: the ten worlds differ in both silhouette and grade; the
revised archive is a stacked diamond vault, the fortress a broad armored wall,
and the rift a fissure rather than another crystal cluster. Enemy outlines,
projectiles and boss telegraphs remain distinct over every reviewed scene.
The artwork is deliberately quieter and simpler than the combat sprites.

## Reproduce

```sh
npm run build
npx tsc --noEmit
node --test tests-revamp/N/*.test.mjs
node --test --test-concurrency=1 tests/*.test.cjs
node --test --test-concurrency=1 tests-revamp/*/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id N-review
npm run qa:ui -- --run-id N-ui-review
node tools-revamp/qa/background-gallery.mjs --output /workspace/scicon-revamp/qa/N-backgrounds/review
```

Run browser and CPU suites separately on this shared host. Build commands use the
existing flock wrappers. Gallery runs launch real authored missions with
`?qa=1&mission=<levelId>&autoplay=1&skipIntro=1&god=1` and the fixed QA seed. Every
scenario uses a fresh offline context; gallery god mode is explicit and does not
replace the normal-damage playthrough. No remote request is sent.

The final full suites use one test worker so the F/H browser tests do not compete
with other files' compilation. All files and assertions remain enabled. The
legacy suite can overlap the UI geometry audit; performance captures and the
revamp suite's browser checks run without the legacy suite.

`window.__sciconBackgroundQA.snapshot()` exists only with `qa=1`. It returns
mission/theme/seed, timeline/event progress, warp/grade, quality/motion and atlas
counts. It exposes no mutation, reward, storage or gameplay controls.

## Tuning knobs and limits

- Palette colors/signature choices: `BACKGROUND_THEMES` in `themes.ts`.
- Normalized landmark edges, size, planet frequency and event order: `layout.ts`.
- Cloud density, center suppression, nine-step ramp and shape detail: `pixelArt.ts`.
- Event durations/cycle, warp duration and quality counts: `timeline.ts`.
- Parallax speeds, alpha, edge streak bounds, boss grade and cinematic scale:
  `SectorBackdrop.ts`.
- Atlas page size/entry cap: `BackdropTextures.ts`.

Headless SwiftShader is a repeatable regression check, not a physical Android GPU,
battery or human dodgeability measurement. Low intentionally omits distant
battles and secondary landmarks; reduced motion intentionally omits cinematic
movement. Unmapped weekly/special scene IDs keep existing art. The old art still
loads through the existing startup policy even when the new campaign backdrop
hides it; startup asset loading was not restructured in this job.

Top-level `api/*.js` remains **12**. No protected unrelated project was changed.
Nothing was pushed, deployed, or sent to an external write API.

## Commit handoff

Local staging was attempted after the passing build/typecheck/focused tests, but
Git metadata is mounted read-only:
`Unable to create /workspace/scicon-revamp/gh/.git/worktrees/w4-N/index.lock`.
All changes remain uncommitted for the integrator, as requested; no metadata
workaround was used. Suggested logical commits: sector renderer/art/runtime;
focused validation and gallery tooling; this handoff with final QA evidence.
