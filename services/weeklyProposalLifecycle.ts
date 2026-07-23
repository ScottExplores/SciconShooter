import type { ResearchHubProposal } from './researchHubProposals';
import { getProposalFundingMetrics } from './proposalFunding';

const EXPLICIT_COMPLETION_STATUSES = new Set([
  'complete',
  'completed',
  'funded',
  'fulfilled'
]);

export type WeeklyProposalLifecycle =
  | {
      state: 'missing';
      proposalId: null;
      proposal: null;
    }
  | {
      state: 'active';
      proposalId: string;
      proposal: ResearchHubProposal;
    }
  | {
      state: 'replacement-required';
      reason: 'completed';
      proposalId: string;
      proposal: ResearchHubProposal;
    }
  | {
      state: 'status-unknown';
      proposalId: string;
      proposal: null;
    };

interface WeeklyProposalLifecycleInput {
  selectedProposalId?: string | null;
  referencedProposals: readonly ResearchHubProposal[];
}

export const isProposalExplicitlyCompleted = (proposal: ResearchHubProposal): boolean => {
  const status = proposal.status?.trim().toLowerCase();
  if (status && EXPLICIT_COMPLETION_STATUSES.has(status)) return true;

  const funding = getProposalFundingMetrics(proposal);
  return funding.progressPercent !== null && funding.progressPercent >= 100;
};

/**
 * Resolve the current leader's proposal lifecycle from an exact-ID snapshot.
 *
 * An absent selected proposal is "missing". A selected ID absent from the
 * exact referenced feed is "status-unknown" -- never completed by inference.
 */
export const getWeeklyProposalLifecycle = ({
  selectedProposalId,
  referencedProposals
}: WeeklyProposalLifecycleInput): WeeklyProposalLifecycle => {
  const proposalId = selectedProposalId?.trim();
  if (!proposalId) {
    return {
      state: 'missing',
      proposalId: null,
      proposal: null
    };
  }

  const proposal = referencedProposals.find((entry) => entry.id === proposalId);
  if (!proposal) {
    return {
      state: 'status-unknown',
      proposalId,
      proposal: null
    };
  }

  if (isProposalExplicitlyCompleted(proposal)) {
    return {
      state: 'replacement-required',
      reason: 'completed',
      proposalId,
      proposal
    };
  }

  return {
    state: 'active',
    proposalId,
    proposal
  };
};
