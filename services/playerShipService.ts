import { ASSETS } from '../constants';
import {
  CAMPAIGN_STAR_TOTAL,
  getCampaignMasteryStatus,
  type CampaignProgress
} from './campaignProgression';

export type PlayerShipId = 'researchhub' | 'bio' | 'eth' | 'btc';

export const PLAYABLE_PLAYER_SHIP_IDS = ['researchhub', 'bio', 'eth', 'btc'] as const satisfies readonly PlayerShipId[];

export type PlayerShipAccessStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PlayerShipUnlocks {
  bio: boolean;
  eth: boolean;
  btc: boolean;
  bioBalanceRaw: string | null;
  bioBalance: string | null;
  campaignMastered: boolean;
  campaignStarsEarned: number;
  campaignStarsTotal: number;
  accessStatus: PlayerShipAccessStatus;
  accessError?: string;
}

export interface PlayerShipUnlockOptions {
  /** Ignored. The NIH ship is free; this field remains so older callers still type-check. */
  bioUnlocked?: boolean;
  bioBalanceRaw?: string | null;
  bioBalance?: string | null;
  /** Server-verified payment entitlements. Local profile flags are not payment proof. */
  authoritativePaidUnlockIds?: readonly PlayerShipId[];
  /** Retained for profile reconciliation only; never grants token/payment access. */
  permanentUnlockIds?: readonly PlayerShipId[];
  campaignProgress?: CampaignProgress | null;
  accessStatus?: PlayerShipAccessStatus;
  accessError?: string;
  unlockAll?: boolean;
}

export const PLAYER_SHIPS: Readonly<Record<PlayerShipId, {
  id: PlayerShipId;
  name: string;
  assetUrl: string;
}>> = Object.freeze({
  researchhub: {
    id: 'researchhub',
    name: 'RSC ship',
    assetUrl: ASSETS.PLAYER_SHIP
  },
  bio: {
    id: 'bio',
    name: 'NIH',
    assetUrl: ASSETS.NIH_SHIP
  },
  eth: {
    id: 'eth',
    name: 'ETH ship',
    assetUrl: ASSETS.ETH_SHIP
  },
  btc: {
    id: 'btc',
    name: 'BTC ship',
    assetUrl: ASSETS.BTC_SHIP
  }
});

export const parsePlayerShipId = (value?: string | null): PlayerShipId => (
  value === 'bio' || value === 'eth' || value === 'btc' ? value : 'researchhub'
);

export const getPlayerShipUnlocks = (
  options: PlayerShipUnlockOptions = {}
): PlayerShipUnlocks => {
  const accessStatus = options.accessStatus ?? 'idle';
  const accessReady = accessStatus === 'ready';
  const paidUnlockIds = new Set(options.authoritativePaidUnlockIds ?? []);
  const campaign = getCampaignMasteryStatus(options.campaignProgress);
  const unlockAll = options.unlockAll === true;

  return {
    bio: true,
    eth: unlockAll || (accessReady && paidUnlockIds.has('eth')),
    btc: unlockAll || campaign.mastered || (accessReady && paidUnlockIds.has('btc')),
    bioBalanceRaw: typeof options.bioBalanceRaw === 'string' ? options.bioBalanceRaw : null,
    bioBalance: typeof options.bioBalance === 'string' ? options.bioBalance : null,
    campaignMastered: campaign.mastered,
    campaignStarsEarned: campaign.earnedStars,
    campaignStarsTotal: campaign.totalStars || CAMPAIGN_STAR_TOTAL,
    accessStatus,
    ...(options.accessError ? { accessError: options.accessError } : {})
  };
};

/**
 * Persists the earned Campaign route without making the stored flag itself an
 * authorization source. Callers still derive BTC access from Campaign mastery
 * or a server-verified payment entitlement through getPlayerShipUnlocks.
 */
export const addCampaignMasteryBtcUnlock = <
  State extends { unlockedPlayerShips: PlayerShipId[] }
>(
  state: State,
  campaignProgress: CampaignProgress | null | undefined
): State => {
  if (
    !getCampaignMasteryStatus(campaignProgress).mastered
    || state.unlockedPlayerShips.includes('btc')
  ) {
    return state;
  }
  return {
    ...state,
    unlockedPlayerShips: [...state.unlockedPlayerShips, 'btc']
  };
};

export const isPlayerShipUnlocked = (
  shipId: PlayerShipId,
  unlocks: PlayerShipUnlocks
) => shipId === 'researchhub' || shipId === 'bio' || unlocks[shipId];

export const getUsablePlayerShip = (
  selectedShip: PlayerShipId,
  unlocks: PlayerShipUnlocks
): PlayerShipId => (
  isPlayerShipUnlocked(selectedShip, unlocks) ? selectedShip : 'researchhub'
);
