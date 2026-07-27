const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appSource = read('App.tsx');
const receiptClientSource = read('services/runReceiptService.ts');
const receiptApiSource = read('api/run-receipts.js');
const receiptServerSource = read('api/_lib/runReceipts.js');

test('every normal Mission death can submit its score without a rank or personal-best gate', () => {
  assert.match(appSource, /const isNonCompetitiveRun = isFounderSandboxRun \|\| isBossArchiveRun;/);
  assert.match(appSource, /const finalizeCurrentRun = async[\s\S]*?if \(isBossArchiveRun\) return null;/);
  assert.match(appSource, /if \(gameState === GameState\.GAMEOVER\) \{[\s\S]*?if \(isBossArchiveRun\)[\s\S]*?setShowNameInput\(true\);/);
  assert.match(appSource, /const score = stats\.score;[\s\S]*?saveScore\(name, score, wave/);
  assert.doesNotMatch(appSource, /setShowNameInput\(stats\.score > stats\.highScore\)/);
  assert.doesNotMatch(appSource, /setShowNameInput\([^)]*(qualif|rank|leaderboard)/i);
});

test('Campaign deaths restart their current Mission at Wave 1 and never expose paid Continue', () => {
  assert.match(appSource, /const retryGame = \(\) => \{[\s\S]*?Math\.floor\(stats\.wave\)[\s\S]*?level\.order === currentMissionNumber[\s\S]*?missionId: mission\.id,[\s\S]*?waveId: mission\.waveIds\[0\]/);
  assert.match(appSource, /const normalizedCampaignRequest[\s\S]*?waveId: requestedCampaignMission\.waveIds\[0\]/);
  assert.match(appSource, /gameOverContinueControls = !campaignCompletedRun && !isCampaignRun && !isNonCompetitiveRun/);
  assert.match(appSource, /onClick=\{retryGame\}[\s\S]*?>RETRY MISSION</);
  assert.match(appSource, /onRetryRun=\{retryGame\}/);
});

test('score receipt integrity accepts any authored Mission without trusting a client-selected starting Mission', () => {
  assert.doesNotMatch(appSource, /activeRunStartingWaveRef/);
  assert.doesNotMatch(receiptClientSource, /startingWave/);
  assert.doesNotMatch(receiptApiSource, /startingWave/);
  assert.doesNotMatch(receiptServerSource, /startingWave/);
  assert.match(receiptServerSource, /AUTHORED_MISSION_COUNT = Math\.max\(1, CAMPAIGN_CONFIG\.levels\?\.length \|\| 1\)/);
  assert.match(receiptServerSource, /metrics\.wave > AUTHORED_MISSION_COUNT/);
  assert.match(receiptServerSource, /const maximumPlausibleScoreForRun = \(metrics, durationSeconds\)/);
  assert.match(receiptServerSource, /profile\.missionNumber === metrics\.wave/);
  assert.match(receiptServerSource, /ordinaryDefeatCeiling:[\s\S]*?bossRewardBudget/);
  assert.match(receiptServerSource, /metrics\.enemiesDefeated \* ordinaryDefeatCeiling[\s\S]*?\+ bossRewardBudget/);
  assert.doesNotMatch(receiptServerSource, /metrics\.enemiesDefeated\s*\*[^\n;]*metrics\.wave/);
});

test('Campaign deaths settle the full run into weekly stats and only the failed Mission enemy delta into lifetime stats', () => {
  assert.match(appSource, /campaignRunCreditedEnemiesRef\.current \+= Math\.max\(0, Math\.floor\(summary\.enemiesDefeated\)\)/);
  assert.match(appSource, /const unsettledLifetimeCampaignEnemies = isCampaignRun[\s\S]*?stats\.enemiesDefeated - campaignRunCreditedEnemiesRef\.current/);
  assert.match(appSource, /applySquadRunResult\(current, \{[\s\S]*?score: stats\.score,[\s\S]*?enemiesDefeated: stats\.enemiesDefeated,[\s\S]*?coinsCollected: isCampaignRun \? 0 : stats\.coins/);
  assert.match(appSource, /recordLifetimeRun\(current, \{[\s\S]*?score: stats\.score,[\s\S]*?enemiesDefeated: unsettledLifetimeCampaignEnemies,[\s\S]*?coinsCollected: isCampaignRun \? 0 : stats\.coins/);
});
