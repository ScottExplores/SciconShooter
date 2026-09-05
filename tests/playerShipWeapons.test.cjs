const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');

const loadModule = (relativePath) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, relativePath)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const weapons = loadModule('services/playerShipWeapons.ts');
const { PLAYER_SHIP_WEAPON_PROFILES, getPlayerShipWeaponProfile } = weapons;

// Scott's brief: the paid hulls beat the free RSC ship in their own ways,
// with BTC the strongest. Relative single-target output per Fire Rate volley:
//   RSC 1.00  |  BIO 2 x 0.58 = 1.16  |  ETH centre 0.62 (1.86 full spread)
//   BTC 2.10 / 1.15 cadence = 1.83, plus a pierce
const singleTargetOutput = (profile, lanesLanding) => (
  (profile.laneDamageScale * lanesLanding) / profile.cadenceScale
);

test('every hull has a primary profile and the free hull is the 1.0 baseline', () => {
  assert.deepEqual(Object.keys(PLAYER_SHIP_WEAPON_PROFILES), ['researchhub', 'bio', 'eth', 'btc']);
  assert.deepEqual(PLAYER_SHIP_WEAPON_PROFILES.researchhub, {
    primaryKind: 'pulse', cadenceScale: 1, laneDamageScale: 1, pierce: 0, pierceFromTier: 99
  });
  assert.equal(getPlayerShipWeaponProfile('unknown-hull'), PLAYER_SHIP_WEAPON_PROFILES.researchhub);
});

test('BTC is the strongest single-target gun and the only hull that pierces from tier 1', () => {
  const btc = PLAYER_SHIP_WEAPON_PROFILES.btc;
  const eth = PLAYER_SHIP_WEAPON_PROFILES.eth;
  const rsc = PLAYER_SHIP_WEAPON_PROFILES.researchhub;
  assert.equal(btc.primaryKind, 'btc-bolt');
  assert.equal(btc.pierce, 1);
  assert.equal(btc.pierceFromTier, 1);
  assert.ok(btc.cadenceScale > 1, 'the heavy bolt fires slower than the light hulls');
  const btcSingle = singleTargetOutput(btc, 1);
  assert.ok(btcSingle > 1.7 && btcSingle < 1.95, `BTC single-target ${btcSingle.toFixed(2)}x RSC`);
  assert.ok(btcSingle > singleTargetOutput(eth, 2), 'BTC beats ETH with two lanes landing');
  assert.ok(btcSingle > singleTargetOutput(rsc, 1) * 1.5, 'BTC clearly beats the free hull');
});

test('ETH keeps the triple spread and wins on coverage, not raw single-lane damage', () => {
  const eth = PLAYER_SHIP_WEAPON_PROFILES.eth;
  assert.equal(eth.primaryKind, 'pulse');
  assert.equal(eth.pierce, 0);
  const fullSpread = singleTargetOutput(eth, 3);
  assert.ok(fullSpread > 1.7 && fullSpread <= singleTargetOutput(PLAYER_SHIP_WEAPON_PROFILES.btc, 1) + 0.1,
    `ETH full spread ${fullSpread.toFixed(2)}x roughly ties BTC only when every lane lands`);
  assert.ok(singleTargetOutput(eth, 1) < 1, 'a lone ETH centre lane is weaker than the RSC pulse');
  assert.match(read('services', 'gameLogic.ts'), /const spreadLanes = this\.playerShipId === 'eth'/);
});

test('BIO stays on its twin rails and earns its pierce at Fire Rate tier 4', () => {
  const bio = PLAYER_SHIP_WEAPON_PROFILES.bio;
  assert.equal(bio.primaryKind, 'bio-primary');
  assert.equal(bio.pierce, 1);
  assert.equal(bio.pierceFromTier, 4);
  assert.equal(bio.cadenceScale, 1);
  assert.match(read('services', 'bioPrimaryWeapon.ts'), /BIO_PRIMARY_DAMAGE_PER_ROUND = 0\.58/);
});

test('the engine routes BTC through its bolt, scales lane damage by hull, and slows BTC cadence', () => {
  const engine = read('services', 'gameLogic.ts');
  assert.match(engine, /'btc-bolt'/);
  assert.match(engine, /const isBtcBolt = weaponKind === 'btc-bolt'/);
  assert.match(engine, /getFireRateProjectileDamageMultiplier\(volleySize\)\n\s*\* hullProfile\.laneDamageScale/);
  assert.match(engine, /this\.playerFireCooldownFrames \+= fireInterval\n\s*\* getPlayerShipWeaponProfile\(this\.playerShipId\)\.cadenceScale/);
  assert.match(engine, /const hullPierce = \(isBtcBolt \|\| isBioPrimary\)/);
  assert.match(read('services', 'playerWeaponVisuals.ts'), /if \(weaponKind === 'btc-bolt'\) return 'btc'/);
});

test('Hangar copy describes each hull gun truthfully', () => {
  const specs = loadModule('services/weaponOverdrive.ts').PLAYER_SHIP_WEAPON_SPECS;
  const preview = loadModule('services/playerWeaponPreview.ts').PLAYER_SHIP_WEAPON_PREVIEW_SPECS;
  for (const table of [specs, preview]) {
    assert.match(table.bio, /twin lanes/i);
    assert.match(table.eth, /triple lanes/i);
    assert.match(table.btc, /2\.1x damage/);
    assert.match(table.btc, /punches through/i);
    assert.doesNotMatch(table.btc, /Pulse column/);
  }
});
