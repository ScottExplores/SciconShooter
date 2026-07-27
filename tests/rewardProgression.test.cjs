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
  assert.deepEqual(coins.slice(0, 6), [50, 100, 200, 400, 800, 1000]);
  assert.ok(coins.slice(5).every((coinsForDay) => coinsForDay === 1000));
  assert.ok(coins.every((coinsForDay, index) => index === 0 || coinsForDay >= coins[index - 1]));
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
  assert.match(rewards, /description: 'Reach Mission \{target\}'/);
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
  assert.match(rewards, /getClaimableAchievementCount/);
  assert.match(rewards, /runs: state\.lifetimeStats\.runs \+ 1/);
  assert.match(rewards, /bossesDefeated: state\.lifetimeStats\.bossesDefeated \+ 1/);
  assert.match(squad, /achievementTiers: Record<string, number>/);
  assert.match(squad, /lifetimeStats: PermanentLifetimeStats/);
});

test('reward claims persist atomically, guard double taps, and report confirmed rewards', () => {
  const app = read('App.tsx');
  const squad = read('services', 'squadProgression.ts');

  assert.match(app, /claimDailyGiftReward\(permanentSquadState\)/);
  assert.match(app, /rewardClaimInFlightRef\.current/);
  assert.equal(
    (app.match(/if \(isOwnerWallet\) return null;/g) || []).length,
    2,
    'founder sandbox daily and achievement claims must not persist into the device Pilot'
  );
  assert.doesNotMatch(app, /if \(!activeWalletAddress\) \{[\s\S]*connectWallet\(\);[\s\S]*return null;/);
  assert.match(app, /permanentSquadState\.profileId !== activeProfileId[\s\S]*weeklySquadState\.profileId !== activeProfileId/);
  assert.match(app, /savePermanentSquadState\(nextPermanentState\)/);
  assert.match(app, /saveWeeklySquadState\(nextWeeklyState\)/);
  assert.match(app, /setPermanentSquadState\(nextPermanentState\)/);
  assert.match(app, /setWeeklySquadState\(nextWeeklyState\)/);
  assert.match(app, /awardWeeklySquadCoins\([\s\S]*weeklySquadState,[\s\S]*result\.reward\.coins,[\s\S]*'daily-gift'/);
  assert.match(app, /return result\.reward;/);
  assert.match(app, /claimAchievementReward\(permanentSquadState, id\)/);
  assert.match(app, /awardWeeklySquadCoins\([\s\S]*weeklySquadState,[\s\S]*result\.rewardCoins,[\s\S]*`achievement:\$\{id\}`/);
  assert.match(app, /return result\.rewardCoins;/);
  assert.match(app, /catch \{[\s\S]*rewardClaimInFlightRef\.current = false;[\s\S]*return null;/);
  assert.match(app, /catch \{[\s\S]*savePermanentSquadState\(previousPermanentState\)[\s\S]*saveWeeklySquadState\(previousWeeklyState\)/);
  assert.match(squad, /weeklyStats: \{[\s\S]*coinsEarned: state\.weeklyStats\.coinsEarned \+ earned/);
});

test('the Reward Center routes pending rewards and celebrates only confirmed claims', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const center = read('components', 'RewardCenter.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(startScreen, /\? 'Daily Gift'[\s\S]*\? 'Achievements'[\s\S]*: 'Reward Center'/);
  assert.match(startScreen, /openRewardCenter\([\s\S]*\? 'achievements' : 'daily'/);
  assert.match(startScreen, /sci-reward-edge-trigger--collapsed/);
  assert.match(startScreen, /sci-reward-edge-trigger--achievement-ready/);
  assert.match(startScreen, /scicon-reward-edge-v1\/reward-arrow\.png/);
  assert.match(startScreen, /data-reward-ready=\{rewardAttention \? 'true' : 'false'\}/);
  assert.match(startScreen, /getDailyGiftStatus\(permanentSquadState, new Date\(weeklyClock\)\)/);
  assert.match(startScreen, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(startScreen, /window\.addEventListener\('focus', handleResume\)/);
  assert.match(startScreen, /const nextMidnight = new Date\(/);
  assert.match(startScreen, /window\.clearTimeout\(midnightTimer\)/);
  assert.match(startScreen, /document\.removeEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.match(startScreen, /getClaimableAchievementCount\(permanentSquadState\)/);
  assert.match(startScreen, /<RewardCenter/);
  assert.match(startScreen, /initialTab=\{rewardCenterInitialTab\}/);
  assert.match(center, /useState<RewardTab>\('daily'\)/);
  assert.match(center, /const dailyStatus = getDailyGiftStatus\(permanentState\);/);
  assert.doesNotMatch(center, /useMemo\([\s\S]*getDailyGiftStatus\(permanentState\)/);
  assert.match(center, /setTab\(initialTab\)/);
  assert.match(center, /DAILY_GIFT_REWARDS\.map/);
  assert.match(center, /ACHIEVEMENT_DEFINITIONS\.map/);
  assert.match(center, /sci-reward-claim-celebration/);
  assert.match(center, /\+\{claimNotice\.coins\.toLocaleString\(\)\} coins/);
  assert.match(center, /confirmedReward = onClaimDailyGift\(\);[\s\S]*if \(!confirmedReward\)[\s\S]*setClaimNotice/);
  assert.match(center, /confirmedCoins = onClaimAchievement\(id\);[\s\S]*if \(confirmedCoins === null\)[\s\S]*setClaimNotice/);
  assert.match(center, /claimInFlightRef\.current/);
  assert.match(center, /pendingClaim !== null/);
  assert.match(center, /Day \{reward\.day\}/);
  assert.match(center, /Unlock \$\{ship\.name\}/);
  assert.match(styles, /\.sci-reward-edge-trigger/);
  assert.match(styles, /bottom: calc\(max\(0\.5rem, env\(safe-area-inset-bottom\)\) \+ 20rem\)/);
  assert.match(styles, /animation: sci-reward-edge-hover 4\.2s ease-in-out infinite/);
  assert.match(styles, /@keyframes sci-reward-edge-hover/);
  assert.match(styles, /@keyframes sci-reward-edge-claimable/);
  assert.match(styles, /@keyframes sci-reward-edge-achievement-nudge/);
  assert.match(styles, /@keyframes sci-reward-panel-enter/);
  assert.match(styles, /animation: sci-reward-backdrop-enter 540ms cubic-bezier\(0\.2, 0\.68, 0\.22, 1\) both/);
  assert.match(styles, /animation: sci-reward-panel-enter 680ms cubic-bezier\(0\.2, 0\.72, 0\.18, 1\) both/);
  assert.match(styles, /70% \{[\s\S]*translate3d\(-0\.9rem, 0, 0\)[\s\S]*86% \{[\s\S]*translate3d\(0\.26rem, 0, 0\)/);
  assert.match(styles, /\.sci-reward-backdrop,[\s\S]*\.sci-reward-center,[\s\S]*animation: none !important/);
  assert.match(styles, /@keyframes sci-reward-claim-confirm/);
  assert.match(styles, /@keyframes sci-dashboard-reward-frame/);
  assert.match(styles, /@keyframes sci-dashboard-reward-dot/);
  assert.doesNotMatch(styles, /sci-dashboard-reward-breathe/);
  assert.match(styles, /\.sci-daily-grid/);
  assert.match(styles, /\.sci-achievement-card/);
});
