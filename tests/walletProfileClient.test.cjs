const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('wallet profiles authenticate by signature and use same-origin cloud sessions', () => {
  const service = read('services', 'walletProfileService.ts');

  assert.match(service, /credentials: 'same-origin'/);
  assert.match(service, /action: 'challenge', address/);
  assert.match(service, /signBaseAccountMessage\(address, challenge\.message\)/);
  assert.match(service, /action: 'authenticate'/);
  assert.match(service, /action: 'save'/);
  assert.match(service, /walletAddress: normalizedAddress/);
  assert.match(service, /expectedRevision/);
});

test('wallet caches, selected ships, and active profile IDs are address scoped', () => {
  const service = read('services', 'walletProfileService.ts');
  const app = read('App.tsx');

  assert.match(service, /`wallet:\$\{normalizeWalletAddress\(address\)\}`/);
  assert.match(service, /scicon_wallet_profile_cache_v1:\$\{normalizeWalletAddress\(address\)\}/);
  assert.match(service, /`\$\{STORAGE_KEYS\.SELECTED_SHIP\}:\$\{profileId\.trim\(\)\.toLowerCase\(\)\}`/);
  assert.match(app, /profileTransitionNonceRef/);
  assert.match(app, /walletProfileAddressRef\.current !== normalizedAddress/);
  assert.match(app, /hydrateActiveProfile\(\{[\s\S]*?profileId: pilotProfile\.id[\s\S]*?\}\)/);
});

test('wallet transitions preserve dirty state and serialize cookie-changing actions', () => {
  const service = read('services', 'walletProfileService.ts');
  const dirtyStore = read('services', 'walletProfileDirtyStore.ts');
  const app = read('App.tsx');
  const route = read('api', '_lib', 'walletProfileRoute.js');

  assert.match(dirtyStore, /scicon_wallet_profile_dirty_v1:/);
  assert.match(service, /flushDirtyWalletProfile/);
  assert.match(service, /mergeWalletProfileSnapshots/);
  assert.match(app, /walletProfileSessionChainRef/);
  assert.match(app, /markWalletProfileDirty/);
  assert.match(app, /pagehide/);
  assert.match(app, /visibilitychange/);
  assert.match(route, /expectedWalletAddress !== session\.walletAddress/);
  assert.match(service, /action: 'logout',[\s\S]*walletAddress:/);
});

test('routine wallet disconnect preserves the verified device session for seamless reconnects', () => {
  const service = read('services', 'walletProfileService.ts');
  const app = read('App.tsx');

  assert.match(
    service,
    /const existingSession = await readWalletProfileSession\(\)[\s\S]*existingSession\.walletAddress\?\.toLowerCase\(\) === normalizeWalletAddress\(address\)[\s\S]*return existingSession\.profile/
  );
  assert.match(
    app,
    /if \(!normalizedAddress\) \{[\s\S]*HttpOnly profile session[\s\S]*return;[\s\S]*\}/
  );
  assert.doesNotMatch(app, /logoutWalletProfileSession/);
});

test('cloud snapshots never persist client-provided minted ownership', () => {
  const app = read('App.tsx');
  const backend = read('api', '_lib', 'walletProfiles.js');

  assert.match(app, /mintedMiniShips: \[\]/);
  assert.match(backend, /must[\s\S]*never be accepted from an offchain wallet-profile snapshot/);
  assert.doesNotMatch(
    backend.slice(
      backend.indexOf('const sanitizePermanentState'),
      backend.indexOf('const sanitizeStats')
    ),
    /mintedMiniShips:/
  );
});

test('official Boss Archive settlement sends only signed result facts and safely retries', () => {
  const service = read('services', 'walletProfileService.ts');
  const start = service.indexOf('export const settleWalletBossArchiveChallenge');
  const end = service.indexOf('export const flushDirtyWalletProfile', start);
  const settlementClient = service.slice(start, end);

  assert.match(settlementClient, /action: 'settle-boss-challenge'/);
  assert.match(settlementClient, /runToken/);
  assert.match(settlementClient, /victory: true/);
  assert.match(settlementClient, /clearTimeMs/);
  assert.match(settlementClient, /damageTaken/);
  assert.match(settlementClient, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(settlementClient, /error\.status >= 500/);
  assert.doesNotMatch(settlementClient, /rewardCoins:/);
  assert.doesNotMatch(settlementClient, /utcDateKey:/);
  assert.doesNotMatch(settlementClient, /dailyLimit:/);
});
