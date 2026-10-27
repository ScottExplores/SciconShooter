const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('published player ship terms preserve exact Base asset units', () => {
  const constants = read('constants.ts');
  assert.match(constants, /BIO_CONTRACT_ADDRESS:\s*"0x226a2fa2556c48245e57cd1cba4c6c9e67077dd2"/);
  assert.match(constants, /CBBTC_CONTRACT_ADDRESS:\s*"0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"/);
  assert.doesNotMatch(constants, /BIO_SHIP_HOLDING_REQUIREMENT/);
  assert.match(constants, /'eth-ship'[\s\S]*amount:\s*'0\.001'[\s\S]*amountRaw:\s*'1000000000000000'/);
  assert.match(constants, /'btc-ship'[\s\S]*amount:\s*'0\.00008'[\s\S]*amountRaw:\s*'8000'/);
});

test('wallet helpers use exact recoverable native ETH and cbBTC transfer paths', () => {
  const wallet = read('services', 'baseAccountWallet.ts');
  assert.match(wallet, /export const getBioBalance/);
  assert.match(wallet, /DONATION_CONFIG\.BIO_CONTRACT_ADDRESS/);
  assert.doesNotMatch(wallet, /raw >= minimum/);
  assert.doesNotMatch(wallet, /BIO_SHIP_HOLDING_REQUIREMENT/);
  assert.match(wallet, /method:\s*'eth_chainId'/);
  assert.match(wallet, /export const sendEthShipPurchaseTransfer/);
  const nativePayment = wallet.slice(
    wallet.indexOf('export const sendEthShipPurchaseTransfer'),
    wallet.indexOf('export const waitForBaseTransactionReceipt')
  );
  assert.match(nativePayment, /method:\s*'wallet_sendCalls'/);
  assert.match(wallet, /value:\s*toHex\(amountRaw\)/);
  assert.match(nativePayment, /data:\s*'0x'/);
  assert.match(nativePayment, /onSubmitted\?\.\(callsId\)/);
  assert.doesNotMatch(nativePayment, /dataSuffix|capabilities/);
  assert.match(wallet, /export const sendCbBtcShipPurchaseTransfer/);
  assert.match(wallet, /to:\s*DONATION_CONFIG\.CBBTC_CONTRACT_ADDRESS/);
  assert.match(wallet, /functionName:\s*'transfer'/);
});

test('ship access client validates quotes and recovers submitted purchases', () => {
  const client = read('services', 'playerShipAccessService.ts');
  const pending = read('services', 'playerShipPurchasePendingStore.ts');
  assert.match(client, /fetch\('\/api\/player-ship-access'/);
  assert.match(client, /export const loadPlayerShipAccess/);
  assert.match(client, /assertPlayerShipQuoteMatchesPublishedTerms/);
  assert.match(client, /quote\.amountRaw !== terms\.amountRaw/);
  assert.match(client, /quote\.recipientAddress\.toLowerCase\(\) !== recipient/);
  assert.match(client, /export const executePlayerShipPurchase/);
  assert.match(client, /export const resumePendingPlayerShipPurchase/);
  assert.match(client, /recordPendingPlayerShipPurchaseCallsId\(walletAddress, quote\.orderId, callsId\)/);
  assert.match(pending, /quoteToken:\s*string/);
  assert.match(pending, /recordPendingPlayerShipPurchaseCallsId/);
  assert.match(pending, /recordPendingPlayerShipPurchaseHash/);
});

test('wallet runtime keeps ship access and purchase lifecycles distinct', () => {
  const runtime = read('components', 'WalletRuntime.tsx');
  assert.match(runtime, /type:\s*'refresh-player-ship-access'/);
  assert.match(runtime, /type:\s*'purchase-player-ship'; skuId: PlayerShipPurchaseSkuId/);
  assert.match(runtime, /export interface PlayerShipAccessUpdate/);
  assert.match(runtime, /onPlayerShipAccessChange\?:/);
  assert.match(runtime, /export interface PlayerShipPurchaseStatusUpdate/);
  assert.match(runtime, /onPlayerShipPurchaseStatus\?:/);
  assert.match(runtime, /onPlayerShipPurchaseSuccess\?:/);
  assert.match(runtime, /resumePendingPlayerShipPurchase/);
});
