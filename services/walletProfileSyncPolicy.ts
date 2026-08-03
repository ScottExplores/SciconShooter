export const WALLET_PROFILE_SYNC_BUSY_MESSAGE =
  'Cloud save is busy. This device save is safe; saving will retry automatically or on your next wallet action.';

export interface WalletProfileSyncErrorLike {
  status?: number;
  code?: string;
}

export interface WalletProfileSyncFailurePolicy {
  status: 'ready' | 'error';
  message: string;
  retryDelayMs: number | null;
}

const isWalletProfileSyncError = (error: unknown): error is WalletProfileSyncErrorLike => (
  typeof error === 'object'
  && error !== null
);

/**
 * Repeated same-device revision churn is recoverable and must not demote an
 * authenticated profile to `error`, because that would disable the autosave
 * which is responsible for retrying the queued local record.
 */
export const getWalletProfileSyncFailurePolicy = (
  error: unknown,
  retryAttempt = 0
): WalletProfileSyncFailurePolicy => {
  if (isWalletProfileSyncError(error) && error.code === 'profile_sync_busy') {
    const safeAttempt = Number.isSafeInteger(retryAttempt)
      ? Math.max(0, retryAttempt)
      : 0;
    return {
      status: 'ready',
      message: WALLET_PROFILE_SYNC_BUSY_MESSAGE,
      retryDelayMs: safeAttempt < 4
        ? Math.min(6_400, 800 * (2 ** safeAttempt))
        : null
    };
  }
  if (isWalletProfileSyncError(error) && error.code === 'profile_conflict') {
    return {
      status: 'error',
      message: 'This wallet changed on both devices. This device save is preserved and was not overwritten.',
      retryDelayMs: null
    };
  }
  if (isWalletProfileSyncError(error) && error.status === 409) {
    return {
      status: 'error',
      message: 'This profile changed on another device. Reconnect this wallet to load its newest save.',
      retryDelayMs: null
    };
  }
  return {
    status: 'error',
    message: 'Your wallet profile is saved on this device, but cloud sync needs to reconnect.',
    retryDelayMs: null
  };
};
