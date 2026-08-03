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

test('internal Waves cannot opt into result pauses and Mission results keep the explicit continue channel', () => {
  assert.match(canvasSource, /onWaveVictory\?: \(summary: WaveVictorySummary\) => void/);
  assert.doesNotMatch(canvasSource, /pauseAtInternalWaveResults/);
  assert.doesNotMatch(engineSource, /pauseAtInternalWaveResults/);
  assert.match(canvasSource, /lastWaveVictoryIdRef\.current !== waveVictory\.id/);
  assert.match(canvasSource, /onWaveVictoryRef\.current\?\.\(waveVictory\)/);
  assert.match(canvasSource, /handledWaveContinueNonceRef\.current === waveContinueCommand\.nonce/);
  assert.match(canvasSource, /engine\.continueToNextWave\(\)/);
  assert.doesNotMatch(appSource, /pauseAtInternalWaveResults/);
  assert.match(appSource, /const isCompetitiveCampaignRun = activeRunMode === 'campaign' \|\| activeRunMode === 'campaign-replay'/);
  assert.match(appSource, /const isCampaignRun = isCompetitiveCampaignRun \|\| isCampaignLabRun/);
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

test('internal summaries are ignored while only Mission-final Campaign summaries settle and render', () => {
  const handlerStart = appSource.indexOf('const showWaveVictory = async');
  const handlerEnd = appSource.indexOf('const continueAfterWaveVictory', handlerStart);
  const handlerSource = appSource.slice(handlerStart, handlerEnd);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  assert.match(handlerSource, /if \(!summary\.stageComplete\) \{[\s\S]*?setWaveContinueCommand[\s\S]*?setGameState\(GameState\.PLAYING\);[\s\S]*?return;/);
  assert.ok(
    handlerSource.indexOf("audioService.playSound('mission_victory'")
      > handlerSource.indexOf('if (!summary.stageComplete)'),
    'the victory signet must sit after the internal-Wave early return'
  );
  assert.match(handlerSource, /if \(isCampaignRun\) \{\s*finalizeCampaignCollectedCoins\(summary\);\s*\}/);
  assert.match(handlerSource, /setWaveVictorySummary\(summary\);[\s\S]*?setGameState\(GameState\.WAVE_COMPLETE\)/);
  assert.match(appSource, /onCampaignProgress: handleCampaignProgress/);
  assert.match(appSource, /const handleCampaignProgress[\s\S]{0,220}if \(!summary\.stageComplete\) return/);
  assert.match(appSource, /waveVictorySummary\?\.stageComplete && !isCampaignBranchRun/);
});

test('Campaign result settlement uses attempt-scoped IDs and a stable final collected-coin receipt', () => {
  assert.match(appSource, /const campaignAttemptIdRef = useRef\(''\)/);
  assert.match(appSource, /campaignAttemptIdRef\.current = normalizedCampaignRequest[\s\S]*?globalThis\.crypto\?\.randomUUID\?\.\(\)/);
  assert.match(appSource, /const finalizeCampaignCollectedCoins = useCallback\(\(summary: WaveVictorySummary\) => \{/);
  assert.match(appSource, /const collectedCoins = Math\.max\(0, Math\.floor\(summary\.coinsCollected\)\)/);
  assert.match(appSource, /id: `campaign:\$\{resultId\}:collected`/);
  assert.match(appSource, /masteryEligible: summary\.stageComplete && campaignRunMasteryEligibleRef\.current/);
  assert.match(appSource, /const showWaveVictory = async \(summary: WaveVictorySummary\) => \{[\s\S]*?finalizeCampaignCollectedCoins\(summary\);/);
});

test('continuing into the next Mission makes death retry that Mission from its first Wave', () => {
  assert.match(
    appSource,
    /if \(isCampaignRun && waveVictorySummary\.nextLevelId\) \{[\s\S]*?const nextMission = getCampaignMissionById\(waveVictorySummary\.nextLevelId\)[\s\S]*?const nextWaveId = nextMission\?\.waveIds\[0\] \?\? waveVictorySummary\.nextWaveId[\s\S]*?setActiveCampaignLaunch\(\{[\s\S]*?missionId: nextMission\.id,[\s\S]*?waveId: nextWaveId,[\s\S]*?kind: nextKind/
  );
});

test('Campaign mastery settlement still detects newly affordable upgrades without cluttering the Mission result card', () => {
  assert.match(appSource, /newlyAffordableUpgrade: string \| null/);
  assert.match(appSource, /getNewlyAffordableSquadUpgrade\(weeklyBeforeCredit, credit\.state\.coins, usableShipId\)/);
  assert.doesNotMatch(appSource, /newlyAffordableUpgrade=\{isCampaignRun/);
  assert.doesNotMatch(overlaySource, /Campaign reward breakdown|Mission Mastered|Next Mission unlocked|Upgrade now affordable|wave-record-reward-chip/);
  assert.match(overlaySource, /className="wave-record-stars"/);
  assert.match(overlaySource, /className="wave-victory-secondary is-hangar"/);
  assert.match(overlaySource, /className="wave-victory-secondary is-map"/);
  assert.match(overlaySource, /className="wave-victory-secondary is-home"/);
});

test('the victory overlay uses the layered Scicon reveal packs and shows mission metrics', () => {
  assert.match(overlaySource, /weekly-champion-reveal\/parts/);
  assert.match(overlaySource, /mission-record-verification\/parts/);
  assert.match(overlaySource, /plaque-body\.png/);
  assert.match(overlaySource, /record-card-body\.png/);
  assert.match(overlaySource, /'Victory'/);
  assert.match(overlaySource, />Enemies</);
  assert.match(overlaySource, />Tokens</);
  assert.doesNotMatch(overlaySource, />Coins</);
  assert.match(overlaySource, />Flight</);
  assert.match(overlaySource, /Continue/);
  assert.match(overlaySource, /Mission \{summary\.stage\}/);
  assert.match(overlaySource, /`Mission \$\{summary\.nextStage\}`/);
  assert.match(overlaySource, /summary\.campaignComplete \|\| !summary\.hasNextStage/);
  assert.match(overlaySource, /Campaign Complete/);
  assert.match(overlaySource, /All 20 missions cleared/);
  assert.match(overlaySource, /Campaign Map/);
  assert.doesNotMatch(overlaySource, /Wave Complete|Checkpoint secured|is-wave-result|wave-record-shell-wave/);
  assert.match(overlaySource, /campaignSettlement/);
  assert.doesNotMatch(overlaySource, /Stage \{summary\.|All 20 stages cleared/);
});
