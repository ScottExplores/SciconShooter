const DEFAULT_TABLE = 'scicon_product_events';
const DEFAULT_DAYS = 90;
const PAGE_SIZE = 1_000;
const MAX_ROWS = 50_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const PRODUCT_EVENTS = Object.freeze([
  'app_opened',
  'returning_player',
  'session_activity',
  'mission_started',
  'mission_completed',
  'score_submitted'
]);
const PRODUCT_EVENT_SET = new Set(PRODUCT_EVENTS);
const HEX_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const TEST_MODE_PATTERN = /(?:^|[-_ ])(?:test|owner|sandbox|preview|director|lab)(?:$|[-_ ])/i;

export class ProductAnalyticsReadError extends Error {
  constructor(message, code = 'PRODUCT_ANALYTICS_READ_FAILED') {
    super(message);
    this.name = 'ProductAnalyticsReadError';
    this.code = code;
  }
}

const objectValue = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const boundedNumber = (value, minimum = 0, maximum = 604_800) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : null;
};

const safeText = (value, maximum = 80) => (
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum)
    : ''
);

const safeTimestamp = (value) => {
  const text = safeText(value, 40);
  return text && Number.isFinite(Date.parse(text)) ? text : '';
};

const safeDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
};

const dateKey = (value) => safeDate(value).toISOString().slice(0, 10);

const normalizeMode = (value) => {
  const mode = safeText(value, 48).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return mode || 'unspecified';
};

const normalizeEvent = (row) => {
  const record = objectValue(row);
  const eventName = safeText(record.event_name, 48);
  const occurredAt = safeTimestamp(record.occurred_at);
  const properties = objectValue(record.properties);
  if (!PRODUCT_EVENT_SET.has(eventName) || !occurredAt) return null;

  const visitorHash = safeText(properties.visitor_hash, 128);
  return {
    eventName,
    occurredAt,
    sessionId: safeText(record.session_id, 80),
    visitorHash: HEX_HASH_PATTERN.test(visitorHash) ? visitorHash.toLowerCase() : '',
    playerStatus: ['new', 'returning'].includes(properties.player_status)
      ? properties.player_status
      : '',
    activeSecondsTotal: boundedNumber(properties.active_seconds_total),
    runMode: normalizeMode(properties.run_mode || properties.mode),
    result: safeText(properties.result, 32).toLowerCase(),
    isTest: properties.test_run === true
      || properties.owner_test === true
      || properties.test_mode === true
      || TEST_MODE_PATTERN.test(String(properties.run_mode || properties.mode || ''))
  };
};

const normalizeSupabaseUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new ProductAnalyticsReadError(
      'Player analytics has an invalid Supabase URL.',
      'PRODUCT_ANALYTICS_INVALID_CONFIGURATION'
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
    throw new ProductAnalyticsReadError(
      'Player analytics has an invalid Supabase URL.',
      'PRODUCT_ANALYTICS_INVALID_CONFIGURATION'
    );
  }
  return url.origin;
};

const normalizeTable = (value) => {
  const table = String(value || DEFAULT_TABLE).trim();
  if (!/^[a-z0-9_]{1,80}$/i.test(table)) {
    throw new ProductAnalyticsReadError(
      'Player analytics has an invalid product-events table name.',
      'PRODUCT_ANALYTICS_INVALID_CONFIGURATION'
    );
  }
  return table;
};

export const resolveProductAnalyticsEnvironment = (environment = process.env) => ({
  supabaseUrl: String(environment.SUPABASE_URL || '').trim(),
  secretKey: String(
    environment.SUPABASE_SECRET_KEY
    || environment.SUPABASE_SERVICE_ROLE_KEY
    || environment.SUPABASE_SERVICE_KEY
    || ''
  ).trim(),
  table: String(environment.SUPABASE_PRODUCT_EVENTS_TABLE || DEFAULT_TABLE).trim()
});

export const hasProductAnalyticsCredentials = ({ supabaseUrl, secretKey } = {}) => Boolean(
  String(supabaseUrl || '').trim() && String(secretKey || '').trim()
);

export const readProductAnalyticsEvents = async ({
  supabaseUrl,
  secretKey,
  table = DEFAULT_TABLE,
  days = DEFAULT_DAYS,
  now = new Date(),
  fetchImpl = globalThis.fetch
} = {}) => {
  if (!hasProductAnalyticsCredentials({ supabaseUrl, secretKey })) {
    throw new ProductAnalyticsReadError(
      'Player analytics is not configured on this desktop.',
      'PRODUCT_ANALYTICS_NOT_CONFIGURED'
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw new ProductAnalyticsReadError('Player analytics cannot make a network request.');
  }

  const configuredUrl = normalizeSupabaseUrl(supabaseUrl);
  const configuredKey = String(secretKey).trim();
  if (configuredKey.startsWith('sb_publishable_')) {
    throw new ProductAnalyticsReadError(
      'Player analytics requires a server-side Supabase key.',
      'PRODUCT_ANALYTICS_INVALID_CONFIGURATION'
    );
  }
  const configuredTable = normalizeTable(table);
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || DEFAULT_DAYS)));
  const fetchedAt = safeDate(now);
  const cutoffDate = new Date(Date.UTC(
    fetchedAt.getUTCFullYear(),
    fetchedAt.getUTCMonth(),
    fetchedAt.getUTCDate()
  ) - (safeDays - 1) * 86_400_000);
  const cutoff = cutoffDate.toISOString();
  const endpoint = new URL(`/rest/v1/${configuredTable}`, configuredUrl);
  endpoint.search = new URLSearchParams({
    select: 'event_name,session_id,properties,occurred_at',
    event_name: `in.(${PRODUCT_EVENTS.join(',')})`,
    occurred_at: `gte.${cutoff}`,
    order: 'occurred_at.asc'
  }).toString();
  const headers = { apikey: configuredKey, Accept: 'application/json' };
  if (!configuredKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${configuredKey}`;

  const events = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          ...headers,
          Range: `${offset}-${Math.min(MAX_ROWS - 1, offset + PAGE_SIZE - 1)}`,
          'Range-Unit': 'items'
        },
        redirect: 'error',
        signal: AbortSignal.timeout(12_000)
      });
    } catch {
      throw new ProductAnalyticsReadError(
        'Player analytics could not reach Supabase.',
        'PRODUCT_ANALYTICS_NETWORK_ERROR'
      );
    }
    if (!response?.ok) {
      const status = Number(response?.status);
      throw new ProductAnalyticsReadError(
        Number.isInteger(status)
          ? `Player analytics failed with HTTP ${status}.`
          : 'Player analytics failed.',
        'PRODUCT_ANALYTICS_HTTP_ERROR'
      );
    }

    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_PAGE_BYTES) {
      throw new ProductAnalyticsReadError(
        'Player analytics received a page larger than the local safety limit.',
        'PRODUCT_ANALYTICS_RESPONSE_TOO_LARGE'
      );
    }
    let rows;
    try {
      rows = JSON.parse(text);
    } catch {
      throw new ProductAnalyticsReadError(
        'Player analytics received invalid JSON.',
        'PRODUCT_ANALYTICS_INVALID_RESPONSE'
      );
    }
    if (!Array.isArray(rows)) {
      throw new ProductAnalyticsReadError(
        'Player analytics received an unexpected response.',
        'PRODUCT_ANALYTICS_INVALID_RESPONSE'
      );
    }
    for (const row of rows) {
      const event = normalizeEvent(row);
      if (event) events.push(event);
    }
    if (rows.length < PAGE_SIZE) break;
  }

  return {
    events,
    fetchedAt: fetchedAt.toISOString(),
    source: {
      system: 'Supabase',
      table: configuredTable,
      windowDays: safeDays,
      host: new URL(configuredUrl).hostname
    }
  };
};

const createDayBucket = (day) => ({
  date: day,
  visitors: new Set(),
  sessions: new Set(),
  activeSeconds: 0,
  missionStarts: 0,
  runFinishes: 0,
  scoreSubmissions: 0
});

const dayRange = (days, now) => {
  const output = [];
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let index = days - 1; index >= 0; index -= 1) {
    output.push(new Date(end.getTime() - index * 86_400_000).toISOString().slice(0, 10));
  }
  return output;
};

const displayMode = (mode) => {
  const labels = {
    campaign: 'Campaign',
    'weekly-run': 'Weekly Run',
    weekly: 'Weekly Run',
    'boss-archive': 'Boss Archive',
    'campaign-branch': 'Campaign Branch',
    unspecified: 'Unspecified'
  };
  return labels[mode] || mode.split('-').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
};

export const aggregateProductAnalytics = (events, { days = 30, now = new Date() } = {}) => {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  const nowDate = safeDate(now);
  const daysInRange = dayRange(safeDays, nowDate);
  const cutoffMs = Date.parse(`${daysInRange[0]}T00:00:00.000Z`);
  const buckets = new Map(daysInRange.map((day) => [day, createDayBucket(day)]));
  const normalized = (Array.isArray(events) ? events : [])
    .map((event) => event?.eventName ? event : normalizeEvent(event))
    .filter((event) => event && !event.isTest)
    .filter((event) => {
      const time = Date.parse(event.occurredAt);
      return Number.isFinite(time) && time >= cutoffMs && time <= nowDate.getTime();
    })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  const visitors = new Set();
  const openedSessions = new Set();
  const hashedOpenedSessions = new Set();
  const firstStatusByVisitor = new Map();
  const activeBySession = new Map();
  const previousActivityBySession = new Map();
  const modeMetrics = new Map();
  let missionStarts = 0;
  let runFinishes = 0;
  let scoreSubmissions = 0;
  let latestEventAt = '';

  const modeBucket = (mode) => {
    if (!modeMetrics.has(mode)) modeMetrics.set(mode, { mode: displayMode(mode), starts: 0, finishes: 0 });
    return modeMetrics.get(mode);
  };

  for (const event of normalized) {
    latestEventAt = event.occurredAt;
    const bucket = buckets.get(dateKey(event.occurredAt));
    if (event.visitorHash) {
      visitors.add(event.visitorHash);
      bucket?.visitors.add(event.visitorHash);
    }

    if (event.eventName === 'app_opened' && event.sessionId) {
      openedSessions.add(event.sessionId);
      bucket?.sessions.add(event.sessionId);
      if (event.visitorHash) {
        hashedOpenedSessions.add(event.sessionId);
        if (event.playerStatus && !firstStatusByVisitor.has(event.visitorHash)) {
          firstStatusByVisitor.set(event.visitorHash, event.playerStatus);
        }
      }
    } else if (event.eventName === 'returning_player' && event.visitorHash) {
      if (!firstStatusByVisitor.has(event.visitorHash)) firstStatusByVisitor.set(event.visitorHash, 'returning');
    }

    if (
      event.eventName === 'session_activity'
      && event.sessionId
      && event.activeSecondsTotal !== null
    ) {
      const current = event.activeSecondsTotal;
      activeBySession.set(event.sessionId, Math.max(activeBySession.get(event.sessionId) || 0, current));
      const previous = previousActivityBySession.get(event.sessionId) || 0;
      const delta = Math.max(0, current - previous);
      previousActivityBySession.set(event.sessionId, Math.max(previous, current));
      if (bucket) bucket.activeSeconds += delta;
    }

    if (event.eventName === 'mission_started') {
      missionStarts += 1;
      if (bucket) bucket.missionStarts += 1;
      modeBucket(event.runMode).starts += 1;
    } else if (event.eventName === 'mission_completed') {
      runFinishes += 1;
      if (bucket) bucket.runFinishes += 1;
      modeBucket(event.runMode).finishes += 1;
    } else if (event.eventName === 'score_submitted') {
      scoreSubmissions += 1;
      if (bucket) bucket.scoreSubmissions += 1;
    }
  }

  const totalActiveSeconds = [...activeBySession.values()].reduce((sum, value) => sum + value, 0);
  const newDevices = [...firstStatusByVisitor.values()].filter((status) => status === 'new').length;
  const returningDevices = [...firstStatusByVisitor.values()].filter((status) => status === 'returning').length;
  const sessions = openedSessions.size;
  const coverage = sessions > 0 ? hashedOpenedSessions.size / sessions : 0;

  return {
    days: safeDays,
    periodStart: new Date(cutoffMs).toISOString(),
    periodEnd: nowDate.toISOString(),
    latestEventAt,
    uniqueDevices: visitors.size,
    newDevices,
    returningDevices,
    sessions,
    measuredActiveSessions: activeBySession.size,
    totalActiveSeconds,
    averageActiveSessionSeconds: activeBySession.size > 0
      ? totalActiveSeconds / activeBySession.size
      : 0,
    missionStarts,
    runFinishes,
    finishRate: missionStarts > 0 ? runFinishes / missionStarts : 0,
    scoreSubmissions,
    visitorCoverage: coverage,
    legacySessionsExcluded: Math.max(0, sessions - hashedOpenedSessions.size),
    daily: [...buckets.values()].map((bucket) => ({
      date: bucket.date,
      uniqueDevices: bucket.visitors.size,
      sessions: bucket.sessions.size,
      activeSeconds: Math.round(bucket.activeSeconds),
      missionStarts: bucket.missionStarts,
      runFinishes: bucket.runFinishes,
      scoreSubmissions: bucket.scoreSubmissions
    })),
    modes: [...modeMetrics.values()]
      .sort((left, right) => right.starts - left.starts || right.finishes - left.finishes || left.mode.localeCompare(right.mode))
  };
};

export const buildProductAnalyticsWindows = (events, { now = new Date() } = {}) => ({
  7: aggregateProductAnalytics(events, { days: 7, now }),
  30: aggregateProductAnalytics(events, { days: 30, now }),
  90: aggregateProductAnalytics(events, { days: 90, now })
});

export const PRODUCT_ANALYTICS_LIMITS = Object.freeze({
  defaultDays: DEFAULT_DAYS,
  pageSize: PAGE_SIZE,
  maxRows: MAX_ROWS,
  maxPageBytes: MAX_PAGE_BYTES
});
