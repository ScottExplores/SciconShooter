const crypto = require('crypto');
const {
  hasSupabaseConfig,
  supabaseHeaders,
  supabaseUrl
} = require('./supabase');
const { checkRateLimit } = require('./rateLimit');
const {
  assertSameOrigin,
  readOptionalWalletProfileSession
} = require('./walletProfileAuth');
const { readAuthoritativeWalletProfileSession } = require('./browserWalletAuth');
const { isFounderWalletAddress } = require('./founderWallet');

const RATINGS_TABLE = process.env.SUPABASE_PLAYER_RATINGS_TABLE || 'scicon_player_ratings';
const PROFILES_TABLE = process.env.SUPABASE_WALLET_PROFILES_TABLE || 'scicon_wallet_profiles';
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const MAX_COMMENT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const APP_VERSION_PATTERN = /^[a-z0-9._-]{1,64}$/i;
const ACTIONS = new Set(['status', 'acknowledge', 'submit']);

const apiError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  ...(code ? { code } : {})
});

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const requestBodySize = (body) => {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  try {
    return Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
  } catch {
    throw apiError('A valid JSON body is required.', 400, 'RATING_INVALID_JSON');
  }
};

const parseBody = (body) => {
  if (requestBodySize(body) > MAX_REQUEST_BODY_BYTES) {
    throw apiError('The player rating is too large.', 413, 'RATING_TOO_LARGE');
  }
  if (typeof body !== 'string') {
    if (!isPlainObject(body)) throw apiError('A JSON object is required.', 400, 'RATING_INVALID_JSON');
    return body;
  }
  try {
    const parsed = JSON.parse(body);
    if (!isPlainObject(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw apiError('A valid JSON object is required.', 400, 'RATING_INVALID_JSON');
  }
};

const trimComment = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw apiError('Comment must be text.', 400, 'RATING_INVALID_COMMENT');
  }
  const trimmed = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, '[redacted_private_value]')
    .replace(/\b0x[a-f0-9]{40}\b/gi, '[redacted_wallet]')
    .replace(/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[redacted_token]')
    .replace(/\b(?:bearer\s+)[a-z0-9._~+\/-]{8,}/gi, 'Bearer [redacted]')
    .trim()
    .slice(0, MAX_COMMENT_LENGTH);
  return trimmed || null;
};

const hashAnonymousPlayerId = (anonymousPlayerId) => {
  if (typeof anonymousPlayerId !== 'string' || !UUID_PATTERN.test(anonymousPlayerId)) {
    throw apiError('A device id is required.', 400, 'RATING_INVALID_DEVICE');
  }
  const secret = String(
    process.env.PRODUCT_ANALYTICS_HASH_SECRET
    || process.env.RUN_RECEIPT_SECRET
    || ''
  ).trim();
  if (!secret) {
    throw apiError('Player rating storage is temporarily unavailable.', 503, 'RATING_STORAGE_UNAVAILABLE');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`scicon-player-rating:v1:${anonymousPlayerId.toLowerCase()}`)
    .digest('hex');
};

const requireStorage = () => {
  if (!hasSupabaseConfig()) {
    throw apiError('Player rating storage is temporarily unavailable.', 503, 'RATING_STORAGE_UNAVAILABLE');
  }
};

const supabaseRequest = async (path, options = {}) => {
  const response = await fetch(supabaseUrl(path), {
    ...options,
    headers: supabaseHeaders(options.headers || {})
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { ok: response.ok, status: response.status, data, text };
};

const duplicateResult = (result) => (
  result.status === 409
  || (typeof result.text === 'string' && /23505|duplicate key/i.test(result.text))
);

const readSignedWallet = (req) => {
  try {
    return readOptionalWalletProfileSession(req)?.walletAddress || null;
  } catch {
    return null;
  }
};

const readWalletSession = async (req) => {
  try {
    const session = await readAuthoritativeWalletProfileSession(req);
    return session?.walletAddress || null;
  } catch {
    return null;
  }
};

const readProfileShown = async (walletAddress) => {
  const result = await supabaseRequest(
    `${PROFILES_TABLE}?select=mission_feedback_shown&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`
  );
  if (!result.ok) {
    throw apiError('Player rating status is unavailable.', 502, 'RATING_PROFILE_UNAVAILABLE');
  }
  const row = Array.isArray(result.data) ? result.data[0] : null;
  return row?.mission_feedback_shown === true;
};

const markProfileShown = async (walletAddress) => {
  const result = await supabaseRequest(
    `${PROFILES_TABLE}?wallet_address=eq.${encodeURIComponent(walletAddress)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ mission_feedback_shown: true })
    }
  );
  if (!result.ok) {
    throw apiError('Player rating status could not be saved.', 502, 'RATING_PROFILE_UNAVAILABLE');
  }
  return Array.isArray(result.data) && result.data.length > 0;
};

const findExistingRating = async ({ deviceHash, walletAddress }) => {
  const filters = [`anonymous_player_id.eq.${deviceHash}`];
  if (walletAddress) filters.push(`wallet_address.eq.${walletAddress}`);
  const filter = filters.length === 1
    ? `anonymous_player_id=eq.${deviceHash}`
    : `or=(${filters.join(',')})`;
  const result = await supabaseRequest(
    `${RATINGS_TABLE}?select=id&${filter}&limit=1`
  );
  if (!result.ok) {
    throw apiError('Player rating storage is unavailable.', 502, 'RATING_STORAGE_UNAVAILABLE');
  }
  return Array.isArray(result.data) && result.data.length > 0;
};

const insertRating = async (row) => {
  const result = await supabaseRequest(RATINGS_TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (result.ok) return { duplicate: false };
  if (duplicateResult(result)) return { duplicate: true };
  console.error('Player rating storage failed', result.status);
  throw apiError('Player rating storage is unavailable.', 502, 'RATING_STORAGE_UNAVAILABLE');
};

const validateSubmission = (body) => {
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
    throw apiError('Rating must be a whole number from 1 to 5.', 400, 'RATING_INVALID');
  }
  if (typeof body.missionId !== 'string' || !MISSION_ID_PATTERN.test(body.missionId)) {
    throw apiError('Mission id is invalid.', 400, 'RATING_INVALID_MISSION');
  }
  if (typeof body.appVersion !== 'string' || !APP_VERSION_PATTERN.test(body.appVersion)) {
    throw apiError('App version is invalid.', 400, 'RATING_INVALID_VERSION');
  }
  return {
    rating: body.rating,
    comment: trimComment(body.comment),
    missionId: body.missionId,
    appVersion: body.appVersion,
    deviceHash: hashAnonymousPlayerId(body.anonymousPlayerId)
  };
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    assertSameOrigin(req, { required: true, matchProtocol: true });
    const body = parseBody(req.body);
    if (!ACTIONS.has(body.action)) {
      throw apiError('Unknown player rating action.', 400, 'RATING_UNKNOWN_ACTION');
    }
    const rateLimit = checkRateLimit(req, {
      scope: 'player-ratings',
      limit: RATE_LIMIT_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      return sendJson(res, 429, { error: 'Too many rating requests. Try again shortly.', code: 'RATING_RATE_LIMIT' });
    }

    const walletAddress = await readWalletSession(req);
    const signedWallet = readSignedWallet(req);
    const founderRun = isFounderWalletAddress(walletAddress) || isFounderWalletAddress(signedWallet);

    if (body.action === 'status') {
      if (!walletAddress) return sendJson(res, 200, { shown: false, wallet: false });
      requireStorage();
      return sendJson(res, 200, {
        shown: await readProfileShown(walletAddress),
        wallet: true
      });
    }

    if (body.action === 'acknowledge') {
      if (!walletAddress) return sendJson(res, 200, { ok: true, shown: false, wallet: false });
      requireStorage();
      const shown = await markProfileShown(walletAddress);
      return sendJson(res, 200, { ok: true, shown, wallet: true });
    }

    requireStorage();
    const submission = validateSubmission(body);
    const storedWallet = walletAddress;
    const existing = await findExistingRating({
      deviceHash: submission.deviceHash,
      walletAddress: storedWallet
    });
    if (!existing) {
      const inserted = await insertRating({
        rating: submission.rating,
        comment: submission.comment,
        wallet_address: storedWallet,
        anonymous_player_id: submission.deviceHash,
        mission_id: submission.missionId,
        app_version: submission.appVersion,
        is_test: founderRun
      });
      if (inserted.duplicate) {
        if (storedWallet) {
          try { await markProfileShown(storedWallet); } catch { /* rating already stored */ }
        }
        return sendJson(res, 200, { accepted: true, stored: false, duplicate: true });
      }
    }
    if (storedWallet) {
      try { await markProfileShown(storedWallet); } catch { /* local flag still hides the card */ }
    }
    console.info('Player rating accepted', {
      rating: submission.rating,
      missionId: submission.missionId,
      duplicate: existing,
      test: founderRun
    });
    return sendJson(res, existing ? 200 : 201, {
      accepted: true,
      stored: !existing,
      duplicate: existing
    });
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    return sendJson(res, status, {
      error: status >= 500 ? 'Player rating storage is unavailable.' : error.message,
      ...(error.code ? { code: error.code } : {})
    });
  }
};

module.exports._test = {
  hashAnonymousPlayerId,
  trimComment,
  MAX_COMMENT_LENGTH
};
