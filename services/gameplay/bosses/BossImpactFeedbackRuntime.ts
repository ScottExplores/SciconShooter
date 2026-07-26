const finiteNonNegative = (value: number) => (
  Math.max(0, Number.isFinite(value) ? value : 0)
);

export const getBossSignificantDamageThreshold = (maximumHealth: number) => (
  Math.max(12, finiteNonNegative(maximumHealth) * 0.002)
);

export const isBossHullImpactSignificant = (
  appliedDamage: number,
  maximumHealth: number
) => (
  finiteNonNegative(appliedDamage)
  >= getBossSignificantDamageThreshold(maximumHealth)
);

export const getBossHullImpactStrength = (
  appliedDamage: number,
  maximumHealth: number
) => {
  const threshold = getBossSignificantDamageThreshold(maximumHealth);
  return Math.max(0.7, Math.min(1.5, finiteNonNegative(appliedDamage) / threshold));
};
