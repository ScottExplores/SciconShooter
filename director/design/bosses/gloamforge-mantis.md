# Gloamforge Mantis

Gloamforge Mantis is the first component-first, manifest-driven boss experiment. It is sandbox-only and must never be referenced by `game-config/campaign.json`.

## Locked design

- Concept: an ancient autonomous forge in a mechanical mantis chassis
- View: front-facing, slightly top-down vertical-shooter perspective
- Silhouette: broad ivory shoulder baffles, substantial crucible body, paired scythe arms, four stabilizers
- Palette: midnight navy and charcoal steel, aged ivory ceramic armor, cobalt joints, copper caps, molten-orange energy
- Pixel treatment: chunky phone-readable 16-bit clusters, near-black outlines, hard physical alpha
- Authored rig size: defined by the generated `modular-hierarchy-v1` manifest
- Authority: the modular rig and its named source sprites; the concept is reference-only

## Anatomy

- closed/open central crucible body;
- port and starboard shoulder/scythe assemblies with inner joint covers;
- independently frame-animated port and starboard forge-bore cannons;
- independently detachable slag pods;
- four transform-driven stabilizer legs;
- port and starboard heat baffles;
- three-frame registered reactor exhaust;
- phase-two plasma cleaver;
- moving muzzle, pod, crucible, and cleaver sockets.

## Fight

1. Hammerfall Salvo braces and recoils one visible forge-bore at a time.
2. Crucible Keyhole opens the reactor and emits a staggered ring with a changing safe gap.
3. Slag-Pod Weave detaches the mounted pods and builds a bounded mobile-safe route.
4. At 34% health, Foundry Unbound opens the shell, intensifies the reactor animation, and introduces a telegraphed cleaver/beam combination.

Difficulty comes from route order and mechanism combinations, not a blanket speed multiplier.

## Local package

Editable sources, generated components, atlas metadata, rig metadata, and the rig-derived neutral preview live under:

`director-data/prototype-assets/gloamforge-mantis/`

That directory is intentionally ignored. Only the runtime preview and atlas are copied into the private mobile Runner. The locked general process is documented in [modular-boss-workflow.md](../modular-boss-workflow.md).

