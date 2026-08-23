import type { Address } from 'viem';
import { fetchJsonWithDeadline } from './fetchWithDeadline';
import { STORAGE_KEYS } from '../constants';
import type { PlayerShipId } from './playerShipService';
import type { BossArchiveDifficultyId } from './bossArchive';
import type { PilotStatsSnapshot } from './pilotProfileService';
import type {
  PermanentSquadState,
  WeeklySquadState
} from './squadProgression';
import {
  mergeWalletProfileSnapshots,
  readWalletProfileDirty,
  rebaseWalletProfileDirty,
  replaceWalletProfileDirty,
  walletProfileSnapshotsEqual,
  WalletProfileMergeConflictError
} from './walletProfileDirtyStore';
import {
  resolveWalletProfileSession,
  type AuthenticatedWalletProfileSession,
  type WalletProfileSessionResponse
} from './walletProfileSession';

export interface WalletProfileSnapshot {
  stats: PilotStatsSnapshot;
  weeklyState: WeeklySquadState;
  permanentState: PermanentSquadState;
  selectedShipId: PlayerShipId;
}

export interface WalletProfileRecord {
  walletAddress: string;
  profileId: string;
  revision: number;
  snapshot: WalletProfileSnapshot;
}

type WalletProfileResponse = WalletProfileSessionResponse<WalletProfileRecord>;

interface WalletProfileChallenge {
  challengeId: string;
  message: string;
  expiresAt: string;
}

export interface WalletBossArchiveChallengeRun {
  runId: string;
  runToken: string;
  eventId: string;
  variantId: 'standard';
  difficultyId: BossArchiveDifficultyId;
  issuedAt: string;
  expiresAt: string;
  chargesRemaining: number;
}

export interface WalletBossArchiveChallengeSettlement {
  accepted: true;
  duplicate: boolean;
  resultId: string;
  eventId: string;
  variantId: 'standard';
  difficultyId: BossArchiveDifficultyId;
  rewardCoins: number;
  chargesRemaining: number;
  clearTimeMs: number;
  damageTaken: number;
  noHit: boolean;
  newBestClearTime: boolean;
  newBestChallengeTime: boolean;
  newlyCompletedObjectiveIds: Array<'challenge-clear' | 'no-hit-clear' | 'timed-clear'>;
  utcDateKey: string;
}

interface WalletBossArchiveChallengeStartResponse {
  walletAddress: string;
  profile: WalletProfileRecord;
  run: WalletBossArchiveChallengeRun;
}

export interface WalletBossArchiveChallengeStartResult
  extends WalletBossArchiveChallengeRun {
  profile: WalletProfileRecord;
  run: WalletBossArchiveChallengeRun;
}

interface WalletBossArchiveChallengeSettlementResponse {
  walletAddress: string;
  profile: WalletProfileRecord;
  settlement: WalletBossArchiveChallengeSettlement;
}

export type WalletCampaignBranchOutcome = 'success' | 'failed' | 'interrupted';
export type WalletCampaignBranchKind = 'present-drop' | 'combat';

export interface WalletCampaignBranchDestroyedCounts {
  standard: number;
  armored: number;
  fast: number;
  golden: number;
}

export interface WalletCampaignBranchAttempt {
  attemptId: string;
  attemptToken: string;
  branchId: string;
  branchKind: WalletCampaignBranchKind;
  missionType: string;
  durationMs: number;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
}

export interface WalletCampaignBranchSettlement {
  accepted: true;
  duplicate: boolean;
  attemptId: string;
  branchId: string;
  branchKind: WalletCampaignBranchKind;
  missionType: string;
  outcome: WalletCampaignBranchOutcome;
  stageComplete: boolean;
  objectiveUnitsCompleted: number;
  destroyedByType: WalletCampaignBranchDestroyedCounts;
  presentsDestroyed: number;
  performanceCoins: number;
  coinsAwarded: number;
  rewardReceiptId: string | null;
  claimed: boolean;
  retryAllowed: boolean;
}

interface WalletCampaignBranchStartResponse {
  walletAddress: string;
  attempt: WalletCampaignBranchAttempt;
}

interface WalletCampaignBranchSettlementResponse {
  walletAddress: string;
  profile: WalletProfileRecord;
  settlement: WalletCampaignBranchSettlement;
}

export class WalletProfileRequestError extends Error {
  status: number;
  code: string;
  currentRevision?: number;
  currentProfile?: WalletProfileRecord | null;

  constructor(
    message: string,
    status: number,
    code = '',
    details: {
      currentRevision?: number;
      currentProfile?: WalletProfileRecord | null;
    } = {}
  ) {
    super(message);
    this.name = 'WalletProfileRequestError';
    this.status = status;
    this.code = code;
    this.currentRevision = details.currentRevision;
    this.currentProfile = details.currentProfile;
  }
}

const normalizeWalletAddress = (address: string) => address.trim().toLowerCase();

export const getWalletProfileId = (address: string) => (
  `wallet:${normalizeWalletAddress(address)}`
);

export const getSelectedShipStorageKey = (profileId: string) => (
  `${STORAGE_KEYS.SELECTED_SHIP}:${profileId.trim().toLowerCase()}`
);

const walletCacheKey = (address: string) => (
  `scicon_wallet_profile_cache_v1:${normalizeWalletAddress(address)}`
);

const requestWalletProfile = async <T>(
  init: RequestInit = {}
): Promise<T> => {
  const { response, payload } = await fetchJsonWithDeadline<any>('/api/wallet-profile', {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    throw new WalletProfileRequestError(
      payload.error || 'Wallet profile could not be synchronized.',
      response.status,
      payload.code || '',
      {
        currentRevision: Number.isSafeInteger(payload.currentRevision)
          ? payload.currentRevision
          : undefined,
        currentProfile: payload.profile
      }
    );
  }
  return payload as T;
};

export const readCachedWalletProfile = (
  address: string
): WalletProfileRecord | null => {
  try {
    const raw = localStorage.getItem(walletCacheKey(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletProfileRecord;
    if (
      parsed.walletAddress?.toLowerCase() !== normalizeWalletAddress(address)
      || parsed.profileId !== getWalletProfileId(address)
      || !Number.isFinite(parsed.revision)
      || !parsed.snapshot
    ) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const cacheWalletProfile = (record: WalletProfileRecord) => {
  try {
    localStorage.setItem(
      walletCacheKey(record.walletAddress),
      JSON.stringify(record)
    );
  } catch {
    // A cloud profile remains usable when browser storage is unavailable.
  }
};

export const readWalletProfileSession = async (): Promise<WalletProfileResponse> => (
  requestWalletProfile<WalletProfileResponse>()
);

const requestWalletProfileAuthentication = async (
  address: Address
): Promise<WalletProfileResponse> => {
  const challenge = await requestWalletProfile<WalletProfileChallenge>({
    method: 'POST',
    body: JSON.stringify({ action: 'challenge', address })
  });
  const { signBaseAccountMessage } = await import('./baseAccountWallet');
  const signature = await signBaseAccountMessage(address, challenge.message);
  const response = await requestWalletProfile<WalletProfileResponse>({
    method: 'POST',
    body: JSON.stringify({
      action: 'authenticate',
      address,
      challengeId: challenge.challengeId,
      signature
    })
  });
  return response;
};

export const authenticateWalletProfile = async (
  address: Address
): Promise<AuthenticatedWalletProfileSession<WalletProfileRecord>> => (
  resolveWalletProfileSession({
    walletAddress: address,
    readSession: async () => {
      throw new WalletProfileRequestError(
        'Wallet profile authorization is required.',
        401
      );
    },
    authenticate: () => requestWalletProfileAuthentication(address),
    isUnauthenticatedError: (error) => (
      error instanceof WalletProfileRequestError
      && error.status === 401
    )
  })
);

export const loadAuthenticatedWalletProfile = async (
  address: Address,
  {
    interactive = true
  }: {
    interactive?: boolean;
  } = {}
): Promise<AuthenticatedWalletProfileSession<WalletProfileRecord>> => (
  resolveWalletProfileSession({
    walletAddress: address,
    readSession: readWalletProfileSession,
    authenticate: interactive
      ? () => requestWalletProfileAuthentication(address)
      : async () => {
          throw new WalletProfileRequestError(
            'Wallet profile authorization is required.',
            401,
            'wallet_profile_authorization_required'
          );
        },
    isUnauthenticatedError: (error) => (
      error instanceof WalletProfileRequestError
      && error.status === 401
    )
  })
);

export const saveAuthenticatedWalletProfile = async ({
  walletAddress,
  expectedRevision,
  snapshot,
  keepalive = false
}: {
  walletAddress: string;
  expectedRevision: number;
  snapshot: WalletProfileSnapshot;
  keepalive?: boolean;
}): Promise<WalletProfileRecord> => {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const response = await requestWalletProfile<WalletProfileResponse>({
    method: 'POST',
    keepalive,
    body: JSON.stringify({
      action: 'save',
      walletAddress: normalizedAddress,
      expectedRevision,
      snapshot
    })
  });
  if (!response.profile) {
    throw new WalletProfileRequestError(
      'Wallet profile save returned no profile.',
      500
    );
  }
  if (
    response.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile.walletAddress.toLowerCase() !== normalizedAddress
    || response.profile.profileId !== getWalletProfileId(normalizedAddress)
  ) {
    throw new WalletProfileRequestError(
      'Wallet profile save returned a different wallet.',
      409,
      'wallet_mismatch'
    );
  }
  cacheWalletProfile(response.profile);
  return response.profile;
};

export const startWalletBossArchiveChallenge = async ({
  walletAddress,
  eventId,
  difficultyId = 'easy',
  variantId = 'standard',
  attemptId = globalThis.crypto.randomUUID()
}: {
  walletAddress: string;
  eventId: string;
  difficultyId?: BossArchiveDifficultyId;
  variantId?: 'standard';
  attemptId?: string;
}): Promise<WalletBossArchiveChallengeStartResult> => {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const requestBody = JSON.stringify({
    action: 'start-boss-challenge',
    eventId,
    variantId,
    difficultyId,
    attemptId
  });
  let response: WalletBossArchiveChallengeStartResponse | null = null;
  let lastError: unknown = null;

  // The attempt id is stable across retries. If the server commits the charge
  // but the response is lost, the same request receives the same signed run
  // without spending a second daily attempt.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await requestWalletProfile<WalletBossArchiveChallengeStartResponse>({
        method: 'POST',
        body: requestBody
      });
      break;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof WalletProfileRequestError)
        || error.status >= 500
        || error.code === 'challenge_start_conflict';
      if (!retryable || attempt === 2) throw error;
    }
  }
  if (!response) throw lastError;
  if (
    response.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.profileId !== getWalletProfileId(normalizedAddress)
    || !response.run?.runToken
    || !response.run.runId
    || response.run.eventId !== eventId
    || response.run.variantId !== 'standard'
    || response.run.difficultyId !== difficultyId
    || !Number.isFinite(response.run.chargesRemaining)
  ) {
    throw new WalletProfileRequestError(
      'Boss Archive Challenge start returned invalid state.',
      409,
      'challenge_start_invalid'
    );
  }
  cacheWalletProfile(response.profile);
  return Object.assign({}, response.run, {
    profile: response.profile,
    run: response.run
  });
};

export const settleWalletBossArchiveChallenge = async ({
  walletAddress,
  runToken,
  clearTimeMs,
  damageTaken
}: {
  walletAddress: string;
  runToken: string;
  clearTimeMs: number;
  damageTaken: number;
}): Promise<{
  profile: WalletProfileRecord;
  settlement: WalletBossArchiveChallengeSettlement;
}> => {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const requestBody = JSON.stringify({
    action: 'settle-boss-challenge',
    runToken,
    victory: true,
    clearTimeMs,
    damageTaken
  });
  let response: WalletBossArchiveChallengeSettlementResponse | null = null;
  let lastError: unknown = null;

  // The server ledger makes this request idempotent. Retrying the same signed
  // run is therefore safe when an RPC commits but its HTTP response is lost.
  // Deterministic 4xx errors are not retried.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await requestWalletProfile<WalletBossArchiveChallengeSettlementResponse>({
        method: 'POST',
        body: requestBody
      });
      break;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof WalletProfileRequestError)
        || error.status >= 500;
      if (!retryable || attempt === 2) throw error;
    }
  }
  if (!response) throw lastError;
  if (
    response.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.profileId !== getWalletProfileId(normalizedAddress)
    || response.settlement?.accepted !== true
    || !['easy', 'medium', 'heroic'].includes(response.settlement?.difficultyId)
  ) {
    throw new WalletProfileRequestError(
      'Boss Archive Challenge settlement returned invalid wallet state.',
      409,
      'challenge_settlement_invalid'
    );
  }
  cacheWalletProfile(response.profile);
  return {
    profile: response.profile,
    settlement: response.settlement
  };
};

export const startWalletCampaignBranch = async ({
  walletAddress,
  branchId
}: {
  walletAddress: string;
  branchId: string;
}): Promise<WalletCampaignBranchAttempt> => {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const response = await requestWalletProfile<WalletCampaignBranchStartResponse>({
    method: 'POST',
    body: JSON.stringify({
      action: 'start-campaign-branch',
      branchId
    })
  });
  if (
    response.walletAddress?.toLowerCase() !== normalizedAddress
    || !response.attempt?.attemptToken
    || !response.attempt.attemptId
    || response.attempt.branchId !== branchId
    || !['present-drop', 'combat'].includes(response.attempt.branchKind)
    || !Number.isFinite(response.attempt.durationMs)
  ) {
    throw new WalletProfileRequestError(
      'Campaign bonus route start returned invalid state.',
      409,
      'branch_start_invalid'
    );
  }
  return response.attempt;
};

export const settleWalletCampaignBranch = async ({
  walletAddress,
  attemptToken,
  outcome,
  destroyedByType,
  collectedPresentCoins,
  stageComplete,
  objectiveUnitsCompleted
}: {
  walletAddress: string;
  attemptToken: string;
  outcome: WalletCampaignBranchOutcome;
  destroyedByType?: Partial<WalletCampaignBranchDestroyedCounts>;
  collectedPresentCoins?: number;
  stageComplete?: boolean;
  objectiveUnitsCompleted?: number;
}): Promise<{
  profile: WalletProfileRecord;
  settlement: WalletCampaignBranchSettlement;
}> => {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const requestBody = JSON.stringify({
    action: 'settle-campaign-branch',
    attemptToken,
    outcome,
    destroyedByType: destroyedByType ?? {},
    collectedPresentCoins: collectedPresentCoins ?? 0,
    stageComplete,
    objectiveUnitsCompleted
  });
  let response: WalletCampaignBranchSettlementResponse | null = null;
  let lastError: unknown = null;

  // Settlement uses a stable server receipt and revision-CAS write, so retrying
  // the same signed attempt after a lost HTTP response cannot double-credit it.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await requestWalletProfile<WalletCampaignBranchSettlementResponse>({
        method: 'POST',
        body: requestBody
      });
      break;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof WalletProfileRequestError)
        || error.status >= 500
        || error.code === 'branch_settlement_conflict';
      if (!retryable || attempt === 2) throw error;
    }
  }
  if (!response) throw lastError;
  if (
    response.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.walletAddress?.toLowerCase() !== normalizedAddress
    || response.profile?.profileId !== getWalletProfileId(normalizedAddress)
    || response.settlement?.accepted !== true
    || !['present-drop', 'combat'].includes(response.settlement?.branchKind)
    || !Number.isFinite(response.settlement?.objectiveUnitsCompleted)
  ) {
    throw new WalletProfileRequestError(
      'Campaign bonus route settlement returned invalid wallet state.',
      409,
      'branch_settlement_invalid'
    );
  }
  cacheWalletProfile(response.profile);
  return {
    profile: response.profile,
    settlement: response.settlement
  };
};

export const flushDirtyWalletProfile = async (
  address: string,
  {
    keepalive = false,
    maxAttempts = 3
  }: {
    keepalive?: boolean;
    maxAttempts?: number;
  } = {}
): Promise<WalletProfileRecord | null> => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = getWalletProfileId(walletAddress);
  let latestSaved: WalletProfileRecord | null = null;

  for (let attempt = 0; attempt < Math.max(1, maxAttempts); attempt += 1) {
    const dirty = readWalletProfileDirty(walletAddress);
    if (!dirty) return latestSaved;
    if (
      dirty.walletAddress !== walletAddress
      || dirty.profileId !== profileId
    ) {
      throw new WalletProfileRequestError(
        'Wallet profile dirty state belongs to a different wallet.',
        409,
        'wallet_mismatch'
      );
    }

    try {
      const saved = await saveAuthenticatedWalletProfile({
        walletAddress,
        expectedRevision: dirty.expectedRevision,
        snapshot: dirty.snapshot,
        keepalive
      });
      latestSaved = saved;
      rebaseWalletProfileDirty({
        address: walletAddress,
        sentWriteId: dirty.writeId,
        savedProfile: saved
      });
    } catch (error) {
      if (
        !(error instanceof WalletProfileRequestError)
        || error.status !== 409
        || !error.currentProfile
      ) {
        throw error;
      }
      const remote = error.currentProfile;
      if (
        remote.walletAddress.toLowerCase() !== walletAddress
        || remote.profileId !== profileId
      ) {
        throw new WalletProfileRequestError(
          'Wallet profile conflict returned a different wallet.',
          409,
          'wallet_mismatch'
        );
      }

      // A visibility/pagehide save can race the normal autosave with the same
      // expected revision. If the other request already committed the exact
      // logical snapshot, the 409 is an acknowledgement rather than a
      // cross-device conflict. Rebase it without issuing another write.
      if (walletProfileSnapshotsEqual(dirty.snapshot, remote.snapshot)) {
        latestSaved = remote;
        rebaseWalletProfileDirty({
          address: walletAddress,
          sentWriteId: dirty.writeId,
          savedProfile: remote
        });
        continue;
      }

      const currentDirty = readWalletProfileDirty(walletAddress) ?? dirty;
      let mergedSnapshot;
      try {
        mergedSnapshot = mergeWalletProfileSnapshots({
          address: walletAddress,
          baseSnapshot: currentDirty.baseSnapshot,
          localSnapshot: currentDirty.snapshot,
          remoteSnapshot: remote.snapshot
        });
      } catch (mergeError) {
        if (mergeError instanceof WalletProfileMergeConflictError) {
          throw new WalletProfileRequestError(
            `${mergeError.message} This device save remains queued.`,
            409,
            'profile_conflict',
            {
              currentRevision: remote.revision,
              currentProfile: remote
            }
          );
        }
        throw mergeError;
      }
      replaceWalletProfileDirty({
        address: walletAddress,
        current: currentDirty,
        expectedRevision: remote.revision,
        baseSnapshot: remote.snapshot,
        snapshot: mergedSnapshot
      });
    }
  }

  if (readWalletProfileDirty(walletAddress)) {
    throw new WalletProfileRequestError(
      'Wallet cloud sync is busy. This device save remains queued and will retry.',
      409,
      'profile_sync_busy'
    );
  }
  return latestSaved;
};

export const logoutWalletProfileSession = async (walletAddress: string) => {
  try {
    await requestWalletProfile<{ ok: boolean }>({
      method: 'POST',
      body: JSON.stringify({
        action: 'logout',
        walletAddress: normalizeWalletAddress(walletAddress)
      })
    });
  } catch {
    // Disconnecting the provider still returns the app to the guest profile.
  }
};
