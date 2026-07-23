const test = require('node:test');
const assert = require('node:assert/strict');
const {
  captureWeeklyProposalCutoffSnapshot,
  finalizeWeeklyCompetition,
  getPreviousWeekKey,
  getWeekRange,
  resolveProposalAtWeeklyCutoff
} = require('../api/_lib/weeklyCompetitionService');
const {
  getCurrentWeekRange,
  getWeeklyBoundaryMeta
} = require('../shared/weeklyCompetitionBoundary.js');

const shortlyAfterCutoff = (weekKey) => new Date(getWeekRange(weekKey).end.getTime() + 6 * 60 * 1000);
const cutoffSnapshotRows = (weekKey, results) => [{
  fetched_at: new Date(getWeekRange(weekKey).end.getTime() - 60 * 1000).toISOString(),
  payload: {
    complete: true,
    source: 'weekly-cutoff-capture',
    results
  }
}];

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

test('a closed week waits for in-flight score submissions before finalization', async () => {
  const weekKey = '2020-01-05';
  const { end } = getWeekRange(weekKey);
  const originalFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return new Response('[]', { status: 200 });
  };

  try {
    await assert.rejects(
      finalizeWeeklyCompetition(weekKey, {
        observedAt: new Date(end.getTime() + 5 * 60 * 1000 - 1)
      }),
      (error) => error.statusCode === 409 && /score-submission settlement window/i.test(error.message)
    );
    assert.equal(fetchCalled, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('a closed week becomes finalizable exactly when the five-minute settlement window closes', async (context) => {
  const weekKey = '2020-01-05';
  const { end } = getWeekRange(weekKey);
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const requests = [];

  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return new Response('[]', { status: 200 });
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const result = await finalizeWeeklyCompetition(weekKey, {
    observedAt: new Date(end.getTime() + 5 * 60 * 1000)
  });

  assert.equal(result.finalized, false);
  assert.match(result.reason, /no eligible scores/i);
  assert.equal(requests.length, 2);
  assert.ok(requests.some((request) => request.url.includes('scicon_weekly_competitions')));
  assert.ok(requests.some((request) => request.url.includes('scicon_leaderboard')));
});

test('finalization locks the top eligible score for a closed week', async (context) => {
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
  const proposalEntries = [{
    content_object: {
      id: 654,
      title: 'Most Funded Eligible Proposal',
      slug: 'most-funded-eligible-proposal',
      image_url: 'https://images.researchhub.com/proposals/654.png',
      fundraise: {
        status: 'OPEN',
        goal_currency: 'USD',
        goal_amount: { usd: 10000 },
        amount_raised: { usd: 8000 },
        end_date: '2099-01-01T00:00:00.000Z'
      }
    },
    author: { first_name: 'Fallback', last_name: 'Researcher' }
  }];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (String(url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([winner]), { status: 200 });
    }
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-01-05', proposalEntries)), { status: 200 });
    }
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

  const result = await finalizeWeeklyCompetition('2020-01-05', {
    observedAt: shortlyAfterCutoff('2020-01-05')
  });
  assert.equal(result.finalized, true);
  assert.equal(result.proposalSelectionSource, 'automatic_fallback');
  assert.equal(result.competition.status, 'claimed');
  assert.equal(result.competition.winner_run_id, 'verified-run');
  assert.equal(result.competition.winning_score, 4321);
  assert.equal(result.competition.proposal_id, '654');
  assert.equal(result.competition.proposal_title, 'Most Funded Eligible Proposal');
  assert.equal(result.competition.starts_at, '2020-01-05T20:00:00.000Z');
  assert.equal(result.competition.ends_at, '2020-01-12T20:00:00.000Z');
  const leaderboardRequest = requests.find((request) => request.url.includes('scicon_leaderboard'));
  assert.ok(leaderboardRequest);
  assert.doesNotMatch(leaderboardRequest.url, /verified=eq\.true/);
  assert.match(leaderboardRequest.url, /order=score\.desc,date\.asc/);
  assert.match(leaderboardRequest.url, /limit=100/);
  assert.equal(
    new Date(result.competition.claim_deadline).getTime() - new Date(result.competition.finalized_at).getTime(),
    72 * 60 * 60 * 1000
  );
});

test('finalization re-resolves the proposal when the weekly leader changes during cutoff lookup', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const lowerWinner = {
    name: 'Early Leader',
    score: 5000,
    wave: 5,
    date: '2020-01-07T12:00:00.000Z',
    wallet_address: null,
    run_id: 'early-run',
    verified: true,
    proposal_id: '101'
  };
  const finalWinner = {
    name: 'Final Leader',
    score: 6000,
    wave: 6,
    date: '2020-01-08T12:00:00.000Z',
    wallet_address: null,
    run_id: 'final-run',
    verified: true,
    proposal_id: '202'
  };
  const proposalEntries = [101, 202].map((id) => ({
    content_object: {
      id,
      title: `Proposal ${id}`,
      slug: `proposal-${id}`,
      fundraise: {
        status: 'OPEN',
        goal_currency: 'USD',
        goal_amount: { usd: 10000 },
        amount_raised: { usd: id },
        end_date: '2099-01-01T00:00:00.000Z'
      }
    },
    author: { first_name: 'Stable', last_name: 'Researcher' }
  }));
  let leaderboardReads = 0;

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (String(url).includes('scicon_leaderboard')) {
      leaderboardReads += 1;
      return new Response(JSON.stringify([
        leaderboardReads === 1 ? lowerWinner : finalWinner
      ]), { status: 200 });
    }
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-01-05', proposalEntries)), { status: 200 });
    }
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

  const result = await finalizeWeeklyCompetition('2020-01-05', {
    observedAt: shortlyAfterCutoff('2020-01-05')
  });
  assert.equal(result.finalized, true);
  assert.equal(result.competition.winner_run_id, 'final-run');
  assert.equal(result.competition.proposal_id, '202');
  assert.equal(leaderboardReads, 3);
});

test('finalization carries a legacy leader proposal into the archive and excludes the pilot test wallet', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const pilotTestScore = {
    name: 'Pilot Test', score: 9999, wave: 9, date: '2020-02-03T12:00:00.000Z',
    wallet_address: '0x3a8d692aabdd4981080a8f6af8375a21359464bf', run_id: null, verified: false
  };
  const winner = {
    name: 'Proposal Pilot', score: 7654, wave: 6, date: '2020-02-04T12:00:00.000Z',
    wallet_address: null, run_id: null, verified: false,
    proposal_id: '321', proposal_title: 'Open Science Target',
    proposal_url: 'https://www.researchhub.com/post/321/open-science-target',
    proposal_author: 'Ada Researcher',
    proposal_image_url: 'https://images.researchhub.com/proposals/321.png'
  };
  const proposalEntries = [{
    content_object: {
      id: 321,
      title: 'Open Science Target',
      slug: 'open-science-target',
      image_url: 'https://images.researchhub.com/proposals/321.png',
      fundraise: {
        status: 'OPEN',
        goal_currency: 'USD',
        goal_amount: { usd: 10000 },
        amount_raised: { usd: 4000 },
        end_date: '2099-01-01T00:00:00.000Z'
      }
    },
    author: { first_name: 'Ada', last_name: 'Researcher' }
  }];
  global.fetch = async (_url, options = {}) => {
    if (String(_url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (String(_url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([pilotTestScore, winner]), { status: 200 });
    }
    if (String(_url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-02-02', proposalEntries)), { status: 200 });
    }
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

  const result = await finalizeWeeklyCompetition('2020-02-02', {
    observedAt: shortlyAfterCutoff('2020-02-02')
  });
  assert.equal(result.finalized, true);
  assert.equal(result.competition.status, 'claimed');
  assert.equal(result.competition.winner_name, 'Proposal Pilot');
  assert.equal(result.competition.winner_run_id, null);
  assert.equal(result.competition.proposal_id, '321');
  assert.equal(result.competition.proposal_title, 'Open Science Target');
  assert.equal(result.competition.proposal_author, 'Ada Researcher');
  assert.equal(result.competition.proposal_image_url, 'https://images.researchhub.com/proposals/321.png');
  assert.equal(result.proposalSelectionSource, 'manual');
});

test('re-finalization repairs an unlocked archive and preserves its event allocation', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const existing = {
    week_key: '2020-02-02',
    starts_at: '2020-02-02T20:00:00.000Z',
    ends_at: '2020-02-09T20:00:00.000Z',
    status: 'finalized',
    winner_run_id: 'lower-verified-run',
    winner_name: 'Lower Score',
    winning_score: 7000,
    winning_wave: 5,
    finalized_at: '2020-02-09T21:00:00.000Z',
    claim_deadline: '2020-02-12T21:00:00.000Z',
    allocation_rsc: 250,
    allocation_tx_hash: null
  };
  const actualWinner = {
    name: 'Actual Winner', score: 8000, wave: 6, date: '2020-02-05T12:00:00.000Z',
    wallet_address: null, run_id: null, verified: false,
    proposal_id: '321', proposal_title: 'Legacy Winning Proposal',
    proposal_url: 'https://www.researchhub.com/post/321/legacy-winning-proposal', proposal_author: 'Researcher One',
    proposal_image_url: 'https://images.researchhub.com/proposals/321.png'
  };
  const proposalEntries = [{
    content_object: {
      id: 321,
      title: 'Legacy Winning Proposal',
      slug: 'legacy-winning-proposal',
      image_url: 'https://images.researchhub.com/proposals/321.png',
      fundraise: {
        status: 'OPEN',
        goal_currency: 'USD',
        goal_amount: { usd: 10000 },
        amount_raised: { usd: 6000 },
        end_date: '2099-01-01T00:00:00.000Z'
      }
    },
    author: { first_name: 'Researcher', last_name: 'One' }
  }];
  global.fetch = async (_url, options = {}) => {
    if (String(_url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response(JSON.stringify([existing]), { status: 200 });
    }
    if (String(_url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([actualWinner]), { status: 200 });
    }
    if (String(_url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-02-02', proposalEntries)), { status: 200 });
    }
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

  const result = await finalizeWeeklyCompetition('2020-02-02', {
    observedAt: shortlyAfterCutoff('2020-02-02')
  });
  assert.equal(result.finalized, false);
  assert.equal(result.repaired, true);
  assert.equal(result.competition.winner_name, 'Actual Winner');
  assert.equal(result.competition.winning_score, 8000);
  assert.equal(result.competition.winning_wave, 6);
  assert.equal(result.competition.status, 'claimed');
  assert.equal(result.competition.proposal_title, 'Legacy Winning Proposal');
  assert.equal(result.competition.proposal_image_url, 'https://images.researchhub.com/proposals/321.png');
  assert.equal(result.proposalSelectionSource, 'manual');
  assert.equal(result.competition.allocation_rsc, 250);
  assert.equal(result.competition.finalized_at, existing.finalized_at);
});

test('re-finalization never rewrites an archive with a confirmed allocation transaction', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const fundedCompetition = {
    week_key: '2020-02-02',
    status: 'funded',
    winner_name: 'Funded Winner',
    winning_score: 7000,
    winning_wave: 5,
    allocation_rsc: 500,
    allocation_tx_hash: '0xfunded'
  };
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify([fundedCompetition]), { status: 200 });
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const result = await finalizeWeeklyCompetition('2020-02-02');
  assert.equal(result.finalized, false);
  assert.equal(result.repaired, undefined);
  assert.deepEqual(result.competition, fundedCompetition);
  assert.equal(requestCount, 1);
});

test('cutoff snapshot capture is DST-safe across the final Hobby cron hour and rejects late responses', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const writes = [];

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('backend.prod.researchhub.com')) {
      return new Response(JSON.stringify({
        next: null,
        results: [{
          content_object: {
            id: 321,
            title: 'Near-cutoff proposal',
            fundraise: {
              status: 'OPEN',
              goal_currency: 'USD',
              goal_amount: { usd: 10000 },
              amount_raised: { usd: 5000 },
              end_date: '2099-01-01T00:00:00.000Z'
            }
          }
        }]
      }), { status: 200 });
    }
    writes.push({ url: String(url), options });
    return new Response(null, { status: 204 });
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const summerCapture = await captureWeeklyProposalCutoffSnapshot({
    observedAt: new Date('2026-07-12T18:05:00.000Z'),
    completedAt: new Date('2026-07-12T18:05:02.000Z')
  });
  assert.equal(summerCapture.captured, true);
  assert.equal(summerCapture.captureAttempted, true);
  assert.equal(summerCapture.weekKey, '2026-07-05');
  assert.equal(summerCapture.proposalCount, 1);
  assert.equal(writes.length, 1);
  const summerWrite = JSON.parse(writes[0].options.body);
  assert.match(
    summerWrite.cache_key,
    /^researchhub-open-preregistrations:week:2026-07-05:snapshot:\d+:[0-9a-f-]+$/
  );
  assert.doesNotMatch(writes[0].url, /on_conflict/);
  assert.equal(summerWrite.fetched_at, '2026-07-12T18:05:02.000Z');
  assert.equal(summerWrite.payload.complete, true);
  assert.equal(summerWrite.payload.source, 'weekly-cutoff-capture');

  const summerDstNoop = await captureWeeklyProposalCutoffSnapshot({
    observedAt: new Date('2026-07-12T19:59:00.000Z'),
    completedAt: new Date('2026-07-12T19:59:02.000Z')
  });
  assert.equal(summerDstNoop.captured, false);
  assert.equal(summerDstNoop.captureAttempted, false);
  assert.equal(writes.length, 1);

  const winterCapture = await captureWeeklyProposalCutoffSnapshot({
    observedAt: new Date('2026-01-04T19:59:00.000Z'),
    completedAt: new Date('2026-01-04T19:59:02.000Z')
  });
  assert.equal(winterCapture.captured, true);
  assert.equal(winterCapture.weekKey, '2025-12-28');
  assert.equal(writes.length, 2);

  const lateResponse = await captureWeeklyProposalCutoffSnapshot({
    observedAt: new Date('2026-07-12T18:59:59.000Z'),
    completedAt: new Date('2026-07-12T19:00:01.000Z')
  });
  assert.equal(lateResponse.captured, false);
  assert.equal(lateResponse.captureAttempted, true);
  assert.match(lateResponse.reason, /responded after the weekly cutoff/i);
  assert.equal(writes.length, 2);
});

test('weekly finalization uses the last fresh pre-cutoff proposal snapshot', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const weekKey = '2020-02-02';
  const { start, end } = getWeekRange(weekKey);
  let liveFeedCalled = false;

  global.fetch = async (url) => {
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify([{
        fetched_at: new Date(end.getTime() - 60 * 1000).toISOString(),
        payload: {
          complete: true,
          source: 'weekly-cutoff-capture',
          results: [{
            content_object: {
              id: 321,
              title: 'Cutoff Snapshot Pick',
              slug: 'cutoff-snapshot-pick',
              fundraise: {
                status: 'OPEN',
                goal_currency: 'USD',
                goal_amount: { usd: 10000 },
                amount_raised: { usd: 6000 },
                end_date: '2099-01-01T00:00:00.000Z'
              }
            },
            author: { first_name: 'Snapshot', last_name: 'Researcher' }
          }]
        }
      }]), { status: 200 });
    }
    liveFeedCalled = true;
    throw new Error(`Unexpected live request: ${url}`);
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const result = await resolveProposalAtWeeklyCutoff({
    proposalId: '321',
    weekKey,
    start,
    end,
    observedAt: new Date(end.getTime() + 70 * 60 * 1000)
  });

  assert.equal(result.selectionSource, 'manual');
  assert.equal(result.proposal.id, '321');
  assert.equal(liveFeedCalled, false);
});

test('an old week without a cutoff snapshot is never reranked from today’s feed', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const weekKey = '2020-02-02';
  const { start, end } = getWeekRange(weekKey);
  let liveFeedCalled = false;

  global.fetch = async (url) => {
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response('[]', { status: 200 });
    }
    liveFeedCalled = true;
    throw new Error(`Unexpected live request: ${url}`);
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  await assert.rejects(
    resolveProposalAtWeeklyCutoff({
      proposalId: null,
      weekKey,
      start,
      end,
      observedAt: new Date(end.getTime() + 3 * 60 * 60 * 1000)
    }),
    (error) => error.statusCode === 409 && /cutoff snapshot is unavailable/i.test(error.message)
  );
  assert.equal(liveFeedCalled, false);
});

test('finalization fails closed without a protected cutoff snapshot and performs no archive write', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  let archiveWriteCount = 0;
  let liveFeedCalled = false;
  const winner = {
    name: 'Offline Feed Winner',
    score: 9000,
    wave: 9,
    date: '2020-02-04T12:00:00.000Z',
    wallet_address: null,
    run_id: 'offline-feed-run',
    verified: true,
    proposal_id: '321'
  };
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (String(url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([winner]), { status: 200 });
    }
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response('[]', { status: 200 });
    }
    if (String(url).includes('backend.prod.researchhub.com')) {
      liveFeedCalled = true;
      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 503 });
    }
    if (options.method === 'POST') archiveWriteCount += 1;
    return new Response('[]', { status: 200 });
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  await assert.rejects(
    finalizeWeeklyCompetition('2020-02-02', {
      observedAt: shortlyAfterCutoff('2020-02-02')
    }),
    (error) => error.statusCode === 409 && /cutoff snapshot is unavailable/i.test(error.message)
  );
  assert.equal(archiveWriteCount, 0);
  assert.equal(liveFeedCalled, false);
});
