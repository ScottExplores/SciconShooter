const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('weekly competition rollover preserves permanent Hangar progression and resets only seasonal totals', () => {
  const source = read('services', 'squadProgression.ts');

  assert.match(source, /MAIN_SHIP_UPGRADE_MAX_LEVEL = FIRE_RATE_LEVELS_PER_TIER/);
  assert.match(source, /MAIN_SHIP_FIRE_RATE_MAX_LEVEL = FIRE_RATE_MAX_LEVEL/);
  // Fire Rate runs the long tier ladder, Signature Move and Starting Hearts are
  // short deliberate tracks, and everything else uses the standard cap.
  assert.match(source, /id === 'fireRate'\s*\?\s*MAIN_SHIP_FIRE_RATE_MAX_LEVEL/);
  assert.match(source, /id === 'ability'\s*\?\s*MAIN_SHIP_ABILITY_MAX_LEVEL/);
  assert.match(source, /id === 'startingHearts'\s*\?\s*MAIN_SHIP_STARTING_HEARTS_MAX_LEVEL\s*:\s*MAIN_SHIP_UPGRADE_MAX_LEVEL/);
  // Homing is the wing's job -- the archive-beetle support ship carries the
  // 'homing-missile' ability -- so the hull must not sell a duplicate track.
  assert.doesNotMatch(source, /id: 'missile'/);
  assert.doesNotMatch(source, /MAIN_SHIP_MISSILE_MAX_LEVEL/);
  assert.match(source, /CAMPAIGN_MAX_STARTING_LIVES = 10/);
  assert.match(source, /CAMPAIGN_BASE_STARTING_LIVES = 3/);
  assert.match(source, /SQUAD_PROFILE_VERSION = 4/);
  assert.match(source, /LEFT_SQUAD_SLOT_UNLOCK_COST = 50/);
  assert.match(source, /RIGHT_SQUAD_SLOT_UNLOCK_COST = 500/);
  assert.match(source, /FIRST_LEFT_WING_MINI_SHIP_ID: MiniShipId = 'citation-dart'/);
  assert.match(source, /WEEKLY_STARTING_COINS = 0/);
  assert.match(source, /unlockedSlots: \{ left: false, right: false \}/);
  assert.match(source, /MINI_SHIP_CATALOG:[\s\S]*citation-dart[\s\S]*nebula-tern/);
  assert.match(source, /weeklyStorageKey = \(profileId: string\)/);
  assert.match(source, /state\.weekKey !== currentWeek/);
  assert.match(source, /rollWeeklySquadStateForward\(state, currentWeek\)/);
  assert.match(
    source,
    /rollWeeklySquadStateForward = \([\s\S]*?\.\.\.state,[\s\S]*?weekKey,[\s\S]*?coins: WEEKLY_STARTING_COINS \+ Math\.max\([\s\S]*?durableCampaignCoins:[\s\S]*?weeklyStats: createWeeklySquadStats\(\)/
  );
  assert.match(
    source,
    /sourceForCurrentWeek = sourceState\.weekKey === targetState\.weekKey[\s\S]*?rollWeeklySquadStateForward\(sourceState, targetState\.weekKey\)/
  );
  assert.match(source, /weekly_state_reset/);
  assert.match(source, /buildRuntimeSquadLoadout/);
  assert.match(source, /fireIntervalFrames: getMiniShipFireIntervalFrames\(entry\.fireIntervalFrames, level\)/);
  assert.match(source, /volleySize: getMiniShipVolleySize\(entry\.ability, level\)/);
  assert.match(source, /ownedMiniShips: \{\}/);
  assert.match(source, /equipped: \{ left: null, right: null \}/);
  assert.match(source, /shipUpgrades: createMainShipUpgradesByShip\(\)/);
  assert.match(source, /RETIRED_WEEKLY_SQUAD_PROFILE_VERSIONS = \[1, 2, 3\]/);
  assert.match(source, /retiredWeeklyStorageKeys\(profileId\)\.forEach\(\(key\) => window\.localStorage\.removeItem\(key\)\)/);
  assert.match(source, /PERMANENT_SQUAD_PROFILE_VERSION = 1/);
  assert.match(source, /MINI_SHIP_UPGRADE_COST_CURVE = \[0, 160, 360, 650, 1050\]/);
  assert.match(source, /entry\.purchaseCost \* \(0\.55 \+ currentLevel \* 0\.15\)/);
  assert.match(source, /60, 90, 130, 190, 270, 360, 480,[\s\S]*?2600, 3050, 3550, 4100, 4700, 5350, 6050/);
  assert.match(source, /costs: \[55, 85, 130, 200, 300, 440, 625\]/);
  // Starting Hearts is a premium Campaign-only track: 3 lives to 10.
  assert.match(source, /costs: \[180, 320, 560, 900, 1400, 2100, 3000\]/);
  assert.match(source, /if \(slot === 'left'\) \{[\s\S]*?\[FIRST_LEFT_WING_MINI_SHIP_ID\]: next\.ownedMiniShips\[FIRST_LEFT_WING_MINI_SHIP_ID\] \|\| 1/);
  assert.match(source, /next\.equipped = \{ \.\.\.next\.equipped, left: FIRST_LEFT_WING_MINI_SHIP_ID \}/);
  assert.match(source, /mini_ship_awarded/);
  assert.doesNotMatch(source, /if \(!equipped\.left\) equipped\.left/);
});

test('guest runs save device Pilot Hangar and Boss Archive progress while wallet metadata remains optional', () => {
  const squad = read('services', 'squadProgression.ts');
  const app = read('App.tsx');

  assert.match(squad, /const normalizeProfileId = \(profileId\?: string \| null\)/);
  assert.match(squad, /loadWeeklySquadState = \(requestedProfileId\?: string \| null\)/);
  assert.match(squad, /loadPermanentSquadState = \(requestedProfileId\?: string \| null\)/);
  assert.match(squad, /window\.localStorage\.setItem\(weeklyStorageKey\(state\.profileId\)/);
  assert.match(squad, /window\.localStorage\.setItem\(permanentStorageKey\(state\.profileId\)/);
  assert.doesNotMatch(squad, /state\.profileId === 'guest'/);
  assert.match(squad, /bossArchive: createBossArchiveProgress\(\)/);
  assert.match(squad, /normalizeBossArchiveEventIds/);
  assert.match(app, /Tokens fund permanent Hangar upgrades/);
  assert.match(app, /const \[pilotProfile\] = useState\(initializeLocalPilotProfile\)/);
  assert.match(app, /loadWeeklySquadState\(pilotProfile\.id\)/);
  assert.match(app, /loadPermanentSquadState\(pilotProfile\.id\)/);
  assert.match(app, /hydrateActiveProfile\(\{\s*profileId: pilotProfile\.id\s*\}\)/);
  assert.match(app, /savePilotStats\(activeProfileId/);
  assert.match(app, /getWalletProfileId\(normalizedAddress\)/);
  assert.match(app, /saveAuthenticatedWalletProfile\(\{/);
  assert.match(app, /const unsettledLifetimeCampaignEnemies = isCampaignRun/);
  assert.match(app, /if \(isWeeklyLeaderboardRun && squadRunAppliedGameIdRef\.current !== gameId\)/);
  assert.match(app, /if \(!isNonCompetitiveRun && permanentRunAppliedGameIdRef\.current !== gameId\)/);
  assert.match(app, /saveScore\(name, score, wave, \{[\s\S]*walletAddress: activeWalletAddress/);
});

test('the Hangar is available to device Pilots while minted ship locks remain visible', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const app = read('App.tsx');

  assert.match(startScreen, /const requestHangar = \(\) => setDashboardTab\('hangar'\)/);
  assert.match(startScreen, /requested === 'hangar'/);
  assert.doesNotMatch(startScreen, /hangarLocked/);
  assert.doesNotMatch(startScreen, /Connect your wallet for ship upgrades/);
  assert.match(startScreen, /if \(dashboardTab === 'hangar'\) \{/);
  assert.match(startScreen, /<SquadHangar/);
  assert.match(startScreen, /<DashboardNav docked \/>/);
  assert.match(startScreen, /getShipUnlockMessage/);
  assert.match(startScreen, /isPlayerShipUnlocked\(shipId, shipUnlocks\)/);
  assert.match(app, /url\.searchParams\.set\('view', 'hangar'\)/);
  assert.match(app, />HANGAR<\/button>/);
});

test('the Hangar uses one position-driven squad bay and four-column fleet catalogs', () => {
  const hangar = read('components', 'SquadHangar.tsx');
  const startScreen = read('components', 'StartScreen.tsx');
  const app = read('App.tsx');
  const miniCatalog = hangar.slice(
    hangar.indexOf('const renderMiniCatalog = () =>'),
    hangar.indexOf('\n  return (', hangar.indexOf('const renderMiniCatalog = () =>'))
  );

  assert.match(hangar, /type HangarPosition = 'main' \| SquadSlotId/);
  assert.match(hangar, /selectorFrames\('ship', 'lime'\)/);
  assert.match(hangar, /selectorFrames\('mini', 'gold'\)/);
  assert.match(hangar, /trace-boxes\/label\/cyan/);
  assert.match(hangar, /const TRACE_LABEL_FRAME_COUNT = 24/);
  assert.match(hangar, /const TRACE_LABEL_FRAME_DELAY_MS = 45/);
  assert.match(hangar, /grid-cols-4/);
  assert.match(hangar, /PLAYER_SHIP_ORDER: PlayerShipId\[\] = \[\.\.\.PLAYABLE_PLAYER_SHIP_IDS\]/);
  assert.match(hangar, /setMode\('upgrades'\)/);
  assert.match(hangar, /onUnlockSlot\(position\)/);
  assert.match(hangar, /onPurchaseMini\(activeMiniId\)/);
  assert.match(hangar, /onEquipMini\(activePosition, activeMiniId\)/);
  assert.match(miniCatalog, /if \(selectedHere\) \{\s*setMode\('upgrades'\);\s*return;\s*\}\s*setSelectedMiniId\(entry\.id\)/);
  assert.doesNotMatch(miniCatalog, /onPurchaseMini\(/);
  assert.doesNotMatch(miniCatalog, /onEquipMini\(/);
  assert.doesNotMatch(hangar, /squadPositionWidth/);
  assert.match(hangar, /left-\[8%\][\s\S]*renderSquadMini\('left'\)/);
  assert.match(hangar, /right-\[8%\][\s\S]*renderSquadMini\('right'\)/);
  assert.match(hangar, /w-\[9\.5rem\][\s\S]{0,100}sm:w-\[12rem\]/);
  assert.match(hangar, /w-\[5\.25rem\][\s\S]{0,100}sm:w-\[6\.25rem\]/);
  assert.match(hangar, /absolute inset-\[13%\][\s\S]*active \? <AnimatedSelector size="ship" color="lime"/);
  assert.match(hangar, /absolute inset-\[14%\][\s\S]*activePosition === 'main' \? <AnimatedSelector size="ship" color="lime"/);
  assert.ok((hangar.match(/AnimatedSelector size="ship" color="lime" className="absolute inset-0 h-full w-full scale-\[1\.8\]"/g) || []).length >= 2);
  assert.ok((hangar.match(/sci-hangar-active-light/g) || []).length >= 2);
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
  assert.match(hangar, /ASSETS\.REAL_RSC_ICON/);
  assert.match(hangar, /const activeMainShipUpgrades = state\.shipUpgrades\[mainShipId\]/);
  assert.match(hangar, /const shipUpgrades = state\.shipUpgrades\[shipId\]/);
  assert.match(hangar, /const unlockCost = SQUAD_SLOT_UNLOCK_COST\[slot\]/);
  assert.match(hangar, /slot === 'right' && !founderSandbox \? '10 RSC' : `\$\{unlockCost\} Tokens`/);
  assert.match(hangar, /onPurchaseWithRsc\('right-support'\)/);
  assert.match(hangar, /rightPurchaseStatus === 'connecting'[\s\S]*?'CONNECTING'/);
  assert.match(hangar, /rightPurchaseStatus === 'error'[\s\S]*?'TRY AGAIN'/);
  assert.match(hangar, /label="Research Coin"/);
  assert.match(hangar, /onOptions=\{onOpenRscSwap\}/);
  assert.match(startScreen, /onOpenRscSwap=\{\(\) => setShowRscAcquire\(true\)\}/);
  assert.match(hangar, /formatWholeRscBalance\(rscBalance\)/);
  assert.match(hangar, /rscBalance\.raw >= rightSupportCostRaw/);
  assert.match(startScreen, /role="dialog"[\s\S]*?Get Research Coin/);
  assert.match(startScreen, /View RSC in Base/);
  assert.match(startScreen, /Swap USDC for RSC/);
  assert.match(startScreen, /onOpenRscInBase\(\)/);
  assert.match(startScreen, /onOpenSwap\(\)/);
  assert.match(app, /window\.location\.assign\(DONATION_CONFIG\.RSC_SWAP_URL\)/);
  assert.match(app, /window\.location\.assign\(DONATION_CONFIG\.RSC_BASE_APP_URL\)/);
  assert.doesNotMatch(app, /window\.confirm\(/);
  assert.match(hangar, /label="Tokens"/);
  assert.match(hangar, /TOKEN_EXCHANGE_SKU_IDS = \[[\s\S]*'tokens-500'[\s\S]*'tokens-2500'[\s\S]*'tokens-5000'/);
  assert.match(hangar, /500 Tokens per 1 RSC/);
  assert.match(hangar, /isTokenExchangePurchase && walletPurchaseStatus\.status !== 'idle'/);
  assert.match(hangar, /isRightSupportPurchase[\s\S]*role="status"/);
  assert.match(hangar, /walletPurchaseStatus\.error \|\| 'The right support purchase could not be completed/);
  assert.match(hangar, /sku\.tokenReward\.toLocaleString\(\)/);
  assert.match(hangar, /rsc-coin-flip-v1\/rsc-coin-pixel-front\.png/);
  assert.match(hangar, /const costLabel = founderSandbox \? 'TEST' : atMax \? 'MAX' : nextCost === 0 \? 'FREE'/);
  assert.match(hangar, /aria-label=\{actionLabel\}/);
  assert.match(hangar, /sci-hangar-upgrade-pulse/);
  assert.doesNotMatch(hangar, /\$\{owned \? '' : 'grayscale'\}/);
  assert.match(miniCatalog, /<AnimatedMiniShip[^>]*\$\{owned \? '' : 'opacity-45 grayscale'\}/);
  assert.doesNotMatch(miniCatalog, /<button[\s\S]{0,500}\$\{owned \? '' : '[^']*grayscale/);
});

test('mini ship selection opens details on a second tap and supports unlocks there', () => {
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(hangar, /const selectedHere = selectedMiniId === entry\.id/);
  assert.match(hangar, /color=\{equippedHere \? 'gold' : 'lime'\}/);
  assert.match(hangar, /if \(selectedHere\) \{\s*setMode\('upgrades'\);\s*return;\s*\}/);
  assert.match(hangar, /if \(position === activePosition && mode === 'upgrades'\) \{\s*setMode\('catalog'\);\s*return;\s*\}/);
  assert.match(hangar, /onClick=\{\(\) => onPurchaseMini\(activeMiniId\)\}/);
  assert.match(hangar, /<span>Unlock<\/span>/);
  assert.match(hangar, /activeMini\.purchaseCost === 0 \? 'Free'/);
  assert.match(hangar, /onClick=\{\(\) => onEquipMini\(activePosition, activeMiniId\)\}/);
  assert.match(hangar, /activeMiniEquipped \? 'Equipped' : 'Equip'/);
  assert.match(hangar, /Tap the selected mini ship again to view details/);
  assert.match(hangar, /activeMini\.purchaseCost === 0 \? 'Unlock free' : `Unlock \$\{activeMini\.purchaseCost\.toLocaleString\(\)\} Tokens`/);
});

test('main ship upgrade cards show the matching existing gameplay sprites', () => {
  const hangar = read('components', 'SquadHangar.tsx');
  const spriteNames = ['rapid-fire.png', 'speed.png', 'extra-life.png'];

  assert.match(hangar, /MAIN_UPGRADE_SPRITE: Readonly<Record<MainShipUpgradeId, string>>/);
  // Signature Move is the one track whose art depends on the selected hull, so
  // the tile shows that ship's actual move instead of a shared placeholder.
  assert.match(hangar, /src=\{getMainUpgradeSprite\(upgrade\.id, mainShipId, level\)\}/);
  assert.match(hangar, /shipId === 'researchhub'[\s\S]*?getShipAbilityUpgradeProfile\(abilityLevel\)\.projectileIconUrl/);
  assert.match(hangar, /max=\{upgrade\.id === 'fireRate' \? MAIN_SHIP_UPGRADE_MAX_LEVEL : maxLevel\}/);
  assert.match(hangar, /getMainShipFireRateTier\(activeMainShipUpgrades\.fireRate\)/);
  assert.match(hangar, /getMainShipFireRateTierProgress\(activeMainShipUpgrades\.fireRate\)/);
  assert.doesNotMatch(hangar, /Array\.from\(\{ length: FIRE_RATE_TIER_COUNT \}/);
  assert.doesNotMatch(hangar, /repeat\(\$\{FIRE_RATE_TIER_COUNT\}, minmax\(0, 1fr\)\)/);
  assert.match(hangar, /const maxLevel = getMainShipUpgradeMaxLevel\(upgrade\.id\)/);
  spriteNames.forEach((name) => {
    assert.match(hangar, new RegExp(`/game-art/powerups/${name.replace('.', '\\.')}`));
    assert.ok(fs.existsSync(path.join(root, 'public', 'game-art', 'powerups', name)));
  });
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
  assert.match(startScreen, /scicon-neon-dashboard-icons-v2/);
  assert.match(startScreen, /dashboard-nav-icons-static\.png/);
  assert.match(startScreen, /id: 'proposals'[\s\S]*?spriteColumn: 0/);
  assert.match(startScreen, /id: 'trophies'[\s\S]*?spriteColumn: 1/);
  assert.match(startScreen, /id: 'home'[\s\S]*?spriteColumn: 2/);
  assert.match(startScreen, /id: 'hangar'[\s\S]*?spriteColumn: 3/);
  assert.match(startScreen, /id: 'more'[\s\S]*?spriteColumn: 4/);
  assert.match(startScreen, /className="sci-dashboard-nav-icon-sprite"/);
  assert.match(styles, /scicon-neon-dashboard-icons-v2\/dashboard-nav-icons-static\.png/);
  assert.match(styles, /\.sci-dashboard-nav-icon\s*\{[\s\S]*?width:\s*var\(--dashboard-icon-size\);[\s\S]*?height:\s*var\(--dashboard-icon-size\);/);
  assert.match(styles, /background-size: 500% 100%/);
  assert.match(styles, /background-position: var\(--dashboard-icon-column-x, 0%\) 0%/);
  assert.doesNotMatch(styles, /sci-dashboard-icon-live/);
  assert.doesNotMatch(styles, /dashboard-icon-active-size/);
  assert.doesNotMatch(styles, /sci-dashboard-reward-breathe/);
  assert.doesNotMatch(styles, /data-dashboard-tab='home'\][^{]*sci-dashboard-nav-icon/);
  assert.doesNotMatch(styles, /data-dashboard-tab='hangar'\][^{]*sci-dashboard-nav-icon/);
});

test('locked Home ships open the shared access dialog without navigating to Hangar', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const carousel = read('components', 'ShipCarousel.tsx');
  const hangar = read('components', 'SquadHangar.tsx');
  const accessDialog = read('components', 'PlayerShipAccessDialog.tsx');
  const html = read('index.html');
  const requestStart = startScreen.indexOf('const requestFocusedShip = () =>');
  const requestEnd = startScreen.indexOf('const weeklyAllocation', requestStart);
  const requestFocusedShip = startScreen.slice(requestStart, requestEnd);
  const lockedBranchEnd = requestFocusedShip.indexOf('requestHangar();');
  const lockedBranch = requestFocusedShip.slice(0, lockedBranchEnd);

  assert.match(startScreen, /setShipLockNudgeRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(startScreen, /onActivateFocusedShip=\{requestFocusedShip\}/);
  assert.match(lockedBranch, /setHomeShipAccessId\(shipFocusId\)/);
  assert.doesNotMatch(lockedBranch, /requestHangar\(\)/);
  assert.match(requestFocusedShip.slice(lockedBranchEnd), /requestHangar\(\)/);
  assert.match(startScreen, /<PlayerShipAccessDialog[\s\S]*shipId=\{homeShipAccessId\}/);
  assert.match(hangar, /<PlayerShipAccessDialog[\s\S]*shipId=\{lockedPlayerShipId\}/);
  assert.match(accessDialog, /shipId === 'eth'[\s\S]*?'eth-ship'/);
  assert.match(accessDialog, /shipId === 'btc'[\s\S]*?'btc-ship'/);
  assert.match(accessDialog, /Hold 100 BIO/);
  assert.match(accessDialog, /0\.001 ETH/);
  assert.match(accessDialog, /0\.00008 cbBTC/);
  assert.match(accessDialog, /onPurchasePlayerShip\(purchaseSkuId\)/);
  assert.match(accessDialog, /onRefreshPlayerShipAccess/);
  assert.match(accessDialog, /const previousFocus = document\.activeElement instanceof HTMLElement/);
  assert.match(accessDialog, /dialogRef\.current\?\.focus\(\)/);
  assert.match(accessDialog, /return \(\) => previousFocus\?\.focus\(\)/);
  assert.match(accessDialog, /event\.key !== 'Tab'/);
  assert.match(accessDialog, /dialog\.querySelectorAll<HTMLElement>/);
  assert.match(accessDialog, /tabIndex=\{-1\}/);
  assert.match(carousel, /onClick=\{\(\) => \{[\s\S]*suppressTapRef\.current[\s\S]*onActivateFocusedShip\(\)/);
  assert.doesNotMatch(startScreen, /disabled=\{Boolean\(walletAddress\) && focusedShipLocked\}/);
  assert.doesNotMatch(startScreen, /hangarLocked|data-lock-nudged|sci-dashboard-nav-lock/);
  assert.match(html, /sci-ship-carousel-lock--nudged/);
  assert.match(html, /@keyframes sci-ship-lock-rattle/);
});

test('companions use the real engine and Projectile Upgrade stays on the main ship', () => {
  const engine = read('services', 'gameLogic.ts');
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');

  assert.match(engine, /this\.updateSquadCompanions\(\)/);
  assert.match(engine, /spawnSquadCompanionBullet/);
  assert.match(engine, /sampleTripleShotSideAngleRadians/);
  assert.match(engine, /const sideAngle = sampleTripleShotSideAngleRadians\(side, this\.nextGameplayRandom\(\)\)/);
  assert.doesNotMatch(engine, /sampleTripleShotSideAngleRadians\(side, Math\.random\(\)\)/);
  assert.match(engine, /angleBias: sideAngle/);
  // The spread pickup is gone: triple spread is the ETH hull's identity, and
  // the Projectile Upgrade pickup amplifies the hull's own fire.
  assert.match(engine, /const spreadLanes = this\.playerShipId === 'eth'/);
  assert.match(engine, /this\.missionOverdriveLevel\+\+/);
  assert.doesNotMatch(engine, /OVERDRIVE SPREAD!/);
  assert.match(renderer, /engine\.getSquadCompanionVisuals\(\)/);
  assert.match(renderer, /companion\?\.frames\[companion\.frameIndex\]/);
});

test('Hangar render helpers preserve the active upgrade view across parent state updates', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const hangar = read('components', 'SquadHangar.tsx');

  assert.match(startScreen, /const renderMobileDashboardContent = \(\) =>/);
  assert.match(startScreen, /const renderSelectedDashboard = \(\) =>/);
  assert.match(startScreen, /\{renderMobileDashboardContent\(\)\}/);
  assert.match(startScreen, /\{renderSelectedDashboard\(\)\}/);
  assert.doesNotMatch(startScreen, /<MobileDashboardContent\b|const MobileDashboardContent|function MobileDashboardContent/);
  assert.doesNotMatch(startScreen, /<SelectedDashboard\b|const SelectedDashboard|function SelectedDashboard/);
  assert.match(hangar, /setMode\('catalog'\);\s*\}, \[activePosition\]\);/);
  assert.doesNotMatch(hangar, /setMode\('catalog'\);[\s\S]{0,160}\}, \[activePosition, state\.equipped\]\);/);
  assert.match(hangar, /\[activePosition, state\.equipped\.left, state\.equipped\.right\]/);
});

test('main ship upgrades remain isolated to the selected ship through the Hangar and game launch', () => {
  const squad = read('services', 'squadProgression.ts');
  const app = read('App.tsx');

  assert.match(squad, /export type MainShipUpgradesByShip = Record<PlayerShipId, MainShipUpgradeLevels>/);
  assert.match(squad, /const currentUpgrades = state\.shipUpgrades\[shipId\]/);
  assert.match(squad, /\[shipId\]: \{ \.\.\.currentUpgrades, \[id\]: level \+ 1 \}/);
  assert.match(squad, /upgrades: \{ \.\.\.\(state\.shipUpgrades\[mainShipId\]/);
  assert.match(app, /upgradeMainShip\(current, usableShipId, id\)/);
  assert.match(app, /const runShipId = requestedLabShipId \?\? usableShipId/);
  assert.match(app, /buildRuntimeSquadLoadout\(campaignLabState, runShipId\)/);
});

test('gameplay pickups use transparent PNG artwork instead of founder portraits', () => {
  const renderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const iconNames = ['magnet.png', 'shield.png', 'research-beam.png'];

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
  assert.match(mapping, /POWERUP_PROJECTILE_UPGRADE_FRAMES/);
  assert.match(mapping, /POWERUP_MAGNET_FRAMES/);
  assert.match(mapping, /POWERUP_SHIELD_FRAMES/);
  assert.match(mapping, /POWERUP_RESEARCH_BEAM_FRAMES/);
  assert.match(renderer, /Math\.floor\(\(engine\.frameCount \+ entity\.variant\) \/ 8\) % frames\.length/);
});
