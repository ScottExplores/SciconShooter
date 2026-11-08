const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const { planGuestWalletLink } = require('../api/_lib/guestWalletLink');

const GUEST = 'pilot:abc12345-def0-4567';
const OTHER_GUEST = 'pilot:zzzz9999-other-guest';

const richGuest = () => ({
  stats: { highScore: 1_000_000_000, totalCoins: 1_000_000_000, playerName: 'Fake' },
  weeklyState: {
    coins: 1_000_000_000,
    durableCampaignCoins: 1_000_000_000,
    unlockedSlots: { left: true, right: true },
    weeklyStats: { score: 1_000_000_000, weeklyRunAttempts: 9, runs: 9 }
  },
  permanentState: {
    lifetimeStats: { bestScore: 1_000_000_000, runs: 40 },
    unlockedPlayerShips: ['researchhub', 'bio', 'eth', 'btc'],
    campaignProgress: { completedMissionIds: ['operation-open-galaxy'] }
  },
  selectedShipId: 'eth'
});

test('guest import does not copy currency, unlocks, or personal best onto an empty wallet', () => {
  const plan = planGuestWalletLink({
    currentSnapshot: null,
    guestSnapshot: richGuest(),
    guestProfileId: GUEST
  });
  assert.equal(plan.changed, false);
  assert.equal(plan.applied, false);
  assert.equal(plan.reason, 'guest-stays-on-device');
  assert.equal(plan.snapshot, null);
});

test('a second fabricated guest id cannot seed another empty wallet', () => {
  const first = planGuestWalletLink({
    currentSnapshot: null,
    guestSnapshot: richGuest(),
    guestProfileId: GUEST
  });
  const second = planGuestWalletLink({
    currentSnapshot: first.snapshot,
    guestSnapshot: richGuest(),
    guestProfileId: OTHER_GUEST
  });
  assert.equal(second.changed, false);
  assert.equal(second.snapshot, null);
});

test('an existing wallet profile is left unchanged by a guest payload', () => {
  const current = {
    stats: { highScore: 9000, totalCoins: 40, playerName: 'Wallet' },
    weeklyState: { coins: 50, weeklyStats: { score: 1200 } },
    permanentState: { lifetimeStats: { bestScore: 9000 } }
  };
  const plan = planGuestWalletLink({
    currentSnapshot: current,
    guestSnapshot: richGuest(),
    guestProfileId: GUEST
  });
  assert.equal(plan.snapshot, current);
  assert.equal(plan.snapshot.stats.highScore, 9000);
  assert.equal(plan.snapshot.weeklyState.coins, 50);
  assert.equal(plan.snapshot.weeklyState.weeklyStats.score, 1200);
  assert.equal(plan.snapshot.permanentState.lifetimeStats.bestScore, 9000);
});

test('guest linking does not write a profile or the leaderboard', () => {
  const source = fs.readFileSync(path.join(root, 'api', '_lib', 'guestWalletLink.js'), 'utf8');
  const route = fs.readFileSync(path.join(root, 'api', '_lib', 'walletProfileRoute.js'), 'utf8');
  const linkFn = source.slice(source.indexOf('const linkGuestWalletProfile'), source.indexOf('module.exports'));
  assert.doesNotMatch(source, /scicon_leaderboard|leaderboard/i);
  assert.doesNotMatch(linkFn, /saveWalletProfile/);
  assert.match(source, /guest-stays-on-device/);
  assert.match(route, /action === 'link-guest'/);
  assert.match(route, /address: session\.walletAddress/);
  assert.doesNotMatch(
    route.slice(route.indexOf("action === 'link-guest'"), route.indexOf("action === 'save'")),
    /body\.address|body\.walletAddress/
  );
});

test('the app does not upload the device guest save into the wallet profile', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.doesNotMatch(app, /linkAuthenticatedGuestProgress/);
  assert.doesNotMatch(app, /prepareGuestLinkSnapshot/);
  assert.match(
    fs.readFileSync(path.join(root, 'services', 'walletLocalArchive.ts'), 'utf8'),
    /walletSnapshotHasOwnedProgress/
  );
  assert.match(app, /walletProfileCloudBackedRef/);
  assert.doesNotMatch(app, /expectedRevision: 0/);
  assert.doesNotMatch(app, /createWalletSeedSnapshot/);
  assert.match(app, /bootstrapAuthenticatedWalletProfile/);
  assert.match(app, /archiveLocalWalletSnapshot/);
  assert.match(app, /profileId: pilotProfile\.id/);
  const bootstrap = app.slice(
    app.indexOf('if (!profile)'),
    app.indexOf('walletProfileCloudBackedRef.current = true', app.indexOf('if (!profile)'))
  );
  assert.match(bootstrap, /discardWalletProfileDirty/);
  assert.doesNotMatch(bootstrap, /snapshot:/);
});
