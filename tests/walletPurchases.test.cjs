const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const loadCommonJsModule = (relativePath, dependencies, globals = {}) => {
  const filename = path.join(root, relativePath);
  const moduleBox = { exports: {} };
  const localRequire = (request) => (
    Object.prototype.hasOwnProperty.call(dependencies, request)
      ? dependencies[request]
      : require(request)
  );
  const factory = vm.runInNewContext(
    `(function(exports, require, module, __filename, __dirname) {${read(...relativePath.split('/'))}\n})`,
    {
      Buffer,
      console,
      process,
      ...globals
    },
    { filename }
  );
  factory(moduleBox.exports, localRequire, moduleBox, filename, path.dirname(filename));
  return moduleBox.exports;
};
const STORE_RECIPIENT = '0x2222222222222222222222222222222222222222';
process.env.RSC_STORE_RECIPIENT_ADDRESS = STORE_RECIPIENT;
const {
  BASE_CHAIN_ID,
  RSC_CONTINUE_RECIPIENT_ADDRESS,
  RSC_CONTRACT_ADDRESS,
  WALLET_PURCHASE_SKUS,
  ZERO_ADDRESS,
  configuredStoreRecipient
} = require('../api/_lib/walletPurchaseCatalog');
const {
  assertCanonicalOrderTerms,
  verifyWalletPurchaseReceipt
} = require('../api/_lib/walletPurchases');
const {
  preserveWalletPurchaseServerState,
  sanitizeWalletSnapshot
} = require('../api/_lib/walletProfiles');

const WALLET = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'ab'.repeat(32)}`;

const profileWithRightSupport = (rightSupportUnlocked) => ({
  snapshot: {
    weeklyState: {
      unlockedSlots: { right: rightSupportUnlocked }
    }
  }
});

const loadWalletPurchasesForQuoteTest = ({
  fetchSupabaseJson,
  profile = profileWithRightSupport(false),
  latestProfile = profile,
  weeklyRunQuota = {
    weeklyId: '2026-08-02',
    freeAttempts: 5,
    purchasedAttempts: 0,
    attemptsUsed: 0,
    attemptsRemaining: 5,
    resetAt: '2026-08-09T19:00:00.000Z',
    resetAtMs: Date.parse('2026-08-09T19:00:00.000Z')
  }
}) => loadCommonJsModule('api/_lib/walletPurchases.js', {
  crypto: require('node:crypto'),
  './supabase': {
    fetchSupabaseJson,
    supabaseHeaders: (headers = {}) => headers
  },
  './walletProfileAuth': require('../api/_lib/walletProfileAuth'),
  './walletProfiles': {
    ensureWalletProfile: async () => profile,
    fetchWalletProfile: async () => latestProfile
  },
  '../../shared/weeklyCompetitionBoundary': require('../shared/weeklyCompetitionBoundary'),
  './weeklyRunAttempts': {
    getWeeklyRunQuota: async () => weeklyRunQuota
  },
  './walletPurchaseCatalog': require('../api/_lib/walletPurchaseCatalog')
});

const orderFor = (skuId = 'right-support') => {
  const sku = WALLET_PURCHASE_SKUS[skuId];
  return {
    order_id: '123e4567-e89b-42d3-a456-426614174000',
    wallet_address: WALLET,
    sku_id: sku.id,
    chain_id: BASE_CHAIN_ID,
    token_address: RSC_CONTRACT_ADDRESS,
    recipient_address: STORE_RECIPIENT,
    amount_raw: sku.rscAmountRaw,
    reward_tokens: sku.tokenReward,
    grants_right_support: sku.grantsRightSupport,
    reward_weekly_id: sku.weeklyAttemptReward > 0 ? '2026-08-02' : null,
    weekly_attempt_reward: sku.weeklyAttemptReward,
    status: 'quoted',
    created_at: sku.weeklyAttemptReward > 0
      ? '2026-08-02T19:00:00.000Z'
      : '2026-08-02T18:00:00.000Z',
    expires_at: sku.weeklyAttemptReward > 0
      ? '2026-08-02T19:15:00.000Z'
      : '2099-01-01T00:00:00.000Z'
  };
};

const transferLog = async ({
  from = WALLET,
  to = STORE_RECIPIENT,
  amountRaw = WALLET_PURCHASE_SKUS['right-support'].rscAmountRaw,
  logIndex = 7
} = {}) => {
  const { encodeAbiParameters, encodeEventTopics } = await import('viem');
  const abi = [{
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }];
  return {
    address: RSC_CONTRACT_ADDRESS,
    topics: encodeEventTopics({ abi, eventName: 'Transfer', args: { from, to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(amountRaw)]),
    logIndex
  };
};

const publicClientFor = ({
  chainId = BASE_CHAIN_ID,
  status = 'success',
  from = WALLET,
  to = RSC_CONTRACT_ADDRESS,
  logs = []
} = {}) => ({
  getChainId: async () => chainId,
  getTransactionReceipt: async () => ({ status, logs, blockNumber: 100n }),
  getTransaction: async () => ({ from, to }),
  getBlock: async () => ({ timestamp: 2_000_000_000n })
});

test('wallet purchase catalog enables right support and exact 3 RSC Weekly Run attempts', () => {
  assert.equal(BASE_CHAIN_ID, 8453);
  assert.equal(ZERO_ADDRESS, '0x0000000000000000000000000000000000000000');
  assert.equal(RSC_CONTRACT_ADDRESS, '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1');
  assert.equal(RSC_CONTINUE_RECIPIENT_ADDRESS, '0x3a8d692aabdd4981080a8f6af8375a21359464bf');
  assert.equal(configuredStoreRecipient(), STORE_RECIPIENT);
  assert.notEqual(configuredStoreRecipient(), RSC_CONTINUE_RECIPIENT_ADDRESS);
  assert.deepEqual(
    Object.fromEntries(Object.values(WALLET_PURCHASE_SKUS).map((sku) => [sku.id, {
      amount: sku.rscAmount,
      reward: sku.tokenReward,
      right: sku.grantsRightSupport,
      weeklyAttempt: sku.weeklyAttemptReward,
      enabled: sku.enabled
    }])),
    {
      'right-support': { amount: '10', reward: 0, right: true, weeklyAttempt: 0, enabled: true },
      'weekly-run-attempt': { amount: '3', reward: 0, right: false, weeklyAttempt: 1, enabled: true },
      'tokens-50': { amount: '1', reward: 50, right: false, weeklyAttempt: 0, enabled: false },
      'tokens-250': { amount: '5', reward: 250, right: false, weeklyAttempt: 0, enabled: false },
      'tokens-500': { amount: '10', reward: 500, right: false, weeklyAttempt: 0, enabled: false }
    }
  );
  const clientConstants = read('constants.ts');
  Object.values(WALLET_PURCHASE_SKUS).forEach((sku) => {
    assert.match(clientConstants, new RegExp(`'${sku.id}'`));
    assert.match(clientConstants, new RegExp(`rscAmountRaw: '${sku.rscAmountRaw}'`));
  });
  assert.match(clientConstants, /'tokens-50':[\s\S]*?enabled: false/);

  const originalRecipient = process.env.RSC_STORE_RECIPIENT_ADDRESS;
  try {
    process.env.RSC_STORE_RECIPIENT_ADDRESS = RSC_CONTINUE_RECIPIENT_ADDRESS;
    assert.equal(configuredStoreRecipient(), null);
    process.env.RSC_STORE_RECIPIENT_ADDRESS = ZERO_ADDRESS;
    assert.equal(configuredStoreRecipient(), null);
    process.env.RSC_STORE_RECIPIENT_ADDRESS = RSC_CONTRACT_ADDRESS;
    assert.equal(configuredStoreRecipient(), null);
    process.env.RSC_STORE_RECIPIENT_ADDRESS = WALLET;
    assert.equal(configuredStoreRecipient(WALLET), null);
    process.env.RSC_STORE_RECIPIENT_ADDRESS = 'not-an-address';
    assert.equal(configuredStoreRecipient(), null);
  } finally {
    process.env.RSC_STORE_RECIPIENT_ADDRESS = originalRecipient;
  }
});

test('stored quote terms must exactly match the immutable server catalog', () => {
  assert.equal(assertCanonicalOrderTerms(orderFor('right-support')).id, 'right-support');
  assert.equal(assertCanonicalOrderTerms(orderFor('weekly-run-attempt')).id, 'weekly-run-attempt');
  assert.throws(
    () => assertCanonicalOrderTerms({ ...orderFor(), amount_raw: '2' }),
    /integrity checks/
  );
  assert.throws(
    () => assertCanonicalOrderTerms({
      ...orderFor(),
      recipient_address: RSC_CONTINUE_RECIPIENT_ADDRESS
    }),
    /integrity checks/
  );
  for (const recipientAddress of [ZERO_ADDRESS, RSC_CONTRACT_ADDRESS, WALLET]) {
    assert.throws(
      () => assertCanonicalOrderTerms({
        ...orderFor(),
        recipient_address: recipientAddress
      }),
      /integrity checks/
    );
  }
  assert.throws(
    () => assertCanonicalOrderTerms({ ...orderFor(), wallet_address: ZERO_ADDRESS }),
    /integrity checks/
  );
  assert.throws(
    () => assertCanonicalOrderTerms(orderFor('tokens-50')),
    /integrity checks/
  );
  assert.throws(
    () => assertCanonicalOrderTerms({
      ...orderFor('weekly-run-attempt'),
      reward_weekly_id: '2026-07-26'
    }),
    /integrity checks/
  );
});

test('Weekly Run attempt quotes are week-bound, expire by cutoff, and expose +1 for 3 RSC', async () => {
  const now = Date.parse('2026-08-02T20:00:00.000Z');
  let inserted = null;
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      if (requestPath.includes('status=eq.quoted') && !options.method) return [];
      if (options.method === 'POST') {
        inserted = JSON.parse(options.body);
        return [{ ...inserted }];
      }
      throw new Error(`Unexpected weekly quote request: ${requestPath}`);
    },
    weeklyRunQuota: {
      weeklyId: '2026-08-02',
      freeAttempts: 5,
      purchasedAttempts: 0,
      attemptsUsed: 5,
      attemptsRemaining: 0,
      resetAt: '2026-08-09T19:00:00.000Z',
      resetAtMs: Date.parse('2026-08-09T19:00:00.000Z')
    }
  });

  const quote = await purchases.createWalletPurchaseQuote({
    address: WALLET,
    skuId: 'weekly-run-attempt',
    now
  });
  assert.equal(quote.rscAmount, '3');
  assert.equal(quote.rscAmountRaw, '3000000000000000000');
  assert.equal(quote.weeklyId, '2026-08-02');
  assert.equal(quote.weeklyAttemptReward, 1);
  assert.equal(inserted.reward_weekly_id, '2026-08-02');
  assert.equal(inserted.weekly_attempt_reward, 1);
  assert.ok(Date.parse(quote.expiresAt) <= Date.parse('2026-08-09T19:00:00.000Z'));
});

test('Weekly Run attempt quotes cannot charge while a wallet still has an entry', async () => {
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async () => {
      throw new Error('An order must not be created while free capacity remains.');
    }
  });

  await assert.rejects(
    purchases.createWalletPurchaseQuote({
      address: WALLET,
      skuId: 'weekly-run-attempt',
      now: Date.parse('2026-08-02T20:00:00.000Z')
    }),
    (error) => error?.code === 'weekly_run_attempts_still_available'
  );
});

test('wallet purchase status exposes only the current server quota contract fields', async () => {
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async () => [],
    weeklyRunQuota: {
      weeklyId: '2026-08-02',
      freeAttempts: 5,
      purchasedAttempts: 2,
      attemptsUsed: 6,
      attemptsRemaining: 1,
      resetAt: '2026-08-09T19:00:00.000Z',
      resetAtMs: Date.parse('2026-08-09T19:00:00.000Z')
    }
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await purchases.getWalletPurchaseStatus({ address: WALLET }))),
    {
      weeklyRunQuota: {
        weeklyId: '2026-08-02',
        freeAttempts: 5,
        purchasedAttempts: 2,
        attemptsUsed: 6,
        attemptsRemaining: 1,
        resetAt: '2026-08-09T19:00:00.000Z'
      }
    }
  );
});

test('quote requests reuse the one active right-support order without another insert', async () => {
  const calls = [];
  const activeOrder = orderFor();
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      calls.push({ requestPath, options });
      if (requestPath.startsWith('scicon_wallet_entitlements?')) {
        return [{ right_support_unlocked: false, purchased_tokens_total: 0 }];
      }
      if (requestPath.includes('status=eq.quoted') && !options.method) {
        return [activeOrder];
      }
      throw new Error(`Unexpected quote test request: ${requestPath}`);
    }
  });

  const quote = await purchases.createWalletPurchaseQuote({
    address: WALLET,
    skuId: 'right-support',
    now: Date.UTC(2026, 7, 2, 19)
  });

  assert.equal(quote.orderId, activeOrder.order_id);
  assert.equal(quote.expiresAt, activeOrder.expires_at);
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
});

test('an expired permanent-entitlement quote is renewed in place with the same order ID', async () => {
  const calls = [];
  const expiredOrder = {
    ...orderFor(),
    expires_at: '2026-08-02T18:05:00.000Z'
  };
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      calls.push({ requestPath, options });
      if (requestPath.startsWith('scicon_wallet_entitlements?')) {
        return [{ right_support_unlocked: false, purchased_tokens_total: 0 }];
      }
      if (requestPath.includes('status=eq.quoted') && !options.method) {
        return [expiredOrder];
      }
      if (options.method === 'PATCH') {
        const update = JSON.parse(options.body);
        return [{ ...expiredOrder, expires_at: update.expires_at }];
      }
      throw new Error(`Unexpected renewal test request: ${requestPath}`);
    }
  });

  const now = Date.UTC(2026, 7, 2, 19);
  const quote = await purchases.createWalletPurchaseQuote({
    address: WALLET,
    skuId: 'right-support',
    now
  });

  assert.equal(quote.orderId, expiredOrder.order_id);
  assert.ok(Date.parse(quote.expiresAt) > now);
  assert.equal(calls.filter(({ options }) => options.method === 'PATCH').length, 1);
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
});

test('concurrent quote uniqueness races recover by returning the winning active order', async () => {
  const winningOrder = orderFor();
  let insertAttempted = false;
  let entitlementReads = 0;
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async (requestPath, options = {}) => {
      if (requestPath.startsWith('scicon_wallet_entitlements?')) {
        entitlementReads += 1;
        return [{ right_support_unlocked: false, purchased_tokens_total: 0 }];
      }
      if (options.method === 'POST') {
        insertAttempted = true;
        throw new Error('Supabase request failed with private unique-index details');
      }
      if (requestPath.includes('status=eq.quoted')) {
        return insertAttempted ? [winningOrder] : [];
      }
      throw new Error(`Unexpected race test request: ${requestPath}`);
    }
  });

  const quote = await purchases.createWalletPurchaseQuote({
    address: WALLET,
    skuId: 'right-support',
    now: Date.UTC(2026, 7, 2, 19)
  });

  assert.equal(insertAttempted, true);
  assert.equal(entitlementReads, 2, 'ownership is re-checked after the insert race');
  assert.equal(quote.orderId, winningOrder.order_id);
});

test('a quote insert race fails as already owned when fulfillment won concurrently', async () => {
  let insertAttempted = false;
  const purchases = loadWalletPurchasesForQuoteTest({
    profile: profileWithRightSupport(false),
    latestProfile: profileWithRightSupport(true),
    fetchSupabaseJson: async (requestPath, options = {}) => {
      if (requestPath.startsWith('scicon_wallet_entitlements?')) {
        return [{ right_support_unlocked: false, purchased_tokens_total: 0 }];
      }
      if (options.method === 'POST') {
        insertAttempted = true;
        throw new Error('private unique violation');
      }
      if (requestPath.includes('status=eq.quoted')) return [];
      throw new Error(`Unexpected fulfillment race request: ${requestPath}`);
    }
  });

  await assert.rejects(
    purchases.createWalletPurchaseQuote({
      address: WALLET,
      skuId: 'right-support',
      now: Date.UTC(2026, 7, 2, 19)
    }),
    (error) => error.code === 'wallet_purchase_already_owned' && error.statusCode === 409
  );
  assert.equal(insertAttempted, true);
});

test('durable purchase entitlements independently block already-owned quotes', async () => {
  const purchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson: async (requestPath) => {
      if (requestPath.startsWith('scicon_wallet_entitlements?')) {
        return [{ right_support_unlocked: true, purchased_tokens_total: 0 }];
      }
      throw new Error(`An owned quote must not query orders: ${requestPath}`);
    }
  });

  await assert.rejects(
    purchases.createWalletPurchaseQuote({
      address: WALLET,
      skuId: 'right-support'
    }),
    (error) => error.code === 'wallet_purchase_already_owned' && error.statusCode === 409
  );
});

test('already-owned and unsafe-address quote requests fail before creating an order', async () => {
  let orderWrites = 0;
  const fetchSupabaseJson = async (requestPath, options = {}) => {
    if (requestPath.startsWith('scicon_wallet_entitlements?')) {
      return [{ right_support_unlocked: false, purchased_tokens_total: 0 }];
    }
    if (options.method === 'POST') orderWrites += 1;
    return [];
  };
  const ownedPurchases = loadWalletPurchasesForQuoteTest({
    fetchSupabaseJson,
    profile: profileWithRightSupport(true)
  });
  await assert.rejects(
    ownedPurchases.createWalletPurchaseQuote({
      address: WALLET,
      skuId: 'right-support'
    }),
    (error) => error.code === 'wallet_purchase_already_owned' && error.statusCode === 409
  );

  await assert.rejects(
    ownedPurchases.createWalletPurchaseQuote({
      address: ZERO_ADDRESS,
      skuId: 'right-support'
    }),
    (error) => error.statusCode === 400
  );

  const originalRecipient = process.env.RSC_STORE_RECIPIENT_ADDRESS;
  try {
    process.env.RSC_STORE_RECIPIENT_ADDRESS = WALLET;
    const unsafeRecipientPurchases = loadWalletPurchasesForQuoteTest({ fetchSupabaseJson });
    await assert.rejects(
      unsafeRecipientPurchases.createWalletPurchaseQuote({
        address: WALLET,
        skuId: 'right-support'
      }),
      (error) => error.code === 'wallet_purchase_store_not_configured'
    );
  } finally {
    process.env.RSC_STORE_RECIPIENT_ADDRESS = originalRecipient;
  }
  assert.equal(orderWrites, 0);
});

test('receipt verification requires Base, a quote-window payment, wallet sender, store recipient, and exact amount', async () => {
  const log = await transferLog();
  const verified = await verifyWalletPurchaseReceipt({
    order: orderFor(),
    transactionHash: HASH,
    publicClient: publicClientFor({ logs: [log] })
  });
  assert.deepEqual(verified, {
    transactionHash: HASH,
    logIndex: 7,
    paymentBlockTime: '2033-05-18T03:33:20.000Z'
  });

  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: publicClientFor({ chainId: 84532, logs: [log] })
    }),
    /not on Base mainnet/
  );
  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: {
        ...publicClientFor({ logs: [log] }),
        getBlock: async () => ({ timestamp: 1_600_000_000n })
      }
    }),
    /predates this purchase quote/
  );
  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: {
        ...publicClientFor({ logs: [log] }),
        getBlock: async () => ({ timestamp: 5_000_000_000n })
      }
    }),
    /mined after this purchase quote expired/
  );
  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: publicClientFor({
        logs: [await transferLog({ from: RSC_CONTINUE_RECIPIENT_ADDRESS })]
      })
    }),
    /exactly one matching/
  );
  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: publicClientFor({ logs: [await transferLog({ amountRaw: '2' })] })
    }),
    /exactly one matching/
  );
  await assert.rejects(
    verifyWalletPurchaseReceipt({
      order: orderFor(),
      transactionHash: HASH,
      publicClient: publicClientFor({ logs: [log, { ...log, logIndex: 8 }] })
    }),
    /exactly one matching/
  );
});

test('ordinary profile saves cannot mint the RSC-only right entitlement or inject purchase credits', () => {
  const now = Date.UTC(2026, 7, 2, 19);
  const incoming = sanitizeWalletSnapshot({
    weeklyState: { unlockedSlots: { right: true } },
    permanentState: {
      walletPurchases: { purchasedTokensTotal: 999999999 }
    }
  }, WALLET, now);
  assert.equal(incoming.permanentState.walletPurchases, undefined);
  const protectedNewProfile = preserveWalletPurchaseServerState({
    currentSnapshot: null,
    incomingSnapshot: incoming
  });
  assert.equal(protectedNewProfile.weeklyState.unlockedSlots.right, false);

  const grandfathered = preserveWalletPurchaseServerState({
    currentSnapshot: sanitizeWalletSnapshot({
      weeklyState: { unlockedSlots: { right: true } }
    }, WALLET, now),
    incomingSnapshot: sanitizeWalletSnapshot({
      weeklyState: { unlockedSlots: { right: false } }
    }, WALLET, now)
  });
  assert.equal(grandfathered.weeklyState.unlockedSlots.right, true);
});

test('wallet purchase API is session-bound and same-origin, while runtime exposes connect-resumable actions', () => {
  const route = read('api', '_lib', 'walletPurchaseRoute.js');
  const mintRouter = read('api', 'mint-records.js');
  const vercel = read('vercel.json');
  const runtime = read('components', 'WalletRuntime.tsx');
  const app = read('App.tsx');
  const client = read('services', 'walletPurchaseService.ts');
  const pending = read('services', 'walletPurchasePendingStore.ts');
  const baseWallet = read('services', 'baseAccountWallet.ts');

  assert.match(route, /assertSameOrigin\(req\)/);
  assert.match(route, /readWalletProfileSession\(req\)/);
  assert.match(route, /address: session\.walletAddress/);
  assert.match(mintRouter, /route === 'wallet-purchases'/);
  assert.match(mintRouter, /walletPurchaseHandler/);
  assert.match(vercel, /"source": "\/api\/wallet-purchases"[\s\S]*?"destination": "\/api\/mint-records\?route=wallet-purchases"/);
  assert.equal(
    fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.js')).length,
    12,
    'Vercel Hobby allows at most 12 top-level functions'
  );
  assert.match(runtime, /type: 'purchase-rsc'; skuId: RscPurchaseSkuId/);
  assert.match(runtime, /activeWalletAddress \|\| await connectWallet\(\)/);
  assert.match(runtime, /onWalletPurchaseSuccess\?: \(settlement: WalletPurchaseSettlement\)/);
  assert.match(runtime, /activeWalletAddressRef\.current\?\.toLowerCase\(\) !== address\.toLowerCase\(\)/);
  assert.match(runtime, /Purchase confirmed for the previous Base Account/);
  assert.match(runtime, /type: 'refresh-rsc-balance'/);
  assert.match(client, /loadAuthenticatedWalletProfile\(walletAddress, \{ interactive: true \}\)/);
  assert.match(client, /assertQuoteMatchesPublishedTerms/);
  assert.match(client, /recipient === ZERO_ADDRESS/);
  assert.match(client, /recipient === DONATION_CONFIG\.RSC_CONTRACT_ADDRESS\.toLowerCase\(\)/);
  assert.match(client, /recipient === walletAddress\.toLowerCase\(\)/);
  assert.match(client, /resumePendingWalletPurchase/);
  assert.match(client, /wallet_purchase_in_progress/);
  assert.match(client, /const concurrentPending = readPendingWalletPurchase\(walletAddress\)/);
  assert.match(client, /recordPendingWalletPurchaseCallsId/);
  assert.match(pending, /walletAddress/);
  assert.match(pending, /callsId/);
  assert.match(pending, /transactionHash/);
  assert.match(baseWallet, /export const getRscBalance/);
  assert.match(baseWallet, /export const sendRscPurchaseTransfer/);
  assert.match(baseWallet, /onSubmitted\?\.\(callsId\)/);
  const purchaseSuccessHandler = app.slice(
    app.indexOf('const handleWalletPurchaseSuccess'),
    app.indexOf('const persistRewardClaim')
  );
  assert.match(purchaseSuccessHandler, /rebaseWalletProfileDirtyAfterServerPurchase/);
  assert.match(app, /const applyWeeklyRunAttemptQuota = useCallback/);
  assert.match(app, /serverCanVerifyUnknownWalletQuota/);
  assert.match(purchaseSuccessHandler, /snapshot: rebasedDirty\?\.snapshot \?\? settlement\.profile\.snapshot/);
  assert.match(purchaseSuccessHandler, /Your local progress was not changed/);
  assert.doesNotMatch(purchaseSuccessHandler, /discardWalletProfileDirty/);
});

test('wallet purchase API never exposes raw Supabase failures', async () => {
  const route = loadCommonJsModule('api/_lib/walletPurchaseRoute.js', {
    './walletProfileAuth': {
      assertSameOrigin: () => undefined,
      readWalletProfileSession: () => ({ walletAddress: WALLET })
    },
    './rateLimit': {
      checkRateLimit: () => ({ allowed: true })
    },
    './walletPurchases': {
      createWalletPurchaseQuote: async () => {
        throw Object.assign(
          new Error('Supabase request failed with private schema and constraint details'),
          { statusCode: 400, code: 'PGRST_PRIVATE' }
        );
      },
      settleWalletPurchase: async () => null
    }
  }, {
    console: { error: () => undefined }
  });
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };

  await route({
    method: 'POST',
    headers: {},
    body: { action: 'quote', skuId: 'right-support' }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'Wallet purchase request failed.'
  });
  assert.doesNotMatch(response.body, /Supabase|schema|constraint/i);
});

test('local purchase migration is service-role-only and settles rewards atomically with replay protection', () => {
  const sql = read('supabase', '20260802-wallet-purchases.sql');
  assert.match(sql, /LOCAL-ONLY MIGRATION/);
  assert.match(sql, /create table if not exists public\.scicon_wallet_purchase_orders/);
  assert.match(sql, /create table if not exists public\.scicon_wallet_entitlements/);
  assert.match(sql, /scicon_wallet_purchase_orders_payment_once_idx/);
  assert.match(sql, /scicon_wallet_purchase_orders_right_support_once_idx/);
  assert.match(sql, /where grants_right_support/);
  assert.match(sql, /where status = 'fulfilled'/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.scicon_wallet_purchase_orders[\s\S]*from anon, authenticated, public/);
  assert.match(sql, /grant select, insert, update, delete[\s\S]*to service_role/);
  assert.match(sql, /from public\.scicon_wallet_profiles[\s\S]*unlockedSlots,right/);
  assert.match(sql, /create or replace function public\.scicon_settle_wallet_purchase/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /from public\.scicon_wallet_purchase_orders[\s\S]*for update/);
  assert.match(sql, /from public\.scicon_wallet_profiles[\s\S]*for update/);
  assert.match(sql, /wallet_purchase_payment_replayed/);
  assert.match(sql, /Token packs stay disabled/);
  assert.doesNotMatch(sql, /sku_id = 'tokens-50'/);
  assert.match(sql, /p_payment_block_time < v_order\.created_at - interval '30 seconds'/);
  assert.match(sql, /p_payment_block_time > v_order\.expires_at/);
  assert.match(sql, /recipient_address <> '0x3a8d692aabdd4981080a8f6af8375a21359464bf'/);
  assert.match(sql, /recipient_address <> '0x0000000000000000000000000000000000000000'/);
  assert.match(sql, /recipient_address <> '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1'/);
  assert.match(sql, /recipient_address <> wallet_address/);
  assert.match(sql, /wallet_address <> '0x0000000000000000000000000000000000000000'/);
  assert.match(sql, /wallet_purchase_already_owned/);
  assert.match(sql, /purchased_tokens_total[\s\S]*excluded\.purchased_tokens_total/);
  assert.match(sql, /revision = revision \+ 1/);
  assert.match(sql, /revoke all on function public\.scicon_settle_wallet_purchase[\s\S]*from public, anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});

test('additive Weekly Run purchase migration grants one server-only week credit per exact 3 RSC settlement', () => {
  const sql = read('supabase', '20260803-weekly-run-purchased-attempts.sql');
  assert.match(sql, /create table if not exists public\.scicon_weekly_run_attempt_credits/);
  assert.match(sql, /primary key \(wallet_address, weekly_id\)/);
  assert.match(sql, /purchased_attempts between 0 and 32762/);
  assert.match(sql, /sku_id = 'weekly-run-attempt'[\s\S]*amount_raw = 3000000000000000000/);
  assert.match(sql, /weekly_attempt_reward = 1/);
  assert.match(sql, /scicon_wallet_purchase_orders_active_quote_idx[\s\S]*where status = 'quoted'/);
  assert.match(sql, /create or replace function public\.scicon_get_weekly_run_quota/);
  assert.match(sql, /'freeAttempts', 5/);
  assert.match(sql, /greatest\(0, 5 \+ v_purchased_attempts - v_attempts_used\)/);
  assert.match(sql, /create or replace function public\.scicon_reserve_weekly_run_attempt\([\s\S]*p_wallet_address text/);
  assert.match(sql, /v_attempt_capacity := least\(32767, 5 \+ v_purchased_attempts\)/);
  assert.match(sql, /hashtextextended\('weekly-wallet:' \|\| p_wallet_address \|\| ':'/);
  assert.match(sql, /public\.scicon_weekly_run_attempt_credits\.purchased_attempts[\s\S]*\+ excluded\.purchased_attempts/);
  assert.match(sql, /wallet_purchase_payment_replayed/);
  assert.match(sql, /if v_order\.status = 'fulfilled'[\s\S]*'duplicate', true/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.scicon_weekly_run_attempt_credits[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.scicon_get_weekly_run_quota\(text, text\)[\s\S]*to service_role/);
});
