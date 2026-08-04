import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigRepository, contentHash } from '../server/configRepository.mjs';
import { fileURLToPath } from 'node:url';
import { GameCampaignRepository } from '../server/gameCampaignRepository.mjs';
import { migrateLegacyGameCampaign, validateGameCampaign } from '../server/gameCampaignValidation.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const trackedRepositoryRoot = path.resolve(testDirectory, '..', '..');
const trackedCampaign = JSON.parse(await readFile(
  path.join(trackedRepositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));

const makeCampaign = () => {
  const campaign = structuredClone(trackedCampaign);
  campaign.revision = 1;
  campaign.updatedAt = '2026-07-11T12:00:00.000Z';
  return campaign;
};

const getFirstEvent = (level, predicate) => level.waves
  .flatMap((wave) => wave.events)
  .find(predicate);

const getOpeningSpawn = (campaign) => getFirstEvent(
  campaign.levels[0],
  (event) => event.kind === 'spawn'
);

const getFirstMajorBossEncounter = (campaign) => {
  const sector = campaign.sectors[0];
  const level = campaign.levels.find((candidate) => candidate.id === sector.missionIds.at(-1));
  const wave = level.waves.find((candidate) => candidate.events.some(
    (event) => event.kind === 'boss' && event.bossId === sector.majorBossId
  ));
  const event = wave.events.find(
    (candidate) => candidate.kind === 'boss' && candidate.bossId === sector.majorBossId
  );
  return { sector, level, wave, event };
};

const getFirstMajorBoss = (campaign) => getFirstMajorBossEncounter(campaign).event;

const makeCompactCampaign = () => {
  const campaign = makeCampaign();
  delete campaign.campaignGraph;
  delete campaign.campaignBranches;

  const sector = structuredClone(campaign.sectors[0]);
  delete sector.mainNodeIds;
  delete sector.routeNodeIds;
  sector.branchIds = [];
  campaign.sectors = [sector];

  const missionIds = new Set(sector.missionIds);
  campaign.levels = campaign.levels.filter((level) => missionIds.has(level.id));
  campaign.levels.forEach((level, levelIndex) => {
    level.campaignProgression.nextMissionId = campaign.levels[levelIndex + 1]?.id ?? null;
    if (level.campaignProgression.missionRole === 'major-boss') {
      level.waves = [level.waves.at(-1)];
    }
  });

  campaign.visualThemes = campaign.visualThemes.filter((theme) => theme.id === sector.themeId);
  const roleIds = new Set(campaign.levels.flatMap((level) => level.waves.flatMap(
    (wave) => wave.events.flatMap((event) => event.enemies?.map((enemy) => enemy.roleId).filter(Boolean) ?? [])
  )));
  const formationPackIds = new Set(campaign.levels.flatMap((level) => level.waves.flatMap(
    (wave) => wave.formationPackIds ?? []
  )));
  campaign.formationPacks
    .filter((pack) => formationPackIds.has(pack.id))
    .forEach((pack) => pack.enemyRoleIds.forEach((roleId) => roleIds.add(roleId)));
  const bossIds = new Set(campaign.levels.flatMap((level) => level.waves.flatMap(
    (wave) => wave.events.filter((event) => event.kind === 'boss').map((event) => event.bossId)
  )));
  campaign.enemyRoles = campaign.enemyRoles
    .filter((role) => roleIds.has(role.id))
    .map((role) => ({
      ...role,
      compatibleFormationPackIds: role.compatibleFormationPackIds.filter((id) => formationPackIds.has(id))
    }));
  campaign.formationPacks = campaign.formationPacks
    .filter((pack) => formationPackIds.has(pack.id))
    .map((pack) => ({ ...pack, compatibleSectorIds: [sector.id] }));
  campaign.miniBosses = campaign.miniBosses
    .filter((miniBoss) => bossIds.has(miniBoss.bossId))
    .map((miniBoss) => ({ ...miniBoss, suitableSectorIds: [sector.id] }));
  return campaign;
};

const makeLegacyCampaign = () => ({
  schemaVersion: 1,
  revision: 1,
  id: 'scicon-default-campaign',
  name: 'Scicon Shooter Campaign',
  updatedAt: '2026-07-11T12:00:00.000Z',
  fps: 60,
  recordCard: {
    copy: {
      title: 'MISSION RECORD',
      subtitle: 'SCICON SHOOTER',
      callsignLabel: 'CALLSIGN',
      scoreLabel: 'FINAL SCORE',
      verifiedLabel: 'SERVER VERIFIED',
      reviewLabel: 'REVIEWED RUN',
      metricLabels: { wave: 'WAVE', targets: 'TARGETS', coins: 'COINS', flight: 'FLIGHT' }
    },
    colors: {
      background: '#020617',
      panel: '#07152A',
      primary: '#67E8F9',
      secondary: '#2563EB',
      success: '#6EE7B7',
      warning: '#FACC15',
      text: '#FFFFFF',
      muted: '#94A3B8'
    },
    showGrid: true,
    shipAssetKey: 'PLAYER_SHIP',
    encounterAssetKey: 'AUTO',
    art: {
      ship: { x: 290, y: 370, width: 260, height: 260, rotation: 0, opacity: 1, visible: true },
      encounter: { x: 805, y: 365, width: 210, height: 210, rotation: 0, opacity: 0.88, visible: true }
    }
  },
  hudAssets: {
    bombIconAssetKey: 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F'
  },
  levels: [
    {
      id: 'open-orbit',
      name: 'Open Orbit',
      description: 'Opening research sector.',
      order: 1,
      backgroundId: 'open-orbit',
      musicId: 'procedural-main',
      startingDifficulty: 1,
      scoreTarget: 2000,
      durationSeconds: null,
      loopWaves: true,
      availablePowerupIds: ['shield', 'projectile-upgrade'],
      scorecard: {
        trigger: 'mission-end',
        title: 'Mission Record',
        subtitle: 'Scicon Shooter',
        scoreLabel: 'Final Score',
        metrics: ['wave', 'targets', 'coins', 'flight'],
        showEncounterArt: true,
        encounterAssetKey: 'FINAL_BOSS'
      },
      waves: [
        {
          id: 'wave-1',
          name: 'Opening Review',
          order: 1,
          accent: '#22d3ee',
          backgroundId: 'open-orbit',
          completionRule: 'boss-defeat',
          difficultyMultiplier: 1,
          durationSeconds: 60,
          introSeconds: 2.5,
          delayAfterSeconds: 5,
          scoreMultiplier: 1,
          threatCap: 46,
          events: [
            {
              id: 'opening-drones',
              label: 'Opening drones',
              kind: 'spawn',
              startSeconds: 0,
              durationSeconds: 20,
              delayAfterSeconds: 0,
              blocksWaveClock: false,
              count: 8,
              patternId: 'v',
              positionId: 'formation-top',
              spawnIntervalSeconds: 2.5,
              enemies: [{
                enemyId: 'drone',
                spriteKey: 'ENEMY_DRONE_FRAMES',
                weight: 1,
                health: 2,
                speed: 2.5,
                damage: 1,
                scoreValue: 10,
                powerupDropChance: 0.08
              }]
            },
            {
              id: 'review-gatekeeper',
              label: 'Review Gatekeeper',
              kind: 'boss',
              startSeconds: 40,
              durationSeconds: 20,
              delayAfterSeconds: 0,
              blocksWaveClock: true,
              bossId: 'gatekeeper',
              rigId: 'open-orbit',
              spriteKey: 'FINAL_BOSS',
              positionId: 'center-top',
              health: 235,
              movementPatternId: 'gatekeeper-cycle',
              warningSeconds: 5,
              speed: 2,
              damage: 1,
              scoreReward: 1000,
              powerupDropChance: 1,
              shieldCount: 0,
              weapons: [{
                id: 'spread-burst',
                weaponId: 'burst-volley',
                attackIntervalSeconds: 1,
                damage: 1,
                projectileSpeed: 6,
                burstCount: 3
              }],
              phases: [{
                id: 'full-health',
                label: 'Full health',
                triggerHealthRatio: 1,
                movementPatternId: 'gatekeeper-cycle',
                speedMultiplier: 1,
                weaponSettingIds: ['spread-burst']
              }]
            }
          ]
        }
      ]
    }
  ]
});

const makeRepository = async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-game-campaign-'));
  const dataRoot = path.join(repositoryRoot, 'director-data');
  await mkdir(path.join(repositoryRoot, 'game-config'), { recursive: true });
  await writeFile(
    path.join(repositoryRoot, 'game-config', 'campaign.json'),
    `${JSON.stringify(makeCampaign(), null, 2)}\n`,
    'utf8'
  );
  let clockTick = 0;
  let randomTick = 0;
  const repository = new GameCampaignRepository({
    repositoryRoot,
    dataRoot,
    clock: () => new Date(Date.UTC(2026, 6, 11, 13, 0, clockTick++)),
    randomId: () => String(++randomTick).padStart(6, '0')
  });
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  return { repository, repositoryRoot, dataRoot };
};

const requestJson = ({ port, path: requestPath, method = 'GET', body, headers = {} }) => new Promise((resolve, reject) => {
  const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
  const request = httpRequest({
    hostname: '127.0.0.1',
    port,
    path: requestPath,
    method,
    headers: {
      Host: `127.0.0.1:${port}`,
      Accept: 'application/json',
      ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
      ...headers
    }
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve({
      status: response.statusCode,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    }));
  });
  request.on('error', reject);
  if (encoded) request.write(encoded);
  request.end();
});

test('game campaign repository confines both tracked and history paths to the workspace', async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-game-campaign-boundary-'));
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  assert.throws(
    () => new GameCampaignRepository({
      repositoryRoot,
      dataRoot: path.resolve(repositoryRoot, '..', 'escaped-director-data')
    }),
    /escapes/
  );
});

test('structural game campaign validation covers nested runtime tuning fields', () => {
  assert.deepEqual(validateGameCampaign(makeCampaign()), { valid: true, errors: [] });
  const invalid = makeCampaign();
  const spawn = getOpeningSpawn(invalid);
  const boss = getFirstMajorBoss(invalid);
  spawn.count = 0;
  spawn.enemies[0].weight = 2;
  boss.phases[0].weaponSettingIds.push('missing-weapon');
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/count')));
  assert.ok(result.errors.some((error) => error.includes('/weight')));
  assert.ok(result.errors.some((error) => error.includes('weaponSettingIds')));
});

test('wave completion rules stay consistent with authored sector major-boss Missions', () => {
  const missingBoss = makeCampaign();
  const missingBossEncounter = getFirstMajorBossEncounter(missingBoss);
  missingBossEncounter.wave.events = missingBossEncounter.wave.events.filter(
    (event) => event !== missingBossEncounter.event
  );
  const missingBossResult = validateGameCampaign(missingBoss);
  assert.equal(missingBossResult.valid, false);
  assert.ok(missingBossResult.errors.some(
    (error) => error.includes('must be the only matching sector major boss encounter')
  ));

  const unexpectedBoss = makeCampaign();
  getFirstMajorBossEncounter(unexpectedBoss).wave.completionRule = 'clear-after-duration';
  const unexpectedBossResult = validateGameCampaign(unexpectedBoss);
  assert.equal(unexpectedBossResult.valid, false);
  assert.ok(unexpectedBossResult.errors.some((error) => error.includes('cannot contain a canonical major-boss event')));
});

test('legacy schema-v1 completion rules migrate without weakening revision-22 validation', () => {
  const clearLegacy = makeCampaign();
  delete clearLegacy.levels[0].waves[0].completionRule;
  const strictLegacyResult = validateGameCampaign(clearLegacy);
  assert.equal(strictLegacyResult.valid, false);
  assert.ok(strictLegacyResult.errors.some((error) => error.includes('/completionRule')));

  const migratedClear = migrateLegacyGameCampaign(clearLegacy);
  assert.notEqual(migratedClear, clearLegacy);
  assert.equal(Object.hasOwn(clearLegacy.levels[0].waves[0], 'completionRule'), false);
  assert.equal(migratedClear.levels[0].waves[0].completionRule, 'clear-after-duration');
  assert.deepEqual(validateGameCampaign(migratedClear), { valid: true, errors: [] });

  const bossLegacy = makeLegacyCampaign();
  delete bossLegacy.levels[0].waves[0].completionRule;
  const migratedBoss = migrateLegacyGameCampaign(bossLegacy);
  assert.equal(migratedBoss.levels[0].waves[0].completionRule, 'boss-defeat');

  const explicitlyInvalid = makeCampaign();
  explicitlyInvalid.levels[0].waves[0].completionRule = 'legacy-auto';
  const preserved = migrateLegacyGameCampaign(explicitlyInvalid);
  assert.equal(preserved, explicitlyInvalid);
  assert.equal(validateGameCampaign(preserved).valid, false);
});

test('boss rigs are optional, allowlisted, and limited to canonical major-boss encounters', () => {
  const legacy = makeCampaign();
  delete getFirstMajorBoss(legacy).rigId;
  assert.deepEqual(validateGameCampaign(legacy), { valid: true, errors: [] });

  const configured = makeCampaign();
  getFirstMajorBoss(configured).rigId = 'crown-claw';
  assert.deepEqual(validateGameCampaign(configured), { valid: true, errors: [] });

  const unknownRig = makeCampaign();
  getFirstMajorBoss(unknownRig).rigId = 'unregistered-rig';
  const unknownResult = validateGameCampaign(unknownRig);
  assert.equal(unknownResult.valid, false);
  assert.ok(unknownResult.errors.some((error) => error.includes('/rigId')));

  const unsupportedBoss = makeCampaign();
  getFirstMajorBoss(unsupportedBoss).bossId = 'bottleneck-drone';
  const unsupportedResult = validateGameCampaign(unsupportedBoss);
  assert.equal(unsupportedResult.valid, false);
  assert.ok(unsupportedResult.errors.some((error) => error.includes('canonical major-boss encounters only')));
});

test('spawn anchors are optional normalized points with no extra fields', () => {
  const anchored = makeCampaign();
  getOpeningSpawn(anchored).spawnAnchor = { x: 0.35, y: 0.2 };
  getFirstMajorBoss(anchored).spawnAnchor = { x: 0.5, y: 0.25 };
  assert.deepEqual(validateGameCampaign(anchored), { valid: true, errors: [] });

  const invalid = makeCampaign();
  getOpeningSpawn(invalid).spawnAnchor = { x: -0.1, y: 1.1, z: 0.5 };
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/spawnAnchor/x')));
  assert.ok(result.errors.some((error) => error.includes('/spawnAnchor/y')));
  assert.ok(result.errors.some((error) => error.includes('unsupported fields: z')));
});

test('sprite validation enforces role-bound enemy art and gameplay categories', () => {
  const validSwap = makeCampaign();
  assert.deepEqual(validateGameCampaign(validSwap), { valid: true, errors: [] });

  const invalid = makeCampaign();
  const events = invalid.levels[0].waves[0].events;
  getOpeningSpawn(invalid).enemies[0].spriteKey = 'FINAL_BOSS';
  getFirstMajorBoss(invalid).spriteKey = 'GAME_BG_BACK';
  events.splice(1, 0, {
    id: 'unsafe-asteroid-belt',
    label: 'Unsafe asteroid belt',
    kind: 'asteroid-belt',
    startSeconds: 30,
    durationSeconds: 5,
    delayAfterSeconds: 0,
    blocksWaveClock: true,
    spriteKey: 'PLAYER_SHIP',
    count: 5,
    density: 0.5,
    patternId: 'asteroid-lanes',
    positionId: 'lane-top',
    spawnIntervalSeconds: 0.5,
    warningSeconds: 1,
    health: 4,
    speed: 2,
    damage: 1,
    scoreValue: 20,
    powerupDropChance: 0.08
  });

  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  const spriteErrors = result.errors.filter((error) => error.includes('/spriteKey has unsupported value'));
  assert.equal(spriteErrors.length, 3);
  assert.ok(spriteErrors.some((error) => error.includes('/events/0/enemies/0/spriteKey')));
  assert.ok(spriteErrors.some((error) => error.includes('/spriteKey')));
});

test('Mission 20 expansion art preserves enemy, mini-boss, boss, and scorecard role boundaries', () => {
  const valid = makeCampaign();
  const validMission = valid.levels.find((level) => level.order === 20);
  validMission.scorecard.encounterAssetKey = 'CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT';
  valid.recordCard.encounterAssetKey = 'CAMPAIGN_BOSS_ECLIPSE_ENGINE';
  assert.deepEqual(validateGameCampaign(valid), { valid: true, errors: [] });

  const invalid = makeCampaign();
  const invalidMission = invalid.levels.find((level) => level.order === 20);
  getFirstEvent(invalidMission, (event) => event.kind === 'spawn').enemies[0].spriteKey = 'CAMPAIGN_BOSS_RAIL_SERPENT';
  getFirstEvent(invalidMission, (event) => event.kind === 'boss').spriteKey = 'CAMPAIGN_ENEMY_CRESCENT_MINELAYER';
  invalidMission.scorecard.encounterAssetKey = 'POWERUP_MAX_SHOT_AURA_FRAMES';
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/enemies/0/spriteKey has unsupported value')));
  assert.ok(result.errors.some((error) => error.includes('/events/0/spriteKey has unsupported value')));
  assert.ok(result.errors.some((error) => error.includes('/scorecard/encounterAssetKey has unsupported value')));
});

test('generated assets are accepted only for their registered game roles and raw paths stay forbidden', () => {
  const validHud = makeCampaign();
  assert.deepEqual(validateGameCampaign(validHud), { valid: true, errors: [] });

  const wrongRole = makeCampaign();
  getOpeningSpawn(wrongRole).enemies[0].spriteKey = 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F';
  const wrongRoleResult = validateGameCampaign(wrongRole);
  assert.equal(wrongRoleResult.valid, false);
  assert.ok(wrongRoleResult.errors.some((error) => error.includes('/enemies/0/spriteKey has unsupported value')));

  const rawPath = makeCampaign();
  rawPath.hudAssets.bombIconAssetKey = '/game-art/generated/biohazard-bomb-e5d01d651f2f.png';
  const rawPathResult = validateGameCampaign(rawPath);
  assert.equal(rawPathResult.valid, false);
  assert.ok(rawPathResult.errors.some((error) => error.includes('/hudAssets/bombIconAssetKey has unsupported value')));
});

test('the actual tracked game campaign passes the local server mirror validator', async () => {
  const campaign = JSON.parse(await readFile(path.join(trackedRepositoryRoot, 'game-config', 'campaign.json'), 'utf8'));
  assert.deepEqual(validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('legacy tracked campaigns retain their stored hash while opening with inferred completion rules', async (t) => {
  const { repository, repositoryRoot } = await makeRepository(t);
  const legacyCampaign = makeCampaign();
  delete legacyCampaign.levels[0].waves[0].completionRule;
  const legacyHash = contentHash(legacyCampaign);
  const campaignPath = path.join(repositoryRoot, 'game-config', 'campaign.json');
  await writeFile(campaignPath, `${JSON.stringify(legacyCampaign, null, 2)}\n`, 'utf8');

  const state = await repository.readCampaign();
  assert.equal(state.contentHash, legacyHash, 'legacy draft base hashes must still match the stored campaign');
  assert.equal(state.campaign.levels[0].waves[0].completionRule, 'clear-after-duration');
  const stored = JSON.parse(await readFile(campaignPath, 'utf8'));
  assert.equal(Object.hasOwn(stored.levels[0].waves[0], 'completionRule'), false);
});

test('invalid apply leaves the tracked file, manifest, and version history unchanged', async (t) => {
  const { repository, repositoryRoot, dataRoot } = await makeRepository(t);
  const before = await repository.readCampaign();
  const invalid = structuredClone(before.campaign);
  getOpeningSpawn(invalid).enemies[0].health = -1;

  await assert.rejects(
    () => repository.applyCampaign(invalid, { expectedContentHash: before.contentHash }),
    /Invalid game campaign/
  );
  const afterFile = JSON.parse(await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8'));
  assert.deepEqual(afterFile, before.campaign);
  assert.deepEqual(await repository.listVersions(), []);
  await assert.rejects(
    () => readFile(path.join(dataRoot, 'game-campaign', 'manifest.json'), 'utf8'),
    { code: 'ENOENT' }
  );
});

test('apply snapshots the baseline, atomically updates disk, and enforces optimistic concurrency', async (t) => {
  const { repository, repositoryRoot, dataRoot } = await makeRepository(t);
  const before = await repository.readCampaign();
  const edited = structuredClone(before.campaign);
  edited.levels[0].name = 'Open Orbit Tuned';

  const applied = await repository.applyCampaign(edited, {
    expectedContentHash: before.contentHash,
    changeNote: 'Increase opening formation'
  });
  assert.equal(applied.campaign.revision, 2);
  assert.equal(applied.campaign.levels[0].name, 'Open Orbit Tuned');
  assert.equal(applied.version.source, 'apply');
  assert.equal(applied.version.changeNote, 'Increase opening formation');

  const disk = JSON.parse(await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(dataRoot, 'game-campaign', 'manifest.json'), 'utf8'));
  assert.deepEqual(disk, applied.campaign);
  assert.equal(manifest.activeVersionId, applied.activeVersionId);
  assert.equal(manifest.contentHash, applied.contentHash);

  const history = await repository.listVersions();
  assert.deepEqual(history.map((version) => version.source), ['apply', 'baseline']);
  assert.deepEqual(history.map((version) => version.revision), [2, 1]);
  assert.equal(history[0].parentId, history[1].id);

  const staleEdit = structuredClone(applied.campaign);
  staleEdit.levels[0].name = 'Stale name';
  await assert.rejects(
    () => repository.applyCampaign(staleEdit, { expectedContentHash: before.contentHash }),
    /changed; revert or reload/
  );
  assert.deepEqual(await repository.listVersions(), history);
});

test('review references resolve only to the current disk hash or active immutable campaign version', async (t) => {
  const { repository } = await makeRepository(t);
  const disk = await repository.readCampaign();
  const diskContext = {
    campaignId: disk.campaign.id,
    campaignRevision: disk.revision,
    campaignContentHash: disk.contentHash
  };
  const diskReference = `game-campaign-disk-r${disk.revision}-${disk.contentHash.slice(7, 19)}`;
  assert.equal(await repository.resolveReviewConfigReference(diskReference, diskContext), diskReference);
  await assert.rejects(
    () => repository.resolveReviewConfigReference('game-campaign-disk-r1-000000000000', diskContext),
    /Invalid level-editor review reference/
  );

  const draft = structuredClone(disk.campaign);
  draft.levels[0].waves[0].name = 'Draft Opening Review';
  const draftHash = contentHash(draft);
  const draftReference = `game-campaign-draft-r${disk.revision}-${draftHash.slice(7, 19)}`;
  const draftContext = {
    ...diskContext,
    draft: true,
    draftContentHash: draftHash,
    levelId: draft.levels[0].id,
    levelName: draft.levels[0].name,
    waveId: draft.levels[0].waves[0].id,
    waveName: draft.levels[0].waves[0].name
  };
  assert.equal(
    await repository.resolveReviewConfigReference(draftReference, draftContext, draft),
    draftReference
  );
  await assert.rejects(
    () => repository.resolveReviewConfigReference(draftReference, { ...draftContext, waveName: 'Not in draft' }, draft),
    /Invalid level-editor review reference/
  );

  const edited = structuredClone(disk.campaign);
  edited.levels[0].name = 'Reviewed Open Orbit';
  const applied = await repository.applyCampaign(edited, { expectedContentHash: disk.contentHash });
  const appliedContext = {
    campaignId: applied.campaign.id,
    campaignRevision: applied.campaign.revision,
    campaignContentHash: applied.contentHash
  };
  assert.equal(
    await repository.resolveReviewConfigReference(applied.activeVersionId, appliedContext),
    applied.activeVersionId
  );
  await assert.rejects(
    () => repository.resolveReviewConfigReference(applied.activeVersionId, { ...appliedContext, campaignRevision: 1 }),
    /Invalid level-editor review reference/
  );
});

test('rollback verifies a selected immutable version and records a new rollback revision', async (t) => {
  const { repository } = await makeRepository(t);
  const before = await repository.readCampaign();
  const edited = structuredClone(before.campaign);
  edited.levels[0].name = 'Open Orbit Tuned';
  const applied = await repository.applyCampaign(edited, { expectedContentHash: before.contentHash });
  const baseline = (await repository.listVersions()).find((version) => version.source === 'baseline');

  const rolledBack = await repository.rollback(baseline.id, {
    expectedContentHash: applied.contentHash,
    changeNote: 'Restore tracked baseline'
  });
  assert.equal(rolledBack.campaign.revision, 3);
  assert.equal(rolledBack.campaign.levels[0].name, before.campaign.levels[0].name);
  assert.equal(rolledBack.version.source, 'rollback');
  assert.equal(rolledBack.version.rollbackOf, baseline.id);
  assert.deepEqual((await repository.listVersions()).map((version) => version.revision), [3, 2, 1]);
});

test('legacy immutable campaign snapshots can be listed and rolled forward with inferred completion rules', async (t) => {
  const { repository, dataRoot } = await makeRepository(t);
  const current = await repository.readCampaign();
  const legacyPayload = structuredClone(current.campaign);
  delete legacyPayload.levels[0].waves[0].completionRule;
  const legacyHash = contentHash(legacyPayload);
  const legacyId = `game-campaign-20260711T120000000Z-${legacyHash.slice(7, 19)}-abcdef`;
  const versionRoot = path.join(dataRoot, 'game-campaign', 'versions');
  await mkdir(versionRoot, { recursive: true });
  await writeFile(path.join(versionRoot, `${legacyId}.json`), `${JSON.stringify({
    schemaVersion: 1,
    kind: 'game-campaign',
    id: legacyId,
    revision: legacyPayload.revision,
    parentId: null,
    rollbackOf: null,
    source: 'baseline',
    createdAt: '2026-07-11T12:00:00.000Z',
    changeNote: 'Legacy snapshot before completion rules',
    contentHash: legacyHash,
    payload: legacyPayload
  }, null, 2)}\n`, 'utf8');

  assert.ok((await repository.listVersions()).some((version) => version.id === legacyId));
  const restored = await repository.rollback(legacyId, { expectedContentHash: current.contentHash });
  assert.equal(restored.campaign.levels[0].waves[0].completionRule, 'clear-after-duration');
  assert.deepEqual(validateGameCampaign(restored.campaign), { valid: true, errors: [] });
});

test('legacy schema-v1 payloads retain current scorecard and HUD presentation when applied', async (t) => {
  const { repository } = await makeRepository(t);
  const before = await repository.readCampaign();
  const legacyPayload = structuredClone(before.campaign);
  delete legacyPayload.recordCard;
  delete legacyPayload.hudAssets;
  legacyPayload.levels[0].waves[0].events[0].label = 'Legacy opening formation';

  const applied = await repository.applyCampaign(legacyPayload, {
    expectedContentHash: before.contentHash,
    changeNote: 'Open an earlier schema-v1 revision'
  });

  assert.deepEqual(applied.campaign.recordCard, before.campaign.recordCard);
  assert.deepEqual(applied.campaign.hudAssets, before.campaign.hudAssets);
  assert.equal(applied.campaign.levels[0].waves[0].events[0].label, 'Legacy opening formation');
});

test('game campaign HTTP routes require the mutation token and return validation errors without writes', async (t) => {
  const { repository, repositoryRoot } = await makeRepository(t);
  const legacyRepository = { bootstrap: async () => ({ ok: true }) };
  const handler = createDirectorRequestHandler({
    repository: legacyRepository,
    realRunReader: { listRuns: async () => [] },
    gameCampaignRepository: repository
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const fetched = await requestJson({ port, path: '/__director/api/game-campaign' });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.sourcePath, 'game-config/campaign.json');

  const compactCampaign = makeCompactCampaign();
  const denied = await requestJson({
    port,
    path: '/__director/api/game-campaign/apply',
    method: 'POST',
    body: { campaign: compactCampaign, expectedContentHash: fetched.body.contentHash }
  });
  assert.equal(denied.status, 403);

  const invalid = structuredClone(compactCampaign);
  getOpeningSpawn(invalid).spawnIntervalSeconds = 0;
  const rejected = await requestJson({
    port,
    path: '/__director/api/game-campaign/apply',
    method: 'POST',
    headers: { 'X-Scicon-Director': 'local' },
    body: { campaign: invalid, expectedContentHash: fetched.body.contentHash }
  });
  assert.equal(rejected.status, 422);
  assert.ok(rejected.body.errors.some((error) => error.includes('/spawnIntervalSeconds')));
  const disk = JSON.parse(await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8'));
  assert.deepEqual(disk, fetched.body.campaign);
  assert.deepEqual(await repository.listVersions(), []);
});

test('the existing review API persists normalized live-preview context through a verified disk reference', async (t) => {
  const { repository: gameRepository, repositoryRoot, dataRoot } = await makeRepository(t);
  const disk = await gameRepository.readCampaign();
  const configVersion = `game-campaign-disk-r${disk.revision}-${disk.contentHash.slice(7, 19)}`;
  const reviewLevel = disk.campaign.levels[0];
  const reviewWave = reviewLevel.waves[0];
  const reviewEvent = getOpeningSpawn(disk.campaign);
  const repository = new ConfigRepository({
    repositoryRoot,
    dataRoot,
    fixtureRoot: path.join(trackedRepositoryRoot, 'director-data', 'fixtures'),
    reviewVersionResolver: (requestedVersion, context, draftCampaign) => (
      gameRepository.resolveReviewConfigReference(requestedVersion, context, draftCampaign)
    )
  });
  const handler = createDirectorRequestHandler({
    repository,
    realRunReader: { listRuns: async () => [] },
    gameCampaignRepository: gameRepository
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const context = {
    source: 'level-editor',
    campaignId: disk.campaign.id,
    campaignRevision: disk.revision,
    campaignContentHash: disk.contentHash,
    levelId: reviewLevel.id,
    levelName: reviewLevel.name,
    waveId: reviewWave.id,
    waveName: reviewWave.name,
    eventId: reviewEvent.id,
    eventLabel: reviewEvent.label,
    eventKind: reviewEvent.kind,
    elapsedSeconds: 42.5,
    draft: false
  };
  const response = await requestJson({
    port,
    path: '/__director/reviews',
    method: 'POST',
    headers: { 'X-Scicon-Director': 'local' },
    body: {
      surface: 'wave',
      configVersion,
      target: `${reviewLevel.name} / ${reviewWave.name} / ${reviewEvent.label}`,
      note: 'Move this warning away from the sprite.',
      status: 'open',
      anchor: { x: 0.74, y: 0.22 },
      context
    }
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.review.configVersion, configVersion);
  assert.deepEqual(response.body.review.anchor, { x: 0.74, y: 0.22 });
  assert.deepEqual(response.body.review.context, context);

  const draftCampaign = makeCompactCampaign();
  const draftLevel = draftCampaign.levels[0];
  const draftWave = draftLevel.waves[0];
  const draftEvent = getOpeningSpawn(draftCampaign);
  draftWave.name = 'Draft Review Wave';
  const draftContentHash = contentHash(draftCampaign);
  const draftVersion = `game-campaign-draft-r${disk.revision}-${draftContentHash.slice(7, 19)}`;
  const draftContext = {
    ...context,
    draft: true,
    draftContentHash,
    levelId: draftLevel.id,
    levelName: draftLevel.name,
    waveId: draftWave.id,
    waveName: draftWave.name,
    eventId: draftEvent.id,
    eventLabel: draftEvent.label,
    eventKind: draftEvent.kind
  };
  const draftResponse = await requestJson({
    port,
    path: '/__director/reviews',
    method: 'POST',
    headers: { 'X-Scicon-Director': 'local' },
    body: {
      surface: 'wave',
      configVersion: draftVersion,
      target: `${draftLevel.name} / ${draftWave.name} / ${draftEvent.label}`,
      note: 'This note belongs to the exact unsaved draft.',
      status: 'open',
      anchor: { x: 0.42, y: 0.58 },
      context: draftContext,
      draftCampaign
    }
  });
  assert.equal(draftResponse.status, 201, JSON.stringify(draftResponse.body));
  assert.equal(draftResponse.body.review.configVersion, draftVersion);
  assert.equal(draftResponse.body.review.context.draftContentHash, draftContentHash);
});
