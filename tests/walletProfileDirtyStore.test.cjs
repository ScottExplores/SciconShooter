const test = require('node:test');
const assert = require('node:assert/strict');

const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const createStorage = () => {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); }
  };
};

const snapshot = (
  address,
  {
    coins = 100,
    runs = 2,
    fireRate = 1,
    totalCoins = 100,
    selectedShipId = 'researchhub'
  } = {}
) => {
  const profileId = `wallet:${address}`;
  return {
    weeklyState: {
      version: 3,
      profileId,
      weekKey: '2026-07-19',
      coins,
      unlockedSlots: { left: true, right: false },
      ownedMiniShips: { 'citation-dart': 1 },
      equipped: { left: 'citation-dart', right: null },
      shipUpgrades: {
        researchhub: { fireRate, speed: 0, startingHearts: 0 }
      },
      weeklyStats: {
        runs,
        score: 50,
        enemiesDefeated: 10,
        coinsEarned: 100
      },
      updatedAt: '2026-07-23T00:00:00.000Z'
    },
    permanentState: {
      version: 1,
      profileId,
      cosmetics: [],
      weeklyArchive: [],
      dailyGifts: { currentDay: 1, lastClaimDate: '2026-07-23' },
      lifetimeStats: {
        runs,
        highestWave: 2,
        enemiesDefeated: 10,
        bossesDefeated: 1,
        coinsCollected: totalCoins,
        bestScore: 50
      },
      achievementTiers: {},
      unlockedPlayerShips: ['researchhub'],
      bossArchive: { unlockedEventIds: [], seenEventIds: [] },
      updatedAt: '2026-07-23T00:00:00.000Z'
    },
    stats: {
      highScore: 50,
      totalCoins,
      playerName: 'PILOT'
    },
    selectedShipId
  };
};

test('dirty wallet snapshots stay address scoped and reject cross-wallet data', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A);
  const dirty = dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 3,
    baseSnapshot: base,
    snapshot: { ...base, selectedShipId: 'bio' }
  });

  assert.equal(dirty.walletAddress, WALLET_A);
  assert.equal(dirty.expectedRevision, 3);
  assert.equal(
    dirtyStore.readWalletProfileDirty(WALLET_A).snapshot.selectedShipId,
    'bio'
  );
  assert.equal(dirtyStore.readWalletProfileDirty(WALLET_B), null);
  assert.throws(() => dirtyStore.markWalletProfileDirty({
    address: WALLET_B,
    expectedRevision: 0,
    baseSnapshot: null,
    snapshot: base
  }), /cannot cross wallet boundaries/i);
});

test('acknowledging an older save rebases but never clears a newer dirty write', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A);
  const first = dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 2,
    baseSnapshot: base,
    snapshot: { ...base, selectedShipId: 'bio' }
  });
  const secondSnapshot = { ...base, selectedShipId: 'eth' };
  dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 2,
    baseSnapshot: base,
    snapshot: secondSnapshot
  });

  const remaining = dirtyStore.rebaseWalletProfileDirty({
    address: WALLET_A,
    sentWriteId: first.writeId,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 3,
      snapshot: { ...base, selectedShipId: 'bio' }
    }
  });

  assert.equal(remaining.expectedRevision, 3);
  assert.equal(remaining.snapshot.selectedShipId, 'eth');
  assert.equal(remaining.baseSnapshot.selectedShipId, 'bio');
});

test('semantic comparison ignores regenerated timestamps and minted ownership', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const left = snapshot(WALLET_A);
  const right = snapshot(WALLET_A);
  right.weeklyState.updatedAt = '2026-07-24T00:00:00.000Z';
  right.permanentState.updatedAt = '2026-07-24T00:00:00.000Z';
  right.permanentState.mintedMiniShips = ['citation-dart'];

  assert.equal(dirtyStore.walletProfileSnapshotsEqual(left, right), true);
});

test('semantic comparison detects Boss Archive unlock and viewed-state changes', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const left = snapshot(WALLET_A);
  const right = snapshot(WALLET_A);
  right.permanentState.bossArchive = {
    unlockedEventIds: ['open-orbit-gatekeeper'],
    seenEventIds: []
  };

  assert.equal(dirtyStore.walletProfileSnapshotsEqual(left, right), false);
});

test('same-wallet conflicts only merge non-overlapping sections', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A, { coins: 100 });
  const local = { ...base, selectedShipId: 'bio' };
  const remote = snapshot(WALLET_A, {
    coins: 130,
    totalCoins: 100
  });
  const merged = dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote
  });

  assert.equal(merged.weeklyState.coins, 130);
  assert.equal(merged.selectedShipId, 'bio');
  assert.equal(merged.weeklyState.profileId, `wallet:${WALLET_A}`);
});

test('simultaneous weekly economy changes and null-base races remain conflicts', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A, { coins: 100 });
  const local = snapshot(WALLET_A, { coins: 50 });
  const remote = snapshot(WALLET_A, { coins: 80 });

  assert.throws(() => dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote
  }), /weekly progression/i);
  assert.throws(() => dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: null,
    localSnapshot: local,
    remoteSnapshot: remote
  }), /both devices: profile/i);

  assert.throws(() => dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: snapshot(WALLET_B)
  }), /cannot cross wallet boundaries/i);
});
