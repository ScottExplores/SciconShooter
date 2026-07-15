import type { MintRecord } from '../types';

type RawRecord = Record<string, unknown>;

export const getWalletRecords = async (walletAddress: string): Promise<MintRecord[]> => {
  if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) return [];
  try {
    const response = await fetch(`/api/mint-records?wallet=${encodeURIComponent(walletAddress.toLowerCase())}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return (Array.isArray(payload.records) ? payload.records : [])
      .filter((record: unknown): record is RawRecord => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
      .map((record) => ({
        recordType: record.record_type === 'champion' ? 'champion' : 'mission',
        runId: String(record.run_id || ''),
        weekKey: record.week_key ? String(record.week_key) : undefined,
        walletAddress: String(record.wallet_address || ''),
        chainId: Number(record.chain_id || 0),
        tokenId: record.token_id ? String(record.token_id) : undefined,
        transactionHash: record.transaction_hash ? String(record.transaction_hash) : undefined,
        status: record.status === 'confirmed' ? 'confirmed' : record.status === 'failed' ? 'failed' : 'pending',
        sponsored: Boolean(record.sponsored),
        createdAt: String(record.created_at || ''),
        confirmedAt: record.confirmed_at ? String(record.confirmed_at) : undefined,
        score: Number.isFinite(Number(record.score)) ? Math.max(0, Math.floor(Number(record.score))) : undefined,
        ownershipVerified: typeof record.ownership_verified === 'boolean'
          ? record.ownership_verified
          : undefined
      }));
  } catch {
    return [];
  }
};
