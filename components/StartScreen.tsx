import React, { useEffect, useMemo, useState } from 'react';
import { LeaderboardEntry } from '../types';
import {
  formatUsd,
  getResearchHubFundingProposals,
  ResearchHubProposal
} from '../services/researchHubProposals';

interface StartScreenProps {
  onStart: () => void;
  onAbout: () => void;
  leaderboard: LeaderboardEntry[];
  isLoading: boolean;
  onOpenReferral: () => void;
  onOpenFund: () => void;
  onOpenProposal: (url: string) => void;
  onOpenXProfile: () => void;
}

const getDaysUntilAllocation = () => {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
};

const getInitials = (name: string) => (
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'RH'
);

const StartScreen: React.FC<StartScreenProps> = ({
  onStart,
  onAbout,
  leaderboard,
  isLoading,
  onOpenReferral,
  onOpenFund,
  onOpenProposal,
  onOpenXProfile
}) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState({
    liked: '',
    change: '',
    disliked: ''
  });
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [activeProposalIndex, setActiveProposalIndex] = useState(0);
  const [isProposalFlipping, setIsProposalFlipping] = useState(false);
  const [proposals, setProposals] = useState<ResearchHubProposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const daysUntilAllocation = useMemo(getDaysUntilAllocation, []);
  const stackedProposals = useMemo(() => (
    proposals.length > 0 ? [0, 1, 2].slice(0, proposals.length).map((offset) => ({
      offset,
      proposal: proposals[(activeProposalIndex + offset) % proposals.length]
    })) : []
  ), [activeProposalIndex, proposals]);

  useEffect(() => {
    let isMounted = true;

    getResearchHubFundingProposals()
      .then((nextProposals) => {
        if (!isMounted) return;
        setProposals(nextProposals);
        setProposalStatus(nextProposals.length > 0 ? 'ready' : 'empty');
      })
      .catch((error) => {
        console.error('ResearchHub proposal feed failed:', error);
        if (!isMounted) return;
        setProposals([]);
        setProposalStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (proposals.length < 2) return undefined;

    let flipTimeout: number | undefined;
    const timer = window.setInterval(() => {
      setIsProposalFlipping(true);
      flipTimeout = window.setTimeout(() => {
        setActiveProposalIndex((index) => (index + 1) % proposals.length);
        setIsProposalFlipping(false);
      }, 640);
    }, 5600);

    return () => {
      window.clearInterval(timer);
      if (flipTimeout) window.clearTimeout(flipTimeout);
    };
  }, [proposals.length]);

  const handleSendFeedback = async () => {
    if (!feedback.liked && !feedback.change && !feedback.disliked) return;

    setIsSending(true);
    setSendStatus('idle');

    try {
      const response = await fetch('https://formsubmit.co/ajax/scottexplores29@gmail.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          _subject: 'SciCon Shooter Feedback',
          _template: 'table',
          'What they liked': feedback.liked || 'N/A',
          'Suggested Changes': feedback.change || 'N/A',
          'What they disliked': feedback.disliked || 'N/A'
        })
      });

      if (response.ok) {
        setSendStatus('success');
        setTimeout(() => {
          setShowFeedback(false);
          setFeedback({ liked: '', change: '', disliked: '' });
          setSendStatus('idle');
          setIsSending(false);
        }, 2000);
        return;
      }

      setSendStatus('error');
      setIsSending(false);
    } catch (error) {
      console.error('Feedback error:', error);
      setSendStatus('error');
      setIsSending(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 opacity-75" style={{ backgroundImage: 'url(/game-art/backgrounds/menu-hero.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.28),transparent_34%),radial-gradient(circle_at_90%_12%,rgba(34,197,94,0.12),transparent_30%),linear-gradient(180deg,rgba(5,8,22,0.42),rgba(5,8,22,0.98))]"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(226,232,240,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.035)_1px,transparent_1px)] bg-[size:36px_36px]"></div>

      <div className="relative z-10 mx-auto flex h-[100dvh] w-full max-w-6xl touch-pan-y flex-col gap-3 overflow-y-auto px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-14 custom-scrollbar sm:px-4 sm:pb-4 md:pt-4">
        <div className="flex min-h-[260px] shrink-0 flex-col gap-3 overflow-visible rounded-[26px] border border-white/10 bg-slate-950/72 p-3 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:min-h-[250px] sm:p-4 lg:min-h-[180px]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="arcade-font text-3xl font-black italic leading-none tracking-tight text-white sm:text-4xl">SCICON SHOOTER</div>
              <p className="mt-1 text-xs font-semibold text-slate-300 sm:text-sm">Upgrade with RSC. Fight bottlenecks. Steer funding credits.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 md:flex md:flex-wrap md:justify-end">
              <button onClick={onAbout} className="rh-nav-button">
                <span>Briefing</span>
              </button>
              <button onClick={onOpenReferral} className="rh-nav-button">
                <span>Join Hub</span>
              </button>
              <button onClick={onOpenFund} className="rh-nav-button">
                <span>Fund</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_122px] gap-3 sm:grid-cols-[minmax(0,1fr)_190px] lg:grid-cols-[1fr_260px]">
            <button
              onClick={onStart}
              className="group flex min-h-[74px] items-center justify-between rounded-[22px] border border-blue-300/25 bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-left shadow-[0_20px_46px_rgba(37,99,235,0.32)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_56px_rgba(37,99,235,0.44)]"
            >
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-100/80">Ready room</div>
                <div className="arcade-font mt-1 text-lg font-black uppercase tracking-wide text-white sm:text-2xl">Start Mission</div>
              </div>
              <div className="font-mono text-2xl font-black text-blue-100 transition group-hover:translate-x-1">
                GO
              </div>
            </button>

            <div className="rounded-[22px] border border-yellow-200/20 bg-white/[0.07] p-3 sm:p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-100/80">Monthly Allocation</div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="arcade-font text-3xl font-black text-white sm:text-4xl">{daysUntilAllocation}</div>
                <div className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-300 sm:text-xs">days left</div>
              </div>
              <p className="mt-2 hidden text-xs leading-relaxed text-slate-300 sm:block">Top pilots can nominate a ResearchHub proposal for Scott's funding-credit pick.</p>
            </div>
          </div>
        </div>

        <main className="grid shrink-0 gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="self-start rounded-[26px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Global Leaderboard</h3>
                <p className="text-[11px] font-semibold text-slate-400">Wallet-linked scores and RSC badges.</p>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100">Top 25</span>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/35">
              <div className="custom-scrollbar max-h-[250px] overflow-y-auto p-2 sm:max-h-[270px]">
                <div className="sticky top-0 z-10 mb-1 grid grid-cols-[42px_1fr_44px_72px] gap-2 rounded-xl bg-slate-950/92 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500 backdrop-blur">
                  <span>Rank</span>
                  <span>Pilot</span>
                  <span className="text-center">Wave</span>
                  <span className="text-right">Impact</span>
                </div>

                <div className="space-y-1">
                  {isLoading ? (
                    <div className="py-8 text-center text-xs font-semibold text-slate-500 animate-pulse">Scanning global archive...</div>
                  ) : leaderboard.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-red-300">No global scores yet. First pilot gets the clean lane.</div>
                  ) : (
                    leaderboard.slice(0, 25).map((entry, idx) => (
                      <div
                        key={`${entry.name}-${entry.score}-${entry.wave}-${idx}`}
                        className={`grid grid-cols-[42px_1fr_44px_72px] items-center gap-2 rounded-xl px-3 py-2 font-mono text-[11px] font-bold transition ${idx === 0 ? 'bg-yellow-200 text-slate-950 shadow-[0_0_0_1px_rgba(250,204,21,.45)]' : 'bg-white/[0.045] text-slate-200 hover:bg-white/[0.075]'}`}
                      >
                        <span className={idx === 0 ? 'text-slate-950' : 'text-slate-500'}>#{idx + 1}</span>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate">{entry.name}</span>
                          {entry.donated ? <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-white">RSC</span> : null}
                        </span>
                        <span className="text-center text-blue-200">{entry.wave || 1}</span>
                        <span className="text-right">{entry.score.toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-2 lg:min-h-0 lg:grid-rows-[1fr_auto]">
            <div className="overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Live Proposal Deck</h3>
                  <p className="text-[11px] font-semibold text-slate-400">Real open ResearchHub proposals pulled from the funding feed.</p>
                </div>
                <button onClick={onOpenFund} className="hidden rounded-full bg-white px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-blue-100 sm:inline-flex">
                  Open Fund
                </button>
              </div>

              <div className="relative mt-3 min-h-[286px] sm:min-h-[300px]">
                {proposalStatus === 'loading' ? (
                  <div className="absolute inset-x-0 top-0 rounded-[22px] border border-white/10 bg-white/[0.06] p-5 text-center text-sm font-bold text-slate-300">
                    Checking ResearchHub's live funding feed...
                  </div>
                ) : null}

                {proposalStatus === 'empty' || proposalStatus === 'error' ? (
                  <div className="absolute inset-x-0 top-0 rounded-[22px] border border-white/10 bg-white/[0.06] p-5 text-center">
                    <h4 className="text-sm font-black uppercase tracking-[0.14em] text-white">Live proposals unavailable</h4>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">
                      No sample proposal data is shown here. Open ResearchHub Fund to view the current proposals directly.
                    </p>
                    <button onClick={onOpenFund} className="mt-4 rounded-full bg-white px-5 py-2 text-xs font-black text-slate-950 transition hover:bg-blue-100">
                      Open ResearchHub Fund
                    </button>
                  </div>
                ) : null}

                {proposalStatus === 'ready' ? stackedProposals.map(({ proposal, offset }) => (
                  <article
                    key={proposal.id}
                    className={`absolute inset-x-0 top-0 will-change-transform rounded-[22px] border border-slate-200 bg-white p-3 text-slate-950 shadow-[0_22px_55px_rgba(0,0,0,0.42)] transition-[transform,opacity,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${offset > 0 ? 'pointer-events-none' : ''}`}
                    style={{
                      opacity: offset === 0 ? (isProposalFlipping ? 0.92 : 1) : offset === 1 ? 0.74 : 0.42,
                      filter: offset === 0 ? 'none' : `saturate(${1 - offset * 0.12}) blur(${offset * 0.15}px)`,
                      backfaceVisibility: 'hidden',
                      transformOrigin: 'center bottom',
                      transform: offset === 0
                        ? `perspective(1000px) translateY(${isProposalFlipping ? -12 : 0}px) rotateX(${isProposalFlipping ? -7 : 0}deg) scale(${isProposalFlipping ? 0.985 : 1})`
                        : `perspective(1000px) translateY(${offset * 20}px) rotateX(${offset * 1.5}deg) scale(${1 - offset * 0.05})`,
                      zIndex: 3 - offset
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-28 sm:w-28">
                        {proposal.imageUrl ? (
                          <img src={proposal.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-950 text-xl font-black text-white">
                            {getInitials(proposal.author)}
                          </div>
                        )}
                        {proposal.status ? (
                          <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-900">
                            {proposal.status}
                          </div>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-2 text-sm font-black leading-snug text-slate-950 sm:text-base">{proposal.title}</h4>
                        <div className="mt-3 min-w-0">
                          <div className="truncate text-xs font-black text-slate-950">{proposal.author}</div>
                          <div className="truncate text-[11px] font-semibold text-slate-500">{proposal.organization || 'ResearchHub proposal'}</div>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Requested</div>
                            <div className="font-mono text-sm font-black text-blue-600">{formatUsd(proposal.requestedUsd)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Raised</div>
                            <div className="font-mono text-sm font-black text-slate-950">{formatUsd(proposal.raisedUsd)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Review</div>
                            <div className="font-mono text-sm font-black text-slate-950">{proposal.peerReview?.toFixed(1) ?? 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-slate-600">
                      <div className="flex items-center gap-3 text-xs font-bold">
                        <span>Backers {proposal.backers}</span>
                        <span>Votes {proposal.votes}</span>
                        <span>Comments {proposal.comments}</span>
                      </div>
                      <button onClick={() => onOpenProposal(proposal.url)} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-blue-600">
                        View
                      </button>
                    </div>
                  </article>
                )) : null}
              </div>
            </div>

            <footer className="rounded-[22px] border border-white/10 bg-slate-950/68 p-3 text-xs leading-relaxed text-slate-300 backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-black text-white">About ResearchHub:</span> an open science platform for funding, publishing, peer review, and RSC-powered community rewards.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={onOpenXProfile} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-xs font-black text-white transition hover:border-blue-300/50 hover:bg-blue-500/15">
                    <span className="font-mono">X</span>
                    <span>@ScottExplores29</span>
                  </button>
                  <button onClick={() => setShowFeedback(true)} className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white px-4 py-2 text-xs font-black text-slate-950 transition hover:bg-blue-100">
                    Send feedback
                  </button>
                </div>
              </div>
            </footer>
          </section>
        </main>
      </div>

      {showFeedback ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.52)]">
            <div className="space-y-4 text-center">
              <h2 className="arcade-font text-xl font-bold tracking-widest text-white">WE WANT YOUR FEEDBACK</h2>

              <div className="space-y-3 text-left">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-blue-300">What did you like?</label>
                  <textarea value={feedback.liked} onChange={(e) => setFeedback({ ...feedback, liked: e.target.value })} className="w-full resize-none rounded-xl border border-white/10 bg-black/50 p-2 font-mono text-xs text-white outline-none focus:border-blue-400 disabled:opacity-50" rows={2} disabled={isSending} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-yellow-300">What would you change?</label>
                  <textarea value={feedback.change} onChange={(e) => setFeedback({ ...feedback, change: e.target.value })} className="w-full resize-none rounded-xl border border-white/10 bg-black/50 p-2 font-mono text-xs text-white outline-none focus:border-yellow-400 disabled:opacity-50" rows={2} disabled={isSending} />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-red-300">What did you dislike?</label>
                  <textarea value={feedback.disliked} onChange={(e) => setFeedback({ ...feedback, disliked: e.target.value })} className="w-full resize-none rounded-xl border border-white/10 bg-black/50 p-2 font-mono text-xs text-white outline-none focus:border-red-400 disabled:opacity-50" rows={2} disabled={isSending} />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <button onClick={handleSendFeedback} disabled={isSending || (!feedback.liked && !feedback.change && !feedback.disliked)} className={`scicon-btn flex w-full items-center justify-center gap-2 py-3 text-sm font-bold ${sendStatus === 'success' ? '!border-green-500 !bg-green-600' : ''}`}>
                  {sendStatus === 'idle' && !isSending ? <span>SEND FEEDBACK</span> : null}
                  {sendStatus === 'idle' && isSending ? <span className="animate-pulse">TRANSMITTING...</span> : null}
                  {sendStatus === 'success' ? <span className="animate-pulse">RECEIVED. THANK YOU.</span> : null}
                  {sendStatus === 'error' ? <span>ERROR. TRY AGAIN.</span> : null}
                </button>

                {!isSending ? (
                  <button onClick={() => setShowFeedback(false)} className="text-xs font-bold tracking-widest text-gray-500 underline hover:text-white">
                    CLOSE
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StartScreen;
