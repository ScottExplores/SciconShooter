const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const {
  approveClaimedSelection,
  recordManualFundingTransfer
} = require('../shared/weeklyFundingApproval');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
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

const COMPETITIONS_TABLE = process.env.SUPABASE_WEEKLY_COMPETITIONS_TABLE || 'scicon_weekly_competitions';

const getCompetition = async (weekKey) => {
  const key = String(weekKey || '').trim();
  if (!key) {
    throw Object.assign(new Error('A week key is required.'), {
      statusCode: 400,
      code: 'WEEKLY_FUNDING_WEEK_REQUIRED'
    });
  }
  const rows = await fetchSupabaseJson(
    `${COMPETITIONS_TABLE}?select=*&week_key=eq.${encodeURIComponent(key)}&limit=1`,
    { headers: supabaseHeaders() }
  );
  const competition = Array.isArray(rows) ? rows[0] : null;
  if (!competition) {
    throw Object.assign(new Error('Weekly competition was not found.'), {
      statusCode: 404,
      code: 'WEEKLY_FUNDING_WEEK_MISSING'
    });
  }
  return competition;
};

const commitPatch = async (competition, patch) => {
  const url = [
    COMPETITIONS_TABLE,
    '?select=*',
    `&week_key=eq.${encodeURIComponent(competition.week_key)}`,
    `&status=eq.${encodeURIComponent(competition.status)}`,
    competition.updated_at && Number.isFinite(Date.parse(competition.updated_at))
      ? `&updated_at=eq.${encodeURIComponent(competition.updated_at)}`
      : ''
  ].join('');
  const saved = await fetchSupabaseJson(url, {
    method: 'PATCH',
    headers: supabaseHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      ...patch,
      updated_at: new Date().toISOString()
    })
  });
  if (!Array.isArray(saved) || saved.length !== 1) {
    throw Object.assign(new Error('The funding row changed before this approval could be saved.'), {
      statusCode: 409,
      code: 'WEEKLY_FUNDING_CONFLICT'
    });
  }
  return saved[0];
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!isAuthorized(req)) {
    return sendJson(res, 401, {
      error: 'Admin approval is required. This route does not transfer funds.',
      code: 'WEEKLY_FUNDING_ADMIN_REQUIRED'
    });
  }

  try {
    const body = parseBody(req.body);
    const action = String(body.action || '');
    const competition = await getCompetition(body.weekKey);
    if (action === 'approve') {
      const decision = approveClaimedSelection(competition);
      const saved = decision.patch ? await commitPatch(competition, decision.patch) : competition;
      return sendJson(res, 200, {
        funding: {
          ...decision.record,
          status: saved.status,
          alreadyApproved: decision.alreadyApproved,
          transfersFunds: false
        }
      });
    }
    if (action === 'record-transfer') {
      const decision = recordManualFundingTransfer(competition, body.txHash);
      const saved = decision.patch ? await commitPatch(competition, decision.patch) : competition;
      return sendJson(res, 200, {
        funding: {
          ...decision.record,
          status: saved.status,
          allocationTxHash: saved.allocation_tx_hash || decision.record.allocationTxHash,
          alreadyRecorded: decision.alreadyRecorded,
          transfersFunds: false
        }
      });
    }
    return sendJson(res, 400, {
      error: 'Use action "approve" or "record-transfer". Neither action sends RSC.',
      code: 'WEEKLY_FUNDING_UNKNOWN_ACTION'
    });
  } catch (error) {
    console.error('Weekly funding approval failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Weekly funding approval failed',
      ...(error.code ? { code: error.code } : {})
    });
  }
};
