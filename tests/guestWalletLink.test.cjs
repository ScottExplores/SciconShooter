const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { planGuestWalletLink } = require('../api/_lib/guestWalletLink');
const { DEFAULT_FOUNDER_WALLET } = require('../api/_lib/founderWallet');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');

const WALLET = '0x1111111111111111111111111111111111111111';
const GUEST = 'pilot:abc12345-def0-4567';
const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const WEEK_KEY = getWeeklyBoundaryMeta(new Date(NOW)).weekKey;

const guestSnapshot = (overrides = {}) => ({
  stats: {
    highScore: 4200,
    totalCoins: 80,
    playerName: 'Ada',
    ...(overrides.stats || {})
  },
  weeklyState: {
    weekKey: WEEK_KEY,
    coins: 75,
    durableCampaignCoins: 10,
    unlockedSlots: { left: true, right: true },
    weeklyStats: { score: 8800, weeklyRunAttempts: 3, runs: 2 },
    ...(overrides.weeklyState || {})
  },
  permanentState: {
    lifetimeStats: { bestScore: 4200 },
    unlockedPlayerShips: ['researchhub', 'bio', 'eth', 'btc'],
    campaignProgress: {
      completedMissionIds: ['operation-open-galaxy'],
      missionRecords: {
        'operation-open-galaxy': { completed: true }
      }
    },
    ...(overrides.permanentState || {})
  },
  selectedShipId: 'eth'
});

const walletSnapshot = (overrides = {}) => ({
  stats: {
    highScore: 9000,
    totalCoins: 40,
    playerName: 'Wallet',
    ...(overrides.stats || {})
  },
  weeklyState: {
    weekKey: WEEK_KEY,
    coins: 50,
    durableCampaignCoins: 5,
    unlockedSlots: { left: false, right: false },
    weeklyStats: { score: 1200, weeklyRunAttempts: 1, runs: 1 },
    ...(overrides.weeklyState || {})
  },
  permanentState: {
    lifetimeStats: { bestScore: 9000 },
    unlockedPlayerShips: ['researchhub'],
    ...(overrides.permanentState || {})
  },
  guestImports: overrides.guestImports || [],
  selectedShipId: 'researchhub'
});

test('guest link keeps a stronger wallet and never sums coins or copies ranked score', () => {
  const plan = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: walletSnapshot(),
    guestSnapshot: guestSnapshot(),
    guestProfileId: GUEST,
    now: NOW
  });

  assert.equal(plan.reason, 'keep-wallet-progress');
  assert.equal(plan.snapshot.stats.highScore, 9000);
  assert.equal(plan.snapshot.stats.totalCoins, 40);
  assert.equal(plan.snapshot.weeklyState.coins, 50);
  assert.notEqual(plan.snapshot.weeklyState.coins, 75 + 50);
  assert.equal(plan.snapshot.weeklyState.weeklyStats.score, 1200);
  assert.equal(plan.snapshot.weeklyState.unlockedSlots.right, false);
  assert.equal(plan.snapshot.weeklyState.unlockedSlots.left, false);
  assert.deepEqual(plan.snapshot.permanentState.unlockedPlayerShips, ['researchhub']);
  assert.equal(plan.snapshot.guestImports[0].id, GUEST);
  assert.equal(
    plan.snapshot.permanentState.campaignProgress.completedMissionIds.includes('operation-open-galaxy'),
    false
  );
});

test('a weaker guest cannot lower the wallet personal best', () => {
  const plan = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: walletSnapshot(),
    guestSnapshot: guestSnapshot({ stats: { highScore: 100, totalCoins: 1, playerName: 'Ada' } }),
    guestProfileId: GUEST,
    now: NOW
  });
  assert.equal(plan.snapshot.stats.highScore, 9000);
  assert.equal(plan.snapshot.permanentState.lifetimeStats.bestScore, 9000);
});

test('an empty wallet adopts guest gameplay once without paid ships or a ranked score', () => {
  const plan = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: null,
    guestSnapshot: guestSnapshot(),
    guestProfileId: GUEST,
    now: NOW
  });

  assert.equal(plan.reason, 'adopt-empty-wallet');
  assert.equal(plan.snapshot.stats.highScore, 4200);
  assert.equal(plan.snapshot.weeklyState.coins, 75);
  assert.equal(plan.snapshot.weeklyState.weeklyStats.score, 0);
  assert.equal(plan.snapshot.weeklyState.weeklyStats.weeklyRunAttempts, 0);
  assert.equal(plan.snapshot.weeklyState.unlockedSlots.left, true);
  assert.equal(plan.snapshot.weeklyState.unlockedSlots.right, false);
  assert.deepEqual(plan.snapshot.permanentState.unlockedPlayerShips, ['researchhub']);
  assert.equal(plan.snapshot.selectedShipId, 'researchhub');
  assert.equal(plan.snapshot.permanentState.playerShipEntitlements.eth, null);
  assert.equal(
    plan.snapshot.permanentState.campaignProgress.completedMissionIds.includes('operation-open-galaxy'),
    true
  );
});

test('repeating a guest import does not grant the guest coin balance again', () => {
  const first = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: null,
    guestSnapshot: guestSnapshot(),
    guestProfileId: GUEST,
    now: NOW
  });
  const second = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: {
      ...first.snapshot,
      weeklyState: { ...first.snapshot.weeklyState, coins: 10 }
    },
    guestSnapshot: guestSnapshot({ weeklyState: { coins: 500 } }),
    guestProfileId: GUEST,
    now: NOW + 60_000
  });

  assert.equal(second.reason, 'already-linked');
  assert.equal(second.snapshot.weeklyState.coins, 10);
  assert.equal(second.changed, false);
});

test('a later higher guest personal best can rise without moving coins', () => {
  const first = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: walletSnapshot({ stats: { highScore: 100, totalCoins: 40, playerName: 'Wallet' } }),
    guestSnapshot: guestSnapshot({ stats: { highScore: 150, totalCoins: 80, playerName: 'Ada' } }),
    guestProfileId: GUEST,
    now: NOW
  });
  const second = planGuestWalletLink({
    walletAddress: WALLET,
    currentSnapshot: first.snapshot,
    guestSnapshot: guestSnapshot({ stats: { highScore: 800, totalCoins: 80, playerName: 'Ada' } }),
    guestProfileId: GUEST,
    now: NOW + 60_000
  });

  assert.equal(second.snapshot.stats.highScore, 800);
  assert.equal(second.snapshot.weeklyState.coins, first.snapshot.weeklyState.coins);
  assert.equal(second.snapshot.weeklyState.weeklyStats.score, first.snapshot.weeklyState.weeklyStats.score);
});

test('the founder wallet does not import guest progress', () => {
  const current = walletSnapshot();
  const plan = planGuestWalletLink({
    walletAddress: DEFAULT_FOUNDER_WALLET,
    currentSnapshot: current,
    guestSnapshot: guestSnapshot({ stats: { highScore: 999999, totalCoins: 1, playerName: 'Ada' } }),
    guestProfileId: GUEST,
    now: NOW
  });
  assert.equal(plan.reason, 'founder');
  assert.equal(plan.changed, false);
  assert.equal(plan.snapshot, current);
});

test('guest linking does not write the leaderboard or accept a body wallet', () => {
  const source = fs.readFileSync(path.join(root, 'api', '_lib', 'guestWalletLink.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'api', '_lib', 'walletProfileRoute.js'), 'utf8');
  assert.doesNotMatch(source, /scicon_leaderboard|leaderboard/i);
  assert.match(route, /action === 'link-guest'/);
  assert.match(route, /address: session\.walletAddress/);
  assert.doesNotMatch(
    route.slice(route.indexOf("action === 'link-guest'"), route.indexOf("action === 'save'")),
    /body\.address|body\.walletAddress/
  );
});
