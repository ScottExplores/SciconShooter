// REVAMP(G): Reconcile intended contracts documented in REVAMP_NOTES_D.md and REVAMP_NOTES_E.md.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const sliceRequired = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing start marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return source.slice(start, end);
};

test('wallet hydration cannot replace the immutable loadout of a mounted flight', () => {
  const app = read('App.tsx');
  const canvas = read('components', 'GameCanvas.tsx');
  const hydration = sliceRequired(
    app,
    '  const hydrateActiveProfile = useCallback',
    '  const applyAuthoritativeHangarSpend = useCallback'
  );
  const launch = sliceRequired(
    app,
    '  const launchGame = async',
    '  const startGame = () =>'
  );

  assert.doesNotMatch(hydration, /activeRunSquadLoadoutRef\.current\s*=/);
  assert.match(launch, /const squadLoadout = runMode === 'weekly-streak'[\s\S]*\? buildWeeklyRankedLoadout\(campaignLabState\)[\s\S]*\(runMode === 'campaign' \|\| runMode === 'campaign-replay' \|\| \(QA_CONFIG\.enabled && runMode === 'campaign-lab'\)\) && !authorizedCampaignLabRequest[\s\S]*\? buildRevampCampaignLoadout\(campaignLabState, permanentSquadStateRef\.current, runShipId\)[\s\S]*: buildRuntimeSquadLoadout\(campaignLabState, runShipId\)/);
  assert.match(launch, /activeRunSquadLoadoutRef\.current = squadLoadout/);
  assert.ok(
    launch.indexOf('activeRunSquadLoadoutRef.current = squadLoadout')
      < launch.indexOf('setGameId(nextGameId)'),
    'the run snapshot must be frozen before the keyed GameStage mounts'
  );
  assert.match(app, /<GameStage\s+key=\{gameId\}/);
  assert.match(app, /squadLoadout: activeRunSquadLoadoutRef\.current/);
  assert.match(canvas, /const productionSessionDependencyRef = useRef\(\{\}\)/);
  assert.match(canvas, /setupCampaignDependency = previewMode[\s\S]{0,160}: productionSessionDependency/);
  assert.match(canvas, /const setup = runtimeSetupRef\.current/);
  assert.doesNotMatch(
    canvas,
    /const setupPlayerShipIdDependency = previewMode \? null : playerShipId/
  );
});

test('the mission loader remains visible while the selected Pixi runtime synchronizes', () => {
  const app = read('App.tsx');
  const launch = sliceRequired(
    app,
    '  const launchGame = async',
    '  const startGame = () =>'
  );

  assert.match(launch, /setMissionLoading\(\{\s*progress:\s*96,\s*phase:\s*'runtime-sync'/);
  assert.ok(
    launch.indexOf("phase: 'runtime-sync'") < launch.indexOf('setGameId(nextGameId)'),
    'the runtime loading cover must be installed before the Pixi tree mounts'
  );
  assert.match(app, /onReady: \(\) => completeMissionRuntimeLaunch\(gameId\)/);
  assert.match(app, /completeMissionRuntimeLaunch[\s\S]*setMissionLoading\(null\)/);
  assert.match(app, /waitForRequiredGameplayAssetPreload\(Promise\.all\(/);
  assert.match(app, /gameplayPreloadPromise = null/);
  assert.match(app, /const preloadAttempt = \+\+gameplayPreloadAttempt/);
});

test('critical gameplay art cannot time out as ready and the full catalog is not decoded during launch', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const textureBank = read('services', 'pixi', 'PixiTextureBank.ts');

  const preload = sliceRequired(
    canvas,
    'export const preloadGameplayAssets = async () =>',
    'const HUD_STATS_SYNC_INTERVAL_MS'
  );
  const globalPixiPreload = sliceRequired(
    renderer,
    'export const preloadPixiGameplayTextures = () =>',
    'const isEnemyType ='
  );
  const rendererInit = sliceRequired(
    renderer,
    '    const selectedRuntimeTextureUrls = this.startupTextureUrls.flatMap',
    '    this.initialized = true;'
  );

  assert.match(preload, /await preloadPixiGameplayTextures\(\)/);
  assert.doesNotMatch(preload, /waitForGameplayAssetPreload|preloadEngineGameplayAssets/);
  assert.match(globalPixiPreload, /PIXI_GAMEPLAY_STARTUP_TEXTURE_URLS/);
  assert.doesNotMatch(globalPixiPreload, /PIXI_GAMEPLAY_TEXTURE_URLS/);
  assert.match(globalPixiPreload, /runRequiredGameplayAssetPreloadQueue/);
  assert.match(rendererInit, /await this\.textureBank\.preloadRequired\(startupTextureUrls\)/);
  assert.doesNotMatch(rendererInit, /timed-out|runGameplayAssetPreloadQueue/);
  assert.match(textureBank, /preloadRequired\(urls: readonly string\[\]\)/);
  assert.match(textureBank, /runRequiredGameplayAssetPreloadQueue/);
});

test('preview arenas use a compact resilient startup pack while production remains strict', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const environment = read('services', 'pixi', 'PixiEnvironment.ts');
  const previewPack = sliceRequired(
    renderer,
    'export const PIXI_GAMEPLAY_PREVIEW_STARTUP_TEXTURE_URLS',
    'export const PIXI_GAMEPLAY_TEXTURE_URLS'
  );

  assert.match(
    canvas,
    /startupTexturePolicy:\s*previewMode\s*\?\s*'resilient-preview'\s*:\s*'required'/
  );
  assert.match(renderer, /startupTexturePolicy\?: 'required' \| 'resilient-preview'/);
  assert.match(
    renderer,
    /mobile && this\.startupTexturePolicy === 'resilient-preview'[\s\S]{0,100}\? 'low-power'[\s\S]{0,40}: 'high-performance'/
  );
  assert.match(renderer, /this\.startupTexturePolicy === 'required'[\s\S]{0,260}PIXI_GAMEPLAY_PREVIEW_STARTUP_TEXTURE_URLS/);
  assert.match(renderer, /await this\.textureBank\.preload\(startupTextureUrls\)/);
  assert.match(environment, /requiredTextures = true/);
  assert.match(environment, /this\.preloadProfileWindow\(profileWindow, requiredTextures\)/);
  assert.doesNotMatch(previewPack, /PLAYER_WEAPON_FRAME_URLS|SHIP_ABILITY_FRAME_URLS/);
});

test('the selected Mission and a short endless look-ahead form the runtime texture pack', () => {
  const manifest = read('services', 'gameplayAssetManifest.ts');
  const canvas = read('components', 'GameCanvas.tsx');

  assert.match(manifest, /hasOwnProperty\.call\(ASSET_CATALOG, value\)/);
  assert.match(manifest, /ASSET_CATALOG\[value as AssetKey\]/);
  assert.match(manifest, /value\.startsWith\('\/game-art\/'\)/);
  assert.match(manifest, /campaign\.levels\.slice\(startIndex, startIndex \+ levelCount\)/);
  assert.match(canvas, /continuousStageBoundaries \? 3 : 1/);
  assert.match(canvas, /preloadOptionalTextures\([\s\S]*continuousStageBoundaries \? 4 : 1/);
});

test('Pixi holds the last decoded frame while a later animation frame is loading', () => {
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const entityView = sliceRequired(renderer, 'type EntityView = {', 'type BossRigView = {');
  const setTexture = sliceRequired(
    renderer,
    '  private setTexture(view: EntityView, key: string | null)',
    '  private getOrRequestBossComponentTexture'
  );
  const release = sliceRequired(
    renderer,
    '  private releaseEntityView(view: EntityView)',
    '  private setTexture(view: EntityView, key: string | null)'
  );

  assert.match(entityView, /displayedTextureKey: string \| null/);
  assert.match(setTexture, /view\.displayedTextureKey/);
  assert.match(setTexture, /view\.sprite\.visible = Boolean\(view\.displayedTextureKey\)/);
  assert.match(setTexture, /view\.displayedTextureKey = key/);
  assert.match(release, /view\.displayedTextureKey = null/);
});

test('Pixi-backed gameplay does not start the legacy all-image flood', () => {
  const canvas = read('components', 'GameCanvas.tsx');
  const engine = read('services', 'gameLogic.ts');

  assert.match(engine, /preloadCanvasAssets\?: boolean/);
  assert.match(engine, /this\.preloadCanvasAssets = options\.preloadCanvasAssets !== false/);
  assert.match(engine, /if \(this\.preloadCanvasAssets\) \{\s*GAMEPLAY_ASSET_URLS\.forEach\(loadImage\)/);
  assert.match(engine, /if \(this\.preloadCanvasAssets\) paths\.forEach\(loadImage\)/);
  assert.match(canvas, /preloadCanvasAssets:\s*false/);
});

test('production lets repeat visits reuse static art while HTML still revalidates', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const headersBySource = new Map(vercel.headers.map((entry) => [entry.source, entry.headers]));
  const cacheControl = (source) => headersBySource
    .get(source)
    ?.find((header) => header.key === 'Cache-Control')
    ?.value;

  assert.match(cacheControl('/') ?? '', /max-age=0/);
  assert.match(cacheControl('/index.html') ?? '', /max-age=0/);
  assert.match(cacheControl('/assets/(.*)') ?? '', /immutable/);
  assert.match(cacheControl('/game-art/(.*)') ?? '', /stale-while-revalidate/);
  assert.match(cacheControl('/audio/(.*)') ?? '', /stale-while-revalidate/);
});

test('Hangar ship and icon decoding uses a bounded shared queue', () => {
  const browserImages = read('services', 'browserImagePreload.ts');
  const playerMotion = read('services', 'playerShipMotion.ts');
  const squad = read('services', 'squadProgression.ts');
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(browserImages, /concurrency = 4/);
  assert.match(browserImages, /runGameplayAssetPreloadQueue\(/);
  assert.match(browserImages, /failedUrls\.push\(url\)/);
  assert.match(playerMotion, /preloadDecodedImageUrls\(\s*PLAYER_SHIP_CAROUSEL_FRAME_URLS/);
  assert.match(playerMotion, /carouselFramePreload = null/);
  assert.match(squad, /miniShipTexturePreload = preloadDecodedImageUrls/);
  assert.match(squad, /miniShipTexturePreload = null/);
  assert.match(hangar, /void preloadDecodedImageUrls\(assets\)/);
  assert.doesNotMatch(hangar, /assets\.forEach\(\(src\)/);
});
