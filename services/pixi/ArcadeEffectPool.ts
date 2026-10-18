import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { createSoftRadialLight, hideSoftRadialLight, showSoftRadialLight, type SoftRadialLight } from './SoftRadialLight';
// REVAMP(A): Shared tuning keeps the game and FX lab on the same bounded pool.
import { impactSparkVelocity, scoreSparkPosition, type ExplosionTier } from '../revamp/feel/FeelEffects';
// REVAMP(J): Animated rings and puffs share retained geometry instead of rebuilding every frame.
import { EffectGeometryCache, effectGeometryFrame, EFFECT_GEOMETRY_FRAME_COUNT } from '../revamp/performance/EffectGeometryCache';
// REVAMP(S): All kill fire/smoke/rings share a nearest pixel atlas and this pool's budget.
import { PixelExplosionRenderer, type PixelExplosionParticle } from '../revamp/vfx/PixelExplosionRenderer';
import type { PixelExplosionTier } from '../revamp/vfx/PixelExplosionAtlas';

export type ArcadeEffectKind =
  | 'pixel-explosion'
  | 'burst'
  | 'ring'
  | 'spark'
  | 'shockwave'
  | 'muzzle'
  | 'smoke'
  | 'debris'
  | 'sprite-explosion'
  | 'boss-sprite-explosion'
  | 'sprite-debris'
  | 'score-spark'
  | 'armor-ting';

type PooledEffect = {
  root: Container;
  pixel: PixelExplosionParticle | null;
  graphic: Graphics;
  scratchContext: Graphics['context'] | null;
  geometryKey: string | null;
  sprite: Sprite;
  kind: ArcadeEffectKind;
  age: number;
  duration: number;
  size: number;
  color: string;
  velocityX: number;
  velocityY: number;
  spin: number;
  active: boolean;
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  bend: number;
};

type PooledLight = SoftRadialLight & {
  age: number;
  duration: number;
  size: number;
  color: string;
  intensity: number;
  active: boolean;
};

const MAX_POOLED_LIGHTS = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A bounded presentation-only pool. It never owns gameplay entities. */
export class ArcadeEffectPool {
  private readonly effects: PooledEffect[] = [];
  private readonly lights: PooledLight[] = [];
  private explosionTextures: Texture[] = [];
  private bossExplosionTextures: Texture[] = [];
  private maxEffects = 150;
  private maxLights = MAX_POOLED_LIGHTS;
  private reducedMotion = false;
  private readonly sparkPosition = { x: 0, y: 0 };
  private readonly geometry = new EffectGeometryCache<Graphics['context']>();
  private readonly pixelExplosions = new PixelExplosionRenderer((x, y, size, duration) =>
    this.spawn('pixel-explosion', x, y, size, '#ffffff', duration));

  constructor(private readonly layer: Container) {
    for (let index = 0; index < MAX_POOLED_LIGHTS; index++) {
      const visual = createSoftRadialLight();
      this.lights.push({
        ...visual,
        age: 0,
        duration: 1,
        size: 1,
        color: '#ffffff',
        intensity: 0,
        active: false
      });
      this.layer.addChild(visual.root);
    }
  }

  setExplosionTextures(textures: Texture[]) {
    this.explosionTextures = textures.filter((texture) => texture !== Texture.EMPTY);
  }

  setBossExplosionTextures(textures: Texture[]) {
    this.bossExplosionTextures = textures.filter((texture) => texture !== Texture.EMPTY);
  }

  /** Lightweight counters for FX lab/performance assertions; no entity exposure. */
  getStats() {
    return {
      active: this.effects.filter((effect) => effect.active).length,
      allocated: this.effects.length,
      cap: this.maxEffects,
      lights: this.lights.filter((light) => light.active).length,
      lightCap: this.maxLights,
      geometry: this.geometry.getStats(),
      pixel: this.pixelExplosions.getStats()
    };
  }

  setQuality(performanceMode: boolean, mobileProfile: boolean, qualityScale = 1) {
    this.maxEffects = performanceMode
      ? (mobileProfile ? 54 : 84)
      : (mobileProfile ? 104 : 170);
    this.maxLights = performanceMode
      ? (mobileProfile ? 3 : 6)
      : (mobileProfile ? 5 : MAX_POOLED_LIGHTS);
    // REVAMP(A): Sustained frame pressure reduces both allocation and live work.
    const scale = Number.isFinite(qualityScale) ? clamp(qualityScale, 0.4, 1) : 1;
    this.pixelExplosions.setQuality(scale * (performanceMode ? 0.55 : 1));
    this.maxEffects = Math.max(16, Math.floor(this.maxEffects * scale));
    this.maxLights = Math.max(1, Math.floor(this.maxLights * scale));

    // Adaptive quality can step down after a busy scene has already expanded
    // the pool. Retire the overflow immediately so the new cap is real rather
    // than merely limiting future allocations.
    for (let index = this.maxEffects; index < this.effects.length; index++) {
      this.effects[index].active = false;
      this.effects[index].root.visible = false;
      this.releaseGeometry(this.effects[index]);
    }
    for (let index = this.maxLights; index < this.lights.length; index++) {
      this.lights[index].active = false;
      hideSoftRadialLight(this.lights[index]);
    }
  }

  private usesAdditiveBlend(kind: ArcadeEffectKind) {
    return kind !== 'smoke' && kind !== 'debris' && kind !== 'sprite-debris';
  }

  private acquire(kind: ArcadeEffectKind) {
    const reusableCount = Math.min(this.effects.length, this.maxEffects);
    let effect: PooledEffect | undefined;
    let oldest: PooledEffect | undefined;
    for (let index = 0; index < reusableCount; index++) {
      const candidate = this.effects[index];
      if (!candidate.active) {
        effect = candidate;
        break;
      }
      if (!oldest || candidate.age > oldest.age) oldest = candidate;
    }
    if (!effect && reusableCount >= this.maxEffects) {
      effect = oldest;
    }
    if (!effect) {
      const root = new Container();
      const graphic = new Graphics();
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      root.addChild(graphic, sprite);
      root.eventMode = 'none';
      effect = {
        root,
        pixel: null,
        graphic,
        scratchContext: graphic.context ?? null,
        geometryKey: null,
        sprite,
        kind,
        age: 0,
        duration: 1,
        size: 1,
        color: '#ffffff',
        velocityX: 0,
        velocityY: 0,
        spin: 0,
        active: false,
        targetX: 0,
        targetY: 0,
        startX: 0,
        startY: 0,
        bend: 0
      };
      this.effects.push(effect);
      this.layer.addChild(root);
    }
    effect.active = true;
    effect.pixel = null;
    effect.root.visible = true;
    effect.root.alpha = 1;
    effect.root.scale.set(1);
    effect.root.rotation = 0;
    this.releaseGeometry(effect);
    effect.graphic.clear();
    effect.graphic.blendMode = this.usesAdditiveBlend(kind) ? 'add' : 'normal';
    effect.sprite.visible = false;
    effect.sprite.texture = Texture.WHITE;
    effect.sprite.tint = '#ffffff';
    effect.sprite.blendMode = 'normal';
    return effect;
  }

  private acquireLight() {
    let oldest: PooledLight | null = null;
    for (let index = 0; index < this.maxLights; index++) {
      const light = this.lights[index];
      if (!light.active) return light;
      if (!oldest || light.age > oldest.age) oldest = light;
    }
    return oldest;
  }

  spawnLightPulse(
    x: number,
    y: number,
    size: number,
    color: string,
    intensity = 0.35,
    duration = 180
  ) {
    const light = this.acquireLight();
    if (!light) return;
    light.age = 0;
    light.duration = Math.max(1, duration);
    light.size = Math.max(1, size);
    light.color = color;
    light.intensity = clamp(intensity, 0, 0.82);
    light.active = true;
    light.root.position.set(x, y);
    this.drawLight(light, 0);
  }

  spawn(kind: ArcadeEffectKind, x: number, y: number, size: number, color: string, duration = 360) {
    const effect = this.acquire(kind);
    effect.kind = kind;
    effect.age = 0;
    effect.duration = Math.max(1, duration);
    effect.size = Math.max(0.5, size);
    effect.color = color;
    effect.velocityX = kind === 'spark' || kind === 'debris' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.velocityY = kind === 'smoke' ? -0.24 : kind === 'spark' || kind === 'debris' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.spin = kind === 'pixel-explosion' ? 0 : (Math.random() - 0.5) * (kind === 'debris' ? 0.16 : 0.08);
    effect.targetX = effect.startX = x;
    effect.targetY = effect.startY = y;
    effect.bend = 0;
    effect.root.position.set(x, y);
    this.drawEffect(effect, 0);
    return effect;
  }

  /** REVAMP(S): Reusable API for authored boss chains and ordinary kill receipts. */
  spawnPixelExplosion(x: number, y: number, size: number, tier: PixelExplosionTier, seed?: number) {
    return this.pixelExplosions.spawn(x, y, size, tier, seed); // REVAMP(T): Tail duration for completion.
  }

  setReducedMotion(reduced: boolean) { this.reducedMotion = reduced; this.pixelExplosions.setReducedMotion(reduced); }

  spawnTieredExplosion(x: number, y: number, size: number, tier: ExplosionTier, _color = '#67e8f9') {
    this.spawnLightPulse(x, y, Math.min(112, size * 0.8), '#ffbb55', this.reducedMotion ? 0.025 : 0.10, 110);
    this.spawnPixelExplosion(x, y, size, tier === 'boss-part' ? 'large' : tier === 'elite' ? 'medium' : 'small');
  }

  /** Cosmetic bullet-cancel reward; currency and hitboxes stay in simulation. */
  spawnScoreSpark(x: number, y: number, targetX: number, targetY: number) {
    const spark = this.spawn('score-spark', x, y, 3.2, '#fef08a', 420 + Math.random() * 220);
    spark.targetX = targetX;
    spark.targetY = targetY;
    spark.bend = (Math.random() - 0.5) * 100;
    spark.spin = 0.08;
  }

  spawnMuzzle(x: number, y: number, size = 12, vx = 0, vy = -1, color = '#67e8f9') {
    const muzzle = this.spawn('muzzle', x, y, size, color, 65);
    muzzle.root.rotation = Math.atan2(vy, vx) + Math.PI / 2;
    muzzle.spin = 0;
  }

  spawnPickupRing(x: number, y: number, power: boolean) {
    const color = power ? '#67e8f9' : '#fde68a';
    this.spawn('ring', x, y, power ? 48 : 20, color, power ? 360 : 190);
    this.spawnLightPulse(x, y, power ? 70 : 30, color, power ? 0.26 : 0.12, power ? 220 : 110);
  }

  spawnExplosion(x: number, y: number, size: number, _color = '#67e8f9', intensity = 1) {
    this.spawnLightPulse(x, y, Math.min(142, size * 0.8), '#ffbb55', this.reducedMotion ? 0.025 : 0.12, 130);
    this.spawnPixelExplosion(x, y, size, intensity >= 2 || size >= 150 ? 'large' : size >= 54 ? 'medium' : 'small');
  }

  spawnBossExplosion(x: number, y: number, size: number, intensity = 1) {
    this.spawnLightPulse(x, y, Math.min(156, size * 0.8), '#ffbb55', this.reducedMotion ? 0.03 : 0.16, 150);
    this.spawnPixelExplosion(x, y, size, intensity >= 2 || size >= 190 ? 'mega' : size >= 72 ? 'large' : 'medium');
  }

  spawnEnemyExplosion(x: number, y: number, size: number, color = '#67e8f9') {
    this.spawnTieredExplosion(x, y, size, 'small', color);
  }

  spawnDetachedSprite(texture: Texture, x: number, y: number, width: number, height: number, direction: number) {
    if (texture === Texture.EMPTY) return;
    const effect = this.spawn('sprite-debris', x, y, Math.max(width, height), '#ffffff', 760);
    effect.sprite.texture = texture;
    effect.sprite.visible = true;
    effect.sprite.width = width;
    effect.sprite.height = height;
    effect.velocityX = direction * (1.4 + Math.random() * 0.8);
    effect.velocityY = -1.3 - Math.random() * 0.8;
    effect.spin = direction * (0.055 + Math.random() * 0.035);
  }

  spawnImpact(x: number, y: number, size: number, color = '#67e8f9') {
    this.spawnLightPulse(x, y, Math.min(92, size * 1.6), color, 0.18, 105);
    this.spawnSpriteExplosion(x, y, size, 160);
  }

  /** A short, local pixel hit; regular fire must not fill the arena with rings. */
  spawnProjectileHit(x: number, y: number, size: number, color: string, vx: number, vy: number, reducedEffects: boolean, armored = false) {
    if (armored) {
      const ting = this.spawn('armor-ting', x, y, Math.min(11, size * 0.5), '#fef08a', 120);
      ting.spin = 0;
      ting.root.rotation = Math.atan2(vy, vx) + Math.PI / 2;
    } else {
      this.spawnBossSpriteExplosion(x, y, Math.min(26, size), reducedEffects ? 100 : 135);
    }
    for (let index = 0; index < (reducedEffects ? 2 : armored ? 4 : 3); index++) {
      const velocity = impactSparkVelocity(vx, vy, index, armored);
      const spark = this.spawn('spark', x, y, armored ? 1.5 : 1.8, index === 0 ? '#ffffff' : armored ? '#fef08a' : color, 110 + index * 22);
      spark.velocityX = velocity.x;
      spark.velocityY = velocity.y;
      spark.root.rotation = Math.atan2(velocity.y, velocity.x) + Math.PI / 2;
      spark.spin = 0;
    }
  }

  /**
   * Plays the registered five-frame pixel damage pop without procedural lines,
   * shockwaves, lights, or new gameplay entities. Used for recurring boss wear.
   */
  spawnBossDamageSprite(x: number, y: number, size: number, duration = 220) {
    this.spawnBossSpriteExplosion(x, y, size, duration);
  }

  private drawLight(light: PooledLight, progress: number) {
    const fade = 1 - progress;
    const radius = light.size * (0.58 + progress * 0.42);
    const alpha = light.intensity * fade * fade;
    showSoftRadialLight(
      light,
      light.root.x,
      light.root.y,
      radius,
      radius * (0.82 + progress * 0.08),
      light.color,
      alpha,
      0.5 * fade
    );
  }

  private spawnSpriteExplosion(x: number, y: number, size: number, duration: number) {
    if (this.explosionTextures.length === 0) return;
    const effect = this.spawn('sprite-explosion', x, y, size, '#ffffff', duration);
    effect.spin = (Math.random() - 0.5) * 0.035;
  }

  private spawnBossSpriteExplosion(x: number, y: number, size: number, duration: number) {
    if (this.bossExplosionTextures.length === 0) {
      this.spawnSpriteExplosion(x, y, size, duration);
      return;
    }
    const effect = this.spawn('boss-sprite-explosion', x, y, size, '#ffffff', duration);
    effect.spin = (Math.random() - 0.5) * 0.025;
  }

  private drawEffect(effect: PooledEffect, progress: number) {
    if (effect.kind === 'pixel-explosion') { this.pixelExplosions.draw(effect); return; }
    // Fixed particle geometry is uploaded once; animation only changes transforms.
    if (progress > 0 && (effect.kind === 'spark' || effect.kind === 'debris' || effect.kind === 'score-spark' || effect.kind === 'armor-ting')) return;
    // REVAMP(J): The sprite branches only change textures/transforms. Their empty
    // scratch geometry was cleared on acquisition and needs no per-frame upload.
    if (this.drawCachedGeometry(effect, progress)) return;
    const graphic = effect.graphic;
    effect.sprite.visible = false;

    if (effect.kind === 'sprite-explosion' || effect.kind === 'boss-sprite-explosion') {
      const textures = effect.kind === 'boss-sprite-explosion'
        ? this.bossExplosionTextures
        : this.explosionTextures;
      if (textures.length === 0) return;
      const frameIndex = Math.min(
        textures.length - 1,
        // REVAMP(I): Fast ignition, full middle-frame punch, then lingering embers.
        Math.floor(Math.pow(progress, 0.78) * textures.length)
      );
      effect.sprite.texture = textures[frameIndex];
      effect.sprite.visible = true;
      const scale = progress < 0.14 ? 0.78 : progress < 0.5 ? 1.12 : 1;
      effect.sprite.width = effect.size * scale;
      effect.sprite.height = effect.size * scale;
      return;
    }

    if (effect.kind === 'sprite-debris') {
      effect.sprite.visible = true;
      return;
    }

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

    if (effect.kind === 'score-spark' || effect.kind === 'armor-ting') {
      const size = effect.size;
      graphic.moveTo(0, -size * 1.8).lineTo(size * 0.3, -size * 0.3)
        .lineTo(size, 0).lineTo(size * 0.3, size * 0.3)
        .lineTo(0, size * 1.8).lineTo(-size * 0.3, size * 0.3)
        .lineTo(-size, 0).lineTo(-size * 0.3, -size * 0.3).closePath()
        .fill({ color: effect.color, alpha: 0.92 });
      graphic.circle(0, 0, size * 0.25).fill({ color: '#ffffff', alpha: 1 });
      if (effect.kind === 'armor-ting') graphic.circle(0, 0, size * 0.7).stroke({ color: '#dbeafe', alpha: 0.75, width: 1 });
      return;
    }

    if (effect.kind === 'debris') {
      graphic.moveTo(0, -effect.size).lineTo(effect.size * 0.7, effect.size * 0.65)
        .lineTo(-effect.size * 0.55, effect.size * 0.42).closePath()
        .fill({ color: effect.color, alpha: 0.9 })
        .stroke({ color: '#e2e8f0', width: 0.7, alpha: 0.55 });
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

  private releaseGeometry(effect: PooledEffect) {
    if (effect.geometryKey === null) return;
    // Detach before releasing: an evicted context must never still be displayed.
    if (effect.scratchContext) effect.graphic.context = effect.scratchContext;
    this.geometry.release(effect.geometryKey);
    effect.geometryKey = null;
  }

  private drawCachedGeometry(effect: PooledEffect, progress: number) {
    const kind = effect.kind;
    if (kind !== 'ring' && kind !== 'shockwave' && kind !== 'muzzle' && kind !== 'smoke') return false;
    // Minimal non-GPU consumers can supply a Graphics facade without a context.
    const scratch = effect.scratchContext;
    if (!scratch) return false;
    const frame = effectGeometryFrame(progress);
    const key = `${kind}:${effect.size}:${effect.color}:${frame}`;
    if (effect.geometryKey === key) return true;
    const sampledProgress = frame / EFFECT_GEOMETRY_FRAME_COUNT;
    const context = this.geometry.acquire(key, () => {
      // Clone the empty owned context directly, avoiding a temporary display
      // object and its context event listeners for every cached shape.
      const shape = scratch.clone();
      const size = effect.size;
      if (kind === 'ring' || kind === 'shockwave') {
        const radius = size * (0.16 + sampledProgress * 0.84);
        shape.circle(0, 0, radius).stroke({ color: effect.color,
          width: Math.max(1, size * 0.045 * (1 - sampledProgress)), alpha: 0.95 });
        if (kind === 'shockwave') shape.circle(0, 0, radius * 0.7)
          .stroke({ color: '#ffffff', width: 1.5, alpha: 0.55 });
      } else if (kind === 'muzzle') {
        const length = size * (1 - sampledProgress * 0.65);
        shape.moveTo(0, -length).lineTo(size * 0.28, 0).lineTo(0, length * 0.28)
          .lineTo(-size * 0.28, 0).closePath().fill({ color: '#ffffff', alpha: 0.95 });
        shape.circle(0, 0, size * 0.22).fill({ color: effect.color, alpha: 0.85 });
      } else {
        shape.circle(0, 0, size * (0.56 + sampledProgress * 0.44)).fill({ color: effect.color, alpha: 0.24 });
        shape.circle(-size * 0.22, -size * 0.08, size * 0.34).fill({ color: effect.color, alpha: 0.18 });
      }
      return shape;
    });
    this.releaseGeometry(effect);
    effect.graphic.context = context;
    effect.geometryKey = key;
    effect.sprite.visible = false;
    return true;
  }

  update(deltaMs: number) {
    deltaMs = Number.isFinite(deltaMs) ? clamp(deltaMs, 0, 100) : 0;
    for (const effect of this.effects) {
      if (!effect.active) continue;
      effect.age += deltaMs;
      const progress = clamp(effect.age / effect.duration, 0, 1);
      // REVAMP(S): Analytic drift and atlas-baked rotation preserve integer pixels.
      if (effect.kind === 'pixel-explosion') {
        this.pixelExplosions.draw(effect);
        if (progress >= 1) { effect.active = false; effect.root.visible = false; effect.pixel = null; }
        continue;
      }
      if (effect.kind === 'score-spark') {
        const position = scoreSparkPosition(progress, effect.startX, effect.startY, effect.targetX, effect.targetY, effect.bend, this.sparkPosition);
        effect.root.position.set(position.x, position.y);
      } else {
        effect.root.x += effect.velocityX * (deltaMs / 16.667);
        effect.root.y += effect.velocityY * (deltaMs / 16.667);
      }
      if (effect.kind === 'sprite-debris' || effect.kind === 'debris') {
        effect.velocityY += 0.12 * (deltaMs / 16.667);
      }
      effect.root.rotation += effect.spin * (deltaMs / 16.667);
      effect.root.alpha = effect.kind === 'score-spark'
        ? Math.min(1, (1 - progress) * 6)
        : effect.kind === 'sprite-explosion' || effect.kind === 'boss-sprite-explosion'
        ? (progress < 0.74 ? 1 : (1 - progress) / 0.26)
        : (1 - progress) * (effect.kind === 'smoke' ? 0.72 : 1);
      this.drawEffect(effect, progress);
      if (progress >= 1) {
        effect.active = false;
        effect.root.visible = false;
        this.releaseGeometry(effect);
      }
    }

    for (let index = 0; index < this.lights.length; index++) {
      const light = this.lights[index];
      if (!light.active) continue;
      light.age += deltaMs;
      const progress = clamp(light.age / light.duration, 0, 1);
      this.drawLight(light, progress);
      if (progress >= 1) {
        light.active = false;
        hideSoftRadialLight(light);
      }
    }
  }

  destroy() {
    for (const effect of this.effects) {
      this.releaseGeometry(effect);
      // Release the owned scratch context explicitly before the container tree.
      effect.graphic.destroy();
      effect.root.destroy({ children: true });
    }
    this.effects.length = 0;
    this.geometry.destroy();
    this.pixelExplosions.destroy();
    for (let index = 0; index < this.lights.length; index++) {
      this.lights[index].active = false;
      hideSoftRadialLight(this.lights[index]);
      this.lights[index].root.destroy({ children: true });
    }
    this.lights.length = 0;
  }
}
