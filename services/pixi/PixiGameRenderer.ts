import 'pixi.js/unsafe-eval';
import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture
} from 'pixi.js';
import { ASSETS, GAME_CONFIG } from '../../constants';
import { EntityType, PowerupType } from '../../types';
import { BOSS_CANNON_SCALE, CROWNCLAW_ARM_SCALE, Entity, GameEngine, VisualEffect } from '../gameLogic';
import type { BossComponentState, BossPartId, GameRuntimeState } from '../gameLogic';
import type { BossRigId } from '../../game-config/types';
import {
  PLAYER_SHIP_HARD_BANK_SWEEP_RATIO,
  PLAYER_SHIP_STEERING_FRAME_URLS,
  PLAYER_SHIP_TOUCH_SPEED_SCALE,
  applyPlayerSteeringDeadzone,
  getPlayerSteeringBlendMs,
  getPlayerShipMotionByAssetUrl,
  selectPlayerSteeringState,
  type PlayerSteeringState
} from '../playerShipMotion';
import {
  PLAYER_WEAPON_FRAME_URLS,
  getPlayerWeaponFrames,
  getPlayerWeaponLaunchFrameIndex
} from '../playerWeaponVisuals';
import { RESEARCH_IMPACT_FRAME_URLS, SHIP_ABILITY_FRAME_URLS } from '../shipAbilityService';
import { MINI_SHIP_CATALOG } from '../squadProgression';
import { ArcadeEffectPool } from './ArcadeEffectPool';
import { PIXI_ENVIRONMENT_TEXTURE_URLS, PixiEnvironment } from './PixiEnvironment';
import { PixiTextureBank } from './PixiTextureBank';

type SceneLayerName =
  | 'background'
  | 'environment'
  | 'enemy'
  | 'player'
  | 'projectile'
  | 'pickup'
  | 'effects'
  | 'foreground'
  | 'overlay';

type EntityView = {
  id: string;
  type: EntityType;
  root: Container;
  trail: Graphics;
  aura: Graphics;
  sprite: Sprite;
  body: Graphics;
  flash: Graphics;
  health: Graphics;
  label: Text;
  textureKey: string | null;
  textureRequest: number;
  lastHp: number;
  lastFlashFrames: number;
  lastMarkedForDeletion: boolean;
  hasFallbackBody: boolean;
  bossRig?: BossRigView;
  seenFrame: number;
};

type BossRigView = {
  parts: Container;
  partSprites: Record<BossPartId, Sprite>;
  thrust: Container;
  thrusterSprites: readonly [Sprite, Sprite];
  componentHealth: Graphics;
  crownClaw: CrownClawRigView;
};

type CrownClawLegId = keyof typeof ASSETS.PIXI_BOSS_CROWNCLAW_LEGS;

type CrownClawRigView = {
  root: Container;
  body: Sprite;
  legs: Record<CrownClawLegId, Sprite>;
  guns: Record<'left' | 'right', Sprite>;
  claws: Record<'left' | 'right', Sprite>;
};

type BossSnapshot = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textureKey: string;
};

const PLAYER_THRUSTER_COLORS = [
  ['#67e8f9', '#22d3ee'],
  ['#a7f3d0', '#34d399'],
  ['#fef08a', '#f59e0b'],
  ['#f0abfc', '#a855f7'],
  ['#fca5a5', '#ef4444'],
  ['#ffffff', '#38bdf8'],
  ['#ffffff', '#facc15']
] as const;

const CROWNCLAW_LEG_LAYOUT: Record<CrownClawLegId, {
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
  direction: number;
  phase: number;
}> = {
  frontLeft: { x: -148, y: -174, pivotX: 231, pivotY: 128, direction: -1, phase: 0 },
  frontRight: { x: 148, y: -174, pivotX: 25, pivotY: 128, direction: 1, phase: Math.PI },
  middleLeft: { x: -161, y: -113, pivotX: 216, pivotY: 105, direction: -1, phase: Math.PI },
  middleRight: { x: 161, y: -113, pivotX: 40, pivotY: 105, direction: 1, phase: 0 },
  rearLeft: { x: -246, y: -59, pivotX: 207, pivotY: 64, direction: -1, phase: Math.PI * 0.5 },
  rearRight: { x: 246, y: -59, pivotX: 49, pivotY: 64, direction: 1, phase: Math.PI * 1.5 }
};

const CROWNCLAW_WEAPON_LAYOUT = {
  left: { x: -226, y: 34, pivotX: 164, pivotY: 67 },
  right: { x: 226, y: 34, pivotX: 92, pivotY: 67 }
} as const;

const WHITE_HIT_FILTER = new ColorMatrixFilter();
WHITE_HIT_FILTER.matrix = [
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 0, 1,
  0, 0, 0, 1, 0
];
const WHITE_HIT_FILTERS = [WHITE_HIT_FILTER];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createLayer = () => {
  const layer = new Container();
  layer.eventMode = 'none';
  return layer;
};

const createText = (size: number, color = '#ffffff', weight: 'normal' | 'bold' = 'bold') => new Text({
  text: '',
  style: {
    fill: color,
    fontFamily: 'Orbitron, ui-monospace, monospace',
    fontSize: size,
    fontWeight: weight,
    align: 'center',
    letterSpacing: 1
  }
});

const WAVE_GLYPH_ROOT = '/game-art/generated/ui/scicon-simple-arcade-kit-v1/wave-glyphs/cyan';
const WAVE_TITLE_TEXTURE_URL = `${WAVE_GLYPH_ROOT}/wave-title-cyan.png`;
const WAVE_GLYPH_TEXTURE_URLS = Object.freeze({
  '0': `${WAVE_GLYPH_ROOT}/wave-glyph-0-cyan.png`,
  '1': `${WAVE_GLYPH_ROOT}/wave-glyph-1-cyan.png`,
  '2': `${WAVE_GLYPH_ROOT}/wave-glyph-2-cyan.png`,
  '3': `${WAVE_GLYPH_ROOT}/wave-glyph-3-cyan.png`,
  '4': `${WAVE_GLYPH_ROOT}/wave-glyph-4-cyan.png`,
  '5': `${WAVE_GLYPH_ROOT}/wave-glyph-5-cyan.png`,
  '6': `${WAVE_GLYPH_ROOT}/wave-glyph-6-cyan.png`,
  '7': `${WAVE_GLYPH_ROOT}/wave-glyph-7-cyan.png`,
  '8': `${WAVE_GLYPH_ROOT}/wave-glyph-8-cyan.png`,
  '9': `${WAVE_GLYPH_ROOT}/wave-glyph-9-cyan.png`,
  '/': `${WAVE_GLYPH_ROOT}/wave-glyph-slash-cyan.png`
});

const WAVE_INTRO_FRAGMENT_COUNT_COMPACT = 42;
const WAVE_INTRO_FRAGMENT_COUNT_FULL = 60;
const WAVE_INTRO_ENTER_MS = 760;
const WAVE_INTRO_HOLD_UNTIL_MS = 1900;
const WAVE_INTRO_EXIT_MS = 680;
const WAVE_INTRO_DURATION_MS = WAVE_INTRO_HOLD_UNTIL_MS + WAVE_INTRO_EXIT_MS;
const WAVE_INTRO_REDUCED_DURATION_MS = 1400;

export const PIXI_WAVE_PRESENTATION_TEXTURE_URLS = Object.freeze([
  WAVE_TITLE_TEXTURE_URL,
  ...Object.values(WAVE_GLYPH_TEXTURE_URLS)
]);

const getPowerupFrames = (powerup: PowerupType): readonly string[] => {
  switch (powerup) {
    case PowerupType.TRIPLE_SHOT:
    case PowerupType.DOUBLE_SHOT:
      return ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
    case PowerupType.MAX_SHOT:
      return [ASSETS.POWERUP_MAX_SHOT];
    case PowerupType.MAGNET:
      return ASSETS.POWERUP_MAGNET_FRAMES;
    case PowerupType.SHIELD:
      return ASSETS.POWERUP_SHIELD_FRAMES;
    case PowerupType.EXTRA_LIFE:
      return ['/game-art/powerups/extra-life.png'];
    case PowerupType.RESEARCH_BEAM:
      return ASSETS.POWERUP_RESEARCH_BEAM_FRAMES;
    default:
      return ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES;
  }
};

/** The exact production texture set needed by the Pixi mission renderer. */
export const PIXI_GAMEPLAY_TEXTURE_URLS = Object.freeze([
  ...PIXI_WAVE_PRESENTATION_TEXTURE_URLS,
  ASSETS.PIXI_BOSS_HEALTH_FRAME,
  ASSETS.PIXI_BOSS_ALERT_FRAME,
  ASSETS.PIXI_MINI_BOSS_ALERT_FRAME,
  ASSETS.PIXI_BOSS_ALERT_RING,
  ASSETS.PIXI_BOSS_ALERT_SCAN,
  ASSETS.PIXI_BOSS_ALERT_CRYSTAL,
  ...PIXI_ENVIRONMENT_TEXTURE_URLS,
  ...ASSETS.ENEMY_DRONE_FRAMES,
  ...ASSETS.ENEMY_SWARM_FRAMES,
  ...ASSETS.ENEMY_BRICK_FRAMES,
  ...ASSETS.ASTEROID_BELT_FRAMES,
  ...ASSETS.ENEMY_JOURNAL_FRAMES,
  ...ASSETS.PAYWALL_BASTION_FRAMES,
  ...ASSETS.PIXI_JET_SCOUT_FRAMES,
  ...ASSETS.PIXI_JET_INTERCEPTOR_FRAMES,
  ...ASSETS.PIXI_JET_HEAVY_FRAMES,
  ...ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES,
  ...ASSETS.PIXI_BOSS_CITATION_FRAMES,
  ...ASSETS.PIXI_BOSS_PAYWALL_FRAMES,
  ...ASSETS.PIXI_BOSS_OPEN_GALAXY_FRAMES,
  ...ASSETS.PIXI_BOSS_CROWNCLAW_FRAMES,
  ...Object.values(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS),
  ...ASSETS.PIXI_BOSS_PAYWALL_RAY_FRAMES,
  ...ASSETS.PIXI_BOSS_PAYWALL_BOLT_FRAMES,
  ...ASSETS.PIXI_BOSS_THRUSTER_FRAMES,
  ...ASSETS.PIXI_THRUSTER_FRAMES,
  ...ASSETS.PIXI_EXPLOSION_FRAMES,
  ...ASSETS.PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES,
  ...PLAYER_SHIP_STEERING_FRAME_URLS,
  ...PLAYER_WEAPON_FRAME_URLS,
  ...SHIP_ABILITY_FRAME_URLS,
  ...RESEARCH_IMPACT_FRAME_URLS,
  ...ASSETS.POWERUP_OVERDRIVE_SPREAD_FRAMES,
  ASSETS.POWERUP_MAX_SHOT,
  ASSETS.POWERUP_MAX_SHOT_AURA,
  ...ASSETS.POWERUP_MAGNET_FRAMES,
  ...ASSETS.POWERUP_SHIELD_FRAMES,
  ...ASSETS.POWERUP_RESEARCH_BEAM_FRAMES,
  ...MINI_SHIP_CATALOG.flatMap((miniShip) => miniShip.frames),
  ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_LEFT,
  ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT,
  ASSETS.PIXI_BOSS_CITATION_CLAW_LEFT,
  ASSETS.PIXI_BOSS_CITATION_CLAW_RIGHT,
  ASSETS.PIXI_BOSS_PAYWALL_CANNON_LEFT,
  ASSETS.PIXI_BOSS_PAYWALL_CANNON_RIGHT,
  ASSETS.PIXI_BOSS_PAYWALL_HELMET,
  ASSETS.PIXI_BOSS_CROWNCLAW_CORE,
  ASSETS.PIXI_BOSS_CROWNCLAW_GUN_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_GUN_RIGHT,
  ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_RIGHT,
  ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_LEFT,
  ASSETS.PIXI_BOSS_CROWNCLAW_ROCKET_RIGHT,
  ASSETS.MINI_BOSS,
  ASSETS.FINAL_BOSS,
  ASSETS.WALL_BOSS_SEGMENT,
  ASSETS.RSC_TOKEN,
  ...ASSETS.RSC_TOKEN_FLIP_FRAMES
]);

let pixiGameplayTexturePreload: Promise<void> | null = null;

/** Warms Pixi's shared GPU texture cache; unused gallery art is never requested. */
export const preloadPixiGameplayTextures = () => {
  if (!pixiGameplayTexturePreload) {
    const urls = [...new Set(PIXI_GAMEPLAY_TEXTURE_URLS.filter(Boolean))];
    pixiGameplayTexturePreload = Promise.allSettled(urls.map(async (url) => {
      const texture = await Assets.load<Texture>(url);
      texture.source.scaleMode = 'nearest';
    })).then(() => undefined);
  }
  return pixiGameplayTexturePreload;
};

const isEnemyType = (type: EntityType) => (
  type === EntityType.ENEMY_DRONE
  || type === EntityType.ENEMY_SWARM
  || type === EntityType.ENEMY_BRICK
  || type === EntityType.ENEMY_JOURNAL
  || type === EntityType.ENEMY_INVADER
  || type === EntityType.MINI_BOSS
  || type === EntityType.BOSS
);

const isPickupType = (type: EntityType) => (
  type === EntityType.COIN
  || type === EntityType.POWERUP
  || type === EntityType.BOMB
);

const getEntityLayer = (type: EntityType): SceneLayerName => {
  if (type === EntityType.PLAYER) return 'player';
  if (type === EntityType.PROJECTILE || type === EntityType.MISSILE) return 'projectile';
  if (isPickupType(type)) return 'pickup';
  if (type === EntityType.PARTICLE || type === EntityType.EFFECT) return 'effects';
  return 'enemy';
};

const isFormationMotionEnemy = (entity: Entity) => (
  entity.type === EntityType.ENEMY_DRONE
  || entity.type === EntityType.ENEMY_SWARM
  || entity.type === EntityType.ENEMY_BRICK
  || entity.type === EntityType.ENEMY_JOURNAL
);

const getFormationMotionFrameIndex = (engine: GameEngine, entity: Entity) => {
  const stateAge = Math.max(0, engine.frameCount - entity.formationStateFrame);
  const pingPong = [0, 1, 2, 1] as const;
  const phaseOffset = Math.abs(entity.variant * 13 + entity.formationIndex * 7);

  if (entity.formationState === 'hold') {
    const framesUntilDive = entity.formationDiveFrame - engine.frameCount;
    if (entity.formationDiveFrame > 0 && framesUntilDive > 0 && framesUntilDive <= 36) {
      return clamp(Math.floor((36 - framesUntilDive) / 12), 0, 2);
    }

    const idlePulseFrame = (stateAge + phaseOffset) % 210;
    if (idlePulseFrame < 28) {
      return pingPong[Math.floor(idlePulseFrame / 7) % pingPong.length];
    }
    return 1;
  }

  if (entity.formationState === 'dive') {
    if (stateAge < 20) return 2;
    return pingPong[Math.floor((stateAge + phaseOffset) / 8) % pingPong.length];
  }

  if (entity.formationState === 'entry' || entity.formationState === 'return') {
    return pingPong[Math.floor((stateAge + phaseOffset) / 8) % pingPong.length];
  }

  const ambientFrame = (engine.frameCount + phaseOffset) % 240;
  return ambientFrame < 28
    ? pingPong[Math.floor(ambientFrame / 7) % pingPong.length]
    : 1;
};

const getPaywallBastionFrameIndex = (engine: GameEngine, entity: Entity) => {
  const healthRatio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 1;
  if (healthRatio <= 0.15) return 4;
  if (healthRatio <= 0.5) return 3;
  if (entity.attackTimer > 0) return 2;
  return Math.floor((engine.frameCount + entity.variant * 5) / 24) % 2;
};

const getStaticAsteroidTexture = (engine: GameEngine, entity: Entity) => {
  const frames = entity.spriteFrames?.length
    ? entity.spriteFrames
    : ASSETS.ASTEROID_BELT_FRAMES;
  const stageNumber = Math.max(1, Math.floor(Number(engine.stats.wave) || 1));
  const darkerWindowStart = stageNumber >= 4
    ? Math.max(0, frames.length - 2)
    : stageNumber >= 3
      ? Math.max(0, frames.length - 3)
      : 0;
  const stableVariant = Math.max(0, Math.floor(entity.variant) - 900);
  const availableFrameCount = Math.max(1, frames.length - darkerWindowStart);
  return frames[darkerWindowStart + (stableVariant % availableFrameCount)]
    ?? frames[0]
    ?? ASSETS.ASTEROID_BELT_FRAMES[0];
};

const getDefaultEntityTexture = (engine: GameEngine, entity: Entity) => {
  // Asteroid sheets are a style library, not animation frames. Lock every
  // rock to one texture so it reads as solid terrain instead of flickering.
  if (entity.type === EntityType.ENEMY_BRICK && entity.variant >= 900) {
    return getStaticAsteroidTexture(engine, entity);
  }
  if (entity.spriteFrames?.length) {
    if (entity.type === EntityType.BOSS) {
      return entity.spriteFrames[clamp(entity.bossDecayStage, 0, entity.spriteFrames.length - 1)];
    }
    if (entity.type === EntityType.ENEMY_INVADER && entity.spriteFrames.length >= 5) {
      return entity.spriteFrames[getPaywallBastionFrameIndex(engine, entity)];
    }
    if (isFormationMotionEnemy(entity) && entity.spriteFrames.length === 3) {
      return entity.spriteFrames[getFormationMotionFrameIndex(engine, entity)];
    }
    const speed = entity.type === EntityType.ENEMY_SWARM ? 5 : 6;
    return entity.spriteFrames[(Math.floor(engine.frameCount / speed) + entity.variant) % entity.spriteFrames.length];
  }
  if (entity.spriteUrl) return entity.spriteUrl;

  switch (entity.type) {
    case EntityType.PLAYER:
      return engine.playerShipUrl;
    case EntityType.ENEMY_DRONE:
      return ASSETS.ENEMY_DRONE_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_SWARM:
      return ASSETS.ENEMY_SWARM_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_BRICK: {
      return ASSETS.ENEMY_BRICK_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    }
    case EntityType.ENEMY_JOURNAL:
      return ASSETS.ENEMY_JOURNAL_FRAMES[getFormationMotionFrameIndex(engine, entity)];
    case EntityType.ENEMY_INVADER:
      return ASSETS.PAYWALL_BASTION_FRAMES[getPaywallBastionFrameIndex(engine, entity)];
    case EntityType.MINI_BOSS:
      return ASSETS.MINI_BOSS;
    case EntityType.BOSS:
      return ASSETS.FINAL_BOSS;
    case EntityType.COIN: {
      const frameIndex = Math.floor((engine.frameCount + entity.variant) / 5)
        % ASSETS.RSC_TOKEN_FLIP_FRAMES.length;
      return ASSETS.RSC_TOKEN_FLIP_FRAMES[frameIndex];
    }
    case EntityType.BOMB:
      return engine.bombSpriteUrl;
    case EntityType.POWERUP: {
      const frames = getPowerupFrames(entity.text as PowerupType);
      const frameIndex = Math.floor((engine.frameCount + entity.variant) / 8) % frames.length;
      return frames[frameIndex];
    }
    default:
      return null;
  }
};

export class PixiGameRenderer {
  readonly app = new Application();

  private readonly textureBank = new PixiTextureBank();
  private readonly layers: Record<SceneLayerName, Container> = {
    background: createLayer(),
    environment: createLayer(),
    enemy: createLayer(),
    player: createLayer(),
    projectile: createLayer(),
    pickup: createLayer(),
    effects: createLayer(),
    foreground: createLayer(),
    overlay: createLayer()
  };
  private readonly camera = createLayer();
  private readonly world = createLayer();
  private readonly views = new Map<string, EntityView>();
  private readonly recycledViews = new Map<EntityType, EntityView[]>();
  private readonly environment = new PixiEnvironment(this.layers.background, this.layers.environment, this.textureBank);
  private readonly warningShade = new Graphics();
  private readonly warningFrame = new Graphics();
  private readonly warningRoot = new Container();
  private readonly warningBanner = new Sprite(Texture.WHITE);
  private readonly warningRing = new Sprite(Texture.WHITE);
  private readonly warningScan = new Sprite(Texture.WHITE);
  private readonly warningCrystal = new Sprite(Texture.WHITE);
  private readonly warningText = createText(34, '#fffbeb');
  private readonly warningSubtext = createText(15, '#fda4af');
  private readonly phaseText = createText(18, '#fef08a');
  private readonly waveIntroRoot = new Container();
  private readonly waveIntroAura = new Graphics();
  private readonly waveIntroPixels = new Graphics();
  private readonly waveIntroSweep = new Graphics();
  private readonly waveLevelText = createText(13, '#a7f3d0');
  private readonly waveCounterRoot = new Container();
  private readonly waveTitle = new Sprite(Texture.WHITE);
  private readonly waveCounterGlyphs = Array.from({ length: 8 }, () => new Sprite(Texture.WHITE));
  private readonly waveNameText = createText(17, '#e0f2fe');
  private readonly flashOverlay = new Graphics();
  private readonly scanlines = new Graphics();
  private readonly maxShotScreenGlow = new Graphics();
  private readonly effectPool = new ArcadeEffectPool(this.layers.effects);
  private readonly maxShotAura = new Sprite(Texture.WHITE);
  private readonly playerThrusterRoot = new Container();
  private readonly playerThrusters = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)] as const;
  private readonly gunPodRoot = new Container();
  private readonly gunPodSprites = [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)] as const;
  private readonly bioBeamRoot = new Container();
  private readonly bioBeamAura = new Graphics();
  private readonly bioBeamCore = new Graphics();
  private readonly bioBeamEmitter = new Sprite(Texture.WHITE);
  private readonly wallHealthRoot = new Container();
  private readonly wallHealthBar = new Graphics();
  private readonly wallHealthLabel = createText(9, '#fef08a');
  private readonly bossHealthRoot = new Container();
  private readonly bossHealthFrame = new Sprite(Texture.WHITE);
  private readonly bossHealthBar = new Graphics();
  private readonly bossHealthName = createText(10, '#fef08a');
  private readonly bossHealthPercent = createText(9, '#a7f3d0');
  private readonly seenBossPhase = new Map<string, number>();
  private readonly seenBossComponents = new Map<string, Partial<Record<BossPartId, boolean>>>();
  private readonly bossDeathRoot = new Container();
  private readonly bossDeathSprite = new Sprite(Texture.WHITE);
  private readonly bossDeathCore = new Graphics();
  private readonly bossDeathText = createText(24, '#a7f3d0');
  private lastBossSnapshot: BossSnapshot | null = null;
  private bossDeathAge = -1;
  private bossDeathStage = -1;
  private bossDeathHandled = false;
  private bossDeathTextureRequest = 0;
  private phaseTextUntilFrame = -1;
  private appReady = false;
  private appDestroyed = false;
  private initialized = false;
  private renderFrame = 0;
  private width = 1;
  private height = 1;
  private lastTimestamp = 0;
  private playerSteeringVisual = 0;
  private playerSteeringState: PlayerSteeringState = 'neutral';
  private playerSteeringTextureKey: string | null = null;
  private playerSteeringSweepOriginX: number | null = null;
  private playerSteeringSweepDirection: -1 | 0 | 1 = 0;
  private playerSteeringShipUrl: string | null = null;
  private lastShotFrame = -999;
  private lastBombFrame = -999;
  private bioBeamVisualStartFrame = -1;
  private lastWavePresentationRevision = -1;
  private lastWavePresentationKey = '';
  private wavePresentationElapsedMs = 0;
  private currentWaveCounter = '1/1';
  private reducedMotion = false;
  private destroyed = false;

  async init(host: HTMLElement, width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const mobile = this.width < 620 || this.height > this.width * 1.25;
    const resolution = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.75);

    await this.app.init({
      width: this.width,
      height: this.height,
      background: '#020617',
      antialias: false,
      autoDensity: true,
      resolution,
      autoStart: false,
      sharedTicker: false,
      powerPreference: 'high-performance',
      preference: 'webgl'
    });
    this.appReady = true;
    if (this.destroyed) {
      this.destroyApplication();
      return;
    }
    this.app.stop();
    this.app.canvas.className = 'absolute left-0 top-0 z-0 block h-full w-full';
    this.app.canvas.style.touchAction = 'none';
    this.app.canvas.style.outline = 'none';
    this.app.canvas.setAttribute('aria-label', 'Scicon Shooter Pixi gameplay canvas');
    host.replaceChildren(this.app.canvas);

    this.app.stage.eventMode = 'none';
    this.app.stage.addChild(this.layers.background, this.camera, this.layers.overlay);
    this.camera.addChild(this.world);
    this.world.addChild(
      this.layers.environment,
      this.layers.enemy,
      this.layers.player,
      this.layers.projectile,
      this.layers.pickup,
      this.layers.effects,
      this.layers.foreground
    );

    this.maxShotAura.eventMode = 'none';
    this.maxShotAura.visible = false;
    this.maxShotAura.anchor.set(0.5);
    this.layers.player.addChild(this.maxShotAura);

    this.playerThrusterRoot.eventMode = 'none';
    this.playerThrusterRoot.visible = false;
    for (const thruster of this.playerThrusters) {
      thruster.anchor.set(0.76, 0.5);
      thruster.rotation = -Math.PI / 2;
      this.playerThrusterRoot.addChild(thruster);
    }
    this.layers.player.addChild(this.playerThrusterRoot);

    this.gunPodRoot.eventMode = 'none';
    this.gunPodRoot.visible = false;
    for (const pod of this.gunPodSprites) {
      pod.anchor.set(0.5);
      this.gunPodRoot.addChild(pod);
    }
    this.layers.player.addChild(this.gunPodRoot);

    this.bioBeamRoot.eventMode = 'none';
    this.bioBeamRoot.visible = false;
    this.bioBeamEmitter.anchor.set(0.5, 1);
    this.bioBeamRoot.addChild(this.bioBeamAura, this.bioBeamCore, this.bioBeamEmitter);
    this.layers.projectile.addChild(this.bioBeamRoot);

    this.wallHealthLabel.anchor.set(0.5);
    this.wallHealthRoot.eventMode = 'none';
    this.wallHealthRoot.visible = false;
    this.wallHealthRoot.addChild(this.wallHealthBar, this.wallHealthLabel);
    this.layers.foreground.addChild(this.wallHealthRoot);

    this.bossHealthFrame.anchor.set(0.5);
    this.bossHealthName.anchor.set(0.5);
    this.bossHealthPercent.anchor.set(0.5);
    this.bossHealthRoot.eventMode = 'none';
    this.bossHealthRoot.visible = false;
    this.bossHealthRoot.addChild(
      this.bossHealthFrame,
      this.bossHealthBar,
      this.bossHealthName,
      this.bossHealthPercent
    );

    this.bossDeathSprite.anchor.set(0.5);
    this.bossDeathText.anchor.set(0.5);
    this.bossDeathRoot.eventMode = 'none';
    this.bossDeathRoot.visible = false;
    this.bossDeathRoot.addChild(this.bossDeathSprite, this.bossDeathCore, this.bossDeathText);
    this.layers.foreground.addChild(this.bossDeathRoot);

    this.warningRoot.eventMode = 'none';
    this.warningRoot.visible = false;
    this.warningBanner.anchor.set(0.5);
    this.warningRing.anchor.set(0.5);
    this.warningScan.anchor.set(0.5);
    this.warningCrystal.anchor.set(0.5);
    this.warningText.anchor.set(0.5);
    this.warningSubtext.anchor.set(0.5);
    this.warningRoot.addChild(
      this.warningBanner,
      this.warningScan,
      this.warningRing,
      this.warningCrystal,
      this.warningText,
      this.warningSubtext
    );

    this.waveIntroRoot.eventMode = 'none';
    this.waveIntroRoot.visible = false;
    this.waveTitle.anchor.set(0.5);
    this.waveCounterRoot.addChild(this.waveTitle);
    for (const glyph of this.waveCounterGlyphs) {
      glyph.anchor.set(0.5);
      glyph.visible = false;
      this.waveCounterRoot.addChild(glyph);
    }
    this.waveLevelText.anchor.set(0.5);
    this.waveNameText.anchor.set(0.5);
    this.waveIntroRoot.addChild(
      this.waveIntroAura,
      this.waveIntroPixels,
      this.waveIntroSweep,
      this.waveLevelText,
      this.waveCounterRoot,
      this.waveNameText
    );

    this.layers.overlay.addChild(
      this.maxShotScreenGlow,
      this.bossHealthRoot,
      this.waveIntroRoot,
      this.warningShade,
      this.warningFrame,
      this.warningRoot,
      this.phaseText,
      this.flashOverlay,
      this.scanlines
    );

    this.warningShade.visible = false;
    this.warningFrame.visible = false;
    this.phaseText.visible = false;
    this.flashOverlay.visible = false;
    this.maxShotScreenGlow.visible = false;

    await this.environment.init(this.width, this.height);
    if (this.destroyed) return;
    this.resize(this.width, this.height);

    await this.textureBank.preload([...PIXI_GAMEPLAY_TEXTURE_URLS]);
    this.waveTitle.texture = this.textureBank.get(WAVE_TITLE_TEXTURE_URL) ?? Texture.WHITE;
    this.maxShotAura.texture = this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA) ?? Texture.WHITE;
    this.bossHealthFrame.texture = this.textureBank.get(ASSETS.PIXI_BOSS_HEALTH_FRAME) ?? Texture.WHITE;
    this.warningBanner.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_FRAME) ?? Texture.WHITE;
    this.warningRing.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_RING) ?? Texture.WHITE;
    this.warningScan.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_SCAN) ?? Texture.WHITE;
    this.warningCrystal.texture = this.textureBank.get(ASSETS.PIXI_BOSS_ALERT_CRYSTAL) ?? Texture.WHITE;
    this.effectPool.setExplosionTextures(
      ASSETS.PIXI_EXPLOSION_FRAMES
        .map((url) => this.textureBank.get(url))
        .filter((texture): texture is Texture => Boolean(texture))
    );
    this.effectPool.setBossExplosionTextures(
      ASSETS.PIXI_BOSS_DAMAGE_EXPLOSION_FRAMES
        .map((url) => this.textureBank.get(url))
        .filter((texture): texture is Texture => Boolean(texture))
    );
    if (this.destroyed) return;
    this.initialized = true;
  }

  get canvas() {
    return this.app.canvas;
  }

  resize(width: number, height: number) {
    if (this.destroyed) return;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    if (this.app.renderer) this.app.renderer.resize(this.width, this.height);

    this.flashOverlay.clear().rect(0, 0, this.width, this.height).fill({ color: '#f87171', alpha: 1 });
    this.environment.resize(this.width, this.height);
    this.drawScanlines();
    this.layoutWavePresentation();
  }

  private drawScanlines() {
    this.scanlines.clear();
    if (this.width < 340) return;
    for (let y = 0; y < this.height; y += 5) {
      this.scanlines.rect(0, y, this.width, 1).fill({ color: '#0ea5e9', alpha: 0.018 });
    }
  }

  private layoutWavePresentation() {
    const compact = this.width < 520;
    const introScale = clamp(this.width / 430, 0.78, 1.2);
    const titleWidth = compact ? 118 : 142;
    const titleHeight = compact ? 37 : 44;
    const glyphWidth = compact ? 28 : 33;
    const glyphHeight = compact ? 35 : 42;
    const gap = compact ? 7 : 10;
    const counterLength = Math.max(1, Math.min(this.currentWaveCounter.length, this.waveCounterGlyphs.length));
    const totalWidth = titleWidth + gap + counterLength * glyphWidth;

    this.waveIntroRoot.scale.set(introScale);
    this.waveIntroRoot.position.set(
      this.width / 2,
      this.height * (this.height > this.width * 1.25 ? 0.43 : 0.47)
    );
    this.waveLevelText.position.set(0, compact ? -55 : -64);
    this.waveNameText.position.set(0, compact ? 53 : 62);
    this.waveCounterRoot.position.set(0, 0);
    this.waveTitle.width = titleWidth;
    this.waveTitle.height = titleHeight;
    this.waveTitle.position.set(-totalWidth / 2 + titleWidth / 2, 0);

    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      glyph.width = glyphWidth;
      glyph.height = glyphHeight;
      glyph.position.set(-totalWidth / 2 + titleWidth + gap + glyphWidth * (index + 0.5), 0);
    }

    this.waveLevelText.scale.set(1);
    this.waveNameText.scale.set(1);
    const localTextWidth = Math.min(330, this.width / introScale - 40);
    if (this.waveLevelText.width > localTextWidth) {
      this.waveLevelText.scale.set(localTextWidth / this.waveLevelText.width);
    }
    if (this.waveNameText.width > localTextWidth) {
      this.waveNameText.scale.set(localTextWidth / this.waveNameText.width);
    }
  }

  private setWaveCounterGlyphs(counter: string) {
    this.currentWaveCounter = counter.slice(0, this.waveCounterGlyphs.length);
    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      const character = this.currentWaveCounter[index] as keyof typeof WAVE_GLYPH_TEXTURE_URLS | undefined;
      const textureUrl = character ? WAVE_GLYPH_TEXTURE_URLS[character] : undefined;
      glyph.visible = Boolean(textureUrl);
      if (textureUrl) glyph.texture = this.textureBank.get(textureUrl) ?? Texture.WHITE;
    }
    this.layoutWavePresentation();
  }

  private beginWavePresentation(state: GameRuntimeState) {
    this.lastWavePresentationRevision = state.wavePresentationRevision;
    this.lastWavePresentationKey = `${state.levelId}:${state.waveId}`;
    this.wavePresentationElapsedMs = 0;
    this.waveLevelText.text = `STAGE ${String(state.levelNumber).padStart(2, '0')} · ${state.levelName.toUpperCase()}`;
    this.waveNameText.text = state.waveName.toUpperCase();
    this.waveNameText.style.fill = state.waveAccent;
    this.setWaveCounterGlyphs(`${state.waveNumber}/${state.waveTotal}`);
    this.waveIntroRoot.visible = true;
  }

  private updateWavePresentation(engine: GameEngine, timestamp: number, deltaMs: number) {
    const state = engine.getRuntimeState();
    const presentationKey = `${state.levelId}:${state.waveId}`;
    if (
      state.wavePresentationRevision !== this.lastWavePresentationRevision
      || presentationKey !== this.lastWavePresentationKey
    ) {
      this.beginWavePresentation(state);
    }

    const duration = this.reducedMotion ? WAVE_INTRO_REDUCED_DURATION_MS : WAVE_INTRO_DURATION_MS;
    if (!engine.cinematicPaused) {
      this.wavePresentationElapsedMs = Math.min(duration, this.wavePresentationElapsedMs + deltaMs);
    }
    const age = this.wavePresentationElapsedMs;
    if (age >= duration) {
      this.waveIntroRoot.visible = false;
      this.waveIntroAura.clear();
      this.waveIntroPixels.clear();
      this.waveIntroSweep.clear();
      return;
    }

    const enterDuration = this.reducedMotion ? 160 : WAVE_INTRO_ENTER_MS;
    const exitStart = this.reducedMotion ? duration - 240 : WAVE_INTRO_HOLD_UNTIL_MS;
    const exitDuration = this.reducedMotion ? 240 : WAVE_INTRO_EXIT_MS;
    const enter = clamp(age / enterDuration, 0, 1);
    const dissolve = clamp((age - exitStart) / exitDuration, 0, 1);
    const finalFade = 1 - clamp((dissolve - 0.86) / 0.14, 0, 1);
    const visibility = this.reducedMotion
      ? Math.min(enter, 1 - dissolve)
      : Math.min(enter, finalFade);
    const easedEnter = 1 - Math.pow(1 - enter, 3);
    const baseY = this.height * (this.height > this.width * 1.25 ? 0.43 : 0.47);
    const jitterX = this.reducedMotion || enter >= 1
      ? 0
      : Math.round(Math.sin(age * 0.095) * (1 - enter) * 7);
    this.waveIntroRoot.visible = true;
    this.waveIntroRoot.alpha = visibility;
    this.waveIntroRoot.position.set(this.width / 2 + jitterX, baseY + Math.round((1 - easedEnter) * 18));

    this.waveIntroAura.clear();
    const auraPulse = this.reducedMotion ? 1 : 0.76 + Math.sin(timestamp * 0.006) * 0.24;
    const auraRetention = 1 - clamp(dissolve * 1.18, 0, 1);
    for (let band = 0; band < 5; band++) {
      const bandWidth = 150 + band * 54 + auraPulse * 12;
      const bandY = (band - 2) * 8;
      const color = band % 2 === 0 ? '#22d3ee' : '#4ade80';
      this.waveIntroAura.rect(-bandWidth / 2, bandY, bandWidth, 2).fill({
        color,
        alpha: visibility * auraRetention * (0.13 - band * 0.014)
      });
    }
    this.waveIntroAura
      .poly([-250, 0, -176, -26, -112, -26, -84, -42])
      .stroke({ color: '#22d3ee', width: 2, alpha: visibility * auraRetention * 0.38 });
    this.waveIntroAura
      .poly([250, 0, 176, 26, 112, 26, 84, 42])
      .stroke({ color: '#4ade80', width: 2, alpha: visibility * auraRetention * 0.34 });

    this.waveIntroPixels.clear();
    this.waveIntroPixels.visible = !this.reducedMotion;
    if (!this.reducedMotion) {
      const fragmentCount = this.width < 520
        ? WAVE_INTRO_FRAGMENT_COUNT_COMPACT
        : WAVE_INTRO_FRAGMENT_COUNT_FULL;
      for (let index = 0; index < fragmentCount; index++) {
        const column = (index * 7) % 17;
        const row = (index * 11) % 7;
        const normalizedX = column / 16;
        const targetX = -240 + normalizedX * 480 + ((index % 3) - 1) * 2;
        const targetY = -66 + (row / 6) * 132;
        const stagger = (index % 13) / 13;
        const localAssembly = clamp((enter - stagger * 0.32) / 0.46, 0, 1);
        const assembledEase = 1 - Math.pow(1 - localAssembly, 3);
        const assemblyTravel = 1 - assembledEase;
        const localDissolve = clamp((dissolve - normalizedX * 0.46) / 0.54, 0, 1);
        const entering = dissolve <= 0 && enter < 1;
        const x = entering
          ? targetX + Math.sin(index * 2.41) * (100 + (index % 7) * 21) * assemblyTravel
          : targetX + localDissolve * localDissolve * (92 + (index % 9) * 13);
        const y = entering
          ? targetY + Math.cos(index * 1.73) * (44 + (index % 5) * 12) * assemblyTravel
          : targetY + Math.sin(index * 1.37) * localDissolve * (24 + (index % 4) * 9);
        const size = 2 + (index % 3);
        const alpha = entering
          ? Math.sin(Math.PI * localAssembly) * 0.78
          : Math.sin(Math.PI * localDissolve) * 0.88;
        this.waveIntroPixels.rect(x - size / 2, y - size / 2, size, size).fill({
          color: index % 3 === 0 ? '#4ade80' : '#67e8f9',
          alpha: visibility * alpha
        });
      }
    }

    this.waveIntroSweep.clear();
    const sweepActive = !this.reducedMotion && (enter < 1 || dissolve > 0);
    this.waveIntroSweep.visible = sweepActive;
    if (sweepActive) {
      const sweepProgress = dissolve > 0 ? dissolve : enter;
      const sweepX = -270 + sweepProgress * 540;
      const sweepAlpha = Math.sin(Math.PI * sweepProgress) * visibility;
      const trailDirection = dissolve > 0 ? 1 : -1;
      this.waveIntroSweep.rect(sweepX, -72, 3, 144).fill({ color: '#ffffff', alpha: sweepAlpha * 0.52 });
      this.waveIntroSweep.rect(sweepX - trailDirection * 11, -58, 2, 116).fill({
        color: '#22d3ee',
        alpha: sweepAlpha * 0.42
      });
      for (let streak = 0; streak < 5; streak++) {
        const streakWidth = 34 + streak * 13;
        const streakY = -48 + streak * 24;
        this.waveIntroSweep.rect(
          sweepX - trailDirection * streakWidth,
          streakY,
          streakWidth,
          1 + (streak % 2)
        ).fill({ color: streak % 2 === 0 ? '#67e8f9' : '#4ade80', alpha: sweepAlpha * 0.28 });
      }
    }

    const assembly = this.reducedMotion ? enter : clamp(age / WAVE_INTRO_ENTER_MS, 0, 1);
    const centerRetention = 1 - clamp((dissolve - 0.24) / 0.5, 0, 1);
    const titleRetention = 1 - clamp((dissolve - 0.02) / 0.42, 0, 1);
    this.waveLevelText.alpha = clamp((assembly - 0.04) / 0.24, 0, 1) * centerRetention;
    this.waveTitle.alpha = clamp((assembly - 0.1) / 0.22, 0, 1) * titleRetention;
    this.waveNameText.alpha = clamp((assembly - 0.48) / 0.28, 0, 1) * centerRetention;
    for (let index = 0; index < this.waveCounterGlyphs.length; index++) {
      const glyph = this.waveCounterGlyphs[index];
      const glyphAssembly = clamp((assembly - 0.24 - index * 0.055) / 0.2, 0, 1);
      const glyphSweepPosition = clamp((glyph.x + 270) / 540, 0, 1);
      const glyphRetention = 1 - clamp((dissolve - glyphSweepPosition * 0.5) / 0.5, 0, 1);
      glyph.alpha = glyphAssembly * glyphRetention;
      glyph.y = (1 - glyphAssembly) * (index % 2 === 0 ? -9 : 9)
        + (1 - glyphRetention) * (index % 2 === 0 ? -5 : 5);
    }
  }

  private createEntityView(entity: Entity) {
    const pool = this.recycledViews.get(entity.type);
    const reused = pool?.pop();
    if (reused) {
      reused.id = entity.id;
      reused.root.visible = true;
      reused.root.alpha = 1;
      reused.sprite.filters = null;
      reused.body.filters = null;
      reused.textureKey = null;
      reused.textureRequest++;
      reused.lastHp = entity.hp;
      reused.lastFlashFrames = 0;
      reused.lastMarkedForDeletion = false;
      reused.hasFallbackBody = false;
      if (reused.bossRig) {
        reused.bossRig.parts.filters = null;
        reused.bossRig.parts.visible = false;
        reused.bossRig.thrust.visible = false;
        reused.bossRig.componentHealth.clear();
        reused.bossRig.crownClaw.root.filters = null;
        reused.bossRig.crownClaw.root.visible = false;
        Object.values(reused.bossRig.partSprites).forEach((sprite) => {
          sprite.filters = null;
        });
        reused.bossRig.crownClaw.body.filters = null;
        Object.values(reused.bossRig.crownClaw.legs).forEach((sprite) => {
          sprite.filters = null;
        });
        Object.values(reused.bossRig.crownClaw.guns).forEach((sprite) => {
          sprite.filters = null;
        });
        Object.values(reused.bossRig.crownClaw.claws).forEach((sprite) => {
          sprite.filters = null;
        });
      }
      return reused;
    }

    const root = new Container();
    const trail = new Graphics();
    const aura = new Graphics();
    const sprite = new Sprite(Texture.WHITE);
    const body = new Graphics();
    const flash = new Graphics();
    const health = new Graphics();
    const label = createText(11, '#ffffff');
    const bossRig = entity.type === EntityType.BOSS ? (() => {
      const parts = new Container();
      const leftCannon = new Sprite(Texture.WHITE);
      const rightCannon = new Sprite(Texture.WHITE);
      const helmet = new Sprite(Texture.WHITE);
      const thrust = new Container();
      const leftThruster = new Sprite(Texture.WHITE);
      const rightThruster = new Sprite(Texture.WHITE);
      const componentHealth = new Graphics();
      const crownRoot = new Container();
      const crownBody = new Sprite(Texture.WHITE);
      const crownLegs = Object.fromEntries(
        Object.keys(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS).map((key) => [key, new Sprite(Texture.WHITE)])
      ) as Record<CrownClawLegId, Sprite>;
      const crownGuns = {
        left: new Sprite(Texture.WHITE),
        right: new Sprite(Texture.WHITE)
      };
      const crownClaws = {
        left: new Sprite(Texture.WHITE),
        right: new Sprite(Texture.WHITE)
      };
      leftCannon.anchor.set(0.5);
      rightCannon.anchor.set(0.5);
      helmet.anchor.set(0.5);
      leftThruster.anchor.set(0.5, 0);
      rightThruster.anchor.set(0.5, 0);
      thrust.addChild(leftThruster, rightThruster);
      parts.addChild(leftCannon, rightCannon, helmet);
      parts.visible = false;
      thrust.visible = false;
      crownRoot.eventMode = 'none';
      crownRoot.visible = false;
      for (const [key, leg] of Object.entries(crownLegs) as [CrownClawLegId, Sprite][]) {
        const layout = CROWNCLAW_LEG_LAYOUT[key];
        leg.anchor.set(0);
        leg.pivot.set(layout.pivotX, layout.pivotY);
        leg.position.set(layout.x, layout.y);
        crownRoot.addChild(leg);
      }
      for (const side of ['left', 'right'] as const) {
        const layout = CROWNCLAW_WEAPON_LAYOUT[side];
        crownGuns[side].anchor.set(0);
        crownGuns[side].pivot.set(layout.pivotX, layout.pivotY);
        crownGuns[side].position.set(layout.x, layout.y);
        crownClaws[side].anchor.set(0);
        crownClaws[side].pivot.set(layout.pivotX, layout.pivotY);
        crownClaws[side].position.set(layout.x, layout.y);
        crownRoot.addChild(crownGuns[side], crownClaws[side]);
      }
      crownBody.anchor.set(0);
      crownBody.position.set(-320, -320);
      crownRoot.addChild(crownBody);
      return {
        parts,
        partSprites: {
          'left-cannon': leftCannon,
          'right-cannon': rightCannon,
          helmet
        },
        thrust,
        thrusterSprites: [leftThruster, rightThruster],
        componentHealth,
        crownClaw: {
          root: crownRoot,
          body: crownBody,
          legs: crownLegs,
          guns: crownGuns,
          claws: crownClaws
        }
      } satisfies BossRigView;
    })() : undefined;
    sprite.anchor.set(0.5);
    label.anchor.set(0.5);
    root.addChild(trail, aura);
    if (bossRig) root.addChild(bossRig.thrust);
    if (bossRig) root.addChild(bossRig.crownClaw.root);
    root.addChild(sprite);
    if (bossRig) root.addChild(bossRig.parts, bossRig.componentHealth);
    root.addChild(body, flash, health, label);
    root.eventMode = 'none';
    const view: EntityView = {
      id: entity.id,
      type: entity.type,
      root,
      trail,
      aura,
      sprite,
      body,
      flash,
      health,
      label,
      textureKey: null,
      textureRequest: 0,
      lastHp: entity.hp,
      lastFlashFrames: 0,
      lastMarkedForDeletion: false,
      hasFallbackBody: false,
      bossRig,
      seenFrame: this.renderFrame
    };
    this.layers[getEntityLayer(entity.type)].addChild(root);
    return view;
  }

  private releaseEntityView(view: EntityView) {
    view.root.visible = false;
    view.sprite.texture = Texture.WHITE;
    view.sprite.filters = null;
    view.body.filters = null;
    view.textureKey = null;
    view.textureRequest++;
    view.trail.clear();
    view.aura.clear();
    view.body.clear();
    view.flash.clear();
    view.health.clear();
    view.label.text = '';
    view.hasFallbackBody = false;
    if (view.bossRig) {
      view.bossRig.parts.filters = null;
      view.bossRig.parts.visible = false;
      view.bossRig.thrust.visible = false;
      view.bossRig.componentHealth.clear();
      view.bossRig.crownClaw.root.filters = null;
      view.bossRig.crownClaw.root.visible = false;
      Object.values(view.bossRig.partSprites).forEach((sprite) => {
        sprite.filters = null;
      });
      view.bossRig.crownClaw.body.filters = null;
      Object.values(view.bossRig.crownClaw.legs).forEach((sprite) => {
        sprite.filters = null;
      });
      Object.values(view.bossRig.crownClaw.guns).forEach((sprite) => {
        sprite.filters = null;
      });
      Object.values(view.bossRig.crownClaw.claws).forEach((sprite) => {
        sprite.filters = null;
      });
    }
    const pool = this.recycledViews.get(view.type) ?? [];
    pool.push(view);
    this.recycledViews.set(view.type, pool);
  }

  private setTexture(view: EntityView, key: string | null) {
    if (!key) {
      view.sprite.visible = false;
      if (view.textureKey !== null) {
        view.textureKey = null;
        view.textureRequest++;
      }
      return;
    }

    if (view.textureKey === key) {
      const cached = this.textureBank.get(key);
      if (cached) {
        view.sprite.texture = cached;
        view.sprite.visible = true;
      }
      return;
    }

    view.textureKey = key;
    const request = ++view.textureRequest;
    const ready = this.textureBank.get(key);
    if (ready) {
      view.sprite.texture = ready;
      view.sprite.visible = true;
      return;
    }
    view.sprite.visible = false;
    this.textureBank.load(key).then((texture) => {
      if (this.destroyed || view.textureRequest !== request || view.textureKey !== key) return;
      view.sprite.texture = texture;
      view.sprite.visible = true;
    }).catch(() => {
      if (view.textureRequest === request) view.sprite.visible = false;
    });
  }

  private drawHealthBar(view: EntityView, entity: Entity) {
    view.health.clear();
    view.label.text = '';

    const width = entity.isElite ? clamp(entity.width * 0.86, 42, 92) : entity.width;
    const y = -entity.height * 0.5 - (entity.isElite ? 12 : 18);
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    view.health.roundRect(-width / 2, y, width, 8, 4).fill({ color: '#020617', alpha: 0.94 });
    view.health.roundRect(-width / 2 + 1, y + 1, Math.max(0, (width - 2) * progress), 6, 3)
      .fill(progress > 0.55 ? '#34d399' : progress > 0.25 ? '#facc15' : '#fb7185');
    view.health.roundRect(-width / 2, y, width, 8, 4).stroke({ color: '#bae6fd', width: 1, alpha: 0.75 });

    if (entity.type === EntityType.MINI_BOSS) {
      view.label.text = 'BOTTLENECK DRONE';
      view.label.style.fill = '#fda4af';
      view.label.position.set(0, y - 13);
    }
  }

  private drawFallbackBody(view: EntityView, entity: Entity) {
    if (view.sprite.visible) {
      if (view.hasFallbackBody) {
        view.body.clear();
        view.hasFallbackBody = false;
      }
      return;
    }
    if (view.hasFallbackBody) return;
    view.body.clear();
    const w = entity.width;
    const h = entity.height;
    if (entity.type === EntityType.PARTICLE) {
      view.body.rect(-w / 2, -h / 2, w, h).fill(entity.color);
      return;
    }
    if (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) {
      return;
    }
    view.body.moveTo(0, -h * 0.5).lineTo(w * 0.45, h * 0.32).lineTo(0, h * 0.18).lineTo(-w * 0.45, h * 0.32).closePath();
    view.body.fill(entity.color || '#67e8f9');
    view.body.stroke({ color: '#ffffff', width: 1.5, alpha: 0.7 });
    view.hasFallbackBody = true;
  }

  private drawProjectile(view: EntityView, entity: Entity, engineFrame: number) {
    view.body.clear();
    view.trail.clear();
    view.aura.clear();
    view.sprite.visible = false;
    view.root.rotation = 0;
    const playerShot = entity.isPlayerShot;
    const color = entity.color || (playerShot ? '#67e8f9' : '#fb7185');
    if (entity.projectileVisualKind && entity.spriteFrames?.length) {
      const isShipAbility = entity.projectileVisualKind === 'research-charge'
        || entity.projectileVisualKind === 'bio-genome-lance'
        || entity.projectileVisualKind === 'eth-prism-volley'
        || entity.projectileVisualKind === 'btc-hash-burst';
      const age = isShipAbility
        ? Math.max(0, engineFrame - entity.weaponVisualStartFrame)
        : Math.max(0, entity.maxLife - entity.life);
      const frameDelay = entity.projectileVisualKind === 'boss-ray' || isShipAbility ? 4 : 3;
      const textureKey = entity.spriteFrames[(Math.floor(age / frameDelay) + entity.variant) % entity.spriteFrames.length];
      this.setTexture(view, textureKey);
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.width = entity.width;
      view.sprite.height = entity.height;
      if (entity.projectileVisualKind === 'research-charge') {
        const pulse = 0.78 + Math.sin(engineFrame * 0.18) * 0.12;
        view.aura.circle(0, 0, entity.width * pulse).fill({ color: '#22d3ee', alpha: 0.14 });
        view.aura.circle(0, 0, entity.width * 0.56).stroke({ color: '#a7f3d0', width: 2, alpha: 0.72 });
        view.root.rotation = -Math.PI / 2;
      } else if (entity.projectileVisualKind === 'bio-genome-lance') {
        view.aura.roundRect(-entity.width * 0.62, -entity.height * 0.52, entity.width * 1.24, entity.height * 1.04, entity.width * 0.4)
          .fill({ color: '#4ade80', alpha: 0.16 });
        view.aura.roundRect(-entity.width * 0.32, -entity.height * 0.5, entity.width * 0.64, entity.height, entity.width * 0.28)
          .stroke({ color: '#bbf7d0', width: 2, alpha: 0.78 });
      } else if (entity.projectileVisualKind === 'eth-prism-volley') {
        const pulse = 0.68 + Math.sin((engineFrame + entity.variant * 3) * 0.2) * 0.1;
        view.aura.circle(0, 0, entity.width * pulse).fill({ color: '#8b5cf6', alpha: 0.18 });
        view.aura.circle(0, 0, entity.width * 0.56).stroke({ color: '#ddd6fe', width: 1.5, alpha: 0.76 });
        view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      } else if (entity.projectileVisualKind === 'btc-hash-burst') {
        const pulse = 0.72 + Math.sin(engineFrame * 0.16) * 0.09;
        view.aura.circle(0, 0, entity.width * pulse).fill({ color: '#facc15', alpha: 0.16 });
        view.aura.circle(0, 0, entity.width * 0.58).stroke({ color: '#67e8f9', width: 2, alpha: 0.7 });
      } else if (entity.projectileVisualKind === 'boss-ray') {
        view.aura.roundRect(-entity.width * 0.7, -entity.height * 0.5, entity.width * 1.4, entity.height, entity.width * 0.38)
          .fill({ color: '#ff9d2e', alpha: 0.18 });
        view.aura.roundRect(-entity.width * 0.34, -entity.height * 0.5, entity.width * 0.68, entity.height, entity.width * 0.24)
          .stroke({ color: '#fef08a', width: 2, alpha: 0.72 });
      } else {
        const isCrownClaw = entity.projectileVisualKind === 'crown-claw-left'
          || entity.projectileVisualKind === 'crown-claw-right';
        if (!isCrownClaw) {
          view.aura.circle(0, 0, entity.width * 0.72).fill({ color: '#ff9d2e', alpha: 0.25 });
          view.aura.circle(0, 0, entity.width * 0.54).stroke({ color: '#fef08a', width: 1.5, alpha: 0.82 });
        }
        view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      }
      return;
    }
    if (entity.isBeam) {
      const width = entity.width;
      const height = entity.height;
      const radius = Math.min(10, Math.min(width, height) * 0.45);
      if (entity.isTelegraph) {
        view.aura.roundRect(-width / 2, -height / 2, width, height, radius)
          .fill({ color, alpha: 0.08 });
        view.body.roundRect(-width / 2, -height / 2, width, height, radius)
          .stroke({ color, width: Math.max(1.5, Math.min(width, height) * 0.22), alpha: 0.82 });
      } else {
        view.aura.roundRect(-width / 2, -height / 2, width, height, radius)
          .fill({ color, alpha: 0.28 });
        const coreWidth = entity.beamAxis === 'horizontal' ? width : Math.max(3, width * 0.34);
        const coreHeight = entity.beamAxis === 'horizontal' ? Math.max(3, height * 0.34) : height;
        view.body.roundRect(-coreWidth / 2, -coreHeight / 2, coreWidth, coreHeight, Math.min(6, radius))
          .fill({ color: '#ffffff', alpha: 0.96 });
        view.body.roundRect(-width / 2, -height / 2, width, height, radius)
          .stroke({ color, width: Math.max(1, Math.min(width, height) * 0.12), alpha: 0.78 });
      }
      return;
    }
    if (playerShot && entity.squadAbilityKind) {
      const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
      const trailLength = clamp(speed * 3.8, 14, 42);
      view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      view.trail.moveTo(0, entity.height * 0.18).lineTo(0, entity.height * 0.18 + trailLength)
        .stroke({ color, width: Math.max(1.5, entity.width * 0.42), alpha: 0.34 });

      if (entity.squadAbilityKind === 'homing-missile') {
        view.body.moveTo(0, -entity.height * 0.56)
          .lineTo(entity.width * 0.48, entity.height * 0.28)
          .lineTo(0, entity.height * 0.12)
          .lineTo(-entity.width * 0.48, entity.height * 0.28)
          .closePath()
          .fill(color)
          .stroke({ color: '#ffffff', width: 1.2, alpha: 0.82 });
      } else if (entity.squadAbilityKind === 'piercing-laser') {
        view.aura.roundRect(-entity.width * 0.72, -entity.height * 0.58, entity.width * 1.44, entity.height * 1.16, entity.width)
          .fill({ color, alpha: 0.22 });
        view.body.roundRect(-Math.max(1.5, entity.width * 0.2), -entity.height * 0.54, Math.max(3, entity.width * 0.4), entity.height * 1.08, entity.width)
          .fill('#ffffff');
      } else if (entity.squadAbilityKind === 'coin-magnet') {
        view.aura.circle(0, 0, entity.width * 0.92).stroke({ color: '#facc15', width: 1.5, alpha: 0.72 });
        view.body.circle(0, 0, Math.max(2.5, entity.width * 0.38)).fill(color).stroke({ color: '#fef08a', width: 1, alpha: 0.9 });
      } else if (entity.squadAbilityKind === 'heavy-cannon') {
        view.aura.roundRect(-entity.width * 0.65, -entity.height * 0.58, entity.width * 1.3, entity.height * 1.16, entity.width * 0.45)
          .fill({ color, alpha: 0.28 });
        view.body.roundRect(-entity.width * 0.38, -entity.height * 0.5, entity.width * 0.76, entity.height, entity.width * 0.34)
          .fill('#ffffff')
          .stroke({ color, width: 1.4, alpha: 0.92 });
      } else if (entity.squadAbilityKind === 'prism-fan' || entity.squadAbilityKind === 'nova-volley') {
        view.body.moveTo(0, -entity.height * 0.54)
          .lineTo(entity.width * 0.54, 0)
          .lineTo(0, entity.height * 0.54)
          .lineTo(-entity.width * 0.54, 0)
          .closePath()
          .fill('#ffffff')
          .stroke({ color, width: 1.4, alpha: 0.96 });
      } else {
        view.aura.roundRect(-entity.width * 0.6, -entity.height * 0.56, entity.width * 1.2, entity.height * 1.12, entity.width)
          .fill({ color, alpha: 0.2 });
        view.body.roundRect(-Math.max(1.5, entity.width * 0.3), -entity.height * 0.5, Math.max(3, entity.width * 0.6), entity.height, entity.width)
          .fill('#ffffff')
          .stroke({ color, width: 1, alpha: 0.88 });
      }
      return;
    }
    if (playerShot) {
      const frames = getPlayerWeaponFrames(entity.weaponKind, entity.weaponVisualLevel);
      const launchFrame = getPlayerWeaponLaunchFrameIndex(
        engineFrame - entity.weaponVisualStartFrame,
        frames.length
      );
      const textureKey = frames[launchFrame];
      this.setTexture(view, textureKey);
      view.sprite.tint = '#ffffff';
      view.sprite.alpha = 1;
      view.sprite.width = Math.max(34, entity.width * 2.05);
      view.sprite.height = Math.max(48, entity.height * 1.2);
      view.root.rotation = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      return;
    }
    const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
    const nx = -entity.vx / speed;
    const ny = -entity.vy / speed;
    const strong = entity.weaponKind === 'nova' || entity.weaponKind === 'singularity' || entity.weaponKind === 'btc-hash';
    const trailLength = clamp(speed * (strong ? 7 : 4.5), 12, strong ? 78 : 46);

    view.trail.moveTo(0, 0).lineTo(nx * trailLength, ny * trailLength)
      .stroke({ color, width: Math.max(2, entity.width * (strong ? 0.7 : 0.42)), alpha: playerShot ? 0.48 : 0.3 });
    view.trail.moveTo(0, 0).lineTo(nx * trailLength * 0.55, ny * trailLength * 0.55)
      .stroke({ color: '#ffffff', width: Math.max(1, entity.width * 0.18), alpha: 0.72 });

    if (entity.type === EntityType.MISSILE) {
      const angle = Math.atan2(entity.vy, entity.vx) + Math.PI / 2;
      view.root.rotation = angle;
      view.body.moveTo(0, -entity.height * 0.56).lineTo(entity.width * 0.44, entity.height * 0.32)
        .lineTo(0, entity.height * 0.16).lineTo(-entity.width * 0.44, entity.height * 0.32).closePath();
      view.body.fill(color).stroke({ color: '#ffffff', width: 1.2, alpha: 0.75 });
      return;
    }

    if (entity.weaponKind === 'eth-shard') {
      view.body.moveTo(0, -entity.height * 0.58).lineTo(entity.width * 0.62, 0)
        .lineTo(0, entity.height * 0.58).lineTo(-entity.width * 0.62, 0).closePath();
      view.body.fill('#8b5cf6').stroke({ color: '#67e8f9', width: 1.2, alpha: 0.9 });
    } else if (entity.weaponKind === 'btc-hash') {
      view.body.moveTo(0, -entity.height * 0.56).lineTo(entity.width * 0.56, -entity.height * 0.12)
        .lineTo(entity.width * 0.42, entity.height * 0.5).lineTo(0, entity.height * 0.62)
        .lineTo(-entity.width * 0.42, entity.height * 0.5).lineTo(-entity.width * 0.56, -entity.height * 0.12).closePath();
      view.body.fill('#fbbf24').stroke({ color: '#fff7d6', width: 1.2, alpha: 0.9 });
    } else {
      const projectileWidth = Math.max(3, entity.width * (strong ? 0.75 : 0.58));
      view.aura.roundRect(-projectileWidth * 0.86, -entity.height * 0.56, projectileWidth * 1.72, entity.height * 1.12, projectileWidth)
        .fill({ color, alpha: strong ? 0.32 : 0.22 });
      view.body.roundRect(-projectileWidth * 0.42, -entity.height * 0.5, projectileWidth * 0.84, entity.height, projectileWidth * 0.42)
        .fill(playerShot ? '#ffffff' : color);
      if (playerShot) {
        view.body.roundRect(-projectileWidth * 0.18, -entity.height * 0.45, projectileWidth * 0.36, entity.height * 0.9, projectileWidth * 0.18)
          .fill(color);
      }
    }
  }

  private drawPlayerRig(view: EntityView, entity: Entity, engine: GameEngine) {
    view.trail.clear();
    view.aura.clear();

    const shielded = engine.activePowerups.has(PowerupType.SHIELD) || engine.invincibleTimer > 60;
    const magnetized = engine.activePowerups.has(PowerupType.MAGNET);
    const beam = engine.activePowerups.has(PowerupType.RESEARCH_BEAM);
    if (shielded) {
      const pulse = 1 + Math.sin(engine.frameCount * 0.1) * 0.04;
      view.aura.circle(0, 0, entity.width * 0.62 * pulse).fill({ color: '#34d399', alpha: 0.075 });
      view.aura.circle(0, 0, entity.width * 0.62 * pulse).stroke({ color: '#a7f3d0', width: 2.5, alpha: 0.82 });
      view.aura.circle(0, 0, entity.width * 0.72 * pulse).stroke({ color: '#22d3ee', width: 1, alpha: 0.35 });
    }
    if (magnetized) {
      view.aura.circle(0, 0, entity.width * (0.72 + Math.sin(engine.frameCount * 0.08) * 0.04))
        .stroke({ color: '#facc15', width: 2, alpha: 0.5 });
    }
    if (beam) {
      view.aura.circle(0, 0, entity.width * 0.68).stroke({ color: '#c084fc', width: 3, alpha: 0.72 });
    }

    // Banking is represented by complete redrawn frames. Keep the world rig
    // upright and uniformly scaled so presentation never moves the hitbox.
    view.root.rotation = 0;
    const visualScale = engine.playerDrawScale * 0.95;
    view.root.scale.set(visualScale);
    view.root.alpha = engine.playerDrawAlpha;
  }

  private syncMaxShotPresentation(engine: GameEngine) {
    const remaining = engine.activePowerups.get(PowerupType.MAX_SHOT) || 0;
    const auraTexture = this.textureBank.get(ASSETS.POWERUP_MAX_SHOT_AURA);
    const active = remaining > 0
      && engine.lives > 0
      && engine.playerDrawAlpha > 0.02
      && Boolean(auraTexture);
    this.maxShotAura.visible = active;
    this.maxShotScreenGlow.visible = active;
    if (!active || !auraTexture) return;

    const pulseWave = (Math.sin(engine.frameCount * 0.13) + 1) * 0.5;
    const fade = clamp(remaining / 36, 0, 1);
    const playerCenterX = engine.player.x + engine.player.width / 2;
    const playerCenterY = engine.player.y + engine.player.height / 2;
    const auraSize = engine.player.width * (engine.mobileProfile ? 2.42 : 2.58);
    const auraScale = (auraSize / Math.max(1, auraTexture.width)) * (0.96 + pulseWave * 0.07);
    this.maxShotAura.texture = auraTexture;
    this.maxShotAura.position.set(playerCenterX, playerCenterY + engine.player.height * 0.02);
    this.maxShotAura.scale.set(auraScale);
    this.maxShotAura.rotation = Math.sin(engine.frameCount * 0.035) * 0.025;
    this.maxShotAura.alpha = (0.68 + pulseWave * 0.2) * engine.playerDrawAlpha * fade;

    const glow = this.maxShotScreenGlow;
    const outerAlpha = (0.28 + pulseWave * 0.16) * fade;
    const cornerLength = Math.min(74, Math.max(38, this.width * 0.14));
    const inset = engine.mobileProfile ? 5 : 7;
    glow.clear();
    glow.rect(0, 0, this.width, this.height).fill({ color: '#0284c7', alpha: 0.018 * fade });
    glow.rect(2, 2, this.width - 4, this.height - 4)
      .stroke({ color: '#22d3ee', width: 3, alpha: outerAlpha });
    glow.rect(inset, inset, this.width - inset * 2, this.height - inset * 2)
      .stroke({ color: '#67e8f9', width: 1.25, alpha: (0.4 + pulseWave * 0.18) * fade });
    glow.rect(0, 0, this.width, 18).fill({ color: '#0ea5e9', alpha: (0.035 + pulseWave * 0.018) * fade });
    glow.rect(0, this.height - 20, this.width, 20).fill({ color: '#2563eb', alpha: (0.05 + pulseWave * 0.022) * fade });

    glow.moveTo(inset, inset + cornerLength).lineTo(inset, inset).lineTo(inset + cornerLength, inset)
      .stroke({ color: '#a5f3fc', width: 3.5, alpha: (0.58 + pulseWave * 0.25) * fade });
    glow.moveTo(this.width - inset - cornerLength, inset).lineTo(this.width - inset, inset).lineTo(this.width - inset, inset + cornerLength)
      .stroke({ color: '#a5f3fc', width: 3.5, alpha: (0.58 + pulseWave * 0.25) * fade });
    glow.moveTo(inset, this.height - inset - cornerLength).lineTo(inset, this.height - inset).lineTo(inset + cornerLength, this.height - inset)
      .stroke({ color: '#38bdf8', width: 3.5, alpha: (0.52 + pulseWave * 0.22) * fade });
    glow.moveTo(this.width - inset - cornerLength, this.height - inset).lineTo(this.width - inset, this.height - inset).lineTo(this.width - inset, this.height - inset - cornerLength)
      .stroke({ color: '#38bdf8', width: 3.5, alpha: (0.52 + pulseWave * 0.22) * fade });
  }

  private updatePlayerSteeringPresentation(engine: GameEngine, deltaMs: number) {
    const motion = getPlayerShipMotionByAssetUrl(engine.playerShipUrl);
    if (!motion) {
      this.playerSteeringVisual = 0;
      this.playerSteeringState = 'neutral';
      this.playerSteeringTextureKey = engine.playerShipUrl;
      this.playerSteeringSweepOriginX = null;
      this.playerSteeringSweepDirection = 0;
      this.playerSteeringShipUrl = null;
      return;
    }

    const playerCenterX = engine.player.x + engine.player.width / 2;
    if (this.playerSteeringShipUrl !== engine.playerShipUrl) {
      this.playerSteeringVisual = 0;
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = 0;
      this.playerSteeringShipUrl = engine.playerShipUrl;
    }

    const speedLevel = Math.min(engine.stats.upgrades.speed || 0, 6);
    const maxHorizontalSpeed = GAME_CONFIG.BASE_PLAYER_SPEED
      + (Math.min(speedLevel, 5) * 1.5)
      + (speedLevel >= 6 ? 3 : 0);
    const presentationSpeed = maxHorizontalSpeed
      * (engine.touchPos ? PLAYER_SHIP_TOUCH_SPEED_SCALE : 1);
    const normalizedHorizontal = applyPlayerSteeringDeadzone(
      engine.playerVel.x / Math.max(1, presentationSpeed)
    );
    const steeringDirection: -1 | 0 | 1 = normalizedHorizontal < 0
      ? -1
      : normalizedHorizontal > 0
        ? 1
        : 0;
    if (steeringDirection !== 0 && steeringDirection !== this.playerSteeringSweepDirection) {
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = steeringDirection;
    } else if (steeringDirection === 0 && Math.abs(this.playerSteeringVisual) < 0.05) {
      this.playerSteeringSweepOriginX = playerCenterX;
      this.playerSteeringSweepDirection = 0;
    }

    const playableWidth = Math.max(1, engine.width - engine.player.width);
    const signedSweep = this.playerSteeringSweepOriginX === null
      ? 0
      : (playerCenterX - this.playerSteeringSweepOriginX) * this.playerSteeringSweepDirection;
    const hardBankEligible = Math.max(0, signedSweep) / playableWidth
      >= PLAYER_SHIP_HARD_BANK_SWEEP_RATIO;
    const steeringBlendMs = getPlayerSteeringBlendMs(speedLevel);
    const blend = 1 - Math.exp(-Math.max(0, deltaMs) / steeringBlendMs);
    this.playerSteeringVisual += (normalizedHorizontal - this.playerSteeringVisual) * blend;
    if (normalizedHorizontal === 0 && Math.abs(this.playerSteeringVisual) < 0.01) {
      this.playerSteeringVisual = 0;
    }

    const state = selectPlayerSteeringState(this.playerSteeringVisual, hardBankEligible);
    this.playerSteeringState = state;
    this.playerSteeringTextureKey = motion.steeringFrames[state];
  }

  private getBossComponentVisualScale(entity: Entity, component: BossComponentState) {
    const isCannon = component.id === 'left-cannon' || component.id === 'right-cannon';
    if (!isCannon) return 1;
    return entity.bossRigId === 'crown-claw' ? CROWNCLAW_ARM_SCALE : BOSS_CANNON_SCALE;
  }

  private drawBossComponentHealthBar(
    graphics: Graphics,
    entity: Entity,
    component: BossComponentState,
    visualScale: number
  ) {
    if (component.destroyed) return;
    const visualWidth = entity.width * component.widthRatio * visualScale;
    const visualHeight = entity.height * component.heightRatio * visualScale;
    const width = clamp(visualWidth * 0.52, 28, 58);
    const x = (component.centerXRatio - 0.5) * entity.width - width / 2;
    const y = (component.centerYRatio - 0.5) * entity.height - visualHeight / 2 - 8;
    const progress = clamp(component.hp / Math.max(1, component.maxHp), 0, 1);
    const fill = component.id === 'helmet'
      ? progress > 0.45 ? '#fef08a' : '#fb7185'
      : progress > 0.55 ? '#67e8f9' : progress > 0.25 ? '#facc15' : '#fb7185';

    graphics.roundRect(x, y, width, 5, 2.5).fill({ color: '#020617', alpha: 0.94 });
    graphics.roundRect(x + 1, y + 1, Math.max(0, (width - 2) * progress), 3, 1.5)
      .fill({ color: fill, alpha: 0.96 });
    graphics.roundRect(x, y, width, 5, 2.5).stroke({ color: '#dbeafe', width: 0.75, alpha: 0.72 });
  }

  private drawCrownClawComponents(view: EntityView, entity: Entity, engine: GameEngine) {
    const rig = view.bossRig;
    if (!rig) return;
    const crown = rig.crownClaw;
    const bob = Math.sin(engine.frameCount * 0.04) * 5;
    const bodyTexture = this.textureBank.get(ASSETS.PIXI_BOSS_CROWNCLAW_CORE);
    crown.root.visible = true;
    crown.root.position.set(0, bob);
    crown.root.scale.set(entity.width / 1024);
    crown.body.visible = Boolean(bodyTexture);
    if (bodyTexture) crown.body.texture = bodyTexture;
    view.sprite.visible = !bodyTexture;

    const gait = engine.frameCount * 0.075;
    for (const [key, leg] of Object.entries(crown.legs) as [CrownClawLegId, Sprite][]) {
      const layout = CROWNCLAW_LEG_LAYOUT[key];
      const texture = this.textureBank.get(ASSETS.PIXI_BOSS_CROWNCLAW_LEGS[key]);
      leg.visible = Boolean(texture);
      if (texture) leg.texture = texture;
      const stride = Math.sin(gait + layout.phase) * 0.085;
      const tier = key.startsWith('front') ? 1 : key.startsWith('middle') ? 0.78 : 0.58;
      leg.rotation = layout.direction * (0.02 + stride * tier);
    }

    const previousState = this.seenBossComponents.get(entity.id);
    const nextState: Partial<Record<BossPartId, boolean>> = {};
    const componentById = new Map((entity.bossComponents ?? []).map((component) => [component.id, component]));
    for (const side of ['left', 'right'] as const) {
      const componentId: BossPartId = side === 'left' ? 'left-cannon' : 'right-cannon';
      const component = componentById.get(componentId);
      const destroyed = component?.destroyed ?? true;
      nextState[componentId] = destroyed;
      const gunTexture = this.textureBank.get(
        side === 'left' ? ASSETS.PIXI_BOSS_CROWNCLAW_GUN_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_GUN_RIGHT
      );
      const clawTexture = this.textureBank.get(
        side === 'left' ? ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_LEFT : ASSETS.PIXI_BOSS_CROWNCLAW_CLAW_RIGHT
      );
      const active = !destroyed;
      const strikeInFlight = engine.entities.some((candidate) => (
        !candidate.markedForDeletion
        && candidate.bossOwnerId === entity.id
        && candidate.bossComponentId === componentId
        && (candidate.projectileVisualKind === 'crown-claw-left' || candidate.projectileVisualKind === 'crown-claw-right')
      ));
      crown.guns[side].visible = Boolean(active && gunTexture);
      crown.claws[side].visible = Boolean(active && clawTexture && !strikeInFlight);
      const componentFilters = (component?.flashFrames ?? 0) > 0 ? WHITE_HIT_FILTERS : null;
      crown.guns[side].filters = componentFilters;
      crown.claws[side].filters = componentFilters;
      if (gunTexture) crown.guns[side].texture = gunTexture;
      if (clawTexture) crown.claws[side].texture = clawTexture;

      const attacking = entity.isCharging && entity.beamLaneSign === (side === 'left' ? -1 : 1);
      const weaponSwing = Math.sin(engine.frameCount * 0.055 + (side === 'left' ? 0 : Math.PI)) * 0.035;
      crown.guns[side].rotation = weaponSwing;
      crown.claws[side].rotation = weaponSwing + (attacking ? Math.sin(engine.frameCount * 0.42) * 0.055 : 0);
      const layout = CROWNCLAW_WEAPON_LAYOUT[side];
      crown.guns[side].position.set(layout.x, layout.y);
      crown.claws[side].position.set(layout.x, layout.y + (attacking ? 15 + Math.sin(engine.frameCount * 0.32) * 9 : 0));
      crown.guns[side].scale.set(CROWNCLAW_ARM_SCALE);
      crown.claws[side].scale.set(CROWNCLAW_ARM_SCALE);

      if (component) this.drawBossComponentHealthBar(rig.componentHealth, entity, component, CROWNCLAW_ARM_SCALE);

      if (component && previousState && !previousState[componentId] && destroyed) {
        const explosionX = entity.x + entity.width * component.centerXRatio;
        const explosionY = entity.y + entity.height * component.centerYRatio + bob;
        this.effectPool.spawnBossExplosion(explosionX, explosionY, Math.max(70, entity.width * 0.32), 1.45);
        if (clawTexture) {
          this.effectPool.spawnDetachedSprite(
            clawTexture,
            explosionX,
            explosionY,
            entity.width * component.widthRatio * CROWNCLAW_ARM_SCALE,
            entity.height * component.heightRatio * CROWNCLAW_ARM_SCALE,
            side === 'left' ? -1 : 1
          );
        }
        this.phaseText.text = `${component.label} SEVERED`;
        this.phaseText.style.fill = '#fb923c';
        this.phaseTextUntilFrame = engine.frameCount + 88;
      }
    }
    this.seenBossComponents.set(entity.id, nextState);
  }

  private drawBossComponents(view: EntityView, entity: Entity, engine: GameEngine) {
    const rig = view.bossRig;
    if (!rig) return;
    const components = entity.bossComponents ?? [];
    const bob = Math.sin(engine.frameCount * 0.04) * 5;
    rig.parts.y = bob;
    rig.componentHealth.y = bob;
    rig.componentHealth.clear();
    rig.crownClaw.root.visible = false;
    if (entity.bossRigId === 'crown-claw') {
      rig.parts.visible = false;
      rig.thrust.visible = false;
      this.drawCrownClawComponents(view, entity, engine);
      return;
    }
    rig.parts.visible = components.length > 0;
    rig.thrust.visible = entity.bossRigId === 'paywall-siege';
    if (components.length === 0) {
      Object.values(rig.partSprites).forEach((sprite) => {
        sprite.visible = false;
      });
      this.seenBossComponents.delete(entity.id);
      return;
    }

    const weaponTextures: Partial<Record<BossRigId, Partial<Record<BossPartId, string>>>> = {
      'open-orbit': {
        'left-cannon': ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT
      },
      'citation-storm': {
        'left-cannon': ASSETS.PIXI_BOSS_CITATION_CLAW_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_CITATION_CLAW_RIGHT
      },
      'paywall-siege': {
        'left-cannon': ASSETS.PIXI_BOSS_PAYWALL_CANNON_LEFT,
        'right-cannon': ASSETS.PIXI_BOSS_PAYWALL_CANNON_RIGHT,
        helmet: ASSETS.PIXI_BOSS_PAYWALL_HELMET
      }
    };
    const partTextures = entity.bossRigId ? weaponTextures[entity.bossRigId] ?? {} : {};
    const previousState = this.seenBossComponents.get(entity.id);
    const nextState: Partial<Record<BossPartId, boolean>> = {};
    for (const component of components) {
      const sprite = rig.partSprites[component.id];
      sprite.filters = component.flashFrames > 0 ? WHITE_HIT_FILTERS : null;
      const textureKey = partTextures[component.id];
      const texture = textureKey ? this.textureBank.get(textureKey) : undefined;
      const visualScale = this.getBossComponentVisualScale(entity, component);
      nextState[component.id] = component.destroyed;
      if (previousState && !previousState[component.id] && component.destroyed) {
        const explosionX = entity.x + entity.width * component.centerXRatio;
        const explosionY = entity.y + entity.height * component.centerYRatio + bob;
        this.effectPool.spawnBossExplosion(
          explosionX,
          explosionY,
          Math.max(58, entity.width * component.widthRatio * visualScale * 1.35),
          1.3
        );
        if (texture) {
          const direction = component.id === 'left-cannon' ? -1 : component.id === 'right-cannon' ? 1 : 0.65;
          this.effectPool.spawnDetachedSprite(
            texture,
            explosionX,
            explosionY,
            entity.width * component.widthRatio * visualScale,
            entity.height * component.heightRatio * visualScale,
            direction
          );
        }
        this.phaseText.text = component.id === 'helmet' ? 'CORE EXPOSED' : `${component.label} DESTROYED`;
        this.phaseText.style.fill = component.id === 'helmet' ? '#fef08a' : '#fb923c';
        this.phaseTextUntilFrame = engine.frameCount + 88;
      }
      sprite.visible = Boolean(texture && !component.destroyed);
      if (!texture || component.destroyed) continue;
      sprite.texture = texture;
      sprite.position.set(
        (component.centerXRatio - 0.5) * entity.width,
        (component.centerYRatio - 0.5) * entity.height
      );
      sprite.width = entity.width * component.widthRatio * visualScale;
      sprite.height = entity.height * component.heightRatio * visualScale;
      this.drawBossComponentHealthBar(rig.componentHealth, entity, component, visualScale);
      const movementScale = entity.bossRigId === 'citation-storm' ? 1.45 : 1;
      sprite.rotation = component.id === 'left-cannon'
        ? -0.04 + Math.sin(engine.frameCount * 0.05) * 0.025 * movementScale
        : component.id === 'right-cannon'
          ? 0.04 - Math.sin(engine.frameCount * 0.05) * 0.025 * movementScale
          : 0;
      if (entity.isCharging && component.id !== 'helmet') {
        sprite.y += 3 + Math.sin(engine.frameCount * 0.3) * 2;
      }
    }
    this.seenBossComponents.set(entity.id, nextState);

    const thrustFrameOrder = [0, 1, 2, 1] as const;
    const thrustFrameIndex = thrustFrameOrder[Math.floor(engine.frameCount / 4) % thrustFrameOrder.length];
    const thrustFrame = ASSETS.PIXI_BOSS_THRUSTER_FRAMES[thrustFrameIndex];
    const thrustTexture = this.textureBank.get(thrustFrame);
    rig.thrust.visible = Boolean(thrustTexture);
    if (thrustTexture) {
      const engineSpread = entity.bossRigId === 'paywall-siege' ? 0.16 : 0.18;
      const flameWidth = entity.width * (entity.bossRigId === 'paywall-siege' ? 0.13 : 0.15);
      const flameHeight = entity.height * (0.2 + Math.sin(engine.frameCount * 0.22) * 0.012);
      rig.thrust.position.set(0, entity.height * 0.34 + bob);
      rig.thrust.alpha = 0.9;
      rig.thrusterSprites.forEach((thruster, index) => {
        thruster.texture = thrustTexture;
        thruster.position.set((index === 0 ? -1 : 1) * entity.width * engineSpread, 0);
        thruster.width = flameWidth;
        thruster.height = flameHeight;
      });
    }

  }

  private drawBossRig(view: EntityView, entity: Entity, engine: GameEngine) {
    view.body.clear();
    view.trail.clear();
    view.aura.clear();
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    const phaseColor = progress > 0.66 ? '#67e8f9' : progress > 0.33 ? '#facc15' : '#fb7185';

    const decayStage = clamp(entity.bossDecayStage, 0, 5);
    const previousPhase = this.seenBossPhase.get(entity.id);
    if (previousPhase !== undefined && decayStage > previousPhase) {
      const stageNeedsExplosion = entity.bossRigId !== 'paywall-siege' || decayStage >= 3;
      if (stageNeedsExplosion) {
        const side = decayStage % 2 === 0 ? 0.22 : -0.22;
        this.effectPool.spawnBossExplosion(
          entity.x + entity.width * (0.5 + side),
          entity.y + entity.height * (0.38 + decayStage * 0.08),
          entity.width * (decayStage >= 4 ? 0.74 : 0.46),
          decayStage >= 4 ? 1.8 : 1.1
        );
      }
      this.phaseText.text = decayStage >= 5
        ? 'CRITICAL CORE FAILURE'
        : decayStage >= 4
          ? 'CORE CASING RUPTURED'
        : decayStage >= 3
          ? 'HULL BREACH'
          : decayStage >= 2
            ? 'CORE ARMOR BREACHED'
            : 'ARMOR FRACTURE';
      this.phaseText.style.fill = phaseColor;
      this.phaseTextUntilFrame = engine.frameCount + 96;
    }
    this.seenBossPhase.set(entity.id, decayStage);
    if (progress < 0.52 && engine.frameCount % (engine.performanceMode ? 48 : 30) === 0) {
      this.effectPool.spawn('smoke', entity.x + entity.width * (0.25 + Math.random() * 0.5), entity.y + entity.height * (0.35 + Math.random() * 0.4), entity.width * 0.18, '#475569', 800);
      this.effectPool.spawn('spark', entity.x + entity.width * Math.random(), entity.y + entity.height * Math.random(), Math.max(3, entity.width * 0.035), phaseColor, 380);
    }
  }

  private startBossDeath(snapshot: BossSnapshot) {
    this.bossDeathHandled = true;
    this.bossDeathAge = 0;
    this.bossDeathStage = -1;
    this.bossDeathRoot.visible = true;
    this.bossDeathRoot.position.set(snapshot.x + snapshot.width / 2, snapshot.y + snapshot.height / 2);
    this.bossDeathRoot.scale.set(1);
    this.bossDeathSprite.width = snapshot.width;
    this.bossDeathSprite.height = snapshot.height;
    this.bossDeathSprite.alpha = 1;
    this.bossDeathSprite.tint = '#ffffff';
    this.bossDeathCore.clear();
    this.bossDeathText.visible = false;
    this.bossDeathText.text = 'SECTOR CLEARED';
    this.bossDeathText.position.set(0, snapshot.height * 0.7);

    const request = ++this.bossDeathTextureRequest;
    const cached = this.textureBank.get(snapshot.textureKey);
    if (cached) {
      this.bossDeathSprite.texture = cached;
    } else {
      this.textureBank.load(snapshot.textureKey).then((texture) => {
        if (this.destroyed || request !== this.bossDeathTextureRequest) return;
        this.bossDeathSprite.texture = texture;
      }).catch(() => undefined);
    }
  }

  private updateBossPresentation(engine: GameEngine, deltaMs: number) {
    const boss = engine.entities.find((entity) => entity.type === EntityType.BOSS && !entity.markedForDeletion);
    if (boss) {
      this.lastBossSnapshot = {
        id: boss.id,
        x: boss.x,
        y: boss.y,
        width: boss.width,
        height: boss.height,
        textureKey: getDefaultEntityTexture(engine, boss) || ASSETS.FINAL_BOSS
      };
      this.bossDeathHandled = false;
      this.bossDeathAge = -1;
      this.bossDeathRoot.visible = false;
    } else if (engine.mainBossDefeated && engine.waveTransitionPending && this.lastBossSnapshot && !this.bossDeathHandled) {
      this.startBossDeath(this.lastBossSnapshot);
    } else if (!engine.mainBossDefeated && this.bossDeathAge < 0) {
      this.lastBossSnapshot = null;
      this.bossDeathHandled = false;
    }

    this.phaseText.visible = engine.frameCount <= this.phaseTextUntilFrame && engine.stats.isBossActive;
    if (this.phaseText.visible) {
      const remaining = this.phaseTextUntilFrame - engine.frameCount;
      this.phaseText.position.set(this.width / 2, this.height * 0.27);
      this.phaseText.alpha = clamp(remaining / 22, 0, 1);
      this.phaseText.scale.set(1 + Math.sin(remaining * 0.2) * 0.04);
    }

    if (this.bossDeathAge < 0 || !this.lastBossSnapshot) return;
    const snapshot = this.lastBossSnapshot;
    const previousAge = this.bossDeathAge;
    this.bossDeathAge += deltaMs;
    const progress = clamp(this.bossDeathAge / 1320, 0, 1);
    this.bossDeathRoot.x = snapshot.x + snapshot.width / 2 + Math.sin(this.bossDeathAge * 0.12) * (1 - progress) * 8;
    this.bossDeathRoot.rotation = Math.sin(this.bossDeathAge * 0.045) * 0.08 * (1 - progress);
    this.bossDeathRoot.scale.set(1 + progress * 0.22);
    this.bossDeathSprite.alpha = clamp(1 - Math.max(0, progress - 0.62) / 0.38, 0, 1);
    this.bossDeathSprite.tint = Math.floor(this.bossDeathAge / 70) % 2 === 0 ? '#ffffff' : '#fb7185';

    this.bossDeathCore.clear();
    const corePulse = 1 + Math.sin(this.bossDeathAge * 0.035) * 0.18;
    this.bossDeathCore.circle(0, snapshot.height * 0.06, snapshot.width * (0.09 + progress * 0.18) * corePulse)
      .fill({ color: progress > 0.66 ? '#ffffff' : '#fef08a', alpha: 0.28 + progress * 0.55 });
    this.bossDeathCore.circle(0, snapshot.height * 0.06, snapshot.width * (0.15 + progress * 0.34))
      .stroke({ color: progress > 0.66 ? '#fb7185' : '#67e8f9', width: Math.max(1, 4 * (1 - progress)), alpha: 0.82 });

    const stages = [120, 300, 490, 690, 900];
    for (let stage = this.bossDeathStage + 1; stage < stages.length; stage++) {
      if (previousAge < stages[stage] && this.bossDeathAge >= stages[stage]) {
        const side = stage % 2 === 0 ? -1 : 1;
        const x = snapshot.x + snapshot.width / 2 + side * snapshot.width * (0.18 + stage * 0.035);
        const y = snapshot.y + snapshot.height * (0.3 + (stage % 3) * 0.18);
        const finalStage = stage === stages.length - 1;
        this.effectPool.spawnBossExplosion(x, y, finalStage ? snapshot.width * 1.45 : snapshot.width * 0.42, finalStage ? 2.8 : 1.2);
        this.bossDeathStage = stage;
      }
    }

    this.bossDeathText.visible = this.bossDeathAge >= 880;
    this.bossDeathText.alpha = clamp((this.bossDeathAge - 880) / 180, 0, 1) * (1 - progress * 0.38);
    this.bossDeathText.scale.set(0.9 + clamp((this.bossDeathAge - 880) / 240, 0, 1) * 0.12);
    if (progress >= 1) {
      this.bossDeathRoot.visible = false;
      this.bossDeathAge = -1;
      this.lastBossSnapshot = null;
    }
  }

  private drawFlash(view: EntityView, entity: Entity) {
    view.flash.clear();
    const filters = entity.flashFrames > 0 ? WHITE_HIT_FILTERS : null;
    if (entity.type === EntityType.BOSS) {
      view.sprite.filters = filters;
      view.body.filters = filters;
      if (view.bossRig) {
        // Hull feedback must never bleach the separately targetable cannons.
        // Component sprites own their filters through component.flashFrames.
        view.bossRig.parts.filters = null;
        view.bossRig.crownClaw.root.filters = null;
        view.bossRig.crownClaw.body.filters = filters;
        Object.values(view.bossRig.crownClaw.legs).forEach((leg) => {
          leg.filters = filters;
        });
      }
      return;
    }
    if (entity.type === EntityType.MINI_BOSS) {
      view.sprite.filters = filters;
      view.body.filters = filters;
      return;
    }
    if (entity.flashFrames <= 0) return;
    const alpha = clamp(entity.flashFrames / 10, 0.15, 0.74);
    if (entity.type === EntityType.ENEMY_BRICK) {
      view.flash.roundRect(-entity.width * 0.34, -entity.height * 0.34, entity.width * 0.68, entity.height * 0.68, 7)
        .fill({ color: '#ffffff', alpha });
    } else {
      view.flash.ellipse(0, 0, entity.width * 0.42, entity.height * 0.38)
        .fill({ color: '#ffffff', alpha });
    }
  }

  private updateEntityView(view: EntityView, entity: Entity, engine: GameEngine) {
    view.seenFrame = this.renderFrame;
    view.lastMarkedForDeletion = entity.markedForDeletion;
    view.root.visible = !entity.markedForDeletion;
    view.root.position.set(entity.x + entity.width / 2, entity.y + entity.height / 2);
    view.root.alpha = clamp(entity.spriteStyle?.opacity ?? 1, 0, 1);
    view.root.scale.set(1);
    view.root.rotation = 0;
    view.sprite.visible = true;
    view.sprite.alpha = 1;
    view.sprite.tint = '#ffffff';

    if (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) {
      this.drawProjectile(view, entity, engine.frameCount);
    } else if (entity.type === EntityType.EFFECT) {
      view.sprite.visible = false;
      view.body.clear();
      view.label.text = '';
      const effect = entity as VisualEffect;
      if (effect.effectType === 'text') {
        view.label.text = effect.text ?? '';
        view.label.style.fontSize = effect.fontSize;
        view.label.style.fill = effect.color;
        view.label.alpha = clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
      } else if (effect.effectType === 'sprite' && effect.spriteFrames?.length) {
        const age = Math.max(0, effect.maxLife - effect.life);
        const frameIndex = Math.min(effect.spriteFrames.length - 1, Math.floor(age / 6));
        this.setTexture(view, effect.spriteFrames[frameIndex]);
        view.sprite.visible = true;
        view.sprite.width = effect.width;
        view.sprite.height = effect.height;
        view.sprite.alpha = clamp(effect.life / Math.min(12, Math.max(1, effect.maxLife)), 0, 1);
      } else {
        const progress = 1 - clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
        view.body.circle(0, 0, 10 + progress * 80).stroke({ color: effect.color, width: Math.max(1, 3 * (1 - progress)), alpha: 1 - progress });
      }
    } else if (entity.type === EntityType.PARTICLE) {
      view.sprite.visible = false;
      view.body.clear();
      view.body.rect(-entity.width / 2, -entity.height / 2, entity.width, entity.height).fill({
        color: entity.color,
        alpha: clamp(entity.life / Math.max(1, entity.maxLife), 0, 1)
      });
    } else {
      const textureKey = entity.type === EntityType.PLAYER
        ? this.playerSteeringTextureKey ?? engine.playerShipUrl
        : getDefaultEntityTexture(engine, entity);
      this.setTexture(view, textureKey);
      const styleScale = entity.spriteStyle?.scale ?? 1;
      view.sprite.width = entity.width * styleScale;
      view.sprite.height = entity.height * styleScale;
      view.sprite.scale.x = Math.abs(view.sprite.scale.x) * (entity.spriteStyle?.flipX ? -1 : 1);
      view.sprite.rotation = ((entity.spriteStyle?.rotationDegrees ?? 0) * Math.PI) / 180;
      this.drawFallbackBody(view, entity);
    }

    if (entity.type === EntityType.PLAYER) {
      this.drawPlayerRig(view, entity, engine);
    } else if (entity.type === EntityType.BOSS) {
      const bossComponents = entity.bossComponents ?? [];
      const leftDestroyed = bossComponents.find((component) => component.id === 'left-cannon')?.destroyed ?? false;
      const rightDestroyed = bossComponents.find((component) => component.id === 'right-cannon')?.destroyed ?? false;
      if ((entity.bossRigId === 'open-orbit' || entity.bossRigId === 'citation-storm') && rightDestroyed && !leftDestroyed) {
        view.sprite.scale.x = -Math.abs(view.sprite.scale.x);
      }
      view.sprite.y = Math.sin(engine.frameCount * 0.04) * 5;
      this.drawBossComponents(view, entity, engine);
      this.drawBossRig(view, entity, engine);
    } else if (entity.type === EntityType.MINI_BOSS) {
      view.sprite.y = Math.sin(engine.frameCount * 0.08) * 4;
      view.root.rotation = Math.sin(engine.frameCount * 0.025) * 0.035;
    } else if (entity.type === EntityType.ENEMY_DRONE) {
      view.root.rotation = entity.formation === 'spiral'
        ? Math.PI / 2 + entity.angle
        : clamp(entity.vx * 0.045, -0.34, 0.34);
    } else if (entity.type === EntityType.ENEMY_SWARM) {
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.08) * 0.14;
      view.root.scale.set(1 + Math.sin((engine.frameCount + entity.variant) * 0.12) * 0.04);
    } else if (entity.type === EntityType.ENEMY_BRICK) {
      // Belt asteroids keep a stable silhouette; only the formation bulwark
      // enemies use the hovering rotation animation.
      if (entity.variant < 900) {
        view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.03) * 0.2;
      }
    } else if (entity.type === EntityType.ENEMY_JOURNAL || entity.type === EntityType.ENEMY_INVADER) {
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.05) * 0.09;
    } else if (entity.type === EntityType.COIN) {
      // The RSC frame art supplies the 3D yaw flip. A brief presentation-only
      // pulse makes boss showers readable without changing pickup geometry.
      view.root.rotation = 0;
      view.aura.clear();
      const burstPulse = entity.coinBurstFrames > 0
        ? 1.04 + Math.sin((engine.frameCount + entity.variant) * 0.2) * 0.08
        : 1;
      view.root.scale.set(burstPulse);
      if (entity.coinBurstFrames > 0) {
        const glowAlpha = 0.17 + Math.sin((engine.frameCount + entity.variant) * 0.16) * 0.07;
        view.aura.circle(0, 0, entity.width * 0.66)
          .fill({ color: '#facc15', alpha: glowAlpha });
      }
    } else if (entity.type === EntityType.BOMB) {
      const pulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.18) * 0.08;
      view.root.scale.set(pulse);
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.045) * 0.12;
    } else if (entity.type === EntityType.POWERUP) {
      const isMaxShot = entity.text === PowerupType.MAX_SHOT;
      const maxShotPulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.16) * 0.055;
      view.root.scale.set(1.22);
      if (isMaxShot) view.root.scale.set(1.4 * maxShotPulse);
      view.root.rotation = isMaxShot ? 0 : Math.sin((engine.frameCount + entity.variant) * 0.045) * 0.035;
      view.aura.clear();
    }

    if (entity.isElite && isEnemyType(entity.type)) {
      const pulse = 0.74 + Math.sin((engine.frameCount + entity.variant) * 0.09) * 0.16;
      view.aura.ellipse(0, 0, entity.width * 0.58, entity.height * 0.52)
        .stroke({ color: '#c4b5fd', width: 2, alpha: pulse });
    }

    if (entity.type === EntityType.MINI_BOSS || entity.isElite) {
      this.drawHealthBar(view, entity);
    } else if (entity.type === EntityType.BOSS) {
      view.health.clear();
      view.label.text = '';
    }
    if (entity.flashFrames > 0 || view.lastFlashFrames > 0) {
      this.drawFlash(view, entity);
    }

    if (entity.flashFrames > view.lastFlashFrames + 2) {
      this.effectPool.spawnImpact(
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
        Math.max(14, Math.min(34, entity.width * 0.34))
      );
      this.effectPool.spawn('ring', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(18, entity.width * 0.6), '#ffffff', 180);
      this.effectPool.spawn('spark', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(2, entity.width * 0.04), entity.color || '#ffffff', 220);
    }
    view.lastFlashFrames = entity.flashFrames;
    view.lastHp = entity.hp;
  }

  private syncEntities(engine: GameEngine) {
    const entities = engine.entities;
    for (const entity of entities) {
      if (entity.markedForDeletion) continue;
      let view = this.views.get(entity.id);
      if (!view) {
        view = this.createEntityView(entity);
        this.views.set(entity.id, view);
        if (isEnemyType(entity.type) && entity.y > -entity.height * 2) {
          this.effectPool.spawn('ring', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(22, entity.width * 0.55), entity.type === EntityType.BOSS ? '#fef08a' : '#67e8f9', 300);
        }
        if ((entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) && entity.isPlayerShot) {
          this.effectPool.spawn('muzzle', entity.x + entity.width / 2, entity.y + entity.height / 2, Math.max(10, entity.width * 1.4), entity.color || '#67e8f9', 120);
        }
      }
      this.updateEntityView(view, entity, engine);
    }

    const playerView = this.views.get('__player__') ?? (() => {
      const view = this.createEntityView(engine.player);
      view.id = '__player__';
      this.views.set('__player__', view);
      return view;
    })();
    this.updateEntityView(playerView, engine.player, engine);
    playerView.root.visible = engine.lives > 0 || engine.deathSequenceFrames > 0;

    for (const [id, view] of this.views) {
      if (id.startsWith('__') || view.seenFrame === this.renderFrame) continue;
      if (isEnemyType(view.type) && view.lastHp <= 0 && view.root.y > -80 && view.root.y < this.height + 80) {
        const size = view.type === EntityType.BOSS ? 180 : view.type === EntityType.MINI_BOSS ? 110 : 46;
        if (view.type === EntityType.BOSS) this.effectPool.spawnBossExplosion(view.root.x, view.root.y, size, 2.2);
        else if (view.type === EntityType.MINI_BOSS) this.effectPool.spawnExplosion(view.root.x, view.root.y, size, '#67e8f9', 0.85);
        else this.effectPool.spawnEnemyExplosion(view.root.x, view.root.y, size, '#67e8f9');
      }
      this.views.delete(id);
      this.seenBossPhase.delete(id);
      this.seenBossComponents.delete(id);
      this.releaseEntityView(view);
    }
  }

  private syncGunPods(engine: GameEngine) {
    const companions = engine.getSquadCompanionVisuals();
    if (companions.length === 0 || engine.lives <= 0) {
      this.gunPodRoot.visible = false;
      return;
    }

    this.gunPodRoot.visible = true;
    this.gunPodRoot.alpha = 1;
    for (let index = 0; index < this.gunPodSprites.length; index++) {
      const pod = this.gunPodSprites[index];
      const companion = companions[index];
      const textureKey = companion?.frames[companion.frameIndex] ?? '';
      const texture = textureKey ? this.textureBank.get(textureKey) : null;
      pod.visible = Boolean(companion && texture);
      if (!pod.visible || !texture || !companion) continue;
      pod.texture = texture;
      pod.width = companion.width;
      pod.height = companion.height;
      pod.alpha = companion.alpha;
      pod.position.set(companion.x, companion.y);
      pod.rotation = Math.sin(engine.frameCount * 0.04 + index * Math.PI) * 0.028;
    }
  }

  private syncPlayerThrusters(engine: GameEngine) {
    const frameCount = ASSETS.PIXI_THRUSTER_FRAMES.length;
    const speedLevel = clamp(Math.floor(engine.stats.upgrades.speed || 0), 0, PLAYER_THRUSTER_COLORS.length - 1);
    const frameDelay = Math.max(2, 7 - speedLevel);
    const texture = this.textureBank.get(ASSETS.PIXI_THRUSTER_FRAMES[Math.floor(engine.frameCount / frameDelay) % frameCount]);
    const visible = Boolean(texture && engine.lives > 0 && engine.playerDrawAlpha > 0.02);
    this.playerThrusterRoot.visible = visible;
    if (!visible || !texture) return;

    const [, edge] = PLAYER_THRUSTER_COLORS[speedLevel];
    const movement = Math.min(1, Math.hypot(engine.playerVel.x, engine.playerVel.y) / 7);
    const cinematic = engine.introFlightFrames > 0 || engine.waveDepartureFrames > 0;
    const sizeBoost = (1 + speedLevel * 0.115 + movement * 0.2) * (cinematic ? 1.28 : 1);
    const centerX = engine.player.x + engine.player.width / 2;
    const centerY = engine.player.y + engine.player.height / 2;
    this.playerThrusterRoot.position.set(centerX, centerY);
    this.playerThrusterRoot.rotation = 0;
    this.playerThrusterRoot.scale.set(engine.playerDrawScale * 0.95);
    this.playerThrusterRoot.alpha = engine.playerDrawAlpha;

    const hardBank = this.playerSteeringState === 'hard-left' || this.playerSteeringState === 'hard-right';
    for (let index = 0; index < this.playerThrusters.length; index++) {
      const thruster = this.playerThrusters[index];
      thruster.visible = !hardBank || index === 0;
      if (!thruster.visible) continue;
      thruster.texture = texture;
      thruster.tint = edge;
      thruster.position.set(
        hardBank ? 0 : (index === 0 ? -1 : 1) * engine.player.width * 0.16,
        engine.player.height * (hardBank ? 0.34 : 0.3)
      );
      thruster.width = engine.player.height * 0.31 * sizeBoost;
      thruster.height = engine.player.width * (0.12 + speedLevel * 0.005);
    }
  }

  private syncBioPrimaryBeam(engine: GameEngine) {
    const active = engine.isBioBeamFiring();
    this.bioBeamRoot.visible = active;
    this.bioBeamAura.clear();
    this.bioBeamCore.clear();
    this.bioBeamEmitter.visible = active;
    if (!active) {
      this.bioBeamVisualStartFrame = -1;
      return;
    }

    if (this.bioBeamVisualStartFrame < 0) {
      this.bioBeamVisualStartFrame = engine.frameCount;
    }

    const level = Math.min(engine.stats.upgrades.fireRate || 0, 7);
    const frames = getPlayerWeaponFrames('bio-laser', level);
    const launchFrame = getPlayerWeaponLaunchFrameIndex(
      engine.frameCount - this.bioBeamVisualStartFrame,
      frames.length
    );
    const launchProgress = (launchFrame + 1) / frames.length;
    const color = level > 0 ? '#38bdf8' : '#65f59a';
    const centerX = engine.player.x + engine.player.width / 2;
    const endY = Math.max(0, engine.player.y + engine.player.height * 0.2);
    const width = (5 + level * 1.55) * launchProgress;
    const pulse = 0.94 + Math.sin(engine.frameCount * 0.42) * 0.06;
    this.bioBeamAura.rect(centerX - width * 1.8, 0, width * 3.6, endY)
      .fill({ color, alpha: 0.15 * pulse });
    this.bioBeamAura.rect(centerX - width * 0.72, 0, width * 1.44, endY)
      .fill({ color, alpha: 0.62 });
    this.bioBeamCore.rect(centerX - Math.max(1.5, width * 0.2), 0, Math.max(3, width * 0.4), endY)
      .fill({ color: '#ffffff', alpha: 0.96 });
    const textureKey = frames[launchFrame];
    this.bioBeamEmitter.texture = this.textureBank.get(textureKey) ?? Texture.WHITE;
    this.bioBeamEmitter.tint = '#ffffff';
    this.bioBeamEmitter.alpha = 0.98;
    this.bioBeamEmitter.position.set(centerX, endY + engine.player.height * 0.08);
    this.bioBeamEmitter.width = 18 + level * 3.4;
    this.bioBeamEmitter.height = 42 + level * 6.2;
  }

  private syncWallHealth(engine: GameEngine) {
    const segments = engine.entities.filter((entity) => entity.type === EntityType.ENEMY_INVADER && !entity.markedForDeletion);
    this.wallHealthRoot.visible = segments.length > 0;
    this.wallHealthBar.clear();
    this.wallHealthLabel.text = '';
    if (segments.length === 0) return;

    const totalHp = segments.reduce((sum, segment) => sum + Math.max(0, segment.hp), 0);
    const totalMaxHp = segments.reduce((sum, segment) => sum + Math.max(1, segment.maxHp), 0);
    const progress = clamp(totalHp / Math.max(1, totalMaxHp), 0, 1);
    const left = Math.min(...segments.map((segment) => segment.x));
    const right = Math.max(...segments.map((segment) => segment.x + segment.width));
    const top = Math.min(...segments.map((segment) => segment.y));
    const width = clamp(right - left, 150, this.width * 0.74);
    this.wallHealthRoot.position.set((left + right) / 2, Math.max(76, top - 14));
    this.wallHealthBar.roundRect(-width / 2, 0, width, 9, 4).fill({ color: '#020617', alpha: 0.94 });
    this.wallHealthBar.roundRect(-width / 2 + 1, 1, Math.max(0, (width - 2) * progress), 7, 3)
      .fill(progress > 0.5 ? '#34d399' : progress > 0.22 ? '#facc15' : '#fb7185');
    this.wallHealthBar.roundRect(-width / 2, 0, width, 9, 4).stroke({ color: '#bae6fd', width: 1, alpha: 0.8 });
    this.wallHealthLabel.text = `PAYWALL INTEGRITY ${Math.ceil(progress * 100)}%`;
    this.wallHealthLabel.position.set(0, -9);
  }

  private syncBossHealthHud(engine: GameEngine) {
    const boss = engine.entities.find((entity) => (
      entity.type === EntityType.BOSS && !entity.markedForDeletion
    ));
    this.bossHealthRoot.visible = Boolean(boss);
    this.bossHealthBar.clear();
    this.bossHealthName.text = '';
    this.bossHealthPercent.text = '';
    if (!boss) return;

    const frameWidth = Math.min(clamp(this.width * 0.76, 210, 342), Math.max(180, this.width - 20));
    const frameHeight = frameWidth * (143 / 737);
    const progress = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
    const eventId = boss.sourceEventId ?? '';
    const name = eventId.includes('citation')
      ? 'REVIEW SENTINEL'
      : boss.bossRigId === 'crown-claw'
        ? 'ASTRAL CROWNCLAW'
        : boss.bossRigId === 'paywall-siege'
          ? 'PEER REVIEW DECIMATOR'
          : 'GATEKEEPER SENTINEL';
    const barWidth = frameWidth * 0.68;
    const barY = frameHeight * 0.14;

    this.bossHealthRoot.position.set(this.width / 2, this.width < 520 ? 78 : 82);
    this.bossHealthFrame.width = frameWidth;
    this.bossHealthFrame.height = frameHeight;
    this.bossHealthFrame.alpha = 0.96;
    this.bossHealthBar.roundRect(-barWidth / 2, barY, barWidth, 9, 3)
      .fill({ color: '#170508', alpha: 0.98 });
    this.bossHealthBar.roundRect(-barWidth / 2 + 1, barY + 1, Math.max(0, (barWidth - 2) * progress), 7, 2)
      .fill('#ef233c');
    this.bossHealthBar.roundRect(-barWidth / 2, barY, barWidth, 9, 3)
      .stroke({ color: '#ff6b76', width: 1, alpha: 0.72 });
    this.bossHealthName.text = name;
    this.bossHealthName.position.set(-frameWidth * 0.08, -frameHeight * 0.13);
    this.bossHealthPercent.text = `${Math.ceil(progress * 100)}%`;
    this.bossHealthPercent.position.set(frameWidth * 0.29, -frameHeight * 0.13);
  }

  private syncPlayerAfterimages(engine: GameEngine) {
    const existing = this.layers.player.getChildByLabel('player-afterimages');
    let root: Container;
    if (existing instanceof Container) {
      root = existing;
    } else {
      root = new Container({ label: 'player-afterimages' });
      this.layers.player.addChildAt(root, 0);
    }
    const texture = this.textureBank.get(this.playerSteeringTextureKey ?? engine.playerShipUrl);
    const desired = engine.performanceMode ? Math.min(2, engine.playerAfterimages.length) : engine.playerAfterimages.length;
    while (root.children.length < desired) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      root.addChild(sprite);
    }
    for (let index = 0; index < root.children.length; index++) {
      const sprite = root.children[index] as Sprite;
      const afterimage = engine.playerAfterimages[index];
      sprite.visible = Boolean(afterimage && texture);
      if (!afterimage || !texture) continue;
      sprite.texture = texture;
      sprite.position.set(afterimage.x + afterimage.width / 2, afterimage.y + afterimage.height / 2);
      sprite.width = afterimage.width;
      sprite.height = afterimage.height;
      sprite.rotation = 0;
      sprite.alpha = afterimage.alpha * 0.65;
      sprite.tint = '#67e8f9';
    }
  }

  private syncResearchBeam(engine: GameEngine) {
    const key = '__research-beam__';
    let view = this.views.get(key);
    const remaining = engine.activePowerups.get(PowerupType.RESEARCH_BEAM) || 0;
    if (remaining <= 0) {
      if (view) view.root.visible = false;
      return;
    }
    if (!view) {
      const dummy = new Entity(EntityType.EFFECT, 0, 0);
      view = this.createEntityView(dummy);
      view.id = key;
      this.views.set(key, view);
    }
    view.seenFrame = this.renderFrame;
    view.root.visible = true;
    view.root.position.set(0, 0);
    view.root.scale.set(1);
    view.root.rotation = 0;
    view.root.alpha = clamp(remaining / 36, 0, 1);
    view.sprite.visible = false;
    view.body.clear();
    view.aura.clear();
    view.trail.clear();
    view.flash.clear();
    view.health.clear();
    view.label.text = '';
    const centerX = engine.player.x + engine.player.width / 2;
    const endY = engine.player.y + engine.player.height * 0.4;
    const width = this.width < 520 ? 48 : 60;
    const pulse = 0.8 + Math.sin(engine.frameCount * 0.28) * 0.2;
    view.aura.rect(centerX - width * 0.72, 0, width * 1.44, endY).fill({ color: '#a855f7', alpha: 0.13 * pulse });
    view.body.rect(centerX - width * 0.24, 0, width * 0.48, endY).fill({ color: '#22d3ee', alpha: 0.62 });
    view.body.rect(centerX - width * 0.08, 0, width * 0.16, endY).fill({ color: '#ffffff', alpha: 0.95 });
  }

  private updateWarnings(engine: GameEngine) {
    const active = engine.inBossWarningSequence;
    this.warningShade.visible = active;
    this.warningFrame.visible = active;
    this.warningRoot.visible = active;
    if (!active) return;

    const elapsed = engine.bossWarningDuration - engine.bossWarningFrame;
    const pulseWave = (Math.sin(elapsed * 0.24) + 1) * 0.5;
    const pulse = 0.58 + pulseWave * 0.42;
    const sirenWave = (Math.cos((elapsed % 36) / 36 * Math.PI * 2) + 1) * 0.5;
    const redFlashAlpha = 0.07 + sirenWave * 0.2;
    const mainBoss = engine.pendingBossType === 'gatekeeper';
    const title = mainBoss ? 'BOSS INCOMING' : 'THREAT INCOMING';
    const subtitle = mainBoss
      ? 'GATEKEEPER SENTINEL'
      : engine.pendingBossType === 'wall'
        ? 'PAYWALL BASTION'
        : 'BOTTLENECK HARVESTER';
    const entryProgress = clamp(elapsed / 24, 0, 1);
    const exitProgress = clamp(engine.bossWarningFrame / 16, 0, 1);
    const deployProgress = Math.min(entryProgress, exitProgress);
    const easedDeploy = 1 - Math.pow(1 - deployProgress, 3);
    const bannerBaseScale = Math.min((this.width * 0.98) / 1024, 0.78);
    const bannerScale = bannerBaseScale * (0.86 + easedDeploy * 0.14);
    const centerY = this.height * (this.height > this.width * 1.3 ? 0.39 : 0.43);

    this.warningShade.clear().rect(0, 0, this.width, this.height).fill({ color: '#dc2626', alpha: redFlashAlpha });
    this.warningFrame.clear();
    this.warningFrame.rect(0, 0, this.width, 5).fill({ color: '#fb3847', alpha: pulse * 0.9 });
    this.warningFrame.rect(0, this.height - 5, this.width, 5).fill({ color: '#fb3847', alpha: pulse * 0.9 });
    for (let x = -20; x < this.width + 20; x += 42) {
      this.warningFrame.poly([x, 0, x + 16, 0, x + 7, 12]).fill({ color: '#fef08a', alpha: pulse * 0.72 });
      this.warningFrame.poly([x, this.height, x + 16, this.height, x + 7, this.height - 12]).fill({ color: '#fef08a', alpha: pulse * 0.72 });
    }

    this.warningBanner.texture = this.textureBank.get(
      mainBoss ? ASSETS.PIXI_BOSS_ALERT_FRAME : ASSETS.PIXI_MINI_BOSS_ALERT_FRAME
    ) ?? Texture.WHITE;
    this.warningRoot.position.set(this.width / 2, centerY - (1 - easedDeploy) * 46);
    this.warningRoot.scale.set(bannerScale);
    this.warningRoot.alpha = clamp(deployProgress * 1.35, 0, 1);
    this.warningBanner.alpha = 0.96;

    this.warningScan.position.set(-280 + ((elapsed * 18) % 560), -2);
    this.warningScan.width = 420;
    this.warningScan.height = 24;
    this.warningScan.alpha = 0.25 + pulseWave * 0.35;

    this.warningRing.position.set(0, 100);
    this.warningRing.scale.set(1.18 + pulseWave * 0.14);
    this.warningRing.rotation = elapsed * 0.025;
    this.warningRing.alpha = 0.62 + pulseWave * 0.28;

    this.warningCrystal.position.set(0, 100);
    this.warningCrystal.scale.set(0.52 + pulseWave * 0.035);
    this.warningCrystal.alpha = 0.9;

    this.warningText.text = title;
    this.warningText.style.fontSize = this.width < 520 ? 70 : 58;
    this.warningText.position.set(0, -38);
    this.warningText.alpha = 0.9 + pulseWave * 0.1;
    this.warningSubtext.text = subtitle;
    this.warningSubtext.style.fontSize = this.width < 520 ? 30 : 25;
    this.warningSubtext.position.set(0, 34);
    this.warningSubtext.alpha = 0.82 + pulseWave * 0.18;
  }

  sync(engine: GameEngine, timestamp = performance.now()) {
    if (!this.initialized || this.destroyed) return;
    this.renderFrame++;
    const deltaMs = this.lastTimestamp ? clamp(timestamp - this.lastTimestamp, 0, 50) : 16.667;
    this.lastTimestamp = timestamp;
    this.updatePlayerSteeringPresentation(engine, deltaMs);
    this.camera.position.set(engine.shakeX, engine.shakeY);
    this.environment.update(engine);
    this.syncEntities(engine);
    this.syncMaxShotPresentation(engine);
    this.syncPlayerAfterimages(engine);
    this.syncPlayerThrusters(engine);
    this.syncGunPods(engine);
    this.syncBioPrimaryBeam(engine);
    this.syncResearchBeam(engine);
    this.syncWallHealth(engine);
    this.syncBossHealthHud(engine);
    this.updateWavePresentation(engine, timestamp, deltaMs);
    this.updateWarnings(engine);
    this.updateBossPresentation(engine, deltaMs);
    this.effectPool.setQuality(engine.performanceMode, engine.mobileProfile);
    this.effectPool.update(deltaMs);

    if (engine.lastShotFrame !== this.lastShotFrame) this.lastShotFrame = engine.lastShotFrame;
    if (engine.lastBombFrame !== this.lastBombFrame) {
      if (this.lastBombFrame > -900) {
        this.effectPool.spawnExplosion(engine.player.x + engine.player.width / 2, engine.player.y + engine.player.height / 2, Math.min(this.width, this.height) * 0.42, '#facc15', 2);
      }
      this.lastBombFrame = engine.lastBombFrame;
    }

    this.flashOverlay.visible = engine.flashAlpha > 0.01;
    this.flashOverlay.alpha = clamp(engine.flashAlpha * 0.72, 0, 0.7);
    this.app.renderer.render(this.app.stage);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.initialized = false;
    this.effectPool.destroy();
    this.environment.destroy();
    this.textureBank.destroy();
    this.views.clear();
    this.recycledViews.clear();
    this.seenBossPhase.clear();
    this.seenBossComponents.clear();
    this.destroyApplication();
  }

  private destroyApplication() {
    if (!this.appReady || this.appDestroyed) return;
    this.appDestroyed = true;
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
