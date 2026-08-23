const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'run-wallet-association-race-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.MISSION_RECORD_CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
process.env.MINT_AUTHORIZER_PRIVATE_KEY = `0x${'12'.repeat(32)}`;
process.env.MISSION_RECORD_CHAIN_ID = '8453';

const signaturesPath = require.resolve('../api/_lib/baseSignatures');
const mintRecoveryPath = require.resolve('../api/_lib/missionMintRecovery');
const runClaimsPath = require.resolve('../api/run-claims');
const originalSignaturesCache = require.cache[signaturesPath];
const originalMintRecoveryCache = require.cache[mintRecoveryPath];
require.cache[signaturesPath] = {
  id: signaturesPath,
  filename: signaturesPath,
  loaded: true,
  exports: { verifyBaseMessage: async ({ signature }) => signature === '0xvalid' }
};
require.cache[mintRecoveryPath] = {
  id: mintRecoveryPath,
  filename: mintRecoveryPath,
  loaded: true,
  exports: { recoverPendingMissionMint: async () => null }
};
delete require.cache[runClaimsPath];

const { signPayload, createRunIdentityBinding } = require('../api/_lib/runReceipts');
const {
  GUEST_COOKIE_NAME,
  createGuestIdentityToken,
  verifyGuestIdentityToken
} = require('../api/_lib/guestIdentity');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');
const runClaimsHandler = require('../api/run-claims');
const mintAuthorizationHandler = require('../api/mint-authorization');

const walletA = '0x2222222222222222222222222222222222222222';
const walletB = '0x3333333333333333333333333333333333333333';

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const makeScenario = (ipSuffix) => {
  const guestToken = createGuestIdentityToken();
  const guest = verifyGuestIdentityToken(guestToken);
  const runId = crypto.randomUUID();
  const receiptToken = signPayload({
    type: 'run-receipt',
    runId,
    gameVersion: 'association-race-test',
    runMode: 'standard',
    startedAt: Date.now() - 45_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: {
      score: 4321,
      wave: 4,
      durationMs: 45_000,
      enemiesDefeated: 18,
      coinsCollected: 7,
      playerShipId: 'vanguard'
    },
    identity: createRunIdentityBinding({ guestIdentityId: guest.guestId }),
    integrity: 'server-verified'
  });
  const state = {
    receipt: {
      run_id: runId,
      score: 4321,
      wave: 4,
      duration_ms: 45_000,
      enemies_defeated: 18,
      coins_collected: 7,
      player_ship_id: 'vanguard',
      game_version: 'association-race-test',
      run_mode: 'standard',
      test_run: false,
      receipt_provenance_version: 1,
      integrity_status: 'server-verified',
      wallet_address: null,
      wallet_claimed_at: null
    },
    nonces: [],
    mints: [],
    leaderboardWallet: null,
    receiptPatchCount: 0,
    mintInsertCount: 0
  };
  const headers = {
    host: 'www.sciconshooter.xyz',
    origin: 'https://www.sciconshooter.xyz',
    cookie: `${GUEST_COOKIE_NAME}=${encodeURIComponent(guestToken)}`,
    'x-forwarded-for': `203.0.113.${ipSuffix}`
  };

  const fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const method = options.method || 'GET';

    if (table === 'scicon_run_receipts') {
      if (method === 'PATCH') {
        state.receiptPatchCount += 1;
        if (parsed.searchParams.get('wallet_address') !== 'is.null' || state.receipt.wallet_address) {
          return jsonResponse([]);
        }
        Object.assign(state.receipt, JSON.parse(options.body));
        return jsonResponse([{ ...state.receipt }]);
      }
      return jsonResponse([{ ...state.receipt }]);
    }

    if (table === 'scicon_wallet_nonces') {
      if (method === 'POST') {
        state.nonces.push({ ...JSON.parse(options.body), used_at: null });
        return jsonResponse(null, 204);
      }
      const challengeId = String(parsed.searchParams.get('challenge_id') || '').replace(/^eq\./, '');
      const nonce = state.nonces.find((entry) => entry.challenge_id === challengeId);
      if (method === 'PATCH') {
        if (!nonce || nonce.used_at) return jsonResponse([]);
        Object.assign(nonce, JSON.parse(options.body));
        return jsonResponse([{ ...nonce }]);
      }
      return jsonResponse(nonce ? [{ ...nonce }] : []);
    }

    if (table === 'scicon_mint_records') {
      if (method === 'POST') {
        state.mintInsertCount += 1;
        state.mints.push({
          ...JSON.parse(options.body),
          created_at: new Date().toISOString()
        });
        return jsonResponse(null, 204);
      }
      if (parsed.searchParams.has('run_id')) return jsonResponse(state.mints.map((row) => ({ ...row })));
      return jsonResponse([]);
    }

    if (table === 'scicon_leaderboard' && method === 'PATCH') {
      state.leaderboardWallet = JSON.parse(options.body).wallet_address;
      return jsonResponse(null, 204);
    }

    throw new Error(`Unexpected Supabase request: ${method} ${parsed}`);
  };

  return { fetch, headers, receiptToken, runId, state };
};

const mint = async (scenario, address) => {
  const res = makeResponse();
  const walletSessionToken = createWalletProfileSession(address);
  await mintAuthorizationHandler({
    method: 'POST',
    headers: {
      ...scenario.headers,
      cookie: `${scenario.headers.cookie}; ${SESSION_COOKIE_NAME}=${encodeURIComponent(walletSessionToken)}`
    },
    body: { recordType: 'mission', address, receiptToken: scenario.receiptToken }
  }, res);
  return res;
};

const challenge = async (scenario, address) => {
  const res = makeResponse();
  await runClaimsHandler({
    method: 'POST',
    headers: scenario.headers,
    body: { action: 'challenge', address, receiptToken: scenario.receiptToken }
  }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
};

const claim = async (scenario, address, walletChallenge) => {
  const res = makeResponse();
  await runClaimsHandler({
    method: 'POST',
    headers: scenario.headers,
    body: {
      action: 'claim',
      address,
      receiptToken: scenario.receiptToken,
      challengeId: walletChallenge.challengeId,
      signature: '0xvalid'
    }
  }, res);
  return res;
};

test('mint authorization A wins before a later signed claim to B', async () => {
  const scenario = makeScenario(101);
  const originalFetch = global.fetch;
  global.fetch = scenario.fetch;
  try {
    const minted = await mint(scenario, walletA);
    assert.equal(minted.statusCode, 200);
    assert.equal(scenario.state.receipt.wallet_address, walletA);

    const walletChallenge = await challenge(scenario, walletB);
    const rejected = await claim(scenario, walletB, walletChallenge);
    assert.equal(rejected.statusCode, 409);
    assert.match(rejected.body.error, /another Base Account/i);
    assert.equal(scenario.state.receipt.wallet_address, walletA);
  } finally {
    global.fetch = originalFetch;
  }
});

test('signed claim A wins before a later mint authorization to B', async () => {
  const scenario = makeScenario(102);
  const originalFetch = global.fetch;
  global.fetch = scenario.fetch;
  try {
    const walletChallenge = await challenge(scenario, walletA);
    const claimed = await claim(scenario, walletA, walletChallenge);
    assert.equal(claimed.statusCode, 200);
    assert.equal(scenario.state.receipt.wallet_address, walletA);

    const rejected = await mint(scenario, walletB);
    assert.equal(rejected.statusCode, 403);
    assert.match(rejected.body.error, /another Base Account/i);
    assert.equal(scenario.state.receipt.wallet_address, walletA);
  } finally {
    global.fetch = originalFetch;
  }
});

test('same-wallet mint authorization retries reuse one receipt lock and pending mint', async () => {
  const scenario = makeScenario(103);
  const originalFetch = global.fetch;
  global.fetch = scenario.fetch;
  try {
    assert.equal((await mint(scenario, walletA)).statusCode, 200);
    const pendingRetry = await mint(scenario, walletA);
    assert.equal(pendingRetry.statusCode, 425);
    assert.equal(pendingRetry.body.code, 'MINT_AUTHORIZATION_STILL_PENDING');
    assert.equal(scenario.state.receipt.wallet_address, walletA);
    assert.equal(scenario.state.receiptPatchCount, 1);
    assert.equal(scenario.state.mintInsertCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('same-wallet signed claim retry is idempotent after the first response', async () => {
  const scenario = makeScenario(104);
  const originalFetch = global.fetch;
  global.fetch = scenario.fetch;
  try {
    const walletChallenge = await challenge(scenario, walletA);
    const first = await claim(scenario, walletA, walletChallenge);
    const retry = await claim(scenario, walletA, walletChallenge);
    assert.equal(first.statusCode, 200);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.claim.walletAddress, walletA);
    assert.equal(scenario.state.receiptPatchCount, 1);
    assert.equal(scenario.state.receipt.wallet_address, walletA);
  } finally {
    global.fetch = originalFetch;
  }
});

test.after(() => {
  delete require.cache[runClaimsPath];
  if (originalSignaturesCache) require.cache[signaturesPath] = originalSignaturesCache;
  else delete require.cache[signaturesPath];
  if (originalMintRecoveryCache) require.cache[mintRecoveryPath] = originalMintRecoveryCache;
  else delete require.cache[mintRecoveryPath];
});
