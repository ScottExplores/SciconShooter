import type {
  AsteroidEvent,
  CampaignBranchDefinition,
  CampaignCombatBranchMissionDefinition,
  CampaignPresentDropMissionDefinition,
  GameCampaignConfig,
  PresentDropPatternId,
  PresentDropPresentKind,
  WaveEvent
} from '../game-config/types';

export interface PresentDropDestroyedCounts {
  standard: number;
  armored: number;
  fast: number;
  golden: number;
}

export interface PresentDropRuntimeResult {
  destroyed: PresentDropDestroyedCounts;
  destroyedTotal: number;
  collectedPresentCoins: number;
  baseCacheReward: number;
  oneTimeCompletionBonus: number;
  totalCoins: number;
}

export interface CampaignBranchRuntimeOptions {
  /** Founder-only deterministic layout variation used by the Campaign test panel. */
  spawnSeed?: number;
  /** Founder-only reward tuning multiplier. Production runs always use 1. */
  valueMultiplier?: number;
}

export interface CampaignCombatBranchRuntimeResult {
  success: boolean;
  objectiveUnitsCompleted: number;
  baseCompletionReward: number;
  oneTimeCompletionBonus: number;
  performanceCoins: number;
  totalCoins: number;
}

export type CampaignPresentDropBranchDefinition = CampaignBranchDefinition & {
  missionType: 'present-drop';
  missionDefinition: CampaignPresentDropMissionDefinition;
};

export type CampaignCombatBranchDefinition = CampaignBranchDefinition & {
  missionType: CampaignCombatBranchMissionDefinition['kind'];
  missionDefinition: CampaignCombatBranchMissionDefinition;
};

export const isPresentDropBranchDefinition = (
  branch: CampaignBranchDefinition
): branch is CampaignPresentDropBranchDefinition => (
  branch.missionType === 'present-drop' && branch.missionDefinition.kind === 'present-drop'
);

export const isCombatBranchDefinition = (
  branch: CampaignBranchDefinition
): branch is CampaignCombatBranchDefinition => (
  branch.missionType === branch.missionDefinition.kind
  && branch.missionDefinition.kind !== 'present-drop'
);

const PRESENT_KINDS: readonly PresentDropPresentKind[] = [
  'standard',
  'armored',
  'fast',
  'golden'
];

const emptyDestroyedCounts = (): PresentDropDestroyedCounts => ({
  standard: 0,
  armored: 0,
  fast: 0,
  golden: 0
});

const finiteInteger = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
};

const normalizeValueMultiplier = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0.25, Math.min(5, number)) : 1;
};

const spawnXForPattern = (
  pattern: PresentDropPatternId,
  index: number,
  count: number,
  spawnSeed = 0
) => {
  if (pattern === 'final-center') return 0.5;
  if (pattern === 'sine-sweep') {
    const denominator = Math.max(1, count - 1);
    const seedPhase = (finiteInteger(spawnSeed, 0, 9_999) % 8) * (Math.PI / 4);
    return 0.5 + (Math.sin((index / denominator) * Math.PI * 2 - Math.PI / 2 + seedPhase) * 0.32);
  }
  const lanes = pattern === 'staggered-columns'
    ? [0.24, 0.7, 0.38, 0.62, 0.18, 0.82]
    : [0.14, 0.32, 0.5, 0.68, 0.86];
  const laneOffset = finiteInteger(spawnSeed, 0, 9_999) % lanes.length;
  return lanes[(index + laneOffset) % lanes.length];
};

export const getCampaignBranchDefinition = (
  campaign: GameCampaignConfig,
  branchId: string
) => campaign.campaignBranches?.find((branch) => branch.branchId === branchId) ?? null;

export const getPresentDropAuthoredCounts = (
  branch: CampaignBranchDefinition
): PresentDropDestroyedCounts => {
  if (!isPresentDropBranchDefinition(branch)) return emptyDestroyedCounts();
  const byTypeId = new Map(
    branch.missionDefinition.presentTypes.map((present) => [present.id, present.kind] as const)
  );
  return branch.missionDefinition.spawnGroups.reduce((counts, group) => {
    const kind = byTypeId.get(group.presentTypeId);
    if (kind) counts[kind] += finiteInteger(group.count);
    return counts;
  }, emptyDestroyedCounts());
};

/**
 * Treats the GameEngine summary as untrusted input and clamps it to the
 * authored target counts and coin values before permanent settlement.
 */
export const verifyPresentDropRuntimeResult = (
  branch: CampaignBranchDefinition,
  input: {
    destroyed?: Partial<Record<PresentDropPresentKind, unknown>> | null;
    coinsCollected?: unknown;
  },
  options: CampaignBranchRuntimeOptions = {}
): PresentDropRuntimeResult => {
  if (!isPresentDropBranchDefinition(branch)) {
    throw new Error(`Campaign branch ${branch.branchId} is not a Present Drop`);
  }
  const valueMultiplier = normalizeValueMultiplier(options.valueMultiplier);
  const authoredCounts = getPresentDropAuthoredCounts(branch);
  const destroyed = emptyDestroyedCounts();
  PRESENT_KINDS.forEach((kind) => {
    destroyed[kind] = finiteInteger(input.destroyed?.[kind], 0, authoredCounts[kind]);
  });
  const coinValueByKind = new Map(
    branch.missionDefinition.presentTypes.map((present) => [
      present.kind,
      Math.max(1, Math.round(present.coinValue * valueMultiplier))
    ] as const)
  );
  const destroyedCoinCeiling = PRESENT_KINDS.reduce(
    (total, kind) => total + destroyed[kind] * finiteInteger(coinValueByKind.get(kind)),
    0
  );
  const collectedPresentCoins = finiteInteger(
    input.coinsCollected,
    0,
    Math.min(
      Math.max(0, Math.round(branch.completionReward.maximumPerformanceCoins * valueMultiplier)),
      destroyedCoinCeiling
    )
  );
  const baseCacheReward = Math.max(1, Math.round(finiteInteger(branch.completionReward.baseCoins) * valueMultiplier));
  const oneTimeCompletionBonus = Math.max(1, Math.round(finiteInteger(branch.completionReward.oneTimeBonusCoins) * valueMultiplier));
  return {
    destroyed,
    destroyedTotal: PRESENT_KINDS.reduce((total, kind) => total + destroyed[kind], 0),
    collectedPresentCoins,
    baseCacheReward,
    oneTimeCompletionBonus,
    totalCoins: baseCacheReward + oneTimeCompletionBonus + collectedPresentCoins
  };
};

/**
 * Verifies the fixed reward envelope used by combat branches. A combat route
 * never trusts score or collected run coins for permanent settlement: success
 * grants only the authored base plus one-time bonus, and failure grants zero.
 */
export const verifyCampaignCombatBranchRuntimeResult = (
  branch: CampaignBranchDefinition,
  input: {
    stageComplete?: unknown;
    objectiveUnitsCompleted?: unknown;
  },
  options: CampaignBranchRuntimeOptions = {}
): CampaignCombatBranchRuntimeResult => {
  if (!isCombatBranchDefinition(branch)) {
    throw new Error(`Campaign branch ${branch.branchId} is not a combat branch`);
  }
  const valueMultiplier = normalizeValueMultiplier(options.valueMultiplier);
  const success = input.stageComplete === true;
  const baseCompletionReward = success
    ? Math.max(0, Math.round(finiteInteger(branch.completionReward.baseCoins) * valueMultiplier))
    : 0;
  const oneTimeCompletionBonus = success
    ? Math.max(0, Math.round(finiteInteger(branch.completionReward.oneTimeBonusCoins) * valueMultiplier))
    : 0;
  // Combat branches intentionally have no client-calculated performance payout.
  const performanceCoins = 0;
  return {
    success,
    objectiveUnitsCompleted: success
      ? finiteInteger(input.objectiveUnitsCompleted, 0, branch.missionDefinition.events.length)
      : 0,
    baseCompletionReward,
    oneTimeCompletionBonus,
    performanceCoins,
    totalCoins: baseCompletionReward + oneTimeCompletionBonus
  };
};

const buildPresentEvents = (
  branch: CampaignPresentDropBranchDefinition,
  options: CampaignBranchRuntimeOptions = {}
): AsteroidEvent[] => {
  const mission = branch.missionDefinition;
  const spawnSeed = finiteInteger(options.spawnSeed, 0, 9_999);
  const valueMultiplier = normalizeValueMultiplier(options.valueMultiplier);
  const presentById = new Map(mission.presentTypes.map((present) => [present.id, present] as const));
  return mission.spawnGroups.flatMap((group) => {
    const present = presentById.get(group.presentTypeId);
    if (!present) return [];
    return Array.from({ length: finiteInteger(group.count, 0, 100) }, (_, index) => {
      const startSeconds = group.startSeconds + index * group.spawnIntervalSeconds;
      return {
        id: `${mission.id}:${group.id}:${index + 1}`,
        kind: 'asteroid-belt' as const,
        label: present.displayName,
        startSeconds,
        durationSeconds: Math.max(0.5, mission.durationSeconds - startSeconds),
        delayAfterSeconds: 0,
        blocksWaveClock: false,
        spawnAnchor: {
          x: spawnXForPattern(group.patternId, index, group.count, spawnSeed),
          y: 0.035
        },
        spriteKey: present.spriteKey,
        spriteStyle: {
          scale: present.sizeMultiplier,
          glowColor: present.kind === 'golden' ? '#fde047' : '#22d3ee',
          glowBlur: present.kind === 'golden' ? 14 : 5
        },
        count: 1,
        density: 0.08,
        patternId: 'asteroid-lanes' as const,
        positionId: 'lane-top' as const,
        spawnIntervalSeconds: group.spawnIntervalSeconds,
        warningSeconds: 0,
        health: present.health,
        speed: 1.5 * present.speedMultiplier,
        damage: 0,
        scoreValue: 0,
        powerupDropChance: 0,
        coinDropValue: Math.max(1, Math.round(present.coinValue * valueMultiplier)),
        bonusTargetKind: present.kind
      } satisfies AsteroidEvent;
    });
  });
};

const cloneAuthoredCombatEvents = (
  mission: CampaignCombatBranchMissionDefinition
): WaveEvent[] => mission.events.map((event) => ({
  ...event,
  ...(event.spawnAnchor ? { spawnAnchor: { ...event.spawnAnchor } } : {}),
  ...(event.kind === 'spawn'
    ? {
        ...(event.formationSlots
          ? { formationSlots: event.formationSlots.map((slot) => ({ ...slot })) }
          : {}),
        enemies: event.enemies.map((enemy) => ({
          ...enemy,
          ...(enemy.spriteStyle ? { spriteStyle: { ...enemy.spriteStyle } } : {})
        }))
      }
    : event.kind === 'powerup' || event.kind === 'recovery'
      ? { powerupIds: [...event.powerupIds] }
      : event.kind === 'asteroid-belt'
        ? (event.spriteStyle ? { spriteStyle: { ...event.spriteStyle } } : {})
        : {})
} as WaveEvent));

/**
 * Adapts a data-authored branch onto the existing GameStage/GameEngine path.
 * No separate canvas, collision system, or reward renderer is introduced.
 */
export const buildCampaignBranchRuntimeCampaign = (
  sourceCampaign: GameCampaignConfig,
  branch: CampaignBranchDefinition,
  options: CampaignBranchRuntimeOptions = {}
): GameCampaignConfig => {
  const mission = branch.missionDefinition;
  const sourceMission = sourceCampaign.levels.find((level) => level.id === branch.sourceMissionId)
    ?? sourceCampaign.levels[0];
  if (!sourceMission) throw new Error('Campaign requires at least one source Mission');
  const isPresentDrop = isPresentDropBranchDefinition(branch);
  const combatMission = isCombatBranchDefinition(branch) ? branch.missionDefinition : null;
  if (!isPresentDrop && !combatMission) {
    throw new Error(`Unsupported Campaign branch mission type: ${String(branch.missionType)}`);
  }
  const waveId = `${mission.id}:${isPresentDrop ? 'drop' : 'encounter'}`;
  const availablePowerupIds = combatMission ? [...combatMission.availablePowerupIds] : [];
  const events = isPresentDrop
    ? buildPresentEvents(branch, options)
    : cloneAuthoredCombatEvents(combatMission!);
  return {
    ...sourceCampaign,
    id: `${sourceCampaign.id}:${branch.branchId}`,
    name: branch.displayName,
    campaignBranches: undefined,
    // Branch runs are deliberately outside the five-Mission main-path sector graph.
    sectors: [],
    levels: [{
      id: mission.id,
      name: branch.displayName,
      description: isPresentDrop
        ? 'Recover as many encrypted ResearchHub supply packages as possible.'
        : 'Clear the optional mastery encounter to secure its one-time Research Coin reward.',
      order: 1,
      backgroundId: mission.backgroundId,
      musicId: mission.musicId,
      startingDifficulty: 1,
      scoreTarget: 0,
      durationSeconds: mission.durationSeconds,
      loopWaves: false,
      availablePowerupIds,
      scorecard: {
        ...sourceMission.scorecard,
        title: isPresentDrop ? 'Cache Recovered' : 'Branch Secured',
        subtitle: isPresentDrop ? 'Optional Mastery Route' : 'Optional Combat Route',
        showEncounterArt: false
      },
      waves: [{
        id: waveId,
        name: isPresentDrop ? 'SUPPLY FIELD' : branch.displayName,
        order: 1,
        accent: '#facc15',
        backgroundId: mission.backgroundId,
        completionRule: 'clear-after-duration',
        difficultyMultiplier: 1,
        durationSeconds: mission.durationSeconds,
        introSeconds: mission.introSeconds,
        delayAfterSeconds: mission.exitSeconds,
        scoreMultiplier: 1,
        combatBudget: combatMission?.combatBudget ?? 1,
        rhythm: combatMission?.rhythm ?? 'peak',
        formationPackIds: [],
        events,
        threatCap: combatMission?.threatCap ?? 64
      }]
    }]
  };
};

export const getCampaignBranchRuntimeWaveId = (branch: CampaignBranchDefinition) => (
  `${branch.missionDefinition.id}:${branch.missionDefinition.kind === 'present-drop' ? 'drop' : 'encounter'}`
);
