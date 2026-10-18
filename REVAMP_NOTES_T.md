# T — boss completion timing and preview badge

Implemented only the two requested fixes in the supplied `r6/T` checkout.

## Changes and shared hooks

- `services/revamp/vfx/BossCompletionGate.ts`: per-engine/per-run presentation barrier. S's public death request registers ownership; the presenter releases it after both hull breakup and the last emitted particle finish. Completion waits another **300 ms**, with a **4,000 ms / 240-tick hard cap** if presentation is missing or interrupted. Paired minis wait for the last member. Reset discards old ownership.
- `BossDeathSequence.ts`, `BossDeathPresentation.ts`, `PixelExplosionRenderer.ts`, `services/pixi/ArcadeEffectPool.ts`: report actual particle-tail lifetime, including quality/reduced-motion density and the renderer's capped particle clock. Existing art and explosion choreography are unchanged.
- `services/gameLogic.ts`: small `// REVAMP(T):` hooks defer the mission/perfect-wave and flask notification, and gate takeoff. Authoritative completion/reward snapshots and coin/flask credit retain their existing timing. The protected collection branch freezes combat clocks, explicitly retains invulnerability, and clears hostile rounds. The held mini-boss banner is emitted after takeoff cleanup so it survives its first frame. Continuous Weekly boundaries and non-boss completion remain unchanged. Existing S ownership already suppresses the legacy `SECTOR CLEARED` chain.
- `services/revamp/preview/PreviewBuildBadge.tsx` and `preview-build.css`: preview-only, noninteractive 18px reserved rail above the app, with safe-area padding. Fixed menus are contained below it. Production returns the original child tree. Canonical simulation dimensions are unchanged.
- `App.tsx`: import and wrapper hook only. `services/pixi/PixiGameRenderer.ts` and `components/StartScreen.tsx` are untouched.
- `tools-revamp/qa/ui-geometry.mjs`: rejects badge overlap with DOM HUD rectangles, the gameplay canvas (including Pixi timers/boss bars), app content, or safe-area bounds. `ui-audit.mjs` adds opt-in `gameplay-hud,boss-hud` fixtures without expanding the full matrix.
- `tests-revamp/T/`: 16 checks covering actual engine/presenter/pool behavior, cap/reset/paired minis, reward and Weekly invariants, flask notification, 320/360/390/430px layout, real CDP safe-area insets, production absence, and deliberately regressed badge overlap.

## Validation

Artifact/log root: `/workspace/scicon-revamp/qa/T-fixes/validation/`.

- `npx tsc --noEmit`: **0 errors** (`tsc-final.log`).
- `VITE_PREVIEW_MODE=true npm run build`: passes (`build-final.log`); production-mode build also passes (`build-production.log`). Existing Rollup annotation/chunk warnings remain.
- Focused T + legacy completion/Weekly/weapon/pacing tests: **47/47 pass** (`final-focused.log`). S + G runtime tests: **35/35 pass** (`focused-initial.log`).
- Requested `node --test tests-revamp/*/*.test.*`: **517 pass / 3 fail / 520 total** on the preview build (`revamp-full.log`). Failures are F's expected POST-200 assertion (and parent test) and H's normal guest-save positive control: preview deliberately blocks both writes. Both files pass **7/7** against the production build (`production-browser-tests.log`). No assertion or preview write protection was weakened. All other revamp tests pass.
- Filtered `T-ui`: **6/6 cases, zero overflows/errors**, 360×640, 390×844, 430×932; gameplay and boss HUD. Actual Chrome fixture tests additionally cover 320px and top44/side12/bottom24 safe-area insets. The full 436-case audit was not run, as requested.
- Initial requested `T-play`: **59 / 58.5 FPS** mobile mission/boss medians. Final-snapshot `T-play-final`: **60 / 59.5 FPS**, both above the required 55; zero runtime/browser errors, canonical 390×844 world. Both runs use normal damage, with video/screenshot overhead included. Final report: `/workspace/scicon-revamp/qa/T-play-final/report.md`.

Reproduce the focused workflow:

```sh
npx tsc --noEmit
VITE_PREVIEW_MODE=true npm run build
node --test tests-revamp/T/*.test.mjs
npm run qa:playthrough -- --devices mobile --stages mission-1,boss --run-id T-review
npm run qa:ui -- --devices 360x640,390x844,430x932 --screens gameplay-hud,boss-hud --no-natural-victory --run-id T-ui-review
node tools-revamp/qa/explosion-capture.mjs --output /workspace/scicon-revamp/qa/T-fixes --phase review --stages boss,mini --quality high
```

Use a production-mode build for F's POST fixture and H's normal-save fixture. The immutable final preview snapshot used for capture is `/tmp/T-preview-dist`; `after/build-manifest.json` records its files.

## Before/after evidence and visual review

- Before death/banner overlap: `/workspace/scicon-revamp/qa/report-r3c/boss-death-before-after.png` (bottom row) and `/workspace/scicon-revamp/qa/S-explosions/after-final/boss/contact-sheet.png`.
- Before badge overlap: `/workspace/scicon-revamp/qa/report-r3c/deployed-play.png`.
- After boss death: `/workspace/scicon-revamp/qa/T-fixes/after/boss/` contains the natural-kill WebM, MP4, report, and **37 PNGs at 150 ms**. `frame-018.png` shows the mega explosion; `frame-022.png` shows hull fragments with no completion/flask text; `frame-036.png` shows the banner and flask text after the hull and effects have cleared.
- Full-height sequence overview: `/workspace/scicon-revamp/qa/T-fixes/death-before-banner.png` (frames 6, 12, 18, 24, 30, 36). Visually inspected: walking blasts, mega explosion, clear aftermath, then completion text. Kill/coin score feedback retains its original behavior.
- Mini-boss: `/workspace/scicon-revamp/qa/T-fixes/after/mini/` also contains 37 frames at 150 ms and a natural-kill video; `/workspace/scicon-revamp/qa/T-fixes/mini-before-banner.png` shows the full-height sequence. Both natural-death captures passed with no browser/runtime errors.
- After badge: `/workspace/scicon-revamp/qa/T-ui/360x640/gameplay-hud.png`, `/workspace/scicon-revamp/qa/T-ui/390x844/boss-hud.png`, `/workspace/scicon-revamp/qa/T-ui/430x932/gameplay-hud.png`. Visually inspected: badge is readable in its own rail; score, lives, coins, abilities, auto, pause and canvas header are unobstructed.
- The six phone HUD captures are also collected in `/workspace/scicon-revamp/qa/T-fixes/badge/`.
- `/workspace/scicon-revamp/qa/T-fixes/badge/home-390x844.png` confirms the same rail stays above the home content and its controls.

## Knobs, limits, handoff

Tune only `BOSS_COMPLETION_BEAT_MS` / `BOSS_COMPLETION_CAP_MS` in `BossCompletionGate.ts` and the reserved rail dimensions in `preview-build.css`. Actual completion follows the emitted visual tails; it does not assume High timing for Low/reduced motion. The cap deliberately favors completing the mission if rendering is interrupted. Capture timestamps are video/wall-clock estimates; unit tests prove exact barrier timing. Browser plugin was unavailable; validation used the repository's offline Playwright/system-Chrome harness. Physical-phone GPU/audio checks remain outside this focused run.

Git rejected staging with `Unable to create .../worktrees/w6-T/index.lock: Read-only file system`; all changes are left **uncommitted** for the integrator. Suggested commits: boss completion gate/tests; preview badge/audit/tests; this handoff. No alternate Git metadata workaround was used.

No art files, API handlers, scoring formulas, rewards, Weekly rules, or unrelated projects were changed. Top-level `api/*.js` remains **12**. No push, deployment, or external write API was performed.
