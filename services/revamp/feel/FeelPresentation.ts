import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';
import type { CombatImpactEvent } from '../../gameplay/CombatImpactBuffer';
import type { ArcadeEffectPool } from '../../pixi/ArcadeEffectPool';
import { FeelEffects } from './FeelEffects';
import { getFeelSettings } from './FeelSettings';
import { isAimedShot } from './FeelGameplay';
import { drawProjectileGlyph, getProjectileFamily, hostileProjectileColor, playerProjectileColor } from './ProjectileReadability';

type FeelView = {
  root: Container; sprite: Sprite; body: Graphics; aura: Graphics; trail: Graphics;
  flash: Graphics; hitFlash?: Sprite; hasFallbackBody: boolean;
};
type Hit = { age: number; vx: number; vy: number; x: number; y: number };
export const HIT_TINT_DURATION_MS = 50;
export const HIT_TINT_COOLDOWN_MS = 125;

const label = (size: number, color = '#e0f2fe') => {
  const text = new Text({ text: '', style: {
    fontFamily: 'monospace', fontWeight: 'bold', fontSize: size, fill: color,
    stroke: { color: '#081327', width: 4, join: 'round' }, align: 'center'
  } });
  text.anchor.set(0.5);
  return text;
};

/** One renderer-owned layer. All transient geometry uses the existing pool. */
export class FeelPresentation {
  private readonly hits = new Map<string, Hit>();
  private readonly root = new Container();
  private readonly chainText = label(15, '#67e8f9');
  private readonly chainBar = new Graphics();
  private readonly banner = label(27, '#fef08a');
  private readonly power = label(28, '#ffffff');
  private readonly flash = new Graphics();
  private readonly effects: FeelEffects;
  private source: GameEngine | null = null;
  private sequence = 0;
  private generation = -1;
  private bannerMs = 0;
  private powerMs = 0;
  private muzzleBudget = 0;

  constructor(private readonly pool: ArcadeEffectPool, overlay: Container) {
    this.effects = new FeelEffects(pool);
    this.root.eventMode = 'none';
    this.root.addChild(this.chainBar, this.chainText, this.banner, this.power, this.flash);
    overlay.addChild(this.root);
  }

  impact(impact: CombatImpactEvent) {
    // Sustained beams/volleys must leave a visible unlit interval per target.
    if ((this.hits.get(impact.targetId)?.age ?? Infinity) < HIT_TINT_COOLDOWN_MS) return;
    if (this.hits.size >= 64 && !this.hits.has(impact.targetId)) {
      this.hits.delete(this.hits.keys().next().value!);
    }
    this.hits.set(impact.targetId, { age: 0, vx: impact.vx, vy: impact.vy, x: impact.x, y: impact.y });
  }

  beginFrame(engine: GameEngine, deltaMs: number) {
    if (this.source !== engine || this.generation !== engine.feel.resetGeneration) {
      this.source = engine;
      this.generation = engine.feel.resetGeneration;
      this.sequence = 0;
      this.bannerMs = this.powerMs = 0;
      this.hits.clear();
      this.effects.reset();
    }
    this.muzzleBudget = engine.performanceMode ? 3 : 6;
    for (const [id, hit] of this.hits) {
      hit.age += deltaMs;
      if (hit.age > 180) this.hits.delete(id);
    }
    this.bannerMs = Math.max(0, this.bannerMs - deltaMs);
    this.powerMs = Math.max(0, this.powerMs - deltaMs);
    const settings = getFeelSettings();
    this.effects.setReducedFlash(settings.reducedMotion || settings.reduceScreenShake);
    this.effects.update(deltaMs);
    for (const event of engine.feel.events) {
      if (event.sequence <= this.sequence) continue;
      this.sequence = event.sequence;
      if (engine.frameCount - event.frame > 90) continue;
      switch (event.type) {
        case 'kill':
          if (event.tier === 'boss') this.effects.startBossDefeat(event.x, event.y, event.width ?? 240, event.height ?? 200);
          else this.pool.spawnTieredExplosion(event.x, event.y, event.tier === 'elite' ? 66 : 32, event.tier, event.color);
          break;
        case 'part-break': this.pool.spawnTieredExplosion(event.x, event.y, 86, 'boss-part'); break;
        case 'bullet-cancel': this.pool.spawnScoreSpark(event.x, event.y, engine.width - 40, 24); break;
        case 'phase-change': this.pool.spawnPickupRing(event.x, event.y, false); break;
        case 'pickup':
          this.pool.spawnPickupRing(event.x, event.y, event.pickupType === 'power');
          if (event.pickupType === 'power') {
            this.power.text = `POWER ${event.powerLevel}`;
            this.power.position.set(Math.max(100, Math.min(engine.width - 100, event.x)), Math.max(100, event.y - 55));
            this.powerMs = 950;
          }
          break;
        case 'perfect-wave': this.bannerMs = 1500; this.banner.text = 'PERFECT WAVE'; break;
      }
    }
    const combo = engine.feel.comboMultiplier;
    let showChain = combo >= 2 && !engine.inBossWarningSequence;
    if (showChain && engine.entities) for (const target of engine.entities) {
      if (!target.markedForDeletion && (target.type === EntityType.BOSS || target.type === EntityType.MINI_BOSS)) {
        showChain = false;
        break;
      }
    }
    // REVAMP(I): Keep the formation's upper rows clear; bosses own the whole header.
    this.chainText.text = showChain ? `CHAIN x${combo}` : '';
    this.chainText.position.set(engine.width - 72, 65);
    this.chainBar.clear();
    if (showChain) {
      this.chainBar.roundRect(engine.width - 128, 51, 112, 30, 5).fill({ color: '#081327', alpha: 0.8 });
      this.chainBar.rect(engine.width - 120, 77, 96, 3).fill({ color: '#164e63' });
      this.chainBar.rect(engine.width - 120, 77, 96 * engine.feel.comboRemaining, 3).fill({ color: '#67e8f9' });
    }
    this.banner.position.set(engine.width / 2, engine.height * 0.31);
    this.banner.visible = this.bannerMs > 0;
    this.banner.alpha = Math.min(1, this.bannerMs / 220);
    this.power.visible = this.powerMs > 0;
    this.power.alpha = Math.min(1, this.powerMs / 200);
    this.power.scale.set(settings.reducedMotion ? 1 : 1 + Math.max(0, this.powerMs - 700) / 1250);
    this.flash.clear();
    const alpha = this.effects.screenFlashAlpha;
    if (alpha > 0) this.flash.rect(0, 0, engine.width, engine.height).fill({ color: '#ffffff', alpha });
  }

  /** Called after the existing entity pose so no hit changes collision geometry. */
  entity(view: FeelView, entity: Entity) {
    // REVAMP(I): This receipt path owns damage light; clear the older frame-based wash.
    if (view.hitFlash) view.hitFlash.visible = false;
    view.flash.clear();
    const hit = this.hits.get(entity.id);
    if (!hit) return;
    const settings = getFeelSettings();
    const boss = entity.type === EntityType.BOSS || entity.type === EntityType.MINI_BOSS;
    if (!settings.reducedMotion && !boss) {
      const speed = Math.max(1, Math.hypot(hit.vx, hit.vy));
      const wobble = Math.cos(hit.age * 0.045) * Math.exp(-hit.age / 45) * 1.2;
      view.root.x += hit.vx / speed * wobble;
      view.root.y += hit.vy / speed * wobble;
      view.root.rotation += wobble * 0.009;
    }
    // Render-clock timeout also expires while the 60 Hz simulation is in hit-stop.
    if (hit.age >= HIT_TINT_DURATION_MS) return;
    if (boss || view.hasFallbackBody || !view.sprite.visible) {
      // Large hulls never receive a silhouette overlay. Light only the contact.
      const dx = hit.x - view.root.x;
      const dy = hit.y - view.root.y;
      const cosine = Math.cos(view.root.rotation), sine = Math.sin(view.root.rotation);
      const x = dx * cosine + dy * sine;
      const y = -dx * sine + dy * cosine;
      view.flash.blendMode = 'add';
      view.flash.rect(x - 6, y - 2, 12, 4).rect(x - 2, y - 5, 4, 10)
        .fill({ color: '#ffd4a3', alpha: settings.reducedMotion ? 0.18 : 0.42 });
      return;
    }
    if (view.sprite.texture !== Texture.WHITE) {
      if (!view.hitFlash) {
        view.hitFlash = new Sprite(view.sprite.texture);
        view.hitFlash.eventMode = 'none';
        view.hitFlash.roundPixels = true;
        view.root.addChild(view.hitFlash);
      }
      view.hitFlash.texture = view.sprite.texture;
      view.hitFlash.anchor.copyFrom(view.sprite.anchor);
      view.hitFlash.position.copyFrom(view.sprite.position);
      view.hitFlash.scale.copyFrom(view.sprite.scale);
      view.hitFlash.rotation = view.sprite.rotation;
      view.hitFlash.filters = null;
      view.hitFlash.tint = '#ffd4a3';
      view.hitFlash.blendMode = 'add';
      // Add original texture colour at low opacity: artwork detail stays visible.
      view.hitFlash.alpha = settings.reducedMotion ? 0.12 : 0.3;
      view.hitFlash.visible = true;
    }
  }

  muzzle(entity: Entity, frame: number) {
    const age = Math.max(0, frame - entity.weaponVisualStartFrame);
    if (!entity.isPlayerShot || entity.isBeam || this.muzzleBudget <= 0
      || age > 6) return;
    this.muzzleBudget--;
    // Reconstruct the launch point when one render spans several fixed steps.
    this.pool.spawnMuzzle(entity.x + entity.width / 2 - entity.vx * age,
      entity.y + entity.height / 2 - entity.vy * age,
      entity.squadAbilityKind ? 10 : 13, entity.vx, entity.vy, playerProjectileColor(entity));
  }

  destroy() { this.hits.clear(); this.effects.reset(); this.root.destroy({ children: true }); }
}

/** Readability accents keep all original texture files and authored silhouettes. */
export function drawReadableProjectile(view: FeelView, entity: Entity, frame: number) {
  if (entity.isBeam || entity.type !== EntityType.PROJECTILE || entity.prismMothArtifactState) return;
  const small = Math.min(entity.width, entity.height);
  if (small > 36 || entity.projectileVisualKind) return; // Preserve authored hazards/abilities.
  if (entity.isPlayerShot) {
    const age = Math.max(0, frame - entity.weaponVisualStartFrame);
    const color = playerProjectileColor(entity);
    const width = Math.min(entity.width, Math.max(5, entity.width * 0.72));
    const height = Math.min(24, entity.height);
    const wake = Math.min(22, age * Math.hypot(entity.vx, entity.vy) * 0.45);
    view.trail.blendMode = 'add';
    view.trail.moveTo(0, 0).lineTo(0, wake).stroke({ color, width: width + 2, alpha: 0.24 });
    view.aura.rect(-width * 0.75, -height * 0.5, width * 1.5, height).fill({ color, alpha: 0.14 });
    view.body.rect(-width / 2, -height / 2, width, height).fill({ color, alpha: 0.95 });
    view.body.rect(-width * 0.22, -height * 0.42, width * 0.44, height * 0.84)
      .fill({ color: '#f4ffec', alpha: 0.98 });
    return;
  }
  // The solid outer edge uses the exact collision dimensions, including long rounds.
  // Only the faint cosmetic halo extends beyond it. No minimum radius hides a hitbox.
  const halfWidth = entity.width / 2, halfHeight = entity.height / 2;
  const family = getProjectileFamily(entity);
  const color = hostileProjectileColor(family, isAimedShot(entity));
  view.body.clear();
  view.trail.clear();
  view.aura.clear();
  view.root.rotation = 0;
  view.aura.ellipse(0, 0, halfWidth + 2.5, halfHeight + 2.5).fill({ color, alpha: 0.16 });
  drawProjectileGlyph(view.body, family, halfWidth, halfHeight).fill({ color: '#160e26' });
  drawProjectileGlyph(view.body, family, Math.max(0.5, halfWidth - 1.4), Math.max(0.5, halfHeight - 1.4)).fill({ color });
  drawProjectileGlyph(view.body, family, Math.max(0.5, halfWidth * 0.32), Math.max(0.5, halfHeight * 0.44))
    .fill({ color: '#fff5d9' });
}
