const {
  assertSameOrigin,
  readWalletProfileSession
} = require('./walletProfileAuth');
const { checkRateLimit } = require('./rateLimit');
const { applyWalletTokenSpend } = require('./walletTokenSpends');

const MAX_REQUEST_BODY_BYTES = 8 * 1024;

const publicRouteError = (message, statusCode, code = '') => Object.assign(
  new Error(message),
  { statusCode, code, isPublicWalletTokenSpendError: true }
);

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw publicRouteError('The wallet Token spend request is too large.', 413);
  }
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw publicRouteError('A valid JSON body is required.', 400);
  }
};

const publicWalletTokenSpendError = (error) => {
  const statusCode = Number.isInteger(error?.statusCode)
    && error.statusCode >= 400
    && error.statusCode <= 599
    ? error.statusCode
    : 500;
  const expose = error?.isPublicWalletTokenSpendError === true;
  return {
    statusCode,
    payload: {
      error: expose && typeof error?.message === 'string' && error.message
        ? error.message
        : 'Wallet Token spend failed.',
      ...(expose && typeof error?.code === 'string' && error.code
        ? { code: error.code }
        : {})
    }
  };
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    assertSameOrigin(req);
    const session = readWalletProfileSession(req);
    const body = parseBody(req.body);
    const rateLimit = checkRateLimit(req, {
      scope: `wallet-token-spend:${session.walletAddress}`,
      limit: 60,
      windowMs: 10 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      throw publicRouteError(
        'Too many Hangar purchases. Try again shortly.',
        429,
        'wallet_token_spend_rate_limited'
      );
    }
    const settlement = await applyWalletTokenSpend({
      address: session.walletAddress,
      spendId: body.spendId,
      expectedRevision: body.expectedRevision,
      action: body.action
    });
    return sendJson(res, 200, {
      walletAddress: session.walletAddress,
      settlement
    });
  } catch (error) {
    console.error('Wallet Token spend API error:', error);
    const publicError = publicWalletTokenSpendError(error);
    return sendJson(res, publicError.statusCode, publicError.payload);
  }
};
