const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const framePath = path.join(
  __dirname,
  '..',
  'public',
  'game-art',
  'record-card',
  'mission-record-frame.png'
);

test('mission record frame is an optimized square RGBA pixel sprite', () => {
  const png = fs.readFileSync(framePath);

  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 600);
  assert.equal(png.readUInt32BE(20), 600);
  assert.equal(png[25], 6, 'PNG must retain an alpha channel');
  assert.ok(png.byteLength < 350_000, 'frame should stay lightweight enough for NFT metadata');
});
