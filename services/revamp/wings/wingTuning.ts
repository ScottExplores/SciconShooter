import { getPlayerPrimaryBurst } from '../../playerPrimaryBurst';
import { getPlayerShipWeaponProfile } from '../../playerShipWeapons';
import { getFireRateIntervalFrames, getFireRateTier, getFireRateVolleyDamageMultiplier } from '../../weaponTierProgression';
import { getWeaponOverdriveTier } from '../../weaponOverdrive';

export type WingSlot = 'left' | 'right';
export type WingSpecial = 'laser-lance' | 'homing-swarm' | 'flak-burst' | 'shield-pulse' | 'bullet-eraser' | 'magnet-field';
// REVAMP(I): Enlarged support art needs space around the player's visible hull.
export const WING_OFFSET = 76;
export const WING_MUZZLE_OFFSET = 36;
export const WING_EDGE_MARGIN = 40;
export const WING_CENTER_CLEARANCE = 58;
export const WING_EDGE_STAGGER = 62;
export const clampWingLevel = (level: number) => Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));

/** Sustained first-target damage, independent of device, FPS and screen size. */
export const getMainWeaponDps = (shipId: string, fireRate: number, maxShot = false, overdrive = 0, extraProjectiles = 0, damageMultiplier = 1) => {
  const burst = getPlayerPrimaryBurst(shipId, fireRate, maxShot);
  const hull = getPlayerShipWeaponProfile(shipId);
  const base = burst
    ? (burst.totalDamage + Math.max(0, Math.min(2, extraProjectiles)) * burst.shots[0].damage * 0.5) * 60 / burst.cycleFrames
    : getFireRateVolleyDamageMultiplier(Math.min(7, getFireRateTier(fireRate) + extraProjectiles)) * hull.laneDamageScale
      * (maxShot ? 2 : 1) * 60 / (getFireRateIntervalFrames(fireRate) * hull.cadenceScale);
  return base * getWeaponOverdriveTier(overdrive).damageScale * damageMultiplier;
};

/** Each wing rises from 15% to 20%; extra rounds split, never multiply, its budget. */
export const getWingPassiveRatio = (level: number) => 0.15 + (clampWingLevel(level) - 1) * 0.0125;
export const getWingPassiveDamage = (mainDps: number, level: number, interval: number, supportMultiplier = 1) => (
  Math.max(0, mainDps) * getWingPassiveRatio(level) * Math.max(1, interval) / 60
  * Math.max(1, Math.min(1.3, supportMultiplier))
);

export const getWingSpecial = (slot: WingSlot, ability: string): WingSpecial => {
  if (slot === 'right') return ability === 'coin-magnet' ? 'magnet-field'
    : ability === 'twin-burst' || ability === 'prism-fan' || ability === 'nova-volley' ? 'bullet-eraser' : 'shield-pulse';
  return ability === 'homing-missile' ? 'homing-swarm'
    : ability === 'piercing-laser' || ability === 'targeting-laser' || ability === 'pulse-cannon' ? 'laser-lance' : 'flak-burst';
};

export const WING_SPECIAL_LABELS: Record<WingSpecial, string> = {
  'laser-lance': 'Laser Lance', 'homing-swarm': 'Homing Swarm', 'flak-burst': 'Flak Burst',
  'shield-pulse': 'Shield Pulse', 'bullet-eraser': 'Bullet Eraser', 'magnet-field': 'Magnet Field'
};
export const WING_EVOLUTION_LABELS: Record<WingSpecial, string> = {
  'laser-lance': 'Twin Lance', 'homing-swarm': 'Seeking Storm', 'flak-burst': 'Nova Flak',
  'shield-pulse': 'Aegis Pulse', 'bullet-eraser': 'Null Wave', 'magnet-field': 'Gravity Well'
};

export const getWingCooldownFrames = (special: WingSpecial, level: number, multiplier = 1) => {
  const seconds = special === 'shield-pulse' ? 18 : special === 'bullet-eraser' ? 16 : special === 'magnet-field' ? 14 : 12;
  return Math.round(Math.max(8, Math.min(20, seconds * (1 - (clampWingLevel(level) - 1) * 0.07)
    * Math.max(0.6, Math.min(1, multiplier)))) * 60);
};

export interface WingSpring { x: number; y: number; vx: number; vy: number; tilt: number }
/** Damped, bounded 60 Hz spring. No viewport or rendering clock enters it. */
export const stepWingSpring = (spring: WingSpring, targetX: number, targetY: number) => {
  spring.vx = Math.max(-18, Math.min(18, (spring.vx + (targetX - spring.x) * 0.085) * 0.72));
  spring.vy = Math.max(-18, Math.min(18, (spring.vy + (targetY - spring.y) * 0.085) * 0.72));
  spring.x += spring.vx;
  spring.y += spring.vy;
  spring.tilt += (Math.max(-0.28, Math.min(0.28, spring.vx * 0.027)) - spring.tilt) * 0.16;
  return spring;
};
