/**
 * Sector escalation for formation aggression.
 *
 * Scott's brief (2026-08-04): like Galaxiga, deeper Missions should not only
 * field more enemies (tools/author-sector-escalation.mjs scales the blocks)
 * but attack harder. Wave choreography overrides are a hand-authored,
 * inventoried set, so the ramp lives here as a pure function of campaign
 * depth: from sector 5 on, attack groups grow by one (two from sector 8) and
 * the hold/telegraph/recovery windows between dives shrink, bottoming out at
 * the runtime's readable floors.
 */
import type { ResolvedFormationChoreography } from './gameplay/formations';

export const MISSIONS_PER_SECTOR = 5;

export interface SectorAggression {
  readonly sectorOrder: number;
  /** Extra members per attack cycle on top of the pack's authored group size. */
  readonly attackGroupBonus: number;
  /** Multiplier on the quiet hold before the first attack warning. */
  readonly holdScale: number;
  /** Multiplier on the telegraph window before a selected subgroup attacks. */
  readonly telegraphScale: number;
  /** Multiplier on the quiet time after every attack group reforms. */
  readonly recoveryScale: number;
}

const MAX_ATTACK_GROUP_SIZE = 4;
const MIN_HOLD_SECONDS = 0.9;
const MIN_TELEGRAPH_SECONDS = 0.45;
const MIN_RECOVERY_SECONDS = 0.7;

/** Campaign graph depth (1-50 on the main path) -> sector order (1-10). */
export const getSectorOrderForDepth = (depth: number) => Math.max(
  1,
  Math.min(10, Math.ceil(Math.max(1, Math.floor(Number(depth) || 1)) / MISSIONS_PER_SECTOR))
);

export const getSectorAggression = (depth: number): SectorAggression => {
  const sectorOrder = getSectorOrderForDepth(depth);
  if (sectorOrder <= 4) {
    return { sectorOrder, attackGroupBonus: 0, holdScale: 1, telegraphScale: 1, recoveryScale: 1 };
  }
  // Sector 5 -> 10: bonus 1,1,1,2,2,2; hold 0.90 -> 0.75; telegraph 0.95 -> 0.8;
  // recovery 0.9 -> 0.7. Each step is deliberately small so the ramp reads as
  // rising pressure rather than a difficulty cliff.
  const step = sectorOrder - 5;
  return {
    sectorOrder,
    attackGroupBonus: step >= 3 ? 2 : 1,
    holdScale: Number((0.9 - step * 0.03).toFixed(2)),
    telegraphScale: Number((0.95 - step * 0.03).toFixed(2)),
    recoveryScale: Number((0.9 - step * 0.04).toFixed(2))
  };
};

/**
 * Applies the sector's aggression to a resolved choreography. Pure: the same
 * inputs always yield the same cadence, so Campaign and headless simulation
 * agree frame for frame.
 */
export const applySectorAggression = (
  choreography: ResolvedFormationChoreography,
  depth: number
): ResolvedFormationChoreography => {
  const aggression = getSectorAggression(depth);
  if (aggression.attackGroupBonus === 0 && aggression.holdScale === 1) return choreography;
  return {
    ...choreography,
    attackGroupSize: Math.min(MAX_ATTACK_GROUP_SIZE, choreography.attackGroupSize + aggression.attackGroupBonus),
    holdSeconds: Math.max(MIN_HOLD_SECONDS, choreography.holdSeconds * aggression.holdScale),
    telegraphSeconds: Math.max(MIN_TELEGRAPH_SECONDS, choreography.telegraphSeconds * aggression.telegraphScale),
    recoverySeconds: Math.max(MIN_RECOVERY_SECONDS, choreography.recoverySeconds * aggression.recoveryScale)
  };
};
