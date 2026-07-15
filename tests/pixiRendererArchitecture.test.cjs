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

  assert.match(renderer, /class ArcadeEffectPool/);
  assert.match(renderer, /private readonly recycledViews = new Map/);
  assert.match(renderer, /syncEntities\(engine\)/);
  assert.match(renderer, /engine\.entities/);
  assert.doesNotMatch(renderer, /new GameEngine/);
  assert.doesNotMatch(renderer, /requestAnimationFrame/);
});
