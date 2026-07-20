const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const { sendBaseNotificationBroadcast } = require('./baseNotifications');
const {
  getPreviousWeekKey,
  getWeekRange
} = require('../../shared/weeklyCompetitionBoundary.js');

const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const DEFAULT_ALLOCATION_RSC = 100;
const CLAIM_WINDOW_MS = 72 * 60 * 60 * 1000;
const LEADER_PROPOSAL_SELECT = 'name,score,wave,date,wallet_address,run_id,verified,proposal_id,proposal_title,proposal_url,proposal_author';
const LEADER_PROPOSAL_IMAGE_SELECT = `${LEADER_PROPOSAL_SELECT},proposal_image_url`;
const PILOT_TEST_WALLET = String(
  process.env.PILOT_TEST_WALLET || '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
).toLowerCase();

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  res.end(JSON.stringify(payload));
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

const isAuthorized = (req) => {
  const tokens = [process.env.ADMIN_SECRET, process.env.CRON_SECRET].filter(Boolean);
  return tokens.some((token) => req.headers.authorization === `Bearer ${token}`);
};

const readWeeklyCompetitions = async (limit = 24) => {
  const rows = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?select=*&order=starts_at.desc&limit=${limit}`, {
    headers: supabaseHeaders()
  });
  return Array.isArray(rows) ? rows : [];
};

const readTopEligibleScore = async (weekKey) => {
  const { start, end } = getWeekRange(weekKey);
  const queryFor = (selectColumns) => [
    `select=${selectColumns}`,
    'order=score.desc,date.asc',
    'limit=100',
    `date=gte.${encodeURIComponent(start.toISOString())}`,
    `date=lt.${encodeURIComponent(end.toISOString())}`
  ].join('&');
  let rows;
  try {
    rows = await fetchSupabaseJson(`${LEADERBOARD_TABLE}?${queryFor(LEADER_PROPOSAL_IMAGE_SELECT)}`, {
      headers: supabaseHeaders()
    });
  } catch (error) {
    if (!/proposal_image_url|schema cache/i.test(error?.message || '')) throw error;
    rows = await fetchSupabaseJson(`${LEADERBOARD_TABLE}?${queryFor(LEADER_PROPOSAL_SELECT)}`, {
      headers: supabaseHeaders()
    });
  }
  if (!Array.isArray(rows)) return null;

  // New submissions are server verified. Legacy leaderboard rows predate run
  // receipts but remain eligible because players saw them on the live board.
  return rows.find((row) => String(row?.wallet_address || '').toLowerCase() !== PILOT_TEST_WALLET) || null;
};

const winnerMatchesCompetition = (winner, competition) => {
  if (winner?.run_id && competition?.winner_run_id) {
    return winner.run_id === competition.winner_run_id;
  }

  return String(winner?.name || '').trim().toUpperCase() === String(competition?.winner_name || '').trim().toUpperCase()
    && Number(winner?.score) === Number(competition?.winning_score)
    && Number(winner?.wave || 1) === Number(competition?.winning_wave || 1);
};

const buildCompetitionRow = ({ weekKey, start, end, winner, existing }) => {
  const now = new Date();
  const finalizedAt = existing?.finalized_at ? new Date(existing.finalized_at) : now;
  const safeFinalizedAt = Number.isFinite(finalizedAt.getTime()) ? finalizedAt : now;
  const existingDeadline = existing?.claim_deadline ? new Date(existing.claim_deadline) : null;
  const claimDeadline = existingDeadline && Number.isFinite(existingDeadline.getTime())
    ? existingDeadline
    : new Date(safeFinalizedAt.getTime() + CLAIM_WINDOW_MS);
  const hasPreselectedProposal = Boolean(winner.proposal_id && winner.proposal_title);
  const allocationRsc = Number(existing?.allocation_rsc)
    || Number(process.env.WEEKLY_ALLOCATION_RSC)
    || DEFAULT_ALLOCATION_RSC;

  return {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: hasPreselectedProposal ? 'claimed' : 'finalized',
    winner_run_id: winner.run_id || null,
    winner_name: winner.name,
    winner_wallet: winner.wallet_address || null,
    winning_score: winner.score,
    winning_wave: winner.wave || 1,
    finalized_at: safeFinalizedAt.toISOString(),
    claim_deadline: claimDeadline.toISOString(),
    proposal_id: winner.proposal_id || null,
    proposal_title: winner.proposal_title || null,
    proposal_url: winner.proposal_url || null,
    proposal_author: winner.proposal_author || null,
    proposal_image_url: winner.proposal_image_url || null,
    allocation_rsc: allocationRsc,
    allocation_tx_hash: existing?.allocation_tx_hash || null,
    champion_token_id: existing?.champion_token_id || null,
    updated_at: now.toISOString()
  };
};

const saveCompetition = async (row) => {
  const save = (value) => fetchSupabaseJson(`${COMPETITIONS_TABLE}?on_conflict=week_key`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(value)
  });
  let saved;
  try {
    saved = await save(row);
  } catch (error) {
    if (!/proposal_image_url|schema cache/i.test(error?.message || '')) throw error;
    const { proposal_image_url: _proposalImageUrl, ...compatibleRow } = row;
    saved = await save(compatibleRow);
  }
  return Array.isArray(saved) ? saved[0] : row;
};

const finalizeWeeklyCompetition = async (weekKey = getPreviousWeekKey()) => {
  const { start, end } = getWeekRange(weekKey);
  if (end.getTime() > Date.now()) {
    const error = new Error('An open competition cannot be finalized.');
    error.statusCode = 409;
    throw error;
  }

  const existing = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(weekKey)}&limit=1`, {
    headers: supabaseHeaders()
  });
  const existingCompetition = Array.isArray(existing) ? existing[0] : null;
  if (existingCompetition?.status && existingCompetition.status !== 'open') {
    const canReconcile = ['finalized', 'claimed'].includes(existingCompetition.status)
      && !existingCompetition.allocation_tx_hash;
    if (!canReconcile) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }

    const actualWinner = await readTopEligibleScore(weekKey);
    if (!actualWinner || winnerMatchesCompetition(actualWinner, existingCompetition)) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }

    const repairedCompetition = await saveCompetition(buildCompetitionRow({
      weekKey,
      start,
      end,
      winner: actualWinner,
      existing: existingCompetition
    }));
    return {
      finalized: false,
      repaired: true,
      weekKey,
      reason: 'Archived winner reconciled with the final weekly leaderboard.',
      competition: repairedCompetition
    };
  }

  const winner = await readTopEligibleScore(weekKey);
  if (!winner) {
    return { finalized: false, weekKey, reason: 'No eligible scores were submitted for this week.' };
  }

  const hasPreselectedProposal = Boolean(winner.proposal_id && winner.proposal_title);
  const competition = await saveCompetition(buildCompetitionRow({ weekKey, start, end, winner }));

  const webhookUrl = process.env.WEEKLY_CHAMPION_WEBHOOK_URL;
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'scicon_weekly_champion_finalized', competition })
    }).catch((error) => console.error('Weekly champion webhook failed:', error));
  }

  const notification = await sendBaseNotificationBroadcast({
    title: 'Weekly champion locked',
    message: hasPreselectedProposal
      ? `${winner.name} won with ${Number(winner.score).toLocaleString('en-US')} points and directed the weekly pick to ${winner.proposal_title}.`
      : `${winner.name} won the week with ${Number(winner.score).toLocaleString('en-US')} points. The champion claim window is now open.`,
    targetPath: '/?view=trophies'
  }).catch((error) => {
    console.error('Base champion notification failed:', error);
    return { configured: true, sentCount: 0, failedCount: 0, error: true };
  });

  return { finalized: true, weekKey, competition, notification };
};

module.exports = {
  finalizeWeeklyCompetition,
  getPreviousWeekKey,
  getWeekRange,
  isAuthorized,
  parseBody,
  readWeeklyCompetitions,
  sendJson
};
