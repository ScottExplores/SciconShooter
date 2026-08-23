const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'mint-authorization-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.MISSION_RECORD_CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
process.env.MINT_AUTHORIZER_PRIVATE_KEY = `0x${'12'.repeat(32)}`;
process.env.MISSION_RECORD_CHAIN_ID = '8453';
process.env.WALLET_PROFILE_AUTH_SECRET = 'mint-authorization-wallet-profile-secret';

const { signPayload } = require('../api/_lib/runReceipts');
const mintAuthorizationHandler = require('../api/mint-authorization');

const runId = '11111111-2222-4333-8444-555555555555';
const wallet = '0x2222222222222222222222222222222222222222';
const walletHeaders = (address = wallet, extra = {}) => {
  const { SESSION_COOKIE_NAME, createWalletProfileSession } = require('../api/_lib/walletProfileAuth');
  return {
    host: 'sciconshooter.xyz',
    cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(createWalletProfileSession(address))}`,
    ...extra
  };
};
const receiptToken = signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  runMode: 'standard',
  startedAt: Date.now() - 30_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 1234, wave: 2, durationMs: 30_000, enemiesDefeated: 12, coinsCollected: 8, playerShipId: 'researchhub' },
  identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
  integrity: 'server-verified'
});

const storedReceiptRow = (token = receiptToken, overrides = {}) => {
  const { verifyRunReceipt } = require('../api/_lib/runReceipts');
  const receipt = verifyRunReceipt(token);
  return {
    run_id: receipt.runId,
    score: receipt.metrics.score,
    wave: receipt.metrics.wave,
    duration_ms: receipt.metrics.durationMs,
    enemies_defeated: receipt.metrics.enemiesDefeated,
    coins_collected: receipt.metrics.coinsCollected,
    player_ship_id: receipt.metrics.playerShipId,
    game_version: receipt.gameVersion,
    run_mode: receipt.runMode,
    test_run: Boolean(receipt.testRun),
    receipt_provenance_version: 1,
    integrity_status: receipt.integrity,
    receipt_hash: require('node:crypto').createHash('sha256').update(token).digest('hex'),
    wallet_address: null,
    ...overrides
  };
};

const canonicalPayload = require('../api/_lib/runReceipts').verifyRunReceipt(receiptToken);
const reissuedReceiptToken = signPayload({
  ...canonicalPayload,
  finishedAt: canonicalPayload.finishedAt + 1_000,
  expiresAt: canonicalPayload.expiresAt + 86_400_000
});

const jsonResponse = (data) => ({
  ok: true,
  status: 200,
  async json() { return data; },
  async text() { return JSON.stringify(data); }
});

const makeResponse = () => ({
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = JSON.parse(body); }
});

test('authorizes a canonical wallet-history reissue even though its token hash changed', async () => {
  const originalFetch = global.fetch;
  let receiptWallet = null;
  let pendingSponsored = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) {
      if (options.method === 'PATCH') {
        if (receiptWallet) return jsonResponse([]);
        const body = JSON.parse(options.body);
        receiptWallet = body.wallet_address;
        return jsonResponse([{
          wallet_address: receiptWallet,
          wallet_claimed_at: body.wallet_claimed_at
        }]);
      }
      return jsonResponse([storedReceiptRow(receiptToken, { wallet_address: receiptWallet })]);
    }
    if (value.includes('scicon_mint_records')) {
      if (options.method === 'POST') pendingSponsored = JSON.parse(options.body).sponsored;
      return jsonResponse(options.method === 'POST' ? null : []);
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: walletHeaders(),
      body: { recordType: 'mission', address: wallet, receiptToken }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 1234);
    assert.equal(res.body.wave, 2);
    assert.match(res.body.signature, /^0x[0-9a-f]+$/i);
    assert.equal(res.body.sponsoredEligible, false);
    assert.equal(pendingSponsored, false);
    assert.equal(receiptWallet, wallet);
  } finally {
    global.fetch = originalFetch;
  }
});

test('does not authorize a run already attached to another wallet', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) {
      return jsonResponse([storedReceiptRow(receiptToken, {
        wallet_address: '0x3333333333333333333333333333333333333333'
      })]);
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: walletHeaders(),
      body: { recordType: 'mission', address: wallet, receiptToken }
    }, res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /another Base Account/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rejects a second valid token whose metrics conflict with the canonical stored receipt', async () => {
  const conflictingToken = signPayload({
    type: 'run-receipt',
    runId,
    gameVersion: 'test',
    runMode: 'standard',
    startedAt: Date.now() - 30_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: {
      score: 4321,
      wave: 3,
      durationMs: 30_000,
      enemiesDefeated: 12,
      coinsCollected: 8,
      playerShipId: 'researchhub'
    },
    identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
    integrity: 'server-verified'
  });
  const originalFetch = global.fetch;
  let mintQueries = 0;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) return jsonResponse([storedReceiptRow()]);
    if (value.includes('scicon_mint_records')) mintQueries += 1;
    return jsonResponse([]);
  };
  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: walletHeaders(),
      socket: { remoteAddress: '203.0.113.101' },
      body: { recordType: 'mission', address: wallet, receiptToken: conflictingToken }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'MINT_RECEIPT_NOT_CANONICAL');
    assert.equal(mintQueries, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('review receipts cannot authorize a mint even when their row is persisted', async () => {
  const reviewToken = signPayload({
    type: 'run-receipt',
    runId: '99999999-2222-4333-8444-555555555555',
    gameVersion: 'test',
    runMode: 'standard',
    startedAt: Date.now() - 30_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: {
      score: 100,
      wave: 1,
      durationMs: 30_000,
      enemiesDefeated: 1,
      coinsCollected: 0,
      playerShipId: 'researchhub'
    },
    identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
    integrity: 'review'
  });
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('scicon_run_receipts')) {
      return jsonResponse([storedReceiptRow(reviewToken, { integrity_status: 'review' })]);
    }
    return jsonResponse([]);
  };
  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: walletHeaders(),
      socket: { remoteAddress: '203.0.113.102' },
      body: { recordType: 'mission', address: wallet, receiptToken: reviewToken }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'MINT_RECEIPT_NOT_CANONICAL');
  } finally {
    global.fetch = originalFetch;
  }
});

test('only the project wallet can mint a Pilot Test record', async () => {
  const testReceiptToken = signPayload({
    type: 'run-receipt',
    runId: crypto.randomUUID(),
    gameVersion: 'test',
    runMode: 'standard',
    startedAt: Date.now() - 30_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: { score: 9999, wave: 4, durationMs: 30_000, enemiesDefeated: 1, coinsCollected: 1, playerShipId: 'researchhub' },
    identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
    testRun: true,
    integrity: 'server-verified'
  });
  const res = makeResponse();

  await mintAuthorizationHandler({
    method: 'POST',
    headers: walletHeaders(),
    body: { recordType: 'mission', address: wallet, receiptToken: testReceiptToken }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /project wallet/i);
});

test('foreign origins are rejected before receipt or mint persistence', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return jsonResponse([]);
  };

  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: walletHeaders(wallet, {
        host: 'www.sciconshooter.xyz',
        origin: 'https://attacker.example'
      }),
      body: { recordType: 'mission', address: wallet, receiptToken: reissuedReceiptToken }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(fetchCount, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('mint authorization requests are bounded per client', async () => {
  const headers = {
    host: 'www.sciconshooter.xyz',
    origin: 'https://www.sciconshooter.xyz',
    'x-forwarded-for': '203.0.113.91'
  };
  for (let index = 0; index < 20; index += 1) {
    const res = makeResponse();
    await mintAuthorizationHandler({ method: 'POST', headers, body: {} }, res);
    assert.equal(res.statusCode, 400);
  }
  const limited = makeResponse();
  await mintAuthorizationHandler({ method: 'POST', headers, body: {} }, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'MINT_AUTHORIZATION_RATE_LIMITED');
  assert.ok(Number(limited.headers['Retry-After']) >= 1);
});
