const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(
  root,
  'services',
  'gameplay',
  'bosses',
  'BossEscapeRuntime.ts'
);

const loadRuntime = () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object }
  );
  return { source, ...moduleBox.exports };
};

const geometry = Object.freeze({
  arenaWidth: 390,
  arenaHeight: 844,
  bossWidth: 180,
  bossHeight: 160,
  startX: 195,
  startY: 220,
  exitX: 480,
  exitY: -90
});

const durations = Object.freeze({
  damagedStaggerFrames: 2,
  falseFinishFrames: 3,
  escapeChargeFrames: 2,
  escapingFrames: 4
});

test('escape lock preserves bounded geometry and reprojects exactly across resize', () => {
  const { reprojectBossEscapeLock, resolveBossEscapeLock } = loadRuntime();
  const lock = resolveBossEscapeLock(geometry);

  assert.deepEqual({ ...lock.start }, { x: 195, y: 220 });
  assert.deepEqual({ ...lock.exit }, { x: 480, y: -90 });
  assert.equal(Object.isFrozen(lock), true);
  assert.equal(Object.isFrozen(lock.start), true);
  assert.equal(Object.isFrozen(lock.exit), true);
  assert.equal(Object.isFrozen(lock.ratios), true);
  assert.ok(lock.directionX > 0);
  assert.ok(lock.directionY < 0);

  const resized = reprojectBossEscapeLock(lock, {
    arenaWidth: 780,
    arenaHeight: 1688,
    bossWidth: 360,
    bossHeight: 320
  });
  assert.deepEqual({ ...resized.start }, { x: 390, y: 440 });
  assert.deepEqual({ ...resized.exit }, { x: 960, y: -180 });
  assert.ok(Math.abs(resized.directionX - lock.directionX) < 1e-12);
  assert.ok(Math.abs(resized.directionY - lock.directionY) < 1e-12);
  assert.ok(Math.abs(resized.angleRadians - lock.angleRadians) < 1e-12);
});

test('terminal stages occupy exact windows and never expose damaging combat', () => {
  const {
    createBossEscapeRuntimeState,
    resolveBossEscapeLock,
    sampleBossEscapeRuntime
  } = loadRuntime();
  const state = createBossEscapeRuntimeState({
    startFrame: 10,
    lock: resolveBossEscapeLock(geometry),
    durations
  });
  const expectations = [
    ['damaged-stagger', 10],
    ['false-finish', 12],
    ['escape-charge', 15],
    ['escaping', 17],
    ['complete', 21]
  ];

  for (const [stage, frame] of expectations) {
    const sample = sampleBossEscapeRuntime(state, frame);
    assert.equal(sample.stage, stage);
    assert.equal(sample.stageProgress, stage === 'complete' ? 1 : 0);
    assert.equal(sample.targetable, false);
    assert.equal(sample.collisionActive, false);
    assert.equal(sample.damageActive, false);
    assert.equal(sample.cancelled, false);
  }
  assert.equal(sampleBossEscapeRuntime(state, 10).hazardCleanupRequested, true);
  assert.equal(sampleBossEscapeRuntime(state, 11).hazardCleanupRequested, false);

  const beforeComplete = sampleBossEscapeRuntime(state, 20);
  assert.equal(beforeComplete.complete, false);
  assert.equal(beforeComplete.completionReady, false);
  assert.equal(beforeComplete.rewardReady, false);
  const complete = sampleBossEscapeRuntime(state, 21);
  assert.equal(complete.complete, true);
  assert.equal(complete.completionReady, true);
  assert.equal(complete.rewardReady, true);
  assert.equal(complete.visible, false);
  assert.equal(complete.opacity, 0);
  assert.equal(complete.shouldCleanup, true);

  const counts = new Map();
  for (let frame = 10; frame < 21; frame += 1) {
    const stage = sampleBossEscapeRuntime(state, frame).stage;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    'damaged-stagger': 2,
    'false-finish': 3,
    'escape-charge': 2,
    escaping: 4
  });
});

test('pose, charge, travel, fade, and trail sampling are deterministic and bounded', () => {
  const {
    createBossEscapeRuntimeState,
    resolveBossEscapeLock,
    sampleBossEscapeRuntime
  } = loadRuntime();
  const state = createBossEscapeRuntimeState({
    startFrame: 0,
    lock: resolveBossEscapeLock(geometry),
    durations
  });
  const stagger = sampleBossEscapeRuntime(state, 1);
  assert.notEqual(stagger.pose.offsetX, 0);
  assert.ok(Math.abs(stagger.pose.rotationOffsetRadians) <= 0.075);

  const chargeStart = sampleBossEscapeRuntime(state, 5);
  const chargeEnd = sampleBossEscapeRuntime(state, 6);
  assert.equal(chargeStart.stage, 'escape-charge');
  assert.equal(chargeEnd.stage, 'escape-charge');
  assert.ok(chargeEnd.pose.chargeIntensity > chargeStart.pose.chargeIntensity);
  assert.ok(chargeEnd.escapeTrailIntensity > chargeStart.escapeTrailIntensity);

  const escaping = [7, 8, 9, 10].map((frame) => sampleBossEscapeRuntime(state, frame));
  for (let index = 1; index < escaping.length; index += 1) {
    assert.ok(escaping[index].travelProgress > escaping[index - 1].travelProgress);
    assert.ok(escaping[index].center.x > escaping[index - 1].center.x);
    assert.ok(escaping[index].center.y < escaping[index - 1].center.y);
    assert.ok(escaping[index].opacity <= escaping[index - 1].opacity);
    assert.ok(escaping[index].escapeTrailIntensity <= escaping[index - 1].escapeTrailIntensity);
  }
  assert.equal(escaping.at(-1).travelProgress, 1);
  assert.deepEqual(
    { ...escaping.at(-1).center },
    { x: geometry.exitX, y: geometry.exitY }
  );
  assert.equal(escaping.at(-1).opacity, 0);
  assert.equal(escaping.at(-1).escapeTrailIntensity, 0);
});

test('serialized reconstruction and runtime reprojection preserve phase-relative motion', () => {
  const {
    createBossEscapeRuntimeState,
    reprojectBossEscapeRuntimeState,
    resolveBossEscapeLock,
    sampleBossEscapeRuntime
  } = loadRuntime();
  const state = createBossEscapeRuntimeState({
    startFrame: 100,
    lock: resolveBossEscapeLock(geometry),
    durations
  });
  const reconstructed = JSON.parse(JSON.stringify(state));

  for (const frame of [100, 103, 106, 107, 109, 111]) {
    assert.deepEqual(
      { ...sampleBossEscapeRuntime(state, frame) },
      { ...sampleBossEscapeRuntime(reconstructed, frame) }
    );
  }
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.lock), true);
  assert.equal(Object.isFrozen(state.durations), true);

  const resizedState = reprojectBossEscapeRuntimeState(state, {
    arenaWidth: 780,
    arenaHeight: 1688,
    bossWidth: 360,
    bossHeight: 320
  });
  const originalSample = sampleBossEscapeRuntime(state, 109);
  const resizedSample = sampleBossEscapeRuntime(resizedState, 109);
  assert.equal(resizedSample.travelProgress, originalSample.travelProgress);
  assert.ok(Math.abs(resizedSample.center.x - originalSample.center.x * 2) < 1e-9);
  assert.ok(Math.abs(resizedSample.center.y - originalSample.center.y * 2) < 1e-9);
});

test('duration and geometry inputs clamp to finite documented bounds', () => {
  const {
    BOSS_ESCAPE_MAX_STAGE_FRAMES,
    BOSS_ESCAPE_MIN_STAGE_FRAMES,
    resolveBossEscapeDurations,
    resolveBossEscapeLock
  } = loadRuntime();
  const resolvedDurations = resolveBossEscapeDurations({
    damagedStaggerFrames: -50,
    falseFinishFrames: Number.NaN,
    escapeChargeFrames: 4.9,
    escapingFrames: 999_999
  });
  assert.equal(resolvedDurations.damagedStaggerFrames, BOSS_ESCAPE_MIN_STAGE_FRAMES);
  assert.equal(resolvedDurations.falseFinishFrames, 54);
  assert.equal(resolvedDurations.escapeChargeFrames, 4);
  assert.equal(resolvedDurations.escapingFrames, BOSS_ESCAPE_MAX_STAGE_FRAMES);

  const lock = resolveBossEscapeLock({
    arenaWidth: 390,
    arenaHeight: 844,
    bossWidth: 900,
    bossHeight: -2,
    startX: -500,
    startY: 9_000,
    exitX: 9_000,
    exitY: -9_000
  });
  assert.equal(lock.bossWidth, 390);
  assert.equal(lock.bossHeight, 1);
  assert.deepEqual({ ...lock.start }, { x: 195, y: 843.5 });
  assert.deepEqual({ ...lock.exit }, { x: 585, y: -422 });
});

test('cancellation is idempotent, restores the start, and grants no terminal reward', () => {
  const {
    cancelBossEscapeRuntime,
    createBossEscapeRuntimeState,
    resolveBossEscapeLock,
    sampleBossEscapeRuntime
  } = loadRuntime();
  const state = createBossEscapeRuntimeState({
    startFrame: 50,
    lock: resolveBossEscapeLock(geometry),
    durations
  });
  const cancelled = cancelBossEscapeRuntime(state);
  const repeated = cancelBossEscapeRuntime(cancelled);
  const sample = sampleBossEscapeRuntime(cancelled, 70);

  assert.notEqual(cancelled, state);
  assert.equal(state.cancelled, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal(repeated, cancelled);
  assert.equal(sample.stage, 'complete');
  assert.deepEqual({ ...sample.center }, { ...state.lock.start });
  assert.equal(sample.visible, true);
  assert.equal(sample.targetable, true);
  assert.equal(sample.collisionActive, true);
  assert.equal(sample.damageActive, false);
  assert.equal(sample.complete, true);
  assert.equal(sample.completionReady, false);
  assert.equal(sample.rewardReady, false);
  assert.equal(sample.hazardCleanupRequested, false);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.shouldCleanup, true);
});

test('escape runtime has no boss identity, ambient clock, randomness, timers, or callbacks', () => {
  const { source } = loadRuntime();
  assert.doesNotMatch(source, /umbra|needlewing/i);
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|setTimeout|setInterval|requestAnimationFrame/
  );
  assert.doesNotMatch(source, /callback/i);
});
