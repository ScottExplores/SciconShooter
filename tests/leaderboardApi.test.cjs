const test = require('node:test');
const assert = require('node:assert/strict');

process.env.RUN_RECEIPT_SECRET = 'leaderboard-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { signPayload } = require('../api/_lib/runReceipts');
const leaderboardHandler = require('../api/leaderboard');
const { getCurrentWeekRange } = require('../shared/weeklyCompetitionBoundary.js');

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
      headers: {},
      socket: { remoteAddress: '127.0.0.1' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.monthlyScores[0].proposalId, '321');
    assert.equal(res.body.monthlyScores[0].proposalTitle, 'Open Science Target');
    assert.equal(res.body.monthlyScores[0].proposalImageUrl, 'https://images.researchhub.com/proposals/321.png');
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
