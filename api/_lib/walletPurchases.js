const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { normalizeWalletAddress } = require('./walletProfileAuth');
const { ensureWalletProfile, fetchWalletProfile } = require('./walletProfiles');
const { getWeeklyBoundaryMeta, getWeekRange } = require('../../shared/weeklyCompetitionBoundary');
const { getWeeklyRunQuota } = require('./weeklyRunAttempts');
const {
  BASE_CHAIN_ID,
  MAX_WALLET_PROFILE_TOKENS,
  RSC_CONTRACT_ADDRESS,
  RSC_PURCHASE_RECIPIENT_ADDRESS,
  WALLET_PURCHASE_ORDER_LIFETIME_MS,
  ZERO_ADDRESS,
  configuredStoreRecipient,
  walletPurchaseSku
} = require('./walletPurchaseCatalog');

const PURCHASE_ORDERS_TABLE = process.env.SUPABASE_WALLET_PURCHASE_ORDERS_TABLE
  || 'scicon_wallet_purchase_orders';
const PURCHASE_ENTITLEMENTS_TABLE = process.env.SUPABASE_WALLET_ENTITLEMENTS_TABLE
  || 'scicon_wallet_entitlements';
const SETTLE_PURCHASE_RPC = process.env.SUPABASE_SETTLE_WALLET_PURCHASE_RPC
  || 'scicon_settle_wallet_purchase';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^0x[0-9a-f]{64}$/i;
const addressPattern = /^0x[0-9a-f]{40}$/i;
const weekIdPattern = /^\d{4}-\d{2}-\d{2}$/;

const transferEventAbi = [{
  type: 'event',
  name: 'Transfer',
  inputs: [
    { name: 'from', type: 'address', indexed: true },
    { name: 'to', type: 'address', indexed: true },
    { name: 'value', type: 'uint256', indexed: false }
  ]
}];

const apiError = (message, statusCode = 400, code = '') => Object.assign(
  new Error(message),
  { statusCode, code, isPublicWalletPurchaseError: true }
);

const isoNow = (now) => new Date(now).toISOString();

const normalizeOrderId = (value) => {
  const orderId = String(value || '').trim().toLowerCase();
  return uuidPattern.test(orderId) ? orderId : null;
};

const normalizeTransactionHash = (value) => {
  const hash = String(value || '').trim().toLowerCase();
  return hashPattern.test(hash) ? hash : null;
};

const normalizePurchaseWalletAddress = (value) => {
  const walletAddress = normalizeWalletAddress(value);
  return walletAddress && walletAddress !== ZERO_ADDRESS ? walletAddress : null;
};

const publicWeeklyRunQuota = (quota) => ({
  weeklyId: quota.weeklyId,
  freeAttempts: quota.freeAttempts,
  purchasedAttempts: quota.purchasedAttempts,
  attemptsUsed: quota.attemptsUsed,
  attemptsRemaining: quota.attemptsRemaining,
  resetAt: quota.resetAt
});

const sanitizedProfileTokenBalance = (value) => (
  Number.isSafeInteger(value)
    && value >= 0
    && value <= MAX_WALLET_PROFILE_TOKENS
    ? value
    : MAX_WALLET_PROFILE_TOKENS
);

const assertWalletPurchaseTokenHeadroom = ({ sku, profile }) => {
  if (!sku || sku.tokenReward <= 0) return;
  const weeklyState = profile?.snapshot?.weeklyState;
  const coins = sanitizedProfileTokenBalance(weeklyState?.coins);
  const durableCoins = sanitizedProfileTokenBalance(weeklyState?.durableCampaignCoins);
  const headroom = Math.min(
    MAX_WALLET_PROFILE_TOKENS - coins,
    MAX_WALLET_PROFILE_TOKENS - durableCoins
  );
  if (headroom >= sku.tokenReward) return;
  const spendRequired = sku.tokenReward - headroom;
  throw apiError(
    `Spend at least ${spendRequired.toLocaleString('en-US')} Tokens before buying this pack so its full reward can be credited.`,
    409,
    'wallet_purchase_token_headroom_required'
  );
};

const assertCanonicalOrderTerms = (order) => {
  const sku = walletPurchaseSku(order?.sku_id);
  const walletAddress = normalizePurchaseWalletAddress(order?.wallet_address);
  const recipientAddress = String(order?.recipient_address || '').toLowerCase();
  const rewardWeeklyId = typeof order?.reward_weekly_id === 'string'
    ? order.reward_weekly_id
    : null;
  const weeklyAttemptReward = Number(order?.weekly_attempt_reward);
  const createdAt = Date.parse(order?.created_at);
  const expiresAt = Date.parse(order?.expires_at);
  let weeklyTermsValid = false;
  if (sku?.weeklyAttemptReward > 0 && weekIdPattern.test(rewardWeeklyId || '')) {
    try {
      const range = getWeekRange(rewardWeeklyId);
      weeklyTermsValid = weeklyAttemptReward === sku.weeklyAttemptReward
        && createdAt >= range.start.getTime() - 30_000
        && createdAt < range.end.getTime()
        && expiresAt <= range.end.getTime();
    } catch {
      weeklyTermsValid = false;
    }
  } else if (sku?.weeklyAttemptReward === 0) {
    weeklyTermsValid = rewardWeeklyId === null && weeklyAttemptReward === 0;
  }
  if (
    !sku
    || !sku.enabled
    || !normalizeOrderId(order?.order_id)
    || !walletAddress
    || Number(order.chain_id) !== BASE_CHAIN_ID
    || String(order.token_address || '').toLowerCase() !== RSC_CONTRACT_ADDRESS
    || !addressPattern.test(recipientAddress)
    || recipientAddress === ZERO_ADDRESS
    || recipientAddress === RSC_CONTRACT_ADDRESS
    || recipientAddress !== RSC_PURCHASE_RECIPIENT_ADDRESS
    || recipientAddress === walletAddress
    || String(order.amount_raw || '') !== sku.rscAmountRaw
    || Number(order.reward_tokens) !== sku.tokenReward
    || Boolean(order.grants_right_support) !== sku.grantsRightSupport
    || !weeklyTermsValid
    || !['quoted', 'fulfilled'].includes(order.status)
    || !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= createdAt
  ) {
    throw apiError(
      'The stored wallet purchase terms failed integrity checks.',
      409,
      'wallet_purchase_terms_invalid'
    );
  }
  return sku;
};

const quoteFromRow = (row) => {
  const sku = assertCanonicalOrderTerms(row);
  return {
    orderId: row.order_id,
    skuId: sku.id,
    walletAddress: row.wallet_address,
    chainId: BASE_CHAIN_ID,
    tokenAddress: RSC_CONTRACT_ADDRESS,
    recipientAddress: String(row.recipient_address || '').toLowerCase(),
    rscAmount: sku.rscAmount,
    rscAmountRaw: sku.rscAmountRaw,
    tokenReward: sku.tokenReward,
    grantsRightSupport: sku.grantsRightSupport,
    weeklyId: row.reward_weekly_id || null,
    weeklyAttemptReward: sku.weeklyAttemptReward,
    expiresAt: row.expires_at
  };
};

const fetchWalletPurchaseOrder = async ({ walletAddress, orderId }) => {
  const rows = await fetchSupabaseJson(
    `${PURCHASE_ORDERS_TABLE}?select=order_id,wallet_address,sku_id,chain_id,token_address,recipient_address,amount_raw,reward_tokens,grants_right_support,reward_weekly_id,weekly_attempt_reward,status,created_at,expires_at,transaction_hash,log_index,fulfilled_at`
      + `&order_id=eq.${encodeURIComponent(orderId)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchQuotedWalletPurchaseOrder = async ({ walletAddress, skuId, weeklyId = null }) => {
  const rows = await fetchSupabaseJson(
    `${PURCHASE_ORDERS_TABLE}?select=*`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&sku_id=eq.${encodeURIComponent(skuId)}`
      + (weeklyId
        ? `&reward_weekly_id=eq.${encodeURIComponent(weeklyId)}`
        : '&reward_weekly_id=is.null')
      + '&status=eq.quoted&limit=1',
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchWalletPurchaseEntitlements = async (walletAddress) => {
  const rows = await fetchSupabaseJson(
    `${PURCHASE_ENTITLEMENTS_TABLE}?select=right_support_unlocked,purchased_tokens_total,purchased_tokens_available`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    rightSupportUnlocked: Boolean(row?.right_support_unlocked),
    purchasedTokensTotal: Math.max(0, Math.floor(Number(row?.purchased_tokens_total) || 0)),
    purchasedTokensAvailable: Math.max(0, Math.floor(Number(row?.purchased_tokens_available) || 0))
  };
};

const getWalletPurchaseStatus = async ({ address, now = Date.now() }) => {
  const walletAddress = normalizePurchaseWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  return {
    weeklyRunQuota: publicWeeklyRunQuota(
      await getWeeklyRunQuota({ address: walletAddress, now })
    )
  };
};

const assertWalletPurchaseNotOwned = ({ sku, profile, entitlements }) => {
  if (
    sku.grantsRightSupport
    && (profile?.snapshot?.weeklyState?.unlockedSlots?.right
      || entitlements?.rightSupportUnlocked)
  ) {
    throw apiError(
      'Right support is already unlocked for this wallet.',
      409,
      'wallet_purchase_already_owned'
    );
  }
};

const reuseQuotedWalletPurchaseOrder = async ({
  walletAddress,
  sku,
  recipientAddress,
  weeklyId,
  resetAtMs,
  now
}) => {
  const order = await fetchQuotedWalletPurchaseOrder({
    walletAddress,
    skuId: sku.id,
    weeklyId
  });
  if (!order) return null;
  const quote = quoteFromRow(order);
  if (quote.recipientAddress !== recipientAddress) {
    throw apiError(
      'The existing wallet purchase quote does not match the configured store.',
      409,
      'wallet_purchase_terms_invalid'
    );
  }
  if (Date.parse(quote.expiresAt) > now) return quote;

  // Reusing one active order keeps interrupted wallet calls recoverable and
  // prevents two tabs from creating competing payable quotes. Week-scoped
  // products never extend beyond their weekly cutoff.
  const expiresAtMs = Math.min(
    now + WALLET_PURCHASE_ORDER_LIFETIME_MS,
    Number.isFinite(resetAtMs) ? resetAtMs : Number.POSITIVE_INFINITY
  );
  if (expiresAtMs <= now) {
    throw apiError('The Weekly Run is resetting. Try again after the new week begins.', 409, 'wallet_purchase_week_resetting');
  }
  const expiresAt = isoNow(expiresAtMs);
  const rows = await fetchSupabaseJson(
    `${PURCHASE_ORDERS_TABLE}?select=*`
      + `&order_id=eq.${encodeURIComponent(order.order_id)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + '&status=eq.quoted',
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        expires_at: expiresAt,
        updated_at: isoNow(now)
      })
    }
  );
  const renewed = Array.isArray(rows) ? rows[0] || null : null;
  return renewed ? quoteFromRow(renewed) : null;
};

const createWalletPurchaseQuote = async ({ address, skuId, now = Date.now() }) => {
  const walletAddress = normalizePurchaseWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  if (walletAddress === RSC_PURCHASE_RECIPIENT_ADDRESS) {
    throw apiError(
      'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to make a purchase.',
      409,
      'wallet_purchase_self_payment_forbidden'
    );
  }
  const sku = walletPurchaseSku(skuId);
  if (!sku) throw apiError('This Research Coin purchase is not available.', 400, 'wallet_purchase_sku_invalid');
  if (!sku.enabled) {
    throw apiError(
      'Token packs are coming soon while the server-authoritative Token economy is completed.',
      409,
      'wallet_purchase_coming_soon'
    );
  }
  const weeklyBoundary = sku.weeklyAttemptReward > 0
    ? getWeeklyBoundaryMeta(new Date(now))
    : null;
  const weeklyId = weeklyBoundary?.weekKey || null;
  const resetAtMs = weeklyBoundary?.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const recipientAddress = configuredStoreRecipient(walletAddress);
  if (!recipientAddress) {
    throw apiError(
      'Research Coin store purchases are not configured yet.',
      503,
      'wallet_purchase_store_not_configured'
    );
  }
  const profile = await ensureWalletProfile(walletAddress, now);
  if (!profile) throw apiError('The wallet profile could not be prepared for this purchase.', 503);
  assertWalletPurchaseTokenHeadroom({ sku, profile });
  if (sku.weeklyAttemptReward > 0) {
    const quota = await getWeeklyRunQuota({ address: walletAddress, now });
    if (quota.attemptsRemaining > 0) {
      throw apiError(
        `Use your ${quota.attemptsRemaining} remaining Weekly Run attempt${quota.attemptsRemaining === 1 ? '' : 's'} before purchasing another.`,
        409,
        'weekly_run_attempts_still_available'
      );
    }
  }
  const entitlements = sku.grantsRightSupport
    ? await fetchWalletPurchaseEntitlements(walletAddress)
    : null;
  assertWalletPurchaseNotOwned({ sku, profile, entitlements });

  const reusableQuote = await reuseQuotedWalletPurchaseOrder({
    walletAddress,
    sku,
    recipientAddress,
    weeklyId,
    resetAtMs,
    now
  });
  if (reusableQuote) return reusableQuote;

  const orderId = crypto.randomUUID();
  const createdAt = isoNow(now);
  const expiresAtMs = Math.min(now + WALLET_PURCHASE_ORDER_LIFETIME_MS, resetAtMs);
  if (expiresAtMs <= now) {
    throw apiError('The Weekly Run is resetting. Try again after the new week begins.', 409, 'wallet_purchase_week_resetting');
  }
  const expiresAt = isoNow(expiresAtMs);
  try {
    const rows = await fetchSupabaseJson(`${PURCHASE_ORDERS_TABLE}?select=*`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        order_id: orderId,
        wallet_address: walletAddress,
        sku_id: sku.id,
        chain_id: BASE_CHAIN_ID,
        token_address: RSC_CONTRACT_ADDRESS,
        recipient_address: recipientAddress,
        amount_raw: sku.rscAmountRaw,
        reward_tokens: sku.tokenReward,
        grants_right_support: sku.grantsRightSupport,
        reward_weekly_id: weeklyId,
        weekly_attempt_reward: sku.weeklyAttemptReward,
        status: 'quoted',
        expires_at: expiresAt,
        created_at: createdAt,
        updated_at: createdAt
      })
    });
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) throw new Error('Wallet purchase order insert returned no row.');
    return quoteFromRow(order);
  } catch (error) {
    // A concurrent quote request can win the unique-order race. Re-check
    // ownership first in case the one permanent order was fulfilled while this
    // request was waiting, then reuse the winner rather than creating another.
    const [latestProfile, latestEntitlements] = await Promise.all([
      fetchWalletProfile(walletAddress, now),
      sku.grantsRightSupport
        ? fetchWalletPurchaseEntitlements(walletAddress)
        : Promise.resolve(null)
    ]);
    assertWalletPurchaseNotOwned({
      sku,
      profile: latestProfile,
      entitlements: latestEntitlements
    });
    assertWalletPurchaseTokenHeadroom({ sku, profile: latestProfile });
    const racedQuote = await reuseQuotedWalletPurchaseOrder({
      walletAddress,
      sku,
      recipientAddress,
      weeklyId,
      resetAtMs,
      now
    });
    if (racedQuote) return racedQuote;
    throw error;
  }
};

const walletPurchasePublicClient = async () => {
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

const verifyWalletPurchaseReceipt = async ({
  order,
  transactionHash,
  publicClient
}) => {
  const sku = assertCanonicalOrderTerms(order);
  const walletAddress = normalizePurchaseWalletAddress(order.wallet_address);
  if (!walletAddress) throw apiError('The wallet purchase owner is invalid.', 409);
  const [chainId, receipt] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getTransactionReceipt({ hash: transactionHash })
  ]);
  if (Number(chainId) !== BASE_CHAIN_ID) {
    throw apiError('The purchase transaction is not on Base mainnet.', 409, 'wallet_purchase_wrong_chain');
  }
  if (receipt.status !== 'success') {
    throw apiError('The Research Coin transfer did not confirm successfully.', 409, 'wallet_purchase_failed');
  }
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
  const quoteCreatedAt = Date.parse(order.created_at);
  const quoteExpiresAt = Date.parse(order.expires_at);
  const paymentBlockTime = Number(block.timestamp) * 1000;
  if (
    !Number.isFinite(quoteCreatedAt)
    || !Number.isFinite(quoteExpiresAt)
    || !Number.isFinite(paymentBlockTime)
    || paymentBlockTime < quoteCreatedAt - 30_000
  ) {
    throw apiError(
      'The Research Coin transfer predates this purchase quote.',
      409,
      'wallet_purchase_transfer_too_old'
    );
  }
  if (paymentBlockTime > quoteExpiresAt) {
    throw apiError(
      'The Research Coin payment was mined after this purchase quote expired.',
      409,
      'wallet_purchase_payment_after_expiry'
    );
  }
  const recipientAddress = String(order.recipient_address || '').toLowerCase();
  const { decodeEventLog } = require('viem');
  const matchingTransfers = (receipt.logs || []).flatMap((log) => {
    if (String(log.address || '').toLowerCase() !== RSC_CONTRACT_ADDRESS) return [];
    try {
      const event = decodeEventLog({
        abi: transferEventAbi,
        data: log.data,
        topics: log.topics
      });
      if (
        event.eventName !== 'Transfer'
        || String(event.args.from || '').toLowerCase() !== walletAddress
        || String(event.args.to || '').toLowerCase() !== recipientAddress
        || BigInt(event.args.value) !== BigInt(sku.rscAmountRaw)
      ) return [];
      return [{ logIndex: Number(log.logIndex) }];
    } catch {
      return [];
    }
  });
  if (matchingTransfers.length !== 1 || !Number.isSafeInteger(matchingTransfers[0].logIndex)) {
    throw apiError(
      'The confirmed transaction did not contain exactly one matching Research Coin payment.',
      409,
      'wallet_purchase_transfer_invalid'
    );
  }
  return {
    transactionHash: transactionHash.toLowerCase(),
    logIndex: matchingTransfers[0].logIndex,
    paymentBlockTime: new Date(paymentBlockTime).toISOString()
  };
};

const settlementFromOrder = async ({ order, duplicate, now = Date.now() }) => {
  const sku = assertCanonicalOrderTerms(order);
  const [profile, entitlements, weeklyRunQuota] = await Promise.all([
    fetchWalletProfile(order.wallet_address),
    fetchWalletPurchaseEntitlements(order.wallet_address),
    getWeeklyRunQuota({ address: order.wallet_address, now })
  ]);
  if (!profile) throw apiError('The updated wallet profile could not be loaded.', 503);
  return {
    accepted: true,
    duplicate,
    orderId: order.order_id,
    skuId: sku.id,
    transactionHash: order.transaction_hash,
    logIndex: Number(order.log_index),
    tokenReward: sku.tokenReward,
    grantsRightSupport: sku.grantsRightSupport,
    weeklyId: order.reward_weekly_id || null,
    weeklyAttemptReward: sku.weeklyAttemptReward,
    weeklyRunQuota: publicWeeklyRunQuota(weeklyRunQuota),
    entitlements,
    profile
  };
};

const settleWalletPurchase = async ({
  address,
  orderId,
  transactionHash,
  now: _now = Date.now(),
  publicClient = null
}) => {
  const walletAddress = normalizePurchaseWalletAddress(address);
  const normalizedOrderId = normalizeOrderId(orderId);
  const normalizedHash = normalizeTransactionHash(transactionHash);
  if (!walletAddress || !normalizedOrderId || !normalizedHash) {
    throw apiError('Valid wallet purchase settlement details are required.', 400);
  }
  let order = await fetchWalletPurchaseOrder({ walletAddress, orderId: normalizedOrderId });
  if (!order) throw apiError('This wallet purchase quote was not found.', 404, 'wallet_purchase_not_found');
  assertCanonicalOrderTerms(order);
  if (order.status === 'fulfilled') {
    if (String(order.transaction_hash || '').toLowerCase() !== normalizedHash) {
      throw apiError('This wallet purchase was already fulfilled by another transaction.', 409, 'wallet_purchase_already_fulfilled');
    }
    return settlementFromOrder({ order, duplicate: true, now: _now });
  }
  if (order.status !== 'quoted') {
    throw apiError('This wallet purchase cannot be settled.', 409, 'wallet_purchase_not_settleable');
  }
  const chainClient = publicClient || await walletPurchasePublicClient();
  const verified = await verifyWalletPurchaseReceipt({
    order,
    transactionHash: normalizedHash,
    publicClient: chainClient
  });
  let result;
  try {
    result = await fetchSupabaseJson(`rpc/${SETTLE_PURCHASE_RPC}`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify({
        p_wallet_address: walletAddress,
        p_order_id: normalizedOrderId,
        p_transaction_hash: verified.transactionHash,
        p_log_index: verified.logIndex,
        p_payment_block_time: verified.paymentBlockTime
      })
    });
  } catch (error) {
    if (/rsc_payment_replayed|wallet_purchase_payment_replayed/i.test(error?.message || '')) {
      throw apiError(
        'This Research Coin transfer has already been claimed.',
        409,
        'wallet_purchase_payment_replayed'
      );
    }
    if (/wallet_purchase_token_headroom_required/i.test(error?.message || '')) {
      throw apiError(
        'Your RSC payment is confirmed, but the full Token reward will not fit yet. Spend Tokens, then press the purchase button again to finish the pending credit.',
        409,
        'wallet_purchase_token_headroom_required'
      );
    }
    throw error;
  }
  const rpcResult = Array.isArray(result) ? result[0] : result;
  if (!rpcResult?.accepted) {
    throw apiError('The wallet purchase could not be applied.', 409, 'wallet_purchase_not_applied');
  }
  order = await fetchWalletPurchaseOrder({ walletAddress, orderId: normalizedOrderId });
  if (!order || order.status !== 'fulfilled') {
    throw apiError('The wallet purchase settled but its receipt could not be loaded.', 503);
  }
  return settlementFromOrder({ order, duplicate: Boolean(rpcResult.duplicate), now: _now });
};

module.exports = {
  PURCHASE_ENTITLEMENTS_TABLE,
  PURCHASE_ORDERS_TABLE,
  SETTLE_PURCHASE_RPC,
  assertCanonicalOrderTerms,
  assertWalletPurchaseTokenHeadroom,
  createWalletPurchaseQuote,
  fetchWalletPurchaseEntitlements,
  fetchWalletPurchaseOrder,
  fetchQuotedWalletPurchaseOrder,
  getWalletPurchaseStatus,
  normalizeOrderId,
  normalizeTransactionHash,
  settleWalletPurchase,
  verifyWalletPurchaseReceipt
};
