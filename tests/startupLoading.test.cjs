const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const fakeAssets = Object.freeze({
  HOME_SPARSE_STARFIELD_BASE: '/game-art/test/home-base.png',
  HOME_SPARSE_STARFIELD: '/game-art/test/home-twinkle.gif',
  HOME_ASTEROID_FIELD: '/game-art/test/home-asteroids.png',
  GAME_PARALLAX_BIG_PLANET: '/game-art/test/big-planet.png',
  GAME_PARALLAX_RING_PLANET: '/game-art/test/ring-planet.png',
  PLAYER_SHIP: '/game-art/test/researchhub-ship.png'
});

const fakeMotion = Object.freeze(Object.fromEntries(
  ['researchhub', 'bio', 'eth', 'btc'].map((shipId) => [shipId, {
    selectionIdleFrames: [
      `/game-art/test/${shipId}-idle-1.png`,
      `/game-art/test/${shipId}-idle-2.png`
    ]
  }])
));

const loadStartupModule = ({
  preloadImages,
  waitForBudget,
  loadFont
} = {}) => {
  const sourcePath = path.join(root, 'services', 'startupPreload.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: sourcePath
  }).outputText;
  const calls = {
    imagePreloads: 0,
    imageConcurrency: [],
    fontSpecs: [],
    budgetTimeouts: []
  };
  const preloadDecodedImageUrls = preloadImages ?? (async (urls, concurrency, onItemSettled) => {
    calls.imagePreloads += 1;
    calls.imageConcurrency.push(concurrency);
    urls.forEach((url) => onItemSettled?.(url, 'loaded'));
  });
  const waitForGameplayAssetPreload = waitForBudget ?? (async (preload, options) => {
    calls.budgetTimeouts.push(options.timeoutMs);
    await preload;
    return 'ready';
  });
  const fontLoader = loadFont ?? (async () => []);
  const module = { exports: {} };
  const requireStub = (specifier) => {
    if (specifier === '../constants') return { ASSETS: fakeAssets };
    if (specifier === './playerShipMotion') return { PLAYER_SHIP_MOTION: fakeMotion };
    if (specifier === './browserImagePreload') return { preloadDecodedImageUrls };
    if (specifier === './gameplayAssetPreloadBudget') return { waitForGameplayAssetPreload };
    throw new Error(`Unexpected startup preload import: ${specifier}`);
  };
  const context = {
    module,
    exports: module.exports,
    require: requireStub,
    document: {
      fonts: {
        load: async (fontSpec) => {
          calls.fontSpecs.push(fontSpec);
          return fontLoader(fontSpec);
        }
      }
    }
  };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    context
  );
  return { service: module.exports, calls };
};

test('pre-JS HTML presents an accessible bottom loading bar before React mounts', () => {
  const document = read('index.html');
  const rootStart = document.indexOf('<div id="root">');
  const moduleStart = document.indexOf('<script type="module" src="/index.tsx"></script>');

  assert.ok(rootStart >= 0 && moduleStart > rootStart);
  assert.match(document, /class="sci-boot-shell"/);
  assert.match(document, /aria-label="Loading Scicon Shooter"/);
  assert.match(document, /class="sci-boot-shell__status"/);
  assert.match(document, /role="progressbar"/);
  assert.match(document, /aria-valuenow="5"/);
  assert.match(document, /\.sci-boot-shell__status\s*\{[\s\S]*?margin: 0 auto/);
  assert.match(document, /\.sci-boot-shell__progress-fill\s*\{[\s\S]*?width: 5%/);
});

test('startup manifest is limited to fonts and critical Home shell art', () => {
  const service = read('services', 'startupPreload.ts');
  const browserPreload = read('services', 'browserImagePreload.ts');
  const literalArtPaths = [...service.matchAll(/'(\/game-art\/[^']+)'/g)]
    .map((match) => match[1]);

  assert.match(service, /STARTUP_PRELOAD_BUDGET_MS = 6_000/);
  assert.match(service, /STARTUP_FONT_SPECS[\s\S]*400 1em Inter[\s\S]*900 1em Orbitron/);
  assert.match(service, /STARTUP_HOME_SHELL_IMAGE_URLS/);
  assert.match(service, /PLAYER_SHIP_MOTION\[selectedShipId\]\.selectionIdleFrames/);
  assert.doesNotMatch(service, /preloadPlayerShipCarouselFrames|preloadGameplayAssets|PIXI_GAMEPLAY|\bfetch\(|getLeaderboard|WalletRuntime/);
  assert.match(browserPreload, /onItemSettled\?: DecodedImagePreloadItemListener/);
  assert.match(browserPreload, /notifyItemSettled\(url, 'loaded'\)/);
  assert.match(browserPreload, /notifyItemSettled\(url, 'failed'\)/);

  literalArtPaths.forEach((publicUrl) => {
    assert.equal(
      fs.existsSync(path.join(root, 'public', publicUrl.replace(/^\//, ''))),
      true,
      `${publicUrl} should exist`
    );
  });
});

test('startup progress advances from settled items monotonically and reaches ready', async () => {
  const { service, calls } = loadStartupModule();
  const snapshots = [];
  const result = await service.preloadStartupAssets({
    selectedShipId: 'bio',
    onProgress: (snapshot) => snapshots.push({ ...snapshot })
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.failedItems.length, 0);
  assert.equal(calls.imagePreloads, 1);
  assert.deepEqual(calls.imageConcurrency, [4]);
  assert.deepEqual(calls.fontSpecs, ['400 1em Inter', '900 1em Orbitron']);
  assert.deepEqual(calls.budgetTimeouts, [6_000]);
  assert.equal(snapshots[0].progress, 5);
  assert.equal(snapshots.at(-1).progress, 100);
  assert.equal(snapshots.at(-1).status, 'ready');
  assert.ok(new Set(snapshots.map((snapshot) => snapshot.progress)).size > 4);
  snapshots.slice(1).forEach((snapshot, index) => {
    assert.ok(snapshot.progress >= snapshots[index].progress);
    assert.ok(snapshot.completedItems >= snapshots[index].completedItems);
  });

  const selectedUrls = Array.from(service.getStartupCriticalImageUrls('bio'));
  assert.ok(selectedUrls.includes('/game-art/test/bio-idle-1.png'));
  assert.equal(selectedUrls.includes('/game-art/test/eth-idle-1.png'), false);
});

test('StrictMode-style duplicate calls share one preload promise', async () => {
  let releaseImages;
  let imageCalls = 0;
  const { service } = loadStartupModule({
    preloadImages: (urls, _concurrency, onItemSettled) => {
      imageCalls += 1;
      return new Promise((resolve) => {
        releaseImages = () => {
          urls.forEach((url) => onItemSettled?.(url, 'loaded'));
          resolve();
        };
      });
    }
  });

  const first = service.preloadStartupAssets({ selectedShipId: 'researchhub' });
  const second = service.preloadStartupAssets({ selectedShipId: 'researchhub' });
  assert.strictEqual(first, second);
  assert.equal(imageCalls, 1);

  releaseImages();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 'ready');
  assert.strictEqual(firstResult, secondResult);
});

test('startup timeout and individual failures resolve without blocking', async () => {
  let observedTimeout = null;
  const timedOut = loadStartupModule({
    preloadImages: () => new Promise(() => undefined),
    waitForBudget: async (_preload, options) => {
      observedTimeout = options.timeoutMs;
      return 'timed-out';
    }
  }).service;
  const timeoutResult = await timedOut.preloadStartupAssets();
  assert.equal(observedTimeout, 6_000);
  assert.equal(timeoutResult.status, 'timed-out');
  assert.equal(timedOut.getStartupPreloadSnapshot().status, 'timed-out');
  assert.ok(timedOut.getStartupPreloadSnapshot().progress < 100);

  const failed = loadStartupModule({
    preloadImages: async (urls, _concurrency, onItemSettled) => {
      urls.forEach((url, index) => onItemSettled?.(url, index === 0 ? 'failed' : 'loaded'));
      throw new Error('one optional image failed');
    },
    loadFont: async (fontSpec) => {
      if (fontSpec.includes('Orbitron')) throw new Error('font unavailable');
      return [];
    }
  }).service;
  const failureResult = await failed.preloadStartupAssets();
  assert.equal(failureResult.status, 'ready');
  assert.equal(failureResult.failedItems.length, 2);
  assert.equal(failed.getStartupPreloadSnapshot().progress, 100);
});
