import { memo, type CSSProperties, type ReactNode } from 'react';
import type {
  EncounterPresentation,
  RunSnapshot,
  ScorecardConfig,
  ScorecardMetricKey
} from '../domain/types';

export interface ScorecardPreviewProps {
  config: ScorecardConfig;
  run: RunSnapshot;
}

type PreviewStyle = CSSProperties & {
  '--scorecard-background': string;
  '--scorecard-border-glow': string;
  '--scorecard-primary': string;
  '--scorecard-secondary': string;
  '--scorecard-success': string;
  '--scorecard-warning': string;
  '--scorecard-danger': string;
  '--scorecard-text': string;
  '--scorecard-muted': string;
  '--scorecard-vignette': number;
  '--scorecard-panel-opacity': number;
  '--scorecard-title-scale': number;
  '--scorecard-number-scale': number;
  '--scorecard-art-scale': number;
};

const metricIcons: Record<ScorecardMetricKey, ReactNode> = {
  wave: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 17 8-9 8 9M7 20l5-6 5 6M12 4v4" />
    </svg>
  ),
  targets: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  ),
  coins: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.8 7.7 4.4v9.6L12 21.2l-7.7-4.4V7.2L12 2.8Z" />
      <path d="m12 7 1.45 2.95 3.25.47-2.35 2.28.55 3.23L12 14.4l-2.9 1.53.55-3.23-2.35-2.28 3.25-.47L12 7Z" />
    </svg>
  ),
  flight: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 6v6l4 2M8 2.8 5.6 5M16 2.8 18.4 5" />
    </svg>
  )
};

const metricValue = (key: ScorecardMetricKey, run: RunSnapshot): string => {
  switch (key) {
    case 'wave':
      return String(run.wave);
    case 'targets':
      return run.targetsDefeated.toLocaleString();
    case 'coins':
      return run.coinsCollected.toLocaleString();
    case 'flight':
      return run.durationLabel;
  }
};

const findEncounter = (
  encounters: EncounterPresentation[],
  wave: number
): EncounterPresentation | undefined =>
  encounters.find(
    (encounter) =>
      wave >= encounter.minWave &&
      (encounter.maxWave === undefined || wave <= encounter.maxWave)
  ) ?? encounters[encounters.length - 1];

const IntegrityIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m12 2.7 7 2.8v5.7c0 4.5-2.7 8.2-7 10.1-4.3-1.9-7-5.6-7-10.1V5.5l7-2.8Z" />
    <path d="m8.5 12 2.2 2.2 4.9-5" />
  </svg>
);

export const ScorecardPreview = memo(function ScorecardPreview({
  config,
  run
}: ScorecardPreviewProps) {
  const encounter = findEncounter(config.encounters, run.wave);
  const visibleMetrics = config.metrics.filter((metric) => metric.visible);
  const integrityLabel =
    run.integrity === 'server-verified'
      ? config.copy.verifiedLabel
      : run.integrity === 'review'
        ? config.copy.reviewLabel
        : 'LOCAL PREVIEW';

  const style: PreviewStyle = {
    '--scorecard-background': config.canvas.background,
    '--scorecard-border-glow': config.canvas.borderGlow,
    '--scorecard-primary': config.theme.primary,
    '--scorecard-secondary': config.theme.secondary,
    '--scorecard-success': config.theme.success,
    '--scorecard-warning': config.theme.warning,
    '--scorecard-danger': config.theme.danger,
    '--scorecard-text': config.theme.text,
    '--scorecard-muted': config.theme.muted,
    '--scorecard-vignette': config.canvas.vignette,
    '--scorecard-panel-opacity': config.layout.panelOpacity,
    '--scorecard-title-scale': config.typography.titleScale,
    '--scorecard-number-scale': config.typography.numberScale,
    '--scorecard-art-scale': config.layout.artScale,
    aspectRatio: '1 / 1'
  };

  return (
    <article
      className={`scorecard-preview${config.layout.showGrid ? ' scorecard-preview--grid' : ''}`}
      style={style}
      aria-label={`Live scorecard preview for ${run.pilotName}`}
    >
      <div className="scorecard-preview__stars" aria-hidden="true" />
      <div className="scorecard-preview__nebula" aria-hidden="true" />
      <div className="scorecard-preview__vignette" aria-hidden="true" />

      <div className="scorecard-preview__frame" aria-hidden="true">
        <i className="scorecard-preview__corner scorecard-preview__corner--tl" />
        <i className="scorecard-preview__corner scorecard-preview__corner--tr" />
        <i className="scorecard-preview__corner scorecard-preview__corner--bl" />
        <i className="scorecard-preview__corner scorecard-preview__corner--br" />
      </div>

      <header className="scorecard-preview__header">
        <span className="scorecard-preview__rule" aria-hidden="true" />
        <h2>{config.copy.title}</h2>
        <p>{config.copy.subtitle}</p>
        <span className="scorecard-preview__header-mark" aria-hidden="true">
          <span />
        </span>
      </header>

      <div className="scorecard-preview__encounter-art" aria-hidden="true">
        {encounter ? (
          <img src={encounter.assetPath} alt="" draggable={false} />
        ) : null}
      </div>

      <div className="scorecard-preview__ship" aria-hidden="true">
        <img src="/game-art/branding/researchhub-ship.png" alt="" draggable={false} />
      </div>

      <section className="scorecard-preview__identity" aria-label="Run identity">
        <p>{config.copy.callsignLabel}</p>
        <strong>{run.pilotName}</strong>
      </section>

      <section className="scorecard-preview__score" aria-label={`${config.copy.scoreLabel} ${run.score}`}>
        <p>{config.copy.scoreLabel}</p>
        <strong>{run.score.toLocaleString()}</strong>
      </section>

      <section
        className="scorecard-preview__metrics"
        style={{ gridTemplateColumns: `repeat(${Math.max(visibleMetrics.length, 1)}, minmax(0, 1fr))` }}
        aria-label="Run metrics"
      >
        {visibleMetrics.length > 0 ? (
          visibleMetrics.map((metric) => (
            <div
              className="scorecard-preview__metric"
              key={metric.key}
              style={{ '--metric-accent': metric.accent } as CSSProperties}
            >
              <span className="scorecard-preview__metric-label">{metric.label}</span>
              <span className="scorecard-preview__metric-icon">{metricIcons[metric.key]}</span>
              <strong>{metricValue(metric.key, run)}</strong>
            </div>
          ))
        ) : (
          <p className="scorecard-preview__metrics-empty">No metrics visible</p>
        )}
      </section>

      <section className="scorecard-preview__encounter" aria-label="Encounter">
        <div className="scorecard-preview__encounter-window">
          <img
            src="/game-art/backgrounds/parallax-ring-planet.png"
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </div>
        <div className="scorecard-preview__encounter-label">
          <span />
          <strong>{encounter?.label ?? 'UNMAPPED SECTOR'}</strong>
          <span />
        </div>
      </section>

      <footer
        className={`scorecard-preview__integrity scorecard-preview__integrity--${run.integrity}`}
      >
        <IntegrityIcon />
        <span>{integrityLabel}</span>
      </footer>
    </article>
  );
});
