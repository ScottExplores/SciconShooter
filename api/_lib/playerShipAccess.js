const crypto = require('crypto');
const { getWalletProfileAuthSecret, normalizeWalletAddress } = require('./walletProfileAuth');
const {
  campaignMasteryStatus,
  ensureWalletProfile,
  grantPlayerShipEntitlement,
  sanitizePlayerShipEntitlements
} = require('./walletProfiles');

const BASE_CHAIN_ID = 8453;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BIO_CONTRACT_ADDRESS = '0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2';
const BIO_DECIMALS = 18;
const CBBTC_CONTRACT_ADDRESS = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';
const CBBTC_DECIMALS = 8;
const PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS = '0x3a8d692aabdd4981080a8f6af8375a21359464bf';
const PLAYER_SHIP_QUOTE_LIFETIME_MS = 15 * 60 * 1000;
const PLAYER_SHIP_QUOTE_TOKEN_TYPE = 'scicon-player-ship-quote-v1';
const TRANSACTION_HASH_PATTERN = /^0x[a-f0-9]{64}$/;
const ENTRY_POINT_V06_ADDRESS = '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const ERC1967_IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const COINBASE_SMART_WALLET_PROXY_RUNTIME_CODE_HASH = '0xaaa52c8cc8a0e3fd27ce756cc6b4e70c51423e9b597b11f32d3e49f8b1fc890d';
const COINBASE_SMART_WALLET_IMPLEMENTATIONS = Object.freeze([
  '0x00000110dcdedc9581cb5ecb8467282f2926534d',
  '0x000100abaad02f1cfc8bbe32bd5a564817339e72'
]);

const PLAYER_SHIP_PURCHASE_SKUS = Object.freeze({
  'eth-ship': Object.freeze({
    id: 'eth-ship',
    shipId: 'eth',
    assetType: 'native',
    symbol: 'ETH',
    tokenAddress: ZERO_ADDRESS,
    decimals: 18,
    amount: '0.001',
    amountRaw: '1000000000000000',
    entitlementSource: 'base-eth-purchase'
  }),
  'btc-ship': Object.freeze({
    id: 'btc-ship',
    shipId: 'btc',
    assetType: 'erc20',
    symbol: 'cbBTC',
    tokenAddress: CBBTC_CONTRACT_ADDRESS,
    decimals: CBBTC_DECIMALS,
    amount: '0.00008',
    amountRaw: '8000',
    entitlementSource: 'base-cbbtc-purchase'
  })
});

const transferEventAbi = [{
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'value', type: 'uint256', indexed: false }
  ]
}];

// Coinbase Smart Wallet encodes calls through these two functions. Keep this
// ABI intentionally narrow so settlement fails closed for any other execution
// shape, including replayable or multi-call variants.
const coinbaseSmartWalletExecutionAbi = [
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

const apiError = (message, statusCode = 400, code = '') => Object.assign(
  new Error(message),
  { statusCode, code, isPublicPlayerShipAccessError: true }
);

const playerShipPurchaseSku = (value) => (
  typeof value === 'string' ? PLAYER_SHIP_PURCHASE_SKUS[value] || null : null
);

const normalizeTransactionHash = (value) => {
  const hash = String(value || '').trim().toLowerCase();
  return TRANSACTION_HASH_PATTERN.test(hash) ? hash : null;
};

const playerShipPublicClient = async () => {
  const { createPublicClient, http } = await import('viem');
  const { base } = await import('viem/chains');
  return createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org', {
      retryCount: 1,
      timeout: 8_000
    })
  });
};

const formatTokenBalance = (rawValue, decimals) => {
  const raw = BigInt(rawValue);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = (raw % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const profilePlayerShipAccess = (profile, _bioStatus = null) => {
  const entitlements = sanitizePlayerShipEntitlements(
    profile?.snapshot?.permanentState?.playerShipEntitlements
  );
  const mastery = campaignMasteryStatus(profile?.snapshot);
  const ethPaid = Boolean(entitlements.eth);
  const btcPaid = Boolean(entitlements.btc);
  return {
    researchhub: true,
    bio: true,
    eth: ethPaid,
    btc: btcPaid || mastery.complete,
    ethPaid,
    btcPaid,
    mastery,
    entitlements
  };
};

const getPlayerShipAccessStatus = async ({
  address,
  now = Date.now(),
  publicClient: _publicClient = null,
  profile: providedProfile = null
}) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const profile = providedProfile || await ensureWalletProfile(walletAddress, now);
  if (!profile) {
    throw apiError(
      'The wallet profile could not be prepared for ship access.',
      503,
      'player_ship_profile_unavailable'
    );
  }
  const access = profilePlayerShipAccess(profile, null);
  return {
    bio: true,
    eth: access.eth,
    btc: access.btc,
    bioBalanceRaw: null,
    bioBalance: null,
    campaignMastered: access.mastery.complete,
    unlockedPlayerShips: ['researchhub',
      ...(access.bio ? ['bio'] : []),
      ...(access.eth ? ['eth'] : []),
      ...(access.btc ? ['btc'] : [])]
  };
};

const encodeQuotePayload = (payload) => Buffer
  .from(JSON.stringify(payload))
  .toString('base64url');

const signQuotePayload = (encodedPayload) => crypto
  .createHmac('sha256', getWalletProfileAuthSecret())
  .update(`${PLAYER_SHIP_QUOTE_TOKEN_TYPE}.${encodedPayload}`)
  .digest('base64url');

const canonicalQuotePayload = ({ walletAddress, sku, issuedAt, expiresAt, quoteId }) => ({
  type: PLAYER_SHIP_QUOTE_TOKEN_TYPE,
  quoteId,
  walletAddress,
  skuId: sku.id,
  shipId: sku.shipId,
  chainId: BASE_CHAIN_ID,
  assetType: sku.assetType,
  tokenAddress: sku.tokenAddress,
  recipientAddress: PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
  amountRaw: sku.amountRaw,
  issuedAt,
  expiresAt
});

const quoteFromPayload = (payload, quoteToken) => {
  const sku = playerShipPurchaseSku(payload.skuId);
  return {
    token: quoteToken,
    orderId: payload.quoteId,
    skuId: sku.id,
    walletAddress: payload.walletAddress,
    chainId: BASE_CHAIN_ID,
    paymentKind: sku.assetType,
    tokenAddress: sku.assetType === 'native' ? null : sku.tokenAddress,
    tokenSymbol: sku.symbol,
    recipientAddress: PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
    amount: sku.amount,
    amountRaw: sku.amountRaw,
    grantsShipId: sku.shipId,
    issuedAt: new Date(payload.issuedAt).toISOString(),
    expiresAt: new Date(payload.expiresAt).toISOString()
  };
};

const verifyPlayerShipQuoteToken = ({
  token,
  address,
  now = Date.now(),
  allowExpired = false
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const [encodedPayload, signature, extra] = String(token || '').split('.');
  if (!walletAddress || !encodedPayload || !signature || extra) {
    throw apiError('The player ship purchase quote is invalid.', 400, 'player_ship_quote_invalid');
  }
  const expectedSignature = signQuotePayload(encodedPayload);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (
    actualBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw apiError('The player ship purchase quote is invalid.', 400, 'player_ship_quote_invalid');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw apiError('The player ship purchase quote is invalid.', 400, 'player_ship_quote_invalid');
  }
  const sku = playerShipPurchaseSku(payload.skuId);
  const issuedAt = Number(payload.issuedAt);
  const expiresAt = Number(payload.expiresAt);
  const quoteIdValid = typeof payload.quoteId === 'string'
    && /^[0-9a-f-]{36}$/i.test(payload.quoteId);
  const canonical = sku && canonicalQuotePayload({
    walletAddress,
    sku,
    issuedAt,
    expiresAt,
    quoteId: payload.quoteId
  });
  if (
    !sku
    || !quoteIdValid
    || payload.type !== PLAYER_SHIP_QUOTE_TOKEN_TYPE
    || payload.walletAddress !== walletAddress
    || JSON.stringify(payload) !== JSON.stringify(canonical)
    || !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || expiresAt - issuedAt !== PLAYER_SHIP_QUOTE_LIFETIME_MS
    || issuedAt > Number(now) + 30_000
    || (!allowExpired && expiresAt <= Number(now))
  ) {
    throw apiError(
      !allowExpired && expiresAt <= Number(now)
        ? 'This player ship purchase quote expired. Request a new quote.'
        : 'The player ship purchase quote is invalid.',
      !allowExpired && expiresAt <= Number(now) ? 410 : 400,
      !allowExpired && expiresAt <= Number(now)
        ? 'player_ship_quote_expired'
        : 'player_ship_quote_invalid'
    );
  }
  return { payload, sku };
};

const createPlayerShipPurchaseQuote = async ({
  address,
  skuId,
  now = Date.now(),
  profile: providedProfile = null
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const sku = playerShipPurchaseSku(skuId);
  if (!walletAddress || !sku) {
    throw apiError('This player ship purchase is not available.', 400, 'player_ship_sku_invalid');
  }
  if (walletAddress === PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS) {
    throw apiError(
      'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to make a purchase.',
      409,
      'player_ship_self_payment_forbidden'
    );
  }
  const profile = providedProfile || await ensureWalletProfile(walletAddress, now);
  if (!profile) {
    throw apiError('The wallet profile could not be prepared for this purchase.', 503);
  }
  const access = profilePlayerShipAccess(profile);
  if (access[sku.shipId]) {
    throw apiError(
      `The ${sku.symbol} ship is already unlocked for this wallet.`,
      409,
      'player_ship_already_unlocked'
    );
  }
  const issuedAt = Math.floor(Number(now));
  const payload = canonicalQuotePayload({
    walletAddress,
    sku,
    issuedAt,
    expiresAt: issuedAt + PLAYER_SHIP_QUOTE_LIFETIME_MS,
    quoteId: crypto.randomUUID()
  });
  const encodedPayload = encodeQuotePayload(payload);
  return quoteFromPayload(payload, `${encodedPayload}.${signQuotePayload(encodedPayload)}`);
};

const normalizeHexData = (value) => String(value ?? '').toLowerCase();

const isExactNativeShipPaymentCall = ({ call, sku }) => {
  try {
    return String(call?.to || '').toLowerCase() === PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS
      && BigInt(call?.value ?? -1) === BigInt(sku.amountRaw)
      && normalizeHexData(call?.data ?? call?.input) === '0x';
  } catch {
    return false;
  }
};

const decodeCoinbaseSmartWalletCalls = (callData) => {
  const { decodeFunctionData } = require('viem');
  const decoded = decodeFunctionData({
    abi: coinbaseSmartWalletExecutionAbi,
    data: callData
  });
  if (decoded.functionName === 'execute') {
    return [{
      to: decoded.args[0],
      value: decoded.args[1],
      data: decoded.args[2]
    }];
  }
  if (decoded.functionName === 'executeBatch') {
    return decoded.args[0].map((call) => ({
      to: call.target,
      value: call.value,
      data: call.data
    }));
  }
  return [];
};

const isExactDirectNativeShipPayment = ({ transaction, payload, sku }) => (
  String(transaction?.from || '').toLowerCase() === payload.walletAddress
  && isExactNativeShipPaymentCall({
    call: {
      to: transaction?.to,
      value: transaction?.value,
      data: transaction?.input ?? transaction?.data
    },
    sku
  })
);

const implementationAddressFromStorage = (value) => {
  const normalized = normalizeHexData(value);
  return /^0x[a-f0-9]{64}$/.test(normalized)
    ? `0x${normalized.slice(-40)}`
    : null;
};

const isExactCoinbaseSmartWalletNativeShipPayment = async ({
  client,
  transaction,
  receipt,
  payload,
  sku
}) => {
  try {
    const {
      decodeEventLog,
      decodeFunctionData,
      keccak256
    } = require('viem');
    const {
      entryPoint06Abi,
      entryPoint06Address,
      getUserOperationHash
    } = require('viem/account-abstraction');
    const officialEntryPoint = String(entryPoint06Address).toLowerCase();
    if (
      officialEntryPoint !== ENTRY_POINT_V06_ADDRESS
      || String(transaction?.to || '').toLowerCase() !== officialEntryPoint
    ) {
      return false;
    }

    const [walletRuntimeCode, implementationStorage] = await Promise.all([
      client.getCode({
        address: payload.walletAddress,
        blockNumber: receipt.blockNumber
      }),
      client.getStorageAt({
        address: payload.walletAddress,
        slot: ERC1967_IMPLEMENTATION_SLOT,
        blockNumber: receipt.blockNumber
      })
    ]);
    const walletImplementation = implementationAddressFromStorage(implementationStorage);
    if (
      !walletRuntimeCode
      || keccak256(walletRuntimeCode).toLowerCase() !== COINBASE_SMART_WALLET_PROXY_RUNTIME_CODE_HASH
      || !walletImplementation
      || !COINBASE_SMART_WALLET_IMPLEMENTATIONS.includes(walletImplementation)
    ) {
      return false;
    }

    const entryPointCall = decodeFunctionData({
      abi: entryPoint06Abi,
      data: transaction?.input ?? transaction?.data
    });
    if (entryPointCall.functionName !== 'handleOps') return false;
    const walletOperations = entryPointCall.args[0].filter(
      (operation) => String(operation.sender || '').toLowerCase() === payload.walletAddress
    );
    if (walletOperations.length !== 1) return false;
    const walletOperation = walletOperations[0];

    const walletCalls = decodeCoinbaseSmartWalletCalls(walletOperation.callData);
    if (
      walletCalls.length !== 1
      || !isExactNativeShipPaymentCall({ call: walletCalls[0], sku })
    ) {
      return false;
    }

    const expectedUserOperationHash = getUserOperationHash({
      chainId: BASE_CHAIN_ID,
      entryPointAddress: entryPoint06Address,
      entryPointVersion: '0.6',
      userOperation: walletOperation
    }).toLowerCase();
    const walletEvents = (receipt.logs || []).flatMap((log) => {
      if (String(log.address || '').toLowerCase() !== officialEntryPoint) return [];
      try {
        const event = decodeEventLog({
          abi: entryPoint06Abi,
          data: log.data,
          topics: log.topics
        });
        if (
          event.eventName !== 'UserOperationEvent'
          || String(event.args.sender || '').toLowerCase() !== payload.walletAddress
        ) {
          return [];
        }
        return [event];
      } catch {
        return [];
      }
    });
    if (walletEvents.length !== 1) return false;
    const event = walletEvents[0];
    return event.args.success === true
      && BigInt(event.args.nonce) === BigInt(walletOperation.nonce)
      && String(event.args.userOpHash || '').toLowerCase() === expectedUserOperationHash;
  } catch {
    return false;
  }
};

const verifyPlayerShipPayment = async ({
  quoteToken,
  address,
  transactionHash,
  now = Date.now(),
  publicClient
}) => {
  const normalizedHash = normalizeTransactionHash(transactionHash);
  if (!normalizedHash) {
    throw apiError('A valid Base transaction hash is required.', 400, 'player_ship_transaction_invalid');
  }
  const { payload, sku } = verifyPlayerShipQuoteToken({
    token: quoteToken,
    address,
    now,
    allowExpired: true
  });
  const client = publicClient || await playerShipPublicClient();
  const [chainId, receipt] = await Promise.all([
    client.getChainId(),
    client.getTransactionReceipt({ hash: normalizedHash })
  ]);
  if (Number(chainId) !== BASE_CHAIN_ID) {
    throw apiError('The ship purchase transaction is not on Base mainnet.', 409, 'player_ship_wrong_chain');
  }
  if (receipt.status !== 'success') {
    throw apiError('The ship purchase transaction did not confirm successfully.', 409, 'player_ship_payment_failed');
  }
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const paymentBlockTimeMs = Number(block.timestamp) * 1000;
  const quoteStartBlockTimeMs = Math.floor(payload.issuedAt / 1000) * 1000;
  if (!Number.isFinite(paymentBlockTimeMs) || paymentBlockTimeMs < quoteStartBlockTimeMs) {
    throw apiError('The ship payment predates this purchase quote.', 409, 'player_ship_payment_too_old');
  }
  if (paymentBlockTimeMs > payload.expiresAt) {
    throw apiError('The ship payment was mined after this purchase quote expired.', 409, 'player_ship_payment_after_expiry');
  }

  if (sku.assetType === 'native') {
    const transaction = await client.getTransaction({ hash: normalizedHash });
    const directPayment = isExactDirectNativeShipPayment({ transaction, payload, sku });
    const smartWalletPayment = directPayment
      ? false
      : await isExactCoinbaseSmartWalletNativeShipPayment({
        client,
        transaction,
        receipt,
        payload,
        sku
      });
    if (!directPayment && !smartWalletPayment) {
      throw apiError(
        'The confirmed transaction was not the exact ETH ship payment.',
        409,
        'player_ship_native_payment_invalid'
      );
    }
  } else {
    const { decodeEventLog } = require('viem');
    const transfers = (receipt.logs || []).flatMap((log) => {
      if (String(log.address || '').toLowerCase() !== sku.tokenAddress) return [];
      try {
        const event = decodeEventLog({ abi: transferEventAbi, data: log.data, topics: log.topics });
        return event.eventName === 'Transfer' ? [event] : [];
      } catch {
        return [];
      }
    });
    if (
      transfers.length !== 1
      || String(transfers[0].args.from || '').toLowerCase() !== payload.walletAddress
      || String(transfers[0].args.to || '').toLowerCase() !== PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS
      || BigInt(transfers[0].args.value) !== BigInt(sku.amountRaw)
    ) {
      throw apiError(
        'The confirmed transaction did not contain exactly one valid cbBTC ship payment.',
        409,
        'player_ship_cbbtc_payment_invalid'
      );
    }
  }

  return {
    quote: quoteFromPayload(payload, quoteToken),
    sku,
    transactionHash: normalizedHash,
    paymentBlockTime: new Date(paymentBlockTimeMs).toISOString()
  };
};

const settlePlayerShipPurchase = async ({
  address,
  quoteToken,
  transactionHash,
  now = Date.now(),
  publicClient = null,
  grantEntitlement = grantPlayerShipEntitlement
}) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  const verified = await verifyPlayerShipPayment({
    quoteToken,
    address: walletAddress,
    transactionHash,
    now,
    publicClient
  });
  const grant = await grantEntitlement({
    address: walletAddress,
    shipId: verified.sku.shipId,
    transactionHash: verified.transactionHash,
    grantedAt: verified.paymentBlockTime,
    now
  });
  return {
    accepted: true,
    duplicate: grant.duplicate,
    orderId: verified.quote.orderId,
    skuId: verified.sku.id,
    transactionHash: verified.transactionHash,
    grantsShipId: verified.sku.shipId,
    profile: grant.profile,
    access: await getPlayerShipAccessStatus({
      address: walletAddress,
      now,
      publicClient,
      profile: grant.profile
    })
  };
};

module.exports = {
  BASE_CHAIN_ID,
  BIO_CONTRACT_ADDRESS,
  BIO_DECIMALS,
  CBBTC_CONTRACT_ADDRESS,
  CBBTC_DECIMALS,
  COINBASE_SMART_WALLET_IMPLEMENTATIONS,
  COINBASE_SMART_WALLET_PROXY_RUNTIME_CODE_HASH,
  ENTRY_POINT_V06_ADDRESS,
  ERC1967_IMPLEMENTATION_SLOT,
  PLAYER_SHIP_PURCHASE_RECIPIENT_ADDRESS,
  PLAYER_SHIP_PURCHASE_SKUS,
  PLAYER_SHIP_QUOTE_LIFETIME_MS,
  ZERO_ADDRESS,
  createPlayerShipPurchaseQuote,
  getPlayerShipAccessStatus,
  isExactCoinbaseSmartWalletNativeShipPayment,
  isExactDirectNativeShipPayment,
  normalizeTransactionHash,
  playerShipPurchaseSku,
  profilePlayerShipAccess,
  settlePlayerShipPurchase,
  verifyPlayerShipPayment,
  verifyPlayerShipQuoteToken
};
