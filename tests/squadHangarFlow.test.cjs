const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('the weekly squad model is wallet-scoped, resettable, and data driven', () => {
  const source = read('services', 'squadProgression.ts');

  assert.match(source, /MAIN_SHIP_UPGRADE_MAX_LEVEL = 7/);
  assert.match(source, /SQUAD_PROFILE_VERSION = 3/);
  assert.match(source, /LEFT_SQUAD_SLOT_UNLOCK_COST = 50/);
  assert.match(source, /RIGHT_SQUAD_SLOT_UNLOCK_COST = 500/);
  assert.match(source, /FIRST_LEFT_WING_MINI_SHIP_ID: MiniShipId = 'citation-dart'/);
  assert.match(source, /WEEKLY_STARTING_COINS = 0/);
  assert.match(source, /unlockedSlots: \{ left: false, right: false \}/);
  assert.match(source, /MINI_SHIP_CATALOG:[\s\S]*citation-dart[\s\S]*nebula-tern/);
  assert.match(source, /weeklyStorageKey = \(profileId: string\)/);
  assert.match(source, /state\.weekKey !== currentWeek/);
  assert.match(source, /weekly_state_reset/);
  assert.match(source, /buildRuntimeSquadLoadout/);
  assert.match(source, /fireIntervalFrames: Math\.max\(18/);
  assert.match(source, /ownedMiniShips: \{\}/);
  assert.match(source, /equipped: \{ left: null, right: null \}/);
  assert.match(source, /shipUpgrades: createMainShipUpgradesByShip\(\)/);
  assert.match(source, /RETIRED_WEEKLY_SQUAD_PROFILE_VERSIONS = \[1, 2\]/);
  assert.match(source, /retiredWeeklyStorageKeys\(profileId\)\.forEach\(\(key\) => window\.localStorage\.removeItem\(key\)\)/);
  assert.match(source, /PERMANENT_SQUAD_PROFILE_VERSION = 1/);
  assert.match(source, /MINI_SHIP_UPGRADE_COST_CURVE = \[0, 100, 225, 400, 650\]/);
  assert.match(source, /if \(slot === 'left'\) \{[\s\S]*?\[FIRST_LEFT_WING_MINI_SHIP_ID\]: next\.ownedMiniShips\[FIRST_LEFT_WING_MINI_SHIP_ID\] \|\| 1/);
  assert.match(source, /next\.equipped = \{ \.\.\.next\.equipped, left: FIRST_LEFT_WING_MINI_SHIP_ID \}/);
  assert.match(source, /mini_ship_awarded/);
  assert.doesNotMatch(source, /if \(!equipped\.left\) equipped\.left/);
});

test('guest runs never load or save Hangar profile data', () => {
  const squad = read('services', 'squadProgression.ts');
  const app = read('App.tsx');

  assert.match(squad, /if \(!walletAddress\?\.trim\(\)\)/);
  assert.match(squad, /removeItem\(weeklyStorageKey\(profileId\)\)/);
  assert.match(squad, /removeItem\(permanentStorageKey\(fallback\.profileId\)\)/);
  assert.match(squad, /state\.profileId === 'guest'/);
  assert.match(app, /if \(!walletAddress\) \{[\s\S]*totalCoins: 0/);
  assert.match(app, /walletProfileAddress === normalizedActiveWalletAddress[\s\S]*localStorage\.setItem\(getWalletProfileKey\(walletProfileAddress\)/);
  assert.match(app, /if \(activeWalletAddress && !isOwnerTestRun/);
  assert.match(app, /saveScore\(name, score, wave, \{[\s\S]*walletAddress: activeWalletAddress/);
});

test('the Hangar is wallet gated while its dashboard entry remains mounted', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const app = read('App.tsx');

  assert.match(startScreen, /const requestHangar = \(\) =>/);
  assert.match(startScreen, /if \(walletAddress\) \{[\s\S]*setDashboardTab\('hangar'\)/);
  assert.match(startScreen, /Connect your wallet for ship upgrades/);
  assert.match(startScreen, /data-locked=\{hangarLocked/);
  assert.match(startScreen, /dashboardTab === 'hangar'/);
  assert.match(startScreen, /<SquadHangar/);
  assert.match(startScreen, /<DashboardNav docked \/>/);
  assert.match(app, /url\.searchParams\.set\('view', 'hangar'\)/);
  assert.match(app, />HANGAR<\/button>/);
});

test('the Hangar uses one position-driven squad bay and four-column fleet catalogs', () => {
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(hangar, /type HangarPosition = 'main' \| SquadSlotId/);
  assert.match(hangar, /selectorFrames\('ship', 'lime'\)/);
  assert.match(hangar, /selectorFrames\('mini', 'gold'\)/);
  assert.match(hangar, /trace-boxes\/label\/cyan/);
  assert.match(hangar, /grid-cols-4/);
  assert.match(hangar, /PLAYER_SHIP_ORDER: PlayerShipId\[\] = \[\.\.\.PLAYABLE_PLAYER_SHIP_IDS\]/);
  assert.match(hangar, /setMode\('upgrades'\)/);
  assert.match(hangar, /onUnlockSlot\(position\)/);
  assert.match(hangar, /onPurchaseMini\(entry\.id\)/);
  assert.match(hangar, /onEquipMini\(activePosition, entry\.id\)/);
  assert.doesNotMatch(hangar, /squadPositionWidth/);
  assert.match(hangar, /left-\[8%\][\s\S]*renderSquadMini\('left'\)/);
  assert.match(hangar, /right-\[8%\][\s\S]*renderSquadMini\('right'\)/);
  assert.match(hangar, /w-\[9\.5rem\][\s\S]{0,100}sm:w-\[12rem\]/);
  assert.match(hangar, /w-\[5\.25rem\][\s\S]{0,100}sm:w-\[6\.25rem\]/);
  assert.match(hangar, /absolute inset-\[13%\][\s\S]*active \? <AnimatedSelector size="ship" color="lime"/);
  assert.match(hangar, /absolute inset-\[14%\][\s\S]*activePosition === 'main' \? <AnimatedSelector size="ship" color="lime"/);
  assert.ok((hangar.match(/AnimatedSelector size="ship" color="lime" className="absolute inset-0 h-full w-full scale-\[1\.8\]"/g) || []).length >= 2);
  assert.match(hangar, /SQUAD_CONNECTOR_POSITION: Record<HangarPosition, string>/);
  assert.match(hangar, /main: 'left-\[9%\] h-\[48%\][^']*border-l-2/);
  assert.match(hangar, /left: 'left-\[9%\] h-\[72%\][^']*border-l-2/);
  assert.match(hangar, /right: 'right-\[9%\] h-\[72%\][^']*border-r-2/);
  assert.match(hangar, /data-connector-target=\{activePosition\}/);
  assert.doesNotMatch(hangar, /hover:scale-\[1\.0[24]\]/);
  assert.doesNotMatch(hangar, /transition-\[width,transform\]/);
  assert.match(hangar, /scicon-sparse-pixel-starfield-twinkle\.gif/);
  assert.match(hangar, /sci-hangar-starfield-track/);
  assert.match(hangar, /AnimatedPlayerShip shipId=\{mainShipId\}/);
  assert.match(hangar, /AnimatedPlayerShip shipId=\{shipId\}/);
  assert.match(hangar, /preloadPlayerShipSelectionFrames\(\)/);
  assert.doesNotMatch(hangar, /aria-label="Return home"/);
  assert.doesNotMatch(hangar, /min-h-\[25rem\]/);
  assert.match(hangar, /rsc-coin-pixel\.png/);
  assert.match(hangar, /resources\/crystal\.png/);
  assert.match(hangar, /const activeMainShipUpgrades = state\.shipUpgrades\[mainShipId\]/);
  assert.match(hangar, /const shipUpgrades = state\.shipUpgrades\[shipId\]/);
  assert.match(hangar, /const unlockCost = SQUAD_SLOT_UNLOCK_COST\[slot\]/);
  assert.match(hangar, /\{unlockCost\} coins/);
  assert.match(hangar, /rsc-coin-flip-v1\/rsc-coin-pixel-front\.png/);
  assert.match(hangar, /const costLabel = atMax \? 'MAX' : nextCost === 0 \? 'FREE'/);
  assert.match(hangar, /aria-label=\{actionLabel\}/);
  assert.match(hangar, /sci-hangar-upgrade-pulse/);
  assert.doesNotMatch(hangar, /\$\{owned \? '' : 'grayscale'\}/);
});

test('the dashboard centers Home and exposes Hangar immediately to its right', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const styles = read('styles', 'tailwind.input.css');
  const proposalsIndex = startScreen.indexOf("id: 'proposals'");
  const trophiesIndex = startScreen.indexOf("id: 'trophies'");
  const homeIndex = startScreen.indexOf("id: 'home'");
  const hangarIndex = startScreen.indexOf("id: 'hangar'");
  const moreIndex = startScreen.indexOf("id: 'more'");

  assert.ok(proposalsIndex < trophiesIndex);
  assert.ok(trophiesIndex < homeIndex);
  assert.ok(homeIndex < hangarIndex);
  assert.ok(hangarIndex < moreIndex);
  assert.match(startScreen, /grid-cols-5/);
  assert.match(startScreen, /normal\/multiplayer-network\.png/);
  assert.match(startScreen, /selected\/multiplayer-network-selected\.png/);
  assert.match(startScreen, /selected\/missions-selected\.png/);
  assert.match(styles, /data-dashboard-tab='home'[\s\S]*?dashboard-icon-size\) \* 1\.2/);
  assert.match(styles, /data-dashboard-tab='hangar'[\s\S]*?dashboard-icon-size\) \* 1\.368/);
});

test('locked ship and Hangar locks replay their animation on click and hover', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const styles = read('styles', 'tailwind.input.css');
  const html = read('index.html');

  assert.match(startScreen, /setShipLockNudgeRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(startScreen, /onClick=\{requestFocusedShip\}/);
  assert.doesNotMatch(startScreen, /disabled=\{Boolean\(walletAddress\) && focusedShipLocked\}/);
  assert.match(startScreen, /data-lock-nudged=\{hangarLocked && connectNudgeActive/);
  assert.match(styles, /data-lock-nudged='true'[\s\S]*?sci-dashboard-nav-lock/);
  assert.match(styles, /@keyframes sci-dashboard-lock-rattle/);
  assert.match(html, /sci-ship-carousel-lock--nudged/);
  assert.match(html, /@keyframes sci-ship-lock-rattle/);
});

test('companions use the real engine and Overdrive Spread stays on the main ship', () => {
  const engine = read('services', 'gameLogic.ts');
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

  assert.match(engine, /this\.updateSquadCompanions\(\)/);
  assert.match(engine, /spawnSquadCompanionBullet/);
  assert.match(engine, /sampleTripleShotSideAngleRadians/);
  assert.match(engine, /angleBias: sampleTripleShotSideAngleRadians\(side, Math\.random\(\)\)/);
  assert.match(engine, /OVERDRIVE SPREAD!/);
  assert.match(renderer, /engine\.getSquadCompanionVisuals\(\)/);
  assert.match(renderer, /companion\?\.frames\[companion\.frameIndex\]/);
});

test('Hangar render helpers preserve the active upgrade view across parent state updates', () => {
  const startScreen = read('components', 'StartScreen.tsx');

  assert.match(startScreen, /const renderMobileDashboardContent = \(\) =>/);
  assert.match(startScreen, /const renderSelectedDashboard = \(\) =>/);
  assert.match(startScreen, /\{renderMobileDashboardContent\(\)\}/);
  assert.match(startScreen, /\{renderSelectedDashboard\(\)\}/);
  assert.doesNotMatch(startScreen, /<MobileDashboardContent\b|const MobileDashboardContent|function MobileDashboardContent/);
  assert.doesNotMatch(startScreen, /<SelectedDashboard\b|const SelectedDashboard|function SelectedDashboard/);
});

test('main ship upgrades remain isolated to the selected ship through the Hangar and game launch', () => {
  const squad = read('services', 'squadProgression.ts');
  const app = read('App.tsx');

  assert.match(squad, /export type MainShipUpgradesByShip = Record<PlayerShipId, MainShipUpgradeLevels>/);
  assert.match(squad, /const currentUpgrades = state\.shipUpgrades\[shipId\]/);
  assert.match(squad, /\[shipId\]: \{ \.\.\.currentUpgrades, \[id\]: level \+ 1 \}/);
  assert.match(squad, /upgrades: \{ \.\.\.\(state\.shipUpgrades\[mainShipId\]/);
  assert.match(app, /upgradeMainShip\(current, usableShipId, id\)/);
  assert.match(app, /buildRuntimeSquadLoadout\(weeklySquadState, usableShipId\)/);
});

test('gameplay pickups use animated transparent PNG artwork instead of founder portraits', () => {
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const iconNames = ['overdrive-spread.png', 'magnet.png', 'shield.png', 'research-beam.png'];

  iconNames.forEach((name) => {
    const icon = fs.readFileSync(path.join(root, 'public', 'game-art', 'powerups', name));
    assert.equal(icon.readUInt32BE(16), 256);
    assert.equal(icon.readUInt32BE(20), 256);
    assert.equal(icon[25], 6, `${name} must retain an alpha channel`);
  });

  const mapping = renderer.slice(
    renderer.indexOf('const getPowerupFrames'),
    renderer.indexOf('const isEnemyType')
  );
  assert.doesNotMatch(mapping, /FOUNDER_/);
  assert.match(mapping, /POWERUP_OVERDRIVE_SPREAD_FRAMES/);
  assert.match(mapping, /POWERUP_MAGNET_FRAMES/);
  assert.match(mapping, /POWERUP_SHIELD_FRAMES/);
  assert.match(mapping, /POWERUP_RESEARCH_BEAM_FRAMES/);
  assert.match(renderer, /Math\.floor\(\(engine\.frameCount \+ entity\.variant\) \/ 8\) % frames\.length/);
});
