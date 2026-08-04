const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
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

// Scott restored the legacy roster on 2026-08-03: the Spinner is an active
// orbit-scout again, so its facing-aware frame runtime is back in both the
// engine and the renderer, and its art is eagerly preloaded.
test('Spinner art is active again with its facing runtime in engine and renderer', () => {
  const activeSpawnKeys = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .flatMap((event) => event.enemies || [])
    .map((enemy) => enemy.spriteKey);

  assert.match(engineSource, /resolveKamikazeSpinnerFrameIndex/);
  assert.match(rendererSource, /resolveKamikazeSpinnerFrameIndex/);
  assert.match(engineSource, /\.\.\.ASSETS\.LEGACY_ENEMY_DRONE_FRAMES/);
  assert.match(rendererSource, /\.\.\.ASSETS\.LEGACY_ENEMY_DRONE_FRAMES/);
  assert.ok(activeSpawnKeys.includes('LEGACY_ENEMY_DRONE_FRAMES'));
  assert.ok(!activeSpawnKeys.includes('SCICON_ENEMY_ORBIT_SCOUT_FRAMES'));
});
