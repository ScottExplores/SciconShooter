const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'services/floatingLabelLayout.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  logLevel: 'silent'
});
const loaded = { exports: {} };
Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, loaded, loaded.exports);
const { clampFloatingLabelCenter, estimateFloatingLabelWidth } = loaded.exports;

test('attack labels stay inside the 412px safe area', () => {
  const viewport = 412;
  const inset = 8;
  const label = 'SIDE BARRAGE';
  const fontSize = 15;
  const width = estimateFloatingLabelWidth(label, fontSize);
  const half = width / 2;

  const fromRight = clampFloatingLabelCenter(390, label, fontSize, viewport);
  assert.ok(fromRight - half >= inset, `left edge ${fromRight - half} left the inset`);
  assert.ok(fromRight + half <= viewport - inset, `right edge ${fromRight + half} left the screen`);

  const fromLeft = clampFloatingLabelCenter(15, label, fontSize, viewport);
  assert.ok(fromLeft - half >= inset);
  assert.ok(fromLeft + half <= viewport - inset);

  const centered = clampFloatingLabelCenter(viewport / 2, 'GO', 32, viewport);
  assert.equal(centered, viewport / 2);

  const banner = clampFloatingLabelCenter(viewport / 2 + 15, 'MISSION LOST', 24, viewport);
  assert.equal(banner, viewport / 2 + 15);

  const huge = clampFloatingLabelCenter(40, 'SIDE BARRAGE '.repeat(8).trim(), 15, viewport);
  assert.equal(huge, viewport / 2);

  const logic = fs.readFileSync(path.join(root, 'services/gameLogic.ts'), 'utf8');
  assert.match(logic, /clampFloatingLabelCenter\(x \+ 15, text, fontSize, this\.width\)/);
  assert.match(logic, /new VisualEffect\(visualCenterX - 15, y, 'text'/);
});
