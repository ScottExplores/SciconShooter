const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('Home presents the missing-proposal reminder at most once per local day', () => {
  const startScreen = read('components', 'StartScreen.tsx');

  assert.match(startScreen, /WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY = 'scicon\.weekly-proposal-reminder'/);
  assert.match(startScreen, /const getLocalDayStamp = \(timestamp: number\)/);
  assert.match(startScreen, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(startScreen, /window\.localStorage\.setItem\(storageKey, dayStamp\)/);
  assert.match(startScreen, /weeklyProposalNeedsAttention[\s\S]*dashboardTab !== 'home'/);
  assert.match(startScreen, /showWeeklyProposalReminder && weeklyProposalRecovery/);
  assert.match(startScreen, />\s*Not now\s*<\/button>/);
  assert.match(startScreen, /onClick=\{openRecoverableWeeklyProposal\}[\s\S]*Choose proposal/);
});

test('Trophies, My Records, and the exact leading run carry proposal attention', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(startScreen, /tab\.id === 'trophies' && weeklyProposalNeedsAttention/);
  assert.match(startScreen, /data-proposal-ready=\{proposalAttention \? 'true' : 'false'\}/);
  assert.match(startScreen, /id === 'records' && weeklyProposalNeedsAttention/);
  assert.match(startScreen, /weeklyProposalRunId === run\.receipt\.runId/);
  assert.match(startScreen, /onOpenWeeklyLeaderProposal\(run\)/);
  assert.match(startScreen, /\? 'Choose proposal'[\s\S]*: 'Change proposal'/);
  assert.match(styles, /data-dashboard-tab='trophies'\]\[data-proposal-ready='true'/);
  assert.match(styles, /\.sci-proposal-attention/);
  assert.match(styles, /@keyframes sci-proposal-attention/);
});

test('App supplies only its verified recovery record to the chooser', () => {
  const app = read('App.tsx');

  assert.match(app, /weeklyProposalRecovery=\{weeklyProposalRecovery\}/);
  assert.match(app, /onOpenWeeklyLeaderProposal=\{openWeeklyLeaderProposal\}/);
  assert.match(app, /weeklyProposalRecovery\?\.record\.receipt\.runId !== record\.receipt\.runId/);
  assert.match(app, /pilotName=\{missionRecordPilotName \|\| playerNameInput \|\| 'PILOT'\}/);
});
