import {
  ASSET_CATALOG,
  BACKGROUND_CATALOG,
  BOSS_CATALOG,
  SPAWN_PATTERN_CATALOG
} from '@game/game-config/catalog';
import type {
  EnemyRoleDefinition,
  FormationPackDefinition,
  GameCampaignConfig,
  LevelDefinition,
  SpawnEnemySetting,
  SpawnEvent,
  WaveDefinition,
  WaveEvent
} from '@game/game-config/types';
import { resolveCampaignFormationPackForSpawn } from '@game/services/campaignFormationBudget';
import {
  resolveConfiguredFormationTarget,
  resolveFormationChoreography
} from '@game/services/gameplay/formations/FormationRuntime';

export interface WaveGallerySector {
  id: string;
  order: number;
  name: string;
  primaryMissionIds: readonly string[];
  missions: LevelDefinition[];
}

export interface WaveEnemyAllocation {
  enemy: SpawnEnemySetting;
  count: number;
  expectedCount: number;
  weightPercent: number;
  role?: EnemyRoleDefinition;
  label: string;
  assetLabel: string;
  assetPath: string;
}

export interface FormationPreviewMember extends WaveEnemyAllocation {
  id: string;
  leftPercent: number;
  topPercent: number;
}

export interface SpawnEventGallerySummary {
  event: SpawnEvent;
  allocations: WaveEnemyAllocation[];
  formationLabel: string;
  pack?: FormationPackDefinition;
  entrance: string;
  entryDirection: string;
  movement: string;
  attack: string;
  firing: string;
  returnBehavior: string;
  members: FormationPreviewMember[];
}

export interface WaveGallerySummary {
  spawnEvents: SpawnEventGallerySummary[];
  supportEvents: SupportWaveEvent[];
  enemyCount: number;
  enemyTypeCount: number;
  formationCount: number;
  uniqueAssetPaths: string[];
}

export type SupportWaveEvent = Exclude<WaveEvent, SpawnEvent>;

const titleCase = (value: string) => value
  .split('-')
  .filter(Boolean)
  .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ');

const missionSortValue = (mission: LevelDefinition, primaryIds: readonly string[]) => {
  const primaryIndex = primaryIds.indexOf(mission.id);
  return primaryIndex >= 0 ? primaryIndex : primaryIds.length + Math.max(0, mission.order);
};

export const buildWaveGallerySectors = (
  campaign: GameCampaignConfig
): WaveGallerySector[] => {
  const assignedMissionIds = new Set<string>();
  const sectors: WaveGallerySector[] = [...campaign.sectors]
    .sort((left, right) => left.order - right.order)
    .map((sector) => {
      const missions = campaign.levels
        .filter((mission) => (
          sector.missionIds.includes(mission.id)
          || mission.campaignProgression?.sectorId === sector.id
        ))
        .sort((left, right) => (
          missionSortValue(left, sector.missionIds) - missionSortValue(right, sector.missionIds)
          || left.order - right.order
        ));
      missions.forEach((mission) => assignedMissionIds.add(mission.id));
      return {
        id: sector.id,
        order: sector.order,
        name: sector.name,
        primaryMissionIds: sector.missionIds,
        missions
      };
    });

  const unassigned = campaign.levels
    .filter((mission) => !assignedMissionIds.has(mission.id))
    .sort((left, right) => left.order - right.order);
  if (unassigned.length > 0) {
    sectors.push({
      id: 'unassigned',
      order: Number.MAX_SAFE_INTEGER,
      name: 'OTHER MISSIONS',
      primaryMissionIds: [],
      missions: unassigned
    });
  }
  return sectors;
};

/**
 * Converts authored weights into a whole-number preview roster without changing
 * the event. Largest remainders receive the final members, so the total always
 * equals the event count and repeated loads remain identical.
 */
export const allocateSpawnEnemyCounts = (event: SpawnEvent): WaveEnemyAllocation[] => {
  const totalWeight = event.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.weight), 0);
  const normalizedWeight = totalWeight > 0 ? totalWeight : event.enemies.length;
  const rows = event.enemies.map((enemy, index) => {
    const weight = totalWeight > 0 ? Math.max(0, enemy.weight) : 1;
    const exact = event.count * weight / Math.max(1, normalizedWeight);
    return { enemy, index, exact, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = Math.max(0, event.count - rows.reduce((sum, row) => sum + row.count, 0));
  [...rows]
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index)
    .forEach((row) => {
      if (remaining <= 0) return;
      row.count += 1;
      remaining -= 1;
    });

  return rows.map(({ enemy, count, exact }) => {
    const asset = ASSET_CATALOG[enemy.spriteKey];
    return {
      enemy,
      count,
      expectedCount: exact,
      weightPercent: event.count > 0 ? (exact / event.count) * 100 : 0,
      label: enemy.roleId || enemy.enemyId,
      assetLabel: asset?.label ?? enemy.spriteKey,
      assetPath: asset?.paths[0] ?? ''
    };
  });
};

const enrichAllocations = (
  allocations: WaveEnemyAllocation[],
  campaign: GameCampaignConfig
) => {
  const roleById = new Map(campaign.enemyRoles.map((role) => [role.id, role]));
  return allocations.map((allocation) => {
    const role = allocation.enemy.roleId
      ? roleById.get(allocation.enemy.roleId)
      : undefined;
    return {
      ...allocation,
      role,
      label: role?.label ?? allocation.assetLabel
    };
  });
};

const buildPreviewMembers = (
  event: SpawnEvent,
  allocations: WaveEnemyAllocation[],
  pack?: FormationPackDefinition
): FormationPreviewMember[] => {
  const viewport = { width: 360, height: 260 };
  const entityWidth = 28;
  const entityHeight = 28;
  const allocationByMember = allocations.flatMap((allocation) => (
    Array.from({ length: allocation.count }, () => allocation)
  ));
  const entryPathId = event.formationBehavior?.entryPathId ?? pack?.entryPath;
  const enemySpriteKeys = event.enemies.map((enemy) => enemy.spriteKey);
  return allocationByMember.slice(0, event.count).map((allocation, index) => {
    const target = resolveConfiguredFormationTarget({
      event: {
        id: event.id,
        patternId: event.patternId,
        positionId: event.positionId,
        entryPathId,
        spawnAnchor: event.spawnAnchor,
        formationSlots: event.formationSlots,
        enemySpriteKeys,
        entryDirection: pack?.entryDirection,
        entryPath: pack?.entryPath
      },
      index,
      count: event.count,
      entityWidth,
      entityHeight,
      viewport
    });
    return {
      ...allocation,
      id: `${event.id}-member-${index}`,
      leftPercent: ((target.x + entityWidth / 2) / viewport.width) * 100,
      topPercent: ((target.y + entityHeight / 2) / viewport.height) * 100
    };
  });
};

export const buildSpawnEventGallerySummary = (
  event: SpawnEvent,
  wave: WaveDefinition,
  campaign: GameCampaignConfig
): SpawnEventGallerySummary => {
  const declaredPacks = wave.formationPackIds
    .map((packId) => campaign.formationPacks.find((pack) => pack.id === packId))
    .filter((pack): pack is FormationPackDefinition => Boolean(pack));
  const pack = resolveCampaignFormationPackForSpawn(event, declaredPacks);
  const choreography = resolveFormationChoreography(event, pack);
  const allocations = enrichAllocations(allocateSpawnEnemyCounts(event), campaign);
  return {
    event,
    allocations,
    formationLabel: SPAWN_PATTERN_CATALOG[event.patternId]?.label ?? titleCase(event.patternId),
    pack,
    entrance: titleCase(choreography.entryPathId),
    entryDirection: titleCase(pack?.entryDirection ?? 'top'),
    movement: titleCase(choreography.movementId),
    attack: titleCase(choreography.attackId),
    firing: titleCase(choreography.firingBehavior),
    returnBehavior: titleCase(choreography.returnId),
    members: buildPreviewMembers(event, allocations, pack)
  };
};

export const buildWaveGallerySummary = (
  wave: WaveDefinition,
  campaign: GameCampaignConfig
): WaveGallerySummary => {
  const spawnEvents = wave.events
    .filter((event): event is SpawnEvent => event.kind === 'spawn')
    .map((event) => buildSpawnEventGallerySummary(event, wave, campaign));
  const supportEvents = wave.events.filter(
    (event): event is SupportWaveEvent => event.kind !== 'spawn'
  );
  const uniqueAssets = new Set<string>();
  const uniqueRoles = new Set<string>();
  spawnEvents.forEach((summary) => summary.allocations.forEach((allocation) => {
    if (allocation.assetPath) uniqueAssets.add(allocation.assetPath);
    uniqueRoles.add(allocation.role?.id ?? allocation.enemy.spriteKey);
  }));
  return {
    spawnEvents,
    supportEvents,
    enemyCount: spawnEvents.reduce((sum, summary) => sum + summary.event.count, 0),
    enemyTypeCount: uniqueRoles.size,
    formationCount: spawnEvents.length,
    uniqueAssetPaths: [...uniqueAssets]
  };
};

export const getMissionBackgroundPaths = (mission: LevelDefinition) => {
  const background = BACKGROUND_CATALOG[mission.backgroundId];
  return background?.layerAssetKeys
    .flatMap((key) => ASSET_CATALOG[key]?.paths.slice(0, 1) ?? [])
    .slice(0, 4) ?? [];
};

export const describeSupportEvent = (event: SupportWaveEvent) => {
  if (event.kind === 'boss') {
    return {
      heading: BOSS_CATALOG[event.bossId]?.label ?? titleCase(event.bossId),
      detail: `${event.health.toLocaleString()} HP · ${event.weapons.length} weapon${event.weapons.length === 1 ? '' : 's'}`,
      assetPath: ASSET_CATALOG[event.spriteKey]?.paths[0] ?? ''
    };
  }
  if (event.kind === 'asteroid-belt') {
    return {
      heading: 'Asteroid belt',
      detail: `${event.count} hazards · ${SPAWN_PATTERN_CATALOG[event.patternId]?.label ?? titleCase(event.patternId)}`,
      assetPath: ASSET_CATALOG[event.spriteKey]?.paths[0] ?? ''
    };
  }
  if (event.kind === 'supply-drop') {
    return {
      heading: 'Supply drop',
      detail: `${titleCase(event.presentKind)} · ${event.coinDropValue} coins`,
      assetPath: ASSET_CATALOG[event.spriteKey]?.paths[0] ?? ''
    };
  }
  if (event.kind === 'powerup') {
    return { heading: 'Power-up signal', detail: event.powerupIds.map(titleCase).join(' · '), assetPath: '' };
  }
  return {
    heading: 'Recovery window',
    detail: `${event.coinCount} coins${event.powerupIds.length ? ` · ${event.powerupIds.map(titleCase).join(' · ')}` : ''}`,
    assetPath: ''
  };
};
