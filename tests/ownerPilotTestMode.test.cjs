const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'components', 'GameCanvas.tsx'), 'utf8');
const startScreenSource = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');

test('project wallet enables a sticky test run with real flask charge and no leaderboard save path', () => {
  assert.match(appSource, /activeWalletAddress\?\.toLowerCase\(\) === DONATION_CONFIG\.RECIPIENT_ADDRESS\.toLowerCase\(\)/);
  assert.match(appSource, /type ActiveRunMode = 'standard'[\s\S]*?'campaign'[\s\S]*?'campaign-replay'[\s\S]*?'owner-test'[\s\S]*?'boss-archive'/);
  assert.match(appSource, /OWNER_TEST_FLASK_COUNT = 40/);
  assert.match(appSource, /getPlayerShipUnlocks\(activeWalletAddress, walletRecords, \{ unlockAll: isOwnerWallet \}\)/);
  assert.match(appSource, /beginRunSession\(isOwnerTestRun \|\| isOwnerWallet, activeRunMode\)/);
  assert.match(appSource, /completedPhase !== undefined && !isBossArchiveRun/);
  assert.match(appSource, /const isFounderSandboxRun = isOwnerWallet \|\| isOwnerTestRun/);
  assert.match(appSource, /if \(isFounderSandboxRun\) \{[\s\S]*?finalizeCurrentRun\(\)/);
  // High scores are owned exclusively by Weekly Run. The founder sandbox is
  // non-competitive, so it remains excluded even when launched through that
  // mode.
  assert.match(appSource, /isWeeklyLeaderboardRun && stats\.score > stats\.highScore/);
  assert.match(appSource, /const isWeeklyLeaderboardRun = isWeeklyCampaignRun && !isNonCompetitiveRun/);
});

test('founder Hangar sandbox unlocks the fleet, supports reversible upgrades, and never persists test levels', () => {
  const squadSource = fs.readFileSync(path.join(root, 'services', 'squadProgression.ts'), 'utf8');
  const hangarSource = fs.readFileSync(path.join(root, 'components', 'SquadHangar.tsx'), 'utf8');

  assert.match(squadSource, /createFounderSquadSandboxState/);
  assert.match(squadSource, /unlockedSlots: \{ left: true, right: true \}/);
  assert.match(squadSource, /MINI_SHIP_CATALOG\.map\(\(entry\) => \[entry\.id, MINI_SHIP_MAX_LEVEL\]\)/);
  assert.match(squadSource, /PLAYABLE_PLAYER_SHIP_IDS\.map\(\(shipId\) => \[shipId, \{/);
  assert.match(squadSource, /ability: MAIN_SHIP_ABILITY_MAX_LEVEL/);
  assert.match(squadSource, /ability: Math\.max\(targetUpgrades\.ability, sourceUpgrades\.ability\)/);
  assert.match(squadSource, /adjustFounderMiniShipLevel/);
  assert.match(squadSource, /adjustFounderMainShipUpgrade/);
  assert.match(appSource, /adjustFounderMiniShipLevel\(current, id, -1\), false/);
  assert.match(appSource, /adjustFounderMainShipUpgrade\(current, usableShipId, id, -1\), false/);
  assert.match(hangarSource, /Founder test loadout - changes are temporary/);
  assert.match(hangarSource, /onDowngradeMini\(activeMini\.id\)/);
  assert.match(hangarSource, /onDowngradeMainShip\(upgrade\.id\)/);
});

test('project wallet can practice every authored Boss Archive encounter without granting earned unlocks', () => {
  assert.match(startScreenSource, /founderSandbox \|\| bossArchiveDeveloperControls\?\.enabled/);
  assert.match(startScreenSource, /bossArchiveDevelopmentAccess && bossArchiveDevUnlockAll\s*\? BOSS_ARCHIVE_CATALOG\s*:\s*earnedBossArchiveEntries/);
  assert.match(
    appSource,
    /!requestedBossReplay[\s\S]*?!isOwnerWallet[\s\S]*?!permanentSquadState\.bossArchive\.unlockedEventIds\.includes\(requestedBossReplay\.eventId\)/
  );
  assert.doesNotMatch(appSource, /recordBossVictory\(current,[^)]*isOwnerWallet/);
  assert.match(appSource, /const isNonCompetitiveRun = isFounderSandboxRun \|\| isBossArchiveRun/);
});

test('engine test mode preserves lives and supports stage and authored-climax jumps', () => {
  assert.match(engineSource, /testMode\?: boolean/);
  assert.match(engineSource, /jumpToCampaignWave\(stageNumber: number\)/);
  assert.match(engineSource, /jumpToCampaignBoss\(stageNumber: number\)/);
  assert.match(engineSource, /getFirstCampaignWaveIndexForStage\(stageNumber\)/);
  assert.match(engineSource, /getLastCampaignWaveIndexForCurrentStage\(\)/);
  assert.match(engineSource, /find\(\(event\) => this\.getEncounterWarningType\(event\) === 'gatekeeper'\)/);
  assert.match(engineSource, /const climax = mainBoss/);
  assert.match(engineSource, /this\.queueConfiguredEncounter\(climax as RuntimeEncounterEvent\)/);
  assert.doesNotMatch(engineSource, /if \(!mainBoss\)[\s\S]{0,180}startBossWarning\('gatekeeper'\)/);
  assert.match(engineSource, /this\.entities = \[\][\s\S]*?this\.resetWaveProgress\(\)/);
  assert.match(engineSource, /if \(!this\.testMode\) \{\s*this\.applyPlayerLifeDamage\(incomingDamage\)/);
  assert.match(canvasSource, /engine\.jumpToCampaignWave\(testWaveCommand\.wave\)/);
  assert.match(canvasSource, /engine\.jumpToCampaignBoss\(testBossCommand\.wave\)/);
});

test('owner controls provide a separate frame freeze and put mission tools in the normal pause menu', () => {
  assert.match(appSource, /running:\s*gameState === GameState\.PLAYING\s*&&\s*gameRuntimeReady\s*&&\s*!ownerFrameFrozen\s*&&\s*!onboardingGameplayFreeze/);
  assert.match(appSource, /showFreezeControl: isOwnerWallet && isOwnerTestRun/);
  assert.match(appSource, /onToggleFreeze: isOwnerWallet && isOwnerTestRun/);
  assert.match(appSource, /gameState === GameState\.PAUSED && !resumeCountdownActive && !showTestChampionPreview/);
  assert.match(appSource, /Founder Test Controls/);
  assert.match(appSource, /Select mission/);
  assert.match(appSource, /Jump to Mission \{stats\.wave\} boss/);
  assert.match(appSource, /aria-label=\{`Jump to mission \$\{wave\}`\}/);
  assert.doesNotMatch(appSource, /Select stage|Jump to Stage \{stats\.wave\} boss|aria-label=\{`Jump to stage/);
  assert.doesNotMatch(appSource, /Select wave|Jump to W\{stats\.wave\} boss|aria-label=\{`Jump to wave/);
  assert.match(appSource, /Preview winner/);
  assert.match(appSource, /Finish test run/);
  assert.match(startScreenSource, /testChampionWinner\s*\?\s*setTestSelectedProposal\(proposal\)/);
  assert.match(startScreenSource, /This does not sign or submit a claim/);
});
