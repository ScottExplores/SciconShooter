import type { Address, Hex } from 'viem';
import { RSC_PURCHASE_SKUS, type RscPurchaseSkuId } from '../constants';

const PENDING_PURCHASE_VERSION = 1;
const STORAGE_PREFIX = 'scicon_pending_wallet_purchase_v1:';
const addressPattern = /^0x[0-9a-f]{40}$/;
const orderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hexPattern = /^0x[0-9a-f]+$/;

export interface PendingWalletPurchase {
  version: typeof PENDING_PURCHASE_VERSION;
  walletAddress: Address;
  orderId: string;
  skuId: RscPurchaseSkuId;
  expiresAt: string;
  callsId?: Hex;
  transactionHash?: Hex;
  updatedAt: string;
}

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const normalizedAddress = (value: string) => value.trim().toLowerCase() as Address;
const storageKey = (address: string) => `${STORAGE_PREFIX}${normalizedAddress(address)}`;

const isPendingWalletPurchase = (value: unknown): value is PendingWalletPurchase => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<PendingWalletPurchase>;
  return entry.version === PENDING_PURCHASE_VERSION
    && typeof entry.walletAddress === 'string'
    && addressPattern.test(entry.walletAddress)
    && typeof entry.orderId === 'string'
    && orderIdPattern.test(entry.orderId)
    && typeof entry.skuId === 'string'
    && Object.prototype.hasOwnProperty.call(RSC_PURCHASE_SKUS, entry.skuId)
    && typeof entry.expiresAt === 'string'
    && Number.isFinite(Date.parse(entry.expiresAt))
    && (entry.callsId === undefined || (typeof entry.callsId === 'string' && hexPattern.test(entry.callsId)))
    && (entry.transactionHash === undefined
      || (typeof entry.transactionHash === 'string' && /^0x[0-9a-f]{64}$/.test(entry.transactionHash)))
    && typeof entry.updatedAt === 'string'
    && Number.isFinite(Date.parse(entry.updatedAt));
};

const write = (pending: PendingWalletPurchase) => {
  try {
    storage()?.setItem(storageKey(pending.walletAddress), JSON.stringify(pending));
  } catch {
    // The server order remains authoritative. Recovery is best-effort when a
    // browser blocks or exhausts local storage.
  }
  return pending;
};

export const readPendingWalletPurchase = (address: string): PendingWalletPurchase | null => {
  const walletAddress = normalizedAddress(address);
  if (!addressPattern.test(walletAddress)) return null;
  try {
    const raw = storage()?.getItem(storageKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPendingWalletPurchase(parsed) || parsed.walletAddress !== walletAddress) {
      storage()?.removeItem(storageKey(walletAddress));
      return null;
    }
    return parsed;
  } catch {
    try {
      storage()?.removeItem(storageKey(walletAddress));
    } catch {
      // Treat corrupt recovery metadata as absent when storage is unavailable.
    }
    return null;
  }
};

export const beginPendingWalletPurchase = ({
  walletAddress,
  orderId,
  skuId,
  expiresAt
}: {
  walletAddress: Address;
  orderId: string;
  skuId: RscPurchaseSkuId;
  expiresAt: string;
}) => write({
  version: PENDING_PURCHASE_VERSION,
  walletAddress: normalizedAddress(walletAddress),
  orderId: orderId.toLowerCase(),
  skuId,
  expiresAt,
  updatedAt: new Date().toISOString()
});

export const recordPendingWalletPurchaseCallsId = (
  walletAddress: Address,
  orderId: string,
  callsId: Hex
) => {
  const pending = readPendingWalletPurchase(walletAddress);
  if (!pending || pending.orderId !== orderId.toLowerCase()) return null;
  return write({ ...pending, callsId: callsId.toLowerCase() as Hex, updatedAt: new Date().toISOString() });
};

export const recordPendingWalletPurchaseHash = (
  walletAddress: Address,
  orderId: string,
  transactionHash: Hex
) => {
  const pending = readPendingWalletPurchase(walletAddress);
  if (!pending || pending.orderId !== orderId.toLowerCase()) return null;
  return write({
    ...pending,
    transactionHash: transactionHash.toLowerCase() as Hex,
    updatedAt: new Date().toISOString()
  });
};

export const clearPendingWalletPurchase = (walletAddress: Address, orderId?: string) => {
  const pending = readPendingWalletPurchase(walletAddress);
  if (orderId && pending?.orderId !== orderId.toLowerCase()) return;
  try {
    storage()?.removeItem(storageKey(walletAddress));
  } catch {
    // A duplicate settlement remains safe even when stale recovery metadata
    // cannot be removed.
  }
};
