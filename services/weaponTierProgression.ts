export const FIRE_RATE_LEVELS_PER_TIER = 7;
export const FIRE_RATE_TIER_COUNT = 7;
export const FIRE_RATE_MAX_LEVEL = FIRE_RATE_LEVELS_PER_TIER * FIRE_RATE_TIER_COUNT;
export const FIRE_RATE_LEGACY_MAX_LEVEL = 21;
export const FIRE_RATE_MAX_VOLLEY_SIZE = FIRE_RATE_TIER_COUNT;

/**
 * Total primary-weapon damage represented by each tier's volley. The first
 * three entries preserve the shipped 1x/2x/3x behavior. Later tiers add
 * visible rounds without turning seven projectiles into an unchecked 7x
 * damage multiplier.
 */
export const FIRE_RATE_VOLLEY_DAMAGE_MULTIPLIERS = Object.freeze([
  1,
  2,
  3,
  3.45,
  3.85,
  4.2,
  4.5
] as const);

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
  const legacyLevel = Math.min(safeLevel, FIRE_RATE_LEGACY_MAX_LEVEL);
  const legacyInterval = 15 * Math.pow(5 / 15, legacyLevel / FIRE_RATE_LEGACY_MAX_LEVEL);
  if (safeLevel <= FIRE_RATE_LEGACY_MAX_LEVEL) return legacyInterval;

  const advancedProgress = (safeLevel - FIRE_RATE_LEGACY_MAX_LEVEL)
    / (FIRE_RATE_MAX_LEVEL - FIRE_RATE_LEGACY_MAX_LEVEL);
  return 5 * Math.pow(4 / 5, advancedProgress);
};

export const getTightVolleyOffsets = (volleySize: number): readonly number[] => {
  const safeVolleySize = Math.max(1, Math.min(
    FIRE_RATE_MAX_VOLLEY_SIZE,
    Math.floor(Number(volleySize) || 1)
  ));
  if (safeVolleySize === 1) return Object.freeze([0]);
  if (safeVolleySize === 2) return Object.freeze([-3.5, 3.5]);
  if (safeVolleySize === 3) return Object.freeze([-6, 0, 6]);

  const spacing = Math.max(4.75, 6.5 - (safeVolleySize - 3) * 0.5);
  const center = (safeVolleySize - 1) / 2;
  return Object.freeze(Array.from(
    { length: safeVolleySize },
    (_, index) => (index - center) * spacing
  ));
};

const degreesToRadians = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Higher-tier rounds begin close together, then separate just enough to read
 * as distinct projectiles instead of travelling in perfectly parallel rails.
 */
export const getTightVolleyAngleOffsets = (volleySize: number): readonly number[] => {
  const safeVolleySize = Math.max(1, Math.min(
    FIRE_RATE_MAX_VOLLEY_SIZE,
    Math.floor(Number(volleySize) || 1)
  ));
  if (safeVolleySize === 1) return Object.freeze([0]);

  const maximumAngleDegrees = [0, 1.25, 1.6, 1.9, 2.15, 2.35, 2.5][safeVolleySize - 1];
  const center = (safeVolleySize - 1) / 2;
  return Object.freeze(Array.from(
    { length: safeVolleySize },
    (_, index) => degreesToRadians(((index - center) / center) * maximumAngleDegrees)
  ));
};

export const getFireRateVolleyDamageMultiplier = (volleySize: number) => {
  const safeVolleySize = Math.max(1, Math.min(
    FIRE_RATE_MAX_VOLLEY_SIZE,
    Math.floor(Number(volleySize) || 1)
  ));
  return FIRE_RATE_VOLLEY_DAMAGE_MULTIPLIERS[safeVolleySize - 1];
};

export const getFireRateProjectileDamageMultiplier = (volleySize: number) => (
  getFireRateVolleyDamageMultiplier(volleySize)
  / Math.max(1, Math.min(FIRE_RATE_MAX_VOLLEY_SIZE, Math.floor(Number(volleySize) || 1)))
);
