import { encodeFunctionData, type Address, type Hex } from 'viem';
import type { RunReceipt } from './runReceiptService';
import { sciconRecordsAbi } from './sciconRecordsAbi';
import { sendAttributedBaseCalls } from './baseAccountWallet';

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
  const authorization = await postJson('/api/mint-authorization', {
    recordType: 'mission',
    address,
    receiptToken: receipt.receiptToken
  });

  const sponsorGas = Boolean(
    authorization.sponsoredEligible
    && (import.meta.env.VITE_PAYMASTER_PROXY_URL as string | undefined)?.trim()
  );

  const transactionHash = await sendAttributedBaseCalls({
    from: address,
    sponsorGas,
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

  await postJson('/api/mint-records', {
    action: 'confirm',
    recordType: 'mission',
    runId: receipt.runId,
    address,
    transactionHash,
    sponsored: sponsorGas
  });
  return { transactionHash, sponsored: sponsorGas };
};
