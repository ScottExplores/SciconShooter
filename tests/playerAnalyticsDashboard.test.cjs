const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const importTool = (name) => import(pathToFileURL(
  path.join(__dirname, '..', 'tools', name)
).href);

const NOW = new Date('2026-08-06T12:00:00.000Z');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const SESSION_A = '11111111-1111-4111-8111-111111111111';
const SESSION_B = '22222222-2222-4222-8222-222222222222';
const SESSION_LEGACY = '33333333-3333-4333-8333-333333333333';
const row = (event_name, session_id, occurred_at, properties = {}) => ({
  event_name, session_id, occurred_at, properties
});

const fixtures = [
  row('app_opened', SESSION_A, '2026-08-05T10:00:00.000Z', { visitor_hash: HASH_A, player_status: 'new' }),
  row('session_activity', SESSION_A, '2026-08-05T10:01:00.000Z', { visitor_hash: HASH_A, active_seconds_total: 60 }),
  row('session_activity', SESSION_A, '2026-08-05T10:02:00.000Z', { visitor_hash: HASH_A, active_seconds_total: 120 }),
  row('session_activity', SESSION_A, '2026-08-05T10:03:00.000Z', { visitor_hash: HASH_A, active_seconds_total: 120 }),
  row('mission_started', SESSION_A, '2026-08-05T10:04:00.000Z', { visitor_hash: HASH_A, run_mode: 'campaign' }),
  row('mission_completed', SESSION_A, '2026-08-05T10:06:00.000Z', { visitor_hash: HASH_A, run_mode: 'campaign' }),
  row('score_submitted', SESSION_A, '2026-08-05T10:07:00.000Z', { visitor_hash: HASH_A }),
  row('app_opened', SESSION_B, '2026-08-06T09:00:00.000Z', { visitor_hash: HASH_B, player_status: 'returning' }),
  row('returning_player', SESSION_B, '2026-08-06T09:00:01.000Z', { visitor_hash: HASH_B }),
  row('session_activity', SESSION_B, '2026-08-06T09:01:00.000Z', { visitor_hash: HASH_B, active_seconds_total: 45 }),
  row('mission_started', SESSION_B, '2026-08-06T09:02:00.000Z', { visitor_hash: HASH_B, run_mode: 'weekly-run' }),
  row('app_opened', SESSION_LEGACY, '2026-08-06T10:00:00.000Z'),
  row('mission_started', '44444444-4444-4444-8444-444444444444', '2026-08-06T11:00:00.000Z', { run_mode: 'owner-test' })
];

test('product analytics uses session maxima and produces privacy-safe funnel aggregates', async () => {
  const { aggregateProductAnalytics } = await importTool('product-analytics-reader.mjs');
  const analytics = aggregateProductAnalytics(fixtures, { days: 30, now: NOW });

  assert.equal(analytics.uniqueDevices, 2);
  assert.equal(analytics.newDevices, 1);
  assert.equal(analytics.returningDevices, 1);
  assert.equal(analytics.sessions, 3);
  assert.equal(analytics.measuredActiveSessions, 2);
  assert.equal(analytics.totalActiveSeconds, 165);
  assert.equal(analytics.averageActiveSessionSeconds, 82.5);
  assert.equal(analytics.missionStarts, 2);
  assert.equal(analytics.runFinishes, 1);
  assert.equal(analytics.finishRate, 0.5);
  assert.equal(analytics.scoreSubmissions, 1);
  assert.equal(analytics.visitorCoverage, 2 / 3);
  assert.equal(analytics.legacySessionsExcluded, 1);
  assert.deepEqual(analytics.modes, [
    { mode: 'Campaign', starts: 1, finishes: 1 },
    { mode: 'Weekly Run', starts: 1, finishes: 0 }
  ]);

  const serialized = JSON.stringify(analytics);
  for (const rawIdentifier of [HASH_A, HASH_B, SESSION_A, SESSION_B, SESSION_LEGACY]) {
    assert.doesNotMatch(serialized, new RegExp(rawIdentifier, 'i'));
  }
});

test('the self-contained dashboard renders aggregates without credentials or raw identifiers', async () => {
  const [{ aggregateProductAnalytics }, { renderPlayerAnalyticsDashboard }] = await Promise.all([
    importTool('product-analytics-reader.mjs'),
    importTool('build-player-analytics-dashboard.mjs')
  ]);
  const analytics = aggregateProductAnalytics(fixtures, { days: 30, now: NOW });
  const html = renderPlayerAnalyticsDashboard({
    analytics: { 7: analytics, 30: analytics, 90: analytics },
    generatedAt: NOW.toISOString(),
    source: { system: 'Supabase', table: 'scicon_product_events', host: 'example.supabase.co' }
  });

  assert.match(html, /Player Analytics/i);
  assert.match(html, /Mission/i);
  assert.match(html, /30/);
  assert.doesNotMatch(html, /SUPABASE_(?:SECRET|SERVICE)/i);
  for (const rawIdentifier of [HASH_A, HASH_B, SESSION_A, SESSION_B, SESSION_LEGACY]) {
    assert.doesNotMatch(html, new RegExp(rawIdentifier, 'i'));
  }
});
