import { ASSETS } from '../constants';
import type { MintRecord } from '../types';

export type PlayerShipId = 'researchhub' | 'bio';

export const PLAYER_SHIPS: Readonly<Record<PlayerShipId, {
  id: PlayerShipId;
  name: string;
  assetUrl: string;
}>> = Object.freeze({
  researchhub: {
    id: 'researchhub',
    name: 'ResearchHub ship',
    assetUrl: ASSETS.PLAYER_SHIP
  },
  bio: {
    id: 'bio',
    name: 'BIO ship',
    assetUrl: ASSETS.BIO_SHIP
  }
});

export const parsePlayerShipId = (value?: string | null): PlayerShipId => (
  value === 'bio' ? 'bio' : 'researchhub'
);

export const hasBioShipUnlock = (
  walletAddress: string | null | undefined,
  walletRecords: MintRecord[]
) => {
  const normalizedWallet = walletAddress?.toLowerCase();
  return Boolean(
    normalizedWallet
    && walletRecords.some((record) => (
      record.walletAddress?.toLowerCase() === normalizedWallet
      && record.recordType === 'mission'
      && record.status === 'confirmed'
    ))
  );
};

export const ownsSciconRecordNft = async (
  walletAddress: string | null | undefined
): Promise<boolean> => {
  const contractAddress = (import.meta.env.VITE_MISSION_RECORD_CONTRACT_ADDRESS as string | undefined)?.trim();
  if (!walletAddress || !contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) return false;

  const [{ createPublicClient, http }, { base }] = await Promise.all([
    import('viem'),
    import('viem/chains')
  ]);
  const client = createPublicClient({
    chain: base,
    transport: http()
  });
  const balance = await client.readContract({
    address: contractAddress as `0x${string}`,
    abi: [{
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'owner', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }]
    }],
    functionName: 'balanceOf',
    args: [walletAddress as `0x${string}`]
  } as any) as bigint;

  return balance > 0n;
};

export const getUsablePlayerShip = (
  selectedShip: PlayerShipId,
  bioShipUnlocked: boolean
): PlayerShipId => (
  selectedShip === 'bio' && !bioShipUnlocked ? 'researchhub' : selectedShip
);
