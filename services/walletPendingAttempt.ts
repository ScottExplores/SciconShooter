const STORAGE_KEY = 'scicon_wallet_pending_attempt_v1';

export interface StoredPendingWalletAttempt {
  attemptId: string;
  expiresAt: number;
}

const storage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

const parseStoredAttempt = (raw: string | null): StoredPendingWalletAttempt | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPendingWalletAttempt>;
    if (!/^[0-9a-f-]{36}$/i.test(String(parsed.attemptId || ''))) return null;
    if (!Number.isFinite(parsed.expiresAt)) return null;
    return {
      attemptId: String(parsed.attemptId),
      expiresAt: Number(parsed.expiresAt)
    };
  } catch {
    return null;
  }
};

export const readPendingWalletAttempt = (
  now = Date.now()
): StoredPendingWalletAttempt | null => {
  const stored = parseStoredAttempt(storage()?.getItem(STORAGE_KEY) ?? null);
  if (!stored || stored.expiresAt <= now) return null;
  return stored;
};

export const rememberPendingWalletAttempt = (attemptId: string, expiresAt: number) => {
  if (!/^[0-9a-f-]{36}$/i.test(attemptId) || !Number.isFinite(expiresAt)) return;
  storage()?.setItem(STORAGE_KEY, JSON.stringify({ attemptId, expiresAt }));
};

export const clearPendingWalletAttempt = (attemptId?: string | null) => {
  const current = parseStoredAttempt(storage()?.getItem(STORAGE_KEY) ?? null);
  if (attemptId && current && current.attemptId !== attemptId) return;
  storage()?.removeItem(STORAGE_KEY);
};

/**
 * After a prepare conflict, replace the attempt this browser can see.
 * One step only: a second conflict stops instead of chasing a moving slot.
 */
export const recoverPendingWalletAttempt = ({
  triedAttemptId,
  observedAttemptId,
  observedExpired
}: {
  triedAttemptId: string | null;
  observedAttemptId: string | null;
  observedExpired: boolean;
}): { attemptId: string | null } | null => {
  if (observedAttemptId && !observedExpired && observedAttemptId !== triedAttemptId) {
    return { attemptId: observedAttemptId };
  }
  if (!observedAttemptId || observedExpired) return { attemptId: null };
  return null;
};
