import { parsePlayerShipId } from './playerShipService';
import type { RunReceipt } from './runReceiptService';
import { fetchJsonWithDeadline } from './fetchWithDeadline';

export interface WalletRunRecord {
  pilotName: string;
  receipt: RunReceipt;
}

type RawRun = Record<string, unknown>;

const parseReceipt = (value: unknown): RunReceipt | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as RawRun;
  const metrics = raw.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return null;
  const rawMetrics = metrics as RawRun;
  const rawIdentity = raw.identity;
  if (!rawIdentity || typeof rawIdentity !== 'object' || Array.isArray(rawIdentity)) return null;
  const identity = rawIdentity as RawRun;
  const identityWalletAddress = String(identity.walletAddress || '').trim().toLowerCase();
  const identityProfileIdHash = String(identity.profileIdHash || '').trim().toLowerCase();
  const runId = String(raw.runId || '');
  const receiptToken = String(raw.receiptToken || '');
  const startedAt = String(raw.startedAt || '');
  const finishedAt = String(raw.finishedAt || '');
  const expiresAt = String(raw.expiresAt || '');
  const numericMetrics = [
    rawMetrics.score,
    rawMetrics.wave,
    rawMetrics.durationMs,
    rawMetrics.enemiesDefeated,
    rawMetrics.coinsCollected
  ].map(Number);
  const playerShipId = String(rawMetrics.playerShipId || '').toLowerCase();
  if (
    !runId
    || !receiptToken
    || ![startedAt, finishedAt, expiresAt].every((date) => Number.isFinite(Date.parse(date)))
    || numericMetrics.some((metric) => !Number.isFinite(metric))
    || !['researchhub', 'bio', 'eth', 'btc'].includes(playerShipId)
    || (raw.integrity !== 'review' && raw.integrity !== 'server-verified')
    || identity.kind !== 'wallet'
    || !/^0x[a-f0-9]{40}$/.test(identityWalletAddress)
    || !/^[a-f0-9]{64}$/.test(identityProfileIdHash)
  ) return null;

  return {
    runId,
    runMode: raw.runMode === 'weekly-streak' ? 'weekly-streak' : 'standard',
    gameVersion: String(raw.gameVersion || 'unknown'),
    startedAt,
    finishedAt,
    expiresAt,
    metrics: {
      score: Math.max(0, Math.floor(Number(rawMetrics.score) || 0)),
      wave: Math.max(1, Math.floor(Number(rawMetrics.wave) || 1)),
      durationMs: Math.max(0, Math.floor(Number(rawMetrics.durationMs) || 0)),
      enemiesDefeated: Math.max(0, Math.floor(Number(rawMetrics.enemiesDefeated) || 0)),
      coinsCollected: Math.max(0, Math.floor(Number(rawMetrics.coinsCollected) || 0)),
      playerShipId: parsePlayerShipId(playerShipId)
    },
    identity: {
      kind: 'wallet',
      walletAddress: identityWalletAddress,
      profileIdHash: identityProfileIdHash
    },
    testRun: Boolean(raw.testRun),
    integrity: raw.integrity === 'review' ? 'review' : 'server-verified',
    anomalies: Array.isArray(raw.anomalies) ? raw.anomalies.map(String) : [],
    receiptToken,
    persisted: Boolean(raw.persisted)
  };
};

export const getWalletRunsStrict = async (
  walletAddress: string,
  { signal, timeoutMs = 15_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<WalletRunRecord[]> => {
  if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) return [];
  const normalizedWalletAddress = walletAddress.toLowerCase();
  const { response, payload } = await fetchJsonWithDeadline<unknown>(`/api/player-runs?wallet=${encodeURIComponent(normalizedWalletAddress)}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(`Pilot run history could not be loaded (${response.status}).`);
  }
  if (
    !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || !Array.isArray((payload as { runs?: unknown }).runs)
  ) {
    throw new Error('Pilot run history returned an invalid response.');
  }
  const rawRuns = (payload as { runs: unknown[] }).runs;
  const parsedRuns = rawRuns.map((run: unknown) => {
        if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
        const raw = run as RawRun;
        const receipt = parseReceipt(raw.receipt);
        if (!receipt || receipt.identity?.walletAddress !== normalizedWalletAddress) return null;
        return {
          pilotName: String(raw.pilotName || 'PILOT').trim().slice(0, 15).toUpperCase() || 'PILOT',
          receipt
        };
      });
  if (parsedRuns.some((run) => !run)) {
    throw new Error('Pilot run history returned an invalid response.');
  }
  return parsedRuns.slice(0, 5) as WalletRunRecord[];
};

export const getWalletRuns = async (walletAddress: string): Promise<WalletRunRecord[]> => {
  try {
    return await getWalletRunsStrict(walletAddress);
  } catch {
    return [];
  }
};
