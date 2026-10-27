import React from 'react';
import './mission-loading-screen.css';
import './event-loading-screen.css';
import {
  EVENT_LOADING_BACKGROUND,
  EVENT_LOADING_BAR_FRAME,
  EVENT_LOADING_BOSS,
  EVENT_LOADING_EMBLEM,
  EVENT_LOADING_SHIPS
} from '../services/eventLoadingArt';

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
  context?: 'startup' | 'mission';
  presentation?: 'standard' | 'event';
  onRetry?: () => void;
  onCancel?: () => void;
}

const LOADING_BACKGROUND = EVENT_LOADING_BACKGROUND;
const LOADING_EMBLEM = EVENT_LOADING_EMBLEM;
const LOADING_BAR_FRAME = EVENT_LOADING_BAR_FRAME;
const EVENT_BOSS = EVENT_LOADING_BOSS;
const EVENT_SHIPS = EVENT_LOADING_SHIPS;

const PHASE_LABELS: Record<MissionLoadingPhase, string> = {
  'flight-systems': 'Loading flight systems',
  'mission-interface': 'Calibrating mission interface',
  'mission-art': 'Decoding mission visuals',
  'runtime-sync': 'Synchronizing flight renderer',
  ready: 'Mission ready',
  error: 'Mission link interrupted'
};

const STARTUP_PHASE_LABELS: Record<MissionLoadingPhase, string> = {
  'flight-systems': 'Loading command deck',
  'mission-interface': 'Calibrating interface',
  'mission-art': 'Decoding ship and menu art',
  'runtime-sync': 'Restoring pilot profile',
  ready: 'Command deck ready',
  error: 'Startup link interrupted'
};

const MissionLoadingScreen: React.FC<MissionLoadingScreenProps> = ({
  progress,
  phase,
  tip,
  context = 'mission',
  presentation = 'standard',
  onRetry,
  onCancel
}) => {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const hasError = phase === 'error';
  const isStartup = context === 'startup';
  const phaseLabel = (isStartup ? STARTUP_PHASE_LABELS : PHASE_LABELS)[phase];

  if (presentation === 'event' && !hasError) {
    return (
      <section
        className="sci-event-loader"
        data-event-loading="umbra"
        aria-label={isStartup ? 'Loading Scicon Shooter' : 'Preparing mission'}
        aria-live="polite"
        aria-busy={safeProgress < 100}
      >
        <img className="sci-event-loader__backdrop" src={LOADING_BACKGROUND} alt="" aria-hidden="true" fetchPriority="high" />
        <div className="sci-event-loader__veil" aria-hidden="true" />
        <div className="sci-event-loader__scanlines" aria-hidden="true" />
        <div className="sci-event-loader__frame">
          <header className="sci-event-loader__brand">
            <img className="sci-event-loader__emblem" src={LOADING_EMBLEM} alt="" aria-hidden="true" fetchPriority="high" />
            <p className="sci-event-loader__wordmark">Scicon Shooter</p>
          </header>
          <div className="sci-event-loader__stage" aria-hidden="true">
            <img className="sci-event-loader__boss" src={EVENT_BOSS} alt="" fetchPriority="high" />
            {EVENT_SHIPS.map((ship) => (
              <img
                key={ship.key}
                className={`sci-event-loader__ship sci-event-loader__ship--${ship.key}`}
                src={ship.src}
                alt=""
                fetchPriority="high"
              />
            ))}
          </div>
          <div className="sci-event-loader__lockup">
            <h1>25,000 <span>RSC</span></h1>
            <p className="sci-event-loader__event">25K High Score</p>
            <p className="sci-event-loader__ends">Ends Nov 29</p>
            <p className="sci-event-loader__campaign">Play Campaign first to upgrade your ship.</p>
            <p className="sci-event-loader__percent" data-event-loading-progress={safeProgress}>{safeProgress}%</p>
            <div
              className="sci-event-loader__progress"
              role="progressbar"
              aria-label={phaseLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={safeProgress}
            >
              <div className="sci-event-loader__progress-track">
                <div className="sci-event-loader__progress-fill" style={{ width: `${safeProgress}%` }} />
                <div className="sci-event-loader__progress-sheen" style={{ left: `${Math.max(0, safeProgress - 8)}%` }} />
              </div>
              <img src={LOADING_BAR_FRAME} alt="" aria-hidden="true" fetchPriority="high" />
            </div>
            {onCancel ? (
              <button className="sci-event-loader__cancel" type="button" onClick={onCancel}>
                Cancel launch
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="sci-mission-loader"
      aria-label={isStartup ? 'Loading Scicon Shooter' : 'Preparing mission'}
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
          <span>{isStartup ? 'Pilot tip' : 'Mission tip'}</span>
          <p>{tip}</p>
        </aside>

        <div className="sci-mission-loader__status">
          <div className="sci-mission-loader__status-line">
            <span>{phaseLabel}</span>
            <strong>{hasError ? '—' : `${safeProgress}%`}</strong>
          </div>

          <div
            className={`sci-mission-loader__progress${hasError ? ' sci-mission-loader__progress--error' : ''}`}
            role="progressbar"
            aria-label={phaseLabel}
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
              <p className="sci-mission-loader__hint">
                {isStartup
                  ? 'Loading only the systems needed for play. Later missions reuse this cache.'
                  : 'Only mission-ready systems are being staged.'}
              </p>
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
