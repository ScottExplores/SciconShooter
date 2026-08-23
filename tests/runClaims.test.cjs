const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'run-claim-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const runClaimsHandler = require('../api/run-claims');

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

test('a completed run claim is idempotent after the signed response is interrupted', async () => {
  const runId = crypto.randomUUID();
  const challengeId = crypto.randomUUID();
  const wallet = '0x1111111111111111111111111111111111111111';
  const now = new Date().toISOString();
  const receiptToken = signPayload({
    type: 'run-receipt',
    runId,
    gameVersion: 'test',
    startedAt: Date.now() - 60_000,
    finishedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    metrics: { score: 900, wave: 1, durationMs: 60_000, enemiesDefeated: 9, coinsCollected: 4 },
    identity: { kind: 'wallet', walletAddress: wallet, profileIdHash: 'wallet-profile-hash' },
    integrity: 'server-verified'
  });
  const originalFetch = global.fetch;
  let leaderboardSynced = false;

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('scicon_wallet_nonces')) {
      return jsonResponse([{
        challenge_id: challengeId,
        run_id: runId,
        wallet_address: wallet,
        message: 'already verified',
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        used_at: now
      }]);
    }
    if (value.includes('scicon_run_receipts')) {
      return jsonResponse([{
        wallet_address: wallet,
        wallet_claimed_at: now,
        receipt_provenance_version: 1
      }]);
    }
    if (value.includes('scicon_leaderboard') && options.method === 'PATCH') {
      leaderboardSynced = true;
      return jsonResponse(null, 204);
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const res = makeResponse();
    await runClaimsHandler({
      method: 'POST',
      headers: {},
      body: { action: 'claim', address: wallet, receiptToken, challengeId, signature: '0x01' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.claim.runId, runId);
    assert.equal(res.body.claim.walletAddress, wallet);
    assert.equal(leaderboardSynced, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('foreign origins are rejected before nonce or receipt persistence', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return jsonResponse([]);
  };

  try {
    const res = makeResponse();
    await runClaimsHandler({
      method: 'POST',
      headers: {
        host: 'www.sciconshooter.xyz',
        origin: 'https://attacker.example'
      },
      body: {
        action: 'challenge',
        address: '0x1111111111111111111111111111111111111111',
        receiptToken: 'must-not-be-read'
      }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(fetchCount, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('run association requests are bounded per client and action', async () => {
  const headers = {
    host: 'www.sciconshooter.xyz',
    origin: 'https://www.sciconshooter.xyz',
    'x-forwarded-for': '203.0.113.92'
  };
  for (let index = 0; index < 40; index += 1) {
    const res = makeResponse();
    await runClaimsHandler({ method: 'POST', headers, body: { action: 'unknown' } }, res);
    assert.equal(res.statusCode, 400);
  }
  const limited = makeResponse();
  await runClaimsHandler({ method: 'POST', headers, body: { action: 'unknown' } }, limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'RUN_CLAIM_RATE_LIMITED');
  assert.ok(Number(limited.headers['Retry-After']) >= 1);
});
