const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('Weekly Run persists each retained depth summary without React-commanding the live engine', () => {
  const app = read('App.tsx');
  const pause = read('components', 'PauseMenu.tsx');
  const progressStart = app.indexOf('const handleCampaignProgress');
  const progressEnd = app.indexOf('const finalizeCampaignCollectedCoins', progressStart);
  const progress = app.slice(progressStart, progressEnd);
  const advanceStart = app.indexOf('const advanceWeeklyRunAfterDepth');
  const advanceEnd = app.indexOf('const handleCampaignProgress', advanceStart);
  const advance = app.slice(advanceStart, advanceEnd);
  const start = app.indexOf('const showWaveVictory = async');
  const end = app.indexOf('const continueAfterWaveVictory', start);
  const handler = app.slice(start, end);
  const weeklyBranch = handler.indexOf('if (isWeeklyCampaignRun)');
  const victoryCue = handler.indexOf("audioService.playSound('mission_victory'");

  assert.ok(weeklyBranch >= 0 && weeklyBranch < victoryCue);
  assert.match(handler, /if \(isWeeklyCampaignRun\) \{\n\s*return;/);
  assert.match(app, /const advanceWeeklyRunAfterDepth = useCallback\(\(/);
  assert.match(progress, /persistWeeklyCampaignStreak\(nextStreak\);\n\s*advanceWeeklyRunAfterDepth\(summary, nextStreak\);/);
  assert.match(advance, /setWeeklyRunStageCount\(\(current\) => Math\.max\(current, runwayTarget\)\)/);
  assert.doesNotMatch(advance, /setWaveContinueCommand|setGameState\(GameState\.PLAYING\)/);
  assert.match(app, /maxPlayerDamagePerHit: isWeeklyCampaignRun \? 1 : undefined/);
  assert.match(app, /absoluteWaveNumber: runtime\.absoluteWaveNumber/);
  assert.match(app, /continuousRun: runtime\.continuousRun/);
  assert.match(pause, /continuousRun \? 'Weekly Run'/);
  assert.match(pause, /continuousRun \? `Wave \$\{absoluteWaveNumber\}` : missionName/);
  assert.match(pause, /Weekly Run, wave \$\{absoluteWaveNumber\}/);
  assert.match(app, /waveVictorySummary\?\.stageComplete && !isCampaignBranchRun && !isWeeklyCampaignRun/);
});
