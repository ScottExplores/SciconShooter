const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('../director/node_modules/pngjs');

const directory = path.resolve(__dirname, '../public/game-art/generated/scicon-breakwater-v1');

test('Breakwater layers are portrait, memory-bounded and keep the central combat lane transparent', () => {
  for (const name of ['far-space', 'approach', 'wreckfield', 'gate']) {
    const data = fs.readFileSync(path.join(directory, `${name}.png`));
    const png = PNG.sync.read(data);
    assert.ok(png.width <= 1024 && png.height <= 2300, `${name}: portrait texture memory budget`);
    assert.ok(png.height / png.width >= 1.8 && png.height / png.width <= 2.4, `${name}: phone aspect`);
    assert.ok(data.length < 5_000_000, `${name}: download budget`);
    if (name === 'far-space') continue;
    let opaque = 0, centerOpaque = 0, centerPixels = 0;
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const alpha = png.data[(y * png.width + x) * 4 + 3];
        if (alpha > 0) opaque++;
        if (x >= png.width * 0.28 && x <= png.width * 0.72) {
          centerPixels++;
          if (alpha > 24) centerOpaque++;
        }
      }
    }
    assert.ok(opaque > png.width * png.height * 0.01, `${name}: not an empty asset`);
    assert.ok(opaque < png.width * png.height * 0.5, `${name}: real transparent background`);
    assert.ok(centerOpaque / centerPixels < 0.015, `${name}: central firing/dodging lane stays clear`);
  }
});
