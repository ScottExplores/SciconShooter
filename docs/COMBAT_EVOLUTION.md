# Experimental combat evolution — September 4, 2026

Branch: `codex/scicon-experimental`. Local-only test surface; no deployment.

Launch the canonical preview with `npm run dev -- --host 127.0.0.1 --port 5179
--strictPort`, then open
<http://127.0.0.1:5179/?display=mobile-frame&lab=combat>.
The experimental Hangar also links to Combat Lab in development mode.

## Test the first playable pass

1. Compare RSC, BIO, ETH and BTC at Stock, Evolved and Max Out. The sliders
   independently set primary, signature and movement upgrades.
2. Fly Neon Breakwater: ribbon swarm, mirrored crossfire, salvage, Bottleneck
   Drone elite, prism carousel and Gatekeeper Prime. Waves carry live health,
   pickups and score forward and stop at the Mission boundary.
3. Compare Salvage + Guard, Hunter + Guard and Solo. Quorum Crab seeks real
   coins within a level-scaled leash, suspending fire while collecting. Axiom
   Orbiter intercepts one ordinary hostile shot per recharge; it cannot erase
   beams or body hazards. The existing Archive Beetle supplies tracking fire.
4. Use the encounter picker for existing campaign elites/bosses. Invincibility,
   unlimited bombs, instant signatures and jump buttons reduce test setup time.
5. Test portrait drag, lift/re-grip, speed upgrades, pause/resume and resize.
   Turn invincibility off for actual difficulty judgement; Max Out plus
   invincibility is intentionally not a balanced challenge.

## Boundaries

- GameStage, GameCanvas, GameEngine and PixiGameRenderer remain canonical.
  There is no second combat model or new 3D engine.
- Lab equipment/stats exist only in memory. It mounts neither App nor wallet
  providers; no purchases, profile saves, campaign rewards or score submission.
- Lab routing/imports are DEV-gated and explicitly checked out of production.
- Weapon art/trails and utility companions also apply to ordinary play on this
  experimental checkout. RSC's existing gun geometry/art and all competitive
  scoring code are unchanged. A responsive resize fix clamps the separately
  owned player entity to the new bounds.
- Existing purchased support IDs are preserved, not deleted. Recommended
  utility loadouts narrow the choices without erasing players' fleets.
- New swarm pacing is a six-wave lab remix, not an untested campaign-wide
  replacement. Bosses use existing authored encounters; this pass does not
  claim new boss rigs/animations or modify the unrelated Umbra work.
- Art provenance, prompts and reproducible extraction are in
  [COMBAT_EVOLUTION_ART.md](COMBAT_EVOLUTION_ART.md).

## Reference research and design decisions

This is source-based design research, not a hands-on Galaxiga review or a
frame-by-frame video analysis. Publisher descriptions are marketing claims;
community mechanics documentation may lag current releases.

The [official Google Play listing](https://play.google.com/store/apps/details?id=com.os.space.force.galaxy.alien)
emphasizes formations, bosses, smooth movement, ship upgrades and ability
enhancements. Our response is an immediately playable comparison loop with
coherent formation entrances and clear per-hull colors, not copied content.

The [community gameplay overview](https://galaxiga.fandom.com/wiki/Gameplay_Overview)
describes edge entrance warnings and cooldown skills. Scicon already has
formation warnings and telegraph/attack/reform choreography; the showcase
combines those existing verbs instead of adding untelegraphed density.

The [community drone reference](https://galaxiga.fandom.com/wiki/Drones)
describes two companions with distinct cooldown abilities. Scicon's new
automatic collection/interception emphasizes visible utility without adding
more thumb buttons. This is our mobile design choice, not a claim that
Galaxiga has these exact utility drones.

The [community starship reference](https://galaxiga.fandom.com/wiki/Starships)
describes trial flights, distinctive signatures and upgrade progression. The
lab lets players compare all four Scicon hulls without owning or buying them.
The user's clarification takes priority: upgrades strengthen simple energy
shots rather than turning them into mechanical rockets.

## Shared formation-flight pass — September 4

The first lab pass reused the existing attack system. This follow-up changes
the shared Campaign runtime as well, without replacing Pixi, player movement,
projectiles, collisions, hull weapons, scoring or boss rigs:

- Ribbon/loop arrivals spawn single-file. Members share the same cruise speed
  and procession geometry before taking their own final formation slots.
- Cached arc-length geometry replaces rebuilding train curves twice per hull
  on every simulation frame; retained entry geometry is bounded to 128 routes.
- Authored diving squads use committed curved attack routes: paired breaks,
  pincers, crossing strafes, lane passes, leader feints and ring collapses.
  Target position is captured at the pre-attack warning rather than homing
  after a dodge. Existing shooter limits and collision geometry remain intact.
- Survivors fly around a visible flank to reform instead of teleporting to a
  random top-edge return position. Flight clocks advance with simulation
  updates, so hit-stop cannot skip ahead on these new attack/return routes.
- Pixel hulls turn through their actual flight tangent, with rate-limited yaw
  and short exhaust pixels. Retraction Fleet neutral/charge/fire frames now
  represent those states instead of cycling fire frames as idle animation.
- Rotating-wheel formations genuinely rotate. Gate warnings use the authored
  entry location rather than an unrelated left/right text placement.

Neon Breakwater now includes armed interceptors and separate crossing
flankers, with matching role/threat budgets and true split-side entries.
Loadout's **Watch squadrons** turns off automatic primary fire and companions
for hands-off observation; dragging still fires. Turn it off and relaunch for
normal combat. Jump buttons allow direct comparison of each encounter.

These are movement/choreography changes, not a new boss-art pass or a claim
that every campaign encounter has been individually redesigned.

Remaining product judgement: whether the density/contrast is enjoyable on a
physical phone, whether utility supports need balance changes, and which lab
formations deserve promotion into normal Missions. No claim of commercial
parity, retention improvement or device-wide frame-rate performance is made.
