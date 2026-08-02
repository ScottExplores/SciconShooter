const test = require('node:test');
const assert = require('node:assert/strict');
const campaign = require('../game-config/campaign.json');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');

process.env.RUN_RECEIPT_SECRET = 'test-only-secret-with-enough-entropy';
process.env.WALLET_PROFILE_AUTH_SECRET = 'run-receipt-wallet-identity-test-secret';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

const {
  createRunStart,
  finishRun,
  signPayload,
  verifyRunReceipt
} = require('../api/_lib/runReceipts');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');

const requestStub = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
const authoredMissionCount = campaign.levels.length;
const graphNodeById = new Map(campaign.campaignGraph.nodes.map((node) => [node.nodeId, node]));
const levelById = new Map(campaign.levels.map((level) => [level.id, level]));

const minimumMissionElapsedMs = (node) => {
  const level = levelById.get(node.missionDefinitionId);
  return level.waves.reduce((total, wave) => (
    wave.completionRule === 'clear-after-duration'
      ? total + Math.max(0, Number(wave.durationSeconds) || 0) * 1_000
      : total
  ), 0);
};

const startToken = (overrides = {}) => {
  const now = Date.now();
  return signPayload({
    type: 'run-start',
    runId: crypto.randomUUID(),
    gameVersion: 'test',
    issuedAt: now - 30_000,
    expiresAt: now + 60_000,
    ...overrides
  });
};

const outcomeForNode = (node, overrides = {}) => {
  const level = levelById.get(node.missionDefinitionId);
  const authoredBossIds = level.waves.flatMap((wave) => (
    wave.events.filter((event) => event.kind === 'boss').map((event) => event.bossId)
  ));
  const majorBossKills = node.bossId
    ? authoredBossIds.filter((bossId) => bossId === node.bossId).length
    : 0;
  return {
    regularEnemyKills: 1,
    eliteKills: 0,
    wavesCleared: level.waves.length,
    miniBossKills: authoredBossIds.length - majorBossKills,
    majorBossKills,
    missionCompleted: true,
    damageTaken: 0,
    livesRemaining: 3,
    accuracy: null,
    elapsedMs: minimumMissionElapsedMs(node),
    parTimeMs: 1,
    performanceStars: 0,
    ...overrides
  };
};

const weeklyProof = ({ pathNodeIds, now = Date.now(), mutate } = {}) => {
  const boundary = getWeeklyBoundaryMeta(new Date(now));
  const selectedPath = pathNodeIds || [campaign.campaignGraph.entryNodeId];
  const elapsedByNode = selectedPath.map((nodeId) => minimumMissionElapsedMs(graphNodeById.get(nodeId)));
  const totalElapsedMs = elapsedByNode.reduce((total, elapsedMs) => total + elapsedMs, 0);
  const createdAtMs = now - totalElapsedMs - selectedPath.length * 1_000 - 5_000;
  const eventTimes = [];
  const commitmentTimes = [];
  let timelineMs = createdAtMs;
  selectedPath.forEach((_, index) => {
    timelineMs += elapsedByNode[index];
    eventTimes.push(timelineMs);
    if (index < selectedPath.length - 1) {
      timelineMs += 1_000;
      commitmentTimes.push(timelineMs);
    }
  });
  const committedRoutes = selectedPath.slice(1).map((nodeId, index) => {
    const sourceNodeId = selectedPath[index];
    const source = graphNodeById.get(sourceNodeId);
    const edge = source.outgoingEdges.find((candidate) => candidate.toNodeId === nodeId);
    assert.ok(edge, `test route ${sourceNodeId} -> ${nodeId} must be authored`);
    return {
      edgeId: edge.edgeId,
      fromNodeId: sourceNodeId,
      toNodeId: nodeId,
      routeId: edge.routeId,
      risk: edge.risk,
      committedAtMs: commitmentTimes[index]
    };
  });
  const scoreEvents = selectedPath.map((nodeId, index) => ({
    eventId: `weekly-proof-event-${index}`,
    nodeId,
    occurredAtMs: eventTimes[index],
    outcome: outcomeForNode(graphNodeById.get(nodeId)),
    breakdown: { totalPoints: 999_999_999 }
  }));
  const value = {
    schemaVersion: 1,
    revision: 1 + selectedPath.length + committedRoutes.length + 1,
    weeklyId: boundary.weekKey,
    resetAtMs: boundary.endsAt.getTime(),
    startNodeId: selectedPath[0],
    currentNodeId: selectedPath.at(-1),
    committedRoutes,
    visitedNodeIds: [...selectedPath],
    scoredNodeIds: [...selectedPath],
    scoreEvents,
    score: { totalPoints: 999_999_999, completedNodeCount: 999 },
    finalization: {
      status: 'finalized',
      reason: 'deliberate-end',
      finalizedAtMs: timelineMs + 1_000,
      triggerNodeId: selectedPath.at(-1),
      submissionStatus: 'ready',
      submissionId: null,
      submittedAtMs: null
    },
    createdAtMs,
    updatedAtMs: timelineMs + 1_000
  };
  mutate?.(value);
  return value;
};

const activeStartProofFor = (proof, {
  visitedNodeCount = 1,
  scoreEventCount = 0
} = {}) => {
  const committedRouteCount = visitedNodeCount - 1;
  const scoreEvents = proof.scoreEvents.slice(0, scoreEventCount);
  const committedRoutes = proof.committedRoutes.slice(0, committedRouteCount);
  const visitedNodeIds = proof.visitedNodeIds.slice(0, visitedNodeCount);
  const updatedAtMs = Math.max(
    proof.createdAtMs,
    scoreEvents.at(-1)?.occurredAtMs ?? 0,
    committedRoutes.at(-1)?.committedAtMs ?? 0
  );
  return {
    ...proof,
    revision: 1 + scoreEvents.length + committedRoutes.length,
    currentNodeId: visitedNodeIds.at(-1),
    committedRoutes,
    visitedNodeIds,
    scoredNodeIds: scoreEvents.map((event) => event.nodeId),
    scoreEvents,
    score: { totalPoints: 0, completedNodeCount: scoreEvents.length },
    finalization: {
      status: 'active',
      reason: null,
      finalizedAtMs: null,
      triggerNodeId: null,
      submissionStatus: 'not-ready',
      submissionId: null,
      submittedAtMs: null
    },
    updatedAtMs
  };
};

const weeklyStart = (proof, options = {}) => createRunStart('test', {
  playerShipId: options.playerShipId || 'researchhub',
  profileId: options.profileId || 'pilot:weekly-proof-test',
  runMode: 'weekly-streak',
  weeklyCampaignProof: options.startProof || activeStartProofFor(proof),
  nowMs: options.nowMs || proof.createdAtMs + 1_000,
  walletSession: options.walletSession || null
});

test('creates a server-verified receipt for plausible metrics', async () => {
  const receipt = await finishRun(startToken(), {
    score: 5000,
    wave: 2,
    durationMs: 30_000,
    enemiesDefeated: 10,
    coinsCollected: 5,
    playerShipId: 'bio'
  }, requestStub);
  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.persisted, false);
  assert.equal(verifyRunReceipt(receipt.receiptToken).metrics.score, 5000);
  assert.equal(receipt.metrics.playerShipId, 'researchhub');
});

test('binds the selected ship from the signed run start to the finished receipt', async () => {
  const start = createRunStart('test', { playerShipId: 'eth' });
  const receipt = await finishRun(start.startToken, {
    score: 1200,
    wave: 1,
    durationMs: 1_500,
    enemiesDefeated: 3,
    coinsCollected: 2,
    playerShipId: 'bio'
  }, requestStub);

  assert.equal(start.playerShipId, 'eth');
  assert.equal(receipt.metrics.playerShipId, 'eth');
  assert.equal(verifyRunReceipt(receipt.receiptToken).metrics.playerShipId, 'eth');

  const btcStart = createRunStart('test', { playerShipId: 'btc' });
  assert.equal(btcStart.playerShipId, 'btc');
});

test('rejects a tampered receipt signature', async () => {
  const receipt = await finishRun(startToken(), {
    score: 100,
    wave: 1,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);
  const tampered = `${receipt.receiptToken.slice(0, -1)}${receipt.receiptToken.endsWith('a') ? 'b' : 'a'}`;
  assert.throws(() => verifyRunReceipt(tampered), /signature is invalid/i);
});

test('rejects impossible run metrics', async () => {
  await assert.rejects(() => finishRun(startToken(), {
    score: 99_999_999,
    wave: 999,
    durationMs: 30_000,
    enemiesDefeated: 1,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);
});

test('accepts any authored Mission without trusting a client-selected starting Mission', async () => {
  const start = createRunStart('test', { startingWave: 999 });
  assert.equal(start.startingWave, undefined);
  assert.equal(JSON.parse(Buffer.from(start.startToken.split('.')[0], 'base64url').toString('utf8')).startingWave, undefined);

  const receipt = await finishRun(startToken(), {
    score: 500,
    wave: authoredMissionCount,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);

  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.anomalies.includes('mission_number_impossible'), false);

  const lateMissionBossReceipt = await finishRun(startToken(), {
    score: 5_000,
    wave: authoredMissionCount,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub);
  assert.equal(lateMissionBossReceipt.integrity, 'server-verified');

  await assert.rejects(() => finishRun(startToken(), {
    score: 500,
    wave: authoredMissionCount + 1,
    durationMs: 30_000,
    enemiesDefeated: 2,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);

  await assert.rejects(() => finishRun(startToken(), {
    score: 2_900_000,
    wave: 1,
    durationMs: 30_000,
    enemiesDefeated: 100,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);

  await assert.rejects(() => finishRun(startToken(), {
    score: 99_999_999,
    wave: authoredMissionCount,
    durationMs: 30_000,
    enemiesDefeated: 1,
    coinsCollected: 1
  }, requestStub), /integrity checks/i);
});

test('weekly proof recomputes signed leaderboard metrics and ignores client score tampering', async () => {
  const now = Date.now();
  const proof = weeklyProof({ now });
  const start = weeklyStart(proof, { playerShipId: 'btc' });
  const receipt = await finishRun(start.startToken, {
    score: 99_999_999,
    wave: 999,
    durationMs: 65_000,
    enemiesDefeated: 999_999,
    coinsCollected: 999_999,
    playerShipId: 'bio',
    weeklyCampaignProof: proof
  }, requestStub);

  assert.equal(receipt.integrity, 'server-verified');
  // 2322 after the surge waves: the recompute scores waves cleared, and the
  // entry Mission now runs six of them.
  assert.equal(receipt.metrics.score, 2322);
  assert.equal(receipt.metrics.wave, 1);
  assert.equal(receipt.metrics.enemiesDefeated, 1);
  assert.equal(receipt.metrics.coinsCollected, 0);
  assert.equal(receipt.metrics.playerShipId, 'btc');
  assert.equal(receipt.weeklyCampaign.weeklyId, getWeeklyBoundaryMeta(new Date(now)).weekKey);
  assert.equal(receipt.weeklyCampaign.completedNodeCount, 1);
  assert.match(receipt.weeklyCampaign.proofHash, /^[a-f0-9]{64}$/);
  const signed = verifyRunReceipt(receipt.receiptToken);
  assert.equal(signed.metrics.score, 2322);
  assert.equal(signed.metrics.coinsCollected, 0);
  assert.equal(signed.weeklyCampaign.proofHash, receipt.weeklyCampaign.proofHash);
  assert.equal(Object.hasOwn(receipt.weeklyCampaign, 'walletAddress'), false);
});

test('weekly proof rejects a forged non-direct route and unmet authored prerequisites', async () => {
  const now = Date.now();
  const proof = weeklyProof({ now });
  const start = weeklyStart(proof);
  const skippedNode = campaign.campaignGraph.nodes.find((node) => node.depth >= 3);
  proof.visitedNodeIds.push(skippedNode.nodeId);
  proof.currentNodeId = skippedNode.nodeId;
  proof.committedRoutes.push({
    edgeId: campaign.campaignGraph.nodes[0].outgoingEdges[0].edgeId,
    fromNodeId: proof.startNodeId,
    toNodeId: skippedNode.nodeId,
    routeId: 'forged',
    risk: 'high',
    committedAtMs: proof.createdAtMs + 6_000
  });

  await assert.rejects(() => finishRun(start.startToken, {
    score: 1,
    wave: 1,
    durationMs: 65_000,
    enemiesDefeated: 1,
    coinsCollected: 0,
    weeklyCampaignProof: proof
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.anomalies, ['weekly_route_order_invalid']);
    return true;
  });
});

test('weekly proof rejects duplicate or out-of-order score event identities', async () => {
  const now = Date.now();
  const first = graphNodeById.get(campaign.campaignGraph.entryNodeId);
  const second = first.outgoingEdges[0].toNodeId;
  const proof = weeklyProof({ pathNodeIds: [first.nodeId, second], now });
  const start = weeklyStart(proof);
  proof.scoreEvents[1].eventId = proof.scoreEvents[0].eventId;

  await assert.rejects(() => finishRun(start.startToken, {
    score: 1,
    wave: 1,
    durationMs: 65_000,
    enemiesDefeated: 1,
    coinsCollected: 0,
    weeklyCampaignProof: proof
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.anomalies, ['weekly_score_event_order_invalid']);
    return true;
  });
});

test('weekly proof rejects impossible authored wave and boss claims', async () => {
  const now = Date.now();
  const impossibleWave = weeklyProof({
    now,
    mutate: (proof) => {
      proof.scoreEvents[0].outcome.wavesCleared += 1;
    }
  });
  const impossibleWaveStart = weeklyStart(impossibleWave);
  const finish = (proof, start) => finishRun(start.startToken, {
    score: 1,
    wave: 1,
    durationMs: 65_000,
    enemiesDefeated: 1,
    coinsCollected: 0,
    weeklyCampaignProof: proof
  }, requestStub);
  await assert.rejects(() => finish(impossibleWave, impossibleWaveStart), (error) => {
    assert.deepEqual(error.details.anomalies, ['weekly_outcome_impossible']);
    return true;
  });

  const impossibleBoss = weeklyProof({
    now,
    mutate: (proof) => {
      proof.scoreEvents[0].outcome.majorBossKills = 1;
    }
  });
  const impossibleBossStart = weeklyStart(impossibleBoss);
  await assert.rejects(() => finish(impossibleBoss, impossibleBossStart), (error) => {
    assert.deepEqual(error.details.anomalies, ['weekly_outcome_impossible']);
    return true;
  });
});

test('binds a run-start token to standard or Weekly Streak finalization', async () => {
  const now = Date.now();
  const proof = weeklyProof({ now });
  const standardMetrics = {
    score: 100,
    wave: 1,
    durationMs: 65_000,
    enemiesDefeated: 1,
    coinsCollected: 0
  };
  const weeklyRunStart = weeklyStart(proof);

  await assert.rejects(() => finishRun(weeklyRunStart.startToken, standardMetrics, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details, ['weekly_proof_required']);
    return true;
  });

  await assert.rejects(() => finishRun(startToken({
    issuedAt: now - 65_000,
    expiresAt: now + 60_000,
    runMode: 'standard'
  }), {
    ...standardMetrics,
    weeklyCampaignProof: proof
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details, ['weekly_run_mode_mismatch']);
    return true;
  });
});

test('weekly run start binds an exact resumed streak prefix and accepts only a strict extension', async () => {
  const now = Date.now();
  const first = graphNodeById.get(campaign.campaignGraph.entryNodeId);
  const second = first.outgoingEdges[0].toNodeId;
  const proof = weeklyProof({ pathNodeIds: [first.nodeId, second], now });
  const startProof = activeStartProofFor(proof, {
    visitedNodeCount: 2,
    scoreEventCount: 1
  });
  const start = weeklyStart(proof, {
    startProof,
    nowMs: startProof.updatedAtMs + 1
  });
  const receipt = await finishRun(start.startToken, {
    score: 0,
    wave: 1,
    durationMs: 1,
    enemiesDefeated: 0,
    coinsCollected: 0,
    weeklyCampaignProof: proof
  }, requestStub);

  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(receipt.weeklyCampaign.startRevision, startProof.revision);
  assert.equal(receipt.weeklyCampaign.finalRevision, proof.revision);

  const tamperedProof = structuredClone(proof);
  tamperedProof.scoreEvents[0].outcome.damageTaken += 1;
  await assert.rejects(() => finishRun(start.startToken, {
    weeklyCampaignProof: tamperedProof
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.anomalies, ['weekly_start_binding_mismatch']);
    return true;
  });
});

test('weekly proof requires strictly monotonic event timing and an authored minimum mission duration', async () => {
  const now = Date.now();
  const first = graphNodeById.get(campaign.campaignGraph.entryNodeId);
  const second = first.outgoingEdges[0].toNodeId;
  const equalTimestampProof = weeklyProof({ pathNodeIds: [first.nodeId, second], now });
  const equalTimestampStart = weeklyStart(equalTimestampProof);
  equalTimestampProof.scoreEvents[1].occurredAtMs = equalTimestampProof.committedRoutes[0].committedAtMs;
  await assert.rejects(() => finishRun(equalTimestampStart.startToken, {
    weeklyCampaignProof: equalTimestampProof
  }, requestStub), (error) => {
    assert.deepEqual(error.details.anomalies, ['weekly_timestamps_invalid']);
    return true;
  });

  const tooFastProof = weeklyProof({ now });
  const tooFastStart = weeklyStart(tooFastProof);
  tooFastProof.scoreEvents[0].outcome.elapsedMs = 1_000;
  await assert.rejects(() => finishRun(tooFastStart.startToken, {
    weeklyCampaignProof: tooFastProof
  }, requestStub), (error) => {
    assert.deepEqual(error.details.anomalies, ['weekly_outcome_impossible']);
    return true;
  });
});

test('weekly proof revision must account for every post-start route, score, and finalization event', async () => {
  const now = Date.now();
  const proof = weeklyProof({ now });
  const start = weeklyStart(proof);
  proof.revision -= 1;

  await assert.rejects(() => finishRun(start.startToken, {
    weeklyCampaignProof: proof
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 422);
    assert.deepEqual(error.details.anomalies, ['weekly_revision_invalid']);
    return true;
  });
});

test('wallet-bound run starts cannot be finished under a different authenticated wallet', async () => {
  const firstWallet = '0x1111111111111111111111111111111111111111';
  const secondWallet = '0x2222222222222222222222222222222222222222';
  const start = createRunStart('test', {
    profileId: `wallet:${firstWallet}`,
    walletSession: {
      walletAddress: firstWallet,
      profileId: `wallet:${firstWallet}`
    }
  });
  const secondSessionToken = createWalletProfileSession(secondWallet);

  await assert.rejects(() => finishRun(start.startToken, {
    score: 100,
    wave: 1,
    durationMs: 1_000,
    enemiesDefeated: 1,
    coinsCollected: 0
  }, requestStub), (error) => {
    assert.equal(error.statusCode, 403);
    assert.deepEqual(error.details, ['run_identity_mismatch']);
    return true;
  });

  await assert.rejects(() => finishRun(start.startToken, {
    score: 100,
    wave: 1,
    durationMs: 1_000,
    enemiesDefeated: 1,
    coinsCollected: 0
  }, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(secondSessionToken)}`
    },
    socket: { remoteAddress: '127.0.0.2' }
  }), (error) => {
    assert.equal(error.statusCode, 403);
    assert.deepEqual(error.details, ['run_identity_mismatch']);
    return true;
  });

  const firstSessionToken = createWalletProfileSession(firstWallet);
  const receipt = await finishRun(start.startToken, {
    score: 100,
    wave: 1,
    durationMs: 1_000,
    enemiesDefeated: 1,
    coinsCollected: 0
  }, {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(firstSessionToken)}`
    },
    socket: { remoteAddress: '127.0.0.3' }
  });
  assert.equal(receipt.identity.kind, 'wallet');
  assert.equal(receipt.identity.walletAddress, firstWallet);
});

test('marks owner test receipts and permits wave-jump metrics without ranking integrity failures', async () => {
  const start = createRunStart('test', { testRun: true });
  assert.equal(start.testRun, true);

  const receipt = await finishRun(start.startToken, {
    score: 123,
    wave: 4,
    durationMs: 500,
    enemiesDefeated: 0,
    coinsCollected: 0
  }, requestStub);

  assert.equal(receipt.testRun, true);
  assert.equal(receipt.integrity, 'server-verified');
  assert.equal(verifyRunReceipt(receipt.receiptToken).testRun, true);
});
