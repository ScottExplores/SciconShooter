import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BackgroundPreset,
  BossType,
  FormationPattern,
  PowerupWeight,
  WaveCampaignConfig,
  WaveDefinition,
  WaveSegment,
  WaveSegmentType
} from '../domain/types';
import { LevelPreview } from './LevelPreview';
import { formatTimelineTime, getWaveSchedule, type ScheduledSegment } from './previewSimulator';
import './wave-director.css';

export interface WaveDirectorProps {
  config: WaveCampaignConfig;
  onChange: (nextConfig: WaveCampaignConfig) => void;
  version?: string;
  status?: string;
}

type InspectorIconName = 'clock' | 'difficulty' | 'formation' | 'boss' | 'background' | 'powerup';

const Icon = ({ name }: { name: InspectorIconName | WaveSegmentType }) => {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (name) {
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>;
    case 'difficulty':
      return <svg {...common}><path d="M5 19V11M12 19V5M19 19V8" /></svg>;
    case 'formation':
      return <svg {...common}><circle cx="12" cy="5" r="2" /><circle cx="6" cy="11" r="2" /><circle cx="18" cy="11" r="2" /><circle cx="3" cy="18" r="2" /><circle cx="12" cy="18" r="2" /><circle cx="21" cy="18" r="2" /></svg>;
    case 'boss':
    case 'mini-boss':
      return <svg {...common}><path d="m7 8-3-3M17 8l3-3M5 10l2-2h10l2 2v6l-3 3H8l-3-3v-6Z" /><path d="M9 13h.01M15 13h.01M10 17h4" /></svg>;
    case 'background':
      return <svg {...common}><path d="m3 17 5-7 4 5 3-4 6 7H3Z" /><circle cx="17" cy="6" r="2" /></svg>;
    case 'powerup':
    case 'recovery':
      return <svg {...common}><path d="M12 4v16M4 12h16" /><circle cx="12" cy="12" r="9" /></svg>;
    case 'launch':
      return <svg {...common}><path d="M14 4c3 1 5 3 6 6l-6 6-6-6 6-6Z" /><path d="m8 10-3 2 2 2M14 16l-2 3M10 14l-4 4" /></svg>;
    case 'phase':
      return <svg {...common}><circle cx="12" cy="12" r="5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>;
    case 'asteroid-belt':
      return <svg {...common}><path d="m8 4 5-1 5 4 2 6-4 6-7 1-5-4-1-6 5-6Z" /><path d="m8 9 3-2M14 12l3-2M9 16l3 1" /></svg>;
    case 'inter-wave':
      return <svg {...common}><path d="m4 7 6 5-6 5M20 7l-6 5 6 5" /></svg>;
    default:
      return <svg {...common}><path d="M5 12h14M12 5v14" /></svg>;
  }
};

const segmentTone = (segment: WaveSegment): string => {
  if (segment.type === 'inter-wave' && segment.bossType === 'asteroid-belt') return 'asteroid-belt';
  return segment.type;
};

const TimelineSegment = memo(function TimelineSegment({
  item,
  selected,
  onSelect
}: {
  item: ScheduledSegment;
  selected: boolean;
  onSelect: (segmentId: string) => void;
}) {
  const tone = segmentTone(item.segment);
  return (
    <button
      type="button"
      className={`wd-timeline__segment wd-timeline__segment--${tone} ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(item.segment.id)}
      aria-pressed={selected}
      style={{ '--segment-grow': Math.max(0.72, item.segment.durationSeconds / 16) } as React.CSSProperties}
    >
      <span className="wd-timeline__segment-icon"><Icon name={item.segment.type} /></span>
      <strong>{item.segment.label}</strong>
      <span>{formatTimelineTime(item.startSeconds)}–{formatTimelineTime(item.endSeconds)}</span>
      <small>{Math.round(item.segment.durationSeconds)}s</small>
    </button>
  );
});

const InspectorSection = ({
  title,
  icon,
  children,
  defaultOpen = true
}: {
  title: string;
  icon: InspectorIconName;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => (
  <details className="wd-inspector__section" open={defaultOpen}>
    <summary><Icon name={icon} /><span>{title}</span><svg className="wd-inspector__chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg></summary>
    <div className="wd-inspector__body">{children}</div>
  </details>
);

const NumberField = ({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) => (
  <label className="wd-field">
    <span>{label}</span>
    <span className="wd-field__control">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {suffix ? <small>{suffix}</small> : null}
    </span>
  </label>
);

const SelectField = <T extends string,>({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
}) => (
  <label className="wd-field">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

const RangeField = ({
  label,
  value,
  onChange,
  min,
  max,
  step
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
}) => (
  <label className="wd-range-field">
    <span><span>{label}</span><output>{value.toFixed(step < 0.1 ? 2 : 1)}×</output></span>
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ '--range-progress': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
    />
  </label>
);

const FORMATION_OPTIONS: Array<{ value: FormationPattern; label: string }> = [
  { value: 'row', label: 'Row' },
  { value: 'v', label: 'V-Formation' },
  { value: 'sine', label: 'Sine wave' },
  { value: 'pincer', label: 'Pincer' },
  { value: 'grid', label: 'Formation wall' },
  { value: 'diamond', label: 'Diamond pack' },
  { value: 'spiral', label: 'Spiral entry' }
];

const BOSS_OPTIONS: Array<{ value: BossType; label: string }> = [
  { value: 'mini-boss', label: 'Mini-boss drone' },
  { value: 'asteroid-belt', label: 'Asteroid belt' },
  { value: 'wall', label: 'Wall encounter' },
  { value: 'gatekeeper', label: 'Gatekeeper' }
];

const PowerupRows = ({
  powerups,
  onChange
}: {
  powerups: PowerupWeight[];
  onChange: (powerupId: PowerupWeight['id'], weight: number) => void;
}) => (
  <div className="wd-powerups">
    <div className="wd-powerups__header"><span>Type</span><span>Weight</span></div>
    {powerups.map((powerup) => (
      <label key={powerup.id} className="wd-powerups__row">
        <span>{powerup.label}</span>
        <span className="wd-powerups__weight">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={Math.round(powerup.weight * 100)}
            onChange={(event) => onChange(powerup.id, Number(event.target.value) / 100)}
            aria-label={`${powerup.label} drop weight percent`}
          />
          <small>%</small>
        </span>
      </label>
    ))}
    <div className="wd-powerups__total">
      <span>Distribution</span>
      <strong>{Math.round(powerups.reduce((total, powerup) => total + powerup.weight, 0) * 100)}%</strong>
    </div>
  </div>
);

export function WaveDirector({ config, onChange, version, status }: WaveDirectorProps) {
  const [selectedWaveId, setSelectedWaveId] = useState(config.waves[0]?.id ?? '');
  const selectedWave = config.waves.find((wave) => wave.id === selectedWaveId) ?? config.waves[0];
  const [selectedSegmentId, setSelectedSegmentId] = useState(selectedWave?.segments[0]?.id ?? '');

  useEffect(() => {
    if (!selectedWave) return;
    const exists = [...selectedWave.segments, ...selectedWave.betweenWaves]
      .some((segment) => segment.id === selectedSegmentId);
    if (!exists) setSelectedSegmentId(selectedWave.segments[0]?.id ?? selectedWave.betweenWaves[0]?.id ?? '');
  }, [selectedSegmentId, selectedWave]);

  const schedule = useMemo(() => selectedWave ? getWaveSchedule(selectedWave) : [], [selectedWave]);
  const selectedItem = schedule.find((item) => item.segment.id === selectedSegmentId) ?? schedule[0];
  const selectedSegment = selectedItem?.segment;
  const currentBackground = config.backgrounds.find((item) => item.id === selectedWave?.backgroundId) ?? config.backgrounds[0];

  const selectWave = (wave: WaveDefinition) => {
    setSelectedWaveId(wave.id);
    setSelectedSegmentId(wave.segments[0]?.id ?? wave.betweenWaves[0]?.id ?? '');
  };

  const updateWave = (patch: Partial<WaveDefinition>) => {
    if (!selectedWave) return;
    onChange({
      ...config,
      waves: config.waves.map((wave) => wave.id === selectedWave.id ? { ...wave, ...patch } : wave)
    });
  };

  const updateSegment = (patch: Partial<WaveSegment>) => {
    if (!selectedWave || !selectedSegment) return;
    const updateList = (segments: WaveSegment[]) => segments.map((segment) =>
      segment.id === selectedSegment.id ? { ...segment, ...patch } : segment
    );
    updateWave({
      segments: updateList(selectedWave.segments),
      betweenWaves: updateList(selectedWave.betweenWaves)
    });
  };

  const updateBackground = (patch: Partial<BackgroundPreset>) => {
    if (!currentBackground) return;
    onChange({
      ...config,
      backgrounds: config.backgrounds.map((background) =>
        background.id === currentBackground.id ? { ...background, ...patch } : background
      )
    });
  };

  const updatePowerup = (powerupId: PowerupWeight['id'], weight: number) => {
    const safeWeight = Math.min(1, Math.max(0, Number.isFinite(weight) ? weight : 0));
    onChange({
      ...config,
      powerups: config.powerups.map((powerup) =>
        powerup.id === powerupId ? { ...powerup, weight: safeWeight } : powerup
      )
    });
  };

  const handlePreviewSegment = useCallback((segmentId: string) => setSelectedSegmentId(segmentId), []);

  if (!selectedWave || !selectedSegment || !currentBackground) {
    return <div className="wd-empty" role="status">Wave Director requires at least one wave, segment, and background.</div>;
  }

  const mainSchedule = schedule.filter((item) => !item.betweenWaves);
  const betweenSchedule = schedule.filter((item) => item.betweenWaves);
  const segmentSupportsFormation = selectedSegment.type === 'phase';
  const segmentSupportsBoss = ['mini-boss', 'asteroid-belt', 'boss', 'inter-wave'].includes(selectedSegment.type);
  const isAsteroid = selectedSegment.type === 'asteroid-belt' || selectedSegment.bossType === 'asteroid-belt';
  const bossOptions = selectedSegment.type === 'mini-boss'
    ? BOSS_OPTIONS.filter((option) => option.value === 'mini-boss')
    : selectedSegment.type === 'asteroid-belt'
      ? BOSS_OPTIONS.filter((option) => option.value === 'asteroid-belt')
      : BOSS_OPTIONS;
  const timingStart = selectedItem?.startSeconds ?? 0;

  return (
    <main className="wd" data-version={version} data-status={status}>
      <div className="wd-workspace">
        <section className="wd-editor" aria-label="Wave Director editor">
          <header className="wd-heading">
            <h1>Wave Director</h1>
            <nav className="wd-wave-tabs" aria-label="Wave selection">
              {config.waves.map((wave, index) => (
                <button
                  key={wave.id}
                  type="button"
                  className={wave.id === selectedWave.id ? 'is-active' : ''}
                  onClick={() => selectWave(wave)}
                  aria-current={wave.id === selectedWave.id ? 'page' : undefined}
                >
                  <strong>{index + 1}</strong><span>Wave {index + 1}</span>
                </button>
              ))}
            </nav>
          </header>

          <section className="wd-timeline" aria-label={`${selectedWave.name} timeline`}>
            <div className="wd-timeline__main">
              <div className="wd-timeline__scale" aria-hidden="true">
                <span>0:00</span><span>{formatTimelineTime(mainSchedule.at(-1)?.endSeconds ?? 0)}</span>
              </div>
              <div className="wd-timeline__track">
                {mainSchedule.map((item) => (
                  <TimelineSegment key={item.segment.id} item={item} selected={item.segment.id === selectedSegment.id} onSelect={setSelectedSegmentId} />
                ))}
              </div>
            </div>
            <div className="wd-timeline__between">
              <span className="wd-timeline__between-label">Between waves</span>
              <div className="wd-timeline__track wd-timeline__track--between">
                {betweenSchedule.map((item) => (
                  <TimelineSegment key={item.segment.id} item={item} selected={item.segment.id === selectedSegment.id} onSelect={setSelectedSegmentId} />
                ))}
              </div>
            </div>
          </section>

          <div className="wd-legend" aria-label="Timeline legend">
            <span><i className="is-phase" />Phase</span>
            <span><i className="is-mini" />Mini-boss</span>
            <span><i className="is-asteroid" />Asteroid belt</span>
            <span><i className="is-boss" />Gatekeeper</span>
            <span><i className="is-recovery" />Recovery</span>
            <span><i className="is-inter" />Inter-wave</span>
          </div>

          <LevelPreview
            wave={selectedWave}
            segment={selectedSegment}
            background={currentBackground}
            seed={config.seed}
            onSelectSegment={handlePreviewSegment}
          />
        </section>

        <aside className="wd-inspector" aria-label={`${selectedSegment.label} settings`}>
          <div className="wd-inspector__selection">
            <span>{selectedItem?.betweenWaves ? 'Between waves' : selectedWave.name}</span>
            <strong>{selectedSegment.label}</strong>
          </div>

          <InspectorSection title="Timing" icon="clock">
            <label className="wd-field">
              <span>Start time</span>
              <output>{formatTimelineTime(timingStart)}</output>
            </label>
            <NumberField label="Duration" value={selectedSegment.durationSeconds} onChange={(durationSeconds) => updateSegment({ durationSeconds })} min={1} max={180} step={1} suffix="s" />
            <NumberField label="Warning (before)" value={selectedSegment.warningSeconds ?? 0} onChange={(warningSeconds) => updateSegment({ warningSeconds })} min={0} max={30} step={0.5} suffix="s" />
          </InspectorSection>

          <InspectorSection title="Difficulty" icon="difficulty">
            <RangeField label="Difficulty multiplier" value={selectedWave.difficultyMultiplier} onChange={(difficultyMultiplier) => updateWave({ difficultyMultiplier })} min={0.5} max={3} step={0.05} />
          </InspectorSection>

          <InspectorSection title="Formations" icon="formation" defaultOpen={segmentSupportsFormation}>
            {segmentSupportsFormation ? (
              <>
                <NumberField label="Formation count" value={selectedSegment.formationCount ?? 1} onChange={(formationCount) => updateSegment({ formationCount })} min={1} max={30} />
                <NumberField label="Spawn interval" value={selectedSegment.spawnIntervalSeconds ?? 1} onChange={(spawnIntervalSeconds) => updateSegment({ spawnIntervalSeconds })} min={0.1} max={15} step={0.1} suffix="s" />
                <SelectField label="Pattern" value={selectedSegment.formation ?? 'v'} onChange={(formation) => updateSegment({ formation })} options={FORMATION_OPTIONS} />
              </>
            ) : <p className="wd-inspector__hint">Formation controls apply to normal phases.</p>}
          </InspectorSection>

          <InspectorSection title="Boss encounter" icon="boss" defaultOpen={segmentSupportsBoss}>
            {segmentSupportsBoss ? (
              <>
                <SelectField label={selectedItem?.betweenWaves ? 'Inter-wave encounter' : 'Boss type'} value={selectedSegment.bossType ?? 'mini-boss'} onChange={(bossType) => updateSegment({ bossType, density: bossType === 'asteroid-belt' ? (selectedSegment.density ?? 0.7) : selectedSegment.density })} options={bossOptions} />
                <NumberField label="Warning (before)" value={selectedSegment.warningSeconds ?? 0} onChange={(warningSeconds) => updateSegment({ warningSeconds })} min={0} max={30} step={0.5} suffix="s" />
                {isAsteroid ? (
                  <RangeField label="Belt density" value={selectedSegment.density ?? 0.7} onChange={(density) => updateSegment({ density })} min={0.1} max={1} step={0.05} />
                ) : (
                  <NumberField label="HP multiplier" value={selectedSegment.hpMultiplier ?? 1} onChange={(hpMultiplier) => updateSegment({ hpMultiplier })} min={0.25} max={10} step={0.25} suffix="×" />
                )}
              </>
            ) : <p className="wd-inspector__hint">Select a mini-boss, belt, boss, or inter-wave encounter.</p>}
          </InspectorSection>

          <InspectorSection title="Background" icon="background">
            <SelectField label="Parallax set" value={selectedWave.backgroundId} onChange={(backgroundId) => updateWave({ backgroundId })} options={config.backgrounds.map((background) => ({ value: background.id, label: background.label }))} />
            <label className="wd-field">
              <span>Color grade</span>
              <span className="wd-color-field"><input type="color" value={currentBackground.tint} onChange={(event) => updateBackground({ tint: event.target.value })} /><code>{currentBackground.tint.toUpperCase()}</code></span>
            </label>
            <label className="wd-range-field">
              <span><span>Star density</span><output>{Math.round(currentBackground.starDensity * 100)}%</output></span>
              <input type="range" min={0} max={1} step={0.01} value={currentBackground.starDensity} onChange={(event) => updateBackground({ starDensity: Number(event.target.value) })} style={{ '--range-progress': `${currentBackground.starDensity * 100}%` } as React.CSSProperties} />
            </label>
          </InspectorSection>

          <InspectorSection title="Power-up drops" icon="powerup">
            <PowerupRows powerups={config.powerups} onChange={updatePowerup} />
          </InspectorSection>
        </aside>
      </div>
    </main>
  );
}

export default WaveDirector;
