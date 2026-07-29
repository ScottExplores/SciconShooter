import type { WeeklyCampaignNodeOutcome } from './weeklyCampaignStreak';

export interface WeeklyCampaignRuntimeSummary {
  readonly regularEnemyKills: number;
  readonly eliteKills: number;
  readonly waveTotal: number;
  readonly miniBossKills: number;
  readonly majorBossKills: number;
  readonly damageTaken: number;
  readonly remainingLives: number;
  readonly elapsedSeconds: number;
}

export interface WeeklyCampaignRuntimeOutcomeOptions {
  readonly parTimeSeconds?: number | null;
  readonly performanceStars: 0 | 1 | 2 | 3;
}

const nonNegativeInteger = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const optionalSecondsToMilliseconds = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric * 1_000)
    : null;
};

/**
 * Converts one completed runtime Mission into the canonical Weekly score event.
 * Kill categories must come from the engine's observed destruction counters;
 * this boundary deliberately does not reconstruct them from Campaign metadata.
 * Accuracy remains unavailable until the runtime records real shots and hits.
 */
export const buildWeeklyCampaignRuntimeOutcome = (
  summary: WeeklyCampaignRuntimeSummary,
  options: WeeklyCampaignRuntimeOutcomeOptions
): WeeklyCampaignNodeOutcome => ({
  regularEnemyKills: nonNegativeInteger(summary.regularEnemyKills),
  eliteKills: nonNegativeInteger(summary.eliteKills),
  wavesCleared: nonNegativeInteger(summary.waveTotal),
  miniBossKills: nonNegativeInteger(summary.miniBossKills),
  majorBossKills: nonNegativeInteger(summary.majorBossKills),
  missionCompleted: true,
  damageTaken: nonNegativeInteger(summary.damageTaken),
  livesRemaining: nonNegativeInteger(summary.remainingLives),
  accuracy: null,
  elapsedMs: nonNegativeInteger(Number(summary.elapsedSeconds) * 1_000),
  parTimeMs: optionalSecondsToMilliseconds(options.parTimeSeconds),
  performanceStars: Math.min(3, nonNegativeInteger(options.performanceStars)) as 0 | 1 | 2 | 3
});
