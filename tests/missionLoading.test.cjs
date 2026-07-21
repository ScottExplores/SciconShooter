const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('mission launch waits for one cached production readiness pipeline', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

  assert.match(app, /let gameplayPreloadPromise: Promise<void> \| null = null/);
  assert.match(app, /if \(gameplayPreloadReady\) return Promise\.resolve\(\)/);
  assert.match(app, /if \(gameplayPreloadPromise\) return gameplayPreloadPromise/);
  assert.match(app, /await gameplay\.preloadGameplayAssets\(\)/);
  assert.match(app, /await preloadGameplayComponents\(\(progress, phase\) =>/);
  assert.match(app, /const shouldShowMissionLoading = !gameplayPreloadReady \|\| missionLoading\?\.phase === 'error'/);
  assert.match(app, /void preloadGameplayComponents\(\)\.catch/);
  assert.doesNotMatch(app, /setTimeout\([^)]*gameplayPreloadProgress/);
});

test('mission launch remains locked until the first successful Pixi synchronization', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const component = fs.readFileSync(path.join(root, 'components', 'MissionLoadingScreen.tsx'), 'utf8');
  const startIndex = app.indexOf('const startGame = async');
  const readyIndex = app.indexOf('const completeMissionRuntimeLaunch');
  const failureIndex = app.indexOf('const failMissionRuntimeLaunch');
  const resetIndex = app.indexOf('const resetGame');
  const startFlow = app.slice(startIndex, readyIndex);
  const readyFlow = app.slice(readyIndex, failureIndex);
  const failureFlow = app.slice(failureIndex, resetIndex);

  assert.ok(startIndex >= 0 && readyIndex > startIndex && failureIndex > readyIndex);
  assert.match(startFlow, /phase: 'runtime-sync'/);
  assert.match(startFlow, /pendingMissionRuntimeRef\.current = \{/);
  assert.match(startFlow, /setGameRuntimeReady\(false\)/);
  assert.match(startFlow, /setGameId\(nextGameId\)/);
  assert.doesNotMatch(startFlow, /window\.setTimeout/);
  assert.match(readyFlow, /setGameRuntimeReady\(true\)/);
  assert.match(readyFlow, /window\.setTimeout/);
  assert.match(readyFlow, /beginRunSession/);
  assert.match(failureFlow, /phase: 'error'/);
  assert.match(failureFlow, /pendingMissionRuntimeRef\.current = null/);
  assert.match(app, /running: gameState === GameState\.PLAYING && gameRuntimeReady && !ownerFrameFrozen/);
  assert.match(app, /onReady: \(\) => completeMissionRuntimeLaunch\(gameId\)/);
  assert.match(app, /onInitializationError: \(error\) => failMissionRuntimeLaunch\(gameId, error\)/);
  assert.match(app, /hud=\{gameRuntimeReady &&/);
  assert.match(component, /'runtime-sync'/);
  assert.match(component, /Synchronizing flight renderer/);
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
  assert.match(component, /Only mission-ready systems are being staged/);
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
