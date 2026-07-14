const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const validatorSource = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');

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

test('custom science-themed enemy sprites stay compact, square, and RGBA', () => {
  const spriteNames = [
    'paywall-interceptor.png',
    'citation-wraith.png',
    'peer-review-bulwark.png',
    'predatory-journal-raider.png'
  ];

  spriteNames.forEach((spriteName) => {
    const spritePath = path.join(root, 'public', 'game-art', 'enemies', spriteName);
    const png = fs.readFileSync(spritePath);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 64);
    assert.equal(png.readUInt32BE(20), 64);
    assert.equal(png[25], 6, `${spriteName} must retain an alpha channel`);
    assert.ok(png.length < 100_000, `${spriteName} should remain lightweight for mobile`);
  });
});

test('ordinary formations and asteroid belts use separate sprite catalogs', () => {
  assert.match(constantsSource, /ENEMY_BRICK_FRAMES:\s*\[\s*"\/game-art\/enemies\/peer-review-bulwark\.png"/);
  assert.match(constantsSource, /ASTEROID_BELT_FRAMES:\s*\[\s*"\/game-art\/enemies\/asteroid-1\.png"/);
  assert.match(validatorSource, /ASTEROID_SPRITE_KEYS, \['ASTEROID_BELT_FRAMES'/);
  assert.match(runtimeSource, /e\.variant >= 900 \? ASSETS\.ASTEROID_BELT_FRAMES : ASSETS\.ENEMY_BRICK_FRAMES/);
});
