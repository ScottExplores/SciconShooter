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
  DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE,
  DEBRIS_OVERLAY_TILE_POOL_SIZE,
  DESKTOP_HYPERSPEED_STREAK_CAP,
  GROUND_PROP_CONTACT_ANCHOR_Y,
  MAX_PARALLAX_LAYER_POOL_SIZE,
  MOBILE_HYPERSPEED_STREAK_CAP,
  PARALLAX_TILE_POOL_SIZE,
  SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS,
  SPACE_PROP_MOTION_BLUR_CAP,
  SPACE_PARALLAX_DEPTH_SPEEDS,
  TAKEOFF_WORLD_SPEED_MULTIPLIER,
  getLoopingParallaxTileY,
  getNonLoopingParallaxOffset,
  getGroundPropPerspectiveState,
  buildSpaceBodyLayout,
  SPACE_BULLET_LANE,
  getClampedSpriteCenterX,
  getSpaceLandmarkDisplaySize,
  getSpaceLandmarkEdgeInset
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

test('all space profiles use a fast seven-step far-to-near speed progression', () => {
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
    assert.equal(speeds.length, 7, `${profileId} defines all seven depth steps`);
    for (let index = 1; index < speeds.length; index++) {
      assert.equal(
        speeds[index] > speeds[index - 1],
        true,
        `${profileId} depth ${index} is faster than depth ${index - 1}`
      );
    }
    assert.ok(speeds[0] >= 0.01, `${profileId} deep background visibly advances`);
    assert.ok(speeds[0] <= 0.016, `${profileId} deep background remains the slowest depth`);
    assert.ok(speeds[1] >= speeds[0] * 2, `${profileId} moving deep field separates from its backplate`);
    assert.ok(speeds[2] >= speeds[1] * 2, `${profileId} planets separate from the deep field`);
    assert.ok(speeds[2] >= 0.075, `${profileId} planets visibly travel against the deep field`);
    assert.ok(speeds[4] >= 0.33, `${profileId} coherent debris has a strong middle-depth flyby`);
    assert.ok(speeds[4] >= speeds[2] * 3, `${profileId} middle debris materially outruns planets`);
    assert.ok(speeds[5] > speeds[4], `${profileId} second debris depth remains distinct`);
    assert.ok(speeds[6] > speeds[5], `${profileId} near star field remains fastest`);
    assert.ok(
      SPACE_DYNAMIC_STAR_SPEED_MULTIPLIERS[profileId] * 0.185 > speeds[6],
      `${profileId} nearest procedural star specks can outrun the texture layers`
    );
  }
});

test('space routes keep generated nebula variety while excluding the mismatched loose-rock overlays', () => {
  assert.equal(DEBRIS_OVERLAY_TILE_POOL_SIZE, 2);
  assert.equal(MAX_PARALLAX_LAYER_POOL_SIZE, 5);
  assert.match(environmentSource, /PIXI_SPACE_PARALLAX_BG_OBSIDIAN_NEBULA/);
  assert.match(environmentSource, /PIXI_SPACE_PARALLAX_BG_ION_CLOUD/);
  assert.match(environmentSource, /PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT/);
  assert.match(environmentSource, /PIXI_SPACE_PARALLAX_DEBRIS_BASALT/);
  assert.match(environmentSource, /PIXI_SPACE_PARALLAX_DEBRIS_RUST/);
  assert.match(environmentSource, /_legacyDebrisUrls/);
  assert.doesNotMatch(environmentSource, /speed: speeds\[4 \+ index\]/);
  assert.match(environmentSource, /coverViewport: true/);
  assert.match(environmentSource, /HOME_SPARSE_STARFIELD_BASE/);
  assert.doesNotMatch(environmentSource, /GAME_PARALLAX_FAR_PLANETS/);
  assert.match(environmentSource, /texture === Texture\.WHITE/);
  assert.match(environmentSource, /url: ASSETS\.GAME_PARALLAX_BACK,[\s\S]{0,160}alpha: 0\.1/);
  assert.match(environmentSource, /url: ASSETS\.GAME_BG_STARS,[\s\S]{0,160}alpha: 0\.12/);
  assert.match(environmentSource, /url: ASSETS\.GAME_PARALLAX_STARS,[\s\S]{0,160}alpha: 0\.22/);
  assert.match(environmentSource, /tileIndex >= layer\.activeTileCount/);
  assert.match(environmentSource, /Math\.ceil\(Math\.max\(this\.width \* layer\.widthScale, this\.height \/ sourceAspect\)\)/);
  assert.doesNotMatch(environmentSource, /sourceAspect\) \* 1\.04/);
});

test('deep space backplates keep moving throughout a long mission instead of clamping to their overscan', () => {
  assert.equal(DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE, 2);
  assert.match(
    environmentSource,
    /url: backplateUrl,[\s\S]{0,360}loop: true,[\s\S]{0,120}tilePoolSize: DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE/
  );

  // Use the real master proportions on a representative tall phone. The old
  // non-looping implementation had only a few pixels of travel and stopped
  // Terminus Frontier in seconds. A pooled loop advances at the same slow
  // depth speed after six minutes and still covers the viewport.
  const viewportWidth = 430;
  const viewportHeight = 934;
  const sourceWidth = 941;
  const sourceHeight = 1_672;
  const sourceAspect = sourceHeight / sourceWidth;
  const tileHeight = Math.ceil(Math.max(viewportWidth, viewportHeight / sourceAspect)) * sourceAspect;
  const speed = SPACE_PARALLAX_DEPTH_SPEEDS['terminus-frontier'][0];
  const startOffsetRatio = 0.71;
  const startOffset = tileHeight * startOffsetRatio;
  const oldOverscan = tileHeight - viewportHeight;
  const oldClampFrames = oldOverscan * (1 - startOffsetRatio) / speed;
  const framesUntilFirstWrap = tileHeight * (1 - startOffsetRatio) / speed;
  const longMissionFrame = 6 * 60 * 60;
  const scrollAtLongMission = startOffset + longMissionFrame * speed;
  const current = getLoopingParallaxTileY(0, scrollAtLongMission, tileHeight, 'down');
  const nextFrame = getLoopingParallaxTileY(0, scrollAtLongMission + speed, tileHeight, 'down');
  const pair = Array.from(
    { length: DEEP_SPACE_BACKPLATE_TILE_POOL_SIZE },
    (_, index) => getLoopingParallaxTileY(index, scrollAtLongMission, tileHeight, 'down')
  );

  assert.ok(oldClampFrames < 15 * 60, 'the old non-looping deep plate would clamp in under fifteen seconds');
  assert.ok(framesUntilFirstWrap > 5 * 60 * 60, 'the first wrap remains beyond five minutes');
  assert.ok(nextFrame > current, 'the deep plate still advances downward after a long mission');
  assert.equal(pair[1] - pair[0], tileHeight, 'the pooled backplates remain edge-adjacent');
  assert.ok(pair[0] <= 0, 'the leading backplate begins above the viewport');
  assert.ok(pair[1] + tileHeight >= viewportHeight, 'the pooled pair still covers the viewport');
});

test('ground faces follow screen scroll and space bodies stay off a shared row', () => {
  assert.equal(getGroundPropPerspectiveState(100, 900), 0);
  assert.equal(getGroundPropPerspectiveState(450, 900), 1);
  assert.equal(getGroundPropPerspectiveState(700, 900), 2);

  const open = buildSpaceBodyLayout('open-orbit');
  const terminus = buildSpaceBodyLayout('terminus-frontier');
  const citation = buildSpaceBodyLayout('citation-storm');
  const profiles = ['open-orbit', 'citation-storm', 'bastion-protocol', 'helix-redline', 'shattered-void', 'gravity-rift', 'ion-eclipse', 'terminus-frontier'];
  const layouts = profiles.map((profileId) => buildSpaceBodyLayout(profileId)[0]);
  assert.equal(open.length, 1);
  assert.equal(new Set(open.map((body) => body.url)).size, 1);
  assert.equal(open[0].url, 'GAME_PARALLAX_BIG_PLANET');
  assert.equal(citation[0].url, 'GAME_PARALLAX_RING_PLANET');
  assert.notEqual(open[0].url, citation[0].url);
  assert.notEqual(open[0].url, terminus[0].url);
  assert.notEqual(open[0].phase, terminus[0].phase);
  assert.ok(layouts.every((body) => body.scale >= 0.12 && body.scale <= 0.3));
  assert.ok(layouts.every((body) => body.baseX <= SPACE_BULLET_LANE.min || body.baseX >= SPACE_BULLET_LANE.max));
  assert.equal(new Set(layouts.map((body) => body.url)).size, 2);
  assert.ok(open.every((body) => body.url !== 'GAME_BG_PLANET'));

  const viewport = 390;
  const inset = getSpaceLandmarkEdgeInset(viewport);
  assert.equal(inset, 39);
  const ring = getSpaceLandmarkDisplaySize(viewport, 51, 115, viewport * citation[0].scale);
  assert.ok(ring.width <= viewport * 0.3);
  assert.ok(ring.height <= viewport * 0.3 + 0.01);
  assert.ok(ring.height < viewport * 0.3 * (115 / 51) + 1, 'the tall ring texture is scaled down instead of becoming a horizon');
  const nativeSize = open[0].url === 'GAME_PARALLAX_RING_PLANET'
    ? { width: 51, height: 115 }
    : { width: 88, height: 87 };
  open.forEach((body, index) => {
    const sized = getSpaceLandmarkDisplaySize(
      viewport,
      nativeSize.width,
      nativeSize.height,
      Math.max(48, viewport * body.scale)
    );
    const center = getClampedSpriteCenterX(body.baseX * viewport, sized.width, viewport);
    const left = center - sized.width / 2;
    const right = center + sized.width / 2;
    assert.ok(left >= inset - 0.5, `open-orbit body ${index} stays inside the left inset`);
    assert.ok(right <= viewport - inset + 0.5, `open-orbit body ${index} stays inside the right inset`);
    assert.ok(body.baseX <= SPACE_BULLET_LANE.min || body.baseX >= SPACE_BULLET_LANE.max);
  });
  const station = getSpaceLandmarkDisplaySize(viewport, 256, 256, viewport * 0.42, 0.3);
  assert.ok(station.width <= viewport * 0.3);
  assert.ok(station.height <= viewport * 0.3);
});

test('space landmark pools scatter planets across depth instead of one repeated edge pair', () => {
  const defaultSpaceStart = environmentSource.indexOf('  space: [');
  const defaultSpaceEnd = environmentSource.indexOf("\n  'citation-storm': [", defaultSpaceStart);
  const defaultSpaceProps = environmentSource.slice(defaultSpaceStart, defaultSpaceEnd);
  const defaultSpeeds = [...defaultSpaceProps.matchAll(/speed: ([0-9.]+)/g)].map((match) => Number(match[1]));
  const defaultFrames = [...defaultSpaceProps.matchAll(/frame: (\d+)/g)].map((match) => Number(match[1]));
  const defaultLanes = [...defaultSpaceProps.matchAll(/baseX: ([0-9.]+)/g)].map((match) => Number(match[1]));

  assert.deepEqual(defaultSpeeds, [0.034, 0.06, 0.088]);
  assert.equal(new Set(defaultFrames).size, defaultFrames.length);
  assert.ok(defaultLanes.every((lane) => lane <= SPACE_BULLET_LANE.min || lane >= SPACE_BULLET_LANE.max));
  assert.doesNotMatch(defaultSpaceProps, /rotationSpeed: [^0]/);
  assert.doesNotMatch(defaultSpaceProps, /sway: [^0]/);
  assert.match(environmentSource, /frame: 0, baseX: placeX\('left'/);
  assert.match(environmentSource, /frame: 2, baseX: placeX\('right'/);
  assert.doesNotMatch(environmentSource, /widthRatio: 0\.3 \+ vistaJitter/);

  const runStart = environmentSource.indexOf('const createSpaceRunLayout');
  const runEnd = environmentSource.indexOf('\nexport type SpaceBodyLandmark', runStart);
  const runProps = environmentSource.slice(runStart, runEnd);
  assert.equal((runProps.match(/alpha: 0\.55/g) ?? []).length, 1);
  assert.match(environmentSource, /terrain: 'space', propSet: 'terminus-frontier', propAlpha: 1, propCount: 4/);
  assert.match(environmentSource, /propSet: 'space',\n\s*propAlpha: 1,\n\s*propCount: 3/);
  assert.match(environmentSource, /propSet: 'citation-storm',\n\s*propAlpha: 1,\n\s*propCount: 3/);
  assert.match(environmentSource, /propSet: 'bastion-protocol',\n\s*propAlpha: 1,\n\s*propCount: 3/);
  assert.match(
    environmentSource,
    /prop\.sprite\.texture !== Texture\.WHITE\s*&& prop\.propSet === profile\.propSet/
  );
});

test('ground anchors and hyperspeed effects stay within explicit performance budgets', () => {
  assert.equal(PARALLAX_TILE_POOL_SIZE, 8);
  assert.equal(DEBRIS_OVERLAY_TILE_POOL_SIZE, 2);
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
  assert.match(environmentSource, /PIXI_TERRAIN_DESERT_MASTER, speed: 0\.4/);
  assert.match(environmentSource, /PIXI_DESERT_CLOUDS, speed: 0\.118/);
  assert.match(environmentSource, /PIXI_TERRAIN_RIVER_MASTER, speed: 0\.38/);
});
