const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('a remembered Base Account hydrates underneath the startup splash', () => {
  const app = read('App.tsx');
  assert.match(app, /\{walletRuntimeEnabled \? \(/);
  assert.doesNotMatch(app, /walletRuntimeEnabled && !startupLoading/);
  assert.ok(
    app.indexOf('{walletRuntimeEnabled ? (') < app.indexOf('{startupLoading || walletIdentityHydrating ? ('),
    'wallet runtime mounts before the startup overlay branch'
  );
  assert.doesNotMatch(app, /walletIdentityTransitionNonce/);
  const identityTransition = app.slice(
    app.indexOf('const handleWalletIdentityTransition'),
    app.indexOf('const handleWalletRuntimeChange')
  );
  assert.match(identityTransition, /shouldHydrateWalletIdentityTransition\([\s\S]*setWalletIdentityHydrating\(identityHydrating\)/);
  assert.match(identityTransition, /resolveWalletTransitionReloadSafety\(/);
  assert.match(identityTransition, /if \(address\) void refreshWalletActivity\(\)/);
  assert.doesNotMatch(identityTransition, /setWalletIdentityHydrating\(true\)/);
  const hydrationStart = app.indexOf('const transitionNonce = profileTransitionNonceRef.current + 1;');
  const hydrationRelease = app.indexOf('setWalletIdentityHydrating(false);', hydrationStart);
  const cloudReconciliation = app.indexOf('walletProfileSessionChainRef.current =', hydrationStart);
  assert.ok(hydrationStart >= 0 && cloudReconciliation > hydrationStart);
  assert.ok(
    hydrationRelease > hydrationStart && hydrationRelease < cloudReconciliation,
    'the coherent device snapshot releases the overlay before cloud reconciliation'
  );
});

test('wallet resources dedupe same-account reads and retain last good values', () => {
  const app = read('App.tsx');
  const runtime = read('components', 'WalletRuntime.tsx');
  const startScreen = read('components', 'StartScreen.tsx');

  assert.match(runtime, /createAddressResourceCoordinator<RscBalanceSnapshot>/);
  assert.match(runtime, /createAddressResourceCoordinator<PlayerShipAccessSnapshot>/);
  assert.match(runtime, /rscBalanceCoordinator\.setOwner\(nextAddress\)/);
  assert.match(runtime, /playerShipAccessCoordinator\.setOwner\(nextAddress\)/);
  assert.match(runtime, /void playerShipAccessCoordinator\.refresh\(\)/);
  assert.match(runtime, /refreshRscBalance\(address, 'force'\)/);
  assert.match(runtime, /playerShipAccessCoordinator\.commitAuthoritative/);
  assert.match(runtime, /status: state\.hasValue\s*\? 'ready'/);
  assert.doesNotMatch(
    runtime,
    /useEffect\(\(\) => \{\s*if \(!onPlayerShipAccessChange\)[\s\S]{0,240}refreshPlayerShipAccess\(activeWalletAddress\)/
  );
  assert.doesNotMatch(
    startScreen,
    /dashboardTab === 'hangar' && walletAddress\) onRefreshRscBalance/
  );
  assert.match(app, /const \[records, runs\] = await Promise\.all\(/);
  assert.doesNotMatch(app, /Promise\.allSettled\(\[\s*getWalletRecordsStrict/);
  assert.match(startScreen, /Wallet activity did not load/);
  assert.match(startScreen, />\s*Try again\s*<\/button>/);
  assert.match(startScreen, />\s*Retry\s*<\/button>/);
});

test('noninteractive access refresh trusts the wallet-bound status endpoint', () => {
  const client = read('services', 'playerShipAccessService.ts');
  const loadStart = client.indexOf('export const loadPlayerShipAccess');
  const loadEnd = client.indexOf('const validQuotedRecipient', loadStart);
  const loadAccess = client.slice(loadStart, loadEnd);

  assert.match(loadAccess, /if \(interactive\)/);
  assert.match(loadAccess, /loadAuthenticatedWalletProfile\(walletAddress, \{ interactive: true \}\)/);
  assert.match(loadAccess, /action: 'status'/);
  assert.doesNotMatch(loadAccess, /loadAuthenticatedWalletProfile\(walletAddress, \{ interactive \}\)/);
});

test('StrictMode cleanup invalidates wallet reads without terminally disposing coordinators', () => {
  const app = read('App.tsx');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.doesNotMatch(app, /walletActivityCoordinator\.dispose\(\)/);
  assert.doesNotMatch(runtime, /rscBalanceCoordinator\.dispose\(\)/);
  assert.doesNotMatch(runtime, /playerShipAccessCoordinator\.dispose\(\)/);
  assert.match(app, /walletActivityCoordinator\.setOwner\(null\)/);
  assert.match(runtime, /rscBalanceCoordinator\.setOwner\(null\)/);
  assert.match(runtime, /playerShipAccessCoordinator\.setOwner\(null\)/);
});

test('score and mint activity commits are guarded across A to B to A wallet changes', () => {
  const app = read('App.tsx');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(app, /walletActivityOwnerGenerationRef\.current === scoreWalletOwnerGeneration/);
  assert.match(app, /initiatedMint\.ownerGeneration === walletActivityOwnerGenerationRef\.current/);
  assert.match(runtime, /walletAddress: address[\s\S]{0,80}runId: receipt\.runId/);
  assert.match(runtime, /onMissionMintStatus\([\s\S]{0,220}'confirmed'[\s\S]{0,220}context/);
});

test('switching accounts during a delayed mint releases the busy UI and ignores the old completion', () => {
  const app = read('App.tsx');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(
    app,
    /missionMintStatus === 'authorizing' \|\| missionMintStatus === 'confirming'[\s\S]{0,180}setMissionMintStatus\('idle'\)/
  );
  assert.match(app, /setMissionMintMessage\(''\)[\s\S]{0,100}missionMintContextRef\.current = null/);
  assert.match(runtime, /if \(!isCurrentWalletAddress\(address\)\) return/);
});
