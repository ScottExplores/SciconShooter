import type {
  WalletProfileRecord,
  WalletProfileSnapshot
} from './walletProfileService';

const DIRTY_PROFILE_VERSION = 1;
const DIRTY_PROFILE_STORAGE_PREFIX = 'scicon_wallet_profile_dirty_v1:';
const WALLET_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

export interface WalletProfileDirtyRecord {
  version: typeof DIRTY_PROFILE_VERSION;
  walletAddress: string;
  profileId: string;
  expectedRevision: number;
  baseSnapshot: WalletProfileSnapshot | null;
  snapshot: WalletProfileSnapshot;
  writeId: string;
  updatedAt: string;
}

const normalizeWalletAddress = (value: string) => {
  const address = value.trim().toLowerCase();
  if (!WALLET_ADDRESS_PATTERN.test(address)) {
    throw new Error('A valid wallet address is required for profile sync.');
  }
  return address;
};

const walletProfileId = (address: string) => `wallet:${normalizeWalletAddress(address)}`;

const hasExpectedProfileId = (
  snapshot: WalletProfileSnapshot | null,
  profileId: string
) => (
  snapshot === null
  || (
    snapshot.weeklyState?.profileId === profileId
    && snapshot.permanentState?.profileId === profileId
  )
);

const getStorage = () => (
  typeof window === 'undefined' ? null : window.localStorage
);

const createWriteId = () => (
  globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
);

const cloneSnapshot = (snapshot: WalletProfileSnapshot): WalletProfileSnapshot => (
  JSON.parse(JSON.stringify(snapshot)) as WalletProfileSnapshot
);

const comparableSnapshot = (snapshot: WalletProfileSnapshot) => {
  const comparable = cloneSnapshot(snapshot) as WalletProfileSnapshot & {
    permanentState: WalletProfileSnapshot['permanentState'] & {
      mintedMiniShips?: unknown;
    };
  };
  delete comparable.weeklyState.updatedAt;
  delete comparable.permanentState.updatedAt;
  delete comparable.permanentState.mintedMiniShips;
  // Archive schema versions describe the local sanitizer, not player progress.
  // Ignore them while comparing saves so a normal v1 -> v2 migration cannot be
  // mistaken for a second-device progression conflict.
  delete (comparable.permanentState.bossArchive as { version?: unknown }).version;
  return comparable;
};

const valuesEqual = (left: unknown, right: unknown) => (
  JSON.stringify(left) === JSON.stringify(right)
);

export class WalletProfileMergeConflictError extends Error {
  sections: string[];

  constructor(sections: string[]) {
    super(`Wallet profile changed on both devices: ${sections.join(', ')}.`);
    this.name = 'WalletProfileMergeConflictError';
    this.sections = sections;
  }
}

export const walletProfileSnapshotsEqual = (
  left: WalletProfileSnapshot,
  right: WalletProfileSnapshot
) => valuesEqual(comparableSnapshot(left), comparableSnapshot(right));

const writeRecord = (record: WalletProfileDirtyRecord) => {
  const storage = getStorage();
  if (!storage) return record;
  try {
    storage.setItem(
      getWalletProfileDirtyStorageKey(record.walletAddress),
      JSON.stringify(record)
    );
  } catch {
    // The live in-memory state remains usable; a later mutation can retry.
  }
  return record;
};

const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

export const getWalletProfileDirtyStorageKey = (address: string) => (
  `${DIRTY_PROFILE_STORAGE_PREFIX}${normalizeWalletAddress(address)}`
);

export const readWalletProfileDirty = (
  address: string
): WalletProfileDirtyRecord | null => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  const storage = getStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(getWalletProfileDirtyStorageKey(walletAddress));
    if (!raw) return null;
    const record = JSON.parse(raw) as WalletProfileDirtyRecord;
    if (
      record.version !== DIRTY_PROFILE_VERSION
      || record.walletAddress !== walletAddress
      || record.profileId !== profileId
      || !Number.isSafeInteger(record.expectedRevision)
      || record.expectedRevision < 0
      || typeof record.writeId !== 'string'
      || !record.writeId
      || !hasExpectedProfileId(record.snapshot, profileId)
      || !hasExpectedProfileId(record.baseSnapshot, profileId)
    ) {
      storage.removeItem(getWalletProfileDirtyStorageKey(walletAddress));
      return null;
    }
    return record;
  } catch {
    storage.removeItem(getWalletProfileDirtyStorageKey(walletAddress));
    return null;
  }
};

export const discardWalletProfileDirty = (address: string) => {
  const walletAddress = normalizeWalletAddress(address);
  getStorage()?.removeItem(getWalletProfileDirtyStorageKey(walletAddress));
};

export const markWalletProfileDirty = ({
  address,
  expectedRevision,
  baseSnapshot,
  snapshot
}: {
  address: string;
  expectedRevision: number;
  baseSnapshot: WalletProfileSnapshot | null;
  snapshot: WalletProfileSnapshot;
}): WalletProfileDirtyRecord => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  if (
    !hasExpectedProfileId(snapshot, profileId)
    || !hasExpectedProfileId(baseSnapshot, profileId)
  ) {
    throw new Error('Wallet profile snapshots cannot cross wallet boundaries.');
  }

  const current = readWalletProfileDirty(walletAddress);
  return writeRecord({
    version: DIRTY_PROFILE_VERSION,
    walletAddress,
    profileId,
    expectedRevision: current?.expectedRevision
      ?? integer(expectedRevision, 0, Number.MAX_SAFE_INTEGER),
    baseSnapshot: current?.baseSnapshot
      ? cloneSnapshot(current.baseSnapshot)
      : baseSnapshot
        ? cloneSnapshot(baseSnapshot)
        : null,
    snapshot: cloneSnapshot(snapshot),
    writeId: createWriteId(),
    updatedAt: new Date().toISOString()
  });
};

export const rebaseWalletProfileDirty = ({
  address,
  sentWriteId,
  savedProfile
}: {
  address: string;
  sentWriteId: string;
  savedProfile: WalletProfileRecord;
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  if (
    savedProfile.walletAddress.toLowerCase() !== walletAddress
    || savedProfile.profileId !== profileId
    || !hasExpectedProfileId(savedProfile.snapshot, profileId)
  ) {
    throw new Error('Wallet profile response did not match the intended wallet.');
  }

  const current = readWalletProfileDirty(walletAddress);
  if (!current) return null;
  if (current.writeId === sentWriteId) {
    getStorage()?.removeItem(getWalletProfileDirtyStorageKey(walletAddress));
    return null;
  }
  return writeRecord({
    ...current,
    expectedRevision: savedProfile.revision,
    baseSnapshot: cloneSnapshot(savedProfile.snapshot),
    updatedAt: new Date().toISOString()
  });
};

export const replaceWalletProfileDirty = ({
  address,
  current,
  expectedRevision,
  baseSnapshot,
  snapshot
}: {
  address: string;
  current: WalletProfileDirtyRecord;
  expectedRevision: number;
  baseSnapshot: WalletProfileSnapshot;
  snapshot: WalletProfileSnapshot;
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  if (
    current.walletAddress !== walletAddress
    || current.profileId !== profileId
    || !hasExpectedProfileId(baseSnapshot, profileId)
    || !hasExpectedProfileId(snapshot, profileId)
  ) {
    throw new Error('Wallet profile conflict cannot cross wallet boundaries.');
  }
  return writeRecord({
    ...current,
    expectedRevision: integer(expectedRevision, 0, Number.MAX_SAFE_INTEGER),
    baseSnapshot: cloneSnapshot(baseSnapshot),
    snapshot: cloneSnapshot(snapshot),
    writeId: createWriteId(),
    updatedAt: new Date().toISOString()
  });
};

export const mergeWalletProfileSnapshots = ({
  address,
  baseSnapshot,
  localSnapshot,
  remoteSnapshot
}: {
  address: string;
  baseSnapshot: WalletProfileSnapshot | null;
  localSnapshot: WalletProfileSnapshot;
  remoteSnapshot: WalletProfileSnapshot;
}): WalletProfileSnapshot => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  if (
    !hasExpectedProfileId(baseSnapshot, profileId)
    || !hasExpectedProfileId(localSnapshot, profileId)
    || !hasExpectedProfileId(remoteSnapshot, profileId)
  ) {
    throw new Error('Wallet profile conflict cannot cross wallet boundaries.');
  }

  if (!baseSnapshot) {
    if (walletProfileSnapshotsEqual(localSnapshot, remoteSnapshot)) {
      return cloneSnapshot(localSnapshot);
    }
    throw new WalletProfileMergeConflictError(['profile']);
  }

  const base = comparableSnapshot(baseSnapshot);
  const local = comparableSnapshot(localSnapshot);
  const remote = comparableSnapshot(remoteSnapshot);
  const conflicts: string[] = [];
  const chooseSection = <T>(
    name: string,
    baseValue: T,
    localValue: T,
    remoteValue: T
  ): T => {
    const localChanged = !valuesEqual(localValue, baseValue);
    const remoteChanged = !valuesEqual(remoteValue, baseValue);
    if (localChanged && remoteChanged && !valuesEqual(localValue, remoteValue)) {
      conflicts.push(name);
      return localValue;
    }
    return localChanged ? localValue : remoteValue;
  };

  const merged: WalletProfileSnapshot = {
    weeklyState: chooseSection(
      'weekly progression',
      base.weeklyState,
      local.weeklyState,
      remote.weeklyState
    ),
    permanentState: chooseSection(
      'permanent progression',
      base.permanentState,
      local.permanentState,
      remote.permanentState
    ),
    stats: chooseSection('pilot stats', base.stats, local.stats, remote.stats),
    selectedShipId: chooseSection(
      'selected ship',
      base.selectedShipId,
      local.selectedShipId,
      remote.selectedShipId
    )
  };
  if (conflicts.length) throw new WalletProfileMergeConflictError(conflicts);
  return {
    ...cloneSnapshot(merged),
    weeklyState: { ...merged.weeklyState, profileId },
    permanentState: { ...merged.permanentState, profileId }
  };
};

/**
 * Rebase local writes after an RSC purchase changed the cloud revision. The
 * settlement is authoritative only for the right-support entitlement, so every
 * other field comes from the queued local snapshot even when a normal
 * three-way merge would report a conflict.
 */
export const rebaseWalletProfileDirtyAfterServerPurchase = ({
  address,
  savedProfile
}: {
  address: string;
  savedProfile: WalletProfileRecord;
}) => {
  const walletAddress = normalizeWalletAddress(address);
  const profileId = walletProfileId(walletAddress);
  if (
    savedProfile.walletAddress.toLowerCase() !== walletAddress
    || savedProfile.profileId !== profileId
    || !hasExpectedProfileId(savedProfile.snapshot, profileId)
  ) {
    throw new Error('Wallet purchase response did not match the intended wallet.');
  }

  const current = readWalletProfileDirty(walletAddress);
  if (!current) return null;

  const authoritativeRight = Boolean(
    savedProfile.snapshot.weeklyState.unlockedSlots.right
  );
  const rebasedSnapshot = cloneSnapshot(current.snapshot);
  rebasedSnapshot.weeklyState.unlockedSlots = {
    ...rebasedSnapshot.weeklyState.unlockedSlots,
    right: authoritativeRight
  };

  return replaceWalletProfileDirty({
    address: walletAddress,
    current,
    expectedRevision: savedProfile.revision,
    baseSnapshot: savedProfile.snapshot,
    snapshot: rebasedSnapshot
  });
};
