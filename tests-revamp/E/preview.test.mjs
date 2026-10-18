import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = async (entryPoint, env = {}) => {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, write: false, format: 'esm', platform: 'node',
    define: { 'import.meta.env': JSON.stringify(env) }, logLevel: 'silent'
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const preview = await bundle('services/revamp/preview/previewMode.ts');
const { onRequest } = await bundle('deploy/pages/functions/_middleware.js');

const contextFor = (path, { method = 'GET', headers = {} } = {}) => {
  const pending = [];
  return {
    request: new Request(`https://branch.scicon.pages.dev${path}`, { method, headers }),
    next: async () => new Response('local asset'),
    waitUntil: (promise) => pending.push(promise),
    pending
  };
};

const withNetwork = async (fetchMock, cacheMock, action) => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  globalThis.fetch = fetchMock;
  globalThis.caches = cacheMock ? { default: cacheMock } : undefined;
  try { await action(); } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
};

test('preview detection cannot be disabled on Pages and requires an explicit flag elsewhere', () => {
  for (const hostname of ['scicon.pages.dev', 'branch.scicon.pages.dev', 'SCICON.PAGES.DEV.']) {
    assert.equal(preview.detectPreviewMode(hostname, 'false'), true);
  }
  for (const hostname of ['www.sciconshooter.xyz', 'pages.dev.example.com', 'fakepages.dev', 'localhost']) {
    assert.equal(preview.detectPreviewMode(hostname, 'false'), false);
    assert.equal(preview.detectPreviewMode(hostname, 'true'), true);
    assert.equal(preview.detectPreviewMode(hostname, '1'), true);
  }
  assert.equal(preview.detectPreviewMode('localhost', 'yes'), false);
});

test('Pages rejects every non-GET API method without contacting production', async () => {
  await withNetwork(() => assert.fail('production fetch forbidden'), null, async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
      const response = await onRequest(contextFor('/api/leaderboard', { method }));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'PREVIEW_READ_ONLY' });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  });
});

test('Pages denies unknown, authenticated and mutating GET routes and query dispatch', async () => {
  await withNetwork(() => assert.fail('production fetch forbidden'), null, async () => {
    for (const path of [
      '/api', '/api/finalize-weekly-competition', '/api/events?route=social-agent',
      '/api/weekly-claim', '/api/run-receipts', '/api/wallet-profile',
      '/api/mint-records?route=wallet-profile', '/api/leaderboard?route=weekly-funding-approval',
      '/api/researchhub-proposals?action=refresh', '/api/__proto__'
    ]) {
      assert.equal((await onRequest(contextFor(path))).status, 503, path);
    }
  });
});

test('Pages serves bundled assets and SPA routes locally', async () => {
  await withNetwork(() => assert.fail('assets must remain local'), null, async () => {
    for (const path of ['/game-art/ship.png', '/audio/laser.wav', '/fonts/pilot.woff2', '/', '/?view=signals']) {
      assert.equal(await (await onRequest(contextFor(path))).text(), 'local asset');
    }
  });
});

test('Pages proxies an anonymous public read to fixed origin and caches the response', async () => {
  let calls = 0;
  const entries = new Map();
  const cache = {
    match: async (request) => entries.get(request.url)?.clone(),
    put: async (request, response) => { entries.set(request.url, response); }
  };
  await withNetwork(async (input, init) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.origin, 'https://www.sciconshooter.xyz');
    assert.equal(url.pathname, '/api/leaderboard');
    assert.equal(url.searchParams.get('weekKey'), '2026-10-11');
    assert.equal(url.searchParams.get('previewReadOnly'), '1');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.equal(new Headers(init.headers).get('Authorization'), null);
    assert.equal(new Headers(init.headers).get('Cookie'), null);
    return Response.json({ scores: [] });
  }, cache, async () => {
    const context = contextFor('/api/leaderboard?weekKey=2026-10-11&previewReadOnly=0', {
      headers: { Authorization: 'Bearer fixture', Cookie: 'fixture=private' }
    });
    const first = await onRequest(context);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('Cache-Control'), 'public, max-age=15');
    assert.deepEqual(await first.json(), { scores: [] });
    await Promise.all(context.pending);
    const second = await onRequest(contextFor('/api/leaderboard?previewReadOnly=1&weekKey=2026-10-11'));
    assert.deepEqual(await second.json(), { scores: [] });
    assert.equal(calls, 1);
  });
});

test('Pages never caches private, cookie-bearing, no-store or failed responses', async () => {
  for (const headers of [
    { 'Set-Cookie': 'fixture=private' }, { 'Cache-Control': 'private, max-age=0' },
    { 'Cache-Control': 'no-store' }, { Vary: 'Authorization' }, { Vary: '*' }
  ]) {
    await withNetwork(async () => Response.json({ competitions: [] }, { headers }), {
      match: async () => undefined,
      put: () => assert.fail('private response must not enter cache')
    }, async () => {
      const response = await onRequest(contextFor('/api/weekly-competitions'));
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Set-Cookie'), null);
    });
  }
  await withNetwork(async () => Response.json({ error: 'unavailable' }, { status: 503 }), {
    match: async () => undefined, put: () => assert.fail('errors must not enter cache')
  }, async () => {
    assert.equal((await onRequest(contextFor('/api/researchhub-proposals'))).status, 503);
  });
});

test('Pages rejects redirects and contains upstream/network failures', async () => {
  for (const fetchMock of [
    async () => Response.redirect('https://www.sciconshooter.xyz/api/finalize-weekly-competition'),
    async () => { throw new Error('fixture network timeout'); }
  ]) {
    await withNetwork(fetchMock, null, async () => {
      const response = await onRequest(contextFor('/api/researchhub-proposals'));
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'PREVIEW_UPSTREAM_UNAVAILABLE' });
    });
  }
});

test('preview score, receipt and claim services never fetch or request a signature', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: new URL('https://branch.scicon.pages.dev') };
  try {
    const receipts = await bundle('services/runReceiptService.ts');
    const leaderboard = await bundle('services/leaderboardService.ts');
    const claims = await bundle('services/weeklyClaimService.ts');
    const runClaims = await bundle('services/runClaimService.ts');
    await withNetwork(() => assert.fail('preview submissions must skip fetch'), null, async () => {
      const session = await receipts.startRunSession({ runMode: 'weekly-streak' });
      assert.equal(session.localOnly, true);
      assert.equal(session.testRun, true);
      assert.equal(session.startToken, '');
      assert.equal(session.weeklyAttempt, undefined);
      const receipt = await receipts.finishRunSession(
        { ...session, localOnly: false, startToken: 'fixture-old-signed-session' },
        { score: 2400, wave: 3, durationMs: 90000, enemiesDefeated: 35, coinsCollected: 4, playerShipId: 'researchhub' }
      );
      assert.equal(receipt.persisted, false);
      assert.equal(receipt.integrity, 'local-unverified');
      assert.deepEqual(receipt.anomalies, ['preview_read_only']);
      const saved = await leaderboard.saveScore('PILOT', 2400, 3, { receipt });
      assert.equal(saved.remoteSaved, false);
      assert.match(saved.remoteError, /Test build/);
      const signMessage = () => assert.fail('preview must not prompt wallet signatures');
      const proposal = { id: 'fixture' };
      const address = `0x${'1'.repeat(40)}`;
      const readOnlyError = (error) => error.code === 'PREVIEW_READ_ONLY';
      await assert.rejects(claims.claimWeeklyChampionProposal({ weekKey: '2026-10-11', proposal, address, signMessage }), readOnlyError);
      await assert.rejects(runClaims.associateRunWithWallet({ receipt, address, signMessage }), readOnlyError);
      await assert.rejects(leaderboard.saveWeeklyLeaderProposal(receipt, proposal, { address, signMessage }), readOnlyError);
    });
  } finally { globalThis.window = previousWindow; }
});

test('pre-mount browser guard protects all API writes and normalizes public reads', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: new URL('https://branch.scicon.pages.dev') };
  let calls = 0;
  try {
    await withNetwork(async (input, init) => {
      calls++;
      const url = new URL(input);
      assert.equal(url.origin, 'https://branch.scicon.pages.dev');
      assert.equal(url.searchParams.get('previewReadOnly'), '1');
      assert.equal(init.credentials, 'omit');
      assert.equal(new Headers(init.headers).get('Authorization'), null);
      return Response.json({ scores: [] });
    }, null, async () => {
      preview.installPreviewRequestGuard();
      preview.installPreviewRequestGuard();
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
        const response = await fetch('https://www.sciconshooter.xyz/api/leaderboard', { method });
        assert.equal(response.status, 503);
      }
      assert.equal((await fetch('/api/finalize-weekly-competition')).status, 503);
      assert.equal((await fetch('/api/mint-records?route=wallet-profile')).status, 503);
      assert.equal(calls, 0);
      const response = await fetch(new Request('https://www.sciconshooter.xyz/api/leaderboard', {
        headers: { Authorization: 'Bearer fixture' }
      }));
      assert.deepEqual(await response.json(), { scores: [] });
      assert.equal(calls, 1);
    });
  } finally { globalThis.window = previousWindow; }
});
