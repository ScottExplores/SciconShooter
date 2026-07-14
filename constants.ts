import type { FieldUpgradeType, Stats } from './types';

// --- ASSET CONFIGURATION ---
export const ASSETS = {
  PLAYER_SHIP: "/game-art/branding/researchhub-ship.png",
  BIO_SHIP: "/game-art/branding/bio-ship.png",
  ETH_SHIP: "/game-art/branding/eth-ship.png",
  
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

  // Coin Asset - Updated to Gold2 SVG
  RSC_TOKEN: "/game-art/tokens/rsc-coin.svg",

  // Real RSC Token (Clean Bottle)
  REAL_RSC_ICON: "/game-art/tokens/rsc-bottle.png",
  
  MENU_HERO: "/game-art/backgrounds/menu-hero.png",
  GAME_BG_BACK: "/game-art/backgrounds/bg-back.png",
  GAME_BG_STARS: "/game-art/backgrounds/bg-stars.png",
  GAME_BG_PLANET: "/game-art/backgrounds/bg-planet.png",
  GAME_PARALLAX_BACK: "/game-art/backgrounds/parallax-back.png",
  GAME_PARALLAX_STARS: "/game-art/backgrounds/parallax-stars.png",
  GAME_PARALLAX_FAR_PLANETS: "/game-art/backgrounds/parallax-far-planets.png",
  GAME_PARALLAX_BIG_PLANET: "/game-art/backgrounds/parallax-big-planet.png",
  GAME_PARALLAX_RING_PLANET: "/game-art/backgrounds/parallax-ring-planet.png",
  ENEMY_DRONE_FRAMES: [
    "/game-art/enemies/paywall-interceptor.png"
  ],
  LEGACY_ENEMY_DRONE_FRAMES: [
    "/game-art/enemies/enemy-drone-1.png",
    "/game-art/enemies/enemy-drone-2.png",
    "/game-art/enemies/enemy-drone-3.png",
    "/game-art/enemies/enemy-drone-4.png",
    "/game-art/enemies/enemy-drone-5.png"
  ],
  ENEMY_SWARM_FRAMES: [
    "/game-art/enemies/citation-wraith.png"
  ],
  LEGACY_ENEMY_SWARM_FRAMES: [
    "/game-art/enemies/swarm-1.png",
    "/game-art/enemies/swarm-2.png",
    "/game-art/enemies/swarm-3.png",
    "/game-art/enemies/swarm-4.png"
  ],
  ENEMY_BRICK_FRAMES: [
    "/game-art/enemies/peer-review-bulwark.png"
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
    "/game-art/enemies/predatory-journal-raider.png"
  ],
  MINI_BOSS: "/game-art/bosses/mini-boss-drone.png",
  WALL_BOSS_SEGMENT: "/game-art/bosses/wall-segment.png",
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
    description: 'Faster shots that evolve into plasma, ion, Nova, and Singularity fire',
    baseCost: 8,
    costStep: 6,
    maxLevel: 7
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
