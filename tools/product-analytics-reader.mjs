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
  'run_progress',
  'run_ended',
  'score_submitted'
]);
const PRODUCT_EVENT_SET = new Set(PRODUCT_EVENTS);
const HEX_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const ANALYTICS_RUN_ID_PATTERN = /^[a-z0-9-]{8,80}$/i;
const TEST_MODE_PATTERN = /(?:^|[-_ ])(?:test|owner|sandbox|preview|director|lab)(?:$|[-_ ])/i;
const TEST_SOURCE_PATTERN = /^(?:development|local|preview|test)$/i;

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

const boundedInteger = (value, minimum = 0, maximum = 100_000) => {
  const number = boundedNumber(value, minimum, maximum);
  return number === null ? null : Math.floor(number);
};

const normalizeEvent = (row) => {
  const record = objectValue(row);
  const eventName = safeText(record.event_name, 48);
  const occurredAt = safeTimestamp(record.occurred_at);
  const properties = objectValue(record.properties);
  if (!PRODUCT_EVENT_SET.has(eventName) || !occurredAt) return null;

  const visitorHash = safeText(properties.visitor_hash, 128);
  const analyticsRunId = safeText(properties.analytics_run_id || properties.run_id, 80);
  const eventSource = normalizeMode(properties.event_source || properties.environment || 'legacy');
  return {
    eventName,
    occurredAt,
    sessionId: safeText(record.session_id, 80),
    visitorHash: HEX_HASH_PATTERN.test(visitorHash) ? visitorHash.toLowerCase() : '',
    playerStatus: ['new', 'returning'].includes(properties.player_status)
      ? properties.player_status
      : '',
    activeSecondsTotal: boundedNumber(properties.active_seconds_total),
    gameplaySecondsTotal: boundedNumber(properties.gameplay_seconds_total),
    runMode: normalizeMode(properties.run_mode || properties.mode),
    result: safeText(properties.result, 32).toLowerCase(),
    missionNumber: boundedInteger(properties.mission_number, 1, 999),
    waveNumber: boundedInteger(properties.wave_number ?? properties.wave, 1, 9_999),
    absoluteWaveNumber: boundedInteger(
      properties.absolute_wave_number ?? properties.wave_number ?? properties.wave,
      1,
      9_999
    ),
    durationSeconds: boundedInteger(properties.duration_seconds, 0, 604_800),
    analyticsRunId: ANALYTICS_RUN_ID_PATTERN.test(analyticsRunId) ? analyticsRunId : '',
    continuousRun: properties.continuous_run === true,
    schemaVersion: boundedInteger(properties.schema_version, 0, 100) ?? 0,
    eventSource,
    isTest: properties.test_run === true
      || properties.owner_test === true
      || properties.test_mode === true
      || TEST_SOURCE_PATTERN.test(eventSource)
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
    // Preserve the newest traffic if the bounded reader ever reaches MAX_ROWS.
    // Aggregation sorts locally after reading, so newest-first pagination keeps
    // the 7/30-day owner views useful even when older 90-day history is clipped.
    order: 'occurred_at.desc'
  }).toString();
  const headers = { apikey: configuredKey, Accept: 'application/json' };
  if (!configuredKey.startsWith('sb_secret_')) headers.Authorization = `Bearer ${configuredKey}`;

  const events = [];
  let reachedEndOfFeed = false;
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
    if (rows.length < PAGE_SIZE) {
      reachedEndOfFeed = true;
      break;
    }
  }

  return {
    events,
    rowLimitHit: !reachedEndOfFeed,
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
  measuredActiveSessions: new Set(),
  measuredGameplaySessions: new Set(),
  flightSessions: new Set(),
  activeSeconds: 0,
  gameplaySeconds: 0,
  missionStarts: 0,
  campaignStarts: 0,
  runEnds: 0,
  campaignClears: 0,
  defeats: 0,
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
    'campaign-replay': 'Campaign Replay',
    'weekly-run': 'Weekly Run',
    weekly: 'Weekly Run',
    'weekly-streak': 'Weekly Run',
    'boss-archive': 'Boss Archive',
    'campaign-branch': 'Campaign Branch',
    standard: 'Standard Run',
    unspecified: 'Unspecified'
  };
  return labels[mode] || mode.split('-').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
};

const isCampaignMode = (mode) => mode === 'campaign' || mode === 'campaign-replay';
const isWeeklyMode = (mode) => mode === 'weekly' || mode === 'weekly-run' || mode === 'weekly-streak';
const knownOutcome = (value) => {
  const result = safeText(value, 32).toLowerCase();
  return ['completed', 'defeated', 'forfeited', 'exited', 'interrupted'].includes(result)
    ? result
    : 'ended';
};
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};
const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;

export const aggregateProductAnalytics = (
  events,
  { days = 30, now = new Date(), rowLimitHit = false } = {}
) => {
  const safeDays = Math.max(1, Math.min(365, Math.floor(Number(days) || 30)));
  const nowDate = safeDate(now);
  const daysInRange = dayRange(safeDays, nowDate);
  const cutoffMs = Date.parse(`${daysInRange[0]}T00:00:00.000Z`);
  const buckets = new Map(daysInRange.map((day) => [day, createDayBucket(day)]));
  const seenEventKeys = new Set();
  const eligibleAll = (Array.isArray(events) ? events : [])
    .map((event) => event?.eventName ? event : normalizeEvent(event))
    .filter((event) => event && !event.isTest)
    .filter((event) => {
      const time = Date.parse(event.occurredAt);
      return Number.isFinite(time) && time <= nowDate.getTime();
    })
    .filter((event) => {
      const key = [
        event.eventName,
        event.occurredAt,
        event.sessionId,
        event.analyticsRunId,
        event.activeSecondsTotal,
        event.gameplaySecondsTotal,
        event.runMode,
        event.result,
        event.missionNumber,
        event.waveNumber,
        event.absoluteWaveNumber
      ].join('\u001f');
      if (seenEventKeys.has(key)) return false;
      seenEventKeys.add(key);
      return true;
    })
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  // Only explicitly server-tagged production rows enter owner-facing KPIs.
  // Older untagged rows remain available as clearly labelled mixed-history
  // context because they may contain both real players and owner/local testing.
  const normalizedAll = eligibleAll.filter((event) => event.eventSource === 'production');
  const normalized = normalizedAll.filter((event) => Date.parse(event.occurredAt) >= cutoffMs);
  const eligibleWindow = eligibleAll.filter((event) => Date.parse(event.occurredAt) >= cutoffMs);
  const mixedHistoryWindow = eligibleWindow.filter((event) => event.eventSource !== 'production');
  const earliestEligibleAt = eligibleAll[0]?.occurredAt || '';
  const windowRowLimitHit = Boolean(
    rowLimitHit
    && (!earliestEligibleAt || Date.parse(earliestEligibleAt) > cutoffMs)
  );

  const visitors = new Set();
  const openedSessions = new Set();
  const hashedOpenedSessions = new Set();
  const timeEligibleSessions = new Set();
  const firstStatusByVisitor = new Map();
  const previousActivityBySession = new Map();
  const previousGameplayBySession = new Map();
  const activeSecondsBySession = new Map();
  const gameplaySecondsBySession = new Map();
  const modeMetrics = new Map();
  let scoreSubmissions = 0;
  let latestEventAt = '';
  let schemaV3Events = 0;

  for (const event of normalizedAll) {
    if (Date.parse(event.occurredAt) >= cutoffMs || event.eventName !== 'session_activity' || !event.sessionId) {
      continue;
    }
    if (Number.isFinite(event.activeSecondsTotal)) {
      previousActivityBySession.set(event.sessionId, event.activeSecondsTotal);
    }
    if (Number.isFinite(event.gameplaySecondsTotal)) {
      previousGameplayBySession.set(event.sessionId, event.gameplaySecondsTotal);
    }
  }

  const runs = new Map();
  const currentRunBySession = new Map();
  const legacyRunSequence = new Map();

  const createLegacyRunKey = (event, prefix = 'run') => {
    const sessionId = event.sessionId || 'unknown-session';
    const sequence = (legacyRunSequence.get(sessionId) || 0) + 1;
    legacyRunSequence.set(sessionId, sequence);
    return `${prefix}:${sessionId}:${sequence}`;
  };
  const ensureRun = (key, event) => {
    if (!runs.has(key)) {
      runs.set(key, {
        key,
        sessionId: event.sessionId,
        visitorHash: event.visitorHash,
        mode: event.runMode,
        missionNumber: event.missionNumber,
        startedAt: '',
        endedAt: '',
        outcome: '',
        maxWave: 0,
        maxAbsoluteWave: 0,
        hasProgress: false,
        hasOutcomeDetails: false
      });
    }
    const run = runs.get(key);
    if (!run.visitorHash && event.visitorHash) run.visitorHash = event.visitorHash;
    if (run.mode === 'unspecified' && event.runMode !== 'unspecified') run.mode = event.runMode;
    if (!run.missionNumber && event.missionNumber) run.missionNumber = event.missionNumber;
    run.maxWave = Math.max(run.maxWave, event.waveNumber || 0);
    run.maxAbsoluteWave = Math.max(run.maxAbsoluteWave, event.absoluteWaveNumber || 0);
    return run;
  };

  const modeBucket = (mode) => {
    if (!modeMetrics.has(mode)) {
      modeMetrics.set(mode, {
        mode: displayMode(mode),
        starts: 0,
        finishes: 0,
        clears: 0,
        defeats: 0,
        exits: 0,
        noEnd: 0
      });
    }
    return modeMetrics.get(mode);
  };

  // Correlate runs across the full available lookback before selecting the
  // reporting cohort. This prevents an outcome just inside a 7/30-day boundary
  // from becoming an impossible clear with no matching start.
  for (const event of normalizedAll) {
    if (event.eventName === 'mission_started') {
      const key = event.analyticsRunId
        ? `id:${event.analyticsRunId}`
        : createLegacyRunKey(event);
      const run = ensureRun(key, event);
      if (!run.startedAt) run.startedAt = event.occurredAt;
      if (event.sessionId) currentRunBySession.set(event.sessionId, key);
    } else if (event.eventName === 'run_progress') {
      const key = event.analyticsRunId
        ? `id:${event.analyticsRunId}`
        : currentRunBySession.get(event.sessionId) || createLegacyRunKey(event, 'progress');
      const run = ensureRun(key, event);
      run.hasProgress = true;
      if (event.sessionId && !currentRunBySession.has(event.sessionId)) {
        currentRunBySession.set(event.sessionId, key);
      }
    } else if (event.eventName === 'run_ended' || event.eventName === 'mission_completed') {
      const key = event.analyticsRunId
        ? `id:${event.analyticsRunId}`
        : currentRunBySession.get(event.sessionId) || createLegacyRunKey(event, 'ended');
      const run = ensureRun(key, event);
      if (!run.endedAt) run.endedAt = event.occurredAt;
      if (!run.outcome || run.outcome === 'ended') run.outcome = knownOutcome(event.result);
      run.hasOutcomeDetails = run.hasOutcomeDetails || Boolean(
        event.result && (event.waveNumber || event.absoluteWaveNumber || event.missionNumber)
      );
      if (event.sessionId && currentRunBySession.get(event.sessionId) === key) {
        currentRunBySession.delete(event.sessionId);
      }
    }
  }

  for (const event of normalized) {
    latestEventAt = event.occurredAt;
    const bucket = buckets.get(dateKey(event.occurredAt));
    if (event.schemaVersion >= 3) schemaV3Events += 1;
    if (event.visitorHash) {
      visitors.add(event.visitorHash);
      bucket?.visitors.add(event.visitorHash);
    }

    if (event.eventName === 'app_opened' && event.sessionId) {
      openedSessions.add(event.sessionId);
      timeEligibleSessions.add(event.sessionId);
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
      && Number.isFinite(event.activeSecondsTotal)
    ) {
      timeEligibleSessions.add(event.sessionId);
      const current = event.activeSecondsTotal;
      const previous = previousActivityBySession.get(event.sessionId) || 0;
      const delta = Math.max(0, current >= previous ? current - previous : current);
      previousActivityBySession.set(event.sessionId, current);
      activeSecondsBySession.set(event.sessionId, (activeSecondsBySession.get(event.sessionId) || 0) + delta);
      if (bucket) {
        bucket.activeSeconds += delta;
        bucket.measuredActiveSessions.add(event.sessionId);
      }
    }

    if (
      event.eventName === 'session_activity'
      && event.sessionId
      && Number.isFinite(event.gameplaySecondsTotal)
    ) {
      timeEligibleSessions.add(event.sessionId);
      const current = event.gameplaySecondsTotal;
      const previous = previousGameplayBySession.get(event.sessionId) || 0;
      const delta = Math.max(0, current >= previous ? current - previous : current);
      previousGameplayBySession.set(event.sessionId, current);
      gameplaySecondsBySession.set(event.sessionId, (gameplaySecondsBySession.get(event.sessionId) || 0) + delta);
      if (bucket) {
        bucket.gameplaySeconds += delta;
        bucket.measuredGameplaySessions.add(event.sessionId);
        if (delta > 0) bucket.flightSessions.add(event.sessionId);
      }
    }

    if (event.eventName === 'score_submitted') {
      scoreSubmissions += 1;
      if (bucket) bucket.scoreSubmissions += 1;
    }
  }

  const startedRuns = [...runs.values()].filter((run) => (
    run.startedAt && Date.parse(run.startedAt) >= cutoffMs
  ));
  // Keep the headline finish rate cohort-based: an ending whose start falls
  // before the selected window must not make the window exceed 100% finished.
  const endedRuns = startedRuns.filter((run) => run.endedAt);
  const campaignRuns = startedRuns.filter((run) => isCampaignMode(run.mode));
  const campaignClears = campaignRuns.filter((run) => run.outcome === 'completed').length;
  const missionProgress = new Map();
  const furthestMissionByVisitor = new Map();

  for (const run of startedRuns) {
    if (run.startedAt) {
      const bucket = buckets.get(dateKey(run.startedAt));
      if (bucket) {
        bucket.missionStarts += 1;
        if (isCampaignMode(run.mode)) bucket.campaignStarts += 1;
      }
    }
    if (run.endedAt) {
      const bucket = buckets.get(dateKey(run.endedAt));
      if (bucket) {
        bucket.runEnds += 1;
        if (isCampaignMode(run.mode) && run.outcome === 'completed') bucket.campaignClears += 1;
        if (run.outcome === 'defeated') bucket.defeats += 1;
      }
    }

    if (!isCampaignMode(run.mode) || !run.missionNumber) continue;
    if (!missionProgress.has(run.missionNumber)) {
      missionProgress.set(run.missionNumber, {
        missionNumber: run.missionNumber,
        reachedDevices: new Set(),
        starts: 0,
        ends: 0,
        clears: 0,
        defeats: 0,
        exits: 0
      });
    }
    const mission = missionProgress.get(run.missionNumber);
    if (run.visitorHash) {
      mission.reachedDevices.add(run.visitorHash);
      furthestMissionByVisitor.set(
        run.visitorHash,
        Math.max(furthestMissionByVisitor.get(run.visitorHash) || 0, run.missionNumber)
      );
    }
    if (run.startedAt) mission.starts += 1;
    if (run.endedAt) mission.ends += 1;
    if (run.outcome === 'completed') mission.clears += 1;
    if (run.outcome === 'defeated') mission.defeats += 1;
    if (['forfeited', 'exited', 'interrupted'].includes(run.outcome)) mission.exits += 1;
  }

  for (const run of startedRuns) {
    const mode = modeBucket(run.mode);
    mode.starts += 1;
    if (run.endedAt) mode.finishes += 1;
    else mode.noEnd += 1;
    if (run.outcome === 'completed') mode.clears += 1;
    if (run.outcome === 'defeated') mode.defeats += 1;
    if (['forfeited', 'exited', 'interrupted'].includes(run.outcome)) mode.exits += 1;
  }

  const furthestMissionCounts = new Map();
  for (const missionNumber of furthestMissionByVisitor.values()) {
    furthestMissionCounts.set(missionNumber, (furthestMissionCounts.get(missionNumber) || 0) + 1);
  }

  const weeklyRuns = startedRuns.filter((run) => isWeeklyMode(run.mode));
  const weeklyDepths = weeklyRuns
    .map((run) => Math.max(run.maxAbsoluteWave, run.maxWave))
    .filter((depth) => depth > 0);
  const weeklyDepthBands = [
    { label: '1–2', minimum: 1, maximum: 2 },
    { label: '3–5', minimum: 3, maximum: 5 },
    { label: '6–9', minimum: 6, maximum: 9 },
    { label: '10–14', minimum: 10, maximum: 14 },
    { label: '15+', minimum: 15, maximum: Number.POSITIVE_INFINITY }
  ].map((band) => ({
    label: band.label,
    runs: weeklyDepths.filter((depth) => depth >= band.minimum && depth <= band.maximum).length
  }));

  const totalActiveSeconds = [...activeSecondsBySession.values()].reduce((sum, value) => sum + value, 0);
  const totalGameplaySeconds = [...gameplaySecondsBySession.values()].reduce((sum, value) => sum + value, 0);
  const newDevices = [...firstStatusByVisitor.values()].filter((status) => status === 'new').length;
  const returningDevices = [...firstStatusByVisitor.values()].filter((status) => status === 'returning').length;
  const sessions = openedSessions.size;
  const missionStarts = startedRuns.length;
  const runFinishes = endedRuns.length;
  const coverage = ratio(hashedOpenedSessions.size, sessions);
  const measuredActiveSessions = activeSecondsBySession.size;
  const measuredGameplaySessions = gameplaySecondsBySession.size;
  const flightSessions = [...gameplaySecondsBySession.values()].filter((seconds) => seconds > 0).length;
  const startsWithMissionNumber = startedRuns.filter((run) => run.missionNumber).length;
  const startsWithProgress = startedRuns.filter((run) => run.hasProgress).length;
  const endsWithDetails = endedRuns.filter((run) => run.hasOutcomeDetails).length;
  const eligibleOpenedSessions = new Set(
    eligibleWindow
      .filter((event) => event.eventName === 'app_opened' && event.sessionId)
      .map((event) => event.sessionId)
  );
  const mixedOpenedSessions = new Set(
    mixedHistoryWindow
      .filter((event) => event.eventName === 'app_opened' && event.sessionId)
      .map((event) => event.sessionId)
  );
  const mixedVisitors = new Set(
    mixedHistoryWindow.map((event) => event.visitorHash).filter(Boolean)
  );
  const latestObservedEventAt = eligibleWindow.at(-1)?.occurredAt || '';

  return {
    days: safeDays,
    periodStart: new Date(cutoffMs).toISOString(),
    periodEnd: nowDate.toISOString(),
    latestEventAt,
    uniqueDevices: visitors.size,
    newDevices,
    returningDevices,
    sessions,
    measuredActiveSessions,
    totalActiveSeconds,
    averageActiveSessionSeconds: ratio(totalActiveSeconds, measuredActiveSessions),
    measuredGameplaySessions,
    flightSessions,
    totalGameplaySeconds,
    averageGameplaySessionSeconds: ratio(totalGameplaySeconds, flightSessions),
    missionStarts,
    runFinishes,
    finishRate: ratio(runFinishes, missionStarts),
    campaignStarts: campaignRuns.length,
    campaignClears,
    campaignClearRate: ratio(campaignClears, campaignRuns.length),
    scoreSubmissions,
    visitorCoverage: coverage,
    legacySessionsExcluded: mixedOpenedSessions.size,
    mixedHistory: {
      events: mixedHistoryWindow.length,
      sessions: mixedOpenedSessions.size,
      uniqueDevices: mixedVisitors.size,
      missionStarts: mixedHistoryWindow.filter((event) => event.eventName === 'mission_started').length,
      scoreSubmissions: mixedHistoryWindow.filter((event) => event.eventName === 'score_submitted').length,
      latestEventAt: mixedHistoryWindow.at(-1)?.occurredAt || ''
    },
    daily: [...buckets.values()].map((bucket) => ({
      date: bucket.date,
      uniqueDevices: bucket.visitors.size,
      sessions: bucket.sessions.size,
      measuredActiveSessions: bucket.measuredActiveSessions.size,
      measuredGameplaySessions: bucket.measuredGameplaySessions.size,
      flightSessions: bucket.flightSessions.size,
      activeSeconds: Math.round(bucket.activeSeconds),
      gameplaySeconds: Math.round(bucket.gameplaySeconds),
      averageActiveSessionSeconds: ratio(bucket.activeSeconds, bucket.measuredActiveSessions.size),
      averageGameplaySessionSeconds: ratio(bucket.gameplaySeconds, bucket.flightSessions.size),
      missionStarts: bucket.missionStarts,
      runFinishes: bucket.runEnds,
      campaignClears: bucket.campaignClears,
      campaignClearRate: ratio(bucket.campaignClears, bucket.campaignStarts),
      defeats: bucket.defeats,
      scoreSubmissions: bucket.scoreSubmissions
    })),
    modes: [...modeMetrics.values()]
      .sort((left, right) => right.starts - left.starts || right.finishes - left.finishes || left.mode.localeCompare(right.mode)),
    missionProgress: [...missionProgress.values()]
      .sort((left, right) => left.missionNumber - right.missionNumber)
      .map((mission) => ({
        missionNumber: mission.missionNumber,
        reachedDevices: mission.reachedDevices.size,
        starts: mission.starts,
        ends: mission.ends,
        clears: mission.clears,
        defeats: mission.defeats,
        exits: mission.exits,
        noEnd: Math.max(0, mission.starts - mission.ends),
        clearRate: ratio(mission.clears, mission.starts)
      })),
    furthestMissionDistribution: [...furthestMissionCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([missionNumber, devices]) => ({ missionNumber, devices })),
    weeklyRun: {
      attempts: weeklyRuns.length,
      endedRuns: weeklyRuns.filter((run) => run.endedAt).length,
      measuredRuns: weeklyDepths.length,
      averageDepth: ratio(weeklyDepths.reduce((sum, depth) => sum + depth, 0), weeklyDepths.length),
      medianDepth: median(weeklyDepths),
      deepestDepth: weeklyDepths.length ? Math.max(...weeklyDepths) : 0,
      depthBands: weeklyDepthBands
    },
    dataQuality: {
      visitorCoverage: coverage,
      activeTimeCoverage: ratio(measuredActiveSessions, timeEligibleSessions.size),
      gameplayTimeCoverage: ratio(measuredGameplaySessions, timeEligibleSessions.size),
      missionNumberCoverage: ratio(startsWithMissionNumber, missionStarts),
      progressCoverage: ratio(startsWithProgress, missionStarts),
      outcomeDetailCoverage: ratio(endsWithDetails, runFinishes),
      productionSourceCoverage: ratio(sessions, eligibleOpenedSessions.size),
      schemaV3Coverage: ratio(schemaV3Events, normalized.length),
      productionTaggedEventCoverage: ratio(normalized.length, eligibleWindow.length),
      latestEventAt,
      latestObservedEventAt,
      rowLimitHit: windowRowLimitHit
    }
  };
};

export const buildProductAnalyticsWindows = (events, { now = new Date(), rowLimitHit = false } = {}) => ({
  7: aggregateProductAnalytics(events, { days: 7, now, rowLimitHit }),
  30: aggregateProductAnalytics(events, { days: 30, now, rowLimitHit }),
  90: aggregateProductAnalytics(events, { days: 90, now, rowLimitHit })
});

export const PRODUCT_ANALYTICS_LIMITS = Object.freeze({
  defaultDays: DEFAULT_DAYS,
  pageSize: PAGE_SIZE,
  maxRows: MAX_ROWS,
  maxPageBytes: MAX_PAGE_BYTES
});
