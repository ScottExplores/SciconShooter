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
    { module, require, setTimeout, clearTimeout }
  );
  return module.exports;
};

test('app presents bounded startup loading while deferring the heavier gameplay warmup', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(app, /let gameplayPreloadPromise: Promise<void> \| null = null/);
  assert.match(app, /if \(gameplayPreloadReady\) return Promise\.resolve\(\)/);
  assert.match(app, /if \(gameplayPreloadPromise\) return gameplayPreloadPromise/);
  assert.match(app, /await gameplay\.preloadGameplayAssets\(\)/);
  assert.match(app, /if \(proposalStatus === 'loading' \|\| gameplayPreloadReady \|\| gameplayPreloadPromise\)/);
  assert.match(app, /return runAfterFirstPaint\(\(\) => \{\s*void preloadGameplayComponents\(\)\.catch\(\(\) => undefined\)/);
  assert.match(app, /delayMs: 1_200,[\s\S]*timeoutMs: 5_000/);
  assert.match(app, /void preloadGameplayComponents\(\)\.catch\(\(\) => undefined\)/);
  assert.match(app, /const \[startupLoading, setStartupLoading\]/);
  assert.match(app, /preloadStartupAssets\(\{/);
  assert.match(app, /STARTUP_LOADING_MINIMUM_MS/);
  assert.match(app, /context="startup"/);
  assert.match(app, /\{walletRuntimeEnabled \? \(/);
  assert.doesNotMatch(app, /walletRuntimeEnabled && !startupLoading/);
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
  assert.doesNotMatch(startFlow, /audioService\.prepare\(\)/);
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
  assert.match(startFlow, /phase: 'runtime-sync'/);
  assert.doesNotMatch(startFlow, /window\.setTimeout/);
  assert.match(readyFlow, /setGameRuntimeReady\(true\)/);
  assert.match(readyFlow, /window\.setTimeout/);
  assert.match(readyFlow, /beginRunSession/);
  assert.match(failureFlow, /phase: 'error'/);
  assert.match(failureFlow, /pendingMissionRuntimeRef\.current = null/);
  // A stale chunk failing inside the renderer's dynamic import takes the same
  // one-shot cache-busting reload as a preload failure, before any state reset.
  assert.match(
    failureFlow,
    /console\.error\('Gameplay runtime launch failed\.', error\);[\s\S]*?if \(recoverFromModulePreloadFailure\(error\)\) return;[\s\S]*?recordPlayerReportBreadcrumb\('runtime_failed'/
  );
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

  assert.match(authorizationFlow, /if \(missionLaunchPendingRef\.current\) return;\s*deploymentReloadSafeRef\.current = false;\s*const launchNonce = missionLaunchNonceRef\.current \+ 1;\s*missionLaunchNonceRef\.current = launchNonce;\s*missionLaunchPendingRef\.current = true/);
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
  assert.match(component, /Loading command deck/);
  assert.match(component, /Decoding ship and menu art/);
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

test('required gameplay art rejects a stalled request instead of falsely reporting ready', async () => {
  const {
    REQUIRED_GAMEPLAY_ASSET_PRELOAD_DEADLINE_MS,
    waitForRequiredGameplayAssetPreload
  } = loadTypeScriptModule('services', 'gameplayAssetPreloadBudget.ts');
  assert.equal(REQUIRED_GAMEPLAY_ASSET_PRELOAD_DEADLINE_MS, 45_000);

  const scheduled = [];
  const stalled = new Promise(() => undefined);
  const required = waitForRequiredGameplayAssetPreload(stalled, {
    timeoutMs: 654,
    schedule: (callback, delayMs) => {
      scheduled.push({ callback, delayMs });
      return 91;
    }
  });

  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delayMs, 654);
  scheduled[0].callback();
  await assert.rejects(required, {
    name: 'GameplayAssetPreloadTimeoutError',
    message: /654ms/
  });
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

test('required gameplay art stays bounded but propagates a missing launch texture', async () => {
  const {
    runRequiredGameplayAssetPreloadQueue
  } = loadTypeScriptModule('services', 'gameplayAssetPreloadBudget.ts');
  let active = 0;
  let maximumActive = 0;

  await assert.rejects(
    runRequiredGameplayAssetPreloadQueue(
      [0, 1, 2, 3, 4],
      async (item) => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setImmediate(resolve));
        active--;
        if (item === 3) throw new Error('critical texture missing');
      },
      2
    ),
    /critical texture missing/
  );
  assert.equal(maximumActive, 2);
});

test('mission loading strictly warms critical and selected-mission art without flooding the full catalog', () => {
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

  assert.match(canvas, /await preloadPixiGameplayTextures\(\)/);
  assert.doesNotMatch(canvas, /waitForGameplayAssetPreload\(productionAssetWarmup\)/);
  assert.match(canvas, /startupTextureUrls: \[[\s\S]*squadLoadout\?\.companions[\s\S]*companion\.frames/);
  assert.match(canvas, /collectCampaignTextureWindow\(/);
  assert.match(renderer, /export const PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS = Object\.freeze\(\[/);
  assert.match(renderer, /export const PIXI_GAMEPLAY_TEXTURE_URLS = Object\.freeze\(\[[\s\S]*\.\.\.PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS/);
  assert.match(renderer, /new Set\(PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS\.filter\(Boolean\)\)/);
  assert.match(startupCatalog, /\.\.\.ASSETS\.RSC_TOKEN_FLIP_FRAMES/);
  assert.match(renderer, /selectedRuntimeTextureUrls = this\.startupTextureUrls\.flatMap/);
  assert.match(renderer, /Object\.values\(motion\.steeringFrames\)/);
  assert.match(renderer, /\.\.\.PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS,[\s\S]*\.\.\.selectedRuntimeTextureUrls/);
  assert.doesNotMatch(renderer, /this\.textureBank\.preload\(\[\.\.\.PIXI_GAMEPLAY_TEXTURE_URLS\]\)/);
  assert.match(renderer, /await this\.textureBank\.preloadRequired\(startupTextureUrls\)/);
  assert.doesNotMatch(renderer, /startupStatus === 'timed-out'/);
  assert.match(renderer, /runRequiredGameplayAssetPreloadQueue\(urls, async \(url\)/);
  assert.match(renderer, /view\.textureKey === key[\s\S]*?else \{[\s\S]*?view\.sprite\.visible = false/);
  assert.match(renderer, /entity\.type === EntityType\.COIN[\s\S]*?view\.body\.clear\(\)[\s\S]*?return/);
  assert.match(textureBank, /runGameplayAssetPreloadQueue\([\s\S]*\(url\) => this\.load\(url\)/);
  assert.match(textureBank, /waitForGameplayAssetPreload\(warmup\)/);
  assert.match(textureBank, /runRequiredGameplayAssetPreloadQueue/);
  [
    'ENEMY_DRONE_FRAMES',
    'LEGACY_ENEMY_DRONE_FRAMES',
    'ENEMY_SWARM_FRAMES',
    'ENEMY_BRICK_FRAMES',
    'ENEMY_JOURNAL_FRAMES',
    'SCICON_ENEMY_REDLINE_SKIRMISHER_FRAMES',
    'SCICON_ENEMY_CROSSCUT_RAIDER_FRAMES',
    'SCICON_ENEMY_AUDIT_BULWARK_FRAMES',
    'SCICON_ENEMY_QUASAR_LANCER_V2_FRAMES',
    'SCICON_ENEMY_VECTOR_REAVER_V2_FRAMES'
  ].forEach((family) => {
    assert.match(startupCatalog, new RegExp(`\\.\\.\\.ASSETS\\.${family}`));
  });
  [
    'PIXI_JET_SCOUT_FRAMES',
    'PIXI_JET_INTERCEPTOR_FRAMES',
    'PIXI_JET_HEAVY_FRAMES'
  ].forEach((retiredFamily) => {
    assert.doesNotMatch(startupCatalog, new RegExp(`\\.\\.\\.ASSETS\\.${retiredFamily}`));
  });
  assert.doesNotMatch(startupCatalog, /PLAYER_SHIP_STEERING_FRAME_URLS/);
  assert.doesNotMatch(startupCatalog, /PIXI_ENVIRONMENT_TEXTURE_URLS/);
  assert.doesNotMatch(startupCatalog, /PIXI_BOSS_(?:OPEN_ORBIT|CITATION|PAYWALL|OPEN_GALAXY|CROWNCLAW)_FRAMES/);
  assert.doesNotMatch(startupCatalog, /MINI_SHIP_CATALOG/);
});
