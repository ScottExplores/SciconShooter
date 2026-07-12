const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { getRecordPresentation } = require('./_lib/recordPresentation');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const recordCardRenderer = import('../shared/record-card/renderRecordCardSvg.mjs');

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
    if (!receipt || !receipt.wallet_address) return sendJson(res, 404, { error: 'Mission Record run not found' });
    const record = getRecordPresentation(receipt, score);
    const origin = (process.env.PUBLIC_APP_URL || 'https://www.sciconshooter.xyz').replace(/\/$/, '');
    const { buildMissionRecordCardPath } = await recordCardRenderer;
    return sendJson(res, 200, {
      name: `Scicon Mission Record - ${record.pilotName}`,
      description: `${record.pilotName} scored ${record.score.toLocaleString('en-US')} in ${record.encounter}, reaching wave ${record.wave} with ${record.targetsDefeated} targets defeated.`,
      image: `${origin}${buildMissionRecordCardPath(runId)}`,
      external_url: `${origin}/?view=trophies`,
      attributes: [
        { trait_type: 'Record Type', value: 'Mission Record' },
        { trait_type: 'Score', value: record.score, display_type: 'number' },
        { trait_type: 'Wave', value: record.wave, display_type: 'number' },
        { trait_type: 'Encounter', value: record.encounter },
        { trait_type: 'Targets Defeated', value: record.targetsDefeated, display_type: 'number' },
        { trait_type: 'Coins Collected', value: record.coinsCollected, display_type: 'number' },
        { trait_type: 'Flight Time', value: record.durationLabel },
        { trait_type: 'Game Version', value: record.gameVersion },
        { trait_type: 'Integrity', value: record.integrity }
      ]
    });
  } catch (error) {
    console.error('Record metadata failed:', error);
    return sendJson(res, 500, { error: 'Record metadata is unavailable' });
  }
};
