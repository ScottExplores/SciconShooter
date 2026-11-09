const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const TX_HASH = `0x${'ab'.repeat(32)}`;
const CALLS_ID = `0x${'cd'.repeat(16)}`;

test('reload resumes an injected hash with a receipt and a Base calls id with calls status', async () => {
  const resume = await import('../services/walletPurchaseResume.ts');
  const service = fs.readFileSync(path.join(root, 'services', 'walletPurchaseService.ts'), 'utf8');
  const wallet = fs.readFileSync(path.join(root, 'services', 'baseAccountWallet.ts'), 'utf8');

  const persistedInjected = JSON.parse(JSON.stringify({ transactionHash: TX_HASH }));
  const persistedCalls = JSON.parse(JSON.stringify({ callsId: CALLS_ID }));
  assert.deepEqual(resume.selectPendingPurchaseConfirmation(persistedInjected), {
    kind: 'receipt',
    transactionHash: TX_HASH
  });
  assert.deepEqual(resume.selectPendingPurchaseConfirmation(persistedCalls), {
    kind: 'calls',
    callsId: CALLS_ID
  });
  assert.deepEqual(resume.selectPendingPurchaseConfirmation({
    callsId: CALLS_ID,
    transactionHash: TX_HASH
  }), {
    kind: 'hash',
    transactionHash: TX_HASH
  });

  const purchase = service.slice(
    service.indexOf('transactionHash = await sendRscPurchaseTransfer'),
    service.indexOf('} catch (error)', service.indexOf('transactionHash = await sendRscPurchaseTransfer'))
  );
  assert.match(purchase, /onTransactionHash: \(hash\) => \{[\s\S]*recordPendingWalletPurchaseHash/);
  assert.match(purchase, /onSubmitted: \(callsId\) => \{[\s\S]*recordPendingWalletPurchaseCallsId/);
  assert.match(service, /confirmation\.kind === 'receipt'[\s\S]*waitForBaseTransactionReceipt/);
  assert.match(service, /confirmation\.kind === 'calls'[\s\S]*waitForBaseCallsTransaction/);
  const injectedSender = wallet.slice(
    wallet.indexOf('const sendCallsWithActiveWallet'),
    wallet.indexOf('export const sendAttributedBaseCalls')
  );
  assert.match(injectedSender, /if \(onTransactionHash\) onTransactionHash\(hash\);\s*else onSubmitted\?\.\(hash\);/);
  assert.match(wallet, /onSubmitted\?\.\(callsId\)/);
  const rscPurchase = wallet.slice(wallet.indexOf('export const sendRscPurchaseTransfer'));
  assert.match(rscPurchase.slice(0, 1200), /onTransactionHash/);
});
