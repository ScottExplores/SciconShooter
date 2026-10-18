import type { Container, Sprite } from 'pixi.js';
import { PixelExplosionAtlas, PIXEL_EXPLOSION_SPECS, type PixelExplosionTier } from './PixelExplosionAtlas';

export interface PixelExplosionParticle {
  sequence: string;
  kind: 'fire' | 'smoke' | 'ring' | 'spark' | 'debris';
  x: number; y: number;
  vx: number; vy: number;
  delay: number; duration: number;
  scale: number; alpha: number;
  spin: number;
}
export interface PixelExplosionSlot {
  root: Container;
  sprite: Sprite;
  age: number;
  duration: number;
  pixel: PixelExplosionParticle | null;
}
export type PixelExplosionAllocator = (x: number, y: number, size: number, duration: number) => PixelExplosionSlot;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Same pixel size throughout each sequence: animation never stretches a frame. */
export const pixelExplosionScale = (size: number, tier: PixelExplosionTier) =>
  clamp(Math.round((Number.isFinite(size) ? size : PIXEL_EXPLOSION_SPECS[tier].edge) / PIXEL_EXPLOSION_SPECS[tier].edge), 1, tier === 'mega' ? 3 : 4);

/** Visual RNG is private and deterministic; explosion detail never consumes combat RNG. */
export function pixelExplosionRecipes(x: number, y: number, size: number, tier: PixelExplosionTier,
  seed = 1, quality = 1, reducedMotion = false): PixelExplosionParticle[] {
  const spec = PIXEL_EXPLOSION_SPECS[tier];
  const scale = pixelExplosionScale(size, tier);
  const diameter = spec.edge * scale;
  const density = clamp(Number.isFinite(quality) ? quality : 1, 0.25, 1) * (reducedMotion ? 0.5 : 1);
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const parts: PixelExplosionParticle[] = [];
  const base = (kind: PixelExplosionParticle['kind'], sequence: string, duration: number, partScale: number, alpha = 1): PixelExplosionParticle =>
    ({ kind, sequence, x, y, vx: 0, vy: 0, delay: 0, duration, scale: partScale, alpha, spin: 0 });
  // Smoke renders below fire. Its delayed arrival lets the hull read at ignition.
  for (let i = 0, count = Math.max(1, Math.round(spec.smoke * density)); i < count; i++) {
    const puff = base('smoke', 'smoke', tier === 'small' ? 620 : 980, Math.max(1, Math.round(diameter / 86)), 0.46);
    const angle = i * Math.PI * 2 / count + random();
    puff.x += Math.cos(angle) * diameter * 0.19;
    puff.y += Math.sin(angle) * diameter * 0.14;
    puff.delay = Math.round(spec.duration * 0.18 + i * 35);
    puff.vx = (random() - 0.5) * 0.022;
    puff.vy = -0.008 - random() * 0.016;
    parts.push(puff);
  }
  if (!reducedMotion && density >= 0.42) {
    const wave = base('ring', `ring-${tier}`, Math.round(spec.duration * 0.72), scale, tier === 'mega' ? 0.75 : 0.56);
    wave.delay = 35;
    parts.push(wave);
  }
  const sparkCount = Math.max(1, Math.round(spec.sparks * density));
  const offset = Math.floor(random() * 8);
  for (let i = 0; i < sparkCount; i++) {
    const direction = (Math.floor(i * 8 / sparkCount) + offset) % 8;
    const angle = direction * Math.PI / 4;
    const speed = Math.min(0.17, diameter * (0.00065 + random() * 0.00045));
    const ember = base('spark', `spark-${direction}`, 290 + random() * 220, tier === 'mega' ? 2 : 1);
    ember.vx = Math.cos(angle) * speed;
    ember.vy = Math.sin(angle) * speed;
    ember.x += Math.cos(angle) * diameter * 0.08;
    ember.y += Math.sin(angle) * diameter * 0.08;
    ember.delay = 45 + random() * 45;
    parts.push(ember);
  }
  for (let i = 0, count = Math.round(spec.debris * density); i < count; i++) {
    const angle = (i + random() * 0.5) * Math.PI * 2 / count;
    const chip = base('debris', 'debris', 650 + random() * 240, tier === 'mega' ? 2 : 1);
    const speed = Math.min(0.12, diameter * (0.00065 + random() * 0.0003));
    chip.vx = Math.cos(angle) * speed;
    chip.vy = Math.sin(angle) * speed - 0.027;
    chip.delay = 65;
    chip.spin = (i % 2 ? -1 : 1) * (0.009 + random() * 0.004);
    parts.push(chip);
  }
  // Allocate the main frame last so pool pressure retains each new kill's fireball.
  parts.push(base('fire', tier, spec.duration, scale, reducedMotion ? 0.84 : 1));
  return parts;
}

/** Owns only the shared atlas. Display-object allocation stays in ArcadeEffectPool. */
export class PixelExplosionRenderer {
  private readonly atlas = new PixelExplosionAtlas();
  private quality = 1;
  private reducedMotion = false;
  private serial = 0;
  constructor(private readonly allocate: PixelExplosionAllocator) {}
  setQuality(quality: number) { this.quality = clamp(Number.isFinite(quality) ? quality : 1, 0.25, 1); }
  setReducedMotion(reduced: boolean) { this.reducedMotion = reduced; }
  spawn(x: number, y: number, size: number, tier: PixelExplosionTier, seed = ++this.serial) {
    if (!Number.isFinite(x + y)) return;
    const recipes = pixelExplosionRecipes(x, y, size, tier, seed, this.quality, this.reducedMotion);
    for (const recipe of recipes) {
      const slot = this.allocate(recipe.x, recipe.y, size, recipe.delay + recipe.duration);
      slot.pixel = recipe;
      this.draw(slot);
    }
  }
  draw(slot: PixelExplosionSlot) {
    const particle = slot.pixel;
    if (!particle) return;
    const age = Math.max(0, slot.age - particle.delay);
    const progress = clamp(age / particle.duration, 0, 1);
    const textures = this.atlas.get(particle.sequence);
    // No WHITE fallback: a failed canvas initialization must never paint a block.
    slot.sprite.visible = textures.length > 0 && slot.age >= particle.delay && progress < 1;
    if (!slot.sprite.visible) return;
    const moving = this.reducedMotion ? 0.25 : 1;
    if (this.reducedMotion && particle.kind === 'ring') { slot.sprite.visible = false; return; }
    const index = particle.kind === 'debris'
      ? ((Math.floor(age * particle.spin * moving) % textures.length) + textures.length) % textures.length
      : Math.min(textures.length - 1, Math.floor(progress * textures.length));
    slot.sprite.texture = textures[index];
    slot.sprite.width = textures[index].width * particle.scale;
    slot.sprite.height = textures[index].height * particle.scale;
    slot.sprite.blendMode = 'normal';
    slot.root.rotation = 0;
    slot.root.position.set(Math.round(particle.x + particle.vx * age * moving),
      Math.round(particle.y + (particle.vy * age + (particle.kind === 'debris' ? age * age * 0.000045 : 0)) * moving));
    const fade = particle.kind === 'fire' ? 1 : particle.kind === 'smoke' ? Math.min(1, progress * 5) * Math.min(1, (1 - progress) * 2.4) : Math.min(1, (1 - progress) * 3);
    slot.root.alpha = particle.alpha * fade;
  }
  getStats() { return this.atlas.getStats(); }
  destroy() { this.atlas.destroy(); }
}
