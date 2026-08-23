const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'run-receipt-persistence-canonicality-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = 'run-receipt-persistence-wallet-secret';

const loadScenario = () => {
  const supabasePath = require.resolve('../api/_lib/supabase');
  const receiptsPath = require.resolve('../api/_lib/runReceipts');
  const originalSupabaseCache = require.cache[supabasePath];
  const attemptsPath = require.resolve('../api/_lib/weeklyRunAttempts');
  const originalAttemptsCache = require.cache[attemptsPath];
  const weeklyRunAttempts = require('../api/_lib/weeklyRunAttempts');
  const rows = new Map();
  const writes = [];
  const settlements = [];
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: {
      hasSupabaseConfig: () => true,
      supabaseHeaders: (extra = {}) => extra,
      fetchSupabaseJson: async (url, options = {}) => {
        const value = String(url);
        if (!value.startsWith('scicon_run_receipts')) {
          throw new Error(`Unexpected query: ${value}`);
        }
        if (options.method === 'POST') {
          const row = JSON.parse(options.body);
          writes.push(row);
          if (!rows.has(row.run_id)) rows.set(row.run_id, row);
          return null;
        }
        const match = value.match(/run_id=eq\.([^&]+)/);
        const row = match ? rows.get(decodeURIComponent(match[1])) : null;
        return row ? [{ ...row }] : [];
      }
    }
  };
  require.cache[attemptsPath] = {
    id: attemptsPath,
    filename: attemptsPath,
    loaded: true,
    exports: {
      ...weeklyRunAttempts,
      settleWeeklyRunAttempt: async (input) => {
        settlements.push(input);
        return { duplicate: false, finishedAtMs: Date.now() };
      }
    }
  };
  delete require.cache[receiptsPath];
  const receipts = require('../api/_lib/runReceipts');
  return {
    receipts,
    rows,
    settlements,
    writes,
    restore() {
      delete require.cache[receiptsPath];
      if (originalSupabaseCache) require.cache[supabasePath] = originalSupabaseCache;
      else delete require.cache[supabasePath];
      if (originalAttemptsCache) require.cache[attemptsPath] = originalAttemptsCache;
      else delete require.cache[attemptsPath];
    }
  };
};

test('legacy run starts cannot be persisted as trusted receipts after cutover', async () => {
  const scenario = loadScenario();
  try {
    const currentStart = scenario.receipts.createRunStart('test', {
      nowMs: Date.now() - 2_000
    });
    const legacyPayload = scenario.receipts.verifyRunStart(currentStart.startToken);
    delete legacyPayload.startProvenanceVersion;

    await assert.rejects(
      scenario.receipts.finishRun(
        scenario.receipts.signPayload(legacyPayload),
        metrics(),
        { headers: {}, socket: { remoteAddress: '127.0.0.9' } }
      ),
      (error) => (
        error?.statusCode === 409
        && error?.code === 'RUN_START_PROVENANCE_UNTRUSTED'
        && error?.details?.[0] === 'run_start_provenance_untrusted'
      )
    );
    assert.equal(scenario.writes.length, 0);
    assert.equal(scenario.settlements.length, 0);
  } finally {
    scenario.restore();
  }
});

test('a legacy non-pristine Weekly start is rejected before settlement or persistence', async () => {
  const scenario = loadScenario();
  try {
    const now = Date.now();
    const legacyToken = scenario.receipts.signPayload({
      type: 'run-start',
      runId: crypto.randomUUID(),
      gameVersion: 'legacy',
      playerShipId: 'researchhub',
      runMode: 'weekly-streak',
      identity: { kind: 'guest', profileIdHash: 'a'.repeat(64) },
      weeklyCampaignBinding: {
        weeklyId: '2026-08-16',
        startNodeId: 'weekly-run-2026-08-16-depth-1',
        currentNodeId: 'weekly-run-2026-08-16-depth-4',
        revision: 7,
        visitedNodeCount: 4,
        committedRouteCount: 3,
        scoreEventCount: 3,
        scoreElapsedMs: 120_000
      },
      weeklyAttemptReservation: {
        reservationId: crypto.randomUUID(),
        runId: crypto.randomUUID(),
        weeklyId: '2026-08-16',
        attemptKey: 'b'.repeat(64),
        attemptNumber: 1
      },
      testRun: false,
      issuedAt: now - 120_000,
      expiresAt: now + 60_000
    });

    await assert.rejects(
      scenario.receipts.finishRun(legacyToken, {
        weeklyCampaignProof: { finalization: { status: 'finalized' } }
      }, { headers: {}, socket: { remoteAddress: '127.0.0.8' } }),
      (error) => error?.code === 'RUN_START_PROVENANCE_UNTRUSTED'
    );
    assert.equal(scenario.settlements.length, 0);
    assert.equal(scenario.writes.length, 0);
  } finally {
    scenario.restore();
  }
});

const metrics = (score = 100) => ({
  score,
  wave: 1,
  durationMs: 2_000,
  enemiesDefeated: 1,
  coinsCollected: 0,
  playerShipId: 'researchhub'
});

test('wallet finishes persist their owner while guest finishes remain unowned', async () => {
  const scenario = loadScenario();
  const wallet = '0x1111111111111111111111111111111111111111';
  const { SESSION_COOKIE_NAME, createWalletProfileSession } = require('../api/_lib/walletProfileAuth');
  try {
    const now = Date.now();
    const walletStart = scenario.receipts.createRunStart('test', {
      nowMs: now - 2_000,
      walletSession: { walletAddress: wallet, profileId: `wallet:${wallet}` }
    });
    assert.equal(
      scenario.receipts.verifyRunStart(walletStart.startToken).startProvenanceVersion,
      1
    );
    await scenario.receipts.finishRun(walletStart.startToken, metrics(), {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(wallet))}`
      },
      socket: { remoteAddress: '127.0.0.10' }
    });
    const walletRow = scenario.rows.get(walletStart.runId);
    assert.equal(walletRow.receipt_provenance_version, 1);
    assert.equal(walletRow.wallet_address, wallet);
    assert.equal(walletRow.wallet_claimed_at, walletRow.finished_at);

    const guestStart = scenario.receipts.createRunStart('test', { nowMs: now - 2_000 });
    await scenario.receipts.finishRun(guestStart.startToken, metrics(), {
      headers: {},
      socket: { remoteAddress: '127.0.0.11' }
    });
    const guestRow = scenario.rows.get(guestStart.runId);
    assert.equal(guestRow.wallet_address, null);
    assert.equal(guestRow.wallet_claimed_at, null);
  } finally {
    scenario.restore();
  }
});

test('a reused start token cannot report a conflicting receipt as persisted', async () => {
  const scenario = loadScenario();
  try {
    const start = scenario.receipts.createRunStart('test', { nowMs: Date.now() - 2_000 });
    const first = await scenario.receipts.finishRun(start.startToken, metrics(100), {
      headers: {},
      socket: { remoteAddress: '127.0.0.12' }
    });
    assert.equal(first.persisted, true);
    await assert.rejects(
      scenario.receipts.finishRun(start.startToken, metrics(101), {
        headers: {},
        socket: { remoteAddress: '127.0.0.12' }
      }),
      (error) => error?.statusCode === 409 && error?.code === 'RUN_RECEIPT_ALREADY_FINALIZED'
    );
  } finally {
    scenario.restore();
  }
});

test('a delayed same-metrics retry returns the original canonical standard receipt', async () => {
  const scenario = loadScenario();
  try {
    const start = scenario.receipts.createRunStart('test', { nowMs: Date.now() - 2_000 });
    const first = await scenario.receipts.finishRun(start.startToken, metrics(100), {
      headers: {},
      socket: { remoteAddress: '127.0.0.13' }
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const retried = await scenario.receipts.finishRun(start.startToken, metrics(100), {
      headers: {},
      socket: { remoteAddress: '127.0.0.13' }
    });
    assert.equal(retried.persisted, true);
    assert.equal(retried.receiptToken, first.receiptToken);
    assert.equal(retried.finishedAt, first.finishedAt);
    assert.equal(retried.expiresAt, first.expiresAt);
  } finally {
    scenario.restore();
  }
});

test('a rolling deployment reconstructs an older-lifetime weekly receipt exactly', () => {
  const scenario = loadScenario();
  try {
    const finishedAt = Date.now() - 5_000;
    const startedAt = finishedAt - 2_000;
    const identity = { kind: 'guest', profileIdHash: 'a'.repeat(64), guestSessionBound: true };
    const weeklyCampaign = {
      weeklyId: '2026-08-16',
      startNodeId: 'weekly-run-2026-08-16-depth-1',
      finalNodeId: 'weekly-run-2026-08-16-depth-4',
      completedNodeCount: 4,
      eventCount: 9,
      startRevision: 1,
      finalRevision: 10,
      finalizationReason: 'loss',
      proofHash: 'b'.repeat(64)
    };
    const runMetrics = metrics(7_607);
    const payload = {
      type: 'run-receipt',
      runId: 'weekly-rolling-deploy-run',
      gameVersion: 'test',
      runMode: 'weekly-streak',
      startedAt,
      finishedAt,
      expiresAt: finishedAt + (18 * 24 * 60 * 60 * 1_000),
      metrics: runMetrics,
      weeklyCampaign,
      identity,
      testRun: false,
      integrity: 'server-verified'
    };
    const oldToken = scenario.receipts.signPayload(payload);
    const stored = {
      run_id: payload.runId,
      game_version: payload.gameVersion,
      run_mode: payload.runMode,
      receipt_provenance_version: 1,
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date(finishedAt).toISOString(),
      duration_ms: runMetrics.durationMs,
      score: runMetrics.score,
      wave: runMetrics.wave,
      enemies_defeated: runMetrics.enemiesDefeated,
      coins_collected: runMetrics.coinsCollected,
      player_ship_id: runMetrics.playerShipId,
      integrity_status: payload.integrity,
      anomaly_flags: [],
      receipt_hash: crypto.createHash('sha256').update(oldToken).digest('hex')
    };
    const candidate = {
      runId: payload.runId,
      gameVersion: payload.gameVersion,
      runMode: payload.runMode,
      startedAt: stored.started_at,
      finishedAt: stored.finished_at,
      expiresAt: new Date(finishedAt + (33 * 24 * 60 * 60 * 1_000)).toISOString(),
      metrics: runMetrics,
      weeklyCampaign,
      identity,
      testRun: false,
      integrity: payload.integrity,
      anomalies: [],
      receiptToken: 'new-instance-token',
      persisted: false
    };
    const recovered = scenario.receipts.canonicalReceiptFromStoredRow(
      stored,
      { runMode: 'weekly-streak', identity, testRun: false },
      candidate
    );

    assert.ok(recovered);
    assert.equal(recovered.receiptToken, oldToken);
    assert.equal(recovered.expiresAt, new Date(payload.expiresAt).toISOString());
    assert.equal(recovered.weeklyCampaign.proofHash, weeklyCampaign.proofHash);
  } finally {
    scenario.restore();
  }
});
