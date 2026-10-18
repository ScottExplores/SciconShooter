# F — Automated gameplay QA

## Changes

- Explicit `qa=1` gates seeded gameplay RNG, `autoplay=1`, `mission=<levelId>`, `bosslab=first|<eventId>|<bossId>`, `skipIntro=1`, and `god=1`. No normal gameplay controls were added.
- Autoplay evaluates nearby hostile projectiles, moves through the ordinary input path, sweeps below enemies, and fires at the existing fixed simulation step. It changes neither world size nor simulation speed.
- `window.__sciconQA.state()`, `.fps()`, and `.counts()` return bounded, read-only snapshots of actual runtime state and renderer cadence. Gameplay RNG uses `services/gameplay/random`; cosmetic effects remain independent.
- QA flights reuse the real campaign renderer/HUD in the existing noncompetitive mode, use disposable local storage, and cannot request ranked run receipts or enter Weekly Run. Normal loadout and damage remain active unless `god=1` is set.
- Offline built-dist server, API fixtures, mobile and desktop browser playthroughs, screenshots, WebM recordings, MP4/GIF clips, JSON/Markdown reports, and focused Node tests. No endpoint or existing art was modified.

## Files and shared hooks

- `services/revamp/qa/config.ts`, `autoplayBot.ts`, `runtime.ts`, `launch.ts`, `storage.ts`: all new QA behavior.
- `components/GameCanvas.tsx`: marked hooks for setup/disposal, RNG seed, input before the existing 60 Hz step, and FPS after renderer sync.
- `App.tsx`: marked hooks for authored mission/boss selection, startup readiness, skipped briefings, noncompetitive settlement, receipt/Weekly guards, and avoiding founder debug telemetry during QA.
- `index.tsx`: marked first import isolates QA storage before profile services load.
- `tools-revamp/qa/`: runner, browser helpers, static server, API fixtures.
- `tests-revamp/F/`: runtime, launch/storage, server, and built-dist smoke tests.
- `package.json`, `package-lock.json`: register the already installed `playwright-core` 1.55.0 and `qa:playthrough` / `qa:test` commands. Nothing was reinstalled.
- `docs/revamp/qa.md`: commands, flags, report semantics, and limitations.

All shared hooks are labeled `// REVAMP(F):`. `services/gameLogic.ts` and `services/pixi/PixiGameRenderer.ts` are unchanged.

## Validation and artifacts

The untouched baseline passed `npx vite build`. Its `npx tsc --noEmit` output contains six existing errors, all in `services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts`: two missing director JSON files and four unknown artwork rectangle properties. Subsequent typechecks preserve those six errors.

First report (preserved, failed harness startup selector): `/workspace/scicon-revamp/qa/F-baseline-20261017/report.md`. The page has separate hidden/visible responsive Start buttons; the runner now selects the visible button. No gameplay coverage is claimed for this failed report.

Baseline replay: `/workspace/scicon-revamp/qa/F-baseline-v2/report.md`. This captured the delayed flight-assist modal rather than sustained combat. The baseline helper was corrected to dismiss actual story/guide controls; instrumented runs require simulation-frame advancement rather than canvas presence alone. Baseline browser rAF is explicitly not game-render FPS.

Completed baseline combat capture: `/workspace/scicon-revamp/qa/F-baseline-combat/report.md` (60 seconds, mobile, original dist). It includes real firing/steering, visible story/guide dismissal, screenshots, WebM, MP4, and GIF. The sweep pilot is defeated by the 30-second screenshot. Its 10.1 median browser rAF is baseline observation, not a game-FPS pass.

Full instrumented run: `/workspace/scicon-revamp/qa/F-full-20261017/report.md`. All eight scenarios launched: home plus 60/45/45-second mission/midpoint/boss windows on both devices, producing 78 screenshots, eight WebMs, six MP4s, and six GIFs. Browser console/page errors: zero. Every measured world was 390×844. Gatekeeper Prime's HP and phase were observed on both devices. The report is **failed** because game render FPS did not meet 30:

| Scenario | Mobile median FPS | Desktop median FPS |
| --- | --- | --- |
| Mission 1 | 11.5 | 23.8 |
| Midpoint | 8.1 | 20.3 |
| Gatekeeper Prime | 9.4 | 16.0 |

The first full mobile mission had a host stall: 92.2 seconds elapsed but only five samples were captured. Its zero observed deaths is **not evidence of survival**. The raw failed report is retained. The final runner timestamps samples after collection, measures sample/screenshot gaps, fails gaps over ten seconds, and excludes death animations from active FPS.

Targeted mobile recheck: `/workspace/scicon-revamp/qa/F-mobile-recheck/report.md`. It captured 60.3 seconds, 44 samples, maximum sample gap 2.6 seconds, zero errors, and a defeat at observed 24.6 seconds. Median FPS remained 13.7, so the FPS gate remains failed.

Explicit god-mode boss coverage: `/workspace/scicon-revamp/qa/F-boss-coverage/report.md`. It captured 45.4 seconds, 37 samples, maximum sample gap 1.9 seconds, maximum screenshot gap 6 seconds, zero errors/damage/life losses, and a transition from `prime-sentinel` to `prime-pressure`. Median FPS was 16.3. This is coverage evidence only. Both baseline and boss MP4 clips were checked with ffprobe: approximately ten seconds, within the requested 8–12-second range.

The instrumented `npx vite build` passed. The 16 focused runtime/launch/storage/server/report tests pass. Built-dist smoke verifies startup, mission progression, enemy spawning, nonblank canvas, and GET/POST fixtures; its remaining failure is the unchanged **FPS ≥30** assertion. The measured software-rendering failure has not been concealed by lowering DPR, changing simulation speed, disabling effects, substituting rAF FPS, or weakening the test.

Final `npx tsc --noEmit` output exactly matches the six-line baseline (`diff` clean). Final combined Node run: 19 passing test entries; the FPS subtest and its parent fail (one underlying assertion), with median 14.1 FPS. Smoke artifacts: `/workspace/scicon-revamp/qa/smoke-2026-10-18T00-19-24-376Z/smoke.json`. Top-level `api/*.js` count remains 12. No original art files changed.

## Screenshot critique against the Galaxiga / Sky Force Reloaded target

- **Art and readability:** [Home](/workspace/scicon-revamp/qa/F-baseline-combat/mobile/start-screen/000-start-screen.png) has coherent blue/cyan pixel-art framing, a distinctive science ship, and a large thumb-reachable Start button. The large Weekly Funding panel competes with the main campaign action. The baseline's separate guide decision adds friction to the design's fast opening; QA `skipIntro` deliberately bypasses it, so combat runs alone cannot validate the normal first five seconds.
- **Combat clarity:** [Midpoint combat](/workspace/scicon-revamp/qa/F-full-20261017/mobile/mid-campaign/005-time-20s.png) shows recognizable enemy silhouettes and bright player shots. Large planets, purple nebulae, shield circles, small health bars, coins, and thin shot traces compete in the same area. Against the reference target's clear threat hierarchy, background contrast and hostile-projectile prominence deserve another pass without replacing Scott's artwork.
- **Boss presence:** [Gatekeeper Prime](/workspace/scicon-revamp/qa/F-full-20261017/mobile/boss/005-time-15s.png) has a strong silhouette, attractive art, and readable name/HP framing. The sampled HP bar does not visibly divide its phases; the [later phase](/workspace/scicon-revamp/qa/F-boss-coverage/mobile/boss/009-time-40s.png) needs telemetry to confirm the change. Screenshots cannot establish a ≥0.6-second telegraph, hit-stop timing, or audio impact; clips are supplied for that review.
- **Feel and fairness:** The fixed world prevents a desktop field-of-view advantage, but the measured SwiftShader frame rates do not meet the intended smoothness. Mobile boss defeats around twenty seconds and the mission recheck defeat are bot observations, not proof that humans face unfair patterns. The bot neither uses bombs nor understands every beam puzzle. God mode's later-phase coverage must not be mistaken for a fair-dodge pass. A real-device touch/audio pass and rendering profile remain needed to judge the Galaxiga/Sky Force level of polish.

## Reproduce and tune

```sh
npx vite build
node --test tests-revamp/F/*.test.mjs
npm run qa:playthrough
# Short mobile diagnostic, not full coverage:
npm run qa:playthrough -- --devices mobile --seconds 12
# Coverage with damage disabled; do not interpret as fairness evidence:
npm run qa:playthrough -- --god
```

The runner never builds. Default scenarios are 60/45/45 seconds per device, with screenshots every five seconds and on observed events. Use `--seed`, `--devices`, `--stages`, `--seconds`, `--dist`, `--output`, `--run-id`, or `--no-video` as documented. The runner selects the first authored major boss event and also supplies its mission as a fallback; manual `bosslab=first` is supported. Bot movement targets and lookahead are in `autoplayBot.ts`; error/sample bounds and the two-second FPS window are in `runtime.ts`.

## Known limits

- The bot is reactive, does not understand every rotated beam/boss puzzle, and is not proof of human dodgeability. Samples can miss damage between observation intervals; god runs are explicitly labeled.
- SwiftShader/video performance depends on host contention. One smoke attempt timed out before DOM load while host load average exceeded 200 on an eight-CPU environment; its zero gameplay samples are a failure, not a performance result.
- Fixtures verify offline plumbing, not Supabase, wallet, production API, or end-to-end economy behavior. Browser network traffic is fulfilled locally, including remote requests; no external write API was called.
- The supplied `docs/AI_COLLAB_WORKFLOW.md` is absent from this snapshot and the adjacent repository. `REVAMP_DESIGN.md`, `AGENTS.md`, and `CLAUDE.md` were read; the explicit `rv/F` user scope takes precedence over their stale checkout references.
- Git staging/commit attempt failed: `/workspace/scicon-revamp/repo/.git/worktrees/wt-F/index.lock` cannot be created because the worktree metadata is mounted read-only. Source changes remain available in this worktree. No push or deployment was attempted.
