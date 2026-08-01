import React from 'react';
import { ASSETS } from '../constants';

interface TutorialProps {
  onReady: () => void;
}

interface TutorialCardProps {
  icon: string;
  title: string;
  body: string;
}

const TutorialCard: React.FC<TutorialCardProps> = ({ icon, title, body }) => (
  <li className="sci-tutorial__card">
    <span className="sci-tutorial__icon" aria-hidden="true">
      <img src={icon} alt="" draggable={false} />
    </span>
    <span className="sci-tutorial__copy">
      <b>{title}</b>
      <small>{body}</small>
    </span>
  </li>
);

/**
 * First-run briefing.
 *
 * This panel previously described a build that no longer exists -- founder
 * pickups, "your submission" -- and was never rendered by anything, so no
 * player ever saw it. It now covers what the game actually asks a new pilot to
 * understand: the two modes, that firing is automatic, and where coins go.
 */
const Tutorial: React.FC<TutorialProps> = ({ onReady }) => (
  <div
    className="sci-tutorial"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sci-tutorial-title"
  >
    <section className="sci-tutorial__panel">
      <h2 id="sci-tutorial-title" className="sci-tutorial__title">How To Play</h2>

      <ul className="sci-tutorial__grid">
        <TutorialCard
          icon={ASSETS.PLAYER_SHIP}
          title="Fly"
          body="Drag anywhere, or use WASD and the arrow keys. Your guns fire on their own."
        />
        <TutorialCard
          icon="/game-art/powerups/rapid-fire.png"
          title="Power Up"
          body="Grab drops mid-run for rapid fire, spread shots and shields."
        />
        <TutorialCard
          icon={ASSETS.RSC_TOKEN}
          title="Bank Coins"
          body="Coins come from Campaign Missions and buy permanent Hangar upgrades."
        />
        <TutorialCard
          icon="/game-art/powerups/extra-life.png"
          title="Two Modes"
          body="Campaign is progression. Weekly Run is one 10-life gauntlet through every boss, scored on the weekly board."
        />
      </ul>

      <button type="button" className="sci-tutorial__start" onClick={onReady} autoFocus>
        Start Flying
      </button>
    </section>
  </div>
);

export default Tutorial;
