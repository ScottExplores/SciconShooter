/** Bounded utility tuning shared by the runtime and deterministic tests. */
export const SQUAD_COMPANION_DISPLAY_SCALE = 0.7;
export const getSalvageLeash = (level: number) => 155 + Math.max(1, Math.min(5, level)) * 25;
export const getInterceptorCooldown = (level: number) => (7 - Math.max(1, Math.min(5, level)) * 0.6) * 60;
export const getInterceptorRadius = (level: number) => Math.round(
  (42 + Math.max(1, Math.min(5, level)) * 5) * SQUAD_COMPANION_DISPLAY_SCALE
);

export interface UtilityTarget {
  id: string; type: string; x: number; y: number; width: number; height: number;
  markedForDeletion: boolean; isPlayerShot?: boolean; isBeam?: boolean;
}

export const findSalvageTarget = (entities: readonly UtilityTarget[], x: number, y: number, level: number) => {
  let closest: UtilityTarget | null = null;
  let distance = getSalvageLeash(level) ** 2;
  for (const target of entities) {
    if (target.type !== 'COIN' || target.markedForDeletion) continue;
    const dx = target.x + target.width / 2 - x, dy = target.y + target.height / 2 - y;
    const candidate = dx * dx + dy * dy;
    if (candidate < distance) { closest = target; distance = candidate; }
  }
  return closest;
};

/** Interception never erases beams, bosses, body hazards or friendly shots. */
export const findInterceptTarget = (entities: readonly UtilityTarget[], x: number, y: number, level: number) => {
  let closest: UtilityTarget | null = null;
  let distance = getInterceptorRadius(level) ** 2;
  for (const target of entities) {
    if (target.type !== 'PROJECTILE' || target.markedForDeletion || target.isPlayerShot || target.isBeam) continue;
    const dx = target.x + target.width / 2 - x, dy = target.y + target.height / 2 - y;
    const candidate = dx * dx + dy * dy;
    if (candidate < distance) { closest = target; distance = candidate; }
  }
  return closest;
};
