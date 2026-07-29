import type {
  EnemyRoleDefinition,
  FormationPackDefinition,
  SpawnEvent
} from '../game-config/types';

type CampaignFormationSpawnEvent = Pick<SpawnEvent, 'patternId' | 'enemies'>;

export interface CampaignFormationInstanceAdmission {
  pack: Pick<FormationPackDefinition, 'maximumSimultaneousInstances' | 'recoveryRequiredSeconds'>;
  alreadyStarted: boolean;
  activeInstanceCount: number;
  lastRetiredFrame?: number;
  currentFrame: number;
  framesPerSecond: number;
}

export interface CampaignShooterSlotCandidate {
  id: string;
  priority: boolean;
  spawnFrame: number;
  sourceEventId?: string;
  formationIndex?: number;
}

export const isCampaignFormationPattern = (patternId: string | undefined) => {
  const normalized = String(patternId || '').trim().toLowerCase();
  return normalized.length > 0
    && !normalized.includes('single')
    && !normalized.includes('random');
};

/**
 * A spawn event is one formation-pack instance. Pack identity comes only from
 * the packs explicitly declared by the current Wave: matching a similarly
 * shaped global pack would make an undeclared encounter inherit restrictions.
 * Authored remix Waves may vary a pack's shape, so complete role compatibility
 * is authoritative and formationShape is only an ambiguity resolver.
 */
export const resolveCampaignFormationPackForSpawn = (
  event: CampaignFormationSpawnEvent,
  packs: readonly FormationPackDefinition[]
) => {
  if (!isCampaignFormationPattern(event.patternId)) return undefined;
  const roleIds = [...new Set(
    event.enemies.map((enemy) => enemy.roleId).filter((roleId): roleId is string => Boolean(roleId))
  )];
  if (roleIds.length === 0) return undefined;

  const roleCompatiblePacks = packs.filter((pack) => (
    roleIds.every((roleId) => pack.enemyRoleIds.includes(roleId))
  ));
  if (roleCompatiblePacks.length === 1) return roleCompatiblePacks[0];
  const shapeMatches = roleCompatiblePacks.filter((pack) => pack.formationShape === event.patternId);
  return shapeMatches.length === 1 ? shapeMatches[0] : undefined;
};

export const getCampaignFormationRecoveryFrames = (
  recoveryRequiredSeconds: number | undefined,
  framesPerSecond: number
) => Math.max(
  0,
  Math.ceil(
    Math.max(0, Number(recoveryRequiredSeconds) || 0)
      * Math.max(1, Number(framesPerSecond) || 1)
  )
);

export const canStartCampaignFormationPackInstance = ({
  pack,
  alreadyStarted,
  activeInstanceCount,
  lastRetiredFrame,
  currentFrame,
  framesPerSecond
}: CampaignFormationInstanceAdmission) => {
  // A pack ceiling never interrupts an instance that has already begun; it
  // only delays the first member of a later authored spawn event.
  if (alreadyStarted) return true;
  const maximumInstances = Math.max(1, Math.floor(Number(pack.maximumSimultaneousInstances) || 1));
  if (Math.max(0, Math.floor(activeInstanceCount)) >= maximumInstances) return false;
  if (lastRetiredFrame === undefined) return true;

  const recoveryFrames = getCampaignFormationRecoveryFrames(
    pack.recoveryRequiredSeconds,
    framesPerSecond
  );
  return Math.max(0, currentFrame - lastRetiredFrame) >= recoveryFrames;
};

/**
 * No separate global shooter number is authored. The exact aggregate ceiling
 * is therefore derived from the unique firing roles referenced by this Wave
 * and their existing maximumSimultaneousCount values. This adds no hidden
 * tuning constant and leaves legacy Waves without role metadata unchanged.
 */
export const getCampaignWaveSimultaneousShooterLimit = (
  events: readonly CampaignFormationSpawnEvent[],
  roles: readonly EnemyRoleDefinition[]
) => {
  const rolesById = new Map(roles.map((role) => [role.id, role]));
  const referencedRoleIds = new Set<string>();
  events.forEach((event) => {
    event.enemies.forEach((enemy) => {
      if (enemy.roleId) referencedRoleIds.add(enemy.roleId);
    });
  });

  let firingRoleCount = 0;
  let limit = 0;
  referencedRoleIds.forEach((roleId) => {
    const role = rolesById.get(roleId);
    if (!role || role.fireBehavior === 'none') return;
    firingRoleCount++;
    limit += Math.max(1, Math.floor(Number(role.maximumSimultaneousCount) || 1));
  });
  return firingRoleCount > 0 ? limit : undefined;
};

/** Reuses the existing hostile-shot progression ceiling as the shooter-slot ceiling. */
export const getCampaignBaseSimultaneousShooterLimit = (missionNumber: number) => (
  Math.min(12, 4 + Math.max(1, Math.floor(Number(missionNumber) || 1)) * 2)
);

export const getCampaignSimultaneousShooterLimit = (
  missionNumber: number,
  authoredRoleLimit: number | undefined
) => authoredRoleLimit === undefined
  ? undefined
  : Math.min(
      getCampaignBaseSimultaneousShooterLimit(missionNumber),
      Math.max(1, Math.floor(authoredRoleLimit))
    );

/**
 * Returns a deterministic capped source set. Priority/elite sources get the
 * first readable firing slots, then older formations win stable ties.
 */
export const selectCampaignShooterSlotIds = (
  candidates: readonly CampaignShooterSlotCandidate[],
  limit: number
) => [...candidates]
  .sort((left, right) => (
    Number(right.priority) - Number(left.priority)
    || left.spawnFrame - right.spawnFrame
    || String(left.sourceEventId || '').localeCompare(String(right.sourceEventId || ''))
    || (left.formationIndex ?? 0) - (right.formationIndex ?? 0)
    || left.id.localeCompare(right.id)
  ))
  .slice(0, Math.max(0, Math.floor(limit)))
  .map((candidate) => candidate.id);
