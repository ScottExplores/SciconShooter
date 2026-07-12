const test = require('node:test');
const assert = require('node:assert/strict');
const {
  finalizeWeeklyCompetition,
  getPreviousWeekKey,
  getWeekRange
} = require('../api/_lib/weeklyCompetitionService');
const {
  getCurrentWeekRange,
  getWeeklyBoundaryMeta
} = require('../shared/weeklyCompetitionBoundary.js');

test('weekly competition resets Sunday at noon Pacific', () => {
  const beforeSummerCutoff = new Date('2026-07-12T18:59:00.000Z');
  const afterSummerCutoff = new Date('2026-07-12T19:01:00.000Z');
  const beforeWinterCutoff = new Date('2026-01-04T19:59:00.000Z');
  const afterWinterCutoff = new Date('2026-01-04T20:01:00.000Z');

  assert.equal(getCurrentWeekRange(beforeSummerCutoff).weekKey, '2026-07-05');
  assert.equal(getCurrentWeekRange(afterSummerCutoff).weekKey, '2026-07-12');
  assert.equal(getCurrentWeekRange(beforeWinterCutoff).weekKey, '2025-12-28');
  assert.equal(getCurrentWeekRange(afterWinterCutoff).weekKey, '2026-01-04');
  assert.equal(getPreviousWeekKey(afterSummerCutoff), '2026-07-05');
  assert.equal(getPreviousWeekKey(afterWinterCutoff), '2025-12-28');
});

test('weekly competition ranges preserve noon Pacific across daylight-saving changes', () => {
  const summerRange = getWeekRange('2026-07-05');
  assert.equal(summerRange.start.toISOString(), '2026-07-05T19:00:00.000Z');
  assert.equal(summerRange.end.toISOString(), '2026-07-12T19:00:00.000Z');

  const daylightSavingRange = getWeekRange('2026-03-01');
  assert.equal(daylightSavingRange.start.toISOString(), '2026-03-01T20:00:00.000Z');
  assert.equal(daylightSavingRange.end.toISOString(), '2026-03-08T19:00:00.000Z');

  assert.throws(() => getWeekRange('2026-07-06'), /Sunday formatted as YYYY-MM-DD/);
});

test('weekly card metadata rolls to the next Sunday at the cutoff', () => {
  assert.deepEqual(
    {
      daysLeft: getWeeklyBoundaryMeta(new Date('2026-07-12T18:59:00.000Z'), 'en-US').daysLeft,
      endLabel: getWeeklyBoundaryMeta(new Date('2026-07-12T18:59:00.000Z'), 'en-US').endLabel
    },
    { daysLeft: 0, endLabel: 'Jul 12' }
  );
  assert.deepEqual(
    {
      daysLeft: getWeeklyBoundaryMeta(new Date('2026-07-12T19:01:00.000Z'), 'en-US').daysLeft,
      endLabel: getWeeklyBoundaryMeta(new Date('2026-07-12T19:01:00.000Z'), 'en-US').endLabel
    },
    { daysLeft: 7, endLabel: 'Jul 19' }
  );
});

test('an open weekly competition cannot be finalized', async () => {
  const openWeekKey = getCurrentWeekRange().weekKey;

  await assert.rejects(
    finalizeWeeklyCompetition(openWeekKey),
    /open competition cannot be finalized/i
  );
});

test('finalization locks the top verified score for a closed week', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const requests = [];
  const winner = {
    name: 'Pilot One', score: 4321, wave: 8, date: '2020-01-07T12:00:00.000Z',
    wallet_address: null, run_id: 'verified-run', verified: true
  };
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (requests.length === 1) return new Response('[]', { status: 200 });
    if (requests.length === 2) return new Response(JSON.stringify([winner]), { status: 200 });
    const saved = JSON.parse(options.body);
    return new Response(JSON.stringify([saved]), { status: 200 });
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const result = await finalizeWeeklyCompetition('2020-01-05');
  assert.equal(result.finalized, true);
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.winner_run_id, 'verified-run');
  assert.equal(result.competition.winning_score, 4321);
  assert.equal(result.competition.starts_at, '2020-01-05T20:00:00.000Z');
  assert.equal(result.competition.ends_at, '2020-01-12T20:00:00.000Z');
  assert.match(requests[1].url, /verified=eq\.true/);
  assert.match(requests[1].url, /order=score\.desc,date\.asc/);
  assert.equal(
    new Date(result.competition.claim_deadline).getTime() - new Date(result.competition.finalized_at).getTime(),
    72 * 60 * 60 * 1000
  );
});
