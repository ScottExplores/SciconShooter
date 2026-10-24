import type { FieldUpgradeType, Stats } from './types';
import { FIRE_RATE_MAX_LEVEL } from './services/weaponTierProgression';

// --- ASSET CONFIGURATION ---
export const ASSETS = {
  PLAYER_SHIP: "/game-art/branding/researchhub-ship.png",
  BIO_SHIP: "/game-art/branding/bio-ship.png",
  ETH_SHIP: "/game-art/branding/eth-ship.png",
  BTC_SHIP: "/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png",
  
  // Founder Icons - Mapped to Powerups
  // Triple Shot (Brian)
  FOUNDER_BRIAN: "/game-art/founders/brian.jpg",
  
  // Magnet (Patrick)
  FOUNDER_PATRICK: "/game-art/founders/patrick.jpg",
  
  // Shield (Jeffrey)
  FOUNDER_JEFFREY: "/game-art/founders/jeffrey.jpg",
  
  // Double Shot (Founder 4)
  FOUNDER_4: "/game-art/founders/founder-4.jpg",
  
  // Extra Life (Arshia)
  FOUNDER_ARSHIA: "/game-art/founders/arshia.jpg",

  // Pixel RSC coin: static face for UI plus upright yaw-flip frames for gameplay.
  RSC_TOKEN: "/game-art/tokens/rsc-coin-pixel.png",
  RSC_TOKEN_FLIP_FRAMES: [
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-01-000deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-02-030deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-03-060deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-04-090deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-05-120deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-06-150deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-07-180deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-08-210deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-09-240deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-10-270deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-11-300deg.png",
    "/game-art/generated/rsc-coin-flip-v1/frames/rsc-coin-flip-12-330deg.png"
  ],
  // Dedicated Present Drop targets. These preserve the existing generated
  // package artwork without routing the mechanic through asteroid assets.
  SUPPLY_DROP_STANDARD: "/game-art/generated/research-supply-standard-05c6d35dfd79.png",
  SUPPLY_DROP_ARMORED: "/game-art/generated/research-supply-armored-a4ab6f161a36.png",
  SUPPLY_DROP_FAST: "/game-art/generated/research-supply-fast-e47684f06aad.png",
  SUPPLY_DROP_GOLDEN: "/game-art/generated/research-supply-golden-de501f4a437d.png",

  // Real RSC Token (Clean Bottle)
  REAL_RSC_ICON: "/game-art/tokens/rsc-bottle.png",
  POWERUP_PROJECTILE_UPGRADE: "/game-art/generated/powerups/scicon-projectile-upgrade-v1/projectile-upgrade.png",
  // The generated pickup is intentionally a single-frame icon. Keeping it in
  // an array lets both renderers share the same frame-selection path without
  // implying that animation frames exist.
  POWERUP_PROJECTILE_UPGRADE_FRAMES: [
    "/game-art/generated/powerups/scicon-projectile-upgrade-v1/projectile-upgrade.png"
  ],
  POWERUP_MAX_SHOT: "/game-art/generated/powerups/scicon-max-shot-v1/max-shot-pickup.png",
  POWERUP_MAX_SHOT_AURA: "/game-art/generated/powerups/scicon-max-shot-v1/max-shot-aura.png",
  POWERUP_MAX_SHOT_AURA_FRAMES: Array.from(
    { length: 8 },
    (_, index) => `/game-art/generated/scicon-stage20-expansion-v1/powerups/max-shot-aura/frames/max-shot-aura-${String(index + 1).padStart(2, '0')}.png`
  ),
  POWERUP_MAGNET: "/game-art/powerups/magnet.png",
  POWERUP_MAGNET_FRAMES: [
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-01-rest.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-02-core-rise.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-03-energy-pulse.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-04-peak-glint.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-05-rim-travel.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/magnet/frames/magnet-06-settle.png"
  ],
  POWERUP_SHIELD: "/game-art/powerups/shield.png",
  POWERUP_SHIELD_FRAMES: [
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-01-rest.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-02-core-rise.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-03-energy-pulse.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-04-peak-glint.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-05-rim-travel.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/shield/frames/shield-06-settle.png"
  ],
  POWERUP_RESEARCH_BEAM: "/game-art/powerups/research-beam.png",
  POWERUP_RESEARCH_BEAM_FRAMES: [
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-01-rest.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-02-core-rise.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-03-energy-pulse.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-04-peak-glint.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-05-rim-travel.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/research-beam/frames/research-beam-06-settle.png"
  ],
  
  MENU_HERO: "/game-art/backgrounds/menu-hero.png",
  GAME_BG_BACK: "/game-art/backgrounds/bg-back.png",
  GAME_BG_STARS: "/game-art/backgrounds/bg-stars.png",
  GAME_BG_PLANET: "/game-art/backgrounds/bg-planet.png",
  GAME_PARALLAX_BACK: "/game-art/backgrounds/parallax-back.png",
  GAME_PARALLAX_STARS: "/game-art/backgrounds/parallax-stars.png",
  GAME_PARALLAX_FAR_PLANETS: "/game-art/backgrounds/parallax-far-planets.png",
  GAME_PARALLAX_BIG_PLANET: "/game-art/backgrounds/parallax-big-planet.png",
  GAME_PARALLAX_RING_PLANET: "/game-art/backgrounds/parallax-ring-planet.png",
  HOME_SPARSE_STARFIELD_BASE: "/game-art/generated/backgrounds/scicon-sparse-pixel-starfield-v1/scicon-sparse-pixel-starfield-v1.png",
  HOME_SPARSE_STARFIELD: "/game-art/generated/backgrounds/scicon-sparse-pixel-starfield-v1/scicon-sparse-pixel-starfield-twinkle.gif",
  HOME_ASTEROID_FIELD: "/game-art/generated/scicon-space-parallax-pack-v2/overlays/asteroid-field-basalt.png",
  PIXI_BREAKWATER_FAR: "/game-art/generated/scicon-breakwater-v1/far-space.png",
  PIXI_BREAKWATER_APPROACH: "/game-art/generated/scicon-breakwater-v1/approach.png",
  PIXI_BREAKWATER_WRECKFIELD: "/game-art/generated/scicon-breakwater-v1/wreckfield.png",
  PIXI_BREAKWATER_GATE: "/game-art/generated/scicon-breakwater-v1/gate.png",
  PIXI_SPACE_PARALLAX_BG_OBSIDIAN_NEBULA: "/game-art/generated/scicon-space-parallax-pack-v2/backgrounds/obsidian-nebula.png",
  PIXI_SPACE_PARALLAX_BG_ION_CLOUD: "/game-art/generated/scicon-space-parallax-pack-v2/backgrounds/ion-cloud.png",
  PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT: "/game-art/generated/scicon-space-parallax-pack-v2/backgrounds/violet-rift.png",
  PIXI_SPACE_PARALLAX_DEBRIS_BASALT: "/game-art/generated/scicon-space-parallax-pack-v2/overlays/asteroid-field-basalt.png",
  PIXI_SPACE_PARALLAX_DEBRIS_RUST: "/game-art/generated/scicon-space-parallax-pack-v2/overlays/asteroid-field-rust.png",
  PIXI_SPACE_RUN_HELIX_REDLINE_PROPS: "/game-art/generated/backgrounds/scicon-space-runs-v1/helix-redline/landmarks-atlas-3x3.png",
  PIXI_SPACE_RUN_SHATTERED_VOID_PROPS: "/game-art/generated/backgrounds/scicon-space-runs-v1/shattered-void/landmarks-atlas-3x3.png",
  PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS: "/game-art/generated/backgrounds/scicon-space-runs-v1/gravity-rift/landmarks-atlas-3x3.png",
  PIXI_SPACE_RUN_ION_ECLIPSE_PROPS: "/game-art/generated/backgrounds/scicon-space-runs-v1/ion-eclipse/landmarks-atlas-3x3.png",
  PIXI_SPACE_RUN_TERMINUS_FRONTIER_PROPS: "/game-art/generated/backgrounds/scicon-space-runs-v1/terminus-frontier/landmarks-atlas-3x3.png",
  PIXI_DESERT_TERRAIN: "/game-art/pixi/backgrounds/desert-terrain.png",
  PIXI_DESERT_CLOUDS: "/game-art/pixi/backgrounds/desert-clouds.png",
  PIXI_RIVER_TERRAIN: "/game-art/pixi/backgrounds/river-terrain.png",
  PIXI_RIVER_PROPS: "/game-art/pixi/backgrounds/river-props.png",
  PIXI_TERRAIN_SPACE_MASTER: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/space/backgrounds/space-round-master-512x4096.png",
  PIXI_TERRAIN_SPACE_PROPS: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/space/props/space-props-atlas-3x3.png",
  PIXI_TERRAIN_DESERT_MASTER: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/desert/backgrounds/desert-round-master-512x4096.png",
  PIXI_TERRAIN_DESERT_PROPS: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/desert/props/desert-props-atlas-3x3.png",
  PIXI_TERRAIN_DESERT_PROP_PERSPECTIVES: "/game-art/generated/backgrounds/scicon-ground-prop-perspective-v1/desert/desert-ground-props-perspective-master-3x9.png",
  PIXI_TERRAIN_RIVER_MASTER: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/river/backgrounds/river-round-master-512x4096.png",
  PIXI_TERRAIN_RIVER_PROPS: "/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/river/props/river-props-atlas-3x3.png",
  PIXI_TERRAIN_RIVER_PROP_PERSPECTIVES: "/game-art/generated/backgrounds/scicon-ground-prop-perspective-v1/river/river-ground-props-perspective-master-3x9.png",
  PIXI_THRUSTER_FRAMES: [
    "/game-art/pixi/effects/thruster/frame-1.png",
    "/game-art/pixi/effects/thruster/frame-2.png",
    "/game-art/pixi/effects/thruster/frame-3.png"
  ],
  PIXI_BOSS_THRUSTER_FRAMES: [
    "/game-art/generated/ui/scicon-interface-pack-v1/animations/floating-window/parts/flame-short.png",
    "/game-art/generated/ui/scicon-interface-pack-v1/animations/floating-window/parts/flame-medium.png",
    "/game-art/generated/ui/scicon-interface-pack-v1/animations/floating-window/parts/flame-long.png"
  ],
  PIXI_BOSS_HEALTH_FRAME: "/game-art/generated/ui/scicon-ui-system-v2/base/hud-primary/boss-integrity-bar.png",
  PIXI_BOSS_ALERT_FRAME: "/game-art/generated/ui/animations/boss-alert-banners-v1/frames/boss-incoming-alert-frame.png",
  PIXI_MINI_BOSS_ALERT_FRAME: "/game-art/generated/ui/animations/boss-alert-banners-v1/frames/mini-boss-alert-frame.png",
  PIXI_BOSS_ALERT_RING: "/game-art/generated/ui/animations/boss-alert-banners-v1/effects/warning-ring-red.png",
  PIXI_BOSS_ALERT_SCAN: "/game-art/generated/ui/animations/boss-alert-banners-v1/effects/rail-scan-red.png",
  PIXI_BOSS_ALERT_CRYSTAL: "/game-art/generated/ui/scicon-ui-system-v2/animations/alert-banner-deploy/parts/warning-crystal.png",
  PIXI_EXPLOSION_FRAMES: [
    "/game-art/pixi/effects/explosion/frame-1.png",
    "/game-art/pixi/effects/explosion/frame-2.png",
    "/game-art/pixi/effects/explosion/frame-3.png",
    "/game-art/pixi/effects/explosion/frame-4.png",
    "/game-art/pixi/effects/explosion/frame-5.png",
    "/game-art/pixi/effects/explosion/frame-6.png",
    "/game-art/pixi/effects/explosion/frame-7.png"
  ],
  PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES: [
    "/game-art/pixi/effects/boss-damage/frame-1.png",
    "/game-art/pixi/effects/boss-damage/frame-2.png",
    "/game-art/pixi/effects/boss-damage/frame-3.png",
    "/game-art/pixi/effects/boss-damage/frame-4.png",
    "/game-art/pixi/effects/boss-damage/frame-5.png"
  ],
  PIXI_ESCORT_DOUBLE: "/game-art/pixi/ships/escort-double.png",
  PIXI_ESCORT_TRIPLE: "/game-art/pixi/ships/escort-triple.png",
  PIXI_JET_SCOUT_FRAMES: [
    "/game-art/pixi/enemies/jet-scout/frame-1.png",
    "/game-art/pixi/enemies/jet-scout/frame-2.png"
  ],
  PIXI_JET_INTERCEPTOR_FRAMES: [
    "/game-art/pixi/enemies/jet-interceptor/frame-1.png",
    "/game-art/pixi/enemies/jet-interceptor/frame-2.png"
  ],
  PIXI_JET_HEAVY_FRAMES: [
    "/game-art/pixi/enemies/jet-heavy/frame-1.png",
    "/game-art/pixi/enemies/jet-heavy/frame-2.png"
  ],
  PIXI_BOSS_OPEN_ORBIT_FRAMES: [
    "/game-art/pixi/bosses/open-orbit/frame-1.png",
    "/game-art/pixi/bosses/open-orbit/frame-2.png",
    "/game-art/pixi/bosses/open-orbit/frame-3.png",
    "/game-art/pixi/bosses/open-orbit/frame-4.png",
    "/game-art/pixi/bosses/open-orbit/frame-5.png"
  ],
  PIXI_BOSS_CITATION_FRAMES: [
    "/game-art/pixi/bosses/citation-storm/frame-1.png",
    "/game-art/pixi/bosses/citation-storm/frame-2.png",
    "/game-art/pixi/bosses/citation-storm/frame-3.png",
    "/game-art/pixi/bosses/citation-storm/frame-4.png",
    "/game-art/pixi/bosses/citation-storm/frame-5.png"
  ],
  PIXI_BOSS_OPEN_ORBIT_ARM_LEFT: "/game-art/generated/boss-weapons/open-orbit-railgun-arm-left.png",
  PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT: "/game-art/generated/boss-weapons/open-orbit-railgun-arm-right.png",
  PIXI_BOSS_CITATION_CLAW_LEFT: "/game-art/generated/boss-weapons/citation-storm-plasma-claw-left.png",
  PIXI_BOSS_CITATION_CLAW_RIGHT: "/game-art/generated/boss-weapons/citation-storm-plasma-claw-right.png",
  PIXI_BOSS_PAYWALL_FRAMES: [
    "/game-art/pixi/bosses/paywall-decimator/body/frame-1.png",
    "/game-art/pixi/bosses/paywall-decimator/body/frame-2.png",
    "/game-art/pixi/bosses/paywall-decimator/body/frame-3.png",
    "/game-art/pixi/bosses/paywall-decimator/body/frame-4.png",
    "/game-art/pixi/bosses/paywall-decimator/body/frame-5.png"
  ],
  PIXI_BOSS_OPEN_GALAXY_FRAMES: [
    "/game-art/pixi/bosses/open-galaxy/frame-1.png",
    "/game-art/pixi/bosses/open-galaxy/frame-2.png",
    "/game-art/pixi/bosses/open-galaxy/frame-3.png",
    "/game-art/pixi/bosses/open-galaxy/frame-4.png",
    "/game-art/pixi/bosses/open-galaxy/frame-5.png"
  ],
  PIXI_BOSS_CROWNCLAW_FRAMES: Array.from(
    { length: 6 },
    (_, index) => `/game-art/generated/bosses/astral-crownclaw/animations/decay/frames/astral-crownclaw-decay-frame-0${index + 1}.png`
  ),
  CAMPAIGN_BOSS_ECLIPSE_ENGINE: "/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/eclipse-engine.png",
  CAMPAIGN_BOSS_FRONTIER_CROWNCLAW: "/game-art/generated/bosses/campaign-packages/frontier-crownclaw/assembled.png",
  CAMPAIGN_BOSS_HAMMERHEAD_SIEGE: "/game-art/generated/bosses/campaign-packages/hammerhead-siege/assembled.png",
  CAMPAIGN_BOSS_HELIOS_CLAWCARRIER: "/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png",
  CAMPAIGN_BOSS_HELIX_LEVIATHAN: "/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/helix-leviathan.png",
  CAMPAIGN_BOSS_ORBIT_GYROSCOPE: "/game-art/generated/bosses/campaign-packages/orbit-gyroscope/assembled.png",
  CAMPAIGN_BOSS_NULLWAKE_REVENANT: "/game-art/generated/bosses/campaign-packages/nullwake-revenant/assembled.png",
  CAMPAIGN_BOSS_UMBRA_NEEDLEWING: "/game-art/generated/bosses/campaign-packages/umbra-needlewing/assembled.png",
  CAMPAIGN_MINI_BOSS_BOTTLENECK_HARVESTER: "/game-art/generated/scicon-flight-motion-pack-v1/bosses/bottleneck-harvester/frames/bottleneck-harvester-02-neutral.png",
  CAMPAIGN_MINI_BOSS_MERIDIAN_HARROWER: "/game-art/generated/bosses/unported/meridian-harrower.png",
  CAMPAIGN_MINI_BOSS_CINDERJAW_SIEGE_BEETLE: "/game-art/generated/bosses/unported/cinderjaw-siege-beetle.png",
  CAMPAIGN_BOSS_PRISM_MOTH: "/game-art/generated/bosses/campaign-packages/prism-moth/assembled.png",
  CAMPAIGN_BOSS_RAIL_SERPENT: "/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/rail-serpent.png",
  PIXI_BOSS_RAIL_SERPENT_RIG: {
    head: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/head.png",
    bodyUpper: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/body-upper.png",
    bodyLower: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/body-lower.png",
    tail: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/tail.png",
    energyCore: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/energy-core.png",
    leftShoulder: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/left-shoulder.png",
    rightShoulder: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/right-shoulder.png",
    leftRib: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/left-rib.png",
    rightRib: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/right-rib.png",
    leftCannon: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/left-cannon.png",
    rightCannon: "/game-art/generated/scicon-stage20-expansion-v1/bosses/rail-serpent/rig/right-cannon.png"
  },
  PIXI_BOSS_PRISM_MOTH_RIG: {
    core: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/core.png",
    crest: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/crest.png",
    prismCore: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/prism-core.png",
    tail: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/tail.png",
    leftUpperWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/left-upper-wing.png",
    rightUpperWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/right-upper-wing.png",
    leftMidWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/left-mid-wing.png",
    rightMidWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/right-mid-wing.png",
    leftLowerInnerWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/left-lower-inner-wing.png",
    rightLowerInnerWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/right-lower-inner-wing.png",
    leftLowerOuterWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/left-lower-outer-wing.png",
    rightLowerOuterWing: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/right-lower-outer-wing.png",
    leftWeaponPod: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/left-weapon-pod.png",
    rightWeaponPod: "/game-art/generated/scicon-stage20-expansion-v1/bosses/prism-moth/rig/right-weapon-pod.png"
  },
  CAMPAIGN_BOSS_SINGULARITY_CRAB: "/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/singularity-crab.png",
  CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT: "/game-art/generated/scicon-stage20-expansion-v1/bosses/frames/tribunal-dreadnought.png",
  CAMPAIGN_ENEMY_BULLET_RING_EMITTER: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/bullet-ring-emitter.png",
  CAMPAIGN_ENEMY_CRESCENT_MINELAYER: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/crescent-minelayer.png",
  CAMPAIGN_ENEMY_DARK_ASTEROID_SENTINEL: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dark-asteroid-sentinel.png",
  CAMPAIGN_ENEMY_DNA_CONDUCTOR: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/dna-conductor.png",
  CAMPAIGN_ENEMY_LASER_HUNTER: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-hunter.png",
  CAMPAIGN_ENEMY_LASER_STALKER: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/laser-stalker.png",
  CAMPAIGN_ENEMY_ORBIT_DISC: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/orbit-disc.png",
  CAMPAIGN_ENEMY_PROTOCOL_VANGUARD_FRAMES: [
    "/game-art/generated/scicon-protocol-vanguard-v1/enemies/protocol-vanguard/frames/protocol-vanguard-01-neutral.png",
    "/game-art/generated/scicon-protocol-vanguard-v1/enemies/protocol-vanguard/frames/protocol-vanguard-02-charge.png",
    "/game-art/generated/scicon-protocol-vanguard-v1/enemies/protocol-vanguard/frames/protocol-vanguard-03-fire.png",
    "/game-art/generated/scicon-protocol-vanguard-v1/enemies/protocol-vanguard/frames/protocol-vanguard-04-damage.png"
  ],
  SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES: [
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/redline-skirmisher/frames/redline-skirmisher-01-neutral.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/redline-skirmisher/frames/redline-skirmisher-02-charge.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/redline-skirmisher/frames/redline-skirmisher-03-fire.png"
  ],
  SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES: [
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/crosscut-raider/frames/crosscut-raider-01-neutral.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/crosscut-raider/frames/crosscut-raider-02-charge.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/crosscut-raider/frames/crosscut-raider-03-fire.png"
  ],
  SCICON_ENEMY_AUDIT_BULWARK_FRAMES: [
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/audit-bulwark/frames/audit-bulwark-01-neutral.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/audit-bulwark/frames/audit-bulwark-02-charge.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/audit-bulwark/frames/audit-bulwark-03-fire.png"
  ],
  SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES: [
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/quasar-lancer-v2/frames/quasar-lancer-v2-01-neutral.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/quasar-lancer-v2/frames/quasar-lancer-v2-02-charge.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/quasar-lancer-v2/frames/quasar-lancer-v2-03-fire.png"
  ],
  SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES: [
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/vector-reaver-v2/frames/vector-reaver-v2-01-neutral.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/vector-reaver-v2/frames/vector-reaver-v2-02-charge.png",
    "/game-art/generated/scicon-retraction-fleet-v2/enemies/vector-reaver-v2/frames/vector-reaver-v2-03-fire.png"
  ],
  SCICON_ENEMY_QUASAR_LANCER_FRAMES: [
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-01-neutral.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-02-charge.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/quasar-lancer/frames/quasar-lancer-03-fire.png"
  ],
  SCICON_ENEMY_NULL_BASTION_FRAMES: [
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/null-bastion/frames/null-bastion-01-neutral.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/null-bastion/frames/null-bastion-02-charge.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/null-bastion/frames/null-bastion-03-fire.png"
  ],
  SCICON_ENEMY_VECTOR_REAVER_FRAMES: [
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/vector-reaver/frames/vector-reaver-01-neutral.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/vector-reaver/frames/vector-reaver-02-charge.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/vector-reaver/frames/vector-reaver-03-fire.png"
  ],
  SCICON_ENEMY_RIFT_WEAVER_FRAMES: [
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/rift-weaver/frames/rift-weaver-01-neutral.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/rift-weaver/frames/rift-weaver-02-charge.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/rift-weaver/frames/rift-weaver-03-fire.png"
  ],
  SCICON_ENEMY_PULSE_HERALD_FRAMES: [
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/pulse-herald/frames/pulse-herald-01-neutral.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/pulse-herald/frames/pulse-herald-02-charge.png",
    "/game-art/generated/scicon-advanced-enemy-pack-v1/enemies/pulse-herald/frames/pulse-herald-03-fire.png"
  ],
  CAMPAIGN_ENEMY_PRISM_ARTILLERY: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/prism-artillery.png",
  CAMPAIGN_ENEMY_RING_SENTINEL: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/ring-sentinel.png",
  CAMPAIGN_ENEMY_SHIELD_RAMMER: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/shield-rammer.png",
  CAMPAIGN_ENEMY_WALL_SNIPER_LEFT: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-left.png",
  CAMPAIGN_ENEMY_WALL_SNIPER_RIGHT: "/game-art/generated/scicon-stage20-expansion-v1/enemies/frames/wall-sniper-right.png",
  SCICON_ENEMY_ORBIT_SCOUT_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/orbit-scout-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/orbit-scout-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/orbit-scout-03.png"
  ],
  SCICON_ENEMY_CITATION_DART_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/citation-dart-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/citation-dart-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/citation-dart-03.png"
  ],
  SCICON_ENEMY_RESEARCH_SENTRY_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/research-sentry-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/research-sentry-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/research-sentry-03.png"
  ],
  SCICON_ENEMY_PEER_BULWARK_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/peer-bulwark-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/peer-bulwark-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/peer-bulwark-03.png"
  ],
  SCICON_ENEMY_JOURNAL_RAIDER_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/journal-raider-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/journal-raider-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/journal-raider-03.png"
  ],
  SCICON_ENEMY_HELIX_CONDUCTOR_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/rift-skimmer-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/rift-skimmer-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/rift-skimmer-03.png"
  ],
  SCICON_ENEMY_PRISM_ARTILLERY_FRAMES: [
    "/game-art/generated/scicon-enemy-squadron-v1/frames/pulse-interceptor-01.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/pulse-interceptor-02.png",
    "/game-art/generated/scicon-enemy-squadron-v1/frames/pulse-interceptor-03.png"
  ],
  PIXI_BOSS_CROWNCLAW_CORE: "/game-art/generated/bosses/astral-crownclaw/rig/astral-crownclaw-core-chassis.png",
  PIXI_BOSS_CROWNCLAW_LEGS: {
    frontLeft: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-front-left.png",
    frontRight: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-front-right.png",
    middleLeft: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-middle-left.png",
    middleRight: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-middle-right.png",
    rearLeft: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-rear-left.png",
    rearRight: "/game-art/generated/bosses/astral-crownclaw/rig/legs/astral-crownclaw-leg-rear-right.png"
  },
  PIXI_BOSS_CROWNCLAW_GUN_LEFT: "/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-underclaw-gun-left.png",
  PIXI_BOSS_CROWNCLAW_GUN_RIGHT: "/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-underclaw-gun-right.png",
  PIXI_BOSS_CROWNCLAW_CLAW_LEFT: "/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-sharp-claw-projectile-left.png",
  PIXI_BOSS_CROWNCLAW_CLAW_RIGHT: "/game-art/generated/bosses/astral-crownclaw/rig/weapons/astral-crownclaw-sharp-claw-projectile-right.png",
  PIXI_BOSS_CROWNCLAW_ROCKET_LEFT: "/game-art/generated/bosses/astral-crownclaw/weapons/astral-crownclaw-rocket-claw-left.png",
  PIXI_BOSS_CROWNCLAW_ROCKET_RIGHT: "/game-art/generated/bosses/astral-crownclaw/weapons/astral-crownclaw-rocket-claw-right.png",
  PIXI_BOSS_PAYWALL_RAY_FRAMES: Array.from(
    { length: 11 },
    (_, index) => `/game-art/pixi/bosses/paywall-decimator/rays/frame-${index + 1}.png`
  ),
  PIXI_BOSS_PAYWALL_BOLT_FRAMES: [
    "/game-art/pixi/bosses/paywall-decimator/bolts/frame-1.png",
    "/game-art/pixi/bosses/paywall-decimator/bolts/frame-2.png"
  ],
  PIXI_BOSS_PAYWALL_THRUST_FRAMES: [
    "/game-art/pixi/bosses/paywall-decimator/thrust/frame-1.png",
    "/game-art/pixi/bosses/paywall-decimator/thrust/frame-2.png"
  ],
  PIXI_BOSS_PAYWALL_CANNON_LEFT: "/game-art/pixi/bosses/paywall-decimator/cannon-left.png",
  PIXI_BOSS_PAYWALL_CANNON_RIGHT: "/game-art/pixi/bosses/paywall-decimator/cannon-right.png",
  PIXI_BOSS_PAYWALL_HELMET: "/game-art/pixi/bosses/paywall-decimator/helmet.png",
  ENEMY_DRONE_FRAMES: [
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/paywall-interceptor/frames/paywall-interceptor-01-contracted.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/paywall-interceptor/frames/paywall-interceptor-02-neutral.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/paywall-interceptor/frames/paywall-interceptor-03-charged.png"
  ],
  LEGACY_ENEMY_DRONE_FRAMES: [
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-01-forward-dive.png",
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-02-front-three-quarter-right.png",
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-03-right-profile.png",
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-04-rear.png",
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-05-left-profile.png",
    "/game-art/generated/scicon-kamikaze-spinner-v1/enemies/kamikaze-spinner/frames/kamikaze-spinner-06-front-three-quarter-left.png"
  ],
  ENEMY_SWARM_FRAMES: [
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/citation-wraith/frames/citation-wraith-01-contracted.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/citation-wraith/frames/citation-wraith-02-neutral.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/citation-wraith/frames/citation-wraith-03-charged.png"
  ],
  LEGACY_ENEMY_SWARM_FRAMES: [
    "/game-art/enemies/swarm-1.png",
    "/game-art/enemies/swarm-2.png",
    "/game-art/enemies/swarm-3.png",
    "/game-art/enemies/swarm-4.png"
  ],
  ENEMY_BRICK_FRAMES: [
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/peer-review-bulwark/frames/peer-review-bulwark-01-guard-low.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/peer-review-bulwark/frames/peer-review-bulwark-02-neutral.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/peer-review-bulwark/frames/peer-review-bulwark-03-guard-high.png"
  ],
  ASTEROID_BELT_FRAMES: [
    "/game-art/enemies/asteroid-1.png",
    "/game-art/enemies/asteroid-2.png",
    "/game-art/enemies/asteroid-3.png",
    "/game-art/enemies/asteroid-4.png",
    "/game-art/enemies/asteroid-5.png"
  ],
  ENEMY_JOURNAL: "/game-art/enemies/predatory-journal-raider.png",
  ENEMY_JOURNAL_FRAMES: [
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/predatory-journal-raider/frames/predatory-journal-raider-01-wings-in.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/predatory-journal-raider/frames/predatory-journal-raider-02-neutral.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/enemies/predatory-journal-raider/frames/predatory-journal-raider-03-wings-out.png"
  ],
  MINI_BOSS: "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-01-neutral.png",
  BOTTLENECK_DRONE_FRAMES: [
    "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-01-neutral.png",
    "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-02-idle.png",
    "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-03-charge.png",
    "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-04-fire.png",
    "/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-05-recovery.png"
  ],
  WALL_BOSS_SEGMENT: "/game-art/bosses/wall-segment.png",
  PAYWALL_BASTION_FRAMES: [
    "/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-01-idle.png",
    "/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-02-neutral.png",
    "/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-03-attack.png",
    "/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-04-damage-50.png",
    "/game-art/generated/elite-enemies/paywall-wall-v2/frames/paywall-wall-05-critical-15.png"
  ],
  FINAL_BOSS: "/game-art/bosses/final-boss-sentinel.png",
  
  // Referral Assets
  REFERRAL_LINK: "https://researchhub.com/referral/join?refr=db8c0146-a571-4a57-b576-78f75066298c"
};

export const DONATION_CONFIG = {
  BUILDER_CODE: "bc_ww78gi4f",
  RECIPIENT_ADDRESS: "0x3A8D692Aabdd4981080a8F6af8375a21359464Bf",
  RSC_CONTRACT_ADDRESS: "0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1",
  BIO_CONTRACT_ADDRESS: "0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2",
  CBBTC_CONTRACT_ADDRESS: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf",
  USDC_CONTRACT_ADDRESS: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  BASE_CHAIN_ID: 8453,
  BASE_CHAIN_ID_HEX: "0x2105",
  BASE_RPC_URL: "https://mainnet.base.org",
  EXPLORER_BASE_URL: "https://basescan.org",
  RSC_SWAP_URL: "https://aerodrome.finance/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1&chain0=8453&chain1=8453",
  RSC_BASE_APP_URL: "https://base.app/coin/base-mainnet/0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1",
  BASE_APP_INVITE_URL: "https://base.app/invite/scottexplores/6SR3DKQB",
  X_PROFILE_URL: "https://x.com/SciconShooter",
  SUPPORT_EMAIL: "Sciconshooter@gmail.com",
  GAME_URL: "https://sciconshooter.xyz"
};

/**
 * Public, immutable BIO holding requirement. The access API independently
 * reads this exact ERC-20 balance on Base before reporting the ship unlocked.
 * BIO uses 18 decimals on the configured Base contract.
 */
export const BIO_SHIP_HOLDING_REQUIREMENT = Object.freeze({
  shipId: 'bio',
  tokenAddress: DONATION_CONFIG.BIO_CONTRACT_ADDRESS,
  tokenSymbol: 'BIO',
  decimals: 18,
  minimumAmount: '100',
  minimumAmountRaw: '100000000000000000000'
} as const);

/**
 * Public ship-purchase terms mirrored by the server. Values are strings so no
 * floating-point conversion can alter the exact amount sent to the wallet.
 */
export const PLAYER_SHIP_PURCHASE_SKUS = Object.freeze({
  'eth-ship': Object.freeze({
    id: 'eth-ship',
    label: 'Unlock ETH ship',
    grantsShipId: 'eth',
    paymentKind: 'native',
    tokenAddress: null,
    tokenSymbol: 'ETH',
    decimals: 18,
    amount: '0.001',
    amountRaw: '1000000000000000'
  }),
  'btc-ship': Object.freeze({
    id: 'btc-ship',
    label: 'Unlock BTC ship',
    grantsShipId: 'btc',
    paymentKind: 'erc20',
    tokenAddress: DONATION_CONFIG.CBBTC_CONTRACT_ADDRESS,
    tokenSymbol: 'cbBTC',
    decimals: 8,
    amount: '0.00008',
    amountRaw: '8000'
  })
} as const);

export type PlayerShipPurchaseSkuId = keyof typeof PLAYER_SHIP_PURCHASE_SKUS;

// Paid Token packs use the server-authoritative purchase and Token reserve
// ledger. The API independently verifies every exact RSC transfer on Base.
const RSC_TOKEN_EXCHANGE_ENABLED = true;

/**
 * Public purchase descriptions used by the wallet UI. The server keeps its own
 * authoritative copy of these immutable terms and never trusts values supplied
 * by the browser. `rscAmountRaw` uses ResearchCoin's verified 18 decimals.
 */
export const RSC_PURCHASE_SKUS = Object.freeze({
  'right-support': Object.freeze({
    id: 'right-support',
    label: 'Unlock right support',
    rscAmount: '10',
    rscAmountRaw: '10000000000000000000',
    tokenReward: 0,
    weeklyAttemptReward: 0,
    grantsRightSupport: true,
    enabled: true
  }),
  'weekly-run-attempt': Object.freeze({
    id: 'weekly-run-attempt',
    label: '+1 Weekly Run attempt',
    rscAmount: '3',
    rscAmountRaw: '3000000000000000000',
    tokenReward: 0,
    weeklyAttemptReward: 1,
    grantsRightSupport: false,
    enabled: true
  }),
  'tokens-500': Object.freeze({
    id: 'tokens-500',
    label: '500 Tokens',
    rscAmount: '1',
    rscAmountRaw: '1000000000000000000',
    tokenReward: 500,
    weeklyAttemptReward: 0,
    grantsRightSupport: false,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  }),
  'tokens-2500': Object.freeze({
    id: 'tokens-2500',
    label: '2,500 Tokens',
    rscAmount: '5',
    rscAmountRaw: '5000000000000000000',
    tokenReward: 2500,
    weeklyAttemptReward: 0,
    grantsRightSupport: false,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  }),
  'tokens-5000': Object.freeze({
    id: 'tokens-5000',
    label: '5,000 Tokens',
    rscAmount: '10',
    rscAmountRaw: '10000000000000000000',
    tokenReward: 5000,
    weeklyAttemptReward: 0,
    grantsRightSupport: false,
    enabled: RSC_TOKEN_EXCHANGE_ENABLED
  })
} as const);

export type RscPurchaseSkuId = keyof typeof RSC_PURCHASE_SKUS;

export const STORAGE_KEYS = {
  PLAYER_STATS: "rh_player_stats",
  HIGH_SCORE: "rh_highscore",
  PILOT_PROFILE_ID: "scicon_pilot_profile_id",
  PILOT_PROFILE_MIGRATION: "scicon_pilot_profile_migration_v1",
  WALLET_ADDRESS: "scicon_wallet_address",
  WALLET_PROFILES: "scicon_wallet_profiles",
  DONATED_WALLETS: "scicon_donated_wallets",
  CREDITED_FUNDING_TXS: "scicon_credited_funding_txs",
  POLISH_SETTINGS: "scicon_polish_settings",
  LATEST_RUN_RECEIPT: "scicon_latest_run_receipt",
  WEEKLY_RUN_PENDING_ADMISSION: "scicon_weekly_run_pending_admission_v1",
  WEEKLY_GUEST_PROPOSAL_CAPABILITY: "scicon_weekly_guest_proposal_capability_v1",
  SELECTED_SHIP: "scicon_selected_ship",
  TUTORIAL_SEEN: "scicon_tutorial_seen_v1"
};

export const COLORS = {
  bg: '#0b1020',
  accent: '#6c63ff',
  danger: '#ff4444',
  warning: '#ffbb33',
  success: '#00C851',
  text: '#ffffff',
  uiOverlay: 'rgba(11, 16, 32, 0.85)'
};

export const GAME_CONFIG = {
  FPS: 60,
  BASE_PLAYER_SPEED: 2.9, // Modest cruise speed; acceleration owns the responsive feel
  PLAYER_LIVES: 3,
  // Campaign and field upgrades share one survivability ceiling. The Hangar
  // exposes seven permanent heart purchases on top of the three-heart base.
  MAX_LIVES: 10,
  BASE_SPAWN_RATE: 80, // Faster spawns
  // We now use milestones, but this controls the fill speed of the bar between bosses
  WAVE_DURATION_FRAMES: 3600, 
  POWERUP_DURATION: 720, // 12 seconds @ 60fps
  FOUNDER_SHOT_DURATION: 1440, // 24 seconds @ 60fps
  MAX_SHOT_DURATION: 600, // 10 seconds @ 60fps
  RESEARCH_BEAM_DURATION: 600, // 10 seconds @ 60fps
  SHIELD_DURATION: 240, // Reduced from 300 (4 seconds)
  BOSS_SPAWN_FRAMES: 3000,
};

// Base costs - Lowered significantly
export const UPGRADE_BASE_COSTS = {
  fireRate: 10, 
  speed: 8,    
  missile: 20, // Cost to buy missiles
  repair: 10,
  powerup: 10
};

export const FIELD_UPGRADE_CONFIG: Record<FieldUpgradeType, {
  title: string;
  shortTitle: string;
  description: string;
  baseCost: number;
  costStep: number;
  maxLevel: number;
}> = {
  fireRate: {
    title: 'Rapid Fire',
    shortTitle: 'Rapid',
    description: 'Fire faster and unlock tightly grouped Tier 2 and Tier 3 volleys',
    baseCost: 8,
    costStep: 6,
    maxLevel: FIRE_RATE_MAX_LEVEL
  },
  speed: {
    title: 'Speed',
    shortTitle: 'Speed',
    description: 'Sharper movement',
    baseCost: 7,
    costStep: 5,
    maxLevel: 6
  },
  extraLife: {
    title: 'Extra Life',
    shortTitle: 'Life',
    description: 'Recover one heart',
    baseCost: 12,
    costStep: 8,
    maxLevel: GAME_CONFIG.MAX_LIVES
  }
};

export const getFieldUpgradeLevel = (stats: Stats, type: FieldUpgradeType) => (
  type === 'extraLife' ? stats.repairsCount || 0 : stats.upgrades[type]
);

export const getFieldUpgradeCost = (stats: Stats, type: FieldUpgradeType) => {
  const config = FIELD_UPGRADE_CONFIG[type];
  const level = getFieldUpgradeLevel(stats, type);
  return config.baseCost + (level * config.costStep);
};

export const getFieldUpgradeFlaskCost = (stats: Stats, type: FieldUpgradeType) => {
  const level = getFieldUpgradeLevel(stats, type);
  if (type === 'fireRate' && level >= 21) {
    return Math.min(35, 20 + Math.floor((level - 21) / 7) * 5);
  }
  if (type === 'fireRate' && level >= 14) return 15;
  if (type === 'fireRate' && level >= 6) return 10;
  if (type === 'fireRate' && level >= 5) return 5;
  // Speed and Life are single-track upgrades rather than seven-level weapon
  // tiers. Every purchase is therefore a premium choice instead of a one-
  // flask step that can be stacked immediately.
  if (type === 'speed' || type === 'extraLife') return 5;
  return 1;
};

export const TEXT_STRINGS = {
  TITLE: "Scicon Shooter",
  SUBTITLE: "Space Peer-Reviewer",
  GAME_OVER: "SUBMISSION REJECTED",
  VICTORY: "PUBLISHED!",
};

// Lowered scores significantly to allow new players to enter high scores
export const DEFAULT_LEADERBOARD = [
  { name: "Brian", score: 50, wave: 3 },
  { name: "Patrick", score: 45, wave: 2 },
  { name: "Jeffrey", score: 40, wave: 2 },
  { name: "Kobold", score: 35, wave: 1 },
  { name: "Anton", score: 30, wave: 1 },
  { name: "Naman", score: 25, wave: 1 },
  { name: "Ed", score: 20, wave: 1 },
  { name: "Caleb", score: 15, wave: 1 },
  { name: "Sana", score: 10, wave: 1 },
  { name: "Guest", score: 5, wave: 1 }
];
