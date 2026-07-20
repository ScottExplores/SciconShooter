const test = require('node:test');
const assert = require('node:assert/strict');

const { findEligibleProposal } = require('../api/_lib/researchHubEligibility');

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
