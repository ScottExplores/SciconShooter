const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('weekly proposal selection lazily signs only when an active Base wallet exists', () => {
  const app = read('App.tsx');
  const service = read('services/leaderboardService.ts');
  const authorization = read('services/weeklyProposalAuthorization.ts');

  assert.match(
    app,
    /activeWalletAddress[\s\S]*await import\('\.\/services\/baseAccountWallet'\)[\s\S]*signBaseAccountMessage/
  );
  assert.match(service, /selectWeeklyProposalWithFreshChallenge\(walletAuthorization, postProposalAction\)/);
  assert.match(authorization, /action: 'select-proposal-challenge'/);
  assert.match(authorization, /walletAuthorization\.signMessage\([\s\S]*walletAuthorization\.address,[\s\S]*challenge\.message/);
  assert.match(authorization, /action: 'select-proposal'[\s\S]*challengeId: challenge\.challengeId/);
});
