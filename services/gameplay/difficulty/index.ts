export {
  AUTHORED_TIER_DIFFICULTY_CAP,
  AUTHORED_TIER_DIFFICULTY_STEP,
  resolveAuthoredDifficulty,
  resolveCampaignDifficulty
} from './DifficultyResolver';

export {
  isAuthoredMajorBossEventId,
  isWeeklyRunLevelId,
  resolveCampaignCombatScales,
  resolveCombatScales
} from './CampaignCombatScale';

export type {
  CampaignDifficultyInput,
  DifficultySource
} from './DifficultyResolver';
