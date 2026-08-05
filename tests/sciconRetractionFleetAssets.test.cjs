const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const packRoot = path.join(root, 'public', 'game-art', 'generated', 'scicon-retraction-fleet-v2');
const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, 'pack-manifest.json'), 'utf8'));
const sources = Object.fromEntries([
  ['constants', 'constants.ts'],
  ['catalog', path.join('game-config', 'catalog.ts')],
  ['types', path.join('game-config', 'types.ts')],
  ['director', path.join('director', 'server', 'gameCampaignValidation.mjs')],
  ['recordCard', path.join('api', 'record-card.js')]
].map(([key, file]) => [key, fs.readFileSync(path.join(root, file), 'utf8')]));

const EXPECTED = [
  ['redline-skirmisher', 'Redline Skirmisher', 'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES'],
  ['crosscut-raider', 'Crosscut Raider', 'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES'],
  ['audit-bulwark', 'Audit Bulwark', 'SCICON_ENEMY_AUDIT_BULWARK_FRAMES'],
  ['quasar-lancer-v2', 'Quasar Lancer', 'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES'],
  ['vector-reaver-v2', 'Vector Reaver', 'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES']
];
const STATES = ['neutral', 'charge', 'fire'];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const publicFile = (url) => path.join(root, 'public', ...url.split('/').filter(Boolean));
const paeth = (left, up, upperLeft) => {
  const estimate = left + up - upperLeft;
  const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
  return distances[0] <= distances[1] && distances[0] <= distances[2]
    ? left
    : distances[1] <= distances[2] ? up : upperLeft;
};

const decodeRgba = (png, label) => {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${label} is PNG`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(png[24], 8, `${label} uses 8-bit channels`);
  assert.equal(png[25], 6, `${label} uses RGBA`);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0, source = 0; y < height; y += 1) {
    const filter = raw[source++];
    for (let x = 0; x < stride; x += 1) {
      const target = y * stride + x;
      const left = x >= 4 ? pixels[target - 4] : 0;
      const up = y > 0 ? pixels[target - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[target - stride - 4] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upperLeft)
                : (() => { throw new Error(`${label} uses PNG filter ${filter}`); })();
      pixels[target] = (raw[source + x] + predictor) & 0xff;
    }
    source += stride;
  }
  return { width, height, pixels };
};

const alphaBounds = ({ width, height, pixels }) => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let visible = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      visible += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { visible, width: maxX - minX + 1, height: maxY - minY + 1 };
};

test('Retraction Fleet manifest owns five compact move-readable families', () => {
  assert.equal(manifest.id, 'scicon-retraction-fleet-v2');
  assert.equal(manifest.version, 2);
  assert.equal(manifest.fixedRegistration, true);
  assert.deepEqual(manifest.frame, { width: 64, height: 64, colorMode: 'RGBA' });
  assert.deepEqual(manifest.frameOrder, STATES);
  assert.match(manifest.factionStory, /skirmishers.*raiders.*armored.*laser/i);
  assert.deepEqual(
    manifest.enemies.map(({ id, name, assetKey }) => [id, name, assetKey]),
    EXPECTED
  );
});

test('Retraction Fleet frames are transparent, low-resolution, distinct, and never needle-shaped', () => {
  for (const enemy of manifest.enemies) {
    assert.deepEqual(enemy.states, STATES, `${enemy.id} state order`);
    assert.equal(enemy.frames.length, 3, `${enemy.id} frame count`);
    const frameHashes = [];
    for (const [index, url] of enemy.frames.entries()) {
      const file = publicFile(url);
      const png = fs.readFileSync(file);
      const state = STATES[index];
      assert.equal(sha256(png), enemy.frameFileHashes[state], `${url} deterministic hash`);
      assert.ok(png.length < 8_000, `${url} stays inexpensive to preload`);
      const decoded = decodeRgba(png, url);
      assert.deepEqual([decoded.width, decoded.height], [64, 64], `${url} pixel scale`);
      const bounds = alphaBounds(decoded);
      assert.ok(bounds.visible >= 500, `${url} has a readable silhouette`);
      assert.ok(bounds.width >= 30, `${url} cannot collapse into a thin needle`);
      assert.ok(bounds.height <= bounds.width * 1.35, `${url} remains compact rather than spear-shaped`);
      const alphaAt = (x, y) => decoded.pixels[(y * decoded.width + x) * 4 + 3];
      assert.deepEqual(
        [alphaAt(0, 0), alphaAt(63, 0), alphaAt(0, 63), alphaAt(63, 63)],
        [0, 0, 0, 0],
        `${url} has transparent corners`
      );
      frameHashes.push(sha256(decoded.pixels));
    }
    assert.equal(new Set(frameHashes).size, 3, `${enemy.id} has three real animation poses`);
    const sheet = decodeRgba(fs.readFileSync(publicFile(enemy.sheet)), enemy.sheet);
    assert.deepEqual([sheet.width, sheet.height], [192, 64], `${enemy.id} sheet size`);
    assert.equal(sha256(fs.readFileSync(publicFile(enemy.sheet))), enemy.sheetFileHash, `${enemy.id} sheet hash`);
  }
});

test('all Retraction Fleet keys are wired through every safe runtime boundary', () => {
  for (const enemy of manifest.enemies) {
    assert.match(sources.constants, new RegExp(`${enemy.assetKey}:\\s*\\[`), `${enemy.assetKey} constants`);
    assert.match(sources.catalog, new RegExp(`${enemy.assetKey}: asset\\('${enemy.assetKey}'`), `${enemy.assetKey} catalog`);
    assert.match(sources.types, new RegExp(`\\| '${enemy.assetKey}'`), `${enemy.assetKey} type`);
    assert.match(sources.director, new RegExp(`'${enemy.assetKey}'`), `${enemy.assetKey} Director allowlist`);
    assert.match(sources.recordCard, new RegExp(`${enemy.assetKey}:\\s*'${enemy.frames[0]}'`), `${enemy.assetKey} card art`);
  }
});

test('Retraction Fleet record-card art always resolves each family neutral frame', () => {
  for (const enemy of manifest.enemies) {
    assert.match(
      sources.recordCard,
      new RegExp(`${enemy.assetKey}:\\s*'${enemy.frames[0]}'`),
      `${enemy.assetKey} card art uses neutral frame`
    );
    assert.doesNotMatch(
      sources.recordCard,
      new RegExp(`${enemy.assetKey}:\\s*'${enemy.frames[1]}'|${enemy.assetKey}:\\s*'${enemy.frames[2]}'`),
      `${enemy.assetKey} card art never uses an action frame`
    );
  }
});
