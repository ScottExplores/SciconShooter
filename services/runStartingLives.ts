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
 * Mission boundary. Weekly Run has its own fixed competitive capacity and may
 * resume only the lives carried from its last secured checkpoint.
 */
export const resolveRunStartingLives = ({
  weeklyRun,
  startingHeartLevel,
  carriedWeeklyLives = null
}: {
  weeklyRun: boolean;
  startingHeartLevel: number;
  carriedWeeklyLives?: number | null;
}) => {
  if (weeklyRun) {
    const carried = carriedWeeklyLives === null
      ? WEEKLY_RUN_STARTING_LIVES
      : integer(carriedWeeklyLives, WEEKLY_RUN_STARTING_LIVES);
    return Math.max(1, Math.min(WEEKLY_RUN_STARTING_LIVES, carried));
  }
  return Math.min(
    CAMPAIGN_MAX_STARTING_LIVES,
    CAMPAIGN_BASE_STARTING_LIVES + Math.max(0, integer(startingHeartLevel))
  );
};
