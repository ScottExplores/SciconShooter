# Enemy Wave Design

This experiment keeps Scicon Shooter's existing sector structure while making the regular combat phases behave like authored arcade encounters instead of independent downward drifts.

## Research Signals

- [Bandai Namco's Galaga history](https://galaga.com/en/history/galaga.php) describes enemies entering in groups, assembling into a formation, and then using special formation attacks and varied flight paths.
- [Galaga Arrangement](https://galaga.com/en/history/galagaArrange.php) adds zone changes, an asteroid zone, and substantially different attack patterns after the opening stage.
- [Galaxy Attack mechanics](https://galaxy-attack-alien-shooter.fandom.com/wiki/Mechanics) uses short multi-wave stages, escalating enemy behaviors, shields, and distinct boss encounters.

The reusable lesson is not to copy one game's content. It is to give every squad a readable combat sentence:

1. **Enter** along a visible path.
2. **Assemble** into a recognizable shape.
3. **Telegraph** a short hold.
4. **Attack** in staggered dives or coordinated fly-bys.
5. **Return** to formation so surviving enemies remain active threats.

## Scicon Formation Grammar

| Pattern | Gameplay role |
| --- | --- |
| V | Two compact chevrons assemble, then the center and wings peel off in sequence. |
| Grid | A multi-row wall creates target priority and safe lanes before staggered dives. |
| Sine | A looser wave produces lateral pressure and less predictable firing angles. |
| Pincer | Squads enter from both sides, settle into opposing columns, then converge. |
| Diamond | An outlined pack creates a readable center opening before diving. |
| Spiral | Enemies corkscrew into an orbit-like pack before breaking toward the player. |

## Sector Escalation

- **Open Orbit:** V, grid, then sine. The player learns assemble-and-dive timing.
- **Citation Storm:** Spiral, grid, then diamond. Entry paths and attack lanes become less linear.
- **Paywall Siege:** Grid, pincer, then diamond. Denser walls and crossing attacks precede the twin Bottleneck encounter.
- **Open Galaxy:** Spiral, pincer, then a large grid. The fastest pack cadence leads into the asteroid belt and shielded Gatekeeper.

The established mini-boss, checkpoint encounter, asteroid-belt, final-boss, and inter-wave flight blueprint remains intact. Normal squads now spawn in roughly two seconds, spend time as a formation, and recycle surviving attackers instead of taking the full phase to arrive one at a time.

## Art Direction

The regular enemy roster uses frame animation rather than code-drawn replacements:

- Paywall drones: five existing flight frames.
- Misinformation swarms: four existing wing frames.
- Bureaucracy asteroids: five existing asteroid variants.
- Predatory journal: four new bank/attack frames generated from the existing journal ship and downsampled to 96 x 96 RGBA pixel sprites.

Collision dimensions remain independent from sprite presentation so the new motion and frames do not silently change gameplay hitboxes.
