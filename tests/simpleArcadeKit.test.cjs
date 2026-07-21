const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'public', 'game-art', 'generated', 'ui', 'scicon-simple-arcade-kit-v1');
const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'pack-manifest.json'), 'utf8'));
const fromPublicPath = (value) => path.join(root, 'public', ...value.split('/').filter(Boolean));

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const values = [left, up, upperLeft];
  const distances = values.map((value) => Math.abs(estimate - value));
  return values[distances.indexOf(Math.min(...distances))];
};

const decodeRgbaPng = (file) => {
  const png = fs.readFileSync(file);
  const idat = [];
  let width = 0;
  let height = 0;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const kind = png.toString('ascii', offset + 4, offset + 8);
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.equal(body[8], 8, `${file} should use 8-bit channels`);
      assert.equal(body[9], 6, `${file} should be RGBA`);
      assert.equal(body[12], 0, `${file} should not be interlaced`);
    } else if (kind === 'IDAT') {
      idat.push(body);
    }
    offset += length + 12;
    if (kind === 'IEND') break;
  }
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upperLeft = x >= 4 ? previous[x - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : assert.fail(`Unsupported PNG filter ${filter}`);
      row[x] = (raw + predictor) & 0xff;
    }
    row.copy(pixels, y * stride);
    previous = row;
    sourceOffset += stride;
  }
  return { width, height, pixels };
};

const alphaAt = (decoded, x, y) => decoded.pixels[(y * decoded.width + x) * 4 + 3];
const alphaArea = (decoded) => {
  let count = 0;
  for (let index = 3; index < decoded.pixels.length; index += 4) {
    if (decoded.pixels[index] > 16) count += 1;
  }
  return count;
};

test('Simple Arcade Kit contains the requested reusable asset families', () => {
  assert.equal(manifest.id, 'scicon-simple-arcade-kit-v1');
  assert.equal(manifest.galleryCategory, 'Simple Arcade Kit');
  assert.equal(manifest.assets.length, 196);
  const counts = manifest.assets.reduce((result, asset) => {
    result[asset.kind] = (result[asset.kind] || 0) + 1;
    return result;
  }, {});
  assert.deepEqual(counts, {
    'diamond-selector': 16,
    'trace-box': 32,
    projectile: 19,
    'spiral-triangle': 5,
    'menu-panel': 8,
    'button-frame': 8,
    'boss-health-bar': 6,
    'boss-health-fill-mask': 2,
    'wave-glyph': 45,
    'wave-glyph-atlas': 3,
    'wave-title': 3,
    'basic-menu-panel': 12,
    'basic-menu-button': 16,
    'basic-menu-slider-track': 4,
    'basic-menu-slider-knob': 2,
    'basic-menu-toggle': 4,
    'basic-menu-tab': 4,
    'basic-menu-divider': 6,
    overview: 1,
  });
  assert.match(manifest.runtimeProtocol.waveText, /live text or BitmapFont/);
  assert.match(manifest.runtimeProtocol.projectiles, /frame 1 through frame 4/);

  const smoothLabelTrace = manifest.assets.find((asset) => asset.id === 'trace-box-label-cyan');
  assert.equal(smoothLabelTrace.frames.length, 24);
  assert.equal(new Set(smoothLabelTrace.frameHashes).size, 24);
});

test('transparent-center overlays really leave their middles empty', () => {
  const transparentAssets = manifest.assets.filter((asset) => asset.transparentCenter);
  assert.ok(transparentAssets.length >= 70);
  for (const asset of transparentAssets) {
    for (const pngPath of asset.frames || [asset.path]) {
      const decoded = decodeRgbaPng(fromPublicPath(pngPath));
      assert.equal(
        alphaAt(decoded, Math.floor(decoded.width / 2), Math.floor(decoded.height / 2)),
        0,
        `${asset.id} center should be transparent`
      );
    }
  }
});

test('projectiles grow from their emitted frame and every animation has a valid sheet and GIF', () => {
  const animations = manifest.assets.filter((asset) => asset.frames);
  for (const asset of animations) {
    assert.equal(new Set(asset.frameHashes).size, asset.frames.length, `${asset.id} repeats a frame`);
    assert.ok(fs.existsSync(fromPublicPath(asset.sheet)), `${asset.id} sheet is missing`);
    const gif = fs.readFileSync(fromPublicPath(asset.previewGif));
    assert.equal(gif.subarray(0, 6).toString('ascii'), 'GIF89a');
  }

  for (const projectile of manifest.assets.filter((asset) => asset.kind === 'projectile')) {
    const areas = projectile.frames.map((frame) => alphaArea(decodeRgbaPng(fromPublicPath(frame))));
    assert.ok(areas[0] < areas[1] && areas[1] < areas[2] && areas[2] <= areas[3], `${projectile.id} does not grow cleanly`);
  }
});

test('wave glyph fallback includes WAVE, all digits, and slash in every color', () => {
  const atlases = manifest.assets.filter((asset) => asset.kind === 'wave-glyph-atlas');
  assert.equal(atlases.length, 3);
  const required = ['W', 'A', 'V', 'E', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '/'].sort();
  for (const atlas of atlases) {
    assert.deepEqual(Object.keys(atlas.glyphs).sort(), required);
  }
});
