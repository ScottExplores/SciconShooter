const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.RUN_RECEIPT_SECRET = 'leaderboard-wallet-attribution-test-secret';
process.env.WALLET_PROFILE_AUTH_SECRET = 'leaderboard-wallet-profile-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const {
  SESSION_COOKIE_NAME,
  createWalletProfileSession
} = require('../api/_lib/walletProfileAuth');
const leaderboardHandler = require('../api/leaderboard');

const AUTHENTICATED_WALLET = '0x1111111111111111111111111111111111111111';
const SPOOFED_WALLET = '0x2222222222222222222222222222222222222222';

const makeReceipt = (runId = crypto.randomUUID(), overrides = {}) => signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  runMode: 'weekly-streak',
  metrics: {
    score: 4321,
    wave: 4,
    durationMs: 60_000,
    enemiesDefeated: 20,
    coinsCollected: 12,
    playerShipId: 'researchhub'
  },
  integrity: 'server-verified',
  ...overrides
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

const installLeaderboardStorageMock = () => {
  let insertedRow = null;
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls += 1;
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') {
      const rows = JSON.parse(options.body);
      insertedRow = Array.isArray(rows) ? rows[0] : rows;
      return jsonResponse(null, 204);
    }
    return jsonResponse(insertedRow ? [insertedRow] : []);
  };
  return {
    get insertedRow() { return insertedRow; },
    get calls() { return calls; },
    restore() { global.fetch = originalFetch; }
  };
};

const submit = async ({ walletAddress, cookie, ip, receiptToken }) => {
  const response = makeResponse();
  await leaderboardHandler({
    method: 'POST',
    body: {
      name: 'pilot',
      receiptToken: receiptToken || makeReceipt(),
      ...(walletAddress ? { walletAddress } : {})
    },
    headers: cookie ? { cookie } : {},
    socket: { remoteAddress: ip }
  }, response);
  return response;
};

test('guest leaderboard submissions remain wallet-free', async () => {
  const storage = installLeaderboardStorageMock();
  try {
    const sessionToken = createWalletProfileSession(AUTHENTICATED_WALLET);
    const response = await submit({
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
      ip: '127.0.1.1'
    });
    assert.equal(response.statusCode, 200);
    assert.equal(storage.insertedRow.wallet_address, null);
    assert.equal(response.body.scores[0].walletAddress, undefined);
  } finally {
    storage.restore();
  }
});

test('an unauthenticated caller cannot attach a wallet address to a score', async () => {
  const storage = installLeaderboardStorageMock();
  try {
    const response = await submit({
      walletAddress: SPOOFED_WALLET,
      ip: '127.0.1.2'
    });
    assert.equal(response.statusCode, 200);
    assert.equal(storage.insertedRow.wallet_address, null);
    assert.equal(response.body.scores[0].walletAddress, undefined);
  } finally {
    storage.restore();
  }
});

test('a verified profile session owns score attribution and overrides body metadata', async () => {
  const storage = installLeaderboardStorageMock();
  try {
    const sessionToken = createWalletProfileSession(AUTHENTICATED_WALLET);
    const response = await submit({
      walletAddress: SPOOFED_WALLET,
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
      ip: '127.0.1.3'
    });
    assert.equal(response.statusCode, 200);
    assert.equal(storage.insertedRow.wallet_address, AUTHENTICATED_WALLET);
    assert.equal(response.body.scores[0].walletAddress, AUTHENTICATED_WALLET);
  } finally {
    storage.restore();
  }
});

test('a wallet-bound receipt cannot be attributed under a different authenticated wallet', async () => {
  const storage = installLeaderboardStorageMock();
  try {
    const sessionToken = createWalletProfileSession(SPOOFED_WALLET);
    const response = await submit({
      walletAddress: SPOOFED_WALLET,
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
      receiptToken: makeReceipt(undefined, {
        identity: {
          kind: 'wallet',
          profileIdHash: 'signed-profile-binding',
          walletAddress: AUTHENTICATED_WALLET
        }
      }),
      ip: '127.0.1.5'
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, 'RUN_IDENTITY_MISMATCH');
    assert.equal(storage.calls, 0);
  } finally {
    storage.restore();
  }
});

test('a malformed profile session is rejected before leaderboard storage is touched', async () => {
  const storage = installLeaderboardStorageMock();
  try {
    const response = await submit({
      walletAddress: AUTHENTICATED_WALLET,
      cookie: `${SESSION_COOKIE_NAME}=forged-session`,
      ip: '127.0.1.4'
    });
    assert.equal(response.statusCode, 401);
    assert.match(response.body.error, /authorization is invalid/i);
    assert.equal(storage.calls, 0);
  } finally {
    storage.restore();
  }
});

test('the leaderboard client explicitly includes same-origin profile credentials', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'leaderboardService.ts'),
    'utf8'
  );
  assert.match(
    source,
    /writeRemoteLeaderboardData[\s\S]*fetch\(API_URL,[\s\S]*credentials:\s*'same-origin'/
  );
});
