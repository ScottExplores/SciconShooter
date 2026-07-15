import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture
} from 'pixi.js';
import { ASSETS } from '../../constants';
import { EntityType, PowerupType } from '../../types';
import { Entity, GameEngine, VisualEffect } from '../gameLogic';

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
  seenFrame: number;
};

type ParallaxLayer = {
  root: Container;
  sprites: [Sprite, Sprite];
  speed: number;
  alpha: number;
  textureKey: string;
};

type StarPoint = {
  sprite: Sprite;
  speed: number;
  phase: number;
};

type EffectKind = 'burst' | 'ring' | 'spark' | 'shockwave' | 'muzzle' | 'smoke';

type PooledEffect = {
  root: Container;
  graphic: Graphics;
  kind: EffectKind;
  age: number;
  duration: number;
  size: number;
  color: string;
  velocityX: number;
  velocityY: number;
  spin: number;
  active: boolean;
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

const BACKGROUND_LAYERS = [
  { url: ASSETS.GAME_PARALLAX_BACK, speed: 0.08, alpha: 0.72 },
  { url: ASSETS.GAME_PARALLAX_STARS, speed: 0.18, alpha: 0.46 },
  { url: ASSETS.GAME_BG_BACK, speed: 0.3, alpha: 0.28 },
  { url: ASSETS.GAME_BG_STARS, speed: 0.48, alpha: 0.55 }
] as const;

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

const getPowerupTexture = (powerup: PowerupType) => {
  switch (powerup) {
    case PowerupType.TRIPLE_SHOT:
      return ASSETS.FOUNDER_BRIAN;
    case PowerupType.MAGNET:
      return ASSETS.FOUNDER_PATRICK;
    case PowerupType.SHIELD:
      return ASSETS.FOUNDER_JEFFREY;
    case PowerupType.EXTRA_LIFE:
      return ASSETS.FOUNDER_ARSHIA;
    case PowerupType.RESEARCH_BEAM:
      return ASSETS.REAL_RSC_ICON;
    case PowerupType.DOUBLE_SHOT:
    default:
      return ASSETS.FOUNDER_4;
  }
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

const getDefaultEntityTexture = (engine: GameEngine, entity: Entity) => {
  if (entity.spriteFrames?.length) {
    const speed = entity.type === EntityType.ENEMY_SWARM ? 5 : 6;
    return entity.spriteFrames[(Math.floor(engine.frameCount / speed) + entity.variant) % entity.spriteFrames.length];
  }
  if (entity.spriteUrl) return entity.spriteUrl;

  switch (entity.type) {
    case EntityType.PLAYER:
      return engine.playerShipUrl;
    case EntityType.ENEMY_DRONE:
      return ASSETS.ENEMY_DRONE_FRAMES[(Math.floor(engine.frameCount / 6) + entity.variant) % ASSETS.ENEMY_DRONE_FRAMES.length];
    case EntityType.ENEMY_SWARM:
      return ASSETS.ENEMY_SWARM_FRAMES[(Math.floor(engine.frameCount / 5) + entity.variant) % ASSETS.ENEMY_SWARM_FRAMES.length];
    case EntityType.ENEMY_BRICK: {
      const frames = entity.variant >= 900 ? ASSETS.ASTEROID_BELT_FRAMES : ASSETS.ENEMY_BRICK_FRAMES;
      return frames[entity.variant % frames.length];
    }
    case EntityType.ENEMY_JOURNAL:
      return ASSETS.ENEMY_JOURNAL_FRAMES[(Math.floor(engine.frameCount / 6) + entity.variant) % ASSETS.ENEMY_JOURNAL_FRAMES.length];
    case EntityType.ENEMY_INVADER:
      return ASSETS.WALL_BOSS_SEGMENT;
    case EntityType.MINI_BOSS:
      return ASSETS.MINI_BOSS;
    case EntityType.BOSS:
      return ASSETS.FINAL_BOSS;
    case EntityType.COIN:
      return ASSETS.RSC_TOKEN;
    case EntityType.BOMB:
      return engine.bombSpriteUrl;
    case EntityType.POWERUP:
      return getPowerupTexture(entity.text as PowerupType);
    default:
      return null;
  }
};

class TextureBank {
  private textures = new Map<string, Texture>();
  private pending = new Map<string, Promise<Texture>>();

  async load(url: string) {
    const cached = this.textures.get(url);
    if (cached) return cached;

    const pending = this.pending.get(url);
    if (pending) return pending;

    const request = Assets.load<Texture>(url)
      .then((texture) => {
        texture.source.scaleMode = 'nearest';
        this.textures.set(url, texture);
        this.pending.delete(url);
        return texture;
      })
      .catch((error) => {
        this.pending.delete(url);
        throw error;
      });
    this.pending.set(url, request);
    return request;
  }

  preload(urls: string[]) {
    return Promise.allSettled([...new Set(urls.filter(Boolean))].map((url) => this.load(url)));
  }

  get(url: string) {
    return this.textures.get(url) ?? null;
  }
}

class ArcadeEffectPool {
  private readonly layer: Container;
  private readonly effects: PooledEffect[] = [];

  constructor(layer: Container) {
    this.layer = layer;
  }

  private acquire(kind: EffectKind) {
    let effect = this.effects.find((candidate) => !candidate.active);
    if (!effect) {
      const root = new Container();
      const graphic = new Graphics();
      root.addChild(graphic);
      root.eventMode = 'none';
      effect = {
        root,
        graphic,
        kind,
        age: 0,
        duration: 1,
        size: 1,
        color: '#ffffff',
        velocityX: 0,
        velocityY: 0,
        spin: 0,
        active: false
      };
      this.effects.push(effect);
      this.layer.addChild(root);
    }
    effect.active = true;
    effect.root.visible = true;
    effect.root.alpha = 1;
    effect.root.scale.set(1);
    effect.root.rotation = 0;
    effect.graphic.clear();
    return effect;
  }

  spawn(kind: EffectKind, x: number, y: number, size: number, color: string, duration = 360) {
    const effect = this.acquire(kind);
    effect.kind = kind;
    effect.age = 0;
    effect.duration = duration;
    effect.size = size;
    effect.color = color;
    effect.velocityX = kind === 'spark' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.velocityY = kind === 'smoke' ? -0.24 : kind === 'spark' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.spin = (Math.random() - 0.5) * 0.08;
    effect.root.position.set(x, y);
    this.drawEffect(effect, 0);
    return effect;
  }

  spawnExplosion(x: number, y: number, size: number, color = '#67e8f9', intensity = 1) {
    this.spawn('shockwave', x, y, size * 1.5, color, 520);
    this.spawn('burst', x, y, size, color, 420);
    const sparks = Math.max(3, Math.round(5 * intensity));
    for (let index = 0; index < sparks; index++) {
      const spark = this.spawn('spark', x, y, Math.max(2, size * 0.08), index % 2 ? '#ffffff' : color, 260 + Math.random() * 240);
      spark.velocityX = (Math.random() - 0.5) * size * 0.045;
      spark.velocityY = (Math.random() - 0.5) * size * 0.045;
    }
    if (size > 80) {
      this.spawn('smoke', x - size * 0.2, y, size * 0.42, '#64748b', 900);
      this.spawn('smoke', x + size * 0.2, y + size * 0.08, size * 0.34, '#334155', 980);
    }
  }

  private drawEffect(effect: PooledEffect, progress: number) {
    const graphic = effect.graphic;
    graphic.clear();

    if (effect.kind === 'ring' || effect.kind === 'shockwave') {
      const radius = effect.size * (0.16 + progress * 0.84);
      graphic.circle(0, 0, radius).stroke({
        color: effect.color,
        width: Math.max(1, effect.size * 0.045 * (1 - progress)),
        alpha: 0.95
      });
      if (effect.kind === 'shockwave') {
        graphic.circle(0, 0, radius * 0.7).stroke({ color: '#ffffff', width: 1.5, alpha: 0.55 });
      }
      return;
    }

    if (effect.kind === 'muzzle') {
      const length = effect.size * (1 - progress * 0.65);
      graphic.moveTo(0, -length).lineTo(effect.size * 0.28, 0).lineTo(0, length * 0.28).lineTo(-effect.size * 0.28, 0).closePath();
      graphic.fill({ color: '#ffffff', alpha: 0.95 });
      graphic.circle(0, 0, effect.size * 0.22).fill({ color: effect.color, alpha: 0.85 });
      return;
    }

    if (effect.kind === 'spark') {
      graphic.roundRect(-effect.size * 0.35, -effect.size * 1.8, effect.size * 0.7, effect.size * 3.6, effect.size * 0.3)
        .fill({ color: effect.color, alpha: 0.95 });
      return;
    }

    if (effect.kind === 'smoke') {
      graphic.circle(0, 0, effect.size * (0.56 + progress * 0.44)).fill({ color: effect.color, alpha: 0.24 });
      graphic.circle(-effect.size * 0.22, -effect.size * 0.08, effect.size * 0.34).fill({ color: effect.color, alpha: 0.18 });
      return;
    }

    const rays = 10;
    for (let index = 0; index < rays; index++) {
      const angle = (Math.PI * 2 * index) / rays + effect.root.rotation;
      const inner = effect.size * (0.08 + progress * 0.18);
      const outer = effect.size * (0.32 + progress * 0.72) * (0.72 + (index % 3) * 0.12);
      graphic.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      graphic.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      graphic.stroke({ color: index % 2 ? '#ffffff' : effect.color, width: Math.max(1, effect.size * 0.055), alpha: 0.9 });
    }
    graphic.circle(0, 0, effect.size * (0.28 + progress * 0.16)).fill({ color: effect.color, alpha: 0.72 });
    graphic.circle(0, 0, effect.size * 0.12).fill({ color: '#ffffff', alpha: 0.98 });
  }

  update(deltaMs: number) {
    for (const effect of this.effects) {
      if (!effect.active) continue;
      effect.age += deltaMs;
      const progress = clamp(effect.age / effect.duration, 0, 1);
      effect.root.x += effect.velocityX * (deltaMs / 16.667);
      effect.root.y += effect.velocityY * (deltaMs / 16.667);
      effect.root.rotation += effect.spin * (deltaMs / 16.667);
      effect.root.alpha = (1 - progress) * (effect.kind === 'smoke' ? 0.72 : 1);
      this.drawEffect(effect, progress);
      if (progress >= 1) {
        effect.active = false;
        effect.root.visible = false;
      }
    }
  }

  destroy() {
    this.effects.length = 0;
  }
}

export class PixiGameRenderer {
  readonly app = new Application();

  private readonly textureBank = new TextureBank();
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
  private readonly parallaxLayers: ParallaxLayer[] = [];
  private readonly stars: StarPoint[] = [];
  private readonly backgroundFill = new Graphics();
  private readonly sectorTint = new Graphics();
  private readonly horizon = new Sprite(Texture.WHITE);
  private readonly bigPlanet = new Sprite(Texture.WHITE);
  private readonly ringPlanet = new Sprite(Texture.WHITE);
  private readonly warningShade = new Graphics();
  private readonly warningFrame = new Graphics();
  private readonly warningText = createText(30, '#fef08a');
  private readonly warningSubtext = createText(13, '#ffffff', 'normal');
  private readonly flashOverlay = new Graphics();
  private readonly scanlines = new Graphics();
  private readonly effectPool = new ArcadeEffectPool(this.layers.effects);
  private readonly seenBossPhase = new Map<string, number>();
  private initialized = false;
  private renderFrame = 0;
  private width = 1;
  private height = 1;
  private lastTimestamp = 0;
  private lastShotFrame = -999;
  private lastBombFrame = -999;
  private destroyed = false;

  async init(host: HTMLElement, width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
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
    if (this.destroyed) return;
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

    this.layers.background.addChild(this.backgroundFill);
    this.buildBackground();
    this.layers.background.addChild(this.sectorTint);
    this.layers.environment.addChild(this.horizon, this.bigPlanet, this.ringPlanet);
    this.layers.overlay.addChild(
      this.warningShade,
      this.warningFrame,
      this.warningText,
      this.warningSubtext,
      this.flashOverlay,
      this.scanlines
    );

    this.warningText.anchor.set(0.5);
    this.warningSubtext.anchor.set(0.5);
    this.warningShade.visible = false;
    this.warningFrame.visible = false;
    this.warningText.visible = false;
    this.warningSubtext.visible = false;
    this.flashOverlay.visible = false;

    this.resize(this.width, this.height);
    this.initialized = true;

    await this.textureBank.preload([
      ASSETS.GAME_PARALLAX_BACK,
      ASSETS.GAME_PARALLAX_STARS,
      ASSETS.GAME_BG_BACK,
      ASSETS.GAME_BG_STARS,
      ASSETS.GAME_BG_PLANET,
      ASSETS.GAME_PARALLAX_BIG_PLANET,
      ASSETS.GAME_PARALLAX_RING_PLANET,
      ...ASSETS.ENEMY_DRONE_FRAMES,
      ...ASSETS.ENEMY_SWARM_FRAMES,
      ...ASSETS.ENEMY_BRICK_FRAMES,
      ...ASSETS.ENEMY_JOURNAL_FRAMES,
      ASSETS.MINI_BOSS,
      ASSETS.FINAL_BOSS,
      ASSETS.WALL_BOSS_SEGMENT,
      ASSETS.RSC_TOKEN
    ]);
    await this.loadBackgroundTextures();
  }

  private buildBackground() {
    for (const definition of BACKGROUND_LAYERS) {
      const root = createLayer();
      const first = new Sprite(Texture.WHITE);
      const second = new Sprite(Texture.WHITE);
      first.alpha = definition.alpha;
      second.alpha = definition.alpha;
      root.addChild(first, second);
      this.parallaxLayers.push({
        root,
        sprites: [first, second],
        speed: definition.speed,
        alpha: definition.alpha,
        textureKey: definition.url
      });
      this.layers.background.addChild(root);
    }

    const starCount = this.width < 620 ? 72 : 120;
    for (let index = 0; index < starCount; index++) {
      const sprite = new Sprite(Texture.WHITE);
      const depth = 0.25 + Math.random() * 0.75;
      sprite.tint = index % 8 === 0 ? '#67e8f9' : index % 13 === 0 ? '#c4b5fd' : '#e2f4ff';
      sprite.alpha = 0.2 + depth * 0.7;
      const size = 0.7 + depth * 1.9;
      sprite.width = size;
      sprite.height = size;
      this.stars.push({ sprite, speed: 0.2 + depth * 1.35, phase: Math.random() * Math.PI * 2 });
      this.layers.background.addChild(sprite);
    }
  }

  private async loadBackgroundTextures() {
    for (const layer of this.parallaxLayers) {
      const texture = this.textureBank.get(layer.textureKey) ?? await this.textureBank.load(layer.textureKey).catch(() => null);
      if (!texture || this.destroyed) continue;
      layer.sprites[0].texture = texture;
      layer.sprites[1].texture = texture;
      texture.source.scaleMode = 'nearest';
    }

    const assignments = [
      [this.horizon, ASSETS.GAME_BG_PLANET],
      [this.bigPlanet, ASSETS.GAME_PARALLAX_BIG_PLANET],
      [this.ringPlanet, ASSETS.GAME_PARALLAX_RING_PLANET]
    ] as const;
    for (const [sprite, url] of assignments) {
      const texture = this.textureBank.get(url) ?? await this.textureBank.load(url).catch(() => null);
      if (texture && !this.destroyed) sprite.texture = texture;
    }
  }

  get canvas() {
    return this.app.canvas;
  }

  resize(width: number, height: number) {
    if (this.destroyed) return;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    if (this.app.renderer) this.app.renderer.resize(this.width, this.height);

    this.backgroundFill.clear().rect(0, 0, this.width, this.height).fill('#020617');
    this.sectorTint.clear().rect(0, 0, this.width, this.height).fill({ color: '#0f172a', alpha: 0 });
    this.flashOverlay.clear().rect(0, 0, this.width, this.height).fill({ color: '#f87171', alpha: 1 });

    this.horizon.anchor.set(0.5, 1);
    this.horizon.position.set(this.width / 2, this.height + Math.max(80, this.height * 0.15));
    this.horizon.width = this.width;
    this.horizon.height = Math.max(240, this.height * 0.34);
    this.horizon.alpha = 0.52;

    this.bigPlanet.anchor.set(0.5);
    this.bigPlanet.width = this.width < 620 ? 150 : 210;
    this.bigPlanet.height = this.bigPlanet.width;
    this.bigPlanet.position.set(this.width - this.bigPlanet.width * 0.5, 130);
    this.bigPlanet.alpha = 0.52;

    this.ringPlanet.anchor.set(0.5);
    this.ringPlanet.width = this.width < 620 ? 72 : 110;
    this.ringPlanet.height = this.ringPlanet.width * 1.8;
    this.ringPlanet.alpha = 0.62;

    for (const layer of this.parallaxLayers) {
      for (const sprite of layer.sprites) {
        sprite.width = this.width;
        sprite.height = this.height + 4;
        sprite.alpha = layer.alpha;
      }
    }

    for (let index = 0; index < this.stars.length; index++) {
      const star = this.stars[index];
      star.sprite.x = (index * 79.31) % this.width;
      star.sprite.y = (index * 131.77) % this.height;
    }

    this.drawScanlines();
  }

  private drawScanlines() {
    this.scanlines.clear();
    if (this.width < 340) return;
    for (let y = 0; y < this.height; y += 5) {
      this.scanlines.rect(0, y, this.width, 1).fill({ color: '#0ea5e9', alpha: 0.018 });
    }
  }

  private applyBackgroundTextures() {
    for (const layer of this.parallaxLayers) {
      const texture = this.textureBank.get(layer.textureKey);
      if (!texture) continue;
      layer.sprites[0].texture = texture;
      layer.sprites[1].texture = texture;
    }
    const horizon = this.textureBank.get(ASSETS.GAME_BG_PLANET);
    const bigPlanet = this.textureBank.get(ASSETS.GAME_PARALLAX_BIG_PLANET);
    const ringPlanet = this.textureBank.get(ASSETS.GAME_PARALLAX_RING_PLANET);
    if (horizon) this.horizon.texture = horizon;
    if (bigPlanet) this.bigPlanet.texture = bigPlanet;
    if (ringPlanet) this.ringPlanet.texture = ringPlanet;
  }

  private updateBackground(engine: GameEngine) {
    const lowQuality = engine.performanceMode;
    for (let index = 0; index < this.parallaxLayers.length; index++) {
      const layer = this.parallaxLayers[index];
      const offset = -((engine.frameCount * layer.speed) % this.height);
      layer.root.visible = !(lowQuality && (index === 1 || index === 2));
      layer.sprites[0].position.set(0, offset);
      layer.sprites[1].position.set(0, offset + this.height);
    }

    for (let index = 0; index < this.stars.length; index++) {
      const star = this.stars[index];
      star.sprite.visible = !lowQuality || index % 2 === 0;
      star.sprite.y = (star.sprite.y + star.speed) % this.height;
      star.sprite.alpha = clamp(0.28 + Math.sin(engine.frameCount * 0.025 + star.phase) * 0.22, 0.08, 0.78);
    }

    const wave = Math.max(1, engine.wave);
    const tints = ['#082f49', '#312e81', '#713f12', '#064e3b'];
    this.sectorTint.clear().rect(0, 0, this.width, this.height).fill({ color: tints[(wave - 1) % tints.length], alpha: lowQuality ? 0.075 : 0.115 });
    this.bigPlanet.y = 125 + Math.sin(engine.frameCount * 0.008) * 12;
    this.ringPlanet.position.set(
      this.width + 80 - ((engine.frameCount * 0.16) % (this.width + 180)),
      190 + Math.sin(engine.frameCount * 0.012) * 18
    );
    this.horizon.alpha = lowQuality ? 0.34 : 0.52;
  }

  private createEntityView(entity: Entity) {
    const pool = this.recycledViews.get(entity.type);
    const reused = pool?.pop();
    if (reused) {
      reused.id = entity.id;
      reused.root.visible = true;
      reused.root.alpha = 1;
      reused.textureKey = null;
      reused.textureRequest++;
      reused.lastHp = entity.hp;
      reused.lastFlashFrames = 0;
      reused.lastMarkedForDeletion = false;
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
    sprite.anchor.set(0.5);
    label.anchor.set(0.5);
    root.addChild(trail, aura, sprite, body, flash, health, label);
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
      seenFrame: this.renderFrame
    };
    this.layers[getEntityLayer(entity.type)].addChild(root);
    return view;
  }

  private releaseEntityView(view: EntityView) {
    view.root.visible = false;
    view.sprite.texture = Texture.WHITE;
    view.textureKey = null;
    view.textureRequest++;
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
    if (entity.type !== EntityType.BOSS && entity.type !== EntityType.MINI_BOSS && entity.type !== EntityType.ENEMY_INVADER) return;

    const width = entity.type === EntityType.ENEMY_INVADER ? entity.width * 0.92 : entity.width;
    const y = -entity.height * 0.5 - 18;
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    view.health.roundRect(-width / 2, y, width, 8, 4).fill({ color: '#020617', alpha: 0.94 });
    view.health.roundRect(-width / 2 + 1, y + 1, Math.max(0, (width - 2) * progress), 6, 3)
      .fill(progress > 0.55 ? '#34d399' : progress > 0.25 ? '#facc15' : '#fb7185');
    view.health.roundRect(-width / 2, y, width, 8, 4).stroke({ color: '#bae6fd', width: 1, alpha: 0.75 });

    if (entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS) {
      view.label.text = entity.type === EntityType.BOSS ? 'GATEKEEPER SENTINEL' : 'BOTTLENECK DRONE';
      view.label.style.fill = entity.type === EntityType.BOSS ? '#fef08a' : '#fda4af';
      view.label.position.set(0, y - 13);
    }
  }

  private drawFallbackBody(view: EntityView, entity: Entity) {
    view.body.clear();
    if (view.sprite.visible) return;
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
  }

  private drawProjectile(view: EntityView, entity: Entity) {
    view.body.clear();
    view.trail.clear();
    view.aura.clear();
    view.sprite.visible = false;
    const playerShot = entity.isPlayerShot;
    const color = entity.color || (playerShot ? '#67e8f9' : '#fb7185');
    const speed = Math.max(1, Math.hypot(entity.vx, entity.vy));
    const nx = -entity.vx / speed;
    const ny = -entity.vy / speed;
    const strong = entity.weaponKind === 'nova' || entity.weaponKind === 'singularity' || entity.weaponKind === 'btc-hash';
    const trailLength = clamp(speed * (strong ? 7 : 4.5), 12, strong ? 78 : 46);

    view.trail.moveTo(0, 0).lineTo(nx * trailLength, ny * trailLength)
      .stroke({ color, width: Math.max(2, entity.width * (strong ? 0.7 : 0.42)), alpha: playerShot ? 0.48 : 0.3 });
    view.trail.moveTo(0, 0).lineTo(nx * trailLength * 0.55, ny * trailLength * 0.55)
      .stroke({ color: '#ffffff', width: Math.max(1, entity.width * 0.18), alpha: 0.72 });

    if (entity.isBeam) {
      view.aura.roundRect(-entity.width * 0.58, -entity.height * 0.5, entity.width * 1.16, entity.height, Math.min(12, entity.width * 0.4))
        .fill({ color, alpha: 0.28 });
      view.body.roundRect(-entity.width * 0.2, -entity.height * 0.5, entity.width * 0.4, entity.height, Math.min(8, entity.width * 0.25))
        .fill('#ffffff');
      return;
    }

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
    const speedLevel = clamp(Math.floor(engine.stats.upgrades.speed || 0), 0, PLAYER_THRUSTER_COLORS.length - 1);
    const [core, edge] = PLAYER_THRUSTER_COLORS[speedLevel];
    const movement = Math.hypot(engine.playerVel.x, engine.playerVel.y);
    const cinematic = engine.introFlightFrames > 0 || engine.waveDepartureFrames > 0;
    const length = entity.height * (0.24 + Math.min(1, movement / 7) * 0.16 + speedLevel * 0.015) * (cinematic ? 1.45 : 1);
    const nozzleY = entity.height * 0.3;
    const spread = entity.width * 0.16;
    const flicker = 0.82 + Math.sin(engine.frameCount * 0.6) * 0.14;

    for (const side of [-1, 1]) {
      const x = side * spread;
      view.trail.moveTo(x - entity.width * 0.042, nozzleY)
        .lineTo(x + entity.width * 0.042, nozzleY)
        .lineTo(x + entity.width * 0.018, nozzleY + length * flicker)
        .lineTo(x - entity.width * 0.018, nozzleY + length * flicker)
        .closePath();
      view.trail.fill({ color: edge, alpha: 0.78 });
      view.trail.roundRect(x - entity.width * 0.014, nozzleY, entity.width * 0.028, length * 0.72, entity.width * 0.014)
        .fill({ color: core, alpha: 0.98 });
      view.trail.circle(x, nozzleY + length * 0.72, Math.max(2, entity.width * 0.024)).fill({ color: '#ffffff', alpha: 0.96 });
    }

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

    view.root.rotation = engine.playerTilt;
    const squash = clamp(engine.playerSquash, -0.24, 0.24);
    view.root.scale.set(engine.playerDrawScale * (1 + squash * 0.5), engine.playerDrawScale * (1 - squash * 0.38));
    view.root.alpha = engine.playerDrawAlpha;
  }

  private drawBossRig(view: EntityView, entity: Entity, engine: GameEngine) {
    view.aura.clear();
    const progress = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
    const shieldCount = engine.getBossShieldCount();
    const pulse = 0.86 + Math.sin(engine.frameCount * 0.08) * 0.14;
    const phaseColor = progress > 0.66 ? '#67e8f9' : progress > 0.33 ? '#facc15' : '#fb7185';
    view.aura.circle(0, entity.height * 0.06, entity.width * 0.18 * pulse).fill({ color: phaseColor, alpha: entity.isCharging ? 0.42 : 0.18 });
    view.aura.circle(0, entity.height * 0.06, entity.width * 0.25 * pulse).stroke({ color: phaseColor, width: 2, alpha: 0.78 });
    view.aura.ellipse(0, entity.height * 0.16, entity.width * 0.38, entity.height * 0.12)
      .stroke({ color: phaseColor, width: 2, alpha: 0.62 });
    if (shieldCount > 0) {
      view.aura.ellipse(0, entity.height * 0.08, entity.width * 0.64 * pulse, entity.height * 0.38 * pulse)
        .stroke({ color: '#a7f3d0', width: 3, alpha: 0.72 });
      view.aura.ellipse(0, entity.height * 0.08, entity.width * 0.74, entity.height * 0.46)
        .stroke({ color: '#67e8f9', width: 1, alpha: 0.34 });
    }

    const phase = progress > 0.66 ? 0 : progress > 0.33 ? 1 : 2;
    const previousPhase = this.seenBossPhase.get(entity.id);
    if (previousPhase !== undefined && phase > previousPhase) {
      this.effectPool.spawnExplosion(entity.x + entity.width / 2, entity.y + entity.height / 2, entity.width * 0.75, phaseColor, 1.5);
    }
    this.seenBossPhase.set(entity.id, phase);
    if (progress < 0.52 && engine.frameCount % (engine.performanceMode ? 48 : 30) === 0) {
      this.effectPool.spawn('smoke', entity.x + entity.width * (0.25 + Math.random() * 0.5), entity.y + entity.height * (0.35 + Math.random() * 0.4), entity.width * 0.18, '#475569', 800);
      this.effectPool.spawn('spark', entity.x + entity.width * Math.random(), entity.y + entity.height * Math.random(), Math.max(3, entity.width * 0.035), phaseColor, 380);
    }
  }

  private drawFlash(view: EntityView, entity: Entity) {
    view.flash.clear();
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
    view.label.text = '';
    view.trail.clear();
    view.aura.clear();
    view.body.clear();
    view.flash.clear();
    view.health.clear();

    if (entity.type === EntityType.PROJECTILE || entity.type === EntityType.MISSILE) {
      this.drawProjectile(view, entity);
    } else if (entity.type === EntityType.EFFECT) {
      view.sprite.visible = false;
      const effect = entity as VisualEffect;
      if (effect.effectType === 'text') {
        view.label.text = effect.text ?? '';
        view.label.style.fontSize = effect.fontSize;
        view.label.style.fill = effect.color;
        view.label.alpha = clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
      } else {
        const progress = 1 - clamp(effect.life / Math.max(1, effect.maxLife), 0, 1);
        view.body.circle(0, 0, 10 + progress * 80).stroke({ color: effect.color, width: Math.max(1, 3 * (1 - progress)), alpha: 1 - progress });
      }
    } else if (entity.type === EntityType.PARTICLE) {
      view.sprite.visible = false;
      view.body.rect(-entity.width / 2, -entity.height / 2, entity.width, entity.height).fill({
        color: entity.color,
        alpha: clamp(entity.life / Math.max(1, entity.maxLife), 0, 1)
      });
    } else {
      const textureKey = getDefaultEntityTexture(engine, entity);
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
      view.sprite.y = Math.sin(engine.frameCount * 0.04) * 5;
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
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.03) * 0.2;
    } else if (entity.type === EntityType.ENEMY_JOURNAL || entity.type === EntityType.ENEMY_INVADER) {
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.05) * 0.09;
    } else if (entity.type === EntityType.COIN) {
      const spin = Math.max(0.16, Math.abs(Math.sin((engine.frameCount + entity.variant) * 0.16)));
      view.root.scale.set(spin, 1);
      view.root.rotation = (engine.frameCount + entity.variant) * 0.025;
    } else if (entity.type === EntityType.BOMB) {
      const pulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.18) * 0.08;
      view.root.scale.set(pulse);
      view.root.rotation = Math.sin((engine.frameCount + entity.variant) * 0.045) * 0.12;
    } else if (entity.type === EntityType.POWERUP) {
      const pulse = 1 + Math.sin((engine.frameCount + entity.variant) * 0.14) * 0.08;
      view.root.scale.set(pulse);
      view.aura.circle(0, 0, entity.width * 0.55).fill({ color: '#67e8f9', alpha: 0.11 });
      view.aura.circle(0, 0, entity.width * 0.52).stroke({ color: '#ffffff', width: 2, alpha: 0.74 });
    }

    this.drawHealthBar(view, entity);
    this.drawFlash(view, entity);

    if (entity.flashFrames > view.lastFlashFrames + 2) {
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
        this.effectPool.spawnExplosion(view.root.x, view.root.y, size, view.type === EntityType.BOSS ? '#fef08a' : '#67e8f9', view.type === EntityType.BOSS ? 2.2 : 0.85);
      }
      this.views.delete(id);
      this.seenBossPhase.delete(id);
      this.releaseEntityView(view);
    }
  }

  private syncGunPods(engine: GameEngine) {
    const key = '__gun-pods__';
    let view = this.views.get(key);
    const offsets = engine.getGunPodOffsets();
    if (offsets.length === 0 || engine.lives <= 0) {
      if (view) view.root.visible = false;
      return;
    }
    if (!view) {
      const dummy = new Entity(EntityType.PLAYER, 0, 0);
      view = this.createEntityView(dummy);
      view.id = key;
      view.type = EntityType.PLAYER;
      view.sprite.visible = false;
      this.views.set(key, view);
    }
    view.seenFrame = this.renderFrame;
    view.root.visible = true;
    view.root.position.set(0, 0);
    view.root.rotation = 0;
    view.root.scale.set(1);
    view.root.alpha = engine.playerDrawAlpha;
    view.body.clear();
    view.aura.clear();
    view.trail.clear();
    view.flash.clear();
    view.health.clear();
    view.label.text = '';

    const centerX = engine.player.x + engine.player.width / 2;
    const centerY = engine.player.y + engine.player.height / 2;
    const triple = engine.activePowerups.has(PowerupType.TRIPLE_SHOT);
    const remaining = triple
      ? engine.activePowerups.get(PowerupType.TRIPLE_SHOT) || 0
      : engine.activePowerups.get(PowerupType.DOUBLE_SHOT) || 0;
    const fade = clamp(remaining / 36, 0, 1);
    const color = triple ? '#a78bfa' : '#facc15';
    for (const offset of offsets) {
      const x = centerX + offset;
      const y = centerY + 10 + Math.sin(engine.frameCount * 0.08 + offset) * 4;
      view.body.roundRect(x - 15, y - 11, 30, 22, 5).fill('#0f172a').stroke({ color, width: 1.5, alpha: fade });
      view.body.rect(x - 4, y - 22, 8, 17).fill('#cbd5e1');
      view.body.rect(x - 2, y - 22, 4, 15).fill(color);
      view.body.circle(x, y, 4).fill('#ecfeff');
      view.trail.roundRect(x - 2, y + 9, 4, 16 + Math.sin(engine.frameCount * 0.5 + offset) * 3, 2)
        .fill({ color: '#22d3ee', alpha: 0.8 * fade });
    }
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
    const texture = this.textureBank.get(engine.playerShipUrl);
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
      sprite.rotation = afterimage.rotation;
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
    this.warningText.visible = active;
    this.warningSubtext.visible = active;
    if (!active) return;

    const elapsed = engine.bossWarningDuration - engine.bossWarningFrame;
    const pulse = 0.42 + Math.abs(Math.sin(elapsed * 0.18)) * 0.32;
    const mainBoss = engine.pendingBossType === 'gatekeeper';
    const title = mainBoss ? 'GATEKEEPER SIGNAL' : engine.pendingBossType === 'wall' ? 'PAYWALL BREACH' : 'BOTTLENECK DETECTED';
    const subtitle = mainBoss ? 'PEER REVIEW SENTINEL ENTERING THE SECTOR' : 'HOSTILE RESEARCH INTERFERENCE INBOUND';

    this.warningShade.clear().rect(0, 0, this.width, this.height).fill({ color: '#7f1d1d', alpha: pulse * 0.18 });
    this.warningFrame.clear();
    this.warningFrame.rect(8, 8, this.width - 16, this.height - 16).stroke({ color: '#fb7185', width: 4, alpha: pulse });
    this.warningFrame.rect(18, 18, this.width - 36, this.height - 36).stroke({ color: '#fef08a', width: 1, alpha: pulse * 0.75 });
    for (let y = 0; y < this.height; y += 48) {
      this.warningFrame.moveTo(0, y).lineTo(20, y - 20).stroke({ color: '#fb7185', width: 7, alpha: pulse * 0.62 });
      this.warningFrame.moveTo(this.width, y).lineTo(this.width - 20, y - 20).stroke({ color: '#fb7185', width: 7, alpha: pulse * 0.62 });
    }
    this.warningText.text = title;
    this.warningText.style.fontSize = this.width < 520 ? 24 : 34;
    this.warningText.position.set(this.width / 2, this.height * 0.34);
    this.warningText.alpha = pulse + 0.2;
    this.warningSubtext.text = subtitle;
    this.warningSubtext.position.set(this.width / 2, this.height * 0.34 + 44);
    this.warningSubtext.alpha = 0.82;
  }

  sync(engine: GameEngine, timestamp = performance.now()) {
    if (!this.initialized || this.destroyed) return;
    this.renderFrame++;
    const deltaMs = this.lastTimestamp ? clamp(timestamp - this.lastTimestamp, 0, 50) : 16.667;
    this.lastTimestamp = timestamp;
    this.camera.position.set(engine.shakeX, engine.shakeY);
    this.updateBackground(engine);
    this.syncEntities(engine);
    this.syncPlayerAfterimages(engine);
    this.syncGunPods(engine);
    this.syncResearchBeam(engine);
    this.updateWarnings(engine);
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
    this.views.clear();
    this.recycledViews.clear();
    this.parallaxLayers.length = 0;
    this.stars.length = 0;
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
