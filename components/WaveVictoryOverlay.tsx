// REVAMP(H): The original frame now presents an ordered medal and reward reveal.
import { ResultMedals, ResultRewards } from './revamp/ResultRewards';
import { AnimatedNumber } from './revamp/UiMotion';
import type { RevampMedal, RevampMissionSettlement } from '../services/revamp/progression/types';
import React from 'react';
import type { CampaignCompletionSettlement } from '../services/campaignProgression';
import type { WaveVictorySummary } from '../services/gameLogic';
import './wave-victory.css';

const CHAMPION_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/weekly-champion-reveal/parts';
const RECORD_PARTS = '/game-art/generated/ui/scicon-ui-system-v2/animations/mission-record-verification/parts';

export interface WaveVictoryOverlayProps {
  summary: WaveVictorySummary;
  revampSettlement?: RevampMissionSettlement | null;
  onContinue: () => void;
  bossArchiveReplay?: boolean;
  campaignSettlement?: CampaignCompletionSettlement | null;
  guideRequiresHome?: boolean;
  onOpenHangar?: () => void;
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
  revampSettlement,
  onContinue,
  bossArchiveReplay = false,
  campaignSettlement = null,
  guideRequiresHome = false,
  onOpenHangar,
  onOpenCampaignMap,
  onReturnHome
}) => {
  const observedMedals: RevampMedal[] = ['clear'];
  if (summary.revampMetrics && summary.revampMetrics.spawned > 0 && summary.revampMetrics.kills / summary.revampMetrics.spawned >= 0.9) observedMedals.push('kills');
  if (summary.damageTaken === 0) observedMedals.push('noHit');
  // Final Campaign settlement already includes collected Tokens; never add the pickup total twice.
  const rewardCredits = campaignSettlement?.coinsAwarded ?? summary.coinsCollected;
  const campaignResult = Boolean(campaignSettlement);
  const campaignComplete = summary.campaignComplete || !summary.hasNextStage;
  const missionMastered = Boolean(
    campaignSettlement
    && campaignSettlement.previousStars < 3
    && campaignSettlement.stars === 3
  );
  const earnedStars = Math.max(0, Math.min(3, campaignSettlement?.stars ?? 0));
  const newStarCount = Math.max(0, campaignSettlement?.newStarIds.length ?? 0);
  const newBestLabels = campaignSettlement
    ? [
        campaignSettlement.newBestScore ? 'score' : '',
        campaignSettlement.newBestTime ? 'time' : '',
        campaignSettlement.newBestCoins ? 'Tokens' : ''
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
              <strong><AnimatedNumber value={summary.scoreEarned} delay={350} duration={950} /></strong>
            </div>

            <div className="wave-record-stats">
              <div>
                <span>Enemies</span>
                <strong>{summary.enemiesDefeated.toLocaleString()}</strong>
              </div>
              <div>
                <span>Tokens</span>
                <strong><AnimatedNumber value={summary.coinsCollected} delay={600} /></strong>
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

            <ResultMedals settlement={revampSettlement} observedMedals={observedMedals} />
            <ResultRewards credits={rewardCredits} settlement={revampSettlement} />
            <div className="wave-record-result-grid">
              <div><span>Total Score</span><strong>{summary.totalScore.toLocaleString()}</strong></div>
              {campaignSettlement ? (
                <div className="wave-record-stars" aria-label={`${earnedStars} mastery stars, ${newStarCount} new`}>
                  <span>Route mastery</span><strong>{'★'.repeat(earnedStars)}{'☆'.repeat(3 - earnedStars)}</strong>
                </div>
              ) : null}
            </div>

            <div className="wave-record-status">
              <span className="wave-record-status-light" aria-hidden="true" />
              {recordStatus}
            </div>
          </div>
        </section>

        <div className="wave-victory-actions">
          <button
            className="wave-victory-continue"
            type="button"
            onClick={onContinue}
            disabled={guideRequiresHome}
            aria-disabled={guideRequiresHome}
          >
            <span>{primaryAction.prefix}</span>
            <strong>{primaryAction.target}</strong>
          </button>
          {onOpenHangar && !bossArchiveReplay ? (
            <button
              className="wave-victory-secondary is-hangar"
              type="button"
              onClick={onOpenHangar}
              disabled={guideRequiresHome}
              aria-disabled={guideRequiresHome}
            >
              <span>Spend Tokens</span>
              <strong>Hangar</strong>
            </button>
          ) : null}
          {onOpenCampaignMap && !bossArchiveReplay ? (
            <button
              className="wave-victory-secondary is-map"
              type="button"
              onClick={onOpenCampaignMap}
              disabled={guideRequiresHome}
              aria-disabled={guideRequiresHome}
            >
              <span>Campaign</span>
              <strong>Map</strong>
            </button>
          ) : null}
          {onReturnHome ? (
            <button
              className="wave-victory-secondary is-home"
              data-onboarding-target="mission-home"
              data-guide-required={guideRequiresHome ? 'true' : 'false'}
              type="button"
              onClick={onReturnHome}
            >
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
