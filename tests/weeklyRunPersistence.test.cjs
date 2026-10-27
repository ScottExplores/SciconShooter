const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'weekly-run-proof-test-secret-with-enough-entropy';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const root = path.resolve(__dirname, '..');
const { getWeeklyBoundaryMeta, resolveRunAttemptPolicy } = require('../shared/weeklyCompetitionBoundary');
const {
  createWeeklyCampaignStreakRunBinding,
  sanitizeWalletSnapshot,
  validateFinalizedWeeklyCampaignStreakProof
} = require('../api/_lib/walletProfiles');
const { createReservedRunStart, finishRun } = require('../api/_lib/runReceipts');
const {
  clearWeeklyRunAttemptMemoryForTests
} = require('../api/_lib/weeklyRunAttempts');

const loadBrowserServices = () => {
  const result = esbuild.buildSync({
    stdin: {
      contents: [
        "export * as squad from './services/squadProgression.ts';",
        "export * as graph from './services/campaignGraph.ts';",
        "export * as streak from './services/weeklyCampaignStreak.ts';",
        "export * as generator from './services/weeklyRunGenerator.ts';"
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'weekly-run-persistence-entry.ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    module,
    module.exports
  );
  return module.exports;
};

const browser = loadBrowserServices();

const createMemoryWindow = () => {
  const values = new Map();
  return {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: () => true
  };
};

const outcomeForNode = (run, node) => {
  const level = run.levels.find((candidate) => candidate.id === node.missionDefinitionId);
  assert.ok(level, `missing generated level for ${node.nodeId}`);
  return {
    regularEnemyKills: 1,
    eliteKills: 0,
    wavesCleared: level.waves.length,
    miniBossKills: node.miniBossIds.length > 0 ? 1 : 0,
    majorBossKills: node.bossId ? 1 : 0,
    missionCompleted: true,
    damageTaken: 0,
    livesRemaining: 10,
    accuracy: null,
    elapsedMs: 40_000,
    parTimeMs: null,
    performanceStars: 3
  };
};

const activeGeneratedStreak = ({ now, depth }) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, depth);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const pathNodeIds = graph.definition.nodes.slice(0, depth).map((node) => node.nodeId);
  const outcomesByNodeId = Object.fromEntries(pathNodeIds.map((nodeId) => {
    const node = graph.nodeById.get(nodeId);
    return [nodeId, outcomeForNode(run, node)];
  }));
  const state = browser.streak.simulateWeeklyCampaignRouteScore(graph, {
    binding: {
      weeklyId: boundary.weekKey,
      resetAtMs: boundary.endsAt.getTime()
    },
    pathNodeIds,
    outcomesByNodeId,
    startedAtMs: now - depth * 3_000 - 10_000
  });
  // The simulation helper deliberately permits its first score at the exact
  // start timestamp; production proofs require the first event to occur after
  // run creation.
  state.createdAtMs -= 1_000;
  return { boundary, graph, run, state };
};

const freshGeneratedStreak = ({ now, depth }) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, depth);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const entryNode = graph.nodeById.get(graph.definition.entryNodeId);
  const state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: now - 1_000
  });
  return { boundary, graph, run, state };
};

const scoreGeneratedDepths = ({ generated, issuedAt, depth }) => {
  let state = generated.state;
  const nodes = generated.graph.definition.nodes.slice(0, depth);
  nodes.forEach((node, index) => {
    const occurredAtMs = issuedAt + (index + 1) * 40_000;
    state = browser.streak.recordWeeklyCampaignNodeScore(state, generated.graph, {
      eventId: `legitimate-generated-depth-${index + 1}`,
      nodeId: node.nodeId,
      occurredAtMs,
      outcome: outcomeForNode(generated.run, node)
    });
    if (index < nodes.length - 1) {
      const advance = browser.streak.requestWeeklyCampaignAdvance(
        state,
        generated.graph,
        nodes[index + 1].nodeId,
        occurredAtMs
      );
      assert.equal(advance.kind, 'advanced');
      state = advance.state;
    }
  });
  return state;
};

test('a generated Weekly Run beyond the initial runway survives local reload and wallet sanitize', () => {
  const now = Date.now();
  const profileId = 'pilot:weekly-run-persistence';
  const generated = activeGeneratedStreak({ now, depth: 30 });
  const weeklyState = {
    ...browser.squad.createWeeklySquadState(profileId, generated.boundary.weekKey),
    weeklyCampaignStreak: generated.state,
    weeklyStats: {
      ...browser.squad.createWeeklySquadState(profileId, generated.boundary.weekKey).weeklyStats,
      weeklyRunAttempts: 2
    }
  };

  const previousWindow = global.window;
  const previousCustomEvent = global.CustomEvent;
  global.window = createMemoryWindow();
  global.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  };
  try {
    browser.squad.saveWeeklySquadState(weeklyState);
    const reloaded = browser.squad.loadWeeklySquadState(profileId);
    assert.equal(reloaded.weeklyCampaignStreak?.currentNodeId, 'weekly-run-node-29');
    assert.equal(reloaded.weeklyCampaignStreak?.visitedNodeIds.length, 30);
    assert.equal(reloaded.weeklyStats.weeklyRunAttempts, 2);
  } finally {
    global.window = previousWindow;
    global.CustomEvent = previousCustomEvent;
  }

  const wallet = '0x2222222222222222222222222222222222222222';
  const sanitized = sanitizeWalletSnapshot({
    weeklyState,
    permanentState: { profileId: `wallet:${wallet}` }
  }, wallet, now);
  assert.equal(sanitized.weeklyState.weeklyCampaignStreak?.currentNodeId, 'weekly-run-node-29');
  assert.equal(sanitized.weeklyState.weeklyCampaignStreak?.visitedNodeIds.length, 30);
  assert.equal(sanitized.weeklyState.weeklyStats.weeklyRunAttempts, 2);
});

test('generated Weekly Run persistence rejects a non-canonical route', () => {
  const now = Date.now();
  const profileId = 'pilot:weekly-run-tamper';
  const generated = activeGeneratedStreak({ now, depth: 4 });
  const tampered = structuredClone(generated.state);
  tampered.committedRoutes[1].edgeId = 'weekly-run-edge-99';
  const weeklyState = {
    ...browser.squad.createWeeklySquadState(profileId, generated.boundary.weekKey),
    weeklyCampaignStreak: tampered,
    weeklyStats: {
      ...browser.squad.createWeeklySquadState(profileId, generated.boundary.weekKey).weeklyStats,
      weeklyRunAttempts: 2
    }
  };

  const previousWindow = global.window;
  const previousCustomEvent = global.CustomEvent;
  global.window = createMemoryWindow();
  global.CustomEvent = class CustomEvent {};
  try {
    browser.squad.saveWeeklySquadState(weeklyState);
    const reloaded = browser.squad.loadWeeklySquadState(profileId);
    assert.equal(reloaded.weeklyCampaignStreak, null);
    assert.equal(reloaded.weeklyStats.weeklyRunAttempts, 2);
  } finally {
    global.window = previousWindow;
    global.CustomEvent = previousCustomEvent;
  }

  const wallet = '0x3333333333333333333333333333333333333333';
  const sanitized = sanitizeWalletSnapshot({
    weeklyState,
    permanentState: { profileId: `wallet:${wallet}` }
  }, wallet, now);
  assert.equal(sanitized.weeklyState.weeklyCampaignStreak, null);
  assert.equal(sanitized.weeklyState.weeklyStats.weeklyRunAttempts, 2);
});

test('generated Weekly Run receipt proof is canonical and rejects route, outcome, and forfeit tampering', async () => {
  const issuedAt = Date.now() - 70_000;
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 2);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const entryNode = graph.nodeById.get(graph.definition.entryNodeId);
  const active = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const binding = createWeeklyCampaignStreakRunBinding(active, { now: issuedAt });
  assert.equal(binding.currentNodeId, 'weekly-run-node-0');

  const scored = browser.streak.recordWeeklyCampaignNodeScore(active, graph, {
    eventId: 'generated-weekly-receipt-0',
    nodeId: entryNode.nodeId,
    occurredAtMs: issuedAt + 50_000,
    outcome: outcomeForNode(run, entryNode)
  });
  const finalized = browser.streak.finalizeWeeklyCampaignLoss(scored, issuedAt + 51_000);
  const canonical = validateFinalizedWeeklyCampaignStreakProof(finalized, {
    now: issuedAt + 60_000,
    expectedBinding: binding
  });
  assert.equal(canonical.currentNodeId, 'weekly-run-node-0');
  assert.notEqual(canonical.score.totalPoints, 0);

  const start = await createReservedRunStart('weekly-proof-test', {
    testRun: true,
    runMode: 'weekly-streak',
    weeklyCampaignProof: active,
    nowMs: issuedAt
  });
  const originalNow = Date.now;
  Date.now = () => issuedAt + 60_000;
  try {
    const receipt = await finishRun(start.startToken, {
      score: 999_999_999,
      wave: 999,
      durationMs: 1,
      enemiesDefeated: 999_999,
      coinsCollected: 999_999,
      playerShipId: 'researchhub',
      weeklyCampaignProof: finalized
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(receipt.weeklyCampaign.finalNodeId, 'weekly-run-node-0');
    assert.equal(receipt.metrics.score, canonical.score.totalPoints);
    assert.equal(receipt.metrics.wave, 1);
  } finally {
    Date.now = originalNow;
  }

  const expectRejected = (mutate, anomaly) => {
    const value = structuredClone(finalized);
    mutate(value);
    assert.throws(
      () => validateFinalizedWeeklyCampaignStreakProof(value, {
        now: issuedAt + 60_000,
        expectedBinding: binding
      }),
      (error) => error?.details?.anomalies?.includes(anomaly)
    );
  };
  expectRejected((value) => {
    value.currentNodeId = 'weekly-run-node-7';
  }, 'weekly_route_order_invalid');
  expectRejected((value) => {
    value.scoreEvents[0].outcome.wavesCleared += 1;
  }, 'weekly_outcome_impossible');
  const missingGeneratedBossTelemetry = structuredClone(finalized);
  missingGeneratedBossTelemetry.scoreEvents[0].outcome.miniBossKills = 0;
  const canonicalMissingBossTelemetry = validateFinalizedWeeklyCampaignStreakProof(
    missingGeneratedBossTelemetry,
    { now: issuedAt + 60_000, expectedBinding: binding }
  );
  assert.equal(canonicalMissingBossTelemetry.scoreEvents[0].outcome.miniBossKills, 1);
  expectRejected((value) => {
    value.scoreEvents[0].outcome.majorBossKills = 1;
  }, 'weekly_outcome_impossible');
  expectRejected((value) => {
    value.finalization.reason = 'forfeit';
  }, 'weekly_finalization_invalid');
});

test('a guest Wave 4 defeat after three generated elite bosses creates a verified receipt', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.parse('2026-08-21T04:59:00.000Z');
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 4);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const nodes = graph.definition.nodes.slice(0, 4);
  assert.equal(nodes.length, 4);
  assert.deepEqual(
    nodes.slice(0, 3).map((node) => node.miniBossIds[0]),
    ['bottleneck-drone', 'paywall-wall', 'aegis-brood-core']
  );

  let state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: nodes[0].nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const binding = createWeeklyCampaignStreakRunBinding(state, { now: issuedAt });
  const session = await createReservedRunStart('weekly-wave-4-runtime-category-test', {
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-wave-4-runtime-category',
    weeklyCampaignProof: state,
    nowMs: issuedAt
  });
  assert.equal(session.identity.kind, 'guest');

  for (let index = 0; index < 3; index += 1) {
    const node = nodes[index];
    assert.equal(node.miniBossIds.length, 1, `Depth ${index + 1} is an elite encounter`);
    const runtimeOutcome = outcomeForNode(run, node);
    // Generated boss counters are runtime telemetry. Exercise a legitimate
    // completed route where all three elite implementations omit that counter.
    runtimeOutcome.miniBossKills = 0;
    if (node.miniBossIds[0] === 'paywall-wall') {
      runtimeOutcome.regularEnemyKills = 6;
      runtimeOutcome.majorBossKills = 0;
    }
    const occurredAtMs = issuedAt + (index + 1) * 40_000;
    state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
      eventId: `generated-weekly-runtime-elite-${index}`,
      nodeId: node.nodeId,
      occurredAtMs,
      outcome: runtimeOutcome
    });
    const advance = browser.streak.requestWeeklyCampaignAdvance(
      state,
      graph,
      nodes[index + 1].nodeId,
      occurredAtMs
    );
    assert.equal(advance.kind, 'advanced');
    state = advance.state;
  }
  const finalized = browser.streak.finalizeWeeklyCampaignLoss(state, issuedAt + 121_000);

  const canonical = validateFinalizedWeeklyCampaignStreakProof(finalized, {
    now: issuedAt + 130_000,
    expectedBinding: binding
  });
  assert.equal(canonical.score.completedNodeCount, 3);
  assert.equal(canonical.currentNodeId, 'weekly-run-node-3');
  for (const event of canonical.scoreEvents) {
    assert.equal(event.outcome.miniBossKills, 1);
    assert.equal(event.outcome.majorBossKills, 0);
  }

  const missingOrdinaryEliteCredit = structuredClone(finalized);
  missingOrdinaryEliteCredit.scoreEvents[0].outcome.miniBossKills = 0;
  const ordinaryEliteCanonical = validateFinalizedWeeklyCampaignStreakProof(
    missingOrdinaryEliteCredit,
    { now: issuedAt + 130_000, expectedBinding: binding }
  );
  assert.equal(ordinaryEliteCanonical.scoreEvents[0].outcome.miniBossKills, 1);

  const wrongPaywallMajorCredit = structuredClone(finalized);
  wrongPaywallMajorCredit.scoreEvents[1].outcome.majorBossKills = 1;
  assert.throws(
    () => validateFinalizedWeeklyCampaignStreakProof(wrongPaywallMajorCredit, {
      now: issuedAt + 130_000,
      expectedBinding: binding
    }),
    (error) => error?.details?.anomalies?.includes('weekly_outcome_impossible')
  );

  const futurePaywallMiniCredit = structuredClone(finalized);
  futurePaywallMiniCredit.scoreEvents[1].outcome.miniBossKills = 1;
  const futureCanonical = validateFinalizedWeeklyCampaignStreakProof(futurePaywallMiniCredit, {
    now: issuedAt + 130_000,
    expectedBinding: binding
  });
  assert.equal(futureCanonical.scoreEvents[1].outcome.miniBossKills, 1);

  const originalNow = Date.now;
  Date.now = () => issuedAt + 130_000;
  try {
    const receipt = await finishRun(session.startToken, {
      score: 6_915,
      wave: 4,
      playerShipId: 'researchhub',
      weeklyCampaignProof: finalized
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(receipt.identity.kind, 'guest');
    assert.equal(receipt.integrity, 'server-verified');
    assert.deepEqual(receipt.anomalies, []);
    assert.equal(receipt.metrics.wave, 3);
    assert.equal(receipt.weeklyCampaign.completedNodeCount, 3);
    assert.equal(receipt.weeklyCampaign.finalNodeId, 'weekly-run-node-3');
  } finally {
    Date.now = originalNow;
  }
});

test('production generated Weekly Run finish fails closed when its receipt cannot be persisted', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.now() - 70_000;
  const { boundary, graph, run } = freshGeneratedStreak({ now: issuedAt, depth: 1 });
  const entryNode = graph.nodeById.get(graph.definition.entryNodeId);
  let proof = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const start = await createReservedRunStart('weekly-receipt-persistence-test', {
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-receipt-persistence',
    weeklyCampaignProof: proof,
    nowMs: issuedAt
  });
  proof = browser.streak.recordWeeklyCampaignNodeScore(proof, graph, {
    eventId: 'weekly-receipt-persistence-event',
    nodeId: entryNode.nodeId,
    occurredAtMs: issuedAt + 50_000,
    outcome: outcomeForNode(run, entryNode)
  });
  proof = browser.streak.finalizeWeeklyCampaignLoss(proof, issuedAt + 51_000);

  const originalEnvironment = process.env.NODE_ENV;
  const originalNow = Date.now;
  process.env.NODE_ENV = 'production';
  Date.now = () => issuedAt + 60_000;
  try {
    await assert.rejects(
      () => finishRun(start.startToken, {
        playerShipId: 'researchhub',
        weeklyCampaignProof: proof
      }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.deepEqual(error.details, ['weekly_receipt_persistence_unavailable']);
        return true;
      }
    );
  } finally {
    Date.now = originalNow;
    process.env.NODE_ENV = originalEnvironment;
  }
});

test('a generated major boss clear is canonical when runtime boss telemetry is omitted', () => {
  const issuedAt = Date.parse('2026-08-21T04:59:00.000Z');
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 5);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const nodes = graph.definition.nodes.slice(0, 4);
  assert.equal(nodes[3].bossId, 'paywall-decimator');

  let state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: nodes[0].nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const binding = createWeeklyCampaignStreakRunBinding(state, { now: issuedAt });

  for (let index = 0; index < nodes.length; index += 1) {
    const outcome = outcomeForNode(run, nodes[index]);
    outcome.miniBossKills = 0;
    outcome.majorBossKills = 0;
    const occurredAtMs = issuedAt + (index + 1) * 40_000;
    state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
      eventId: `generated-weekly-runtime-boss-${index}`,
      nodeId: nodes[index].nodeId,
      occurredAtMs,
      outcome
    });
    if (index < nodes.length - 1) {
      const advance = browser.streak.requestWeeklyCampaignAdvance(
        state,
        graph,
        nodes[index + 1].nodeId,
        occurredAtMs
      );
      assert.equal(advance.kind, 'advanced');
      state = advance.state;
    }
  }

  const finalized = browser.streak.finalizeWeeklyCampaignLoss(state, issuedAt + 161_000);
  const canonical = validateFinalizedWeeklyCampaignStreakProof(finalized, {
    now: issuedAt + 170_000,
    expectedBinding: binding
  });
  assert.equal(canonical.scoreEvents[3].outcome.miniBossKills, 0);
  assert.equal(canonical.scoreEvents[3].outcome.majorBossKills, 1);

  const wrongCategory = structuredClone(finalized);
  wrongCategory.scoreEvents[3].outcome.miniBossKills = 1;
  assert.throws(
    () => validateFinalizedWeeklyCampaignStreakProof(wrongCategory, {
      now: issuedAt + 170_000,
      expectedBinding: binding
    }),
    (error) => error?.details?.anomalies?.includes('weekly_outcome_impossible')
  );
});

test('generated elite and major roster clears use graph-owned boss credit', () => {
  const issuedAt = Date.parse('2026-08-21T02:00:00.000Z');
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 30);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const nodes = graph.definition.nodes.slice(0, 30);
  let state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: nodes[0].nodeId,
    unlockedNodeIds: nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const binding = createWeeklyCampaignStreakRunBinding(state, { now: issuedAt });

  for (let index = 0; index < nodes.length; index += 1) {
    const occurredAtMs = issuedAt + (index + 1) * 40_000;
    state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
      eventId: `generated-roster-counter-omission-${index}`,
      nodeId: nodes[index].nodeId,
      occurredAtMs,
      outcome: {
        ...outcomeForNode(run, nodes[index]),
        miniBossKills: 0,
        majorBossKills: 0
      }
    });
    if (index < nodes.length - 1) {
      const advance = browser.streak.requestWeeklyCampaignAdvance(
        state,
        graph,
        nodes[index + 1].nodeId,
        occurredAtMs
      );
      assert.equal(advance.kind, 'advanced');
      state = advance.state;
    }
  }

  const finalizedAtMs = issuedAt + nodes.length * 40_000 + 1_000;
  const canonical = validateFinalizedWeeklyCampaignStreakProof(
    browser.streak.finalizeWeeklyCampaignLoss(state, finalizedAtMs),
    { now: finalizedAtMs + 1_000, expectedBinding: binding }
  );
  assert.ok(nodes.some((node) => node.miniBossIds.length > 0));
  assert.ok(nodes.some((node) => Boolean(node.bossId)));
  canonical.scoreEvents.forEach((event, index) => {
    assert.equal(event.outcome.miniBossKills, nodes[index].miniBossIds.length > 0 ? 1 : 0);
    assert.equal(event.outcome.majorBossKills, nodes[index].bossId ? 1 : 0);
  });
});

test('a guest Weekly Run proof survives score and automatic advance in the same clock tick', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.now() - 100_000;
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 2);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const nodes = graph.definition.nodes.slice(0, 2);
  let state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: nodes[0].nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  const session = await createReservedRunStart('weekly-guest-clock-tick-test', {
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-guest-clock-tick',
    weeklyCampaignProof: state,
    nowMs: issuedAt
  });
  assert.equal(session.identity.kind, 'guest');

  const sharedTransitionTime = issuedAt + 40_000;
  state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
    eventId: 'weekly-guest-depth-1',
    nodeId: nodes[0].nodeId,
    occurredAtMs: sharedTransitionTime,
    outcome: outcomeForNode(run, nodes[0])
  });
  const advance = browser.streak.requestWeeklyCampaignAdvance(
    state,
    graph,
    nodes[1].nodeId,
    sharedTransitionTime
  );
  assert.equal(advance.kind, 'advanced');
  assert.equal(advance.state.committedRoutes[0].committedAtMs, sharedTransitionTime + 1);
  state = advance.state;
  // A proof already produced by the deployed pre-fix client keeps the shared
  // timestamp. The API must accept this exact legacy collision so a score on
  // an existing defeat screen is not stranded while new clients emit +1 ms.
  state.committedRoutes[0].committedAtMs = sharedTransitionTime;
  state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
    eventId: 'weekly-guest-depth-2',
    nodeId: nodes[1].nodeId,
    occurredAtMs: issuedAt + 80_000,
    outcome: outcomeForNode(run, nodes[1])
  });
  state = browser.streak.finalizeWeeklyCampaignLoss(state, issuedAt + 81_000);

  const originalNow = Date.now;
  Date.now = () => issuedAt + 90_000;
  try {
    const receipt = await finishRun(session.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: state
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(receipt.identity.kind, 'guest');
    assert.equal(receipt.integrity, 'server-verified');
    assert.deepEqual(receipt.anomalies, []);
  } finally {
    Date.now = originalNow;
  }
});

test('a fast legitimate Weekly Run clear can create a verified receipt', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.now() - 15_000;
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 1);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const entryNode = graph.nodeById.get(graph.definition.entryNodeId);
  let state = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: [entryNode.nodeId],
    nowMs: issuedAt - 1_000
  });
  const session = await createReservedRunStart('weekly-fast-clear-test', {
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-fast-clear',
    weeklyCampaignProof: state,
    nowMs: issuedAt
  });
  state = browser.streak.recordWeeklyCampaignNodeScore(state, graph, {
    eventId: 'weekly-fast-clear-depth-1',
    nodeId: entryNode.nodeId,
    occurredAtMs: issuedAt + 9_000,
    outcome: {
      ...outcomeForNode(run, entryNode),
      elapsedMs: 9_000
    }
  });
  state = browser.streak.finalizeWeeklyCampaignLoss(state, issuedAt + 9_001);

  const receipt = await finishRun(session.startToken, {
    playerShipId: 'researchhub',
    weeklyCampaignProof: state
  }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });

  assert.equal(receipt.integrity, 'server-verified');
  assert.deepEqual(receipt.anomalies, []);
  assert.equal(receipt.metrics.wave, 1);
});

test('a deep generated Weekly Run receipt is not capped by authored Campaign mission count', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.parse('2026-08-17T12:00:00.000Z');
  const generated = freshGeneratedStreak({ now: issuedAt, depth: 30 });
  const start = await createReservedRunStart('weekly-deep-proof-test', {
    runMode: 'weekly-streak',
    weeklyCampaignProof: generated.state,
    nowMs: issuedAt
  });
  const scored = scoreGeneratedDepths({ generated, issuedAt, depth: 30 });
  const finalizedAt = issuedAt + 30 * 40_000 + 1_000;
  const finalized = browser.streak.finalizeWeeklyCampaignLoss(scored, finalizedAt);
  const originalNow = Date.now;
  Date.now = () => finalizedAt + 1_000;
  try {
    const receipt = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: finalized
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(receipt.metrics.wave, 30);
    assert.equal(receipt.integrity, 'server-verified');
    assert.deepEqual(receipt.anomalies, []);
  } finally {
    Date.now = originalNow;
  }
});

test('server Weekly Run reservations give guests the active free allowance and keep wallet quota identity-bound', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  // Mid-week, clear of the Sunday boundary. A proof stamped one second
  // before the week opens is rejected as inactive, which is not this test.
  const baseNow = Date.parse('2026-08-18T16:00:00.000Z');
  const freeAttempts = resolveRunAttemptPolicy(baseNow).freeAttempts;
  assert.equal(freeAttempts, 5);
  const proofs = Array.from({ length: freeAttempts + 1 }, (_, index) => (
    freshGeneratedStreak({ now: baseNow + index * 2_000, depth: 1 }).state
  ));
  const firstProof = proofs[0];
  const serverGuestIdentityId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const guestOptions = (proof) => ({
    runMode: 'weekly-streak',
    // Rotating the untrusted client profile ID must not rotate the quota.
    profileId: `pilot:rotated-${proof.createdAtMs}`,
    guestIdentityId: serverGuestIdentityId,
    weeklyCampaignProof: proof,
    nowMs: proof.updatedAtMs + 1
  });

  const [first, duplicate] = await Promise.all([
    createReservedRunStart('weekly-attempt-test', guestOptions(firstProof)),
    createReservedRunStart('weekly-attempt-test', guestOptions(firstProof))
  ]);
  assert.equal(first.runId, duplicate.runId);
  assert.equal(first.weeklyAttempt.attemptNumber, 1);
  assert.equal(first.weeklyAttempt.freeAttempts, freeAttempts);
  assert.equal(first.weeklyAttempt.purchasedAttempts, 0);
  assert.equal(first.weeklyAttempt.attemptsUsed, 1);
  assert.equal(first.weeklyAttempt.attemptsRemaining, freeAttempts - 1);

  const subsequent = [];
  for (let index = 1; index < freeAttempts; index += 1) {
    subsequent.push(await createReservedRunStart(
      'weekly-attempt-test',
      guestOptions(proofs[index])
    ));
  }
  const last = subsequent[subsequent.length - 1];
  assert.notEqual(subsequent[0].runId, first.runId);
  assert.equal(subsequent[0].weeklyAttempt.attemptNumber, 2);
  assert.equal(subsequent[0].weeklyAttempt.attemptsRemaining, freeAttempts - 2);
  assert.equal(last.weeklyAttempt.attemptNumber, freeAttempts);
  assert.equal(last.weeklyAttempt.attemptsUsed, freeAttempts);
  assert.equal(last.weeklyAttempt.attemptsRemaining, 0);
  const lostLastResponseRetry = await createReservedRunStart(
    'weekly-attempt-test',
    guestOptions(proofs[freeAttempts - 1])
  );
  assert.equal(lostLastResponseRetry.runId, last.runId);
  assert.equal(lostLastResponseRetry.weeklyAttempt.attemptNumber, freeAttempts);
  assert.equal(lostLastResponseRetry.weeklyAttempt.attemptsRemaining, 0);
  await assert.rejects(
    () => createReservedRunStart('weekly-attempt-test', guestOptions(proofs[freeAttempts])),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.deepEqual(error.details, ['weekly_run_attempts_exhausted']);
      return true;
    }
  );

  // An authenticated wallet is a separate server-derived identity. Supplying
  // the exhausted guest profile id cannot consume or spoof its wallet slots.
  const wallet = '0x4444444444444444444444444444444444444444';
  const walletStart = await createReservedRunStart('weekly-attempt-test', {
    ...guestOptions(firstProof),
    walletSession: { walletAddress: wallet, profileId: `wallet:${wallet}` }
  });
  assert.equal(walletStart.identity.kind, 'wallet');
  assert.equal(walletStart.weeklyAttempt.attemptNumber, 1);
  assert.equal(walletStart.weeklyAttempt.freeAttempts, freeAttempts);
  assert.equal(walletStart.weeklyAttempt.purchasedAttempts, 0);
  assert.equal(walletStart.weeklyAttempt.attemptsRemaining, freeAttempts - 1);
});

test('generated Weekly Run deliberate-end proofs can never mint a score receipt', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.now();
  const generated = freshGeneratedStreak({ now: issuedAt, depth: 1 });
  const start = await createReservedRunStart('weekly-forfeit-test', {
    testRun: true,
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-forfeit-test',
    weeklyCampaignProof: generated.state,
    nowMs: issuedAt
  });
  const entryNode = generated.graph.nodeById.get(generated.graph.definition.entryNodeId);
  const scored = browser.streak.recordWeeklyCampaignNodeScore(
    generated.state,
    generated.graph,
    {
      eventId: 'weekly-forfeit-depth-1',
      nodeId: entryNode.nodeId,
      occurredAtMs: issuedAt + 9_000,
      outcome: {
        ...outcomeForNode(generated.run, entryNode),
        elapsedMs: 9_000
      }
    }
  );
  const finalized = browser.streak.finalizeWeeklyCampaignDeliberateEnd(
    scored,
    issuedAt + 9_001
  );
  const originalNow = Date.now;
  Date.now = () => issuedAt + 10_000;
  try {
    await assert.rejects(
      () => finishRun(start.startToken, {
        playerShipId: 'researchhub',
        weeklyCampaignProof: finalized
      }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
      (error) => {
        assert.equal(error.statusCode, 422);
        assert.deepEqual(error.details, ['weekly_run_forfeit_not_submittable']);
        return true;
      }
    );
  } finally {
    Date.now = originalNow;
  }
});

test('a Weekly Run reservation settles exactly one canonical result proof', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.parse('2026-08-17T12:00:00.000Z');
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 1);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const entryNode = graph.nodeById.get(graph.definition.entryNodeId);
  const active = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: [entryNode.nodeId],
    nowMs: issuedAt - 1_000
  });
  const start = await createReservedRunStart('weekly-single-settlement-test', {
    testRun: false,
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-single-settlement',
    weeklyCampaignProof: active,
    nowMs: issuedAt
  });
  const makeFinalized = (damageTaken) => browser.streak.finalizeWeeklyCampaignLoss(
    browser.streak.recordWeeklyCampaignNodeScore(active, graph, {
      eventId: `weekly-single-settlement-${damageTaken}`,
      nodeId: entryNode.nodeId,
      occurredAtMs: issuedAt + 50_000,
      outcome: { ...outcomeForNode(run, entryNode), damageTaken }
    }),
    issuedAt + 51_000
  );
  const firstProof = makeFinalized(0);
  const conflictingProof = makeFinalized(1);
  const originalNow = Date.now;
  let serverNow = issuedAt + 60_000;
  Date.now = () => serverNow;
  try {
    const firstReceipt = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: firstProof
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(firstReceipt.integrity, 'server-verified');

    const retryProof = browser.streak.markWeeklyCampaignStreakSubmission(
      firstProof,
      'failed',
      issuedAt + 59_000
    );
    // A retry can arrive much later after the first response was lost. Its
    // receipt must still use the settlement-owned time and anomaly decision.
    serverNow = issuedAt + 120_000;
    const retryReceipt = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: retryProof
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(retryReceipt.runId, firstReceipt.runId);
    assert.equal(
      retryReceipt.weeklyCampaign.proofHash,
      firstReceipt.weeklyCampaign.proofHash
    );
    assert.equal(
      retryReceipt.weeklyCampaign.finalRevision,
      firstReceipt.weeklyCampaign.finalRevision
    );
    assert.equal(retryReceipt.finishedAt, firstReceipt.finishedAt);
    assert.equal(retryReceipt.receiptToken, firstReceipt.receiptToken);

    await assert.rejects(
      () => finishRun(start.startToken, {
        playerShipId: 'researchhub',
        weeklyCampaignProof: conflictingProof
      }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
      (error) => {
        assert.equal(error.statusCode, 409);
        assert.deepEqual(error.details, ['weekly_run_attempt_already_finalized']);
        return true;
      }
    );
  } finally {
    Date.now = originalNow;
  }
});

test('a delayed non-test retry keeps the original settlement decision and token', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.parse('2026-08-17T12:00:00.000Z');
  const generated = freshGeneratedStreak({ now: issuedAt, depth: 1 });
  const start = await createReservedRunStart('weekly-delayed-retry-test', {
    testRun: false,
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-delayed-retry',
    weeklyCampaignProof: generated.state,
    nowMs: issuedAt
  });
  const entryNode = generated.graph.nodeById.get(generated.graph.definition.entryNodeId);
  const scored = browser.streak.recordWeeklyCampaignNodeScore(
    generated.state,
    generated.graph,
    {
      eventId: 'weekly-short-settlement-depth-1',
      nodeId: entryNode.nodeId,
      occurredAtMs: issuedAt + 9_000,
      outcome: {
        ...outcomeForNode(generated.run, entryNode),
        elapsedMs: 9_000
      }
    }
  );
  const finalized = browser.streak.finalizeWeeklyCampaignLoss(
    scored,
    issuedAt + 9_001
  );
  const retryProof = browser.streak.markWeeklyCampaignStreakSubmission(
    finalized,
    'failed',
    issuedAt + 9_500
  );
  const originalNow = Date.now;
  // Settlement happens before anomaly inspection. Keep the canonical gameplay
  // event at a valid 9 seconds while making server-measured duration 1 second;
  // a retry much later must preserve this original review decision.
  let serverNow = issuedAt + 1_000;
  Date.now = () => serverNow;
  try {
    const first = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: finalized
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.deepEqual(first.anomalies, ['run_too_short']);
    assert.equal(first.integrity, 'review');

    serverNow = issuedAt + 60_000;
    const retry = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: retryProof
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.deepEqual(retry.anomalies, first.anomalies);
    assert.equal(retry.integrity, first.integrity);
    assert.equal(retry.finishedAt, first.finishedAt);
    assert.equal(retry.receiptToken, first.receiptToken);
  } finally {
    Date.now = originalNow;
  }
});

test('generated Weekly Run admission rejects a fabricated scored prefix before reservation', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.parse('2026-08-17T12:00:00.000Z');
  const boundary = getWeeklyBoundaryMeta(new Date(issuedAt));
  const run = browser.generator.buildWeeklyRunCampaign(boundary.weekKey, undefined, 2);
  const graph = browser.graph.createCampaignGraphIndex(run);
  const [entryNode, secondNode] = graph.definition.nodes;
  let forged = browser.streak.startWeeklyCampaignStreak(graph, {
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: entryNode.nodeId,
    unlockedNodeIds: graph.definition.nodes.map((node) => node.nodeId),
    nowMs: issuedAt - 1_000
  });
  forged = browser.streak.recordWeeklyCampaignNodeScore(forged, graph, {
    eventId: 'fabricated-prefix-score',
    nodeId: entryNode.nodeId,
    occurredAtMs: issuedAt - 500,
    outcome: outcomeForNode(run, entryNode)
  });
  const advance = browser.streak.requestWeeklyCampaignAdvance(
    forged,
    graph,
    secondNode.nodeId,
    issuedAt - 250
  );
  assert.equal(advance.kind, 'advanced');

  await assert.rejects(
    () => createReservedRunStart('weekly-forged-prefix-test', {
      runMode: 'weekly-streak',
      profileId: 'pilot:weekly-forged-prefix',
      weeklyCampaignProof: advance.state,
      nowMs: issuedAt
    }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.deepEqual(error.details, ['weekly_generated_start_not_pristine']);
      return true;
    }
  );
});

test('configured Weekly Run persistence fails closed while ordinary Campaign start remains available', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const proof = freshGeneratedStreak({ now: Date.now(), depth: 1 }).state;
  const previous = {
    url: process.env.SUPABASE_URL,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: global.fetch
  };
  let fetchCount = 0;
  process.env.SUPABASE_URL = 'https://weekly-attempt-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  global.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({ message: 'database unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  };
  try {
    await assert.rejects(
      () => createReservedRunStart('weekly-persistence-test', {
        runMode: 'weekly-streak',
        profileId: 'pilot:weekly-persistence-failure',
        weeklyCampaignProof: proof,
        nowMs: proof.updatedAtMs + 1
      }),
      (error) => {
        assert.equal(error.statusCode, 503);
        assert.deepEqual(error.details, ['weekly_attempt_persistence_unavailable']);
        return true;
      }
    );
    assert.equal(fetchCount, 1);

    const campaignStart = await createReservedRunStart('ordinary-campaign-test', {
      runMode: 'standard',
      profileId: 'pilot:ordinary-campaign'
    });
    assert.equal(campaignStart.runMode, 'standard');
    assert.equal(fetchCount, 1, 'ordinary Campaign must never touch the Weekly Run ledger');
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previous.url;
    if (previous.role === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.role;
    global.fetch = previous.fetch;
  }
});
