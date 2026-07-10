

import { EntityType, GamePolishSettings, PowerupType, Stats } from '../types';
import { ASSETS, GAME_CONFIG, COLORS } from '../constants';
import { audioService } from './audioService';
import { BASE_FLASK_CHARGE_MAX, FLASK_CHARGE_PER_COIN, getFlaskProgress } from './flaskProgress';

// --- Helper Classes ---

type EnemyFormationMode = 'row' | 'v' | 'sine' | 'pincer' | 'orbit';
type PlayerWeaponKind = 'pulse' | 'plasma' | 'ion';
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
  isCharging: boolean = false;
  isBeam: boolean = false; 
  beamAnchorOffsetX: number | null = null;
  beamLaneSign: number = 0;

  // Missile Props
  isMissile: boolean = false;

  // Projectile Ownership
  isPlayerShot: boolean = false;
  variant: number = 0;
  formation?: EnemyFormationMode;
  formationIndex: number = 0;
  formationSeed: number = 0;
  flashFrames: number = 0;
  shieldHostId?: string;
  damage: number = 1;
  pierceRemaining: number = 0;
  weaponKind: PlayerWeaponKind = 'pulse';
  hitTargetIds?: Set<string>;
  
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
  effectType: 'text' | 'ring';
  fontSize: number = 32;
  constructor(x: number, y: number, type: 'text' | 'ring', content: string = '', color: string = '#FFF', fontSize: number = 32) {
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
  ASSETS.RSC_TOKEN,
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
  ASSETS.FINAL_BOSS,
  ...ASSETS.ENEMY_DRONE_FRAMES,
  ...ASSETS.ENEMY_SWARM_FRAMES,
  ...ASSETS.ENEMY_BRICK_FRAMES
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
const BASE_COIN_MAGNET_RADIUS = 150;
const POWERUP_COIN_MAGNET_RADIUS = 420;
const BOMB_DROP_CHANCE = 0.018;
const ELITE_BOMB_DROP_CHANCE = 0.065;
const MINI_BOSS_BOMB_REWARD_CHANCE = 0.35;
const BOSS_BOMB_REWARD_CHANCE = 0.5;
const BOMB_DAMAGE_BOSS = 14;
const BOMB_DAMAGE_MINI_BOSS = 18;
const BOMB_DAMAGE_INVADER = 3;
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
const EMPTY_WINGMAN_OFFSETS: number[] = [];
const DOUBLE_WINGMAN_OFFSETS = [42];
const TRIPLE_WINGMAN_OFFSETS = [-42, 42];
const DEFAULT_POLISH_SETTINGS: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
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

const WAVE_SECTORS = [
  { name: 'OPEN ORBIT', accent: '#67e8f9' },
  { name: 'CITATION STORM', accent: '#c4b5fd' },
  { name: 'PAYWALL SIEGE', accent: '#fde68a' },
  { name: 'OPEN GALAXY', accent: '#6ee7b7' }
];

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
  lastBombFrame: number = -999;
  introFlightFrames: number = 0;
  introFlightDuration: number = 150;
  waveDepartureFrames: number = 0;
  waveDepartureDuration: number = 168;
  deathSequenceFrames: number = 0;
  deathSequenceDuration: number = 88;
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
  phaseAnnouncementMask: number = 0;
  mobileProfile: boolean = false;
  polishSettings: GamePolishSettings = { ...DEFAULT_POLISH_SETTINGS };
  performanceMode: boolean = false;
  heavySceneLoad: boolean = false;
  
  constructor(stats: Stats) {
    this.stats = stats;
    this.player = new Entity(EntityType.PLAYER, 0, 0);
    this.player.width = 128;
    this.player.height = 128;
    
    GAMEPLAY_ASSET_URLS.forEach(loadImage);
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
    } = {}
  ) {
    const img = getReadyImage(url);
    if (!img) {
      return false;
    }

    ctx.save();
    ctx.globalAlpha = options.alpha ?? 1;
    if (options.shadowColor) ctx.shadowColor = options.shadowColor;
    if (options.shadowBlur) ctx.shadowBlur = this.getGlowBlur(options.shadowBlur);
    if (options.compositeOperation) ctx.globalCompositeOperation = options.compositeOperation;
    if (options.filter) ctx.filter = options.filter;
    if (options.rotation) ctx.rotate(options.rotation);
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

    if (!adaptiveLow || this.frameCount % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = adaptiveLow ? 0.58 : 0.9;
      const horizon = getReadyImage(ASSETS.GAME_BG_PLANET);
      if (horizon) {
        const planetHeight = Math.max(220, this.height * 0.3);
        const planetYOffset = Math.max(180, this.height * 0.2);
        ctx.drawImage(horizon, 0, this.height - planetHeight + planetYOffset, this.width, planetHeight);
      }
      ctx.restore();
    }

    const planetDrift = (this.frameCount * 0.2) % (this.width + 200);
    if (!adaptiveLow) {
      ctx.save();
      ctx.translate(this.width - 130, 110 + Math.sin(this.frameCount * 0.01) * 10);
      this.drawSprite(ctx, ASSETS.GAME_PARALLAX_BIG_PLANET, lowDetail ? 135 : 170, lowDetail ? 135 : 170, { alpha: lowDetail ? 0.38 : 0.55 });
      ctx.restore();

      ctx.save();
      ctx.translate((this.width + 100) - planetDrift, 180 + Math.sin(this.frameCount * 0.015) * 12);
      this.drawSprite(ctx, ASSETS.GAME_PARALLAX_RING_PLANET, lowDetail ? 70 : 90, lowDetail ? 140 : 180, { alpha: lowDetail ? 0.52 : 0.75 });
      ctx.restore();
    }

    const tintIndex = (this.wave - 1 + this.sectorTint) % 3;
    if (tintIndex > 0) {
      const colors = [
        'rgba(34, 211, 238, 0)',
        'rgba(79, 70, 229, 0.12)',
        'rgba(16, 185, 129, 0.11)'
      ];
      ctx.save();
      ctx.fillStyle = colors[tintIndex];
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

  keepOnlyPassiveEntities() {
    const entities = this.entities;
    let writeIndex = 0;

    for (let readIndex = 0; readIndex < entities.length; readIndex++) {
      const entity = entities[readIndex];
      if (entity.type === EntityType.PARTICLE || entity.type === EntityType.EFFECT) {
        entities[writeIndex] = entity;
        writeIndex++;
      }
    }

    entities.length = writeIndex;
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
      this.startNextWave();
    }
  }

  startDeathSequence() {
    if (this.deathSequenceFrames > 0 || !this.gameActive) return;

    this.deathSequenceFrames = this.deathSequenceDuration;
    this.invincibleTimer = 999;
    this.flashAlpha = Math.max(this.flashAlpha, 0.72);
    this.addShake(14);
    this.addHitStop(14);
    audioService.playSound('gameover');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'MISSION LOST', '#fb7185', 24);
  }

  updateDeathSequence() {
    if (this.deathSequenceFrames <= 0) return;

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
      this.gameActive = false;
    }
  }

  continueRun(lives: number = GAME_CONFIG.PLAYER_LIVES) {
    this.gameActive = true;
    this.deathSequenceFrames = 0;
    this.waveDepartureFrames = 0;
    this.introFlightFrames = 0;
    this.lives = lives;
    this.stats.lives = lives;
    this.invincibleTimer = 180;
    this.setPlayerHomePosition();
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
    this.playerSquash = -0.12;
    this.playerSquashVelocity = 0;
    this.playerDrawAlpha = 1;
    this.playerDrawScale = 1;
    this.keepOnlyPassiveEntities();
    this.flashAlpha = Math.max(this.flashAlpha, 0.35);
    this.addShake(2.6);
    this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#67e8f9');
    this.spawnFloatingText(this.width / 2, this.height * 0.42, 'CONTINUE', '#67e8f9', 24);
    audioService.playSound('launch');
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
    this.lives = GAME_CONFIG.PLAYER_LIVES;
    this.stats.lives = this.lives;
    this.wave = 1;
    this.stats.score = 0;
    this.stats.coins = 0;
    this.stats.totalCoins = 0;
    this.stats.bombs = 2;
    this.stats.bombCharge = 0;
    this.stats.bombChargeMax = BASE_FLASK_CHARGE_MAX;
    this.stats.wave = 1;
    this.resetWaveProgress();
    const openingSector = this.getWaveSector();
    this.spawnFloatingText(this.width/2, this.height/2, `WAVE 1 - ${openingSector.name}`, openingSector.accent, this.mobileProfile ? 20 : 26);
    this.bossRef = null;
    this.miniBossRef = null;
    this.activePowerups.clear();
    this.frameCount = 0;
    this.missileTimer = 0;
    this.playerVel = { x: 0, y: 0 };
    this.playerTilt = 0;
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
    this.lastBombFrame = -999;
    this.weaponVolley = 0;
    this.announcedFireRateLevel = Math.min(this.stats.upgrades.fireRate || 0, 5);
    this.introFlightDuration = 150;
    this.introFlightFrames = this.introFlightDuration;
    this.waveDepartureFrames = 0;
    this.deathSequenceFrames = 0;
    this.playerDrawScale = 1.55;
    this.playerDrawAlpha = 0;
    this.sectorTint = 0;
    
    // START MUSIC
    audioService.startMusic();
    audioService.playSound('launch');
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
    this.phaseAnnouncementMask = 0;
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

    this.wave++;
    this.stats.wave++;
    this.resetWaveProgress();
    this.keepEntitiesForNextWave();
    const sector = this.getWaveSector();
    this.spawnFloatingText(this.width/2, this.height/2, `WAVE ${this.wave} - ${sector.name}`, sector.accent, this.mobileProfile ? 20 : 26);
    this.introFlightDuration = 118;
    this.introFlightFrames = this.introFlightDuration;
    this.playerDrawScale = 1.46;
    this.playerDrawAlpha = 0;
    this.sectorTint = (this.sectorTint + 1) % 3;
    audioService.playSound('wave');
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
    const progressionCap = Math.min(DESKTOP_THREAT_CAP, MOBILE_THREAT_CAP + ((Math.max(1, this.wave) - 1) * 3));
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

  startBossWarning(type: BossWarningType) {
    this.inBossWarningSequence = true;
    this.bossWarningDuration = type === 'gatekeeper' ? 300 : 90;
    this.bossWarningFrame = this.bossWarningDuration;
    this.pendingBossType = type;
    if (type === 'gatekeeper') {
      this.clearThreatsForMainBoss();
    }
    audioService.playSound(this.isSubBossWarning(type) ? 'siren' : 'boss_roar');
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

  update(cinematicPause: boolean = false) {
    if (!this.gameActive) return;
    this.frameCount++;
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
    const isBossAlive = !!this.bossRef || !!this.miniBossRef || invaderCount > 0 || asteroidBeltCount > 0;
    
    if (isBossAlive) {
        this.stats.isBossActive = true;
        let hp = 0;
        let maxHp = 100;

        if (this.bossRef) {
            hp = this.bossRef.hp;
            maxHp = this.bossRef.maxHp;
        } else if (this.miniBossRef) {
            hp = this.miniBossRef.hp;
            maxHp = this.miniBossRef.maxHp;
        } else if (invaderCount > 0) {
            hp = invaderCount; 
            maxHp = this.wave === 1 ? 10 : 12;
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
             const totalDuration = GAME_CONFIG.WAVE_DURATION_FRAMES;
             this.stats.bossProgress = Math.min(1, this.waveProgressFrames / totalDuration);
        }
        
        // CHECKPOINT 1: 33% (Mini Boss 1 - Bottleneck)
        if (this.stats.bossProgress >= 0.33 && !this.spawnedMiniBoss1) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning('mini1');
             }
        }
        // CHECKPOINT 2: 66% (Mini Boss 2 - The Wall)
        else if (this.stats.bossProgress >= 0.66 && !this.spawnedWallBoss) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning(this.getSecondSubBossType());
             }
        }
        // CHECKPOINT 3: 100% (Final Boss)
        else if (this.stats.bossProgress >= 1 && !this.bossRef && !this.mainBossDefeated) {
             if (!this.inBossWarningSequence) {
                 this.startBossWarning('gatekeeper');
             }
        }
    }
    
    if (this.inBossWarningSequence) {
        if (this.isSubBossWarning() && this.bossWarningFrame > 0 && this.bossWarningFrame % 36 === 0) {
            audioService.playSound('siren');
        }
        this.bossWarningFrame--;
        if (this.bossWarningFrame <= 0) {
            this.inBossWarningSequence = false;
            
            if (this.pendingBossType === 'mini1') {
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

    const speed = GAME_CONFIG.BASE_PLAYER_SPEED + (this.stats.upgrades.speed * 1.5);
    this.updatePlayerMovement(speed);

    // FIRE RATE PROGRESSION: Spaced out for distinct feeling
    // Level 0: 15 (4 shots/sec)
    // Level 1: 12 (5 shots/sec)
    // Level 2: 10 (6 shots/sec)
    // Level 3: 8 (7.5 shots/sec)
    // Level 4: 6 (10 shots/sec)
    // Level 5: 5 (12 shots/sec)
    const fireRates = [15, 12, 10, 8, 6, 5];
    const level = Math.min(this.stats.upgrades.fireRate, 5);
    const fireInterval = fireRates[level] || 5;

    if (level > this.announcedFireRateLevel) {
      const weaponLabel = level >= 5 ? 'ION LANCE ONLINE' : level >= 3 ? 'PLASMA CANNON ONLINE' : `RAPID FIRE L${level + 1}`;
      const weaponColor = level >= 5 ? '#f0abfc' : level >= 3 ? '#67e8f9' : '#fde68a';
      this.spawnFloatingText(this.player.x + this.player.width / 2, this.player.y - 18, weaponLabel, weaponColor, this.mobileProfile ? 16 : 19);
      this.spawnRingEffect(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, weaponColor);
      audioService.playSound('powerup', 1, { pitchOffset: level * 0.04 });
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

    this.spawnEnemies();
    this.updateEnemyFire();
    this.announceWaveProgress();

    this.entities.forEach(e => {
      if (e.isBeam) {
          e.life--;
          if (e.life <= 0) e.markedForDeletion = true;
          if (this.bossRef) {
              const anchorX = e.beamAnchorOffsetX ?? (this.bossRef.width / 2 - e.width / 2);
              const waveOneDrift = this.stats.wave === 1
                ? Math.sin((this.frameCount + (e.variant * 37)) * 0.075) * 16
                : 0;
              e.x = Math.max(0, Math.min(this.width - e.width, this.bossRef.x + anchorX + waveOneDrift));
              e.y = this.bossRef.y + this.bossRef.height - 20;
          } else {
              e.markedForDeletion = true;
          }
          return;
      }

      if (e.flashFrames > 0) e.flashFrames--;
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
        if (e.type === EntityType.ENEMY_SWARM) {
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
        if (e.type === EntityType.ENEMY_BRICK && e.variant >= 900) {
          e.x += Math.sin((this.frameCount + e.variant) * 0.025) * (0.55 + (this.wave * 0.12));
        }
        if (e.y > this.height) e.markedForDeletion = true;
      }
      
      if (e.type === EntityType.PROJECTILE) {
        if (e.y < -50 || e.y > this.height + 50) e.markedForDeletion = true;
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

  announceWaveProgress() {
    if (this.stats.isBossActive || this.inBossWarningSequence) return;

    const milestones = [
      { bit: 1, threshold: 0.18, label: 'FORMATION SIGNAL' },
      { bit: 2, threshold: 0.48, label: 'ELITE PRESSURE' },
      { bit: 4, threshold: 0.82, label: 'FINAL APPROACH' }
    ];

    for (const milestone of milestones) {
      if (this.stats.bossProgress < milestone.threshold || (this.phaseAnnouncementMask & milestone.bit) !== 0) continue;
      this.phaseAnnouncementMask |= milestone.bit;
      const sector = this.getWaveSector();
      this.spawnFloatingText(this.width / 2, Math.max(96, this.height * 0.2), milestone.label, sector.accent, this.mobileProfile ? 17 : 21);
      audioService.playSound('wave', 0.72, { pitchOffset: milestone.threshold * 0.08 });
    }
  }

  getWingmanOffsets() {
    if (this.activePowerups.has(PowerupType.TRIPLE_SHOT)) {
      return TRIPLE_WINGMAN_OFFSETS;
    }

    if (this.activePowerups.has(PowerupType.DOUBLE_SHOT)) {
      return DOUBLE_WINGMAN_OFFSETS;
    }

    return EMPTY_WINGMAN_OFFSETS;
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

    const bulletColor = weaponKind === 'ion' ? '#f0abfc' : weaponKind === 'plasma' ? '#22d3ee' : '#6c63ff';
    const bulletWidth = weaponKind === 'ion' ? 24 : weaponKind === 'plasma' ? 14 : 10;
    const b = new Entity(EntityType.PROJECTILE, this.player.x + this.player.width / 2 - bulletWidth / 2 + offsetX, this.player.y + this.player.height * 0.12 + yOffset);
    const angle = randomRange(-0.035, 0.035) + angleBias;
    b.width = bulletWidth;
    b.height = weaponKind === 'ion' ? 54 : weaponKind === 'plasma' ? 34 : 28;
    b.vx = Math.sin(angle) * speed;
    b.vy = -Math.cos(angle) * speed;
    b.color = bulletColor;
    b.isPlayerShot = true;
    b.weaponKind = weaponKind;
    b.damage = weaponKind === 'ion' ? 2.4 : weaponKind === 'plasma' ? 1.3 : 1;
    if (weaponKind === 'ion') {
      b.pierceRemaining = 3;
      b.hitTargetIds = new Set<string>();
    }
    this.entities.push(b);
    this.livePlayerShotCount++;
    if (playSound) {
      audioService.playSound('shoot', 1, {
        pitchJitter: weaponKind === 'ion' ? 0.08 : 0.22,
        pitchOffset: pitchOffset + (weaponKind === 'ion' ? -0.18 : weaponKind === 'plasma' ? 0.08 : 0)
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
    const fireRateLevel = Math.min(this.stats.upgrades.fireRate || 0, 5);
    const weaponKind: PlayerWeaponKind = fireRateLevel >= 5 && this.weaponVolley % 4 === 0
      ? 'ion'
      : fireRateLevel >= 3
        ? 'plasma'
        : 'pulse';
    const weaponSpeed = weaponKind === 'ion' ? 12.8 : weaponKind === 'plasma' ? 11.2 : 10;
    this.spawnPlayerBullet(weaponSpeed, 0, 0, 0, -0.04, true, weaponKind);

    const lean = this.shouldUseLeanEffects();
    this.getWingmanOffsets().forEach((offsetX, index) => {
      this.queuePlayerBullet({
        fireFrame: this.frameCount + index + 1,
        speed: 10.4,
        offsetX,
        yOffset: 8,
        angleBias: offsetX < 0 ? -0.042 : 0.042,
        pitchOffset: offsetX < 0 ? -0.01 : 0.03,
        weaponKind: fireRateLevel >= 3 ? 'plasma' : 'pulse',
        playSound: !lean
      });
    });
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
      audioService.playSound('missile');
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
      audioService.playSound('powerup');
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
    audioService.playSound('bomb');

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
      target.hp -= bombDamage;
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

  spawnBossShieldRing(boss: Entity, phase: number) {
    const count = Math.min(this.mobileProfile ? 5 : 8, 3 + phase);
    const hp = Math.max(3, Math.round(2.5 + phase * 1.2));

    for (let i = 0; i < count; i++) {
      const shield = new Entity(EntityType.ENEMY_SWARM, boss.x + boss.width / 2, boss.y + boss.height / 2);
      shield.width = this.mobileProfile ? 30 : 34;
      shield.height = this.mobileProfile ? 26 : 30;
      shield.hp = hp;
      shield.maxHp = hp;
      shield.color = '#a7f3d0';
      shield.formation = 'orbit';
      shield.formationIndex = i;
      shield.formationSeed = (Math.PI * 2 * i) / count;
      shield.shieldHostId = boss.id;
      shield.variant = 300 + i;
      this.entities.push(shield);
    }

    this.spawnFloatingText(this.width / 2, Math.max(92, this.height * 0.16), 'SHIELD RING!', '#a7f3d0', this.mobileProfile ? 17 : 22);
  }

  handleEnemyDestroyed(target: Entity) {
    if (target.markedForDeletion) return;

    target.markedForDeletion = true;
    this.spawnExplosion(target.x, target.y, target.color);
    this.stats.enemiesDefeated++;
    const waveMult = Math.pow(2, this.stats.wave - 1);
    let basePoints = 10;
    if (target.type === EntityType.ENEMY_DRONE) basePoints = 10;
    if (target.type === EntityType.ENEMY_SWARM) basePoints = 12;
    if (target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_INVADER) basePoints = 20;
    if (target.type === EntityType.ENEMY_JOURNAL) basePoints = 30;

    const points = basePoints * waveMult;
    this.stats.score += points;
    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    this.spawnFloatingText(centerX, centerY - 10, `+${points}`, '#67e8f9', 16);
    this.spawnCoin(target.x + target.width / 2, target.y + target.height / 2);
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
    if (isElite && Math.random() > 0.92) this.spawnPowerup(target.x, target.y);
    if (!this.isBombResolving && (this.stats.bombs || 0) < MAX_BOMBS) {
      const dropChance = isElite ? ELITE_BOMB_DROP_CHANCE : BOMB_DROP_CHANCE;
      if (Math.random() < dropChance) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
    }

    if (target.type === EntityType.MINI_BOSS) {
      this.stats.score += 500 * waveMult;
      this.spawnFloatingText(centerX, centerY - 42, `+${500 * waveMult}`, '#fef08a', 22);
      this.addHitStop(8);
      this.addShake(4.2);
      const miniBossCoinDrops = 4 + Math.min(8, this.stats.wave * 2);
      for (let i = 0; i < miniBossCoinDrops; i++) {
        this.spawnCoin(target.x + Math.random() * target.width, target.y + Math.random() * target.height);
      }
      const miniBossPowerupDrops = this.stats.wave >= 2 ? 2 : 1;
      for (let i = 0; i < miniBossPowerupDrops; i++) {
        this.spawnPowerup(
          target.x + (target.width * ((i + 1) / (miniBossPowerupDrops + 1))),
          target.y + Math.random() * target.height
        );
      }
      if ((this.stats.bombs || 0) < MAX_BOMBS && Math.random() < MINI_BOSS_BOMB_REWARD_CHANCE) {
        this.spawnBombDrop(centerX - 19, centerY - 19);
      }
      this.miniBossRef = null;
      this.waveProgressFrames += 120;
    }

    if (target.type === EntityType.BOSS) {
      if (this.waveTransitionPending) return;

      this.stats.score += 1000 * waveMult;
      this.spawnFloatingText(centerX, centerY - 52, `+${1000 * waveMult}`, '#fef08a', 24);
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
      const bossCoinDrops = 7 + Math.min(11, this.stats.wave * 3);
      for (let i = 0; i < bossCoinDrops; i++) {
        this.spawnCoin(target.x + Math.random() * target.width, target.y + Math.random() * target.height);
      }
      const bossPowerupDrops = 2 + Math.min(2, Math.floor(this.stats.wave / 2));
      for (let i = 0; i < bossPowerupDrops; i++) {
        this.spawnPowerup(
          target.x + (target.width * ((i + 1) / (bossPowerupDrops + 1))),
          target.y + 50 + Math.random() * Math.max(30, target.height - 70)
        );
      }
      const bossBombDrops = (this.stats.bombs || 0) < MAX_BOMBS && Math.random() < BOSS_BOMB_REWARD_CHANCE ? 1 : 0;
      for (let i = 0; i < bossBombDrops; i++) {
        this.spawnBombDrop(
          target.x + (target.width * 0.5) - 19,
          target.y + 50 + Math.random() * Math.max(30, target.height - 70)
        );
      }

      audioService.playSound('electricity');

      this.spawnFloatingText(this.width / 2, this.height / 2, "WAVE COMPLETE!", "#00FF00");
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
      return !(box.x > beamBox.x + beamBox.width
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

      target.hp -= isBossTarget ? 0.9 : 1.45;
      this.flashEntity(target, isBossTarget ? 5 : 4);

      if (this.frameCount % 8 === 0) {
        this.entities.push(new Particle(target.x + target.width / 2, target.y + target.height / 2, '#a855f7', 1.8));
      }

      if (target.hp <= 0) {
        this.handleEnemyDestroyed(target);
      }
    });
  }

  updateEnemyFire() {
    if (this.wave < 2 || this.stats.isBossActive || this.inBossWarningSequence || this.deathSequenceFrames > 0) return;

    const fireInterval = Math.max(42, 118 - ((this.wave - 2) * 18));
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
    this.entities.push(shot);
  }

  spawnEnemies() {
    const invaderCount = this.countEntities(EntityType.ENEMY_INVADER);
    const asteroidBeltCount = this.getAsteroidBeltCount();
    if (this.bossRef || this.miniBossRef || invaderCount > 0 || asteroidBeltCount > 0 || this.inBossWarningSequence) return;
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
    const modes: EnemyFormationMode[] = this.wave <= 1
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

    const labels: Record<Exclude<EnemyFormationMode, 'orbit'>, string> = {
      row: 'LINE SWARM!',
      v: 'V-SWARM!',
      sine: 'WAVE SWARM!',
      pincer: 'PINCER!'
    };
    this.spawnFloatingText(centerX, Math.max(90, this.height * 0.18), labels[mode], '#34d399', this.width < 520 ? 18 : 22);
  }

  createEnemy(type: EntityType, x: number, y: number) {
    const e = new Entity(type, x, y);
    const hpMult = this.wave === 1 ? 1 : 1 + (this.wave * 0.34);
    const speedBoost = this.wave === 1 ? 1 : 1 + (this.wave * 0.11);
    e.variant = Math.floor(Math.random() * 100);
    
    if (type === EntityType.ENEMY_DRONE) {
      e.vy = 2.5 * speedBoost; 
      e.hp = 2 * hpMult;
      e.width = 44;
      e.height = 44;
      e.color = '#7dd3fc'; 
      e.text = "🔒"; 
    } else if (type === EntityType.ENEMY_JOURNAL) {
      e.vy = 4.4 * speedBoost; 
      e.vx = Math.sin((this.frameCount + e.variant) * 0.2) * 4; 
      e.hp = 3 * hpMult;
      e.color = '#fb7185'; 
      e.text = "📕"; 
      e.width = 56;
      e.height = 66;
    } else if (type === EntityType.ENEMY_BRICK) {
      e.vy = 1.5 * speedBoost;
      e.hp = 8 * hpMult;
      e.width = 54;
      e.height = 54;
      e.color = '#f59e0b'; 
      e.text = "📰";
    } else if (type === EntityType.ENEMY_SWARM) {
      e.vy = 3.5 * speedBoost;
      e.hp = 1 * hpMult;
      e.width = 34;
      e.height = 28;
      e.color = '#34d399'; 
      e.text = "🪰";
    } 

    e.maxHp = e.hp;
    this.entities.push(e);
    return e;
  }

  spawnMiniBoss(_num: number) {
    const mb = new Entity(EntityType.MINI_BOSS, this.width/2 - 50, -100);
    mb.width = 140;
    mb.height = 160;
    mb.hp = this.wave === 1 ? 44 : 45 + (this.wave * 22);
    mb.maxHp = mb.hp;
    mb.vy = 2;
    mb.color = '#fb7185';
    this.miniBossRef = mb;
    this.entities.push(mb);
  }
  
  spawnWallBoss() {
    const rows = 2; // UPDATED to 2 rows
    const cols = this.wave === 1 ? 5 : 6;
    const isMobile = this.width < 600;
    const blockW = isMobile ? 42 : 52;
    const blockH = isMobile ? 50 : 60;
    const gap = 4;
    const startX = (this.width - ((blockW+gap)*cols))/2;
    
    for (let r=0; r<rows; r++) {
        for (let c=0; c<cols; c++) {
            const e = new Entity(EntityType.ENEMY_INVADER, startX + c*(blockW+gap), -200 + r*(blockH+gap));
            e.width = blockW;
            e.height = blockH;
            e.hp = this.wave === 1 ? 5 : Math.round(5 + (this.wave * 3.1));
            e.maxHp = e.hp;
            e.color = '#fb7185'; 
            e.text = "🧱"; // UPDATED to Brick Emoji
            e.variant = (r * cols) + c;
            e.vx = 0;
            this.entities.push(e);
        }
    }
    this.invaderDirection = 1; 
  }

  spawnAsteroidBelt() {
    const count = Math.min(24, 12 + (this.wave * 3));
    const lanes = Math.max(4, Math.min(7, Math.floor(this.width / 88)));
    const laneWidth = this.width / lanes;
    this.asteroidBeltMaxCount = count;

    for (let i = 0; i < count; i++) {
      const lane = i % lanes;
      const jitter = (Math.random() - 0.5) * laneWidth * 0.5;
      const size = 42 + Math.random() * 28 + (this.wave * 2);
      const asteroid = new Entity(
        EntityType.ENEMY_BRICK,
        Math.max(8, Math.min(this.width - size - 8, (lane * laneWidth) + (laneWidth / 2) - (size / 2) + jitter)),
        -140 - (Math.floor(i / lanes) * 72) - (Math.random() * 45)
      );

      asteroid.width = size;
      asteroid.height = size;
      asteroid.vy = 1.8 + (this.wave * 0.32) + (Math.random() * 0.45);
      asteroid.vx = (Math.random() - 0.5) * (0.45 + (this.wave * 0.08));
      asteroid.hp = Math.round(4 + (this.wave * 1.9));
      asteroid.maxHp = asteroid.hp;
      asteroid.variant = 900 + i;
      asteroid.color = '#f59e0b';
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
      const verticalSpeed = isEntering ? (this.wave === 1 ? 1.15 : 1.5 + (this.wave - 1)) : 0;
      
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
      });
      
      const shootRate = this.wave === 1 ? 42 : Math.max(8, 20 - this.wave);
      if (this.frameCount % shootRate === 0) { 
          const shooter = invaders[Math.floor(Math.random() * invaders.length)];
          const b = new Entity(EntityType.PROJECTILE, shooter.x + shooter.width/2, shooter.y + shooter.height);
          b.vx = 0;
          b.vy = this.wave === 1 ? 5.4 : 7 + (this.wave * 0.5);
          b.width = this.wave === 1 ? 12 : 14;
          b.height = this.wave === 1 ? 12 : 14;
          b.color = '#ff4444';
          // Solid projectile
          this.entities.push(b);
      }
  }

  updateMiniBoss(boss: Entity) {
     boss.attackTimer++;
     const targetX = this.player.x + this.player.width/2 - boss.width/2;
     const dx = targetX - boss.x;
     if (boss.y > 0) boss.x += dx * (0.03 + (this.wave * 0.005));

     if (boss.y < 100) boss.vy = 2;
     else {
        boss.vy = 0;
        boss.x += Math.sin(boss.attackTimer * 0.05) * 3;
     }
     
     boss.x = Math.max(0, Math.min(this.width - boss.width, boss.x));
     
     const shootRate = this.wave === 1 ? 72 : Math.max(30, 60 - (this.wave * 5));
     if (boss.attackTimer % shootRate === 0) {
        const b = new Entity(EntityType.PROJECTILE, boss.x + boss.width/2, boss.y + boss.height);
        b.vx = 0;
        b.vy = 5 + (this.wave * 0.5);
        b.width = 16; 
        b.height = 16; 
        b.color = '#ff0000';
        this.entities.push(b);
     }
  }

  spawnBoss() {
    const boss = new Entity(EntityType.BOSS, this.width / 2 - 100, -200);
    const phase = Math.max(1, this.stats.wave);
    boss.width = 220;
    boss.height = 200;
    boss.hp = phase === 1 ? 235 : 220 + (phase * 105);
    boss.maxHp = boss.hp;
    boss.variant = (this.stats.wave - 1) % 3;
    boss.color = '#990000';
    boss.text = "GATEKEEPER";
    boss.vy = 2;
    this.bossRef = boss;
    this.entities.push(boss);
    if (phase >= 2) {
      this.spawnBossShieldRing(boss, phase);
    }
  }

  getBossPulseCount(phase: number) {
    if (phase <= 1) return 1;
    if (phase === 2) return 2;
    if (phase === 3) return 3;
    return 4;
  }

  spawnBossBurst(boss: Entity, phase: number) {
    const cx = boss.x + boss.width / 2;
    const cy = boss.y + boss.height - 20;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const angle = Math.atan2(py - cy, px - cx);
    const shotCount = phase <= 1 ? 3 : phase === 2 ? 5 : 7;
    const spread = phase <= 1 ? 0.2 : phase === 2 ? 0.18 : 0.16;
    const speed = Math.min(10.5, 6 + phase * 0.55);

    for (let i = 0; i < shotCount; i++) {
      const offset = i - ((shotCount - 1) / 2);
      const b = new Entity(EntityType.PROJECTILE, cx, cy);
      b.vx = Math.cos(angle + (offset * spread)) * speed;
      b.vy = Math.sin(angle + (offset * spread)) * speed;
      b.width = 15;
      b.height = 15;
      b.color = phase >= 3 ? '#ff7a18' : '#ff0000';
      b.text = "";
      this.entities.push(b);
    }

    if (phase >= 4) {
      [-0.32, 0.32].forEach(offset => {
        const b = new Entity(EntityType.PROJECTILE, cx + boss.width * offset, cy - 8);
        b.vx = offset * 2.2;
        b.vy = speed * 0.95;
        b.width = 13;
        b.height = 18;
        b.color = '#f97316';
        this.entities.push(b);
      });
    }
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
    beam.beamAnchorOffsetX = boss.width / 2 - beamWidth / 2;
    beam.variant = pulseIndex;
    this.entities.push(beam);

    audioService.playSound(pulseIndex === 0 ? 'boss_roar' : 'electricity');
  }

  updateBoss(boss: Entity) {
    boss.attackTimer++;
    const phase = Math.max(1, this.stats.wave);
    const speedMult = 1 + (phase * 0.1);
    const playerCenterX = this.player.x + this.player.width / 2;
    const playerNearEdge = playerCenterX < this.width * 0.18 || playerCenterX > this.width * 0.82;
    const hasActiveBeam = this.entities.some(e => e.isBeam && !e.markedForDeletion);
    if (boss.y < 80) boss.vy = 2;
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
    const cycleLength = Math.max(320, 410 - Math.min(4, phase - 1) * 18);
    const burstEnd = Math.max(210, 250 - Math.min(4, phase - 1) * 8);
    const chargeEnd = burstEnd + 70;
    const attackCycle = boss.attackTimer % cycleLength;
    
    if (attackCycle < burstEnd) {
        boss.isCharging = false;
        const fireRate = Math.max(20, 60 - (phase * 7));
        if (boss.attackTimer % fireRate === 0) { 
          this.spawnBossBurst(boss, phase);
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

  spawnPowerup(x: number, y: number) {
    const r = Math.random();
    let type: PowerupType = PowerupType.DOUBLE_SHOT;
    if (r < 0.08) type = PowerupType.RESEARCH_BEAM;
    else if (r < 0.44) type = PowerupType.DOUBLE_SHOT;
    else if (r < 0.78) type = PowerupType.TRIPLE_SHOT;
    else if (r < 0.9) type = PowerupType.MAGNET;
    else type = PowerupType.SHIELD;

    const p = new Entity(EntityType.POWERUP, x, y);
    p.text = type; 
    p.width = 36;
    p.height = 36;
    p.vy = 2.0;
    this.entities.push(p);
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
  }

  spawnExplosion(x: number, y: number, color: string) {
    audioService.playSound('explode');
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
    audioService.playSound('coin', Math.min(this.coinCombo, 10));
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
      const duration = type === PowerupType.RESEARCH_BEAM ? GAME_CONFIG.RESEARCH_BEAM_DURATION : GAME_CONFIG.POWERUP_DURATION;
      this.activePowerups.set(type, currentDuration + duration);
    }

    audioService.playSound('powerup');
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;

    if (type === PowerupType.SHIELD) {
      this.invincibleTimer += GAME_CONFIG.SHIELD_DURATION;
      this.spawnFloatingText(cx, cy - 20, "SHIELD!", "#00C851");
      this.spawnRingEffect(cx, cy, "#00C851");
    } else if (type === PowerupType.MAGNET) {
      this.spawnFloatingText(cx, cy - 20, "MAGNET!", "#FFD700");
      this.spawnRingEffect(cx, cy, "#FFD700");
    } else if (type === PowerupType.TRIPLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "TRIPLE SHOT!", "#6c63ff");
      this.spawnRingEffect(cx, cy, "#6c63ff");
    } else if (type === PowerupType.DOUBLE_SHOT) {
      this.spawnFloatingText(cx, cy - 20, "DOUBLE SHOT!", "#ffbb33");
      this.spawnRingEffect(cx, cy, "#ffbb33");
    } else if (type === PowerupType.RESEARCH_BEAM) {
      this.spawnFloatingText(cx, cy - 20, "RESEARCH BEAM!", "#a855f7");
      this.spawnRingEffect(cx, cy, "#a855f7");
    } else if (type === PowerupType.EXTRA_LIFE) {
      this.lives = Math.min(this.lives + 1, GAME_CONFIG.MAX_LIVES);
      this.stats.lives = this.lives;
      this.spawnFloatingText(cx, cy - 20, "+1 LIFE!", "#ff4444");
      this.spawnRingEffect(cx, cy, "#ff4444");
    }
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
        audioService.playSound('powerup');
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
              hurtsPlayer = true;
          }
          // If it's NOT a player shot, it hurts
          else if (!e.isPlayerShot) {
               // EXTRA FAILSAFE: If it's Cyan or Purple, assume it's player ammo (glitch protection)
               if (e.color !== '#00FFFF' && e.color !== '#00ffff' && e.color !== '#6c63ff') {
                   hurtsPlayer = true;
               }
          }
      }
      
      const isInvincible = this.invincibleTimer > 0 || this.activePowerups.has(PowerupType.SHIELD);

      if (hurtsPlayer && intersectsPlayer(e)) {
        if (isInvincible) {
           e.hp -= 5; 
           this.spawnBurst(e.x + e.width / 2, e.y + e.height / 2, '#00C851', 7, 4, 4);
           this.addShake(1.1);
           this.kickPlayerSquash(0.055);
           
           // SHIELD DEGRADATION LOGIC
           // Hitting enemies reduces shield duration to prevent boss cheese
           if (this.activePowerups.has(PowerupType.SHIELD)) {
               const currentShieldTime = this.activePowerups.get(PowerupType.SHIELD) || 0;
               // Heavy penalty for ramming bosses
               const penalty = (e.type === EntityType.BOSS || e.type === EntityType.MINI_BOSS) ? 150 : 30; 
               this.activePowerups.set(PowerupType.SHIELD, Math.max(0, currentShieldTime - penalty));
               
               // Also reduce base Invincible timer if active (e.g. from pickup)
               if (this.invincibleTimer > 0) {
                   this.invincibleTimer = Math.max(0, this.invincibleTimer - penalty);
               }
           }

           if (e.hp <= 0 && !e.isBeam) { 
             e.markedForDeletion = true;
             this.spawnExplosion(e.x, e.y, e.color);
           }
        } else {
          this.lives--;
          this.invincibleTimer = 60; 
          audioService.playSound('hit');
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
          if (e.type === EntityType.PROJECTILE && !e.isBeam) e.markedForDeletion = true;
          if (this.lives <= 0) this.startDeathSequence();
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
      const projectilePadding = 28;
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
        const padding = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS ? 42 : 18;
        if (
          shotBox.x > target.x + target.width + padding
          || shotBox.x + shotBox.width < target.x - padding
          || shotBox.y > target.y + target.height + padding
          || shotBox.y + shotBox.height < target.y - padding
        ) {
          continue;
        }
        if (!this.boxesIntersect(shotBox, getBox(target))) continue;

        // Boss-type enemies get shaved down a bit faster so fights don't drag.
        const isBossTarget = target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS;
        const bossShielded = target.type === EntityType.BOSS && bossShieldedNow;
        if (bossShielded) {
          if (!shot.isBeam) shot.markedForDeletion = true;
          this.flashEntity(target, 5);
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
          if (shot.weaponKind === 'ion' && shot.pierceRemaining > 0) {
            shot.hitTargetIds?.add(target.id);
            shot.pierceRemaining--;
          } else {
            shot.markedForDeletion = true;
          }
        }
        target.hp -= dmg;
        this.flashEntity(target, isBossTarget ? 7 : 5);
        this.spawnBurst(shot.x + shot.width / 2, shot.y + shot.height / 2, shot.color || '#67e8f9', shot.type === EntityType.MISSILE ? 8 : 3, shot.type === EntityType.MISSILE ? 3.8 : 1.6, shot.type === EntityType.MISSILE ? 4 : 2.5);
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
    const backgroundSpriteLimit = this.performanceMode ? 1 : this.bgEntities.length;
    for (let index = 0; index < backgroundSpriteLimit; index++) {
      this.bgEntities[index].draw(ctx);
    }
    
    if (this.inBossWarningSequence && this.pendingBossType === 'gatekeeper') {
        this.drawBossWarningComms(ctx);
    } else if (this.inBossWarningSequence) {
        this.drawSubBossWarning(ctx);
    }
    
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    ctx.shadowBlur = 0;
    this.entities.forEach(e => this.drawEntity(ctx, e));
    this.drawPlayerAfterimages(ctx);
    this.drawResearchBeam(ctx);
    this.drawWingmen(ctx);
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

    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(248, 113, 113, ${this.flashAlpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }
  }

  drawPlayerAfterimages(ctx: CanvasRenderingContext2D) {
    const img = getReadyImage(ASSETS.PLAYER_SHIP);
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
          compositeOperation: 'lighter'
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

  getHitFlashSprite(e: Entity) {
    if (e.type === EntityType.ENEMY_DRONE) {
      return this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
    }
    if (e.type === EntityType.ENEMY_SWARM) {
      return this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
    }
    if (e.type === EntityType.ENEMY_BRICK) {
      return ASSETS.ENEMY_BRICK_FRAMES[e.variant % ASSETS.ENEMY_BRICK_FRAMES.length];
    }
    if (e.type === EntityType.ENEMY_JOURNAL) {
      return ASSETS.ENEMY_JOURNAL;
    }
    if (e.type === EntityType.ENEMY_INVADER) {
      return ASSETS.WALL_BOSS_SEGMENT;
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
      const drewSprite = this.drawSprite(ctx, ASSETS.MINI_BOSS, e.width, e.height, {
        shadowColor: '#fb7185',
        shadowBlur: 22,
        yOffset: bob
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
      const drewSprite = this.drawSprite(ctx, skin.sprite, e.width, e.height, {
        shadowColor: e.isCharging ? '#ffffff' : skin.shadow,
        shadowBlur: pulse,
        yOffset: bob
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

  drawWingmanThruster(ctx: CanvasRenderingContext2D, size: number) {
      const flameLength = size * (0.34 + Math.sin(this.frameCount * 0.5) * 0.06);
      const nozzleY = size * 0.3;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gradient = ctx.createLinearGradient(0, nozzleY, 0, nozzleY + flameLength);
      gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
      gradient.addColorStop(0.32, 'rgba(103,232,249,0.92)');
      gradient.addColorStop(1, 'rgba(37,99,235,0)');
      ctx.shadowBlur = this.getGlowBlur(16);
      ctx.shadowColor = '#22d3ee';
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-size * 0.07, nozzleY);
      ctx.lineTo(size * 0.07, nozzleY);
      ctx.lineTo(size * 0.03, nozzleY + flameLength);
      ctx.lineTo(-size * 0.03, nozzleY + flameLength);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
  }

  drawWingmen(ctx: CanvasRenderingContext2D) {
      const offsets = this.getWingmanOffsets();
      if (offsets.length === 0 || this.lives <= 0) return;

      const isTriple = this.activePowerups.has(PowerupType.TRIPLE_SHOT);
      const remaining = isTriple
        ? this.activePowerups.get(PowerupType.TRIPLE_SHOT) || 0
        : this.activePowerups.get(PowerupType.DOUBLE_SHOT) || 0;
      const entryAge = GAME_CONFIG.POWERUP_DURATION - Math.min(GAME_CONFIG.POWERUP_DURATION, remaining);
      const entry = easeOutCubic(clamp(entryAge / 42, 0, 1));
      const fade = Math.min(1, remaining / 36);
      const centerX = this.player.x + this.player.width / 2;
      const centerY = this.player.y + this.player.height / 2;
      const size = this.width < 520 ? 46 : 54;

      offsets.forEach((offset, index) => {
        const side = offset < 0 ? -1 : 1;
        const targetY = centerY + (this.width < 520 ? 20 : 14) + Math.sin((this.frameCount * 0.08) + index) * 4;
        const flyInY = targetY + (1 - entry) * 96;
        const flyInX = centerX + (offset * entry) + side * Math.sin(entry * Math.PI) * 14;

        ctx.save();
        ctx.globalAlpha = this.playerDrawAlpha * fade;
        ctx.translate(flyInX, flyInY);
        ctx.rotate(this.playerTilt * 0.55 + side * 0.08);
        ctx.scale(0.9, 0.9);
        this.drawWingmanThruster(ctx, size);
        const drew = this.drawSprite(ctx, ASSETS.PLAYER_SHIP, size, size, {
          shadowColor: isTriple ? '#8b5cf6' : '#facc15',
          shadowBlur: 14
        });
        if (!drew) {
          ctx.fillStyle = isTriple ? '#8b5cf6' : '#facc15';
          ctx.fillRect(-size / 2, -size / 2, size, size);
        }
        ctx.restore();
      });
  }

  drawPlayerThrusters(ctx: CanvasRenderingContext2D, e: Entity) {
      const speed = Math.hypot(this.playerVel.x, this.playerVel.y);
      const cinematicBoost = this.introFlightFrames > 0 || this.waveDepartureFrames > 0 ? 1.8 : 1;
      const deathFade = this.deathSequenceFrames > 0 ? 1 - (this.deathSequenceFrames / this.deathSequenceDuration) : 0;
      const boost = Math.max(cinematicBoost, 0.72 + Math.min(0.9, speed / 6)) * (1 - deathFade * 0.7);
      const flameLength = e.height * (0.24 + boost * 0.16) * (0.78 + Math.sin(this.frameCount * 0.55) * 0.18);
      const flameWidth = e.width * 0.075;
      const nozzleY = e.height * 0.28;
      const nozzleSpread = e.width * 0.16;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [-1, 1].forEach((side) => {
        const x = side * nozzleSpread;
        const gradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flameLength);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.24, 'rgba(103,232,249,0.9)');
        gradient.addColorStop(0.62, 'rgba(37,99,235,0.62)');
        gradient.addColorStop(1, 'rgba(34,211,238,0)');

        ctx.shadowBlur = this.getGlowBlur(24 * boost);
        ctx.shadowColor = '#22d3ee';
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
        ctx.strokeStyle = 'rgba(103,232,249,0.34)';
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

  drawEntity(ctx: CanvasRenderingContext2D, e: Entity) {
    if (e.isBeam) {
        this.drawLaser(ctx, e);
        return;
    }
    ctx.save();
    ctx.translate(e.x + e.width / 2, e.y + e.height / 2);
    ctx.globalAlpha = 1.0;
    
    if (e.type === EntityType.PLAYER) {
       const img = imageCache[ASSETS.PLAYER_SHIP];
       const squash = clamp(this.playerSquash, -0.24, 0.24);
       ctx.globalAlpha = this.playerDrawAlpha;
       ctx.scale(this.playerDrawScale, this.playerDrawScale);
       ctx.rotate(this.playerTilt);
       ctx.scale(1 + squash * 0.78, 1 - squash * 0.58);
       this.drawPlayerThrusters(ctx, e);

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

    } else if (e.type === EntityType.ENEMY_DRONE) {
        const frame = this.getAnimatedFrame(ASSETS.ENEMY_DRONE_FRAMES, e, 6);
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            shadowColor: '#38bdf8',
            shadowBlur: 10
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_SWARM) {
        const frame = this.getAnimatedFrame(ASSETS.ENEMY_SWARM_FRAMES, e, 5);
        const rotation = Math.sin((this.frameCount + e.variant) * 0.08) * 0.12;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: e.formation === 'orbit' ? '#a7f3d0' : '#34d399',
            shadowBlur: e.formation === 'orbit' ? 14 : 8
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_BRICK) {
        const frame = ASSETS.ENEMY_BRICK_FRAMES[e.variant % ASSETS.ENEMY_BRICK_FRAMES.length];
        const rotation = Math.sin((this.frameCount + e.variant) * 0.03) * 0.2;
        const drewSprite = this.drawSprite(ctx, frame, e.width, e.height, {
            rotation,
            shadowColor: '#f59e0b',
            shadowBlur: 6
        });
        if (!drewSprite) {
            ctx.fillStyle = e.color;
            ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
        }

    } else if (e.type === EntityType.ENEMY_JOURNAL) {
        const sway = Math.sin((this.frameCount + e.variant) * 0.04) * 0.12;
        const drewSprite = this.drawSprite(ctx, ASSETS.ENEMY_JOURNAL, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 14
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
        
        let imgUrl = ASSETS.FOUNDER_4; 
        if (type === PowerupType.TRIPLE_SHOT) imgUrl = ASSETS.FOUNDER_BRIAN;
        if (type === PowerupType.MAGNET) imgUrl = ASSETS.FOUNDER_PATRICK;
        if (type === PowerupType.SHIELD) imgUrl = ASSETS.FOUNDER_JEFFREY;
        if (type === PowerupType.DOUBLE_SHOT) imgUrl = ASSETS.FOUNDER_4;
        if (type === PowerupType.EXTRA_LIFE) imgUrl = ASSETS.FOUNDER_ARSHIA; // Arshia
        if (type === PowerupType.RESEARCH_BEAM) imgUrl = ASSETS.REAL_RSC_ICON;
        
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
        const drewSprite = this.drawSprite(ctx, ASSETS.WALL_BOSS_SEGMENT, e.width, e.height, {
            rotation: sway,
            shadowColor: '#fb7185',
            shadowBlur: 8
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
        const img = imageCache[ASSETS.RSC_TOKEN];
        const spin = Math.sin((this.frameCount + e.variant) * 0.16);
        const spinWidth = Math.max(0.18, Math.abs(spin));
        if (img && img.complete && img.naturalWidth > 0) {
            ctx.save();
            ctx.scale(spinWidth, 1);
            ctx.rotate((this.frameCount + e.variant) * 0.025);
            ctx.shadowBlur = this.getGlowBlur(10 + (1 - spinWidth) * 8);
            ctx.shadowColor = '#FFD700'; 
            ctx.beginPath();
            ctx.arc(0, 0, e.width/2, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(img, -e.width/2, -e.height/2, e.width, e.height);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.save();
            ctx.scale(spinWidth, 1);
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

    } else if (e.type === EntityType.PARTICLE) {
        ctx.globalAlpha = Math.max(0, Math.min(1, e.life / Math.max(1, e.maxLife)));
        ctx.shadowBlur = this.getGlowBlur(Math.max(0, e.width * 1.6));
        ctx.shadowColor = e.color;
        ctx.fillStyle = e.color;
        ctx.fillRect(-e.width / 2, -e.height / 2, e.width, e.height);
    } else if (e.type === EntityType.EFFECT) {
        const eff = e as VisualEffect;
        if (eff.effectType === 'text') {
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
        ctx.globalCompositeOperation = 'lighter';
        const leanShot = e.isPlayerShot && this.shouldUseLeanEffects();
        const isIonShot = e.isPlayerShot && e.weaponKind === 'ion';
        ctx.shadowBlur = this.getGlowBlur(leanShot ? (isIonShot ? 8 : 5) : isIonShot ? 26 : e.isPlayerShot ? 18 : 12);
        ctx.shadowColor = e.color || (e.isPlayerShot ? '#67e8f9' : '#fb7185');

        if (e.text) { 
           ctx.font = '24px serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText(e.text, 0, 0);
        } else if (e.isPlayerShot) {
          if (isIonShot) {
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
