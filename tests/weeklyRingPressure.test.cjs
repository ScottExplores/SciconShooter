const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const load = () => {
  const bundle = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'gameplay', 'mini-bosses', 'weeklyRingPressure.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false
  }).outputFiles[0].text;
  const holder = { exports: {} };
  new Function('module', 'exports', bundle)(holder, holder.exports);
  return holder.exports;
};

test('weekly ring volleys open up, then fill in without a dense first burst', () => {
  const { stageWeeklyRingVolley } = load();
  const baseGap = Math.PI * 0.38;
  const opening = stageWeeklyRingVolley(0, 30, baseGap);
  const middle = stageWeeklyRingVolley(1, 30, baseGap);
  const full = stageWeeklyRingVolley(4, 30, baseGap);

  assert.ok(opening.count < middle.count);
  assert.ok(middle.count <= full.count);
  assert.ok(full.count <= 14);
  assert.ok(opening.gapArc > middle.gapArc);
  assert.ok(middle.gapArc > full.gapArc);
  assert.ok(opening.gapArc >= 0.72);
  assert.equal(opening.onScreenCap, 10);
  assert.equal(middle.onScreenCap, 14);
  assert.equal(full.onScreenCap, 18);
  assert.equal(opening.telegraph, true);
});
