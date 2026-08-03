const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const mapSource = fs.readFileSync(path.join(root, 'components', 'CampaignMap.tsx'), 'utf8');
const resultSource = fs.readFileSync(path.join(root, 'components', 'CampaignBranchResultOverlay.tsx'), 'utf8');

test('optional branch runs use the canonical engine while remaining noncompetitive and checkpoint-neutral', () => {
  assert.match(appSource, /type ActiveRunMode = [^;]*'campaign-branch'/);
  assert.match(appSource, /isNonCompetitiveRun = isFounderSandboxRun \|\| isBossArchiveRun \|\| isCampaignLabRun \|\| isCampaignBranchRun/);
  assert.match(appSource, /campaign: activeBossReplayCampaign\s*\?\? activeCampaignBranchCampaign/);
  assert.match(appSource, /onCampaignProgress: handleCampaignProgress/);
  assert.match(appSource, /if \(activeRunMode !== 'campaign' && activeRunMode !== 'campaign-replay'\) return/);
  assert.match(appSource, /totalCoins: baseline/);
});

test('failure and interruption discard provisional coins while retaining an explicit retry path', () => {
  assert.match(appSource, /settleCampaignBranchOutcome\('failed'\)/);
  assert.match(appSource, /returnToCampaignMapAfterBranchAttempt\('interrupted'\)/);
  assert.match(appSource, /setStats\(\(current\) => \(\{ \.\.\.current, coins: 0, totalCoins: baseline \}\)\)/);
  assert.match(appSource, /Supply Signal Lost/);
  assert.match(appSource, /Retry Supply Drop/);
  assert.match(appSource, /Provisional Tokens were discarded/);
});

test('successful branch completion has a stable receipt, special result panel, and disabled claimed route', () => {
  assert.match(appSource, /campaign-branch:\$\{activeProfileId\}:\$\{branch\.branchId\}:reward:v1/);
  assert.match(appSource, /settleCampaignBranchAttempt/);
  assert.match(resultSource, /Cache Recovered/);
  assert.match(resultSource, /Presents destroyed/);
  assert.match(resultSource, /One-time completion bonus/);
  assert.match(resultSource, /Newly affordable:/);
  assert.match(resultSource, /Return to Campaign Map/);
  assert.match(appSource, /getNewlyAffordableSquadUpgrade/);
  assert.match(appSource, /lastReceipt\.destroyedByType\.golden/);
  assert.match(mapSource, /disabled=\{!selectedBranchState\.unlocked \|\| selectedBranchConsumed/);
});

test('connected production wallets start and settle one-time routes through the authenticated server boundary', () => {
  assert.match(appSource, /startWalletCampaignBranch/);
  assert.match(appSource, /settleWalletCampaignBranch/);
  assert.match(appSource, /requiresServerBranchSettlement/);
  assert.match(appSource, /serverAttempt!\.attemptToken/);
  assert.match(appSource, /discardWalletProfileDirty\(serverRun\.serverWalletAddress/);
  assert.match(appSource, /hydrateActiveProfile\(\{/);
});

test('mastery linkage and founder branch tools are visible only through the guarded developer contract', () => {
  assert.match(mapSource, /Earn all 3 stars to reveal a bonus route/);
  assert.match(mapSource, /Bonus route unlocked/);
  assert.match(appSource, /if \(!isOwnerWallet\) return null/);
  assert.match(appSource, /applyFounderCampaignBranchAction/);
  assert.match(mapSource, />Unlock branch<\/button>/);
  assert.match(mapSource, />Grant all three stars<\/button>/);
  assert.match(mapSource, />Verify duplicate-reward protection<\/button>/);
  assert.match(mapSource, /Branch value multiplier/);
});

test('founder outcome simulation verifies Present Drop and combat branches through their own runtime contracts', () => {
  assert.match(appSource, /const simulateFounderBranchOutcome = \(branchId: string, outcome: 'failed' \| 'success'\)/);
  assert.match(appSource, /isPresentDropBranchDefinition\(branch\)[\s\S]*?verifyPresentDropRuntimeResult\(branch/);
  assert.match(appSource, /isCombatBranchDefinition\(branch\)[\s\S]*?verifyCampaignCombatBranchRuntimeResult\(branch/);
  assert.match(appSource, /stageComplete: outcome === 'success'/);
  assert.match(appSource, /verified\.kind === 'present-drop'[\s\S]*?verified\.destroyed/);
});
