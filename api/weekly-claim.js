const crypto = require('crypto');
const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { findEligibleProposal } = require('./_lib/researchHubEligibility');

const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const NONCES_TABLE = process.env.SUPABASE_WALLET_NONCES_TABLE || 'scicon_wallet_nonces';

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

const getCompetition = async (weekKey) => {
  const rows = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(weekKey)}&limit=1`, {
    headers: supabaseHeaders()
  });
  const competition = Array.isArray(rows) ? rows[0] : null;
  if (!competition) throw Object.assign(new Error('Weekly competition was not found.'), { statusCode: 404 });
  return competition;
};

const assertWinnerWallet = async (competition, address) => {
  if (competition.status !== 'finalized') throw Object.assign(new Error('This competition is not awaiting a champion claim.'), { statusCode: 409 });
  if (new Date(competition.claim_deadline).getTime() <= Date.now()) throw Object.assign(new Error('The champion claim window has closed.'), { statusCode: 410 });
  if (competition.winner_wallet && competition.winner_wallet.toLowerCase() === address) return;
  const receipts = await fetchSupabaseJson(`${RECEIPTS_TABLE}?select=wallet_address&run_id=eq.${encodeURIComponent(competition.winner_run_id)}&limit=1`, {
    headers: supabaseHeaders()
  });
  const claimedWallet = Array.isArray(receipts) ? receipts[0]?.wallet_address?.toLowerCase() : null;
  if (claimedWallet !== address) throw Object.assign(new Error('This wallet is not associated with the winning run.'), { statusCode: 403 });
};

const createChallenge = async ({ weekKey, proposalId, address }) => {
  const wallet = normalizeAddress(address);
  if (!wallet) throw Object.assign(new Error('A valid Base wallet is required.'), { statusCode: 400 });
  const [competition, proposal] = await Promise.all([getCompetition(weekKey), findEligibleProposal(proposalId)]);
  await assertWinnerWallet(competition, wallet);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
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

const completeClaim = async ({ weekKey, proposalId, address, challengeId, signature }) => {
  const wallet = normalizeAddress(address);
  if (!wallet || !challengeId || !signature) throw Object.assign(new Error('Claim signature details are incomplete.'), { statusCode: 400 });
  const [competition, proposal, challengeRows] = await Promise.all([
    getCompetition(weekKey),
    findEligibleProposal(proposalId),
    fetchSupabaseJson(`${NONCES_TABLE}?select=*&challenge_id=eq.${encodeURIComponent(challengeId)}&limit=1`, { headers: supabaseHeaders() })
  ]);
  await assertWinnerWallet(competition, wallet);
  const challenge = Array.isArray(challengeRows) ? challengeRows[0] : null;
  if (!challenge || challenge.used_at || challenge.wallet_address !== wallet || challenge.run_id !== competition.winner_run_id || new Date(challenge.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error('Champion challenge is invalid or expired.'), { statusCode: 410 });
  }
  const { verifyMessage } = await import('viem');
  const valid = await verifyMessage({ address: wallet, message: challenge.message, signature });
  if (!valid || !challenge.message.includes(`Proposal: ${proposal.id} - ${proposal.title}`)) {
    throw Object.assign(new Error('Champion signature could not be verified.'), { statusCode: 401 });
  }
  const now = new Date().toISOString();
  await Promise.all([
    fetchSupabaseJson(`${NONCES_TABLE}?challenge_id=eq.${encodeURIComponent(challengeId)}&used_at=is.null`, {
      method: 'PATCH', headers: supabaseHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ used_at: now })
    }),
    fetchSupabaseJson(`${COMPETITIONS_TABLE}?week_key=eq.${encodeURIComponent(weekKey)}&status=eq.finalized`, {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        status: 'claimed', winner_wallet: wallet, proposal_id: proposal.id, proposal_title: proposal.title,
        proposal_url: proposal.url, proposal_author: proposal.author, updated_at: now
      })
    })
  ]);
  return { weekKey, walletAddress: wallet, proposal, status: 'claimed', claimedAt: now };
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = parseBody(req.body);
    if (body.action === 'challenge') return sendJson(res, 200, await createChallenge(body));
    if (body.action === 'claim') return sendJson(res, 200, { claim: await completeClaim(body) });
    return sendJson(res, 400, { error: 'Unknown champion claim action' });
  } catch (error) {
    console.error('Weekly champion claim failed:', error);
    return sendJson(res, error.statusCode || 500, { error: error.message || 'Weekly champion claim failed' });
  }
};
