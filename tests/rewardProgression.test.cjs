const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('daily gifts define a persistent 30-day calendar with ship milestones', () => {
  const rewards = read('services', 'rewardProgression.ts');
  const squad = read('services', 'squadProgression.ts');

  const coinList = rewards.match(/const DAILY_COIN_REWARDS = \[([\s\S]*?)\] as const;/);
  assert.ok(coinList, 'daily coin rewards should be declared');
  const coins = coinList[1].match(/\d+/g).map(Number);

  assert.equal(coins.length, 30);
  assert.deepEqual(coins, Array.from({ length: 30 }, (_, index) => (index + 1) * 10));
  assert.match(rewards, /day === 14 \? \{ shipId: 'eth' as const \}/);
  assert.match(rewards, /day === 30 \? \{ shipId: 'btc' as const \}/);
  assert.match(rewards, /daysSinceClaim === 1/);
  assert.match(rewards, /currentDay >= 30 \? 1 : state\.dailyGifts\.currentDay \+ 1/);
  assert.match(rewards, /claimableDay: 1, claimedToday: false, isAvailable: true, streakReset: true/);

  assert.match(squad, /dailyGifts: DailyGiftProgress/);
  assert.match(squad, /unlockedPlayerShips: PlayerShipId\[\]/);
  assert.match(squad, /currentDay: Math\.max\(0, Math\.min\(30/);
  assert.match(squad, /permanentStorageKey\(fallback\.profileId\)/);
});

test('achievements advance through permanent progressive tiers', () => {
  const rewards = read('services', 'rewardProgression.ts');
  const squad = read('services', 'squadProgression.ts');

  const ids = [
    'sector-pioneer',
    'boss-breaker',
    'research-hunter',
    'coin-collector',
    'mission-veteran',
    'ace-score'
  ];

  ids.forEach((id) => assert.match(rewards, new RegExp(`id: '${id}'`)));
  assert.match(rewards, /targets: \[2, 4, 6, 10, 15\]/);
  assert.match(rewards, /targets: \[2, 5, 10, 25, 50\]/);
  assert.match(rewards, /targets: \[100, 500, 1500, 5000, 10000\]/);
  assert.match(rewards, /rewards: \[150, 300, 500, 800, 1400\]/);
  assert.match(rewards, /rewards: \[200, 400, 700, 1200, 2000\]/);
  assert.match(rewards, /rewards: \[150, 350, 600, 1100, 1800\]/);
  assert.match(rewards, /rewards: \[100, 300, 600, 1000, 1700\]/);
  assert.match(rewards, /rewards: \[150, 350, 650, 1100, 1800\]/);
  assert.match(rewards, /rewards: \[200, 450, 800, 1400, 2400\]/);
  assert.match(rewards, /\[id\]: status\.claimedTiers \+ 1/);
  assert.match(rewards, /runs: state\.lifetimeStats\.runs \+ 1/);
  assert.match(rewards, /bossesDefeated: state\.lifetimeStats\.bossesDefeated \+ 1/);
  assert.match(squad, /achievementTiers: Record<string, number>/);
  assert.match(squad, /lifetimeStats: PermanentLifetimeStats/);
});

test('reward claims pay the current week without moving permanent progress into weekly storage', () => {
  const app = read('App.tsx');
  const squad = read('services', 'squadProgression.ts');

  assert.match(app, /claimDailyGiftReward\(permanentSquadState\)/);
  assert.match(app, /setPermanentSquadState\(result\.state\)/);
  assert.match(app, /awardWeeklySquadCoins\(current, result\.reward\.coins, 'daily-gift'\)/);
  assert.match(app, /claimAchievementReward\(permanentSquadState, id\)/);
  assert.match(app, /awardWeeklySquadCoins\(current, result\.rewardCoins, `achievement:\$\{id\}`\)/);
  assert.match(squad, /weeklyStats: \{[\s\S]*coinsEarned: state\.weeklyStats\.coinsEarned \+ earned/);
});

test('the Reward Center is reachable from Home and More and opens on Daily Gifts', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const center = read('components', 'RewardCenter.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(startScreen, /label="Daily Gifts"/);
  assert.match(startScreen, /dailyGiftStatus\.isAvailable \? ' sci-reward-edge-trigger--claimable' : ''/);
  assert.match(startScreen, /getDailyGiftStatus\(permanentSquadState\)/);
  assert.match(startScreen, /<RewardCenter/);
  assert.match(center, /useState<RewardTab>\('daily'\)/);
  assert.match(center, /setTab\('daily'\)/);
  assert.match(center, /DAILY_GIFT_REWARDS\.map/);
  assert.match(center, /ACHIEVEMENT_DEFINITIONS\.map/);
  assert.match(center, /Day \{reward\.day\}/);
  assert.match(center, /Unlock \$\{ship\.name\}/);
  assert.match(styles, /\.sci-reward-edge-trigger/);
  assert.match(styles, /bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ 13\.25rem\)/);
  assert.match(styles, /animation: sci-reward-edge-hover 4\.2s ease-in-out infinite/);
  assert.match(styles, /@keyframes sci-reward-edge-hover/);
  assert.match(styles, /@keyframes sci-reward-edge-claimable/);
  assert.match(styles, /\.sci-daily-grid/);
  assert.match(styles, /\.sci-achievement-card/);
});
