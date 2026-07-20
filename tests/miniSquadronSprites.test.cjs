const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const pack = path.join(root, 'public', 'game-art', 'generated', 'ships', 'scicon-mini-squadron-pack-v1');
const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'pack-manifest.json'), 'utf8'));
const fromPublicPath = (value) => path.join(root, 'public', ...value.split('/').filter(Boolean));

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const distances = [
    Math.abs(estimate - left),
    Math.abs(estimate - up),
    Math.abs(estimate - upperLeft),
  ];
  const index = distances.indexOf(Math.min(...distances));
  return [left, up, upperLeft][index];
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

const alphaMetrics = ({ width, height, pixels }) => {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      area += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return {
    area,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
};

test('mini-squadron pack declares ten three-frame idle sheets', () => {
  assert.equal(manifest.id, 'scicon-mini-squadron-pack-v1');
  assert.deepEqual(manifest.frameOrder, ['neutral', 'flex-in', 'flex-out']);
  assert.deepEqual(manifest.frame, { width: 256, height: 256 });
  assert.equal(manifest.ships.length, 10);
  assert.match(manifest.animation.protocol, /PNG frames/);
  assert.match(manifest.animation.invariant, /center and scale remain fixed/);

  const ids = manifest.ships.map((ship) => ship.id);
  assert.equal(new Set(ids).size, 10);
});

test('every mini ship has distinct centered frames, a 3-frame sheet, and a GIF preview', () => {
  for (const ship of manifest.ships) {
    assert.equal(ship.frames.length, 3, `${ship.id} frame count`);
    assert.equal(new Set(Object.values(ship.frameHashes)).size, 3, `${ship.id} frame hashes`);

    const centers = [];
    for (const [index, framePath] of ship.frames.entries()) {
      const decoded = decodeRgbaPng(fromPublicPath(framePath));
      assert.deepEqual([decoded.width, decoded.height], [256, 256]);
      const metrics = alphaMetrics(decoded);
      assert.ok(metrics.area > 900, `${ship.id} frame ${index + 1} is empty`);
      assert.ok(Math.abs(metrics.centerX - 128) <= 1, `${ship.id} frame ${index + 1} drifts horizontally`);
      assert.ok(Math.abs(metrics.centerY - 128) <= 1, `${ship.id} frame ${index + 1} drifts vertically`);
      const hash = crypto.createHash('sha256').update(decoded.pixels).digest('hex');
      assert.equal(hash, ship.frameHashes[manifest.frameOrder[index]]);
      centers.push([metrics.centerX, metrics.centerY]);
    }
    const xValues = centers.map(([x]) => x);
    const yValues = centers.map(([, y]) => y);
    assert.ok(Math.max(...xValues) - Math.min(...xValues) <= 1, `${ship.id} horizontal center wobbles`);
    assert.ok(Math.max(...yValues) - Math.min(...yValues) <= 1, `${ship.id} vertical center wobbles`);

    const sheet = decodeRgbaPng(fromPublicPath(ship.sheet));
    assert.deepEqual([sheet.width, sheet.height], [768, 256]);
    const gif = fs.readFileSync(fromPublicPath(ship.previewGif));
    assert.equal(gif.subarray(0, 6).toString('ascii'), 'GIF89a');
  }

  const master = decodeRgbaPng(fromPublicPath(manifest.masterSheet));
  assert.deepEqual([master.width, master.height], [768, 2560]);
});
