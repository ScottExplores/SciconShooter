const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

const makeLevel = (id, order, nextMissionId = null) => ({
  id,
  name: id.toUpperCase(),
  description: id,
  order,
  backgroundId: 'space',
  musicId: 'procedural-main',
  startingDifficulty: 1,
  scoreTarget: 1_000,
  durationSeconds: null,
  loopWaves: false,
  availablePowerupIds: [],
  scorecard: { encounterAssetKey: 'TEST_ART' },
  campaignProgression: {
    sectorId: 'sector-1',
    missionRole: 'formation-remix',
    combatBudget: 1,
    recommendedPower: { minimum: 0, expected: 0, comfortable: 0 },
    testedLoadouts: { lowPower: 'low', expectedPower: 'expected', upgraded: 'upgraded' },
    recommendedSupportTags: [],
    nextMissionId,
    mapPosition: { x: 0.5, y: order / 10 },
    reward: {
      waveClearCoins: 1,
      missionClearCoins: 1,
      firstClearCoins: 1,
      bossFirstClearCoins: 0,
      replayMultiplier: 0.35
    },
    masteryObjectives: [
      { id: `${id}:complete`, label: 'Complete', kind: 'complete', target: 1, rewardCoins: 1 },
      { id: `${id}:score`, label: 'Score', kind: 'score-at-least', target: 1, rewardCoins: 1 },
      { id: `${id}:coins`, label: 'Coins', kind: 'coins-at-least', target: 1, rewardCoins: 1 }
    ],
    masterySetBonusCoins: 1
  },
  waves: [{
    id: `${id}-wave-1`,
    name: 'Clear',
    order: 1,
    durationSeconds: 20,
    events: []
  }]
});

const edge = (edgeId, toNodeId, kind = 'progression') => ({
  edgeId,
  toNodeId,
  routeId: edgeId,
  label: edgeId,
  kind,
  risk: 'low',
  weeklyScoreMultiplier: 1
});

const node = (nodeId, missionDefinitionId, depth, overrides = {}) => ({
  nodeId,
  sectorId: 'sector-1',
  depth,
  routeId: 'main',
  displayLabel: nodeId,
  missionDefinitionId,
  prerequisiteNodeIds: [],
  prerequisiteMode: 'all',
  outgoingEdges: [],
  rejoinNodeId: null,
  optional: false,
  mainPath: true,
  masteryBranch: false,
  oneTime: false,
  bossId: null,
  miniBossIds: [],
  weeklyStreakEligible: true,
  weeklyScoreMultiplier: 1,
  recommendedPower: { minimum: 0, expected: 0, comfortable: 0 },
  rewardProfile: 'standard',
  mapPosition: { x: 0.5, y: depth / 10 },
  routeControlPoints: [],
  routeSummary: {
    combatIntensity: 'low',
    miniBossPresence: 'none',
    rewardType: 'standard',
    recommendedSupportTags: [],
    estimatedWaveCount: 1
  },
  ...overrides
});

const TEST_CAMPAIGN = {
  schemaVersion: 1,
  revision: 40,
  id: 'graph-campaign',
  name: 'Graph Campaign',
  updatedAt: '2026-07-28T00:00:00.000Z',
  fps: 60,
  recordCard: {},
  hudAssets: {},
  sectors: [],
  visualThemes: [],
  enemyRoles: [],
  formationPacks: [],
  miniBosses: [],
  // Deliberately put B before A and author the wrong legacy nextMissionId.
  // Authored graph edges, never this array/numeric order, must control play.
  levels: [
    makeLevel('mission-root', 1, 'mission-b'),
    makeLevel('mission-b', 2, 'mission-a'),
    makeLevel('mission-a', 3, 'mission-end'),
    makeLevel('mission-rejoin', 4, 'mission-end'),
    makeLevel('mission-end', 5, null)
  ],
  campaignGraph: {
    entryNodeId: 'root',
    nodes: [
      node('root', 'mission-root', 1, {
        outgoingEdges: [
          edge('root-a', 'route-a', 'route-choice'),
          edge('root-b', 'route-b', 'route-choice')
        ]
      }),
      node('route-a', 'mission-a', 2, {
        routeId: 'alpha',
        prerequisiteNodeIds: ['root'],
        outgoingEdges: [edge('a-rejoin', 'rejoin', 'rejoin')],
        rejoinNodeId: 'rejoin'
      }),
      node('route-b', 'mission-b', 2, {
        routeId: 'beta',
        mainPath: false,
        prerequisiteNodeIds: ['root'],
        outgoingEdges: [edge('b-rejoin', 'rejoin', 'rejoin')],
        rejoinNodeId: 'rejoin'
      }),
      node('rejoin', 'mission-rejoin', 3, {
        prerequisiteNodeIds: ['route-a', 'route-b'],
        prerequisiteMode: 'any',
        outgoingEdges: [edge('rejoin-end', 'end')]
      }),
      node('end', 'mission-end', 4, {
        prerequisiteNodeIds: ['rejoin']
      })
    ]
  }
};

// REVAMP(G): Resolve real transitive TS/JS dependencies while keeping each
// scenario's explicit campaign/catalog stubs scoped to its loader.
const compileService = (name, requires = {}) =>
  require('./helpers/loadService.cjs').createServiceLoader({ dependencies: requires })(
    path.join(root, 'services', name)
  );

const branchProgression = compileService('campaignBranchProgression.ts');
const progression = compileService('campaignProgression.ts', {
  '../game-config/catalog': { isMajorBossId: () => false, getBossEncounterClass: () => null },
  './gameplay/mini-bosses': { getMiniBossEncounterDefinition: () => undefined },
  './campaignBranchProgression': branchProgression,
  './levelConfig': {
    DEFAULT_GAME_CAMPAIGN: TEST_CAMPAIGN,
    flattenLevels: (campaign) => campaign.levels,
    getBackground: () => ({ tint: '#123456' }),
    getPrimaryAssetPath: () => '/test.png'
  }
});

let resultCounter = 0;
const complete = (progress, missionId, completedAt = '2026-07-28T12:00:00.000Z') => (
  progression.applyCampaignCompletion(progress, {
    resultId: `graph-result-${++resultCounter}`,
    playerId: 'pilot:test',
    campaignId: TEST_CAMPAIGN.id,
    campaignRevision: TEST_CAMPAIGN.revision,
    missionId,
    waveId: `${missionId}-wave-1`,
    stageComplete: true,
    score: 100,
    coinsCollected: 2,
    damageTaken: 0,
    elapsedSeconds: 10,
    masteryEligible: true,
    completedAt
  }, TEST_CAMPAIGN)
);

test('graph completion opens explicit sibling choices without following array order', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  assert.equal(fresh.version, 4);
  assert.equal(fresh.recommendedGraphNodeId, 'root');
  assert.deepEqual(fresh.unlockedGraphNodeIds, ['root']);

  const cleared = complete(fresh, 'mission-root');
  assert.equal(cleared.settlement.accepted, true);
  assert.deepEqual(cleared.progress.completedGraphNodeIds, ['root']);
  assert.deepEqual(cleared.progress.pendingRouteChoice, {
    sourceNodeId: 'root',
    optionNodeIds: ['route-a', 'route-b']
  });
  assert.equal(cleared.progress.recommendedGraphNodeId, 'root');
  assert.equal(cleared.progress.furthestMainGraphNodeId, 'root');
  assert.equal(cleared.progress.selectedRouteTargetBySourceNodeId.root, undefined);
  assert.ok(cleared.progress.unlockedGraphNodeIds.includes('route-a'));
  assert.ok(cleared.progress.unlockedGraphNodeIds.includes('route-b'));
});

test('explicit selection validates direct edges and A never auto-enters sibling B', () => {
  const fresh = progression.createCampaignProgress(TEST_CAMPAIGN);
  assert.equal(
    progression.selectCampaignRoute(fresh, 'missing', 'route-a', TEST_CAMPAIGN).reason,
    'unknown-source'
  );
  assert.equal(
    progression.selectCampaignRoute(fresh, 'root', 'route-a', TEST_CAMPAIGN).reason,
    'source-not-complete'
  );
  const rootClear = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const invalid = progression.selectCampaignRoute(rootClear, 'root', 'rejoin', TEST_CAMPAIGN);
  assert.equal(invalid.accepted, false);
  assert.equal(invalid.reason, 'not-outgoing');

  const selected = progression.selectCampaignRoute(rootClear, 'root', 'route-a', TEST_CAMPAIGN);
  assert.equal(selected.accepted, true);
  assert.equal(selected.progress.pendingRouteChoice, null);
  assert.equal(selected.progress.currentGraphNodeId, 'route-a');
  assert.equal(selected.progress.recommendedMissionId, 'mission-a');
  assert.equal(selected.progress.selectedRouteTargetBySourceNodeId.root, 'route-a');

  const aClear = complete(selected.progress, 'mission-a').progress;
  assert.ok(aClear.completedGraphNodeIds.includes('route-a'));
  assert.ok(!aClear.completedGraphNodeIds.includes('route-b'));
  assert.equal(aClear.currentGraphNodeId, 'rejoin');
  assert.equal(aClear.recommendedGraphNodeId, 'rejoin');
  assert.equal(aClear.furthestMainGraphNodeId, 'rejoin');
  assert.equal(aClear.selectedRouteTargetBySourceNodeId['route-a'], 'rejoin');
});

test('alternate-route replay updates current node without regressing durable checkpoint', () => {
  const rootClear = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const selected = progression.selectCampaignRoute(rootClear, 'root', 'route-a', TEST_CAMPAIGN).progress;
  const afterA = complete(selected, 'mission-a').progress;
  const replaySelection = progression.setCampaignCheckpoint(
    afterA,
    'mission-b',
    'mission-b-wave-1',
    TEST_CAMPAIGN
  );
  assert.equal(replaySelection.currentGraphNodeId, 'route-b');
  assert.equal(replaySelection.recommendedGraphNodeId, 'rejoin');
  assert.equal(replaySelection.recommendedMissionId, 'mission-rejoin');
  assert.equal(replaySelection.furthestMainGraphNodeId, 'rejoin');

  const afterB = complete(replaySelection, 'mission-b').progress;
  assert.ok(afterB.completedGraphNodeIds.includes('route-a'));
  assert.ok(afterB.completedGraphNodeIds.includes('route-b'));
  assert.equal(afterB.recommendedGraphNodeId, 'rejoin');
  assert.equal(afterB.furthestMainGraphNodeId, 'rejoin');
});

test('legacy v3 migration preserves the reached mission and infers its direct fork choice', () => {
  const rootClear = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const legacy = {
    ...rootClear,
    version: 3,
    recommendedMissionId: 'mission-a',
    recommendedWaveId: 'mission-a-wave-1',
    unlockedMissionIds: ['mission-root', 'mission-a']
  };
  delete legacy.recommendedGraphNodeId;
  delete legacy.currentGraphNodeId;
  delete legacy.furthestMainGraphNodeId;
  delete legacy.unlockedGraphNodeIds;
  delete legacy.completedGraphNodeIds;
  delete legacy.selectedRouteTargetBySourceNodeId;
  delete legacy.pendingRouteChoice;

  const migrated = progression.sanitizeCampaignProgress(legacy, { campaign: TEST_CAMPAIGN });
  assert.equal(migrated.version, 4);
  assert.ok(migrated.completedGraphNodeIds.includes('root'));
  assert.equal(migrated.selectedRouteTargetBySourceNodeId.root, 'route-a');
  assert.equal(migrated.pendingRouteChoice, null);
  assert.equal(migrated.recommendedGraphNodeId, 'route-a');
  assert.equal(migrated.recommendedMissionId, 'mission-a');
});

test('profile merge unions completed nodes and source selections deterministically', () => {
  const rootClearA = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const branchA = complete(
    progression.selectCampaignRoute(rootClearA, 'root', 'route-a', TEST_CAMPAIGN).progress,
    'mission-a',
    '2026-07-28T13:00:00.000Z'
  ).progress;

  const rootClearB = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const branchB = complete(
    progression.selectCampaignRoute(rootClearB, 'root', 'route-b', TEST_CAMPAIGN).progress,
    'mission-b',
    '2026-07-28T14:00:00.000Z'
  ).progress;

  const merged = progression.mergeCampaignProgress(branchA, branchB, TEST_CAMPAIGN);
  assert.ok(merged.completedGraphNodeIds.includes('route-a'));
  assert.ok(merged.completedGraphNodeIds.includes('route-b'));
  assert.equal(merged.selectedRouteTargetBySourceNodeId['route-a'], 'rejoin');
  assert.equal(merged.selectedRouteTargetBySourceNodeId['route-b'], 'rejoin');
  assert.ok(['route-a', 'route-b'].includes(merged.selectedRouteTargetBySourceNodeId.root));
  assert.equal(merged.furthestMainGraphNodeId, 'rejoin');
  assert.equal(merged.recommendedGraphNodeId, 'rejoin');
});

test('terminal graph completion marks the Campaign complete', () => {
  const rootClear = complete(progression.createCampaignProgress(TEST_CAMPAIGN), 'mission-root').progress;
  const selected = progression.selectCampaignRoute(rootClear, 'root', 'route-a', TEST_CAMPAIGN).progress;
  const afterA = complete(selected, 'mission-a').progress;
  const afterRejoin = complete(afterA, 'mission-rejoin').progress;
  assert.equal(afterRejoin.recommendedGraphNodeId, 'end');
  const terminal = complete(afterRejoin, 'mission-end').progress;
  assert.equal(terminal.campaignCompleted, true);
  assert.ok(terminal.completedGraphNodeIds.includes('end'));
});
