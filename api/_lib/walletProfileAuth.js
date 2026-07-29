const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'scicon_wallet_profile_session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_TYPE = 'scicon-wallet-profile-session-v1';

const normalizeWalletAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const walletProfileId = (address) => {
  const normalized = normalizeWalletAddress(address);
  if (!normalized) throw Object.assign(new Error('A valid Base wallet address is required.'), { statusCode: 400 });
  return `wallet:${normalized}`;
};

const getWalletProfileAuthSecret = () => {
  const secret = String(process.env.WALLET_PROFILE_AUTH_SECRET || '').trim();
  if (secret && (secret.length >= 32 || process.env.NODE_ENV === 'test')) return secret;
  if (secret) throw new Error('WALLET_PROFILE_AUTH_SECRET must be at least 32 characters.');
  if (process.env.NODE_ENV === 'test') return 'scicon-wallet-profile-tests-only';
  throw new Error('WALLET_PROFILE_AUTH_SECRET is not configured.');
};

const encodePayload = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');

const signEncodedPayload = (encoded) => crypto
  .createHmac('sha256', getWalletProfileAuthSecret())
  .update(`${SESSION_TOKEN_TYPE}.${encoded}`)
  .digest('base64url');

const createWalletProfileSession = (
  address,
  now = Date.now(),
  lifetimeMs = SESSION_LIFETIME_MS
) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw Object.assign(new Error('A valid Base wallet address is required.'), { statusCode: 400 });
  const issuedAt = Math.floor(Number(now));
  const expiresAt = issuedAt + Math.max(60_000, Math.floor(Number(lifetimeMs) || SESSION_LIFETIME_MS));
  const encoded = encodePayload({
    type: SESSION_TOKEN_TYPE,
    walletAddress,
    issuedAt,
    expiresAt,
    sessionId: crypto.randomUUID()
  });
  return `${encoded}.${signEncodedPayload(encoded)}`;
};

const verifyWalletProfileSession = (token, now = Date.now()) => {
  if (typeof token !== 'string') throw Object.assign(new Error('Wallet profile authorization is required.'), { statusCode: 401 });
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw Object.assign(new Error('Wallet profile authorization is invalid.'), { statusCode: 401 });
  }

  const [encoded, signature] = parts;
  const expected = signEncodedPayload(encoded);
  const signatureBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    signatureBytes.length !== expectedBytes.length
    || !crypto.timingSafeEqual(signatureBytes, expectedBytes)
  ) {
    throw Object.assign(new Error('Wallet profile authorization is invalid.'), { statusCode: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Wallet profile authorization is invalid.'), { statusCode: 401 });
  }
  const walletAddress = normalizeWalletAddress(payload.walletAddress);
  if (
    payload.type !== SESSION_TOKEN_TYPE
    || !walletAddress
    || !Number.isFinite(payload.issuedAt)
    || !Number.isFinite(payload.expiresAt)
    || payload.expiresAt <= Number(now)
  ) {
    throw Object.assign(new Error('Wallet profile authorization has expired.'), { statusCode: 401 });
  }
  return {
    walletAddress,
    profileId: walletProfileId(walletAddress),
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
    sessionId: String(payload.sessionId || '')
  };
};

const parseCookies = (value) => {
  const cookies = {};
  String(value || '').split(';').forEach((entry) => {
    const separator = entry.indexOf('=');
    if (separator < 1) return;
    const key = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1).trim();
    if (!key) return;
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  });
  return cookies;
};

const readWalletProfileSessionToken = (req) => (
  parseCookies(req?.headers?.cookie)[SESSION_COOKIE_NAME]
);

const readWalletProfileSession = (req, now = Date.now()) => {
  const token = readWalletProfileSessionToken(req);
  return verifyWalletProfileSession(token, now);
};

const readOptionalWalletProfileSession = (req, now = Date.now()) => {
  const token = readWalletProfileSessionToken(req);
  return token ? verifyWalletProfileSession(token, now) : null;
};

const sessionCookie = (token, maxAgeSeconds, path = '/api') => [
  `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
  `Path=${path}`,
  `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  'HttpOnly',
  'Secure',
  'SameSite=Lax'
].join('; ');

const setWalletProfileSessionCookie = (res, token) => {
  res.setHeader('Set-Cookie', [
    sessionCookie('', 0, '/api/wallet-profile'),
    sessionCookie(token, SESSION_LIFETIME_MS / 1000)
  ]);
};

const clearWalletProfileSessionCookie = (res) => {
  res.setHeader('Set-Cookie', [
    sessionCookie('', 0, '/api/wallet-profile'),
    sessionCookie('', 0)
  ]);
};

const normalizeRequestOrigin = (req) => {
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const requestHost = forwardedHost || String(req?.headers?.host || '').trim();
  const host = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(requestHost)
    ? requestHost.toLowerCase()
    : 'www.sciconshooter.xyz';
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  return { host, origin: `${protocol}://${host}` };
};

const assertSameOrigin = (req) => {
  const rawOrigin = String(req?.headers?.origin || '').trim();
  if (!rawOrigin) return;
  let origin;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw Object.assign(new Error('The request origin is invalid.'), { statusCode: 403 });
  }
  const expected = normalizeRequestOrigin(req);
  if (origin.host.toLowerCase() !== expected.host) {
    throw Object.assign(new Error('The request origin is not allowed.'), { statusCode: 403 });
  }
};

const makeWalletProfileMessage = ({
  address,
  challengeId,
  expiresAt,
  origin = 'https://www.sciconshooter.xyz'
}) => {
  const walletAddress = normalizeWalletAddress(address);
  if (!walletAddress) throw Object.assign(new Error('A valid Base wallet address is required.'), { statusCode: 400 });
  const parsedOrigin = new URL(origin);
  return [
    'Scicon Shooter wallet profile authorization',
    '',
    `Domain: ${parsedOrigin.host}`,
    `URI: ${parsedOrigin.origin}`,
    `Wallet: ${walletAddress}`,
    'Chain ID: 8453',
    `Challenge: ${challengeId}`,
    `Expires: ${expiresAt}`,
    '',
    'Sign to load and save this wallet profile across devices.',
    'This gas-free signature does not spend funds or submit a transaction.'
  ].join('\n');
};

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  assertSameOrigin,
  clearWalletProfileSessionCookie,
  createWalletProfileSession,
  getWalletProfileAuthSecret,
  makeWalletProfileMessage,
  normalizeRequestOrigin,
  normalizeWalletAddress,
  parseCookies,
  readOptionalWalletProfileSession,
  readWalletProfileSession,
  readWalletProfileSessionToken,
  setWalletProfileSessionCookie,
  verifyWalletProfileSession,
  walletProfileId
};
