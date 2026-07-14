const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

test('project wallet enables a sticky test run with real flask charge and no leaderboard save path', () => {
  assert.match(appSource, /activeWalletAddress\?\.toLowerCase\(\) === DONATION_CONFIG\.RECIPIENT_ADDRESS\.toLowerCase\(\)/);
  assert.match(appSource, /type ActiveRunMode = 'standard' \| 'owner-test'/);
  assert.match(appSource, /OWNER_TEST_FLASK_COUNT = 40/);
  assert.match(appSource, /startRunSession\(\{ testRun: startInTestMode \}\)/);
  assert.match(appSource, /if \(isOwnerTestRun\) \{[\s\S]*?finalizeCurrentRun\(\)/);
  assert.match(appSource, /!isOwnerTestRun && stats\.score > stats\.highScore/);
});

test('engine test mode preserves lives and supports encounter-only wave jumps', () => {
  assert.match(engineSource, /testMode\?: boolean/);
  assert.match(engineSource, /jumpToCampaignWave\(waveNumber: number\)/);
  assert.match(engineSource, /this\.entities = \[\][\s\S]*?this\.resetWaveProgress\(\)/);
  assert.match(engineSource, /if \(!this\.testMode\) \{\s*this\.lives -= incomingDamage/);
  assert.match(canvasSource, /engine\.jumpToCampaignWave\(testWaveCommand\.wave\)/);
});

test('owner controls provide a separate frame freeze and put wave tools in the normal pause menu', () => {
  assert.match(appSource, /running: gameState === GameState\.PLAYING && !ownerFrameFrozen/);
  assert.match(appSource, /showFreezeControl: isOwnerWallet && isOwnerTestRun/);
  assert.match(appSource, /onToggleFreeze: isOwnerWallet && isOwnerTestRun/);
  assert.match(appSource, /gameState === GameState\.PAUSED && !showTestChampionPreview/);
  assert.match(appSource, /Founder Test Controls/);
  assert.match(appSource, /Select wave/);
  assert.match(appSource, /Preview winner/);
  assert.match(appSource, /Finish test run/);
  assert.match(startScreenSource, /testChampionWinner\s*\?\s*setTestSelectedProposal\(proposal\)/);
  assert.match(startScreenSource, /This does not sign or submit a claim/);
});
