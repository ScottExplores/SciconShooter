const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { PNG } = require('../director/node_modules/pngjs');

const ROOT = path.resolve(__dirname, '..');
const IDS = Object.freeze([
  'fracture-engine-elite',
  'aegis-brood-core',
  'railspine-wallcrawler',
  'maw-carrier',
  'twin-meridian-sentinels',
  'prism-bloom',
  'aegis-convoy-captain',
  'gridline-sentries'
]);
const STATES = Object.freeze(['neutral', 'idle', 'charge', 'attack-a', 'attack-b', 'damage', 'critical']);

const readPng = (filePath) => PNG.sync.read(fs.readFileSync(filePath));

const inspectAlpha = (png) => {
  const visited = new Uint8Array(png.width * png.height);
  const colors = new Set();
  let components = 0;
  let visible = 0;
  let semiTransparent = 0;
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let pixel = 0; pixel < png.width * png.height; pixel += 1) {
    const offset = pixel * 4;
    const alpha = png.data[offset + 3];
    if (alpha === 0) continue;
    visible += 1;
    if (alpha !== 255) semiTransparent += 1;
    colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
    const x = pixel % png.width;
    const y = Math.floor(pixel / png.width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] || png.data[start * 4 + 3] === 0) continue;
    components += 1;
    visited[start] = 1;
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % png.width;
      const y = Math.floor(pixel / png.width);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) continue;
        const next = nextY * png.width + nextX;
        if (visited[next] || png.data[next * 4 + 3] === 0) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
  }
  return { visible, semiTransparent, colors: colors.size, components, left, top, right, bottom };
};

test('all eight Mini-Boss Lab elites use the shared small-scale pixel contract', () => {
  for (const id of IDS) {
    const centroids = [];
    for (const state of STATES) {
      const filePath = path.join(ROOT, 'public', 'game-art', 'generated', 'mini-boss-lab-v3', id, `${id}-${state}.png`);
      assert.equal(fs.existsSync(filePath), true, `${id} ${state} exists`);
      const png = readPng(filePath);
      assert.deepEqual([png.width, png.height], [192, 192], `${id} ${state} equal canvas`);
      const report = inspectAlpha(png);
      assert.equal(report.semiTransparent, 0, `${id} ${state} binary alpha`);
      assert.ok(report.colors <= 32, `${id} ${state} limited palette`);
      assert.equal(report.components, 1, `${id} ${state} one connected structural body`);
      assert.ok(report.visible >= 1500, `${id} ${state} readable coverage`);
      assert.ok(report.left >= 8 && report.top >= 8 && report.right <= 183 && report.bottom <= 183, `${id} ${state} safe gutter`);
      centroids.push((report.left + report.right) / 2);
    }
    assert.ok(Math.max(...centroids) - Math.min(...centroids) <= 4, `${id} state pivots remain registered`);
  }
});
test('registry and runner consume V3 while generic circular elite shield rendering is absent', () => {
  const registry = fs.readFileSync(path.join(ROOT, 'services', 'gameplay', 'mini-bosses', 'MiniBossEncounterRegistry.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');
  const runner = fs.readFileSync(path.join(ROOT, 'director', 'remote', 'runnerAssetUrlRewrite.mjs'), 'utf8');
  assert.match(registry, /mini-boss-lab-v3/);
  assert.doesNotMatch(registry, /mini-boss-lab-v2/);
  assert.match(runner, /mini-boss-lab-v3/);
  assert.doesNotMatch(
    renderer,
    /miniBossLabShielded[\s\S]{0,400}\.ellipse\(/,
    'elite guard state must not draw a generic circular bubble'
  );
});
