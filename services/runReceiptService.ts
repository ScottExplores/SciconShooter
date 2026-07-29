import type { PlayerShipId } from './playerShipService';
import type { WeeklyCampaignStreakState } from './weeklyCampaignStreak';

export type RunIntegrity = 'server-verified' | 'review' | 'local-unverified';
export type RunReceiptMode = 'standard' | 'weekly-streak';

export interface RunIdentityBinding {
  kind: 'guest' | 'wallet';
  profileIdHash: string;
  walletAddress?: string;
}

export interface WeeklyRunStartBinding {
  schemaVersion: 1;
  weeklyId: string;
  resetAtMs: number;
  startNodeId: string;
  createdAtMs: number;
  currentNodeId: string;
  revision: number;
  visitedNodeCount: number;
  committedRouteCount: number;
  scoreEventCount: number;
  scoreElapsedMs: number;
  prefixHash: string;
  boundAtMs: number;
}

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
  runMode: RunReceiptMode;
  identity?: RunIdentityBinding;
  weeklyCampaignBinding?: WeeklyRunStartBinding;
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
  weeklyCampaign?: {
    weeklyId: string;
    startNodeId: string;
    finalNodeId: string;
    completedNodeCount: number;
    eventCount: number;
    startRevision: number;
    finalRevision: number;
    finalizationReason: string | null;
    proofHash: string;
  };
  identity?: RunIdentityBinding;
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
    credentials: 'same-origin',
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

const createLocalRunSession = (
  testRun = false,
  playerShipId: PlayerShipId = 'researchhub',
  runMode: RunReceiptMode = 'standard'
): RunSession => {
  const issuedAt = new Date();
  return {
    runId: crypto.randomUUID(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + 3 * 60 * 60 * 1000).toISOString(),
    startToken: '',
    playerShipId,
    runMode,
    testRun,
    localOnly: true
  };
};

export const startRunSession = async ({
  testRun = false,
  playerShipId = 'researchhub',
  runMode = 'standard',
  profileId = 'guest',
  weeklyCampaignProof = null
}: {
  testRun?: boolean;
  playerShipId?: PlayerShipId;
  runMode?: RunReceiptMode;
  profileId?: string;
  weeklyCampaignProof?: WeeklyCampaignStreakState | null;
} = {}): Promise<RunSession> => {
  try {
    return await postReceiptAction({
      action: 'start',
      gameVersion: GAME_VERSION,
      testRun,
      playerShipId,
      runMode,
      profileId,
      ...(weeklyCampaignProof ? { weeklyCampaignProof } : {})
    });
  } catch (error) {
    console.warn('Server run receipt unavailable; using a local unverified session.', error);
    return createLocalRunSession(testRun, playerShipId, runMode);
  }
};

export const finishRunSession = async (
  session: RunSession,
  metrics: RunMetrics,
  weeklyCampaignProof: WeeklyCampaignStreakState | null = null
): Promise<RunReceipt> => {
  if (!session.localOnly && session.startToken) {
    try {
      const data = await postReceiptAction({
        action: 'finish',
        startToken: session.startToken,
        metrics: {
          ...metrics,
          ...(weeklyCampaignProof ? { weeklyCampaignProof } : {})
        }
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
