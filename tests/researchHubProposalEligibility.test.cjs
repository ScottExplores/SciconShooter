const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { isFundingDeadlineAfter } = require('../shared/researchHubProposalEligibility.js');

const root = path.resolve(__dirname, '..');
const proposalServiceSource = fs.readFileSync(path.join(root, 'services', 'researchHubProposals.ts'), 'utf8');
const pickerSource = fs.readFileSync(path.join(root, 'components', 'PrizeWinnerFlow.tsx'), 'utf8');
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
  assert.match(proposalServiceSource, /getPublicPrizeState\(\)\.proposalOpenUntil/);
  assert.match(proposalServiceSource, /isFundingDeadlineAfter\(proposal\.endDate, requiredOpenUntil\)/);
  assert.match(pickerSource, /Only items still open after November 30, 2026 are listed\./);
  assert.match(pickerSource, /Only items still open after this week\\'s noon-Pacific cutoff are listed\./);
  assert.match(leaderboardApiSource, /requiredOpenUntil: getPublicPrizeState\(\)\.proposalOpenUntil/);
  assert.match(weeklyClaimSource, /findCurrentWeekEligibleTarget/);
  assert.match(weeklyClaimSource, /findEligibleProposal/);
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

test('a stalled proposal request times out so gameplay preloading can continue', () => {
  assert.match(proposalServiceSource, /const PROPOSAL_REQUEST_TIMEOUT_MS = 12_000/);
  assert.match(proposalServiceSource, /const controller = new AbortController\(\)/);
  assert.match(proposalServiceSource, /globalThis\.setTimeout\(\(\) => controller\.abort\(\), PROPOSAL_REQUEST_TIMEOUT_MS\)/);
  assert.match(proposalServiceSource, /signal: controller\.signal/);
  assert.match(proposalServiceSource, /Proposal feed timed out\./);
});
