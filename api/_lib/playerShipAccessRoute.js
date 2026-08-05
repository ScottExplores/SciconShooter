const {
  assertSameOrigin,
  readWalletProfileSession
} = require('./walletProfileAuth');
const { checkRateLimit } = require('./rateLimit');
const {
  createPlayerShipPurchaseQuote,
  getPlayerShipAccessStatus,
  settlePlayerShipPurchase
} = require('./playerShipAccess');

const MAX_REQUEST_BODY_BYTES = 16 * 1024;

const publicRouteError = (message, statusCode, code = '') => Object.assign(
  new Error(message),
  { statusCode, code, isPublicPlayerShipAccessError: true }
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
    throw publicRouteError('The player ship access request is too large.', 413);
  }
  try {
    return typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw publicRouteError('A valid JSON body is required.', 400);
  }
};

const publicPlayerShipAccessError = (error) => {
  const statusCode = Number.isInteger(error?.statusCode)
    && error.statusCode >= 400
    && error.statusCode <= 599
    ? error.statusCode
    : 500;
  const expose = error?.isPublicPlayerShipAccessError === true;
  return {
    statusCode,
    payload: {
      error: expose && typeof error?.message === 'string' && error.message
        ? error.message
        : 'Player ship access request failed.',
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
    const action = String(body.action || '');
    const rateLimit = checkRateLimit(req, {
      scope: `player-ship-access:${action || 'unknown'}:${session.walletAddress}`,
      limit: action === 'settle' ? 12 : 30,
      windowMs: 10 * 60 * 1000
    });
    if (!rateLimit.allowed) {
      throw publicRouteError(
        'Too many player ship access requests. Try again shortly.',
        429,
        'player_ship_access_rate_limited'
      );
    }
    if (action === 'status') {
      const access = await getPlayerShipAccessStatus({ address: session.walletAddress });
      return sendJson(res, 200, { walletAddress: session.walletAddress, access });
    }
    if (action === 'quote') {
      const quote = await createPlayerShipPurchaseQuote({
        address: session.walletAddress,
        skuId: body.skuId
      });
      return sendJson(res, 200, { walletAddress: session.walletAddress, quote });
    }
    if (action === 'settle') {
      const settlement = await settlePlayerShipPurchase({
        address: session.walletAddress,
        quoteToken: body.quoteToken,
        transactionHash: body.transactionHash
      });
      return sendJson(res, 200, { walletAddress: session.walletAddress, settlement });
    }
    return sendJson(res, 400, {
      error: 'Unknown player ship access action.',
      code: 'player_ship_access_action_invalid'
    });
  } catch (error) {
    console.error('Player ship access API error:', error);
    const publicError = publicPlayerShipAccessError(error);
    return sendJson(res, publicError.statusCode, publicError.payload);
  }
};
