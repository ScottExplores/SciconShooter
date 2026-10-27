import type { ArchivedWinner, LeaderboardEntry } from '../types';
import type { RunReceipt } from './runReceiptService';
import { PRIZE_EVENT_ALLOCATION_RSC } from '../shared/weeklyCompetitionBoundary.browser';

export type MissionRecordFundingStatus = 'current-leader' | 'claimable' | 'selected';

export interface MissionRecordWeeklyFunding {
  status: MissionRecordFundingStatus;
  allocationRsc: number;
  canEditProposal?: boolean;
  winner?: ArchivedWinner;
  proposalId?: string;
  proposalTitle?: string;
  proposalUrl?: string;
  proposalAuthor?: string;
}

interface MissionRecordWeeklyFundingInput {
  receipt: RunReceipt;
  pilotName: string;
  weeklyLeaderboard: LeaderboardEntry[];
  archivedWinners: ArchivedWinner[];
  now?: number;
}

const namesMatch = (left?: string, right?: string) => (
  String(left || '').trim().toUpperCase() === String(right || '').trim().toUpperCase()
);

const winnerMatchesRun = (winner: ArchivedWinner, receipt: RunReceipt, pilotName: string) => {
  if (winner.winnerRunId && winner.winnerRunId === receipt.runId) return true;
  if (winner.winnerRunId) return false;
  return winner.score === receipt.metrics.score
    && winner.wave === receipt.metrics.wave
    && namesMatch(winner.winnerName, pilotName);
};

const leaderMatchesRun = (leader: LeaderboardEntry | undefined, receipt: RunReceipt, pilotName: string) => {
  if (!leader) return false;
  if (leader.runId && leader.runId === receipt.runId) return true;
  if (leader.runId) return false;
  return leader.score === receipt.metrics.score
    && (leader.wave ?? 1) === receipt.metrics.wave
    && namesMatch(leader.name, pilotName);
};

export const getMissionRecordWeeklyFunding = ({
  receipt,
  pilotName,
  weeklyLeaderboard,
  archivedWinners,
  now = Date.now()
}: MissionRecordWeeklyFundingInput): MissionRecordWeeklyFunding | null => {
  if (receipt.testRun) return null;

  const archivedWinner = archivedWinners.find((winner) => winnerMatchesRun(winner, receipt, pilotName));
  if (archivedWinner?.status === 'claimed' || archivedWinner?.status === 'funded') {
    return {
      status: 'selected',
      allocationRsc: archivedWinner.allocationRsc ?? 100,
      winner: archivedWinner,
      proposalId: archivedWinner.proposalId,
      proposalTitle: archivedWinner.proposalTitle,
      proposalUrl: archivedWinner.proposalUrl,
      proposalAuthor: archivedWinner.proposalAuthor
    };
  }

  const claimWindowOpen = archivedWinner?.status === 'finalized'
    && (!archivedWinner.claimDeadline || new Date(archivedWinner.claimDeadline).getTime() > now);
  if (claimWindowOpen) {
    return {
      status: 'claimable',
      allocationRsc: archivedWinner.allocationRsc ?? 100,
      winner: archivedWinner
    };
  }

  const currentLeader = weeklyLeaderboard[0];
  if (leaderMatchesRun(currentLeader, receipt, pilotName)) {
    if (currentLeader?.proposalId && currentLeader.proposalTitle) {
      return {
        status: 'selected',
        allocationRsc: PRIZE_EVENT_ALLOCATION_RSC,
        canEditProposal: true,
        proposalId: currentLeader.proposalId,
        proposalTitle: currentLeader.proposalTitle,
        proposalUrl: currentLeader.proposalUrl,
        proposalAuthor: currentLeader.proposalAuthor
      };
    }
    return {
      status: 'current-leader',
      allocationRsc: PRIZE_EVENT_ALLOCATION_RSC
    };
  }

  return null;
};
