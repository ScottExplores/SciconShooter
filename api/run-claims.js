const crypto = require('crypto');
const { verifyRunReceipt } = require('./_lib/runReceipts');
const { requireRunAssociationIdentity } = require('./_lib/runIdentityAuthorization');
const { reserveRunWalletAssociation } = require('./_lib/runWalletAssociation');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { verifyBaseMessage } = require('./_lib/baseSignatures');
const { checkRateLimit } = require('./_lib/rateLimit');
const { assertSameOrigin } = require('./_lib/walletProfileAuth');
const { requireTrustedReceiptProvenance } = require('./_lib/runReceiptProvenance');

const NONCES_TABLE = process.env.SUPABASE_WALLET_NONCES_TABLE || 'scicon_wallet_nonces';
const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body;
};

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const makeMessage = ({ address, runId, challengeId, expiresAt }) => [
  'Scicon Shooter run association',
  '',
  `Wallet: ${address}`,
  `Run: ${runId}`,
  `Challenge: ${challengeId}`,
  `Expires: ${expiresAt}`,
  '',
  'Signing does not spend funds or mint anything.'
].join('\n');

const createChallenge = async ({ address, receiptToken }, req) => {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) throw Object.assign(new Error('A valid Base wallet address is required.'), { statusCode: 400 });
  const receipt = verifyRunReceipt(receiptToken);
  requireRunAssociationIdentity({ receipt, requestedAddress: normalizedAddress, req });
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS).toISOString();
  const message = makeMessage({ address: normalizedAddress, runId: receipt.runId, challengeId, expiresAt });
  await fetchSupabaseJson(NONCES_TABLE, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      challenge_id: challengeId,
      run_id: receipt.runId,
      wallet_address: normalizedAddress,
      message,
      expires_at: expiresAt
    })
  });
  return { challengeId, message, expiresAt, runId: receipt.runId };
};

const syncLeaderboardWallet = async (runId, walletAddress) => {
  try {
    await fetchSupabaseJson(`${LEADERBOARD_TABLE}?run_id=eq.${encodeURIComponent(runId)}`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ wallet_address: walletAddress })
    });
  } catch (error) {
    // The verified receipt owns wallet association; leaderboard denormalization can recover later.
    console.error('Run claim leaderboard sync failed:', error);
  }
};

const claimRun = async ({ address, receiptToken, challengeId, signature }, req) => {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress || !challengeId || !signature) {
    throw Object.assign(new Error('Wallet, challenge, and signature are required.'), { statusCode: 400 });
  }
  const receipt = verifyRunReceipt(receiptToken);
  requireRunAssociationIdentity({ receipt, requestedAddress: normalizedAddress, req });
  const [rows, receiptRows] = await Promise.all([
    fetchSupabaseJson(`${NONCES_TABLE}?select=*&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`, {
      headers: supabaseHeaders()
    }),
    fetchSupabaseJson(`${RECEIPTS_TABLE}?select=wallet_address,wallet_claimed_at,receipt_provenance_version&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    })
  ]);
  const challenge = Array.isArray(rows) ? rows[0] : null;
  if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error('This wallet challenge is missing or expired.'), { statusCode: 410 });
  }
  if (challenge.run_id !== receipt.runId || challenge.wallet_address !== normalizedAddress) {
    throw Object.assign(new Error('The wallet challenge does not match this run.'), { statusCode: 403 });
  }

  const storedReceipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
  requireTrustedReceiptProvenance(storedReceipt);
  const storedWallet = storedReceipt?.wallet_address?.toLowerCase() || null;
  if (storedWallet && storedWallet !== normalizedAddress) {
    throw Object.assign(new Error('This run is already attached to another Base Account.'), { statusCode: 409 });
  }

  if (challenge.used_at) {
    if (storedWallet !== normalizedAddress) {
      throw Object.assign(new Error('This wallet challenge was already used.'), { statusCode: 410 });
    }
    await syncLeaderboardWallet(receipt.runId, normalizedAddress);
    return {
      runId: receipt.runId,
      walletAddress: normalizedAddress,
      claimedAt: storedReceipt.wallet_claimed_at || challenge.used_at
    };
  }

  const valid = await verifyBaseMessage({
    address: normalizedAddress,
    message: challenge.message,
    signature
  });
  if (!valid) throw Object.assign(new Error('Wallet signature could not be verified.'), { statusCode: 401 });

  const now = new Date().toISOString();
  const association = await reserveRunWalletAssociation({
    runId: receipt.runId,
    walletAddress: normalizedAddress,
    associatedAt: now,
    storedAssociation: storedReceipt
  });

  const consumedChallenges = await fetchSupabaseJson(`${NONCES_TABLE}?challenge_id=eq.${encodeURIComponent(challengeId)}&used_at=is.null`, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ used_at: now })
  });
  if (!Array.isArray(consumedChallenges) || consumedChallenges.length !== 1) {
    const currentRows = await fetchSupabaseJson(`${RECEIPTS_TABLE}?select=wallet_address&run_id=eq.${encodeURIComponent(receipt.runId)}&limit=1`, {
      headers: supabaseHeaders()
    });
    const currentWallet = Array.isArray(currentRows) ? currentRows[0]?.wallet_address?.toLowerCase() : null;
    if (currentWallet !== normalizedAddress) {
      throw Object.assign(new Error('This wallet challenge was already used.'), { statusCode: 409 });
    }
  }

  await syncLeaderboardWallet(receipt.runId, normalizedAddress);
  return {
    runId: receipt.runId,
    walletAddress: normalizedAddress,
    claimedAt: association.associatedAt
  };
};

module.exports = async (req, res) => {
  try {
    assertSameOrigin(req, { required: false, matchProtocol: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 403, { error: error.message });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = parseBody(req.body);
    const action = body.action === 'claim' ? 'claim' : 'challenge';
    const rateLimit = checkRateLimit(req, {
      scope: `run-association:${action}`,
      limit: action === 'claim' ? 30 : 40,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))));
      return sendJson(res, 429, {
        error: 'Too many run association requests. Try again shortly.',
        code: 'RUN_CLAIM_RATE_LIMITED'
      });
    }
    if (body.action === 'challenge') return sendJson(res, 200, await createChallenge(body, req));
    if (body.action === 'claim') return sendJson(res, 200, { claim: await claimRun(body, req) });
    return sendJson(res, 400, { error: 'Unknown run claim action' });
  } catch (error) {
    console.error('Run claim API error:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Run claim failed',
      ...(error?.code ? { code: error.code } : {})
    });
  }
};
