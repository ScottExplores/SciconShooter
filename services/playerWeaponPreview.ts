import { type PlayerShipId } from './playerShipService';
import { getPlayerPrimaryBurst, getPlayerPrimaryMuzzle, getPlayerPrimaryPulseLayout } from './playerPrimaryBurst';
import {
  getPlayerShipWeaponVisualFamily,
  getPlayerWeaponFrames,
  getPlayerEnergyBoltPresentation
} from './playerWeaponVisuals';
import {
  getFireRateIntervalFrames,
  getFireRateTier,
  getFireRateVolleySize,
  getTightVolleyAngleOffsets,
  getTightVolleyOffsets
} from './weaponTierProgression';

export interface PlayerWeaponPreviewShot {
  readonly id: string;
  readonly startX: number;
  readonly travelX: number;
  readonly angleDegrees: number;
  readonly delayMs: number;
}

export const PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX = 190;
export const PLAYER_WEAPON_PREVIEW_PROJECTILE_SPEED_PX_PER_FRAME = 10;
export const PLAYER_WEAPON_PREVIEW_FRAME_MS = 1000 / 60;
export const PLAYER_WEAPON_PREVIEW_FLIGHT_MS = (
  PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX
  / PLAYER_WEAPON_PREVIEW_PROJECTILE_SPEED_PX_PER_FRAME
) * PLAYER_WEAPON_PREVIEW_FRAME_MS;
export const PLAYER_WEAPON_PREVIEW_MAX_ACTIVE_VOLLEYS = 8;

/**
 * Preview-only copy stays outside the balance-proofed Overdrive module. These
 * descriptions deliberately name only behavior the live primary-fire path has.
 */
export const PLAYER_SHIP_WEAPON_PREVIEW_SPECS: Readonly<Record<PlayerShipId, string>> = Object.freeze({
  researchhub: 'Pulse column - tight centre rounds; each Fire Rate tier adds another bolt',
  bio: 'Bio rails - alternating twin lanes, +16% output; rails pierce from Tier 4',
  eth: 'Prism spread - triple lanes fired in a rippling fan; best crowd coverage',
  btc: 'Hash bolt - rhythmic gold pulses, 2.1x damage, punches through the first hull'
});

const radiansToDegrees = (radians: number) => radians * (180 / Math.PI);
const getTravelX = (angleRadians: number) => (
  Math.sin(angleRadians) * PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX
);

/** Match the live primary's bounded energy silhouette in the Hangar without
 * changing the preview's shared firing plan or animation clock. */
export const getPlayerWeaponPreviewPresentation = (shipId: PlayerShipId, fireRateLevel: number) => {
  const visualLevel = getFireRateTier(fireRateLevel) - 1;
  const unitWidth = shipId === 'btc' ? 16 : shipId === 'bio' ? 9 : 10;
  const unitHeight = shipId === 'btc' ? 40 : 28;
  return getPlayerEnergyBoltPresentation(getPlayerShipWeaponVisualFamily(shipId), visualLevel,
    0, PLAYER_WEAPON_PREVIEW_PROJECTILE_SPEED_PX_PER_FRAME,
    getPlayerPrimaryPulseLayout(unitWidth, unitHeight, visualLevel));
};

export const getPlayerWeaponPreviewVolleyIntervalMs = (fireRateLevel: number, shipId: PlayerShipId = 'researchhub') => (
  (getPlayerPrimaryBurst(shipId, fireRateLevel, false)?.cycleFrames
    ?? getFireRateIntervalFrames(fireRateLevel)) * PLAYER_WEAPON_PREVIEW_FRAME_MS
);

export const getPlayerWeaponPreviewVolleyLifetimeMs = (
  shots: readonly PlayerWeaponPreviewShot[]
) => PLAYER_WEAPON_PREVIEW_FLIGHT_MS + shots.reduce(
  (longestDelay, shot) => Math.max(longestDelay, shot.delayMs),
  0
);

export const getPlayerWeaponPreviewActiveVolleyLimit = (
  fireRateLevel: number,
  shots: readonly PlayerWeaponPreviewShot[],
  shipId: PlayerShipId = 'researchhub'
) => Math.min(
  PLAYER_WEAPON_PREVIEW_MAX_ACTIVE_VOLLEYS,
  Math.max(1, Math.ceil(
    getPlayerWeaponPreviewVolleyLifetimeMs(shots)
    / getPlayerWeaponPreviewVolleyIntervalMs(fireRateLevel, shipId)
  ))
);

const buildTightVolleyShots = (
  shipId: PlayerShipId,
  fireRateLevel: number,
  laneId: string,
  laneStartX = 0,
  laneAngleRadians = 0,
  laneDelayMs = 0
) => {
  const volleySize = getFireRateVolleySize(fireRateLevel);
  const offsets = getTightVolleyOffsets(volleySize);
  const angleOffsets = getTightVolleyAngleOffsets(volleySize);

  return offsets.map((offsetX, index) => {
    const angleRadians = laneAngleRadians + (angleOffsets[index] ?? 0);
    return Object.freeze({
      id: `${shipId}-${laneId}-${index}`,
      startX: laneStartX + offsetX,
      travelX: getTravelX(angleRadians),
      angleDegrees: radiansToDegrees(angleRadians),
      delayMs: laneDelayMs
    });
  });
};

/**
 * Builds a small deterministic presentation of the same primary-fire geometry
 * used by gameplay. The preview does not create simulation entities or alter
 * collision rules; it only turns the shared lane plans into screen motion.
 */
export const getPlayerWeaponPreviewShots = (
  shipId: PlayerShipId,
  fireRateLevel: number
): readonly PlayerWeaponPreviewShot[] => {
  const burst = getPlayerPrimaryBurst(shipId, fireRateLevel, false);
  if (burst) {
    return Object.freeze(burst.shots.map((shot, index) => Object.freeze({
      id: `${shipId}-pulse-${index}`,
      startX: getPlayerPrimaryMuzzle({ shipId, x: -40, y: 0, width: 80, height: 80,
        drawScale: 1, barrel: shot.barrel }).x,
      travelX: getTravelX(shot.angle),
      angleDegrees: radiansToDegrees(shot.angle),
      delayMs: shot.fireDelayFrames * PLAYER_WEAPON_PREVIEW_FRAME_MS
    })));
  }

  return Object.freeze(buildTightVolleyShots(shipId, fireRateLevel, 'centre'));
};

/** The Hangar preview fires the hull's own art, exactly like gameplay. */
export const getPlayerWeaponPreviewFrames = (shipId: PlayerShipId) => (
  getPlayerWeaponFrames(
    shipId === 'bio' ? 'bio-primary' : shipId === 'btc' ? 'btc-bolt' : 'pulse',
    0,
    getPlayerShipWeaponVisualFamily(shipId)
  )
);
