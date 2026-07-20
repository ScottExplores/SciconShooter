import './researchHubProposalEligibility.js';

type DateInput = Date | string | number;

interface ResearchHubProposalEligibility {
  isFundingDeadlineAfter: (deadline: DateInput | undefined, requiredOpenUntil: DateInput) => boolean;
}

const eligibility = (globalThis as typeof globalThis & {
  __SCICON_RESEARCHHUB_PROPOSAL_ELIGIBILITY__?: ResearchHubProposalEligibility;
}).__SCICON_RESEARCHHUB_PROPOSAL_ELIGIBILITY__;

if (!eligibility) {
  throw new Error('ResearchHub proposal eligibility failed to initialize.');
}

export const isFundingDeadlineAfter = eligibility.isFundingDeadlineAfter;
