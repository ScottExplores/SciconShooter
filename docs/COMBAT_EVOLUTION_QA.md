# Combat evolution verification — 2026-09-04

## Passed

- Full root suite: `node --test --test-reporter=dot tests/*.test.cjs`, exit 0.
- Final focused run: 23 tests covering Combat Lab, utility companions, alpha
  assets, mobile coordinate mapping, multitouch, hull weapons and signatures.
- `npm run typecheck`, exit 0.
- Scoped ESLint: zero errors; four existing unused-variable warnings in the
  large game engine/renderer files.
- `npm run build`, exit 0. Explicit exclusion checks include the new Lab route,
  component and test seed markers. Lab controls are absent from production.
- Regenerated the real-engine non-boss matrix: 600 trials / 50 Missions,
  586 clears, 12 deaths, 2 timeouts. This sweeps multiple power levels and is
  not a claim every loadout should clear every Mission. The matrix contract
  tests pass against the refreshed runtime digest.
- `git diff --check`, no whitespace errors.

## Observed in the built-in browser

Using the Browser/CUA path, not a second Playwright browser:

- Local unlocked route loads real Pixi gameplay; no Vite error overlay.
- 390 × 844: BIO Max Out completed all six showcase waves and stopped after
  Gatekeeper (68 kills, 146 coins in the observed run).
- BTC Evolved + Hunter/Guard also completed all six waves (68 kills,
  119 coins); a post-completion jump restarted the selected boss encounter.
- ETH Stock/Solo displayed the three violet energy lanes. BTC Stock displayed
  gold energy pulses. RSC Evolved retained its original blue volley artwork.
- Loadout presets, ship switching, support presets, launch, jump, signature
  cooldown display and pause/resume were exercised.
- Paused/finished/initializing flights disable the bomb and signature buttons
  so those actions cannot be queued against a stopped fight.
- 320 × 700: canvas measured 320 × 556; document and scroll width both 320,
  with no horizontal overflow. Player rendering continued after resizing.
- Browser drag moved the ship; coordinate/DPR and multitouch contracts passed.
  This does not substitute for a physical-phone touch/latency test.
- Browser error/warning log inspection returned an empty list during the
  completed BIO showcase. Temporary viewport overrides were reset afterward.

## Not claimed / remaining checks

- No physical iPhone/Android/Base Wallet run, sustained thermal/FPS profile,
  audio listening review, or full manual playthrough of all 30 encounter
  selector entries. Invincibility-off difficulty still needs human judgement.
- No new boss rig/art approval; this pass uses existing encounters.
- Existing build warnings: large chunks (entry ~2.76 MB and GameStage ~1.42 MB
  minified), mixed static/dynamic wallet import, Vite CJS deprecation, outdated
  Browserslist data and third-party PURE annotation notices.
- The six unused impact study frames remain source-study assets, not a newly
  implemented impact mechanic. No production deployment or main-branch edits.

The Pixi skill guided canonical-runtime reuse and collision/presentation
separation. The React guidance kept the Lab lazy-loaded and its draft campaign
and loadout memoized. Browser testing verified the rendered flow rather than
treating compilation alone as gameplay evidence.
