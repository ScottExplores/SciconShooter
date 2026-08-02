const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const publicRoot = path.join(__dirname, '..', 'public');
const packRoot = path.join(
  publicRoot,
  'game-art',
  'generated',
  'ui',
  'scicon-weekly-run-frame-v1'
);
const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'pack-manifest.json'), 'utf8'));

test('Weekly Run lower-frame pack registers one RGBA production frame', () => {
  const asset = manifest.assets.weeklyRunLowerFrame;
  const pngPath = path.join(publicRoot, ...asset.path.replace(/^\//, '').split('/'));
  const png = fs.readFileSync(pngPath);

  assert.equal(manifest.id, 'scicon-weekly-run-frame-v1');
  assert.equal(manifest.runtimeContract.liveTextOnly, true);
  assert.deepEqual(asset.grid, [1, 1]);
  assert.deepEqual(asset.sheetSize, [960, 284]);
  assert.deepEqual(asset.frameSize, [960, 284]);
  assert.equal(asset.frameCount, 1);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], asset.sheetSize);
  assert.equal(png[25], 6, 'Weekly Run frame should preserve RGBA transparency');
  assert.equal(crypto.createHash('sha256').update(png).digest('hex'), asset.sha256);
});
