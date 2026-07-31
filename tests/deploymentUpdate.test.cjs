const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

const loadUpdateService = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'deploymentUpdateService.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    Date,
    window: {
      location: {
        href: 'https://sciconshooter.xyz/?view=trophies',
        origin: 'https://sciconshooter.xyz'
      }
    }
  };
  context.exports = context.module.exports;
  vm.runInNewContext(compiled, context);
  return context.module.exports;
};

test('deployment update checks compare hashed entry assets with cache bypassing', async () => {
  const service = loadUpdateService();
  const fetchCalls = [];
  const documentRef = {
    querySelector: () => ({ src: 'https://sciconshooter.xyz/assets/index-old123.js' })
  };
  const fetchImpl = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      text: async () => '<script type="module" crossorigin src="/assets/index-new456.js"></script>'
    };
  };

  const update = await service.checkForDeploymentUpdate(
    fetchImpl,
    documentRef,
    {
      href: 'https://sciconshooter.xyz/?view=trophies',
      origin: 'https://sciconshooter.xyz'
    }
  );

  assert.equal(update, '/assets/index-new456.js');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.cache, 'no-store');
  assert.equal(fetchCalls[0].options.headers['Cache-Control'], 'no-cache');
  assert.match(fetchCalls[0].url, /__scicon_update_check=/);
});

test('deployment update checks ignore matching builds and cache-bust a confirmed reload', async () => {
  const service = loadUpdateService();
  const documentRef = {
    querySelector: () => ({ src: 'https://sciconshooter.xyz/assets/index-same.js' })
  };
  const update = await service.checkForDeploymentUpdate(
    async () => ({
      ok: true,
      text: async () => '<script type="module" src="/assets/index-same.js"></script>'
    }),
    documentRef,
    {
      href: 'https://sciconshooter.xyz/',
      origin: 'https://sciconshooter.xyz'
    }
  );
  let replacedUrl = '';

  service.reloadForDeploymentUpdate('/assets/index-new.js', {
    href: 'https://sciconshooter.xyz/?view=hangar',
    replace: (url) => { replacedUrl = url; }
  });

  assert.equal(update, null);
  assert.match(replacedUrl, /view=hangar/);
  assert.match(replacedUrl, /__scicon_build=index-new\.js/);
});

test('the app refreshes new deployments only at a safe menu boundary', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const rootHeaders = vercel.headers.find((entry) => entry.source === '/');

  assert.match(app, /checkForDeploymentUpdate/);
  assert.match(app, /gameStateRef\.current === GameState\.MENU/);
  assert.match(app, /pendingDeploymentEntryRef\.current = entryAsset/);
  assert.match(app, /window\.addEventListener\('pageshow', handlePageShow\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', handleVisibilityChange\)/);
  assert.equal(
    rootHeaders.headers.find((header) => header.key === 'Cache-Control').value,
    'public, max-age=0, must-revalidate'
  );
});

test('a stale dynamic gameplay chunk gets one cache-busted recovery without a reload loop', () => {
  const service = loadUpdateService();
  const stored = new Map();
  const replaced = [];
  const locationRef = {
    href: 'https://sciconshooter.xyz/?view=home',
    replace: (url) => { replaced.push(url); }
  };
  const storageRef = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };
  const failure = new TypeError(
    'Failed to fetch dynamically imported module: https://sciconshooter.xyz/assets/GameStage-old.js'
  );

  assert.equal(service.recoverFromModulePreloadFailure(
    failure,
    { locationRef, storageRef, now: 100_000 }
  ), true);
  assert.equal(replaced.length, 1);
  assert.match(replaced[0], /view=home/);
  assert.match(replaced[0], /__scicon_module_retry=100000/);

  assert.equal(service.recoverFromModulePreloadFailure(
    failure,
    { locationRef, storageRef, now: 100_500 }
  ), false);
  assert.equal(replaced.length, 1);
  assert.equal(service.recoverFromModulePreloadFailure(
    new Error('Network request failed'),
    { locationRef, storageRef, now: 200_000 }
  ), false);
});

test('Vite preload errors and mission launch failures share the guarded recovery path', () => {
  const entry = fs.readFileSync(path.join(root, 'index.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(entry, /window\.addEventListener\('vite:preloadError'/);
  assert.match(entry, /recoverFromModulePreloadFailure\(event\.payload\)/);
  assert.match(entry, /event\.preventDefault\(\)/);
  const launchFailureIndex = app.indexOf("console.error('Gameplay preload failed.', error)");
  assert.match(
    app.slice(launchFailureIndex, launchFailureIndex + 500),
    /recoverFromModulePreloadFailure\(error\)/
  );
});
