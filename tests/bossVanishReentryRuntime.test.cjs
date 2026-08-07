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
  'BossVanishReentryRuntime.ts'
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
  startY: 200,
  targetX: 210,
  targetY: 730,
  reentryX: 110,
  reentryY: 690
});

const durations = Object.freeze({
  fadeOutFrames: 2,
  hiddenFrames: 3,
  reentryWarningFrames: 2,
  reappearFrames: 2,
  recoveryFrames: 3
});

test('vanish/re-entry lock preserves exact geometry and reprojects stable ratios on resize', () => {
  const {
    reprojectBossVanishReentryLock,
    resolveBossVanishReentryLock
  } = loadRuntime();
  const lock = resolveBossVanishReentryLock(geometry);

  assert.deepEqual({ ...lock.start }, { x: 195, y: 200 });
  assert.deepEqual({ ...lock.target }, { x: 210, y: 730 });
  assert.deepEqual({ ...lock.reentry }, { x: 110, y: 690 });
  assert.equal(Object.isFrozen(lock), true);
  assert.equal(Object.isFrozen(lock.start), true);
  assert.equal(Object.isFrozen(lock.target), true);
  assert.equal(Object.isFrozen(lock.reentry), true);
  assert.equal(Object.isFrozen(lock.ratios), true);

  const resized = reprojectBossVanishReentryLock(lock, {
    arenaWidth: 780,
    arenaHeight: 1688,
    bossWidth: 360,
    bossHeight: 320
  });
  assert.deepEqual({ ...resized.start }, { x: 390, y: 400 });
  assert.deepEqual({ ...resized.target }, { x: 420, y: 1460 });
  assert.deepEqual({ ...resized.reentry }, { x: 220, y: 1380 });
  assert.ok(Math.abs(resized.reentryDirectionX - lock.reentryDirectionX) < 1e-12);
  assert.ok(Math.abs(resized.reentryDirectionY - lock.reentryDirectionY) < 1e-12);
  assert.ok(Math.abs(resized.reentryAngleRadians - lock.reentryAngleRadians) < 1e-12);
});

test('all five stages occupy exact frame windows with fair authoritative flags', () => {
  const {
    createBossVanishReentryRuntimeState,
    resolveBossVanishReentryLock,
    sampleBossVanishReentryRuntime
  } = loadRuntime();
  const state = createBossVanishReentryRuntimeState({
    startFrame: 10,
    lock: resolveBossVanishReentryLock(geometry),
    durations
  });
  const expectations = [
    ['fade-out', 10, true, false, false, false],
    ['hidden', 12, false, false, false, false],
    ['reentry-warning', 15, false, false, false, true],
    ['reappear', 17, true, false, false, false],
    ['recovery', 19, true, true, true, false]
  ];

  for (const [stage, frame, visible, targetable, collisionActive, warningActive] of expectations) {
    const sample = sampleBossVanishReentryRuntime(state, frame);
    assert.equal(sample.stage, stage);
    assert.equal(sample.stageFrame, 0);
    assert.equal(sample.visible, visible);
    assert.equal(sample.targetable, targetable);
    assert.equal(sample.collisionActive, collisionActive);
    assert.equal(sample.damageActive, false);
    assert.equal(sample.warningActive, warningActive);
    assert.equal(sample.complete, false);
  }

  const hiddenMotion = sampleBossVanishReentryRuntime(state, 14);
  assert.equal(hiddenMotion.stage, 'hidden');
  assert.ok(hiddenMotion.position.x < geometry.startX);
  assert.ok(hiddenMotion.position.x > geometry.reentryX);
  assert.equal(hiddenMotion.opacity, 0);
  assert.deepEqual({ ...hiddenMotion.target }, { x: geometry.targetX, y: geometry.targetY });

  const complete = sampleBossVanishReentryRuntime(state, 22);
  assert.equal(complete.stage, 'recovery');
  assert.equal(complete.stageFrame, durations.recoveryFrames);
  assert.equal(complete.stageProgress, 1);
  assert.equal(complete.totalProgress, 1);
  assert.equal(complete.complete, true);
  assert.equal(complete.shouldCleanup, true);
  assert.equal(complete.visible, true);
  assert.equal(complete.targetable, true);
  assert.equal(complete.collisionActive, true);
  assert.equal(complete.damageActive, false);

  const counts = new Map();
  for (let frame = 10; frame < 22; frame += 1) {
    const stage = sampleBossVanishReentryRuntime(state, frame).stage;
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    'fade-out': 2,
    hidden: 3,
    'reentry-warning': 2,
    reappear: 2,
    recovery: 3
  });
});

test('sampling is deterministic, immutable, and reconstruction-friendly', () => {
  const {
    createBossVanishReentryRuntimeState,
    resolveBossVanishReentryLock,
    sampleBossVanishReentryRuntime
  } = loadRuntime();
  const state = createBossVanishReentryRuntimeState({
    startFrame: 700,
    lock: resolveBossVanishReentryLock(geometry),
    durations
  });
  const reconstructed = JSON.parse(JSON.stringify(state));
  const frames = [700, 703, 706, 709, 712, 704, 711];

  for (const frame of frames) {
    assert.deepEqual(
      { ...sampleBossVanishReentryRuntime(state, frame) },
      { ...sampleBossVanishReentryRuntime(reconstructed, frame) }
    );
  }
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.lock), true);
  assert.equal(Object.isFrozen(state.durations), true);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), reconstructed);
});

test('duration and geometry inputs are bounded before entering runtime state', () => {
  const {
    BOSS_VANISH_REENTRY_MAX_ARENA_DIMENSION,
    BOSS_VANISH_REENTRY_MAX_STAGE_FRAMES,
    BOSS_VANISH_REENTRY_MIN_STAGE_FRAMES,
    resolveBossVanishReentryDurations,
    resolveBossVanishReentryLock
  } = loadRuntime();
  const resolvedDurations = resolveBossVanishReentryDurations({
    fadeOutFrames: -20,
    hiddenFrames: Number.NaN,
    reentryWarningFrames: Number.POSITIVE_INFINITY,
    reappearFrames: 4.9,
    recoveryFrames: 1_000_000
  });
  assert.equal(resolvedDurations.fadeOutFrames, BOSS_VANISH_REENTRY_MIN_STAGE_FRAMES);
  assert.equal(resolvedDurations.hiddenFrames, 30);
  assert.equal(resolvedDurations.reentryWarningFrames, 45);
  assert.equal(resolvedDurations.reappearFrames, 4);
  assert.equal(resolvedDurations.recoveryFrames, BOSS_VANISH_REENTRY_MAX_STAGE_FRAMES);

  const lock = resolveBossVanishReentryLock({
    arenaWidth: Number.POSITIVE_INFINITY,
    arenaHeight: -1,
    bossWidth: 99_999,
    bossHeight: -10,
    startX: -9_999,
    startY: 9_999,
    targetX: -500,
    targetY: 500,
    reentryX: 99_999,
    reentryY: -200
  });
  assert.equal(lock.arenaWidth, 1);
  assert.equal(lock.arenaHeight, 1);
  assert.equal(lock.bossWidth, 1);
  assert.equal(lock.bossHeight, 1);
  assert.deepEqual({ ...lock.start }, { x: 0.5, y: 0.5 });
  assert.deepEqual({ ...lock.target }, { x: 0, y: 1 });
  assert.deepEqual({ ...lock.reentry }, { x: 0.5, y: 0.5 });
  assert.equal(BOSS_VANISH_REENTRY_MAX_ARENA_DIMENSION, 16_384);
});

test('cancellation is idempotent and restores a harmless visible recovery state', () => {
  const {
    cancelBossVanishReentryRuntime,
    createBossVanishReentryRuntimeState,
    resolveBossVanishReentryLock,
    sampleBossVanishReentryRuntime
  } = loadRuntime();
  const state = createBossVanishReentryRuntimeState({
    startFrame: 50,
    lock: resolveBossVanishReentryLock(geometry),
    durations
  });
  const cancelled = cancelBossVanishReentryRuntime(state);
  const repeated = cancelBossVanishReentryRuntime(cancelled);
  const sample = sampleBossVanishReentryRuntime(cancelled, 51);

  assert.notEqual(cancelled, state);
  assert.equal(state.cancelled, false);
  assert.equal(cancelled.cancelled, true);
  assert.equal(repeated, cancelled);
  assert.equal(sample.stage, 'recovery');
  assert.deepEqual({ ...sample.position }, { x: geometry.reentryX, y: geometry.reentryY });
  assert.equal(sample.visible, true);
  assert.equal(sample.targetable, true);
  assert.equal(sample.collisionActive, true);
  assert.equal(sample.damageActive, false);
  assert.equal(sample.complete, true);
  assert.equal(sample.cancelled, true);
  assert.equal(sample.shouldCleanup, true);
});

test('runtime is frame-based and has no ambient clock, randomness, timers, or callbacks', () => {
  const { source } = loadRuntime();
  assert.doesNotMatch(
    source,
    /Math\.random|Date\.|performance\.|setTimeout|setInterval|requestAnimationFrame/
  );
  assert.doesNotMatch(source, /callback/i);
});
