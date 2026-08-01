export type WaveCompletionRule = 'boss-defeat' | 'clear-after-duration';

export interface CampaignSpawnTargetInput {
  count: number;
  patternId: string;
  campaignCycle: number;
}

export interface ClearWaveCompletionInput {
  completionRule: WaveCompletionRule;
  elapsedFrames: number;
  durationFrames: number;
  scheduledSpawnsComplete: boolean;
  scheduledEncountersComplete: boolean;
  activeThreatCount: number;
  warningActive: boolean;
  transitionPending: boolean;
}

export interface LegacyMilestoneInput {
  completionRule: WaveCompletionRule;
  configuredEventCount: number;
  configuredEncounterCount: number;
}

/** Keeps endless-cycle spawn escalation identical for spawning and completion checks. */
export const getCampaignSpawnTargetCount = ({
  count,
  patternId,
  campaignCycle
}: CampaignSpawnTargetInput) => {
  const baseCount = Math.max(0, Math.floor(Number(count) || 0));
  const cycle = Math.max(0, Math.floor(Number(campaignCycle) || 0));
  const normalizedPattern = String(patternId || '').toLowerCase();
  const formationEvent = !normalizedPattern.includes('single') && !normalizedPattern.includes('random');
  const countBonus = formationEvent
    ? Math.min(Math.ceil(baseCount * 0.5), Math.ceil(baseCount * cycle * 0.1))
    : Math.min(2, cycle);
  return baseCount + countBonus;
};

/**
 * Interstitial waves cannot finish while scheduled content is still spawning,
 * a warning is resolving, or any hostile remains on the field.
 *
 * The authored `durationSeconds` is a spawning schedule, not a stopwatch the
 * player has to wait out. Once every authored squadron has been released and
 * the field is clear, the Wave is over -- holding the player on an empty
 * screen until the clock expires is pure dead air. Authored pacing is still
 * fully respected because a spawn event that has not reached its startSeconds
 * yet leaves `scheduledSpawnsComplete` false.
 */
export const shouldCompleteClearWave = ({
  completionRule,
  scheduledSpawnsComplete,
  scheduledEncountersComplete,
  activeThreatCount,
  warningActive,
  transitionPending
}: ClearWaveCompletionInput) => completionRule === 'clear-after-duration'
  && !transitionPending
  && !warningActive
  && scheduledSpawnsComplete
  && scheduledEncountersComplete
  && activeThreatCount === 0;

/**
 * The procedural milestone sequence is only a compatibility path for waves
 * with no authored timeline at all. Authored elite clear-waves must never
 * inherit legacy mini-boss, wall, or Gatekeeper encounters.
 */
export const shouldUseLegacyMilestoneEncounters = ({
  completionRule,
  configuredEventCount,
  configuredEncounterCount
}: LegacyMilestoneInput) => completionRule === 'boss-defeat'
  && configuredEventCount === 0
  && configuredEncounterCount === 0;
