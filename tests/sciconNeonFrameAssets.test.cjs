const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packRoot = path.join(
  __dirname,
  '..',
  'public',
  'game-art',
  'generated',
  'ui',
  'scicon-neon-frame-v1'
);
const publicRoot = path.join(__dirname, '..', 'public');

const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'pack-manifest.json'), 'utf8'));

const readPngHeader = (publicPath) => {
  const png = fs.readFileSync(path.join(publicRoot, ...publicPath.replace(/^\//, '').split('/')));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    colorType: png[25]
  };
};

test('Scicon Neon-Frame pack registers integral production sprite grids', () => {
  assert.equal(manifest.id, 'scicon-neon-frame-v1');
  assert.deepEqual(manifest.assets.weeklyFundingFrame.grid, [1, 1]);
  assert.deepEqual(manifest.assets.weeklyFundingFrame.frameSize, [896, 256]);
  assert.equal(manifest.assets.weeklyFundingFrame.frameCount, 1);
  assert.deepEqual(manifest.assets.dashboardNavIcons.grid, [5, 1]);
  assert.deepEqual(manifest.assets.dashboardNavIcons.frameSize, [256, 256]);
  assert.deepEqual(manifest.assets.dashboardNavIcons.columns, [
    'proposals',
    'trophies',
    'home',
    'hangar',
    'more'
  ]);
  assert.deepEqual(manifest.assets.dashboardNavIcons.rows, ['static']);
});
test('Scicon Neon-Frame PNG dimensions and alpha contracts match the manifest', () => {
  const weekly = readPngHeader(manifest.assets.weeklyFundingFrame.path);
  const dashboard = readPngHeader(manifest.assets.dashboardNavIcons.path);

  assert.deepEqual([weekly.width, weekly.height], manifest.assets.weeklyFundingFrame.sheetSize);
  assert.equal(weekly.colorType, 6, 'weekly frame should preserve RGBA transparency');
  assert.deepEqual([dashboard.width, dashboard.height], manifest.assets.dashboardNavIcons.sheetSize);
  assert.equal(dashboard.colorType, 6, 'dashboard icon sheet should preserve RGBA transparency');
  assert.equal(dashboard.width % manifest.assets.dashboardNavIcons.grid[0], 0);
  assert.equal(dashboard.height % manifest.assets.dashboardNavIcons.grid[1], 0);
});
