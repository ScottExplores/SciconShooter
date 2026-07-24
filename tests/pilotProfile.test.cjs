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

test('Pilot migration waits for real wallet data, retries safely, and never deletes source data', () => {
  const app = read('App.tsx');
  const pilot = read('services', 'pilotProfileService.ts');
  const squad = read('services', 'squadProgression.ts');
  const initialize = pilot.slice(pilot.indexOf('export const initializeLocalPilotProfile'));
  const squadMigration = squad.slice(
    squad.indexOf('export const migrateLegacySquadProfile'),
    squad.indexOf('\nconst spendCoins', squad.indexOf('export const migrateLegacySquadProfile'))
  );

  assert.match(pilot, /const completedMigration = readMigrationRecord\(id\)/);
  assert.match(pilot, /if \(completedMigration\) \{[\s\S]*migratedFromWallet: completedMigration\.migratedFromWallet/);
  assert.match(pilot, /export const migrateLegacyWalletIntoPilot/);
  assert.match(pilot, /if \(!sourceFound \|\| !success\) \{[\s\S]*completed: false/);
  assert.match(pilot, /const completionSaved = safeSet\([\s\S]*STORAGE_KEYS\.PILOT_PROFILE_MIGRATION/);
  assert.match(pilot, /verifiedRecord\?\.migratedFromWallet === normalizedWalletAddress/);
  assert.match(app, /migrateLegacyWalletIntoPilot\([\s\S]*pilotProfile\.id,[\s\S]*activeWalletAddress/);
  assert.doesNotMatch(initialize, /WALLET_ADDRESS|migrateLegacyWalletIntoPilot/);
  assert.match(squadMigration, /sourceFound: false,[\s\S]*success: true/);
  assert.match(squadMigration, /verifyStoredProfile\(targetWeeklyKey, targetId\)/);
  assert.match(squadMigration, /verifyStoredProfile\(targetPermanentKey, targetId\)/);
  assert.doesNotMatch(pilot, /removeItem\(/);
  assert.doesNotMatch(squadMigration, /removeItem\(/);
});

test('Pilot stats use a Pilot-keyed storage record', () => {
  const pilot = read('services', 'pilotProfileService.ts');

  assert.match(pilot, /getPilotStatsStorageKey = \(pilotProfileId: string\)/);
  assert.match(pilot, /`\$\{STORAGE_KEYS\.PLAYER_STATS\}:\$\{normalizeProfileId\(pilotProfileId\)\}`/);
  assert.match(pilot, /readPilotStats = \(pilotProfileId: string\)[\s\S]*safeGet\(getPilotStatsStorageKey\(pilotProfileId\)\)/);
  assert.match(pilot, /savePilotStats = \([\s\S]*pilotProfileId: string[\s\S]*const statsKey = getPilotStatsStorageKey\(pilotProfileId\)[\s\S]*safeSet\(statsKey, JSON\.stringify\(sanitized\)\)/);
});

test('App loads and saves squad and stats by pilotProfile.id rather than wallet address', () => {
  const app = read('App.tsx');

  assert.match(app, /const \[pilotProfile\] = useState\(initializeLocalPilotProfile\)/);
  assert.match(app, /loadWeeklySquadState\(pilotProfile\.id\)/);
  assert.match(app, /loadPermanentSquadState\(pilotProfile\.id\)/);
  assert.match(app, /readPilotStats\(pilotProfile\.id\)/);
  assert.match(app, /savePilotStats\(pilotProfile\.id/);
  assert.match(app, /setPlayerNameInput\] = useState<string>\(\(\) => \([\s\S]*readPilotStats\(pilotProfile\.id\)\.playerName/);
  assert.match(app, /\[isOwnerWallet, pilotProfile\.id\]/);
  assert.doesNotMatch(app, /loadWeeklySquadState\(activeWalletAddress/);
  assert.doesNotMatch(app, /loadPermanentSquadState\(activeWalletAddress/);
  assert.doesNotMatch(app, /readPilotStats\(activeWalletAddress/);
  assert.doesNotMatch(app, /savePilotStats\(activeWalletAddress/);
});

test('all non-founder runs accrue Pilot weekly and permanent progress', () => {
  const app = read('App.tsx');

  assert.match(app, /if \(!isFounderSandboxRun\) \{[\s\S]*updatePermanentSquadState\(recordBossVictory\)/);
  assert.match(app, /if \(!isFounderSandboxRun && squadRunAppliedGameIdRef\.current !== gameId\) \{[\s\S]*applySquadRunResult/);
  assert.match(app, /if \(!isFounderSandboxRun && permanentRunAppliedGameIdRef\.current !== gameId\) \{[\s\S]*recordLifetimeRun/);
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
  assert.doesNotMatch(
    squad.slice(squad.indexOf('const mergePermanentSquadProfiles'), squad.indexOf('export const migrateLegacySquadProfile')),
    /mintedMiniShips: source\.mintedMiniShips/
  );
});
