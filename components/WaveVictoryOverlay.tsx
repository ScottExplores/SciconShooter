import React from 'react';
import type { CampaignCompletionSettlement } from '../services/campaignProgression';
import type { WaveVictorySummary } from '../services/gameLogic';
import './wave-victory.css';

const CHAMPION_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/weekly-champion-reveal/parts';
const RECORD_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/mission-record-verification/parts';

export interface WaveVictoryOverlayProps {
  summary: WaveVictorySummary;
  onContinue: () => void;
  bossArchiveReplay?: boolean;
  campaignSettlement?: CampaignCompletionSettlement | null;
  newlyAffordableUpgrade?: string | null;
  onOpenCampaignMap?: () => void;
  onReturnHome?: () => void;
}

const formatFlightTime = (elapsedSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

const LayerImage: React.FC<{ className: string; src: string }> = ({ className, src }) => (
  <img className={className} src={src} alt="" aria-hidden="true" draggable={false} />
);

const WaveVictoryOverlay: React.FC<WaveVictoryOverlayProps> = ({
  summary,
  onContinue,
  bossArchiveReplay = false,
  campaignSettlement = null,
  newlyAffordableUpgrade = null,
  onOpenCampaignMap,
  onReturnHome
}) => {
  const campaignResult = Boolean(campaignSettlement);
  const campaignComplete = summary.campaignComplete || !summary.hasNextStage;
  const missionMastered = Boolean(
    campaignSettlement
    && campaignSettlement.previousStars < 3
    && campaignSettlement.stars === 3
  );
  const specialNoticeCount = campaignSettlement
    ? Number(Boolean(campaignSettlement.newlyUnlockedMissionId))
      + Number(campaignSettlement.newlyUnlockedBranchIds.length > 0)
      + Number(campaignSettlement.firstClear && Boolean(summary.bossEncounterId))
      + Number(missionMastered)
      + Number(Boolean(newlyAffordableUpgrade))
    : 0;
  const visibleGrantLimit = Math.max(1, 3 - specialNoticeCount);
  const visibleGrants = campaignSettlement?.grants.slice(0, visibleGrantLimit) ?? [];
  const hiddenGrantCount = Math.max(0, (campaignSettlement?.grants.length ?? 0) - visibleGrants.length);
  const earnedStars = Math.max(0, Math.min(3, campaignSettlement?.stars ?? 0));
  const newStarCount = Math.max(0, campaignSettlement?.newStarIds.length ?? 0);
  const newBestLabels = campaignSettlement
    ? [
        campaignSettlement.newBestScore ? 'score' : '',
        campaignSettlement.newBestTime ? 'time' : '',
        campaignSettlement.newBestCoins ? 'coins' : ''
      ].filter(Boolean)
    : [];
  const newBestNotice = newBestLabels.length > 0
    ? `New best ${newBestLabels.join(' + ')}`
    : '';
  const resultTitle = bossArchiveReplay
    ? 'Boss Defeated'
    : campaignComplete
      ? 'Campaign Complete'
      : campaignResult
        ? 'Mission Complete'
        : 'Victory';
  const resultSubtitle = bossArchiveReplay
    ? 'Practice encounter cleared'
    : campaignComplete
      ? 'All 20 missions cleared'
      : `Mission ${summary.stage} cleared`;
  const primaryAction = bossArchiveReplay
    ? { prefix: 'Return to', target: 'Boss Archive' }
    : campaignComplete
      ? { prefix: 'Open', target: 'Campaign Map' }
      : { prefix: 'Continue', target: `Mission ${summary.nextStage}` };
  const recordStatus = bossArchiveReplay
    ? 'Archive challenge cleared'
    : !campaignSettlement
      ? campaignComplete
        ? 'Campaign data secured'
        : 'Mission data locked'
      : campaignSettlement.duplicate
        ? 'Progress already secured'
        : campaignSettlement.firstClear
          ? newBestNotice
            ? `First clear · ${newBestNotice}`
            : 'First-clear record secured'
          : campaignSettlement.replay
            ? newBestNotice || 'Replay record updated'
            : campaignComplete
              ? 'Campaign data secured'
              : newBestNotice || 'Mission record updated';

  return (
    <div
      className="wave-victory-overlay is-mission-result"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wave-victory-title"
    >
      <div className="wave-victory-backdrop" aria-hidden="true" />
      <div className="wave-victory-stage">
        <section
          className={`wave-record-shell wave-record-shell-mission ${missionMastered ? 'is-mastered' : ''}`}
          data-onboarding-target="mission-rewards"
          aria-label={`Mission ${summary.stage} completed after ${summary.waveTotal} waves`}
        >
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
              <strong>Mission {summary.stage} · W{summary.waveNumber}/{summary.waveTotal}</strong>
            </div>

            <div className="wave-record-sector">
              <span>{summary.stageName}</span>
              <small>{summary.finalWaveName}</small>
            </div>

            <div className="wave-record-score">
              <span>Mission Score</span>
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
                <span>Lives</span>
                <strong>{summary.remainingLives.toLocaleString()}</strong>
              </div>
              <div>
                <span>Flight</span>
                <strong>{formatFlightTime(summary.elapsedSeconds)}</strong>
              </div>
            </div>

            <div className={`wave-record-result-grid ${campaignSettlement ? 'has-campaign-reward' : ''}`}>
              <div>
                <span>Total Score</span>
                <strong>{summary.totalScore.toLocaleString()}</strong>
              </div>
              {campaignSettlement ? (
                <div className="wave-record-coins-awarded">
                  <span>Campaign Reward</span>
                  <strong>{campaignSettlement.duplicate ? 'Saved' : `+${campaignSettlement.coinsAwarded.toLocaleString()}`}</strong>
                </div>
              ) : null}
            </div>

            {campaignSettlement ? (
              <div className="wave-record-campaign-details">
                <div className="wave-record-rewards" aria-label="Campaign reward breakdown">
                  {visibleGrants.length > 0 ? visibleGrants.map((grant) => (
                    <span className={`wave-record-reward-chip is-${grant.kind}`} key={grant.id} title={grant.label}>
                      {grant.label} <b>+{grant.amount.toLocaleString()}</b>
                    </span>
                  )) : (
                    <span className="wave-record-reward-chip is-saved">
                      {campaignSettlement.duplicate ? 'Reward already credited' : 'Progress saved'}
                    </span>
                  )}
                  {campaignSettlement.newlyUnlockedMissionId ? (
                    <span className="wave-record-reward-chip is-unlock">Next Mission unlocked</span>
                  ) : null}
                  {campaignSettlement.newlyUnlockedBranchIds.length > 0 ? (
                    <span className="wave-record-reward-chip is-unlock">Bonus route unlocked</span>
                  ) : null}
                  {missionMastered ? (
                    <span className="wave-record-reward-chip is-mastered">Mission Mastered</span>
                  ) : null}
                  {newlyAffordableUpgrade ? (
                    <span className="wave-record-reward-chip is-affordable">
                      Upgrade now affordable: {newlyAffordableUpgrade}
                    </span>
                  ) : null}
                  {campaignSettlement.firstClear && summary.bossEncounterId ? (
                    <span className="wave-record-reward-chip is-boss-unlock">Boss Archive unlocked</span>
                  ) : null}
                  {hiddenGrantCount > 0 ? <span className="wave-record-reward-more">+{hiddenGrantCount} more</span> : null}
                </div>

                <div
                  className="wave-record-stars"
                  aria-label={`${earnedStars} of 3 mastery stars earned${newStarCount > 0 ? `, ${newStarCount} new` : ''}`}
                >
                  <span>Mastery</span>
                  <div aria-hidden="true">
                    {[0, 1, 2].map((starIndex) => {
                      const earned = starIndex < earnedStars;
                      const newlyEarned = earned && starIndex >= Math.max(0, earnedStars - newStarCount);
                      return (
                        <i
                          className={`wave-record-star ${earned ? 'is-earned' : ''} ${newlyEarned ? 'is-new' : ''}`}
                          key={starIndex}
                        >★</i>
                      );
                    })}
                  </div>
                  {newStarCount > 0 ? <strong>+{newStarCount} new</strong> : null}
                </div>
              </div>
            ) : null}

            <div className="wave-record-status">
              <span className="wave-record-status-light" aria-hidden="true" />
              {recordStatus}
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
            <h1
              id="wave-victory-title"
              className={campaignComplete ? 'wave-victory-title-complete' : undefined}
            >
              {resultTitle}
            </h1>
            <p>{resultSubtitle}</p>
          </div>
        </header>

        <div className="wave-victory-actions">
          <button className="wave-victory-continue" type="button" onClick={onContinue}>
            <span>{primaryAction.prefix}</span>
            <strong>{primaryAction.target}</strong>
          </button>
          {onOpenCampaignMap && !bossArchiveReplay ? (
            <button className="wave-victory-secondary" type="button" onClick={onOpenCampaignMap}>
              <span>Campaign</span>
              <strong>Map</strong>
            </button>
          ) : null}
          {onReturnHome ? (
            <button className="wave-victory-secondary" type="button" onClick={onReturnHome}>
              <span>Return</span>
              <strong>Home</strong>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WaveVictoryOverlay;
