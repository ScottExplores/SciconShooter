const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('Home presents missing or completed-proposal reminders at most once every four hours', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const reminder = read('services', 'weeklyProposalReminder.ts');

  assert.match(reminder, /WEEKLY_PROPOSAL_REMINDER_INTERVAL_MS = 4 \* 60 \* 60 \* 1000/);
  assert.match(reminder, /WEEKLY_PROPOSAL_REMINDER_STORAGE_KEY = 'scicon\.weekly-proposal-reminder'/);
  assert.match(startScreen, /parseWeeklyProposalReminderTimestamp/);
  assert.match(startScreen, /isWeeklyProposalReminderDue\(weeklyClock, lastReminderAt\)/);
  assert.match(startScreen, /window\.localStorage\.getItem\(weeklyProposalReminderKey\)/);
  assert.match(startScreen, /serializeWeeklyProposalReminderTimestamp\(weeklyClock\)/);
  assert.match(startScreen, /weeklyProposalNeedsAttention[\s\S]*dashboardTab !== 'home'/);
  assert.match(startScreen, /showWeeklyProposalReminder && weeklyProposalRecovery/);
  assert.match(startScreen, /weeklyProposalAttentionReason === 'completed'/);
  assert.match(startScreen, /Your selected proposal was fully funded\. You are still/);
  assert.match(startScreen, />\s*Not now\s*<\/button>/);
  assert.match(startScreen, /onClick=\{openRecoverableWeeklyProposal\}[\s\S]*Choose new proposal/);
});

test('Trophies, My Records, and the exact leading run carry proposal attention', () => {
  const startScreen = read('components', 'StartScreen.tsx');
  const styles = read('styles', 'tailwind.input.css');

  assert.match(startScreen, /tab\.id === 'trophies' && weeklyProposalNeedsAttention/);
  assert.match(startScreen, /data-proposal-ready=\{proposalAttention \? 'true' : 'false'\}/);
  assert.match(startScreen, /id === 'records' && weeklyProposalNeedsAttention/);
  assert.match(startScreen, /weeklyProposalRunId === run\.receipt\.runId/);
  assert.match(startScreen, /onOpenWeeklyLeaderProposal\(run\)/);
  assert.match(startScreen, /proposalReplacementRequired[\s\S]*'Choose new pick'[\s\S]*'Choose proposal'[\s\S]*'Change proposal'/);
  assert.match(styles, /data-dashboard-tab='trophies'\]\[data-proposal-ready='true'/);
  assert.match(styles, /\.sci-proposal-attention/);
  assert.match(styles, /@keyframes sci-proposal-attention/);
});

test('App supplies only its verified recovery record to the chooser', () => {
  const app = read('App.tsx');

  assert.match(app, /getResearchHubProposalFeed\(\{[\s\S]*includeProposalIds: requestedProposalId \? \[requestedProposalId\] : \[\]/);
  assert.match(app, /proposalRefreshNonceRef\.current === refreshNonce[\s\S]*weeklyLeaderProposalIdRef\.current === requestedProposalId/);
  assert.match(app, /getWeeklyProposalLifecycle\(\{[\s\S]*selectedProposalId: weeklyLeaderProposalId,[\s\S]*referencedProposals: proposalReferences/);
  assert.match(app, /proposalLifecycle: weeklyProposalLifecycle/);
  assert.match(app, /weeklyProposalRecovery=\{weeklyProposalRecovery\}/);
  assert.match(app, /proposalReferences=\{proposalReferences\}/);
  assert.match(app, /onOpenWeeklyLeaderProposal=\{openWeeklyLeaderProposal\}/);
  assert.match(app, /weeklyProposalRecovery\?\.record\.receipt\.runId !== record\.receipt\.runId/);
  assert.match(app, /pilotName=\{missionRecordPilotName \|\| playerNameInput \|\| 'PILOT'\}/);
});

test('App refreshes the current weekly leader and Past Picks while the Home dashboard remains open', () => {
  const app = read('App.tsx');
  const archiveService = read('services', 'winnerArchiveService.ts');
  const competitionsApi = read('api', 'weekly-competitions.js');

  assert.match(app, /const \[loadingLeaderboard, setLoadingLeaderboard\] = useState<boolean>\(true\)/);
  assert.match(app, /BACKGROUND_LEADERBOARD_REFRESH_MS = 60_000/);
  assert.match(app, /const fetchDashboardData = async \(background = false\)/);
  assert.match(app, /if \(!background && !alreadyHasData\) \{\s*setLoadingLeaderboard\(true\)/);
  assert.match(app, /Promise\.all\(\[\s*getLeaderboardData\(\),\s*getArchivedWeeklyWinners\(\)\s*\]\)/);
  assert.match(app, /resolveWeeklyDashboardPublication\(archive\.completedWeekKeys\)/);
  assert.match(app, /getLeaderboardWeekScores\(publication\.visibleWeekKey\)/);
  assert.match(app, /presentedWeeklyScores === null/);
  assert.match(app, /setMonthlyLeaderboard\(presentedWeeklyScores\);\s*setArchivedWinners\(archive\.winners\)/);
  assert.match(app, /setWeeklyPresentationTime\(publication\.presentationTime\)/);
  assert.match(app, /if \(!document\.hidden\) void fetchDashboardData\(true\)/);
  assert.match(app, /window\.setInterval\(\s*refreshDashboardInBackground,\s*BACKGROUND_LEADERBOARD_REFRESH_MS/);
  assert.match(app, /window\.addEventListener\('focus', refreshDashboardInBackground\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', handleDashboardVisibilityChange\)/);
  assert.match(app, /window\.removeEventListener\('focus', refreshDashboardInBackground\)/);
  assert.match(app, /document\.removeEventListener\('visibilitychange', handleDashboardVisibilityChange\)/);
  assert.match(app, /if \(archive === null\) return/);
  assert.match(app, /getWeeklyPresentationMeta\(\)/);
  assert.match(app, /presentation\.publishesAt\.getTime\(\) - Date\.now\(\)/);
  assert.match(app, /weeklyPublishRefreshId = window\.setTimeout\(refreshWeeklyPublication, 500\)/);
  assert.match(archiveService, /Promise<WeeklyCompetitionArchive \| null>/);
  assert.match(archiveService, /return \{ winners, completedWeekKeys \}/);
  assert.match(competitionsApi, /completedWeekKeys: getCompletedWeeklyCompetitionKeys\(competitions\)/);
});

test('App prefers the initial leader but still loads proposals if the leaderboard stalls', () => {
  const app = read('App.tsx');

  assert.doesNotMatch(app, /if \(loadingLeaderboard\) return undefined/);
  assert.match(app, /void refreshFundingProposals\(\)/);
  assert.match(app, /delayMs: loadingLeaderboard \? 2_000 : 150,[\s\S]*timeoutMs: 3200/);
  assert.match(app, /\}, \[loadingLeaderboard, refreshFundingProposals\]\)/);
});

test('the mandatory post-score chooser cannot be dismissed while recovery openings can close', () => {
  const app = read('App.tsx');
  const picker = read('components', 'WeeklyProposalSelection.tsx');

  assert.match(app, /requiresWeeklyProposal[\s\S]*setWeeklyProposalSelectionMode\('required'\)/);
  assert.match(app, /openWeeklyLeaderProposal[\s\S]*setWeeklyProposalSelectionMode\('recovery'\)/);
  assert.match(app, /dismissible=\{weeklyProposalSelectionMode === 'recovery'\}/);
  assert.match(picker, /\{dismissible && onClose \? \(/);
  assert.match(picker, /aria-label="Choose proposal later"/);
  assert.match(picker, /role="dialog"/);
  assert.match(picker, /aria-modal="true"/);
  assert.match(picker, /onKeyDown=\{handleDialogKeyDown\}/);
  assert.match(picker, /disabled=\{isSaving\}/);
  assert.match(picker, /aria-pressed=\{selected\}/);
  assert.match(app, /weeklyProposalReturnRef\.current === 'record'[\s\S]*setShowMissionRecordPreview\(true\)/);
  assert.match(app, /isWeeklyLeaderDisplacementError\(error\)[\s\S]*setWeeklyProposalSelectionMode\('recovery'\)/);
  assert.match(app, /Another pilot took the weekly lead[\s\S]*close this panel to continue/);
});

test('guest proposal recovery is durable before score POST and uses the live scoring week', () => {
  const app = read('App.tsx');
  const createIndex = app.indexOf('createWeeklyGuestProposalCapability(verifiedReceipt, name)');
  const durableWriteIndex = app.indexOf('writeWeeklyGuestProposalCapability(capability)', createIndex);
  const scorePostIndex = app.indexOf('await saveScore(name, score, wave', durableWriteIndex);
  const recoveryEffectIndex = app.indexOf('resolveWeeklyGuestProposalCapabilities({');

  assert.ok(createIndex > 0);
  assert.ok(durableWriteIndex > createIndex);
  assert.ok(scorePostIndex > durableWriteIndex);
  assert.match(app.slice(createIndex, scorePostIndex), /if \(!capability \|\| !storedCapabilities\)[\s\S]*could not safely store/);
  assert.match(app, /setWeeklyLeaderboardHydrated\(false\)[\s\S]*writeWeeklyGuestProposalCapability/);
  assert.match(app.slice(recoveryEffectIndex - 500, recoveryEffectIndex), /!weeklyLeaderboardHydrated[\s\S]*isSubmittingScore/);
  assert.match(app, /weeklyLeaderboard: weeklyRecoveryLeaderboard/);
  assert.match(app, /setWeeklyRecoveryLeaderboard\(data\.monthlyScores\)[\s\S]*presentedWeeklyScores/);
  assert.match(app, /weeklyRecoveryEvidenceRequestRef\.current !== expectedEvidenceRequestId/);
  assert.match(
    app,
    /finally \{[\s\S]*scoreSettlementEvidenceRequestId = weeklyRecoveryEvidenceRequestRef\.current \+ 1;[\s\S]*weeklyRecoveryEvidenceRequestRef\.current = scoreSettlementEvidenceRequestId/
  );
  assert.match(app, /markWeeklyGuestProposalScoreSettled\([\s\S]*guestProposalCandidateRunId/);
  assert.match(app, /WEEKLY_GUEST_PROPOSAL_RECONCILIATION_DELAYS_MS\[attemptIndex\]/);
  assert.match(app, /scheduleWeeklyGuestProposalReconciliation\([\s\S]*scoreSettlementEvidenceRequestId,[\s\S]*guestProposalCandidateRunId/);
  assert.match(app, /capability\.leaderMismatchCount \?\? 0/);
  assert.match(app, /setWeeklyProposalSelectionMode\('recovery'\)[\s\S]*setShowWeeklyProposalSelection\(true\)/);
  assert.match(app, /settleWeeklyGuestProposalCapability\(proposalRunId, 'resolved'\)/);
  assert.match(app, /settleWeeklyGuestProposalCapability\(proposalRunId, 'displaced'\)/);
  assert.match(app, /entry\.winnerRunId === capability\.receipt\.runId/);
  assert.match(app, /winner\?\.status === 'finalized'/);
  assert.match(app, /setRunReceipt\(recoverableChampion\.receipt\)[\s\S]*setShowMissionRecordPreview\(true\)/);
  assert.match(
    app,
    /const matchingReceipt = runReceipt\?\.runId === winner\.winnerRunId[\s\S]*weeklyGuestProposalCapabilities\.find[\s\S]*capability\.receipt\.runId === winner\.winnerRunId/
  );
  assert.match(
    app,
    /const associationReceipt = !winner\.winnerWallet[\s\S]*matchingReceiptExpiresAt > Date\.now\(\)[\s\S]*receipt: associationReceipt/
  );
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
