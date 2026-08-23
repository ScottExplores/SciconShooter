const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'leaderboard-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const leaderboardHandler = require('../api/leaderboard');
const { getCurrentWeekRange, getWeekRange } = require('../shared/weeklyCompetitionBoundary.js');

const makeReceipt = (runId = crypto.randomUUID(), overrides = {}) => signPayload({
  type: 'run-receipt',
  runId,
  gameVersion: 'test',
  runMode: 'weekly-streak',
  startedAt: Date.now() - 60_000,
  finishedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  metrics: { score: 4321, wave: 4, durationMs: 60_000, enemiesDefeated: 20, coinsCollected: 12 },
  weeklyCampaign: { weeklyId: 'test-week', startNodeId: 'weekly-run-test-depth-1' },
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

test('leaderboard accepts a verified zero score without a rank threshold', async () => {
  const runId = crypto.randomUUID();
  const row = {
    name: 'NEW PILOT', score: 0, wave: 7, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };
  const originalFetch = global.fetch;
  let insertedScore = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') {
      const inserted = JSON.parse(options.body);
      insertedScore = (Array.isArray(inserted) ? inserted[0] : inserted).score;
      return jsonResponse(null, 204);
    }
    return jsonResponse([row]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        name: 'new pilot',
        receiptToken: makeReceipt(runId, {
          metrics: { score: 0, wave: 7, durationMs: 60_000, enemiesDefeated: 0, coinsCollected: 0 }
        })
      },
      headers: {}, socket: { remoteAddress: '127.0.0.40' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(insertedScore, 0);
    assert.equal(res.body.scores[0].score, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects an unexpired receipt after its weekly score cutoff without touching storage', async () => {
  const runId = crypto.randomUUID();
  const { start } = getCurrentWeekRange(new Date());
  const finishedAt = start.getTime() - 1;
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
      body: {
        name: 'late pilot',
        receiptToken: makeReceipt(runId, {
          startedAt: finishedAt - 60_000,
          finishedAt,
          expiresAt: Date.now() + 60_000
        })
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'WEEKLY_SCORE_CUTOFF_PASSED');
    assert.match(res.body.error, /weekly competition.*closed/i);
    assert.equal(fetchCalled, false);
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

test('leaderboard rejects a signed Campaign or standard receipt before touching storage', async () => {
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
      body: {
        name: 'campaign pilot',
        receiptToken: makeReceipt(crypto.randomUUID(), { runMode: 'standard' })
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.41' }
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'WEEKLY_RUN_REQUIRED');
    assert.match(res.body.error, /only a verified Weekly Run/i);
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects a Weekly Run receipt under integrity review before storage', async () => {
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
      body: {
        name: 'REVIEW',
        receiptToken: makeReceipt(undefined, { integrity: 'review' })
      },
      headers: {}, socket: { remoteAddress: '127.0.0.42' }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'WEEKLY_RUN_INTEGRITY_REVIEW');
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects an authored weekly proof without generated attempt admission', async () => {
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
      body: {
        name: 'AUTHORED',
        receiptToken: makeReceipt(undefined, {
          weeklyCampaign: { weeklyId: 'test-week', startNodeId: 'campaign-mission-1' }
        })
      },
      headers: {}, socket: { remoteAddress: '127.0.0.43' }
    }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'WEEKLY_RUN_REQUIRED');
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('production leaderboard rejects a signed Weekly token without its durable receipt row', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const originalEnvironment = process.env.NODE_ENV;
  let writeCount = 0;
  process.env.NODE_ENV = 'production';
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'POST' || options.method === 'PATCH') writeCount += 1;
    return jsonResponse([]);
  };
  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { name: 'NO LEDGER', receiptToken: makeReceipt(runId) },
      headers: {},
      socket: { remoteAddress: '127.0.0.44' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'WEEKLY_RECEIPT_NOT_DURABLE');
    assert.equal(writeCount, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});

test('production proposal recovery rejects a legacy provenance-zero receipt', async () => {
  const runId = crypto.randomUUID();
  const receiptToken = makeReceipt(runId);
  const receipt = require('../api/_lib/runReceipts').verifyRunReceipt(receiptToken);
  const originalFetch = global.fetch;
  const originalEnvironment = process.env.NODE_ENV;
  let nonReceiptReads = 0;
  process.env.NODE_ENV = 'production';
  global.fetch = async (url) => {
    if (!String(url).includes('scicon_run_receipts')) nonReceiptReads += 1;
    return jsonResponse([{
      run_id: runId,
      receipt_hash: require('node:crypto').createHash('sha256').update(receiptToken).digest('hex'),
      integrity_status: 'server-verified',
      receipt_provenance_version: 0,
      score: receipt.metrics.score,
      wave: receipt.metrics.wave
    }]);
  };
  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal',
        proposalId: '321',
        receiptToken
      },
      headers: {},
      socket: { remoteAddress: '127.0.0.45' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'WEEKLY_RECEIPT_NOT_DURABLE');
    assert.equal(nonReceiptReads, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
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

test('leaderboard keeps verified receipt identity when only proposal_image_url is unavailable', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const postBodies = [];
  const verifiedRow = {
    name: 'GUEST', score: 4321, wave: 4, date: new Date().toISOString(),
    wallet_address: null, donated: false,
    proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') {
      const rows = JSON.parse(options.body);
      postBodies.push(rows[0]);
      if (Object.hasOwn(rows[0], 'proposal_image_url')) {
        return jsonResponse({
          code: 'PGRST204',
          message: "Could not find the 'proposal_image_url' column in the schema cache"
        }, 400);
      }
      return jsonResponse(null, 204);
    }
    if (value.includes('proposal_image_url')) {
      return jsonResponse({
        code: 'PGRST204',
        message: "Could not find the 'proposal_image_url' column in the schema cache"
      }, 400);
    }
    return jsonResponse([verifiedRow]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'guest', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.scores[0].score, 4321);
    assert.equal(postBodies.length, 2);
    assert.equal(Object.hasOwn(postBodies[1], 'proposal_image_url'), false);
    assert.equal(postBodies[1].run_id, runId);
    assert.equal(postBodies[1].verified, true);
    assert.match(postBodies[1].receipt_hash, /^[a-f0-9]{64}$/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard returns readiness failure instead of writing a legacy row when verified columns are unavailable', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const postBodies = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('select=run_id&run_id=eq.')) return jsonResponse([]);
    if (options.method === 'POST') {
      const rows = JSON.parse(options.body);
      postBodies.push(rows[0]);
      return jsonResponse({
        code: 'PGRST204',
        message: "Could not find the 'run_id' column in the schema cache"
      }, 400);
    }
    throw new Error(`Unexpected leaderboard request: ${value}`);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'guest', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.45' }
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'LEADERBOARD_SCHEMA_NOT_READY');
    assert.match(res.body.error, /storage is not ready for verified scores/i);
    assert.equal(postBodies.length, 1);
    assert.equal(postBodies[0].run_id, runId);
    assert.equal(postBodies[0].verified, true);
    assert.match(postBodies[0].receipt_hash, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(postBodies[0], 'run_id'), true, 'no identity-less legacy POST is attempted');
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard replay-check schema errors return readiness failure without attempting a write', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let postCount = 0;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (options.method === 'POST') postCount += 1;
    if (value.includes('select=run_id&run_id=eq.')) {
      return jsonResponse({
        code: 'PGRST204',
        message: "Could not find the 'run_id' column in the schema cache"
      }, 400);
    }
    throw new Error(`Unexpected leaderboard request: ${value}`);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST', body: { name: 'guest', receiptToken: makeReceipt(runId) }, headers: {}, socket: { remoteAddress: '127.0.0.46' }
    }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'LEADERBOARD_SCHEMA_NOT_READY');
    assert.match(res.body.error, /storage is not ready for verified scores/i);
    assert.equal(postCount, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard returns the top 100 all-time and weekly scores', async () => {
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
  const weeklyRows = Array.from({ length: 120 }, (_, index) => ({
    ...historicRows[index],
    name: `WEEKLY${index}`,
    score: 100 - index,
    // Keep every fixture inside the active week even when this test runs just
    // after the Sunday noon-Pacific rollover.
    date: new Date().toISOString(),
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
    assert.equal(res.body.monthlyScores.length, 100);
    assert.equal(res.body.monthlyScores[0].name, 'WEEKLY0');
    assert.equal(res.body.monthlyScores[99].name, 'WEEKLY99');
    assert.match(allTimeRequest, /limit=100/);
    assert.match(weeklyRequest, /limit=100/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a current-schema review row cannot outrank a verified weekly score', async () => {
  const originalFetch = global.fetch;
  const date = new Date().toISOString();
  const review = {
    name: 'REVIEW', score: 999999, wave: 99, date, wallet_address: null,
    donated: false, run_id: 'review-run', verified: false, receipt_hash: 'review-hash'
  };
  const verified = {
    name: 'VERIFIED', score: 100, wave: 1, date, wallet_address: null,
    donated: false, run_id: 'verified-run', verified: true, receipt_hash: 'verified-hash'
  };
  global.fetch = async () => jsonResponse([review, verified]);
  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'GET', query: {}, headers: {}, socket: { remoteAddress: '127.0.0.44' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.monthlyScores[0].runId, 'verified-run');
    assert.equal(res.body.scores.some((entry) => entry.runId === 'review-run'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard can read one exact historical week without relying on the all-time top 100', async () => {
  const originalFetch = global.fetch;
  const weekKey = '2026-07-05';
  const range = getWeekRange(weekKey);
  const historicalWeekRows = [{
    name: 'PAST PILOT',
    score: 17,
    wave: 3,
    date: new Date(range.start.getTime() + 60_000).toISOString(),
    wallet_address: null,
    donated: false,
    proposal_id: null,
    proposal_title: null,
    proposal_url: null,
    proposal_author: null,
    run_id: 'past-week-run',
    verified: true,
    receipt_hash: 'past-week-hash'
  }];
  const requests = [];

  global.fetch = async (url) => {
    requests.push(String(url));
    return jsonResponse(historicalWeekRows);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'GET',
      query: { weekKey },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.weekKey, weekKey);
    assert.equal(res.body.weekScores.length, 1);
    assert.equal(res.body.weekScores[0].name, 'PAST PILOT');
    assert.equal(requests.length, 1);
    assert.match(requests[0], new RegExp(`date=gte\\.${encodeURIComponent(range.start.toISOString())}`));
    assert.match(requests[0], new RegExp(`date=lt\\.${encodeURIComponent(range.end.toISOString())}`));
    assert.match(requests[0], /limit=100/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('leaderboard rejects an invalid exact week key', async () => {
  const res = makeResponse();
  await leaderboardHandler({
    method: 'GET',
    query: { weekKey: '2026-07-06' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Sunday formatted as YYYY-MM-DD/);
});

test('the current weekly leader can attach one eligible proposal to the verified run', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const now = new Date().toISOString();
  let selected = false;
  let patchBody;
  const leaderboardRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: now, wallet_address: null,
    donated: false,
    proposal_id: selected ? '321' : null,
    proposal_title: selected ? 'Open Science Target' : null,
    proposal_url: selected ? 'https://www.researchhub.com/post/321/open-science-target' : null,
    proposal_author: selected ? 'Ada Researcher' : null,
    proposal_image_url: selected ? 'https://images.researchhub.com/proposals/321.png' : null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({
        results: [{
          content_object: {
            id: 321,
            title: 'Open Science Target',
            slug: 'open-science-target',
            image_url: 'https://images.researchhub.com/proposals/321.png',
            fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
          },
          author: { first_name: 'Ada', last_name: 'Researcher' }
        }]
      });
    }
    if (options.method === 'PATCH') {
      patchBody = JSON.parse(options.body);
      selected = true;
      return jsonResponse([leaderboardRow()]);
    }
    return jsonResponse([leaderboardRow()]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '321', receiptToken: makeReceipt(runId) },
      headers: { cookie: 'scicon_wallet_profile_session=expired-or-forged' },
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.monthlyScores[0].proposalId, '321');
    assert.equal(res.body.monthlyScores[0].proposalTitle, 'Open Science Target');
    assert.equal(res.body.monthlyScores[0].proposalImageUrl, 'https://images.researchhub.com/proposals/321.png');
    assert.ok(
      Array.isArray(res.headers['Set-Cookie'])
      && res.headers['Set-Cookie'].every((value) => /Max-Age=0/.test(value)),
      'a stale optional wallet cookie is cleared without blocking a guest proposal'
    );
    assert.deepEqual(patchBody, {
      proposal_id: '321',
      proposal_title: 'Open Science Target',
      proposal_url: 'https://www.researchhub.com/post/321/open-science-target',
      proposal_author: 'Ada Researcher',
      proposal_image_url: 'https://images.researchhub.com/proposals/321.png'
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('proposal selection keeps current metadata working before the image column migration', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const now = new Date().toISOString();
  const patchBodies = [];
  let selected = false;
  const leaderboardRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: now, wallet_address: null,
    donated: false,
    proposal_id: selected ? '321' : null,
    proposal_title: selected ? 'Open Science Target' : null,
    proposal_url: selected ? 'https://www.researchhub.com/post/321/open-science-target' : null,
    proposal_author: selected ? 'Ada Researcher' : null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({
        results: [{
          content_object: {
            id: 321,
            title: 'Open Science Target',
            slug: 'open-science-target',
            image_url: 'https://images.researchhub.com/proposals/321.png',
            fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
          },
          author: { first_name: 'Ada', last_name: 'Researcher' }
        }]
      });
    }
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      patchBodies.push(body);
      if (Object.hasOwn(body, 'proposal_image_url')) {
        return jsonResponse({ message: 'column proposal_image_url does not exist' }, 400);
      }
      selected = true;
      return jsonResponse([leaderboardRow()]);
    }
    if (value.includes('proposal_image_url')) {
      return jsonResponse({ message: 'column proposal_image_url does not exist' }, 400);
    }
    return jsonResponse([leaderboardRow()]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '321', receiptToken: makeReceipt(runId) },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.monthlyScores[0].proposalId, '321');
    assert.equal(res.body.monthlyScores[0].proposalTitle, 'Open Science Target');
    assert.equal(patchBodies.length, 2);
    assert.equal(patchBodies[0].proposal_image_url, 'https://images.researchhub.com/proposals/321.png');
    assert.equal(Object.hasOwn(patchBodies[1], 'proposal_image_url'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('the current weekly leader cannot select a proposal that closes before the weekly cutoff', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let patchCalled = false;
  const leader = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  };

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({
        results: [{
          content_object: {
            id: 321,
            title: 'Closing Too Soon',
            fundraise: { status: 'OPEN', end_date: '2000-01-01T00:00:00.000Z' }
          }
        }]
      });
    }
    if (options.method === 'PATCH') patchCalled = true;
    return jsonResponse([leader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '321', receiptToken: makeReceipt(runId) },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /closes before the weekly cutoff/i);
    assert.equal(patchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a run that is not the current weekly leader cannot attach a proposal', async () => {
  const requestedRunId = crypto.randomUUID();
  const leadingRunId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let patchCalled = false;
  const leader = {
    name: 'LEADER', score: 9000, wave: 5, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: leadingRunId, verified: true, receipt_hash: 'leader-hash'
  };

  global.fetch = async (_url, options = {}) => {
    if (options.method === 'PATCH') patchCalled = true;
    return jsonResponse([leader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '321', receiptToken: makeReceipt(requestedRunId) },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /no longer the current weekly high score/i);
    assert.equal(res.body.code, 'WEEKLY_LEADER_CHANGED');
    assert.equal(patchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('the exact verified current leader can replace its saved proposal', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const now = new Date().toISOString();
  let selectedProposalId = '321';
  let patchRequest;
  const leaderboardRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: now, wallet_address: null,
    donated: false, proposal_id: selectedProposalId,
    proposal_title: selectedProposalId === '654' ? 'Replacement Target' : 'Original Target',
    proposal_url: `https://www.researchhub.com/post/${selectedProposalId}/target`,
    proposal_author: 'Ada Researcher', proposal_image_url: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({
        results: [{
          content_object: {
            id: 654,
            title: 'Replacement Target',
            slug: 'replacement-target',
            fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
          },
          author: { first_name: 'Ada', last_name: 'Researcher' }
        }]
      });
    }
    if (options.method === 'PATCH') {
      patchRequest = { url: value, body: JSON.parse(options.body) };
      selectedProposalId = '654';
      return jsonResponse([leaderboardRow()]);
    }
    return jsonResponse([leaderboardRow()]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(runId) },
      headers: {}, socket: { remoteAddress: '127.0.0.21' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.monthlyScores[0].proposalId, '654');
    assert.match(patchRequest.url, new RegExp(`run_id=eq\\.${runId}`));
    assert.match(patchRequest.url, /verified=eq\.true&score=eq\.4321&wave=eq\.4/);
    assert.doesNotMatch(patchRequest.url, /proposal_id=is\.null/);
    assert.equal(patchRequest.body.proposal_title, 'Replacement Target');
    assert.equal(patchRequest.body.proposal_image_url, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('an empty exact proposal update is a terminal lead change with a stable code', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const leader = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    proposal_image_url: null, run_id: runId, verified: true, receipt_hash: 'hash'
  };

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 654, title: 'Replacement Target', slug: 'replacement-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        }
      }] });
    }
    if (options.method === 'PATCH') return jsonResponse([]);
    return jsonResponse([leader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(runId) },
      headers: {}, socket: { remoteAddress: '127.0.0.25' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'WEEKLY_LEADER_CHANGED');
    assert.match(res.body.error, /no longer the current weekly high score/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('proposal recovery rejects an unverified leaderboard row even with its signed run receipt', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let patchCalled = false;
  const leader = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: false, receipt_hash: 'hash'
  };
  global.fetch = async (_url, options = {}) => {
    if (options.method === 'PATCH') patchCalled = true;
    return jsonResponse([leader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(runId) },
      headers: {}, socket: { remoteAddress: '127.0.0.22' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /no longer the current weekly high score/i);
    assert.equal(res.body.code, 'WEEKLY_LEADER_CHANGED');
    assert.equal(patchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('proposal recovery rechecks the weekly leader after proposal eligibility lookup', async () => {
  const requestedRunId = crypto.randomUUID();
  const newLeaderRunId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let leaderboardReads = 0;
  let patchCalled = false;
  const row = (runId, score) => ({
    name: 'PILOT', score, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 654, title: 'Replacement Target', slug: 'replacement-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        }
      }] });
    }
    if (options.method === 'PATCH') patchCalled = true;
    leaderboardReads += 1;
    return jsonResponse([leaderboardReads <= 2
      ? row(requestedRunId, 4321)
      : row(newLeaderRunId, 9999)]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(requestedRunId) },
      headers: {}, socket: { remoteAddress: '127.0.0.23' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /no longer the current weekly high score/i);
    assert.equal(res.body.code, 'WEEKLY_LEADER_CHANGED');
    assert.equal(patchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('proposal recovery rolls back its exact write if the lead changes during the update', async () => {
  const requestedRunId = crypto.randomUUID();
  const newLeaderRunId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let leaderboardReads = 0;
  let proposalApplied = false;
  let rollbackBody;
  const requestedRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: proposalApplied ? '654' : '321',
    proposal_title: proposalApplied ? 'Replacement Target' : 'Original Target',
    proposal_url: 'https://www.researchhub.com/post/target', proposal_author: 'Ada Researcher',
    run_id: requestedRunId, verified: true, receipt_hash: 'hash'
  });
  const newLeader = {
    ...requestedRow(), name: 'NEW LEADER', score: 9999, run_id: newLeaderRunId,
    proposal_id: null, proposal_title: null
  };

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 654, title: 'Replacement Target', slug: 'replacement-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        }
      }] });
    }
    if (options.method === 'PATCH' && value.includes('proposal_id=eq.654')) {
      rollbackBody = JSON.parse(options.body);
      return jsonResponse(null, 204);
    }
    if (options.method === 'PATCH') {
      proposalApplied = true;
      return jsonResponse([requestedRow()]);
    }
    leaderboardReads += 1;
    return jsonResponse([leaderboardReads <= 4 ? requestedRow() : newLeader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(requestedRunId) },
      headers: {}, socket: { remoteAddress: '127.0.0.24' }
    }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /no longer the current weekly high score/i);
    assert.equal(res.body.code, 'WEEKLY_LEADER_CHANGED');
    assert.equal(rollbackBody.proposal_id, '321');
    assert.equal(rollbackBody.proposal_title, 'Original Target');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a wallet-backed weekly leader cannot mutate its proposal without a wallet signature', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let patchCalled = false;
  const leader = {
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(),
    wallet_address: '0x1111111111111111111111111111111111111111', donated: false,
    proposal_id: null, proposal_title: null, proposal_url: null, proposal_author: null,
    proposal_image_url: null, run_id: runId, verified: true, receipt_hash: 'hash'
  };

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 321, title: 'Open Science Target', slug: 'open-science-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        }
      }] });
    }
    if (options.method === 'PATCH') patchCalled = true;
    return jsonResponse([leader]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '321', receiptToken: makeReceipt(runId) },
      headers: {}, socket: { remoteAddress: '127.0.0.31' }
    }, res);
    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /Base Account signature is required/i);
    assert.equal(patchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a wallet-backed leader accepts PostgREST-normalized challenge timestamps only once', async () => {
  const { privateKeyToAccount } = await import('viem/accounts');
  const account = privateKeyToAccount('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  let nonceRow;
  let nonceConsumeUrl = '';
  let selected = false;
  let proposalPatchCount = 0;
  const leaderboardRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(),
    wallet_address: account.address.toLowerCase(), donated: false,
    proposal_id: selected ? '321' : null,
    proposal_title: selected ? 'Open Science Target' : null,
    proposal_url: selected ? 'https://www.researchhub.com/post/321/open-science-target' : null,
    proposal_author: selected ? 'Ada Researcher' : null,
    proposal_image_url: null, run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('mainnet.base.org')) throw new Error('RPC intentionally unavailable in this EOA test');
    if (value.includes('scicon_wallet_nonces')) {
      if (options.method === 'POST') {
        nonceRow = { ...JSON.parse(options.body), used_at: null };
        return jsonResponse(null, 204);
      }
      if (options.method === 'PATCH') {
        nonceConsumeUrl = value;
        if (nonceRow?.used_at) return jsonResponse([]);
        nonceRow = { ...nonceRow, ...JSON.parse(options.body) };
        return jsonResponse([nonceRow]);
      }
      return jsonResponse(nonceRow ? [{
        ...nonceRow,
        expires_at: nonceRow.expires_at.replace(/Z$/, '+00:00')
      }] : []);
    }
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 321, title: 'Open Science Target', slug: 'open-science-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        },
        author: { first_name: 'Ada', last_name: 'Researcher' }
      }] });
    }
    if (options.method === 'PATCH') {
      proposalPatchCount += 1;
      selected = true;
      return jsonResponse([leaderboardRow()]);
    }
    return jsonResponse([leaderboardRow()]);
  };

  try {
    const receiptToken = makeReceipt(runId);
    const challengeResponse = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal-challenge', proposalId: '321',
        receiptToken, address: account.address
      },
      headers: {}, socket: { remoteAddress: '127.0.0.32' }
    }, challengeResponse);

    assert.equal(challengeResponse.statusCode, 200);
    const challenge = challengeResponse.body.challenge;
    assert.equal(challenge.signatureRequired, true);
    assert.match(challenge.message, new RegExp(`Run: ${runId}`));
    assert.match(challenge.message, /Proposal: 321/);
    assert.match(challenge.message, new RegExp(`Wallet: ${account.address.toLowerCase()}`));

    const signature = await account.signMessage({ message: challenge.message });
    const selectResponse = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal', proposalId: '321', receiptToken,
        address: account.address, challengeId: challenge.challengeId, signature
      },
      headers: {}, socket: { remoteAddress: '127.0.0.32' }
    }, selectResponse);

    assert.equal(selectResponse.statusCode, 200);
    assert.equal(selectResponse.body.monthlyScores[0].proposalId, '321');
    assert.ok(nonceRow.used_at);
    assert.match(nonceConsumeUrl, /used_at=is\.null&expires_at=gt\./);
    assert.equal(proposalPatchCount, 1);

    const unchangedChallengeResponse = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal-challenge', proposalId: '321',
        receiptToken, address: account.address
      },
      headers: {}, socket: { remoteAddress: '127.0.0.32' }
    }, unchangedChallengeResponse);
    const unchangedChallenge = unchangedChallengeResponse.body.challenge;
    const unchangedSignature = await account.signMessage({ message: unchangedChallenge.message });
    const unchangedResponse = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal', proposalId: '321', receiptToken,
        address: account.address,
        challengeId: unchangedChallenge.challengeId,
        signature: unchangedSignature
      },
      headers: {}, socket: { remoteAddress: '127.0.0.32' }
    }, unchangedResponse);
    assert.equal(unchangedResponse.statusCode, 200);
    assert.ok(nonceRow.used_at, 'same-proposal authorization consumes its nonce');
    assert.equal(proposalPatchCount, 1, 'same proposal does not rewrite the leaderboard row');

    selected = false;
    const replayResponse = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: {
        action: 'select-proposal', proposalId: '321', receiptToken,
        address: account.address,
        challengeId: unchangedChallenge.challengeId,
        signature: unchangedSignature
      },
      headers: {}, socket: { remoteAddress: '127.0.0.32' }
    }, replayResponse);
    assert.equal(replayResponse.statusCode, 410);
    assert.match(replayResponse.body.error, /invalid or expired/i);
    assert.equal(replayResponse.body.code, 'WEEKLY_PROPOSAL_CHALLENGE_STALE');
    assert.equal(proposalPatchCount, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('proposal replacement clears a stale image and still retries without the optional image column', async () => {
  const runId = crypto.randomUUID();
  const originalFetch = global.fetch;
  const patchBodies = [];
  let selected = false;
  const leaderboardRow = () => ({
    name: 'PILOT', score: 4321, wave: 4, date: new Date().toISOString(), wallet_address: null,
    donated: false, proposal_id: selected ? '654' : '321',
    proposal_title: selected ? 'Replacement Target' : 'Original Target',
    proposal_url: 'https://www.researchhub.com/post/target', proposal_author: 'Ada Researcher',
    run_id: runId, verified: true, receipt_hash: 'hash'
  });

  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.includes('backend.prod.researchhub.com')) {
      return jsonResponse({ results: [{
        content_object: {
          id: 654, title: 'Replacement Target', slug: 'replacement-target',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        },
        author: { first_name: 'Ada', last_name: 'Researcher' }
      }] });
    }
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      patchBodies.push(body);
      if (Object.hasOwn(body, 'proposal_image_url')) {
        return jsonResponse({ message: 'column proposal_image_url does not exist' }, 400);
      }
      selected = true;
      return jsonResponse([leaderboardRow()]);
    }
    return jsonResponse([leaderboardRow()]);
  };

  try {
    const res = makeResponse();
    await leaderboardHandler({
      method: 'POST',
      body: { action: 'select-proposal', proposalId: '654', receiptToken: makeReceipt(runId) },
      headers: {}, socket: { remoteAddress: '127.0.0.33' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(patchBodies.length, 2);
    assert.equal(patchBodies[0].proposal_image_url, null);
    assert.equal(Object.hasOwn(patchBodies[1], 'proposal_image_url'), false);
  } finally {
    global.fetch = originalFetch;
  }
});
