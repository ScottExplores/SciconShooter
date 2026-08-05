import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { validateGameCampaign as validateServerCampaign } from '../server/gameCampaignValidation.mjs';
import { validateConfig as validateDirectorConfig } from '../server/validation.mjs';
import { campaignWeightedSpawnThreat } from '../../tools/lib/campaign-overhaul-v22-normalizer.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, '..', '..');
const trackedCampaign = JSON.parse(await readFile(path.join(root, 'game-config', 'campaign.json'), 'utf8'));
const directorWaveFixture = JSON.parse(await readFile(
  path.join(root, 'director-data', 'fixtures', 'default-wave-campaign.json'),
  'utf8'
));
const vite = await createViteServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true }
});
const { validateGameCampaign: validateBrowserCampaign } = await vite.ssrLoadModule('/game-config/validate.ts');

test.after(async () => {
  await vite.close();
});

const makeStrictlyCompatibleCampaign = () => {
  const campaign = structuredClone(trackedCampaign);
  const sectorIds = campaign.sectors.map((sector) => sector.id);
  const missionRoles = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];
  campaign.formationPacks.forEach((pack) => {
    pack.compatibleSectorIds = [...sectorIds];
    pack.compatibleMissionRoles = [...missionRoles];
  });
  campaign.levels.forEach((level) => {
    let missionBudget = level.campaignProgression.combatBudget;
    level.waves.forEach((wave) => {
      const packBudget = wave.formationPackIds.reduce((total, packId) => (
        total + (campaign.formationPacks.find((pack) => pack.id === packId)?.totalThreatCost ?? 0)
      ), 0);
      wave.combatBudget = Math.max(wave.combatBudget, packBudget);
      missionBudget = Math.max(missionBudget, wave.combatBudget);
    });
    level.campaignProgression.combatBudget = missionBudget;
  });
  campaign.campaignBranches.forEach((branch) => {
    const source = campaign.levels.find((level) => level.id === branch.sourceMissionId);
    if (source?.campaignProgression?.mapPosition && branch.routeControlPoints.length > 0) {
      branch.routeControlPoints[0] = { ...source.campaignProgression.mapPosition };
    }
  });
  return campaign;
};

const assertBothInvalid = (campaign, pattern) => {
  const server = validateServerCampaign(campaign);
  const browser = validateBrowserCampaign(campaign);
  assert.equal(server.valid, false);
  assert.equal(browser.valid, false);
  assert.match(server.errors.join('\n'), pattern);
  assert.match(browser.issues.map((issue) => `${issue.path} ${issue.message}`).join('\n'), pattern);
};

test('tracked campaign.json satisfies the complete browser and Director contract', () => {
  assert.deepEqual(validateServerCampaign(trackedCampaign), { valid: true, errors: [] });
  assert.deepEqual(validateBrowserCampaign(trackedCampaign), { valid: true, issues: [] });
});

test('authored formation metadata, weighted budgets, and teaching encounters match real wave mechanics', () => {
  const rolesById = new Map(trackedCampaign.enemyRoles.map((role) => [role.id, role]));
  const packsById = new Map(trackedCampaign.formationPacks.map((pack) => [pack.id, pack]));
  const referencedPackIds = new Set();

  trackedCampaign.levels.forEach((level) => {
    level.waves.forEach((wave, waveIndex) => {
      const spawnEvents = wave.events.filter((event) => event.kind === 'spawn');
      const weightedThreat = spawnEvents.reduce((sum, event) => {
        const roleIds = event.enemies.map((enemy) => enemy.roleId);
        const spriteKeys = event.enemies.map((enemy) => enemy.spriteKey);
        assert.equal(new Set(roleIds).size, roleIds.length, `${event.id} must not repeat an enemy role`);
        assert.equal(new Set(spriteKeys).size, spriteKeys.length, `${event.id} must not repeat an enemy silhouette`);
        event.enemies.forEach((enemy) => {
          const role = rolesById.get(enemy.roleId);
          assert.equal(enemy.enemyId, role.enemyId, `${event.id} enemyId must match ${enemy.roleId}`);
          assert.equal(enemy.spriteKey, role.spriteKey, `${event.id} spriteKey must match ${enemy.roleId}`);
        });
        const eventThreat = campaignWeightedSpawnThreat(event, rolesById);
        return sum + eventThreat;
      }, 0);
      assert.equal(
        new Set(wave.formationPackIds).size,
        wave.formationPackIds.length,
        `${wave.id} must not repeat a formation pack`
      );
      wave.formationPackIds.forEach((packId) => {
        const pack = packsById.get(packId);
        const compatibilityRole = level.campaignProgression.missionRole === 'major-boss'
          && waveIndex < level.waves.length - 1
          ? 'boss-preparation'
          : level.campaignProgression.missionRole;
        assert.ok(pack, `${wave.id} must reference a known formation pack`);
        assert.ok(
          pack.compatibleSectorIds.includes(level.campaignProgression.sectorId),
          `${packId} must support ${level.campaignProgression.sectorId}`
        );
        assert.ok(
          pack.compatibleMissionRoles.includes(compatibilityRole),
          `${packId} must support ${compatibilityRole}`
        );
        referencedPackIds.add(packId);
      });
      assert.ok(wave.combatBudget + 1e-9 >= weightedThreat, `${wave.id} must budget weighted count × role threat`);
    });
  });

  trackedCampaign.formationPacks.forEach((pack) => {
    assert.ok(referencedPackIds.has(pack.id), `${pack.id} must be used by an authored encounter`);
  });

  trackedCampaign.sectors.forEach((sector) => {
    const teachingEncounters = sector.missionIds.slice(0, 4).map((missionId) => {
      const level = trackedCampaign.levels.find((candidate) => candidate.id === missionId);
      const wave = level.waves.find((candidate) => candidate.rhythm === 'introduce');
      const spawn = wave.events.find((event) => event.kind === 'spawn');
      return {
        pattern: spawn.patternId,
        label: spawn.label,
        roles: spawn.enemies.map((enemy) => enemy.roleId).sort().join('|')
      };
    });
    assert.equal(new Set(teachingEncounters.map((entry) => entry.pattern)).size, 4, `${sector.id} teaching patterns must differ`);
    assert.ok(
      new Set(teachingEncounters.map((entry) => entry.roles)).size >= 2,
      `${sector.id} teaching encounters must use at least two role loadouts`
    );
    assert.equal(new Set(teachingEncounters.map((entry) => entry.label)).size, 4, `${sector.id} teaching labels must differ`);
  });
});

test('browser and Director accept and round-trip the complete Campaign overhaul manifest', () => {
  const campaign = makeStrictlyCompatibleCampaign();
  assert.deepEqual(validateServerCampaign(campaign), { valid: true, errors: [] });
  assert.deepEqual(validateBrowserCampaign(campaign), { valid: true, issues: [] });
  const roundTripped = JSON.parse(JSON.stringify(campaign));
  assert.deepEqual(validateServerCampaign(roundTripped), { valid: true, errors: [] });
  assert.deepEqual(validateBrowserCampaign(roundTripped), { valid: true, issues: [] });
});

test('five-Mission sector structure and cross references are enforced by both validators', () => {
  const sixMissions = makeStrictlyCompatibleCampaign();
  sixMissions.sectors[0].missionIds.push(sixMissions.sectors[1].missionIds[0]);
  assertBothInvalid(sixMissions, /exactly five Missions|exactly five/);

  const unknownTheme = makeStrictlyCompatibleCampaign();
  unknownTheme.sectors[0].themeId = 'missing-theme';
  assertBothInvalid(unknownTheme, /unknown visual theme|Unknown Campaign visual theme/);

  const wrongRole = makeStrictlyCompatibleCampaign();
  wrongRole.levels[0].campaignProgression.missionRole = 'major-boss';
  assertBothInvalid(wrongRole, /must (?:use role|be) introduction/);
});

test('budgets, power bands, formation packs, and spawn role references are strict', () => {
  const powerCurve = makeStrictlyCompatibleCampaign();
  powerCurve.levels[0].campaignProgression.recommendedPower = {
    minimum: 2000,
    expected: 1000,
    comfortable: 3000
  };
  assertBothInvalid(powerCurve, /minimum <= expected <= comfortable/);

  const unknownPack = makeStrictlyCompatibleCampaign();
  unknownPack.levels[0].waves[0].formationPackIds = ['missing-pack'];
  assertBothInvalid(unknownPack, /unknown formation pack|Unknown formation pack/);

  const wrongEnemyRole = makeStrictlyCompatibleCampaign();
  const spawn = wrongEnemyRole.levels.flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.kind === 'spawn');
  const incompatibleRole = wrongEnemyRole.enemyRoles.find((role) => role.enemyId !== spawn.enemies[0].enemyId);
  spawn.enemies[0].roleId = incompatibleRole.id;
  assertBothInvalid(wrongEnemyRole, /belongs to .*not/);
});

test('optional combat branch contracts reject kind mismatches, bosses, forged budgets, roles, and power-ups', () => {
  const kindMismatch = makeStrictlyCompatibleCampaign();
  const formationBranch = kindMismatch.campaignBranches.find((branch) => (
    branch.branchId === 'branch-null-helix-formation'
  ));
  formationBranch.missionType = 'elite-remix';
  assertBothInvalid(kindMismatch, /kind must match|kind.*match.*mission type/i);

  const injectedBoss = makeStrictlyCompatibleCampaign();
  const bossBranch = injectedBoss.campaignBranches.find((branch) => (
    branch.branchId === 'branch-null-helix-formation'
  ));
  bossBranch.missionDefinition.events[0].kind = 'boss';
  assertBothInvalid(injectedBoss, /boss/);

  const forgedBudget = makeStrictlyCompatibleCampaign();
  const budgetBranch = forgedBudget.campaignBranches.find((branch) => (
    branch.branchId === 'branch-terminus-elite-remix'
  ));
  budgetBranch.missionDefinition.combatBudget = 1;
  assertBothInvalid(forgedBudget, /combatBudget|combat branch budget/);

  const unknownRole = makeStrictlyCompatibleCampaign();
  const roleBranch = unknownRole.campaignBranches.find((branch) => (
    branch.branchId === 'branch-null-helix-formation'
  ));
  roleBranch.missionDefinition.events.find((event) => event.kind === 'spawn')
    .enemies[0].roleId = 'missing-role';
  assertBothInvalid(unknownRole, /unknown enemy role/i);

  const unavailablePowerup = makeStrictlyCompatibleCampaign();
  const supportBranch = unavailablePowerup.campaignBranches.find((branch) => (
    branch.branchId === 'branch-ion-support-relay'
  ));
  supportBranch.missionDefinition.availablePowerupIds = ['magnet'];
  assertBothInvalid(unavailablePowerup, /enabled by the owning level|not available in the owning level/);
});

test('the Director wave schema accepts authored branches and structurally excludes boss events', () => {
  const configured = structuredClone(directorWaveFixture);
  configured.campaignBranches = structuredClone(trackedCampaign.campaignBranches);
  assert.deepEqual(validateDirectorConfig('wave-campaign', configured), { valid: true, errors: [] });

  const injectedBoss = structuredClone(configured);
  const combatBranch = injectedBoss.campaignBranches.find((branch) => (
    branch.branchId === 'branch-null-helix-formation'
  ));
  combatBranch.missionDefinition.events[0].kind = 'boss';
  const invalid = validateDirectorConfig('wave-campaign', injectedBoss);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.includes('/missionDefinition/events/0/kind')));
});

test('all canonical major boss IDs satisfy boss-defeat classification', () => {
  const campaign = makeStrictlyCompatibleCampaign();
  assert.deepEqual(
    campaign.sectors.map((sector) => sector.majorBossId),
    [
      'gatekeeper-prime',
      'paywall-decimator',
      'prism-moth',
      'frontier-crownclaw',
      'helios-clawcarrier',
      'nullwake-revenant',
      'singularity-crab',
      'orbit-gyroscope',
      'hammerhead-siege',
      'frontier-crownclaw'
    ]
  );
  assert.equal(validateServerCampaign(campaign).valid, true);
  assert.equal(validateBrowserCampaign(campaign).valid, true);
});
