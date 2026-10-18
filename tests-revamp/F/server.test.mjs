import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startStaticServer } from '../../tools-revamp/qa/server.mjs';

test('offline server serves real bytes, isolates fixtures and confines files to dist', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'scicon-qa-server-'));
  const root = path.join(directory, 'dist');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(root);
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>QA fixture</title>');
  const binary = Buffer.from([0, 255, 128, 7, 19]);
  await writeFile(path.join(root, 'texture.png'), binary);
  await writeFile(path.join(directory, 'outside.txt'), 'must not be served');
  await symlink(path.join(directory, 'outside.txt'), path.join(root, 'escape.txt'));
  const server = await startStaticServer({ dist: root });
  t.after(async () => { await server.close(); await rm(directory, { recursive: true, force: true }); });

  const index = await fetch(server.origin);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.match(await index.text(), /QA fixture/);
  const texture = await fetch(`${server.origin}/texture.png?cache=1`);
  assert.equal(texture.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await texture.arrayBuffer()), binary);
  const head = await fetch(`${server.origin}/texture.png`, { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), String(binary.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(`${server.origin}/missing.js`)).status, 404);
  assert.equal((await fetch(`${server.origin}/escape.txt`)).status, 403);
  assert.equal((await fetch(`${server.origin}/%2e%2e%2foutside.txt`)).status, 403);
  assert.equal((await fetch(`${server.origin}/index.html`, { method: 'POST' })).status, 405);

  const fixture = await fetch(`${server.origin}/api/leaderboard?access_token=test-value`);
  const payload = await fixture.json();
  assert.equal(fixture.status, 200);
  assert.ok(Array.isArray(payload.scores));
  const routed = await fetch(`${server.origin}/api/events?route=wallet-profile`);
  assert.equal(routed.status, 200);
  assert.match(routed.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await (await fetch(`${server.origin}/api/events?route=unknown`, {
    method: 'POST', body: JSON.stringify({ secret: 'body-must-not-be-logged' }),
  })).json(), { ok: true });
  assert.equal(server.requests.length, 3);
  assert.equal(server.requests[1].route, 'wallet-profile');
  assert.doesNotMatch(JSON.stringify(server.requests), /test-value|access_token|body-must-not-be-logged/);
});
