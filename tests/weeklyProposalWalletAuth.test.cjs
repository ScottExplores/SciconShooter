const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('weekly proposal selection lazily signs only when an active Base wallet exists', () => {
  const app = read('App.tsx');
  const service = read('services/leaderboardService.ts');

  assert.match(
    app,
    /activeWalletAddress[\s\S]*await import\('\.\/services\/baseAccountWallet'\)[\s\S]*signBaseAccountMessage/
  );
  assert.match(service, /action: 'select-proposal-challenge'/);
  assert.match(service, /walletAuthorization\.signMessage\(walletAuthorization\.address, challenge\.message\)/);
  assert.match(service, /action: 'select-proposal'[\s\S]*\.\.\.signaturePayload/);
});
