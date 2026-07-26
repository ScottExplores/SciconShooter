import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deletePlaytestSession,
  fetchPlaytestSession,
  fetchPlaytestSessions,
  serializePlaytestSessionCsv,
  type PlaytestSession,
  type PlaytestSessionMetrics,
  type PlaytestSessionSummary
} from '@director/api/playtestSessions';
import './analytics-foundation.css';

type ExportFormat = 'json' | 'csv';

const metricDefinitions: ReadonlyArray<{
  key: keyof Pick<
    PlaytestSessionMetrics,
    | 'dps'
    | 'damageDealt'
    | 'bossDamage'
    | 'damageTaken'
    | 'survivalSeconds'
    | 'playerDeaths'
    | 'bossPhaseTransitions'
    | 'wavesCompleted'
  >;
  label: string;
  unit?: string;
  decimals?: number;
}> = [
  { key: 'dps', label: 'DPS', decimals: 1 },
  { key: 'damageDealt', label: 'Damage dealt', decimals: 0 },
  { key: 'bossDamage', label: 'Boss damage', decimals: 0 },
  { key: 'damageTaken', label: 'Damage taken', decimals: 0 },
  { key: 'survivalSeconds', label: 'Survival', unit: 's', decimals: 1 },
  { key: 'playerDeaths', label: 'Deaths', decimals: 0 },
  { key: 'bossPhaseTransitions', label: 'Boss phases', decimals: 0 },
  { key: 'wavesCompleted', label: 'Waves complete', decimals: 0 }
];

const formatMetric = (value: number, decimals = 0, unit = '') => (
  `${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}${unit}`
);

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const safeFileStem = (session: PlaytestSession) => (
  `${session.name}-${session.id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
);

const downloadText = (name: string, contents: string, type: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

function SessionSelect({
  id,
  label,
  sessions,
  value,
  onChange
}: {
  id: string;
  label: string;
  sessions: readonly PlaytestSessionSummary[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="analytics-select" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">None</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.name} · {formatTimestamp(session.createdAt)}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricComparison({
  candidate,
  baseline
}: {
  candidate: PlaytestSessionSummary;
  baseline?: PlaytestSessionSummary;
}) {
  return (
    <div className="analytics-metrics" aria-label="Playtest metrics">
      {metricDefinitions.map(({ key, label, decimals = 0, unit = '' }) => {
        const value = candidate.metrics[key];
        const difference = baseline ? value - baseline.metrics[key] : null;
        return (
          <article key={key}>
            <span>{label}</span>
            <strong>{formatMetric(value, decimals, unit)}</strong>
            {difference === null ? (
              <small>Current session</small>
            ) : (
              <small className={difference > 0 ? 'is-positive' : difference < 0 ? 'is-negative' : ''}>
                {difference > 0 ? '+' : ''}{formatMetric(difference, decimals, unit)} vs baseline
              </small>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function AnalyticsFoundation() {
  const [sessions, setSessions] = useState<PlaytestSessionSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchPlaytestSessions();
      setSessions(response.sessions);
      setCandidateId((current) => (
        response.sessions.some((session) => session.id === current)
          ? current
          : response.sessions[0]?.id ?? ''
      ));
      setBaselineId((current) => (
        response.sessions.some((session) => session.id === current)
          ? current
          : response.sessions[1]?.id ?? ''
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load local playtest sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const candidate = useMemo(
    () => sessions.find((session) => session.id === candidateId),
    [candidateId, sessions]
  );
  const baseline = useMemo(
    () => sessions.find((session) => session.id === baselineId),
    [baselineId, sessions]
  );

  const exportSession = async (sessionId: string, format: ExportFormat) => {
    setWorkingId(sessionId);
    setError(null);
    try {
      const { session } = await fetchPlaytestSession(sessionId);
      const stem = safeFileStem(session);
      if (format === 'csv') {
        downloadText(`${stem}.csv`, serializePlaytestSessionCsv(session), 'text/csv;charset=utf-8');
      } else {
        downloadText(
          `${stem}.json`,
          `${JSON.stringify(session, null, 2)}\n`,
          'application/json;charset=utf-8'
        );
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not export the local playtest session');
    } finally {
      setWorkingId(null);
    }
  };

  const removeSession = async (session: PlaytestSessionSummary) => {
    if (!window.confirm(`Delete the local playtest session “${session.name}”?`)) return;
    setWorkingId(session.id);
    setError(null);
    try {
      await deletePlaytestSession(session.id);
      await loadSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the local playtest session');
      setWorkingId(null);
    }
  };

  return (
    <section className="analytics-workspace" aria-labelledby="hub-analytics-title">
      <header className="analytics-header">
        <div>
          <p>Local playtest analytics</p>
          <h1 id="hub-analytics-title">Compare what happened, not what felt different.</h1>
          <span>
            Bounded sessions come from the canonical preview simulation. Nothing is sent to
            product analytics, production APIs, wallets, or external services.
          </span>
        </div>
        <div className="analytics-header__actions">
          <a href="/sandbox">Record in Sandbox</a>
          <button type="button" onClick={() => void loadSessions()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? <div className="analytics-alert" role="alert">{error}</div> : null}

      {loading && sessions.length === 0 ? (
        <div className="analytics-empty" role="status">Loading local sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="analytics-empty">
          <strong>No saved playtests yet.</strong>
          <span>Open Sandbox, run a wave or boss with a fixed seed, then save its session.</span>
          <a href="/sandbox">Open Sandbox</a>
        </div>
      ) : (
        <>
          <section className="analytics-comparison" aria-labelledby="analytics-comparison-title">
            <header>
              <div>
                <p>Session comparison</p>
                <h2 id="analytics-comparison-title">Candidate versus baseline</h2>
              </div>
              <div className="analytics-comparison__selectors">
                <SessionSelect
                  id="analytics-candidate"
                  label="Candidate"
                  sessions={sessions}
                  value={candidateId}
                  onChange={setCandidateId}
                />
                <SessionSelect
                  id="analytics-baseline"
                  label="Baseline"
                  sessions={sessions.filter((session) => session.id !== candidateId)}
                  value={baselineId === candidateId ? '' : baselineId}
                  onChange={setBaselineId}
                />
              </div>
            </header>
            {candidate ? (
              <>
                <MetricComparison
                  candidate={candidate}
                  baseline={baseline?.id === candidate.id ? undefined : baseline}
                />
                <footer>
                  <span>
                    {candidate.target.levelId} / {candidate.target.waveId}
                    {' · '}{candidate.viewport.width}×{candidate.viewport.height}
                    {' · seed '}{String(candidate.seed)}
                  </span>
                  <strong>
                    {candidate.metrics.completed
                      ? `Completed ${candidate.metrics.completionScope ?? 'preview'}`
                      : 'Session incomplete'}
                  </strong>
                </footer>
              </>
            ) : null}
          </section>

          <section className="analytics-library" aria-labelledby="analytics-library-title">
            <header>
              <div>
                <p>Ignored local storage</p>
                <h2 id="analytics-library-title">{sessions.length} saved session{sessions.length === 1 ? '' : 's'}</h2>
              </div>
              <span>Maximum 100 sessions · 1,024 retained events each</span>
            </header>
            <div className="analytics-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th>Target</th>
                    <th>Seed</th>
                    <th>DPS</th>
                    <th>Survival</th>
                    <th>Deaths</th>
                    <th>Result</th>
                    <th><span className="analytics-visually-hidden">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.id} data-selected={session.id === candidateId || undefined}>
                      <td>
                        <button
                          className="analytics-session-name"
                          type="button"
                          onClick={() => setCandidateId(session.id)}
                        >
                          <strong>{session.name}</strong>
                          <span>{formatTimestamp(session.createdAt)}</span>
                        </button>
                      </td>
                      <td><code>{session.target.levelId}<br />{session.target.waveId}</code></td>
                      <td><code>{String(session.seed)}</code></td>
                      <td>{formatMetric(session.metrics.dps, 1)}</td>
                      <td>{formatMetric(session.metrics.survivalSeconds, 1, 's')}</td>
                      <td>{session.metrics.playerDeaths}</td>
                      <td>
                        <span className={session.metrics.completed ? 'analytics-result is-complete' : 'analytics-result'}>
                          {session.metrics.completed ? 'Complete' : 'Open'}
                        </span>
                      </td>
                      <td>
                        <div className="analytics-row-actions">
                          <button
                            type="button"
                            disabled={workingId === session.id}
                            onClick={() => void exportSession(session.id, 'json')}
                          >
                            JSON
                          </button>
                          <button
                            type="button"
                            disabled={workingId === session.id}
                            onClick={() => void exportSession(session.id, 'csv')}
                          >
                            CSV
                          </button>
                          <button
                            className="is-danger"
                            type="button"
                            disabled={workingId === session.id}
                            onClick={() => void removeSession(session)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
