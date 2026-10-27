import type { Address, Hex } from 'viem';
import type { ResearchHubProposal } from './researchHubProposals';

const post = async (payload: Record<string, unknown>) => {
  const response = await fetch('/api/weekly-claim', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Champion claim failed with ${response.status}`);
  return data;
};

export const claimWeeklyChampionProposal = async ({
  weekKey,
  proposal,
  address,
  signMessage
}: {
  weekKey: string;
  proposal: ResearchHubProposal;
  address: Address;
  signMessage: (address: Address, message: string) => Promise<Hex>;
}) => {
  const targetKind = proposal.fundingTargetKind === 'rfp' ? 'rfp' : undefined;
  const challenge = await post({
    action: 'challenge',
    weekKey,
    proposalId: proposal.id,
    address,
    ...(targetKind ? { targetKind } : {})
  });
  const signature = await signMessage(address, challenge.message);
  const result = await post({
    action: 'claim',
    weekKey,
    proposalId: proposal.id,
    address,
    challengeId: challenge.challengeId,
    signature,
    ...(targetKind ? { targetKind } : {})
  });
  return result.claim;
};
