const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./_lib/supabase');

const EVENTS_TABLE = process.env.SUPABASE_PRODUCT_EVENTS_TABLE || 'scicon_product_events';
const ALLOWED_EVENTS = new Set([
  'app_opened',
  'mission_started',
  'mission_completed',
  'score_submitted',
  'returning_player',
  'wallet_connected',
  'mint_preview_opened',
  'mission_record_minted',
  'weekly_champion_claimed',
  'proposal_selected',
  'funding_transaction_confirmed',
  'share_action_used'
]);

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const safeProperties = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value).slice(0, 12)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof raw === 'string') output[key] = raw.slice(0, 120);
    else if (typeof raw === 'number' && Number.isFinite(raw)) output[key] = raw;
    else if (typeof raw === 'boolean') output[key] = raw;
  }
  return output;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!ALLOWED_EVENTS.has(body.eventName)) return sendJson(res, 400, { error: 'Unknown event' });
    if (!/^[0-9a-f-]{36}$/i.test(body.sessionId || '')) return sendJson(res, 400, { error: 'Invalid session' });
    if (!hasSupabaseConfig()) return sendJson(res, 202, { accepted: true, stored: false });
    await fetchSupabaseJson(EVENTS_TABLE, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        event_name: body.eventName,
        session_id: body.sessionId,
        game_version: String(body.gameVersion || '').slice(0, 32) || null,
        properties: safeProperties(body.properties)
      })
    });
    return sendJson(res, 202, { accepted: true, stored: true });
  } catch (error) {
    console.error('Product event failed:', error);
    return sendJson(res, 202, { accepted: true, stored: false });
  }
};
