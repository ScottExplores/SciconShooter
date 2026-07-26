export const AUTHORED_TIER_DIFFICULTY_STEP = 0.04;
export const AUTHORED_TIER_DIFFICULTY_CAP = 0.12;

export interface DifficultySource {
  startingDifficulty: number;
  waveDifficultyMultiplier: number;
}

export interface CampaignDifficultyInput extends DifficultySource {
  progressionTier: number;
}

export const resolveAuthoredDifficulty = ({
  startingDifficulty,
  waveDifficultyMultiplier
}: DifficultySource) => Math.max(
  0.01,
  Number(startingDifficulty) * Number(waveDifficultyMultiplier)
);

/**
 * Compatibility resolver for the existing hidden five-Mission difficulty
 * bands. The cap intentionally preserves the shipped campaign while explicit
 * schema-v2 difficulty profiles are introduced.
 */
export const resolveCampaignDifficulty = ({
  startingDifficulty,
  waveDifficultyMultiplier,
  progressionTier
}: CampaignDifficultyInput) => {
  const authoredDifficulty = resolveAuthoredDifficulty({
    startingDifficulty,
    waveDifficultyMultiplier
  });
  const tierDifficulty = 1 + Math.min(
    AUTHORED_TIER_DIFFICULTY_CAP,
    Math.max(0, Math.floor(Number(progressionTier) || 0)) * AUTHORED_TIER_DIFFICULTY_STEP
  );
  return authoredDifficulty * tierDifficulty;
};
