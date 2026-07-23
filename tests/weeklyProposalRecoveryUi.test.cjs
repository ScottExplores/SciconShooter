const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('Home presents the missing-proposal reminder at most once every four hours', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const reminder = read('services', 'weeklyProposalReminder.ts');

  assert.match(reminder, /WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(reminder, /WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY = 'scicon\.weekly-proposal-reminder'/);
  assert.match(startScreen, /parseWeeklyProposalReminderTimestamp/);
  assert.match(startScreen, /isWeeklyProposalReminderDue\(weeklyClock, lastReminderAt\)/);
  assert.match(startScreen, /window\.localStorage\.getItem\(storageKey\)/);
  assert.match(startScreen, /serializeWeeklyProposalReminderTimestamp\(weeklyClock\)/);
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

test('the mandatory post-score chooser cannot be dismissed while recovery openings can close', () => {
  const app = read('App.tsx');
  const picker = read('components', 'WeeklyProposalSelection.tsx');

  assert.match(app, /requiresWeeklyProposal[\s\S]*setWeeklyProposalSelectionMode\('required'\)/);
  assert.match(app, /openWeeklyLeaderProposal[\s\S]*setWeeklyProposalSelectionMode\('recovery'\)/);
  assert.match(app, /dismissible=\{weeklyProposalSelectionMode === 'recovery'\}/);
  assert.match(picker, /\{dismissible && onClose \? \(/);
  assert.match(picker, /aria-label="Choose weekly proposal later"/);
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /aria-modal="true"/);
  assert.match(picker, /onKeyDown=\{handleDialogKeyDown\}/);
  assert.match(picker, /disabled=\{isSaving\}/);
  assert.match(picker, /aria-pressed=\{selected\}/);
  assert.match(app, /weeklyProposalReturnRef\.current === 'record'[\s\S]*setShowMissionRecordPreview\(true\)/);
});

test('a selected recovery proposal survives a failed save and exposes a clear retry', () => {
  const app = read('App.tsx');
  const picker = read('components', 'WeeklyProposalSelection.tsx');

  assert.match(app, /initialProposalId=\{monthlyLeaderboard\.find\(\(entry\) => entry\.runId === runReceipt\.runId\)\?\.proposalId \?\? null\}/);
  assert.match(picker, /const \[selectedProposalId, setSelectedProposalId\]/);
  assert.match(picker, /sortedProposals\.find\(\(proposal\) => proposal\.id === selectedProposalId\)/);
  assert.match(picker, /Your proposal is still selected\. Tap retry below\./);
  assert.match(picker, /Retry saving proposal/);
  assert.match(app, /onProposalChange=\{\(\) => \{[\s\S]*setWeeklyProposalSelectionStatus\('idle'\)[\s\S]*setWeeklyProposalSelectionMessage\(''\)/);
});
