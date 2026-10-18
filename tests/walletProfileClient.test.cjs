const { loadService } = require('./helpers/loadService.cjs');
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
  assert.match(service, /walletProfileSnapshotsEqual\(dirty\.snapshot, remote\.snapshot\)/);
  assert.match(service, /sentWriteId: dirty\.writeId/);
  assert.match(service, /profile_sync_busy/);
  assert.match(app, /walletProfileSessionChainRef/);
  assert.match(app, /markWalletProfileDirty/);
  assert.match(app, /pagehide/);
  assert.match(app, /visibilitychange/);
  assert.match(route, /expectedWalletAddress !== session\.walletAddress/);
  assert.match(service, /action: 'logout',[\s\S]*walletAddress:/);
  assert.match(dirtyStore, /delete campaignProgress\.updatedAt/);
  assert.match(dirtyStore, /delete campaignProgress\.branchProgress\.updatedAt/);
  assert.match(app, /const queued = readWalletProfileDirty\(normalizedAddress\)[\s\S]*snapshot: queued\.snapshot/);
  assert.match(app, /retryDelayRemaining[\s\S]*setWalletProfileRetryNonce/);
  assert.match(app, /if \(!readWalletProfileDirty\(normalizedAddress\)\)[\s\S]*WALLET_PROFILE_SYNC_BUSY_MESSAGE/);
});

test('same-device sync churn stays recoverable with bounded retry backoff', async () => {
  const { getWalletProfileSyncFailurePolicy } = loadService(require('node:path').resolve(__dirname, '../services/walletProfileSyncPolicy.ts'));

  const busy = { status: 409, code: 'profile_sync_busy' };
  assert.deepEqual(getWalletProfileSyncFailurePolicy(busy, 0), {
    status: 'ready',
    message: 'Cloud save is busy. This device save is safe; saving will retry automatically or on your next wallet action.',
    retryDelayMs: 800
  });
  assert.equal(getWalletProfileSyncFailurePolicy(busy, 3).retryDelayMs, 6400);
  assert.equal(getWalletProfileSyncFailurePolicy(busy, 4).retryDelayMs, null);

  const conflict = { status: 409, code: 'profile_conflict' };
  assert.equal(getWalletProfileSyncFailurePolicy(conflict, 0).status, 'error');
  assert.equal(getWalletProfileSyncFailurePolicy(conflict, 0).retryDelayMs, null);
});

test('routine wallet disconnect preserves the verified device session for seamless reconnects', () => {
  const service = read('services', 'walletProfileService.ts');
  const sessionResolver = read('services', 'walletProfileSession.ts');
  const app = read('App.tsx');

  assert.match(
    service,
    /resolveWalletProfileSession\(\{[\s\S]*readSession: readWalletProfileSession/
  );
  assert.match(
    sessionResolver,
    /existingWalletAddress === expectedWalletAddress[\s\S]*return boundExistingSession/
  );
  assert.match(
    app,
    /const authenticatedSession = await loadAuthenticatedWalletProfile\([\s\S]*interactive: interactiveAuthorization[\s\S]*let profile = authenticatedSession\.profile/
  );
  assert.match(
    app,
    /if \(!normalizedAddress\) \{[\s\S]*HttpOnly profile session[\s\S]*return;[\s\S]*\}/
  );
  assert.doesNotMatch(app, /logoutWalletProfileSession/);
});

test('remembered wallets never open an authorization prompt during app startup', () => {
  const service = read('services', 'walletProfileService.ts');
  const app = read('App.tsx');
  const runtime = read('components', 'WalletRuntime.tsx');

  assert.match(service, /interactive = true/);
  assert.match(
    service,
    /authenticate: interactive[\s\S]*requestWalletProfileAuthentication\(address\)[\s\S]*wallet_profile_authorization_required/
  );
  assert.match(app, /walletProfileInteractiveAuthorizationRef = useRef\(false\)/);
  assert.match(app, /\{ interactive: interactiveAuthorization \}/);
  assert.match(app, /!interactiveAuthorization[\s\S]*error\.status === 401[\s\S]*setWalletProfileStatus\('guest'\)[\s\S]*setWalletError\(''\)/);
  assert.match(app, /walletProfileInteractiveAuthorizationRef\.current = true;[\s\S]*setWalletProfileAuthorizationNonce/);
  assert.doesNotMatch(runtime, /getConnectedBaseAccount\(\)/);
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

test('connected Campaign branch settlement sends completion facts while the server owns combat rewards', () => {
  const service = read('services', 'walletProfileService.ts');
  const start = service.indexOf('export const startWalletCampaignBranch');
  const end = service.indexOf('export const flushDirtyWalletProfile', start);
  const branchClient = service.slice(start, end);

  assert.match(branchClient, /action: 'start-campaign-branch'/);
  assert.match(branchClient, /branchId/);
  assert.match(branchClient, /action: 'settle-campaign-branch'/);
  assert.match(branchClient, /attemptToken/);
  assert.match(branchClient, /stageComplete/);
  assert.match(branchClient, /objectiveUnitsCompleted/);
  assert.match(branchClient, /destroyedByType: destroyedByType \?\? \{\}/);
  assert.match(branchClient, /collectedPresentCoins: collectedPresentCoins \?\? 0/);
  assert.match(branchClient, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.doesNotMatch(branchClient, /baseCoins:/);
  assert.doesNotMatch(branchClient, /oneTimeBonusCoins:/);
  assert.doesNotMatch(branchClient, /coinsAwarded:/);
});
