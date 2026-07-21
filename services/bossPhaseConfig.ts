import type {
  BossHealthPhase,
  BossWeaponSetting,
  MovementPatternId
} from '../game-config/types';

export interface ResolvedBossPhaseConfig {
  readonly healthRatio: number;
  readonly phaseIndex: number;
  readonly phaseId: string;
  readonly movementPatternId: MovementPatternId;
  readonly speedMultiplier: number;
  readonly weaponSettings: readonly BossWeaponSetting[];
}

/**
 * Resolves the latest authored phase whose descending health threshold has
 * been crossed. Campaign validation guarantees a full-health first phase and
 * valid weapon references; the defensive filtering keeps draft previews safe.
 */
export const resolveBossPhaseConfig = (
  health: number,
  maxHealth: number,
  phases: readonly BossHealthPhase[],
  weapons: readonly BossWeaponSetting[]
): ResolvedBossPhaseConfig | null => {
  if (phases.length === 0) return null;

  const safeMaxHealth = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : 1;
  const rawRatio = Number.isFinite(health) ? health / safeMaxHealth : 1;
  const healthRatio = Math.max(0, Math.min(1, rawRatio));
  let phaseIndex = 0;

  for (let index = 0; index < phases.length; index += 1) {
    if (healthRatio <= phases[index].triggerHealthRatio) phaseIndex = index;
  }

  const phase = phases[phaseIndex];
  const weaponsById = new Map(weapons.map((weapon) => [weapon.id, weapon]));
  const weaponSettings = phase.weaponSettingIds
    .map((id) => weaponsById.get(id))
    .filter((weapon): weapon is BossWeaponSetting => Boolean(weapon));

  return {
    healthRatio,
    phaseIndex,
    phaseId: phase.id,
    movementPatternId: phase.movementPatternId,
    speedMultiplier: phase.speedMultiplier,
    weaponSettings
  };
};
