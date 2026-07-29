const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const compileWeeklyCampaignStreak = () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'weeklyCampaignStreak.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
};

const streaks = compileWeeklyCampaignStreak();

const edge = (edgeId, toNodeId, overrides = {}) => ({
  edgeId,
  toNodeId,
  routeId: 'main',
  label: edgeId,
  kind: 'progression',
  risk: 'low',
  weeklyScoreMultiplier: 1,
  ...overrides
});

const node = (nodeId, overrides = {}) => ({
  nodeId,
  sectorId: 'sector-1',
  depth: 1,
  routeId: 'main',
  displayLabel: nodeId,
  missionDefinitionId: `mission-${nodeId}`,
  prerequisiteNodeIds: [],
  prerequisiteMode: 'all',
  outgoingEdges: [],
  rejoinNodeId: null,
  optional: false,
  mainPath: true,
  masteryBranch: false,
  oneTime: false,
  bossId: null,
  miniBossIds: [],
  weeklyStreakEligible: true,
  weeklyScoreMultiplier: 1,
  recommendedPower: { minimum: 0, expected: 0, comfortable: 0 },
  rewardProfile: 'standard',
  mapPosition: { x: 0.5, y: 0.5 },
  routeControlPoints: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.4 }],
  routeSummary: {
    combatIntensity: 'low',
    miniBossPresence: 'none',
    rewardType: 'standard',
    recommendedSupportTags: [],
    estimatedWaveCount: 3
  },
  ...overrides
});

const makeGraph = () => {
  const definition = {
    entryNodeId: 'root',
    nodes: [
      node('root', {
        outgoingEdges: [
          edge('root-low', 'low', { routeId: 'safe', kind: 'route-choice' }),
          edge('root-high', 'high', {
            routeId: 'combat',
            kind: 'route-choice',
            risk: 'high',
            weeklyScoreMultiplier: 1.04
          })
        ]
      }),
      node('low', {
        depth: 2,
        routeId: 'safe',
        prerequisiteNodeIds: ['root'],
        outgoingEdges: [edge('low-rejoin', 'rejoin', { routeId: 'safe', kind: 'rejoin' })],
        rejoinNodeId: 'rejoin'
      }),
      node('high', {
        depth: 2,
        routeId: 'combat',
        prerequisiteNodeIds: ['root'],
        outgoingEdges: [edge('high-rejoin', 'rejoin', {
          routeId: 'combat',
          kind: 'rejoin',
          risk: 'moderate'
        })],
        rejoinNodeId: 'rejoin',
        miniBossIds: ['bottleneck-drone'],
        weeklyScoreMultiplier: 1.03,
        rewardProfile: 'combat-premium'
      }),
      node('rejoin', {
        depth: 3,
        prerequisiteNodeIds: ['low', 'high'],
        prerequisiteMode: 'any',
        outgoingEdges: [edge('rejoin-end', 'end')]
      }),
      node('end', {
        depth: 4,
        prerequisiteNodeIds: ['rejoin']
      }),
      node('ineligible', {
        sectorId: 'sector-2',
        depth: 4,
        weeklyStreakEligible: false
      })
    ]
  };
  const nodeById = new Map(definition.nodes.map((item) => [item.nodeId, item]));
  const edgeEntries = definition.nodes.flatMap((item) => item.outgoingEdges);
  const edgeById = new Map(edgeEntries.map((item) => [item.edgeId, item]));
  return {
    definition,
    nodeById,
    edgeById,
    edgesBySourceNodeId: new Map(
      definition.nodes.map((item) => [item.nodeId, item.outgoingEdges])
    ),
    incomingSourceNodeIdsByTargetNodeId: new Map(),
    nodeIdsByMissionDefinitionId: new Map()
  };
};

const WEEK = Object.freeze({ weeklyId: '2026-W31', resetAtMs: 2_000_000 });
const STARTED_AT = 1_000_000;

const outcome = (overrides = {}) => ({
  regularEnemyKills: 20,
  eliteKills: 0,
  wavesCleared: 3,
  miniBossKills: 0,
  majorBossKills: 0,
  missionCompleted: true,
  damageTaken: 0,
  livesRemaining: 10,
  accuracy: 0.95,
  elapsedMs: 90_000,
  parTimeMs: 100_000,
  performanceStars: 3,
  ...overrides
});

const start = (graph = makeGraph(), startNodeId = 'root') => (
  streaks.startWeeklyCampaignStreak(graph, {
    ...WEEK,
    startNodeId,
    unlockedNodeIds: ['root', 'low', 'high', 'rejoin', 'end'],
    nowMs: STARTED_AT
  })
);

const scoreCurrent = (state, graph, overrides = {}) => streaks.recordWeeklyCampaignNodeScore(
  state,
  graph,
  {
    eventId: `score:${state.currentNodeId}`,
    nodeId: state.currentNodeId,
    occurredAtMs: state.updatedAtMs + 10,
    outcome: outcome(overrides)
  }
);

const advance = (state, graph, targetNodeId) => {
  const result = streaks.requestWeeklyCampaignAdvance(
    state,
    graph,
    targetNodeId,
    state.updatedAtMs + 10
  );
  assert.equal(result.kind, 'advanced');
  return result.state;
};

test('a streak starts on any unlocked eligible node and is bound to one weekly reset', () => {
  const graph = makeGraph();
  assert.deepEqual(
    streaks.getEligibleWeeklyCampaignStartNodeIds(graph, ['root', 'high', 'ineligible']),
    ['root', 'high']
  );
  const laterStart = start(graph, 'high');
  assert.equal(laterStart.startNodeId, 'high');
  assert.equal(laterStart.currentNodeId, 'high');
  assert.deepEqual(laterStart.visitedNodeIds, ['high']);
  assert.equal(laterStart.weeklyId, WEEK.weeklyId);
  assert.equal(laterStart.resetAtMs, WEEK.resetAtMs);

  assert.throws(
    () => streaks.startWeeklyCampaignStreak(graph, {
      ...WEEK,
      startNodeId: 'high',
      unlockedNodeIds: ['root'],
      nowMs: STARTED_AT
    }),
    /not unlocked/
  );
  assert.throws(
    () => streaks.startWeeklyCampaignStreak(graph, {
      ...WEEK,
      startNodeId: 'ineligible',
      unlockedNodeIds: ['ineligible'],
      nowMs: STARTED_AT
    }),
    /not Weekly Streak eligible/
  );
});

test('node scoring is exactly once and remains separate from Campaign coins', () => {
  const graph = makeGraph();
  const initial = start(graph);
  const scored = scoreCurrent(initial, graph, {
    eliteKills: 2,
    miniBossKills: 1,
    majorBossKills: 1
  });
  assert.deepEqual(scored.scoredNodeIds, ['root']);
  assert.equal(scored.score.completedNodeCount, 1);
  assert.equal(scored.score.eventCount, 1);
  assert.ok(scored.score.totalPoints > 0);
  assert.equal(Object.hasOwn(scored.score, 'coins'), false);
  assert.equal(Object.hasOwn(scored.scoreEvents[0].breakdown, 'coins'), false);
  assert.throws(
    () => streaks.recordWeeklyCampaignNodeScore(scored, graph, {
      eventId: 'score:root:again',
      nodeId: 'root',
      occurredAtMs: scored.updatedAtMs + 1,
      outcome: outcome()
    }),
    /already scored/
  );
});

test('forward movement requires a scored current node and a direct authored edge', () => {
  const graph = makeGraph();
  const initial = start(graph);
  assert.equal(
    streaks.requestWeeklyCampaignAdvance(initial, graph, 'low', STARTED_AT + 1).reason,
    'current-node-not-scored'
  );

  const scored = scoreCurrent(initial, graph);
  const highAdvance = streaks.requestWeeklyCampaignAdvance(
    scored,
    graph,
    'high',
    scored.updatedAtMs + 1
  );
  assert.equal(highAdvance.kind, 'advanced');
  assert.deepEqual(highAdvance.state.visitedNodeIds, ['root', 'high']);
  assert.deepEqual(highAdvance.state.committedRoutes.map((route) => ({
    edgeId: route.edgeId,
    from: route.fromNodeId,
    to: route.toNodeId,
    risk: route.risk
  })), [{ edgeId: 'root-high', from: 'root', to: 'high', risk: 'high' }]);

  const skip = streaks.requestWeeklyCampaignAdvance(scored, graph, 'rejoin', scored.updatedAtMs + 1);
  assert.equal(skip.kind, 'confirmation-required');
  assert.equal(skip.confirmation.selectionKind, 'disconnected');
  assert.equal(skip.confirmation.finalizationReason, 'disconnected-selection');
});

test('a fork choice is binding and invalid map selections require confirmation before finalization', () => {
  const graph = makeGraph();
  let state = scoreCurrent(start(graph), graph);
  state = advance(state, graph, 'high');
  state = scoreCurrent(state, graph, { miniBossKills: 1 });

  const sibling = streaks.requestWeeklyCampaignAdvance(
    state,
    graph,
    'low',
    state.updatedAtMs + 1
  );
  assert.equal(sibling.kind, 'confirmation-required');
  assert.equal(sibling.confirmation.selectionKind, 'disconnected');
  assert.equal(sibling.state.finalization.status, 'active');

  const finalized = streaks.confirmWeeklyCampaignSelectionFinalization(
    state,
    sibling.confirmation,
    state.updatedAtMs + 2
  );
  assert.equal(finalized.finalization.status, 'finalized');
  assert.equal(finalized.finalization.reason, 'disconnected-selection');
  assert.equal(finalized.finalization.submissionStatus, 'ready');

  const repeat = streaks.requestWeeklyCampaignAdvance(state, graph, 'high', state.updatedAtMs + 1);
  assert.equal(repeat.kind, 'confirmation-required');
  assert.equal(repeat.confirmation.selectionKind, 'repeat');
  const backward = streaks.requestWeeklyCampaignAdvance(state, graph, 'root', state.updatedAtMs + 1);
  assert.equal(backward.kind, 'confirmation-required');
  assert.equal(backward.confirmation.selectionKind, 'backward');
  assert.match(backward.confirmation.message, /earlier Mission will end/);
});

test('loss, deliberate end, terminal completion, and reset all finalize once', () => {
  const graph = makeGraph();
  const active = scoreCurrent(start(graph), graph);
  const lost = streaks.finalizeWeeklyCampaignLoss(active, active.updatedAtMs + 1);
  assert.equal(lost.finalization.reason, 'loss');
  assert.equal(streaks.finalizeWeeklyCampaignDeliberateEnd(lost, lost.updatedAtMs + 1).finalization.reason, 'loss');

  const deliberate = streaks.finalizeWeeklyCampaignDeliberateEnd(active, active.updatedAtMs + 1);
  assert.equal(deliberate.finalization.reason, 'deliberate-end');

  let terminal = start(graph);
  terminal = scoreCurrent(terminal, graph);
  terminal = advance(terminal, graph, 'low');
  terminal = scoreCurrent(terminal, graph);
  terminal = advance(terminal, graph, 'rejoin');
  terminal = scoreCurrent(terminal, graph);
  terminal = advance(terminal, graph, 'end');
  terminal = scoreCurrent(terminal, graph);
  terminal = streaks.finalizeCompletedWeeklyCampaignStreak(terminal, graph, terminal.updatedAtMs + 1);
  assert.equal(terminal.finalization.reason, 'terminal-complete');

  const expired = streaks.sanitizeWeeklyCampaignStreak(
    active,
    graph,
    WEEK,
    WEEK.resetAtMs
  );
  assert.equal(expired.finalization.reason, 'weekly-reset');
});

test('finalized streak submission status follows pending, submitted, and failed leaderboard attempts', () => {
  const graph = makeGraph();
  const binding = { weeklyId: 'week-submit', resetAtMs: 50_000 };
  let state = streaks.startWeeklyCampaignStreak(graph, {
    ...binding,
    startNodeId: 'root',
    unlockedNodeIds: ['root'],
    nowMs: 1_000
  });
  state = streaks.recordWeeklyCampaignNodeScore(state, graph, {
    eventId: 'submit:root',
    nodeId: 'root',
    occurredAtMs: 2_000,
    outcome: outcome()
  });
  state = streaks.finalizeWeeklyCampaignLoss(state, 3_000);
  state = streaks.markWeeklyCampaignStreakSubmission(state, 'pending', 4_000);
  assert.equal(state.finalization.submissionStatus, 'pending');
  state = streaks.markWeeklyCampaignStreakSubmission(state, 'failed', 5_000);
  assert.equal(state.finalization.submissionStatus, 'failed');
  state = streaks.markWeeklyCampaignStreakSubmission(state, 'submitted', 6_000, 'run-123');
  assert.equal(state.finalization.submissionStatus, 'submitted');
  assert.equal(state.finalization.submissionId, 'run-123');
  assert.equal(state.finalization.submittedAtMs, 6_000);
});

test('sanitize and migrate rebuild canonical routes, deduplicate events, and reject another week', () => {
  const graph = makeGraph();
  let state = scoreCurrent(start(graph), graph);
  state = advance(state, graph, 'low');
  state = scoreCurrent(state, graph);
  const raw = JSON.parse(JSON.stringify(state));
  raw.score.totalPoints = 999_999_999;
  raw.scoreEvents.push({ ...raw.scoreEvents[0], eventId: raw.scoreEvents[0].eventId });
  raw.visitedNodeIds.push('high', 'high');
  raw.scoredNodeIds.push('high');

  const sanitized = streaks.sanitizeWeeklyCampaignStreak(raw, graph, WEEK, state.updatedAtMs + 1);
  assert.deepEqual(sanitized.visitedNodeIds, ['root', 'low']);
  assert.deepEqual(sanitized.scoredNodeIds, ['root', 'low']);
  assert.equal(sanitized.score.eventCount, 2);
  assert.notEqual(sanitized.score.totalPoints, 999_999_999);

  const legacy = {
    weekId: WEEK.weeklyId,
    weeklyResetAtMs: WEEK.resetAtMs,
    startMissionId: 'root',
    currentMissionId: 'low',
    chosenRoutes: ['root-low'],
    events: raw.scoreEvents,
    startedAtMs: STARTED_AT,
    updatedAtMs: state.updatedAtMs
  };
  const migrated = streaks.migrateWeeklyCampaignStreak(legacy, graph, WEEK, state.updatedAtMs + 1);
  assert.equal(migrated.schemaVersion, 1);
  assert.deepEqual(migrated.visitedNodeIds, ['root', 'low']);
  assert.equal(migrated.score.eventCount, 2);

  assert.equal(
    streaks.sanitizeWeeklyCampaignStreak(raw, graph, {
      weeklyId: '2026-W32',
      resetAtMs: WEEK.resetAtMs + 1
    }, state.updatedAtMs + 1),
    null
  );
  assert.equal(
    streaks.sanitizeWeeklyCampaignStreak({ ...raw, currentNodeId: 'high' }, graph, WEEK, state.updatedAtMs + 1),
    null
  );
});

test('merge advances compatible copies but finalizes divergent wallet/local routes at their common prefix', () => {
  const graph = makeGraph();
  const rootScored = scoreCurrent(start(graph), graph);
  let local = advance(rootScored, graph, 'low');
  let remote = scoreCurrent(local, graph);
  remote = advance(remote, graph, 'rejoin');
  const mergedForward = streaks.mergeWeeklyCampaignStreak(
    local,
    remote,
    graph,
    WEEK,
    remote.updatedAtMs + 1
  );
  assert.equal(mergedForward.currentNodeId, 'rejoin');
  assert.equal(mergedForward.finalization.status, 'active');

  const otherRoute = advance(rootScored, graph, 'high');
  const conflicted = streaks.mergeWeeklyCampaignStreak(
    local,
    otherRoute,
    graph,
    WEEK,
    otherRoute.updatedAtMs + 1
  );
  assert.deepEqual(conflicted.visitedNodeIds, ['root']);
  assert.deepEqual(conflicted.scoredNodeIds, ['root']);
  assert.equal(conflicted.finalization.status, 'finalized');
  assert.equal(conflicted.finalization.reason, 'merge-conflict');
});

test('deterministic branch simulations prove neither safe nor combat route universally dominates', () => {
  const graph = makeGraph();
  const common = outcome();
  const cautiousSafe = streaks.simulateWeeklyCampaignRouteScore(graph, {
    binding: WEEK,
    pathNodeIds: ['root', 'low', 'rejoin'],
    outcomesByNodeId: { root: common, low: outcome(), rejoin: common },
    startedAtMs: STARTED_AT
  });
  const costlyCombat = streaks.simulateWeeklyCampaignRouteScore(graph, {
    binding: WEEK,
    pathNodeIds: ['root', 'high', 'rejoin'],
    outcomesByNodeId: {
      root: common,
      high: outcome({
        eliteKills: 2,
        miniBossKills: 1,
        damageTaken: 400,
        livesRemaining: 2,
        accuracy: 0.6,
        elapsedMs: 140_000,
        performanceStars: 1
      }),
      rejoin: common
    },
    startedAtMs: STARTED_AT
  });
  assert.ok(cautiousSafe.score.totalPoints > costlyCombat.score.totalPoints);

  const cleanSafe = streaks.simulateWeeklyCampaignRouteScore(graph, {
    binding: WEEK,
    pathNodeIds: ['root', 'low', 'rejoin'],
    outcomesByNodeId: { root: common, low: common, rejoin: common },
    startedAtMs: STARTED_AT
  });
  const masteredCombat = streaks.simulateWeeklyCampaignRouteScore(graph, {
    binding: WEEK,
    pathNodeIds: ['root', 'high', 'rejoin'],
    outcomesByNodeId: {
      root: common,
      high: outcome({ eliteKills: 2, miniBossKills: 1 }),
      rejoin: common
    },
    startedAtMs: STARTED_AT
  });
  assert.ok(masteredCombat.score.totalPoints > cleanSafe.score.totalPoints);
});

test('all ten authored Campaign forks preserve the safe-clear versus high-ceiling tradeoff', () => {
  const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const definition = campaign.campaignGraph;
  const graph = {
    definition,
    nodeById: new Map(definition.nodes.map((item) => [item.nodeId, item])),
    edgeById: new Map(definition.nodes.flatMap((item) => item.outgoingEdges).map((item) => [item.edgeId, item])),
    edgesBySourceNodeId: new Map(definition.nodes.map((item) => [item.nodeId, item.outgoingEdges])),
    incomingSourceNodeIdsByTargetNodeId: new Map(),
    nodeIdsByMissionDefinitionId: new Map()
  };
  const forks = definition.nodes.filter((item) => item.outgoingEdges.length > 1);
  assert.equal(forks.length, 10);

  const riskWeight = { low: 1, moderate: 1.05, high: 1.1 };
  for (const fork of forks) {
    const ranked = fork.outgoingEdges.map((routeEdge) => {
      const target = graph.nodeById.get(routeEdge.toNodeId);
      return {
        edge: routeEdge,
        target,
        potential: riskWeight[routeEdge.risk]
          * routeEdge.weeklyScoreMultiplier
          * target.weeklyScoreMultiplier
      };
    }).sort((left, right) => left.potential - right.potential);
    const safe = ranked[0];
    const combat = ranked.at(-1);
    const safeTargets = new Set(safe.target.outgoingEdges.map((item) => item.toNodeId));
    const rejoinNodeId = combat.target.outgoingEdges.find((item) => safeTargets.has(item.toNodeId))?.toNodeId;
    assert.ok(rejoinNodeId, `${fork.nodeId} routes must explicitly rejoin for this simulation`);

    const cleanCommon = outcome();
    const safeClear = streaks.simulateWeeklyCampaignRouteScore(graph, {
      binding: WEEK,
      pathNodeIds: [fork.nodeId, safe.target.nodeId, rejoinNodeId],
      outcomesByNodeId: {
        [fork.nodeId]: cleanCommon,
        [safe.target.nodeId]: cleanCommon,
        [rejoinNodeId]: cleanCommon
      },
      startedAtMs: STARTED_AT
    });
    const batteredCombat = streaks.simulateWeeklyCampaignRouteScore(graph, {
      binding: WEEK,
      pathNodeIds: [fork.nodeId, combat.target.nodeId, rejoinNodeId],
      outcomesByNodeId: {
        [fork.nodeId]: cleanCommon,
        [combat.target.nodeId]: outcome({
          damageTaken: 900,
          livesRemaining: 1,
          accuracy: 0.55,
          elapsedMs: 160_000,
          performanceStars: 1
        }),
        [rejoinNodeId]: cleanCommon
      },
      startedAtMs: STARTED_AT
    });
    assert.ok(
      safeClear.score.totalPoints > batteredCombat.score.totalPoints,
      `${fork.nodeId}: a clean safe clear should beat a badly damaged combat clear`
    );

    const cleanSafe = safeClear;
    const masteredCombat = streaks.simulateWeeklyCampaignRouteScore(graph, {
      binding: WEEK,
      pathNodeIds: [fork.nodeId, combat.target.nodeId, rejoinNodeId],
      outcomesByNodeId: {
        [fork.nodeId]: cleanCommon,
        [combat.target.nodeId]: outcome({ eliteKills: 3, miniBossKills: 1 }),
        [rejoinNodeId]: cleanCommon
      },
      startedAtMs: STARTED_AT
    });
    assert.ok(
      masteredCombat.score.totalPoints > cleanSafe.score.totalPoints,
      `${fork.nodeId}: a mastered combat clear should retain the higher score ceiling`
    );
  }
});
