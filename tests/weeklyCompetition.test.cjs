const test = require('node:test');
const assert = require('node:assert/strict');
const { finalizeWeeklyCompetition, getPreviousWeekKey } = require('../api/weeklyCompetitionService');

test('weekly competition keys use Monday UTC boundaries', () => {
  assert.equal(getPreviousWeekKey(new Date('2026-07-09T18:00:00.000Z')), '2026-06-29');
  assert.equal(getPreviousWeekKey(new Date('2026-07-13T00:05:00.000Z')), '2026-07-06');
});

test('an open weekly competition cannot be finalized', async () => {
  const nextMonday = new Date();
  nextMonday.setUTCDate(nextMonday.getUTCDate() + ((8 - nextMonday.getUTCDay()) % 7 || 7));
  nextMonday.setUTCHours(0, 0, 0, 0);

  await assert.rejects(
    finalizeWeeklyCompetition(nextMonday.toISOString().slice(0, 10)),
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

  const result = await finalizeWeeklyCompetition('2020-01-06');
  assert.equal(result.finalized, true);
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.winner_run_id, 'verified-run');
  assert.equal(result.competition.winning_score, 4321);
  assert.match(requests[1].url, /verified=eq\.true/);
  assert.match(requests[1].url, /order=score\.desc,date\.asc/);
  assert.equal(
    new Date(result.competition.claim_deadline).getTime() - new Date(result.competition.finalized_at).getTime(),
    72 * 60 * 60 * 1000
  );
});
