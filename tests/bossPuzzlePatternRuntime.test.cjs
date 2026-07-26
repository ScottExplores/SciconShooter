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
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module: moduleBox, require, Math, Number, Object, Array }
  );
  return { exports: moduleBox.exports, source };
};

test('weave walls deterministically reserve two adjacent safe lanes and use fewer mobile lanes', () => {
  const {
    resolveBossWeaveWallLayout,
    buildBossWeaveWallSlots
  } = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossPatternRuntime.ts')
  ).exports;

  const desktop = resolveBossWeaveWallLayout(1000, false, 3);
  const mobile = resolveBossWeaveWallLayout(390, true, 3);
  const shifted = resolveBossWeaveWallLayout(1000, false, 4);
  const slots = buildBossWeaveWallSlots(desktop, 24, 3);

  assert.equal(desktop.laneCount, 10);
  assert.equal(mobile.laneCount, 7);
  assert.equal(desktop.safeGapEndLane, desktop.safeGapStartLane + 1);
  assert.equal(shifted.safeGapStartLane, desktop.safeGapStartLane + 1);
  assert.equal(slots.length, 24);
  assert.ok(slots.every((slot) => (
    slot.laneIndex !== desktop.safeGapStartLane
    && slot.laneIndex !== desktop.safeGapEndLane
  )));
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildBossWeaveWallSlots(desktop, 24, 3))),
    JSON.parse(JSON.stringify(slots))
  );
});

test('pod handedness and repeated puzzle sequences are stable and contain no ambient randomness', () => {
  const { exports, source } = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossPatternRuntime.ts')
  );

  assert.deepEqual(
    [0, 1, 2, 3].map((index) => exports.resolveBossPodSide(2, index)),
    ['left', 'right', 'left', 'right']
  );
  assert.equal(exports.resolveBossPatternSequence(5, 0), 5);
  assert.equal(exports.resolveBossPatternSequence(5, 3), 8);
  assert.equal(exports.resolveBossPatternSequence(undefined, 3), 3);
  assert.doesNotMatch(source, /Math\.random/);
});

test('connected safe routes ping-pong without edge wrapping and teach the exact ring opening', () => {
  const { exports, source } = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossPatternRuntime.ts')
  );

  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((sequence) => (
      exports.resolveBossPingPongIndex(sequence, 3)
    )),
    [0, 1, 2, 3, 2, 1, 0, 1]
  );
  const clockwise = [0, 1, 2, 3, 4].map((sequence) => (
    exports.resolveBossGapRoute({
      arenaWidth: 390,
      arenaHeight: 844,
      originX: 195,
      originY: 220,
      sequence,
      direction: 'clockwise'
    })
  ));
  assert.deepEqual(clockwise.map((route) => route.routeIndex), [0, 1, 2, 3, 2]);
  assert.deepEqual(clockwise.map((route) => route.x), [78, 156, 234, 312, 234]);
  assert.equal(
    exports.resolveBossGapRouteDirection('seeded-random', 4),
    'clockwise'
  );
  assert.equal(
    exports.resolveBossGapRouteDirection('seeded-random', 5),
    'counterclockwise'
  );
  assert.doesNotMatch(source, /Math\.random/);
});

test('boss action presentation uses simulation frames and preserves authored action metadata', () => {
  const { exports, source } = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossActionPresentationRuntime.ts')
  );
  const cueClip = {
    id: 'weave-warning',
    label: 'Weave warning',
    track: 'presentation',
    primitiveId: 'telegraph',
    trigger: 'time',
    startSeconds: 1,
    durationSeconds: 0.5,
    parameters: { warningSeconds: 0.75, telegraphStyle: 'lane' }
  };
  const sourceClip = {
    id: 'weave-fire',
    label: 'Weave wall',
    track: 'attack',
    primitiveId: 'weave-wall',
    trigger: 'time',
    startSeconds: 1.75,
    durationSeconds: 0.2,
    parameters: { sequence: 4, projectileCount: 18 }
  };
  const state = exports.createBossActionPresentationState({
    cueClip,
    sourceClip,
    stage: 'warning',
    attackFrame: 120,
    executionIndex: 2,
    framesPerSecond: 60
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(state)),
    {
      actionClipId: 'weave-fire',
      executionIndex: 2,
      label: 'Weave wall',
      primitiveId: 'weave-wall',
      stage: 'warning',
      startFrame: 120,
      endFrame: 165,
      sequence: 6
    }
  );
  assert.doesNotMatch(source, /Math\.random/);
});

test('all repeated presentation primitives advance sequence and recovery is an authored stage', () => {
  const { exports } = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossActionPresentationRuntime.ts')
  );
  const clip = {
    id: 'ring-fire',
    label: 'Ring route',
    track: 'attack',
    primitiveId: 'gap-ring',
    trigger: 'time',
    startSeconds: 1,
    durationSeconds: 0.2,
    parameters: { sequence: 3, projectileCount: 18 }
  };
  const state = exports.createBossActionPresentationState({
    cueClip: clip,
    sourceClip: clip,
    stage: 'recovery',
    attackFrame: 180,
    executionIndex: 2,
    framesPerSecond: 60
  });

  assert.equal(state.stage, 'recovery');
  assert.equal(state.sequence, 5);
});

test('sustained rotor presentation preserves bounded authored cadence and pixel roles stay deterministic', () => {
  const actionRuntime = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossActionPresentationRuntime.ts')
  ).exports;
  const projectileRuntime = loadTypeScriptModule(
    path.join('services', 'gameplay', 'bosses', 'BossProjectilePresentationRuntime.ts')
  );
  const sourceClip = {
    id: 'rotor-fire',
    label: 'Rotor sentence',
    track: 'attack',
    primitiveId: 'rotor-hazard-sentence',
    trigger: 'time',
    startSeconds: 1,
    durationSeconds: 6.5,
    parameters: {
      sequence: 1,
      projectileCount: 6,
      pulseIntervalSeconds: 0.75,
      motionCue: 'rotor-volley'
    }
  };
  const state = actionRuntime.createBossActionPresentationState({
    cueClip: sourceClip,
    sourceClip,
    stage: 'fire',
    attackFrame: 90,
    executionIndex: 0,
    framesPerSecond: 60
  });

  assert.equal(state.sequence, 1);
  assert.equal(state.projectileCount, 6);
  assert.equal(state.pulseIntervalSeconds, 0.75);
  assert.equal(
    projectileRuntime.exports.resolveBossPixelProjectileVisualKind('#facc15'),
    'boss-pixel-gold'
  );
  assert.equal(
    projectileRuntime.exports.resolveBossPixelProjectileVisualKind('#67e8f9'),
    'boss-pixel-prism'
  );
  assert.equal(
    projectileRuntime.exports.resolveBossPixelProjectileVisualKind('#fb7185'),
    'boss-pixel-pink'
  );
  assert.doesNotMatch(projectileRuntime.source, /Math\.random|Date\.|performance\./);
});

test('engine tags sprite pods and generated boss projectiles with deterministic ownership', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(source, /projectileVisualKind = 'boss-pod'/);
  assert.match(source, /projectile\.bossPodSide = resolveBossPodSide\(sequence, index\)/);
  assert.match(source, /projectile\.bossOwnerId = boss\.id/);
  assert.match(source, /resolveBossPixelProjectileVisualKind\(color\)/);
  assert.match(source, /'SAFE CHANNEL'/);
  assert.match(source, /const presentation = createBossActionPresentationState/);
  assert.match(source, /boss\.bossActionPresentation = presentation/);
  assert.match(source, /boss\.bossRotorAngleRadians/);
  assert.match(source, /showBossGapRingSafeRoute/);
  assert.match(source, /isBossGapGuide/);
  assert.match(source, /resolveBossGapRoute\(/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf('spawnBossSafeGapRing('),
      source.indexOf('spawnBossInwardCollapse(')
    ),
    /playerAngle/
  );
});
