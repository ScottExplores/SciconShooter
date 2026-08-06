import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  CAMPAIGN_MISSIONS,
  getCampaignCheckpointLabel,
  type CampaignMissionDefinition,
  type CampaignProgress
} from '../services/campaignProgression';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import { formatTokenAmount, toTokenTerminology } from '../services/tokenTerminology';
import CampaignMapCelestial from './campaign-map/CampaignMapCelestial';
import PixelActionButton from './PixelActionButton';
import './campaign-map.css';

type CampaignMapMissionRole =
  | 'introduction'
  | 'formation-remix'
  | 'elite-checkpoint'
  | 'boss-preparation'
  | 'major-boss';

type CampaignMapPowerGuide = {
  minimum: number;
  expected: number;
  comfortable: number;
};

type CampaignMapMissionMetadata = CampaignMissionDefinition & {
  sectorId?: string;
  sectorName?: string;
  missionRole?: CampaignMapMissionRole;
  recommendedPower?: number | Partial<CampaignMapPowerGuide>;
  masterySetBonusCoins?: number;
};

type CampaignMapSector = {
  id: string;
  name: string;
  order: number;
  accent: string;
  missions: CampaignMissionDefinition[];
};

const CAMPAIGN_SECTOR_PRESETS = DEFAULT_GAME_CAMPAIGN.sectors
  .map((sector) => {
    const theme = DEFAULT_GAME_CAMPAIGN.visualThemes.find((entry) => entry.id === sector.themeId);
    return {
      id: sector.id,
      name: sector.name,
      accent: theme?.accent ?? '#67e8f9',
      order: sector.order
    };
  })
  .sort((left, right) => left.order - right.order);

const CAMPAIGN_GRAPH_NODES = DEFAULT_GAME_CAMPAIGN.campaignGraph?.nodes ?? [];
const CAMPAIGN_GRAPH_NODE_BY_MISSION_ID = new Map(
  CAMPAIGN_GRAPH_NODES.map((node) => [node.missionDefinitionId, node])
);
const getCampaignGraphNodeForMission = (missionId: string) => (
  CAMPAIGN_GRAPH_NODE_BY_MISSION_ID.get(missionId) ?? null
);
const getCampaignMissionDisplayLabel = (mission: CampaignMissionDefinition) => (
  getCampaignGraphNodeForMission(mission.id)?.displayLabel
  ?? String(mission.number).padStart(2, '0')
);

const CAMPAIGN_MISSION_ROLE_LABELS: Readonly<Record<CampaignMapMissionRole, string>> = Object.freeze({
  introduction: 'Introduction',
  'formation-remix': 'Formation Remix',
  'elite-checkpoint': 'Elite Checkpoint',
  'boss-preparation': 'Boss Preparation',
  'major-boss': 'Sector Boss'
});

const CAMPAIGN_MISSION_ROLE_SEQUENCE: readonly CampaignMapMissionRole[] = [
  'major-boss',
  'introduction',
  'formation-remix',
  'elite-checkpoint',
  'boss-preparation'
];

const fallbackMissionRole = (missionNumber: number): CampaignMapMissionRole => (
  CAMPAIGN_MISSION_ROLE_SEQUENCE[missionNumber % 5] ?? 'introduction'
);

const getCampaignMissionMetadata = (mission: CampaignMissionDefinition) => (
  mission as CampaignMapMissionMetadata
);

const getCampaignMissionRole = (mission: CampaignMissionDefinition) => (
  getCampaignMissionMetadata(mission).missionRole ?? fallbackMissionRole(mission.number)
);

const getCampaignSectorPreset = (mission: CampaignMissionDefinition) => {
  const metadata = getCampaignMissionMetadata(mission);
  const fallbackIndex = Math.max(0, Math.floor((mission.number - 1) / 5));
  const preset = CAMPAIGN_SECTOR_PRESETS.find((sector) => sector.id === metadata.sectorId)
    ?? CAMPAIGN_SECTOR_PRESETS[fallbackIndex]
    ?? {
      id: metadata.sectorId ?? `sector-${fallbackIndex + 1}`,
      name: metadata.sectorName ?? `Sector ${fallbackIndex + 1}`,
      accent: '#67e8f9',
      order: fallbackIndex + 1
    };
  return {
    id: metadata.sectorId ?? preset.id,
    name: metadata.sectorName ?? preset.name,
    accent: preset.accent,
    order: preset.order
  };
};

const getCampaignPowerGuide = (mission: CampaignMissionDefinition): CampaignMapPowerGuide | null => {
  const recommendation = getCampaignMissionMetadata(mission).recommendedPower;
  if (typeof recommendation === 'number' && Number.isFinite(recommendation)) {
    const expected = Math.max(0, Math.round(recommendation));
    return {
      minimum: Math.round(expected * 0.78),
      expected,
      comfortable: Math.round(expected * 1.3)
    };
  }
  if (!recommendation || typeof recommendation !== 'object') {
    const expected = 1_100 + (Math.max(0, mission.number - 1) * 300);
    return {
      minimum: Math.round(expected * 0.77),
      expected,
      comfortable: Math.round(expected * 1.31)
    };
  }
  const expected = Number(recommendation.expected);
  if (!Number.isFinite(expected)) return null;
  return {
    minimum: Math.max(0, Math.round(Number(recommendation.minimum) || expected * 0.78)),
    expected: Math.max(0, Math.round(expected)),
    comfortable: Math.max(0, Math.round(Number(recommendation.comfortable) || expected * 1.3))
  };
};

export type CampaignMapStatus = 'ready' | 'loading' | 'empty' | 'error' | 'launch-pending' | 'launch-error';
export type CampaignLaunchKind = 'checkpoint' | 'mission' | 'replay' | 'weekly-streak';

export interface CampaignMapLaunchRequest {
  missionId: string;
  waveId: string;
  kind: CampaignLaunchKind;
}

export interface CampaignMapRouteSelectionRequest {
  sourceNodeId: string;
  targetNodeId: string;
  missionId: string;
  waveId: string;
}

export interface CampaignMapWeeklyLoadout {
  shipName: string;
  shipAssetUrl: string;
  supportNames: string[];
  power: number;
}

export type CampaignMapBranchMissionType =
  | 'bonus-cache'
  | 'present-drop'
  | 'research-cache'
  | 'elite-remix'
  | 'elite-challenge'
  | 'mini-boss-signal'
  | 'mini-boss-challenge'
  | 'formation-challenge'
  | 'support-trial'
  | 'mastery-mission'
  | 'hidden-research-signal'
  | 'one-time-reward';

export type CampaignMapBranchDiscoveryState =
  | 'hidden'
  | 'locked'
  | 'unlocked'
  | 'new'
  | 'completed'
  | 'claimed';

export interface CampaignMapBranchPoint {
  /** Horizontal map position normalized from 0 to 1. */
  x: number;
  /** Vertical map position normalized from 0 to 1, matching Mission map positions. */
  y: number;
}

export interface CampaignMapBranchDefinition {
  branchId: string;
  sourceMissionId: string;
  displayName: string;
  hiddenName?: string;
  missionType: CampaignMapBranchMissionType;
  requiredStars?: number;
  mapPosition?: CampaignMapBranchPoint;
  routeControlPoints?: CampaignMapBranchPoint[];
  icon?: string;
  lockedIcon?: string;
  rewardPreview?: string;
  oneTimeCompletion?: boolean;
  replayPolicy?: 'one-time' | 'repeatable' | 'inspect-only';
  missionDefinitionId?: string;
  returnNodeId?: string;
  nextBranchNodeId?: string;
  discoveryState?: CampaignMapBranchDiscoveryState;
}

export interface CampaignMapBranchProgress {
  discoveryState?: CampaignMapBranchDiscoveryState;
  unlocked?: boolean;
  completed?: boolean;
  claimed?: boolean;
  isNew?: boolean;
  lastResult?: {
    kind?: 'present-drop' | 'combat';
    objectiveLabel?: string;
    objectiveUnitsCompleted?: number;
    presentsDestroyed?: number;
    standard?: number;
    armored?: number;
    fast?: number;
    golden?: number;
    collectedPresentCoins?: number;
    baseReward: number;
    oneTimeCompletionBonus: number;
    totalCoins: number;
    completedAt: string;
  };
}

export interface CampaignMapBranchLaunchRequest {
  branchId: string;
  sourceMissionId: string;
  missionDefinitionId?: string;
  kind: 'branch';
}

export type CampaignLabLoadoutPreset = 'low-power' | 'expected-power' | 'upgraded';

export type CampaignMapNodePreviewState =
  | 'saved'
  | 'locked'
  | 'unlocked'
  | 'new'
  | 'current'
  | 'completed';

export type CampaignLabRewardClaimType =
  | 'wave-clear'
  | 'mission-clear'
  | 'first-clear'
  | 'mini-boss-clear'
  | 'major-boss-clear'
  | 'mastery-set'
  | 'replay'
  | 'branch';

export interface CampaignLabOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface CampaignLabUpgradeTrack {
  id: string;
  label: string;
  level: number;
  minLevel?: number;
  maxLevel?: number;
}

export interface CampaignLabTelemetry {
  encounterBudget?: number | null;
  combatBudget?: number | null;
  threatCap?: number | null;
  authoredThreatSpent?: number | null;
  enemyPackCost?: number | null;
  formationPackCost?: number | null;
  activeThreatCost?: number | null;
  activePerformanceCost?: number | null;
  mobilePerformanceBudget?: number | null;
  formationPackIds?: readonly string[];
  enemyRoles?: readonly string[];
  enemyRoleIds?: readonly string[];
  activeMissionId?: string | null;
  activeWaveId?: string | null;
  activeFormationIds?: readonly string[];
  playerProjectileCount?: number | null;
  enemyProjectileCount?: number | null;
  projectileCount?: number | null;
  peakProjectileCount?: number | null;
  activeFiringEnemies?: number | null;
  clearTimeMs?: number | null;
  clearTimeSeconds?: number | null;
  damageReceived?: number | null;
  coinsEarned?: number | null;
  weeklyPointsEarned?: number | null;
  playerDps?: number | null;
  enemyTimeToKillMs?: number | null;
  averageEnemyTimeToKillSeconds?: number | null;
  fps?: number | null;
  frameTimeMs?: number | null;
  performanceLabel?: string | null;
  performanceFlags?: readonly string[];
  performanceMode?: boolean;
  heavySceneLoad?: boolean;
  mobileProfile?: boolean;
}

export interface CampaignLabLaunchRequest extends CampaignMapLaunchRequest {
  sectorId: string;
  shipId: string | null;
  /** Left companion; retained as `supportId` for older founder-tool callers. */
  supportId: string | null;
  rightSupportId?: string | null;
  preset: CampaignLabLoadoutPreset;
  upgradeLevels: Record<string, number>;
}

const EMPTY_CAMPAIGN_BRANCHES: CampaignMapBranchDefinition[] = [];
const EMPTY_CAMPAIGN_BRANCH_PROGRESS: Record<string, CampaignMapBranchProgress> = {};
const EMPTY_BRANCH_IDS: string[] = [];
const CAMPAIGN_TOKEN_ICON_URL = '/game-art/generated/rsc-coin-flip-v1/rsc-coin-pixel-front.png';

const CAMPAIGN_BRANCH_ICON_URLS: Readonly<Record<string, string>> = Object.freeze({
  'present-drop-cache': '/game-art/generated/research-supply-golden-de501f4a437d.png',
  'encrypted-branch': '/game-art/generated/ui/scicon-interface-pack-v1/resources/lock.png',
  'elite-warning': '/game-art/generated/ui/scicon-ui-system-v2/base/tutorial-story/hazard-warning-plaque.png',
  'mini-boss-signal': '/game-art/generated/ui/scicon-neon-dashboard-icons-v2/boss-archive-defeated-emblem-v1.png',
  'formation-challenge': '/game-art/generated/ui/scicon-dashboard-icons-v1/normal/missions.png',
  'support-trial': '/game-art/generated/ui/scicon-interface-pack-v1/icons/communication/support.png',
  'mastery-prism': '/game-art/generated/ui/animations/boss-alert-banners-v1/effects/warning-ring-violet.png',
  'research-signal': '/game-art/generated/ui/scicon-ui-system-v2/base/tutorial-story/receiving-signal-indicator.png'
});

const resolveCampaignBranchIconUrl = (icon?: string) => {
  if (!icon) return null;
  return icon.startsWith('/') ? icon : CAMPAIGN_BRANCH_ICON_URLS[icon] ?? null;
};

export interface CampaignMapDeveloperControls {
  enabled: boolean;
  onUnlockAll: () => void;
  onCompleteMission: (missionId: string) => void;
  onResetProgress: () => void;
  onResetStars: () => void;
  onPreviewLocked: (enabled: boolean) => void;
  onPreviewNew: (missionId: string) => void;
  onPreviewResult: (missionId: string) => void;
  onUnlockBranch?: (branchId: string) => void;
  onLockBranch?: (branchId: string) => void;
  onGrantThreeStars?: (missionId: string) => void;
  onResetBranch?: (branchId: string) => void;
  onPreviewBranch?: (branchId: string) => void;
  onSimulateBranchFailure?: (branchId: string) => void;
  onSimulateBranchSuccess?: (branchId: string) => void;
  onVerifyDuplicateReward?: (branchId: string) => void;
  spawnSeed?: number;
  valueMultiplier?: number;
  onSpawnSeedChange?: (seed: number) => void;
  onValueMultiplierChange?: (multiplier: number) => void;
  shipOptions?: CampaignLabOption[];
  supportOptions?: CampaignLabOption[];
  upgradeTracks?: CampaignLabUpgradeTrack[];
  selectedShipId?: string;
  selectedSupportId?: string;
  selectedRightSupportId?: string;
  loadoutPower?: number;
  selectedPreset?: CampaignLabLoadoutPreset;
  loopFormation?: boolean;
  telemetry?: CampaignLabTelemetry | null;
  onSelectSector?: (sectorId: string) => void;
  onSelectMission?: (missionId: string) => void;
  onSelectWave?: (missionId: string, waveId: string) => void;
  onSelectShip?: (shipId: string) => void;
  onSelectSupport?: (supportId: string) => void;
  onSelectRightSupport?: (supportId: string) => void;
  onSetUpgradeLevel?: (upgradeId: string, level: number) => void;
  onApplyLoadoutPreset?: (preset: CampaignLabLoadoutPreset) => void;
  onLaunchSelectedMission?: (request: CampaignLabLaunchRequest) => void;
  onStartWeeklyStreak?: (request: CampaignMapLaunchRequest & { nodeId: string }) => void;
  onSimulateRouteChoice?: (sourceNodeId: string, targetNodeId: string) => void;
  onSimulateBackwardSelection?: (targetNodeId: string) => void;
  onPreviewAuthenticationFlow?: (flow: 'guest' | 'wallet') => void;
  onRestartFormation?: () => void;
  onLoopFormationChange?: (enabled: boolean) => void;
  onSkipToMiniBoss?: () => void;
  onSkipToMajorBoss?: () => void;
  onPreviewNodeState?: (missionId: string, state: CampaignMapNodePreviewState) => void;
  onPreviewBranchState?: (branchId: string, state: CampaignMapBranchDiscoveryState | 'saved') => void;
  onPreviewStarClaim?: (missionId: string, starNumber: 1 | 2 | 3) => void;
  onPreviewRewardClaim?: (missionId: string, rewardType: CampaignLabRewardClaimType) => void;
}

/**
 * Founder controls can disappear while a pointer event is already queued (for
 * example, immediately after a wallet switch). Every privileged handler goes
 * through this guard so stale UI cannot invoke a developer callback.
 */
export const runCampaignMapDeveloperAction = (
  controls: CampaignMapDeveloperControls | null | undefined,
  action: (authorizedControls: CampaignMapDeveloperControls) => void
) => {
  if (!controls?.enabled) return false;
  action(controls);
  return true;
};

interface CampaignMapProps {
  open: boolean;
  progress: CampaignProgress;
  missions?: CampaignMissionDefinition[];
  status?: CampaignMapStatus;
  errorMessage?: string;
  initialMissionId?: string | null;
  newMissionIds?: string[];
  branches?: CampaignMapBranchDefinition[];
  branchProgressById?: Record<string, CampaignMapBranchProgress>;
  newBranchIds?: string[];
  initialBranchId?: string | null;
  unlockingBranchId?: string | null;
  readOnly?: boolean;
  onClose: () => void;
  onLaunch: (request: CampaignMapLaunchRequest) => void;
  onSelectRoute?: (request: CampaignMapRouteSelectionRequest) => void;
  onLaunchBranch?: (request: CampaignMapBranchLaunchRequest) => void;
  onSkipBranchAnimation?: (branchId: string) => void;
  developerControls?: CampaignMapDeveloperControls | null;
}

const NODE_STEP = 168;
const ROUTE_TOP = 96;

const DEFAULT_CAMPAIGN_LAB_SHIPS: CampaignLabOption[] = [
  { id: 'current', label: 'Current ship' }
];
const DEFAULT_CAMPAIGN_LAB_SUPPORTS: CampaignLabOption[] = [
  { id: 'none', label: 'No support ship' }
];
const DEFAULT_CAMPAIGN_LAB_UPGRADES: CampaignLabUpgradeTrack[] = [
  { id: 'overall', label: 'Runtime upgrade level', level: 0, minLevel: 0, maxLevel: 7 }
];

const formatCampaignLabNumber = (value: number | null | undefined, maximumFractionDigits = 1) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits })
    : '--'
);

const formatCampaignLabDuration = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value)
    ? formatTime(value)
    : '--'
);

const formatTime = (milliseconds: number | null) => {
  if (!milliseconds) return '--';
  const seconds = Math.max(0, Math.round(milliseconds / 100) / 10);
  return `${seconds.toFixed(1)}s`;
};

const getMissionBaseClearReward = (mission: CampaignMissionDefinition) => (
  (mission.reward.waveClearCoins * mission.waveIds.length) + mission.reward.missionClearCoins
);

const getMissionReplayReward = (mission: CampaignMissionDefinition) => (
  (Math.max(1, Math.round(mission.reward.waveClearCoins * mission.reward.replayMultiplier)) * mission.waveIds.length)
  + Math.max(1, Math.round(mission.reward.missionClearCoins * mission.reward.replayMultiplier))
);

const getMissionState = (mission: CampaignMissionDefinition, progress: CampaignProgress) => {
  const record = progress.missionRecords[mission.id];
  const completed = Boolean(record?.completed);
  const unlocked = progress.unlockedMissionIds.includes(mission.id);
  const completedWaveIds = new Set(completed ? mission.waveIds : []);
  const unlockedWaveIds = new Set(unlocked ? mission.waveIds : []);
  return {
    completed,
    current: progress.recommendedMissionId === mission.id,
    unlocked,
    new: progress.unviewedMissionIds.includes(mission.id),
    stars: Math.max(0, Math.min(3, record?.stars ?? 0)),
    completedWaves: completed ? mission.waveIds.length : 0,
    completedWaveIds,
    unlockedWaveIds
  };
};

const applyCampaignNodePreview = (
  state: ReturnType<typeof getMissionState>,
  mission: CampaignMissionDefinition,
  preview: CampaignMapNodePreviewState
) => {
  if (preview === 'saved') return state;
  if (preview === 'completed') {
    return {
      ...state,
      completed: true,
      current: false,
      unlocked: true,
      new: false,
      completedWaves: mission.waveIds.length,
      completedWaveIds: new Set(mission.waveIds),
      unlockedWaveIds: new Set(mission.waveIds)
    };
  }
  return {
    ...state,
    completed: false,
    current: preview === 'current',
    unlocked: preview !== 'locked',
    new: preview === 'new',
    completedWaves: 0,
    completedWaveIds: new Set<string>(),
    unlockedWaveIds: preview === 'locked' ? new Set<string>() : new Set(mission.waveIds)
  };
};

const buildCampaignSectors = (missions: CampaignMissionDefinition[]): CampaignMapSector[] => {
  const sectors = new Map<string, CampaignMapSector>();
  missions.forEach((mission) => {
    const preset = getCampaignSectorPreset(mission);
    const sector = sectors.get(preset.id) ?? { ...preset, missions: [] };
    sector.missions.push(mission);
    sectors.set(preset.id, sector);
  });
  return Array.from(sectors.values())
    .map((sector) => ({
      ...sector,
      missions: sector.missions.slice().sort((left, right) => left.number - right.number)
    }))
    .sort((left, right) => left.order - right.order);
};

type CampaignMapRouteEdge = {
  fromMissionId: string;
  toMissionId: string;
};

export const buildCampaignSectorRouteEdges = (
  sectors: CampaignMapSector[]
): CampaignMapRouteEdge[] => {
  const edges: CampaignMapRouteEdge[] = [];
  sectors.forEach((sector, sectorIndex) => {
    const missions = sector.missions;
    if (missions.length === 5) {
      const [entry, leftRoute, rightRoute, merge, boss] = missions;
      edges.push(
        { fromMissionId: entry.id, toMissionId: leftRoute.id },
        { fromMissionId: entry.id, toMissionId: rightRoute.id },
        { fromMissionId: leftRoute.id, toMissionId: merge.id },
        { fromMissionId: rightRoute.id, toMissionId: merge.id },
        { fromMissionId: merge.id, toMissionId: boss.id }
      );
    } else {
      missions.slice(1).forEach((mission, index) => {
        edges.push({
          fromMissionId: missions[index].id,
          toMissionId: mission.id
        });
      });
    }
    const nextSectorEntry = sectors[sectorIndex + 1]?.missions[0];
    const sectorBoss = missions.at(-1);
    if (sectorBoss && nextSectorEntry) {
      edges.push({
        fromMissionId: sectorBoss.id,
        toMissionId: nextSectorEntry.id
      });
    }
  });
  return edges;
};

export const buildCampaignGraphRouteEdges = (
  missions: CampaignMissionDefinition[]
): CampaignMapRouteEdge[] => {
  const missionIds = new Set(missions.map((mission) => mission.id));
  if (!DEFAULT_GAME_CAMPAIGN.campaignGraph) {
    return buildCampaignSectorRouteEdges(buildCampaignSectors(missions));
  }
  return DEFAULT_GAME_CAMPAIGN.campaignGraph.nodes.flatMap((node) => (
    node.outgoingEdges.flatMap((routeEdge) => {
      const target = DEFAULT_GAME_CAMPAIGN.campaignGraph?.nodes.find((entry) => (
        entry.nodeId === routeEdge.toNodeId
      ));
      if (
        !target
        || !missionIds.has(node.missionDefinitionId)
        || !missionIds.has(target.missionDefinitionId)
      ) return [];
      return [{
        fromMissionId: node.missionDefinitionId,
        toMissionId: target.missionDefinitionId
      }];
    })
  ));
};

const clampMapCoordinate = (value: number, minimum = 0, maximum = 1) => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);

const getNodeTop = (mission: CampaignMissionDefinition, missionCount: number) => (
  ROUTE_TOP
  + ((1 - clampMapCoordinate(mission.mapPosition.y)) * Math.max(0, missionCount - 1) * NODE_STEP)
);

const getMapPointY = (normalizedY: number, routeHeight: number) => (
  ROUTE_TOP + ((1 - clampMapCoordinate(normalizedY)) * Math.max(0, routeHeight - (ROUTE_TOP * 2))) + 38
);

const getMissionRoutePoint = (
  mission: CampaignMissionDefinition,
  missionCount: number
) => ({
  x: clampMapCoordinate(mission.mapPosition.x, 0.08, 0.92) * 100,
  y: getNodeTop(mission, missionCount) + 38
});

const getBranchState = (
  branch: CampaignMapBranchDefinition,
  progress: CampaignMapBranchProgress | undefined,
  newBranchIds: string[]
) => {
  const discoveryState = progress?.discoveryState ?? branch.discoveryState ?? 'locked';
  const completed = Boolean(progress?.completed || discoveryState === 'completed' || discoveryState === 'claimed');
  const claimed = Boolean(progress?.claimed || discoveryState === 'claimed');
  const unlocked = Boolean(
    progress?.unlocked
    || completed
    || discoveryState === 'unlocked'
    || discoveryState === 'new'
  );
  return {
    discoveryState,
    unlocked,
    completed,
    claimed,
    new: Boolean(progress?.isNew || discoveryState === 'new' || newBranchIds.includes(branch.branchId))
  };
};

const applyCampaignBranchPreview = (
  state: ReturnType<typeof getBranchState>,
  preview: CampaignMapBranchDiscoveryState | null
) => {
  if (!preview) return state;
  return {
    ...state,
    discoveryState: preview,
    unlocked: !['hidden', 'locked'].includes(preview),
    completed: preview === 'completed' || preview === 'claimed',
    claimed: preview === 'claimed',
    new: preview === 'new'
  };
};

const getBranchPoint = (
  branch: CampaignMapBranchDefinition,
  sourceMission: CampaignMissionDefinition,
  routeHeight: number
) => {
  const fallbackX = sourceMission.mapPosition.x < 0.5 ? 0.82 : 0.18;
  return {
    x: clampMapCoordinate(branch.mapPosition?.x ?? fallbackX, 0.13, 0.87) * 100,
    y: getMapPointY(branch.mapPosition?.y ?? sourceMission.mapPosition.y, routeHeight)
  };
};

const getBranchRoutePoints = (
  branch: CampaignMapBranchDefinition,
  sourceMission: CampaignMissionDefinition,
  missionCount: number,
  routeHeight: number
) => {
  const sourcePoint = {
    x: clampMapCoordinate(sourceMission.mapPosition.x, 0.1, 0.9) * 100,
    y: getNodeTop(sourceMission, missionCount) + 38
  };
  const branchPoint = getBranchPoint(branch, sourceMission, routeHeight);
  const controlPoints = branch.routeControlPoints?.map((point) => ({
    x: clampMapCoordinate(point.x, 0.08, 0.92) * 100,
    y: getMapPointY(point.y, routeHeight)
  })) ?? [];
  const routePoints = controlPoints.length >= 2
    ? controlPoints
    : [sourcePoint, branchPoint];
  return routePoints
    .map((point) => `${Math.round(point.x * 100) / 100},${Math.round(point.y)}`)
    .join(' ');
};

const formatBranchType = (missionType: CampaignMapBranchMissionType) => missionType
  .replace(/[-_]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const CampaignMap: React.FC<CampaignMapProps> = ({
  open,
  progress,
  missions = CAMPAIGN_MISSIONS,
  status = 'ready',
  errorMessage = '',
  initialMissionId = null,
  newMissionIds = [],
  branches = EMPTY_CAMPAIGN_BRANCHES,
  branchProgressById = EMPTY_CAMPAIGN_BRANCH_PROGRESS,
  newBranchIds = EMPTY_BRANCH_IDS,
  initialBranchId = null,
  unlockingBranchId = null,
  readOnly = false,
  onClose,
  onLaunch,
  onSelectRoute,
  onLaunchBranch,
  onSkipBranchAnimation,
  developerControls = null
}) => {
  const checkpoint = useMemo(() => getCampaignCheckpointLabel(progress), [progress]);
  const orderedMissions = useMemo(() => (
    [...missions].sort((left, right) => {
      const leftNode = getCampaignGraphNodeForMission(left.id);
      const rightNode = getCampaignGraphNodeForMission(right.id);
      if (leftNode && rightNode) {
        if (leftNode.depth !== rightNode.depth) return leftNode.depth - rightNode.depth;
        if (leftNode.mapPosition.x !== rightNode.mapPosition.x) {
          return leftNode.mapPosition.x - rightNode.mapPosition.x;
        }
      }
      return left.number - right.number;
    })
  ), [missions]);
  const campaignSectors = useMemo(() => buildCampaignSectors(orderedMissions), [orderedMissions]);
  const campaignRouteEdges = useMemo(
    () => buildCampaignGraphRouteEdges(orderedMissions),
    [orderedMissions]
  );
  const routeDepthCount = CAMPAIGN_GRAPH_NODES.length > 0
    ? Math.max(1, ...CAMPAIGN_GRAPH_NODES.map((node) => node.depth))
    : Math.max(1, orderedMissions.length);
  const preferredMissionId = initialMissionId
    ?? newMissionIds.at(-1)
    ?? progress.unviewedMissionIds.at(-1)
    ?? progress.recommendedMissionId;
  const [selectedMissionId, setSelectedMissionId] = useState(preferredMissionId);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(initialBranchId);
  const [developerWaveId, setDeveloperWaveId] = useState('');
  const [developerShipId, setDeveloperShipId] = useState('');
  const [developerSupportId, setDeveloperSupportId] = useState('');
  const [developerRightSupportId, setDeveloperRightSupportId] = useState('');
  const [developerPreset, setDeveloperPreset] = useState<CampaignLabLoadoutPreset>('expected-power');
  const [developerUpgradeLevels, setDeveloperUpgradeLevels] = useState<Record<string, number>>({});
  const [developerNodePreviewState, setDeveloperNodePreviewState] = useState<CampaignMapNodePreviewState>('saved');
  const [developerStarClaim, setDeveloperStarClaim] = useState<1 | 2 | 3>(1);
  const [developerRewardClaim, setDeveloperRewardClaim] = useState<CampaignLabRewardClaimType>('wave-clear');
  const [developerLoopFormation, setDeveloperLoopFormation] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [routeAwayFromCurrent, setRouteAwayFromCurrent] = useState(false);
  const [previewLocked, setPreviewLocked] = useState(false);
  const [developerBranchPreviewState, setDeveloperBranchPreviewState] = useState<CampaignMapBranchDiscoveryState | null>(null);
  const [dismissedUnlockAnimationId, setDismissedUnlockAnimationId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const branchNodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<{ pointerId: number; y: number; scrollTop: number } | null>(null);
  const gamepadStateRef = useRef({ next: false, previous: false, close: false });
  const initialRouteCenterPendingRef = useRef(true);

  const selectedMission = orderedMissions.find((mission) => mission.id === selectedMissionId)
    ?? orderedMissions.find((mission) => mission.id === progress.recommendedMissionId)
    ?? orderedMissions[0]
    ?? null;
  const selectedGraphNode = selectedMission
    ? getCampaignGraphNodeForMission(selectedMission.id)
    : null;
  const selectedMissionDisplayLabel = selectedMission
    ? getCampaignMissionDisplayLabel(selectedMission)
    : '--';
  const visibleBranches = useMemo(() => branches.filter((branch) => (
    orderedMissions.some((mission) => mission.id === branch.sourceMissionId)
  )), [branches, orderedMissions]);
  const visibleBranchIdsKey = visibleBranches.map((branch) => branch.branchId).join('|');
  const newestBranchId = newBranchIds.at(-1) ?? null;
  const getDisplayedMissionState = (mission: CampaignMissionDefinition) => applyCampaignNodePreview(
    getMissionState(mission, progress),
    mission,
    developerControls?.enabled && mission.id === selectedMissionId
      ? developerNodePreviewState
      : 'saved'
  );
  const getDisplayedBranchState = (branch: CampaignMapBranchDefinition) => applyCampaignBranchPreview(
    getBranchState(branch, branchProgressById[branch.branchId], newBranchIds),
    developerControls?.enabled && branch.branchId === selectedBranchId
      ? developerBranchPreviewState
      : null
  );
  const selectedBranch = visibleBranches.find((branch) => branch.branchId === selectedBranchId) ?? null;
  const selectedBranchProgress = selectedBranch ? branchProgressById[selectedBranch.branchId] : undefined;
  const selectedBranchState = selectedBranch ? getDisplayedBranchState(selectedBranch) : null;
  const selectedBranchSourceMission = selectedBranch
    ? orderedMissions.find((mission) => mission.id === selectedBranch.sourceMissionId) ?? null
    : null;
  const selectedBranchSourceStars = selectedBranchSourceMission
    ? getMissionState(selectedBranchSourceMission, progress).stars
    : 0;
  const selectedBranchOneTime = Boolean(
    selectedBranch?.oneTimeCompletion || selectedBranch?.replayPolicy === 'one-time'
  );
  const selectedBranchConsumed = Boolean(
    selectedBranchState?.claimed || (selectedBranchState?.completed && selectedBranchOneTime)
  );
  const selectedState = selectedMission ? getDisplayedMissionState(selectedMission) : null;
  const selectedMissionRole = selectedMission ? getCampaignMissionRole(selectedMission) : null;
  const selectedEncounter = selectedMission?.encounter ?? null;
  const selectedSector = selectedMission ? getCampaignSectorPreset(selectedMission) : null;
  const selectedPowerGuide = selectedMission ? getCampaignPowerGuide(selectedMission) : null;
  const selectedMasterySetBonus = selectedMission
    ? Math.max(0, Math.round(getCampaignMissionMetadata(selectedMission).masterySetBonusCoins ?? 0))
    : 0;
  const developerShipOptions = developerControls?.shipOptions?.length
    ? developerControls.shipOptions
    : DEFAULT_CAMPAIGN_LAB_SHIPS;
  const developerSupportOptions = developerControls?.supportOptions?.length
    ? developerControls.supportOptions
    : DEFAULT_CAMPAIGN_LAB_SUPPORTS;
  const developerUpgradeTracks = developerControls?.upgradeTracks?.length
    ? developerControls.upgradeTracks
    : DEFAULT_CAMPAIGN_LAB_UPGRADES;
  const developerTelemetry = developerControls?.telemetry ?? null;
  const developerTelemetryRoles = developerTelemetry?.enemyRoles ?? developerTelemetry?.enemyRoleIds ?? [];
  const developerTelemetryFlags = [
    ...(developerTelemetry?.performanceFlags ?? []),
    ...(developerTelemetry?.performanceMode ? ['Performance mode'] : []),
    ...(developerTelemetry?.heavySceneLoad ? ['Heavy scene load'] : []),
    ...(developerTelemetry?.mobileProfile ? ['Mobile profile'] : [])
  ];
  const developerUpgradeTrackKey = developerUpgradeTracks
    .map((track) => `${track.id}:${track.level}:${track.minLevel ?? 0}:${track.maxLevel ?? 7}`)
    .join('|');
  const developerShipOptionsKey = developerShipOptions.map((option) => option.id).join('|');
  const developerSupportOptionsKey = developerSupportOptions.map((option) => option.id).join('|');
  const selectedMissionBranches = selectedMission
    ? visibleBranches.filter((branch) => branch.sourceMissionId === selectedMission.id)
    : [];
  const selectedRecord = selectedMission ? progress.missionRecords[selectedMission.id] : null;
  const selectedPermanentlyRevealed = Boolean(selectedState?.unlocked || previewLocked);
  const selectedBaseClearReward = selectedMission ? getMissionBaseClearReward(selectedMission) : 0;
  const selectedReplayReward = selectedMission ? getMissionReplayReward(selectedMission) : 0;
  const selectedLaunchWaveId = selectedMission?.waveIds[0] ?? null;
  // Route choice is committed only from the action button below. Until then,
  // an unlocked node click is a visual navigation choice: move the pilot marker
  // and current-node treatment there immediately without mutating progression.
  const mapCurrentMissionId = (
    !selectedBranch
    && selectedMission
    && selectedState?.unlocked
  ) ? selectedMission.id : progress.recommendedMissionId;
  const selectedMapCurrent = Boolean(
    selectedMission && selectedMission.id === mapCurrentMissionId
  );
  // Campaign intel is revealed by Campaign progression alone. It used to also
  // unlock from the weekly streak's position, which leaked one mode's state
  // into the other's presentation.
  const selectedRevealed = selectedPermanentlyRevealed;
  const weeklySelectedRequest = selectedMission && selectedGraphNode && selectedLaunchWaveId
    ? {
        nodeId: selectedGraphNode.nodeId,
        missionId: selectedMission.id,
        waveId: selectedLaunchWaveId,
        kind: 'weekly-streak' as const
      }
    : null;
  const developerRouteChoice = selectedGraphNode?.outgoingEdges[0] ?? null;
  const developerBackwardNode = selectedGraphNode
    ? [...CAMPAIGN_GRAPH_NODES]
        .filter((node) => node.mainPath && node.depth < selectedGraphNode.depth)
        .sort((left, right) => right.depth - left.depth)[0] ?? null
    : null;
  const launchRequest: CampaignMapLaunchRequest | null = selectedMission && selectedState?.unlocked
    ? {
        missionId: selectedMission.id,
        waveId: selectedLaunchWaveId ?? selectedMission.waveIds[0],
        kind: selectedState.completed ? 'replay' : 'mission'
      }
    : null;
  const routeSelectionRequest: CampaignMapRouteSelectionRequest | null = (
    selectedMission
    && selectedGraphNode
    && selectedLaunchWaveId
    && progress.pendingRouteChoice?.optionNodeIds.includes(selectedGraphNode.nodeId)
  ) ? {
      sourceNodeId: progress.pendingRouteChoice.sourceNodeId,
      targetNodeId: selectedGraphNode.nodeId,
      missionId: selectedMission.id,
      waveId: selectedLaunchWaveId
    }
    : null;
  const launchLabel = routeSelectionRequest
    ? `Commit Route ${selectedGraphNode?.displayLabel ?? ''}`.trim()
    : launchRequest?.kind === 'replay'
    ? 'Replay Mission'
    : 'Start Mission';
  const launchReady = Boolean(routeSelectionRequest ? onSelectRoute : launchRequest);
  const campaignLabUpgradeLevels = Object.fromEntries(developerUpgradeTracks.map((track) => [
    track.id,
    developerUpgradeLevels[track.id] ?? track.level
  ]));
  const campaignLabLaunchRequest: CampaignLabLaunchRequest | null = selectedMission && selectedSector
    ? {
        missionId: selectedMission.id,
        waveId: developerWaveId || selectedMission.waveIds[0],
        kind: selectedState?.completed ? 'replay' : 'mission',
        sectorId: selectedSector.id,
        shipId: developerShipId || developerShipOptions[0]?.id || null,
        supportId: developerSupportId || developerSupportOptions[0]?.id || null,
        rightSupportId: developerRightSupportId || 'none',
        preset: developerPreset,
        upgradeLevels: campaignLabUpgradeLevels
      }
    : null;
  const routeHeight = Math.max(720, ROUTE_TOP * 2 + Math.max(0, routeDepthCount - 1) * NODE_STEP);
  const unlockAnimationActive = Boolean(
    unlockingBranchId
    && unlockingBranchId !== dismissedUnlockAnimationId
    && visibleBranches.some((branch) => branch.branchId === unlockingBranchId)
  );

  const selectedLockedBossSilhouette = Boolean(
    selectedMission
    && !selectedState?.unlocked
    && !previewLocked
    && (selectedMission.encounter?.previewUrl || selectedMission.bossPreview?.previewUrl)
  );

  useEffect(() => {
    setDeveloperBranchPreviewState(null);
  }, [selectedBranchId, open]);

  useEffect(() => {
    setDeveloperNodePreviewState('saved');
  }, [selectedMissionId, open]);

  useEffect(() => {
    if (!open || !developerControls?.enabled) return;
    setDeveloperShipId(
      developerControls.selectedShipId
      ?? developerShipOptions.find((option) => !option.disabled)?.id
      ?? ''
    );
  }, [developerControls?.enabled, developerControls?.selectedShipId, developerShipOptionsKey, open]);

  useEffect(() => {
    if (!open || !developerControls?.enabled) return;
    setDeveloperSupportId(
      developerControls.selectedSupportId
      ?? developerSupportOptions.find((option) => !option.disabled)?.id
      ?? ''
    );
  }, [developerControls?.enabled, developerControls?.selectedSupportId, developerSupportOptionsKey, open]);

  useEffect(() => {
    if (!open || !developerControls?.enabled) return;
    setDeveloperRightSupportId(developerControls.selectedRightSupportId ?? 'none');
  }, [developerControls?.enabled, developerControls?.selectedRightSupportId, open]);

  useEffect(() => {
    if (!open || !developerControls?.enabled) return;
    setDeveloperPreset(developerControls.selectedPreset ?? 'expected-power');
    setDeveloperLoopFormation(Boolean(developerControls.loopFormation));
  }, [developerControls?.enabled, developerControls?.loopFormation, developerControls?.selectedPreset, open]);

  useEffect(() => {
    if (!open || !developerControls?.enabled) return;
    setDeveloperUpgradeLevels(Object.fromEntries(
      developerUpgradeTracks.map((track) => [track.id, track.level])
    ));
  }, [developerControls?.enabled, developerUpgradeTrackKey, open]);

  const centerRouteTarget = useCallback((
    target: HTMLElement | null,
    behavior: ScrollBehavior = 'smooth'
  ) => {
    const scroller = routeRef.current;
    if (!target || !scroller || scroller.clientHeight <= 0) return false;
    const targetRect = target.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const targetTop = scroller.scrollTop
      + (targetRect.top - scrollerRect.top)
      - ((scroller.clientHeight - targetRect.height) / 2);
    const clampedTop = Math.max(
      0,
      Math.min(Math.max(0, scroller.scrollHeight - scroller.clientHeight), targetTop)
    );
    if (behavior === 'auto') scroller.scrollTop = clampedTop;
    else scroller.scrollTo({ top: clampedTop, behavior });
    return true;
  }, []);

  const centerMissionNode = useCallback((missionId: string, behavior: ScrollBehavior = 'smooth') => {
    const target = nodeRefs.current.get(missionId);
    centerRouteTarget(target ?? null, behavior);
  }, [centerRouteTarget]);

  const centerBranchNode = useCallback((branchId: string, behavior: ScrollBehavior = 'smooth') => {
    const target = branchNodeRefs.current.get(branchId);
    centerRouteTarget(target ?? null, behavior);
  }, [centerRouteTarget]);

  const refreshCurrentMissionDistance = useCallback(() => {
    const currentNode = nodeRefs.current.get(progress.recommendedMissionId);
    const scroller = routeRef.current;
    if (!currentNode || !scroller) {
      setRouteAwayFromCurrent(false);
      return;
    }
    const currentCenter = currentNode.offsetTop + (currentNode.offsetHeight / 2);
    const viewportCenter = scroller.scrollTop + (scroller.clientHeight / 2);
    setRouteAwayFromCurrent(
      Math.abs(currentCenter - viewportCenter) > Math.max(96, scroller.clientHeight * 0.46)
    );
  }, [progress.recommendedMissionId]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedMissionId(preferredMissionId);
    const preferredBranchId = initialBranchId ?? unlockingBranchId ?? newestBranchId;
    setSelectedBranchId(
      preferredBranchId && visibleBranchIdsKey.split('|').includes(preferredBranchId)
        ? preferredBranchId
        : null
    );
  }, [initialBranchId, newestBranchId, open, preferredMissionId, unlockingBranchId, visibleBranchIdsKey]);

  useEffect(() => {
    if (!open || !unlockingBranchId) return;
    setDismissedUnlockAnimationId(null);
    const timer = window.setTimeout(() => setDismissedUnlockAnimationId(unlockingBranchId), 1600);
    return () => window.clearTimeout(timer);
  }, [open, unlockingBranchId]);

  useEffect(() => {
    if (!selectedMission) return;
    const nextWaveId = selectedMission.id === progress.recommendedMissionId
      && selectedMission.waveIds.includes(progress.recommendedWaveId)
      ? progress.recommendedWaveId
      : selectedMission.waveIds[0];
    setDeveloperWaveId(nextWaveId ?? '');
  }, [progress.recommendedMissionId, progress.recommendedWaveId, selectedMission]);

  useLayoutEffect(() => {
    if (!open) {
      initialRouteCenterPendingRef.current = true;
      return;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const centerSelected = (behavior: ScrollBehavior) => {
      if (selectedBranchId) centerBranchNode(selectedBranchId, behavior);
      else if (selectedMissionId) centerMissionNode(selectedMissionId, behavior);
    };
    if (!initialRouteCenterPendingRef.current) {
      centerSelected(reduceMotion ? 'auto' : 'smooth');
      return;
    }

    // A freshly mounted mobile map can be more than 8,000 px tall. Jump to the
    // selected node before first paint, then confirm the position after two
    // layout frames so WebKit/Chrome never need a manual scroll to rasterize it.
    centerSelected('auto');
    let settleFrame = 0;
    const layoutFrame = window.requestAnimationFrame(() => {
      centerSelected('auto');
      settleFrame = window.requestAnimationFrame(() => {
        centerSelected('auto');
        initialRouteCenterPendingRef.current = false;
        refreshCurrentMissionDistance();
      });
    });
    return () => {
      window.cancelAnimationFrame(layoutFrame);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
    };
  }, [
    centerBranchNode,
    centerMissionNode,
    open,
    refreshCurrentMissionDistance,
    selectedBranchId,
    selectedMissionId
  ]);

  useEffect(() => {
    if (!open || typeof navigator.getGamepads !== 'function') return;
    let frame = 0;
    const poll = () => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      const nextPressed = Boolean(pad?.buttons[12]?.pressed || pad?.buttons[15]?.pressed);
      const previousPressed = Boolean(pad?.buttons[13]?.pressed || pad?.buttons[14]?.pressed);
      const closePressed = Boolean(pad?.buttons[1]?.pressed);
      if (nextPressed && !gamepadStateRef.current.next) {
        setSelectedMissionId((current) => {
          const index = Math.max(0, orderedMissions.findIndex((mission) => mission.id === current));
          return orderedMissions[Math.min(orderedMissions.length - 1, index + 1)]?.id ?? current;
        });
      }
      if (previousPressed && !gamepadStateRef.current.previous) {
        setSelectedMissionId((current) => {
          const index = Math.max(0, orderedMissions.findIndex((mission) => mission.id === current));
          return orderedMissions[Math.max(0, index - 1)]?.id ?? current;
        });
      }
      if (closePressed && !gamepadStateRef.current.close) onClose();
      gamepadStateRef.current = { next: nextPressed, previous: previousPressed, close: closePressed };
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [onClose, open, orderedMissions]);

  if (!open) return null;

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = { pointerId: event.pointerId, y: event.clientY, scrollTop: event.currentTarget.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return;
    event.currentTarget.scrollTop = dragRef.current.scrollTop - (event.clientY - dragRef.current.y);
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const target = event.target as HTMLElement;
    const navigationTarget = target === dialogRef.current || Boolean(target.closest('.campaign-map-node'));
    if (!navigationTarget) return;
    event.preventDefault();
    const currentIndex = Math.max(0, orderedMissions.findIndex((mission) => mission.id === selectedMissionId));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? orderedMissions.length - 1
        : Math.max(0, Math.min(
            orderedMissions.length - 1,
            currentIndex + (event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1)
          ));
    const next = orderedMissions[nextIndex];
    if (next) {
      setSelectedMissionId(next.id);
      nodeRefs.current.get(next.id)?.focus({ preventScroll: true });
    }
  };

  return (
    <main className="campaign-map-screen">
      <div
        ref={dialogRef}
        className="campaign-map-dialog"
        role="region"
        aria-labelledby="campaign-map-title"
        aria-describedby="campaign-map-instructions"
        aria-busy={status === 'loading' || status === 'launch-pending'}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header className="campaign-map-header">
          <button className="campaign-map-close" type="button" onClick={onClose} aria-label="Back to Home">
            <span aria-hidden="true">&larr;</span>
            <small>Back</small>
          </button>
          <div className="campaign-map-heading">
            <span>Research Command Network</span>
            <h1 id="campaign-map-title">Campaign Map</h1>
            <p id="campaign-map-instructions">Select an unlocked Mission. Use arrow keys, touch drag, or the mouse wheel to navigate.</p>
          </div>
          <div className="campaign-map-checkpoint" aria-label={`Current Mission ${checkpoint.missionNumber}, ${checkpoint.waveTotal} waves`}>
            <small>Current Mission</small>
            <strong>M{String(checkpoint.missionNumber).padStart(2, '0')} / {checkpoint.waveTotal} WAVES</strong>
          </div>
        </header>

        {status === 'loading' ? (
          <div className="campaign-map-state" role="status"><span className="campaign-map-loader" aria-hidden="true" />Decoding campaign route...</div>
        ) : status === 'empty' || missions.length === 0 ? (
          <div className="campaign-map-state" role="status">No campaign Missions are configured.</div>
        ) : status === 'error' ? (
          <div className="campaign-map-state campaign-map-state--error" role="alert">{errorMessage || 'Campaign route unavailable.'}</div>
        ) : (
          <>
            <div
              ref={routeRef}
              className={`campaign-map-route-scroll ${dragging ? 'is-dragging' : ''}`}
              onPointerDown={beginDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onScroll={refreshCurrentMissionDistance}
              onLostPointerCapture={() => {
                dragRef.current = null;
                setDragging(false);
              }}
              role="region"
              aria-label="Campaign Mission route"
            >
              <div className="campaign-map-starfield campaign-map-starfield--far" aria-hidden="true" />
              <div className="campaign-map-starfield campaign-map-starfield--near" aria-hidden="true" />
              <div className="campaign-map-route" style={{ height: routeHeight }}>
                {campaignSectors.map((sector) => {
                  const missionTops = sector.missions.map((mission) => getNodeTop(mission, routeDepthCount));
                  const top = Math.max(12, Math.min(...missionTops) - 52);
                  const bottom = Math.max(...missionTops) + 94;
                  const current = sector.missions.some((mission) => mission.id === progress.recommendedMissionId);
                  return (
                    <div
                      key={sector.id}
                      className={`campaign-map-sector ${current ? 'is-current' : ''}`}
                      data-sector-id={sector.id}
                      style={{
                        '--campaign-sector-top': `${top}px`,
                        '--campaign-sector-height': `${Math.max(180, bottom - top)}px`,
                        '--campaign-sector-accent': sector.accent
                      } as React.CSSProperties}
                      aria-hidden="true"
                    >
                      <span className="campaign-map-sector-index">Sector {String(sector.order).padStart(2, '0')}</span>
                      <strong>{sector.name}</strong>
                      <small>{sector.missions.length} Missions</small>
                    </div>
                  );
                })}
                <svg
                  className="campaign-map-route-lines"
                  viewBox={`0 0 100 ${routeHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {campaignRouteEdges.map((edge) => {
                    const fromMission = orderedMissions.find((mission) => mission.id === edge.fromMissionId);
                    const toMission = orderedMissions.find((mission) => mission.id === edge.toMissionId);
                    if (!fromMission || !toMission) return null;
                    const from = getMissionRoutePoint(fromMission, routeDepthCount);
                    const to = getMissionRoutePoint(toMission, routeDepthCount);
                    const points = `${from.x},${from.y} ${to.x},${to.y}`;
                    const destinationState = getDisplayedMissionState(toMission);
                    return (
                      <g
                        key={`${edge.fromMissionId}:${edge.toMissionId}`}
                        data-campaign-route-edge={`${edge.fromMissionId}:${edge.toMissionId}`}
                      >
                        <polyline className="campaign-map-route-line campaign-map-route-line--future" points={points} />
                        {destinationState.unlocked ? (
                          <polyline className="campaign-map-route-line campaign-map-route-line--reached" points={points} />
                        ) : null}
                        {destinationState.completed ? (
                          <polyline className="campaign-map-route-line campaign-map-route-line--complete" points={points} />
                        ) : null}
                      </g>
                    );
                  })}
                  {visibleBranches.map((branch) => {
                    const sourceMission = orderedMissions.find((mission) => mission.id === branch.sourceMissionId);
                    if (!sourceMission) return null;
                    const branchState = getDisplayedBranchState(branch);
                    const points = getBranchRoutePoints(branch, sourceMission, routeDepthCount, routeHeight);
                    const active = branchState.unlocked || branchState.completed || branchState.claimed;
                    return (
                      <g key={branch.branchId} data-campaign-branch-route={branch.branchId}>
                        <polyline
                          className={`campaign-map-branch-line ${active ? 'campaign-map-branch-line--active' : 'campaign-map-branch-line--dormant'}`}
                          points={points}
                        />
                        {active ? (
                          <polyline
                            className="campaign-map-branch-line campaign-map-branch-line--energy"
                            points={points}
                          />
                        ) : null}
                      </g>
                    );
                  })}
                </svg>
                {orderedMissions.map((mission) => {
                  const nodeState = getDisplayedMissionState(mission);
                  const missionRole = getCampaignMissionRole(mission);
                  const missionDisplayLabel = getCampaignMissionDisplayLabel(mission);
                  const encounter = mission.encounter;
                  const selected = !selectedBranch && selectedMission?.id === mission.id;
                  const mapCurrent = mission.id === mapCurrentMissionId;
                  const newNode = nodeState.new || newMissionIds.includes(mission.id);
                  const bossPreviewUrl = mission.bossPreview?.previewUrl ?? null;
                  const encounterPreviewUrl = encounter?.previewUrl ?? bossPreviewUrl;
                  const encounterRevealed = nodeState.unlocked || previewLocked;
                  const showLockedBossSilhouette = Boolean(
                    !encounterRevealed
                    && encounter
                    && encounterPreviewUrl
                  );
                  const stateName = !nodeState.unlocked
                    ? 'locked'
                    : mapCurrent
                      ? 'current'
                      : nodeState.completed
                        ? 'completed'
                        : 'unlocked';
                  const stateLabel = !nodeState.unlocked
                    ? 'Locked'
                    : mapCurrent
                      ? nodeState.completed ? 'Current Mission, completed' : 'Current Mission'
                      : nodeState.completed
                        ? 'Completed'
                        : 'Unlocked';
                  return (
                    <button
                      key={mission.id}
                      ref={(node) => {
                        if (node) nodeRefs.current.set(mission.id, node);
                        else nodeRefs.current.delete(mission.id);
                      }}
                      type="button"
                      className={`campaign-map-node campaign-map-node--${stateName} campaign-map-node--role-${missionRole} ${nodeState.completed ? 'is-completed' : ''} ${nodeState.unlocked ? 'is-unlocked' : 'is-locked'} ${encounter?.encounterClass === 'boss' ? 'campaign-map-node--boss' : ''} ${encounter?.encounterClass === 'elite-enemy' ? 'campaign-map-node--elite' : ''} ${showLockedBossSilhouette ? 'has-locked-boss-silhouette' : ''} ${selected ? 'is-selected' : ''} ${mapCurrent ? 'is-map-current' : ''} ${newNode ? 'is-new' : ''}`}
                      data-onboarding-target={nodeState.current ? 'campaign-mission' : undefined}
                      data-mission-role={missionRole}
                      data-encounter-class={encounter?.encounterClass}
                      data-map-current={mapCurrent ? 'true' : undefined}
                      style={{
                        '--campaign-node-x': `${mission.mapPosition.x * 100}%`,
                        '--campaign-node-y': `${getNodeTop(mission, routeDepthCount)}px`,
                        '--campaign-node-tint': mission.tint
                      } as React.CSSProperties}
                      onClick={() => {
                        setSelectedBranchId(null);
                        setSelectedMissionId(mission.id);
                      }}
                      aria-current={mapCurrent ? 'step' : undefined}
                      aria-pressed={selected}
                      tabIndex={selected ? 0 : -1}
                      aria-label={`Mission ${missionDisplayLabel}: ${!encounterRevealed ? 'Encrypted Sector' : mission.name}. ${encounter ? `${encounter.encounterClass === 'boss' ? 'Boss' : 'Elite enemy'}${encounterRevealed ? `: ${encounter.name}` : ''}. ` : ''}${stateLabel}. ${nodeState.stars} of 3 stars.${newNode ? ' New.' : ''}`}
                    >
                      <span className="campaign-map-node-ring" aria-hidden="true" />
                      <span className="campaign-map-node-core">
                        {encounterPreviewUrl ? (
                          <img
                            src={encounterPreviewUrl}
                            className={showLockedBossSilhouette ? 'campaign-map-node-boss-silhouette' : undefined}
                            alt=""
                            draggable={false}
                          />
                        ) : (
                          <CampaignMapCelestial
                            role={missionRole}
                            missionNumber={mission.number}
                            missionLabel={missionDisplayLabel}
                          />
                        )}
                      </span>
                      {missionRole === 'major-boss' ? (
                        <span className="campaign-map-node-number">{missionDisplayLabel}</span>
                      ) : null}
                      {nodeState.completed ? <span className="campaign-map-node-cleared" aria-hidden="true">&#10003;</span> : null}
                      <span className="campaign-map-node-role" aria-hidden="true">
                        {encounter
                          ? `${encounter.encounterClass === 'boss' ? 'BOSS' : 'ELITE ENEMY'} · ${encounterRevealed ? encounter.name : 'ENCRYPTED'}`
                          : CAMPAIGN_MISSION_ROLE_LABELS[missionRole]}
                      </span>
                      {newNode ? <span className="campaign-map-node-new">New</span> : null}
                      {mapCurrent ? (
                        <img
                          className="campaign-map-ship-marker"
                          src="/game-art/generated/scicon-flight-motion-pack-v1/ships/researchhub/frames/researchhub-03-neutral.png"
                          alt=""
                          aria-hidden="true"
                          draggable={false}
                        />
                      ) : null}
                      <span className="campaign-map-node-stars" aria-hidden="true">
                        {[0, 1, 2].map((index) => <span key={index}>{index < nodeState.stars ? '\u2605' : '\u2606'}</span>)}
                      </span>
                    </button>
                  );
                })}
                {visibleBranches.map((branch) => {
                  const sourceMission = orderedMissions.find((mission) => mission.id === branch.sourceMissionId);
                  if (!sourceMission) return null;
                  const branchState = getDisplayedBranchState(branch);
                  const branchPoint = getBranchPoint(branch, sourceMission, routeHeight);
                  const selected = selectedBranch?.branchId === branch.branchId;
                  const requiredStars = Math.max(1, Math.min(3, branch.requiredStars ?? 3));
                  const sourceStars = getMissionState(sourceMission, progress).stars;
                  const displayName = branchState.unlocked
                    ? branch.displayName
                    : branch.hiddenName ?? 'Encrypted Bonus Route';
                  const visualState = branchState.claimed
                    ? 'claimed'
                    : branchState.completed
                      ? 'completed'
                      : branchState.unlocked
                        ? 'unlocked'
                        : 'locked';
                  const iconUrl = resolveCampaignBranchIconUrl(
                    branchState.unlocked ? branch.icon : branch.lockedIcon
                  );
                  return (
                    <button
                      key={branch.branchId}
                      ref={(node) => {
                        if (node) branchNodeRefs.current.set(branch.branchId, node);
                        else branchNodeRefs.current.delete(branch.branchId);
                      }}
                      type="button"
                      className={`campaign-map-branch-node campaign-map-branch-node--${visualState} campaign-map-branch-node--${branch.missionType} ${selected ? 'is-selected' : ''} ${branchState.new ? 'is-new' : ''} ${unlockingBranchId === branch.branchId && unlockAnimationActive ? 'is-unlocking' : ''}`}
                      style={{
                        '--campaign-branch-x': `${branchPoint.x}%`,
                        '--campaign-branch-y': `${branchPoint.y - 34}px`
                      } as React.CSSProperties}
                      onClick={() => {
                        setSelectedMissionId(branch.sourceMissionId);
                        setSelectedBranchId(branch.branchId);
                      }}
                      aria-pressed={selected}
                      tabIndex={selected ? 0 : -1}
                      aria-label={`${displayName}. ${branchState.claimed ? 'Claimed.' : branchState.completed ? 'Completed.' : branchState.unlocked ? 'Unlocked.' : `Locked. Earn ${requiredStars} stars on Mission ${sourceMission.number} to unlock.`}${branchState.new ? ' New.' : ''}`}
                    >
                      <span className="campaign-map-branch-node-frame" aria-hidden="true" />
                      <span className="campaign-map-branch-node-core" aria-hidden="true">
                        {iconUrl ? (
                          <img src={iconUrl} alt="" draggable={false} />
                        ) : (
                          <span className="campaign-map-branch-glyph" data-branch-type={branch.missionType}>
                            <span />
                          </span>
                        )}
                      </span>
                      <span className="campaign-map-branch-node-label">{displayName}</span>
                      {!branchState.unlocked ? (
                        <span className="campaign-map-branch-requirement" aria-hidden="true">
                          {Array.from({ length: requiredStars }, (_, index) => index < sourceStars ? '\u2605' : '\u2606').join('')}
                        </span>
                      ) : null}
                      {branchState.new ? <span className="campaign-map-branch-new">New</span> : null}
                      {branchState.claimed ? <span className="campaign-map-branch-claimed">Claimed</span> : null}
                    </button>
                  );
                })}
                {unlockAnimationActive && unlockingBranchId ? (
                  <div className="campaign-map-branch-unlock-notice" role="status">
                    <strong>Bonus Route Unlocked</strong>
                    <button
                      type="button"
                      onClick={() => {
                        setDismissedUnlockAnimationId(unlockingBranchId);
                        onSkipBranchAnimation?.(unlockingBranchId);
                      }}
                    >Skip animation</button>
                  </div>
                ) : null}
              </div>
            </div>

            {selectedBranch && selectedBranchState && selectedBranchSourceMission ? (
              <section className="campaign-map-selection campaign-map-branch-selection" aria-labelledby="campaign-map-selection-title">
                <p className="campaign-map-sr-only" role="status">
                  {selectedBranchState.unlocked ? selectedBranch.displayName : selectedBranch.hiddenName ?? 'Encrypted Bonus Route'}.
                  {selectedBranchState.claimed ? ' Claimed.' : selectedBranchState.completed ? ' Completed.' : selectedBranchState.unlocked ? ' Unlocked.' : ' Locked.'}
                </p>
                <div className="campaign-map-selection-topline">
                  <span>Optional Branch</span>
                  <span className={`campaign-map-selection-state campaign-map-selection-state--${selectedBranchState.claimed ? 'claimed' : selectedBranchState.unlocked ? 'unlocked' : 'locked'}`}>
                    {selectedBranchState.claimed ? 'Reward secured' : selectedBranchState.completed ? 'Completed' : selectedBranchState.unlocked ? 'Bonus route' : 'Mastery locked'}
                  </span>
                  <span>From M{String(selectedBranchSourceMission.number).padStart(2, '0')}</span>
                </div>
                <div className="campaign-map-selection-grid">
                  <div className={`campaign-map-selection-art campaign-map-branch-selection-art campaign-map-branch-selection-art--${selectedBranch.missionType}`}>
                    <span className="campaign-map-branch-glyph" data-branch-type={selectedBranch.missionType} aria-hidden="true"><span /></span>
                  </div>
                  <div className="campaign-map-selection-copy">
                    <div className="campaign-map-selection-title">
                      <h2 id="campaign-map-selection-title">{selectedBranchState.unlocked
                        ? selectedBranch.displayName
                        : selectedBranch.hiddenName ?? 'Encrypted Bonus Route'}</h2>
                    </div>
                    <span className="campaign-map-environment">{selectedBranchState.unlocked
                      ? formatBranchType(selectedBranch.missionType)
                      : `Master Mission ${String(selectedBranchSourceMission.number).padStart(2, '0')}`}</span>
                    <p>{selectedBranchState.unlocked
                      ? toTokenTerminology(selectedBranch.rewardPreview ?? 'A one-time mastery reward is waiting beyond this optional route.')
                      : 'Earn all 3 stars to reveal this bonus route. Your main campaign checkpoint will not change.'}</p>
                  </div>
                </div>
                <div className={`campaign-map-branch-mastery ${selectedBranchState.unlocked ? 'is-earned' : ''}`}>
                  <span aria-hidden="true">{[0, 1, 2].map((index) => index < selectedBranchSourceStars ? '\u2605' : '\u2606').join('')}</span>
                  <strong>{selectedBranchState.unlocked
                    ? 'Mastery route available'
                    : `Earn ${selectedBranch.requiredStars ?? 3} Stars to Unlock`}</strong>
                  <small>{selectedBranchState.unlocked
                    ? toTokenTerminology(selectedBranch.rewardPreview ?? formatBranchType(selectedBranch.missionType))
                    : `Master Mission ${String(selectedBranchSourceMission.number).padStart(2, '0')}`}</small>
                </div>
                {selectedBranchState.claimed && selectedBranchProgress?.lastResult ? (
                  <details className="campaign-map-branch-result" open>
                    <summary>{selectedBranchProgress.lastResult.kind === 'combat'
                      ? 'Secured route result'
                      : 'Recovered cache result'}</summary>
                    {selectedBranchProgress.lastResult.kind === 'combat' ? (
                      <div>
                        <span>{selectedBranchProgress.lastResult.objectiveLabel ?? 'Objective units'} <b>{selectedBranchProgress.lastResult.objectiveUnitsCompleted ?? 0}</b></span>
                        <span>Route reward <b>+{selectedBranchProgress.lastResult.baseReward}</b></span>
                        <span>One-time bonus <b>+{selectedBranchProgress.lastResult.oneTimeCompletionBonus}</b></span>
                      </div>
                    ) : (
                      <div>
                        <span>Presents <b>{selectedBranchProgress.lastResult.presentsDestroyed ?? 0}</b></span>
                        <span>Standard <b>{selectedBranchProgress.lastResult.standard ?? 0}</b></span>
                        <span>Armored <b>{selectedBranchProgress.lastResult.armored ?? 0}</b></span>
                        <span>Fast <b>{selectedBranchProgress.lastResult.fast ?? 0}</b></span>
                        <span>Golden <b>{selectedBranchProgress.lastResult.golden ?? 0}</b></span>
                        <span>Present Tokens <b>+{selectedBranchProgress.lastResult.collectedPresentCoins ?? 0}</b></span>
                        <span>Base cache <b>+{selectedBranchProgress.lastResult.baseReward}</b></span>
                        <span>One-time bonus <b>+{selectedBranchProgress.lastResult.oneTimeCompletionBonus}</b></span>
                      </div>
                    )}
                    <strong>Total secured +{formatTokenAmount(selectedBranchProgress.lastResult.totalCoins)}</strong>
                  </details>
                ) : null}
                <div className="campaign-map-actions is-current">
                  <PixelActionButton
                    tone={selectedBranchState.unlocked && !selectedBranchConsumed && !readOnly && Boolean(onLaunchBranch) ? 'green' : 'neutral'}
                    ready={selectedBranchState.unlocked && !selectedBranchConsumed && !readOnly && Boolean(onLaunchBranch)}
                    shine={selectedBranchState.new && selectedBranchState.unlocked && !selectedBranchConsumed}
                    disabled={!selectedBranchState.unlocked || selectedBranchConsumed || readOnly || status === 'launch-pending' || !onLaunchBranch}
                    onClick={() => onLaunchBranch?.({
                      branchId: selectedBranch.branchId,
                      sourceMissionId: selectedBranch.sourceMissionId,
                      missionDefinitionId: selectedBranch.missionDefinitionId,
                      kind: 'branch'
                    })}
                    className="campaign-map-launch"
                  >
                    {selectedBranchConsumed
                      ? selectedBranchState.claimed ? 'Reward Secured' : 'Bonus Completed'
                      : !selectedBranchState.unlocked
                        ? 'Earn 3 Stars to Unlock'
                        : status === 'launch-pending'
                          ? 'Preparing Bonus Route...'
                          : onLaunchBranch
                            ? 'Launch Bonus Route'
                            : 'Bonus Route Unavailable'}
                  </PixelActionButton>
                </div>
              </section>
            ) : selectedMission && selectedState ? (
              <section
                className="campaign-map-selection"
                aria-labelledby="campaign-map-selection-title"
              >
                <p className="campaign-map-sr-only" role="status">
                  Mission {selectedMissionDisplayLabel}, {selectedRevealed ? selectedMission.name : 'Encrypted Sector'}. {selectedRevealed && selectedEncounter
                    ? `${selectedEncounter.encounterClass === 'boss' ? 'Boss' : 'Elite enemy'}: ${selectedEncounter.name}. `
                    : ''}{selectedMapCurrent
                    ? 'Current Mission.'
                    : selectedState.completed
                      ? 'Completed.'
                      : selectedState.unlocked
                        ? 'Unlocked.'
                        : 'Locked.'}
                </p>
                <div className="campaign-map-selection-topline">
                  <span>{selectedSector?.name ?? 'Campaign'} / Mission {selectedMissionDisplayLabel}</span>
                  <span className={`campaign-map-selection-state campaign-map-selection-state--${selectedMapCurrent ? 'current' : selectedState.completed ? 'completed' : selectedState.unlocked ? 'unlocked' : 'locked'}`}>
                    {selectedMapCurrent
                      ? selectedState.completed ? 'Current / completed' : 'Current Mission'
                      : selectedState.completed
                        ? 'Completed'
                        : selectedState.unlocked
                          ? 'Unlocked'
                          : 'Locked'}
                  </span>
                  <span>{selectedState.completedWaves}/{selectedMission.waveIds.length} waves cleared</span>
                </div>
                <div className={`campaign-map-selection-grid campaign-map-selection-grid--${selectedMissionRole}`}>
                  <div
                    className={`campaign-map-selection-art ${!selectedEncounter ? 'campaign-map-selection-art--celestial' : ''} ${selectedLockedBossSilhouette ? 'is-locked-boss-silhouette' : ''}`}
                    style={{ '--campaign-node-tint': selectedMission.tint } as React.CSSProperties}
                  >
                    {selectedEncounter?.previewUrl ? (
                      <img src={selectedEncounter.previewUrl} alt="" />
                    ) : (
                      <CampaignMapCelestial
                        role={selectedMissionRole ?? 'introduction'}
                        missionNumber={selectedMission.number}
                        missionLabel={selectedMissionDisplayLabel}
                        className="campaign-map-celestial--selection"
                      />
                    )}
                  </div>
                  <div className="campaign-map-selection-copy">
                    <div className="campaign-map-selection-title">
                      <h2 id="campaign-map-selection-title">{selectedRevealed ? selectedMission.name : selectedLockedBossSilhouette ? 'Encrypted Command Target' : 'Encrypted Mission'}</h2>
                      {selectedRevealed && selectedEncounter ? (
                        <span
                          className="campaign-map-boss-tag"
                          data-encounter-class={selectedEncounter.encounterClass}
                        >
                          {selectedEncounter.encounterClass === 'boss' ? 'BOSS' : 'ELITE ENEMY'} · {selectedEncounter.name}
                        </span>
                      ) : null}
                      {selectedRevealed ? (
                        <span className="campaign-map-selection-stars" aria-label={`${selectedState.stars} of 3 stars earned`}>
                          <span aria-hidden="true">
                            {Array.from({ length: 3 }, (_, index) => index < selectedState.stars ? '\u2605' : '\u2606').join('')}
                          </span>
                          <b>{selectedState.stars}/3</b>
                        </span>
                      ) : null}
                    </div>
                    {selectedRevealed ? (
                      <div className="campaign-map-objectives campaign-map-objectives--compact" aria-label="Mission mastery objectives">
                        {selectedMission.starObjectives.map((objective, index) => (
                          <span key={objective.id} className={selectedRecord?.earnedStarIds.includes(objective.id) ? 'is-earned' : ''}>
                            <b aria-hidden="true">{index + 1}</b>{toTokenTerminology(objective.label)}
                            <em aria-label={`${formatTokenAmount(objective.rewardCoins)} reward`}>
                              <img src={CAMPAIGN_TOKEN_ICON_URL} alt="" aria-hidden="true" draggable={false} />
                              +{objective.rewardCoins}
                            </em>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                {selectedRevealed ? (
                  <>
                    <div className="campaign-map-records">
                      <span><small>Best score</small><strong>{(selectedRecord?.bestScore ?? 0).toLocaleString()}</strong></span>
                      <span><small>Best time</small><strong>{formatTime(selectedRecord?.bestClearTimeMs ?? null)}</strong></span>
                      <span><small>{selectedState.completed ? 'Replay total' : 'Base clear'}</small><strong>{formatTokenAmount(selectedState.completed ? selectedReplayReward : selectedBaseClearReward)}</strong></span>
                      <span><small>First-clear bonus</small><strong>{formatTokenAmount(selectedMission.reward.firstClearCoins)}</strong></span>
                      {selectedMission.bossEventId ? (
                        <span><small>Boss first-clear</small><strong>{formatTokenAmount(selectedMission.reward.bossFirstClearCoins)}</strong></span>
                      ) : null}
                      {selectedMasterySetBonus > 0 ? (
                        <span><small>3-star mastery set</small><strong>+{formatTokenAmount(selectedMasterySetBonus)}</strong></span>
                      ) : null}
                    </div>
                    {selectedMissionBranches.map((branch) => {
                      const branchState = getDisplayedBranchState(branch);
                      return (
                        <button
                          key={branch.branchId}
                          type="button"
                          className={`campaign-map-mastery-branch-link ${branchState.unlocked ? 'is-unlocked' : ''}`}
                          onClick={() => {
                            setSelectedBranchId(branch.branchId);
                            centerBranchNode(branch.branchId);
                          }}
                        >
                          <span aria-hidden="true">{branchState.unlocked ? '\u2605\u2605\u2605' : '\u2606\u2606\u2606'}</span>
                          <strong>{branchState.unlocked ? 'Bonus route unlocked' : 'Earn all 3 stars to reveal a bonus route'}</strong>
                          <small>{branchState.unlocked ? branch.displayName : `Master Mission ${selectedMissionDisplayLabel}`}</small>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <p className="campaign-map-locked-copy">Mission intelligence, command-target identity, rewards, and mastery objectives remain encrypted.</p>
                )}
                <div className={`campaign-map-actions ${selectedMission.id === progress.recommendedMissionId ? 'is-current' : ''}`}>
                  {selectedMission.id !== progress.recommendedMissionId || routeAwayFromCurrent ? (
                    <button
                      className="campaign-map-current-button"
                      type="button"
                      onClick={() => {
                        setSelectedMissionId(progress.recommendedMissionId);
                        window.requestAnimationFrame(() => centerMissionNode(progress.recommendedMissionId));
                      }}
                    >
                      Return to current Mission
                    </button>
                  ) : null}
                  {/* Campaign and the Weekly Run are separate modes with
                      separate progression, so an in-flight Weekly Run must not
                      lock the Campaign Map. This gate used to disable every
                      Mission launch for the rest of the week the moment a
                      weekly attempt started. */}
                  <PixelActionButton
                    data-onboarding-target="campaign-launch"
                    tone={launchReady && !readOnly ? 'green' : 'neutral'}
                    ready={launchReady && !readOnly}
                    shine={launchReady && !readOnly}
                    disabled={!launchReady || readOnly || status === 'launch-pending'}
                    onClick={() => {
                      if (routeSelectionRequest) onSelectRoute?.(routeSelectionRequest);
                      else if (launchRequest) onLaunch(launchRequest);
                    }}
                    className="campaign-map-launch"
                  >
                    {status === 'launch-pending'
                      ? 'Preparing Mission...'
                      : readOnly ? 'Viewing active route' : launchReady ? launchLabel : 'Locked'}
                  </PixelActionButton>
                </div>
                {status === 'launch-error' ? <p className="campaign-map-launch-error" role="alert">{errorMessage || 'Mission launch failed. Try again.'}</p> : null}
              </section>
            ) : null}
          </>
        )}

        {developerControls?.enabled ? (
          <details className="campaign-map-devtools" data-campaign-lab-authorized="true">
            <summary>Campaign Lab / founder controls</summary>
            <div className="campaign-map-devtools__body">
              <header className="campaign-map-devtools__header">
                <strong>Campaign Lab</strong>
                <span>Authorized runtime harness</span>
              </header>

              <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-route-heading">
                <h3 id="campaign-lab-route-heading">Route and internal wave</h3>
                <div className="campaign-map-devtools__grid">
                  <label>
                    Sector
                    <select
                      value={selectedSector?.id ?? ''}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const sectorId = event.currentTarget.value;
                        const mission = campaignSectors.find((sector) => sector.id === sectorId)?.missions[0];
                        controls.onSelectSector?.(sectorId);
                        if (mission) {
                          setSelectedMissionId(mission.id);
                          setSelectedBranchId(null);
                          controls.onSelectMission?.(mission.id);
                        }
                      })}
                    >
                      {campaignSectors.map((sector) => (
                        <option key={sector.id} value={sector.id}>{sector.name} / Missions {sector.missions[0]?.number}-{sector.missions.at(-1)?.number}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Mission
                    <select
                      value={selectedMission?.id ?? ''}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const missionId = event.currentTarget.value;
                        setSelectedMissionId(missionId);
                        setSelectedBranchId(null);
                        controls.onSelectMission?.(missionId);
                      })}
                    >
                      {orderedMissions.map((mission) => (
                        <option key={mission.id} value={mission.id}>M{String(mission.number).padStart(2, '0')} / {mission.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Internal wave
                    <select
                      value={developerWaveId}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const waveId = event.currentTarget.value;
                        setDeveloperWaveId(waveId);
                        if (selectedMission) controls.onSelectWave?.(selectedMission.id, waveId);
                      })}
                    >
                      {selectedMission?.waves.map((wave) => (
                        <option key={wave.id} value={wave.id}>Wave {wave.number}/{selectedMission.waveIds.length}: {wave.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-loadout-heading">
                <h3 id="campaign-lab-loadout-heading">Ship, support, and power</h3>
                <div className="campaign-map-devtools__grid">
                  <label>
                    Ship
                    <select
                      value={developerShipId}
                      disabled={!developerControls.onSelectShip}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const shipId = event.currentTarget.value;
                        setDeveloperShipId(shipId);
                        controls.onSelectShip?.(shipId);
                      })}
                    >
                      {developerShipOptions.map((option) => (
                        <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label aria-label="Left support">
                    Support
                    <select
                      value={developerSupportId}
                      disabled={!developerControls.onSelectSupport}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const supportId = event.currentTarget.value;
                        setDeveloperSupportId(supportId);
                        if (supportId !== 'none' && supportId === developerRightSupportId) {
                          setDeveloperRightSupportId('none');
                          controls.onSelectRightSupport?.('none');
                        }
                        controls.onSelectSupport?.(supportId);
                      })}
                    >
                      {developerSupportOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={option.disabled || (option.id !== 'none' && option.id === developerRightSupportId)}
                        >{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Right support
                    <select
                      value={developerRightSupportId}
                      disabled={!developerControls.onSelectRightSupport}
                      onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        const supportId = event.currentTarget.value;
                        setDeveloperRightSupportId(supportId);
                        if (supportId !== 'none' && supportId === developerSupportId) {
                          setDeveloperSupportId('none');
                          controls.onSelectSupport?.('none');
                        }
                        controls.onSelectRightSupport?.(supportId);
                      })}
                    >
                      {developerSupportOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                          disabled={option.disabled || (option.id !== 'none' && option.id === developerSupportId)}
                        >{option.label}</option>
                      ))}
                    </select>
                  </label>
                  {developerUpgradeTracks.map((track) => {
                    const minimum = track.minLevel ?? 0;
                    const maximum = Math.max(minimum, track.maxLevel ?? 7);
                    return (
                      <label key={track.id}>
                        {track.label}
                        <select
                          value={developerUpgradeLevels[track.id] ?? track.level}
                          disabled={!developerControls.onSetUpgradeLevel}
                          onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                            const level = Number(event.currentTarget.value);
                            setDeveloperUpgradeLevels((current) => ({ ...current, [track.id]: level }));
                            controls.onSetUpgradeLevel?.(track.id, level);
                          })}
                        >
                          {Array.from({ length: (maximum - minimum) + 1 }, (_, index) => minimum + index).map((level) => (
                            <option key={level} value={level}>Level {level}</option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>
                {typeof developerControls.loadoutPower === 'number' ? (
                  <div className="campaign-map-devtools__power-readout" aria-live="polite">
                    <span>Selected loadout power</span>
                    <strong>{developerControls.loadoutPower.toLocaleString()}</strong>
                    <small>{selectedPowerGuide
                      ? developerControls.loadoutPower >= selectedPowerGuide.comfortable
                        ? `Comfortable for ${selectedMission?.name ?? 'this Mission'}`
                        : developerControls.loadoutPower >= selectedPowerGuide.expected
                          ? `Meets expected ${selectedPowerGuide.expected.toLocaleString()}`
                          : `${Math.max(0, selectedPowerGuide.expected - developerControls.loadoutPower).toLocaleString()} below expected`
                      : 'No authored Mission target'}</small>
                  </div>
                ) : null}
                <div className="campaign-map-devtools__preset-row" aria-label="Power presets">
                  {(['low-power', 'expected-power', 'upgraded'] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={developerPreset === preset}
                      disabled={!developerControls.onApplyLoadoutPreset}
                      onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                        setDeveloperPreset(preset);
                        controls.onApplyLoadoutPreset?.(preset);
                      })}
                    >
                      {preset === 'low-power' ? 'Low power' : preset === 'expected-power' ? 'Expected' : 'Upgraded'}
                    </button>
                  ))}
                </div>
              </section>

              <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-runtime-heading">
                <h3 id="campaign-lab-runtime-heading">Runtime commands</h3>
                <div className="campaign-map-devtools__actions">
                  <button
                    type="button"
                    disabled={!campaignLabLaunchRequest || !developerControls.onLaunchSelectedMission}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                      if (campaignLabLaunchRequest) controls.onLaunchSelectedMission?.(campaignLabLaunchRequest);
                    })}
                  >Launch selected Mission</button>
                  <button
                    type="button"
                    disabled={!weeklySelectedRequest || !developerControls.onStartWeeklyStreak}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                      if (weeklySelectedRequest) controls.onStartWeeklyStreak?.(weeklySelectedRequest);
                    })}
                  >Start Weekly Streak</button>
                  <button
                    type="button"
                    disabled={!selectedGraphNode || !developerRouteChoice || !developerControls.onSimulateRouteChoice}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                      if (selectedGraphNode && developerRouteChoice) {
                        controls.onSimulateRouteChoice?.(selectedGraphNode.nodeId, developerRouteChoice.toNodeId);
                      }
                    })}
                  >Simulate route choice</button>
                  <button
                    type="button"
                    disabled={!developerBackwardNode || !developerControls.onSimulateBackwardSelection}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                      if (developerBackwardNode) controls.onSimulateBackwardSelection?.(developerBackwardNode.nodeId);
                    })}
                  >Simulate backward selection</button>
                  <button
                    type="button"
                    disabled={!developerControls.onRestartFormation}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onRestartFormation?.())}
                  >Restart formation</button>
                  <button
                    type="button"
                    aria-pressed={developerLoopFormation}
                    disabled={!developerControls.onLoopFormationChange}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                      const next = !developerLoopFormation;
                      setDeveloperLoopFormation(next);
                      controls.onLoopFormationChange?.(next);
                    })}
                  >{developerLoopFormation ? 'Stop formation loop' : 'Loop formation'}</button>
                  <button
                    type="button"
                    disabled={!developerControls.onSkipToMiniBoss}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onSkipToMiniBoss?.())}
                  >Skip to mini-boss</button>
                  <button
                    type="button"
                    disabled={!developerControls.onSkipToMajorBoss}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onSkipToMajorBoss?.())}
                  >Skip to major boss</button>
                </div>
              </section>

              <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-auth-heading">
                <h3 id="campaign-lab-auth-heading">Authentication previews</h3>
                <div className="campaign-map-devtools__actions">
                  <button
                    type="button"
                    disabled={!developerControls.onPreviewAuthenticationFlow}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewAuthenticationFlow?.('guest'))}
                  >Preview guest flow</button>
                  <button
                    type="button"
                    disabled={!developerControls.onPreviewAuthenticationFlow}
                    onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewAuthenticationFlow?.('wallet'))}
                  >Preview wallet flow</button>
                </div>
              </section>

              <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-progress-heading">
                <h3 id="campaign-lab-progress-heading">Progress and result harness</h3>
                <div className="campaign-map-devtools__actions">
                  <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onUnlockAll())}>Unlock all</button>
                  <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onResetProgress())}>Reset progress</button>
                  <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onResetStars())}>Reset stars</button>
                  <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => {
                    const next = !previewLocked;
                    setPreviewLocked(next);
                    controls.onPreviewLocked(next);
                  })}>{previewLocked ? 'Hide' : 'Preview'} locked</button>
                  {selectedMission ? (
                    <>
                      <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onCompleteMission(selectedMission.id))}>Complete Mission</button>
                      <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewNew(selectedMission.id))}>Preview new</button>
                      <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewResult(selectedMission.id))}>Preview Mission result</button>
                      <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onUnlockAll())}>Simulate full Campaign map</button>
                    </>
                  ) : null}
                </div>
              </section>

              {selectedMission ? (
                <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-preview-heading">
                  <h3 id="campaign-lab-preview-heading">Node, star, and reward preview</h3>
                  <div className="campaign-map-devtools__grid">
                    <label>
                      Main-path node state
                      <select
                        value={developerNodePreviewState}
                        onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                          const state = event.currentTarget.value as CampaignMapNodePreviewState;
                          setDeveloperNodePreviewState(state);
                          controls.onPreviewNodeState?.(selectedMission.id, state);
                        })}
                      >
                        <option value="saved">Saved state</option>
                        <option value="locked">Locked</option>
                        <option value="unlocked">Unlocked</option>
                        <option value="new">New</option>
                        <option value="current">Current</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                    <label>
                      Star claim
                      <select value={developerStarClaim} onChange={(event) => runCampaignMapDeveloperAction(
                        developerControls,
                        () => setDeveloperStarClaim(Number(event.currentTarget.value) as 1 | 2 | 3)
                      )}>
                        <option value="1">Star 1 / clear</option>
                        <option value="2">Star 2 / performance</option>
                        <option value="3">Star 3 / mastery</option>
                      </select>
                    </label>
                    <label>
                      Reward claim
                      <select value={developerRewardClaim} onChange={(event) => runCampaignMapDeveloperAction(
                        developerControls,
                        () => setDeveloperRewardClaim(event.currentTarget.value as CampaignLabRewardClaimType)
                      )}>
                        <option value="wave-clear">Wave clear</option>
                        <option value="mission-clear">Mission clear</option>
                        <option value="first-clear">First clear</option>
                        <option value="mini-boss-clear">Mini-boss clear</option>
                        <option value="major-boss-clear">Major-boss clear</option>
                        <option value="mastery-set">Mastery set</option>
                        <option value="replay">Replay</option>
                        <option value="branch">Branch</option>
                      </select>
                    </label>
                  </div>
                  <div className="campaign-map-devtools__actions">
                    <button
                      type="button"
                      disabled={!developerControls.onPreviewNodeState}
                      onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewNodeState?.(
                        selectedMission.id,
                        developerNodePreviewState
                      ))}
                    >Apply node preview</button>
                    <button
                      type="button"
                      disabled={!developerControls.onPreviewStarClaim}
                      onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewStarClaim?.(
                        selectedMission.id,
                        developerStarClaim
                      ))}
                    >Test star claim</button>
                    <button
                      type="button"
                      disabled={!developerControls.onPreviewRewardClaim}
                      onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewRewardClaim?.(
                        selectedMission.id,
                        developerRewardClaim
                      ))}
                    >Test reward claim</button>
                  </div>
                </section>
              ) : null}

              {selectedBranch && selectedBranchSourceMission ? (
                <section className="campaign-map-devtools__section" aria-labelledby="campaign-lab-branch-heading">
                  <h3 id="campaign-lab-branch-heading">Selected branch / {selectedBranch.displayName}</h3>
                  <div className="campaign-map-devtools__actions">
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onUnlockBranch?.(selectedBranch.branchId))}>Unlock branch</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onLockBranch?.(selectedBranch.branchId))}>Lock branch</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onGrantThreeStars?.(selectedBranch.sourceMissionId))}>Grant all three stars</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onResetBranch?.(selectedBranch.branchId))}>Reset completion</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onPreviewBranch?.(selectedBranch.branchId))}>Preview branch Mission</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onSimulateBranchFailure?.(selectedBranch.branchId))}>Simulate branch failure</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onSimulateBranchSuccess?.(selectedBranch.branchId))}>Simulate branch success</button>
                    <button type="button" onClick={() => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onVerifyDuplicateReward?.(selectedBranch.branchId))}>Verify duplicate-reward protection</button>
                  </div>
                  <div className="campaign-map-devtools__grid">
                    <label>
                      Branch node state
                      <select
                        value={developerBranchPreviewState ?? 'saved'}
                        onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => {
                          const state = event.currentTarget.value as CampaignMapBranchDiscoveryState | 'saved';
                          setDeveloperBranchPreviewState(state === 'saved' ? null : state);
                          controls.onPreviewBranchState?.(selectedBranch.branchId, state);
                        })}
                      >
                        <option value="saved">Saved state</option>
                        <option value="hidden">Hidden</option>
                        <option value="locked">Locked</option>
                        <option value="unlocked">Unlocked</option>
                        <option value="new">New</option>
                        <option value="completed">Completed</option>
                        <option value="claimed">Claimed</option>
                      </select>
                    </label>
                    <label>
                      Branch spawn seed
                      <input
                        type="number"
                        min="0"
                        max="9999"
                        value={developerControls.spawnSeed ?? 0}
                        onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onSpawnSeedChange?.(Number(event.currentTarget.value)))}
                      />
                    </label>
                    <label>
                      Branch value multiplier
                      <input
                        type="number"
                        min="0.25"
                        max="5"
                        step="0.25"
                        value={developerControls.valueMultiplier ?? 1}
                        onChange={(event) => runCampaignMapDeveloperAction(developerControls, (controls) => controls.onValueMultiplierChange?.(Number(event.currentTarget.value)))}
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              <section className="campaign-map-devtools__section campaign-map-devtools__section--telemetry" aria-labelledby="campaign-lab-telemetry-heading">
                <h3 id="campaign-lab-telemetry-heading">Live encounter telemetry</h3>
                <div className="campaign-map-devtools__telemetry" aria-live="polite">
                  <span><small>Encounter budget</small><strong>{formatCampaignLabNumber(developerTelemetry?.encounterBudget ?? developerTelemetry?.combatBudget, 0)}</strong></span>
                  <span><small>Threat cap / spent</small><strong>{formatCampaignLabNumber(developerTelemetry?.threatCap, 0)} / {formatCampaignLabNumber(developerTelemetry?.authoredThreatSpent, 0)}</strong></span>
                  <span><small>Pack / active threat</small><strong>{formatCampaignLabNumber(developerTelemetry?.enemyPackCost ?? developerTelemetry?.formationPackCost, 0)} / {formatCampaignLabNumber(developerTelemetry?.activeThreatCost, 0)}</strong></span>
                  <span><small>Performance cost / mobile cap</small><strong>{formatCampaignLabNumber(developerTelemetry?.activePerformanceCost, 0)} / {formatCampaignLabNumber(developerTelemetry?.mobilePerformanceBudget, 0)}</strong></span>
                  <span><small>Formation packs</small><strong>{developerTelemetry?.formationPackIds?.length ? developerTelemetry.formationPackIds.join(', ') : '--'}</strong></span>
                  <span><small>Enemy roles</small><strong>{developerTelemetryRoles.length ? developerTelemetryRoles.join(', ') : '--'}</strong></span>
                  <span><small>Active wave</small><strong>{developerTelemetry?.activeWaveId ?? (developerWaveId || '--')}</strong></span>
                  <span><small>Active formation</small><strong>{developerTelemetry?.activeFormationIds?.length ? developerTelemetry.activeFormationIds.join(', ') : '--'}</strong></span>
                  <span><small>Projectiles P / E</small><strong>{formatCampaignLabNumber(developerTelemetry?.playerProjectileCount, 0)} / {formatCampaignLabNumber(developerTelemetry?.enemyProjectileCount, 0)}</strong></span>
                  <span><small>Projectiles total / peak</small><strong>{formatCampaignLabNumber(developerTelemetry?.projectileCount, 0)} / {formatCampaignLabNumber(developerTelemetry?.peakProjectileCount, 0)}</strong></span>
                  <span><small>Firing enemies</small><strong>{formatCampaignLabNumber(developerTelemetry?.activeFiringEnemies, 0)}</strong></span>
                  <span><small>Clear time</small><strong>{formatCampaignLabDuration(
                    developerTelemetry?.clearTimeMs
                    ?? (typeof developerTelemetry?.clearTimeSeconds === 'number' ? developerTelemetry.clearTimeSeconds * 1000 : null)
                  )}</strong></span>
                  <span><small>Damage received</small><strong>{formatCampaignLabNumber(developerTelemetry?.damageReceived, 0)}</strong></span>
                  <span><small>Tokens earned</small><strong>{formatCampaignLabNumber(developerTelemetry?.coinsEarned, 0)}</strong></span>
                  <span><small>Weekly points earned</small><strong>{formatCampaignLabNumber(developerTelemetry?.weeklyPointsEarned, 0)}</strong></span>
                  <span><small>Player DPS</small><strong>{formatCampaignLabNumber(developerTelemetry?.playerDps)}</strong></span>
                  <span><small>Enemy average TTK</small><strong>{formatCampaignLabDuration(
                    developerTelemetry?.enemyTimeToKillMs
                    ?? (typeof developerTelemetry?.averageEnemyTimeToKillSeconds === 'number'
                      ? developerTelemetry.averageEnemyTimeToKillSeconds * 1000
                      : null)
                  )}</strong></span>
                  <span><small>Performance</small><strong>{developerTelemetry?.performanceLabel ?? (developerTelemetry?.performanceMode ? 'Reduced' : developerTelemetry ? 'Nominal' : '--')}</strong></span>
                  <span><small>FPS / frame</small><strong>{formatCampaignLabNumber(developerTelemetry?.fps)} / {formatCampaignLabNumber(developerTelemetry?.frameTimeMs)}ms</strong></span>
                </div>
                <div className="campaign-map-devtools__flags">
                  {(developerTelemetryFlags.length ? developerTelemetryFlags : ['No performance flags']).map((flag) => (
                    <span key={flag}>{flag}</span>
                  ))}
                </div>
              </section>
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
};

export default CampaignMap;
