const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const TEST_CAMPAIGN = {
  schemaVersion: 1,
  revision: 7,
  id: 'test-campaign',
  name: 'Test Campaign',
  updatedAt: '2026-07-26T00:00:00.000Z',
  fps: 60,
  recordCard: {},
  hudAssets: {},
  miniBosses: [{ bossId: 'test-elite' }],
  sectors: [{ majorBossId: 'gatekeeper', missionIds: ['mission-1', 'mission-2'] }],
  campaignBranches: [{
    branchId: 'mission-1-supply-cache',
    sourceMissionId: 'mission-1',
    requiredStars: 3,
    missionType: 'present-drop',
    oneTimeCompletion: true,
    replayPolicy: 'one-time',
    completionReward: { coins: 250 },
    missionDefinition: {}
  }],
  levels: [
    {
      id: 'mission-1',
      name: 'Open Orbit',
      description: 'Clear the opening route.',
      order: 1,
      backgroundId: 'open-orbit',
      musicId: 'procedural-main',
      startingDifficulty: 1,
      scoreTarget: 2_000,
      durationSeconds: null,
      loopWaves: false,
      availablePowerupIds: [],
      scorecard: { encounterAssetKey: 'MISSION_ONE_ART' },
      waves: [
        {
          id: 'mission-1-wave-1',
          name: 'Approach',
          order: 1,
          durationSeconds: 30,
          events: []
        },
        {
          id: 'mission-1-wave-2',
          name: 'Checkpoint',
          order: 2,
          durationSeconds: 30,
          events: []
        }
      ]
    },
    {
      id: 'mission-2',
      name: 'Paywall Siege',
      description: 'Break the first Gatekeeper.',
      order: 2,
      backgroundId: 'paywall-siege',
      musicId: 'procedural-main',
      startingDifficulty: 1.2,
      scoreTarget: 4_000,
      durationSeconds: null,
      loopWaves: false,
      availablePowerupIds: [],
      scorecard: { encounterAssetKey: 'MISSION_TWO_ART' },
      waves: [
        {
          id: 'mission-2-wave-1',
          name: 'Breach',
          order: 1,
          durationSeconds: 40,
          events: []
        },
        {
          id: 'mission-2-wave-2',
          name: 'Gatekeeper',
          order: 2,
          durationSeconds: 50,
          events: [{
            id: 'paywall-gatekeeper-event',
            kind: 'boss',
            bossId: 'gatekeeper',
            label: 'Paywall Gatekeeper',
            spriteKey: 'MAJOR_BOSS_ART'
          }]
        }
      ]
    }
  ]
};

const levelConfigStub = {
  DEFAULT_GAME_CAMPAIGN: TEST_CAMPAIGN,
  flattenLevels: (campaign) => campaign.levels,
  getBackground: (backgroundId) => ({ tint: backgroundId === 'open-orbit' ? '#123456' : '#654321' }),
  getPrimaryAssetPath: (assetKey) => `/test-art/${String(assetKey).toLowerCase()}.png`
};

const compileService = (name, requires = {}) => {
  const source = fs.readFileSync(path.join(root, 'services', name), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => requires[request] ?? require(request);
  Function('exports', 'require', 'module', compiled)(module.exports, localRequire, module);
  return module.exports;
};

const branchProgression = compileService('campaignBranchProgression.ts');
const campaignGraph = compileService('campaignGraph.ts');

const progression = compileService('campaignProgression.ts', {
  '../game-config/catalog': {
    isMajorBossId: (bossId) => [
      'gatekeeper',
      'gatekeeper-prime',
      'paywall-decimator',
      'helios-clawcarrier',
      'eclipse-engine',
      'helix-leviathan',
      'research-tribunal',
      'prism-moth',
      'rail-serpent',
      'singularity-crab',
      'orbit-gyroscope',
      'hammerhead-siege',
      'frontier-crownclaw',
      'nullwake-revenant'
    ].includes(bossId)
  },
  '../services/campaignGraph.ts': campaignGraph,
  '../shared/weeklyRunPlan.browser': require('../shared/weeklyRunPlan.js'),
  './campaignGraph': campaignGraph,
  './campaignBranchProgression': branchProgression,
  './levelConfig': levelConfigStub
});

const bossArchiveProgressionStub = {
  createBossArchiveProgress: () => ({ version: 1, unlockedEventIds: [], seenEventIds: [] }),
  sanitizeBossArchiveProgress: (value, fallback = {}) => ({ ...fallback, ...(value || {}) }),
  mergeBossArchiveProgress: (left, right) => ({ ...left, ...right })
};

const squad = compileService('squadProgression.ts', {
  './browserImagePreload': {
    preloadDecodedImageUrls: async () => undefined
  },
  '../shared/weeklyRunPlan.browser': require('../shared/weeklyRunPlan.js'),
  '../shared/weeklyCompetitionBoundary.browser': {
    getWeeklyBoundaryMeta: () => ({ weekKey: '2026-07-26' })
  },
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
  './bossArchiveProgression': bossArchiveProgressionStub,
  './campaignGraph': campaignGraph,
  './campaignProgression': progression,
  './levelConfig': levelConfigStub,
  './weeklyCampaignStreak': {
    sanitizeWeeklyCampaignStreak: (value) => value ?? null,
    mergeWeeklyCampaignStreak: (target, source) => source ?? target ?? null
  }
});

const completionInput = (overrides = {}) => ({
  resultId: 'result-1',
  playerId: 'pilot:test',
  campaignId: TEST_CAMPAIGN.id,
  campaignRevision: TEST_CAMPAIGN.revision,
  missionId: 'mission-1',
  waveId: 'mission-1-wave-1',
  stageComplete: false,
  score: 1_000,
  coinsCollected: 4,
  damageTaken: 1,
  elapsedSeconds: 25,
  masteryEligible: true,
  completedAt: '2026-07-26T12:00:00.000Z',
  ...overrides
});

const clearFirstMission = (options = {}) => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const firstWave = progression.applyCampaignCompletion(
    fresh,
    completionInput({ resultId: 'm1-w1' }),
    TEST_CAMPAIGN
  );
  const finalWave = progression.applyCampaignCompletion(
    firstWave.progress,
    completionInput({
      resultId: 'm1-w2',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: options.score ?? 10_000,
      coinsCollected: options.coinsCollected ?? 50,
      damageTaken: options.damageTaken ?? 0,
      elapsedSeconds: options.elapsedSeconds ?? 40,
      completedAt: '2026-07-26T12:01:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  return { fresh, firstWave, finalWave };
};

test('Mission definitions prefer authored Campaign metadata and preserve compatibility defaults', () => {
  const fallbackMission = progression.buildCampaignMissionDefinitions(TEST_CAMPAIGN)[0];
  assert.deepEqual(fallbackMission.reward, {
    waveClearCoins: 6,
    missionClearCoins: 19,
    firstClearCoins: 28,
    bossFirstClearCoins: 0,
    replayMultiplier: progression.CAMPAIGN_REPLAY_REWARD_MULTIPLIER
  });
  assert.deepEqual(fallbackMission.mapPosition, { x: 0.5, y: 0 });
  assert.equal(fallbackMission.nextMissionId, 'mission-2');

  const authoredCampaign = structuredClone(TEST_CAMPAIGN);
  authoredCampaign.levels[0].campaignProgression = {
    reward: {
      waveClearCoins: 31,
      missionClearCoins: 79,
      firstClearCoins: 113,
      bossFirstClearCoins: 17,
      replayMultiplier: 0.42
    },
    masteryObjectives: [
      { id: 'mission-1:complete', label: 'Finish the route', kind: 'complete', target: 1, rewardCoins: 7 },
      { id: 'mission-1:coins', label: 'Collect 12 Tokens', kind: 'coins-at-least', target: 12, rewardCoins: 11 },
      { id: 'mission-1:time', label: 'Clear in 40s or less', kind: 'time-at-most', target: 40, rewardCoins: 19 }
    ],
    mapPosition: { x: 0.18, y: 0.64 },
    nextMissionId: null
  };
  const authoredMission = progression.buildCampaignMissionDefinitions(authoredCampaign)[0];

  assert.deepEqual(authoredMission.reward, authoredCampaign.levels[0].campaignProgression.reward);
  assert.deepEqual(authoredMission.starObjectives, authoredCampaign.levels[0].campaignProgression.masteryObjectives);
  assert.deepEqual(authoredMission.mapPosition, { x: 0.18, y: 0.64 });
  assert.equal(authoredMission.nextMissionId, null);
  assert.notStrictEqual(authoredMission.reward, authoredCampaign.levels[0].campaignProgression.reward);
  assert.notStrictEqual(authoredMission.starObjectives[0], authoredCampaign.levels[0].campaignProgression.masteryObjectives[0]);
});

test('the revision-24 graph exposes fifty main depths, ten alternates, power, support, budget, and dynamic Wave metadata', () => {
  const trackedCampaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const authoredDefinitions = progression.buildCampaignMissionDefinitions(trackedCampaign);
  assert.equal(authoredDefinitions.length, 60);
  assert.equal(trackedCampaign.sectors.length, 10);
  assert.equal(trackedCampaign.campaignGraph.nodes.length, 60);
  assert.deepEqual(
    trackedCampaign.sectors.map((sector) => (
      sector.missionIds.map((missionId) => authoredDefinitions.find((mission) => mission.id === missionId).waveIds.length)
    )),
    // Sector-aware surge cadence: introductions run 7 from sector 7, the
    // main-path remix runs 8 from sector 4, boss-ended Missions stay compact.
    Array.from({ length: 10 }, (_, index) => {
      const sectorOrder = index + 1;
      return [sectorOrder >= 7 ? 7 : 6, sectorOrder >= 4 ? 8 : 7, 4, 4, 2];
    })
  );
  authoredDefinitions.forEach((mission) => {
    assert.ok(mission.sectorId);
    assert.ok(mission.missionRole);
    assert.ok(mission.combatBudget > 0);
    assert.ok(mission.recommendedPower.expected > 0);
    assert.equal(typeof mission.testedLoadouts.expectedPower, 'string');
    assert.ok(Array.isArray(mission.recommendedSupportTags));
    assert.ok(mission.masterySetBonusCoins > 0);
  });
  trackedCampaign.sectors.forEach((sector) => {
    const bossMission = authoredDefinitions.find((mission) => mission.id === sector.missionIds[4]);
    assert.ok(bossMission?.bossPreview);
    assert.equal(bossMission.bossId, sector.majorBossId);
  });
});

test('a fresh Campaign starts exactly at Mission 1, Wave 1', () => {
  const progress = progression.createCampaignProgress(TEST_CAMPAIGN);

  assert.equal(progress.campaignId, TEST_CAMPAIGN.id);
  assert.equal(progress.campaignRevision, TEST_CAMPAIGN.revision);
  assert.equal(progress.recommendedMissionId, 'mission-1');
  assert.equal(progress.recommendedWaveId, 'mission-1-wave-1');
  assert.deepEqual(Array.from(progress.unlockedMissionIds), ['mission-1']);
  assert.deepEqual(Array.from(progress.unlockedWaveIdsByMission['mission-1']), ['mission-1-wave-1']);
  assert.deepEqual(Array.from(progress.unlockedWaveIdsByMission['mission-2']), []);
  assert.deepEqual(Array.from(progress.completedMissionIds), []);
  assert.equal(progress.missionRecords['mission-1'].stars, 0);
  assert.equal(progression.getCampaignCheckpointLabel(progress, TEST_CAMPAIGN).action, 'Start Mission');
});

test('developer Wave projections stay internal while the public action still restarts the Mission', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const result = progression.applyCampaignCompletion(
    fresh,
    completionInput({ resultId: 'checkpoint-wave' }),
    TEST_CAMPAIGN
  );

  assert.equal(result.settlement.accepted, true);
  assert.equal(result.settlement.duplicate, false);
  assert.equal(result.settlement.stageComplete, false);
  assert.deepEqual(result.settlement.checkpoint, {
    missionId: 'mission-1',
    waveId: 'mission-1-wave-2'
  });
  assert.equal(result.progress.recommendedMissionId, 'mission-1');
  assert.equal(result.progress.recommendedWaveId, 'mission-1-wave-2');
  assert.deepEqual(Array.from(result.progress.unlockedWaveIdsByMission['mission-1']), ['mission-1-wave-1', 'mission-1-wave-2']);
  assert.deepEqual(Array.from(result.progress.missionRecords['mission-1'].completedWaveIds), ['mission-1-wave-1']);
  assert.equal(result.progress.missionRecords['mission-1'].completed, false);
  assert.equal(result.settlement.grants.length, 1);
  assert.equal(result.settlement.grants[0].kind, 'wave');
  assert.equal(result.settlement.grants[0].id, 'campaign:mission-1:wave:mission-1-wave-1:clear');
  assert.equal(result.progress.processedResultIds.includes('checkpoint-wave'), true);
  assert.equal(progression.getCampaignCheckpointLabel(result.progress, TEST_CAMPAIGN).action, 'Start Mission');
});

test('a Mission-final summary settles directly from its Wave-1 save and includes every Wave reward', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const result = progression.applyCampaignCompletion(
    fresh,
    completionInput({
      resultId: 'seamless-mission-clear',
      waveId: 'mission-1-wave-2',
      stageComplete: true
    }),
    TEST_CAMPAIGN
  );
  const mission = progression.buildCampaignMissionDefinitions(TEST_CAMPAIGN)[0];
  const waveGrant = result.settlement.grants.find((grant) => grant.kind === 'wave');
  assert.equal(result.settlement.accepted, true);
  assert.equal(result.progress.missionRecords['mission-1'].completed, true);
  assert.deepEqual(result.progress.missionRecords['mission-1'].completedWaveIds, mission.waveIds);
  assert.equal(waveGrant.amount, mission.reward.waveClearCoins * mission.waveIds.length);
});

test('clearing a final Wave completes the Mission and unlocks the exact next Mission', () => {
  const { finalWave } = clearFirstMission();

  assert.equal(finalWave.settlement.stageComplete, true);
  assert.equal(finalWave.settlement.firstClear, true);
  assert.equal(finalWave.settlement.newlyUnlockedMissionId, 'mission-2');
  assert.deepEqual(finalWave.settlement.checkpoint, {
    missionId: 'mission-2',
    waveId: 'mission-2-wave-1'
  });
  assert.deepEqual(Array.from(finalWave.progress.completedMissionIds), ['mission-1']);
  assert.deepEqual(Array.from(finalWave.progress.unlockedMissionIds), ['mission-1', 'mission-2']);
  assert.deepEqual(Array.from(finalWave.progress.unlockedWaveIdsByMission['mission-2']), ['mission-2-wave-1']);
  assert.equal(finalWave.progress.missionRecords['mission-1'].completed, true);
  assert.equal(finalWave.progress.missionRecords['mission-1'].stars, 3);
  assert.equal(
    finalWave.settlement.grants.find((grant) => grant.kind === 'wave').amount,
    progression.buildCampaignMissionDefinitions(TEST_CAMPAIGN)[0].reward.waveClearCoins
  );
  assert.ok(finalWave.settlement.grants.some((grant) => grant.kind === 'first-clear'));
  assert.equal(progression.getCampaignCheckpointLabel(finalWave.progress, TEST_CAMPAIGN).action, 'Next Mission');
});

test('three-star mastery unlocks an optional branch without changing the main checkpoint', () => {
  const { finalWave } = clearFirstMission();

  assert.deepEqual(
    Array.from(finalWave.progress.branchProgress.unlockedBranchIds),
    ['mission-1-supply-cache']
  );
  assert.deepEqual(
    Array.from(finalWave.progress.branchProgress.newBranchIds),
    ['mission-1-supply-cache']
  );
  assert.deepEqual(Array.from(finalWave.settlement.newlyUnlockedBranchIds), ['mission-1-supply-cache']);
  assert.deepEqual(finalWave.settlement.checkpoint, {
    missionId: 'mission-2',
    waveId: 'mission-2-wave-1'
  });

  const worseReplay = progression.applyCampaignCompletion(
    finalWave.progress,
    completionInput({
      resultId: 'branch-unlock-poor-replay',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 1,
      coinsCollected: 0,
      damageTaken: 99,
      elapsedSeconds: 999
    }),
    TEST_CAMPAIGN
  );
  assert.deepEqual(Array.from(worseReplay.progress.branchProgress.unlockedBranchIds), ['mission-1-supply-cache']);
  assert.deepEqual(worseReplay.settlement.checkpoint, {
    missionId: 'mission-2',
    waveId: 'mission-2-wave-1'
  });
});

test('Campaign save migration reveals branches for existing three-star records and never marks them claimed', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const migrated = progression.sanitizeCampaignProgress({
    ...fresh,
    version: 1,
    branchProgress: undefined,
    missionRecords: {
      ...fresh.missionRecords,
      'mission-1': {
        ...fresh.missionRecords['mission-1'],
        completed: true,
        completedWaveIds: ['mission-1-wave-1', 'mission-1-wave-2'],
        stars: 3,
        earnedStarIds: ['mission-1:complete', 'mission-1:coins', 'mission-1:score']
      }
    }
  }, { campaign: TEST_CAMPAIGN });

  assert.deepEqual(Array.from(migrated.branchProgress.unlockedBranchIds), ['mission-1-supply-cache']);
  assert.deepEqual(Array.from(migrated.branchProgress.newBranchIds), ['mission-1-supply-cache']);
  assert.deepEqual(Array.from(migrated.branchProgress.completedBranchIds), []);
  assert.deepEqual(Array.from(migrated.branchProgress.claimedBranchIds), []);
  assert.equal(migrated.recommendedMissionId, 'mission-2');
  assert.equal(migrated.recommendedWaveId, 'mission-2-wave-1');
});

test('clearing the final Mission changes the checkpoint action to Replay Final Mission', () => {
  const { finalWave: firstMissionClear } = clearFirstMission();
  const secondMissionFirstWave = progression.applyCampaignCompletion(
    firstMissionClear.progress,
    completionInput({
      resultId: 'm2-w1',
      missionId: 'mission-2',
      waveId: 'mission-2-wave-1',
      score: 3_000,
      completedAt: '2026-07-26T12:02:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  const campaignClear = progression.applyCampaignCompletion(
    secondMissionFirstWave.progress,
    completionInput({
      resultId: 'm2-w2',
      missionId: 'mission-2',
      waveId: 'mission-2-wave-2',
      stageComplete: true,
      score: 8_000,
      coinsCollected: 30,
      damageTaken: 0,
      elapsedSeconds: 45,
      completedAt: '2026-07-26T12:03:00.000Z'
    }),
    TEST_CAMPAIGN
  );

  assert.equal(campaignClear.progress.campaignCompleted, true);
  assert.equal(
    progression.getCampaignCheckpointLabel(campaignClear.progress, TEST_CAMPAIGN).action,
    'Replay Final Mission'
  );
});

test('a duplicate completion result cannot mutate progress or award duplicate grants', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const input = completionInput({
    resultId: 'stable-result-id'
  });
  const first = progression.applyCampaignCompletion(fresh, input, TEST_CAMPAIGN);
  const duplicate = progression.applyCampaignCompletion(first.progress, input, TEST_CAMPAIGN);

  assert.equal(duplicate.settlement.duplicate, true);
  assert.equal(duplicate.settlement.coinsAwarded, 0);
  assert.deepEqual(Array.from(duplicate.settlement.grants), []);
  assert.equal(duplicate.progress.processedResultIds.filter((id) => id === input.resultId).length, 1);
  assert.equal(duplicate.progress.completionRecords.filter((record) => record.resultId === input.resultId).length, 1);
  assert.deepEqual(duplicate.settlement.checkpoint, first.settlement.checkpoint);

  const weekly = squad.createWeeklySquadState('pilot:test', '2026-07-26');
  const firstCredit = squad.creditCampaignRewardGrants(weekly, first.settlement.grants);
  const duplicateCredit = squad.creditCampaignRewardGrants(firstCredit.state, first.settlement.grants);
  assert.equal(firstCredit.creditedAmount, first.settlement.coinsAwarded);
  assert.equal(duplicateCredit.creditedAmount, 0);
  assert.equal(duplicateCredit.state.coins, firstCredit.state.coins);
  assert.deepEqual(Array.from(duplicateCredit.state.creditedCampaignRewardIds), Array.from(firstCredit.state.creditedCampaignRewardIds));
});

test('a claimed optional-branch receipt credits the Pilot coin balance exactly once', () => {
  const { finalWave } = clearFirstMission();
  const settlement = branchProgression.settleCampaignBranchAttempt(
    finalWave.progress.branchProgress,
    {
      branchId: 'mission-1-supply-cache',
      attemptId: 'supply-cache-attempt-1',
      playerId: 'pilot:test',
      outcome: 'success',
      verifiedPresentsDestroyed: 18,
      verifiedCoinsAwarded: 250,
      rewardReceiptId: 'campaign-branch:supply-cache:receipt-1',
      completedAt: '2026-07-26T12:04:00.000Z'
    },
    TEST_CAMPAIGN.campaignBranches
  );
  assert.equal(settlement.accepted, true);
  assert.equal(settlement.coinsAwarded, 250);

  const weekly = squad.createWeeklySquadState('pilot:test', '2026-07-26');
  const firstCredit = squad.creditCampaignRewardGrants(weekly, [settlement.grant]);
  const duplicateCredit = squad.creditCampaignRewardGrants(firstCredit.state, [settlement.grant]);
  assert.equal(firstCredit.creditedAmount, 250);
  assert.equal(firstCredit.state.coins, 250);
  assert.equal(duplicateCredit.creditedAmount, 0);
  assert.equal(duplicateCredit.state.coins, 250);
  assert.deepEqual(
    Array.from(duplicateCredit.state.creditedCampaignRewardIds),
    ['campaign-branch:supply-cache:receipt-1']
  );
});

test('Mission replays use reduced rewards and can never move progress backward', () => {
  const { finalWave } = clearFirstMission();
  const replay = progression.applyCampaignCompletion(
    finalWave.progress,
    completionInput({
      resultId: 'm1-replay',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 250,
      coinsCollected: 0,
      damageTaken: 9,
      elapsedSeconds: 200
    }),
    TEST_CAMPAIGN
  );

  const mission = progression.buildCampaignMissionDefinitions(TEST_CAMPAIGN)[0];
  const originalWaveReward = finalWave.settlement.grants.find((grant) => grant.kind === 'wave').amount;
  const replayWaveReward = replay.settlement.grants.find((grant) => grant.kind === 'wave').amount;
  assert.equal(replay.settlement.replay, true);
  assert.equal(replayWaveReward, Math.max(1, Math.round(
    mission.reward.waveClearCoins
    * mission.waveIds.length
    * progression.CAMPAIGN_REPLAY_REWARD_MULTIPLIER
  )));
  assert.ok(replayWaveReward < originalWaveReward);
  assert.deepEqual(replay.settlement.checkpoint, {
    missionId: 'mission-2',
    waveId: 'mission-2-wave-1'
  });
  assert.equal(replay.progress.recommendedMissionId, 'mission-2');
  assert.equal(replay.progress.recommendedWaveId, 'mission-2-wave-1');
});

test('Mission replay income is capped to one reduced payout per Mission per UTC day', () => {
  const { finalWave } = clearFirstMission();
  const firstReplay = progression.applyCampaignCompletion(
    finalWave.progress,
    completionInput({
      resultId: 'daily-replay-1',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      masteryEligible: false,
      completedAt: '2026-07-26T18:00:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  const sameDayReplay = progression.applyCampaignCompletion(
    firstReplay.progress,
    completionInput({
      resultId: 'daily-replay-2',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      masteryEligible: false,
      completedAt: '2026-07-26T23:59:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  const nextDayReplay = progression.applyCampaignCompletion(
    sameDayReplay.progress,
    completionInput({
      resultId: 'daily-replay-3',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      masteryEligible: false,
      completedAt: '2026-07-27T00:01:00.000Z'
    }),
    TEST_CAMPAIGN
  );

  assert.deepEqual(firstReplay.settlement.grants.map((grant) => grant.kind), ['wave', 'mission']);
  assert.equal(firstReplay.progress.replayRewardEpochByMission['mission-1'], '2026-07-26');
  assert.deepEqual(sameDayReplay.settlement.grants, []);
  assert.equal(sameDayReplay.settlement.accepted, true);
  assert.deepEqual(nextDayReplay.settlement.grants.map((grant) => grant.kind), ['wave', 'mission']);
  assert.equal(nextDayReplay.progress.replayRewardEpochByMission['mission-1'], '2026-07-27');
});

test('first-clear and star bonuses are one-time while earned stars are never removed by worse replays', () => {
  const { finalWave: oneStarClear } = clearFirstMission({
    score: 100,
    coinsCollected: 0,
    damageTaken: 9,
    elapsedSeconds: 999
  });
  assert.equal(oneStarClear.progress.missionRecords['mission-1'].stars, 1);
  assert.equal(oneStarClear.settlement.newStarIds.length, 1);
  assert.ok(oneStarClear.settlement.grants.some((grant) => grant.kind === 'first-clear'));

  const improvedReplay = progression.applyCampaignCompletion(
    oneStarClear.progress,
    completionInput({
      resultId: 'm1-w2-improved-replay',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 10_000,
      coinsCollected: 50,
      damageTaken: 0,
      elapsedSeconds: 35,
      completedAt: '2026-07-26T12:02:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  assert.equal(improvedReplay.settlement.firstClear, false);
  assert.equal(improvedReplay.progress.missionRecords['mission-1'].stars, 3);
  assert.equal(improvedReplay.settlement.newStarIds.length, 2);
  assert.equal(improvedReplay.settlement.grants.filter((grant) => grant.kind === 'star').length, 2);
  assert.equal(improvedReplay.settlement.grants.some((grant) => grant.kind === 'first-clear'), false);

  const worseReplay = progression.applyCampaignCompletion(
    improvedReplay.progress,
    completionInput({
      resultId: 'm1-w2-worse-replay',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 1,
      coinsCollected: 0,
      damageTaken: 99,
      elapsedSeconds: 999,
      completedAt: '2026-07-26T12:03:00.000Z'
    }),
    TEST_CAMPAIGN
  );
  assert.equal(worseReplay.progress.missionRecords['mission-1'].stars, 3);
  assert.deepEqual(
    Array.from(worseReplay.progress.missionRecords['mission-1'].earnedStarIds).sort(),
    Array.from(improvedReplay.progress.missionRecords['mission-1'].earnedStarIds).sort()
  );
  assert.deepEqual(Array.from(worseReplay.settlement.newStarIds), []);
  assert.equal(worseReplay.settlement.grants.some((grant) => grant.kind === 'star'), false);
  assert.equal(worseReplay.settlement.grants.some((grant) => grant.kind === 'first-clear'), false);
});

test('sanitization rejects unknown IDs and legacy migration resumes at the reached Mission', () => {
  const migrated = progression.sanitizeCampaignProgress(undefined, {
    campaign: TEST_CAMPAIGN,
    legacyHighestMission: 2
  });
  assert.equal(migrated.recommendedMissionId, 'mission-2');
  assert.equal(migrated.recommendedWaveId, 'mission-2-wave-1');
  assert.deepEqual(Array.from(migrated.completedMissionIds), ['mission-1']);
  assert.equal(migrated.missionRecords['mission-1'].completed, true);
  assert.equal(migrated.missionRecords['mission-1'].stars, 1);

  const sanitized = progression.sanitizeCampaignProgress({
    campaignId: 'injected-campaign',
    recommendedMissionId: 'unknown-mission',
    recommendedWaveId: 'unknown-wave',
    unlockedMissionIds: ['unknown-mission', 'mission-1', 'mission-1'],
    unlockedWaveIdsByMission: {
      'mission-1': ['mission-1-wave-1', 'unknown-wave', 'mission-1-wave-1']
    },
    completedMissionIds: ['unknown-mission'],
    missionRecords: {
      'mission-1': {
        completedWaveIds: ['mission-1-wave-1', 'unknown-wave'],
        earnedStarIds: ['mission-1:complete', 'unknown-star']
      }
    },
    processedResultIds: ['receipt-1', 'receipt-1', 123],
    claimedRewardIds: ['reward-1', 'reward-1', null],
    unviewedMissionIds: ['unknown-mission', 'mission-1']
  }, { campaign: TEST_CAMPAIGN });

  assert.equal(sanitized.campaignId, TEST_CAMPAIGN.id);
  assert.equal(sanitized.recommendedMissionId, 'mission-1');
  assert.equal(sanitized.recommendedWaveId, 'mission-1-wave-2');
  assert.deepEqual(Array.from(sanitized.unlockedMissionIds), ['mission-1']);
  assert.deepEqual(Array.from(sanitized.unlockedWaveIdsByMission['mission-1']), ['mission-1-wave-1', 'mission-1-wave-2']);
  assert.deepEqual(Array.from(sanitized.missionRecords['mission-1'].completedWaveIds), ['mission-1-wave-1']);
  assert.deepEqual(Array.from(sanitized.missionRecords['mission-1'].earnedStarIds), []);
  assert.deepEqual(Array.from(sanitized.processedResultIds), ['receipt-1']);
  assert.deepEqual(Array.from(sanitized.claimedRewardIds), []);
  assert.deepEqual(Array.from(sanitized.unviewedMissionIds), ['mission-1']);
});

test('daily replay receipts cannot evict permanent Campaign reward claims', () => {
  const permanentRewardId = 'campaign:mission-1:first-clear';
  const replayRewardIds = Array.from(
    { length: 1_200 },
    (_, index) => `campaign:mission-1:replay:2026-07-${String((index % 28) + 1).padStart(2, '0')}:wave:${index}`
  );
  const sanitized = progression.sanitizeCampaignProgress({
    claimedRewardIds: [permanentRewardId, ...replayRewardIds]
  }, { campaign: TEST_CAMPAIGN });

  assert.deepEqual(Array.from(sanitized.claimedRewardIds), [permanentRewardId]);
});

test('merging profiles preserves the farthest Mission, completion receipts, records, and stars', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const partial = progression.applyCampaignCompletion(
    fresh,
    completionInput({ resultId: 'partial-result' }),
    TEST_CAMPAIGN
  ).progress;
  const completed = clearFirstMission().finalWave.progress;
  const merged = progression.mergeCampaignProgress(partial, completed, TEST_CAMPAIGN);

  assert.equal(merged.recommendedMissionId, 'mission-2');
  assert.equal(merged.recommendedWaveId, 'mission-2-wave-1');
  assert.deepEqual(Array.from(merged.completedMissionIds), ['mission-1']);
  assert.equal(merged.missionRecords['mission-1'].stars, 3);
  assert.equal(merged.processedResultIds.includes('partial-result'), true);
  assert.equal(merged.processedResultIds.includes('m1-w1'), true);
  assert.ok(merged.processedResultIds.includes('m1-w2'));
  assert.equal(new Set(merged.processedResultIds).size, merged.processedResultIds.length);
  assert.equal(new Set(merged.claimedRewardIds).size, merged.claimedRewardIds.length);
});

test('weekly rollover preserves unspent one-time Campaign coins, receipts, and permanent Campaign progress', () => {
  const { finalWave } = clearFirstMission();
  const weekly = squad.createWeeklySquadState('pilot:test', '2026-07-26');
  const credited = squad.creditCampaignRewardGrants(weekly, finalWave.settlement.grants);
  const permanent = {
    ...squad.createPermanentSquadState('pilot:test'),
    campaignProgress: finalWave.progress
  };
  const rolled = squad.rollWeeklySquadStateForward(credited.state, '2026-08-02');

  assert.ok(credited.state.coins > 0);
  assert.equal(rolled.weekKey, '2026-08-02');
  assert.equal(
    credited.state.durableCampaignCoins,
    finalWave.settlement.grants
      .filter((grant) => grant.oneTime)
      .reduce((total, grant) => total + grant.amount, 0)
  );
  assert.equal(rolled.coins, credited.state.durableCampaignCoins + squad.WEEKLY_STARTING_COINS);
  assert.equal(rolled.durableCampaignCoins, credited.state.durableCampaignCoins);
  assert.deepEqual(rolled.weeklyStats, {
    runs: 0,
    weeklyRunAttempts: 0,
    score: 0,
    enemiesDefeated: 0,
    coinsEarned: 0
  });
  assert.deepEqual(
    Array.from(rolled.creditedCampaignRewardIds),
    Array.from(credited.state.creditedCampaignRewardIds)
  );
  assert.equal(permanent.campaignProgress.recommendedMissionId, 'mission-2');
  assert.equal(permanent.campaignProgress.recommendedWaveId, 'mission-2-wave-1');
  assert.equal(permanent.campaignProgress.missionRecords['mission-1'].stars, 3);

  const retriedCredit = squad.creditCampaignRewardGrants(rolled, finalWave.settlement.grants);
  assert.equal(retriedCredit.creditedAmount, 0);
  assert.equal(retriedCredit.state.coins, rolled.coins);
});

test('seasonal coins are spent before durable Campaign coins and spent rewards are not recreated', () => {
  const weekly = {
    ...squad.createWeeklySquadState('pilot:test', '2026-07-26'),
    coins: 150,
    durableCampaignCoins: 100
  };
  const seasonalSpend = squad.unlockSquadSlot(weekly, 'left');
  assert.equal(seasonalSpend.coins, 100);
  assert.equal(seasonalSpend.durableCampaignCoins, 100);

  const durableSpend = squad.unlockSquadSlot({
    ...seasonalSpend,
    coins: 570,
    durableCampaignCoins: 550
  }, 'right');
  assert.equal(durableSpend.coins, 570);
  assert.equal(durableSpend.durableCampaignCoins, 550);
  assert.equal(durableSpend.unlockedSlots.right, false);

  const rolled = squad.rollWeeklySquadStateForward(durableSpend, '2026-08-02');
  assert.equal(rolled.coins, 550 + squad.WEEKLY_STARTING_COINS);
  assert.equal(rolled.durableCampaignCoins, 550);
});

test('completion rejects locked Missions and locked Waves instead of advancing injected progress', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const injected = progression.applyCampaignCompletion(
    fresh,
    completionInput({
      resultId: 'locked-skip',
      missionId: 'mission-2',
      waveId: 'mission-2-wave-2',
      stageComplete: true
    }),
    TEST_CAMPAIGN
  );

  assert.equal(injected.settlement.accepted, false);
  assert.equal(injected.settlement.duplicate, false);
  assert.equal(injected.settlement.reason, 'mission-locked');
  assert.deepEqual(Array.from(injected.settlement.grants), []);
  assert.equal(injected.progress.recommendedMissionId, 'mission-1');
  assert.deepEqual(Array.from(injected.progress.unlockedMissionIds), ['mission-1']);
});

test('final reward-window metrics can add mastery stars and records without repeating clear rewards', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const firstWave = progression.applyCampaignCompletion(
    fresh,
    completionInput({ resultId: 'late-m1-w1', score: 0, coinsCollected: 0 }),
    TEST_CAMPAIGN
  );
  const initialFinal = progression.applyCampaignCompletion(
    firstWave.progress,
    completionInput({
      resultId: 'late-m1-w2',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 100,
      coinsCollected: 0,
      elapsedSeconds: 50
    }),
    TEST_CAMPAIGN
  );
  assert.equal(initialFinal.settlement.newBestScore, true);
  assert.equal(initialFinal.settlement.newBestTime, true);
  assert.equal(initialFinal.progress.missionRecords['mission-1'].stars, 1);

  const reconciled = progression.finalizeCampaignCompletionMetrics(
    initialFinal.progress,
    completionInput({
      resultId: 'late-m1-w2',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 10_000,
      coinsCollected: 50,
      elapsedSeconds: 50
    }),
    TEST_CAMPAIGN
  );
  assert.equal(reconciled.accepted, true);
  assert.equal(reconciled.newBestScore, true);
  assert.equal(reconciled.newBestCoins, true);
  assert.equal(reconciled.progress.missionRecords['mission-1'].stars, 3);
  assert.equal(reconciled.progress.missionRecords['mission-1'].bestCoinsCollected, 50);
  assert.equal(reconciled.grants.length, 2);
  assert.ok(reconciled.grants.every((grant) => grant.kind === 'star'));

  const repeated = progression.finalizeCampaignCompletionMetrics(
    reconciled.progress,
    completionInput({
      resultId: 'late-m1-w2',
      waveId: 'mission-1-wave-2',
      stageComplete: true,
      score: 10_000,
      coinsCollected: 50,
      elapsedSeconds: 50
    }),
    TEST_CAMPAIGN
  );
  assert.equal(repeated.accepted, true);
  assert.deepEqual(Array.from(repeated.newStarIds), []);
  assert.deepEqual(Array.from(repeated.grants), []);
});

test('Campaign settlement journal recovers an interrupted weekly/permanent pair atomically', () => {
  const originalWindow = global.window;
  const entries = new Map();
  let failPermanentOnce = true;
  global.window = {
    localStorage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        if (failPermanentOnce && key.includes('scicon_permanent_squad')) {
          failPermanentOnce = false;
          throw new Error('simulated permanent mirror failure');
        }
        entries.set(key, value);
      },
      removeItem: (key) => entries.delete(key)
    }
  };

  try {
    const weeklyState = { ...squad.createWeeklySquadState('pilot:test'), coins: 321 };
    const permanentState = {
      ...squad.createPermanentSquadState('pilot:test'),
      campaignProgress: clearFirstMission().finalWave.progress
    };
    assert.throws(() => squad.commitCampaignSquadSettlement({
      resultId: 'journal-result',
      weeklyState,
      permanentState
    }), /simulated permanent mirror failure/);
    assert.ok(Array.from(entries.keys()).some((key) => key.includes('scicon_campaign_settlement_v1')));

    assert.equal(squad.recoverPendingCampaignSquadSettlement('pilot:test'), true);
    assert.equal(Array.from(entries.keys()).some((key) => key.includes('scicon_campaign_settlement_v1')), false);
    const weeklyEntry = JSON.parse(entries.get(
      Array.from(entries.keys()).find((key) => key.includes('scicon_weekly_squad'))
    ));
    const permanentEntry = JSON.parse(entries.get(
      Array.from(entries.keys()).find((key) => key.includes('scicon_permanent_squad'))
    ));
    assert.equal(weeklyEntry.coins, 321);
    assert.equal(permanentEntry.campaignProgress.recommendedMissionId, 'mission-2');
  } finally {
    global.window = originalWindow;
  }
});

const dynamicCampaign = (counts) => ({
  ...structuredClone(TEST_CAMPAIGN),
  revision: 22,
  id: `dynamic-${counts.join('-')}`,
  campaignBranches: [],
  levels: counts.map((count, missionIndex) => ({
    ...structuredClone(TEST_CAMPAIGN.levels[0]),
    id: `dynamic-mission-${missionIndex + 1}`,
    name: `Dynamic Mission ${missionIndex + 1}`,
    order: missionIndex + 1,
    waves: Array.from({ length: count }, (_, waveIndex) => ({
      ...structuredClone(TEST_CAMPAIGN.levels[0].waves[0]),
      id: `dynamic-m${missionIndex + 1}-wave-${waveIndex + 1}`,
      name: `Wave ${waveIndex + 1}`,
      order: waveIndex + 1
    }))
  }))
});

test('rev21 partial and completed records migrate through the tracked v22 Wave aliases', () => {
  const tracked = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const first = tracked.levels[0];
  const second = tracked.levels[1];
  const partial = progression.sanitizeCampaignProgress({
    version: 2,
    campaignId: tracked.id,
    campaignRevision: 21,
    recommendedMissionId: first.id,
    recommendedWaveId: 'open-orbit-checkpoint',
    unlockedMissionIds: [first.id],
    unlockedWaveIdsByMission: { [first.id]: ['open-orbit', 'open-orbit-checkpoint'] },
    missionRecords: {
      [first.id]: { completedWaveIds: ['open-orbit', 'open-orbit-checkpoint'] }
    }
  }, { campaign: tracked });

  assert.deepEqual(partial.missionRecords[first.id].completedWaveIds, first.waves.slice(0, 3).map((wave) => wave.id));
  assert.equal(partial.recommendedMissionId, first.id);
  assert.equal(partial.recommendedWaveId, first.waves[3].id);

  const completed = progression.sanitizeCampaignProgress({
    ...partial,
    version: 2,
    campaignRevision: 21,
    completedMissionIds: [first.id],
    missionRecords: { [first.id]: { ...partial.missionRecords[first.id], completed: true } }
  }, { campaign: tracked });
  assert.deepEqual(completed.missionRecords[first.id].completedWaveIds, first.waves.map((wave) => wave.id));
  assert.equal(completed.recommendedMissionId, first.id);
  assert.equal(completed.pendingRouteChoice.sourceNodeId, tracked.sectors[0].mainNodeIds[0]);
  assert.deepEqual(
    new Set(completed.pendingRouteChoice.optionNodeIds),
    new Set([tracked.sectors[0].mainNodeIds[1], tracked.sectors[0].routeNodeIds[0]])
  );
});

test('dynamic 1, 5, 6, and 7 Wave Missions unlock exactly one Wave at a time', () => {
  const campaign = dynamicCampaign([1, 5, 6, 7]);
  let progress = progression.createCampaignProgress(campaign);
  campaign.levels.forEach((mission, missionIndex) => {
    mission.waves.forEach((wave, waveIndex) => {
      const final = waveIndex === mission.waves.length - 1;
      const result = progression.applyCampaignCompletion(progress, {
        ...completionInput(),
        resultId: `dynamic-${missionIndex}-${waveIndex}`,
        campaignId: campaign.id,
        campaignRevision: campaign.revision,
        missionId: mission.id,
        waveId: wave.id,
        stageComplete: final,
        masteryEligible: waveIndex === 0
      }, campaign);
      assert.equal(result.settlement.accepted, true);
      progress = result.progress;
      if (!final) {
        assert.equal(progress.recommendedMissionId, mission.id);
        assert.equal(progress.recommendedWaveId, mission.waves[waveIndex + 1].id);
        assert.equal(progress.unlockedWaveIdsByMission[mission.id].length, waveIndex + 2);
      }
    });
  });
  assert.equal(progress.campaignCompleted, true);
  assert.deepEqual(campaign.levels.map((mission) => progress.missionRecords[mission.id].completedWaveIds.length), [1, 5, 6, 7]);
});

test('a resumed later-Wave clear cannot earn performance stars or the mastery set bonus', () => {
  const campaign = structuredClone(TEST_CAMPAIGN);
  campaign.levels[0].campaignProgression = {
    reward: { waveClearCoins: 10, missionClearCoins: 20, firstClearCoins: 30, bossFirstClearCoins: 0, replayMultiplier: 0.25 },
    masteryObjectives: [
      { id: 'mission-1:complete', label: 'Complete', kind: 'complete', target: 1, rewardCoins: 5 },
      { id: 'mission-1:score', label: 'Score', kind: 'score-at-least', target: 100, rewardCoins: 7 },
      { id: 'mission-1:damage', label: 'No damage', kind: 'damage-at-most', target: 0, rewardCoins: 9 }
    ],
    masterySetBonusCoins: 77,
    sectorId: 'test-sector',
    missionRole: 'introduction',
    combatBudget: 10,
    recommendedPower: { minimum: 1, expected: 2, comfortable: 3 },
    testedLoadouts: { lowPower: 'low', expectedPower: 'expected', upgraded: 'upgraded' },
    recommendedSupportTags: [],
    nextMissionId: 'mission-2'
  };
  const first = progression.applyCampaignCompletion(
    progression.createCampaignProgress(campaign),
    { ...completionInput(), campaignId: campaign.id, resultId: 'resume-w1' },
    campaign
  );
  const resumedFinal = progression.applyCampaignCompletion(first.progress, {
    ...completionInput(),
    campaignId: campaign.id,
    resultId: 'resume-w2',
    waveId: 'mission-1-wave-2',
    stageComplete: true,
    masteryEligible: false,
    score: 99_999,
    damageTaken: 0
  }, campaign);
  assert.equal(resumedFinal.progress.missionRecords['mission-1'].stars, 1);
  assert.equal(resumedFinal.settlement.grants.some((grant) => grant.kind === 'mastery-set'), false);
  assert.equal(resumedFinal.progress.missionRecords['mission-1'].bestScore, 0);
});

test('the final missing star grants the authored mastery set bonus once and in reward order', () => {
  const campaign = structuredClone(TEST_CAMPAIGN);
  campaign.levels[0].campaignProgression = {
    reward: { waveClearCoins: 10, missionClearCoins: 20, firstClearCoins: 30, bossFirstClearCoins: 0, replayMultiplier: 0.25 },
    masteryObjectives: [
      { id: 'mission-1:complete', label: 'Complete', kind: 'complete', target: 1, rewardCoins: 5 },
      { id: 'mission-1:score', label: 'Score', kind: 'score-at-least', target: 100, rewardCoins: 7 },
      { id: 'mission-1:damage', label: 'No damage', kind: 'damage-at-most', target: 0, rewardCoins: 9 }
    ],
    masterySetBonusCoins: 77,
    sectorId: 'test-sector',
    missionRole: 'introduction',
    combatBudget: 10,
    recommendedPower: { minimum: 1, expected: 2, comfortable: 3 },
    testedLoadouts: { lowPower: 'low', expectedPower: 'expected', upgraded: 'upgraded' },
    recommendedSupportTags: [],
    nextMissionId: 'mission-2'
  };
  const first = progression.applyCampaignCompletion(
    progression.createCampaignProgress(campaign),
    { ...completionInput(), campaignId: campaign.id, resultId: 'mastery-w1' },
    campaign
  );
  const final = progression.applyCampaignCompletion(first.progress, {
    ...completionInput(),
    campaignId: campaign.id,
    resultId: 'mastery-w2',
    waveId: 'mission-1-wave-2',
    stageComplete: true,
    score: 1000,
    damageTaken: 0
  }, campaign);
  assert.deepEqual(final.settlement.grants.map((grant) => grant.kind), [
    'wave', 'mission', 'first-clear', 'star', 'star', 'star', 'mastery-set'
  ]);
  assert.equal(final.settlement.grants.find((grant) => grant.kind === 'mastery-set').amount, 77);

  const replay = progression.applyCampaignCompletion(final.progress, {
    ...completionInput(),
    campaignId: campaign.id,
    resultId: 'mastery-replay',
    waveId: 'mission-1-wave-2',
    stageComplete: true,
    score: 1000,
    damageTaken: 0
  }, campaign);
  assert.equal(replay.settlement.grants.some((grant) => grant.kind === 'mastery-set'), false);
});

test('merge preserves the furthest Wave checkpoint inside the same Mission and checkpoint selection cannot skip', () => {
  const campaign = dynamicCampaign([5]);
  const fresh = progression.createCampaignProgress(campaign);
  const wave1 = progression.applyCampaignCompletion(fresh, {
    ...completionInput(), campaignId: campaign.id, resultId: 'merge-w1', missionId: campaign.levels[0].id, waveId: campaign.levels[0].waves[0].id
  }, campaign).progress;
  const wave2 = progression.applyCampaignCompletion(wave1, {
    ...completionInput(), campaignId: campaign.id, resultId: 'merge-w2', missionId: campaign.levels[0].id, waveId: campaign.levels[0].waves[1].id
  }, campaign).progress;
  const wave3 = progression.applyCampaignCompletion(wave2, {
    ...completionInput(), campaignId: campaign.id, resultId: 'merge-w3', missionId: campaign.levels[0].id, waveId: campaign.levels[0].waves[2].id
  }, campaign).progress;
  const merged = progression.mergeCampaignProgress(wave1, wave3, campaign);
  assert.equal(merged.recommendedWaveId, campaign.levels[0].waves[3].id);
  assert.deepEqual(merged.missionRecords[campaign.levels[0].id].completedWaveIds, campaign.levels[0].waves.slice(0, 3).map((wave) => wave.id));

  const lockedSelection = progression.setCampaignCheckpoint(merged, campaign.levels[0].id, campaign.levels[0].waves[4].id, campaign);
  assert.equal(lockedSelection.recommendedWaveId, campaign.levels[0].waves[3].id);
  const backwardReplaySelection = progression.setCampaignCheckpoint(merged, campaign.levels[0].id, campaign.levels[0].waves[0].id, campaign);
  assert.equal(backwardReplaySelection.recommendedWaveId, campaign.levels[0].waves[3].id);
});
