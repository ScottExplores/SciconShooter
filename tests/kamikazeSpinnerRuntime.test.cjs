const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const runtimePath = path.join(root, 'services', 'gameplay', 'enemies', 'KamikazeSpinnerRuntime.ts');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

const loadRuntime = () => {
  const result = esbuild.buildSync({
    entryPoints: [runtimePath],
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
const frameBlock = constantsSource.match(/LEGACY_ENEMY_DRONE_FRAMES:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
const frames = [...frameBlock.matchAll(/"([^"]+\.png)"/g)].map((match) => match[1]);

test('Kamikaze Spinner ships six transparent fixed-canvas runtime frames and a reference sheet', () => {
  assert.equal(frames.length, 6);
  frames.forEach((url) => {
    const file = path.join(root, 'public', url.replace(/^\//, ''));
    const png = fs.readFileSync(file);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 512);
    assert.equal(png.readUInt32BE(20), 512);
    assert.equal(png[25], 6, `${url} keeps an alpha channel`);
  });
  const sheet = path.join(
    root,
    'public',
    'game-art',
    'generated',
    'scicon-kamikaze-spinner-v1',
    'enemies',
    'kamikaze-spinner',
    'kamikaze-spinner-sprite-sheet.png'
  );
  assert.ok(fs.existsSync(sheet));
});

test('assembled scouts spin through every pose while every dive frame faces forward', () => {
  const input = {
    frames,
    campaignRoleId: 'role-orbit-scout',
    formationIndex: 0,
    variant: 0
  };
  const assembled = new Set();
  for (let frameCount = 0; frameCount < 42; frameCount += 7) {
    assembled.add(runtime.resolveKamikazeSpinnerFrameIndex({ ...input, formationState: 'hold', frameCount }));
  }
  assert.deepEqual([...assembled].sort(), [0, 1, 2, 3, 4, 5]);
  assert.equal(runtime.resolveKamikazeSpinnerFrameIndex({ ...input, formationState: 'dive', frameCount: 0 }), 0);
  assert.equal(runtime.resolveKamikazeSpinnerFrameIndex({ ...input, formationState: 'dive', frameCount: 999 }), 0);
});

test('Canvas, Pixi, and startup preload share the same state-aware Spinner frames', () => {
  assert.match(engineSource, /resolveKamikazeSpinnerFrameIndex\(/);
  assert.match(engineSource, /getEnemyAnimatedFrame\(e\.spriteFrames, e, 6\)/);
  assert.match(engineSource, /\.\.\.ASSETS\.LEGACY_ENEMY_DRONE_FRAMES/);
  assert.match(rendererSource, /resolveKamikazeSpinnerFrameIndex\(/);
  assert.match(rendererSource, /isKamikazeSpinner\([\s\S]*?\['dive'\]\.includes\(entity\.formationState\)[\s\S]*?view\.root\.rotation = 0/);
  assert.match(rendererSource, /\.\.\.ASSETS\.LEGACY_ENEMY_DRONE_FRAMES/);
});
