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
