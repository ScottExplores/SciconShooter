const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

test('Boss Archive founder controls follow the live connected wallet lifecycle', () => {
  assert.match(
    appSource,
    /const isOwnerWallet = activeWalletAddress\?\.toLowerCase\(\) === DONATION_CONFIG\.RECIPIENT_ADDRESS\.toLowerCase\(\)/
  );
  assert.match(
    appSource,
    /const bossArchiveDeveloperApi = useMemo\(\s*\(\) => isOwnerWallet\s*\? createBossArchiveDeveloperControls\(\(\) => founderAuthorizationRef\.current\)\s*: null,\s*\[isOwnerWallet\]\s*\)/
  );
  assert.match(
    appSource,
    /const bossArchiveDeveloperControls = useMemo\(\(\) => \{\s*if \(!isOwnerWallet \|\| !bossArchiveDeveloperApi\) return null;/
  );
});

test('every Boss Archive developer callback rechecks live founder authorization', () => {
  assert.match(
    appSource,
    /const runBossArchiveFounderAction = useCallback\(\(action: \(\) => void\) => \{\s*if \(!founderAuthorizationRef\.current\) return false;\s*action\(\);\s*return true;/
  );

  const controlsStart = appSource.indexOf('const bossArchiveDeveloperControls = useMemo');
  const controlsEnd = appSource.indexOf('const handleClaimDailyGift', controlsStart);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart, 'Boss Archive developer control block must exist');
  const controlsSource = appSource.slice(controlsStart, controlsEnd);
  const callbackNames = [
    'onDailyLimitChange',
    'onUnlockAll',
    'onResetProgress',
    'onResetDailyCharges',
    'onSimulateNewUnlock',
    'onSimulateMastery',
    'onPreviewResult'
  ];

  callbackNames.forEach((callbackName, index) => {
    const callbackStart = controlsSource.indexOf(`${callbackName}:`);
    const nextCallbackName = callbackNames[index + 1];
    const callbackEnd = nextCallbackName
      ? controlsSource.indexOf(`${nextCallbackName}:`, callbackStart)
      : controlsSource.indexOf('\n    };', callbackStart);
    assert.ok(callbackStart >= 0 && callbackEnd > callbackStart, `${callbackName} callback must exist`);
    assert.match(
      controlsSource.slice(callbackStart, callbackEnd),
      /runBossArchiveFounderAction\(/,
      `${callbackName} must use the live founder guard`
    );
  });
});
