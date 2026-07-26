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
  'BossAttackOriginLockRuntime.ts'
);
const enginePath = path.join(root, 'services', 'gameLogic.ts');

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
    { module: moduleBox, require, Math, Number, Object, Array }
  );
  return { exports: moduleBox.exports, source };
};

const plain = (value) => JSON.parse(JSON.stringify(value));

test('side-barrage fire consumes the exact warning socket positions after the boss moves', () => {
  const {
    captureBossAttackOriginLock,
    consumeBossAttackOriginLock
  } = loadRuntime().exports;
  const warningSocketPose = [
    { x: 78, y: 213 },
    { x: 75, y: 355 }
  ];
  const locks = captureBossAttackOriginLock(
    [],
    'nullwake-port-barrage',
    0,
    warningSocketPose
  );

  // The modular boss and its posed sockets continue moving during the lead.
  warningSocketPose[0].x = 248;
  warningSocketPose[0].y = 190;
  warningSocketPose[1].x = 242;
  warningSocketPose[1].y = 331;

  const consumed = consumeBossAttackOriginLock(
    locks,
    'nullwake-port-barrage',
    0
  );
  assert.deepEqual(plain(consumed.lock.origins), [
    { x: 78, y: 213 },
    { x: 75, y: 355 }
  ]);
  assert.deepEqual(plain(consumed.remaining), []);
});

test('gap-ring repeats keep independent warning origins and consume only their matching fire', () => {
  const {
    captureBossAttackOriginLock,
    consumeBossAttackOriginLock,
    getBossAttackOriginLock
  } = loadRuntime().exports;
  let locks = captureBossAttackOriginLock(
    [],
    'nullwake-gap-ring',
    0,
    [{ x: 195, y: 284 }]
  );
  locks = captureBossAttackOriginLock(
    locks,
    'nullwake-gap-ring',
    1,
    [{ x: 222, y: 249 }]
  );

  const firstFire = consumeBossAttackOriginLock(locks, 'nullwake-gap-ring', 0);
  assert.deepEqual(plain(firstFire.lock.origins), [{ x: 195, y: 284 }]);
  assert.deepEqual(
    plain(getBossAttackOriginLock(firstFire.remaining, 'nullwake-gap-ring', 1).origins),
    [{ x: 222, y: 249 }]
  );

  const secondFire = consumeBossAttackOriginLock(
    firstFire.remaining,
    'nullwake-gap-ring',
    1
  );
  assert.deepEqual(plain(secondFire.lock.origins), [{ x: 222, y: 249 }]);
  assert.deepEqual(plain(secondFire.remaining), []);
});

test('origin locks reject invalid geometry, stay bounded, and clear deterministically', () => {
  const { exports, source } = loadRuntime();
  const {
    MAX_BOSS_ATTACK_ORIGIN_LOCKS,
    captureBossAttackOriginLock,
    clearBossAttackOriginLocks
  } = exports;
  const initial = [];
  assert.equal(
    captureBossAttackOriginLock(initial, 'bad', 0, [{ x: Number.NaN, y: 2 }]),
    initial
  );
  assert.equal(
    captureBossAttackOriginLock(initial, '', 0, [{ x: 1, y: 2 }]),
    initial
  );

  let locks = [];
  for (let index = 0; index < MAX_BOSS_ATTACK_ORIGIN_LOCKS + 3; index++) {
    locks = captureBossAttackOriginLock(
      locks,
      `clip-${index}`,
      index % MAX_BOSS_ATTACK_ORIGIN_LOCKS,
      [{ x: index, y: index + 1 }]
    );
  }
  assert.equal(locks.length, MAX_BOSS_ATTACK_ORIGIN_LOCKS);
  assert.deepEqual(plain(clearBossAttackOriginLocks()), []);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});

test('GameEngine wires warning-owned origins into gap rings and side barrages', () => {
  const source = fs.readFileSync(enginePath, 'utf8');

  assert.match(source, /captureBossTimelineActionOrigins\(\s*boss,\s*linkedAction\.id,\s*cue\.executionIndex,\s*\[\{ x: originX, y: originY \}\]\s*\)/);
  assert.match(source, /captureBossTimelineActionOrigins\(\s*boss,\s*linkedAction\.id,\s*cue\.executionIndex,\s*origins\s*\)/);
  assert.match(source, /lockedOrigin\?\.x \?\? coreOrigin\?\.x/);
  assert.match(source, /lockedOrigin\?\.y \?\? coreOrigin\?\.y/);
  assert.match(source, /lockedOrigins && lockedOrigins\.length > 0/);

  const consumers = source.match(/consumeBossTimelineActionOrigins\(\s*boss,\s*cue\.clip\.id,\s*cue\.executionIndex\s*\)/g) ?? [];
  assert.ok(consumers.length >= 2, 'gap-ring and side-barrage must consume exact action keys');

  // Cross-beam already uses the same warning pose through its warning/fire pair.
  assert.match(source, /if \(telegraph\) \{\s*boss\.bossCrossBeamOriginX = currentOriginX;\s*boss\.bossCrossBeamOriginY = currentOriginY;/);
  assert.match(source, /!telegraph && Number\.isFinite\(boss\.bossCrossBeamOriginX\)/);
  assert.match(source, /!telegraph && Number\.isFinite\(boss\.bossCrossBeamOriginY\)/);
  assert.match(source, /if \(!telegraph\) \{\s*boss\.bossCrossBeamOriginX = null;\s*boss\.bossCrossBeamOriginY = null;/);

  const cleanupCalls = source.match(/clearBossTimelineActionLocks\(boss\)/g) ?? [];
  assert.ok(cleanupCalls.length >= 6, 'phase, restart, revival, loop, and preview cleanup must clear locks');
  assert.match(source, /timeline\.loop[\s\S]{0,240}boss\.attackTimer % timelineDurationFrames === 0[\s\S]{0,120}clearBossTimelineActionLocks\(boss\)/);
});
