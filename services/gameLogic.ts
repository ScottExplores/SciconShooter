

import { EntityType, GamePolishSettings, PowerupType, Stats } from '../types';
import { ASSETS, GAME_CONFIG, COLORS } from '../constants';
import type {
  AssetKey,
  AsteroidEvent,
  BossEvent,
  EnemyAttackPatternId,
  EnemyRank,
  GameCampaign,
  LevelDefinition,
  SpriteStyle,
  SpawnEvent,
  WaveDefinition
} from '../game-config/types';
import {
  DEFAULT_GAME_CAMPAIGN,
  cloneGameCampaign,
  getAssetPaths,
  getDifficultyMultiplier,
  getPowerup,
  getPrimaryAssetPath
} from './levelConfig';
import { audioService } from './audioService';
import { BASE_FLASK_CHARGE_MAX, FLASK_CHARGE_PER_COIN, getChargeForStoredFlasks, getFlaskProgress } from './flaskProgress';
import {
  PLAYER_WEAPON_FRAME_URLS,
  getPlayerWeaponFrames,
  getPlayerWeaponLaunchFrameIndex
} from './playerWeaponVisuals';
import {
  RESEARCH_CHARGE_BLAST_RADIUS,
  RESEARCH_CHARGE_COOLDOWN_FRAMES,
  RESEARCH_CHARGE_FRAME_URLS,
  RESEARCH_IMPACT_FRAME_URLS
} from './shipAbilityService';
import {
  emitSquadDomainEvent,
  type RuntimeSquadCompanion,
  type RuntimeSquadLoadout,
  type SquadSlotId
} from './squadProgression';

// --- Helper Classes ---

type EnemyFormationMode = 'row' | 'v' | 'sine' | 'pincer' | 'grid' | 'diamond' | 'spiral' | 'orbit';
type ConfiguredEnemyFormationMode = Exclude<EnemyFormationMode, 'orbit'>;
type EnemyFormationState = 'entry' | 'hold' | 'dive' | 'return';
type PlayerWeaponKind = 'pulse' | 'plasma' | 'ion' | 'nova' | 'singularity' | 'bio-laser' | 'eth-shard' | 'btc-hash';
export type BossRigId = 'open-orbit' | 'citation-storm' | 'paywall-siege' | 'crown-claw';
export type BossPartId = 'left-cannon' | 'right-cannon' | 'helmet';
export type BossComponentState = {
  id: BossPartId;
  label: string;
  hp: number;
  maxHp: number;
  centerXRatio: number;
  centerYRatio: number;
  widthRatio: number;
  heightRatio: number;
  destroyed: boolean;
  flashFrames: number;
  lastDamageFlashFrame: number;
};
export type BossProjectileVisualKind = 'boss-ray' | 'boss-bolt' | 'crown-claw-left' | 'crown-claw-right' | 'research-charge';
type PendingPlayerShot = {
  fireFrame: number;
  speed: number;
  offsetX: number;
  yOffset: number;
  angleBias: number;
  pitchOffset: number;
  weaponKind: PlayerWeaponKind;
  playSound?: boolean;
};

export class Entity {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  markedForDeletion: boolean = false;
  color: string;
  
  // Specific props
  hp: number = 1;
  maxHp: number = 1;
  text?: string; 
  angle: number = 0;
  
  // Lifecycle props
  life: number = 0;
  maxLife: number = 0;

  // Boss Props
  attackTimer: number = 0;
  lastBurstAttackTimer: number = 0;
  isCharging: boolean = false;
  isBeam: boolean = false; 
  beamAxis: 'vertical' | 'horizontal' = 'vertical';
  beamFromCenter: boolean = false;
  isTelegraph: boolean = false;
  beamAnchorOffsetX: number | null = null;
  beamLaneSign: number = 0;
  bossRigId?: BossRigId;
  bossComponents?: BossComponentState[];
  bossDecayStage: number = 0;
  projectileVisualKind?: BossProjectileVisualKind;
  shipAbilityKind?: 'research-charge';
  bossOwnerId?: string;
  bossComponentId?: BossPartId;
  clawOutboundFrames: number = 0;
  clawReturning: boolean = false;
  clawHasHitPlayer: boolean = false;

  // Missile Props
  isMissile: boolean = false;

  // Projectile Ownership
  isPlayerShot: boolean = false;
  variant: number = 0;
  formation?: EnemyFormationMode;
  formationIndex: number = 0;
  formationSeed: number = 0;
  formationGroupSeed: number = 0;
  formationState?: EnemyFormationState;
  formationTargetX?: number;
  formationTargetY?: number;
  formationStartX?: number;
  formationStartY?: number;
  formationStateFrame: number = 0;
  formationEntryFrames: number = 0;
  formationDiveFrame: number = 0;
  formationBaseSpeed: number = 0;
  formationCycle: number = 0;
  encounterGroupSize: number = 1;
  flashFrames: number = 0;
  lastDamageFlashFrame: number = -999;
  shieldHostId?: string;
  damage: number = 1;
  pierceRemaining: number = 0;
  weaponKind: PlayerWeaponKind = 'pulse';
  /** Presentation-only gun level used to select projectile art; never changes the collision box. */
  weaponVisualLevel: number = 0;
  /** Simulation-frame timestamp used only to play the launch art once. */
  weaponVisualStartFrame: number = 0;
  hitTargetIds?: Set<string>;
  spriteUrl?: string;
  spriteFrames?: string[];
  spriteStyle?: SpriteStyle;
  scoreValue?: number;
  scoreReward?: number;
  powerupDropChance?: number;
  contactDamage: number = 1;
  projectileDamage: number = 1;
  projectileSpeed?: number;
  configuredSpeed?: number;
  attackIntervalFrames?: number;
  movementPattern?: string;
  phaseThresholds: number[] = [];
  weaponKinds: string[] = [];
  configuredBurstCount?: number;
  isElite: boolean = false;
  eliteRank?: EnemyRank;
  eliteAttackPattern?: EnemyAttackPatternId;
  completesWave: boolean = false;
  /** Configuration provenance used by the local visual editor. */
  sourceEventId?: string;
  sourceItemId?: string;
  
  constructor(type: EntityType, x: number, y: number) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.color = '#FFF';
    this.width = 30;
    this.height = 30;
  }
}

export class Particle extends Entity {
  constructor(x: number, y: number, color: string, speed: number, size: number = 4, life: number = 40 + Math.random() * 20) {
    super(EntityType.PARTICLE, x, y);
    this.width = size;
    this.height = size;
    this.color = color;
    const angle = Math.random() * Math.PI * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = life;
    this.maxLife = this.life;
  }
}

export class VisualEffect extends Entity {
  effectType: 'text' | 'ring' | 'sprite';
  fontSize: number = 32;
  constructor(x: number, y: number, type: 'text' | 'ring' | 'sprite', content: string = '', color: string = '#FFF', fontSize: number = 32) {
    super(EntityType.EFFECT, x, y);
    this.effectType = type;
    this.text = content;
    this.color = color;
    this.fontSize = fontSize;
    this.life = 60;
    this.maxLife = 60;
    
    if (type === 'text') {
        this.vy = -0.5;
        this.life = 120;
        this.maxLife = 120;
    }
  }
}

class Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkleDir: number;
  drift: number;

  constructor(width: number, height: number) {
    const depth = Math.random();
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.size = 0.6 + (depth * 2.4);
    this.speed = 0.08 + (depth * 1.35);
    this.alpha = 0.2 + (depth * 0.7);
    this.twinkleDir = (Math.random() > 0.5 ? 1 : -1) * (0.003 + (depth * 0.01));
    this.drift = -0.02 - (depth * 0.12);
  }

  update(width: number, height: number) {
    this.y += this.speed;
    this.x += this.drift;

    // Twinkle effect
    this.alpha += this.twinkleDir;
    if (this.alpha > 1) {
       this.alpha = 1;
       this.twinkleDir *= -1;
    } else if (this.alpha < 0.2) {
       this.alpha = 0.2;
       this.twinkleDir *= -1;
    }

    if (this.y > height) {
      this.y = 0;
      this.x = Math.random() * width;
    }
    if (this.x < 0) {
      this.x = width;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = `rgba(226, 244, 255, ${this.alpha})`;
    ctx.fillRect(this.x, this.y, this.size, this.size);
  }
}

class BackgroundEntity {
  x: number;
  y: number;
  size: number;
  color: string;
  speed: number;
  type: 'planet' | 'nebula';

  constructor(width: number, height: number) {
    this.type = Math.random() > 0.3 ? 'planet' : 'nebula';
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    
    if (this.type === 'planet') {
      this.size = 50 + Math.random() * 100;
      this.speed = 0.2 + Math.random() * 0.3; 
      const hues = [240, 260, 280, 200];
      const hue = hues[Math.floor(Math.random() * hues.length)];
      this.color = `hsl(${hue}, 40%, 20%)`; 
    } else {
      this.size = 200 + Math.random() * 300;
      this.speed = 0.1;
      this.color = `rgba(${Math.floor(Math.random()*50)}, ${Math.floor(Math.random()*20)}, ${Math.floor(Math.random()*80) + 50}, 0.1)`;
    }
  }

  update(height: number) {
    this.y += this.speed;
    if (this.y > height + this.size) {
      this.y = -this.size * 2;
      this.x = Math.random() * 1000;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = 0.2; 

    if (this.type === 'planet') {
      const gradient = ctx.createRadialGradient(this.x, this.y, this.size * 0.2, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(this.x - this.size*0.3, this.y - this.size*0.3, this.size, 0, Math.PI * 2);
      ctx.fill();

    } else {
      const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
      gradient.addColorStop(0, this.color);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(this.x - this.size, this.y - this.size, this.size*2, this.size*2);
    }
    ctx.restore();
  }
}

const imageCache: Record<string, HTMLImageElement> = {};
const DEFAULT_BOMB_SPRITE_URL = getPrimaryAssetPath(DEFAULT_GAME_CAMPAIGN.hudAssets.bombIconAssetKey);
const loadImage = (url: string) => {
  if (imageCache[url]) return imageCache[url];
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  imageCache[url] = img;
  return img;
};

const getReadyImage = (url: string) => {
  const img = imageCache[url];
  if (!img || !img.complete || img.naturalWidth <= 0) {
    return null;
  }
  return img;
};

const GAMEPLAY_ASSET_URLS = [
  ASSETS.PLAYER_SHIP,
  ASSETS.BIO_SHIP,
  ASSETS.ETH_SHIP,
  ASSETS.BTC_SHIP,
  ASSETS.RSC_TOKEN,
  ...ASSETS.RSC_TOKEN_FLIP_FRAMES,
  ...PLAYER_WEAPON_FRAME_URLS,
  ...RESEARCH_CHARGE_FRAME_URLS,
  ...RESEARCH_IMPACT_FRAME_URLS,
  ...ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES,
  ...ASSETS.POWERUP_MAGNET_FRAMES,
  ...ASSETS.POWERUP_SHIELD_FRAMES,
  ...ASSETS.POWERUP_RESEARCH_BEAM_FRAMES,
  ASSETS.REAL_RSC_ICON,
  ASSETS.GAME_BG_BACK,
  ASSETS.GAME_BG_STARS,
  ASSETS.GAME_BG_PLANET,
  ASSETS.GAME_PARALLAX_BACK,
  ASSETS.GAME_PARALLAX_STARS,
  ASSETS.GAME_PARALLAX_FAR_PLANETS,
  ASSETS.GAME_PARALLAX_BIG_PLANET,
  ASSETS.GAME_PARALLAX_RING_PLANET,
  ASSETS.ENEMY_JOURNAL,
  ASSETS.MINI_BOSS,
  ASSETS.WALL_BOSS_SEGMENT,
  ...ASSETS.PAYWALL_BASTION_FRAMES,
  ASSETS.FINAL_BOSS,
  DEFAULT_BOMB_SPRITE_URL,
  ...ASSETS.ENEMY_DRONE_FRAMES,
  ...ASSETS.ENEMY_SWARM_FRAMES,
  ...ASSETS.ENEMY_BRICK_FRAMES,
  ...ASSETS.ASTEROID_BELT_FRAMES,
  ...ASSETS.ENEMY_JOURNAL_FRAMES
];

export const preloadGameplayAssets = async () => {
  await Promise.all(GAMEPLAY_ASSET_URLS.map(async (url) => {
    const image = loadImage(url);
    if (image.complete && image.naturalWidth > 0) return;

    if (typeof image.decode === 'function') {
      try {
        await image.decode();
        return;
      } catch {
        // Fall through to the load event for browsers with partial decode support.
      }
    }

    if (image.complete) return;

    await new Promise<void>((resolve) => {
      const finish = () => resolve();
      image.addEventListener('load', finish, { once: true });
      image.addEventListener('error', finish, { once: true });
    });
  }));
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const moveToward = (current: number, target: number, maxDelta: number) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

const lerp = (current: number, target: number, amount: number) => current + ((target - current) * amount);

const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
export const PLAYER_PRIMARY_SHOT_SPREAD_DEGREES = 5;
const PLAYER_PRIMARY_SHOT_SPREAD_RADIANS = PLAYER_PRIMARY_SHOT_SPREAD_DEGREES * (Math.PI / 180);
const getRandomPrimaryShotAngle = () => (
  (Math.floor(Math.random() * 3) - 1) * PLAYER_PRIMARY_SHOT_SPREAD_RADIANS
);

const easeOutCubic = (value: number) => 1 - Math.pow(1 - clamp(value, 0, 1), 3);

const easeInOutCubic = (value: number) => {
  const t = clamp(value, 0, 1);
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const GAME_FEEL = {
  acceleration: 0.38,
  friction: 0.3,
  touchAcceleration: 0.46,
  touchResponse: 0.12,
  tiltEase: 0.18,
  tiltPerSpeed: 0.045,
  maxTilt: 0.36,
  afterimageSpeed: 2.8,
  comboWindowFrames: 90,
  shakeDecay: 0.34,
  flashDecay: 0.045,
  squashSpring: 0.2,
  squashDamping: 0.72
};

const MAX_BOMBS = 5;
const BASE_COIN_MAGNET_RADIUS = 100;
const POWERUP_COIN_MAGNET_RADIUS = 420;
const BOMB_DROP_CHANCE = 0.012;
const ELITE_BOMB_DROP_CHANCE = 0.05;
const MINI_BOSS_BOMB_REWARD_CHANCE = 0.28;
const BOMB_DAMAGE_BOSS = 14;
const BOMB_DAMAGE_MINI_BOSS = 18;
const BOMB_DAMAGE_INVADER = 3;
const WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1.45;
const WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0.35;
const WAVE_TWO_GATEKEEPER_START_INTERVAL_MULTIPLIER = 1.55;
const WAVE_TWO_GATEKEEPER_MAX_SPEED_HEALTH_RATIO = 0.3;
type GatekeeperCadenceConfig = {
  startIntervalMultiplier: number;
  maxSpeedHealthRatio: number;
};
const GATEKEEPER_CADENCE_BY_WAVE: Partial<Record<number, GatekeeperCadenceConfig>> = {
  1: {
    startIntervalMultiplier: WAVE_ONE_GATEKEEPER_START_INTERVAL_MULTIPLIER,
    maxSpeedHealthRatio: WAVE_ONE_GATEKEEPER_MAX_SPEED_HEALTH_RATIO
  },
  2: {
    startIntervalMultiplier: WAVE_TWO_GATEKEEPER_START_INTERVAL_MULTIPLIER,
    maxSpeedHealthRatio: WAVE_TWO_GATEKEEPER_MAX_SPEED_HEALTH_RATIO
  }
};
const PLAYER_THRUSTER_PALETTES = [
  { core: 'rgba(255,255,255,0.95)', mid: 'rgba(103,232,249,0.9)', edge: 'rgba(37,99,235,0.62)', fade: 'rgba(34,211,238,0)', glow: '#22d3ee', streak: 'rgba(103,232,249,0.34)' },
  { core: 'rgba(255,255,255,0.98)', mid: 'rgba(167,139,250,0.98)', edge: 'rgba(109,40,217,0.84)', fade: 'rgba(124,58,237,0)', glow: '#a78bfa', streak: 'rgba(196,181,253,0.5)' },
  { core: 'rgba(255,255,255,0.98)', mid: 'rgba(232,121,249,0.98)', edge: 'rgba(147,51,234,0.84)', fade: 'rgba(217,70,239,0)', glow: '#e879f9', streak: 'rgba(240,171,252,0.52)' },
  { core: 'rgba(255,255,255,0.99)', mid: 'rgba(244,114,182,0.98)', edge: 'rgba(190,24,93,0.84)', fade: 'rgba(236,72,153,0)', glow: '#f472b6', streak: 'rgba(251,207,232,0.54)' },
  { core: 'rgba(255,255,255,0.99)', mid: 'rgba(251,146,60,0.98)', edge: 'rgba(194,65,12,0.84)', fade: 'rgba(249,115,22,0)', glow: '#fb923c', streak: 'rgba(254,215,170,0.54)' },
  { core: 'rgba(255,255,255,1)', mid: 'rgba(250,204,21,0.97)', edge: 'rgba(249,115,22,0.78)', fade: 'rgba(234,179,8,0)', glow: '#facc15', streak: 'rgba(254,240,138,0.52)' },
  { core: 'rgba(255,255,255,1)', mid: 'rgba(254,240,138,0.99)', edge: 'rgba(251,146,60,0.86)', fade: 'rgba(250,204,21,0)', glow: '#fef08a', streak: 'rgba(255,255,255,0.58)' }
] as const;
const MOBILE_DETAIL_BREAKPOINT = 560;
const MOBILE_PARTICLE_CAP = 120;
const DESKTOP_PARTICLE_CAP = 240;
const MOBILE_EFFECT_CAP = 24;
const DESKTOP_EFFECT_CAP = 44;
const MOBILE_THREAT_CAP = 34;
const DESKTOP_THREAT_CAP = 46;
const MOBILE_PLAYER_SHOT_CAP = 28;
const MOBILE_LEAN_PLAYER_SHOT_CAP = 20;
const DESKTOP_PLAYER_SHOT_CAP = 28;
const PENDING_PLAYER_SHOT_CAP = 8;
const COLLISION_COLUMN_WIDTH = 96;
const EMPTY_GUN_POD_OFFSETS: number[] = [];
const BOSS_RIG_BY_EVENT_ID: Readonly<Record<string, BossRigId>> = Object.freeze({
  'open-orbit-gatekeeper': 'open-orbit',
  'citation-storm-gatekeeper': 'citation-storm',
  'paywall-siege-gatekeeper': 'paywall-siege',
  'open-galaxy-gatekeeper': 'crown-claw',
  'bastion-protocol-gatekeeper': 'citation-storm'
});
const BOSS_COMPONENT_DURABILITY: Readonly<Record<BossRigId, Readonly<Partial<Record<BossPartId, number>>>>> = Object.freeze({
  'open-orbit': Object.freeze({ 'left-cannon': 5, 'right-cannon': 5 }),
  'citation-storm': Object.freeze({ 'left-cannon': 6, 'right-cannon': 6 }),
  'paywall-siege': Object.freeze({ 'left-cannon': 7, 'right-cannon': 7, helmet: 7 }),
  'crown-claw': Object.freeze({ 'left-cannon': 8, 'right-cannon': 8 })
});
const BOSS_CANNON_HEALTH_RATIO = 0.15;
const BOSS_HELMET_HEALTH_RATIO = 0.18;
export const BOSS_CANNON_SCALE = 1.6;
export const CROWNCLAW_ARM_SCALE = 1.42;
export const BOSS_CANNON_HITBOX_SCALE = 1.12;
export const CROWNCLAW_ARM_HITBOX_SCALE = 1.12;
const BOSS_COMPONENT_WEAK_POINT_MULTIPLIER = 1;
const BOSS_DAMAGE_FLASH_FRAMES = 2;
const BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES = 5;
const ENDLESS_CYCLE_DIFFICULTY_STEP = 0.12;
const ENDLESS_CYCLE_DIFFICULTY_CAP = 0.84;
type PendingBossStrike = {
  bossId: string;
  x: number;
  y: number;
  frames: number;
  warningFrames: number;
};
const CROWNCLAW_STRIKE_MAX_LIFE = 132;
const PAYWALL_BOSS_COMPONENT_LAYOUT: ReadonlyArray<Omit<BossComponentState, 'hp' | 'maxHp' | 'destroyed' | 'flashFrames' | 'lastDamageFlashFrame'>> = Object.freeze([
  {
    id: 'left-cannon',
    label: 'LEFT CANNON',
    centerXRatio: 0.22,
    centerYRatio: 0.47,
    widthRatio: 0.24,
    heightRatio: 0.34
  },
  {
    id: 'right-cannon',
    label: 'RIGHT CANNON',
    centerXRatio: 0.78,
    centerYRatio: 0.47,
    widthRatio: 0.24,
    heightRatio: 0.34
  },
  {
    id: 'helmet',
    label: 'CORE HELMET',
    centerXRatio: 0.5,
    centerYRatio: 0.32,
    widthRatio: 0.3,
    heightRatio: 0.3
  }
]);
const DEFAULT_POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};

const getGatekeeperBurstInterval = (
  baseInterval: number,
  healthRatio: number,
  cadence: GatekeeperCadenceConfig
) => {
  const normalizedHealth = clamp(healthRatio, 0, 1);
  const slowCadenceRatio = clamp(
    (normalizedHealth - cadence.maxSpeedHealthRatio)
      / (1 - cadence.maxSpeedHealthRatio),
    0,
    1
  );
  const intervalMultiplier = 1
    + ((cadence.startIntervalMultiplier - 1) * slowCadenceRatio);

  return Math.max(baseInterval, Math.round(baseInterval * intervalMultiplier));
};

type CollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PlayerAfterimage = {
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
  rotation: number;
  squash: number;
};

type BossWarningType = 'mini1' | 'wall' | 'asteroid' | 'gatekeeper';

type RuntimeSpawnEnemy = {
  enemyId: string;
  spriteKey?: string;
  spriteStyle?: SpriteStyle;
  weight: number;
  health: number;
  speed: number;
  damage: number;
  scoreValue: number;
  powerupDropChance: number;
  rank?: EnemyRank;
  sizeMultiplier?: number;
  attackPatternId?: EnemyAttackPatternId;
  attackIntervalSeconds?: number;
  projectileSpeed?: number;
  burstCount?: number;
};

type RuntimeSpawnEvent = SpawnEvent & {
  id: string;
  startSeconds: number;
  durationSeconds?: number;
  count: number;
  spawnIntervalSeconds: number;
  patternId?: string;
  positionId?: string;
  enemies: RuntimeSpawnEnemy[];
};

type RuntimeBossWeapon = {
  id?: string;
  weaponId?: string;
  attackIntervalSeconds?: number;
  attackFrequencySeconds?: number;
  frequencySeconds?: number;
  damage?: number;
  projectileSpeed?: number;
  burstCount?: number;
};

type RuntimeBossPhase = {
  healthThreshold?: number;
  threshold?: number;
};

type RuntimeBossEvent = BossEvent & {
  id: string;
  startSeconds: number;
  bossId: string;
  spriteKey?: string;
  speed?: number;
  health: number;
  movementPattern?: string;
  contactDamage?: number;
  scoreReward?: number;
  warningSeconds?: number;
  weapons?: RuntimeBossWeapon[];
  phases?: RuntimeBossPhase[];
};

type RuntimeAsteroidEvent = AsteroidEvent & {
  id: string;
  startSeconds: number;
  count?: number;
  spriteKey?: string;
  speed?: number;
  health?: number;
  contactDamage?: number;
  damage?: number;
  scoreValue?: number;
  powerupDropChance?: number;
  warningSeconds?: number;
};

type RuntimeEncounterEvent = RuntimeBossEvent | RuntimeAsteroidEvent;

type CampaignWaveEntry = {
  level: LevelDefinition;
  wave: WaveDefinition;
  levelIndex: number;
  waveIndex: number;
};

type EnemyRuntimeOverrides = {
  speed?: number;
  health?: number;
  contactDamage?: number;
  projectileDamage?: number;
  scoreValue?: number;
  powerupDropChance?: number;
  spriteUrl?: string;
  spriteFrames?: string[];
  spriteStyle?: SpriteStyle;
  rank?: EnemyRank;
  sizeMultiplier?: number;
  attackPatternId?: EnemyAttackPatternId;
  attackIntervalSeconds?: number;
  projectileSpeed?: number;
  burstCount?: number;
};

export interface GameEngineOptions {
  campaign?: GameCampaign;
  previewMode?: boolean;
  audioEnabled?: boolean;
  playerShipUrl?: string;
  initialLevelId?: string;
  initialWaveId?: string;
  testMode?: boolean;
  squadLoadout?: RuntimeSquadLoadout;
}

export interface SquadCompanionVisual {
  slot: SquadSlotId;
  id: string;
  frames: [string, string, string];
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

type ActiveSquadCompanion = RuntimeSquadCompanion & {
  x: number;
  y: number;
  frameIndex: number;
  fireTimer: number;
  entryProgress: number;
};

export interface GameRuntimeState {
  levelId: string;
  levelName: string;
  waveId: string;
  waveName: string;
  elapsedSeconds: number;
  durationSeconds: number;
  progress: number;
  bossActive: boolean;
  complete: boolean;
}

export interface WaveVictorySummary {
  id: string;
  wave: number;
  waveName: string;
  sectorName: string;
  scoreEarned: number;
  totalScore: number;
  enemiesDefeated: number;
  coinsCollected: number;
  elapsedSeconds: number;
  nextWave: number;
}

export interface GameEditorEntitySnapshot {
  readonly id: string;
  readonly sourceEventId: string;
  readonly sourceItemId: string | null;
  readonly type: EntityType;
  /** Normalized canvas bounds. Values may extend slightly outside 0..1 while entering. */
  readonly bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

export interface GameEditorSnapshot {
  readonly viewport: Readonly<{
    width: number;
    height: number;
  }>;
  readonly entities: ReadonlyArray<Readonly<GameEditorEntitySnapshot>>;
}

export interface GameEngineDebugSnapshot {
  readonly runtime: Readonly<GameRuntimeState>;
  readonly difficultyMultiplier: number;
  readonly waveProgressFrames: number;
  readonly configuredSpawnCounts: Readonly<Record<string, number>>;
  readonly entities: ReadonlyArray<Readonly<{
    id: string;
    type: EntityType;
    hp: number;
    maxHp: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    formation: EnemyFormationMode | null;
    formationState: EnemyFormationState | null;
    formationIndex: number;
    formationGroupSize: number;
    damage: number;
    contactDamage: number;
    projectileDamage: number;
    projectileSpeed: number | null;
    scoreValue: number | null;
    powerupDropChance: number | null;
    attackIntervalFrames: number | null;
    spriteUrl: string | null;
    spriteStyle: Readonly<SpriteStyle> | null;
  }>>;
}

const WAVE_SECTORS = [
  { name: 'OPEN ORBIT', accent: '#67e8f9' },
  { name: 'CITATION STORM', accent: '#c4b5fd' },
  { name: 'PAYWALL SIEGE', accent: '#fde68a' },
  { name: 'OPEN GALAXY', accent: '#6ee7b7' },
  { name: 'BASTION PROTOCOL', accent: '#f9a8d4' }
];

const PLAYER_SHIP_SCALE = 0.95;
const PAYWALL_INTERCEPTOR_SCALE = 1.1;
const SPIRAL_PAYWALL_INTERCEPTOR_SCALE = 1.05;
const CITATION_WRAITH_SCALE = 1.32;
const BOSS_SHIELD_ESCORT_MOBILE_SIZE = Object.freeze({ width: 48, height: 42 });
const BOSS_SHIELD_ESCORT_DESKTOP_SIZE = Object.freeze({ width: 54, height: 48 });
const getBossShieldEscortHp = (wave: number) => Math.min(8, Math.max(2, Math.round(wave)));
const MAIN_BOSS_ALERT_FRAMES = 120;
const PLAYER_RAM_COOLDOWN_FRAMES = 14;

export class GameEngine {
  width: number = 0;
  height: number = 0;
  player: Entity;
  entities: Entity[] = [];
  bgEntities: BackgroundEntity[] = [];
  stars: Star[] = [];
  stats: Stats;
  keys: Record<string, boolean> = {};
  touchPos: { x: number, y: number } | null = null;
  wave: number = 1;
  frameCount: number = 0;
  bgY: number = 0;
  gameActive: boolean = false;
  lives: number = GAME_CONFIG.PLAYER_LIVES;
  invincibleTimer: number = 0;
  activePowerups: Map<PowerupType, number> = new Map();
  bossRef: Entity | null = null;
  miniBossRef: Entity | null = null;
  spawnedMiniBoss1: boolean = false;
  spawnedWallBoss: boolean = false;
  mainBossDefeated: boolean = false;
  asteroidBeltMaxCount: number = 0;
  invaderDirection: number = 1;
  invaderMoveTimer: number = 0;
  waveProgressFrames: number = 0;
  inBossWarningSequence: boolean = false;
  bossWarningFrame: number = 0;
  bossWarningDuration: number = 0;
  pendingBossType: BossWarningType | null = null;
  waveTransitionPending: boolean = false;
  missileTimer: number = 0;
  playerVel = { x: 0, y: 0 };
  playerTilt: number = 0;
  playerSquash: number = 0;
  playerSquashVelocity: number = 0;
  playerAfterimages: PlayerAfterimage[] = [];
  shakeStrength: number = 0;
  shakeX: number = 0;
  shakeY: number = 0;
  flashAlpha: number = 0;
  hitStopFrames: number = 0;
  coinCombo: number = 0;
  coinComboTimer: number = 0;
  lastShotFrame: number = -999;
  bioBeamCanvasVisualStartFrame: number = -1;
  lastBombFrame: number = -999;
  lastPlayerRamFrame: number = -999;
  introFlightFrames: number = 0;
  introFlightDuration: number = 150;
  waveDepartureFrames: number = 0;
  waveDepartureDuration: number = 168;
  waveVictoryReady: boolean = false;
  waveVictorySummary: WaveVictorySummary | null = null;
  waveStartScore: number = 0;
  waveStartEnemiesDefeated: number = 0;
  waveStartTotalCoins: number = 0;
  waveFlightFrames: number = 0;
  deathSequenceFrames: number = 0;
  deathSequenceDuration: number = 88;
  deathSequenceStartedAtMs: number = 0;
  deathSequenceMaxDurationMs: number = 2200;
  playerDrawScale: number = 1;
  playerDrawAlpha: number = 1;
  sectorTint: number = 0;
  isBombResolving: boolean = false;
  collisionBoxes: Map<Entity, CollisionBox> = new Map();
  enemyTargetsBuffer: Entity[] = [];
  playerShotsBuffer: Entity[] = [];
  homingTargetsBuffer: Entity[] = [];
  enemyCollisionColumns: Entity[][] = [];
  invaderDrawBuffer: Entity[] = [];
  pendingPlayerShots: PendingPlayerShot[] = [];
  livePlayerShotCount: number = 0;
  liveParticleCount: number = 0;
  liveEffectCount: number = 0;
  liveThreatCount: number = 0;
  weaponVolley: number = 0;
  announcedFireRateLevel: number = 0;
  mobileProfile: boolean = false;
  polishSettings: GamePolishSettings = { ...DEFAULT_POLISH_SETTINGS };
  performanceMode: boolean = false;
  heavySceneLoad: boolean = false;
  campaign: GameCampaign;
  bombSpriteUrl: string = DEFAULT_BOMB_SPRITE_URL;
  playerShipUrl: string = ASSETS.PLAYER_SHIP;
  campaignWaves: CampaignWaveEntry[] = [];
  currentCampaignIndex: number = 0;
  previewMode: boolean = false;
  audioEnabled: boolean = true;
  previewComplete: boolean = false;
  configuredEncounterIds: Set<string> = new Set();
  configuredSpawnCounts: Map<string, number> = new Map();
  configuredSpawnFrames: Map<string, number> = new Map();
  escalationWarningsShown: Set<string> = new Set();
  pendingBossStrikes: PendingBossStrike[] = [];
  pendingConfiguredEncounter: RuntimeEncounterEvent | null = null;
  initialLevelId?: string;
  initialWaveId?: string;
  testMode: boolean = false;
  private readonly squadLoadout: RuntimeSquadLoadout | null;
  private readonly squadCompanions: ActiveSquadCompanion[];
  private readonly startingLives: number;
  
  constructor(stats: Stats, options: GameEngineOptions = {}) {
    this.stats = stats;
    this.stats.shipAbilityCooldown = Math.max(0, Number(this.stats.shipAbilityCooldown) || 0);
    this.stats.shipAbilityCooldownMax = RESEARCH_CHARGE_COOLDOWN_FRAMES;
    this.campaign = cloneGameCampaign(options.campaign ?? DEFAULT_GAME_CAMPAIGN);
    this.bombSpriteUrl = getPrimaryAssetPath(this.campaign.hudAssets.bombIconAssetKey);
    this.playerShipUrl = options.playerShipUrl || ASSETS.PLAYER_SHIP;
    loadImage(this.bombSpriteUrl);
    loadImage(this.playerShipUrl);
    this.campaignWaves = this.buildCampaignWaveEntries(this.campaign);
    this.previewMode = options.previewMode ?? false;
    this.audioEnabled = options.audioEnabled ?? !this.previewMode;
    this.initialLevelId = options.initialLevelId;
    this.initialWaveId = options.initialWaveId;
    this.testMode = Boolean(options.testMode);
    this.squadLoadout = options.squadLoadout ?? null;
    this.squadCompanions = (options.squadLoadout?.companions ?? []).map((companion, index) => ({
      ...companion,
      x: 0,
      y: 0,
      frameIndex: 0,
      fireTimer: Math.max(8, Math.floor(companion.fireIntervalFrames * (0.42 + index * 0.18))),
      entryProgress: 0
    }));
    this.startingLives = clamp(
      Math.floor(Number(stats.lives) || GAME_CONFIG.PLAYER_LIVES),
      1,
      GAME_CONFIG.MAX_LIVES
    );
    const initialIndex = this.findCampaignWaveIndex(options.initialLevelId, options.initialWaveId);
    this.currentCampaignIndex = initialIndex >= 0 ? initialIndex : 0;
    this.player = new Entity(EntityType.PLAYER, 0, 0);
    this.player.width = Math.round(128 * PLAYER_SHIP_SCALE);
    this.player.height = Math.round(128 * PLAYER_SHIP_SCALE);
    
    GAMEPLAY_ASSET_URLS.forEach(loadImage);
  }

  buildCampaignWaveEntries(campaign: GameCampaign): CampaignWaveEntry[] {
    const entries: CampaignWaveEntry[] = [];
    const levels = Array.isArray(campaign.levels)
      ? campaign.levels.map((level, sourceIndex) => ({ level, sourceIndex })).sort((a, b) => a.level.order - b.level.order)
      : [];
    levels.forEach(({ level, sourceIndex: levelIndex }) => {
      const waves = Array.isArray(level.waves)
        ? level.waves.map((wave, sourceIndex) => ({ wave, sourceIndex })).sort((a, b) => a.wave.order - b.wave.order)
        : [];
      waves.forEach(({ wave, sourceIndex: waveIndex }) => entries.push({ level, wave, levelIndex, waveIndex }));
    });
    return entries;
  }

  findCampaignWaveIndex(levelId?: string, waveId?: string) {
    if (!levelId && !waveId) return -1;
    return this.campaignWaves.findIndex((entry) => (
      (!levelId || entry.level.id === levelId)
      && (!waveId || entry.wave.id === waveId)
    ));
  }

  getCurrentCampaignEntry() {
    if (this.campaignWaves.length === 0) return null;
    const index = ((this.currentCampaignIndex % this.campaignWaves.length) + this.campaignWaves.length) % this.campaignWaves.length;
    return this.campaignWaves[index] ?? null;
  }

  getCurrentLevelDefinition() {
    return this.getCurrentCampaignEntry()?.level ?? null;
  }

  getCurrentWaveDefinition() {
    return this.getCurrentCampaignEntry()?.wave ?? null;
  }

  getCampaignCycle() {
    if (this.campaignWaves.length === 0) return 0;
    return Math.floor(Math.max(0, this.currentCampaignIndex) / this.campaignWaves.length);
  }

  getCurrentDifficultyMultiplier() {
    const entry = this.getCurrentCampaignEntry();
    const authoredDifficulty = entry ? getDifficultyMultiplier(entry.level, entry.wave) : 1;
    const cycleDifficulty = 1 + Math.min(
      ENDLESS_CYCLE_DIFFICULTY_CAP,
      this.getCampaignCycle() * ENDLESS_CYCLE_DIFFICULTY_STEP
    );
    return authoredDifficulty * cycleDifficulty;
  }

  getConfiguredWaveDurationSeconds() {
    const configured = Number(this.getCurrentWaveDefinition()?.durationSeconds);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : GAME_CONFIG.WAVE_DURATION_FRAMES / GAME_CONFIG.FPS;
  }

  getConfiguredWaveDurationFrames() {
    return Math.max(1, Math.round(this.getConfiguredWaveDurationSeconds() * GAME_CONFIG.FPS));
  }

  getWaveElapsedSeconds() {
    return this.waveProgressFrames / GAME_CONFIG.FPS;
  }

  getConfiguredSpawnEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events)) return [];
    return events.filter((event): event is SpawnEvent => event.kind === 'spawn') as RuntimeSpawnEvent[];
  }

  getConfiguredEncounterEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events)) return [];
    return events
      .filter((event): event is BossEvent | AsteroidEvent => event.kind === 'boss' || event.kind === 'asteroid-belt')
      .slice()
      .sort((a, b) => Number(a.startSeconds) - Number(b.startSeconds)) as RuntimeEncounterEvent[];
  }

  playSound(...args: Parameters<typeof audioService.playSound>) {
    if (!this.audioEnabled) return;
    audioService.playSound(...args);
  }

  getRuntimeState(): GameRuntimeState {
    const entry = this.getCurrentCampaignEntry();
    const durationSeconds = this.getConfiguredWaveDurationSeconds();
    return {
      levelId: entry?.level.id ?? `level-${Math.max(1, this.wave)}`,
      levelName: entry?.level.name ?? this.getWaveSector().name,
      waveId: entry?.wave.id ?? `wave-${Math.max(1, this.wave)}`,
      waveName: entry?.wave.name ?? `Wave ${Math.max(1, this.wave)}`,
      elapsedSeconds: Math.min(durationSeconds, this.getWaveElapsedSeconds()),
      durationSeconds,
      progress: Math.min(1, Math.max(0, this.stats.bossProgress || 0)),
      bossActive: Boolean(this.stats.isBossActive),
      complete: this.previewComplete
    };
  }

  getDebugSnapshot(): Readonly<GameEngineDebugSnapshot> {
    const runtime = Object.freeze({ ...this.getRuntimeState() });
    const configuredSpawnCounts = Object.freeze(Object.fromEntries(this.configuredSpawnCounts));
    const entities = Object.freeze(this.entities
      .filter((entity) => !entity.markedForDeletion)
      .map((entity) => Object.freeze({
        id: entity.id,
        type: entity.type,
        hp: entity.hp,
        maxHp: entity.maxHp,
        x: entity.x,
        y: entity.y,
        vx: entity.vx,
        vy: entity.vy,
        formation: entity.formation ?? null,
        formationState: entity.formationState ?? null,
        formationIndex: entity.formationIndex,
        formationGroupSize: entity.encounterGroupSize,
        damage: entity.damage,
        contactDamage: entity.contactDamage,
        projectileDamage: entity.projectileDamage,
        projectileSpeed: Number.isFinite(entity.projectileSpeed) ? entity.projectileSpeed as number : null,
        scoreValue: Number.isFinite(entity.scoreValue) ? entity.scoreValue as number : null,
        powerupDropChance: Number.isFinite(entity.powerupDropChance) ? entity.powerupDropChance as number : null,
        attackIntervalFrames: Number.isFinite(entity.attackIntervalFrames) ? entity.attackIntervalFrames as number : null,
        spriteUrl: entity.spriteUrl ?? null,
        spriteStyle: entity.spriteStyle ? Object.freeze({ ...entity.spriteStyle }) : null
      })));
    return Object.freeze({
      runtime,
      difficultyMultiplier: this.getCurrentDifficultyMultiplier(),
      waveProgressFrames: this.waveProgressFrames,
      configuredSpawnCounts,
      entities
    });
  }

  getEditorSnapshot(): Readonly<GameEditorSnapshot> {
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
    const viewport = Object.freeze({ width, height });
    const entities = Object.freeze(this.entities
      .filter((entity) => (
        !entity.markedForDeletion
        && Boolean(entity.sourceEventId)
        && entity.x + entity.width >= 0
        && entity.x <= width
        && entity.y + entity.height >= 0
        && entity.y <= height
      ))
      .map((entity) => Object.freeze({
        id: entity.id,
        sourceEventId: entity.sourceEventId as string,
        sourceItemId: entity.sourceItemId ?? null,
        type: entity.type,
        bounds: Object.freeze({
          x: entity.x / width,
          y: entity.y / height,
          width: entity.width / width,
          height: entity.height / height
        })
      })));

    return Object.freeze({ viewport, entities });
  }

  loadPreviewWave(levelId: string, waveId: string) {
    const index = this.findCampaignWaveIndex(levelId, waveId);
    if (index < 0) return false;
    this.currentCampaignIndex = index;
    this.wave = index + 1;
    this.stats.wave = this.wave;
    this.restartPreview();
    return true;
  }

  setTestMode(enabled: boolean) {
    this.testMode = Boolean(enabled);
    if (this.testMode && this.lives <= 0) {
      this.lives = Math.max(1, GAME_CONFIG.PLAYER_LIVES);
      this.stats.lives = this.lives;
      this.deathSequenceFrames = 0;
      this.deathSequenceStartedAtMs = 0;
      this.gameActive = true;
      this.playerDrawAlpha = 1;
      this.playerDrawScale = 1;
      this.setPlayerHomePosition();
    }
  }

  jumpToCampaignWave(waveNumber: number) {
    if (this.campaignWaves.length === 0) return false;

    const targetIndex = Math.max(0, Math.floor(waveNumber) - 1);
    this.currentCampaignIndex = targetIndex;
    this.wave = targetIndex + 1;
    this.stats.wave = this.wave;
    this.entities = [];
    this.pendingPlayerShots = [];
    this.pendingBossStrikes = [];
    this.activePowerups.clear();
    this.gameActive = true;
    this.previewComplete = false;
    this.resetWaveProgress();
    this.introFlightFrames = 0;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.invincibleTimer = 180;
    this.playerDrawScale = 1;
    this.playerDrawAlpha = 1;
    this.playerTilt = 0;
    this.playerVel = { x: 0, y: 0 };
    this.setPlayerHomePosition();
    this.refreshLoadState();

    const sector = this.getWaveSector();
    const wave = this.getCurrentWaveDefinition();
    this.spawnFloatingText(
      this.width / 2,
      this.height / 2,
      wave ? `${wave.name} - ${sector.name}` : `WAVE ${this.wave} - ${sector.name}`,
      sector.accent,
      this.mobileProfile ? 20 : 26
    );
    this.playSound('wave');
    return true;
  }

  getWaveVictorySummary() {
    return this.waveVictoryReady && this.waveVictorySummary
      ? { ...this.waveVictorySummary }
      : null;
  }

  buildWaveVictorySummary(): WaveVictorySummary {
    const entry = this.getCurrentCampaignEntry();
    return {
      id: `${this.wave}-${this.frameCount}-${this.stats.score}`,
      wave: this.wave,
      waveName: entry?.wave.name ?? `Wave ${this.wave}`,
      sectorName: entry?.level.name ?? this.getWaveSector().name,
      scoreEarned: Math.max(0, this.stats.score - this.waveStartScore),
      totalScore: Math.max(0, this.stats.score),
      enemiesDefeated: Math.max(0, this.stats.enemiesDefeated - this.waveStartEnemiesDefeated),
      coinsCollected: Math.max(0, this.stats.totalCoins - this.waveStartTotalCoins),
      elapsedSeconds: Math.max(0, Math.round(this.waveFlightFrames / GAME_CONFIG.FPS)),
      nextWave: this.wave + 1
    };
  }

  jumpToCampaignBoss(waveNumber: number) {
    if (!this.testMode || !this.jumpToCampaignWave(waveNumber)) return false;

    const bossEvents = this.getConfiguredEncounterEvents()
      .filter((event): event is RuntimeBossEvent => event.kind === 'boss');
    const mainBoss = bossEvents
      .slice()
      .reverse()
      .find((event) => this.getEncounterWarningType(event) === 'gatekeeper')
      ?? bossEvents[bossEvents.length - 1];

    if (!mainBoss) {
      this.waveProgressFrames = this.getConfiguredWaveDurationFrames();
      this.stats.bossProgress = 1;
      this.startBossWarning('gatekeeper');
      return true;
    }

    const bossStartSeconds = Math.max(0, Number(mainBoss.startSeconds) || 0);
    this.waveProgressFrames = Math.round(bossStartSeconds * GAME_CONFIG.FPS);
    this.stats.bossProgress = Math.min(1, this.waveProgressFrames / this.getConfiguredWaveDurationFrames());

    const events = this.getCurrentWaveDefinition()?.events ?? [];
    for (const event of events) {
      if (Math.max(0, Number(event.startSeconds) || 0) > bossStartSeconds) continue;

      if (event.kind === 'spawn') {
        this.configuredSpawnCounts.set(event.id, Math.max(0, Math.floor(Number(event.count) || 0)));
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
      } else if (event.kind === 'powerup') {
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
      } else if (event.id !== mainBoss.id) {
        this.configuredEncounterIds.add(event.id);
      }
    }

    this.queueConfiguredEncounter(mainBoss);
    return true;
  }

  restartPreview() {
    this.entities = [];
    this.pendingPlayerShots = [];
    this.activePowerups.clear();
    this.frameCount = 0;
    this.lastPlayerRamFrame = -999;
    this.gameActive = true;
    this.previewComplete = false;
    this.lives = GAME_CONFIG.PLAYER_LIVES;
    this.stats.lives = this.lives;
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.enemiesDefeated = 0;
    this.resetWaveProgress();
    this.introFlightFrames = 0;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.invincibleTimer = 180;
    this.lastPlayerRamFrame = -999;
    this.playerDrawScale = 1;
    this.playerDrawAlpha = 1;
    this.playerTilt = 0;
    this.playerVel = { x: 0, y: 0 };
    this.setPlayerHomePosition();
    this.refreshLoadState();
  }

  getAnimatedFrame(frames: string[], entity: Entity, speed: number) {
    const index = (Math.floor(this.frameCount / speed) + entity.variant) % frames.length;
    return frames[index];
  }

  drawSprite(
    ctx: CanvasRenderingContext2D,
    url: string,
    width: number,
    height: number,
    options: {
      shadowColor?: string;
      shadowBlur?: number;
      rotation?: number;
      alpha?: number;
      yOffset?: number;
      filter?: string;
      compositeOperation?: GlobalCompositeOperation;
      spriteStyle?: SpriteStyle;
    } = {}
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return false;
    }

    const spriteStyle = options.spriteStyle;
    const styleFilters: string[] = [];
    if (spriteStyle?.hueRotateDegrees !== undefined) {
      styleFilters.push(`hue-rotate(${spriteStyle.hueRotateDegrees}deg)`);
    }
    if (spriteStyle?.saturation !== undefined) {
      styleFilters.push(`saturate(${spriteStyle.saturation})`);
    }
    if (spriteStyle?.brightness !== undefined) {
      styleFilters.push(`brightness(${spriteStyle.brightness})`);
    }
    const filter = [options.filter, ...styleFilters].filter(Boolean).join(' ');
    const rotation = (options.rotation ?? 0) + (((spriteStyle?.rotationDegrees ?? 0) * Math.PI) / 180);
    const scale = spriteStyle?.scale ?? 1;

    ctx.save();
    ctx.globalAlpha = (options.alpha ?? 1) * (spriteStyle?.opacity ?? 1);
    if (options.shadowColor) ctx.shadowColor = options.shadowColor;
    if (options.shadowBlur) ctx.shadowBlur = this.getGlowBlur(options.shadowBlur);
    if (spriteStyle?.glowColor !== undefined) ctx.shadowColor = spriteStyle.glowColor;
    if (spriteStyle?.glowBlur !== undefined) ctx.shadowBlur = this.getGlowBlur(spriteStyle.glowBlur);
    if (options.compositeOperation) ctx.globalCompositeOperation = options.compositeOperation;
    if (filter) ctx.filter = filter;
    if (rotation) ctx.rotate(rotation);
    if (spriteStyle && (scale !== 1 || spriteStyle.flipX)) {
      ctx.scale(spriteStyle.flipX ? -scale : scale, scale);
    }
    const yOffset = options.yOffset ?? 0;
    ctx.drawImage(img, -width / 2, -height / 2 + yOffset, width, height);
    ctx.restore();
    return true;
  }

  drawTiledLayer(
    ctx: CanvasRenderingContext2D,
    url: string,
    scale: number,
    speedY: number,
    speedX: number,
    alpha: number
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return;
    }

    const tileW = img.width * scale;
    const tileH = img.height * scale;
    const offsetY = -((this.frameCount * speedY) % tileH);
    const offsetX = -((this.frameCount * speedX) % tileW);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = offsetX - tileW; x < this.width + tileW; x += tileW) {
      for (let y = offsetY - tileH; y < this.height + tileH; y += tileH) {
        ctx.drawImage(img, x, y, tileW, tileH);
      }
    }
    ctx.restore();
  }

  drawBackgroundLayers(ctx: CanvasRenderingContext2D) {
    const lowDetail = this.isMobileProfile();
    const adaptiveLow = this.performanceMode;

    this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_BACK, 5, 0.06, 0.015, adaptiveLow ? 0.48 : 0.6);
    if (!adaptiveLow) {
      this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_STARS, 5, 0.1, 0.02, 0.45);
    }
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_BACK, 5, 0.16, 0.03, adaptiveLow ? 0.18 : lowDetail ? 0.24 : 0.35);
    this.drawTiledLayer(ctx, ASSETS.GAME_BG_STARS, 5, 0.22, 0.035, adaptiveLow ? 0.34 : 0.5);
    if (!lowDetail) {
      this.drawTiledLayer(ctx, ASSETS.GAME_PARALLAX_FAR_PLANETS, 5, 0.12, 0.02, 0.35);
    }

    ctx.save();
    ctx.globalAlpha = adaptiveLow ? 0.58 : 0.9;
    const horizon = getReadyImage(ASSETS.GAME_BG_PLANET);
    if (horizon) {
      const planetHeight = Math.max(220, this.height * 0.3);
      const planetYOffset = Math.max(180, this.height * 0.2);
      ctx.drawImage(horizon, 0, this.height - planetHeight + planetYOffset, this.width, planetHeight);
    }
    ctx.restore();

    const planetDrift = (this.frameCount * 0.2) % (this.width + 200);
    ctx.save();
    ctx.translate(this.width - 130, 110 + Math.sin(this.frameCount * 0.01) * 10);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_BIG_PLANET, lowDetail ? 135 : 170, lowDetail ? 135 : 170, {
      alpha: adaptiveLow ? (lowDetail ? 0.28 : 0.4) : lowDetail ? 0.38 : 0.55
    });
    ctx.restore();

    ctx.save();
    ctx.translate((this.width + 100) - planetDrift, 180 + Math.sin(this.frameCount * 0.015) * 12);
    this.drawSprite(ctx, ASSETS.GAME_PARALLAX_RING_PLANET, lowDetail ? 70 : 90, lowDetail ? 140 : 180, {
      alpha: adaptiveLow ? (lowDetail ? 0.36 : 0.5) : lowDetail ? 0.52 : 0.75
    });
    ctx.restore();

    const configuredBackgroundId = this.getCurrentWaveDefinition()?.backgroundId ?? this.getCurrentLevelDefinition()?.backgroundId;
    const configuredTints: Record<string, string> = {
      'open-orbit': 'rgba(34, 211, 238, 0)',
      'citation-storm': 'rgba(79, 70, 229, 0.12)',
      'paywall-siege': 'rgba(245, 158, 11, 0.08)',
      'open-galaxy': 'rgba(16, 185, 129, 0.11)',
      'bastion-protocol': 'rgba(219, 39, 119, 0.08)'
    };
    const tintIndex = (this.wave - 1 + this.sectorTint) % 3;
    const tint = configuredBackgroundId
      ? configuredTints[configuredBackgroundId] ?? 'rgba(34, 211, 238, 0)'
      : [
          'rgba(34, 211, 238, 0)',
          'rgba(79, 70, 229, 0.12)',
          'rgba(16, 185, 129, 0.11)'
        ][tintIndex];
    if (tint !== 'rgba(34, 211, 238, 0)') {
      ctx.save();
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  refreshRenderProfile() {
    this.mobileProfile = this.width < MOBILE_DETAIL_BREAKPOINT || (this.height > this.width * 1.35 && this.width < 760);
  }

  setPerformanceMode(enabled: boolean) {
    this.performanceMode = enabled;
  }

  getGlowBlur(blur: number) {
    if (this.performanceMode) return this.mobileProfile ? Math.min(blur * 0.22, 5) : Math.min(blur * 0.55, 10);
    return this.mobileProfile ? Math.min(blur * 0.38, 8) : blur;
  }

  getParticleDensity() {
    if (this.heavySceneLoad && this.mobileProfile) return this.polishSettings.highDensityParticles ? 0.28 : 0.18;
    if (this.performanceMode) return this.mobileProfile
      ? (this.polishSettings.highDensityParticles ? 0.34 : 0.22)
      : (this.polishSettings.highDensityParticles ? 0.6 : 0.34);
    if (!this.polishSettings.highDensityParticles) return 0.42;
    return this.mobileProfile ? 0.62 : 1;
  }

  compactEntities() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (!entity.markedForDeletion) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
  }

  prepareEntitiesForContinue() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (entity.type !== EntityType.PROJECTILE && entity.type !== EntityType.MISSILE) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
    this.pendingPlayerShots.length = 0;
    this.refreshLoadState();
  }

  keepEntitiesForNextWave() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (
        entity.type === EntityType.PLAYER
        || entity.type === EntityType.PARTICLE
        || entity.type === EntityType.POWERUP
        || entity.type === EntityType.COIN
        || entity.type === EntityType.BOMB
      ) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
  }

  getPlayerHomePosition() {
    return {
      x: this.width / 2 - this.player.width / 2,
      y: this.height - this.player.height - (this.width < 520 ? 20 : 32)
    };
  }

  setPlayerHomePosition() {
    const home = this.getPlayerHomePosition();
    this.player.x = home.x;
    this.player.y = home.y;
  }

  spawnThrusterParticles(strength: number = 1) {
    const baseX = this.player.x + this.player.width / 2;
    const baseY = this.player.y + this.player.height * 0.82;
    const spread = this.player.width * 0.14;
    const count = Math.max(1, Math.round(2 * strength * this.getParticleDensity()));

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const particle = new Particle(
        baseX + (side * spread) + randomRange(-4, 4),
        baseY + randomRange(4, 14),
        i % 3 === 0 ? '#ffffff' : '#22d3ee',
        randomRange(0.7, 2.4) * strength,
        randomRange(2.5, 5.8),
        randomRange(16, 32)
      );
      particle.vx *= 0.22;
      particle.vy = Math.abs(particle.vy) + randomRange(2.4, 5.8) * strength;
      this.entities.push(particle);
    }
  }

  updatePassiveEntities() {
    this.entities.forEach((entity) => {
      if (entity.type === EntityType.PARTICLE) {
        entity.x += entity.vx;
        entity.y += entity.vy;
        (entity as Particle).life--;
        if ((entity as Particle).life <= 0) entity.markedForDeletion = true;
      }

      if (entity.type === EntityType.EFFECT) {
        entity.x += entity.vx;
        entity.y += entity.vy;
        (entity as VisualEffect).life--;
        if ((entity as VisualEffect).life <= 0) entity.markedForDeletion = true;
      }
    });

    this.compactEntities();
  }

  updateIntroFlight() {
    if (this.introFlightFrames <= 0) return;

    const age = this.introFlightDuration - this.introFlightFrames;
    const progress = clamp(age / this.introFlightDuration, 0, 1);
    const home = this.getPlayerHomePosition();
    const centerX = this.width / 2;
    const launchY = this.height + this.player.height * 0.75;
    const hoverY = Math.max(this.height * 0.45, home.y - this.player.height * 1.15);
    const stageOne = progress < 0.56;

    if (stageOne) {
      const t = easeOutCubic(progress / 0.56);
      this.player.x = centerX - this.player.width / 2;
      this.player.y = launchY + ((hoverY - launchY) * t);
      this.playerDrawScale = 1.62 - (0.18 * t);
      this.playerTilt = Math.sin(this.frameCount * 0.08) * 0.06;
      this.spawnThrusterParticles(1.9);
    } else {
      const t = easeInOutCubic((progress - 0.56) / 0.44);
      this.player.x = centerX - this.player.width / 2;
      this.player.y = hoverY + ((home.y - hoverY) * t);
      this.playerDrawScale = 1.44 + ((1 - 1.44) * t);
      this.playerTilt = lerp(this.playerTilt, 0, 0.08);
      this.spawnThrusterParticles(1.25);
    }

    this.playerDrawAlpha = clamp(progress / 0.08, 0, 1);
    this.introFlightFrames--;

    if (this.introFlightFrames <= 0) {
      this.setPlayerHomePosition();
      this.playerDrawScale = 1;
      this.playerDrawAlpha = 1;
      this.playerTilt = 0;
      this.playerVel = { x: 0, y: 0 };
    }
  }

  updateWaveDeparture() {
    if (this.waveDepartureFrames <= 0) return;

    const age = this.waveDepartureDuration - this.waveDepartureFrames;
    const progress = clamp(age / this.waveDepartureDuration, 0, 1);
    const hold = progress < 0.32;

    if (hold) {
      this.addShake(0.2);
      this.spawnThrusterParticles(0.85);
    } else {
      const t = easeInOutCubic((progress - 0.32) / 0.68);
      const centerX = this.width / 2 + Math.sin(t * Math.PI) * this.width * 0.08;
      const startY = this.getPlayerHomePosition().y;
      const endY = -this.player.height * 1.6;
      this.player.x = centerX - this.player.width / 2;
      this.player.y = startY + ((endY - startY) * t);
      this.playerDrawScale = 1 + (0.48 * t);
      this.playerTilt = Math.sin(t * Math.PI) * 0.18;
      this.spawnThrusterParticles(2.15);
    }

    this.waveDepartureFrames--;

    if (this.waveDepartureFrames <= 0) {
      if (this.previewMode) {
        this.startNextWave();
        return;
      }

      this.playerDrawAlpha = 0;
      this.playerVel = { x: 0, y: 0 };
      this.waveVictoryReady = true;
      this.gameActive = false;
      this.playSound('powerup', 1.2, { pitchOffset: 0.12 });
    }
  }

  startDeathSequence() {
    if (this.deathSequenceFrames > 0 || !this.gameActive) return;

    this.deathSequenceFrames = this.deathSequenceDuration;
    this.deathSequenceStartedAtMs = Date.now();
    this.invincibleTimer = 999;
    this.flashAlpha = Math.max(this.flashAlpha, 0.72);
    this.addShake(14);
    this.addHitStop(14);
    this.playSound('gameover');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'MISSION LOST', '#fb7185', 24);
  }

  updateDeathSequence() {
    if (this.deathSequenceFrames <= 0) return;

    if (
      this.deathSequenceStartedAtMs > 0
      && Date.now() - this.deathSequenceStartedAtMs >= this.deathSequenceMaxDurationMs
    ) {
      this.finishDeathSequence();
      return;
    }

    const progress = 1 - (this.deathSequenceFrames / this.deathSequenceDuration);
    this.playerDrawAlpha = Math.max(0, 1 - progress * 1.4);
    this.playerDrawScale = 1 + (progress * 0.42);
    this.addShake(0.55 + progress * 0.85);
    if (this.frameCount % 5 === 0) {
      this.spawnBurst(
        this.player.x + this.player.width / 2 + randomRange(-18, 18),
        this.player.y + this.player.height / 2 + randomRange(-18, 18),
        progress < 0.5 ? '#67e8f9' : '#fb7185',
        4,
        3.4,
        4
      );
    }

    this.deathSequenceFrames--;

    if (this.deathSequenceFrames <= 0) {
      this.finishDeathSequence();
    }
  }

  finishDeathSequence() {
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.hitStopFrames = 0;
    this.gameActive = false;
    if (this.audioEnabled) audioService.stopMusic();
  }

  continueRun(lives: number = GAME_CONFIG.PLAYER_LIVES) {
    this.gameActive = true;
    if (this.audioEnabled) audioService.startMusic();
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.waveDepartureFrames = 0;
    this.introFlightFrames = 0;
    this.lives = lives;
    this.stats.lives = lives;
    this.invincibleTimer = 180;
    this.lastPlayerRamFrame = -999;
    this.setPlayerHomePosition();
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.playerSquash = -0.12;
    this.playerSquashVelocity = 0;
    this.playerDrawAlpha = 1;
    this.playerDrawScale = 1;
    this.prepareEntitiesForContinue();
    this.flashAlpha = Math.max(this.flashAlpha, 0.35);
    this.addShake(2.6);
    this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#67e8f9');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'CONTINUE', '#67e8f9', 24);
    this.playSound('launch');
  }

  init(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.refreshRenderProfile();
    this.setPlayerHomePosition();
    this.entities = [];
    this.bgEntities = [];
    this.stars = [];
    const lowDetail = this.mobileProfile;

    for (let i = 0; i < (lowDetail ? 2 : 4); i++) {
        this.bgEntities.push(new BackgroundEntity(width, height));
    }
    for (let i = 0; i < (lowDetail ? 92 : 160); i++) {
      this.stars.push(new Star(width, height));
    }

    this.gameActive = true;
    this.lives = this.startingLives;
    this.stats.lives = this.lives;
    if (!this.previewMode) {
      this.currentCampaignIndex = 0;
    }
    this.wave = this.currentCampaignIndex + 1;
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.totalCoins = 0;
    this.stats.bombs = 2;
    this.stats.bombCharge = this.testMode ? getChargeForStoredFlasks(40) : 0;
    this.stats.bombChargeMax = BASE_FLASK_CHARGE_MAX;
    this.stats.shipAbilityCooldown = 0;
    this.stats.shipAbilityCooldownMax = RESEARCH_CHARGE_COOLDOWN_FRAMES;
    this.stats.wave = this.wave;
    this.resetWaveProgress();
    const openingSector = this.getWaveSector();
    const openingWave = this.getCurrentWaveDefinition();
    this.spawnFloatingText(
      this.width / 2,
      this.height / 2,
      openingWave ? `${openingWave.name} - ${openingSector.name}` : `WAVE ${this.wave} - ${openingSector.name}`,
      openingSector.accent,
      this.mobileProfile ? 20 : 26
    );
    this.bossRef = null;
    this.miniBossRef = null;
    this.activePowerups.clear();
    this.frameCount = 0;
    this.lastPlayerRamFrame = -999;
    this.missileTimer = 0;
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.resetSquadCompanionPositions();
    this.playerSquash = -0.18;
    this.playerSquashVelocity = 0;
    this.playerAfterimages = [];
    this.shakeStrength = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.hitStopFrames = 0;
    this.coinCombo = 0;
    this.coinComboTimer = 0;
    this.lastShotFrame = -999;
    this.bioBeamCanvasVisualStartFrame = -1;
    this.lastBombFrame = -999;
    this.weaponVolley = 0;
    this.announcedFireRateLevel = Math.min(this.stats.upgrades.fireRate || 0, 7);
    const configuredIntroSeconds = Number(this.getCurrentWaveDefinition()?.introSeconds);
    this.introFlightDuration = Number.isFinite(configuredIntroSeconds) && configuredIntroSeconds >= 0
      ? Math.max(0, Math.round(configuredIntroSeconds * GAME_CONFIG.FPS))
      : 150;
    this.introFlightFrames = this.previewMode ? 0 : this.introFlightDuration;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.deathSequenceStartedAtMs = 0;
    this.playerDrawScale = this.previewMode || this.introFlightFrames <= 0 ? 1 : 1.55;
    this.playerDrawAlpha = this.previewMode || this.introFlightFrames <= 0 ? 1 : 0;
    this.sectorTint = 0;
    
    // START MUSIC
    if (this.audioEnabled) audioService.startMusic();
    this.playSound('launch');
  }
  
  resetWaveProgress() {
    this.stats.bossProgress = 0;
    this.stats.isBossActive = false;
    this.stats.bossHp = 0;
    this.stats.bossMaxHp = 100;
    this.waveProgressFrames = 0;
    this.bossRef = null;
    this.miniBossRef = null;
    this.spawnedMiniBoss1 = false;
    this.spawnedWallBoss = false;
    this.mainBossDefeated = false;
    this.asteroidBeltMaxCount = 0;
    this.inBossWarningSequence = false;
    this.bossWarningDuration = 0;
    this.pendingBossType = null;
    this.waveTransitionPending = false;
    this.previewComplete = false;
    this.configuredEncounterIds.clear();
    this.configuredSpawnCounts.clear();
    this.configuredSpawnFrames.clear();
    this.escalationWarningsShown.clear();
    this.pendingBossStrikes = [];
    this.pendingConfiguredEncounter = null;
    this.waveVictoryReady = false;
    this.waveVictorySummary = null;
    this.waveStartScore = this.stats.score;
    this.waveStartEnemiesDefeated = this.stats.enemiesDefeated;
    this.waveStartTotalCoins = this.stats.totalCoins;
    this.waveFlightFrames = 0;
  }

  continueToNextWave() {
    if (!this.waveVictoryReady || !this.waveTransitionPending) return false;

    this.waveVictoryReady = false;
    this.startNextWave();
    return true;
  }

  getPlayerMovementBounds() {
    return {
      minX: -this.player.width / 2,
      maxX: this.width - (this.player.width / 2),
      minY: -this.player.height / 2,
      maxY: this.height - (this.player.height / 2)
    };
  }

  startNextWave() {
    if (this.waveTransitionPending === false && this.mainBossDefeated === false) {
      return;
    }

    if (this.previewMode) {
      this.waveDepartureFrames = 0;
      this.previewComplete = true;
      this.gameActive = false;
      return;
    }

    this.wave++;
    this.stats.wave = this.wave;
    if (this.campaignWaves.length > 0) {
      this.currentCampaignIndex += 1;
    }
    this.resetWaveProgress();
    this.gameActive = true;
    this.keepEntitiesForNextWave();
    const sector = this.getWaveSector();
    const nextWave = this.getCurrentWaveDefinition();
    this.spawnFloatingText(
      this.width / 2,
      this.height / 2,
      nextWave ? `${nextWave.name} - ${sector.name}` : `WAVE ${this.wave} - ${sector.name}`,
      sector.accent,
      this.mobileProfile ? 20 : 26
    );
    const configuredIntroSeconds = Number(this.getCurrentWaveDefinition()?.introSeconds);
    this.introFlightDuration = Number.isFinite(configuredIntroSeconds) && configuredIntroSeconds >= 0
      ? Math.max(0, Math.round(configuredIntroSeconds * GAME_CONFIG.FPS))
      : 118;
    this.introFlightFrames = this.introFlightDuration;
    this.playerDrawScale = this.introFlightFrames > 0 ? 1.46 : 1;
    this.playerDrawAlpha = this.introFlightFrames > 0 ? 0 : 1;
    this.sectorTint = (this.sectorTint + 1) % 3;
    this.playSound('wave');
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.refreshRenderProfile();
    this.entities.forEach(e => {
        if (e.type === EntityType.PLAYER) {
            const bounds = this.getPlayerMovementBounds();
            e.x = Math.max(bounds.minX, Math.min(bounds.maxX, e.x));
            e.y = Math.max(bounds.minY, Math.min(bounds.maxY, e.y));
        }
    });
  }

  handleInput(keys: Record<string, boolean>, touchPos: { x: number, y: number } | null) {
    this.keys = keys;
    if (touchPos !== undefined) {
        this.touchPos = touchPos;
    }
  }

  isMobileProfile() {
    return this.mobileProfile;
  }

  getWaveSector() {
    const entry = this.getCurrentCampaignEntry();
    if (entry) {
      return {
        name: entry.level.name,
        accent: entry.wave.accent || WAVE_SECTORS[(Math.max(1, this.wave) - 1) % WAVE_SECTORS.length].accent
      };
    }
    return WAVE_SECTORS[(Math.max(1, this.wave) - 1) % WAVE_SECTORS.length];
  }

  getParticleCap() {
    if (this.heavySceneLoad && this.mobileProfile) return Math.floor(MOBILE_PARTICLE_CAP * 0.46);
    if (this.performanceMode) return this.mobileProfile ? Math.floor(MOBILE_PARTICLE_CAP * 0.58) : Math.floor(DESKTOP_PARTICLE_CAP * 0.68);
    return this.isMobileProfile() ? MOBILE_PARTICLE_CAP : DESKTOP_PARTICLE_CAP;
  }

  getEffectCap() {
    if (this.heavySceneLoad && this.mobileProfile) return Math.floor(MOBILE_EFFECT_CAP * 0.5);
    if (this.performanceMode) return this.mobileProfile ? Math.floor(MOBILE_EFFECT_CAP * 0.62) : Math.floor(DESKTOP_EFFECT_CAP * 0.72);
    return this.isMobileProfile() ? MOBILE_EFFECT_CAP : DESKTOP_EFFECT_CAP;
  }

  getThreatCap() {
    const configuredCap = Number(this.getCurrentWaveDefinition()?.threatCap);
    const progressionCap = Number.isFinite(configuredCap) && configuredCap > 0
      ? Math.min(DESKTOP_THREAT_CAP, Math.floor(configuredCap))
      : Math.min(DESKTOP_THREAT_CAP, MOBILE_THREAT_CAP + ((Math.max(1, this.wave) - 1) * 3));
    if (this.performanceMode && this.mobileProfile) return Math.max(MOBILE_THREAT_CAP - 4, Math.floor(progressionCap * 0.9));
    return progressionCap;
  }

  countEntities(type: EntityType) {
    let count = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (!entity.markedForDeletion && entity.type === type) count++;
    }
    return count;
  }

  getActiveThreatCount() {
    let count = 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (!entity.markedForDeletion && this.isEnemyTarget(entity)) count++;
    }
    return count;
  }

  updateJuiceSystems() {
    if (!this.polishSettings.screenShake) {
      this.shakeStrength = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    } else {
      this.shakeStrength = moveToward(this.shakeStrength, 0, GAME_FEEL.shakeDecay);
      if (this.shakeStrength > 0.01) {
        this.shakeX = randomRange(-1, 1) * this.shakeStrength;
        this.shakeY = randomRange(-1, 1) * this.shakeStrength;
      } else {
        this.shakeX = 0;
        this.shakeY = 0;
      }
    }

    this.flashAlpha = moveToward(this.flashAlpha, 0, GAME_FEEL.flashDecay);

    if (this.coinComboTimer > 0) {
      this.coinComboTimer--;
    } else {
      this.coinCombo = 0;
    }

    this.playerSquashVelocity += -this.playerSquash * GAME_FEEL.squashSpring;
    this.playerSquashVelocity *= GAME_FEEL.squashDamping;
    this.playerSquash += this.playerSquashVelocity;
    if (Math.abs(this.playerSquash) < 0.001 && Math.abs(this.playerSquashVelocity) < 0.001) {
      this.playerSquash = 0;
      this.playerSquashVelocity = 0;
    }

    for (let index = this.playerAfterimages.length - 1; index >= 0; index--) {
      const image = this.playerAfterimages[index];
      image.alpha -= 0.045;
      if (image.alpha <= 0) {
        this.playerAfterimages.splice(index, 1);
      }
    }
  }

  addShake(amount: number) {
    if (!this.polishSettings.screenShake) return;
    this.shakeStrength = Math.max(this.shakeStrength, amount);
  }

  addHitStop(frames: number) {
    this.hitStopFrames = Math.max(this.hitStopFrames, frames);
  }

  kickPlayerSquash(amount: number) {
    this.playerSquash = clamp(this.playerSquash + amount, -0.28, 0.28);
    this.playerSquashVelocity = 0;
  }

  spawnBurst(x: number, y: number, color: string, amount: number = 10, speed: number = 4, size: number = 4) {
    const cap = this.getParticleCap();
    const available = Math.max(0, cap - this.liveParticleCount);
    const leanAmount = this.shouldUseLeanEffects() && speed <= 2 ? Math.min(amount, 2) : amount;
    const scaledAmount = Math.max(1, Math.ceil(leanAmount * this.getParticleDensity()));
    const particleAmount = Math.min(scaledAmount, available);

    for (let i = 0; i < particleAmount; i++) {
      this.entities.push(new Particle(
        x,
        y,
        color,
        randomRange(speed * 0.45, speed),
        randomRange(size * 0.65, size * 1.35),
        randomRange(22, 48)
      ));
    }
    this.liveParticleCount += particleAmount;
  }

  addPlayerAfterimage() {
    this.playerAfterimages.push({
      x: this.player.x,
      y: this.player.y,
      width: this.player.width,
      height: this.player.height,
      alpha: 0.24,
      rotation: this.playerTilt,
      squash: this.playerSquash
    });

    if (this.playerAfterimages.length > 8) {
      this.playerAfterimages.shift();
    }
  }

  updatePlayerMovement(maxSpeed: number) {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    let targetVx = 0;
    let targetVy = 0;
    let acceleration = GAME_FEEL.acceleration + (this.stats.upgrades.speed * 0.045);

    if (this.touchPos) {
      const touchLeadY = this.width < 520 ? 82 : 64;
      targetVx = clamp((this.touchPos.x - centerX) * GAME_FEEL.touchResponse, -maxSpeed * 1.34, maxSpeed * 1.34);
      targetVy = clamp((this.touchPos.y - touchLeadY - centerY) * GAME_FEEL.touchResponse, -maxSpeed * 1.34, maxSpeed * 1.34);
      acceleration = GAME_FEEL.touchAcceleration + (this.stats.upgrades.speed * 0.055);
    } else {
      const horizontal = (this.keys['ArrowRight'] || this.keys['d'] || this.keys['D'] ? 1 : 0)
        - (this.keys['ArrowLeft'] || this.keys['a'] || this.keys['A'] ? 1 : 0);
      const vertical = (this.keys['ArrowDown'] || this.keys['s'] || this.keys['S'] ? 1 : 0)
        - (this.keys['ArrowUp'] || this.keys['w'] || this.keys['W'] ? 1 : 0);
      const length = Math.hypot(horizontal, vertical) || 1;

      targetVx = (horizontal / length) * maxSpeed;
      targetVy = (vertical / length) * maxSpeed;
      if (horizontal === 0 && vertical === 0) {
        acceleration = GAME_FEEL.friction + (this.stats.upgrades.speed * 0.025);
      }
    }

    this.playerVel.x = moveToward(this.playerVel.x, targetVx, acceleration);
    this.playerVel.y = moveToward(this.playerVel.y, targetVy, acceleration);

    this.player.x += this.playerVel.x;
    this.player.y += this.playerVel.y;

    const bounds = this.getPlayerMovementBounds();
    const clampedX = clamp(this.player.x, bounds.minX, bounds.maxX);
    const clampedY = clamp(this.player.y, bounds.minY, bounds.maxY);

    if (clampedX !== this.player.x) {
      this.playerVel.x *= -0.18;
      this.kickPlayerSquash(0.035);
    }
    if (clampedY !== this.player.y) {
      this.playerVel.y *= -0.18;
      this.kickPlayerSquash(0.035);
    }

    this.player.x = clampedX;
    this.player.y = clampedY;

    const moveSpeed = Math.hypot(this.playerVel.x, this.playerVel.y);
    this.playerTilt = lerp(this.playerTilt, clamp(this.playerVel.x * GAME_FEEL.tiltPerSpeed, -GAME_FEEL.maxTilt, GAME_FEEL.maxTilt), GAME_FEEL.tiltEase);

    if (moveSpeed > GAME_FEEL.afterimageSpeed && this.frameCount % (this.shouldUseLeanEffects() ? 8 : 5) === 0) {
      this.addPlayerAfterimage();
    }

    if (
      moveSpeed > 1.3
      && this.frameCount % (this.shouldUseLeanEffects() ? 12 : 6) === 0
      && this.liveParticleCount < this.getParticleCap()
    ) {
      this.entities.push(new Particle(
        this.player.x + this.player.width / 2 - this.playerVel.x * 3,
        this.player.y + this.player.height * 0.78,
        moveSpeed > maxSpeed ? '#67e8f9' : '#22d3ee',
        randomRange(0.7, 1.8),
        randomRange(3, 7),
        randomRange(18, 34)
      ));
      this.liveParticleCount++;
    }
  }

  startBossWarning(type: BossWarningType, durationSeconds?: number) {
    this.inBossWarningSequence = true;
    const configuredFrames = Number.isFinite(durationSeconds)
      ? Math.max(1, Math.round((durationSeconds as number) * GAME_CONFIG.FPS))
      : 0;
    this.bossWarningDuration = configuredFrames || (type === 'gatekeeper' ? 300 : 90);
    this.bossWarningFrame = this.bossWarningDuration;
    this.pendingBossType = type;
    if (type === 'gatekeeper') {
      this.clearThreatsForMainBoss();
    }
    this.playSound('siren');
  }

  clearThreatsForMainBoss() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (
        entity.type === EntityType.COIN
        || entity.type === EntityType.POWERUP
        || entity.type === EntityType.PARTICLE
        || entity.type === EntityType.EFFECT
      ) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
  }

  getSecondSubBossType(): BossWarningType {
    return this.wave % 2 === 0 ? 'asteroid' : 'wall';
  }

  isSubBossWarning(type: BossWarningType | null = this.pendingBossType) {
    return type === 'mini1' || type === 'wall' || type === 'asteroid';
  }

  getAsteroidBeltCount() {
    let count = 0;
    for (const entity of this.entities) {
      if (!entity.markedForDeletion && entity.type === EntityType.ENEMY_BRICK && entity.variant >= 900) {
        count++;
      }
    }
    return count;
  }

  getActiveMiniBosses() {
    return this.entities.filter((entity) => (
      !entity.markedForDeletion && entity.type === EntityType.MINI_BOSS
    ));
  }

  getEncounterWarningType(event: RuntimeEncounterEvent): BossWarningType {
    if (event.kind === 'asteroid-belt') return 'asteroid';
    const bossId = String(event.bossId || '').toLowerCase();
    if (bossId.includes('wall') || bossId.includes('paywall')) return 'wall';
    if (bossId.includes('gate') || bossId.includes('final') || bossId.includes('sentinel')) return 'gatekeeper';
    return 'mini1';
  }

  queueConfiguredEncounter(event: RuntimeEncounterEvent) {
    if (this.configuredEncounterIds.has(event.id) || this.inBossWarningSequence) return;
    this.configuredEncounterIds.add(event.id);
    this.pendingConfiguredEncounter = event;
    const warningSeconds = Number(event.warningSeconds);
    this.startBossWarning(
      this.getEncounterWarningType(event),
      Number.isFinite(warningSeconds) && warningSeconds >= 0 ? warningSeconds : undefined
    );
  }

  spawnConfiguredEncounter(event: RuntimeEncounterEvent) {
    if (event.kind === 'asteroid-belt') {
      this.spawnAsteroidBelt(event);
      return;
    }

    const warningType = this.getEncounterWarningType(event);
    if (warningType === 'wall') {
      this.spawnWallBoss(event);
    } else if (warningType === 'gatekeeper') {
      this.spawnBoss(event);
    } else {
      this.spawnMiniBoss(1, event);
    }
  }

  getDueConfiguredEncounter() {
    const elapsedSeconds = this.getWaveElapsedSeconds();
    return this.getConfiguredEncounterEvents().find((event) => (
      !this.configuredEncounterIds.has(event.id)
      && elapsedSeconds >= Math.max(0, Number(event.startSeconds) || 0)
    ));
  }

  update(cinematicPause: boolean = false) {
    if (!this.gameActive) return;
    this.frameCount++;
    if ((this.stats.shipAbilityCooldown || 0) > 0) {
      this.stats.shipAbilityCooldown = Math.max(0, this.stats.shipAbilityCooldown - 1);
    }
    this.stats.shipAbilityCooldownMax = RESEARCH_CHARGE_COOLDOWN_FRAMES;
    this.flushPendingPlayerShots();
    this.refreshLoadState();
    this.stats.lives = this.lives;
    this.updateJuiceSystems();
    this.stars.forEach(star => star.update(this.width, this.height));
    this.bgEntities.forEach(bg => bg.update(this.height));

    if (this.hitStopFrames > 0) {
      this.hitStopFrames--;
      this.updatePassiveEntities();
      return;
    }

    if (this.deathSequenceFrames > 0) {
      this.updateDeathSequence();
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (this.waveDepartureFrames > 0) {
      this.updateWaveDeparture();
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (this.introFlightFrames > 0) {
      this.updateIntroFlight();
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    if (cinematicPause) {
      this.updatePassiveEntities();
      this.bgY = (this.bgY + 1) % this.height;
      return;
    }

    this.waveFlightFrames++;
    this.updatePendingBossStrikes();
    
    let invaderCount = 0;
    let asteroidBeltCount = 0;
    for (const entity of this.entities) {
      if (entity.markedForDeletion) continue;
      if (entity.type === EntityType.ENEMY_INVADER) {
        invaderCount++;
      } else if (entity.type === EntityType.ENEMY_BRICK && entity.variant >= 900) {
        asteroidBeltCount++;
      }
    }
    const activeMiniBosses = this.getActiveMiniBosses();
    this.miniBossRef = activeMiniBosses[0] ?? null;
    const isBossAlive = !!this.bossRef || activeMiniBosses.length > 0 || invaderCount > 0 || asteroidBeltCount > 0;
    
    if (isBossAlive) {
        this.stats.isBossActive = true;
        let hp = 0;
        let maxHp = 100;

        if (this.bossRef) {
            hp = this.bossRef.hp;
            maxHp = this.bossRef.maxHp;
        } else if (activeMiniBosses.length > 0) {
            hp = activeMiniBosses.reduce((total, boss) => total + Math.max(0, boss.hp), 0);
            maxHp = activeMiniBosses.reduce((total, boss) => total + Math.max(0, boss.maxHp), 0);
        } else if (invaderCount > 0) {
            hp = 0;
            maxHp = 0;
            for (const invader of this.entities) {
              if (!invader.markedForDeletion && invader.type === EntityType.ENEMY_INVADER) {
                hp += Math.max(0, invader.hp);
                maxHp += Math.max(0, invader.maxHp);
              }
            }
        } else if (asteroidBeltCount > 0) {
            hp = asteroidBeltCount;
            maxHp = this.asteroidBeltMaxCount || asteroidBeltCount;
        }
        
        this.stats.bossHp = hp;
        this.stats.bossMaxHp = maxHp;
        if (invaderCount > 0) this.updateWallBoss();

    } else {
        this.stats.isBossActive = false;

        // Progress bar logic
        if (!this.inBossWarningSequence) {
             this.waveProgressFrames++;
             const totalDuration = this.getConfiguredWaveDurationFrames();
             this.stats.bossProgress = Math.min(1, this.waveProgressFrames / totalDuration);
        }

        const configuredEncounters = this.getConfiguredEncounterEvents();
        if (configuredEncounters.length > 0) {
          const dueEncounter = this.getDueConfiguredEncounter();
          if (dueEncounter && !this.inBossWarningSequence) {
            this.queueConfiguredEncounter(dueEncounter);
          }
        } else {
          // Legacy milestone fallback for campaigns without event configuration.
          if (this.stats.bossProgress >= 0.33 && !this.spawnedMiniBoss1) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning('mini1');
               }
          }
          else if (this.stats.bossProgress >= 0.66 && !this.spawnedWallBoss) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning(this.getSecondSubBossType());
               }
          }
          else if (this.stats.bossProgress >= 1 && !this.bossRef && !this.mainBossDefeated) {
               if (!this.inBossWarningSequence) {
                   this.startBossWarning('gatekeeper');
               }
          }
        }
    }
    
    if (this.inBossWarningSequence) {
        const warningAge = this.bossWarningDuration - this.bossWarningFrame;
        const mainBossAlertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, this.bossWarningDuration - 60));
        const mainBossAlertActive = this.pendingBossType === 'gatekeeper' && warningAge < mainBossAlertFrames;
        if ((this.isSubBossWarning() || mainBossAlertActive) && this.bossWarningFrame > 0 && this.bossWarningFrame % 36 === 0) {
            this.playSound('siren');
        }
        if (this.pendingBossType === 'gatekeeper' && warningAge === mainBossAlertFrames) {
            this.playSound('boss_roar');
        }
        this.bossWarningFrame--;
        if (this.bossWarningFrame <= 0) {
            this.inBossWarningSequence = false;

            if (this.pendingConfiguredEncounter) {
                const encounter = this.pendingConfiguredEncounter;
                this.pendingConfiguredEncounter = null;
                this.spawnConfiguredEncounter(encounter);
            } else if (this.pendingBossType === 'mini1') {
                this.spawnMiniBoss(1);
                this.spawnedMiniBoss1 = true;
            } else if (this.pendingBossType === 'wall') {
                this.spawnWallBoss();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'asteroid') {
                this.spawnAsteroidBelt();
                this.spawnedWallBoss = true;
            } else if (this.pendingBossType === 'gatekeeper') {
                this.spawnBoss();
            }
            this.pendingBossType = null;
        }
    }

    const speedLevel = Math.min(this.stats.upgrades.speed || 0, 6);
    const speed = GAME_CONFIG.BASE_PLAYER_SPEED
      + (Math.min(speedLevel, 5) * 1.5)
      + (speedLevel >= 6 ? 3 : 0);
    this.updatePlayerMovement(speed);
    this.updateSquadCompanions();

    // FIRE RATE PROGRESSION: Spaced out for distinct feeling
    // Level 0: 15 (4 shots/sec)
    // Level 1: 12 (5 shots/sec)
    // Level 2: 10 (6 shots/sec)
    // Level 3: 8 (7.5 shots/sec)
    // Level 4: 6 (10 shots/sec)
    // Level 5-7: 5 (12 shots/sec); premium tiers add power without extra projectile load.
    const fireRates = [15, 12, 10, 8, 6, 5, 5, 5];
    const level = Math.min(this.stats.upgrades.fireRate, 7);
    const fireInterval = fireRates[level] || 5;

    if (level > this.announcedFireRateLevel) {
      const weaponLabel = `RAPID FIRE L${level + 1}`;
      const weaponColor = '#67e8f9';
      this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 18, weaponLabel, weaponColor, this.mobileProfile ? 16 : 19);
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, weaponColor);
      this.playSound('powerup', 1, { pitchOffset: level * 0.04 });
      this.announcedFireRateLevel = level;
    }
    
    if ((this.keys[' '] || this.touchPos || this.keys['Enter']) && this.frameCount % fireInterval === 0) {
      this.fireBullet();
    }

    // Missile Logic
    if (this.stats.upgrades.missile > 0) {
        this.missileTimer--;
        const cooldown = 180 - (this.stats.upgrades.missile * 20); // 3s down to ~1.3s
        if (this.missileTimer <= 0) {
            this.fireMissile();
            this.missileTimer = cooldown;
        }
    }

    for (const [type, timer] of this.activePowerups) {
        if (timer > 0) this.activePowerups.set(type, timer - 1);
        else this.activePowerups.delete(type);
    }
    
    if (this.invincibleTimer > 0) this.invincibleTimer--;

    this.spawnConfiguredSupportEvents();
    this.spawnEnemies();
    this.updateEnemyFire();

    this.entities.forEach(e => {
      if (e.isBeam) {
          e.life--;
          if (e.life <= 0) e.markedForDeletion = true;
          const beamOwner = e.bossOwnerId
            ? this.entities.find((candidate) => candidate.id === e.bossOwnerId && !candidate.markedForDeletion)
            : this.bossRef;
          if (beamOwner) {
              if (e.beamAxis === 'horizontal') {
                e.x = 0;
                e.y = clamp(beamOwner.y + beamOwner.height / 2 - e.height / 2, 0, this.height - e.height);
                e.width = this.width;
                return;
              }
              if (e.beamFromCenter) {
                e.x = clamp(beamOwner.x + beamOwner.width / 2 - e.width / 2, 0, this.width - e.width);
                e.y = 0;
                e.height = this.height;
                return;
              }
              const anchorX = e.beamAnchorOffsetX ?? (beamOwner.width / 2 - e.width / 2);
              const waveOneDrift = this.stats.wave === 1
                ? Math.sin((this.frameCount + (e.variant * 37)) * 0.075) * 16
                : 0;
              e.x = Math.max(0, Math.min(this.width - e.width, beamOwner.x + anchorX + waveOneDrift));
              e.y = beamOwner.y + beamOwner.height - 20;
          } else {
              e.markedForDeletion = true;
          }
          return;
      }

      if (e.flashFrames > 0) e.flashFrames--;
      for (const component of e.bossComponents ?? []) {
        if (component.flashFrames > 0) component.flashFrames--;
      }
      if (this.isCrownClawProjectile(e)) {
        this.updateCrownClawProjectile(e);
        if (e.markedForDeletion) return;
      }
      e.x += e.vx;
      e.y += e.vy;
      
      if (e.type === EntityType.MISSILE) {
          // Homing Logic
          // Find nearest enemy
          let nearest: Entity | null = null;
          let minDistSq = 1000 * 1000;
          
          for (let targetIndex = 0; targetIndex < this.homingTargetsBuffer.length; targetIndex++) {
              const target = this.homingTargetsBuffer[targetIndex];
              if (!target.markedForDeletion && this.isEnemyTarget(target)) {
                  const dx = target.x - e.x;
                  const dy = target.y - e.y;
                  const distSq = dx * dx + dy * dy;
                  if (distSq < minDistSq && target.y > 0) {
                      minDistSq = distSq;
                      nearest = target;
                  }
              }
          }
          
          if (nearest) {
              const target = nearest as Entity;
              const dx = (target.x + target.width/2) - (e.x + e.width/2);
              const dy = (target.y + target.height/2) - (e.y + e.height/2);
              const angle = Math.atan2(dy, dx);
              
              // Homing steering
              const isMaxLevel = e.color === '#ff0055';
              const speed = isMaxLevel ? 14 : 9; // Faster if max (was 12)
              const turnRate = isMaxLevel ? 3.5 : 1.5; // Very aggressive if max (was 2.5), better base (was 1.2)

              e.vx += Math.cos(angle) * turnRate;
              e.vy += Math.sin(angle) * turnRate;
              
              // Normalize velocity
              const vel = Math.sqrt(e.vx*e.vx + e.vy*e.vy);
              if (vel > speed) {
                  e.vx = (e.vx/vel) * speed;
                  e.vy = (e.vy/vel) * speed;
              }
          }
          
          // Spawn trail - Use missile color
          if (this.frameCount % (this.shouldUseLeanEffects() ? 8 : 4) === 0 && this.liveParticleCount < this.getParticleCap()) {
              this.entities.push(new Particle(e.x + e.width/2, e.y + e.height, e.color, 1));
              this.liveParticleCount++;
          }
          
          if (e.y < -50 || e.y > this.height + 50 || e.x < -50 || e.x > this.width + 50) e.markedForDeletion = true;
      }

      if (e.type === EntityType.ENEMY_DRONE || e.type === EntityType.ENEMY_JOURNAL || e.type === EntityType.ENEMY_SWARM || e.type === EntityType.ENEMY_BRICK) {
        const formationHandled = this.updateConfiguredEnemyFormation(e);
        if (e.type === EntityType.ENEMY_SWARM && !formationHandled) {
          if (e.formation === 'orbit') {
            const boss = this.bossRef;
            if (!boss || boss.markedForDeletion) {
              e.markedForDeletion = true;
              return;
            }

            const orbitSpeed = 0.026 + Math.min(0.018, this.wave * 0.0025);
            const orbitRadius = Math.min(this.width * 0.34, boss.width * 0.62 + (this.mobileProfile ? 34 : 48));
            const angle = e.formationSeed + (this.frameCount * orbitSpeed);
            const bossCenterX = boss.x + boss.width / 2;
            const bossCenterY = boss.y + boss.height / 2;
            e.x = bossCenterX + Math.cos(angle) * orbitRadius - e.width / 2;
            e.y = bossCenterY + Math.sin(angle) * orbitRadius - e.height / 2;
            e.vx = 0;
            e.vy = 0;
            return;
          }

          const playerCenterX = this.player.x + this.player.width / 2;
          const enemyCenterX = e.x + e.width / 2;
          const dx = playerCenterX - enemyCenterX;
          const waveMotion = Math.sin((this.frameCount * 0.055) + e.formationSeed) * (e.formation === 'sine' ? 2.4 : 1.1);

          if (e.formation === 'pincer') {
            e.vx += dx * 0.0009;
            e.x += waveMotion * 0.55;
          } else if (e.formation === 'v') {
            e.vx += dx * 0.0012;
            e.x += Math.sin((this.frameCount * 0.045) + e.formationIndex) * 0.8;
          } else if (e.formation === 'row') {
            e.x += Math.sin((this.frameCount * 0.05) + e.formationSeed) * 1.1;
          } else {
            e.vx += dx * 0.0015;
            e.x += waveMotion;
          }

          e.vx *= 0.94;
        }
        if (!formationHandled && e.type === EntityType.ENEMY_BRICK && e.variant >= 900) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.025) * (0.55 + (this.wave * 0.12));
        }
        if (!formationHandled && e.y > this.height) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.PROJECTILE) {
        if (this.isCrownClawProjectile(e)) {
          if (e.y < -80 || e.y > this.height + 80 || e.x < -80 || e.x > this.width + 80) {
            e.clawReturning = true;
          }
        } else if (e.shipAbilityKind === 'research-charge' && e.y < -e.height * 0.45) {
          this.detonateResearchCharge(e, e.x + e.width / 2, Math.max(54, e.height * 0.35));
        } else if (e.y < -50 || e.y > this.height + 50) {
          e.markedForDeletion = true;
        }
      }

      if (e.type === EntityType.PARTICLE) {
        (e as Particle).life--;
        if ((e as Particle).life <= 0) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.EFFECT) {
          (e as VisualEffect).life--;
          if ((e as VisualEffect).life <= 0) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.COIN) {
        const playerCenterX = this.player.x + this.player.width / 2;
        const playerCenterY = this.player.y + this.player.height / 2;
        const coinCenterX = e.x + e.width / 2;
        const coinCenterY = e.y + e.height / 2;
        const dx = playerCenterX - coinCenterX;
        const dy = playerCenterY - coinCenterY;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const hasMagnet = this.activePowerups.has(PowerupType.MAGNET);
        const radius = hasMagnet ? POWERUP_COIN_MAGNET_RADIUS : BASE_COIN_MAGNET_RADIUS;

        if (dist < radius) {
          const closeness = 1 - (dist / radius);
          const pull = hasMagnet ? 0.14 + closeness * 0.11 : 0.035 + closeness * 0.05;
          e.x += dx * pull;
          e.y += dy * pull;
        }
        if (e.y > this.height) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.POWERUP) {
          e.y += Math.sin(this.frameCount * 0.05) * 0.5;
          if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.BOMB) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.06) * 0.35;
          e.y += Math.sin(this.frameCount * 0.05) * 0.25;
          if (e.y > this.height) e.markedForDeletion = true;
      }

      if (e.type === EntityType.BOSS) {
        this.updateBoss(e);
      }
      if (e.type === EntityType.MINI_BOSS) {
        this.updateMiniBoss(e);
      }
    });

    this.checkCollisions();
    this.applyResearchBeamDamage();
    this.compactEntities();
    this.refreshLoadState();
    this.bgY = (this.bgY + 1) % this.height;
  }

  getGunPodOffsets() {
    return EMPTY_GUN_POD_OFFSETS;
  }

  getSquadCompanionVisuals(): SquadCompanionVisual[] {
    const size = this.mobileProfile ? 42 : 50;
    return this.squadCompanions.map((companion) => ({
      slot: companion.slot,
      id: companion.id,
      frames: companion.frames,
      frameIndex: companion.frameIndex,
      x: companion.x,
      y: companion.y,
      width: size,
      height: size,
      alpha: this.playerDrawAlpha * companion.entryProgress
    }));
  }

  private resetSquadCompanionPositions() {
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    const distance = clamp(this.player.width * 0.62, 58, 82);
    this.squadCompanions.forEach((companion, index) => {
      const side = companion.slot === 'left' ? -1 : 1;
      companion.x = centerX + side * distance;
      companion.y = centerY + 18 + index * 2;
      companion.frameIndex = 0;
      companion.entryProgress = 0;
    });
  }

  private updateSquadCompanions() {
    if (this.squadCompanions.length === 0) return;

    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    const distance = clamp(this.player.width * 0.62, 58, 82);
    const edgePadding = this.mobileProfile ? 24 : 30;
    const canFire = this.gameActive
      && this.lives > 0
      && this.introFlightFrames <= 0
      && this.deathSequenceFrames <= 0
      && this.waveDepartureFrames <= 0
      && !this.inBossWarningSequence;

    this.squadCompanions.forEach((companion, index) => {
      const side = companion.slot === 'left' ? -1 : 1;
      const targetX = clamp(centerX + side * distance, edgePadding, this.width - edgePadding);
      const targetY = clamp(
        centerY + 14 + Math.sin(this.frameCount * 0.055 + index * Math.PI) * 4,
        34,
        this.height - 34
      );
      companion.entryProgress = Math.min(1, companion.entryProgress + 0.045);
      companion.x += (targetX - companion.x) * 0.14;
      companion.y += (targetY - companion.y) * 0.14;
      companion.frameIndex = Math.floor(this.frameCount / 10 + index) % companion.frames.length;

      if (!canFire) return;
      companion.fireTimer--;
      if (companion.fireTimer > 0) return;
      this.spawnSquadCompanionBullet(companion);
      companion.fireTimer = companion.fireIntervalFrames;
    });
  }

  private spawnSquadCompanionBullet(companion: ActiveSquadCompanion) {
    if (this.livePlayerShotCount + this.pendingPlayerShots.length >= this.getPlayerShotCap()) return;

    const width = 7 + Math.min(3, companion.level - 1);
    const projectile = new Entity(
      EntityType.PROJECTILE,
      companion.x - width / 2,
      companion.y - (this.mobileProfile ? 24 : 28)
    );
    projectile.width = width;
    projectile.height = 20 + Math.min(8, companion.level * 2);
    projectile.vx = 0;
    projectile.vy = -(9.2 + companion.level * 0.22);
    projectile.color = companion.projectileColor;
    projectile.isPlayerShot = true;
    projectile.weaponKind = 'pulse';
    projectile.weaponVisualLevel = 0;
    projectile.weaponVisualStartFrame = this.frameCount;
    projectile.damage = companion.projectileDamage;
    this.entities.push(projectile);
    this.livePlayerShotCount++;

    if (!this.shouldUseLeanEffects()) {
      this.spawnBurst(companion.x, companion.y - 14, companion.projectileColor, 1, 0.8, 2);
    }
  }

  isBioBeamFiring() {
    return false;
  }

  private applyBioLaserPulse(level: number) {
    const beamWidth = 12 + Math.min(level, 7) * 2.4;
    const beamBox = {
      x: this.player.x + (this.player.width / 2) - (beamWidth / 2),
      y: 0,
      width: beamWidth,
      height: Math.max(0, this.player.y + this.player.height * 0.18)
    };
    let nearestTarget: Entity | null = null;

    for (let index = 0; index < this.entities.length; index++) {
      const target = this.entities[index];
      if (target.markedForDeletion || !this.isEnemyTarget(target)) continue;
      const box = this.getCollisionBox(target);
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      const intersects = Boolean(componentHit) || !(box.x > beamBox.x + beamBox.width
        || box.x + box.width < beamBox.x
        || box.y > beamBox.y + beamBox.height
        || box.y + box.height < beamBox.y);
      if (!intersects) continue;
      if (!nearestTarget || target.y + target.height > nearestTarget.y + nearestTarget.height) {
        nearestTarget = target;
      }
    }

    if (!nearestTarget) return;
    if (nearestTarget.type === EntityType.BOSS && this.isBossShielded()) {
      this.flashEntity(nearestTarget, 4);
      if (this.frameCount % 10 === 0) {
        this.spawnRingEffect(nearestTarget.x + nearestTarget.width / 2, nearestTarget.y + nearestTarget.height / 2, '#a7f3d0');
      }
      return;
    }

    const damageByLevel = [1, 1, 1, 1.3, 1.3, 2.4, 4.2, 7.5];
    const isBossTarget = nearestTarget.type === EntityType.BOSS || nearestTarget.type === EntityType.MINI_BOSS;
    const laserDamage = damageByLevel[Math.min(level, damageByLevel.length - 1)] * (isBossTarget ? 1.35 : 1);
    const componentHit = nearestTarget.type === EntityType.BOSS
      ? this.getBossComponentHit(nearestTarget, beamBox)
      : undefined;
    if (componentHit) this.damageBossComponent(nearestTarget, componentHit, laserDamage);
    else if (nearestTarget.type === EntityType.BOSS) this.damageBossHull(nearestTarget, laserDamage);
    else {
      nearestTarget.hp -= laserDamage;
      this.flashEntity(nearestTarget, isBossTarget ? 7 : 5);
    }
    const beamColor = level > 0 ? '#38bdf8' : '#65f59a';
    this.spawnBurst(
      nearestTarget.x + nearestTarget.width / 2,
      nearestTarget.y + nearestTarget.height / 2,
      beamColor,
      isBossTarget ? 4 : 2,
      1.8,
      2.6
    );
    if (nearestTarget.hp <= 0) this.handleEnemyDestroyed(nearestTarget);
  }

  countPlayerShots(includeQueued: boolean = false) {
    let count = includeQueued ? this.pendingPlayerShots.length : 0;
    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (
        !entity.markedForDeletion
        && ((entity.type === EntityType.PROJECTILE && entity.isPlayerShot) || entity.type === EntityType.MISSILE)
      ) {
        count++;
      }
    }
    return count;
  }

  getPlayerShotCap() {
    if (this.performanceMode || (this.mobileProfile && this.heavySceneLoad)) return MOBILE_LEAN_PLAYER_SHOT_CAP;
    return this.mobileProfile ? MOBILE_PLAYER_SHOT_CAP : DESKTOP_PLAYER_SHOT_CAP;
  }

  refreshLoadState() {
    let activePlayerShots = 0;
    let particles = 0;
    let effects = 0;
    let threats = 0;
    const homingTargets = this.homingTargetsBuffer;
    homingTargets.length = 0;

    for (let i = 0; i < this.entities.length; i++) {
      const entity = this.entities[i];
      if (entity.markedForDeletion) continue;

      if ((entity.type === EntityType.PROJECTILE && entity.isPlayerShot) || entity.type === EntityType.MISSILE) activePlayerShots++;
      else if (entity.type === EntityType.PARTICLE) particles++;
      else if (entity.type === EntityType.EFFECT) effects++;

      if (this.isEnemyTarget(entity)) {
        threats++;
        homingTargets.push(entity);
      }
    }

    const playerShots = activePlayerShots + this.pendingPlayerShots.length;
    this.livePlayerShotCount = activePlayerShots;
    this.liveParticleCount = particles;
    this.liveEffectCount = effects;
    this.liveThreatCount = threats;

    this.heavySceneLoad = this.mobileProfile && (
      this.performanceMode
      || playerShots >= MOBILE_LEAN_PLAYER_SHOT_CAP
      || particles >= MOBILE_PARTICLE_CAP * 0.7
      || effects >= MOBILE_EFFECT_CAP * 0.75
      || threats >= MOBILE_THREAT_CAP * 0.82
      || this.entities.length >= 132
    );
  }

  shouldUseLeanEffects() {
    return this.performanceMode || (this.mobileProfile && this.heavySceneLoad);
  }

  spawnPlayerBullet(
    speed: number,
    offsetX: number = 0,
    yOffset: number = 0,
    angleBias: number = 0,
    pitchOffset: number = 0,
    playSound: boolean = true,
    weaponKind: PlayerWeaponKind = 'pulse'
  ) {
    if (this.livePlayerShotCount + this.pendingPlayerShots.length >= this.getPlayerShotCap()) {
      return false;
    }

    const isBioLaser = weaponKind === 'bio-laser';
    const isEthShard = weaponKind === 'eth-shard';
    const isBtcHash = weaponKind === 'btc-hash';
    const isNova = weaponKind === 'nova';
    const isSingularity = weaponKind === 'singularity';
    const bioLaserLevel = isBioLaser ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const ethShardLevel = isEthShard ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const btcHashLevel = isBtcHash ? Math.min(this.stats.upgrades.fireRate || 0, 7) : 0;
    const bulletColor = isBioLaser
      ? '#b7ff68'
      : isEthShard
        ? '#a78bfa'
      : isBtcHash
        ? '#fbbf24'
      : isSingularity
        ? '#a78bfa'
        : isNova
          ? '#facc15'
          : weaponKind === 'ion'
            ? '#f0abfc'
            : weaponKind === 'plasma'
              ? '#22d3ee'
              : '#6c63ff';
    const bulletWidth = isBioLaser
      ? Math.round(5 + bioLaserLevel * 2.3)
      : isEthShard
        ? Math.round(13 + ethShardLevel * 2.1)
      : isBtcHash
        ? Math.round(12 + btcHashLevel * 1.9)
      : isSingularity
        ? 40
        : isNova
          ? 32
          : weaponKind === 'ion'
            ? 24
            : weaponKind === 'plasma'
              ? 14
              : 10;
    const b = new Entity(EntityType.PROJECTILE, this.player.x + this.player.width / 2 - bulletWidth / 2 + offsetX, this.player.y + this.player.height * 0.12 + yOffset);
    const angle = angleBias;
    b.width = bulletWidth;
    b.height = isBioLaser
      ? Math.round(34 + bioLaserLevel * 6)
      : isEthShard
        ? Math.round(30 + ethShardLevel * 4.5)
      : isBtcHash
        ? Math.round(32 + btcHashLevel * 4.8)
      : isSingularity
        ? 82
        : isNova
          ? 68
          : weaponKind === 'ion'
            ? 54
            : weaponKind === 'plasma'
              ? 34
              : 28;
    b.vx = Math.sin(angle) * speed;
    b.vy = -Math.cos(angle) * speed;
    b.color = bulletColor;
    b.isPlayerShot = true;
    b.weaponKind = weaponKind;
    b.weaponVisualLevel = 0;
    b.weaponVisualStartFrame = this.frameCount;
    b.damage = isBioLaser
      ? 0.9 + bioLaserLevel * 0.55
      : isEthShard
        ? 1.15 + ethShardLevel * 0.48
      : isBtcHash
        ? 1.3 + btcHashLevel * 0.54
      : isSingularity
        ? 7.5
        : isNova
          ? 4.2
          : weaponKind === 'ion'
            ? 2.4
            : weaponKind === 'plasma'
              ? 1.3
              : 1;
    if (weaponKind === 'ion' || isNova || isSingularity || (isBioLaser && bioLaserLevel >= 3) || (isEthShard && ethShardLevel >= 4) || (isBtcHash && btcHashLevel >= 3)) {
      b.pierceRemaining = isBioLaser
        ? Math.min(5, 1 + Math.floor((bioLaserLevel - 3) / 2))
        : isEthShard
          ? Math.min(4, 1 + Math.floor((ethShardLevel - 4) / 2))
        : isBtcHash
          ? Math.min(5, 1 + Math.floor((btcHashLevel - 3) / 2))
        : isSingularity
          ? 10
          : isNova
            ? 6
            : 3;
      b.hitTargetIds = new Set<string>();
    }
    this.entities.push(b);
    this.livePlayerShotCount++;
    if (playSound) {
      this.playSound('shoot', 1, {
        pitchJitter: isBioLaser ? 0.055 : isEthShard ? 0.07 : isBtcHash ? 0.045 : isSingularity ? 0.035 : isNova ? 0.05 : weaponKind === 'ion' ? 0.08 : 0.06,
        pitchOffset: pitchOffset + (isBioLaser ? -0.22 - bioLaserLevel * 0.018 : isEthShard ? 0.16 + ethShardLevel * 0.012 : isBtcHash ? -0.12 - btcHashLevel * 0.01 : isSingularity ? -0.36 : isNova ? -0.28 : weaponKind === 'ion' ? -0.18 : weaponKind === 'plasma' ? -0.04 : -0.12)
      });
    }
    return true;
  }

  queuePlayerBullet(shot: PendingPlayerShot) {
    if (this.pendingPlayerShots.length >= PENDING_PLAYER_SHOT_CAP) return;
    if (this.livePlayerShotCount + this.pendingPlayerShots.length >= this.getPlayerShotCap()) return;
    this.pendingPlayerShots.push(shot);
  }

  flushPendingPlayerShots() {
    if (this.pendingPlayerShots.length === 0) return;

    for (let index = 0; index < this.pendingPlayerShots.length; index++) {
      const shot = this.pendingPlayerShots[index];
      if (shot.fireFrame > this.frameCount) continue;

      this.pendingPlayerShots.splice(index, 1);
      this.spawnPlayerBullet(shot.speed, shot.offsetX, shot.yOffset, shot.angleBias, shot.pitchOffset, shot.playSound ?? true, shot.weaponKind);
      index--;
    }
  }

  fireBullet() {
    if (this.frameCount - this.lastShotFrame > 3) {
      this.kickPlayerSquash(-0.035);
      this.spawnBurst(this.player.x + this.player.width / 2, this.player.y + this.player.height * 0.18, '#67e8f9', 2, 1.3, 3);
      this.addShake(0.08);
    }
    this.lastShotFrame = this.frameCount;
    this.weaponVolley++;

    this.playerVel.y += 0.2;
    this.playerVel.x += randomRange(-0.05, 0.05);
    const weaponKind: PlayerWeaponKind = 'pulse';
    const weaponSpeed = 10;
    this.spawnPlayerBullet(weaponSpeed, 0, 0, getRandomPrimaryShotAngle(), -0.04, true, weaponKind);

    const lean = this.shouldUseLeanEffects();
    const overdriveSpread = this.activePowerups.has(PowerupType.DOUBLE_SHOT)
      || this.activePowerups.has(PowerupType.TRIPLE_SHOT);
    if (overdriveSpread) {
      [-1, 1].forEach((side, index) => {
        this.queuePlayerBullet({
          fireFrame: this.frameCount + index + 1,
          speed: weaponSpeed,
          offsetX: side * 4,
          yOffset: 4,
          angleBias: side * (Math.PI / 6),
          pitchOffset: side < 0 ? -0.01 : 0.03,
          weaponKind,
          playSound: !lean
        });
      });
    }
  }
  
  fireMissile() {
      // Check if max level (5)
      const isMaxLevel = this.stats.upgrades.missile >= 5;
      this.kickPlayerSquash(-0.075);
      this.addShake(isMaxLevel ? 0.7 : 0.38);
      
      const m = new Entity(EntityType.MISSILE, this.player.x + this.player.width/2 - 5, this.player.y);
      m.width = 10;
      m.height = 20;
      m.isMissile = true;
      m.vy = -4; // Initial velocity up
      
      // Max level is Neon Pink/Red, Standard is Cyan
      m.color = isMaxLevel ? '#ff0055' : '#00ffff'; 
      
      m.isPlayerShot = true; // Mark as player shot
      this.entities.push(m);
      this.livePlayerShotCount++;
      this.playSound('missile');
  }

  addFlaskChargeFromCoin() {
    if (FLASK_CHARGE_PER_COIN <= 0) return;

    const currentMax = this.stats.bombChargeMax || BASE_FLASK_CHARGE_MAX;
    const previousCharge = this.stats.bombCharge || 0;
    const previousFlasks = getFlaskProgress(previousCharge, currentMax).storedFlasks;
    const nextCharge = previousCharge + FLASK_CHARGE_PER_COIN;
    const nextFlasks = getFlaskProgress(nextCharge, currentMax).storedFlasks;

    if (nextFlasks > previousFlasks) {
      this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 10, `FLASK +${nextFlasks}`, '#34d399', 18);
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#facc15');
      this.playSound('powerup');
    }

    this.stats.bombCharge = nextCharge;
  }

  triggerBomb() {
    if ((this.stats.bombs || 0) <= 0 || !this.gameActive || this.introFlightFrames > 0 || this.deathSequenceFrames > 0 || this.waveDepartureFrames > 0) {
      return false;
    }

    this.lastBombFrame = this.frameCount;
    this.stats.bombs = Math.max(0, (this.stats.bombs || 0) - 1);
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;
    this.flashAlpha = Math.max(this.flashAlpha, 0.36);
    this.addShake(11);
    this.addHitStop(8);
    this.spawnRingEffect(cx, cy, '#facc15');
    this.spawnFloatingText(cx, cy - 48, 'RSC BLAST', '#facc15', 22);
    this.spawnBurst(cx, cy, '#facc15', 30, 8, 6);
    this.playSound('bomb');

    const targets = this.enemyTargetsBuffer;
    targets.length = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && this.isEnemyTarget(entity)) {
        targets.push(entity);
      }
    }

    this.isBombResolving = true;
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index];
      const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.flashEntity(target, 8);
        this.spawnRingEffect(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0');
        this.spawnFloatingText(target.x + target.width / 2, target.y + target.height * 0.22, 'SHIELDS UP', '#a7f3d0', 16);
        continue;
      }
      const bombDamage = target.type === EntityType.BOSS
        ? BOMB_DAMAGE_BOSS
        : target.type === EntityType.MINI_BOSS
          ? BOMB_DAMAGE_MINI_BOSS
          : target.type === EntityType.ENEMY_INVADER
            ? BOMB_DAMAGE_INVADER
            : 999;
      if (target.type === EntityType.BOSS) this.damageBossHull(target, bombDamage);
      else target.hp -= bombDamage;
      this.flashEntity(target, isBossTarget ? 10 : 6);
      this.spawnBurst(target.x + target.width / 2, target.y + target.height / 2, '#fef08a', isBossTarget ? 8 : 5, 4.5, 4);

      if (target.hp <= 0) {
        this.handleEnemyDestroyed(target);
      }
    }
    this.isBombResolving = false;

    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) {
        entity.markedForDeletion = true;
      }
    }

    return true;
  }

  triggerShipAbility() {
    const isResearchHubShip = this.playerShipUrl === ASSETS.PLAYER_SHIP;
    if (
      !isResearchHubShip
      || (this.stats.shipAbilityCooldown || 0) > 0
      || !this.gameActive
      || this.introFlightFrames > 0
      || this.deathSequenceFrames > 0
      || this.waveDepartureFrames > 0
    ) {
      return false;
    }

    const projectile = new Entity(
      EntityType.PROJECTILE,
      this.player.x + this.player.width / 2 - 38,
      this.player.y - 82
    );
    projectile.width = 76;
    projectile.height = 92;
    projectile.vx = 0;
    projectile.vy = -7.2;
    projectile.color = '#67e8f9';
    projectile.isPlayerShot = true;
    projectile.damage = 0;
    projectile.shipAbilityKind = 'research-charge';
    projectile.projectileVisualKind = 'research-charge';
    projectile.spriteFrames = [...RESEARCH_CHARGE_FRAME_URLS];
    projectile.weaponVisualStartFrame = this.frameCount;
    this.entities.push(projectile);

    this.stats.shipAbilityCooldown = RESEARCH_CHARGE_COOLDOWN_FRAMES;
    this.stats.shipAbilityCooldownMax = RESEARCH_CHARGE_COOLDOWN_FRAMES;
    this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + 8, '#67e8f9');
    this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 24, 'RESEARCH CHARGE', '#a7f3d0', 17);
    this.spawnBurst(this.player.x + this.player.width / 2, this.player.y, '#67e8f9', 10, 4.2, 4);
    this.addShake(2.5);
    this.playSound('powerup');
    return true;
  }

  detonateResearchCharge(projectile: Entity, centerX: number, centerY: number) {
    if (projectile.markedForDeletion) return;
    projectile.markedForDeletion = true;

    const impact = new VisualEffect(centerX - 86, centerY - 86, 'sprite', '', '#ffffff');
    impact.width = 172;
    impact.height = 172;
    impact.spriteFrames = [...RESEARCH_IMPACT_FRAME_URLS];
    impact.life = 42;
    impact.maxLife = 42;
    this.entities.push(impact);

    this.flashAlpha = Math.max(this.flashAlpha, 0.28);
    this.addShake(7);
    this.addHitStop(5);
    this.spawnRingEffect(centerX, centerY, '#a7f3d0');
    this.spawnBurst(centerX, centerY, '#67e8f9', 24, 7, 5);
    this.playSound('bomb', 0.72, { pitchJitter: 0.04, pitchOffset: 0.12 });

    const radiusSq = RESEARCH_CHARGE_BLAST_RADIUS * RESEARCH_CHARGE_BLAST_RADIUS;
    const targets = this.entities.filter((entity) => !entity.markedForDeletion && this.isEnemyTarget(entity));
    for (const target of targets) {
      const dx = target.x + target.width / 2 - centerX;
      const dy = target.y + target.height / 2 - centerY;
      const targetAllowance = Math.min(46, Math.max(target.width, target.height) * 0.25);
      const effectiveRadius = RESEARCH_CHARGE_BLAST_RADIUS + targetAllowance;
      if ((dx * dx + dy * dy) > Math.max(radiusSq, effectiveRadius * effectiveRadius)) continue;

      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.flashEntity(target, 7);
        continue;
      }

      const damage = target.type === EntityType.BOSS
        ? 10
        : target.type === EntityType.MINI_BOSS
          ? 18
          : target.type === EntityType.ENEMY_INVADER
            ? 22
            : 999;
      if (target.type === EntityType.BOSS) this.damageBossHull(target, damage);
      else target.hp -= damage;
      this.flashEntity(target, target.type === EntityType.BOSS ? 7 : 5);
      this.spawnBurst(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0', 5, 3.6, 3);
      if (target.hp <= 0) this.handleEnemyDestroyed(target);
    }
  }

  isEnemyTarget(entity: Entity) {
    return entity.type === EntityType.ENEMY_DRONE
      || entity.type === EntityType.ENEMY_BRICK
      || entity.type === EntityType.ENEMY_JOURNAL
      || entity.type === EntityType.ENEMY_SWARM
      || entity.type === EntityType.BOSS
      || entity.type === EntityType.MINI_BOSS
      || entity.type === EntityType.ENEMY_INVADER;
  }

  flashEntity(entity: Entity, frames: number = 8) {
    entity.flashFrames = Math.max(entity.flashFrames, frames);
  }

  pulseDamageFlash(entity: Entity, frames: number = BOSS_DAMAGE_FLASH_FRAMES) {
    if (this.frameCount - entity.lastDamageFlashFrame < BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES) return;
    entity.lastDamageFlashFrame = this.frameCount;
    this.flashEntity(entity, frames);
  }

  pulseBossComponentFlash(component: BossComponentState, frames: number = BOSS_DAMAGE_FLASH_FRAMES) {
    if (this.frameCount - component.lastDamageFlashFrame < BOSS_DAMAGE_FLASH_COOLDOWN_FRAMES) return;
    component.lastDamageFlashFrame = this.frameCount;
    component.flashFrames = Math.max(component.flashFrames, frames);
  }

  getBossShieldCount() {
    let count = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.ENEMY_SWARM && entity.formation === 'orbit') {
        count++;
      }
    }
    return count;
  }

  isBossShielded() {
    return this.getBossShieldCount() > 0;
  }

  clearBossShieldRing() {
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (entity.type === EntityType.ENEMY_SWARM && entity.formation === 'orbit') {
        entity.markedForDeletion = true;
      }
    }
  }

  spawnBossShieldRing(boss: Entity, phase: number, configuredCount?: number) {
    const count = Number.isFinite(configuredCount)
      ? Math.max(0, Math.floor(configuredCount as number))
      : Math.min(this.mobileProfile ? 5 : 8, 3 + phase);
    const hp = getBossShieldEscortHp(phase);
    const escortSize = this.mobileProfile
      ? BOSS_SHIELD_ESCORT_MOBILE_SIZE
      : BOSS_SHIELD_ESCORT_DESKTOP_SIZE;

    for (let i = 0; i < count; i++) {
      const shield = new Entity(EntityType.ENEMY_SWARM, boss.x + boss.width / 2, boss.y + boss.height / 2);
      shield.width = escortSize.width;
      shield.height = escortSize.height;
      shield.hp = hp;
      shield.maxHp = hp;
      shield.color = '#a7f3d0';
      shield.formation = 'orbit';
      shield.formationIndex = i;
      shield.formationSeed = (Math.PI * 2 * i) / count;
      shield.shieldHostId = boss.id;
      shield.variant = 300 + i;
      shield.sourceEventId = boss.sourceEventId;
      shield.sourceItemId = boss.sourceItemId;
      this.entities.push(shield);
    }

    this.spawnFloatingText(this.width / 2, Math.max(92, this.height * 0.16), 'SHIELD RING!', '#a7f3d0', this.mobileProfile ? 17 : 22);
  }

  handleEnemyDestroyed(target: Entity) {
    if (target.markedForDeletion) return;

    target.markedForDeletion = true;
    const destructionIntensity = target.type === EntityType.BOSS
      ? 2.2
      : target.type === EntityType.MINI_BOSS
        ? 1.45
        : target.type === EntityType.ENEMY_INVADER || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_JOURNAL
          ? 0.9
          : 0.58;
    this.spawnExplosion(target.x, target.y, target.color, destructionIntensity);
    this.stats.enemiesDefeated++;
    const configuredScoreMultiplier = Number(this.getCurrentWaveDefinition()?.scoreMultiplier);
    const waveMult = Number.isFinite(configuredScoreMultiplier) && configuredScoreMultiplier > 0
      ? configuredScoreMultiplier
      : Math.pow(2, this.stats.wave - 1);
    let basePoints = 10;
    if (target.type === EntityType.ENEMY_DRONE) basePoints = 10;
    if (target.type === EntityType.ENEMY_SWARM) basePoints = 12;
    if (target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_INVADER) basePoints = 20;
    if (target.type === EntityType.ENEMY_JOURNAL) basePoints = 30;

    const hasConfiguredBossReward = (target.type === EntityType.MINI_BOSS || target.type === EntityType.BOSS)
      && Number.isFinite(target.scoreReward);
    const points = hasConfiguredBossReward
      ? 0
      : Number.isFinite(target.scoreValue)
        ? Math.max(0, target.scoreValue as number)
        : basePoints * waveMult;
    this.stats.score += points;
    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    if (points > 0) this.spawnFloatingText(centerX, centerY - 10, `+${points}`, '#67e8f9', 16);
    if (target.type !== EntityType.BOSS) {
      this.spawnCoin(target.x + target.width / 2, target.y + target.height / 2);
    }
    if (target.type === EntityType.ENEMY_SWARM && target.formation === 'orbit') {
      this.spawnFloatingText(centerX, centerY - 26, 'SHIELD -1', '#a7f3d0', 14);
      this.spawnRingEffect(centerX, centerY, '#a7f3d0');
    }
    const isElite = target.type === EntityType.ENEMY_JOURNAL
      || target.type === EntityType.ENEMY_BRICK
      || target.type === EntityType.MINI_BOSS
      || target.type === EntityType.ENEMY_INVADER;
    this.addHitStop(isElite ? 4 : 2);
    this.addShake(isElite ? 1.8 : 0.7);
    this.spawnBurst(centerX, centerY, isElite ? '#facc15' : target.color, isElite ? 12 : 6, isElite ? 5.2 : 3.2, isElite ? 5 : 3);
    const configuredPowerupDropChance = Number(target.powerupDropChance);
    const powerupDropChance = Number.isFinite(configuredPowerupDropChance)
      ? clamp(configuredPowerupDropChance, 0, 1)
      : isElite ? 0.08 : 0;
    if (target.type !== EntityType.BOSS && powerupDropChance > 0 && Math.random() < powerupDropChance) {
      this.spawnPowerup(target.x, target.y);
    }
    if (target.type !== EntityType.BOSS && !this.isBombResolving && (this.stats.bombs || 0) < MAX_BOMBS) {
      const dropChance = isElite ? ELITE_BOMB_DROP_CHANCE : BOMB_DROP_CHANCE;
      if (Math.random() < dropChance) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
    }

    if (target.type === EntityType.MINI_BOSS) {
      const reward = Number.isFinite(target.scoreReward) ? Math.max(0, target.scoreReward as number) : 500 * waveMult;
      this.stats.score += reward;
      this.spawnFloatingText(centerX, centerY - 42, `+${reward}`, '#fef08a', 22);
      this.addHitStop(8);
      this.addShake(4.2);
      if (!Number.isFinite(target.powerupDropChance)) {
        const miniBossPowerupDrops = this.stats.wave >= 2 ? 2 : 1;
        for (let i = 0; i < miniBossPowerupDrops; i++) {
          this.spawnPowerup(
            target.x + (target.width * ((i + 1) / (miniBossPowerupDrops + 1))),
            target.y + Math.random() * target.height
          );
        }
      }
      if ((this.stats.bombs || 0) < MAX_BOMBS && Math.random() < MINI_BOSS_BOMB_REWARD_CHANCE) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
      const remainingMiniBosses = this.getActiveMiniBosses();
      this.miniBossRef = remainingMiniBosses[0] ?? null;
      if (remainingMiniBosses.length === 0) this.waveProgressFrames += 120;
    }

    if (target.type === EntityType.BOSS) {
      if (this.waveTransitionPending) return;

      const reward = Number.isFinite(target.scoreReward) ? Math.max(0, target.scoreReward as number) : 1000 * waveMult;
      this.stats.score += reward;
      this.spawnFloatingText(centerX, centerY - 52, `+${reward}`, '#fef08a', 24);
      this.flashAlpha = Math.max(this.flashAlpha, 0.26);
      this.addHitStop(12);
      this.addShake(6.5);
      this.clearBossShieldRing();
      this.bossRef = null;
      this.mainBossDefeated = true;
      this.waveTransitionPending = true;
      this.inBossWarningSequence = false;
      this.pendingBossType = null;
      this.bossWarningFrame = 0;
      this.playSound('electricity');

      this.waveVictorySummary = this.buildWaveVictorySummary();

      this.spawnFloatingText(this.width / 2, this.height / 2, "WAVE COMPLETE!", "#00FF00");
      const configuredDelay = Number(this.getCurrentWaveDefinition()?.delayAfterSeconds);
      this.waveDepartureDuration = Number.isFinite(configuredDelay) && configuredDelay >= 0
        ? Math.max(1, Math.round(configuredDelay * GAME_CONFIG.FPS))
        : 168;
      this.waveDepartureFrames = this.waveDepartureDuration;
    }
  }

  applyResearchBeamDamage() {
    if (!this.activePowerups.has(PowerupType.RESEARCH_BEAM) || this.frameCount % 2 !== 0) return;

    const beamWidth = this.width < 520 ? 46 : 56;
    const beamBox = {
      x: this.player.x + (this.player.width / 2) - (beamWidth / 2),
      y: 0,
      width: beamWidth,
      height: Math.max(0, this.player.y + this.player.height * 0.18)
    };

    const intersectsBeam = (target: Entity) => {
      const box = this.getCollisionBox(target);
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      return Boolean(componentHit) || !(box.x > beamBox.x + beamBox.width
        || box.x + box.width < beamBox.x
        || box.y > beamBox.y + beamBox.height
        || box.y + box.height < beamBox.y);
    };

    this.entities.forEach((target) => {
      if (target.markedForDeletion || !this.isEnemyTarget(target) || !intersectsBeam(target)) return;

      const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS || target.type === EntityType.ENEMY_INVADER;
      if (target.type === EntityType.BOSS && this.isBossShielded()) {
        this.flashEntity(target, 4);
        if (this.frameCount % 10 === 0) {
          this.spawnRingEffect(target.x + target.width / 2, target.y + target.height / 2, '#a7f3d0');
        }
        return;
      }

      const beamDamage = isBossTarget ? 0.9 : 1.45;
      const componentHit = target.type === EntityType.BOSS
        ? this.getBossComponentHit(target, beamBox)
        : undefined;
      if (componentHit) this.damageBossComponent(target, componentHit, beamDamage);
      else if (target.type === EntityType.BOSS) this.damageBossHull(target, beamDamage);
      else {
        target.hp -= beamDamage;
        this.flashEntity(target, isBossTarget ? 5 : 4);
      }

      if (this.frameCount % 8 === 0) {
        this.entities.push(new Particle(target.x + target.width / 2, target.y + target.height / 2, '#a855f7', 1.8));
      }

      if (target.hp <= 0) {
        this.handleEnemyDestroyed(target);
      }
    });
  }

  updateEnemyFire() {
    if (this.stats.isBossActive || this.inBossWarningSequence || this.deathSequenceFrames > 0) return;
    this.updateEliteEnemyFire();
    if (this.wave < 2) return;

    const baseFireInterval = Math.max(42, 118 - ((this.wave - 2) * 18));
    const difficultyMultiplier = this.getConfiguredSpawnEvents().length > 0
      ? this.getCurrentDifficultyMultiplier()
      : 1;
    const fireInterval = Math.max(1, Math.round(baseFireInterval / difficultyMultiplier));
    if (this.frameCount % fireInterval !== 0) return;

    let activeEnemyShots = 0;
    for (let index = 0; index < this.entities.length; index++) {
      const entity = this.entities[index];
      if (!entity.markedForDeletion && entity.type === EntityType.PROJECTILE && !entity.isPlayerShot) activeEnemyShots++;
    }
    if (activeEnemyShots >= Math.min(12, 4 + this.wave * 2)) return;

    const candidates = this.homingTargetsBuffer;
    if (candidates.length === 0) return;

    const startIndex = Math.floor(this.frameCount / fireInterval) % candidates.length;
    let source: Entity | null = null;
    for (let offset = 0; offset < candidates.length; offset++) {
      const candidate = candidates[(startIndex + offset) % candidates.length];
      if (
        candidate.markedForDeletion
        || candidate.isElite
        || candidate.formation === 'orbit'
        || candidate.y < 38
        || candidate.y > this.height * 0.58
        || (candidate.type !== EntityType.ENEMY_DRONE && candidate.type !== EntityType.ENEMY_JOURNAL && candidate.type !== EntityType.ENEMY_SWARM)
      ) continue;
      source = candidate;
      break;
    }
    if (!source) return;

    const sourceX = source.x + source.width / 2;
    const sourceY = source.y + source.height * 0.72;
    const targetX = this.player.x + this.player.width / 2 + this.playerVel.x * 7;
    const targetY = this.player.y + this.player.height / 2;
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const speed = Math.min(7.2, 4.5 + this.wave * 0.42);
    const shot = new Entity(EntityType.PROJECTILE, sourceX - 5, sourceY);
    shot.width = this.wave >= 4 ? 12 : 10;
    shot.height = this.wave >= 4 ? 12 : 10;
    shot.vx = (dx / length) * speed;
    shot.vy = (dy / length) * speed;
    shot.color = source.type === EntityType.ENEMY_JOURNAL ? '#f472b6' : this.wave >= 4 ? '#fbbf24' : '#fb7185';
    shot.isPlayerShot = false;
    shot.damage = Math.max(1, Number(source.projectileDamage) || 1);
    this.entities.push(shot);
  }

  updateEliteEnemyFire() {
    let activeEnemyShots = this.entities.reduce((count, entity) => (
      count + (!entity.markedForDeletion && entity.type === EntityType.PROJECTILE && !entity.isPlayerShot ? 1 : 0)
    ), 0);
    const shotCap = Math.min(18, 7 + this.wave * 2);

    for (const source of this.entities) {
      if (
        source.markedForDeletion
        || !source.isElite
        || source.eliteAttackPattern !== 'aimed-burst'
        || source.y < 24
        || source.y > this.height * 0.68
      ) continue;

      source.attackTimer++;
      const interval = Math.max(18, source.attackIntervalFrames ?? 92);
      if (source.attackTimer < interval || activeEnemyShots >= shotCap) continue;
      source.attackTimer = 0;

      const sourceX = source.x + source.width / 2;
      const sourceY = source.y + source.height * 0.72;
      const targetX = this.player.x + this.player.width / 2 + this.playerVel.x * 5;
      const targetY = this.player.y + this.player.height / 2;
      const baseAngle = Math.atan2(targetY - sourceY, targetX - sourceX);
      const burstCount = Math.max(1, source.configuredBurstCount ?? 3);
      const speed = source.projectileSpeed ?? 4.8;
      const spread = burstCount <= 1 ? 0 : 0.14;

      for (let index = 0; index < burstCount && activeEnemyShots < shotCap; index++) {
        const centeredIndex = index - ((burstCount - 1) / 2);
        const angle = baseAngle + centeredIndex * spread;
        const shot = new Entity(EntityType.PROJECTILE, sourceX - 7, sourceY);
        shot.width = 14;
        shot.height = 20;
        shot.vx = Math.cos(angle) * speed;
        shot.vy = Math.sin(angle) * speed;
        shot.color = '#a78bfa';
        shot.isPlayerShot = false;
        shot.damage = Math.max(1, Number(source.projectileDamage) || 1);
        shot.projectileVisualKind = 'boss-bolt';
        shot.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
        shot.sourceEventId = source.sourceEventId;
        this.entities.push(shot);
        activeEnemyShots++;
      }

      this.playSound('boss_shoot', 1.08, { pitchJitter: 0.08, pitchOffset: 0.14 });
      this.flashEntity(source, 3);
    }
  }

  resolveSpriteUrl(spriteKey: AssetKey | string | undefined, entityType: EntityType) {
    if (spriteKey?.startsWith('/')) return spriteKey;
    if (spriteKey) {
      try {
        const catalogPath = getPrimaryAssetPath(spriteKey as AssetKey);
        if (catalogPath) {
          // Catalog images created by the local Director are loaded only when a
          // configured entity first resolves them, never in the eager preload.
          loadImage(catalogPath);
          return catalogPath;
        }
      } catch {
        // The validated campaign only supplies catalog keys; legacy callers may not.
      }
    }
    const normalized = String(spriteKey || '').toLowerCase();
    if (normalized.includes('journal')) return ASSETS.ENEMY_JOURNAL;
    if (normalized.includes('swarm')) return ASSETS.ENEMY_SWARM_FRAMES[0];
    if (normalized.includes('asteroid')) return ASSETS.ASTEROID_BELT_FRAMES[0];
    if (normalized.includes('brick') || normalized.includes('bulwark')) return ASSETS.ENEMY_BRICK_FRAMES[0];
    if (normalized.includes('mini') || normalized.includes('bottleneck')) return ASSETS.MINI_BOSS;
    if (normalized.includes('wall') || normalized.includes('paywall')) return ASSETS.PAYWALL_BASTION_FRAMES[1];
    if (normalized.includes('gate') || normalized.includes('sentinel') || normalized.includes('final')) return ASSETS.FINAL_BOSS;
    if (normalized.includes('drone')) return ASSETS.ENEMY_DRONE_FRAMES[0];

    if (entityType === EntityType.ENEMY_JOURNAL) return ASSETS.ENEMY_JOURNAL;
    if (entityType === EntityType.ENEMY_SWARM) return ASSETS.ENEMY_SWARM_FRAMES[0];
    if (entityType === EntityType.ENEMY_BRICK) return ASSETS.ENEMY_BRICK_FRAMES[0];
    if (entityType === EntityType.MINI_BOSS) return ASSETS.MINI_BOSS;
    if (entityType === EntityType.ENEMY_INVADER) return ASSETS.PAYWALL_BASTION_FRAMES[1];
    if (entityType === EntityType.BOSS) return ASSETS.FINAL_BOSS;
    return ASSETS.ENEMY_DRONE_FRAMES[0];
  }

  resolveSpriteFrames(spriteKey: AssetKey | string | undefined) {
    if (!spriteKey || spriteKey.startsWith('/')) return undefined;
    try {
      const paths = getAssetPaths(spriteKey as AssetKey);
      if (paths.length > 1) {
        paths.forEach(loadImage);
        return [...paths];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  resolveConfiguredEnemyType(enemyId: string) {
    const normalized = String(enemyId || '').toLowerCase();
    if (normalized.includes('journal')) return EntityType.ENEMY_JOURNAL;
    if (normalized.includes('swarm')) return EntityType.ENEMY_SWARM;
    if (normalized.includes('brick') || normalized.includes('asteroid')) return EntityType.ENEMY_BRICK;
    return EntityType.ENEMY_DRONE;
  }

  pickConfiguredEnemy(event: RuntimeSpawnEvent) {
    const enemies = Array.isArray(event.enemies) ? event.enemies : [];
    if (enemies.length === 0) return null;
    const totalWeight = enemies.reduce((sum, enemy) => sum + Math.max(0, Number(enemy.weight) || 0), 0);
    if (totalWeight <= 0) return enemies[0];
    let roll = Math.random() * totalWeight;
    for (const enemy of enemies) {
      roll -= Math.max(0, Number(enemy.weight) || 0);
      if (roll <= 0) return enemy;
    }
    return enemies[enemies.length - 1];
  }

  getConfiguredSpawnAnchor(event?: { spawnAnchor?: { x: number; y: number } }) {
    const x = Number(event?.spawnAnchor?.x);
    const y = Number(event?.spawnAnchor?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1)
    };
  }

  getAnchoredTopLeft(
    event: { spawnAnchor?: { x: number; y: number } } | undefined,
    entityWidth: number,
    entityHeight: number
  ) {
    const anchor = this.getConfiguredSpawnAnchor(event);
    if (!anchor) return null;
    return {
      x: (anchor.x * this.width) - (entityWidth / 2),
      y: (anchor.y * this.height) - (entityHeight / 2)
    };
  }

  getFormationGroupSeed(eventId: string) {
    let hash = 0;
    for (let index = 0; index < eventId.length; index++) {
      hash = ((hash << 5) - hash + eventId.charCodeAt(index)) | 0;
    }
    return Math.abs(hash % 10000);
  }

  resolveConfiguredFormationMode(patternId?: string): ConfiguredEnemyFormationMode {
    const pattern = String(patternId || 'row').toLowerCase();
    if (pattern.includes('grid') || pattern.includes('wall')) return 'grid';
    if (pattern.includes('diamond')) return 'diamond';
    if (pattern.includes('spiral')) return 'spiral';
    if (pattern.includes('pincer')) return 'pincer';
    if (pattern.includes('sine') || pattern.includes('wave')) return 'sine';
    if (pattern.includes('v')) return 'v';
    return 'row';
  }

  getConfiguredFormationTarget(
    event: RuntimeSpawnEvent,
    index: number,
    count: number,
    entityWidth: number,
    entityHeight: number
  ) {
    const mode = this.resolveConfiguredFormationMode(event.patternId);
    const anchor = this.getConfiguredSpawnAnchor(event);
    const centerX = (anchor?.x ?? 0.5) * this.width;
    const topY = (anchor?.y ?? 0.16) * this.height;
    const left = Math.max(entityWidth * 0.6, 24);
    const right = Math.max(left, this.width - left);
    const mobile = this.width < 520;
    let targetCenterX = centerX;
    let targetCenterY = topY;

    if (mode === 'grid') {
      const columns = Math.min(mobile ? 5 : 8, Math.max(3, Math.ceil(Math.sqrt(count * 1.45))));
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      const gapX = Math.min(mobile ? 58 : 70, (this.width - left * 2) / Math.max(1, columns - 1));
      targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX;
      targetCenterY = topY + row * (mobile ? 48 : 56);
    } else if (mode === 'v') {
      const squadSize = Math.min(7, count);
      const squad = Math.floor(index / squadSize);
      const localIndex = index % squadSize;
      const localCount = Math.min(squadSize, count - squad * squadSize);
      const offset = localIndex - (localCount - 1) / 2;
      const gapX = Math.min(mobile ? 48 : 58, (this.width - left * 2) / Math.max(1, localCount - 1));
      targetCenterX = centerX + offset * gapX;
      targetCenterY = topY + squad * (mobile ? 70 : 78) + Math.abs(offset) * (mobile ? 17 : 20);
    } else if (mode === 'diamond') {
      const squadSize = Math.min(8, count);
      const squad = Math.floor(index / squadSize);
      const localIndex = index % squadSize;
      const localCount = Math.min(squadSize, count - squad * squadSize);
      const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
      const denominator = Math.max(0.001, Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
      const diamondX = Math.cos(angle) / denominator;
      const diamondY = Math.sin(angle) / denominator;
      targetCenterX = centerX + diamondX * Math.min(this.width * 0.24, mobile ? 88 : 132);
      targetCenterY = topY + 38 + squad * (mobile ? 92 : 108) + diamondY * (mobile ? 44 : 52);
    } else if (mode === 'spiral') {
      const ringSize = Math.min(10, count);
      const ring = Math.floor(index / ringSize);
      const localIndex = index % ringSize;
      const localCount = Math.min(ringSize, count - ring * ringSize);
      const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
      targetCenterX = centerX + Math.cos(angle) * Math.min(this.width * (0.2 + ring * 0.08), mobile ? 104 : 158);
      targetCenterY = topY + 54 + ring * (mobile ? 82 : 96) + Math.sin(angle) * (mobile ? 40 : 52);
    } else if (mode === 'pincer') {
      const row = Math.floor(index / 2);
      targetCenterX = centerX + (index % 2 === 0 ? -1 : 1) * Math.min(this.width * 0.24, mobile ? 92 : 138);
      targetCenterY = topY + row * (mobile ? 40 : 46);
    } else {
      const columns = Math.min(mode === 'sine' ? (mobile ? 6 : 9) : (mobile ? 6 : 10), count);
      const row = Math.floor(index / columns);
      const column = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      const gapX = Math.min(mobile ? 54 : 66, (this.width - left * 2) / Math.max(1, columns - 1));
      targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX;
      targetCenterY = topY + row * (mobile ? 54 : 62) + (mode === 'sine' ? Math.sin(column * 1.25) * 24 : 0);
    }

    return {
      x: clamp(targetCenterX - entityWidth / 2, left - entityWidth / 2, right - entityWidth / 2),
      y: clamp(targetCenterY - entityHeight / 2, 54, this.height * 0.42)
    };
  }

  getConfiguredSpawnPoint(event: RuntimeSpawnEvent, index: number, count: number) {
    const positionId = String(event.positionId || 'top-random').toLowerCase();
    const patternId = String(event.patternId || 'row').toLowerCase();
    let x = Math.random() * Math.max(1, this.width - 56);
    let y = -60;

    if (positionId.includes('left')) x = this.width * 0.2;
    else if (positionId.includes('right')) x = this.width * 0.8;
    else if (positionId.includes('center')) x = this.width * 0.5;

    const anchor = this.getConfiguredSpawnAnchor(event);
    if (patternId.includes('single') || patternId.includes('random')) {
      return anchor
        ? { x: anchor.x * this.width, y: anchor.y * this.height }
        : { x, y };
    }

    const mode = this.resolveConfiguredFormationMode(patternId);
    const side = (index + this.getFormationGroupSeed(event.id)) % 2 === 0 ? -1 : 1;
    const pair = Math.floor(index / 2);
    if (mode === 'pincer') {
      x = side < 0 ? -72 : this.width + 72;
      y = Math.max(24, this.height * 0.08) + pair * 22;
    } else if (mode === 'spiral') {
      const angle = index * 0.92;
      x = this.width / 2 + Math.cos(angle) * Math.min(this.width * 0.42, 190);
      y = -96 - pair * 18;
    } else if (mode === 'sine') {
      x = 24 + (index / Math.max(1, count - 1)) * Math.max(1, this.width - 72);
      y = -80 - (Math.sin(index * 1.35) + 1) * 30;
    } else {
      x = side < 0 ? -78 - (index % 3) * 18 : this.width + 78 + (index % 3) * 18;
      y = -104 - pair * 14;
    }

    return {
      x,
      y
    };
  }

  configureEnemyFormation(enemy: Entity, event: RuntimeSpawnEvent, index: number, count: number) {
    const patternId = String(event.patternId || '').toLowerCase();
    if (patternId.includes('single') || patternId.includes('random')) return;

    const formation = this.resolveConfiguredFormationMode(patternId);
    if (formation === 'spiral' && enemy.type === EntityType.ENEMY_DRONE) {
      enemy.width = Math.round(44 * SPIRAL_PAYWALL_INTERCEPTOR_SCALE);
      enemy.height = Math.round(44 * SPIRAL_PAYWALL_INTERCEPTOR_SCALE);
    }
    const target = this.getConfiguredFormationTarget(event, index, count, enemy.width, enemy.height);
    const entryFrames = 52 + (index % 4) * 5 + (formation === 'spiral' ? 14 : 0);
    const holdFramesByMode: Record<ConfiguredEnemyFormationMode, number> = {
      row: 116,
      v: 106,
      sine: 72,
      pincer: 64,
      grid: 136,
      diamond: 96,
      spiral: 82
    };
    const diveCadence = formation === 'grid' ? 18 : formation === 'row' ? 20 : formation === 'v' ? 16 : 12;

    enemy.formation = formation;
    enemy.formationIndex = index;
    enemy.formationSeed = this.waveProgressFrames + index * 19;
    enemy.formationGroupSeed = this.getFormationGroupSeed(event.id);
    enemy.formationState = 'entry';
    enemy.formationTargetX = target.x;
    enemy.formationTargetY = target.y;
    enemy.formationStartX = enemy.x;
    enemy.formationStartY = enemy.y;
    enemy.formationStateFrame = this.frameCount;
    enemy.formationEntryFrames = entryFrames;
    enemy.formationDiveFrame = this.frameCount + entryFrames + holdFramesByMode[formation] + (index % 6) * diveCadence;
    enemy.formationBaseSpeed = Math.max(2.2, Math.abs(enemy.vy));
    enemy.formationCycle = 0;
    enemy.encounterGroupSize = count;
    enemy.vx = 0;
    enemy.vy = 0;
  }

  updateConfiguredEnemyFormation(enemy: Entity) {
    const state = enemy.formationState;
    const formation = enemy.formation;
    const targetX = enemy.formationTargetX;
    const targetY = enemy.formationTargetY;
    if (!state || !formation || formation === 'orbit' || targetX === undefined || targetY === undefined) return false;

    if (state === 'entry' || state === 'return') {
      const duration = Math.max(1, enemy.formationEntryFrames || 54);
      const progress = clamp((this.frameCount - enemy.formationStateFrame) / duration, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      const startX = enemy.formationStartX ?? enemy.x;
      const startY = enemy.formationStartY ?? enemy.y;
      const direction = enemy.formationIndex % 2 === 0 ? 1 : -1;
      const arcStrength = formation === 'spiral'
        ? Math.min(this.width * 0.2, 92)
        : formation === 'pincer'
          ? Math.min(this.width * 0.14, 66)
          : Math.min(this.width * 0.11, 52);
      const spiralOffset = formation === 'spiral'
        ? Math.sin(progress * Math.PI * 2 + enemy.formationIndex * 0.55) * (1 - progress) * 38
        : 0;
      enemy.x = lerp(startX, targetX, eased) + Math.sin(progress * Math.PI) * arcStrength * direction + spiralOffset;
      enemy.y = lerp(startY, targetY, eased) - Math.sin(progress * Math.PI) * (formation === 'spiral' ? 42 : 26);
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = Math.sin(progress * Math.PI) * direction * (formation === 'spiral' ? 0.5 : 0.32);

      if (progress >= 1) {
        enemy.x = targetX;
        enemy.y = targetY;
        enemy.angle = 0;
        enemy.formationState = 'hold';
        enemy.formationStateFrame = this.frameCount;
      }
      return true;
    }

    if (state === 'hold') {
      const swayByMode: Record<Exclude<EnemyFormationMode, 'orbit'>, number> = {
        row: 12,
        v: 16,
        sine: 22,
        pincer: 18,
        grid: 10,
        diamond: 20,
        spiral: 28
      };
      const groupSway = Math.sin((this.frameCount + enemy.formationGroupSeed) * 0.018) * swayByMode[formation];
      const formationPulse = formation === 'diamond' || formation === 'spiral'
        ? Math.sin((this.frameCount + enemy.formationIndex * 11) * 0.035) * 4
        : 0;
      enemy.x = targetX + groupSway;
      enemy.y = targetY + formationPulse + Math.sin((this.frameCount + enemy.formationIndex * 17) * 0.045) * 2.5;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = Math.sin((this.frameCount + enemy.formationGroupSeed) * 0.018) * 0.05;

      if (this.frameCount >= enemy.formationDiveFrame) {
        const enemyCenterX = enemy.x + enemy.width / 2;
        const enemyCenterY = enemy.y + enemy.height / 2;
        const laneOffset = ((enemy.formationIndex % 3) - 1) * (this.mobileProfile ? 18 : 28);
        const aimX = this.player.x + this.player.width / 2 + laneOffset + this.playerVel.x * 6;
        const aimY = Math.min(this.height + 80, this.player.y + this.player.height * 0.7);
        const dx = aimX - enemyCenterX;
        const dy = Math.max(90, aimY - enemyCenterY);
        const length = Math.max(1, Math.hypot(dx, dy));
        const diveSpeed = enemy.formationBaseSpeed * (1.28 + Math.min(0.38, this.wave * 0.055));
        enemy.vx = (dx / length) * diveSpeed;
        enemy.vy = Math.max(diveSpeed * 0.72, (dy / length) * diveSpeed);
        enemy.formationState = 'dive';
        enemy.formationStateFrame = this.frameCount;
      }
      return true;
    }

    const diveAge = this.frameCount - enemy.formationStateFrame;
    const curveStrength = formation === 'diamond' || formation === 'pincer' ? 1.2 : formation === 'spiral' ? 1.6 : 0.75;
    enemy.x += Math.sin(diveAge * 0.09 + enemy.formationSeed) * curveStrength;
    enemy.angle = clamp(enemy.vx * 0.065, -0.46, 0.46);

    if (enemy.y > this.height + 72 || enemy.x < -140 || enemy.x > this.width + 140) {
      const returnDirection = (enemy.formationIndex + enemy.formationCycle) % 2 === 0 ? -1 : 1;
      enemy.formationStartX = clamp(targetX + returnDirection * Math.min(this.width * 0.18, 78), -60, this.width + 60);
      enemy.formationStartY = -72 - (enemy.formationIndex % 3) * 18;
      enemy.x = enemy.formationStartX;
      enemy.y = enemy.formationStartY;
      enemy.vx = 0;
      enemy.vy = 0;
      enemy.angle = 0;
      enemy.formationState = 'return';
      enemy.formationStateFrame = this.frameCount;
      enemy.formationEntryFrames = 46 + (enemy.formationIndex % 4) * 4;
      enemy.formationCycle++;
      enemy.formationDiveFrame = this.frameCount
        + enemy.formationEntryFrames
        + Math.max(76, 148 - this.wave * 10)
        + (enemy.formationIndex % 5) * 14;
    }
    return true;
  }

  spawnConfiguredEnemies() {
    const events = this.getConfiguredSpawnEvents();
    if (events.length === 0) return false;
    const elapsedSeconds = this.getWaveElapsedSeconds();
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const threatCap = Math.max(1, Number(this.getCurrentWaveDefinition()?.threatCap) || this.getThreatCap());

    for (const event of events) {
      const startSeconds = Math.max(0, Number(event.startSeconds) || 0);
      const durationSeconds = Math.max(0, Number(event.durationSeconds) || 0);
      const endSeconds = durationSeconds > 0 ? startSeconds + durationSeconds : Number.POSITIVE_INFINITY;
      const baseCount = Math.max(0, Math.floor(Number(event.count) || 0));
      const cycle = this.getCampaignCycle();
      const formationEvent = !String(event.patternId || '').toLowerCase().includes('single')
        && !String(event.patternId || '').toLowerCase().includes('random');
      const countBonus = formationEvent
        ? Math.min(Math.ceil(baseCount * 0.5), Math.ceil(baseCount * cycle * 0.1))
        : Math.min(2, cycle);
      const count = baseCount + countBonus;
      const spawned = this.configuredSpawnCounts.get(event.id) || 0;
      if (elapsedSeconds < startSeconds || elapsedSeconds > endSeconds || spawned >= count) continue;
      if (this.getActiveThreatCount() >= threatCap) break;

      const intervalFrames = Math.max(1, Math.round(
        ((Number(event.spawnIntervalSeconds) || 0.8) * GAME_CONFIG.FPS) / difficultyMultiplier
      ));
      const previousFrame = this.configuredSpawnFrames.get(event.id);
      if (previousFrame !== undefined && this.waveProgressFrames - previousFrame < intervalFrames) continue;

      const enemySetting = this.pickConfiguredEnemy(event);
      if (!enemySetting) continue;
      if (cycle > 0 && formationEvent && spawned === 0 && !this.escalationWarningsShown.has(event.id)) {
        this.escalationWarningsShown.add(event.id);
        const entersFromLeft = (event.id.length + cycle) % 2 === 0;
        const warningX = entersFromLeft ? 36 : this.width - 36;
        this.spawnFloatingText(warningX, this.height * 0.22, 'SIDE ENTRY', '#fb7185', 15);
        this.spawnRingEffect(warningX, this.height * 0.22, '#fb7185');
      }
      const enemyType = this.resolveConfiguredEnemyType(enemySetting.enemyId);
      const point = this.getConfiguredSpawnPoint(event, spawned, count);
      const enemy = this.createEnemy(enemyType, point.x, point.y, {
        speed: Number(enemySetting.speed) * difficultyMultiplier,
        health: Number(enemySetting.health) * difficultyMultiplier,
        contactDamage: Number(enemySetting.damage) * difficultyMultiplier,
        projectileDamage: Number(enemySetting.damage) * difficultyMultiplier,
        scoreValue: Number(enemySetting.scoreValue),
        powerupDropChance: Number(enemySetting.powerupDropChance),
        spriteUrl: this.resolveSpriteUrl(enemySetting.spriteKey, enemyType),
        spriteFrames: this.resolveSpriteFrames(enemySetting.spriteKey),
        spriteStyle: enemySetting.spriteStyle,
        rank: enemySetting.rank,
        sizeMultiplier: enemySetting.sizeMultiplier,
        attackPatternId: enemySetting.attackPatternId,
        attackIntervalSeconds: enemySetting.attackIntervalSeconds,
        projectileSpeed: enemySetting.projectileSpeed,
        burstCount: enemySetting.burstCount
      });
      const patternId = String(event.patternId || '').toLowerCase();
      if (this.getConfiguredSpawnAnchor(event) && (patternId.includes('single') || patternId.includes('random'))) {
        enemy.x -= enemy.width / 2;
        enemy.y -= enemy.height / 2;
      }
      enemy.sourceEventId = event.id;
      enemy.sourceItemId = enemySetting.enemyId;
      this.configureEnemyFormation(enemy, event, spawned, count);
      this.configuredSpawnCounts.set(event.id, spawned + 1);
      this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
    }

    return true;
  }

  spawnConfiguredSupportEvents() {
    const events = this.getCurrentWaveDefinition()?.events;
    if (!Array.isArray(events) || events.length === 0) return;
    const elapsedSeconds = this.getWaveElapsedSeconds();

    for (const event of events) {
      if (event.kind === 'powerup') {
        const startSeconds = Math.max(0, Number(event.startSeconds) || 0);
        const endSeconds = startSeconds + Math.max(0, Number(event.durationSeconds) || 0);
        if (elapsedSeconds < startSeconds || elapsedSeconds > endSeconds) continue;
        const intervalFrames = Math.max(1, Math.round((Number(event.spawnIntervalSeconds) || 40) * GAME_CONFIG.FPS));
        const startFrame = Math.round(startSeconds * GAME_CONFIG.FPS);
        const previousFrame = this.configuredSpawnFrames.get(event.id) ?? startFrame;
        if (this.waveProgressFrames - previousFrame < intervalFrames) continue;
        const powerupIds = Array.isArray(event.powerupIds) ? event.powerupIds : [];
        const totalWeight = powerupIds.reduce((sum, id) => sum + Math.max(0, getPowerup(id).defaultWeight), 0);
        let powerupId = powerupIds[0];
        if (totalWeight > 0) {
          let roll = Math.random() * totalWeight;
          for (const id of powerupIds) {
            roll -= Math.max(0, getPowerup(id).defaultWeight);
            if (roll <= 0) {
              powerupId = id;
              break;
            }
          }
        }
        const anchor = this.getConfiguredSpawnAnchor(event);
        const powerup = this.spawnPowerup(
          anchor ? (anchor.x * this.width) - 18 : Math.random() * Math.max(1, this.width - 40),
          anchor ? (anchor.y * this.height) - 18 : -40,
          powerupId
        );
        powerup.sourceEventId = event.id;
        powerup.sourceItemId = powerupId;
        this.configuredSpawnFrames.set(event.id, this.waveProgressFrames);
        this.configuredSpawnCounts.set(event.id, (this.configuredSpawnCounts.get(event.id) || 0) + 1);
      } else if (event.kind === 'recovery' && !this.configuredEncounterIds.has(event.id)) {
        if (elapsedSeconds < Math.max(0, Number(event.startSeconds) || 0)) continue;
        this.configuredEncounterIds.add(event.id);
        const coinCount = Math.max(0, Math.floor(Number(event.coinCount) || 0));
        const anchor = this.getConfiguredSpawnAnchor(event);
        for (let index = 0; index < coinCount; index++) {
          const coin = this.spawnCoin(
            this.width * ((index + 1) / Math.max(2, coinCount + 1)) + (anchor ? (anchor.x * this.width) - (this.width / 2) : 0),
            -30 - index * 22 + (anchor ? (anchor.y * this.height) - (-30) : 0)
          );
          coin.sourceEventId = event.id;
          coin.sourceItemId = 'coin';
        }
        const powerupIds = event.powerupIds || [];
        for (const [index, powerupId] of powerupIds.entries()) {
          const powerup = this.spawnPowerup(
            anchor
              ? (anchor.x * this.width) - 18 + ((index - ((powerupIds.length - 1) / 2)) * 44)
              : Math.random() * Math.max(1, this.width - 40),
            anchor ? (anchor.y * this.height) - 18 : -50,
            powerupId
          );
          powerup.sourceEventId = event.id;
          powerup.sourceItemId = powerupId;
        }
      }
    }
  }

  spawnEnemies() {
    const invaderCount = this.countEntities(EntityType.ENEMY_INVADER);
    const asteroidBeltCount = this.getAsteroidBeltCount();
    if (this.bossRef || this.getActiveMiniBosses().length > 0 || invaderCount > 0 || asteroidBeltCount > 0 || this.inBossWarningSequence) return;
    if (this.spawnConfiguredEnemies()) return;
    const activeThreatCount = this.getActiveThreatCount();
    const threatCap = this.getThreatCap();
    if (activeThreatCount >= threatCap) return;

    // Make rarer: 1800 -> 2400
    if (this.frameCount % 2400 === 0) {
        this.spawnPowerup(Math.random() * (this.width - 40), -40);
    }

    const formationRate = Math.max(132, 330 - this.wave * 34);
    if (this.waveProgressFrames > 120 && this.frameCount % formationRate === 0 && activeThreatCount < threatCap - 3) {
      this.spawnSwarmFormation();
    }

    const currentRate = Math.max(30, GAME_CONFIG.BASE_SPAWN_RATE + 12 - ((this.wave - 1) * 10));

    if (this.frameCount % currentRate === 0) {
      const typeRoll = Math.random();
      const x = Math.random() * (this.width - 40);
      let enemyType = EntityType.ENEMY_DRONE;
      
      if (this.wave === 1) {
        if (this.stats.bossProgress < 0.3) {
          if (typeRoll > 0.88) enemyType = EntityType.ENEMY_SWARM;
        } else if (this.stats.bossProgress < 0.7) {
          if (typeRoll > 0.9) enemyType = EntityType.ENEMY_SWARM;
          else if (typeRoll > 0.64) enemyType = EntityType.ENEMY_BRICK;
        } else {
          if (typeRoll > 0.9) enemyType = EntityType.ENEMY_SWARM;
          else if (typeRoll > 0.7) enemyType = EntityType.ENEMY_BRICK;
          else if (typeRoll > 0.44) enemyType = EntityType.ENEMY_JOURNAL;
        }
      } else if (this.stats.bossProgress < 0.3) {
        if (typeRoll > 0.7) enemyType = EntityType.ENEMY_SWARM;
      } else if (this.stats.bossProgress < 0.7) {
        if (typeRoll > 0.8) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.5) enemyType = EntityType.ENEMY_BRICK;
      } else {
        if (typeRoll > 0.85) enemyType = EntityType.ENEMY_SWARM;
        else if (typeRoll > 0.6) enemyType = EntityType.ENEMY_BRICK;
        else if (typeRoll > 0.3) enemyType = EntityType.ENEMY_JOURNAL;
      }

      this.createEnemy(enemyType, x, -50);
    }
  }

  spawnSwarmFormation() {
    const modes: Array<'row' | 'v' | 'sine' | 'pincer'> = this.wave <= 1
      ? ['row', 'v']
      : this.wave === 2
        ? ['row', 'v', 'sine']
        : ['row', 'v', 'sine', 'pincer'];
    const mode = modes[(this.wave + Math.floor(this.frameCount / 120)) % modes.length];
    const isMobile = this.width < 520;
    const threatBudget = Math.max(0, this.getThreatCap() - this.getActiveThreatCount());
    const count = Math.min(11, 6 + this.wave + Math.floor(this.stats.bossProgress * 4), threatBudget);
    if (count < 3) return;
    const gap = isMobile ? 42 : 54;
    const centerX = this.width / 2;
    const startX = centerX - ((count - 1) * gap) / 2;
    const seed = Math.random() * 1000;
    const eliteAllowed = this.wave > 1 || this.stats.bossProgress > 0.42;
    const centerIndex = Math.floor(count / 2);

    for (let i = 0; i < count; i++) {
      const offset = i - ((count - 1) / 2);
      const x = mode === 'pincer'
        ? (i % 2 === 0 ? -40 : this.width + 40)
        : clamp(startX + i * gap, 12, this.width - 46);
      const y = -70 - Math.abs(offset) * (mode === 'v' ? 24 : 7) - (i % 2) * 10;
      let enemyType = EntityType.ENEMY_SWARM;

      if (mode === 'row') {
        enemyType = i % 3 === 1 ? EntityType.ENEMY_DRONE : EntityType.ENEMY_SWARM;
      } else if (mode === 'v') {
        enemyType = eliteAllowed && i === centerIndex
          ? EntityType.ENEMY_BRICK
          : (i % 2 === 0 ? EntityType.ENEMY_SWARM : EntityType.ENEMY_DRONE);
      } else if (mode === 'sine') {
        enemyType = eliteAllowed && i % 4 === 0 ? EntityType.ENEMY_JOURNAL : EntityType.ENEMY_SWARM;
      } else if (mode === 'pincer') {
        enemyType = eliteAllowed && i % 5 === 0
          ? EntityType.ENEMY_BRICK
          : (i % 3 === 0 ? EntityType.ENEMY_DRONE : EntityType.ENEMY_SWARM);
      }

      const enemy = this.createEnemy(enemyType, x, y);
      enemy.formation = mode;
      enemy.formationIndex = i;
      enemy.formationSeed = seed + i * 19;
      const isHeavy = enemy.type === EntityType.ENEMY_BRICK || enemy.type === EntityType.ENEMY_JOURNAL;
      enemy.vy = (mode === 'row' ? 2.8 + this.wave * 0.18 : 3.1 + this.wave * 0.2) * (isHeavy ? 0.76 : 1);
      enemy.vx = mode === 'pincer'
        ? (i % 2 === 0 ? 2.1 : -2.1)
        : Math.sin(i * 0.9) * 0.55;
    }

  }

  createEnemy(type: EntityType, x: number, y: number, overrides: EnemyRuntimeOverrides = {}) {
    const e = new Entity(type, x, y);
    const hpMult = this.wave === 1 ? 1 : 1 + (this.wave * 0.34);
    const speedBoost = this.wave === 1 ? 1 : 1 + (this.wave * 0.11);
    e.variant = Math.floor(Math.random() * 100);
    
    if (type === EntityType.ENEMY_DRONE) {
      e.vy = 2.5 * speedBoost; 
      e.hp = 2 * hpMult;
      e.width = Math.round(44 * PAYWALL_INTERCEPTOR_SCALE);
      e.height = Math.round(44 * PAYWALL_INTERCEPTOR_SCALE);
      e.color = '#7dd3fc'; 
      e.spriteFrames = [...ASSETS.ENEMY_DRONE_FRAMES];
      e.text = "🔒"; 
    } else if (type === EntityType.ENEMY_JOURNAL) {
      e.vy = 4.4 * speedBoost; 
      e.vx = Math.sin((this.frameCount + e.variant) * 0.2) * 4; 
      e.hp = 3 * hpMult;
      e.color = '#fb7185'; 
      e.text = "📕"; 
      e.width = 56;
      e.height = 66;
      e.spriteFrames = [...ASSETS.ENEMY_JOURNAL_FRAMES];
    } else if (type === EntityType.ENEMY_BRICK) {
      e.vy = 1.5 * speedBoost;
      e.hp = 8 * hpMult;
      e.width = 54;
      e.height = 54;
      e.color = '#f59e0b'; 
      e.spriteFrames = [...ASSETS.ENEMY_BRICK_FRAMES];
      e.text = "📰";
    } else if (type === EntityType.ENEMY_SWARM) {
      e.vy = 3.5 * speedBoost;
      e.hp = 1 * hpMult;
      e.width = Math.round(34 * CITATION_WRAITH_SCALE);
      e.height = Math.round(28 * CITATION_WRAITH_SCALE);
      e.color = '#34d399'; 
      e.spriteFrames = [...ASSETS.ENEMY_SWARM_FRAMES];
      e.text = "🪰";
    } 

    if (Number.isFinite(overrides.speed)) e.vy = overrides.speed as number;
    if (Number.isFinite(overrides.health)) e.hp = Math.max(0.1, overrides.health as number);
    if (Number.isFinite(overrides.contactDamage)) e.contactDamage = Math.max(0, overrides.contactDamage as number);
    if (Number.isFinite(overrides.projectileDamage)) e.projectileDamage = Math.max(0, overrides.projectileDamage as number);
    if (Number.isFinite(overrides.scoreValue)) e.scoreValue = Math.max(0, overrides.scoreValue as number);
    if (Number.isFinite(overrides.powerupDropChance)) {
      e.powerupDropChance = clamp(overrides.powerupDropChance as number, 0, 1);
    }
    const sizeMultiplier = clamp(Number(overrides.sizeMultiplier) || 1, 0.5, 2.5);
    if (sizeMultiplier !== 1) {
      e.width = Math.round(e.width * sizeMultiplier);
      e.height = Math.round(e.height * sizeMultiplier);
    }
    e.eliteRank = overrides.rank;
    e.isElite = overrides.rank === 'elite';
    e.eliteAttackPattern = overrides.attackPatternId;
    if (Number.isFinite(overrides.attackIntervalSeconds)) {
      e.attackIntervalFrames = Math.max(18, Math.round(
        (Number(overrides.attackIntervalSeconds) * GAME_CONFIG.FPS) / this.getCurrentDifficultyMultiplier()
      ));
    }
    if (Number.isFinite(overrides.projectileSpeed)) {
      e.projectileSpeed = Math.max(0.5, Number(overrides.projectileSpeed));
    }
    if (Number.isFinite(overrides.burstCount)) {
      e.configuredBurstCount = Math.max(1, Math.min(7, Math.floor(Number(overrides.burstCount))));
    }
    if (overrides.spriteUrl) {
      e.spriteUrl = overrides.spriteUrl;
      loadImage(e.spriteUrl);
    }
    if (overrides.spriteFrames?.length) {
      e.spriteFrames = [...overrides.spriteFrames];
      e.spriteFrames.forEach(loadImage);
    }
    if (overrides.spriteStyle) e.spriteStyle = { ...overrides.spriteStyle };
    e.maxHp = e.hp;
    this.entities.push(e);
    return e;
  }

  spawnMiniBoss(_num: number, configured?: RuntimeBossEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const requestedCount = configured ? Number(configured.count ?? 1) : _num;
    const count = Math.max(1, Math.min(4, Math.floor(requestedCount) || 1));
    const gap = count > 1 ? (this.mobileProfile ? 10 : 20) : 0;
    const availableWidth = Math.max(160, this.width - 24);
    const bossWidth = count > 1
      ? Math.min(140, Math.floor((availableWidth - gap * (count - 1)) / count))
      : 140;
    const bossHeight = Math.round(bossWidth * (160 / 140));
    const groupWidth = bossWidth * count + gap * (count - 1);
    const anchoredPosition = this.getAnchoredTopLeft(configured, groupWidth, bossHeight);
    const startX = anchoredPosition?.x ?? (this.width - groupWidth) / 2;
    const startY = anchoredPosition?.y ?? -100;
    const spawned: Entity[] = [];

    for (let index = 0; index < count; index++) {
      const mb = new Entity(
        EntityType.MINI_BOSS,
        startX + index * (bossWidth + gap),
        startY
      );
      mb.width = bossWidth;
      mb.height = bossHeight;
      mb.hp = configured
        ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
        : this.wave === 1 ? 44 : 45 + (this.wave * 22);
      mb.maxHp = mb.hp;
      mb.configuredSpeed = configured ? Math.max(0.1, (Number(configured.speed) || 2) * difficultyMultiplier) : 2;
      mb.vy = mb.configuredSpeed;
      mb.color = '#fb7185';
      mb.variant = index * 31;
      mb.formationIndex = index;
      mb.encounterGroupSize = count;
      mb.attackTimer = index * 18;
      if (configured) {
        const weapon = configured.weapons?.[0];
        mb.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.MINI_BOSS);
        if (configured.spriteStyle) mb.spriteStyle = { ...configured.spriteStyle };
        mb.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
        mb.projectileDamage = Math.max(0, (Number(weapon?.damage ?? configured.damage) || 1) * difficultyMultiplier);
        mb.projectileSpeed = Math.max(0.1, (Number(weapon?.projectileSpeed) || 5) * difficultyMultiplier);
        mb.attackIntervalFrames = Math.max(1, Math.round(
          ((Number(weapon?.attackIntervalSeconds) || 1) * GAME_CONFIG.FPS) / difficultyMultiplier
        ));
        mb.weaponKinds = configured.weapons.map((setting) => String(setting.weaponId));
        mb.configuredBurstCount = Math.max(1, Math.floor(Number(weapon?.burstCount) || 1));
        mb.movementPattern = configured.movementPatternId;
        mb.scoreReward = Math.max(0, Number(configured.scoreReward) || 0);
        mb.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
        mb.phaseThresholds = configured.phases.map((phase) => Number(phase.triggerHealthRatio)).filter(Number.isFinite);
        mb.sourceEventId = configured.id;
        mb.sourceItemId = configured.bossId;
        if (mb.spriteUrl) loadImage(mb.spriteUrl);
      }
      spawned.push(mb);
      this.entities.push(mb);
    }

    this.miniBossRef = spawned[0] ?? null;
    if (count > 1) {
      this.spawnFloatingText(this.width / 2, Math.max(92, this.height * 0.16), 'TWIN BOTTLENECKS!', '#fef08a', this.mobileProfile ? 18 : 22);
    }
  }
  
  spawnWallBoss(configured?: RuntimeBossEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const isMobile = this.width < 600;
    const rows = configured
      ? Math.max(1, Math.min(4, Math.floor(Number(configured.count ?? 2)) || 2))
      : 2;
    const cols = Math.min(isMobile ? 8 : 10, 4 + Math.max(1, this.wave));
    const blockW = isMobile ? 42 : 52;
    const blockH = isMobile ? 50 : 60;
    const gap = 4;
    const anchoredPosition = this.getAnchoredTopLeft(
      configured,
      (blockW * cols) + (gap * Math.max(0, cols - 1)),
      (blockH * rows) + (gap * Math.max(0, rows - 1))
    );
    const startX = anchoredPosition?.x ?? (this.width - ((blockW+gap)*cols))/2;
    const startY = anchoredPosition?.y ?? -200;
    
    const segmentCount = rows * cols;
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const e = new Entity(EntityType.ENEMY_INVADER, startX + c*(blockW+gap), startY + r*(blockH+gap));
            e.width = blockW;
            e.height = blockH;
            e.hp = configured
              ? Math.max(1, Math.ceil(((Number(configured.health) || segmentCount) * difficultyMultiplier) / segmentCount))
              : this.wave === 1 ? 5 : Math.round(5 + (this.wave * 3.1));
            e.maxHp = e.hp;
            e.color = '#fb7185'; 
            e.text = "🧱"; // UPDATED to Brick Emoji
            e.variant = (r * cols) + c;
            e.vx = 0;
            if (configured) {
              const weapon = configured.weapons?.[0];
              e.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.ENEMY_INVADER);
              e.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
              if (configured.spriteStyle) e.spriteStyle = { ...configured.spriteStyle };
              e.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
              e.projectileDamage = Math.max(0, (Number(weapon?.damage ?? configured.damage) || 1) * difficultyMultiplier);
              e.projectileSpeed = Math.max(0.1, (Number(weapon?.projectileSpeed) || 5.4) * difficultyMultiplier);
              e.attackIntervalFrames = Math.max(1, Math.round(
                ((Number(weapon?.attackIntervalSeconds) || 0.7) * GAME_CONFIG.FPS) / difficultyMultiplier
              ));
              e.weaponKinds = configured.weapons.map((setting) => String(setting.weaponId));
              e.configuredBurstCount = Math.max(1, Math.floor(Number(weapon?.burstCount) || 1));
              e.scoreValue = Math.max(0, Math.round((Number(configured.scoreReward) || 0) / segmentCount));
              e.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
              e.configuredSpeed = Math.max(0.1, (Number(configured.speed) || 1.15) * difficultyMultiplier);
              e.sourceEventId = configured.id;
              e.sourceItemId = configured.bossId;
              if (e.spriteUrl) loadImage(e.spriteUrl);
              e.spriteFrames?.forEach(loadImage);
            } else {
              e.spriteUrl = ASSETS.PAYWALL_BASTION_FRAMES[1];
              e.spriteFrames = [...ASSETS.PAYWALL_BASTION_FRAMES];
            }
            this.entities.push(e);
        }
    }
    this.invaderDirection = 1; 
  }

  spawnAsteroidBelt(configured?: RuntimeAsteroidEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const count = configured
      ? Math.max(1, Math.floor(Number(configured.count) || 1))
      : Math.min(24, 12 + (this.wave * 3));
    const lanes = Math.max(4, Math.min(7, Math.floor(this.width / 88)));
    const laneWidth = this.width / lanes;
    const anchor = this.getConfiguredSpawnAnchor(configured);
    const rowCount = Math.max(1, Math.ceil(count / lanes));
    const defaultCenterY = -140 - (((rowCount - 1) * 72) / 2) - 22.5;
    const anchorOffsetX = anchor ? (anchor.x * this.width) - (this.width / 2) : 0;
    const anchorOffsetY = anchor ? (anchor.y * this.height) - defaultCenterY : 0;
    this.asteroidBeltMaxCount = count;

    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      const jitter = (Math.random() - 0.5) * laneWidth * 0.5;
      const size = 42 + Math.random() * 28 + (this.wave * 2);
      const defaultX = Math.max(8, Math.min(this.width - size - 8, (lane * laneWidth) + (laneWidth / 2) - (size / 2) + jitter));
      const defaultY = -140 - (Math.floor(i / lanes) * 72) - (Math.random() * 45);
      const asteroid = new Entity(
        EntityType.ENEMY_BRICK,
        defaultX + anchorOffsetX,
        defaultY + anchorOffsetY
      );

      asteroid.width = size;
      asteroid.height = size;
      asteroid.vy = configured
        ? Math.max(0.1, (Number(configured.speed) || 1.8) * difficultyMultiplier) + (Math.random() * 0.18)
        : 1.8 + (this.wave * 0.32) + (Math.random() * 0.45);
      asteroid.vx = (Math.random() - 0.5) * (0.45 + (this.wave * 0.08));
      asteroid.hp = configured
        ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
        : Math.round(4 + (this.wave * 1.9));
      asteroid.maxHp = asteroid.hp;
      asteroid.variant = 900 + i;
      asteroid.color = '#f59e0b';
      if (configured) {
        asteroid.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.ENEMY_BRICK);
        asteroid.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
        if (configured.spriteStyle) asteroid.spriteStyle = { ...configured.spriteStyle };
        asteroid.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
        asteroid.scoreValue = Math.max(0, Number(configured.scoreValue) || 0);
        asteroid.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
        asteroid.sourceEventId = configured.id;
        asteroid.sourceItemId = 'asteroid-belt';
        if (asteroid.spriteUrl) loadImage(asteroid.spriteUrl);
        asteroid.spriteFrames?.forEach(loadImage);
      } else {
        asteroid.spriteFrames = [...ASSETS.ASTEROID_BELT_FRAMES];
      }
      this.entities.push(asteroid);
    }

    this.spawnFloatingText(this.width / 2, this.height * 0.24, 'ASTEROID BELT', '#fbbf24');
  }
  
  updateWallBoss() {
      const invaders = this.entities.filter(e => e.type === EntityType.ENEMY_INVADER);
      if (invaders.length === 0) return;
      
      let minY = 10000;
      invaders.forEach(inv => { if (inv.y < minY) minY = inv.y; });

      const isEntering = minY < 50;
      const configuredVerticalSpeed = invaders.find((invader) => Number.isFinite(invader.configuredSpeed))?.configuredSpeed;
      const verticalSpeed = isEntering
        ? configuredVerticalSpeed ?? (this.wave === 1 ? 1.15 : 1.5 + (this.wave - 1))
        : 0;
      
      let hitEdge = false;
      invaders.forEach(inv => {
          if (inv.x + inv.width > this.width - 10 && this.invaderDirection > 0) hitEdge = true;
          if (inv.x < 10 && this.invaderDirection < 0) hitEdge = true;
      });
      
      let moveX = this.invaderDirection * (this.wave === 1 ? 1.55 : 2 + (this.wave * 0.3));
      let moveY = verticalSpeed;

      if (hitEdge && !isEntering) {
          this.invaderDirection *= -1;
          moveX = 0; 
          moveY += 15; 
      }
      
      invaders.forEach(inv => {
          inv.x += moveX;
          inv.y += moveY;
          if (inv.attackTimer > 0) inv.attackTimer--;
      });
      
      const configuredAttackInterval = invaders.find((invader) => Number.isFinite(invader.attackIntervalFrames))?.attackIntervalFrames;
      const shootRate = configuredAttackInterval ?? (this.wave === 1 ? 42 : Math.max(8, 20 - this.wave));
      if (this.frameCount % shootRate === 0) { 
          const shooter = invaders[Math.floor(Math.random() * invaders.length)];
          const b = new Entity(EntityType.PROJECTILE, shooter.x + shooter.width/2, shooter.y + shooter.height);
          b.vx = 0;
          b.vy = shooter.projectileSpeed ?? (this.wave === 1 ? 5.4 : 7 + (this.wave * 0.5));
          b.width = this.wave === 1 ? 12 : 14;
          b.height = this.wave === 1 ? 12 : 14;
          b.color = '#ff4444';
          b.damage = Math.max(1, Number(shooter.projectileDamage) || 1);
          shooter.attackTimer = 12;
          // Solid projectile
          this.entities.push(b);
          this.playSound('boss_shoot', 0.72, { pitchJitter: 0.12, pitchOffset: 0.06 });
      }
  }

  updateMiniBoss(boss: Entity) {
     boss.attackTimer++;
     const groupOffset = (boss.formationIndex - ((boss.encounterGroupSize - 1) / 2))
       * Math.min(boss.width * 0.72, Math.max(48, this.width * 0.18));
     const targetX = this.player.x + this.player.width/2 - boss.width/2 + groupOffset;
     const dx = targetX - boss.x;
     if (boss.y > 0) boss.x += dx * (0.03 + (this.wave * 0.005));

     if (boss.y < 100) boss.vy = boss.configuredSpeed ?? 2;
     else {
        boss.vy = 0;
        boss.x += Math.sin((boss.attackTimer * 0.05) + boss.formationIndex * Math.PI) * 3;
     }
     
     boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
     
     const healthRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
     const activePhaseCount = boss.phaseThresholds.filter((threshold) => healthRatio <= threshold).length;
     const phaseCadenceMultiplier = Math.max(0.45, 1 - Math.max(0, activePhaseCount - 1) * 0.16);
     const baseShootRate = boss.attackIntervalFrames ?? (this.wave === 1 ? 72 : Math.max(30, 60 - (this.wave * 5)));
     const hullPressureMultiplier = 0.58 + clamp(healthRatio, 0, 1) * 0.42;
     const shootRate = Math.max(8, Math.round(baseShootRate * phaseCadenceMultiplier * hullPressureMultiplier));
     if (boss.attackTimer % shootRate === 0) {
        const burstCount = Math.max(1, boss.configuredBurstCount ?? 1);
        for (let index = 0; index < burstCount; index++) {
          const offset = index - ((burstCount - 1) / 2);
          const b = new Entity(EntityType.PROJECTILE, boss.x + boss.width/2, boss.y + boss.height);
          b.vx = offset * 0.85;
          b.vy = boss.projectileSpeed ?? (5 + (this.wave * 0.5));
          b.width = 16;
          b.height = 16;
          b.color = '#ff0000';
          b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
          this.entities.push(b);
        }
        this.playSound('boss_shoot', 0.9, { pitchJitter: 0.1, pitchOffset: -0.02 });
     }
  }

  getBossComponentDurability(boss: Entity, componentId: BossPartId) {
    const rigId = boss.bossRigId ?? 'open-orbit';
    const minimumDurability = BOSS_COMPONENT_DURABILITY[rigId][componentId] ?? 5;
    const healthRatio = componentId === 'helmet'
      ? BOSS_HELMET_HEALTH_RATIO
      : BOSS_CANNON_HEALTH_RATIO;
    const durability = Math.max(
      minimumDurability,
      Math.round(Math.max(1, boss.maxHp) * healthRatio)
    );
    return durability;
  }

  createBossComponents(boss: Entity) {
    if (boss.bossRigId === 'open-orbit' || boss.bossRigId === 'citation-storm') {
      const isCitationStorm = boss.bossRigId === 'citation-storm';
      return ([
        {
          id: 'left-cannon',
          label: isCitationStorm ? 'LEFT PLASMA CLAW' : 'LEFT RAILGUN',
          centerXRatio: 0.17,
          centerYRatio: isCitationStorm ? 0.51 : 0.45,
          widthRatio: 0.38,
          heightRatio: isCitationStorm ? 0.62 : 0.58
        },
        {
          id: 'right-cannon',
          label: isCitationStorm ? 'RIGHT PLASMA CLAW' : 'RIGHT RAILGUN',
          centerXRatio: 0.83,
          centerYRatio: isCitationStorm ? 0.51 : 0.45,
          widthRatio: 0.38,
          heightRatio: isCitationStorm ? 0.62 : 0.58
        }
      ] as const).map((layout) => {
        const maxHp = this.getBossComponentDurability(boss, layout.id);
        return {
          ...layout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    if (boss.bossRigId === 'paywall-siege') {
      return PAYWALL_BOSS_COMPONENT_LAYOUT.map((layout) => {
        const paywallLayout = layout.id === 'left-cannon'
          ? { centerXRatio: 0.27, centerYRatio: 0.7, widthRatio: 0.3, heightRatio: 0.36 }
          : layout.id === 'right-cannon'
            ? { centerXRatio: 0.73, centerYRatio: 0.7, widthRatio: 0.3, heightRatio: 0.36 }
            : { centerXRatio: 0.5, centerYRatio: 0.45, widthRatio: 0.32, heightRatio: 0.3 };
        const maxHp = this.getBossComponentDurability(boss, layout.id);
        return {
          ...layout,
          ...paywallLayout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    if (boss.bossRigId === 'crown-claw') {
      return ([
        {
          id: 'left-cannon',
          label: 'LEFT CLAW',
          centerXRatio: 0.2,
          centerYRatio: 0.58,
          widthRatio: 0.34,
          heightRatio: 0.58
        },
        {
          id: 'right-cannon',
          label: 'RIGHT CLAW',
          centerXRatio: 0.8,
          centerYRatio: 0.58,
          widthRatio: 0.34,
          heightRatio: 0.58
        }
      ] as const).map((layout) => {
        const maxHp = this.getBossComponentDurability(boss, layout.id);
        return {
          ...layout,
          hp: maxHp,
          maxHp,
          destroyed: false,
          flashFrames: 0,
          lastDamageFlashFrame: -999
        } satisfies BossComponentState;
      });
    }

    return [];
  }

  getBossComponentBox(boss: Entity, component: BossComponentState): CollisionBox {
    const isCannon = component.id === 'left-cannon' || component.id === 'right-cannon';
    const targetScale = isCannon
      ? boss.bossRigId === 'crown-claw' ? CROWNCLAW_ARM_HITBOX_SCALE : BOSS_CANNON_HITBOX_SCALE
      : 1;
    const width = Math.max(18, boss.width * component.widthRatio * targetScale);
    const height = Math.max(18, boss.height * component.heightRatio * targetScale);
    return {
      x: boss.x + boss.width * component.centerXRatio - width / 2,
      y: boss.y + boss.height * component.centerYRatio - height / 2,
      width,
      height
    };
  }

  getBossComponentHit(boss: Entity, shotBox: CollisionBox) {
    const shotCenterX = shotBox.x + shotBox.width / 2;
    const shotCenterY = shotBox.y + shotBox.height / 2;
    const candidates = (boss.bossComponents ?? [])
      .filter((component) => !component.destroyed)
      .map((component) => {
        const box = this.getBossComponentBox(boss, component);
        const overlapWidth = Math.max(0, Math.min(shotBox.x + shotBox.width, box.x + box.width) - Math.max(shotBox.x, box.x));
        const overlapHeight = Math.max(0, Math.min(shotBox.y + shotBox.height, box.y + box.height) - Math.max(shotBox.y, box.y));
        const containsShotCenter = shotCenterX >= box.x
          && shotCenterX <= box.x + box.width
          && shotCenterY >= box.y
          && shotCenterY <= box.y + box.height;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        const normalizedDistance = Math.hypot(
          (shotCenterX - centerX) / Math.max(1, box.width),
          (shotCenterY - centerY) / Math.max(1, box.height)
        );
        return {
          component,
          overlapArea: overlapWidth * overlapHeight,
          containsShotCenter,
          normalizedDistance
        };
      })
      .filter((candidate) => candidate.overlapArea > 0)
      .sort((left, right) => (
        Number(right.containsShotCenter) - Number(left.containsShotCenter)
        || left.normalizedDistance - right.normalizedDistance
        || right.overlapArea - left.overlapArea
      ));
    return candidates[0]?.component;
  }

  updateBossDecayStage(boss: Entity) {
    if (boss.type !== EntityType.BOSS) return;
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const destroyedCount = (boss.bossComponents ?? []).filter((component) => component.destroyed).length;
    if (boss.bossRigId === 'open-orbit' || boss.bossRigId === 'citation-storm') {
      boss.bossDecayStage = destroyedCount < 2
        ? destroyedCount
        : healthRatio <= 0.3 ? 4 : healthRatio <= 0.62 ? 3 : 2;
      return;
    }
    if (boss.bossRigId === 'paywall-siege') {
      const armorStage = destroyedCount >= 3 ? 2 : destroyedCount > 0 ? 1 : 0;
      const exposedCoreStage = destroyedCount >= 3
        ? healthRatio <= 0.2 ? 4 : healthRatio <= 0.45 ? 3 : 2
        : armorStage;
      boss.bossDecayStage = exposedCoreStage;
      return;
    }
    if (boss.bossRigId === 'crown-claw') {
      const armorStage = destroyedCount >= 2 ? 1 : 0;
      boss.bossDecayStage = destroyedCount >= 2
        ? healthRatio <= 0.12 ? 5 : healthRatio <= 0.28 ? 4 : healthRatio <= 0.48 ? 3 : healthRatio <= 0.7 ? 2 : 1
        : armorStage;
      return;
    }
    boss.bossDecayStage = healthRatio <= 0.18 ? 4 : healthRatio <= 0.4 ? 3 : healthRatio <= 0.64 ? 2 : healthRatio <= 0.82 ? 1 : 0;
  }

  damageBossComponent(boss: Entity, component: BossComponentState, damage: number) {
    if (component.destroyed) return;
    this.pulseBossComponentFlash(component);
    component.hp -= Math.max(0, damage) * BOSS_COMPONENT_WEAK_POINT_MULTIPLIER;
    const box = this.getBossComponentBox(boss, component);
    const impactX = box.x + box.width / 2;
    const impactY = box.y + box.height / 2;
    if (component.hp <= 0) {
      component.hp = 0;
      component.destroyed = true;
      const label = component.id === 'helmet'
        ? 'CORE EXPOSED'
        : boss.bossRigId === 'crown-claw'
          ? `${component.label} SEVERED`
          : `${component.label} DISABLED`;
      this.spawnFloatingText(impactX, impactY, label, component.id === 'helmet' ? '#fef08a' : '#fb7185', 17);
      this.spawnBurst(impactX, impactY, '#ffffff', 18, 5.2, 5);
      this.addShake(component.id === 'helmet' ? 5 : 3.5);
      this.addHitStop(component.id === 'helmet' ? 9 : 6);
      this.playSound('explode', component.id === 'helmet' ? 1.55 : 1.3, {
        pitchJitter: 0.08,
        pitchOffset: component.id === 'helmet' ? -0.14 : -0.06
      });
      if (component.id === 'helmet') {
        this.entities.forEach((entity) => {
          if (entity.projectileVisualKind === 'boss-ray') entity.markedForDeletion = true;
        });
      }
    }
    this.updateBossDecayStage(boss);
  }

  isBossHullProtected(boss: Entity) {
    return (boss.bossComponents ?? []).some((component) => (
      component.id === 'helmet' && !component.destroyed
    ));
  }

  damageBossHull(boss: Entity, damage: number) {
    if (this.isBossHullProtected(boss)) {
      this.pulseDamageFlash(boss);
      return;
    }
    boss.hp -= damage;
    this.pulseDamageFlash(boss);
    this.updateBossDecayStage(boss);
  }

  spawnBoss(configured?: RuntimeBossEvent) {
    const difficultyMultiplier = this.getCurrentDifficultyMultiplier();
    const sizeMultiplier = clamp(Number(configured?.sizeMultiplier) || 1, 0.5, 1.5);
    const bossWidth = Math.round(220 * sizeMultiplier);
    const bossHeight = Math.round(200 * sizeMultiplier);
    const anchoredPosition = this.getAnchoredTopLeft(configured, bossWidth, bossHeight);
    const boss = new Entity(
      EntityType.BOSS,
      anchoredPosition?.x ?? this.width / 2 - bossWidth / 2,
      anchoredPosition?.y ?? -bossHeight
    );
    const phase = Math.max(1, this.stats.wave);
    boss.width = bossWidth;
    boss.height = bossHeight;
    boss.hp = configured
      ? Math.max(1, (Number(configured.health) || 1) * difficultyMultiplier)
      : phase === 1 ? 235 : 220 + (phase * 105);
    boss.maxHp = boss.hp;
    boss.variant = (this.stats.wave - 1) % 3;
    boss.color = '#990000';
    boss.text = "GATEKEEPER";
    boss.configuredSpeed = configured ? Math.max(0.1, (Number(configured.speed) || 2) * difficultyMultiplier) : 2;
    boss.vy = boss.configuredSpeed;
    if (configured) {
      const weapon = configured.weapons?.[0];
      boss.spriteUrl = this.resolveSpriteUrl(configured.spriteKey, EntityType.BOSS);
      boss.spriteFrames = this.resolveSpriteFrames(configured.spriteKey);
      if (configured.spriteStyle) boss.spriteStyle = { ...configured.spriteStyle };
      boss.contactDamage = Math.max(0, (Number(configured.damage) || 1) * difficultyMultiplier);
      boss.projectileDamage = Math.max(0, (Number(weapon?.damage ?? configured.damage) || 1) * difficultyMultiplier);
      boss.projectileSpeed = Math.max(0.1, (Number(weapon?.projectileSpeed) || 6.5) * difficultyMultiplier);
      boss.attackIntervalFrames = Math.max(1, Math.round(
        ((Number(weapon?.attackIntervalSeconds) || 1) * GAME_CONFIG.FPS) / difficultyMultiplier
      ));
      boss.weaponKinds = configured.weapons.map((setting) => String(setting.weaponId));
      boss.configuredBurstCount = Math.max(1, Math.floor(Number(weapon?.burstCount) || 1));
      boss.movementPattern = configured.movementPatternId;
      boss.scoreReward = Math.max(0, Number(configured.scoreReward) || 0);
      boss.powerupDropChance = clamp(Number(configured.powerupDropChance) || 0, 0, 1);
      boss.phaseThresholds = configured.phases.map((healthPhase) => Number(healthPhase.triggerHealthRatio)).filter(Number.isFinite);
      boss.completesWave = true;
      boss.sourceEventId = configured.id;
      boss.sourceItemId = configured.bossId;
      boss.bossRigId = BOSS_RIG_BY_EVENT_ID[configured.id] ?? 'open-orbit';
      if (boss.bossRigId === 'crown-claw') {
        const previousWidth = boss.width;
        boss.width = Math.min(this.width * 0.78, 280);
        boss.height = boss.width * (704 / 1024);
        boss.x -= (boss.width - previousWidth) / 2;
      }
      boss.bossComponents = this.createBossComponents(boss);
      if (boss.spriteUrl) loadImage(boss.spriteUrl);
      boss.spriteFrames?.forEach(loadImage);
    }
    boss.bossRigId ??= 'open-orbit';
    boss.bossComponents ??= this.createBossComponents(boss);
    this.bossRef = boss;
    this.entities.push(boss);
    const shieldCount = configured ? Math.max(0, Math.floor(Number(configured.shieldCount) || 0)) : undefined;
    if ((configured && (shieldCount || 0) > 0) || (!configured && phase >= 2)) {
      this.spawnBossShieldRing(boss, phase, shieldCount);
    }
  }

  getBossPulseCount(phase: number) {
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase === 3) return 3;
    return 4;
  }

  spawnBossBurst(boss: Entity, phase: number) {
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const configuredShotCount = boss.configuredBurstCount ?? (phase <= 1 ? 3 : phase === 2 ? 5 : 7);
    const cannonComponents = (boss.bossComponents ?? []).filter((component) => (
      component.id === 'left-cannon' || component.id === 'right-cannon'
    ));
    const activeCannons = cannonComponents.filter((component) => !component.destroyed);
    if (cannonComponents.length > 0 && activeCannons.length === 0) {
      this.spawnBossCoreVolley(boss, phase);
      return;
    }
    const activeCannonCount = activeCannons.length;
    const cannonStrength = cannonComponents.length > 0 ? activeCannonCount / cannonComponents.length : 1;
    const shotCount = Math.max(3, Math.round(configuredShotCount * (0.35 + cannonStrength * 0.65)));
    const spread = phase <= 1 ? 0.2 : phase === 2 ? 0.18 : 0.16;
    const speed = boss.projectileSpeed ?? Math.min(10.5, 6 + phase * 0.55);
    const origins = activeCannons.length > 0
      ? activeCannons.map((component) => {
        const box = this.getBossComponentBox(boss, component);
        return { x: box.x + box.width / 2, y: box.y + box.height * 0.72 };
      })
      : [{ x: boss.x + boss.width / 2, y: boss.y + boss.height - 20 }];

    for (let i = 0; i < shotCount; i++) {
      const origin = origins[i % origins.length];
      const angle = Math.atan2(py - origin.y, px - origin.x);
      const offset = i - ((shotCount - 1) / 2);
      const b = new Entity(EntityType.PROJECTILE, origin.x, origin.y);
      b.vx = Math.cos(angle + (offset * spread)) * speed;
      b.vy = Math.sin(angle + (offset * spread)) * speed;
      b.width = 15;
      b.height = 15;
      b.color = phase >= 3 ? '#ff7a18' : '#ff0000';
      b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      b.text = "";
      this.entities.push(b);
    }

    if (phase >= 4) {
      [-0.32, 0.32].forEach(offset => {
        const cx = boss.x + boss.width / 2;
        const cy = boss.y + boss.height - 20;
        const b = new Entity(EntityType.PROJECTILE, cx + boss.width * offset, cy - 8);
        b.vx = offset * 2.2;
        b.vy = speed * 0.95;
        b.width = 13;
        b.height = 18;
        b.color = '#f97316';
        b.damage = Math.max(1, Number(boss.projectileDamage) || 1);
        this.entities.push(b);
      });
    }
    this.playSound('boss_shoot', phase >= 3 ? 1.25 : 1, {
      pitchJitter: 0.09,
      pitchOffset: phase >= 3 ? -0.12 : -0.04
    });
  }

  spawnBossCoreVolley(boss: Entity, phase: number) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const pressure = 1 - healthRatio;
    const rigId = boss.bossRigId ?? 'open-orbit';
    const originX = boss.x + boss.width / 2;
    const originY = boss.y + boss.height * (rigId === 'crown-claw' ? 0.58 : 0.66);
    const playerX = this.player.x + this.player.width / 2;
    const playerY = this.player.y + this.player.height / 2;
    const baseAngle = Math.atan2(playerY - originY, playerX - originX);
    const tier = pressure >= 0.68 ? 2 : pressure >= 0.34 ? 1 : 0;
    const profiles: Record<BossRigId, {
      shotCounts: readonly [number, number, number];
      spread: number;
      speedScale: number;
      color: string;
      angleDrift: number;
    }> = {
      'open-orbit': {
        shotCounts: [1, 3, 5],
        spread: 0.17,
        speedScale: 0.92,
        color: '#fb7185',
        angleDrift: 0
      },
      'citation-storm': {
        shotCounts: [3, 5, 7],
        spread: 0.13,
        speedScale: 0.88,
        color: '#c084fc',
        angleDrift: Math.sin(boss.attackTimer * 0.19) * 0.11
      },
      'paywall-siege': {
        shotCounts: [3, 5, 7],
        spread: 0.11,
        speedScale: 0.84,
        color: '#facc15',
        angleDrift: 0
      },
      'crown-claw': {
        shotCounts: [3, 5, 7],
        spread: 0.2,
        speedScale: 0.96,
        color: '#2dd4bf',
        angleDrift: Math.sin(boss.attackTimer * 0.13) * 0.06
      }
    };
    const profile = profiles[rigId];
    const shotCount = profile.shotCounts[tier];
    const speed = (boss.projectileSpeed ?? Math.min(10.5, 6 + phase * 0.55))
      * (profile.speedScale + pressure * 0.18);

    for (let index = 0; index < shotCount; index++) {
      const offset = index - ((shotCount - 1) / 2);
      const angle = baseAngle + profile.angleDrift + offset * profile.spread;
      const projectile = new Entity(EntityType.PROJECTILE, originX - 8, originY - 8);
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
      projectile.width = tier >= 2 ? 17 : 15;
      projectile.height = tier >= 2 ? 17 : 15;
      projectile.color = profile.color;
      projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      projectile.variant = index + tier * 10;
      if (rigId === 'paywall-siege') {
        projectile.projectileVisualKind = 'boss-bolt';
        projectile.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
      }
      this.entities.push(projectile);
    }

    this.playSound('boss_shoot', 0.95 + pressure * 0.28, {
      pitchJitter: rigId === 'citation-storm' ? 0.12 : 0.06,
      pitchOffset: rigId === 'crown-claw' ? -0.16 : rigId === 'citation-storm' ? 0.06 : -0.08
    });
  }

  spawnBossBeam(boss: Entity, phase: number, pulseIndex: number) {
    const beamWidth = Math.min(112, 76 + (phase * 7));
    const bossCenterX = boss.x + boss.width / 2;
    const beamCenterX = Math.max(beamWidth / 2, Math.min(this.width - beamWidth / 2, bossCenterX));
    const beam = new Entity(EntityType.PROJECTILE, beamCenterX - beamWidth / 2, boss.y + boss.height - 20);
    beam.isBeam = true;
    beam.width = beamWidth;
    beam.height = this.height;
    beam.life = phase <= 1 ? 68 : Math.max(18, 32 - phase * 3);
    beam.maxLife = beam.life;
    beam.color = phase >= 3 ? '#ff7a18' : '#ff0000';
    beam.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    beam.beamAnchorOffsetX = boss.width / 2 - beamWidth / 2;
    beam.variant = pulseIndex;
    this.entities.push(beam);

    this.playSound('boss_shoot', 1.35, { pitchJitter: 0.04, pitchOffset: -0.18 });
    this.playSound(pulseIndex === 0 ? 'boss_roar' : 'electricity');
  }

  spawnPaywallBossRay(boss: Entity, enraged: boolean) {
    const beamWidth = Math.max(42, Math.min(enraged ? 68 : 58, boss.width * (enraged ? 0.26 : 0.22)));
    const anchorOffsetX = boss.width * 0.5 - beamWidth / 2;
    const beam = new Entity(EntityType.PROJECTILE, boss.x + anchorOffsetX, boss.y + boss.height * 0.68);
    beam.isBeam = true;
    beam.projectileVisualKind = 'boss-ray';
    beam.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_RAY_FRAMES];
    beam.width = beamWidth;
    beam.height = this.height;
    beam.life = enraged ? 70 : 62;
    beam.maxLife = beam.life;
    beam.color = '#ff9d2e';
    beam.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    beam.beamAnchorOffsetX = anchorOffsetX;
    beam.variant = enraged ? 1 : 0;
    this.entities.push(beam);
    this.playSound('boss_shoot', enraged ? 1.45 : 1.2, { pitchJitter: 0.04, pitchOffset: -0.2 });
    this.playSound('electricity');
  }

  spawnPaywallBossBoltVolley(boss: Entity, component: BossComponentState, enraged: boolean) {
    const componentBox = this.getBossComponentBox(boss, component);
    const cx = componentBox.x + componentBox.width / 2;
    const cy = componentBox.y + componentBox.height * 0.7;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const centerAngle = Math.atan2(py - cy, px - cx);
    const shotCount = enraged ? 5 : 3;
    const spread = enraged ? 0.12 : 0.15;
    const speed = (boss.projectileSpeed ?? 7.65) * (enraged ? 1.08 : 0.96);
    for (let index = 0; index < shotCount; index++) {
      const offset = index - ((shotCount - 1) / 2);
      const bolt = new Entity(EntityType.PROJECTILE, cx - 9, cy - 9);
      bolt.projectileVisualKind = 'boss-bolt';
      bolt.spriteFrames = [...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES];
      bolt.vx = Math.cos(centerAngle + offset * spread) * speed;
      bolt.vy = Math.sin(centerAngle + offset * spread) * speed;
      bolt.width = enraged ? 19 : 17;
      bolt.height = enraged ? 19 : 17;
      bolt.color = enraged ? '#fef08a' : '#ff9d2e';
      bolt.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      bolt.variant = index + (component.id === 'right-cannon' ? 10 : 0);
      this.entities.push(bolt);
    }
    this.playSound('boss_shoot', enraged ? 1.2 : 1, {
      pitchJitter: 0.08,
      pitchOffset: component.id === 'right-cannon' ? 0.04 : -0.04
    });
  }

  spawnCrownClawStrike(boss: Entity, component: BossComponentState, enraged: boolean) {
    const componentBox = this.getBossComponentBox(boss, component);
    const cx = componentBox.x + componentBox.width / 2;
    const cy = componentBox.y + componentBox.height * 0.72;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const angle = Math.atan2(playerCenterY - cy, playerCenterX - cx);
    const speed = (boss.projectileSpeed ?? 8.2) * (enraged ? 1.08 : 0.9);
    const claw = new Entity(EntityType.PROJECTILE, cx - 34, cy - 40);
    const isLeft = component.id === 'left-cannon';
    claw.projectileVisualKind = isLeft ? 'crown-claw-left' : 'crown-claw-right';
    claw.spriteFrames = [isLeft ? ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_RIGHT];
    claw.vx = Math.cos(angle) * speed;
    claw.vy = Math.sin(angle) * speed;
    claw.width = enraged ? 76 : 68;
    claw.height = enraged ? 90 : 80;
    claw.color = '#2dd4bf';
    claw.damage = Math.max(1, Number(boss.projectileDamage) || 1);
    claw.variant = isLeft ? 0 : 1;
    claw.life = CROWNCLAW_STRIKE_MAX_LIFE;
    claw.maxLife = CROWNCLAW_STRIKE_MAX_LIFE;
    claw.clawOutboundFrames = enraged ? 28 : 34;
    claw.bossOwnerId = boss.id;
    claw.bossComponentId = component.id;
    this.entities.push(claw);
    this.playSound('boss_shoot', enraged ? 1.2 : 0.95, {
      pitchJitter: 0.05,
      pitchOffset: isLeft ? -0.08 : -0.02
    });
  }

  isCrownClawProjectile(entity: Entity) {
    return entity.projectileVisualKind === 'crown-claw-left'
      || entity.projectileVisualKind === 'crown-claw-right';
  }

  updateCrownClawProjectile(claw: Entity) {
    claw.life--;
    if (claw.life <= 0) {
      claw.markedForDeletion = true;
      return;
    }

    const owner = this.bossRef?.id === claw.bossOwnerId ? this.bossRef : null;
    const component = owner?.bossComponents?.find((part) => part.id === claw.bossComponentId);
    if (!owner || owner.markedForDeletion || !component || component.destroyed) {
      claw.markedForDeletion = true;
      return;
    }

    const age = claw.maxLife - claw.life;
    if (!claw.clawReturning && age >= claw.clawOutboundFrames) {
      claw.clawReturning = true;
    }
    if (!claw.clawReturning) return;

    const componentBox = this.getBossComponentBox(owner, component);
    const targetX = componentBox.x + componentBox.width / 2;
    const targetY = componentBox.y + componentBox.height * 0.72;
    const centerX = claw.x + claw.width / 2;
    const centerY = claw.y + claw.height / 2;
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    const returnSpeed = (owner.projectileSpeed ?? 8.2) * 1.28;
    if (distance <= Math.max(18, returnSpeed * 1.35)) {
      claw.markedForDeletion = true;
      return;
    }
    claw.vx = (dx / distance) * returnSpeed;
    claw.vy = (dy / distance) * returnSpeed;
  }

  updatePaywallLayeredBoss(boss: Entity) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const playerCenterX = this.player.x + this.player.width / 2;
    const activeRays = this.entities.some((entity) => (
      entity.projectileVisualKind === 'boss-ray' && !entity.markedForDeletion
    ));
    if (boss.y < 78) {
      boss.vy = boss.configuredSpeed ?? 2;
    } else {
      boss.vy = 0;
      if (!boss.isCharging && !activeRays) {
        const targetX = playerCenterX - boss.width / 2;
        boss.x += (targetX - boss.x) * 0.012;
        boss.x += Math.sin(boss.attackTimer * 0.028) * 2.4;
      }
    }
    boss.x = clamp(boss.x, 0, this.width - boss.width);

    const cannons = (boss.bossComponents ?? []).filter((component) => (
      !component.destroyed && (component.id === 'left-cannon' || component.id === 'right-cannon')
    ));
    const helmet = boss.bossComponents?.find((component) => component.id === 'helmet');
    const coreEmitterOperational = boss.hp > 0;
    const coreExposed = Boolean(helmet?.destroyed);
    const allArmorDestroyed = (boss.bossComponents ?? []).every((component) => component.destroyed);
    const rayCycleLength = healthRatio <= 0.25 ? 232 : healthRatio <= 0.55 ? 274 : 318;
    const rayCycle = boss.attackTimer % rayCycleLength;
    const rayChargeStart = Math.round(rayCycleLength * (coreExposed ? 0.46 : 0.52));
    const rayChargeFrames = healthRatio <= 0.25 ? 32 : healthRatio <= 0.55 ? 40 : 48;
    const rayFireFrame = rayChargeStart + rayChargeFrames;
    boss.isCharging = coreEmitterOperational
      ? (rayCycle >= rayChargeStart && rayCycle < rayFireFrame) || activeRays
      : activeRays;
    if (coreEmitterOperational && rayCycle === rayChargeStart) {
      this.spawnFloatingText(boss.x + boss.width / 2, boss.y + boss.height * 0.82, 'CORE RAY CHARGING', '#fef08a', 16);
      this.playSound('boss_roar');
    }
    if (coreEmitterOperational && rayCycle === rayFireFrame) {
      this.spawnPaywallBossRay(boss, healthRatio <= 0.35 || coreExposed);
      boss.isCharging = true;
    }

    const boltInterval = Math.max(46, Math.round((allArmorDestroyed ? 54 : 76) * (0.72 + healthRatio * 0.28)));
    if (!boss.isCharging && cannons.length > 0 && boss.attackTimer - boss.lastBurstAttackTimer >= boltInterval) {
      const enraged = healthRatio <= 0.38;
      cannons.forEach((component) => this.spawnPaywallBossBoltVolley(boss, component, enraged));
      boss.lastBurstAttackTimer = boss.attackTimer;
    }
    if (!boss.isCharging && cannons.length === 0) {
      const coreInterval = healthRatio <= 0.25 ? 42 : healthRatio <= 0.55 ? 56 : 74;
      if (boss.attackTimer - boss.lastBurstAttackTimer >= coreInterval) {
        this.spawnBossCoreVolley(boss, 3);
        boss.lastBurstAttackTimer = boss.attackTimer;
      }
    }
  }

  updateCrownClawBoss(boss: Entity) {
    const healthRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const playerCenterX = this.player.x + this.player.width / 2;
    if (boss.y < 64) {
      boss.vy = boss.configuredSpeed ?? 2;
    } else {
      boss.vy = 0;
      const targetX = playerCenterX - boss.width / 2;
      boss.x += (targetX - boss.x) * 0.009;
      boss.x += Math.sin(boss.attackTimer * 0.026) * 1.8;
    }
    boss.x = clamp(boss.x, 0, this.width - boss.width);

    const activeClaws = (boss.bossComponents ?? []).filter((component) => !component.destroyed);
    const attackInterval = Math.max(66, Math.round(126 * (0.52 + healthRatio * 0.48)));
    const framesSinceAttack = boss.attackTimer - boss.lastBurstAttackTimer;
    boss.isCharging = activeClaws.length > 0 && framesSinceAttack >= attackInterval - 18;
    if (framesSinceAttack < attackInterval) return;

    if (activeClaws.length > 0) {
      const attackIndex = Math.floor(boss.attackTimer / attackInterval) % activeClaws.length;
      const component = activeClaws[attackIndex];
      boss.beamLaneSign = component.id === 'left-cannon' ? -1 : 1;
      this.spawnCrownClawStrike(boss, component, healthRatio <= 0.35);
    } else {
      boss.beamLaneSign = 0;
      this.spawnBossBurst(boss, 4);
    }
    boss.lastBurstAttackTimer = boss.attackTimer;
    boss.isCharging = false;
  }

  spawnBossCrossBeamPair(boss: Entity, telegraph: boolean) {
    if (!telegraph) {
      for (const entity of this.entities) {
        if (entity.isBeam && entity.isTelegraph && entity.bossOwnerId === boss.id) {
          entity.markedForDeletion = true;
        }
      }
    }

    const thickness = telegraph ? 9 : 20;
    const lifetime = telegraph ? 34 : 26;
    const color = telegraph ? '#7dd3fc' : '#22d3ee';
    const createBeam = (axis: 'vertical' | 'horizontal') => {
      const beam = new Entity(
        EntityType.PROJECTILE,
        axis === 'vertical' ? boss.x + boss.width / 2 - thickness / 2 : 0,
        axis === 'horizontal' ? boss.y + boss.height / 2 - thickness / 2 : 0
      );
      beam.isBeam = true;
      beam.beamAxis = axis;
      beam.beamFromCenter = true;
      beam.isTelegraph = telegraph;
      beam.bossOwnerId = boss.id;
      beam.width = axis === 'vertical' ? thickness : this.width;
      beam.height = axis === 'horizontal' ? thickness : this.height;
      beam.life = lifetime;
      beam.maxLife = lifetime;
      beam.color = color;
      beam.damage = telegraph ? 0 : Math.max(1, Number(boss.projectileDamage) || 1);
      this.entities.push(beam);
    };

    createBeam('vertical');
    createBeam('horizontal');
    if (telegraph) {
      this.spawnFloatingText(boss.x + boss.width / 2, boss.y + boss.height + 8, 'CROSS-LINK CHARGING', '#bae6fd', 15);
    } else {
      this.playSound('electricity');
      this.playSound('boss_shoot', 1.18, { pitchJitter: 0.03, pitchOffset: 0.08 });
      this.addShake(2.6);
      this.addHitStop(3);
    }
  }

  updateArenaRoamingBoss(boss: Entity, healthRatio: number, phase: number) {
    const targetEntranceY = Math.max(72, Math.min(this.height * 0.13, 116));
    if (boss.y < targetEntranceY) {
      boss.y += Math.max(1.4, boss.configuredSpeed ?? 2);
      boss.x += ((this.width - boss.width) / 2 - boss.x) * 0.06;
      return;
    }

    boss.vx = 0;
    boss.vy = 0;
    const roamWidth = Math.max(24, this.width - boss.width - 24);
    const roamHeight = Math.max(42, Math.min(this.height * 0.34, 280) - targetEntranceY);
    const targetX = 12
      + roamWidth * (0.5 + Math.sin(boss.attackTimer * 0.017) * 0.37)
      + Math.sin(boss.attackTimer * 0.006) * Math.min(26, this.width * 0.05);
    const targetY = targetEntranceY
      + roamHeight * (0.43 + Math.cos(boss.attackTimer * 0.013) * 0.34);
    const pressure = 1 - clamp(healthRatio, 0, 1);
    boss.x += (targetX - boss.x) * (0.035 + pressure * 0.018);
    boss.y += (targetY - boss.y) * (0.028 + pressure * 0.012);
    boss.x = clamp(boss.x, 10, this.width - boss.width - 10);
    boss.y = clamp(boss.y, targetEntranceY, Math.max(targetEntranceY, this.height * 0.48 - boss.height));

    const cycleLength = Math.max(250, 318 - Math.round(pressure * 44));
    const attackCycle = boss.attackTimer % cycleLength;
    const telegraphFrame = cycleLength - 70;
    const fireFrame = cycleLength - 34;
    const crossActive = this.entities.some((entity) => (
      entity.isBeam && entity.bossOwnerId === boss.id && !entity.markedForDeletion
    ));
    if (attackCycle === telegraphFrame) {
      boss.isCharging = true;
      this.spawnBossCrossBeamPair(boss, true);
      return;
    }
    if (attackCycle === fireFrame) {
      boss.isCharging = true;
      this.spawnBossCrossBeamPair(boss, false);
      return;
    }

    boss.isCharging = crossActive || (attackCycle >= telegraphFrame && attackCycle <= fireFrame + 30);
    if (boss.isCharging) return;

    const baseInterval = boss.attackIntervalFrames ?? 58;
    const fireInterval = Math.max(20, Math.round(baseInterval * (1 - pressure * 0.34)));
    if (boss.attackTimer - boss.lastBurstAttackTimer >= fireInterval) {
      this.spawnBossBurst(boss, Math.max(2, phase));
      boss.lastBurstAttackTimer = boss.attackTimer;
    }
  }

  spawnBossGapRing(boss: Entity) {
    const cycle = this.getCampaignCycle();
    const originX = boss.x + boss.width / 2;
    const originY = boss.y + boss.height * 0.62;
    const playerAngle = Math.atan2(
      this.player.y + this.player.height / 2 - originY,
      this.player.x + this.player.width / 2 - originX
    );
    const shotCount = Math.min(28, 16 + cycle * 2);
    const gapHalfWidth = Math.max(0.34, 0.62 - cycle * 0.035);
    const speed = Math.min(6.2, 3.3 + cycle * 0.3);

    for (let index = 0; index < shotCount; index++) {
      const angle = (Math.PI * 2 * index) / shotCount;
      const distanceFromGap = Math.abs(Math.atan2(
        Math.sin(angle - playerAngle),
        Math.cos(angle - playerAngle)
      ));
      if (distanceFromGap < gapHalfWidth) continue;

      const projectile = new Entity(EntityType.PROJECTILE, originX - 6, originY - 6);
      projectile.vx = Math.cos(angle) * speed;
      projectile.vy = Math.sin(angle) * speed;
      projectile.width = 12;
      projectile.height = 12;
      projectile.color = '#fb7185';
      projectile.damage = Math.max(1, Number(boss.projectileDamage) || 1);
      this.entities.push(projectile);
    }

    this.spawnRingEffect(originX, originY, '#fb7185');
    this.playSound('boss_shoot', 1.08, { pitchJitter: 0.05, pitchOffset: -0.08 });
  }

  queueBossTargetStrike(boss: Entity) {
    const targetX = clamp(this.player.x + this.player.width / 2, 34, this.width - 34);
    const targetY = clamp(this.player.y + this.player.height / 2, 90, this.height - 54);
    const warningFrames = 54;
    this.pendingBossStrikes.push({
      bossId: boss.id,
      x: targetX,
      y: targetY,
      frames: warningFrames,
      warningFrames
    });
    this.spawnFloatingText(targetX, targetY - 24, 'MISSILE LOCK', '#f87171', 15);
    this.spawnRingEffect(targetX, targetY, '#ef4444');
    this.playSound('siren', 0.74);
  }

  updatePendingBossStrikes() {
    if (this.pendingBossStrikes.length === 0) return;
    const activeBossIds = new Set(this.entities
      .filter((entity) => entity.type === EntityType.BOSS && !entity.markedForDeletion)
      .map((entity) => entity.id));

    for (const strike of this.pendingBossStrikes) {
      if (!activeBossIds.has(strike.bossId)) {
        strike.frames = 0;
        continue;
      }
      strike.frames--;
      if (strike.frames > 0 && strike.frames % 10 === 0) {
        this.spawnRingEffect(strike.x, strike.y, '#ef4444');
      }
      if (strike.frames !== 0) continue;

      const cycle = this.getCampaignCycle();
      const missileCount = Math.min(3, 1 + Math.floor(cycle / 2));
      for (let index = 0; index < missileCount; index++) {
        const offset = (index - (missileCount - 1) / 2) * 22;
        const missile = new Entity(EntityType.PROJECTILE, strike.x + offset - 8, -34 - index * 18);
        missile.vx = 0;
        missile.vy = Math.min(10, 6.4 + cycle * 0.35);
        missile.width = 16;
        missile.height = 30;
        missile.color = '#f97316';
        missile.damage = 1;
        this.entities.push(missile);
      }
      this.spawnRingEffect(strike.x, strike.y, '#facc15');
      this.playSound('boss_shoot', 1.18, { pitchJitter: 0.03, pitchOffset: -0.16 });
    }

    this.pendingBossStrikes = this.pendingBossStrikes.filter((strike) => strike.frames > 0);
  }

  updateEscalationBossAttacks(boss: Entity) {
    const cycle = this.getCampaignCycle();
    if (cycle < 1 || boss.y < 48 || boss.isCharging) return;
    const ringInterval = Math.max(250, 390 - cycle * 22);
    const strikeInterval = Math.max(300, 470 - cycle * 24);
    if (boss.attackTimer > 90 && boss.attackTimer % ringInterval === 0) {
      this.spawnBossGapRing(boss);
      return;
    }
    if (boss.attackTimer > 120 && boss.attackTimer % strikeInterval === Math.floor(strikeInterval * 0.48)) {
      this.queueBossTargetStrike(boss);
    }
  }

  updateBoss(boss: Entity) {
    boss.attackTimer++;
    this.updateEscalationBossAttacks(boss);
    if (boss.bossRigId === 'paywall-siege') {
      this.updatePaywallLayeredBoss(boss);
      return;
    }
    if (boss.bossRigId === 'crown-claw') {
      this.updateCrownClawBoss(boss);
      return;
    }
    const healthRatio = boss.maxHp > 0 ? boss.hp / boss.maxHp : 1;
    const configuredPhase = boss.phaseThresholds.length > 0
      ? Math.max(1, boss.phaseThresholds.filter((threshold) => healthRatio <= threshold).length)
      : 0;
    const phase = configuredPhase || Math.max(1, this.stats.wave);
    if (boss.movementPattern === 'arena-roam') {
      this.updateArenaRoamingBoss(boss, healthRatio, phase);
      return;
    }
    const speedMult = 1 + (phase * 0.1);
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerNearEdge = playerCenterX < this.width * 0.18 || playerCenterX > this.width * 0.82;
    const hasActiveBeam = this.entities.some(e => e.isBeam && !e.markedForDeletion);
    if (boss.y < 80) boss.vy = boss.configuredSpeed ?? 2;
    else {
      boss.vy = 0;
      if (!boss.isCharging && !hasActiveBeam) {
          const hoverOffset = Math.sin(boss.attackTimer * 0.03) * (playerNearEdge ? 1.4 : 3);
          const edgeLead = playerNearEdge
            ? (playerCenterX < this.width / 2 ? -boss.width * 0.24 : boss.width * 0.24)
            : 0;
          const targetX = playerCenterX - boss.width / 2 + edgeLead;
          const dx = targetX - boss.x;
          const followRate = (playerNearEdge ? 0.026 : 0.015) + Math.min(0.014, (phase - 1) * 0.003);
          if (Math.abs(dx) > 6) boss.x += (dx * followRate) * speedMult;
          boss.x += hoverOffset;
      }
    }
    
    boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
    const hullPressure = 1 - clamp(healthRatio, 0, 1);
    const pressureCadence = 1 - hullPressure * 0.34;
    const cycleLength = Math.max(250, Math.round((410 - Math.min(4, phase - 1) * 18) * pressureCadence));
    const burstEnd = Math.max(170, Math.round((250 - Math.min(4, phase - 1) * 8) * pressureCadence));
    const chargeEnd = burstEnd + 70;
    const attackCycle = boss.attackTimer % cycleLength;
    const hasConfiguredWeapons = boss.weaponKinds.length > 0;
    const bossComponents = boss.bossComponents ?? [];
    const hasOperationalCannon = bossComponents.length === 0 || bossComponents.some((component) => (
      !component.destroyed && (component.id === 'left-cannon' || component.id === 'right-cannon')
    ));
    const allowsBeam = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => kind.includes('beam'));
    const allowsBurst = !hasConfiguredWeapons || boss.weaponKinds.some((kind) => !kind.includes('beam'));
    
    if (attackCycle < burstEnd || !allowsBeam) {
        boss.isCharging = false;
        const baseFireRate = boss.attackIntervalFrames ?? Math.max(20, 60 - (phase * 7));
        const isGatekeeper = boss.sourceItemId === 'gatekeeper' || boss.text === 'GATEKEEPER';
        const cadenceConfig = isGatekeeper ? GATEKEEPER_CADENCE_BY_WAVE[this.wave] : undefined;
        const healthScaledBaseFireRate = cadenceConfig
          ? baseFireRate
          : Math.max(14, Math.round(baseFireRate * (0.62 + clamp(healthRatio, 0, 1) * 0.38)));
        const fireRate = cadenceConfig
          ? getGatekeeperBurstInterval(baseFireRate, healthRatio, cadenceConfig)
          : healthScaledBaseFireRate;
        const activeFireRate = hasOperationalCannon
          ? fireRate
          : Math.max(16, Math.round(fireRate * (boss.bossRigId === 'citation-storm' ? 1.02 : 1.12)));
        const pressuredFireRate = Math.max(8, Math.round(activeFireRate * (1 - hullPressure * 0.28)));
        const isBurstReady = boss.attackTimer - boss.lastBurstAttackTimer >= pressuredFireRate;
        if (allowsBurst && isBurstReady) {
          this.spawnBossBurst(boss, phase);
          boss.lastBurstAttackTimer = boss.attackTimer;
        }
    } else if (attackCycle >= burstEnd && attackCycle < chargeEnd) {
        if (attackCycle === burstEnd || boss.beamLaneSign === 0) {
          boss.beamLaneSign = Math.random() < 0.5 ? -1 : 1;
        }

        boss.isCharging = true;
        const laneCenterX = boss.beamLaneSign < 0 ? this.width * 0.3 : this.width * 0.7;
        const laneTargetX = laneCenterX - boss.width / 2;
        boss.x += (laneTargetX - boss.x) * (0.038 + Math.min(0.02, phase * 0.003));
        boss.x += Math.sin(boss.attackTimer * 0.24) * 1.2;
        if (boss.attackTimer % 15 === 0) {
             const laneLabel = boss.beamLaneSign < 0 ? "LEFT" : "RIGHT";
             this.spawnFloatingText(boss.x + boss.width/2, boss.y, `${laneLabel} BEAM!`, "#ff0000");
        }
    } else {
        const pulseIndex = Math.floor((attackCycle - chargeEnd) / Math.max(18, 26 - phase * 2));
        const pulseFrame = (attackCycle - chargeEnd) % Math.max(18, 26 - phase * 2);
        const pulseCount = this.getBossPulseCount(phase);
        if (pulseIndex >= 0 && pulseIndex < pulseCount && pulseFrame === 0) {
          this.spawnBossBeam(boss, phase, pulseIndex);
        }
        boss.isCharging = (pulseIndex >= 0 && pulseIndex < pulseCount) || hasActiveBeam;
        if (!boss.isCharging) boss.beamLaneSign = 0;
    }
  }

  spawnPowerup(x: number, y: number, forcedPowerupId?: string) {
    const powerupIdToType: Record<string, PowerupType> = {
      'double-shot': PowerupType.DOUBLE_SHOT,
      'triple-shot': PowerupType.TRIPLE_SHOT,
      magnet: PowerupType.MAGNET,
      shield: PowerupType.SHIELD,
      'research-beam': PowerupType.RESEARCH_BEAM,
      'extra-life': PowerupType.EXTRA_LIFE
    };
    const weights = new Map<PowerupType, number>([
      [PowerupType.RESEARCH_BEAM, 0.08],
      [PowerupType.DOUBLE_SHOT, 0.36],
      [PowerupType.TRIPLE_SHOT, 0.34],
      [PowerupType.MAGNET, 0.12],
      [PowerupType.SHIELD, 0.1],
      [PowerupType.EXTRA_LIFE, 0.02]
    ]);
    const configuredIds = this.getCurrentLevelDefinition()?.availablePowerupIds;
    const allowed = Array.isArray(configuredIds) && configuredIds.length > 0
      ? configuredIds.map((id) => powerupIdToType[id]).filter((type): type is PowerupType => Boolean(type))
      : Array.from(weights.keys()).filter((type) => type !== PowerupType.EXTRA_LIFE);
    const candidates = allowed.length > 0 ? allowed : [PowerupType.DOUBLE_SHOT];
    const totalWeight = candidates.reduce((sum, candidate) => sum + (weights.get(candidate) || 0.01), 0);
    let roll = Math.random() * totalWeight;
    let type = forcedPowerupId && powerupIdToType[forcedPowerupId]
      ? powerupIdToType[forcedPowerupId]
      : candidates[0];
    if (!forcedPowerupId || !powerupIdToType[forcedPowerupId]) {
      for (const candidate of candidates) {
        roll -= weights.get(candidate) || 0.01;
        if (roll <= 0) {
          type = candidate;
          break;
        }
      }
    }

    const p = new Entity(EntityType.POWERUP, x, y);
    p.text = type; 
    p.width = 36;
    p.height = 36;
    p.vy = 2.0;
    p.variant = Math.floor(Math.random() * 1000);
    this.entities.push(p);
    return p;
  }

  spawnBombDrop(x: number, y: number) {
    const b = new Entity(EntityType.BOMB, x, y);
    b.width = 38;
    b.height = 38;
    b.vy = 1.7;
    b.vx = randomRange(-0.35, 0.35);
    b.variant = Math.floor(Math.random() * 1000);
    this.entities.push(b);
  }

  spawnCoin(x: number, y: number) {
    const c = new Entity(EntityType.COIN, x, y);
    c.width = 24; 
    c.height = 24;
    c.vy = 2.0;
    c.vx = randomRange(-0.25, 0.25);
    c.variant = Math.floor(Math.random() * 1000);
    this.entities.push(c);
    return c;
  }

  spawnExplosion(x: number, y: number, color: string, intensity: number = 1) {
    if (intensity >= 1.2) {
      this.playSound('explode', intensity, {
        pitchJitter: 0.08,
        pitchOffset: -0.14
      });
    } else {
      this.playSound('impact', Math.max(0.18, intensity * 0.32), {
        pitchJitter: 0.08,
        pitchOffset: -0.1
      });
    }
    this.spawnBurst(x, y, color, this.shouldUseLeanEffects() ? 7 : 12, 5, 5);
    this.addShake(this.shouldUseLeanEffects() ? 0.55 : 0.9);
  }

  spawnFloatingText(x: number, y: number, text: string, color: string, fontSize: number = 32) {
    if (this.liveEffectCount >= this.getEffectCap()) return;
    this.entities.push(new VisualEffect(x, y, 'text', text, color, fontSize));
    this.liveEffectCount++;
  }

  spawnRingEffect(x: number, y: number, color: string) {
    if (this.liveEffectCount >= this.getEffectCap()) return;
    this.entities.push(new VisualEffect(x, y, 'ring', '', color));
    this.liveEffectCount++;
  }

  registerCoinPickup(x: number, y: number) {
    this.coinCombo = this.coinComboTimer > 0 ? this.coinCombo + 1 : 1;
    this.coinComboTimer = GAME_FEEL.comboWindowFrames;
    const label = this.coinCombo > 1 ? `+1 x${Math.min(this.coinCombo, 99)}` : '+1';
    const lean = this.shouldUseLeanEffects();
    this.playSound('coin', Math.min(this.coinCombo, 10));
    if (!lean || this.coinCombo % 3 === 0) {
      this.spawnFloatingText(x, y - 12, label, this.coinCombo > 1 ? '#facc15' : '#67e8f9', this.coinCombo > 1 ? 18 : 16);
    }
    this.spawnBurst(x, y, '#facc15', lean ? 2 : this.coinCombo > 1 ? 8 : 5, 2.4, 3.5);
    this.kickPlayerSquash(0.026);
    this.addShake(lean ? 0.12 : this.coinCombo > 4 ? 0.48 : 0.22);
  }

  activatePowerup(type: PowerupType, countUse: boolean = true) {
    if (countUse) {
      this.stats.powerupUses = {
        ...this.stats.powerupUses,
        [type]: (this.stats.powerupUses?.[type] || 0) + 1
      };
    }

    if (type !== PowerupType.EXTRA_LIFE) {
      const currentDuration = this.activePowerups.get(type) || 0;
      const isFounderShot = type === PowerupType.DOUBLE_SHOT || type === PowerupType.TRIPLE_SHOT;
      const duration = type === PowerupType.RESEARCH_BEAM
        ? GAME_CONFIG.RESEARCH_BEAM_DURATION
        : isFounderShot
          ? GAME_CONFIG.FOUNDER_SHOT_DURATION
          : GAME_CONFIG.POWERUP_DURATION;
      this.activePowerups.set(type, currentDuration + duration);
    }

    this.playSound('powerup');
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;

    if (type === PowerupType.SHIELD) {
      this.invincibleTimer += GAME_CONFIG.SHIELD_DURATION;
      this.spawnFloatingText(cx, cy - 20, "SHIELD!", "#00C851");
      this.spawnRingEffect(cx, cy, "#00C851");
    } else if (type === PowerupType.MAGNET) {
      this.spawnFloatingText(cx, cy - 20, "MAGNET!", "#FFD700");
      this.spawnRingEffect(cx, cy, "#FFD700");
    } else if (type === PowerupType.TRIPLE_SHOT || type === PowerupType.DOUBLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "OVERDRIVE SPREAD!", "#67e8f9");
      this.spawnRingEffect(cx, cy, "#67e8f9");
    } else if (type === PowerupType.RESEARCH_BEAM) {
      this.spawnFloatingText(cx, cy - 20, "RESEARCH BEAM!", "#a855f7");
      this.spawnRingEffect(cx, cy, "#a855f7");
    } else if (type === PowerupType.EXTRA_LIFE) {
      this.lives = Math.min(this.lives + 1, GAME_CONFIG.MAX_LIVES);
      this.stats.lives = this.lives;
      this.spawnFloatingText(cx, cy - 20, "+1 LIFE!", "#ff4444");
      this.spawnRingEffect(cx, cy, "#ff4444");
    }
    emitSquadDomainEvent('powerup_collected', {
      profileId: this.squadLoadout?.profileId ?? 'guest',
      powerup: type
    });
  }

  getCollisionBox(entity: Entity) {
    let insetX = 0;
    let insetY = 0;

    switch (entity.type) {
      case EntityType.PLAYER:
        insetX = entity.width * 0.29;
        insetY = entity.height * 0.24;
        break;
      case EntityType.PROJECTILE:
      case EntityType.MISSILE:
        insetX = entity.width * 0.2;
        insetY = entity.isBeam ? entity.height * 0.04 : entity.height * 0.2;
        break;
      case EntityType.ENEMY_SWARM:
        insetX = entity.width * 0.24;
        insetY = entity.height * 0.24;
        break;
      case EntityType.ENEMY_DRONE:
      case EntityType.ENEMY_JOURNAL:
        insetX = entity.width * 0.16;
        insetY = entity.height * 0.16;
        break;
      case EntityType.ENEMY_BRICK:
      case EntityType.ENEMY_INVADER:
        insetX = entity.width * 0.1;
        insetY = entity.height * 0.1;
        break;
      case EntityType.MINI_BOSS:
      case EntityType.BOSS:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
        break;
      default:
        insetX = entity.width * 0.08;
        insetY = entity.height * 0.08;
    }

    return {
      x: entity.x + insetX,
      y: entity.y + insetY,
      width: Math.max(4, entity.width - insetX * 2),
      height: Math.max(4, entity.height - insetY * 2)
    };
  }

  boxesIntersect(a: CollisionBox, b: CollisionBox) {
    return !(b.x > a.x + a.width || b.x + b.width < a.x || b.y > a.y + a.height || b.y + b.height < a.y);
  }

  resolvePlayerRamCollision(enemy: Entity, protectedFromDamage: boolean) {
    if (this.frameCount - this.lastPlayerRamFrame < PLAYER_RAM_COOLDOWN_FRAMES) return;
    this.lastPlayerRamFrame = this.frameCount;

    const bossContact = enemy.type === EntityType.BOSS || enemy.type === EntityType.MINI_BOSS;
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerCenterY = this.player.y + this.player.height / 2;
    const enemyCenterX = enemy.x + enemy.width / 2;
    const enemyCenterY = enemy.y + enemy.height / 2;
    const deltaX = playerCenterX - enemyCenterX;
    const deltaY = playerCenterY - enemyCenterY;
    const distance = Math.hypot(deltaX, deltaY);
    const normalX = distance > 0.001 ? deltaX / distance : 0;
    const normalY = distance > 0.001 ? deltaY / distance : 1;
    const recoilForce = bossContact ? 11.5 : 8.5;
    const separation = bossContact ? 14 : 9;

    this.playerVel.x += normalX * recoilForce;
    this.playerVel.y += normalY * recoilForce;
    this.player.x = clamp(
      this.player.x + normalX * separation,
      0,
      Math.max(0, this.width - this.player.width)
    );
    this.player.y = clamp(
      this.player.y + normalY * separation,
      0,
      Math.max(0, this.height - this.player.height)
    );

    if (!bossContact) {
      enemy.vx -= normalX * 1.8;
      enemy.vy -= normalY * 1.2;
    }

    if (!protectedFromDamage) {
      const incomingDamage = Math.max(1, Math.round(Number(enemy.contactDamage) || 1));
      if (!this.testMode) this.lives -= incomingDamage;
      this.invincibleTimer = 60;
    } else if (this.activePowerups.has(PowerupType.SHIELD)) {
      const shieldPenalty = bossContact ? 150 : 30;
      const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
      this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - shieldPenalty));
    }

    this.stats.lives = this.lives;
    const contactX = (playerCenterX + enemyCenterX) / 2;
    const contactY = (playerCenterY + enemyCenterY) / 2;
    const contactColor = protectedFromDamage ? '#67e8f9' : '#fb7185';
    this.playSound('hit');
    this.spawnRingEffect(contactX, contactY, contactColor);
    this.spawnBurst(contactX, contactY, contactColor, bossContact ? 12 : 8, bossContact ? 4.8 : 3.6, 4);
    this.flashAlpha = Math.max(this.flashAlpha, protectedFromDamage ? 0.3 : 0.5);
    this.addShake(bossContact ? 9.5 : 6.5);
    this.addHitStop(bossContact ? 10 : 7);
    this.kickPlayerSquash(bossContact ? 0.28 : 0.2);

    if (!bossContact && !enemy.markedForDeletion) {
      this.handleEnemyDestroyed(enemy);
    }

    if (!this.testMode && this.lives <= 0) this.startDeathSequence();
  }

  checkCollisions() {
    const collisionBoxes = this.collisionBoxes;
    collisionBoxes.clear();
    const getBox = (entity: Entity) => {
      let box = collisionBoxes.get(entity);
      if (!box) {
        box = this.getCollisionBox(entity);
        collisionBoxes.set(entity, box);
      }
      return box;
    };
    const intersectsPlayer = (entity: Entity) => this.boxesIntersect(getBox(this.player), getBox(entity));
    const enemyTargets = this.enemyTargetsBuffer;
    const playerShots = this.playerShotsBuffer;
    enemyTargets.length = 0;
    playerShots.length = 0;

    for (const e of this.entities) {
      if (e.markedForDeletion) continue;
      const isEnemy = this.isEnemyTarget(e);

      if (isEnemy) {
        enemyTargets.push(e);
      }

      if ((e.type === EntityType.PROJECTILE && e.isPlayerShot) || e.type === EntityType.MISSILE) {
        playerShots.push(e);
      }

      if (e.type === EntityType.POWERUP && intersectsPlayer(e)) {
        e.markedForDeletion = true;
        const type = e.text as PowerupType;
        this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#ffffff', 9, 3.2, 4);
        this.kickPlayerSquash(0.06);
        this.addShake(0.65);
        this.activatePowerup(type);
      }

      if (e.type === EntityType.COIN && intersectsPlayer(e)) {
        e.markedForDeletion = true;
        this.stats.coins++;
        this.stats.totalCoins++; 
        this.stats.score += (this.activePowerups.has(PowerupType.MAGNET) ? 2 : 1);
        this.addFlaskChargeFromCoin();
        this.registerCoinPickup(e.x + e.width / 2, e.y + e.height / 2);
        
        // REMOVED AUTOMATIC LIFE GAIN
      }

      if (e.type === EntityType.BOMB && intersectsPlayer(e)) {
        e.markedForDeletion = true;
        this.stats.bombs = Math.min(MAX_BOMBS, (this.stats.bombs || 0) + 1);
        this.spawnFloatingText(e.x + e.width / 2, e.y - 10, 'BOMB +1', '#facc15', 18);
        this.spawnRingEffect(e.x + e.width / 2, e.y + e.height / 2, '#facc15');
        this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#facc15', 9, 3.2, 4);
        this.kickPlayerSquash(0.045);
        this.addShake(0.5);
        this.playSound('powerup');
      }

      // Determine if this entity hurts the player
      let hurtsPlayer = false;

      // 1. Enemies always hurt
      if (isEnemy) {
          hurtsPlayer = true;
      }

      // 2. Projectiles hurt ONLY if they are NOT player shots
      if (e.type === EntityType.PROJECTILE) {
          // If it's a beam, it hurts (Boss weapon)
          if (e.isBeam) {
              hurtsPlayer = !e.isTelegraph;
          }
          // If it's NOT a player shot, it hurts
          else if (!e.isPlayerShot && !e.clawReturning && !e.clawHasHitPlayer) {
               // EXTRA FAILSAFE: If it's Cyan or Purple, assume it's player ammo (glitch protection)
               if (e.color !== '#00FFFF' && e.color !== '#00ffff' && e.color !== '#6c63ff') {
                   hurtsPlayer = true;
               }
          }
      }
      
      // The Director is an inspection surface, so its preview ship must survive long
      // enough to observe a complete wave without changing production combat rules.
      const isInvincible = this.previewMode || this.invincibleTimer > 0 || this.activePowerups.has(PowerupType.SHIELD);

      if (hurtsPlayer && intersectsPlayer(e)) {
        if (isEnemy) {
          this.resolvePlayerRamCollision(e, isInvincible);
          continue;
        }

        if (isInvincible) {
           if (e.type === EntityType.PROJECTILE && !e.isBeam) {
             if (this.isCrownClawProjectile(e)) {
               e.clawReturning = true;
               e.clawHasHitPlayer = true;
             } else {
               e.markedForDeletion = true;
             }
           }
           this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#00C851', 7, 4, 4);
           this.addShake(1.1);
           this.kickPlayerSquash(0.055);
           
           // Blocking hostile fire still consumes shield duration.
           if (this.activePowerups.has(PowerupType.SHIELD)) {
               const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
               const penalty = 30;
               this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - penalty));
               
               // Also reduce base Invincible timer if active (e.g. from pickup)
               if (this.invincibleTimer > 0) {
                   this.invincibleTimer = Math.max(0, this.invincibleTimer - penalty);
               }
           }

        } else {
          const incomingDamage = e.type === EntityType.PROJECTILE
            ? Math.max(1, Math.round(Number(e.damage) || 1))
            : Math.max(1, Math.round(Number(e.contactDamage) || 1));
          if (!this.testMode) {
            this.lives -= incomingDamage;
          }
          this.stats.lives = this.lives;
          this.invincibleTimer = 60; 
          this.playSound('hit');
          this.spawnExplosion(this.player.x, this.player.y, '#ffffff');
          this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y + 8, 'HIT!', '#fb7185', 22);
          this.flashAlpha = Math.max(this.flashAlpha, 0.48);
          this.addShake(7);
          this.addHitStop(10);
          this.kickPlayerSquash(0.22);
          const shove = this.player.x + this.player.width / 2 < e.x + e.width / 2 ? -4.5 : 4.5;
          this.playerVel.x += shove;
          this.playerVel.y += 2.4;
          // Only delete bullet if it isn't a beam
           if (e.type === EntityType.PROJECTILE && !e.isBeam) {
             if (this.isCrownClawProjectile(e)) {
               e.clawReturning = true;
               e.clawHasHitPlayer = true;
             } else {
               e.markedForDeletion = true;
             }
           }
          if (!this.testMode && this.lives <= 0) this.startDeathSequence();
        }
      }

    }

    const collisionColumns = this.enemyCollisionColumns;
    const collisionColumnCount = Math.max(1, Math.ceil(this.width / COLLISION_COLUMN_WIDTH));
    while (collisionColumns.length < collisionColumnCount) collisionColumns.push([]);
    collisionColumns.length = collisionColumnCount;
    for (let index = 0; index < collisionColumns.length; index++) collisionColumns[index].length = 0;

    for (let index = 0; index < enemyTargets.length; index++) {
      const target = enemyTargets[index];
      const targetBox = getBox(target);
      const projectilePadding = target.type === EntityType.BOSS ? 64 : 28;
      const startColumn = clamp(Math.floor((targetBox.x - projectilePadding) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      const endColumn = clamp(Math.floor((targetBox.x + targetBox.width + projectilePadding) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      for (let column = startColumn; column <= endColumn; column++) collisionColumns[column].push(target);
    }

    const bossShieldedNow = this.isBossShielded();

    for (const shot of playerShots) {
      if (shot.markedForDeletion) continue;
      const shotBox = getBox(shot);
      const shotColumn = clamp(Math.floor((shotBox.x + shotBox.width / 2) / COLLISION_COLUMN_WIDTH), 0, collisionColumnCount - 1);
      const nearbyTargets = collisionColumns[shotColumn];

      for (let index = 0; index < nearbyTargets.length; index++) {
        const target = nearbyTargets[index];
        if (target.markedForDeletion) continue;
        if (shot.hitTargetIds?.has(target.id)) continue;
        const bossComponent = target.type === EntityType.BOSS
          ? this.getBossComponentHit(target, shotBox)
          : undefined;
        const padding = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS ? 42 : 18;
        if (!bossComponent && (
          shotBox.x > target.x + target.width + padding
          || shotBox.x + shotBox.width < target.x - padding
          || shotBox.y > target.y + target.height + padding
          || shotBox.y + shotBox.height < target.y - padding
        )) {
          continue;
        }
        if (!bossComponent && !this.boxesIntersect(shotBox, getBox(target))) continue;

        if (shot.shipAbilityKind === 'research-charge') {
          this.detonateResearchCharge(shot, shot.x + shot.width / 2, shot.y + shot.height * 0.35);
          break;
        }

        // Boss-type enemies get shaved down a bit faster so fights don't drag.
        const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
        const bossShielded = target.type === EntityType.BOSS && bossShieldedNow;
        if (bossShielded) {
          if (!shot.isBeam) shot.markedForDeletion = true;
          this.pulseDamageFlash(target);
          if (this.frameCount % 5 === 0) {
            this.spawnRingEffect(shot.x + shot.width / 2, shot.y + shot.height / 2, '#a7f3d0');
            this.spawnBurst(shot.x + shot.width / 2, shot.y + shot.height / 2, '#a7f3d0', shot.type === EntityType.MISSILE ? 6 : 3, 2.2, 3);
          }
          if (shot.type === EntityType.MISSILE) {
            this.addHitStop(3);
            this.addShake(0.9);
          }
          if (!shot.isBeam) break;
          continue;
        }

        const dmg = shot.type === EntityType.MISSILE
          ? (isBossTarget ? 8 : 5)
          : shot.damage * (isBossTarget ? 1.35 : 1);
        if (!shot.isBeam) {
          if ((shot.weaponKind === 'ion' || shot.weaponKind === 'nova' || shot.weaponKind === 'singularity' || shot.weaponKind === 'bio-laser' || shot.weaponKind === 'eth-shard' || shot.weaponKind === 'btc-hash') && shot.pierceRemaining > 0) {
            shot.hitTargetIds?.add(target.id);
            shot.pierceRemaining--;
          } else {
            shot.markedForDeletion = true;
          }
        }
        if (bossComponent) {
          this.damageBossComponent(target, bossComponent, dmg);
        } else if (target.type === EntityType.BOSS) {
          this.damageBossHull(target, dmg);
        } else {
          target.hp -= dmg;
          this.flashEntity(target, isBossTarget ? 7 : 5);
        }
        this.spawnBurst(shot.x + shot.width / 2, shot.y + shot.height / 2, shot.color || '#67e8f9', shot.type === EntityType.MISSILE ? 8 : 3, shot.type === EntityType.MISSILE ? 3.8 : 1.6, shot.type === EntityType.MISSILE ? 4 : 2.5);
        this.playSound('impact', isBossTarget ? 0.78 : 0.46, {
          pitchJitter: 0.18,
          pitchOffset: isBossTarget ? -0.08 : 0.08
        });
        if (shot.type === EntityType.MISSILE) {
          this.addHitStop(3);
          this.addShake(isBossTarget ? 1.2 : 0.7);
        }

        if (target.hp <= 0) {
          this.handleEnemyDestroyed(target);
        }

        if (!shot.isBeam && shot.markedForDeletion) break;
      }
    }
  }

  getBossWarningComms(_type: BossWarningType) {
    const phase = this.stats.wave;
    const phaseComms = [
      {
        speaker: 'Brian Armstrong',
        role: 'Clarity Relay',
        image: ASSETS.FOUNDER_BRIAN,
        color: '#67e8f9',
        text: 'Instability ahead. The main bottleneck is forming. Clear runway, charge the lab, and get ready.'
      },
      {
        speaker: 'Jeffrey',
        role: 'Peer Review Scout',
        image: ASSETS.FOUNDER_JEFFREY,
        color: '#a7f3d0',
        text: 'Heavy signal ahead. This core moves differently. Watch the lanes before you commit.'
      },
      {
        speaker: 'Patrick',
        role: 'Funding Signal',
        image: ASSETS.FOUNDER_PATRICK,
        color: '#fde68a',
        text: 'Main boss incoming. Dock at the lab now if you want one more ship tune-up before the gate closes.'
      },
      {
        speaker: 'Arshia',
        role: 'Life Support',
        image: ASSETS.FOUNDER_ARSHIA,
        color: '#fda4af',
        text: 'Unstable field ahead. Save your shield, keep your last life clean, and fly through the opening.'
      },
      {
        speaker: 'ResearchHub',
        role: 'Open Science Relay',
        image: ASSETS.FOUNDER_4,
        color: '#c4b5fd',
        text: 'Final bottleneck ahead. No noise in the lane now. Break the core and open the Galaxy.'
      }
    ];

    return phaseComms[Math.min(phaseComms.length - 1, Math.max(0, phase - 1))];
  }

  getBossSkin(e: Entity) {
    const skins = [
      {
        sprite: ASSETS.FINAL_BOSS,
        label: 'GATEKEEPER PRIME',
        accent: '#fb7185',
        shadow: '#ef4444'
      },
      {
        sprite: ASSETS.MINI_BOSS,
        label: 'REVIEW SENTINEL',
        accent: '#67e8f9',
        shadow: '#38bdf8'
      },
      {
        sprite: ASSETS.WALL_BOSS_SEGMENT,
        label: 'PAYWALL CORE',
        accent: '#fde047',
        shadow: '#facc15'
      }
    ];

    return skins[Math.abs(e.variant || 0) % skins.length];
  }

  wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number = 2) {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    words.forEach((word) => {
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(nextLine).width <= maxWidth) {
        currentLine = nextLine;
        return;
      }

      if (currentLine) lines.push(currentLine);
      currentLine = word;
    });

    if (currentLine) lines.push(currentLine);

    if (lines.length > maxLines) {
      const clipped = lines.slice(0, maxLines);
      clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/\.+$/, '')}...`;
      return clipped;
    }

    return lines;
  }

  drawBossWarningComms(ctx: CanvasRenderingContext2D) {
    if (!this.pendingBossType) return;

    const comms = this.getBossWarningComms(this.pendingBossType);
    const duration = this.bossWarningDuration || 150;
    const age = duration - this.bossWarningFrame;
    const alpha = Math.max(0, Math.min(1, age / 18, this.bossWarningFrame / 24));
    const panelWidth = Math.min(this.width - 24, 520);
    const panelHeight = this.width < 520 ? 104 : 92;
    const x = Math.max(12, (this.width - panelWidth) / 2);
    const y = Math.max(118, Math.min(this.height - panelHeight - 150, this.height * 0.18));
    const portraitSize = this.width < 520 ? 48 : 56;
    const portraitX = x + 14;
    const portraitY = y + (panelHeight - portraitSize) / 2;
    const textX = portraitX + portraitSize + 14;
    const textWidth = panelWidth - (textX - x) - 16;
    const pulse = 0.75 + Math.sin(this.frameCount * 0.22) * 0.25;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(3, 7, 18, 0.86)';
    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = comms.color;
    ctx.shadowBlur = 16 * pulse;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 22);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = comms.color;
    ctx.globalAlpha = alpha * 0.16;
    ctx.fillRect(x + 1, y + 1, 5, panelHeight - 2);
    ctx.globalAlpha = alpha;

    loadImage(comms.image);
    const portrait = getReadyImage(comms.image);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(portraitX, portraitY, portraitSize, portraitSize, 14);
    ctx.clip();
    if (portrait) {
      ctx.drawImage(portrait, portraitX, portraitY, portraitSize, portraitSize);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
    }
    ctx.restore();

    ctx.strokeStyle = comms.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(portraitX + 0.5, portraitY + 0.5, portraitSize - 1, portraitSize - 1);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Orbitron';
    ctx.fillText(comms.speaker.toUpperCase(), textX, y + 24);

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.fillText(comms.role.toUpperCase(), textX, y + 39);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.96)';
    ctx.font = `${this.width < 520 ? 11 : 12}px monospace`;
    this.wrapCanvasText(ctx, comms.text, textWidth, this.width < 520 ? 3 : 2).forEach((line, index) => {
      ctx.fillText(line, textX, y + 59 + (index * 15));
    });

    ctx.fillStyle = comms.color;
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'right';
    ctx.fillText('BOSS SIGNAL', x + panelWidth - 14, y + panelHeight - 14);
    ctx.restore();
  }

  drawMainBossAlert(ctx: CanvasRenderingContext2D) {
    const duration = this.bossWarningDuration || 300;
    const age = duration - this.bossWarningFrame;
    const alertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, duration - 60));
    const alpha = Math.max(0, Math.min(1, age / 10, (alertFrames - age) / 16));
    const flash = Math.sin(this.frameCount * 0.62) > 0 ? 1 : 0.32;
    const panelWidth = Math.min(this.width - 34, 560);
    const panelHeight = this.width < 520 ? 118 : 132;
    const x = (this.width - panelWidth) / 2;
    const y = Math.max(104, (this.height - panelHeight) * 0.3);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgba(127, 0, 0, ${0.14 + flash * 0.24})`;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = `rgba(239, 68, 68, ${0.12 + flash * 0.18})`;
    const stripeHeight = 18;
    for (let stripeY = 0; stripeY < this.height; stripeY += stripeHeight * 3) {
      ctx.fillRect(0, stripeY, this.width, stripeHeight);
    }

    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 34 * flash;
    ctx.fillStyle = `rgba(28, 3, 8, ${0.9 + flash * 0.06})`;
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.72 + flash * 0.28})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.font = `bold ${this.width < 520 ? 34 : 46}px Orbitron`;
    ctx.fillText('WARNING', this.width / 2, y + (this.width < 520 ? 50 : 60));
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${this.width < 520 ? 13 : 17}px Orbitron`;
    ctx.fillText('GATEKEEPER SIGNAL DETECTED', this.width / 2, y + (this.width < 520 ? 82 : 96));
    ctx.fillStyle = `rgba(248, 113, 113, ${0.72 + flash * 0.28})`;
    ctx.font = `bold ${this.width < 520 ? 9 : 11}px Orbitron`;
    ctx.fillText('BOSS INBOUND', this.width / 2, y + panelHeight - 16);
    ctx.restore();
  }

  drawSubBossWarning(ctx: CanvasRenderingContext2D) {
    if (!this.pendingBossType || !this.isSubBossWarning()) return;

    const duration = this.bossWarningDuration || 90;
    const age = duration - this.bossWarningFrame;
    const alpha = Math.max(0, Math.min(1, age / 10, this.bossWarningFrame / 18));
    const flash = Math.sin(this.frameCount * 0.65) > 0 ? 1 : 0.38;
    const labels: Record<Exclude<BossWarningType, 'gatekeeper'>, string> = {
      mini1: 'BOTTLENECK SURGE',
      wall: 'PAYWALL FORMATION',
      asteroid: 'ASTEROID BELT'
    };
    const label = labels[this.pendingBossType as Exclude<BossWarningType, 'gatekeeper'>];
    const panelWidth = Math.min(this.width - 42, 360);
    const panelHeight = 74;
    const x = (this.width - panelWidth) / 2;
    const y = Math.max(118, this.height * 0.26);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#fb7185';
    ctx.shadowBlur = 24 * flash;
    ctx.fillStyle = `rgba(127, 29, 29, ${0.72 + (flash * 0.18)})`;
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.62 + (flash * 0.3)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, panelWidth, panelHeight, 18);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = `rgba(254, 240, 138, ${0.16 + (flash * 0.2)})`;
    ctx.fillRect(x + 10, y + 11, panelWidth - 20, 6);
    ctx.fillRect(x + 10, y + panelHeight - 17, panelWidth - 20, 6);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 12px Orbitron';
    ctx.fillText('WARNING', this.width / 2, y + 26);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Orbitron';
    ctx.fillText(label, this.width / 2, y + 52);
    ctx.restore();
  }

  // ... draw methods remain the same ...
  // (Included to prevent file truncation issues, though only collision logic changed significantly)
  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    this.drawBackgroundLayers(ctx);
    const starStride = this.performanceMode ? 2 : 1;
    for (let index = 0; index < this.stars.length; index += starStride) {
      this.stars[index].draw(ctx);
    }
    const backgroundSpriteLimit = this.bgEntities.length;
    for (let index = 0; index < backgroundSpriteLimit; index++) {
      this.bgEntities[index].draw(ctx);
    }
    
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    this.entities.forEach(e => this.drawEntity(ctx, e));
    this.drawPlayerAfterimages(ctx);
    this.drawResearchBeam(ctx);
    this.drawGunPods(ctx);
    if (this.lives > 0 || this.deathSequenceFrames > 0) this.drawEntity(ctx, this.player);
    
    const invaders = this.invaderDrawBuffer;
    invaders.length = 0;
    for (const entity of this.entities) {
      if (!entity.markedForDeletion && entity.type === EntityType.ENEMY_INVADER) {
        invaders.push(entity);
      }
    }
    if (invaders.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity;
        for (const inv of invaders) {
            if (inv.x < minX) minX = inv.x;
            if (inv.x + inv.width > maxX) maxX = inv.x + inv.width;
            if (inv.y < minY) minY = inv.y;
        }
        
        if (minY < Infinity) {
            const centerX = (minX + maxX) / 2;
            const topY = minY;
            
            ctx.save();
            ctx.font = 'bold 16px Orbitron';
            ctx.fillStyle = '#ff4444';
            ctx.textAlign = 'center';
            ctx.fillText("PAYWALL", centerX, topY - 35);
            
            const barWidth = 100;
            const barHeight = 8;
            const barY = topY - 20;
            
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.fillRect(centerX - barWidth/2, barY, barWidth, barHeight);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(centerX - barWidth/2, barY, barWidth, barHeight);
            
            const pct = Math.max(0, this.stats.bossHp / this.stats.bossMaxHp);
            
            ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
            ctx.fillRect(centerX - barWidth/2 + 1, barY + 1, (barWidth-2) * pct, barHeight - 2);
            ctx.restore();
        }
    }
    
    ctx.restore();
    ctx.restore();

    if (this.inBossWarningSequence && this.pendingBossType === 'gatekeeper') {
      const warningAge = this.bossWarningDuration - this.bossWarningFrame;
      const alertFrames = Math.min(MAIN_BOSS_ALERT_FRAMES, Math.max(1, this.bossWarningDuration - 60));
      if (warningAge < alertFrames) {
        this.drawMainBossAlert(ctx);
      } else {
        this.drawBossWarningComms(ctx);
      }
    } else if (this.inBossWarningSequence) {
      this.drawSubBossWarning(ctx);
    }

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(248, 113, 113, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  drawPlayerAfterimages(ctx: CanvasRenderingContext2D) {
    const img = getReadyImage(this.playerShipUrl);
    if ((this.mobileProfile || this.performanceMode) && this.playerAfterimages.length > 3) {
      this.playerAfterimages.length = 3;
    }

    this.playerAfterimages.forEach((image) => {
      ctx.save();
      ctx.globalAlpha = image.alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(image.x + image.width / 2, image.y + image.height / 2);
      ctx.rotate(image.rotation * 0.8);
      ctx.scale(1 + image.squash * 0.65, 1 - image.squash * 0.5);
      ctx.shadowBlur = this.getGlowBlur(18);
      ctx.shadowColor = '#67e8f9';
      if (img) {
        ctx.drawImage(img, -image.width / 2, -image.height / 2, image.width, image.height);
      } else {
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(-image.width / 2, -image.height / 2, image.width, image.height);
      }
      ctx.restore();
    });
  }

  drawHitFlash(ctx: CanvasRenderingContext2D, e: Entity) {
      if (e.flashFrames <= 0) return;

      const alpha = Math.min(0.52, e.flashFrames / 12);
      const flashSprite = this.getHitFlashSprite(e);
      const lean = this.shouldUseLeanEffects();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lean ? Math.min(0.36, alpha) : alpha;
      ctx.shadowBlur = lean ? 0 : this.getGlowBlur(16);
      ctx.shadowColor = e.formation === 'orbit' ? '#a7f3d0' : '#ffffff';

      if (flashSprite && !lean) {
        const drewSprite = this.drawSprite(ctx, flashSprite, e.width, e.height, {
          alpha: 0.92,
          filter: 'brightness(0) saturate(0) invert(1)',
          compositeOperation: 'lighter',
          spriteStyle: e.spriteStyle
        });

        if (drewSprite) {
          ctx.restore();
          return;
        }
      }

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (e.type === EntityType.ENEMY_SWARM) {
        ctx.ellipse(0, 0, e.width * 0.48, e.height * 0.42, 0, 0, Math.PI * 2);
      } else if (e.type === EntityType.ENEMY_BRICK) {
        ctx.roundRect(-e.width * 0.34, -e.height * 0.34, e.width * 0.68, e.height * 0.68, 8);
      } else {
        ctx.ellipse(0, 0, e.width * 0.42, e.height * 0.38, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();
  }

  getPaywallBastionSprite(e: Entity) {
    const frames = e.spriteFrames?.length && e.spriteFrames.length >= 5
      ? e.spriteFrames
      : ASSETS.PAYWALL_BASTION_FRAMES;
    const healthRatio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    if (healthRatio <= 0.15) return frames[4];
    if (healthRatio <= 0.5) return frames[3];
    if (e.attackTimer > 0) return frames[2];
    return frames[Math.floor((this.frameCount + e.variant * 5) / 24) % 2];
  }

  getHitFlashSprite(e: Entity) {
    if (e.type === EntityType.ENEMY_INVADER) return this.getPaywallBastionSprite(e);
    if (e.spriteFrames?.length) return this.getAnimatedFrame(e.spriteFrames, e, 6);
    if (e.spriteUrl) return e.spriteUrl;
    if (e.type === EntityType.ENEMY_DRONE) {
      return this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
    }
    if (e.type === EntityType.ENEMY_SWARM) {
      return this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
    }
    if (e.type === EntityType.ENEMY_BRICK) {
      const frames = e.variant >= 900 ? ASSETS.ASTEROID_BELT_FRAMES : ASSETS.ENEMY_BRICK_FRAMES;
      return frames[e.variant % frames.length];
    }
    if (e.type === EntityType.ENEMY_JOURNAL) {
      return this.getAnimatedFrame(ASSETS.ENEMY_JOURNAL_FRAMES, e, 6);
    }
    if (e.type === EntityType.MINI_BOSS) {
      return ASSETS.MINI_BOSS;
    }
    if (e.type === EntityType.BOSS) {
      return ASSETS.FINAL_BOSS;
    }

    return null;
  }
  
  drawMiniBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const bob = Math.sin(this.frameCount * 0.08) * 4;
      const drewSprite = this.drawSprite(ctx, e.spriteUrl || ASSETS.MINI_BOSS, e.width, e.height, {
        shadowColor: '#fb7185',
        shadowBlur: 22,
        yOffset: bob,
        spriteStyle: e.spriteStyle
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.roundRect(-e.width / 2, -e.height / 2, e.width, e.height, 18);
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.font = 'bold 12px Orbitron';
      ctx.fillStyle = '#fb7185';
      ctx.textAlign = 'center';
      ctx.fillText("BOTTLENECK DRONE", 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawBoss(ctx: CanvasRenderingContext2D, e: Entity) {
      this.drawHealthBar(ctx, e, 12);
      ctx.globalAlpha = 1.0;
      const skin = this.getBossSkin(e);
      const pulse = e.isCharging ? 42 : 24;
      const bob = Math.sin(this.frameCount * 0.04) * 5;
      const drewSprite = this.drawSprite(ctx, e.spriteUrl || skin.sprite, e.width, e.height, {
        shadowColor: e.isCharging ? '#ffffff' : skin.shadow,
        shadowBlur: pulse,
        yOffset: bob,
        spriteStyle: e.spriteStyle
      });

      if (!drewSprite) {
        ctx.save();
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        ctx.restore();
      }

      const shieldCount = this.getBossShieldCount();
      if (shieldCount > 0) {
        const shieldPulse = 0.72 + Math.sin(this.frameCount * 0.11) * 0.18;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(167, 243, 208, ${shieldPulse})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = this.getGlowBlur(22);
        ctx.shadowColor = '#a7f3d0';
        ctx.beginPath();
        ctx.ellipse(0, 18, e.width * 0.62, e.height * 0.34, this.frameCount * 0.014, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 18, e.width * 0.74, e.height * 0.42, -this.frameCount * 0.01, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = 'bold 11px Orbitron';
        ctx.fillStyle = '#a7f3d0';
        ctx.textAlign = 'center';
        ctx.fillText(`SHIELD x${shieldCount}`, 0, e.height / 2 + 18);
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = e.isCharging ? '#f8fafc' : skin.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.34, 16, this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 20, e.width * 0.24, 8, -this.frameCount * 0.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = 'bold 16px Orbitron';
      ctx.fillStyle = skin.accent;
      ctx.textAlign = 'center';
      ctx.fillText(skin.label, 0, -e.height/2 - 35);
      ctx.restore();
  }

  drawHealthBar(ctx: CanvasRenderingContext2D, e: Entity, height: number = 8) {
      ctx.save();
      const barWidth = e.width;
      const barHeight = height;
      const yOffset = -e.height/2 - 20; 
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(-barWidth/2, yOffset, barWidth, barHeight);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barWidth/2, yOffset, barWidth, barHeight);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? '#00FF00' : '#FF0000';
      ctx.fillRect(-barWidth/2 + 1, yOffset + 1, (barWidth-2) * pct, barHeight - 2);
      ctx.restore();
  }
  
  drawLaser(ctx: CanvasRenderingContext2D, e: Entity) {
      const flicker = Math.random() * 10;
      const glowColor = e.color || '#ff0000';
      ctx.save();
      ctx.fillStyle = '#FFF';
      ctx.fillRect(e.x + 10, e.y, e.width - 20, e.height);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = glowColor;
      ctx.fillRect(e.x - flicker, e.y, e.width + flicker*2, e.height);
      ctx.globalAlpha = 1;
      for(let i=0; i<5; i++) {
         ctx.fillStyle = '#FFDD00';
         const px = e.x + Math.random() * e.width;
         const py = e.y + Math.random() * e.height;
         ctx.fillRect(px, py, 4, 20);
      }
      ctx.restore();
  }

  drawResearchBeam(ctx: CanvasRenderingContext2D) {
      const remaining = this.activePowerups.get(PowerupType.RESEARCH_BEAM) || 0;
      if (remaining <= 0) return;

      const centerX = this.player.x + this.player.width / 2;
      const startY = this.player.y + this.player.height * 0.16;
      const width = this.width < 520 ? 46 : 56;
      const pulse = 0.75 + Math.sin(this.frameCount * 0.28) * 0.25;
      const endFade = Math.min(1, remaining / 45);
      const gradient = ctx.createLinearGradient(centerX, 0, centerX, startY);
      gradient.addColorStop(0, 'rgba(34,211,238,0.03)');
      gradient.addColorStop(0.2, 'rgba(125,211,252,0.62)');
      gradient.addColorStop(0.5, 'rgba(168,85,247,0.72)');
      gradient.addColorStop(1, 'rgba(255,255,255,0.96)');

      ctx.save();
      ctx.globalAlpha = endFade;
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = 28 + pulse * 18;
      ctx.shadowColor = '#a855f7';

      ctx.fillStyle = `rgba(168,85,247,${0.18 + pulse * 0.12})`;
      ctx.fillRect(centerX - width * 0.82, 0, width * 1.64, startY);
      ctx.fillStyle = `rgba(34,211,238,${0.18 + pulse * 0.1})`;
      ctx.fillRect(centerX - width * 0.5, 0, width, startY);
      ctx.fillStyle = gradient;
      ctx.fillRect(centerX - width * 0.22, 0, width * 0.44, startY);

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 + pulse * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - width * 0.34, 0);
      ctx.lineTo(centerX - width * 0.08, startY);
      ctx.moveTo(centerX + width * 0.34, 0);
      ctx.lineTo(centerX + width * 0.08, startY);
      ctx.stroke();

      for (let i = 0; i < 9; i++) {
        const y = (this.frameCount * (2.4 + i * 0.2) + i * 47) % Math.max(1, startY);
        const wobble = Math.sin((this.frameCount * 0.08) + i) * width * 0.35;
        ctx.fillStyle = i % 2 === 0 ? '#f0abfc' : '#67e8f9';
        ctx.fillRect(centerX + wobble, y, 3, 18);
      }

      ctx.restore();
  }

  drawGunPod(ctx: CanvasRenderingContext2D, size: number, isTriple: boolean, index: number) {
      const half = Math.round(size / 2);
      const accent = isTriple ? '#a78bfa' : '#facc15';
      const accentDark = isTriple ? '#6d28d9' : '#b45309';
      const isFiring = this.frameCount - this.lastShotFrame <= 4 && (this.frameCount + index) % 3 === 0;
      const hoverLength = Math.round(size * (0.16 + Math.sin((this.frameCount + index * 5) * 0.45) * 0.035));

      ctx.save();
      ctx.imageSmoothingEnabled = false;

      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowBlur = this.getGlowBlur(10);
      ctx.shadowColor = '#22d3ee';
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(-2, Math.round(size * 0.3), 4, hoverLength);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(-1, Math.round(size * 0.3) + hoverLength, 2, Math.max(2, Math.round(size * 0.08)));

      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = this.getGlowBlur(8);
      ctx.shadowColor = accent;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-half + 3, -4);
      ctx.lineTo(-half + 7, -9);
      ctx.lineTo(half - 7, -9);
      ctx.lineTo(half - 3, -4);
      ctx.lineTo(half - 3, 8);
      ctx.lineTo(half - 8, 12);
      ctx.lineTo(-half + 8, 12);
      ctx.lineTo(-half + 3, 8);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#475569';
      ctx.fillRect(-half, -2, 5, 10);
      ctx.fillRect(half - 5, -2, 5, 10);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-half + 1, 0, 3, 5);
      ctx.fillRect(half - 4, 0, 3, 5);

      const barrelWidth = Math.max(6, Math.round(size * 0.22));
      ctx.fillStyle = '#111827';
      ctx.fillRect(-Math.floor(barrelWidth / 2), -half + 1, barrelWidth, half - 3);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-Math.floor(barrelWidth / 2) + 1, -half + 2, 2, half - 6);
      ctx.fillStyle = accentDark;
      ctx.fillRect(Math.ceil(barrelWidth / 2) - 2, -half + 3, 2, half - 7);

      ctx.fillStyle = accentDark;
      ctx.fillRect(-half + 7, -6, size - 14, 4);
      ctx.fillStyle = accent;
      ctx.fillRect(-half + 8, -5, size - 16, 2);
      ctx.fillRect(-5, 1, 10, 8);
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(-2, 3, 4, 4);

      if (isFiring) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = this.getGlowBlur(14);
        ctx.shadowColor = accent;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-3, -half - 7, 6, 6);
        ctx.fillStyle = accent;
        ctx.fillRect(-1, -half - 12, 2, 5);
      }

      ctx.restore();
  }

  drawGunPods(ctx: CanvasRenderingContext2D) {
      const offsets = this.getGunPodOffsets();
      if (offsets.length === 0 || this.lives <= 0) return;

      const isTriple = this.activePowerups.has(PowerupType.TRIPLE_SHOT);
      const remaining = isTriple
        ? this.activePowerups.get(PowerupType.TRIPLE_SHOT) || 0
        : this.activePowerups.get(PowerupType.DOUBLE_SHOT) || 0;
      const entryAge = GAME_CONFIG.FOUNDER_SHOT_DURATION
        - Math.min(GAME_CONFIG.FOUNDER_SHOT_DURATION, remaining);
      const entry = easeOutCubic(clamp(entryAge / 42, 0, 1));
      const fade = Math.min(1, remaining / 36);
      const centerX = this.player.x + this.player.width / 2;
      const centerY = this.player.y + this.player.height / 2;
      const size = this.width < 520 ? 30 : 34;

      offsets.forEach((offset, index) => {
        const side = offset < 0 ? -1 : 1;
        const targetY = centerY + (this.width < 520 ? 10 : 6) + Math.sin((this.frameCount * 0.08) + index) * 4;
        const flyInY = targetY + (1 - entry) * 96;
        const flyInX = centerX + (offset * entry) + side * Math.sin(entry * Math.PI) * 14;

        ctx.save();
        ctx.globalAlpha = this.playerDrawAlpha * fade;
        ctx.translate(flyInX, flyInY);
        ctx.rotate(this.playerTilt * 0.55 + side * 0.08);
        this.drawGunPod(ctx, size, isTriple, index);
        ctx.restore();
      });
  }

  drawPlayerThrusters(ctx: CanvasRenderingContext2D, e: Entity) {
      const speed = Math.hypot(this.playerVel.x, this.playerVel.y);
      const speedLevel = Math.min(6, Math.max(0, Math.floor(this.stats.upgrades.speed || 0)));
      const palette = PLAYER_THRUSTER_PALETTES[speedLevel] ?? PLAYER_THRUSTER_PALETTES[0];
      const cinematicBoost = this.introFlightFrames > 0 || this.waveDepartureFrames > 0 ? 1.8 : 1;
      const deathFade = this.deathSequenceFrames > 0 ? 1 - (this.deathSequenceFrames / this.deathSequenceDuration) : 0;
      const upgradeBoost = 1 + speedLevel * 0.055;
      const boost = Math.max(cinematicBoost, 0.72 + Math.min(0.9, speed / 6)) * upgradeBoost * (1 - deathFade * 0.7);
      const flameLength = e.height * (0.24 + boost * 0.16) * (0.78 + Math.sin(this.frameCount * 0.55) * 0.18);
      const flameWidth = e.width * 0.075;
      const nozzleY = e.height * 0.28;
      const nozzleSpread = e.width * 0.16;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [-1, 1].forEach((side) => {
        const x = side * nozzleSpread;
        const gradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flameLength);
        gradient.addColorStop(0, palette.core);
        gradient.addColorStop(0.24, palette.mid);
        gradient.addColorStop(0.62, palette.edge);
        gradient.addColorStop(1, palette.fade);

        ctx.shadowBlur = this.getGlowBlur(24 * boost);
        ctx.shadowColor = palette.glow;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth * 0.35, nozzleY + flameLength);
        ctx.lineTo(x - flameWidth * 0.35, nozzleY + flameLength);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.86)';
        ctx.beginPath();
        ctx.arc(x, nozzleY + flameLength * 0.72, Math.max(2, flameWidth * 0.33), 0, Math.PI * 2);
        ctx.fill();
      });

      if (cinematicBoost > 1.1) {
        ctx.strokeStyle = palette.streak;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * e.width * 0.12;
          ctx.beginPath();
          ctx.moveTo(x, nozzleY + 4);
          ctx.lineTo(x * 0.36, nozzleY + flameLength + 44 + (i % 2) * 22);
          ctx.stroke();
        }
      }

      ctx.restore();
  }

  drawPlayerThrusterUpgradeOverlay(ctx: CanvasRenderingContext2D, e: Entity) {
      const speedLevel = Math.min(6, Math.max(0, Math.floor(this.stats.upgrades.speed || 0)));
      if (speedLevel <= 0) return;

      const palette = PLAYER_THRUSTER_PALETTES[speedLevel] ?? PLAYER_THRUSTER_PALETTES[0];
      const nozzleY = e.height * 0.26;
      const nozzleSpread = e.width * 0.16;
      const flameLength = e.height * (0.32 + speedLevel * 0.018)
        * (0.88 + Math.sin(this.frameCount * 0.58) * 0.12);
      const flameWidth = e.width * (0.072 + speedLevel * 0.003);

      ctx.save();
      [-1, 1].forEach((side) => {
        const x = side * nozzleSpread;
        const gradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flameLength);
        gradient.addColorStop(0, palette.core);
        gradient.addColorStop(0.22, palette.mid);
        gradient.addColorStop(0.72, palette.edge);
        gradient.addColorStop(1, palette.fade);

        ctx.shadowBlur = this.getGlowBlur(12 + speedLevel * 2.5);
        ctx.shadowColor = palette.glow;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth, nozzleY);
        ctx.lineTo(x + flameWidth * 0.32, nozzleY + flameLength);
        ctx.lineTo(x - flameWidth * 0.32, nozzleY + flameLength);
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
  }

  drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
    if (e.isBeam) {
        this.drawLaser(ctx, e);
        return;
    }
    ctx.save();
    ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
    ctx.globalAlpha = 1.0;
    
    if (e.type === EntityType.PLAYER) {
       const img = imageCache[this.playerShipUrl];
       const squash = clamp(this.playerSquash, -0.24, 0.24);
       ctx.globalAlpha = this.playerDrawAlpha;
       ctx.scale(this.playerDrawScale, this.playerDrawScale);
       ctx.rotate(this.playerTilt);
       ctx.scale(1 + squash * 0.78, 1 - squash * 0.58);
       this.drawPlayerThrusters(ctx, e);
       const bioBeamActive = this.isBioBeamFiring();
       const bioBeamLevel = Math.min(this.stats.upgrades.fireRate || 0, 7);
       const bioBeamFrames = getPlayerWeaponFrames('bio-laser', bioBeamLevel);
       if (bioBeamActive && this.bioBeamCanvasVisualStartFrame < 0) {
         this.bioBeamCanvasVisualStartFrame = this.frameCount;
       } else if (!bioBeamActive) {
         this.bioBeamCanvasVisualStartFrame = -1;
       }
       const bioBeamLaunchFrame = getPlayerWeaponLaunchFrameIndex(
         this.frameCount - Math.max(0, this.bioBeamCanvasVisualStartFrame),
         bioBeamFrames.length
       );
       const bioBeamLaunchProgress = (bioBeamLaunchFrame + 1) / bioBeamFrames.length;
       if (bioBeamActive) {
         const beamWidth = (5 + bioBeamLevel * 1.55) * bioBeamLaunchProgress;
         const beamTop = -(e.y + e.height / 2);
         const beamEnd = -e.height * 0.3;
         ctx.save();
         ctx.globalCompositeOperation = 'lighter';
         ctx.fillStyle = bioBeamLevel > 0 ? 'rgba(56,189,248,.18)' : 'rgba(101,245,154,.18)';
         ctx.fillRect(-beamWidth * 1.8, beamTop, beamWidth * 3.6, beamEnd - beamTop);
         ctx.fillStyle = bioBeamLevel > 0 ? '#38bdf8' : '#65f59a';
         ctx.fillRect(-beamWidth * 0.7, beamTop, beamWidth * 1.4, beamEnd - beamTop);
         ctx.fillStyle = '#ffffff';
         ctx.fillRect(-Math.max(1.5, beamWidth * 0.2), beamTop, Math.max(3, beamWidth * 0.4), beamEnd - beamTop);
         ctx.restore();
       }

       if (this.activePowerups.has(PowerupType.MAGNET)) {
           const pulse = Math.sin(this.frameCount * 0.1) * 5;
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; 
           ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.arc(0, 0, e.width/2 + 10 + pulse, 0, Math.PI * 2);
           ctx.stroke();
           ctx.beginPath();
           ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
           ctx.arc(0, 0, e.width/2 + pulse, 0, Math.PI * 2);
           ctx.stroke();
       }
       if (this.activePowerups.has(PowerupType.SHIELD) || this.invincibleTimer > 60) {
         ctx.save();
         ctx.rotate(this.frameCount * 0.05);
         ctx.strokeStyle = '#00C851';
         ctx.lineWidth = 3;
         ctx.setLineDash([15, 10]); 
         ctx.beginPath();
         ctx.arc(0, 0, e.width/2 + 15, 0, Math.PI * 2);
         ctx.stroke();
         ctx.restore();
       }
       if (this.activePowerups.has(PowerupType.RESEARCH_BEAM)) {
         const pulse = Math.sin(this.frameCount * 0.24) * 4;
         ctx.save();
         ctx.strokeStyle = 'rgba(168, 85, 247, 0.75)';
         ctx.lineWidth = 3;
         ctx.shadowBlur = this.getGlowBlur(18);
         ctx.shadowColor = '#a855f7';
         ctx.beginPath();
         ctx.arc(0, 0, e.width / 2 + 18 + pulse, 0, Math.PI * 2);
         ctx.stroke();
         ctx.strokeStyle = 'rgba(34, 211, 238, 0.48)';
         ctx.beginPath();
         ctx.arc(0, 0, e.width / 2 + 8 - pulse * 0.4, 0, Math.PI * 2);
         ctx.stroke();
         ctx.restore();
       }
       if (img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.drawImage(img, -e.width / 2, -e.height / 2, e.width, e.height);
          ctx.restore();
       } else {
         ctx.fillStyle = '#6c63ff';
         ctx.fillRect(-20, -20, 40, 40);
       }
       if (bioBeamActive) {
         const emitter = getReadyImage(bioBeamFrames[bioBeamLaunchFrame]);
         if (emitter) {
           const emitterWidth = 18 + bioBeamLevel * 3.4;
           const emitterHeight = 42 + bioBeamLevel * 6.2;
           ctx.save();
           ctx.imageSmoothingEnabled = false;
           ctx.drawImage(emitter, -emitterWidth / 2, -e.height * 0.36 - emitterHeight, emitterWidth, emitterHeight);
           ctx.restore();
         }
       }
       this.drawPlayerThrusterUpgradeOverlay(ctx, e);

    } else if (e.type === EntityType.ENEMY_DRONE) {
        const frame = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 6)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
        const rotation = e.formation === 'spiral' ? Math.PI / 2 + e.angle : 0;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#38bdf8',
            shadowBlur: 10,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_SWARM) {
        const frame = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 5)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
        const rotation = Math.sin((this.frameCount + e.variant) * 0.08) * 0.12;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: e.formation === 'orbit' ? '#a7f3d0' : '#34d399',
            shadowBlur: e.formation === 'orbit' ? 14 : 8,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_BRICK) {
        const fallbackFrames = e.variant >= 900 ? ASSETS.ASTEROID_BELT_FRAMES : ASSETS.ENEMY_BRICK_FRAMES;
        const frame = e.spriteFrames?.length
          ? e.spriteFrames[e.variant % e.spriteFrames.length]
          : e.spriteUrl || fallbackFrames[e.variant % fallbackFrames.length];
        const rotation = Math.sin((this.frameCount + e.variant) * 0.03) * 0.2;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#f59e0b',
            shadowBlur: 6,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_JOURNAL) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.04) * 0.12;
        const journalSprite = e.spriteFrames?.length
          ? this.getAnimatedFrame(e.spriteFrames, e, 6)
          : e.spriteUrl || this.getAnimatedFrame(ASSETS.ENEMY_JOURNAL_FRAMES, e, 6);
        const drewSprite = this.drawSprite(ctx, journalSprite, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 14,
            spriteStyle: e.spriteStyle
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.POWERUP) {
        const type = e.text as PowerupType;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.clip();
        
        let frames: readonly string[] = ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
        if (type === PowerupType.MAGNET) frames = ASSETS.POWERUP_MAGNET_FRAMES;
        if (type === PowerupType.SHIELD) frames = ASSETS.POWERUP_SHIELD_FRAMES;
        if (type === PowerupType.EXTRA_LIFE) frames = ['/game-art/powerups/extra-life.png'];
        if (type === PowerupType.RESEARCH_BEAM) frames = ASSETS.POWERUP_RESEARCH_BEAM_FRAMES;
        const frameIndex = Math.floor((this.frameCount + e.variant) / 8) % frames.length;
        const imgUrl = frames[frameIndex];
        
        const img = loadImage(imgUrl);
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, -18, -18, 36, 36);
        } else {
            ctx.fillStyle = '#fff';
            ctx.fillRect(-18, -18, 36, 36);
        }
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

    } else if (e.type === EntityType.MINI_BOSS) {
        this.drawMiniBoss(ctx, e);
    } else if (e.type === EntityType.BOSS) {
        this.drawBoss(ctx, e);
    } else if (e.type === EntityType.ENEMY_INVADER) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.05) * 0.08;
        const drewSprite = this.drawSprite(ctx, this.getPaywallBastionSprite(e), e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 8,
            spriteStyle: e.spriteStyle
        });
        if (drewSprite) {
            this.drawHitFlash(ctx, e);
            ctx.restore();
            return;
        }
        // DRAW AS BRICK EMOJI
        // INCREASE FONT SIZE FOR BIGGER BRICKS
        ctx.font = `${e.height}px Arial`; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#B22222'; // fallback color if text fails
        ctx.fillText("🧱", 0, 2);

    } else if (e.type === EntityType.COIN) {
        const frameIndex = Math.floor((this.frameCount + e.variant) / 5) % ASSETS.RSC_TOKEN_FLIP_FRAMES.length;
        const img = imageCache[ASSETS.RSC_TOKEN_FLIP_FRAMES[frameIndex]];
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.shadowBlur = this.getGlowBlur(10);
            ctx.shadowColor = '#FFD700';
            ctx.drawImage(img, -e.width/2, -e.height/2, e.width, e.height);
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = '8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("RSC", 0, 0);
            ctx.restore();
        }

    } else if (e.type === EntityType.BOMB) {
        const pulse = 0.75 + Math.sin((this.frameCount + e.variant) * 0.18) * 0.25;
        const drewBombSprite = this.drawSprite(ctx, this.bombSpriteUrl, e.width * 1.18, e.height * 1.18, {
          rotation: Math.sin((this.frameCount + e.variant) * 0.045) * 0.12,
          shadowColor: '#a3e635',
          shadowBlur: 16 + pulse * 8
        });

        if (!drewBombSprite) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.shadowBlur = this.getGlowBlur(18 + pulse * 10);
          ctx.shadowColor = '#facc15';

          const body = ctx.createRadialGradient(-5, -8, 3, 0, 0, 22);
          body.addColorStop(0, '#fff7ad');
          body.addColorStop(0.26, '#facc15');
          body.addColorStop(0.64, '#f97316');
          body.addColorStop(1, '#7c2d12');

          ctx.fillStyle = body;
          ctx.beginPath();
          ctx.arc(0, 4, 17, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fde68a';
          ctx.fillRect(-8, -18, 16, 7);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(-2, -24, 8, 8);
          ctx.strokeStyle = '#67e8f9';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(4, -21);
          ctx.quadraticCurveTo(20, -28, 25, -12);
          ctx.stroke();

          if (this.frameCount % 12 < 6) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(24, -15, 5, 5);
            ctx.fillRect(29, -9, 3, 3);
          }

          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 4, 18, 0.18, Math.PI * 1.28);
          ctx.stroke();
          ctx.restore();
        }

    } else if (e.type === EntityType.PARTICLE) {
        ctx.globalAlpha = Math.max(0, Math.min(1, e.life / Math.max(1, e.maxLife)));
        ctx.shadowBlur = this.getGlowBlur(Math.max(0, e.width * 1.6));
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
    } else if (e.type === EntityType.EFFECT) {
        const eff = e as VisualEffect;
        if (eff.effectType === 'sprite' && eff.spriteFrames?.length) {
            const age = Math.max(0, eff.maxLife - eff.life);
            const frameIndex = Math.min(eff.spriteFrames.length - 1, Math.floor(age / 6));
            const image = loadImage(eff.spriteFrames[frameIndex]);
            if (image.complete && image.naturalWidth > 0) {
              ctx.globalAlpha = Math.min(1, eff.life / 8);
              ctx.drawImage(image, -eff.width / 2, -eff.height / 2, eff.width, eff.height);
            }
        } else if (eff.effectType === 'text') {
            ctx.font = `bold ${eff.fontSize}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.globalAlpha = eff.life / eff.maxLife;

            if (eff.text?.startsWith("WAVE")) {
                const jitterX = (Math.random() - 0.5) * 4;
                const jitterY = (Math.random() - 0.5) * 4;
                ctx.shadowBlur = this.getGlowBlur(20);
                ctx.shadowColor = '#00FFFF'; 
                ctx.fillStyle = this.frameCount % 10 < 5 ? '#FFF' : '#00FFFF';
                ctx.fillText(eff.text || "", jitterX, jitterY);
                if (Math.random() > 0.7) {
                    ctx.strokeStyle = '#FFF';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(-50, 0);
                    ctx.lineTo(50, (Math.random()-0.5)*20);
                    ctx.stroke();
                }
                ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("WARNING")) {
                 const pulse = Math.abs(Math.sin(this.frameCount * 0.2)) * 0.5 + 0.5;
                 ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
                 ctx.shadowBlur = this.getGlowBlur(10);
                 ctx.shadowColor = '#ff0000';
                 ctx.fillText(eff.text || "", 0, 0);
                 ctx.shadowBlur = 0;
            } else if (eff.text?.startsWith("GATEKEEPER")) {
                 ctx.fillStyle = '#ff4444';
                 ctx.font = 'bold 20px Orbitron';
                 ctx.fillText(eff.text || "", 0, 0);
            } else {
                ctx.fillStyle = eff.color;
                ctx.fillText(eff.text || "", 0, 0);
            }
            ctx.globalAlpha = 1;
        } else if (eff.effectType === 'ring') {
            const progress = 1 - (eff.life / eff.maxLife);
            ctx.strokeStyle = eff.color;
            ctx.lineWidth = 3 * (1-progress);
            ctx.globalAlpha = 1 - progress;
            ctx.beginPath();
            ctx.arc(0, 0, 10 + (progress * 80), 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    } else if (e.type === EntityType.MISSILE) {
        // Draw Missile
        const isMaxLevel = e.color === '#ff0055';
        
        ctx.save();
        if (isMaxLevel) {
             // COOL EFFECT: Pulsing aura
             const pulse = 10 + Math.sin(this.frameCount * 0.5) * 5;
             ctx.shadowBlur = this.getGlowBlur(pulse);
             ctx.shadowColor = '#ff0055';
             ctx.fillStyle = '#ff0055';
        } else {
             ctx.fillStyle = '#00ffff';
             ctx.shadowBlur = this.getGlowBlur(10);
             ctx.shadowColor = '#00ffff';
        }
        
        ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI/2);
        
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(5, 5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        
        // Engine glow
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, 5, isMaxLevel ? 4 : 2, 0, Math.PI*2);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.restore();

    } else if (e.type === EntityType.PROJECTILE) {
        ctx.save();
        ctx.globalAlpha = 1.0; 
        ctx.filter = "none";
        ctx.globalCompositeOperation = e.isPlayerShot ? 'source-over' : 'lighter';
        const leanShot = e.isPlayerShot && this.shouldUseLeanEffects();
        const isIonShot = e.isPlayerShot && e.weaponKind === 'ion';
        const isNovaShot = e.isPlayerShot && e.weaponKind === 'nova';
        const isSingularityShot = e.isPlayerShot && e.weaponKind === 'singularity';
        const isBioLaserShot = e.isPlayerShot && e.weaponKind === 'bio-laser';
        const isEthShardShot = e.isPlayerShot && e.weaponKind === 'eth-shard';
        const isBtcHashShot = e.isPlayerShot && e.weaponKind === 'btc-hash';
        ctx.shadowBlur = e.isPlayerShot
          ? 0
          : this.getGlowBlur(leanShot ? 5 : 12);
        ctx.shadowColor = e.color || (e.isPlayerShot ? '#67e8f9' : '#fb7185');

        if (e.text) { 
           ctx.font = '24px serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(e.text, 0, 0);
        } else if (e.isPlayerShot) {
          const weaponFrames = getPlayerWeaponFrames(e.weaponKind, e.weaponVisualLevel);
          const launchFrame = getPlayerWeaponLaunchFrameIndex(
            this.frameCount - e.weaponVisualStartFrame,
            weaponFrames.length
          );
          const weaponFrame = getReadyImage(weaponFrames[launchFrame]);
          if (weaponFrame) {
            const visualWidth = Math.max(34, e.width * 2.05);
            const visualHeight = Math.max(48, e.height * 1.2);
            ctx.imageSmoothingEnabled = false;
            ctx.rotate(Math.atan2(e.vy, e.vx) + Math.PI / 2);
            ctx.drawImage(weaponFrame, -visualWidth / 2, -visualHeight / 2, visualWidth, visualHeight);
          } else if (isBtcHashShot) {
            const pulse = 0.84 + Math.sin((this.frameCount + e.variant) * 0.42) * 0.16;
            ctx.fillStyle = `rgba(245,158,11,${0.3 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.9, e.height * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fbbf24';
            ctx.strokeStyle = '#fff7d6';
            ctx.lineWidth = leanShot ? 1.2 : 1.8;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.58);
            ctx.lineTo(e.width * 0.62, -e.height * 0.12);
            ctx.lineTo(e.width * 0.48, e.height * 0.5);
            ctx.lineTo(0, e.height * 0.66);
            ctx.lineTo(-e.width * 0.48, e.height * 0.5);
            ctx.lineTo(-e.width * 0.62, -e.height * 0.12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#78350f';
            ctx.fillRect(-e.width * 0.18, -e.height * 0.34, e.width * 0.12, e.height * 0.68);
            ctx.fillRect(e.width * 0.08, -e.height * 0.34, e.width * 0.12, e.height * 0.68);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-e.width * 0.28, -e.height * 0.12, e.width * 0.56, e.height * 0.1);
            ctx.fillRect(-e.width * 0.28, e.height * 0.14, e.width * 0.56, e.height * 0.1);
          } else if (isEthShardShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.5) * 0.18;
            ctx.fillStyle = `rgba(139,92,246,${0.28 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.86, e.height * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();

            const shard = ctx.createLinearGradient(0, -e.height * 0.64, 0, e.height * 0.62);
            shard.addColorStop(0, 'rgba(255,255,255,0)');
            shard.addColorStop(0.14, '#ffffff');
            shard.addColorStop(0.38, '#c4b5fd');
            shard.addColorStop(0.7, '#7c3aed');
            shard.addColorStop(1, 'rgba(76,29,149,0)');
            ctx.fillStyle = shard;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.68);
            ctx.lineTo(e.width * 0.62, 0);
            ctx.lineTo(0, e.height * 0.64);
            ctx.lineTo(-e.width * 0.62, 0);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.2 : 1.8;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.48);
            ctx.lineTo(e.width * 0.14, 0);
            ctx.lineTo(0, e.height * 0.38);
            ctx.lineTo(-e.width * 0.14, 0);
            ctx.closePath();
            ctx.fill();
          } else if (isBioLaserShot) {
            const pulse = 0.78 + Math.sin((this.frameCount + e.variant) * 0.46) * 0.22;
            const outerGlow = ctx.createLinearGradient(0, -e.height * 0.65, 0, e.height * 0.6);
            outerGlow.addColorStop(0, 'rgba(255,255,255,0)');
            outerGlow.addColorStop(0.16, `rgba(214,255,177,${0.78 * pulse})`);
            outerGlow.addColorStop(0.5, '#b7ff68');
            outerGlow.addColorStop(0.84, `rgba(34,197,94,${0.72 * pulse})`);
            outerGlow.addColorStop(1, 'rgba(22,163,74,0)');
            ctx.fillStyle = outerGlow;
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.48, -e.height * 0.64, e.width * 0.96, e.height * 1.24, Math.max(2, e.width * 0.38));
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(-Math.max(1, e.width * 0.12), -e.height * 0.55, Math.max(2, e.width * 0.24), e.height, Math.max(1, e.width * 0.12));
            ctx.fill();
            ctx.strokeStyle = 'rgba(190,242,100,0.9)';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (isSingularityShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.5) * 0.18;
            ctx.fillStyle = `rgba(167,139,250,${0.3 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.88, e.height * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.4 : 2.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.7, e.height * 0.28, 0, 0, Math.PI * 2);
            ctx.stroke();

            const singularityCore = ctx.createLinearGradient(0, -e.height * 0.7, 0, e.height * 0.64);
            singularityCore.addColorStop(0, 'rgba(255,255,255,0)');
            singularityCore.addColorStop(0.16, '#ffffff');
            singularityCore.addColorStop(0.42, '#67e8f9');
            singularityCore.addColorStop(0.68, '#a78bfa');
            singularityCore.addColorStop(1, 'rgba(217,70,239,0)');
            ctx.fillStyle = singularityCore;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.72);
            ctx.lineTo(e.width * 0.7, -e.height * 0.04);
            ctx.lineTo(0, e.height * 0.66);
            ctx.lineTo(-e.width * 0.7, -e.height * 0.04);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(3, e.width * 0.13), 0, Math.PI * 2);
            ctx.fill();
          } else if (isNovaShot) {
            const pulse = 0.84 + Math.sin((this.frameCount + e.variant) * 0.44) * 0.16;
            ctx.fillStyle = `rgba(250,204,21,${0.24 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.82, e.height * 0.54, 0, 0, Math.PI * 2);
            ctx.fill();

            const novaCore = ctx.createLinearGradient(0, -e.height * 0.68, 0, e.height * 0.62);
            novaCore.addColorStop(0, 'rgba(255,255,255,0)');
            novaCore.addColorStop(0.18, '#ffffff');
            novaCore.addColorStop(0.46, '#67e8f9');
            novaCore.addColorStop(0.72, '#f0abfc');
            novaCore.addColorStop(1, 'rgba(250,204,21,0)');
            ctx.fillStyle = novaCore;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.7);
            ctx.lineTo(e.width * 0.62, -e.height * 0.08);
            ctx.lineTo(e.width * 0.24, e.height * 0.62);
            ctx.lineTo(-e.width * 0.24, e.height * 0.62);
            ctx.lineTo(-e.width * 0.62, -e.height * 0.08);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = leanShot ? 1.5 : 2.4;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-2, -e.height * 0.48, 4, e.height * 0.88);
          } else if (isIonShot) {
            const pulse = 0.82 + Math.sin((this.frameCount + e.variant) * 0.38) * 0.18;
            ctx.fillStyle = `rgba(240,171,252,${0.32 * pulse})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, e.width * 0.7, e.height * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.15, -e.height * 0.58, e.width * 0.3, e.height * 1.08, 5);
            ctx.fill();
            ctx.strokeStyle = '#67e8f9';
            ctx.lineWidth = leanShot ? 1.5 : 2;
            ctx.beginPath();
            ctx.moveTo(-e.width * 0.45, e.height * 0.38);
            ctx.lineTo(0, -e.height * 0.62);
            ctx.lineTo(e.width * 0.45, e.height * 0.38);
            ctx.stroke();
          } else if (leanShot) {
            ctx.fillStyle = e.color || '#67e8f9';
            ctx.beginPath();
            ctx.roundRect(-e.width * 0.32, -e.height * 0.58, e.width * 0.64, e.height * 1.08, 4);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.fillRect(-1, -e.height * 0.48, 2, e.height * 0.72);
          } else {
            const bolt = ctx.createLinearGradient(0, -e.height / 2, 0, e.height / 2);
            bolt.addColorStop(0, 'rgba(255,255,255,0)');
            bolt.addColorStop(0.18, '#ffffff');
            bolt.addColorStop(0.45, e.color);
            bolt.addColorStop(1, 'rgba(34,211,238,0)');
            ctx.fillStyle = bolt;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.62);
            ctx.lineTo(e.width * 0.54, -e.height * 0.06);
            ctx.lineTo(e.width * 0.2, e.height * 0.58);
            ctx.lineTo(-e.width * 0.2, e.height * 0.58);
            ctx.lineTo(-e.width * 0.54, -e.height * 0.06);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.72)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, -e.height * 0.58);
            ctx.lineTo(0, e.height * 0.42);
            ctx.stroke();
          }
        } else {
            ctx.fillStyle = e.color;
            ctx.beginPath();
            ctx.arc(0, 0, e.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.72)';
            ctx.beginPath();
            ctx.arc(-e.width * 0.12, -e.height * 0.12, Math.max(1.5, e.width * 0.16), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    } else {
        ctx.fillStyle = e.color; 
        if (e.text) {
          ctx.font = '24px Arial'; 
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.text, 0, 0);
        } else {
          ctx.fillRect(-e.width/2, -e.height/2, e.width, e.height);
        }
    }

    if (this.isEnemyTarget(e)) {
      this.drawHitFlash(ctx, e);
    }
    
    ctx.restore();
  }
}
