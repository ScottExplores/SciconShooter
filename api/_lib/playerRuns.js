const { fetchSupabaseJson, supabaseHeaders } = require('./supabase');
const { reissueStoredRunReceipt } = require('./runReceipts');

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

const handlePlayerRuns = async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const wallet = String(req.query?.wallet || '').trim().toLowerCase();
    if (!addressPattern.test(wallet)) return sendJson(res, 400, { error: 'Valid wallet is required' });

    const [leaderboardRows, claimedRows] = await Promise.all([
      fetchSupabaseJson(
        `${LEADERBOARD_TABLE}?select=run_id,name,date&wallet_address=eq.${wallet}&run_id=not.is.null&order=date.desc&limit=10`,
        { headers: supabaseHeaders() }
      ),
      fetchSupabaseJson(
        `${RECEIPTS_TABLE}?select=${receiptColumns}&wallet_address=eq.${wallet}&order=finished_at.desc&limit=${RECENT_RUN_LIMIT}`,
        { headers: supabaseHeaders() }
      )
    ]);

    const scoreRows = Array.isArray(leaderboardRows) ? leaderboardRows : [];
    const pilotByRunId = new Map(scoreRows.map((row) => [String(row.run_id), normalizePilotName(row.name)]));
    const linkedRunIds = [...new Set(scoreRows.map((row) => String(row.run_id || '')).filter(Boolean))];
    let linkedRows = [];

    if (linkedRunIds.length > 0) {
      const runFilter = linkedRunIds.map(encodeURIComponent).join(',');
      await fetchSupabaseJson(
        `${RECEIPTS_TABLE}?run_id=in.(${runFilter})&wallet_address=is.null`,
        {
          method: 'PATCH',
          headers: supabaseHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ wallet_address: wallet, wallet_claimed_at: new Date().toISOString() })
        }
      );
      linkedRows = await fetchSupabaseJson(
        `${RECEIPTS_TABLE}?select=${receiptColumns}&run_id=in.(${runFilter})&wallet_address=eq.${wallet}&order=finished_at.desc&limit=10`,
        { headers: supabaseHeaders() }
      );
    }

    const rowsByRunId = new Map();
    [...(Array.isArray(claimedRows) ? claimedRows : []), ...(Array.isArray(linkedRows) ? linkedRows : [])]
      .forEach((row) => {
        if (row?.run_id && String(row.wallet_address || '').toLowerCase() === wallet) {
          rowsByRunId.set(String(row.run_id), row);
        }
      });

    const runs = [...rowsByRunId.values()]
      .sort((left, right) => new Date(right.finished_at).getTime() - new Date(left.finished_at).getTime())
      .slice(0, RECENT_RUN_LIMIT)
      .map((row) => ({
        pilotName: pilotByRunId.get(String(row.run_id)) || 'PILOT',
        receipt: reissueStoredRunReceipt(row)
      }));

    return sendJson(res, 200, { runs });
  } catch (error) {
    console.error('Player run history failed:', error);
    return sendJson(res, 500, { error: error.message || 'Player run history is unavailable' });
  }
};

module.exports = { handlePlayerRuns };
