import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPlayerReportCache,
  type PlayerReport,
  type PlayerReportCache,
  type PlayerReportDiagnostics
} from '@director/api/controlCenter';
import './player-report-inbox.css';

const EMPTY_CACHE: PlayerReportCache = {
  schemaVersion: 1,
  state: 'unconfigured',
  generatedAt: null,
  reports: [],
  dashboardUrl: null,
  message: null
};
const SUPABASE_REPORTS_URL = 'https://supabase.com/dashboard/project/ktdruljunithwopizorq/editor/18079?schema=public';
const SUPABASE_KEYS_URL = 'https://supabase.com/dashboard/project/ktdruljunithwopizorq/settings/api';

const categoryLabels: Record<string, string> = {
  gameplay: 'Gameplay or waves',
  'loading-performance': 'Loading or performance',
  'wallet-purchase': 'Wallet or purchase',
  'visual-audio': 'Visual or audio',
  other: 'Something else',
  crash: 'Automatic crash'
};

const formatTimestamp = (value: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const humanizeKey = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_.-]+/g, ' ')
  .replace(/^./, (character) => character.toUpperCase());

const diagnosticValue = (value: unknown): string => {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString() : 'Unknown';
  if (typeof value === 'string') return value || 'None';
  if (Array.isArray(value)) return value.slice(0, 8).map(diagnosticValue).join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 10)
      .map(([key, entry]) => `${humanizeKey(key)}: ${diagnosticValue(entry)}`)
      .join(' / ');
  }
  return 'Unknown';
};

export interface PlayerReportFilters {
  query: string;
  kind: 'all' | 'bug' | 'feedback';
  source: 'all' | 'manual' | 'automatic';
  category: string;
}

export const filterPlayerReports = (
  reports: readonly PlayerReport[],
  filters: PlayerReportFilters
) => {
  const query = filters.query.trim().toLowerCase();
  return reports.filter((report) => {
    if (filters.kind !== 'all' && report.kind !== filters.kind) return false;
    if (filters.source !== 'all' && report.source !== filters.source) return false;
    if (filters.category !== 'all' && report.category !== filters.category) return false;
    if (!query) return true;
    return [
      report.reportId,
      report.summary,
      report.details,
      report.category,
      report.gameVersion,
      report.diagnostics?.runtime.missionId,
      report.diagnostics?.runtime.waveId
    ].some((value) => String(value ?? '').toLowerCase().includes(query));
  });
};

const diagnosticLines = (diagnostics?: PlayerReportDiagnostics) => {
  if (!diagnostics) return [];
  return [
    ...Object.entries(diagnostics.runtime).map(([key, value]) => (
      `Runtime ${humanizeKey(key)}: ${diagnosticValue(value)}`
    )),
    ...Object.entries(diagnostics.environment).map(([key, value]) => (
      `Environment ${humanizeKey(key)}: ${diagnosticValue(value)}`
    )),
    ...Object.entries(diagnostics.performance).map(([key, value]) => (
      `Performance ${humanizeKey(key)}: ${diagnosticValue(value)}`
    ))
  ];
};

export const buildCodexReport = (report: PlayerReport) => {
  const lines = [
    'Please investigate this Scicon Shooter player report.',
    '',
    `Report ID: ${report.reportId}`,
    `Type: ${report.kind}`,
    `Category: ${report.category}`,
    `Source: ${report.source}`,
    `Game version: ${report.gameVersion || 'unknown'}`,
    `Reported: ${report.createdAt || report.occurredAt || 'unknown'}`,
    '',
    `Summary: ${report.summary}`,
    report.details ? `Details: ${report.details}` : 'Details: None supplied',
    ...diagnosticLines(report.diagnostics),
    ...(report.diagnostics?.breadcrumbs.length
      ? [
          '',
          'Recent events:',
          ...report.diagnostics.breadcrumbs.map((breadcrumb) => (
            `- ${breadcrumb.at || 'unknown time'} / ${breadcrumb.name}`
              + (Object.keys(breadcrumb.details).length
                ? ` / ${diagnosticValue(breadcrumb.details)}`
                : '')
          ))
        ]
      : [])
  ];
  return lines.join('\n');
};

export const safeSupabaseDashboardUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'supabase.com'
      && url.pathname.startsWith('/dashboard/project/')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const copyText = async (value: string) => {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
  await navigator.clipboard.writeText(value);
};

function DiagnosticTable({
  title,
  values
}: {
  title: string;
  values: Record<string, unknown>;
}) {
  const entries = Object.entries(values);
  if (entries.length === 0) return null;
  return (
    <section className="report-detail__diagnostic" aria-label={title}>
      <h3>{title}</h3>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{humanizeKey(key)}</dt>
            <dd>{diagnosticValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ReportListItem({
  report,
  selected,
  onSelect
}: {
  report: PlayerReport;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="report-list-item"
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
    >
      <span className="report-list-item__row">
        <span data-kind={report.kind}>{report.kind}</span>
        <time dateTime={report.occurredAt || report.createdAt}>
          {formatTimestamp(report.occurredAt || report.createdAt)}
        </time>
      </span>
      <strong>{report.summary}</strong>
      <span className="report-list-item__meta">
        {categoryLabels[report.category] ?? humanizeKey(report.category)}
        {' / '}{report.source}
      </span>
    </button>
  );
}

function ReportDetail({ report }: { report: PlayerReport }) {
  const [copyState, setCopyState] = useState<'idle' | 'id' | 'codex' | 'error'>('idle');

  const copy = async (kind: 'id' | 'codex') => {
    try {
      await copyText(kind === 'id' ? report.reportId : buildCodexReport(report));
      setCopyState(kind);
      window.setTimeout(() => setCopyState('idle'), 1_800);
    } catch {
      setCopyState('error');
    }
  };

  return (
    <article className="report-detail" aria-labelledby="report-detail-title">
      <header>
        <div>
          <div className="report-detail__labels">
            <span data-kind={report.kind}>{report.kind}</span>
            <span>{categoryLabels[report.category] ?? humanizeKey(report.category)}</span>
            {report.source === 'automatic' ? <span data-source="automatic">automatic</span> : null}
          </div>
          <h2 id="report-detail-title">{report.summary}</h2>
        </div>
        <div className="report-detail__actions">
          <button type="button" onClick={() => void copy('id')}>
            {copyState === 'id' ? 'ID copied' : 'Copy report ID'}
          </button>
          <button type="button" onClick={() => void copy('codex')}>
            {copyState === 'codex' ? 'Copied for Codex' : 'Copy for Codex'}
          </button>
        </div>
      </header>

      {copyState === 'error' ? (
        <p className="report-detail__copy-error" role="alert">
          Clipboard access was blocked. Select the report text and copy it manually.
        </p>
      ) : null}

      <section className="report-detail__narrative" aria-labelledby="report-notes-title">
        <h3 id="report-notes-title">Player notes</h3>
        <p>{report.details || 'No additional details were supplied.'}</p>
      </section>

      <dl className="report-detail__metadata">
        <div><dt>Report ID</dt><dd>{report.reportId}</dd></div>
        <div><dt>Reported</dt><dd>{formatTimestamp(report.createdAt || report.occurredAt)}</dd></div>
        <div><dt>Game version</dt><dd>{report.gameVersion || 'Unknown'}</dd></div>
        <div><dt>Session</dt><dd>{report.sessionId || 'Not included'}</dd></div>
      </dl>

      {report.diagnostics ? (
        <div className="report-detail__diagnostics">
          <DiagnosticTable title="Game state" values={report.diagnostics.runtime} />
          <DiagnosticTable title="Device and connection" values={report.diagnostics.environment} />
          <DiagnosticTable title="Performance" values={report.diagnostics.performance} />
        </div>
      ) : (
        <p className="report-detail__no-diagnostics">No technical diagnostics were included.</p>
      )}

      {report.diagnostics?.breadcrumbs.length ? (
        <section className="report-timeline" aria-labelledby="report-timeline-title">
          <h3 id="report-timeline-title">Recent events</h3>
          <ol>
            {report.diagnostics.breadcrumbs.map((breadcrumb, index) => (
              <li key={`${breadcrumb.at}-${breadcrumb.name}-${index}`}>
                <span aria-hidden="true" />
                <div>
                  <strong>{humanizeKey(breadcrumb.name)}</strong>
                  <time dateTime={breadcrumb.at}>{formatTimestamp(breadcrumb.at)}</time>
                  {Object.keys(breadcrumb.details).length ? (
                    <p>{diagnosticValue(breadcrumb.details)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}

export function PlayerReportInbox() {
  const [cache, setCache] = useState<PlayerReportCache>(EMPTY_CACHE);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [filters, setFilters] = useState<PlayerReportFilters>({
    query: '',
    kind: 'all',
    source: 'all',
    category: 'all'
  });

  const loadReports = useCallback(async () => {
    setLoading(true);
    setRequestError(null);
    try {
      const response = await fetchPlayerReportCache();
      setCache(response);
      setSelectedId((current) => (
        response.reports.some((report) => report.reportId === current)
          ? current
          : response.reports[0]?.reportId ?? ''
      ));
    } catch (reason) {
      setRequestError(reason instanceof Error ? reason.message : 'Could not read the local report cache.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredReports = useMemo(
    () => filterPlayerReports(cache.reports, filters),
    [cache.reports, filters]
  );
  const selectedReport = filteredReports.find((report) => report.reportId === selectedId)
    ?? filteredReports[0];
  const categories = useMemo(
    () => [...new Set(cache.reports.map((report) => report.category))].sort(),
    [cache.reports]
  );
  const bugCount = cache.reports.filter((report) => report.kind === 'bug').length;
  const feedbackCount = cache.reports.length - bugCount;
  const automaticCount = cache.reports.filter((report) => report.source === 'automatic').length;
  const dashboardUrl = safeSupabaseDashboardUrl(cache.dashboardUrl) ?? SUPABASE_REPORTS_URL;

  return (
    <section className="report-inbox" aria-labelledby="report-inbox-title">
      <header className="report-inbox__header">
        <div>
          <p>Player report inbox</p>
          <h1 id="report-inbox-title">Review bugs without opening the database.</h1>
          <span>
            Reports are read from a sanitized local cache. This screen cannot edit player data,
            contact a wallet, or write to production.
          </span>
        </div>
        <div className="report-inbox__header-actions">
          <button type="button" onClick={() => void loadReports()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh log'}
          </button>
        </div>
      </header>

      <div className="report-inbox__trust" role="status">
        <span data-state={cache.state}>{cache.state === 'ready' ? 'Cache connected' : 'Needs attention'}</span>
        <strong>Read only</strong>
        <span>Last refreshed {formatTimestamp(cache.generatedAt)}</span>
      </div>

      {requestError ? (
        <div className="report-inbox__alert" role="alert">
          <strong>The local report service is unavailable.</strong>
          <span>{requestError}</span>
        </div>
      ) : null}

      {!requestError && cache.state === 'unconfigured' ? (
        <div className="report-inbox__setup">
          <span aria-hidden="true">RP</span>
          <div>
            <h2>Connect this desktop once to see reports here.</h2>
            <p>
              The game can still collect reports. Add the server-only Supabase credentials to the
              project's root <code>.env.local</code>, then reopen the Control Center. Never paste a
              database key into this page.
            </p>
            <div>
              <a href="/project">Open the Project Guide</a>
              <a href={SUPABASE_KEYS_URL} target="_blank" rel="noreferrer">Open API keys (external)</a>
              <a href={dashboardUrl} target="_blank" rel="noreferrer">Review in Supabase now (external)</a>
            </div>
          </div>
        </div>
      ) : null}

      {!requestError && cache.state === 'error' ? (
        <div className="report-inbox__alert" role="alert">
          <strong>The last cache refresh did not finish.</strong>
          <span>{cache.message || 'The previous sanitized reports are preserved. Try Refresh log again.'}</span>
        </div>
      ) : null}

      {!requestError && cache.state !== 'unconfigured' ? (
        <>
          <section className="report-summary" aria-label="Report summary">
            <div><span>All reports</span><strong>{cache.reports.length}</strong></div>
            <div><span>Bugs</span><strong>{bugCount}</strong></div>
            <div><span>Feedback</span><strong>{feedbackCount}</strong></div>
            <div><span>Automatic crashes</span><strong>{automaticCount}</strong></div>
          </section>

          {loading && cache.reports.length === 0 ? (
            <div className="report-inbox__empty" role="status">Loading the local report cache...</div>
          ) : cache.reports.length === 0 ? (
            <div className="report-inbox__empty">
              <strong>Nothing is waiting in the report log.</strong>
              <span>New bug reports and feedback will appear here after the desktop cache refreshes.</span>
            </div>
          ) : (
            <section className="report-workspace" aria-label="Player reports">
              <div className="report-browser">
                <div className="report-filters">
                  <label className="report-filters__search">
                    <span>Search</span>
                    <input
                      type="search"
                      value={filters.query}
                      placeholder="Summary, ID, Mission, Wave"
                      onChange={(event) => setFilters((current) => ({
                        ...current,
                        query: event.target.value
                      }))}
                    />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={filters.kind}
                      onChange={(event) => setFilters((current) => ({
                        ...current,
                        kind: event.target.value as PlayerReportFilters['kind']
                      }))}
                    >
                      <option value="all">All types</option>
                      <option value="bug">Bugs</option>
                      <option value="feedback">Feedback</option>
                    </select>
                  </label>
                  <label>
                    <span>Source</span>
                    <select
                      value={filters.source}
                      onChange={(event) => setFilters((current) => ({
                        ...current,
                        source: event.target.value as PlayerReportFilters['source']
                      }))}
                    >
                      <option value="all">All sources</option>
                      <option value="manual">Player submitted</option>
                      <option value="automatic">Automatic</option>
                    </select>
                  </label>
                  <label>
                    <span>Category</span>
                    <select
                      value={filters.category}
                      onChange={(event) => setFilters((current) => ({
                        ...current,
                        category: event.target.value
                      }))}
                    >
                      <option value="all">All categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabels[category] ?? humanizeKey(category)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="report-browser__count">
                  <strong>{filteredReports.length}</strong>
                  <span>matching report{filteredReports.length === 1 ? '' : 's'}</span>
                </div>
                <div className="report-list">
                  {filteredReports.map((report) => (
                    <ReportListItem
                      key={report.reportId}
                      report={report}
                      selected={report.reportId === selectedReport?.reportId}
                      onSelect={() => setSelectedId(report.reportId)}
                    />
                  ))}
                  {filteredReports.length === 0 ? (
                    <div className="report-list__empty">No reports match these filters.</div>
                  ) : null}
                </div>
              </div>
              {selectedReport ? <ReportDetail report={selectedReport} /> : null}
            </section>
          )}
        </>
      ) : null}
    </section>
  );
}
