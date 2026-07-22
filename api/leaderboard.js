const ALL_TIME_SCORE_LIMIT = 100;
const WEEKLY_SCORE_LIMIT = 100;
const SYNC_SCORE_LIMIT = ALL_TIME_SCORE_LIMIT + WEEKLY_SCORE_LIMIT;
const SUPABASE_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const NONCES_TABLE = process.env.SUPABASE_WALLET_NONCES_TABLE || 'scicon_wallet_nonces';
const { verifyRunReceipt } = require('./_lib/runReceipts');
const { findEligibleProposal } = require('./_lib/researchHubEligibility');
const { verifyBaseMessage } = require('./_lib/baseSignatures');
const crypto = require('crypto');
const { checkRateLimit } = require('./_lib/rateLimit');
const { getCurrentWeekRange } = require('../shared/weeklyCompetitionBoundary.js');

const LEGACY_SUPABASE_SELECT = 'name,score,wave,date,wallet_address,donated';
const PROPOSAL_SUPABASE_SELECT = `${LEGACY_SUPABASE_SELECT},proposal_id,proposal_title,proposal_url,proposal_author`;
const VERIFIED_SUPABASE_SELECT = `${PROPOSAL_SUPABASE_SELECT},run_id,verified,receipt_hash`;
const SUPABASE_SELECT = `${VERIFIED_SUPABASE_SELECT},proposal_image_url`;

const getSupabaseConfig = () => ({
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
});

const hasSupabaseConfig = () => {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
};

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
};

const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const sanitizeUrl = (value) => {
  const url = sanitizeText(value, 500);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
};

const isMissingProposalColumnError = (error) => (
  /proposal_|schema cache|column/i.test(error?.message || '')
);

const isDuplicateKeyError = (details) => (
  /23505|duplicate key|already exists/i.test(details || '')
);

const isCurrentWeekEntry = (entry) => {
  const timestamp = new Date(entry.date || 0).getTime();
  const { start, end } = getCurrentWeekRange();
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp < end.getTime();
};

const sanitizeEntry = (entry) => {
  if (!entry || typeof entry.name !== 'string' || typeof entry.score !== 'number') {
    return null;
  }

  const name = entry.name.trim().slice(0, 15).toUpperCase();
  if (!name) return null;

  return {
    name,
    score: Math.max(0, Math.floor(entry.score)),
    wave: typeof entry.wave === 'number' ? Math.max(1, Math.floor(entry.wave)) : 1,
    date: typeof entry.date === 'string' ? entry.date : new Date().toISOString(),
    walletAddress: typeof entry.walletAddress === 'string' ? entry.walletAddress.toLowerCase() : undefined,
    donated: Boolean(entry.donated),
    proposalId: sanitizeText(entry.proposalId, 80),
    proposalTitle: sanitizeText(entry.proposalTitle, 180),
    proposalUrl: sanitizeUrl(entry.proposalUrl),
    proposalAuthor: sanitizeText(entry.proposalAuthor, 100),
    proposalImageUrl: sanitizeUrl(entry.proposalImageUrl),
    runId: sanitizeText(entry.runId, 80),
    verified: Boolean(entry.verified),
    receiptHash: sanitizeText(entry.receiptHash, 80)
  };
};

const dedupeAndSort = (scores, limit = ALL_TIME_SCORE_LIMIT) => {
  const seen = new Set();
  const normalized = scores
    .map(sanitizeEntry)
    .filter(Boolean)
    .filter((score) => {
      const key = `${score.name}|${score.score}|${score.wave}|${score.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  normalized.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
  });

  return normalized.slice(0, limit);
};

const toLeaderboardPayload = (scores) => {
  const archive = dedupeAndSort(scores, SYNC_SCORE_LIMIT);
  return {
    scores: dedupeAndSort(archive, ALL_TIME_SCORE_LIMIT),
    monthlyScores: dedupeAndSort(archive.filter(isCurrentWeekEntry), WEEKLY_SCORE_LIMIT)
  };
};

const supabaseUrl = (path) => {
  const { url } = getSupabaseConfig();
  return `${url.replace(/\/$/, '')}/rest/v1/${path}`;
};

const supabaseHeaders = (extraHeaders = {}) => {
  const { key } = getSupabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
};

const toSupabaseRow = (entry) => ({
  name: entry.name,
  score: entry.score,
  wave: entry.wave,
  date: entry.date,
  wallet_address: entry.walletAddress || null,
  donated: Boolean(entry.donated),
  proposal_id: entry.proposalId || null,
  proposal_title: entry.proposalTitle || null,
  proposal_url: entry.proposalUrl || null,
  proposal_author: entry.proposalAuthor || null,
  proposal_image_url: entry.proposalImageUrl || null,
  run_id: entry.runId || null,
  verified: Boolean(entry.verified),
  receipt_hash: entry.receiptHash || null
});

const fromSupabaseRow = (row) => sanitizeEntry({
  name: row.name,
  score: row.score,
  wave: row.wave,
  date: row.date,
  walletAddress: row.wallet_address,
  donated: row.donated,
  proposalId: row.proposal_id,
  proposalTitle: row.proposal_title,
  proposalUrl: row.proposal_url,
  proposalAuthor: row.proposal_author,
  proposalImageUrl: row.proposal_image_url,
  runId: row.run_id,
  verified: row.verified,
  receiptHash: row.receipt_hash
});

const requestSupabaseScores = async (selectColumns, query = '') => {
  const response = await fetch(supabaseUrl(`${SUPABASE_TABLE}?select=${selectColumns}&order=score.desc,date.asc${query}`), {
    headers: supabaseHeaders()
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Supabase leaderboard fetch failed with ${response.status}: ${details}`);
  }

  return response.json();
};

const readSupabaseScores = async () => {
  const { start, end } = getCurrentWeekRange();
  const monthlyQuery = `&date=gte.${encodeURIComponent(start.toISOString())}&date=lt.${encodeURIComponent(end.toISOString())}&limit=${WEEKLY_SCORE_LIMIT}`;
  let rows;
  let monthlyRows;

  try {
    rows = await requestSupabaseScores(SUPABASE_SELECT, `&limit=${ALL_TIME_SCORE_LIMIT}`);
    monthlyRows = await requestSupabaseScores(SUPABASE_SELECT, monthlyQuery);
  } catch (error) {
    if (!isMissingProposalColumnError(error)) {
      throw error;
    }

    try {
      rows = await requestSupabaseScores(VERIFIED_SUPABASE_SELECT, `&limit=${ALL_TIME_SCORE_LIMIT}`);
      monthlyRows = await requestSupabaseScores(VERIFIED_SUPABASE_SELECT, monthlyQuery);
    } catch (verifiedError) {
      if (!isMissingProposalColumnError(verifiedError)) throw verifiedError;
      try {
        rows = await requestSupabaseScores(PROPOSAL_SUPABASE_SELECT, `&limit=${ALL_TIME_SCORE_LIMIT}`);
        monthlyRows = await requestSupabaseScores(PROPOSAL_SUPABASE_SELECT, monthlyQuery);
      } catch (proposalError) {
        if (!isMissingProposalColumnError(proposalError)) throw proposalError;
        rows = await requestSupabaseScores(LEGACY_SUPABASE_SELECT, `&limit=${ALL_TIME_SCORE_LIMIT}`);
        monthlyRows = await requestSupabaseScores(LEGACY_SUPABASE_SELECT, monthlyQuery);
      }
    }
  }

  const combinedRows = [
    ...(Array.isArray(rows) ? rows : []),
    ...(Array.isArray(monthlyRows) ? monthlyRows : [])
  ];
  const scores = combinedRows.length > 0
    ? combinedRows.map(fromSupabaseRow).filter(Boolean)
    : [];
  return dedupeAndSort(scores, SYNC_SCORE_LIMIT);
};

const insertSupabaseRows = async (rows) => {
  let response = await fetch(supabaseUrl(SUPABASE_TABLE), {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows)
  });

  if (!response.ok) {
    const details = await response.text();
    if (isDuplicateKeyError(details)) return;
    if (!isMissingProposalColumnError(new Error(details))) {
      throw new Error(`Supabase leaderboard save failed with ${response.status}: ${details}`);
    }

    const verifiedRows = rows.map(({ proposal_image_url: _proposalImageUrl, ...row }) => row);
    response = await fetch(supabaseUrl(SUPABASE_TABLE), {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(verifiedRows)
    });
    if (response.ok) return;

    const verifiedDetails = await response.text();
    if (isDuplicateKeyError(verifiedDetails)) return;
    if (!isMissingProposalColumnError(new Error(verifiedDetails))) {
      throw new Error(`Supabase leaderboard save failed with ${response.status}: ${verifiedDetails}`);
    }

    const proposalRows = verifiedRows.map((row) => ({
      name: row.name,
      score: row.score,
      wave: row.wave,
      date: row.date,
      wallet_address: row.wallet_address,
      donated: row.donated,
      proposal_id: row.proposal_id,
      proposal_title: row.proposal_title,
      proposal_url: row.proposal_url,
      proposal_author: row.proposal_author
    }));
    response = await fetch(supabaseUrl(`${SUPABASE_TABLE}?on_conflict=name,score,wave,date`), {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(proposalRows)
    });
    if (!response.ok) {
      const proposalDetails = await response.text();
      if (!isMissingProposalColumnError(new Error(proposalDetails))) {
        throw new Error(`Legacy leaderboard save failed with ${response.status}: ${proposalDetails}`);
      }
      const legacyRows = proposalRows.map((row) => ({
        name: row.name,
        score: row.score,
        wave: row.wave,
        date: row.date,
        wallet_address: row.wallet_address,
        donated: row.donated
      }));
      response = await fetch(supabaseUrl(`${SUPABASE_TABLE}?on_conflict=name,score,wave,date`), {
        method: 'POST',
        headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(legacyRows)
      });
      if (!response.ok) {
        const legacyDetails = await response.text();
        throw new Error(`Legacy leaderboard save failed with ${response.status}: ${legacyDetails}`);
      }
    }
  }
};

const writeSupabaseScores = async (scores) => {
  const rows = dedupeAndSort(scores, SYNC_SCORE_LIMIT)
    .map(toSupabaseRow);

  if (rows.length > 0) {
    await insertSupabaseRows(rows);
  }

  return readSupabaseScores();
};

const hasSubmittedRun = async (runId) => {
  const response = await fetch(supabaseUrl(`${SUPABASE_TABLE}?select=run_id&run_id=eq.${encodeURIComponent(runId)}&limit=1`), {
    headers: supabaseHeaders()
  });
  if (!response.ok) {
    const details = await response.text();
    if (isMissingProposalColumnError(new Error(details))) return false;
    throw new Error(`Run replay check failed with ${response.status}: ${details}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0;
};

const receiptMatchesVerifiedLeader = (receipt, leader) => Boolean(
  leader
  && leader.verified === true
  && receipt.integrity === 'server-verified'
  && leader.runId === receipt.runId
  && leader.score === receipt.metrics.score
  && (leader.wave ?? 1) === receipt.metrics.wave
);

const getVerifiedWeeklyLeaderForReceipt = async (receipt) => {
  const currentScores = await readScores();
  const currentLeader = toLeaderboardPayload(currentScores).monthlyScores[0];
  if (!receiptMatchesVerifiedLeader(receipt, currentLeader)) {
    throw Object.assign(new Error('This run is no longer the current weekly high score.'), { statusCode: 409 });
  }
  return { currentLeader, currentScores };
};

const createProposalSelectionChallenge = async (receipt, proposalId, requestedAddress) => {
  const normalizedProposalId = String(proposalId || '').trim();
  if (!/^\d{1,20}$/.test(normalizedProposalId)) {
    throw Object.assign(new Error('Invalid ResearchHub proposal ID.'), { statusCode: 400 });
  }

  const { currentLeader } = await getVerifiedWeeklyLeaderForReceipt(receipt);
  const leaderWallet = normalizeAddress(currentLeader.walletAddress);
  if (!leaderWallet) return { signatureRequired: false };

  const wallet = normalizeAddress(requestedAddress);
  if (!wallet || wallet !== leaderWallet) {
    throw Object.assign(new Error('Connect the Base Account associated with this weekly-leading run.'), { statusCode: 403 });
  }

  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const message = buildProposalChallengeMessage({
    receipt,
    proposalId: normalizedProposalId,
    wallet,
    challengeId,
    expiresAt
  });
  const response = await fetch(supabaseUrl(NONCES_TABLE), {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      challenge_id: challengeId,
      run_id: receipt.runId,
      wallet_address: wallet,
      message,
      expires_at: expiresAt
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Wallet challenge save failed with ${response.status}: ${details}`);
  }
  return { signatureRequired: true, challengeId, message, expiresAt };
};

const requireWalletProposalAuthorization = async ({ leader, receipt, proposalId, authorization }) => {
  const leaderWallet = normalizeAddress(leader.walletAddress);
  if (!leaderWallet) return;

  const wallet = normalizeAddress(authorization?.address);
  const challengeId = sanitizeText(authorization?.challengeId, 80);
  const signature = typeof authorization?.signature === 'string'
    ? authorization.signature.trim()
    : '';
  if (!wallet || wallet !== leaderWallet || !challengeId || !signature) {
    throw Object.assign(new Error('A Base Account signature is required to change this weekly proposal.'), { statusCode: 401 });
  }

  const challengeRows = await requestNonceRows(
    `select=*&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`
  );
  const challenge = Array.isArray(challengeRows) ? challengeRows[0] : null;
  const expiresAt = challenge?.expires_at;
  const expiresAtMs = new Date(expiresAt || 0).getTime();
  const expectedMessage = expiresAt ? buildProposalChallengeMessage({
    receipt,
    proposalId: String(proposalId),
    wallet,
    challengeId,
    expiresAt
  }) : '';
  if (
    !challenge
    || challenge.used_at
    || challenge.wallet_address?.toLowerCase() !== wallet
    || challenge.run_id !== receipt.runId
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= Date.now()
    || challenge.message !== expectedMessage
  ) {
    throw Object.assign(new Error('Weekly proposal challenge is invalid or expired.'), { statusCode: 410 });
  }

  const valid = await verifyBaseMessage({ address: wallet, message: challenge.message, signature });
  if (!valid) {
    throw Object.assign(new Error('Weekly proposal signature could not be verified.'), { statusCode: 401 });
  }

  const usedAt = new Date().toISOString();
  const consumeResponse = await fetch(supabaseUrl(
    `${NONCES_TABLE}?challenge_id=eq.${encodeURIComponent(challengeId)}&used_at=is.null`
  ), {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ used_at: usedAt })
  });
  if (!consumeResponse.ok) {
    const details = await consumeResponse.text();
    throw new Error(`Wallet challenge consumption failed with ${consumeResponse.status}: ${details}`);
  }
  const consumedRows = await consumeResponse.json();
  if (!Array.isArray(consumedRows) || consumedRows.length !== 1) {
    throw Object.assign(new Error('Weekly proposal challenge was already used.'), { statusCode: 410 });
  }
};

const selectProposalForWeeklyLeader = async (receipt, proposalId, authorization = {}) => {
  const { currentLeader, currentScores } = await getVerifiedWeeklyLeaderForReceipt(receipt);

  if (currentLeader.proposalId) {
    if (currentLeader.proposalId === String(proposalId)) {
      return { ...toLeaderboardPayload(currentScores), selectedProposal: {
        id: currentLeader.proposalId,
        title: currentLeader.proposalTitle,
        url: currentLeader.proposalUrl,
        author: currentLeader.proposalAuthor,
        imageUrl: currentLeader.proposalImageUrl
      } };
    }
  }

  const proposal = await findEligibleProposal(proposalId, {
    requiredOpenUntil: getCurrentWeekRange().end
  });

  // Eligibility lookup is remote and can take long enough for the weekly lead
  // to change. Re-check the server-owned leaderboard immediately before the
  // write rather than trusting the leader snapshot from the start of the call.
  const latestScores = await readScores();
  const latestLeader = toLeaderboardPayload(latestScores).monthlyScores[0];
  if (!receiptMatchesVerifiedLeader(receipt, latestLeader)) {
    throw Object.assign(new Error('This run is no longer the current weekly high score.'), { statusCode: 409 });
  }

  await requireWalletProposalAuthorization({
    leader: latestLeader,
    receipt,
    proposalId: proposal.id,
    authorization
  });

  const previousProposal = {
    proposal_id: latestLeader.proposalId || null,
    proposal_title: latestLeader.proposalTitle || null,
    proposal_url: latestLeader.proposalUrl || null,
    proposal_author: latestLeader.proposalAuthor || null,
    proposal_image_url: latestLeader.proposalImageUrl || null
  };
  const selectionUrl = supabaseUrl(
    `${SUPABASE_TABLE}?run_id=eq.${encodeURIComponent(receipt.runId)}`
    + `&verified=eq.true&score=eq.${receipt.metrics.score}&wave=eq.${receipt.metrics.wave}`
  );
  const proposalRow = {
    proposal_id: proposal.id,
    proposal_title: proposal.title,
    proposal_url: proposal.url,
    proposal_author: proposal.author,
    proposal_image_url: proposal.imageUrl || null
  };
  let response = await fetch(selectionUrl, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(proposalRow)
  });

  if (!response.ok) {
    let details = await response.text();
    if (isMissingProposalColumnError(new Error(details))) {
      const { proposal_image_url: _proposalImageUrl, ...compatibleRow } = proposalRow;
      response = await fetch(selectionUrl, {
        method: 'PATCH',
        headers: supabaseHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(compatibleRow)
      });
      if (!response.ok) details = await response.text();
    }
    if (!response.ok) throw new Error(`Weekly proposal save failed with ${response.status}: ${details}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error('The weekly proposal could not be attached to this score.'), { statusCode: 409 });
  }

  const scores = await readScores();
  const updatedPayload = toLeaderboardPayload(scores);
  const updatedLeader = updatedPayload.monthlyScores[0];
  if (!receiptMatchesVerifiedLeader(receipt, updatedLeader) || updatedLeader.proposalId !== proposal.id) {
    // If a new score took first place during the PATCH, restore only the exact
    // proposal value written by this request. This prevents leaving a stale
    // former leader changed after the server denies the recovery attempt.
    const rollbackUrl = `${selectionUrl}&proposal_id=eq.${encodeURIComponent(proposal.id)}`;
    const rollbackResponse = await fetch(rollbackUrl, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(previousProposal)
    }).catch(() => undefined);
    if (rollbackResponse && !rollbackResponse.ok) {
      const rollbackDetails = await rollbackResponse.text();
      if (isMissingProposalColumnError(new Error(rollbackDetails))) {
        const { proposal_image_url: _proposalImageUrl, ...compatiblePreviousProposal } = previousProposal;
        await fetch(rollbackUrl, {
          method: 'PATCH',
          headers: supabaseHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify(compatiblePreviousProposal)
        }).catch(() => undefined);
      }
    }
    throw Object.assign(new Error('This run is no longer the current weekly high score.'), { statusCode: 409 });
  }
  return { ...updatedPayload, selectedProposal: proposal };
};

const normalizeAddress = (value) => {
  const address = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(address) ? address : null;
};

const requestNonceRows = async (query) => {
  const response = await fetch(supabaseUrl(`${NONCES_TABLE}?${query}`), {
    headers: supabaseHeaders()
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Wallet challenge lookup failed with ${response.status}: ${details}`);
  }
  return response.json();
};

const buildProposalChallengeMessage = ({ receipt, proposalId, wallet, challengeId, expiresAt }) => [
  'Scicon Shooter weekly proposal selection',
  '',
  `Run: ${receipt.runId}`,
  `Score: ${receipt.metrics.score}`,
  `Wave: ${receipt.metrics.wave}`,
  `Wallet: ${wallet}`,
  `Proposal: ${proposalId}`,
  `Challenge: ${challengeId}`,
  `Expires: ${expiresAt}`,
  '',
  'Signing authorizes this proposal choice. It does not send funds or mint.'
].join('\n');

const readScores = async () => {
  if (hasSupabaseConfig()) {
    return readSupabaseScores();
  }

  throw new Error('Missing Supabase leaderboard storage config. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
};

const writeScores = async (scores) => {
  if (hasSupabaseConfig()) {
    return writeSupabaseScores(scores);
  }

  throw new Error('Missing Supabase leaderboard storage config. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
};

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return body;
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  try {
    if (req.method === 'GET') {
      const scores = await readScores();
      return sendJson(res, 200, toLeaderboardPayload(scores));
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const action = sanitizeText(body.action, 40) || 'submit-score';
      const isProposalAction = action === 'select-proposal' || action === 'select-proposal-challenge';
      const rate = checkRateLimit(req, {
        scope: isProposalAction ? 'weekly-proposal-select' : 'leaderboard-submit',
        limit: 20,
        windowMs: 10 * 60 * 1000
      });
      if (!rate.allowed) return sendJson(res, 429, { error: 'Too many score submissions. Please wait before trying again.' });
      let receipt;
      try {
        receipt = verifyRunReceipt(body.receiptToken);
      } catch (error) {
        return sendJson(res, 401, { error: 'A valid run receipt is required', details: error.message });
      }

      if (receipt.testRun) {
        return sendJson(res, 403, { error: 'Pilot Test runs are not eligible for leaderboards.' });
      }

      if (action === 'select-proposal-challenge') {
        const challenge = await createProposalSelectionChallenge(receipt, body.proposalId, body.address);
        return sendJson(res, 200, { challenge });
      }

      if (action === 'select-proposal') {
        const result = await selectProposalForWeeklyLeader(receipt, body.proposalId, {
          address: body.address,
          challengeId: body.challengeId,
          signature: body.signature
        });
        return sendJson(res, 200, result);
      }

      if (action !== 'submit-score') {
        return sendJson(res, 400, { error: 'Unknown leaderboard action.' });
      }

      const name = sanitizeText(body.name, 15)?.toUpperCase();
      if (!name) {
        return sendJson(res, 400, { error: 'Pilot name is required' });
      }

      const entry = sanitizeEntry({
        name,
        score: receipt.metrics.score,
        wave: receipt.metrics.wave,
        date: new Date(receipt.finishedAt).toISOString(),
        walletAddress: sanitizeText(body.walletAddress, 80)?.toLowerCase(),
        runId: receipt.runId,
        verified: receipt.integrity === 'server-verified',
        receiptHash: crypto.createHash('sha256').update(body.receiptToken).digest('hex')
      });

      if (!entry) {
        return sendJson(res, 400, { error: 'Missing leaderboard entry' });
      }

      if (await hasSubmittedRun(entry.runId)) {
        const scores = await readScores();
        return sendJson(res, 200, { ...toLeaderboardPayload(scores), alreadySubmitted: true });
      }

      const scores = await writeScores([entry]);
      return sendJson(res, 200, toLeaderboardPayload(scores));
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('Leaderboard API error:', error);
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    return sendJson(res, status, {
      error: status === 500 ? 'Leaderboard storage is not configured' : error.message,
      details: error.message
    });
  }
};
