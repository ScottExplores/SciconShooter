import React from 'react';
import type { ResearchHubProposal } from '../services/researchHubProposals';
import PrizeWinnerFlow from './PrizeWinnerFlow';
import { getPublicPrizeState } from '../shared/weeklyCompetitionBoundary.browser';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type ProposalSelectionStatus = 'idle' | 'saving' | 'confirmed' | 'error';

interface WeeklyProposalSelectionProps {
  pilotName: string;
  score: number;
  allocationRsc?: number;
  proposals: ResearchHubProposal[];
  proposalStatus: ProposalFeedStatus;
  selectionStatus: ProposalSelectionStatus;
  selectionMessage?: string;
  initialProposalId?: string | null;
  dismissible?: boolean;
  onConfirm: (proposal: ResearchHubProposal) => void;
  onProposalChange?: () => void;
  onRetry: () => void;
  onClose?: () => void;
}

const WeeklyProposalSelection: React.FC<WeeklyProposalSelectionProps> = ({
  pilotName,
  score,
  allocationRsc = getPublicPrizeState().allocationRsc,
  proposals,
  proposalStatus,
  selectionStatus,
  selectionMessage = '',
  initialProposalId = null,
  dismissible = true,
  onConfirm,
  onProposalChange,
  onRetry,
  onClose
}) => (
  <PrizeWinnerFlow
    pilotName={pilotName}
    score={score}
    allocationRsc={allocationRsc}
    proposals={proposals}
    proposalStatus={proposalStatus}
    selectionStatus={selectionStatus}
    selectionMessage={selectionMessage}
    initialProposalId={initialProposalId}
    dismissible={dismissible}
    onRetryProposals={onRetry}
    onClose={onClose}
    onConfirm={(target) => {
      onProposalChange?.();
      if (target.kind === 'proposal' && target.proposal) {
        onConfirm(target.proposal);
        return;
      }
      if (target.kind === 'rfp' && target.rfp) {
        onConfirm({
          id: target.rfp.id,
          title: target.rfp.title,
          author: target.rfp.organization,
          url: target.rfp.url,
          endDate: target.rfp.endDate,
          status: target.rfp.status,
          backers: 0,
          votes: 0,
          comments: 0,
          requestedUsd: target.rfp.goalUsd ?? undefined,
          requestedRsc: target.rfp.goalRsc ?? undefined,
          raisedRsc: target.rfp.raisedRsc ?? undefined,
          imageUrl: target.rfp.imageUrl || undefined,
          fundingTargetKind: 'rfp'
        });
      }
    }}
  />
);

export default WeeklyProposalSelection;
