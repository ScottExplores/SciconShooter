import type { Address } from 'viem';
import { STORAGE_KEYS } from '../constants';
import type { PlayerShipId } from './playerShipService';
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
  WalletProfileMergeConflictError
} from './walletProfileDirtyStore';

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

interface WalletProfileResponse {
  walletAddress?: string;
  profile: WalletProfileRecord | null;
}

interface WalletProfileChallenge {
  challengeId: string;
  message: string;
  expiresAt: string;
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
  const response = await fetch('/api/wallet-profile', {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
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

export const readWalletProfileSession = async (): Promise<WalletProfileRecord | null> => {
  const response = await requestWalletProfile<WalletProfileResponse>();
  return response.profile;
};

export const authenticateWalletProfile = async (
  address: Address
): Promise<WalletProfileRecord | null> => {
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
  return response.profile;
};

export const loadAuthenticatedWalletProfile = async (
  address: Address
): Promise<WalletProfileRecord | null> => {
  try {
    const existingSession = await readWalletProfileSession();
    if (
      existingSession
      && existingSession.walletAddress.toLowerCase() === normalizeWalletAddress(address)
    ) return existingSession;
  } catch (error) {
    if (!(error instanceof WalletProfileRequestError) || error.status !== 401) {
      throw error;
    }
  }
  return authenticateWalletProfile(address);
};

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
      'Wallet profile changed repeatedly while saving. It remains queued on this device.',
      409,
      'profile_conflict'
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
