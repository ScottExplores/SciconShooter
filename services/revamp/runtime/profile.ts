import {
  buildRuntimeSquadLoadout, MINI_SHIP_BY_ID,
  type MiniShipId, type PermanentSquadState, type WeeklySquadState
} from '../../squadProgression';
import type { PlayerShipId } from '../../playerShipService';
import { getRevampBonuses, sanitizeRevampProgress } from '../progression';
import type { RevampProgress, RevampUnlock } from '../progression/types';

/** Existing Tokens and Science Credits are one balance, including protected Campaign earnings. */
export const withRevampCredits = (weekly: WeeklySquadState, credits: number): WeeklySquadState => {
  const next = Math.max(0, Math.floor(credits));
  const spent = Math.max(0, weekly.coins - next);
  const seasonal = Math.max(0, weekly.coins - weekly.durableCampaignCoins);
  return { ...weekly, coins: next,
    durableCampaignCoins: Math.max(0, weekly.durableCampaignCoins - Math.max(0, spent - seasonal)) + Math.max(0, next - weekly.coins),
    updatedAt: new Date().toISOString() };
};

export const grantRevampWings = (weekly: WeeklySquadState, unlocks: readonly RevampUnlock[], firstClear = false): WeeklySquadState => {
  const next = { ...weekly, ownedMiniShips: { ...weekly.ownedMiniShips }, unlockedSlots: { ...weekly.unlockedSlots }, equipped: { ...weekly.equipped } };
  next.unlockedSlots.left = true;
  next.ownedMiniShips['citation-dart'] = Math.max(1, next.ownedMiniShips['citation-dart'] ?? 0);
  if (!next.equipped.left) next.equipped.left = 'citation-dart';
  if (firstClear) {
    next.unlockedSlots.right = true;
    next.ownedMiniShips['quorum-crab'] = Math.max(1, next.ownedMiniShips['quorum-crab'] ?? 0);
    if (!next.equipped.right) next.equipped.right = 'quorum-crab';
  }
  for (const unlock of unlocks) {
    if (unlock.kind !== 'wing' || !unlock.assetId || !(unlock.assetId in MINI_SHIP_BY_ID)) continue;
    const id = unlock.assetId as MiniShipId;
    next.ownedMiniShips[id] = Math.max(1, next.ownedMiniShips[id] ?? 0);
  }
  return next;
};

export const buildRevampCampaignLoadout = (weekly: WeeklySquadState, permanent: PermanentSquadState, ship: PlayerShipId) => {
  const revamp = sanitizeRevampProgress(permanent.revamp);
  const firstFlight = permanent.campaignProgress.completedMissionIds.length === 0;
  // The free first wing is available immediately; its flight entrance is timed by the simulation.
  const campaign = grantRevampWings(weekly, [], !firstFlight);
  // Campaign ranks follow earned Support research; legacy purchased levels stay in their original modes.
  const wingLevel = Math.min(5, 1 + revamp.upgrades.support);
  campaign.ownedMiniShips = Object.fromEntries(Object.entries(campaign.ownedMiniShips)
    .map(([id, level]) => [id, level > 0 ? wingLevel : 0]));
  return { ...buildRuntimeSquadLoadout(campaign, ship), revamp: {
    ...getRevampBonuses(revamp), firstFlight, wingAutoCast: revamp.wingAutoCast,
    cosmeticId: (revamp as RevampProgress & { equippedCosmeticId?: string }).equippedCosmeticId
  } };
};
