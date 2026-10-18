import { Sprite, Texture, type Container, type Graphics } from 'pixi.js';
import { EntityType, PowerupType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';
import { optionalTrailCount, pickupGlint } from './AliveFeedback';

type MotionView = { root: Container; sprite: Sprite; aura: Graphics; trail: Graphics };
type WingVisual = { x: number; y: number; width: number; height: number; scale: number; alpha: number; tilt?: number };

export const WING_VISUAL_RATIO = 0.76;
export const playerIdleBob = (frame: number, reduced: boolean) => reduced ? 0 : Math.sin(frame * 0.065) * 1.1;

// REVAMP(P): One retained additive quad per pooled actor. It is destroyed with
// that actor's aura and shares Pixi's white texture; no filters or texture uploads.
const engineGlows = new WeakMap<MotionView, Sprite>();
function engineGlow(view: MotionView) {
  let glow = engineGlows.get(view);
  if (!glow) {
    glow = new Sprite(Texture.WHITE);
    glow.anchor.set(0.5);
    glow.eventMode = 'none';
    glow.blendMode = 'add';
    glow.roundPixels = true;
    view.aura.addChild(glow);
    engineGlows.set(view, glow);
  }
  return glow;
}

/** Scott's frame art stays authoritative; these tiny exhaust/pose cycles are cosmetic. */
export function animateCombatSprite(view: MotionView, entity: Entity, engine: GameEngine, reduced: boolean, qualityScale = 1) {
  const frame = engine.frameCount;
  const enemy = entity.type === EntityType.ENEMY_DRONE || entity.type === EntityType.ENEMY_SWARM
    || entity.type === EntityType.ENEMY_JOURNAL || entity.type === EntityType.ENEMY_BRICK;
  const ownsGlow = (enemy && entity.variant < 900) || entity.type === EntityType.ENEMY_INVADER;
  const previousGlow = engineGlows.get(view);
  // REVAMP(P): Avoid false→true toggles: Pixi rebuilds render instructions when
  // visibility changes. A recycled non-glowing actor still retires its glow.
  if (previousGlow && !ownsGlow) previousGlow.visible = false;
  if (entity.type === EntityType.PLAYER) {
    view.sprite.y = playerIdleBob(frame, reduced);
    // The existing authored steering frames still provide the full bank pose.
    view.sprite.rotation += reduced ? 0 : Math.max(-0.045, Math.min(0.045, engine.playerVel.x * 0.006));
    return;
  }
  if (enemy) view.sprite.y = 0;
  if (enemy && entity.variant < 900) {
    const phase = frame + entity.formationIndex * 7 + entity.variant * 3;
    const step = reduced ? 1 : Math.floor(phase / 5) % 4;
    const flying = entity.formationState !== 'hold';
    const exhaustLength = (flying ? 6 : 3) + step * 1.5;
    const color = entity.formationState === 'dive' ? '#ff9075' : '#73ddd9';
    view.aura.clear();
    // Four stepped frames keep the engine alive even in the breathing grid.
    view.aura.rect(-2, entity.height * 0.35, 4, exhaustLength).fill({ color, alpha: 0.58 });
    view.aura.rect(-1, entity.height * 0.35, 2, exhaustLength * 0.55).fill({ color: '#e6ffef', alpha: 0.9 });
    const glow = engineGlow(view);
    glow.visible = qualityScale > 0.4;
    glow.position.set(0, entity.height * 0.35 + exhaustLength * 0.28);
    glow.width = 8;
    glow.height = exhaustLength + 3;
    glow.tint = color;
    glow.alpha = reduced ? 0.06 : 0.08 + step * 0.012;
    // Single-frame hulls breathe by less than one pixel at phone scale. The
    // authored frame strips, formation banks and collision boxes stay primary.
    view.sprite.y = reduced ? 0 : Math.sin(phase * 0.055) * 0.55;
    if (reduced) {
      view.root.scale.set(1);
      if (!entity.formationState && entity.type !== EntityType.ENEMY_DRONE) view.root.rotation = 0;
    }
    if (!reduced && !entity.spriteFrames?.length) {
      const pulse = Math.sin(phase * 0.13);
      view.sprite.scale.x *= 1 + pulse * (entity.type === EntityType.ENEMY_SWARM ? 0.045 : 0.018);
      view.sprite.scale.y *= 1 - pulse * 0.012;
    }
    return;
  }
  if (entity.type === EntityType.ENEMY_INVADER) {
    // Wall segments must stay interlocked: animate their emissive pixels only.
    view.sprite.y = 0;
    const glow = engineGlow(view);
    glow.visible = qualityScale > 0.4;
    glow.position.set(0, -entity.height * 0.16);
    glow.width = Math.max(2, Math.min(9, entity.width * 0.22));
    glow.height = 2;
    glow.tint = '#b7ebf3';
    glow.alpha = reduced ? 0.14 : 0.12 + (1 + Math.sin((frame + entity.variant * 13) * 0.07)) * 0.1;
    return;
  }
  if (entity.type !== EntityType.COIN && entity.type !== EntityType.POWERUP && entity.type !== EntityType.BOMB
    && entity.type !== EntityType.SUPPLY_DROP) return;
  view.trail.clear();
  view.aura.clear();
  const phase = frame + entity.variant * 9;
  view.sprite.y = reduced ? 0 : Math.sin(phase * 0.09) * 1.5;
  // Stop the older renderer's decorative pickup wobble under reduced motion.
  if (reduced) {
    view.root.rotation = 0;
    view.root.scale.set(entity.type === EntityType.POWERUP ? entity.text === PowerupType.MAX_SHOT ? 1.4 : 1.22 : 1);
  }
  // Existing coin spin strips remain intact; a short corner glint marks value.
  const glint = pickupGlint(frame, entity.variant * 9, reduced);
  if (glint > 0) {
    const x = entity.width * 0.2;
    const y = -entity.height * 0.22 + view.sprite.y;
    view.aura.rect(x - 3, y - 1, 6, 2).rect(x - 1, y - 3, 2, 6).fill({ color: '#fff5bb', alpha: glint });
  }
  const speed = Math.hypot(entity.vx, entity.vy);
  const towardX = engine.player.x + engine.player.width / 2 - entity.x - entity.width / 2;
  const towardY = engine.player.y + engine.player.height / 2 - entity.y - entity.height / 2;
  if (!reduced && speed > 3 && entity.vx * towardX + entity.vy * towardY > 0) {
    view.trail.blendMode = 'add';
    for (let i = 1; i <= optionalTrailCount(qualityScale, reduced); i++) {
      const offset = i * Math.min(7, speed * 0.8);
      view.trail.rect(-entity.vx / speed * offset - 1, -entity.vy / speed * offset - 1, 2, 2)
        .fill({ color: entity.type === EntityType.COIN ? '#ffe49a' : '#a7f3d0', alpha: 0.5 - i * 0.1 });
    }
  }
}

/** Uniform footprint on every device; support ships do not own collision boxes. */
export function animateWingBody(pod: Sprite, companion: WingVisual, engine: GameEngine, index: number, reduced: boolean) {
  const span = Math.max(engine.player.width, engine.player.height) * 0.95 * WING_VISUAL_RATIO * companion.scale;
  const scale = span / Math.max(1, companion.width, companion.height);
  pod.width = companion.width * scale;
  pod.height = companion.height * scale;
  pod.alpha = companion.alpha;
  pod.position.set(companion.x, companion.y + (reduced ? 0 : Math.sin(engine.frameCount * 0.075 + index * Math.PI) * 1.8));
  pod.rotation = (companion.tilt ?? 0) + (reduced ? 0 : Math.sin(engine.frameCount * 0.045 + index * Math.PI) * 0.018);
}
