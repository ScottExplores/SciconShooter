/**
 * Campaign combat scales.
 *
 * `resolveCampaignDifficulty` stays the compatibility number (starting
 * difficulty × wave multiplier × capped tier). Applying that number to health,
 * speed, contact damage, and fire rate at once was the curve Scott flagged:
 * authored Mission values already climb from Mission 1 to Mission 50, and the
 * runtime multiplied them again. A late scout became faster, tougher, and
 * harder-hitting in the same step, and a major boss whose weapons were
 * intentionally frozen still had its hull and body speed inflated.
 *
 * Weekly Run is different. Its level `startingDifficulty` is the endless
 * intensity, and hull stats are bases waiting for that one multiply. Weekly
 * levels keep the full multiplier. Campaign content uses the split below.
 */

export interface CampaignCombatScales {
  /** Multiplier for authored hit points. */
  readonly durability: number;
  /** Multiplier for authored speed and the divisor for fire / spawn cadence. */
  readonly pressure: number;
  /** Multiplier for authored contact and projectile damage. */
  readonly hazard: number;
}

const DURABILITY_OF_EXTRA = 0.42;
const PRESSURE_OF_EXTRA = 0.18;
const PRESSURE_CAP = 0.28;
const HAZARD_OF_EXTRA = 0.12;
const HAZARD_CAP = 0.2;

export const isWeeklyRunLevelId = (levelId?: string) => (
  String(levelId || '').startsWith('weekly-run-')
);

export const isAuthoredMajorBossEventId = (eventId?: string) => (
  String(eventId || '').endsWith('-major-boss')
);

export const resolveCampaignCombatScales = (difficulty: number): CampaignCombatScales => {
  const safe = Math.max(0.01, Number(difficulty) || 0);
  const extra = Math.max(0, safe - 1);
  return {
    durability: 1 + extra * DURABILITY_OF_EXTRA,
    pressure: 1 + Math.min(PRESSURE_CAP, extra * PRESSURE_OF_EXTRA),
    hazard: 1 + Math.min(HAZARD_CAP, extra * HAZARD_OF_EXTRA)
  };
};

export const resolveCombatScales = ({
  difficulty,
  levelId,
  eventId
}: {
  difficulty: number;
  levelId?: string;
  eventId?: string;
}): CampaignCombatScales => {
  const safe = Math.max(0.01, Number(difficulty) || 0);
  if (isWeeklyRunLevelId(levelId)) {
    return { durability: safe, pressure: safe, hazard: safe };
  }
  if (isAuthoredMajorBossEventId(eventId)) {
    return { durability: 1, pressure: 1, hazard: 1 };
  }
  return resolveCampaignCombatScales(safe);
};
