import React from 'react';
import type { WaveVictorySummary } from '../services/gameLogic';
import './wave-victory.css';

const CHAMPION_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/weekly-champion-reveal/parts';
const RECORD_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/mission-record-verification/parts';

interface WaveVictoryOverlayProps {
  summary: WaveVictorySummary;
  onContinue: () => void;
}

const formatFlightTime = (elapsedSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

const LayerImage: React.FC<{ className: string; src: string }> = ({ className, src }) => (
  <img className={className} src={src} alt="" aria-hidden="true" draggable={false} />
);

const WaveVictoryOverlay: React.FC<WaveVictoryOverlayProps> = ({ summary, onContinue }) => (
  <div className="wave-victory-overlay" role="dialog" aria-modal="true" aria-labelledby="wave-victory-title">
    <div className="wave-victory-backdrop" aria-hidden="true" />
    <div className="wave-victory-stage">
      <section className="wave-record-shell" aria-label={`Stage ${summary.stage} mission record`}>
        <div className="wave-record-art" aria-hidden="true">
          <LayerImage className="wave-record-glow" src={`${RECORD_PARTS}/energy-glow.png`} />
          <LayerImage className="wave-record-body" src={`${RECORD_PARTS}/record-card-body.png`} />
          <LayerImage className="wave-record-clamp wave-record-clamp-top" src={`${RECORD_PARTS}/scanner-clamp-top.png`} />
          <LayerImage className="wave-record-clamp wave-record-clamp-bottom" src={`${RECORD_PARTS}/scanner-clamp-bottom.png`} />
          <LayerImage className="wave-record-ring" src={`${RECORD_PARTS}/pulse-ring.png`} />
          <LayerImage className="wave-record-seal" src={`${RECORD_PARTS}/verified-seal.png`} />
          <LayerImage className="wave-record-lamp" src={`${RECORD_PARTS}/status-lamp.png`} />
          <LayerImage className="wave-record-scan" src={`${RECORD_PARTS}/scan-strip.png`} />
        </div>

        <div className="wave-record-content">
          <div className="wave-record-heading">
            <span>Mission Record</span>
            <strong>Stage {summary.stage}</strong>
          </div>

          <div className="wave-record-sector">
            <span>{summary.stageName}</span>
            <small>{summary.finalWaveName}</small>
          </div>

          <div className="wave-record-score">
            <span>Stage Score</span>
            <strong>{summary.scoreEarned.toLocaleString()}</strong>
          </div>

          <div className="wave-record-stats">
            <div>
              <span>Enemies</span>
              <strong>{summary.enemiesDefeated.toLocaleString()}</strong>
            </div>
            <div>
              <span>Coins</span>
              <strong>{summary.coinsCollected.toLocaleString()}</strong>
            </div>
            <div>
              <span>Flight</span>
              <strong>{formatFlightTime(summary.elapsedSeconds)}</strong>
            </div>
          </div>

          <div className="wave-record-total">
            <span>Total Score</span>
            <strong>{summary.totalScore.toLocaleString()}</strong>
          </div>

          <div className="wave-record-status">
            <span className="wave-record-status-light" aria-hidden="true" />
            Mission data locked
          </div>
        </div>
      </section>

      <header className="wave-victory-plaque">
        <div className="wave-victory-plaque-art" aria-hidden="true">
          <LayerImage className="wave-victory-glow" src={`${CHAMPION_PARTS}/energy-glow.png`} />
          <LayerImage className="wave-victory-wing wave-victory-wing-left" src={`${CHAMPION_PARTS}/wing-left.png`} />
          <LayerImage className="wave-victory-wing wave-victory-wing-right" src={`${CHAMPION_PARTS}/wing-right.png`} />
          <LayerImage className="wave-victory-body" src={`${CHAMPION_PARTS}/plaque-body.png`} />
          <LayerImage className="wave-victory-crown" src={`${CHAMPION_PARTS}/crown-cap.png`} />
          <LayerImage className="wave-victory-flare" src={`${CHAMPION_PARTS}/energy-flare.png`} />
          <LayerImage className="wave-victory-scan" src={`${CHAMPION_PARTS}/scan-bar.png`} />
        </div>
        <div className="wave-victory-copy">
          <h1 id="wave-victory-title">Victory</h1>
          <p>Stage {summary.stage} cleared</p>
        </div>
      </header>

      <button className="wave-victory-continue" type="button" onClick={onContinue}>
        <span>Continue</span>
        <strong>Stage {summary.nextStage}</strong>
      </button>
    </div>
  </div>
);

export default WaveVictoryOverlay;
