# Deterministic local QA

## UI overflow and motion audit

Build with `npm run build`, then run `npm run qa:ui -- --run-id H-ui-review`.
The audit serves the built files through the same offline server/browser helpers
as gameplay QA. It checks short 360×560, 390×664, and 412×700 visual viewports (DPR 2),
retains 360×640/DPR 2, 390×844/DPR 2, 430×932/DPR 3, and checks the
real 1280×800 desktop launcher and game iframe. The short sizes represent space
remaining after Android browser toolbars and an install banner. JSON, Markdown, and screenshots
are written under `/workspace/scicon-revamp/qa/<runId>/`.

The screen matrix covers menu tabs, campaign selection, research, wings and
previews, populated/empty Signals and leaderboards, rewards, More panels,
settings, pause, story, loading, and result/guest-record panels. Synthetic
offline content includes long accepted pilot/proposal/author names and large
scores. Result fixtures separately cover victory, the longest authored mission
name, boss victory, campaign completion, defeat, boss defeat, and weekly results.
Every scrollable panel is sampled through its contents. Text ranges,
scroll dimensions, border bounds, clipping, overlapping controls, centering,
image-frame interiors, and interactive safe-area bounds are checked;
any overflow, navigation failure, or browser error fails the command. Closed
details, screen-reader-only labels, ordinary scrolling, and the background behind
a modal are distinguished from visible clipped text. Visible `aria-hidden`
counters are still checked. `tests-revamp/H/` plants actual faults to verify the
checker. `tests-revamp/Q/` plants horizontal/vertical centering faults, frame-border
intrusions, offscreen buttons, and real CDP-emulated `env(safe-area-inset-*)`
insets to prove the additional checks.

SVG mission-record images are fetched from the offline fixture server and their
text is measured with SVG `getBBox()`. Explicit text-column bounds detect collisions
inside the image, which ordinary DOM text ranges cannot see. Middle-anchored SVG
titles and stat labels with declared columns also fail above a 3 CSS-pixel center
offset, measured after the image's display scaling. The Flight Guide case
uses a normal disposable guest session because `qa=1` intentionally disables
onboarding; its real mission is launched and the steering lesson must be visible.

If the execution environment limits the lifetime of a long process, run selected
screen/device batches and compose their reports:

```sh
node tools-revamp/qa/ui-report.mjs H-ui-verified /path/to/batch-a/report.json /path/to/batch-b/report.json
```

The composer requires every screen/device pair, retains failures, and fails on
missing coverage. A later capture of the same pair replaces the earlier one;
each case records its build and source report, and the original reports remain
untouched. This supports explicit rechecks after a localized fix.
Each capture records a SHA-256 hash of the DOM/SVG geometry engines; composing
a final report fails if any retained case used an older checker. A newer capture
must replace that case rather than silently dropping its earlier violations.

The opt-in `?qa=1&uiAudit=1` bridge supplies presentation fixtures using production
components and disposable QA storage; it freezes combat/settlement while a fixture
is active. The bridge is unavailable with an active wallet, and fixture interactions suppress profile/streak persistence and wallet syncing. The existing QA storage shim also isolates native browser saves. It grants no server verification and performs no wallet operation.
Reload to resume normal gameplay. Reports explicitly label fixture scenes; a
separate `victory-gameplay` case uses the real mission/autoplay/god flags and waits
for a naturally completed mission.

For iteration, `--devices 360x640`, `--screens home,hangar,victory`, and
`--no-natural-victory` produce clearly marked partial reports. `--baseline` audits
a pre-hook build supplied by `--dist`. Use a stable copy of `dist` when another
build is running so lazy-loaded assets cannot disappear between captures.

Motion respects the live OS reduced-motion preference, including menu sprite
timers. Pixelify Sans and its OFL license are bundled locally in `public/fonts`.
Image frames declare their measured transparent interior with
`data-frame-inner-rect="left top right bottom"`: all four values are percentages
of the element border box, with right/bottom expressed as coordinates rather
than insets. For example, `"12 15 88 90"` reserves 12% on each side, 15% above,
and 10% below. Text painted outside that rectangle fails. A nested banner can
declare its own inner rectangle; that nearest frame governs its descendants.
Ordinary scroll content is measured only where painted, and every scroll slice
is still captured. Invalid rectangle declarations also fail.

Center-aligned blocks are inferred from `text-align:center`; button icon/text
content is measured as one group and normal wrapped copy is checked per line.
Flex/grid controls with explicit vertical centering also check the aggregate
content's vertical center, including multiline labels and visible icon capsules.
Positioned corner badges and headings are checked in their own label boxes,
separately from a button's flowing content. When a centered control declares a
frame inner rectangle, that painted interior supplies its alignment center.
Use `data-ui-center="x"`, `"y"`, or `"both"` on an actual alignment box to
explicitly assert the intended axes. A deviation greater than **3 CSS pixels**
fails. `data-ui-center-icon` includes a non-image decoration in a centered button
group. `data-ui-center="off"` is reserved for intentionally asymmetric designs,
not for silencing a failed centered label. `data-ui-min-target="44"` declares a
44px minimum interactive height on a control or its enclosing action dock.

Interactive controls are checked against `visualViewport` and computed
`env(safe-area-inset-*)`, including focusable scroll regions and ARIA controls.
Wholly offscreen controls fail unless their content is
reachable by an ordinary scrollport. The report records the actual viewport,
insets, and separate center/frame/safe-control coverage counts. Visual review
remains necessary for motion quality and agreement between the declared inner
rectangle and the original frame PNG.
Declared 44px targets are measured after the desktop iframe's CSS display scale,
so a 44px game-space button rendered as 34px in the outer shell still fails.

Build once with `npx vite build`, then run `npm run qa:playthrough`. The harness never builds, deploys, connects a wallet, or writes to a remote API. It serves the existing `dist` directory on an ephemeral loopback port. All `/api/*` GETs use JSON fixtures in `tools-revamp/qa/fixtures/`; POSTs receive `{ "ok": true }`. Browser requests outside the local origin are fulfilled offline, and WebSockets are closed. Request bodies, headers, and query values are not recorded.

The full run opens the start screen, plays mission 1 for 60 seconds, a campaign midpoint mission for 45 seconds, and a boss for 45 seconds, first on mobile (390×844, DPR 2, touch), then desktop (1280×800). Desktop uses the real **Start Browser Run** shell and its game iframe. Both use the same authored mission and RNG seed. The boss query jumps directly to the first authored boss wave; the first boss mission is also provided as a fallback. Contexts are fresh for each scenario to avoid cross-run saves or cache interference. God mode is off by default so death counts remain useful.

```sh
npx vite build
node --test tests-revamp/F/*.test.mjs
npm run qa:playthrough
# Fast diagnostic; explicitly labeled as shorter coverage in the report:
npm run qa:playthrough -- --devices mobile --seconds 12 --run-id F-check
# Recheck one scenario at its normal duration:
npm run qa:playthrough -- --devices mobile --stages mission-1
# Longer boss observation with damage disabled (report explicitly marks god mode):
npm run qa:playthrough -- --god
# Capture an untouched build that has no QA hooks:
node tools-revamp/qa/playthrough.mjs --baseline --dist /tmp/scicon-F-baseline-dist
```

Artifacts go to `/workspace/scicon-revamp/qa/<runId>/`. Each scenario includes screenshots at least every five seconds of sampling and on wave changes, life loss, boss phase changes, and run state changes. A full viewport screenshot includes the desktop shell. Playwright writes a WebM; `/usr/bin/ffmpeg` produces a ten-second MP4 and GIF excerpt. The Playwright ffmpeg executable is a scratch-directory symlink to the system binary, so no package/browser installation is necessary. If video is unwanted, pass `--no-video`; conversion failures remain visible in report notes. Video and screenshot overhead is included in measured FPS.

`report.json` contains per-second game state, browser and game FPS, console/page errors, maximum enemies and enemy bullets, observed life losses, boss presence, world dimensions, API request metadata, and artifact paths. `livesLost` counts life decreases; `deaths` counts transitions from positive lives to zero, so damage is not mislabeled as a complete ship loss. `report.md` provides a summary table and linked image/video list. Errors, blank canvas, a frozen simulation frame counter, active-game median FPS below 30, missing boss coverage, and mismatched world dimensions fail the full run. Reports are preserved even when startup fails. Browser FPS is labeled separately and never substituted for game FPS in a passing QA run. Baseline runs cannot read game telemetry or jump to locked missions: they exercise the real first-mission UI with pointer sweeps and mark missing mid/boss coverage explicitly.

Available runner options:

| Option | Default | Effect |
| --- | --- | --- |
| `--dist <path>` | `./dist` | Existing build to serve |
| `--output <path>` | `/workspace/scicon-revamp/qa` | Artifact parent directory |
| `--run-id <name>` | UTC timestamp | Unique directory name; existing names are rejected |
| `--devices mobile,desktop` | Both, sequentially | Select viewports |
| `--devices 360x640,390x844` | Opt-in phone sizes | Capture both phone aspects with the same 390×844 simulation |
| `--stages mission-1,boss` | All scenarios | Targeted diagnostic; not full coverage |
| `--seed <n>` | `12345` | Same gameplay RNG seed for all scenarios |
| `--seconds <n>` | 60/45/45 | Short diagnostic duration override |
| `--god` | Off | Disable damage for coverage; not a fairness test |
| `--baseline` | Off | Observe a build without QA hooks |
| `--no-video` | Off | Skip recording and conversion |

Use `SCICON_CHROME=/path/to/chrome` to override `/usr/bin/google-chrome`. Chrome launches with `--no-sandbox --disable-dev-shm-usage --use-gl=swiftshader --enable-unsafe-swiftshader`. No new browser dependencies are downloaded. This workflow uses the requested `playwright-core` with the installed system browser.

## In-game flags and inspection

Flags are inert without `qa=1`. QA has no normal gameplay UI. For example:

```text
/?qa=1&seed=12345&mission=operation-open-galaxy&autoplay=1&skipIntro=1
/?qa=1&seed=12345&bosslab=first&autoplay=1&skipIntro=1&god=1
```

`mission` accepts an authored level ID from `game-config/campaign.json`. `bosslab` accepts `first`, an authored boss event ID, or a boss ID, and takes priority over `mission`. `skipIntro=1` skips mission introduction delays. `autoplay=1` drives the ordinary input path with a deterministic dodge/sweep bot and auto-fire. `god=1` is intended for QA coverage only. A QA session uses isolated temporary progress and excludes normal campaign rewards.

In the game document (the child iframe on desktop), `window.__sciconQA.state()` reports readiness, active gameplay, mission/wave, score, lives, boss HP/phase, simulation frame, world size, and captured errors. `fps()` reports the render loop frame rate; `counts()` reports enemies and enemy bullets. The API is observational and returns snapshots.

## Smoke coverage and interpretation

`tests-revamp/F/smoke.test.mjs` verifies the actual built HTML, the first ten seconds of the start screen without page errors, direct mission launch, advancing simulation frames, enemy spawning, nonblank canvas pixel variance, at least eight active FPS samples with median ≥30, and local fixture GET/POST calls. Canvas pixels are sampled from a screenshot so WebGL's drawing-buffer settings stay unchanged. `SCICON_QA_DIST` selects a different existing build. Smoke artifacts are written under `/workspace/scicon-revamp/qa/smoke-<timestamp>/` even on failure.

Median FPS is a repeatable smoke gate, not a claim that every frame meets budget; the full report also records p10 and minimum FPS. SwiftShader is CPU rendering and is sensitive to machine contention. Run browser scenarios sequentially, investigate failures, and preserve their reports. The harness does not establish device GPU performance, human dodgeability, complete campaign progression, wallet flows, production API behavior, or deterministic rendering. RNG is seeded; timestamps and frame presentation can still differ. Review screenshots and clips for bullet contrast, telegraph readability, HUD thumb clearance, enemy entrances, and the tempo of the opening minute against the design document.

Samples are timestamped after collection and include collection duration. The report includes the largest sample gap, including the opening and final intervals; a gap or stalled sample longer than ten seconds fails coverage. Life losses and bullet maxima are observed lower bounds, not a continuous event log. Active FPS excludes the zero-life death animation. A ship loss is reported explicitly; the remainder of that scenario records the result screen rather than silently restarting or enabling god mode.
