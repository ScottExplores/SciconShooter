const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isFundingDeadlineAfter } = require('../shared/researchHubProposalEligibility.js');

const root = path.resolve(__dirname, '..');
const proposalServiceSource = fs.readFileSync(path.join(root, 'services', 'researchHubProposals.ts'), 'utf8');
const pickerSource = fs.readFileSync(path.join(root, 'components', 'WeeklyProposalSelection.tsx'), 'utf8');
const leaderboardApiSource = fs.readFileSync(path.join(root, 'api', 'leaderboard.js'), 'utf8');
const weeklyClaimSource = fs.readFileSync(path.join(root, 'api', 'weekly-claim.js'), 'utf8');

test('funding deadline must be strictly after the weekly cutoff', () => {
  const weeklyCutoff = '2026-07-26T19:00:00.000Z';

  assert.equal(isFundingDeadlineAfter('2026-07-26T18:59:59.999Z', weeklyCutoff), false);
  assert.equal(isFundingDeadlineAfter(weeklyCutoff, weeklyCutoff), false);
  assert.equal(isFundingDeadlineAfter('2026-07-26T19:00:00.001Z', weeklyCutoff), true);
  assert.equal(isFundingDeadlineAfter('2026-07-22T14:20:13.920063Z', weeklyCutoff), false);
});

test('missing or malformed funding deadlines fail closed', () => {
  const weeklyCutoff = new Date('2026-07-26T19:00:00.000Z');

  assert.equal(isFundingDeadlineAfter(undefined, weeklyCutoff), false);
  assert.equal(isFundingDeadlineAfter('', weeklyCutoff), false);
  assert.equal(isFundingDeadlineAfter('not-a-date', weeklyCutoff), false);
});

test('the client feed filters against the shared weekly boundary and explains the rule', () => {
  assert.match(proposalServiceSource, /getWeeklyBoundaryMeta\(\)\.endsAt/);
  assert.match(proposalServiceSource, /isFundingDeadlineAfter\(proposal\.endDate, requiredOpenUntil\)/);
  assert.match(pickerSource, /Only proposals open past Sunday&apos;s noon-Pacific cutoff are eligible\./);
  assert.match(leaderboardApiSource, /requiredOpenUntil: getCurrentWeekRange\(\)\.end/);
  assert.match(weeklyClaimSource, /findCurrentWeekEligibleProposal/);
});

test('the client feed requests and returns exact referenced proposals without changing the eligible-list wrapper', () => {
  assert.match(proposalServiceSource, /export interface ResearchHubProposalFeedResult/);
  assert.match(proposalServiceSource, /eligibleProposals: ResearchHubProposal\[\]/);
  assert.match(proposalServiceSource, /referencedProposals: ResearchHubProposal\[\]/);
  assert.match(proposalServiceSource, /includeProposalIds=\$\{requestedProposalIds\.join\(','\)\}/);
  assert.match(proposalServiceSource, /normalizeProposalEntries\(payload\?\.referencedProposals\)/);
  assert.match(proposalServiceSource, /requestedProposalIds[\s\S]*referencedById\.get\(proposalId\)/);
  assert.match(
    proposalServiceSource,
    /getResearchHubFundingProposals[\s\S]*getResearchHubProposalFeed\(\{ requiredOpenUntil \}\)[\s\S]*return eligibleProposals/
  );
});

// REVAMP(G): E moved the deadline into the shared transport; exercise headers and body stalls.
test('a stalled proposal request times out so gameplay preloading can continue', async () => {
  const { loadService } = require('./helpers/loadService.cjs');
  const { fetchProposalJson, PROPOSAL_REQUEST_TIMEOUT_MS } = loadService(
    path.join(root, 'services/revamp/researchhub/feedSnapshot.ts')
  );
  assert.equal(PROPOSAL_REQUEST_TIMEOUT_MS, 12_000);
  assert.match(proposalServiceSource, /await fetchProposalJson\(proposalFeedUrl\)/);
  const originalFetch = global.fetch;
  try {
    for (const bodyStalls of [false, true]) {
      let signal;
      global.fetch = async (_url, options) => {
        signal = options.signal;
        if (!bodyStalls) return new Promise(() => {});
        return { ok: true, json: () => new Promise(() => {}) };
      };
      await assert.rejects(fetchProposalJson('/api/researchhub-proposals', 10), /timed out/i);
      assert.equal(signal.aborted, true);
    }
  } finally { global.fetch = originalFetch; }
});
