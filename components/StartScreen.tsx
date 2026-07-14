import React, { useEffect, useMemo, useState } from 'react';
import { ArchivedWinner, LeaderboardEntry, MintRecord } from '../types';
import { ResearchHubProposal } from '../services/researchHubProposals';
import { ASSETS, DONATION_CONFIG } from '../constants';
import type { RunReceipt } from '../services/runReceiptService';
import { ALL_TIME_SCORE_LIMIT } from '../services/leaderboardService';
import { getWeeklyBoundaryMeta } from '../shared/weeklyCompetitionBoundary.browser';
import { PLAYER_SHIPS, type PlayerShipId } from '../services/playerShipService';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';

interface StartScreenProps {
  onStart: () => void;
  allTimeLeaderboard: LeaderboardEntry[];
  monthlyLeaderboard: LeaderboardEntry[];
  archivedWinners: ArchivedWinner[];
  walletRecords: MintRecord[];
  walletAddress?: string | null;
  selectedShipId: PlayerShipId;
  bioShipUnlocked: boolean;
  onSelectShip: (shipId: PlayerShipId) => void;
  latestRunReceipt?: RunReceipt | null;
  isLoading: boolean;
  proposals: ResearchHubProposal[];
  proposalStatus: ProposalFeedStatus;
  onOpenReferral: () => void;
  onOpenFund: () => void;
  onOpenProposal: (url: string) => void;
  onOpenXProfile: () => void;
  onOpenTreasurySend: () => void;
  onOpenSwap: () => void;
  onOpenLatestRecord: () => void;
  walletControl?: React.ReactNode;
  championClaimStatus: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error';
  championClaimMessage?: string;
  onClaimWeeklyChampion: (winner: ArchivedWinner, proposal: ResearchHubProposal) => void;
  requestedChampionWinner?: ArchivedWinner | null;
  onCloseRequestedChampion?: () => void;
  testChampionWinner?: ArchivedWinner | null;
  onCloseTestChampionPreview?: () => void;
}

type LeaderboardView = 'weekly' | 'allTime' | 'pastPicks' | 'records';
type DashboardTab = 'home' | 'proposals' | 'trophies' | 'more';
type IconName =
  | 'home'
  | 'list'
  | 'market'
  | 'trophy'
  | 'more'
  | 'play'
  | 'gift'
  | 'chart'
  | 'settings'
  | 'wallet'
  | 'coin'
  | 'external'
  | 'copy'
  | 'x'
  | 'search'
  | 'mint'
  | 'base'
  | 'rocket'
  | 'flask'
  | 'chevronLeft'
  | 'chevronRight'
  | 'lock';

const dashboardTabs: Array<{ id: DashboardTab; label: string; icon: IconName; hint: string }> = [
  { id: 'home', label: 'Home', icon: 'home', hint: 'Mission' },
  { id: 'proposals', label: 'Proposals', icon: 'list', hint: 'Live' },
  { id: 'trophies', label: 'Trophies', icon: 'trophy', hint: 'Rank' },
  { id: 'more', label: 'More', icon: 'more', hint: 'About' }
];

const playerShipOrder: PlayerShipId[] = ['researchhub', 'bio'];

const clampPercent = (value: number) => Math.max(8, Math.min(100, Math.round(value)));

const formatNumber = (value?: number) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : '0'
);

const getWeeklyAllocationMeta = (now = new Date()) => ({
  ...getWeeklyBoundaryMeta(now),
  allocationRsc: 100
});

const getPastPickTime = (pick: ArchivedWinner) => {
  const dateCandidates = [
    pick.scoreDate,
    /^\d{4}-\d{2}$/.test(pick.periodKey) ? `${pick.periodKey}-01T00:00:00.000Z` : pick.periodKey
  ];

  for (const candidate of dateCandidates) {
    if (!candidate) continue;
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time)) return time;
  }

  return 0;
};

const getProposalProgress = (proposal: ResearchHubProposal) => {
  if (proposal.requestedUsd && proposal.raisedUsd) {
    return clampPercent((proposal.raisedUsd / proposal.requestedUsd) * 100);
  }

  const signal = proposal.votes + proposal.backers + proposal.comments;
  return clampPercent(18 + signal * 4);
};

const getProposalSignalRsc = (proposal: ResearchHubProposal) => {
  const signal = proposal.votes * 20 + proposal.backers * 35 + proposal.comments * 5;
  return Math.max(100, Math.min(999, signal || 100));
};

const getProposalTag = (proposal: ResearchHubProposal, index: number) => {
  const text = `${proposal.title} ${proposal.organization ?? ''}`.toLowerCase();
  if (text.includes('climate') || text.includes('ocean') || text.includes('plastic')) return 'Environment';
  if (text.includes('protein') || text.includes('health') || text.includes('clinical')) return 'Health';
  if (text.includes('battery') || text.includes('fusion') || text.includes('energy')) return 'Energy';
  if (text.includes('open') || text.includes('software') || text.includes('ai')) return 'Open Science';
  return ['Research', 'Biotech', 'Materials', 'Base Native'][index % 4];
};

const leaderboardName = (entry?: LeaderboardEntry) => entry?.name || 'Open pilot slot';
const leaderboardScore = (entry?: LeaderboardEntry) => entry?.score ?? 0;

const Icon: React.FC<{ name: IconName; className?: string; strokeWidth?: number }> = ({
  name,
  className = 'h-5 w-5',
  strokeWidth = 1.8
}) => {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3.5 11.2 12 4l8.5 7.2" />
          <path d="M6 10.8V20h12v-9.2" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path d="M8 6h12" />
          <path d="M8 12h12" />
          <path d="M8 18h12" />
          <path d="M4 6h.01" />
          <path d="M4 12h.01" />
          <path d="M4 18h.01" />
        </svg>
      );
    case 'market':
      return (
        <svg {...common}>
          <path d="M6 6h15l-2 8H8L6 3H3" />
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="18" cy="20" r="1.4" />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common}>
          <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
          <path d="M8 6H5.5a2.5 2.5 0 0 0 2.8 4.2" />
          <path d="M16 6h2.5a2.5 2.5 0 0 1-2.8 4.2" />
          <path d="M12 12v5" />
          <path d="M8 20h8" />
          <path d="M10 17h4" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.2" />
          <circle cx="12" cy="12" r="1.2" />
          <circle cx="19" cy="12" r="1.2" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5.5v13l10.2-6.5L8 5.5Z" />
        </svg>
      );
    case 'gift':
      return (
        <svg {...common}>
          <path d="M20 12v8H4v-8" />
          <path d="M2.5 7h19v5h-19z" />
          <path d="M12 7v13" />
          <path d="M12 7H8.5a2 2 0 1 1 2-2c0 1.2 1.5 2 1.5 2Z" />
          <path d="M12 7h3.5a2 2 0 1 0-2-2c0 1.2-1.5 2-1.5 2Z" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
          <path d="M3 19h18" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4Z" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.4 2.4-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4.8v-.4a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.5V10H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.4-2.4.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4.8v.4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.5v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      );
    case 'wallet':
      return (
        <svg {...common}>
          <path d="M4 7.5h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2h13" />
          <path d="M16 13.5h5" />
          <circle cx="17.2" cy="13.5" r=".7" />
        </svg>
      );
    case 'coin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v10" />
          <path d="M8.5 9.5c1-1.3 5.8-1.5 6.3.5.7 2.6-5.7 1.3-5.3 4 .3 2 4.5 2.1 5.8.4" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 4h6v6" />
          <path d="m10 14 10-10" />
          <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'x':
      return (
        <svg {...common}>
          <path d="m6 6 12 12" />
          <path d="m18 6-12 12" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'mint':
      return (
        <svg {...common}>
          <path d="M12 3 5 7v10l7 4 7-4V7l-7-4Z" />
          <path d="M12 8v8" />
          <path d="M8.5 10.5h7" />
          <path d="M8.5 13.5h7" />
        </svg>
      );
    case 'base':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8 12h8" />
        </svg>
      );
    case 'rocket':
      return (
        <svg {...common}>
          <path d="M12 3c3.5 1.5 6 4.9 6.2 9.2l-4.4 4.4-6.4-6.4L12 3Z" />
          <path d="M7.4 10.2 4 11l2.5 2.5" />
          <path d="M13.8 16.6 13 20l-2.5-2.5" />
          <path d="M8 18c-1.8.9-3 .8-4 .6.2-1.1.4-2.3 1.6-3.6" />
        </svg>
      );
    case 'flask':
      return (
        <svg {...common}>
          <path d="M9 3h6" />
          <path d="M10 3v5l-5.2 8.6A2.2 2.2 0 0 0 6.7 20h10.6a2.2 2.2 0 0 0 1.9-3.4L14 8V3" />
          <path d="M8 14h8" />
        </svg>
      );
    case 'chevronLeft':
      return (
        <svg {...common}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case 'chevronRight':
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    default:
      return null;
  }
};

const StatusPill: React.FC<{ children: React.ReactNode; tone?: 'cyan' | 'green' | 'gold' | 'violet' }> = ({
  children,
  tone = 'cyan'
}) => {
  const tones = {
    cyan: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
    green: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
    gold: 'border-yellow-300/25 bg-yellow-300/10 text-yellow-100',
    violet: 'border-violet-300/25 bg-violet-300/10 text-violet-100'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.62rem] font-bold uppercase ${tones[tone]}`}>
      {children}
    </span>
  );
};

const HudPanel: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <section style={style} className={`relative overflow-hidden rounded-[8px] border border-cyan-300/20 bg-slate-950/72 shadow-[0_0_30px_rgba(8,145,178,0.16)] backdrop-blur-xl ${className}`}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_36%),linear-gradient(135deg,rgba(34,211,238,0.08),transparent_42%,rgba(16,185,129,0.08))]" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
    <div className="relative z-10 h-full">{children}</div>
  </section>
);

const StartScreen: React.FC<StartScreenProps> = ({
  onStart,
  allTimeLeaderboard,
  monthlyLeaderboard,
  archivedWinners,
  walletRecords,
  walletAddress,
  selectedShipId,
  bioShipUnlocked,
  onSelectShip,
  latestRunReceipt,
  isLoading,
  proposals,
  proposalStatus,
  onOpenReferral,
  onOpenFund,
  onOpenProposal,
  onOpenXProfile,
  onOpenTreasurySend,
  onOpenSwap,
  onOpenLatestRecord,
  walletControl,
  championClaimStatus,
  championClaimMessage,
  onClaimWeeklyChampion,
  requestedChampionWinner = null,
  onCloseRequestedChampion,
  testChampionWinner = null,
  onCloseTestChampionPreview
}) => {
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>('weekly');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(() => {
    if (testChampionWinner || requestedChampionWinner) return 'proposals';
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'proposals' || requested === 'trophies' || requested === 'more' ? requested : 'home';
  });
  const [proposalSearch, setProposalSearch] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTreasury, setShowTreasury] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isSending, setIsSending] = useState(false);
  const [treasuryCopyStatus, setTreasuryCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [championClaimWinner, setChampionClaimWinner] = useState<ArchivedWinner | null>(null);
  const [testSelectedProposal, setTestSelectedProposal] = useState<ResearchHubProposal | null>(null);
  const [shipFocusId, setShipFocusId] = useState<PlayerShipId>(selectedShipId);
  const [weeklyClock, setWeeklyClock] = useState(() => Date.now());
  const treasuryAddress = DONATION_CONFIG.RECIPIENT_ADDRESS;

  useEffect(() => {
    if (testChampionWinner) return;
    const url = new URL(window.location.href);
    if (dashboardTab === 'home') url.searchParams.delete('view');
    else url.searchParams.set('view', dashboardTab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [dashboardTab, testChampionWinner]);

  useEffect(() => {
    const requestedWinner = testChampionWinner || requestedChampionWinner;
    if (!requestedWinner) return;
    setChampionClaimWinner(requestedWinner);
    setTestSelectedProposal(null);
    setDashboardTab('proposals');
  }, [requestedChampionWinner, testChampionWinner]);

  useEffect(() => {
    const timer = window.setInterval(() => setWeeklyClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setShipFocusId(selectedShipId);
  }, [selectedShipId]);

  const cycleShip = (direction: -1 | 1) => {
    const currentIndex = playerShipOrder.indexOf(shipFocusId);
    const nextIndex = (currentIndex + direction + playerShipOrder.length) % playerShipOrder.length;
    const nextShipId = playerShipOrder[nextIndex];
    setShipFocusId(nextShipId);

    if (nextShipId !== 'bio' || bioShipUnlocked) {
      onSelectShip(nextShipId);
    }
  };
  const focusedShip = PLAYER_SHIPS[shipFocusId];
  const focusedShipLocked = shipFocusId === 'bio' && !bioShipUnlocked;

  const weeklyAllocation = useMemo(
    () => getWeeklyAllocationMeta(new Date(weeklyClock)),
    [weeklyClock]
  );
  const sortedProposals = useMemo(() => (
    [...proposals].sort((a, b) => (
      (b.votes + b.backers + b.comments) - (a.votes + a.backers + a.comments)
    ))
  ), [proposals]);

  const filteredProposals = useMemo(() => {
    const query = proposalSearch.trim().toLowerCase();
    if (!query) return sortedProposals;
    return sortedProposals.filter((proposal) => (
      `${proposal.title} ${proposal.author} ${proposal.organization ?? ''}`.toLowerCase().includes(query)
    ));
  }, [proposalSearch, sortedProposals]);

  const weeklyLeader = monthlyLeaderboard[0];
  const allTimeLeader = allTimeLeaderboard[0];

  const sortedPastPicks = useMemo(() => (
    [...archivedWinners].sort((a, b) => getPastPickTime(b) - getPastPickTime(a))
  ), [archivedWinners]);

  const visibleLeaderboard = leaderboardView === 'weekly'
    ? monthlyLeaderboard
    : leaderboardView === 'allTime'
      ? allTimeLeaderboard
      : [];
  const displayedLeaderboard = leaderboardView === 'allTime'
    ? visibleLeaderboard.slice(0, ALL_TIME_SCORE_LIMIT)
    : visibleLeaderboard;

  const topPilotScore = Math.max(weeklyLeader?.score ?? 0, allTimeLeader?.score ?? 0);
  const pilotLevel = Math.max(1, Math.min(12, Math.floor(topPilotScore / 1000) + 1));
  const weeklyLeaderName = leaderboardName(weeklyLeader);
  const weeklyLeaderScore = leaderboardScore(weeklyLeader);
  const weeklyProposalPreview = sortedProposals[0];
  const weeklyFundingTitle = weeklyProposalPreview?.title ?? 'Champion choice opens after cutoff';
  const weeklyFundingAuthor = weeklyProposalPreview
    ? `${sortedProposals.length} eligible - champion picks after cutoff`
    : `${sortedProposals.length} eligible proposal${sortedProposals.length === 1 ? '' : 's'}`;
  const weeklyFundingProgress = weeklyProposalPreview ? getProposalProgress(weeklyProposalPreview) : 0;
  const copyTextWithFallback = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleCopyTreasury = async () => {
    try {
      await copyTextWithFallback(treasuryAddress);
      setTreasuryCopyStatus('copied');
      window.setTimeout(() => setTreasuryCopyStatus('idle'), 1800);
    } catch {
      setTreasuryCopyStatus('error');
    }
  };

  const handleSendFeedback = async () => {
    const trimmedFeedback = feedback.trim();
    if (!trimmedFeedback || isSending) return;

    setIsSending(true);
    setSendStatus('idle');

    const subject = encodeURIComponent('Scicon Shooter feedback');
    const body = encodeURIComponent(trimmedFeedback);
    const mailtoUrl = `mailto:scottexplores29@gmail.com?subject=${subject}&body=${body}`;

    try {
      window.location.href = mailtoUrl;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      setFeedback('');
      setSendStatus('success');
    } catch {
      setSendStatus('error');
    } finally {
      setIsSending(false);
    }
  };

  const renderProposalRow = (proposal: ResearchHubProposal, index: number, compact = false) => {
    const progress = getProposalProgress(proposal);
    const tag = getProposalTag(proposal, index);
    const signalRsc = getProposalSignalRsc(proposal);

    return (
      <button
        key={proposal.id}
        type="button"
        onClick={() => testChampionWinner
          ? setTestSelectedProposal(proposal)
          : championClaimWinner
            ? onClaimWeeklyChampion(championClaimWinner, proposal)
            : onOpenProposal(proposal.url)}
        className={`group w-full rounded-[6px] border p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/10 ${testSelectedProposal?.id === proposal.id ? 'border-yellow-200/60 bg-yellow-300/12' : 'border-white/5 bg-white/[0.025]'}`}
      >
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.14)]">
            {proposal.imageUrl ? (
              <img src={proposal.imageUrl} alt="" className="h-full w-full rounded-[6px] object-cover" />
            ) : (
              <Icon name="flask" className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{proposal.title}</p>
              {!compact && (
                <span className="hidden shrink-0 rounded bg-emerald-400/12 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase text-emerald-200 sm:inline">
                  {tag}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="w-9 text-right text-[0.68rem] font-semibold text-cyan-100">{progress}%</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-black text-white">{signalRsc}</p>
            <p className="text-[0.58rem] font-bold uppercase text-cyan-200/70">RSC</p>
          </div>
        </div>
      </button>
    );
  };

  const HeroPanel = ({ compact = false, fill = false }: { compact?: boolean; fill?: boolean }) => (
    <HudPanel className={compact ? `min-h-[17.5rem] ${fill ? 'flex-1' : ''}` : 'min-h-[34rem] xl:min-h-[40rem]'}>
      <div className="absolute inset-0">
        <img src={ASSETS.MENU_HERO} alt="" className="h-full w-full object-cover opacity-68" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(34,211,238,0.2),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.88)_76%,rgba(2,6,23,0.96))]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(4,120,87,0.09))]" />
      </div>

      <div className={`relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-between px-4 text-center ${compact ? 'gap-1 py-2' : 'gap-6 py-7 md:px-8 md:py-10'}`}>
        <div className={compact ? 'space-y-1' : 'space-y-3'}>
          <div className="mx-auto flex w-fit items-center gap-3 text-yellow-200/90">
            <span className="h-px w-14 bg-gradient-to-r from-transparent to-yellow-200/80" />
            <span className="h-2 w-16 skew-x-[-28deg] bg-gradient-to-r from-yellow-500 via-yellow-200 to-yellow-500 shadow-[0_0_18px_rgba(250,204,21,0.45)]" />
            <span className="h-px w-14 bg-gradient-to-l from-transparent to-yellow-200/80" />
          </div>
          <div
            className={`scicon-hero-title ${compact ? '' : 'text-[3.2rem] md:text-[5rem] xl:text-[6.1rem]'}`}
            {...(compact ? { style: { fontSize: '1.75rem' } } : {})}
          >
            <span>Scicon</span>
            <span>Shooter</span>
          </div>
          <p className={`mx-auto max-w-xl font-bold uppercase text-cyan-50/85 ${compact ? 'text-[0.64rem]' : 'text-xs md:text-sm'}`}>
            Fund research. Upgrade science. Win together.
          </p>
        </div>

        <div
          className={`relative flex w-full items-center justify-center ${compact ? '' : 'min-h-[14rem]'}`}
          {...(compact ? { style: { minHeight: '5rem' } } : {})}
        >
          <div className="sci-ship-orbit" />
          <div className="absolute bottom-2 h-12 w-64 rounded-[50%] border border-cyan-300/24 bg-cyan-300/7 blur-sm" />
          <div className="absolute bottom-7 h-7 w-56 rounded-[50%] border border-emerald-300/28 bg-emerald-300/8" />
          <div className={`sci-rh-ship sci-ship-carousel ${compact ? 'sci-rh-ship--compact sci-ship-carousel--compact' : ''}`}>
            <button
              type="button"
              onClick={() => cycleShip(-1)}
              className="sci-ship-carousel-control sci-ship-carousel-control--left"
              aria-label="Previous ship"
            >
              <Icon name="chevronLeft" className="h-6 w-6" strokeWidth={2.2} />
            </button>

            <div className="sci-ship-carousel-stage" aria-live="polite">
              <div
                key={shipFocusId}
                className={`sci-ship-carousel-item sci-ship-carousel-item--active ${focusedShipLocked ? 'sci-ship-carousel-item--locked' : ''}`}
                role="img"
                aria-label={focusedShipLocked
                  ? `${focusedShip.name} locked. Mint a high score NFT to unlock this ship.`
                  : `${focusedShip.name} selected`}
              >
                <span className="sci-rh-ship-core sci-ship-carousel-core">
                  <img
                    src={focusedShip.assetUrl}
                    alt=""
                    className={shipFocusId === 'bio' ? 'sci-ship-carousel-image--pixel' : 'sci-ship-carousel-image--researchhub'}
                  />
                </span>
                {focusedShipLocked ? (
                  <span className="sci-ship-carousel-lock" aria-hidden="true">
                    <Icon name="lock" className="h-7 w-7" strokeWidth={2.2} />
                  </span>
                ) : null}
              </div>
              {focusedShipLocked ? (
                <p className="sci-ship-carousel-status">Mint a high score NFT to unlock this ship.</p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => cycleShip(1)}
              className="sci-ship-carousel-control sci-ship-carousel-control--right"
              aria-label="Next ship"
            >
              <Icon name="chevronRight" className="h-6 w-6" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className={`w-full max-w-xl ${compact ? 'space-y-2' : 'space-y-3'}`}>
          {walletControl ? (
            <div className="flex justify-center">
              {walletControl}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onStart}
            className={`sci-start-button group mx-auto flex w-full max-w-[25rem] items-center justify-center gap-3 font-black uppercase text-white ${compact ? 'px-5 py-2 text-base' : 'px-7 py-4 text-xl md:text-2xl'}`}
          >
            <span className={`flex items-center justify-center rounded-full bg-white/95 text-emerald-700 shadow-[0_0_16px_rgba(255,255,255,0.45)] transition group-hover:scale-105 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
              <Icon name="play" className="h-5 w-5 translate-x-0.5" />
            </span>
            Start Mission
          </button>
          {!compact ? <p className="text-sm font-bold text-emerald-200">Complete. Earn. Fund.</p> : null}
        </div>
      </div>
    </HudPanel>
  );

  const WeeklyFundingCard = ({ compact = false }: { compact?: boolean } = {}) => (
    <HudPanel>
      <div className={compact ? 'p-3' : 'p-4 md:p-5'}>
        <div className={`${compact ? 'mb-2 pb-2' : 'mb-3 pb-3'} grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-cyan-200/14`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-emerald-200">Weekly Funding</h2>
              <StatusPill tone="green">Live</StatusPill>
            </div>
            <p className="text-xs text-slate-300">Season 7 - Week {weeklyAllocation.endLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.62rem] font-bold uppercase text-slate-400">Prize Pool</p>
            <p className="mt-0.5 text-2xl font-black leading-none text-emerald-300">
              {weeklyAllocation.allocationRsc.toLocaleString()} <span className="text-sm">RSC</span>
            </p>
            <p className="mt-1 text-[0.68rem] font-semibold text-slate-300">
              Ends {weeklyAllocation.daysLeft === 0 ? 'today' : `in ${weeklyAllocation.daysLeft} day${weeklyAllocation.daysLeft === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setDashboardTab('proposals')}
            className={`sci-weekly-winner-card group relative w-full overflow-hidden rounded-[8px] border border-emerald-300/24 bg-slate-950/50 text-left transition hover:border-emerald-200/65 hover:bg-emerald-300/10 ${compact ? 'p-2' : 'p-3'}`}
          >
            <div className="sci-weekly-scan" />
            <div
              className={`relative z-10 grid gap-3 ${compact ? '' : 'grid-cols-[5.25rem_minmax(0,1fr)]'}`}
              {...(compact ? { style: { gridTemplateColumns: '4rem minmax(0,1fr)' } } : {})}
            >
              <div className="sci-weekly-project-image relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] border border-cyan-200/25 bg-cyan-300/10">
                <img src={ASSETS.PLAYER_SHIP} alt="" className="h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.7)]" />
                {weeklyProposalPreview?.imageUrl ? (
                  <img
                    src={weeklyProposalPreview.imageUrl}
                    alt={`${weeklyProposalPreview.title} proposal preview`}
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-cyan-200/10" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="sci-weekly-live-dot" />
                  <p className="text-[0.62rem] font-black uppercase text-emerald-200">Weekly high score</p>
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-white">{weeklyLeaderName}</p>
                    <p className="text-[0.66rem] font-bold uppercase text-slate-400">Current #1 pilot</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-cyan-100">{formatNumber(weeklyLeaderScore)}</p>
                    <p className="text-[0.58rem] font-bold uppercase text-cyan-200/70">Score</p>
                  </div>
                </div>
                <div className={`${compact ? 'mt-2 px-2 py-1.5' : 'mt-3 px-2.5 py-2'} rounded-[6px] border border-cyan-200/10 bg-cyan-300/[0.06]`}>
                  <p className="truncate text-sm font-bold text-white">{weeklyFundingTitle}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[0.62rem] font-bold uppercase text-slate-400">
                    <span className="truncate">{weeklyFundingAuthor}</span>
                    <span className="shrink-0 text-emerald-200">{weeklyFundingProgress}% progress</span>
                  </div>
                  <div className={`${compact ? 'mt-1' : 'mt-2'} h-1.5 overflow-hidden rounded-full bg-slate-800`}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-400 shadow-[0_0_12px_rgba(45,212,191,0.55)]"
                      style={{ width: `${weeklyFundingProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </button>
        </div>

      </div>
    </HudPanel>
  );

  const DashboardNav = ({ docked = false }: { docked?: boolean }) => (
    <nav className={`${docked ? 'mt-auto shrink-0 pt-2' : ''}`}>
      <div className="sci-dashboard-nav grid grid-cols-4 overflow-hidden rounded-[8px] border border-cyan-300/24 bg-slate-950/86 shadow-[0_0_28px_rgba(8,145,178,0.18)] backdrop-blur-xl">
        {dashboardTabs.map((tab) => {
          const active = dashboardTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tab.label}
              data-dashboard-tab={tab.id}
              onClick={() => setDashboardTab(tab.id)}
              className={`relative flex min-h-[4.8rem] flex-col items-center justify-center gap-1 border-r border-cyan-200/12 px-1 text-center text-xs font-semibold transition last:border-r-0 ${
                active
                  ? 'bg-gradient-to-br from-emerald-400/28 to-cyan-400/12 text-white shadow-[inset_0_0_26px_rgba(52,211,153,0.24)]'
                  : 'text-slate-300 hover:bg-cyan-300/8 hover:text-white'
              }`}
            >
              <Icon name={tab.icon} className={`h-6 w-6 ${active ? 'text-emerald-200' : 'text-cyan-200/85'}`} />
              <span>{tab.label}</span>
              <span className={`h-1 w-1 rounded-full ${active ? 'bg-yellow-300' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </nav>
  );

  const ProposalsDashboard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="text-2xl font-black text-white">Proposal Hangar</h2>
            <p className="text-sm text-slate-300">Search active, unfunded ResearchHub proposals eligible for the finalized weekly champion's allocation.</p>
          </div>
          <label className="relative block min-w-[15rem]">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/70" />
            <input
              value={proposalSearch}
              onChange={(event) => setProposalSearch(event.target.value)}
              placeholder="Search proposals"
              className="w-full rounded-[6px] border border-cyan-300/20 bg-slate-950/75 py-2 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
            />
          </label>
        </div>

        {championClaimWinner ? (
          <div className="mb-4 rounded-[8px] border border-yellow-200/30 bg-yellow-300/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">{testChampionWinner ? 'Pilot Test: Champion Choice' : 'Champion proposal selection'}</p>
                <p className="mt-1 text-sm font-semibold text-white">{championClaimWinner.winnerName}, choose one eligible proposal for {testChampionWinner ? 'this preview' : `week ${championClaimWinner.periodKey}`}.</p>
                <p className="mt-1 text-xs text-slate-300">
                  {testChampionWinner
                    ? testSelectedProposal
                      ? `Preview selected: ${testSelectedProposal.title}. No claim was submitted.`
                      : 'Choose any proposal to preview the winner flow. This does not sign or submit a claim.'
                    : 'A Base Account signature locks the selection. It does not transfer funds or mint yet.'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cancel champion selection"
                onClick={() => {
                  if (testChampionWinner) {
                    onCloseTestChampionPreview?.();
                    return;
                  }
                  setChampionClaimWinner(null);
                  if (requestedChampionWinner) onCloseRequestedChampion?.();
                }}
                className="sci-icon-button shrink-0"
              >
                <Icon name="x" />
              </button>
            </div>
            {!testChampionWinner && championClaimStatus !== 'idle' ? (
              <p className={`mt-2 text-xs font-bold ${championClaimStatus === 'error' ? 'text-red-200' : championClaimStatus === 'confirmed' ? 'text-emerald-200' : 'text-cyan-200'}`}>
                {championClaimMessage || (championClaimStatus === 'signing' ? 'Sign the proposal selection in Base Account.' : championClaimStatus === 'connecting' ? 'Connecting Base Account...' : 'Proposal selection confirmed.')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase text-slate-400">
          <span>{filteredProposals.length} active proposal{filteredProposals.length === 1 ? '' : 's'}</span>
          {proposalSearch.trim() && <span>Search filtered</span>}
        </div>

        <div className="max-h-[min(62vh,48rem)] space-y-2 overflow-y-auto pr-1">
          {proposalStatus === 'loading' ? (
            <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200 animate-pulse">
              Loading active ResearchHub proposals...
            </div>
          ) : filteredProposals.length > 0 ? (
            filteredProposals.map((proposal, index) => renderProposalRow(proposal, index))
          ) : (
            <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
              {proposalStatus === 'error'
                ? 'The live proposal feed is temporarily unavailable. No ineligible fallback choices are shown.'
                : 'No active proposal matches that search yet.'}
            </div>
          )}
          </div>
      </div>
    </HudPanel>
  );

  const TrophiesDashboard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">Trophy Deck</h2>
            <p className="text-sm text-slate-300">High scores, champion picks, confirmed funding, and onchain records.</p>
          </div>
          <div className="flex rounded-[6px] border border-cyan-300/18 bg-slate-950/70 p-1">
            {[
              ['weekly', 'Weekly'],
              ['allTime', 'All-time'],
              ['pastPicks', 'Past picks'],
              ['records', 'My records']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLeaderboardView(id as LeaderboardView)}
                className={`rounded-[5px] px-3 py-2 text-xs font-bold uppercase transition ${
                  leaderboardView === id ? 'bg-cyan-300/18 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => <div key={index} className="h-12 animate-pulse rounded-[6px] bg-white/[0.04]" />)}
          </div>
        )}

        {!isLoading && leaderboardView !== 'pastPicks' && leaderboardView !== 'records' && (
          <div className="space-y-2">
            {displayedLeaderboard.map((entry, index) => (
              <div key={`${entry.name}-${entry.score}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-cyan-300/12 bg-white/[0.035] p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-cyan-300/25 bg-cyan-300/10 text-sm font-black text-cyan-100">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{entry.name}</p>
                  <p className="truncate text-xs text-slate-400">{entry.proposalTitle ?? `Wave ${entry.wave ?? '-'}`}</p>
                </div>
                <p className="font-black text-white">{formatNumber(entry.score)}</p>
              </div>
            ))}
            {visibleLeaderboard.length === 0 && (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                No scores yet. Start a mission and claim the board.
              </div>
            )}
          </div>
        )}

        {!isLoading && leaderboardView === 'pastPicks' && (
          <div className="space-y-3">
            {sortedPastPicks.slice(0, 8).map((winner) => (
              <button
                key={`${winner.periodKey}-${winner.winnerName}`}
                type="button"
                onClick={() => {
                  if (winner.status === 'finalized') {
                    setChampionClaimWinner(winner);
                    setDashboardTab('proposals');
                  } else if (winner.proposalUrl) {
                    onOpenProposal(winner.proposalUrl);
                  }
                }}
                className="grid w-full gap-3 rounded-[8px] border border-cyan-300/12 bg-white/[0.035] p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/8 sm:grid-cols-[auto_1fr_auto] sm:items-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-yellow-300/28 bg-yellow-300/10 text-yellow-100">
                  <Icon name="trophy" className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-xs font-black uppercase tracking-wide text-yellow-200">{winner.periodLabel}</p>
                    <span className="rounded-full border border-emerald-300/24 bg-emerald-300/10 px-2 py-0.5 text-[0.65rem] font-black uppercase text-emerald-100">
                      Weekly high score
                    </span>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-start">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase text-slate-400">Winner</p>
                      <p className="truncate text-base font-black text-white">{winner.winnerName}</p>
                      <p className="text-xs text-cyan-200">{formatNumber(winner.score)} pts{winner.wave ? ` - Wave ${winner.wave}` : ''}</p>
                    </div>
                    <div className="min-w-0 rounded-[6px] border border-cyan-300/12 bg-slate-950/38 p-3">
                      <p className="text-xs font-bold uppercase text-slate-400">Allocated funding to</p>
                      <p className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-white">{winner.proposalTitle ?? 'Funding pick pending'}</p>
                      {winner.proposalAuthor && <p className="mt-1 truncate text-xs uppercase text-cyan-200">{winner.proposalAuthor}</p>}
                    </div>
                  </div>
                </div>
                <div className="justify-self-start rounded-[8px] border border-cyan-300/16 bg-cyan-300/8 px-3 py-2 text-left sm:justify-self-end sm:text-right">
                  <p className="text-base font-black text-white">{winner.allocationRsc ?? weeklyAllocation.allocationRsc} RSC</p>
                  <p className="text-[0.65rem] font-bold uppercase text-cyan-200">
                    {winner.status === 'funded' && winner.allocationTxHash
                      ? 'Funding confirmed'
                      : winner.status === 'claimed'
                        ? 'Proposal selected'
                        : winner.status === 'expired'
                          ? 'Claim window closed'
                          : 'Champion finalized'}
                  </p>
                </div>
              </button>
            ))}
            {sortedPastPicks.length === 0 && (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                Past weekly picks will appear here after winners are archived, showing the weekly high-score pilot, their score, and the proposal they chose for the funding allocation.
              </div>
            )}
          </div>
        )}

        {!isLoading && leaderboardView === 'records' && (
          <div className="space-y-3">
            {latestRunReceipt && !walletRecords.some((record) => record.recordType === 'mission' && record.runId === latestRunReceipt.runId && record.status === 'confirmed') ? (
              <button
                type="button"
                onClick={onOpenLatestRecord}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-yellow-200/25 bg-yellow-300/10 p-3 text-left transition hover:border-yellow-100/50 hover:bg-yellow-300/15"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[8px] border border-yellow-200/30 bg-slate-950/70 text-yellow-100">
                  <Icon name="rocket" className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">Latest verified run</p>
                  <p className="truncate text-xs text-slate-300">{formatNumber(latestRunReceipt.metrics.score)} pts - Wave {latestRunReceipt.metrics.wave}</p>
                </div>
                <span className="text-[10px] font-black uppercase text-yellow-100">Preview</span>
              </button>
            ) : null}
            {walletRecords.map((record) => (
              <a
                key={`${record.recordType}-${record.runId}`}
                href={record.transactionHash ? `${record.chainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org'}/tx/${record.transactionHash}` : undefined}
                target={record.transactionHash ? '_blank' : undefined}
                rel={record.transactionHash ? 'noopener noreferrer' : undefined}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[8px] border border-cyan-300/15 bg-white/[0.035] p-3"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-[8px] border ${record.recordType === 'champion' ? 'border-yellow-200/30 bg-yellow-300/10 text-yellow-100' : 'border-cyan-200/25 bg-cyan-300/10 text-cyan-100'}`}>
                  <Icon name={record.recordType === 'champion' ? 'trophy' : 'mint'} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">{record.recordType === 'champion' ? 'Weekly Champion Record' : 'Mission Record'}</p>
                  <p className="truncate font-mono text-[10px] uppercase text-slate-400">Run {record.runId.slice(0, 8)}{record.weekKey ? ` - ${record.weekKey}` : ''}</p>
                </div>
                <span className={`text-[10px] font-black uppercase ${record.status === 'confirmed' ? 'text-emerald-200' : record.status === 'failed' ? 'text-red-200' : 'text-yellow-200'}`}>{record.status}</span>
              </a>
            ))}
            {!walletAddress ? (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                <p>Connect a Base Account to view and mint your personal Mission Records.</p>
                {walletControl ? <div className="mt-3 flex justify-start">{walletControl}</div> : null}
              </div>
            ) : walletRecords.length === 0 && !latestRunReceipt ? (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                <p className="font-bold text-white">No records minted yet</p>
                <p className="mt-1 text-xs text-slate-400">Finish a mission, submit the score, then mint its score card here.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </HudPanel>
  );

  const AboutDashboard = () => (
    <HudPanel>
      <div className="grid gap-5 p-4 md:p-5">
        <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <h2 className="text-2xl font-black text-white">More</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
              Scicon Shooter is a community-built Base-native arcade game. Play instantly, climb the weekly board, and if your verified score is still No. 1 when the week closes, choose an eligible ResearchHub proposal for the community funding allocation.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill tone="cyan">Arcade funding</StatusPill>
              <StatusPill tone="green">ResearchHub proposals</StatusPill>
              <StatusPill tone="gold">Base trophies</StatusPill>
            </div>
          </div>
          <div className="rounded-[8px] border border-cyan-300/18 bg-cyan-300/8 p-4">
            <p className="text-xs font-bold uppercase text-cyan-200">Pilot status</p>
            <p className="mt-2 text-2xl font-black text-white">Level {pilotLevel}</p>
            <p className="text-sm text-slate-300">{weeklyAllocation.allocationRsc} RSC weekly funding pool</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="sci-market-card">
            <Icon name="base" className="h-8 w-8 text-blue-200" />
            <span>
              <strong>Base app alerts</strong>
              <small>Pin Scicon Shooter in the Base app and enable notifications for weekly champion and research-pick updates.</small>
            </span>
          </div>
          <button type="button" onClick={() => setDashboardTab('trophies')} className="sci-market-card">
            <Icon name="chart" className="h-8 w-8 text-cyan-200" />
            <span>
              <strong>Leaderboard</strong>
              <small>View ranks, trophies, and past funding picks.</small>
            </span>
          </button>
          <button type="button" onClick={onOpenReferral} className="sci-market-card">
            <Icon name="gift" className="h-8 w-8 text-yellow-200" />
            <span>
              <strong>Referral</strong>
              <small>Open the ResearchHub referral reward.</small>
            </span>
          </button>
          <button type="button" onClick={() => setShowFeedback(true)} className="sci-market-card">
            <Icon name="settings" className="h-8 w-8 text-violet-200" />
            <span>
              <strong>Settings</strong>
              <small>Send feedback and tune the mission deck.</small>
            </span>
          </button>
          <button type="button" onClick={() => setShowTreasury(true)} className="sci-market-card">
            <Icon name="wallet" className="h-8 w-8 text-emerald-200" />
            <span>
              <strong>Treasury</strong>
              <small>View the research funding destination.</small>
            </span>
          </button>
          <button type="button" onClick={onOpenSwap} className="sci-market-card">
            <Icon name="coin" className="h-8 w-8 text-cyan-200" />
            <span>
              <strong>RSC on Base</strong>
              <small>Open the external swap route when an action requires RSC.</small>
            </span>
          </button>
          <button type="button" onClick={onOpenFund} className="sci-market-card">
            <Icon name="flask" className="h-8 w-8 text-emerald-200" />
            <span>
              <strong>ResearchHub</strong>
              <small>Browse the source funding ecosystem.</small>
            </span>
          </button>
          <a href="https://github.com/ScottExplores/SciconShooter" target="_blank" rel="noopener noreferrer" className="sci-market-card">
            <Icon name="external" className="h-8 w-8 text-slate-200" />
            <span>
              <strong>Open source</strong>
              <small>Review the game code and technical notes on GitHub.</small>
            </span>
          </a>
          <button type="button" onClick={onOpenXProfile} className="sci-market-card">
            <Icon name="external" className="h-8 w-8 text-blue-200" />
            <span>
              <strong>Updates</strong>
              <small>Follow Scicon Shooter development.</small>
            </span>
          </button>
        </div>
        <div className="grid gap-3 border-t border-cyan-200/12 pt-4 md:grid-cols-2">
          <div className="rounded-[8px] border border-cyan-200/15 bg-cyan-300/6 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Funding transparency</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              A weekly leader is temporary until Sunday's noon-Pacific cutoff. A proposal is only marked selected after the finalized champion signs, and funding is only marked confirmed with a Base transaction reference.
            </p>
          </div>
          <div className="rounded-[8px] border border-cyan-200/15 bg-cyan-300/6 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-200">Privacy and disclosure</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Guest play does not require a wallet. Anonymous product events avoid wallet addresses and names. Scicon Shooter is community-built, open source, and is not represented as an official ResearchHub product. Builder code: bc_ww78gi4f.
            </p>
          </div>
        </div>
      </div>
    </HudPanel>
  );

  const MobileDashboardContent = () => {
    if (dashboardTab === 'proposals') return <ProposalsDashboard />;
    if (dashboardTab === 'trophies') return <TrophiesDashboard />;
    if (dashboardTab === 'more') return <AboutDashboard />;

    return (
      <div className="flex min-h-full flex-col gap-2">
        <WeeklyFundingCard compact />
        <HeroPanel compact fill />
      </div>
    );
  };

  const SelectedDashboard = () => {
    if (dashboardTab === 'proposals') return <ProposalsDashboard />;
    if (dashboardTab === 'trophies') return <TrophiesDashboard />;
    if (dashboardTab === 'more') return <AboutDashboard />;
    return null;
  };

  return (
    <div className="scicon-start-screen relative h-full min-h-0 overflow-hidden bg-slate-950 text-white">
      {testChampionWinner && onCloseTestChampionPreview ? (
        <button
          type="button"
          onClick={onCloseTestChampionPreview}
          className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] border border-cyan-100/45 bg-slate-950/92 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.2)]"
        >
          Return to frozen run
        </button>
      ) : null}
      <div className="fixed inset-0 -z-10">
        <img src={ASSETS.MENU_HERO} alt="" className="h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_86%_22%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.58),rgba(2,6,23,0.96)_74%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="scicon-start-shell mx-auto flex h-full min-h-0 w-full max-w-[1560px] flex-col gap-4 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:gap-5 lg:px-6 lg:pb-6">
        <main className="hidden lg:block">
          {dashboardTab === 'home' ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.14fr)_minmax(25rem,0.86fr)]">
              <div className="space-y-5">
                <HeroPanel />
                <DashboardNav />
              </div>

              <div className="space-y-5">
                <WeeklyFundingCard />
              </div>
            </div>
          ) : (
            <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-5">
              <SelectedDashboard />
              <DashboardNav docked />
            </div>
          )}
        </main>

        <main
          className="scicon-mobile-main flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden"
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-px custom-scrollbar">
            <MobileDashboardContent />
          </div>
          <DashboardNav docked />
        </main>
      </div>
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[8px] border border-cyan-300/25 bg-slate-950 p-5 shadow-[0_0_40px_rgba(34,211,238,0.22)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Send Feedback</h2>
                <p className="text-sm text-slate-300">Help tune the mission deck.</p>
              </div>
              <button type="button" onClick={() => setShowFeedback(false)} className="sci-icon-button" aria-label="Close feedback">
                <Icon name="x" />
              </button>
            </div>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="What should Scicon Shooter improve next?"
              className="min-h-[9rem] w-full resize-none rounded-[6px] border border-cyan-300/20 bg-slate-900 p-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                {sendStatus === 'success' && 'Your mail app should be ready with the message.'}
                {sendStatus === 'error' && 'Could not open mail automatically. Try again in a moment.'}
              </p>
              <button
                type="button"
                onClick={handleSendFeedback}
                disabled={!feedback.trim() || isSending}
                className="rounded-[6px] border border-emerald-300/35 bg-emerald-400/14 px-4 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-400/24 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSending ? 'Opening...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTreasury && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[8px] border border-cyan-300/25 bg-slate-950 p-5 shadow-[0_0_40px_rgba(34,211,238,0.22)]">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Research Treasury</h2>
                <p className="text-sm text-slate-300">Base address for funding flow tests.</p>
              </div>
              <button type="button" onClick={() => setShowTreasury(false)} className="sci-icon-button" aria-label="Close treasury">
                <Icon name="x" />
              </button>
            </div>
            <div className="rounded-[6px] border border-cyan-300/18 bg-slate-900 p-3">
              <p className="break-all text-sm text-slate-200">{treasuryAddress}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={handleCopyTreasury} className="sci-mini-cta">
                <Icon name="copy" className="h-4 w-4" />
                {treasuryCopyStatus === 'copied' ? 'Copied' : treasuryCopyStatus === 'error' ? 'Copy failed' : 'Copy address'}
              </button>
              <button type="button" onClick={onOpenTreasurySend} className="sci-mini-cta">
                <Icon name="wallet" className="h-4 w-4" />
                Open wallet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StartScreen;
