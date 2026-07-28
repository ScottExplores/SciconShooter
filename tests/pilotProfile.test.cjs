const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('a stable device Pilot ID is stored and reused', () => {
  const constants = read('constants.ts');
  const pilot = read('services', 'pilotProfileService.ts');

  assert.match(constants, /PILOT_PROFILE_ID: "scicon_pilot_profile_id"/);
  assert.match(constants, /PILOT_PROFILE_MIGRATION: "scicon_pilot_profile_migration_v1"/);
  assert.match(pilot, /const storedId = safeGet\(STORAGE_KEYS\.PILOT_PROFILE_ID\)/);
  assert.match(pilot, /const id = isPilotProfileId\(storedId\)[\s\S]*normalizeProfileId\(storedId as string\)[\s\S]*createPilotProfileId\(\)/);
  assert.match(pilot, /safeSet\(STORAGE_KEYS\.PILOT_PROFILE_ID, id\)/);
  assert.match(pilot, /return `pilot:\$\{uuid\.toLowerCase\(\)\}`/);
  assert.match(pilot, /storageMode: 'device'/);
});

test('legacy wallet data can only seed that same verified wallet profile', () => {
  const app = read('App.tsx');
  const squad = read('services', 'squadProgression.ts');
  const walletProfiles = read('services', 'walletProfileService.ts');
  const squadMigration = squad.slice(
    squad.indexOf('export const migrateLegacySquadProfile'),
    squad.indexOf('\nconst spendCoins', squad.indexOf('export const migrateLegacySquadProfile'))
  );

  assert.match(walletProfiles, /getWalletProfileId = \(address: string\)/);
  assert.match(walletProfiles, /`wallet:\$\{normalizeWalletAddress\(address\)\}`/);
  assert.match(app, /migrateLegacySquadProfile\(normalizedAddress, walletProfileId\)/);
  assert.match(app, /pilotProfile\.migratedFromWallet === normalizedAddress/);
  assert.doesNotMatch(app, /migrateLegacyWalletIntoPilot/);
  assert.match(squadMigration, /sourceFound: false,[\s\S]*success: true/);
  assert.match(squadMigration, /verifyStoredProfile\(targetWeeklyKey, targetId\)/);
  assert.match(squadMigration, /verifyStoredProfile\(targetPermanentKey, targetId\)/);
  assert.doesNotMatch(squadMigration, /removeItem\(/);
});

test('Pilot stats use a Pilot-keyed storage record', () => {
  const pilot = read('services', 'pilotProfileService.ts');

  assert.match(pilot, /getPilotStatsStorageKey = \(pilotProfileId: string\)/);
  assert.match(pilot, /`\$\{STORAGE_KEYS\.PLAYER_STATS\}:\$\{normalizeProfileId\(pilotProfileId\)\}`/);
  assert.match(pilot, /readPilotStats = \(pilotProfileId: string\)[\s\S]*safeGet\(getPilotStatsStorageKey\(pilotProfileId\)\)/);
  assert.match(pilot, /savePilotStats = \([\s\S]*pilotProfileId: string[\s\S]*const statsKey = getPilotStatsStorageKey\(pilotProfileId\)[\s\S]*safeSet\(statsKey, JSON\.stringify\(sanitized\)\)/);
});

test('App separates guest-local and authenticated wallet-cloud profiles', () => {
  const app = read('App.tsx');
  const walletProfiles = read('services', 'walletProfileService.ts');

  assert.match(app, /const \[pilotProfile\] = useState\(initializeLocalPilotProfile\)/);
  assert.match(app, /const \[activeProfileId, setActiveProfileId\] = useState\(pilotProfile\.id\)/);
  assert.match(app, /loadWeeklySquadState\(pilotProfile\.id\)/);
  assert.match(app, /loadPermanentSquadState\(pilotProfile\.id\)/);
  assert.match(app, /readPilotStats\(pilotProfile\.id\)/);
  assert.match(app, /const walletProfileId = getWalletProfileId\(normalizedAddress\)/);
  assert.match(app, /loadAuthenticatedWalletProfile\(\s*activeWalletAddress as Address\s*\)/);
  assert.match(app, /saveAuthenticatedWalletProfile\(\{/);
  assert.match(app, /hydrateActiveProfile\(\{\s*profileId: pilotProfile\.id\s*\}\)/);
  assert.match(app, /savePilotStats\(activeProfileId/);
  assert.match(walletProfiles, /credentials: 'same-origin'/);
  assert.match(walletProfiles, /signBaseAccountMessage\(address, challenge\.message\)/);
});

test('Pilot progress keeps standalone and Campaign settlement paths separate', () => {
  const app = read('App.tsx');

  assert.match(app, /if \(!isCampaignRun && !isNonCompetitiveRun && summary\.bossEncounterId\) \{[\s\S]*recordBossVictory/);
  assert.match(app, /const unsettledLifetimeCampaignEnemies = isCampaignRun/);
  assert.match(app, /if \(!isNonCompetitiveRun && squadRunAppliedGameIdRef\.current !== gameId\) \{[\s\S]*applySquadRunResult/);
  assert.match(app, /if \(!isNonCompetitiveRun && permanentRunAppliedGameIdRef\.current !== gameId\) \{[\s\S]*recordLifetimeRun/);
  assert.match(app, /const isNonCompetitiveRun = isFounderSandboxRun \|\| isBossArchiveRun \|\| isCampaignLabRun \|\| isCampaignBranchRun/);
  assert.doesNotMatch(app, /activeWalletAddress && !isFounderSandboxRun/);
});

test('minted ship ownership remains scoped to the connected wallet', () => {
  const app = read('App.tsx');
  const ships = read('services', 'playerShipService.ts');
  const squad = read('services', 'squadProgression.ts');

  assert.match(app, /getPlayerShipUnlocks\(activeWalletAddress, walletRecords, \{ unlockAll: isOwnerWallet \}\)/);
  assert.match(ships, /const normalizedWallet = walletAddress\?\.toLowerCase\(\)/);
  assert.match(ships, /record\.walletAddress\?\.toLowerCase\(\) === normalizedWallet/);
  assert.match(ships, /record\.recordType === 'mission'/);
  assert.match(ships, /record\.status === 'confirmed'/);
  assert.match(ships, /record\.ownershipVerified !== false/);
  assert.match(app, /eth: unlocks\.eth \|\| permanentSquadState\.unlockedPlayerShips\.includes\('eth'\)/);
  assert.match(app, /btc: unlocks\.btc \|\| permanentSquadState\.unlockedPlayerShips\.includes\('btc'\)/);
  assert.match(squad, /Minted ownership always follows the currently connected wallet/);
  assert.match(squad, /mintedMiniShips: target\.mintedMiniShips/);
  assert.match(squad, /const bossArchive = mergeBossArchiveProgress\(\s*target\.bossArchive,\s*source\.bossArchive\s*\)/);
  assert.match(squad, /bossArchive,\s*campaignProgress,\s*updatedAt: nowIso\(\)/);
  assert.doesNotMatch(
    squad.slice(squad.indexOf('const mergePermanentSquadProfiles'), squad.indexOf('export const migrateLegacySquadProfile')),
    /mintedMiniShips: source\.mintedMiniShips/
  );
});
