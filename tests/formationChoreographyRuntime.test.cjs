const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'gameplay', 'formations', 'FormationRuntime.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const runtime = loadRuntime();
const viewport = { width: 412, height: 915 };

test('entry, movement, attack, firing, and return behaviors resolve independently', () => {
  const pack = {
    id: 'proof-pack',
    label: 'Proof pack',
    formationIds: ['double-v'],
    enemyRoleIds: ['basic'],
    entryDirection: 'top',
    entryPath: 'formation-drop',
    movementBehavior: 'gentle-drift',
    attackBehavior: 'paired-dive',
    firingBehavior: 'post-formation',
    returnBehavior: 'reform',
    holdSeconds: 2,
    telegraphSeconds: 0.6,
    attackDurationSeconds: 1.4,
    attackRecoverySeconds: 1.1,
    attackGroupSize: 2,
    attackCycles: 2,
    maximumSimultaneousGroups: 1,
    cooldownSeconds: 1
  };
  const resolved = runtime.resolveFormationChoreography({
    patternId: 'double-v',
    formationBehavior: {
      entryPathId: 'paired-flank',
      movementId: 'expand-collapse',
      attackId: 'alternating-wings',
      firingBehavior: 'staggered',
      returnId: 'transform',
      attackGroupSize: 3
    }
  }, pack);

  assert.deepEqual({
    entryPathId: resolved.entryPathId,
    movementId: resolved.movementId,
    attackId: resolved.attackId,
    firingBehavior: resolved.firingBehavior,
    returnId: resolved.returnId,
    attackGroupSize: resolved.attackGroupSize
  }, {
    entryPathId: 'paired-flank',
    movementId: 'expand-collapse',
    attackId: 'alternating-wings',
    firingBehavior: 'staggered',
    returnId: 'transform',
    attackGroupSize: 3
  });
  assert.equal(resolved.holdSeconds, 2, 'unoverridden timing remains inherited from the pack');
});

test('one formation shape can enter from genuinely different authored paths', () => {
  const common = { id: 'same-shape', patternId: 'double-v' };
  const drop = runtime.resolveConfiguredFormationSpawnPoint({
    event: { ...common, entryPathId: 'formation-drop' },
    index: 0,
    count: 6,
    viewport,
    randomSample: 0.5
  });
  const flank = runtime.resolveConfiguredFormationSpawnPoint({
    event: { ...common, entryPathId: 'paired-flank' },
    index: 0,
    count: 6,
    viewport,
    randomSample: 0.5
  });
  assert.ok(drop.x > 0 && drop.x < viewport.width, 'formation drop begins above the playfield');
  assert.ok(flank.x < 0 || flank.x > viewport.width, 'paired flank begins outside a side edge');
  assert.notDeepEqual(drop, flank);
});

test('attack cycles choose small deterministic subgroups rather than the whole formation', () => {
  assert.deepEqual(runtime.resolveFormationAttackIndices('paired-dive', 0, 10, 2), [0, 9]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('paired-dive', 1, 10, 2), [1, 8]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('alternating-wings', 0, 10, 3), [0, 1, 2]);
  assert.deepEqual(runtime.resolveFormationAttackIndices('alternating-wings', 1, 10, 3), [5, 6, 7]);
});

test('assembled movement is a stable sample around immutable slot geometry', () => {
  const input = {
    movementId: 'rotating-wheel',
    base: { x: 120, y: 140 },
    groupCenter: { x: 206, y: 180 },
    frame: 240,
    groupSeed: 11,
    index: 2,
    count: 8,
    viewport,
    transformCycle: 0
  };
  const first = runtime.resolveFormationMovementPoint(input);
  const repeated = runtime.resolveFormationMovementPoint(input);
  const later = runtime.resolveFormationMovementPoint({ ...input, frame: 300 });
  assert.deepEqual(first, repeated, 'replaying the same frame cannot accumulate positional drift');
  assert.notDeepEqual(first, later, 'the formation still has readable assembled motion');
  assert.ok(Math.hypot(first.x - input.groupCenter.x, first.y - input.groupCenter.y) < 140);
});
