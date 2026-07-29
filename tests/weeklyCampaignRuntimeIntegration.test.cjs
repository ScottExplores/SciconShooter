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

test('Campaign Map exposes weekly loadout preflight, binding confirmation, and guest-safe launch actions', () => {
  const mapSource = read('components/CampaignMap.tsx');

  assert.match(mapSource, /weeklyEligibleStartNodeIds/);
  assert.match(mapSource, /weeklyLoadout\.shipName/);
  assert.match(mapSource, /Preflight ready/);
  assert.match(mapSource, /Commit Weekly Route/);
  assert.match(mapSource, /role="alertdialog"/);
  assert.match(mapSource, /End and Submit/);
  assert.doesNotMatch(mapSource, /onStartWeeklyStreak[\s\S]{0,250}wallet/i);
});

test('App runs weekly streaks through direct graph routing and the existing leaderboard flow without Campaign rewards', () => {
  const appSource = read('App.tsx');

  assert.match(appSource, /type ActiveRunMode[^\n]*'weekly-streak'/);
  assert.match(appSource, /startWeeklyCampaignStreak\(WEEKLY_CAMPAIGN_GRAPH/);
  assert.match(appSource, /recordWeeklyCampaignNodeScore\(streak, WEEKLY_CAMPAIGN_GRAPH/);
  assert.match(appSource, /requestWeeklyCampaignAdvance\([\s\S]{0,180}WEEKLY_CAMPAIGN_GRAPH/);
  assert.match(appSource, /finalizeWeeklyCampaignLoss/);
  assert.match(appSource, /finalizeWeeklyCampaignDeliberateEnd/);
  assert.match(appSource, /finalizeCompletedWeeklyCampaignStreak/);
  assert.match(appSource, /markWeeklyCampaignStreakSubmission/);
  assert.match(appSource, /weeklyRunSessionKeyRef/);
  assert.match(appSource, /preserveConnectedWeeklySession/);
  assert.match(appSource, /weeklyCampaignProof/);
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
