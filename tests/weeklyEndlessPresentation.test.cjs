const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('Weekly Run auto-advances every depth without Mission victory UI or fanfare', () => {
  const app = read('App.tsx');
  const start = app.indexOf('const showWaveVictory = async');
  const end = app.indexOf('const continueAfterWaveVictory', start);
  const handler = app.slice(start, end);
  const weeklyBranch = handler.indexOf('if (isWeeklyCampaignRun)');
  const victoryCue = handler.indexOf("audioService.playSound('mission_victory'");

  assert.ok(weeklyBranch >= 0 && weeklyBranch < victoryCue);
  assert.match(handler, /if \(isWeeklyCampaignRun\) \{\n\s*advanceWeeklyRunAfterDepth\(summary\);\n\s*return;/);
  assert.match(app, /const advanceWeeklyRunAfterDepth = \(summary: WaveVictorySummary\)/);
  assert.match(app, /setWaveContinueCommand[\s\S]*?targetLevelId: nextMission\.id[\s\S]*?targetWaveId: nextWaveId/);
  assert.match(app, /waveVictorySummary\?\.stageComplete && !isCampaignBranchRun && !isWeeklyCampaignRun/);
});
