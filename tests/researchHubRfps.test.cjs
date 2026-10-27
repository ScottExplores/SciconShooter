const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deadlineFromPost,
  eligibleRfpsFromEntries,
  inspectGrantEntry
} = require('../api/_lib/researchHubRfps');

const entry = {
  id: 33131,
  content_object: {
    id: 33131,
    slug: 'request-for-proposals-airborne-disease-resilience',
    title: 'Request for Proposals: Airborne Disease Resilience',
    type: 'GRANT',
    grant: {
      id: 424,
      status: 'OPEN',
      is_expired: false,
      is_active: true,
      organization: 'ResearchHub Foundation',
      amount: { usd: 10000, rsc: 204656.66 },
      funding_pool: {
        id: 424,
        amount_raised: { rsc: 20550.565, usd: 1004.15 }
      }
    }
  }
};

test('an open RFP with a deadline after the payout date is eligible', () => {
  const rfp = inspectGrantEntry(entry, '2029-12-31T00:00:00Z', '2026-12-01T08:00:00.000Z');
  assert.equal(rfp.id, '33131');
  assert.equal(rfp.goalUsd, 10000);
  assert.equal(rfp.raisedRsc, 20550.565);
  assert.equal(rfp.url, 'https://www.researchhub.com/rfp/33131/request-for-proposals-airborne-disease-resilience');
});

test('an RFP that closes before the payout date is excluded', () => {
  const rfps = eligibleRfpsFromEntries([entry], new Map([['33131', '2026-11-01T00:00:00Z']]), '2026-12-01T08:00:00.000Z');
  assert.deepEqual(rfps, []);
});

test('the public post payload is the deadline source', () => {
  assert.equal(deadlineFromPost({
    note: { post: { unified_document: { grant: { end_date: '2029-12-31T00:00:00Z' } } } }
  }), '2029-12-31T00:00:00Z');
  assert.equal(deadlineFromPost({ unified_document: { grant: {} } }), null);
});
