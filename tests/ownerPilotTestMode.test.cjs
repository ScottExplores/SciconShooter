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

test('paused owner controls freeze the frame and preview champion selection without signing', () => {
  assert.match(appSource, /gameState === GameState\.PAUSED && isOwnerWallet && isOwnerTestRun/);
  assert.match(appSource, /Pilot Test Controls/);
  assert.match(appSource, /Jump wave/);
  assert.match(appSource, /top-\[max\(5\.25rem,calc\(env\(safe-area-inset-top\)\+5\.25rem\)\)\]/);
  assert.match(appSource, /Preview winner choice/);
  assert.match(appSource, /Finish test run/);
  assert.match(startScreenSource, /testChampionWinner\s*\?\s*setTestSelectedProposal\(proposal\)/);
  assert.match(startScreenSource, /This does not sign or submit a claim/);
});
