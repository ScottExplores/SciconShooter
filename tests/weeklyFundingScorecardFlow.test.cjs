const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const previewSource = fs.readFileSync(path.join(root, 'components', 'MissionRecordPreview.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const flowSource = fs.readFileSync(path.join(root, 'services', 'weeklyFundingFlow.ts'), 'utf8');

test('mission scorecard exposes the weekly funding handoff below mint controls', () => {
  assert.match(previewSource, /Weekly funding/);
  assert.match(previewSource, /Choose weekly proposal/);
  assert.match(previewSource, /Browse eligible proposals/);
  assert.match(previewSource, /Sunday\\?'s noon Pacific cutoff/);
  assert.match(appSource, /weeklyFunding=\{missionRecordWeeklyFunding\}/);
  assert.match(appSource, /onOpenWeeklyFunding=\{openMissionRecordWeeklyFunding\}/);
});

test('only the matching finalized winner receives a real proposal claim flow', () => {
  assert.match(flowSource, /winner\.winnerRunId === receipt\.runId/);
  assert.match(flowSource, /status === 'finalized'/);
  assert.match(flowSource, /status: 'claimable'/);
  assert.match(flowSource, /receipt\.testRun/);
});

test('scorecard claim action opens the existing proposal hangar with its winner', () => {
  assert.match(appSource, /requestedChampionWinner=\{scorecardChampionWinner\}/);
  assert.match(startScreenSource, /testChampionWinner \|\| requestedChampionWinner/);
  assert.match(startScreenSource, /setDashboardTab\('proposals'\)/);
  assert.match(startScreenSource, /onClaimWeeklyChampion\(championClaimWinner, proposal\)/);
});
