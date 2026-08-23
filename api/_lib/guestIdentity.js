const crypto = require('crypto');
const { getClientAddress } = require('./rateLimit');

const GUEST_COOKIE_NAME = 'scicon_guest_session';
const GUEST_SESSION_TYPE = 'scicon-guest-session-v1';
const GUEST_SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

const getGuestIdentitySecret = () => {
  const secret = String(
    process.env.RUN_RECEIPT_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.CRON_SECRET
    || ''
  );
  if (!secret) throw new Error('RUN_RECEIPT_SECRET is not configured.');
  return secret;
};

const parseCookies = (value) => {
  const cookies = {};
  String(value || '').split(';').forEach((entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) return;
    const name = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1).trim();
    if (!name) return;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  });
  return cookies;
};

const signEncoded = (encoded) => crypto
  .createHmac('sha256', getGuestIdentitySecret())
  .update(`${GUEST_SESSION_TYPE}.${encoded}`)
  .digest('base64url');

const createGuestIdentityToken = (now = Date.now()) => {
  const issuedAt = Math.floor(Number(now));
  const payload = {
    type: GUEST_SESSION_TYPE,
    guestId: crypto.randomUUID(),
    issuedAt,
    expiresAt: issuedAt + GUEST_SESSION_LIFETIME_MS
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signEncoded(encoded)}`;
};

const verifyGuestIdentityToken = (token, now = Date.now()) => {
  if (typeof token !== 'string') throw new Error('Guest identity is unavailable.');
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Guest identity is invalid.');
  const [encoded, signature] = parts;
  const expected = signEncoded(encoded);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(signatureBytes, expectedBytes)
  ) throw new Error('Guest identity is invalid.');

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Guest identity is invalid.');
  }
  if (
    payload?.type !== GUEST_SESSION_TYPE
    || !/^[0-9a-f-]{36}$/i.test(String(payload.guestId || ''))
    || !Number.isFinite(payload.issuedAt)
    || !Number.isFinite(payload.expiresAt)
    || payload.expiresAt <= Number(now)
  ) throw new Error('Guest identity has expired.');
  return {
    guestId: String(payload.guestId).toLowerCase(),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt
  };
};

const requestIsSecure = (req) => {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return process.env.NODE_ENV === 'production'
    || forwardedProto === 'https'
    || Boolean(req?.socket?.encrypted);
};

const guestCookie = (token, req) => [
  `${GUEST_COOKIE_NAME}=${encodeURIComponent(token)}`,
  'Path=/api',
  `Max-Age=${Math.floor(GUEST_SESSION_LIFETIME_MS / 1000)}`,
  'HttpOnly',
  ...(requestIsSecure(req) ? ['Secure'] : []),
  'SameSite=Lax'
].join('; ');

const appendSetCookie = (res, value) => {
  const existing = typeof res.getHeader === 'function'
    ? res.getHeader('Set-Cookie')
    : res?.headers?.['Set-Cookie'];
  const values = Array.isArray(existing)
    ? [...existing, value]
    : existing
      ? [existing, value]
      : [value];
  res.setHeader('Set-Cookie', values);
};

const normalizeDeviceHeader = (value, maxLength = 512) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ')
  // Browser and operating-system point releases should not reset a guest's
  // weekly quota. Keep model/platform words while coarsening version numbers.
  .replace(/\bv\s*=\s*"?\d+(?:[._-]\d+)*"?/g, 'v=#')
  .replace(/\d+(?:[._-]\d+)+/g, '#')
  .slice(0, maxLength);

/**
 * Produces a server-only, privacy-preserving quota scope that survives a
 * deleted/rotated guest cookie. The random signed cookie remains the receipt
 * owner; this digest is used only to count ranked Weekly Run admissions.
 */
const deriveGuestWeeklyAdmissionScope = (req) => {
  const clientAddress = getClientAddress(req);
  if (process.env.NODE_ENV === 'production' && clientAddress === 'unknown') {
    const error = new Error('Weekly Run guest admission is temporarily unavailable. Please retry shortly.');
    error.statusCode = 503;
    error.details = ['weekly_guest_admission_scope_unavailable'];
    throw error;
  }
  const deviceSignals = [
    normalizeDeviceHeader(req?.headers?.['user-agent']),
    normalizeDeviceHeader(req?.headers?.['sec-ch-ua']),
    normalizeDeviceHeader(req?.headers?.['sec-ch-ua-mobile'], 16),
    normalizeDeviceHeader(req?.headers?.['sec-ch-ua-platform'], 64)
  ];
  return crypto
    .createHmac('sha256', getGuestIdentitySecret())
    .update(JSON.stringify({
      type: 'scicon-weekly-guest-admission-v1',
      network: clientAddress.toLowerCase(),
      device: deviceSignals
    }))
    .digest('hex');
};

/**
 * Returns a verified server-owned guest ID, or establishes the cookie and
 * returns null. The caller must not reserve anything in the null case: this
 * two-phase handshake keeps a lost first response from creating an attempt
 * under an identity the browser never received.
 */
const readGuestIdentityOrEstablish = (req, res, now = Date.now()) => {
  const token = parseCookies(req?.headers?.cookie)[GUEST_COOKIE_NAME];
  if (token) {
    try {
      return verifyGuestIdentityToken(token, now);
    } catch {
      // Replace tampered/expired cookies, but do not consume a run admission
      // until the replacement returns on a subsequent request.
    }
  }
  appendSetCookie(res, guestCookie(createGuestIdentityToken(now), req));
  return null;
};

const readGuestIdentity = (req, now = Date.now()) => {
  const token = parseCookies(req?.headers?.cookie)[GUEST_COOKIE_NAME];
  if (!token) return null;
  try {
    return verifyGuestIdentityToken(token, now);
  } catch {
    return null;
  }
};

module.exports = {
  GUEST_COOKIE_NAME,
  GUEST_SESSION_LIFETIME_MS,
  createGuestIdentityToken,
  deriveGuestWeeklyAdmissionScope,
  readGuestIdentity,
  readGuestIdentityOrEstablish,
  verifyGuestIdentityToken
};
