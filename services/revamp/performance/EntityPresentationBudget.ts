import { Texture, type Graphics, type Sprite } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity } from '../../gameLogic';

const transientTypes = new Set([EntityType.PROJECTILE, EntityType.MISSILE, EntityType.PARTICLE, EntityType.COIN]);

/** Conservative visual bounds, including wakes/glows; never cull threats' beams. */
export function isTransientOutsideViewport(
  entity: Entity,
  width: number,
  height: number,
  camera: Readonly<{ scale: number; offsetX: number; offsetY: number }>,
  shakeX = 0,
  shakeY = 0
) {
  if (entity.isBeam || entity.isTelegraph || !transientTypes.has(entity.type)) return false;
  const padding = Math.max(96, entity.width * 2, entity.height * 2);
  const left = (entity.x - padding) * camera.scale + camera.offsetX + shakeX;
  const right = (entity.x + entity.width + padding) * camera.scale + camera.offsetX + shakeX;
  const top = (entity.y - padding) * camera.scale + camera.offsetY + shakeY;
  const bottom = (entity.y + entity.height + padding) * camera.scale + camera.offsetY + shakeY;
  return right < 0 || left > width || bottom < 0 || top > height;
}

/** Same pixel rectangle, batched on Pixi's shared white texture; no tessellation. */
export function syncPixelParticle(view: { body: Graphics; sprite: Sprite }, entity: Entity) {
  if (view.body.context.instructions.length) view.body.clear();
  view.sprite.texture = Texture.WHITE;
  view.sprite.visible = true;
  view.sprite.anchor.set(0.5);
  view.sprite.width = entity.width;
  view.sprite.height = entity.height;
  view.sprite.tint = entity.color;
  view.sprite.alpha = Math.max(0, Math.min(1, entity.life / Math.max(1, entity.maxLife)));
}
