const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareEligibleProposalsByFunding,
  fetchOpenProposalEntries,
  findEligibleProposal,
  findHighestFundedEligibleProposal,
  resolveEligibleProposalForFinalization
} = require('../api/_lib/researchHubEligibility');

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return data; }
});

test('eligible proposal snapshots the image belonging to the selected proposal', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [
      {
        content_object: {
          id: 111,
          title: 'Wrong first proposal',
          image_url: 'https://images.example/wrong.png',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        }
      },
      {
        content_object: {
          id: 321,
          title: 'Selected proposal',
          slug: 'selected-proposal',
          image_url: 'https://images.example/selected.png',
          fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
        },
        author: { first_name: 'Ada', last_name: 'Researcher' }
      }
    ]
  });

  try {
    const proposal = await findEligibleProposal('321');
    assert.equal(proposal.id, '321');
    assert.equal(proposal.title, 'Selected proposal');
    assert.equal(proposal.imageUrl, 'https://images.example/selected.png');
  } finally {
    global.fetch = originalFetch;
  }
});

test('eligible proposal rejects unsafe images and uses the safe exact-record fallback', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [{
      content_object: {
        id: 321,
        title: 'Selected proposal',
        image_url: 'javascript:alert(1)',
        fundraise: { status: 'OPEN', end_date: '2099-01-01T00:00:00.000Z' }
      },
      associated_grants: [{ image: 'https://images.example/grant.png' }],
      author: { first_name: 'Ada', last_name: 'Researcher' }
    }]
  });

  try {
    const proposal = await findEligibleProposal('321');
    assert.equal(proposal.imageUrl, 'https://images.example/grant.png');
  } finally {
    global.fetch = originalFetch;
  }
});

test('eligible proposal must remain open strictly beyond the weekly cutoff', async () => {
  const originalFetch = global.fetch;
  let endDate = '2026-07-26T19:00:00.000Z';
  global.fetch = async () => jsonResponse({
    results: [{
      content_object: {
        id: 321,
        title: 'Deadline proposal',
        fundraise: { status: 'OPEN', end_date: endDate }
      }
    }]
  });

  try {
    await assert.rejects(
      findEligibleProposal('321', { requiredOpenUntil: '2026-07-26T19:00:00.000Z' }),
      /closes before the weekly cutoff/i
    );

    endDate = '2026-07-26T19:00:00.001Z';
    const proposal = await findEligibleProposal('321', {
      requiredOpenUntil: '2026-07-26T19:00:00.000Z'
    });
    assert.equal(proposal.endDate, endDate);
  } finally {
    global.fetch = originalFetch;
  }
});

test('eligible proposal rejects missing or malformed funding deadlines', async () => {
  const originalFetch = global.fetch;
  let endDate;
  global.fetch = async () => jsonResponse({
    results: [{
      content_object: {
        id: 321,
        title: 'Unknown deadline proposal',
        fundraise: { status: 'OPEN', ...(endDate === undefined ? {} : { end_date: endDate }) }
      }
    }]
  });

  try {
    await assert.rejects(
      findEligibleProposal('321', { requiredOpenUntil: '2026-07-26T19:00:00.000Z' }),
      /reliable funding deadline/i
    );

    endDate = 'not-a-date';
    await assert.rejects(
      findEligibleProposal('321', { requiredOpenUntil: '2026-07-26T19:00:00.000Z' }),
      /reliable funding deadline/i
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('eligible proposal rejects a fully funded ResearchHub record', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [{
      content_object: {
        id: 321,
        title: 'Completed proposal',
        fundraise: {
          status: 'OPEN',
          goal_currency: 'USD',
          goal_amount: { usd: 10000, rsc: 120000 },
          amount_raised: { usd: 10000, rsc: 120000 },
          end_date: '2099-01-01T00:00:00.000Z'
        }
      }
    }]
  });

  try {
    await assert.rejects(findEligibleProposal('321'), /already fully funded/i);
  } finally {
    global.fetch = originalFetch;
  }
});

const rankedProposalEntry = ({
  id,
  title,
  raised,
  goal = 10000,
  status = 'OPEN',
  endDate = '2099-01-01T00:00:00.000Z',
  backers = 0
}) => ({
  content_object: {
    id,
    title,
    slug: `proposal-${id}`,
    fundraise: {
      status,
      goal_currency: 'USD',
      goal_amount: { usd: goal },
      amount_raised: { usd: raised },
      end_date: endDate,
      contributors: { total: backers }
    }
  }
});

test('highest-funded fallback deterministically ranks eligible OPEN proposals', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [
      rankedProposalEntry({ id: 100, title: 'Half funded', raised: 5000 }),
      rankedProposalEntry({ id: 200, title: 'Smaller 75 percent', raised: 750, goal: 1000 }),
      rankedProposalEntry({ id: 300, title: 'Larger 75 percent', raised: 7500 }),
      rankedProposalEntry({ id: 400, title: 'Already complete', raised: 10000 }),
      rankedProposalEntry({
        id: 500,
        title: 'Closed by cutoff',
        raised: 9900,
        endDate: '2026-07-26T19:00:00.000Z'
      })
    ]
  });

  try {
    const proposal = await findHighestFundedEligibleProposal({
      requiredOpenUntil: '2026-07-26T19:00:00.000Z'
    });
    assert.equal(proposal.id, '300');
    assert.equal(proposal.fundingPercent, 75);
    assert.equal(proposal.raisedAmount, 7500);
  } finally {
    global.fetch = originalFetch;
  }

  const deterministicTie = [
    { id: '20', title: 'Beta', fundingPercent: 50, goalCurrency: 'USD', raisedAmount: 500, backers: 4 },
    { id: '30', title: 'Alpha', fundingPercent: 50, goalCurrency: 'USD', raisedAmount: 500, backers: 4 },
    { id: '10', title: 'Alpha', fundingPercent: 50, goalCurrency: 'USD', raisedAmount: 500, backers: 4 }
  ].sort(compareEligibleProposalsByFunding);
  assert.deepEqual(deterministicTie.map((proposal) => proposal.id), ['10', '30', '20']);
});

test('weekly finalization resolver retains a valid manual selection', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [
      rankedProposalEntry({ id: 321, title: 'Manual choice', raised: 1000 }),
      rankedProposalEntry({ id: 654, title: 'More funded fallback', raised: 9000 })
    ]
  });

  try {
    const result = await resolveEligibleProposalForFinalization('321', {
      requiredOpenUntil: '2026-07-26T19:00:00.000Z'
    });
    assert.equal(result.selectionSource, 'manual');
    assert.equal(result.proposal.id, '321');
    assert.equal(result.replacedProposalId, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('weekly finalization resolver replaces missing or completed manual selections with the top eligible fallback', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({
    results: [
      rankedProposalEntry({ id: 321, title: 'Completed manual choice', raised: 10000 }),
      rankedProposalEntry({ id: 654, title: 'Top eligible fallback', raised: 8500 }),
      rankedProposalEntry({ id: 777, title: 'Lower eligible fallback', raised: 7000 })
    ]
  });

  try {
    const result = await resolveEligibleProposalForFinalization('321', {
      requiredOpenUntil: '2026-07-26T19:00:00.000Z'
    });
    assert.equal(result.selectionSource, 'automatic_fallback');
    assert.equal(result.proposal.id, '654');
    assert.equal(result.replacedProposalId, '321');
  } finally {
    global.fetch = originalFetch;
  }
});

test('weekly finalization resolver fails closed when the OPEN feed is unavailable', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => jsonResponse({ error: 'offline' }, 503);

  try {
    await assert.rejects(
      resolveEligibleProposalForFinalization('321'),
      (error) => error.statusCode === 502 && /unavailable/i.test(error.message)
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('eligibility feed fails closed when a next page would exceed the 500-proposal safety limit', async () => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return jsonResponse({
      results: Array.from({ length: 100 }, (_, index) => ({
        content_object: { id: (fetchCount * 1000) + index }
      })),
      next: `https://backend.prod.researchhub.com/api/funding_feed/?page=${fetchCount + 1}`
    });
  };

  try {
    await assert.rejects(
      fetchOpenProposalEntries(),
      (error) => (
        error.statusCode === 502
        && error.code === 'RESEARCHHUB_FEED_INCOMPLETE'
        && /incomplete proposal set/i.test(error.message)
      )
    );
    assert.equal(fetchCount, 5);
  } finally {
    global.fetch = originalFetch;
  }
});
