import React, { useEffect, useState } from 'react';
import type { AssetKey } from '../game-config/types';
import {
  buildMissionRecordCardPath,
  formatRecordCardCompletedLabel,
  resolveRecordCardEncounterArt,
  resolveRecordCardEncounterAssetKey
} from '../shared/record-card/renderRecordCardSvg.mjs';
import { DEFAULT_GAME_CAMPAIGN, getPrimaryAssetPath } from '../services/levelConfig';
import type { RunReceipt } from '../services/runReceiptService';
import type { MissionRecordWeeklyFunding } from '../services/weeklyFundingFlow';
import { getPublicPrizeState } from '../shared/weeklyCompetitionBoundary.browser';
import { trackEvent } from '../services/analyticsService';
import { shareScoreCardImage } from '../services/scoreCardShareService';
import { openXScoreShare } from '../services/xScoreShareService';
import { parsePlayerShipId, PLAYER_SHIPS } from '../services/playerShipService';
import { getStageName } from '../services/stagePresentation';
import { buildMissionRecordCardSvg, MissionRecordCard } from './MissionRecordCard';

interface MissionRecordPreviewProps {
  pilotName: string;
  receipt: RunReceipt;
  walletAddress?: string | null;
  walletStatus?: 'idle' | 'connecting' | 'connected' | 'error';
  mintConfigured: boolean;
  mintStatus: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error';
  mintMessage?: string;
  onConnect: () => void;
  onSwitchAccount: () => void;
  onDisconnect: () => void;
  onGetBaseApp: () => void;
  onMint: () => void;
  weeklyFunding?: MissionRecordWeeklyFunding | null;
  onOpenWeeklyFunding?: () => void;
  onRetryRun?: () => void;
  onHangar?: () => void;
  onMainMenu?: () => void;
  onClose: () => void;
}

const formatFlightTime = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const toAbsoluteAssetUrl = (path: string) => new URL(path, window.location.origin).toString();

const MissionRecordPreview: React.FC<MissionRecordPreviewProps> = ({
  pilotName,
  receipt,
  walletAddress,
  walletStatus = 'idle',
  mintConfigured,
  mintStatus,
  mintMessage,
  onConnect,
  onSwitchAccount,
  onDisconnect,
  onGetBaseApp,
  onMint,
  weeklyFunding = null,
  onOpenWeeklyFunding,
  onRetryRun,
  onHangar,
  onMainMenu,
  onClose
}) => {
  const [shareStatus, setShareStatus] = useState('');
  const [cardImageLoaded, setCardImageLoaded] = useState(false);
  const [cardImageFailed, setCardImageFailed] = useState(false);
  const useCanonicalServerImage = import.meta.env.PROD;
  const dateLabel = formatRecordCardCompletedLabel(receipt.finishedAt);
  const playerShipId = parsePlayerShipId(receipt.metrics.playerShipId);
  const cardUrl = `${window.location.origin}${buildMissionRecordCardPath(receipt.runId, playerShipId)}`;
  const needsBaseAccount = !walletAddress;
  const weeklyChoiceRequired = Boolean(weeklyFunding && weeklyFunding.status !== 'selected');
  const encounter = getStageName(receipt.metrics.wave);
  const recordCardConfig = DEFAULT_GAME_CAMPAIGN.recordCard;
  const encounterAssetKey = recordCardConfig.encounterAssetKey === 'AUTO'
    ? resolveRecordCardEncounterAssetKey(DEFAULT_GAME_CAMPAIGN, receipt.metrics.wave) as AssetKey
    : recordCardConfig.encounterAssetKey;
  const encounterArtFallback = getPrimaryAssetPath(encounterAssetKey);
  const encounterArtLayers = resolveRecordCardEncounterArt(encounterAssetKey, encounterArtFallback);
  const encounterArt = encounterArtLayers[0]?.path || encounterArtFallback;
  const shipArt = PLAYER_SHIPS[playerShipId].assetUrl;
  const cardRecord = {
    pilotName,
    encounterLabel: encounter,
    encounterArt,
    score: receipt.metrics.score,
    wave: receipt.metrics.wave,
    targetsDefeated: receipt.metrics.enemiesDefeated,
    coinsCollected: receipt.metrics.coinsCollected,
    flightTimeLabel: formatFlightTime(receipt.metrics.durationMs),
    dateLabel,
    gameVersion: receipt.gameVersion,
    integrity: receipt.integrity
  };

  useEffect(() => {
    setCardImageLoaded(false);
    setCardImageFailed(false);
    setShareStatus('');
  }, [cardUrl]);

  const shareRecord = async () => {
    const text = `${pilotName} scored ${receipt.metrics.score.toLocaleString()} in Scicon Shooter and reached Mission ${receipt.metrics.wave}. Play. Win the week. Choose what research gets funded.`;
    setShareStatus('Preparing score card image...');
    try {
      const method = await shareScoreCardImage({
        cardUrl,
        sourceSvg: import.meta.env.DEV ? buildMissionRecordCardSvg({
          record: { ...cardRecord, encounterArt: toAbsoluteAssetUrl(encounterArt) },
          shipArt: toAbsoluteAssetUrl(shipArt),
          encounterImages: encounterArtLayers.map((layer) => ({
            ...layer,
            image: toAbsoluteAssetUrl(layer.path)
          })),
          frameArt: toAbsoluteAssetUrl('/game-art/record-card/mission-record-frame.png'),
          presentation: recordCardConfig
        }) : undefined,
        fileName: `scicon-score-${receipt.metrics.score}.png`,
        title: 'Scicon Shooter Mission Record',
        text
      });
      setShareStatus(method === 'native'
        ? 'Score card image shared'
        : method === 'clipboard'
          ? 'Score card image copied'
          : 'Score card image downloaded');
      trackEvent('share_action_used', { record_type: 'mission', method });
    } catch (error: any) {
      if (/abort|cancel/i.test(error?.message || '')) setShareStatus('');
      else setShareStatus('Score card image is unavailable');
    }
  };

  const shareScoreToX = () => {
    const opened = openXScoreShare({
      score: receipt.metrics.score,
      wave: receipt.metrics.wave
    });
    setShareStatus(opened ? 'X score post opened' : 'X share window was blocked');
    trackEvent('share_action_used', {
      record_type: 'mission',
      method: 'x_intent',
      opened
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/92 p-4 backdrop-blur-xl sm:items-center">
      <div className="relative w-full max-w-md overflow-hidden rounded-[8px] border border-cyan-200/35 bg-[#020817] shadow-[0_28px_100px_rgba(0,0,0,0.72),0_0_70px_rgba(34,211,238,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative border-b border-cyan-200/15 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300">Scicon Shooter</p>
              <h2 className="arcade-font mt-1 text-xl font-black uppercase tracking-widest text-white">Mission Record</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close mission record" className="h-9 w-9 rounded-[6px] border border-white/12 bg-white/5 text-lg text-slate-300 transition hover:border-cyan-200/40 hover:text-white">x</button>
          </div>
        </div>

        <div className="relative p-3 sm:p-4">
          <div className="relative aspect-square overflow-hidden bg-[#020617]" aria-live="polite">
            <div className={`absolute inset-0 transition-opacity ${useCanonicalServerImage && cardImageLoaded && !cardImageFailed ? 'opacity-0' : 'opacity-100'}`}>
              <MissionRecordCard record={cardRecord} shipArt={shipArt} encounterImages={encounterArtLayers} presentation={recordCardConfig} />
            </div>
            {useCanonicalServerImage && !cardImageFailed ? (
              <img
                src={cardUrl}
                alt={`Mintable Scicon Shooter mission record for ${pilotName || 'Pilot'}`}
                className={`relative block h-full w-full object-contain transition-opacity ${cardImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setCardImageLoaded(true)}
                onError={() => setCardImageFailed(true)}
              />
            ) : null}
          </div>

          {weeklyFunding ? (
            <div className="mt-3 rounded-[8px] border border-yellow-200/30 bg-yellow-300/10 p-3 shadow-[0_0_18px_rgba(250,204,21,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-yellow-200">{getPublicPrizeState().phase === 'weekly' ? 'Weekly funding' : 'SciCon Big Event'}</p>
                  <h3 className="arcade-font mt-1 text-sm font-black uppercase tracking-wider text-white">
                    {weeklyFunding.status === 'claimable'
                      ? 'Champion confirmed'
                      : weeklyFunding.status === 'selected'
                        ? 'Funding choice saved'
                        : getPublicPrizeState().phase === 'weekly' ? 'Weekly high score' : 'Event high score'}
                  </h3>
                </div>
                <span className="shrink-0 border border-yellow-200/30 bg-black/30 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-yellow-100">
                  {weeklyFunding.allocationRsc} RSC
                </span>
              </div>
              <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-200">
                {weeklyFunding.status === 'claimable'
                  ? getPublicPrizeState().phase === 'weekly'
                    ? 'Your winning score is locked. Choose an open ResearchHub proposal or RFP before minting or sharing.'
                    : 'Your winning score is locked. Choose the Airborne Disease Resilience pool, a proposal under it, or any other open proposal or RFP.'
                  : weeklyFunding.status === 'selected'
                    ? weeklyFunding.proposalTitle || (getPublicPrizeState().phase === 'weekly'
                      ? 'Your weekly funding choice is saved with this mission record.'
                      : 'Your event funding choice is saved with this mission record.')
                    : getPublicPrizeState().phase === 'weekly'
                      ? 'You hold the weekly high score. Choose an open proposal or RFP before the weekly cutoff.'
                      : 'You hold the event high score. Airborne Disease Resilience is featured. Any open proposal or RFP still counts if it stays open after November 30, 2026.'}
              </p>
              {weeklyFunding.status === 'selected' && weeklyFunding.proposalAuthor ? (
                <p className="mt-1 truncate font-mono text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100/75">
                  {weeklyFunding.proposalAuthor}
                </p>
              ) : null}
              {weeklyFunding.status !== 'selected' && onOpenWeeklyFunding ? (
                <button
                  type="button"
                  onClick={onOpenWeeklyFunding}
                  className="mt-3 min-h-11 w-full rounded-[6px] border border-yellow-100/40 bg-yellow-300/20 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 transition hover:bg-yellow-300/30"
                >
                  {getPublicPrizeState().phase === 'weekly' ? 'Choose weekly proposal' : 'Choose proposal'}
                </button>
              ) : null}
            </div>
          ) : null}

          {!weeklyChoiceRequired && mintStatus !== 'confirmed' ? (
            <div className="mt-3 overflow-hidden rounded-[8px] border border-cyan-100/25 bg-[linear-gradient(135deg,rgba(8,47,73,0.72),rgba(6,78,59,0.34))] p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="arcade-font text-sm font-black uppercase tracking-wider text-white">
                    {needsBaseAccount ? 'Connect wallet' : 'Base Account connected'}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold leading-relaxed text-cyan-100">
                    {needsBaseAccount
                      ? 'Connect to mint this mission record, or get the Base app to create an account.'
                      : `${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)} is ready to mint this record.`}
                  </p>
                </div>
                <span className="shrink-0 rounded-[5px] border border-white/20 bg-white/10 px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-white">
                  Onchain
                </span>
              </div>
              {needsBaseAccount ? (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={onConnect}
                    disabled={walletStatus === 'connecting'}
                    className="min-h-10 rounded-[7px] border border-cyan-100/35 bg-cyan-300/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    {walletStatus === 'connecting' ? 'Connecting...' : 'Connect wallet'}
                  </button>
                  <button
                    type="button"
                    onClick={onGetBaseApp}
                    className="min-h-10 rounded-[7px] border border-white/20 bg-white/8 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
                  >
                    Get Base app
                  </button>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={onSwitchAccount}
                    disabled={walletStatus === 'connecting'}
                    className="min-h-10 rounded-[7px] border border-cyan-100/35 bg-cyan-300/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-wait disabled:opacity-60"
                  >
                    {walletStatus === 'connecting' ? 'Opening Base...' : 'Choose account'}
                  </button>
                  <button
                    type="button"
                    onClick={onDisconnect}
                    disabled={walletStatus === 'connecting'}
                    className="min-h-10 rounded-[7px] border border-red-200/25 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-red-100 transition hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {!weeklyChoiceRequired ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={shareScoreToX}
                  className="col-span-2 min-h-12 rounded-[8px] border border-emerald-100/35 bg-emerald-300/18 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 transition hover:bg-emerald-300/28"
                >
                  Post score on X
                </button>
                <button type="button" onClick={() => void shareRecord()} className="min-h-11 rounded-[8px] border border-cyan-100/25 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 transition hover:bg-cyan-300/20">Share image</button>
                <button type="button" onClick={onMint} disabled={!walletAddress || !mintConfigured || mintStatus === 'authorizing' || mintStatus === 'confirming' || mintStatus === 'confirmed'} className="min-h-11 rounded-[8px] border border-yellow-100/30 bg-yellow-300/15 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 transition hover:bg-yellow-300/25 disabled:cursor-not-allowed disabled:opacity-55">
                  {mintStatus === 'confirmed'
                    ? 'NFT minted'
                    : mintStatus === 'authorizing' || mintStatus === 'confirming'
                      ? 'Confirm in Base Account'
                      : mintConfigured
                        ? needsBaseAccount ? 'Connect to mint' : 'Mint NFT'
                        : 'Mint setup awaiting approval'}
                </button>
              </div>
              {shareStatus || mintMessage ? <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">{mintMessage || shareStatus}</p> : null}
            </>
          ) : null}

          {onRetryRun || onHangar || onMainMenu ? (
            <div className="mt-3 grid gap-2 border-t border-cyan-100/15 pt-3">
              {onRetryRun ? (
                <button
                  type="button"
                  onClick={onRetryRun}
                  className="group relative min-h-12 overflow-hidden rounded-[7px] text-xs font-black uppercase tracking-[0.12em] text-white transition active:scale-95"
                >
                  <img src="/game-art/generated/ui/scicon-ui-system-v2/base/mission-results/retry-button.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill [image-rendering:pixelated] transition group-hover:brightness-125" />
                  <span className="relative z-10 drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">Retry run</span>
                </button>
              ) : null}
              {onHangar ? (
                <button
                  type="button"
                  onClick={onHangar}
                  className="group relative min-h-12 overflow-hidden rounded-[7px] border border-cyan-100/30 bg-cyan-300/12 text-xs font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/20 active:scale-[0.98]"
                >
                  Hangar
                </button>
              ) : null}
              {onMainMenu ? (
                <button
                  type="button"
                  onClick={onMainMenu}
                  className="group relative min-h-12 overflow-hidden rounded-[7px] text-xs font-black uppercase tracking-[0.12em] text-white transition active:scale-95"
                >
                  <img src="/game-art/generated/ui/scicon-ui-system-v2/base/mission-results/main-menu-button.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill [image-rendering:pixelated] transition group-hover:brightness-125" />
                  <span className="relative z-10 drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]">Main menu</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default MissionRecordPreview;
