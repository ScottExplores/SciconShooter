const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

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
  assert.match(startFlow, /await Promise\.all\(\[\s*preloadGameplayComponents\(shouldShowMissionLoading[\s\S]*\(progress, phase\) =>/);
  assert.match(startFlow, /audioService\.prepare\(\)/);
  assert.match(startFlow, /audioService\.prepareMusicScene\('mission'\)/);
  assert.match(startFlow, /catch \(error\) \{\s*console\.error\('Gameplay preload failed\.', error\);\s*audioService\.playUiSound\('error'\)/);
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
  assert.match(app, /running: gameState === GameState\.PLAYING && gameRuntimeReady && !ownerFrameFrozen/);
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
