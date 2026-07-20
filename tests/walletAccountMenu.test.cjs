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
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(app, /useState\(\(\) => \(\s*Boolean\(localStorage\.getItem\(STORAGE_KEYS\.WALLET_ADDRESS\)\)/);
  assert.match(runtime, /baseAccountProvider\.on\('accountsChanged', handleAccountsChanged\)/);
  assert.match(runtime, /baseAccountProvider\.on\('disconnect', handleDisconnect\)/);
  assert.match(runtime, /removeListener\('disconnect', handleDisconnect\)/);
  assert.match(runtime, /localStorage\.removeItem\(STORAGE_KEYS\.WALLET_ADDRESS\)/);
});

test('switching wallets loads the next wallet profile without saving the previous wallet into it', () => {
  const app = read('App.tsx');

  assert.match(app, /const walletProfileAddressRef = useRef<string \| null>\(null\)/);
  assert.match(app, /const hasLoadedWalletProfileRef = useRef\(walletRuntimeEnabled\)/);
  assert.match(app, /const walletProfileAddress = walletProfileAddressRef\.current/);
  assert.match(app, /walletProfileAddress === normalizedActiveWalletAddress/);
  assert.match(app, /getWalletProfileKey\(walletProfileAddress\)/);
  assert.match(app, /walletProfileAddressRef\.current = activeWalletAddress\.toLowerCase\(\)/);
  assert.match(app, /shouldMergeLocalProgress[\s\S]*: savedStats\.totalCoins \|\| 0/);
  assert.match(app, /getWalletProfileKey\(activeWalletAddress\),\s*JSON\.stringify\(nextWalletProfile\)/);
  assert.match(app, /const savedStats = localStorage\.getItem\(getWalletProfileKey\(walletAddress\)\)[\s\S]*return \{\s*highScore: 0/);
  assert.match(app, /if \(activeWalletAddress\) return;\s*walletProfileAddressRef\.current = null;\s*if \(gameState !== GameState\.MENU\) return/);
  assert.match(app, /if \(!activeWalletAddress\) \{\s*localStorage\.setItem\(STORAGE_KEYS\.HIGH_SCORE, stats\.score\.toString\(\)\)/);
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
