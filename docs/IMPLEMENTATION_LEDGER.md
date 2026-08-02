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
| 2 | Build the complete 10-life Weekly Run | DONE | Launches from Home with 10 lives, verified in the running game. Own campaign route, not campaign graph nodes. |
| 3 | Connect all production-ready bosses into the Weekly Run | DONE | 9 sectors / 27 missions / 9 unique bosses / 90 waves. Each sector runs 2 elites then its boss. Order is one exported array. |
| 4 | Campaign map progression, missions, coins, branches | WIP | Map is playable again: weekly state no longer disables Mission launch or gates intel reveal. Branch depth still TODO. |
| 5a | Stage enemy introductions across the Campaign | DONE | Was: all 19 roles authored by Sector 3, Sectors 4-10 debuting nothing new, and 3 roles never used at all. Now every Sector debuts at least one role, all 19 are used, and the heaviest arrive last. Sector 1 keeps its 7 (terrain-art pin, see content bugs). Tool: `tools/restage-enemy-introductions.mjs`; pinned by `tests/enemyIntroductionStaging.test.cjs`. |
| 5 | Improve the elite enemy roster and encounters | WIP | The 10 authored elites already carry distinct signature mechanics (crossfire, guardian halo, rail traverse, relay duel, gap ring, convoy shield, quadrant grid) and are placed 2-per-sector in the gauntlet. The `escort` formation exists but **cannot be authored into a wave**: `SpawnPatternId` has no `escort` member, so it is only reachable through the loose-shape table. |
| 6 | Distinct signature moves for main ships | WIP | Cooldown ladder 16/13/11/9s, Fire Rate tightens up to 35%. Each hull already has a distinct projectile behaviour (piercing lance / 3-shard volley / hash burst / pulse). Homing Missiles added as a 4th Hangar track, and **Signature Move** as a 5th: 5 levels at 220/480/900/1600/2600 coins, +28% damage and +11% radius each, so L5 is x2.40 damage / x1.55 radius across both blast tiers and ability projectiles. |
| 7 | Generate and integrate sprite sheets and effects | BLOCKED | No image generator available in this environment. Ability FX frames already exist under `scicon-player-weapon-fx-v1`. Animation systems/hookups can be wired so generated frames drop in. |
| 8 | Rebuild the home screen around the two modes | WIP | Both modes named and on screen at 390x844, zero text overlaps, no page scroll. Weekly Run card shows live status/boss count. Campaign card still needs coin balance + route. |
| 9 | Standardize menus, panels, victory/defeat screens | WIP | Text overlap fixed (ship-lock vs Connect). First-run Tutorial shipped on the shared pixel frame - it was orphaned with zero references. Result screens not yet reviewed. |
| 10 | Remove conflicting or obsolete old mode logic | WIP | Removed campaign-map weekly panel, orphaned confirmation flow, filler spawn system. |
| 11 | Build + gameplay smoke checks | DONE | `tsc`, `eslint` clean. `npm test` 1108 passing; only the 2 art failures that also fail on clean main. Matrix regenerated and green. |
| 12 | Prepare for hands-on testing | DONE | All three entry points verified launching in the running game: Weekly Run (10 lives), Start Mission (3), Campaign Map (3). First-run Tutorial renders and dismisses. Suite green apart from 2 pre-existing art failures. |

## Design reference: Galaxiga (not Galaga)

Reviewed store and press screenshots directly. The target is **Galaxiga**, the
modern Android arcade shooter, which is materially different from 1981 Galaga:

- **Wave stages are dense uniform blocks.** Roughly 10 columns by 8 rows of
  *identical* small enemies, evenly spaced, filling the top ~60% of a portrait
  screen. Around 60-100 hostiles visible at once.
- **Not scattered shapes.** Galaxiga does not read as v / sine / diamond /
  spiral squadrons. It reads as a wall of the same enemy that you shred. A
  clean grid is closer to the target than shape variety is.
- **Boss stages** are one large multi-part boss occupying the top ~40%, with a
  handful of small escorts, rather than a dense block.
- **The player is always flanked by wingmen** and fires a wide, dense column of
  projectiles. Heavy, saturated neon VFX throughout.

Implication for this repo: our threat cap (~18-26) and 4-8 unit formations are
an order of magnitude below Galaxiga's density. Matching the feel is primarily
an *enemy count and uniformity* problem, not a formation-shape problem. The
six-shape loose vocabulary added earlier moves away from the reference, not
toward it, and should be reconsidered against the mobile performance budget.

## Verified gameplay baselines

Balance matrix (600 trials, real `GameEngine`), vs `main` = 495 clears / 102 deaths / 3 timeouts:

- Current: **513 clears / 87 deaths / 0 timeouts**, dead-air breaches **0**, mobile peak load 1.000, no inversions, no perf-mode cells - with six-shape loose formation variety in place.
- Enemies leaving the field unshot: **41–50% → 0%**.

## Content bugs found, left for a deliberate decision

- **Two formation packs share one shape.** `pack-light-jet-pincer` and
  `pack-jet-pincer` are both `pincer`, so `resolveCampaignFormationPackForSpawn`
  cannot tell them apart. That blocks 28 drifter events from being converted
  into genuinely pack-backed formations. Giving one pack a different shape
  unlocks them but changes waves that already use it.
- **`escort` is not an authorable pattern.** `SpawnPatternId` has no `escort`
  member, so guarded elite pods can only appear via the loose-shape table, not
  from authored waves or the Combat Lab.
- **Sector 1 cannot shrink below seven enemy roles.** `stage-paywall-siege` and
  `stage-open-galaxy` are terrain Missions authored to fly only jet-family and
  journal art over desert and river backgrounds (pinned by
  `tests/pixiEnvironmentRoute.test.cjs`). That holds the whole jet family plus
  `role-journal-priority` in Sector 1. Introducing the jet family gradually
  means re-arting those two Missions first — a deliberate art decision, so the
  restaging left them alone.

## What constrains an enemy role's sector

Moving a role between sectors is not a one-field edit. Every one of these is
enforced somewhere, and each was found by breaking it:

1. `validate.ts` rejects a role used before its `introductionSector` /
   `introductionMission` — including roles reached through a Wave's declared
   formation packs, not just its spawn events.
2. Route-alternate Missions are not in `sector.missionIds`. They hang off
   `campaignGraph` route nodes and inherit the slot of the main node at the same
   depth. Missing them leaves illegal roles behind in a whole parallel route.
3. A grouped spawn must resolve to exactly **one** of its Wave's *declared*
   packs. Substituting roles one at a time produces role sets no pack covers, so
   replacement has to pick the pack first and draw roles out of its roster.
4. Every pack a Wave declares is charged against one shared `combatBudget`, so
   pack choice is Wave-scoped, not event-scoped.
5. A pack also has to clear `minimumSector`, `compatibleSectorIds`, and
   `compatibleMissionRoles` — and for a `major-boss` Mission, every Wave except
   the last is checked as `boss-preparation`.
6. A pack is only usable once **all** of its roles are introduced. Splitting a
   pack's roster across sectors strands the pack: separating
   `role-dark-sentinel` from `role-crescent-minelayer` cost `pack-dark-lanes`
   its two signature Missions.
7. A spawn event's enemies must stay distinct by `enemyId`, and Sector 1 exposes
   only two (`drone`, `swarm`), so some events legitimately lose entries.
8. Record-card art is derived from each stage's headline elite spawn, so
   swapping a generated `CAMPAIGN_ENEMY_*` silhouette for legacy Sector 1 art
   silently downgrades a user-facing artifact.

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
