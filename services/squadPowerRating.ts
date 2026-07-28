import type { SupportRecommendationTag } from '../game-config/types';
import {
  MINI_SHIP_BY_ID,
  type MainShipUpgradeLevels,
  type MiniShipId,
  type RuntimeSquadLoadout
} from './squadProgression';

/**
 * One rating shared by the Hangar, Campaign Map guidance, and Campaign Lab.
 * The authored Campaign curve tops out at 8,860, so a fully upgraded main
 * ship plus two level-five supports reaches that same truthful ceiling.
 */
export const SQUAD_POWER_RATING = Object.freeze({
  base: 1_000,
  mainUpgradeLevel: 160,
  equippedSupportLevel: 226
});

export interface SquadPowerSupportLevel {
  id: MiniShipId;
  level: number;
}

export const calculateSquadPowerRating = (
  upgrades: MainShipUpgradeLevels,
  equippedSupports: readonly SquadPowerSupportLevel[]
) => {
  const mainUpgradeLevels = Object.values(upgrades).reduce(
    (total, level) => total + Math.max(0, Math.floor(Number(level) || 0)),
    0
  );
  const supportLevels = equippedSupports
    .slice(0, 2)
    .reduce(
      (total, support) => total + Math.max(0, Math.floor(Number(support.level) || 0)),
      0
    );
  return SQUAD_POWER_RATING.base
    + mainUpgradeLevels * SQUAD_POWER_RATING.mainUpgradeLevel
    + supportLevels * SQUAD_POWER_RATING.equippedSupportLevel;
};

export const calculateRuntimeSquadPowerRating = (loadout: RuntimeSquadLoadout) => (
  calculateSquadPowerRating(
    loadout.upgrades,
    loadout.companions.map(({ id, level }) => ({ id, level }))
  )
);

/** Concrete companions that actually fulfill each authored Campaign role. */
export const CAMPAIGN_SUPPORT_ROLE_CATALOG: Readonly<
  Record<SupportRecommendationTag, readonly MiniShipId[]>
> = Object.freeze({
  'anti-swarm': Object.freeze<MiniShipId[]>(['prism-skimmer', 'nebula-tern', 'helix-wasp']),
  'anti-armor': Object.freeze<MiniShipId[]>(['ledger-hammer', 'photon-manta', 'archive-beetle']),
  'lane-control': Object.freeze<MiniShipId[]>(['beacon-kite', 'helix-wasp', 'prism-skimmer']),
  'boss-damage': Object.freeze<MiniShipId[]>(['ledger-hammer', 'axiom-orbiter', 'archive-beetle']),
  survival: Object.freeze<MiniShipId[]>(['quorum-crab', 'photon-manta', 'citation-dart']),
  'anti-summon': Object.freeze<MiniShipId[]>(['beacon-kite', 'nebula-tern', 'prism-skimmer'])
});

export interface CampaignSupportRecommendation {
  tag: SupportRecommendationTag;
  shipIds: readonly MiniShipId[];
  shipNames: readonly string[];
}

export const getCampaignSupportRecommendations = (
  tags: readonly SupportRecommendationTag[]
): CampaignSupportRecommendation[] => tags.map((tag) => {
  const shipIds = CAMPAIGN_SUPPORT_ROLE_CATALOG[tag] ?? [];
  return {
    tag,
    shipIds,
    shipNames: shipIds.map((id) => MINI_SHIP_BY_ID[id].name)
  };
});

export const getCampaignRecommendedSupportIds = (
  tags: readonly SupportRecommendationTag[],
  maximum = 2
) => {
  const selected: MiniShipId[] = [];
  const candidates = tags.flatMap((tag) => CAMPAIGN_SUPPORT_ROLE_CATALOG[tag] ?? []);
  for (const id of candidates) {
    if (!selected.includes(id)) selected.push(id);
    if (selected.length >= Math.max(0, Math.floor(maximum))) break;
  }
  return selected;
};

export const getCampaignSupportTagsForMiniShip = (id: MiniShipId) => (
  (Object.keys(CAMPAIGN_SUPPORT_ROLE_CATALOG) as SupportRecommendationTag[])
    .filter((tag) => CAMPAIGN_SUPPORT_ROLE_CATALOG[tag].includes(id))
);
