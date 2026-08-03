const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('weekly streak is part of guest and wallet profile persistence and resets at the weekly boundary', () => {
  const squadSource = read('services/squadProgression.ts');
  const walletSource = read('api/_lib/walletProfiles.js');

  assert.match(squadSource, /weeklyCampaignStreak:\s*WeeklyCampaignStreakState\s*\|\s*null/);
  assert.match(squadSource, /rollWeeklySquadStateForward[\s\S]*weeklyCampaignStreak:\s*null/);
  assert.match(squadSource, /sanitizeWeeklyCampaignStreak\(/);
  assert.match(squadSource, /mergeWeeklyCampaignStreak\(/);
  assert.match(walletSource, /weeklyCampaignStreak:\s*null/);
  assert.match(walletSource, /sanitizeWeeklyCampaignStreakServer\(/);
  assert.match(walletSource, /weeklyCampaignStreak:\s*isCurrentWeek/);
});

test('the Weekly Run is a home-screen mode and no longer clutters the Campaign Map', () => {
  const mapSource = read('components/CampaignMap.tsx');
  const startScreen = read('components/StartScreen.tsx');
  const appSource = read('App.tsx');

  // The Campaign Map is for Campaign progression only. Its weekly loadout
  // panel and route-commit controls forced extra scrolling on mobile and
  // duplicated a competition that now has its own entry point.
  assert.doesNotMatch(mapSource, /weeklyLoadout/);
  assert.doesNotMatch(mapSource, /Preflight ready/);
  assert.doesNotMatch(mapSource, /Commit Weekly Route/);
  assert.doesNotMatch(mapSource, /Choose any unlocked weekly Mission/);
  // The player-facing weekly callbacks are gone. onStartWeeklyStreak survives
  // only on developerControls, which is a Combat Lab affordance, not player UI.
  assert.doesNotMatch(mapSource, /onSelectWeeklyMission/);
  assert.doesNotMatch(mapSource, /onEndWeeklyStreak/);
  assert.doesNotMatch(mapSource, /onConfirmWeeklySelectionEnd/);
  const publicProps = mapSource.slice(
    mapSource.indexOf('export interface CampaignMapProps'),
    mapSource.indexOf('const getCampaignCheckpointLabel')
  );
  assert.doesNotMatch(publicProps, /onStartWeeklyStreak/);

  // The Weekly Run sits directly under the weekly high score on the home
  // screen, so the board and the way to compete on it read as one unit.
  assert.match(startScreen, /sci-weekly-competition-stack/);
  assert.match(startScreen, /sci-weekly-run-entry/);
  assert.match(startScreen, /onStartWeeklyRun/);
  assert.match(startScreen, /weeklyRunBestScore/);
  assert.match(appSource, /onStartWeeklyRun=\{startWeeklyRunFromHome\}/);

  // Every refusal the home entry can hit has to reach the player.
  const entryStart = appSource.indexOf('const startWeeklyRunFromHome');
  const entryEnd = appSource.indexOf('const selectWeeklyCampaignMissionFromMap', entryStart);
  assert.ok(entryStart >= 0 && entryEnd > entryStart);
  const entryBody = appSource.slice(entryStart, entryEnd);
  const bareReturns = (entryBody.match(/^\s*return;$/gm) ?? []).length;
  const explainedReturns = (entryBody.match(/setCampaignMapError\(/g) ?? []).length;
  assert.ok(explainedReturns >= bareReturns - 1, 'home Weekly Run refusals are explained');
});

test('App runs weekly streaks through direct graph routing and the existing leaderboard flow without Campaign rewards', () => {
  const appSource = read('App.tsx');

  assert.match(appSource, /type ActiveRunMode[^\n]*'weekly-streak'/);
  // The run drives its OWN generated graph now, not the Campaign graph. That
  // separation is the whole point of the mode: no Campaign missions, no
  // Campaign unlocks, no Campaign progress.
  assert.match(appSource, /startWeeklyCampaignStreak\(weeklyRun\.graph/);
  assert.match(appSource, /recordWeeklyCampaignNodeScore\(streak, weeklyRun\.graph/);
  assert.match(appSource, /requestWeeklyCampaignAdvance\([\s\S]{0,180}weeklyRun\.graph/);
  assert.doesNotMatch(appSource, /WEEKLY_CAMPAIGN_GRAPH/);
  assert.match(appSource, /getWeeklyRun\([\s\S]{0,100}weeklySquadState\.weekKey[\s\S]{0,100}weeklyRunMaterializedStageCount/);
  assert.match(appSource, /finalizeWeeklyCampaignLoss/);
  assert.match(appSource, /finalizeWeeklyCampaignDeliberateEnd/);
  assert.doesNotMatch(appSource, /finalizeCompletedWeeklyCampaignStreak/);
  assert.match(appSource, /nextStageCount\s*=\s*runForAdvance\.campaign\.levels\.length\s*\+\s*WEEKLY_RUN_STAGE_CHUNK/);
  assert.match(appSource, /runForAdvance\s*=\s*getWeeklyRun\(weeklySquadStateRef\.current\.weekKey,\s*nextStageCount\)/);
  assert.match(appSource, /markWeeklyCampaignStreakSubmission/);
  assert.match(appSource, /weeklyRunSessionKeyRef/);
  assert.match(appSource, /preserveConnectedWeeklySession/);
  assert.match(appSource, /weeklyCampaignProof/);
  const deliberateEndStart = appSource.indexOf('const endWeeklyCampaignStreak');
  const deliberateEndEnd = appSource.indexOf('const launchCampaignBranchFromMap', deliberateEndStart);
  const deliberateEndBody = appSource.slice(deliberateEndStart, deliberateEndEnd);
  assert.match(deliberateEndBody, /finalizeWeeklyCampaignDeliberateEnd/);
  assert.doesNotMatch(deliberateEndBody, /finishRunSession|saveScore|submitScore|GameOver/);
  const weeklySettlementIndex = appSource.indexOf("if (activeRunMode === 'weekly-streak') {");
  const permanentCampaignSettlementIndex = appSource.indexOf(
    "if (activeRunMode !== 'campaign' && activeRunMode !== 'campaign-replay') return;",
    weeklySettlementIndex
  );
  assert.ok(weeklySettlementIndex >= 0);
  assert.ok(permanentCampaignSettlementIndex > weeklySettlementIndex);
  assert.match(appSource, /coinsCollected:\s*isCampaignRun\s*\?\s*0\s*:\s*stats\.coins/);
  const weeklyLaunchStart = appSource.indexOf('const startWeeklyCampaignFromMap');
  const weeklyLaunchEnd = appSource.indexOf('const selectWeeklyCampaignMissionFromMap', weeklyLaunchStart);
  const weeklyLaunchBody = appSource.slice(weeklyLaunchStart, weeklyLaunchEnd);
  assert.doesNotMatch(weeklyLaunchBody, /connectWallet|requestWalletRuntimeAction/);
});

test('weekly streak proof and the server-issued run token are bound to Weekly mode', () => {
  const receiptSource = read('services/runReceiptService.ts');
  const serverReceiptSource = read('api/_lib/runReceipts.js');
  const receiptRouteSource = read('api/run-receipts.js');
  const appSource = read('App.tsx');

  assert.match(receiptSource, /weeklyCampaignProof:\s*WeeklyCampaignStreakState\s*\|\s*null/);
  assert.match(receiptSource, /fetch\(API_URL,[\s\S]{0,100}credentials:\s*'same-origin'/);
  assert.match(receiptSource, /\.\.\.metrics,[\s\S]{0,100}weeklyCampaignProof\s*\?\s*\{\s*weeklyCampaignProof\s*\}\s*:\s*\{\}/);
  assert.match(receiptSource, /action:\s*'start',[\s\S]{0,220}runMode,[\s\S]{0,120}profileId,[\s\S]{0,120}weeklyCampaignProof/);
  assert.match(serverReceiptSource, /createWeeklyCampaignStreakRunBinding\(weeklyCampaignProof/);
  assert.match(serverReceiptSource, /start\.weeklyCampaignBinding/);
  assert.match(serverReceiptSource, /expectedBinding/);
  assert.match(serverReceiptSource, /startRunMode\s*===\s*'weekly-streak'\s*&&\s*!hasWeeklyProof/);
  assert.match(serverReceiptSource, /startRunMode\s*!==\s*'weekly-streak'\s*&&\s*hasWeeklyProof/);
  assert.match(receiptRouteSource, /readOptionalWalletProfileSession\(req\)/);
  assert.match(receiptRouteSource, /profileId:\s*body\.profileId/);
  assert.match(appSource, /profileId:\s*weeklySquadStateRef\.current\.profileId,[\s\S]{0,80}weeklyCampaignProof/);
  assert.match(appSource, /beginRunSession\(isOwnerTestRun\s*\|\|\s*isOwnerWallet,\s*activeRunMode\)/);
});

test('Campaign Missions never post to the weekly high-score board', () => {
  const appSource = read('App.tsx');

  // Leaderboard eligibility is owned exclusively by Weekly Run. Campaign
  // remains outside isNonCompetitiveRun so it still awards lifetime stats,
  // mastery, and Hangar credits without touching the weekly score.
  assert.match(
    appSource,
    /const isWeeklyLeaderboardRun = isWeeklyCampaignRun && !isNonCompetitiveRun;/
  );
  assert.doesNotMatch(
    appSource,
    /const isNonCompetitiveRun = [^\n]*isCompetitiveCampaignRun/,
    'campaign must not be folded into isNonCompetitiveRun; that gates run payout too'
  );

  // The submit path and the name prompt both hang off the new flag.
  assert.match(
    appSource,
    /if \(!isWeeklyLeaderboardRun \|\| !playerNameInput\.trim\(\)/
  );
  assert.match(appSource, /setShowNameInput\(isWeeklyLeaderboardRun\)/);

  // Campaign still records lifetime progression.
  assert.match(appSource, /if \(!isNonCompetitiveRun && permanentRunAppliedGameIdRef\.current !== gameId\)/);
  assert.match(appSource, /recordLifetimeRun\(current, \{/);
});
