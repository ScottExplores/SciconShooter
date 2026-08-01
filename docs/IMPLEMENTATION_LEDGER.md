# Scicon Shooter Overhaul — Implementation Ledger

Persistent task ledger for the Weekly Run / Campaign separation overhaul.
An item is **done** only when it is reachable and functional in the running
game. "Code exists" or "build compiles" is not done.

Branch: `experimental/arcade-polish` (nothing pushed to `main`).

## Status key
- `TODO` not started
- `WIP` in progress
- `DONE` functional in the running game
- `BLOCKED` blocked, with the exact blocker recorded

## Workstreams

| # | Workstream | Status | Notes |
|---|---|---|---|
| 1 | Separate Weekly Run and Campaign state and flow | WIP | Campaign no longer posts to the weekly board (`isWeeklyLeaderboardRun`). Mode-specific state objects still to split. |
| 2 | Build the complete 10-life Weekly Run | WIP | Home entry exists but currently routes through campaign graph nodes and does not launch. Being replaced by a real gauntlet controller. |
| 3 | Connect all production-ready bosses into the Weekly Run | TODO | Needs a configurable boss order. |
| 4 | Campaign map progression, missions, coins, branches | TODO | Weekly panel already removed from the map. |
| 5 | Improve the elite enemy roster and encounters | WIP | `escort` formation added (leader + orbiting guards, leader will not dive while guarded). Not yet authored into waves. |
| 6 | Distinct signature moves for main ships | WIP | Cooldown ladder done: 16/13/11/9s, Fire Rate tightens up to 35%. Move *kinds* still need differentiating beyond projectile shape. |
| 7 | Generate and integrate sprite sheets and effects | BLOCKED | No image generator available in this environment. Ability FX frames already exist under `scicon-player-weapon-fx-v1`. Animation systems/hookups can be wired so generated frames drop in. |
| 8 | Rebuild the home screen around the two modes | WIP | Wordmark dropped on mobile; Weekly Run is its own box; grid row added so Start Mission is visible again. Needs the two-card structure. |
| 9 | Standardize menus, panels, victory/defeat screens | TODO | One text overlap fixed (ship-lock vs Connect). Shared panel/button styling not yet extracted. |
| 10 | Remove conflicting or obsolete old mode logic | WIP | Removed campaign-map weekly panel, orphaned confirmation flow, filler spawn system. |
| 11 | Build + gameplay smoke checks | WIP | `tsc`, `eslint`, `npm test` green except 2 pre-existing art failures. Balance matrix regenerated per engine change. |
| 12 | Prepare for hands-on testing | TODO | |

## Verified gameplay baselines

Balance matrix (600 trials, real `GameEngine`), vs `main` = 495 clears / 102 deaths / 3 timeouts:

- Current: **518 clears / 82 deaths / 0 timeouts**, dead-air breaches 2, mobile peak load 1.000.
- Enemies leaving the field unshot: **41–50% → 0%**.

## Recorded blockers

- **Sprite generation (workstream 7).** No image-generation tool is available in
  this environment. Recolouring and compositing existing PNGs is possible;
  drawing new pixel art is not. Ship-ability FX frames already exist per ship.

## Known regressions fixed (do not reintroduce)

- Removing filler spawns without also ending waves on squadron clear caused
  595/600 dead-air breaches.
- Snapping the wave clock forward pulled elite encounters onto fresh squadrons
  and pushed mobile peak load to 1.23 against a 1.2 ceiling.
- Collapsing the in-group spawn interval on an empty field measured worse on
  both dead air and peak load.
- Tripling Max Shot puts 1260 projectile sprites on a mobile frame against a
  900 budget.
- Adding a third child to `.scicon-mobile-home` without declaring a third grid
  row opened a 195px dead gap and pushed Start Mission off screen.
