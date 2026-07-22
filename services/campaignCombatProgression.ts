export const MAX_AUTHORED_CAMPAIGN_STAGES = 20;
export const CAMPAIGN_STAGES_PER_COMBAT_TIER = 5;
export const MAX_SHOT_VOLLEY_MULTIPLIER = 5;
export const MAX_SHOT_PROJECTILE_CAP = 15;
export const MAX_SHOT_SPREAD_DEGREES = 14;

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

/** Evenly fills a tight cone while keeping one exact center shot for odd volleys. */
export const getMaxShotAnglesRadians = (projectileCount: number) => {
  const count = clamp(
    Math.floor(Number(projectileCount) || MAX_SHOT_VOLLEY_MULTIPLIER),
    1,
    MAX_SHOT_PROJECTILE_CAP
  );
  if (count === 1) return [0];

  const spreadRadians = MAX_SHOT_SPREAD_DEGREES * (Math.PI / 180);
  return Array.from({ length: count }, (_, index) => (
    -spreadRadians + ((spreadRadians * 2 * index) / (count - 1))
  ));
};

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
