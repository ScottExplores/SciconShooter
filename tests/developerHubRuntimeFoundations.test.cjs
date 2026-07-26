const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const loadTypeScriptModule = (...segments) => {
  const compiled = ts.transpileModule(read(...segments), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, Array, Map, Set, Date, Uint32Array }
  );
  return moduleBox.exports;
};

test('seeded gameplay random streams replay the same bounded simulation choices', () => {
  const {
    createSeededGameplayRandom,
    normalizeGameplayRandomSeed
  } = loadTypeScriptModule('services', 'gameplay', 'random', 'gameplayRandom.ts');
  const first = createSeededGameplayRandom('boss-lab-seed');
  const replay = createSeededGameplayRandom('boss-lab-seed');
  const alternate = createSeededGameplayRandom('alternate-seed');

  const sequence = Array.from({ length: 12 }, () => first.next());
  const replaySequence = Array.from({ length: 12 }, () => replay.next());
  const alternateSequence = Array.from({ length: 12 }, () => alternate.next());

  assert.deepEqual(sequence, replaySequence);
  assert.notDeepEqual(sequence, alternateSequence);
  sequence.forEach((value) => assert.ok(value >= 0 && value < 1));
  assert.equal(first.seed, normalizeGameplayRandomSeed('boss-lab-seed'));

  const integerStream = createSeededGameplayRandom(42);
  const integers = Array.from({ length: 50 }, () => integerStream.integer(3, 8));
  integers.forEach((value) => assert.ok(Number.isInteger(value) && value >= 3 && value < 8));
});

test('local gameplay telemetry retains a bounded tail while preserving complete aggregates', () => {
  const { createBoundedGameplayTelemetrySink } = loadTypeScriptModule(
    'services',
    'gameplay',
    'telemetry',
    'gameplayTelemetry.ts'
  );
  const sink = createBoundedGameplayTelemetrySink({ maxEvents: 3 });
  const context = {
    frame: 10,
    elapsedSeconds: 1 / 6,
    levelId: 'mission-one',
    waveId: 'opening'
  };

  sink.record({ ...context, type: 'wave-start', levelNumber: 1, waveNumber: 1 });
  sink.record({
    ...context,
    frame: 11,
    type: 'entity-damage',
    targetId: 'enemy-1',
    targetKind: 'ENEMY_DRONE',
    sourceKind: 'player',
    amount: 12,
    remainingHealth: 0,
    fatal: true
  });
  sink.record({
    ...context,
    frame: 12,
    type: 'entity-damage',
    targetId: 'player',
    targetKind: 'player',
    sourceKind: 'enemy',
    amount: 1,
    remainingHealth: 2,
    fatal: false
  });
  sink.record({
    ...context,
    frame: 13,
    type: 'boss-phase',
    bossId: 'gatekeeper',
    phaseId: 'rage',
    phaseIndex: 2,
    healthRatio: 0.25
  });
  sink.record({ ...context, frame: 14, type: 'completion', scope: 'wave', score: 500 });

  const snapshot = sink.getSnapshot();
  assert.deepEqual(Array.from(snapshot.events, (event) => event.frame), [12, 13, 14]);
  assert.equal(snapshot.aggregate.recordedEventCount, 5);
  assert.equal(snapshot.aggregate.retainedEventCount, 3);
  assert.equal(snapshot.aggregate.droppedEventCount, 2);
  assert.equal(snapshot.aggregate.damageDealt, 12);
  assert.equal(snapshot.aggregate.damageTaken, 1);
  assert.equal(snapshot.aggregate.entitiesDestroyed, 1);
  assert.equal(snapshot.aggregate.wavesStarted, 1);
  assert.equal(snapshot.aggregate.wavesCompleted, 1);
  assert.equal(snapshot.aggregate.bossPhaseTransitions, 1);
  assert.equal(Object.isFrozen(snapshot.events), true);
  assert.equal(Object.isFrozen(snapshot.aggregate), true);

  sink.clear();
  assert.equal(sink.getSnapshot().aggregate.recordedEventCount, 0);
});

test('preview session controls clamp speed and remain isolated behind preview props', () => {
  const { clampPreviewTimeScale } = loadTypeScriptModule(
    'services',
    'gameplay',
    'previewSession.ts'
  );
  assert.equal(clampPreviewTimeScale(-4), 0.25);
  assert.equal(clampPreviewTimeScale(1.5), 1.5);
  assert.equal(clampPreviewTimeScale(20), 2);
  assert.equal(clampPreviewTimeScale(Number.NaN), 1);

  const canvas = read('components', 'GameCanvas.tsx');
  const editor = read('components', 'GameEditorCanvas.tsx');
  const engine = read('services', 'gameLogic.ts');
  assert.match(canvas, /previewCommand\?: PreviewCommand \| null/);
  assert.match(canvas, /const telemetrySink = previewMode/);
  assert.match(canvas, /previewMode[\s\S]*telemetrySink[\s\S]*onTelemetrySnapshotRef\.current/);
  assert.match(canvas, /randomSeed: previewMode \? previewSeed : undefined/);
  assert.match(editor, /onPreviewPlayingChange: onPlayingChange/);
  assert.match(engine, /randomSeed\?: GameplayRandomSeed/);
  assert.match(engine, /telemetrySink\?: GameplayTelemetrySink/);
  assert.match(engine, /setGameplayRandomSeed\(seed: GameplayRandomSeed\)/);
});
