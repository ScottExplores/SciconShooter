import type { RuntimeSquadLoadout } from '../../squadProgression';

export const WEEKLY_RANKED_SHIP = 'researchhub' as const;

/** Competitive power is independent of wallet, Campaign upgrades and purchases. */
export const buildWeeklyRankedLoadout = (identity: Pick<RuntimeSquadLoadout, 'profileId' | 'weekKey'>): RuntimeSquadLoadout => ({
  profileId: identity.profileId,
  weekKey: identity.weekKey,
  mainShipId: WEEKLY_RANKED_SHIP,
  upgrades: { fireRate: 0, speed: 0, startingHearts: 0, ability: 0 },
  companions: []
});
