const { createWeeklyDurableFixtures, weeklyFixtureId } = require('./helpers/weeklyDurableFixtures.cjs');
const weeklyFixtures = createWeeklyDurableFixtures();
const test = require('node:test');
test.beforeEach(() => weeklyFixtures.reset());
const assert = require('node:assert/strict');
const {
  captureWeeklyProposalCutoffSnapshot,
  ensureRecentWeeklyCompetitions,
  finalizeWeeklyCompetition,
  getCompletedWeeklyCompetitionKeys,
  getPreviousWeekKey,
  getWeekRange,
  readTopEligibleScore,
  resolveProposalAtWeeklyCutoff
} = require('../api/_lib/weeklyCompetitionService');
const {
  getCurrentWeekRange,
  getWeeklyBoundaryMeta,
  getWeeklyPresentationMeta,
  resolveWeeklyDashboardPublication,
  WEEKLY_ALLOCATION_RSC,
  WEEKLY_SCORE_SETTLEMENT_MS
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

test('the current weekly funding allocation is 1,000 RSC', () => {
  assert.equal(WEEKLY_ALLOCATION_RSC, 1_000);
});

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

test('the public weekly board and Past Pick share one five-minute publication boundary', () => {
  assert.equal(WEEKLY_SCORE_SETTLEMENT_MS, 5 * 60 * 1000);

  const finalizing = getWeeklyPresentationMeta(new Date('2026-07-12T19:03:00.000Z'), 'en-US');
  assert.equal(finalizing.weekKey, '2026-07-05');
  assert.equal(finalizing.scoringWeekKey, '2026-07-12');
  assert.equal(finalizing.isFinalizing, true);
  assert.equal(finalizing.publishesAt.toISOString(), '2026-07-12T19:05:00.000Z');

  const published = getWeeklyPresentationMeta(new Date('2026-07-12T19:05:00.000Z'), 'en-US');
  assert.equal(published.weekKey, '2026-07-12');
  assert.equal(published.scoringWeekKey, '2026-07-12');
  assert.equal(published.isFinalizing, false);
  assert.equal(published.endLabel, 'Jul 19');
});

test('the dashboard holds the outgoing board until its exact prior week is terminal', () => {
  const afterSettlement = new Date('2026-07-12T19:06:00.000Z');
  const held = resolveWeeklyDashboardPublication([], afterSettlement);
  assert.equal(held.waitingForArchive, true);
  assert.equal(held.requiredArchiveWeekKey, '2026-07-05');
  assert.equal(held.visibleWeekKey, '2026-07-05');
  assert.equal(new Date(held.presentationTime).toISOString(), '2026-07-12T19:04:59.999Z');

  // The completed key may represent a winner archive or an empty expired week.
  const published = resolveWeeklyDashboardPublication(['2026-07-05'], afterSettlement);
  assert.equal(published.waitingForArchive, false);
  assert.equal(published.visibleWeekKey, '2026-07-12');
  assert.equal(published.presentationTime, afterSettlement.getTime());
});

test('completed week keys include terminal empty weeks but exclude stale open rows', () => {
  assert.deepEqual(getCompletedWeeklyCompetitionKeys([
    { week_key: '2026-07-05', status: 'expired' },
    { week_key: '2026-06-28', status: 'finalized' },
    { week_key: '2026-06-21', status: 'open' },
    { week_key: '2026-07-05', status: 'expired' }
  ]), ['2026-07-05', '2026-06-28']);
});

test('the dashboard settlement window does not require an archive before finalization is eligible', () => {
  const duringSettlement = new Date('2026-07-12T19:03:00.000Z');
  const publication = resolveWeeklyDashboardPublication([], duringSettlement);
  assert.equal(publication.waitingForArchive, false);
  assert.equal(publication.visibleWeekKey, '2026-07-05');
  assert.equal(publication.presentationTime, duringSettlement.getTime());
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
  global.fetch = weeklyFixtures.withStorage(async () => {
    fetchCalled = true;
    return new Response('[]', { status: 200 });
  });

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

test('finalization persists an expired terminal row when a closed week has no scores', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const savedRows = [];

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_weekly_competitions') && options.method === 'POST') {
      const row = JSON.parse(options.body);
      savedRows.push(row);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (requestUrl.includes('scicon_weekly_competitions') || requestUrl.includes('scicon_leaderboard')) {
      return new Response('[]', { status: 200 });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });

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
  assert.equal(result.empty, true);
  assert.equal(result.competition.status, 'expired');
  assert.equal(result.competition.winner_name, null);
  assert.equal(result.competition.winning_score, null);
  assert.equal(savedRows.length, 1);
  assert.deepEqual(savedRows[0], result.competition);
});

test('production finalization skips a verified leader backed only by legacy provenance', async (context) => {
  const originalFetch = global.fetch;
  const originalEnvironment = process.env.NODE_ENV;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const savedRows = [];
  const legacyLeader = {
    name: 'LEGACY',
    score: 9999,
    wave: 7,
    date: '2020-01-10T00:00:00.000Z',
    wallet_address: null,
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    verified: true,
    receipt_hash: 'a'.repeat(64)
  };
  global.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([legacyLeader]), { status: 200 });
    }
    if (requestUrl.includes('scicon_run_receipts')) {
      return new Response(JSON.stringify([{
        run_id: legacyLeader.run_id,
        score: legacyLeader.score,
        wave: legacyLeader.wave,
        receipt_hash: legacyLeader.receipt_hash,
        integrity_status: 'server-verified',
        receipt_provenance_version: 0,
        run_mode: 'weekly-streak', test_run: false, finished_at: legacyLeader.date
      }]), { status: 200 });
    }
    if (requestUrl.includes('scicon_weekly_competitions') && options.method === 'POST') {
      const row = JSON.parse(options.body);
      savedRows.push(row);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (requestUrl.includes('scicon_weekly_competitions')) {
      return new Response('[]', { status: 200 });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  context.after(() => {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const result = await finalizeWeeklyCompetition('2020-01-05', {
    observedAt: shortlyAfterCutoff('2020-01-05')
  });
  assert.equal(result.finalized, true);
  assert.equal(result.empty, true);
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].status, 'expired');
  assert.equal(savedRows[0].winner_run_id, null);
});

test('production leader lookup accepts an exact provenance-one receipt', async () => {
  const originalFetch = global.fetch;
  const originalEnvironment = process.env.NODE_ENV;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const leader = {
    name: 'TRUSTED',
    score: 8000,
    wave: 6,
    date: '2020-01-10T00:00:00.000Z',
    wallet_address: null,
    run_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    verified: true,
    receipt_hash: 'b'.repeat(64)
  };
  global.fetch = async (url) => {
    if (String(url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([leader]), { status: 200 });
    }
    if (String(url).includes('scicon_run_receipts')) {
      return new Response(JSON.stringify([{
        run_id: leader.run_id,
        score: leader.score,
        wave: leader.wave,
        receipt_hash: leader.receipt_hash,
        integrity_status: 'server-verified',
        receipt_provenance_version: 1,
        run_mode: 'weekly-streak', test_run: false, finished_at: leader.date
      }]), { status: 200 });
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  };
  try {
    const result = await readTopEligibleScore('2020-01-05');
    assert.equal(result?.run_id, leader.run_id);
  } finally {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('recovery finalizes a stale open row and skips only terminal weeks', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const staleOpenCompetition = {
    week_key: '2026-07-26',
    status: 'open',
    allocation_rsc: 100
  };
  const savedRows = [];

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_weekly_competitions') && options.method === 'PATCH') {
      const row = JSON.parse(options.body);
      savedRows.push(row);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    if (requestUrl.includes('scicon_weekly_competitions')) {
      return new Response(JSON.stringify([staleOpenCompetition]), { status: 200 });
    }
    if (requestUrl.includes('scicon_leaderboard')) {
      return new Response('[]', { status: 200 });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const recovery = await ensureRecentWeeklyCompetitions({
    observedAt: new Date('2026-08-03T01:00:00.000Z'),
    existingCompetitions: [
      staleOpenCompetition,
      { week_key: '2026-07-19', status: 'finalized' }
    ],
    lookbackWeeks: 2
  });

  assert.equal(recovery.changed, true);
  assert.deepEqual(recovery.results.map((entry) => entry.weekKey), ['2026-07-26']);
  assert.equal(recovery.results[0].result.empty, true);
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].week_key, '2026-07-26');
  assert.equal(savedRows[0].status, 'expired');
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

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });

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

  assert.equal(result.finalized, true);
  assert.equal(result.empty, true);
  assert.equal(result.competition.status, 'expired');
  assert.match(result.reason, /no eligible scores/i);
  assert.equal(requests.length, 3);
  assert.ok(requests.some((request) => request.url.includes('scicon_weekly_competitions')));
  assert.ok(requests.some((request) => request.url.includes('scicon_leaderboard')));
  assert.ok(requests.some((request) => request.options.method === 'POST'));
});

test('finalization locks the top eligible score for a closed week', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAllocation = process.env.WEEKLY_ALLOCATION_RSC;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  delete process.env.WEEKLY_ALLOCATION_RSC;

  const requests = [];
  const winner = {
    name: 'Pilot One', score: 4321, wave: 8, date: '2020-01-07T12:00:00.000Z',
    wallet_address: null, run_id: weeklyFixtureId('verified-run'), verified: true
  };
  const reviewOnlyLeader = {
    name: 'Review Only', score: 999999, wave: 99, date: '2020-01-07T11:00:00.000Z',
    wallet_address: null, run_id: weeklyFixtureId('review-run'), verified: false
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
  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (String(url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([reviewOnlyLeader, winner]), { status: 200 });
    }
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-01-05', proposalEntries)), { status: 200 });
    }
    const saved = JSON.parse(options.body);
    return new Response(JSON.stringify([saved]), { status: 200 });
  });

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalAllocation === undefined) delete process.env.WEEKLY_ALLOCATION_RSC;
    else process.env.WEEKLY_ALLOCATION_RSC = originalAllocation;
  });

  const result = await finalizeWeeklyCompetition('2020-01-05', {
    observedAt: shortlyAfterCutoff('2020-01-05')
  });
  assert.equal(result.finalized, true);
  assert.equal(result.proposalSelectionSource, 'automatic_fallback');
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.winner_run_id, weeklyFixtureId('verified-run'));
  assert.equal(result.competition.winning_score, 4321);
  assert.equal(result.competition.proposal_id, '654');
  assert.equal(result.competition.proposal_title, 'Most Funded Eligible Proposal');
  assert.equal(result.competition.allocation_rsc, 1_000);
  assert.equal(result.competition.starts_at, '2020-01-05T20:00:00.000Z');
  assert.equal(result.competition.ends_at, '2020-01-12T20:00:00.000Z');
  const leaderboardRequest = requests.find((request) => request.url.includes('scicon_leaderboard'));
  assert.ok(leaderboardRequest);
  // REVAMP(G): E narrows database candidates before durable provenance checks.
  assert.match(leaderboardRequest.url, /verified=eq\.true/);
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
    run_id: weeklyFixtureId('early-run'),
    verified: true,
    proposal_id: '101'
  };
  const finalWinner = {
    name: 'Final Leader',
    score: 6000,
    wave: 6,
    date: '2020-01-08T12:00:00.000Z',
    wallet_address: null,
    run_id: weeklyFixtureId('final-run'),
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

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
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
  });

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
  assert.equal(result.competition.winner_run_id, weeklyFixtureId('final-run'));
  assert.equal(result.competition.proposal_id, '202');
  assert.equal(leaderboardReads, 3);
});

test('finalization preserves a wallet-associated guest proposal as claimable and excludes the pilot test wallet', async (context) => {
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
    wallet_address: '0x1111111111111111111111111111111111111111',
    run_id: weeklyFixtureId('proposal-pilot-run'), verified: true,
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
  global.fetch = weeklyFixtures.withStorage(async (_url, options = {}) => {
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
  });

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
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.winner_name, 'Proposal Pilot');
  assert.equal(result.competition.winner_run_id, weeklyFixtureId('proposal-pilot-run'));
  assert.equal(result.competition.winner_wallet, '0x1111111111111111111111111111111111111111');
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
    winner_run_id: weeklyFixtureId('lower-verified-run'),
    winner_name: 'Lower Score',
    winning_score: 7000,
    winning_wave: 5,
    finalized_at: '2020-02-09T21:00:00.000Z',
    claim_deadline: '2020-02-12T21:00:00.000Z',
    allocation_rsc: 250,
    allocation_tx_hash: null,
    updated_at: '2020-02-09T21:00:00.000Z'
  };
  const actualWinner = {
    name: 'Actual Winner', score: 8000, wave: 6, date: '2020-02-05T12:00:00.000Z',
    wallet_address: null, run_id: weeklyFixtureId('actual-winner-run'), verified: true, receipt_hash: 'actual-winner-hash',
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
  let currentCompetition = { ...existing };
  global.fetch = weeklyFixtures.withStorage(async (_url, options = {}) => {
    if (String(_url).includes('scicon_weekly_competitions')) {
      if (options.method === 'PATCH') {
        assert.match(String(_url), /status=eq\.finalized/);
        assert.match(String(_url), new RegExp('winner_run_id=eq\\.' + weeklyFixtureId('lower-verified-run')));
        assert.match(String(_url), /updated_at=eq\./);
        currentCompetition = JSON.parse(options.body);
        return new Response(JSON.stringify([currentCompetition]), { status: 200 });
      }
      return new Response(JSON.stringify([currentCompetition]), { status: 200 });
    }
    if (String(_url).includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([actualWinner]), { status: 200 });
    }
    if (String(_url).includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-02-02', proposalEntries)), { status: 200 });
    }
    throw new Error(`Unexpected request: ${String(_url)}`);
  });

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
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.proposal_title, 'Legacy Winning Proposal');
  assert.equal(result.competition.proposal_image_url, 'https://images.researchhub.com/proposals/321.png');
  assert.equal(result.proposalSelectionSource, 'manual');
  assert.equal(result.competition.allocation_rsc, 250);
  assert.equal(result.competition.finalized_at, existing.finalized_at);
});

test('a claimed weekly competition is immutable during later reconciliation', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const claimed = {
    week_key: '2020-02-02',
    status: 'claimed',
    winner_run_id: weeklyFixtureId('claimed-run'),
    winner_wallet: '0x1111111111111111111111111111111111111111',
    winner_name: 'Claimed Pilot',
    winning_score: 8000,
    winning_wave: 6,
    proposal_id: '777',
    proposal_title: 'Signed Winner Choice',
    allocation_tx_hash: null,
    updated_at: '2020-02-09T21:05:00.000Z'
  };
  let requestCount = 0;
  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    requestCount += 1;
    assert.match(String(url), /scicon_weekly_competitions/);
    assert.notEqual(options.method, 'PATCH');
    assert.notEqual(options.method, 'POST');
    return new Response(JSON.stringify([claimed]), { status: 200 });
  });

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
  assert.equal(result.repaired, undefined);
  assert.equal(result.enriched, undefined);
  assert.match(result.reason, /already locked/i);
  assert.deepEqual(result.competition, claimed);
  assert.equal(requestCount, 1);
});

test('a finalized-row enrichment cannot overwrite a champion claim that wins the interleaving', async (context) => {
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
    winner_run_id: weeklyFixtureId('claim-race-run'),
    winner_wallet: null,
    winner_name: 'Race Pilot',
    winning_score: 8100,
    winning_wave: 6,
    finalized_at: '2020-02-09T21:00:00.000Z',
    claim_deadline: '2020-02-12T21:00:00.000Z',
    proposal_id: null,
    proposal_title: null,
    allocation_rsc: 100,
    allocation_tx_hash: null,
    updated_at: '2020-02-09T21:00:00.000Z'
  };
  const leader = {
    name: 'Race Pilot', score: 8100, wave: 6, date: '2020-02-05T12:00:00.000Z',
    wallet_address: null, run_id: weeklyFixtureId('claim-race-run'), verified: true,
    proposal_id: '777', proposal_title: 'Signed Winner Choice',
    proposal_url: 'https://www.researchhub.com/post/777/signed-winner-choice',
    proposal_author: 'Researcher One', proposal_image_url: null
  };
  const proposalEntries = [{
    content_object: {
      id: 777,
      title: 'Signed Winner Choice',
      slug: 'signed-winner-choice',
      fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
    },
    author: { first_name: 'Researcher', last_name: 'One' }
  }];
  const claimed = {
    ...existing,
    status: 'claimed',
    winner_wallet: '0x1111111111111111111111111111111111111111',
    proposal_id: '777',
    proposal_title: 'Signed Winner Choice',
    proposal_url: 'https://www.researchhub.com/post/777/signed-winner-choice',
    proposal_author: 'Researcher One',
    updated_at: '2020-02-09T21:01:00.000Z'
  };
  let currentCompetition = { ...existing };
  let competitionPatchCount = 0;
  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_weekly_competitions')) {
      if (options.method === 'PATCH') {
        competitionPatchCount += 1;
        assert.match(requestUrl, /status=eq\.finalized/);
        assert.match(requestUrl, new RegExp('winner_run_id=eq\\.' + weeklyFixtureId('claim-race-run')));
        assert.match(requestUrl, /updated_at=eq\./);
        currentCompetition = { ...claimed };
        return new Response('[]', { status: 200 });
      }
      return new Response(JSON.stringify([currentCompetition]), { status: 200 });
    }
    if (requestUrl.includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([leader]), { status: 200 });
    }
    if (requestUrl.includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-02-02', proposalEntries)), { status: 200 });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });

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
  assert.equal(result.raceLost, true);
  assert.equal(result.enriched, undefined);
  assert.match(result.reason, /changed while its proposal/i);
  assert.deepEqual(result.competition, claimed);
  assert.equal(competitionPatchCount, 1);
});

test('an initial finalizer cannot upsert over a champion claim committed by another finalizer', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const leader = {
    name: 'Initial Race Pilot', score: 8200, wave: 7, date: '2020-02-05T12:00:00.000Z',
    wallet_address: null, run_id: weeklyFixtureId('initial-race-run'), verified: true,
    proposal_id: '888', proposal_title: 'Initial Race Choice',
    proposal_url: 'https://www.researchhub.com/post/888/initial-race-choice',
    proposal_author: 'Researcher Two', proposal_image_url: null
  };
  const proposalEntries = [{
    content_object: {
      id: 888,
      title: 'Initial Race Choice',
      slug: 'initial-race-choice',
      fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
    },
    author: { first_name: 'Researcher', last_name: 'Two' }
  }];
  const claimed = {
    week_key: '2020-02-02',
    starts_at: '2020-02-02T20:00:00.000Z',
    ends_at: '2020-02-09T20:00:00.000Z',
    status: 'claimed',
    winner_run_id: weeklyFixtureId('initial-race-run'),
    winner_wallet: '0x1111111111111111111111111111111111111111',
    winner_name: 'Initial Race Pilot',
    winning_score: 8200,
    winning_wave: 7,
    proposal_id: '888',
    proposal_title: 'Initial Race Choice',
    proposal_url: 'https://www.researchhub.com/post/888/initial-race-choice',
    proposal_author: 'Researcher Two',
    allocation_rsc: 100,
    updated_at: '2020-02-09T21:01:00.000Z'
  };
  let currentCompetition = null;
  let insertCount = 0;
  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_weekly_competitions')) {
      if (options.method === 'POST') {
        insertCount += 1;
        assert.doesNotMatch(requestUrl, /on_conflict/);
        currentCompetition = { ...claimed };
        return new Response(JSON.stringify({ code: '23505', message: 'duplicate key' }), { status: 409 });
      }
      return new Response(JSON.stringify(currentCompetition ? [currentCompetition] : []), { status: 200 });
    }
    if (requestUrl.includes('scicon_leaderboard')) {
      return new Response(JSON.stringify([leader]), { status: 200 });
    }
    if (requestUrl.includes('scicon_proposal_cache')) {
      return new Response(JSON.stringify(cutoffSnapshotRows('2020-02-02', proposalEntries)), { status: 200 });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });

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
  assert.equal(result.raceLost, true);
  assert.match(result.reason, /changed while its winner/i);
  assert.deepEqual(result.competition, claimed);
  assert.equal(insertCount, 1);
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
  global.fetch = weeklyFixtures.withStorage(async () => {
    requestCount += 1;
    return new Response(JSON.stringify([fundedCompetition]), { status: 200 });
  });

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

test('cutoff snapshot capture is DST-safe across the reliable Hobby cron window and rejects late responses', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  const writes = [];

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
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
  });

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
    observedAt: new Date('2026-01-04T18:05:00.000Z'),
    completedAt: new Date('2026-01-04T18:05:02.000Z')
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

  global.fetch = weeklyFixtures.withStorage(async (url) => {
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
  });

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

  global.fetch = weeklyFixtures.withStorage(async (url) => {
    if (String(url).includes('scicon_proposal_cache')) {
      return new Response('[]', { status: 200 });
    }
    liveFeedCalled = true;
    throw new Error(`Unexpected live request: ${url}`);
  });

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

test('finalization archives the winner even when proposal verification is pending', async (context) => {
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
    run_id: weeklyFixtureId('offline-feed-run'),
    verified: true,
    proposal_id: '321'
  };
  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
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
    if (options.method === 'POST') {
      archiveWriteCount += 1;
      const row = JSON.parse(options.body);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });

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
  assert.equal(result.proposalResolutionPending, true);
  assert.equal(result.competition.status, 'finalized');
  assert.equal(result.competition.winner_name, 'Offline Feed Winner');
  assert.equal(result.competition.winning_score, 9000);
  assert.equal(result.competition.proposal_id, null);
  assert.equal(archiveWriteCount, 1);
  assert.equal(liveFeedCalled, false);
});

test('recovery backfills within the fixed three-week horizon even when a caller requests more', async (context) => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

  const winnersByWeek = new Map([
    ['2026-07-26', {
      name: 'SCOTT', score: 30286, wave: 8, date: '2026-07-30T12:00:00.000Z',
      wallet_address: '0xscott', run_id: '0b865716-0000-4000-8000-000000000000', verified: true
    }],
    ['2026-07-19', {
      name: 'COLE DELYEA', score: 93433, wave: 7, date: '2026-07-24T12:00:00.000Z',
      wallet_address: '0xcole', run_id: 'c54245cc-0000-4000-8000-000000000000', verified: true,
      proposal_id: '32342', proposal_title: 'Preserved weekly proposal',
      proposal_url: 'https://www.researchhub.com/post/32342/preserved-weekly-proposal',
      proposal_author: 'Researcher'
    }]
  ]);
  const savedRows = [];

  global.fetch = weeklyFixtures.withStorage(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('scicon_weekly_competitions') && options.method !== 'POST') {
      return new Response('[]', { status: 200 });
    }
    if (requestUrl.includes('scicon_leaderboard')) {
      const decodedRequestUrl = decodeURIComponent(requestUrl);
      const matchingEntry = [...winnersByWeek.entries()].find(([weekKey]) => (
        decodedRequestUrl.includes(`date=gte.${getWeekRange(weekKey).start.toISOString()}`)
      ));
      return new Response(JSON.stringify(matchingEntry ? [matchingEntry[1]] : []), { status: 200 });
    }
    if (requestUrl.includes('scicon_proposal_cache')) {
      return new Response('[]', { status: 200 });
    }
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      savedRows.push(row);
      return new Response(JSON.stringify([row]), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  });

  context.after(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  const recovery = await ensureRecentWeeklyCompetitions({
    observedAt: new Date('2026-08-03T01:00:00.000Z'),
    existingCompetitions: [{ week_key: '2026-07-12', status: 'finalized' }],
    lookbackWeeks: 999
  });

  assert.equal(recovery.changed, true);
  assert.deepEqual(recovery.results.map((entry) => entry.weekKey), ['2026-07-26', '2026-07-19']);
  assert.deepEqual(savedRows.map((row) => row.week_key), ['2026-07-26', '2026-07-19']);
  assert.equal(savedRows[0].winner_name, 'SCOTT');
  assert.equal(savedRows[0].status, 'finalized');
  assert.equal(savedRows[1].winner_name, 'COLE DELYEA');
  assert.equal(savedRows[1].status, 'finalized');
  assert.equal(savedRows[1].proposal_id, '32342');
});
