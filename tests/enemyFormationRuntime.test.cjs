const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const runtimeSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const formationSource = fs.readFileSync(
  path.join(root, 'services', 'gameplay', 'formations', 'FormationRuntime.ts'),
  'utf8'
);
const catalogSource = fs.readFileSync(path.join(root, 'game-config', 'catalog.ts'), 'utf8');
const validatorSource = fs.readFileSync(path.join(root, 'director', 'server', 'gameCampaignValidation.mjs'), 'utf8');
const constantsSource = fs.readFileSync(path.join(root, 'constants.ts'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('configured squads enter, hold formation, dive, and return', () => {
  assert.match(runtimeSource, /type EnemyFormationState = 'entry' \| 'hold' \| 'dive' \| 'return'/);
  assert.match(runtimeSource, /getConfiguredFormationTarget\(/);
  assert.match(runtimeSource, /spawnConfiguredEnemyFromEvent\(event, spawned, count, difficultyMultiplier\)/);
  assert.match(
    runtimeSource,
    /configureEnemyFormation\(\s*enemy,\s*event,\s*spawnIndex,\s*targetCount,\s*formationPack,\s*role\s*\)/
  );
  assert.match(runtimeSource, /updateConfiguredEnemyFormation\(e\)/);
  assert.match(runtimeSource, /resolveFormationEntryMotion\(\{/);
  assert.match(runtimeSource, /entryDirection: formationPack\?\.entryDirection/);
  assert.match(runtimeSource, /entryPath: formationPack\?\.entryPath/);
  assert.match(runtimeSource, /entryBehavior: role\?\.entryBehavior/);
  assert.match(runtimeSource, /enemy\.formationState = 'hold'/);
  assert.match(runtimeSource, /enemy\.formationState = 'dive'/);
  assert.match(runtimeSource, /enemy\.formationState = 'return'/);
  assert.match(runtimeSource, /enemy\.formationDiveFrame/);
});

test('configured squads replace the generic aimed loop with bounded formation-specific maneuvers', () => {
  assert.match(formationSource, /export type FormationManeuverKind =/);
  assert.match(formationSource, /'sequential-peel'/);
  assert.match(formationSource, /'synchronized-break'/);
  assert.match(formationSource, /'feint-dive'/);
  assert.match(formationSource, /'crossing-flanks'/);
  assert.match(formationSource, /'corkscrew'/);
  assert.match(formationSource, /export const resolveFormationDiveMotion =/);
  assert.match(formationSource, /const readableLaneIndex =/);
  assert.match(formationSource, /const maxSpeed = speed \* 1\.32/);
  assert.match(
    runtimeSource,
    /const diveMotion = this\.resolveConfiguredFormationDiveMotion\(enemy, formation, diveAge\)/
  );
  assert.match(runtimeSource, /enemy\.vx = lerp\(enemy\.vx, diveMotion\.velocityX, diveMotion\.steering\)/);
  assert.match(runtimeSource, /enemy\.vy = lerp\(enemy\.vy, diveMotion\.velocityY, diveMotion\.steering\)/);
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
  assert.match(
    rendererSource,
    /entity\.type === EntityType\.ENEMY_DRONE[\s\S]*?entity\.formationState[\s\S]*?\? entity\.angle/
  );
  assert.match(
    rendererSource,
    /entity\.type === EntityType\.ENEMY_SWARM[\s\S]*?entity\.angle \+ ambientRotation \* 0\.3/
  );
  assert.match(
    rendererSource,
    /entity\.type === EntityType\.ENEMY_BRICK[\s\S]*?entity\.angle \+ ambientRotation \* 0\.2/
  );
  assert.match(
    rendererSource,
    /entity\.type === EntityType\.ENEMY_JOURNAL \|\| entity\.type === EntityType\.ENEMY_INVADER[\s\S]*?entity\.angle \+ ambientRotation \* 0\.25/
  );
});
