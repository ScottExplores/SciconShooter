const crypto = require('crypto');
const { isDeepStrictEqual } = require('node:util');
const {
  fetchSupabaseJson,
  getSupabaseConfig,
  hasSupabaseConfig,
  supabaseHeaders
} = require('./supabase');
const { checkRateLimit, getClientAddress } = require('./rateLimit');
const { assertSameOrigin } = require('./walletProfileAuth');
const { sendPlayerReportEmail } = require('./playerReportEmail');

const EVENTS_TABLE = process.env.SUPABASE_PRODUCT_EVENTS_TABLE || 'scicon_product_events';
const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_SUMMARY_LENGTH = 600;
const MAX_DETAILS_LENGTH = 5_000;
const MAX_BREADCRUMBS = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_RATE_LIMITS = Object.freeze({ manual: 5, automatic: 20 });
const REPORT_REQUEST_RATE_LIMIT = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const GAME_VERSION_PATTERN = /^[a-z0-9._-]{1,64}$/i;
const DETAIL_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/i;
const BREADCRUMB_NAME_PATTERN = /^[a-z0-9_.-]{1,64}$/i;
const REPORT_KINDS = new Set(['feedback', 'bug']);
const REPORT_CATEGORIES = new Set([
  'gameplay',
  'loading-performance',
  'wallet-purchase',
  'visual-audio',
  'other',
  'crash'
]);
const REPORT_SOURCES = new Set(['manual', 'automatic']);
const VISIBILITY_STATES = new Set(['visible', 'hidden', 'prerender', 'unknown']);
const EFFECTIVE_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g', '4g', 'unknown']);
const RUNTIME_STRING_FIELDS = new Set([
  'gameState',
  'runMode',
  'missionId',
  'waveId',
  'selectedShipId',
  'loadingPhase'
]);
const RUNTIME_NUMBER_FIELDS = new Set([
  'gameId',
  'waveNumber',
  'waveTotal',
  'score',
  'lives'
]);
const PERFORMANCE_FIELDS = new Set([
  'navigationMs',
  'domInteractiveMs',
  'longTaskCount',
  'worstLongTaskMs'
]);

const apiError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  ...(code ? { code } : {})
});

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
};

const isPlainObject = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const requestBodySize = (body) => {
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  try {
    return Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
  } catch {
    throw apiError('A valid JSON body is required.', 400, 'REPORT_INVALID_JSON');
  }
};

const parseBody = (body) => {
  if (requestBodySize(body) > MAX_REQUEST_BODY_BYTES) {
    throw apiError('The player report is too large.', 413, 'REPORT_TOO_LARGE');
  }
  if (typeof body !== 'string') {
    if (!isPlainObject(body)) {
      throw apiError('A JSON object is required.', 400, 'REPORT_INVALID_JSON');
    }
    return body;
  }
  try {
    const parsed = JSON.parse(body);
    if (!isPlainObject(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw apiError('A valid JSON object is required.', 400, 'REPORT_INVALID_JSON');
  }
};

/**
 * Defense in depth for reports that may outlive the client release that sent
 * them. Never rely on browser-side redaction for owner-visible diagnostics.
 */
const redactSensitiveText = (value, maximumLength) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/\b(?:0x)?[a-f0-9]{64}\b/gi, '[redacted_private_value]')
  .replace(/\b0x[a-f0-9]{40}\b/gi, '[redacted_wallet]')
  .replace(/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[redacted_token]')
  .replace(/\b(?:bearer\s+)[a-z0-9._~+\/-]{8,}/gi, 'Bearer [redacted]')
  .replace(/\b(?:gh[opusr]_[a-z0-9]{20,}|sk_(?:live|test)_[a-z0-9]{12,}|sb_(?:secret|publishable)_[a-z0-9_-]{12,})\b/gi, '[redacted_token]')
  .replace(/\b(authorization|api[_-]?key|private[_-]?key|secret|token|mnemonic|seed[_-]?phrase)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .trim()
  .slice(0, maximumLength);

const validateUuid = (value, field) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw apiError(`${field} must be a valid UUID.`, 400, 'REPORT_INVALID_ID');
  }
  return value.toLowerCase();
};

const validateTimestamp = (value, field) => {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) {
    throw apiError(`${field} must be an ISO timestamp.`, 400, 'REPORT_INVALID_TIMESTAMP');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw apiError(`${field} must be an ISO timestamp.`, 400, 'REPORT_INVALID_TIMESTAMP');
  }
  return value;
};

const validateText = (value, field, { minimum = 0, maximum, required = false } = {}) => {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string') {
    throw apiError(`${field} must be text.`, 400, 'REPORT_INVALID_TEXT');
  }
  const trimmed = value.trim();
  if (trimmed.length < minimum || trimmed.length > maximum) {
    throw apiError(
      `${field} must contain between ${minimum} and ${maximum} characters.`,
      400,
      'REPORT_INVALID_TEXT'
    );
  }
  return redactSensitiveText(trimmed, maximum);
};

const optionalString = (value, maximum, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return redactSensitiveText(value, maximum);
};

const optionalNumber = (value, { minimum = 0, maximum = 1_000_000_000, integer = false } = {}) => {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return integer ? Math.round(bounded) : bounded;
};

const sanitizePrimitiveDetails = (value) => {
  if (!isPlainObject(value)) return {};
  const output = {};
  for (const [key, raw] of Object.entries(value).slice(0, 12)) {
    if (!DETAIL_KEY_PATTERN.test(key)) continue;
    if (typeof raw === 'string') output[key] = redactSensitiveText(raw, 180);
    else if (typeof raw === 'number' && Number.isFinite(raw)) {
      output[key] = Math.min(1_000_000_000, Math.max(-1_000_000_000, raw));
    } else if (typeof raw === 'boolean' || raw === null) output[key] = raw;
  }
  return output;
};

const sanitizeEnvironment = (value) => {
  if (!isPlainObject(value)) return undefined;
  const connection = isPlainObject(value.connection) ? value.connection : {};
  const pathname = optionalString(value.pathname, 180, '/');
  const visibilityState = VISIBILITY_STATES.has(value.visibilityState)
    ? value.visibilityState
    : 'unknown';
  const effectiveType = EFFECTIVE_CONNECTION_TYPES.has(connection.effectiveType)
    ? connection.effectiveType
    : 'unknown';
  return {
    pathname: pathname.startsWith('/') ? pathname : '/',
    online: typeof value.online === 'boolean' ? value.online : true,
    visibilityState,
    language: optionalString(value.language, 24, 'unknown') || 'unknown',
    platform: optionalString(value.platform, 60, 'unknown') || 'unknown',
    viewportWidth: optionalNumber(value.viewportWidth, { maximum: 20_000, integer: true }) ?? 0,
    viewportHeight: optionalNumber(value.viewportHeight, { maximum: 20_000, integer: true }) ?? 0,
    screenWidth: optionalNumber(value.screenWidth, { maximum: 20_000, integer: true }) ?? 0,
    screenHeight: optionalNumber(value.screenHeight, { maximum: 20_000, integer: true }) ?? 0,
    connection: {
      effectiveType,
      downlink: optionalNumber(connection.downlink, { maximum: 10_000 }),
      rtt: optionalNumber(connection.rtt, { maximum: 120_000 }),
      saveData: Boolean(connection.saveData)
    }
  };
};

const sanitizeRuntime = (value) => {
  if (!isPlainObject(value)) return undefined;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (RUNTIME_STRING_FIELDS.has(key) && typeof raw === 'string') {
      output[key] = redactSensitiveText(raw, 100);
    } else if (RUNTIME_NUMBER_FIELDS.has(key) && typeof raw === 'number' && Number.isFinite(raw)) {
      output[key] = Math.min(1_000_000_000, Math.max(-1_000_000_000, raw));
    } else if (key === 'bossActive' && typeof raw === 'boolean') {
      output[key] = raw;
    }
  }
  return output;
};

const sanitizePerformance = (value) => {
  if (!isPlainObject(value)) return undefined;
  const output = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!PERFORMANCE_FIELDS.has(key)) continue;
    output[key] = optionalNumber(raw, { maximum: 86_400_000 });
  }
  return output;
};

const sanitizeBreadcrumbs = (value) => {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_BREADCRUMBS).flatMap((candidate) => {
    if (!isPlainObject(candidate)) return [];
    if (typeof candidate.name !== 'string' || !BREADCRUMB_NAME_PATTERN.test(candidate.name)) return [];
    try {
      return [{
        at: validateTimestamp(candidate.at, 'breadcrumb.at'),
        name: candidate.name,
        details: sanitizePrimitiveDetails(candidate.details)
      }];
    } catch {
      return [];
    }
  });
};

const sanitizeDiagnostics = (value) => {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw apiError('diagnostics must be an object.', 400, 'REPORT_INVALID_DIAGNOSTICS');
  }
  const environment = sanitizeEnvironment(value.environment);
  const runtime = sanitizeRuntime(value.runtime);
  const performance = sanitizePerformance(value.performance);
  return {
    ...(environment ? { environment } : {}),
    ...(runtime ? { runtime } : {}),
    ...(performance ? { performance } : {}),
    breadcrumbs: sanitizeBreadcrumbs(value.breadcrumbs)
  };
};

const validateReport = (body) => {
  if (!REPORT_KINDS.has(body.kind)) {
    throw apiError('Unknown report kind.', 400, 'REPORT_INVALID_KIND');
  }
  if (!REPORT_CATEGORIES.has(body.category)) {
    throw apiError('Unknown report category.', 400, 'REPORT_INVALID_CATEGORY');
  }
  if (!REPORT_SOURCES.has(body.source)) {
    throw apiError('Unknown report source.', 400, 'REPORT_INVALID_SOURCE');
  }
  if (body.source === 'automatic' && (body.kind !== 'bug' || body.category !== 'crash')) {
    throw apiError('Automatic reports must be crash bug reports.', 400, 'REPORT_INVALID_SOURCE');
  }
  if (body.source === 'manual' && body.category === 'crash') {
    throw apiError('Crash reports are generated automatically.', 400, 'REPORT_INVALID_CATEGORY');
  }
  if (typeof body.gameVersion !== 'string' || !GAME_VERSION_PATTERN.test(body.gameVersion)) {
    throw apiError('gameVersion is invalid.', 400, 'REPORT_INVALID_VERSION');
  }
  return {
    reportId: validateUuid(body.reportId, 'reportId'),
    kind: body.kind,
    category: body.category,
    source: body.source,
    summary: validateText(body.summary, 'summary', {
      minimum: 1,
      maximum: MAX_SUMMARY_LENGTH,
      required: true
    }),
    details: validateText(body.details, 'details', { maximum: MAX_DETAILS_LENGTH }),
    sessionId: validateUuid(body.sessionId, 'sessionId'),
    gameVersion: body.gameVersion,
    createdAt: validateTimestamp(body.createdAt, 'createdAt'),
    diagnostics: sanitizeDiagnostics(body.diagnostics)
  };
};

const eventNameForReport = (report) => {
  return report.kind === 'feedback' ? 'player_feedback' : 'player_bug_report';
};

const buildStoredProperties = (report, limiterKey) => ({
  schema_version: 1,
  report_id: report.reportId,
  limiter_key: limiterKey,
  kind: report.kind,
  category: report.category,
  source: report.source,
  summary: report.summary,
  details: report.details,
  created_at: report.createdAt,
  ...(report.source === 'manual' ? { email_notification: { status: 'pending' } } : {}),
  ...(report.diagnostics ? { diagnostics: report.diagnostics } : {})
});

const deriveReportEventId = (reportId) => {
  const digest = crypto
    .createHash('sha256')
    .update(`scicon-player-report-event:v1:${reportId}`)
    .digest();
  const safeMagnitude = Number(digest.readBigUInt64BE(0) & ((1n << 52n) - 1n)) || 1;
  return -safeMagnitude;
};

const findStoredReport = async (reportId) => {
  const rows = await fetchSupabaseJson(
    `${EVENTS_TABLE}?select=event_name,session_id,game_version,properties`
      + `&properties->>report_id=eq.${encodeURIComponent(reportId)}`
      + '&limit=1',
    { headers: supabaseHeaders() }
  );
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};

const storedReportMatches = (stored, report) => {
  if (!stored || !isPlainObject(stored.properties)) return false;
  const expectedEventName = eventNameForReport(report);
  return stored.event_name === expectedEventName
    && stored.session_id === report.sessionId
    && stored.game_version === report.gameVersion
    && stored.properties.report_id === report.reportId
    && stored.properties.kind === report.kind
    && stored.properties.category === report.category
    && stored.properties.source === report.source
    && stored.properties.summary === report.summary
    && stored.properties.details === report.details
    && stored.properties.created_at === report.createdAt
    && isDeepStrictEqual(stored.properties.diagnostics, report.diagnostics);
};

const storedReportWasEmailed = (stored) => (
  stored?.properties?.email_notification?.status === 'sent'
);

const markStoredReportEmailed = async (reportId, storedProperties, providerMessageId) => {
  const safeProviderMessageId = redactSensitiveText(providerMessageId, 200)
    .replace(/[^a-z0-9_-]/gi, '');
  await fetchSupabaseJson(
    `${EVENTS_TABLE}?properties->>report_id=eq.${encodeURIComponent(reportId)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        properties: {
          ...storedProperties,
          email_notification: {
            status: 'sent',
            notified_at: new Date().toISOString(),
            provider_message_id: safeProviderMessageId
          }
        }
      })
    }
  );
};

const digestToUuid = (digest) => [
  digest.slice(0, 8),
  digest.slice(8, 12),
  digest.slice(12, 16),
  digest.slice(16, 20),
  digest.slice(20, 32)
].join('-');

const deriveDurableRateLimitKey = (req, source) => {
  const { key } = getSupabaseConfig();
  const secret = String(process.env.PLAYER_REPORT_RATE_LIMIT_SECRET || key || '');
  if (!secret) throw new Error('Player report rate limiting is not configured.');
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`scicon-player-report-rate-limit:v1:${source}:${getClientAddress(req)}`)
    .digest('hex');
  return digestToUuid(digest);
};

const checkDurableRateLimit = async (req, source) => {
  const limit = REPORT_RATE_LIMITS[source];
  const limiterKey = deriveDurableRateLimitKey(req, source);
  const windowStartedAt = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const eventFilter = source === 'automatic'
    ? 'eq.player_bug_report'
    : 'in.(player_bug_report,player_feedback)';

  const acceptedReports = await fetchSupabaseJson(
    `${EVENTS_TABLE}?select=occurred_at`
      + `&event_name=${eventFilter}`
      + `&properties->>limiter_key=eq.${encodeURIComponent(limiterKey)}`
      + `&occurred_at=gte.${encodeURIComponent(windowStartedAt)}`
      + `&order=occurred_at.asc&limit=${limit}`,
    { headers: supabaseHeaders() }
  );
  const rows = Array.isArray(acceptedReports) ? acceptedReports : [];
  const earliest = Date.parse(rows[0]?.occurred_at || '');
  return {
    allowed: rows.length < limit,
    limiterKey,
    resetAt: Number.isFinite(earliest)
      ? earliest + RATE_LIMIT_WINDOW_MS
      : Date.now() + RATE_LIMIT_WINDOW_MS
  };
};

const sendRateLimitExceeded = (res, resetAt) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return sendJson(res, 429, {
    error: 'Too many reports were sent from this connection. Try again later.',
    code: 'REPORT_RATE_LIMITED'
  });
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  let report;
  try {
    assertSameOrigin(req, { required: true, matchProtocol: true });
    report = validateReport(parseBody(req.body));
    if (!hasSupabaseConfig()) {
      return sendJson(res, 503, {
        error: 'Player report storage is temporarily unavailable.',
        code: 'REPORT_STORAGE_UNAVAILABLE'
      });
    }

    const requestRateLimit = checkRateLimit(req, {
      scope: `player-report-request:${report.source}`,
      limit: REPORT_REQUEST_RATE_LIMIT,
      windowMs: RATE_LIMIT_WINDOW_MS
    });
    if (!requestRateLimit.allowed) {
      return sendRateLimitExceeded(res, requestRateLimit.resetAt);
    }

    const eventName = eventNameForReport(report);
    const storedReport = await findStoredReport(report.reportId);
    if (storedReport && !storedReportMatches(storedReport, report)) {
      throw apiError('That report ID is already in use.', 409, 'REPORT_ID_CONFLICT');
    }

    let storedProperties = storedReport?.properties || null;
    if (!storedReport) {
      const rateLimit = checkRateLimit(req, {
        scope: `player-report:${report.source}`,
        limit: REPORT_RATE_LIMITS[report.source],
        windowMs: RATE_LIMIT_WINDOW_MS
      });
      if (!rateLimit.allowed) {
        return sendRateLimitExceeded(res, rateLimit.resetAt);
      }
      const durableRateLimit = await checkDurableRateLimit(req, report.source);
      if (!durableRateLimit.allowed) {
        return sendRateLimitExceeded(res, durableRateLimit.resetAt);
      }

      storedProperties = buildStoredProperties(report, durableRateLimit.limiterKey);
      await fetchSupabaseJson(EVENTS_TABLE, {
        method: 'POST',
        headers: supabaseHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          id: deriveReportEventId(report.reportId),
          event_name: eventName,
          session_id: report.sessionId,
          game_version: report.gameVersion,
          properties: storedProperties
        })
      });
    }

    let emailResult = { emailed: false, skipped: true };
    try {
      if (report.source === 'manual' && storedReportWasEmailed(storedReport)) {
        emailResult = { emailed: true, skipped: true };
      } else {
        emailResult = await sendPlayerReportEmail(report);
        if (emailResult.emailed) {
          await markStoredReportEmailed(
            report.reportId,
            storedProperties,
            emailResult.providerMessageId
          );
        }
      }
    } catch (error) {
      const deliveryError = apiError(
        'Your report was saved, but its email notification is temporarily unavailable.',
        503,
        'REPORT_EMAIL_UNAVAILABLE'
      );
      if (Number.isFinite(error?.retryAfterMs)) {
        deliveryError.retryAfterMs = error.retryAfterMs;
      }
      throw deliveryError;
    }

    console.info('Player report accepted', {
      reportId: report.reportId,
      eventName,
      kind: report.kind,
      category: report.category,
      source: report.source,
      gameVersion: report.gameVersion,
      diagnosticsIncluded: Boolean(report.diagnostics),
      alreadyStored: Boolean(storedReport),
      emailNotified: emailResult.emailed
    });
    return sendJson(res, 201, {
      accepted: true,
      stored: true,
      emailed: emailResult.emailed,
      reportId: report.reportId
    });
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : 503;
    if (error?.code === 'REPORT_EMAIL_UNAVAILABLE' && Number.isFinite(error?.retryAfterMs)) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
    }
    if (status >= 500) {
      console.error(error?.code === 'REPORT_EMAIL_UNAVAILABLE'
        ? 'Player report email notification failed'
        : 'Player report storage failed', {
        reportId: report?.reportId || null,
        kind: report?.kind || null,
        category: report?.category || null,
        source: report?.source || null,
        errorName: error?.name || 'Error',
        statusCode: status
      });
    }
    return sendJson(res, status, {
      error: error?.code === 'REPORT_EMAIL_UNAVAILABLE'
        ? error.message
        : status >= 500
          ? 'Player report storage is temporarily unavailable.'
          : error.message,
      code: error?.code === 'REPORT_EMAIL_UNAVAILABLE'
        ? error.code
        : status >= 500
          ? 'REPORT_STORAGE_UNAVAILABLE'
          : error.code || 'REPORT_INVALID'
    });
  }
};

module.exports._test = {
  MAX_REQUEST_BODY_BYTES,
  buildStoredProperties,
  checkDurableRateLimit,
  deriveReportEventId,
  deriveDurableRateLimitKey,
  eventNameForReport,
  findStoredReport,
  markStoredReportEmailed,
  parseBody,
  redactSensitiveText,
  sanitizeDiagnostics,
  storedReportMatches,
  storedReportWasEmailed,
  validateReport
};
