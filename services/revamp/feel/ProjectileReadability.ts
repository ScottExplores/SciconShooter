import type { Graphics } from 'pixi.js';
import { EntityType } from '../../../types';
import type { Entity } from '../../gameLogic';

export type HostileProjectileFamily = 'round' | 'diamond' | 'dart' | 'mine';
const families = new WeakMap<object, HostileProjectileFamily>();

/** Render metadata only: no entity fields, random draws, or combat tuning. */
export function markProjectileFamily(shot: object, source: {
  type?: string; campaignRoleId?: string; sectorBehavior?: string; campaignGameplayRole?: string;
}) {
  const role = `${source.campaignRoleId ?? ''} ${source.campaignGameplayRole ?? ''} ${source.sectorBehavior ?? ''}`;
  const family: HostileProjectileFamily = /mine/.test(role) ? 'mine'
    : /sniper|diver|swooper|kamikaze/.test(role) ? 'dart'
    : source.type === EntityType.ENEMY_JOURNAL || /shield|splitter|carrier/.test(role) ? 'diamond'
    : 'round';
  families.set(shot, family);
}

export const getProjectileFamily = (shot: object): HostileProjectileFamily => families.get(shot) ?? 'round';

export const playerProjectileColor = (entity: Pick<Entity, 'color' | 'weaponVisualFamily' | 'squadAbilityKind'>) => {
  if (entity.squadAbilityKind && entity.color) return entity.color;
  return entity.weaponVisualFamily === 'bio' ? '#b7ff68'
    : entity.weaponVisualFamily === 'eth' ? '#b7a5ff'
    : entity.weaponVisualFamily === 'btc' ? '#ffbf47'
    : entity.weaponVisualFamily === 'research' ? '#67e8f9'
    : entity.color || '#67e8f9';
};

export function drawProjectileGlyph(graphic: Graphics, family: HostileProjectileFamily, halfWidth: number, halfHeight: number) {
  if (family === 'diamond') return graphic.moveTo(0, -halfHeight).lineTo(halfWidth, 0)
    .lineTo(0, halfHeight).lineTo(-halfWidth, 0).closePath();
  if (family === 'dart') return graphic.moveTo(-halfWidth, -halfHeight).lineTo(halfWidth, -halfHeight)
    .lineTo(halfWidth, halfHeight * 0.2).lineTo(0, halfHeight)
    .lineTo(-halfWidth, halfHeight * 0.2).closePath();
  if (family === 'mine') return graphic.rect(-halfWidth, -halfHeight, halfWidth * 2, halfHeight * 2);
  return graphic.ellipse(0, 0, halfWidth, halfHeight);
}

export const hostileProjectileColor = (family: HostileProjectileFamily, aimed: boolean) => family === 'diamond' ? '#ff77ce'
  : family === 'dart' ? '#ffac58' : family === 'mine' ? '#ffe17d' : aimed ? '#ff9d63' : '#ff718f';
