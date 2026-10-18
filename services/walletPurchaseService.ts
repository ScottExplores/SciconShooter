import type { Address, Hex } from 'viem';
import {
  DONATION_CONFIG,
  RSC_PURCHASE_SKUS,
  type RscPurchaseSkuId
} from '../constants';
import {
  loadAuthenticatedWalletProfile,
  type WalletProfileRecord
} from './walletProfileService';
import {
  beginPendingWalletPurchase,
  clearPendingWalletPurchase,
  readPendingWalletPurchase,
  recordPendingWalletPurchaseCallsId,
  recordPendingWalletPurchaseHash
} from './walletPurchasePendingStore';

export interface WalletPurchaseQuote {
  orderId: string;
  skuId: RscPurchaseSkuId;
  walletAddress: Address;
  chainId: 8453;
  tokenAddress: Address;
  recipientAddress: Address;
  rscAmount: string;
  rscAmountRaw: string;
  tokenReward: number;
  weeklyAttemptReward: number;
  weeklyId: string | null;
  grantsRightSupport: boolean;
  expiresAt: string;
}

export interface WeeklyRunAttemptQuota {
  weeklyId: string;
  freeAttempts: number;
  purchasedAttempts: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  resetAt: string;
}

export interface WalletPurchaseEntitlements {
  rightSupportUnlocked: boolean;
  purchasedTokensTotal: number;
  purchasedTokensAvailable: number;
}

export interface WalletPurchaseSettlement {
  accepted: true;
  duplicate: boolean;
  orderId: string;
  skuId: RscPurchaseSkuId;
  transactionHash: Hex;
  logIndex: number;
  tokenReward: number;
  weeklyAttemptReward: number;
  grantsRightSupport: boolean;
  entitlements: WalletPurchaseEntitlements;
  weeklyRunQuota: WeeklyRunAttemptQuota | null;
  profile: WalletProfileRecord;
}

export class WalletPurchaseRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'WalletPurchaseRequestError';
    this.status = status;
    this.code = code;
  }
}

const walletPurchaseInProgressError = () => new WalletPurchaseRequestError(
  'This Research Coin purchase is already waiting for wallet confirmation.',
  409,
  'wallet_purchase_in_progress'
);

const requestWalletPurchase = async <T>(body: Record<string, unknown>): Promise<T> => {
  const response = await fetch('/api/wallet-purchases', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WalletPurchaseRequestError(
      payload.error || 'The wallet purchase could not be completed.',
      response.status,
      payload.code || ''
    );
  }
  return payload as T;
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const validQuotedStoreRecipient = (
  value: string,
  walletAddress: Address
): Address | null => {
  const recipient = String(value || '').trim().toLowerCase();
  if (
    !/^0x[0-9a-f]{40}$/.test(recipient)
    || recipient === ZERO_ADDRESS
    || recipient === DONATION_CONFIG.RSC_CONTRACT_ADDRESS.toLowerCase()
    || recipient !== DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()
    || recipient === walletAddress.toLowerCase()
  ) return null;
  return recipient as Address;
};

const assertQuoteMatchesPublishedTerms = (
  quote: WalletPurchaseQuote,
  walletAddress: Address,
  skuId: RscPurchaseSkuId
) => {
  const sku = RSC_PURCHASE_SKUS[skuId];
  const storeRecipient = validQuotedStoreRecipient(
    quote.recipientAddress,
    walletAddress
  );
  if (!sku.enabled) {
    throw new WalletPurchaseRequestError(
      'Token packs are coming soon while the server-authoritative Token economy is completed.',
      409,
      'wallet_purchase_coming_soon'
    );
  }
  if (!storeRecipient) {
    throw new WalletPurchaseRequestError(
      'The purchase quote did not contain a safe Research Coin store address.',
      409,
      'wallet_purchase_quote_mismatch'
    );
  }
  if (
    quote.skuId !== skuId
    || quote.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
    || quote.chainId !== DONATION_CONFIG.BASE_CHAIN_ID
    || quote.tokenAddress.toLowerCase() !== DONATION_CONFIG.RSC_CONTRACT_ADDRESS.toLowerCase()
    || quote.recipientAddress.toLowerCase() !== storeRecipient
    || quote.rscAmountRaw !== sku.rscAmountRaw
    || quote.tokenReward !== sku.tokenReward
    || quote.weeklyAttemptReward !== sku.weeklyAttemptReward
    || (sku.weeklyAttemptReward > 0) !== Boolean(quote.weeklyId)
    || quote.grantsRightSupport !== sku.grantsRightSupport
  ) {
    throw new WalletPurchaseRequestError(
      'The purchase quote did not match the published Research Coin terms.',
      409,
      'wallet_purchase_quote_mismatch'
    );
  }
};

/**
 * Reads the server-owned wallet/week allowance. This is presentation data;
 * admission still happens atomically when the run-start API reserves a slot.
 */
export const loadWeeklyRunAttemptQuota = async (
  walletAddress: Address,
  { interactive = false }: { interactive?: boolean } = {}
): Promise<WeeklyRunAttemptQuota> => {
  if (interactive) {
    await loadAuthenticatedWalletProfile(walletAddress, { interactive: true });
  }
  const response = await requestWalletPurchase<{
    walletAddress: Address;
    weeklyRunQuota: WeeklyRunAttemptQuota;
  }>({ action: 'status' });
  if (response.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new WalletPurchaseRequestError(
      'The Weekly Run quota belongs to a different wallet.',
      409,
      'wallet_purchase_wallet_mismatch'
    );
  }
  return response.weeklyRunQuota;
};

export const createWalletPurchaseQuote = async ({
  walletAddress,
  skuId
}: {
  walletAddress: Address;
  skuId: RscPurchaseSkuId;
}): Promise<WalletPurchaseQuote> => {
  if (walletAddress.toLowerCase() === DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()) {
    throw new WalletPurchaseRequestError(
      'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to make a purchase.',
      409,
      'wallet_purchase_self_payment_forbidden'
    );
  }
  if (!RSC_PURCHASE_SKUS[skuId].enabled) {
    throw new WalletPurchaseRequestError(
      'Token packs are coming soon while the server-authoritative Token economy is completed.',
      409,
      'wallet_purchase_coming_soon'
    );
  }
  await loadAuthenticatedWalletProfile(walletAddress, { interactive: true });
  const response = await requestWalletPurchase<{ quote: WalletPurchaseQuote }>({
    action: 'quote',
    skuId
  });
  assertQuoteMatchesPublishedTerms(response.quote, walletAddress, skuId);
  return response.quote;
};

export const settleWalletPurchase = async ({
  orderId,
  transactionHash
}: {
  orderId: string;
  transactionHash: Hex;
}): Promise<WalletPurchaseSettlement> => {
  const response = await requestWalletPurchase<{ settlement: WalletPurchaseSettlement }>({
    action: 'settle',
    orderId,
    transactionHash
  });
  return response.settlement;
};

export const executeWalletPurchase = async ({
  walletAddress,
  skuId,
  onQuote,
  onBatchSubmitted,
  onSubmitted
}: {
  walletAddress: Address;
  skuId: RscPurchaseSkuId;
  onQuote?: (quote: WalletPurchaseQuote) => void;
  onBatchSubmitted?: (callsId: Hex, quote: WalletPurchaseQuote) => void;
  onSubmitted?: (transactionHash: Hex, quote: WalletPurchaseQuote) => void;
}): Promise<WalletPurchaseSettlement> => {
  const pending = readPendingWalletPurchase(walletAddress);
  if (pending) {
    if (pending.callsId || pending.transactionHash) {
      const resumed = await resumePendingWalletPurchase(walletAddress);
      if (resumed) return resumed;
    }
    if (Date.parse(pending.expiresAt) > Date.now()) {
      throw walletPurchaseInProgressError();
    }
    clearPendingWalletPurchase(walletAddress, pending.orderId);
  }
  const quote = await createWalletPurchaseQuote({ walletAddress, skuId });
  onQuote?.(quote);
  // Re-read after the network round trip. A second tab or handler may have
  // staged this same reusable order while the quote request was in flight.
  const concurrentPending = readPendingWalletPurchase(walletAddress);
  if (concurrentPending) {
    if (concurrentPending.callsId || concurrentPending.transactionHash) {
      const resumed = await resumePendingWalletPurchase(walletAddress);
      if (resumed) return resumed;
    }
    if (Date.parse(concurrentPending.expiresAt) > Date.now()) {
      throw walletPurchaseInProgressError();
    }
    clearPendingWalletPurchase(walletAddress, concurrentPending.orderId);
  }
  beginPendingWalletPurchase({
    walletAddress,
    orderId: quote.orderId,
    skuId,
    expiresAt: quote.expiresAt
  });
  if (Date.parse(quote.expiresAt) <= Date.now()) {
    clearPendingWalletPurchase(walletAddress, quote.orderId);
    throw new WalletPurchaseRequestError(
      'This Research Coin purchase quote expired before the wallet opened.',
      409,
      'wallet_purchase_expired'
    );
  }
  let transactionHash: Hex;
  try {
    // REVAMP(J): Quota reads do not need the wallet SDK; load it only for a payment.
    const { sendRscPurchaseTransfer } = await import('./baseAccountWallet');
    transactionHash = await sendRscPurchaseTransfer({
      from: walletAddress,
      recipient: quote.recipientAddress,
      amountRaw: BigInt(quote.rscAmountRaw),
      onSubmitted: (callsId) => {
        recordPendingWalletPurchaseCallsId(walletAddress, quote.orderId, callsId);
        onBatchSubmitted?.(callsId, quote);
      }
    });
  } catch (error) {
    const submitted = readPendingWalletPurchase(walletAddress);
    if (!submitted?.callsId && !submitted?.transactionHash) {
      clearPendingWalletPurchase(walletAddress, quote.orderId);
    }
    throw error;
  }
  recordPendingWalletPurchaseHash(walletAddress, quote.orderId, transactionHash);
  onSubmitted?.(transactionHash, quote);
  const settlement = await settleWalletPurchase({ orderId: quote.orderId, transactionHash });
  clearPendingWalletPurchase(walletAddress, quote.orderId);
  return settlement;
};

export const resumePendingWalletPurchase = async (
  walletAddress: Address
): Promise<WalletPurchaseSettlement | null> => {
  const pending = readPendingWalletPurchase(walletAddress);
  if (!pending) return null;
  let transactionHash = pending.transactionHash;
  if (!transactionHash && pending.callsId) {
    const { waitForBaseCallsTransaction } = await import('./baseAccountWallet');
    transactionHash = await waitForBaseCallsTransaction(pending.callsId);
    recordPendingWalletPurchaseHash(walletAddress, pending.orderId, transactionHash);
  }
  if (!transactionHash) {
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      clearPendingWalletPurchase(walletAddress, pending.orderId);
    }
    return null;
  }
  const settlement = await settleWalletPurchase({
    orderId: pending.orderId,
    transactionHash
  });
  clearPendingWalletPurchase(walletAddress, pending.orderId);
  return settlement;
};
