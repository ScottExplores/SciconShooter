const PLAYER_REPORTS_API = '/__director/api/v1/player-reports';
const PROJECT_STATUS_API = '/__director/api/v1/project-status';

type UnknownRecord = Record<string, unknown>;

export type PlayerReportKind = 'bug' | 'feedback';
export type PlayerReportSource = 'manual' | 'automatic';
export type PlayerReportCacheState = 'ready' | 'unconfigured' | 'error';

export interface PlayerReportBreadcrumb {
  at: string;
  name: string;
  details: Record<string, string | number | boolean | null>;
}

export interface PlayerReportDiagnostics {
  environment: Record<string, unknown>;
  runtime: Record<string, unknown>;
  performance: Record<string, unknown>;
  breadcrumbs: PlayerReportBreadcrumb[];
}

export interface PlayerReport {
  eventName: 'player_bug_report' | 'player_feedback';
  reportId: string;
  kind: PlayerReportKind;
  category: string;
  source: PlayerReportSource;
  summary: string;
  details: string;
  sessionId: string;
  gameVersion: string;
  createdAt: string;
  occurredAt: string;
  diagnostics?: PlayerReportDiagnostics;
}

export interface PlayerReportCache {
  schemaVersion: 1;
  state: PlayerReportCacheState;
  generatedAt: string | null;
  reports: PlayerReport[];
  dashboardUrl: string | null;
  message: string | null;
}

export interface ProjectStatus {
  state: 'ready' | 'error' | 'unavailable';
  branch: string | null;
  head: string | null;
  subject: string | null;
  changedFileCount: number;
  untrackedFileCount: number;
  aheadOfMain: number;
  behindMain: number;
  mainContainsHead: boolean | null;
  checkedAt: string | null;
  message: string | null;
}

const isRecord = (value: unknown): value is UnknownRecord => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asString = (value: unknown, fallback = '', maximum = 8_000) => (
  typeof value === 'string' ? value.slice(0, maximum) : fallback
);

const asOptionalString = (value: unknown, maximum = 8_000) => {
  const result = asString(value, '', maximum).trim();
  return result || null;
};

const asCount = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

const primitiveDetails = (value: unknown) => {
  if (!isRecord(value)) return {};
  const details: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (!/^[a-z0-9_.-]{1,64}$/i.test(key)) continue;
    if (typeof entry === 'string') details[key] = entry.slice(0, 500);
    else if (typeof entry === 'number' && Number.isFinite(entry)) details[key] = entry;
    else if (typeof entry === 'boolean' || entry === null) details[key] = entry;
  }
  return details;
};

const diagnosticsRecord = (value: unknown): PlayerReportDiagnostics | undefined => {
  if (!isRecord(value)) return undefined;
  const breadcrumbs = Array.isArray(value.breadcrumbs)
    ? value.breadcrumbs.slice(-30).flatMap((entry): PlayerReportBreadcrumb[] => {
        if (!isRecord(entry)) return [];
        const name = asString(entry.name, '', 64);
        if (!name) return [];
        return [{
          at: asString(entry.at, '', 64),
          name,
          details: primitiveDetails(entry.details)
        }];
      })
    : [];
  return {
    environment: isRecord(value.environment) ? value.environment : {},
    runtime: isRecord(value.runtime) ? value.runtime : {},
    performance: isRecord(value.performance) ? value.performance : {},
    breadcrumbs
  };
};

const normalizeReport = (value: unknown): PlayerReport | null => {
  if (!isRecord(value)) return null;
  const properties = isRecord(value.properties) ? value.properties : value;
  const rawEventName = asString(value.eventName ?? value.event_name, '', 40);
  const rawKind = asString(properties.kind, '', 20);
  const kind: PlayerReportKind = rawKind === 'feedback' || rawEventName === 'player_feedback'
    ? 'feedback'
    : 'bug';
  const eventName = kind === 'feedback' ? 'player_feedback' : 'player_bug_report';
  const reportId = asString(properties.reportId ?? properties.report_id, '', 80);
  const summary = asString(properties.summary, '', 600).trim();
  if (!reportId || !summary) return null;

  const rawSource = asString(properties.source, '', 20);
  const diagnostics = diagnosticsRecord(properties.diagnostics);
  return {
    eventName,
    reportId,
    kind,
    category: asString(properties.category, 'other', 80) || 'other',
    source: rawSource === 'automatic' ? 'automatic' : 'manual',
    summary,
    details: asString(properties.details, '', 5_000),
    sessionId: asString(value.sessionId ?? value.session_id, '', 80),
    gameVersion: asString(value.gameVersion ?? value.game_version, '', 80),
    createdAt: asString(properties.createdAt ?? properties.created_at, '', 64),
    occurredAt: asString(value.occurredAt ?? value.occurred_at, '', 64),
    ...(diagnostics ? { diagnostics } : {})
  };
};

const readJson = async (response: Response): Promise<unknown> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.error === 'string'
      ? payload.error
      : `Director request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
};

export const normalizePlayerReportCache = (payload: unknown): PlayerReportCache => {
  const root = isRecord(payload) ? payload : {};
  const cache = isRecord(root.cache) ? root.cache : root;
  const rawState = asString(cache.state, 'unconfigured', 24);
  const state: PlayerReportCacheState = rawState === 'ready' || rawState === 'error'
    ? rawState
    : 'unconfigured';
  const reports = Array.isArray(cache.reports)
    ? cache.reports.slice(0, 100).flatMap((entry) => {
        const report = normalizeReport(entry);
        return report ? [report] : [];
      })
    : [];
  return {
    schemaVersion: 1,
    state,
    generatedAt: asOptionalString(cache.generatedAt ?? cache.generated_at, 64),
    reports,
    dashboardUrl: asOptionalString(cache.dashboardUrl ?? cache.dashboard_url, 1_000),
    message: asOptionalString(cache.message ?? cache.error, 500)
  };
};

export const fetchPlayerReportCache = async () => normalizePlayerReportCache(
  await readJson(await fetch(PLAYER_REPORTS_API, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  }))
);

export const normalizeProjectStatus = (payload: unknown): ProjectStatus => {
  const root = isRecord(payload) ? payload : {};
  const status = isRecord(root.repository)
    ? root.repository
    : isRecord(root.status)
      ? root.status
      : root;
  const rawState = asString(status.state, 'ready', 24);
  return {
    state: rawState === 'error' || rawState === 'unavailable' ? rawState : 'ready',
    branch: asOptionalString(status.branch, 200),
    head: asOptionalString(status.head ?? status.commit, 80),
    subject: asOptionalString(status.subject ?? status.commitSubject, 500),
    changedFileCount: asCount(status.changedFileCount ?? status.dirtyCount ?? status.changed_files),
    untrackedFileCount: asCount(status.untrackedFileCount ?? status.untrackedCount ?? status.untracked_files),
    aheadOfMain: asCount(status.aheadOfMain ?? status.aheadMain ?? status.ahead_of_main),
    behindMain: asCount(status.behindMain ?? status.behind_main),
    mainContainsHead: typeof status.mainContainsHead === 'boolean'
      ? status.mainContainsHead
      : typeof status.main_contains_head === 'boolean'
        ? status.main_contains_head
        : null,
    checkedAt: asOptionalString(status.checkedAt ?? status.checked_at ?? root.generatedAt, 64),
    message: asOptionalString(status.message ?? status.error, 500)
  };
};

export const fetchProjectStatus = async () => normalizeProjectStatus(
  await readJson(await fetch(PROJECT_STATUS_API, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin'
  }))
);
