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

const cloneSnapshot = <T,>(snapshot: T): T => (
  JSON.parse(JSON.stringify(snapshot)) as T
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
  // The cloud sanitizer stamps these presentation metadata fields on every
  // read. They do not represent player progress and must not make an unchanged
  // second read look like another device edited the Campaign.
  const campaignProgress = comparable.permanentState.campaignProgress as {
    updatedAt?: unknown;
    branchProgress?: { updatedAt?: unknown };
  } | undefined;
  if (campaignProgress) {
    delete campaignProgress.updatedAt;
    if (campaignProgress.branchProgress) {
      delete campaignProgress.branchProgress.updatedAt;
    }
  }
  // Archive schema versions describe the local sanitizer, not player progress.
  // Ignore them while comparing saves so a normal v1 -> v2 migration cannot be
  // mistaken for a second-device progression conflict.
  delete (comparable.permanentState.bossArchive as { version?: unknown }).version;
  return comparable;
};

const valuesEqual = (left: unknown, right: unknown) => (
  JSON.stringify(left) === JSON.stringify(right)
);

const splitPermanentAchievementProgress = (
  state: WalletProfileSnapshot['permanentState']
) => {
  const { achievementTiers, lifetimeStats, ...core } = state;
  return { achievementTiers, lifetimeStats, core };
};

/**
 * Lifetime achievement counters and collected tier counts only move forward.
 * Max-merging is deliberately conservative: it preserves proof already seen
 * on either device without double-counting the same run during a conflict.
 */
const mergeMonotonicNumberRecords = <T extends object>(left: T, right: T): T => {
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  return Object.fromEntries(Array.from(new Set([
    ...Object.keys(leftRecord),
    ...Object.keys(rightRecord)
  ])).map((key) => [
    key,
    Math.max(integer(leftRecord[key]), integer(rightRecord[key]))
  ])) as T;
};

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
  const basePermanent = splitPermanentAchievementProgress(base.permanentState);
  const localPermanent = splitPermanentAchievementProgress(local.permanentState);
  const remotePermanent = splitPermanentAchievementProgress(remote.permanentState);
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
    permanentState: {
      ...chooseSection(
        'permanent progression',
        basePermanent.core,
        localPermanent.core,
        remotePermanent.core
      ),
      lifetimeStats: mergeMonotonicNumberRecords(
        localPermanent.lifetimeStats,
        remotePermanent.lifetimeStats
      ),
      achievementTiers: mergeMonotonicNumberRecords(
        localPermanent.achievementTiers,
        remotePermanent.achievementTiers
      )
    } as WalletProfileSnapshot['permanentState'],
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

const MAX_PROFILE_COINS = 1_000_000_000;

/**
 * Rebase local writes after an RSC purchase changed the cloud revision. Store
 * settlements own the right-support entitlement and any paid Token credit;
 * unrelated queued progress remains local until the next normal profile save.
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
  // REVAMP(D): Preserve the server-owned paid reserve while rebasing local research receipts.
  if (rebasedSnapshot.permanentState.revamp && savedProfile.snapshot.permanentState.revamp) {
    rebasedSnapshot.permanentState.revamp.paidCreditReserve = savedProfile.snapshot.permanentState.revamp.paidCreditReserve;
  }
  const baseWeekly = current.baseSnapshot?.weeklyState ?? null;
  const localWeekly = current.snapshot.weeklyState;
  const serverWeekly = savedProfile.snapshot.weeklyState;
  const sameWeeklyEconomy = (
    localWeekly.weekKey === serverWeekly.weekKey
    && (!baseWeekly || baseWeekly.weekKey === serverWeekly.weekKey)
  );

  if (sameWeeklyEconomy) {
    const baseCoins = baseWeekly?.coins ?? 0;
    const baseDurableCoins = baseWeekly?.durableCampaignCoins ?? 0;
    const mergedCoins = integer(
      serverWeekly.coins + (localWeekly.coins - baseCoins),
      0,
      MAX_PROFILE_COINS
    );
    const mergedDurableCoins = integer(
      serverWeekly.durableCampaignCoins
        + (localWeekly.durableCampaignCoins - baseDurableCoins),
      0,
      mergedCoins
    );
    rebasedSnapshot.weeklyState.coins = mergedCoins;
    rebasedSnapshot.weeklyState.durableCampaignCoins = mergedDurableCoins;
    rebasedSnapshot.weeklyState.unlockedSlots = {
      ...rebasedSnapshot.weeklyState.unlockedSlots,
      right: authoritativeRight
    };
  } else {
    // A purchase that settles across the weekly boundary must not carry the
    // expired week's local balance into the new competition week.
    rebasedSnapshot.weeklyState = cloneSnapshot(savedProfile.snapshot).weeklyState;
  }

  return replaceWalletProfileDirty({
    address: walletAddress,
    current,
    expectedRevision: savedProfile.revision,
    baseSnapshot: savedProfile.snapshot,
    snapshot: rebasedSnapshot
  });
};

/**
 * A Hangar spend changes both the Token balance and durable loadout fields on
 * the server. Rebase unrelated local writes without allowing a queued browser
 * snapshot to undo that canonical upgrade when it is flushed afterward.
 */
export const rebaseWalletProfileDirtyAfterServerTokenSpend = ({
  address,
  savedProfile
}: {
  address: string;
  savedProfile: WalletProfileRecord;
}) => {
  const purchaseRebase = rebaseWalletProfileDirtyAfterServerPurchase({
    address,
    savedProfile
  });
  if (!purchaseRebase) return null;

  const serverWeekly = savedProfile.snapshot.weeklyState;
  const protectedSnapshot = cloneSnapshot(purchaseRebase.snapshot);
  protectedSnapshot.weeklyState.unlockedSlots = cloneSnapshot(serverWeekly.unlockedSlots);
  protectedSnapshot.weeklyState.ownedMiniShips = cloneSnapshot(serverWeekly.ownedMiniShips);
  protectedSnapshot.weeklyState.shipUpgrades = cloneSnapshot(serverWeekly.shipUpgrades);
  (['left', 'right'] as const).forEach((slot) => {
    const equippedId = protectedSnapshot.weeklyState.equipped[slot];
    if (
      !protectedSnapshot.weeklyState.unlockedSlots[slot]
      || (equippedId && !protectedSnapshot.weeklyState.ownedMiniShips[equippedId])
    ) {
      protectedSnapshot.weeklyState.equipped[slot] = null;
    }
  });
  protectedSnapshot.permanentState.lifetimeStats.hangarUpgradesPurchased =
    savedProfile.snapshot.permanentState.lifetimeStats.hangarUpgradesPurchased;

  return replaceWalletProfileDirty({
    address,
    current: purchaseRebase,
    expectedRevision: savedProfile.revision,
    baseSnapshot: savedProfile.snapshot,
    snapshot: protectedSnapshot
  });
};
