import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  parsePlayerReportCacheArguments,
  refreshPlayerReportCache
} from '../../tools/cache-player-reports.mjs';
import { readPlayerReports } from '../../tools/player-report-reader.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';
import {
  createPlayerReportCacheEnvelope,
  DEFAULT_PLAYER_REPORT_DASHBOARD_URL,
  PlayerReportCacheRepository
} from '../server/playerReportCacheRepository.mjs';
import { ProjectStatusRepository } from '../server/projectStatusRepository.mjs';

const NOW = '2026-08-04T20:00:00.000Z';
const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';

const rawReportRow = (overrides = {}) => ({
  event_name: 'player_bug_report',
  session_id: SESSION_ID,
  game_version: '2.2.0-base-readiness',
  occurred_at: NOW,
  properties: {
    schema_version: 1,
    report_id: REPORT_ID,
    limiter_key: 'must-never-leave-the-trusted-reader',
    kind: 'bug',
    category: 'gameplay',
    source: 'manual',
    summary: 'The wave changed unexpectedly.',
    details: 'The flight restarted while enemies were alive.',
    created_at: NOW,
    diagnostics: {
      environment: {
        pathname: '/game',
        online: true,
        cookie: 'private-cookie',
        connection: { effectiveType: '3g', rtt: 400, secret: 'private-secret' }
      },
      runtime: { waveNumber: 12, score: 900, walletAddress: `0x${'a'.repeat(40)}` },
      performance: { longTaskCount: 3, privateKey: 'private-key' },
      breadcrumbs: [{
        at: NOW,
        name: 'wave_started',
        details: { wave_number: 12, token: 'token=private-token' }
      }]
    },
    provider_private_field: 'must-not-survive'
  },
  ...overrides
});

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

const makeTemporaryDirectory = async (t, prefix) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
};

test('trusted reader uses apikey-only auth for new secret keys and returns an allowlisted report shape', async () => {
  const requests = [];
  const reports = await readPlayerReports({
    supabaseUrl: 'https://example.supabase.co',
    secretKey: 'sb_secret_test-only-key',
    table: 'scicon_product_events',
    limit: 250,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return jsonResponse([
        rawReportRow(),
        rawReportRow({ event_name: 'weekly_score' })
      ]);
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal(requests[0].options.headers.apikey, 'sb_secret_test-only-key');
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[0].url.searchParams.get('limit'), '100');
  assert.equal(
    requests[0].url.searchParams.get('event_name'),
    'in.(player_bug_report,player_feedback)'
  );
  assert.deepEqual(reports.map((report) => report.reportId), [REPORT_ID]);
  assert.equal(reports[0].diagnostics.environment.pathname, '/game');
  assert.equal(reports[0].diagnostics.environment.cookie, undefined);
  assert.equal(reports[0].diagnostics.environment.connection.secret, undefined);
  assert.equal(reports[0].diagnostics.runtime.walletAddress, undefined);
  assert.equal(reports[0].diagnostics.performance.privateKey, undefined);
  assert.doesNotMatch(JSON.stringify(reports), /limiter|provider_private|private-cookie|private-secret|private-key/);
  assert.match(JSON.stringify(reports), /token=\[redacted\]/);
});

test('trusted reader retains legacy service-role Bearer auth and keeps failures generic', async () => {
  let request;
  const reports = await readPlayerReports({
    supabaseUrl: 'https://example.supabase.co',
    secretKey: 'legacy-service-role-jwt',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse([]);
    }
  });
  assert.deepEqual(reports, []);
  assert.equal(request.options.headers.Authorization, 'Bearer legacy-service-role-jwt');

  await assert.rejects(
    () => readPlayerReports({
      supabaseUrl: 'https://example.supabase.co',
      secretKey: 'sb_secret_must-not-appear',
      fetchImpl: async () => jsonResponse({ private: 'provider detail' }, 503)
    }),
    (error) => {
      assert.match(error.message, /HTTP 503/);
      assert.doesNotMatch(error.message, /must-not-appear|provider detail/);
      return true;
    }
  );
});

test('trusted reader rejects unsafe configuration before making a request', async () => {
  let calls = 0;
  await assert.rejects(
    () => readPlayerReports({
      supabaseUrl: 'https://example.supabase.co',
      secretKey: 'sb_publishable_not-a-server-key',
      fetchImpl: async () => { calls += 1; return jsonResponse([]); }
    }),
    /server-side Supabase key/
  );
  await assert.rejects(
    () => readPlayerReports({
      supabaseUrl: 'https://example.supabase.co',
      secretKey: 'legacy-key',
      table: '../private',
      fetchImpl: async () => { calls += 1; return jsonResponse([]); }
    }),
    /table name/
  );
  assert.equal(calls, 0);
});

test('cache refresh supports an explicit output path and writes friendly atomic states', async (t) => {
  const directory = await makeTemporaryDirectory(t, 'scicon-report-cache-');
  const outputPath = path.join(directory, 'owner cache.json');
  assert.deepEqual(
    parsePlayerReportCacheArguments([`--output=${outputPath}`, '--limit=42']),
    { outputPath: path.resolve(outputPath), limit: 42 }
  );

  let fetchCalls = 0;
  const unconfigured = await refreshPlayerReportCache({
    environment: {},
    outputPath,
    fetchImpl: async () => { fetchCalls += 1; return jsonResponse([]); },
    clock: () => new Date(NOW)
  });
  assert.equal(unconfigured.envelope.state, 'unconfigured');
  assert.equal(fetchCalls, 0);
  assert.equal(JSON.parse(await readFile(outputPath, 'utf8')).state, 'unconfigured');

  const ready = await refreshPlayerReportCache({
    environment: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test-only-key'
    },
    outputPath,
    fetchImpl: async () => jsonResponse([rawReportRow()]),
    clock: () => new Date(NOW)
  });
  assert.equal(ready.envelope.state, 'ready');
  assert.equal(ready.envelope.reports.length, 1);
  assert.deepEqual(
    (await readdir(directory)).filter((entry) => entry.endsWith('.tmp')),
    []
  );

  const failed = await refreshPlayerReportCache({
    environment: {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_test-only-key'
    },
    outputPath,
    fetchImpl: async () => jsonResponse({ secret: 'provider detail' }, 500),
    clock: () => new Date(NOW)
  });
  assert.equal(failed.envelope.state, 'error');
  assert.equal(failed.envelope.reports.length, 1);
  assert.equal(failed.envelope.reports[0].reportId, REPORT_ID);
  assert.match(failed.envelope.message, /last safe/i);
  assert.doesNotMatch(JSON.stringify(failed.envelope), /provider detail|test-only-key/);
});

test('Director cache repository returns safe missing, valid, and damaged snapshots', async (t) => {
  const directory = await makeTemporaryDirectory(t, 'scicon-report-repository-');
  const cachePath = path.join(directory, 'player-reports.json');
  const repository = new PlayerReportCacheRepository({ cachePath });

  const missing = await repository.readSnapshot();
  assert.equal(missing.state, 'unconfigured');
  assert.equal(missing.generatedAt, null);
  assert.deepEqual(missing.reports, []);

  const envelope = createPlayerReportCacheEnvelope({
    state: 'ready',
    generatedAt: NOW,
    dashboardUrl: 'https://malicious.example/reports',
    reports: [{
      eventName: 'player_bug_report',
      reportId: REPORT_ID,
      kind: 'bug',
      category: 'gameplay',
      source: 'manual',
      summary: 'Broken wave',
      details: '',
      sessionId: SESSION_ID,
      gameVersion: '2.2.0',
      createdAt: NOW,
      occurredAt: NOW
    }]
  });
  await writeFile(cachePath, JSON.stringify(envelope), 'utf8');
  const loaded = await repository.readSnapshot();
  assert.equal(loaded.state, 'ready');
  assert.equal(loaded.dashboardUrl, DEFAULT_PLAYER_REPORT_DASHBOARD_URL);
  assert.equal(loaded.reports.length, 1);

  await writeFile(cachePath, '{damaged', 'utf8');
  const damaged = await repository.readSnapshot();
  assert.equal(damaged.state, 'error');
  assert.doesNotMatch(JSON.stringify(damaged), /\{damaged/);

  const linkPath = path.join(directory, 'linked-player-reports.json');
  try {
    await symlink(cachePath, linkPath, 'file');
    const linked = await new PlayerReportCacheRepository({ cachePath: linkPath }).readSnapshot();
    assert.equal(linked.state, 'error');
    assert.match(linked.message, /safety checks/);
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error?.code)) throw error;
    t.diagnostic('File symlink creation is unavailable on this Windows account.');
  }
});

test('project status runs only fixed bounded git reads and returns counts without filenames', async () => {
  const calls = [];
  const outputs = new Map([
    ['rev-parse\0--abbrev-ref\0HEAD', 'codex/scicon-experimental\n'],
    ['rev-parse\0--short=12\0HEAD', 'abcdef123456\n'],
    ['log\0-1\0--pretty=%s', 'Build owner control center\n'],
    ['status\0--porcelain=v1\0--untracked-files=all', ' M tracked-file\n?? one\n?? two\n'],
    ['rev-list\0--left-right\0--count\0origin/main...HEAD', '3\t5\n']
  ]);
  const repository = new ProjectStatusRepository({
    repositoryRoot: 'C:\\safe-repository',
    clock: () => new Date(NOW),
    execFileImpl: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: outputs.get(args.join('\0')) || '' };
    }
  });
  const status = await repository.readStatus();
  assert.deepEqual(status, {
    generatedAt: NOW,
    repository: {
      branch: 'codex/scicon-experimental',
      head: 'abcdef123456',
      subject: 'Build owner control center',
      dirtyCount: 3,
      untrackedCount: 2,
      aheadMain: 5,
      behindMain: 3
    }
  });
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.file, 'git');
    assert.equal(call.options.windowsHide, true);
    assert.equal(call.options.timeout, 3000);
    assert.equal(call.options.maxBuffer, 256 * 1024);
  }
  assert.doesNotMatch(JSON.stringify(status), /tracked-file|\?\? one/);
});

const requestJson = ({ port, pathname, method = 'GET', body, host = `127.0.0.1:${port}` }) => (
  new Promise((resolve, reject) => {
    const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        Host: host,
        Accept: 'application/json',
        ...(encoded ? {
          Origin: `http://127.0.0.1:${port}`,
          'Content-Type': 'application/json',
          'Content-Length': encoded.length,
          'X-Scicon-Director': 'local'
        } : {})
      }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.on('error', reject);
    if (encoded) request.write(encoded);
    request.end();
  })
);

test('Director exposes report cache and project status through loopback GET-only endpoints', async (t) => {
  const reportSnapshot = createPlayerReportCacheEnvelope({
    state: 'ready',
    generatedAt: NOW,
    reports: []
  });
  const projectSnapshot = {
    generatedAt: NOW,
    repository: {
      branch: 'codex/scicon-experimental',
      head: 'abcdef123456',
      subject: 'Build owner control center',
      dirtyCount: 1,
      untrackedCount: 1,
      aheadMain: 2,
      behindMain: 0
    }
  };
  const handler = createDirectorRequestHandler({
    repository: { bootstrap: async () => ({}) },
    realRunReader: { listRuns: async () => [] },
    playerReportCacheRepository: { readSnapshot: async () => reportSnapshot },
    projectStatusRepository: { readStatus: async () => projectSnapshot }
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const reports = await requestJson({
    port,
    pathname: '/__director/api/v1/player-reports'
  });
  assert.equal(reports.status, 200);
  assert.equal(reports.body.source, 'trusted-local-cache');
  assert.equal(reports.body.state, 'ready');
  assert.equal(reports.headers['cache-control'], 'no-store');

  const project = await requestJson({
    port,
    pathname: '/__director/api/v1/project-status?ignored=true'
  });
  assert.equal(project.status, 200);
  assert.deepEqual(project.body.repository, projectSnapshot.repository);

  for (const pathname of [
    '/__director/api/v1/player-reports',
    '/__director/api/v1/project-status'
  ]) {
    const mutation = await requestJson({ port, pathname, method: 'POST', body: {} });
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.allow, 'GET');
  }

  const foreign = await requestJson({
    port,
    pathname: '/__director/api/v1/player-reports',
    host: 'attacker.example.com'
  });
  assert.equal(foreign.status, 403);
});
