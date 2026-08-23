import type { MintRecord } from '../types';
import { fetchJsonWithDeadline } from './fetchWithDeadline';

type RawRecord = Record<string, unknown>;

const parseMintRecord = (value: unknown, expectedWallet: string): MintRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as RawRecord;
  const runId = String(record.run_id || '');
  const walletAddress = String(record.wallet_address || '').toLowerCase();
  const chainId = Number(record.chain_id);
  const createdAt = String(record.created_at || '');
  const recordType = record.record_type;
  const status = record.status;
  if (
    !runId
    || walletAddress !== expectedWallet
    || !/^0x[a-f0-9]{40}$/.test(walletAddress)
    || !Number.isInteger(chainId)
    || chainId <= 0
    || !Number.isFinite(Date.parse(createdAt))
    || (recordType !== 'mission' && recordType !== 'champion')
    || (status !== 'pending' && status !== 'confirmed' && status !== 'failed')
    || (record.confirmed_at && !Number.isFinite(Date.parse(String(record.confirmed_at))))
    || (record.score !== undefined && !Number.isFinite(Number(record.score)))
  ) return null;
  return {
    recordType,
    runId,
    weekKey: record.week_key ? String(record.week_key) : undefined,
    walletAddress,
    chainId,
    tokenId: record.token_id ? String(record.token_id) : undefined,
    transactionHash: record.transaction_hash ? String(record.transaction_hash) : undefined,
    status,
    sponsored: Boolean(record.sponsored),
    createdAt,
    confirmedAt: record.confirmed_at ? String(record.confirmed_at) : undefined,
    score: record.score !== undefined ? Math.max(0, Math.floor(Number(record.score))) : undefined,
    ownershipVerified: typeof record.ownership_verified === 'boolean'
      ? record.ownership_verified
      : undefined
  };
};

export const getWalletRecordsStrict = async (
  walletAddress: string,
  { signal, timeoutMs = 15_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<MintRecord[]> => {
  if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) return [];
  const { response, payload } = await fetchJsonWithDeadline<unknown>(`/api/mint-records?wallet=${encodeURIComponent(walletAddress.toLowerCase())}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(`Mission Records could not be loaded (${response.status}).`);
  }
  if (
    !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || !Array.isArray((payload as { records?: unknown }).records)
  ) {
    throw new Error('Mission Records returned an invalid response.');
  }
  const expectedWallet = walletAddress.toLowerCase();
  const parsedRecords = (payload as { records: unknown[] }).records
    .map((record) => parseMintRecord(record, expectedWallet));
  if (parsedRecords.some((record) => !record)) {
    throw new Error('Mission Records returned an invalid response.');
  }
  return parsedRecords as MintRecord[];
};

export const getWalletRecords = async (walletAddress: string): Promise<MintRecord[]> => {
  try {
    return await getWalletRecordsStrict(walletAddress);
  } catch {
    return [];
  }
};
