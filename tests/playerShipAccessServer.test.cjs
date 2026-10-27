const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData
} = require('viem');
const {
  entryPoint06Abi,
  entryPoint06Address,
  getUserOperationHash
} = require('viem/account-abstraction');

process.env.WALLET_PROFILE_AUTH_SECRET = 'player-ship-access-tests-secret-0000000000000000';

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');
const campaign = require('../game-config/campaign.json');
const profiles = require('../api/_lib/walletProfiles');
const access = require('../api/_lib/playerShipAccess');
const spends = require('../api/_lib/walletTokenSpends');

const WALLET = '0x1111111111111111111111111111111111111111';
const HASH = `0x${'ab'.repeat(32)}`;
const NOW = 2_000_000_000_000;
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const BUNDLER = '0x3333333333333333333333333333333333333333';
const BENEFICIARY = '0x4444444444444444444444444444444444444444';
const OFFICIAL_SMART_WALLET_PROXY_CODE = '0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3';

const smartWalletExecutionAbi = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'payable',
    inputs: [{
      name: 'calls',
      type: 'tuple[]',
      components: [
        { name: 'target', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' }
      ]
    }],
    outputs: []
  }
];

const storageWordForAddress = (address) => `0x${address.slice(2).padStart(64, '0')}`;

const smartWalletPaymentClient = ({
  operationSender = WALLET,
  recipient = access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
  value = 1_000_000_000_000_000n,
  callData = '0x',
  executionFunction = 'executeBatch',
  calls = null,
  duplicateOperation = false,
  duplicateEvent = false,
  eventSuccess = true,
  eventHash = null,
  malformedTransactionInput = false,
  runtimeCode = OFFICIAL_SMART_WALLET_PROXY_CODE,
  implementation = access.COINBASE_SMART_WALLET_IMPLEMENTATIONS[0]
} = {}) => {
  const paymentCalls = calls || [{ target: recipient, value, data: callData }];
  const walletCallData = executionFunction === 'execute'
    ? encodeFunctionData({
      abi: smartWalletExecutionAbi,
      functionName: 'execute',
      args: [paymentCalls[0].target, paymentCalls[0].value, paymentCalls[0].data]
    })
    : encodeFunctionData({
      abi: smartWalletExecutionAbi,
      functionName: 'executeBatch',
      args: [paymentCalls]
    });
  const operation = {
    sender: operationSender,
    nonce: 7n,
    initCode: '0x',
    callData: walletCallData,
    callGasLimit: 120_000n,
    verificationGasLimit: 120_000n,
    preVerificationGas: 40_000n,
    maxFeePerGas: 2n,
    maxPriorityFeePerGas: 1n,
    paymasterAndData: '0x',
    signature: '0x1234'
  };
  const secondOperation = { ...operation, nonce: 8n };
  const operations = duplicateOperation ? [operation, secondOperation] : [operation];
  const input = malformedTransactionInput
    ? '0xdeadbeef'
    : encodeFunctionData({
      abi: entryPoint06Abi,
      functionName: 'handleOps',
      args: [operations, BENEFICIARY]
    });
  const userOpHash = eventHash || getUserOperationHash({
    chainId: access.BASE_CHAIN_ID,
    entryPointAddress: entryPoint06Address,
    entryPointVersion: '0.6',
    userOperation: operation
  });
  const eventLog = {
    address: entryPoint06Address,
    topics: encodeEventTopics({
      abi: entryPoint06Abi,
      eventName: 'UserOperationEvent',
      args: {
        userOpHash,
        sender: operation.sender,
        paymaster: access.ZERO_ADDRESS
      }
    }),
    data: encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'bool' },
        { type: 'uint256' },
        { type: 'uint256' }
      ],
      [operation.nonce, eventSuccess, 1n, 1n]
    )
  };
  const logs = duplicateEvent ? [eventLog, eventLog] : [eventLog];
  return {
    getChainId: async () => 8453,
    getTransactionReceipt: async () => ({
      status: 'success',
      blockNumber: 9n,
      logs
    }),
    getBlock: async () => ({ timestamp: BigInt(NOW / 1000) }),
    getTransaction: async () => ({
      from: BUNDLER,
      to: entryPoint06Address,
      value: 0n,
      input
    }),
    getCode: async () => runtimeCode,
    getStorageAt: async () => storageWordForAddress(implementation)
  };
};

const profileWith = ({ entitlements = null, mastery = false, legacyUnlocks = [] } = {}) => {
  const snapshot = profiles.sanitizeWalletSnapshot({}, WALLET, NOW);
  snapshot.permanentState.unlockedPlayerShips = legacyUnlocks;
  if (entitlements) {
    snapshot.permanentState.playerShipEntitlements = profiles.sanitizePlayerShipEntitlements(entitlements);
  }
  if (mastery) {
    campaign.levels.forEach((level) => {
      snapshot.permanentState.campaignProgress.missionRecords[level.id] = {
        ...snapshot.permanentState.campaignProgress.missionRecords[level.id],
        completed: true,
        completedWaveIds: level.waves.map((wave) => wave.id),
        stars: 3,
        earnedStarIds: level.campaignProgression.masteryObjectives.map((objective) => objective.id)
      };
    });
  }
  return {
    walletAddress: WALLET,
    profileId: `wallet:${WALLET}`,
    revision: 4,
    snapshot: profiles.sanitizeWalletSnapshot(snapshot, WALLET, NOW)
  };
};

test('Base ship catalog uses the exact BIO, ETH, cbBTC, recipient, and raw-unit terms', () => {
  assert.equal(access.BASE_CHAIN_ID, 8453);
  assert.equal(access.BIO_CONTRACT_ADDRESS, '0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2');
  assert.equal(access.BIO_DECIMALS, 18);
  assert.equal(access.BIO_SHIP_REQUIRED_BALANCE_RAW, '100000000000000000000');
  assert.equal(access.CBBTC_CONTRACT_ADDRESS, '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf');
  assert.equal(access.CBBTC_DECIMALS, 8);
  assert.equal(access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS, '0x3a8d692aabdd4981080a8f6af8375a21359464bf');
  assert.deepEqual(
    Object.fromEntries(Object.values(access.PLAYER_SHIP_PURCHASE_SKUS).map((sku) => [sku.id, {
      shipId: sku.shipId,
      tokenAddress: sku.tokenAddress,
      amount: sku.amount,
      amountRaw: sku.amountRaw
    }])),
    {
      'eth-ship': {
        shipId: 'eth',
        tokenAddress: access.ZERO_ADDRESS,
        amount: '0.001',
        amountRaw: '1000000000000000'
      },
      'btc-ship': {
        shipId: 'btc',
        tokenAddress: access.CBBTC_CONTRACT_ADDRESS,
        amount: '0.00008',
        amountRaw: '8000'
      }
    }
  );
});

test('BIO access is fail-closed and unlocks only at the exact 100 BIO threshold on Base', async () => {
  const status = await access.getBioHoldingStatus({
    address: WALLET,
    publicClient: {
      getChainId: async () => 8453,
      readContract: async () => 100_000_000_000_000_000_000n
    }
  });
  assert.equal(status.verificationStatus, 'verified');
  assert.equal(status.unlocked, true);
  assert.equal(status.balanceRaw, access.BIO_SHIP_REQUIRED_BALANCE_RAW);

  const below = await access.getBioHoldingStatus({
    address: WALLET,
    publicClient: {
      getChainId: async () => 8453,
      readContract: async () => 99_999_999_999_999_999_999n
    }
  });
  assert.equal(below.unlocked, false);

  const wrongChain = await access.getBioHoldingStatus({
    address: WALLET,
    publicClient: {
      getChainId: async () => 1,
      readContract: async () => 999_000_000_000_000_000_000n
    }
  });
  assert.equal(wrongChain.verificationStatus, 'unavailable');
  assert.equal(wrongChain.unlocked, false);
});

test('access status exposes the flat client contract with formatted BIO and Campaign mastery', async () => {
  const status = await access.getPlayerShipAccessStatus({
    address: WALLET,
    profile: profileWith(),
    publicClient: {
      getChainId: async () => 8453,
      readContract: async () => 100_500_000_000_000_000_000n
    }
  });
  assert.deepEqual(status, {
    bio: true,
    eth: false,
    btc: false,
    bioBalanceRaw: null,
    bioBalance: null,
    bioThresholdRaw: '100000000000000000000',
    campaignMastered: false,
    unlockedPlayerShips: ['researchhub', 'bio']
  });
});

test('paid entitlement state is server-owned while legacy unlock arrays do not authorize access', () => {
  const current = profileWith({
    entitlements: {
      eth: { source: 'base-eth-purchase', transactionHash: HASH, grantedAt: new Date(NOW).toISOString() }
    }
  }).snapshot;
  const incoming = profileWith({
    entitlements: {
      btc: { source: 'base-cbbtc-purchase', transactionHash: HASH, grantedAt: new Date(NOW).toISOString() }
    },
    legacyUnlocks: ['btc']
  }).snapshot;
  const preserved = profiles.preserveWalletPurchaseServerState({
    currentSnapshot: current,
    incomingSnapshot: incoming
  });
  assert.equal(preserved.permanentState.playerShipEntitlements.eth.transactionHash, HASH);
  assert.equal(preserved.permanentState.playerShipEntitlements.btc, null);
  assert.equal(access.profilePlayerShipAccess(profileWith({ legacyUnlocks: ['eth', 'btc'] })).eth, false);
  assert.equal(access.profilePlayerShipAccess(profileWith({ legacyUnlocks: ['eth', 'btc'] })).btc, false);

  const firstSave = profiles.preserveWalletPurchaseServerState({
    currentSnapshot: null,
    incomingSnapshot: incoming
  });
  assert.equal(firstSave.permanentState.playerShipEntitlements.eth, null);
  assert.equal(firstSave.permanentState.playerShipEntitlements.btc, null);
  assert.deepEqual(firstSave.permanentState.unlockedPlayerShips, []);
});

test('BTC Campaign route requires every authored objective across all 60 missions', () => {
  const mastered = profileWith({ mastery: true });
  const complete = profiles.campaignMasteryStatus(mastered.snapshot);
  assert.deepEqual(complete, {
    missionsCompleted: 60,
    requiredMissions: 60,
    starsEarned: 180,
    requiredStars: 180,
    complete: true
  });
  assert.equal(access.profilePlayerShipAccess(mastered).btc, true);

  const missingObjective = structuredClone(mastered);
  const finalLevel = campaign.levels.at(-1);
  missingObjective.snapshot.permanentState.campaignProgress.missionRecords[finalLevel.id].earnedStarIds.pop();
  const incomplete = profiles.campaignMasteryStatus(missingObjective.snapshot);
  assert.equal(incomplete.missionsCompleted, 60);
  assert.equal(incomplete.starsEarned, 179);
  assert.equal(incomplete.complete, false);

  const saved = profiles.preserveWalletPurchaseServerState({
    currentSnapshot: profileWith().snapshot,
    incomingSnapshot: mastered.snapshot
  });
  assert.ok(saved.permanentState.unlockedPlayerShips.includes('btc'));
});

test('entitlement grants are CAS-backed and idempotent by ship', async () => {
  let stored = profileWith();
  const loadProfile = async () => stored;
  const writeProfile = async ({ profile, snapshot }) => {
    stored = {
      ...profile,
      revision: profile.revision + 1,
      snapshot: profiles.sanitizeWalletSnapshot(snapshot, WALLET, NOW)
    };
    return stored;
  };
  const granted = await profiles.grantPlayerShipEntitlement({
    address: WALLET,
    shipId: 'eth',
    transactionHash: HASH,
    grantedAt: new Date(NOW).toISOString(),
    now: NOW,
    loadProfile,
    writeProfile
  });
  assert.equal(granted.granted, true);
  assert.equal(granted.profile.snapshot.permanentState.playerShipEntitlements.eth.source, 'base-eth-purchase');

  const duplicate = await profiles.grantPlayerShipEntitlement({
    address: WALLET,
    shipId: 'eth',
    transactionHash: `0x${'cd'.repeat(32)}`,
    grantedAt: new Date(NOW + 1_000).toISOString(),
    now: NOW + 1_000,
    loadProfile,
    writeProfile
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.entitlement.transactionHash, HASH);
});

test('stateless purchase quotes are wallet-bound, canonical, signed, and expire after 15 minutes', async () => {
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'eth-ship',
    now: NOW,
    profile: profileWith()
  });
  assert.deepEqual(Object.keys(quote), [
    'token',
    'orderId',
    'skuId',
    'walletAddress',
    'chainId',
    'paymentKind',
    'tokenAddress',
    'tokenSymbol',
    'recipientAddress',
    'amount',
    'amountRaw',
    'grantsShipId',
    'issuedAt',
    'expiresAt'
  ]);
  assert.equal(quote.paymentKind, 'native');
  assert.equal(quote.tokenAddress, null);
  assert.equal(quote.grantsShipId, 'eth');
  assert.equal(Date.parse(quote.expiresAt) - Date.parse(quote.issuedAt), 15 * 60 * 1000);
  assert.equal(
    access.verifyPlayerShipQuoteToken({ token: quote.token, address: WALLET, now: NOW }).sku.id,
    'eth-ship'
  );
  assert.throws(
    () => access.verifyPlayerShipQuoteToken({
      token: `${quote.token.slice(0, -1)}x`,
      address: WALLET,
      now: NOW
    }),
    (error) => error.code === 'player_ship_quote_invalid'
  );
  assert.throws(
    () => access.verifyPlayerShipQuoteToken({
      token: quote.token,
      address: WALLET,
      now: NOW + 15 * 60 * 1000
    }),
    (error) => error.code === 'player_ship_quote_expired'
  );
});

test('ETH settlement accepts only an exact direct top-level 0.001 ETH payment', async () => {
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'eth-ship',
    now: NOW,
    profile: profileWith()
  });
  const client = {
    getChainId: async () => 8453,
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 9n, logs: [] }),
    getBlock: async () => ({ timestamp: BigInt(NOW / 1000) }),
    getTransaction: async () => ({
      from: WALLET,
      to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
      value: 1_000_000_000_000_000n,
      input: '0x'
    })
  };
  const verified = await access.verifyPlayerShipPayment({
    quoteToken: quote.token,
    address: WALLET,
    transactionHash: HASH,
    now: NOW,
    publicClient: client
  });
  assert.equal(verified.sku.shipId, 'eth');

  const recoveredAfterQuoteExpiry = await access.verifyPlayerShipPayment({
    quoteToken: quote.token,
    address: WALLET,
    transactionHash: HASH,
    now: NOW + 60 * 60 * 1000,
    publicClient: client
  });
  assert.equal(recoveredAfterQuoteExpiry.transactionHash, HASH);

  const invalidTransactions = [
    {
      from: OTHER_WALLET,
      to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
      value: 1_000_000_000_000_000n,
      input: '0x'
    },
    {
      from: WALLET,
      to: OTHER_WALLET,
      value: 1_000_000_000_000_000n,
      input: '0x'
    },
    {
      from: WALLET,
      to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
      value: 999_999_999_999_999n,
      input: '0x'
    },
    {
      from: WALLET,
      to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
      value: 1_000_000_000_000_000n,
      input: '0x1234'
    }
  ];
  for (const transaction of invalidTransactions) {
    await assert.rejects(
      access.verifyPlayerShipPayment({
        quoteToken: quote.token,
        address: WALLET,
        transactionHash: HASH,
        now: NOW,
        publicClient: { ...client, getTransaction: async () => transaction }
      }),
      (error) => error.code === 'player_ship_native_payment_invalid'
    );
  }
});

test('ETH settlement verifies exact Coinbase Smart Wallet execute and executeBatch operations', async () => {
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'eth-ship',
    now: NOW,
    profile: profileWith()
  });

  const walletCases = [
    {
      executionFunction: 'execute',
      implementation: access.COINBASE_SMART_WALLET_IMPLEMENTATIONS[0]
    },
    {
      executionFunction: 'executeBatch',
      implementation: access.COINBASE_SMART_WALLET_IMPLEMENTATIONS[1]
    }
  ];
  for (const walletCase of walletCases) {
    const verified = await access.verifyPlayerShipPayment({
      quoteToken: quote.token,
      address: WALLET,
      transactionHash: HASH,
      now: NOW,
      publicClient: smartWalletPaymentClient(walletCase)
    });
    assert.equal(verified.sku.shipId, 'eth');
  }
});

test('ETH smart-wallet settlement fails closed for spoofed or ambiguous ERC-4337 payments', async () => {
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'eth-ship',
    now: NOW,
    profile: profileWith()
  });
  const exactCall = {
    target: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
    value: 1_000_000_000_000_000n,
    data: '0x'
  };
  const invalidClients = [
    smartWalletPaymentClient({ operationSender: OTHER_WALLET }),
    smartWalletPaymentClient({ recipient: OTHER_WALLET }),
    smartWalletPaymentClient({ value: 999_999_999_999_999n }),
    smartWalletPaymentClient({ callData: '0x1234' }),
    smartWalletPaymentClient({ calls: [exactCall, exactCall] }),
    smartWalletPaymentClient({ duplicateOperation: true }),
    smartWalletPaymentClient({ duplicateEvent: true }),
    smartWalletPaymentClient({ eventSuccess: false }),
    smartWalletPaymentClient({ eventHash: `0x${'55'.repeat(32)}` }),
    smartWalletPaymentClient({ malformedTransactionInput: true }),
    smartWalletPaymentClient({ runtimeCode: '0x60006000' }),
    smartWalletPaymentClient({ implementation: OTHER_WALLET })
  ];

  const wrongEntryPointClient = smartWalletPaymentClient();
  invalidClients.push({
    ...wrongEntryPointClient,
    getTransaction: async () => ({
      from: BUNDLER,
      to: OTHER_WALLET,
      value: 0n,
      input: '0x'
    })
  });

  for (const publicClient of invalidClients) {
    await assert.rejects(
      access.verifyPlayerShipPayment({
        quoteToken: quote.token,
        address: WALLET,
        transactionHash: HASH,
        now: NOW,
        publicClient
      }),
      (error) => error.code === 'player_ship_native_payment_invalid'
    );
  }
});

test('settlement returns the client contract plus the authoritative updated profile and access', async () => {
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'eth-ship',
    now: NOW,
    profile: profileWith()
  });
  const grantedProfile = profileWith({
    entitlements: {
      eth: { source: 'base-eth-purchase', transactionHash: HASH, grantedAt: new Date(NOW).toISOString() }
    }
  });
  const settlement = await access.settlePlayerShipPurchase({
    address: WALLET,
    quoteToken: quote.token,
    transactionHash: HASH,
    now: NOW,
    publicClient: {
      getChainId: async () => 8453,
      getTransactionReceipt: async () => ({ status: 'success', blockNumber: 9n, logs: [] }),
      getBlock: async () => ({ timestamp: BigInt(NOW / 1000) }),
      getTransaction: async () => ({
        from: WALLET,
        to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
        value: 1_000_000_000_000_000n,
        input: '0x'
      }),
      readContract: async () => 0n
    },
    grantEntitlement: async () => ({
      duplicate: false,
      entitlement: grantedProfile.snapshot.permanentState.playerShipEntitlements.eth,
      profile: grantedProfile
    })
  });
  assert.deepEqual(Object.keys(settlement), [
    'accepted',
    'duplicate',
    'orderId',
    'skuId',
    'transactionHash',
    'grantsShipId',
    'profile',
    'access'
  ]);
  assert.equal(settlement.grantsShipId, 'eth');
  assert.equal(settlement.access.eth, true);
  assert.equal(settlement.access.bio, true);
});

test('cbBTC settlement requires exactly one matching 8,000-unit Transfer log', async () => {
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
  const log = {
    address: access.CBBTC_CONTRACT_ADDRESS,
    topics: encodeEventTopics({
      abi,
      eventName: 'Transfer',
      args: { from: WALLET, to: access.PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS }
    }),
    data: encodeAbiParameters([{ type: 'uint256' }], [8_000n]),
    logIndex: 4
  };
  const quote = await access.createPlayerShipPurchaseQuote({
    address: WALLET,
    skuId: 'btc-ship',
    now: NOW,
    profile: profileWith()
  });
  const client = {
    getChainId: async () => 8453,
    getTransactionReceipt: async () => ({ status: 'success', blockNumber: 10n, logs: [log] }),
    getBlock: async () => ({ timestamp: BigInt(NOW / 1000) })
  };
  const verified = await access.verifyPlayerShipPayment({
    quoteToken: quote.token,
    address: WALLET,
    transactionHash: HASH,
    now: NOW,
    publicClient: client
  });
  assert.equal(verified.sku.shipId, 'btc');

  await assert.rejects(
    access.verifyPlayerShipPayment({
      quoteToken: quote.token,
      address: WALLET,
      transactionHash: HASH,
      now: NOW,
      publicClient: {
        ...client,
        getTransactionReceipt: async () => ({ status: 'success', blockNumber: 10n, logs: [log, log] })
      }
    }),
    (error) => error.code === 'player_ship_cbbtc_payment_invalid'
  );
});

test('server Hangar upgrades ignore legacy unlock arrays and require verified ship access', () => {
  const legacy = profileWith({ legacyUnlocks: ['eth', 'btc'] });
  assert.throws(() => spends.canonicalWalletTokenSpend({
    profile: legacy,
    action: { kind: 'upgrade-main-ship', shipId: 'eth', upgradeId: 'speed' }
  }), (error) => error.code === 'wallet_token_action_locked');

  const paid = profileWith({
    entitlements: {
      eth: { source: 'base-eth-purchase', transactionHash: HASH, grantedAt: new Date(NOW).toISOString() }
    }
  });
  paid.snapshot.weeklyState.coins = 100;
  paid.snapshot.weeklyState.durableCampaignCoins = 100;
  const canonical = spends.canonicalWalletTokenSpend({
    profile: paid,
    action: { kind: 'upgrade-main-ship', shipId: 'eth', upgradeId: 'speed' }
  });
  assert.equal(canonical.nextSnapshot.weeklyState.shipUpgrades.eth.speed, 1);
});

test('player ship access API shares the existing Vercel function and requires wallet session auth', () => {
  const mintRouter = read('api', 'mint-records.js');
  const route = read('api', '_lib', 'playerShipAccessRoute.js');
  const vercel = read('vercel.json');
  assert.match(mintRouter, /route === 'player-ship-access'/);
  assert.match(mintRouter, /playerShipAccessHandler\(req, res\)/);
  assert.match(route, /readWalletProfileSession\(req\)/);
  assert.match(route, /assertSameOrigin\(req\)/);
  assert.match(vercel, /"source": "\/api\/player-ship-access"[\s\S]*?"destination": "\/api\/mint-records\?route=player-ship-access"/);
});
