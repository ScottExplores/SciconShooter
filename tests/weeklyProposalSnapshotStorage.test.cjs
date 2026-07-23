const test = require('node:test');
const assert = require('node:assert/strict');

const {
  captureWeeklyProposalCutoffSnapshot,
  readWeeklyProposalSnapshot
} = require('../api/_lib/weeklyCompetitionService');
const { getWeekRange } = require('../shared/weeklyCompetitionBoundary');

const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return data; },
  async text() { return data === null ? '' : JSON.stringify(data); }
});

const withSupabase = async (run) => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  try {
    await run();
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
  }
};

test('cutoff captures append immutable rows instead of overwriting a weekly cache key', async () => {
  const originalFetch = global.fetch;
  const writes = [];
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('backend.prod.researchhub.com')) {
      return response({
        results: [{ content_object: { id: 321 } }],
        next: null
      });
    }
    writes.push({ url: String(url), options });
    return response(null, 201);
  };

  try {
    await withSupabase(async () => {
      await captureWeeklyProposalCutoffSnapshot({
        observedAt: new Date('2026-07-12T18:10:00.000Z'),
        completedAt: new Date('2026-07-12T18:11:00.000Z')
      });
      await captureWeeklyProposalCutoffSnapshot({
        observedAt: new Date('2026-07-12T18:20:00.000Z'),
        completedAt: new Date('2026-07-12T18:21:00.000Z')
      });
    });

    assert.equal(writes.length, 2);
    const rows = writes.map((write) => JSON.parse(write.options.body));
    assert.equal(new Set(rows.map((row) => row.cache_key)).size, 2);
    for (const [index, write] of writes.entries()) {
      assert.doesNotMatch(write.url, /on_conflict/);
      assert.equal(write.options.headers.Prefer, 'return=minimal');
      assert.match(
        rows[index].cache_key,
        /^researchhub-open-preregistrations:week:2026-07-05:snapshot:\d+:[0-9a-f-]+$/
      );
      assert.equal(rows[index].payload.complete, true);
      assert.equal(rows[index].payload.source, 'weekly-cutoff-capture');
    }
    assert.deepEqual(
      rows.map((row) => row.fetched_at),
      ['2026-07-12T18:11:00.000Z', '2026-07-12T18:21:00.000Z']
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('weekly snapshot reads select the newest valid immutable pre-cutoff row', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  global.fetch = async (url) => {
    requestedUrl = decodeURIComponent(String(url));
    return response([
      {
        fetched_at: '2026-07-12T18:59:00.000Z',
        payload: {
          complete: false,
          source: 'weekly-cutoff-capture',
          results: [{ id: 'invalid-newest' }]
        }
      },
      {
        fetched_at: '2026-07-12T18:10:00.000Z',
        payload: {
          complete: true,
          source: 'weekly-cutoff-capture',
          results: [{ id: 'older-valid' }]
        }
      },
      {
        fetched_at: '2026-07-12T18:58:00.000Z',
        payload: {
          complete: true,
          source: 'weekly-cutoff-capture',
          results: [{ id: 'newest-valid' }]
        }
      },
      {
        fetched_at: '2026-07-12T19:00:00.000Z',
        payload: {
          complete: true,
          source: 'weekly-cutoff-capture',
          results: [{ id: 'at-cutoff' }]
        }
      }
    ]);
  };

  try {
    const { start, end } = getWeekRange('2026-07-05');
    let snapshot;
    await withSupabase(async () => {
      snapshot = await readWeeklyProposalSnapshot('2026-07-05', { start, end });
    });

    assert.deepEqual(snapshot, [{ id: 'newest-valid' }]);
    assert.match(
      requestedUrl,
      /cache_key=like\.researchhub-open-preregistrations:week:2026-07-05:snapshot:\*/
    );
    assert.match(requestedUrl, /fetched_at=lt\.2026-07-12T19:00:00\.000Z/);
    assert.match(requestedUrl, /order=fetched_at\.desc/);
  } finally {
    global.fetch = originalFetch;
  }
});
