const {
  fetchSupabaseJson,
  supabaseHeaders
} = require('./supabase');
const { sendBaseNotificationBroadcast } = require('./baseNotifications');

const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';
const DEFAULT_ALLOCATION_RSC = 100;
const CLAIM_WINDOW_MS = 72 * 60 * 60 * 1000;

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

const startOfUtcWeek = (date) => {
  const start = new Date(date);
  const dayOffsetFromMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - dayOffsetFromMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

const weekKeyFromStart = (start) => start.toISOString().slice(0, 10);

const getWeekRange = (weekKey) => {
  const start = new Date(`${weekKey}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey || '') || !Number.isFinite(start.getTime()) || start.getUTCDay() !== 1) {
    throw new Error('weekKey must be a Monday formatted as YYYY-MM-DD.');
  }
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
};

const getPreviousWeekKey = (now = new Date()) => {
  const currentStart = startOfUtcWeek(now);
  currentStart.setUTCDate(currentStart.getUTCDate() - 7);
  return weekKeyFromStart(currentStart);
};

const readWeeklyCompetitions = async (limit = 24) => {
  const rows = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?select=*&order=starts_at.desc&limit=${limit}`, {
    headers: supabaseHeaders()
  });
  return Array.isArray(rows) ? rows : [];
};

const readTopVerifiedScore = async (weekKey) => {
  const { start, end } = getWeekRange(weekKey);
  const query = [
    'select=name,score,wave,date,wallet_address,run_id,verified',
    'verified=eq.true',
    'order=score.desc,date.asc',
    'limit=1',
    `date=gte.${encodeURIComponent(start.toISOString())}`,
    `date=lt.${encodeURIComponent(end.toISOString())}`
  ].join('&');
  const rows = await fetchSupabaseJson(`${LEADERBOARD_TABLE}?${query}`, {
    headers: supabaseHeaders()
  });
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
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
  if (Array.isArray(existing) && existing[0]?.status && existing[0].status !== 'open') {
    return { finalized: false, weekKey, reason: 'Competition is already locked.', competition: existing[0] };
  }

  const winner = await readTopVerifiedScore(weekKey);
  if (!winner) {
    return { finalized: false, weekKey, reason: 'No verified scores were submitted for this week.' };
  }

  const finalizedAt = new Date();
  const claimDeadline = new Date(finalizedAt.getTime() + CLAIM_WINDOW_MS);
  const row = {
    week_key: weekKey,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: 'finalized',
    winner_run_id: winner.run_id,
    winner_name: winner.name,
    winner_wallet: winner.wallet_address || null,
    winning_score: winner.score,
    winning_wave: winner.wave || 1,
    finalized_at: finalizedAt.toISOString(),
    claim_deadline: claimDeadline.toISOString(),
    allocation_rsc: Number(process.env.WEEKLY_ALLOCATION_RSC) || DEFAULT_ALLOCATION_RSC,
    updated_at: finalizedAt.toISOString()
  };

  const saved = await fetchSupabaseJson(`${COMPETITIONS_TABLE}?on_conflict=week_key`, {
    method: 'POST',
    headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row)
  });
  const competition = Array.isArray(saved) ? saved[0] : row;

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
    message: `${winner.name} won the week with ${Number(winner.score).toLocaleString('en-US')} points. The champion claim window is now open.`,
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
  isAuthorized,
  parseBody,
  readWeeklyCompetitions,
  sendJson
};
