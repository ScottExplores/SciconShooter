import React, { useMemo } from 'react';
import { formatNumber, HistoryRow } from './api';

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>,
    step: <><path d="m6 5 10 7-10 7Z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></>,
    reset: <><path d="M5 8a8 8 0 1 1-1 8M5 3v5h5" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    grid: <><path d="M3 8h18M3 16h18M8 3v18M16 3v18" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    signal: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.info}</svg>;
}
export function Panel({ title, note, children, className = '', action }: { title: string; note?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><h2>{title}</h2>{note && <span className="panel-note">{note}</span>}{action}</div>{children}</section>;
}
export function Empty({ title, children, compact = false }: { title: string; children?: React.ReactNode; compact?: boolean }) {
  return <div className={`empty ${compact ? 'compact' : ''}`}><Icon name="signal" size={28} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function KeyValue({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return <div className={`key-value ${className}`}><span>{label}</span><strong>{value}</strong></div>;
}
export function Badge({ value, tone }: { value: string; tone?: string }) {
  const actualTone = tone || (/PASS|AVAILABLE|completed|ready/i.test(value) ? 'good' : /FAIL|error/i.test(value) ? 'bad' : /running/i.test(value) ? 'active' : 'pending');
  return <span className={`badge ${actualTone}`}>{value?.replaceAll('_', ' ')}</span>;
}
export function GateList({ gates = {}, dataAvailable = false, detailed = false }: { gates?: Record<string, any>; dataAvailable?: boolean; detailed?: boolean }) {
  const rows = [{ key: 'dataset', label: 'Dataset ingested', status: dataAvailable ? 'PASS' : 'NOT_RUN', reason: dataAvailable ? 'Pinned official sources; retained graph compiled.' : 'The official dataset has not been ingested.' },
    ...Object.entries(gates).filter(([, value]) => value && typeof value === 'object' && value.status).map(([key, value]) => ({ key, label: ({ numerical: 'Numerical reference', vision: 'Visual calibration', decoder: 'Effector mapping', conditioning: 'Conditioning assay', learning: 'Learning evidence' } as any)[key] || key, ...value }))];
  return <div className={`gate-list ${detailed ? 'detailed' : ''}`}>{rows.map(row => <div className="gate-row" key={row.key} title={row.reason}><div className="gate-label"><span className={`gate-indicator ${row.status === 'PASS' ? 'passed' : ''}`}>{row.status === 'PASS' && <Icon name="check" size={11} />}</span><span>{row.label}</span></div><Badge value={row.status} />{detailed && <p>{row.reason || row.detail || 'See the validation record for this gate.'}</p>}</div>)}</div>;
}
export function TraceChart({ values, label, color = '#42c8ee', empty = 'No recorded samples', formatter = formatNumber }: { values: { x: number; y: number }[]; label: string; color?: string; empty?: string; formatter?: (value: number) => string }) {
  const plot = useMemo(() => {
    const clean = values.filter(v => Number.isFinite(v.x) && Number.isFinite(v.y));
    if (!clean.length) return null;
    const minX = clean[0].x, maxX = clean[clean.length - 1].x, minY = Math.min(0, ...clean.map(v => v.y)), maxY = Math.max(1, ...clean.map(v => v.y));
    const points = clean.map(v => `${34 + (v.x - minX) / Math.max(maxX - minX, 1) * 410},${126 - (v.y - minY) / (maxY - minY) * 106}`).join(' ');
    return { points, minX, maxX, minY, maxY, last: clean.at(-1)!.y };
  }, [values]);
  return <div className="trace"><div className="trace-title"><span>{label}</span><strong style={{ color }}>{plot ? formatter(plot.last) : '—'}</strong></div>{!plot ? <Empty compact title={empty} /> : <svg className="trace-svg" viewBox="0 0 460 154" role="img" aria-label={`${label} recorded trace, latest value ${plot.last}`}><g className="chart-grid">{[20, 55, 90, 126].map(y => <line key={y} x1="34" x2="444" y1={y} y2={y} />)}{[34, 136, 239, 341, 444].map(x => <line key={x} x1={x} x2={x} y1="20" y2="126" />)}</g><text x="3" y="25">{formatter(plot.maxY)}</text><text x="3" y="129">{formatter(plot.minY)}</text><text x="34" y="148">{plot.minX.toFixed(1)} s</text><text x="440" y="148" textAnchor="end">{plot.maxX.toFixed(1)} s</text><polyline fill="none" stroke={color} strokeWidth="1.7" vectorEffect="non-scaling-stroke" points={plot.points} /></svg>}</div>;
}
export function RecordedCharts({ history }: { history: HistoryRow[] }) {
  return <div className="recorded-charts"><TraceChart label="GAME SCORE" values={history.map(row => ({ x: row.seconds, y: row.score }))} /><TraceChart label="REINFORCEMENT" color="#dcad62" values={history.map(row => ({ x: row.seconds, y: row.reward }))} /></div>;
}
