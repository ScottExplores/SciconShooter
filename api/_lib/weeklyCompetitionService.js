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
// A two-hour window gives both Pacific time offsets a full, reliable capture
// opportunity before the Sunday noon boundary. The snapshot is still required
// for proposal ranking, but it must never prevent the winner itself from being
// archived.
const MAX_CUTOFF_SNAPSHOT_AGE_MS = 121 * 60 * 1000;
const CUTOFF_SNAPSHOT_CAPTURE_WINDOW_MS = 121 * 60 * 1000;
const STABLE_WINNER_MAX_ATTEMPTS = 3;
const SCORE_SUBMISSION_SETTLEMENT_MS = 5 * 60 * 1000;
const RECENT_COMPETITION_BACKFILL_WEEKS = 3;
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
  proposalVerifiedAtCutoff = Boolean(proposal),
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
    || DEFAULT_ALLOCATION_RSC;

  return {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: proposal && proposalVerifiedAtCutoff ? 'claimed' : 'finalized',
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
  return Array.isArray(saved) ? (saved[0] || row) : row;
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
      const enrichedCompetition = await saveCompetition(buildCompetitionRow({
        weekKey,
        start,
        end,
        winner: actualWinner,
        proposal: proposalResolution.proposal,
        proposalVerifiedAtCutoff: proposalResolution.verifiedAtCutoff,
        existing: existingCompetition,
        observedAt: finalizationObservedAt
      }));
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
    const repairedCompetition = await saveCompetition(buildCompetitionRow({
      weekKey,
      start,
      end,
      winner: stableWinner,
      proposal: proposalResolution.proposal,
      proposalVerifiedAtCutoff: proposalResolution.verifiedAtCutoff,
      existing: existingCompetition,
      observedAt: finalizationObservedAt
    }));
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
    return { finalized: false, weekKey, reason: 'No eligible scores were submitted for this week.' };
  }

  const stableWinner = await resolveStableWinner({ initialWinner: winner, weekKey });
  const proposalResolution = await resolveProposalForArchivedWinner({
    winner: stableWinner,
    weekKey,
    start,
    end
  });
  const competition = await saveCompetition(buildCompetitionRow({
    weekKey,
    start,
    end,
    winner: stableWinner,
    proposal: proposalResolution.proposal,
    proposalVerifiedAtCutoff: proposalResolution.verifiedAtCutoff,
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
        proposalSelectionSource: proposalResolution.selectionSource
      })
    }).catch((error) => console.error('Weekly champion webhook failed:', error));
  }

  const notification = await sendBaseNotificationBroadcast({
    title: 'Weekly champion locked',
    message: proposalResolution.proposal && !proposalResolution.resolutionPending
      ? (proposalResolution.selectionSource === 'automatic_fallback'
          ? `${stableWinner.name} won with ${Number(stableWinner.score).toLocaleString('en-US')} points. ${proposalResolution.proposal.title} was selected as the most-funded eligible fallback.`
          : `${stableWinner.name} won with ${Number(stableWinner.score).toLocaleString('en-US')} points and directed the weekly pick to ${proposalResolution.proposal.title}.`)
      : `${stableWinner.name} won with ${Number(stableWinner.score).toLocaleString('en-US')} points. Proposal verification is pending.`,
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

  const safeLookback = Math.max(1, Math.min(8, Math.floor(Number(lookbackWeeks) || 1)));
  const competitions = Array.isArray(existingCompetitions)
    ? existingCompetitions
    : await readWeeklyCompetitions(Math.max(24, safeLookback));
  const archivedWeekKeys = new Set(competitions.map((competition) => competition?.week_key).filter(Boolean));
  const results = [];
  let weekKey = getPreviousWeekKey(recoveryObservedAt);

  for (let index = 0; index < safeLookback; index += 1) {
    const range = getWeekRange(weekKey);
    const nextWeekKey = getPreviousWeekKey(range.start);
    if (
      !archivedWeekKeys.has(weekKey)
      && range.end.getTime() + SCORE_SUBMISSION_SETTLEMENT_MS <= recoveryObservedAt.getTime()
    ) {
      try {
        const result = await finalizeWeeklyCompetition(weekKey, { observedAt: recoveryObservedAt });
        results.push({ weekKey, ok: true, result });
        if (result.competition) archivedWeekKeys.add(weekKey);
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
  getPreviousWeekKey,
  getWeekRange,
  isAuthorized,
  parseBody,
  readWeeklyProposalSnapshot,
  readWeeklyCompetitions,
  resolveProposalAtWeeklyCutoff,
  sendJson
};
