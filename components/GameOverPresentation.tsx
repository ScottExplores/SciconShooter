import React from 'react';
import './game-over-presentation.css';

interface GameOverPresentationProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  campaignComplete?: boolean;
}

const DEFEATED_ROOT = '/game-art/generated/ui/animations/defeated-banner/parts';
const RESULT_FRAME = '/game-art/generated/ui/scicon-game-over-panel-v1/scicon-game-over-panel-tall.png';

const GameOverPresentation: React.FC<GameOverPresentationProps> = ({ children, footer, campaignComplete = false }) => (
  <div className={`sci-gameover-overlay${campaignComplete ? ' sci-gameover-overlay--complete' : ''}`}>
    <div className="sci-gameover-backdrop" aria-hidden="true"></div>

    <main className="sci-gameover-stage" aria-label={campaignComplete ? 'Campaign complete' : 'Mission defeated'}>
      <div className="sci-defeated-banner" role="status" aria-live="assertive" aria-label={campaignComplete ? 'Campaign complete' : 'Mission defeated'}>
        <img className="sci-defeated-banner__plaque" src={`${DEFEATED_ROOT}/scicon-defeated-plaque.png`} alt="" />
        <img className="sci-defeated-banner__wing sci-defeated-banner__wing--left" src={`${DEFEATED_ROOT}/scicon-defeated-wing-left.png`} alt="" />
        <img className="sci-defeated-banner__wing sci-defeated-banner__wing--right" src={`${DEFEATED_ROOT}/scicon-defeated-wing-right.png`} alt="" />
        <img className="sci-defeated-banner__rotor sci-defeated-banner__rotor--left" src={`${DEFEATED_ROOT}/scicon-defeated-warning-rotor.png`} alt="" />
        <img className="sci-defeated-banner__rotor sci-defeated-banner__rotor--right" src={`${DEFEATED_ROOT}/scicon-defeated-warning-rotor.png`} alt="" />
        <img className="sci-defeated-banner__scan sci-defeated-banner__scan--top" src={`${DEFEATED_ROOT}/scicon-defeated-light-scan.png`} alt="" />
        <img className="sci-defeated-banner__scan sci-defeated-banner__scan--bottom" src={`${DEFEATED_ROOT}/scicon-defeated-light-scan.png`} alt="" />
        <strong>{campaignComplete ? 'Complete' : 'Defeated'}</strong>
      </div>

      <section className="sci-gameover-window-deploy" aria-label="Mission result">
        <div className="sci-gameover-window-hover">
          <div className="sci-gameover-window">
            <img className="sci-gameover-window__frame" src={RESULT_FRAME} alt="" aria-hidden="true" />
            <div className="sci-gameover-window__rail" aria-hidden="true"></div>
            <div className="sci-gameover-window__content">{children}</div>
          </div>
        </div>
      </section>

      {footer ? <div className="sci-gameover-footer">{footer}</div> : null}
    </main>
  </div>
);

export default GameOverPresentation;
