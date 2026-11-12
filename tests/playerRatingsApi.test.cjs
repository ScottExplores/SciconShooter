const test = require('node:test');
const assert = require('node:assert/strict');

let serialChain = Promise.resolve();
const serial = (name, fn) => {
  test(name, () => {
    const run = serialChain.then(fn, fn);
    serialChain = run.then(() => {}, () => {});
    return run;
  });
};
const fs = require('node:fs');
const path = require('node:path');

const playerRatingsHandler = require('../api/_lib/playerRatingsRoute');
const { createWalletProfileSession } = require('../api/_lib/walletProfileAuth');
const { founderWalletAddress } = require('../api/_lib/founderWallet');

const TEST_SUPABASE_URL = 'https://example.supabase.co';
const TEST_SERVICE_KEY = 'player-rating-test-service-key';
const HASH_SECRET = 'player-rating-test-hash-secret';
const AUTH_SECRET = 'player-rating-test-auth-secret-32';
const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WALLET = '0x1111111111111111111111111111111111111111';
let requestSequence = 0;

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data === null ? '' : JSON.stringify(data); }
});

const nextIp = () => `198.51.100.${(++requestSequence % 200) + 1}`;

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

const validSubmission = (overrides = {}) => ({
  action: 'submit',
  rating: 5,
  comment: '  Nice run  ',
  missionId: 'stage-bastion-protocol',
  anonymousPlayerId: DEVICE_ID,
  appVersion: '2.2.0-base-readiness',
  ...overrides
});

const withEnvironment = async (run) => {
  const original = {
    url: process.env.SUPABASE_URL,
    role: process.env.SUPABASE_SERVICE_ROLE_KEY,
    service: process.env.SUPABASE_SERVICE_KEY,
    hash: process.env.PRODUCT_ANALYTICS_HASH_SECRET,
    receipt: process.env.RUN_RECEIPT_SECRET,
    auth: process.env.WALLET_PROFILE_AUTH_SECRET,
    pilot: process.env.PILOT_TEST_WALLET
  };
  process.env.SUPABASE_URL = TEST_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = TEST_SERVICE_KEY;
  process.env.PRODUCT_ANALYTICS_HASH_SECRET = HASH_SECRET;
  process.env.WALLET_PROFILE_AUTH_SECRET = AUTH_SECRET;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.RUN_RECEIPT_SECRET;
  delete process.env.PILOT_TEST_WALLET;
  try {
    return await run();
  } finally {
    const restore = (key, value) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('SUPABASE_URL', original.url);
    restore('SUPABASE_SERVICE_ROLE_KEY', original.role);
    restore('SUPABASE_SERVICE_KEY', original.service);
    restore('PRODUCT_ANALYTICS_HASH_SECRET', original.hash);
    restore('RUN_RECEIPT_SECRET', original.receipt);
    restore('WALLET_PROFILE_AUTH_SECRET', original.auth);
    restore('PILOT_TEST_WALLET', original.pilot);
  }
};

const founderCookie = () => {
  const token = createWalletProfileSession(founderWalletAddress());
  return `scicon_wallet_profile_session=${encodeURIComponent(token)}`;
};

const installFetch = (routes) => {
  const requests = [];
  global.fetch = async (url, options = {}) => {
    const entry = { url: String(url), options };
    requests.push(entry);
    const match = routes.find((route) => route.match(entry));
    if (!match) return jsonResponse({ message: 'unexpected' }, 500);
    return match.respond(entry);
  };
  return requests;
};

const isRatingRead = (entry) => (
  entry.url.includes('/scicon_player_ratings?')
  && entry.options.method !== 'POST'
  && entry.options.method !== 'PATCH'
);
const isRatingInsert = (entry) => (
  entry.url.endsWith('/scicon_player_ratings')
  && entry.options.method === 'POST'
);
const isProfilePatch = (entry) => (
  entry.url.includes('/scicon_wallet_profiles?')
  && entry.options.method === 'PATCH'
);

test('the ratings migration is service-role only and keeps the raw device id out of the table', () => {
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'supabase', 'migrations', '20261112170000_player_ratings.sql'),
    'utf8'
  );
  assert.match(sql, /create table if not exists public\.scicon_player_ratings/);
  assert.match(sql, /rating smallint not null check \(rating between 1 and 5\)/);
  assert.match(sql, /comment text null check \(comment is null or char_length\(comment\) <= 500\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.scicon_player_ratings from public, anon, authenticated/);
  assert.match(sql, /grant select, insert on table public\.scicon_player_ratings to service_role/);
  assert.match(sql, /scicon_player_ratings_device_uidx/);
  assert.match(sql, /scicon_player_ratings_wallet_uidx/);
  assert.match(sql, /mission_feedback_shown boolean not null default false/);
  assert.match(sql, /'ratings'/);
  assert.match(sql, /scicon_recent_player_ratings/);
  assert.match(sql, /revoke all on function public\.scicon_recent_player_ratings/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
});

serial('a rating is validated, trimmed, hashed, and stored once per device', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    { match: isRatingRead, respond: () => jsonResponse([]) },
    { match: isRatingInsert, respond: () => jsonResponse(null, 201) }
  ]);
  try {
    await withEnvironment(async () => {
      const res = makeResponse();
      await playerRatingsHandler(makeRequest(validSubmission({
        comment: `  hello 0x${'ab'.repeat(20)}  ${'z'.repeat(520)}  `
      })), res);
      assert.equal(res.statusCode, 201);
      assert.deepEqual(res.body, { accepted: true, stored: true, duplicate: false });
      const insert = requests.find(isRatingInsert);
      const row = JSON.parse(insert.options.body);
      assert.equal(row.rating, 5);
      assert.equal(row.comment.length, 500);
      assert.match(row.comment, /^hello \[redacted_wallet\]\s+z+$/);
      assert.equal(row.wallet_address, null);
      assert.equal(row.is_test, false);
      assert.equal(row.mission_id, 'stage-bastion-protocol');
      assert.equal(row.app_version, '2.2.0-base-readiness');
      assert.equal(row.anonymous_player_id, playerRatingsHandler._test.hashAnonymousPlayerId(DEVICE_ID));
      assert.notEqual(row.anonymous_player_id, DEVICE_ID);
      assert.doesNotMatch(JSON.stringify(row), new RegExp(DEVICE_ID, 'i'));
      assert.doesNotMatch(JSON.stringify(res.body), new RegExp(TEST_SERVICE_KEY));
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('ratings outside 1 to 5 are rejected and a blank comment is stored as null', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    { match: isRatingRead, respond: () => jsonResponse([]) },
    { match: isRatingInsert, respond: () => jsonResponse(null, 201) }
  ]);
  try {
    await withEnvironment(async () => {
      for (const rating of [0, 6, 1.5, '5', true]) {
        const res = makeResponse();
        await playerRatingsHandler(makeRequest(validSubmission({ rating, comment: 'ok' })), res);
        assert.equal(res.statusCode, 400, `rating ${rating}`);
        assert.equal(res.body.code, 'RATING_INVALID');
      }
      const res = makeResponse();
      await playerRatingsHandler(makeRequest(validSubmission({ rating: 1, comment: '   ' })), res);
      assert.equal(res.statusCode, 201);
      const row = JSON.parse(requests.find(isRatingInsert).options.body);
      assert.equal(row.rating, 1);
      assert.equal(row.comment, null);
      assert.equal(requests.filter(isRatingInsert).length, 1);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('a second rating for the same player is accepted without storing another row', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    { match: isRatingRead, respond: () => jsonResponse([{ id: 'existing' }]) },
    { match: isRatingInsert, respond: () => jsonResponse({ code: '23505' }, 409) }
  ]);
  try {
    await withEnvironment(async () => {
      const res = makeResponse();
      await playerRatingsHandler(makeRequest(validSubmission()), res);
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { accepted: true, stored: false, duplicate: true });
      assert.equal(requests.filter(isRatingInsert).length, 0);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('the founder wallet can submit, and that row stays test-only', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    { match: isRatingRead, respond: () => jsonResponse([]) },
    { match: isRatingInsert, respond: () => jsonResponse(null, 201) },
    { match: isProfilePatch, respond: () => jsonResponse([{ mission_feedback_shown: true }]) }
  ]);
  try {
    await withEnvironment(async () => {
      const res = makeResponse();
      await playerRatingsHandler(makeRequest(validSubmission({
        walletAddress: OTHER_WALLET,
        isTest: false
      }), {
        headers: { cookie: founderCookie() }
      }), res);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.accepted, true);
      const row = JSON.parse(requests.find(isRatingInsert).options.body);
      assert.equal(row.wallet_address, founderWalletAddress());
      assert.equal(row.is_test, true);
      assert.notEqual(row.wallet_address, OTHER_WALLET);
      const patch = requests.find(isProfilePatch);
      assert.equal(JSON.parse(patch.options.body).mission_feedback_shown, true);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('a client-supplied wallet or test flag cannot mark a guest rating as the founder', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    { match: isRatingRead, respond: () => jsonResponse([]) },
    { match: isRatingInsert, respond: () => jsonResponse(null, 201) }
  ]);
  try {
    await withEnvironment(async () => {
      const res = makeResponse();
      await playerRatingsHandler(makeRequest(validSubmission({
        walletAddress: founderWalletAddress(),
        isTest: true,
        testRun: true
      })), res);
      assert.equal(res.statusCode, 201);
      const row = JSON.parse(requests.find(isRatingInsert).options.body);
      assert.equal(row.wallet_address, null);
      assert.equal(row.is_test, false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('profile status and acknowledge persist the shown flag for a connected wallet', async () => {
  const originalFetch = global.fetch;
  const requests = installFetch([
    {
      match: (entry) => entry.url.includes('mission_feedback_shown') && entry.options.method !== 'PATCH',
      respond: () => jsonResponse([{ mission_feedback_shown: true }])
    },
    { match: isProfilePatch, respond: () => jsonResponse([{ mission_feedback_shown: true }]) }
  ]);
  try {
    await withEnvironment(async () => {
      const guest = makeResponse();
      await playerRatingsHandler(makeRequest({ action: 'status' }), guest);
      assert.deepEqual(guest.body, { shown: false, wallet: false });

      const status = makeResponse();
      await playerRatingsHandler(makeRequest({ action: 'status' }, {
        headers: { cookie: founderCookie() }
      }), status);
      assert.deepEqual(status.body, { shown: true, wallet: true });

      const ack = makeResponse();
      await playerRatingsHandler(makeRequest({ action: 'acknowledge' }, {
        headers: { cookie: founderCookie() }
      }), ack);
      assert.deepEqual(ack.body, { ok: true, shown: true, wallet: true });
      assert.equal(requests.filter(isProfilePatch).length, 1);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

serial('rating requests are rate limited per client', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('status without a wallet must not touch storage');
  };
  try {
    await withEnvironment(async () => {
      const headers = { 'x-forwarded-for': '203.0.113.44' };
      let limited = null;
      for (let attempt = 0; attempt < 61; attempt += 1) {
        const res = makeResponse();
        await playerRatingsHandler(makeRequest({ action: 'status' }, { headers }), res);
        limited = res;
      }
      assert.equal(limited.statusCode, 429);
      assert.equal(limited.body.code, 'RATING_RATE_LIMIT');
    });
  } finally {
    global.fetch = originalFetch;
  }
});
