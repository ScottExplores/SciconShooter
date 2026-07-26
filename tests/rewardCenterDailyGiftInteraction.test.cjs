const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('the current daily gift card is the claim control and other cards stay inert', () => {
  const center = read('components', 'RewardCenter.tsx');

  assert.match(center, /const cardState = isClaimed[\s\S]*\? 'claimed'[\s\S]*\? 'locked'[\s\S]*\? 'pending'[\s\S]*\? 'claimable'[\s\S]*: 'unavailable'/);
  assert.doesNotMatch(center, /connect-required/);
  assert.match(center, /const isClaimable = cardState === 'claimable';/);
  assert.match(center, /<button[\s\S]*key=\{reward\.day\}[\s\S]*type="button"[\s\S]*data-state=\{cardState\}[\s\S]*disabled=\{!isClaimable\}[\s\S]*aria-label=\{cardLabel\}[\s\S]*onClick=\{handleClaimDailyGift\}/);
  assert.match(center, /`Claim Day \$\{reward\.day\}: \$\{rewardName\}`/);
  assert.match(center, /`Day \$\{reward\.day\} claimed: \$\{rewardName\}`/);
});

test('device Pilots can collect daily and achievement rewards without a wallet gate', () => {
  const center = read('components', 'RewardCenter.tsx');

  assert.match(center, /Pilot rewards save on this device/);
  assert.match(center, /Connect a wallet only for minted and onchain items/);
  assert.match(center, /ready=\{dailyStatus\.isAvailable && pendingClaim === null\}/);
  assert.match(center, /disabled=\{!dailyStatus\.isAvailable \|\| pendingClaim !== null\}/);
  assert.match(center, /disabled=\{!status\.complete \|\| pendingClaim !== null\}/);
  assert.doesNotMatch(center, /disabled=\{!walletConnected/);
  assert.doesNotMatch(center, /Connect to claim/);
});

test('daily gift card taps share the existing guarded atomic claim path', () => {
  const center = read('components', 'RewardCenter.tsx');
  const app = read('App.tsx');

  assert.match(center, /if \(claimInFlightRef\.current \|\| !dailyStatus\.isAvailable \|\| !dailyReward\) return;/);
  assert.match(center, /claimInFlightRef\.current = true;[\s\S]*confirmedReward = onClaimDailyGift\(\);/);
  assert.match(app, /if \(rewardClaimInFlightRef\.current\) return null;/);
  assert.match(app, /savePermanentSquadState\(nextPermanentState\);[\s\S]*saveWeeklySquadState\(nextWeeklyState\);/);
});

test('claimable daily cards advertise pointer, focus, and reduced-motion states', () => {
  const styles = read('styles', 'tailwind.input.css');

  assert.match(styles, /\.sci-daily-card:disabled \{[\s\S]*cursor: default;/);
  assert.match(styles, /\.sci-daily-card\.is-claimable \{[\s\S]*cursor: pointer;[\s\S]*touch-action: manipulation;[\s\S]*animation: sci-daily-gift-ready/);
  assert.match(styles, /\.sci-daily-card:focus-visible \{[\s\S]*outline: 2px solid/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.sci-daily-card,[\s\S]*animation: none !important/);
});

test('daily gifts use the Scicon Neon-Frame theme and scale color by reward value', () => {
  const center = read('components', 'RewardCenter.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(center, /type DailyGiftTier = 'standard' \| 'boosted' \| 'premium' \| 'legendary'/);
  assert.match(center, /if \(reward\.shipId\) return 'legendary'/);
  assert.match(center, /if \(reward\.coins >= 1000\) return 'premium'/);
  assert.match(center, /data-tier=\{giftTier\}/);
  assert.match(center, /sci-reward-center sci-neon-frame-window/);
  assert.match(center, /<PixelActionButton[\s\S]*className="sci-reward-primary"[\s\S]*tone="green"/);
  assert.match(styles, /Scicon Neon-Frame/);
  assert.match(styles, /\.sci-daily-card\[data-tier='premium'\][\s\S]*rgb\(217 70 239\)/);
  assert.match(styles, /\.sci-daily-card\[data-tier='legendary'\][\s\S]*rgb\(250 204 21\)/);
});
