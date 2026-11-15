const test = require('node:test');
const assert = require('node:assert/strict');

const {
  eligibleRfpsFromEntries,
  featureBestEligibleRfp,
  findEligibleRfp
} = require('../api/_lib/researchHubRfps');
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
  goalRsc = 100
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
      amount: { rsc: goalRsc, usd: goalRsc },
      funding_pool: { id: `pool-${id}`, amount_raised: { rsc: raisedRsc } }
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
