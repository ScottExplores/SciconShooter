import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export * from './services/revamp/backgrounds/pixelArt'; export * from './services/revamp/backgrounds/themes';`,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const { BACKGROUND_THEMES, bakeNebula, bakeSignature, bakePlanet, bakeDebris, bakeCapitalShip } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const digest = pixels => createHash('sha256').update(pixels).digest('hex');
const luminance = (pixels, i) => pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
const colorAt = (pixels, i) => pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
const mask = surface => Uint8Array.from({ length: surface.width * surface.height }, (_, i) => surface.pixels[i * 4 + 3]);
const kinds = ['ringed', 'cratered', 'gas', 'shattered'];

// Bytes and coverage catch lost geometry, nondeterminism, accidental gradients,
// and unsafe exposure. The real in-game screenshot gallery remains the visual
// acceptance check; no test blesses a particular screenshot or art hash.
test('all baked artwork is byte-stable and independent of gameplay randomness', () => {
  const originalRandom = Math.random;
  Math.random = () => { throw Error('Artwork must not consume gameplay randomness'); };
  try {
    for (const theme of BACKGROUND_THEMES) {
      const before = structuredClone(theme);
      const bakers = [
        seed => bakeNebula(theme, seed),
        seed => bakeSignature(theme, theme.signature, seed),
        seed => bakeSignature(theme, theme.secondarySignature, seed),
        seed => bakeDebris(theme, seed),
        seed => bakeCapitalShip(theme, seed),
        ...kinds.map(kind => seed => bakePlanet(theme, kind, seed)),
      ];
      for (const seed of [0, 12345, 0xffffffff]) for (const bake of bakers) {
        const first = bake(seed), second = bake(seed);
        assert.deepEqual(first.pixels, second.pixels, `${theme.id}: deterministic seed ${seed}`);
        assert.notEqual(first.pixels.buffer, second.pixels.buffer, 'bakes own their bytes, so grading cannot mutate another source');
      }
      assert.deepEqual(theme, before, 'baking never modifies a shared palette');
    }
  } finally { Math.random = originalRandom; }
});

test('mission seeds change actual nebula bytes and seeded mechanical panel detail', () => {
  for (const theme of BACKGROUND_THEMES) {
    for (const bake of [seed => bakeNebula(theme, seed), seed => bakeCapitalShip(theme, seed)]) {
      const hashes = [0, 1, 2, 12345].map(seed => digest(bake(seed).pixels));
      assert.equal(new Set(hashes).size, hashes.length, `${theme.id}: seed variations must change pixels`);
    }
  }
});

test('nebulae retain a bounded dark palette, opaque seamless edges and a quieter attack lane', () => {
  for (const theme of BACKGROUND_THEMES) for (const seed of [1, 12345, 0xffffffff]) {
    const surface = bakeNebula(theme, seed), colors = new Set();
    let center = 0, centerCount = 0, shoulder = 0, shoulderCount = 0;
    for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
      const i = (y * surface.width + x) * 4;
      colors.add(colorAt(surface.pixels, i));
      assert.equal(surface.pixels[i + 3], 255, `${theme.id}: full-plane pixels remain opaque`);
      const light = luminance(surface.pixels, i);
      assert.ok(light <= 60, `${theme.id}: background luminance ${light} competes with action`);
      assert.ok(Math.max(surface.pixels[i], surface.pixels[i + 1], surface.pixels[i + 2]) < 85);
      if (y === 0 || y === surface.height - 1) assert.equal(colorAt(surface.pixels, i), theme.palette.ink, 'scrolling joins have identical ink rows');
      if (x >= 45 && x < 83) { center += light; centerCount++; }
      if (x < 26 || x >= 102) { shoulder += light; shoulderCount++; }
    }
    assert.ok(colors.size >= 3 && colors.size <= 9, `${theme.id}: discrete pixel ramp, not a smooth gradient`);
    assert.ok(center / centerCount < shoulder / shoulderCount, `${theme.id}: edge cloud detail leaves the central lane quieter`);
  }
});

test('ten sector signatures have distinct geometry, useful coverage and palette-locked opaque pixels', () => {
  const artworkHashes = new Set(), silhouetteHashes = new Set();
  for (const theme of BACKGROUND_THEMES) {
    const surface = bakeSignature(theme, theme.signature, 12345), allowed = new Set(Object.values(theme.palette));
    let occupied = 0;
    const colors = new Set();
    for (let i = 0; i < surface.pixels.length; i += 4) {
      assert.ok(surface.pixels[i + 3] === 0 || surface.pixels[i + 3] === 255, 'pixel edges never add antialiasing');
      if (!surface.pixels[i + 3]) continue;
      occupied++;
      const color = colorAt(surface.pixels, i);
      assert.ok(allowed.has(color), `${theme.id}: signature color leaves the locked palette`);
      colors.add(color);
    }
    const fraction = occupied / (surface.width * surface.height);
    assert.ok(fraction > 0.08 && fraction < 0.75, `${theme.id}: recognizable silhouette must retain negative space (${fraction})`);
    assert.ok(colors.size >= 3 && colors.size <= 8, `${theme.id}: shadow, hull and highlight planes remain present`);
    artworkHashes.add(digest(surface.pixels));
    silhouetteHashes.add(digest(mask(surface)));
  }
  assert.equal(artworkHashes.size, 10);
  assert.equal(silhouetteHashes.size, 10, 'sectors differ in their silhouettes, beyond a palette swap');
});

test('rare planets retain distinguishable rings, craters, banding and shattered negative space', () => {
  for (const theme of BACKGROUND_THEMES) {
    const planets = kinds.map(kind => bakePlanet(theme, kind, 12345));
    assert.equal(new Set(planets.map(planet => digest(planet.pixels))).size, 4, theme.id);
    const [ringed, cratered, gas, shattered] = planets;
    const outsideDisc = surface => {
      let count = 0;
      for (let y = 0; y < surface.height; y++) for (let x = 0; x < surface.width; x++) {
        if ((x - 80) ** 2 + (y - 78) ** 2 > 54 ** 2 && surface.pixels[(y * surface.width + x) * 4 + 3]) count++;
      }
      return count;
    };
    assert.ok(outsideDisc(ringed) > 200, 'ringed worlds have geometry beyond the globe');
    assert.equal(outsideDisc(gas), 0, 'gas giant silhouette stays circular');
    const center = (78 * shattered.width + 80) * 4 + 3;
    assert.equal(shattered.pixels[center], 0, 'shattered worlds have a true transparent fracture');
    assert.equal(cratered.pixels[center], 255, 'craters keep the planet solid');
  }
});

test('texture sources fit the runtime atlas and have a fixed bounded byte footprint', () => {
  for (const theme of BACKGROUND_THEMES) {
    const sources = [
      bakeNebula(theme, 12345), bakeSignature(theme, theme.signature, 12345),
      bakeSignature(theme, theme.secondarySignature, 45678), bakeDebris(theme, 12345),
      bakeCapitalShip(theme, 12345), ...kinds.map(kind => bakePlanet(theme, kind, 12345)),
    ];
    for (const surface of sources) {
      assert.ok(Number.isInteger(surface.width) && Number.isInteger(surface.height));
      assert.ok(surface.width > 0 && surface.width <= 256 && surface.height > 0 && surface.height <= 256, 'runtime atlas accepts dimensions up to 256');
      assert.equal(surface.pixels.byteLength, surface.width * surface.height * 4);
      assert.ok(surface.pixels.byteLength <= 192 * 192 * 4, 'one source stays within 144 KiB');
    }
    assert.ok(sources.reduce((sum, surface) => sum + surface.pixels.byteLength, 0) < 1024 * 1024, 'complete sector art library stays below 1 MiB before the shared atlas');
  }
});
