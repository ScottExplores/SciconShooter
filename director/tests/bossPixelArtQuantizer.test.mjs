import assert from 'node:assert/strict';
import test from 'node:test';
import pngjs from 'pngjs';
import {
  analyzeBossPixelArtPng,
  quantizeBossPixelArt
} from '../../tools/quantize-boss-pixel-art.mjs';

const { PNG } = pngjs;

test('boss pixel-art quantization is deterministic, bounded, and preserves binary alpha', () => {
  const source = new PNG({ width: 32, height: 16, colorType: 6 });
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      source.data[offset] = x * 7;
      source.data[offset + 1] = y * 13;
      source.data[offset + 2] = (x * 11 + y * 5) % 256;
      source.data[offset + 3] = x < 2 ? 0 : 255;
    }
  }
  const first = quantizeBossPixelArt(source, 12);
  const repeated = quantizeBossPixelArt(source, 12);
  assert.ok(first.before.opaquePaletteSize > 12);
  assert.ok(first.after.opaquePaletteSize <= 12);
  assert.equal(first.after.semitransparentPixels, 0);
  assert.equal(first.after.transparentPixels, first.before.transparentPixels);
  assert.deepEqual(Buffer.from(first.image.data), Buffer.from(repeated.image.data));
  assert.deepEqual(first.palette, repeated.palette);
});

test('boss pixel-art analysis rejects hidden anti-aliased structural alpha before quantization', () => {
  const source = new PNG({ width: 2, height: 1, colorType: 6 });
  source.data.set([10, 20, 30, 255, 40, 50, 60, 128]);
  assert.equal(analyzeBossPixelArtPng(source).semitransparentPixels, 1);
  assert.throws(
    () => quantizeBossPixelArt(source, 8),
    /semi-transparent alpha 128/
  );
});

