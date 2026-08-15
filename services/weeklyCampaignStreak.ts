import type {
  CampaignGraphNodeDefinition,
  CampaignRouteEdgeDefinition,
  CampaignRouteRisk
} from '../game-config/types';
import type { CampaignGraphIndex } from './campaignGraph';

export const WEEKLY_CAMPAIGN_STREAK_SCHEMA_VERSION = 1 as const;

export const WEEKLY_CAMPAIGN_SCORE_RULES = Object.freeze({
  regularEnemy: 12,
  eliteEnemy: 45,
  waveClear: 150,
  missionClear: 650,
  miniBoss: 500,
  majorBoss: 1_600,
  noDamage: 300,
  accuracy90: 200,
  accuracy75: 100,
  parTime: 150,
  nearParTime: 75,
  threeStarQuality: 400,
  remainingLife: 20,
  maximumRemainingLives: 10,
  consecutiveStep: 0.015,
  maximumConsecutiveBonus: 0.15,
  routeRiskMultiplier: Object.freeze({
    low: 1,
    moderate: 1.05,
    high: 1.1
  } satisfies Readonly<Record<CampaignRouteRisk, number>>),
  minimumAuthoredMultiplier: 1,
  maximumCombinedRouteMultiplier: 1.5
});

export interface WeeklyCampaignBinding {
  weeklyId: string;
  resetAtMs: number;
}

export interface WeeklyCampaignStreakRouteCommitment {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  routeId: string;
  risk: CampaignRouteRisk;
  committedAtMs: number;
}

export interface WeeklyCampaignNodeOutcome {
  regularEnemyKills: number;
  eliteKills: number;
  wavesCleared: number;
  miniBossKills: number;
  majorBossKills: number;
  missionCompleted: boolean;
  damageTaken: number;
  livesRemaining: number;
  accuracy: number | null;
  elapsedMs: number | null;
  parTimeMs: number | null;
  /** Repeatable Weekly quality, deliberately separate from permanent Campaign stars. */
  performanceStars: 0 | 1 | 2 | 3;
}

export interface WeeklyCampaignNodeScoreBreakdown {
  enemyPoints: number;
  elitePoints: number;
  wavePoints: number;
  missionPoints: number;
  miniBossPoints: number;
  majorBossPoints: number;
  noDamagePoints: number;
  accuracyPoints: number;
  timePoints: number;
  threeStarQualityPoints: number;
  remainingLifePoints: number;
  basePoints: number;
  routeMultiplier: number;
  routeBonusPoints: number;
  consecutiveMultiplier: number;
  consecutiveBonusPoints: number;
  totalPoints: number;
}

export interface WeeklyCampaignStreakScoreEvent {
  eventId: string;
  nodeId: string;
  occurredAtMs: number;
  outcome: WeeklyCampaignNodeOutcome;
  breakdown: WeeklyCampaignNodeScoreBreakdown;
}

export interface WeeklyCampaignStreakScoreState {
  totalPoints: number;
  enemyPoints: number;
  elitePoints: number;
  wavePoints: number;
  missionPoints: number;
  miniBossPoints: number;
  majorBossPoints: number;
  performancePoints: number;
  remainingLifePoints: number;
  routeBonusPoints: number;
  consecutiveBonusPoints: number;
  completedNodeCount: number;
  eventCount: number;
}

export type WeeklyCampaignStreakFinalizationReason =
  | 'loss'
  | 'deliberate-end'
  | 'backward-selection'
  | 'repeat-selection'
  | 'disconnected-selection'
  | 'forward-route-violation'
  | 'terminal-complete'
  | 'weekly-reset'
  | 'merge-conflict'
  | 'migrated-finalized';

export type WeeklyCampaignSubmissionStatus =
  | 'not-ready'
  | 'ready'
  | 'pending'
  | 'submitted'
  | 'failed';

export interface WeeklyCampaignStreakFinalizationState {
  status: 'active' | 'finalized';
  reason: WeeklyCampaignStreakFinalizationReason | null;
  finalizedAtMs: number | null;
  triggerNodeId: string | null;
  submissionStatus: WeeklyCampaignSubmissionStatus;
  submissionId: string | null;
  submittedAtMs: number | null;
}

export interface WeeklyCampaignStreakState {
  schemaVersion: typeof WEEKLY_CAMPAIGN_STREAK_SCHEMA_VERSION;
  revision: number;
  weeklyId: string;
  resetAtMs: number;
  startNodeId: string;
  currentNodeId: string;
  committedRoutes: WeeklyCampaignStreakRouteCommitment[];
  visitedNodeIds: string[];
  scoredNodeIds: string[];
  scoreEvents: WeeklyCampaignStreakScoreEvent[];
  score: WeeklyCampaignStreakScoreState;
  finalization: WeeklyCampaignStreakFinalizationState;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface StartWeeklyCampaignStreakInput extends WeeklyCampaignBinding {
  startNodeId: string;
  unlockedNodeIds: Iterable<string>;
  nowMs: number;
}

export interface RecordWeeklyCampaignNodeScoreInput {
  eventId: string;
  nodeId: string;
  occurredAtMs: number;
  outcome: WeeklyCampaignNodeOutcome;
}

export type WeeklyCampaignInvalidSelectionKind = 'backward' | 'repeat' | 'disconnected';

export interface WeeklyCampaignSelectionConfirmation {
  confirmationId: string;
  stateRevision: number;
  fromNodeId: string;
  targetNodeId: string;
  selectionKind: WeeklyCampaignInvalidSelectionKind;
  finalizationReason: Extract<
    WeeklyCampaignStreakFinalizationReason,
    'backward-selection' | 'repeat-selection' | 'disconnected-selection'
  >;
  message: string;
}

export type WeeklyCampaignAdvanceResult =
  | {
    kind: 'advanced';
    state: WeeklyCampaignStreakState;
    edge: CampaignRouteEdgeDefinition;
  }
  | {
    kind: 'confirmation-required';
    state: WeeklyCampaignStreakState;
    confirmation: WeeklyCampaignSelectionConfirmation;
  }
  | {
    kind: 'blocked';
    state: WeeklyCampaignStreakState;
    reason:
      | 'streak-finalized'
      | 'weekly-reset'
      | 'current-node-not-scored'
      | 'target-not-weekly-eligible'
      | 'prerequisites-not-met';
  };

export interface WeeklyCampaignRouteSimulationInput {
  binding: WeeklyCampaignBinding;
  pathNodeIds: readonly string[];
  outcomesByNodeId: Readonly<Record<string, WeeklyCampaignNodeOutcome>>;
  startedAtMs?: number;
}

const EMPTY_SCORE = (): WeeklyCampaignStreakScoreState => ({
  totalPoints: 0,
  enemyPoints: 0,
  elitePoints: 0,
  wavePoints: 0,
  missionPoints: 0,
  miniBossPoints: 0,
  majorBossPoints: 0,
  performancePoints: 0,
  remainingLifePoints: 0,
  routeBonusPoints: 0,
  consecutiveBonusPoints: 0,
  completedNodeCount: 0,
  eventCount: 0
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const finiteNumber = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

const boundedInteger = (value: unknown, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, Math.floor(finiteNumber(value))))
);

const boundedNumber = (value: unknown, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, finiteNumber(value)))
);

const positiveTimestamp = (value: unknown, fallback: number): number => {
  const candidate = finiteNumber(value, fallback);
  return candidate >= 0 ? Math.floor(candidate) : fallback;
};

const normalizeOptionalDuration = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const candidate = finiteNumber(value, -1);
  return candidate > 0 ? Math.floor(candidate) : null;
};

const cloneOutcome = (outcome: WeeklyCampaignNodeOutcome): WeeklyCampaignNodeOutcome => ({
  ...outcome
});

const cloneBreakdown = (
  breakdown: WeeklyCampaignNodeScoreBreakdown
): WeeklyCampaignNodeScoreBreakdown => ({ ...breakdown });

const cloneState = (state: WeeklyCampaignStreakState): WeeklyCampaignStreakState => ({
  ...state,
  committedRoutes: state.committedRoutes.map((route) => ({ ...route })),
  visitedNodeIds: [...state.visitedNodeIds],
  scoredNodeIds: [...state.scoredNodeIds],
  scoreEvents: state.scoreEvents.map((event) => ({
    ...event,
    outcome: cloneOutcome(event.outcome),
    breakdown: cloneBreakdown(event.breakdown)
  })),
  score: { ...state.score },
  finalization: { ...state.finalization }
});

const assertWeeklyBinding = (binding: WeeklyCampaignBinding): void => {
  if (!binding.weeklyId.trim()) throw new Error('Weekly Campaign binding requires a weekly ID.');
  if (!Number.isFinite(binding.resetAtMs) || binding.resetAtMs <= 0) {
    throw new Error('Weekly Campaign binding requires a positive reset timestamp.');
  }
};

const getNode = (
  graph: CampaignGraphIndex,
  nodeId: string
): CampaignGraphNodeDefinition | null => graph.nodeById.get(nodeId) ?? null;

const getDirectEdge = (
  graph: CampaignGraphIndex,
  fromNodeId: string,
  toNodeId: string
): CampaignRouteEdgeDefinition | null => (
  graph.edgesBySourceNodeId.get(fromNodeId)?.find((edge) => edge.toNodeId === toNodeId) ?? null
);

const isReachable = (
  graph: CampaignGraphIndex,
  sourceNodeId: string,
  targetNodeId: string
): boolean => {
  if (sourceNodeId === targetNodeId) return graph.nodeById.has(sourceNodeId);
  if (!graph.nodeById.has(sourceNodeId) || !graph.nodeById.has(targetNodeId)) return false;
  const visited = new Set<string>();
  const queue = [sourceNodeId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edgesBySourceNodeId.get(current) ?? []) {
      if (edge.toNodeId === targetNodeId) return true;
      if (!visited.has(edge.toNodeId)) queue.push(edge.toNodeId);
    }
  }
  return false;
};

const arePrerequisitesMet = (
  node: CampaignGraphNodeDefinition,
  visitedNodeIds: readonly string[]
): boolean => {
  if (node.prerequisiteNodeIds.length === 0) return true;
  const visited = new Set(visitedNodeIds);
  return node.prerequisiteMode === 'any'
    ? node.prerequisiteNodeIds.some((nodeId) => visited.has(nodeId))
    : node.prerequisiteNodeIds.every((nodeId) => visited.has(nodeId));
};

const normalizeOutcome = (value: unknown): WeeklyCampaignNodeOutcome | null => {
  if (!isRecord(value)) return null;
  return {
    regularEnemyKills: boundedInteger(value.regularEnemyKills, 0, 100_000),
    eliteKills: boundedInteger(value.eliteKills, 0, 10_000),
    wavesCleared: boundedInteger(value.wavesCleared, 0, 100),
    miniBossKills: boundedInteger(value.miniBossKills, 0, 100),
    majorBossKills: boundedInteger(value.majorBossKills, 0, 10),
    missionCompleted: value.missionCompleted === true,
    damageTaken: boundedInteger(value.damageTaken, 0, 1_000_000),
    livesRemaining: boundedInteger(
      value.livesRemaining,
      0,
      WEEKLY_CAMPAIGN_SCORE_RULES.maximumRemainingLives
    ),
    accuracy: value.accuracy === null || value.accuracy === undefined
      ? null
      : boundedNumber(value.accuracy, 0, 1),
    elapsedMs: normalizeOptionalDuration(value.elapsedMs),
    parTimeMs: normalizeOptionalDuration(value.parTimeMs),
    performanceStars: boundedInteger(value.performanceStars, 0, 3) as 0 | 1 | 2 | 3
  };
};

const getIncomingCommitment = (
  committedRoutes: readonly WeeklyCampaignStreakRouteCommitment[],
  nodeId: string
): WeeklyCampaignStreakRouteCommitment | null => (
  committedRoutes.find((commitment) => commitment.toNodeId === nodeId) ?? null
);

const getRouteMultiplier = (
  node: CampaignGraphNodeDefinition,
  edge: CampaignRouteEdgeDefinition | null
): number => {
  const riskMultiplier = edge
    ? WEEKLY_CAMPAIGN_SCORE_RULES.routeRiskMultiplier[edge.risk]
    : 1;
  const authoredEdgeMultiplier = Math.max(
    WEEKLY_CAMPAIGN_SCORE_RULES.minimumAuthoredMultiplier,
    finiteNumber(edge?.weeklyScoreMultiplier, 1)
  );
  const authoredNodeMultiplier = Math.max(
    WEEKLY_CAMPAIGN_SCORE_RULES.minimumAuthoredMultiplier,
    finiteNumber(node.weeklyScoreMultiplier, 1)
  );
  return Math.min(
    WEEKLY_CAMPAIGN_SCORE_RULES.maximumCombinedRouteMultiplier,
    riskMultiplier * authoredEdgeMultiplier * authoredNodeMultiplier
  );
};

export const calculateWeeklyCampaignNodeScore = (
  node: CampaignGraphNodeDefinition,
  edge: CampaignRouteEdgeDefinition | null,
  outcomeInput: WeeklyCampaignNodeOutcome,
  previouslyCompletedNodeCount: number
): WeeklyCampaignNodeScoreBreakdown => {
  const outcome = normalizeOutcome(outcomeInput);
  if (!outcome || !outcome.missionCompleted) {
    throw new Error('Weekly Campaign node score requires a completed Mission outcome.');
  }

  const enemyPoints = outcome.regularEnemyKills * WEEKLY_CAMPAIGN_SCORE_RULES.regularEnemy;
  const elitePoints = outcome.eliteKills * WEEKLY_CAMPAIGN_SCORE_RULES.eliteEnemy;
  const wavePoints = outcome.wavesCleared * WEEKLY_CAMPAIGN_SCORE_RULES.waveClear;
  const missionPoints = WEEKLY_CAMPAIGN_SCORE_RULES.missionClear;
  const miniBossPoints = outcome.miniBossKills * WEEKLY_CAMPAIGN_SCORE_RULES.miniBoss;
  const majorBossPoints = outcome.majorBossKills * WEEKLY_CAMPAIGN_SCORE_RULES.majorBoss;
  const noDamagePoints = outcome.damageTaken === 0 ? WEEKLY_CAMPAIGN_SCORE_RULES.noDamage : 0;
  const accuracyPoints = outcome.accuracy !== null && outcome.accuracy >= 0.9
    ? WEEKLY_CAMPAIGN_SCORE_RULES.accuracy90
    : outcome.accuracy !== null && outcome.accuracy >= 0.75
      ? WEEKLY_CAMPAIGN_SCORE_RULES.accuracy75
      : 0;
  const timePoints = outcome.elapsedMs !== null && outcome.parTimeMs !== null
    ? outcome.elapsedMs <= outcome.parTimeMs
      ? WEEKLY_CAMPAIGN_SCORE_RULES.parTime
      : outcome.elapsedMs <= outcome.parTimeMs * 1.2
        ? WEEKLY_CAMPAIGN_SCORE_RULES.nearParTime
        : 0
    : 0;
  const threeStarQualityPoints = outcome.performanceStars === 3
    ? WEEKLY_CAMPAIGN_SCORE_RULES.threeStarQuality
    : 0;
  const remainingLifePoints = outcome.livesRemaining * WEEKLY_CAMPAIGN_SCORE_RULES.remainingLife;
  const basePoints = enemyPoints
    + elitePoints
    + wavePoints
    + missionPoints
    + miniBossPoints
    + majorBossPoints
    + noDamagePoints
    + accuracyPoints
    + timePoints
    + threeStarQualityPoints
    + remainingLifePoints;
  const routeMultiplier = getRouteMultiplier(node, edge);
  const afterRoute = Math.round(basePoints * routeMultiplier);
  const routeBonusPoints = afterRoute - basePoints;
  const consecutiveMultiplier = 1 + Math.min(
    Math.max(0, Math.floor(previouslyCompletedNodeCount))
      * WEEKLY_CAMPAIGN_SCORE_RULES.consecutiveStep,
    WEEKLY_CAMPAIGN_SCORE_RULES.maximumConsecutiveBonus
  );
  const totalPoints = Math.round(afterRoute * consecutiveMultiplier);

  return {
    enemyPoints,
    elitePoints,
    wavePoints,
    missionPoints,
    miniBossPoints,
    majorBossPoints,
    noDamagePoints,
    accuracyPoints,
    timePoints,
    threeStarQualityPoints,
    remainingLifePoints,
    basePoints,
    routeMultiplier,
    routeBonusPoints,
    consecutiveMultiplier,
    consecutiveBonusPoints: totalPoints - afterRoute,
    totalPoints
  };
};

const aggregateScoreEvents = (
  scoreEvents: readonly WeeklyCampaignStreakScoreEvent[]
): WeeklyCampaignStreakScoreState => scoreEvents.reduce<WeeklyCampaignStreakScoreState>(
  (total, event) => {
    const { breakdown } = event;
    total.totalPoints += breakdown.totalPoints;
    total.enemyPoints += breakdown.enemyPoints;
    total.elitePoints += breakdown.elitePoints;
    total.wavePoints += breakdown.wavePoints;
    total.missionPoints += breakdown.missionPoints;
    total.miniBossPoints += breakdown.miniBossPoints;
    total.majorBossPoints += breakdown.majorBossPoints;
    total.performancePoints += breakdown.noDamagePoints
      + breakdown.accuracyPoints
      + breakdown.timePoints
      + breakdown.threeStarQualityPoints;
    total.remainingLifePoints += breakdown.remainingLifePoints;
    total.routeBonusPoints += breakdown.routeBonusPoints;
    total.consecutiveBonusPoints += breakdown.consecutiveBonusPoints;
    total.completedNodeCount += 1;
    total.eventCount += 1;
    return total;
  },
  EMPTY_SCORE()
);

export const getEligibleWeeklyCampaignStartNodeIds = (
  graph: CampaignGraphIndex,
  unlockedNodeIds: Iterable<string>
): readonly string[] => {
  const unlocked = new Set(unlockedNodeIds);
  return graph.definition.nodes
    .filter((node) => node.weeklyStreakEligible && unlocked.has(node.nodeId))
    .sort((left, right) => left.depth - right.depth || left.nodeId.localeCompare(right.nodeId))
    .map((node) => node.nodeId);
};

export const startWeeklyCampaignStreak = (
  graph: CampaignGraphIndex,
  input: StartWeeklyCampaignStreakInput
): WeeklyCampaignStreakState => {
  assertWeeklyBinding(input);
  if (input.nowMs >= input.resetAtMs) {
    throw new Error('Cannot start a Weekly Campaign Streak after its reset boundary.');
  }
  const startNode = getNode(graph, input.startNodeId);
  if (!startNode) throw new Error(`Unknown Weekly Campaign start node: ${input.startNodeId}`);
  if (!startNode.weeklyStreakEligible) {
    throw new Error(`Campaign node is not Weekly Streak eligible: ${input.startNodeId}`);
  }
  if (!new Set(input.unlockedNodeIds).has(input.startNodeId)) {
    throw new Error(`Campaign node is not unlocked for Weekly Streak: ${input.startNodeId}`);
  }

  return {
    schemaVersion: WEEKLY_CAMPAIGN_STREAK_SCHEMA_VERSION,
    revision: 1,
    weeklyId: input.weeklyId,
    resetAtMs: Math.floor(input.resetAtMs),
    startNodeId: input.startNodeId,
    currentNodeId: input.startNodeId,
    committedRoutes: [],
    visitedNodeIds: [input.startNodeId],
    scoredNodeIds: [],
    scoreEvents: [],
    score: EMPTY_SCORE(),
    finalization: {
      status: 'active',
      reason: null,
      finalizedAtMs: null,
      triggerNodeId: null,
      submissionStatus: 'not-ready',
      submissionId: null,
      submittedAtMs: null
    },
    createdAtMs: Math.floor(input.nowMs),
    updatedAtMs: Math.floor(input.nowMs)
  };
};

const assertActiveAndCurrentWeek = (
  state: WeeklyCampaignStreakState,
  nowMs: number
): void => {
  if (state.finalization.status !== 'active') {
    throw new Error('Weekly Campaign Streak is already finalized.');
  }
  if (nowMs >= state.resetAtMs) {
    throw new Error('Weekly Campaign Streak has crossed its reset boundary.');
  }
};

export const recordWeeklyCampaignNodeScore = (
  stateInput: WeeklyCampaignStreakState,
  graph: CampaignGraphIndex,
  input: RecordWeeklyCampaignNodeScoreInput
): WeeklyCampaignStreakState => {
  assertActiveAndCurrentWeek(stateInput, input.occurredAtMs);
  if (!input.eventId.trim()) throw new Error('Weekly Campaign score event requires an ID.');
  if (stateInput.scoreEvents.some((event) => event.eventId === input.eventId)) {
    throw new Error(`Weekly Campaign score event already exists: ${input.eventId}`);
  }
  if (input.nodeId !== stateInput.currentNodeId) {
    throw new Error('Weekly Campaign score can only be recorded for the current node.');
  }
  if (stateInput.scoredNodeIds.includes(input.nodeId)) {
    throw new Error(`Weekly Campaign node has already scored this streak: ${input.nodeId}`);
  }
  const node = getNode(graph, input.nodeId);
  if (!node || !node.weeklyStreakEligible) {
    throw new Error(`Campaign node is not Weekly Streak eligible: ${input.nodeId}`);
  }
  const outcome = normalizeOutcome(input.outcome);
  if (!outcome || !outcome.missionCompleted) {
    throw new Error('Weekly Campaign node score requires a completed Mission outcome.');
  }
  const incoming = getIncomingCommitment(stateInput.committedRoutes, input.nodeId);
  const edge = incoming ? graph.edgeById.get(incoming.edgeId) ?? null : null;
  const breakdown = calculateWeeklyCampaignNodeScore(
    node,
    edge,
    outcome,
    stateInput.score.completedNodeCount
  );
  const scoreEvent: WeeklyCampaignStreakScoreEvent = {
    eventId: input.eventId,
    nodeId: input.nodeId,
    occurredAtMs: Math.floor(input.occurredAtMs),
    outcome,
    breakdown
  };
  const state = cloneState(stateInput);
  state.revision += 1;
  state.updatedAtMs = Math.floor(input.occurredAtMs);
  state.scoredNodeIds.push(input.nodeId);
  state.scoreEvents.push(scoreEvent);
  state.score = aggregateScoreEvents(state.scoreEvents);
  return state;
};

const classifyInvalidSelection = (
  state: WeeklyCampaignStreakState,
  graph: CampaignGraphIndex,
  targetNodeId: string
): WeeklyCampaignInvalidSelectionKind => {
  if (targetNodeId === state.currentNodeId) return 'repeat';
  if (state.visitedNodeIds.includes(targetNodeId)) return 'backward';
  if (isReachable(graph, targetNodeId, state.currentNodeId)) return 'backward';
  return 'disconnected';
};

const createSelectionConfirmation = (
  state: WeeklyCampaignStreakState,
  targetNodeId: string,
  selectionKind: WeeklyCampaignInvalidSelectionKind
): WeeklyCampaignSelectionConfirmation => {
  const finalizationReason = selectionKind === 'backward'
    ? 'backward-selection'
    : selectionKind === 'repeat'
      ? 'repeat-selection'
      : 'disconnected-selection';
  const message = selectionKind === 'backward'
    ? 'Selecting this earlier Mission will end your current Weekly Streak and submit the score.'
    : selectionKind === 'repeat'
      ? 'Replaying this Mission will end your current Weekly Streak and submit the score.'
      : 'Jumping to a disconnected Mission will end your current Weekly Streak and submit the score.';
  return {
    confirmationId: [
      state.weeklyId,
      state.revision,
      state.currentNodeId,
      targetNodeId,
      selectionKind
    ].join(':'),
    stateRevision: state.revision,
    fromNodeId: state.currentNodeId,
    targetNodeId,
    selectionKind,
    finalizationReason,
    message
  };
};

export const requestWeeklyCampaignAdvance = (
  stateInput: WeeklyCampaignStreakState,
  graph: CampaignGraphIndex,
  targetNodeId: string,
  nowMs: number
): WeeklyCampaignAdvanceResult => {
  if (stateInput.finalization.status !== 'active') {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'streak-finalized' };
  }
  if (nowMs >= stateInput.resetAtMs) {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'weekly-reset' };
  }
  if (!stateInput.scoredNodeIds.includes(stateInput.currentNodeId)) {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'current-node-not-scored' };
  }

  const edge = getDirectEdge(graph, stateInput.currentNodeId, targetNodeId);
  if (!edge || stateInput.visitedNodeIds.includes(targetNodeId)) {
    const selectionKind = classifyInvalidSelection(stateInput, graph, targetNodeId);
    return {
      kind: 'confirmation-required',
      state: cloneState(stateInput),
      confirmation: createSelectionConfirmation(stateInput, targetNodeId, selectionKind)
    };
  }

  const targetNode = getNode(graph, targetNodeId);
  if (!targetNode?.weeklyStreakEligible) {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'target-not-weekly-eligible' };
  }
  if (!arePrerequisitesMet(targetNode, stateInput.visitedNodeIds)) {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'prerequisites-not-met' };
  }

  // A stage-clear score and the automatic route advance happen synchronously.
  // Date.now() can therefore return the same millisecond for both transitions,
  // but a canonical server proof requires the commitment to follow the score.
  const committedAtMs = Math.max(
    Math.floor(nowMs),
    Math.floor(stateInput.updatedAtMs) + 1
  );
  if (committedAtMs >= stateInput.resetAtMs) {
    return { kind: 'blocked', state: cloneState(stateInput), reason: 'weekly-reset' };
  }

  const state = cloneState(stateInput);
  state.revision += 1;
  state.updatedAtMs = committedAtMs;
  state.committedRoutes.push({
    edgeId: edge.edgeId,
    fromNodeId: stateInput.currentNodeId,
    toNodeId: targetNodeId,
    routeId: edge.routeId,
    risk: edge.risk,
    committedAtMs
  });
  state.visitedNodeIds.push(targetNodeId);
  state.currentNodeId = targetNodeId;
  return { kind: 'advanced', state, edge };
};

export const finalizeWeeklyCampaignStreak = (
  stateInput: WeeklyCampaignStreakState,
  reason: WeeklyCampaignStreakFinalizationReason,
  nowMs: number,
  triggerNodeId: string | null = null
): WeeklyCampaignStreakState => {
  if (stateInput.finalization.status === 'finalized') return cloneState(stateInput);
  const state = cloneState(stateInput);
  state.revision += 1;
  state.updatedAtMs = Math.floor(nowMs);
  state.finalization = {
    status: 'finalized',
    reason,
    finalizedAtMs: Math.floor(nowMs),
    triggerNodeId,
    submissionStatus: 'ready',
    submissionId: null,
    submittedAtMs: null
  };
  return state;
};

export const markWeeklyCampaignStreakSubmission = (
  stateInput: WeeklyCampaignStreakState,
  status: Extract<WeeklyCampaignSubmissionStatus, 'pending' | 'submitted' | 'failed'>,
  nowMs: number,
  submissionId: string | null = null
): WeeklyCampaignStreakState => {
  if (stateInput.finalization.status !== 'finalized') {
    throw new Error('Weekly Campaign Streak must be finalized before submission.');
  }
  const state = cloneState(stateInput);
  state.revision += 1;
  state.updatedAtMs = Math.floor(nowMs);
  state.finalization = {
    ...state.finalization,
    submissionStatus: status,
    submissionId: submissionId?.trim() || null,
    submittedAtMs: status === 'submitted' ? Math.floor(nowMs) : null
  };
  return state;
};

export const confirmWeeklyCampaignSelectionFinalization = (
  state: WeeklyCampaignStreakState,
  confirmation: WeeklyCampaignSelectionConfirmation,
  nowMs: number
): WeeklyCampaignStreakState => {
  if (
    state.finalization.status !== 'active'
    || confirmation.stateRevision !== state.revision
    || confirmation.fromNodeId !== state.currentNodeId
    || confirmation.confirmationId !== createSelectionConfirmation(
      state,
      confirmation.targetNodeId,
      confirmation.selectionKind
    ).confirmationId
  ) {
    throw new Error('Weekly Campaign selection confirmation is stale or invalid.');
  }
  return finalizeWeeklyCampaignStreak(
    state,
    confirmation.finalizationReason,
    nowMs,
    confirmation.targetNodeId
  );
};

export const finalizeWeeklyCampaignLoss = (
  state: WeeklyCampaignStreakState,
  nowMs: number
): WeeklyCampaignStreakState => finalizeWeeklyCampaignStreak(state, 'loss', nowMs);

export const finalizeWeeklyCampaignDeliberateEnd = (
  state: WeeklyCampaignStreakState,
  nowMs: number
): WeeklyCampaignStreakState => finalizeWeeklyCampaignStreak(state, 'deliberate-end', nowMs);

export const finalizeCompletedWeeklyCampaignStreak = (
  state: WeeklyCampaignStreakState,
  graph: CampaignGraphIndex,
  nowMs: number
): WeeklyCampaignStreakState => {
  if (!state.scoredNodeIds.includes(state.currentNodeId)) {
    throw new Error('The current Weekly Campaign node must score before terminal completion.');
  }
  if ((graph.edgesBySourceNodeId.get(state.currentNodeId) ?? []).length > 0) {
    throw new Error('Weekly Campaign Streak cannot complete while forward routes remain.');
  }
  return finalizeWeeklyCampaignStreak(state, 'terminal-complete', nowMs);
};

const FINALIZATION_REASONS = new Set<WeeklyCampaignStreakFinalizationReason>([
  'loss',
  'deliberate-end',
  'backward-selection',
  'repeat-selection',
  'disconnected-selection',
  'forward-route-violation',
  'terminal-complete',
  'weekly-reset',
  'merge-conflict',
  'migrated-finalized'
]);

const getRawArray = (record: Record<string, unknown>, ...keys: string[]): unknown[] => {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
};

const getRawString = (record: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key];
  }
  return '';
};

const rebuildCommittedRoute = (
  graph: CampaignGraphIndex,
  startNodeId: string,
  rawCommitments: readonly unknown[],
  fallbackTimestamp: number
): WeeklyCampaignStreakRouteCommitment[] | null => {
  const commitments: WeeklyCampaignStreakRouteCommitment[] = [];
  const visited = new Set<string>([startNodeId]);
  let currentNodeId = startNodeId;
  for (const rawCommitment of rawCommitments) {
    const record = isRecord(rawCommitment) ? rawCommitment : null;
    const edgeId = typeof rawCommitment === 'string'
      ? rawCommitment
      : record ? getRawString(record, 'edgeId') : '';
    const edge = graph.edgeById.get(edgeId);
    if (!edge || !getDirectEdge(graph, currentNodeId, edge.toNodeId)) return null;
    if (visited.has(edge.toNodeId)) return null;
    const targetNode = getNode(graph, edge.toNodeId);
    if (!targetNode?.weeklyStreakEligible) return null;
    commitments.push({
      edgeId: edge.edgeId,
      fromNodeId: currentNodeId,
      toNodeId: edge.toNodeId,
      routeId: edge.routeId,
      risk: edge.risk,
      committedAtMs: positiveTimestamp(record?.committedAtMs, fallbackTimestamp)
    });
    visited.add(edge.toNodeId);
    currentNodeId = edge.toNodeId;
  }
  return commitments;
};

const sanitizeEvents = (
  rawEvents: readonly unknown[],
  graph: CampaignGraphIndex,
  visitedNodeIds: readonly string[],
  commitments: readonly WeeklyCampaignStreakRouteCommitment[]
): WeeklyCampaignStreakScoreEvent[] => {
  const byNodeId = new Map<string, Record<string, unknown>>();
  const seenEventIds = new Set<string>();
  rawEvents.forEach((rawEvent) => {
    if (!isRecord(rawEvent)) return;
    const eventId = getRawString(rawEvent, 'eventId', 'id');
    const nodeId = getRawString(rawEvent, 'nodeId', 'missionNodeId');
    if (!eventId || !nodeId || seenEventIds.has(eventId) || byNodeId.has(nodeId)) return;
    seenEventIds.add(eventId);
    byNodeId.set(nodeId, rawEvent);
  });

  const events: WeeklyCampaignStreakScoreEvent[] = [];
  for (const nodeId of visitedNodeIds) {
    const rawEvent = byNodeId.get(nodeId);
    if (!rawEvent) break;
    const node = getNode(graph, nodeId);
    const outcome = normalizeOutcome(rawEvent.outcome);
    if (!node || !outcome?.missionCompleted) break;
    const incoming = getIncomingCommitment(commitments, nodeId);
    const edge = incoming ? graph.edgeById.get(incoming.edgeId) ?? null : null;
    events.push({
      eventId: getRawString(rawEvent, 'eventId', 'id'),
      nodeId,
      occurredAtMs: positiveTimestamp(rawEvent.occurredAtMs, 0),
      outcome,
      breakdown: calculateWeeklyCampaignNodeScore(node, edge, outcome, events.length)
    });
  }
  return events;
};

const readFinalization = (
  record: Record<string, unknown>,
  nowMs: number
): WeeklyCampaignStreakFinalizationState => {
  const raw = isRecord(record.finalization) ? record.finalization : {};
  const legacyFinalized = record.finalized === true;
  const finalized = raw.status === 'finalized' || legacyFinalized;
  const rawReason = getRawString(raw, 'reason');
  const reason = FINALIZATION_REASONS.has(rawReason as WeeklyCampaignStreakFinalizationReason)
    ? rawReason as WeeklyCampaignStreakFinalizationReason
    : finalized ? 'migrated-finalized' : null;
  const submissionStatus = getRawString(raw, 'submissionStatus');
  const safeSubmissionStatus: WeeklyCampaignSubmissionStatus = [
    'not-ready', 'ready', 'pending', 'submitted', 'failed'
  ].includes(submissionStatus)
    ? submissionStatus as WeeklyCampaignSubmissionStatus
    : finalized ? 'ready' : 'not-ready';
  if (!finalized) {
    return {
      status: 'active',
      reason: null,
      finalizedAtMs: null,
      triggerNodeId: null,
      submissionStatus: 'not-ready',
      submissionId: null,
      submittedAtMs: null
    };
  }
  return {
    status: 'finalized',
    reason,
    finalizedAtMs: positiveTimestamp(raw.finalizedAtMs, nowMs),
    triggerNodeId: typeof raw.triggerNodeId === 'string' ? raw.triggerNodeId : null,
    submissionStatus: safeSubmissionStatus,
    submissionId: typeof raw.submissionId === 'string' ? raw.submissionId : null,
    submittedAtMs: safeSubmissionStatus === 'submitted'
      ? positiveTimestamp(raw.submittedAtMs, nowMs)
      : null
  };
};

/**
 * Accepts current or legacy persisted data, validates the route against the
 * current authored graph, removes duplicate score events, and recomputes all
 * point totals. A mismatched week or an invalid route is rejected instead of
 * being silently attached to the new weekly competition.
 */
export const sanitizeWeeklyCampaignStreak = (
  value: unknown,
  graph: CampaignGraphIndex,
  binding: WeeklyCampaignBinding,
  nowMs: number
): WeeklyCampaignStreakState | null => {
  assertWeeklyBinding(binding);
  if (!isRecord(value)) return null;
  const weeklyId = getRawString(value, 'weeklyId', 'weekId');
  const resetAtMs = finiteNumber(value.resetAtMs ?? value.weeklyResetAtMs, 0);
  if (weeklyId !== binding.weeklyId || Math.floor(resetAtMs) !== Math.floor(binding.resetAtMs)) {
    return null;
  }
  const startNodeId = getRawString(value, 'startNodeId', 'startingNodeId', 'startMissionId');
  const startNode = getNode(graph, startNodeId);
  if (!startNode?.weeklyStreakEligible) return null;
  const createdAtMs = positiveTimestamp(value.createdAtMs ?? value.startedAtMs, nowMs);
  const updatedAtMs = positiveTimestamp(value.updatedAtMs, createdAtMs);
  const commitments = rebuildCommittedRoute(
    graph,
    startNodeId,
    getRawArray(value, 'committedRoutes', 'chosenRoutes', 'routeCommitments'),
    updatedAtMs
  );
  if (!commitments) return null;
  const visitedNodeIds = [startNodeId, ...commitments.map((route) => route.toNodeId)];
  const derivedCurrentNodeId = visitedNodeIds[visitedNodeIds.length - 1];
  const rawCurrentNodeId = getRawString(value, 'currentNodeId', 'currentMissionId');
  if (rawCurrentNodeId && rawCurrentNodeId !== derivedCurrentNodeId) return null;
  const scoreEvents = sanitizeEvents(
    getRawArray(value, 'scoreEvents', 'events'),
    graph,
    visitedNodeIds,
    commitments
  );
  const finalization = readFinalization(value, nowMs);
  const state: WeeklyCampaignStreakState = {
    schemaVersion: WEEKLY_CAMPAIGN_STREAK_SCHEMA_VERSION,
    revision: Math.max(1, boundedInteger(value.revision, 1, Number.MAX_SAFE_INTEGER)),
    weeklyId,
    resetAtMs: Math.floor(resetAtMs),
    startNodeId,
    currentNodeId: derivedCurrentNodeId,
    committedRoutes: commitments,
    visitedNodeIds,
    scoredNodeIds: scoreEvents.map((event) => event.nodeId),
    scoreEvents,
    score: aggregateScoreEvents(scoreEvents),
    finalization,
    createdAtMs,
    updatedAtMs
  };
  return nowMs >= state.resetAtMs && state.finalization.status === 'active'
    ? finalizeWeeklyCampaignStreak(state, 'weekly-reset', nowMs)
    : state;
};

export const migrateWeeklyCampaignStreak = sanitizeWeeklyCampaignStreak;

const statePath = (state: WeeklyCampaignStreakState): readonly string[] => state.visitedNodeIds;

const isPathPrefix = (prefix: readonly string[], value: readonly string[]): boolean => (
  prefix.length <= value.length && prefix.every((nodeId, index) => value[index] === nodeId)
);

const compareStatePreference = (
  left: WeeklyCampaignStreakState,
  right: WeeklyCampaignStreakState
): WeeklyCampaignStreakState => {
  if (left.updatedAtMs !== right.updatedAtMs) return left.updatedAtMs > right.updatedAtMs ? left : right;
  if (left.score.totalPoints !== right.score.totalPoints) {
    return left.score.totalPoints < right.score.totalPoints ? left : right;
  }
  return JSON.stringify(left.scoreEvents) <= JSON.stringify(right.scoreEvents) ? left : right;
};

const trimStateToPath = (
  source: WeeklyCampaignStreakState,
  pathLength: number,
  nowMs: number
): WeeklyCampaignStreakState => {
  const state = cloneState(source);
  state.visitedNodeIds = state.visitedNodeIds.slice(0, pathLength);
  state.currentNodeId = state.visitedNodeIds[state.visitedNodeIds.length - 1];
  state.committedRoutes = state.committedRoutes.slice(0, Math.max(0, pathLength - 1));
  const allowed = new Set(state.visitedNodeIds);
  state.scoreEvents = state.scoreEvents.filter((event) => allowed.has(event.nodeId));
  state.scoredNodeIds = state.scoreEvents.map((event) => event.nodeId);
  state.score = aggregateScoreEvents(state.scoreEvents);
  state.revision += 1;
  state.updatedAtMs = Math.floor(nowMs);
  state.finalization = {
    status: 'finalized',
    reason: 'merge-conflict',
    finalizedAtMs: Math.floor(nowMs),
    triggerNodeId: null,
    submissionStatus: 'ready',
    submissionId: null,
    submittedAtMs: null
  };
  return state;
};

/**
 * Monotonic merge for local/wallet copies. Finalization always wins over an
 * active descendant, compatible active paths take the farther copy, and
 * divergent branches are reduced to their common prefix and finalized. This
 * prevents a sync conflict from manufacturing a sibling-route teleport.
 */
export const mergeWeeklyCampaignStreak = (
  leftValue: unknown,
  rightValue: unknown,
  graph: CampaignGraphIndex,
  binding: WeeklyCampaignBinding,
  nowMs: number
): WeeklyCampaignStreakState | null => {
  const left = sanitizeWeeklyCampaignStreak(leftValue, graph, binding, nowMs);
  const right = sanitizeWeeklyCampaignStreak(rightValue, graph, binding, nowMs);
  if (!left) return right;
  if (!right) return left;
  if (left.startNodeId !== right.startNodeId) {
    const preferred = compareStatePreference(left, right);
    return trimStateToPath(preferred, 1, nowMs);
  }

  const leftPath = statePath(left);
  const rightPath = statePath(right);
  const leftPrefix = isPathPrefix(leftPath, rightPath);
  const rightPrefix = isPathPrefix(rightPath, leftPath);
  if (!leftPrefix && !rightPrefix) {
    let commonLength = 0;
    while (
      commonLength < leftPath.length
      && commonLength < rightPath.length
      && leftPath[commonLength] === rightPath[commonLength]
    ) commonLength += 1;
    return trimStateToPath(compareStatePreference(left, right), Math.max(1, commonLength), nowMs);
  }

  const finalized = [left, right].filter((state) => state.finalization.status === 'finalized');
  if (finalized.length > 0) {
    return cloneState(finalized.reduce(compareStatePreference));
  }
  if (leftPath.length !== rightPath.length) {
    return cloneState(leftPath.length > rightPath.length ? left : right);
  }
  return cloneState(compareStatePreference(left, right));
};

export const simulateWeeklyCampaignRouteScore = (
  graph: CampaignGraphIndex,
  input: WeeklyCampaignRouteSimulationInput
): WeeklyCampaignStreakState => {
  if (input.pathNodeIds.length === 0) throw new Error('Weekly route simulation requires a path.');
  const startedAtMs = input.startedAtMs ?? input.binding.resetAtMs - 86_400_000;
  let state = startWeeklyCampaignStreak(graph, {
    ...input.binding,
    startNodeId: input.pathNodeIds[0],
    unlockedNodeIds: input.pathNodeIds,
    nowMs: startedAtMs
  });
  input.pathNodeIds.forEach((nodeId, index) => {
    const outcome = input.outcomesByNodeId[nodeId];
    if (!outcome) throw new Error(`Weekly route simulation is missing outcome: ${nodeId}`);
    state = recordWeeklyCampaignNodeScore(state, graph, {
      eventId: `simulation:${index}:${nodeId}`,
      nodeId,
      occurredAtMs: startedAtMs + index * 2_000,
      outcome
    });
    const nextNodeId = input.pathNodeIds[index + 1];
    if (!nextNodeId) return;
    const advance = requestWeeklyCampaignAdvance(
      state,
      graph,
      nextNodeId,
      startedAtMs + index * 2_000 + 1_000
    );
    if (advance.kind !== 'advanced') {
      throw new Error(`Weekly route simulation path is not a direct forward route: ${nodeId} -> ${nextNodeId}`);
    }
    state = advance.state;
  });
  return state;
};
