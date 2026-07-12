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

test('home winner card uses the same proposal progress calculation as proposal rows', () => {
  assert.match(
    source,
    /weeklyProposalPreview\s*\?\s*getProposalProgress\(weeklyProposalPreview\)\s*:\s*0/
  );
  assert.match(source, /\{weeklyFundingProgress\}% progress/);
  assert.doesNotMatch(source, /\{weeklyFundingProgress\}% week/);
});

test('home winner image has no trophy overlay', () => {
  const imageStart = source.indexOf('sci-weekly-project-image');
  const imageEnd = source.indexOf('<div className="min-w-0">', imageStart);
  assert.ok(imageStart >= 0 && imageEnd > imageStart);
  assert.doesNotMatch(source.slice(imageStart, imageEnd), /name="trophy"/);
});

test('mobile home lets its mission panel fill the available space above navigation', () => {
  assert.match(source, /className="flex min-h-full flex-col gap-2"/);
  assert.match(source, /<HeroPanel compact fill\s*\/>/);
  assert.match(source, /fill \? 'flex-1' : ''/);
});

test('all-time Trophy Deck retains and renders up to 100 scores', () => {
  assert.match(leaderboardServiceSource, /export const ALL_TIME_SCORE_LIMIT = 100/);
  assert.match(source, /visibleLeaderboard\.slice\(0, ALL_TIME_SCORE_LIMIT\)/);
  assert.match(source, /displayedLeaderboard\.map/);
  assert.doesNotMatch(source, /visibleLeaderboard\.slice\(0, 8\)/);
});
