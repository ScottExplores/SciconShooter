const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

const loadTypeScriptModule = (...segments) => {
  const filePath = path.join(root, ...segments);
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    },
    fileName: filePath
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require }
  );
  return module.exports;
};

test('app defers one cached production readiness pipeline until proposal data settles and the browser is idle', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(app, /let gameplayPreloadPromise: Promise<void> \| null = null/);
  assert.match(app, /if \(gameplayPreloadReady\) return Promise\.resolve\(\)/);
  assert.match(app, /if \(gameplayPreloadPromise\) return gameplayPreloadPromise/);
  assert.match(app, /await gameplay\.preloadGameplayAssets\(\)/);
  assert.match(app, /if \(proposalStatus === 'loading' \|\| gameplayPreloadReady \|\| gameplayPreloadPromise\)/);
  assert.match(app, /return runAfterFirstPaint\(\(\) => \{\s*void preloadGameplayComponents\(\)\.catch\(\(\) => undefined\)/);
  assert.match(app, /delayMs: 1_200,[\s\S]*timeoutMs: 5_000/);
  assert.match(app, /void preloadGameplayComponents\(\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(app, /startupLoading|beginStartupPreload|context="startup"/);
  assert.match(app, /if \(missionLaunchPendingRef\.current\) return/);
  assert.doesNotMatch(app, /missionLaunchPendingRef\.current \|\| !gameplayPreloadReady/);
  assert.match(app, /const shouldShowMissionLoading = !gameplayPreloadReady/);
  assert.doesNotMatch(app, /setTimeout\([^)]*gameplayPreloadProgress/);
});

test('mission launch joins a pending preload with progress, then locks simulation until Pixi synchronizes', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const component = fs.readFileSync(path.join(root, 'components', 'MissionLoadingScreen.tsx'), 'utf8');
  const startIndex = app.indexOf('const launchGame = async');
  const readyIndex = app.indexOf('const completeMissionRuntimeLaunch');
  const failureIndex = app.indexOf('const failMissionRuntimeLaunch');
  const resetIndex = app.indexOf('const resetGame = () =>');
  const startFlow = app.slice(startIndex, readyIndex);
  const readyFlow = app.slice(readyIndex, failureIndex);
  const failureFlow = app.slice(failureIndex, resetIndex);

  assert.ok(startIndex >= 0 && readyIndex > startIndex && failureIndex > readyIndex);
  assert.match(startFlow, /if \(shouldShowMissionLoading\) \{[\s\S]*setMissionLoading\(\{/);
  assert.match(startFlow, /await preloadGameplayComponents\(shouldShowMissionLoading[\s\S]*\(progress, phase\) =>/);
  assert.match(startFlow, /Gameplay preload failed\.[\s\S]*recoverFromModulePreloadFailure\(error\)/);
  assert.match(startFlow, /void audioService\.prepare\(\)\.catch/);
  assert.doesNotMatch(startFlow, /prepareMusicScene|setMusicScene|launchMusicScene/);
  assert.doesNotMatch(
    startFlow,
    /await Promise\.all\(\[[\s\S]*audioService\.(?:prepare|prepareMusicScene)/
  );
  assert.match(startFlow, /catch \(error\) \{\s*console\.error\('Gameplay preload failed\.', error\);\s*if \(recoverFromModulePreloadFailure\(error\)\) return;\s*audioService\.playUiSound\('error'\)/);
  assert.match(startFlow, /setMissionLoading\(\{[\s\S]*progress,[\s\S]*phase,[\s\S]*tip: loadingTip/);
  assert.match(startFlow, /pendingMissionRuntimeRef\.current = \{/);
  assert.match(startFlow, /setGameRuntimeReady\(false\)/);
  assert.match(startFlow, /setGameId\(nextGameId\)/);
  assert.doesNotMatch(startFlow, /phase: 'runtime-sync'/);
  assert.doesNotMatch(startFlow, /window\.setTimeout/);
  assert.match(readyFlow, /setGameRuntimeReady\(true\)/);
  assert.match(readyFlow, /window\.setTimeout/);
  assert.match(readyFlow, /beginRunSession/);
  assert.match(failureFlow, /phase: 'error'/);
  assert.match(failureFlow, /pendingMissionRuntimeRef\.current = null/);
  assert.match(app, /running:\s*gameState === GameState\.PLAYING\s*&&\s*gameRuntimeReady\s*&&\s*!ownerFrameFrozen\s*&&\s*!onboardingGameplayFreeze/);
  assert.match(app, /onReady: \(\) => completeMissionRuntimeLaunch\(gameId\)/);
  assert.match(app, /onInitializationError: \(error\) => failMissionRuntimeLaunch\(gameId, error\)/);
  assert.match(app, /hud=\{gameRuntimeReady &&/);
  assert.match(component, /context\?: 'startup' \| 'mission'/);
  assert.match(component, /Loading Scicon Shooter/);
});

test('mission launch reserves and validates one token before wallet authorization can race Map navigation', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const startIndex = app.indexOf('const launchGame = async');
  const runModeIndex = app.indexOf('const runMode: ActiveRunMode', startIndex);
  const authorizationFlow = app.slice(startIndex, runModeIndex);

  assert.match(authorizationFlow, /if \(missionLaunchPendingRef\.current\) return;\s*const launchNonce = missionLaunchNonceRef\.current \+ 1;\s*missionLaunchNonceRef\.current = launchNonce;\s*missionLaunchPendingRef\.current = true/);
  assert.match(authorizationFlow, /const started = await startTask;\s*if \(missionLaunchNonceRef\.current !== launchNonce\) return;\s*serverChallengeRun = started\.run/);
  assert.match(authorizationFlow, /serverBranchAttempt = await startTask;\s*if \(missionLaunchNonceRef\.current !== launchNonce\) return;/);
  assert.match(app, /if \(gameStateRef\.current !== GameState\.MENU \|\| missionLaunchPendingRef\.current\) resetGame\(\)/);
  assert.match(app, /missionLaunchNonceRef\.current \+= 1;\s*missionLaunchPendingRef\.current = false/);
});

test('loading presentation uses generated Scicon art and an accessible real progress bar', () => {
  const component = fs.readFileSync(path.join(root, 'components', 'MissionLoadingScreen.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'components', 'mission-loading-screen.css'), 'utf8');
  const document = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(component, /scicon-mission-loading-v1\/loading-background\.png/);
  assert.match(component, /scicon-mission-loading-v1\/loading-emblem\.png/);
  assert.match(component, /scicon-mission-loading-v1\/loading-bar-frame\.png/);
  assert.match(component, /role="progressbar"/);
  assert.match(component, /aria-valuenow=\{safeProgress\}/);
  assert.match(component, /Loading only the systems needed for play/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(document, /rel="preload" href="\/game-art\/generated\/ui\/scicon-mission-loading-v1\/loading-emblem\.png" as="image" fetchpriority="high"/);
  assert.match(document, /rel="preload" href="\/game-art\/generated\/ui\/scicon-mission-loading-v1\/loading-background\.png" as="image" fetchpriority="high"/);

  for (const asset of ['loading-background.png', 'loading-emblem.png', 'loading-bar-frame.png']) {
    const assetPath = path.join(
      root,
      'public',
      'game-art',
      'generated',
      'ui',
      'scicon-mission-loading-v1',
      asset
    );
    const png = fs.readFileSync(assetPath);
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.ok(png.readUInt32BE(16) > 0);
    assert.ok(png.readUInt32BE(20) > 0);
  }
});

test('loading screen includes multiple randomized gameplay tips and recovery controls', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const component = fs.readFileSync(path.join(root, 'components', 'MissionLoadingScreen.tsx'), 'utf8');
  const resetFlow = app.slice(app.indexOf('const resetGame'), app.indexOf('const openSquadHangar'));

  assert.match(app, /const MISSION_LOADING_TIPS = \[/);
  assert.match(app, /Math\.floor\(Math\.random\(\) \* MISSION_LOADING_TIPS\.length\)/);
  assert.match(component, />Retry link</);
  assert.match(component, />Return to command</);
  assert.match(component, />\s*Cancel launch\s*</);
  assert.match(app, /missionLaunchNonceRef\.current \+= 1/);
  assert.match(app, /const cancelMissionLoading = \(\) => \{\s*resetGame\(\)/);
  assert.match(resetFlow, /pendingMissionRuntimeRef\.current = null/);
  assert.match(resetFlow, /setGameState\(GameState\.MENU\)/);
});

test('optional gameplay art has a bounded launch wait while continuing to warm', async () => {
  const {
    GAMEPLAY_ASSET_PRELOAD_BUDGET_MS,
    waitForGameplayAssetPreload
  } = loadTypeScriptModule('services', 'gameplayAssetPreloadBudget.ts');
  assert.equal(GAMEPLAY_ASSET_PRELOAD_BUDGET_MS, 6_000);

  let release;
  let underlyingSettled = false;
  const underlying = new Promise((resolve) => {
    release = resolve;
  }).then(() => {
    underlyingSettled = true;
  });
  const scheduled = [];
  const cancelled = [];
  const bounded = waitForGameplayAssetPreload(underlying, {
    timeoutMs: 321,
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return 77;
    },
    cancel: (handle) => cancelled.push(handle)
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 321);
  scheduled[0].callback();
  assert.equal(await bounded, 'timed-out');
  assert.deepEqual(cancelled, [77]);
  assert.equal(underlyingSettled, false);

  release();
  await underlying;
  assert.equal(underlyingSettled, true);
});

test('gameplay art budget clears its timer and preserves success or early failure', async () => {
  const {
    waitForGameplayAssetPreload
  } = loadTypeScriptModule('services', 'gameplayAssetPreloadBudget.ts');

  const readyCancelled = [];
  assert.equal(
    await waitForGameplayAssetPreload(Promise.resolve(), {
      schedule: () => 11,
      cancel: (handle) => readyCancelled.push(handle)
    }),
    'ready'
  );
  assert.deepEqual(readyCancelled, [11]);

  const rejectedCancelled = [];
  await assert.rejects(
    waitForGameplayAssetPreload(Promise.reject(new Error('asset failure')), {
      schedule: () => 12,
      cancel: (handle) => rejectedCancelled.push(handle)
    }),
    /asset failure/
  );
  assert.deepEqual(rejectedCancelled, [12]);
});

test('gameplay art queue limits concurrent decoders and settles individual failures', async () => {
  const {
    GAMEPLAY_ASSET_PRELOAD_CONCURRENCY,
    runGameplayAssetPreloadQueue
  } = loadTypeScriptModule('services', 'gameplayAssetPreloadBudget.ts');
  assert.equal(GAMEPLAY_ASSET_PRELOAD_CONCURRENCY, 8);

  let active = 0;
  let maximumActive = 0;
  const loaded = [];
  await runGameplayAssetPreloadQueue(
    Array.from({ length: 11 }, (_, index) => index),
    async (item) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active--;
      loaded.push(item);
      if (item === 4) throw new Error('optional texture failure');
    },
    3
  );

  assert.equal(maximumActive, 3);
  assert.deepEqual(loaded.slice().sort((left, right) => left - right), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('mission startup waits only for first-frame Pixi art and bounds every optional warmup', () => {
  const canvas = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
  const renderer = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiGameRenderer.ts'),
    'utf8'
  );
  const textureBank = fs.readFileSync(
    path.join(root, 'services', 'pixi', 'PixiTextureBank.ts'),
    'utf8'
  );
  const startupCatalog = renderer.slice(
    renderer.indexOf('export const PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS'),
    renderer.indexOf('export const PIXI_GAMEPLAY_TEXTURE_URLS')
  );

  assert.match(canvas, /waitForGameplayAssetPreload\(productionAssetWarmup\)/);
  assert.match(canvas, /startupTextureUrls: \[[\s\S]*squadLoadout\?\.companions[\s\S]*companion\.frames/);
  assert.match(renderer, /export const PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS = Object\.freeze\(\[/);
  assert.match(renderer, /export const PIXI_GAMEPLAY_TEXTURE_URLS = Object\.freeze\(\[[\s\S]*\.\.\.PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS/);
  assert.match(renderer, /new Set\(PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS\.filter\(Boolean\)\)/);
  assert.match(renderer, /selectedRuntimeTextureUrls = this\.startupTextureUrls\.flatMap/);
  assert.match(renderer, /Object\.values\(motion\.steeringFrames\)/);
  assert.match(renderer, /\.\.\.PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS,[\s\S]*\.\.\.selectedRuntimeTextureUrls/);
  assert.doesNotMatch(renderer, /this\.textureBank\.preload\(\[\.\.\.PIXI_GAMEPLAY_TEXTURE_URLS\]\)/);
  assert.match(renderer, /if \(startupStatus === 'timed-out'\)[\s\S]*this\.bindStartupTextures\(\)/);
  assert.match(renderer, /runGameplayAssetPreloadQueue\(urls, async \(url\)/);
  assert.match(textureBank, /runGameplayAssetPreloadQueue\([\s\S]*\(url\) => this\.load\(url\)/);
  assert.match(textureBank, /waitForGameplayAssetPreload\(warmup\)/);
  [
    'ORBIT_SCOUT',
    'CITATION_DART',
    'RESEARCH_SENTRY',
    'PEER_BULWARK',
    'JOURNAL_RAIDER',
    'HELIX_CONDUCTOR',
    'PRISM_ARTILLERY'
  ].forEach((family) => {
    assert.match(startupCatalog, new RegExp(`\\.\\.\\.ASSETS\\.SCICON_ENEMY_${family}_FRAMES`));
  });
  assert.doesNotMatch(startupCatalog, /LEGACY_ENEMY|PIXI_JET_(?:SCOUT|INTERCEPTOR|HEAVY)_FRAMES/);
  assert.doesNotMatch(startupCatalog, /PLAYER_SHIP_STEERING_FRAME_URLS/);
  assert.doesNotMatch(startupCatalog, /PIXI_ENVIRONMENT_TEXTURE_URLS/);
  assert.doesNotMatch(startupCatalog, /PIXI_BOSS_(?:OPEN_ORBIT|CITATION|PAYWALL|OPEN_GALAXY|CROWNCLAW)_FRAMES/);
  assert.doesNotMatch(startupCatalog, /MINI_SHIP_CATALOG/);
});
