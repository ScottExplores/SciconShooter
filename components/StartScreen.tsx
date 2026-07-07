import React, { useMemo, useState } from 'react';
import { ArchivedWinner, LeaderboardEntry } from '../types';
import { ResearchHubProposal } from '../services/researchHubProposals';
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
  onOpenCredits: () => void;
  onOpenSwap: () => void;
  onOpenBuy: () => void;
  walletControl?: React.ReactNode;
}

type LeaderboardView = 'weekly' | 'allTime' | 'pastPicks';
type DashboardTab = 'home' | 'proposals' | 'market' | 'trophies' | 'more';
type IconName =
  | 'home'
  | 'list'
  | 'market'
  | 'trophy'
  | 'more'
  | 'play'
  | 'shield'
  | 'overdrive'
  | 'focus'
  | 'beam'
  | 'gift'
  | 'chart'
  | 'settings'
  | 'pilot'
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
  | 'chevron';

const dashboardTabs: Array<{ id: DashboardTab; label: string; icon: IconName; hint: string }> = [
  { id: 'home', label: 'Home', icon: 'home', hint: 'Mission' },
  { id: 'proposals', label: 'Proposals', icon: 'list', hint: 'Live' },
  { id: 'market', label: 'Market', icon: 'market', hint: 'RSC' },
  { id: 'trophies', label: 'Trophies', icon: 'trophy', hint: 'Rank' },
  { id: 'more', label: 'More', icon: 'more', hint: 'About' }
];

const clampPercent = (value: number) => Math.max(8, Math.min(100, Math.round(value)));

const formatNumber = (value?: number) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : '0'
);

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
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5.4c0 4.4-3 7.4-7 9.1-4-1.7-7-4.7-7-9.1V6l7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case 'overdrive':
      return (
        <svg {...common}>
          <path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z" />
        </svg>
      );
    case 'focus':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3" />
          <path d="M12 19v3" />
          <path d="M2 12h3" />
          <path d="M19 12h3" />
          <path d="m5 5 2.2 2.2" />
          <path d="m16.8 16.8 2.2 2.2" />
          <path d="m19 5-2.2 2.2" />
          <path d="m7.2 16.8-2.2 2.2" />
        </svg>
      );
    case 'beam':
      return (
        <svg {...common}>
          <path d="M12 3 4 8l8 13 8-13-8-5Z" />
          <path d="M12 3v18" />
          <path d="M4 8h16" />
          <path d="m8 14 4-6 4 6" />
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
    case 'pilot':
      return (
        <svg {...common}>
          <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
          <path d="M8 11h8" />
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
    case 'chevron':
      return (
        <svg {...common}>
          <path d="m8 10 4 4 4-4" />
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

const HudPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`relative overflow-hidden rounded-[8px] border border-cyan-300/20 bg-slate-950/72 shadow-[0_0_30px_rgba(8,145,178,0.16)] backdrop-blur-xl ${className}`}>
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_36%),linear-gradient(135deg,rgba(34,211,238,0.08),transparent_42%,rgba(16,185,129,0.08))]" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
    <div className="relative z-10">{children}</div>
  </section>
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
  onOpenTreasurySend,
  onOpenCredits,
  onOpenSwap,
  onOpenBuy,
  walletControl
}) => {
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>('weekly');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('home');
  const [proposalSearch, setProposalSearch] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTreasury, setShowTreasury] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isSending, setIsSending] = useState(false);
  const [treasuryCopyStatus, setTreasuryCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const treasuryAddress = DONATION_CONFIG.RECIPIENT_ADDRESS;

  const weeklyAllocation = useMemo(getWeeklyAllocationMeta, []);
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

  const topPilotScore = Math.max(weeklyLeader?.score ?? 0, allTimeLeader?.score ?? 0);
  const pilotLevel = Math.max(1, Math.min(12, Math.floor(topPilotScore / 1000) + 1));
  const weeklyLeaderProposal = useMemo(() => {
    if (weeklyLeader?.proposalId) {
      const proposalById = sortedProposals.find((proposal) => proposal.id === weeklyLeader.proposalId);
      if (proposalById) return proposalById;
    }

    if (weeklyLeader?.proposalUrl) {
      const proposalByUrl = sortedProposals.find((proposal) => proposal.url === weeklyLeader.proposalUrl);
      if (proposalByUrl) return proposalByUrl;
    }

    return sortedProposals[0];
  }, [weeklyLeader, sortedProposals]);
  const weeklyLeaderName = leaderboardName(weeklyLeader);
  const weeklyLeaderScore = leaderboardScore(weeklyLeader);
  const weeklyFundingTitle = weeklyLeader?.proposalTitle
    || weeklyLeaderProposal?.title
    || 'Proposal pick pending';
  const weeklyFundingAuthor = weeklyLeader?.proposalAuthor
    || weeklyLeaderProposal?.organization
    || weeklyLeaderProposal?.author
    || 'ResearchHub';
  const weeklyFundingImageUrl = weeklyLeaderProposal?.imageUrl;
  const weeklyFundingProgress = weeklyLeaderProposal ? getProposalProgress(weeklyLeaderProposal) : 12;
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
        onClick={() => onOpenProposal(proposal.url)}
        className="group w-full rounded-[6px] border border-white/5 bg-white/[0.025] p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/10"
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

  const Header = () => (
    <header className="grid gap-3 rounded-[8px] border border-cyan-300/18 bg-slate-950/62 p-3 shadow-[0_0_35px_rgba(8,145,178,0.14)] backdrop-blur-xl md:grid-cols-[auto_1fr_auto] md:items-center">
      <div className="flex items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] border border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_22px_rgba(34,211,238,0.28)]">
          <img src={ASSETS.PLAYER_SHIP} alt="" className="h-8 w-8 object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
        </div>
        <div className="leading-none">
          <p className="text-[1.35rem] font-black uppercase text-white md:text-2xl">Scicon</p>
          <p className="text-[1.05rem] font-black uppercase text-cyan-300 md:text-xl">Shooter</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3 md:justify-start">
        <button
          type="button"
          onClick={onOpenCredits}
          className="flex min-w-0 items-center gap-3 rounded-[6px] border border-cyan-300/25 bg-slate-950/70 px-3 py-2 text-left transition hover:border-emerald-300/45 hover:bg-emerald-300/10"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-300/35 bg-emerald-400/18 text-emerald-100">
            <img src={ASSETS.REAL_RSC_ICON} alt="" className="h-7 w-7 rounded-full object-contain" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black text-white">{weeklyAllocation.allocationRsc} RSC</span>
            <span className="block text-xs text-slate-300">Weekly funding</span>
          </span>
          <Icon name="chevron" className="h-4 w-4 text-cyan-200/75" />
        </button>

        <div className="hidden items-center gap-2 lg:flex">
          <StatusPill tone="green">Base native</StatusPill>
          <StatusPill tone="cyan">ResearchHub powered</StatusPill>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <button type="button" onClick={() => setDashboardTab('trophies')} className="sci-icon-button" aria-label="Open leaderboard">
          <Icon name="chart" />
        </button>
        <button type="button" onClick={onOpenReferral} className="sci-icon-button" aria-label="Open ResearchHub referral">
          <Icon name="gift" />
        </button>
        <button type="button" onClick={() => setShowFeedback(true)} className="sci-icon-button" aria-label="Open settings and feedback">
          <Icon name="settings" />
        </button>
        <div className="hidden items-center gap-3 rounded-[6px] border border-cyan-300/25 bg-cyan-300/8 px-3 py-2 sm:flex">
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-cyan-300/35 bg-slate-950 text-cyan-100">
            <Icon name="pilot" className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">Pilot</p>
            <p className="text-xs text-slate-300">Level {pilotLevel}</p>
          </div>
        </div>
      </div>
    </header>
  );

  const HeroPanel = ({ compact = false }: { compact?: boolean }) => (
    <HudPanel className={compact ? 'min-h-[22rem]' : 'min-h-[34rem] xl:min-h-[40rem]'}>
      <div className="absolute inset-0">
        <img src={ASSETS.MENU_HERO} alt="" className="h-full w-full object-cover opacity-68" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(34,211,238,0.2),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.88)_76%,rgba(2,6,23,0.96))]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(4,120,87,0.09))]" />
      </div>

      <div className={`relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-between px-4 text-center ${compact ? 'gap-2 py-4' : 'gap-6 py-7 md:px-8 md:py-10'}`}>
        <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
          <div className="mx-auto flex w-fit items-center gap-3 text-yellow-200/90">
            <span className="h-px w-14 bg-gradient-to-r from-transparent to-yellow-200/80" />
            <span className="h-2 w-16 skew-x-[-28deg] bg-gradient-to-r from-yellow-500 via-yellow-200 to-yellow-500 shadow-[0_0_18px_rgba(250,204,21,0.45)]" />
            <span className="h-px w-14 bg-gradient-to-l from-transparent to-yellow-200/80" />
          </div>
          <div className={`scicon-hero-title ${compact ? 'text-[2.15rem]' : 'text-[3.2rem] md:text-[5rem] xl:text-[6.1rem]'}`}>
            <span>Scicon</span>
            <span>Shooter</span>
          </div>
          <p className={`mx-auto max-w-xl font-bold uppercase text-cyan-50/85 ${compact ? 'text-[0.64rem]' : 'text-xs md:text-sm'}`}>
            Fund research. Upgrade science. Win together.
          </p>
        </div>

        <div className={`relative flex w-full items-center justify-center ${compact ? 'min-h-[6.6rem]' : 'min-h-[11rem]'}`}>
          <div className="sci-ship-orbit" />
          <div className="absolute bottom-2 h-12 w-64 rounded-[50%] border border-cyan-300/24 bg-cyan-300/7 blur-sm" />
          <div className="absolute bottom-7 h-7 w-56 rounded-[50%] border border-emerald-300/28 bg-emerald-300/8" />
          <div className={`sci-rh-ship ${compact ? 'sci-rh-ship--compact' : ''}`} role="img" aria-label="ResearchHub logo">
            <span className="sci-rh-ship-core">
              <img src={ASSETS.PLAYER_SHIP} alt="" />
            </span>
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
            className={`sci-start-button group mx-auto flex w-full max-w-[25rem] items-center justify-center gap-3 font-black uppercase text-white ${compact ? 'px-5 py-3 text-lg' : 'px-7 py-4 text-xl md:text-2xl'}`}
          >
            <span className={`flex items-center justify-center rounded-full bg-white/95 text-emerald-700 shadow-[0_0_16px_rgba(255,255,255,0.45)] transition group-hover:scale-105 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
              <Icon name="play" className="h-5 w-5 translate-x-0.5" />
            </span>
            Start Mission
          </button>
          <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-emerald-200`}>Complete. Earn. Fund.</p>
        </div>
      </div>
    </HudPanel>
  );

  const WeeklyFundingCard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-cyan-200/14 pb-3">
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
            onClick={() => weeklyLeaderProposal ? onOpenProposal(weeklyLeaderProposal.url) : setDashboardTab('proposals')}
            className="sci-weekly-winner-card group relative w-full overflow-hidden rounded-[8px] border border-emerald-300/24 bg-slate-950/50 p-3 text-left transition hover:border-emerald-200/65 hover:bg-emerald-300/10"
          >
            <div className="sci-weekly-scan" />
            <div className="relative z-10 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
              <div className="sci-weekly-project-image relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] border border-cyan-200/25 bg-cyan-300/10">
                {weeklyFundingImageUrl ? (
                  <img src={weeklyFundingImageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <img src={ASSETS.PLAYER_SHIP} alt="" className="h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.7)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-cyan-200/10" />
                <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-[6px] border border-emerald-200/45 bg-slate-950/85 text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.38)]">
                  <Icon name="trophy" className="h-4 w-4" />
                </div>
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
                <div className="mt-3 rounded-[6px] border border-cyan-200/10 bg-cyan-300/[0.06] px-2.5 py-2">
                  <p className="truncate text-sm font-bold text-white">{weeklyFundingTitle}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[0.62rem] font-bold uppercase text-slate-400">
                    <span className="truncate">{weeklyFundingAuthor}</span>
                    <span className="shrink-0 text-emerald-200">{weeklyFundingProgress}% signal</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
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

  const LiveProposalsPanel = ({ limit = 5 }: { limit?: number }) => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-cyan-200/14 pb-3">
          <div>
            <h2 className="text-lg font-black text-cyan-200">Live Proposals</h2>
            <p className="text-xs text-slate-300">Most picked funding targets</p>
          </div>
          <button type="button" onClick={() => setDashboardTab('proposals')} className="text-xs font-bold uppercase text-cyan-200 hover:text-white">
            View all
          </button>
        </div>

        {proposalStatus === 'loading' && (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-[6px] bg-white/[0.04]" />
            ))}
          </div>
        )}

        {proposalStatus === 'error' && (
          <div className="rounded-[6px] border border-red-300/20 bg-red-500/10 p-4 text-sm text-red-100">
            Proposal feed is temporarily unavailable. You can still launch missions and fund from the market.
          </div>
        )}

        {proposalStatus !== 'loading' && proposalStatus !== 'error' && sortedProposals.length === 0 && (
          <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
            Live proposals will appear here once ResearchHub returns active funding targets.
          </div>
        )}

        {sortedProposals.length > 0 && (
          <div className="space-y-2">
            {sortedProposals.slice(0, limit).map((proposal, index) => renderProposalRow(proposal, index, limit < 5))}
          </div>
        )}
      </div>
    </HudPanel>
  );

  const DashboardNav = ({ fixed = false }: { fixed?: boolean }) => (
    <nav className={`${fixed ? 'fixed inset-x-3 bottom-3 z-40' : ''}`}>
      <div className="sci-dashboard-nav grid grid-cols-5 overflow-hidden rounded-[8px] border border-cyan-300/24 bg-slate-950/86 shadow-[0_0_28px_rgba(8,145,178,0.18)] backdrop-blur-xl">
        {dashboardTabs.map((tab) => {
          const active = dashboardTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
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

  const MissionControlPanel = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Mission Control</h2>
            <p className="text-sm text-slate-300">Launch missions, climb the board, and direct weekly RSC funding.</p>
          </div>
          <button type="button" onClick={onStart} className="sci-mini-cta">
            <Icon name="play" className="h-4 w-4" />
            Start
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[8px] border border-cyan-300/16 bg-white/[0.035] p-4">
            <p className="text-xs uppercase text-slate-400">Weekly Leader</p>
            <p className="mt-2 truncate text-lg font-black text-white">{leaderboardName(weeklyLeader)}</p>
            <p className="text-sm text-cyan-200">{formatNumber(leaderboardScore(weeklyLeader))} pts</p>
          </div>
          <div className="rounded-[8px] border border-cyan-300/16 bg-white/[0.035] p-4">
            <p className="text-xs uppercase text-slate-400">All-Time Ace</p>
            <p className="mt-2 truncate text-lg font-black text-white">{leaderboardName(allTimeLeader)}</p>
            <p className="text-sm text-cyan-200">{formatNumber(leaderboardScore(allTimeLeader))} pts</p>
          </div>
          <div className="rounded-[8px] border border-cyan-300/16 bg-white/[0.035] p-4">
            <p className="text-xs uppercase text-slate-400">This Week</p>
            <p className="mt-2 text-lg font-black text-white">{weeklyAllocation.allocationRsc} RSC</p>
            <p className="text-sm text-cyan-200">Awarded to the winning pick</p>
          </div>
        </div>
      </div>
    </HudPanel>
  );

  const ProposalsDashboard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="text-2xl font-black text-white">Proposal Hangar</h2>
            <p className="text-sm text-slate-300">Search active, unfunded ResearchHub targets and pick where your winning credits should go.</p>
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

        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-bold uppercase text-slate-400">
          <span>{filteredProposals.length} active proposal{filteredProposals.length === 1 ? '' : 's'}</span>
          {proposalSearch.trim() && <span>Search filtered</span>}
        </div>

        <div className="max-h-[min(62vh,48rem)] space-y-2 overflow-y-auto pr-1">
          {filteredProposals.length > 0 ? (
            filteredProposals.map((proposal, index) => renderProposalRow(proposal, index))
          ) : (
            <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
              No active proposal matches that search yet.
            </div>
          )}
          </div>
      </div>
    </HudPanel>
  );

  const MarketDashboard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4">
          <h2 className="text-2xl font-black text-white">RSC Market</h2>
          <p className="text-sm text-slate-300">Swap, buy, or load mission credits from one Base-native command post.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <button type="button" onClick={onOpenBuy} className="sci-market-card">
            <Icon name="wallet" className="h-8 w-8 text-emerald-200" />
            <span>
              <strong>Buy RSC</strong>
              <small>Use Base to stock your research wallet.</small>
            </span>
          </button>
          <button type="button" onClick={onOpenSwap} className="sci-market-card">
            <Icon name="coin" className="h-8 w-8 text-cyan-200" />
            <span>
              <strong>Swap</strong>
              <small>Open the RSC swap route.</small>
            </span>
          </button>
          <button type="button" onClick={onOpenCredits} className="sci-market-card">
            <Icon name="base" className="h-8 w-8 text-blue-200" />
            <span>
              <strong>Credits</strong>
              <small>Convert RSC into mission power.</small>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenFund}
          className="mt-4 w-full rounded-[8px] border border-cyan-300/24 bg-cyan-300/8 px-4 py-3 text-left text-sm text-slate-200 transition hover:bg-cyan-300/14"
        >
          Open ResearchHub Fund
        </button>
      </div>
    </HudPanel>
  );

  const TrophiesDashboard = () => (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">Trophy Deck</h2>
            <p className="text-sm text-slate-300">High scores, funded proposals, and weekly winners.</p>
          </div>
          <div className="flex rounded-[6px] border border-cyan-300/18 bg-slate-950/70 p-1">
            {[
              ['weekly', 'Weekly'],
              ['allTime', 'All-time'],
              ['pastPicks', 'Past picks']
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

        {!isLoading && leaderboardView !== 'pastPicks' && (
          <div className="space-y-2">
            {visibleLeaderboard.slice(0, 8).map((entry, index) => (
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
          <div className="space-y-2">
            {sortedPastPicks.slice(0, 8).map((winner) => (
              <button
                key={`${winner.periodKey}-${winner.winnerName}`}
                type="button"
                onClick={() => winner.proposalUrl && onOpenProposal(winner.proposalUrl)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-cyan-300/12 bg-white/[0.035] p-3 text-left transition hover:border-cyan-300/35 hover:bg-cyan-300/8"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-yellow-300/28 bg-yellow-300/10 text-yellow-100">
                  <Icon name="trophy" className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{winner.proposalTitle ?? 'Funding pick pending'}</p>
                  <p className="truncate text-xs text-slate-400">{winner.periodLabel} by {winner.winnerName}</p>
                </div>
                <p className="text-right text-sm font-black text-white">{winner.allocationRsc ?? weeklyAllocation.allocationRsc} RSC</p>
              </button>
            ))}
            {sortedPastPicks.length === 0 && (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                Past weekly picks will appear here after winners are archived.
              </div>
            )}
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
              Scicon Shooter is a Base-native arcade game where high scores help direct weekly RSC funding credits toward ResearchHub proposals. The loop is simple: play the mission, climb the leaderboard, pick research you believe in, and make the win visible through trophies and post-game score mints.
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
          <button type="button" onClick={onOpenXProfile} className="sci-market-card">
            <Icon name="external" className="h-8 w-8 text-blue-200" />
            <span>
              <strong>Updates</strong>
              <small>Follow Scicon Shooter development.</small>
            </span>
          </button>
        </div>
      </div>
    </HudPanel>
  );

  const MobileDashboardContent = () => {
    if (dashboardTab === 'proposals') return <><DashboardNav /><ProposalsDashboard /></>;
    if (dashboardTab === 'market') return <><DashboardNav /><MarketDashboard /></>;
    if (dashboardTab === 'trophies') return <><DashboardNav /><TrophiesDashboard /></>;
    if (dashboardTab === 'more') return <><DashboardNav /><AboutDashboard /></>;

    return (
      <>
        <WeeklyFundingCard />
        <HeroPanel compact />
        <DashboardNav />
      </>
    );
  };

  const SelectedDashboard = () => {
    if (dashboardTab === 'proposals') return <ProposalsDashboard />;
    if (dashboardTab === 'market') return <MarketDashboard />;
    if (dashboardTab === 'trophies') return <TrophiesDashboard />;
    if (dashboardTab === 'more') return <AboutDashboard />;
    return null;
  };

  return (
    <div className="relative min-h-screen overflow-y-auto bg-slate-950 text-white">
      <div className="fixed inset-0 -z-10">
        <img src={ASSETS.MENU_HERO} alt="" className="h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_86%_22%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.58),rgba(2,6,23,0.96)_74%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col gap-4 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:gap-5 lg:px-6 lg:pb-6">
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
            <div className="space-y-5">
              <DashboardNav />
              <SelectedDashboard />
            </div>
          )}
        </main>

        <main className="space-y-4 lg:hidden">
          <MobileDashboardContent />
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
