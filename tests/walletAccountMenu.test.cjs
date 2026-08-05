const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('the connected wallet menu exposes switch and disconnect actions without clipping below the hero', () => {
  const control = read('components', 'WalletControl.tsx');
  const app = read('App.tsx');

  assert.match(control, /Choose Base Account/);
  assert.match(control, /Disconnect wallet/);
  assert.match(control, /Connect for onchain features/);
  assert.doesNotMatch(control, />\s*Sign out\s*</);
  assert.match(control, /bottom-full/);
  assert.match(control, /role="menu"/);
  assert.match(control, /aria-haspopup=\{isConnected \? 'menu'/);
  assert.match(app, /onSwitchAccount=\{switchWallet\}/);
  assert.match(app, /onDisconnect=\{disconnectWallet\}/);
});

test('switching reopens Base account access while disconnect remains a separate destructive action', () => {
  const app = read('App.tsx');
  const service = read('services', 'baseAccountWallet.ts');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(service, /export const switchBaseAccount/);
  assert.match(service, /method: 'wallet_connect'/);
  assert.match(service, /params: \[\{ version: '1' \}\]/);
  assert.match(service, /export const disconnectBaseAccount[\s\S]*baseAccountProvider\.disconnect\(\)/);
  assert.match(runtime, /type: 'switch-account'/);
  assert.match(runtime, /currentAction\.type === 'switch-account'/);
  assert.match(runtime, /await switchWallet\(\)/);
  assert.match(runtime, /Base kept the same account/);
  assert.match(app, /nextWallet\.address && !nextWallet\.error/);
});

test('returning sessions restore automatically and provider disconnect events clear local state', () => {
  const app = read('App.tsx');
  const service = read('services', 'baseAccountWallet.ts');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(app, /useState\(\(\) => \(\s*Boolean\(localStorage\.getItem\(STORAGE_KEYS\.WALLET_ADDRESS\)\)/);
  assert.match(runtime, /useState<Address \| null>\(getCachedBaseAccount\)/);
  assert.doesNotMatch(runtime, /getConnectedBaseAccount\(\)/);
  assert.match(runtime, /baseAccountProvider\.on\('accountsChanged', handleAccountsChanged\)/);
  assert.match(runtime, /baseAccountProvider\.on\('disconnect', handleDisconnect\)/);
  assert.match(runtime, /removeListener\('disconnect', handleDisconnect\)/);
  assert.match(runtime, /localStorage\.removeItem\(STORAGE_KEYS\.WALLET_ADDRESS\)/);
  assert.match(runtime, /localStorage\.setItem\(STORAGE_KEYS\.WALLET_ADDRESS, nextAddress\)/);
  assert.match(runtime, /parseBaseAccountAccounts\(accounts\)/);
  assert.match(runtime, /Base Account sent an invalid account update/);
  assert.match(service, /export const parseBaseAccountAddress = \(value: unknown\)/);
  assert.match(service, /export const parseBaseAccountAccounts = \(value: unknown\)/);
});

test('wallet transitions clear account-scoped state and disconnect locally even if provider cleanup fails', () => {
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(runtime, /const commitActiveWalletAddress = useCallback/);
  assert.match(runtime, /onRscBalanceChange\?\.\(\{ status: 'idle', balance: null \}\)/);
  assert.match(runtime, /onWalletPurchaseStatus\?\.\(\{ status: 'idle' \}\)/);
  assert.match(runtime, /onPlayerShipAccessChange\?\.\(\{ status: 'idle', access: null \}\)/);
  assert.match(runtime, /onPlayerShipPurchaseStatus\?\.\(\{ status: 'idle' \}\)/);
  assert.match(
    runtime,
    /const disconnectWallet = useCallback[\s\S]*finally \{[\s\S]*commitActiveWalletAddress\(null\)/
  );
  assert.match(runtime, /This wallet was disconnected from the game/);
});

test('late wallet requests cannot repopulate state after disconnect or account switch', () => {
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(
    runtime,
    /activeWalletAddressRef\.current\?\.toLowerCase\(\) === address\.toLowerCase\(\)/
  );
  assert.ok(
    (runtime.match(/!isCurrentWalletAddress\(address\)/g) || []).length >= 6,
    'balance, ship access, and purchase callbacks should all reject stale wallet results'
  );
  assert.match(runtime, /!isCurrentWalletAddress\(activeWalletAddress\)/);
});

test('switching wallets loads a distinct authenticated cloud profile', () => {
  const app = read('App.tsx');
  const profiles = read('services', 'walletProfileService.ts');

  assert.match(app, /const \[pilotProfile\] = useState\(initializeLocalPilotProfile\)/);
  assert.match(app, /const walletProfileId = getWalletProfileId\(normalizedAddress\)/);
  assert.match(app, /walletProfileAddressRef\.current = normalizedAddress/);
  assert.match(app, /loadAuthenticatedWalletProfile\(\s*activeWalletAddress as Address,\s*\{ interactive: interactiveAuthorization \}\s*\)/);
  assert.match(app, /walletProfileAddressRef\.current !== normalizedAddress/);
  assert.match(app, /hydrateActiveProfile\(\{[\s\S]*?profileId: pilotProfile\.id[\s\S]*?\}\)/);
  assert.match(app, /localStorage\.setItem\(STORAGE_KEYS\.WALLET_ADDRESS, activeWalletAddress\)/);
  assert.match(app, /getWalletRecords\(activeWalletAddress\)/);
  assert.match(app, /getWalletRuns\(activeWalletAddress\)/);
  assert.match(app, /getPlayerShipUnlocks\(\{/);
  assert.match(app, /authoritativePaidUnlockIds: access\?\.unlockedPlayerShips/);
  assert.match(profiles, /readCachedWalletProfile/);
  assert.match(profiles, /authenticateWalletProfile/);
  assert.match(profiles, /saveAuthenticatedWalletProfile/);
});

test('mission record minting offers in-context wallet switching and disconnect', () => {
  const preview = read('components', 'MissionRecordPreview.tsx');
  const app = read('App.tsx');

  assert.match(preview, /onSwitchAccount: \(\) => void/);
  assert.match(preview, /onDisconnect: \(\) => void/);
  assert.match(preview, /'Choose account'/);
  assert.match(preview, />\s*Disconnect\s*</);
  assert.match(app, /<MissionRecordPreview[\s\S]*onSwitchAccount=\{switchWallet\}[\s\S]*onDisconnect=\{disconnectWallet\}/);
});
