const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const packRoot = path.join(root, 'public', 'game-art', 'generated', 'scicon-advanced-enemy-pack-v1');
const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'pack-manifest.json'), 'utf8'));
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const typesSource = fs.readFileSync(path.join(root, 'game-config', 'types.ts'), 'utf8');
const directorValidatorSource = fs.readFileSync(
  path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'),
  'utf8'
);
const recordCardApiSource = fs.readFileSync(path.join(root, 'api', 'record-card.js'), 'utf8');

const EXPECTED_ENEMIES = [
  { id: 'quasar-lancer', name: 'Quasar Lancer', assetKey: 'SCICON_ENEMY_QUASAR_LANCER_FRAMES' },
  { id: 'null-bastion', name: 'Null Bastion', assetKey: 'SCICON_ENEMY_NULL_BASTION_FRAMES' },
  { id: 'vector-reaver', name: 'Vector Reaver', assetKey: 'SCICON_ENEMY_VECTOR_REAVER_FRAMES' },
  { id: 'rift-weaver', name: 'Rift Weaver', assetKey: 'SCICON_ENEMY_RIFT_WEAVER_FRAMES' },
  { id: 'pulse-herald', name: 'Pulse Herald', assetKey: 'SCICON_ENEMY_PULSE_HERALD_FRAMES' }
];
const FRAME_STATES = ['neutral', 'charge', 'fire'];
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileForPublicUrl = (url) => path.join(root, 'public', ...url.split('/').filter(Boolean));

const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
};

const decodeRgbaPng = (png, label) => {
  assert.deepEqual([...png.subarray(0, 8)], PNG_SIGNATURE, `${label} is a PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${label} uses 8-bit channels`);
  assert.equal(png[25], 6, `${label} uses RGBA color type`);
  assert.equal(png[28], 0, `${label} is not interlaced`);

  const idat = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const chunkType = png.toString('ascii', offset + 4, offset + 8);
    if (chunkType === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.ok(idat.length > 0, `${label} contains image data`);

  const filtered = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  assert.equal(filtered.length, (stride + 1) * height, `${label} has complete scanlines`);
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0, source = 0; y < height; y += 1) {
    const filter = filtered[source];
    source += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[source + x];
      const target = y * stride + x;
      const left = x >= 4 ? pixels[target - 4] : 0;
      const up = y > 0 ? pixels[target - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target - stride - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : (() => { throw new Error(`${label} uses unsupported PNG filter ${filter}`); })();
      pixels[target] = (raw + predictor) & 0xff;
    }
    source += stride;
  }
  return { width, height, pixels };
};

const countAlpha = ({ width, height, pixels }) => {
  let visible = 0;
  let transparent = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const alpha = pixels[pixel * 4 + 3];
    if (alpha === 0) transparent += 1;
    if (alpha > 0) visible += 1;
  }
  return { visible, transparent };
};

const extractRegisteredFrames = (assetKey) => {
  const block = constantsSource.match(new RegExp(`${assetKey}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? '';
  return [...block.matchAll(/"([^"]+\.png)"/g)].map((match) => match[1]);
};

test('advanced enemy manifest declares five fixed-registration three-state families', () => {
  assert.equal(manifest.id, 'scicon-advanced-enemy-pack-v1');
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.frame, { width: 256, height: 256, colorMode: 'RGBA' });
  assert.equal(manifest.frameCount, 3);
  assert.deepEqual(manifest.frameOrder, FRAME_STATES);
  assert.equal(manifest.fps, 8);
  assert.equal(manifest.fixedRegistration, true);
  assert.deepEqual(
    manifest.enemies.map(({ id, name, assetKey }) => ({ id, name, assetKey })),
    EXPECTED_ENEMIES
  );
  assert.equal(new Set(manifest.enemies.flatMap((enemy) => enemy.frames)).size, 15);
});

test('advanced enemy frames are hashed 256px RGBA images with real transparency', () => {
  for (const enemy of manifest.enemies) {
    assert.deepEqual(enemy.states, FRAME_STATES, `${enemy.id} state order`);
    assert.equal(enemy.frames.length, 3, `${enemy.id} frame count`);
    assert.deepEqual(Object.keys(enemy.frameFileHashes), FRAME_STATES, `${enemy.id} file hash states`);
    assert.deepEqual(Object.keys(enemy.framePixelHashes), FRAME_STATES, `${enemy.id} pixel hash states`);

    const framePixelBuffers = [];
    enemy.frames.forEach((url, frameIndex) => {
      const state = FRAME_STATES[frameIndex];
      const file = fileForPublicUrl(url);
      assert.equal(fs.existsSync(file), true, url);
      const png = fs.readFileSync(file);
      assert.equal(sha256(png), enemy.frameFileHashes[state], `${url} file hash`);
      assert.ok(png.length < 100_000, `${url} stays compact for mobile loading`);

      const decoded = decodeRgbaPng(png, url);
      assert.equal(decoded.width, 256, `${url} width`);
      assert.equal(decoded.height, 256, `${url} height`);
      assert.equal(sha256(decoded.pixels), enemy.framePixelHashes[state], `${url} pixel hash`);
      const alpha = countAlpha(decoded);
      assert.ok(alpha.visible > 1_000, `${url} has a readable enemy silhouette`);
      assert.ok(alpha.transparent > 256 * 256 * 0.35, `${url} preserves transparent formation space`);
      const alphaAt = (x, y) => decoded.pixels[(y * decoded.width + x) * 4 + 3];
      assert.deepEqual(
        [alphaAt(0, 0), alphaAt(255, 0), alphaAt(0, 255), alphaAt(255, 255)],
        [0, 0, 0, 0],
        `${url} keeps transparent corners`
      );
      framePixelBuffers.push(decoded.pixels);
    });
    assert.equal(new Set(framePixelBuffers.map(sha256)).size, 3, `${enemy.id} frames are visually distinct`);
  }
});

test('each reference sheet is a lossless 768 by 256 horizontal composition of its frames', () => {
  for (const enemy of manifest.enemies) {
    const sheetFile = fileForPublicUrl(enemy.sheet);
    assert.equal(fs.existsSync(sheetFile), true, enemy.sheet);
    const sheet = decodeRgbaPng(fs.readFileSync(sheetFile), enemy.sheet);
    assert.equal(sheet.width, 768, `${enemy.id} sheet width`);
    assert.equal(sheet.height, 256, `${enemy.id} sheet height`);

    enemy.frames.forEach((url, frameIndex) => {
      const frame = decodeRgbaPng(fs.readFileSync(fileForPublicUrl(url)), url);
      const sheetSlice = Buffer.alloc(256 * 256 * 4);
      for (let y = 0; y < 256; y += 1) {
        const sheetRowStart = (y * sheet.width + frameIndex * 256) * 4;
        const frameRowStart = y * 256 * 4;
        sheet.pixels.copy(sheetSlice, frameRowStart, sheetRowStart, sheetRowStart + 256 * 4);
      }
      assert.equal(Buffer.compare(sheetSlice, frame.pixels), 0, `${enemy.id} sheet cell ${frameIndex + 1}`);
    });
  }
});

test('all five families are registered for runtime, catalog selection, and record cards', () => {
  for (const enemy of manifest.enemies) {
    assert.deepEqual(extractRegisteredFrames(enemy.assetKey), enemy.frames, `${enemy.assetKey} runtime frames`);
    assert.match(
      catalogSource,
      new RegExp(
        `${enemy.assetKey}: asset\\('${enemy.assetKey}', '${escapeRegExp(enemy.name)}', ASSETS\\.${enemy.assetKey}, \\['enemy', 'scorecard'\\]\\)`
      ),
      `${enemy.assetKey} catalog registration`
    );
    assert.match(
      recordCardApiSource,
      new RegExp(`${enemy.assetKey}:\\s*'${escapeRegExp(enemy.frames[0])}'`),
      `${enemy.assetKey} neutral scorecard art`
    );
    assert.match(
      typesSource,
      new RegExp(`\\| '${enemy.assetKey}'`),
      `${enemy.assetKey} is a typed built-in asset`
    );
    assert.match(
      directorValidatorSource,
      new RegExp(`'${enemy.assetKey}'`),
      `${enemy.assetKey} is accepted by Director validation`
    );
  }
});
