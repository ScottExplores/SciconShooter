

export enum GameState {
  MENU = 'MENU',
  TUTORIAL = 'TUTORIAL',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAMEOVER = 'GAMEOVER',
  ABOUT = 'ABOUT',
  SHOP = 'SHOP'
}

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY_DRONE = 'ENEMY_DRONE', // Paywall Drone
  ENEMY_JOURNAL = 'ENEMY_JOURNAL', // Predatory Journal
  ENEMY_BRICK = 'ENEMY_BRICK', // Bureaucracy Brick (Newspaper)
  ENEMY_SWARM = 'ENEMY_SWARM', // Misinformation (Flies)
  ENEMY_INVADER = 'ENEMY_INVADER', // Wall Boss Segment
  BOSS = 'BOSS',
  MINI_BOSS = 'MINI_BOSS',
  PROJECTILE = 'PROJECTILE',
  MISSILE = 'MISSILE', // New Weapon
  PARTICLE = 'PARTICLE',
  EFFECT = 'EFFECT', // Visual effects like rings or text
  POWERUP = 'POWERUP',
  COIN = 'COIN'
}

export enum PowerupType {
  DOUBLE_SHOT = 'DOUBLE_SHOT', // Parallel fire
  TRIPLE_SHOT = 'TRIPLE_SHOT', // Angled spread (Brian)
  MAGNET = 'MAGNET', // Coin Magnet (Patrick)
  SHIELD = 'SHIELD', // Invincibility (Jeffrey)
  EXTRA_LIFE = 'EXTRA_LIFE', // Extra Life (Arshia)
  KARMA_LASER = 'KARMA_LASER' // Promotional KRMA beam
}

export interface Position {
  x: number;
  y: number;
}

export interface Upgrades {
  fireRate: number;
  speed: number;
  missile: number; // Replaced maxHp
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  wave?: number; // Optional for backward compatibility with old data
  date?: string; // New field for JSONBin data
  walletAddress?: string;
  donated?: boolean;
  proposalId?: string;
  proposalTitle?: string;
  proposalUrl?: string;
  proposalAuthor?: string;
}

export interface LeaderboardData {
  scores: LeaderboardEntry[];
  monthlyScores: LeaderboardEntry[];
  remoteSaved?: boolean;
}

export interface ArchivedWinner {
  periodKey: string;
  periodLabel: string;
  winnerName: string;
  score: number;
  wave: number;
  scoreDate?: string;
  proposalId?: string;
  proposalTitle?: string;
  proposalUrl?: string;
  proposalAuthor?: string;
  allocationRsc?: number;
}

export interface Stats {
  score: number;
  highScore: number;
  wave: number;
  coins: number;
  profileCredits: number; // Wallet-linked credits purchased outside an active mission
  totalCoins: number; // New: Track total lifetime coins for "Funded" score
  enemiesDefeated: number;
  lives: number;
  repairsCount: number; // Track number of repairs for cost scaling
  upgrades: Upgrades;
  powerupUses: Record<PowerupType, number>;
  bossProgress: number; // 0.0 to 1.0
  isBossActive: boolean;
  bossHp: number;
  bossMaxHp: number;
}

export type WalletConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type DonationStatus = 'idle' | 'switching_network' | 'processing' | 'confirming' | 'success' | 'error';

export interface WalletSession {
  address: string | null;
  chainId: number | null;
  status: WalletConnectionStatus;
  error: string;
  connectorName?: string;
  hasDonated?: boolean;
}

export interface MiniAppState {
  isMiniApp: boolean;
  clientFid: number | null;
  added: boolean;
  userFid: number | null;
  platformType: 'web' | 'mobile' | null;
}
