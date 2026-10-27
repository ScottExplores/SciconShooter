const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const previewSource = fs.readFileSync(path.join(root, 'components', 'MissionRecordPreview.tsx'), 'utf8');
const pickerSource = fs.readFileSync(path.join(root, 'components', 'PrizeWinnerFlow.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const flowSource = fs.readFileSync(path.join(root, 'services', 'weeklyFundingFlow.ts'), 'utf8');
const leaderboardSource = fs.readFileSync(path.join(root, 'services', 'leaderboardService.ts'), 'utf8');

test('a new weekly leader enters a dedicated proposal step before returning to results', () => {
  assert.match(appSource, /requiresWeeklyProposal/);
  assert.match(appSource, /setShowWeeklyProposalSelection\(true\)/);
  assert.match(appSource, /saveWeeklyLeaderProposal\(runReceipt, proposal, walletAuthorization\)/);
  assert.match(appSource, /weeklyProposalReturnRef\.current = 'results'/);
  assert.match(appSource, /weeklyProposalReturnRef\.current === 'record'[\s\S]{0,80}setShowMissionRecordPreview\(true\)/);
  assert.match(appSource, /View \/ mint/);
  assert.match(appSource, /isWeeklyCampaignRun \? 'NEW WEEKLY RUN' : 'RETRY MISSION'/);
  assert.match(appSource, /onHangar=\{openSquadHangar\}/);
  assert.match(pickerSource, /You are first/);
  assert.match(pickerSource, /Choose a proposal or RFP/);
  assert.match(pickerSource, /role="tablist"/);
  assert.match(pickerSource, /Record this choice/);
  assert.match(pickerSource, /Choice recorded/);
});

test('the proposal picker stays above both defeat results and Mission Record preview', () => {
  assert.match(pickerSource, /fixed inset-0 z-\[95\]/);
  assert.match(previewSource, /fixed inset-0 z-\[80\]/);
});

test('proposal rows select in-app and require an explicit confirmation', () => {
  assert.match(pickerSource, /setSelected\(\{ kind: 'proposal', proposal \}\)/);
  assert.match(pickerSource, /Record this choice/);
  assert.doesNotMatch(pickerSource, /window\.open/);
  assert.match(pickerSource, /href=\{proposal\.url\}/);
  assert.match(leaderboardSource, /action: 'select-proposal'/);
  assert.match(leaderboardSource, /proposalId: proposal\.id/);
});

test('mint and share stay gated until the weekly proposal is saved', () => {
  assert.match(previewSource, /weeklyChoiceRequired/);
  assert.match(previewSource, /!weeklyChoiceRequired/);
  assert.match(previewSource, /Funding choice saved/);
  assert.match(previewSource, /Choose proposal/);
  assert.doesNotMatch(previewSource, /Browse eligible proposals|View selected proposal/);
});

test('the mission record resolves a proposal already attached to the leading run', () => {
  assert.match(flowSource, /currentLeader\?\.proposalId && currentLeader\.proposalTitle/);
  assert.match(flowSource, /status: 'selected'/);
  assert.match(flowSource, /proposalAuthor: currentLeader\.proposalAuthor/);
  assert.match(flowSource, /winner\.winnerRunId === receipt\.runId/);
  assert.match(flowSource, /receipt\.testRun/);
});

test('finalized legacy winners retain the signed proposal claim fallback', () => {
  assert.match(appSource, /requestedChampionWinner=\{scorecardChampionWinner\}/);
  assert.match(startScreenSource, /testChampionWinner \|\| requestedChampionWinner/);
  assert.match(startScreenSource, /onClaimWeeklyChampion\(championClaimWinner, proposal\)/);
});
