'use strict';

/**
 * Deterministic Weekly Run route authority shared by the browser generator and
 * the CommonJS API validators. Keep this module data-only: server receipts must
 * be able to reconstruct a route without importing the browser game runtime.
 */

const WEEKLY_RUN_MIN_WAVES_PER_STAGE = 2;
const WEEKLY_RUN_MAX_WAVES_PER_STAGE = 3;
const WEEKLY_RUN_MAJOR_BOSS_INTERVAL = 4;
const WEEKLY_RUN_INITIAL_STAGE_COUNT = 24;
const WEEKLY_RUN_STAGE_CHUNK = 16;
const WEEKLY_RUN_MAX_PROOF_STAGE_COUNT = 2048;
const WEEKLY_RUN_BOSS_STRENGTH_BAND_SIZE = 2;

const hashSeed = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffle = (random, values) => {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
};

const shuffleInStrengthBands = (random, values) => {
  const output = [];
  for (let index = 0; index < values.length; index += WEEKLY_RUN_BOSS_STRENGTH_BAND_SIZE) {
    output.push(...shuffle(
      random,
      values.slice(index, index + WEEKLY_RUN_BOSS_STRENGTH_BAND_SIZE)
    ));
  }
  return output;
};

const normalizeIds = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.length > 0)
));

const normalizeStageCount = (value) => Math.max(
  1,
  Math.min(WEEKLY_RUN_MAX_PROOF_STAGE_COUNT, Math.floor(Number(value) || 0))
);

const getWeeklyRunIntensity = (stageIndex) => (
  1 + stageIndex * 0.14 + (stageIndex ** 1.65) * 0.011
);

const getWeeklyRunFormationEventCount = (stageIndex) => (
  2 + Math.min(4, Math.floor(stageIndex / 5))
);

const getWeeklyRunSpawnCount = (stage) => (
  Math.min(28, 5 + Math.round(stage.intensity * 2.25))
);

const weeklyRunNodeId = (stageIndex) => `weekly-run-node-${stageIndex}`;
const weeklyRunMissionId = (stageIndex) => `weekly-run-stage-${stageIndex}`;
const weeklyRunEdgeId = (stageIndex) => `weekly-run-edge-${stageIndex}`;

const parseWeeklyRunNodeIndex = (value) => {
  const match = /^weekly-run-node-(\d+)$/.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isSafeInteger(index) && index >= 0 ? index : null;
};

const buildWeeklyRunStagePlans = (weekKey, {
  eliteBossIds = [],
  majorBossIds = [],
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
} = {}) => {
  const count = normalizeStageCount(stageCount);
  const normalizedWeekKey = String(weekKey);
  const stageRandom = createRandom(hashSeed(`${normalizedWeekKey}:stage-rhythm`));
  const eliteOrder = shuffleInStrengthBands(
    createRandom(hashSeed(`${normalizedWeekKey}:elite-bosses`)),
    normalizeIds(eliteBossIds)
  );
  const majorOrder = shuffleInStrengthBands(
    createRandom(hashSeed(`${normalizedWeekKey}:major-bosses`)),
    normalizeIds(majorBossIds)
  );
  const stages = [];
  let eliteCursor = 0;
  let majorCursor = 0;

  for (let index = 0; index < count; index += 1) {
    const isMajor = (index + 1) % WEEKLY_RUN_MAJOR_BOSS_INTERVAL === 0;
    const waveCount = WEEKLY_RUN_MIN_WAVES_PER_STAGE
      + Math.floor(
        stageRandom()
        * (WEEKLY_RUN_MAX_WAVES_PER_STAGE - WEEKLY_RUN_MIN_WAVES_PER_STAGE + 1)
      );
    let kind = isMajor ? 'major' : 'elite';
    let bossId = null;

    if (isMajor && majorOrder.length > 0) {
      bossId = majorOrder[majorCursor % majorOrder.length];
      majorCursor += 1;
    } else if (eliteOrder.length > 0) {
      bossId = eliteOrder[eliteCursor % eliteOrder.length];
      eliteCursor += 1;
    } else if (majorOrder.length > 0) {
      kind = 'major';
      bossId = majorOrder[majorCursor % majorOrder.length];
      majorCursor += 1;
    } else {
      kind = 'combat';
    }

    stages.push(Object.freeze({
      index,
      kind,
      bossId,
      waveCount,
      intensity: getWeeklyRunIntensity(index)
    }));
  }

  return stages;
};

const buildWeeklyRunGraphDefinition = (weekKey, options = {}) => {
  const stages = buildWeeklyRunStagePlans(weekKey, options);
  const nodes = stages.map((stage) => {
    const nextNodeId = stage.index + 1 < stages.length
      ? weeklyRunNodeId(stage.index + 1)
      : null;
    return {
      nodeId: weeklyRunNodeId(stage.index),
      sectorId: 'weekly-run',
      depth: stage.index + 1,
      routeId: 'weekly-run-main',
      displayLabel: String(stage.index + 1).padStart(2, '0'),
      missionDefinitionId: weeklyRunMissionId(stage.index),
      prerequisiteNodeIds: stage.index === 0 ? [] : [weeklyRunNodeId(stage.index - 1)],
      prerequisiteMode: 'all',
      outgoingEdges: nextNodeId
        ? [{
            edgeId: weeklyRunEdgeId(stage.index),
            toNodeId: nextNodeId,
            routeId: 'weekly-run-main',
            label: 'Deeper',
            kind: 'progression',
            risk: 'moderate',
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
      rewardProfile: 'standard',
      mapPosition: {
        x: 0.5,
        y: stage.index / Math.max(1, stages.length - 1)
      },
      routeControlPoints: [],
      routeSummary: {
        combatIntensity: stage.index < 4 ? 'low' : stage.index < 12 ? 'moderate' : 'high',
        miniBossPresence: stage.kind === 'elite' ? 'single' : 'none',
        rewardType: 'standard',
        recommendedSupportTags: ['anti-swarm', 'lane-control'],
        estimatedWaveCount: stage.waveCount
      }
    };
  });

  return {
    entryNodeId: weeklyRunNodeId(0),
    nodes
  };
};

/**
 * Server-side ceilings reconstructed from the same formulas as the runtime
 * generator. They intentionally include bounded child-spawn slack while still
 * rejecting fabricated five-figure kill totals for one Weekly Run segment.
 */
const getWeeklyRunOutcomeLimits = (stage) => {
  const bossWaveCount = stage.bossId ? 1 : 0;
  const combatWaveCount = Math.max(0, stage.waveCount - bossWaveCount);
  const formationBudget = combatWaveCount
    * getWeeklyRunFormationEventCount(stage.index)
    * getWeeklyRunSpawnCount(stage);
  const nonBossKillCeiling = Math.max(50, formationBudget * 4 + 100);
  return {
    waveCount: stage.waveCount,
    nonBossKillCeiling,
    regularEnemyKillCeiling: nonBossKillCeiling,
    eliteKillCeiling: nonBossKillCeiling,
    miniBossKillCeiling: stage.kind === 'elite' && stage.bossId ? 1 : 0,
    majorBossKillCeiling: stage.kind === 'major' && stage.bossId ? 1 : 0,
    // Generated waves can clear as soon as every spawned enemy is defeated.
    // Their 16-second duration is a timeout, not a minimum play time.
    minimumElapsedMs: Math.max(1_500, combatWaveCount * 1_500),
    parTimeMs: null,
    masteryObjectives: []
  };
};

module.exports = {
  WEEKLY_RUN_BOSS_STRENGTH_BAND_SIZE,
  WEEKLY_RUN_INITIAL_STAGE_COUNT,
  WEEKLY_RUN_MAJOR_BOSS_INTERVAL,
  WEEKLY_RUN_MAX_PROOF_STAGE_COUNT,
  WEEKLY_RUN_MAX_WAVES_PER_STAGE,
  WEEKLY_RUN_MIN_WAVES_PER_STAGE,
  WEEKLY_RUN_STAGE_CHUNK,
  buildWeeklyRunGraphDefinition,
  buildWeeklyRunStagePlans,
  getWeeklyRunFormationEventCount,
  getWeeklyRunIntensity,
  getWeeklyRunOutcomeLimits,
  getWeeklyRunSpawnCount,
  parseWeeklyRunNodeIndex,
  weeklyRunEdgeId,
  weeklyRunMissionId,
  weeklyRunNodeId
};
