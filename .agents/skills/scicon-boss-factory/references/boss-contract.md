# Boss quality contract

## Identity

Define one sentence each for fantasy, combat role, silhouette, unique mechanism, and player learning arc. Name the physical source of every attack before choosing projectile geometry.

## Native pixel art

- Prefer a practical logical boss canvas near 128–192 px where the locked design permits.
- Use chunky clusters, a limited deliberate palette, clean one- or two-pixel structural outlines, binary structural alpha, and no soft painted gradients.
- Keep parts consistent in pixel density, perspective, palette, outline, lighting, material, detail, and scale.
- Use nearest-neighbor rendering. Prefer integer positioning/scaling where practical and document unavoidable fractional presentation scaling.
- Require equal canvas dimensions, registration, and pivot placement across alternate frames for one part.
- Preserve handedness across all alternate frames. Use authored left/right art or one deliberate mirror, never an opposite-hand source plus a second mirror, and keep scale signs stable through state changes.
- Treat semi-transparent glow/VFX separately from structural sprites.

## Visual source of truth

- Lock one canonical complete reference pose before deriving modular parts.
- Compare every accepted structural part against that reference; do not combine an independently invented complete boss with unrelated parts.
- Use the flattened reference only as a center- and height-matched comparison overlay in the Boss Sandbox. The modular rig remains the gameplay source of truth.
- Do not begin attack authoring until the neutral modular render matches the reference in silhouette, body/weapon proportions, articulation roots, layering, and visual balance.
- Give every accepted frame one explicit asset-usage status: neutral, animation, attack, phase two, damage, death, intentional future alternate, or archived/removed.

## Modular rig

Use a rooted hierarchy, for example:

`root -> body -> shoulder pivot -> upper arm -> elbow pivot -> forearm -> weapon pivot -> weapon -> muzzle socket`

Give each joint enough overlap, armor cap, piston, or hidden extension to remain connected across its validated motion range. Define collision from visible structural pixels, not an assembled bounding rectangle. Name every emitter socket and sample it from the current animated pose.

Parent each weapon, barrel, effect, and socket to the hull or articulated mount that owns its movement. Sample the live world transform for every actual emission; an origin captured during warning may lock aim, but must not become a stale firing origin. Destroyed anatomy must disable, shorten, remix, or deliberately replace the attacks it owns, and hidden/destroyed parts must not emit or retain damaging collision.

Capture and inspect neutral, fully open, fully closed, maximum left/right articulation, cannon firing, claw/weapon strike, charge, phase two, stagger, and death before accepting the motion range.

## Lifecycle

Require entrance, purposeful idle, attack anticipation, attack recoil, large-hit, stagger, persistent damage, visible phase transition, and deterministic multi-fragment destruction. Keep ordinary hit feedback local and brief.

## Attack sentence

Each of three core attacks and the signature attack must declare:

1. player skill;
2. owning anatomy and socket;
3. recognition cue;
4. deterministic or bounded branch rule;
5. safe route and survival rule;
6. settle/prepare;
7. anticipation pose;
8. exact telegraph tied to the future damaging origin;
9. first beat;
10. connected follow-up beats;
11. physical recoil/reaction;
12. recovery/vulnerability;
13. return to neutral.

The signature additionally needs a unique pixel-frame sequence, multiple moving components, a dramatic readable peak, and a recovery state that is visually meaningful.

For every attack, capture the real mobile gameplay preparation, telegraph, first beat, peak danger, and recovery. The attack-to-sprite mapping must name moving parts, frame animations, sockets, connected beats, player movement rule, recoil, recovery, and those capture paths.

Record the native forward axis and single velocity-orientation offset for every directional projectile sprite. Rapid-fire weapons must emit sequential rounds across simulation frames, with each round synchronized to a brief barrel animation, muzzle flash, and local recoil. Mines must visibly progress through deploy, arm, trigger, explosion, and cleanup; only visible active explosion frames may damage the player.

## Fight grammar

Use: entrance -> teach A -> teach B -> vary A -> teach C -> combine A+B -> signature -> recovery -> phase transition -> remix learned mechanics -> signature variation -> destruction.

Phase two must transform anatomy, movement, coordination, or exposure while retaining recognizable rules. Bounded variants may reverse direction, swap one of two lanes, or choose one of two seeded openings. Never hide the survival rule behind unrestricted randomness.

## Gameplay presentation and route margin

- Keep attack names, beat/state labels, predicted trajectories, aiming lines, joint/socket guides, part bounds, and collision outlines out of normal gameplay.
- Require an explicit developer toggle for every debug overlay; keep every toggle off by default and off in final gameplay captures.
- Telegraph through visible anatomy, movement, registered sprite animation, effects, and supported sound-event hooks.
- Prove all critical attacks on mobile and desktop with at least 6 px of replayed route clearance after the standard 3 px geometry uncertainty is applied.
- Visually inspect every attack in the actual canonical runtime at both mobile and desktop viewport sizes. Tests, deterministic proofs, mock renders, catalog previews, and thumbnails are supporting evidence only.

## Asset accountability

Give every generated, extracted, or retained asset an explicit active-use, intentional-future, or archived/removed status. Every active asset needs a named runtime consumer. Keep archived assets out of runtime atlases, manifests, registrations, and sprite-gallery claims.
