const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  RFP_CACHE_KEY,
  eligibleRfpsFromEntries,
  featureBestEligibleRfp,
  findEligibleRfp,
  handleResearchHubRfpRequest,
  openRfpsFromEntries
} = require('../api/_lib/researchHubRfps');
const proposalsHandler = require('../api/researchhub-proposals');
const {
  assessEventPayout,
  eventPickLockDecision
} = require('../api/_lib/eventResearchPick');

const PAYOUT = '2026-12-01T08:00:00.000Z';
const OPEN_DEADLINE = '2099-01-01T00:00:00.000Z';
const CLOSED_DEADLINE = '2026-11-01T00:00:00.000Z';

const grantEntry = ({
  id,
  title,
  status = 'OPEN',
  active = true,
  expired = false,
  slug = `rfp-${id}`,
  raisedRsc = 0,
  raisedUsd = raisedRsc,
  goalRsc = 100,
  goalUsd = goalRsc
}) => ({
  content_object: {
    id,
    type: 'GRANT',
    slug,
    title,
    grant: {
      status,
      is_active: active,
      is_expired: expired,
      organization: 'ResearchHub',
      amount: { rsc: goalRsc, usd: goalUsd },
      funding_pool: { id: `pool-${id}`, status: 'OPEN', amount_raised: { rsc: raisedRsc, usd: raisedUsd } }
    }
  }
});

const deadlines = (pairs) => new Map(pairs.map(([id, endDate]) => [String(id), { endDate }]));

test('eligible RFP filtering drops closed, inactive, expired, and pre-payout deadlines', () => {
  const rfps = eligibleRfpsFromEntries([
    grantEntry({ id: 33131, title: 'Airborne Disease Resilience', active: false }),
    grantEntry({ id: 100, title: 'Closed status', status: 'CLOSED' }),
    grantEntry({ id: 200, title: 'Expired', expired: true }),
    grantEntry({ id: 300, title: 'Closes before payout', raisedRsc: 90 }),
    grantEntry({ id: 400, title: 'Open past payout', raisedRsc: 10, goalRsc: 100 })
  ], deadlines([
    [33131, OPEN_DEADLINE],
    [100, OPEN_DEADLINE],
    [200, OPEN_DEADLINE],
    [300, CLOSED_DEADLINE],
    [400, OPEN_DEADLINE]
  ]), PAYOUT);

  assert.deepEqual(rfps.map((rfp) => rfp.id), ['400']);
  assert.equal(rfps[0].featured, true);
  assert.equal(rfps.some((rfp) => rfp.id === '33131'), false);
});

test('the featured card is the best eligible RFP and disappears when none qualify', () => {
  const ranked = featureBestEligibleRfp([
    { id: '1', title: 'Later but less funded', raisedRsc: 10, goalRsc: 100, endDate: '2099-06-01T00:00:00.000Z' },
    { id: '2', title: 'Best funded', raisedRsc: 80, goalRsc: 100, endDate: '2099-02-01T00:00:00.000Z' },
    { id: '3', title: 'Unknown progress', raisedRsc: null, goalRsc: null, endDate: '2099-12-01T00:00:00.000Z' }
  ]);
  assert.equal(ranked[0].id, '2');
  assert.equal(ranked[0].featured, true);
  assert.deepEqual(ranked.slice(1).map((rfp) => rfp.featured), [false, false]);
  assert.deepEqual(featureBestEligibleRfp([]), []);
  assert.equal(featureBestEligibleRfp([
    { id: '9', title: 'Only open RFP', raisedRsc: 1, goalRsc: 10, endDate: OPEN_DEADLINE }
  ])[0].featured, true);
});

test('findEligibleRfp rejects an RFP that is not open past payout', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/api/grant_feed/')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { results: [grantEntry({ id: 33131, title: 'Airborne Disease Resilience', active: false })] };
        }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return { unified_document: { grant: { end_date: OPEN_DEADLINE } } };
      }
    };
  };

  try {
    await assert.rejects(
      findEligibleRfp('33131', { requiredOpenUntil: PAYOUT }),
      (error) => error.statusCode === 409 && /not open past the payout date/i.test(error.message)
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('event pick lock replaces only a known-closed pick and never during weekly play', () => {
  assert.equal(eventPickLockDecision({
    eventActive: true,
    storedId: '33131',
    requestedId: '44000',
    storedEligible: false
  }), 'replace');
  assert.equal(eventPickLockDecision({
    eventActive: true,
    storedId: '33131',
    requestedId: '33131',
    storedEligible: false
  }), 'reject-closed');
  assert.equal(eventPickLockDecision({
    eventActive: true,
    storedId: '44000',
    requestedId: '45000',
    storedEligible: true
  }), 'reject-locked');
  assert.equal(eventPickLockDecision({
    eventActive: false,
    storedId: '33131',
    requestedId: '44000',
    storedEligible: false
  }), 'reject-locked');
  assert.equal(eventPickLockDecision({
    eventActive: true,
    storedId: '',
    requestedId: '44000',
    storedEligible: null
  }), 'create');
});

test('event payout flags a closed winning pick and does not redirect funds', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { results: [] };
    }
  });

  try {
    const closed = await assessEventPayout({
      now: new Date('2026-11-15T18:00:00.000Z'),
      leader: {
        name: 'PILOT',
        run_id: 'run-1',
        verified: true,
        proposal_id: '33131',
        proposal_title: 'Airborne Disease Resilience',
        proposal_url: 'https://www.researchhub.com/rfp/33131/airborne-disease-resilience'
      }
    });
    assert.equal(closed.active, true);
    assert.equal(closed.needsNewPick, true);
    assert.equal(closed.fundsRedirected, false);
    assert.equal(closed.reason, 'closed');
    assert.equal(closed.proposalId, '33131');
    assert.equal(closed.replacementProposalId, undefined);

    const weekly = await assessEventPayout({
      now: new Date('2026-12-07T20:00:00.000Z'),
      leader: {
        name: 'PILOT',
        proposal_id: '33131',
        proposal_url: 'https://www.researchhub.com/rfp/33131/airborne-disease-resilience'
      }
    });
    assert.equal(weekly.active, false);
    assert.equal(weekly.needsNewPick, false);
    assert.equal(weekly.fundsRedirected, false);
    assert.equal(weekly.reason, 'weekly');
  } finally {
    global.fetch = originalFetch;
  }
});

test('the hangar keeps grants that are open now and the picker drops ones that end before allocation', () => {
  const now = new Date('2026-11-24T16:00:00.000Z');
  const cutoff = '2026-12-01T08:00:00.000Z';
  const entries = [
    grantEntry({ id: 1, title: 'Ends before cutoff' }),
    grantEntry({ id: 2, title: 'Open past cutoff', raisedUsd: 10, goalUsd: 100 }),
    grantEntry({ id: 3, title: 'Already ended' }),
    grantEntry({ id: 4, title: 'Fully funded', goalUsd: 100, raisedUsd: 100 }),
    grantEntry({ id: 5, title: 'Uncapped pool', goalUsd: 1, goalRsc: 24, raisedUsd: 5000, raisedRsc: 120000 }),
    grantEntry({ id: 6, title: 'Closed status', status: 'CLOSED' })
  ];
  const dates = deadlines([
    [1, '2026-11-29T17:00:00.000Z'],
    [2, '2099-01-01T00:00:00.000Z'],
    [3, '2026-11-01T00:00:00.000Z'],
    [4, '2099-01-01T00:00:00.000Z'],
    [5, '2099-06-01T00:00:00.000Z'],
    [6, '2099-01-01T00:00:00.000Z']
  ]);

  const open = openRfpsFromEntries(entries, dates, now);
  assert.deepEqual(open.map((rfp) => rfp.id), ['1', '2', '5']);
  const eligible = eligibleRfpsFromEntries(entries, dates, cutoff, now);
  assert.deepEqual(eligible.map((rfp) => rfp.id).sort(), ['2', '5']);
  const uncapped = open.find((rfp) => rfp.id === '5');
  assert.equal(uncapped.goalUsd, null);
  assert.equal(uncapped.goalRsc, null);
  assert.equal(uncapped.raisedUsd, 5000);
  assert.equal(uncapped.endDate, '2099-06-01T00:00:00.000Z');
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return JSON.stringify(data); },
  async json() { return data; }
});

test('type=rfp reads the public grant feed and keeps the same cache fallback', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  const requested = [];
  global.fetch = async (url) => {
    const value = String(url);
    requested.push(value);
    if (value.includes('/api/grant_feed/')) {
      return jsonResponse({
        results: [
          grantEntry({ id: 11, title: 'Still open' }),
          grantEntry({ id: 12, title: 'Long expired' })
        ]
      });
    }
    if (value.includes('/api/researchhubpost/11')) {
      return jsonResponse({ unified_document: { grant: { end_date: '2099-01-01T00:00:00.000Z' } } });
    }
    if (value.includes('/api/researchhubpost/12')) {
      return jsonResponse({ unified_document: { grant: { end_date: '2000-01-01T00:00:00.000Z' } } });
    }
    throw new Error(`Unexpected URL ${value}`);
  };

  try {
    const res = makeResponse();
    await proposalsHandler({ method: 'GET', query: { type: 'rfp' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cached, false);
    assert.equal(res.body.source, 'researchhub-grant-feed');
    assert.deepEqual(res.body.openRfps.map((rfp) => rfp.id), ['11']);
    assert.deepEqual(res.body.rfps.map((rfp) => rfp.id), ['11']);
    assert.match(res.headers['Cache-Control'], /s-maxage=300/);
    assert.equal(requested.some((url) => url.includes('/api/grant_feed/')), true);

    const alias = makeResponse();
    await proposalsHandler({ method: 'GET', url: '/api/researchhub-proposals?feed=rfps' }, alias);
    assert.equal(alias.statusCode, 200);
    assert.deepEqual(alias.body.openRfps.map((rfp) => rfp.id), ['11']);
    assert.equal(RFP_CACHE_KEY, 'researchhub-open-rfps');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
  }
});

test('an RFP upstream failure serves the Supabase cache without expired rows', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('api.researchhub.com')) throw new Error('upstream down');
    if (value.includes('scicon_proposal_cache')) {
      return jsonResponse([{
        fetched_at: '2026-11-24T00:00:00.000Z',
        payload: {
          results: [
            {
              id: '9',
              title: 'Cached open',
              url: 'https://www.researchhub.com/rfp/9/cached',
              organization: 'ResearchHub',
              status: 'OPEN',
              endDate: '2099-01-01T00:00:00.000Z',
              goalUsd: 100,
              goalRsc: 100,
              raisedUsd: 1,
              raisedRsc: 1
            },
            {
              id: '8',
              title: 'Cached expired',
              url: 'https://www.researchhub.com/rfp/8/old',
              organization: 'ResearchHub',
              status: 'OPEN',
              endDate: '2000-01-01T00:00:00.000Z',
              goalUsd: 100,
              goalRsc: 100,
              raisedUsd: 1,
              raisedRsc: 1
            }
          ]
        }
      }]);
    }
    throw new Error(`Unexpected URL ${value}`);
  };

  try {
    const res = makeResponse();
    await handleResearchHubRfpRequest({ method: 'GET', query: { type: 'rfp' } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.cached, true);
    assert.deepEqual(res.body.openRfps.map((rfp) => rfp.id), ['9']);
    assert.deepEqual(res.body.rfps.map((rfp) => rfp.id), ['9']);
    assert.match(res.headers['Cache-Control'], /stale-while-revalidate=900/);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test('the hangar browses open items and the picker keeps the allocation cutoff', () => {
  const root = path.resolve(__dirname, '..');
  const hangar = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
  const picker = fs.readFileSync(path.join(root, 'components', 'WeeklyProposalSelection.tsx'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'services', 'researchHubRfps.ts'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(hangar, /data-research-toggle="hangar"/);
  assert.match(hangar, /data-hangar-feed=\{id\}/);
  assert.match(hangar, /Due \{proposal\.endDate\.slice\(0, 10\)\}/);
  assert.match(hangar, /browseProposals\.filter\(\(proposal\) => isOpenProposal\(proposal\)\)/);
  assert.match(hangar, /isWeeklyProposalEligible\(proposal, allocationOpenUntil\)/);
  assert.match(picker, /data-research-toggle="picker"/);
  assert.match(picker, /isWeeklyProposalEligible\(proposal, cutoff\)/);
  assert.match(picker, /isFundingDeadlineAfter\(rfp\.endDate, cutoff\)/);
  assert.doesNotMatch(picker, /if \(!bigEvent\) return undefined/);
  assert.match(client, /\/api\/researchhub-proposals\?type=rfp/);
  assert.match(app, /setBrowseProposals\(feed\.openProposals\)/);
  assert.match(app, /setFundingProposals\(feed\.eligibleProposals\)/);
});
