import React, { useMemo, useState } from 'react';
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
  const visualSeed = useMemo(() => (
    Array.from(receipt.runId).reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 17)
  ), [receipt.runId]);
  const finished = new Date(receipt.finishedAt);
  const dateLabel = Number.isFinite(finished.getTime())
    ? finished.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Verified run';
  const recordUrl = `${window.location.origin}/?record=${encodeURIComponent(receipt.runId)}`;
  const cardUrl = `${window.location.origin}/api/record-card?runId=${encodeURIComponent(receipt.runId)}`;
  const explorerUrl = mintChainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org';

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
    <div className="absolute inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/92 p-4 backdrop-blur-xl">
      <div className="relative w-full max-w-md overflow-hidden rounded-[8px] border border-cyan-200/35 bg-[#020817] shadow-[0_28px_100px_rgba(0,0,0,0.72),0_0_70px_rgba(34,211,238,0.12)]">
        <div className="pointer-events-none absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(34,211,238,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.035)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="relative border-b border-cyan-200/15 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300">Score Record Preview</p>
              <h2 className="arcade-font mt-1 text-xl font-black uppercase tracking-widest text-white">Run #{receipt.runId.slice(0, 8)}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close mission record" className="h-9 w-9 rounded-[6px] border border-white/12 bg-white/5 text-lg text-slate-300 transition hover:border-cyan-200/40 hover:text-white">x</button>
          </div>
        </div>

        <div className="relative p-5">
          <div className="relative overflow-hidden rounded-[8px] border border-cyan-100/25 bg-[radial-gradient(circle_at_50%_35%,rgba(34,211,238,0.22),transparent_34%),linear-gradient(145deg,#07152a,#020611_72%)] p-5">
            <div className="absolute -right-10 -top-12 h-44 w-44 rotate-12 border border-cyan-200/10" />
            <div className="flex items-center gap-4">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-[8px] border border-cyan-200/20 bg-cyan-300/8">
                <div className="absolute inset-x-2 bottom-2 h-7 rounded-full bg-cyan-300/20 blur-md" />
                <img src={ASSETS.PLAYER_SHIP} alt="ResearchHub flask ship" className="relative h-20 w-20 object-contain drop-shadow-[0_12px_18px_rgba(34,211,238,0.38)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Verified arcade run</p>
                <p className="mt-1 truncate text-lg font-black uppercase text-white">{pilotName || 'Pilot'}</p>
                <p className="mt-1 font-mono text-[10px] uppercase text-slate-400">{shortAddress(walletAddress)}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 border-y border-white/10 py-4 text-center">
              <div><span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Score</span><strong className="mt-1 block text-xl text-white">{receipt.metrics.score.toLocaleString()}</strong></div>
              <div className="border-x border-white/10"><span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Wave</span><strong className="mt-1 block text-xl text-cyan-200">{receipt.metrics.wave}</strong></div>
              <div><span className="block text-[9px] font-black uppercase tracking-wider text-slate-500">Seed</span><strong className="mt-1 block text-sm text-yellow-200">{visualSeed.toString(16).toUpperCase().slice(0, 6)}</strong></div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-400">
              <span>{dateLabel}</span>
              <span>Game {receipt.gameVersion}</span>
            </div>
          </div>

          <div className="mt-4 rounded-[8px] border border-emerald-200/15 bg-emerald-300/8 px-3 py-2 text-[10px] font-semibold leading-relaxed text-emerald-50/80">
            Global score submission stays free and wallet-optional. This collectible records one run; only a finalized Champion Record can include a selected research proposal.
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => void shareRecord()} className="rounded-[8px] border border-cyan-100/25 bg-cyan-300/10 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-cyan-50 transition hover:bg-cyan-300/20">Share score card</button>
            {runClaimStatus !== 'confirmed' ? (
              <button type="button" onClick={onAttachWallet} disabled={runClaimStatus === 'connecting' || runClaimStatus === 'signing'} className="rounded-[8px] border border-emerald-100/30 bg-emerald-300/15 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-50 transition hover:bg-emerald-300/25 disabled:opacity-60">
                {runClaimStatus === 'signing' ? 'Sign message' : runClaimStatus === 'connecting' ? 'Connecting...' : 'Verify wallet to mint'}
              </button>
            ) : (
              <button type="button" onClick={onMint} disabled={!mintConfigured || mintStatus === 'authorizing' || mintStatus === 'confirming' || mintStatus === 'confirmed'} className="rounded-[8px] border border-yellow-100/30 bg-yellow-300/15 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-yellow-50 transition hover:bg-yellow-300/25 disabled:cursor-not-allowed disabled:opacity-55">
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
