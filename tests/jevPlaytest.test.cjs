const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const load = name => import(pathToFileURL(path.resolve(__dirname, '../tools/jev', name)).href);
async function server(t, options = {}) {
  const { createJevMiddleware } = await load('proxy.mjs');
  const middleware = createJevMiddleware(options);
  const server = http.createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return async (route, body, headers = {}) => {
    const response = await fetch(`${origin}/__jev/${route}`, body === undefined ? {} : {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
}
function answer(questions) {
  return { model: 'test-fixture-not-live-jev', answers: Object.fromEntries(Object.entries(questions).map(([name, question]) => {
    const choice = Object.keys(question.criteria)[0];
    return [name, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }];
  })), usage: { input_tokens: 100, output_tokens: 20 } };
}
test('no key means no model calls, and status never exposes a key', async t => {
  let calls = 0;
  const request = await server(t, { apiKey: '', fetchImpl: () => { calls++; throw new Error('must not run'); } });
  assert.equal((await request('status')).body.configured, false);
  assert.equal((await request('start', {})).status, 428);
  assert.equal(calls, 0);
});
test('cross-origin callers cannot load a key or spend API credits', async t => {
  const request = await server(t, { apiKey: 'unit-test-key' });
  assert.equal((await request('start', {}, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request('key', { key: 'unit-test-key' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await request('start', {}, { Origin: '' })).status, 403);
  assert.equal((await request('status')).body.configured, true);
  assert.doesNotMatch(JSON.stringify((await request('status')).body), /unit-test-key/);
});
test('real contract relay accounts usage, limits rate, and permits one post-run review', async t => {
  let now = 1000;
  const payloads = [];
  const request = await server(t, { apiKey: 'unit-test-key', now: () => now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body); payloads.push(body);
    return new Response(JSON.stringify(answer(body.questions)), { status: 200 });
  } });
  const { runId } = (await request('start', {})).body;
  assert.equal((await request('start', {})).status, 409);
  assert.equal((await request('decision', { runId: 'stale', state: {} })).status, 409);
  const result = await request('decision', { runId, state: { game: 'Scicon' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.accounting.inputTokens, 100);
  assert.equal(payloads[0].model, 'jev-latest');
  assert.equal((await request('decision', { runId, state: {} })).status, 429);
  assert.equal((await request('review', { runId, state: {} })).status, 429);
  await request('stop', { runId }); now += 300;
  assert.equal((await request('decision', { runId, state: {} })).status, 429);
  assert.equal((await request('review', { runId, state: {} })).status, 200);
  now += 300;
  assert.equal((await request('review', { runId, state: {} })).status, 429);
  assert.equal(payloads.length, 2);
});
test('invalid provider decisions stop the run with no heuristic substitution or retry', async t => {
  let calls = 0;
  const request = await server(t, { apiKey: 'unit-test-key', fetchImpl: async () => {
    calls++;
    return new Response(JSON.stringify({ model: 'fixture', answers: { movement: { choice: 'teleport', confidence: 1 } } }));
  } });
  const { runId } = (await request('start', {})).body;
  const result = await request('decision', { runId, state: {} });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /Invalid Jev/);
  assert.equal((await request('decision', { runId, state: {} })).status, 429);
  assert.equal(calls, 1);
});
test('provider errors are redacted and never retried', async t => {
  const request = await server(t, { apiKey: 'secret-fixture-value', fetchImpl: async () => new Response('secret-fixture-value', { status: 401 }) });
  const { runId } = (await request('start', {})).body;
  const result = await request('decision', { runId, state: {} });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /rejected access/);
  assert.doesNotMatch(JSON.stringify(result.body), /secret-fixture-value/);
});
test('time and request-size limits prevent upstream calls', async t => {
  let now = 1000;
  let calls = 0;
  const request = await server(t, { apiKey: 'unit-test-key', now: () => now, fetchImpl: () => { calls++; } });
  const { runId } = (await request('start', {})).body;
  assert.equal((await request('decision', { runId, state: { excessive: 'x'.repeat(25000) } })).status, 400);
  now += 60001;
  assert.equal((await request('decision', { runId, state: {} })).status, 429);
  assert.equal(calls, 0);
});
test('stop during an in-flight call cannot launch a second session or retry', async t => {
  let resolveCall;
  let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const request = await server(t, { apiKey: 'unit-test-key', fetchImpl: async (_url, options) => {
    entered(); await new Promise(resolve => { resolveCall = resolve; });
    return new Response(JSON.stringify(answer(JSON.parse(options.body).questions)));
  } });
  const { runId } = (await request('start', {})).body;
  const decision = request('decision', { runId, state: {} });
  await ready;
  assert.equal((await request('decision', { runId, state: {} })).status, 409);
  assert.equal((await request('stop', { runId })).status, 200);
  assert.equal((await request('start', {})).status, 409);
  resolveCall(); await decision;
  assert.equal((await request('decision', { runId, state: {} })).status, 429);
});
