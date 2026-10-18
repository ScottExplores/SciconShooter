const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { findEligibleProposal } = require('./_lib/researchHubEligibility');
const { sendBaseNotificationBroadcast } = require('./_lib/baseNotifications');
const { verifyBaseMessage } = require('./_lib/baseSignatures');
const { checkRateLimit } = require('./_lib/rateLimit');
const { assertSameOrigin } = require('./_lib/walletProfileAuth');
const { readTopEligibleScore } = require('./_lib/weeklyCompetitionService');
const {
  getCurrentWeekRange,
  WEEKLY_ALLOCATION_RSC
} = require('../shared/weeklyCompetitionBoundary.js');

const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const { hasTrustedReceiptProvenance } = require('./_lib/runReceiptProvenance');
const NONCES_TABLE = process.env.SUPABASE_WALLET_NONCES_TABLE || 'scicon_wallet_nonces';
const CHALLENGE_LIFETIME_MS = 10 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RESOLVED_COMPETITION_STATUSES = new Set(['claimed', 'pending-funding', 'funded']);

const findCurrentWeekEligibleProposal = (proposalId) => findEligibleProposal(proposalId, {
  requiredOpenUntil: getCurrentWeekRange().end
});

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') { try { return JSON.parse(body); } catch { return {}; } }
  return body;
};

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const apiError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  ...(code ? { code } : {})
});

const proposalFromCompetition = (competition) => ({
  id: String(competition?.proposal_id || ''),
  title: String(competition?.proposal_title || ''),
  url: String(competition?.proposal_url || ''),
  author: String(competition?.proposal_author || ''),
  imageUrl: competition?.proposal_image_url || null
});

const isSameStoredClaim = (competition, wallet, proposalId) => (
  RESOLVED_COMPETITION_STATUSES.has(String(competition?.status || '').toLowerCase())
  && normalizeAddress(competition?.winner_wallet) === wallet
  && String(competition?.proposal_id || '') === String(proposalId || '')
);

const claimResultFromCompetition = ({ competition, wallet, challenge, replayed }) => ({
  weekKey: competition.week_key,
  walletAddress: wallet,
  proposal: proposalFromCompetition(competition),
  status: competition.status,
  claimedAt: competition.updated_at || challenge?.used_at || null,
  replayed: Boolean(replayed)
});

const getCompetition = async (weekKey) => {
  const rows = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(weekKey)}&limit=1`, {
    headers: supabaseHeaders()
  });
  const competition = Array.isArray(rows) ? rows[0] : null;
  if (!competition) throw Object.assign(new Error('Weekly competition was not found.'), { statusCode: 404 });
  return competition;
};

const getChallenge = async (challengeId) => {
  const rows = await fetchSupabaseJson(
    `${NONCES_TABLE}?select=*&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? rows[0] : null;
};

const assertWinnerWallet = async (competition, address) => {
  const winnerRunId = String(competition?.winner_run_id || '').trim();
  if (!winnerRunId) {
    throw apiError('This weekly winner has no claimable run receipt.', 409, 'WEEKLY_CLAIM_RECEIPT_MISSING');
  }
  const receipts = await fetchSupabaseJson(`${RECEIPTS_TABLE}?select=run_id,wallet_address,receipt_provenance_version&run_id=eq.${encodeURIComponent(winnerRunId)}&limit=2`, {
    headers: supabaseHeaders()
  });
  const receipt = Array.isArray(receipts) && receipts.length === 1 ? receipts[0] : null;
  const receiptWallet = normalizeAddress(receipt?.wallet_address);
  const archivedWallet = normalizeAddress(competition?.winner_wallet);
  if (
    String(receipt?.run_id || '') !== winnerRunId
    || !hasTrustedReceiptProvenance(receipt)
    || receiptWallet !== address
    || (archivedWallet && archivedWallet !== receiptWallet)
  ) {
    throw apiError('This wallet is not associated with the winning run.', 403, 'WEEKLY_CLAIM_WRONG_WALLET');
  }
};

const assertCompetitionIsClaimable = async (competition, wallet) => {
  if (competition.status !== 'finalized') {
    throw apiError(
      'This competition is not awaiting a champion claim.',
      409,
      'WEEKLY_CLAIM_ALREADY_RESOLVED'
    );
  }
  const claimDeadline = Date.parse(competition.claim_deadline);
  if (!Number.isFinite(claimDeadline) || claimDeadline <= Date.now()) {
    throw apiError('The champion claim window has closed.', 410, 'WEEKLY_CLAIM_WINDOW_CLOSED');
  }
  await assertWinnerWallet(competition, wallet);
  const currentWinner = await readTopEligibleScore(competition.week_key);
  if (
    !currentWinner?.run_id
    || String(currentWinner.run_id) !== String(competition.winner_run_id || '')
  ) {
    throw apiError(
      'The weekly winner changed before this claim could be completed.',
      409,
      'WEEKLY_CLAIM_WINNER_CHANGED'
    );
  }
};

const challengeMatchesClaim = ({ challenge, challengeId, competition, wallet, proposal }) => {
  if (
    !challenge
    || String(challenge.challenge_id || '') !== String(challengeId || '')
    || normalizeAddress(challenge.wallet_address) !== wallet
    || String(challenge.run_id || '') !== String(competition.winner_run_id || '')
  ) return false;

  const lines = String(challenge.message || '').split(/\r?\n/);
  return lines.includes(`Week: ${competition.week_key}`)
    && lines.includes(`Winning run: ${competition.winner_run_id}`)
    && lines.includes(`Wallet: ${wallet}`)
    && lines.includes(`Proposal: ${proposal.id} - ${proposal.title}`)
    && lines.includes(`Challenge: ${challengeId}`)
    && lines.some((line) => {
      if (!line.startsWith('Expires: ')) return false;
      const messageExpiry = Date.parse(line.slice('Expires: '.length));
      const storedExpiry = Date.parse(challenge.expires_at);
      return Number.isFinite(messageExpiry)
        && Number.isFinite(storedExpiry)
        && messageExpiry === storedExpiry;
    });
};

const hasDurablyConsumedChallenge = (challenge) => {
  const usedAt = Date.parse(challenge?.used_at);
  const expiresAt = Date.parse(challenge?.expires_at);
  return Number.isFinite(usedAt)
    && Number.isFinite(expiresAt)
    && usedAt <= expiresAt;
};

const verifyClaimSignature = async ({ challenge, challengeId, competition, wallet, proposal, signature }) => {
  if (!challengeMatchesClaim({ challenge, challengeId, competition, wallet, proposal })) {
    throw apiError(
      'Champion challenge is invalid or expired.',
      410,
      'WEEKLY_CLAIM_CHALLENGE_STALE'
    );
  }
  const valid = await verifyBaseMessage({ address: wallet, message: challenge.message, signature });
  if (!valid) {
    throw apiError('Champion signature could not be verified.', 401, 'WEEKLY_CLAIM_SIGNATURE_INVALID');
  }
};

const consumeChallenge = async ({ challengeId, now }) => {
  const consumed = await fetchSupabaseJson(
    [
      `${NONCES_TABLE}?select=challenge_id,run_id,wallet_address,expires_at,used_at`,
      `challenge_id=eq.${encodeURIComponent(challengeId)}`,
      'used_at=is.null',
      `expires_at=gt.${encodeURIComponent(now)}`
    ].join('&'),
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({ used_at: now })
    }
  );
  if (
    !Array.isArray(consumed)
    || consumed.length !== 1
    || String(consumed[0]?.challenge_id || '') !== String(challengeId)
    || !hasDurablyConsumedChallenge(consumed[0])
  ) {
    throw apiError(
      'Champion challenge was already used or could not be durably consumed.',
      410,
      'WEEKLY_CLAIM_CHALLENGE_STALE'
    );
  }
  return consumed[0];
};

const createChallenge = async ({ weekKey, proposalId, address }) => {
  const wallet = normalizeAddress(address);
  if (!wallet) throw apiError('A valid Base wallet is required.', 400, 'WEEKLY_CLAIM_WALLET_INVALID');
  const competition = await getCompetition(weekKey);
  await assertCompetitionIsClaimable(competition, wallet);
  const proposal = await findCurrentWeekEligibleProposal(proposalId);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS).toISOString();
  const message = [
    'Scicon Shooter weekly champion claim', '',
    `Week: ${weekKey}`,
    `Winning run: ${competition.winner_run_id}`,
    `Wallet: ${wallet}`,
    `Proposal: ${proposal.id} - ${proposal.title}`,
    `Challenge: ${challengeId}`,
    `Expires: ${expiresAt}`, '',
    'Signing selects this proposal. It does not send funds or mint yet.'
  ].join('\n');
  await fetchSupabaseJson(NONCES_TABLE, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ challenge_id: challengeId, run_id: competition.winner_run_id, wallet_address: wallet, message, expires_at: expiresAt })
  });
  return { challengeId, message, expiresAt, proposal };
};

const saveClaimedCompetition = async ({ competition, wallet, proposal, now }) => {
  const filters = [
    'select=*',
    `week_key=eq.${encodeURIComponent(competition.week_key)}`,
    'status=eq.finalized',
    // REVAMP(E): Eligibility fetches can cross the claim deadline.
    `claim_deadline=gt.${encodeURIComponent(now)}`,
    `winner_run_id=eq.${encodeURIComponent(competition.winner_run_id)}`
  ];
  if (competition.updated_at && Number.isFinite(Date.parse(competition.updated_at))) {
    filters.push(`updated_at=eq.${encodeURIComponent(competition.updated_at)}`);
  }
  const url = `${COMPETITIONS_TABLE}?${filters.join('&')}`;
  const patch = (value) => fetchSupabaseJson(url, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(value)
  });
  const proposalFields = {
    status: 'claimed',
    winner_wallet: wallet,
    proposal_id: proposal.id,
    proposal_title: proposal.title,
    proposal_url: proposal.url,
    proposal_author: proposal.author,
    ...(proposal.imageUrl ? { proposal_image_url: proposal.imageUrl } : {}),
    updated_at: now
  };

  try {
    return await patch(proposalFields);
  } catch (error) {
    if (!proposal.imageUrl || !/proposal_image_url|schema cache/i.test(error?.message || '')) throw error;
    const { proposal_image_url: _proposalImageUrl, ...compatibleFields } = proposalFields;
    return patch(compatibleFields);
  }
};

const completeClaim = async ({ weekKey, proposalId, address, challengeId, signature }) => {
  const wallet = normalizeAddress(address);
  if (!wallet || !challengeId || !signature) {
    throw apiError('Claim signature details are incomplete.', 400, 'WEEKLY_CLAIM_DETAILS_INCOMPLETE');
  }
  const [competition, challenge] = await Promise.all([
    getCompetition(weekKey),
    getChallenge(challengeId)
  ]);

  if (RESOLVED_COMPETITION_STATUSES.has(String(competition.status || '').toLowerCase())) {
    if (!isSameStoredClaim(competition, wallet, proposalId)) {
      throw apiError(
        'This weekly champion already selected a different proposal or wallet.',
        409,
        'WEEKLY_CLAIM_ALREADY_RESOLVED'
      );
    }
    const storedProposal = proposalFromCompetition(competition);
    if (!hasDurablyConsumedChallenge(challenge)) {
      throw apiError(
        'Champion challenge was not durably consumed by the completed claim.',
        410,
        'WEEKLY_CLAIM_CHALLENGE_STALE'
      );
    }
    await verifyClaimSignature({
      challenge,
      challengeId,
      competition,
      wallet,
      proposal: storedProposal,
      signature
    });
    return claimResultFromCompetition({ competition, wallet, challenge, replayed: true });
  }

  await assertCompetitionIsClaimable(competition, wallet);
  if (
    !challenge
    || challenge.used_at
    || new Date(challenge.expires_at).getTime() <= Date.now()
  ) {
    throw apiError(
      'Champion challenge is invalid or expired.',
      410,
      'WEEKLY_CLAIM_CHALLENGE_STALE'
    );
  }
  const proposal = await findCurrentWeekEligibleProposal(proposalId);
  await verifyClaimSignature({ challenge, challengeId, competition, wallet, proposal, signature });

  const now = new Date().toISOString();
  const consumedChallenge = await consumeChallenge({ challengeId, now });
  const saved = await saveClaimedCompetition({ competition, wallet, proposal, now });

  if (Array.isArray(saved) && saved.length > 1) {
    throw apiError(
      'The weekly claim commit affected more than one competition row.',
      503,
      'WEEKLY_CLAIM_COMMIT_UNCONFIRMED'
    );
  }

  if (!Array.isArray(saved) || saved.length === 0) {
    const currentCompetition = await getCompetition(weekKey);
    if (isSameStoredClaim(currentCompetition, wallet, proposal.id)) {
      return claimResultFromCompetition({
        competition: currentCompetition,
        wallet,
        challenge: consumedChallenge,
        replayed: true
      });
    }
    if (RESOLVED_COMPETITION_STATUSES.has(String(currentCompetition.status || '').toLowerCase())) {
      throw apiError(
        'Another weekly proposal claim won this competition.',
        409,
        'WEEKLY_CLAIM_ALREADY_RESOLVED'
      );
    }
    if (String(currentCompetition.winner_run_id || '') !== String(competition.winner_run_id || '')) {
      throw apiError(
        'The weekly winner changed before this claim could be completed.',
        409,
        'WEEKLY_CLAIM_WINNER_CHANGED'
      );
    }
    if (Date.parse(currentCompetition.claim_deadline) <= Date.now()) {
      throw apiError('The champion claim window has closed.', 410, 'WEEKLY_CLAIM_WINDOW_CLOSED');
    }
    throw apiError(
      'The weekly claim commit could not be confirmed. Request a new challenge and retry.',
      503,
      'WEEKLY_CLAIM_COMMIT_UNCONFIRMED'
    );
  }

  const committedCompetition = saved[0];
  if (!isSameStoredClaim(committedCompetition, wallet, proposal.id)) {
    throw apiError(
      'The weekly claim commit returned an unexpected row.',
      503,
      'WEEKLY_CLAIM_COMMIT_UNCONFIRMED'
    );
  }

  await sendBaseNotificationBroadcast({
    title: 'Research pick selected',
    message: `${competition.winner_name || 'The weekly champion'} selected ${proposal.title} for the ${Number(competition.allocation_rsc || WEEKLY_ALLOCATION_RSC).toLocaleString('en-US')} RSC allocation.`,
    targetPath: '/?view=trophies'
  }).catch((error) => console.error('Base proposal notification failed:', error));
  return claimResultFromCompetition({
    competition: committedCompetition,
    wallet,
    challenge: consumedChallenge,
    replayed: false
  });
};

module.exports = async (req, res) => {
  try {
    assertSameOrigin(req, { required: true, matchProtocol: true });
  } catch (error) {
    return sendJson(res, error.statusCode || 403, { error: error.message });
  }
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = parseBody(req.body);
    const action = body.action === 'claim' ? 'claim' : 'challenge';
    const rateLimit = checkRateLimit(req, {
      scope: `weekly-champion-claim:${action}`,
      limit: action === 'claim' ? 20 : 30,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))));
      return sendJson(res, 429, {
        error: 'Too many weekly champion claim requests. Try again shortly.',
        code: 'WEEKLY_CLAIM_RATE_LIMITED'
      });
    }
    if (body.action === 'challenge') return sendJson(res, 200, await createChallenge(body));
    if (body.action === 'claim') return sendJson(res, 200, { claim: await completeClaim(body) });
    return sendJson(res, 400, { error: 'Unknown champion claim action' });
  } catch (error) {
    console.error('Weekly champion claim failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Weekly champion claim failed',
      ...(error?.code ? { code: error.code } : {})
    });
  }
};
