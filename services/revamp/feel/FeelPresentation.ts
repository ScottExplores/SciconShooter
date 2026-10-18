import { ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';
import type { CombatImpactEvent } from '../../gameplay/CombatImpactBuffer';
import type { ArcadeEffectPool } from '../../pixi/ArcadeEffectPool';
import { FeelEffects } from './FeelEffects';
import { getFeelSettings } from './FeelSettings';
import { isAimedShot } from './FeelGameplay';

type FeelView = {
  root: Container; sprite: Sprite; body: Graphics; aura: Graphics; trail: Graphics;
  flash: Graphics; hitFlash?: Sprite; hasFallbackBody: boolean;
};
type Hit = { age: number; vx: number; vy: number };

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
  private readonly white = new ColorMatrixFilter();
  private readonly silhouetteTextures = new WeakSet<Texture>();
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

  // REVAMP(J): Main renderer bakes reusable silhouettes; labs retain the fallback.
  constructor(private readonly pool: ArcadeEffectPool, overlay: Container, private readonly silhouette?: (texture: Texture) => Texture | null) {
    // Preserve texture alpha, turn only the existing art silhouette white.
    this.white.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    this.effects = new FeelEffects(pool);
    this.root.eventMode = 'none';
    this.root.addChild(this.chainBar, this.chainText, this.banner, this.power, this.flash);
    overlay.addChild(this.root);
  }

  impact(impact: CombatImpactEvent) {
    if (this.hits.size >= 64 && !this.hits.has(impact.targetId)) {
      this.hits.delete(this.hits.keys().next().value!);
    }
    this.hits.set(impact.targetId, { age: 0, vx: impact.vx, vy: impact.vy });
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
    this.chainText.text = combo >= 2 ? `CHAIN x${combo}` : '';
    this.chainText.position.set(engine.width - 72, 108);
    this.chainBar.clear();
    if (combo >= 2) {
      this.chainBar.roundRect(engine.width - 128, 94, 112, 34, 5).fill({ color: '#081327', alpha: 0.8 });
      this.chainBar.rect(engine.width - 120, 122, 96, 3).fill({ color: '#164e63' });
      this.chainBar.rect(engine.width - 120, 122, 96 * engine.feel.comboRemaining, 3).fill({ color: '#67e8f9' });
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
    const hit = this.hits.get(entity.id);
    if (!hit) {
      // A receipt can be evicted during a dense volley or cleared on restart.
      if (view.hitFlash && (view.hitFlash.filters?.[0] === this.white || this.silhouetteTextures.has(view.hitFlash.texture))) view.hitFlash.visible = false;
      return;
    }
    if (view.hitFlash) view.hitFlash.visible = false;
    const settings = getFeelSettings();
    if (!settings.reducedMotion && entity.type !== EntityType.BOSS && entity.type !== EntityType.MINI_BOSS) {
      const speed = Math.max(1, Math.hypot(hit.vx, hit.vy));
      const wobble = Math.cos(hit.age * 0.045) * Math.exp(-hit.age / 45) * 2;
      view.root.x += hit.vx / speed * wobble;
      view.root.y += hit.vy / speed * wobble;
      view.root.rotation += wobble * 0.012;
    }
    // Exactly 60 ms on the render clock; hit-stop cannot extend the flash.
    if (hit.age >= 60) { if (view.hitFlash) view.hitFlash.visible = false; return; }
    if (view.sprite.visible && view.sprite.texture !== Texture.WHITE && !view.hasFallbackBody) {
      if (!view.hitFlash) {
        view.hitFlash = new Sprite(view.sprite.texture);
        view.hitFlash.eventMode = 'none';
        view.root.addChild(view.hitFlash);
      }
      // REVAMP(J): Same white/alpha mask with no per-object filter pass on cache hits.
      const baked = this.silhouette?.(view.sprite.texture);
      if (baked) this.silhouetteTextures.add(baked);
      view.hitFlash.texture = baked ?? view.sprite.texture;
      view.hitFlash.anchor.copyFrom(view.sprite.anchor);
      view.hitFlash.position.copyFrom(view.sprite.position);
      view.hitFlash.scale.copyFrom(view.sprite.scale);
      view.hitFlash.rotation = view.sprite.rotation;
      if (baked) view.hitFlash.filters = null;
      else if (view.hitFlash.filters?.[0] !== this.white) view.hitFlash.filters = [this.white];
      view.hitFlash.blendMode = 'normal';
      view.hitFlash.alpha = settings.reducedMotion ? 0.26 : 0.88;
      view.hitFlash.visible = true;
    }
  }

  muzzle(entity: Entity, frame: number) {
    if (!entity.isPlayerShot || entity.isBeam || this.muzzleBudget <= 0
      || frame - entity.weaponVisualStartFrame > 2) return;
    this.muzzleBudget--;
    this.pool.spawnMuzzle(entity.x + entity.width / 2, entity.y + entity.height / 2, entity.squadAbilityKind ? 9 : 12, entity.vx, entity.vy);
  }

  destroy() { this.hits.clear(); this.effects.reset(); this.root.destroy({ children: true }); this.white.destroy(); }
}

/** Readability accents keep all original texture files and authored silhouettes. */
export function drawReadableProjectile(view: FeelView, entity: Entity, frame: number) {
  if (entity.isBeam || entity.type !== EntityType.PROJECTILE || entity.prismMothArtifactState) return;
  const small = Math.min(entity.width, entity.height);
  if (small > 36) return; // Large authored hazards retain their dedicated telegraphs.
  if (entity.isPlayerShot) {
    const age = Math.max(0, frame - entity.weaponVisualStartFrame);
    const wake = Math.min(25, age * Math.hypot(entity.vx, entity.vy) * 0.5);
    view.trail.blendMode = 'add';
    view.trail.moveTo(0, 0).lineTo(0, wake).stroke({ color: '#67e8f9', width: 5, alpha: 0.3 });
    const coreRadius = Math.max(1.6, small * 0.28);
    view.body.ellipse(0, 0, coreRadius * 1.55, Math.min(11, entity.height * 0.5))
      .fill({ color: '#67e8f9', alpha: 0.72 });
    view.body.ellipse(0, 0, coreRadius, Math.min(8, entity.height * 0.4))
      .fill({ color: '#f0fdff', alpha: 0.98 });
    return;
  }
  const radius = Math.max(3.5, Math.min(10, small * 0.48));
  const aimed = isAimedShot(entity);
  const color = aimed ? '#fb923c' : '#f472b6';
  view.aura.circle(0, 0, radius * (aimed ? 2.1 : 1.4)).fill({ color, alpha: aimed ? 0.18 : 0.1 });
  view.body.circle(0, 0, radius).fill({ color }).stroke({ color: '#180e2d', width: 2, alpha: 1 });
  view.body.circle(0, 0, radius * 0.38).fill({ color: '#fff0d6', alpha: 0.95 });
}
