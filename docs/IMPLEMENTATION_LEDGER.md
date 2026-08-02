# Scicon Shooter Overhaul — Implementation Ledger

Persistent task ledger for the Weekly Run / Campaign separation overhaul.
An item is **done** only when it is reachable and functional in the running
game. "Code exists" or "build compiles" is not done.

Branch: merged to `main` on 2026-08-02 (fast-forward, 38 commits). New work continues on feature branches.

## Status key
- `TODO` not started
- `WIP` in progress
- `DONE` functional in the running game
- `BLOCKED` blocked, with the exact blocker recorded

## Workstreams

| # | Workstream | Status | Notes |
|---|---|---|---|
| 1 | Separate Weekly Run and Campaign state and flow | WIP | Campaign no longer posts to the weekly board (`isWeeklyLeaderboardRun`). Mode-specific state objects still to split. |
| 2 | Build the complete 10-life Weekly Run | SUPERSEDED | Replaced by the endless generated gauntlet: services/weeklyRunGenerator.ts builds 40 escalating depths per week from the week key, with its own linear graph and zero Campaign coupling. |
| 3 | Connect all production-ready bosses into the Weekly Run | SUPERSEDED | The generator draws every elite and major boss from the catalog, shuffled per week: elites every 2nd depth, majors every 5th, cycling with depth-scaled health. |
| 4 | Campaign map progression, missions, coins, branches | WIP | Map is playable again: weekly state no longer disables Mission launch or gates intel reveal. Branch depth still TODO. |
| 5a | Stage enemy introductions across the Campaign | DONE | Was: all 19 roles authored by Sector 3, Sectors 4-10 debuting nothing new, and 3 roles never used at all. Now every Sector debuts at least one role, all 19 are used, and the heaviest arrive last. Sector 1 keeps its 7 (terrain-art pin, see content bugs). Tool: `tools/restage-enemy-introductions.mjs`; pinned by `tests/enemyIntroductionStaging.test.cjs`. |
| 5b | Enemy roles actually behave differently | DONE | All 19 roles carry a `characteristic` and the engine honours it: holders and artillery never leave the block, divers peel off and loop back, kamikazes commit one-way, flankers strafe, one commander pulls its wing into its dive. Artillery fires faster to compensate for never closing. Tool: `tools/assign-enemy-characteristics.mjs`; pinned by `tests/enemyCharacteristics.test.cjs`. |
| 5d | Remaining dead role metadata | OPEN | `fireBehavior` and `entryBehavior` are honoured. `durabilityClass` is **dead metadata** -- stored, shown in a debug snapshot, read by nothing, and not even correlated with authored health (the median `armored` enemy has *less* health, 5, than the median `standard` one, 6). A primary-fire armour mechanic was built and measured, then reverted; see "Primary-fire armour" below. `synergyTags` is authored with six distinct values and also read by nothing. |
| 5c | Name the Elite Bosses in play | DONE | All ten authored Elite Bosses announced themselves with the same hardcoded `BOTTLENECK SURGE` banner. The warning now reads `ELITE BOSS` over the encounter's authored name, auto-shrinking to fit the panel. |
| 13 | Achievements cover the game that exists | DONE | All six achievements scored the arcade loop; the Campaign graph, Weekly Run, Elite Bosses, and Hangar had none. Six new tracks added on six new lifetime stats. The pool was rebalanced from 10,400 to 10,900 across twelve tracks rather than ballooning to 27,330, which would have broken the guardrail holding free lifetime income near one expected Campaign (9,450 daily + 10,900 achievements = 20,350 against a 20,496 ceiling). |
| 5 | Improve the elite enemy roster and encounters | WIP | The 10 authored elites already carry distinct signature mechanics (crossfire, guardian halo, rail traverse, relay duel, gap ring, convoy shield, quadrant grid) and are placed 2-per-sector in the gauntlet. The `escort` formation exists but **cannot be authored into a wave**: `SpawnPatternId` has no `escort` member, so it is only reachable through the loose-shape table. |
| 6a | Retire the Homing Missiles Hangar track | DONE | Homing is the wing's job: the archive-beetle support ship carries the `homing-missile` ability, so a duplicate hull track was redundant. The track, the `Upgrades.missile` field, and the engine's auto-missile path are all removed. That firing path was unreachable on `main` anyway -- `upgrades.missile` was initialised to 0 and never raised -- so the Hangar track added in this branch was the only thing that ever exposed it. Matrix unchanged at 528/72/0. |
| 6 | Distinct signature moves for main ships | WIP | Cooldown ladder 16/13/11/9s, Fire Rate tightens up to 35%. Each hull already has a distinct projectile behaviour (piercing lance / 3-shard volley / hash burst / pulse). Homing Missiles added as a 4th Hangar track, and **Signature Move** as a 5th: 5 levels at 220/480/900/1600/2600 coins, +28% damage and +11% radius each, so L5 is x2.40 damage / x1.55 radius across both blast tiers and ability projectiles. |
| 6b | Give each signature move its own art | DONE | BIO/ETH/BTC all drew their move from the *primary weapon* FX pack, so the move a player chose their hull for looked like their normal gun. Each now has a dedicated 6-frame animation on a grid matching the projectile the engine spawns: helix lance (17x63), single crystal shard (21x33, one shard because the engine spawns three), hex lattice (36x48). ResearchHub keeps its existing hand-made art. The Hangar Signature Move tile now shows the selected hull's move instead of a placeholder. |
| 6c | Overdrive replaces the pattern pickups | DONE | The double/triple pickups bolted spread lanes onto any hull, erasing weapon identity. Triple spread is now the ETH hull's identity (centre lane + authored 15-20 degree sides, verified 18.6/19.3 in the real engine), and the pickup that replaced them -- Overdrive -- amplifies the hull's OWN fire: bigger, stronger, recoloured, five stacks, reset at the Mission boundary. First ladder (x1.15..x1.8) collapsed the matrix to 429/169 because the old pickup effectively TRIPLED output; retuned to x1.35..x3.25. Both renderers already default unknown pickups to the overdrive art. Hangar's T1-T7 strip now names each hull's weapon spec. Pinned by tests/weaponOverdrive.test.cjs. |
| 6d | Mission-clear coin sweep | DONE | Regular Mission finals authored only a 1s loot window, so cleared-Mission coins drained off screen. The reward window now floors at 2.5s while coins remain, and during it every coin is magnetized to the ship from anywhere on the field. Probe-verified: five corner coins, all collected. |
| 6e | Drop tuning | DONE | Extra lives halved everywhere (field 0.004 to 0.002, elite 0.014 to 0.007, weight 0.02 to 0.01) per play feedback; bombs untouched. |
| 18 | Surge waves | DONE | Introduction Missions run six waves and formation-remix seven; elite/boss-prep/major-boss stay compact so the climax remains the final beat. 80 authored (not cloned) waves composed from each Mission's own legal packs, inserted BEFORE the authored climax. Graph estimatedWaveCount and the v24 migration aliases are kept truthful by the tool. Per-wave bounty preserved, so Mission income grows with the added playtime; economy suite re-pinned. Tool: tools/author-extra-formation-waves.mjs. |
| 7 | Generate and integrate sprite sheets and effects | PARTIAL | No *image generator* is available, so nothing illustrative (a new hull, a creature) can be drawn. Sprites can be generated **procedurally**: `tools/pixel-canvas.mjs` is a dependency-free PNG encoder plus pixel raster, and `tools/generate-signature-move-fx.mjs` uses it to draw the four signature moves as 6-frame animations and sprite sheets. Neon VFX suit this well; character art does not. |
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

- Current: **528 clears / 72 deaths / 0 timeouts**, dead-air breaches **0**, no inversions, no perf-mode cells. Worst dead-air cell 0.970s against a 1s ceiling, so the margin is 0.03s.
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

## Primary-fire armour: built, measured, reverted, needs a call

`durabilityClass` does nothing. The fix was to make `armored` and `elite` hulls
blunt **primary fire only**, with missiles, bombs, the research beam, and all
four ship signature moves punching through at full damage -- so the class
teaches "bring the heavy weapon to the heavy target" rather than being an
invisible label or a flat health bump.

It works and it was cheap in balance terms. It was reverted for one reason:

**The Campaign has almost no visible-combat dead-air headroom.** The 1s ceiling
is currently met by **0.03s**: the worst cell in the shipped matrix sits at
0.970s. Anything that slows time-to-kill at all pushes some cell over, and which
cell it is moves from run to run.

Four measured runs, all at 600 trials:

| armour (armored/elite) | clears/deaths | dead-air breaches |
|---|---|---|
| none (shipped) | 528 / 72 | 0 (worst cell 0.970s) |
| 0.70 / 0.85 | 513 / 87 | 1 (`stage-last-light-gauntlet`, 1.15s) |
| 0.78 / 0.90 | 524 / 76 | 1, plus a first-visible-threat breach |
| 0.85 / 0.95 | 521 / 79 | 1 (`stage-singularity-reach-approach`, 1.05s) |
| 0.85 / 0.95, exempt during formation entry | 527 / 73 | 1 (`stage-crownclaw-frontier-approach`, 1.20s) |

Every breach was the same shape: a trailing `ENEMY_BRICK` still flying its entry
path while nothing else was on screen. Exempting entry did not fix it, because
the gap is the brick's travel time, not its time-to-kill -- armour only shifts
when that entry starts.

So this is a decision, not a bug:

1. **Build headroom first,** then ship armour. The trailing-heavy entry pattern
   is the real defect and it is already at the ceiling without armour.
2. **Relax the ceiling** to ~1.25s and ship armour now.
3. **Leave `durabilityClass` dead** and differentiate enemies only through
   `fireBehavior` / `entryBehavior`, which already work.

Reverting was chosen over quietly spending the last 0.03s of margin on a
mechanic that was not specifically requested.

## Campaign waves: why bulk-cloning them failed

Missions run four waves. More waves, Galaxiga-style, is the right direction and
the enemy characteristics only pay off with the room to use them. Cloning an
existing legal wave to extend each Mission looked like the cheap way in. It is
not, for three measured reasons:

1. **The 180s simulation ceiling.** Six waves produced 18 timeouts; five still
   produced 7. Median clear is 25.6s and p90 is 54s, so the tail runs long.
2. **Balance moved the wrong way.** Five waves scored 494 clears / 99 deaths /
   7 timeouts against a 528 / 72 / 0 baseline, with three dead-air breaches.
3. **Thirty-three tests pin the authored four-wave design** -- cadence, pressure
   placement, climax position, reward balance across all sixty Missions. They
   are not stale pins; they encode a deliberately tuned structure.

One real defect was found and is worth keeping in mind for the redo: a Mission
_climax_ is any wave carrying a boss event, not only one whose completionRule is
`boss-defeat`. Elite checkpoints end on a mini-boss inside a
`clear-after-duration` wave, so filtering on completionRule alone appends new
waves after the climax.

POSTSCRIPT: done on 2026-08-02 by tools/author-extra-formation-waves.mjs, which
followed exactly this recipe and landed green against the graph validator, the
Director validator, the migration aliases, and the cadence suite.

The redo should **author** waves against the characteristic mix -- a block of
holders, divers peeling out, a flanker pair, artillery arriving late -- the way
`tools/author-campaign-overhaul-v22.mjs` authored the current content, and retune
wave durations so the Mission still fits the clock. It is a content pass, not a
clone pass.

## Recorded blockers

- **Sprite generation (workstream 7).** No image-generation tool is available in
  this environment. Recolouring and compositing existing PNGs is possible;
  drawing new pixel art is not. Ship-ability FX frames already exist per ship.

## Known regressions fixed (do not reintroduce)

- Removing filler spawns without also ending waves on squadron clear caused
  595/600 dead-air breaches.
- Anything that slows time-to-kill reopens visible-combat dead air on whichever
  Mission is closest to the ceiling. The shipped worst cell is 0.970s against a
  1s ceiling, so the margin is 0.03s. See the primary-fire armour section.
- Editing any file in `SOURCE_DIGEST_PATHS` while the non-boss matrix is running
  makes the tool discard the whole run. Finish source edits first, then run.
  `services/enemyDurability.ts` was missing from that list, so retuning armour
  changed balance while the artifact kept its old digest; it is listed now.
- Snapping the wave clock forward pulled elite encounters onto fresh squadrons
  and pushed mobile peak load to 1.23 against a 1.2 ceiling.
- Collapsing the in-group spawn interval on an empty field measured worse on
  both dead air and peak load.
- Tripling Max Shot puts 1260 projectile sprites on a mobile frame against a
  900 budget.
- Adding a third child to `.scicon-mobile-home` without declaring a third grid
  row opened a 195px dead gap and pushed Start Mission off screen.
