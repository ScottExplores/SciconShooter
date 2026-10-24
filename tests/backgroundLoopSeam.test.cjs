const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const rowDifference = (pixels, width, channels, topRow, bottomRow) => {
  const stride = width * channels;
  let total = 0;
  const sampleChannels = Math.min(3, channels);
  for (let x = 0; x < width; x += 1) {
    const top = topRow * stride + x * channels;
    const bottom = bottomRow * stride + x * channels;
    for (let channel = 0; channel < sampleChannels; channel += 1) {
      total += Math.abs(pixels[top + channel] - pixels[bottom + channel]);
    }
  }
  return total / (width * sampleChannels);
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

test('looped campaign backgrounds blend their top and bottom rows', async () => {
  const { decodePng } = await import('../tools/bake-background-loop-seams.mjs');
  const files = [
    'public/game-art/generated/scicon-space-parallax-pack-v2/backgrounds/violet-rift.png',
    'public/game-art/generated/scicon-breakwater-v1/wreckfield.png',
    'public/game-art/generated/scicon-breakwater-v1/gate.png',
    'public/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/desert/backgrounds/desert-round-master-512x4096.png',
    'public/game-art/generated/backgrounds/scicon-parallax-terrain-pack-v1/river/backgrounds/river-round-master-512x4096.png'
  ];
  for (const relativePath of files) {
    const image = decodePng(fs.readFileSync(path.join(root, relativePath)));
    const edge = rowDifference(image.pixels, image.width, image.channels, 0, image.height - 1);
    const inner = [];
    const sampleStep = Math.max(1, Math.floor(image.height / 24));
    for (let row = sampleStep; row < image.height - sampleStep; row += sampleStep) {
      inner.push(rowDifference(image.pixels, image.width, image.channels, row, row + 1));
    }
    const innerMedian = Math.max(0.25, median(inner));
    assert.ok(
      edge <= innerMedian * 2,
      `${relativePath} seam ${edge.toFixed(2)} exceeds 2x inner median ${innerMedian.toFixed(2)}`
    );
  }
});
