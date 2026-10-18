const { createWeeklyDurableFixtures, weeklyFixtureId } = require('./helpers/weeklyDurableFixtures.cjs');
const weeklyFixtures = createWeeklyDurableFixtures();
const test = require('node:test');
test.beforeEach(() => weeklyFixtures.reset());
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'weekly-proposal-session-reuse-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = 'weekly-proposal-profile-session-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');
const leaderboardHandler = require('../api/leaderboard');

const WALLET = '0x1111111111111111111111111111111111111111';

const makeReceipt = (runId) => weeklyFixtures.signReceipt({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  runMode: 'weekly-streak',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: {
    score: 4321,
    wave: 4,
    durationMs: 60_000,
    enemiesDefeated: 20,
    coinsCollected: 12
  },
  integrity: 'server-verified'
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return data; },
  async text() { return status === 204 ? '' : JSON.stringify(data); }
});

const request = async ({ body, cookie, ip }) => {
  const response = makeResponse();
  await leaderboardHandler({
    method: 'POST',
    body,
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: ip }
  }, response);
  return response;
};

test('an authenticated wallet-profile session selects the weekly proposal without a second signature', async () => {
  const runId = crypto.randomUUID();
  const receiptToken = makeReceipt(runId);
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(WALLET))}`;
  let selected = false;
  let nonceRequests = 0;
  const originalFetch = global.fetch;

  const leaderboardRow = () => ({
    name: 'PILOT',
    score: 4321,
    wave: 4,
    date: new Date().toISOString(),
    wallet_address: WALLET,
    donated: false,
    proposal_id: selected ? '321' : null,
    proposal_title: selected ? 'Open Science Target' : null,
    proposal_url: selected ? 'https://www.researchhub.com/post/321/open-science-target' : null,
    proposal_author: selected ? 'Ada Researcher' : null,
    proposal_image_url: null,
    run_id: runId,
    verified: true,
    receipt_hash: 'hash'
  });

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const value = String(url);
    if (value.includes('scicon_wallet_nonces')) {
      nonceRequests += 1;
      return jsonResponse([], 500);
    }
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 321,
          title: 'Open Science Target',
          slug: 'open-science-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        },
        author: { first_name: 'Ada', last_name: 'Researcher' }
      }] });
    }
    if (options.method === 'PATCH') {
      selected = true;
      return jsonResponse([leaderboardRow()]);
    }
    return jsonResponse([leaderboardRow()]);
  });

  try {
    const challengeResponse = await request({
      body: {
        action: 'select-proposal-challenge',
        proposalId: '321',
        receiptToken,
        address: WALLET
      },
      cookie,
      ip: '127.0.2.1'
    });
    assert.equal(challengeResponse.statusCode, 200);
    assert.deepEqual(challengeResponse.body.challenge, {
      signatureRequired: false,
      sessionAuthorized: true
    });

    const selectionResponse = await request({
      body: {
        action: 'select-proposal',
        proposalId: '321',
        receiptToken
      },
      cookie,
      ip: '127.0.2.1'
    });
    assert.equal(selectionResponse.statusCode, 200);
    assert.equal(selectionResponse.body.monthlyScores[0].proposalId, '321');
    assert.equal(nonceRequests, 0, 'the existing authenticated session bypasses challenge storage');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a different wallet session cannot authorize the weekly leader proposal', async () => {
  const runId = crypto.randomUUID();
  const otherWallet = '0x2222222222222222222222222222222222222222';
  const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(otherWallet))}`;
  const originalFetch = global.fetch;
  let nonceWrite = false;

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const value = String(url);
    if (value.includes('scicon_wallet_nonces') && options.method === 'POST') {
      nonceWrite = true;
      return jsonResponse(null, 204);
    }
    return jsonResponse([{
      name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(),
      wallet_address: WALLET, donated: false, proposal_id: null,
      proposal_title: null, proposal_url: null, proposal_author: null,
      proposal_image_url: null, run_id: runId, verified: true, receipt_hash: 'hash'
    }]);
  });

  try {
    const response = await request({
      body: {
        action: 'select-proposal-challenge',
        proposalId: '321',
        receiptToken: makeReceipt(runId),
        address: otherWallet
      },
      cookie,
      ip: '127.0.2.2'
    });
    assert.equal(response.statusCode, 403);
    assert.match(response.body.error, /Base Account associated with this weekly-leading run/i);
    assert.equal(nonceWrite, false);
  } finally {
    global.fetch = originalFetch;
  }
});
