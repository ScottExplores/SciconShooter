const test = require('node:test');
const assert = require('node:assert/strict');

const proposalsHandler = require('../api/researchhub-proposals');

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
  async text() { return JSON.stringify(data); }
});

const withoutSupabase = async (run) => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    await run();
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
  }
};

test('referenced proposal IDs are strictly validated before any upstream request', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not run');
  };

  try {
    await withoutSupabase(async () => {
      const res = makeResponse();
      await proposalsHandler({
        method: 'GET',
        query: { includeProposalIds: '123,,456' }
      }, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /exactly 1 numeric proposal ID/i);
      assert.equal(fetchCalled, false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('the public reference lookup accepts only the one weekly leader proposal ID', async () => {
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not run');
  };

  try {
    await withoutSupabase(async () => {
      const res = makeResponse();
      await proposalsHandler({
        method: 'GET',
        query: { includeProposalIds: '20,10' }
      }, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /exactly 1 numeric proposal ID/i);
      assert.equal(fetchCalled, false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('open results stay unchanged while one exact completed proposal is returned', async () => {
  const originalFetch = global.fetch;
  const openResults = [
    { content_object: { id: 10, title: 'Open exact match' } },
    { content_object: { id: 11, title: 'Other eligible proposal' } }
  ];
  const completedPost = {
    id: 20,
    title: 'Completed exact match',
    slug: 'completed-exact-match',
    image_url: 'https://images.researchhub.com/completed.png',
    authors: [{ first_name: 'Complete', last_name: 'Researcher' }],
    note: {
      post: {
        id: 20,
        unified_document: {
          fundraise: { status: 'COMPLETED' }
        }
      }
    }
  };
  const requestedUrls = [];
  global.fetch = async (url) => {
    const requestedUrl = String(url);
    requestedUrls.push(requestedUrl);
    if (requestedUrl.includes('fundraise_status=OPEN')) {
      return jsonResponse({ count: 2, next: null, results: openResults });
    }
    if (requestedUrl.includes('/api/researchhubpost/20/')) {
      return jsonResponse(completedPost);
    }
    throw new Error(`Unexpected URL: ${requestedUrl}`);
  };

  try {
    await withoutSupabase(async () => {
      const res = makeResponse();
      await proposalsHandler({
        method: 'GET',
        query: { includeProposalIds: '20' }
      }, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.results, openResults);
      assert.deepEqual(
        res.body.referencedProposals.map((entry) => String(entry.content_object.id)),
        ['20']
      );
      assert.deepEqual(res.body.missingReferencedProposalIds, []);
      assert.equal(requestedUrls.filter((url) => url.includes('fundraise_status=OPEN')).length, 1);
      assert.equal(requestedUrls.filter((url) => url.includes('/api/researchhubpost/20/')).length, 1);
      assert.equal(res.headers['Cache-Control'], 's-maxage=60, stale-while-revalidate=300');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('referenced exact lookup failures fail closed instead of returning an open-only cached success', async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  global.fetch = async (url) => {
    if (String(url).includes('fundraise_status=OPEN')) {
      return jsonResponse({
        count: 1,
        next: null,
        results: [{ content_object: { id: 10, title: 'Open proposal' } }]
      });
    }
    return jsonResponse({ error: 'unavailable' }, 503);
  };
  console.error = () => {};

  try {
    await withoutSupabase(async () => {
      const res = makeResponse();
      await proposalsHandler({
        method: 'GET',
        query: { includeProposalIds: '20' }
      }, res);

      assert.equal(res.statusCode, 502);
      assert.match(res.body.error, /referenced proposal lookup is unavailable/i);
      assert.match(res.body.details, /returned 503/i);
    });
  } finally {
    console.error = originalConsoleError;
    global.fetch = originalFetch;
  }
});

test('the public open-feed cache cannot overwrite the protected weekly cutoff snapshot', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const requests = [];

  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('backend.prod.researchhub.com')) {
      return jsonResponse({ count: 0, next: null, results: [] });
    }
    return jsonResponse([]);
  };

  try {
    const res = makeResponse();
    await proposalsHandler({ method: 'GET', query: {} }, res);

    assert.equal(res.statusCode, 200);
    const cacheWrite = requests.find((request) => request.options.method === 'POST');
    assert.ok(cacheWrite);
    const row = JSON.parse(cacheWrite.options.body);
    assert.equal(row.cache_key, 'researchhub-open-preregistrations');
    assert.doesNotMatch(row.cache_key, /:week:/);
    assert.equal(typeof row.fetched_at, 'string');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
  }
});

test('complete public feeds append immutable cutoff snapshots while partial feeds do not', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const requests = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return jsonResponse([], 201);
  };

  try {
    const completePayload = { results: [{ content_object: { id: 321 } }], next: null };
    await proposalsHandler._test.writeProposalCache(completePayload, {
      fetchedAtDate: new Date('2026-07-12T18:10:00.000Z')
    });
    await proposalsHandler._test.writeProposalCache(completePayload, {
      fetchedAtDate: new Date('2026-07-12T18:20:00.000Z')
    });
    await proposalsHandler._test.writeProposalCache({
      results: completePayload.results,
      next: 'https://backend.prod.researchhub.com/api/funding_feed/?page=2'
    }, {
      fetchedAtDate: new Date('2026-07-12T18:30:00.000Z')
    });

    const genericWrites = requests.filter((request) => /on_conflict=cache_key/.test(request.url));
    const snapshotWrites = requests.filter((request) => !/on_conflict=cache_key/.test(request.url));
    assert.equal(genericWrites.length, 3);
    assert.equal(snapshotWrites.length, 2);

    const snapshotRows = snapshotWrites.map((request) => JSON.parse(request.options.body));
    assert.equal(new Set(snapshotRows.map((row) => row.cache_key)).size, 2);
    for (const [index, request] of snapshotWrites.entries()) {
      assert.equal(request.options.headers.Prefer, 'return=minimal');
      assert.match(
        snapshotRows[index].cache_key,
        /^researchhub-open-preregistrations:week:2026-07-05:snapshot:\d+:[0-9a-f-]+$/
      );
      assert.equal(snapshotRows[index].payload.complete, true);
      assert.equal(snapshotRows[index].payload.source, 'weekly-cutoff-capture');
    }
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
  }
});
