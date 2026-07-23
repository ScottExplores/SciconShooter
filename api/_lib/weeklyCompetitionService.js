const { randomUUID } = require('node:crypto');
const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const { sendBaseNotificationBroadcast } = require('./baseNotifications');
const {
  fetchOpenProposalEntries,
  resolveEligibleProposalForFinalization
} = require('./researchHubEligibility');
const {
  getCurrentWeekRange,
  getPreviousWeekKey,
  getWeekRange
} = require('../../shared/weeklyCompetitionBoundary.js');

const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const PROPOSAL_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const WEEKLY_PROPOSAL_CACHE_PREFIX = 'researchhub-open-preregistrations:week:';
// Vercel Hobby daily crons may execute anywhere inside their scheduled hour.
// Capture the complete feed during the final hour, then use the newest
// pre-cutoff snapshot available. A normal public proposal request may improve
// freshness only when its response proves that it contains the complete feed.
const MAX_CUTOFF_SNAPSHOT_AGE_MS = 61 * 60 * 1000;
const CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS = 61 * 60 * 1000;
const STABLE_WINNER_MAX_ATTEMPTS = 3;
const SCORE_SUBMISSION_SETTLEMENT_MS = 5 * 60 * 1000;
const DEFAULT_ALLOCATION_RSC = 100;
const CLAIM_WINDOW_MS = 72 * 60 * 60 * 1000;
const LEADER_PROPOSAL_SELECT = 'name,score,wave,date,wallet_address,run_id,verified,proposal_id,proposal_title,proposal_url,proposal_author';
const LEADER_PROPOSAL_IMAGE_SELECT = `${LEADER_PROPOSAL_SELECT},proposal_image_url`;
const PILOT_TEST_WALLET = String(
  process.env.PILOT_TEST_WALLET || '0x3a8d692aabdd4981080a8f6af8375a21359464bf'
).toLowerCase();

const weeklyProposalSnapshotPrefix = (weekKey) => (
  `${WEEKLY_PROPOSAL_CACHE_PREFIX}${weekKey}:snapshot:`
);

const buildWeeklyProposalSnapshotKey = (weekKey, fetchedAt) => (
  `${weeklyProposalSnapshotPrefix(weekKey)}${new Date(fetchedAt).getTime()}:${randomUUID()}`
);

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

const winnersMatch = (left, right) => {
  if (left?.run_id && right?.run_id) return left.run_id === right.run_id;
  return String(left?.name || '').trim().toUpperCase() === String(right?.name || '').trim().toUpperCase()
    && Number(left?.score) === Number(right?.score)
    && Number(left?.wave || 1) === Number(right?.wave || 1);
};

const buildCompetitionRow = ({ weekKey, start, end, winner, proposal, existing, observedAt }) => {
  const now = observedAt || new Date();
  const finalizedAt = existing?.finalized_at ? new Date(existing.finalized_at) : now;
  const safeFinalizedAt = Number.isFinite(finalizedAt.getTime()) ? finalizedAt : now;
  const existingDeadline = existing?.claim_deadline ? new Date(existing.claim_deadline) : null;
  const claimDeadline = existingDeadline && Number.isFinite(existingDeadline.getTime())
    ? existingDeadline
    : new Date(safeFinalizedAt.getTime() + CLAIM_WINDOW_MS);
  const allocationRsc = Number(existing?.allocation_rsc)
    || Number(process.env.WEEKLY_ALLOCATION_RSC)
    || DEFAULT_ALLOCATION_RSC;

  return {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: 'claimed',
    winner_run_id: winner.run_id || null,
    winner_name: winner.name,
    winner_wallet: winner.wallet_address || null,
    winning_score: winner.score,
    winning_wave: winner.wave || 1,
    finalized_at: safeFinalizedAt.toISOString(),
    claim_deadline: claimDeadline.toISOString(),
    proposal_id: proposal.id,
    proposal_title: proposal.title,
    proposal_url: proposal.url,
    proposal_author: proposal.author,
    proposal_image_url: proposal.imageUrl || null,
    allocation_rsc: allocationRsc,
    allocation_tx_hash: existing?.allocation_tx_hash || null,
    champion_token_id: existing?.champion_token_id || null,
    updated_at: now.toISOString()
  };
};

const readWeeklyProposalSnapshot = async (weekKey, { start, end }) => {
  const oldestAllowedAt = new Date(Math.max(
    start.getTime(),
    end.getTime() - MAX_CUTOFF_SNAPSHOT_AGE_MS
  ));
  const cacheKeyPattern = `${weeklyProposalSnapshotPrefix(weekKey)}*`;
  const rows = await fetchSupabaseJson(
    [
      `${PROPOSAL_CACHE_TABLE}?select=payload,fetched_at`,
      `cache_key=like.${encodeURIComponent(cacheKeyPattern)}`,
      `fetched_at=gte.${encodeURIComponent(oldestAllowedAt.toISOString())}`,
      `fetched_at=lt.${encodeURIComponent(end.toISOString())}`,
      'order=fetched_at.desc',
      'limit=100'
    ].join('&'),
    { headers: supabaseHeaders() }
  );
  const validRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const fetchedAtMs = new Date(row?.fetched_at || '').getTime();
      return row?.payload
        && Number.isFinite(fetchedAtMs)
        && fetchedAtMs >= start.getTime()
        && fetchedAtMs < end.getTime()
        && end.getTime() - fetchedAtMs <= MAX_CUTOFF_SNAPSHOT_AGE_MS
        && row.payload.complete === true
        && row.payload.source === 'weekly-cutoff-capture'
        && Array.isArray(row.payload.results);
    })
    .sort((left, right) => (
      new Date(right.fetched_at).getTime() - new Date(left.fetched_at).getTime()
    ));
  return validRows[0]?.payload.results || null;
};

const captureWeeklyProposalCutoffSnapshot = async (
  { observedAt = new Date(), completedAt } = {}
) => {
  const captureObservedAt = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(captureObservedAt.getTime())) {
    throw Object.assign(new Error('Invalid weekly proposal snapshot observation time.'), { statusCode: 400 });
  }

  const { weekKey, end } = getCurrentWeekRange(captureObservedAt);
  const millisecondsUntilCutoff = end.getTime() - captureObservedAt.getTime();
  if (
    millisecondsUntilCutoff < 0
    || millisecondsUntilCutoff > CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS
  ) {
    return {
      captured: false,
      captureAttempted: false,
      weekKey,
      reason: 'Snapshot invocation is outside the pre-cutoff capture window.'
    };
  }

  const proposalEntries = await fetchOpenProposalEntries();
  const captureCompletedAt = completedAt === undefined
    ? new Date()
    : (completedAt instanceof Date ? completedAt : new Date(completedAt));
  if (
    !Number.isFinite(captureCompletedAt.getTime())
    || captureCompletedAt.getTime() < captureObservedAt.getTime()
  ) {
    throw Object.assign(new Error('Invalid weekly proposal snapshot completion time.'), { statusCode: 400 });
  }
  if (captureCompletedAt.getTime() >= end.getTime()) {
    return {
      captured: false,
      captureAttempted: true,
      weekKey,
      reason: 'ResearchHub responded after the weekly cutoff; refusing to save a post-cutoff snapshot.'
    };
  }

  const fetchedAt = captureCompletedAt.toISOString();
  const cacheKey = buildWeeklyProposalSnapshotKey(weekKey, fetchedAt);
  await fetchSupabaseJson(PROPOSAL_CACHE_TABLE, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      cache_key: cacheKey,
      payload: {
        complete: true,
        source: 'weekly-cutoff-capture',
        results: proposalEntries
      },
      fetched_at: fetchedAt
    })
  });

  return {
    captured: true,
    captureAttempted: true,
    weekKey,
    fetchedAt,
    proposalCount: proposalEntries.length
  };
};

const resolveProposalAtWeeklyCutoff = async ({
  proposalId,
  weekKey,
  start,
  end
}) => {
  let proposalEntries = null;
  try {
    proposalEntries = await readWeeklyProposalSnapshot(weekKey, { start, end });
  } catch (error) {
    console.error('Weekly proposal cutoff snapshot read failed:', error);
  }

  if (proposalEntries) {
    return resolveEligibleProposalForFinalization(proposalId, {
      requiredOpenUntil: end,
      proposalEntries
    });
  }

  throw Object.assign(new Error(
    'The weekly proposal cutoff snapshot is unavailable; refusing to rank the week from post-cutoff ResearchHub data.'
  ), { statusCode: 409 });
};

const resolveStableWinnerAndProposal = async ({
  initialWinner,
  weekKey,
  start,
  end,
  observedAt
}) => {
  let winner = initialWinner;

  for (let attempt = 0; attempt < STABLE_WINNER_MAX_ATTEMPTS; attempt += 1) {
    const proposalResolution = await resolveProposalAtWeeklyCutoff({
      proposalId: winner.proposal_id,
      weekKey,
      start,
      end,
      observedAt
    });
    const latestWinner = await readTopEligibleScore(weekKey);
    if (!latestWinner) {
      throw Object.assign(new Error('The weekly leader disappeared during finalization.'), { statusCode: 409 });
    }
    if (winnersMatch(winner, latestWinner)) {
      return { winner: latestWinner, proposalResolution };
    }
    winner = latestWinner;
  }

  throw Object.assign(new Error(
    'The weekly leader changed repeatedly during finalization; retrying later is required.'
  ), { statusCode: 409 });
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

const finalizeWeeklyCompetition = async (
  weekKey = getPreviousWeekKey(),
  { observedAt = new Date() } = {}
) => {
  const { start, end } = getWeekRange(weekKey);
  const finalizationObservedAt = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(finalizationObservedAt.getTime())) {
    throw Object.assign(new Error('Invalid weekly finalization observation time.'), { statusCode: 400 });
  }
  if (end.getTime() + SCORE_SUBMISSION_SETTLEMENT_MS > finalizationObservedAt.getTime()) {
    const error = new Error('An open competition cannot be finalized until its score-submission settlement window closes.');
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

    const stableResult = await resolveStableWinnerAndProposal({
      initialWinner: actualWinner,
      weekKey,
      start,
      end,
      observedAt: finalizationObservedAt
    });
    if (winnerMatchesCompetition(stableResult.winner, existingCompetition)) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }
    const repairedCompetition = await saveCompetition(buildCompetitionRow({
      weekKey,
      start,
      end,
      winner: stableResult.winner,
      proposal: stableResult.proposalResolution.proposal,
      existing: existingCompetition,
      observedAt: finalizationObservedAt
    }));
    return {
      finalized: false,
      repaired: true,
      proposalSelectionSource: stableResult.proposalResolution.selectionSource,
      weekKey,
      reason: 'Archived winner reconciled with the final weekly leaderboard.',
      competition: repairedCompetition
    };
  }

  const winner = await readTopEligibleScore(weekKey);
  if (!winner) {
    return { finalized: false, weekKey, reason: 'No eligible scores were submitted for this week.' };
  }

  const stableResult = await resolveStableWinnerAndProposal({
    initialWinner: winner,
    weekKey,
    start,
    end,
    observedAt: finalizationObservedAt
  });
  const competition = await saveCompetition(buildCompetitionRow({
    weekKey,
    start,
    end,
    winner: stableResult.winner,
    proposal: stableResult.proposalResolution.proposal,
    observedAt: finalizationObservedAt
  }));

  const webhookUrl = process.env.WEEKLY_CHAMPION_WEBHOOK_URL;
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'scicon_weekly_champion_finalized',
        competition,
        proposalSelectionSource: stableResult.proposalResolution.selectionSource
      })
    }).catch((error) => console.error('Weekly champion webhook failed:', error));
  }

  const notification = await sendBaseNotificationBroadcast({
    title: 'Weekly champion locked',
    message: stableResult.proposalResolution.selectionSource === 'manual'
      ? `${stableResult.winner.name} won with ${Number(stableResult.winner.score).toLocaleString('en-US')} points and directed the weekly pick to ${stableResult.proposalResolution.proposal.title}.`
      : `${stableResult.winner.name} won with ${Number(stableResult.winner.score).toLocaleString('en-US')} points. ${stableResult.proposalResolution.proposal.title} was selected as the most-funded eligible fallback.`,
    targetPath: '/?view=trophies'
  }).catch((error) => {
    console.error('Base champion notification failed:', error);
    return { configured: true, sentCount: 0, failedCount: 0, error: true };
  });

  return {
    finalized: true,
    weekKey,
    competition,
    proposalSelectionSource: stableResult.proposalResolution.selectionSource,
    replacedProposalId: stableResult.proposalResolution.replacedProposalId || null,
    notification
  };
};

module.exports = {
  captureWeeklyProposalCutoffSnapshot,
  finalizeWeeklyCompetition,
  getPreviousWeekKey,
  getWeekRange,
  isAuthorized,
  parseBody,
  readWeeklyProposalSnapshot,
  readWeeklyCompetitions,
  resolveProposalAtWeeklyCutoff,
  sendJson
};
