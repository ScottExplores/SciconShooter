import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { createSoftRadialLight, hideSoftRadialLight, showSoftRadialLight, type SoftRadialLight } from './SoftRadialLight';

export type ArcadeEffectKind =
  | 'burst'
  | 'ring'
  | 'spark'
  | 'shockwave'
  | 'muzzle'
  | 'smoke'
  | 'debris'
  | 'sprite-explosion'
  | 'boss-sprite-explosion'
  | 'sprite-debris';

type PooledEffect = {
  root: Container;
  graphic: Graphics;
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
  private readonly deathBursts: { remainingMs: number; x: number; y: number; size: number }[] = [];

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

  setQuality(performanceMode: boolean, mobileProfile: boolean) {
    this.maxEffects = performanceMode
      ? (mobileProfile ? 54 : 84)
      : (mobileProfile ? 104 : 170);
    this.maxLights = performanceMode
      ? (mobileProfile ? 3 : 6)
      : (mobileProfile ? 5 : MAX_POOLED_LIGHTS);

    // Adaptive quality can step down after a busy scene has already expanded
    // the pool. Retire the overflow immediately so the new cap is real rather
    // than merely limiting future allocations.
    for (let index = this.maxEffects; index < this.effects.length; index++) {
      this.effects[index].active = false;
      this.effects[index].root.visible = false;
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
        graphic,
        sprite,
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
    effect.duration = duration;
    effect.size = size;
    effect.color = color;
    effect.velocityX = kind === 'spark' || kind === 'debris' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.velocityY = kind === 'smoke' ? -0.24 : kind === 'spark' || kind === 'debris' ? (Math.random() - 0.5) * 2.5 : 0;
    effect.spin = (Math.random() - 0.5) * (kind === 'debris' ? 0.16 : 0.08);
    effect.root.position.set(x, y);
    this.drawEffect(effect, 0);
    return effect;
  }

  spawnExplosion(x: number, y: number, size: number, color = '#67e8f9', intensity = 1) {
    this.spawnLightPulse(x, y, Math.min(260, size * 1.35), color, 0.32 + Math.min(0.28, intensity * 0.12), 240);
    this.spawnSpriteExplosion(x, y, size, 360);
    this.spawn('shockwave', x, y, size * 1.5, color, 520);
    this.spawn('burst', x, y, size, color, 420);
    const sparks = Math.max(3, Math.round(5 * intensity));
    for (let index = 0; index < sparks; index++) {
      const spark = this.spawn('spark', x, y, Math.max(2, size * 0.08), index % 2 ? '#ffffff' : color, 260 + Math.random() * 240);
      spark.velocityX = (Math.random() - 0.5) * size * 0.045;
      spark.velocityY = (Math.random() - 0.5) * size * 0.045;
    }
    const debrisCount = Math.max(0, Math.round(3 * intensity));
    for (let index = 0; index < debrisCount; index++) {
      const debris = this.spawn('debris', x, y, Math.max(3, size * 0.075), index % 2 ? '#94a3b8' : color, 520 + Math.random() * 420);
      debris.velocityX = (Math.random() - 0.5) * size * 0.035;
      debris.velocityY = (Math.random() - 0.42) * size * 0.038;
    }
    if (size > 80) {
      this.spawn('smoke', x - size * 0.2, y, size * 0.42, '#64748b', 900);
      this.spawn('smoke', x + size * 0.2, y + size * 0.08, size * 0.34, '#334155', 980);
    }
  }

  /**
   * A short, capped chain. The first burst is immediate. Later bursts and
   * sprite-piece debris stay inside the pool so a boss death cannot allocate
   * without bound.
   */
  spawnBossDeathChain(
    x: number,
    y: number,
    size: number,
    debris: readonly { texture: Texture; width: number; height: number; direction: number }[],
    reduced: boolean
  ) {
    this.spawnBossExplosion(x, y, size, reduced ? 1.15 : 2.2);
    const bursts = reduced
      ? [{ ms: 140, ox: 0.16, oy: 0.04, scale: 0.62 }]
      : [
          { ms: 90, ox: -0.28, oy: -0.06, scale: 0.55 },
          { ms: 180, ox: 0.26, oy: 0.08, scale: 0.64 },
          { ms: 280, ox: 0.02, oy: 0.18, scale: 0.78 },
          { ms: 400, ox: -0.1, oy: -0.14, scale: 0.48 }
        ];
    for (const burst of bursts) {
      if (this.deathBursts.length >= 6) break;
      this.deathBursts.push({
        remainingMs: burst.ms,
        x: x + size * burst.ox,
        y: y + size * burst.oy,
        size: size * burst.scale
      });
    }
    const debrisCap = reduced ? 2 : 5;
    for (let index = 0; index < debris.length && index < debrisCap; index += 1) {
      const piece = debris[index];
      this.spawnDetachedSprite(
        piece.texture,
        x + (index - 1) * size * 0.12,
        y,
        piece.width,
        piece.height,
        piece.direction
      );
    }
  }

  spawnBossExplosion(x: number, y: number, size: number, intensity = 1) {
    this.spawnLightPulse(x, y, Math.min(320, size * 1.45), '#fef08a', 0.48 + Math.min(0.3, intensity * 0.1), 300);
    this.spawnBossSpriteExplosion(x, y, size, 420);
    this.spawn('shockwave', x, y, size * 1.35, '#fef08a', 480);
    const sparks = Math.max(4, Math.round(6 * intensity));
    for (let index = 0; index < sparks; index++) {
      const spark = this.spawn('spark', x, y, Math.max(2, size * 0.065), index % 2 ? '#ffffff' : '#fb923c', 280 + Math.random() * 240);
      spark.velocityX = (Math.random() - 0.5) * size * 0.042;
      spark.velocityY = (Math.random() - 0.55) * size * 0.042;
    }
  }

  spawnEnemyExplosion(x: number, y: number, size: number, color = '#67e8f9') {
    this.spawnLightPulse(x, y, Math.min(140, size * 1.15), color, 0.26, 160);
    this.spawnBossSpriteExplosion(x, y, size, 260);
    this.spawn('ring', x, y, size * 0.62, color, 220);
    for (let index = 0; index < 2; index++) {
      const spark = this.spawn('spark', x, y, Math.max(2, size * 0.06), index === 0 ? '#ffffff' : color, 180 + index * 55);
      spark.velocityX = (index === 0 ? -1 : 1) * size * 0.018;
      spark.velocityY = -size * (0.012 + index * 0.004);
    }
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
  spawnProjectileHit(x: number, y: number, size: number, color: string, vx: number, vy: number, reducedEffects: boolean) {
    this.spawnBossSpriteExplosion(x, y, Math.min(26, size), reducedEffects ? 100 : 135);
    const speed = Math.max(1, Math.hypot(vx, vy));
    const normalX = -vy / speed;
    const normalY = vx / speed;
    for (let index = 0; index < (reducedEffects ? 1 : 2); index++) {
      const side = index === 0 ? -1 : 1;
      const spark = this.spawn('spark', x, y, 1.8, index === 0 ? '#fff7dc' : color, 110 + index * 25);
      spark.velocityX = normalX * side * 1.3 - vx / speed * 0.35;
      spark.velocityY = normalY * side * 1.3 - vy / speed * 0.35;
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
    const graphic = effect.graphic;
    graphic.clear();
    effect.sprite.visible = false;

    if (effect.kind === 'sprite-explosion' || effect.kind === 'boss-sprite-explosion') {
      const textures = effect.kind === 'boss-sprite-explosion'
        ? this.bossExplosionTextures
        : this.explosionTextures;
      if (textures.length === 0) return;
      const frameIndex = Math.min(
        textures.length - 1,
        Math.floor(progress * textures.length)
      );
      effect.sprite.texture = textures[frameIndex];
      effect.sprite.visible = true;
      const scale = 0.82 + Math.sin(progress * Math.PI) * 0.34;
      effect.sprite.width = effect.size * scale;
      effect.sprite.height = effect.size * scale;
      return;
    }

    if (effect.kind === 'sprite-debris') {
      effect.sprite.visible = true;
      return;
    }

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

  update(deltaMs: number) {
    if (this.deathBursts.length > 0) {
      for (let index = this.deathBursts.length - 1; index >= 0; index -= 1) {
        const burst = this.deathBursts[index];
        burst.remainingMs -= deltaMs;
        if (burst.remainingMs > 0) continue;
        this.deathBursts.splice(index, 1);
        this.spawnBossExplosion(burst.x, burst.y, burst.size, 1.05);
      }
    }
    for (const effect of this.effects) {
      if (!effect.active) continue;
      effect.age += deltaMs;
      const progress = clamp(effect.age / effect.duration, 0, 1);
      effect.root.x += effect.velocityX * (deltaMs / 16.667);
      effect.root.y += effect.velocityY * (deltaMs / 16.667);
      if (effect.kind === 'sprite-debris') {
        effect.velocityY += 0.12 * (deltaMs / 16.667);
      }
      effect.root.rotation += effect.spin * (deltaMs / 16.667);
      effect.root.alpha = effect.kind === 'sprite-explosion' || effect.kind === 'boss-sprite-explosion'
        ? (progress < 0.74 ? 1 : (1 - progress) / 0.26)
        : (1 - progress) * (effect.kind === 'smoke' ? 0.72 : 1);
      this.drawEffect(effect, progress);
      if (progress >= 1) {
        effect.active = false;
        effect.root.visible = false;
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
    this.effects.length = 0;
    for (let index = 0; index < this.lights.length; index++) {
      this.lights[index].active = false;
      hideSoftRadialLight(this.lights[index]);
    }
    this.lights.length = 0;
  }
}
