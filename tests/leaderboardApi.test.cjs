const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'leaderboard-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const leaderboardHandler = require('../api/leaderboard');

const makeReceipt = (runId = crypto.randomUUID()) => signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 4321, wave: 4, durationMs: 60_000, enemiesDefeated: 20, coinsCollected: 12 },
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

test('leaderboard derives score and wave from the signed receipt', async () => {
  const runId = crypto.randomUUID();
  const row = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') return jsonResponse(null, 204);
    return jsonResponse([row]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { name: 'pilot', receiptToken: makeReceipt(runId), score: 99999999, wave: 999 },
      headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scores[0].score, 4321);
    assert.equal(res.body.scores[0].wave, 4);
    assert.equal(res.body.scores[0].runId, runId);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects a replayed run ID', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse([{ run_id: runId }]);
  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'pilot', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already been submitted/i);
  } finally {
    global.fetch = originalFetch;
  }
});
