const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PLAYER_REPORT_EMAIL_FROM,
  PLAYER_REPORT_EMAIL_TO,
  RESEND_EMAIL_ENDPOINT,
  buildPlayerReportEmail,
  sendPlayerReportEmail
} = require('../api/_lib/playerReportEmail');

const manualReport = (overrides = {}) => ({
  reportId: '11111111-1111-4111-8111-111111111111',
  kind: 'feedback',
  category: 'gameplay',
  source: 'manual',
  summary: 'The left movement control feels great.',
  details: 'Please add the same response to the right side.',
  sessionId: '22222222-2222-4222-8222-222222222222',
  gameVersion: 'test-version',
  createdAt: '2026-08-27T18:30:00.000Z',
  diagnostics: {
    environment: { platform: 'mobile', viewportWidth: 390, viewportHeight: 844 }
  },
  ...overrides
});

test('player report emails use fixed server-owned addresses and plain text', () => {
  const email = buildPlayerReportEmail(manualReport());
  assert.equal(email.from, PLAYER_REPORT_EMAIL_FROM);
  assert.equal(email.from, 'Scicon Shooter Reports <reports@sciconshooter.xyz>');
  assert.deepEqual(email.to, [PLAYER_REPORT_EMAIL_TO]);
  assert.equal(PLAYER_REPORT_EMAIL_TO, 'sciconshooter@gmail.com');
  assert.match(email.subject, /^\[Scicon Shooter\] Feedback - Gameplay or waves - 11111111$/);
  assert.match(email.text, /Report ID: 11111111-1111-4111-8111-111111111111/);
  assert.match(email.text, /The left movement control feels great\./);
  assert.match(email.text, /"platform": "mobile"/);
  assert.equal(email.html, undefined);
  assert.equal(email.reply_to, undefined);
});

test('manual delivery uses the fixed recipient and report-id idempotency key', async () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  let request;
  process.env.RESEND_API_KEY = 're_test_key';
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      async json() { return { id: 'email_123' }; }
    };
  };

  try {
    const result = await sendPlayerReportEmail(manualReport());
    assert.deepEqual(result, {
      emailed: true,
      skipped: false,
      providerMessageId: 'email_123'
    });
    assert.equal(request.url, RESEND_EMAIL_ENDPOINT);
    assert.equal(request.options.headers.Authorization, 'Bearer re_test_key');
    assert.equal(
      request.options.headers['Idempotency-Key'],
      'scicon-player-report/11111111-1111-4111-8111-111111111111'
    );
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(payload.to, ['sciconshooter@gmail.com']);
    assert.equal(payload.reply_to, undefined);
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
  }
});

test('automatic crashes stay in the durable log and never trigger email', async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('automatic reports must not send email');
  };

  try {
    const result = await sendPlayerReportEmail(manualReport({
      kind: 'bug',
      category: 'crash',
      source: 'automatic'
    }));
    assert.deepEqual(result, { emailed: false, skipped: true });
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('missing credentials and provider failures remain retryable without leaking provider details', async (context) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  try {
    await context.test('missing credential', async () => {
      delete process.env.RESEND_API_KEY;
      await assert.rejects(
        sendPlayerReportEmail(manualReport()),
        (error) => error.code === 'REPORT_EMAIL_UNAVAILABLE'
          && !/api key|credential|resend/i.test(error.message)
      );
    });

    await context.test('provider failure', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      global.fetch = async () => ({
        ok: false,
        status: 403,
        async json() { return { message: 'sensitive provider details' }; }
      });
      await assert.rejects(
        sendPlayerReportEmail(manualReport()),
        (error) => error.code === 'REPORT_EMAIL_UNAVAILABLE'
          && !/sensitive provider details/i.test(error.message)
      );
    });

    await context.test('provider rate limit', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      global.fetch = async () => ({
        ok: false,
        status: 429,
        headers: { get: (name) => name.toLowerCase() === 'retry-after' ? '120' : null },
        async json() { return { message: 'rate limited' }; }
      });
      await assert.rejects(
        sendPlayerReportEmail(manualReport()),
        (error) => error.code === 'REPORT_EMAIL_UNAVAILABLE'
          && error.retryAfterMs === 120_000
      );
    });
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
  }
});
