# JOB C — Boss encounters

Implemented on `rv/C` in the supplied worktree. No art files, APIs, deployment configuration, wallet/leaderboard writes, or unrelated projects were changed. `docs/AI_COLLAB_WORKFLOW.md` was absent from this snapshot and nearby checkouts; supplied AGENTS/CLAUDE rules and the explicit user worktree/branch instruction were followed.

## Changes and files

- `services/revamp/bosses/catalog.ts`: 15 encounter profiles over ten existing Scott rigs, including The Peer Reviewer, Impact Factor, Grant Reaper, Citation Hydra, and Replication Crisis. Campaign keeps ten canonical commanders; the Weekly source pool can reach all fifteen via deterministic variant selection without altering source IDs used by validation/rewards.
- `patterns.ts`, `safeRoute.ts`: four attack families per boss, immutable warning snapshots, amber/magenta geometry, and replayed conservative phone safe routes. Warning times are 0.8–1.3 seconds, including rage. Phase sets teach fan/ring, add weave, then add locked lane salvos.
- `runtime.ts`, `engineAdapter.ts`: 72-frame title intro, 66/33% phase gates, 60-frame invulnerable transitions, 15% rage, a circular 42px breakable lower-edge emitter that disables the fan and interrupts attacks, 72-frame stagger (1.75× damage), recovery (1.45× damage), and actual bullet cancellation. Large same-frame bursts cannot skip phase gates. Boss art is fitted proportionally below the HUD.
- `BossPolishPresentation.ts`: retained Pixi warning/socket graphics, part targeting/health, name + epithet, phase/rage/status UI and HP milestones. Mandatory readability works without job A.
- `services/revamp/events.ts`: tiny shared event bus. Defeat chain, debris, coin-burst and slow-motion effect hooks; existing engine remains the sole authority for real coin rewards. Full event payload contract in `docs/revamp/bosses.md`.
- `services/revamp/bosses/bossLab.ts`, `components/revamp/BossLab.tsx`, CSS: isolated full-power practice gallery, restart/pause/watch/shield and phase presets, same 390×844 world on every host. No account providers or reward callbacks.
- `tests-revamp/C/*.test.mjs`: esbuild-bundled Node tests for content, actual weekly selection, hazard witness replay, encounter clocks/damage/parts/events, lab routing/configuration, and engine integration.

## Shared hook points

All edits in shared implementation files carry `// REVAMP(C):` comments.

- `services/gameLogic.ts`: imports; `spawnBoss`, `updateBoss`, `isBossCombatInteractive`, `getBossComponentHit`, `damageBossComponent`, `isBossHullProtected`, `damageBossHull`, `handleEnemyDestroyed`. New behavior delegates to external modules; original scoring, telemetry and physical boss coin rewards remain in the common path.
- `services/pixi/PixiGameRenderer.ts`: create/attach the presentation object, add health ticks/name, sync cues and suppress the duplicate wave intro while a polished boss is present.
- `index.tsx`: lazy explicit `bosslab` entry, bypassing account services and desktop launch gate. `App.tsx` is unchanged.

## Run and inspect

```sh
node --test tests-revamp/C/*.test.mjs
npx vite build
npx tsc --noEmit
```

Open `?bosslab=peer-reviewer`; use any ID in `docs/revamp/bosses.md`. `&bosswatch=1` disables firing/companions for warnings; `&bosshp=0.3` begins with a lower health preset. Select another boss or Restart to reset. The gallery fits a fixed 390×844 simulation into the available screen, so the canvas may be letterboxed on desktop or a phone with browser controls. Boss Lab is practice only.

For shared-node_modules sandbox environments, run Vite with a writable cache directory (the QA server used `/tmp/revamp-C-vite-cache` and port 5174). Production build uses the normal repository config.

## Tuning and integration limits

- Warning/recovery times, counts, speeds, phase sets and part HP ratio: `catalog.ts`. Rage increases projectile speed 8%; phase adds 5% per band. Never shorten warnings below 36 frames.
- Pattern aperture/spread, lane geometry and 180-frame hazard lifetime: `patterns.ts`. Old hazards are cancelled before 60–84 frames of completely quiet recovery. Removing this boundary invalidates composed safe-route assumptions.
- Intro/transition/stagger and multipliers: `runtime.ts`; fixed boss framing/42px marker: `engineAdapter.ts`. Re-run proof coverage when emitter height, collision size, counts, speed, timing or world size changes.
- These are authored encounter variants over existing rigs, not new raster designs or a wholesale port of all 43 runner prototypes. Unregistered legacy/editor-only bosses and mini-boss runtimes retain their original behavior.
- Safe-route evidence is bounded: lower-arena starts at five columns/three heights, all finite pattern sequences, three emitter heights, all phases/rage, conservative baseline ship acceleration and swept collision. It does not promise survival while touching the boss hull or against unrelated simultaneous hazards.
- Job A should subscribe to the documented effect events for extra chain explosions, debris and presentation slow-motion. It must not award coins from the visual-only coin event. C already supplies mandatory telegraphs, warning/roar audio, hit flash and the existing defeat/coin path.
- Weekly scheduling/scoring remains with the existing authoritative planner (job E); C chooses a profile within its original source identity. No server schema or receipt rules change.
- Existing TypeScript baseline has six errors in `UmbraNeedlewingArtwork.ts` due to absent prototype JSON/type fallout; this work does not add errors.

## Verification

- `node --test tests-revamp/C/*.test.mjs`: **40/40 tests passed** after the final browser fixes, including HP-preset rounding and real travelling-shot part regressions.
- Catalog proof: **72,900** replayed scenarios; all fifteen profiles pass. Tests use the real weekly planner and actual engine geometry, not metadata-only assertions.
- `npx vite build`: **passed**, 2,531 modules transformed; only existing dependency annotation/chunk-size warnings.
- `npx tsc --noEmit`: **exactly the six baseline diagnostics**, text-identical to the recorded baseline (no new errors).
- `git diff --check`: passed. Top-level `api/*.js`: **12**, unchanged.
- Browser: **23 mobile checks passed, zero console/page errors**, including real pointer-aimed part break, stagger, full defeat event sequence, preset resets and pause/watch controls. Independent **1280×900 desktop mouse context** also keeps the same 390×844 simulation/canvas and reports zero errors.
- Browser artifacts: `/workspace/scicon-revamp/qa/C-bosses/` (mobile roster screenshots, intro/transition/rage/recovery, interaction checks and `report.json`).


## Commit delivery

The supplied worktree's Git metadata is read-only in this sandbox: `git add -A` failed creating `/workspace/scicon-revamp/repo/.git/worktrees/wt-C/index.lock`. Source changes remain intact in the supplied checkout, but its branch ref could not be updated.

Five logical commits were instead made on `rv/C` in a local writable clone at `/tmp/scicon-C-commits`, preserving the original branch base. They are packaged in `/workspace/scicon-revamp/qa/C-bosses/rv-C.bundle`. The bundle can be fetched into a clean writable checkout and its five commits cherry-picked; it does not require a push or network access. Do not apply it over the same uncommitted file changes without first preserving those changes.
