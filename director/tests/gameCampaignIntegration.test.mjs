import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ConfigRepository, contentHash } from '../server/configRepository.mjs';
import { fileURLToPath } from 'node:url';
import { GameCampaignRepository } from '../server/gameCampaignRepository.mjs';
import { validateGameCampaign } from '../server/gameCampaignValidation.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const trackedRepositoryRoot = path.resolve(testDirectory, '..', '..');

const makeCampaign = () => ({
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
      availablePowerupIds: ['shield', 'double-shot'],
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
  invalid.levels[0].waves[0].events[0].count = 0;
  invalid.levels[0].waves[0].events[0].enemies[0].weight = 2;
  invalid.levels[0].waves[0].events[1].phases[0].weaponSettingIds.push('missing-weapon');
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/count')));
  assert.ok(result.errors.some((error) => error.includes('/weight')));
  assert.ok(result.errors.some((error) => error.includes('weaponSettingIds')));
});

test('spawn anchors are optional normalized points with no extra fields', () => {
  const anchored = makeCampaign();
  anchored.levels[0].waves[0].events[0].spawnAnchor = { x: 0.35, y: 0.2 };
  anchored.levels[0].waves[0].events[1].spawnAnchor = { x: 0.5, y: 0.25 };
  assert.deepEqual(validateGameCampaign(anchored), { valid: true, errors: [] });

  const invalid = makeCampaign();
  invalid.levels[0].waves[0].events[0].spawnAnchor = { x: -0.1, y: 1.1, z: 0.5 };
  const result = validateGameCampaign(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('/spawnAnchor/x')));
  assert.ok(result.errors.some((error) => error.includes('/spawnAnchor/y')));
  assert.ok(result.errors.some((error) => error.includes('unsupported fields: z')));
});

test('sprite validation permits catalog swaps only within gameplay categories', () => {
  const validSwap = makeCampaign();
  validSwap.levels[0].waves[0].events[0].enemies[0].spriteKey = 'ENEMY_JOURNAL';
  validSwap.levels[0].waves[0].events[1].spriteKey = 'MINI_BOSS';
  assert.deepEqual(validateGameCampaign(validSwap), { valid: true, errors: [] });

  const invalid = makeCampaign();
  const events = invalid.levels[0].waves[0].events;
  events[0].enemies[0].spriteKey = 'FINAL_BOSS';
  events[1].spriteKey = 'GAME_BG_BACK';
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
  assert.ok(spriteErrors.some((error) => error.includes('/events/1/spriteKey')));
  assert.ok(spriteErrors.some((error) => error.includes('/events/2/spriteKey')));
});

test('generated assets are accepted only for their registered game roles and raw paths stay forbidden', () => {
  const validHud = makeCampaign();
  assert.deepEqual(validateGameCampaign(validHud), { valid: true, errors: [] });

  const wrongRole = makeCampaign();
  wrongRole.levels[0].waves[0].events[0].enemies[0].spriteKey = 'GENERATED_HUD_BIOHAZARD_BOMB_E5D01D651F2F';
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

test('invalid apply leaves the tracked file, manifest, and version history unchanged', async (t) => {
  const { repository, repositoryRoot, dataRoot } = await makeRepository(t);
  const before = await repository.readCampaign();
  const invalid = structuredClone(before.campaign);
  invalid.levels[0].waves[0].events[0].enemies[0].health = -1;

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
  edited.levels[0].waves[0].events[0].count = 12;

  const applied = await repository.applyCampaign(edited, {
    expectedContentHash: before.contentHash,
    changeNote: 'Increase opening formation'
  });
  assert.equal(applied.campaign.revision, 2);
  assert.equal(applied.campaign.levels[0].waves[0].events[0].count, 12);
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
  edited.levels[0].waves[0].events[0].count = 15;
  const applied = await repository.applyCampaign(edited, { expectedContentHash: before.contentHash });
  const baseline = (await repository.listVersions()).find((version) => version.source === 'baseline');

  const rolledBack = await repository.rollback(baseline.id, {
    expectedContentHash: applied.contentHash,
    changeNote: 'Restore tracked baseline'
  });
  assert.equal(rolledBack.campaign.revision, 3);
  assert.equal(rolledBack.campaign.levels[0].waves[0].events[0].count, 8);
  assert.equal(rolledBack.version.source, 'rollback');
  assert.equal(rolledBack.version.rollbackOf, baseline.id);
  assert.deepEqual((await repository.listVersions()).map((version) => version.revision), [3, 2, 1]);
});

test('legacy schema-v1 payloads retain current scorecard and HUD presentation when applied', async (t) => {
  const { repository } = await makeRepository(t);
  const before = await repository.readCampaign();
  const legacyPayload = structuredClone(before.campaign);
  delete legacyPayload.recordCard;
  delete legacyPayload.hudAssets;
  legacyPayload.levels[0].waves[0].events[0].count = 11;

  const applied = await repository.applyCampaign(legacyPayload, {
    expectedContentHash: before.contentHash,
    changeNote: 'Open an earlier schema-v1 revision'
  });

  assert.deepEqual(applied.campaign.recordCard, before.campaign.recordCard);
  assert.deepEqual(applied.campaign.hudAssets, before.campaign.hudAssets);
  assert.equal(applied.campaign.levels[0].waves[0].events[0].count, 11);
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

  const denied = await requestJson({
    port,
    path: '/__director/api/game-campaign/apply',
    method: 'POST',
    body: { campaign: fetched.body.campaign, expectedContentHash: fetched.body.contentHash }
  });
  assert.equal(denied.status, 403);

  const invalid = structuredClone(fetched.body.campaign);
  invalid.levels[0].waves[0].events[0].spawnIntervalSeconds = 0;
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
    levelId: 'open-orbit',
    levelName: 'Open Orbit',
    waveId: 'wave-1',
    waveName: 'Opening Review',
    eventId: 'review-gatekeeper',
    eventLabel: 'Review Gatekeeper',
    eventKind: 'boss',
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
      target: 'Open Orbit / Opening Review / Review Gatekeeper',
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

  const draftCampaign = structuredClone(disk.campaign);
  draftCampaign.levels[0].waves[0].name = 'Draft Review Wave';
  const draftContentHash = contentHash(draftCampaign);
  const draftVersion = `game-campaign-draft-r${disk.revision}-${draftContentHash.slice(7, 19)}`;
  const draftContext = {
    ...context,
    draft: true,
    draftContentHash,
    waveName: 'Draft Review Wave'
  };
  const draftResponse = await requestJson({
    port,
    path: '/__director/reviews',
    method: 'POST',
    headers: { 'X-Scicon-Director': 'local' },
    body: {
      surface: 'wave',
      configVersion: draftVersion,
      target: 'Open Orbit / Draft Review Wave / Review Gatekeeper',
      note: 'This note belongs to the exact unsaved draft.',
      status: 'open',
      anchor: { x: 0.42, y: 0.58 },
      context: draftContext,
      draftCampaign
    }
  });
  assert.equal(draftResponse.status, 201);
  assert.equal(draftResponse.body.review.configVersion, draftVersion);
  assert.equal(draftResponse.body.review.context.draftContentHash, draftContentHash);
});
