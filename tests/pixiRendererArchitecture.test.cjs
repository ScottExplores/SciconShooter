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
  assert.match(renderer, /import 'pixi\.js\/unsafe-eval'/);
  assert.match(canvas, /new PixiGameRenderer\(\)/);
  assert.match(canvas, /renderer\.sync\(engine, timestamp\)/);
  assert.doesNotMatch(canvas, /getContext\(['"]2d['"]\)/);
  assert.doesNotMatch(canvas, /engine\.draw\(/);
  assert.equal((canvas.match(/const animate =/g) || []).length, 1);

  assert.match(renderer, /autoStart:\s*false/);
  assert.match(renderer, /sharedTicker:\s*false/);
  assert.match(renderer, /this\.app\.stop\(\)/);
  assert.match(renderer, /this\.app\.renderer\.render\(this\.app\.stage\)/);
  assert.match(renderer, /if \(!this\.appReady \|\| this\.appDestroyed\) return/);
  assert.match(renderer, /if \(this\.destroyed\) \{\s*this\.destroyApplication\(\)/);
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
  assert.match(effects, /reusableCount >= this\.maxEffects/);
  assert.match(environment, /class PixiEnvironment/);
  assert.match(environment, /this\.parallaxLayers/);
  assert.match(environment, /const BACKGROUND_PROFILES/);
  assert.match(environment, /PIXI_TERRAIN_SPACE_MASTER/);
  assert.match(environment, /private applyProfile/);
  assert.match(environment, /const baseBlurStrength = engine\.performanceMode \? 0 : layer\.softness/);
  assert.match(environment, /layer\.blurFilter\.strengthY = baseBlurStrength \+ takeoffBlurY/);
  assert.match(environment, /this\.terrainPropLayer\.filters = shouldBlurSpaceProps \? \[this\.spacePropMotionBlur\] : null/);
  assert.doesNotMatch(environment, /layer\.root\.visible = !\(lowQuality/);
  assert.match(textures, /class PixiTextureBank/);
  assert.match(renderer, /private readonly recycledViews = new Map/);
  assert.match(renderer, /syncEntities\(engine\)/);
  assert.match(renderer, /engine\.entities/);
  assert.doesNotMatch(renderer, /new GameEngine/);
  assert.doesNotMatch(renderer, /requestAnimationFrame/);
});

test('the local Director can decode Pixi textures without enabling remote scripts', () => {
  const directorHtml = read('director/index.html');

  assert.match(directorHtml, /script-src 'self'/);
  assert.match(directorHtml, /worker-src 'self' blob:/);
  assert.doesNotMatch(directorHtml, /script-src[^;]*unsafe-eval/);
});

test('boss warnings use the registered Scicon alert art with live reusable labels', () => {
  const constants = read('constants.ts');
  const renderer = read('services/pixi/PixiGameRenderer.ts');

  assert.match(constants, /PIXI_BOSS_ALERT_FRAME/);
  assert.match(constants, /boss-incoming-alert-frame\.png/);
  assert.match(constants, /warning-ring-red\.png/);
  assert.match(constants, /warning-crystal\.png/);
  assert.match(renderer, /this\.warningRoot\.addChild/);
  assert.match(renderer, /this\.warningText\.text = title/);
  assert.match(renderer, /BOSS INCOMING/);
  assert.match(renderer, /this\.warningCrystal\.position\.set/);
  assert.match(renderer, /const sirenWave = \(Math\.cos\(\(elapsed % 36\) \/ 36 \* Math\.PI \* 2\) \+ 1\) \* 0\.5/);
  assert.match(renderer, /const redFlashAlpha = 0\.07 \+ sirenWave \* 0\.2/);
  assert.match(renderer, /fill\(\{ color: '#dc2626', alpha: redFlashAlpha \}\)/);
});
