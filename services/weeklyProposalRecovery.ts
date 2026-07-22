import type { LeaderboardEntry } from '../types';
import type { WalletRunRecord } from './playerRunService';

export interface WeeklyProposalRecovery {
  leader: LeaderboardEntry;
  record: WalletRunRecord;
  needsProposal: boolean;
  canEditProposal: true;
}

interface WeeklyProposalRecoveryInput {
  weeklyLeaderboard: LeaderboardEntry[];
  walletRuns: WalletRunRecord[];
  walletAddress?: string | null;
}

const addressesMatch = (left?: string | null, right?: string | null) => (
  Boolean(left && right) && left?.trim().toLowerCase() === right?.trim().toLowerCase()
);

/**
 * Derive proposal recovery only from a server-returned verified leader and the
 * wallet-bound, server-reissued receipt for that exact run. This is a UI signal
 * only; the leaderboard API independently repeats every check before writing.
 */
export const getWeeklyProposalRecovery = ({
  weeklyLeaderboard,
  walletRuns,
  walletAddress
}: WeeklyProposalRecoveryInput): WeeklyProposalRecovery | null => {
  const leader = weeklyLeaderboard[0];
  if (!leader?.runId || leader.verified !== true) return null;
  if (leader.walletAddress && !addressesMatch(leader.walletAddress, walletAddress)) return null;

  const record = walletRuns.find(({ receipt }) => (
    receipt.runId === leader.runId
    && receipt.integrity === 'server-verified'
    && !receipt.testRun
    && Boolean(receipt.receiptToken)
    && receipt.metrics.score === leader.score
    && receipt.metrics.wave === (leader.wave ?? 1)
  ));
  if (!record) return null;

  return {
    leader,
    record,
    needsProposal: !leader.proposalId,
    canEditProposal: true
  };
};
