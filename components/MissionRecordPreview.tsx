import React, { useState } from 'react';
import { ASSETS } from '../constants';
import type { RunReceipt } from '../services/runReceiptService';
import { trackEvent } from '../services/analyticsService';

interface MissionRecordPreviewProps {
  pilotName: string;
  receipt: RunReceipt;
  walletAddress?: string | null;
  runClaimStatus: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error';
  runClaimMessage?: string;
  mintConfigured: boolean;
  mintChainId: number;
  mintStatus: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error';
  mintMessage?: string;
  mintHash?: string;
  onAttachWallet: () => void;
  onMint: () => void;
  onClose: () => void;
}

const shortAddress = (address?: string | null) => address
  ? `${address.slice(0, 6)}...${address.slice(-4)}`
  : 'Guest run';

const formatFlightTime = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

const getEncounter = (wave: number) => (
  wave <= 1 ? 'Gatekeeper Sector' : wave === 2 ? 'Replication Rift' : 'Deep Review Space'
);

const MissionRecordPreview: React.FC<MissionRecordPreviewProps> = ({
  pilotName,
  receipt,
  walletAddress,
  runClaimStatus,
  runClaimMessage,
  mintConfigured,
  mintChainId,
  mintStatus,
  mintMessage,
  mintHash,
  onAttachWallet,
  onMint,
  onClose
}) => {
  const [shareStatus, setShareStatus] = useState('');
  const finished = new Date(receipt.finishedAt);
  const dateLabel = Number.isFinite(finished.getTime())
    ? finished.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Verified run';
  const recordUrl = `${window.location.origin}/api/record-card?runId=${encodeURIComponent(receipt.runId)}`;
  const cardUrl = `${window.location.origin}/api/record-card?runId=${encodeURIComponent(receipt.runId)}`;
  const explorerUrl = mintChainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org';
  const needsBaseAccount = !walletAddress;
  const isClaimBusy = runClaimStatus === 'connecting' || runClaimStatus === 'signing';
  const encounter = getEncounter(receipt.metrics.wave);
  const encounterArt = receipt.metrics.wave === 2 ? ASSETS.MINI_BOSS : ASSETS.FINAL_BOSS;

  const shareRecord = async () => {
    const text = `${pilotName} scored ${receipt.metrics.score.toLocaleString()} in Scicon Shooter and reached wave ${receipt.metrics.wave}. Play. Win the week. Choose what research gets funded.`;
    try {
      const cardResponse = await fetch(cardUrl, { headers: { Accept: 'image/svg+xml' } });
      const cardBlob = cardResponse.ok ? await cardResponse.blob() : null;
      const cardFile = cardBlob
        ? new File([cardBlob], `scicon-score-${receipt.metrics.score}.svg`, { type: 'image/svg+xml' })
        : null;
      const files = cardFile ? [cardFile] : [];
      if (navigator.share && cardFile && navigator.canShare?.({ files })) {
        await navigator.share({ title: 'Scicon Shooter Mission Record', text, url: recordUrl, files });
      } else if (navigator.share) {
        await navigator.share({ title: 'Scicon Shooter Mission Record', text, url: recordUrl });
      } else {
        await navigator.clipboard.writeText(`${text} ${recordUrl} Score card: ${cardUrl}`);
        setShareStatus('Score card link copied');
      }
      trackEvent('share_action_used', { record_type: 'mission', method: navigator.share ? (cardFile ? 'native_file' : 'native') : 'clipboard' });
    } catch (error: any) {
      if (!/abort|cancel/i.test(error?.message || '')) setShareStatus('Share is unavailable');
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

        <div className="relative p-4 sm:p-5">
          <div className="relative overflow-hidden border border-cyan-100/30 bg-[radial-gradient(circle_at_72%_34%,rgba(59,130,246,0.25),transparent_28%),linear-gradient(145deg,#07152a,#020611_72%)] p-4 [clip-path:polygon(16px_0,calc(50%_-_24px)_0,calc(50%_-_14px)_8px,calc(50%_+_14px)_8px,calc(50%_+_24px)_0,calc(100%_-_16px)_0,100%_16px,100%_calc(100%_-_16px),calc(100%_-_16px)_100%,16px_100%,0_calc(100%_-_16px),0_16px)] sm:p-5">
            <div className="pointer-events-none absolute left-0 top-5 h-12 w-24 -translate-x-12 -skew-x-[24deg] border-y border-r border-yellow-200/30 bg-yellow-300/10" />
            <div className="pointer-events-none absolute right-0 top-5 h-12 w-24 translate-x-12 skew-x-[24deg] border-y border-l border-yellow-200/30 bg-yellow-300/10" />
            <div className="pointer-events-none absolute left-1/2 top-0 h-2.5 w-14 -translate-x-1/2 bg-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.5)] [clip-path:polygon(12%_0,88%_0,100%_50%,88%_100%,12%_100%,0_50%)]" />
            <img src={encounterArt} alt="" aria-hidden="true" className="pointer-events-none absolute right-4 top-10 h-24 w-24 object-contain opacity-35 [image-rendering:pixelated]" />

            <div className="relative flex items-center gap-3">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center border border-cyan-200/20 bg-cyan-300/8 [clip-path:polygon(10px_0,100%_0,100%_calc(100%_-_10px),calc(100%_-_10px)_100%,0_100%,0_10px)]">
                <div className="absolute inset-x-2 bottom-2 h-6 rounded-full bg-cyan-300/25 blur-md" />
                <img src={ASSETS.PLAYER_SHIP} alt="ResearchHub flask ship" className="relative h-16 w-16 object-contain drop-shadow-[0_12px_18px_rgba(34,211,238,0.4)]" />
              </div>
              <div className="min-w-0 flex-1 pr-12">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">Server verified</p>
                <p className="mt-1 truncate text-lg font-black uppercase text-white">{pilotName || 'Pilot'}</p>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200">{encounter}</p>
                <p className="mt-1 font-mono text-[8px] uppercase text-slate-500">{shortAddress(walletAddress)}</p>
              </div>
            </div>

            <div className="relative mt-4 border-y border-white/10 py-3 text-center">
              <span className="block text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">Final Score</span>
              <strong className="mt-0.5 block text-3xl text-white">{receipt.metrics.score.toLocaleString()}</strong>
            </div>
            <div className="relative grid grid-cols-4 divide-x divide-white/10 py-3 text-center">
              <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Wave</span><strong className="mt-1 block text-sm text-cyan-200">{receipt.metrics.wave}</strong></div>
              <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Targets</span><strong className="mt-1 block text-sm text-emerald-200">{receipt.metrics.enemiesDefeated}</strong></div>
              <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Coins</span><strong className="mt-1 block text-sm text-yellow-200">{receipt.metrics.coinsCollected}</strong></div>
              <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Flight</span><strong className="mt-1 block text-sm text-white">{formatFlightTime(receipt.metrics.durationMs)}</strong></div>
            </div>
            <div className="relative flex items-center justify-between gap-3 border-t border-white/10 pt-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500">
              <span>{dateLabel}</span>
              <span>Verified mission data</span>
            </div>
          </div>

          {runClaimStatus !== 'confirmed' ? (
            <div className="mt-4 overflow-hidden rounded-[8px] border border-cyan-100/25 bg-[linear-gradient(135deg,rgba(8,47,73,0.72),rgba(6,78,59,0.34))] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="arcade-font text-base font-black uppercase tracking-wider text-white">
                    {needsBaseAccount ? 'Mint yours now' : 'Base Account ready'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold leading-relaxed text-cyan-100">
                    {needsBaseAccount
                      ? 'Keep this run onchain. New to Base? Sign in can create a passkey account; your global score stays saved either way.'
                      : 'Verify one wallet signature to attach this score to your account and unlock minting.'}
                  </p>
                </div>
                <span className="shrink-0 rounded-[5px] border border-white/20 bg-white/10 px-2 py-1 font-mono text-[8px] font-black uppercase tracking-[0.16em] text-white">
                  Onchain
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[9px] font-semibold text-slate-400">
                <span>Sign-in has no network fee. Minting may require a small Base network fee.</span>
                <a
                  href="https://docs.base.org/base-account/overview/what-is-base-account"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black uppercase tracking-wider text-cyan-200 underline decoration-cyan-200/40 underline-offset-2 hover:text-white"
                >
                  About Base Account
                </a>
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void shareRecord()} className="min-h-11 rounded-[8px] border border-cyan-100/25 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 transition hover:bg-cyan-300/20">Share score card</button>
            {runClaimStatus !== 'confirmed' ? (
              <button type="button" onClick={onAttachWallet} disabled={isClaimBusy} className="flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-emerald-100/40 bg-emerald-300/20 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 shadow-[0_0_24px_rgba(110,231,183,0.08)] transition hover:bg-emerald-300/30 disabled:opacity-60">
                {needsBaseAccount && !isClaimBusy ? <span aria-hidden="true" className="h-3 w-3 shrink-0 bg-white" /> : null}
                <span>
                  {runClaimStatus === 'signing'
                    ? 'Sign to verify score'
                    : runClaimStatus === 'connecting'
                      ? 'Opening Base...'
                      : needsBaseAccount
                        ? 'Sign in with Base'
                        : 'Verify this score'}
                </span>
              </button>
            ) : (
              <button type="button" onClick={onMint} disabled={!mintConfigured || mintStatus === 'authorizing' || mintStatus === 'confirming' || mintStatus === 'confirmed'} className="min-h-11 rounded-[8px] border border-yellow-100/30 bg-yellow-300/15 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 transition hover:bg-yellow-300/25 disabled:cursor-not-allowed disabled:opacity-55">
                {mintStatus === 'confirmed' ? 'Score Record minted' : mintStatus === 'authorizing' || mintStatus === 'confirming' ? 'Confirm in Base Account' : mintConfigured ? 'Mint score card' : 'Mint setup awaiting approval'}
              </button>
            )}
          </div>
          {shareStatus || runClaimMessage || mintMessage ? <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">{mintMessage || runClaimMessage || shareStatus}</p> : null}
          {mintHash ? <a href={`${explorerUrl}/tx/${mintHash}`} target="_blank" rel="noopener noreferrer" className="mt-2 block text-center text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200 underline underline-offset-2">View Score Record transaction</a> : null}
        </div>
      </div>
    </div>
  );
};

export default MissionRecordPreview;
