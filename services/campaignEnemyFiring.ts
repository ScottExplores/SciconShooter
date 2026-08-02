import type {
  EnemyGameplayRole,
  EnemyRoleDefinition,
  FormationPackDefinition
} from '../game-config/types';

export type CampaignEnemyFormationState = 'entry' | 'hold' | 'dive' | 'return';

export interface CampaignEnemyFireEligibility {
  behavior?: EnemyRoleDefinition['fireBehavior'];
  fireDelaySeconds?: number;
  formationFiringBehavior?: FormationPackDefinition['firingBehavior'];
  formationState?: CampaignEnemyFormationState;
  formationGroupReady?: boolean;
  formationAttackSelected?: boolean;
  formationAttackActive?: boolean;
  isElite: boolean;
  spawnFrame: number;
  currentFrame: number;
  framesPerSecond: number;
}

/**
 * Every authored shooter gets a readable, deterministic quiet window after it
 * spawns. Legacy enemies without Campaign role metadata retain their existing
 * behavior so old previews and compatibility fixtures are not silently muted.
 */
export const getCampaignFireDelayFrames = (
  delaySeconds: number | undefined,
  framesPerSecond: number
) => Math.max(
  0,
  Math.ceil(Math.max(0, Number(delaySeconds) || 0) * Math.max(1, framesPerSecond))
);

const formationAllowsFire = ({
  formationFiringBehavior,
  formationState,
  formationGroupReady,
  formationAttackSelected,
  formationAttackActive
}: Pick<CampaignEnemyFireEligibility, 'formationFiringBehavior' | 'formationState' | 'formationGroupReady' | 'formationAttackSelected' | 'formationAttackActive'>) => {
  if (formationFiringBehavior === 'none') return false;
  if (formationState === 'entry' || formationState === 'return') return false;
  if (formationFiringBehavior === 'post-formation') {
    return formationState === undefined || (formationGroupReady !== false && formationState === 'hold');
  }
  // Authored staggered and priority formations may only fire from the
  // subgroup currently selected by the group controller.
  return formationState === undefined || Boolean(formationGroupReady && formationAttackSelected && formationAttackActive);
};

export const canCampaignEnemyFire = (input: CampaignEnemyFireEligibility) => {
  const {
    behavior,
    fireDelaySeconds,
    formationState,
    isElite,
    spawnFrame,
    currentFrame,
    framesPerSecond
  } = input;

  // No role metadata means a legacy/non-Campaign enemy. Preserve compatibility.
  if (behavior === undefined) return true;
  if (behavior === 'none' || !formationAllowsFire(input)) return false;

  const delayFrames = getCampaignFireDelayFrames(fireDelaySeconds, framesPerSecond);
  if (Math.max(0, currentFrame - spawnFrame) < delayFrames) return false;

  if (behavior === 'post-formation') {
    return formationState === undefined || formationState === 'hold';
  }
  if (behavior === 'formation-command') return formationState === 'dive';
  if (behavior === 'elite-only') return isElite;
  return true;
};

const PRIORITY_FIRE_ROLES = new Set<EnemyGameplayRole>([
  'burst-shooter',
  'suppressor',
  'priority-target',
  'formation-leader',
  'elite'
]);

export const isCampaignPriorityFireRole = (role?: EnemyGameplayRole) => (
  role !== undefined && PRIORITY_FIRE_ROLES.has(role)
);

export const resolveCampaignFormationFiringBehavior = (
  roleId: string | undefined,
  packs: readonly FormationPackDefinition[]
) => {
  if (!roleId) return undefined;
  return packs.find((pack) => pack.enemyRoleIds.includes(roleId))?.firingBehavior;
};
