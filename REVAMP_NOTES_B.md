# Revamp B — enemies, formations and early campaign

Implemented on `rv/B`. Scott's art files are unchanged. No API endpoint, external write, push or deployment was made; top-level `api/*.js` remains 12.

## What changed

- Eight mirrored, time-parameterised spline entries: swoop, loop, S-curve, side sweep, pincer, corkscrew, bottom flank and follow-the-leader train. Arc-length sampling keeps speed consistent; arrivals brake into gently breathing slots. Single-file release prevents stacked enemies.
- Single and escort-trio Galaga dives lock their travel target, fire once at the arc bottom, and loop exactly to their own slot. Authored cadence, mission progress and difficulty affect attack frequency; warnings retain their full duration.
- Diver, Escort Pair, Shield Bearer, Splitter, Mine Layer, Sniper, Teleporter and Carrier roles reuse existing sprites. New role callouts appear once per run. Shields block frontal approaches, splitters create two smaller children, carriers create bounded broods and bonus coins, and mine/sniper/teleport previews use procedural Pixi graphics.
- Every regular enemy has 42 active frames of firing grace after entering the screen. Side/bottom/kamikaze entries wait offscreen for 48 frames behind flashing chevrons. Special spawns and teleports maintain player clearance. One projectile cap covers all hostile sources, including elite shots and mine reservations.
- Sectors 1–3, including their optional routes, use a reproducible curve generator. The authored pressure index grows 7% within a sector and resets 10% after its boss. Waves alternate introduction, variation, peak and recovery. Later-sector content and existing major bosses are preserved.
- Mission 1 is one continuous opening: immediate swoop, power drop at 6 seconds, divers at 10, magnet at 18, a reinforcement train at 20, and Peer Reviewer at about 30. The mini-boss has a separate 8-HP shield and one aimed attack with a locked 0.8-second charge line. Long pickup messages fit within the phone arena.

## Files and merge hooks

New implementation is in:

- `services/revamp/formations/`: spline sampling, entry recipes, breathing, Galaga dive math.
- `services/revamp/enemies/`: behavior director, procedural telegraphs, opening mini-boss and callout layout.
- `services/revamp/integration/RevampCombatBridge.ts`: engine adapter, safe summons, entry warnings, projectile budgets and dive completion.
- `services/revamp/curve/`: pure curve model and deterministic authoring source.
- `tools-revamp/curve-report.mjs`, `tools-revamp/validate-campaign.mjs`, `docs/revamp/difficulty-curve.md`.
- `tests-revamp/B/*.test.mjs`: pure module, actual Pixi geometry, and real engine integration tests.

Shared-file edits are marked `// REVAMP(B):`:

- `services/gameLogic.ts`: bridge import/field and carrier ownership field; reset/tick/spawn/death hooks; unified firing/cap gates; deterministic formation separation, single-file spawn release and dive completion; shield-impact approach; dedicated opening mini-boss update/damage hooks; preserve the first mission's authored schedule.
- `services/pixi/PixiGameRenderer.ts`: one reused Graphics layer, telegraph draw call and fitting floating text to the world width.
- `services/gameplay/formations/FormationRuntime.ts` and `FormationFlight.ts`: dispatch to the new spline/movement/dive helpers. Flight metadata exposes shot age and return-slot completion.
- `game-config/types.ts` and `validate.ts`: new choreography IDs and explicit one-wave onboarding / expanded boss-mission wave-count allowances.
- `game-config/campaign.json` and `campaign-escalation-base.json`: generated roles, packs, early missions and refreshed escalation baselines.

No `App.tsx` changes. Existing `fairArena` continues to provide the same 390×844 simulation on desktop and mobile.

## Validation and reproduction

```sh
node --test tests-revamp/B/*.test.mjs
node tools-revamp/validate-campaign.mjs
node tools-revamp/curve-report.mjs --check
npx vite build
npx tsc --noEmit
git diff --check
```

All 40 focused tests pass. The full validator checks 60 missions, 33 roles and 50 packs, and the generated campaign/report passes the idempotence check. The engine tests exercise actual scheduling, drop emission, a complete one-shot dive, the 48-frame edge delay, shared projectile caps, wave-boundary hazard cleanup, and identical positions under both render profiles. First-minute schedule assertions isolate timing from player skill by using fixed kill times; they are not survival claims.

The final Vite build passes. The final TypeScript output matches the baseline exactly: six existing diagnostics in `services/pixi/boss-rigs/UmbraNeedlewingArtwork.ts`, comprising two missing prototype JSON imports and four resulting unknown-property errors. No new TypeScript errors were introduced.

Mobile QA artifacts are under `/workspace/scicon-revamp/qa/B-enemies/`. They include real Pixi telegraph fixtures and real GameEngine/PixiGameRenderer mission captures at 390×844, DPR 2. The fixture blocks external requests and uses the existing art. Runtime reports distinguish invincible inspection runs from runs with normal damage. The normal application menu/HUD shell is outside this fixture.

Final normal-damage browser replay: first visible enemy 0.35 s, power drop 6.067 s, first actual dive 17.05 s, four reinforcement ships present at 22 s, mini-boss 30.517 s, shield break 31.4 s, first charge 33.55 s, clear 48.45 s with two lives remaining and all 17 hostiles defeated. There were no application errors or missing assets; Chrome's software renderer reported four screenshot readback performance warnings. Screenshots through 60 s and `full-renderer-report.json` record this run. Hit-stop explains the small difference between authored combat times and elapsed simulation time. This is one deterministic autoplay sample, not a broad player-difficulty study.

Regenerate content and the report with `node tools-revamp/curve-report.mjs --write`; `--check` verifies idempotence. Do not edit generated mission values without updating `authorCampaign.mjs`.

## Tuning knobs

- `EnemyBehaviorRuntime.ts`: 42-frame entry grace, 48-frame sniper charge, 24-frame ghost preview; bullet caps 18/28/40/52; mine radius 34, fuse 156 frames, six active mines; carrier maximum three living minis and two broods. Specials consume authored attack intervals with role-specific ratios.
- `RevampCombatBridge.ts`: tier boundaries at missions 3/10/25, total entity admission for summons, 48-frame edge warning, dive cadence scale and collision-safe mine detonation. The cap can suppress a later boss emission when the field is full; it never adds bullets or shortens a telegraph.
- `entryLibrary.ts` / `galagaDive.ts`: route shapes, cruise speed, braking, breathing amplitude, maximum dive depth (68% of world height), escort offsets and cadence floor.
- `OpeningPeerReviewer.ts`: 8 shield HP, 48-frame charge, 180-frame recovery, shot speed 2.7 (bridge). Campaign owns hull HP, rewards and encounter time.
- `difficultyCurve.ts`: base encounter index 8, growth 1.07, sector reset 0.9, expected DPS and 0.48–1.10-second regular TTK targets. `authorCampaign.mjs` owns roster costs, introduction missions, wave rhythms, spacing and timed pickups.

## Limits and handoff

The 7% figure is an authored pressure index, not a measured increase in live bullets or deaths. Power/DPS/TTK are explicit estimates. Fixed warning times, player skill, route length, shields, shot caps and bounded spawns affect actual difficulty. Normal waves clear when their scheduled enemies are defeated, so mission length must be measured rather than inferred from authored duration windows.

The first-minute engine beats are implemented here. App-level cold-open menus/story overlays, left/right wing joins, unlocks, daily goals and result count-up remain integration points for jobs A/D/F. The opening mini-boss has its dedicated teaching runtime; this does not replace job C's broader boss polish.

`docs/AI_COLLAB_WORKFLOW.md`, referenced by AGENTS.md/CLAUDE.md, is missing from this snapshot and adjacent worktrees. The explicit worktree/branch instructions and available repository conventions were followed.

The worktree Git metadata directory is mounted read-only, although shared objects and branch refs are writable. Commits were made on `rv/B` using temporary metadata at `/tmp/scicon-B-git`, with the same working files and shared repository. The protected original index cannot be refreshed here, so ordinary `git status` and `git diff HEAD` can misleadingly show staged reversions/deletions. Use `GIT_DIR=/tmp/scicon-B-git GIT_WORK_TREE="$PWD" git status --short` (or `git diff HEAD` with the same environment) for the current index. `git show HEAD` reads the real committed branch. Once the original metadata is writable, `git reset --mixed HEAD` refreshes that index without changing working files.
