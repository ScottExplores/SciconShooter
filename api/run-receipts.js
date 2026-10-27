const { createReservedRunStart, finishRun } = require('./_lib/runReceipts');
const { checkRateLimit } = require('./_lib/rateLimit');
const {
  deriveGuestWeeklyAdmissionScope,
  readGuestIdentityOrEstablish
} = require('./_lib/guestIdentity');
const {
  assertSameOrigin,
  clearWalletProfileSessionCookie,
  normalizeWalletAddress,
  readOptionalWalletProfileSession
} = require('./_lib/walletProfileAuth');
const { isFounderWalletAddress } = require('./_lib/founderWallet');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }
  return typeof body === 'object' && !Array.isArray(body) ? body : {};
};

module.exports = async (req, res) => {
  try {
    assertSameOrigin(req);
  } catch (error) {
    return sendJson(res, error.statusCode || 403, { error: error.message });
  }
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  const body = parseBody(req.body);
  try {
    const rate = checkRateLimit(req, {
      scope: body.action === 'finish' ? 'run-finish' : 'run-start',
      limit: body.action === 'finish' ? 45 : 30,
      windowMs: 10 * 60 * 1000
    });
    if (!rate.allowed) return sendJson(res, 429, { error: 'Too many run requests. Please wait before trying again.' });
    if (body.action === 'prepare-guest') {
      const identity = readGuestIdentityOrEstablish(req, res);
      return sendJson(res, 200, identity
        ? { ready: true }
        : {
          ready: false,
          code: 'GUEST_SESSION_REQUIRED'
        });
    }
    if (body.action === 'start') {
      let walletSession = null;
      const walletIntentProvided = body.walletAddress !== null
        && body.walletAddress !== undefined;
      const requestedWalletAddress = walletIntentProvided
        ? normalizeWalletAddress(body.walletAddress)
        : null;
      if (walletIntentProvided && !requestedWalletAddress) {
        throw Object.assign(new Error('A valid Base wallet address is required for wallet-attributed play.'), {
          statusCode: 400,
          code: 'RUN_WALLET_INTENT_INVALID'
        });
      }
      if (requestedWalletAddress) {
        try {
          walletSession = readOptionalWalletProfileSession(req);
        } catch (error) {
          if (error?.statusCode !== 401) throw error;
          clearWalletProfileSessionCookie(res);
          throw Object.assign(new Error('Reconnect this Base Account before starting the run.'), {
            statusCode: 401,
            code: 'RUN_WALLET_SESSION_REQUIRED'
          });
        }
        if (!walletSession) {
          throw Object.assign(new Error('Reconnect this Base Account before starting the run.'), {
            statusCode: 401,
            code: 'RUN_WALLET_SESSION_REQUIRED'
          });
        }
        if (walletSession.walletAddress !== requestedWalletAddress) {
          throw Object.assign(new Error('The active Base Account changed while the run was starting. Please try again.'), {
            statusCode: 409,
            code: 'RUN_WALLET_SESSION_MISMATCH'
          });
        }
      }
      if (body.testRun && !isFounderWalletAddress(requestedWalletAddress)) {
        throw Object.assign(new Error('Pilot Test runs require the authorized project Base Account.'), {
          statusCode: 403,
          code: 'PILOT_TEST_RUN_FORBIDDEN'
        });
      }
      // A null wallet intent is authoritative guest intent. Deliberately
      // ignore any retained wallet cookie so disconnecting never attributes a
      // later guest flight to the previous account.
      const guestIdentity = requestedWalletAddress
        ? null
        : readGuestIdentityOrEstablish(req, res);
      if (!walletSession && !guestIdentity) {
        return sendJson(res, 428, {
          error: 'Guest play is ready. Retrying the run start now.',
          code: 'GUEST_SESSION_REQUIRED'
        });
      }
      return sendJson(res, 200, await createReservedRunStart(body.gameVersion, {
        testRun: body.testRun === true,
        playerShipId: body.playerShipId,
        runMode: body.runMode,
        guestAdmissionScope: guestIdentity && body.runMode === 'weekly-streak'
          ? deriveGuestWeeklyAdmissionScope(req)
          : null,
        guestIdentityId: guestIdentity?.guestId,
        walletSession,
        weeklyCampaignProof: body.weeklyCampaignProof
      }));
    }
    if (body.action === 'finish') {
      const receipt = await finishRun(body.startToken, body.metrics, req);
      return sendJson(res, 200, { receipt });
    }
    return sendJson(res, 400, { error: 'Unknown run receipt action' });
  } catch (error) {
    const nestedAnomalies = Array.isArray(error?.details?.anomalies)
      ? error.details.anomalies
      : Array.isArray(error?.details)
        ? error.details
        : [];
    console.error('Run receipt API error:', {
      action: typeof body.action === 'string' ? body.action : 'unknown',
      runMode: typeof body.runMode === 'string'
        ? body.runMode
        : typeof body.metrics?.weeklyCampaignProof === 'object'
          ? 'weekly-streak'
          : 'unknown',
      statusCode: error?.statusCode || 500,
      message: error?.message || 'Run receipt failed',
      anomalies: nestedAnomalies.map(String).slice(0, 12)
    });
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Run receipt failed',
      details: error.details,
      ...(error?.code ? { code: error.code } : {})
    });
  }
};
