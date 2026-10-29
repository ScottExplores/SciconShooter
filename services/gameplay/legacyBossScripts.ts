import type { BossEvent } from '../../game-config/types';

/**
 * Event and weekly runs keep the boss scripts from before batch 1 so the
 * 25K competition is not scored against a later move list. Campaign, boss
 * replay, and bosslab leave this off.
 */
export const LEGACY_BOSS_PHASE_TRIGGERS: Readonly<
  Record<string, Readonly<Record<string, number>>>
> = Object.freeze({
  'nullwake-revenant': Object.freeze({
    'sandbox-nullwake-backplane-crown': 0.99
  })
});

export const isWeeklyOrEventRun = (campaignId: string | null | undefined) => (
  String(campaignId ?? '').startsWith('weekly-run-')
);

/** Restore the pre-batch1 phase thresholds on a copied event boss. */
export const applyLegacyBossEventConfig = (event: BossEvent): BossEvent => {
  const triggers = LEGACY_BOSS_PHASE_TRIGGERS[event.bossId];
  if (!triggers) return event;
  let changed = false;
  const phases = event.phases.map((phase) => {
    const triggerHealthRatio = triggers[phase.id];
    if (triggerHealthRatio == null || phase.triggerHealthRatio === triggerHealthRatio) {
      return phase;
    }
    changed = true;
    return { ...phase, triggerHealthRatio };
  });
  return changed ? { ...event, phases } : event;
};
