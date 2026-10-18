import React from 'react';
import GameCanvas, { type GameCanvasProps } from './GameCanvas';
import UIOverlay, { type UIOverlayProps } from './UIOverlay';
import './game-stage.css';
// REVAMP(J): HUD glass is static; it need not resample the moving game canvas.
import '../services/revamp/performance/hud-compositing.css';
// REVAMP(P): Thumb corners and a single compact row reserve the combat lane for game objects.
import './revamp/combat-hud.css';

export { preloadGameplayAssets } from './GameCanvas';

export interface GameStageProps {
  canvas: GameCanvasProps;
  hud?: false | Omit<UIOverlayProps, 'stats'>;
  resumeCountdown?: number | null;
  className?: string;
}

const GameStage: React.FC<GameStageProps> = ({
  canvas,
  hud = false,
  resumeCountdown = null,
  className = ''
}) => (
  <div className={`scicon-game-stage ${className}`.trim()}>
    <GameCanvas {...canvas} />
    {hud ? <UIOverlay {...hud} stats={canvas.stats} /> : null}
    {resumeCountdown !== null ? (
      <div
        className="scicon-resume-countdown"
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        aria-label={`Mission resumes in ${resumeCountdown}`}
      >
        <span className="scicon-resume-countdown__label" aria-hidden="true">Resuming in</span>
        <strong
          key={resumeCountdown}
          className="scicon-resume-countdown__number arcade-font"
          aria-hidden="true"
        >
          {resumeCountdown}
        </strong>
      </div>
    ) : null}
  </div>
);

export default GameStage;
