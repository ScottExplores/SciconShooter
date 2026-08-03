import type { Address, Hex } from 'viem';

const PENDING_CONTINUE_VERSION = 1;
const STORAGE_PREFIX = 'scicon_pending_continue_payment_v1:';
const addressPattern = /^0x[0-9a-f]{40}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hexPattern = /^0x[0-9a-f]+$/;

export interface PendingContinuePayment {
  version: typeof PENDING_CONTINUE_VERSION;
  walletAddress: Address;
  runId: string;
  orderId: string;
  continueSequence: number;
  expiresAt: string;
  callsId?: Hex;
  transactionHash?: Hex;
  updatedAt: string;
}

const storage = () => (typeof window === 'undefined' ? null : window.localStorage);
const normalizedAddress = (value: string) => value.trim().toLowerCase() as Address;
const normalizedUuid = (value: string) => value.trim().toLowerCase();
const storageKey = (address: string, runId: string) => (
  `${STORAGE_PREFIX}${normalizedAddress(address)}:${normalizedUuid(runId)}`
);

const isPendingContinuePayment = (value: unknown): value is PendingContinuePayment => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Partial<PendingContinuePayment>;
  return entry.version === PENDING_CONTINUE_VERSION
    && typeof entry.walletAddress === 'string'
    && addressPattern.test(entry.walletAddress)
    && typeof entry.runId === 'string'
    && uuidPattern.test(entry.runId)
    && typeof entry.orderId === 'string'
    && uuidPattern.test(entry.orderId)
    && Number.isSafeInteger(entry.continueSequence)
    && Number(entry.continueSequence) >= 1
    && Number(entry.continueSequence) <= 32_767
    && typeof entry.expiresAt === 'string'
    && Number.isFinite(Date.parse(entry.expiresAt))
    && (entry.callsId === undefined || (typeof entry.callsId === 'string' && hexPattern.test(entry.callsId)))
    && (entry.transactionHash === undefined
      || (typeof entry.transactionHash === 'string' && /^0x[0-9a-f]{64}$/.test(entry.transactionHash)))
    && typeof entry.updatedAt === 'string'
    && Number.isFinite(Date.parse(entry.updatedAt));
};
const write = (pending: PendingContinuePayment) => {
  try {
    storage()?.setItem(
      storageKey(pending.walletAddress, pending.runId),
      JSON.stringify(pending)
    );
  } catch {
    // The server order remains authoritative when storage is unavailable.
  }
  return pending;
};

export const readPendingContinuePayment = (
  address: string,
  runId: string
): PendingContinuePayment | null => {
  const walletAddress = normalizedAddress(address);
  const normalizedRunId = normalizedUuid(runId);
  if (!addressPattern.test(walletAddress) || !uuidPattern.test(normalizedRunId)) return null;
  try {
    const key = storageKey(walletAddress, normalizedRunId);
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isPendingContinuePayment(parsed)
      || parsed.walletAddress !== walletAddress
      || parsed.runId !== normalizedRunId
    ) {
      storage()?.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      storage()?.removeItem(storageKey(walletAddress, normalizedRunId));
    } catch {
      // Treat corrupt recovery metadata as absent.
    }
    return null;
  }
};

export const beginPendingContinuePayment = ({
  walletAddress,
  runId,
  orderId,
  continueSequence,
  expiresAt
}: {
  walletAddress: Address;
  runId: string;
  orderId: string;
  continueSequence: number;
  expiresAt: string;
}) => write({
  version: PENDING_CONTINUE_VERSION,
  walletAddress: normalizedAddress(walletAddress),
  runId: normalizedUuid(runId),
  orderId: normalizedUuid(orderId),
  continueSequence,
  expiresAt,
  updatedAt: new Date().toISOString()
});

export const recordPendingContinueCallsId = (
  walletAddress: Address,
  runId: string,
  orderId: string,
  callsId: Hex
) => {
  const pending = readPendingContinuePayment(walletAddress, runId);
  if (!pending || pending.orderId !== normalizedUuid(orderId)) return null;
  return write({
    ...pending,
    callsId: callsId.toLowerCase() as Hex,
    updatedAt: new Date().toISOString()
  });
};

export const recordPendingContinueHash = (
  walletAddress: Address,
  runId: string,
  orderId: string,
  transactionHash: Hex
) => {
  const pending = readPendingContinuePayment(walletAddress, runId);
  if (!pending || pending.orderId !== normalizedUuid(orderId)) return null;
  return write({
    ...pending,
    transactionHash: transactionHash.toLowerCase() as Hex,
    updatedAt: new Date().toISOString()
  });
};

export const clearPendingContinuePayment = (
  walletAddress: Address,
  runId: string,
  orderId?: string
) => {
  const pending = readPendingContinuePayment(walletAddress, runId);
  if (orderId && pending?.orderId !== normalizedUuid(orderId)) return;
  try {
    storage()?.removeItem(storageKey(walletAddress, runId));
  } catch {
    // Duplicate server settlement remains safe if stale metadata survives.
  }
};
