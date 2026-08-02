const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('Campaign records no score and reaches no leaderboard', () => {
  const app = read('App.tsx');

  // Competitive Campaign runs are excluded from the weekly board by
  // construction, not by a conditional somewhere downstream.
  assert.match(
    app,
    /const isWeeklyLeaderboardRun = !isNonCompetitiveRun && !isCompetitiveCampaignRun/
  );

  // Campaign must not write a high score either. This used to key off
  // isNonCompetitiveRun, which let Campaign runs raise stats.highScore.
  assert.match(
    app,
    /isWeeklyLeaderboardRun && stats\.score > stats\.highScore/
  );
  assert.doesNotMatch(app, /!isNonCompetitiveRun && stats\.score > stats\.highScore/);

  // Score submission, and therefore the proposal pick that follows it, is
  // reachable only on a weekly-leaderboard run.
  assert.match(app, /if \(!isWeeklyLeaderboardRun \|\| !playerNameInput\.trim\(\)/);
  assert.match(app, /setShowNameInput\(isWeeklyLeaderboardRun\)/);
});

test('Campaign story transmissions never fire in the Weekly Run', () => {
  const app = read('App.tsx');

  // Both entry points: the per-wave beat and the mission intro beat.
  assert.match(app, /if \(isWeeklyCampaignRun\) \{\n\s*return;/);
  assert.match(app, /pendingLaunch\.runMode === 'weekly-streak'\s*\n?\s*\? null/);
});

test('the Trophy Deck separates Weekly Funding from Campaign progression', () => {
  const screen = read('components', 'StartScreen.tsx');

  assert.match(screen, /type TrophyCategory = 'weeklyFunding' \| 'campaign'/);
  assert.match(screen, /const CampaignTrophyPanel/);
  assert.match(screen, /trophyCategory === 'campaign'/);

  // The Campaign half must not present a score or a rank -- Campaign records
  // neither, and showing one would imply it feeds the competition.
  const panel = screen.match(/const CampaignTrophyPanel[\s\S]*?\n\};/);
  assert.ok(panel, 'CampaignTrophyPanel must stay inspectable');
  assert.doesNotMatch(panel[0], /leaderboard|highScore|rank|proposal/i);
  assert.match(panel[0], /Campaign records no score/);

  // Progression is what it does show.
  for (const label of [
    'Missions cleared',
    'Missions mastered',
    'Stars earned',
    'Elite Bosses beaten',
    'Hangar upgrades'
  ]) {
    assert.ok(panel[0].includes(label), `Campaign trophies should show "${label}"`);
  }
});
