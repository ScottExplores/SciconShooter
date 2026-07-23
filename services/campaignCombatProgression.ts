export const MAX_AUTHORED_CAMPAIGN_STAGES = 20;
export const CAMPAIGN_STAGES_PER_COMBAT_TIER = 5;
export const MAX_SHOT_VOLLEY_MULTIPLIER = 2;
export const MAX_SHOT_PROJECTILE_CAP = 18;
export const MAX_SHOT_BUNDLE_LIFETIME_FRAMES = 120;
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
 * Max Shot doubles every round already present in the current weapon pattern.
 * The pair is separated only enough to remain legible while preserving the
 * center or triple-shot lane it belongs to.
 */
const MAX_SHOT_COPY_PATTERN: readonly MaxShotCopyOffset[] = Object.freeze([
  Object.freeze({ offsetX: -1.75, angleOffset: degreesToRadians(-0.42) }),
  Object.freeze({ offsetX: 1.75, angleOffset: degreesToRadians(0.42) })
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

export const getMaxShotSimulationEntityCount = (hasSpread: boolean) => hasSpread ? 3 : 1;

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
 * Stages are finite authored content. This is deliberately not an endless-cycle
 * counter: Stages 1-5 are tier 0 and Stages 16-20 are the final tier 3.
 */
export const getCampaignProgressionTier = (stageNumber: number) => {
  const stage = clamp(
    Math.floor(Number(stageNumber) || 1),
    1,
    MAX_AUTHORED_CAMPAIGN_STAGES
  );
  return Math.floor((stage - 1) / CAMPAIGN_STAGES_PER_COMBAT_TIER);
};

export const getAuthoredCampaignStageCount = (configuredLevelCount: number) => clamp(
  Math.floor(Number(configuredLevelCount) || 0),
  0,
  MAX_AUTHORED_CAMPAIGN_STAGES
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
