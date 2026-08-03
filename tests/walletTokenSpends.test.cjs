const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const compileService = (name, requires = {}, globals = {}) => {
  const source = read('services', name);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const moduleBox = { exports: {} };
  const localRequire = (request) => requires[request] ?? require(request);
  Function(
    'exports',
    'require',
    'module',
    ...Object.keys(globals),
    compiled
  )(moduleBox.exports, localRequire, moduleBox, ...Object.values(globals));
  return moduleBox.exports;
};

const loadCommonJsModule = (relativePath, dependencies) => {
  const filename = path.join(root, relativePath);
  const moduleBox = { exports: {} };
  const localRequire = (request) => (
    Object.prototype.hasOwnProperty.call(dependencies, request)
      ? dependencies[request]
      : require(request)
  );
  const factory = vm.runInNewContext(
    `(function(exports, require, module, __filename, __dirname) {${read(...relativePath.split('/'))}\n})`,
    { Buffer, console, process },
    { filename }
  );
  factory(moduleBox.exports, localRequire, moduleBox, filename, path.dirname(filename));
  return moduleBox.exports;
};

const bossArchiveProgressionStub = {
  createBossArchiveProgress: () => ({ version: 1, unlockedEventIds: [], seenEventIds: [] }),
  sanitizeBossArchiveProgress: (value, fallback = {}) => ({ ...fallback, ...(value || {}) }),
  mergeBossArchiveProgress: (left, right) => ({ ...left, ...right })
};
const campaignProgressionStub = {
  createCampaignProgress: () => ({}),
  mergeCampaignProgress: (left, right) => ({ ...left, ...right }),
  sanitizeCampaignProgress: (value) => value || {}
};
const campaignGraphStub = {
  createCampaignGraphIndex: () => ({}),
  indexCampaignGraph: () => ({})
};
const squad = compileService('squadProgression.ts', {
  '../shared/weeklyRunPlan.browser': require('../shared/weeklyRunPlan.js'),
  '../shared/weeklyCompetitionBoundary.browser': {
    getWeeklyBoundaryMeta: () => ({ weekKey: '2026-08-02', endsAt: new Date('2026-08-09T19:00:00.000Z') })
  },
  './playerShipService': {
    PLAYABLE_PLAYER_SHIP_IDS: ['researchhub', 'bio', 'eth', 'btc']
  },
  './miniShipCombatProgression': {
    getMiniShipDamageMultiplier: () => 1,
    getMiniShipFireIntervalFrames: (frames) => frames,
    getMiniShipVolleySize: () => 1
  },
  './weaponTierProgression': {
    FIRE_RATE_LEVELS_PER_TIER: 7,
    FIRE_RATE_MAX_LEVEL: 49,
    getFireRateTier: () => 1,
    getFireRateTierProgress: () => ({ tier: 1, level: 0 })
  },
  './bossArchive': {
    inferLegacyBossArchiveEventIds: () => [],
    normalizeBossArchiveEventIds: (value) => Array.isArray(value) ? value : []
  },
  './bossArchiveProgression': bossArchiveProgressionStub,
  './campaignGraph': campaignGraphStub,
  './campaignProgression': campaignProgressionStub,
  './levelConfig': { DEFAULT_GAME_CAMPAIGN: { levels: [], miniBosses: [], sectors: [] } },
  './weeklyCampaignStreak': {
    sanitizeWeeklyCampaignStreak: (value) => value ?? null,
    mergeWeeklyCampaignStreak: (target, source) => source ?? target ?? null
  }
});
const serverSpends = require('../api/_lib/walletTokenSpends');
const walletProfiles = require('../api/_lib/walletProfiles');

const WALLET = '0x1111111111111111111111111111111111111111';
const PROFILE_ID = `wallet:${WALLET}`;

const profileWithTokens = ({
  coins = 10_000,
  durableCampaignCoins = 5_000,
  unlockedPlayerShips = []
} = {}) => {
  const snapshot = walletProfiles.sanitizeWalletSnapshot({}, WALLET, Date.parse('2026-08-03T12:00:00.000Z'));
  snapshot.weeklyState.coins = coins;
  snapshot.weeklyState.durableCampaignCoins = durableCampaignCoins;
  snapshot.permanentState.unlockedPlayerShips = unlockedPlayerShips;
  return {
    walletAddress: WALLET,
    profileId: PROFILE_ID,
    revision: 7,
    snapshot
  };
};

test('server Hangar prices stay in parity with the gameplay catalog', () => {
  assert.equal(serverSpends.LEFT_SLOT_UNLOCK_COST, squad.LEFT_SQUAD_SLOT_UNLOCK_COST);
  assert.deepEqual(
    { ...serverSpends.MINI_SHIP_PURCHASE_COSTS },
    Object.fromEntries(squad.MINI_SHIP_CATALOG.map((ship) => [ship.id, ship.purchaseCost]))
  );
  assert.deepEqual(
    [...serverSpends.MINI_SHIP_UPGRADE_COST_CURVE],
    [...squad.MINI_SHIP_UPGRADE_COST_CURVE]
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(serverSpends.MAIN_SHIP_UPGRADE_COSTS).map(([id, costs]) => [id, [...costs]])),
    Object.fromEntries(squad.MAIN_SHIP_UPGRADES.map((upgrade) => [upgrade.id, [...upgrade.costs]]))
  );
});

test('canonical left-slot spend applies the exact gameplay purchase and seasonal-first debit', () => {
  const canonical = serverSpends.canonicalWalletTokenSpend({
    profile: profileWithTokens({ coins: 1_000, durableCampaignCoins: 500 }),
    action: { kind: 'unlock-left-slot' },
    now: Date.parse('2026-08-03T12:01:00.000Z')
  });
  assert.equal(canonical.cost, 50);
  assert.equal(canonical.reason, 'hangar:left-slot');
  assert.equal(canonical.nextSnapshot.weeklyState.coins, 950);
  assert.equal(canonical.nextSnapshot.weeklyState.durableCampaignCoins, 500);
  assert.equal(canonical.nextSnapshot.weeklyState.unlockedSlots.left, true);
  assert.equal(canonical.nextSnapshot.weeklyState.ownedMiniShips['citation-dart'], 1);
  assert.equal(canonical.nextSnapshot.weeklyState.equipped.left, 'citation-dart');
});

test('canonical main-ship spend rejects locked hulls and permits canonical unlocks', () => {
  assert.throws(() => serverSpends.canonicalWalletTokenSpend({
    profile: profileWithTokens(),
    action: { kind: 'upgrade-main-ship', shipId: 'eth', upgradeId: 'speed' }
  }), (error) => error.code === 'wallet_token_action_locked');

  const canonical = serverSpends.canonicalWalletTokenSpend({
    profile: profileWithTokens({ unlockedPlayerShips: ['eth'] }),
    action: { kind: 'upgrade-main-ship', shipId: 'eth', upgradeId: 'speed' }
  });
  assert.equal(canonical.cost, squad.getMainShipUpgradeCost('speed', 0));
  assert.equal(canonical.nextSnapshot.weeklyState.shipUpgrades.eth.speed, 1);
  assert.equal(canonical.nextSnapshot.permanentState.lifetimeStats.hangarUpgradesPurchased, 1);
});

test('ordinary wallet saves cannot erase paid reserve or forge server-owned Hangar progress', () => {
  const current = profileWithTokens({ coins: 800, durableCampaignCoins: 600 }).snapshot;
  current.weeklyState.unlockedSlots.left = true;
  current.weeklyState.ownedMiniShips['citation-dart'] = 2;
  current.weeklyState.shipUpgrades.researchhub.speed = 1;
  current.permanentState.lifetimeStats.hangarUpgradesPurchased = 3;
  const incoming = structuredClone(current);
  incoming.weeklyState.coins = 0;
  incoming.weeklyState.durableCampaignCoins = 0;
  incoming.weeklyState.unlockedSlots.left = false;
  incoming.weeklyState.ownedMiniShips = { 'nebula-tern': 5 };
  incoming.weeklyState.shipUpgrades.researchhub.speed = 7;
  incoming.permanentState.lifetimeStats.hangarUpgradesPurchased = 999;

  const protectedSnapshot = walletProfiles.preserveWalletPurchaseServerState({
    currentSnapshot: current,
    incomingSnapshot: incoming,
    purchasedTokensAvailable: 500
  });
  assert.equal(protectedSnapshot.weeklyState.coins, 500);
  assert.equal(protectedSnapshot.weeklyState.durableCampaignCoins, 500);
  assert.equal(protectedSnapshot.weeklyState.unlockedSlots.left, true);
  assert.deepEqual(protectedSnapshot.weeklyState.ownedMiniShips, { 'citation-dart': 2 });
  assert.equal(protectedSnapshot.weeklyState.shipUpgrades.researchhub.speed, 1);
  assert.equal(protectedSnapshot.permanentState.lifetimeStats.hangarUpgradesPurchased, 3);
});

test('new spends send only server-derived terms and canonical next snapshot to the atomic RPC', async () => {
  const profileBefore = profileWithTokens({ coins: 100, durableCampaignCoins: 100 });
  let profileAfter = null;
  let rpcBody = null;
  const module = loadCommonJsModule('api/_lib/walletTokenSpends.js', {
    './supabase': {
      supabaseHeaders: (headers = {}) => headers,
      fetchSupabaseJson: async (url, init = {}) => {
        if (url.startsWith('scicon_wallet_token_spends?')) return [];
        assert.equal(url, 'rpc/scicon_apply_wallet_token_spend');
        rpcBody = JSON.parse(init.body);
        profileAfter = {
          ...profileBefore,
          revision: 8,
          snapshot: rpcBody.p_next_snapshot
        };
        return {
          accepted: true,
          duplicate: false,
          purchasedTokensSpent: 0,
          purchasedTokensAvailable: 0,
          profileRevision: 8
        };
      }
    },
    './walletProfileAuth': { normalizeWalletAddress: (value) => String(value || '').toLowerCase() },
    './walletProfiles': {
      fetchWalletProfile: async () => profileAfter ?? profileBefore,
      sanitizeWalletSnapshot: (snapshot) => snapshot
    }
  });
  const settlement = await module.applyWalletTokenSpend({
    address: WALLET,
    spendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expectedRevision: 7,
    action: {
      kind: 'unlock-left-slot',
      // These untrusted economic fields are ignored rather than forwarded.
      amount: 0,
      reason: 'free',
      nextSnapshot: { weeklyState: { coins: 1_000_000_000 } }
    }
  });
  assert.equal(rpcBody.p_amount, 50);
  assert.equal(rpcBody.p_reason, 'hangar:left-slot');
  assert.equal(rpcBody.p_expected_revision, 7);
  assert.equal(rpcBody.p_next_snapshot.weeklyState.coins, 50);
  assert.equal(rpcBody.p_next_snapshot.weeklyState.durableCampaignCoins, 50);
  assert.equal(rpcBody.p_next_snapshot.weeklyState.unlockedSlots.left, true);
  assert.equal(settlement.profile.revision, 8);
});

test('lost-response retry returns the existing receipt before checking stale profile revision', async () => {
  let rpcCalls = 0;
  const currentProfile = profileWithTokens();
  currentProfile.revision = 8;
  const module = loadCommonJsModule('api/_lib/walletTokenSpends.js', {
    './supabase': {
      supabaseHeaders: (headers = {}) => headers,
      fetchSupabaseJson: async (url) => {
        if (url.startsWith('scicon_wallet_token_spends?')) {
          return [{
            spend_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            wallet_address: WALLET,
            amount: 50,
            reason: 'hangar:left-slot',
            purchased_tokens_spent: 25,
            purchased_tokens_available_after: 475,
            profile_revision_after: 8
          }];
        }
        rpcCalls += 1;
        throw new Error('RPC must not run for an existing spend receipt.');
      }
    },
    './walletProfileAuth': { normalizeWalletAddress: (value) => String(value || '').toLowerCase() },
    './walletProfiles': {
      fetchWalletProfile: async () => currentProfile,
      sanitizeWalletSnapshot: (snapshot) => snapshot
    }
  });

  const settlement = await module.applyWalletTokenSpend({
    address: WALLET,
    spendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expectedRevision: 7,
    action: { kind: 'unlock-left-slot' }
  });
  assert.equal(settlement.duplicate, true);
  assert.equal(settlement.cost, 50);
  assert.equal(settlement.purchasedTokensSpent, 25);
  assert.equal(settlement.profile.revision, 8);
  assert.equal(rpcCalls, 0);
});

test('lost-response retry cannot reuse a receipt for a different action', async () => {
  const module = loadCommonJsModule('api/_lib/walletTokenSpends.js', {
    './supabase': {
      supabaseHeaders: (headers = {}) => headers,
      fetchSupabaseJson: async () => [{
        spend_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        wallet_address: WALLET,
        amount: 50,
        reason: 'hangar:left-slot',
        purchased_tokens_spent: 0,
        purchased_tokens_available_after: 0,
        profile_revision_after: 8
      }]
    },
    './walletProfileAuth': { normalizeWalletAddress: (value) => String(value || '').toLowerCase() },
    './walletProfiles': {
      fetchWalletProfile: async () => profileWithTokens(),
      sanitizeWalletSnapshot: (snapshot) => snapshot
    }
  });
  await assert.rejects(module.applyWalletTokenSpend({
    address: WALLET,
    spendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expectedRevision: 7,
    action: { kind: 'purchase-mini-ship', miniShipId: 'helix-wasp' }
  }), (error) => error.code === 'wallet_token_spend_replayed');
});

test('client retries one network-lost response with the same spend id', async () => {
  const requests = [];
  const service = compileService('walletTokenSpendService.ts', {
    './walletProfileService': {},
    './playerShipService': {},
    './squadProgression': {}
  }, {
    fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      if (requests.length === 1) throw new TypeError('network response lost');
      return {
        ok: true,
        json: async () => ({
          settlement: {
            accepted: true,
            duplicate: true,
            profile: profileWithTokens()
          }
        })
      };
    }
  });
  const action = { kind: 'unlock-left-slot' };
  const result = await service.applyWalletTokenSpend({
    spendId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expectedRevision: 7,
    action
  });
  assert.equal(result.duplicate, true);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});
