import type {
  CampaignMasteryObjectiveDefinition,
  CampaignMasteryObjectiveKind,
  CampaignMissionRewardDefinition,
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition
} from '../game-config/types';
import {
  DEFAULT_GAME_CAMPAIGN,
  flattenLevels,
  getBackground,
  getPrimaryAssetPath
} from './levelConfig';

export const CAMPAIGN_PROGRESS_VERSION = 1;
export const CAMPAIGN_REPLAY_REWARD_MULTIPLIER = 0.35;
const MAX_COMPLETION_RECORDS = 96;
const MAX_RESULT_IDS = 384;
const MAX_REWARD_IDS = 768;

export type CampaignStarObjectiveKind = CampaignMasteryObjectiveKind;
export type CampaignStarObjective = CampaignMasteryObjectiveDefinition;
export type CampaignRewardDefinition = CampaignMissionRewardDefinition;

export interface CampaignMissionDefinition {
  id: string;
  number: number;
  name: string;
  description: string;
  backgroundId: string;
  tint: string;
  previewUrl: string;
  waveIds: string[];
  waves: Array<{ id: string; number: number; name: string }>;
  bossEventId: string | null;
  bossName: string | null;
  nextMissionId: string | null;
  reward: CampaignRewardDefinition;
  starObjectives: CampaignStarObjective[];
  mapPosition: { x: number; y: number };
}

export interface CampaignMissionRecord {
  completedWaveIds: string[];
  completed: boolean;
  stars: number;
  earnedStarIds: string[];
  bestScore: number;
  bestClearTimeMs: number | null;
  bestDamageTaken: number | null;
  bestCoinsCollected: number;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
  completionCount: number;
}

export interface CampaignCompletionRecord {
  resultId: string;
  playerId: string;
  campaignId: string;
  campaignRevision: number;
  missionId: string;
  waveId: string;
  completedAt: string;
  stageComplete: boolean;
  firstClearGranted: boolean;
  coinsAwarded: number;
  starsEarned: number;
}

export interface CampaignProgress {
  version: typeof CAMPAIGN_PROGRESS_VERSION;
  campaignId: string;
  campaignRevision: number;
  recommendedMissionId: string;
  recommendedWaveId: string;
  unlockedMissionIds: string[];
  unlockedWaveIdsByMission: Record<string, string[]>;
  completedMissionIds: string[];
  missionRecords: Record<string, CampaignMissionRecord>;
  claimedRewardIds: string[];
  processedResultIds: string[];
  completionRecords: CampaignCompletionRecord[];
  unviewedMissionIds: string[];
  unviewedStarMissionIds: string[];
  unviewedRewardIds: string[];
  campaignCompleted: boolean;
  updatedAt: string;
}

export interface CampaignCompletionInput {
  resultId: string;
  playerId: string;
  campaignId: string;
  campaignRevision: number;
  missionId: string;
  waveId: string;
  stageComplete: boolean;
  score: number;
  coinsCollected: number;
  damageTaken: number;
  elapsedSeconds: number;
  completedAt?: string;
}

export interface CampaignRewardGrant {
  id: string;
  label: string;
  amount: number;
  kind: 'wave' | 'mission' | 'first-clear' | 'boss' | 'star';
  oneTime: boolean;
}

export interface CampaignCompletionSettlement {
  duplicate: boolean;
  missionId: string;
  waveId: string;
  stageComplete: boolean;
  replay: boolean;
  firstClear: boolean;
  newlyUnlockedMissionId: string | null;
  previousStars: number;
  stars: number;
  newStarIds: string[];
  newBestScore: boolean;
  newBestTime: boolean;
  newBestCoins: boolean;
  grants: CampaignRewardGrant[];
  coinsAwarded: number;
  checkpoint: { missionId: string; waveId: string };
}

export interface CampaignMetricsReconciliation {
  accepted: boolean;
  progress: CampaignProgress;
  previousStars: number;
  stars: number;
  newStarIds: string[];
  newBestScore: boolean;
  newBestTime: boolean;
  newBestCoins: boolean;
  grants: CampaignRewardGrant[];
}

const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
};

const finite = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const uniqueStrings = (value: unknown, allowed?: ReadonlySet<string>) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((entry): entry is string => (
    typeof entry === 'string' && entry.length > 0 && (!allowed || allowed.has(entry))
  ))));
};

const isoDate = (value?: string) => {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return new Date().toISOString();
};

const trimTail = <T,>(values: T[], max: number) => values.slice(Math.max(0, values.length - max));

const hasBoss = (level: LevelDefinition) => level.waves
  .flatMap((wave) => wave.events)
  .find((event) => event.kind === 'boss' && event.bossId === 'gatekeeper');

const getMissionStarObjectives = (
  level: LevelDefinition,
  number: number,
  bossEventId: string | null
): CampaignStarObjective[] => {
  const scoreTarget = Math.max(
    integer(level.scoreTarget),
    1_600 + (number * 650) + (level.waves.length * 450)
  );
  const authoredSeconds = level.waves.reduce((total, wave) => (
    total + Math.max(1, finite(wave.durationSeconds, 60))
  ), 0);
  const baseReward = 8 + (number * 2);

  if (bossEventId) {
    return [
      { id: `${level.id}:complete`, label: 'Complete the Mission', kind: 'complete', target: 1, rewardCoins: baseReward },
      { id: `${level.id}:damage`, label: 'Clear with 2 damage or less', kind: 'damage-at-most', target: 2, rewardCoins: baseReward + 6 },
      {
        id: `${level.id}:time`,
        label: `Clear in ${Math.max(45, Math.round(authoredSeconds * 0.9))}s or less`,
        kind: 'time-at-most',
        target: Math.max(45, Math.round(authoredSeconds * 0.9)),
        rewardCoins: baseReward + 14
      }
    ];
  }

  return [
    { id: `${level.id}:complete`, label: 'Complete the Mission', kind: 'complete', target: 1, rewardCoins: baseReward },
    {
      id: `${level.id}:coins`,
      label: `Collect ${Math.max(8, level.waves.length * 4 + number)} coins`,
      kind: 'coins-at-least',
      target: Math.max(8, level.waves.length * 4 + number),
      rewardCoins: baseReward + 6
    },
    {
      id: `${level.id}:score`,
      label: `Reach ${scoreTarget.toLocaleString()} score`,
      kind: 'score-at-least',
      target: scoreTarget,
      rewardCoins: baseReward + 14
    }
  ];
};

export const buildCampaignMissionDefinitions = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignMissionDefinition[] => {
  const levels = flattenLevels(campaign);
  return levels.map((level, index) => {
    const waves = [...level.waves].sort((left, right) => left.order - right.order);
    const boss = hasBoss(level);
    const number = index + 1;
    const xPattern = [0.5, 0.27, 0.7, 0.38, 0.62];
    const authored = level.campaignProgression;
    const fallbackReward: CampaignRewardDefinition = {
      waveClearCoins: 5 + Math.ceil(number / 2),
      missionClearCoins: 16 + (number * 3),
      firstClearCoins: 24 + (number * 4),
      bossFirstClearCoins: boss ? 18 + (number * 2) : 0,
      replayMultiplier: CAMPAIGN_REPLAY_REWARD_MULTIPLIER
    };
    const fallbackMapPosition = {
      x: xPattern[index % xPattern.length],
      y: levels.length <= 1 ? 0.5 : index / (levels.length - 1)
    };
    const nextMissionId = authored && Object.prototype.hasOwnProperty.call(authored, 'nextMissionId')
      ? authored.nextMissionId ?? null
      : levels[index + 1]?.id ?? null;
    return {
      id: level.id,
      number,
      name: level.name,
      description: level.description,
      backgroundId: level.backgroundId,
      tint: getBackground(level.backgroundId).tint,
      previewUrl: getPrimaryAssetPath(level.scorecard.encounterAssetKey),
      waveIds: waves.map((wave) => wave.id),
      waves: waves.map((wave, waveIndex) => ({ id: wave.id, number: waveIndex + 1, name: wave.name })),
      bossEventId: boss?.id ?? null,
      bossName: boss?.label ?? null,
      nextMissionId,
      reward: authored ? { ...authored.reward } : fallbackReward,
      starObjectives: authored
        ? authored.masteryObjectives.map((objective) => ({ ...objective }))
        : getMissionStarObjectives(level, number, boss?.id ?? null),
      mapPosition: authored?.mapPosition
        ? { ...authored.mapPosition }
        : fallbackMapPosition
    };
  });
};

export const CAMPAIGN_MISSIONS = buildCampaignMissionDefinitions();

const createMissionRecord = (): CampaignMissionRecord => ({
  completedWaveIds: [],
  completed: false,
  stars: 0,
  earnedStarIds: [],
  bestScore: 0,
  bestClearTimeMs: null,
  bestDamageTaken: null,
  bestCoinsCollected: 0,
  firstCompletedAt: null,
  lastCompletedAt: null,
  completionCount: 0
});

const missionIndex = (missionId: string, missions = CAMPAIGN_MISSIONS) => (
  missions.findIndex((mission) => mission.id === missionId)
);

export const createCampaignProgress = (
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  legacyHighestMission = 0
): CampaignProgress => {
  const missions = buildCampaignMissionDefinitions(campaign);
  const first = missions[0];
  if (!first) throw new Error('Campaign progress requires at least one Mission.');
  const reached = Math.max(1, Math.min(missions.length, integer(legacyHighestMission, 1, missions.length)));
  const completedMissionIds = missions.slice(0, Math.max(0, reached - 1)).map((mission) => mission.id);
  const unlockedMissionIds = missions.slice(0, reached).map((mission) => mission.id);
  const missionRecords = Object.fromEntries(missions.map((mission, index) => {
    const completed = index < reached - 1;
    return [mission.id, {
      ...createMissionRecord(),
      completed,
      stars: completed ? 1 : 0,
      earnedStarIds: completed ? [mission.starObjectives[0].id] : [],
      completedWaveIds: completed ? [...mission.waveIds] : []
    }];
  }));
  const recommended = missions[reached - 1] ?? first;
  return {
    version: CAMPAIGN_PROGRESS_VERSION,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId: recommended.id,
    recommendedWaveId: recommended.waveIds[0],
    unlockedMissionIds,
    unlockedWaveIdsByMission: Object.fromEntries(missions.map((mission, index) => [
      mission.id,
      index < reached - 1 ? [...mission.waveIds] : index === reached - 1 ? [mission.waveIds[0]] : []
    ])),
    completedMissionIds,
    missionRecords,
    claimedRewardIds: [],
    processedResultIds: [],
    completionRecords: [],
    unviewedMissionIds: [],
    unviewedStarMissionIds: [],
    unviewedRewardIds: [],
    campaignCompleted: completedMissionIds.length === missions.length,
    updatedAt: new Date().toISOString()
  };
};

const sanitizeMissionRecord = (
  value: unknown,
  mission: CampaignMissionDefinition
): CampaignMissionRecord => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<CampaignMissionRecord>
    : {};
  const allowedWaves = new Set(mission.waveIds);
  const allowedStars = new Set(mission.starObjectives.map((objective) => objective.id));
  const earnedStarIds = uniqueStrings(record.earnedStarIds, allowedStars);
  const completedWaveIds = uniqueStrings(record.completedWaveIds, allowedWaves);
  const completed = Boolean(record.completed) || completedWaveIds.length === mission.waveIds.length;
  return {
    completedWaveIds: completed ? [...mission.waveIds] : [],
    completed,
    stars: Math.max(integer(record.stars, 0, 3), earnedStarIds.length, completed ? 1 : 0),
    earnedStarIds: completed && !earnedStarIds.includes(mission.starObjectives[0].id)
      ? [mission.starObjectives[0].id, ...earnedStarIds]
      : earnedStarIds,
    bestScore: integer(record.bestScore),
    bestClearTimeMs: record.bestClearTimeMs === null || record.bestClearTimeMs === undefined
      ? null
      : integer(record.bestClearTimeMs, 1),
    bestDamageTaken: record.bestDamageTaken === null || record.bestDamageTaken === undefined
      ? null
      : integer(record.bestDamageTaken),
    bestCoinsCollected: integer(record.bestCoinsCollected),
    firstCompletedAt: typeof record.firstCompletedAt === 'string' ? record.firstCompletedAt : null,
    lastCompletedAt: typeof record.lastCompletedAt === 'string' ? record.lastCompletedAt : null,
    completionCount: integer(record.completionCount)
  };
};

export const sanitizeCampaignProgress = (
  value: unknown,
  options: { campaign?: GameCampaignConfig; legacyHighestMission?: number } = {}
): CampaignProgress => {
  const campaign = options.campaign ?? DEFAULT_GAME_CAMPAIGN;
  const missions = buildCampaignMissionDefinitions(campaign);
  const fallback = createCampaignProgress(campaign, options.legacyHighestMission ?? 0);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const raw = value as Partial<CampaignProgress>;
  const missionIds = new Set(missions.map((mission) => mission.id));
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));
  const missionRecords = Object.fromEntries(missions.map((mission) => [
    mission.id,
    sanitizeMissionRecord(raw.missionRecords?.[mission.id], mission)
  ]));
  const completedMissionIds = missions
    .filter((mission) => missionRecords[mission.id].completed || raw.completedMissionIds?.includes(mission.id))
    .map((mission) => mission.id);
  completedMissionIds.forEach((id) => { missionRecords[id] = { ...missionRecords[id], completed: true, completedWaveIds: [...missions.find((mission) => mission.id === id)!.waveIds] }; });
  const unlockedMissionIds = new Set(uniqueStrings(raw.unlockedMissionIds, missionIds));
  unlockedMissionIds.add(missions[0].id);
  completedMissionIds.forEach((id) => {
    unlockedMissionIds.add(id);
    const index = missionIndex(id, missions);
    if (missions[index + 1]) unlockedMissionIds.add(missions[index + 1].id);
  });
  const unlockedWaveIdsByMission = Object.fromEntries(missions.map((mission) => {
    if (completedMissionIds.includes(mission.id)) return [mission.id, [...mission.waveIds]];
    return [mission.id, unlockedMissionIds.has(mission.id) ? [mission.waveIds[0]] : []];
  }));
  let recommendedMissionId = typeof raw.recommendedMissionId === 'string' && unlockedMissionIds.has(raw.recommendedMissionId)
    ? raw.recommendedMissionId
    : fallback.recommendedMissionId;
  let recommendedWaveId = missionById.get(recommendedMissionId)?.waveIds[0];
  if (!recommendedWaveId) {
    recommendedMissionId = fallback.recommendedMissionId;
    recommendedWaveId = fallback.recommendedWaveId;
  }
  const completionRecords = Array.isArray(raw.completionRecords)
    ? raw.completionRecords.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const record = entry as Partial<CampaignCompletionRecord>;
        const recordMission = typeof record.missionId === 'string'
          ? missionById.get(record.missionId)
          : null;
        if (
          typeof record.resultId !== 'string'
          || record.resultId.trim().length === 0
          || typeof record.missionId !== 'string'
          || typeof record.waveId !== 'string'
          || !recordMission
          || !recordMission.waveIds.includes(record.waveId)
        ) return [];
        return [{
          resultId: record.resultId,
          playerId: typeof record.playerId === 'string' ? record.playerId : 'unknown',
          campaignId: campaign.id,
          campaignRevision: integer(record.campaignRevision, 0),
          missionId: record.missionId,
          waveId: record.waveId,
          completedAt: isoDate(record.completedAt),
          stageComplete: Boolean(record.stageComplete),
          firstClearGranted: Boolean(record.firstClearGranted),
          coinsAwarded: integer(record.coinsAwarded),
          starsEarned: integer(record.starsEarned, 0, 3)
        }];
      })
    : [];
  return {
    version: CAMPAIGN_PROGRESS_VERSION,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    recommendedMissionId,
    recommendedWaveId,
    unlockedMissionIds: missions.filter((mission) => unlockedMissionIds.has(mission.id)).map((mission) => mission.id),
    unlockedWaveIdsByMission,
    completedMissionIds,
    missionRecords,
    claimedRewardIds: trimTail(uniqueStrings(raw.claimedRewardIds), MAX_REWARD_IDS),
    processedResultIds: trimTail(uniqueStrings(raw.processedResultIds), MAX_RESULT_IDS),
    completionRecords: trimTail(completionRecords, MAX_COMPLETION_RECORDS),
    unviewedMissionIds: uniqueStrings(raw.unviewedMissionIds, missionIds),
    unviewedStarMissionIds: uniqueStrings(raw.unviewedStarMissionIds, missionIds),
    unviewedRewardIds: uniqueStrings(raw.unviewedRewardIds),
    campaignCompleted: completedMissionIds.length === missions.length,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString()
  };
};

const objectiveMet = (objective: CampaignStarObjective, input: CampaignCompletionInput) => {
  switch (objective.kind) {
    case 'complete': return input.stageComplete;
    case 'damage-at-most': return input.damageTaken <= objective.target;
    case 'coins-at-least': return input.coinsCollected >= objective.target;
    case 'score-at-least': return input.score >= objective.target;
    case 'time-at-most': return input.elapsedSeconds > 0 && input.elapsedSeconds <= objective.target;
    default: return false;
  }
};

const addGrant = (
  grants: CampaignRewardGrant[],
  claimed: Set<string>,
  grant: CampaignRewardGrant
) => {
  if (grant.amount <= 0 || claimed.has(grant.id)) return;
  grants.push(grant);
  claimed.add(grant.id);
};

export const applyCampaignCompletion = (
  current: CampaignProgress,
  input: CampaignCompletionInput,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): { progress: CampaignProgress; settlement: CampaignCompletionSettlement } => {
  const progress = sanitizeCampaignProgress(current, { campaign });
  const missions = buildCampaignMissionDefinitions(campaign);
  const mission = missions.find((entry) => entry.id === input.missionId);
  const currentIndex = mission ? mission.waveIds.indexOf(input.waveId) : -1;
  const missionUnlocked = Boolean(mission && (
    progress.unlockedMissionIds.includes(mission.id)
    || progress.missionRecords[mission.id]?.completed
  ));
  if (
    !mission
    || currentIndex < 0
    || !missionUnlocked
    || !input.stageComplete
    || currentIndex !== mission.waveIds.length - 1
    || input.campaignId !== campaign.id
    || progress.processedResultIds.includes(input.resultId)
  ) {
    return {
      progress,
      settlement: {
        duplicate: true,
        missionId: input.missionId,
        waveId: input.waveId,
        stageComplete: input.stageComplete,
        replay: false,
        firstClear: false,
        newlyUnlockedMissionId: null,
        previousStars: progress.missionRecords[input.missionId]?.stars ?? 0,
        stars: progress.missionRecords[input.missionId]?.stars ?? 0,
        newStarIds: [],
        newBestScore: false,
        newBestTime: false,
        newBestCoins: false,
        grants: [],
        coinsAwarded: 0,
        checkpoint: { missionId: progress.recommendedMissionId, waveId: progress.recommendedWaveId }
      }
    };
  }

  const completedAt = isoDate(input.completedAt);
  const previousRecord = progress.missionRecords[mission.id] ?? createMissionRecord();
  const wasMissionComplete = previousRecord.completed;
  const stageComplete = true;
  const nextMission = mission.nextMissionId ? missions.find((entry) => entry.id === mission.nextMissionId) ?? null : null;
  const unlockedMissionIds = new Set(progress.unlockedMissionIds);
  const unlockedWaveIdsByMission = Object.fromEntries(Object.entries(progress.unlockedWaveIdsByMission).map(([id, ids]) => [id, [...ids]]));
  unlockedMissionIds.add(mission.id);
  unlockedWaveIdsByMission[mission.id] = [...mission.waveIds];
  let newlyUnlockedMissionId: string | null = null;
  if (stageComplete && nextMission) {
    if (!unlockedMissionIds.has(nextMission.id)) newlyUnlockedMissionId = nextMission.id;
    unlockedMissionIds.add(nextMission.id);
    unlockedWaveIdsByMission[nextMission.id] = Array.from(new Set([
      ...(unlockedWaveIdsByMission[nextMission.id] ?? []),
      nextMission.waveIds[0]
    ]));
  }

  const earnedStarIds = new Set(previousRecord.earnedStarIds);
  const newStarIds: string[] = [];
  if (stageComplete) {
    mission.starObjectives.forEach((objective) => {
      if (objectiveMet(objective, input) && !earnedStarIds.has(objective.id)) {
        earnedStarIds.add(objective.id);
        newStarIds.push(objective.id);
      }
    });
  }
  const stars = Math.max(previousRecord.stars, Math.min(3, earnedStarIds.size));
  const inputScore = integer(input.score);
  const inputCoins = integer(input.coinsCollected);
  const inputElapsedSeconds = finite(input.elapsedSeconds);
  const inputClearTimeMs = stageComplete && inputElapsedSeconds > 0
    ? Math.max(1, Math.round(inputElapsedSeconds * 1000))
    : null;
  const newBestScore = inputScore > previousRecord.bestScore;
  const newBestCoins = inputCoins > previousRecord.bestCoinsCollected;
  const newBestTime = inputClearTimeMs !== null && (
    previousRecord.bestClearTimeMs === null
    || inputClearTimeMs < previousRecord.bestClearTimeMs
  );
  const record: CampaignMissionRecord = {
    ...previousRecord,
    completedWaveIds: [...mission.waveIds],
    completed: true,
    stars,
    earnedStarIds: Array.from(earnedStarIds),
    bestScore: Math.max(previousRecord.bestScore, inputScore),
    bestClearTimeMs: newBestTime ? inputClearTimeMs : previousRecord.bestClearTimeMs,
    bestDamageTaken: stageComplete
      ? Math.min(previousRecord.bestDamageTaken ?? Number.MAX_SAFE_INTEGER, integer(input.damageTaken))
      : previousRecord.bestDamageTaken,
    bestCoinsCollected: Math.max(previousRecord.bestCoinsCollected, inputCoins),
    firstCompletedAt: stageComplete ? previousRecord.firstCompletedAt ?? completedAt : previousRecord.firstCompletedAt,
    lastCompletedAt: stageComplete ? completedAt : previousRecord.lastCompletedAt,
    completionCount: stageComplete ? previousRecord.completionCount + 1 : previousRecord.completionCount
  };

  const claimed = new Set(progress.claimedRewardIds);
  const grants: CampaignRewardGrant[] = [];
  const replay = wasMissionComplete;
  const repeatMultiplier = replay ? mission.reward.replayMultiplier : 1;
  addGrant(grants, claimed, {
    id: `campaign:${input.resultId}:waves`,
    label: replay ? 'Mission waves replay' : 'Mission waves clear',
    amount: Math.max(1, Math.round(mission.reward.waveClearCoins * repeatMultiplier)) * mission.waveIds.length,
    kind: 'wave',
    oneTime: false
  });
  if (stageComplete) {
    addGrant(grants, claimed, {
      id: `campaign:${input.resultId}:mission`,
      label: wasMissionComplete ? 'Mission replay' : 'Mission clear',
      amount: Math.max(1, Math.round(mission.reward.missionClearCoins * (wasMissionComplete ? mission.reward.replayMultiplier : 1))),
      kind: 'mission',
      oneTime: false
    });
  }
  if (stageComplete && !wasMissionComplete) {
    addGrant(grants, claimed, {
      id: `campaign:${mission.id}:first-clear`,
      label: 'First clear',
      amount: mission.reward.firstClearCoins,
      kind: 'first-clear',
      oneTime: true
    });
    if (mission.bossEventId) {
      addGrant(grants, claimed, {
        id: `campaign:${mission.id}:boss-first-clear`,
        label: `${mission.bossName ?? 'Boss'} first-clear`,
        amount: mission.reward.bossFirstClearCoins,
        kind: 'boss',
        oneTime: true
      });
    }
  }
  newStarIds.forEach((starId) => {
    const objective = mission.starObjectives.find((entry) => entry.id === starId);
    if (!objective) return;
    addGrant(grants, claimed, {
      id: `campaign:${starId}:reward`,
      label: objective.label,
      amount: objective.rewardCoins,
      kind: 'star',
      oneTime: true
    });
  });
  const coinsAwarded = grants.reduce((total, grant) => total + grant.amount, 0);

  const previousCheckpointIndex = missionIndex(progress.recommendedMissionId, missions);
  const candidateMissionId = nextMission?.id ?? mission.id;
  const candidateCheckpointIndex = missionIndex(candidateMissionId, missions);
  const advancesCheckpoint = candidateCheckpointIndex > previousCheckpointIndex;
  const recommendedMissionId = advancesCheckpoint ? candidateMissionId : progress.recommendedMissionId;
  const recommendedWaveId = missions.find((entry) => entry.id === recommendedMissionId)?.waveIds[0]
    ?? progress.recommendedWaveId;
  const completedMissionIds = new Set(progress.completedMissionIds);
  if (stageComplete) completedMissionIds.add(mission.id);
  const completionRecord: CampaignCompletionRecord = {
    resultId: input.resultId,
    playerId: input.playerId,
    campaignId: campaign.id,
    campaignRevision: campaign.revision,
    missionId: mission.id,
    waveId: input.waveId,
    completedAt,
    stageComplete,
    firstClearGranted: stageComplete && !wasMissionComplete,
    coinsAwarded,
    starsEarned: newStarIds.length
  };
  const nextProgress: CampaignProgress = {
    ...progress,
    campaignId: campaign.id,
    campaignRevision: Math.max(progress.campaignRevision, input.campaignRevision, campaign.revision),
    recommendedMissionId,
    recommendedWaveId,
    unlockedMissionIds: missions.filter((entry) => unlockedMissionIds.has(entry.id)).map((entry) => entry.id),
    unlockedWaveIdsByMission,
    completedMissionIds: missions.filter((entry) => completedMissionIds.has(entry.id)).map((entry) => entry.id),
    missionRecords: { ...progress.missionRecords, [mission.id]: record },
    claimedRewardIds: trimTail(Array.from(claimed), MAX_REWARD_IDS),
    processedResultIds: trimTail([...progress.processedResultIds, input.resultId], MAX_RESULT_IDS),
    completionRecords: trimTail([...progress.completionRecords, completionRecord], MAX_COMPLETION_RECORDS),
    unviewedMissionIds: newlyUnlockedMissionId
      ? Array.from(new Set([...progress.unviewedMissionIds, newlyUnlockedMissionId]))
      : progress.unviewedMissionIds,
    unviewedStarMissionIds: newStarIds.length > 0
      ? Array.from(new Set([...progress.unviewedStarMissionIds, mission.id]))
      : progress.unviewedStarMissionIds,
    unviewedRewardIds: grants.some((grant) => grant.oneTime)
      ? Array.from(new Set([...progress.unviewedRewardIds, ...grants.filter((grant) => grant.oneTime).map((grant) => grant.id)]))
      : progress.unviewedRewardIds,
    campaignCompleted: completedMissionIds.size === missions.length,
    updatedAt: completedAt
  };

  return {
    progress: nextProgress,
    settlement: {
      duplicate: false,
      missionId: mission.id,
      waveId: input.waveId,
      stageComplete,
      replay,
      firstClear: stageComplete && !wasMissionComplete,
      newlyUnlockedMissionId,
      previousStars: previousRecord.stars,
      stars,
      newStarIds,
      newBestScore,
      newBestTime,
      newBestCoins,
      grants,
      coinsAwarded,
      checkpoint: { missionId: recommendedMissionId, waveId: recommendedWaveId }
    }
  };
};

/**
 * Reconciles the final post-reward-window metrics for an already accepted
 * Campaign result. It can improve records and award newly satisfied mastery
 * stars, but it never advances a checkpoint or repeats Wave/Mission rewards.
 */
export const finalizeCampaignCompletionMetrics = (
  current: CampaignProgress,
  input: CampaignCompletionInput,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignMetricsReconciliation => {
  const progress = sanitizeCampaignProgress(current, { campaign });
  const completionRecord = progress.completionRecords.find((entry) => entry.resultId === input.resultId);
  const mission = buildCampaignMissionDefinitions(campaign).find((entry) => entry.id === input.missionId);
  const previousRecord = mission ? progress.missionRecords[mission.id] : null;
  if (
    !completionRecord
    || !mission
    || !previousRecord
    || completionRecord.missionId !== input.missionId
    || completionRecord.waveId !== input.waveId
    || input.campaignId !== campaign.id
  ) {
    return {
      accepted: false,
      progress,
      previousStars: previousRecord?.stars ?? 0,
      stars: previousRecord?.stars ?? 0,
      newStarIds: [],
      newBestScore: false,
      newBestTime: false,
      newBestCoins: false,
      grants: []
    };
  }

  const inputScore = integer(input.score);
  const inputCoins = integer(input.coinsCollected);
  const inputElapsedSeconds = finite(input.elapsedSeconds);
  const inputClearTimeMs = completionRecord.stageComplete && inputElapsedSeconds > 0
    ? Math.max(1, Math.round(inputElapsedSeconds * 1000))
    : null;
  const newBestScore = inputScore > previousRecord.bestScore;
  const newBestCoins = inputCoins > previousRecord.bestCoinsCollected;
  const newBestTime = inputClearTimeMs !== null && (
    previousRecord.bestClearTimeMs === null
    || inputClearTimeMs < previousRecord.bestClearTimeMs
  );
  const earnedStarIds = new Set(previousRecord.earnedStarIds);
  const newStarIds: string[] = [];
  if (completionRecord.stageComplete) {
    mission.starObjectives.forEach((objective) => {
      if (objectiveMet(objective, input) && !earnedStarIds.has(objective.id)) {
        earnedStarIds.add(objective.id);
        newStarIds.push(objective.id);
      }
    });
  }
  const stars = Math.max(previousRecord.stars, Math.min(3, earnedStarIds.size));
  const claimed = new Set(progress.claimedRewardIds);
  const grants: CampaignRewardGrant[] = [];
  newStarIds.forEach((starId) => {
    const objective = mission.starObjectives.find((entry) => entry.id === starId);
    if (!objective) return;
    addGrant(grants, claimed, {
      id: `campaign:${starId}:reward`,
      label: objective.label,
      amount: objective.rewardCoins,
      kind: 'star',
      oneTime: true
    });
  });

  if (
    !newBestScore
    && !newBestTime
    && !newBestCoins
    && newStarIds.length === 0
  ) {
    return {
      accepted: true,
      progress,
      previousStars: previousRecord.stars,
      stars: previousRecord.stars,
      newStarIds: [],
      newBestScore: false,
      newBestTime: false,
      newBestCoins: false,
      grants: []
    };
  }

  const updatedAt = isoDate(input.completedAt);
  const updatedRecord: CampaignMissionRecord = {
    ...previousRecord,
    stars,
    earnedStarIds: Array.from(earnedStarIds),
    bestScore: Math.max(previousRecord.bestScore, inputScore),
    bestClearTimeMs: newBestTime ? inputClearTimeMs : previousRecord.bestClearTimeMs,
    bestCoinsCollected: Math.max(previousRecord.bestCoinsCollected, inputCoins)
  };
  const grantTotal = grants.reduce((total, grant) => total + grant.amount, 0);
  const completionRecords = progress.completionRecords.map((entry) => (
    entry.resultId === input.resultId
      ? {
          ...entry,
          coinsAwarded: entry.coinsAwarded + grantTotal,
          starsEarned: entry.starsEarned + newStarIds.length
        }
      : entry
  ));
  const nextProgress: CampaignProgress = {
    ...progress,
    missionRecords: { ...progress.missionRecords, [mission.id]: updatedRecord },
    claimedRewardIds: trimTail(Array.from(claimed), MAX_REWARD_IDS),
    completionRecords,
    unviewedStarMissionIds: newStarIds.length > 0
      ? Array.from(new Set([...progress.unviewedStarMissionIds, mission.id]))
      : progress.unviewedStarMissionIds,
    unviewedRewardIds: grants.length > 0
      ? Array.from(new Set([...progress.unviewedRewardIds, ...grants.map((grant) => grant.id)]))
      : progress.unviewedRewardIds,
    updatedAt
  };

  return {
    accepted: true,
    progress: nextProgress,
    previousStars: previousRecord.stars,
    stars,
    newStarIds,
    newBestScore,
    newBestTime,
    newBestCoins,
    grants
  };
};

export const markCampaignMapViewed = (progress: CampaignProgress): CampaignProgress => {
  if (
    progress.unviewedMissionIds.length === 0
    && progress.unviewedStarMissionIds.length === 0
    && progress.unviewedRewardIds.length === 0
  ) return progress;
  return {
    ...progress,
    unviewedMissionIds: [],
    unviewedStarMissionIds: [],
    unviewedRewardIds: [],
    updatedAt: new Date().toISOString()
  };
};

export const setCampaignCheckpoint = (
  current: CampaignProgress,
  missionId: string,
  _waveId?: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignProgress => {
  const progress = sanitizeCampaignProgress(current, { campaign });
  const missions = buildCampaignMissionDefinitions(campaign);
  const mission = missions.find((entry) => entry.id === missionId);
  if (!mission) return progress;
  const targetIndex = missions.findIndex((entry) => entry.id === missionId);
  const unlockedMissionIds = missions.slice(0, targetIndex + 1).map((entry) => entry.id);
  const unlockedWaveIdsByMission = { ...progress.unlockedWaveIdsByMission };
  unlockedWaveIdsByMission[mission.id] = progress.completedMissionIds.includes(mission.id)
    ? [...mission.waveIds]
    : [mission.waveIds[0]];
  return {
    ...progress,
    recommendedMissionId: mission.id,
    recommendedWaveId: mission.waveIds[0],
    unlockedMissionIds: Array.from(new Set([...progress.unlockedMissionIds, ...unlockedMissionIds])),
    unlockedWaveIdsByMission,
    updatedAt: new Date().toISOString()
  };
};

export const unlockAllCampaignMissions = (
  current: CampaignProgress,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignProgress => {
  const progress = sanitizeCampaignProgress(current, { campaign });
  const missions = buildCampaignMissionDefinitions(campaign);
  return {
    ...progress,
    unlockedMissionIds: missions.map((mission) => mission.id),
    unlockedWaveIdsByMission: Object.fromEntries(missions.map((mission) => [mission.id, [...mission.waveIds]])),
    unviewedMissionIds: Array.from(new Set([...progress.unviewedMissionIds, ...missions.map((mission) => mission.id)])),
    updatedAt: new Date().toISOString()
  };
};

export const resetCampaignStars = (
  current: CampaignProgress,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignProgress => {
  const progress = sanitizeCampaignProgress(current, { campaign });
  return {
    ...progress,
    missionRecords: Object.fromEntries(Object.entries(progress.missionRecords).map(([missionId, record]) => [
      missionId,
      { ...record, stars: 0, earnedStarIds: [] }
    ])),
    claimedRewardIds: progress.claimedRewardIds.filter((id) => !id.includes(':reward')),
    unviewedStarMissionIds: [],
    updatedAt: new Date().toISOString()
  };
};

export const mergeCampaignProgress = (
  left: CampaignProgress,
  right: CampaignProgress,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
): CampaignProgress => {
  const first = sanitizeCampaignProgress(left, { campaign });
  const second = sanitizeCampaignProgress(right, { campaign });
  const missions = buildCampaignMissionDefinitions(campaign);
  const firstCheckpoint = missionIndex(first.recommendedMissionId, missions);
  const secondCheckpoint = missionIndex(second.recommendedMissionId, missions);
  const checkpoint = secondCheckpoint > firstCheckpoint ? second : first;
  const missionRecords = Object.fromEntries(missions.map((mission) => {
    const a = first.missionRecords[mission.id] ?? createMissionRecord();
    const b = second.missionRecords[mission.id] ?? createMissionRecord();
    const firstCompletedAt = [a.firstCompletedAt, b.firstCompletedAt].filter((value): value is string => Boolean(value)).sort()[0] ?? null;
    const lastCompletedAt = [a.lastCompletedAt, b.lastCompletedAt].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return [mission.id, {
      completedWaveIds: mission.waveIds.filter((id) => a.completedWaveIds.includes(id) || b.completedWaveIds.includes(id)),
      completed: a.completed || b.completed,
      stars: Math.max(a.stars, b.stars),
      earnedStarIds: Array.from(new Set([...a.earnedStarIds, ...b.earnedStarIds])),
      bestScore: Math.max(a.bestScore, b.bestScore),
      bestClearTimeMs: [a.bestClearTimeMs, b.bestClearTimeMs].filter((value): value is number => value !== null).sort((x, y) => x - y)[0] ?? null,
      bestDamageTaken: [a.bestDamageTaken, b.bestDamageTaken].filter((value): value is number => value !== null).sort((x, y) => x - y)[0] ?? null,
      bestCoinsCollected: Math.max(a.bestCoinsCollected, b.bestCoinsCollected),
      firstCompletedAt,
      lastCompletedAt,
      completionCount: Math.max(a.completionCount, b.completionCount)
    }];
  }));
  return sanitizeCampaignProgress({
    ...first,
    recommendedMissionId: checkpoint.recommendedMissionId,
    recommendedWaveId: checkpoint.recommendedWaveId,
    unlockedMissionIds: Array.from(new Set([...first.unlockedMissionIds, ...second.unlockedMissionIds])),
    unlockedWaveIdsByMission: Object.fromEntries(missions.map((mission) => [
      mission.id,
      Array.from(new Set([
        ...(first.unlockedWaveIdsByMission[mission.id] ?? []),
        ...(second.unlockedWaveIdsByMission[mission.id] ?? [])
      ]))
    ])),
    completedMissionIds: Array.from(new Set([...first.completedMissionIds, ...second.completedMissionIds])),
    missionRecords,
    claimedRewardIds: trimTail(Array.from(new Set([...first.claimedRewardIds, ...second.claimedRewardIds])), MAX_REWARD_IDS),
    processedResultIds: trimTail(Array.from(new Set([...first.processedResultIds, ...second.processedResultIds])), MAX_RESULT_IDS),
    completionRecords: trimTail(
      Array.from(new Map([...first.completionRecords, ...second.completionRecords].map((record) => [record.resultId, record])).values())
        .sort((a, b) => a.completedAt.localeCompare(b.completedAt)),
      MAX_COMPLETION_RECORDS
    ),
    unviewedMissionIds: Array.from(new Set([...first.unviewedMissionIds, ...second.unviewedMissionIds])),
    unviewedStarMissionIds: Array.from(new Set([...first.unviewedStarMissionIds, ...second.unviewedStarMissionIds])),
    unviewedRewardIds: Array.from(new Set([...first.unviewedRewardIds, ...second.unviewedRewardIds])),
    campaignCompleted: first.campaignCompleted || second.campaignCompleted,
    updatedAt: [first.updatedAt, second.updatedAt].sort().at(-1)
  }, { campaign });
};

export const getCampaignCheckpointLabel = (
  progress: CampaignProgress,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
) => {
  const missions = buildCampaignMissionDefinitions(campaign);
  const mission = missions.find((entry) => entry.id === progress.recommendedMissionId) ?? missions[0];
  const hasAnyCompletion = progress.completedMissionIds.length > 0;
  const previousMissionComplete = mission.number > 1
    && progress.completedMissionIds.includes(missions[mission.number - 2]?.id);
  return {
    missionId: mission.id,
    missionNumber: mission.number,
    missionName: mission.name,
    waveId: mission.waveIds[0],
    waveNumber: 1,
    waveTotal: mission.waveIds.length,
    action: progress.campaignCompleted
      ? 'Replay Final Mission'
      : !hasAnyCompletion
      ? 'Start Mission'
      : previousMissionComplete
        ? 'Next Mission'
        : 'Start Mission'
  } as const;
};

export const getCampaignNotificationCount = (progress: CampaignProgress) => new Set([
  ...progress.unviewedMissionIds.map((id) => `mission:${id}`),
  ...progress.unviewedStarMissionIds.map((id) => `star:${id}`),
  ...progress.unviewedRewardIds.map((id) => `reward:${id}`)
]).size;

export const getCampaignMissionById = (missionId: string) => (
  CAMPAIGN_MISSIONS.find((mission) => mission.id === missionId) ?? null
);

export const getCampaignWaveById = (
  mission: CampaignMissionDefinition,
  waveId: string
): { id: string; number: number; name: string } | null => (
  mission.waves.find((wave) => wave.id === waveId) ?? null
);

export const isCampaignMissionUnlocked = (progress: CampaignProgress, missionId: string) => (
  progress.unlockedMissionIds.includes(missionId)
);

export const isCampaignWaveUnlocked = (progress: CampaignProgress, missionId: string, waveId: string) => (
  progress.unlockedWaveIdsByMission[missionId]?.includes(waveId) ?? false
);

export const getCampaignWaveDefinition = (
  campaign: GameCampaignConfig,
  missionId: string,
  waveId: string
): WaveDefinition | null => {
  const level = campaign.levels.find((entry) => entry.id === missionId);
  return level?.waves.find((entry) => entry.id === waveId) ?? null;
};
