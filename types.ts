

export enum GameState {
  MENU = 'MENU',
  TUTORIAL = 'TUTORIAL',
  PLAYING = 'PLAYING',
  WAVE_COMPLETE = 'WAVE_COMPLETE',
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
  SUPPLY_DROP = 'SUPPLY_DROP', // Non-hostile ResearchHub supply package
  ENEMY_INVADER = 'ENEMY_INVADER', // Wall Boss Segment
  BOSS = 'BOSS',
  MINI_BOSS = 'MINI_BOSS',
  PROJECTILE = 'PROJECTILE',
  MISSILE = 'MISSILE', // New Weapon
  PARTICLE = 'PARTICLE',
  EFFECT = 'EFFECT', // Visual effects like rings or text
  POWERUP = 'POWERUP',
  COIN = 'COIN',
  BOMB = 'BOMB'
}

export enum PowerupType {
  DOUBLE_SHOT = 'DOUBLE_SHOT', // Parallel fire
  TRIPLE_SHOT = 'TRIPLE_SHOT', // Angled spread (Brian)
  MAX_SHOT = 'MAX_SHOT', // Doubles the current fire pattern and shields the player
  MAGNET = 'MAGNET', // Coin Magnet (Patrick)
  SHIELD = 'SHIELD', // Invincibility (Jeffrey)
  EXTRA_LIFE = 'EXTRA_LIFE', // Extra Life (Arshia)
  RESEARCH_BEAM = 'RESEARCH_BEAM' // RSC-powered research beam
}

export interface Position {
  x: number;
  y: number;
}

export interface Upgrades {
  fireRate: number;
  speed: number;
  /** Hangar Signature Move level for the active hull. */
  ability: number;
}

export type FieldUpgradeType = 'fireRate' | 'speed' | 'extraLife';

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
  proposalImageUrl?: string;
  runId?: string;
  verified?: boolean;
  receiptHash?: string;
}

export interface LeaderboardData {
  scores: LeaderboardEntry[];
  monthlyScores: LeaderboardEntry[];
  remoteSaved?: boolean;
  remoteError?: string;
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
  proposalImageUrl?: string;
  allocationRsc?: number;
  status?: 'finalized' | 'claimed' | 'funded' | 'expired';
  claimDeadline?: string;
  allocationTxHash?: string;
  championTokenId?: string;
  winnerWallet?: string;
  winnerRunId?: string;
}

export interface MintRecord {
  recordType: 'mission' | 'champion';
  runId: string;
  weekKey?: string;
  walletAddress: string;
  chainId: number;
  tokenId?: string;
  transactionHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  sponsored: boolean;
  createdAt: string;
  confirmedAt?: string;
  score?: number;
  ownershipVerified?: boolean;
}

export interface Stats {
  score: number;
  highScore: number;
  wave: number;
  coins: number;
  totalCoins: number; // Track lifetime arcade pickups for score feedback
  enemiesDefeated: number;
  bombs: number;
  bombCharge: number;
  bombChargeMax: number;
  shipAbilityCooldown: number;
  shipAbilityCooldownMax: number;
  lives: number;
  repairsCount: number; // Track number of repairs for cost scaling
  upgrades: Upgrades;
  powerupUses: Record<PowerupType, number>;
  bossProgress: number; // 0.0 to 1.0
  isBossActive: boolean;
  bossHp: number;
  bossMaxHp: number;
}

export interface GamePolishSettings {
  screenShake: boolean;
  highDensityParticles: boolean;
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
