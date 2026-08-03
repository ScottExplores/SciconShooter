const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { normalizeWalletAddress } = require('./walletProfileAuth');
const { verifyRunStart } = require('./runReceipts');
const {
  BASE_CHAIN_ID,
  RSC_CONTINUE_RECIPIENT_ADDRESS,
  RSC_CONTRACT_ADDRESS,
  WALLET_PURCHASE_ORDER_LIFETIME_MS,
  ZERO_ADDRESS
} = require('./walletPurchaseCatalog');

const CONTINUE_PAYMENT_ORDERS_TABLE = process.env.SUPABASE_CONTINUE_PAYMENT_ORDERS_TABLE
  || 'scicon_continue_payment_orders';
const SETTLE_CONTINUE_PAYMENT_RPC = process.env.SUPABASE_SETTLE_CONTINUE_PAYMENT_RPC
  || 'scicon_settle_continue_payment';
const CONTINUE_COST_STEP_RSC = 5;
const CONTINUE_COST_STEP_RAW = 5_000_000_000_000_000_000n;
const CONTINUE_LIVES_REWARD = 5;
const MAX_CONTINUE_SEQUENCE = 32_767;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashPattern = /^0x[0-9a-f]{64}$/i;

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
  { statusCode, code, isPublicContinuePaymentError: true }
);

const isoNow = (now) => new Date(now).toISOString();

const normalizeUuid = (value) => {
  const uuid = String(value || '').trim().toLowerCase();
  return uuidPattern.test(uuid) ? uuid : null;
};

const normalizeTransactionHash = (value) => {
  const hash = String(value || '').trim().toLowerCase();
  return hashPattern.test(hash) ? hash : null;
};

const normalizeContinueWalletAddress = (value) => {
  const walletAddress = normalizeWalletAddress(value);
  return walletAddress && walletAddress !== ZERO_ADDRESS ? walletAddress : null;
};

const expectedContinueAmountRaw = (continueSequence) => (
  CONTINUE_COST_STEP_RAW * BigInt(continueSequence)
).toString();

const assertCanonicalContinueOrderTerms = (order) => {
  const orderId = normalizeUuid(order?.order_id);
  const runId = normalizeUuid(order?.run_id);
  const walletAddress = normalizeContinueWalletAddress(order?.wallet_address);
  const continueSequence = Number(order?.continue_sequence);
  const recipientAddress = String(order?.recipient_address || '').trim().toLowerCase();
  const createdAt = Date.parse(order?.created_at);
  const expiresAt = Date.parse(order?.expires_at);
  const fulfilled = order?.status === 'fulfilled';
  if (
    !orderId
    || !runId
    || !walletAddress
    || !Number.isSafeInteger(continueSequence)
    || continueSequence < 1
    || continueSequence > MAX_CONTINUE_SEQUENCE
    || Number(order?.chain_id) !== BASE_CHAIN_ID
    || String(order?.token_address || '').trim().toLowerCase() !== RSC_CONTRACT_ADDRESS
    || recipientAddress !== RSC_CONTINUE_RECIPIENT_ADDRESS
    || recipientAddress === walletAddress
    || String(order?.amount_raw || '') !== expectedContinueAmountRaw(continueSequence)
    || Number(order?.lives_reward) !== CONTINUE_LIVES_REWARD
    || !['quoted', 'fulfilled'].includes(order?.status)
    || !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= createdAt
    || (fulfilled && (
      !normalizeTransactionHash(order?.transaction_hash)
      || !Number.isSafeInteger(Number(order?.log_index))
      || Number(order?.log_index) < 0
      || !Number.isFinite(Date.parse(order?.fulfilled_at))
    ))
    || (!fulfilled && (
      order?.transaction_hash !== null
      || order?.log_index !== null
      || order?.fulfilled_at !== null
    ))
  ) {
    throw apiError(
      'The stored Continue payment terms failed integrity checks.',
      409,
      'continue_payment_terms_invalid'
    );
  }
  return {
    orderId,
    runId,
    walletAddress,
    continueSequence,
    recipientAddress
  };
};

const quoteFromRow = (row) => {
  const terms = assertCanonicalContinueOrderTerms(row);
  return {
    orderId: terms.orderId,
    runId: terms.runId,
    walletAddress: terms.walletAddress,
    continueSequence: terms.continueSequence,
    chainId: BASE_CHAIN_ID,
    tokenAddress: RSC_CONTRACT_ADDRESS,
    recipientAddress: terms.recipientAddress,
    rscAmount: String(terms.continueSequence * CONTINUE_COST_STEP_RSC),
    rscAmountRaw: expectedContinueAmountRaw(terms.continueSequence),
    livesReward: CONTINUE_LIVES_REWARD,
    expiresAt: row.expires_at
  };
};

const eligibleRunStart = ({ startToken, walletAddress }) => {
  let start;
  try {
    start = verifyRunStart(startToken);
  } catch {
    throw apiError(
      'This run can no longer be authorized for a Continue.',
      409,
      'continue_payment_run_invalid'
    );
  }
  const runId = normalizeUuid(start?.runId);
  if (
    !runId
    || start?.runMode !== 'standard'
    || Boolean(start?.testRun)
    || !Number.isFinite(Number(start?.expiresAt))
  ) {
    throw apiError(
      'This run is not eligible for a paid Continue.',
      409,
      'continue_payment_run_ineligible'
    );
  }
  if (
    start?.identity?.kind === 'wallet'
    && normalizeContinueWalletAddress(start.identity.walletAddress) !== walletAddress
  ) {
    throw apiError(
      'This run belongs to a different Base wallet.',
      403,
      'continue_payment_wallet_mismatch'
    );
  }
  return { runId, expiresAtMs: Number(start.expiresAt) };
};

const fetchContinuePaymentOrder = async ({ walletAddress, orderId }) => {
  const rows = await fetchSupabaseJson(
    `${CONTINUE_PAYMENT_ORDERS_TABLE}?select=*`
      + `&order_id=eq.${encodeURIComponent(orderId)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchRunOwnerConflict = async ({ runId, walletAddress }) => {
  const rows = await fetchSupabaseJson(
    `${CONTINUE_PAYMENT_ORDERS_TABLE}?select=order_id,wallet_address`
      + `&run_id=eq.${encodeURIComponent(runId)}`
      + `&wallet_address=neq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchLatestFulfilledContinue = async ({ runId, walletAddress }) => {
  const rows = await fetchSupabaseJson(
    `${CONTINUE_PAYMENT_ORDERS_TABLE}?select=*`
      + `&run_id=eq.${encodeURIComponent(runId)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + '&status=eq.fulfilled&order=continue_sequence.desc&limit=1',
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const fetchQuotedContinue = async ({ runId, walletAddress, continueSequence }) => {
  const rows = await fetchSupabaseJson(
    `${CONTINUE_PAYMENT_ORDERS_TABLE}?select=*`
      + `&run_id=eq.${encodeURIComponent(runId)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + `&continue_sequence=eq.${continueSequence}`
      + '&status=eq.quoted&limit=1',
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] || null : null;
};

const runContinueSequence = async ({ runId, walletAddress }) => {
  const latest = await fetchLatestFulfilledContinue({ runId, walletAddress });
  if (!latest) return 1;
  const terms = assertCanonicalContinueOrderTerms(latest);
  if (terms.runId !== runId || terms.walletAddress !== walletAddress) {
    throw apiError('This run has invalid Continue history.', 409, 'continue_payment_terms_invalid');
  }
  if (terms.continueSequence >= MAX_CONTINUE_SEQUENCE) {
    throw apiError(
      'This run has reached its Continue limit.',
      409,
      'continue_payment_limit_reached'
    );
  }
  return terms.continueSequence + 1;
};

const assertRunPaymentOwner = async ({ runId, walletAddress }) => {
  if (!await fetchRunOwnerConflict({ runId, walletAddress })) return;
  throw apiError(
    'This run is already bound to a different Base wallet.',
    409,
    'continue_payment_run_claimed'
  );
};

const reuseContinuePaymentQuote = async ({
  runId,
  walletAddress,
  continueSequence,
  runExpiresAtMs,
  now
}) => {
  const row = await fetchQuotedContinue({ runId, walletAddress, continueSequence });
  if (!row) return null;
  const quote = quoteFromRow(row);
  if (Date.parse(quote.expiresAt) > now) return quote;
  const expiresAtMs = Math.min(now + WALLET_PURCHASE_ORDER_LIFETIME_MS, runExpiresAtMs);
  if (expiresAtMs <= now) {
    throw apiError(
      'This run expired before the Continue could be prepared.',
      409,
      'continue_payment_run_expired'
    );
  }
  const rows = await fetchSupabaseJson(
    `${CONTINUE_PAYMENT_ORDERS_TABLE}?select=*`
      + `&order_id=eq.${encodeURIComponent(row.order_id)}`
      + `&wallet_address=eq.${encodeURIComponent(walletAddress)}`
      + '&status=eq.quoted',
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        expires_at: isoNow(expiresAtMs),
        updated_at: isoNow(now)
      })
    }
  );
  const renewed = Array.isArray(rows) ? rows[0] || null : null;
  return renewed ? quoteFromRow(renewed) : null;
};

const createContinuePaymentQuote = async ({ address, startToken, now = Date.now() }) => {
  const walletAddress = normalizeContinueWalletAddress(address);
  if (!walletAddress) throw apiError('A valid Base wallet address is required.', 400);
  if (walletAddress === RSC_CONTINUE_RECIPIENT_ADDRESS) {
    throw apiError(
      'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to Continue.',
      409,
      'continue_payment_self_payment_forbidden'
    );
  }
  const { runId, expiresAtMs: runExpiresAtMs } = eligibleRunStart({
    startToken,
    walletAddress
  });
  if (runExpiresAtMs <= now) {
    throw apiError('This run has expired.', 409, 'continue_payment_run_expired');
  }
  await assertRunPaymentOwner({ runId, walletAddress });
  const continueSequence = await runContinueSequence({ runId, walletAddress });
  const reusableQuote = await reuseContinuePaymentQuote({
    runId,
    walletAddress,
    continueSequence,
    runExpiresAtMs,
    now
  });
  if (reusableQuote) return reusableQuote;

  const orderId = crypto.randomUUID();
  const expiresAtMs = Math.min(now + WALLET_PURCHASE_ORDER_LIFETIME_MS, runExpiresAtMs);
  if (expiresAtMs <= now) {
    throw apiError('This run has expired.', 409, 'continue_payment_run_expired');
  }
  const createdAt = isoNow(now);
  try {
    const rows = await fetchSupabaseJson(`${CONTINUE_PAYMENT_ORDERS_TABLE}?select=*`, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        order_id: orderId,
        run_id: runId,
        wallet_address: walletAddress,
        continue_sequence: continueSequence,
        chain_id: BASE_CHAIN_ID,
        token_address: RSC_CONTRACT_ADDRESS,
        recipient_address: RSC_CONTINUE_RECIPIENT_ADDRESS,
        amount_raw: expectedContinueAmountRaw(continueSequence),
        lives_reward: CONTINUE_LIVES_REWARD,
        status: 'quoted',
        expires_at: isoNow(expiresAtMs),
        created_at: createdAt,
        updated_at: createdAt
      })
    });
    const order = Array.isArray(rows) ? rows[0] || null : null;
    if (!order) throw new Error('Continue payment order insert returned no row.');
    return quoteFromRow(order);
  } catch (error) {
    // A second tab can win the unique (run, sequence) insert. Bind the run to
    // that winner and reuse its immutable quote instead of opening two wallet
    // transfers for the same Continue.
    await assertRunPaymentOwner({ runId, walletAddress });
    const racedSequence = await runContinueSequence({ runId, walletAddress });
    const racedQuote = await reuseContinuePaymentQuote({
      runId,
      walletAddress,
      continueSequence: racedSequence,
      runExpiresAtMs,
      now
    });
    if (racedQuote) return racedQuote;
    throw error;
  }
};

const continuePaymentPublicClient = async () => {
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

const verifyContinuePaymentReceipt = async ({ order, transactionHash, publicClient }) => {
  const terms = assertCanonicalContinueOrderTerms(order);
  const [chainId, receipt] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getTransactionReceipt({ hash: transactionHash })
  ]);
  if (Number(chainId) !== BASE_CHAIN_ID) {
    throw apiError('The Continue payment is not on Base mainnet.', 409, 'continue_payment_wrong_chain');
  }
  if (receipt.status !== 'success') {
    throw apiError('The Continue payment did not confirm successfully.', 409, 'continue_payment_failed');
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
      'The Research Coin transfer predates this Continue quote.',
      409,
      'continue_payment_transfer_too_old'
    );
  }
  if (paymentBlockTime > quoteExpiresAt) {
    throw apiError(
      'The Research Coin transfer was mined after this Continue quote expired.',
      409,
      'continue_payment_after_expiry'
    );
  }
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
        || String(event.args.from || '').toLowerCase() !== terms.walletAddress
        || String(event.args.to || '').toLowerCase() !== terms.recipientAddress
        || BigInt(event.args.value) !== BigInt(expectedContinueAmountRaw(terms.continueSequence))
      ) return [];
      return [{ logIndex: Number(log.logIndex) }];
    } catch {
      return [];
    }
  });
  if (matchingTransfers.length !== 1 || !Number.isSafeInteger(matchingTransfers[0].logIndex)) {
    throw apiError(
      'The confirmed transaction did not contain exactly one matching Continue payment.',
      409,
      'continue_payment_transfer_invalid'
    );
  }
  return {
    transactionHash: transactionHash.toLowerCase(),
    logIndex: matchingTransfers[0].logIndex,
    paymentBlockTime: new Date(paymentBlockTime).toISOString()
  };
};

const settlementFromOrder = (order, duplicate) => {
  const terms = assertCanonicalContinueOrderTerms(order);
  if (order.status !== 'fulfilled') {
    throw apiError('The Continue payment is not fulfilled.', 409, 'continue_payment_not_fulfilled');
  }
  return {
    accepted: true,
    duplicate,
    orderId: terms.orderId,
    runId: terms.runId,
    continueSequence: terms.continueSequence,
    livesReward: CONTINUE_LIVES_REWARD,
    rscAmount: String(terms.continueSequence * CONTINUE_COST_STEP_RSC),
    transactionHash: String(order.transaction_hash).toLowerCase(),
    logIndex: Number(order.log_index)
  };
};

const settleContinuePayment = async ({
  address,
  orderId,
  transactionHash,
  publicClient = null
}) => {
  const walletAddress = normalizeContinueWalletAddress(address);
  const normalizedOrderId = normalizeUuid(orderId);
  const normalizedHash = normalizeTransactionHash(transactionHash);
  if (!walletAddress || !normalizedOrderId || !normalizedHash) {
    throw apiError('Valid Continue settlement details are required.', 400);
  }
  let order = await fetchContinuePaymentOrder({ walletAddress, orderId: normalizedOrderId });
  if (!order) {
    throw apiError('This Continue quote was not found.', 404, 'continue_payment_not_found');
  }
  assertCanonicalContinueOrderTerms(order);
  if (order.status === 'fulfilled') {
    if (String(order.transaction_hash || '').toLowerCase() !== normalizedHash) {
      throw apiError(
        'This Continue was already fulfilled by another transaction.',
        409,
        'continue_payment_already_fulfilled'
      );
    }
    return settlementFromOrder(order, true);
  }
  const chainClient = publicClient || await continuePaymentPublicClient();
  const verified = await verifyContinuePaymentReceipt({
    order,
    transactionHash: normalizedHash,
    publicClient: chainClient
  });
  let result;
  try {
    result = await fetchSupabaseJson(`rpc/${SETTLE_CONTINUE_PAYMENT_RPC}`, {
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
    if (/rsc_payment_replayed|continue_payment_replayed/i.test(error?.message || '')) {
      throw apiError(
        'This Research Coin transfer has already been claimed.',
        409,
        'continue_payment_replayed'
      );
    }
    if (/continue_payment_sequence_(?:mismatch|invalid)/i.test(error?.message || '')) {
      throw apiError(
        'This Continue is no longer the next one for the run.',
        409,
        'continue_payment_sequence_mismatch'
      );
    }
    throw error;
  }
  const rpcResult = Array.isArray(result) ? result[0] : result;
  if (!rpcResult?.accepted) {
    throw apiError('The Continue payment could not be applied.', 409, 'continue_payment_not_applied');
  }
  order = await fetchContinuePaymentOrder({ walletAddress, orderId: normalizedOrderId });
  if (!order || order.status !== 'fulfilled') {
    throw apiError('The Continue settled but its receipt could not be loaded.', 503);
  }
  const settlement = settlementFromOrder(order, Boolean(rpcResult.duplicate));
  if (
    String(rpcResult.orderId || '').toLowerCase() !== settlement.orderId
    || String(rpcResult.runId || '').toLowerCase() !== settlement.runId
    || Number(rpcResult.continueSequence) !== settlement.continueSequence
    || Number(rpcResult.livesReward) !== settlement.livesReward
  ) {
    throw apiError(
      'The Continue settlement response failed integrity checks.',
      503,
      'continue_payment_settlement_mismatch'
    );
  }
  return settlement;
};

module.exports = {
  CONTINUE_COST_STEP_RAW,
  CONTINUE_COST_STEP_RSC,
  CONTINUE_LIVES_REWARD,
  CONTINUE_PAYMENT_ORDERS_TABLE,
  SETTLE_CONTINUE_PAYMENT_RPC,
  assertCanonicalContinueOrderTerms,
  createContinuePaymentQuote,
  expectedContinueAmountRaw,
  fetchContinuePaymentOrder,
  normalizeTransactionHash,
  settleContinuePayment,
  verifyContinuePaymentReceipt
};
