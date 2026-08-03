import React from 'react';
import GameCanvas, { type GameCanvasProps } from './GameCanvas';
import UIOverlay, { type UIOverlayProps } from './UIOverlay';
import './game-stage.css';

export { preloadGameplayAssets } from './GameCanvas';

export interface GameStageProps {
  canvas: GameCanvasProps;
  hud?: false | Omit<UIOverlayProps, 'stats'>;
  className?: string;
}

const GameStage: React.FC<GameStageProps> = ({ canvas, hud = false, className = '' }) => (
  <div className={`scicon-game-stage ${className}`.trim()} data-onboarding-target="flight-stage">
    <GameCanvas {...canvas} />
    {hud ? <UIOverlay {...hud} stats={canvas.stats} /> : null}
  </div>
);

export default GameStage;
