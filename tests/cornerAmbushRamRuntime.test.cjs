const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'CornerAmbushRamRuntime.ts'),
    'utf8'
  );
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
  return { source, ...moduleBox.exports };
};

test('corner ram locks opposite lower corners and crosses the warned player point', () => {
  const { resolveCornerAmbushRamLock } = loadRuntime();
  const input = {
    arenaWidth: 390,
    arenaHeight: 844,
    bossWidth: 190,
    bossHeight: 170,
    playerCenterX: 210,
    playerCenterY: 730,
    mobileProfile: true
  };
  const left = resolveCornerAmbushRamLock({ ...input, sequence: 0 });
  const right = resolveCornerAmbushRamLock({ ...input, sequence: 1 });
  assert.equal(left.side, 'lower-left');
  assert.equal(right.side, 'lower-right');
  assert.ok(left.startX < right.startX);
  assert.equal(left.targetX, input.playerCenterX);
  assert.equal(left.targetY, input.playerCenterY);
  assert.ok(left.exitY < left.startY);
  assert.ok(right.exitY < right.startY);
});

test('later corner ram sequences alternate mid-edge entries and preserve one nonhoming crossing lock', () => {
  const { resolveCornerAmbushRamLock } = loadRuntime();
  const input = {
    arenaWidth: 390,
    arenaHeight: 844,
    bossWidth: 190,
    bossHeight: 170,
    playerCenterX: 248,
    playerCenterY: 704,
    mobileProfile: true
  };
  const midLeft = resolveCornerAmbushRamLock({ ...input, sequence: 2 });
  const midRight = resolveCornerAmbushRamLock({ ...input, sequence: 3 });

  assert.equal(midLeft.side, 'mid-left');
  assert.equal(midRight.side, 'mid-right');
  assert.ok(midLeft.startX < midRight.startX);
  assert.ok(midLeft.startY < input.arenaHeight * 0.55);
  assert.ok(midRight.startY < input.arenaHeight * 0.55);

  for (const lock of [midLeft, midRight]) {
    assert.equal(lock.targetX, input.playerCenterX);
    assert.equal(lock.targetY, input.playerCenterY);
    const startCenterX = lock.startX + input.bossWidth / 2;
    const startCenterY = lock.startY + input.bossHeight / 2;
    const exitCenterX = lock.exitX + input.bossWidth / 2;
    const exitCenterY = lock.exitY + input.bossHeight / 2;
    const targetVectorX = lock.targetX - startCenterX;
    const targetVectorY = lock.targetY - startCenterY;
    const exitVectorX = exitCenterX - startCenterX;
    const exitVectorY = exitCenterY - startCenterY;
    const cross = targetVectorX * exitVectorY - targetVectorY * exitVectorX;
    const along = (
      targetVectorX * exitVectorX + targetVectorY * exitVectorY
    ) / (exitVectorX * exitVectorX + exitVectorY * exitVectorY);

    assert.ok(Math.abs(cross) < 1e-6, 'the warned player point stays on the fixed charge line');
    assert.ok(along > 0 && along < 1, 'the charge crosses the lock before its full arena exit');
    assert.ok(
      lock.exitX + input.bossWidth < 0
        || lock.exitX > input.arenaWidth
        || lock.exitY + input.bossHeight < 0
        || lock.exitY > input.arenaHeight,
      'the fixed charge ends with the complete boss body outside the arena'
    );
  }
});

test('corner ram acceleration is bounded, deterministic, and monotonic', () => {
  const { sampleCornerAmbushRamProgress } = loadRuntime();
  const samples = [0, 0.1, 0.25, 0.5, 0.75, 1].map(sampleCornerAmbushRamProgress);
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 1);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1]);
  }
});

test('GameEngine keeps the warned lane authoritative and enables body damage only while charging', () => {
  const { source } = loadRuntime();
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engineSource, /case 'corner-ambush-ram':[\s\S]*this\.fireBossCornerAmbushRam\(boss, cue\)/);
  assert.match(engineSource, /state\.actionClipId !== cue\.clip\.id/);
  assert.match(engineSource, /sampleCornerAmbushRamProgress\(rawProgress\)/);
  assert.match(engineSource, /e\.bossCornerAmbushRamState\.stage === 'charge'/);
  assert.match(engineSource, /style === 'target'[\s\S]*linkedAction\?\.primitiveId === 'corner-ambush-ram'/);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});
