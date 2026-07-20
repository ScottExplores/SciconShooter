const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const readPngSize = (relativePath) => {
  const png = fs.readFileSync(path.join(root, relativePath));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
};

test('RSC pickup uses the pixel coin and all twelve upright flip frames', () => {
  const constants = read('constants.ts');
  assert.match(constants, /RSC_TOKEN: "\/game-art\/tokens\/rsc-coin-pixel\.png"/);

  const framePaths = [...constants.matchAll(/"(\/game-art\/generated\/rsc-coin-flip-v1\/frames\/rsc-coin-flip-[^"]+\.png)"/g)]
    .map((match) => match[1]);
  assert.equal(framePaths.length, 12);
  assert.deepEqual(readPngSize('public/game-art/tokens/rsc-coin-pixel.png'), { width: 128, height: 128 });

  for (const framePath of framePaths) {
    const relativePath = path.join('public', ...framePath.split('/').filter(Boolean));
    assert.deepEqual(readPngSize(relativePath), { width: 128, height: 128 });
  }
});

test('both gameplay renderers flip through frames without clockwise rotation', () => {
  const pixi = read('services/pixi/PixiGameRenderer.ts');
  const canvas = read('services/gameLogic.ts');

  assert.match(pixi, /return ASSETS\.RSC_TOKEN_FLIP_FRAMES\[frameIndex\]/);
  assert.match(pixi, /entity\.type === EntityType\.COIN[\s\S]{0,300}view\.root\.rotation = 0/);
  assert.doesNotMatch(pixi, /entity\.type === EntityType\.COIN[\s\S]{0,300}view\.root\.rotation = \(engine\.frameCount/);

  assert.match(canvas, /ASSETS\.RSC_TOKEN_FLIP_FRAMES\[frameIndex\]/);
  assert.doesNotMatch(canvas, /ctx\.rotate\(\(this\.frameCount \+ e\.variant\)/);
  assert.doesNotMatch(canvas, /ctx\.scale\(spinWidth, 1\)/);
});

test('static UI, record cards, and Director previews use the pixel coin', () => {
  assert.match(read('api/record-card.js'), /RSC_TOKEN: '\/game-art\/tokens\/rsc-coin-pixel\.png'/);
  assert.match(read('director/src/waves/previewSimulator.ts'), /'\/game-art\/tokens\/rsc-coin-pixel\.png'/);
});
