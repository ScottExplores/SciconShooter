const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const {
  createWeeklyState,
  sanitizeWalletSnapshot
} = require('../api/_lib/walletProfiles');
const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');

const root = path.resolve(__dirname, '..');
const WALLET = '0x2222222222222222222222222222222222222222';
const PROFILE_ID = `wallet:${WALLET}`;

test('wallet snapshots whitelist fields, normalize profile IDs, and strip minted ownership', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const weekKey = getWeeklyBoundaryMeta(new Date(now)).weekKey;
  const sanitized = sanitizeWalletSnapshot({
    unknownRoot: 'discard me',
    selectedShipId: 'bio',
    weeklyState: {
      version: 99,
      profileId: 'pilot:wrong-device',
      weekKey,
      coins: 42.8,
      unlockedSlots: { left: 1, right: false, admin: true },
      ownedMiniShips: {
        'citation-dart': 99,
        'not-a-real-ship': 5
      },
      equipped: { left: 'citation-dart', right: 'not-a-real-ship' },
      shipUpgrades: {
        researchhub: { fireRate: 999, speed: 999, startingHearts: -5 },
        bio: { fireRate: 3, speed: 2, startingHearts: 1 }
      },
      weeklyStats: { runs: 2, score: 3, enemiesDefeated: 4, coinsEarned: 5 },
      injected: { role: 'admin' }
    },
    permanentState: {
      profileId: 'pilot:wrong-device',
      mintedMiniShips: ['citation-dart', 'ledger-hammer'],
      cosmetics: [' cyan ', 123, 'gold'],
      weeklyArchive: [weekKey, 'not-a-week'],
      dailyGifts: { currentDay: 999, lastClaimDate: '2026-07-23' },
      lifetimeStats: {
        runs: 5,
        highestWave: 6,
        enemiesDefeated: 7,
        bossesDefeated: 8,
        coinsCollected: 9,
        bestScore: 10
      },
      achievementTiers: { 'boss-breaker': 99, injected: 99 },
      unlockedPlayerShips: ['eth', 'admin']
    },
    stats: { highScore: 10.9, totalCoins: 20.1, playerName: '  PILOT NAME THAT IS TOO LONG  ' }
  }, WALLET, now);

  assert.deepEqual(Object.keys(sanitized).sort(), [
    'permanentState',
    'selectedShipId',
    'stats',
    'weeklyState'
  ]);
  assert.equal(sanitized.weeklyState.profileId, PROFILE_ID);
  assert.equal(sanitized.permanentState.profileId, PROFILE_ID);
  assert.equal(sanitized.weeklyState.ownedMiniShips['citation-dart'], 5);
  assert.equal(sanitized.weeklyState.ownedMiniShips['not-a-real-ship'], undefined);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.fireRate, 21);
  assert.equal(sanitized.weeklyState.shipUpgrades.researchhub.speed, 7);
  assert.equal(sanitized.weeklyState.equipped.right, null);
  assert.equal('mintedMiniShips' in sanitized.permanentState, false);
  assert.deepEqual(sanitized.permanentState.unlockedPlayerShips, ['eth']);
  assert.deepEqual(sanitized.permanentState.achievementTiers, { 'boss-breaker': 5 });
  assert.equal(sanitized.stats.playerName.length, 15);
  assert.equal(sanitized.selectedShipId, 'bio');
});

test('a stale client weekly state is reset at the current Sunday-noon Pacific boundary', () => {
  const now = Date.UTC(2026, 6, 23, 19);
  const expected = createWeeklyState(PROFILE_ID, now);
  const sanitized = sanitizeWalletSnapshot({
    weeklyState: {
      ...expected,
      weekKey: '2026-07-12',
      coins: 999999,
      unlockedSlots: { left: true, right: true }
    }
  }, WALLET, now);

  assert.equal(sanitized.weeklyState.weekKey, expected.weekKey);
  assert.equal(sanitized.weeklyState.coins, 0);
  assert.deepEqual(sanitized.weeklyState.unlockedSlots, { left: false, right: false });
});

test('wallet profile SQL is API-only with RLS and no public role grants', () => {
  const sql = fs.readFileSync(
    path.join(root, 'supabase', 'wallet-cloud-profiles.sql'),
    'utf8'
  );

  assert.match(sql, /create table if not exists public\.scicon_wallet_profiles/);
  assert.match(sql, /create table if not exists public\.scicon_wallet_profile_challenges/);
  assert.match(sql, /scicon_wallet_profiles enable row level security/);
  assert.match(sql, /scicon_wallet_profile_challenges enable row level security/);
  assert.match(sql, /revoke all on table public\.scicon_wallet_profiles[\s\S]*from anon, authenticated, public/);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*to service_role/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('wallet profile API shares the existing mint-records Vercel function', () => {
  const vercel = JSON.parse(
    fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')
  );
  const mintRoute = fs.readFileSync(
    path.join(root, 'api', 'mint-records.js'),
    'utf8'
  );

  assert.deepEqual(vercel.rewrites[1], {
    source: '/api/wallet-profile',
    destination: '/api/mint-records?route=wallet-profile'
  });
  assert.match(mintRoute, /req\.query\?\.route === 'wallet-profile'/);
  assert.match(mintRoute, /walletProfileHandler\(req, res\)/);
});
