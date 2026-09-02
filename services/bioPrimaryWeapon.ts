import {
  getFireRateProjectileDamageMultiplier,
  getFireRateVolleySize,
  getTightVolleyOffsets
} from './weaponTierProgression';
import { sampleTripleShotSideAngleRadians } from './playerShotSpread';

// 0.58 per rail: the twin rails together land 16% over the RSC pulse, so the
// paid BIO hull is "different and a little better", per Scott's brief.
export const BIO_PRIMARY_DAMAGE_PER_ROUND = 0.58;
export const BIO_PRIMARY_RAIL_OFFSET_PX = 10;
export const BIO_PRIMARY_RAIL_STAGGER_FRAMES = 1;
export const BIO_PRIMARY_REPEAT_STAGGER_FRAMES = 2;
export const BIO_PRIMARY_PATTERN_RADIUS_PX = 24;

const BIO_PRIMARY_TIER_OFFSET_SCALE = 0.5;
const BIO_PRIMARY_MAX_SHOT_COPY_OFFSETS = [-1.25, 1.25] as const;
const BIO_PRIMARY_SIDE_LANE_OFFSET_PX = 4;
const BIO_PRIMARY_SIDE_LANE_STAGGER_FRAMES = 1;

export interface BioPrimaryVisualRound {
  readonly offsetX: number;
  readonly angleOffset: 0;
  readonly launchDelayFrames: number;
}

export interface BioPrimaryPlannedShot {
  readonly fireDelayFrames: number;
  readonly offsetX: number;
  readonly angleBias: number;
  readonly damagePerRound: number;
  readonly representedRoundCount: number;
  readonly visualPattern: readonly BioPrimaryVisualRound[];
}

export interface BioPrimaryShotPlan {
  readonly volleySize: number;
  readonly repeatCount: number;
  readonly logicalRoundCount: number;
  readonly simulationEntityCount: number;
  readonly queuedEntityCount: number;
  readonly totalDamage: number;
  readonly shots: readonly BioPrimaryPlannedShot[];
}

const buildBioPrimaryVisualPattern = (
  volleySize: number,
  maxShotActive: boolean
): readonly BioPrimaryVisualRound[] => {
  const tierOffsets = getTightVolleyOffsets(volleySize).map(
    (offsetX) => offsetX * BIO_PRIMARY_TIER_OFFSET_SCALE
  );
  const maxShotOffsets = maxShotActive ? BIO_PRIMARY_MAX_SHOT_COPY_OFFSETS : [0] as const;

  return Object.freeze(([-1, 1] as const).flatMap((rail, railIndex) => (
    tierOffsets.flatMap((tierOffset, tierIndex) => (
      maxShotOffsets.map((maxShotOffset) => Object.freeze({
        offsetX: rail * BIO_PRIMARY_RAIL_OFFSET_PX + tierOffset + maxShotOffset,
        angleOffset: 0 as const,
        launchDelayFrames: railIndex * BIO_PRIMARY_RAIL_STAGGER_FRAMES
          + tierIndex * BIO_PRIMARY_REPEAT_STAGGER_FRAMES
      }))
    ))
  )));
};

/**
 * BIO trades one full-strength center round for two half-strength straight
 * rails. A spread power-up creates three authoritative lanes at the same
 * 15-20 degree angles as the standard triple shot, and every lane retains the
 * paired BIO rails. Fire-rate tiers and Max Shot remain bundled inside each
 * rail so the full angled pattern has correct collision paths without creating
 * a separate simulation entity for every visual round.
 */
export const getBioPrimaryShotPlan = (
  fireRateLevel: number,
  spreadActive: boolean,
  maxShotActive: boolean,
  leftAngleRandomUnit: number = 0.5,
  rightAngleRandomUnit: number = 0.5
): BioPrimaryShotPlan => {
  const volleySize = getFireRateVolleySize(fireRateLevel);
  const repeatCount = spreadActive ? 3 : 1;
  const visualPattern = buildBioPrimaryVisualPattern(volleySize, maxShotActive);
  const damagePerRound = BIO_PRIMARY_DAMAGE_PER_ROUND
    * getFireRateProjectileDamageMultiplier(volleySize);
  const shots: BioPrimaryPlannedShot[] = [];
  const lanes = spreadActive
    ? [
        { side: 0 as const, angle: 0, delay: 0 },
        {
          side: -1 as const,
          angle: sampleTripleShotSideAngleRadians(-1, leftAngleRandomUnit),
          delay: BIO_PRIMARY_SIDE_LANE_STAGGER_FRAMES
        },
        {
          side: 1 as const,
          angle: sampleTripleShotSideAngleRadians(1, rightAngleRandomUnit),
          delay: BIO_PRIMARY_SIDE_LANE_STAGGER_FRAMES * 2
        }
      ]
    : [{ side: 0 as const, angle: 0, delay: 0 }];

  lanes.forEach((lane) => {
    shots.push(Object.freeze({
      fireDelayFrames: lane.delay,
      offsetX: lane.side * BIO_PRIMARY_SIDE_LANE_OFFSET_PX,
      angleBias: lane.angle,
      damagePerRound,
      representedRoundCount: visualPattern.length,
      visualPattern
    }));
  });

  const logicalRoundCount = shots.reduce(
    (total, shot) => total + shot.representedRoundCount,
    0
  );

  return Object.freeze({
    volleySize,
    repeatCount,
    logicalRoundCount,
    simulationEntityCount: shots.length,
    queuedEntityCount: shots.filter((shot) => shot.fireDelayFrames > 0).length,
    totalDamage: logicalRoundCount * damagePerRound,
    shots: Object.freeze(shots)
  });
};
