const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storageKey = 'scicon_weekly_guest_proposal_capability_v1';

const createStorage = (stored = new Map()) => ({
  stored,
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key)
});

const loadRecoveryService = ({ weekKey = 'week-current', storage = createStorage() } = {}) => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'weeklyGuestProposalRecovery.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    Map,
    Number,
    JSON,
    window: { localStorage: storage },
    require: (specifier) => {
      if (specifier === '../constants') {
        return { STORAGE_KEYS: { WEEKLY_GUEST_PROPOSAL_CAPABILITY: storageKey } };
      }
      if (specifier === '../shared/weeklyCompetitionBoundary.browser') {
        return { getWeeklyBoundaryMeta: () => ({ weekKey }) };
      }
      throw new Error(`Unexpected dependency: ${specifier}`);
    }
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context);
  return { service: context.module.exports, storage };
};

const makeReceipt = ({
  runId = 'run-leader',
  weeklyId = 'week-current',
  score = 19_090,
  wave = 8,
  expiresAt = new Date(2_000_000).toISOString()
} = {}) => ({
  runId,
  gameVersion: 'test',
  runMode: 'weekly-streak',
  startedAt: new Date(900_000).toISOString(),
  finishedAt: new Date(1_000_000).toISOString(),
  expiresAt,
  metrics: {
    score,
    wave,
    durationMs: 100_000,
    enemiesDefeated: 20,
    coinsCollected: 5,
    playerShipId: 'researchhub'
  },
  weeklyCampaign: {
    weeklyId,
    startNodeId: `weekly-run-${weeklyId}-depth-1`,
    finalNodeId: `weekly-run-${weeklyId}-depth-8`,
    completedNodeCount: wave,
    eventCount: 20,
    startRevision: 0,
    finalRevision: 20,
    finalizationReason: 'loss',
    proofHash: 'abc123'
  },
  identity: { kind: 'guest', profileIdHash: 'guest-cookie-hash' },
  integrity: 'server-verified',
  anomalies: [],
  receiptToken: `signed-${runId}`,
  persisted: true
});

const leaderFor = (receipt, proposalId) => ({
  name: 'PILOT',
  score: receipt.metrics.score,
  wave: receipt.metrics.wave,
  runId: receipt.runId,
  verified: true,
  ...(proposalId ? { proposalId } : {})
});

test('a pre-POST guest capability survives an empty reload then recovers from the committed leader', () => {
  const now = 1_000_000;
  const sharedStorage = createStorage();
  const firstLoad = loadRecoveryService({ storage: sharedStorage }).service;
  const receipt = makeReceipt();
  const capability = firstLoad.createWeeklyGuestProposalCapability(receipt, ' pilot ', now);

  assert.ok(capability);
  assert.equal(capability.pilotName, 'PILOT');
  assert.equal(firstLoad.writeWeeklyGuestProposalCapability(capability).length, 1);

  // Simulate the score committing on the server while its client response is
  // lost, followed by a fresh application instance with an initially empty UI.
  const reloaded = loadRecoveryService({ storage: sharedStorage }).service;
  const remembered = reloaded.readWeeklyGuestProposalCapabilities();
  const ambiguous = reloaded.resolveWeeklyGuestProposalCapabilities({
    capabilities: remembered,
    weeklyLeaderboard: [],
    now
  });
  assert.equal(ambiguous.recoverable, null);
  assert.equal(ambiguous.retained.length, 1);
  assert.equal(ambiguous.retained[0].proposalState, 'pending');

  const confirmed = reloaded.resolveWeeklyGuestProposalCapabilities({
    capabilities: ambiguous.retained,
    weeklyLeaderboard: [leaderFor(receipt)],
    now
  });
  assert.equal(confirmed.recoverable.receipt.runId, receipt.runId);
  assert.equal(confirmed.retained.length, 1);
});

test('a lost score response survives one stale positive leader read and recovers on the later exact row', () => {
  const now = 1_000_000;
  const sharedStorage = createStorage();
  const firstLoad = loadRecoveryService({ storage: sharedStorage }).service;
  const receipt = makeReceipt();
  const capability = firstLoad.createWeeklyGuestProposalCapability(receipt, 'Pilot', now);
  firstLoad.writeWeeklyGuestProposalCapability(capability);
  firstLoad.markWeeklyGuestProposalScoreSettled(receipt.runId, now);

  // The score POST committed but its response was lost. A GET issued around
  // the same time can still observe the previous leader from a cache/replica.
  const staleRead = firstLoad.resolveWeeklyGuestProposalCapabilities({
    capabilities: firstLoad.readWeeklyGuestProposalCapabilities(),
    weeklyLeaderboard: [{
      name: 'OLD LEADER',
      score: receipt.metrics.score - 1,
      wave: receipt.metrics.wave,
      runId: 'run-old-leader',
      verified: true
    }],
    now: now + 500
  });
  assert.equal(staleRead.recoverable, null);
  assert.equal(staleRead.retained[0].proposalState, 'pending');
  assert.equal(staleRead.retained[0].leaderMismatchCount, 0);
  firstLoad.writeWeeklyGuestProposalCapabilities(staleRead.retained);

  // A later reconciliation sees the committed exact run and the chooser is
  // recoverable even after a reload between the two responses.
  const reloaded = loadRecoveryService({ storage: sharedStorage }).service;
  const confirmed = reloaded.resolveWeeklyGuestProposalCapabilities({
    capabilities: reloaded.readWeeklyGuestProposalCapabilities(),
    weeklyLeaderboard: [leaderFor(receipt)],
    now: now + 1_500
  });
  assert.equal(confirmed.recoverable.receipt.runId, receipt.runId);
  assert.equal(confirmed.recoverable.proposalState, 'pending');
  assert.equal(confirmed.recoverable.leaderMismatchCount, 0);
});

test('positive different-leader evidence retires the chooser without deleting its ownership receipt', () => {
  const now = 1_000_000;
  const { service } = loadRecoveryService();
  const receipt = makeReceipt();
  const capability = service.createWeeklyGuestProposalCapability(receipt, 'Pilot', now);
  service.writeWeeklyGuestProposalCapability(capability);
  const settled = service.markWeeklyGuestProposalScoreSettled(receipt.runId, now);
  const firstResult = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: settled,
    weeklyLeaderboard: [{
      name: 'ACE',
      score: receipt.metrics.score + 1,
      wave: receipt.metrics.wave,
      runId: 'run-new-leader',
      verified: true
    }],
    now: now + service.WEEKLY_GUEST_PROPOSAL_MISMATCH_GRACE_MS + 1
  });
  assert.equal(firstResult.retained[0].proposalState, 'pending');
  assert.equal(firstResult.retained[0].leaderMismatchCount, 1);

  const result = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: firstResult.retained,
    weeklyLeaderboard: [{
      name: 'ACE',
      score: receipt.metrics.score + 1,
      wave: receipt.metrics.wave,
      runId: 'run-new-leader',
      verified: true
    }],
    now: now + service.WEEKLY_GUEST_PROPOSAL_MISMATCH_GRACE_MS + 2
  });

  assert.equal(result.recoverable, null);
  assert.equal(result.evidence, 'positive-leader');
  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0].proposalState, 'displaced');
  assert.equal(result.retained[0].receipt.receiptToken, receipt.receiptToken);
});

test('slow score settlement resets the grace anchor and a final exact retry still recovers', () => {
  const prewriteAt = 1_000_000;
  const settledAt = prewriteAt + 30_000;
  const { service } = loadRecoveryService();
  const receipt = makeReceipt({ expiresAt: new Date(settledAt + 100_000).toISOString() });
  const capability = service.createWeeklyGuestProposalCapability(receipt, 'Pilot', prewriteAt);
  service.writeWeeklyGuestProposalCapability(capability);
  let retained = service.markWeeklyGuestProposalScoreSettled(receipt.runId, settledAt);
  const oldLeader = [{
    name: 'OLD LEADER',
    score: receipt.metrics.score - 1,
    wave: receipt.metrics.wave,
    runId: 'run-old-leader',
    verified: true
  }];

  // These are the cumulative reconciliation times produced by the App retry
  // cadence. No pre-grace response is allowed to consume mismatch evidence.
  for (const offset of [500, 1_500, 3_500]) {
    const stale = service.resolveWeeklyGuestProposalCapabilities({
      capabilities: retained,
      weeklyLeaderboard: oldLeader,
      now: settledAt + offset
    });
    retained = stale.retained;
    assert.equal(retained[0].proposalState, 'pending');
    assert.equal(retained[0].leaderMismatchCount, 0);
  }

  const firstPostGrace = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: retained,
    weeklyLeaderboard: oldLeader,
    now: settledAt + 6_500
  });
  assert.equal(firstPostGrace.retained[0].proposalState, 'pending');
  assert.equal(firstPostGrace.retained[0].leaderMismatchCount, 1);

  const finalExact = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: firstPostGrace.retained,
    weeklyLeaderboard: [leaderFor(receipt)],
    now: settledAt + 7_500
  });
  assert.equal(finalExact.recoverable.receipt.runId, receipt.runId);
  assert.equal(finalExact.retained[0].proposalState, 'pending');
  assert.equal(finalExact.retained[0].leaderMismatchCount, 0);
});

test('all reconciliation reads staying mismatched displaces only on the final read', () => {
  const settledAt = 1_000_000;
  const { service } = loadRecoveryService();
  const receipt = makeReceipt({ expiresAt: new Date(settledAt + 100_000).toISOString() });
  const capability = service.createWeeklyGuestProposalCapability(receipt, 'Pilot', settledAt - 20_000);
  service.writeWeeklyGuestProposalCapability(capability);
  let retained = service.markWeeklyGuestProposalScoreSettled(receipt.runId, settledAt);
  const oldLeader = [{
    name: 'OTHER',
    score: receipt.metrics.score + 1,
    wave: receipt.metrics.wave,
    runId: 'run-other',
    verified: true
  }];
  const cumulativeRetryOffsets = [500, 1_500, 3_500, 6_500, 7_500];

  cumulativeRetryOffsets.forEach((offset, index) => {
    const resolution = service.resolveWeeklyGuestProposalCapabilities({
      capabilities: retained,
      weeklyLeaderboard: oldLeader,
      now: settledAt + offset
    });
    retained = resolution.retained;
    assert.equal(
      retained[0].proposalState,
      index === cumulativeRetryOffsets.length - 1 ? 'displaced' : 'pending'
    );
  });
  assert.equal(retained[0].leaderMismatchCount, 1);
  assert.equal(retained[0].receipt.receiptToken, receipt.receiptToken);
});

test('expired capabilities are removed while resolved proposal receipts remain until receipt expiry', () => {
  const now = 1_000_000;
  const { service, storage } = loadRecoveryService();
  const activeReceipt = makeReceipt();
  const active = service.createWeeklyGuestProposalCapability(activeReceipt, 'Pilot', now);
  service.writeWeeklyGuestProposalCapability(active);
  const marked = service.markWeeklyGuestProposalCapability(activeReceipt.runId, 'resolved');

  assert.equal(marked.length, 1);
  assert.equal(marked[0].proposalState, 'resolved');
  assert.equal(marked[0].receipt.receiptToken, activeReceipt.receiptToken);

  const expiredReceipt = makeReceipt({ runId: 'run-expired', expiresAt: new Date(now).toISOString() });
  const expired = service.createWeeklyGuestProposalCapability(expiredReceipt, 'Old', now - 1);
  const result = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: [...marked, expired],
    weeklyLeaderboard: [],
    now
  });
  assert.deepEqual(
    Array.from(result.retained, (capability) => capability.receipt.runId),
    [activeReceipt.runId]
  );
  assert.ok(storage.stored.has(storageKey));
});

test('an oldest third-backfill-week receipt survives delayed finalization and the full champion claim window', () => {
  const dayMs = 24 * 60 * 60 * 1_000;
  const weekStartedAt = 1_000_000;
  const weeklyCutoffAt = weekStartedAt + (7 * dayMs);
  const delayedFinalizationAt = weeklyCutoffAt + (21 * dayMs);
  const claimWindowEndsAt = delayedFinalizationAt + (72 * 60 * 60 * 1_000);
  const receiptExpiresAt = weekStartedAt + (33 * dayMs);
  const { service } = loadRecoveryService({ weekKey: 'week-after-cutoff' });
  const receipt = makeReceipt({
    runId: 'run-earliest-week',
    weeklyId: 'week-earliest',
    expiresAt: new Date(receiptExpiresAt).toISOString()
  });
  const capability = service.createWeeklyGuestProposalCapability(
    receipt,
    'Early Pilot',
    weekStartedAt
  );
  const resolved = { ...capability, proposalState: 'resolved' };

  assert.ok(claimWindowEndsAt < receiptExpiresAt);
  const throughClaimWindow = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: [resolved],
    weeklyLeaderboard: [],
    now: claimWindowEndsAt
  });
  assert.equal(throughClaimWindow.retained.length, 1);
  assert.equal(throughClaimWindow.retained[0].receipt.runId, receipt.runId);
  assert.equal(throughClaimWindow.retained[0].receipt.receiptToken, receipt.receiptToken);

  const immediatelyBeforeExpiry = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: throughClaimWindow.retained,
    weeklyLeaderboard: [],
    now: receiptExpiresAt - 1
  });
  assert.equal(immediatelyBeforeExpiry.retained.length, 1);

  const atTokenExpiry = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: immediatelyBeforeExpiry.retained,
    weeklyLeaderboard: [],
    now: receiptExpiresAt
  });
  assert.equal(atTokenExpiry.retained.length, 0);
});

test('the oldest capability survives all twenty possible attempts in the recovery horizon', () => {
  const now = 1_000_000;
  const { service } = loadRecoveryService({ weekKey: 'week-current' });
  const oldestReceipt = makeReceipt({
    runId: 'run-oldest-champion',
    expiresAt: new Date(now + 100_000).toISOString()
  });
  const oldest = service.createWeeklyGuestProposalCapability(oldestReceipt, 'Champion', now);
  const newer = Array.from({ length: 19 }, (_, index) => {
    const receipt = makeReceipt({
      runId: `run-newer-${index}`,
      expiresAt: new Date(now + 100_000).toISOString()
    });
    return service.createWeeklyGuestProposalCapability(receipt, 'Pilot', now + index + 1);
  });

  const stored = service.writeWeeklyGuestProposalCapabilities([...newer, oldest]);
  assert.equal(stored, true);
  const retained = service.readWeeklyGuestProposalCapabilities();
  assert.equal(retained.length, 20);
  assert.ok(retained.some((capability) => capability.receipt.runId === oldestReceipt.runId));
});

test('an old-week proposal is no longer recoverable but its signed receipt remains available', () => {
  const now = 1_000_000;
  const { service } = loadRecoveryService();
  const staleReceipt = makeReceipt({ runId: 'run-old-week', weeklyId: 'week-old' });
  const stale = service.createWeeklyGuestProposalCapability(staleReceipt, 'Old Pilot', now);
  const result = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: [stale],
    weeklyLeaderboard: [],
    now
  });

  assert.equal(result.recoverable, null);
  assert.equal(result.retained.length, 1);
  assert.equal(result.retained[0].proposalState, 'displaced');
  assert.equal(result.retained[0].receipt.receiptToken, staleReceipt.receiptToken);
});

test('a second lower candidate cannot overwrite an older unresolved leader capability', () => {
  const now = 1_000_000;
  const { service } = loadRecoveryService();
  const leaderReceipt = makeReceipt({ runId: 'run-first', score: 20_000 });
  const lowerReceipt = makeReceipt({ runId: 'run-second', score: 1_000 });
  const leaderCapability = service.createWeeklyGuestProposalCapability(leaderReceipt, 'Ace', now);
  service.writeWeeklyGuestProposalCapability(leaderCapability);
  const lowerCapability = service.createWeeklyGuestProposalCapability(lowerReceipt, 'Rookie', now + 1);
  const stored = service.writeWeeklyGuestProposalCapability(lowerCapability);

  assert.equal(stored.length, 2);
  const result = service.resolveWeeklyGuestProposalCapabilities({
    capabilities: stored,
    weeklyLeaderboard: [leaderFor(leaderReceipt)],
    now: now + 2
  });
  assert.equal(result.recoverable.receipt.runId, leaderReceipt.runId);
  assert.equal(result.retained.length, 2);
  assert.equal(
    result.retained.find((entry) => entry.receipt.runId === lowerReceipt.runId).proposalState,
    'displaced'
  );
});

test('guest score submission can fail closed when durable browser storage is unavailable', () => {
  const storage = createStorage();
  storage.setItem = () => { throw new Error('quota denied'); };
  const { service } = loadRecoveryService({ storage });
  const capability = service.createWeeklyGuestProposalCapability(makeReceipt(), 'Pilot', 1_000_000);

  assert.equal(service.writeWeeklyGuestProposalCapability(capability), null);
});
