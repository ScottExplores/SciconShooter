const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const fs = require('node:fs');
const load = entry => {
  const result = esbuild.buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};
const { getPlayerEnergyBoltPresentation: sample } = load('services/playerWeaponVisuals.ts');
const { getPlayerPrimaryPulseLayout } = load('services/playerPrimaryBurst.ts');
const preview = load('services/playerWeaponPreview.ts');

test('RSC keeps its existing artwork and never enters the slim energy presentation', () => {
  for (const level of [0, 1, 3, 5, 7]) assert.equal(sample('research', level, 5, 10, { width: 28, height: 46 }), null);
  assert.equal(preview.getPlayerWeaponPreviewPresentation('researchhub', 49), null);
});

test('slim cores and restrained wakes stay inside the existing launch clearance at every tier', () => {
  for (const family of ['bio', 'eth', 'btc']) for (let level = 0; level <= 7; level++) {
    const layout = Object.freeze(getPlayerPrimaryPulseLayout(family === 'btc' ? 16 : 10,
      family === 'btc' ? 40 : 28, level));
    const born = sample(family, level, 0, 10, layout);
    const flight = sample(family, level, 20, 10, layout);
    assert.ok(born.spriteWidth < layout.width);
    assert.ok(born.spriteHeight <= layout.height);
    assert.ok(born.spriteWidth <= 22 && born.spriteHeight <= 34);
    assert.ok(born.coreWidth <= 1.8 && born.coreHeight <= 13);
    assert.equal(born.wakeLength, 0, 'a newborn round must not draw a wake back over the ship');
    assert.ok(flight.wakeLength <= 14 && flight.wakeWidth <= 1.8);
    assert.equal(born.spriteHeight, flight.spriteHeight, 'flight never grows a rocket-shaped head');
    assert.equal(born.spriteWidth, flight.spriteWidth);
  }
});

test('BIO, ETH and BTC use separate palettes but the same narrow readable energy vocabulary', () => {
  const samples = ['bio', 'eth', 'btc'].map(family => sample(family, 5, 6, 10, { width: 30, height: 46 }));
  assert.equal(new Set(samples.map(s => s.color)).size, 3);
  assert.equal(new Set(samples.map(s => s.coreColor)).size, 3);
  assert.ok(samples[2].coreWidth > samples[0].coreWidth, 'BTC reads heavier without fins or a missile body');
  assert.ok(samples[2].wakeLength < samples[0].wakeLength);
});

test('invalid preview values never leak NaN or infinite dimensions into the renderer', () => {
  for (const family of ['bio', 'eth', 'btc']) {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      for (const [age, speed] of [[0, invalid], [invalid, 0], [invalid, invalid]]) {
        const result = sample(family, invalid, age, speed, { width: invalid, height: invalid });
        for (const [key, value] of Object.entries(result)) {
          if (typeof value === 'number') assert.ok(Number.isFinite(value), `${family}.${key} must be finite`);
        }
        assert.equal(result.wakeLength, 0, 'unknown movement must not paint a wake across the ship');
        assert.ok(result.spriteWidth >= 14 && result.spriteWidth <= 22);
        assert.ok(result.spriteHeight >= 22 && result.spriteHeight <= 34);
      }
    }
  }
});

test('Hangar preview consumes the same visual-only layout at stock and max tiers', () => {
  for (const ship of ['bio', 'eth', 'btc']) for (const level of [0, 14, 49]) {
    const tier = Math.min(7, Math.floor(level / 7) + 1) - 1;
    const layout = getPlayerPrimaryPulseLayout(ship === 'btc' ? 16 : ship === 'bio' ? 9 : 10,
      ship === 'btc' ? 40 : 28, tier);
    assert.deepEqual(preview.getPlayerWeaponPreviewPresentation(ship, level), sample(ship, tier, 0, 10, layout));
  }
  const dialog = fs.readFileSync('components/ShipWeaponPreviewDialog.tsx', 'utf8');
  assert.match(dialog, /getPlayerWeaponPreviewPresentation\(shipId, fireRateLevel\)/);
  assert.match(dialog, /width: energyPresentation\.spriteWidth/);
  assert.match(dialog, /height: energyPresentation\.spriteHeight/);
  assert.match(dialog, /objectFit: 'fill'/);
  assert.match(dialog, /drop-shadow\(0 0 1\.5px/);
});
