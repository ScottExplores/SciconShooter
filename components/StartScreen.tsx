import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArchivedWinner, LeaderboardEntry, MintRecord } from '../types';
import { ResearchHubProposal } from '../services/researchHubProposals';
import {
  formatFundingAmount,
  formatFundingPercent,
  getProposalFundingMetrics,
  sortProposalsByFunding
} from '../services/proposalFunding';
import {
  ASSETS,
  DONATION_CONFIG,
  type PlayerShipPurchaseSkuId,
  type RscPurchaseSkuId
} from '../constants';
import type { RscBalanceSnapshot } from '../services/baseAccountWallet';
import type {
  PlayerShipPurchaseStatusUpdate,
  WalletPurchaseStatusUpdate
} from './WalletRuntime';
import type { WalletRunRecord } from '../services/playerRunService';
import { getWalletActivityViewState } from '../services/walletActivityMerge';
import type { WeeklyProposalRecovery } from '../services/weeklyProposalRecovery';
import {
  isWeeklyProposalReminderDue,
  parseWeeklyProposalReminderTimestamp,
  serializeWeeklyProposalReminderTimestamp
} from '../services/weeklyProposalReminder';
import { ALL_TIME_SCORE_LIMIT, WEEKLY_SCORE_LIMIT } from '../services/leaderboardService';
import { resolveProposalSelection } from '../services/weeklyProposalDisplay';
import { isProposalExplicitlyCompleted } from '../services/weeklyProposalLifecycle';
import {
  getWeeklyPresentationMeta,
  WEEKLY_ALLOCATION_RSC
} from '../shared/weeklyCompetitionBoundary.browser';
import { buildMissionRecordCardPath } from '../shared/record-card/renderRecordCardSvg.mjs';
import {
  isPlayerShipUnlocked,
  PLAYABLE_PLAYER_SHIP_IDS,
  PLAYER_SHIPS,
  type PlayerShipId,
  type PlayerShipUnlocks
} from '../services/playerShipService';
import SquadHangar from './SquadHangar';
import PlayerShipAccessDialog, { type PlayerShipAccessId } from './PlayerShipAccessDialog';
import PixelActionButton from './PixelActionButton';
import AudioSettingsControls from './AudioSettingsControls';
import PlayerReportDialog from './PlayerReportDialog';
import type { MatchMusicTrackId } from '../services/audioService';
import type { PlayerReportKind } from '../services/playerReportService';
import ShipCarousel from './ShipCarousel';
import BossArchive, {
  type BossArchiveDeveloperControls,
  type BossArchiveFightRequest,
  type BossArchiveResult
} from './BossArchive';
import RewardCenter, { type RewardTab } from './RewardCenter';
import {
  BOSS_ARCHIVE_CATALOG,
  getUnlockedBossArchiveEntries,
  type BossArchiveEntry
} from '../services/bossArchive';
import {
  type BossArchiveDailyChargeStatus
} from '../services/bossArchiveProgression';
import {
  getClaimableAchievementCount,
  getDailyGiftStatus,
  type AchievementId,
  type DailyGiftReward
} from '../services/rewardProgression';
import { CAMPAIGN_MISSIONS } from '../services/campaignProgression';
import type {
  MainShipUpgradeId,
  MiniShipId,
  PermanentSquadState,
  SquadSlotId,
  WeeklySquadState
} from '../services/squadProgression';
import {
  CAMPAIGN_MISSION_MASTERY_STARS,
  MAIN_SHIP_UPGRADES,
  WEEKLY_RUN_ATTEMPT_LIMIT
} from '../services/squadProgression';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';

interface StartScreenProps {
  onStart: () => void;
  onOpenCampaignMap?: () => void;
  campaignNotificationCount?: number;
  campaignCheckpoint: {
    action: 'Start Mission' | 'Continue Mission' | 'Next Mission' | 'Replay Final Mission';
    missionNumber: number;
    missionName: string;
    waveNumber: number;
    waveTotal: number;
  };
  allTimeLeaderboard: LeaderboardEntry[];
  monthlyLeaderboard: LeaderboardEntry[];
  archivedWinners: ArchivedWinner[];
  weeklyPresentationTime?: number;
  walletRecords: MintRecord[];
  walletRuns: WalletRunRecord[];
  walletRunsLoading: boolean;
  walletRunsError?: string;
  onRetryWalletRuns?: () => void;
  weeklyProposalRecovery?: WeeklyProposalRecovery | null;
  onOpenWeeklyLeaderProposal?: (record: WalletRunRecord) => void;
  walletAddress?: string | null;
  selectedShipId: PlayerShipId;
  shipUnlocks: PlayerShipUnlocks;
  onSelectShip: (shipId: PlayerShipId) => void;
  isLoading: boolean;
  proposals: ResearchHubProposal[];
  proposalReferences?: ResearchHubProposal[];
  proposalStatus: ProposalFeedStatus;
  onOpenReferral: () => void;
  onOpenBaseAppReferral: () => void;
  onOpenFund: () => void;
  onOpenProposal: (url: string) => void;
  onOpenTreasurySend: () => void;
  onOpenSwap: () => void;
  onOpenRscInBase: () => void;
  onOpenWalletRun: (record: WalletRunRecord) => void;
  walletControl?: React.ReactNode;
  championClaimStatus: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error';
  championClaimMessage?: string;
  onClaimWeeklyChampion: (winner: ArchivedWinner, proposal: ResearchHubProposal) => void;
  requestedChampionWinner?: ArchivedWinner | null;
  onCloseRequestedChampion?: () => void;
  testChampionWinner?: ArchivedWinner | null;
  onCloseTestChampionPreview?: () => void;
  weeklySquadState: WeeklySquadState;
  permanentSquadState: PermanentSquadState;
  onClaimDailyGift: () => DailyGiftReward | null;
  onClaimAchievement: (id: AchievementId) => number | null;
  onRequestWalletConnect: () => void;
  rscBalance: RscBalanceSnapshot | null;
  rscBalanceStatus: 'idle' | 'loading' | 'ready' | 'error';
  walletPurchaseStatus: WalletPurchaseStatusUpdate;
  playerShipPurchaseStatus: PlayerShipPurchaseStatusUpdate;
  onPurchaseWithRsc: (skuId: RscPurchaseSkuId) => void;
  onPurchasePlayerShip: (skuId: PlayerShipPurchaseSkuId) => void;
  onRefreshPlayerShipAccess: () => void;
  onRefreshRscBalance: () => void;
  audioMuted: boolean;
  sfxVolumeLevel: number;
  musicVolumeLevel: number;
  matchMusicTrackId: MatchMusicTrackId;
  onToggleAudio: () => void;
  onSfxVolumeChange: (level: number) => void;
  onMusicVolumeChange: (level: number) => void;
  onMatchMusicTrackChange: (trackId: MatchMusicTrackId) => void;
  onBossArchiveViewed?: (eventId: string) => void;
  onBossArchiveSelection?: (eventId: string) => void;
  onStartBossFight?: (entry: BossArchiveEntry, request: BossArchiveFightRequest) => void;
  bossArchiveDailyChargeStatus?: BossArchiveDailyChargeStatus;
  bossArchiveResult?: BossArchiveResult | null;
  onDismissBossArchiveResult?: () => void;
  bossArchiveLaunchError?: string | null;
  onDismissBossArchiveLaunchError?: () => void;
  /** Opens the standalone limited-attempt Weekly Run gauntlet. */
  onStartWeeklyRun?: () => void;
  /** Restarts the progressive flight guide from More without resetting game progress. */
  onRestartOnboarding?: () => void;
  weeklyRunLaunchError?: string | null;
  onDismissWeeklyRunLaunchError?: () => void;
  weeklyRunBestScore?: number | null;
  weeklyRunAttemptsRemaining?: number;
  weeklyRunAttemptQuotaUnknown?: boolean;
  bossArchiveDeveloperControls?: BossArchiveDeveloperControls | null;
  founderSandbox?: boolean;
  onUnlockSquadSlot: (slot: SquadSlotId) => void;
  onPurchaseMiniShip: (id: MiniShipId) => void;
  onUpgradeMiniShip: (id: MiniShipId) => void;
  onDowngradeMiniShip: (id: MiniShipId) => void;
  onEquipMiniShip: (slot: SquadSlotId, id: MiniShipId | null) => void;
  onUpgradeMainShip: (id: MainShipUpgradeId) => void;
  onDowngradeMainShip: (id: MainShipUpgradeId) => void;
}

type LeaderboardView = 'weekly' | 'allTime' | 'pastPicks' | 'records';

/**
 * The Trophy Deck covers two unrelated things: the Weekly Run competition
 * (scores, champion picks, confirmed funding) and Campaign progression. They
 * were interleaved in one flat tab strip, which implied Campaign feeds the
 * leaderboard. It does not -- Campaign records no score at all.
 */
type TrophyCategory = 'weeklyFunding' | 'campaign';

/**
 * Campaign's half of the Trophy Deck. Deliberately shows no score and no rank:
 * Campaign is about progression, and the competition lives entirely in the
 * Weekly Run.
 */
const CampaignTrophyPanel = ({ state }: { state: PermanentSquadState }) => {
  const stats = state.lifetimeStats;
  const progress = state.campaignProgress;
  const missionRecordEntries = Object.entries(progress?.missionRecords ?? {});
  const missionRecords = missionRecordEntries.map(([, record]) => record);
  const completed = missionRecords.filter((record) => record.completed).length;
  const totalStars = missionRecords.reduce((sum, record) => sum + (record.stars ?? 0), 0);
  const bossArchiveUnlocked = state.bossArchive?.unlockedEventIds?.length ?? 0;
  const authoredMissionTotal = CAMPAIGN_MISSIONS.length;
  const authoredStarTotal = authoredMissionTotal * CAMPAIGN_MISSION_MASTERY_STARS;
  const eliteCheckpointMissionIds = CAMPAIGN_MISSIONS
    .filter((mission) => mission.missionRole === 'elite-checkpoint')
    .map((mission) => mission.id);
  const eliteCheckpointsCompleted = missionRecordEntries.filter(([missionId, record]) => (
    record.completed && eliteCheckpointMissionIds.includes(missionId)
  )).length;
  const authoredHangarUpgradeTotal = PLAYABLE_PLAYER_SHIP_IDS.length
    * MAIN_SHIP_UPGRADES.reduce((sum, upgrade) => sum + upgrade.costs.length, 0);

  const rows: Array<{ label: string; value: number; total: number; hint: string }> = [
    { label: 'Missions cleared', value: Math.min(completed, authoredMissionTotal), total: authoredMissionTotal, hint: 'First clears across the Campaign graph' },
    { label: 'Missions mastered', value: Math.min(stats.campaignMissionsMastered, authoredMissionTotal), total: authoredMissionTotal, hint: 'Every objective met' },
    { label: 'Stars earned', value: Math.min(totalStars, authoredStarTotal), total: authoredStarTotal, hint: 'Three per Mission at full mastery' },
    { label: 'Elite encounters cleared', value: eliteCheckpointsCompleted, total: eliteCheckpointMissionIds.length, hint: 'Unique elite-checkpoint Missions cleared' },
    { label: 'Bosses archived', value: Math.min(bossArchiveUnlocked, BOSS_ARCHIVE_CATALOG.length), total: BOSS_ARCHIVE_CATALOG.length, hint: 'Unlocked for replay' },
    { label: 'Hangar upgrades', value: Math.min(stats.hangarUpgradesPurchased, authoredHangarUpgradeTotal), total: authoredHangarUpgradeTotal, hint: 'Permanent main-hull upgrades purchased' }
  ];

  return (
    <div className="sci-campaign-trophies">
      {rows.map((row) => (
        <div key={row.label} className="sci-campaign-trophies__row">
          <div className="min-w-0">
            <p className="sci-campaign-trophies__label">{row.label}</p>
            <p className="sci-campaign-trophies__hint">{row.hint}</p>
          </div>
          <strong className="sci-campaign-trophies__value">
            {formatNumber(row.value)} / {formatNumber(row.total)}
          </strong>
        </div>
      ))}
      <p className="sci-campaign-trophies__note">
        Campaign records no score. High scores and funding picks belong to the Weekly Run.
      </p>
    </div>
  );
};
type DashboardTab = 'home' | 'proposals' | 'trophies' | 'more' | 'hangar';
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

const DASHBOARD_ICON_ROOT = '/game-art/generated/ui/scicon-dashboard-icons-v1';
const MORE_MENU_ICON_ROOT = '/game-art/generated/ui/scicon-dashboard-icons-v1/normal';
const SCICON_NEON_DASHBOARD_ICON_ROOT = '/game-art/generated/ui/scicon-neon-dashboard-icons-v2';
const DASHBOARD_NAV_ICON_SPRITESHEET = `${SCICON_NEON_DASHBOARD_ICON_ROOT}/dashboard-nav-icons-static.png`;
const COMMUNICATION_ICON_ROOT = '/game-art/generated/ui/scicon-interface-pack-v1/icons/communication';
// Regenerate with tools/generate-referral-qr.mjs whenever REFERRAL_LINK changes.
const RESEARCHHUB_REFERRAL_QR = '/game-art/generated/ui/scicon-desktop-mobile-launch-v1/researchhub-referral-qr.png';
const BASE_APP_REFERRAL_QR = '/game-art/generated/ui/scicon-desktop-mobile-launch-v1/base-app-invite-qr.png';

const useDialogFocusRestoration = (
  open: boolean,
  dialogRef: { readonly current: HTMLElement | null },
  initialFocusRef: { readonly current: HTMLElement | null }
) => {
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previousFocus && document.body.contains(previousFocus)) previousFocus.focus();
    };
  }, [dialogRef, initialFocusRef, open]);
};

const trapDialogFocus = (
  event: React.KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  close: () => void
) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  ) ?? []);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};
// Weekly Run headline facts, sourced from the gauntlet route so the card can
// never drift from what the mode actually does.

const REWARD_EDGE_ARROW = '/game-art/generated/ui/scicon-reward-edge-v1/reward-arrow.png';
const REWARD_ACHIEVEMENT_ICON = '/game-art/generated/ui/scicon-ui-system-v2/base/achievements-more/achievement-unlocked-card.png';

const dashboardTabs: Array<{
  id: DashboardTab;
  label: string;
  hint: string;
  spriteColumn: 0 | 1 | 2 | 3 | 4;
}> = [
  {
    id: 'proposals',
    label: 'Proposals',
    hint: 'Live',
    spriteColumn: 0
  },
  {
    id: 'trophies',
    label: 'Trophies',
    hint: 'Rank',
    spriteColumn: 1
  },
  {
    id: 'home',
    label: 'Home',
    hint: 'Mission',
    spriteColumn: 2
  },
  {
    id: 'hangar',
    label: 'Hangar',
    hint: 'Squad',
    spriteColumn: 3
  },
  {
    id: 'more',
    label: 'More',
    hint: 'About',
    spriteColumn: 4
  }
];

const playerShipOrder: PlayerShipId[] = [...PLAYABLE_PLAYER_SHIP_IDS];
const WEEKLY_EMPTY_TROPHY = '/game-art/generated/ui/scicon-interface-pack-v1/resources/trophy.png';

const PODIUM_ASSET_ROOT = '/game-art/generated/ui/scicon-ui-system-v2';
const FIRST_PLACE_ANIMATION_ROOT = `${PODIUM_ASSET_ROOT}/animations/first-place-row-idle/parts`;

const podiumRowAssets = {
  first: `${PODIUM_ASSET_ROOT}/base/leaderboard-podium/first-place-row.png`
} as const;

const hasViewableMissionRecord = (entry: LeaderboardEntry) => (
  /^[0-9a-f-]{36}$/i.test(entry.runId || '')
);

const formatNumber = (value?: number) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString()
    : '0'
);

const formatRunDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recent run';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const FirstPlaceLivingRow = ({
  entry,
  onOpen
}: {
  entry?: LeaderboardEntry;
  onOpen: (entry: LeaderboardEntry) => void;
}) => {
  const recordAvailable = entry ? hasViewableMissionRecord(entry) : false;

  return (
    <button
      type="button"
      className="sci-first-place-row"
      onClick={() => entry && recordAvailable && onOpen(entry)}
      disabled={!recordAvailable}
      aria-label={entry ? `${entry.name}, first place with ${formatNumber(entry.score)} points` : 'First place is open'}
    >
      <img className="sci-first-place-row__base" src={podiumRowAssets.first} alt="" aria-hidden="true" />
      <span className="sci-first-place-row__machinery" aria-hidden="true">
        <img className="sci-first-place-turbine sci-first-place-turbine--left" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-turbine-housing.png`} alt="" />
        <img className="sci-first-place-turbine-blades sci-first-place-turbine-blades--left" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-turbine-blades.png`} alt="" />
        <img className="sci-first-place-turbine sci-first-place-turbine--right" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-turbine-housing.png`} alt="" />
        <img className="sci-first-place-turbine-blades sci-first-place-turbine-blades--right" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-turbine-blades.png`} alt="" />
        <span className="sci-first-place-crown">
          {[0, 1, 2, 3].map((state) => (
            <img
              key={state}
              className={`sci-first-place-crown__state sci-first-place-crown__state--${state}`}
              src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-crown-diamond-${state}.png`}
              alt=""
            />
          ))}
        </span>
        <span className="sci-first-place-lamps">
          {Array.from({ length: 12 }, (_, index) => (
            <img
              key={index}
              className={`sci-first-place-lamp sci-first-place-lamp--${index}`}
              src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-rail-lamp-5.png`}
              alt=""
            />
          ))}
        </span>
        <img className="sci-first-place-spark" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-pixel-spark.png`} alt="" />
        <img className="sci-first-place-gold-pixels" src={`${FIRST_PLACE_ANIMATION_ROOT}/first-place-gold-pixels.png`} alt="" />
      </span>
      <span className="sci-first-place-row__content">
        <span className="sci-first-place-row__rank"><strong>1</strong><small>Champion</small></span>
        <span className="sci-first-place-row__identity">
          <strong>{entry?.name ?? 'First place open'}</strong>
          <small>{entry ? (entry.proposalTitle ?? `Mission ${entry.wave ?? '-'}`) : 'Be the first pilot on the board'}</small>
        </span>
        <span className="sci-first-place-row__score"><strong>{formatNumber(entry?.score)}</strong><small>Points</small></span>
      </span>
    </button>
  );
};

const getWeeklyAllocationMeta = (now = new Date()) => ({
  ...getWeeklyPresentationMeta(now),
  allocationRsc: WEEKLY_ALLOCATION_RSC
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

const HudPanel: React.FC<React.HTMLAttributes<HTMLElement>> = ({ children, className = '', style, ...props }) => (
  <section
    {...props}
    style={style}
    className={`relative overflow-hidden rounded-[8px] border border-cyan-300/20 bg-slate-950/72 shadow-[0_0_30px_rgba(8,145,178,0.16)] backdrop-blur-xl ${className}`}
  >
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.12),transparent_36%),linear-gradient(135deg,rgba(34,211,238,0.08),transparent_42%,rgba(16,185,129,0.08))]" />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
    <div className="relative z-10 h-full min-h-0 w-full">{children}</div>
  </section>
);

const MoreMenuTile: React.FC<{
  label: string;
  icon: string;
  onClick?: () => void;
  href?: string;
}> = ({ label, icon, onClick, href }) => {
  const content = (
    <>
      <span className="sci-more-menu-tile__art" aria-hidden="true">
        <img src={icon} alt="" className="sci-more-menu-tile__icon" />
      </span>
      <span className="sci-more-menu-tile__label">{label}</span>
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="sci-more-menu-tile">
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className="sci-more-menu-tile">
      {content}
    </button>
  );
};

const StartScreen: React.FC<StartScreenProps> = ({
  onStart,
  onOpenCampaignMap,
  campaignNotificationCount = 0,
  campaignCheckpoint,
  allTimeLeaderboard,
  monthlyLeaderboard,
  archivedWinners,
  weeklyPresentationTime,
  walletRecords,
  walletRuns,
  walletRunsLoading,
  walletRunsError = '',
  onRetryWalletRuns,
  weeklyProposalRecovery = null,
  onOpenWeeklyLeaderProposal,
  walletAddress,
  selectedShipId,
  shipUnlocks,
  onSelectShip,
  isLoading,
  proposals,
  proposalReferences = [],
  proposalStatus,
  onOpenReferral,
  onOpenBaseAppReferral,
  onOpenFund,
  onOpenProposal,
  onOpenTreasurySend,
  onOpenSwap,
  onOpenRscInBase,
  onOpenWalletRun,
  walletControl,
  championClaimStatus,
  championClaimMessage,
  onClaimWeeklyChampion,
  requestedChampionWinner = null,
  onCloseRequestedChampion,
  testChampionWinner = null,
  onCloseTestChampionPreview,
  weeklySquadState,
  permanentSquadState,
  onClaimDailyGift,
  onClaimAchievement,
  onRequestWalletConnect,
  rscBalance,
  rscBalanceStatus,
  walletPurchaseStatus,
  playerShipPurchaseStatus,
  onPurchaseWithRsc,
  onPurchasePlayerShip,
  onRefreshPlayerShipAccess,
  onRefreshRscBalance,
  audioMuted,
  sfxVolumeLevel,
  musicVolumeLevel,
  matchMusicTrackId,
  onToggleAudio,
  onSfxVolumeChange,
  onMusicVolumeChange,
  onMatchMusicTrackChange,
  onBossArchiveViewed,
  onBossArchiveSelection,
  onStartBossFight,
  bossArchiveDailyChargeStatus,
  bossArchiveResult = null,
  onDismissBossArchiveResult,
  bossArchiveLaunchError = null,
  onDismissBossArchiveLaunchError,
  onStartWeeklyRun,
  onRestartOnboarding,
  weeklyRunLaunchError = null,
  onDismissWeeklyRunLaunchError,
  weeklyRunBestScore = null,
  weeklyRunAttemptsRemaining = WEEKLY_RUN_ATTEMPT_LIMIT,
  weeklyRunAttemptQuotaUnknown = false,
  bossArchiveDeveloperControls = null,
  founderSandbox = false,
  onUnlockSquadSlot,
  onPurchaseMiniShip,
  onUpgradeMiniShip,
  onDowngradeMiniShip,
  onEquipMiniShip,
  onUpgradeMainShip,
  onDowngradeMainShip
}) => {
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>('weekly');
  const walletActivityView = getWalletActivityViewState({
    connected: Boolean(walletAddress),
    loading: walletRunsLoading,
    hasError: Boolean(walletRunsError),
    runCount: walletRuns.length
  });
  const [trophyCategory, setTrophyCategory] = useState<TrophyCategory>('weeklyFunding');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>(() => {
    if (testChampionWinner || requestedChampionWinner) return 'proposals';
    const requested = new URLSearchParams(window.location.search).get('view');
    return requested === 'hangar'
      || requested === 'proposals'
      || requested === 'trophies'
      || requested === 'more'
      ? requested
      : 'home';
  });
  const [proposalSearch, setProposalSearch] = useState('');
  const [playerReportKind, setPlayerReportKind] = useState<PlayerReportKind | null>(null);
  const [showTreasury, setShowTreasury] = useState(false);
  const [showRscAcquire, setShowRscAcquire] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [moreAudioExpanded, setMoreAudioExpanded] = useState(false);
  const [referralCopyStatus, setReferralCopyStatus] = useState<Record<'researchhub' | 'base', 'idle' | 'copied' | 'error'>>({
    researchhub: 'idle',
    base: 'idle'
  });
  const [showLegal, setShowLegal] = useState(false);
  const [showRewardCenter, setShowRewardCenter] = useState(false);
  const [showBossArchive, setShowBossArchive] = useState(() => (
    new URLSearchParams(window.location.search).get('view') === 'bosses'
  ));
  const [bossArchiveOpenedNewIds, setBossArchiveOpenedNewIds] = useState<string[]>([]);
  const [bossArchiveDevUnlockAll, setBossArchiveDevUnlockAll] = useState(false);
  const [bossArchiveDevShowLocked, setBossArchiveDevShowLocked] = useState(true);
  const [showWeeklyProposalReminder, setShowWeeklyProposalReminder] = useState(false);
  const [rewardCenterInitialTab, setRewardCenterInitialTab] = useState<RewardTab>('daily');
  const [treasuryCopyStatus, setTreasuryCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [championClaimWinner, setChampionClaimWinner] = useState<ArchivedWinner | null>(null);
  const [testSelectedProposal, setTestSelectedProposal] = useState<ResearchHubProposal | null>(null);
  const [shipFocusId, setShipFocusId] = useState<PlayerShipId>(selectedShipId);
  const [homeShipAccessId, setHomeShipAccessId] = useState<PlayerShipAccessId | null>(null);
  const [shipLockNudgeRevision, setShipLockNudgeRevision] = useState(0);
  const [weeklyClock, setWeeklyClock] = useState(() => Date.now());
  const [selectedLeaderboardRecord, setSelectedLeaderboardRecord] = useState<LeaderboardEntry | null>(null);
  const [leaderboardRecordStatus, setLeaderboardRecordStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [weeklyWinnerSlide, setWeeklyWinnerSlide] = useState<'pilot' | 'proposal'>('pilot');
  const [weeklyWinnerAutoPaused, setWeeklyWinnerAutoPaused] = useState(false);
  const proposalReminderShownRef = useRef(new Map<string, number>());
  const weeklyProposalReminderRef = useRef<HTMLElement>(null);
  const weeklyProposalReminderPrimaryRef = useRef<HTMLButtonElement>(null);
  const rscAcquireDialogRef = useRef<HTMLElement>(null);
  const rscAcquirePrimaryRef = useRef<HTMLButtonElement>(null);
  const referralDialogRef = useRef<HTMLElement>(null);
  const referralCloseRef = useRef<HTMLButtonElement>(null);
  useDialogFocusRestoration(showRscAcquire, rscAcquireDialogRef, rscAcquirePrimaryRef);
  useDialogFocusRestoration(showReferral, referralDialogRef, referralCloseRef);
  const treasuryAddress = DONATION_CONFIG.RECIPIENT_ADDRESS;
  const weeklyProposalRunId = weeklyProposalRecovery?.record.receipt.runId ?? null;
  const weeklyProposalNeedsAttention = Boolean(weeklyProposalRecovery?.needsProposal);
  const weeklyProposalAttentionReason = weeklyProposalRecovery?.attentionReason ?? null;
  const weeklyProposalReminderKey = weeklyProposalRecovery?.reminderStorageKey ?? null;
  const dailyGiftStatus = getDailyGiftStatus(permanentSquadState, new Date(weeklyClock));
  const claimableAchievementCount = useMemo(
    () => getClaimableAchievementCount(permanentSquadState),
    [permanentSquadState]
  );
  const hasRewardReady = dailyGiftStatus.isAvailable || claimableAchievementCount > 0;
  const earnedBossArchiveEntries = useMemo(() => (
    getUnlockedBossArchiveEntries(permanentSquadState.bossArchive.unlockedEventIds)
  ), [permanentSquadState.bossArchive.unlockedEventIds]);
  const bossArchiveDevelopmentAccess = Boolean(
    founderSandbox || bossArchiveDeveloperControls?.enabled
  );
  const availableBossArchiveEntries = bossArchiveDevelopmentAccess && bossArchiveDevUnlockAll
    ? BOSS_ARCHIVE_CATALOG
    : earnedBossArchiveEntries;
  const newBossArchiveEventIds = useMemo(() => {
    const seen = new Set(permanentSquadState.bossArchive.seenEventIds);
    return earnedBossArchiveEntries
      .map((entry) => entry.eventId)
      .filter((eventId) => !seen.has(eventId));
  }, [earnedBossArchiveEntries, permanentSquadState.bossArchive.seenEventIds]);
  const bossArchiveNotificationCount = newBossArchiveEventIds.length;
  const canOpenBossArchive = Boolean(onStartBossFight) && (
    availableBossArchiveEntries.length > 0 || bossArchiveDevelopmentAccess
  );

  const openBossArchive = () => {
    if (!canOpenBossArchive) return;
    setBossArchiveOpenedNewIds(newBossArchiveEventIds);
    setShowBossArchive(true);
  };

  const closeBossArchive = () => {
    setShowBossArchive(false);
    setBossArchiveOpenedNewIds([]);
  };
  const openRewardCenter = (initialTab: RewardTab = 'daily') => {
    setRewardCenterInitialTab(initialTab);
    setShowRewardCenter(true);
  };

  const openRecoverableWeeklyProposal = () => {
    if (!weeklyProposalRecovery || !onOpenWeeklyLeaderProposal) return;
    setShowWeeklyProposalReminder(false);
    onOpenWeeklyLeaderProposal(weeklyProposalRecovery.record);
  };

  useEffect(() => {
    [DASHBOARD_NAV_ICON_SPRITESHEET].forEach((source) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = source;
    });
  }, []);

  useEffect(() => {
    if (testChampionWinner) return;
    const url = new URL(window.location.href);
    if (showBossArchive && canOpenBossArchive) url.searchParams.set('view', 'bosses');
    else if (dashboardTab === 'home') url.searchParams.delete('view');
    else url.searchParams.set('view', dashboardTab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [canOpenBossArchive, dashboardTab, showBossArchive, testChampionWinner]);

  useEffect(() => {
    if (!showBossArchive) return;
    if (!canOpenBossArchive) {
      setShowBossArchive(false);
      return;
    }
    if (newBossArchiveEventIds.length > 0) {
      setBossArchiveOpenedNewIds((current) => {
        const merged = new Set(current);
        let changed = false;
        newBossArchiveEventIds.forEach((eventId) => {
          if (merged.has(eventId)) return;
          merged.add(eventId);
          changed = true;
        });
        return changed ? Array.from(merged) : current;
      });
    }
  }, [
    canOpenBossArchive,
    newBossArchiveEventIds,
    showBossArchive
  ]);

  useEffect(() => {
    const requestedWinner = testChampionWinner || requestedChampionWinner;
    if (!requestedWinner) return;
    setChampionClaimWinner(requestedWinner);
    setTestSelectedProposal(null);
    setDashboardTab('proposals');
  }, [requestedChampionWinner, testChampionWinner]);

  useEffect(() => {
    let midnightTimer: number | undefined;
    const refreshClock = () => setWeeklyClock(Date.now());
    const scheduleNextMidnight = (): void => {
      if (midnightTimer !== undefined) window.clearTimeout(midnightTimer);
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        0,
        40
      );
      midnightTimer = window.setTimeout(() => {
        refreshClock();
        scheduleNextMidnight();
      }, Math.max(250, nextMidnight.getTime() - now.getTime()));
    };
    const handleResume = () => {
      refreshClock();
      scheduleNextMidnight();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') handleResume();
    };

    const minuteTimer = window.setInterval(refreshClock, 60_000);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNextMidnight();
    return () => {
      window.clearInterval(minuteTimer);
      if (midnightTimer !== undefined) window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!weeklyProposalNeedsAttention || !weeklyProposalReminderKey || dashboardTab !== 'home') {
      setShowWeeklyProposalReminder(false);
      return;
    }

    let persistedReminderAt: number | null = null;
    try {
      persistedReminderAt = parseWeeklyProposalReminderTimestamp(
        window.localStorage.getItem(weeklyProposalReminderKey)
      );
    } catch {
      // Private browsing can deny storage; the in-memory timestamp still
      // enforces the four-hour window for this app session.
    }
    const sessionReminderAt = proposalReminderShownRef.current.get(weeklyProposalReminderKey) ?? null;
    const lastReminderAt = Math.max(persistedReminderAt ?? 0, sessionReminderAt ?? 0) || null;
    if (!isWeeklyProposalReminderDue(weeklyClock, lastReminderAt)) return;

    proposalReminderShownRef.current.set(weeklyProposalReminderKey, weeklyClock);
    try {
      window.localStorage.setItem(
        weeklyProposalReminderKey,
        serializeWeeklyProposalReminderTimestamp(weeklyClock)
      );
    } catch {
      // The reminder remains functional without persistent storage.
    }
    setShowWeeklyProposalReminder(true);
  }, [dashboardTab, weeklyClock, weeklyProposalNeedsAttention, weeklyProposalReminderKey]);

  useEffect(() => {
    if (!showWeeklyProposalReminder) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => {
      weeklyProposalReminderPrimaryRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (
        previousFocus
        && document.body.contains(previousFocus)
        && !document.querySelector('[aria-labelledby="weekly-proposal-selection-title"]')
      ) {
        previousFocus.focus();
      }
    };
  }, [showWeeklyProposalReminder]);

  const handleWeeklyProposalReminderKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setShowWeeklyProposalReminder(false);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = Array.from(weeklyProposalReminderRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    ) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  useEffect(() => {
    setShipFocusId(selectedShipId);
  }, [selectedShipId]);

  useEffect(() => {
    if (!selectedLeaderboardRecord) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedLeaderboardRecord(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedLeaderboardRecord]);

  const openLeaderboardRecord = (entry: LeaderboardEntry) => {
    if (!hasViewableMissionRecord(entry)) return;
    setLeaderboardRecordStatus('loading');
    setSelectedLeaderboardRecord(entry);
  };

  const focusedShip = PLAYER_SHIPS[shipFocusId];
  const focusedShipLocked = !isPlayerShipUnlocked(shipFocusId, shipUnlocks);
  const getShipUnlockMessage = (shipId: PlayerShipId) => shipId === 'bio'
    ? 'Hold at least 100 BIO on Base to fly this ship.'
    : shipId === 'eth'
      ? 'Unlock permanently for 0.001 ETH on Base.'
      : shipId === 'btc'
        ? `Earn all ${shipUnlocks.campaignStarsTotal} Campaign stars or unlock for 0.00008 cbBTC on Base.`
        : 'This ship is ready.';

  const requestHangar = () => setDashboardTab('hangar');

  const requestFocusedShip = () => {
    if (focusedShipLocked) {
      setShipLockNudgeRevision((revision) => revision + 1);
      if (shipFocusId !== 'researchhub') setHomeShipAccessId(shipFocusId);
      return;
    }

    requestHangar();
  };

  const weeklyAllocation = useMemo(
    () => getWeeklyAllocationMeta(new Date(weeklyPresentationTime ?? weeklyClock)),
    [weeklyClock, weeklyPresentationTime]
  );
  const sortedProposals = useMemo(() => sortProposalsByFunding(proposals), [proposals]);

  const filteredProposals = useMemo(() => {
    const query = proposalSearch.trim().toLowerCase();
    if (!query) return sortedProposals;
    return sortedProposals.filter((proposal) => (
      `${proposal.title} ${proposal.author} ${proposal.organization ?? ''}`.toLowerCase().includes(query)
    ));
  }, [proposalSearch, sortedProposals]);

  const weeklyStartTime = weeklyAllocation.startsAt.getTime();
  const weeklyEndTime = weeklyAllocation.endsAt.getTime();
  const activeWeeklyLeaderboard = useMemo(() => (
    monthlyLeaderboard.filter((entry) => {
      const scoreTime = new Date(entry.date || 0).getTime();
      return Number.isFinite(scoreTime) && scoreTime >= weeklyStartTime && scoreTime < weeklyEndTime;
    })
  ), [monthlyLeaderboard, weeklyEndTime, weeklyStartTime]);
  const weeklyLeader = activeWeeklyLeaderboard[0];

  const sortedPastPicks = useMemo(() => (
    [...archivedWinners].sort((a, b) => getPastPickTime(b) - getPastPickTime(a))
  ), [archivedWinners]);

  const visibleLeaderboard = leaderboardView === 'weekly'
    ? activeWeeklyLeaderboard
    : leaderboardView === 'allTime'
      ? allTimeLeaderboard
      : [];
  const displayedLeaderboard = leaderboardView === 'weekly'
    ? visibleLeaderboard.slice(0, WEEKLY_SCORE_LIMIT)
    : leaderboardView === 'allTime'
      ? visibleLeaderboard.slice(0, ALL_TIME_SCORE_LIMIT)
      : visibleLeaderboard;

  const weeklyLeaderName = leaderboardName(weeklyLeader);
  const weeklyLeaderScore = leaderboardScore(weeklyLeader);
  const proposalReferencePool = useMemo(() => {
    const references = new Map<string, ResearchHubProposal>();
    proposals.forEach((proposal) => references.set(proposal.id, proposal));
    proposalReferences.forEach((proposal) => references.set(proposal.id, proposal));
    return Array.from(references.values());
  }, [proposalReferences, proposals]);
  const weeklyProposalSelection = useMemo(
    () => resolveProposalSelection(weeklyLeader, proposalReferencePool),
    [proposalReferencePool, weeklyLeader]
  );
  const weeklyFunding = weeklyProposalSelection?.liveProposal
    ? getProposalFundingMetrics(weeklyProposalSelection.liveProposal)
    : null;
  const weeklyProposalCompleted = weeklyProposalSelection?.liveProposal
    ? isProposalExplicitlyCompleted(weeklyProposalSelection.liveProposal)
    : false;
  const weeklyProposalSelectionId = weeklyProposalSelection?.id ?? null;

  useEffect(() => {
    setWeeklyWinnerSlide('pilot');
  }, [weeklyProposalSelectionId]);

  useEffect(() => {
    if (!weeklyProposalSelectionId || weeklyWinnerAutoPaused) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const timer = window.setInterval(() => {
      setWeeklyWinnerSlide((current) => current === 'pilot' ? 'proposal' : 'pilot');
    }, 5_800);
    return () => window.clearInterval(timer);
  }, [weeklyProposalSelectionId, weeklyWinnerAutoPaused]);

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

  const renderProposalRow = (proposal: ResearchHubProposal, index: number, compact = false) => {
    const funding = getProposalFundingMetrics(proposal);
    const progressLabel = formatFundingPercent(funding.progressPercent);
    const tag = getProposalTag(proposal, index);

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
              <img
                src={proposal.imageUrl}
                alt=""
                className="h-full w-full rounded-[6px] object-cover"
                loading={index < 6 ? 'eager' : 'lazy'}
                decoding="async"
              />
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
                  style={{ width: `${funding.barPercent}%` }}
                />
              </div>
              <span className="w-12 text-right text-[0.68rem] font-semibold text-cyan-100">{progressLabel}</span>
            </div>
          </div>
          <div className="min-w-[6.75rem] text-right">
            {funding.currency ? (
              <>
                <p className="whitespace-nowrap text-xs font-black text-white">
                  {formatFundingAmount(funding.raisedAmount, funding.currency)} / {formatFundingAmount(funding.goalAmount, funding.currency)}
                </p>
                <p className="text-[0.54rem] font-bold uppercase text-cyan-200/70">{funding.currency} raised / goal</p>
              </>
            ) : (
              <>
                <p className="text-xs font-black text-slate-300">Not reported</p>
                <p className="text-[0.54rem] font-bold uppercase text-slate-500">Funding progress</p>
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderHeroPanel = ({ compact = false, fill = false }: { compact?: boolean; fill?: boolean } = {}) => (
    <HudPanel className={compact ? `sci-home-hero-surface sci-home-hero-surface--compact sci-mobile-hero min-h-[17.5rem] ${fill ? 'flex-1' : ''}` : 'sci-home-hero-surface min-h-[34rem] xl:min-h-[40rem]'}>
      <div className="sci-hero-backdrop absolute inset-0">
        <img src={ASSETS.HOME_SPARSE_STARFIELD_BASE} alt="" className="sci-hero-backdrop__image h-full w-full object-cover" />
        <img
          src={ASSETS.GAME_PARALLAX_BIG_PLANET}
          alt=""
          className="scicon-home-backdrop__planet scicon-home-backdrop__planet--red"
        />
        <img
          src={ASSETS.GAME_PARALLAX_RING_PLANET}
          alt=""
          className="scicon-home-backdrop__planet scicon-home-backdrop__planet--ring"
        />
        <div className="scicon-home-backdrop__sparse-field">
          <div className="scicon-home-backdrop__sparse-track">
            <img src={ASSETS.HOME_SPARSE_STARFIELD} alt="" />
            <img src={ASSETS.HOME_SPARSE_STARFIELD} alt="" />
          </div>
        </div>
        <div className="scicon-home-backdrop__asteroids">
          <div className="scicon-home-backdrop__asteroid-track">
            <img src={ASSETS.HOME_ASTEROID_FIELD} alt="" />
            <img src={ASSETS.HOME_ASTEROID_FIELD} alt="" />
          </div>
        </div>
        <div className="sci-hero-backdrop__glow absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(34,211,238,0.2),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.18),rgba(2,6,23,0.88)_76%,rgba(2,6,23,0.96))]" />
        <div className="sci-hero-backdrop__starwash absolute inset-0" />
        <div className="sci-hero-backdrop__floor absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent,rgba(4,120,87,0.09))]" />
      </div>

      <div className={`sci-hero-content relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-between px-4 text-center ${compact ? 'sci-hero-content--compact gap-1 py-2' : 'gap-6 py-7 md:px-8 md:py-10'}`}>
        {/* The wordmark and tagline are pure branding. On a phone that is the
            most valuable real estate on the screen, so the flight deck gives it
            to the ship, the Weekly Run, and Start Mission instead. The document
            title still names the game for assistive tech. */}
        {compact ? null : (
          <div className="sci-hero-brand flex flex-col items-center space-y-3 text-center">
            <div className="mx-auto flex w-fit items-center gap-3 text-yellow-200/90">
              <span className="h-px w-14 bg-gradient-to-r from-transparent to-yellow-200/80" />
              <span className="h-2 w-16 skew-x-[-28deg] bg-gradient-to-r from-yellow-500 via-yellow-200 to-yellow-500 shadow-[0_0_18px_rgba(250,204,21,0.45)]" />
              <span className="h-px w-14 bg-gradient-to-l from-transparent to-yellow-200/80" />
            </div>
            <div className="scicon-hero-title text-[3.2rem] md:text-[5rem] xl:text-[6.1rem]">
              <span>Scicon</span>
              <span>Shooter</span>
            </div>
            <p className="mx-auto max-w-xl text-xs font-bold uppercase text-cyan-50/85 md:text-sm">
              Fund research. Upgrade science. Win together.
            </p>
          </div>
        )}

        <div
          data-onboarding-target="home-flight-deck"
          className={`sci-hero-ship-stage relative flex w-full items-center justify-center ${compact ? 'sci-hero-ship-stage--compact' : 'min-h-[14rem]'}`}
        >
          <div className="sci-ship-orbit" />
          <div className="absolute bottom-2 h-12 w-64 rounded-[50%] border border-cyan-300/24 bg-cyan-300/7 blur-sm" />
          <div className="absolute bottom-7 h-7 w-56 rounded-[50%] border border-emerald-300/28 bg-emerald-300/8" />
          <ShipCarousel
            shipIds={playerShipOrder}
            focusedShipId={shipFocusId}
            compact={compact}
            isShipLocked={(shipId) => !isPlayerShipUnlocked(shipId, shipUnlocks)}
            getLockedMessage={getShipUnlockMessage}
            getShipAriaLabel={(shipId) => {
              const ship = PLAYER_SHIPS[shipId];
              return isPlayerShipUnlocked(shipId, shipUnlocks)
                ? `Open ${ship.name} Squad Hangar`
                : `${ship.name} locked. ${getShipUnlockMessage(shipId)}`;
            }}
            onFocusShip={setShipFocusId}
            onSettleShip={(shipId) => {
              if (isPlayerShipUnlocked(shipId, shipUnlocks)) onSelectShip(shipId);
            }}
            onActivateFocusedShip={requestFocusedShip}
            previousIcon={<Icon name="chevronLeft" className="h-6 w-6" strokeWidth={2.2} />}
            nextIcon={<Icon name="chevronRight" className="h-6 w-6" strokeWidth={2.2} />}
            lockIcon={<Icon name="lock" className="h-7 w-7" strokeWidth={2.2} />}
            lockNudgeRevision={shipLockNudgeRevision}
          />
        </div>

        <div className={`w-full max-w-xl ${compact ? 'space-y-2' : 'space-y-3'}`}>
          {walletControl || canOpenBossArchive || onOpenCampaignMap ? (
            <div
              data-boss-archive-command-row={canOpenBossArchive ? 'true' : 'false'}
              data-campaign-map-command-row={onOpenCampaignMap ? 'true' : 'false'}
              className="relative grid min-h-12 w-full grid-cols-[clamp(3.25rem,14vw,3.6rem)_minmax(0,1fr)_clamp(3.25rem,14vw,3.6rem)] items-center gap-2"
            >
              {canOpenBossArchive ? (
                <button
                  type="button"
                  onClick={openBossArchive}
                  data-boss-archive-trigger="true"
                  data-attention={bossArchiveNotificationCount > 0 ? 'true' : 'false'}
                  className="sci-home-command-icon sci-home-command-icon--boss group col-start-1 row-start-1 justify-self-start"
                  aria-label={bossArchiveNotificationCount > 0
                    ? `Open Boss Archive. ${bossArchiveNotificationCount} new ${bossArchiveNotificationCount === 1 ? 'item' : 'items'}.`
                    : 'Open Boss Archive'}
                  title="Boss Archive"
                >
                  <img
                    src="/game-art/generated/ui/scicon-neon-dashboard-icons-v2/boss-archive-defeated-emblem-v1.png"
                    alt=""
                    className="sci-home-command-icon__art sci-home-command-icon__art--boss"
                    aria-hidden="true"
                  />
                  {bossArchiveNotificationCount > 0 ? (
                    <span className="sci-home-command-icon__badge" aria-hidden="true">
                      {bossArchiveNotificationCount > 9 ? '9+' : bossArchiveNotificationCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <div
                data-boss-archive-wallet-slot="true"
                className="col-start-2 row-start-1 flex min-w-0 justify-center"
              >
                {walletControl}
              </div>
              {onOpenCampaignMap ? (
                <button
                  type="button"
                  onClick={onOpenCampaignMap}
                  data-campaign-map-trigger="true"
                  data-onboarding-target="campaign-map"
                  data-attention={campaignNotificationCount > 0 ? 'true' : 'false'}
                  className="sci-home-command-icon sci-home-command-icon--map group col-start-3 row-start-1 justify-self-end"
                  aria-label={campaignNotificationCount > 0
                    ? `Open Campaign Map. ${campaignNotificationCount} new campaign updates.`
                    : 'Open Campaign Map'}
                  title="Campaign Map"
                >
                  <img
                    src="/game-art/generated/ui/scicon-interface-pack-v1/buttons/navigation/map.png"
                    alt=""
                    className="sci-home-command-icon__art sci-home-command-icon__art--map"
                    aria-hidden="true"
                  />
                </button>
              ) : <span className="col-start-3" aria-hidden="true" />}
            </div>
          ) : null}
          {/* Names the mode next to its launch control, so Campaign and the
              Weekly Run read as a matched pair rather than two unlabelled
              buttons that happen to sit near each other. */}
          <p className="sci-campaign-mode-strip">
            <span className="sci-campaign-mode-strip__label">Campaign</span>
            <span className="sci-campaign-mode-strip__value">
              Mission {String(campaignCheckpoint.missionNumber).padStart(2, '0')}
            </span>
          </p>
          <PixelActionButton
            onClick={onStart}
            data-onboarding-target="campaign-start"
            aria-label={`${campaignCheckpoint.action}. Mission ${campaignCheckpoint.missionNumber}, ${campaignCheckpoint.missionName}.`}
            tone="green"
            ready
            shine
            className={`sci-start-button group mx-auto w-full max-w-[26rem] font-black uppercase ${compact ? 'min-h-[4.25rem] px-6 py-3 text-lg' : 'min-h-[5rem] px-8 py-4 text-xl md:text-2xl'}`}
          >
            <span className="flex items-center justify-center gap-3">
              <span className={`sci-start-button__play flex items-center justify-center text-emerald-950 transition group-hover:scale-105 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
                <Icon name="play" className="h-5 w-5 translate-x-0.5" />
              </span>
              <span>{campaignCheckpoint.action}</span>
            </span>
          </PixelActionButton>
          {!compact ? <p className="text-sm font-bold text-emerald-200">Complete. Earn. Fund.</p> : null}
        </div>
      </div>
    </HudPanel>
  );

  /** Standalone Weekly Run entry. Deliberately a sibling of the funding
   *  panel, not a child, so the competition and the way to enter it are two
   *  separate boxes instead of one crowded card. */
  const renderWeeklyRunEntry = () => {
    const needsServerVerification = weeklyRunAttemptQuotaUnknown
      && weeklyRunAttemptsRemaining <= 0;
    const attemptsExhausted = weeklyRunAttemptsRemaining <= 0
      && !needsServerVerification;
    const weeklyRunEntryState = attemptsExhausted
      ? 'exhausted'
      : needsServerVerification
        ? 'checking'
        : 'available';
    const attemptLabel = `${weeklyRunAttemptsRemaining} Attempt${weeklyRunAttemptsRemaining === 1 ? '' : 's'} Left`;

    return onStartWeeklyRun ? (
      <>
        <button
          type="button"
          className="sci-weekly-run-entry"
          data-onboarding-target="weekly-run"
          data-state={weeklyRunEntryState}
          data-attempts-remaining={weeklyRunAttemptsRemaining}
          onClick={onStartWeeklyRun}
          disabled={attemptsExhausted}
          aria-label={weeklyRunAttemptsRemaining > 0
            ? `Play Weekly Run. ${weeklyRunAttemptsRemaining} attempt${weeklyRunAttemptsRemaining === 1 ? '' : 's'} remain, with endless escalating waves and bosses scored on the weekly board. Best this week ${formatNumber(weeklyRunBestScore ?? 0)}.`
            : needsServerVerification
              ? `Check Weekly Run attempts with the server. Best this week ${formatNumber(weeklyRunBestScore ?? 0)}.`
              : `Weekly Run attempts used. Best this week ${formatNumber(weeklyRunBestScore ?? 0)}.`}
        >
          <span className="sci-weekly-run-entry__copy">
            <span className="sci-weekly-run-entry__title">
              Weekly Run
            </span>
            <span className="sci-weekly-run-entry__sub">
              {weeklyRunAttemptsRemaining > 0
                ? attemptLabel
                : needsServerVerification
                  ? 'Checking Wallet Attempts'
                  : 'No Attempts Left'}
            </span>
          </span>
          <span className="sci-weekly-run-entry__action" aria-hidden="true">
            <span>{weeklyRunEntryState === 'available'
              ? 'Try Here'
              : weeklyRunEntryState === 'checking'
                ? 'Check Entry'
                : 'No Attempts'}</span>
            {weeklyRunEntryState === 'available' ? <Icon name="play" className="h-3 w-3" /> : null}
          </span>
        </button>
        {weeklyRunLaunchError ? (
          <div
            className="mt-1 flex items-center justify-between gap-2 border border-red-300/35 bg-red-950/75 px-3 py-2 text-left text-[0.68rem] font-bold text-red-100"
            role="alert"
          >
            <span>{weeklyRunLaunchError}</span>
            {onDismissWeeklyRunLaunchError ? (
              <button
                type="button"
                className="shrink-0 text-cyan-100 underline decoration-cyan-300/60 underline-offset-2"
                onClick={onDismissWeeklyRunLaunchError}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        ) : null}
      </>
    ) : null;
  };

  const handleCopyReferral = async (destination: 'researchhub' | 'base', url: string) => {
    try {
      await copyTextWithFallback(url);
      setReferralCopyStatus((current) => ({ ...current, [destination]: 'copied' }));
      window.setTimeout(() => {
        setReferralCopyStatus((current) => ({ ...current, [destination]: 'idle' }));
      }, 1800);
    } catch {
      setReferralCopyStatus((current) => ({ ...current, [destination]: 'error' }));
    }
  };

  const renderWeeklyFundingCard = ({ compact = false }: { compact?: boolean } = {}) => (
    <HudPanel className="sci-weekly-funding-shell" data-onboarding-target="weekly-funding">
      <div className={`sci-weekly-funding-content ${compact ? 'sci-weekly-funding-content--compact' : ''}`}>
        <div className={`sci-weekly-funding-summary ${compact ? 'mb-2 pb-2' : 'mb-3 pb-3'} grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-cyan-200/14`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-black text-emerald-200">Weekly Funding</h2>
              <StatusPill tone={weeklyAllocation.isFinalizing ? 'gold' : 'green'}>
                {weeklyAllocation.isFinalizing ? 'Finalizing' : 'Live'}
              </StatusPill>
            </div>
            <p className="text-xs text-slate-300">Season 7 - Week {weeklyAllocation.endLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-[0.62rem] font-bold uppercase text-slate-400">Prize Pool</p>
            <p className="mt-0.5 text-2xl font-black leading-none text-emerald-300">
              {weeklyAllocation.allocationRsc.toLocaleString()} <span className="text-sm">RSC</span>
            </p>
            <p className="mt-1 text-[0.68rem] font-semibold text-slate-300">
              {weeklyAllocation.isFinalizing
                ? 'Publishing the new week and Past Pick together'
                : `Ends ${weeklyAllocation.daysLeft === 0 ? 'today' : `in ${weeklyAllocation.daysLeft} day${weeklyAllocation.daysLeft === 1 ? '' : 's'}`}`}
            </p>
          </div>
        </div>

        <div
          className={`sci-weekly-winner-card group relative w-full overflow-hidden rounded-[8px] border border-emerald-300/24 bg-slate-950/50 text-left transition hover:border-emerald-200/65 hover:bg-emerald-300/10 ${compact ? 'sci-weekly-winner-card--compact' : ''}`}
          role="region"
          aria-roledescription="carousel"
          aria-label={weeklyProposalSelection ? 'Weekly leader and selected research proposal' : 'Weekly leader'}
          onMouseEnter={() => setWeeklyWinnerAutoPaused(true)}
          onMouseLeave={() => setWeeklyWinnerAutoPaused(false)}
          onFocusCapture={() => setWeeklyWinnerAutoPaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setWeeklyWinnerAutoPaused(false);
            }
          }}
        >
          <div className="sci-weekly-scan" />
          <div
            className="sci-weekly-winner-card__track"
            data-has-proposal={weeklyProposalSelection ? 'true' : 'false'}
            data-active-slide={weeklyProposalSelection ? weeklyWinnerSlide : 'pilot'}
          >
            <button
              type="button"
              className={`sci-weekly-winner-card__slide ${compact ? 'p-2' : 'p-3'}`}
              onClick={() => setDashboardTab('trophies')}
              tabIndex={weeklyWinnerSlide === 'pilot' || !weeklyProposalSelection ? 0 : -1}
              aria-hidden={weeklyWinnerSlide === 'proposal' && Boolean(weeklyProposalSelection)}
              aria-label={`${weeklyLeaderName}, weekly high score ${formatNumber(weeklyLeaderScore)}. Open Trophy Deck.`}
            >
              <span
                className={`relative z-10 grid gap-3 ${compact ? '' : 'grid-cols-[5.25rem_minmax(0,1fr)]'}`}
                {...(compact ? { style: { gridTemplateColumns: '4rem minmax(0,1fr)' } } : {})}
              >
                <span className="sci-weekly-project-image relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] border border-cyan-200/25 bg-cyan-300/10">
                  <img
                    src={weeklyLeader ? ASSETS.PLAYER_SHIP : WEEKLY_EMPTY_TROPHY}
                    data-weekly-leader-art={weeklyLeader ? 'ship' : 'trophy'}
                    alt=""
                    className="h-16 w-16 object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.7)]"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-cyan-200/10" />
                </span>

                <span className="min-w-0 self-center">
                  <span className="flex items-center gap-2">
                    <span className="sci-weekly-live-dot" />
                    <span className="text-[0.62rem] font-black uppercase text-emerald-200">Weekly high score</span>
                  </span>
                  <span className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-base font-black text-white">{weeklyLeaderName}</span>
                      <span className="block text-[0.66rem] font-bold uppercase text-slate-400">Current #1 pilot</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xl font-black text-cyan-100">{formatNumber(weeklyLeaderScore)}</span>
                      <span className="block text-[0.58rem] font-bold uppercase text-cyan-200/70">Score</span>
                    </span>
                  </span>
                </span>
              </span>
            </button>

            {weeklyProposalSelection ? (
              <button
                type="button"
                className={`sci-weekly-winner-card__slide ${compact ? 'p-2' : 'p-3'}`}
                onClick={() => {
                  if (weeklyProposalSelection.url) onOpenProposal(weeklyProposalSelection.url);
                  else setDashboardTab('proposals');
                }}
                tabIndex={weeklyWinnerSlide === 'proposal' ? 0 : -1}
                aria-hidden={weeklyWinnerSlide !== 'proposal'}
                aria-label={`${weeklyProposalSelection.title}, selected weekly research proposal.`}
              >
                <span
                  className={`relative z-10 grid gap-3 ${compact ? '' : 'grid-cols-[5.25rem_minmax(0,1fr)]'}`}
                  {...(compact ? { style: { gridTemplateColumns: '4rem minmax(0,1fr)' } } : {})}
                >
                  <span className="sci-weekly-project-image relative flex aspect-square items-center justify-center overflow-hidden rounded-[8px] border border-cyan-200/25 bg-cyan-300/10">
                    {weeklyProposalSelection.imageUrl ? (
                      <img
                        key={`${weeklyProposalSelection.id}:${weeklyProposalSelection.imageUrl}`}
                        src={weeklyProposalSelection.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="eager"
                        decoding="async"
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <Icon name="flask" className="h-9 w-9 text-emerald-200" strokeWidth={1.6} />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-cyan-200/10" />
                  </span>

                  <span className="min-w-0 self-center">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[0.6rem] font-black uppercase text-yellow-200">Selected research proposal</span>
                      {weeklyProposalCompleted ? (
                        <span className="shrink-0 text-[0.58rem] font-black uppercase text-yellow-200">
                          Goal reached
                        </span>
                      ) : weeklyFunding?.progressPercent !== null && weeklyFunding?.progressPercent !== undefined ? (
                        <span className="shrink-0 text-[0.58rem] font-black uppercase text-emerald-200">
                          {formatFundingPercent(weeklyFunding.progressPercent)} funded
                        </span>
                      ) : null}
                    </span>
                    <span className="sci-weekly-proposal-title mt-1 block text-sm font-black leading-tight text-white">
                      {weeklyProposalSelection.title}
                    </span>
                    <span className="mt-1 block truncate text-[0.62rem] font-bold uppercase text-slate-400">
                      {weeklyProposalSelection.author ?? 'ResearchHub researcher'}
                    </span>
                    {weeklyProposalSelection.liveProposal ? (
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-400 shadow-[0_0_12px_rgba(45,212,191,0.55)]"
                          style={{ width: `${weeklyFunding?.barPercent ?? 0}%` }}
                        />
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            ) : null}
          </div>

          {weeklyProposalSelection ? (
            <div className="sci-weekly-winner-card__pager" role="group" aria-label="Weekly funding card slides">
              <button
                type="button"
                aria-label="Show weekly leader"
                aria-pressed={weeklyWinnerSlide === 'pilot'}
                onClick={() => setWeeklyWinnerSlide('pilot')}
              />
              <button
                type="button"
                aria-label="Show selected proposal"
                aria-pressed={weeklyWinnerSlide === 'proposal'}
                onClick={() => setWeeklyWinnerSlide('proposal')}
              />
            </div>
          ) : null}
        </div>



      </div>
    </HudPanel>
  );

  /** The funding board and Weekly Run launcher remain separate controls, but
   *  share a dock so their two distinct chrome pieces read as one assembly. */
  const renderWeeklyCompetitionStack = ({ compact = false }: { compact?: boolean } = {}) => (
    <div className="sci-weekly-competition-stack">
      {renderWeeklyFundingCard({ compact })}
      {renderWeeklyRunEntry()}
    </div>
  );

  const DashboardNav = ({ docked = false }: { docked?: boolean }) => (
    <nav className={`${docked ? 'mt-auto shrink-0' : ''} sci-dashboard-nav-shell pt-3`} aria-label="Primary dashboard">
      <div className="sci-dashboard-nav grid grid-cols-5 overflow-visible rounded-[8px] border border-cyan-300/24 bg-slate-950/92 shadow-[0_0_28px_rgba(8,145,178,0.18)] backdrop-blur-xl">
        {dashboardTabs.map((tab) => {
          const active = dashboardTab === tab.id;
          const rewardAttention = tab.id === 'more' && hasRewardReady;
          const proposalAttention = tab.id === 'trophies' && weeklyProposalNeedsAttention;
          const tabLabel = proposalAttention
            ? 'Trophies - weekly high score proposal needs your selection'
            : rewardAttention
              ? `More - ${dailyGiftStatus.isAvailable ? 'daily gift' : 'achievement'} ready`
              : tab.label;
          return (
            <button
              key={tab.id}
              type="button"
              aria-label={tabLabel}
              aria-current={active ? 'page' : undefined}
              data-dashboard-tab={tab.id}
              data-onboarding-target={tab.id === 'hangar'
                ? 'hangar-nav'
                : tab.id === 'home'
                  ? 'home-nav'
                  : undefined}
              data-active={active ? 'true' : 'false'}
              data-reward-ready={rewardAttention ? 'true' : 'false'}
              data-proposal-ready={proposalAttention ? 'true' : 'false'}
              data-icon-column={tab.spriteColumn}
              onClick={() => setDashboardTab(tab.id)}
              className={`sci-dashboard-nav-button group relative flex min-h-[4.8rem] flex-col items-center justify-end gap-0.5 border-r border-cyan-200/12 px-1 pb-1.5 text-center text-xs font-semibold last:border-r-0 ${
                active
                  ? 'text-white'
                  : 'text-slate-300 hover:bg-cyan-300/8 hover:text-white'
              }`}
            >
              <span className="sci-dashboard-nav-icon" aria-hidden="true">
                <span className="sci-dashboard-nav-icon-sprite" />
                {rewardAttention || proposalAttention ? (
                  <span className="sci-dashboard-reward-ready" aria-hidden="true" />
                ) : null}
              </span>
              <span className="sci-dashboard-nav-label">{tab.label}</span>
              <span className={`sci-dashboard-nav-marker ${active ? 'is-active' : ''}`} aria-hidden="true" />
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
            <p className="text-sm text-slate-300">Search eligible ResearchHub proposals sorted by their live funded percentage. USD values can move with the RSC market price.</p>
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
          <span>{proposalSearch.trim() ? 'Search filtered · ' : ''}Most funded first</span>
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

  const TrophiesDashboard = () => {
    const isCampaignCategory = trophyCategory === 'campaign';
    const showsLeaderboard = !isCampaignCategory
      && (leaderboardView === 'weekly' || leaderboardView === 'allTime');
    const firstPlace = showsLeaderboard ? displayedLeaderboard[0] : undefined;
    const rankedEntries = showsLeaderboard ? displayedLeaderboard.slice(1) : [];

    return (
    <HudPanel>
      <div className="p-4 md:p-5">
        <div className="mb-3">
          <h2 className="text-2xl font-black text-white">Trophy Deck</h2>
          <p className="text-sm text-slate-300">
            {isCampaignCategory
              ? 'Campaign progression: sectors cleared, Missions mastered, and bosses beaten.'
              : 'Weekly Run scores, champion picks, confirmed funding, and your recent runs.'}
          </p>
        </div>

        {/* Two unrelated things live here. Weekly Funding is the competition;
            Campaign is progression and records no score. */}
        <div className="sci-trophy-category" role="tablist" aria-label="Trophy deck category">
          {([
            ['weeklyFunding', 'Weekly Funding'],
            ['campaign', 'Campaign']
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={trophyCategory === id}
              onClick={() => setTrophyCategory(id)}
              className="sci-trophy-category__tab"
              data-active={trophyCategory === id ? 'true' : 'false'}
            >
              {label}
            </button>
          ))}
        </div>

        {isCampaignCategory ? (
          <CampaignTrophyPanel state={permanentSquadState} />
        ) : (
        <>
        {showsLeaderboard ? (
          <div className="mb-2">
            {isLoading ? (
              <div className="sci-first-place-row animate-pulse" aria-label="Loading first place">
                <img
                  src={podiumRowAssets.first}
                  alt=""
                  className="absolute inset-0 h-full w-full object-contain opacity-35"
                />
              </div>
            ) : (
              <FirstPlaceLivingRow entry={firstPlace} onOpen={openLeaderboardRecord} />
            )}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-4 rounded-[6px] border border-cyan-300/18 bg-slate-950/70 p-1">
            {[
              ['weekly', 'Weekly'],
              ['allTime', 'All-time'],
              ['pastPicks', 'Past picks'],
              ['records', 'My records']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-proposal-ready={id === 'records' && weeklyProposalNeedsAttention ? 'true' : 'false'}
                onClick={() => setLeaderboardView(id as LeaderboardView)}
                className={`min-w-0 rounded-[5px] px-1.5 py-2 text-[0.66rem] font-bold uppercase transition sm:px-3 sm:text-xs ${
                  id === 'records' && weeklyProposalNeedsAttention ? 'sci-proposal-attention ' : ''
                }${
                  leaderboardView === id ? 'bg-cyan-300/18 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {[0, 1].map((index) => <div key={index} className="h-20 animate-pulse rounded-[6px] bg-white/[0.04]" />)}
          </div>
        )}

        {!isLoading && showsLeaderboard && rankedEntries.length > 0 && (
          <div className="sci-standard-rank-list max-h-[min(42vh,34rem)] space-y-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
            {rankedEntries.map((entry, index) => {
              const rank = index + 2;
              const recordAvailable = hasViewableMissionRecord(entry);
              const podiumTone = rank === 2 ? 'silver' : rank === 3 ? 'bronze' : null;
              return (
                <div
                  key={`${entry.name}-${entry.score}-${rank}`}
                  className={`sci-leaderboard-row grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 ${podiumTone ? `sci-leaderboard-row--${podiumTone}` : ''}`}
                >
                  <div className={`sci-leaderboard-rank ${podiumTone ? `sci-leaderboard-rank--${podiumTone}` : ''}`}>{rank}</div>
                  <div className="min-w-0">
                    {recordAvailable ? (
                      <button
                        type="button"
                        onClick={() => openLeaderboardRecord(entry)}
                        className="block w-full min-w-0 truncate text-left text-sm font-bold text-white underline decoration-cyan-300/0 underline-offset-4 transition hover:text-cyan-100 hover:decoration-cyan-300/80 focus-visible:text-cyan-100 focus-visible:decoration-cyan-300/80"
                        aria-label={`View ${entry.name}'s Mission Record`}
                      >
                        {entry.name}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-bold text-white">{entry.name}</p>
                    )}
                    <p className="truncate text-xs text-slate-400">{entry.proposalTitle ?? `Mission ${entry.wave ?? '-'}`}</p>
                  </div>
                  <p className="font-black text-white">{formatNumber(entry.score)}</p>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && showsLeaderboard && visibleLeaderboard.length === 0 && (
          <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
            No scores yet. Start a mission and claim the board.
          </div>
        )}

        {!isLoading && leaderboardView === 'pastPicks' && (
          <div className="max-h-[min(62vh,48rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
            {sortedPastPicks.map((winner) => {
              const proposalSelection = resolveProposalSelection(winner, proposalReferencePool);
              const proposalClaimed = winner.status === 'claimed' || winner.status === 'funded';
              return (
                <button
                  key={`${winner.periodKey}-${winner.winnerName}`}
                  type="button"
                  onClick={() => proposalSelection?.url && onOpenProposal(proposalSelection.url)}
                  disabled={!proposalSelection?.url}
                  aria-label={`${winner.winnerName} won ${winner.periodLabel} with ${formatNumber(winner.score)} points${proposalSelection ? proposalClaimed ? ` and selected ${proposalSelection.title}` : ` with ${proposalSelection.title} awaiting champion confirmation` : ''}`}
                  className="sci-past-pick-card group relative w-full overflow-hidden p-3 text-left disabled:cursor-default sm:p-4"
                >
                  <span className="sci-past-pick-accent" aria-hidden="true" />
                  <div className="relative z-10">
                    <div className="flex items-start justify-between gap-3 border-b border-cyan-200/14 pb-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-yellow-200">{winner.periodLabel}</p>
                        <p className="mt-0.5 text-[0.65rem] font-bold uppercase text-emerald-200">Weekly champion</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-black leading-none text-white">{(winner.allocationRsc ?? weeklyAllocation.allocationRsc).toLocaleString('en-US')} <span className="text-xs text-emerald-200">RSC</span></p>
                        <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-wide text-cyan-200">{proposalClaimed ? 'Final allocation' : 'Claim pending'}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="text-[0.62rem] font-bold uppercase tracking-wide text-slate-400">Winner</p>
                        <p className="mt-0.5 truncate text-lg font-black text-white">{winner.winnerName}</p>
                        <p className="mt-1 text-xs font-bold text-cyan-100">{formatNumber(winner.score)} pts <span className="text-slate-500">/</span> Mission {winner.wave || 1}</p>
                      </div>
                      <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 border-l-2 border-emerald-300/35 pl-3">
                        <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[6px] border border-cyan-200/20 bg-cyan-300/[0.06]">
                          <span className="text-[0.58rem] font-black uppercase tracking-wider text-cyan-200/55">RSC</span>
                          {proposalSelection?.imageUrl ? (
                            <img
                              key={`${proposalSelection.id}:${proposalSelection.imageUrl}`}
                              src={proposalSelection.imageUrl}
                              alt=""
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(event) => { event.currentTarget.style.display = 'none'; }}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.62rem] font-bold uppercase tracking-wide text-emerald-200">{proposalSelection ? proposalClaimed ? 'Proposal selected' : 'Proposal preselected' : 'Proposal pending'}</p>
                          <p className="mt-1 line-clamp-2 text-sm font-bold leading-snug text-white">{proposalSelection?.title ?? 'Champion selection pending'}</p>
                          {proposalSelection?.author && <p className="mt-1 truncate text-[0.68rem] font-bold uppercase text-cyan-200">{proposalSelection.author}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {sortedPastPicks.length === 0 && (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                Past weekly picks will appear here after winners are archived, showing the weekly high-score pilot, their score, and the proposal selection or pending claim for the funding allocation.
              </div>
            )}
          </div>
        )}

        {!isLoading && leaderboardView === 'records' && (
          <div className="max-h-[min(58vh,43rem)] space-y-2 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
            {walletActivityView === 'stale' ? (
              <div className="flex items-center justify-between gap-3 rounded-[6px] border border-amber-300/25 bg-amber-300/8 px-3 py-2 text-xs text-slate-200">
                <span>{walletRunsError}</span>
                {onRetryWalletRuns ? (
                  <button
                    type="button"
                    onClick={onRetryWalletRuns}
                    className="shrink-0 font-black uppercase tracking-wider text-cyan-100 underline decoration-cyan-300/50 underline-offset-2"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}
            {walletActivityView === 'disconnected' ? (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                <p>Connect a Base Account to view your five most recent runs.</p>
                {walletControl ? <div className="mt-3 flex justify-start">{walletControl}</div> : null}
              </div>
            ) : walletActivityView === 'initial-error' ? (
              <div className="rounded-[6px] border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-slate-100">
                <p className="font-bold text-white">Wallet activity did not load</p>
                <p className="mt-1 text-xs text-slate-300">{walletRunsError}</p>
                {onRetryWalletRuns ? (
                  <button
                    type="button"
                    onClick={onRetryWalletRuns}
                    className="mt-3 rounded-[5px] border border-cyan-200/45 bg-cyan-300/12 px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-50"
                  >
                    Try again
                  </button>
                ) : null}
              </div>
            ) : walletActivityView === 'loading' ? (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-300">
                Loading your recent runs...
              </div>
            ) : walletActivityView === 'empty' ? (
              <div className="rounded-[6px] border border-cyan-300/15 bg-cyan-300/8 p-4 text-sm text-slate-200">
                <p className="font-bold text-white">No saved runs yet</p>
                <p className="mt-1 text-xs text-slate-400">Submit your score after a run. Your latest five runs will appear here.</p>
              </div>
            ) : walletRuns.slice(0, 5).map((run) => {
              const runShip = PLAYER_SHIPS[run.receipt.metrics.playerShipId];
              const minted = walletRecords.some((record) => (
                record.recordType === 'mission'
                && record.runId === run.receipt.runId
                && record.status === 'confirmed'
              ));
              const isEditableWeeklyLeader = weeklyProposalRunId === run.receipt.runId
                && Boolean(onOpenWeeklyLeaderProposal);
              const proposalNeedsAttention = isEditableWeeklyLeader && weeklyProposalNeedsAttention;
              const proposalReplacementRequired = proposalNeedsAttention
                && weeklyProposalAttentionReason === 'completed';
              return (
                <button
                  key={run.receipt.runId}
                  type="button"
                  data-proposal-ready={proposalNeedsAttention ? 'true' : 'false'}
                  onClick={() => {
                    if (isEditableWeeklyLeader && onOpenWeeklyLeaderProposal) {
                      onOpenWeeklyLeaderProposal(run);
                      return;
                    }
                    onOpenWalletRun(run);
                  }}
                  aria-label={isEditableWeeklyLeader
                    ? `${
                      proposalReplacementRequired
                        ? 'Choose a replacement'
                        : weeklyProposalNeedsAttention
                          ? 'Choose'
                          : 'Change'
                    } proposal for weekly high score ${formatNumber(run.receipt.metrics.score)}`
                    : undefined}
                  className={`group relative grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-[8px] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,47,73,0.36),rgba(15,23,42,0.72)_48%,rgba(2,6,23,0.82))] px-3 py-2.5 text-left shadow-[inset_0_0_1.25rem_rgba(34,211,238,0.035)] transition hover:border-cyan-200/45 hover:bg-cyan-300/8 ${proposalNeedsAttention ? 'sci-proposal-attention' : ''}`}
                >
                  <div className="relative flex h-[3.25rem] w-[3.25rem] items-center justify-center overflow-hidden rounded-[7px] border border-cyan-200/25 bg-[radial-gradient(circle,rgba(34,211,238,0.16),rgba(2,6,23,0.82)_68%)]">
                    <span className="absolute inset-x-2 bottom-1 h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent" aria-hidden="true" />
                    <img
                      src={runShip.assetUrl}
                      alt={`${runShip.name} used for this mission`}
                      className="relative h-[2.8rem] w-[2.8rem] object-contain [image-rendering:pixelated] drop-shadow-[0_0_7px_rgba(34,211,238,0.38)] transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="truncate text-sm font-black text-white">{run.pilotName}</p>
                      <span className="shrink-0 text-[8px] font-black uppercase tracking-wide text-slate-500">{formatRunDate(run.receipt.finishedAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs font-bold text-cyan-50">
                      {formatNumber(run.receipt.metrics.score)} pts - Mission {run.receipt.metrics.wave}
                    </p>
                  </div>
                  <span className={`max-w-[5.25rem] text-right text-[9px] font-black uppercase leading-tight tracking-wide ${proposalNeedsAttention ? 'text-yellow-200' : minted ? 'text-emerald-200' : 'text-cyan-200'}`}>
                    {isEditableWeeklyLeader
                      ? proposalReplacementRequired
                        ? 'Choose new pick'
                        : weeklyProposalNeedsAttention
                          ? 'Choose proposal'
                        : 'Change proposal'
                      : minted
                        ? 'Minted'
                        : 'View'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>
    </HudPanel>
    );
  };

  const AboutDashboard = () => (
    <HudPanel className="sci-more-menu-shell">
      <div className="sci-more-menu">
        <header className="sci-more-menu__header">
          <p className="sci-more-menu__eyebrow">Scicon Shooter</p>
          <h2>Menu</h2>
        </header>

        <section className="sci-pause-settings sci-more-audio-settings" aria-label="Audio settings">
          <button
            type="button"
            className="sci-pause-settings__title sci-more-audio-settings__toggle"
            aria-expanded={moreAudioExpanded}
            aria-controls="sci-more-audio-controls"
            onClick={() => setMoreAudioExpanded((expanded) => !expanded)}
          >
            <span>Audio Settings</span>
            <span className="sci-more-audio-settings__state" aria-hidden="true">
              <span>{moreAudioExpanded ? 'Close' : 'Open'}</span>
              <span className="sci-more-audio-settings__chevron">⌄</span>
            </span>
          </button>
          {moreAudioExpanded ? (
            <div id="sci-more-audio-controls" className="sci-more-audio-settings__body">
              <AudioSettingsControls
                idPrefix="sci-more"
                audioMuted={audioMuted}
                sfxVolumeLevel={sfxVolumeLevel}
                musicVolumeLevel={musicVolumeLevel}
                matchMusicTrackId={matchMusicTrackId}
                onToggleAudio={onToggleAudio}
                onSfxVolumeChange={onSfxVolumeChange}
                onMusicVolumeChange={onMusicVolumeChange}
                onMatchMusicTrackChange={onMatchMusicTrackChange}
              />
            </div>
          ) : null}
        </section>

        <div className="sci-more-menu__grid" aria-label="Scicon Shooter menu">
          <MoreMenuTile
            label={dailyGiftStatus.isAvailable
              ? 'Daily Gift'
              : claimableAchievementCount > 0
                ? 'Achievements'
                : 'Reward Center'}
            icon={claimableAchievementCount > 0 && !dailyGiftStatus.isAvailable
              ? REWARD_ACHIEVEMENT_ICON
              : `${DASHBOARD_ICON_ROOT}/selected/weekly-calendar-selected.png`}
            onClick={() => openRewardCenter(
              !dailyGiftStatus.isAvailable && claimableAchievementCount > 0 ? 'achievements' : 'daily'
            )}
          />
          <MoreMenuTile
            label="ResearchHub"
            icon={`${MORE_MENU_ICON_ROOT}/research-proposals.png`}
            onClick={onOpenFund}
          />
          <MoreMenuTile
            label="Treasury"
            icon={`${MORE_MENU_ICON_ROOT}/funding-wallet.png`}
            onClick={() => setShowTreasury(true)}
          />
          <MoreMenuTile
            label="RSC on Base"
            icon={`${MORE_MENU_ICON_ROOT}/market-store.png`}
            onClick={() => setShowRscAcquire(true)}
          />
          <MoreMenuTile
            label="Referral"
            icon={`${COMMUNICATION_ICON_ROOT}/friends.png`}
            onClick={() => setShowReferral(true)}
          />
          <MoreMenuTile
            label="Feedback"
            icon={`${COMMUNICATION_ICON_ROOT}/feedback.png`}
            onClick={() => setPlayerReportKind('feedback')}
          />
          <MoreMenuTile
            label="Report a Bug"
            icon={`${COMMUNICATION_ICON_ROOT}/support.png`}
            onClick={() => setPlayerReportKind('bug')}
          />
          <MoreMenuTile
            label="Social"
            icon={`${COMMUNICATION_ICON_ROOT}/notifications.png`}
            href={DONATION_CONFIG.X_PROFILE_URL}
          />
          {onRestartOnboarding ? (
            <MoreMenuTile
              label="Flight Guide"
              icon={`${COMMUNICATION_ICON_ROOT}/help.png`}
              onClick={() => {
                setDashboardTab('home');
                onRestartOnboarding();
              }}
            />
          ) : null}
        </div>

        <button type="button" onClick={() => setShowLegal(true)} className="sci-more-menu__legal">
          <img src={`${COMMUNICATION_ICON_ROOT}/privacy.png`} alt="" aria-hidden="true" />
          <span>Terms of Use &amp; Privacy</span>
        </button>

        <p className="sci-more-menu__disclosure">
          Community-built, open source, and not an official ResearchHub product.
        </p>
      </div>
    </HudPanel>
  );

  const renderMobileDashboardContent = () => {
    if (dashboardTab === 'hangar') {
      return (
        <SquadHangar
          state={weeklySquadState}
          mainShipId={shipFocusId}
          mainShipName={focusedShip.name}
          shipUnlocks={shipUnlocks}
          walletConnected={Boolean(walletAddress)}
          rscBalance={rscBalance}
          rscBalanceStatus={rscBalanceStatus}
          walletPurchaseStatus={walletPurchaseStatus}
          playerShipPurchaseStatus={playerShipPurchaseStatus}
          founderSandbox={founderSandbox}
          onSelectMainShip={(shipId) => {
            setShipFocusId(shipId);
            onSelectShip(shipId);
          }}
          onUnlockSlot={onUnlockSquadSlot}
          onPurchaseWithRsc={onPurchaseWithRsc}
          onPurchasePlayerShip={onPurchasePlayerShip}
          onRefreshPlayerShipAccess={onRefreshPlayerShipAccess}
          onRefreshRscBalance={onRefreshRscBalance}
          onOpenRscSwap={() => setShowRscAcquire(true)}
          onPurchaseMini={onPurchaseMiniShip}
          onUpgradeMini={onUpgradeMiniShip}
          onDowngradeMini={onDowngradeMiniShip}
          onEquipMini={onEquipMiniShip}
          onUpgradeMainShip={onUpgradeMainShip}
          onDowngradeMainShip={onDowngradeMainShip}
        />
      );
    }
    if (dashboardTab === 'proposals') return <ProposalsDashboard />;
    if (dashboardTab === 'trophies') return <TrophiesDashboard />;
    if (dashboardTab === 'more') return <AboutDashboard />;

    return (
      <div className="scicon-mobile-home flex min-h-full flex-col gap-2">
        {renderWeeklyCompetitionStack({ compact: true })}
        {renderHeroPanel({ compact: true, fill: true })}
      </div>
    );
  };

  const renderSelectedDashboard = () => {
    if (dashboardTab === 'hangar') {
      return (
        <SquadHangar
          state={weeklySquadState}
          mainShipId={shipFocusId}
          mainShipName={focusedShip.name}
          shipUnlocks={shipUnlocks}
          walletConnected={Boolean(walletAddress)}
          rscBalance={rscBalance}
          rscBalanceStatus={rscBalanceStatus}
          walletPurchaseStatus={walletPurchaseStatus}
          playerShipPurchaseStatus={playerShipPurchaseStatus}
          founderSandbox={founderSandbox}
          onSelectMainShip={(shipId) => {
            setShipFocusId(shipId);
            onSelectShip(shipId);
          }}
          onUnlockSlot={onUnlockSquadSlot}
          onPurchaseWithRsc={onPurchaseWithRsc}
          onPurchasePlayerShip={onPurchasePlayerShip}
          onRefreshPlayerShipAccess={onRefreshPlayerShipAccess}
          onRefreshRscBalance={onRefreshRscBalance}
          onOpenRscSwap={() => setShowRscAcquire(true)}
          onPurchaseMini={onPurchaseMiniShip}
          onUpgradeMini={onUpgradeMiniShip}
          onDowngradeMini={onDowngradeMiniShip}
          onEquipMini={onEquipMiniShip}
          onUpgradeMainShip={onUpgradeMainShip}
          onDowngradeMainShip={onDowngradeMainShip}
        />
      );
    }
    if (dashboardTab === 'proposals') return <ProposalsDashboard />;
    if (dashboardTab === 'trophies') return <TrophiesDashboard />;
    if (dashboardTab === 'more') return <AboutDashboard />;
    return null;
  };

  return (
    <div
      className="scicon-start-screen relative h-full min-h-0 overflow-hidden bg-slate-950 text-white"
      data-dashboard-tab={dashboardTab}
    >
      {testChampionWinner && onCloseTestChampionPreview ? (
        <button
          type="button"
          onClick={onCloseTestChampionPreview}
          className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] border border-cyan-100/45 bg-slate-950/92 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.2)]"
        >
          Return to frozen run
        </button>
      ) : null}
      <div className="scicon-home-backdrop absolute inset-0 z-0" aria-hidden="true">
        <img src={ASSETS.HOME_SPARSE_STARFIELD_BASE} alt="" className="scicon-home-backdrop__image absolute inset-0 h-full w-full object-cover" />
        <div className="scicon-home-backdrop__nebula scicon-home-backdrop__nebula--a" />
        <div className="scicon-home-backdrop__nebula scicon-home-backdrop__nebula--b" />
        <div className="scicon-home-backdrop__stars" />
        <div className="scicon-home-backdrop__veil absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_86%_22%,rgba(16,185,129,0.16),transparent_26%),linear-gradient(180deg,rgba(2,6,23,0.44),rgba(2,6,23,0.9)_74%)]" />
        <div className="scicon-home-backdrop__grid absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="scicon-home-backdrop__pixel-fade" />
      </div>

      {dashboardTab === 'home' ? (
        <button
          type="button"
          className={[
            'sci-reward-edge-trigger',
            dailyGiftStatus.isAvailable ? 'sci-reward-edge-trigger--claimable' : 'sci-reward-edge-trigger--collapsed',
            !dailyGiftStatus.isAvailable && claimableAchievementCount > 0
              ? 'sci-reward-edge-trigger--achievement-ready'
              : ''
          ].filter(Boolean).join(' ')}
          data-onboarding-target="rewards-open"
          onClick={() => openRewardCenter(
            !dailyGiftStatus.isAvailable && claimableAchievementCount > 0 ? 'achievements' : 'daily'
          )}
          aria-label={dailyGiftStatus.isAvailable
            ? 'Claim daily gift'
            : claimableAchievementCount > 0
              ? `${claimableAchievementCount} achievement ${claimableAchievementCount === 1 ? 'reward' : 'rewards'} ready`
              : 'Open reward center'}
          aria-controls="reward-center"
          aria-expanded={showRewardCenter}
        >
          <img
            src={dailyGiftStatus.isAvailable
              ? `${DASHBOARD_ICON_ROOT}/selected/weekly-calendar-selected.png`
              : REWARD_EDGE_ARROW}
            alt=""
          />
          {dailyGiftStatus.isAvailable ? <span>Daily gift</span> : null}
          {!dailyGiftStatus.isAvailable && claimableAchievementCount > 0 ? (
            <span className="sci-reward-edge-trigger__count" aria-hidden="true">
              {claimableAchievementCount > 9 ? '9+' : claimableAchievementCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {showWeeklyProposalReminder && weeklyProposalRecovery ? (
        <div className="sci-weekly-proposal-reminder-backdrop" role="presentation">
          <section
            ref={weeklyProposalReminderRef}
            className="sci-weekly-proposal-reminder sci-neon-frame-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="weekly-proposal-reminder-title"
            aria-describedby="weekly-proposal-reminder-description"
            onKeyDown={handleWeeklyProposalReminderKeyDown}
          >
            <p className="sci-weekly-proposal-reminder__eyebrow">Weekly high score alert</p>
            <h2 id="weekly-proposal-reminder-title">
              {weeklyProposalAttentionReason === 'completed'
                ? 'Your research pick reached its goal'
                : 'Your research pick is waiting'}
            </h2>
            <p id="weekly-proposal-reminder-description">
              {weeklyProposalAttentionReason === 'completed'
                ? `Your selected proposal was fully funded before the weekly cutoff. You are still the current #1 pilot with ${formatNumber(weeklyProposalRecovery.leader.score)} points, so choose another open proposal for this week's allocation.`
                : `You are still the current #1 pilot with ${formatNumber(weeklyProposalRecovery.leader.score)} points, but no ResearchHub proposal is attached to this run yet. Choose one now so your weekly funding pick is ready.`}
            </p>
            <div className="sci-weekly-proposal-reminder__actions">
              <button
                type="button"
                className="sci-weekly-proposal-reminder__later"
                onClick={() => setShowWeeklyProposalReminder(false)}
              >
                Not now
              </button>
              <PixelActionButton
                ref={weeklyProposalReminderPrimaryRef}
                tone="gold"
                ready
                shine
                className="sci-weekly-proposal-reminder__choose"
                onClick={openRecoverableWeeklyProposal}
              >
                {weeklyProposalAttentionReason === 'completed'
                  ? 'Choose new proposal'
                  : 'Choose proposal'}
              </PixelActionButton>
            </div>
          </section>
        </div>
      ) : null}

      {showBossArchive && canOpenBossArchive && onStartBossFight ? (
        <BossArchive
          entries={availableBossArchiveEntries}
          catalogEntries={bossArchiveDevelopmentAccess ? BOSS_ARCHIVE_CATALOG : undefined}
          revealLockedEntries={bossArchiveDevelopmentAccess && bossArchiveDevShowLocked}
          newEncounterIds={bossArchiveOpenedNewIds}
          onClose={closeBossArchive}
          onChallenge={(entry) => onStartBossFight(entry, {
            mode: 'challenge',
            variantId: 'standard',
            difficultyId: 'easy'
          })}
          onLaunch={onStartBossFight}
          onSelectionChange={onBossArchiveSelection}
          onNewEncounterViewed={onBossArchiveViewed}
          selectedEncounterId={permanentSquadState.bossArchive.lastSelectedEventId}
          progress={permanentSquadState.bossArchive}
          dailyChargeStatus={bossArchiveDailyChargeStatus}
          result={bossArchiveResult}
          onDismissResult={onDismissBossArchiveResult}
          launchError={bossArchiveLaunchError}
          onDismissLaunchError={onDismissBossArchiveLaunchError}
          developerControls={bossArchiveDeveloperControls ? {
            ...bossArchiveDeveloperControls,
            showLockedEntries: bossArchiveDevShowLocked,
            onShowLockedEntriesChange: setBossArchiveDevShowLocked,
            onUnlockAll: () => {
              bossArchiveDeveloperControls.onUnlockAll?.();
              setBossArchiveDevUnlockAll(true);
            },
            onResetProgress: () => {
              setBossArchiveDevUnlockAll(false);
              bossArchiveDeveloperControls.onResetProgress?.();
            }
          } : null}
        />
      ) : null}

      <div className="scicon-start-shell relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1560px] flex-col gap-4 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 lg:gap-5 lg:px-6 lg:pb-6">
        <main className="scicon-desktop-deck hidden lg:block">
          {dashboardTab === 'home' ? (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.14fr)_minmax(25rem,0.86fr)]">
              <div className="space-y-5">
                {renderHeroPanel()}
                <DashboardNav />
              </div>

              {renderWeeklyCompetitionStack()}
            </div>
          ) : (
            <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-5">
              {renderSelectedDashboard()}
              <DashboardNav docked />
            </div>
          )}
        </main>

        <main
          className="scicon-mobile-main flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden"
        >
          <div className="scicon-mobile-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-px custom-scrollbar">
            {renderMobileDashboardContent()}
          </div>
          <DashboardNav docked />
        </main>
      </div>

      {selectedLeaderboardRecord?.runId ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5">
          <button
            type="button"
            className="absolute inset-0 bg-black/82 backdrop-blur-sm"
            onClick={() => setSelectedLeaderboardRecord(null)}
            aria-label="Close Mission Record"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaderboard-record-title"
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-[8px] border border-cyan-200/35 bg-slate-950 shadow-[0_0_52px_rgba(34,211,238,0.24)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-cyan-200/15 px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[0.62rem] font-black uppercase tracking-[0.18em] text-cyan-200">Leaderboard Record</p>
                <h2 id="leaderboard-record-title" className="truncate text-lg font-black text-white">
                  {selectedLeaderboardRecord.name} / {formatNumber(selectedLeaderboardRecord.score)}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLeaderboardRecord(null)}
                className="sci-icon-button shrink-0"
                aria-label="Close Mission Record"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="relative aspect-square w-full overflow-hidden bg-slate-950 p-2 sm:p-3">
              {leaderboardRecordStatus === 'loading' ? (
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
                  Loading Mission Record
                </div>
              ) : null}
              {leaderboardRecordStatus === 'error' ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-bold text-slate-300">
                  This legacy Mission Record is unavailable.
                </div>
              ) : (
                <img
                  src={buildMissionRecordCardPath(selectedLeaderboardRecord.runId)}
                  alt={`${selectedLeaderboardRecord.name} Mission Record`}
                  onLoad={() => setLeaderboardRecordStatus('ready')}
                  onError={() => setLeaderboardRecordStatus('error')}
                  className={`h-full w-full object-contain transition-opacity duration-200 ${leaderboardRecordStatus === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
            </div>
          </section>
        </div>
      ) : null}

      <PlayerReportDialog
        kind={playerReportKind}
        onClose={() => setPlayerReportKind(null)}
      />

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

      {showRscAcquire && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <section
            ref={rscAcquireDialogRef}
            className="max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-[8px] border border-cyan-300/35 bg-slate-950 p-5 shadow-[0_0_42px_rgba(34,211,238,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sci-rsc-acquire-title"
            aria-describedby="sci-rsc-acquire-description"
            onKeyDown={(event) => trapDialogFocus(event, rscAcquireDialogRef.current, () => setShowRscAcquire(false))}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.6rem] font-black uppercase tracking-[0.14em] text-emerald-200">Base network</p>
                <h2 id="sci-rsc-acquire-title" className="mt-1 text-lg font-black text-white">Get Research Coin</h2>
                <p id="sci-rsc-acquire-description" className="mt-1 text-xs leading-relaxed text-slate-300">
                  Choose where to continue. You are leaving Scicon Shooter, and your wallet will show the final route and confirmation.
                </p>
              </div>
              <button type="button" onClick={() => setShowRscAcquire(false)} className="sci-icon-button" aria-label="Close Research Coin options">
                <Icon name="x" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                ref={rscAcquirePrimaryRef}
                type="button"
                className="rounded-[6px] border border-blue-300/40 bg-blue-400/10 p-3 text-left transition hover:border-blue-100/80 hover:bg-blue-400/20"
                onClick={() => {
                  setShowRscAcquire(false);
                  onOpenRscInBase();
                }}
              >
                <strong className="block text-sm text-blue-100">View RSC in Base</strong>
                <span className="mt-1 block text-[0.68rem] leading-relaxed text-slate-300">Open the verified RSC token page in Base, where supported wallet actions are available.</span>
              </button>
              <button
                type="button"
                className="rounded-[6px] border border-emerald-300/40 bg-emerald-400/10 p-3 text-left transition hover:border-emerald-100/80 hover:bg-emerald-400/20"
                onClick={() => {
                  setShowRscAcquire(false);
                  onOpenSwap();
                }}
              >
                <strong className="block text-sm text-emerald-100">Swap USDC for RSC</strong>
                <span className="mt-1 block text-[0.68rem] leading-relaxed text-slate-300">Open the prefilled Aerodrome route. You can change the input token there before confirming.</span>
              </button>
            </div>

            <p className="mt-3 border-t border-white/10 pt-3 text-[0.62rem] leading-relaxed text-slate-400">
              Scicon never asks for a recovery phrase. No swap happens until you approve it in your wallet.
            </p>
          </section>
        </div>
      )}

      {showReferral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section
            ref={referralDialogRef}
            className="max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto rounded-[8px] border border-cyan-300/25 bg-slate-950 p-5 shadow-[0_0_40px_rgba(34,211,238,0.22)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sci-referrals-title"
            onKeyDown={(event) => trapDialogFocus(event, referralDialogRef.current, () => setShowReferral(false))}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="sci-referrals-title" className="text-lg font-black text-white">Referral Links</h2>
                <p className="text-xs text-slate-300">Invite researchers and Base pilots with the matching link.</p>
              </div>
              <button ref={referralCloseRef} type="button" onClick={() => setShowReferral(false)} className="sci-icon-button" aria-label="Close referral">
                <Icon name="x" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                {
                  id: 'researchhub' as const,
                  label: 'ResearchHub referral',
                  url: ASSETS.REFERRAL_LINK,
                  qr: RESEARCHHUB_REFERRAL_QR,
                  onOpen: onOpenReferral
                },
                {
                  id: 'base' as const,
                  label: 'Base App referral',
                  url: DONATION_CONFIG.BASE_APP_INVITE_URL,
                  qr: BASE_APP_REFERRAL_QR,
                  onOpen: onOpenBaseAppReferral
                }
              ]).map((referral) => (
                <article key={referral.id} className="rounded-[6px] border border-cyan-300/18 bg-[#020817] p-3">
                  <h3 className="text-center text-xs font-black uppercase tracking-[0.08em] text-cyan-100">{referral.label}</h3>
                  <img
                    src={referral.qr}
                    alt={`QR code for the ${referral.label}`}
                    className="mx-auto mt-3 h-32 w-32 border-[6px] border-white bg-white"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <a
                    href={referral.url}
                    className="mt-3 block break-all text-[0.58rem] leading-relaxed text-cyan-200 underline decoration-cyan-300/60 underline-offset-2"
                  >
                    {referral.url}
                  </a>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="sci-mini-cta justify-center px-2"
                      onClick={() => void handleCopyReferral(referral.id, referral.url)}
                    >
                      <Icon name="copy" className="h-4 w-4" />
                      {referralCopyStatus[referral.id] === 'copied'
                        ? 'Copied'
                        : referralCopyStatus[referral.id] === 'error'
                          ? 'Failed'
                          : 'Copy'}
                    </button>
                    <button type="button" onClick={referral.onOpen} className="sci-mini-cta justify-center px-2">
                      <Icon name="external" className="h-4 w-4" />
                      Open
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {showLegal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/82 backdrop-blur-sm"
            onClick={() => setShowLegal(false)}
            aria-label="Close terms and privacy"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="scicon-legal-title"
            className="relative z-10 max-h-[min(44rem,88svh)] w-full max-w-2xl overflow-y-auto rounded-[8px] border border-cyan-200/35 bg-slate-950 p-5 shadow-[0_0_52px_rgba(34,211,238,0.24)] custom-scrollbar sm:p-6"
          >
            <div className="flex items-start justify-between gap-4 border-b border-cyan-200/15 pb-4">
              <div>
                <p className="font-mono text-[0.65rem] font-black uppercase text-cyan-200">Scicon Shooter</p>
                <h2 id="scicon-legal-title" className="mt-1 text-2xl font-black text-white">Terms of Use &amp; Privacy</h2>
              </div>
              <button type="button" onClick={() => setShowLegal(false)} className="sci-icon-button shrink-0" aria-label="Close terms and privacy">
                <Icon name="x" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 text-sm leading-relaxed text-slate-300">
              <section>
                <h3 className="font-black uppercase text-cyan-100">Weekly competition</h3>
                <p className="mt-2">
                  Leaderboard positions remain provisional until the weekly cutoff. The finalized No. 1 pilot may choose an eligible ResearchHub proposal for the announced allocation. Selection and funding are separate steps; funding is only confirmed after a Base transaction reference is recorded.
                </p>
              </section>
              <section>
                <h3 className="font-black uppercase text-cyan-100">Terms of use</h3>
                <p className="mt-2">
                  Scicon Shooter is an arcade game. Scores, rankings, availability, rewards, and funding events may be reviewed or corrected for integrity. Wallet transactions and mints are optional, require the player's approval, and do not promise a financial return.
                </p>
              </section>
              <section>
                <h3 className="font-black uppercase text-cyan-100">Privacy &amp; disclosure</h3>
                <p className="mt-2">
                  Guest play does not require a wallet. Submitted pilot names and scores may appear publicly. Connected-wallet actions and minted records are public onchain. Scicon Shooter is community-built and open source; it is not represented as an official ResearchHub product.
                </p>
                <p className="mt-2">
                  The game records anonymous usage events and bounded crash diagnostics so reliability problems can be found. Gameplay analytics use a random device-local identifier, stored only as a one-way server hash, plus foreground-time samples to estimate new and returning players and active playtime. The owner view shows aggregate totals only; gameplay analytics do not store pilot names, wallet addresses, or IP addresses. Player reports may include game version, Mission and Wave, screen size, connection state, and recent technical events when diagnostics are enabled. Manual Feedback and Report a Bug submissions are processed by Resend and delivered to sciconshooter@gmail.com; automatic crash reports remain in the private owner report log. Reports never intentionally include wallet addresses, recovery phrases, private keys, authorization data, or browser storage.
                </p>
              </section>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-cyan-200/15 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowLegal(false);
                  setShowTreasury(true);
                }}
                className="sci-mini-cta"
              >
                <Icon name="wallet" className="h-4 w-4" />
                View treasury
              </button>
              <button type="button" onClick={() => setShowLegal(false)} className="sci-mini-cta">
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      <PlayerShipAccessDialog
        shipId={homeShipAccessId}
        shipUnlocks={shipUnlocks}
        walletConnected={Boolean(walletAddress)}
        playerShipPurchaseStatus={playerShipPurchaseStatus}
        onClose={() => setHomeShipAccessId(null)}
        onRefreshPlayerShipAccess={onRefreshPlayerShipAccess}
        onPurchasePlayerShip={onPurchasePlayerShip}
        onUnlockedAction={(shipId) => {
          onSelectShip(shipId);
          setHomeShipAccessId(null);
        }}
        unlockedActionLabel="Unlocked - select ship"
      />

      <RewardCenter
        open={showRewardCenter}
        initialTab={rewardCenterInitialTab}
        onClose={() => setShowRewardCenter(false)}
        walletConnected={Boolean(walletAddress)}
        permanentState={permanentSquadState}
        onClaimDailyGift={onClaimDailyGift}
        onClaimAchievement={onClaimAchievement}
        onRequestConnect={onRequestWalletConnect}
      />
    </div>
  );
};

export default StartScreen;
