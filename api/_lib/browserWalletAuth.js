const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { readGuestIdentity } = require('./guestIdentity');
const {
  normalizeWalletAddress,
  readWalletProfileSessionToken,
  verifyWalletProfileSession,
  walletProfileId
} = require('./walletProfileAuth');

const CHALLENGES_TABLE = process.env.SUPABASE_WALLET_PROFILE_CHALLENGES_TABLE
  || 'scicon_wallet_profile_challenges';
const BINDING_PREFIX = 'scicon-browser-auth-v1';
const ZERO_WALLET = '0x0000000000000000000000000000000000000000';
const BINDING_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const PENDING_ATTEMPT_TTL_MS = 10 * 60 * 1000;
const MAX_CAS_ATTEMPTS = 8;
const ATTEMPT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const browserAuthError = (message, statusCode, code) => Object.assign(
  new Error(message),
  { statusCode, code }
);

const browserAuthChallengeId = (guestId) => {
  const hash = crypto.createHash('sha1').update(`${BINDING_PREFIX}:${guestId}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const token = (value) => (value ? String(value) : '-');

const encodeBinding = (binding) => [
  BINDING_PREFIX,
  `gen=${binding.generation}`,
  `state=${binding.state}`,
  `wallet=${binding.wallet || ZERO_WALLET}`,
  `attempt=${token(binding.attempt)}`,
  `bound=${token(binding.boundAttempt)}`,
  `grant=${token(binding.grantAttempt)}`,
  `grantWallet=${binding.grantWallet || ZERO_WALLET}`,
  `session=${Number.isSafeInteger(binding.sessionGeneration) ? binding.sessionGeneration : 0}`,
  `attemptExp=${Number.isSafeInteger(binding.attemptExpiresAt) ? binding.attemptExpiresAt : 0}`
].join(' ');

const fromToken = (value) => (value && value !== '-' ? value : null);

const decodeBinding = (row) => {
  const message = String(row?.message || '');
  if (!message.startsWith(`${BINDING_PREFIX} `)) return null;
  const fields = Object.fromEntries(message.split(' ').slice(1).map((part) => {
    const separator = part.indexOf('=');
    return [part.slice(0, separator), part.slice(separator + 1)];
  }));
  const generation = Number(fields.gen);
  const wallet = normalizeWalletAddress(fields.wallet);
  const grantWallet = normalizeWalletAddress(fields.grantWallet);
  const explicitSession = Number(fields.session);
  if (!Number.isSafeInteger(generation) || generation < 1) return null;
  if (!['open', 'bound', 'cleared'].includes(fields.state)) return null;
  return {
    generation,
    sessionGeneration: Number.isSafeInteger(explicitSession) && explicitSession >= 0
      ? explicitSession
      : generation,
    state: fields.state,
    wallet: wallet && wallet !== ZERO_WALLET ? wallet : null,
    attempt: fromToken(fields.attempt),
    attemptExpiresAt: Number.isSafeInteger(Number(fields.attemptExp)) && Number(fields.attemptExp) > 0
      ? Number(fields.attemptExp)
      : null,
    boundAttempt: fromToken(fields.bound),
    grantAttempt: fromToken(fields.grant),
    grantWallet: grantWallet && grantWallet !== ZERO_WALLET ? grantWallet : null,
    rawMessage: message
  };
};

const rowBody = (guestId, binding, now) => ({
  challenge_id: browserAuthChallengeId(guestId),
  wallet_address: binding.wallet || ZERO_WALLET,
  message: encodeBinding(binding),
  expires_at: new Date(Number(now) + BINDING_LIFETIME_MS).toISOString()
});

const readBrowserAuth = async (guestId) => {
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?select=challenge_id,wallet_address,message,expires_at&challenge_id=eq.${encodeURIComponent(browserAuthChallengeId(guestId))}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const binding = decodeBinding(row);
  if (!binding) {
    throw browserAuthError(
      'Browser wallet session storage is unavailable.',
      503,
      'browser_auth_unavailable'
    );
  }
  return binding;
};

const insertBrowserAuth = async (guestId, binding, now) => {
  try {
    const rows = await fetchSupabaseJson(`${CHALLENGES_TABLE}?on_conflict=challenge_id`, {
      method: 'POST',
      headers: supabaseHeaders({
        Prefer: 'resolution=ignore-duplicates,return=representation'
      }),
      body: JSON.stringify(rowBody(guestId, binding, now))
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return row ? decodeBinding(row) : null;
  } catch (error) {
    if (/409|23505|duplicate/i.test(String(error?.message || ''))) return null;
    throw error;
  }
};

const swapBrowserAuth = async (guestId, previousMessage, binding, now) => {
  const rows = await fetchSupabaseJson(
    `${CHALLENGES_TABLE}?challenge_id=eq.${encodeURIComponent(browserAuthChallengeId(guestId))}&message=eq.${encodeURIComponent(previousMessage)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        wallet_address: binding.wallet || ZERO_WALLET,
        message: encodeBinding(binding),
        expires_at: new Date(Number(now) + BINDING_LIFETIME_MS).toISOString()
      })
    }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? decodeBinding(row) : null;
};

const decide = async (guestId, recipe, now = Date.now()) => {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await readBrowserAuth(guestId);
    const decision = recipe(current);
    if (decision.type === 'reject') {
      return { ok: false, applied: false, cleared: false, binding: current };
    }
    if (decision.type === 'unchanged') {
      return { ok: true, applied: false, cleared: false, binding: current };
    }
    const written = current
      ? await swapBrowserAuth(guestId, current.rawMessage, decision.binding, now)
      : await insertBrowserAuth(guestId, decision.binding, now);
    if (written) {
      return {
        ok: true,
        applied: true,
        cleared: decision.cleared === true,
        preservedAttempt: decision.preservedAttempt === true,
        binding: written
      };
    }
  }
  throw browserAuthError(
    'Browser wallet session changed. Retry the connection.',
    409,
    'wallet_attempt_superseded'
  );
};

const keptSession = (current) => ({
  sessionGeneration: current?.sessionGeneration || 0,
  ...(current?.state === 'bound' && current.wallet
    ? {
      state: 'bound',
      wallet: current.wallet,
      boundAttempt: current.boundAttempt
    }
    : {
      state: current?.state === 'cleared' ? 'cleared' : 'open',
      wallet: null,
      boundAttempt: null
    })
});

const describePendingAttempt = (binding, now = Date.now()) => {
  if (!binding?.attempt) {
    return { attemptId: null, expiresAt: null, expired: false };
  }
  const expiresAt = binding.attemptExpiresAt || null;
  return {
    attemptId: binding.attempt,
    expiresAt,
    expired: !expiresAt || expiresAt <= now
  };
};

const pendingSlotBlocksReplacement = (binding, replacing, now) => {
  const pending = describePendingAttempt(binding, now);
  return Boolean(pending.attemptId && !pending.expired && pending.attemptId !== replacing);
};

/**
 * Install a new attempt only when it replaces the attempt the client observed.
 * A delayed prepare whose observed attempt is no longer current does not write.
 */
const beginBrowserAuthAttempt = (guestId, { replacesAttemptId = null } = {}, now = Date.now()) => (
  decide(guestId, (current) => {
    const replacing = replacesAttemptId || null;
    if (!current) {
      if (replacing) return { type: 'reject' };
      return {
        type: 'write',
        binding: {
          generation: 1,
          sessionGeneration: 0,
          state: 'open',
          wallet: null,
          attempt: crypto.randomUUID(),
          attemptExpiresAt: now + PENDING_ATTEMPT_TTL_MS,
          boundAttempt: null,
          grantAttempt: null,
          grantWallet: null
        }
      };
    }
    if (pendingSlotBlocksReplacement(current, replacing, now)) return { type: 'reject' };
    const kept = keptSession(current);
    return {
      type: 'write',
      binding: {
        generation: current.generation + 1,
        sessionGeneration: kept.sessionGeneration,
        state: kept.state === 'cleared' ? 'open' : kept.state,
        wallet: kept.state === 'bound' ? kept.wallet : null,
        attempt: crypto.randomUUID(),
        attemptExpiresAt: now + PENDING_ATTEMPT_TTL_MS,
        boundAttempt: kept.state === 'bound' ? kept.boundAttempt : null,
        grantAttempt: null,
        grantWallet: null
      }
    };
  }, now)
);

/**
 * Drop one attempt's pending slot and grant. A fence for an attempt that is
 * no longer current is a no-op, including when a newer attempt has already
 * been prepared, granted, or adopted.
 */
const fenceBrowserAuth = (guestId, attemptId, now = Date.now()) => (
  decide(guestId, (current) => {
    if (!current || !attemptId) return { type: 'unchanged' };
    const matchesAttempt = current.attempt === attemptId;
    const matchesGrant = current.grantAttempt === attemptId;
    if (!matchesAttempt && !matchesGrant) return { type: 'unchanged' };
    const kept = keptSession(current);
    return {
      type: 'write',
      applied: true,
      binding: {
        generation: current.generation + 1,
        sessionGeneration: kept.sessionGeneration,
        state: kept.state,
        wallet: kept.wallet,
        attempt: matchesAttempt ? null : current.attempt,
        attemptExpiresAt: matchesAttempt ? null : current.attemptExpiresAt || null,
        boundAttempt: kept.boundAttempt,
        grantAttempt: matchesGrant ? null : current.grantAttempt,
        grantWallet: matchesGrant ? null : current.grantWallet
      }
    };
  }, now)
);

const grantBrowserAuthAttempt = (guestId, { attemptId, wallet }, now = Date.now()) => (
  decide(guestId, (current) => {
    const pending = describePendingAttempt(current, now);
    if (
      !current
      || current.state === 'cleared'
      || current.attempt !== attemptId
      || pending.expired
    ) return { type: 'reject' };
    return {
      type: 'write',
      binding: {
        ...current,
        grantAttempt: attemptId,
        grantWallet: wallet,
        attemptExpiresAt: now + PENDING_ATTEMPT_TTL_MS
      }
    };
  }, now)
);

const adoptBrowserAuthAttempt = (guestId, attemptId, now = Date.now()) => (
  decide(guestId, (current) => {
    if (
      !current
      || current.state === 'cleared'
      || current.grantAttempt !== attemptId
      || !current.grantWallet
      || (current.attemptExpiresAt && current.attemptExpiresAt <= now)
    ) {
      return { type: 'reject' };
    }
    return {
      type: 'write',
      binding: {
        generation: current.generation + 1,
        sessionGeneration: (current.sessionGeneration || 0) + 1,
        state: 'bound',
        wallet: current.grantWallet,
        attempt: null,
        boundAttempt: attemptId,
        grantAttempt: null,
        grantWallet: null
      }
    };
  }, now)
);

const releaseBrowserAuthAttempt = (guestId, attemptId, now = Date.now()) => (
  decide(guestId, (current) => {
    if (!current) return { type: 'unchanged' };
    if (current.boundAttempt === attemptId) {
      const newerAttempt = current.attempt && current.attempt !== attemptId;
      const newerGrant = current.grantAttempt && current.grantAttempt !== attemptId;
      if (newerAttempt || newerGrant) {
        return {
          type: 'write',
          preservedAttempt: true,
          binding: {
            generation: current.generation + 1,
            sessionGeneration: (current.sessionGeneration || 0) + 1,
            state: 'open',
            wallet: null,
            attempt: newerAttempt ? current.attempt : null,
            attemptExpiresAt: newerAttempt ? current.attemptExpiresAt || null : null,
            boundAttempt: null,
            grantAttempt: newerGrant ? current.grantAttempt : null,
            grantWallet: newerGrant ? current.grantWallet : null
          }
        };
      }
      return {
        type: 'write',
        cleared: true,
        binding: {
          generation: current.generation + 1,
          sessionGeneration: (current.sessionGeneration || 0) + 1,
          state: 'cleared',
          wallet: null,
          attempt: null,
          attemptExpiresAt: null,
          boundAttempt: null,
          grantAttempt: null,
          grantWallet: null
        }
      };
    }
    if (current.grantAttempt === attemptId || current.attempt === attemptId) {
      const attemptRemains = current.attempt !== attemptId;
      return {
        type: 'write',
        applied: true,
        binding: {
          generation: current.generation + 1,
          sessionGeneration: current.sessionGeneration || 0,
          state: current.state,
          wallet: current.wallet,
          attempt: attemptRemains ? current.attempt : null,
          attemptExpiresAt: attemptRemains ? current.attemptExpiresAt || null : null,
          boundAttempt: current.boundAttempt,
          grantAttempt: current.grantAttempt === attemptId ? null : current.grantAttempt,
          grantWallet: current.grantAttempt === attemptId ? null : current.grantWallet
        }
      };
    }
    return { type: 'unchanged' };
  }, now)
);

const clearBrowserAuth = (guestId, { sessionGeneration } = {}, now = Date.now()) => (
  decide(guestId, (current) => {
    if (!current || current.state === 'cleared') return { type: 'unchanged' };
    const currentSession = current.sessionGeneration || 0;
    if (sessionGeneration == null || currentSession !== sessionGeneration) {
      return { type: 'unchanged' };
    }
    return {
      type: 'write',
      cleared: true,
      binding: {
        generation: current.generation + 1,
        sessionGeneration: currentSession + 1,
        state: 'cleared',
        wallet: null,
        attempt: null,
        attemptExpiresAt: null,
        boundAttempt: null,
        grantAttempt: null,
        grantWallet: null
      }
    };
  }, now)
);

const observeBrowserAuth = async (guestId, now = Date.now()) => {
  const current = await readBrowserAuth(guestId);
  return describePendingAttempt(current, now);
};

const authorizationRequired = (code = 'wallet_profile_authorization_required') => (
  browserAuthError('Wallet profile authorization is required.', 401, code)
);

const readPresentedWalletSession = (req, now) => {
  const token = readWalletProfileSessionToken(req);
  if (!token) return null;
  return {
    token,
    session: verifyWalletProfileSession(token, now)
  };
};

/**
 * A browser-scoped cookie is authoritative only together with the same guest
 * and a bound binding for that exact wallet and session generation. A binding
 * never authorizes by itself, and a browser-scoped cookie never falls back to
 * the legacy cookie path. Cookies without a browser id remain legacy sessions.
 */
const readAuthoritativeWalletProfileSession = async (req, now = Date.now()) => {
  const presented = readPresentedWalletSession(req, now);
  if (!presented) throw authorizationRequired();
  const { session } = presented;
  if (!session.browserId) {
    return { ...session, source: 'legacy-cookie' };
  }
  if (!Number.isSafeInteger(session.authGeneration) || session.authGeneration < 1) {
    throw authorizationRequired('wallet_session_superseded');
  }
  const guest = readGuestIdentity(req, now);
  if (!guest || guest.guestId !== session.browserId) {
    throw authorizationRequired('wallet_session_superseded');
  }
  const binding = await readBrowserAuth(guest.guestId);
  if (
    !binding
    || binding.state !== 'bound'
    || binding.wallet !== session.walletAddress
    || (binding.sessionGeneration || 0) !== session.authGeneration
  ) {
    throw authorizationRequired('wallet_session_superseded');
  }
  return {
    walletAddress: binding.wallet,
    profileId: walletProfileId(binding.wallet),
    browserId: guest.guestId,
    authGeneration: binding.sessionGeneration,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    source: 'browser-binding'
  };
};

const readOptionalAuthoritativeWalletProfileSession = async (req, now = Date.now()) => {
  if (!readWalletProfileSessionToken(req)) return null;
  return readAuthoritativeWalletProfileSession(req, now);
};

const assertAttemptId = (attemptId) => {
  if (!ATTEMPT_PATTERN.test(String(attemptId || ''))) {
    throw browserAuthError('Wallet connection attempt is required.', 400, 'wallet_attempt_required');
  }
  return String(attemptId);
};

module.exports = {
  BINDING_PREFIX,
  PENDING_ATTEMPT_TTL_MS,
  ZERO_WALLET,
  adoptBrowserAuthAttempt,
  assertAttemptId,
  beginBrowserAuthAttempt,
  browserAuthChallengeId,
  clearBrowserAuth,
  decodeBinding,
  encodeBinding,
  fenceBrowserAuth,
  grantBrowserAuthAttempt,
  observeBrowserAuth,
  readAuthoritativeWalletProfileSession,
  readOptionalAuthoritativeWalletProfileSession,
  releaseBrowserAuthAttempt
};
