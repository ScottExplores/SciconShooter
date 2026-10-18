import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';

const require = createRequire(import.meta.url);
const weekly = require('../../api/_lib/weeklyCompetitionService.js');
const attempts = require('../../api/_lib/weeklyRunAttempts.js');
const { eligibleWeeklyScoreRows } = require('../../api/_lib/weeklyScoreEligibility.js');
const { getWeekRange } = require('../../shared/weeklyCompetitionBoundary.js');
const archiveHandler = require('../../api/weekly-competitions.js');
const fundingHandler = require('../../api/_lib/weeklyFundingApprovalRoute.js');
const leaderboardHandler = require('../../api/leaderboard.js');
const { signPayload } = require('../../api/_lib/runReceipts.js');
const { createWalletPurchaseQuote } = require('../../api/_lib/walletPurchases.js');
const wallet = `0x${'a'.repeat(40)}`;
const weekKey = '2026-10-11';
const range = getWeekRange(weekKey);
const runId = (index = 1) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const scoreRow = (index = 1, extra = {}) => ({
  name: `PILOT ${index}`, score: 10_000 - index, wave: 5,
  date: '2026-10-12T20:00:00.000Z', run_id: runId(index),
  verified: true, receipt_hash: 'b'.repeat(64), wallet_address: wallet, ...extra
});
const receiptRow = (row = scoreRow(), extra = {}) => ({
  run_id: row.run_id, score: row.score, wave: row.wave, receipt_hash: row.receipt_hash,
  finished_at: row.date, wallet_address: row.wallet_address,
  receipt_provenance_version: 1, integrity_status: 'server-verified',
  run_mode: 'weekly-streak', test_run: false, ...extra
});
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' }
});
let restoreEnv;
let originalFetch;
beforeEach(() => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RUN_RECEIPT_SECRET', 'ADMIN_SECRET', 'CRON_SECRET', 'BASE_DASHBOARD_API_KEY', 'WEEKLY_CHAMPION_WEBHOOK_URL', 'NODE_ENV'];
  const values = keys.map((key) => [key, process.env[key]]);
  restoreEnv = () => values.forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  Object.assign(process.env, {
    SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only', RUN_RECEIPT_SECRET: 'fixture-receipt-only',
    ADMIN_SECRET: 'fixture-admin', CRON_SECRET: 'fixture-cron', NODE_ENV: 'development'
  });
  delete process.env.BASE_DASHBOARD_API_KEY;
  delete process.env.WEEKLY_CHAMPION_WEBHOOK_URL;
  originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Unexpected fetch: all server tests must use local fixtures'); };
  attempts.clearWeeklyRunAttemptMemoryForTests();
});
afterEach(() => { globalThis.fetch = originalFetch; restoreEnv(); });

const request = async (handler, { method = 'GET', query = {}, body = {}, authorization } = {}) => {
  let result;
  const headers = {};
  const response = {
    statusCode: 200,
    setHeader: (key, value) => { headers[key] = value; },
    end: (text) => { result = { status: response.statusCode, headers, body: text ? JSON.parse(text) : null }; }
  };
  await handler({ method, query, body, headers: {
    host: 'fixture.invalid', origin: 'https://fixture.invalid', 'x-forwarded-proto': 'https',
    ...(authorization ? { authorization } : {})
  } }, response);
  return result;
};

test('public weekly archive GET performs exactly one read and no recovery writes', async () => {
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    calls.push({ input, method: options.method || 'GET' });
    assert.equal(new URL(input).pathname, '/rest/v1/scicon_weekly_competitions');
    return json([{ week_key: '2026-09-27', status: 'funded' }]);
  };
  const response = await request(archiveHandler);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.completedWeekKeys, ['2026-09-27']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'GET');
});

test('weekly eligibility excludes test, legacy, standard, mismatched and wrong-week receipts in development too', async () => {
  const candidates = Array.from({ length: 7 }, (_, index) => scoreRow(index + 1));
  const receipts = candidates.map((row, index) => receiptRow(row, [
    { test_run: true }, { receipt_provenance_version: 0 }, { run_mode: 'standard' },
    { score: row.score + 1 }, { finished_at: '2026-10-19T20:00:00.000Z' },
    { receipt_hash: 'c'.repeat(64) }, {}
  ][index]));
  globalThis.fetch = async (input, options) => {
    assert.match(input, /scicon_run_receipts\?/);
    assert.equal(options.method, undefined);
    return json(receipts);
  };
  assert.deepEqual(await eligibleWeeklyScoreRows(candidates, range), [candidates[6]]);
});

test('winner scan paginates past 100 untrusted historical rows instead of expiring a valid week', async () => {
  const invalid = Array.from({ length: 100 }, (_, index) => scoreRow(index + 1));
  const winner = scoreRow(101);
  const offsets = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('scicon_leaderboard')) {
      assert.equal(url.searchParams.get('verified'), 'eq.true');
      offsets.push(url.searchParams.get('offset'));
      return json(url.searchParams.get('offset') === '0' ? invalid : [winner]);
    }
    assert.ok(url.pathname.endsWith('scicon_run_receipts'));
    return json([receiptRow(winner)]);
  };
  assert.equal((await weekly.readTopEligibleScore(weekKey)).run_id, winner.run_id);
  assert.deepEqual(offsets, ['0', '100']);
});

test('weekly leaderboard exposes the same eligible winner as finalization', async () => {
  const candidates = [scoreRow(1), scoreRow(2)];
  globalThis.fetch = async (input) => new URL(input).pathname.endsWith('scicon_leaderboard')
    ? json(candidates)
    : json([receiptRow(candidates[0], { test_run: true }), receiptRow(candidates[1])]);
  const response = await request(leaderboardHandler, { query: { weekKey } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.weekScores.map((entry) => entry.runId), [runId(2)]);
});

test('score submission uses signed metrics, requires durable provenance in development, and is idempotent', async (t) => {
  t.mock.method(console, 'error', () => {});
  const finishedAt = Date.now() - 1_000;
  const token = signPayload({
    type: 'run-receipt', runId: runId(), runMode: 'weekly-streak', integrity: 'server-verified',
    finishedAt, expiresAt: Date.now() + 60_000, metrics: { score: 1234, wave: 4 },
    weeklyCampaign: { startNodeId: 'weekly-run-node-0' }, identity: { kind: 'guest' }, testRun: false
  });
  const durable = receiptRow(scoreRow(1, { score: 1234, wave: 4, date: new Date(finishedAt).toISOString(),
    receipt_hash: createHash('sha256').update(token).digest('hex') }));
  const stored = [];
  let receiptPresent = false;
  let writes = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('scicon_run_receipts')) return json(receiptPresent ? [durable] : []);
    assert.ok(url.pathname.endsWith('scicon_leaderboard'));
    if (options.method === 'POST') { writes += 1; stored.push(...JSON.parse(options.body)); return json(null); }
    return json(stored);
  };
  const body = { receiptToken: token, name: 'Pilot', score: 999999, wave: 99 };
  const rejected = await request(leaderboardHandler, { method: 'POST', body });
  assert.equal(rejected.body.code, 'WEEKLY_RECEIPT_NOT_DURABLE');
  assert.equal(writes, 0);
  receiptPresent = true;
  const accepted = await request(leaderboardHandler, { method: 'POST', body });
  assert.equal(accepted.status, 200);
  assert.equal(stored[0].score, 1234);
  assert.equal(stored[0].wave, 4);
  assert.equal(accepted.body.monthlyScores[0].score, 1234);
  const duplicate = await request(leaderboardHandler, { method: 'POST', body });
  assert.equal(duplicate.body.alreadySubmitted, true);
  assert.equal(writes, 1);
});

test('finalization rejects the settlement window before querying or writing storage', async () => {
  await assert.rejects(weekly.finalizeWeeklyCompetition(weekKey, {
    observedAt: new Date(range.end.getTime() + 60_000)
  }), (error) => error.statusCode === 409);
});

test('finalization archives a trusted winner even without a proposal snapshot, then becomes idempotent', async (t) => {
  t.mock.method(console, 'error', () => {});
  const winner = scoreRow();
  let competition = null;
  let writes = 0;
  globalThis.fetch = async (input, options = {}) => {
    const path = new URL(input).pathname;
    if (path.endsWith('scicon_leaderboard')) return json([winner]);
    if (path.endsWith('scicon_run_receipts')) return json([receiptRow(winner)]);
    if (path.endsWith('scicon_proposal_cache')) return json([]);
    assert.ok(path.endsWith('scicon_weekly_competitions'));
    if (options.method === 'POST') {
      writes += 1; competition = JSON.parse(options.body); return json([competition]);
    }
    return json(competition ? [competition] : []);
  };
  const observedAt = new Date(range.end.getTime() + 6 * 60_000);
  const first = await weekly.finalizeWeeklyCompetition(weekKey, { observedAt });
  assert.equal(first.finalized, true);
  assert.equal(first.proposalResolutionPending, true);
  assert.equal(first.competition.winner_run_id, winner.run_id);
  assert.equal(Date.parse(first.competition.claim_deadline) - observedAt.getTime(), 72 * 60 * 60_000);
  const second = await weekly.finalizeWeeklyCompetition(weekKey, { observedAt });
  assert.equal(second.finalized, false);
  assert.equal(writes, 1);
});

test('only ADMIN_SECRET approves funding; manual transfer recording is idempotent and cannot change its hash', async (t) => {
  t.mock.method(console, 'error', () => {});
  let competition = { week_key: weekKey, status: 'claimed', proposal_id: '42', winner_run_id: runId(), allocation_rsc: 1000 };
  let writes = 0;
  globalThis.fetch = async (_input, options = {}) => {
    if (options.method === 'PATCH') {
      writes += 1; competition = { ...competition, ...JSON.parse(options.body) };
    }
    return json([competition]);
  };
  const post = (action, extra = {}, authorization = 'Bearer fixture-admin') => request(fundingHandler, {
    method: 'POST', authorization, body: { weekKey, action, ...extra }
  });
  assert.equal((await post('approve', {}, 'Bearer fixture-cron')).status, 401);
  assert.equal(writes, 0);
  const approval = await post('approve');
  assert.equal(approval.body.funding.status, 'pending-funding');
  assert.equal(approval.body.funding.transfersFunds, false);
  const txHash = `0x${'d'.repeat(64)}`;
  assert.equal((await post('record-transfer', { txHash })).body.funding.status, 'funded');
  assert.equal((await post('record-transfer', { txHash })).body.funding.alreadyRecorded, true);
  assert.equal((await post('record-transfer', { txHash: `0x${'e'.repeat(64)}` })).status, 409);
  assert.equal(writes, 2);
});

test('funding approval fails a lost compare-and-set without claiming success', async (t) => {
  t.mock.method(console, 'error', () => {});
  globalThis.fetch = async (_input, options = {}) => json(options.method === 'PATCH' ? [] : [{
    week_key: weekKey, status: 'claimed', winner_run_id: runId(), proposal_id: '42'
  }]);
  const response = await request(fundingHandler, {
    method: 'POST', authorization: 'Bearer fixture-admin', body: { action: 'approve', weekKey }
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'WEEKLY_FUNDING_CONFLICT');
});

test('funded archives missing a transaction hash cannot acknowledge an unpersisted transfer', async (t) => {
  t.mock.method(console, 'error', () => {});
  globalThis.fetch = async (_input, options = {}) => {
    assert.equal(options.method, undefined);
    return json([{ week_key: weekKey, status: 'funded', allocation_tx_hash: null }]);
  };
  const response = await request(fundingHandler, {
    method: 'POST', authorization: 'Bearer fixture-admin',
    body: { action: 'record-transfer', weekKey, txHash: `0x${'d'.repeat(64)}` }
  });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, 'WEEKLY_FUNDING_RECORD_INCOMPLETE');
});

const identity = { kind: 'wallet', profileIdHash: 'a'.repeat(64), walletAddress: wallet };
const binding = (index = 0) => ({
  weeklyId: weekKey, startNodeId: 'weekly-run-node-0',
  createdAtMs: range.start.getTime() + index + 1, resetAtMs: range.end.getTime()
});

test('five equal ranked attempts are enforced locally with idempotent settlement', async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reservations = [];
  for (let index = 0; index < 5; index += 1) {
    reservations.push(await attempts.reserveWeeklyRunAttempt({ identity, binding: binding(index) }));
  }
  assert.equal(reservations[4].attemptsRemaining, 0);
  await assert.rejects(attempts.reserveWeeklyRunAttempt({ identity, binding: binding(5) }), /All Weekly Run attempts/);
  const settled = await attempts.settleWeeklyRunAttempt({ reservation: reservations[0], identity, proofHash: 'c'.repeat(64) });
  const replay = await attempts.settleWeeklyRunAttempt({ reservation: reservations[0], identity, proofHash: 'c'.repeat(64) });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.finishedAtMs, settled.finishedAtMs);
  await assert.rejects(attempts.settleWeeklyRunAttempt({ reservation: reservations[0], identity, proofHash: 'd'.repeat(64) }), /already been finalized/);
});

test('purchased attempt metadata never increases ranked quota or authorizes a sixth reservation', async () => {
  globalThis.fetch = async (input) => {
    if (input.includes('scicon_get_weekly_run_quota')) return json({ freeAttempts: 5, purchasedAttempts: 20, attemptsUsed: 5 });
    return json({ reservationId: runId(1), runId: runId(2), attemptNumber: 6,
      freeAttempts: 5, purchasedAttempts: 20, attemptsUsed: 6 });
  };
  const quota = await attempts.getWeeklyRunQuota({ address: wallet });
  assert.equal(quota.purchasedAttempts, 20);
  assert.equal(quota.attemptsRemaining, 0);
  await assert.rejects(attempts.reserveWeeklyRunAttempt({ identity, binding: binding() }), (error) => (
    error.statusCode === 409 && error.details.includes('weekly_run_attempts_exhausted')
  ));
});

test('weekly attempt purchases are disabled before any storage or payment request', async () => {
  await assert.rejects(createWalletPurchaseQuote({ address: wallet, skuId: 'weekly-run-attempt' }), (error) => (
    error.statusCode === 409 && error.code === 'weekly_attempt_purchases_disabled'
  ));
});

test('generated Weekly admission rejects alternate ships before spending an attempt; Campaign ships remain available', async (t) => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const profiles = require('../../api/_lib/walletProfiles.js');
  t.mock.method(profiles, 'createWeeklyCampaignStreakRunBinding', () => ({
    ...binding(), currentNodeId: 'weekly-run-node-0', revision: 1,
    visitedNodeCount: 1, committedRouteCount: 0, scoreEventCount: 0, scoreElapsedMs: 0
  }));
  const modulePath = require.resolve('../../api/_lib/runReceipts.js');
  const original = require.cache[modulePath];
  delete require.cache[modulePath];
  const receipts = require(modulePath);
  t.after(() => { require.cache[modulePath] = original; });
  const options = { runMode: 'weekly-streak', weeklyCampaignProof: {}, profileId: 'pilot:fixturetest' };
  await assert.rejects(receipts.createReservedRunStart('fixture', { ...options, playerShipId: 'bio' }),
    (error) => error.statusCode === 422 && error.code === 'WEEKLY_RANKED_SHIP_REQUIRED');
  assert.throws(() => receipts.createRunStart('fixture', { ...options, playerShipId: 'eth' }),
    (error) => error.code === 'WEEKLY_RANKED_SHIP_REQUIRED');
  const session = await receipts.createReservedRunStart('fixture', { ...options, playerShipId: 'researchhub' });
  assert.equal(session.weeklyAttempt.attemptNumber, 1);
  assert.equal(receipts.verifyRunStart(session.startToken).playerShipId, 'researchhub');
  assert.equal(receipts.createRunStart('fixture', { playerShipId: 'bio' }).playerShipId, 'bio');
});

test('claim challenge binds winner, wallet and proposal; commit filters the claim deadline and replays safely', async (t) => {
  const signatures = require('../../api/_lib/baseSignatures.js');
  const proposals = require('../../api/_lib/researchHubEligibility.js');
  t.mock.method(signatures, 'verifyBaseMessage', async ({ address, signature }) => address === wallet && signature === 'fixture-signature');
  t.mock.method(proposals, 'findEligibleProposal', async () => ({ id: '42', title: 'Open research', url: 'https://www.researchhub.com/fund', author: 'Researcher' }));
  delete require.cache[require.resolve('../../api/weekly-claim.js')];
  const claimHandler = require('../../api/weekly-claim.js');
  const winner = scoreRow();
  let competition = { week_key: weekKey, winner_run_id: runId(), winner_wallet: wallet,
    winner_name: winner.name, status: 'finalized', claim_deadline: new Date(Date.now() + 60_000).toISOString() };
  let challenge;
  let deadlineFiltered = false;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('scicon_leaderboard')) return json([winner]);
    if (url.pathname.endsWith('scicon_run_receipts')) return json([receiptRow(winner)]);
    if (url.pathname.endsWith('scicon_wallet_nonces')) {
      if (options.method === 'POST') { challenge = JSON.parse(options.body); return json(null); }
      if (options.method === 'PATCH') challenge = { ...challenge, ...JSON.parse(options.body) };
      return json([challenge]);
    }
    assert.ok(url.pathname.endsWith('scicon_weekly_competitions'));
    if (options.method === 'PATCH') {
      deadlineFiltered = url.searchParams.get('claim_deadline')?.startsWith('gt.');
      competition = { ...competition, ...JSON.parse(options.body) };
    }
    return json([competition]);
  };
  const response = await request(claimHandler, { method: 'POST', body: { action: 'challenge', weekKey, proposalId: '42', address: wallet } });
  assert.equal(response.status, 200);
  assert.match(response.body.message, /Proposal: 42 - Open research/);
  const body = { action: 'claim', weekKey, proposalId: '42', address: wallet,
    challengeId: response.body.challengeId, signature: 'fixture-signature' };
  assert.equal((await request(claimHandler, { method: 'POST', body })).body.claim.status, 'claimed');
  assert.equal(deadlineFiltered, true);
  assert.equal((await request(claimHandler, { method: 'POST', body })).body.claim.replayed, true);
});
