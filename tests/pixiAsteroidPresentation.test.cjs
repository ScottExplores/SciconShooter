const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'), 'utf8');

test('Pixi asteroid belts select one stable texture and prefer darker tail art in later stages', () => {
  assert.match(renderer, /\.\.\.ASSETS\.ASTEROID_BELT_FRAMES/);
  const helperStart = renderer.indexOf('const getStaticAsteroidTexture =');
  const helperEnd = renderer.indexOf('\nconst getDefaultEntityTexture =', helperStart);
  const helper = renderer.slice(helperStart, helperEnd);

  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  assert.match(helper, /entity\.spriteFrames\?\.length/);
  assert.match(helper, /Math\.floor\(Number\(engine\.stats\.wave\) \|\| 1\)/);
  assert.match(helper, /stageNumber >= 4[\s\S]*frames\.length - 2/);
  assert.match(helper, /stageNumber >= 3[\s\S]*frames\.length - 3/);
  assert.match(helper, /stableVariant % availableFrameCount/);
  assert.doesNotMatch(helper, /frameCount|getAnimatedFrame|pingPong/);

  const textureResolverStart = renderer.indexOf('const getDefaultEntityTexture =');
  const textureResolverEnd = renderer.indexOf('\nexport class PixiGameRenderer', textureResolverStart);
  const textureResolver = renderer.slice(textureResolverStart, textureResolverEnd);
  const stableBranch = textureResolver.indexOf('entity.variant >= 900');
  const genericAnimation = textureResolver.indexOf('if (entity.spriteFrames?.length)');
  assert.ok(stableBranch >= 0 && stableBranch < genericAnimation, 'asteroids must bypass generic sprite-sheet animation');
  assert.match(textureResolver, /return getStaticAsteroidTexture\(engine, entity\)/);
});

test('Pixi asteroid belt roots do not receive the bulwark spin animation', () => {
  const updateStart = renderer.indexOf('  private updateEntityView(');
  const updateEnd = renderer.indexOf('\n  private syncEntities(', updateStart);
  const update = renderer.slice(updateStart, updateEnd);

  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(update, /entity\.type === EntityType\.ENEMY_BRICK[\s\S]*if \(entity\.variant < 900\) \{[\s\S]*view\.root\.rotation = Math\.sin/);
  assert.doesNotMatch(update, /entity\.variant >= 900[\s\S]{0,180}view\.root\.rotation/);
});
