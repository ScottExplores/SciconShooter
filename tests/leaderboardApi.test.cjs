const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'leaderboard-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const leaderboardHandler = require('../api/leaderboard');

const makeReceipt = (runId = crypto.randomUUID(), overrides = {}) => signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 4321, wave: 4, durationMs: 60_000, enemiesDefeated: 20, coinsCollected: 12 },
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

test('leaderboard derives score and wave from the signed receipt', async () => {
  const runId = crypto.randomUUID();
  const row = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };
  const originalFetch = global.fetch;
  let writeRequest;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') {
      writeRequest = { url: value, options };
      return jsonResponse(null, 204);
    }
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
    assert.equal(writeRequest.url.includes('on_conflict'), false);
    assert.equal(writeRequest.options.headers.Prefer, 'return=minimal');
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects signed Pilot Test receipts before touching storage', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return jsonResponse([]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { name: 'owner', receiptToken: makeReceipt(crypto.randomUUID(), { testRun: true }) },
      headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /not eligible/i);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard treats a replayed run ID as an idempotent save', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse([{ run_id: runId }]);
  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'pilot', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadySubmitted, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard treats a duplicate insert race as an idempotent save', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const row = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') return jsonResponse({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
    return jsonResponse([row]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'pilot', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scores[0].runId, runId);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard saves a verified receipt through the legacy schema fallback', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let legacyWrite;
  const legacyRow = {
    name: 'GUEST', score: 4321, wave: 4, date: new Date().toISOString(),
    wallet_address: null, donated: false
  };
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse({ message: 'column run_id does not exist' }, 400);
    if (options.method === 'POST') {
      const rows = JSON.parse(options.body);
      if (Object.hasOwn(rows[0], 'run_id')) return jsonResponse({ message: 'column run_id does not exist' }, 400);
      legacyWrite = rows[0];
      return jsonResponse(null, 204);
    }
    if (value.includes('run_id,verified,receipt_hash')) return jsonResponse({ message: 'column run_id does not exist' }, 400);
    return jsonResponse([legacyRow]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'guest', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scores[0].score, 4321);
    assert.equal(legacyWrite.name, 'GUEST');
    assert.equal(Object.hasOwn(legacyWrite, 'run_id'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard returns the top 100 all-time scores while keeping the weekly board focused', async () => {
  const originalFetch = global.fetch;
  const historicRows = Array.from({ length: 120 }, (_, index) => ({
    name: `PILOT${index}`,
    score: 1200 - index,
    wave: 1 + (index % 5),
    date: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(),
    wallet_address: null,
    donated: false,
    proposal_id: null,
    proposal_title: null,
    proposal_url: null,
    proposal_author: null,
    run_id: `run-${index}`,
    verified: true,
    receipt_hash: `hash-${index}`
  }));
  const weeklyRows = Array.from({ length: 5 }, (_, index) => ({
    ...historicRows[index],
    name: `WEEKLY${index}`,
    score: 100 - index,
    date: new Date(Date.now() - (index * 60_000)).toISOString(),
    run_id: `weekly-run-${index}`,
    receipt_hash: `weekly-hash-${index}`
  }));
  let allTimeRequest = '';
  let weeklyRequest = '';

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('&date=gte.')) {
      weeklyRequest = value;
      return jsonResponse(weeklyRows);
    }
    allTimeRequest = value;
    return jsonResponse(historicRows.slice(0, 100));
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({ method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scores.length, 100);
    assert.equal(res.body.scores[0].score, 1200);
    assert.equal(res.body.scores[99].score, 1101);
    assert.equal(res.body.monthlyScores.length, 5);
    assert.equal(res.body.monthlyScores[0].name, 'WEEKLY0');
    assert.match(allTimeRequest, /limit=100/);
    assert.match(weeklyRequest, /limit=5/);
  } finally {
    global.fetch = originalFetch;
  }
});
