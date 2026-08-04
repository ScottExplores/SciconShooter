import {
  CAMPAIGN_BASE_STARTING_LIVES,
  CAMPAIGN_MAX_STARTING_LIVES
} from './squadProgression';
import { WEEKLY_RUN_STARTING_LIVES } from './weeklyRunGenerator';

const integer = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : fallback;
};

/**
 * Campaign Missions refill the permanent Starting Hearts capacity at each
 * Mission boundary. Every Weekly Run launch is a new attempt with the same
 * fixed competitive capacity; live damage carries only inside its mounted
 * engine and is never reconstructed from a saved depth.
 */
export const resolveRunStartingLives = ({
  weeklyRun,
  startingHeartLevel
}: {
  weeklyRun: boolean;
  startingHeartLevel: number;
}) => {
  if (weeklyRun) return WEEKLY_RUN_STARTING_LIVES;
  return Math.min(
    CAMPAIGN_MAX_STARTING_LIVES,
    CAMPAIGN_BASE_STARTING_LIVES + Math.max(0, integer(startingHeartLevel))
  );
};
