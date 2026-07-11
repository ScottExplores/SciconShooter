const MAX_SCORES = 25;
const MAX_MONTHLY_SCORES = 5;
const SYNC_SCORE_LIMIT = 100;
const SUPABASE_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const { verifyRunReceipt } = require('./_lib/runReceipts');
const crypto = require('crypto');
const { checkRateLimit } = require('./_lib/rateLimit');

const LEGACY_SUPABASE_SELECT = 'name,score,wave,date,wallet_address,donated';
const SUPABASE_SELECT = `${LEGACY_SUPABASE_SELECT},proposal_id,proposal_title,proposal_url,proposal_author,run_id,verified,receipt_hash`;

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

const getCurrentWeekRange = () => {
  const now = new Date();
  const dayOffsetFromMonday = (now.getDay() + 6) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - dayOffsetFromMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return {
    start,
    end
  };
};

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
    runId: sanitizeText(entry.runId, 80),
    verified: Boolean(entry.verified),
    receiptHash: sanitizeText(entry.receiptHash, 80)
  };
};

const dedupeAndSort = (scores, limit = MAX_SCORES) => {
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
    scores: dedupeAndSort(archive, MAX_SCORES),
    monthlyScores: dedupeAndSort(archive.filter(isCurrentWeekEntry), MAX_MONTHLY_SCORES)
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
  const monthlyQuery = `&date=gte.${encodeURIComponent(start.toISOString())}&date=lt.${encodeURIComponent(end.toISOString())}&limit=${MAX_MONTHLY_SCORES}`;
  let rows;
  let monthlyRows;

  try {
    rows = await requestSupabaseScores(SUPABASE_SELECT, `&limit=${SYNC_SCORE_LIMIT}`);
    monthlyRows = await requestSupabaseScores(SUPABASE_SELECT, monthlyQuery);
  } catch (error) {
    if (!isMissingProposalColumnError(error)) {
      throw error;
    }

    rows = await requestSupabaseScores(LEGACY_SUPABASE_SELECT, `&limit=${SYNC_SCORE_LIMIT}`);
    monthlyRows = await requestSupabaseScores(LEGACY_SUPABASE_SELECT, monthlyQuery);
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
    const legacyRows = rows.map((row) => ({
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
      body: JSON.stringify(legacyRows)
    });
    if (!response.ok) {
      const legacyDetails = await response.text();
      throw new Error(`Legacy leaderboard save failed with ${response.status}: ${legacyDetails}`);
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
      const rate = checkRateLimit(req, { scope: 'leaderboard-submit', limit: 20, windowMs: 10 * 60 * 1000 });
      if (!rate.allowed) return sendJson(res, 429, { error: 'Too many score submissions. Please wait before trying again.' });
      const body = parseBody(req.body);
      let receipt;
      try {
        receipt = verifyRunReceipt(body.receiptToken);
      } catch (error) {
        return sendJson(res, 401, { error: 'A valid run receipt is required', details: error.message });
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
    return sendJson(res, 500, {
      error: 'Leaderboard storage is not configured',
      details: error.message
    });
  }
};
