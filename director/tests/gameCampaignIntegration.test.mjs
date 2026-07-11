import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
