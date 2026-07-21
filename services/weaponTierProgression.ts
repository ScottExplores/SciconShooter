export const FIRE_RATE_LEVELS_PER_TIER = 7;
export const FIRE_RATE_TIER_COUNT = 3;
export const FIRE_RATE_MAX_LEVEL = FIRE_RATE_LEVELS_PER_TIER * FIRE_RATE_TIER_COUNT;

const clampFireRateLevel = (level: number) => Math.max(
  0,
  Math.min(FIRE_RATE_MAX_LEVEL, Math.floor(Number(level) || 0))
);

export const getFireRateTier = (level: number) => Math.min(
  FIRE_RATE_TIER_COUNT,
  Math.floor(clampFireRateLevel(level) / FIRE_RATE_LEVELS_PER_TIER) + 1
);

export const getFireRateTierProgress = (level: number) => {
  const safeLevel = clampFireRateLevel(level);
  return safeLevel === FIRE_RATE_MAX_LEVEL
    ? FIRE_RATE_LEVELS_PER_TIER
    : safeLevel % FIRE_RATE_LEVELS_PER_TIER;
};

export const getFireRateVolleySize = (level: number) => getFireRateTier(level);

export const getFireRateIntervalFrames = (level: number) => {
  const safeLevel = clampFireRateLevel(level);
  const progress = safeLevel / FIRE_RATE_MAX_LEVEL;
  return 15 * Math.pow(5 / 15, progress);
};

export const getTightVolleyOffsets = (volleySize: number): readonly number[] => {
  if (volleySize >= 3) return [-6, 0, 6];
  if (volleySize === 2) return [-3.5, 3.5];
  return [0];
};
