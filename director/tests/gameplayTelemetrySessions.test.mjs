import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import { GameplayTelemetryRepository } from '../server/gameplayTelemetryRepository.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const trackedRepositoryRoot = path.resolve(testDirectory, '..', '..');

const createSnapshot = () => ({
  events: [
    {
      type: 'session-start',
      frame: 0,
      elapsedSeconds: 0,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      seed: 'boss-balance-a',
      viewportWidth: 412,
      viewportHeight: 915
    },
    {
      type: 'wave-start',
      frame: 0,
      elapsedSeconds: 0,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      levelNumber: 1,
      waveNumber: 1
    },
    {
      type: 'boss-phase',
      frame: 120,
      elapsedSeconds: 2,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      bossId: 'entity-boss-1',
      phaseId: 'phase-one',
      phaseIndex: 0,
      healthRatio: 1
    },
    {
      type: 'entity-damage',
      frame: 240,
      elapsedSeconds: 4,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      targetId: 'entity-boss-1',
      targetKind: 'boss',
      sourceKind: 'player',
      amount: 200,
      remainingHealth: 800,
      fatal: false
    },
    {
      type: 'entity-damage',
      frame: 300,
      elapsedSeconds: 5,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      targetId: 'entity-enemy-1',
      targetKind: 'enemy',
      sourceKind: 'player',
      amount: 100,
      remainingHealth: 0,
      fatal: true
    },
    {
      type: 'entity-damage',
      frame: 420,
      elapsedSeconds: 7,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      targetId: 'player',
      targetKind: 'player',
      sourceKind: 'enemy',
      amount: 25,
      remainingHealth: 0,
      fatal: true
    },
    {
      type: 'player-death',
      frame: 480,
      elapsedSeconds: 8,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      livesRemaining: 2
    },
    {
      type: 'completion',
      frame: 600,
      elapsedSeconds: 10,
      levelId: 'operation-open-galaxy',
      waveId: 'open-orbit',
      scope: 'wave',
      score: 1500
    }
  ],
  aggregate: {
    recordedEventCount: 8,
    retainedEventCount: 8,
    droppedEventCount: 0,
    latestFrame: 600,
    damageDealt: 300,
    damageTaken: 25,
    entitiesDestroyed: 1,
    playerDeaths: 1,
    wavesStarted: 1,
    wavesCompleted: 1,
    bossPhaseTransitions: 1,
    completions: 1
  }
});

const createDraft = () => ({
  name: 'Gatekeeper fixed-seed pass',
  campaignHash: `sha256:${'a'.repeat(64)}`,
  seed: 'boss-balance-a',
  target: {
    levelId: 'operation-open-galaxy',
    waveId: 'open-orbit',
    eventId: 'open-orbit-gatekeeper'
  },
  viewport: { width: 412, height: 915 },
  loadoutLabel: 'RSC ship · fire 2 · speed 1 · 0 mini',
  snapshot: createSnapshot()
});

const makeRepository = async (t) => {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-playtest-sessions-'));
  const dataRoot = path.join(repositoryRoot, 'director-data');
  await mkdir(dataRoot, { recursive: true });
  t.after(() => rm(repositoryRoot, { recursive: true, force: true }));
  return {
    repositoryRoot,
    dataRoot,
    repository: new GameplayTelemetryRepository({
      repositoryRoot,
      dataRoot,
      clock: () => new Date('2026-07-23T21:00:00.000Z')
    })
  };
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
          Origin: `http://127.0.0.1:${port}`,
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

test('local playtest repository derives stable metrics and keeps event payloads out of list results', async (t) => {
  const { repository, dataRoot } = await makeRepository(t);
  const created = await repository.createSession(createDraft());

  assert.match(created.id, /^playtest-[a-z0-9]+-[a-f0-9]{8}$/);
  assert.equal(created.metrics.elapsedSeconds, 10);
  assert.equal(created.metrics.survivalSeconds, 8);
  assert.equal(created.metrics.dps, 30);
  assert.equal(created.metrics.bossDamage, 200);
  assert.equal(created.metrics.damageTaken, 25);
  assert.equal(created.metrics.completed, true);
  assert.equal(created.metrics.completionScope, 'wave');

  const summaries = await repository.listSessions();
  assert.equal(summaries.length, 1);
  assert.equal(Object.hasOwn(summaries[0], 'snapshot'), false);
  assert.deepEqual((await repository.readSession(created.id)).snapshot, created.snapshot);
  assert.match(
    await readFile(path.join(dataRoot, 'playtest-sessions', `${created.id}.json`), 'utf8'),
    /"schemaVersion": 1/
  );

  await repository.deleteSession(created.id);
  assert.deepEqual(await repository.listSessions(), []);
  await assert.rejects(() => repository.readSession(created.id), /not found/);
});

test('local playtest repository rejects drifted aggregates, unknown fields, and unbounded event tails', async (t) => {
  const { repository } = await makeRepository(t);
  const mismatched = createDraft();
  mismatched.snapshot.aggregate.recordedEventCount = 9;
  await assert.rejects(
    () => repository.createSession(mismatched),
    (error) => error.errors?.some((message) => /inconsistent/.test(message))
  );

  const unknown = createDraft();
  unknown.remoteAnalyticsId = 'must-not-exist';
  await assert.rejects(
    () => repository.createSession(unknown),
    (error) => error.errors?.some((message) => /unsupported fields/.test(message))
  );

  const oversized = createDraft();
  oversized.snapshot.events = Array.from(
    { length: 1025 },
    () => structuredClone(oversized.snapshot.events[0])
  );
  await assert.rejects(
    () => repository.createSession(oversized),
    (error) => error.errors?.some((message) => /at most 1024/.test(message))
  );
});

test('playtest session HTTP routes retain loopback mutation guards and expose list/read/delete', async (t) => {
  const { repository } = await makeRepository(t);
  const handler = createDirectorRequestHandler({
    repository: { bootstrap: async () => ({ ok: true }) },
    realRunReader: { listRuns: async () => [] },
    gameplayTelemetryRepository: repository
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const denied = await requestJson({
    port,
    path: '/__director/api/v1/playtest-sessions',
    method: 'POST',
    body: { session: createDraft() }
  });
  assert.equal(denied.status, 403);

  const saved = await requestJson({
    port,
    path: '/__director/api/v1/playtest-sessions',
    method: 'POST',
    headers: { 'X-Scicon-Director': 'local' },
    body: { session: createDraft() }
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.localOnly, true);

  const listed = await requestJson({
    port,
    path: '/__director/api/v1/playtest-sessions'
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.sessions.length, 1);
  assert.equal(Object.hasOwn(listed.body.sessions[0], 'snapshot'), false);

  const fetched = await requestJson({
    port,
    path: `/__director/api/v1/playtest-sessions/${saved.body.session.id}`
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.session.snapshot.events.length, 8);

  const deleted = await requestJson({
    port,
    path: `/__director/api/v1/playtest-sessions/${saved.body.session.id}`,
    method: 'DELETE',
    headers: { 'X-Scicon-Director': 'local' },
    body: {}
  });
  assert.equal(deleted.status, 200);

  const rootIgnore = await readFile(path.join(trackedRepositoryRoot, '.gitignore'), 'utf8');
  assert.match(rootIgnore, /^director-data\/playtest-sessions\/$/m);
});

test('Combat Lab route context opens the relevant shared authoring category', async () => {
  const source = await readFile(
    path.join(trackedRepositoryRoot, 'director', 'src', 'combat-lab', 'CombatLabApp.tsx'),
    'utf8'
  );
  assert.match(source, /normalized === '\/formations'\) return 'formations'/);
  assert.match(source, /normalized === '\/loadouts'\) return 'main-ships'/);
  assert.match(source, /normalized === '\/assets'\) return 'effects-assets'/);
  assert.match(source, /initialHubCategory !== 'formations'/);
  assert.match(source, /selectItem\(formation\)/);
  assert.match(source, /type: 'spawn-event-now'/);
  assert.match(source, /type: 'jump-to-boss-phase'/);
  assert.match(source, /type: 'fast-forward'/);
  assert.match(source, />Spawn now</);
  assert.match(source, />Jump phase</);
});

test('CSV export neutralizes spreadsheet formulas while preserving numeric metrics', async () => {
  const source = await readFile(
    path.join(trackedRepositoryRoot, 'director', 'src', 'api', 'playtestSessions.ts'),
    'utf8'
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText;
  const moduleBox = { exports: {} };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    {
      module: moduleBox,
      exports: moduleBox.exports,
      require: () => { throw new Error('Unexpected runtime import in telemetry API contract'); }
    }
  );
  const session = {
    schemaVersion: 1,
    id: 'playtest-safe-export-12345678',
    createdAt: '2026-07-23T21:00:00.000Z',
    name: '=SUM(A1:A2)',
    campaignHash: `sha256:${'a'.repeat(64)}`,
    seed: '+dangerous-seed',
    target: { levelId: 'operation-open-galaxy', waveId: 'open-orbit' },
    viewport: { width: 412, height: 915 },
    loadoutLabel: '@malicious-command',
    metrics: {
      elapsedSeconds: 10,
      survivalSeconds: 8,
      dps: 30,
      damageDealt: 300,
      bossDamage: 200,
      damageTaken: 25,
      playerDeaths: 1,
      bossPhaseTransitions: 1,
      wavesCompleted: 1,
      completions: 1,
      completed: true,
      completionScope: 'wave',
      score: 1500
    },
    snapshot: createSnapshot()
  };

  const csv = moduleBox.exports.serializePlaytestSessionCsv(session);
  assert.match(csv, /,'=SUM\(A1:A2\),/);
  assert.match(csv, /,'\+dangerous-seed,/);
  assert.match(csv, /,'@malicious-command,/);
  assert.match(csv, /,30,300,200,25,/);
});
