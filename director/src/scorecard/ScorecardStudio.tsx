import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { sampleRuns } from '../domain/defaults';
import type {
  EncounterPresentation,
  RunSnapshot,
  ScorecardConfig,
  ScorecardMetric,
  ScorecardMetricKey
} from '../domain/types';
import { ScorecardPreview } from './ScorecardPreview';
import './scorecard.css';

export type ScorecardRunMode = 'sample' | 'real';

export interface ScorecardStudioProps {
  config: ScorecardConfig;
  runs?: RunSnapshot[];
  onChange: (next: ScorecardConfig) => void;
  version?: string;
  status?: string;
  isDirty?: boolean;
  isSaving?: boolean;
  validationErrors?: string[];
  onRequestRealRuns?: () => void | Promise<void>;
}

interface InspectorSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

interface IconProps {
  name: 'flask' | 'antenna' | 'eye' | 'eye-off' | 'up' | 'down' | 'plus' | 'trash' | 'refresh';
}

const encounterAssets = [
  { label: 'Gatekeeper sentinel', value: '/game-art/bosses/final-boss-sentinel.png' },
  {
    label: 'Bottleneck Drone',
    value: '/game-art/generated/elite-enemies/bottleneck-drone-v3/frames/bottleneck-drone-01-neutral.png'
  },
  { label: 'Wall segment', value: '/game-art/bosses/wall-segment.png' },
  { label: 'Journal ace', value: '/game-art/enemies/journal-ace.png' },
  { label: 'Asteroid', value: '/game-art/enemies/asteroid-5.png' }
] as const;

const metricNames: Record<ScorecardMetricKey, string> = {
  wave: 'Wave',
  targets: 'Targets',
  coins: 'Coins',
  flight: 'Flight'
};

const makeRunLabel = (run: RunSnapshot): string => {
  const date = run.finishedAt
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(run.finishedAt))
    : 'No timestamp';
  return `${run.pilotName} · ${run.score.toLocaleString()} · ${date}`;
};

const Icon = ({ name }: IconProps) => {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true as const };
  switch (name) {
    case 'flask':
      return (
        <svg {...common}><path d="M9 3h6M10 3v6l-5 8.7A2.2 2.2 0 0 0 6.9 21h10.2a2.2 2.2 0 0 0 1.9-3.3L14 9V3M7.4 16h9.2" /></svg>
      );
    case 'antenna':
      return (
        <svg {...common}><path d="M12 18V9M8.5 21h7M9.2 6.2a4 4 0 0 1 5.6 0M6.4 3.4a8 8 0 0 1 11.2 0" /><circle cx="12" cy="8" r="1.5" /></svg>
      );
    case 'eye':
      return (
        <svg {...common}><path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
      );
    case 'eye-off':
      return (
        <svg {...common}><path d="m3 3 18 18M10.5 7.1A10.6 10.6 0 0 1 12 7c6 0 9.2 5 9.2 5a15 15 0 0 1-2.2 2.7M6.2 6.3C4 7.8 2.8 12 2.8 12s3.2 5 9.2 5c1 0 2-.1 2.8-.4" /></svg>
      );
    case 'up':
      return <svg {...common}><path d="m6 14 6-6 6 6" /></svg>;
    case 'down':
      return <svg {...common}><path d="m6 10 6 6 6-6" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'trash':
      return <svg {...common}><path d="M4 7h16M9 3h6l1 4H8l1-4ZM7 7l1 14h8l1-14M10 11v6M14 11v6" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M20 7V3l-2.1 2.1A8 8 0 1 0 20 12M20 3h-4" /></svg>;
  }
};

const InspectorSection = ({ title, children, defaultOpen = true }: InspectorSectionProps) => (
  <details className="scorecard-inspector__section" open={defaultOpen}>
    <summary>{title}</summary>
    <div className="scorecard-inspector__section-body">{children}</div>
  </details>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="scorecard-field">
    <span>{label}</span>
    {children}
  </label>
);

const ColorField = ({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <Field label={label}>
    <span className="scorecard-color-input">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        aria-label={`${label} color picker`}
      />
      <input
        type="text"
        value={value.toUpperCase()}
        maxLength={7}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`${label} hex color`}
      />
    </span>
  </Field>
);

export function ScorecardStudio({
  config,
  runs = sampleRuns,
  onChange,
  version = 'scorecard-v1',
  status = 'Draft saved locally',
  isDirty = false,
  isSaving = false,
  validationErrors = [],
  onRequestRealRuns
}: ScorecardStudioProps) {
  const studioId = useId();
  const [runMode, setRunMode] = useState<ScorecardRunMode>('sample');
  const [sampleRunId, setSampleRunId] = useState('');
  const [realRunId, setRealRunId] = useState('');
  const [selectedEncounterId, setSelectedEncounterId] = useState(config.encounters[0]?.id ?? '');
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);

  const runsByMode = useMemo(() => {
    const sample = runs.filter((run) => run.source === 'sample');
    const real = runs.filter((run) => run.source !== 'sample');
    return { sample, real };
  }, [runs]);

  const activeRuns = runMode === 'sample' ? runsByMode.sample : runsByMode.real;
  const selectedRunId = runMode === 'sample' ? sampleRunId : realRunId;
  const activeRun =
    activeRuns.find((run) => (run.runId ?? run.pilotName) === selectedRunId) ??
    activeRuns[0] ??
    runsByMode.sample[0] ??
    sampleRuns[0];

  const selectedEncounter =
    config.encounters.find((encounter) => encounter.id === selectedEncounterId) ??
    config.encounters[0];

  const updateCanvas = (patch: Partial<ScorecardConfig['canvas']>) =>
    onChange({ ...config, canvas: { ...config.canvas, ...patch } });
  const updateTheme = (patch: Partial<ScorecardConfig['theme']>) =>
    onChange({ ...config, theme: { ...config.theme, ...patch } });
  const updateTypography = (patch: Partial<ScorecardConfig['typography']>) =>
    onChange({ ...config, typography: { ...config.typography, ...patch } });
  const updateCopy = (patch: Partial<ScorecardConfig['copy']>) =>
    onChange({ ...config, copy: { ...config.copy, ...patch } });
  const updateLayout = (patch: Partial<ScorecardConfig['layout']>) =>
    onChange({ ...config, layout: { ...config.layout, ...patch } });

  const updateMetric = (index: number, patch: Partial<ScorecardMetric>) => {
    const metrics = config.metrics.map((metric, metricIndex) =>
      metricIndex === index ? { ...metric, ...patch } : metric
    );
    onChange({ ...config, metrics });
  };

  const moveMetric = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= config.metrics.length) return;
    const metrics = [...config.metrics];
    [metrics[index], metrics[target]] = [metrics[target], metrics[index]];
    onChange({ ...config, metrics });
  };

  const updateEncounter = (patch: Partial<EncounterPresentation>) => {
    if (!selectedEncounter) return;
    onChange({
      ...config,
      encounters: config.encounters.map((encounter) =>
        encounter.id === selectedEncounter.id ? { ...encounter, ...patch } : encounter
      )
    });
  };

  const addEncounter = () => {
    const nextIndex = config.encounters.length + 1;
    const encounter: EncounterPresentation = {
      id: `encounter-${nextIndex}`,
      minWave: nextIndex,
      maxWave: nextIndex,
      label: `ENCOUNTER ${nextIndex}`,
      assetPath: encounterAssets[0].value
    };
    onChange({ ...config, encounters: [...config.encounters, encounter] });
    setSelectedEncounterId(encounter.id);
  };

  const removeEncounter = () => {
    if (!selectedEncounter || config.encounters.length <= 1) return;
    const encounters = config.encounters.filter((encounter) => encounter.id !== selectedEncounter.id);
    onChange({ ...config, encounters });
    setSelectedEncounterId(encounters[0]?.id ?? '');
  };

  const requestRealRuns = async () => {
    if (!onRequestRealRuns || isLoadingRuns) return;
    setIsLoadingRuns(true);
    try {
      await onRequestRealRuns();
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const handleRunSelection = (event: ChangeEvent<HTMLSelectElement>) => {
    if (runMode === 'sample') setSampleRunId(event.target.value);
    else setRealRunId(event.target.value);
  };

  return (
    <section className="scorecard-studio" aria-labelledby={`${studioId}-title`}>
      <header className="scorecard-studio__heading">
        <h1 id={`${studioId}-title`}>Scorecard Studio</h1>
      </header>

      <div className="scorecard-runbar">
        <div className="scorecard-segmented" aria-label="Run data source">
          <button
            type="button"
            className={runMode === 'sample' ? 'is-active' : ''}
            aria-pressed={runMode === 'sample'}
            onClick={() => setRunMode('sample')}
          >
            <Icon name="flask" />
            Sample run
          </button>
          <button
            type="button"
            className={runMode === 'real' ? 'is-active' : ''}
            aria-pressed={runMode === 'real'}
            onClick={() => setRunMode('real')}
          >
            <Icon name="antenna" />
            Real run
          </button>
        </div>

        <Field label="Run">
          <select
            value={activeRuns.length > 0 ? (activeRun.runId ?? activeRun.pilotName) : ''}
            onChange={handleRunSelection}
            disabled={activeRuns.length === 0}
          >
            {activeRuns.length > 0 ? (
              activeRuns.map((run) => (
                <option key={run.runId ?? `${run.pilotName}-${run.finishedAt}`} value={run.runId ?? run.pilotName}>
                  {makeRunLabel(run)}
                </option>
              ))
            ) : (
              <option value="">No real runs loaded</option>
            )}
          </select>
        </Field>

        {runMode === 'real' ? (
          <button
            type="button"
            className="scorecard-runbar__refresh"
            onClick={requestRealRuns}
            disabled={!onRequestRealRuns || isLoadingRuns}
            aria-label={isLoadingRuns ? 'Loading real runs' : 'Refresh real runs'}
            aria-busy={isLoadingRuns}
          >
            <Icon name="refresh" />
          </button>
        ) : null}

        <div className="scorecard-runbar__status">
          <span>Status</span>
          <strong>READ-ONLY</strong>
        </div>
      </div>

      <div className="scorecard-studio__workspace">
        <main className="scorecard-stage">
          <div className="scorecard-stage__label">
            <span>Live preview</span>
          </div>
          <div className="scorecard-stage__canvas">
            <ScorecardPreview config={config} run={activeRun} />
          </div>

          <footer className="scorecard-stage__footer">
            <div>
              <span>Version</span>
              <strong>{version}</strong>
            </div>
            <div>
              <span>Validation</span>
              <strong className={validationErrors.length > 0 ? 'is-invalid' : 'is-valid'}>
                {validationErrors.length > 0 ? `${validationErrors.length} issue${validationErrors.length === 1 ? '' : 's'}` : 'OK'}
              </strong>
            </div>
            <div className="scorecard-stage__save-state">
              <span>{isSaving ? 'Saving locally…' : status}</span>
              <i className={isDirty ? 'is-dirty' : ''} aria-hidden="true" />
            </div>
          </footer>
          {validationErrors.length > 0 ? (
            <ul className="scorecard-stage__errors" aria-label="Validation issues">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : null}
        </main>

        <aside className="scorecard-inspector" aria-label="Scorecard presentation settings">
          <InspectorSection title="Canvas">
            <Field label="Size">
              <select
                value={config.canvas.size}
                onChange={(event) => updateCanvas({ size: Number(event.target.value) })}
              >
                <option value={800}>800 × 800</option>
                <option value={1024}>1024 × 1024</option>
                <option value={1200}>1200 × 1200</option>
                <option value={1600}>1600 × 1600</option>
              </select>
            </Field>
            <ColorField label="Background" value={config.canvas.background} onChange={(background) => updateCanvas({ background })} />
            <ColorField label="Border glow" value={config.canvas.borderGlow} onChange={(borderGlow) => updateCanvas({ borderGlow })} />
            <Field label={`Vignette ${Math.round(config.canvas.vignette * 100)}%`}>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.01"
                value={config.canvas.vignette}
                onChange={(event) => updateCanvas({ vignette: Number(event.target.value) })}
              />
            </Field>
            <label className="scorecard-check">
              <input type="checkbox" checked={config.layout.showGrid} onChange={(event) => updateLayout({ showGrid: event.target.checked })} />
              <span>Show tactical grid</span>
            </label>
          </InspectorSection>

          <InspectorSection title="Theme">
            <ColorField label="Accent" value={config.theme.primary} onChange={(primary) => updateTheme({ primary })} />
            <ColorField label="Secondary" value={config.theme.secondary} onChange={(secondary) => updateTheme({ secondary })} />
            <ColorField label="Success" value={config.theme.success} onChange={(success) => updateTheme({ success })} />
            <ColorField label="Warning" value={config.theme.warning} onChange={(warning) => updateTheme({ warning })} />
            <ColorField label="Danger" value={config.theme.danger} onChange={(danger) => updateTheme({ danger })} />
            <ColorField label="Text" value={config.theme.text} onChange={(text) => updateTheme({ text })} />
            <ColorField label="Muted" value={config.theme.muted} onChange={(muted) => updateTheme({ muted })} />
          </InspectorSection>

          <InspectorSection title="Typography">
            <Field label="Display font"><select value={config.typography.displayFont} disabled><option>Orbitron</option></select></Field>
            <Field label="UI font"><select value={config.typography.uiFont} disabled><option>Inter</option></select></Field>
            <Field label={`Title scale ${config.typography.titleScale.toFixed(2)}×`}>
              <input type="range" min="0.7" max="1.3" step="0.01" value={config.typography.titleScale} onChange={(event) => updateTypography({ titleScale: Number(event.target.value) })} />
            </Field>
            <Field label={`Number scale ${config.typography.numberScale.toFixed(2)}×`}>
              <input type="range" min="0.7" max="1.3" step="0.01" value={config.typography.numberScale} onChange={(event) => updateTypography({ numberScale: Number(event.target.value) })} />
            </Field>
          </InspectorSection>

          <InspectorSection title="Copy">
            <Field label="Title"><input value={config.copy.title} onChange={(event) => updateCopy({ title: event.target.value })} /></Field>
            <Field label="Subtitle"><input value={config.copy.subtitle} onChange={(event) => updateCopy({ subtitle: event.target.value })} /></Field>
            <Field label="Callsign"><input value={config.copy.callsignLabel} onChange={(event) => updateCopy({ callsignLabel: event.target.value })} /></Field>
            <Field label="Score"><input value={config.copy.scoreLabel} onChange={(event) => updateCopy({ scoreLabel: event.target.value })} /></Field>
            <Field label="Verified"><input value={config.copy.verifiedLabel} onChange={(event) => updateCopy({ verifiedLabel: event.target.value })} /></Field>
            <Field label="Review"><input value={config.copy.reviewLabel} onChange={(event) => updateCopy({ reviewLabel: event.target.value })} /></Field>
          </InspectorSection>

          <InspectorSection title="Metrics">
            <div className="scorecard-metrics-editor">
              {config.metrics.map((metric, index) => (
                <div className="scorecard-metric-row" key={metric.key}>
                  <div className="scorecard-metric-row__order">
                    <button type="button" onClick={() => moveMetric(index, -1)} disabled={index === 0} aria-label={`Move ${metricNames[metric.key]} up`}><Icon name="up" /></button>
                    <button type="button" onClick={() => moveMetric(index, 1)} disabled={index === config.metrics.length - 1} aria-label={`Move ${metricNames[metric.key]} down`}><Icon name="down" /></button>
                  </div>
                  <button
                    type="button"
                    className="scorecard-metric-row__visibility"
                    onClick={() => updateMetric(index, { visible: !metric.visible })}
                    aria-label={`${metric.visible ? 'Hide' : 'Show'} ${metricNames[metric.key]}`}
                    aria-pressed={metric.visible}
                  >
                    <Icon name={metric.visible ? 'eye' : 'eye-off'} />
                  </button>
                  <input value={metric.label} onChange={(event) => updateMetric(index, { label: event.target.value })} aria-label={`${metricNames[metric.key]} label`} />
                  <input type="color" value={metric.accent} onChange={(event) => updateMetric(index, { accent: event.target.value.toUpperCase() })} aria-label={`${metricNames[metric.key]} accent color`} />
                </div>
              ))}
            </div>
          </InspectorSection>

          <InspectorSection title="Encounter art">
            <div className="scorecard-encounter-toolbar">
              <Field label="Encounter">
                <select value={selectedEncounter?.id ?? ''} onChange={(event) => setSelectedEncounterId(event.target.value)}>
                  {config.encounters.map((encounter) => <option key={encounter.id} value={encounter.id}>{encounter.label}</option>)}
                </select>
              </Field>
              <button type="button" onClick={addEncounter} aria-label="Add encounter"><Icon name="plus" /></button>
              <button type="button" onClick={removeEncounter} disabled={config.encounters.length <= 1} aria-label="Remove encounter"><Icon name="trash" /></button>
            </div>
            {selectedEncounter ? (
              <>
                <div className="scorecard-encounter-preview"><img src={selectedEncounter.assetPath} alt="Selected encounter art" /></div>
                <Field label="Label"><input value={selectedEncounter.label} onChange={(event) => updateEncounter({ label: event.target.value })} /></Field>
                <div className="scorecard-field-pair">
                  <Field label="From wave"><input type="number" min="1" max="999" value={selectedEncounter.minWave} onChange={(event) => updateEncounter({ minWave: Number(event.target.value) })} /></Field>
                  <Field label="Through wave"><input type="number" min={selectedEncounter.minWave} max="999" value={selectedEncounter.maxWave ?? ''} placeholder="No limit" onChange={(event) => updateEncounter({ maxWave: event.target.value === '' ? undefined : Number(event.target.value) })} /></Field>
                </div>
                <Field label="Local asset">
                  <select value={selectedEncounter.assetPath} onChange={(event) => updateEncounter({ assetPath: event.target.value })}>
                    {encounterAssets.map((asset) => <option key={asset.value} value={asset.value}>{asset.label}</option>)}
                  </select>
                </Field>
              </>
            ) : null}
            <Field label={`Art scale ${config.layout.artScale.toFixed(2)}×`}>
              <input type="range" min="0.55" max="1.45" step="0.01" value={config.layout.artScale} onChange={(event) => updateLayout({ artScale: Number(event.target.value) })} />
            </Field>
            <Field label={`Panel opacity ${Math.round(config.layout.panelOpacity * 100)}%`}>
              <input type="range" min="0.35" max="1" step="0.01" value={config.layout.panelOpacity} onChange={(event) => updateLayout({ panelOpacity: Number(event.target.value) })} />
            </Field>
          </InspectorSection>
        </aside>
      </div>
    </section>
  );
}

export default ScorecardStudio;
