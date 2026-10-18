import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../../api/researchhub-proposals.js');
const eligibility = require('../../api/_lib/researchHubEligibility.js');
const transport = require('../../services/revamp/researchhub/serverFeed.js');
const fixture = JSON.parse(await readFile(new URL('./fixtures/funding_feed.json', import.meta.url), 'utf8'));
const originalFetch = globalThis.fetch;
const originalEnv = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY };
beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  handler._test.resetMemorySnapshot();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const run = async (req = {}) => {
  const headers = {};
  let payload;
  const res = { statusCode: 0, setHeader: (key, value) => { headers[key] = value; }, end: (body) => { payload = JSON.parse(body); } };
  await handler({ method: 'GET', url: '/api/researchhub-proposals', ...req }, res);
  return { status: res.statusCode, headers, payload };
};
const configureCache = () => {
  process.env.SUPABASE_URL = 'https://cache.example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-only';
};

test('public keyless feed returns live metadata and supports bounded reference lookup', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(fixture);
  };
  const result = await run({ query: { includeProposalIds: '9001' } });
  assert.equal(result.status, 200);
  assert.equal(result.payload.cached, false);
  assert.equal(result.payload.referencedProposals[0].content_object.id, 9001);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, transport.FEED_URL);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(Date.parse(result.payload.fetchedAt));
});

test('previewReadOnly avoids every persistent cache write', async () => {
  configureCache();
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, undefined);
    assert.equal(url, transport.FEED_URL);
    return Response.json(fixture);
  };
  assert.equal((await run({ url: '/api/researchhub-proposals?previewReadOnly=1' })).status, 200);
});

test('server outage uses the persisted cache and marks it as stale', async () => {
  configureCache();
  const fetchedAt = new Date().toISOString();
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('https://backend.prod.researchhub.com')) throw new Error('offline');
    assert.equal(options.method, undefined);
    assert.match(url, /scicon_proposal_cache/);
    return Response.json([{ payload: fixture, fetched_at: fetchedAt }]);
  };
  const result = await run();
  assert.equal(result.status, 200);
  assert.equal(result.payload.cached, true);
  assert.equal(result.payload.fetchedAt, fetchedAt);
  assert.deepEqual(result.payload.results, fixture.results);
});

test('same-instance memory cache survives upstream outage without Supabase', async () => {
  globalThis.fetch = async () => Response.json(fixture);
  await run();
  globalThis.fetch = async () => { throw new Error('offline'); };
  const result = await run();
  assert.equal(result.status, 200);
  assert.equal(result.payload.cached, true);
  assert.deepEqual(result.payload.results, fixture.results);
});

test('malformed successful feed cannot overwrite the previous good snapshot', async () => {
  globalThis.fetch = async () => Response.json(fixture);
  await run();
  globalThis.fetch = async () => Response.json({ error: 'bad shape' });
  const result = await run();
  assert.equal(result.status, 200);
  assert.equal(result.payload.cached, true);
  assert.deepEqual(result.payload.results, fixture.results);
});

test('stale references fail closed even when a cached feed is available', async () => {
  globalThis.fetch = async () => Response.json(fixture);
  await run();
  globalThis.fetch = async () => { throw new Error('offline'); };
  const result = await run({ query: { includeProposalIds: '9004' } });
  assert.equal(result.status, 502);
  assert.equal(result.payload.referencedProposals, undefined);
});

test('explicit detail lookup outage fails closed while an ordinary live feed remains available', async () => {
  globalThis.fetch = async (url) => {
    if (url === transport.FEED_URL) return Response.json(fixture);
    throw new Error('detail lookup offline');
  };
  const result = await run({ query: { includeProposalIds: '9999' } });
  assert.equal(result.status, 502);
  assert.match(result.payload.error, /referenced proposal lookup is unavailable/i);
  assert.equal(result.payload.referencedProposals, undefined);
  assert.equal(result.payload.missingReferencedProposalIds, undefined);
  const feed = await run();
  assert.equal(feed.status, 200);
  assert.equal(feed.payload.cached, false);
  assert.deepEqual(feed.payload.results, fixture.results);
});

test('detail lookup normalization preserves exact ResearchHub IDs', () => {
  const entry = handler._test.normalizePostAsFundingEntry({
    id: '90071992547409931234', title: 'Exact ID', fundraise: { status: 'OPEN' }
  });
  assert.equal(entry.id, '90071992547409931234');
  assert.equal(entry.content_object.id, '90071992547409931234');
});

test('expired persistent snapshot and missing cache return recoverable 502', async () => {
  configureCache();
  globalThis.fetch = async (url) => {
    if (url.startsWith('https://backend.prod.researchhub.com')) throw new Error('offline');
    return Response.json([{ payload: fixture, fetched_at: '2000-01-01T00:00:00Z' }]);
  };
  assert.equal((await run()).status, 502);
});

test('invalid references and non-GET requests never fetch', async () => {
  globalThis.fetch = () => { throw new Error('unexpected fetch'); };
  assert.equal((await run({ query: { includeProposalIds: '9001,9002' } })).status, 400);
  assert.equal((await run({ query: { includeProposalIds: '../secret' } })).status, 400);
  assert.equal((await run({ method: 'POST' })).status, 405);
});

test('eligibility pagination validates shape, rejects unsafe URLs, and refuses incomplete sets', async () => {
  globalThis.fetch = async () => Response.json({ results: [] });
  assert.deepEqual(await eligibility.fetchOpenProposalEntries(), []);
  globalThis.fetch = async () => Response.json({ error: 'malformed' });
  await assert.rejects(eligibility.fetchOpenProposalEntries(), /invalid funding feed/);
  for (const next of ['https://evil.example/api/funding_feed/', 'https://backend.prod.researchhub.com:8443/api/funding_feed/', 'https://user:pass@backend.prod.researchhub.com/api/funding_feed/']) {
    globalThis.fetch = async () => Response.json({ ...fixture, next });
    await assert.rejects(eligibility.fetchOpenProposalEntries(), /unsafe next-page URL/);
  }
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return Response.json({ ...fixture, next: `${transport.FEED_URL}&page=2` }); };
  await assert.rejects(eligibility.fetchOpenProposalEntries(), { code: 'RESEARCHHUB_FEED_INCOMPLETE' });
  assert.equal(calls, 5);
});

test('live eligibility excludes closed, fully funded, and cutoff-equal proposals', async () => {
  globalThis.fetch = async () => Response.json(fixture);
  const options = { requiredOpenUntil: new Date('2026-10-18T19:00:00Z') };
  assert.equal((await eligibility.findEligibleProposal('9001', options)).id, '9001');
  await assert.rejects(eligibility.findEligibleProposal('9003', options), /fully funded/);
  await assert.rejects(eligibility.findEligibleProposal('9004', options), /no longer open/);
  await assert.rejects(eligibility.findEligibleProposal('9001', { requiredOpenUntil: new Date('2026-10-30T19:00:00Z') }), /closes before/);
});

test('server timeout covers both fetch and body consumption', async () => {
  let signal;
  globalThis.fetch = async (_url, options) => { signal = options.signal; return { ok: true, json: () => new Promise(() => {}) }; };
  await assert.rejects(transport.fetchResearchHubJson(transport.FEED_URL, { timeoutMs: 10 }), /timed out/);
  assert.equal(signal.aborted, true);
});

test('cache writes preserve immutable cutoff capture only for complete feeds', async () => {
  configureCache();
  const writes = [];
  globalThis.fetch = async (_url, options) => { writes.push(JSON.parse(options.body)); return new Response(null, { status: 204 }); };
  const fetchedAtDate = new Date('2026-10-18T18:59:00Z');
  await handler._test.writeProposalCache(fixture, { fetchedAtDate });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].payload.complete, true);
  assert.match(writes[1].cache_key, /:week:.*:snapshot:/);
  writes.length = 0;
  await handler._test.writeProposalCache({ ...fixture, next: `${transport.FEED_URL}&page=2` }, { fetchedAtDate });
  assert.equal(writes.length, 1);
});
