import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['services/revamp/leaderboard/readLeaderboard.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent'
});
const { readLeaderboardJson } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const withFetch = async (mock, callback) => {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try { await callback(); } finally { globalThis.fetch = original; }
};

test('leaderboard deadline bounds an unavailable network and aborts its request', async () => {
  let signal;
  await withFetch((_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  }, async () => {
    await assert.rejects(readLeaderboardJson('/api/leaderboard', 10), /timed out/);
    assert.equal(signal.aborted, true);
  });
});

test('leaderboard deadline includes a stalled JSON response body', async () => {
  let signal;
  await withFetch(async (_url, init) => {
    signal = init.signal;
    return { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: () => new Promise(() => {}) };
  }, async () => {
    await assert.rejects(readLeaderboardJson('/api/leaderboard', 10), /timed out/);
    assert.equal(signal.aborted, true);
  });
});

test('leaderboard accepts JSON objects and rejects bad status, content type and payload', async () => {
  await withFetch(async (_url, init) => {
    assert.equal(init.method, 'GET');
    return Response.json({ scores: [], weekKey: '2026-10-11' });
  }, async () => {
    assert.deepEqual(await readLeaderboardJson('/api/leaderboard'), { scores: [], weekKey: '2026-10-11' });
  });
  for (const [response, pattern] of [
    [Response.json({ error: 'unavailable' }, { status: 503 }), /503/],
    [new Response('<html>static fallback</html>'), /did not return JSON/],
    [Response.json([]), /invalid payload/],
    [Response.json(null), /invalid payload/]
  ]) {
    await withFetch(async () => response, async () => {
      await assert.rejects(readLeaderboardJson('/api/leaderboard'), pattern);
    });
  }
});
