import { getFireRateVolleySize, getTightVolleyOffsets } from './weaponTierProgression';

export const BIO_PRIMARY_DAMAGE_PER_ROUND = 0.5;
export const BIO_PRIMARY_RAIL_OFFSET_PX = 10;
export const BIO_PRIMARY_RAIL_STAGGER_FRAMES = 1;
export const BIO_PRIMARY_REPEAT_STAGGER_FRAMES = 2;
export const BIO_PRIMARY_PATTERN_RADIUS_PX = 16;

const BIO_PRIMARY_TIER_OFFSET_SCALE = 0.5;
const BIO_PRIMARY_MAX_SHOT_COPY_OFFSETS = [-1.25, 1.25] as const;

export interface BioPrimaryVisualRound {
  readonly offsetX: number;
  readonly angleOffset: 0;
  readonly launchDelayFrames: number;
}

export interface BioPrimaryPlannedShot {
  readonly fireDelayFrames: number;
  readonly offsetX: number;
  readonly angleBias: 0;
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
  repeatCount: number,
  maxShotActive: boolean
): readonly BioPrimaryVisualRound[] => {
  const tierOffsets = getTightVolleyOffsets(volleySize).map(
    (offsetX) => offsetX * BIO_PRIMARY_TIER_OFFSET_SCALE
  );
  const maxShotOffsets = maxShotActive ? BIO_PRIMARY_MAX_SHOT_COPY_OFFSETS : [0] as const;

  return Object.freeze(Array.from({ length: repeatCount }, (_, repeatIndex) => (
    tierOffsets.flatMap((tierOffset) => (
      maxShotOffsets.map((maxShotOffset) => Object.freeze({
        offsetX: tierOffset + maxShotOffset,
        angleOffset: 0 as const,
        launchDelayFrames: repeatIndex * BIO_PRIMARY_REPEAT_STAGGER_FRAMES
      }))
    ))
  )).flat());
};

/**
 * BIO trades one full-strength center round for two half-strength straight
 * rails. Fire-rate tiers, spread, and Max Shot add represented copies inside
 * each rail bundle. Presentation-only launch delays keep every repeat visibly
 * staggered while the simulation remains bounded at two authoritative rails,
 * preserving both the exact Research-ship damage total and mobile cadence.
 */
export const getBioPrimaryShotPlan = (
  fireRateLevel: number,
  spreadActive: boolean,
  maxShotActive: boolean
): BioPrimaryShotPlan => {
  const volleySize = getFireRateVolleySize(fireRateLevel);
  const repeatCount = spreadActive ? 3 : 1;
  const visualPattern = buildBioPrimaryVisualPattern(volleySize, repeatCount, maxShotActive);
  const shots: BioPrimaryPlannedShot[] = [];

  ([-1, 1] as const).forEach((rail, railIndex) => {
    shots.push(Object.freeze({
      fireDelayFrames: railIndex * BIO_PRIMARY_RAIL_STAGGER_FRAMES,
      offsetX: rail * BIO_PRIMARY_RAIL_OFFSET_PX,
      angleBias: 0 as const,
      damagePerRound: BIO_PRIMARY_DAMAGE_PER_ROUND,
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
    queuedEntityCount: Math.max(0, shots.length - 1),
    totalDamage: logicalRoundCount * BIO_PRIMARY_DAMAGE_PER_ROUND,
    shots: Object.freeze(shots)
  });
};
