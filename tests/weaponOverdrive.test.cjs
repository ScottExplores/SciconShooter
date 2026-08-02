const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

const load = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'weaponOverdrive.ts')],
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

const overdrive = load();

test('Overdrive runs six tiers that strictly escalate and recolour every level', () => {
  const tiers = overdrive.WEAPON_OVERDRIVE_TIERS;
  assert.equal(tiers.length, overdrive.WEAPON_OVERDRIVE_MAX_LEVEL + 1);
  assert.equal(tiers[0].damageScale, 1);
  assert.equal(tiers[0].sizeScale, 1);
  assert.equal(tiers[0].color, null, 'level 0 keeps the hull colour');

  const colors = new Set();
  for (let level = 1; level <= overdrive.WEAPON_OVERDRIVE_MAX_LEVEL; level += 1) {
    const tier = tiers[level];
    assert.ok(tier.damageScale > tiers[level - 1].damageScale, `level ${level} hits harder`);
    assert.ok(tier.sizeScale > tiers[level - 1].sizeScale, `level ${level} is bigger`);
    assert.ok(tier.color, `level ${level} has a colour`);
    colors.add(tier.color);
  }
  assert.equal(colors.size, overdrive.WEAPON_OVERDRIVE_MAX_LEVEL, 'every level has its own colour');

  // Clamped at both ends so a bad level can never index out of the ladder.
  assert.equal(overdrive.getWeaponOverdriveTier(-3).level, 0);
  assert.equal(overdrive.getWeaponOverdriveTier(99).level, overdrive.WEAPON_OVERDRIVE_MAX_LEVEL);
});

test('Overdrive is mission-scoped and amplifies primary fire only', () => {
  const engine = read('services', 'gameLogic.ts');

  // Resets at the Mission boundary and at run start: a run of good play, not a
  // permanent stat.
  assert.equal((engine.match(/this\.missionOverdriveLevel = 0;/g) || []).length, 2);
  // Level-based, not timed: it must never enter the timed-powerup map.
  assert.match(engine, /type !== PowerupType\.EXTRA_LIFE && type !== PowerupType\.OVERDRIVE/);
  // Signature moves scale through their own Hangar track; only the hull's
  // primary fire is amplified.
  assert.match(engine, /\(weaponKind === 'pulse' \|\| weaponKind === 'bio-primary'\)\n\s*&& this\.missionOverdriveLevel > 0/);
  // At cap the pickup pays score instead of vanishing.
  assert.match(engine, /MAX OVERDRIVE \+250/);
});

test('fire patterns belong to the hull: ETH flies the triple spread', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const spreadLanes = this\.playerShipId === 'eth'/);
  assert.match(engine, /const hasSpread = this\.playerShipId === 'eth'/);
  // The legacy pattern pickups must not drop; both authored ids grant Overdrive.
  assert.match(engine, /'double-shot': PowerupType\.OVERDRIVE/);
  assert.match(engine, /'triple-shot': PowerupType\.OVERDRIVE/);
  assert.doesNotMatch(engine, /isPowerupActive\(PowerupType\.TRIPLE_SHOT\)/);
  assert.doesNotMatch(engine, /isPowerupActive\(PowerupType\.DOUBLE_SHOT\)/);

  // The Hangar names each hull's weapon identity beside the tier strip.
  const specs = overdrive.PLAYER_SHIP_WEAPON_SPECS;
  for (const ship of ['researchhub', 'bio', 'eth', 'btc']) {
    assert.ok(specs[ship], `${ship} has a weapon spec`);
  }
  assert.match(specs.eth, /triple/i);
  const hangar = read('components', 'SquadHangar.tsx');
  assert.match(hangar, /PLAYER_SHIP_WEAPON_SPECS\[mainShipId\]/);
});

test('mission clear sweeps fallen coins to the player instead of losing them', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const missionClearSweep = this\.stageRewardCollectionFrames > 0 \|\| this\.waveDepartureFrames > 0/);
  // The window holds the door when coins are still on the field.
  assert.match(engine, /liveCoins \? Math\.max\(authoredSeconds, 2\.5\) : authoredSeconds/);
});

test('extra lives drop half as often as before', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const EXTRA_LIFE_DROP_CHANCE = 0\.002;/);
  assert.match(engine, /const ELITE_EXTRA_LIFE_DROP_CHANCE = 0\.007;/);
  assert.match(engine, /\[PowerupType\.EXTRA_LIFE, 0\.01\]/);
});
