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
const RUN_A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const RUN_A2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const RUN_B1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const SESSION_PREVIEW = '66666666-6666-4666-8666-666666666666';
const row = (event_name, session_id, occurred_at, properties = {}) => ({
  event_name, session_id, occurred_at, properties
});
const live = (properties = {}) => ({
  schema_version: 3,
  event_source: 'production',
  ...properties
});

const fixtures = [
  row('app_opened', SESSION_A, '2026-08-05T10:00:00.000Z', live({ visitor_hash: HASH_A, player_status: 'new' })),
  row('session_activity', SESSION_A, '2026-08-05T10:01:00.000Z', live({ visitor_hash: HASH_A, active_seconds_total: 60, gameplay_seconds_total: 45 })),
  row('session_activity', SESSION_A, '2026-08-05T10:02:00.000Z', live({ visitor_hash: HASH_A, active_seconds_total: 120, gameplay_seconds_total: 90 })),
  row('session_activity', SESSION_A, '2026-08-05T10:03:00.000Z', live({ visitor_hash: HASH_A, active_seconds_total: 120, gameplay_seconds_total: 90 })),
  row('mission_started', SESSION_A, '2026-08-05T10:04:00.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A1, run_mode: 'campaign', mission_number: 1 })),
  row('run_progress', SESSION_A, '2026-08-05T10:04:01.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A1, run_mode: 'campaign', mission_number: 1, wave_number: 1, absolute_wave_number: 1 })),
  row('run_progress', SESSION_A, '2026-08-05T10:05:00.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A1, run_mode: 'campaign', mission_number: 1, wave_number: 3, absolute_wave_number: 3 })),
  row('run_ended', SESSION_A, '2026-08-05T10:06:00.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A1, run_mode: 'campaign', mission_number: 1, wave_number: 3, absolute_wave_number: 3, result: 'completed' })),
  row('mission_started', SESSION_A, '2026-08-05T10:07:00.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A2, run_mode: 'campaign', mission_number: 2 })),
  row('run_progress', SESSION_A, '2026-08-05T10:07:01.000Z', live({ visitor_hash: HASH_A, analytics_run_id: RUN_A2, run_mode: 'campaign', mission_number: 2, wave_number: 1, absolute_wave_number: 1 })),
  row('score_submitted', SESSION_A, '2026-08-05T10:08:00.000Z', live({ visitor_hash: HASH_A })),
  row('app_opened', SESSION_B, '2026-08-06T09:00:00.000Z', live({ visitor_hash: HASH_B, player_status: 'returning' })),
  row('returning_player', SESSION_B, '2026-08-06T09:00:01.000Z', live({ visitor_hash: HASH_B })),
  row('session_activity', SESSION_B, '2026-08-06T09:01:00.000Z', live({ visitor_hash: HASH_B, active_seconds_total: 45, gameplay_seconds_total: 30 })),
  row('mission_started', SESSION_B, '2026-08-06T09:02:00.000Z', live({ visitor_hash: HASH_B, analytics_run_id: RUN_B1, run_mode: 'weekly-streak', mission_number: 1 })),
  row('run_progress', SESSION_B, '2026-08-06T09:02:01.000Z', live({ visitor_hash: HASH_B, analytics_run_id: RUN_B1, run_mode: 'weekly-streak', mission_number: 1, wave_number: 1, absolute_wave_number: 1, continuous_run: true })),
  row('run_progress', SESSION_B, '2026-08-06T09:04:00.000Z', live({ visitor_hash: HASH_B, analytics_run_id: RUN_B1, run_mode: 'weekly-streak', mission_number: 2, wave_number: 2, absolute_wave_number: 7, continuous_run: true })),
  row('run_ended', SESSION_B, '2026-08-06T09:05:00.000Z', live({ visitor_hash: HASH_B, analytics_run_id: RUN_B1, run_mode: 'weekly-streak', mission_number: 2, wave_number: 2, absolute_wave_number: 7, result: 'defeated', continuous_run: true })),
  row('app_opened', SESSION_LEGACY, '2026-08-06T10:00:00.000Z'),
  row('app_opened', '55555555-5555-4555-8555-555555555555', '2026-08-06T10:30:00.000Z', {
    visitor_hash: 'c'.repeat(64), event_source: 'development', schema_version: 3
  }),
  row('app_opened', SESSION_PREVIEW, '2026-08-06T10:45:00.000Z', {
    visitor_hash: 'd'.repeat(64), event_source: 'preview', schema_version: 3
  }),
  row('mission_started', '44444444-4444-4444-8444-444444444444', '2026-08-06T11:00:00.000Z', { run_mode: 'owner-test' })
];

test('product analytics builds privacy-safe daily, playtime, progression, and Weekly aggregates', async () => {
  const { aggregateProductAnalytics } = await importTool('product-analytics-reader.mjs');
  const analytics = aggregateProductAnalytics(fixtures, { days: 30, now: NOW });

  assert.equal(analytics.uniqueDevices, 2);
  assert.equal(analytics.newDevices, 1);
  assert.equal(analytics.returningDevices, 1);
  assert.equal(analytics.sessions, 2);
  assert.equal(analytics.measuredActiveSessions, 2);
  assert.equal(analytics.totalActiveSeconds, 165);
  assert.equal(analytics.averageActiveSessionSeconds, 82.5);
  assert.equal(analytics.measuredGameplaySessions, 2);
  assert.equal(analytics.flightSessions, 2);
  assert.equal(analytics.totalGameplaySeconds, 120);
  assert.equal(analytics.averageGameplaySessionSeconds, 60);
  assert.equal(analytics.missionStarts, 3);
  assert.equal(analytics.runFinishes, 2);
  assert.equal(analytics.finishRate, 2 / 3);
  assert.equal(analytics.campaignStarts, 2);
  assert.equal(analytics.campaignClears, 1);
  assert.equal(analytics.campaignClearRate, 0.5);
  assert.equal(analytics.scoreSubmissions, 1);
  assert.equal(analytics.visitorCoverage, 1);
  assert.equal(analytics.legacySessionsExcluded, 1);
  assert.deepEqual(analytics.mixedHistory, {
    events: 1,
    sessions: 1,
    uniqueDevices: 0,
    missionStarts: 0,
    scoreSubmissions: 0,
    latestEventAt: '2026-08-06T10:00:00.000Z'
  });
  assert.deepEqual(analytics.modes, [
    {
      mode: 'Campaign', starts: 2, finishes: 1, clears: 1,
      defeats: 0, exits: 0, noEnd: 1
    },
    {
      mode: 'Weekly Run', starts: 1, finishes: 1, clears: 0,
      defeats: 1, exits: 0, noEnd: 0
    }
  ]);
  assert.deepEqual(analytics.missionProgress, [
    {
      missionNumber: 1, reachedDevices: 1, starts: 1, ends: 1,
      clears: 1, defeats: 0, exits: 0, noEnd: 0, clearRate: 1
    },
    {
      missionNumber: 2, reachedDevices: 1, starts: 1, ends: 0,
      clears: 0, defeats: 0, exits: 0, noEnd: 1, clearRate: 0
    }
  ]);
  assert.deepEqual(analytics.furthestMissionDistribution, [
    { missionNumber: 2, devices: 1 }
  ]);
  assert.deepEqual(analytics.weeklyRun, {
    attempts: 1,
    endedRuns: 1,
    measuredRuns: 1,
    averageDepth: 7,
    medianDepth: 7,
    deepestDepth: 7,
    depthBands: [
      { label: '1–2', runs: 0 },
      { label: '3–5', runs: 0 },
      { label: '6–9', runs: 1 },
      { label: '10–14', runs: 0 },
      { label: '15+', runs: 0 }
    ]
  });

  const august5 = analytics.daily.find((day) => day.date === '2026-08-05');
  const august6 = analytics.daily.find((day) => day.date === '2026-08-06');
  assert.deepEqual(august5, {
    date: '2026-08-05', uniqueDevices: 1, sessions: 1,
    measuredActiveSessions: 1, measuredGameplaySessions: 1, flightSessions: 1,
    activeSeconds: 120, gameplaySeconds: 90,
    averageActiveSessionSeconds: 120, averageGameplaySessionSeconds: 90,
    missionStarts: 2, runFinishes: 1, campaignClears: 1,
    campaignClearRate: 0.5, defeats: 0, scoreSubmissions: 1
  });
  assert.deepEqual(august6, {
    date: '2026-08-06', uniqueDevices: 1, sessions: 1,
    measuredActiveSessions: 1, measuredGameplaySessions: 1, flightSessions: 1,
    activeSeconds: 45, gameplaySeconds: 30,
    averageActiveSessionSeconds: 45, averageGameplaySessionSeconds: 30,
    missionStarts: 1, runFinishes: 1, campaignClears: 0,
    campaignClearRate: 0, defeats: 1, scoreSubmissions: 0
  });
  assert.deepEqual(analytics.dataQuality, {
    visitorCoverage: 1,
    activeTimeCoverage: 1,
    gameplayTimeCoverage: 1,
    missionNumberCoverage: 1,
    progressCoverage: 1,
    outcomeDetailCoverage: 1,
    productionSourceCoverage: 2 / 3,
    schemaV3Coverage: 1,
    productionTaggedEventCoverage: 18 / 19,
    latestEventAt: '2026-08-06T09:05:00.000Z',
    latestObservedEventAt: '2026-08-06T10:00:00.000Z',
    rowLimitHit: false
  });

  const serialized = JSON.stringify(analytics);
  for (const rawIdentifier of [
    HASH_A, HASH_B, SESSION_A, SESSION_B, SESSION_LEGACY, SESSION_PREVIEW,
    RUN_A1, RUN_A2, RUN_B1
  ]) {
    assert.doesNotMatch(serialized, new RegExp(rawIdentifier, 'i'));
  }
});

test('run cohorts stay consistent at a reporting-window boundary', async () => {
  const { aggregateProductAnalytics } = await importTool('product-analytics-reader.mjs');
  const priorRunId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
  const currentRunId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
  const boundaryEvents = [
    row('mission_started', SESSION_A, '2026-08-05T23:59:00.000Z', live({
      visitor_hash: HASH_A, analytics_run_id: priorRunId,
      run_mode: 'campaign', mission_number: 1
    })),
    row('run_ended', SESSION_A, '2026-08-06T00:01:00.000Z', live({
      visitor_hash: HASH_A, analytics_run_id: priorRunId,
      run_mode: 'campaign', mission_number: 1, wave_number: 3,
      absolute_wave_number: 3, result: 'completed'
    })),
    row('mission_started', SESSION_A, '2026-08-06T00:02:00.000Z', live({
      visitor_hash: HASH_A, analytics_run_id: currentRunId,
      run_mode: 'campaign', mission_number: 2
    }))
  ];

  const analytics = aggregateProductAnalytics(boundaryEvents, { days: 1, now: NOW });
  assert.equal(analytics.missionStarts, 1);
  assert.equal(analytics.runFinishes, 0);
  assert.equal(analytics.campaignClears, 0);
  assert.deepEqual(analytics.missionProgress.map((mission) => ({
    missionNumber: mission.missionNumber,
    starts: mission.starts,
    ends: mission.ends,
    clears: mission.clears
  })), [{ missionNumber: 2, starts: 1, ends: 0, clears: 0 }]);

  const completeWindow = aggregateProductAnalytics(boundaryEvents, {
    days: 1, now: NOW, rowLimitHit: true
  });
  const clippedWindow = aggregateProductAnalytics(boundaryEvents.slice(1), {
    days: 1, now: NOW, rowLimitHit: true
  });
  assert.equal(completeWindow.dataQuality.rowLimitHit, false);
  assert.equal(clippedWindow.dataQuality.rowLimitHit, true);
});

test('average flight time excludes measured menu-only sessions while coverage includes them', async () => {
  const { aggregateProductAnalytics } = await importTool('product-analytics-reader.mjs');
  const menuSession = '77777777-7777-4777-8777-777777777777';
  const flightEvents = [
    row('app_opened', SESSION_A, '2026-08-06T08:00:00.000Z', live({ visitor_hash: HASH_A })),
    row('session_activity', SESSION_A, '2026-08-06T08:01:00.000Z', live({
      visitor_hash: HASH_A, active_seconds_total: 60, gameplay_seconds_total: 60
    })),
    row('app_opened', menuSession, '2026-08-06T09:00:00.000Z', live({ visitor_hash: HASH_B })),
    row('session_activity', menuSession, '2026-08-06T09:01:00.000Z', live({
      visitor_hash: HASH_B, active_seconds_total: 60, gameplay_seconds_total: 0
    }))
  ];

  const analytics = aggregateProductAnalytics(flightEvents, { days: 1, now: NOW });
  assert.equal(analytics.measuredGameplaySessions, 2);
  assert.equal(analytics.flightSessions, 1);
  assert.equal(analytics.totalGameplaySeconds, 60);
  assert.equal(analytics.averageGameplaySessionSeconds, 60);
  assert.equal(analytics.dataQuality.gameplayTimeCoverage, 1);
});

test('the bounded Supabase reader requests newest events first', async () => {
  const { readProductAnalyticsEvents } = await importTool('product-analytics-reader.mjs');
  let requestedUrl = '';
  await readProductAnalyticsEvents({
    supabaseUrl: 'https://example.supabase.co',
    secretKey: 'sb_secret_local-test-only',
    now: NOW,
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return { ok: true, status: 200, text: async () => '[]' };
    }
  });
  assert.equal(new URL(requestedUrl).searchParams.get('order'), 'occurred_at.desc');
});

test('social campaign attribution accepts only bounded X campaign parameters', async () => {
  const { readSocialCampaignAttribution } = await import(pathToFileURL(
    path.join(__dirname, '..', 'shared', 'socialCampaignAttribution.mjs')
  ).href);
  assert.deepEqual(
    readSocialCampaignAttribution('?utm_source=x&utm_medium=social&utm_campaign=growth-sprint-2026-08&utm_content=boss-archive'),
    { campaign_source: 'x', campaign_medium: 'social', campaign_name: 'growth-sprint-2026-08', campaign_content: 'boss-archive' }
  );
  assert.deepEqual(readSocialCampaignAttribution('?utm_source=newsletter&utm_medium=email'), {});
  assert.deepEqual(
    readSocialCampaignAttribution('?utm_source=x&utm_medium=social&utm_campaign=../../private'),
    { campaign_source: 'x', campaign_medium: 'social' }
  );
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
  assert.match(html, /Daily performance/i);
  assert.match(html, /Campaign Mission progress/i);
  assert.match(html, /Weekly Run depth/i);
  assert.match(html, /Data health/i);
  assert.match(html, /separate from the Base Dashboard/i);
  assert.match(html, /30/);
  assert.doesNotMatch(html, /SUPABASE_(?:SECRET|SERVICE)/i);
  for (const rawIdentifier of [
    HASH_A, HASH_B, SESSION_A, SESSION_B, SESSION_LEGACY, SESSION_PREVIEW,
    RUN_A1, RUN_A2, RUN_B1
  ]) {
    assert.doesNotMatch(html, new RegExp(rawIdentifier, 'i'));
  }
});
