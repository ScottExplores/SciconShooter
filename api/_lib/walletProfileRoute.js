const { verifyBaseMessage } = require('./baseSignatures');
const {
  adoptBrowserAuthAttempt,
  assertAttemptId,
  beginBrowserAuthAttempt,
  clearBrowserAuth,
  fenceBrowserAuth,
  grantBrowserAuthAttempt,
  readAuthoritativeWalletProfileSession,
  releaseBrowserAuthAttempt
} = require('./browserWalletAuth');
const { readGuestIdentity, readGuestIdentityOrEstablish } = require('./guestIdentity');
const { linkGuestWalletProfile } = require('./guestWalletLink');
const {
  assertSameOrigin,
  clearWalletProfileSessionCookie,
  createWalletProfileSession,
  normalizeRequestOrigin,
  normalizeWalletAddress,
  readWalletProfileSessionToken,
  setWalletProfileSessionCookie,
  verifyWalletProfileSession
} = require('./walletProfileAuth');
const {
  consumeWalletProfileChallenge,
  createWalletProfileChallenge,
  ensureWalletProfile,
  fetchWalletProfile,
  getWalletProfileChallenge,
  MAX_SNAPSHOT_BYTES,
  saveWalletProfile
} = require('./walletProfiles');
const { checkRateLimit } = require('./rateLimit');
const {
  createBossArchiveChallengeRun,
  settleBossArchiveChallengeRun
} = require('./bossArchiveChallenges');
const {
  createCampaignBranchAttempt,
  settleCampaignBranchAttempt
} = require('./campaignBranchRuns');

const MAX_REQUEST_BODY_BYTES = MAX_SNAPSHOT_BYTES + 32 * 1024;

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body !== 'string') {
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_REQUEST_BODY_BYTES) {
      throw Object.assign(new Error('The wallet profile request is too large.'), { statusCode: 413 });
    }
    return body;
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw Object.assign(new Error('The wallet profile request is too large.'), { statusCode: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('A valid JSON body is required.'), { statusCode: 400 });
  }
};

const superseded = () => Object.assign(
  new Error('Wallet connection was superseded.'),
  { statusCode: 409, code: 'wallet_attempt_superseded' }
);

const installAuthoritativeSession = (res, walletAddress, binding, guestId) => {
  setWalletProfileSessionCookie(res, createWalletProfileSession(
    walletAddress,
    Date.now(),
    undefined,
    {
      browserId: guestId,
      authGeneration: binding.generation
    }
  ));
};

const authenticate = async (body, req, res) => {
  const walletAddress = normalizeWalletAddress(body.address);
  if (!walletAddress || !body.challengeId || !body.signature) {
    throw Object.assign(new Error('Wallet, challenge, and signature are required.'), { statusCode: 400 });
  }
  const challenge = await getWalletProfileChallenge({
    address: walletAddress,
    challengeId: body.challengeId
  });
  const valid = await verifyBaseMessage({
    address: walletAddress,
    message: challenge.message,
    signature: body.signature
  });
  if (!valid) {
    throw Object.assign(new Error('Wallet signature could not be verified.'), { statusCode: 401 });
  }
  const guest = readGuestIdentity(req);
  if (guest) {
    // The signature grant is stored on the browser attempt. Set-Cookie happens
    // only in adopt, after the client has checked that this attempt is still
    // current. A late authenticate response therefore cannot install a session.
    const attemptId = assertAttemptId(body.attemptId);
    const granted = await grantBrowserAuthAttempt(guest.guestId, {
      attemptId,
      wallet: walletAddress
    });
    await consumeWalletProfileChallenge(challenge.challenge_id);
    if (!granted.ok) throw superseded();
    return {
      status: 'granted',
      walletAddress,
      attemptId,
      profile: null
    };
  }
  const sessionToken = createWalletProfileSession(walletAddress);
  await consumeWalletProfileChallenge(challenge.challenge_id);
  setWalletProfileSessionCookie(res, sessionToken);
  return {
    walletAddress,
    profile: await fetchWalletProfile(walletAddress)
  };
};

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const token = readWalletProfileSessionToken(req);
      let cookieSession = null;
      try {
        cookieSession = token ? verifyWalletProfileSession(token) : null;
      } catch {
        cookieSession = null;
      }
      // Reissue only a cookie that already names the authoritative wallet.
      // Rewriting a stale cookie here would itself be a delayed Set-Cookie.
      if (cookieSession && cookieSession.walletAddress === session.walletAddress) {
        setWalletProfileSessionCookie(res, token);
      }
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        profile: await fetchWalletProfile(session.walletAddress)
      });
    }

    assertSameOrigin(req);
    const body = parseBody(req.body);
    const rateLimit = checkRateLimit(req, {
      scope: `wallet-profile:${String(body.action || 'unknown')}`,
      limit: body.action === 'save'
        ? 180
        : body.action === 'settle-boss-challenge' || body.action === 'settle-campaign-branch'
          ? 20
          : 30,
      windowMs: body.action === 'save' ? 60_000 : 10 * 60_000
    });
    if (!rateLimit.allowed) {
      throw Object.assign(new Error('Too many wallet profile requests. Try again shortly.'), { statusCode: 429 });
    }
    if (body.action === 'prepare-auth' || body.action === 'supersede-auth') {
      const guest = readGuestIdentityOrEstablish(req, res);
      if (!guest) return sendJson(res, 200, { status: 'retry' });
      const result = body.action === 'prepare-auth'
        ? await beginBrowserAuthAttempt(guest.guestId)
        : await fenceBrowserAuth(guest.guestId);
      return sendJson(res, 200, {
        status: body.action === 'prepare-auth' ? 'ready' : 'fenced',
        attemptId: result.binding?.attempt || null,
        generation: result.binding?.generation || 0
      });
    }
    if (body.action === 'adopt-auth') {
      const guest = readGuestIdentity(req);
      const attemptId = assertAttemptId(body.attemptId);
      if (!guest) throw superseded();
      const adopted = await adoptBrowserAuthAttempt(guest.guestId, attemptId);
      if (!adopted.ok || !adopted.binding?.wallet) throw superseded();
      installAuthoritativeSession(res, adopted.binding.wallet, adopted.binding, guest.guestId);
      return sendJson(res, 200, {
        walletAddress: adopted.binding.wallet,
        profile: await fetchWalletProfile(adopted.binding.wallet)
      });
    }
    if (body.action === 'release-auth') {
      const guest = readGuestIdentity(req);
      const attemptId = assertAttemptId(body.attemptId);
      if (!guest) return sendJson(res, 200, { released: false });
      const released = await releaseBrowserAuthAttempt(guest.guestId, attemptId);
      if (released.ok && released.binding?.state === 'cleared') {
        clearWalletProfileSessionCookie(res);
      }
      return sendJson(res, 200, {
        released: Boolean(released.ok && released.binding?.state === 'cleared')
      });
    }
    if (body.action === 'bootstrap') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const profile = await ensureWalletProfile(session.walletAddress);
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        profile
      });
    }
    if (body.action === 'challenge') {
      const { origin } = normalizeRequestOrigin(req);
      return sendJson(res, 200, await createWalletProfileChallenge({
        address: body.address,
        origin
      }));
    }
    if (body.action === 'authenticate') {
      return sendJson(res, 200, await authenticate(body, req, res));
    }
    if (body.action === 'start-boss-challenge') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const start = await createBossArchiveChallengeRun({
        address: session.walletAddress,
        eventId: body.eventId,
        variantId: body.variantId,
        difficultyId: body.difficultyId,
        attemptId: body.attemptId
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        profile: start.profile,
        run: start.run
      });
    }
    if (body.action === 'settle-boss-challenge') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const result = await settleBossArchiveChallengeRun({
        address: session.walletAddress,
        runToken: body.runToken,
        victory: body.victory,
        clearTimeMs: body.clearTimeMs,
        damageTaken: body.damageTaken
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        ...result
      });
    }
    if (body.action === 'start-campaign-branch') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const attempt = await createCampaignBranchAttempt({
        address: session.walletAddress,
        branchId: body.branchId
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        attempt
      });
    }
    if (body.action === 'settle-campaign-branch') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const result = await settleCampaignBranchAttempt({
        address: session.walletAddress,
        attemptToken: body.attemptToken,
        outcome: body.outcome,
        destroyedByType: body.destroyedByType,
        collectedPresentCoins: body.collectedPresentCoins,
        stageComplete: body.stageComplete,
        objectiveUnitsCompleted: body.objectiveUnitsCompleted
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        ...result
      });
    }
    if (body.action === 'link-guest') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const linked = await linkGuestWalletProfile({
        address: session.walletAddress,
        guestProfileId: body.guestProfileId,
        guestSnapshot: body.guestSnapshot
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        profile: linked.profile,
        guestLink: linked.guestLink
      });
    }
    if (body.action === 'save') {
      const session = await readAuthoritativeWalletProfileSession(req);
      const expectedWalletAddress = normalizeWalletAddress(body.walletAddress);
      if (!expectedWalletAddress || expectedWalletAddress !== session.walletAddress) {
        throw Object.assign(
          new Error('The wallet profile save does not match the authorized wallet.'),
          { statusCode: 403 }
        );
      }
      const profile = await saveWalletProfile({
        address: session.walletAddress,
        expectedRevision: body.expectedRevision,
        snapshot: body.snapshot
      });
      return sendJson(res, 200, { walletAddress: session.walletAddress, profile });
    }
    if (body.action === 'logout') {
      const guest = readGuestIdentity(req);
      if (guest) {
        // Same-browser disconnect invalidates every in-flight grant. A late
        // Set-Cookie can still arrive, but the cleared binding rejects it.
        await clearBrowserAuth(guest.guestId);
        clearWalletProfileSessionCookie(res);
        return sendJson(res, 200, { ok: true });
      }
      const session = await readAuthoritativeWalletProfileSession(req);
      const expectedWalletAddress = normalizeWalletAddress(body.walletAddress);
      if (!expectedWalletAddress || expectedWalletAddress !== session.walletAddress) {
        throw Object.assign(
          new Error('The wallet profile logout does not match the authorized wallet.'),
          { statusCode: 403 }
        );
      }
      clearWalletProfileSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'Unknown wallet profile action' });
  } catch (error) {
    console.error('Wallet profile API error:', error);
    if (error.code === 'wallet_session_superseded') {
      clearWalletProfileSessionCookie(res);
    }
    const payload = { error: error.message || 'Wallet profile request failed' };
    if (typeof error.code === 'string' && error.code) payload.code = error.code;
    if (Number.isSafeInteger(error.currentRevision)) payload.currentRevision = error.currentRevision;
    if (error.currentProfile !== undefined) payload.profile = error.currentProfile;
    return sendJson(res, error.statusCode || 500, payload);
  }
};
