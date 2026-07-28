const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'campaignBranchRuntime.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const runtimeModule = { exports: {} };
Function('exports', 'require', 'module', compiled)(runtimeModule.exports, require, runtimeModule);
const runtime = runtimeModule.exports;

const branch = {
  branchId: 'branch-supply',
  sourceMissionId: 'mission-5',
  missionType: 'present-drop',
  displayName: 'RESEARCH SUPPLY DROP',
  missionDefinition: {
    id: 'present-drop-1',
    kind: 'present-drop',
    backgroundId: 'bastion-protocol',
    musicId: 'procedural-main',
    introSeconds: 3,
    durationSeconds: 48,
    exitSeconds: 3,
    presentTypes: [
      { id: 'standard', displayName: 'STANDARD', kind: 'standard', spriteKey: 'GENERATED_STANDARD', health: 1, coinValue: 4, speedMultiplier: 1, sizeMultiplier: 0.8 },
      { id: 'armored', displayName: 'ARMORED', kind: 'armored', spriteKey: 'GENERATED_ARMORED', health: 4, coinValue: 12, speedMultiplier: 0.7, sizeMultiplier: 1 },
      { id: 'fast', displayName: 'FAST', kind: 'fast', spriteKey: 'GENERATED_FAST', health: 1, coinValue: 7, speedMultiplier: 1.4, sizeMultiplier: 0.75 },
      { id: 'golden', displayName: 'GOLDEN', kind: 'golden', spriteKey: 'GENERATED_GOLDEN', health: 6, coinValue: 60, speedMultiplier: 0.8, sizeMultiplier: 1.2 }
    ],
    spawnGroups: [
      { id: 'standard-wave', startSeconds: 4, count: 2, presentTypeId: 'standard', patternId: 'lane-rain', spawnIntervalSeconds: 0.5 },
      { id: 'armored-wave', startSeconds: 12, count: 1, presentTypeId: 'armored', patternId: 'staggered-columns', spawnIntervalSeconds: 0.8 },
      { id: 'fast-wave', startSeconds: 20, count: 2, presentTypeId: 'fast', patternId: 'sine-sweep', spawnIntervalSeconds: 0.4 },
      { id: 'gold-wave', startSeconds: 42, count: 1, presentTypeId: 'golden', patternId: 'final-center', spawnIntervalSeconds: 1 }
    ]
  },
  completionReward: {
    baseCoins: 40,
    oneTimeBonusCoins: 80,
    maximumPerformanceCoins: 94,
    totalMinimumCoins: 120,
    totalMaximumCoins: 214
  }
};

const campaign = {
  schemaVersion: 1,
  revision: 8,
  id: 'campaign',
  name: 'Campaign',
  updatedAt: '2026-07-27T00:00:00.000Z',
  fps: 60,
  recordCard: {},
  hudAssets: {},
  campaignBranches: [branch],
  levels: [{
    id: 'mission-5',
    name: 'MISSION 5',
    scorecard: { title: 'Mission Record', subtitle: 'SciCon', showEncounterArt: true },
    waves: []
  }]
};

test('present-drop adapter creates one canonical asteroid target event per authored present', () => {
  const result = runtime.buildCampaignBranchRuntimeCampaign(campaign, branch);
  assert.equal(result.levels.length, 1);
  assert.equal(result.levels[0].waves.length, 1);
  assert.equal(result.levels[0].waves[0].completionRule, 'clear-after-duration');
  assert.equal(result.levels[0].waves[0].events.length, 6);
  assert.deepEqual(
    result.levels[0].waves[0].events.map((event) => event.bonusTargetKind),
    ['standard', 'standard', 'armored', 'fast', 'fast', 'golden']
  );
  assert.ok(result.levels[0].waves[0].events.every((event) => event.blocksWaveClock === false));
  assert.ok(result.levels[0].waves[0].events.every((event) => event.damage === 0));
  assert.equal(result.campaignBranches, undefined);
});

test('result verification clamps client counts and coins to authored destroyed value', () => {
  const verified = runtime.verifyPresentDropRuntimeResult(branch, {
    destroyed: { standard: 99, armored: 1, fast: 1, golden: 0 },
    coinsCollected: 999_999
  });
  assert.deepEqual(verified.destroyed, { standard: 2, armored: 1, fast: 1, golden: 0 });
  assert.equal(verified.destroyedTotal, 4);
  assert.equal(verified.collectedPresentCoins, 27);
  assert.equal(verified.baseCacheReward, 40);
  assert.equal(verified.oneTimeCompletionBonus, 80);
  assert.equal(verified.totalCoins, 147);
});

test('runtime source keeps branch missions on the existing asteroid and clear-wave path', () => {
  assert.match(source, /kind: 'asteroid-belt'/);
  assert.match(source, /completionRule: 'clear-after-duration'/);
  assert.match(source, /bonusTargetKind: present\.kind/);
  assert.doesNotMatch(source, /new PIXI|document\.createElement\(['"]canvas/);
});
