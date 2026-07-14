import React, { useEffect, useState } from 'react';
import type { AssetKey } from '../game-config/types';
import {
  buildMissionRecordCardPath,
  formatRecordCardCompletedLabel,
  resolveRecordCardEncounterAssetKey
} from '../shared/record-card/renderRecordCardSvg.mjs';
import { DEFAULT_GAME_CAMPAIGN, getPrimaryAssetPath } from '../services/levelConfig';
import type { RunReceipt } from '../services/runReceiptService';
import type { MissionRecordWeeklyFunding } from '../services/weeklyFundingFlow';
import { trackEvent } from '../services/analyticsService';
import { shareScoreCardImage } from '../services/scoreCardShareService';
import { buildMissionRecordCardSvg, MissionRecordCard } from './MissionRecordCard';

interface MissionRecordPreviewProps {
  pilotName: string;
  receipt: RunReceipt;
  walletAddress?: string | null;
  walletStatus?: 'idle' | 'connecting' | 'connected' | 'error';
  mintConfigured: boolean;
  mintChainId: number;
  mintStatus: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error';
  mintMessage?: string;
  mintHash?: string;
  onConnect: () => void;
  onGetBaseApp: () => void;
  onMint: () => void;
  weeklyFunding?: MissionRecordWeeklyFunding | null;
  onOpenWeeklyFunding?: () => void;
  onClose: () => void;
}

const formatFlightTime = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const getEncounter = (wave: number) => (
  wave <= 1 ? 'Gatekeeper Sector' : wave === 2 ? 'Replication Rift' : 'Deep Review Space'
);

const toAbsoluteAssetUrl = (path: string) => new URL(path, window.location.origin).toString();

const MissionRecordPreview: React.FC<MissionRecordPreviewProps> = ({
  pilotName,
  receipt,
  walletAddress,
  walletStatus = 'idle',
  mintConfigured,
  mintChainId,
  mintStatus,
  mintMessage,
  mintHash,
  onConnect,
  onGetBaseApp,
  onMint,
  weeklyFunding = null,
  onOpenWeeklyFunding,
  onClose
}) => {
  const [shareStatus, setShareStatus] = useState('');
  const [cardImageLoaded, setCardImageLoaded] = useState(false);
  const [cardImageFailed, setCardImageFailed] = useState(false);
  const useCanonicalServerImage = import.meta.env.PROD;
  const dateLabel = formatRecordCardCompletedLabel(receipt.finishedAt);
  const cardUrl = `${window.location.origin}${buildMissionRecordCardPath(receipt.runId)}`;
  const explorerUrl = mintChainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org';
  const needsBaseAccount = !walletAddress;
  const encounter = getEncounter(receipt.metrics.wave);
  const recordCardConfig = DEFAULT_GAME_CAMPAIGN.recordCard;
  const encounterAssetKey = recordCardConfig.encounterAssetKey === 'AUTO'
    ? resolveRecordCardEncounterAssetKey(DEFAULT_GAME_CAMPAIGN, receipt.metrics.wave) as AssetKey
    : recordCardConfig.encounterAssetKey;
  const encounterArt = getPrimaryAssetPath(encounterAssetKey);
  const shipArt = getPrimaryAssetPath(recordCardConfig.shipAssetKey);
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
    const text = `${pilotName} scored ${receipt.metrics.score.toLocaleString()} in Scicon Shooter and reached wave ${receipt.metrics.wave}. Play. Win the week. Choose what research gets funded.`;
    setShareStatus('Preparing score card image...');
    try {
      const method = await shareScoreCardImage({
        cardUrl,
        sourceSvg: import.meta.env.DEV ? buildMissionRecordCardSvg({
          record: { ...cardRecord, encounterArt: toAbsoluteAssetUrl(encounterArt) },
          shipArt: toAbsoluteAssetUrl(shipArt),
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

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/92 p-4 backdrop-blur-xl sm:items-center">
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
              <MissionRecordCard record={cardRecord} shipArt={shipArt} presentation={recordCardConfig} />
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

          {mintStatus !== 'confirmed' ? (
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
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
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
          {mintHash ? <a href={`${explorerUrl}/tx/${mintHash}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200 underline underline-offset-2">View Score Record transaction</a> : null}

          {weeklyFunding ? (
            <div className="mt-4 border-t border-yellow-200/20 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-yellow-200">Weekly funding</p>
                  <h3 className="arcade-font mt-1 text-sm font-black uppercase tracking-wider text-white">
                    {weeklyFunding.status === 'claimable'
                      ? 'Weekly champion confirmed'
                      : weeklyFunding.status === 'selected'
                        ? 'Proposal selected'
                        : 'Current weekly leader'}
                  </h3>
                </div>
                <span className="shrink-0 border border-yellow-200/30 bg-yellow-300/10 px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-yellow-100">
                  {weeklyFunding.allocationRsc} RSC
                </span>
              </div>
              <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-300">
                {weeklyFunding.status === 'claimable'
                  ? 'Your winning score is locked. Choose the ResearchHub proposal for this weekly allocation.'
                  : weeklyFunding.status === 'selected'
                    ? weeklyFunding.proposalTitle || 'Your weekly funding proposal has been selected.'
                    : 'You are #1 right now. If you still lead at Sunday\'s noon Pacific cutoff, proposal choice unlocks here.'}
              </p>
              {onOpenWeeklyFunding ? (
                <button
                  type="button"
                  onClick={onOpenWeeklyFunding}
                  className="mt-3 min-h-11 w-full border border-yellow-100/35 bg-yellow-300/15 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 transition hover:bg-yellow-300/25"
                >
                  {weeklyFunding.status === 'claimable'
                    ? 'Choose weekly proposal'
                    : weeklyFunding.status === 'selected'
                      ? 'View selected proposal'
                      : 'Browse eligible proposals'}
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
