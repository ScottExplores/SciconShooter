import type { WalletProfileSnapshot } from './walletProfileService';

const ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

const normalizeAddress = (value: string | null | undefined) => {
  const address = value?.trim().toLowerCase() || '';
  return ADDRESS_PATTERN.test(address) ? address : '';
};

const upgradeLevel = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

const mergeUpgradeTracks = (
  guest: WalletProfileSnapshot['weeklyState']['shipUpgrades'],
  device: WalletProfileSnapshot['weeklyState']['shipUpgrades']
) => {
  const shipIds = new Set([
    ...Object.keys(guest || {}),
    ...Object.keys(device || {})
  ]);
  return Object.fromEntries([...shipIds].map((shipId) => {
    const left = guest?.[shipId as keyof typeof guest];
    const right = device?.[shipId as keyof typeof device];
    return [shipId, {
      fireRate: Math.max(upgradeLevel(left?.fireRate), upgradeLevel(right?.fireRate)),
      speed: Math.max(upgradeLevel(left?.speed), upgradeLevel(right?.speed)),
      ability: Math.max(upgradeLevel(left?.ability), upgradeLevel(right?.ability)),
      startingHearts: Math.max(upgradeLevel(left?.startingHearts), upgradeLevel(right?.startingHearts))
    }];
  })) as WalletProfileSnapshot['weeklyState']['shipUpgrades'];
};

const mergeMiniShips = (
  guest: WalletProfileSnapshot['weeklyState']['ownedMiniShips'],
  device: WalletProfileSnapshot['weeklyState']['ownedMiniShips']
) => {
  const ids = new Set([
    ...Object.keys(guest || {}),
    ...Object.keys(device || {})
  ]);
  return Object.fromEntries([...ids].map((id) => [
    id,
    Math.max(upgradeLevel(guest?.[id as keyof typeof guest]), upgradeLevel(device?.[id as keyof typeof device]))
  ])) as WalletProfileSnapshot['weeklyState']['ownedMiniShips'];
};

/**
 * One device-local view of guest play plus this browser's older wallet-keyed
 * save. Coins use the higher balance once. They are not added together.
 * The server still decides whether an existing wallet may accept any of it.
 */
export const prepareGuestLinkSnapshot = (
  guest: WalletProfileSnapshot,
  deviceWallet: WalletProfileSnapshot
): WalletProfileSnapshot => {
  const highScore = Math.max(
    upgradeLevel(guest.stats.highScore),
    upgradeLevel(deviceWallet.stats.highScore)
  );
  const coins = Math.max(
    upgradeLevel(guest.weeklyState.coins),
    upgradeLevel(deviceWallet.weeklyState.coins)
  );
  const durableCampaignCoins = Math.min(
    coins,
    Math.max(
      upgradeLevel(guest.weeklyState.durableCampaignCoins),
      upgradeLevel(deviceWallet.weeklyState.durableCampaignCoins)
    )
  );
  return {
    ...guest,
    stats: {
      highScore,
      totalCoins: Math.max(
        upgradeLevel(guest.stats.totalCoins),
        upgradeLevel(deviceWallet.stats.totalCoins)
      ),
      playerName: guest.stats.playerName || deviceWallet.stats.playerName
    },
    weeklyState: {
      ...guest.weeklyState,
      coins,
      durableCampaignCoins,
      unlockedSlots: {
        left: Boolean(guest.weeklyState.unlockedSlots.left || deviceWallet.weeklyState.unlockedSlots.left),
        right: false
      },
      ownedMiniShips: mergeMiniShips(
        guest.weeklyState.ownedMiniShips,
        deviceWallet.weeklyState.ownedMiniShips
      ),
      shipUpgrades: mergeUpgradeTracks(
        guest.weeklyState.shipUpgrades,
        deviceWallet.weeklyState.shipUpgrades
      ),
      weeklyStats: {
        ...guest.weeklyState.weeklyStats,
        score: 0,
        weeklyRunAttempts: 0
      }
    },
    permanentState: {
      ...guest.permanentState,
      mintedMiniShips: [],
      lifetimeStats: {
        ...guest.permanentState.lifetimeStats,
        bestScore: Math.max(
          upgradeLevel(guest.permanentState.lifetimeStats.bestScore),
          upgradeLevel(deviceWallet.permanentState.lifetimeStats.bestScore),
          highScore
        )
      },
      unlockedPlayerShips: guest.permanentState.unlockedPlayerShips.filter(
        (shipId) => shipId === 'researchhub' || shipId === 'btc'
      )
    }
  };
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
