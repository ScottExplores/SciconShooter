const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const environmentPath = path.join(root, 'services', 'pixi', 'PixiEnvironment.ts');
const environmentSource = fs.readFileSync(environmentPath, 'utf8');
const transpiled = ts.transpileModule(environmentSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020
  }
}).outputText;

// REVAMP(L): Execute the real full-quality bake budget used by the cache.
const rendererBudget = { exports: {} };
vm.runInNewContext(ts.transpileModule(
  fs.readFileSync(path.join(root, 'services/revamp/performance/RendererBudget.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText, { module: rendererBudget, exports: rendererBudget.exports });

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
    // REVAMP(J): Execute the real cache helper; these tests still exercise the
    // original preload/window behavior without constructing a GPU renderer.
    if (request === '../revamp/performance/BackgroundTextureCache' || request === '../revamp/performance/BackgroundQuad') {
      const dependency = { exports: {} };
      const source = fs.readFileSync(path.join(root, 'services/pixi', `${request}.ts`), 'utf8');
      const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
      }).outputText;
      vm.runInNewContext(compiled, { module: dependency, exports: dependency.exports, require: name => {
        if (name === 'pixi.js') return pixiStub;
        if (name === './RendererBudget') return rendererBudget.exports;
        throw new Error(`Unexpected cache dependency: ${name}`);
      } });
      return dependency.exports;
    }
    throw new Error(`Unexpected test dependency: ${request}`);
  }
});

const {
  PIXI_ENVIRONMENT_TEXTURE_URLS,
  TERRAIN_PROP_POOL_SIZE,
  getEnvironmentProfileTextureUrls,
  getEnvironmentWindowTextureUrls,
  resolveCampaignEnvironmentWindow
} = moduleUnderTest.exports;

const wave = (id, order, backgroundId) => ({ id, order, backgroundId, events: [] });
const level = (id, order, backgroundId, waves) => ({ id, order, backgroundId, waves });
const copyWindow = (value) => ({
  currentBackgroundId: value.currentBackgroundId,
  nextBackgroundId: value.nextBackgroundId
});

test('campaign windows preload the next distinct environment instead of every later stage', () => {
  const campaign = {
    levels: [
      level('stage-1', 1, 'open-orbit', [wave('wave-1', 1, 'open-orbit')]),
      level('stage-2', 2, 'helix-redline', [wave('wave-2', 1, 'helix-redline')]),
      level('stage-3', 3, 'helix-redline', [wave('wave-3', 1, 'helix-redline')]),
      level('stage-4', 4, 'shattered-void', [wave('wave-4', 1, 'shattered-void')]),
      level('stage-5', 5, 'gravity-rift', [wave('wave-5', 1, 'gravity-rift')])
    ]
  };

  assert.deepEqual(
    copyWindow(resolveCampaignEnvironmentWindow(campaign, 'stage-2', 'wave-2')),
    { currentBackgroundId: 'helix-redline', nextBackgroundId: 'shattered-void' }
  );
  assert.deepEqual(
    copyWindow(resolveCampaignEnvironmentWindow(campaign, 'stage-4', 'wave-4')),
    { currentBackgroundId: 'shattered-void', nextBackgroundId: 'gravity-rift' }
  );
  assert.deepEqual(
    copyWindow(resolveCampaignEnvironmentWindow(campaign, 'stage-5', 'wave-5')),
    { currentBackgroundId: 'gravity-rift', nextBackgroundId: null }
  );
});

test('wave overrides participate in the same current-and-next preload window', () => {
  const campaign = {
    levels: [level('stage', 1, 'open-orbit', [
      wave('opening', 1, 'open-orbit'),
      wave('descent', 2, 'paywall-siege'),
      wave('hold', 3, 'paywall-siege')
    ])]
  };

  assert.deepEqual(
    copyWindow(resolveCampaignEnvironmentWindow(campaign, 'stage', 'opening')),
    { currentBackgroundId: 'open-orbit', nextBackgroundId: 'paywall-siege' }
  );
});

test('startup and per-profile URL sets exclude unrelated late-run atlases', () => {
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.length, 8);
  assert.ok(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_SPACE_PARALLAX_BG_ION_CLOUD'));
  assert.ok(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT'));
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_BREAKWATER_FAR'), false);
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_SPACE_PARALLAX_DEBRIS_BASALT'), false);
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_SPACE_PARALLAX_DEBRIS_RUST'), false);
  assert.ok(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_TERRAIN_SPACE_PROPS'));
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_TERRAIN_DESERT_MASTER'), false);
  assert.equal(PIXI_ENVIRONMENT_TEXTURE_URLS.includes('PIXI_SPACE_RUN_HELIX_REDLINE_PROPS'), false);

  const openOrbitUrls = getEnvironmentProfileTextureUrls('open-orbit');
  assert.equal(openOrbitUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_BASALT'), false);
  assert.equal(openOrbitUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_RUST'), false);

  const helixUrls = getEnvironmentProfileTextureUrls('helix-redline');
  assert.ok(helixUrls.includes('PIXI_SPACE_RUN_HELIX_REDLINE_PROPS'));
  assert.ok(helixUrls.includes('PIXI_SPACE_PARALLAX_BG_VIOLET_RIFT'));
  assert.equal(helixUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_BASALT'), false);
  assert.equal(helixUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_RUST'), false);
  assert.equal(helixUrls.includes('PIXI_SPACE_RUN_SHATTERED_VOID_PROPS'), false);

  const groundUrls = getEnvironmentProfileTextureUrls('paywall-siege');
  assert.equal(groundUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_BASALT'), false);
  assert.equal(groundUrls.includes('PIXI_SPACE_PARALLAX_DEBRIS_RUST'), false);

  const windowUrls = getEnvironmentWindowTextureUrls({
    currentBackgroundId: 'helix-redline',
    nextBackgroundId: 'shattered-void'
  });
  assert.ok(windowUrls.includes('PIXI_SPACE_RUN_HELIX_REDLINE_PROPS'));
  assert.ok(windowUrls.includes('PIXI_SPACE_RUN_SHATTERED_VOID_PROPS'));
  assert.equal(windowUrls.includes('PIXI_SPACE_RUN_GRAVITY_RIFT_PROPS'), false);
});

test('Breakwater environments load only their own landmark layer and never inherit planet props', () => {
  for (const [id, layer] of [
    ['breakwater-approach', 'PIXI_BREAKWATER_APPROACH'],
    ['breakwater-wreckfield', 'PIXI_BREAKWATER_WRECKFIELD'],
    ['breakwater-gate', 'PIXI_BREAKWATER_GATE']
  ]) {
    const urls = [...getEnvironmentProfileTextureUrls(id)];
    assert.deepEqual(urls, ['PIXI_BREAKWATER_FAR', layer]);
    assert.equal(urls.some(url => /PLANET|TERRAIN_SPACE_PROPS/.test(url)), false);
  }
  assert.match(environmentSource, /profile\.propCount > 0 && !this\.configureTerrainProps/,
    'profiles without props must not wait for an unused planet atlas');
});

test('terrain props use one bounded reusable pool while route textures warm asynchronously', () => {
  assert.equal(TERRAIN_PROP_POOL_SIZE, 9);
  const poolSource = environmentSource.slice(
    environmentSource.indexOf('  private buildTerrainPropPool()'),
    environmentSource.indexOf('  private pruneAtlasFrameCache')
  );
  assert.match(poolSource, /slot < TERRAIN_PROP_POOL_SIZE/);
  assert.doesNotMatch(poolSource, /Object\.keys\(TERRAIN_PROP_ATLASES\)/);

  const updateSource = environmentSource.slice(
    environmentSource.indexOf('  update(engine: GameEngine)'),
    environmentSource.indexOf('\n  destroy()')
  );
  assert.match(updateSource, /void this\.preloadProfileWindow\(this\.campaignProfileWindow\)/);
  assert.match(updateSource, /currentWaveId !== this\.campaignWaveId/);
  assert.doesNotMatch(updateSource, /new Sprite\(/);
  assert.doesNotMatch(updateSource, /new Texture\(/);
  assert.match(environmentSource, /definition\.tilePoolSize \?\? PARALLAX_TILE_POOL_SIZE/);
  assert.match(environmentSource, /layer\.activeTileCount/);
});
