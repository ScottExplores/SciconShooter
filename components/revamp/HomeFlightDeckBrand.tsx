import React from 'react';

interface Props {
  compact: boolean;
  giftAvailable: boolean;
  achievementCount: number;
  rewardsOpen: boolean;
  onOpenRewards: () => void;
}

/** The reward entry lives in the header so it never covers a launch control. */
export default function HomeFlightDeckBrand({ compact, giftAvailable, achievementCount, rewardsOpen, onOpenRewards }: Props) {
  return <header className={`revamp-home-brand${compact ? ' revamp-home-brand--compact' : ''}`}>
    <div className="revamp-home-wordmark">
      <p className="revamp-home-eyebrow">Scott Explores presents</p>
      <h1 className="revamp-home-title revamp-ui-logo"><span>SciCon</span> <span>Shooter</span></h1>
      <p className="revamp-home-tagline">The Open Science Frontier</p>
    </div>
    <button type="button" className="revamp-home-gift" data-ready={giftAvailable || achievementCount > 0}
      data-onboarding-target="rewards-open" onClick={onOpenRewards}
      aria-label={giftAvailable ? 'Claim daily gift' : achievementCount ? `${achievementCount} achievement rewards ready` : 'Open reward center'}
      aria-controls="reward-center" aria-expanded={rewardsOpen}>
      <img src="/game-art/generated/ui/scicon-dashboard-icons-v1/selected/weekly-calendar-selected.png" alt="" />
      <span>{giftAvailable ? 'Daily gift' : achievementCount ? 'Rewards' : 'Daily log'}</span>
      {(giftAvailable || achievementCount > 0) && <i aria-hidden="true" />}
    </button>
  </header>;
}
