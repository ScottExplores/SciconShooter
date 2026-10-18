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

test('Projectile Upgrade runs six tiers that strictly escalate and recolour every level', () => {
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

test('Projectile Upgrade is mission-scoped and amplifies primary fire only', () => {
  const engine = read('services', 'gameLogic.ts');

  // Resets at the Mission boundary and at run start: a run of good play, not a
  // permanent stat.
  assert.equal((engine.match(/this\.missionOverdriveLevel = 0;/g) || []).length, 2);
  // Level-based, not timed: it must never enter the timed-powerup map.
  assert.match(engine, /type !== PowerupType\.EXTRA_LIFE && type !== PowerupType\.OVERDRIVE/);
  // Signature moves scale through their own Hangar track; only the hull's
  // primary fire is amplified.
  assert.match(engine, /const hullPrimary = weaponKind === 'pulse' \|\| weaponKind === 'bio-primary' \|\| weaponKind === 'btc-bolt';\n\s*const overdrivePrimary = hullPrimary && this\.missionOverdriveLevel > 0/);
  // At cap the pickup pays score instead of vanishing.
  assert.match(engine, /MAX PROJECTILE UPGRADE \+250/);
});

test('fire patterns belong to the hull: ETH flies the triple spread', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const spreadLanes = this\.playerShipId === 'eth'/);
  assert.match(engine, /const hasSpread = this\.playerShipId === 'eth'/);
  // New content uses one semantic pickup. The old ids remain runtime aliases
  // only so an in-flight saved run from an older release can still resolve.
  assert.match(engine, /'projectile-upgrade': PowerupType\.OVERDRIVE/);
  assert.match(engine, /'double-shot': PowerupType\.OVERDRIVE/);
  assert.match(engine, /'triple-shot': PowerupType\.OVERDRIVE/);
  assert.match(engine, /Array\.from\(new Set\(/);
  assert.doesNotMatch(engine, /isPowerupActive\(PowerupType\.TRIPLE_SHOT\)/);
  assert.doesNotMatch(engine, /isPowerupActive\(PowerupType\.DOUBLE_SHOT\)/);

  // The balance module retains its established copy contract. Hangar opens the
  // shared preview dialog for truthful weapon wording, without a duplicate strip.
  const specs = overdrive.PLAYER_SHIP_WEAPON_SPECS;
  for (const ship of ['researchhub', 'bio', 'eth', 'btc']) {
    assert.ok(specs[ship], `${ship} has a weapon spec`);
  }
  assert.match(specs.eth, /triple/i);
  const hangar = read('components', 'SquadHangar.tsx');
  const preview = read('services', 'playerWeaponPreview.ts');
  const previewDialog = read('components', 'ShipWeaponPreviewDialog.tsx');
  assert.match(preview, /PLAYER_SHIP_WEAPON_PREVIEW_SPECS/);
  assert.match(hangar, /<ShipWeaponPreviewDialog[\s\S]*?shipId=\{weaponPreviewShipId\}/);
  assert.match(previewDialog, /PLAYER_SHIP_WEAPON_PREVIEW_SPECS\[shipId\]/);
  assert.doesNotMatch(hangar, /PLAYER_SHIP_WEAPON_PREVIEW_SPECS\[mainShipId\]/);
});

test('Projectile Upgrade scales each round without widening its authored lane radius', () => {
  const base = overdrive.getWeaponOverdriveProjectileGeometry(10, 28, 36, 0);
  const upgraded = overdrive.getWeaponOverdriveProjectileGeometry(10, 28, 36, 5);

  assert.deepEqual(base, { unitWidth: 10, unitHeight: 28, bundleWidth: 82 });
  assert.deepEqual(upgraded, { unitWidth: 16, unitHeight: 45, bundleWidth: 88 });
  assert.equal(
    upgraded.bundleWidth - upgraded.unitWidth,
    base.bundleWidth - base.unitWidth,
    'Max Shot/spread offsets stay fixed while only the projectile grows'
  );

  const engine = read('services', 'gameLogic.ts');
  assert.match(engine, /const bundleWidth = projectileGeometry\.bundleWidth/);
  assert.doesNotMatch(engine, /b\.width = Math\.round\(b\.width \* overdriveTier\.sizeScale\)/);
});

test('production content exposes one canonical Projectile Upgrade pickup', () => {
  const catalog = read('game-config', 'catalog.ts');
  const types = read('game-config', 'types.ts');
  const campaign = read('game-config', 'campaign.json');
  const directorValidation = read('director', 'server', 'gameCampaignValidation.mjs');

  assert.match(catalog, /'projectile-upgrade': \{ id: 'projectile-upgrade', label: 'Projectile Upgrade', runtimeType: 'OVERDRIVE'/);
  assert.match(types, /export type PowerupId = 'projectile-upgrade'/);
  assert.match(directorValidation, /POWERUP_IDS = new Set\(\['projectile-upgrade'/);
  assert.match(campaign, /"projectile-upgrade"/);
  assert.doesNotMatch(campaign, /"(?:double|triple)-shot"/);
});

test('mission clear sweeps fallen coins to the player instead of losing them', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const missionClearSweep = this\.stageRewardCollectionFrames > 0 \|\| this\.waveDepartureFrames > 0/);
  // The window holds the door when coins are still on the field.
  // REVAMP(G): The extracted policy also restores the five-second major-boss window.
  assert.match(engine, /const collectionSeconds = getMissionRewardCollectionSeconds\(/);
  const { loadService } = require('./helpers/loadService.cjs');
  const { getMissionRewardCollectionSeconds } = loadService(path.join(root, 'services/gameplay/missionRewardWindow.ts'));
  assert.equal(getMissionRewardCollectionSeconds({ authoredSeconds: 0, liveCoins: true, majorBossFinale: false }), 2.5);
  assert.equal(getMissionRewardCollectionSeconds({ authoredSeconds: 4, liveCoins: true, majorBossFinale: false }), 4);
});

test('extra lives drop half as often as before', () => {
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /const EXTRA_LIFE_DROP_CHANCE = 0\.002;/);
  assert.match(engine, /const ELITE_EXTRA_LIFE_DROP_CHANCE = 0\.007;/);
  assert.match(engine, /\[PowerupType\.EXTRA_LIFE, 0\.01\]/);
});
