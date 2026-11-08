const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.WALLET_PROFILE_AUTH_SECRET = 'wallet-profile-api-test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.RUN_RECEIPT_SECRET = 'wallet-profile-api-test-secret';

const { GUEST_COOKIE_NAME, createGuestIdentityToken } = require('../api/_lib/guestIdentity');
const { SESSION_COOKIE_NAME } = require('../api/_lib/walletProfileAuth');
const signatures = require('../api/_lib/baseSignatures');
const originalVerify = signatures.verifyBaseMessage;
signatures.verifyBaseMessage = async ({ signature }) => signature === '0xverified';
const routePath = require.resolve('../api/_lib/walletProfileRoute');
delete require.cache[routePath];
const walletProfileHandler = require(routePath);

const WALLET_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const WALLET_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

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

const installFetch = () => {
  const challenges = new Map();
  const profiles = new Map();
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const table = parsed.pathname.split('/').pop();
    const body = options.body ? JSON.parse(options.body) : null;
    if (table === 'scicon_boss_archive_challenge_results' || table === 'scicon_wallet_entitlements') {
      return jsonResponse([]);
    }
    if (table === 'scicon_wallet_profile_challenges') {
      const challengeId = String(parsed.searchParams.get('challenge_id') || '').replace(/^eq\./, '');
      if (options.method === 'POST') {
        if (challenges.has(body.challenge_id)) return jsonResponse([]);
        const row = { ...body, used_at: null, created_at: new Date().toISOString() };
        challenges.set(body.challenge_id, row);
        return jsonResponse([row], 201);
      }
      const current = challenges.get(challengeId);
      if (!current) return jsonResponse([]);
      if (options.method === 'PATCH') {
        const expectedMessage = parsed.searchParams.get('message');
        if (expectedMessage && expectedMessage !== `eq.${current.message}`) return jsonResponse([]);
        if (String(parsed.searchParams.get('used_at') || '') === 'is.null' && current.used_at) {
          return jsonResponse([]);
        }
        Object.assign(current, body);
        return jsonResponse([current]);
      }
      return jsonResponse([current]);
    }
    if (table === 'scicon_wallet_profiles') {
      const address = String(parsed.searchParams.get('wallet_address') || '').replace(/^eq\./, '');
      if (options.method === 'POST') {
        if (profiles.has(body.wallet_address)) return jsonResponse([]);
        const row = { ...body, created_at: new Date().toISOString() };
        profiles.set(body.wallet_address, row);
        return jsonResponse([row], 201);
      }
      if (options.method === 'PATCH') {
        const row = profiles.get(address);
        const expectedRevision = Number(String(parsed.searchParams.get('revision') || '').replace(/^eq\./, ''));
        if (!row || row.revision !== expectedRevision) return jsonResponse([]);
        Object.assign(row, body);
        return jsonResponse([row]);
      }
      return jsonResponse(profiles.get(address) ? [profiles.get(address)] : []);
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  };
  return () => {
    global.fetch = originalFetch;
  };
};

const createJar = () => {
  const jar = new Map();
  jar.set(GUEST_COOKIE_NAME, createGuestIdentityToken());
  return jar;
};

const headerFrom = (jar) => [...jar.entries()]
  .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  .join('; ');

const applySetCookie = (jar, setCookie) => {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  headers.forEach((header) => {
    const [pair] = String(header).split(';');
    const separator = pair.indexOf('=');
    if (separator < 1) return;
    const name = pair.slice(0, separator).trim();
    const rawValue = pair.slice(separator + 1).trim();
    if (/Max-Age=0(?:;|$)/.test(String(header))) {
      jar.delete(name);
      return;
    }
    jar.set(name, decodeURIComponent(rawValue));
  });
};

const walletCookieCount = (setCookie) => {
  const headers = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return headers.filter((header) => (
    String(header).startsWith(`${SESSION_COOKIE_NAME}=`)
    && !/Max-Age=0(?:;|$)/.test(String(header))
  )).length;
};

const call = async (jar, method, body) => {
  const response = makeResponse();
  await walletProfileHandler(makeRequest(method, body, headerFrom(jar)), response);
  return response;
};

test('an in-flight authenticate cannot Set-Cookie over a newer browser wallet', async (t) => {
  const restore = installFetch();
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => {
    restore();
    console.error = originalConsoleError;
    signatures.verifyBaseMessage = originalVerify;
  });

  const jar = createJar();
  const preparedA = await call(jar, 'POST', { action: 'prepare-auth' });
  assert.equal(preparedA.body.status, 'ready');
  const challengeA = await call(jar, 'POST', { action: 'challenge', address: WALLET_A });
  const preparedB = await call(jar, 'POST', { action: 'prepare-auth' });
  assert.notEqual(preparedB.body.attemptId, preparedA.body.attemptId);

  const authenticateA = await call(jar, 'POST', {
    action: 'authenticate',
    address: WALLET_A,
    challengeId: challengeA.body.challengeId,
    signature: '0xverified',
    attemptId: preparedA.body.attemptId
  });
  assert.equal(authenticateA.statusCode, 409);
  assert.equal(authenticateA.body.code, 'wallet_attempt_superseded');
  assert.equal(walletCookieCount(authenticateA.headers['Set-Cookie']), 0);

  const challengeB = await call(jar, 'POST', { action: 'challenge', address: WALLET_B });
  const authenticateB = await call(jar, 'POST', {
    action: 'authenticate',
    address: WALLET_B,
    challengeId: challengeB.body.challengeId,
    signature: '0xverified',
    attemptId: preparedB.body.attemptId
  });
  assert.equal(authenticateB.statusCode, 200);
  assert.equal(authenticateB.body.status, 'granted');
  assert.equal(walletCookieCount(authenticateB.headers['Set-Cookie']), 0);

  const adoptB = await call(jar, 'POST', {
    action: 'adopt-auth',
    attemptId: preparedB.body.attemptId
  });
  assert.equal(adoptB.statusCode, 200);
  assert.equal(adoptB.body.walletAddress, WALLET_B);
  assert.equal(walletCookieCount(adoptB.headers['Set-Cookie']), 1);

  const reversed = new Map(jar);
  reversed.delete(SESSION_COOKIE_NAME);
  [authenticateA, authenticateB, adoptB].reverse().forEach((response) => {
    applySetCookie(reversed, response.headers['Set-Cookie']);
  });
  [authenticateA, authenticateB, adoptB].forEach((response) => {
    applySetCookie(jar, response.headers['Set-Cookie']);
  });

  const session = await call(jar, 'GET', null);
  const reversedSession = await call(reversed, 'GET', null);
  assert.equal(session.statusCode, 200);
  assert.equal(session.body.walletAddress, WALLET_B);
  assert.equal(reversedSession.statusCode, 200);
  assert.equal(reversedSession.body.walletAddress, WALLET_B);

  const lateAdoptA = await call(jar, 'POST', {
    action: 'adopt-auth',
    attemptId: preparedA.body.attemptId
  });
  assert.equal(lateAdoptA.statusCode, 409);
  assert.equal(walletCookieCount(lateAdoptA.headers['Set-Cookie']), 0);
  applySetCookie(jar, lateAdoptA.headers['Set-Cookie']);
  const afterLateA = await call(jar, 'GET', null);
  assert.equal(afterLateA.body.walletAddress, WALLET_B);

  const grantAndAdopt = async (jar, address) => {
    const prepared = await call(jar, 'POST', { action: 'prepare-auth' });
    const challenge = await call(jar, 'POST', { action: 'challenge', address });
    const granted = await call(jar, 'POST', {
      action: 'authenticate',
      address,
      challengeId: challenge.body.challengeId,
      signature: '0xverified',
      attemptId: prepared.body.attemptId
    });
    assert.equal(granted.statusCode, 200);
    assert.equal(walletCookieCount(granted.headers['Set-Cookie']), 0);
    const adopted = await call(jar, 'POST', {
      action: 'adopt-auth',
      attemptId: prepared.body.attemptId
    });
    assert.equal(adopted.statusCode, 200);
    return { prepared, adopted };
  };

  const switchJar = createJar();
  const first = await grantAndAdopt(switchJar, WALLET_A);
  const second = await grantAndAdopt(switchJar, WALLET_B);
  const browser = new Map(switchJar);
  browser.delete(SESSION_COOKIE_NAME);
  applySetCookie(browser, second.adopted.headers['Set-Cookie']);
  applySetCookie(browser, first.adopted.headers['Set-Cookie']);
  const switchedSession = await call(browser, 'GET', null);
  assert.equal(switchedSession.body.walletAddress, WALLET_B);
  assert.equal(walletCookieCount(switchedSession.headers['Set-Cookie']), 0);

  const loggedOut = await call(browser, 'POST', { action: 'logout', walletAddress: WALLET_A });
  assert.equal(loggedOut.statusCode, 200);
  applySetCookie(browser, loggedOut.headers['Set-Cookie']);
  applySetCookie(browser, first.adopted.headers['Set-Cookie']);
  applySetCookie(browser, second.adopted.headers['Set-Cookie']);
  const resurrected = await call(browser, 'GET', null);
  assert.equal(resurrected.statusCode, 401);
  assert.equal(resurrected.body.code, 'wallet_session_superseded');

  const cancelled = createJar();
  const prepared = await call(cancelled, 'POST', { action: 'prepare-auth' });
  const challenge = await call(cancelled, 'POST', { action: 'challenge', address: WALLET_A });
  const granted = await call(cancelled, 'POST', {
    action: 'authenticate',
    address: WALLET_A,
    challengeId: challenge.body.challengeId,
    signature: '0xverified',
    attemptId: prepared.body.attemptId
  });
  assert.equal(granted.statusCode, 200);
  const fenced = await call(cancelled, 'POST', { action: 'supersede-auth' });
  assert.equal(fenced.body.status, 'fenced');
  const adopted = await call(cancelled, 'POST', {
    action: 'adopt-auth',
    attemptId: prepared.body.attemptId
  });
  assert.equal(adopted.statusCode, 409);
  assert.equal(walletCookieCount(adopted.headers['Set-Cookie']), 0);
  applySetCookie(cancelled, granted.headers['Set-Cookie']);
  applySetCookie(cancelled, adopted.headers['Set-Cookie']);
  const afterCancel = await call(cancelled, 'GET', null);
  assert.equal(afterCancel.statusCode, 401);

  const bootstrapJar = createJar();
  const bootstrapPrepared = await call(bootstrapJar, 'POST', { action: 'prepare-auth' });
  const bootstrapChallenge = await call(bootstrapJar, 'POST', { action: 'challenge', address: WALLET_A });
  await call(bootstrapJar, 'POST', {
    action: 'authenticate',
    address: WALLET_A,
    challengeId: bootstrapChallenge.body.challengeId,
    signature: '0xverified',
    attemptId: bootstrapPrepared.body.attemptId
  });
  const bootstrapAdopted = await call(bootstrapJar, 'POST', {
    action: 'adopt-auth',
    attemptId: bootstrapPrepared.body.attemptId
  });
  applySetCookie(bootstrapJar, bootstrapAdopted.headers['Set-Cookie']);

  const created = await call(bootstrapJar, 'POST', {
    action: 'bootstrap',
    snapshot: {
      weeklyState: { coins: 1_000_000_000 },
      permanentState: { unlockedPlayerShips: ['btc'] },
      stats: { highScore: 999999 }
    }
  });
  assert.equal(created.statusCode, 200);
  assert.equal(created.body.profile.revision, 1);
  assert.equal(created.body.profile.snapshot.weeklyState.coins, 0);
  assert.equal(created.body.profile.snapshot.stats.highScore, 0);
  assert.equal(created.body.profile.snapshot.permanentState.unlockedPlayerShips.includes('btc'), false);

  const rejected = await call(bootstrapJar, 'POST', {
    action: 'save',
    walletAddress: WALLET_A,
    expectedRevision: 0,
    snapshot: created.body.profile.snapshot
  });
  assert.equal(rejected.statusCode, 409);
  assert.equal(rejected.body.code, 'wallet_profile_conflict');

  const saved = await call(bootstrapJar, 'POST', {
    action: 'save',
    walletAddress: WALLET_A,
    expectedRevision: 1,
    snapshot: {
      ...created.body.profile.snapshot,
      weeklyState: {
        ...created.body.profile.snapshot.weeklyState,
        coins: 40
      }
    }
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.profile.revision, 2);
  assert.equal(saved.body.profile.snapshot.weeklyState.coins, 40);

  const again = await call(bootstrapJar, 'POST', {
    action: 'bootstrap',
    snapshot: { weeklyState: { coins: 1_000_000_000 } }
  });
  assert.equal(again.statusCode, 200);
  assert.equal(again.body.profile.revision, 2);
  assert.equal(again.body.profile.snapshot.weeklyState.coins, 40);
  assert.equal(again.body.walletAddress, WALLET_A);
});

test('a legacy same-address cache is archived once and does not replace the guest save', async () => {
  const { archiveLocalWalletSnapshot, walletLocalArchiveKey } = await import('../services/walletLocalArchive.ts');
  const store = new Map();
  const original = global.localStorage;
  global.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  };
  const address = WALLET_A;
  const tampered = {
    stats: { highScore: 10, totalCoins: 0, playerName: 'LOCAL' },
    weeklyState: { coins: 1_000_000_000 },
    permanentState: { unlockedPlayerShips: ['btc'] },
    selectedShipId: 'researchhub'
  };
  const guestKey = 'scicon_guest_progress';
  store.set(guestKey, 'guest-save');
  assert.equal(archiveLocalWalletSnapshot(address, tampered), true);
  assert.equal(archiveLocalWalletSnapshot(address, {
    ...tampered,
    weeklyState: { coins: 5 }
  }), false);
  assert.equal(store.get(guestKey), 'guest-save');
  assert.match(store.get(walletLocalArchiveKey(address)), /1000000000/);
  global.localStorage = original;
});
