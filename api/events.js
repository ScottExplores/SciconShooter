const crypto = require('crypto');
const { fetchSupabaseJson, hasSupabaseConfig, supabaseHeaders } = require('./_lib/supabase');
const playerReportsHandler = require('./_lib/playerReportsRoute');
const { socialAgentHandler } = require('./_lib/socialAgent');
const { checkRateLimit } = require('./_lib/rateLimit');
const { assertSameOrigin } = require('./_lib/walletProfileAuth');

const EVENTS_TABLE = process.env.SUPABASE_PRODUCT_EVENTS_TABLE || 'scicon_product_events';
const ALLOWED_EVENTS = new Set([
  'app_opened',
  'desktop_launch_viewed',
  'desktop_launch_selected',
  'session_activity',
  'mission_started',
  'mission_completed',
  'run_progress',
  'run_ended',
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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 240;

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

const requestBodySize = (body) => {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  try {
    return Buffer.byteLength(JSON.stringify(body || {}), 'utf8');
  } catch {
    return MAX_REQUEST_BODY_BYTES + 1;
  }
};

const anonymousPlayerHash = (anonymousPlayerId) => {
  if (!anonymousPlayerId) return '';
  const secret = String(
    process.env.PRODUCT_ANALYTICS_HASH_SECRET
    || process.env.RUN_RECEIPT_SECRET
    || ''
  ).trim();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`scicon-product-analytics:v1:${anonymousPlayerId}`)
    .digest('hex');
};

module.exports = async (req, res) => {
  if (req.query?.route === 'player-reports') return playerReportsHandler(req, res);
  if (req.query?.route === 'social-agent') return socialAgentHandler(req, res);
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    assertSameOrigin(req, { required: false, matchProtocol: true });
    if (requestBodySize(req.body) > MAX_REQUEST_BODY_BYTES) {
      return sendJson(res, 413, { error: 'Event payload is too large' });
    }
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch {
      return sendJson(res, 400, { error: 'A valid JSON object is required' });
    }
    if (!ALLOWED_EVENTS.has(body.eventName)) return sendJson(res, 400, { error: 'Unknown event' });
    if (!UUID_PATTERN.test(body.sessionId || '')) return sendJson(res, 400, { error: 'Invalid session' });
    if (body.anonymousPlayerId && !UUID_PATTERN.test(body.anonymousPlayerId)) {
      return sendJson(res, 400, { error: 'Invalid anonymous player' });
    }
    const rateLimit = checkRateLimit(req, {
      scope: 'product-events',
      limit: RATE_LIMIT_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))));
      return sendJson(res, 429, { error: 'Too many analytics events' });
    }
    if (!hasSupabaseConfig()) return sendJson(res, 202, { accepted: true, stored: false });
    const properties = safeProperties(body.properties);
    const visitorHash = anonymousPlayerHash(body.anonymousPlayerId);
    if (visitorHash) properties.visitor_hash = visitorHash;
    const deploymentEnvironment = String(process.env.VERCEL_ENV || '').toLowerCase();
    const eventSource = deploymentEnvironment === 'preview'
      ? 'preview'
      : deploymentEnvironment === 'development'
        ? 'development'
        : 'production';
    properties.event_source = eventSource;
    if (eventSource !== 'production') properties.test_run = true;
    properties.schema_version = 3;
    await fetchSupabaseJson(EVENTS_TABLE, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        event_name: body.eventName,
        session_id: body.sessionId,
        game_version: String(body.gameVersion || '').slice(0, 32) || null,
        properties
      })
    });
    return sendJson(res, 202, { accepted: true, stored: true });
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 202;
    if (statusCode >= 500 || statusCode === 202) console.error('Product event failed:', error);
    if (statusCode !== 202) return sendJson(res, statusCode, { error: error.message || 'Event rejected' });
    return sendJson(res, 202, { accepted: true, stored: false });
  }
};
