const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');
const manifestPath = path.join(
  publicRoot,
  'game-art',
  'generated',
  'powerups',
  'scicon-powerup-idle-pack-v1',
  'pack-manifest.json'
);

const readPngSize = (filePath) => {
  const png = fs.readFileSync(filePath);
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25]
  };
};

test('power-up idle pack has four fixed-registration six-frame PNG animations', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.id, 'scicon-powerup-idle-pack-v1');
  assert.equal(manifest.powerups.length, 4);

  for (const powerup of manifest.powerups) {
    assert.deepEqual(powerup.frameSize, [256, 256]);
    assert.equal(powerup.registration, 'fixed-center');
    assert.equal(powerup.frames.length, 6);

    for (const relativePath of [powerup.static, ...powerup.frames]) {
      const filePath = path.join(publicRoot, ...relativePath.split('/'));
      assert.ok(fs.existsSync(filePath), `${relativePath} should exist`);
      assert.deepEqual(readPngSize(filePath), { width: 256, height: 256, colorType: 6 });
    }

    const sheetPath = path.join(publicRoot, ...powerup.spriteSheet.split('/'));
    assert.deepEqual(readPngSize(sheetPath), { width: 1536, height: 256, colorType: 6 });
    assert.ok(fs.existsSync(path.join(publicRoot, ...powerup.previewGif.split('/'))));
  }
});

test('both renderers advance PNG power-up frames without scaling the pickup', () => {
  const constants = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
  const pixi = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');
  const canvas = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

  for (const key of [
    'POWERUP_OVERDRIVE_SPREAD_FRAMES',
    'POWERUP_MAGNET_FRAMES',
    'POWERUP_SHIELD_FRAMES',
    'POWERUP_RESEARCH_BEAM_FRAMES'
  ]) {
    assert.match(constants, new RegExp(`${key}: \\[`));
    assert.match(pixi, new RegExp(`\\.\\.\\.ASSETS\\.${key}`));
    assert.match(canvas, new RegExp(`\\.\\.\\.ASSETS\\.${key}`));
  }

  assert.match(pixi, /view\.root\.scale\.set\(1\)/);
  assert.match(pixi, /view\.root\.rotation = 0/);
  assert.match(canvas, /const frameIndex = Math\.floor\(\(this\.frameCount \+ e\.variant\) \/ 8\) % frames\.length/);
});
