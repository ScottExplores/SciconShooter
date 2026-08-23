const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { reissueStoredRunReceipt } = require('./runReceipts');
const { getCurrentWeekRange } = require('../../shared/weeklyCompetitionBoundary.js');
const { readWalletProfileSession } = require('./walletProfileAuth');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const RECENT_RUN_LIMIT = 5;
const addressPattern = /^0x[a-f0-9]{40}$/i;
const receiptColumns = [
  'run_id',
  'started_at',
  'finished_at',
  'duration_ms',
  'score',
  'wave',
  'enemies_defeated',
  'coins_collected',
  'player_ship_id',
  'game_version',
  'run_mode',
  'test_run',
  'receipt_provenance_version',
  'integrity_status',
  'anomaly_flags',
  'wallet_address'
].join(',');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const normalizePilotName = (value) => {
  const name = String(value || '').trim().toUpperCase();
  return name ? name.slice(0, 15) : 'PILOT';
};

const fetchReceiptRows = (query) => fetchSupabaseJson(
  `${RECEIPTS_TABLE}?select=${receiptColumns}&receipt_provenance_version=eq.1&${query}`,
  { headers: supabaseHeaders() }
);

const handlePlayerRuns = async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const wallet = String(req.query?.wallet || '').trim().toLowerCase();
    if (!addressPattern.test(wallet)) return sendJson(res, 400, { error: 'Valid wallet is required' });
    const walletSession = readWalletProfileSession(req);
    if (walletSession.walletAddress !== wallet) {
      return sendJson(res, 403, { error: 'This wallet profile session belongs to another Base Account.' });
    }
    const { start, end } = getCurrentWeekRange();

    const [leaderboardRows, currentWeeklyLeaderRows, claimedRows] = await Promise.all([
      fetchSupabaseJson(
        `${LEADERBOARD_TABLE}?select=run_id,name,date,verified&wallet_address=eq.${wallet}&verified=eq.true&run_id=not.is.null&order=date.desc&limit=10`,
        { headers: supabaseHeaders() }
      ),
      fetchSupabaseJson(
        `${LEADERBOARD_TABLE}?select=run_id,name,date,wallet_address,verified`
        + `&date=gte.${encodeURIComponent(start.toISOString())}`
        + `&date=lt.${encodeURIComponent(end.toISOString())}`
        + '&verified=eq.true&run_id=not.is.null&order=score.desc,date.asc&limit=1',
        { headers: supabaseHeaders() }
      ),
      fetchReceiptRows(`wallet_address=eq.${wallet}&order=finished_at.desc&limit=${RECENT_RUN_LIMIT}`)
    ]);

    const weeklyLeader = Array.isArray(currentWeeklyLeaderRows) ? currentWeeklyLeaderRows[0] : null;
    const walletOwnsWeeklyLeader = Boolean(
      weeklyLeader?.verified === true
      && String(weeklyLeader.wallet_address || '').toLowerCase() === wallet
    );
    const scoreRows = [
      ...(Array.isArray(leaderboardRows) ? leaderboardRows.filter((row) => row?.verified === true) : []),
      ...(walletOwnsWeeklyLeader ? [weeklyLeader] : [])
    ];
    const pilotByRunId = new Map(scoreRows.map((row) => [String(row.run_id), normalizePilotName(row.name)]));
    const linkedRunIds = [...new Set(scoreRows.map((row) => String(row.run_id || '')).filter(Boolean))];
    let linkedRows = [];
    let weeklyLeaderReceiptRows = [];

    if (linkedRunIds.length > 0) {
      const runFilter = linkedRunIds.map(encodeURIComponent).join(',');
      await fetchSupabaseJson(
        `${RECEIPTS_TABLE}?run_id=in.(${runFilter})&wallet_address=is.null&receipt_provenance_version=eq.1`,
        {
          method: 'PATCH',
          headers: supabaseHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ wallet_address: wallet, wallet_claimed_at: new Date().toISOString() })
        }
      );
      linkedRows = await fetchReceiptRows(
        `run_id=in.(${runFilter})&wallet_address=eq.${wallet}&order=finished_at.desc&limit=10`
      );
      if (walletOwnsWeeklyLeader) {
        // The combined linked query may contain ten newer runs before the
        // weekly winner. Fetch that exact receipt independently so My Records
        // can always pin the editable high score at the top.
        weeklyLeaderReceiptRows = await fetchReceiptRows(
          `run_id=eq.${encodeURIComponent(String(weeklyLeader.run_id))}&wallet_address=eq.${wallet}&limit=1`
        );
      }
    }

    const rowsByRunId = new Map();
    [
      ...(Array.isArray(claimedRows) ? claimedRows : []),
      ...(Array.isArray(linkedRows) ? linkedRows : []),
      ...(Array.isArray(weeklyLeaderReceiptRows) ? weeklyLeaderReceiptRows : [])
    ]
      .forEach((row) => {
        if (row?.run_id && String(row.wallet_address || '').toLowerCase() === wallet) {
          rowsByRunId.set(String(row.run_id), row);
        }
      });

    const sortedRows = [...rowsByRunId.values()]
      .sort((left, right) => new Date(right.finished_at).getTime() - new Date(left.finished_at).getTime());
    const weeklyLeaderRunId = walletOwnsWeeklyLeader ? String(weeklyLeader.run_id) : '';
    const weeklyLeaderReceipt = weeklyLeaderRunId
      ? sortedRows.find((row) => String(row.run_id) === weeklyLeaderRunId)
      : null;
    const selectedRows = weeklyLeaderReceipt
      ? [
          weeklyLeaderReceipt,
          ...sortedRows
            .filter((row) => String(row.run_id) !== weeklyLeaderRunId)
            .slice(0, RECENT_RUN_LIMIT - 1)
        ]
      : sortedRows.slice(0, RECENT_RUN_LIMIT);

    const runs = selectedRows
      .map((row) => {
        const runId = String(row.run_id);
        // Old receipt rows predate a persisted run_mode column. Only the exact
        // current, verified, wallet-owned weekly leader may be upgraded here;
        // that identity is derived from server storage and never client input.
        const verifiedRunMode = walletOwnsWeeklyLeader && runId === weeklyLeaderRunId
          ? 'weekly-streak'
          : undefined;
        return {
          pilotName: pilotByRunId.get(runId) || 'PILOT',
          receipt: reissueStoredRunReceipt(row, { verifiedRunMode })
        };
      });

    return sendJson(res, 200, { runs });
  } catch (error) {
    console.error('Player run history failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Player run history is unavailable',
      ...(error?.code ? { code: error.code } : {})
    });
  }
};

module.exports = { handlePlayerRuns };
