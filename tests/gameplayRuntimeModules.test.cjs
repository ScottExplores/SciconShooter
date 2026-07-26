const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (...segments) => {
  const filePath = path.join(root, ...segments);
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object, String }
  );
  return module.exports;
};

test('formation geometry is deterministic across custom, built-in, and entry plans', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const viewport = { width: 390, height: 844 };
  const event = {
    id: 'formation-proof',
    patternId: 'spiral',
    positionId: 'formation-top',
    spawnAnchor: { x: 0.5, y: 0.16 },
    enemySpriteKeys: []
  };

  assert.equal(formations.resolveConfiguredFormationMode('wall-march'), 'grid');
  assert.equal(formations.resolveConfiguredFormationMode('sine-wave'), 'sine');
  assert.equal(
    formations.getFormationGroupSeed(event.id),
    formations.getFormationGroupSeed(event.id)
  );

  const firstTarget = formations.resolveConfiguredFormationTarget({
    event,
    index: 2,
    count: 8,
    entityWidth: 44,
    entityHeight: 44,
    viewport
  });
  const repeatedTarget = formations.resolveConfiguredFormationTarget({
    event,
    index: 2,
    count: 8,
    entityWidth: 44,
    entityHeight: 44,
    viewport
  });
  assert.deepEqual(firstTarget, repeatedTarget);

  const firstEntry = formations.resolveConfiguredFormationSpawnPoint({
    event,
    index: 2,
    count: 8,
    viewport,
    randomSample: 0.314159
  });
  const repeatedEntry = formations.resolveConfiguredFormationSpawnPoint({
    event,
    index: 2,
    count: 8,
    viewport,
    randomSample: 0.314159
  });
  assert.deepEqual(firstEntry, repeatedEntry);

  const plan = formations.resolveFormationEntryPlan({
    eventId: event.id,
    patternId: event.patternId,
    index: 2,
    count: 8,
    currentFrame: 100,
    waveProgressFrames: 50,
    baseVerticalSpeed: -1.5,
    sideSentry: false,
    framesPerSecond: 60,
    target: firstTarget
  });
  assert.equal(plan.mode, 'spiral');
  assert.equal(plan.entryFrames, 76);
  assert.equal(plan.diveFrame, 282);
  assert.equal(plan.seed, 88);
  assert.equal(plan.baseSpeed, 2.2);
  assert.deepEqual(plan.target, firstTarget);

  const sentryPlan = formations.resolveFormationEntryPlan({
    eventId: event.id,
    patternId: event.patternId,
    index: 2,
    count: 8,
    currentFrame: 100,
    waveProgressFrames: 50,
    baseVerticalSpeed: -1.5,
    sideSentry: true,
    framesPerSecond: 60,
    target: firstTarget
  });
  assert.equal(sentryPlan.diveFrame, 920, 'wall sentries retain the twelve-second hold');
});

test('formation compatibility layouts preserve the DNA and ring fleet geometry', () => {
  const formations = loadTypeScriptModule(
    'services',
    'gameplay',
    'formations',
    'FormationRuntime.ts'
  );
  const viewport = { width: 390, height: 844 };
  const resolveFleet = (id, enemySpriteKeys) => Array.from({ length: 4 }, (_, index) => (
    formations.resolveConfiguredFormationTarget({
      event: { id, patternId: 'row', enemySpriteKeys },
      index,
      count: 4,
      entityWidth: 44,
      entityHeight: 44,
      viewport
    })
  )).map(({ x, y }) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);

  assert.deepEqual(
    resolveFleet('null-sector-proof', ['CAMPAIGN_ENEMY_DNA_CONDUCTOR']),
    [[63.8, 113.04], [227.6, 183.04], [227.6, 253.04], [63.8, 323.04]]
  );
  assert.deepEqual(
    resolveFleet('ring-proof', ['CAMPAIGN_ENEMY_RING_SENTINEL']),
    [[173, 133.04], [254.9, 175.04], [173, 217.04], [91.1, 175.04]]
  );
});

test('difficulty resolution preserves authored values and bounds compatibility tiers', () => {
  const difficulty = loadTypeScriptModule(
    'services',
    'gameplay',
    'difficulty',
    'DifficultyResolver.ts'
  );

  assert.equal(difficulty.resolveAuthoredDifficulty({
    startingDifficulty: 1.23,
    waveDifficultyMultiplier: 1.1
  }), 1.23 * 1.1);
  assert.equal(difficulty.resolveAuthoredDifficulty({
    startingDifficulty: 0,
    waveDifficultyMultiplier: 0
  }), 0.01);

  const source = {
    startingDifficulty: 1.23,
    waveDifficultyMultiplier: 1.1
  };
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 0
  }), 1.23 * 1.1);
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 2
  }), 1.23 * 1.1 * 1.08);
  assert.equal(difficulty.resolveCampaignDifficulty({
    ...source,
    progressionTier: 999
  }), 1.23 * 1.1 * 1.12);
});
