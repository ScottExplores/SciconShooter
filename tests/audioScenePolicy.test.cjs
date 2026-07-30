const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');

test('boss music follows only a major-boss warning or live major boss', () => {
  const runtimeStart = engineSource.indexOf('getRuntimeState(): GameRuntimeState');
  const runtimeEnd = engineSource.indexOf('getDebugSnapshot()', runtimeStart);
  const runtimeSource = engineSource.slice(runtimeStart, runtimeEnd);
  const majorStart = runtimeSource.indexOf('majorBossActive: Boolean(');
  const majorEnd = runtimeSource.indexOf('),\n      damageTaken', majorStart);
  const majorSource = runtimeSource.slice(majorStart, majorEnd);

  assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart);
  assert.ok(majorStart >= 0 && majorEnd > majorStart);
  assert.match(majorSource, /this\.bossRef && !this\.bossRef\.markedForDeletion/);
  assert.match(majorSource, /this\.inBossWarningSequence && this\.pendingBossType === 'gatekeeper'/);
  assert.doesNotMatch(majorSource, /miniBoss|invader|asteroid|stats\.isBossActive/);

  assert.match(
    appSource,
    /setMajorBossMusicActive\(\(current\) => \{[\s\S]*?if \(runtime\.majorBossActive\) return true;[\s\S]*?return current && runtime\.waveNumber >= runtime\.waveTotal;/
  );
  assert.match(
    appSource,
    /audioService\.setMusicScene\(isBossArchiveRun \|\| majorBossMusicActive \? 'boss' : 'mission'\)/
  );
});

test('internal Waves keep Mission music while only final results select the results scene', () => {
  assert.match(
    appSource,
    /if \(resultAudioActive \|\| gameState === GameState\.WAVE_COMPLETE \|\| gameState === GameState\.GAMEOVER\) \{[\s\S]*?setMusicScene\('results'\)[\s\S]*?if \(missionLoading \|\| gameState === GameState\.PLAYING \|\| gameState === GameState\.PAUSED\)/
  );
  assert.match(
    appSource,
    /setMusicScene\(isBossArchiveRun \|\| majorBossMusicActive \? 'boss' : 'mission'\)/
  );
  assert.match(
    appSource,
    /if \(!summary\.stageComplete\) \{[\s\S]*?setMajorBossMusicActive\(false\);[\s\S]*?setResultAudioActive\(false\);[\s\S]*?setGameState\(GameState\.PLAYING\);[\s\S]*?return;[\s\S]*?setResultAudioActive\(true\);[\s\S]*?audioService\.setMusicScene\('results'\);[\s\S]*?audioService\.playSound\('mission_victory'/
  );
});

test('App follows automatic playlist changes and enters results before asynchronous settlement', () => {
  assert.match(
    appSource,
    /const unsubscribe = audioService\.subscribeMusicTrack\(setMusicTrackId\);[\s\S]*?return \(\) => \{\s*unsubscribe\(\);\s*\}/
  );

  const handlerStart = appSource.indexOf('const showWaveVictory = async');
  const handlerEnd = appSource.indexOf('const continueAfterWaveVictory', handlerStart);
  const handler = appSource.slice(handlerStart, handlerEnd);
  const resultLatchIndex = handler.indexOf('setResultAudioActive(true)');
  const resultsIndex = handler.indexOf("audioService.setMusicScene('results')");
  const archiveSettlementIndex = handler.indexOf('await finalizeBossArchiveFight');
  const branchSettlementIndex = handler.indexOf('await settleCampaignBranchOutcome');

  assert.ok(resultLatchIndex >= 0, 'stage-final summaries should latch their result mix directly');
  assert.ok(resultsIndex > resultLatchIndex, 'the result scene should be selected at the same clear boundary');
  assert.ok(archiveSettlementIndex > resultsIndex, 'Boss Archive settlement should follow the result scene');
  assert.ok(branchSettlementIndex > resultsIndex, 'branch settlement should follow the result scene');
});
