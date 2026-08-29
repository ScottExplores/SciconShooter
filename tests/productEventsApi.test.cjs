const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const handler = require('../api/events');

let ip = 0;
const respond = () => ({
  statusCode: 0, headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  end(value) { this.body = value ? JSON.parse(value) : null; }
});
const request = (body, headers = {}) => ({
  method: 'POST', body,
  headers: {
    host: 'sciconshooter.xyz', origin: 'https://sciconshooter.xyz',
    'x-forwarded-for': `203.0.113.${++ip}`, ...headers
  }
});
const event = (overrides = {}) => ({
  eventName: 'session_activity',
  sessionId: '11111111-1111-4111-8111-111111111111',
  anonymousPlayerId: '22222222-2222-4222-8222-222222222222',
  gameVersion: '2.2.0-base-readiness',
  properties: {
    active_seconds_total: 120,
    gameplay_seconds_total: 90,
    reason: 'heartbeat'
  },
  ...overrides
});
const supabaseResponse = () => ({ ok: true, status: 201, text: async () => '' });
const envNames = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY',
  'PRODUCT_ANALYTICS_HASH_SECRET', 'RUN_RECEIPT_SECRET', 'VERCEL_ENV'
];
const withEnv = async (values, run) => {
  const prior = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
  envNames.forEach((key) => delete process.env[key]);
  Object.assign(process.env, values);
  try { return await run(); } finally {
    envNames.forEach((key) => prior[key] === undefined
      ? delete process.env[key]
      : process.env[key] = prior[key]);
  }
};

test('session activity stores only a server-HMAC visitor identifier', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return supabaseResponse(); };
  try {
    await withEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
      PRODUCT_ANALYTICS_HASH_SECRET: 'analytics-hash-test-secret'
    }, async () => {
      const payload = event();
      const res = respond();
      await handler(request(payload), res);
      assert.equal(res.statusCode, 202);
      assert.deepEqual(res.body, { accepted: true, stored: true });
      assert.equal(calls.length, 1);
      const stored = JSON.parse(calls[0].options.body);
      const expected = crypto.createHmac('sha256', 'analytics-hash-test-secret')
        .update(`scicon-product-analytics:v1:${payload.anonymousPlayerId}`).digest('hex');
      assert.equal(stored.event_name, 'session_activity');
      assert.equal(stored.properties.visitor_hash, expected);
      assert.equal(stored.properties.schema_version, 3);
      assert.equal(stored.properties.event_source, 'production');
      assert.equal(stored.properties.test_run, undefined);
      assert.equal(stored.properties.active_seconds_total, 120);
      assert.equal(stored.properties.gameplay_seconds_total, 90);
      assert.doesNotMatch(calls[0].options.body, new RegExp(payload.anonymousPlayerId, 'i'));
      assert.doesNotMatch(JSON.stringify(res.body), /server-only-test-key/);
    });
  } finally { global.fetch = originalFetch; }
});

test('run progress and endings are accepted and preview events are marked as test traffic', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return supabaseResponse(); };
  try {
    await withEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
      PRODUCT_ANALYTICS_HASH_SECRET: 'analytics-hash-test-secret',
      VERCEL_ENV: 'preview'
    }, async () => {
      const analyticsRunId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
      const progress = event({
        eventName: 'run_progress',
        properties: {
          analytics_run_id: analyticsRunId,
          run_mode: 'weekly-streak',
          mission_number: 2,
          wave_number: 2,
          absolute_wave_number: 7,
          continuous_run: true
        }
      });
      const ended = event({
        eventName: 'run_ended',
        properties: {
          analytics_run_id: analyticsRunId,
          run_mode: 'weekly-streak',
          mission_number: 2,
          wave_number: 2,
          absolute_wave_number: 7,
          result: 'defeated'
        }
      });

      for (const payload of [progress, ended]) {
        const res = respond();
        await handler(request(payload), res);
        assert.equal(res.statusCode, 202);
        assert.deepEqual(res.body, { accepted: true, stored: true });
      }

      assert.equal(calls.length, 2);
      const storedRows = calls.map((call) => JSON.parse(call.options.body));
      assert.deepEqual(storedRows.map((stored) => stored.event_name), ['run_progress', 'run_ended']);
      for (const stored of storedRows) {
        assert.equal(stored.properties.schema_version, 3);
        assert.equal(stored.properties.event_source, 'preview');
        assert.equal(stored.properties.test_run, true);
        assert.equal(stored.properties.analytics_run_id, analyticsRunId);
      }
      assert.equal(storedRows[0].properties.absolute_wave_number, 7);
      assert.equal(storedRows[1].properties.result, 'defeated');
    });
  } finally { global.fetch = originalFetch; }
});

test('event ingestion rejects oversized, malformed-ID, and cross-origin requests before storage', async (t) => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; return supabaseResponse(); };
  try {
    await withEnv({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      PRODUCT_ANALYTICS_HASH_SECRET: 'test-hash-secret'
    }, async () => {
      const cases = [
        ['oversized', JSON.stringify({ padding: 'x'.repeat(9_000) }), {}, 413, /too large/i],
        ['session', event({ sessionId: 'bad' }), {}, 400, /invalid session/i],
        ['visitor', event({ anonymousPlayerId: 'bad' }), {}, 400, /invalid anonymous player/i],
        ['origin', event(), { origin: 'https://malicious.example' }, 403, /origin is not allowed/i]
      ];
      for (const [name, body, headers, status, message] of cases) {
        await t.test(name, async () => {
          const res = respond();
          await handler(request(body, headers), res);
          assert.equal(res.statusCode, status);
          assert.match(res.body.error, message);
        });
      }
      assert.equal(calls, 0);
    });
  } finally { global.fetch = originalFetch; }
});

test('missing analytics storage remains fail-soft', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; return supabaseResponse(); };
  try {
    await withEnv({}, async () => {
      const res = respond();
      await handler(request(event()), res);
      assert.equal(res.statusCode, 202);
      assert.deepEqual(res.body, { accepted: true, stored: false });
      assert.equal(calls, 0);
    });
  } finally { global.fetch = originalFetch; }
});
