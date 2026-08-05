import type { Address, Hex } from 'viem';
import {
  PLAYER_SHIP_PURCHASE_SKUS,
  type PlayerShipPurchaseSkuId
} from '../constants';

const PENDING_PLAYER_SHIP_PURCHASE_VERSION = 1;
const STORAGE_PREFIX = 'scicon_pending_player_ship_purchase_v1:';
const addressPattern = /^0x[0-9a-f]{40}$/;
const orderIdPattern = /^[a-z0-9][a-z0-9:_-]{7,191}$/i;
const callsIdPattern = /^0x[0-9a-f]+$/;
const transactionHashPattern = /^0x[0-9a-f]{64}$/;

export interface PendingPlayerShipPurchase {
  version: typeof PENDING_PLAYER_SHIP_PURCHASE_VERSION;
  walletAddress: Address;
  orderId: string;
  skuId: PlayerShipPurchaseSkuId;
  quoteToken: string;
  paymentKind: 'native' | 'erc20';
  expiresAt: string;
  callsId?: Hex;
  transactionHash?: Hex;
  updatedAt: string;
}

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const normalizedAddress = (value: string) => value.trim().toLowerCase() as Address;
const storageKey = (address: string) => `${STORAGE_PREFIX}${normalizedAddress(address)}`;

const isPendingPlayerShipPurchase = (value: unknown): value is PendingPlayerShipPurchase => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<PendingPlayerShipPurchase>;
  return entry.version === PENDING_PLAYER_SHIP_PURCHASE_VERSION
    && typeof entry.walletAddress === 'string'
    && addressPattern.test(entry.walletAddress)
    && typeof entry.orderId === 'string'
    && orderIdPattern.test(entry.orderId)
    && typeof entry.skuId === 'string'
    && Object.prototype.hasOwnProperty.call(PLAYER_SHIP_PURCHASE_SKUS, entry.skuId)
    && typeof entry.quoteToken === 'string'
    && entry.quoteToken.length >= 16
    && entry.quoteToken.length <= 8192
    && (entry.paymentKind === 'native' || entry.paymentKind === 'erc20')
    && entry.paymentKind === PLAYER_SHIP_PURCHASE_SKUS[entry.skuId].paymentKind
    && typeof entry.expiresAt === 'string'
    && Number.isFinite(Date.parse(entry.expiresAt))
    && (entry.callsId === undefined
      || (typeof entry.callsId === 'string' && callsIdPattern.test(entry.callsId)))
    && (entry.transactionHash === undefined
      || (typeof entry.transactionHash === 'string' && transactionHashPattern.test(entry.transactionHash)))
    && typeof entry.updatedAt === 'string'
    && Number.isFinite(Date.parse(entry.updatedAt));
};

const write = (pending: PendingPlayerShipPurchase) => {
  try {
    storage()?.setItem(storageKey(pending.walletAddress), JSON.stringify(pending));
  } catch {
    // Recovery metadata is best-effort. The signed quote and server settlement
    // remain authoritative if browser storage is blocked or full.
  }
  return pending;
};

export const readPendingPlayerShipPurchase = (
  address: string
): PendingPlayerShipPurchase | null => {
  const walletAddress = normalizedAddress(address);
  if (!addressPattern.test(walletAddress)) return null;
  try {
    const raw = storage()?.getItem(storageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingPlayerShipPurchase(parsed) || parsed.walletAddress !== walletAddress) {
      storage()?.removeItem(storageKey(walletAddress));
      return null;
    }
    return parsed;
  } catch {
    try {
      storage()?.removeItem(storageKey(walletAddress));
    } catch {
      // Treat corrupt or inaccessible recovery metadata as absent.
    }
    return null;
  }
};

export const beginPendingPlayerShipPurchase = ({
  walletAddress,
  orderId,
  skuId,
  quoteToken,
  paymentKind,
  expiresAt
}: {
  walletAddress: Address;
  orderId: string;
  skuId: PlayerShipPurchaseSkuId;
  quoteToken: string;
  paymentKind: 'native' | 'erc20';
  expiresAt: string;
}) => write({
  version: PENDING_PLAYER_SHIP_PURCHASE_VERSION,
  walletAddress: normalizedAddress(walletAddress),
  orderId: orderId.toLowerCase(),
  skuId,
  quoteToken,
  paymentKind,
  expiresAt,
  updatedAt: new Date().toISOString()
});

export const recordPendingPlayerShipPurchaseCallsId = (
  walletAddress: Address,
  orderId: string,
  callsId: Hex
) => {
  const pending = readPendingPlayerShipPurchase(walletAddress);
  if (!pending || pending.orderId !== orderId.toLowerCase()) return null;
  return write({
    ...pending,
    callsId: callsId.toLowerCase() as Hex,
    updatedAt: new Date().toISOString()
  });
};

export const recordPendingPlayerShipPurchaseHash = (
  walletAddress: Address,
  orderId: string,
  transactionHash: Hex
) => {
  const pending = readPendingPlayerShipPurchase(walletAddress);
  if (!pending || pending.orderId !== orderId.toLowerCase()) return null;
  return write({
    ...pending,
    transactionHash: transactionHash.toLowerCase() as Hex,
    updatedAt: new Date().toISOString()
  });
};

export const clearPendingPlayerShipPurchase = (
  walletAddress: Address,
  orderId?: string
) => {
  const pending = readPendingPlayerShipPurchase(walletAddress);
  if (orderId && pending?.orderId !== orderId.toLowerCase()) return;
  try {
    storage()?.removeItem(storageKey(walletAddress));
  } catch {
    // Settlement is idempotent even if stale recovery metadata cannot clear.
  }
};
