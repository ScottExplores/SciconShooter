import { Container, Graphics } from 'pixi.js';

export type ArcadeEffectKind =
  | 'burst'
  | 'ring'
  | 'spark'
  | 'shockwave'
  | 'muzzle'
  | 'smoke'
  | 'debris';

type PooledEffect = {
  root: Container;
  graphic: Graphics;
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

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** A bounded presentation-only pool. It never owns gameplay entities. */
export class ArcadeEffectPool {
  private readonly effects: PooledEffect[] = [];
  private maxEffects = 150;

  constructor(private readonly layer: Container) {}

  setQuality(performanceMode: boolean, mobileProfile: boolean) {
    this.maxEffects = performanceMode
      ? (mobileProfile ? 54 : 84)
      : (mobileProfile ? 104 : 170);
  }

  private acquire(kind: ArcadeEffectKind) {
    let effect = this.effects.find((candidate) => !candidate.active);
    if (!effect && this.effects.length >= this.maxEffects) {
      effect = this.effects.reduce((oldest, candidate) => candidate.age > oldest.age ? candidate : oldest);
    }
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
