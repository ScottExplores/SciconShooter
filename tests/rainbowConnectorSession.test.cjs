const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('RainbowKit connectors keep Base Account calls separate from injected and WalletConnect', async () => {
  const session = await import('../services/rainbowConnectorSession.ts');

  assert.equal(session.rainbowConnectorMethod({ id: 'baseAccount', type: 'baseAccount' }), 'base-account');
  assert.equal(session.rainbowConnectorMethod({ id: 'metaMask', type: 'metaMask' }), 'injected');
  assert.equal(session.rainbowConnectorMethod({ id: 'coinbase', type: 'coinbaseWallet' }), 'injected');
  assert.equal(session.rainbowConnectorMethod({ id: 'walletConnect', type: 'walletConnect' }), 'walletconnect');
  assert.equal(session.rainbowConnectorRdns({ id: 'metaMask' }), 'io.metamask');
  assert.equal(session.rainbowConnectorRdns({ id: 'rabby' }), 'io.rabby');
  assert.equal(session.rainbowConnectorRdns({ id: 'phantom' }), 'app.phantom');
  assert.equal(session.rainbowConnectorRdns({ id: 'okx' }), 'com.okex.wallet');
  assert.equal(session.rainbowConnectorRdns({ id: 'trust' }), 'com.trustwallet.app');
  assert.equal(session.rainbowConnectorRdns({ id: 'rainbow' }), 'me.rainbow');
  assert.equal(session.rainbowConnectorRdns({ id: 'coinbaseWalletSDK' }), 'com.coinbase.wallet');
});

test('WalletConnect QR stays on the qr release RainbowKit can render', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.overrides.qr, '0.5.4');
});
