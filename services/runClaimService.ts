import type { Address, Hex } from 'viem';
import type { RunReceipt } from './runReceiptService';
import { assertPreviewWritable } from './revamp/preview/previewMode';

const API_URL = '/api/run-claims';

const post = async (payload: Record<string, unknown>) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Run association failed with ${response.status}`);
  return data;
};

export const associateRunWithWallet = async ({
  address,
  receipt,
  signMessage
}: {
  address: Address;
  receipt: RunReceipt;
  signMessage: (address: Address, message: string) => Promise<Hex>;
}) => {
  assertPreviewWritable();
  if (!receipt.receiptToken || receipt.integrity === 'local-unverified') {
    throw new Error('Only a server-verified run can be associated with a wallet.');
  }
  const challenge = await post({
    action: 'challenge',
    address,
    receiptToken: receipt.receiptToken
  });
  const signature = await signMessage(address, challenge.message);
  const result = await post({
    action: 'claim',
    address,
    receiptToken: receipt.receiptToken,
    challengeId: challenge.challengeId,
    signature
  });
  return result.claim as { runId: string; walletAddress: string; claimedAt: string };
};
