# Reference boss pattern study — 2026-07-23

Sources: local gameplay recordings supplied for design study. This document
extracts encounter grammar and timing; SciCon keeps original names, artwork,
audio, and presentation.

## Professional boss rule

A boss feels lifelike when visible parts have one understandable mechanical
cause. It does not need constant movement.

Use this sentence for every authored action:

`telegraph → commit → sustain → release → recovery`

The pose, emitter socket, warning geometry, damaging geometry, and sound/effect
must describe the same action. Random limb wobble and unrelated overlays make a
boss less readable, even when they add visual activity.

## Eye-boss reference map

The first accuracy fixture is the circular eye encounter in the 46-second
recording.

| Reference beat | Approximate duration | Boss-owned presentation | Player puzzle |
| --- | ---: | --- | --- |
| Entrance and settle | 2.25 s | Stable chassis descends and eases into one upper-arena anchor | Read the silhouette before pressure starts |
| Calm damage window | 2.0–2.5 s | Central eye remains upright; one eight-socket carrier rotates counter-clockwise | Take safe damage time and learn the rotor |
| Rotor sentence | 6.5 s | Alternating nozzles flare in a 0.5 s active / 0.5 s recovery rhythm; sparse pink radial pellets and slower eye-shaped sprites share the authored sequence | Move through changing angular gaps while respecting slow lane hazards |
| Projectile drain | About 0.5 s | Portals and pellets clear; chassis remains anchored | Re-center instead of being surprised by an immediate follow-up |
| Laser guide | About 1.0 s | Four thin rays remain attached to the live rotating carrier | Read the exact safe quadrants |
| Beam commit | About 0.7 s observed | The same four rays become thick damaging beams at the same angle | Commit to the previously shown safe sector |

The central eye, chassis plates, and four diagonal relays stay substantially
fixed. The rotating carrier is the single drivetrain. Its simulation angle is
authoritative for:

- eight rendered nozzle transforms;
- pellet emission sockets;
- thin warning rays;
- thick damaging beam collision;
- the projectile/portal presentation cadence.

## Aurora Oculus reference fixture

Aurora Oculus is Sandbox-only and never enters the shipping campaign.

- One ordinary hull health region; no invented cannon, helmet, shield, or weak
  point semantics.
- Large health pool and one flat-speed phase so the player can learn the
  sentence.
- Existing generated Aurora sheet is re-rigged as a stable chassis plus a
  rotating eight-emitter core.
- `rotor-hazard-sentence` sustains bounded deterministic pellet and eye-sprite
  pressure.
- `radial-beam-array` uses angle-aware ray collision. Its spoke telegraph and
  damaging rays sample the same carrier state.
- Reduced-motion settings damp only the tiny chassis settle. They do not change
  socket positions, warning rays, beam angles, or attack rules.

## Acceptance gates for future professional bosses

Before a new boss pattern is accepted:

1. Name the player puzzle in one sentence.
2. Identify the mechanical part that causes every hazard.
3. Show a harmless warning on the exact future damage geometry.
4. Include a release and recovery window.
5. Replay identically for the same frame, seed, viewport, and input.
6. Verify desktop and phone safe regions.
7. Change later phases through geometry, order, masks, or combinations before
   increasing global cadence or projectile speed.
8. Use sprite hazards only when their scale, silhouette, and movement make them
   mechanically different from ordinary bullets.

## Building toward super bosses

Do not add a second phase to the eye fixture until the first loop matches the
reference checkpoints. Once it does, super-boss variants should reuse the same
drivetrain and change one authored rule at a time:

- reverse or briefly lock the carrier;
- choose a different four-of-eight beam mask;
- leave one explicit safe sector in the pellet spokes;
- reorder the slow eye-sprite lanes;
- combine a learned rotor sentence with one previously learned wall or summon;
- expose a new target only during recovery.

Novel mechanics still require one reusable typed primitive. Ordinary boss
creation should then be timing, geometry, art-rig, and balance work inside the
Sandbox—not another bespoke engine branch.
