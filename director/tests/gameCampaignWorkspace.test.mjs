import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentHash } from '../server/configRepository.mjs';
import { GameCampaignRepository } from '../server/gameCampaignRepository.mjs';
import { GameCampaignWorkspaceRepository } from '../server/gameCampaignWorkspaceRepository.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const trackedRepositoryRoot = path.resolve(testDirectory, '..', '..');

const readTrackedCampaign = async () => JSON.parse(await readFile(
  path.join(trackedRepositoryRoot, 'game-config', 'campaign.json'),
  'utf8'
));

const makeRepositories = async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-workspace-'));
  const dataRoot = path.join(repositoryRoot, 'director-data');
  await mkdir(path.join(repositoryRoot, 'game-config'), { recursive: true });
  const campaign = await readTrackedCampaign();
  await writeFile(
    path.join(repositoryRoot, 'game-config', 'campaign.json'),
    `${JSON.stringify(campaign, null, 2)}\n`,
    'utf8'
  );

  let campaignTick = 0;
  let workspaceTick = 0;
  let randomTick = 0;
  const gameCampaignRepository = new GameCampaignRepository({
    repositoryRoot,
    dataRoot,
    clock: () => new Date(Date.UTC(2026, 6, 23, 18, 0, campaignTick++)),
    randomId: () => String(++randomTick).padStart(6, '0')
  });
  const workspaceRepository = new GameCampaignWorkspaceRepository({
    repositoryRoot,
    dataRoot,
    gameCampaignRepository,
    clock: () => new Date(Date.UTC(2026, 6, 23, 19, 0, workspaceTick++))
  });
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  return { repositoryRoot, dataRoot, gameCampaignRepository, workspaceRepository };
};

const preconditions = (workspace, idempotencyKey) => ({
  expectedBaseContentHash: workspace.baseContentHash,
  expectedDraftRevision: workspace.draftRevision,
  idempotencyKey
});

const findBossLocation = (campaign) => {
  for (const level of campaign.levels) {
    for (const wave of level.waves) {
      const event = wave.events.find((candidate) => candidate.kind === 'boss');
      if (event) return { level, wave, event };
    }
  }
  throw new Error('Tracked campaign fixture must contain a boss event');
};

const requestJson = ({ port, path: requestPath, method = 'GET', body, headers = {} }) => (
  new Promise((resolve, reject) => {
    const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      method,
      headers: {
        Host: `127.0.0.1:${port}`,
        Accept: 'application/json',
        ...(encoded ? {
          'Content-Type': 'application/json',
          'Content-Length': encoded.length
        } : {}),
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
  })
);

test('workspace creation reads the canonical campaign and autosaves only beneath ignored Director data', async (t) => {
  const { repositoryRoot, dataRoot, gameCampaignRepository, workspaceRepository } = await makeRepositories(t);
  const diskBefore = await gameCampaignRepository.readCampaign();
  const workspace = await workspaceRepository.readWorkspace();

  assert.equal(workspace.baseContentHash, diskBefore.contentHash);
  assert.equal(workspace.draftContentHash, contentHash(workspace.draftCampaign));
  assert.equal(workspace.draftRevision, 0);
  assert.equal(workspace.hasChanges, false);
  assert.equal(workspace.stale, false);
  assert.deepEqual(workspace.draftCampaign, diskBefore.campaign);
  assert.deepEqual(await gameCampaignRepository.readCampaign(), diskBefore);

  const persisted = JSON.parse(await readFile(
    path.join(dataRoot, 'workspace', 'game-campaign', 'active.json'),
    'utf8'
  ));
  assert.equal(persisted.baseContentHash, diskBefore.contentHash);
  assert.equal(
    await readFile(path.join(dataRoot, 'workspace', '.gitignore'), 'utf8'),
    '*\n!.gitignore\n'
  );
  assert.equal(
    JSON.parse(await readFile(path.join(repositoryRoot, 'game-config', 'campaign.json'), 'utf8')).revision,
    diskBefore.revision
  );
});

test('level, wave, and boss-event resources update independently through stable IDs', async (t) => {
  const { gameCampaignRepository, workspaceRepository } = await makeRepositories(t);
  const diskBefore = await gameCampaignRepository.readCampaign();
  let workspace = await workspaceRepository.readWorkspace();

  const level = structuredClone(workspace.draftCampaign.levels[0]);
  level.description = `${level.description} Workspace mission edit.`;
  let result = await workspaceRepository.updateResource(
    'level',
    { levelId: level.id },
    level,
    preconditions(workspace, 'mission-edit-001')
  );
  assert.equal(result.workspace.draftRevision, 1);
  assert.deepEqual(result.workspace.changedResources, [{ kind: 'level', levelId: level.id }]);

  workspace = await workspaceRepository.readWorkspace();
  const wave = structuredClone(workspace.draftCampaign.levels[0].waves[0]);
  wave.name = 'Workspace Wave Name';
  result = await workspaceRepository.updateResource(
    'wave',
    { levelId: level.id, waveId: wave.id },
    wave,
    preconditions(workspace, 'wave-edit-001')
  );
  assert.equal(result.workspace.draftRevision, 2);

  workspace = await workspaceRepository.readWorkspace();
  const bossLocation = findBossLocation(workspace.draftCampaign);
  const boss = structuredClone(bossLocation.event);
  boss.label = 'Workspace Boss Event';
  result = await workspaceRepository.updateResource(
    'boss-event',
    {
      levelId: bossLocation.level.id,
      waveId: bossLocation.wave.id,
      eventId: boss.id
    },
    boss,
    preconditions(workspace, 'boss-edit-001')
  );
  assert.equal(result.workspace.draftRevision, 3);

  const storedBoss = await workspaceRepository.readResource('boss-event', {
    levelId: bossLocation.level.id,
    waveId: bossLocation.wave.id,
    eventId: boss.id
  });
  assert.equal(storedBoss.resource.label, 'Workspace Boss Event');
  assert.equal((await gameCampaignRepository.readCampaign()).contentHash, diskBefore.contentHash);
});

test('workspace mutations reject stale revisions, stale bases, and reused idempotency keys', async (t) => {
  const { workspaceRepository } = await makeRepositories(t);
  const workspace = await workspaceRepository.readWorkspace();
  const level = structuredClone(workspace.draftCampaign.levels[0]);
  level.name = 'First Workspace Name';
  const options = preconditions(workspace, 'idempotent-level-edit');
  const first = await workspaceRepository.updateResource(
    'level',
    { levelId: level.id },
    level,
    options
  );
  const replay = await workspaceRepository.updateResource(
    'level',
    { levelId: level.id },
    level,
    options
  );
  assert.deepEqual(replay, first);
  assert.equal((await workspaceRepository.readWorkspace()).draftRevision, 1);

  const different = structuredClone(level);
  different.name = 'Different Workspace Name';
  await assert.rejects(
    () => workspaceRepository.updateResource(
      'level',
      { levelId: level.id },
      different,
      options
    ),
    /idempotency key was already used/
  );
  await assert.rejects(
    () => workspaceRepository.updateResource(
      'level',
      { levelId: level.id },
      different,
      preconditions(workspace, 'stale-revision-edit')
    ),
    /workspace draft changed/
  );
  await assert.rejects(
    () => workspaceRepository.updateResource(
      'level',
      { levelId: level.id },
      different,
      {
        expectedBaseContentHash: `sha256:${'0'.repeat(64)}`,
        expectedDraftRevision: 1,
        idempotencyKey: 'stale-base-edit'
      }
    ),
    /workspace base changed/
  );
});

test('separate workspace repository instances serialize writes through the filesystem lock', async (t) => {
  const {
    repositoryRoot,
    dataRoot,
    gameCampaignRepository,
    workspaceRepository
  } = await makeRepositories(t);
  const secondRepository = new GameCampaignWorkspaceRepository({
    repositoryRoot,
    dataRoot,
    gameCampaignRepository
  });
  const workspace = await workspaceRepository.readWorkspace();
  const firstLevel = structuredClone(workspace.draftCampaign.levels[0]);
  const secondLevel = structuredClone(workspace.draftCampaign.levels[1]);
  firstLevel.name = 'Serialized First Mission';
  secondLevel.name = 'Serialized Second Mission';

  const results = await Promise.allSettled([
    workspaceRepository.updateResource(
      'level',
      { levelId: firstLevel.id },
      firstLevel,
      preconditions(workspace, 'parallel-edit-first')
    ),
    secondRepository.updateResource(
      'level',
      { levelId: secondLevel.id },
      secondLevel,
      preconditions(workspace, 'parallel-edit-second')
    )
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.match(
    results.find((result) => result.status === 'rejected').reason.message,
    /workspace draft changed/
  );
  const persisted = await workspaceRepository.readWorkspace();
  assert.equal(persisted.draftRevision, 1);
  assert.equal(persisted.changedResources.length, 1);
});

test('invalid resource edits fail authoritative full-campaign validation without changing the draft', async (t) => {
  const { workspaceRepository } = await makeRepositories(t);
  const workspace = await workspaceRepository.readWorkspace();
  const bossLocation = findBossLocation(workspace.draftCampaign);
  const invalidBoss = structuredClone(bossLocation.event);
  invalidBoss.health = -1;

  await assert.rejects(
    () => workspaceRepository.updateResource(
      'boss-event',
      {
        levelId: bossLocation.level.id,
        waveId: bossLocation.wave.id,
        eventId: invalidBoss.id
      },
      invalidBoss,
      preconditions(workspace, 'invalid-boss-edit')
    ),
    /Invalid Director workspace campaign/
  );
  const after = await workspaceRepository.readWorkspace();
  assert.equal(after.draftRevision, workspace.draftRevision);
  assert.equal(after.draftContentHash, workspace.draftContentHash);
});

test('apply delegates to immutable campaign history, clears edits, and retries idempotently', async (t) => {
  const { gameCampaignRepository, workspaceRepository } = await makeRepositories(t);
  let workspace = await workspaceRepository.readWorkspace();
  const initialCampaignRevision = workspace.draftCampaign.revision;
  const level = structuredClone(workspace.draftCampaign.levels[0]);
  level.name = 'Applied Workspace Mission';
  const updated = await workspaceRepository.updateResource(
    'level',
    { levelId: level.id },
    level,
    preconditions(workspace, 'apply-prep-edit')
  );
  const applyOptions = {
    expectedBaseContentHash: updated.workspace.baseContentHash,
    expectedDraftRevision: updated.workspace.draftRevision,
    idempotencyKey: 'apply-workspace-001',
    changeNote: 'Apply resource workspace test'
  };

  const applied = await workspaceRepository.apply(applyOptions);
  assert.equal(applied.applied.revision, initialCampaignRevision + 1);
  assert.equal(applied.workspace.hasChanges, false);
  assert.equal(applied.workspace.baseContentHash, applied.applied.contentHash);
  assert.equal((await gameCampaignRepository.readCampaign()).campaign.levels[0].name, level.name);
  assert.deepEqual((await gameCampaignRepository.listVersions()).map((entry) => entry.source), [
    'apply',
    'baseline'
  ]);

  assert.deepEqual(await workspaceRepository.apply(applyOptions), applied);
  workspace = await workspaceRepository.readWorkspace();
  assert.equal(workspace.draftRevision, applied.workspace.draftRevision);
  assert.equal(workspace.hasChanges, false);
});

test('apply recovery finalizes a committed campaign and preserves the original idempotent response', async (t) => {
  const {
    repositoryRoot,
    dataRoot,
    gameCampaignRepository,
    workspaceRepository
  } = await makeRepositories(t);
  const workspace = await workspaceRepository.readWorkspace();
  const level = structuredClone(workspace.draftCampaign.levels[0]);
  level.name = 'Crash-Recovered Workspace Mission';
  const updated = await workspaceRepository.updateResource(
    'level',
    { levelId: level.id },
    level,
    preconditions(workspace, 'crash-recovery-prep')
  );
  const applyOptions = {
    ...preconditions(updated.workspace, 'crash-recovery-apply'),
    changeNote: 'Recover a committed workspace apply'
  };

  const applyCampaign = gameCampaignRepository.applyCampaign.bind(gameCampaignRepository);
  gameCampaignRepository.applyCampaign = async (...args) => {
    const result = await applyCampaign(...args);
    throw Object.assign(new Error('simulated process loss after campaign commit'), { result });
  };
  await assert.rejects(
    () => workspaceRepository.apply(applyOptions),
    /simulated process loss/
  );
  gameCampaignRepository.applyCampaign = applyCampaign;

  const pendingPath = path.join(
    dataRoot,
    'workspace',
    'game-campaign',
    'active.pending.json'
  );
  assert.equal(
    JSON.parse(await readFile(pendingPath, 'utf8')).kind,
    'game-campaign-workspace-apply-pending'
  );

  // Model a power loss after campaign.json promotion but before manifest promotion.
  await rm(path.join(dataRoot, 'game-campaign', 'manifest.json'));
  const restarted = new GameCampaignWorkspaceRepository({
    repositoryRoot,
    dataRoot,
    gameCampaignRepository
  });
  const recovered = await restarted.readWorkspace();
  const disk = await gameCampaignRepository.readCampaign();
  assert.equal(recovered.hasChanges, false);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.baseContentHash, disk.contentHash);
  assert.equal(recovered.draftCampaign.levels[0].name, level.name);
  assert.ok(disk.activeVersionId);

  const replay = await restarted.apply(applyOptions);
  assert.equal(replay.applied.contentHash, disk.contentHash);
  assert.equal(replay.applied.activeVersionId, disk.activeVersionId);
  assert.deepEqual((await gameCampaignRepository.listVersions()).map((entry) => entry.source), [
    'apply',
    'baseline'
  ]);
  await assert.rejects(() => readFile(pendingPath, 'utf8'), { code: 'ENOENT' });
});

test('reset discards edits while rebase replays them onto a newer tracked campaign', async (t) => {
  const { gameCampaignRepository, workspaceRepository } = await makeRepositories(t);
  let workspace = await workspaceRepository.readWorkspace();
  const originalLevel = structuredClone(workspace.draftCampaign.levels[0]);
  const editedLevel = structuredClone(originalLevel);
  editedLevel.name = 'Discard This Workspace Name';
  let updated = await workspaceRepository.updateResource(
    'level',
    { levelId: editedLevel.id },
    editedLevel,
    preconditions(workspace, 'reset-prep-edit')
  );
  const reset = await workspaceRepository.reset(
    preconditions(updated.workspace, 'reset-workspace-001')
  );
  assert.equal(reset.workspace.hasChanges, false);
  workspace = await workspaceRepository.readWorkspace();
  assert.equal(workspace.draftCampaign.levels[0].name, originalLevel.name);

  const rebasedLevel = structuredClone(workspace.draftCampaign.levels[0]);
  rebasedLevel.name = 'Keep This Workspace Name';
  updated = await workspaceRepository.updateResource(
    'level',
    { levelId: rebasedLevel.id },
    rebasedLevel,
    preconditions(workspace, 'rebase-prep-edit')
  );

  const external = structuredClone((await gameCampaignRepository.readCampaign()).campaign);
  external.levels[1].description = `${external.levels[1].description} External edit.`;
  const externallyApplied = await gameCampaignRepository.applyCampaign(external, {
    expectedContentHash: updated.workspace.baseContentHash,
    changeNote: 'Simulate a manual or external campaign update'
  });
  assert.equal((await workspaceRepository.readWorkspace()).stale, true);

  const rebased = await workspaceRepository.rebase(
    preconditions(updated.workspace, 'rebase-workspace-001')
  );
  assert.equal(rebased.workspace.baseContentHash, externallyApplied.contentHash);
  assert.equal(rebased.workspace.stale, false);
  workspace = await workspaceRepository.readWorkspace();
  assert.equal(workspace.draftCampaign.levels[0].name, rebasedLevel.name);
  assert.equal(workspace.draftCampaign.levels[1].description, external.levels[1].description);
});

test('rebase rejects an external edit to the same resource instead of overwriting it', async (t) => {
  const { gameCampaignRepository, workspaceRepository } = await makeRepositories(t);
  const workspace = await workspaceRepository.readWorkspace();
  const editedLevel = structuredClone(workspace.draftCampaign.levels[0]);
  editedLevel.name = 'Keep This Local Mission Name';
  const updated = await workspaceRepository.updateResource(
    'level',
    { levelId: editedLevel.id },
    editedLevel,
    preconditions(workspace, 'conflict-prep-edit')
  );

  const external = structuredClone((await gameCampaignRepository.readCampaign()).campaign);
  external.levels[0].description = `${external.levels[0].description} Concurrent external edit.`;
  await gameCampaignRepository.applyCampaign(external, {
    expectedContentHash: updated.workspace.baseContentHash,
    changeNote: 'Simulate an overlapping manual campaign edit'
  });

  await assert.rejects(
    () => workspaceRepository.rebase(
      preconditions(updated.workspace, 'conflicting-rebase')
    ),
    /rebase conflicts with externally changed resources: level:/
  );
  const after = await workspaceRepository.readWorkspace();
  assert.equal(after.stale, true);
  assert.equal(after.draftRevision, updated.workspace.draftRevision);
  assert.equal(after.draftCampaign.levels[0].name, editedLevel.name);
});

test('workspace recovery journal finishes an interrupted atomic state promotion', async (t) => {
  const {
    repositoryRoot,
    dataRoot,
    gameCampaignRepository,
    workspaceRepository
  } = await makeRepositories(t);
  const workspace = await workspaceRepository.readWorkspace();
  const stateFile = path.join(dataRoot, 'workspace', 'game-campaign', 'active.json');
  const pendingFile = path.join(dataRoot, 'workspace', 'game-campaign', 'active.pending.json');
  const pendingState = JSON.parse(await readFile(stateFile, 'utf8'));
  pendingState.draftCampaign.levels[0].name = 'Recovered Workspace Mission';
  pendingState.draftRevision += 1;
  pendingState.draftContentHash = contentHash(pendingState.draftCampaign);
  pendingState.updatedAt = '2026-07-23T20:00:00.000Z';
  await writeFile(pendingFile, `${JSON.stringify({
    schemaVersion: 1,
    kind: 'game-campaign-workspace-pending',
    stateHash: contentHash(pendingState),
    state: pendingState
  }, null, 2)}\n`, 'utf8');

  const restarted = new GameCampaignWorkspaceRepository({
    repositoryRoot,
    dataRoot,
    gameCampaignRepository
  });
  const recovered = await restarted.readWorkspace();
  assert.equal(recovered.draftRevision, workspace.draftRevision + 1);
  assert.equal(recovered.draftCampaign.levels[0].name, 'Recovered Workspace Mission');
  await assert.rejects(() => readFile(pendingFile, 'utf8'), { code: 'ENOENT' });
});

test('versioned workspace HTTP routes preserve loopback mutation security and production exclusion', async (t) => {
  const { workspaceRepository } = await makeRepositories(t);
  const handler = createDirectorRequestHandler({
    repository: { bootstrap: async () => ({ ok: true }) },
    realRunReader: { listRuns: async () => [] },
    gameCampaignWorkspaceRepository: workspaceRepository
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const fetched = await requestJson({ port, path: '/__director/api/v1/workspace' });
  assert.equal(fetched.status, 200);
  const level = structuredClone(fetched.body.workspace.draftCampaign.levels[0]);
  level.name = 'HTTP Workspace Mission';
  const body = {
    resource: level,
    ...preconditions(fetched.body.workspace, 'http-level-edit')
  };
  const denied = await requestJson({
    port,
    path: `/__director/api/v1/workspace/missions/${level.id}`,
    method: 'PUT',
    body
  });
  assert.equal(denied.status, 403);
  const saved = await requestJson({
    port,
    path: `/__director/api/v1/workspace/missions/${level.id}`,
    method: 'PUT',
    headers: { 'X-Scicon-Director': 'local' },
    body
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.resource.name, 'HTTP Workspace Mission');

  const vercelIgnore = (await readFile(path.join(trackedRepositoryRoot, '.vercelignore'), 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim());
  const rootPackage = JSON.parse(await readFile(path.join(trackedRepositoryRoot, 'package.json'), 'utf8'));
  assert.ok(vercelIgnore.includes('director/'));
  assert.ok(vercelIgnore.includes('director-data/'));
  assert.match(rootPackage.scripts.build, /assert-director-excluded/);
});
