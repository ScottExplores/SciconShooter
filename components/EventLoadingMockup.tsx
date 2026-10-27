import React from 'react';
import './event-loading-mockup.css';

export type EventLoadingVariant = 'umbra' | 'helios';

const ART = {
  background: '/game-art/generated/ui/scicon-mission-loading-v1/loading-background.png',
  emblem: '/game-art/generated/ui/scicon-mission-loading-v1/loading-emblem.png',
  bar: '/game-art/generated/ui/scicon-mission-loading-v1/loading-bar-frame.png',
  nih: '/game-art/branding/nih-ship.png',
  researchhub: '/game-art/branding/researchhub-ship.png',
  bio: '/game-art/branding/bio-ship.png',
  eth: '/game-art/branding/eth-ship.png',
  btc: '/game-art/generated/scicon-flight-motion-pack-v1/ships/btc-token-ship/frames/btc-token-ship-03-neutral.png',
  umbra: '/game-art/generated/bosses/campaign-packages/umbra-needlewing/assembled.png',
  helios: '/game-art/generated/bosses/campaign-packages/helios-clawcarrier/assembled.png'
} as const;

const SHIPS = [
  { key: 'nih', src: ART.nih, label: 'NIH ship' },
  { key: 'researchhub', src: ART.researchhub, label: 'ResearchHub ship' },
  { key: 'bio', src: ART.bio, label: 'BIO ship' },
  { key: 'eth', src: ART.eth, label: 'ETH ship' },
  { key: 'btc', src: ART.btc, label: 'BTC ship' }
] as const;

export interface EventLoadingMockupProps {
  variant: EventLoadingVariant;
}

/**
 * Temporary 25K High Score loading splash. It mounts only when
 * `?event-loader=umbra` or `?event-loader=helios` is present.
 */
const EventLoadingMockup: React.FC<EventLoadingMockupProps> = ({ variant }) => {
  const bossSrc = variant === 'helios' ? ART.helios : ART.umbra;
  const bossLabel = variant === 'helios' ? 'Helios Clawcarrier' : 'Umbra Needlewing';

  return (
    <section
      className={`sci-event-loader sci-event-loader--${variant}`}
      data-event-loader={variant}
      aria-label="25K High Score"
    >
      <img className="sci-event-loader__backdrop" src={ART.background} alt="" />
      <div className="sci-event-loader__veil" aria-hidden="true" />
      <div className="sci-event-loader__scanlines" aria-hidden="true" />

      <header className="sci-event-loader__brand">
        <img className="sci-event-loader__emblem" src={ART.emblem} alt="" />
        <p className="sci-event-loader__wordmark">Scicon Shooter</p>
      </header>

      <div className="sci-event-loader__stage" aria-hidden="true">
        <img className="sci-event-loader__boss" src={bossSrc} alt={bossLabel} />
        {SHIPS.map((ship) => (
          <img
            key={ship.key}
            className={`sci-event-loader__ship sci-event-loader__ship--${ship.key}`}
            src={ship.src}
            alt=""
          />
        ))}
      </div>

      <div className="sci-event-loader__lockup">
        <h1>25,000 <span>RSC</span></h1>
        <p className="sci-event-loader__event">25K High Score</p>
        <p className="sci-event-loader__ends">Ends Nov 29</p>
        <p className="sci-event-loader__campaign">Play Campaign first to upgrade your ship.</p>
        <div className="sci-event-loader__progress" aria-hidden="true">
          <div className="sci-event-loader__progress-track">
            <div className="sci-event-loader__progress-fill" />
            <div className="sci-event-loader__progress-sheen" />
          </div>
          <img src={ART.bar} alt="" />
        </div>
      </div>
    </section>
  );
};

export default EventLoadingMockup;
