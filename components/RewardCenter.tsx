import React, { useEffect, useMemo, useState } from 'react';
import { ASSETS } from '../constants';
import { PLAYER_SHIPS } from '../services/playerShipService';
import {
  ACHIEVEMENT_DEFINITIONS,
  DAILY_GIFT_REWARDS,
  formatAchievementDescription,
  getAchievementStatus,
  getDailyGiftStatus,
  type AchievementId
} from '../services/rewardProgression';
import type { PermanentSquadState } from '../services/squadProgression';

const CALENDAR_ICON = '/game-art/generated/ui/scicon-dashboard-icons-v1/selected/weekly-calendar-selected.png';
const ACHIEVEMENT_ICON = '/game-art/generated/ui/scicon-ui-system-v2/base/achievements-more/achievement-unlocked-card.png';

interface RewardCenterProps {
  open: boolean;
  onClose: () => void;
  walletConnected: boolean;
  permanentState: PermanentSquadState;
  onClaimDailyGift: () => void;
  onClaimAchievement: (id: AchievementId) => void;
  onRequestConnect: () => void;
}

type RewardTab = 'daily' | 'achievements';

const clampProgress = (progress: number, target: number) => (
  target > 0 ? Math.max(0, Math.min(100, (progress / target) * 100)) : 0
);

const RewardCenter: React.FC<RewardCenterProps> = ({
  open,
  onClose,
  walletConnected,
  permanentState,
  onClaimDailyGift,
  onClaimAchievement,
  onRequestConnect
}) => {
  const [tab, setTab] = useState<RewardTab>('daily');
  const dailyStatus = useMemo(
    () => getDailyGiftStatus(permanentState),
    [permanentState]
  );
  const completedThrough = (
    dailyStatus.streakReset
    || (dailyStatus.isAvailable && dailyStatus.claimableDay === 1 && permanentState.dailyGifts.currentDay === 30)
  ) ? 0 : permanentState.dailyGifts.currentDay;

  useEffect(() => {
    if (open) setTab('daily');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="sci-reward-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="sci-reward-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-center-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sci-reward-header">
          <div className="sci-reward-title-lockup">
            <img src={CALENDAR_ICON} alt="" />
            <div>
              <span>Research Command</span>
              <h2 id="reward-center-title">Reward Center</h2>
            </div>
          </div>
          <button type="button" className="sci-reward-close" onClick={onClose} aria-label="Close reward center">
            &times;
          </button>
        </header>

        <div className="sci-reward-tabs" role="tablist" aria-label="Reward center views">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'daily'}
            className={tab === 'daily' ? 'is-active' : ''}
            onClick={() => setTab('daily')}
          >
            Daily Gifts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'achievements'}
            className={tab === 'achievements' ? 'is-active' : ''}
            onClick={() => setTab('achievements')}
          >
            Achievements
          </button>
        </div>

        {!walletConnected && (
          <div className="sci-reward-connect-notice">
            <div>
              <strong>Connect to save rewards</strong>
              <span>Daily streaks and achievements belong to your Base profile.</span>
            </div>
            <button type="button" onClick={onRequestConnect}>Connect</button>
          </div>
        )}

        <div className="sci-reward-scroll">
          {tab === 'daily' ? (
            <div className="sci-daily-view">
              <div className="sci-reward-summary">
                <div>
                  <span>30-day flight log</span>
                  <strong>Day {dailyStatus.claimableDay}</strong>
                </div>
                <p>
                  {dailyStatus.claimedToday
                    ? 'Today\'s gift is secured. Return tomorrow to continue.'
                    : dailyStatus.streakReset
                      ? 'A new streak is ready. Claim Day 1 to launch it.'
                      : 'Claim today to keep your streak moving.'}
                </p>
              </div>

              <div className="sci-daily-grid">
                {DAILY_GIFT_REWARDS.map((reward) => {
                  const isClaimed = reward.day <= completedThrough;
                  const isToday = reward.day === dailyStatus.claimableDay;
                  const ship = reward.shipId ? PLAYER_SHIPS[reward.shipId] : null;
                  return (
                    <article
                      key={reward.day}
                      className={[
                        'sci-daily-card',
                        isClaimed ? 'is-claimed' : '',
                        isToday ? 'is-today' : '',
                        ship ? 'has-ship' : ''
                      ].filter(Boolean).join(' ')}
                    >
                      <span className="sci-daily-day">Day {reward.day}</span>
                      <div className="sci-daily-art">
                        <img src={ship?.assetUrl || ASSETS.RSC_TOKEN} alt="" />
                      </div>
                      <strong>{ship ? `Unlock ${ship.name}` : `${reward.coins} coins`}</strong>
                      {ship && <small>+ {reward.coins} coins</small>}
                      {isClaimed && <span className="sci-daily-check" aria-label="Claimed">&#10003;</span>}
                    </article>
                  );
                })}
              </div>

              <button
                type="button"
                className="sci-reward-primary"
                disabled={!walletConnected || !dailyStatus.isAvailable}
                onClick={onClaimDailyGift}
              >
                {!walletConnected
                  ? 'Connect to claim'
                  : dailyStatus.claimedToday
                    ? 'Claimed today'
                    : `Claim Day ${dailyStatus.claimableDay}`}
              </button>
            </div>
          ) : (
            <div className="sci-achievement-list">
              {ACHIEVEMENT_DEFINITIONS.map((definition) => {
                const status = getAchievementStatus(permanentState, definition.id);
                if (!status) return null;
                const progressPercent = status.allClaimed
                  ? 100
                  : clampProgress(status.progress, status.target);
                return (
                  <article key={definition.id} className={`sci-achievement-card${status.complete ? ' is-complete' : ''}`}>
                    <div className="sci-achievement-emblem">
                      <img src={ACHIEVEMENT_ICON} alt="" />
                      <span>{status.allClaimed ? 'MAX' : `T${status.tier}`}</span>
                    </div>
                    <div className="sci-achievement-copy">
                      <div className="sci-achievement-heading">
                        <div>
                          <span>Permanent achievement</span>
                          <h3>{definition.title}</h3>
                        </div>
                        <div className="sci-achievement-reward">
                          <img src={ASSETS.RSC_TOKEN} alt="" />
                          <strong>{status.allClaimed ? 'Complete' : status.rewardCoins}</strong>
                        </div>
                      </div>
                      <p>{status.allClaimed ? 'All tiers complete' : formatAchievementDescription(status)}</p>
                      <div className="sci-achievement-progress" aria-label={`${status.progress} of ${status.target}`}>
                        <span style={{ width: `${progressPercent}%` }} />
                      </div>
                      <div className="sci-achievement-footer">
                        <span>{status.allClaimed ? 'Mastered' : `${Math.min(status.progress, status.target).toLocaleString()} / ${status.target.toLocaleString()}`}</span>
                        <button
                          type="button"
                          disabled={!walletConnected || !status.complete}
                          onClick={() => onClaimAchievement(definition.id)}
                        >
                          {status.allClaimed ? 'Complete' : status.complete ? 'Collect' : 'In progress'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default RewardCenter;
