import React from 'react';

interface Props {
  giftAvailable: boolean;
  achievementCount: number;
  rewardsOpen: boolean;
  onOpenRewards: () => void;
}

/** REVAMP(K): Original edge-tab art and reward routing, anchored to the phone ship stage. */
export default function HomeDailyGift({ giftAvailable, achievementCount, rewardsOpen, onOpenRewards }: Props) {
  return (
    <button
      type="button"
      className={[
        'sci-reward-edge-trigger',
        giftAvailable ? 'sci-reward-edge-trigger--claimable' : 'sci-reward-edge-trigger--collapsed',
        !giftAvailable && achievementCount > 0 ? 'sci-reward-edge-trigger--achievement-ready' : ''
      ].filter(Boolean).join(' ')}
      data-onboarding-target="rewards-open"
      onClick={onOpenRewards}
      aria-label={giftAvailable
        ? 'Claim daily gift'
        : achievementCount > 0
          ? `${achievementCount} achievement ${achievementCount === 1 ? 'reward' : 'rewards'} ready`
          : 'Open reward center'}
      aria-controls="reward-center"
      aria-expanded={rewardsOpen}
    >
      <img src={giftAvailable
        ? '/game-art/generated/ui/scicon-dashboard-icons-v1/selected/weekly-calendar-selected.png'
        : '/game-art/generated/ui/scicon-reward-edge-v1/reward-arrow.png'} alt="" />
      {giftAvailable ? <span>Daily gift</span> : null}
      {!giftAvailable && achievementCount > 0 ? (
        <span className="sci-reward-edge-trigger__count" aria-hidden="true">
          {achievementCount > 9 ? '9+' : achievementCount}
        </span>
      ) : null}
    </button>
  );
}
