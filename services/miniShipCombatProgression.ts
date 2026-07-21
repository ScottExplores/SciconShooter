const clampMiniShipLevel = (level: number) => Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));

/** Every level improves damage, with an extra capstone bump at level five. */
export const getMiniShipDamageMultiplier = (level: number) => {
  const safeLevel = clampMiniShipLevel(level);
  return 1 + ((safeLevel - 1) * 0.22) + (safeLevel >= 5 ? 0.12 : 0);
};

/** Cadence improves at every level while retaining a safe mobile-friendly floor. */
export const getMiniShipFireIntervalFrames = (baseIntervalFrames: number, level: number) => {
  const safeLevel = clampMiniShipLevel(level);
  const capstoneCadenceBonus = safeLevel >= 5 ? 2 : 0;
  return Math.max(18, Math.round(baseIntervalFrames) - ((safeLevel - 1) * 3) - capstoneCadenceBonus);
};

/**
 * Role-specific projectile milestones make levels three and five immediately
 * visible without replacing each mini ship's combat identity.
 */
export const getMiniShipVolleySize = (ability: string, level: number) => {
  const safeLevel = clampMiniShipLevel(level);
  switch (ability) {
    case 'prism-fan':
      return safeLevel >= 5 ? 7 : safeLevel >= 3 ? 5 : 3;
    case 'nova-volley':
      return safeLevel >= 5 ? 9 : safeLevel >= 3 ? 7 : 5;
    case 'twin-burst':
      return safeLevel >= 5 ? 4 : safeLevel >= 3 ? 3 : 2;
    case 'coin-magnet':
    case 'homing-missile':
      return safeLevel >= 4 ? 2 : 1;
    case 'heavy-cannon':
      return safeLevel >= 5 ? 2 : 1;
    case 'pulse-cannon':
    case 'spread-cycle':
    case 'piercing-laser':
    case 'targeting-laser':
      return safeLevel >= 5 ? 3 : safeLevel >= 3 ? 2 : 1;
    default:
      return 1;
  }
};
