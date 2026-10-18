const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const signaturesPath = require.resolve('../api/_lib/baseSignatures');
const notificationsPath = require.resolve('../api/_lib/baseNotifications');
const weeklyClaimPath = require.resolve('../api/weekly-claim');
const originalSignaturesCache = require.cache[signaturesPath];
const originalNotificationsCache = require.cache[notificationsPath];
const notificationCalls = [];

require.cache[signaturesPath] = {
  id: signaturesPath,
  filename: signaturesPath,
  loaded: true,
  exports: { verifyBaseMessage: async ({ signature }) => signature === '0xvalid' }
};
require.cache[notificationsPath] = {
  id: notificationsPath,
  filename: notificationsPath,
  loaded: true,
  exports: {
    sendBaseNotificationBroadcast: async (payload) => {
      notificationCalls.push(payload);
      return { configured: true, sentCount: 1, failedCount: 0 };
    }
  }
};
delete require.cache[weeklyClaimPath];

const weeklyClaimHandler = require('../api/weekly-claim');

const wallet = '0x1111111111111111111111111111111111111111';
const weekKey = '2026-08-16';

const proposalEntry = (id, title) => ({
  content_object: {
    id,
    title,
    slug: title.toLowerCase().replaceAll(' ', '-'),
    fundraise: {
      status: 'OPEN',
      end_date: '2099-01-01T00:00:00.000Z'
    }
  },
  author: { first_name: 'Ada', last_name: 'Researcher' }
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return data; },
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const requestHeaders = (ipSuffix) => ({
  host: 'www.sciconshooter.xyz',
  origin: 'https://www.sciconshooter.xyz',
  'x-forwarded-for': `203.0.113.${ipSuffix}`
});

const makeScenario = ({
  duplicateCommitRepresentation = false,
  hideNonceRepresentation = false
} = {}) => {
  const runId = crypto.randomUUID();
  const state = {
    competition: {
      week_key: weekKey,
      status: 'finalized',
      winner_run_id: runId,
      winner_name: 'PILOT',
      winner_wallet: null,
      claim_deadline: '2099-01-01T00:00:00.000Z',
      allocation_rsc: 100,
      proposal_id: null,
      proposal_title: null,
      proposal_url: null,
      proposal_author: null,
      proposal_image_url: null,
      updated_at: '2026-08-16T20:00:00.000Z'
    },
    nonces: new Map(),
    noncePatchHeaders: [],
    noncePatchUrls: [],
    competitionPatchCount: 0,
    competitionPatchUrls: [],
    currentLeaderRunId: runId,
    receiptWallet: wallet,
    commitBarrier: null
  };

  const enableCommitBarrier = (target = 2) => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    state.commitBarrier = { arrivals: 0, target, promise, release };
  };

  const fakeFetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || 'GET';

    if (parsed.hostname === 'backend.prod.researchhub.com') {
      return jsonResponse({
        results: [
          proposalEntry(101, 'Open Alpha Research'),
          proposalEntry(202, 'Open Beta Research')
        ],
        next: null
      });
    }

    const table = parsed.pathname.split('/').pop();
    if (table === 'scicon_weekly_competitions') {
      if (method !== 'PATCH') return jsonResponse([{ ...state.competition }]);

      state.competitionPatchCount += 1;
      state.competitionPatchUrls.push(parsed.toString());
      const barrier = state.commitBarrier;
      if (barrier) {
        barrier.arrivals += 1;
        if (barrier.arrivals === barrier.target) barrier.release();
        await barrier.promise;
      }

      const requiresFinalized = parsed.searchParams.get('status') === 'eq.finalized';
      if (requiresFinalized && state.competition.status !== 'finalized') return jsonResponse([]);
      const expectedWinnerRunId = String(parsed.searchParams.get('winner_run_id') || '').replace(/^eq\./, '');
      if (expectedWinnerRunId && expectedWinnerRunId !== state.competition.winner_run_id) {
        return jsonResponse([]);
      }
      const expectedUpdatedAt = String(parsed.searchParams.get('updated_at') || '').replace(/^eq\./, '');
      if (expectedUpdatedAt && expectedUpdatedAt !== state.competition.updated_at) return jsonResponse([]);
      Object.assign(state.competition, JSON.parse(options.body));
      const committedRow = { ...state.competition };
      return jsonResponse(duplicateCommitRepresentation
        ? [committedRow, { ...committedRow }]
        : [committedRow]);
    }

    if (table === 'scicon_run_receipts') {
      return jsonResponse([{
        run_id: runId,
        wallet_address: state.receiptWallet,
        receipt_provenance_version: 1,
        receipt_hash: 'a'.repeat(64), score: 9000, wave: 7,
        integrity_status: 'server-verified', run_mode: 'weekly-streak',
        test_run: false, finished_at: '2026-08-20T00:00:00.000Z'
      }]);
    }

    if (table === 'scicon_leaderboard') {
      return jsonResponse([{
        name: 'PILOT',
        score: 9000,
        wave: 7,
        date: '2026-08-20T00:00:00.000Z',
        wallet_address: wallet,
        run_id: state.currentLeaderRunId,
        verified: true,
        receipt_hash: 'a'.repeat(64),
        proposal_id: null,
        proposal_title: null,
        proposal_url: null,
        proposal_author: null,
        proposal_image_url: null
      }]);
    }

    if (table === 'scicon_wallet_nonces') {
      if (method === 'POST') {
        const nonce = { ...JSON.parse(options.body), used_at: null };
        state.nonces.set(nonce.challenge_id, nonce);
        return jsonResponse(null, 204);
      }

      const challengeId = String(parsed.searchParams.get('challenge_id') || '').replace(/^eq\./, '');
      const nonce = state.nonces.get(challengeId);
      if (method !== 'PATCH') return jsonResponse(nonce ? [{ ...nonce }] : []);

      state.noncePatchHeaders.push(options.headers?.Prefer || options.headers?.prefer || '');
      state.noncePatchUrls.push(parsed.toString());
      if (!nonce || nonce.used_at) return jsonResponse([]);
      Object.assign(nonce, JSON.parse(options.body));
      return jsonResponse(hideNonceRepresentation ? [] : [{ ...nonce }]);
    }

    throw new Error(`Unexpected request: ${method} ${parsed}`);
  };

  return { enableCommitBarrier, fakeFetch, runId, state };
};

const challenge = async (headers, proposalId) => {
  const res = makeResponse();
  await weeklyClaimHandler({
    method: 'POST',
    headers,
    body: { action: 'challenge', weekKey, proposalId, address: wallet }
  }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  return res.body;
};

const claim = async (headers, proposalId, claimChallenge) => {
  const res = makeResponse();
  await weeklyClaimHandler({
    method: 'POST',
    headers,
    body: {
      action: 'claim',
      weekKey,
      proposalId,
      address: wallet,
      challengeId: claimChallenge.challengeId,
      signature: '0xvalid'
    }
  }, res);
  return res;
};

test('concurrent different-proposal claims have one atomic winner, one notification, and safe replay semantics', async () => {
  const scenario = makeScenario();
  const headers = requestHeaders(201);
  const originalFetch = global.fetch;
  notificationCalls.length = 0;
  global.fetch = scenario.fakeFetch;

  try {
    const alphaChallenge = await challenge(headers, '101');
    const betaChallenge = await challenge(headers, '202');
    scenario.enableCommitBarrier(2);

    const responses = await Promise.all([
      claim(headers, '101', alphaChallenge),
      claim(headers, '202', betaChallenge)
    ]);
    const winner = responses.find((response) => response.statusCode === 200);
    const loser = responses.find((response) => response.statusCode === 409);

    assert.ok(winner, 'one claim succeeds');
    assert.ok(loser, 'the conflicting claim is rejected');
    assert.equal(loser.body.code, 'WEEKLY_CLAIM_ALREADY_RESOLVED');
    assert.equal(responses.filter((response) => response.statusCode === 200).length, 1);
    assert.equal(scenario.state.competition.status, 'claimed');
    assert.ok(['101', '202'].includes(scenario.state.competition.proposal_id));
    assert.equal(notificationCalls.length, 1, 'only the compare-and-set winner broadcasts');
    assert.equal(scenario.state.competitionPatchCount, 2);
    assert.ok(scenario.state.competitionPatchUrls.every((url) => (
      url.includes(`winner_run_id=eq.${scenario.runId}`)
      && url.includes('updated_at=eq.')
      && url.includes('status=eq.finalized')
    )));
    assert.equal([...scenario.state.nonces.values()].filter((nonce) => nonce.used_at).length, 2);
    assert.deepEqual(scenario.state.noncePatchHeaders, [
      'return=representation',
      'return=representation'
    ]);
    assert.ok(scenario.state.noncePatchUrls.every((url) => (
      url.includes('used_at=is.null') && url.includes('expires_at=gt.')
    )));

    const winnerProposalId = scenario.state.competition.proposal_id;
    const winnerChallenge = winnerProposalId === '101' ? alphaChallenge : betaChallenge;
    const losingProposalId = winnerProposalId === '101' ? '202' : '101';
    const losingChallenge = winnerProposalId === '101' ? betaChallenge : alphaChallenge;

    const replay = await claim(headers, winnerProposalId, winnerChallenge);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.body.claim.replayed, true);
    assert.equal(replay.body.claim.proposal.id, winnerProposalId);
    assert.equal(notificationCalls.length, 1, 'lost-response replay does not rebroadcast');

    const conflictingReplay = await claim(headers, losingProposalId, losingChallenge);
    assert.equal(conflictingReplay.statusCode, 409);
    assert.equal(conflictingReplay.body.code, 'WEEKLY_CLAIM_ALREADY_RESOLVED');
    assert.equal(notificationCalls.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a claim refuses to commit when nonce consumption is not returned and observed', async () => {
  const scenario = makeScenario({ hideNonceRepresentation: true });
  const headers = requestHeaders(202);
  const originalFetch = global.fetch;
  notificationCalls.length = 0;
  global.fetch = scenario.fakeFetch;

  try {
    const claimChallenge = await challenge(headers, '101');
    const response = await claim(headers, '101', claimChallenge);

    assert.equal(response.statusCode, 410);
    assert.equal(response.body.code, 'WEEKLY_CLAIM_CHALLENGE_STALE');
    assert.equal(scenario.state.competition.status, 'finalized');
    assert.equal(scenario.state.competitionPatchCount, 0);
    assert.ok(scenario.state.nonces.get(claimChallenge.challengeId).used_at);
    assert.deepEqual(scenario.state.noncePatchHeaders, ['return=representation']);
    assert.equal(notificationCalls.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a challenge cannot be claimed after the finalized winner becomes stale', async () => {
  const scenario = makeScenario();
  const headers = requestHeaders(207);
  const originalFetch = global.fetch;
  notificationCalls.length = 0;
  global.fetch = scenario.fakeFetch;

  try {
    const claimChallenge = await challenge(headers, '101');
    scenario.state.currentLeaderRunId = crypto.randomUUID();
    const response = await claim(headers, '101', claimChallenge);

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, 'WEEKLY_CLAIM_WINNER_CHANGED');
    assert.equal(scenario.state.competition.status, 'finalized');
    assert.equal(scenario.state.competitionPatchCount, 0);
    assert.equal(scenario.state.nonces.get(claimChallenge.challengeId).used_at, null);
    assert.equal(notificationCalls.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('only the wallet associated with the exact winning receipt can claim a guest winner', async () => {
  const scenario = makeScenario();
  const headers = requestHeaders(208);
  const originalFetch = global.fetch;
  const wrongWallet = '0x2222222222222222222222222222222222222222';
  notificationCalls.length = 0;
  global.fetch = scenario.fakeFetch;

  try {
    // The archive wallet is denormalized and must never override the exact
    // immutable run-receipt association used for authorization.
    scenario.state.competition.winner_wallet = wrongWallet;
    const rejected = makeResponse();
    await weeklyClaimHandler({
      method: 'POST',
      headers,
      body: { action: 'challenge', weekKey, proposalId: '101', address: wrongWallet }
    }, rejected);
    assert.equal(rejected.statusCode, 403);
    assert.equal(rejected.body.code, 'WEEKLY_CLAIM_WRONG_WALLET');
    assert.equal(scenario.state.nonces.size, 0);

    scenario.state.competition.winner_wallet = wallet;
    const exactReceiptChallenge = await challenge(headers, '101');
    const accepted = await claim(headers, '101', exactReceiptChallenge);
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.body.claim.walletAddress, wallet);
    assert.equal(accepted.body.claim.proposal.id, '101');
    assert.equal(accepted.body.claim.status, 'claimed');
    assert.equal(scenario.state.competition.winner_wallet, wallet);
    assert.notEqual(scenario.state.competition.status, 'funded');
    assert.equal(notificationCalls.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a competition commit must return exactly one winning row before success or notification', async () => {
  const scenario = makeScenario({ duplicateCommitRepresentation: true });
  const headers = requestHeaders(206);
  const originalFetch = global.fetch;
  notificationCalls.length = 0;
  global.fetch = scenario.fakeFetch;

  try {
    const claimChallenge = await challenge(headers, '101');
    const response = await claim(headers, '101', claimChallenge);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.code, 'WEEKLY_CLAIM_COMMIT_UNCONFIRMED');
    assert.equal(notificationCalls.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('foreign origins are rejected before claim state is read or changed', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return jsonResponse([]);
  };

  try {
    const res = makeResponse();
    await weeklyClaimHandler({
      method: 'POST',
      headers: {
        host: 'www.sciconshooter.xyz',
        origin: 'https://attacker.example',
        'x-forwarded-for': '203.0.113.203'
      },
      body: { action: 'challenge', weekKey, proposalId: '101', address: wallet }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(fetchCount, 0);

    const downgraded = makeResponse();
    await weeklyClaimHandler({
      method: 'POST',
      headers: {
        host: 'www.sciconshooter.xyz',
        origin: 'http://www.sciconshooter.xyz',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '203.0.113.203'
      },
      body: { action: 'challenge', weekKey, proposalId: '101', address: wallet }
    }, downgraded);
    assert.equal(downgraded.statusCode, 403);
    assert.equal(fetchCount, 0);

    const missingOrigin = makeResponse();
    await weeklyClaimHandler({
      method: 'POST',
      headers: {
        host: 'www.sciconshooter.xyz',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '203.0.113.203'
      },
      body: { action: 'challenge', weekKey, proposalId: '101', address: wallet }
    }, missingOrigin);
    assert.equal(missingOrigin.statusCode, 403);
    assert.equal(fetchCount, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('weekly champion challenge and commit traffic are independently bounded per client', async () => {
  const headers = requestHeaders(204);
  for (let index = 0; index < 30; index += 1) {
    const res = makeResponse();
    await weeklyClaimHandler({ method: 'POST', headers, body: { action: 'unknown' } }, res);
    assert.equal(res.statusCode, 400);
  }

  const limited = makeResponse();
  await weeklyClaimHandler({ method: 'POST', headers, body: { action: 'unknown' } }, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'WEEKLY_CLAIM_RATE_LIMITED');
  assert.ok(Number(limited.headers['Retry-After']) >= 1);

  const claimHeaders = requestHeaders(205);
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    for (let index = 0; index < 20; index += 1) {
      const res = makeResponse();
      await weeklyClaimHandler({ method: 'POST', headers: claimHeaders, body: { action: 'claim' } }, res);
      assert.equal(res.statusCode, 400);
    }
  } finally {
    console.error = originalConsoleError;
  }
  const claimLimited = makeResponse();
  await weeklyClaimHandler({
    method: 'POST', headers: claimHeaders, body: { action: 'claim' }
  }, claimLimited);
  assert.equal(claimLimited.statusCode, 429);
  assert.equal(claimLimited.body.code, 'WEEKLY_CLAIM_RATE_LIMITED');
});

test.after(() => {
  delete require.cache[weeklyClaimPath];
  if (originalSignaturesCache) require.cache[signaturesPath] = originalSignaturesCache;
  else delete require.cache[signaturesPath];
  if (originalNotificationsCache) require.cache[notificationsPath] = originalNotificationsCache;
  else delete require.cache[notificationsPath];
});
