import React from 'react';
import './mission-loading-screen.css';

export type MissionLoadingPhase =
  | 'flight-systems'
  | 'mission-interface'
  | 'mission-art'
  | 'runtime-sync'
  | 'ready'
  | 'error';

export interface MissionLoadingScreenProps {
  progress: number;
  phase: MissionLoadingPhase;
  tip: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

const LOADING_BACKGROUND = '/game-art/generated/ui/scicon-mission-loading-v1/loading-background.png';
const LOADING_EMBLEM = '/game-art/generated/ui/scicon-mission-loading-v1/loading-emblem.png';
const LOADING_BAR_FRAME = '/game-art/generated/ui/scicon-mission-loading-v1/loading-bar-frame.png';

const PHASE_LABELS: Record<MissionLoadingPhase, string> = {
  'flight-systems': 'Loading flight systems',
  'mission-interface': 'Calibrating mission interface',
  'mission-art': 'Decoding mission visuals',
  'runtime-sync': 'Synchronizing flight renderer',
  ready: 'Mission ready',
  error: 'Mission link interrupted'
};

const MissionLoadingScreen: React.FC<MissionLoadingScreenProps> = ({
  progress,
  phase,
  tip,
  onRetry,
  onCancel
}) => {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const hasError = phase === 'error';

  return (
    <section
      className="sci-mission-loader"
      aria-label="Preparing mission"
      aria-live="polite"
      aria-busy={!hasError && safeProgress < 100}
    >
      <img className="sci-mission-loader__backdrop" src={LOADING_BACKGROUND} alt="" aria-hidden="true" />
      <div className="sci-mission-loader__nebula" aria-hidden="true" />
      <div className="sci-mission-loader__scanlines" aria-hidden="true" />

      <div className="sci-mission-loader__content">
        <header className="sci-mission-loader__brand">
          <img className="sci-mission-loader__emblem" src={LOADING_EMBLEM} alt="" aria-hidden="true" />
          <p className="sci-mission-loader__eyebrow">Research Command Network</p>
          <h1>SCICON<br />SHOOTER</h1>
          <p className="sci-mission-loader__tagline">Fund research. Clear the bottleneck.</p>
        </header>

        <aside className="sci-mission-loader__tip">
          <span>Mission tip</span>
          <p>{tip}</p>
        </aside>

        <div className="sci-mission-loader__status">
          <div className="sci-mission-loader__status-line">
            <span>{PHASE_LABELS[phase]}</span>
            <strong>{hasError ? '—' : `${safeProgress}%`}</strong>
          </div>

          <div
            className={`sci-mission-loader__progress${hasError ? ' sci-mission-loader__progress--error' : ''}`}
            role="progressbar"
            aria-label={PHASE_LABELS[phase]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={safeProgress}
          >
            <div className="sci-mission-loader__progress-track">
              <div className="sci-mission-loader__progress-fill" style={{ width: `${safeProgress}%` }} />
              <div className="sci-mission-loader__progress-sheen" style={{ left: `${Math.max(0, safeProgress - 8)}%` }} />
            </div>
            <img src={LOADING_BAR_FRAME} alt="" aria-hidden="true" />
          </div>

          {hasError ? (
            <div className="sci-mission-loader__actions">
              {onRetry ? <button type="button" onClick={onRetry}>Retry link</button> : null}
              {onCancel ? <button type="button" onClick={onCancel}>Return to command</button> : null}
            </div>
          ) : (
            <div className="sci-mission-loader__footer">
              <p className="sci-mission-loader__hint">Only mission-ready systems are being staged.</p>
              {onCancel ? (
                <button className="sci-mission-loader__cancel" type="button" onClick={onCancel}>
                  Cancel launch
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default MissionLoadingScreen;
