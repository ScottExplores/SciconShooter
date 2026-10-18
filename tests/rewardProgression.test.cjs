const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('daily gifts keep the 30-day Token calendar without granting gated ships', () => {
  const rewards = read('services', 'rewardProgression.ts');
  const squad = read('services', 'squadProgression.ts');

  const coinList = rewards.match(/const DAILY_COIN_REWARDS = \[([\s\S]*?)\] as const;/);
  assert.ok(coinList, 'daily coin rewards should be declared');
  const coins = coinList[1].match(/\d+/g).map(Number);

  assert.equal(coins.length, 30);
  assert.deepEqual(coins.slice(0, 5), [50, 100, 200, 400, 800]);
  assert.equal(coins[13], 500, 'the two-week milestone should retain a larger coin grant');
  assert.equal(coins[20], 500, 'the third-week milestone should retain a larger coin grant');
  assert.equal(coins[29], 1000, 'the final milestone should remain the calendar peak');
  assert.equal(coins.reduce((total, reward) => total + reward, 0), 9450);
  assert.ok(coins.every((coinsForDay) => coinsForDay <= 1000));
  assert.doesNotMatch(rewards, /day === 14 \? \{ shipId: 'eth' as const \}/);
  assert.doesNotMatch(rewards, /day === 30 \? \{ shipId: 'btc' as const \}/);
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
    // The original six score the arcade run.
    'sector-pioneer',
    'boss-breaker',
    'research-hunter',
    'coin-collector',
    'mission-veteran',
    'ace-score',
    // These six cover the systems the game grew: the Campaign graph, the
    // Weekly Run gauntlet, Elite Bosses, and the Hangar.
    'campaign-cartographer',
    'mission-perfectionist',
    'elite-hunter',
    'gauntlet-runner',
    'deep-sector',
    'hangar-engineer'
  ];

  ids.forEach((id) => assert.match(rewards, new RegExp(`id: '${id}'`)));
  assert.match(rewards, /description: 'Reach Mission \{target\}'/);
  assert.match(rewards, /targets: \[2, 4, 6, 10, 15\]/);
  assert.match(rewards, /targets: \[2, 5, 10, 25, 50\]/);
  assert.match(rewards, /targets: \[100, 500, 1500, 5000, 10000\]/);

  // Pinning the exact reward arrays made every economy retune a test edit and
  // proved nothing about the shape. Assert the invariants instead.
  const tracks = [...rewards.matchAll(/rewards: \[([^\]]*)\]/g)]
    .map((match) => match[1].split(',').map((value) => Number(value.trim())));
  const targetLists = [...rewards.matchAll(/targets: \[([^\]]*)\]/g)]
    .map((match) => match[1].split(',').map((value) => Number(value.trim())));

  assert.equal(tracks.length, ids.length);
  assert.equal(targetLists.length, ids.length);
  tracks.forEach((tiers, index) => {
    assert.equal(tiers.length, 5, `${ids[index]} has five tiers`);
    assert.ok(tiers.every((coins) => Number.isInteger(coins) && coins > 0), ids[index]);
    for (let tier = 1; tier < tiers.length; tier += 1) {
      assert.ok(tiers[tier] > tiers[tier - 1], `${ids[index]} tier ${tier + 1} pays more`);
    }
  });
  targetLists.forEach((targets, index) => {
    assert.equal(targets.length, 5, `${ids[index]} has five targets`);
    for (let tier = 1; tier < targets.length; tier += 1) {
      assert.ok(targets[tier] > targets[tier - 1], `${ids[index]} target ${tier + 1} is harder`);
    }
  });

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
  const dailyClaimHandler = app.slice(
    app.indexOf('const handleClaimDailyGift'),
    app.indexOf('const handleClaimAchievement')
  );
  const achievementClaimHandler = app.slice(
    app.indexOf('const handleClaimAchievement'),
    app.indexOf('const handleOpenRewardCenter')
  );

  assert.match(app, /claimDailyGiftReward\(permanentSquadState\)/);
  assert.match(app, /rewardClaimInFlightRef\.current/);
  assert.equal(
    (app.match(/if \(isOwnerWallet\) return null;/g) || []).length,
    2,
    'founder sandbox daily and achievement claims must not persist into the device Pilot'
  );
  assert.doesNotMatch(dailyClaimHandler, /connectWallet\(\)/);
  assert.doesNotMatch(achievementClaimHandler, /connectWallet\(\)/);
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
  const gift = read('components', 'revamp', 'HomeDailyGift.tsx');
  const homeStyles = read('styles', 'revamp-home.css');
  const motion = read('components', 'revamp', 'UiMotion.tsx');
  const motionStyles = read('styles', 'revamp-ui.css');

  assert.match(startScreen, /\? 'Daily Gift'[\s\S]*\? 'Achievements'[\s\S]*: 'Reward Center'/);
  assert.match(startScreen, /openRewardCenter\([\s\S]*\? 'achievements' : 'daily'/);
  // REVAMP(K): Restore the remaster side tab while retaining reward routing,
  // pending-achievement feedback, and a ship-stage anchor clear of funding.
  assert.match(startScreen, /sci-hero-ship-stage[\s\S]*<HomeDailyGift[\s\S]*giftAvailable=\{dailyGiftStatus\.isAvailable\}[\s\S]*achievementCount=\{claimableAchievementCount\}[\s\S]*rewardsOpen=\{showRewardCenter\}/);
  assert.doesNotMatch(startScreen, /<HomeFlightDeckBrand/);
  assert.match(gift, /data-onboarding-target="rewards-open"/);
  assert.match(gift, /onClick=\{onOpenRewards\}/);
  assert.match(gift, /giftAvailable\s*\? 'sci-reward-edge-trigger--claimable' : 'sci-reward-edge-trigger--collapsed'/);
  assert.match(gift, /!giftAvailable && achievementCount > 0[\s\S]*'sci-reward-edge-trigger--achievement-ready'/);
  assert.match(gift, /aria-label=\{giftAvailable\s*\? 'Claim daily gift'[\s\S]*achievementCount > 0[\s\S]*achievement[\s\S]*'Open reward center'/);
  assert.match(gift, /aria-controls="reward-center"/);
  assert.match(gift, /aria-expanded=\{rewardsOpen\}/);
  assert.match(homeStyles, /sci-hero-ship-stage--compact[\s\S]*\.sci-reward-edge-trigger[\s\S]*?position:\s*absolute/);
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
  assert.match(center, /\+\{formatTokenAmount\(claimNotice\.coins\)\}/);
  assert.doesNotMatch(center, /Research coins added|\bcoins<| coins`/i);
  assert.match(center, /confirmedReward = onClaimDailyGift\(\);[\s\S]*if \(!confirmedReward\)[\s\S]*setClaimNotice/);
  assert.match(center, /confirmedCoins = onClaimAchievement\(id\);[\s\S]*if \(confirmedCoins === null\)[\s\S]*setClaimNotice/);
  assert.match(center, /claimInFlightRef\.current/);
  assert.match(center, /pendingClaim !== null/);
  assert.match(center, /Day \{reward\.day\}/);
  assert.match(center, /Unlock \$\{ship\.name\}/);
  // Closing content is briefly visible but cannot receive input or focus.
  assert.match(center, /<UiPresence show=\{open\} className="sci-reward-backdrop"/);
  assert.match(center, /previousFocus instanceof HTMLElement && previousFocus\.isConnected\) previousFocus\.focus\(\{ preventScroll: true \}\)/);
  assert.match(motion, /exitMs = 150/);
  assert.match(motion, /setTimeout\(\(\) => setMounted\(false\), reducedMotion \? 0 : exitMs\)/);
  assert.match(motion, /window\.clearTimeout\(timeout\)/);
  assert.match(motion, /if \(!show && \(!mounted \|\| reducedMotion\)\) return null/);
  assert.match(motion, /!show \? \{ inert: '' \} : \{\}/);
  assert.match(motionStyles, /\.revamp-ui-presence\[data-state='closed'\] \{[^}]*pointer-events: none/);
  assert.match(motionStyles, /#root \.sci-reward-claim-celebration \{[^}]*position: relative/);
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
