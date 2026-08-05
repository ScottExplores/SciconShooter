import type {
  BossEvent,
  EnemyRoleDefinition,
  FormationPackDefinition,
  GameCampaignConfig,
  LevelDefinition,
  SpawnEnemySetting,
  SpawnEvent,
  WaveDefinition
} from '../game-config/types';
import {
  WEEKLY_RUN_INITIAL_STAGE_COUNT as SHARED_WEEKLY_RUN_INITIAL_STAGE_COUNT,
  WEEKLY_RUN_MAJOR_BOSS_INTERVAL as SHARED_WEEKLY_RUN_MAJOR_BOSS_INTERVAL,
  WEEKLY_RUN_MAX_PROOF_STAGE_COUNT as SHARED_WEEKLY_RUN_MAX_PROOF_STAGE_COUNT,
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

/**
 * Materialize true chunks instead of rebuilding the whole runway for every
 * cleared depth. The opening runway is 24 stages; extensions become 40, 56,
 * 72, and so on, capped by the shared receipt-proof limit.
 */
export const getWeeklyRunMaterializedStageCount = (requiredStageCount: number) => {
  const required = Math.max(
    WEEKLY_RUN_INITIAL_STAGE_COUNT,
    Math.min(
      SHARED_WEEKLY_RUN_MAX_PROOF_STAGE_COUNT,
      Math.floor(Number(requiredStageCount) || WEEKLY_RUN_INITIAL_STAGE_COUNT)
    )
  );
  const extensionCount = Math.ceil(
    (required - WEEKLY_RUN_INITIAL_STAGE_COUNT) / WEEKLY_RUN_STAGE_CHUNK
  );
  return Math.min(
    SHARED_WEEKLY_RUN_MAX_PROOF_STAGE_COUNT,
    WEEKLY_RUN_INITIAL_STAGE_COUNT + extensionCount * WEEKLY_RUN_STAGE_CHUNK
  );
};

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

const shuffle = <T>(random: () => number, items: readonly T[]): T[] => {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
};

const orderedEliteBossIds = (campaign: GameCampaignConfig) => [...campaign.miniBosses]
  .map((entry, authoredIndex) => ({ entry, authoredIndex }))
  .sort((left, right) => (
    left.entry.recommendedPower - right.entry.recommendedPower
    || left.entry.threatCost - right.entry.threatCost
    || left.authoredIndex - right.authoredIndex
  ))
  .map(({ entry }) => entry.bossId);

const orderedMajorBossIds = (campaign: GameCampaignConfig) => [...campaign.sectors]
  .map((sector, authoredIndex) => ({ sector, authoredIndex }))
  .sort((left, right) => (
    left.sector.order - right.sector.order
    || left.authoredIndex - right.authoredIndex
  ))
  .map(({ sector }) => sector.majorBossId);

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
  eliteBossIds: orderedEliteBossIds(campaign),
  majorBossIds: orderedMajorBossIds(campaign),
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
  eliteBossIds: orderedEliteBossIds(campaign),
  majorBossIds: orderedMajorBossIds(campaign),
  stageCount
}) as WeeklyRunStagePlan[];

/**
 * Roles available at a given depth.
 *
 * The Weekly Run ignores Campaign introduction schedules -- it is not teaching
 * a curriculum -- but it still opens with the lighter hulls and folds the
 * heavier ones in as the run climbs, so early waves stay readable.
 */
export const getWeeklyRunRoleThreatCeiling = (stageIndex: number) => (
  2 + Math.floor(Math.max(0, stageIndex) / 2)
);

export const getWeeklyRunFormationSector = (stageIndex: number) => (
  1 + Math.floor(Math.max(0, stageIndex) / WEEKLY_RUN_MAJOR_BOSS_INTERVAL)
);

const getWeeklyRunFormationPerformanceCeiling = (stageIndex: number) => (
  14 + Math.floor(Math.max(0, stageIndex) / WEEKLY_RUN_MAJOR_BOSS_INTERVAL) * 2
);

const rolesForDepth = (campaign: GameCampaignConfig, stageIndex: number) => {
  const threatCeiling = getWeeklyRunRoleThreatCeiling(stageIndex);
  const sector = getWeeklyRunFormationSector(stageIndex);
  const pool = campaign.enemyRoles.filter((role) => (
    role.threatCost <= threatCeiling
    && role.introductionSector <= sector
  ));
  return pool.length > 0 ? pool : campaign.enemyRoles;
};

const formationPacksForDepth = (
  campaign: GameCampaignConfig,
  stageIndex: number
): FormationPackDefinition[] => {
  const allowedRoleIds = new Set(rolesForDepth(campaign, stageIndex).map((role) => role.id));
  const sector = getWeeklyRunFormationSector(stageIndex);
  const performanceCeiling = getWeeklyRunFormationPerformanceCeiling(stageIndex);
  return campaign.formationPacks.filter((pack) => (
    pack.minimumSector <= sector
    && pack.mobilePerformanceCost <= performanceCeiling
    && pack.enemyRoleIds.length > 0
    && pack.enemyRoleIds.every((roleId) => allowedRoleIds.has(roleId))
  ));
};

const resolvesUniquelyToPack = (
  target: FormationPackDefinition,
  declared: readonly FormationPackDefinition[]
) => {
  const roleCompatible = declared.filter((candidate) => (
    target.enemyRoleIds.every((roleId) => candidate.enemyRoleIds.includes(roleId))
  ));
  if (roleCompatible.length === 1) return roleCompatible[0].id === target.id;
  const shapeMatches = roleCompatible.filter((candidate) => (
    candidate.formationShape === target.formationShape
  ));
  return shapeMatches.length === 1 && shapeMatches[0].id === target.id;
};

const GUARANTEED_DEBUT_PACK_IDS = new Set([
  'pack-quasar-lance',
  'pack-null-bastion-phalanx',
  'pack-vector-reaver-scissors',
  'pack-rift-weaver-helix',
  'pack-pulse-herald-orbit'
]);

interface WeeklyFormationSelectionState {
  debutedPackIds: Set<string>;
  recentPackIds: Set<string>[];
  recentShapeIds: Set<string>[];
  packUseCounts: Map<string, number>;
  shapeUseCounts: Map<string, number>;
}

const createWeeklyFormationSelectionState = (): WeeklyFormationSelectionState => ({
  debutedPackIds: new Set<string>(),
  recentPackIds: [],
  recentShapeIds: [],
  packUseCounts: new Map<string, number>(),
  shapeUseCounts: new Map<string, number>()
});

const recentUsePenalty = (history: readonly Set<string>[], id: string) => history.reduce(
  (penalty, entries, index) => penalty + (entries.has(id) ? (index === 0 ? 1000 : 260) : 0),
  0
);

/**
 * A Wave declares every pack it uses, while each Spawn still has to resolve to
 * exactly one of those declarations. Avoiding subset/shape ambiguity here
 * keeps authored entry directions and pack admission limits active at runtime.
 */
const selectFormationPackTrain = (
  random: () => number,
  eligible: readonly FormationPackDefinition[],
  eventCount: number,
  currentSector: number,
  state: WeeklyFormationSelectionState
) => {
  const declared: FormationPackDefinition[] = [];
  const randomized = shuffle(random, eligible);
  const randomizedOrder = new Map(randomized.map((pack, index) => [pack.id, index]));
  // A late pack receives one guaranteed showcase when its four-depth debut
  // band opens. After that it rejoins the normal pool; it is never force-fed
  // into every wave of that band.
  const requiredDebuts = randomized.filter((pack) => (
    pack.minimumSector === currentSector
    && GUARANTEED_DEBUT_PACK_IDS.has(pack.id)
    && !state.debutedPackIds.has(pack.id)
  ));
  const ranked = [...randomized]
    .filter((pack) => (
      !requiredDebuts.some((debut) => debut.id === pack.id)
      && !(
        pack.minimumSector === currentSector
        && GUARANTEED_DEBUT_PACK_IDS.has(pack.id)
        && state.debutedPackIds.has(pack.id)
      )
    ))
    .sort((left, right) => {
      const score = (pack: FormationPackDefinition) => (
        recentUsePenalty(state.recentPackIds, pack.id)
        + recentUsePenalty(state.recentShapeIds, pack.formationShape) * 0.45
        + (state.packUseCounts.get(pack.id) ?? 0) * 14
        + (state.shapeUseCounts.get(pack.formationShape) ?? 0) * 2
        + (pack.enemyRoleIds.length < 2 ? 70 : 0)
      );
      return score(left) - score(right)
        || (randomizedOrder.get(left.id) ?? 0) - (randomizedOrder.get(right.id) ?? 0);
    });
  const candidates = [...requiredDebuts, ...ranked];
  for (const candidate of candidates) {
    const next = [...declared, candidate];
    if (!next.every((pack) => resolvesUniquelyToPack(pack, next))) continue;
    declared.push(candidate);
    if (declared.length >= eventCount) break;
  }
  if (declared.length === 0) return { declared, train: [] as FormationPackDefinition[] };
  const train = Array.from({ length: eventCount }, (_, index) => declared[index % declared.length]);
  const usedPackIds = new Set(train.map((pack) => pack.id));
  const usedShapeIds = new Set(train.map((pack) => pack.formationShape));
  for (const pack of train) {
    state.debutedPackIds.add(pack.id);
    state.packUseCounts.set(pack.id, (state.packUseCounts.get(pack.id) ?? 0) + 1);
    state.shapeUseCounts.set(
      pack.formationShape,
      (state.shapeUseCounts.get(pack.formationShape) ?? 0) + 1
    );
  }
  state.recentPackIds = [usedPackIds, ...state.recentPackIds].slice(0, 2);
  state.recentShapeIds = [usedShapeIds, ...state.recentShapeIds].slice(0, 2);
  return { declared, train };
};

const BASE_ENEMY_HEALTH_BY_DURABILITY: Record<EnemyRoleDefinition['durabilityClass'], number> = {
  light: 2.4,
  standard: 3.4,
  armored: 4.8,
  elite: 6.2
};

const buildSpawnEnemySettings = (
  roles: readonly EnemyRoleDefinition[],
  stage: WeeklyRunStagePlan,
  eventIndex: number,
  waveIndex: number
): SpawnEnemySetting[] => {
  const seen = new Set<string>();
  const distinctRoles = roles.filter((role) => (
    seen.has(role.id) ? false : (seen.add(role.id), true)
  ));
  return distinctRoles.map((role, roleIndex, list) => {
    const specialistTuning = role.specialAttack === 'lane-laser'
      ? { projectileSpeed: 4.8, burstCount: 1 }
      : role.specialAttack === 'mine-fan'
        ? { projectileSpeed: 4.4, burstCount: 3 }
        : { projectileSpeed: 4.1, burstCount: 6 };
    return {
      enemyId: role.enemyId,
      spriteKey: role.spriteKey,
      weight: roleIndex === list.length - 1
        ? Number((1 - (list.length - 1) * Math.floor(100 / list.length) / 100).toFixed(4))
        : Math.floor(100 / list.length) / 100,
      // Endless intensity is applied by the Level exactly once. Base hull stats
      // describe role durability instead of multiplying the same curve again.
      health: Number((BASE_ENEMY_HEALTH_BY_DURABILITY[role.durabilityClass]
        + role.threatCost * 0.18).toFixed(2)),
      speed: Number((2.12 + Math.min(0.68, role.threatCost * 0.085)).toFixed(2)),
      damage: 1,
      scoreValue: Math.round(10 + stage.index * 4),
      powerupDropChance: eventIndex === 0 && waveIndex === 0 ? 0.12 : 0,
      roleId: role.id,
      ...(role.specialAttack ? {
        // Keep specialist instances elite for their durability/presentation;
        // the authored role remains authoritative for the actual special move.
        rank: 'elite' as const,
        attackPatternId: 'aimed-burst' as const,
        attackIntervalSeconds: Number(Math.max(2.6, role.fireDelaySeconds + 0.65).toFixed(2)),
        ...specialistTuning
      } : role.fireBehavior === 'aimed-burst' ? {
        projectileSpeed: 5.1,
        burstCount: 3
      } : {})
    };
  });
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

const WEEKLY_RUN_ELITE_BASE_HEALTH = 120;
const WEEKLY_RUN_MAJOR_BASE_HEALTH = 500;

/**
 * Authored bosses keep their visuals, components, weapons, phases, and motion,
 * but their body starts from one Weekly baseline per encounter class. The
 * Level's single intensity multiplier then provides the endless HP curve. This
 * prevents a later Campaign boss from inheriting thousands of base HP when it
 * happens to appear near the start of a Weekly route.
 */
const tuneAuthoredBossEvent = (
  authored: BossEvent,
  stage: WeeklyRunStagePlan
): BossEvent => {
  const normalizedHealth = stage.kind === 'major'
    ? WEEKLY_RUN_MAJOR_BASE_HEALTH
    : WEEKLY_RUN_ELITE_BASE_HEALTH;
  const authoredHealthScale = normalizedHealth / Math.max(1, Number(authored.health) || 1);
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
    health: normalizedHealth,
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
  formationSelectionState: WeeklyFormationSelectionState,
  stage: WeeklyRunStagePlan,
  waveIndex: number,
  absoluteWaveNumber: number,
  template: WaveDefinition
): WaveDefinition => {
  const eligiblePacks = formationPacksForDepth(campaign, stage.index);
  const eventCount = getWeeklyRunFormationEventCount(stage.index);
  const { declared, train } = selectFormationPackTrain(
    random,
    eligiblePacks,
    eventCount,
    getWeeklyRunFormationSector(stage.index),
    formationSelectionState
  );
  if (train.length === 0) {
    throw new Error(`Weekly Run depth ${stage.index + 1} has no eligible authored formation pack.`);
  }
  const events: SpawnEvent[] = [];
  let nextEventStartSeconds = 0;

  for (let index = 0; index < eventCount; index += 1) {
    const pack = train[index];
    const packRoles = pack.enemyRoleIds
      .map((roleId) => campaign.enemyRoles.find((role) => role.id === roleId))
      .filter((role): role is NonNullable<typeof role> => Boolean(role));
    if (packRoles.length === 0) {
      throw new Error(`Weekly Run formation pack ${pack.id} has no resolvable enemy roles.`);
    }
    const enemies = buildSpawnEnemySettings(packRoles, stage, index, waveIndex);
    const count = Math.max(1, Math.min(pack.enemyCount, getWeeklyRunSpawnCount(stage)));
    const spawnIntervalSeconds = Number(Math.max(0.16, 0.46 - stage.index * 0.006).toFixed(3));
    const entrySeconds = count * spawnIntervalSeconds;
    const startSeconds = Number(nextEventStartSeconds.toFixed(2));
    nextEventStartSeconds += Math.max(2.4, Math.min(4.1, entrySeconds * 0.72 + 1.1));

    events.push({
      id: `weekly-run-s${stage.index}-w${waveIndex}-e${index}`,
      kind: 'spawn' as const,
      label: `Squadron ${index + 1}`,
      startSeconds,
      durationSeconds: Number(Math.max(
        8,
        entrySeconds
          + pack.holdSeconds
          + pack.telegraphSeconds
          + pack.attackDurationSeconds
          + pack.attackRecoverySeconds
      ).toFixed(2)),
      delayAfterSeconds: 0,
      blocksWaveClock: false,
      count,
      patternId: pack.formationShape,
      positionId: 'formation-top',
      spawnIntervalSeconds,
      formationBehavior: {
        entryPathId: pack.entryPath,
        movementId: pack.movementBehavior,
        attackId: pack.attackBehavior,
        firingBehavior: pack.firingBehavior,
        returnId: pack.returnBehavior,
        holdSeconds: pack.holdSeconds,
        telegraphSeconds: pack.telegraphSeconds,
        attackDurationSeconds: pack.attackDurationSeconds,
        recoverySeconds: pack.attackRecoverySeconds,
        attackGroupSize: Math.min(count, pack.attackGroupSize),
        attackCycles: pack.attackCycles
      },
      enemies
    });
  }

  const lastEvent = events[events.length - 1];
  const waveDurationSeconds = Math.max(
    16,
    lastEvent.startSeconds
      + lastEvent.count * lastEvent.spawnIntervalSeconds
      + 5
  );

  return {
    ...template,
    id: `weekly-run-stage-${stage.index}-wave-${waveIndex}`,
    name: `Wave ${absoluteWaveNumber}`,
    order: waveIndex + 1,
    completionRule: 'clear-after-duration',
    // Endless intensity lives on Level.startingDifficulty only. Keeping this at
    // one prevents the resolver from squaring the curve.
    difficultyMultiplier: 1,
    durationSeconds: Number(waveDurationSeconds.toFixed(2)),
    introSeconds: 0,
    delayAfterSeconds: 0,
    threatCap: Math.min(46, 16 + Math.round(stage.intensity * 5)),
    combatBudget: 100000,
    formationPackIds: declared.map((pack) => pack.id),
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
    difficultyMultiplier: 1,
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
  const formationSelectionState = createWeeklyFormationSelectionState();
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
        formationSelectionState,
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
