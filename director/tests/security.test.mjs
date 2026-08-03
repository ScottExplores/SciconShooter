import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createDirectorRequestHandler } from '../server/localApi.mjs';
import { RealRunReader, PRODUCTION_READ_ORIGIN } from '../server/realRunReader.mjs';
import {
  assertLoopbackRequest,
  assertMutationRequest,
  readJsonBody,
  resolveWithin
} from '../server/security.mjs';

test('Host and Origin checks accept only an exact loopback origin', () => {
  assert.doesNotThrow(() => assertLoopbackRequest({ headers: { host: '127.0.0.1:5174' } }));
  assert.doesNotThrow(() => assertLoopbackRequest({
    headers: { host: 'localhost:5174', origin: 'http://localhost:5174' }
  }));
  assert.doesNotThrow(() => assertLoopbackRequest({
    headers: { host: '[::1]:5174', origin: 'http://[::1]:5174' }
  }));
  assert.throws(
    () => assertLoopbackRequest({ headers: { host: 'director.example.com:5174' } }),
    /loopback Host/
  );
  assert.throws(
    () => assertLoopbackRequest({
      headers: { host: '127.0.0.1:5174', origin: 'http://localhost:5174' }
    }),
    /same-origin/
  );
});

test('mutations require the custom local header and JSON content type', () => {
  const base = { host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174' };
  assert.throws(() => assertMutationRequest({ headers: base }), /x-scicon-director/);
  assert.throws(() => assertMutationRequest({
    headers: { ...base, 'x-scicon-director': 'local', 'content-type': 'text/plain' }
  }), /application\/json/);
  assert.doesNotThrow(() => assertMutationRequest({
    headers: { ...base, 'x-scicon-director': 'local', 'content-type': 'application/json; charset=utf-8' }
  }));
});

test('JSON body parsing enforces the byte limit before and during streaming', async () => {
  const declaredTooLarge = Readable.from(['{}']);
  declaredTooLarge.headers = { 'content-length': '20' };
  await assert.rejects(() => readJsonBody(declaredTooLarge, { limit: 10 }), /exceeds/);

  const streamedTooLarge = Readable.from(['123456', '789012']);
  streamedTooLarge.headers = {};
  await assert.rejects(() => readJsonBody(streamedTooLarge, { limit: 10 }), /exceeds/);

  const valid = Readable.from(['{"ok":true}']);
  valid.headers = { 'content-type': 'application/json' };
  assert.deepEqual(await readJsonBody(valid, { limit: 20 }), { ok: true });
});

test('filesystem resolution rejects traversal and absolute path escapes', () => {
  const root = process.platform === 'win32' ? 'C:\\director-data' : '/director-data';
  assert.match(resolveWithin(root, 'versions', 'scorecard'), /scorecard$/);
  assert.throws(() => resolveWithin(root, '..', 'secrets'), /escapes/);
  const outside = process.platform === 'win32' ? 'D:\\secrets' : '/secrets';
  assert.throws(() => resolveWithin(root, outside), /escapes/);
});

test('the HTTP handler denies foreign Host headers before routing or storage', async (t) => {
  const repository = {
    bootstrap: async () => { throw new Error('must not run'); }
  };
  const realRunReader = { listRuns: async () => [] };
  const handler = createDirectorRequestHandler({ repository, realRunReader });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const response = await new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/bootstrap',
      headers: { Host: 'attacker.example.com' }
    }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({
        status: incoming.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.on('error', reject);
    request.end();
  });
  assert.equal(response.status, 403);
  assert.match(response.body.error, /loopback Host/);
});

test('real-run imports use only fixed-origin GETs and return a sensitive-field-free snapshot', async () => {
  const runId = '123e4567-e89b-42d3-a456-426614174000';
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), options });
    if (url.pathname === '/api/leaderboard') {
      return new Response(JSON.stringify({
        scores: [{
          name: 'NOVA',
          score: 12500,
          wave: 3,
          date: '2026-07-10T20:00:00.000Z',
          runId,
          verified: true,
          walletAddress: '0xsecret',
          receiptHash: 'secret-hash',
          receiptToken: 'secret-token'
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      name: 'Scicon Mission Record - NOVA',
      external_url: 'https://example.invalid/wallet-secret',
      attributes: [
        { trait_type: 'Score', value: 12500 },
        { trait_type: 'Wave', value: 3 },
        { trait_type: 'Targets Defeated', value: 84 },
        { trait_type: 'Tokens Collected', value: 26 },
        { trait_type: 'Flight Time', value: '02:18' },
        { trait_type: 'Game Version', value: '2.1.0' },
        { trait_type: 'Integrity', value: 'server-verified' }
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const reader = new RealRunReader({ fetchImpl });
  const runs = await reader.listRuns();
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.ok(request.url.startsWith(PRODUCTION_READ_ORIGIN));
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.redirect, 'error');
  }
  assert.deepEqual(runs, [{
    source: 'production-readonly',
    runId,
    pilotName: 'NOVA',
    score: 12500,
    wave: 3,
    targetsDefeated: 84,
    coinsCollected: 26,
    durationLabel: '02:18',
    finishedAt: '2026-07-10T20:00:00.000Z',
    gameVersion: '2.1.0',
    integrity: 'server-verified'
  }]);
  assert.doesNotMatch(JSON.stringify(runs), /wallet|receipt|secret/i);
});
