import type { PlayerShipId } from './playerShipService';
import type { WeeklyCampaignStreakState } from './weeklyCampaignStreak';
import { isPreviewMode } from './revamp/preview/previewMode';

export type RunIntegrity = 'server-verified' | 'review' | 'local-unverified';
export type RunReceiptMode = 'standard' | 'weekly-streak';

export interface RunIdentityBinding {
  kind: 'guest' | 'wallet';
  profileIdHash: string;
  walletAddress?: string;
  guestSessionBound?: boolean;
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
  weeklyAttempt?: {
    weeklyId: string;
    attemptNumber: number;
    freeAttempts: number;
    purchasedAttempts: number;
    attemptsUsed: number;
    attemptsRemaining: number;
    resetAtMs: number;
  };
  testRun?: boolean;
  localOnly?: boolean;
}

export interface RunReceipt {
  runId: string;
  gameVersion: string;
  runMode: RunReceiptMode;
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
    const responseDetails = details?.details;
    const anomalies = Array.isArray(responseDetails)
      ? responseDetails.map(String)
      : Array.isArray(responseDetails?.anomalies)
        ? responseDetails.anomalies.map(String)
        : [];
    throw Object.assign(
      new Error(details.error || `Run receipt request failed with ${response.status}`),
      {
        statusCode: response.status,
        details: anomalies,
        code: typeof details?.code === 'string' ? details.code : undefined
      }
    );
  }
  return response.json();
};

const isRetryableReceiptError = (error: unknown) => {
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  return !Number.isFinite(statusCode)
    || statusCode >= 500
    || statusCode === 408
    || statusCode === 425
    || statusCode === 429;
};

/**
 * A static host has no receipt function. 404/405 and a failed fetch mean the
 * run can be practiced locally. A live server that answers with any other
 * status is still authoritative.
 */
const isAbsentReceiptApi = (error: unknown) => {
  const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
  if (!Number.isFinite(statusCode)) return true;
  return statusCode === 404 || statusCode === 405;
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
  walletAddress = null,
  weeklyCampaignProof = null
}: {
  testRun?: boolean;
  playerShipId?: PlayerShipId;
  runMode?: RunReceiptMode;
  profileId?: string;
  walletAddress?: string | null;
  weeklyCampaignProof?: WeeklyCampaignStreakState | null;
} = {}): Promise<RunSession> => {
  // REVAMP(E): Preview flights are local practice and reserve no ranked attempt.
  if (isPreviewMode()) return createLocalRunSession(true, playerShipId, runMode);
  const requestedWalletAddress = walletAddress?.trim().toLowerCase() || null;
  const startPayload = {
    action: 'start',
    gameVersion: GAME_VERSION,
    testRun,
    playerShipId,
    runMode,
    profileId,
    walletAddress: requestedWalletAddress,
    ...(weeklyCampaignProof ? { weeklyCampaignProof } : {})
  };
  try {
    try {
      return await postReceiptAction(startPayload);
    } catch (error) {
      // The first guest request establishes a signed HttpOnly identity without
      // reserving an attempt. Retry once after the browser stores that cookie.
      if ((error as { code?: unknown })?.code !== 'GUEST_SESSION_REQUIRED') throw error;
      return await postReceiptAction(startPayload);
    }
  } catch (error) {
    if (runMode === 'weekly-streak' && !isAbsentReceiptApi(error)) {
      // Competitive Weekly Run admission is server-authoritative. Falling
      // back to a local session here would let quota/persistence failures look
      // ranked even though the result can never be verified. A missing /api
      // is practice only: localOnly, with no receipt token to submit.
      throw error;
    }
    const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
    const errorCode = (error as { code?: unknown })?.code;
    if (
      requestedWalletAddress
      && (
        statusCode === 401
        || statusCode === 409
        || errorCode === 'RUN_WALLET_SESSION_REQUIRED'
        || errorCode === 'RUN_WALLET_SESSION_MISMATCH'
      )
    ) {
      // Never disguise an account transition as a local run. The caller can
      // retry once the selected wallet and its signed session agree.
      throw error;
    }
    console.warn('Server run receipt unavailable; using a local unverified session.', error);
    return createLocalRunSession(testRun, playerShipId, runMode);
  }
};

export const finishRunSession = async (
  session: RunSession,
  metrics: RunMetrics,
  weeklyCampaignProof: WeeklyCampaignStreakState | null = null
): Promise<RunReceipt> => {
  // REVAMP(E): Also protect an old signed session restored inside a test build.
  if (!isPreviewMode() && !session.localOnly && session.startToken) {
    const finishPayload = {
      action: 'finish',
      startToken: session.startToken,
      metrics: {
        ...metrics,
        ...(weeklyCampaignProof ? { weeklyCampaignProof } : {})
      }
    };
    let finalizationError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await postReceiptAction(finishPayload);
        return data.receipt as RunReceipt;
      } catch (error) {
        finalizationError = error;
        if (attempt === 0 && isRetryableReceiptError(error)) continue;
        break;
      }
    }
    {
      const error = finalizationError;
      if (session.runMode === 'weekly-streak') {
        const statusCode = Number((error as { statusCode?: unknown })?.statusCode);
        const retryable = isRetryableReceiptError(error);
        if (retryable) {
          console.warn('Weekly Run verification was interrupted; keeping the signed run available for retry.', error);
          throw Object.assign(
            new Error('Verification was interrupted. Reconnect and submit again. No wallet is required.'),
            {
              cause: error,
              ...(Number.isFinite(statusCode) ? { statusCode } : {})
            }
          );
        }
        throw error;
      }
      console.warn('Server run finalization unavailable; keeping a local unverified record.', error);
    }
  }

  return {
    runId: session.runId,
    gameVersion: GAME_VERSION,
    runMode: session.runMode,
    startedAt: session.issuedAt,
    finishedAt: new Date().toISOString(),
    expiresAt: session.expiresAt,
    metrics,
    testRun: Boolean(session.testRun) || isPreviewMode(),
    integrity: 'local-unverified',
    anomalies: [isPreviewMode() ? 'preview_read_only' : 'server_receipt_unavailable'],
    receiptToken: '',
    persisted: false
  };
};
