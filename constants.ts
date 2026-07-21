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

  // Real RSC Token (Clean Bottle)
  REAL_RSC_ICON: "/game-art/tokens/rsc-bottle.png",
  POWERUP_OVERDRIVE_SPREAD: "/game-art/powerups/overdrive-spread.png",
  POWERUP_OVERDRIVE_SPREAD_FRAMES: [
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-01-rest.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-02-core-rise.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-03-energy-pulse.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-04-peak-glint.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-05-rim-travel.png",
    "/game-art/generated/powerups/scicon-powerup-idle-pack-v1/overdrive-spread/frames/overdrive-spread-06-settle.png"
  ],
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
    "/game-art/enemies/enemy-drone-1.png",
    "/game-art/enemies/enemy-drone-2.png",
    "/game-art/enemies/enemy-drone-3.png",
    "/game-art/enemies/enemy-drone-4.png",
    "/game-art/enemies/enemy-drone-5.png"
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
  MINI_BOSS: "/game-art/bosses/mini-boss-drone.png",
  WALL_BOSS_SEGMENT: "/game-art/bosses/wall-segment.png",
  PAYWALL_BASTION_FRAMES: [
    "/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-01-idle.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-02-neutral.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-03-attack.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-04-damage-50.png",
    "/game-art/generated/scicon-flight-motion-pack-v1/bosses/paywall-bastion/frames/paywall-bastion-05-critical-15.png"
  ],
  FINAL_BOSS: "/game-art/bosses/final-boss-sentinel.png",
  
  // Referral Assets
  REFERRAL_LINK: "https://researchhub.com/referral/join?refr=db8c0146-a571-4a57-b576-78f75066298c"
};

export const DONATION_CONFIG = {
  BUILDER_CODE: "bc_ww78gi4f",
  RECIPIENT_ADDRESS: "0x3A8D692Aabdd4981080a8F6af8375a21359464Bf",
  RSC_CONTRACT_ADDRESS: "0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1",
  USDC_CONTRACT_ADDRESS: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  BASE_CHAIN_ID: 8453,
  BASE_CHAIN_ID_HEX: "0x2105",
  BASE_RPC_URL: "https://mainnet.base.org",
  EXPLORER_BASE_URL: "https://basescan.org",
  RSC_SWAP_URL: "https://aerodrome.finance/swap?from=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913&to=0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1&chain0=8453&chain1=8453",
  BASE_APP_INVITE_URL: "https://base.app/invite/scottexplores/6SR3DKQB",
  X_PROFILE_URL: "https://x.com/ScottExplores29",
  GAME_URL: "https://sciconshooter.xyz"
};

export const STORAGE_KEYS = {
  PLAYER_STATS: "rh_player_stats",
  HIGH_SCORE: "rh_highscore",
  WALLET_ADDRESS: "scicon_wallet_address",
  WALLET_PROFILES: "scicon_wallet_profiles",
  DONATED_WALLETS: "scicon_donated_wallets",
  CREDITED_FUNDING_TXS: "scicon_credited_funding_txs",
  POLISH_SETTINGS: "scicon_polish_settings",
  LATEST_RUN_RECEIPT: "scicon_latest_run_receipt",
  SELECTED_SHIP: "scicon_selected_ship"
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
  BASE_PLAYER_SPEED: 2.5, // Reduced from 3.2 to make start heavier
  PLAYER_LIVES: 3,
  MAX_LIVES: 15,
  BASE_SPAWN_RATE: 80, // Faster spawns
  // We now use milestones, but this controls the fill speed of the bar between bosses
  WAVE_DURATION_FRAMES: 3600, 
  POWERUP_DURATION: 720, // 12 seconds @ 60fps
  FOUNDER_SHOT_DURATION: 1440, // 24 seconds @ 60fps
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
  if (type === 'fireRate' && level >= 14) return 15;
  if (type === 'fireRate' && level >= 6) return 10;
  if (type === 'fireRate' && level >= 5) return 5;
  if (type === 'speed' && level >= 5) return 5;
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
