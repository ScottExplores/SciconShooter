import type {
  BossEvent,
  GameCampaignConfig,
  LevelDefinition,
  WaveDefinition
} from '../game-config/types';
import {
  WEEKLY_RUN_INITIAL_STAGE_COUNT as SHARED_WEEKLY_RUN_INITIAL_STAGE_COUNT,
  WEEKLY_RUN_MAJOR_BOSS_INTERVAL as SHARED_WEEKLY_RUN_MAJOR_BOSS_INTERVAL,
  WEEKLY_RUN_MAX_WAVES_PER_STAGE as SHARED_WEEKLY_RUN_MAX_WAVES_PER_STAGE,
  WEEKLY_RUN_MIN_WAVES_PER_STAGE as SHARED_WEEKLY_RUN_MIN_WAVES_PER_STAGE,
  WEEKLY_RUN_STAGE_CHUNK as SHARED_WEEKLY_RUN_STAGE_CHUNK,
  buildWeeklyRunGraphDefinition,
  buildWeeklyRunStagePlans,
  getWeeklyRunFormationEventCount,
  getWeeklyRunIntensity as getSharedWeeklyRunIntensity,
  getWeeklyRunSpawnCount
} from '../shared/weeklyRunPlan.browser';
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

/** Each generated segment ends with a boss, two or three waves after the last. */
export const WEEKLY_RUN_MIN_WAVES_PER_STAGE = SHARED_WEEKLY_RUN_MIN_WAVES_PER_STAGE;
export const WEEKLY_RUN_MAX_WAVES_PER_STAGE = SHARED_WEEKLY_RUN_MAX_WAVES_PER_STAGE;

/** Major encounters punctuate the more frequent elite fights. */
export const WEEKLY_RUN_MAJOR_BOSS_INTERVAL = SHARED_WEEKLY_RUN_MAJOR_BOSS_INTERVAL;

/**
 * Only this much deterministic runway is materialized at once. App extends it
 * in chunks before the player reaches the edge, so this is not a gameplay cap.
 */
export const WEEKLY_RUN_INITIAL_STAGE_COUNT = SHARED_WEEKLY_RUN_INITIAL_STAGE_COUNT;
export const WEEKLY_RUN_STAGE_CHUNK = SHARED_WEEKLY_RUN_STAGE_CHUNK;

/** @deprecated Kept for older tooling; it is the initial materialized runway. */
export const WEEKLY_RUN_STAGE_COUNT = WEEKLY_RUN_INITIAL_STAGE_COUNT;

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
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
) => buildWeeklyRunGraphDefinition(weekKey, {
  eliteBossIds: campaign.miniBosses.map((entry) => entry.bossId),
  majorBossIds: campaign.sectors.map((sector) => sector.majorBossId),
  stageCount
}) as GameCampaignConfig['campaignGraph'];

export type WeeklyRunStageKind = 'combat' | 'elite' | 'major';

export interface WeeklyRunStagePlan {
  index: number;
  kind: WeeklyRunStageKind;
  bossId: string | null;
  /** Total waves since the previous boss, including this segment's boss wave. */
  waveCount: number;
  /** 1.0 at the start, climbing without bound as the run goes deeper. */
  intensity: number;
}

/**
 * Difficulty curve. Deliberately gentle early -- the first two stages should
 * feel winnable by anyone who just unlocked the mode -- then compounding, so a
 * deep run is genuinely dangerous rather than merely long.
 */
export const getWeeklyRunIntensity = (stageIndex: number) => (
  getSharedWeeklyRunIntensity(stageIndex)
);

export const planWeeklyRunStages = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
): WeeklyRunStagePlan[] => buildWeeklyRunStagePlans(weekKey, {
  eliteBossIds: campaign.miniBosses.map((entry) => entry.bossId),
  majorBossIds: campaign.sectors.map((sector) => sector.majorBossId),
  stageCount
}) as WeeklyRunStagePlan[];

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

const formationPatternsForDepth = (stageIndex: number) => {
  if (stageIndex < 3) return FORMATION_PATTERNS.slice(0, 3);
  if (stageIndex < 8) return FORMATION_PATTERNS.slice(0, 5);
  return FORMATION_PATTERNS;
};

/**
 * Finds the earliest authored occurrence of a boss and returns an isolated
 * copy. A boss id alone is not enough for the runtime to spawn an encounter:
 * the sprite, movement, durability, weapons, phases, and optional timeline are
 * all part of the authored event contract.
 */
const resolveAuthoredBossEvent = (
  campaign: GameCampaignConfig,
  bossId: string
): BossEvent | null => {
  const orderedLevels = [...campaign.levels].sort((left, right) => left.order - right.order);
  for (const level of orderedLevels) {
    const orderedWaves = [...level.waves].sort((left, right) => left.order - right.order);
    for (const wave of orderedWaves) {
      const authored = wave.events.find((event): event is BossEvent => (
        event.kind === 'boss' && event.bossId === bossId
      ));
      if (authored) return structuredClone(authored);
    }
  }
  return null;
};

const roundBossTuning = (value: number) => Number(value.toFixed(3));

/**
 * The wave difficulty multiplier remains the primary endless-run curve. This
 * small authored-health ramp gives the opening elites a fair runway without
 * inventing runtime-only fields that the campaign schema cannot validate.
 */
const tuneAuthoredBossEvent = (
  authored: BossEvent,
  stage: WeeklyRunStagePlan
): BossEvent => {
  const authoredHealthScale = Math.min(1, 0.82 + stage.index * 0.06);
  const warningTarget = Math.max(
    1.1,
    (stage.kind === 'major' ? 2.6 : 2.1) - stage.index * 0.025
  );

  return {
    ...authored,
    id: `weekly-run-stage-${stage.index}-boss-event`,
    startSeconds: 0,
    delayAfterSeconds: 0,
    blocksWaveClock: true,
    warningSeconds: roundBossTuning(Math.min(authored.durationSeconds, warningTarget)),
    health: roundBossTuning(authored.health * authoredHealthScale),
    ...(authored.componentHealth ? {
      componentHealth: Object.fromEntries(
        Object.entries(authored.componentHealth).map(([componentId, health]) => [
          componentId,
          roundBossTuning(Number(health) * authoredHealthScale)
        ])
      ) as BossEvent['componentHealth']
    } : {})
  };
};

const buildCombatWave = (
  campaign: GameCampaignConfig,
  random: () => number,
  stage: WeeklyRunStagePlan,
  waveIndex: number,
  absoluteWaveNumber: number,
  template: WaveDefinition
): WaveDefinition => {
  const roles = rolesForDepth(campaign, stage.index);
  const packs = campaign.formationPacks;
  const patterns = formationPatternsForDepth(stage.index);
  const eventCount = getWeeklyRunFormationEventCount(stage.index);
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
      count: getWeeklyRunSpawnCount(stage),
      patternId: pick(random, patterns),
      positionId: index === 0 ? 'formation-top' : pick(random, SPAWN_POSITIONS),
      spawnIntervalSeconds: Number(Math.max(0.12, 0.5 - stage.index * 0.008).toFixed(3)),
      enemies
    });
  }

  return {
    ...template,
    id: `weekly-run-stage-${stage.index}-wave-${waveIndex}`,
    name: `Wave ${absoluteWaveNumber}`,
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
  campaign: GameCampaignConfig,
  stage: WeeklyRunStagePlan,
  waveIndex: number,
  absoluteWaveNumber: number,
  template: WaveDefinition
): WaveDefinition => {
  if (!stage.bossId) {
    throw new Error(`Weekly Run depth ${stage.index + 1} has no boss id.`);
  }
  const authored = resolveAuthoredBossEvent(campaign, stage.bossId);
  if (!authored) {
    throw new Error(`Weekly Run could not resolve authored boss event: ${stage.bossId}`);
  }
  const bossEvent = tuneAuthoredBossEvent(authored, stage);

  return {
    ...template,
    id: `weekly-run-stage-${stage.index}-boss`,
    name: `Wave ${absoluteWaveNumber} - ${stage.kind === 'major' ? 'Major Boss' : 'Elite Boss'}`,
    order: waveIndex + 1,
    // The validator distinguishes canonical major bosses from minibosses.
    completionRule: stage.kind === 'major' ? 'boss-defeat' : 'clear-after-duration',
    difficultyMultiplier: Number(stage.intensity.toFixed(3)),
    durationSeconds: Math.max(30, bossEvent.durationSeconds),
    introSeconds: stage.kind === 'major' ? 2 : 1,
    delayAfterSeconds: 2,
    threatCap: 30,
    combatBudget: 100000,
    formationPackIds: [],
    events: [bossEvent]
  } as WaveDefinition;
};

/**
 * Builds the endless run for a week. The engine walks `levels` by `order`, so
 * the whole gauntlet is one continuous run: clearing a boss rolls straight into
 * the next stage rather than returning home.
 */
export const buildWeeklyRunCampaign = (
  weekKey: string,
  campaign: GameCampaignConfig = DEFAULT_GAME_CAMPAIGN,
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
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

  let absoluteWaveOffset = 0;
  const levels: LevelDefinition[] = stages.map((stage) => {
    const combatWaveCount = stage.bossId ? stage.waveCount - 1 : stage.waveCount;

    const waves: WaveDefinition[] = [];
    for (let waveIndex = 0; waveIndex < combatWaveCount; waveIndex += 1) {
      waves.push(buildCombatWave(
        campaign,
        random,
        stage,
        waveIndex,
        absoluteWaveOffset + waveIndex + 1,
        templateWave
      ));
    }
    if (stage.bossId) {
      waves.push(buildBossWave(
        campaign,
        stage,
        combatWaveCount,
        absoluteWaveOffset + combatWaveCount + 1,
        templateWave
      ));
    }
    absoluteWaveOffset += waves.length;

    return {
      ...templateLevel,
      id: `weekly-run-stage-${stage.index}`,
      name: `Depth ${stage.index + 1}`,
      description: stage.kind === 'major'
        ? 'A major boss holds this depth.'
        : 'An elite boss is inbound.',
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
