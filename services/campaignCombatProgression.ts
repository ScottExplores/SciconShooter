import { FIRE_RATE_MAX_VOLLEY_SIZE } from './weaponTierProgression';

/**
 * Compatibility count used by older presentation surfaces. It is not a
 * runtime content cap; GameEngine addresses every validated campaign level.
 */
export const MAX_AUTHORED_CAMPAIGN_STAGES = 20;
export const CAMPAIGN_STAGES_PER_COMBAT_TIER = 5;
export const MAX_LEGACY_CAMPAIGN_DIFFICULTY_TIER = 3;
/**
 * Max Shot doubles every round already present in the current weapon pattern.
 *
 * Tripling was tried and measured: at Tier 7 Triple it puts 1260 projectile
 * sprites on a mobile frame against a 900 budget. The pickup gets its "wall of
 * fire" read from a much wider angular fan instead of more sprites.
 */
export const MAX_SHOT_VOLLEY_MULTIPLIER = 2;
export const MAX_PRIMARY_SPREAD_LANES = 3;
export const MAX_SHOT_PROJECTILE_CAP = FIRE_RATE_MAX_VOLLEY_SIZE
  * MAX_PRIMARY_SPREAD_LANES
  * MAX_SHOT_VOLLEY_MULTIPLIER;
// Covers the longest authored viewport flight while allowing the four-frame
// Tier-7 cadence to recycle pooled bundles before the mobile entity ceiling.
export const MAX_SHOT_BUNDLE_LIFETIME_FRAMES = 96;
export const MAX_SHOT_SUSTAINED_VOLLEY_BUDGET = 24;

export interface MaxShotCopyOffset {
  readonly offsetX: number;
  readonly angleOffset: number;
  /** Optional presentation-only delay for rounds represented by one bundle. */
  readonly launchDelayFrames?: number;
}

export type MaxShotVisualRound = MaxShotCopyOffset;

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Max Shot splits every round into a diverging pair. The separation is much
 * wider than the original near-parallel 1.75px / 0.42deg pairing so the volley
 * opens into a visible cone as it travels, which is what makes the pickup read
 * as a super state without adding sprites.
 */
const MAX_SHOT_COPY_PATTERN: readonly MaxShotCopyOffset[] = Object.freeze([
  Object.freeze({ offsetX: -6.5, angleOffset: degreesToRadians(-5.4) }),
  Object.freeze({ offsetX: 6.5, angleOffset: degreesToRadians(5.4) })
]);

export const getMaxShotCopyPattern = () => MAX_SHOT_COPY_PATTERN;

export const buildMaxShotBundleVisualPattern = (
  baseOffsets: readonly number[],
  baseAngleOffsets: readonly number[]
): readonly MaxShotVisualRound[] => Object.freeze(baseOffsets.flatMap((offsetX, index) => (
  MAX_SHOT_COPY_PATTERN.map((copy) => Object.freeze({
    offsetX: offsetX + copy.offsetX,
    angleOffset: (baseAngleOffsets[index] || 0) + copy.angleOffset
  }))
)));

export const getPrimaryVolleySimulationEntityCount = (hasSpread: boolean) => (
  hasSpread ? MAX_PRIMARY_SPREAD_LANES : 1
);

export const getMaxShotSimulationEntityCount = (hasSpread: boolean) => (
  getPrimaryVolleySimulationEntityCount(hasSpread)
);

export const getMaxShotSustainedEntityFloor = (
  hasSpread: boolean,
  simulationEntityCount: number = getMaxShotSimulationEntityCount(hasSpread)
) => (
  Math.max(1, Math.floor(Number(simulationEntityCount) || 1))
  * MAX_SHOT_SUSTAINED_VOLLEY_BUDGET
);

export const canAdmitMaxShotVolley = (
  activePlayerShotEntities: number,
  pendingPlayerShotEntities: number,
  hasSpread: boolean,
  entityCap: number
) => (
  Math.max(0, Math.floor(Number(activePlayerShotEntities) || 0))
  + Math.max(0, Math.floor(Number(pendingPlayerShotEntities) || 0))
  + getMaxShotSimulationEntityCount(hasSpread)
  <= Math.max(0, Math.floor(Number(entityCap) || 0))
);

export const getMaxShotRoundsForTarget = (
  representedRoundsRemaining: number,
  targetHp: number,
  damagePerRound: number,
  bossTarget: boolean
) => {
  const remaining = Math.max(1, Math.floor(Number(representedRoundsRemaining) || 1));
  if (bossTarget) return remaining;
  const safeDamage = Math.max(0.001, Number(damagePerRound) || 1);
  const roundsToDefeat = Math.max(1, Math.ceil(Math.max(1, Number(targetHp) || 1) / safeDamage));
  return Math.min(remaining, roundsToDefeat);
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Compatibility difficulty bands saturate at the shipped fourth band. Mission
 * count is data-driven and is deliberately not constrained by this resolver.
 */
export const getCampaignProgressionTier = (stageNumber: number) => {
  const stage = Math.max(1, Math.floor(Number(stageNumber) || 1));
  return Math.min(
    MAX_LEGACY_CAMPAIGN_DIFFICULTY_TIER,
    Math.floor((stage - 1) / CAMPAIGN_STAGES_PER_COMBAT_TIER)
  );
};

export const getAuthoredCampaignStageCount = (configuredLevelCount: number) => Math.max(
  Math.floor(Number(configuredLevelCount) || 0),
  0
);

export const getNextAuthoredCampaignIndex = (
  currentIndex: number,
  totalEntries: number
) => {
  const current = Math.max(0, Math.floor(Number(currentIndex) || 0));
  const total = Math.max(0, Math.floor(Number(totalEntries) || 0));
  const next = current + 1;
  return next < total ? next : null;
};

export const getMaxShotProjectileCount = (baseVolleyCount: number) => clamp(
  Math.max(1, Math.floor(Number(baseVolleyCount) || 1)) * MAX_SHOT_VOLLEY_MULTIPLIER,
  MAX_SHOT_VOLLEY_MULTIPLIER,
  MAX_SHOT_PROJECTILE_CAP
);

export interface StageDepartureSignal {
  progress: number;
  speedBoost: number;
  hyperspeed: boolean;
  hyperspeedStrength: number;
}

export const getStageDepartureSignal = (
  remainingFrames: number,
  durationFrames: number
): StageDepartureSignal => {
  const duration = Math.max(1, Math.floor(Number(durationFrames) || 1));
  const remaining = clamp(Math.floor(Number(remainingFrames) || 0), 0, duration);
  if (remaining <= 0) {
    return {
      progress: 0,
      speedBoost: 1,
      hyperspeed: false,
      hyperspeedStrength: 0
    };
  }

  const progress = clamp((duration - remaining) / duration, 0, 1);
  const hyperspeedStrength = clamp((progress - 0.24) / 0.76, 0, 1);
  return {
    progress,
    speedBoost: 1 + hyperspeedStrength * 5,
    hyperspeed: remaining > 0 && progress >= 0.24,
    hyperspeedStrength
  };
};
