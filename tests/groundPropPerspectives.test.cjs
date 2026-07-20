const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const pack = path.join(
  root,
  'public',
  'game-art',
  'generated',
  'backgrounds',
  'scicon-ground-prop-perspective-v1'
);
const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'pack-manifest.json'), 'utf8'));

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
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

const cropCell = (decoded, column, row = 0) => {
  const pixels = Buffer.alloc(256 * 256 * 4);
  for (let y = 0; y < 256; y += 1) {
    const sourceStart = (((row * 256 + y) * decoded.width) + column * 256) * 4;
    const destinationStart = y * 256 * 4;
    decoded.pixels.copy(pixels, destinationStart, sourceStart, sourceStart + 256 * 4);
  }
  return pixels;
};

const alphaMetrics = (pixels) => {
  let area = 0;
  let bottom = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 0) continue;
    area += 1;
    bottom = Math.max(bottom, Math.floor((index / 4) / 256) + 1);
  }
  return { area, bottom };
};

const fromPublicPath = (publicPath) => path.join(root, 'public', ...publicPath.split('/').filter(Boolean));

test('ground perspective pack declares spatial states rather than timed animation', () => {
  assert.deepEqual(manifest.stateOrder, ['ahead', 'overhead', 'behind']);
  assert.equal(manifest.productionFormat, 'Spatial three-view PNG sheets; not timed animation');
  assert.match(manifest.runtimeProtocol, /Select by prop center Y relative to player center Y/);
  assert.equal(manifest.terrains.length, 2);
  assert.deepEqual(manifest.terrains.map((terrain) => terrain.id), ['desert', 'river']);
});

test('all 18 prop sheets have three distinct RGBA views on one stable ground line', () => {
  let count = 0;
  for (const terrain of manifest.terrains) {
    assert.equal(terrain.props.length, 9);
    const master = decodeRgbaPng(fromPublicPath(terrain.masterSheet));
    assert.deepEqual([master.width, master.height], [768, 2304]);

    for (const prop of terrain.props) {
      const decoded = decodeRgbaPng(fromPublicPath(prop.sheet));
      assert.deepEqual([decoded.width, decoded.height], [768, 256]);
      const hashes = [];
      for (let column = 0; column < 3; column += 1) {
        const pixels = cropCell(decoded, column);
        const metrics = alphaMetrics(pixels);
        assert.ok(metrics.area > 900, `${terrain.id}/${prop.id}/${manifest.stateOrder[column]} is empty`);
        assert.equal(metrics.bottom, 238, `${terrain.id}/${prop.id} changes its ground-contact anchor`);
        const hash = crypto.createHash('sha256').update(pixels).digest('hex');
        hashes.push(hash);
        assert.equal(hash, prop.frameHashes[manifest.stateOrder[column]]);
        assert.deepEqual(
          cropCell(master, column, prop.row),
          pixels,
          `${terrain.id}/${prop.id} master cell differs from its gallery sheet`
        );
      }
      assert.equal(new Set(hashes).size, 3, `${terrain.id}/${prop.id} must have three distinct views`);
      count += 1;
    }
  }
  assert.equal(count, 18);
});
