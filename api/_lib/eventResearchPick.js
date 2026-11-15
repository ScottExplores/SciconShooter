const { getPublicPrizeState } = require('../../shared/weeklyCompetitionBoundary.js');
const { findEligibleProposal } = require('./researchHubEligibility');
const { findEligibleRfp } = require('./researchHubRfps');
const { founderWalletAddress } = require('./founderWallet');
const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');

const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const CLOSED_PICK_MESSAGE = 'That pick has closed. Choose an open one.';
const PAYOUT_NEEDS_PICK_MESSAGE = 'Winner must choose a new open RFP or proposal.';

const pickIdOf = (record) => String(record?.proposalId || record?.proposal_id || '').trim();

const pickUrlOf = (record) => String(record?.proposalUrl || record?.proposal_url || '');

const storedPickKind = (record) => (
  /\/rfp\//i.test(pickUrlOf(record)) ? 'rfp' : 'proposal'
);

const eventResearchWindow = (now = new Date()) => {
  const prize = getPublicPrizeState(now);
  return {
    active: prize.phase !== 'weekly',
    phase: prize.phase,
    requiredOpenUntil: prize.proposalOpenUntil,
    prize
  };
};

// A stored pick may be replaced only while the 25K event is the live prize
// and that exact pick is known to be ineligible. Unknown eligibility stays locked.
const eventPickLockDecision = ({
  eventActive,
  storedId,
  requestedId,
  storedEligible
}) => {
  const stored = String(storedId || '').trim();
  const requested = String(requestedId || '').trim();
  if (!stored) return 'create';
  if (stored === requested) {
    return eventActive && storedEligible === false ? 'reject-closed' : 'keep';
  }
  if (!eventActive || storedEligible !== false) return 'reject-locked';
  return 'replace';
};

const lookupEligiblePick = (id, kind, requiredOpenUntil) => (
  kind === 'rfp'
    ? findEligibleRfp(id, { requiredOpenUntil })
    : findEligibleProposal(id, { requiredOpenUntil })
);

const storedPickIsEligible = async (record, requiredOpenUntil) => {
  const id = pickIdOf(record);
  if (!/^\d{1,20}$/.test(id)) return false;
  try {
    await lookupEligiblePick(id, storedPickKind(record), requiredOpenUntil);
    return true;
  } catch (error) {
    if (error?.statusCode === 409 || error?.statusCode === 400) return false;
    throw error;
  }
};

const classifyStoredPick = async (record, requestedId, now = new Date()) => {
  const window = eventResearchWindow(now);
  const storedId = pickIdOf(record);
  let storedEligible = null;
  if (window.active && storedId) {
    storedEligible = await storedPickIsEligible(record, window.requiredOpenUntil);
  }
  return eventPickLockDecision({
    eventActive: window.active,
    storedId,
    requestedId,
    storedEligible
  });
};

const closedPickError = () => Object.assign(new Error(CLOSED_PICK_MESSAGE), {
  statusCode: 409,
  code: 'RESEARCH_PICK_CLOSED'
});

const readEventLeader = async (prize) => {
  const start = prize.scoreWindow.start.toISOString();
  const end = prize.scoreWindow.end.toISOString();
  const rows = await fetchSupabaseJson(
    [
      `${LEADERBOARD_TABLE}?select=name,score,wave,date,wallet_address,run_id,verified,proposal_id,proposal_title,proposal_url`,
      `date=gte.${encodeURIComponent(start)}`,
      `date=lt.${encodeURIComponent(end)}`,
      'order=score.desc,date.asc',
      'limit=50'
    ].join('&'),
    { headers: supabaseHeaders() }
  );
  const founder = founderWalletAddress();
  return (Array.isArray(rows) ? rows : []).find((row) => (
    row?.verified === true
    && Boolean(row?.run_id)
    && String(row?.wallet_address || '').toLowerCase() !== founder
  )) || null;
};

const assessEventPayout = async ({ now = new Date(), leader } = {}) => {
  const window = eventResearchWindow(now);
  if (!window.active) {
    return {
      active: false,
      phase: window.phase,
      needsNewPick: false,
      fundsRedirected: false,
      reason: 'weekly'
    };
  }

  const winner = leader === undefined ? await readEventLeader(window.prize) : leader;
  const proposalId = pickIdOf(winner);
  const base = {
    active: true,
    phase: window.phase,
    fundsRedirected: false,
    winnerName: winner?.name || null,
    winnerRunId: winner?.run_id || winner?.runId || null,
    proposalId: proposalId || null,
    proposalTitle: winner?.proposal_title || winner?.proposalTitle || null
  };
  if (!winner || !proposalId) {
    return {
      ...base,
      needsNewPick: true,
      reason: 'missing',
      message: PAYOUT_NEEDS_PICK_MESSAGE
    };
  }

  try {
    const eligible = await storedPickIsEligible(winner, window.requiredOpenUntil);
    if (!eligible) {
      return {
        ...base,
        needsNewPick: true,
        reason: 'closed',
        message: PAYOUT_NEEDS_PICK_MESSAGE
      };
    }
    return {
      ...base,
      needsNewPick: false,
      reason: 'eligible'
    };
  } catch {
    return {
      ...base,
      needsNewPick: null,
      reason: 'unknown',
      message: 'Pick status could not be checked. Funds were not redirected.'
    };
  }
};

module.exports = {
  CLOSED_PICK_MESSAGE,
  PAYOUT_NEEDS_PICK_MESSAGE,
  assessEventPayout,
  classifyStoredPick,
  closedPickError,
  eventPickLockDecision,
  eventResearchWindow,
  storedPickIsEligible,
  storedPickKind
};
