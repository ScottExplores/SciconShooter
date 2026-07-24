const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'wallet-profile-api-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { getWeeklyBoundaryMeta } = require('../shared/weeklyCompetitionBoundary');
const signaturesPath = require.resolve('../api/_lib/baseSignatures');
const routePath = require.resolve('../api/_lib/walletProfileRoute');
const signatures = require(signaturesPath);
const originalVerifyBaseMessage = signatures.verifyBaseMessage;
signatures.verifyBaseMessage = async ({ signature }) => signature === '0xverified';
delete require.cache[routePath];
const walletProfileHandler = require(routePath);

const WALLET = '0x3333333333333333333333333333333333333333';

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); }
});

const makeResponse = () => ({
  statusCode: 0,
  headers: {},
  setHeader(name, value) { this.headers[name] = value; },
  end(body) { this.body = body ? JSON.parse(body) : null; }
});

const makeRequest = (method, body, cookie) => ({
  method,
  body,
  headers: {
    host: 'www.sciconshooter.xyz',
    origin: 'https://www.sciconshooter.xyz',
    ...(cookie ? { cookie } : {})
  }
});

const cookiePair = (setCookie) => String(setCookie).split(';')[0];

test('challenge authentication creates a secure session and profile saves use revision CAS', async (t) => {
  const originalFetch = global.fetch;
  const challenges = new Map();
  const profiles = new Map();

  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const body = options.body ? JSON.parse(options.body) : null;

    if (table === 'scicon_wallet_profile_challenges') {
      if (options.method === 'POST') {
        challenges.set(body.challenge_id, {
          ...body,
          used_at: null,
          created_at: new Date().toISOString()
        });
        return jsonResponse(null, 201);
      }
      const challengeId = String(parsed.searchParams.get('challenge_id') || '').replace(/^eq\./, '');
      const challenge = challenges.get(challengeId);
      if (!challenge) return jsonResponse([]);
      if (options.method === 'PATCH') {
        if (challenge.used_at) return jsonResponse([]);
        Object.assign(challenge, body);
        return jsonResponse([challenge]);
      }
      return jsonResponse([challenge]);
    }

    if (table === 'scicon_wallet_profiles') {
      const address = String(parsed.searchParams.get('wallet_address') || '').replace(/^eq\./, '');
      if (options.method === 'POST') {
        if (profiles.has(body.wallet_address)) return jsonResponse([]);
        const row = {
          ...body,
          created_at: new Date().toISOString()
        };
        profiles.set(body.wallet_address, row);
        return jsonResponse([row], 201);
      }
      if (options.method === 'PATCH') {
        const row = profiles.get(address);
        const expectedRevision = Number(
          String(parsed.searchParams.get('revision') || '').replace(/^eq\./, '')
        );
        if (!row || row.revision !== expectedRevision) return jsonResponse([]);
        Object.assign(row, body);
        return jsonResponse([row]);
      }
      const row = profiles.get(address);
      return jsonResponse(row ? [row] : []);
    }

    throw new Error(`Unexpected Supabase request: ${url}`);
  };

  t.after(() => {
    global.fetch = originalFetch;
    signatures.verifyBaseMessage = originalVerifyBaseMessage;
    delete require.cache[routePath];
  });

  const challengeResponse = makeResponse();
  await walletProfileHandler(
    makeRequest('POST', { action: 'challenge', address: WALLET }),
    challengeResponse
  );
  assert.equal(challengeResponse.statusCode, 200);
  assert.match(challengeResponse.body.message, new RegExp(`Wallet: ${WALLET}`));
  assert.equal(challenges.size, 1);

  const authResponse = makeResponse();
  await walletProfileHandler(makeRequest('POST', {
    action: 'authenticate',
    address: WALLET,
    challengeId: challengeResponse.body.challengeId,
    signature: '0xverified'
  }), authResponse);
  assert.equal(authResponse.statusCode, 200);
  assert.equal(authResponse.body.walletAddress, WALLET);
  assert.equal(authResponse.body.profile, null);
  assert.match(authResponse.headers['Set-Cookie'], /HttpOnly/);
  assert.match(authResponse.headers['Set-Cookie'], /Secure/);
  assert.ok(challenges.get(challengeResponse.body.challengeId).used_at);

  const cookie = cookiePair(authResponse.headers['Set-Cookie']);
  const currentWeek = getWeeklyBoundaryMeta().weekKey;
  const spoofedSaveResponse = makeResponse();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'save',
      walletAddress: '0x4444444444444444444444444444444444444444',
      expectedRevision: 0,
      snapshot: {}
    }, cookie), spoofedSaveResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(spoofedSaveResponse.statusCode, 403);
  assert.equal(profiles.size, 0);

  const spoofedLogoutResponse = makeResponse();
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'logout',
      walletAddress: '0x4444444444444444444444444444444444444444'
    }, cookie), spoofedLogoutResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(spoofedLogoutResponse.statusCode, 403);
  assert.equal(spoofedLogoutResponse.headers['Set-Cookie'], undefined);

  const saveResponse = makeResponse();
  await walletProfileHandler(makeRequest('POST', {
    action: 'save',
    walletAddress: WALLET,
    expectedRevision: 0,
    snapshot: {
      weeklyState: {
        profileId: 'pilot:wrong',
        weekKey: currentWeek,
        coins: 50,
        unlockedSlots: { left: true, right: false },
        ownedMiniShips: { 'citation-dart': 1 },
        equipped: { left: 'citation-dart', right: null },
        shipUpgrades: {},
        weeklyStats: {}
      },
      permanentState: {
        profileId: 'pilot:wrong',
        mintedMiniShips: ['citation-dart'],
        dailyGifts: {},
        lifetimeStats: {}
      },
      stats: { playerName: 'SCOTT' },
      selectedShipId: 'researchhub'
    }
  }, cookie), saveResponse);
  assert.equal(saveResponse.statusCode, 200);
  assert.equal(saveResponse.body.profile.revision, 1);
  assert.equal(saveResponse.body.profile.profileId, `wallet:${WALLET}`);
  assert.equal(saveResponse.body.profile.snapshot.weeklyState.profileId, `wallet:${WALLET}`);
  assert.equal(
    'mintedMiniShips' in saveResponse.body.profile.snapshot.permanentState,
    false
  );

  const getResponse = makeResponse();
  await walletProfileHandler(makeRequest('GET', null, cookie), getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.body.profile.revision, 1);
  assert.equal(getResponse.body.profile.snapshot.stats.playerName, 'SCOTT');

  const conflictResponse = makeResponse();
  console.error = () => {};
  try {
    await walletProfileHandler(makeRequest('POST', {
      action: 'save',
      walletAddress: WALLET,
      expectedRevision: 0,
      snapshot: getResponse.body.profile.snapshot
    }, cookie), conflictResponse);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(conflictResponse.body.currentRevision, 1);
  assert.equal(conflictResponse.body.profile.revision, 1);
});
