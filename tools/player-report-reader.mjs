const DEFAULT_TABLE = 'scicon_product_events';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REPORT_EVENT_NAMES = new Set(['player_bug_report', 'player_feedback']);
const REPORT_KINDS = new Set(['bug', 'feedback']);
const REPORT_CATEGORIES = new Set([
  'gameplay',
  'loading-performance',
  'wallet-purchase',
  'visual-audio',
  'other',
  'crash'
]);
const REPORT_SOURCES = new Set(['manual', 'automatic']);
const ENVIRONMENT_KEYS = new Set([
  'pathname', 'online', 'visibilityState', 'language', 'platform',
  'viewportWidth', 'viewportHeight', 'screenWidth', 'screenHeight'
]);
const CONNECTION_KEYS = new Set(['effectiveType', 'downlink', 'rtt', 'saveData']);
const RUNTIME_KEYS = new Set([
  'gameState', 'gameId', 'runMode', 'missionId', 'waveId', 'waveNumber',
  'waveTotal', 'score', 'lives', 'selectedShipId', 'loadingPhase', 'bossActive'
]);
const PERFORMANCE_KEYS = new Set([
  'navigationMs', 'domInteractiveMs', 'longTaskCount', 'worstLongTaskMs'
]);

export class PlayerReportReadError extends Error {
  constructor(message, code = 'PLAYER_REPORT_READ_FAILED') {
    super(message);
    this.name = 'PlayerReportReadError';
    this.code = code;
  }
}

const safeObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const safeString = (value, maximum = 5000) => (
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
        .replace(/0x[a-f0-9]{64}\b/gi, '[redacted_private_value]')
        .replace(/0x[a-f0-9]{40}\b/gi, '[redacted_wallet]')
        .replace(/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[redacted_token]')
        .replace(/\b(authorization|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, maximum)
    : ''
);

const safeNumber = (value, minimum = -1_000_000_000, maximum = 1_000_000_000) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : null;
};

const safeTimestamp = (value) => {
  const text = safeString(value, 40);
  return text && Number.isFinite(Date.parse(text)) ? text : '';
};

const sanitizePrimitiveRecord = (value, maximumEntries = 20) => {
  const output = {};
  for (const [key, entry] of Object.entries(safeObject(value)).slice(0, maximumEntries)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof entry === 'string') output[key] = safeString(entry, 240);
    else if (typeof entry === 'number') output[key] = safeNumber(entry);
    else if (typeof entry === 'boolean' || entry === null) output[key] = entry;
  }
  return output;
};

const pickPrimitiveRecord = (value, allowedKeys) => {
  const input = safeObject(value);
  return sanitizePrimitiveRecord(Object.fromEntries(
    [...allowedKeys].filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]])
  ), allowedKeys.size);
};

const sanitizeDiagnostics = (value) => {
  const diagnostics = safeObject(value);
  const environment = pickPrimitiveRecord(diagnostics.environment, ENVIRONMENT_KEYS);
  const environmentInput = safeObject(diagnostics.environment);
  const connection = pickPrimitiveRecord(environmentInput.connection, CONNECTION_KEYS);
  if (Object.keys(connection).length > 0) environment.connection = connection;

  const runtime = pickPrimitiveRecord(diagnostics.runtime, RUNTIME_KEYS);
  const performance = pickPrimitiveRecord(diagnostics.performance, PERFORMANCE_KEYS);
  const breadcrumbs = Array.isArray(diagnostics.breadcrumbs)
    ? diagnostics.breadcrumbs.slice(-30).flatMap((entry) => {
        const breadcrumb = safeObject(entry);
        const at = safeTimestamp(breadcrumb.at);
        const name = safeString(breadcrumb.name, 64);
        if (!name) return [];
        return [{
          at,
          name,
          details: sanitizePrimitiveRecord(breadcrumb.details, 12)
        }];
      })
    : [];

  const output = {};
  if (Object.keys(environment).length > 0) output.environment = environment;
  if (Object.keys(runtime).length > 0) output.runtime = runtime;
  if (Object.keys(performance).length > 0) output.performance = performance;
  if (breadcrumbs.length > 0) output.breadcrumbs = breadcrumbs;
  return Object.keys(output).length > 0 ? output : null;
};

const normalizeReport = (row) => {
  const record = safeObject(row);
  if (!REPORT_EVENT_NAMES.has(record.event_name)) return null;
  const properties = { ...safeObject(record.properties) };
  delete properties.limiter_key;

  const eventName = record.event_name;
  const expectedKind = eventName === 'player_feedback' ? 'feedback' : 'bug';
  const kind = REPORT_KINDS.has(properties.kind) ? properties.kind : expectedKind;
  const category = REPORT_CATEGORIES.has(properties.category) ? properties.category : 'other';
  const source = REPORT_SOURCES.has(properties.source) ? properties.source : 'manual';
  const occurredAt = safeTimestamp(record.occurred_at);
  const diagnostics = sanitizeDiagnostics(properties.diagnostics);

  return {
    eventName,
    reportId: safeString(properties.report_id, 80),
    kind,
    category,
    source,
    summary: safeString(properties.summary, 600),
    details: safeString(properties.details, 5000),
    sessionId: safeString(record.session_id, 80),
    gameVersion: safeString(record.game_version, 100),
    createdAt: safeTimestamp(properties.created_at) || occurredAt,
    occurredAt,
    ...(diagnostics ? { diagnostics } : {})
  };
};

const normalizeSupabaseUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new PlayerReportReadError(
      'Player report review has an invalid Supabase URL.',
      'PLAYER_REPORT_INVALID_CONFIGURATION'
    );
  }
  const loopback = new Set(['127.0.0.1', 'localhost', '::1']).has(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new PlayerReportReadError(
      'Player report review has an invalid Supabase URL.',
      'PLAYER_REPORT_INVALID_CONFIGURATION'
    );
  }
  return url.origin;
};

const normalizeTable = (value) => {
  const table = String(value || DEFAULT_TABLE).trim();
  if (!/^[a-z0-9_]{1,80}$/i.test(table)) {
    throw new PlayerReportReadError(
      'Player report review has an invalid product-events table name.',
      'PLAYER_REPORT_INVALID_CONFIGURATION'
    );
  }
  return table;
};

const normalizeLimit = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(numeric)));
};

export const resolvePlayerReportEnvironment = (environment = process.env) => ({
  supabaseUrl: String(environment.SUPABASE_URL || '').trim(),
  secretKey: String(
    environment.SUPABASE_SECRET_KEY
    || environment.SUPABASE_SERVICE_ROLE_KEY
    || environment.SUPABASE_SERVICE_KEY
    || ''
  ).trim(),
  table: String(environment.SUPABASE_PRODUCT_EVENTS_TABLE || DEFAULT_TABLE).trim()
});

export const hasPlayerReportCredentials = ({ supabaseUrl, secretKey }) => Boolean(
  String(supabaseUrl || '').trim() && String(secretKey || '').trim()
);

export const readPlayerReports = async ({
  supabaseUrl,
  secretKey,
  table = DEFAULT_TABLE,
  limit = DEFAULT_LIMIT,
  fetchImpl = globalThis.fetch
}) => {
  if (!hasPlayerReportCredentials({ supabaseUrl, secretKey })) {
    throw new PlayerReportReadError(
      'Player report review is not configured on this desktop.',
      'PLAYER_REPORT_NOT_CONFIGURED'
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw new PlayerReportReadError('Player report review cannot make a network request.');
  }

  const configuredUrl = normalizeSupabaseUrl(supabaseUrl);
  const configuredKey = String(secretKey).trim();
  if (configuredKey.startsWith('sb_publishable_')) {
    throw new PlayerReportReadError(
      'Player report review requires a server-side Supabase key.',
      'PLAYER_REPORT_INVALID_CONFIGURATION'
    );
  }
  const configuredTable = normalizeTable(table);
  const configuredLimit = normalizeLimit(limit);
  const endpoint = new URL(`/rest/v1/${configuredTable}`, configuredUrl);
  endpoint.search = new URLSearchParams({
    select: 'event_name,session_id,game_version,properties,occurred_at',
    event_name: 'in.(player_bug_report,player_feedback)',
    order: 'occurred_at.desc',
    limit: String(configuredLimit)
  }).toString();
  const headers = {
    apikey: configuredKey,
    Accept: 'application/json'
  };
  if (!configuredKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${configuredKey}`;
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new PlayerReportReadError('Player report review could not reach Supabase.');
  }
  if (!response?.ok) {
    const status = Number(response?.status);
    throw new PlayerReportReadError(
      Number.isInteger(status)
        ? `Player report review failed with HTTP ${status}.`
        : 'Player report review failed.',
      'PLAYER_REPORT_HTTP_ERROR'
    );
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new PlayerReportReadError('Player report review received an unreadable response.');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new PlayerReportReadError('Player report review response exceeded the local safety limit.');
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new PlayerReportReadError('Player report review received invalid JSON.');
  }
  if (!Array.isArray(rows)) {
    throw new PlayerReportReadError('Player report review received an unexpected response.');
  }
  return rows.flatMap((row) => {
    const report = normalizeReport(row);
    return report ? [report] : [];
  }).slice(0, configuredLimit);
};

export const PLAYER_REPORT_READER_LIMITS = Object.freeze({
  defaultLimit: DEFAULT_LIMIT,
  maxLimit: MAX_LIMIT,
  maxResponseBytes: MAX_RESPONSE_BYTES
});
