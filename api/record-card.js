const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]);

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  const runId = String(req.query?.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) { res.statusCode = 400; return res.end('Invalid run ID'); }
  try {
    const [receiptRows, scoreRows] = await Promise.all([
      fetchSupabaseJson(`${RECEIPTS_TABLE}?select=game_version,integrity_status,finished_at&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?select=name,score,wave&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() })
    ]);
    const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
    const score = Array.isArray(scoreRows) ? scoreRows[0] : null;
    if (!receipt || !score) { res.statusCode = 404; return res.end('Record not found'); }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs><radialGradient id="g"><stop stop-color="#123c52"/><stop offset="1" stop-color="#020617"/></radialGradient><filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <rect width="1200" height="1200" fill="url(#g)"/><path d="M0 160H1200M0 320H1200M0 480H1200M0 640H1200M0 800H1200M0 960H1200M160 0V1200M320 0V1200M480 0V1200M640 0V1200M800 0V1200M960 0V1200" stroke="#67e8f9" opacity=".05"/>
      <text x="80" y="120" fill="#67e8f9" font-family="Arial" font-size="30" font-weight="700" letter-spacing="8">SCICON SHOOTER</text>
      <text x="80" y="210" fill="#6ee7b7" font-family="Arial" font-size="26" font-weight="700" letter-spacing="5">VERIFIED MISSION RECORD</text>
      <g filter="url(#glow)" fill="#7c3aed"><path d="M552 350h96l-14 50v95l95 170q18 34-20 34H491q-38 0-20-34l95-170v-95z"/><circle cx="580" cy="320" r="14"/><circle cx="625" cy="300" r="10"/></g>
      <text x="80" y="830" fill="#94a3b8" font-family="Arial" font-size="24" font-weight="700">PILOT</text><text x="80" y="890" fill="#fff" font-family="Arial" font-size="58" font-weight="800">${escapeXml(score.name)}</text>
      <text x="80" y="980" fill="#94a3b8" font-family="Arial" font-size="24" font-weight="700">SCORE</text><text x="80" y="1055" fill="#fff" font-family="Arial" font-size="72" font-weight="800">${escapeXml(Number(score.score).toLocaleString('en-US'))}</text>
      <text x="800" y="980" fill="#94a3b8" font-family="Arial" font-size="24" font-weight="700">WAVE</text><text x="800" y="1055" fill="#67e8f9" font-family="Arial" font-size="72" font-weight="800">${escapeXml(score.wave)}</text>
      <text x="80" y="1140" fill="#64748b" font-family="Arial" font-size="20">One run. No weekly-winner or funding claim.</text></svg>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
    return res.end(svg);
  } catch (error) {
    console.error('Record card failed:', error);
    res.statusCode = 500;
    return res.end('Record card unavailable');
  }
};
