const { verifyBaseMessage } = require('./baseSignatures');
const {
  assertSameOrigin,
  clearWalletProfileSessionCookie,
  createWalletProfileSession,
  normalizeRequestOrigin,
  normalizeWalletAddress,
  readWalletProfileSession,
  readWalletProfileSessionToken,
  setWalletProfileSessionCookie
} = require('./walletProfileAuth');
const {
  consumeWalletProfileChallenge,
  createWalletProfileChallenge,
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
      const session = readWalletProfileSession(req);
      // Reissue legacy path-scoped sessions at /api so authenticated metadata
      // can be consumed safely by sibling APIs such as leaderboard submission.
      setWalletProfileSessionCookie(res, readWalletProfileSessionToken(req));
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
      const session = readWalletProfileSession(req);
      const run = await createBossArchiveChallengeRun({
        address: session.walletAddress,
        eventId: body.eventId,
        variantId: body.variantId
      });
      return sendJson(res, 200, {
        walletAddress: session.walletAddress,
        run
      });
    }
    if (body.action === 'settle-boss-challenge') {
      const session = readWalletProfileSession(req);
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
      const session = readWalletProfileSession(req);
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
      const session = readWalletProfileSession(req);
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
    if (body.action === 'save') {
      const session = readWalletProfileSession(req);
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
      const session = readWalletProfileSession(req);
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
    const payload = { error: error.message || 'Wallet profile request failed' };
    if (typeof error.code === 'string' && error.code) payload.code = error.code;
    if (Number.isSafeInteger(error.currentRevision)) payload.currentRevision = error.currentRevision;
    if (error.currentProfile !== undefined) payload.profile = error.currentProfile;
    return sendJson(res, error.statusCode || 500, payload);
  }
};
