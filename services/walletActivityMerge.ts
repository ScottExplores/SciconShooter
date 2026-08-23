import type { MintRecord } from '../types';
import type { WalletRunRecord } from './playerRunService';

export interface WalletActivityValue {
  records: MintRecord[];
  runs: WalletRunRecord[];
}

export interface WalletActivityMergeResult extends WalletActivityValue {
  expectedRunObserved: boolean;
  expectedMintObserved: boolean;
}

export interface MintIndexRetryStep {
  exhausted: boolean;
  retries: number;
  delayMs: number | null;
}

export type WalletActivityViewState =
  | 'disconnected'
  | 'loading'
  | 'initial-error'
  | 'empty'
  | 'ready'
  | 'stale';

export const getWalletActivityViewState = ({
  connected,
  loading,
  hasError,
  runCount
}: {
  connected: boolean;
  loading: boolean;
  hasError: boolean;
  runCount: number;
}): WalletActivityViewState => {
  if (!connected) return 'disconnected';
  if (hasError && runCount <= 0) return 'initial-error';
  if (loading && runCount <= 0) return 'loading';
  if (runCount <= 0) return 'empty';
  return hasError ? 'stale' : 'ready';
};

/**
 * Bound the eventual-consistency grace period used after a successful mint.
 * Once the retry budget is spent, callers must release the optimistic record
 * snapshot and accept the next authoritative response instead of freezing it
 * forever.
 */
export const advanceMintIndexRetry = (
  retries: number,
  maxRetries = 3,
  baseDelayMs = 750
): MintIndexRetryStep => {
  const safeRetries = Math.max(0, Math.floor(retries));
  const safeMaxRetries = Math.max(0, Math.floor(maxRetries));
  if (safeRetries >= safeMaxRetries) {
    return {
      exhausted: true,
      retries: safeRetries,
      delayMs: null
    };
  }

  const nextRetries = safeRetries + 1;
  return {
    exhausted: false,
    retries: nextRetries,
    delayMs: nextRetries * Math.max(0, Math.floor(baseDelayMs))
  };
};

/**
 * Reconcile an authoritative local mutation with eventually-consistent history
 * endpoints. A confirmed score stays visible until its run appears remotely;
 * a mint refresh cannot erase older records while the new token is indexing.
 */
export const mergeWalletActivity = ({
  current,
  records,
  runs,
  expectedRun = null,
  expectedMintRunId = null
}: {
  current: WalletActivityValue | null;
  records: MintRecord[];
  runs: WalletRunRecord[];
  expectedRun?: WalletRunRecord | null;
  expectedMintRunId?: string | null;
}): WalletActivityMergeResult => {
  const expectedRunObserved = Boolean(expectedRun && runs.some((run) => (
    run.receipt.runId === expectedRun.receipt.runId
  )));
  const stableRuns = expectedRun && !expectedRunObserved
    ? [expectedRun, ...runs.filter((run) => (
        run.receipt.runId !== expectedRun.receipt.runId
      ))].slice(0, 5)
    : runs;
  const expectedMintObserved = Boolean(expectedMintRunId && records.some((record) => (
    record.runId === expectedMintRunId && record.status === 'confirmed'
  )));
  const stableRecords = expectedMintRunId && !expectedMintObserved
    ? current?.records ?? []
    : records;

  return {
    records: stableRecords,
    runs: stableRuns,
    expectedRunObserved,
    expectedMintObserved
  };
};
