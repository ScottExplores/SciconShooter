const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const appSource = read('App.tsx');
const canvasSource = read('components/GameCanvas.tsx');
const engineSource = read('services/gameLogic.ts');
const overlaySource = read('components/WaveVictoryOverlay.tsx');
const typesSource = read('types.ts');

test('a stage finale pauses after the departure and waits for an explicit next-stage command', () => {
  assert.match(engineSource, /export interface WaveVictorySummary/);
  assert.match(engineSource, /this\.waveVictorySummary = this\.buildWaveVictorySummary\(\)/);
  assert.match(engineSource, /this\.waveVictoryReady = true;\s*this\.gameActive = false;/);
  assert.match(engineSource, /continueToNextWave\(\)\s*{[\s\S]*?this\.startNextWave\(\);[\s\S]*?return true;/);
  assert.match(engineSource, /if \(this\.previewMode\)\s*{\s*this\.startNextWave\(\);/);
});

test('stage records are calculated from baselines preserved across internal waves', () => {
  assert.match(engineSource, /const scoreStart = stageComplete \? this\.waveStartScore : this\.tacticalWaveStartScore/);
  assert.match(engineSource, /const enemyStart = stageComplete \? this\.waveStartEnemiesDefeated : this\.tacticalWaveStartEnemiesDefeated/);
  assert.match(engineSource, /const coinStart = stageComplete \? this\.waveStartTotalCoins : this\.tacticalWaveStartTotalCoins/);
  assert.match(engineSource, /const flightFrames = stageComplete \? this\.waveFlightFrames : this\.tacticalWaveFlightFrames/);
  assert.match(engineSource, /waveCoinsCollected: Math\.max\(0, this\.stats\.totalCoins - this\.tacticalWaveStartTotalCoins\)/);
  assert.match(engineSource, /this\.waveStartScore = this\.stats\.score/);
  assert.match(engineSource, /this\.tacticalWaveStartScore = this\.stats\.score/);
  assert.match(engineSource, /if \(resetStageSummary\) \{[\s\S]*?this\.waveStartScore = this\.stats\.score/);
});

test('the production canvas continuously advances internal Campaign waves', () => {
  assert.match(canvasSource, /onWaveVictory\?: \(summary: WaveVictorySummary\) => void/);
  assert.match(canvasSource, /pauseAtInternalWaveResults\?: boolean/);
  assert.match(canvasSource, /pauseAtInternalWaveResults = false/);
  assert.match(canvasSource, /new GameEngine\(initialStats, \{[\s\S]*?pauseAtInternalWaveResults,/);
  assert.match(canvasSource, /lastWaveVictoryIdRef\.current !== waveVictory\.id/);
  assert.match(canvasSource, /onWaveVictoryRef\.current\?\.\(waveVictory\)/);
  assert.match(canvasSource, /handledWaveContinueNonceRef\.current === waveContinueCommand\.nonce/);
  assert.match(canvasSource, /engine\.continueToNextWave\(\)/);
  assert.match(appSource, /pauseAtInternalWaveResults: false/);
  assert.doesNotMatch(appSource, /pauseAtInternalWaveResults: isCampaignRun/);
  assert.match(appSource, /const isCampaignRun = activeRunMode === 'campaign' \|\| activeRunMode === 'campaign-replay'/);
});

test('the app keeps the real game mounted behind the stage-complete overlay state', () => {
  assert.match(typesSource, /WAVE_COMPLETE = 'WAVE_COMPLETE'/);
  assert.match(appSource, /gameState === GameState\.WAVE_COMPLETE/);
  assert.match(appSource, /onWaveVictory: showWaveVictory/);
  assert.match(appSource, /waveContinueCommand/);
  assert.match(appSource, /<WaveVictoryOverlay[\s\S]{0,220}summary={waveVictorySummary}[\s\S]{0,220}onContinue={continueAfterWaveVictory}/);
  assert.match(appSource, /waveVictorySummary\.campaignComplete \|\| !waveVictorySummary\.hasNextStage/);
  assert.match(appSource, /setCampaignCompletedRun\(true\);[\s\S]*?setGameState\(GameState\.GAMEOVER\);\s*return;/);
  assert.match(appSource, /!campaignCompletedRun && !isCampaignRun && !isNonCompetitiveRun/);
  assert.match(appSource, /campaignComplete={campaignCompletedRun}/);
});

test('internal Campaign summaries are discarded before settlement or the ending overlay', () => {
  const handlerStart = appSource.indexOf('const showWaveVictory = async');
  const handlerEnd = appSource.indexOf('const continueAfterWaveVictory', handlerStart);
  const handlerSource = appSource.slice(handlerStart, handlerEnd);
  const internalWaveGuard = handlerSource.indexOf('if (!summary.stageComplete)');
  const presentEnding = handlerSource.indexOf('setWaveVictorySummary(summary)');

  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(
    handlerSource,
    /if \(isCampaignRun\) \{[\s\S]*?if \(!summary\.stageComplete\) \{[\s\S]*?setWaveContinueCommand\(current => \(\{ nonce: \(current\?\.nonce \?\? 0\) \+ 1 \}\)\);[\s\S]*?return;[\s\S]*?handleCampaignProgress\(summary\);[\s\S]*?finalizeCampaignCollectedCoins\(summary\);/
  );
  assert.ok(internalWaveGuard >= 0 && internalWaveGuard < presentEnding);
});

test('Campaign result settlement uses attempt-scoped IDs and a stable final collected-coin receipt', () => {
  assert.match(appSource, /const campaignAttemptIdRef = useRef\(''\)/);
  assert.match(appSource, /campaignAttemptIdRef\.current = normalizedCampaignRequest[\s\S]*?globalThis\.crypto\?\.randomUUID\?\.\(\)/);
  assert.match(appSource, /const finalizeCampaignCollectedCoins = useCallback\(\(summary: WaveVictorySummary\) => \{/);
  assert.match(appSource, /const collectedCoins = Math\.max\(0, Math\.floor\(summary\.coinsCollected\)\)/);
  assert.match(appSource, /id: `campaign:\$\{resultId\}:collected`/);
  assert.match(appSource, /const showWaveVictory = async \(summary: WaveVictorySummary\) => \{[\s\S]*?handleCampaignProgress\(summary\);[\s\S]*?finalizeCampaignCollectedCoins\(summary\);/);
});

test('the victory overlay uses the layered Scicon reveal packs and shows mission metrics', () => {
  assert.match(overlaySource, /weekly-champion-reveal\/parts/);
  assert.match(overlaySource, /mission-record-verification\/parts/);
  assert.match(overlaySource, /plaque-body\.png/);
  assert.match(overlaySource, /record-card-body\.png/);
  assert.match(overlaySource, /'Victory'/);
  assert.match(overlaySource, />Enemies</);
  assert.match(overlaySource, />Coins</);
  assert.match(overlaySource, />Flight</);
  assert.match(overlaySource, /Continue/);
  assert.match(overlaySource, /Mission \{summary\.stage\}/);
  assert.match(overlaySource, /`Mission \$\{summary\.nextStage\}`/);
  assert.match(overlaySource, /summary\.campaignComplete \|\| !summary\.hasNextStage/);
  assert.match(overlaySource, /Campaign Complete/);
  assert.match(overlaySource, /All 20 missions cleared/);
  assert.match(overlaySource, /Campaign Map/);
  assert.match(overlaySource, /Wave Complete/);
  assert.match(overlaySource, /campaignSettlement/);
  assert.doesNotMatch(overlaySource, /Stage \{summary\.|All 20 stages cleared/);
});
