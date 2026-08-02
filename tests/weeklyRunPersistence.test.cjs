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
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
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
  expectRejected((value) => {
    value.scoreEvents[0].outcome.miniBossKills = 0;
  }, 'weekly_outcome_impossible');
  expectRejected((value) => {
    value.finalization.reason = 'forfeit';
  }, 'weekly_finalization_invalid');
});

test('a deep generated Weekly Run receipt is not capped by authored Campaign mission count', async () => {
  const issuedAt = Date.now();
  const generated = activeGeneratedStreak({ now: issuedAt, depth: 30 });
  const start = await createReservedRunStart('weekly-deep-proof-test', {
    runMode: 'weekly-streak',
    weeklyCampaignProof: generated.state,
    nowMs: issuedAt
  });
  const finalized = browser.streak.finalizeWeeklyCampaignLoss(generated.state, issuedAt + 1_000);
  const originalNow = Date.now;
  Date.now = () => issuedAt + 2_000;
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

test('server Weekly Run reservations give each guest or wallet identity exactly two attempts per week', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const baseNow = Date.now();
  const firstProof = activeGeneratedStreak({ now: baseNow, depth: 1 }).state;
  const secondProof = activeGeneratedStreak({ now: baseNow + 2_000, depth: 1 }).state;
  const thirdProof = activeGeneratedStreak({ now: baseNow + 4_000, depth: 1 }).state;
  const guestOptions = (proof) => ({
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-attempt-guest',
    weeklyCampaignProof: proof,
    nowMs: proof.updatedAtMs + 1
  });

  const [first, duplicate] = await Promise.all([
    createReservedRunStart('weekly-attempt-test', guestOptions(firstProof)),
    createReservedRunStart('weekly-attempt-test', guestOptions(firstProof))
  ]);
  assert.equal(first.runId, duplicate.runId);
  assert.equal(first.weeklyAttempt.attemptNumber, 1);
  assert.equal(first.weeklyAttempt.attemptsUsed, 1);
  assert.equal(first.weeklyAttempt.attemptsRemaining, 1);

  const second = await createReservedRunStart('weekly-attempt-test', guestOptions(secondProof));
  assert.notEqual(second.runId, first.runId);
  assert.equal(second.weeklyAttempt.attemptNumber, 2);
  assert.equal(second.weeklyAttempt.attemptsUsed, 2);
  assert.equal(second.weeklyAttempt.attemptsRemaining, 0);
  await assert.rejects(
    () => createReservedRunStart('weekly-attempt-test', guestOptions(thirdProof)),
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
});

test('generated Weekly Run deliberate-end proofs can never mint a score receipt', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const issuedAt = Date.now();
  const generated = activeGeneratedStreak({ now: issuedAt, depth: 1 });
  const start = await createReservedRunStart('weekly-forfeit-test', {
    testRun: true,
    runMode: 'weekly-streak',
    profileId: 'pilot:weekly-forfeit-test',
    weeklyCampaignProof: generated.state,
    nowMs: issuedAt
  });
  const finalized = browser.streak.finalizeWeeklyCampaignDeliberateEnd(
    generated.state,
    issuedAt + 1_000
  );
  const originalNow = Date.now;
  Date.now = () => issuedAt + 2_000;
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
  const issuedAt = Date.now() - 70_000;
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
    testRun: true,
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
  Date.now = () => issuedAt + 60_000;
  try {
    const firstReceipt = await finishRun(start.startToken, {
      playerShipId: 'researchhub',
      weeklyCampaignProof: firstProof
    }, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
    assert.equal(firstReceipt.integrity, 'server-verified');

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

test('configured Weekly Run persistence fails closed while ordinary Campaign start remains available', async () => {
  clearWeeklyRunAttemptMemoryForTests();
  const proof = activeGeneratedStreak({ now: Date.now(), depth: 1 }).state;
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
