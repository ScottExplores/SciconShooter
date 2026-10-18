const { randomUUID } = require('node:crypto');
const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const { sendBaseNotificationBroadcast } = require('./baseNotifications');
const { eligibleWeeklyScoreRows } = require('./weeklyScoreEligibility');
const {
  fetchOpenProposalEntries,
  resolveEligibleProposalForFinalization
} = require('./researchHubEligibility');
const {
  getCurrentWeekRange,
  getPreviousWeekKey,
  getWeekRange,
  WEEKLY_ALLOCATION_RSC,
  WEEKLY_SCORE_SETTLEMENT_MS
} = require('../../shared/weeklyCompetitionBoundary.js');

const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const PROPOSAL_CACHE_TABLE = process.env.SUPABASE_PROPOSAL_CACHE_TABLE || 'scicon_proposal_cache';
const WEEKLY_PROPOSAL_CACHE_PREFIX = 'researchhub-open-preregistrations:week:';
// Vercel Hobby daily crons may execute anywhere inside their scheduled hour.
// A two-hour window gives both Pacific time offsets a full, reliable capture
// opportunity before the Sunday noon boundary. The snapshot is still required
// for proposal ranking, but it must never prevent the winner itself from being
// archived.
const MAX_CUTOFF_SNAPSHOT_AGE_MS = 121 * 60 * 1000;
const CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS = 121 * 60 * 1000;
const STABLE_WINNER_MAX_ATTEMPTS = 3;
const RECENT_COMPETITION_BACKFILL_WEEKS = 3;
const CLAIM_WINDOW_MS = 72 * 60 * 60 * 1000;
const TERMINAL_WEEKLY_COMPETITION_STATUSES = new Set(['finalized', 'claimed', 'pending-funding', 'funded', 'expired']);
const LEADER_PROPOSAL_SELECT = 'name,score,wave,date,wallet_address,run_id,verified,receipt_hash,proposal_id,proposal_title,proposal_url,proposal_author';
const LEADER_PROPOSAL_IMAGE_SELECT = `${LEADER_PROPOSAL_SELECT},proposal_image_url`;

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

const isTerminalWeeklyCompetition = (competition) => (
  TERMINAL_WEEKLY_COMPETITION_STATUSES.has(String(competition?.status || '').toLowerCase())
);

const getCompletedWeeklyCompetitionKeys = (competitions = []) => (
  [...new Set(
    (Array.isArray(competitions) ? competitions : [])
      .filter(isTerminalWeeklyCompetition)
      .map((competition) => String(competition?.week_key || '').trim())
      .filter(Boolean)
  )]
);

const readTopEligibleScore = async (weekKey) => {
  const { start, end } = getWeekRange(weekKey);
  const queryFor = (selectColumns, offset) => [
    `select=${selectColumns}`,
    'order=score.desc,date.asc,run_id.asc',
    'verified=eq.true',
    'run_id=not.is.null',
    'limit=100',
    `offset=${offset}`,
    `date=gte.${encodeURIComponent(start.toISOString())}`,
    `date=lt.${encodeURIComponent(end.toISOString())}`
  ].join('&');
  // REVAMP(E): Invalid historic rows must not crowd a valid winner out of the
  // first page. Bound work and fail closed rather than archive a false empty week.
  for (let offset = 0; offset < 10_000; offset += 100) {
    let rows;
    try {
      rows = await fetchSupabaseJson(`${LEADERBOARD_TABLE}?${queryFor(LEADER_PROPOSAL_IMAGE_SELECT, offset)}`, {
        headers: supabaseHeaders()
      });
    } catch (error) {
      if (!/proposal_image_url|schema cache/i.test(error?.message || '')) throw error;
      rows = await fetchSupabaseJson(`${LEADERBOARD_TABLE}?${queryFor(LEADER_PROPOSAL_SELECT, offset)}`, {
        headers: supabaseHeaders()
      });
    }
    const candidates = await eligibleWeeklyScoreRows(rows, { start, end });
    if (candidates.length) return candidates[0];
    if (!Array.isArray(rows) || rows.length < 100) return null;
  }
  throw Object.assign(new Error('Weekly winner scan exceeded its safe limit; manual review is required.'), {
    statusCode: 503, code: 'WEEKLY_WINNER_REVIEW_REQUIRED'
  });
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

const proposalFromWinnerRecord = (winner) => {
  const id = String(winner?.proposal_id || '').trim();
  const title = String(winner?.proposal_title || '').trim();
  if (!/^\d{1,20}$/.test(id) || !title) return null;

  const rawUrl = String(winner?.proposal_url || '').trim();
  const rawImageUrl = String(winner?.proposal_image_url || '').trim();
  return {
    id,
    title: title.slice(0, 180),
    url: /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://www.researchhub.com/fund',
    author: String(winner?.proposal_author || '').trim().slice(0, 100) || 'ResearchHub researcher',
    imageUrl: /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : null
  };
};

const buildCompetitionRow = ({
  weekKey,
  start,
  end,
  winner,
  proposal,
  existing,
  observedAt
}) => {
  const now = observedAt || new Date();
  const finalizedAt = existing?.finalized_at ? new Date(existing.finalized_at) : now;
  const safeFinalizedAt = Number.isFinite(finalizedAt.getTime()) ? finalizedAt : now;
  const existingDeadline = existing?.claim_deadline ? new Date(existing.claim_deadline) : null;
  const claimDeadline = existingDeadline && Number.isFinite(existingDeadline.getTime())
    ? existingDeadline
    : new Date(safeFinalizedAt.getTime() + CLAIM_WINDOW_MS);
  const allocationRsc = Number(existing?.allocation_rsc)
    || Number(process.env.WEEKLY_ALLOCATION_RSC)
    || WEEKLY_ALLOCATION_RSC;

  return {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    // Archiving a proposal choice is not proof that the champion signed the
    // weekly claim. A run may have been wallet-associated after a guest made
    // the choice, so only the signed weekly-claim CAS may advance this row.
    status: 'finalized',
    winner_run_id: winner.run_id || null,
    winner_name: winner.name,
    winner_wallet: winner.wallet_address || null,
    winning_score: winner.score,
    winning_wave: winner.wave || 1,
    finalized_at: safeFinalizedAt.toISOString(),
    claim_deadline: claimDeadline.toISOString(),
    proposal_id: proposal?.id || null,
    proposal_title: proposal?.title || null,
    proposal_url: proposal?.url || null,
    proposal_author: proposal?.author || null,
    proposal_image_url: proposal?.imageUrl || null,
    allocation_rsc: allocationRsc,
    allocation_tx_hash: existing?.allocation_tx_hash || null,
    champion_token_id: existing?.champion_token_id || null,
    updated_at: now.toISOString()
  };
};

const buildExpiredCompetitionRow = ({ weekKey, start, end, existing, observedAt }) => {
  const now = observedAt || new Date();
  const allocationRsc = Number(existing?.allocation_rsc)
    || Number(process.env.WEEKLY_ALLOCATION_RSC)
    || WEEKLY_ALLOCATION_RSC;
  return {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: 'expired',
    winner_run_id: null,
    winner_name: null,
    winner_wallet: null,
    winning_score: null,
    winning_wave: null,
    finalized_at: now.toISOString(),
    claim_deadline: null,
    proposal_id: null,
    proposal_title: null,
    proposal_url: null,
    proposal_author: null,
    proposal_image_url: null,
    allocation_rsc: allocationRsc,
    allocation_tx_hash: null,
    champion_token_id: null,
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

const resolveProposalForArchivedWinner = async ({ winner, weekKey, start, end }) => {
  try {
    const resolution = await resolveProposalAtWeeklyCutoff({
      proposalId: winner.proposal_id,
      weekKey,
      start,
      end
    });
    return { ...resolution, resolutionPending: false, verifiedAtCutoff: true };
  } catch (error) {
    // The leaderboard row preserves a proposal the leader selected while the
    // week was open. It can safely repair history without ranking an old week
    // from today's ResearchHub feed.
    const preservedProposal = proposalFromWinnerRecord(winner);
    if (preservedProposal) {
      console.warn('Weekly proposal cutoff resolution unavailable; preserving the winner selection:', {
        weekKey,
        error: error?.message || String(error)
      });
      return {
        proposal: preservedProposal,
        selectionSource: 'winner_record',
        resolutionPending: true,
        verifiedAtCutoff: false,
        resolutionWarning: error?.message || 'Cutoff proposal snapshot unavailable.'
      };
    }

    // Winner history and proposal allocation are separate concerns. Archive
    // the champion now and leave proposal verification pending instead of
    // dropping the entire Past Picks row when an external feed is unavailable.
    console.error('Weekly proposal resolution pending; archiving winner without a proposal:', {
      weekKey,
      error: error?.message || String(error)
    });
    return {
      proposal: null,
      selectionSource: 'pending',
      resolutionPending: true,
      verifiedAtCutoff: false,
      resolutionWarning: error?.message || 'Cutoff proposal snapshot unavailable.'
    };
  }
};

const resolveStableWinner = async ({ initialWinner, weekKey }) => {
  let winner = initialWinner;

  for (let attempt = 0; attempt < STABLE_WINNER_MAX_ATTEMPTS; attempt += 1) {
    const latestWinner = await readTopEligibleScore(weekKey);
    if (!latestWinner) {
      throw Object.assign(new Error('The weekly leader disappeared during finalization.'), { statusCode: 409 });
    }
    if (winnersMatch(winner, latestWinner)) {
      return latestWinner;
    }
    winner = latestWinner;
  }

  throw Object.assign(new Error(
    'The weekly leader changed repeatedly during finalization; retrying later is required.'
  ), { statusCode: 409 });
};

const readCompetitionByWeekKey = async (weekKey) => {
  const rows = await fetchSupabaseJson(
    `${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(weekKey)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) ? (rows[0] || null) : null;
};

const isCompetitionInsertConflict = (error) => (
  /(?:status\s*409|with 409|23505|duplicate key|unique constraint)/i.test(error?.message || '')
);

const saveInitialCompetitionIfCurrent = async (row, existing) => {
  const filters = existing ? [
    'select=*',
    `week_key=eq.${encodeURIComponent(existing.week_key)}`,
    'status=eq.open'
  ] : null;
  if (filters && existing.updated_at && Number.isFinite(Date.parse(existing.updated_at))) {
    filters.push(`updated_at=eq.${encodeURIComponent(existing.updated_at)}`);
  }
  const write = (value) => fetchSupabaseJson(
    filters ? `${COMPETITIONS_TABLE}?${filters.join('&')}` : COMPETITIONS_TABLE,
    {
      method: filters ? 'PATCH' : 'POST',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(value)
    }
  );

  let saved;
  try {
    saved = await write(row);
  } catch (error) {
    if (/proposal_image_url|schema cache/i.test(error?.message || '')) {
      const { proposal_image_url: _proposalImageUrl, ...compatibleRow } = row;
      try {
        saved = await write(compatibleRow);
      } catch (compatibleError) {
        if (!isCompetitionInsertConflict(compatibleError)) throw compatibleError;
      }
    } else if (!isCompetitionInsertConflict(error)) {
      throw error;
    }
  }

  if (Array.isArray(saved) && saved.length > 1) {
    throw Object.assign(new Error('Initial weekly competition commit affected more than one row.'), {
      statusCode: 503,
      code: 'WEEKLY_COMPETITION_COMMIT_UNCONFIRMED'
    });
  }
  if (Array.isArray(saved) && saved.length === 1) {
    return { committed: true, competition: saved[0] };
  }
  return {
    committed: false,
    competition: await readCompetitionByWeekKey(row.week_key)
  };
};

const competitionValueFilter = (column, value) => (
  value === null || value === undefined || value === ''
    ? `${column}=is.null`
    : `${column}=eq.${encodeURIComponent(value)}`
);

const saveFinalizedCompetitionIfCurrent = async (row, existing) => {
  const filters = [
    `select=*`,
    `week_key=eq.${encodeURIComponent(existing.week_key)}`,
    'status=eq.finalized',
    competitionValueFilter('winner_run_id', existing.winner_run_id)
  ];
  if (existing.updated_at && Number.isFinite(Date.parse(existing.updated_at))) {
    filters.push(`updated_at=eq.${encodeURIComponent(existing.updated_at)}`);
  }
  const url = `${COMPETITIONS_TABLE}?${filters.join('&')}`;
  const patch = (value) => fetchSupabaseJson(url, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(value)
  });

  let saved;
  try {
    saved = await patch(row);
  } catch (error) {
    if (!/proposal_image_url|schema cache/i.test(error?.message || '')) throw error;
    const { proposal_image_url: _proposalImageUrl, ...compatibleRow } = row;
    saved = await patch(compatibleRow);
  }

  if (!Array.isArray(saved) || saved.length > 1) {
    throw Object.assign(new Error('Weekly competition reconciliation could not confirm one saved row.'), {
      statusCode: 503,
      code: 'WEEKLY_COMPETITION_COMMIT_UNCONFIRMED'
    });
  }
  if (saved.length === 1) return { committed: true, competition: saved[0] };

  const currentRows = await fetchSupabaseJson(
    `${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(existing.week_key)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  return {
    committed: false,
    competition: Array.isArray(currentRows) ? (currentRows[0] || null) : null
  };
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
  if (end.getTime() + WEEKLY_SCORE_SETTLEMENT_MS > finalizationObservedAt.getTime()) {
    const error = new Error('An open competition cannot be finalized until its score-submission settlement window closes.');
    error.statusCode = 409;
    throw error;
  }

  const existingCompetition = await readCompetitionByWeekKey(weekKey);
  if (existingCompetition?.status && existingCompetition.status !== 'open') {
    const canReconcile = existingCompetition.status === 'finalized'
      && !existingCompetition.allocation_tx_hash;
    if (!canReconcile) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }

    const actualWinner = await readTopEligibleScore(weekKey);
    if (!actualWinner) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }

    if (winnerMatchesCompetition(actualWinner, existingCompetition)) {
      if (existingCompetition.proposal_id || existingCompetition.status === 'claimed') {
        return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
      }
      const proposalResolution = await resolveProposalForArchivedWinner({
        winner: actualWinner,
        weekKey,
        start,
        end
      });
      if (!proposalResolution.proposal) {
        return {
          finalized: false,
          proposalResolutionPending: true,
          weekKey,
          reason: 'Winner is archived; proposal verification is still pending.',
          competition: existingCompetition
        };
      }
      const enrichment = await saveFinalizedCompetitionIfCurrent(buildCompetitionRow({
        weekKey,
        start,
        end,
        winner: actualWinner,
        proposal: proposalResolution.proposal,
        existing: existingCompetition,
        observedAt: finalizationObservedAt
      }), existingCompetition);
      if (!enrichment.committed) {
        return {
          finalized: false,
          raceLost: true,
          weekKey,
          reason: 'Competition changed while its proposal was being restored.',
          competition: enrichment.competition
        };
      }
      const enrichedCompetition = enrichment.competition;
      return {
        finalized: false,
        enriched: true,
        proposalSelectionSource: proposalResolution.selectionSource,
        weekKey,
        reason: 'Archived winner proposal was restored.',
        competition: enrichedCompetition
      };
    }

    const stableWinner = await resolveStableWinner({ initialWinner: actualWinner, weekKey });
    if (winnerMatchesCompetition(stableWinner, existingCompetition)) {
      return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existingCompetition };
    }
    const proposalResolution = await resolveProposalForArchivedWinner({
      winner: stableWinner,
      weekKey,
      start,
      end
    });
    const repair = await saveFinalizedCompetitionIfCurrent(buildCompetitionRow({
      weekKey,
      start,
      end,
      winner: stableWinner,
      proposal: proposalResolution.proposal,
      existing: existingCompetition,
      observedAt: finalizationObservedAt
    }), existingCompetition);
    if (!repair.committed) {
      return {
        finalized: false,
        raceLost: true,
        weekKey,
        reason: 'Competition changed while its winner was being reconciled.',
        competition: repair.competition
      };
    }
    const repairedCompetition = repair.competition;
    return {
      finalized: false,
      repaired: true,
      proposalSelectionSource: proposalResolution.selectionSource,
      proposalResolutionPending: proposalResolution.resolutionPending,
      weekKey,
      reason: 'Archived winner reconciled with the final weekly leaderboard.',
      competition: repairedCompetition
    };
  }

  const winner = await readTopEligibleScore(weekKey);
  if (!winner) {
    const closure = await saveInitialCompetitionIfCurrent(buildExpiredCompetitionRow({
      weekKey,
      start,
      end,
      existing: existingCompetition,
      observedAt: finalizationObservedAt
    }), existingCompetition);
    if (!closure.committed) {
      return {
        finalized: false,
        raceLost: true,
        weekKey,
        reason: 'Competition changed while the empty week was being closed.',
        competition: closure.competition
      };
    }
    const competition = closure.competition;
    return {
      finalized: true,
      empty: true,
      weekKey,
      reason: 'No eligible scores were submitted; the empty week is closed.',
      competition
    };
  }

  const stableWinner = await resolveStableWinner({ initialWinner: winner, weekKey });
  const proposalResolution = await resolveProposalForArchivedWinner({
    winner: stableWinner,
    weekKey,
    start,
    end
  });
  const finalization = await saveInitialCompetitionIfCurrent(buildCompetitionRow({
    weekKey,
    start,
    end,
    winner: stableWinner,
    proposal: proposalResolution.proposal,
    observedAt: finalizationObservedAt
  }), existingCompetition);
  if (!finalization.committed) {
    return {
      finalized: false,
      raceLost: true,
      weekKey,
      reason: 'Competition changed while its winner was being finalized.',
      competition: finalization.competition
    };
  }
  const competition = finalization.competition;

  const webhookUrl = process.env.WEEKLY_CHAMPION_WEBHOOK_URL;
  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'scicon_weekly_champion_finalized',
        competition,
        proposalSelectionSource: proposalResolution.selectionSource
      })
    }).catch((error) => console.error('Weekly champion webhook failed:', error));
  }

  const notification = await sendBaseNotificationBroadcast({
    title: 'Weekly champion locked',
    message: `${stableWinner.name} won with ${Number(stableWinner.score).toLocaleString('en-US')} points. Their signed weekly proposal claim is still pending.`,
    targetPath: '/?view=trophies'
  }).catch((error) => {
    console.error('Base champion notification failed:', error);
    return { configured: true, sentCount: 0, failedCount: 0, error: true };
  });

  return {
    finalized: true,
    weekKey,
    competition,
    proposalSelectionSource: proposalResolution.selectionSource,
    proposalResolutionPending: proposalResolution.resolutionPending,
    replacedProposalId: proposalResolution.replacedProposalId || null,
    notification
  };
};

const ensureRecentWeeklyCompetitions = async ({
  observedAt = new Date(),
  existingCompetitions,
  lookbackWeeks = RECENT_COMPETITION_BACKFILL_WEEKS
} = {}) => {
  const recoveryObservedAt = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (!Number.isFinite(recoveryObservedAt.getTime())) {
    throw Object.assign(new Error('Invalid weekly recovery observation time.'), { statusCode: 400 });
  }

  // Receipt capabilities are sized to this fixed recovery horizon. Do not let
  // a caller silently widen it and create competitions whose guest winner can
  // no longer authenticate during the claim window.
  const safeLookback = Math.max(
    1,
    Math.min(RECENT_COMPETITION_BACKFILL_WEEKS, Math.floor(Number(lookbackWeeks) || 1))
  );
  const competitions = Array.isArray(existingCompetitions)
    ? existingCompetitions
    : await readWeeklyCompetitions(Math.max(24, safeLookback));
  const completedWeekKeys = new Set(getCompletedWeeklyCompetitionKeys(competitions));
  const results = [];
  let weekKey = getPreviousWeekKey(recoveryObservedAt);

  for (let index = 0; index < safeLookback; index += 1) {
    const range = getWeekRange(weekKey);
    const nextWeekKey = getPreviousWeekKey(range.start);
    if (
      !completedWeekKeys.has(weekKey)
      && range.end.getTime() + WEEKLY_SCORE_SETTLEMENT_MS <= recoveryObservedAt.getTime()
    ) {
      try {
        const result = await finalizeWeeklyCompetition(weekKey, { observedAt: recoveryObservedAt });
        results.push({ weekKey, ok: true, result });
        if (isTerminalWeeklyCompetition(result.competition)) completedWeekKeys.add(weekKey);
      } catch (error) {
        console.error('Weekly competition recovery failed:', {
          weekKey,
          error: error?.message || String(error)
        });
        results.push({ weekKey, ok: false, error: error?.message || String(error) });
      }
    }
    weekKey = nextWeekKey;
  }

  const changed = results.some(({ result }) => (
    result?.finalized || result?.repaired || result?.enriched
  ));
  return { attempted: results.length > 0, changed, results };
};

module.exports = {
  captureWeeklyProposalCutoffSnapshot,
  ensureRecentWeeklyCompetitions,
  finalizeWeeklyCompetition,
  getCompletedWeeklyCompetitionKeys,
  getPreviousWeekKey,
  getWeekRange,
  isAuthorized,
  parseBody,
  readWeeklyProposalSnapshot,
  readWeeklyCompetitions,
  readTopEligibleScore,
  resolveProposalAtWeeklyCutoff,
  sendJson
};
