const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const environmentPath = path.join(root, 'services/pixi/PixiEnvironment.ts');
const environmentSource = fs.readFileSync(environmentPath, 'utf8');

const transpiled = ts.transpileModule(environmentSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;

const pixiStub = {
  BlurFilter: class BlurFilter {},
  Container: class Container {},
  Graphics: class Graphics {},
  Rectangle: class Rectangle {},
  Sprite: class Sprite {},
  Texture: class Texture {}
};
pixiStub.Texture.WHITE = {};

const moduleUnderTest = { exports: {} };
vm.runInNewContext(transpiled, {
  module: moduleUnderTest,
  exports: moduleUnderTest.exports,
  require(request) {
    if (request === 'pixi.js') return pixiStub;
    if (request === '../../constants') {
      return { ASSETS: new Proxy({}, { get: (_target, key) => String(key) }) };
    }
    if (request === './PixiTextureBank') return { PixiTextureBank: class PixiTextureBank {} };
    throw new Error(`Unexpected test dependency: ${request}`);
  }
});

const {
  DESKTOP_HYPERSPEED_STREAK_CAP,
  GROUND_PROP_CONTACT_ANCHOR_Y,
  MOBILE_HYPERSPEED_STREAK_CAP,
  PARALLAX_TILE_POOL_SIZE,
  SPACE_PROP_MOTION_BLUR_CAP,
  SPACE_PARALLAX_DEPTH_SPEEDS,
  TAKEOFF_WORLD_SPEED_MULTIPLIER,
  getLoopingParallaxTileY,
  getNonLoopingParallaxOffset
} = moduleUnderTest.exports;

test('looping space tiles move downward without gaps and reuse a bounded pool', () => {
  const tileHeight = 253;
  const viewportHeight = 844;
  const firstFrame = Array.from(
    { length: PARALLAX_TILE_POOL_SIZE },
    (_, index) => getLoopingParallaxTileY(index, 0, tileHeight, 'down')
  );
  const laterFrame = Array.from(
    { length: PARALLAX_TILE_POOL_SIZE },
    (_, index) => getLoopingParallaxTileY(index, 137, tileHeight, 'down')
  );

  assert.equal(laterFrame[0] > firstFrame[0], true, 'positive travel moves tiles downward');
  for (let index = 1; index < laterFrame.length; index++) {
    assert.equal(laterFrame[index] - laterFrame[index - 1], tileHeight, 'adjacent tiles remain seamless');
  }
  assert.equal(laterFrame[0] <= 0, true, 'pool begins above the viewport');
  assert.equal(
    laterFrame.at(-1) + tileHeight >= viewportHeight,
    true,
    'pool covers a tall mobile viewport'
  );
  assert.equal(
    getLoopingParallaxTileY(0, tileHeight + 137, tileHeight, 'down'),
    laterFrame[0],
    'wrapping preserves the same phase'
  );
});

test('non-looping ground masters clamp while traveling downward', () => {
  assert.equal(getNonLoopingParallaxOffset(200, 0, 'down'), -200);
  assert.equal(getNonLoopingParallaxOffset(200, 50, 'down'), -150);
  assert.equal(getNonLoopingParallaxOffset(200, 200, 'down'), 0);
  assert.equal(getNonLoopingParallaxOffset(200, 5_000, 'down'), 0);
  assert.equal(getNonLoopingParallaxOffset(200, 50, 'up'), -50);
  assert.equal(getNonLoopingParallaxOffset(200, 5_000, 'up'), -200);
});

test('all space profiles use a strict far-to-near speed progression', () => {
  assert.deepEqual(
    Object.keys(SPACE_PARALLAX_DEPTH_SPEEDS),
    [
      'open-orbit',
      'citation-storm',
      'bastion-protocol',
      'helix-redline',
      'shattered-void',
      'gravity-rift',
      'ion-eclipse',
      'terminus-frontier'
    ]
  );
  for (const [profileId, speeds] of Object.entries(SPACE_PARALLAX_DEPTH_SPEEDS)) {
    assert.equal(speeds.length, 5, `${profileId} defines all five depth layers`);
    for (let index = 1; index < speeds.length; index++) {
      assert.equal(
        speeds[index] > speeds[index - 1],
        true,
        `${profileId} depth ${index} is faster than depth ${index - 1}`
      );
    }
    assert.ok(speeds[0] <= 0.003, `${profileId} deep background remains extremely slow`);
    assert.ok(speeds[2] >= speeds[1] * 2, `${profileId} planets separate from the deep field`);
    assert.ok(speeds[3] >= speeds[2] * 2.5, `${profileId} broad mid-field travel stays readable`);
    assert.ok(speeds[4] >= speeds[3] * 2, `${profileId} foreground star/debris field is fastest`);
  }
});

test('ground anchors and hyperspeed effects stay within explicit performance budgets', () => {
  assert.equal(PARALLAX_TILE_POOL_SIZE, 8);
  assert.equal(GROUND_PROP_CONTACT_ANCHOR_Y, 238 / 256);
  assert.equal(MOBILE_HYPERSPEED_STREAK_CAP, 24);
  assert.equal(DESKTOP_HYPERSPEED_STREAK_CAP, 38);
  assert.equal(TAKEOFF_WORLD_SPEED_MULTIPLIER, 48);
  assert.equal(SPACE_PROP_MOTION_BLUR_CAP, 5.4);

  const updateSource = environmentSource.slice(
    environmentSource.indexOf('  update(engine: GameEngine)'),
    environmentSource.indexOf('\n  destroy()')
  );
  assert.doesNotMatch(updateSource, /new Sprite\(/);
  assert.doesNotMatch(updateSource, /new Texture\(/);
  assert.match(updateSource, /profile\.terrain === 'space' \? hyperspeedStrength : 0/);
  assert.match(updateSource, /profile\.terrain === 'space' \? TAKEOFF_WORLD_SPEED_MULTIPLIER : 30/);
  assert.match(updateSource, /this\.spacePropMotionBlur\.strengthY = propMotionBlurStrength/);
  assert.match(updateSource, /layer\.blurFilter\.strengthY = baseBlurStrength \+ takeoffBlurY/);
  assert.match(updateSource, /this\.hyperspeedFrame\.alpha/);
  assert.match(environmentSource, /PIXI_TERRAIN_DESERT_MASTER, speed: 0\.36/);
  assert.match(environmentSource, /PIXI_TERRAIN_RIVER_MASTER, speed: 0\.34/);
});
