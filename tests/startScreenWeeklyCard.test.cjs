const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'StartScreen.tsx'),
  'utf8'
);
const leaderboardServiceSource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'leaderboardService.ts'),
  'utf8'
);
const htmlSource = fs.readFileSync(
  path.join(__dirname, '..', 'index.html'),
  'utf8'
);

test('home winner card uses only the proposal saved on the current weekly leader', () => {
  assert.match(source, /resolveProposalSelection\(weeklyLeader, proposals\)/);
  assert.doesNotMatch(source, /weeklyProposalPreview\s*=\s*sortedProposals\[0\]/);
  assert.match(source, /weeklyProposalSelection\?\.liveProposal[\s\S]*getProposalFundingMetrics\(weeklyProposalSelection\.liveProposal\)/);
  assert.match(source, /formatFundingPercent\(weeklyFunding\.progressPercent\)/);
  assert.doesNotMatch(source, /getProposalProgress|weeklyFundingProgress/);
});

test('an open weekly pilot slot renders no proposal title, image, or progress', () => {
  assert.match(source, /const weeklyLeader = activeWeeklyLeaderboard\[0\]/);
  assert.match(source, /\{weeklyProposalSelection\?\.imageUrl \? \(/);
  assert.match(source, /\{weeklyProposalSelection \? \([\s\S]*weeklyProposalSelection\.title/);
  assert.match(source, /key=\{`\$\{weeklyProposalSelection\.id\}:\$\{weeklyProposalSelection\.imageUrl\}`\}/);
});

test('home winner image has no trophy overlay', () => {
  const imageStart = source.indexOf('sci-weekly-project-image');
  const imageEnd = source.indexOf('<div className="min-w-0">', imageStart);
  assert.ok(imageStart >= 0 && imageEnd > imageStart);
  assert.doesNotMatch(source.slice(imageStart, imageEnd), /name="trophy"/);
});

test('mobile home lets its mission panel fill the available space above navigation', () => {
  assert.match(source, /className="scicon-mobile-home flex min-h-full flex-col gap-2"/);
  assert.match(source, /<HeroPanel compact fill\s*\/>/);
  assert.match(source, /fill \? 'flex-1' : ''/);
  assert.match(source, /sci-hero-content--compact/);
  assert.match(htmlSource, /#root \.scicon-mobile-home[\s\S]*grid-template-rows: auto minmax\(17\.5rem, 1fr\)/);
  assert.match(htmlSource, /#root \.sci-hero-content--compact[\s\S]*grid-template-rows: auto minmax\(6rem, 1fr\) auto/);
  assert.match(htmlSource, /max-height: 720px/);
});

test('weekly leader uses the animated arcade frame treatment', () => {
  assert.match(source, /className="sci-weekly-frame" aria-hidden="true"/);
  assert.match(htmlSource, /\.sci-weekly-frame \{/);
  assert.match(htmlSource, /clip-path: polygon\(12px 0/);
  assert.match(htmlSource, /\.sci-weekly-frame::before/);
});

test('weekly and all-time Trophy Deck views retain and render up to 100 scores', () => {
  assert.match(leaderboardServiceSource, /export const ALL_TIME_SCORE_LIMIT = 100/);
  assert.match(leaderboardServiceSource, /export const WEEKLY_SCORE_LIMIT = 100/);
  assert.match(source, /visibleLeaderboard\.slice\(0, WEEKLY_SCORE_LIMIT\)/);
  assert.match(source, /visibleLeaderboard\.slice\(0, ALL_TIME_SCORE_LIMIT\)/);
  assert.match(source, /displayedLeaderboard\.slice\(1\)/);
  assert.match(source, /rankedEntries\.map/);
  assert.match(source, /const rank = index \+ 2/);
  assert.match(source, /max-h-\[min\(42vh,34rem\)\].*overflow-y-auto.*custom-scrollbar/);
  assert.doesNotMatch(source, /visibleLeaderboard\.slice\(0, 8\)/);
});

test('Weekly and All-time leaders keep animated first place and connect silver and bronze runners to the score list', () => {
  assert.match(source, /first-place-row\.png/);
  assert.doesNotMatch(source, /second-place-row\.png/);
  assert.doesNotMatch(source, /third-place-row\.png/);
  assert.match(source, /first-place-turbine-blades\.png/);
  assert.match(source, /first-place-crown-diamond-\$\{state\}\.png/);
  assert.match(source, /<FirstPlaceLivingRow entry=\{firstPlace\}/);
  assert.doesNotMatch(source, /PodiumRunnerRow/);
  assert.match(source, /rank === 2 \? 'silver' : rank === 3 \? 'bronze' : null/);
  assert.match(source, /sci-leaderboard-row--\$\{podiumTone\}/);
  assert.match(source, /sci-leaderboard-rank--\$\{podiumTone\}/);
  assert.match(htmlSource, /\.sci-first-place-turbine-blades/);
  assert.match(htmlSource, /@keyframes sci-first-place-turbine-spin/);
  assert.match(htmlSource, /\.sci-leaderboard-row--silver/);
  assert.match(htmlSource, /\.sci-leaderboard-row--bronze/);
});

test('leaderboard names open the canonical Mission Record in a read-only viewer', () => {
  assert.match(source, /hasViewableMissionRecord\(entry\)/);
  assert.match(source, /onClick=\{\(\) => openLeaderboardRecord\(entry\)\}/);
  assert.match(source, /View \$\{entry\.name\}'s Mission Record/);

  const viewerStart = source.indexOf('selectedLeaderboardRecord?.runId');
  const viewerEnd = source.indexOf('{showFeedback &&', viewerStart);
  assert.ok(viewerStart >= 0 && viewerEnd > viewerStart);
  const viewerSource = source.slice(viewerStart, viewerEnd);

  assert.match(viewerSource, /role="dialog"/);
  assert.match(viewerSource, /buildMissionRecordCardPath\(selectedLeaderboardRecord\.runId\)/);
  assert.doesNotMatch(viewerSource, /onMint|shareRecord|Share Image|Mint/);
});

test('client leaderboard filtering uses the same Sunday noon-Pacific boundary as finalization', () => {
  assert.match(leaderboardServiceSource, /weeklyCompetitionBoundary\.browser/);
  assert.match(leaderboardServiceSource, /boundary\.startsAt\.getTime\(\)/);
  assert.match(leaderboardServiceSource, /boundary\.endsAt\.getTime\(\)/);
  assert.doesNotMatch(leaderboardServiceSource, /dayOffsetFromMonday/);
  assert.match(source, /scoreTime >= weeklyStartTime && scoreTime < weeklyEndTime/);
  assert.match(source, /\? activeWeeklyLeaderboard/);
});

test('Past Picks renders the complete framed winner archive without trophy thumbnails', () => {
  const archiveStart = source.indexOf("leaderboardView === 'pastPicks'");
  const archiveEnd = source.indexOf("leaderboardView === 'records'", archiveStart);
  assert.ok(archiveStart >= 0 && archiveEnd > archiveStart);
  const archiveSource = source.slice(archiveStart, archiveEnd);

  assert.match(archiveSource, /sortedPastPicks\.map/);
  assert.doesNotMatch(archiveSource, /sortedPastPicks\.slice/);
  assert.match(archiveSource, /sci-past-pick-card/);
  assert.match(archiveSource, /Final allocation/);
  assert.match(archiveSource, /winner\.allocationRsc \?\? weeklyAllocation\.allocationRsc/);
  assert.match(archiveSource, /Proposal selected/);
  assert.match(archiveSource, /resolveProposalSelection\(winner, proposals\)/);
  assert.match(archiveSource, /proposalSelection\?\.imageUrl/);
  assert.match(archiveSource, /key=\{`\$\{proposalSelection\.id\}:\$\{proposalSelection\.imageUrl\}`\}/);
  assert.doesNotMatch(archiveSource, /name="trophy"/);
});
