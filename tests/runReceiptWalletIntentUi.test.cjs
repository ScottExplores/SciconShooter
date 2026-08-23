const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'App.tsx'), 'utf8');

test('every App run-start path sends the active wallet intent explicitly', () => {
  const startCalls = [...appSource.matchAll(/startRunSession\(\{([\s\S]*?)\n\s*\}\)/g)]
    .map((match) => match[1]);
  assert.equal(startCalls.length, 4);
  for (const call of startCalls) {
    assert.match(call, /walletAddress:\s*runWalletIntent/);
  }
});

test('only a ready wallet profile becomes run identity intent', () => {
  assert.match(
    appSource,
    /const runWalletIntent = activeWalletAddress && walletProfileStatus === 'ready'[\s\S]*?\? activeWalletAddress[\s\S]*?: null/
  );
  assert.match(appSource, /const beginRunSession = useCallback[\s\S]*?\}, \[runWalletIntent\]\)/);
  assert.match(appSource, /const handleContinueWithRsc = useCallback[\s\S]*?\[continuesUsed,[\s\S]*?runWalletIntent\]/);
});

test('mission and Weekly Run launch paths wait during wallet identity hydration', () => {
  assert.match(appSource, /const launchGame = async[\s\S]*?walletIdentityHydrating[\s\S]*?Base Account is still loading/);
  assert.match(appSource, /const startWeeklyRunFromHome = useCallback[\s\S]*?walletIdentityHydrating[\s\S]*?Weekly Run again/);
});
