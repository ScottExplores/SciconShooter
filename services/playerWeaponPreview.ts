import { getBioPrimaryShotPlan } from './bioPrimaryWeapon';
import { type PlayerShipId } from './playerShipService';
import { sampleTripleShotSideAngleRadians } from './playerShotSpread';
import {
  getPlayerWeaponFrames
} from './playerWeaponVisuals';
import {
  getFireRateIntervalFrames,
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
const MIDPOINT_SPREAD_SAMPLE = 0.5;

/**
 * Preview-only copy stays outside the balance-proofed Overdrive module. These
 * descriptions deliberately name only behavior the live primary-fire path has.
 */
export const PLAYER_SHIP_WEAPON_PREVIEW_SPECS: Readonly<Record<PlayerShipId, string>> = Object.freeze({
  researchhub: 'Pulse column - tight centre rounds; each Fire Rate tier adds another bolt',
  bio: 'Bio volley - staggered twin lanes with piercing rounds',
  eth: 'Prism spread - triple lanes, sides angled 15-20 degrees',
  btc: 'Pulse column - tight centre rounds fired from the BTC hull'
});

const radiansToDegrees = (radians: number) => radians * (180 / Math.PI);
const getTravelX = (angleRadians: number) => (
  Math.sin(angleRadians) * PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX
);

export const getPlayerWeaponPreviewVolleyIntervalMs = (fireRateLevel: number) => (
  getFireRateIntervalFrames(fireRateLevel) * PLAYER_WEAPON_PREVIEW_FRAME_MS
);

export const getPlayerWeaponPreviewVolleyLifetimeMs = (
  shots: readonly PlayerWeaponPreviewShot[]
) => PLAYER_WEAPON_PREVIEW_FLIGHT_MS + shots.reduce(
  (longestDelay, shot) => Math.max(longestDelay, shot.delayMs),
  0
);

export const getPlayerWeaponPreviewActiveVolleyLimit = (
  fireRateLevel: number,
  shots: readonly PlayerWeaponPreviewShot[]
) => Math.min(
  PLAYER_WEAPON_PREVIEW_MAX_ACTIVE_VOLLEYS,
  Math.max(1, Math.ceil(
    getPlayerWeaponPreviewVolleyLifetimeMs(shots)
    / getPlayerWeaponPreviewVolleyIntervalMs(fireRateLevel)
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
  if (shipId === 'bio') {
    const plan = getBioPrimaryShotPlan(
      fireRateLevel,
      false,
      false,
      MIDPOINT_SPREAD_SAMPLE,
      MIDPOINT_SPREAD_SAMPLE
    );

    return Object.freeze(plan.shots.flatMap((shot, shotIndex) => (
      shot.visualPattern.map((round, roundIndex) => Object.freeze({
        id: `bio-${shotIndex}-${roundIndex}`,
        startX: shot.offsetX + round.offsetX,
        travelX: getTravelX(shot.angleBias + round.angleOffset),
        angleDegrees: radiansToDegrees(shot.angleBias + round.angleOffset),
        delayMs: (shot.fireDelayFrames + round.launchDelayFrames) * PLAYER_WEAPON_PREVIEW_FRAME_MS
      }))
    )));
  }

  if (shipId === 'eth') {
    const leftAngle = sampleTripleShotSideAngleRadians(-1, MIDPOINT_SPREAD_SAMPLE);
    const rightAngle = sampleTripleShotSideAngleRadians(1, MIDPOINT_SPREAD_SAMPLE);
    return Object.freeze([
      ...buildTightVolleyShots(shipId, fireRateLevel, 'left', -4, leftAngle, PLAYER_WEAPON_PREVIEW_FRAME_MS),
      ...buildTightVolleyShots(shipId, fireRateLevel, 'centre'),
      ...buildTightVolleyShots(shipId, fireRateLevel, 'right', 4, rightAngle, PLAYER_WEAPON_PREVIEW_FRAME_MS * 2)
    ]);
  }

  return Object.freeze(buildTightVolleyShots(shipId, fireRateLevel, 'centre'));
};

export const getPlayerWeaponPreviewFrames = (shipId: PlayerShipId) => (
  getPlayerWeaponFrames(
    shipId === 'bio' ? 'bio-primary' : 'pulse',
    0
  )
);
