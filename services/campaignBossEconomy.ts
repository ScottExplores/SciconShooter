import type { BossId } from '../game-config/types';

export type CampaignBossEconomyMissionOrder =
  | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 | 45 | 50;

export interface CampaignBossEconomyDefinition {
  readonly missionOrder: CampaignBossEconomyMissionOrder;
  readonly bossId: BossId;
  /** Authored hull health before the Mission difficulty multiplier is applied. */
  readonly hullHealth: number;
  /** Optional authored destructible-part health, keyed by the stable runtime component ID. */
  readonly componentHealth?: Readonly<Record<string, number>>;
  /** A full revival adds another complete authored hull bar. */
  readonly fullHullBars: 1 | 2;
}

const economyDefinition = (
  definition: CampaignBossEconomyDefinition
): CampaignBossEconomyDefinition => Object.freeze({
  ...definition,
  ...(definition.componentHealth
    ? { componentHealth: Object.freeze({ ...definition.componentHealth }) }
    : {})
});

/**
 * Approved Campaign boss durability for all ten sector finales.
 *
 * Test Boss choreography and artwork stay authoritative. Promotion changes only
 * these economy fields so moving a boss between Missions is a deliberate balance
 * operation instead of copying its isolated-Sandbox health.
 */
export const CAMPAIGN_BOSS_ECONOMY_BY_MISSION = Object.freeze({
  5: economyDefinition({
    missionOrder: 5,
    bossId: 'gatekeeper-prime',
    hullHealth: 500,
    componentHealth: {
      'left-cannon': 165,
      'right-cannon': 165
    },
    fullHullBars: 1
  }),
  10: economyDefinition({
    missionOrder: 10,
    bossId: 'paywall-decimator',
    hullHealth: 800,
    fullHullBars: 1
  }),
  15: economyDefinition({
    missionOrder: 15,
    bossId: 'prism-moth',
    hullHealth: 1_300,
    fullHullBars: 1
  }),
  20: economyDefinition({
    missionOrder: 20,
    bossId: 'frontier-crownclaw',
    hullHealth: 1_600,
    componentHealth: {
      'left-cannon': 400,
      'right-cannon': 400
    },
    fullHullBars: 1
  }),
  25: economyDefinition({
    missionOrder: 25,
    bossId: 'helios-clawcarrier',
    hullHealth: 2_350,
    componentHealth: {
      'left-cannon': 600,
      'right-cannon': 600
    },
    fullHullBars: 1
  }),
  30: economyDefinition({
    missionOrder: 30,
    bossId: 'nullwake-revenant',
    hullHealth: 2_500,
    fullHullBars: 2
  }),
  35: economyDefinition({
    missionOrder: 35,
    bossId: 'meridian-harrower',
    hullHealth: 3_300,
    fullHullBars: 1
  }),
  40: economyDefinition({
    missionOrder: 40,
    bossId: 'orbit-gyroscope',
    hullHealth: 3_400,
    fullHullBars: 1
  }),
  45: economyDefinition({
    missionOrder: 45,
    bossId: 'hammerhead-siege',
    hullHealth: 3_900,
    fullHullBars: 1
  }),
  50: economyDefinition({
    missionOrder: 50,
    bossId: 'umbra-needlewing',
    hullHealth: 4_800,
    fullHullBars: 1
  })
} satisfies Readonly<Record<CampaignBossEconomyMissionOrder, CampaignBossEconomyDefinition>>);

export const getCampaignBossEconomyDefinition = (
  missionOrder: CampaignBossEconomyMissionOrder
): CampaignBossEconomyDefinition => CAMPAIGN_BOSS_ECONOMY_BY_MISSION[missionOrder];

export interface CampaignBossHealthRecommendationInput {
  readonly missionOrder: CampaignBossEconomyMissionOrder;
  readonly expectedPrimaryDps: number;
  readonly runtimeDifficultyMultiplier: number;
  readonly fullHullBars?: 1 | 2;
  readonly targetSeconds?: number;
  readonly approvedMinimumHull?: number;
  readonly previousMissionHull?: number;
}

const roundUpToFifty = (value: number): number => Math.ceil(value / 50) * 50;

/**
 * Starting point for a future boss move. Designers still playtest the result,
 * but every recommendation uses the same ship-economy inputs and Mission floor.
 */
export const recommendCampaignBossHullHealth = ({
  missionOrder,
  expectedPrimaryDps,
  runtimeDifficultyMultiplier,
  fullHullBars = 1,
  targetSeconds,
  approvedMinimumHull = 0,
  previousMissionHull = 0
}: CampaignBossHealthRecommendationInput): number => {
  const bossSlot = missionOrder / 5;
  const resolvedTargetSeconds = targetSeconds ?? (90 + (3 * (bossSlot - 1)));
  const safeDifficulty = Math.max(0.01, runtimeDifficultyMultiplier);
  const safeDps = Math.max(0, expectedPrimaryDps);
  const dpsCandidate = roundUpToFifty(
    (safeDps * resolvedTargetSeconds) / (safeDifficulty * fullHullBars)
  );
  const missionFloor = 500 + (300 * (bossSlot - 1));
  const progressionFloor = previousMissionHull > 0 ? previousMissionHull + 150 : 0;

  return roundUpToFifty(Math.max(
    dpsCandidate,
    missionFloor,
    approvedMinimumHull,
    progressionFloor
  ));
};

export const getEffectiveCampaignBossHullHealth = (
  definition: CampaignBossEconomyDefinition
): number => definition.hullHealth * definition.fullHullBars;

/**
 * Late commanders grow past the flat 82% phone cap. M20 (1.52) stays at 82%.
 * Revival sizing keeps its own 82% cap and does not use this ladder.
 */
export const getBossViewportWidthCapRatio = (sizeMultiplier: number): number => {
  if (sizeMultiplier <= 1.5) return 1;
  if (sizeMultiplier < 1.7) return 0.82;
  if (sizeMultiplier < 1.9) return 0.88;
  if (sizeMultiplier < 2.1) return 0.93;
  if (sizeMultiplier < 2.3) return 0.96;
  return 0.98;
};
