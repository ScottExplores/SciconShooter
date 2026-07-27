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
            label: 'Paywall Gatekeeper'
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

const progression = compileService('campaignProgression.ts', {
  './levelConfig': levelConfigStub
});

const bossArchiveProgressionStub = {
  createBossArchiveProgress: () => ({ version: 1, unlockedEventIds: [], seenEventIds: [] }),
  sanitizeBossArchiveProgress: (value, fallback = {}) => ({ ...fallback, ...(value || {}) }),
  mergeBossArchiveProgress: (left, right) => ({ ...left, ...right })
};

const squad = compileService('squadProgression.ts', {
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
    FIRE_RATE_MAX_LEVEL: 21,
    getFireRateTier: () => 1,
    getFireRateTierProgress: () => ({ tier: 1, level: 0 })
  },
  './bossArchive': {
    inferLegacyBossArchiveEventIds: () => [],
    normalizeBossArchiveEventIds: (value) => Array.isArray(value) ? value : []
  },
  './bossArchiveProgression': bossArchiveProgressionStub,
  './campaignProgression': progression
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
      { id: 'mission-1:coins', label: 'Collect 12 coins', kind: 'coins-at-least', target: 12, rewardCoins: 11 },
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

test('the twenty authored Missions preserve the previous deterministic reward, mastery, and route values', () => {
  const trackedCampaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
  const legacyCampaign = structuredClone(trackedCampaign);
  legacyCampaign.levels.forEach((level) => { delete level.campaignProgression; });

  const authoredDefinitions = progression.buildCampaignMissionDefinitions(trackedCampaign);
  const fallbackDefinitions = progression.buildCampaignMissionDefinitions(legacyCampaign);
  assert.equal(authoredDefinitions.length, 20);
  assert.deepEqual(
    authoredDefinitions.map(({ id, reward, starObjectives, mapPosition, nextMissionId }) => ({
      id,
      reward,
      starObjectives,
      mapPosition,
      nextMissionId
    })),
    fallbackDefinitions.map(({ id, reward, starObjectives, mapPosition, nextMissionId }) => ({
      id,
      reward,
      starObjectives,
      mapPosition,
      nextMissionId
    }))
  );
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

test('clearing a Wave immediately advances and persists the exact next-Wave checkpoint', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  const result = progression.applyCampaignCompletion(
    fresh,
    completionInput({ resultId: 'checkpoint-wave' }),
    TEST_CAMPAIGN
  );

  assert.equal(result.settlement.duplicate, false);
  assert.equal(result.settlement.stageComplete, false);
  assert.deepEqual(result.settlement.checkpoint, {
    missionId: 'mission-1',
    waveId: 'mission-1-wave-2'
  });
  assert.equal(result.progress.recommendedMissionId, 'mission-1');
  assert.equal(result.progress.recommendedWaveId, 'mission-1-wave-2');
  assert.deepEqual(Array.from(result.progress.unlockedWaveIdsByMission['mission-1']), [
    'mission-1-wave-1',
    'mission-1-wave-2'
  ]);
  assert.deepEqual(Array.from(result.progress.missionRecords['mission-1'].completedWaveIds), [
    'mission-1-wave-1'
  ]);
  assert.equal(result.progress.missionRecords['mission-1'].completed, false);
  assert.deepEqual(Array.from(result.settlement.grants, (grant) => grant.kind), ['wave']);
  assert.equal(progression.getCampaignCheckpointLabel(result.progress, TEST_CAMPAIGN).action, 'Continue Mission');
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
  assert.ok(finalWave.settlement.grants.some((grant) => grant.kind === 'first-clear'));
  assert.equal(progression.getCampaignCheckpointLabel(finalWave.progress, TEST_CAMPAIGN).action, 'Next Mission');
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
  const input = completionInput({ resultId: 'stable-result-id' });
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

test('replays use reduced rewards and can never move the highest checkpoint backward', () => {
  const { firstWave, finalWave } = clearFirstMission();
  const replay = progression.applyCampaignCompletion(
    finalWave.progress,
    completionInput({
      resultId: 'm1-w1-replay',
      score: 250,
      coinsCollected: 0,
      damageTaken: 9,
      elapsedSeconds: 200
    }),
    TEST_CAMPAIGN
  );

  const originalWaveReward = firstWave.settlement.grants.find((grant) => grant.kind === 'wave').amount;
  const replayWaveReward = replay.settlement.grants.find((grant) => grant.kind === 'wave').amount;
  assert.equal(replay.settlement.replay, true);
  assert.equal(replayWaveReward, Math.max(1, Math.round(
    originalWaveReward * progression.CAMPAIGN_REPLAY_REWARD_MULTIPLIER
  )));
  assert.ok(replayWaveReward < originalWaveReward);
  assert.deepEqual(replay.settlement.checkpoint, {
    missionId: 'mission-2',
    waveId: 'mission-2-wave-1'
  });
  assert.equal(replay.progress.recommendedMissionId, 'mission-2');
  assert.equal(replay.progress.recommendedWaveId, 'mission-2-wave-1');
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
  assert.equal(sanitized.recommendedWaveId, 'mission-1-wave-1');
  assert.deepEqual(Array.from(sanitized.unlockedMissionIds), ['mission-1']);
  assert.deepEqual(Array.from(sanitized.unlockedWaveIdsByMission['mission-1']), ['mission-1-wave-1']);
  assert.deepEqual(Array.from(sanitized.missionRecords['mission-1'].completedWaveIds), ['mission-1-wave-1']);
  assert.deepEqual(Array.from(sanitized.missionRecords['mission-1'].earnedStarIds), ['mission-1:complete']);
  assert.deepEqual(Array.from(sanitized.processedResultIds), ['receipt-1']);
  assert.deepEqual(Array.from(sanitized.claimedRewardIds), ['reward-1']);
  assert.deepEqual(Array.from(sanitized.unviewedMissionIds), ['mission-1']);
});

test('merging profiles preserves the farthest checkpoint, completion receipts, records, and stars', () => {
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
  assert.ok(merged.processedResultIds.includes('partial-result'));
  assert.ok(merged.processedResultIds.includes('m1-w1'));
  assert.ok(merged.processedResultIds.includes('m1-w2'));
  assert.equal(new Set(merged.processedResultIds).size, merged.processedResultIds.length);
  assert.equal(new Set(merged.claimedRewardIds).size, merged.claimedRewardIds.length);
});

test('weekly rollover resets seasonal coins but preserves Campaign reward receipts and permanent Campaign progress', () => {
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
  assert.equal(rolled.coins, squad.WEEKLY_STARTING_COINS);
  assert.deepEqual(rolled.weeklyStats, {
    runs: 0,
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
  assert.equal(retriedCredit.state.coins, 0);
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

  assert.equal(injected.settlement.duplicate, true);
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
