import type {
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition,
  WaveEvent
} from '../../../game-config/types';
import type { WorkspaceResourceReference } from '@director/api/directorClient';

export interface WorkspaceSaveRequest<TResource = unknown> {
  reference: WorkspaceResourceReference;
  resource: TResource;
}

export interface WorkspaceRecoveryPlan {
  resources: WorkspaceSaveRequest<LevelDefinition>[];
  requiresFullCampaignApply: boolean;
  changed: boolean;
}

export interface WorkspaceEditorSelection {
  levelId: string;
  waveId: string;
  eventId: string;
  inspectorTab: 'wave' | 'boss' | 'level' | 'card';
}

const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(',')}}`;
};

const sameJson = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);

export const levelWorkspaceSave = (
  level: LevelDefinition
): WorkspaceSaveRequest<LevelDefinition> => ({
  reference: { kind: 'level', levelId: level.id },
  resource: level
});

export const waveWorkspaceSave = (
  levelId: string,
  wave: WaveDefinition
): WorkspaceSaveRequest<WaveDefinition> => ({
  reference: { kind: 'wave', levelId, waveId: wave.id },
  resource: wave
});

export const bossWorkspaceSave = (
  levelId: string,
  waveId: string,
  event: Extract<WaveEvent, { kind: 'boss' }>
): WorkspaceSaveRequest<Extract<WaveEvent, { kind: 'boss' }>> => ({
  reference: { kind: 'boss-event', levelId, waveId, eventId: event.id },
  resource: event
});

export const workspaceResourceKey = (reference: WorkspaceResourceReference): string => {
  if (reference.kind === 'level') return `level:${reference.levelId}`;
  if (reference.kind === 'wave') return `wave:${reference.levelId}:${reference.waveId}`;
  return `boss-event:${reference.levelId}:${reference.waveId}:${reference.eventId}`;
};

export const initialWorkspaceEditorSelection = (
  campaign: GameCampaignConfig,
  pathname: string,
  surface: 'game' | 'card' | 'review'
): WorkspaceEditorSelection => {
  const firstLevel = campaign.levels[0];
  const firstWave = firstLevel?.waves[0];
  const firstEvent = firstWave?.events[0];
  const route = pathname.replace(/\/+$/, '') || '/';

  if (route === '/bosses') {
    for (const level of campaign.levels) {
      for (const wave of level.waves) {
        const boss = wave.events.find((event) => event.kind === 'boss');
        if (boss) {
          return {
            levelId: level.id,
            waveId: wave.id,
            eventId: boss.id,
            inspectorTab: 'boss'
          };
        }
      }
    }
  }

  return {
    levelId: firstLevel?.id ?? '',
    waveId: firstWave?.id ?? '',
    eventId: firstEvent?.id ?? '',
    inspectorTab: surface === 'card'
      ? 'card'
      : route === '/waves'
        ? 'wave'
        : route === '/missions' || route === '/level-editor'
          ? 'level'
          : firstEvent?.kind === 'boss'
            ? 'boss'
            : 'wave'
  };
};

/**
 * Browser drafts are emergency recovery snapshots, never the normal source of truth.
 * This plan promotes recoverable mission changes through the resource API and marks
 * the two schema-v1 cases the API cannot yet represent: top-level fields and deletes.
 */
export const planBrowserDraftRecovery = (
  authoritative: GameCampaignConfig,
  recovered: GameCampaignConfig
): WorkspaceRecoveryPlan => {
  const authoritativeById = new Map(authoritative.levels.map((level) => [level.id, level]));
  const recoveredIds = new Set(recovered.levels.map((level) => level.id));
  const authoritativeTopLevel = { ...authoritative, levels: [] };
  const recoveredTopLevel = { ...recovered, levels: [] };
  const deletedLevel = authoritative.levels.some((level) => !recoveredIds.has(level.id));
  const missionOrderChanged = recovered.levels.some((level) => {
    const authoritativeLevel = authoritativeById.get(level.id);
    return authoritativeLevel && authoritativeLevel.order !== level.order;
  });
  const topLevelChanged = !sameJson(authoritativeTopLevel, recoveredTopLevel);
  const requiresFullCampaignApply = deletedLevel || missionOrderChanged || topLevelChanged;
  const resources = deletedLevel || missionOrderChanged
    ? []
    : recovered.levels
      .filter((level) => !sameJson(authoritativeById.get(level.id), level))
      .map(levelWorkspaceSave);

  return {
    resources,
    requiresFullCampaignApply,
    changed: resources.length > 0 || requiresFullCampaignApply
  };
};
