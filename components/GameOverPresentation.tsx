import React from 'react';
import './game-over-presentation.css';

interface GameOverPresentationProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const DEFEATED_ROOT = '/game-art/generated/ui/animations/defeated-banner/parts';
const FLOATING_WINDOW_ROOT = '/game-art/generated/ui/scicon-interface-pack-v1/animations/floating-window/parts';
const RESULT_FRAME = '/game-art/generated/ui/scicon-ui-system-v2/base/mission-results/game-over-result-frame.png';

const GameOverPresentation: React.FC<GameOverPresentationProps> = ({ children, footer }) => (
  <div className="sci-gameover-overlay">
    <div className="sci-gameover-backdrop" aria-hidden="true"></div>

    <main className="sci-gameover-stage" aria-label="Mission defeated">
      <div className="sci-defeated-banner" role="status" aria-live="assertive" aria-label="Mission defeated">
        <img className="sci-defeated-banner__plaque" src={`${DEFEATED_ROOT}/scicon-defeated-plaque.png`} alt="" />
        <img className="sci-defeated-banner__wing sci-defeated-banner__wing--left" src={`${DEFEATED_ROOT}/scicon-defeated-wing-left.png`} alt="" />
        <img className="sci-defeated-banner__wing sci-defeated-banner__wing--right" src={`${DEFEATED_ROOT}/scicon-defeated-wing-right.png`} alt="" />
        <img className="sci-defeated-banner__rotor sci-defeated-banner__rotor--left" src={`${DEFEATED_ROOT}/scicon-defeated-warning-rotor.png`} alt="" />
        <img className="sci-defeated-banner__rotor sci-defeated-banner__rotor--right" src={`${DEFEATED_ROOT}/scicon-defeated-warning-rotor.png`} alt="" />
        <img className="sci-defeated-banner__scan sci-defeated-banner__scan--top" src={`${DEFEATED_ROOT}/scicon-defeated-light-scan.png`} alt="" />
        <img className="sci-defeated-banner__scan sci-defeated-banner__scan--bottom" src={`${DEFEATED_ROOT}/scicon-defeated-light-scan.png`} alt="" />
        <strong>Defeated</strong>
      </div>

      <section className="sci-gameover-window-deploy" aria-label="Mission result">
        <div className="sci-gameover-window-hover">
          <div className="sci-gameover-window__art" aria-hidden="true">
            <img className="sci-gameover-window__glow" src={`${FLOATING_WINDOW_ROOT}/energy-glow.png`} alt="" />
            <img className="sci-gameover-window__thruster sci-gameover-window__thruster--left" src={`${FLOATING_WINDOW_ROOT}/thruster-left.png`} alt="" />
            <img className="sci-gameover-window__thruster sci-gameover-window__thruster--right" src={`${FLOATING_WINDOW_ROOT}/thruster-right.png`} alt="" />
            <span className="sci-gameover-window__flame sci-gameover-window__flame--left"></span>
            <span className="sci-gameover-window__flame sci-gameover-window__flame--right"></span>
          </div>

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
