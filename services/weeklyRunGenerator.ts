import type {
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition
} from '../game-config/types';
import { DEFAULT_GAME_CAMPAIGN } from './levelConfig';

/**
 * Weekly Run is an endless escalating gauntlet, generated fresh each week.
 *
 * It used to be an *ordering of Campaign missions*, which tied the weekly
 * competition to Campaign content and capped it at 27 authored missions. It is
 * now its own thing entirely: waves are composed procedurally from the enemy
 * catalog, they never stop coming, and they get harder the deeper the player
 * goes. Nothing here reads Campaign progress, unlocks, or mission definitions.
 *
 * Every player gets the *same* run in a given week -- the generator is seeded
 * from the week key -- so the leaderboard stays a fair comparison, while the
 * mix of bosses and formations differs week to week.
 */

export const WEEKLY_RUN_STARTING_LIVES = 10;

/** Waves inside one stage. The last wave of a boss stage is the encounter. */
export const WEEKLY_RUN_WAVES_PER_STAGE = 4;

/**
 * Stage cadence. Elite bosses arrive early and often; major bosses are the
 * milestone every fifth stage. Depth 40 is not a cap the player can reach on
 * ten lives -- it is where generation stops because nothing survives that far.
 */
export const WEEKLY_RUN_ELITE_STAGE_INTERVAL = 2;
export const WEEKLY_RUN_MAJOR_STAGE_INTERVAL = 5;
export const WEEKLY_RUN_STAGE_COUNT = 40;

/** Deterministic 32-bit hash, so a week key becomes a stable seed. */
const hashSeed = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

/** mulberry32: small, fast, and identical across every device for a given seed. */
const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(random: () => number, items: readonly T[]): T => (
  items[Math.floor(random() * items.length) % items.length]
);

const shuffle = <T>(random: () => number, items: readonly T[]): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
};

/**
 * A linear graph over the generated stages.
 *
 * The weekly streak, scoring, and finalization machinery is graph-driven, and
 * it works well -- an endless run is just a graph with no branches. Emitting
 * one here keeps all of that intact instead of rewriting it, and the run still
 * has no connection to the Campaign graph.
 */
export const buildWeeklyRunGraph = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  stageCount = WEEKLY_RUN_STAGE_COUNT
) => {
  const stages = planWeeklyRunStages(weekKey, campaign, stageCount);
  const nodeIdFor = (index: number) => `weekly-run-node-${index}`;

  const nodes = stages.map((stage) => {
    const next = stage.index + 1 < stages.length ? nodeIdFor(stage.index + 1) : null;
    return {
      nodeId: nodeIdFor(stage.index),
      sectorId: 'weekly-run',
      depth: stage.index + 1,
      routeId: 'weekly-run-main',
      displayLabel: String(stage.index + 1).padStart(2, '0'),
      missionDefinitionId: `weekly-run-stage-${stage.index}`,
      prerequisiteNodeIds: stage.index === 0 ? [] : [nodeIdFor(stage.index - 1)],
      prerequisiteMode: 'all' as const,
      outgoingEdges: next
        ? [{
            edgeId: `weekly-run-edge-${stage.index}`,
            toNodeId: next,
            routeId: 'weekly-run-main',
            label: 'Deeper',
            kind: 'progression' as const,
            risk: 'moderate' as const,
            // Deeper waves are worth more, which is what makes depth the thing
            // players actually compete on.
            weeklyScoreMultiplier: Number((1 + stage.index * 0.06).toFixed(3))
          }]
        : [],
      rejoinNodeId: null,
      optional: false,
      mainPath: true,
      masteryBranch: false,
      oneTime: false,
      bossId: stage.kind === 'major' ? stage.bossId : null,
      miniBossIds: stage.kind === 'elite' && stage.bossId ? [stage.bossId] : [],
      weeklyStreakEligible: true,
      weeklyScoreMultiplier: Number((1 + stage.index * 0.06).toFixed(3)),
      recommendedPower: {
        minimum: Math.round(800 + stage.index * 190),
        expected: Math.round(1050 + stage.index * 240),
        comfortable: Math.round(1350 + stage.index * 300)
      },
      rewardProfile: 'standard' as const,
      mapPosition: { x: 0.5, y: stage.index / Math.max(1, stages.length - 1) },
      routeControlPoints: [],
      routeSummary: {
        combatIntensity: (stage.index < 4 ? 'low' : stage.index < 12 ? 'moderate' : 'high') as
          'low' | 'moderate' | 'high',
        miniBossPresence: (stage.kind === 'elite' ? 'single' : 'none') as 'single' | 'none',
        rewardType: 'standard' as const,
        recommendedSupportTags: ['anti-swarm', 'lane-control'],
        estimatedWaveCount: WEEKLY_RUN_WAVES_PER_STAGE
      }
    };
  });

  return {
    entryNodeId: nodeIdFor(0),
    nodes: nodes as unknown as GameCampaignConfig['campaignGraph']['nodes']
  };
};

export type WeeklyRunStageKind = 'combat' | 'elite' | 'major';

export interface WeeklyRunStagePlan {
  index: number;
  kind: WeeklyRunStageKind;
  bossId: string | null;
  /** 1.0 at the start, climbing without bound as the run goes deeper. */
  intensity: number;
}

/**
 * Difficulty curve. Deliberately gentle early -- the first two stages should
 * feel winnable by anyone who just unlocked the mode -- then compounding, so a
 * deep run is genuinely dangerous rather than merely long.
 */
export const getWeeklyRunIntensity = (stageIndex: number) => (
  1 + stageIndex * 0.14 + (stageIndex ** 1.65) * 0.011
);

export const planWeeklyRunStages = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  stageCount = WEEKLY_RUN_STAGE_COUNT
): WeeklyRunStagePlan[] => {
  const random = createRandom(hashSeed(`${weekKey}:stages`));

  const eliteIds = campaign.miniBosses.map((entry) => entry.bossId).filter(Boolean);
  const majorIds = [...new Set(
    campaign.sectors.map((sector) => sector.majorBossId).filter(Boolean)
  )];

  // Shuffled per week so the run is a different sequence of fights each time,
  // then cycled so depth never runs out of bosses.
  const eliteOrder = shuffle(random, eliteIds);
  const majorOrder = shuffle(random, majorIds);

  const stages: WeeklyRunStagePlan[] = [];
  let eliteCursor = 0;
  let majorCursor = 0;

  for (let index = 0; index < stageCount; index += 1) {
    const stageNumber = index + 1;
    const isMajor = stageNumber % WEEKLY_RUN_MAJOR_STAGE_INTERVAL === 0;
    const isElite = !isMajor && stageNumber % WEEKLY_RUN_ELITE_STAGE_INTERVAL === 0;

    let kind: WeeklyRunStageKind = 'combat';
    let bossId: string | null = null;
    if (isMajor && majorOrder.length > 0) {
      kind = 'major';
      bossId = majorOrder[majorCursor % majorOrder.length];
      majorCursor += 1;
    } else if (isElite && eliteOrder.length > 0) {
      kind = 'elite';
      bossId = eliteOrder[eliteCursor % eliteOrder.length];
      eliteCursor += 1;
    }

    stages.push({ index, kind, bossId, intensity: getWeeklyRunIntensity(index) });
  }

  return stages;
};

/**
 * Roles available at a given depth.
 *
 * The Weekly Run ignores Campaign introduction schedules -- it is not teaching
 * a curriculum -- but it still opens with the lighter hulls and folds the
 * heavier ones in as the run climbs, so early waves stay readable.
 */
const rolesForDepth = (campaign: GameCampaignConfig, stageIndex: number) => {
  const ceiling = 1 + Math.floor(stageIndex / 2);
  const pool = campaign.enemyRoles.filter((role) => role.threatCost <= Math.max(2, ceiling + 1));
  return pool.length > 0 ? pool : campaign.enemyRoles;
};

const FORMATION_PATTERNS = ['grid', 'v', 'diamond', 'row', 'sine', 'spiral', 'pincer'] as const;
const SPAWN_POSITIONS = ['formation-top', 'formation-left', 'formation-right'] as const;

const buildCombatWave = (
  campaign: GameCampaignConfig,
  random: () => number,
  stage: WeeklyRunStagePlan,
  waveIndex: number,
  template: WaveDefinition
): WaveDefinition => {
  const roles = rolesForDepth(campaign, stage.index);
  const packs = campaign.formationPacks;
  const eventCount = 2 + Math.min(3, Math.floor(stage.index / 6));
  const events = [];

  for (let index = 0; index < eventCount; index += 1) {
    const pack = pick(random, packs);
    const packRoles = pack.enemyRoleIds
      .map((roleId) => campaign.enemyRoles.find((role) => role.id === roleId))
      .filter((role): role is NonNullable<typeof role> => Boolean(role));
    const chosen = packRoles.length > 0 ? packRoles : [pick(random, roles)];
    const seen = new Set<string>();
    const enemies = chosen
      .filter((role) => (seen.has(role.enemyId) ? false : (seen.add(role.enemyId), true)))
      .map((role, roleIndex, list) => ({
        enemyId: role.enemyId,
        spriteKey: role.spriteKey,
        weight: roleIndex === list.length - 1
          ? Number((1 - (list.length - 1) * Math.floor(100 / list.length) / 100).toFixed(4))
          : Math.floor(100 / list.length) / 100,
        health: Number((2 + stage.intensity * 2.1).toFixed(2)),
        speed: Number((2.1 + stage.intensity * 0.28).toFixed(2)),
        damage: 1,
        scoreValue: Math.round(10 + stage.index * 4),
        powerupDropChance: index === 0 && waveIndex === 0 ? 0.12 : 0,
        roleId: role.id
      }));

    events.push({
      id: `weekly-run-s${stage.index}-w${waveIndex}-e${index}`,
      kind: 'spawn' as const,
      label: `Squadron ${index + 1}`,
      startSeconds: Number((index * (2.6 - Math.min(1.2, stage.index * 0.03))).toFixed(2)),
      durationSeconds: 8,
      delayAfterSeconds: 0,
      blocksWaveClock: false,
      count: Math.min(22, 5 + Math.round(stage.intensity * 2.2)),
      patternId: pick(random, FORMATION_PATTERNS),
      positionId: index === 0 ? 'formation-top' : pick(random, SPAWN_POSITIONS),
      spawnIntervalSeconds: Number(Math.max(0.16, 0.5 - stage.index * 0.008).toFixed(3)),
      enemies
    });
  }

  return {
    ...template,
    id: `weekly-run-stage-${stage.index}-wave-${waveIndex}`,
    name: `Wave ${stage.index * WEEKLY_RUN_WAVES_PER_STAGE + waveIndex + 1}`,
    order: waveIndex + 1,
    completionRule: 'clear-after-duration',
    difficultyMultiplier: Number(stage.intensity.toFixed(3)),
    durationSeconds: 16,
    introSeconds: 0,
    delayAfterSeconds: 0,
    threatCap: Math.min(46, 16 + Math.round(stage.intensity * 5)),
    combatBudget: 100000,
    formationPackIds: [],
    events
  } as WaveDefinition;
};

const buildBossWave = (
  stage: WeeklyRunStagePlan,
  waveIndex: number,
  template: WaveDefinition
): WaveDefinition => ({
  ...template,
  id: `weekly-run-stage-${stage.index}-boss`,
  name: stage.kind === 'major' ? 'Major Boss' : 'Elite Boss',
  order: waveIndex + 1,
  completionRule: 'boss-defeat',
  difficultyMultiplier: Number(stage.intensity.toFixed(3)),
  durationSeconds: 30,
  introSeconds: stage.kind === 'major' ? 2 : 1,
  delayAfterSeconds: 2,
  threatCap: 30,
  combatBudget: 100000,
  formationPackIds: [],
  events: [{
    id: `weekly-run-stage-${stage.index}-boss-event`,
    kind: 'boss' as const,
    label: stage.kind === 'major' ? 'Major boss' : 'Elite boss',
    startSeconds: 0,
    durationSeconds: 30,
    delayAfterSeconds: 0,
    blocksWaveClock: true,
    bossId: stage.bossId as string,
    warningSeconds: stage.kind === 'major' ? 2.4 : 1.6,
    // Bosses scale with depth too, so the fifth time the run cycles back to a
    // boss it is a materially harder fight than the first.
    healthMultiplier: Number(stage.intensity.toFixed(3))
  }]
} as unknown as WaveDefinition);

/**
 * Builds the endless run for a week. The engine walks `levels` by `order`, so
 * the whole gauntlet is one continuous run: clearing a boss rolls straight into
 * the next stage rather than returning home.
 */
export const buildWeeklyRunCampaign = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  stageCount = WEEKLY_RUN_STAGE_COUNT
): GameCampaignConfig => {
  const stages = planWeeklyRunStages(weekKey, campaign, stageCount);
  const random = createRandom(hashSeed(`${weekKey}:waves`));
  const templateLevel = campaign.levels[0];
  const templateWave = templateLevel?.waves[0];
  if (!templateLevel || !templateWave) {
    throw new Error('Weekly Run generation needs at least one authored level as a structural template.');
  }

  const backgrounds = [...new Set(campaign.levels.map((level) => level.backgroundId))];
  const musicIds = [...new Set(campaign.levels.map((level) => level.musicId))];

  const levels: LevelDefinition[] = stages.map((stage) => {
    const combatWaveCount = stage.kind === 'combat'
      ? WEEKLY_RUN_WAVES_PER_STAGE
      : WEEKLY_RUN_WAVES_PER_STAGE - 1;

    const waves: WaveDefinition[] = [];
    for (let waveIndex = 0; waveIndex < combatWaveCount; waveIndex += 1) {
      waves.push(buildCombatWave(campaign, random, stage, waveIndex, templateWave));
    }
    if (stage.kind !== 'combat' && stage.bossId) {
      waves.push(buildBossWave(stage, combatWaveCount, templateWave));
    }

    return {
      ...templateLevel,
      id: `weekly-run-stage-${stage.index}`,
      name: `Depth ${stage.index + 1}`,
      description: stage.kind === 'major'
        ? 'A major boss holds this depth.'
        : stage.kind === 'elite'
          ? 'An elite boss is inbound.'
          : 'Hostile squadrons, escalating.',
      order: stage.index,
      backgroundId: backgrounds[stage.index % backgrounds.length] ?? templateLevel.backgroundId,
      musicId: musicIds[stage.index % musicIds.length] ?? templateLevel.musicId,
      startingDifficulty: Number(stage.intensity.toFixed(3)),
      scoreTarget: 0,
      durationSeconds: null,
      loopWaves: false,
      waves
    } as LevelDefinition;
  });

  // The run carries its own graph and a single synthetic sector, so nothing
  // downstream has to reach into the Campaign to understand it.
  return {
    ...campaign,
    id: `weekly-run-${weekKey}`,
    levels,
    sectors: [{
      ...campaign.sectors[0],
      id: 'weekly-run',
      name: 'Weekly Run',
      order: 1,
      missionIds: levels.map((level) => level.id),
      mainNodeIds: levels.map((_, index) => `weekly-run-node-${index}`),
      routeNodeIds: [],
      branchIds: []
    }] as unknown as GameCampaignConfig['sectors'],
    campaignGraph: buildWeeklyRunGraph(weekKey, campaign, stageCount)
  } as GameCampaignConfig;
};

/** First stage of the run, used as the engine's entry point. */
export const getWeeklyRunEntryPoint = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN
) => {
  const run = buildWeeklyRunCampaign(weekKey, campaign, 1);
  const first = run.levels[0];
  if (!first) return null;
  return { levelId: first.id, waveId: first.waves[0]?.id ?? null };
};

/** Depth reached, 1-based, from a generated stage id. */
export const getWeeklyRunDepth = (missionId: string | null | undefined) => {
  const match = /^weekly-run-stage-(\d+)$/.exec(missionId ?? '');
  return match ? Number(match[1]) + 1 : 0;
};

export const isWeeklyRunMissionId = (missionId: string | null | undefined) => (
  /^weekly-run-stage-\d+$/.test(missionId ?? '')
);
