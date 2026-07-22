const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const types = read('types.ts');
const constants = read('constants.ts');
const engine = read('services', 'gameLogic.ts');
const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
const campaign = JSON.parse(read('game-config', 'campaign.json'));

test('Max Shot is a rare configured five-times-volley power-up with real generated art', () => {
  assert.match(types, /MAX_SHOT\s*=\s*'MAX_SHOT'/);
  assert.match(constants, /POWERUP_MAX_SHOT:\s*"\/game-art\/generated\/powerups\/scicon-max-shot-v1\/max-shot-pickup\.png"/);
  assert.match(constants, /POWERUP_MAX_SHOT_AURA:\s*"\/game-art\/generated\/powerups\/scicon-max-shot-v1\/max-shot-aura\.png"/);
  assert.match(constants, /POWERUP_MAX_SHOT_AURA_FRAMES:\s*Array\.from/);
  assert.ok(fs.existsSync(path.join(root, 'public', 'game-art', 'generated', 'powerups', 'scicon-max-shot-v1', 'max-shot-pickup.png')));
  assert.ok(fs.existsSync(path.join(root, 'public', 'game-art', 'generated', 'powerups', 'scicon-max-shot-v1', 'max-shot-aura.png')));
  for (let frame = 1; frame <= 8; frame++) {
    assert.ok(fs.existsSync(path.join(
      root,
      'public',
      'game-art',
      'generated',
      'scicon-stage20-expansion-v1',
      'powerups',
      'max-shot-aura',
      'frames',
      `max-shot-aura-${String(frame).padStart(2, '0')}.png`
    )));
  }
  assert.match(engine, /MAX_SHOT_PROJECTILE_COUNT\s*=\s*15/);
  assert.match(engine, /getMaxShotProjectileCount\(volleySize\)/);
  assert.match(engine, /getMaxShotAnglesRadians\(projectileCount\)/);
  assert.match(engine, /activePowerups\.has\(PowerupType\.MAX_SHOT\)/);
  assert.match(engine, /'max-shot':\s*PowerupType\.MAX_SHOT/);
  assert.match(engine, /\[PowerupType\.MAX_SHOT,\s*0\.055\]/);
  assert.ok(campaign.levels.every((level) => level.availablePowerupIds.includes('max-shot')));
});

test('Max Shot reserves room for the complete tier-scaled volley before emitting atomically', () => {
  assert.match(
    engine,
    /hasPlayerShotCapacity\(projectileCount: number = 1\)[\s\S]*?\+ projectileCount <= this\.getPlayerShotCap\(\)/
  );

  const maxShotBranch = engine.match(
    /if \(this\.activePowerups\.has\(PowerupType\.MAX_SHOT\)\) \{([\s\S]*?)\n\s*return;\n\s*\}/
  );
  assert.ok(maxShotBranch, 'Max Shot should have a dedicated firing branch');

  const capacityGate = maxShotBranch[1].indexOf(
    'if (!this.hasPlayerShotCapacity(projectileCount)) return;'
  );
  const firstEmission = maxShotBranch[1].indexOf('angles.forEach');
  assert.ok(capacityGate >= 0, 'the complete tier-scaled capacity gate is required');
  assert.ok(firstEmission > capacityGate, 'capacity must be reserved before the first projectile is emitted');
  assert.doesNotMatch(
    maxShotBranch[1].slice(0, capacityGate),
    /spawnPlayerBullet\(/,
    'no Max Shot projectile may emit before the complete-volley capacity check'
  );
});

test('Max Shot presentation reuses one aura sprite and one bounded screen-edge graphic', () => {
  assert.match(renderer, /private readonly maxShotAura = new Sprite\(Texture\.WHITE\)/);
  assert.match(renderer, /private readonly maxShotScreenGlow = new Graphics\(\)/);
  assert.match(renderer, /syncMaxShotPresentation\(engine: GameEngine\)/);
  assert.match(renderer, /ASSETS\.POWERUP_MAX_SHOT_AURA/);
  assert.match(renderer, /ASSETS\.POWERUP_MAX_SHOT_AURA_FRAMES\[auraFrameIndex\]/);
  assert.match(engine, /MOBILE_MAX_PLAYER_SHOT_CAP/);
  assert.match(engine, /companionBurstSize/);
  assert.match(engine, /completeBurstFloor/);
});

test('the conditional mission preload warms only the explicit production Pixi texture list', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  assert.match(renderer, /export const PIXI_GAMEPLAY_TEXTURE_URLS = Object\.freeze\(\[/);
  assert.match(renderer, /export const preloadPixiGameplayTextures/);
  assert.match(renderer, /Assets\.load<Texture>\(url\)/);
  assert.match(canvas, /preloadEngineGameplayAssets\(\)/);
  assert.match(canvas, /preloadPixiGameplayTextures\(\)/);
});
