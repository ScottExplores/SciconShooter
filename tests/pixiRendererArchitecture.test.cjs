const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('canonical gameplay renders through one manually-driven Pixi scene', () => {
  const packageJson = JSON.parse(read('package.json'));
  const canvas = read('components/GameCanvas.tsx');
  const renderer = read('services/pixi/PixiGameRenderer.ts');

  assert.match(packageJson.dependencies['pixi.js'], /^\^8\./);
  assert.match(canvas, /new PixiGameRenderer\(\)/);
  assert.match(canvas, /renderer\.sync\(engine, timestamp\)/);
  assert.doesNotMatch(canvas, /getContext\(['"]2d['"]\)/);
  assert.doesNotMatch(canvas, /engine\.draw\(/);
  assert.equal((canvas.match(/const animate =/g) || []).length, 1);

  assert.match(renderer, /autoStart:\s*false/);
  assert.match(renderer, /sharedTicker:\s*false/);
  assert.match(renderer, /this\.app\.stop\(\)/);
  assert.match(renderer, /this\.app\.renderer\.render\(this\.app\.stage\)/);
});

test('Pixi presentation keeps ordered gameplay layers and pooled effects', () => {
  const renderer = read('services/pixi/PixiGameRenderer.ts');
  const effects = read('services/pixi/ArcadeEffectPool.ts');
  const environment = read('services/pixi/PixiEnvironment.ts');
  const textures = read('services/pixi/PixiTextureBank.ts');

  for (const layer of [
    'background',
    'environment',
    'enemy',
    'player',
    'projectile',
    'pickup',
    'effects',
    'foreground',
    'overlay'
  ]) {
    assert.match(renderer, new RegExp(`${layer}: createLayer\\(\\)`));
  }

  assert.match(renderer, /new ArcadeEffectPool/);
  assert.match(renderer, /new PixiEnvironment/);
  assert.match(renderer, /new PixiTextureBank/);
  assert.match(effects, /class ArcadeEffectPool/);
  assert.match(effects, /this\.effects\.length >= this\.maxEffects/);
  assert.match(environment, /class PixiEnvironment/);
  assert.match(environment, /this\.parallaxLayers/);
  assert.match(textures, /class PixiTextureBank/);
  assert.match(renderer, /private readonly recycledViews = new Map/);
  assert.match(renderer, /syncEntities\(engine\)/);
  assert.match(renderer, /engine\.entities/);
  assert.doesNotMatch(renderer, /new GameEngine/);
  assert.doesNotMatch(renderer, /requestAnimationFrame/);
});
