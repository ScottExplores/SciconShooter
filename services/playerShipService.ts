import { ASSETS } from '../constants';
import type { MintRecord } from '../types';

export type PlayerShipId = 'researchhub' | 'bio' | 'eth' | 'btc';

export const PLAYABLE_PLAYER_SHIP_IDS = ['researchhub', 'bio', 'eth', 'btc'] as const satisfies readonly PlayerShipId[];

export const ETH_SHIP_SCORE_THRESHOLD = 1_000;
export const BTC_SHIP_SCORE_THRESHOLD = 10_000;

export interface PlayerShipUnlocks {
  eth: boolean;
  btc: boolean;
  highestMintedScore: number;
}

export interface PlayerShipUnlockOptions {
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
    name: 'BIO ship',
    assetUrl: ASSETS.BIO_SHIP
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
  walletAddress: string | null | undefined,
  walletRecords: MintRecord[],
  options: PlayerShipUnlockOptions = {}
): PlayerShipUnlocks => {
  const normalizedWallet = walletAddress?.toLowerCase();
  const highestMintedScore = normalizedWallet
    ? walletRecords.reduce((highestScore, record) => {
      const qualifies = (
      record.walletAddress?.toLowerCase() === normalizedWallet
      && record.recordType === 'mission'
      && record.status === 'confirmed'
      && record.ownershipVerified !== false
      && Number.isFinite(record.score)
      );
      return qualifies ? Math.max(highestScore, Math.floor(record.score || 0)) : highestScore;
    }, 0)
    : 0;

  return {
    eth: options.unlockAll === true || highestMintedScore >= ETH_SHIP_SCORE_THRESHOLD,
    btc: options.unlockAll === true || highestMintedScore >= BTC_SHIP_SCORE_THRESHOLD,
    highestMintedScore
  };
};

export const isPlayerShipUnlocked = (
  shipId: PlayerShipId,
  unlocks: PlayerShipUnlocks
) => shipId !== 'eth' && shipId !== 'btc' ? true : unlocks[shipId];

export const getUsablePlayerShip = (
  selectedShip: PlayerShipId,
  unlocks: PlayerShipUnlocks
): PlayerShipId => (
  isPlayerShipUnlocked(selectedShip, unlocks) ? selectedShip : 'researchhub'
);
