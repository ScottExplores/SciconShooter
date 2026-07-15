import { parsePlayerShipId } from './playerShipService';
import type { RunReceipt } from './runReceiptService';

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
  const runId = String(raw.runId || '');
  const receiptToken = String(raw.receiptToken || '');
  if (!runId || !receiptToken) return null;

  return {
    runId,
    gameVersion: String(raw.gameVersion || 'unknown'),
    startedAt: String(raw.startedAt || ''),
    finishedAt: String(raw.finishedAt || ''),
    expiresAt: String(raw.expiresAt || ''),
    metrics: {
      score: Math.max(0, Math.floor(Number(rawMetrics.score) || 0)),
      wave: Math.max(1, Math.floor(Number(rawMetrics.wave) || 1)),
      durationMs: Math.max(0, Math.floor(Number(rawMetrics.durationMs) || 0)),
      enemiesDefeated: Math.max(0, Math.floor(Number(rawMetrics.enemiesDefeated) || 0)),
      coinsCollected: Math.max(0, Math.floor(Number(rawMetrics.coinsCollected) || 0)),
      playerShipId: parsePlayerShipId(String(rawMetrics.playerShipId || ''))
    },
    testRun: Boolean(raw.testRun),
    integrity: raw.integrity === 'review' ? 'review' : 'server-verified',
    anomalies: Array.isArray(raw.anomalies) ? raw.anomalies.map(String) : [],
    receiptToken,
    persisted: Boolean(raw.persisted)
  };
};

export const getWalletRuns = async (walletAddress: string): Promise<WalletRunRecord[]> => {
  if (!/^0x[a-f0-9]{40}$/i.test(walletAddress)) return [];

  try {
    const response = await fetch(`/api/player-runs?wallet=${encodeURIComponent(walletAddress.toLowerCase())}`, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return (Array.isArray(payload.runs) ? payload.runs : [])
      .map((run: unknown) => {
        if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
        const raw = run as RawRun;
        const receipt = parseReceipt(raw.receipt);
        if (!receipt) return null;
        return {
          pilotName: String(raw.pilotName || 'PILOT').trim().slice(0, 15).toUpperCase() || 'PILOT',
          receipt
        };
      })
      .filter((run: WalletRunRecord | null): run is WalletRunRecord => Boolean(run))
      .slice(0, 5);
  } catch {
    return [];
  }
};
