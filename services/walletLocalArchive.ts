import type { WalletProfileSnapshot } from './walletProfileService';

const positive = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0)) > 0;

/** Same owned-progress signals as the guest-link guard, kept local so a device archive does not import the cloud client. */
const walletSnapshotHasOwnedProgress = (snapshot: WalletProfileSnapshot | null | undefined) => {
  if (!snapshot) return false;
  const weekly = snapshot.weeklyState;
  const permanent = snapshot.permanentState;
  if (positive(snapshot.stats?.highScore) || positive(snapshot.stats?.totalCoins)) return true;
  if (!weekly || !permanent) return false;
  if (positive(weekly.coins) || positive(weekly.weeklyStats?.score) || positive(weekly.weeklyStats?.runs)) return true;
  if (weekly.unlockedSlots?.left || weekly.unlockedSlots?.right) return true;
  if (Object.values(weekly.ownedMiniShips || {}).some((level) => positive(level))) return true;
  const upgrades = Object.values(weekly.shipUpgrades || {});
  if (upgrades.some((levels) => Object.values(levels || {}).some((level) => positive(level)))) return true;
  if (positive(permanent.lifetimeStats?.bestScore) || positive(permanent.lifetimeStats?.runs)) return true;
  if (Object.values(permanent.achievementTiers || {}).some((tier) => positive(tier))) return true;
  if ((permanent.campaignProgress?.completedMissionIds?.length || 0) > 0) return true;
  if ((permanent.unlockedPlayerShips || []).some((shipId) => shipId !== 'researchhub')) return true;
  return false;
};

const ARCHIVE_PREFIX = 'scicon_wallet_local_archive_v1:';

const normalizeAddress = (value: string) => value.trim().toLowerCase();

export const walletLocalArchiveKey = (address: string) => (
  `${ARCHIVE_PREFIX}${normalizeAddress(address)}`
);

/**
 * Keeps one device-local copy of a wallet-keyed cache the first time a cloud
 * profile replaces the working keys. Later calls do not overwrite it, and this
 * never reads or writes the guest profile.
 */
export const archiveLocalWalletSnapshot = (
  address: string,
  snapshot: WalletProfileSnapshot | null | undefined
) => {
  if (!snapshot || !walletSnapshotHasOwnedProgress(snapshot) || typeof localStorage === 'undefined') {
    return false;
  }
  const key = walletLocalArchiveKey(address);
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, JSON.stringify({
    version: 1,
    walletAddress: normalizeAddress(address),
    archivedAt: new Date().toISOString(),
    snapshot
  }));
  return true;
};
