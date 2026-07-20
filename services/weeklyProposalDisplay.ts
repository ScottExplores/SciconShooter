import type { ArchivedWinner, LeaderboardEntry } from '../types';
import type { ResearchHubProposal } from './researchHubProposals';

type ProposalSelection = Pick<
  LeaderboardEntry | ArchivedWinner,
  'proposalId' | 'proposalTitle' | 'proposalUrl' | 'proposalAuthor' | 'proposalImageUrl'
>;

export interface ResolvedProposalSelection {
  id: string;
  title: string;
  url?: string;
  author?: string;
  imageUrl?: string;
  liveProposal?: ResearchHubProposal;
}

const safeImageUrl = (value?: string) => (
  value && /^https?:\/\//i.test(value) ? value : undefined
);

/**
 * Resolve presentation data only from the selected proposal snapshot or an
 * exact live-feed ID match. Proposal list position is never a valid fallback.
 */
export const resolveProposalSelection = (
  selection: ProposalSelection | null | undefined,
  proposals: ResearchHubProposal[]
): ResolvedProposalSelection | null => {
  const proposalId = selection?.proposalId?.trim();
  const proposalTitle = selection?.proposalTitle?.trim();
  if (!proposalId || !proposalTitle) return null;

  const liveProposal = proposals.find((proposal) => proposal.id === proposalId);
  return {
    id: proposalId,
    title: proposalTitle,
    url: selection?.proposalUrl || liveProposal?.url,
    author: selection?.proposalAuthor || liveProposal?.author,
    imageUrl: safeImageUrl(selection?.proposalImageUrl) || safeImageUrl(liveProposal?.imageUrl),
    liveProposal
  };
};
