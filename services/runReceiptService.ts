import type { PlayerShipId } from './playerShipService';

export type RunIntegrity = 'server-verified' | 'review' | 'local-unverified';

export interface RunMetrics {
  score: number;
  wave: number;
  durationMs: number;
  enemiesDefeated: number;
  coinsCollected: number;
  playerShipId: PlayerShipId;
}

export interface RunSession {
  runId: string;
  issuedAt: string;
  expiresAt: string;
  startToken: string;
  playerShipId: PlayerShipId;
  testRun?: boolean;
  localOnly?: boolean;
}

export interface RunReceipt {
  runId: string;
  gameVersion: string;
  startedAt: string;
  finishedAt: string;
  expiresAt: string;
  metrics: RunMetrics;
  testRun?: boolean;
  integrity: RunIntegrity;
  anomalies: string[];
  receiptToken: string;
  persisted: boolean;
}

const API_URL = '/api/run-receipts';
export const GAME_VERSION = '2.2.0-base-readiness';

const postReceiptAction = async (payload: Record<string, unknown>) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.error || `Run receipt request failed with ${response.status}`);
  }
  return response.json();
};

const createLocalRunSession = (testRun = false, playerShipId: PlayerShipId = 'researchhub'): RunSession => {
  const issuedAt = new Date();
  return {
    runId: crypto.randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    startToken: '',
    playerShipId,
    testRun,
    localOnly: true
  };
};

export const startRunSession = async ({
  testRun = false,
  playerShipId = 'researchhub'
}: {
  testRun?: boolean;
  playerShipId?: PlayerShipId;
} = {}): Promise<RunSession> => {
  try {
    return await postReceiptAction({ action: 'start', gameVersion: GAME_VERSION, testRun, playerShipId });
  } catch (error) {
    console.warn('Server run receipt unavailable; using a local unverified session.', error);
    return createLocalRunSession(testRun, playerShipId);
  }
};

export const finishRunSession = async (
  session: RunSession,
  metrics: RunMetrics
): Promise<RunReceipt> => {
  if (!session.localOnly && session.startToken) {
    try {
      const data = await postReceiptAction({
        action: 'finish',
        startToken: session.startToken,
        metrics
      });
      return data.receipt as RunReceipt;
    } catch (error) {
      console.warn('Server run finalization unavailable; keeping a local unverified record.', error);
    }
  }

  return {
    runId: session.runId,
    gameVersion: GAME_VERSION,
    startedAt: session.issuedAt,
    finishedAt: new Date().toISOString(),
    expiresAt: session.expiresAt,
    metrics,
    testRun: Boolean(session.testRun),
    integrity: 'local-unverified',
    anomalies: ['server_receipt_unavailable'],
    receiptToken: '',
    persisted: false
  };
};
