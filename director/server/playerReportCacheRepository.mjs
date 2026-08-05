import { lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const PLAYER_REPORT_CACHE_SCHEMA_VERSION = 1;
export const PLAYER_REPORT_CACHE_MAX_BYTES = 4 * 1024 * 1024;
export const DEFAULT_PLAYER_REPORT_DASHBOARD_URL =
  'https://supabase.com/dashboard/project/ktdruljunithwopizorq/editor/18079?schema=public';

const REPORT_STATES = new Set(['ready', 'unconfigured', 'error']);
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : null;
};

const safeTimestamp = (value) => {
  const text = safeString(value, 40);
  return text && Number.isFinite(Date.parse(text)) ? text : '';
};

const safePrimitiveRecord = (value, maximumEntries = 20) => {
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
  return safePrimitiveRecord(Object.fromEntries(
    [...allowedKeys].filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]])
  ), allowedKeys.size);
};

const normalizeDiagnostics = (value) => {
  const diagnostics = safeObject(value);
  const environment = pickPrimitiveRecord(diagnostics.environment, ENVIRONMENT_KEYS);
  const connection = pickPrimitiveRecord(
    safeObject(diagnostics.environment).connection,
    CONNECTION_KEYS
  );
  if (Object.keys(connection).length > 0) environment.connection = connection;
  const runtime = pickPrimitiveRecord(diagnostics.runtime, RUNTIME_KEYS);
  const performance = pickPrimitiveRecord(diagnostics.performance, PERFORMANCE_KEYS);
  const breadcrumbs = Array.isArray(diagnostics.breadcrumbs)
    ? diagnostics.breadcrumbs.slice(-30).flatMap((entry) => {
        const breadcrumb = safeObject(entry);
        const name = safeString(breadcrumb.name, 64);
        if (!name) return [];
        return [{
          at: safeTimestamp(breadcrumb.at),
          name,
          details: safePrimitiveRecord(breadcrumb.details, 12)
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

const normalizeReport = (value) => {
  const report = safeObject(value);
  if (
    !REPORT_EVENT_NAMES.has(report.eventName)
    || !REPORT_KINDS.has(report.kind)
    || !REPORT_CATEGORIES.has(report.category)
    || !REPORT_SOURCES.has(report.source)
  ) return null;
  const reportId = safeString(report.reportId, 80);
  const summary = safeString(report.summary, 600);
  if (!reportId || !summary) return null;
  const diagnostics = normalizeDiagnostics(report.diagnostics);
  return {
    eventName: report.eventName,
    reportId,
    kind: report.kind,
    category: report.category,
    source: report.source,
    summary,
    details: safeString(report.details, 5000),
    sessionId: safeString(report.sessionId, 80),
    gameVersion: safeString(report.gameVersion, 100),
    createdAt: safeTimestamp(report.createdAt),
    occurredAt: safeTimestamp(report.occurredAt),
    ...(diagnostics ? { diagnostics } : {})
  };
};

const safeDashboardUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol === 'https:' && url.hostname === 'supabase.com' && url.pathname.startsWith('/dashboard/')) {
      return url.href;
    }
  } catch {
    // Use the fixed project table fallback below.
  }
  return DEFAULT_PLAYER_REPORT_DASHBOARD_URL;
};

const defaultMessage = (state) => {
  if (state === 'ready') return 'Player reports are loaded from the trusted local cache.';
  if (state === 'error') return 'The last player-report refresh failed. Try refreshing again.';
  return 'Player report review is not connected on this desktop yet.';
};

export const createPlayerReportCacheEnvelope = ({
  state,
  generatedAt,
  dashboardUrl = DEFAULT_PLAYER_REPORT_DASHBOARD_URL,
  message,
  reports = []
}) => {
  const normalizedState = REPORT_STATES.has(state) ? state : 'error';
  return {
    schemaVersion: PLAYER_REPORT_CACHE_SCHEMA_VERSION,
    state: normalizedState,
    generatedAt: safeTimestamp(generatedAt) || null,
    dashboardUrl: safeDashboardUrl(dashboardUrl),
    message: safeString(message, 240) || defaultMessage(normalizedState),
    reports: Array.isArray(reports)
      ? reports.slice(0, 100).flatMap((report) => {
          const normalized = normalizeReport(report);
          return normalized ? [normalized] : [];
        })
      : []
  };
};

export const normalizePlayerReportCacheEnvelope = (value) => {
  const envelope = safeObject(value);
  if (envelope.schemaVersion !== PLAYER_REPORT_CACHE_SCHEMA_VERSION) {
    return createPlayerReportCacheEnvelope({
      state: 'error',
      generatedAt: null,
      message: 'The local player-report cache uses an unsupported format.'
    });
  }
  return createPlayerReportCacheEnvelope(envelope);
};

export const resolveDefaultPlayerReportCachePath = ({
  localAppData = process.env.LOCALAPPDATA,
  homeDirectory = os.homedir()
} = {}) => {
  if (String(localAppData || '').trim()) {
    return path.join(
      path.resolve(String(localAppData).trim()),
      'Scicon Director',
      'player-reports.json'
    );
  }
  return path.join(path.resolve(homeDirectory), '.scicon-director', 'player-reports.json');
};

const unavailableEnvelope = (state, message) => createPlayerReportCacheEnvelope({
  state,
  generatedAt: null,
  message
});

export class PlayerReportCacheRepository {
  constructor({ cachePath = resolveDefaultPlayerReportCachePath() } = {}) {
    this.cachePath = path.resolve(cachePath);
  }

  async readSnapshot() {
    let metadata;
    try {
      metadata = await lstat(this.cachePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return unavailableEnvelope(
          'unconfigured',
          'Player report review is not connected on this desktop yet.'
        );
      }
      return unavailableEnvelope('error', 'The local player-report cache could not be read.');
    }
    if (!metadata.isFile() || metadata.size > PLAYER_REPORT_CACHE_MAX_BYTES) {
      return unavailableEnvelope('error', 'The local player-report cache failed its safety checks.');
    }

    try {
      const text = await readFile(this.cachePath, 'utf8');
      return normalizePlayerReportCacheEnvelope(JSON.parse(text));
    } catch {
      return unavailableEnvelope('error', 'The local player-report cache is damaged or incomplete.');
    }
  }
}
