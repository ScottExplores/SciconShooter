import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArchivedWinner, LeaderboardEntry } from '../types';
import {
  formatUsd,
  ResearchHubProposal
} from '../services/researchHubProposals';
import {
  formatRscPrice,
  getKarmaMarketPrice,
  getRscMarketPrice,
  RscMarketPrice
} from '../services/rscMarket';
import { ASSETS, DONATION_CONFIG } from '../constants';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';

interface StartScreenProps {
  onStart: () => void;
  allTimeLeaderboard: LeaderboardEntry[];
  monthlyLeaderboard: LeaderboardEntry[];
  archivedWinners: ArchivedWinner[];
  isLoading: boolean;
  proposals: ResearchHubProposal[];
  proposalStatus: ProposalFeedStatus;
  onOpenReferral: () => void;
  onOpenFund: () => void;
  onOpenProposal: (url: string) => void;
  onOpenXProfile: () => void;
  onOpenTreasurySend: () => void;
}

type LeaderboardView = 'weekly' | 'allTime' | 'pastPicks';

const getWeeklyAllocationMeta = () => {
  const now = new Date();
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + daysUntilSunday);

  return {
    daysLeft: daysUntilSunday,
    endLabel: weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    allocationRsc: 100
  };
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
  allTimeLeaderboard,
  monthlyLeaderboard,
  archivedWinners,
  isLoading,
  proposals,
  proposalStatus,
  onOpenReferral,
  onOpenFund,
  onOpenProposal,
  onOpenXProfile,
  onOpenTreasurySend
}) => {
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTreasury, setShowTreasury] = useState(false);
  const [treasuryCopyStatus, setTreasuryCopyStatus] = useState<'idle' | 'copied' | 'selected' | 'error'>('idle');
  const [feedback, setFeedback] = useState({
    liked: '',
    change: '',
    disliked: ''
  });
  const [isSending, setIsSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [activeProposalIndex, setActiveProposalIndex] = useState(0);
  const [isProposalFlipping, setIsProposalFlipping] = useState(false);
  const [expandedFundingKey, setExpandedFundingKey] = useState<string | null>(null);
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>('weekly');
  const [showAllocationAmount, setShowAllocationAmount] = useState(false);
  const [rscMarketPrice, setRscMarketPrice] = useState<RscMarketPrice | null>(null);
  const [karmaMarketPrice, setKarmaMarketPrice] = useState<RscMarketPrice | null>(null);
  const [rscPriceStatus, setRscPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [karmaPriceStatus, setKarmaPriceStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [showAllocationInfo, setShowAllocationInfo] = useState(false);
  const treasuryAddressRef = useRef<HTMLInputElement | null>(null);
  const proposalFlipTimeoutRef = useRef<number | undefined>(undefined);
  const proposalSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const weeklyAllocation = useMemo(getWeeklyAllocationMeta, []);
  const visibleLeaderboard = leaderboardView === 'weekly'
    ? monthlyLeaderboard.slice(0, 5)
    : allTimeLeaderboard.slice(0, 25);
  const weeklyChampion = monthlyLeaderboard[0];
  const weeklyChampionProposal = weeklyChampion?.proposalTitle ? {
    id: weeklyChampion.proposalId,
    title: weeklyChampion.proposalTitle,
    url: weeklyChampion.proposalUrl,
    author: weeklyChampion.proposalAuthor,
    pilot: weeklyChampion.name
  } : null;
  const weeklyChampionLiveProposal = weeklyChampionProposal
    ? proposals.find((proposal) => proposal.id === weeklyChampionProposal.id || proposal.title === weeklyChampionProposal.title)
    : undefined;
  const championCard = weeklyChampionProposal ? {
    title: weeklyChampionLiveProposal?.title || weeklyChampionProposal.title,
    url: weeklyChampionLiveProposal?.url || weeklyChampionProposal.url,
    author: weeklyChampionLiveProposal?.author || weeklyChampionProposal.author || 'ResearchHub proposal',
    organization: weeklyChampionLiveProposal?.organization,
    imageUrl: weeklyChampionLiveProposal?.imageUrl,
    status: weeklyChampionLiveProposal?.status
  } : null;
  const pastPicks = useMemo(() => {
    const fallbackPicks = allTimeLeaderboard
      .filter((entry) => Boolean(entry.proposalTitle))
      .filter((entry) => !(weeklyChampion
        && entry.name === weeklyChampion.name
        && entry.score === weeklyChampion.score
        && entry.date === weeklyChampion.date))
      .map((entry): ArchivedWinner => {
        const scoreDate = entry.date ? new Date(entry.date) : null;
        const periodLabel = scoreDate && Number.isFinite(scoreDate.getTime())
          ? scoreDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : 'Past run';

        return {
          periodKey: `${entry.name}-${entry.score}-${entry.date || entry.proposalTitle}`,
          periodLabel,
          winnerName: entry.name,
          score: entry.score,
          wave: entry.wave || 1,
          scoreDate: entry.date,
          proposalId: entry.proposalId,
          proposalTitle: entry.proposalTitle,
          proposalUrl: entry.proposalUrl,
          proposalAuthor: entry.proposalAuthor,
          allocationRsc: 100
        };
      });
    const seen = new Set<string>();

    return [...archivedWinners, ...fallbackPicks]
      .filter((pick) => Boolean(pick.proposalTitle))
      .filter((pick) => {
        const key = `${pick.periodKey}-${pick.winnerName}-${pick.proposalTitle}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  }, [allTimeLeaderboard, archivedWinners, weeklyChampion]);
  const leaderboardTitle = leaderboardView === 'weekly'
    ? 'Weekly Leaderboard'
    : leaderboardView === 'allTime'
      ? 'All-Time Leaderboard'
      : 'Past Picks';
  const leaderboardCopy = leaderboardView === 'weekly'
    ? 'Top 5 resets each week.'
    : leaderboardView === 'allTime'
      ? 'Top 25 archive across every mission.'
      : 'Previous winning pilots and their proposal choices.';
  const isChampionProposal = (proposal: ResearchHubProposal) => Boolean(weeklyChampionProposal)
    && (proposal.id === weeklyChampionProposal?.id || proposal.title === weeklyChampionProposal?.title);
  const stackedProposals = useMemo(() => (
    proposals.length > 0 ? [0, 1, 2].slice(0, proposals.length).map((offset) => ({
      offset,
      proposal: proposals[(activeProposalIndex + offset) % proposals.length]
    })) : []
  ), [activeProposalIndex, proposals]);
  const moveProposalDeck = (direction: 1 | -1) => {
    if (proposals.length < 2) return;

    if (proposalFlipTimeoutRef.current) {
      window.clearTimeout(proposalFlipTimeoutRef.current);
    }

    setIsProposalFlipping(true);
    proposalFlipTimeoutRef.current = window.setTimeout(() => {
      setActiveProposalIndex((index) => (index + direction + proposals.length) % proposals.length);
      setIsProposalFlipping(false);
      proposalFlipTimeoutRef.current = undefined;
    }, 260);
  };

  const handleProposalTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    proposalSwipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleProposalTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = proposalSwipeStartRef.current;
    const touch = event.changedTouches[0];
    proposalSwipeStartRef.current = null;

    if (!start || !touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const isHorizontalSwipe = Math.abs(deltaX) > 44 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (!isHorizontalSwipe) return;

    moveProposalDeck(deltaX < 0 ? 1 : -1);
  };

  useEffect(() => {
    if (proposals.length < 2) return undefined;

    const timer = window.setInterval(() => {
      if (proposalFlipTimeoutRef.current) {
        window.clearTimeout(proposalFlipTimeoutRef.current);
      }

      setIsProposalFlipping(true);
      proposalFlipTimeoutRef.current = window.setTimeout(() => {
        setActiveProposalIndex((index) => (index + 1) % proposals.length);
        setIsProposalFlipping(false);
        proposalFlipTimeoutRef.current = undefined;
      }, 640);
    }, 6800);

    return () => {
      window.clearInterval(timer);
      if (proposalFlipTimeoutRef.current) {
        window.clearTimeout(proposalFlipTimeoutRef.current);
        proposalFlipTimeoutRef.current = undefined;
      }
    };
  }, [proposals.length]);

  useEffect(() => () => {
    if (proposalFlipTimeoutRef.current) {
      window.clearTimeout(proposalFlipTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMarketPrices = async () => {
      try {
        const [rscPrice, karmaPrice] = await Promise.allSettled([
          getRscMarketPrice(),
          getKarmaMarketPrice()
        ]);

        if (!isMounted) return;

        if (rscPrice.status === 'fulfilled') {
          setRscMarketPrice(rscPrice.value);
          setRscPriceStatus('ready');
        } else {
          console.error('RSC price error:', rscPrice.reason);
          setRscPriceStatus('error');
        }

        if (karmaPrice.status === 'fulfilled') {
          setKarmaMarketPrice(karmaPrice.value);
          setKarmaPriceStatus('ready');
        } else {
          console.error('KRMA price error:', karmaPrice.reason);
          setKarmaPriceStatus('error');
        }
      } catch (error) {
        console.error('Market price error:', error);
        if (!isMounted) return;
        setRscPriceStatus('error');
        setKarmaPriceStatus('error');
      }
    };

    loadMarketPrices();
    const timer = window.setInterval(loadMarketPrices, 120000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setShowAllocationAmount((value) => !value);
    }, 4200);

    return () => window.clearInterval(timer);
  }, []);

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

  const selectTreasuryAddress = () => {
    const input = treasuryAddressRef.current;
    if (!input) return false;

    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    return true;
  };

  const copyTextWithFallback = async (text: string): Promise<'copied' | 'selected' | 'error'> => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return 'copied';
      } catch {
        // Some mobile/in-app browsers block this API even on secure origins.
      }
    }

    const selectedVisibleAddress = selectTreasuryAddress();
    if (selectedVisibleAddress) {
      try {
        if (document.execCommand('copy')) {
          return 'copied';
        }
      } catch {
        // Keep the selected address as a manual fallback.
      }

      return 'selected';
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);

    try {
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      return document.execCommand('copy') ? 'copied' : 'error';
    } catch {
      return 'error';
    } finally {
      document.body.removeChild(textarea);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleCopyTreasuryAddress = async () => {
    const copyResult = await copyTextWithFallback(DONATION_CONFIG.RECIPIENT_ADDRESS);

    if (copyResult !== 'error') {
      setTreasuryCopyStatus(copyResult);
      window.setTimeout(() => setTreasuryCopyStatus('idle'), copyResult === 'copied' ? 1800 : 2600);
      return;
    }

    setTreasuryCopyStatus('error');
    window.setTimeout(() => setTreasuryCopyStatus('idle'), 2400);
  };

  return (
    <div className="absolute inset-0 z-10 overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 opacity-75" style={{ backgroundImage: 'url(/game-art/backgrounds/menu-hero.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(37,99,235,0.28),transparent_34%),radial-gradient(circle_at_90%_12%,rgba(34,197,94,0.12),transparent_30%),linear-gradient(180deg,rgba(5,8,22,0.42),rgba(5,8,22,0.98))]"></div>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(226,232,240,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.035)_1px,transparent_1px)] bg-[size:36px_36px]"></div>

      <div className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex max-w-[calc(100%-8rem)] items-center gap-1.5 overflow-x-auto pr-1">
        <a
          href={rscMarketPrice?.sourceUrl || DONATION_CONFIG.RSC_SWAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-200/25 bg-black/72 px-2.5 py-1.5 font-mono text-white shadow-[0_0_28px_rgba(34,211,238,0.16)] backdrop-blur-md transition hover:border-cyan-100"
          aria-label="ResearchCoin market price"
        >
          <img src={ASSETS.REAL_RSC_ICON} alt="" className="h-6 w-6 rounded-full border border-white/15 bg-white" />
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100">RSC</span>
          <span className="text-xs font-black text-white">
            {rscPriceStatus === 'loading' ? '...' : rscPriceStatus === 'error' ? '--' : formatRscPrice(rscMarketPrice?.priceUsd)}
          </span>
        </a>

        <a
          href={DONATION_CONFIG.KARMA_SWAP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-purple-200/28 bg-black/72 px-2.5 py-1.5 font-mono text-white shadow-[0_0_28px_rgba(168,85,247,0.18)] backdrop-blur-md transition hover:border-purple-100"
          aria-label="KARMA market price"
        >
          <img src={ASSETS.KARMA_TOKEN} alt="" className="h-6 w-6 rounded-full border border-purple-100/40 bg-slate-950 object-cover" />
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-purple-100">KRMA</span>
          <span className="text-xs font-black text-white">
            {karmaPriceStatus === 'loading' ? '...' : karmaPriceStatus === 'error' ? '--' : formatRscPrice(karmaMarketPrice?.priceUsd)}
          </span>
        </a>
      </div>

      <div className="relative z-10 mx-auto flex h-[100dvh] w-full max-w-6xl touch-pan-y flex-col gap-3 overflow-y-auto px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-14 custom-scrollbar sm:px-4 sm:pb-4 md:pt-4">
        <div className="relative z-30 flex min-h-[260px] shrink-0 flex-col gap-3 overflow-visible rounded-[26px] border border-white/10 bg-slate-950/72 p-3 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:min-h-[250px] sm:p-4 lg:min-h-[180px]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="scicon-logo-lockup" aria-label="SCICON SHOOTER">
                <span className="scicon-logo-word" data-text="SCICON">SCICON</span>
                <span className="scicon-logo-word scicon-logo-word--sub" data-text="SHOOTER">SHOOTER</span>
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-300 sm:text-sm">Upgrade with RSC. Fight bottlenecks. Steer funding credits.</p>
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_148px] gap-2 min-[420px]:grid-cols-[minmax(0,1fr)_160px] sm:grid-cols-[minmax(0,1fr)_190px] sm:gap-3 lg:grid-cols-[1fr_260px]">
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

            <div className="relative z-40 overflow-visible rounded-[22px] border border-yellow-200/20 bg-white/[0.07] p-2.5 sm:p-4">
              <div className="flex items-start justify-between gap-1.5">
                <div className="max-w-[86px] text-[8px] font-black uppercase leading-tight tracking-[0.16em] text-yellow-100/80 min-[420px]:max-w-none min-[420px]:text-[9px] sm:text-[10px] sm:tracking-[0.22em]">Weekly Allocation</div>
                <button
                  type="button"
                  onClick={() => setShowAllocationInfo((value) => !value)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-yellow-100/35 bg-yellow-200/15 text-[10px] font-black text-yellow-100 transition hover:border-yellow-100/60 hover:bg-yellow-200/20 sm:h-7 sm:w-7 sm:text-[11px]"
                  aria-expanded={showAllocationInfo}
                  aria-label="Weekly allocation information"
                >
                  i
                </button>
              </div>
              <div className="relative mt-2 min-h-[76px] overflow-hidden">
                <div className={`absolute inset-0 flex items-end justify-between gap-3 transition-all duration-500 ${showAllocationAmount ? '-translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}>
                  <div className="arcade-font text-3xl font-black text-white sm:text-4xl">{weeklyAllocation.daysLeft}</div>
                  <div className="pb-1 text-right text-[9px] font-semibold uppercase leading-tight tracking-wide text-slate-300 sm:text-xs">
                    days to<br />{weeklyAllocation.endLabel}
                  </div>
                </div>
                <div className={`absolute inset-0 flex items-center justify-center text-center transition-all duration-500 ${showAllocationAmount ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
                  <div>
                    <div className="arcade-font text-2xl font-black leading-none text-white min-[420px]:text-3xl sm:text-4xl">{weeklyAllocation.allocationRsc}</div>
                    <div className="mt-1 text-[11px] font-black uppercase leading-none tracking-[0.18em] text-emerald-100 drop-shadow-[0_0_10px_rgba(16,185,129,0.45)] sm:text-[13px] sm:tracking-[0.24em]">RSC</div>
                    <div className="mt-1 text-[8px] font-black uppercase leading-[0.95] tracking-[0.13em] text-emerald-50 sm:text-[9px] sm:tracking-[0.16em]">
                      Funding<br />Credits
                    </div>
                  </div>
                </div>
              </div>
              {showAllocationInfo ? (
                <div className="absolute right-0 top-11 z-[200] w-[min(246px,calc(100vw-1.5rem))] rounded-2xl border border-yellow-100/35 bg-[#020617] p-3 text-xs font-semibold leading-relaxed text-slate-100 shadow-[0_18px_55px_rgba(0,0,0,0.8)] ring-1 ring-black/80">
                  The weekly No. 1 pilot chooses the ResearchHub proposal pick for the 100 RSC funding-credit signal.
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <main className="relative z-0 grid shrink-0 gap-3 lg:grid-cols-[0.92fr_1.08fr]">
          <section className="self-start rounded-[26px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">
                  {leaderboardTitle}
                </h3>
                <p className="text-[11px] font-semibold text-slate-400">
                  {leaderboardCopy}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Past proposal picks"
                  onClick={() => setLeaderboardView('pastPicks')}
                  className={`rounded-full border px-3 py-2 text-center text-[9px] font-black uppercase tracking-[0.13em] transition ${leaderboardView === 'pastPicks' ? 'border-yellow-100 bg-yellow-200 text-slate-950' : 'border-white/10 bg-black/25 text-slate-400 hover:text-white'}`}
                >
                  Past<br />Picks
                </button>
                <div className="flex rounded-full border border-white/10 bg-black/25 p-1">
                  <button
                    type="button"
                    aria-label="Weekly Top 5"
                    onClick={() => setLeaderboardView('weekly')}
                    className={`flex min-w-[64px] flex-col items-center rounded-full px-3 py-1 text-center font-black uppercase transition ${leaderboardView === 'weekly' ? 'bg-emerald-300 text-slate-950' : 'text-slate-400 hover:text-white'}`}
                  >
                    <span className="text-[7px] tracking-[0.16em] opacity-80">Weekly</span>
                    <span className="text-[9px] tracking-[0.12em]">Top 5</span>
                  </button>
                  <button
                    type="button"
                    aria-label="All Time Top 25"
                    onClick={() => setLeaderboardView('allTime')}
                    className={`flex min-w-[64px] flex-col items-center rounded-full px-3 py-1 text-center font-black uppercase transition ${leaderboardView === 'allTime' ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'}`}
                  >
                    <span className="text-[7px] tracking-[0.16em] opacity-80">All Time</span>
                    <span className="text-[9px] tracking-[0.12em]">Top 25</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/10 bg-black/35">
              {leaderboardView === 'pastPicks' ? (
                <div className="custom-scrollbar max-h-[250px] space-y-2 overflow-y-auto p-2 sm:max-h-[270px]">
                  {pastPicks.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-slate-500">
                      No archived proposal picks yet. The first weekly champion pick will appear here after it is saved.
                    </div>
                  ) : (
                    pastPicks.map((pick) => (
                      <article
                        key={`${pick.periodKey}-${pick.winnerName}-${pick.proposalTitle}`}
                        className="rounded-2xl border border-yellow-100/15 bg-white/[0.055] p-3 text-left shadow-[0_14px_34px_rgba(0,0,0,0.18)]"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-yellow-100">{pick.periodLabel}</div>
                            <div className="mt-1 truncate font-mono text-xs font-black uppercase text-white">{pick.winnerName}</div>
                          </div>
                          <div className="shrink-0 rounded-full border border-emerald-200/25 bg-emerald-300/12 px-2.5 py-1 text-center">
                            <div className="font-mono text-[10px] font-black text-emerald-100">{pick.allocationRsc || 100} RSC</div>
                            <div className="text-[7px] font-black uppercase tracking-[0.14em] text-emerald-100/70">signal</div>
                          </div>
                        </div>
                        <h4 className="line-clamp-2 text-sm font-black leading-snug text-slate-100">{pick.proposalTitle}</h4>
                        <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-black/25 p-2 font-mono text-[9px] font-bold uppercase tracking-wide text-slate-400">
                          <span>Impact <strong className="block text-[11px] text-white">{pick.score.toLocaleString()}</strong></span>
                          <span>Wave <strong className="block text-[11px] text-blue-200">{pick.wave}</strong></span>
                          <span>Lead <strong className="block truncate text-[11px] text-yellow-100">{pick.proposalAuthor || 'ResearchHub'}</strong></span>
                        </div>
                        {pick.proposalUrl ? (
                          <button
                            type="button"
                            onClick={() => onOpenProposal(pick.proposalUrl!)}
                            className="mt-2 w-full rounded-xl bg-yellow-200 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-white"
                          >
                            View Pick
                          </button>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              ) : (
              <div className="custom-scrollbar max-h-[250px] overflow-y-auto p-2 sm:max-h-[270px]">
                <div className="sticky top-0 z-10 mb-1 grid grid-cols-[34px_minmax(0,1fr)_36px_64px] gap-1.5 rounded-xl bg-slate-950/92 px-2 py-2 font-mono text-[8px] uppercase tracking-[0.12em] text-slate-500 backdrop-blur sm:grid-cols-[42px_minmax(0,1fr)_44px_72px] sm:gap-2 sm:px-3 sm:text-[9px]">
                  <span>Rank</span>
                  <span>Pilot</span>
                  <span className="text-center">Wave</span>
                  <span className="text-right">Impact</span>
                </div>

                <div className="space-y-1">
                  {isLoading ? (
                    <div className="py-8 text-center text-xs font-semibold text-slate-500 animate-pulse">Scanning leaderboard archive...</div>
                  ) : visibleLeaderboard.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-red-300">
                      {leaderboardView === 'weekly' ? 'No weekly scores yet. First pilot claims the pick.' : 'No global scores yet. First pilot gets the clean lane.'}
                    </div>
                  ) : (
                    visibleLeaderboard.map((entry, idx) => {
                      const entryKey = `${entry.name}-${entry.score}-${entry.wave}-${entry.date || idx}`;
                      const isCurrentWeeklyChampion = leaderboardView === 'weekly' && idx === 0;
                      const hasRscPick = isCurrentWeeklyChampion && Boolean(championCard);
                      const isExpanded = expandedFundingKey === entryKey;
                      const fundingTitle = championCard?.title || entry.proposalTitle || 'No proposal selected';
                      const title = hasRscPick ? `${entry.name} picked: ${fundingTitle}` : undefined;

                      return (
                        <div
                          key={entryKey}
                          title={title}
                          onClick={() => hasRscPick && setExpandedFundingKey(isExpanded ? null : entryKey)}
                          className={`grid grid-cols-[34px_minmax(0,1fr)_36px_64px] items-center gap-1.5 rounded-xl px-2 py-2 font-mono text-[10px] font-bold transition sm:grid-cols-[42px_minmax(0,1fr)_44px_72px] sm:gap-2 sm:px-3 sm:text-[11px] ${hasRscPick ? 'cursor-pointer' : ''} ${idx === 0 ? 'bg-yellow-200 text-slate-950 shadow-[0_0_0_1px_rgba(250,204,21,.45)]' : 'bg-white/[0.045] text-slate-200 hover:bg-white/[0.075]'}`}
                        >
                          <span className={idx === 0 ? 'text-slate-950' : 'text-slate-500'}>#{idx + 1}</span>
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{entry.name}</span>
                            {entry.donated ? <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-white">RSC</span> : null}
                            {hasRscPick ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedFundingKey(isExpanded ? null : entryKey);
                                }}
                                className="shrink-0 rounded-full bg-slate-950/10 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-slate-900 transition hover:bg-slate-950/20"
                              >
                                RSC Pick
                              </button>
                            ) : null}
                          </span>
                          <span className="text-center text-blue-200">{entry.wave || 1}</span>
                          <span className="text-right">{entry.score.toLocaleString()}</span>

                          {hasRscPick && isExpanded && championCard ? (
                            <article className="col-span-4 mt-1 rounded-2xl border border-slate-950/15 bg-white p-2 text-left tracking-normal text-slate-950 shadow-[0_14px_30px_rgba(0,0,0,0.16)]">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="rounded-full bg-yellow-200 px-2 py-1 text-[8px] font-black uppercase tracking-[0.12em]">No. 1 RSC Pick</span>
                                <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">100 RSC allocation</span>
                              </div>
                              <div className="flex gap-2">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                  {championCard.imageUrl ? (
                                    <img src={championCard.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-slate-950 text-sm font-black text-white">
                                      {getInitials(championCard.author)}
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h5 className="line-clamp-2 font-sans text-xs font-black leading-snug">{fundingTitle}</h5>
                                  <div className="mt-1 truncate font-sans text-[10px] font-semibold text-slate-500">{championCard.author}</div>
                                  {weeklyChampionLiveProposal ? (
                                    <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-2 font-sans text-[8px] font-bold uppercase tracking-wide text-slate-500">
                                      <span>Ask <strong className="block font-mono text-[10px] text-blue-600">{formatUsd(weeklyChampionLiveProposal.requestedUsd)}</strong></span>
                                      <span>Raised <strong className="block font-mono text-[10px] text-slate-950">{formatUsd(weeklyChampionLiveProposal.raisedUsd)}</strong></span>
                                      <span>Review <strong className="block font-mono text-[10px] text-slate-950">{weeklyChampionLiveProposal.peerReview?.toFixed(1) ?? 'N/A'}</strong></span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={!championCard.url}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (championCard.url) onOpenProposal(championCard.url);
                                }}
                                className="mt-2 w-full rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
                              >
                                View Proposal
                              </button>
                            </article>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              )}
            </div>

          </section>

          <section className="grid gap-2 lg:min-h-0 lg:grid-rows-[1fr_auto]">
            <div className="overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/70 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white">Live Proposal Deck</h3>
                  <p className="text-[11px] font-semibold text-slate-400">Swipe through real ResearchHub funding proposals.</p>
                </div>
                {proposalStatus === 'ready' && proposals.length > 1 ? (
                  <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/25 p-1">
                    <button
                      type="button"
                      onClick={() => moveProposalDeck(-1)}
                      className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-black text-white transition hover:border-cyan-200/40 hover:bg-cyan-300/15"
                      aria-label="Previous proposal"
                    >
                      &lt;
                    </button>
                    <button
                      type="button"
                      onClick={() => moveProposalDeck(1)}
                      className="grid h-8 w-8 place-items-center rounded-full border border-cyan-200/30 bg-cyan-300/14 text-sm font-black text-cyan-50 transition hover:border-cyan-100 hover:bg-cyan-300/24"
                      aria-label="Next proposal"
                    >
                      &gt;
                    </button>
                  </div>
                ) : null}
              </div>

              <div
                className="relative mt-3 min-h-[286px] touch-pan-y sm:min-h-[300px]"
                onTouchStart={handleProposalTouchStart}
                onTouchEnd={handleProposalTouchEnd}
                aria-label="Swipe left or right to browse live proposals"
              >
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

                {proposalStatus === 'ready' ? stackedProposals.map(({ proposal, offset }) => {
                  const isWeeklyPick = isChampionProposal(proposal);

                  return (
                  <article
                    key={proposal.id}
                    className={`absolute inset-x-0 top-0 will-change-transform rounded-[22px] border bg-white p-3 text-slate-950 shadow-[0_22px_55px_rgba(0,0,0,0.42)] transition-[transform,opacity,filter] duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isWeeklyPick ? 'border-yellow-300 ring-2 ring-yellow-200/60' : 'border-slate-200'} ${offset > 0 ? 'pointer-events-none' : ''}`}
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
                    {isWeeklyPick ? (
                      <div className="absolute right-3 top-3 z-10 rounded-full border border-yellow-300 bg-yellow-200 px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-950 shadow-[0_10px_22px_rgba(250,204,21,0.3)]">
                        No. 1 Pick
                      </div>
                    ) : null}
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
                  );
                }) : null}
              </div>

              {proposalStatus === 'ready' && proposals.length > 1 ? (
                <div className="mt-2 flex items-center justify-between gap-3 px-1">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-cyan-100/70">Swipe deck</div>
                  <div className="flex max-w-[70%] items-center justify-end gap-1 overflow-hidden">
                    {proposals.slice(0, 8).map((proposal, index) => (
                      <button
                        key={proposal.id}
                        type="button"
                        onClick={() => {
                          if (index === activeProposalIndex) return;
                          setActiveProposalIndex(index);
                        }}
                        className={`h-2 rounded-full transition-all ${index === activeProposalIndex ? 'w-6 bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,0.45)]' : 'w-2 bg-white/20 hover:bg-white/45'}`}
                        aria-label={`Go to proposal ${index + 1}`}
                      />
                    ))}
                    {proposals.length > 8 ? (
                      <span className="ml-1 text-[9px] font-black text-slate-500">+{proposals.length - 8}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-[22px] border border-white/10 bg-slate-950/68 p-3 backdrop-blur-xl">
              <button onClick={onOpenReferral} className="rh-nav-button">
                <span>Join Research Hub</span>
              </button>
              <button onClick={onOpenFund} className="rh-nav-button">
                <span>Fund Proposals</span>
              </button>
            </div>

            <footer className="rounded-[22px] border border-white/10 bg-slate-950/68 p-3 text-xs leading-relaxed text-slate-300 backdrop-blur-xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-black text-white">About ResearchHub:</span> an open science platform for funding, publishing, peer review, and RSC-powered community rewards.
                </p>
                <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
                  <button onClick={onOpenXProfile} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-2 text-[10px] font-black text-white transition hover:border-blue-300/50 hover:bg-blue-500/15 sm:flex-none sm:gap-2 sm:px-4 sm:text-xs">
                    <span className="font-mono">X</span>
                    <span className="truncate">@ScottExplores29</span>
                  </button>
                  <button onClick={() => setShowTreasury(true)} className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/15 px-2.5 py-2 text-[10px] font-black text-emerald-100 transition hover:border-emerald-200/45 hover:bg-emerald-300/25 sm:flex-none sm:px-4 sm:text-xs">
                    Treasury
                  </button>
                  <button onClick={() => setShowFeedback(true)} className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full border border-white/10 bg-white px-2.5 py-2 text-[10px] font-black text-slate-950 transition hover:bg-blue-100 sm:flex-none sm:px-4 sm:text-xs">
                    Feedback
                  </button>
                </div>
              </div>
            </footer>

            <a
              href={DONATION_CONFIG.KARMA_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-[22px] border border-purple-200/20 bg-purple-300/10 p-3 text-xs font-semibold leading-relaxed text-purple-100 shadow-[0_14px_40px_rgba(88,28,135,0.18)] backdrop-blur-xl transition hover:border-purple-100/45 hover:bg-purple-300/15"
            >
              <img src={ASSETS.KARMA_TOKEN} alt="" className="h-10 w-10 shrink-0 rounded-full border border-purple-200/35 bg-slate-950 object-cover" />
              <span>
                <span className="font-black text-white">KARMA promo:</span> SciCon Shooter has partnered with KARMA for a limited promotional period, so charity-focused KRMA credits and the KARMA beam power-up are live.
              </span>
            </a>

            <a
              href={DONATION_CONFIG.KARMA_SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="overflow-hidden rounded-[18px] border border-purple-200/18 bg-purple-300/10 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-purple-100 shadow-[0_14px_40px_rgba(88,28,135,0.22)] backdrop-blur-xl"
            >
              <div className="scicon-promo-ticker-track flex w-max items-center gap-10 whitespace-nowrap px-4">
                <span className="inline-flex items-center gap-2"><img src={ASSETS.KARMA_TOKEN} alt="" className="h-5 w-5 rounded-full border border-purple-200/35 object-cover" /> KARMA x SciCon Shooter promo power-up is live</span>
                <span>Promotion: SciCon Shooter has partnered with KARMA for a limited KRMA credit period</span>
                <span>KRMA is on BNB Smart Chain</span>
                <span>KARMA frames its mission around charity, reflections, and community rewards</span>
                <span>1 KRMA = 100 wallet-linked mission credits during the promo</span>
                <span className="inline-flex items-center gap-2"><img src={ASSETS.KARMA_TOKEN} alt="" className="h-5 w-5 rounded-full border border-purple-200/35 object-cover" /> Collect the KARMA token drop in-game to fire the beam</span>
                <span>Promotion: SciCon Shooter has partnered with KARMA for a limited KRMA credit period</span>
                <span>KRMA is on BNB Smart Chain</span>
                <span>KARMA frames its mission around charity, reflections, and community rewards</span>
                <span>1 KRMA = 100 wallet-linked mission credits during the promo</span>
              </div>
            </a>
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

      {showTreasury ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-[28px] border border-emerald-200/20 bg-slate-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.52)]">
            <div className="space-y-5 text-center">
              <div>
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200/25 bg-emerald-300/15 text-xl font-black text-emerald-100">$</div>
                <h2 className="arcade-font text-xl font-bold tracking-widest text-white">FUND THE TREASURY</h2>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">
                  The treasury supports SciCon Shooter prizes and ResearchHub funding-credit events. RSC sent here can be used to acquire ResearchHub funding credits, while USDC or other Base tokens can help refill future reward pools.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/35 p-4 text-left">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Treasury wallet</div>
                <input
                  ref={treasuryAddressRef}
                  readOnly
                  value={DONATION_CONFIG.RECIPIENT_ADDRESS}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 font-mono text-xs font-bold text-white outline-none selection:bg-emerald-300 selection:text-slate-950"
                  aria-label="Treasury wallet address"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleCopyTreasuryAddress} className="rh-nav-button">
                  <span>{treasuryCopyStatus === 'copied' ? 'Copied' : treasuryCopyStatus === 'selected' ? 'Address Selected' : treasuryCopyStatus === 'error' ? 'Copy Failed' : 'Copy Address'}</span>
                </button>
                <button onClick={onOpenTreasurySend} className="rh-nav-button">
                  <span>Open Wallet Send</span>
                </button>
              </div>

              <button onClick={() => setShowTreasury(false)} className="text-xs font-bold tracking-widest text-gray-500 underline hover:text-white">
                CLOSE
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default StartScreen;
