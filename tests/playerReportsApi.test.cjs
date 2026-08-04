const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const playerReportsHandler = require('../api/_lib/playerReportsRoute');

const TEST_SUPABASE_URL = 'https://example.supabase.co';
const TEST_SERVICE_KEY = 'player-report-test-service-key';
let requestSequence = 0;

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const supabaseResponse = (data = null, status = 201) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data === null ? '' : JSON.stringify(data); }
});

const nextIp = () => `203.0.113.${++requestSequence}`;

const makeRequest = (body, overrides = {}) => ({
  method: 'POST',
  headers: {
    host: 'sciconshooter.xyz',
    origin: 'https://sciconshooter.xyz',
    'x-forwarded-for': nextIp(),
    ...(overrides.headers || {})
  },
  body,
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'headers'))
});

const validReport = (overrides = {}) => ({
  reportId: '11111111-1111-4111-8111-111111111111',
  kind: 'bug',
  category: 'gameplay',
  source: 'manual',
  summary: 'The wave changed unexpectedly.',
  details: 'The flight restarted while enemies were still alive.',
  sessionId: '22222222-2222-4222-8222-222222222222',
  gameVersion: '2.2.0-base-readiness',
  createdAt: '2026-08-04T18:30:00.000Z',
  ...overrides
});

const withSupabaseEnvironment = async (run) => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
  process.env.SUPABASE_URL = TEST_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_KEY;
  delete process.env.SUPABASE_SERVICE_KEY;
  try {
    return await run();
  } finally {
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
  }
};

test('manual reports are stored as owner-only product event rows and preserve their client report ID', async () => {
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  const requests = [];
  const logs = [];
  global.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return options.body ? supabaseResponse() : supabaseResponse([], 200);
  };
  console.info = (...args) => logs.push(args);

  try {
    await withSupabaseEnvironment(async () => {
      const res = makeResponse();
      await playerReportsHandler(makeRequest(validReport()), res);

      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, {
        accepted: true,
        stored: true,
        reportId: '11111111-1111-4111-8111-111111111111'
      });
      assert.equal(res.headers['Cache-Control'], 'no-store');
      assert.equal(requests.length, 2);
      const limiterRequest = requests.find((request) => !request.options.body);
      const reportRequest = requests.find((request) => request.options.body);
      assert.match(limiterRequest.url, /properties->>limiter_key=eq\.[0-9a-f-]{36}/i);
      assert.equal(reportRequest.url, `${TEST_SUPABASE_URL}/rest/v1/scicon_product_events`);
      assert.equal(reportRequest.options.method, 'POST');
      assert.equal(reportRequest.options.headers.Authorization, `Bearer ${TEST_SERVICE_KEY}`);
      assert.equal(reportRequest.options.headers.Prefer, 'return=minimal');

      const row = JSON.parse(reportRequest.options.body);
      assert.equal(row.event_name, 'player_bug_report');
      assert.equal(row.session_id, validReport().sessionId);
      assert.equal(row.game_version, validReport().gameVersion);
      assert.equal(row.properties.report_id, validReport().reportId);
      assert.equal(row.properties.summary, validReport().summary);
      assert.equal(row.properties.details, validReport().details);
      assert.equal(row.properties.created_at, validReport().createdAt);
      assert.equal(row.properties.schema_version, 1);
      assert.match(row.properties.limiter_key, /^[0-9a-f-]{36}$/i);
      assert.doesNotMatch(JSON.stringify(row), /203\.0\.113\./);

      const serializedLogs = JSON.stringify(logs);
      assert.match(serializedLogs, /Player report stored/);
      assert.match(serializedLogs, /11111111-1111-4111-8111-111111111111/);
      assert.doesNotMatch(serializedLogs, /flight restarted while enemies/i);
      assert.doesNotMatch(serializedLogs, /wave changed unexpectedly/i);
      assert.doesNotMatch(JSON.stringify(res.body), new RegExp(TEST_SERVICE_KEY));
    });
  } finally {
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('feedback and automatic crashes receive distinct event names', async () => {
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  const rows = [];
  global.fetch = async (_url, options = {}) => {
    if (!options.body) return supabaseResponse([], 200);
    rows.push(JSON.parse(options.body));
    return supabaseResponse();
  };
  console.info = () => {};

  try {
    await withSupabaseEnvironment(async () => {
      const feedbackResponse = makeResponse();
      await playerReportsHandler(makeRequest(validReport({
        reportId: '33333333-3333-4333-8333-333333333333',
        kind: 'feedback',
        category: 'other',
        summary: 'Please add another control layout.'
      })), feedbackResponse);

      const crashResponse = makeResponse();
      await playerReportsHandler(makeRequest(validReport({
        reportId: '44444444-4444-4444-8444-444444444444',
        category: 'crash',
        source: 'automatic',
        summary: 'TypeError in flight renderer.'
      })), crashResponse);

      assert.equal(feedbackResponse.statusCode, 201);
      assert.equal(crashResponse.statusCode, 201);
      assert.deepEqual(rows.map((row) => row.event_name), [
        'player_feedback',
        'player_bug_report'
      ]);
    });
  } finally {
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('report identity, source combinations, timestamps, versions, and text lengths are strict', async (context) => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return supabaseResponse();
  };

  const invalidReports = [
    ['kind', { kind: 'complaint' }],
    ['category', { category: 'network' }],
    ['source', { source: 'browser' }],
    ['automatic combination', { source: 'automatic', category: 'gameplay' }],
    ['automatic feedback', { source: 'automatic', kind: 'feedback', category: 'crash' }],
    ['manual crash', { source: 'manual', category: 'crash' }],
    ['report UUID', { reportId: 'not-a-uuid' }],
    ['session UUID', { sessionId: 'not-a-uuid' }],
    ['timestamp', { createdAt: '2026-08-04 18:30:00' }],
    ['impossible timestamp', { createdAt: '2026-02-31T18:30:00.000Z' }],
    ['version', { gameVersion: 'version with spaces' }],
    ['empty summary', { summary: '   ' }],
    ['long summary', { summary: 's'.repeat(601) }],
    ['long details', { details: 'd'.repeat(5_001) }]
  ];

  try {
    await withSupabaseEnvironment(async () => {
      for (const [label, override] of invalidReports) {
        await context.test(label, async () => {
          const res = makeResponse();
          await playerReportsHandler(makeRequest(validReport(override)), res);
          assert.equal(res.statusCode, 400);
          assert.equal(typeof res.body.code, 'string');
          assert.equal(res.body.stored, undefined);
        });
      }
      assert.equal(fetchCalls, 0);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('request parsing rejects malformed JSON, non-objects, and bodies over 64 KiB', async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return supabaseResponse();
  };

  try {
    await withSupabaseEnvironment(async () => {
      const malformed = makeResponse();
      await playerReportsHandler(makeRequest('{bad json'), malformed);
      assert.equal(malformed.statusCode, 400);
      assert.equal(malformed.body.code, 'REPORT_INVALID_JSON');

      const array = makeResponse();
      await playerReportsHandler(makeRequest('[]'), array);
      assert.equal(array.statusCode, 400);
      assert.equal(array.body.code, 'REPORT_INVALID_JSON');

      const tooLarge = makeResponse();
      await playerReportsHandler(makeRequest(JSON.stringify({ padding: 'x'.repeat(70_000) })), tooLarge);
      assert.equal(tooLarge.statusCode, 413);
      assert.equal(tooLarge.body.code, 'REPORT_TOO_LARGE');
      assert.equal(fetchCalls, 0);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('cross-origin report posts fail before rate limiting or persistence', async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return supabaseResponse();
  };

  try {
    await withSupabaseEnvironment(async () => {
      const res = makeResponse();
      await playerReportsHandler(makeRequest(validReport(), {
        headers: {
          host: 'sciconshooter.xyz',
          origin: 'https://malicious.example',
          'x-forwarded-for': nextIp()
        }
      }), res);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /origin is not allowed/i);
      assert.equal(fetchCalls, 0);

      const missing = makeResponse();
      await playerReportsHandler(makeRequest(validReport(), {
        headers: {
          host: 'sciconshooter.xyz',
          origin: undefined,
          'x-forwarded-for': nextIp()
        }
      }), missing);
      assert.equal(missing.statusCode, 403);
      assert.match(missing.body.error, /origin is required/i);
      assert.equal(fetchCalls, 0);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('diagnostics are deeply allowlisted, capped, and redacted again on the server', async () => {
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  let storedRow;
  global.fetch = async (_url, options = {}) => {
    if (!options.body) return supabaseResponse([], 200);
    storedRow = JSON.parse(options.body);
    return supabaseResponse();
  };
  console.info = () => {};

  const privateValue = `0x${'a'.repeat(64)}`;
  const wallet = `0x${'b'.repeat(40)}`;
  const jwt = 'eyJabcdefgh.abcdefgh.abcdefgh';
  const breadcrumbs = Array.from({ length: 35 }, (_, index) => ({
    at: '2026-08-04T18:30:00.000Z',
    name: `event.${index}`,
    details: {
      message: `token=secret-${index}`,
      wallet,
      valid_number: index,
      nested: { should: 'drop' },
      ...Object.fromEntries(Array.from({ length: 15 }, (__, key) => [`extra_${key}`, key]))
    },
    cookie: 'must not survive'
  }));

  try {
    await withSupabaseEnvironment(async () => {
      const res = makeResponse();
      await playerReportsHandler(makeRequest(validReport({
        summary: `Renderer failed for ${wallet}`,
        details: `private_key=${privateValue}; auth=${jwt}`,
        diagnostics: {
          environment: {
            pathname: `/wallet/${wallet}`,
            online: false,
            visibilityState: 'visible',
            language: 'en-US',
            platform: 'mobile',
            viewportWidth: 430,
            viewportHeight: 932,
            screenWidth: 430,
            screenHeight: 932,
            connection: {
              effectiveType: '3g',
              downlink: 1.2,
              rtt: 450,
              saveData: true,
              secret: privateValue
            },
            cookie: jwt
          },
          runtime: {
            gameState: 'playing',
            gameId: 9,
            runMode: 'weekly-streak',
            missionId: 'weekly-12',
            waveId: 'wave-12',
            waveNumber: 12,
            waveTotal: 12,
            score: 900,
            lives: 2,
            selectedShipId: 'rsc',
            loadingPhase: 'ready',
            bossActive: false,
            walletAddress: wallet
          },
          performance: {
            navigationMs: 800,
            domInteractiveMs: 600,
            longTaskCount: 3,
            worstLongTaskMs: 120,
            secret: jwt
          },
          breadcrumbs,
          localStorage: { wallet, privateValue }
        }
      })), res);

      assert.equal(res.statusCode, 201);
      const properties = storedRow.properties;
      const serialized = JSON.stringify(properties);
      assert.doesNotMatch(serialized, new RegExp(wallet, 'i'));
      assert.doesNotMatch(serialized, new RegExp(privateValue, 'i'));
      assert.doesNotMatch(serialized, /eyJabcdefgh/);
      assert.doesNotMatch(serialized, /secret-34/);
      assert.match(serialized, /\[redacted_wallet\]/);
      assert.match(serialized, /\[redacted_private_value\]|private_key=\[redacted\]/);
      assert.equal(properties.diagnostics.environment.cookie, undefined);
      assert.equal(properties.diagnostics.environment.connection.secret, undefined);
      assert.equal(properties.diagnostics.runtime.walletAddress, undefined);
      assert.equal(properties.diagnostics.performance.secret, undefined);
      assert.equal(properties.diagnostics.localStorage, undefined);
      assert.equal(properties.diagnostics.breadcrumbs.length, 30);
      assert.equal(properties.diagnostics.breadcrumbs[0].name, 'event.5');
      assert.ok(Object.keys(properties.diagnostics.breadcrumbs[0].details).length <= 12);
    });
  } finally {
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('manual reports retain a local five-per-hour defense and automatic reports use a separate bucket', async () => {
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return supabaseResponse();
  };
  console.info = () => {};
  const ip = '198.51.100.77';

  try {
    await withSupabaseEnvironment(async () => {
      for (let index = 0; index < 5; index += 1) {
        const res = makeResponse();
        await playerReportsHandler(makeRequest(validReport({
          reportId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`
        }), { headers: { host: 'sciconshooter.xyz', origin: 'https://sciconshooter.xyz', 'x-forwarded-for': ip } }), res);
        assert.equal(res.statusCode, 201);
      }

      const blocked = makeResponse();
      await playerReportsHandler(makeRequest(validReport({
        reportId: 'aaaaaaaa-aaaa-4aaa-8aaa-999999999999'
      }), { headers: { host: 'sciconshooter.xyz', origin: 'https://sciconshooter.xyz', 'x-forwarded-for': ip } }), blocked);
      assert.equal(blocked.statusCode, 429);
      assert.equal(blocked.body.code, 'REPORT_RATE_LIMITED');
      assert.match(blocked.headers['Retry-After'], /^\d+$/);

      const automatic = makeResponse();
      await playerReportsHandler(makeRequest(validReport({
        reportId: 'bbbbbbbb-bbbb-4bbb-8bbb-999999999999',
        source: 'automatic',
        category: 'crash'
      }), { headers: { host: 'sciconshooter.xyz', origin: 'https://sciconshooter.xyz', 'x-forwarded-for': ip } }), automatic);
      assert.equal(automatic.statusCode, 201);
      assert.equal(fetchCalls, 12);
    });
  } finally {
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('accepted report rows enforce a durable opaque source-separated limiter without storing raw IP', async () => {
  const originalFetch = global.fetch;
  const originalInfo = console.info;
  const queries = [];
  let reportWrites = 0;
  const ip = '198.51.100.201';
  global.fetch = async (url, options = {}) => {
    if (options.body) {
      reportWrites += 1;
      return supabaseResponse();
    }
    queries.push(String(url));
    return supabaseResponse(Array.from({ length: 5 }, (_, index) => ({
      occurred_at: `2026-08-04T18:0${index}:00.000Z`
    })), 200);
  };
  console.info = () => {};

  try {
    await withSupabaseEnvironment(async () => {
      const request = makeRequest(validReport({
        reportId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      }), {
        headers: {
          host: 'sciconshooter.xyz',
          origin: 'https://sciconshooter.xyz',
          'x-forwarded-for': ip
        }
      });
      const manualKey = playerReportsHandler._test.deriveDurableRateLimitKey(request, 'manual');
      const automaticKey = playerReportsHandler._test.deriveDurableRateLimitKey(request, 'automatic');
      assert.match(manualKey, /^[0-9a-f-]{36}$/i);
      assert.notEqual(manualKey, automaticKey);
      assert.doesNotMatch(manualKey, new RegExp(ip.replaceAll('.', '\\.')));

      const res = makeResponse();
      await playerReportsHandler(request, res);
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.code, 'REPORT_RATE_LIMITED');
      assert.match(res.headers['Retry-After'], /^\d+$/);
      assert.equal(reportWrites, 0);
      assert.equal(queries.length, 1);
      assert.match(queries[0], new RegExp(manualKey));
      assert.doesNotMatch(queries[0], new RegExp(ip.replaceAll('.', '\\.')));
    });
  } finally {
    global.fetch = originalFetch;
    console.info = originalInfo;
  }
});

test('missing or failed storage returns a truthful 503 without exposing report text or provider details', async () => {
  const originalFetch = global.fetch;
  const originalError = console.error;
  const originalUrl = process.env.SUPABASE_URL;
  const originalRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const logs = [];
  console.error = (...args) => logs.push(args);

  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_KEY;
    const unavailable = makeResponse();
    await playerReportsHandler(makeRequest(validReport({
      summary: 'private player text must not reach logs'
    })), unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.equal(unavailable.body.code, 'REPORT_STORAGE_UNAVAILABLE');
    assert.equal(unavailable.body.stored, undefined);

    process.env.SUPABASE_URL = TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_KEY;
    global.fetch = async () => supabaseResponse({
      error: 'provider detail includes private player text must not reach logs'
    }, 500);
    const failed = makeResponse();
    await playerReportsHandler(makeRequest(validReport({
      reportId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      summary: 'private player text must not reach logs'
    })), failed);
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.code, 'REPORT_STORAGE_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(failed.body), /provider detail/i);
    assert.doesNotMatch(JSON.stringify(failed.body), /private player text/i);
    assert.doesNotMatch(JSON.stringify(logs), /provider detail|private player text/i);
  } finally {
    global.fetch = originalFetch;
    console.error = originalError;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalUrl;
    if (originalRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalRoleKey;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_KEY;
    else process.env.SUPABASE_SERVICE_KEY = originalServiceKey;
  }
});

test('unsupported methods cannot read the owner-only report log', async () => {
  const res = makeResponse();
  await playerReportsHandler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method not allowed' });
});

test('owner report review filters report events and removes the internal limiter key', () => {
  const cli = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'list-player-reports.mjs'),
    'utf8'
  );
  assert.match(cli, /event_name: 'in\.\(player_bug_report,player_feedback\)'/);
  assert.match(cli, /delete properties\.limiter_key/);
  assert.doesNotMatch(cli, /player_report_rate_limit/);
});
