import type { Address, Hex } from 'viem';
import {
  BIO_SHIP_HOLDING_REQUIREMENT,
  DONATION_CONFIG,
  PLAYER_SHIP_PURCHASE_SKUS,
  type PlayerShipPurchaseSkuId
} from '../constants';
import {
  sendCbBtcShipPurchaseTransfer,
  sendEthShipPurchaseTransfer,
  waitForBaseCallsTransaction,
  waitForBaseTransactionReceipt
} from './baseAccountWallet';
import type { PlayerShipId } from './playerShipService';
import {
  loadAuthenticatedWalletProfile,
  type WalletProfileRecord
} from './walletProfileService';
import {
  beginPendingPlayerShipPurchase,
  clearPendingPlayerShipPurchase,
  readPendingPlayerShipPurchase,
  recordPendingPlayerShipPurchaseCallsId,
  recordPendingPlayerShipPurchaseHash
} from './playerShipPurchasePendingStore';

export interface PlayerShipAccessSnapshot {
  bio: boolean;
  eth: boolean;
  btc: boolean;
  bioBalanceRaw: string | null;
  bioBalance: string | null;
  bioThresholdRaw: string;
  campaignMastered: boolean;
  unlockedPlayerShips: PlayerShipId[];
}

export interface PlayerShipPurchaseQuote {
  token: string;
  orderId: string;
  skuId: PlayerShipPurchaseSkuId;
  walletAddress: Address;
  chainId: 8453;
  paymentKind: 'native' | 'erc20';
  tokenAddress: Address | null;
  tokenSymbol: 'ETH' | 'cbBTC';
  recipientAddress: Address;
  amount: string;
  amountRaw: string;
  grantsShipId: 'eth' | 'btc';
  issuedAt: string;
  expiresAt: string;
}

export interface PlayerShipPurchaseSettlement {
  accepted: true;
  duplicate: boolean;
  orderId: string;
  skuId: PlayerShipPurchaseSkuId;
  transactionHash: Hex;
  grantsShipId: 'eth' | 'btc';
  profile: WalletProfileRecord;
  access: PlayerShipAccessSnapshot;
}

export class PlayerShipAccessRequestError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = '') {
    super(message);
    this.name = 'PlayerShipAccessRequestError';
    this.status = status;
    this.code = code;
  }
}

const requestPlayerShipAccess = async <T>(
  body: Record<string, unknown>
): Promise<T> => {
  const response = await fetch('/api/player-ship-access', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PlayerShipAccessRequestError(
      payload.error || 'Player ship access could not be verified.',
      response.status,
      payload.code || ''
    );
  }
  return payload as T;
};

const addressPattern = /^0x[0-9a-f]{40}$/;
const hashPattern = /^0x[0-9a-f]{64}$/;
const orderIdPattern = /^[a-z0-9][a-z0-9:_-]{7,191}$/i;
const allowedShipIds = new Set<PlayerShipId>(['researchhub', 'bio', 'eth', 'btc']);

const assertAccessSnapshot = (value: unknown): PlayerShipAccessSnapshot => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PlayerShipAccessRequestError(
      'The ship access response was invalid.',
      409,
      'player_ship_access_invalid'
    );
  }
  const access = value as Partial<PlayerShipAccessSnapshot>;
  const unlockedPlayerShips = access.unlockedPlayerShips;
  if (
    typeof access.bio !== 'boolean'
    || typeof access.eth !== 'boolean'
    || typeof access.btc !== 'boolean'
    || (access.bioBalanceRaw !== null
      && (typeof access.bioBalanceRaw !== 'string' || !/^\d+$/.test(access.bioBalanceRaw)))
    || (access.bioBalance !== null
      && (typeof access.bioBalance !== 'string' || !/^\d+(?:\.\d+)?$/.test(access.bioBalance)))
    || (access.bioBalanceRaw === null) !== (access.bioBalance === null)
    || access.bioThresholdRaw !== BIO_SHIP_HOLDING_REQUIREMENT.minimumAmountRaw
    || typeof access.campaignMastered !== 'boolean'
    || !Array.isArray(unlockedPlayerShips)
    || unlockedPlayerShips.some((shipId) => !allowedShipIds.has(shipId))
  ) {
    throw new PlayerShipAccessRequestError(
      'The ship access response did not match the published unlock rules.',
      409,
      'player_ship_access_invalid'
    );
  }
  // Prove every raw quantity is losslessly parseable before returning it.
  if (access.bioBalanceRaw !== null) BigInt(access.bioBalanceRaw);
  BigInt(access.bioThresholdRaw);
  return access as PlayerShipAccessSnapshot;
};

/**
 * Reads the server-authoritative access state for this authenticated wallet.
 * `interactive: false` never opens a sign-in popup and is safe at startup or
 * immediately before launching a mission.
 */
export const loadPlayerShipAccess = async (
  walletAddress: Address,
  { interactive = false }: { interactive?: boolean } = {}
): Promise<PlayerShipAccessSnapshot> => {
  // The status endpoint already validates the authenticated, wallet-bound
  // profile cookie. Avoid a second profile GET during startup rehydration.
  if (interactive) {
    await loadAuthenticatedWalletProfile(walletAddress, { interactive: true });
  }
  const response = await requestPlayerShipAccess<{
    walletAddress: Address;
    access: PlayerShipAccessSnapshot;
  }>({ action: 'status' });
  if (response.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new PlayerShipAccessRequestError(
      'The ship access response belongs to a different Base Account.',
      409,
      'player_ship_access_wallet_mismatch'
    );
  }
  return assertAccessSnapshot(response.access);
};

const validQuotedRecipient = (
  recipientAddress: unknown,
  walletAddress: Address
): Address | null => {
  const recipient = String(recipientAddress || '').trim().toLowerCase();
  if (
    !addressPattern.test(recipient)
    || recipient === '0x0000000000000000000000000000000000000000'
    || recipient !== DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()
    || recipient === walletAddress.toLowerCase()
    || recipient === DONATION_CONFIG.BIO_CONTRACT_ADDRESS.toLowerCase()
    || recipient === DONATION_CONFIG.CBBTC_CONTRACT_ADDRESS.toLowerCase()
  ) return null;
  return recipient as Address;
};

export const assertPlayerShipQuoteMatchesPublishedTerms = (
  quote: PlayerShipPurchaseQuote,
  walletAddress: Address,
  skuId: PlayerShipPurchaseSkuId
) => {
  const terms = PLAYER_SHIP_PURCHASE_SKUS[skuId];
  const recipient = validQuotedRecipient(quote?.recipientAddress, walletAddress);
  const issuedAt = Date.parse(quote?.issuedAt || '');
  const expiresAt = Date.parse(quote?.expiresAt || '');
  const expectedTokenAddress = terms.tokenAddress?.toLowerCase() ?? null;
  const quotedTokenAddress = quote?.tokenAddress?.toLowerCase() ?? null;
  if (
    !quote
    || typeof quote.token !== 'string'
    || quote.token.length < 16
    || quote.token.length > 8192
    || typeof quote.orderId !== 'string'
    || !orderIdPattern.test(quote.orderId)
    || quote.skuId !== skuId
    || quote.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()
    || quote.chainId !== DONATION_CONFIG.BASE_CHAIN_ID
    || quote.paymentKind !== terms.paymentKind
    || quotedTokenAddress !== expectedTokenAddress
    || quote.tokenSymbol !== terms.tokenSymbol
    || !recipient
    || quote.recipientAddress.toLowerCase() !== recipient
    || quote.amount !== terms.amount
    || quote.amountRaw !== terms.amountRaw
    || quote.grantsShipId !== terms.grantsShipId
    || !Number.isFinite(issuedAt)
    || !Number.isFinite(expiresAt)
    || expiresAt <= issuedAt
    || expiresAt <= Date.now()
  ) {
    throw new PlayerShipAccessRequestError(
      'The ship purchase quote did not match the published Base terms.',
      409,
      'player_ship_purchase_quote_mismatch'
    );
  }
};

export const createPlayerShipPurchaseQuote = async ({
  walletAddress,
  skuId
}: {
  walletAddress: Address;
  skuId: PlayerShipPurchaseSkuId;
}): Promise<PlayerShipPurchaseQuote> => {
  if (walletAddress.toLowerCase() === DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase()) {
    throw new PlayerShipAccessRequestError(
      'This wallet receives Scicon Shooter payments. Switch to another Base Account to purchase a ship.',
      409,
      'player_ship_purchase_self_payment_forbidden'
    );
  }
  await loadAuthenticatedWalletProfile(walletAddress, { interactive: true });
  const response = await requestPlayerShipAccess<{ quote: PlayerShipPurchaseQuote }>({
    action: 'quote',
    skuId
  });
  assertPlayerShipQuoteMatchesPublishedTerms(response.quote, walletAddress, skuId);
  return response.quote;
};

const assertSettlement = ({
  settlement,
  walletAddress,
  skuId,
  orderId,
  transactionHash
}: {
  settlement: PlayerShipPurchaseSettlement;
  walletAddress: Address;
  skuId: PlayerShipPurchaseSkuId;
  orderId: string;
  transactionHash: Hex;
}) => {
  const access = assertAccessSnapshot(settlement?.access);
  if (
    settlement?.accepted !== true
    || typeof settlement.duplicate !== 'boolean'
    || settlement.orderId !== orderId
    || settlement.skuId !== skuId
    || settlement.transactionHash?.toLowerCase() !== transactionHash.toLowerCase()
    || !hashPattern.test(settlement.transactionHash?.toLowerCase() || '')
    || settlement.grantsShipId !== PLAYER_SHIP_PURCHASE_SKUS[skuId].grantsShipId
    || settlement.profile?.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()
    || settlement.profile?.profileId !== `wallet:${walletAddress.toLowerCase()}`
    || !Number.isSafeInteger(settlement.profile?.revision)
    || !settlement.profile?.snapshot
  ) {
    throw new PlayerShipAccessRequestError(
      'The ship purchase settlement returned invalid wallet state.',
      409,
      'player_ship_purchase_settlement_invalid'
    );
  }
  return { ...settlement, access };
};

export const settlePlayerShipPurchase = async ({
  walletAddress,
  quoteToken,
  orderId,
  skuId,
  transactionHash
}: {
  walletAddress: Address;
  quoteToken: string;
  orderId: string;
  skuId: PlayerShipPurchaseSkuId;
  transactionHash: Hex;
}): Promise<PlayerShipPurchaseSettlement> => {
  const response = await requestPlayerShipAccess<{
    settlement: PlayerShipPurchaseSettlement;
  }>({
    action: 'settle',
    quoteToken,
    transactionHash
  });
  return assertSettlement({
    settlement: response.settlement,
    walletAddress,
    skuId,
    orderId,
    transactionHash
  });
};

const purchaseInProgressError = () => new PlayerShipAccessRequestError(
  'A ship purchase is already waiting for Base Account confirmation.',
  409,
  'player_ship_purchase_in_progress'
);

export const executePlayerShipPurchase = async ({
  walletAddress,
  skuId,
  onQuote,
  onBatchSubmitted,
  onSubmitted
}: {
  walletAddress: Address;
  skuId: PlayerShipPurchaseSkuId;
  onQuote?: (quote: PlayerShipPurchaseQuote) => void;
  onBatchSubmitted?: (callsId: Hex, quote: PlayerShipPurchaseQuote) => void;
  onSubmitted?: (transactionHash: Hex, quote: PlayerShipPurchaseQuote) => void;
}): Promise<PlayerShipPurchaseSettlement> => {
  const pending = readPendingPlayerShipPurchase(walletAddress);
  if (pending) {
    if (pending.callsId || pending.transactionHash) {
      const resumed = await resumePendingPlayerShipPurchase(walletAddress);
      if (resumed) return resumed;
    }
    if (Date.parse(pending.expiresAt) > Date.now()) throw purchaseInProgressError();
    clearPendingPlayerShipPurchase(walletAddress, pending.orderId);
  }

  const quote = await createPlayerShipPurchaseQuote({ walletAddress, skuId });
  onQuote?.(quote);

  const concurrentPending = readPendingPlayerShipPurchase(walletAddress);
  if (concurrentPending) {
    if (concurrentPending.callsId || concurrentPending.transactionHash) {
      const resumed = await resumePendingPlayerShipPurchase(walletAddress);
      if (resumed) return resumed;
    }
    if (Date.parse(concurrentPending.expiresAt) > Date.now()) throw purchaseInProgressError();
    clearPendingPlayerShipPurchase(walletAddress, concurrentPending.orderId);
  }

  beginPendingPlayerShipPurchase({
    walletAddress,
    orderId: quote.orderId,
    skuId,
    quoteToken: quote.token,
    paymentKind: quote.paymentKind,
    expiresAt: quote.expiresAt
  });

  let transactionHash: Hex;
  try {
    if (quote.paymentKind === 'native') {
      transactionHash = await sendEthShipPurchaseTransfer({
        from: walletAddress,
        recipient: quote.recipientAddress,
        amountRaw: BigInt(quote.amountRaw),
        onSubmitted: (callsId) => {
          recordPendingPlayerShipPurchaseCallsId(walletAddress, quote.orderId, callsId);
          onBatchSubmitted?.(callsId, quote);
        }
      });
      recordPendingPlayerShipPurchaseHash(walletAddress, quote.orderId, transactionHash);
      onSubmitted?.(transactionHash, quote);
    } else {
      transactionHash = await sendCbBtcShipPurchaseTransfer({
        from: walletAddress,
        recipient: quote.recipientAddress,
        amountRaw: BigInt(quote.amountRaw),
        onSubmitted: (callsId) => {
          recordPendingPlayerShipPurchaseCallsId(walletAddress, quote.orderId, callsId);
          onBatchSubmitted?.(callsId, quote);
        }
      });
      recordPendingPlayerShipPurchaseHash(walletAddress, quote.orderId, transactionHash);
      onSubmitted?.(transactionHash, quote);
    }
  } catch (error) {
    const submitted = readPendingPlayerShipPurchase(walletAddress);
    if (!submitted?.callsId && !submitted?.transactionHash) {
      clearPendingPlayerShipPurchase(walletAddress, quote.orderId);
    }
    throw error;
  }

  const settlement = await settlePlayerShipPurchase({
    walletAddress,
    quoteToken: quote.token,
    orderId: quote.orderId,
    skuId,
    transactionHash
  });
  clearPendingPlayerShipPurchase(walletAddress, quote.orderId);
  return settlement;
};

export const resumePendingPlayerShipPurchase = async (
  walletAddress: Address
): Promise<PlayerShipPurchaseSettlement | null> => {
  const pending = readPendingPlayerShipPurchase(walletAddress);
  if (!pending) return null;
  let transactionHash = pending.transactionHash;
  if (!transactionHash && pending.callsId) {
    transactionHash = await waitForBaseCallsTransaction(pending.callsId);
    recordPendingPlayerShipPurchaseHash(walletAddress, pending.orderId, transactionHash);
  }
  if (!transactionHash) {
    if (Date.parse(pending.expiresAt) <= Date.now()) {
      clearPendingPlayerShipPurchase(walletAddress, pending.orderId);
    }
    return null;
  }
  if (pending.paymentKind === 'native') {
    await waitForBaseTransactionReceipt(transactionHash);
  }
  const settlement = await settlePlayerShipPurchase({
    walletAddress,
    quoteToken: pending.quoteToken,
    orderId: pending.orderId,
    skuId: pending.skuId,
    transactionHash
  });
  clearPendingPlayerShipPurchase(walletAddress, pending.orderId);
  return settlement;
};
