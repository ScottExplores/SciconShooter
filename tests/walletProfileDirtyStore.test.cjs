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
      durableCampaignCoins: coins,
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

test('semantic comparison ignores cloud-regenerated Campaign metadata timestamps', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const left = snapshot(WALLET_A);
  left.permanentState.campaignProgress = {
    campaignCompleted: false,
    updatedAt: '2026-07-23T00:00:00.000Z',
    branchProgress: {
      completedBranchIds: [],
      updatedAt: '2026-07-23T00:00:00.000Z'
    }
  };
  const right = structuredClone(left);
  right.permanentState.campaignProgress.updatedAt = '2026-07-23T00:00:02.000Z';
  right.permanentState.campaignProgress.branchProgress.updatedAt = '2026-07-23T00:00:02.000Z';

  assert.equal(dirtyStore.walletProfileSnapshotsEqual(left, right), true);

  const local = structuredClone(left);
  local.weeklyState.coins = 125;
  local.weeklyState.durableCampaignCoins = 125;
  const merged = dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: left,
    localSnapshot: local,
    remoteSnapshot: right
  });
  assert.equal(merged.weeklyState.coins, 125);
});

test('semantic comparison ignores Boss Archive schema migration versions', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const serverSnapshot = snapshot(WALLET_A);
  serverSnapshot.permanentState.bossArchive.version = 1;
  const migratedClientSnapshot = structuredClone(serverSnapshot);
  migratedClientSnapshot.permanentState.bossArchive.version = 2;

  assert.equal(
    dirtyStore.walletProfileSnapshotsEqual(serverSnapshot, migratedClientSnapshot),
    true
  );
});

test('Boss Archive version migration rebases over a server-reserved attempt', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A);
  base.permanentState.bossArchive = {
    version: 1,
    unlockedEventIds: ['open-orbit-gatekeeper'],
    seenEventIds: [],
    dailyAttempts: {
      utcDateKey: '2026-07-23',
      attemptsUsed: 0,
      processedAttemptIds: []
    }
  };
  const local = structuredClone(base);
  local.permanentState.bossArchive.version = 2;
  const remote = structuredClone(base);
  remote.permanentState.bossArchive.dailyAttempts = {
    utcDateKey: '2026-07-23',
    attemptsUsed: 1,
    processedAttemptIds: ['boss-archive:attempt-1']
  };

  const merged = dirtyStore.mergeWalletProfileSnapshots({
    address: WALLET_A,
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote
  });

  assert.equal(merged.permanentState.bossArchive.dailyAttempts.attemptsUsed, 1);
  assert.deepEqual(
    merged.permanentState.bossArchive.dailyAttempts.processedAttemptIds,
    ['boss-archive:attempt-1']
  );
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

test('purchase settlement preserves local writes while rebasing the server-owned right support unlock', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A);
  const local = structuredClone(base);
  local.weeklyState.coins = 145;
  local.selectedShipId = 'bio';
  dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 6,
    baseSnapshot: base,
    snapshot: local
  });

  const remote = structuredClone(base);
  remote.weeklyState.unlockedSlots.right = true;
  const rebased = dirtyStore.rebaseWalletProfileDirtyAfterServerPurchase({
    address: WALLET_A,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 7,
      snapshot: remote
    }
  });

  assert.equal(rebased.expectedRevision, 7);
  assert.equal(rebased.baseSnapshot.weeklyState.unlockedSlots.right, true);
  assert.equal(rebased.snapshot.weeklyState.unlockedSlots.right, true);
  assert.equal(rebased.snapshot.weeklyState.coins, 145);
  assert.equal(rebased.snapshot.selectedShipId, 'bio');
});

test('purchase-aware conflict rebase combines server and queued local balance deltas', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A, { coins: 100 });
  const local = snapshot(WALLET_A, {
    coins: 75,
    runs: 4,
    totalCoins: 175,
    selectedShipId: 'bio'
  });
  const original = dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 8,
    baseSnapshot: base,
    snapshot: local
  });
  const remote = snapshot(WALLET_A, {
    coins: 125,
    runs: 9,
    totalCoins: 450,
    selectedShipId: 'eth'
  });
  remote.weeklyState.unlockedSlots.right = true;

  const rebased = dirtyStore.rebaseWalletProfileDirtyAfterServerPurchase({
    address: WALLET_A,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 9,
      snapshot: remote
    }
  });

  assert.notEqual(rebased.writeId, original.writeId);
  assert.equal(rebased.expectedRevision, 9);
  assert.equal(rebased.baseSnapshot.weeklyState.coins, 125);
  assert.equal(rebased.baseSnapshot.selectedShipId, 'eth');
  assert.equal(rebased.snapshot.weeklyState.unlockedSlots.right, true);
  assert.equal(rebased.snapshot.weeklyState.coins, 100);
  assert.equal(rebased.snapshot.weeklyState.durableCampaignCoins, 100);
  assert.equal(rebased.snapshot.weeklyState.weeklyStats.runs, 4);
  assert.equal(rebased.snapshot.permanentState.lifetimeStats.runs, 4);
  assert.equal(rebased.snapshot.stats.totalCoins, 175);
  assert.equal(rebased.snapshot.selectedShipId, 'bio');
});

test('paid Token credit survives local spending exactly once across duplicate settlement resumes', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A, { coins: 100 });
  const local = snapshot(WALLET_A, { coins: 75 });
  dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 10,
    baseSnapshot: base,
    snapshot: local
  });

  const paid = snapshot(WALLET_A, { coins: 600 });
  const first = dirtyStore.rebaseWalletProfileDirtyAfterServerPurchase({
    address: WALLET_A,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 11,
      snapshot: paid
    }
  });
  assert.equal(first.snapshot.weeklyState.coins, 575);
  assert.equal(first.snapshot.weeklyState.durableCampaignCoins, 575);

  const duplicate = dirtyStore.rebaseWalletProfileDirtyAfterServerPurchase({
    address: WALLET_A,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 11,
      snapshot: paid
    }
  });
  assert.equal(duplicate.snapshot.weeklyState.coins, 575);
  assert.equal(duplicate.snapshot.weeklyState.durableCampaignCoins, 575);
});

test('purchase rebase adopts the server economy when settlement crosses a weekly boundary', async () => {
  global.window = { localStorage: createStorage() };
  const dirtyStore = await import('../services/walletProfileDirtyStore.ts');
  const base = snapshot(WALLET_A, { coins: 100 });
  const local = snapshot(WALLET_A, { coins: 75 });
  dirtyStore.markWalletProfileDirty({
    address: WALLET_A,
    expectedRevision: 4,
    baseSnapshot: base,
    snapshot: local
  });

  const paid = snapshot(WALLET_A, { coins: 500 });
  paid.weeklyState.weekKey = '2026-07-26';
  const rebased = dirtyStore.rebaseWalletProfileDirtyAfterServerPurchase({
    address: WALLET_A,
    savedProfile: {
      walletAddress: WALLET_A,
      profileId: `wallet:${WALLET_A}`,
      revision: 5,
      snapshot: paid
    }
  });

  assert.equal(rebased.snapshot.weeklyState.weekKey, '2026-07-26');
  assert.equal(rebased.snapshot.weeklyState.coins, 500);
  assert.equal(rebased.snapshot.weeklyState.durableCampaignCoins, 500);
});
