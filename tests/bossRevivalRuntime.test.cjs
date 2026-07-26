const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (relativePath) => {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Math, Number, Object }
  );
  return module.exports;
};

const phases = [
  {
    id: 'dormant',
    label: 'Dormant',
    triggerHealthRatio: 1,
    movementPatternId: 'track-player',
    speedMultiplier: 1,
    weaponSettingIds: ['opening']
  },
  {
    id: 'awakened',
    label: 'Awakened',
    triggerHealthRatio: 0.05,
    movementPatternId: 'arena-roam',
    speedMultiplier: 1.2,
    weaponSettingIds: ['awakened']
  },
  {
    id: 'critical',
    label: 'Critical',
    triggerHealthRatio: 0.01,
    movementPatternId: 'arena-roam',
    speedMultiplier: 1.4,
    weaponSettingIds: ['awakened']
  }
];

const config = {
  phaseId: 'awakened',
  shutdownSeconds: 0.1,
  rebootSeconds: 0.1,
  restoreHealthRatio: 1,
  awakenedSizeMultiplier: 1.5
};

test('one-use revival advances through exact deterministic shutdown and reboot frames', () => {
  const {
    advanceBossRevivalRuntime,
    createBossRevivalRuntimeState
  } = loadTypeScriptModule('services/gameplay/bosses/BossRevivalRuntime.ts');
  let state = createBossRevivalRuntimeState(config, phases, 220, 200, 300);
  assert.ok(state);
  assert.equal(state.stage, 'shutdown');
  assert.equal(state.targetPhaseIndex, 1);
  assert.ok(Math.abs(state.targetWidth - 246) < 1e-9);
  assert.ok(Math.abs(state.targetHeight - (200 * 246 / 220)) < 1e-9);

  let previousShutdownProgress = 0;
  for (let frameIndex = 0; frameIndex < 5; frameIndex++) {
    const frame = advanceBossRevivalRuntime(state, config, 900, 60);
    state = frame.state;
    assert.equal(state.stage, 'shutdown');
    assert.equal(state.stageFrame, frameIndex + 1);
    assert.equal(frame.health, 0);
    assert.equal(frame.progress, (frameIndex + 1) / 6);
    assert.ok(frame.progress > previousShutdownProgress);
    previousShutdownProgress = frame.progress;
    assert.equal(frame.completedNow, false);
  }

  const shutdownBoundary = advanceBossRevivalRuntime(state, config, 900, 60);
  state = shutdownBoundary.state;
  assert.equal(state.stage, 'rebooting');
  assert.equal(state.stageFrame, 0);
  assert.equal(shutdownBoundary.health, 0);
  assert.equal(shutdownBoundary.progress, 1);
  assert.ok(shutdownBoundary.progress > previousShutdownProgress);
  assert.equal(shutdownBoundary.completedNow, false);

  for (let frameIndex = 1; frameIndex <= 6; frameIndex++) {
    const frame = advanceBossRevivalRuntime(state, config, 900, 60);
    state = frame.state;
    assert.equal(frame.progress, frameIndex / 6);
    assert.equal(frame.health, 900 * frameIndex / 6);
    assert.ok(frame.width >= 220 && frame.width <= 246);
    assert.equal(frame.completedNow, frameIndex === 6);
  }

  assert.equal(state.stage, 'complete');
  const stable = advanceBossRevivalRuntime(state, config, 900, 60);
  assert.equal(stable.state, state);
  assert.equal(stable.health, 900);
  assert.ok(Math.abs(stable.width - 246) < 1e-9);
  assert.equal(stable.progress, 1);
  assert.equal(stable.completedNow, false);
});

test('Nullwake V0.6 revival keeps exact 132-frame shutdown and 156-frame reboot semantics', () => {
  const {
    advanceBossRevivalRuntime,
    createBossRevivalRuntimeState
  } = loadTypeScriptModule('services/gameplay/bosses/BossRevivalRuntime.ts');
  const nullwakeConfig = {
    ...config,
    shutdownSeconds: 2.2,
    rebootSeconds: 2.6,
    awakenedSizeMultiplier: 1.22
  };
  let state = createBossRevivalRuntimeState(nullwakeConfig, phases, 370, 311, 4_200);
  let previousProgress = 0;

  for (let frameIndex = 1; frameIndex <= 132; frameIndex++) {
    const frame = advanceBossRevivalRuntime(state, nullwakeConfig, 4_200, 60);
    state = frame.state;
    assert.equal(frame.progress, frameIndex / 132);
    assert.ok(frame.progress > previousProgress);
    assert.equal(frame.health, 0);
    assert.equal(frame.completedNow, false);
    assert.equal(state.stage, frameIndex === 132 ? 'rebooting' : 'shutdown');
    previousProgress = frame.progress;
  }
  assert.equal(state.stageFrame, 0);

  for (let frameIndex = 1; frameIndex <= 156; frameIndex++) {
    const frame = advanceBossRevivalRuntime(state, nullwakeConfig, 4_200, 60);
    state = frame.state;
    assert.equal(frame.progress, frameIndex / 156);
    assert.ok(Math.abs(frame.health - (4_200 * frameIndex / 156)) < 1e-9);
    assert.equal(frame.completedNow, frameIndex === 156);
    assert.equal(state.stage, frameIndex === 156 ? 'complete' : 'rebooting');
  }
  assert.equal(state.stageFrame, 156);
});

test('revival phase bounds cap bar one and floor the awakened health bar', () => {
  const {
    getBossRevivalPhaseBounds,
    getBossRevivalTargetPhaseIndex
  } = loadTypeScriptModule('services/gameplay/bosses/BossRevivalRuntime.ts');
  assert.equal(getBossRevivalTargetPhaseIndex(config, phases), 1);
  assert.deepEqual(
    { ...getBossRevivalPhaseBounds(config, phases, false) },
    { maximumPhaseIndex: 0 }
  );
  assert.deepEqual(
    { ...getBossRevivalPhaseBounds(config, phases, true) },
    { minimumPhaseIndex: 1 }
  );
  assert.equal(getBossRevivalTargetPhaseIndex({ ...config, phaseId: 'missing' }, phases), -1);
});

test('completed preview reconstruction uses awakened bounds without replaying transition', () => {
  const {
    createCompletedBossRevivalRuntimeState
  } = loadTypeScriptModule('services/gameplay/bosses/BossRevivalRuntime.ts');
  const state = createCompletedBossRevivalRuntimeState(config, phases, 220, 200, 1200, 60);
  assert.ok(state);
  assert.equal(state.stage, 'complete');
  assert.equal(state.targetPhaseIndex, 1);
  assert.equal(state.targetWidth, 330);
  assert.equal(state.targetHeight, 300);
  assert.equal(state.stageFrame, 6);
});

test('Nullwake mobile growth is visible while respecting the 82-percent viewport cap', () => {
  const {
    getBossRevivalTargetDimensions
  } = loadTypeScriptModule('services/gameplay/bosses/BossRevivalRuntime.ts');
  const baseWidth = 220 * 1.32;
  const baseHeight = 200 * 1.32;
  const target = getBossRevivalTargetDimensions(baseWidth, baseHeight, 1.22, 390);

  assert.ok(Math.abs(target.width - (390 * 0.82)) < 1e-9);
  assert.ok(target.width > baseWidth * 1.1);
  assert.ok(target.width < baseWidth * 1.11);
  assert.ok(Math.abs(target.height - (baseHeight * target.width / baseWidth)) < 1e-9);
});

test('revival runtime has no ambient time or randomness dependency', () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'BossRevivalRuntime.ts'),
    'utf8'
  );
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('engine intercepts first depletion before true death and disables combat during transition', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const deathStart = source.indexOf('handleEnemyDestroyed(target: Entity)');
  const deathEnd = source.indexOf('\n  applyResearchBeamDamage()', deathStart);
  const deathPath = source.slice(deathStart, deathEnd);
  const interception = deathPath.indexOf('this.beginBossRevival(target)');
  assert.ok(interception >= 0);
  for (const irreversibleAction of [
    "getBossTimelineTriggeredCues(",
    'target.markedForDeletion = true',
    'this.stats.enemiesDefeated++',
    'this.spawnBossCoinBurst(target)',
    'this.mainBossDefeated = true',
    'this.waveTransitionPending = true'
  ]) {
    assert.ok(
      interception < deathPath.indexOf(irreversibleAction),
      `${irreversibleAction} occurs only after revival interception`
    );
  }

  assert.match(source, /entity\.bossRevivalStage !== 'shutdown'[\s\S]*entity\.bossRevivalStage !== 'rebooting'/);
  assert.match(source, /if \(!this\.isBossCombatInteractive\(entity\)\) return false/);
  assert.match(source, /firstDepletionWillRevive \? false : undefined/);
  assert.match(source, /if \(this\.updateBossRevival\(boss\)\) return/);
  assert.match(source, /createCompletedBossRevivalRuntimeState\(/);
});
