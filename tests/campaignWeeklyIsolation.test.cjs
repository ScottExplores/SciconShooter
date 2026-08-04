const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const TEST_CAMPAIGN = {
  schemaVersion: 1,
  revision: 22,
  id: 'weekly-isolation-campaign',
  name: 'Weekly Isolation Campaign',
  updatedAt: '2026-07-28T00:00:00.000Z',
  fps: 60,
  recordCard: {},
  hudAssets: {},
  miniBosses: [],
  sectors: [],
  campaignBranches: [],
  levels: [{
    id: 'isolation-mission',
    name: 'Isolation Mission',
    description: 'Campaign-only progression fixture.',
    order: 1,
    backgroundId: 'open-orbit',
    musicId: 'procedural-main',
    startingDifficulty: 1,
    scoreTarget: 1_000,
    durationSeconds: null,
    loopWaves: false,
    availablePowerupIds: [],
    scorecard: { encounterAssetKey: 'MISSION_ONE_ART' },
    campaignProgression: {
      sectorId: 'isolation-sector',
      missionRole: 'introduction',
      combatBudget: 10,
      recommendedPower: { minimum: 1, expected: 2, comfortable: 3 },
      testedLoadouts: { lowPower: 'low', expectedPower: 'expected', upgraded: 'upgraded' },
      recommendedSupportTags: [],
      nextMissionId: null,
      reward: {
        waveClearCoins: 10,
        missionClearCoins: 20,
        firstClearCoins: 30,
        bossFirstClearCoins: 0,
        replayMultiplier: 0.25
      },
      masteryObjectives: [
        { id: 'isolation:clear', label: 'Clear', kind: 'complete', target: 1, rewardCoins: 15 },
        { id: 'isolation:score', label: 'Score 1000', kind: 'score-at-least', target: 1_000, rewardCoins: 20 },
        { id: 'isolation:damage', label: 'No damage', kind: 'damage-at-most', target: 0, rewardCoins: 25 }
      ],
      masterySetBonusCoins: 40
    },
    waves: [
      { id: 'isolation-wave-1', name: 'Approach', order: 1, durationSeconds: 30, events: [] },
      { id: 'isolation-wave-2', name: 'Clear', order: 2, durationSeconds: 30, events: [] }
    ]
  }]
};

const compileService = (name, requires = {}) => {
  const source = fs.readFileSync(path.join(root, 'services', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', compiled)(
    module.exports,
    (request) => requires[request] ?? require(request),
    module
  );
  return module.exports;
};

const branchProgression = compileService('campaignBranchProgression.ts');
const campaignGraph = compileService('campaignGraph.ts');
const campaignProgression = compileService('campaignProgression.ts', {
  '../game-config/catalog': { isMajorBossId: () => false },
  '../services/campaignGraph.ts': campaignGraph,
  './campaignGraph': campaignGraph,
  './campaignBranchProgression': branchProgression,
  './levelConfig': {
    DEFAULT_GAME_CAMPAIGN: TEST_CAMPAIGN,
    flattenLevels: (campaign) => campaign.levels,
    getBackground: () => ({ tint: '#123456' }),
    getPrimaryAssetPath: (key) => `/test-art/${String(key).toLowerCase()}.png`
  }
});

const squadProgression = compileService('squadProgression.ts', {
  './browserImagePreload': {
    preloadDecodedImageUrls: async () => undefined
  },
  '../shared/weeklyCompetitionBoundary.browser': {
    getWeeklyBoundaryMeta: () => ({ weekKey: '2026-07-26' })
  },
  // The browser adapter is TypeScript in the production graph. This CJS
  // harness uses the behavior-identical shared runtime instead of asking Node
  // to resolve a .ts module from transpiled output.
  '../shared/weeklyRunPlan.browser': require('../shared/weeklyRunPlan.js'),
  './playerShipService': {
    PLAYABLE_PLAYER_SHIP_IDS: ['researchhub', 'bio', 'eth', 'btc']
  },
  './miniShipCombatProgression': {
    getMiniShipDamageMultiplier: () => 1,
    getMiniShipFireIntervalFrames: (frames) => frames,
    getMiniShipVolleySize: () => 1
  },
  './weaponTierProgression': {
    FIRE_RATE_LEVELS_PER_TIER: 7,
    FIRE_RATE_MAX_LEVEL: 49,
    getFireRateTier: () => 1,
    getFireRateTierProgress: () => ({ tier: 1, level: 0 })
  },
  './bossArchive': {
    inferLegacyBossArchiveEventIds: () => [],
    normalizeBossArchiveEventIds: (value) => Array.isArray(value) ? value : []
  },
  './bossArchiveProgression': {
    createBossArchiveProgress: () => ({ version: 1, unlockedEventIds: [], seenEventIds: [] }),
    sanitizeBossArchiveProgress: (value, fallback = {}) => ({ ...fallback, ...(value || {}) }),
    mergeBossArchiveProgress: (left, right) => ({ ...left, ...right })
  },
  './campaignGraph': campaignGraph,
  './campaignProgression': campaignProgression,
  './levelConfig': {
    DEFAULT_GAME_CAMPAIGN: TEST_CAMPAIGN
  },
  './weeklyCampaignStreak': {
    sanitizeWeeklyCampaignStreak: (value) => value ?? null,
    mergeWeeklyCampaignStreak: (target, source) => source ?? target ?? null
  }
});

const completion = (overrides = {}) => ({
  resultId: 'campaign-isolation-wave-1',
  playerId: 'pilot:weekly-isolation',
  campaignId: TEST_CAMPAIGN.id,
  campaignRevision: TEST_CAMPAIGN.revision,
  missionId: 'isolation-mission',
  waveId: 'isolation-wave-1',
  stageComplete: false,
  score: 2_500,
  coinsCollected: 11,
  damageTaken: 0,
  elapsedSeconds: 20,
  masteryEligible: true,
  completedAt: '2026-07-28T12:00:00.000Z',
  ...overrides
});

const createWeeklySentinels = () => ({
  squad: {
    ...squadProgression.createWeeklySquadState('pilot:weekly-isolation', '2026-07-26'),
    coins: 777,
    durableCampaignCoins: 13,
    weeklyStats: {
      runs: 9,
      score: 45_678,
      enemiesDefeated: 321,
      coinsEarned: 444
    }
  },
  checkpoint: { mission: 17, wave: 6, bossSequenceId: 'weekly-boss-17' },
  lives: 2,
  bossSequence: ['weekly-boss-17', 'weekly-boss-18'],
  leaderboard: [{ id: 'weekly-leader', name: 'ACE', score: 88_000, wave: 17 }],
  weeklyReward: { allocationRsc: 100, status: 'pending' }
});

test('Campaign per-Wave and final-Mission settlement mutate only Campaign progress', () => {
  const weekly = createWeeklySentinels();
  const before = structuredClone(weekly);
  const fresh = campaignProgression.createCampaignProgress(TEST_CAMPAIGN);

  const internalWave = campaignProgression.applyCampaignCompletion(
    fresh,
    completion(),
    TEST_CAMPAIGN
  );
  assert.equal(internalWave.settlement.accepted, true);
  assert.equal(internalWave.progress.recommendedWaveId, 'isolation-wave-2');
  assert.deepEqual(weekly, before);

  const missionClear = campaignProgression.applyCampaignCompletion(
    internalWave.progress,
    completion({
      resultId: 'campaign-isolation-wave-2',
      waveId: 'isolation-wave-2',
      stageComplete: true,
      completedAt: '2026-07-28T12:01:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  assert.equal(missionClear.settlement.accepted, true);
  assert.equal(missionClear.progress.campaignCompleted, true);
  assert.equal(missionClear.progress.missionRecords['isolation-mission'].completed, true);

  assert.deepEqual(weekly, before, 'Campaign settlement must not mutate weekly state by reference');
  assert.deepEqual(weekly.squad.weeklyStats, before.squad.weeklyStats);
  assert.equal(weekly.squad.coins, 777);
  assert.deepEqual(weekly.checkpoint, before.checkpoint);
  assert.equal(weekly.lives, 2);
  assert.deepEqual(weekly.bossSequence, before.bossSequence);
  assert.deepEqual(weekly.leaderboard, before.leaderboard);
  assert.deepEqual(weekly.weeklyReward, before.weeklyReward);
});

test('crediting Campaign rewards changes only the shared Campaign coin reserve, never weekly competition metrics', () => {
  const weekly = createWeeklySentinels();
  const before = structuredClone(weekly);
  const first = campaignProgression.applyCampaignCompletion(
    campaignProgression.createCampaignProgress(TEST_CAMPAIGN),
    completion(),
    TEST_CAMPAIGN
  );
  const final = campaignProgression.applyCampaignCompletion(
    first.progress,
    completion({
      resultId: 'campaign-isolation-wave-2',
      waveId: 'isolation-wave-2',
      stageComplete: true
    }),
    TEST_CAMPAIGN
  );

  const credit = squadProgression.creditCampaignRewardGrants(
    weekly.squad,
    [...first.settlement.grants, ...final.settlement.grants]
  );
  assert.ok(credit.creditedAmount > 0);
  assert.deepEqual(weekly, before, 'Campaign reward credit must remain immutable');
  assert.equal(credit.state.coins, before.squad.coins + credit.creditedAmount);
  assert.ok(credit.state.durableCampaignCoins > before.squad.durableCampaignCoins);
  assert.deepEqual(credit.state.weeklyStats, before.squad.weeklyStats);
  assert.equal(credit.state.weeklyStats.coinsEarned, 444);
  assert.equal(credit.state.weekKey, before.squad.weekKey);
  assert.deepEqual(credit.state.unlockedSlots, before.squad.unlockedSlots);
  assert.deepEqual(credit.state.ownedMiniShips, before.squad.ownedMiniShips);
  assert.deepEqual(credit.state.equipped, before.squad.equipped);
  assert.deepEqual(credit.state.shipUpgrades, before.squad.shipUpgrades);

  const rolled = squadProgression.rollWeeklySquadStateForward(credit.state, '2026-08-02');
  assert.equal(rolled.weekKey, '2026-08-02');
  assert.deepEqual(rolled.weeklyStats, {
    runs: 0,
    weeklyRunAttempts: 0,
    score: 0,
    enemiesDefeated: 0,
    coinsEarned: 0
  });
  assert.equal(
    rolled.coins,
    squadProgression.WEEKLY_STARTING_COINS + credit.state.durableCampaignCoins
  );
  assert.equal(rolled.durableCampaignCoins, credit.state.durableCampaignCoins);
  assert.deepEqual(rolled.creditedCampaignRewardIds, credit.state.creditedCampaignRewardIds);
  assert.deepEqual(weekly.checkpoint, before.checkpoint);
  assert.equal(weekly.lives, before.lives);
  assert.deepEqual(weekly.leaderboard, before.leaderboard);
});

test('App isolates Campaign reward grants and keeps Campaign off the weekly board', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const campaignHandlerStart = appSource.indexOf('const handleCampaignProgress = useCallback');
  const campaignHandlerEnd = appSource.indexOf('const showWaveVictory = async', campaignHandlerStart);
  assert.ok(campaignHandlerStart >= 0 && campaignHandlerEnd > campaignHandlerStart);
  const campaignSettlementHandlers = appSource.slice(campaignHandlerStart, campaignHandlerEnd);

  for (const forbiddenMutation of [
    'applySquadRunResult(',
    'awardWeeklySquadCoins(',
    'rollWeeklySquadStateForward(',
    'saveScore(',
    'setLeaderboard(',
    'setMonthlyLeaderboard(',
    'setStats(',
    'setContinueCommand('
  ]) {
    assert.equal(
      campaignSettlementHandlers.includes(forbiddenMutation),
      false,
      `Campaign settlement handlers must not call ${forbiddenMutation}`
    );
  }

  assert.match(
    appSource,
    /const isNonCompetitiveRun\s*=\s*isFounderSandboxRun\s*\|\|\s*isBossArchiveRun\s*\|\|\s*isCampaignLabRun\s*\|\|\s*isCampaignBranchRun\s*;/
  );
  assert.doesNotMatch(appSource, /isNonCompetitiveRun\s*=\s*[^;]*isCampaignRun/);
  assert.match(
    appSource,
    /if\s*\(\s*isWeeklyLeaderboardRun\s*&&\s*squadRunAppliedGameIdRef\.current\s*!==\s*gameId\s*\)\s*\{[\s\S]{0,500}?applySquadRunResult\(/
  );
  assert.doesNotMatch(
    appSource,
    /if\s*\(\s*!isNonCompetitiveRun\s*&&\s*squadRunAppliedGameIdRef\.current\s*!==\s*gameId\s*\)/
  );
  assert.match(appSource, /coinsCollected:\s*stats\.coins/);
  assert.match(
    appSource,
    /if\s*\(\s*!isNonCompetitiveRun\s*&&\s*permanentRunAppliedGameIdRef\.current\s*!==\s*gameId\s*\)[\s\S]{0,500}?recordLifetimeRun\(/
  );
  assert.match(
    appSource,
    /if\s*\(\s*!isCampaignRun\s*&&\s*!isNonCompetitiveRun\s*&&\s*summary\.bossEncounterId\s*\)/
  );
  // Campaign is progression, not a weekly entry. The name prompt and the
  // submit path hang off leaderboard eligibility, which excludes Campaign,
  // while the payout paths above still run for it.
  assert.match(appSource, /const isWeeklyLeaderboardRun = isWeeklyCampaignRun && !isNonCompetitiveRun;/);
  assert.match(appSource, /setShowNameInput\(isWeeklyLeaderboardRun\)/);
  assert.match(
    appSource,
    /const persistHighScore\s*=\s*async\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,200}?if\s*\(\s*!isWeeklyLeaderboardRun\s*\|\|/
  );
});
