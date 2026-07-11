const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'mint-authorization-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.MISSION_RECORD_CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';
process.env.MINT_AUTHORIZER_PRIVATE_KEY = `0x${'12'.repeat(32)}`;
process.env.MISSION_RECORD_CHAIN_ID = '8453';

const { signPayload } = require('../api/_lib/runReceipts');
const mintAuthorizationHandler = require('../api/mint-authorization');

const runId = '11111111-2222-4333-8444-555555555555';
const wallet = '0x2222222222222222222222222222222222222222';
const receiptToken = signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  startedAt: Date.now() - 30_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 1234, wave: 2, durationMs: 30_000, enemiesDefeated: 12, coinsCollected: 8 },
  integrity: 'server-verified'
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

test('authorizes an unclaimed verified run directly to the minting wallet', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) return jsonResponse([{ wallet_address: null }]);
    if (value.includes('scicon_mint_records')) return jsonResponse([]);
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: { host: 'sciconshooter.xyz' },
      body: { recordType: 'mission', address: wallet, receiptToken }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.score, 1234);
    assert.equal(res.body.wave, 2);
    assert.match(res.body.signature, /^0x[0-9a-f]+$/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('does not authorize a run already attached to another wallet', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('scicon_run_receipts')) {
      return jsonResponse([{ wallet_address: '0x3333333333333333333333333333333333333333' }]);
    }
    throw new Error(`Unexpected request: ${value}`);
  };

  try {
    const res = makeResponse();
    await mintAuthorizationHandler({
      method: 'POST',
      headers: { host: 'sciconshooter.xyz' },
      body: { recordType: 'mission', address: wallet, receiptToken }
    }, res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /another Base Account/i);
  } finally {
    global.fetch = originalFetch;
  }
});
