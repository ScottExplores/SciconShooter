import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const fixture = JSON.parse(await readFile(new URL('./fixtures/funding_feed.json', import.meta.url), 'utf8'));
const bundle = async (file) => {
  const result = await build({ entryPoints: [file], bundle: true, write: false, format: 'esm', platform: 'node', define: { 'import.meta.env.DEV': 'false' } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const client = await bundle('services/researchHubProposals.ts');
const snapshots = await bundle('services/revamp/researchhub/feedSnapshot.ts');
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
afterEach(() => { globalThis.fetch = originalFetch; globalThis.window = originalWindow; });
const cutoff = '2026-10-18T19:00:00Z';
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('normalizes the public feed, preserves long IDs and authors, and matches server eligibility', async () => {
  globalThis.fetch = async () => Response.json(fixture);
  const result = await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff });
  assert.equal(result.source, 'live');
  assert.equal(result.eligibleProposals.length, 2);
  const [first, second] = result.eligibleProposals;
  assert.equal(first.author, 'Ada Chen, Luis Reyes');
  assert.deepEqual(first.authors, ['Ada Chen', 'Luis Reyes']);
  assert.equal(first.requestedUsd, 10000);
  assert.equal(first.raisedUsd, 2500);
  assert.equal(first.backers, 23);
  assert.equal(second.id, '90071992547409931234');
  assert.equal(second.author, 'Mina Patel');
  assert.equal(second.requestedRsc, 50000);
  assert.match(first.url, /\/post\/9001\/open-cell-imaging$/);
  assert.equal(client.isWeeklyProposalEligible({ ...first, status: 'PENDING' }, cutoff), false);
});

test('live fetch saves a snapshot, outage rechecks deadlines and does not trust cached references', async () => {
  globalThis.window = { localStorage: storage() };
  globalThis.fetch = async () => Response.json(fixture);
  await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff });
  globalThis.fetch = async () => { throw new Error('offline'); };
  const saved = await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff, includeProposalIds: ['9001'] });
  assert.equal(saved.source, 'local-cache');
  assert.equal(saved.eligibleProposals.length, 2);
  assert.deepEqual(saved.referencedProposals, []);
  const expired = await client.getResearchHubProposalFeed({ requiredOpenUntil: '2026-12-01T00:00:00Z' });
  assert.deepEqual(expired.eligibleProposals, []);
});

test('server cache is explicitly labeled and cannot confirm archive reference state', async () => {
  globalThis.fetch = async () => Response.json({ ...fixture, cached: true, fetchedAt: new Date().toISOString(), referencedProposals: [fixture.results[3]] });
  const result = await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff, includeProposalIds: ['9004'] });
  assert.equal(result.source, 'server-cache');
  assert.deepEqual(result.referencedProposals, []);
});

test('reference request respects the single-ID server contract', async () => {
  let url;
  globalThis.fetch = async (value) => { url = value; return Response.json(fixture); };
  const result = await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff, includeProposalIds: ['bad', '9001', '9001', '9004'] });
  assert.equal(url, '/api/researchhub-proposals?includeProposalIds=9001');
  assert.deepEqual(result.referencedProposals.map((proposal) => proposal.id), ['9001']);
});

test('malformed successful response cannot overwrite the last known snapshot', async () => {
  globalThis.window = { localStorage: storage() };
  snapshots.writeProposalSnapshot(fixture.results, new Date().toISOString(), globalThis.window.localStorage);
  globalThis.fetch = async () => Response.json({ error: 'broken response' });
  const result = await client.getResearchHubProposalFeed({ requiredOpenUntil: cutoff });
  assert.equal(result.source, 'local-cache');
  assert.equal(result.eligibleProposals.length, 2);
});

test('empty live feed clears obsolete entries; outages without a snapshot remain explicit', async () => {
  globalThis.window = { localStorage: storage() };
  globalThis.fetch = async () => Response.json({ results: [] });
  assert.deepEqual((await client.getResearchHubProposalFeed()).eligibleProposals, []);
  assert.deepEqual(snapshots.readProposalSnapshot(globalThis.window.localStorage).results, []);
  globalThis.window = undefined;
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(client.getResearchHubProposalFeed(), /offline/);
});

test('snapshot is versioned, expires after seven days, and tolerates blocked/corrupt storage', () => {
  const store = storage();
  const now = Date.now();
  snapshots.writeProposalSnapshot(fixture.results, new Date(now).toISOString(), store);
  assert.equal(snapshots.readProposalSnapshot(store, now).version, 1);
  assert.equal(snapshots.readProposalSnapshot(store, now + snapshots.PROPOSAL_SNAPSHOT_MAX_AGE_MS + 1), null);
  store.setItem(snapshots.PROPOSAL_SNAPSHOT_KEY, '{broken');
  assert.equal(snapshots.readProposalSnapshot(store), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(snapshots.readProposalSnapshot(blocked), null);
  assert.doesNotThrow(() => snapshots.writeProposalSnapshot(fixture.results, new Date(now).toISOString(), blocked));
});

test('client deadline includes a stalled response body', async () => {
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  };
  await assert.rejects(snapshots.fetchProposalJson('/api/researchhub-proposals', 10), /timed out/);
  assert.equal(signal.aborted, true);
});

test('funding deadline display handles missing, ended, near and multi-day deadlines', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  assert.equal(snapshots.fundingTimeRemaining(undefined, now), 'Deadline not listed');
  assert.equal(snapshots.fundingTimeRemaining('invalid', now), 'Deadline not listed');
  assert.equal(snapshots.fundingTimeRemaining('2026-10-16T12:00:00Z', now), 'Funding ended');
  assert.equal(snapshots.fundingTimeRemaining('2026-10-17T23:00:00Z', now), 'Less than a day left');
  assert.equal(snapshots.fundingTimeRemaining('2026-10-20T13:00:00Z', now), '4 days left');
});
