const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const runId = String(req.query?.runId || '');
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return sendJson(res, 400, { error: 'Invalid run ID' });
    const [receiptRows, scoreRows] = await Promise.all([
      fetchSupabaseJson(`${RECEIPTS_TABLE}?select=*&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?select=name,score,wave,date,wallet_address&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() })
    ]);
    const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
    const score = Array.isArray(scoreRows) ? scoreRows[0] : null;
    if (!receipt || !score || !receipt.wallet_address) return sendJson(res, 404, { error: 'Mission Record run not found' });
    const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host || 'sciconshooter.xyz'}`;
    return sendJson(res, 200, {
      name: `Scicon Mission Record - ${score.name}`,
      description: `A verified Scicon Shooter run: ${score.score} points, wave ${score.wave}. This record does not represent weekly-champion or funding status.`,
      image: `${origin}/api/record-card?runId=${encodeURIComponent(runId)}`,
      external_url: `${origin}/?record=${encodeURIComponent(runId)}`,
      attributes: [
        { trait_type: 'Record Type', value: 'Mission Record' },
        { trait_type: 'Score', value: score.score, display_type: 'number' },
        { trait_type: 'Wave', value: score.wave, display_type: 'number' },
        { trait_type: 'Game Version', value: receipt.game_version },
        { trait_type: 'Integrity', value: receipt.integrity_status }
      ]
    });
  } catch (error) {
    console.error('Record metadata failed:', error);
    return sendJson(res, 500, { error: 'Record metadata is unavailable' });
  }
};
