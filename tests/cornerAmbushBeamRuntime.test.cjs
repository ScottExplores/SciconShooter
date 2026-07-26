const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadRuntime = () => {
  const source = fs.readFileSync(
    path.join(root, 'services', 'gameplay', 'bosses', 'CornerAmbushBeamRuntime.ts'),
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

const plain = (value) => JSON.parse(JSON.stringify(value));

test('corner ambush sequence deterministically selects opposite upper corners', () => {
  const { resolveCornerAmbushBeamLock } = loadRuntime();
  const baseInput = {
    arenaWidth: 960,
    arenaHeight: 720,
    bossWidth: 220,
    bossHeight: 200,
    playerCenterX: 510,
    playerCenterY: 640,
    mobileProfile: false
  };
  const left = resolveCornerAmbushBeamLock({ ...baseInput, sequence: 0 });
  const leftAgain = resolveCornerAmbushBeamLock({ ...baseInput, sequence: 0 });
  const right = resolveCornerAmbushBeamLock({ ...baseInput, sequence: 1 });

  assert.deepEqual(plain(leftAgain), plain(left));
  assert.equal(left.side, 'upper-left');
  assert.equal(right.side, 'upper-right');
  assert.ok(left.bossX < right.bossX);
  assert.equal(left.bossY, right.bossY);
  assert.equal(left.originX, left.bossX + baseInput.bossWidth / 2);
  assert.equal(left.originY, left.bossY + baseInput.bossHeight * 0.72);
  assert.equal(left.targetX, baseInput.playerCenterX);
  assert.equal(left.targetY, baseInput.playerCenterY);
  assert.ok(Math.abs(
    left.angleRadians
    - Math.atan2(left.targetY - left.originY, left.targetX - left.originX)
  ) < 1e-12);
});

test('corner ambush ray reaches the viewport edge and respects mobile-safe margins', () => {
  const { resolveCornerAmbushBeamLock } = loadRuntime();
  const mobile = resolveCornerAmbushBeamLock({
    sequence: 1,
    arenaWidth: 390,
    arenaHeight: 844,
    bossWidth: 180,
    bossHeight: 164,
    playerCenterX: 388,
    playerCenterY: 842,
    mobileProfile: true
  });
  const directionX = Math.cos(mobile.angleRadians);
  const directionY = Math.sin(mobile.angleRadians);
  const beamEndX = mobile.beamCenterX + directionX * mobile.beamLength / 2;
  const beamEndY = mobile.beamCenterY + directionY * mobile.beamLength / 2;

  assert.ok(mobile.bossX >= 12);
  assert.ok(mobile.bossX + 180 <= 390 - 12);
  assert.ok(mobile.bossY >= Math.max(72, Math.min(844 * 0.13, 116)));
  assert.ok(mobile.targetX <= 390 - 24);
  assert.ok(mobile.targetY <= 844 - 24);
  assert.ok(
    beamEndX <= 0 || beamEndX >= 390 || beamEndY <= 0 || beamEndY >= 844,
    'the damaging rectangle must extend through a viewport boundary'
  );
});

test('rotated beam collision follows the rendered angle instead of its axis-aligned bounds', () => {
  const { rotatedBeamRectangleIntersectsBox } = loadRuntime();
  const diagonalBeam = {
    x: 0,
    y: 90,
    width: 200,
    height: 18,
    angleRadians: Math.PI / 4
  };

  assert.equal(rotatedBeamRectangleIntersectsBox(
    diagonalBeam,
    { x: 144, y: 144, width: 12, height: 12 }
  ), true);
  assert.equal(rotatedBeamRectangleIntersectsBox(
    diagonalBeam,
    { x: 144, y: 14, width: 12, height: 12 }
  ), false);
});

test('GameEngine requires the warning lock and shares it with one angled live beam', () => {
  const { source } = loadRuntime();
  const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  assert.match(engineSource, /case 'corner-ambush-beam':[\s\S]*this\.fireBossCornerAmbushBeam\(boss, cue\)/);
  assert.match(engineSource, /state\.actionClipId !== cue\.clip\.id/);
  assert.match(engineSource, /this\.spawnBossCornerAmbushBeamEntity\(boss, state\.lock, false, liveFrames\)/);
  assert.match(engineSource, /style === 'target'[\s\S]*linkedAction\?\.primitiveId === 'corner-ambush-beam'/);
  assert.match(engineSource, /entity\.isBeam && entity\.beamAngleRadians !== null/);
  assert.match(engineSource, /resize\(width: number, height: number\)[\s\S]*boss\.bossCornerAmbushBeamState = undefined/);
  assert.doesNotMatch(source, /Math\.random|Date\.|performance\./);
});
