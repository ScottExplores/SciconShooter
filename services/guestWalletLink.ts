import type { WalletProfileSnapshot } from './walletProfileService';

const ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

const normalizeAddress = (value: string | null | undefined) => {
  const address = value?.trim().toLowerCase() || '';
  return ADDRESS_PATTERN.test(address) ? address : '';
};

/**
 * Guest economy is not a wallet upload. The device snapshot stays untouched
 * and is not merged into the authenticated profile.
 */
export const prepareGuestLinkSnapshot = (
  _guest: WalletProfileSnapshot,
  deviceWallet: WalletProfileSnapshot
): WalletProfileSnapshot => deviceWallet;

const positive = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0)) > 0;

/**
 * True when the authenticated profile already has its own progress.
 * An empty profile must not be treated as a place to store the guest save.
 */
export const walletSnapshotHasOwnedProgress = (
  snapshot: WalletProfileSnapshot | null | undefined
) => {
  if (!snapshot) return false;
  const weekly = snapshot.weeklyState;
  const permanent = snapshot.permanentState;
  if (positive(snapshot.stats?.highScore) || positive(snapshot.stats?.totalCoins)) return true;
  if (!weekly || !permanent) return false;
  if (positive(weekly.coins) || positive(weekly.weeklyStats?.score) || positive(weekly.weeklyStats?.runs)) {
    return true;
  }
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

export const isCurrentGuestLinkResult = ({
  requestGeneration,
  currentGeneration,
  requestWallet,
  activeWallet,
  resultWallet
}: {
  requestGeneration: number;
  currentGeneration: number;
  requestWallet: string | null;
  activeWallet: string | null;
  resultWallet: string | null;
}) => {
  const requested = normalizeAddress(requestWallet);
  const active = normalizeAddress(activeWallet);
  const result = normalizeAddress(resultWallet);
  return requestGeneration === currentGeneration
    && requested === active
    && result === active;
};
