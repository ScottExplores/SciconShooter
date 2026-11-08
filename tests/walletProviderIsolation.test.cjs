const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('a rejected provider attempt restores the committed session', async () => {
  const session = await import('../services/evmWalletDiscovery.ts');
  const injected = { request: async () => [] };
  const base = { request: async () => [] };
  const walletConnect = { request: async () => [] };
  const committed = { method: 'injected', name: 'MetaMask', provider: injected };
  const pendingBase = { method: 'base-account', name: 'Base Account', provider: base };
  const pendingConnect = { method: 'walletconnect', name: 'WalletConnect', provider: walletConnect };

  assert.equal(session.providerAfterAttempt(committed, pendingBase, 'rejected'), committed);
  assert.equal(session.providerAfterAttempt(committed, pendingConnect, 'cancelled'), committed);
  assert.equal(session.providerAfterAttempt(null, pendingBase, 'rejected'), null);
  assert.equal(session.providerAfterAttempt(committed, pendingConnect, 'authorized'), pendingConnect);
});

test('account listeners follow injected and WalletConnect and drop when leaving them', async () => {
  const session = await import('../services/evmWalletDiscovery.ts');
  const injected = { id: 'injected' };
  const walletConnect = { id: 'walletconnect' };
  const baseProvider = { id: 'base' };
  assert.equal(session.accountEventProvider({
    method: 'injected',
    name: 'Rabby',
    provider: injected
  }), injected);
  assert.equal(session.accountEventProvider({
    method: 'walletconnect',
    name: 'WalletConnect',
    provider: walletConnect
  }), walletConnect);
  assert.equal(session.accountEventProvider({
    method: 'base-account',
    name: 'Base Account',
    provider: baseProvider
  }), null);
  assert.equal(session.accountEventProvider(null), null);
});

test('chooser authorization commits the provider only after the signature', () => {
  const runtime = fs.readFileSync(path.join(root, 'components', 'WalletRuntime.tsx'), 'utf8');
  const select = runtime.slice(
    runtime.indexOf('const selectWalletChoice'),
    runtime.indexOf('const cancelChooser')
  );
  assert.doesNotMatch(select, /setActiveEvmSession/);
  assert.match(select, /authorizeAddress\(address, generation, attempt\)/);
  assert.match(select, /restoreCommittedProvider\(committed\)/);
  const authorize = runtime.slice(
    runtime.indexOf('const authorizeAddress'),
    runtime.indexOf('useEffect(() => {', runtime.indexOf('const authorizeAddress'))
  );
  const signAt = authorize.indexOf('loadAuthenticatedWalletProfile');
  const commitAt = authorize.indexOf('setActiveEvmSession');
  assert.ok(signAt > -1 && commitAt > signAt);
});
