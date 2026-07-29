# Mini-Boss Lab audit

Status: implementation and Campaign assignment complete
Scope: Campaign checkpoints with isolated Boss Sandbox previews
Campaign assignment: eight registry encounters assigned across sectors 2-10; Sector 1 retains Bottleneck Drone and Paywall Wall

## Audit conclusion

SciCon Shooter already has the correct foundations to extend rather than replace:

- The Boss Sandbox previews through the canonical `GameEditorCanvas -> GameStage -> GameCanvas -> GameEngine -> PixiGameRenderer` path.
- `BossEvent.count` can already spawn up to four real `MINI_BOSS` entities with independent health.
- Pixi already owns compact entity-local health bars, hit recoil, pooled effects, beams, and alpha-mask boss collision.
- The shared formation runtime already provides deterministic authored geometry.
- The Stage-20 asset pack contains approved elite silhouettes that cover emitters, guardians, wall units, orbiters, artillery, and paired sentinels.

The missing layer is a typed, sandbox-only encounter registry and controller. Current mini-boss behavior is generic and cannot express paired lifecycle, guardian ownership, wall attachment, bounded reinforcement ownership, survivor fallbacks, or encounter-specific cleanup.

## Existing encounter inventory

| Encounter ID | Display name | Current category | Visual concept and assets | Existing behavior / animation | Problems | Recommendation |
|---|---|---|---|---|---|---|
| `mini-boss-bottleneck-drone` | Bottleneck Drone | Campaign mini-boss | Old `MINI_BOSS` PNG; unused five-state Bottleneck Harvester pack exists | Generic tracking/roam, centered burst, bob/tilt, compact bar | Hard-coded bar label, no owned sockets, no authored attack sentence, improved pack unused | Rebuild later; retain stable identity and five-state pack |
| `mini-boss-paywall-wall` | Paywall Wall | Campaign wall encounter | Five-state Paywall Bastion sprites | Multi-segment downward wall, aggregate bar | Repeating wall swarm rather than a short signature encounter | Keep as a wall-system reference; polish separately |
| `fracture-engine-elite` | Fracture Engine Elite | No stable definition; campaign alias only | Current alias uses two static Ring Sentinel sprites | Two independent `bottleneck-drone` entities with simultaneous generic four-shot bursts | No linked choreography, satellites, named sides, survivor fallback, or owner cleanup | Rebuild first as a new sandbox-only paired encounter; do not alter aliases |
| `role-dna-conductor` | DNA Conductor | Elite enemy | Stage-20 DNA Conductor | Generic elite aura/bar plus formation motion | Static role asset, not a stable encounter | Keep as elite/guardian vocabulary |
| `role-laser-hunter` | Laser Hunter | Elite enemy | Stage-20 Laser Hunter | Generic aimed burst and lane laser | No encounter lifecycle | Keep as paired/wall-support vocabulary |
| `role-prism-artillery` | Prism Artillery | Elite enemy | Stage-20 Prism Artillery | Generic spread/laser cadence | No authored safe-route sentence | Keep as Prism Bloom vocabulary |
| `role-ring-sentinel` | Ring Sentinel | Elite enemy | Stage-20 Ring Sentinel | Incomplete ring pressure | Incorrectly stands in for Fracture Engine today | Keep as an elite asset; stop treating it as the encounter |
| `role-ring-emitter` | Bullet Ring Emitter | Elite enemy | Stage-20 Bullet Ring Emitter | Incomplete ring pressure | No distinct lifecycle | Keep as emitter/guardian vocabulary |
| `twin-halo-wardens` | Twin Halo Wardens | Test full boss | Paired-looking atlas | One flattened Boss entity and shared health | Not proof of a true pair | Keep as a full-boss visual reference; do not reuse its lifecycle |

## Existing full-boss Sandbox prototypes

The fourteen current Test Boss prototypes remain full-boss content. They must keep their IDs and behavior. The Mini-Boss Lab adds orthogonal category metadata rather than reclassifying their runtime structure.

| Prototype | Audit recommendation |
|---|---|
| Redline Re-entry | Preserve as movement reference; archive only after equivalent path tooling exists |
| Prism Moth Broodkeeper | Keep as a modular full-boss benchmark |
| Tribunal Laser Core | Preserve weak-point/beam reference |
| Meridian Harrower | Preserve aperture-puzzle reference |
| Helios Clawcarrier | Keep as a modular full-boss benchmark |
| Frontier Crownclaw | Keep under its current full-boss workflow |
| Aurora Oculus | Preserve rotating-emitter reference |
| Nullwake Revenant | Keep as revival/animated-rig benchmark |
| Umbra Needlewing | Preserve art and identity; future rig polish |
| Cinderjaw Siege Beetle | Preserve articulated-pincer reference |
| Gloamforge Mantis | Preserve modular art package |
| Vesperglass Mothmother | Preserve brood vocabulary |
| Twin Halo Wardens | Preserve as a flattened-pair reference, not paired-runtime proof |
| Riftcoil Wyrm | Preserve segmented-motion reference |

## Approved reusable asset pool

These stable assets were inspected at native size before any generation decision:

| Stable asset ID | Runtime URL | Best Mini-Boss Lab use |
|---|---|---|
| `CAMPAIGN_ENEMY_RING_SENTINEL` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/ring-sentinel.png` | Fracture satellites / elite reference |
| `CAMPAIGN_ENEMY_BULLET_RING_EMITTER` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/bullet-ring-emitter.png` | Prism Bloom / guardian emitter |
| `CAMPAIGN_ENEMY_LASER_HUNTER` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-hunter.png` | Twin Meridian Sentinel |
| `CAMPAIGN_ENEMY_PRISM_ARTILLERY` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/prism-artillery.png` | Prism Bloom alternate / projectile language |
| `CAMPAIGN_ENEMY_SHIELD_RAMMER` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/shield-rammer.png` | Aegis Brood Core / Convoy Captain |
| `CAMPAIGN_ENEMY_WALL_SNIPER_LEFT` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-left.png` | Railspine / Gridline left wall |
| `CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-right.png` | Gridline right wall / mirrored alternate |
| `CAMPAIGN_ENEMY_DNA_CONDUCTOR` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dna-conductor.png` | Maw Carrier / convoy command identity |
| `CAMPAIGN_ENEMY_ORBIT_DISC` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/orbit-disc.png` | Fracture engine / guardian satellite vocabulary |
| `CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dark-asteroid-sentinel.png` | Armored carrier/support vocabulary |
| `CAMPAIGN_ENEMY_CRESCENT_MINELAYER` | `/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/crescent-minelayer.png` | Escort / bounded support unit |
| `bottleneck-harvester` five-state pack | `/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/` | Fracture or carrier state animation |

The audited pool is sufficient for the first eight encounters. No new raster generation is justified before runtime proof. New art generation remains available only if gameplay-size visual verification exposes a real gap.

## Systems retained

- Canonical preview and renderer pipeline.
- Existing fixed-step simulation and seeded gameplay RNG.
- Existing `BossEvent.count` multi-entity spawn foundation.
- Existing boss timeline scheduler and typed preview commands.
- Existing Pixi beam, projectile, effect, debug-overlay, and compact health-bar systems.
- Existing formation geometry helpers.
- Existing alpha-mask collision generator.
- Existing Sandbox-only prototype provenance and promotion lock.

## Systems to extend

- Add encounter category metadata separate from campaign/test provenance.
- Add a sandbox-only Mini-Boss Lab registry with stable encounter IDs.
- Add a paired/guardian/wall encounter controller behind `GameEngine`.
- Replace the hard-coded `BOTTLENECK DRONE` compact-bar label with the live entity label.
- Add owned linked-unit and hazard cleanup for mini-boss deaths.
- Add deterministic survivor fallbacks and reinforcement budgets.
- Add category-aware Sandbox controls and metadata without changing campaign content.

## Locked architecture

1. Mini-Boss Lab definitions compile into validated Campaign checkpoint events and focused `bossId: bottleneck-drone` preview fixtures.
2. Campaign content references stable registry IDs; preview campaigns remain in-memory fixtures and cannot write Campaign content.
3. `GameEngine` remains the public simulation facade and delegates Mini-Boss Lab decisions to a focused gameplay module.
4. Pixi remains the only gameplay presenter and uses stable sprite URLs/IDs, nearest-neighbor textures, existing beams, and compact bars.
5. Every linked unit and hazard records an owner ID and encounter ID for cleanup.
6. Each definition is `sandboxReady: true` and `campaignAssigned: true` only after its runtime, safe-route, cleanup, and Campaign-binding gates pass.
7. Batch A must pass focused tests before Batch B definitions are enabled.
