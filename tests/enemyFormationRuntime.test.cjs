const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const validatorSource = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('configured squads enter, hold formation, dive, and return', () => {
  assert.match(runtimeSource, /type EnemyFormationState = 'entry' \| 'hold' \| 'dive' \| 'return'/);
  assert.match(runtimeSource, /getConfiguredFormationTarget\(/);
  assert.match(runtimeSource, /configureEnemyFormation\(enemy, event, spawned, count\)/);
  assert.match(runtimeSource, /updateConfiguredEnemyFormation\(e\)/);
  assert.match(runtimeSource, /enemy\.formationState = 'hold'/);
  assert.match(runtimeSource, /enemy\.formationState = 'dive'/);
  assert.match(runtimeSource, /enemy\.formationState = 'return'/);
  assert.match(runtimeSource, /enemy\.formationDiveFrame/);
});

test('runtime and Director share the new formation presets', () => {
  ['grid', 'diamond', 'spiral'].forEach((pattern) => {
    assert.match(catalogSource, new RegExp(`${pattern}: \\{ id: '${pattern}'`));
    assert.match(validatorSource, new RegExp(`'${pattern}'`));
  });
});

test('custom science-themed enemy motion packs stay compact, square, and RGBA', () => {
  const enemyPacks = [
    'paywall-interceptor',
    'citation-wraith',
    'peer-review-bulwark',
    'predatory-journal-raider'
  ];

  enemyPacks.forEach((packName) => {
    const framesPath = path.join(root, 'public', 'game-art', 'generated', 'scicon-flight-motion-pack-v1', 'enemies', packName, 'frames');
    const frameNames = fs.readdirSync(framesPath).filter((fileName) => fileName.endsWith('.png'));
    assert.equal(frameNames.length, 3);
    frameNames.forEach((frameName) => {
      const png = fs.readFileSync(path.join(framesPath, frameName));
      assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(png.readUInt32BE(16), 256);
      assert.equal(png.readUInt32BE(20), 256);
      assert.equal(png[25], 6, `${frameName} must retain an alpha channel`);
      assert.ok(png.length < 100_000, `${frameName} should remain lightweight for mobile`);
    });
  });
});

test('ordinary formations and asteroid belts use separate sprite catalogs', () => {
  assert.match(constantsSource, /ENEMY_BRICK_FRAMES:\s*\[\s*"\/game-art\/generated\/scicon-flight-motion-pack-v1\/enemies\/peer-review-bulwark\/frames\/peer-review-bulwark-01-guard-low\.png"/);
  assert.match(constantsSource, /ASTEROID_BELT_FRAMES:\s*\[\s*"\/game-art\/enemies\/asteroid-1\.png"/);
  assert.match(validatorSource, /ASTEROID_SPRITE_KEYS, \['ASTEROID_BELT_FRAMES'/);
  assert.match(runtimeSource, /e\.variant >= 900 \? ASSETS\.ASTEROID_BELT_FRAMES : ASSETS\.ENEMY_BRICK_FRAMES/);
});

test('Pixi presents formation assembly pulses and a charged pre-dive frame without changing simulation states', () => {
  assert.match(rendererSource, /getFormationMotionFrameIndex/);
  assert.match(rendererSource, /entity\.formationDiveFrame - engine\.frameCount/);
  assert.match(rendererSource, /framesUntilDive > 0 && framesUntilDive <= 36/);
  assert.match(rendererSource, /entity\.formationState === 'entry' \|\| entity\.formationState === 'return'/);
  assert.match(rendererSource, /entity\.formationState === 'dive'/);
});
