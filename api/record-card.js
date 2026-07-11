const { fetchSupabaseJson, supabaseHeaders } = require('./_lib/supabase');
const { getRecordPresentation } = require('./_lib/recordPresentation');

const RECEIPTS_TABLE = process.env.SUPABASE_RUN_RECEIPTS_TABLE || 'scicon_run_receipts';
const LEADERBOARD_TABLE = process.env.SUPABASE_LEADERBOARD_TABLE || 'scicon_leaderboard';
const escapeXml = (value) => String(value ?? '').replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]);

const embedImage = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return url;
    const mimeType = response.headers.get('content-type') || 'image/png';
    const encoded = Buffer.from(await response.arrayBuffer()).toString('base64');
    return `data:${mimeType};base64,${encoded}`;
  } catch {
    return url;
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }
  const runId = String(req.query?.runId || '');
  if (!/^[0-9a-f-]{36}$/i.test(runId)) { res.statusCode = 400; return res.end('Invalid run ID'); }

  try {
    const [receiptRows, scoreRows] = await Promise.all([
      fetchSupabaseJson(`${RECEIPTS_TABLE}?select=game_version,integrity_status,finished_at,duration_ms,score,wave,enemies_defeated,coins_collected&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() }),
      fetchSupabaseJson(`${LEADERBOARD_TABLE}?select=name,score,wave,date&run_id=eq.${encodeURIComponent(runId)}&limit=1`, { headers: supabaseHeaders() })
    ]);
    const receipt = Array.isArray(receiptRows) ? receiptRows[0] : null;
    const scoreRow = Array.isArray(scoreRows) ? scoreRows[0] : null;
    if (!receipt) { res.statusCode = 404; return res.end('Record not found'); }

    const record = getRecordPresentation(receipt, scoreRow);
    const assetOrigin = (process.env.PUBLIC_APP_URL || 'https://www.sciconshooter.xyz').replace(/\/$/, '');
    const completed = record.finishedAt
      ? new Date(record.finishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
      : 'VERIFIED RUN';
    const bossAsset = record.wave === 2 ? 'mini-boss-drone.png' : 'final-boss-sentinel.png';
    const verifiedLabel = record.integrity === 'server-verified' ? 'SERVER VERIFIED' : 'REVIEWED RUN';
    const [bossImage, shipImage] = await Promise.all([
      embedImage(`${assetOrigin}/game-art/bosses/${bossAsset}`),
      embedImage(`${assetOrigin}/game-art/branding/researchhub-ship.png`)
    ]);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
      <defs>
        <radialGradient id="space" cx="70%" cy="30%"><stop stop-color="#123c52"/><stop offset=".52" stop-color="#07152a"/><stop offset="1" stop-color="#020617"/></radialGradient>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0b2038"/><stop offset="1" stop-color="#020817"/></linearGradient>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#facc15"/><stop offset=".5" stop-color="#fff4a3"/><stop offset="1" stop-color="#ca8a04"/></linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="12" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#67e8f9" stroke-opacity=".045" stroke-width="2"/></pattern>
      </defs>
      <rect width="1200" height="1200" fill="url(#space)"/><rect width="1200" height="1200" fill="url(#grid)"/>
      <circle cx="940" cy="250" r="260" fill="#2563eb" opacity=".08"/><circle cx="220" cy="1040" r="300" fill="#14b8a6" opacity=".07"/>

      <path d="M70 132L250 48H430L500 108H700L770 48H950L1130 132 990 178H760L700 220H500L440 178H210Z" fill="#070d20" stroke="#67e8f9" stroke-width="4"/>
      <path d="M70 132L250 72H410L452 110H210Z" fill="#facc15" opacity=".42"/><path d="M1130 132L950 72H790L748 110H990Z" fill="#facc15" opacity=".42"/>
      <path d="M500 108H700L674 158H526Z" fill="url(#gold)"/>
      <text x="600" y="152" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="900" letter-spacing="8">MISSION RECORD</text>
      <text x="600" y="202" text-anchor="middle" fill="#67e8f9" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="7">SCICON SHOOTER</text>

      <rect x="70" y="250" width="1060" height="510" rx="8" fill="url(#panel)" stroke="#67e8f9" stroke-opacity=".5" stroke-width="3"/>
      <path d="M70 320L160 250H70ZM1130 320L1040 250H1130Z" fill="#facc15" opacity=".7"/>
      <image href="${escapeXml(bossImage)}" x="800" y="292" width="260" height="260" opacity=".72" style="image-rendering:pixelated"/>
      <circle cx="420" cy="520" r="160" fill="#22d3ee" opacity=".08"/><ellipse cx="420" cy="650" rx="210" ry="44" fill="none" stroke="#67e8f9" stroke-width="4" opacity=".6"/>
      <ellipse cx="420" cy="650" rx="150" ry="26" fill="none" stroke="#6ee7b7" stroke-width="3" opacity=".6"/>
      <image href="${escapeXml(shipImage)}" x="290" y="370" width="260" height="260" filter="url(#glow)"/>
      <text x="760" y="580" fill="#94a3b8" font-family="Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="5">ENCOUNTER</text>
      <text x="760" y="630" fill="#ffffff" font-family="Arial, sans-serif" font-size="34" font-weight="900">${escapeXml(record.encounter)}</text>
      <text x="760" y="682" fill="#6ee7b7" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">${escapeXml(verifiedLabel)}</text>

      <text x="90" y="835" fill="#94a3b8" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">CALLSIGN</text>
      <text x="90" y="895" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="900">${escapeXml(record.pilotName)}</text>
      <text x="760" y="835" fill="#94a3b8" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="5">FINAL SCORE</text>
      <text x="760" y="900" fill="#fef08a" font-family="Arial, sans-serif" font-size="68" font-weight="900">${escapeXml(record.score.toLocaleString('en-US'))}</text>

      <g font-family="Arial, sans-serif">
        <rect x="70" y="950" width="250" height="130" rx="6" fill="#07152a" stroke="#67e8f9" stroke-opacity=".35"/><text x="195" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">WAVE</text><text x="195" y="1052" text-anchor="middle" fill="#67e8f9" font-size="42" font-weight="900">${record.wave}</text>
        <rect x="340" y="950" width="250" height="130" rx="6" fill="#07152a" stroke="#6ee7b7" stroke-opacity=".35"/><text x="465" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">TARGETS</text><text x="465" y="1052" text-anchor="middle" fill="#6ee7b7" font-size="42" font-weight="900">${record.targetsDefeated}</text>
        <rect x="610" y="950" width="250" height="130" rx="6" fill="#07152a" stroke="#facc15" stroke-opacity=".35"/><text x="735" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">COINS</text><text x="735" y="1052" text-anchor="middle" fill="#fef08a" font-size="42" font-weight="900">${record.coinsCollected}</text>
        <rect x="880" y="950" width="250" height="130" rx="6" fill="#07152a" stroke="#ffffff" stroke-opacity=".24"/><text x="1005" y="995" text-anchor="middle" fill="#64748b" font-size="18" font-weight="700" letter-spacing="3">FLIGHT</text><text x="1005" y="1052" text-anchor="middle" fill="#ffffff" font-size="42" font-weight="900">${escapeXml(record.durationLabel)}</text>
      </g>
      <text x="70" y="1140" fill="#64748b" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">${escapeXml(completed)}  //  ${escapeXml(record.gameVersion)}</text>
      <text x="1130" y="1140" text-anchor="end" fill="#6ee7b7" font-family="Arial, sans-serif" font-size="18" font-weight="700" letter-spacing="3">PLAY. WIN THE WEEK. FUND RESEARCH.</text>
    </svg>`;

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
