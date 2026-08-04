import { getClientSessionId } from './clientSession';
import { GAME_VERSION } from './runReceiptService';

export type PlayerReportKind = 'feedback' | 'bug';
export type PlayerReportCategory =
  | 'gameplay'
  | 'loading-performance'
  | 'wallet-purchase'
  | 'visual-audio'
  | 'other'
  | 'crash';

export interface PlayerReportInput {
  kind: PlayerReportKind;
  category: PlayerReportCategory;
  summary: string;
  details?: string;
  includeDiagnostics: boolean;
}

export interface PlayerReportSubmission {
  reportId: string;
  delivery: 'sent' | 'queued';
}

type DiagnosticPrimitive = string | number | boolean | null;
type DiagnosticDetails = Record<string, DiagnosticPrimitive>;

export interface PlayerReportRuntimeContext {
  gameState?: string;
  gameId?: number;
  runMode?: string;
  missionId?: string;
  waveId?: string;
  waveNumber?: number;
  waveTotal?: number;
  score?: number;
  lives?: number;
  selectedShipId?: string;
  loadingPhase?: string;
  bossActive?: boolean;
}

interface PlayerReportBreadcrumb {
  at: string;
  name: string;
  details: DiagnosticDetails;
}

interface QueuedPlayerReport {
  reportId: string;
  kind: PlayerReportKind;
  category: PlayerReportCategory;
  source: 'manual' | 'automatic';
  summary: string;
  details: string;
  sessionId: string;
  gameVersion: string;
  createdAt: string;
  retryAttempts: number;
  nextAttemptAt: number;
  diagnostics?: ReturnType<typeof collectPlayerReportDiagnostics>;
}

type NavigatorConnection = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

const REPORT_ENDPOINT = '/api/player-reports';
const REPORT_QUEUE_KEY = 'scicon_player_report_queue_v1';
const MAX_BREADCRUMBS = 30;
const MAX_QUEUED_REPORTS = 12;
const MAX_AUTOMATIC_REPORTS_PER_SESSION = 5;
const AUTOMATIC_DEDUPE_WINDOW_MS = 60_000;
const SEND_TIMEOUT_MS = 10_000;
const BASE_RETRY_DELAY_MS = 15_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 8;

const runtimeContext: PlayerReportRuntimeContext = {};
const breadcrumbs: PlayerReportBreadcrumb[] = [];
const automaticFingerprints = new Map<string, number>();
let automaticReportCount = 0;
let queuedReports: QueuedPlayerReport[] | null = null;
let flushPromise: Promise<void> | null = null;
let retryTimer: number | null = null;
let monitoringInstalled = false;
let longTaskCount = 0;
let worstLongTaskMs = 0;

const redactSensitiveText = (value: unknown, maxLength: number) => String(value ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
  .replace(/0x[a-f0-9]{64}\b/gi, '[redacted_private_value]')
  .replace(/0x[a-f0-9]{40}\b/gi, '[redacted_wallet]')
  .replace(/\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/gi, '[redacted_token]')
  .replace(/\b(authorization|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
  .trim()
  .slice(0, maxLength);

const finiteNumber = (value: unknown, minimum = -1_000_000_000, maximum = 1_000_000_000) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, numeric)) : null;
};

const safeDetails = (details: Record<string, unknown> = {}): DiagnosticDetails => {
  const output: DiagnosticDetails = {};
  for (const [key, value] of Object.entries(details).slice(0, 12)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof value === 'string') output[key] = redactSensitiveText(value, 180);
    else if (typeof value === 'number') output[key] = finiteNumber(value);
    else if (typeof value === 'boolean') output[key] = value;
    else if (value === null) output[key] = null;
  }
  return output;
};

const readQueue = () => {
  if (queuedReports) return queuedReports;
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(REPORT_QUEUE_KEY) || '[]');
    const now = Date.now();
    queuedReports = Array.isArray(parsed)
      ? parsed.flatMap((entry): QueuedPlayerReport[] => {
          if (
            !entry
            || typeof entry !== 'object'
            || !/^[0-9a-f-]{36}$/i.test(String(entry.reportId || ''))
            || (entry.kind !== 'feedback' && entry.kind !== 'bug')
          ) return [];
          const attempts = Math.floor(Number(entry.retryAttempts) || 0);
          const nextAttempt = Number(entry.nextAttemptAt) || 0;
          return [{
            ...entry,
            retryAttempts: Math.max(0, Math.min(MAX_RETRY_ATTEMPTS, attempts)),
            nextAttemptAt: Math.max(0, Math.min(now + MAX_RETRY_DELAY_MS, nextAttempt))
          } as QueuedPlayerReport];
        }).slice(-MAX_QUEUED_REPORTS)
      : [];
  } catch {
    queuedReports = [];
  }
  return queuedReports;
};

const persistQueue = () => {
  try {
    globalThis.localStorage?.setItem(REPORT_QUEUE_KEY, JSON.stringify(readQueue()));
  } catch {
    // The in-memory queue still retries for the lifetime of this page.
  }
};

const safePathname = () => {
  try {
    return redactSensitiveText(globalThis.location?.pathname || '/', 180) || '/';
  } catch {
    return '/';
  }
};

const collectPlayerReportDiagnostics = () => {
  const connection = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: NavigatorConnection }).connection;
  const navigation = typeof performance === 'undefined'
    ? undefined
    : performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;

  return {
    environment: {
      pathname: safePathname(),
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      visibilityState: typeof document === 'undefined' ? 'unknown' : document.visibilityState,
      language: typeof navigator === 'undefined' ? 'unknown' : redactSensitiveText(navigator.language, 24),
      platform: typeof navigator === 'undefined' ? 'unknown' : redactSensitiveText(navigator.platform, 60),
      viewportWidth: typeof window === 'undefined' ? 0 : Math.round(window.innerWidth),
      viewportHeight: typeof window === 'undefined' ? 0 : Math.round(window.innerHeight),
      screenWidth: typeof screen === 'undefined' ? 0 : Math.round(screen.width),
      screenHeight: typeof screen === 'undefined' ? 0 : Math.round(screen.height),
      connection: {
        effectiveType: redactSensitiveText(connection?.effectiveType || 'unknown', 24),
        downlink: finiteNumber(connection?.downlink, 0, 10_000),
        rtt: finiteNumber(connection?.rtt, 0, 120_000),
        saveData: Boolean(connection?.saveData)
      }
    },
    runtime: { ...runtimeContext },
    performance: {
      navigationMs: navigation ? Math.max(0, Math.round(navigation.duration)) : null,
      domInteractiveMs: navigation ? Math.max(0, Math.round(navigation.domInteractive)) : null,
      longTaskCount,
      worstLongTaskMs: Math.round(worstLongTaskMs)
    },
    breadcrumbs: breadcrumbs.slice(-MAX_BREADCRUMBS)
  };
};

export const updatePlayerReportContext = (patch: PlayerReportRuntimeContext) => {
  const allowedKeys: Array<keyof PlayerReportRuntimeContext> = [
    'gameState',
    'gameId',
    'runMode',
    'missionId',
    'waveId',
    'waveNumber',
    'waveTotal',
    'score',
    'lives',
    'selectedShipId',
    'loadingPhase',
    'bossActive'
  ];
  for (const key of allowedKeys) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      (runtimeContext as Record<string, unknown>)[key] = redactSensitiveText(value, 100);
    } else if (typeof value === 'number') {
      (runtimeContext as Record<string, unknown>)[key] = finiteNumber(value);
    } else if (typeof value === 'boolean') {
      (runtimeContext as Record<string, unknown>)[key] = value;
    }
  }
};

export const recordPlayerReportBreadcrumb = (
  name: string,
  details: Record<string, unknown> = {}
) => {
  const safeName = redactSensitiveText(name, 64).replace(/[^a-z0-9_.-]/gi, '_');
  if (!safeName) return;
  breadcrumbs.push({
    at: new Date().toISOString(),
    name: safeName,
    details: safeDetails(details)
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
  }
};

const enqueueReport = (report: QueuedPlayerReport) => {
  const queue = readQueue();
  if (!queue.some((entry) => entry.reportId === report.reportId)) queue.push(report);
  if (queue.length > MAX_QUEUED_REPORTS) queue.splice(0, queue.length - MAX_QUEUED_REPORTS);
  persistQueue();
};

const parseRetryAfterMs = (response: Response) => {
  const raw = response.headers?.get?.('Retry-After')?.trim();
  if (!raw) return null;
  const seconds = Number(raw);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(raw) - Date.now();
  if (!Number.isFinite(delay)) return null;
  return Math.max(1_000, Math.min(MAX_RETRY_DELAY_MS, Math.round(delay)));
};

const sendQueuedReport = async (report: QueuedPlayerReport) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  const {
    retryAttempts: _retryAttempts,
    nextAttemptAt: _nextAttemptAt,
    ...payload
  } = report;
  void _retryAttempts;
  void _nextAttemptAt;
  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: controller.signal
    });
    return {
      sent: response.ok,
      retryAfterMs: response.ok ? null : parseRetryAfterMs(response)
    };
  } catch {
    return { sent: false, retryAfterMs: null };
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const clearScheduledRetry = () => {
  if (
    retryTimer !== null
    && typeof window !== 'undefined'
    && typeof window.clearTimeout === 'function'
  ) {
    window.clearTimeout(retryTimer);
  }
  retryTimer = null;
};

const scheduleNextQueuedReportFlush = () => {
  clearScheduledRetry();
  if (
    typeof window === 'undefined'
    || typeof window.setTimeout !== 'function'
    || (typeof navigator !== 'undefined' && !navigator.onLine)
  ) return;
  const queue = readQueue();
  if (queue.length === 0) return;
  const nextAttemptAt = Math.min(...queue.map((report) => report.nextAttemptAt));
  const delay = Math.max(0, Math.min(MAX_RETRY_DELAY_MS, nextAttemptAt - Date.now()));
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushQueuedPlayerReports();
  }, delay);
};

const retryDelayFor = (report: QueuedPlayerReport, retryAfterMs: number | null) => {
  if (retryAfterMs !== null) return retryAfterMs;
  const exponent = Math.min(MAX_RETRY_ATTEMPTS - 1, report.retryAttempts);
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** exponent));
};

export const flushQueuedPlayerReports = () => {
  if (flushPromise) return flushPromise;
  clearScheduledRetry();
  flushPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = readQueue();
    const dueReports = queue.filter((report) => report.nextAttemptAt <= Date.now());
    await Promise.all(dueReports.map(async (report) => {
      const outcome = await sendQueuedReport(report);
      const queueIndex = queue.findIndex((entry) => entry.reportId === report.reportId);
      if (queueIndex < 0) return;
      if (outcome.sent) {
        queue.splice(queueIndex, 1);
      } else {
        const retryDelay = retryDelayFor(report, outcome.retryAfterMs);
        report.retryAttempts = Math.min(MAX_RETRY_ATTEMPTS, report.retryAttempts + 1);
        report.nextAttemptAt = Date.now() + retryDelay;
      }
      persistQueue();
    }));
  })().finally(() => {
    flushPromise = null;
    scheduleNextQueuedReportFlush();
  });
  return flushPromise;
};

const makeQueuedReport = (
  input: PlayerReportInput,
  source: 'manual' | 'automatic'
): QueuedPlayerReport => ({
  reportId: crypto.randomUUID(),
  kind: input.kind,
  category: input.category,
  source,
  summary: redactSensitiveText(input.summary, 600),
  details: redactSensitiveText(input.details, 5_000),
  sessionId: getClientSessionId(),
  gameVersion: GAME_VERSION,
  createdAt: new Date().toISOString(),
  retryAttempts: 0,
  nextAttemptAt: 0,
  ...(input.includeDiagnostics ? { diagnostics: collectPlayerReportDiagnostics() } : {})
});

export const submitPlayerReport = async (
  input: PlayerReportInput
): Promise<PlayerReportSubmission> => {
  const report = makeQueuedReport(input, 'manual');
  enqueueReport(report);
  recordPlayerReportBreadcrumb('player_report_submitted', {
    kind: report.kind,
    category: report.category,
    report_id: report.reportId
  });
  const flushAlreadyRunning = Boolean(flushPromise);
  const flush = flushQueuedPlayerReports();
  if (!flushAlreadyRunning) await flush;
  const queued = readQueue().some((entry) => entry.reportId === report.reportId);
  return { reportId: report.reportId, delivery: queued ? 'queued' : 'sent' };
};

const normalizeRuntimeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: redactSensitiveText(error.name || 'Error', 80),
      message: redactSensitiveText(error.message || 'Unknown runtime error', 500),
      stack: redactSensitiveText(error.stack || '', 5_000)
    };
  }
  return {
    name: 'Error',
    message: redactSensitiveText(error, 500) || 'Unknown runtime error',
    stack: ''
  };
};

export const capturePlayerRuntimeError = (
  error: unknown,
  context: Record<string, unknown> = {}
) => {
  const normalized = normalizeRuntimeError(error);
  if (normalized.name === 'AbortError') return null;
  const fingerprint = `${normalized.name}:${normalized.message}:${normalized.stack.slice(0, 240)}`;
  const now = Date.now();
  const lastCapturedAt = automaticFingerprints.get(fingerprint) ?? 0;
  if (
    automaticReportCount >= MAX_AUTOMATIC_REPORTS_PER_SESSION
    || now - lastCapturedAt < AUTOMATIC_DEDUPE_WINDOW_MS
  ) return null;

  automaticFingerprints.set(fingerprint, now);
  automaticReportCount += 1;
  recordPlayerReportBreadcrumb('runtime_error', {
    error_name: normalized.name,
    message: normalized.message,
    ...context
  });
  const report = makeQueuedReport({
    kind: 'bug',
    category: 'crash',
    summary: normalized.message,
    details: [normalized.stack, JSON.stringify(safeDetails(context))].filter(Boolean).join('\n'),
    includeDiagnostics: true
  }, 'automatic');
  enqueueReport(report);
  void flushQueuedPlayerReports();
  return report.reportId;
};

const resourcePathFromEvent = (event: Event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return '';
  const raw = target.getAttribute('src') || target.getAttribute('href') || '';
  try {
    return new URL(raw, window.location.href).pathname;
  } catch {
    return raw.split('?')[0];
  }
};

export const installPlayerReportMonitoring = () => {
  if (monitoringInstalled || typeof window === 'undefined') return () => undefined;
  monitoringInstalled = true;

  const handleError = (event: Event) => {
    if (event instanceof ErrorEvent) {
      capturePlayerRuntimeError(event.error || event.message, {
        source: event.filename ? safePathname() : 'window',
        line: event.lineno,
        column: event.colno
      });
      return;
    }
    const resource = resourcePathFromEvent(event);
    if (resource) recordPlayerReportBreadcrumb('resource_load_failed', { resource });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    capturePlayerRuntimeError(event.reason, { source: 'unhandledrejection' });
  };
  const handleOnline = () => {
    recordPlayerReportBreadcrumb('connection_online');
    void flushQueuedPlayerReports();
  };
  const handleOffline = () => recordPlayerReportBreadcrumb('connection_offline');
  const handleVisibility = () => recordPlayerReportBreadcrumb('visibility_changed', {
    state: document.visibilityState
  });

  window.addEventListener('error', handleError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);
  recordPlayerReportBreadcrumb('diagnostics_started', { online: navigator.onLine });

  let performanceObserver: PerformanceObserver | null = null;
  try {
    performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        worstLongTaskMs = Math.max(worstLongTaskMs, entry.duration);
      }
    });
    performanceObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    performanceObserver = null;
  }
  void flushQueuedPlayerReports();

  return () => {
    window.removeEventListener('error', handleError, true);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    document.removeEventListener('visibilitychange', handleVisibility);
    performanceObserver?.disconnect();
    clearScheduledRetry();
    monitoringInstalled = false;
  };
};
