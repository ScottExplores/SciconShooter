import type { LeaderboardEntry } from '../types';
import type { WalletRunRecord } from './playerRunService';
import type { WeeklyProposalLifecycle } from './weeklyProposalLifecycle';
import {
  getWeeklyProposalReminderStorageKey,
  type WeeklyProposalReminderReason
} from './weeklyProposalReminder';

export interface WeeklyProposalRecovery {
  leader: LeaderboardEntry;
  record: WalletRunRecord;
  needsProposal: boolean;
  attentionReason: WeeklyProposalReminderReason | null;
  reminderStorageKey: string | null;
  canEditProposal: boolean;
}

type PickEligibility = 'unknown' | 'open' | 'closed';

interface WeeklyProposalRecoveryInput {
  weeklyLeaderboard: LeaderboardEntry[];
  walletRuns: WalletRunRecord[];
  walletAddress?: string | null;
  proposalLifecycle?: WeeklyProposalLifecycle | null;
  pickEligibility?: PickEligibility | null;
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
  walletAddress,
  pickEligibility = 'unknown'
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

  const selectedProposalId = leader.proposalId?.trim();
  // Outside the event, a stored pick stays final. During the event, a pick
  // that the eligible feeds no longer contain can be replaced.
  const pickClosed = pickEligibility === 'closed' && Boolean(selectedProposalId);
  const attentionReason: WeeklyProposalReminderReason | null = pickClosed
    ? 'closed'
    : selectedProposalId
      ? null
      : 'missing';
  const reminderStorageKey = getWeeklyProposalReminderStorageKey({
    runId: leader.runId,
    reason: attentionReason,
    proposalId: pickClosed ? selectedProposalId : null
  });

  return {
    leader,
    record,
    needsProposal: attentionReason !== null,
    attentionReason,
    reminderStorageKey,
    canEditProposal: !selectedProposalId || pickClosed
  };
};
