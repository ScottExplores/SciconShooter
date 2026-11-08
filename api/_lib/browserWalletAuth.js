const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { readGuestIdentity } = require('./guestIdentity');
const {
  normalizeWalletAddress,
  readOptionalWalletProfileSession,
  readWalletProfileSession,
  walletProfileId
} = require('./walletProfileAuth');

const CHALLENGES_TABLE = process.env.SUPABASE_WALLET_PROFILE_CHALLENGES_TABLE
  || 'scicon_wallet_profile_challenges';
const BINDING_PREFIX = 'scicon-browser-auth-v1';
const ZERO_WALLET = '0x0000000000000000000000000000000000000000';
const BINDING_LIFETIME_MS = 10 * 365 * 24 * 60 * 60 * 1000;
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
  `grantWallet=${binding.grantWallet || ZERO_WALLET}`
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
  if (!Number.isSafeInteger(generation) || generation < 1) return null;
  if (!['open', 'bound', 'cleared'].includes(fields.state)) return null;
  return {
    generation,
    state: fields.state,
    wallet: wallet && wallet !== ZERO_WALLET ? wallet : null,
    attempt: fromToken(fields.attempt),
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
    if (decision.type === 'reject') return { ok: false, binding: current };
    if (decision.type === 'unchanged') return { ok: true, binding: current };
    const written = current
      ? await swapBrowserAuth(guestId, current.rawMessage, decision.binding, now)
      : await insertBrowserAuth(guestId, decision.binding, now);
    if (written) return { ok: true, binding: written };
  }
  throw browserAuthError(
    'Browser wallet session changed. Retry the connection.',
    409,
    'wallet_attempt_superseded'
  );
};

const keptWallet = (current) => (
  current?.state === 'bound' && current.wallet
    ? {
      state: 'bound',
      wallet: current.wallet,
      boundAttempt: current.boundAttempt
    }
    : {
      state: current?.state === 'cleared' ? 'cleared' : 'open',
      wallet: null,
      boundAttempt: null
    }
);

const beginBrowserAuthAttempt = (guestId, now = Date.now()) => decide(guestId, (current) => {
  const kept = keptWallet(current);
  return {
    type: 'write',
    binding: {
      generation: (current?.generation || 0) + 1,
      state: kept.state === 'cleared' ? 'open' : kept.state,
      wallet: kept.state === 'bound' ? kept.wallet : null,
      attempt: crypto.randomUUID(),
      boundAttempt: kept.state === 'bound' ? kept.boundAttempt : null,
      grantAttempt: null,
      grantWallet: null
    }
  };
}, now);

const fenceBrowserAuth = (guestId, now = Date.now()) => decide(guestId, (current) => {
  const kept = keptWallet(current);
  return {
    type: 'write',
    binding: {
      generation: (current?.generation || 0) + 1,
      state: kept.state,
      wallet: kept.wallet,
      attempt: null,
      boundAttempt: kept.boundAttempt,
      grantAttempt: null,
      grantWallet: null
    }
  };
}, now);

const grantBrowserAuthAttempt = (guestId, { attemptId, wallet }, now = Date.now()) => (
  decide(guestId, (current) => {
    if (
      !current
      || current.state === 'cleared'
      || current.attempt !== attemptId
    ) return { type: 'reject' };
    return {
      type: 'write',
      binding: {
        ...current,
        grantAttempt: attemptId,
        grantWallet: wallet
      }
    };
  }, now)
);

const adoptBrowserAuthAttempt = (guestId, attemptId, now = Date.now()) => (
  decide(guestId, (current) => {
    if (!current || current.grantAttempt !== attemptId || !current.grantWallet) {
      return { type: 'reject' };
    }
    return {
      type: 'write',
      binding: {
        generation: current.generation,
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
      return {
        type: 'write',
        binding: {
          generation: current.generation + 1,
          state: 'cleared',
          wallet: null,
          attempt: null,
          boundAttempt: null,
          grantAttempt: null,
          grantWallet: null
        }
      };
    }
    if (current.grantAttempt === attemptId) {
      return {
        type: 'write',
        binding: {
          generation: current.generation + 1,
          state: current.state,
          wallet: current.wallet,
          attempt: current.attempt === attemptId ? null : current.attempt,
          boundAttempt: current.boundAttempt,
          grantAttempt: null,
          grantWallet: null
        }
      };
    }
    return { type: 'unchanged' };
  }, now)
);

const clearBrowserAuth = (guestId, now = Date.now()) => decide(guestId, (current) => ({
  type: 'write',
  binding: {
    generation: (current?.generation || 0) + 1,
    state: 'cleared',
    wallet: null,
    attempt: null,
    boundAttempt: null,
    grantAttempt: null,
    grantWallet: null
  }
}), now);

const sessionFromBinding = (binding, guestId) => {
  if (!binding) return { kind: 'legacy' };
  if (binding.state === 'cleared') return { kind: 'cleared', browserId: guestId, authGeneration: binding.generation };
  if (binding.state === 'bound' && binding.wallet) {
    return {
      kind: 'bound',
      walletAddress: binding.wallet,
      profileId: walletProfileId(binding.wallet),
      browserId: guestId,
      authGeneration: binding.generation,
      source: 'browser-binding'
    };
  }
  return { kind: 'legacy' };
};

const readBrowserSession = async (req, now = Date.now()) => {
  const guest = readGuestIdentity(req, now);
  if (!guest) return { kind: 'legacy', guest: null };
  let cookieSession = null;
  try {
    cookieSession = readOptionalWalletProfileSession(req, now);
  } catch {
    cookieSession = null;
  }
  try {
    const binding = await readBrowserAuth(guest.guestId);
    return { ...sessionFromBinding(binding, guest.guestId), guest };
  } catch (error) {
    // A cookie issued before browser bindings existed has no browserId.
    // Keep that session available when the binding store cannot be read.
    // A browser-scoped cookie fails closed so a stale Set-Cookie cannot win.
    if (!cookieSession?.browserId) return { kind: 'legacy', guest };
    throw error;
  }
};

const readAuthoritativeWalletProfileSession = async (req, now = Date.now()) => {
  const browser = await readBrowserSession(req, now);
  if (browser.kind === 'cleared') {
    throw browserAuthError(
      'Wallet profile authorization is required.',
      401,
      'wallet_session_superseded'
    );
  }
  if (browser.kind === 'bound') return browser;
  return {
    ...readWalletProfileSession(req, now),
    source: 'legacy-cookie'
  };
};

const readOptionalAuthoritativeWalletProfileSession = async (req, now = Date.now()) => {
  const browser = await readBrowserSession(req, now);
  if (browser.kind === 'cleared') {
    throw browserAuthError(
      'Wallet profile authorization is required.',
      401,
      'wallet_session_superseded'
    );
  }
  if (browser.kind === 'bound') return browser;
  const cookieSession = readOptionalWalletProfileSession(req, now);
  return cookieSession ? { ...cookieSession, source: 'legacy-cookie' } : null;
};

const assertAttemptId = (attemptId) => {
  if (!ATTEMPT_PATTERN.test(String(attemptId || ''))) {
    throw browserAuthError('Wallet connection attempt is required.', 400, 'wallet_attempt_required');
  }
  return String(attemptId);
};

module.exports = {
  BINDING_PREFIX,
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
  readAuthoritativeWalletProfileSession,
  readOptionalAuthoritativeWalletProfileSession,
  releaseBrowserAuthAttempt
};
