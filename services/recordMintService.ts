import { encodeFunctionData, type Address, type Hex } from 'viem';
import type { RunReceipt } from './runReceiptService';
import { sciconRecordsAbi } from './sciconRecordsAbi';
import { sendAttributedBaseCalls, waitForBaseCallsTransaction } from './baseAccountWallet';

type PendingMissionMint = {
  address: Address;
  callsId: Hex;
  transactionHash?: Hex;
  sponsored?: boolean;
};

const pendingMintKey = (runId: string) => `scicon_pending_mission_mint:${runId}`;

const readPendingMint = (runId: string): PendingMissionMint | null => {
  try {
    const parsed = JSON.parse(localStorage.getItem(pendingMintKey(runId)) || 'null');
    return parsed?.address && parsed?.callsId ? parsed as PendingMissionMint : null;
  } catch {
    return null;
  }
};

const writePendingMint = (runId: string, pending: PendingMissionMint) => {
  try {
    localStorage.setItem(pendingMintKey(runId), JSON.stringify(pending));
  } catch {
    // Storage can be unavailable in embedded browsers; never abort an onchain call after submission.
  }
};

const clearPendingMint = (runId: string) => {
  try {
    localStorage.removeItem(pendingMintKey(runId));
  } catch {
    // The confirmed backend record remains the source of truth.
  }
};

const postJson = async (url: string, payload: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Mint request failed with ${response.status}`);
  return data;
};

export const mintMissionRecord = async ({
  address,
  receipt
}: {
  address: Address;
  receipt: RunReceipt;
}) => {
  const existingPending = readPendingMint(receipt.runId);
  if (existingPending) {
    if (existingPending.address.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Reconnect the Base Account that started this mint.');
    }
    const transactionHash = existingPending.transactionHash
      || await waitForBaseCallsTransaction(existingPending.callsId);
    writePendingMint(receipt.runId, { ...existingPending, transactionHash });
    const confirmation = await postJson('/api/mint-records', {
      action: 'confirm', recordType: 'mission', runId: receipt.runId, address, transactionHash, sponsored: Boolean(existingPending.sponsored)
    });
    clearPendingMint(receipt.runId);
    return { transactionHash, sponsored: Boolean(existingPending.sponsored), tokenId: confirmation.tokenId as string | undefined };
  }

  const authorization = await postJson('/api/mint-authorization', {
    recordType: 'mission',
    address,
    receiptToken: receipt.receiptToken
  });

  if (authorization.alreadyMinted) {
    return {
      transactionHash: authorization.transactionHash as Hex,
      sponsored: Boolean(authorization.sponsored),
      tokenId: authorization.tokenId as string | undefined
    };
  }

  const sponsorGas = Boolean(
    authorization.sponsoredEligible
    && (import.meta.env.VITE_PAYMASTER_PROXY_URL as string | undefined)?.trim()
  );

  const transactionHash = await sendAttributedBaseCalls({
    from: address,
    sponsorGas,
    onSubmitted: (callsId) => writePendingMint(receipt.runId, { address, callsId, sponsored: sponsorGas }),
    calls: [{
      to: authorization.contractAddress as Address,
      value: '0x0',
      data: encodeFunctionData({
        abi: sciconRecordsAbi,
        functionName: 'mintMissionRecord',
        args: [
          authorization.runId as Hex,
          BigInt(authorization.score),
          BigInt(authorization.wave),
          BigInt(authorization.visualSeed),
          authorization.tokenUri,
          BigInt(authorization.expiresAt),
          authorization.signature as Hex
        ]
      })
    }]
  });

  const submitted = readPendingMint(receipt.runId);
  if (submitted) writePendingMint(receipt.runId, { ...submitted, transactionHash });

  const confirmation = await postJson('/api/mint-records', {
    action: 'confirm',
    recordType: 'mission',
    runId: receipt.runId,
    address,
    transactionHash,
    sponsored: sponsorGas
  });
  clearPendingMint(receipt.runId);
  return { transactionHash, sponsored: sponsorGas, tokenId: confirmation.tokenId as string | undefined };
};
