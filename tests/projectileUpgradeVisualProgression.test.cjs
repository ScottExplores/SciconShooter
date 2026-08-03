const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const loadVisuals = () => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'services', 'playerWeaponVisuals.ts')],
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

const visuals = loadVisuals();

test('all checked-in weapon levels are preloaded and selectable by hull', () => {
  assert.equal(visuals.PLAYER_WEAPON_FRAME_URLS.length, 128);
  assert.equal(new Set(visuals.PLAYER_WEAPON_FRAME_URLS).size, 128);

  for (const family of ['research', 'bio', 'eth', 'btc']) {
    for (let level = 0; level <= 5; level += 1) {
      const frames = visuals.getPlayerWeaponFrames('pulse', level, family);
      assert.equal(frames.length, 4);
      assert.ok(frames.every((url) => url.includes(`/${family}/level-${level}/`)));
    }
  }

  assert.equal(visuals.getPlayerShipWeaponVisualFamily('researchhub'), 'research');
  assert.equal(visuals.getPlayerShipWeaponVisualFamily('bio'), 'bio');
  assert.equal(visuals.getPlayerShipWeaponVisualFamily('eth'), 'eth');
  assert.equal(visuals.getPlayerShipWeaponVisualFamily('btc'), 'btc');
});

test('five Projectile Upgrade presentation tiers grow louder without allocating effects', () => {
  const tiers = visuals.PLAYER_PROJECTILE_UPGRADE_PRESENTATION;
  assert.equal(tiers.length, 6);
  assert.equal(tiers[0].level, 0);
  assert.equal(tiers[0].trailLength, 0);

  for (let level = 1; level <= 5; level += 1) {
    assert.equal(tiers[level].level, level);
    assert.ok(tiers[level].spriteScale > tiers[level - 1].spriteScale);
    assert.ok(tiers[level].pulseAmount > tiers[level - 1].pulseAmount);
    assert.ok(tiers[level].trailLength > tiers[level - 1].trailLength);
    assert.ok(tiers[level].trailWidth > tiers[level - 1].trailWidth);
    assert.ok(tiers[level].trailAlpha > tiers[level - 1].trailAlpha);
    assert.ok(tiers[level].sparkCount >= tiers[level - 1].sparkCount);
  }

  assert.equal(visuals.getPlayerProjectileUpgradePresentation(-1).level, 0);
  assert.equal(visuals.getPlayerProjectileUpgradePresentation(99).level, 5);
});

test('upgraded rounds animate in flight while base rounds hold their launch frame', () => {
  const sample = (level) => Array.from(
    { length: 24 },
    (_, age) => visuals.getPlayerWeaponFlightFrameIndex(age, 4, level)
  );
  const base = sample(0);
  assert.deepEqual(base.slice(6), Array(18).fill(3));

  const levelTwoFlight = new Set(sample(2).slice(6));
  assert.deepEqual([...levelTwoFlight].sort(), [2, 3]);

  const levelFiveFlight = new Set(sample(5).slice(6));
  assert.deepEqual([...levelFiveFlight].sort(), [1, 2, 3]);
  assert.ok(sample(5).every((frame) => frame >= 0 && frame < 4));
});

test('runtime stores the upgrade level on primary shots and renderer caps mobile sparks', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const pixi = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

  assert.match(engine, /b\.weaponVisualLevel = overdrivePrimary \? this\.missionOverdriveLevel : 0/);
  assert.match(engine, /b\.weaponVisualFamily = overdrivePrimary[\s\S]*?getPlayerShipWeaponVisualFamily\(this\.playerShipId\)/);
  assert.match(pixi, /getPlayerWeaponFlightFrameIndex\([\s\S]*?entity\.weaponVisualLevel/);
  assert.match(pixi, /const reducedTrail = this\.reducedMotion[\s\S]*?engine\.performanceMode[\s\S]*?!engine\.polishSettings\.highDensityParticles/);
  assert.match(pixi, /const launchFrame = this\.reducedMotion[\s\S]*?getPlayerWeaponLaunchFrameIndex/);
  assert.match(pixi, /const pulse = this\.reducedMotion[\s\S]*?\? 1/);
  assert.match(pixi, /const sparkCount = this\.reducedMotion[\s\S]*?\? 0/);
  assert.match(pixi, /Math\.min\(1, presentation\.sparkCount\)/);
  assert.doesNotMatch(engine, /b\.(?:width|height)\s*\*=\s*presentation\.spriteScale/);
});
