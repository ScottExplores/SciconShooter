import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import StartScreen from './components/StartScreen';
import SciconOnboarding, { type OnboardingSurface } from './components/SciconOnboarding';
import MissionLoadingScreen, { type MissionLoadingPhase } from './components/MissionLoadingScreen';
import { ArchivedWinner, DonationStatus, FieldUpgradeType, GamePolishSettings, GameState, LeaderboardEntry, MintRecord, PowerupType, Stats, Upgrades, WalletSession } from './types';
import {
  audioService,
  cycleMatchMusicTrackId,
  getSectorMatchMusicTrackId,
  type MatchMusicTrackId
} from './services/audioService';
import { installUiAudioFeedback } from './services/uiAudioFeedback';
import {
  ASSETS,
  DONATION_CONFIG,
  FIELD_UPGRADE_CONFIG,
  GAME_CONFIG,
  RSC_PURCHASE_SKUS,
  STORAGE_KEYS,
  getFieldUpgradeFlaskCost,
  getFieldUpgradeLevel,
  type RscPurchaseSkuId
} from './constants';
import { ALL_TIME_SCORE_LIMIT, WEEKLY_SCORE_LIMIT, getLeaderboardData, getLeaderboardWeekScores, saveScore, saveWeeklyLeaderProposal } from './services/leaderboardService';
import { getArchivedWeeklyWinners } from './services/winnerArchiveService';
import { getMissionRecordWeeklyFunding } from './services/weeklyFundingFlow';
import {
  getResearchHubProposalFeed,
  ResearchHubProposal
} from './services/researchHubProposals';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';
import {
  hasSeenStoryBeatTodayForProfile,
  markStoryBeatSeenTodayForProfile
} from './services/storyTransmissionSchedule';
import { loadOnboardingProgress, type OnboardingStepId } from './services/onboardingProgress';
import { BASE_FLASK_CHARGE_MAX, getChargeForStoredFlasks, getFlaskProgress, spendStoredFlasks } from './services/flaskProgress';
import type {
  RscBalanceUpdate,
  WalletPurchaseStatusUpdate,
  WalletRuntimeAction
} from './components/WalletRuntime';
import {
  loadWeeklyRunAttemptQuota,
  type WalletPurchaseSettlement,
  type WeeklyRunAttemptQuota
} from './services/walletPurchaseService';
import type { ContinuePaymentSettlement } from './services/continuePaymentService';
import {
  applyWalletTokenSpend,
  WalletTokenSpendRequestError,
  type WalletTokenSpendAction
} from './services/walletTokenSpendService';
import {
  finishRunSession,
  startRunSession,
  type RunReceipt,
  type RunSession
} from './services/runReceiptService';
import { trackEvent, trackInitialVisit } from './services/analyticsService';
import {
  capturePlayerRuntimeError,
  recordPlayerReportBreadcrumb,
  updatePlayerReportContext
} from './services/playerReportService';
import { getWalletRecords } from './services/recordService';
import { getWalletRuns, type WalletRunRecord } from './services/playerRunService';
import { getWeeklyProposalRecovery } from './services/weeklyProposalRecovery';
import { getWeeklyProposalLifecycle } from './services/weeklyProposalLifecycle';
import {
  getUsablePlayerShip,
  getPlayerShipUnlocks,
  parsePlayerShipId,
  PLAYER_SHIPS,
  type PlayerShipId
} from './services/playerShipService';
import type { GameEngineDebugSnapshot, GameRuntimeState, WaveVictorySummary } from './services/gameLogic';
import { waitForRequiredGameplayAssetPreload } from './services/gameplayAssetPreloadBudget';
import PauseMenu from './components/PauseMenu';
import GameOverPresentation from './components/GameOverPresentation';
import PixelActionButton from './components/PixelActionButton';
import { WalletControl } from './components/WalletControl';
import {
  adjustFounderMainShipUpgrade,
  adjustFounderMiniShipLevel,
  applySquadRunResult,
  awardWeeklySquadCoins,
  buildRuntimeSquadLoadout,
  commitCampaignSquadSettlement,
  consumeWeeklyRunAttempt,
  creditCampaignRewardGrants,
  createFounderSquadSandboxState,
  emitSquadDomainEvent,
  equipMiniShip,
  getMainShipUpgradeCost,
  getMiniShipUpgradeCost,
  getWeeklyRunAttemptsRemaining,
  loadPermanentSquadState,
  loadWeeklySquadState,
  MAIN_SHIP_ABILITY_MAX_LEVEL,
  MAIN_SHIP_FIRE_RATE_MAX_LEVEL,
  MAIN_SHIP_UPGRADES,  migrateLegacySquadProfile,
  MINI_SHIP_CATALOG,
  MINI_SHIP_MAX_LEVEL,
  preloadMiniShipTextures,
  purchaseMiniShip,
  reconcileWeeklyRunAttempts,
  savePermanentSquadState,
  saveWeeklySquadState,
  WEEKLY_RUN_ATTEMPT_LIMIT,
  SQUAD_SLOT_UNLOCK_COST,
  unlockSquadSlot,
  upgradeMainShip,
  upgradeMiniShip,
  type MainShipUpgradeId,
  type MiniShipId,
  CAMPAIGN_MISSION_MASTERY_STARS,
  type PermanentSquadState,
  type RuntimeSquadLoadout,
  type SquadSlotId,
  type WeeklySquadState
} from './services/squadProgression';
import {
  calculateSquadPowerRating,  getCampaignRecommendedSupportIds,
  getCampaignSupportTagsForMiniShip
} from './services/squadPowerRating';
import { createCampaignGraphIndex } from './services/campaignGraph';
import {  finalizeWeeklyCampaignDeliberateEnd,
  finalizeWeeklyCampaignLoss,
  markWeeklyCampaignStreakSubmission,
  recordWeeklyCampaignNodeScore,
  requestWeeklyCampaignAdvance,
  startWeeklyCampaignStreak,
  type WeeklyCampaignSelectionConfirmation,
  type WeeklyCampaignStreakState
} from './services/weeklyCampaignStreak';
import { buildWeeklyCampaignRuntimeOutcome } from './services/weeklyCampaignRuntimeAdapter';
import {
  getWeeklyBoundaryMeta,
  getWeeklyPresentationMeta,
  resolveWeeklyDashboardPublication
} from './shared/weeklyCompetitionBoundary.browser';
import {
  CAMPAIGN_MISSIONS,
  applyCampaignCompletion,
  createCampaignProgress,
  finalizeCampaignCompletionMetrics,
  getCampaignCheckpointLabel,
  getCampaignMissionById,
  getCampaignNotificationCount,
  isCampaignMissionUnlocked,
  isCampaignWaveUnlocked,
  markCampaignMapViewed,
  resetCampaignStars,
  selectCampaignRoute,
  unlockAllCampaignMissions,
  type CampaignCompletionSettlement
} from './services/campaignProgression';
import {
  applyFounderCampaignBranchAction,
  canLaunchCampaignBranch,
  settleCampaignBranchAttempt
} from './services/campaignBranchProgression';
import {
  buildCampaignBranchRuntimeCampaign,
  getCampaignBranchDefinition,
  getCampaignBranchRuntimeWaveId,
  isCombatBranchDefinition,
  isPresentDropBranchDefinition,
  verifyCampaignCombatBranchRuntimeResult,
  verifyPresentDropRuntimeResult,
  type CampaignCombatBranchRuntimeResult,
  type PresentDropRuntimeResult
} from './services/campaignBranchRuntime';
import {
  beginBossArchiveFightEconomy,
  claimAchievement as claimAchievementReward,
  claimDailyGift as claimDailyGiftReward,
  getDailyGiftStatus,
  markBossArchiveViewed,
  recordBossVictory,
  recordLifetimeRun,
  resolveBossArchiveFightEconomy,
  type AchievementId
} from './services/rewardProgression';
import {
  initializeLocalPilotProfile,
  readPilotStats,
  savePilotStats
} from './services/pilotProfileService';
import {
  cacheWalletProfile,
  flushDirtyWalletProfile,
  getSelectedShipStorageKey,
  getWalletProfileId,
  loadAuthenticatedWalletProfile,
  readCachedWalletProfile,
  saveAuthenticatedWalletProfile,
  settleWalletCampaignBranch,
  settleWalletBossArchiveChallenge,
  startWalletCampaignBranch,
  startWalletBossArchiveChallenge,
  WalletProfileRequestError,
  type WalletBossArchiveChallengeRun,
  type WalletCampaignBranchAttempt,
  type WalletProfileSnapshot
} from './services/walletProfileService';
import {
  getWalletProfileSyncFailurePolicy,
  WALLET_PROFILE_SYNC_BUSY_MESSAGE
} from './services/walletProfileSyncPolicy';
import {
  discardWalletProfileDirty,
  markWalletProfileDirty,
  rebaseWalletProfileDirtyAfterServerPurchase,
  rebaseWalletProfileDirtyAfterServerTokenSpend,
  readWalletProfileDirty,
  walletProfileSnapshotsEqual
} from './services/walletProfileDirtyStore';
import { getStageName } from './services/stagePresentation';
import { DEFAULT_GAME_CAMPAIGN } from './services/levelConfig';
import type { CampaignMasteryObjectiveDefinition } from './game-config/types';
import {
  WEEKLY_RUN_INITIAL_STAGE_COUNT,
  WEEKLY_RUN_STAGE_CHUNK,
  getWeeklyRunDepth,
  buildWeeklyRunCampaign,
  getWeeklyRunEntryPoint,
  getWeeklyRunMaterializedStageCount
} from './services/weeklyRunGenerator';
import { resolveRunStartingLives } from './services/runStartingLives';
import {
  BOSS_ARCHIVE_CATALOG,
  buildBossReplayCampaign,
  getBossArchiveEntry,
  type BossArchiveDifficultyId,
  type BossArchiveEntry
} from './services/bossArchive';
import {
  createBossArchiveDeveloperControls,
  DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT,
  getBossArchiveDailyChargeStatus,
  selectBossArchiveEntry,
  type BossArchiveMasteryObjectiveId,
  type BossArchiveRunMode
} from './services/bossArchiveProgression';
import {
  checkForDeploymentUpdate,
  recoverFromModulePreloadFailure,
  reloadForDeploymentUpdate
} from './services/deploymentUpdateService';

const importWalletRuntime = () => import('./components/WalletRuntime');
const WalletRuntime = React.lazy(importWalletRuntime);

/**
 * Desktop browsers only let a page open a wallet popup while it still holds
 * user activation from the click. Connecting used to enable the runtime, wait
 * for this chunk (and the Base Account SDK inside it) to download, mount, and
 * only then call the provider -- by which point the activation was long gone
 * and the popup was blocked. Warming the module during idle time keeps the
 * click-to-popup path short enough to survive.
 */
let walletRuntimeWarmed = false;
const warmWalletRuntime = () => {
  if (walletRuntimeWarmed || typeof window === 'undefined') return;
  walletRuntimeWarmed = true;
  const warm = () => { void importWalletRuntime().catch(() => { walletRuntimeWarmed = false; }); };
  const idle = (window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === 'function') idle(warm, { timeout: 2500 });
  else window.setTimeout(warm, 1200);
};
const loadGameStage = () => import('./components/GameStage');
const loadStoryTransmission = () => import('./components/StoryTransmission');
const MissionRecordPreview = React.lazy(() => import('./components/MissionRecordPreview'));
const WeeklyProposalSelection = React.lazy(() => import('./components/WeeklyProposalSelection'));
const WaveVictoryOverlay = React.lazy(() => import('./components/WaveVictoryOverlay'));
const CampaignBranchResultOverlay = React.lazy(() => import('./components/CampaignBranchResultOverlay'));
const CampaignMap = React.lazy(() => import('./components/CampaignMap'));
const GameStage = React.lazy(loadGameStage);
const StoryTransmission = React.lazy(loadStoryTransmission);
import type {
  CampaignMapDeveloperControls,
  CampaignMapBranchDefinition,
  CampaignMapBranchLaunchRequest,
  CampaignMapBranchProgress,
  CampaignLabLaunchRequest,
  CampaignLabLoadoutPreset,
  CampaignLabTelemetry,
  CampaignMapLaunchRequest,
  CampaignMapRouteSelectionRequest,
  CampaignMapStatus
} from './components/CampaignMap';

type GameplayPreloadPhase = Exclude<MissionLoadingPhase, 'error' | 'runtime-sync'>;
type GameplayPreloadListener = (progress: number, phase: GameplayPreloadPhase) => void;

const MISSION_LOADING_TIPS = [
  'Break boss cannons first to remove their fire lanes before attacking the hull.',
  'Tokens fund permanent Hangar upgrades and remain with your profile between weekly competitions.',
  'Companion ships have distinct roles. Match their abilities to the bottleneck ahead.',
  'A warm mission launch reuses decoded systems, so retries can deploy immediately.',
  'Collect dropped Tokens quickly, or bring a magnet companion to pull them in.',
  'Save bombs for dense swarms or the moment a boss fills the screen with projectiles.'
] as const;

const AUTHORED_CAMPAIGN_STAGE_COUNT = Math.max(1, DEFAULT_GAME_CAMPAIGN.levels.length);

/**
 * The Weekly Run is generated, not authored, and it is regenerated each week.
 *
 * It used to reorder Campaign levels and run on the *Campaign* graph, which
 * tied the weekly competition to Campaign content. It now has its own endless
 * escalating stage ladder and its own linear graph; nothing here reads Campaign
 * progress or mission definitions.
 *
 * Memoized on week plus materialized depth because generating a runway of
 * procedural waves is not free, and extending it must preserve the same prefix.
 */
const weeklyRunCache = new Map<string, {
  campaign: ReturnType<typeof buildWeeklyRunCampaign>;
  graph: ReturnType<typeof createCampaignGraphIndex>;
  entry: ReturnType<typeof getWeeklyRunEntryPoint>;
  missionIds: Set<string>;
}>();

const getWeeklyRun = (
  weekKey: string,
  stageCount = WEEKLY_RUN_INITIAL_STAGE_COUNT
) => {
  const materializedStageCount = getWeeklyRunMaterializedStageCount(stageCount);
  const cacheKey = `${weekKey}:${materializedStageCount}`;
  const cached = weeklyRunCache.get(cacheKey);
  if (cached) return cached;
  const campaign = buildWeeklyRunCampaign(weekKey, DEFAULT_GAME_CAMPAIGN, materializedStageCount);
  const built = {
    campaign,
    graph: createCampaignGraphIndex(campaign),
    entry: getWeeklyRunEntryPoint(weekKey),
    missionIds: new Set(campaign.levels.map((level) => level.id))
  };
  // Keep the latest runway only. A deeper one contains the exact same prefix.
  weeklyRunCache.clear();
  weeklyRunCache.set(cacheKey, built);
  return built;
};
const CAMPAIGN_BRANCH_DEFINITIONS = DEFAULT_GAME_CAMPAIGN.campaignBranches ?? [];
const CAMPAIGN_MAP_BRANCHES: CampaignMapBranchDefinition[] = CAMPAIGN_BRANCH_DEFINITIONS.map((branch) => ({
  branchId: branch.branchId,
  sourceMissionId: branch.sourceMissionId,
  displayName: branch.displayName,
  hiddenName: branch.hiddenName,
  missionType: branch.missionType === 'elite-remix'
    ? 'elite-challenge'
    : branch.missionType === 'mini-boss-signal'
      ? 'mini-boss-challenge'
      : branch.missionType,
  requiredStars: branch.requiredStars,
  mapPosition: branch.mapPosition,
  routeControlPoints: branch.routeControlPoints,
  icon: branch.icon,
  lockedIcon: branch.lockedIcon,
  rewardPreview: `${branch.rewardPreview.label} / ${branch.rewardPreview.minimumCoins}-${branch.rewardPreview.maximumCoins} TOKENS`,
  oneTimeCompletion: branch.oneTimeCompletion,
  replayPolicy: branch.replayPolicy === 'no-replay-after-claim' ? 'one-time' : 'repeatable',
  missionDefinitionId: branch.missionDefinitionId,
  returnNodeId: branch.returnNodeId,
  nextBranchNodeId: branch.nextBranchNodeId ?? undefined,
  discoveryState: 'locked'
}));

const getRandomMissionLoadingTip = () => (
  MISSION_LOADING_TIPS[Math.floor(Math.random() * MISSION_LOADING_TIPS.length)]
);

const getNewlyAffordableSquadUpgrade = (
  state: WeeklySquadState,
  nextCoinBalance: number,
  shipId: PlayerShipId
) => {
  const before = Math.max(0, Math.floor(state.coins));
  const after = Math.max(before, Math.floor(nextCoinBalance));
  if (after <= before) return null;
  const candidates: Array<{ cost: number; label: string }> = [];
  (['left', 'right'] as const).forEach((slot) => {
    if (!state.unlockedSlots[slot]) {
      candidates.push({
        cost: SQUAD_SLOT_UNLOCK_COST[slot],
        label: `${slot === 'left' ? 'Left' : 'Right'} Wing unlock`
      });
    }
  });
  MINI_SHIP_CATALOG.forEach((miniShip) => {
    const level = state.ownedMiniShips[miniShip.id] ?? 0;
    if (level <= 0 && miniShip.purchaseCost > 0) {
      candidates.push({ cost: miniShip.purchaseCost, label: `${miniShip.name} unlock` });
    } else if (level > 0 && level < MINI_SHIP_MAX_LEVEL) {
      candidates.push({
        cost: getMiniShipUpgradeCost(miniShip.id, level),
        label: `${miniShip.name} upgrade`
      });
    }
  });
  const shipUpgrades = state.shipUpgrades[shipId];
  MAIN_SHIP_UPGRADES.forEach((upgrade) => {
    const level = shipUpgrades?.[upgrade.id] ?? 0;
    const cost = getMainShipUpgradeCost(upgrade.id, level);
    if (Number.isFinite(cost)) candidates.push({ cost, label: `${upgrade.name} upgrade` });
  });
  return candidates
    .filter((candidate) => candidate.cost > before && candidate.cost <= after)
    .sort((left, right) => left.cost - right.cost)[0]?.label ?? null;
};

let gameplayPreloadPromise: Promise<void> | null = null;
let gameplayPreloadReady = false;
let gameplayPreloadProgress = 0;
let gameplayPreloadPhase: GameplayPreloadPhase = 'flight-systems';
let gameplayPreloadAttempt = 0;
const gameplayPreloadListeners = new Set<GameplayPreloadListener>();

const broadcastGameplayPreload = () => {
  gameplayPreloadListeners.forEach((listener) => {
    listener(gameplayPreloadProgress, gameplayPreloadPhase);
  });
};

const updateGameplayPreload = (progress: number, phase: GameplayPreloadPhase) => {
  gameplayPreloadProgress = Math.max(gameplayPreloadProgress, Math.min(100, progress));
  gameplayPreloadPhase = phase;
  broadcastGameplayPreload();
};

const ensureGameplayPreload = () => {
  if (gameplayPreloadReady) return Promise.resolve();
  if (gameplayPreloadPromise) return gameplayPreloadPromise;

  gameplayPreloadProgress = 0;
  gameplayPreloadPhase = 'flight-systems';
  broadcastGameplayPreload();
  const preloadAttempt = ++gameplayPreloadAttempt;
  const updateCurrentGameplayPreload = (
    progress: number,
    phase: GameplayPreloadPhase
  ) => {
    if (preloadAttempt !== gameplayPreloadAttempt) return;
    updateGameplayPreload(progress, phase);
  };

  const gameStageModule = loadGameStage().then((gameplay) => {
    updateCurrentGameplayPreload(gameplayPreloadProgress + 34, 'mission-interface');
    return gameplay;
  });
  const storyTransmissionModule = loadStoryTransmission().then((storyTransmission) => {
    updateCurrentGameplayPreload(
      gameplayPreloadProgress + 12,
      gameplayPreloadPhase === 'mission-art' || gameplayPreloadPhase === 'ready'
        ? gameplayPreloadPhase
        : 'mission-interface'
    );
    return storyTransmission;
  });
  const productionAssets = gameStageModule.then(async (gameplay) => {
    updateCurrentGameplayPreload(gameplayPreloadProgress, 'mission-art');
    await gameplay.preloadGameplayAssets();
    updateCurrentGameplayPreload(gameplayPreloadProgress + 46, 'mission-art');
  });

  gameplayPreloadPromise = waitForRequiredGameplayAssetPreload(Promise.all([
    gameStageModule,
    storyTransmissionModule,
    productionAssets
  ]))
    .then(() => {
      gameplayPreloadReady = true;
      updateCurrentGameplayPreload(100, 'ready');
    }).catch((error: unknown) => {
      if (preloadAttempt === gameplayPreloadAttempt) gameplayPreloadAttempt++;
      gameplayPreloadPromise = null;
      gameplayPreloadProgress = 0;
      gameplayPreloadPhase = 'flight-systems';
      throw error;
    });

  return gameplayPreloadPromise;
};

const preloadGameplayComponents = (listener?: GameplayPreloadListener) => {
  if (listener) {
    gameplayPreloadListeners.add(listener);
    listener(gameplayPreloadProgress, gameplayPreloadPhase);
  }

  const preload = ensureGameplayPreload();
  return listener
    ? preload.finally(() => gameplayPreloadListeners.delete(listener))
    : preload;
};

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type ProposalSelectionStatus = 'idle' | 'saving' | 'confirmed' | 'error';
type ActiveRunMode = 'standard' | 'campaign' | 'campaign-replay' | 'weekly-streak' | 'campaign-lab' | 'campaign-branch' | 'owner-test' | 'boss-archive';
type CampaignResultPresentation = {
  summaryId: string;
  settlement: CampaignCompletionSettlement;
  collectedCoins: number;
  newlyAffordableUpgrade: string | null;
};
type CampaignBranchVerifiedResult = (
  | ({ kind: 'present-drop' } & PresentDropRuntimeResult)
  | ({ kind: 'combat' } & CampaignCombatBranchRuntimeResult)
);
type CampaignBranchResultPresentation = CampaignBranchVerifiedResult & {
  branchId: string;
  branchName: string;
  summaryId: string;
  duplicate: boolean;
  newlyAffordableUpgrade: string | null;
};
type CampaignBranchRunContext = {
  branchId: string;
  serverAttempt: WalletCampaignBranchAttempt | null;
  serverWalletAddress: string | null;
};
type BossArchiveRunContext = {
  eventId: string;
  mode: BossArchiveRunMode;
  variantId: string;
  difficultyId: BossArchiveDifficultyId;
  seed: string;
  resultId: string;
  serverChallengeRun: WalletBossArchiveChallengeRun | null;
  serverWalletAddress: string | null;
};
type BossArchiveResultPresentation = {
  eventId: string;
  outcome: 'victory' | 'defeat';
  clearTimeMs: number | null;
  damageTaken: number;
  noHit: boolean;
  newPersonalRecord: boolean;
  rewardCoins: number;
  chargesRemaining: number;
  masteryCompletedIds: BossArchiveMasteryObjectiveId[];
  mode: BossArchiveRunMode;
  variantId: string;
  difficultyId: BossArchiveDifficultyId;
  notice?: string;
};
type MissionLoadingState = {
  progress: number;
  phase: MissionLoadingPhase;
  tip: string;
};
type PauseMissionPosition = Pick<
  GameRuntimeState,
  | 'levelId'
  | 'levelNumber'
  | 'levelName'
  | 'waveId'
  | 'waveNumber'
  | 'waveTotal'
  | 'absoluteWaveNumber'
  | 'continuousRun'
>;
type PendingMissionRuntimeLaunch = {
  launchNonce: number;
  gameId: number;
  startInTestMode: boolean;
  tip: string;
  squadLoadout: RuntimeSquadLoadout;
  runMode: ActiveRunMode;
  missionNumber: number;
};

const OWNER_TEST_FLASK_COUNT = 40;
const DEPLOYMENT_UPDATE_CHECK_MS = 60_000;
const INITIAL_DEPLOYMENT_UPDATE_CHECK_MS = 12_000;
const OWNER_TEST_FLASK_CHARGE = getChargeForStoredFlasks(OWNER_TEST_FLASK_COUNT);
const BACKGROUND_LEADERBOARD_REFRESH_MS = 60_000;
const PROPOSAL_REFRESH_MS = 5 * 60 * 1000;
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const runAfterFirstPaint = (
  callback: () => void,
  options: { delayMs?: number; timeoutMs?: number } = {}
) => {
  const { delayMs = 650, timeoutMs = 2400 } = options;
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let frameHandle: number | null = null;
  let delayHandle: number | null = null;
  let idleHandle: number | null = null;

  const run = () => {
    if (!cancelled) {
      callback();
    }
  };

  frameHandle = window.requestAnimationFrame(() => {
    delayHandle = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(run, { timeout: timeoutMs });
      } else {
        run();
      }
    }, delayMs);
  });

  return () => {
    cancelled = true;
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle);
    }
    if (delayHandle !== null) {
      window.clearTimeout(delayHandle);
    }
    if (idleHandle !== null && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(idleHandle);
    }
  };
};

const openExternalUrl = async (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const defaultMissionUpgrades: Upgrades = {
  fireRate: 0,
  speed: 0,
  ability: 0
};

const defaultPolishSettings: GamePolishSettings = {
  screenShake: true,
  highDensityParticles: true
};

const getInitialPolishSettings = (): GamePolishSettings => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.POLISH_SETTINGS) || '{}') as Partial<GamePolishSettings>;
    return {
      screenShake: typeof parsed.screenShake === 'boolean' ? parsed.screenShake : defaultPolishSettings.screenShake,
      highDensityParticles: typeof parsed.highDensityParticles === 'boolean' ? parsed.highDensityParticles : defaultPolishSettings.highDensityParticles
    };
  } catch {
    return defaultPolishSettings;
  }
};

const defaultPowerupUses: Record<PowerupType, number> = {
  [PowerupType.DOUBLE_SHOT]: 0,
  [PowerupType.TRIPLE_SHOT]: 0,
  [PowerupType.OVERDRIVE]: 0,
  [PowerupType.MAX_SHOT]: 0,
  [PowerupType.MAGNET]: 0,
  [PowerupType.SHIELD]: 0,
  [PowerupType.EXTRA_LIFE]: 0,
  [PowerupType.RESEARCH_BEAM]: 0
};

const RESUME_COUNTDOWN_START = 3;
const RESUME_COUNTDOWN_STEP_MS = 1_000;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [gameId, setGameId] = useState<number>(0);
  const [activeRunLifeCapacity, setActiveRunLifeCapacity] = useState(GAME_CONFIG.PLAYER_LIVES);
  const [gameRuntimeReady, setGameRuntimeReady] = useState(false);
  const [missionLoading, setMissionLoading] = useState<MissionLoadingState | null>(null);
  const [onboardingRestartNonce, setOnboardingRestartNonce] = useState(0);
  const [onboardingInvitationNonce, setOnboardingInvitationNonce] = useState(0);
  const [onboardingGameplayFreeze, setOnboardingGameplayFreeze] = useState(false);
  const [onboardingStepId, setOnboardingStepId] = useState<OnboardingStepId | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [archivedWinners, setArchivedWinners] = useState<ArchivedWinner[]>([]);
  const [weeklyPresentationTime, setWeeklyPresentationTime] = useState(() => Date.now());
  const [walletRecords, setWalletRecords] = useState<MintRecord[]>([]);
  const [walletRuns, setWalletRuns] = useState<WalletRunRecord[]>([]);
  const [walletRunsLoading, setWalletRunsLoading] = useState(false);
  const [pilotProfile] = useState(initializeLocalPilotProfile);
  const [activeProfileId, setActiveProfileId] = useState(pilotProfile.id);
  const [selectedShipId, setSelectedShipId] = useState<PlayerShipId>(() => (
    parsePlayerShipId(
      localStorage.getItem(getSelectedShipStorageKey(pilotProfile.id))
      || localStorage.getItem(STORAGE_KEYS.SELECTED_SHIP)
    )
  ));
  const [weeklySquadState, setWeeklySquadState] = useState<WeeklySquadState>(() => (
    loadWeeklySquadState(pilotProfile.id)
  ));
  const [weeklyRunStageCount, setWeeklyRunStageCount] = useState(
    WEEKLY_RUN_INITIAL_STAGE_COUNT
  );
  const [permanentSquadState, setPermanentSquadState] = useState<PermanentSquadState>(() => (
    loadPermanentSquadState(pilotProfile.id)
  ));
  /**
   * This week's generated Weekly Run: its own endless stage ladder and its own
   * graph, regenerated at the weekly boundary and identical for every player
   * within a week.
   */
  const weeklyRunRequiredStageCount = weeklySquadState.weeklyCampaignStreak?.finalization.status === 'active'
    ? weeklySquadState.weeklyCampaignStreak.score.completedNodeCount + WEEKLY_RUN_STAGE_CHUNK
    : WEEKLY_RUN_INITIAL_STAGE_COUNT;
  const weeklyRunMaterializedStageCount = getWeeklyRunMaterializedStageCount(Math.max(
    weeklyRunStageCount,
    weeklyRunRequiredStageCount
  ));
  const weeklyRun = useMemo(() => getWeeklyRun(
    weeklySquadState.weekKey,
    weeklyRunMaterializedStageCount
  ), [weeklyRunMaterializedStageCount, weeklySquadState.weekKey]);
  useEffect(() => {
    setWeeklyRunStageCount(WEEKLY_RUN_INITIAL_STAGE_COUNT);
  }, [weeklySquadState.weekKey]);
  const [fundingProposals, setFundingProposals] = useState<ResearchHubProposal[]>([]);
  const [proposalReferences, setProposalReferences] = useState<ResearchHubProposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState<ProposalFeedStatus>('loading');
  const [playerNameInput, setPlayerNameInput] = useState<string>(() => (
    readPilotStats(pilotProfile.id).playerName
  ));
  const [showNameInput, setShowNameInput] = useState<boolean>(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(true);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [scoreSaved, setScoreSaved] = useState<boolean>(false);
  const [scoreSubmitError, setScoreSubmitError] = useState<string>('');
  const [showLabGlow, setShowLabGlow] = useState<boolean>(true);
  const [walletError, setWalletError] = useState<string>('');
  const [walletProfileStatus, setWalletProfileStatus] = useState<
    'guest' | 'authenticating' | 'ready' | 'syncing' | 'error'
  >('guest');
  const [walletProfileAuthorizationNonce, setWalletProfileAuthorizationNonce] = useState(0);
  const [walletProfileRetryNonce, setWalletProfileRetryNonce] = useState(0);
  const [walletRuntimeEnabled, setWalletRuntimeEnabled] = useState(() => (
    Boolean(localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS))
  ));
  const [walletRuntimeAction, setWalletRuntimeAction] = useState<WalletRuntimeAction | null>(null);
  const [rscBalanceUpdate, setRscBalanceUpdate] = useState<RscBalanceUpdate>({
    status: 'idle',
    balance: null
  });
  const [walletPurchaseStatus, setWalletPurchaseStatus] = useState<WalletPurchaseStatusUpdate>({
    status: 'idle'
  });
  const [walletSession, setWalletSession] = useState<WalletSession>({
    address: null,
    chainId: null,
    status: 'idle',
    error: '',
    connectorName: undefined,
    hasDonated: false
  });
  const [continuePaymentStatus, setContinuePaymentStatus] = useState<DonationStatus>('idle');
  const [continuePaymentHash, setContinuePaymentHash] = useState<string>('');
  const [continuePaymentError, setContinuePaymentError] = useState<string>('');
  const [continuesUsed, setContinuesUsed] = useState(0);
  const [activeStoryBeat, setActiveStoryBeat] = useState<StoryBeat | null>(null);
  const [bombCommand, setBombCommand] = useState<{ nonce: number } | null>(null);
  const [shipAbilityCommand, setShipAbilityCommand] = useState<{ nonce: number } | null>(null);
  const [continueCommand, setContinueCommand] = useState<{ nonce: number; lives: number } | null>(null);
  const [waveContinueCommand, setWaveContinueCommand] = useState<{
    nonce: number;
    targetLevelId?: string;
    targetWaveId?: string;
  } | null>(null);
  const [waveVictorySummary, setWaveVictorySummary] = useState<WaveVictorySummary | null>(null);
  const [campaignResultPresentation, setCampaignResultPresentation] = useState<CampaignResultPresentation | null>(null);
  const [campaignBranchResult, setCampaignBranchResult] = useState<CampaignBranchResultPresentation | null>(null);
  const [campaignMapOpen, setCampaignMapOpen] = useState(() => (
    new URLSearchParams(window.location.search).get('view') === 'campaign-map'
  ));
  const [campaignMapStatus, setCampaignMapStatus] = useState<CampaignMapStatus>('ready');
  const [campaignMapError, setCampaignMapError] = useState('');
  const [campaignMapFocusMissionId, setCampaignMapFocusMissionId] = useState<string | null>(null);
  const [campaignMapFocusBranchId, setCampaignMapFocusBranchId] = useState<string | null>(null);
  const [campaignMapUnlockingBranchId, setCampaignMapUnlockingBranchId] = useState<string | null>(null);
  const [campaignMapNewMissionIds, setCampaignMapNewMissionIds] = useState<string[]>([]);  const [, setWeeklyCampaignConfirmation] = useState<WeeklyCampaignSelectionConfirmation | null>(null);
  const [activeCampaignLaunch, setActiveCampaignLaunch] = useState<CampaignMapLaunchRequest | null>(null);
  const [activeCampaignBranchId, setActiveCampaignBranchId] = useState<string | null>(null);
  const [campaignBranchSpawnSeed, setCampaignBranchSpawnSeed] = useState(0);
  const [campaignBranchValueMultiplier, setCampaignBranchValueMultiplier] = useState(1);
  const [campaignLabShipId, setCampaignLabShipId] = useState<PlayerShipId>('researchhub');
  const initialCampaignLabSupports = getCampaignRecommendedSupportIds(
    CAMPAIGN_MISSIONS[0]?.recommendedSupportTags ?? [],
    2
  );
  const [campaignLabSupportId, setCampaignLabSupportId] = useState<string>(
    initialCampaignLabSupports[0] ?? 'none'
  );
  const [campaignLabRightSupportId, setCampaignLabRightSupportId] = useState<string>('none');
  const [campaignLabPreset, setCampaignLabPreset] = useState<CampaignLabLoadoutPreset>('expected-power');
  const [campaignLabUpgradeLevels, setCampaignLabUpgradeLevels] = useState<Record<string, number>>({
    fireRate: 7,
    speed: 3,
    startingHearts: 1,
    supportLevel: 2
  });
  const [campaignLabLoopFormation, setCampaignLabLoopFormation] = useState(false);
  const [campaignLabTelemetry, setCampaignLabTelemetry] = useState<CampaignLabTelemetry | null>(null);
  const [campaignLabMissionId, setCampaignLabMissionId] = useState(() => CAMPAIGN_MISSIONS[0]?.id ?? 'mission-01');
  const [campaignLabWaveId, setCampaignLabWaveId] = useState('');
  const [activeMissionShipId, setActiveMissionShipId] = useState<PlayerShipId>('researchhub');
  const [campaignCompletedRun, setCampaignCompletedRun] = useState(false);
  const [activeRunMode, setActiveRunMode] = useState<ActiveRunMode>('standard');
  const [activeBossEncounterId, setActiveBossEncounterId] = useState<string | null>(null);
  const [activeBossArchiveRun, setActiveBossArchiveRun] = useState<BossArchiveRunContext | null>(null);
  const [bossArchiveResult, setBossArchiveResult] = useState<BossArchiveResultPresentation | null>(null);
  const [bossArchiveLaunchError, setBossArchiveLaunchError] = useState<string | null>(null);
  const [weeklyRunLaunchError, setWeeklyRunLaunchError] = useState<string | null>(null);
  const [weeklyRunAttemptQuota, setWeeklyRunAttemptQuota] = useState<WeeklyRunAttemptQuota | null>(null);
  const [weeklyRunAttemptQuotaOwner, setWeeklyRunAttemptQuotaOwner] = useState<string | null>(null);
  const [bossArchiveDailyLimit, setBossArchiveDailyLimit] = useState(
    DEFAULT_BOSS_ARCHIVE_DAILY_CHARGE_LIMIT
  );
  const [testWaveCommand, setTestWaveCommand] = useState<{ nonce: number; wave: number } | null>(null);
  const [testBossCommand, setTestBossCommand] = useState<{ nonce: number; wave: number } | null>(null);
  const [testFlaskCommand, setTestFlaskCommand] = useState<{ nonce: number; charge: number } | null>(null);
  const [showTestChampionPreview, setShowTestChampionPreview] = useState(false);
  const [ownerFrameFrozen, setOwnerFrameFrozen] = useState(false);
  const [resumeCountdown, setResumeCountdown] = useState<number | null>(null);
  const resumeCountdownActive = resumeCountdown !== null;
  const [introMissionLocked, setIntroMissionLocked] = useState(false);
  const [donatedWallets] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DONATED_WALLETS) || '{}');
    } catch {
      return {};
    }
  });
  const lastStoryWaveRef = useRef(0);
  const diagnosticWaveRef = useRef('');
  const missionLaunchNonceRef = useRef(0);
  const missionLaunchPendingRef = useRef(false);
  const weeklyRunAdmissionPendingRef = useRef(false);
  const pendingMissionRuntimeRef = useRef<PendingMissionRuntimeLaunch | null>(null);
  const introStoryTimeoutRef = useRef<number | null>(null);
  const weeklyProposalTransitionRef = useRef<number | null>(null);
  const weeklyProposalReturnRef = useRef<'results' | 'record'>('results');
  const gameStateRef = useRef<GameState>(GameState.MENU);
  const openCampaignMapRef = useRef<(focusMissionId?: string | null) => void>(() => undefined);
  // Legacy Campaign Map tooling reaches its later-declared Weekly route
  // callback through a ref. Player-facing Weekly Run starts only from Home.
  const selectWeeklyCampaignMissionFromMapRef = useRef<
    (request: CampaignMapLaunchRequest & { nodeId: string }) => void
  >(() => undefined);
  const submittingScoreRef = useRef(false);
  const bossArchiveDamageTakenRef = useRef(0);
  const processedBossArchiveResultsRef = useRef(new Set<string>());
  const submittedScoreKeysRef = useRef<Set<string>>(new Set());
  const runSessionPromiseRef = useRef<Promise<RunSession> | null>(null);
  const onboardingRunSessionPendingRef = useRef<{
    testRun: boolean;
    runMode: ActiveRunMode;
  } | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const weeklyRunSessionKeyRef = useRef<string | null>(null);
  const weeklyRunAttemptQuotaRef = useRef<WeeklyRunAttemptQuota | null>(null);
  const weeklyRunAttemptQuotaOwnerRef = useRef<string | null>(null);
  const activeRunShipIdRef = useRef<PlayerShipId>('researchhub');
  const runReceiptPromiseRef = useRef<Promise<RunReceipt> | null>(null);
  const finalizedRunGameIdRef = useRef<number | null>(null);
  const squadRunAppliedGameIdRef = useRef<number | null>(null);
  const permanentRunAppliedGameIdRef = useRef<number | null>(null);
  const permanentBossAppliedKeysRef = useRef<Set<string>>(new Set());
  const processedCampaignSummaryKeysRef = useRef<Set<string>>(new Set());
  const campaignAttemptIdRef = useRef('');
  const campaignRunMasteryEligibleRef = useRef(false);
  const campaignBranchRunRef = useRef<CampaignBranchRunContext | null>(null);
  const campaignBranchAttemptSettledRef = useRef(false);
  const campaignBranchCoinBaselineRef = useRef<number | null>(null);
  const campaignLabActiveRequestRef = useRef<CampaignLabLaunchRequest | null>(null);
  const campaignRunCreditedEnemiesRef = useRef(0);
  /**
   * Weekly Run depth, tracked across the whole gauntlet rather than per
   * Mission, because a run spans nine Sectors in one continuous session.
   */
  const weeklyRunSectorReachedRef = useRef(0);
  const weeklyRunSectorsClearedRef = useRef(0);
  const campaignResultPreviewRef = useRef(false);
  const weeklySquadStateRef = useRef(weeklySquadState);
  const permanentSquadStateRef = useRef(permanentSquadState);
  const activeRunSquadLoadoutRef = useRef<RuntimeSquadLoadout>(
    buildRuntimeSquadLoadout(weeklySquadState, 'researchhub')
  );
  const walletActionNonceRef = useRef(0);
  const profileTransitionNonceRef = useRef(0);
  const walletProfileInteractiveAuthorizationRef = useRef(false);
  const walletProfileRevisionRef = useRef(0);
  const walletProfileAddressRef = useRef<string | null>(null);
  const walletProfileSessionAddressRef = useRef<string | null>(null);
  const walletProfileHydratingRef = useRef(false);
  const walletProfileSyncedSnapshotRef = useRef<WalletProfileSnapshot | null>(null);
  const walletProfileLocalBaselineRef = useRef<WalletProfileSnapshot | null>(null);
  const walletProfileSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const walletProfileSessionChainRef = useRef<Promise<void>>(Promise.resolve());
  const walletTokenSpendInFlightRef = useRef(false);
  const walletTokenSpendPendingRef = useRef(new Map<string, {
    spendId: string;
    expectedRevision: number;
    action: WalletTokenSpendAction;
  }>());
  const walletProfileSyncRetryCountRef = useRef(0);
  const walletProfileSyncNotBeforeRef = useRef(0);
  const rewardClaimInFlightRef = useRef(false);
  const proposalRefreshNonceRef = useRef(0);
  const weeklyLeaderProposalIdRef = useRef<string | null>(null);
  const pendingDeploymentEntryRef = useRef<string | null>(null);
  const [runReceipt, setRunReceipt] = useState<RunReceipt | null>(null);
  const [runReceiptStatus, setRunReceiptStatus] = useState<'idle' | 'starting' | 'finalizing' | 'ready' | 'local' | 'error'>('idle');
  const [showMissionRecordPreview, setShowMissionRecordPreview] = useState(false);
  const [missionRecordPilotName, setMissionRecordPilotName] = useState<string | null>(null);
  const [showWeeklyProposalSelection, setShowWeeklyProposalSelection] = useState(false);
  const [weeklyProposalSelectionStatus, setWeeklyProposalSelectionStatus] = useState<ProposalSelectionStatus>('idle');
  const [weeklyProposalSelectionMessage, setWeeklyProposalSelectionMessage] = useState('');
  const [weeklyProposalSelectionMode, setWeeklyProposalSelectionMode] = useState<'required' | 'recovery'>('recovery');
  const [scorecardChampionWinner, setScorecardChampionWinner] = useState<ArchivedWinner | null>(null);
  const [championClaimStatus, setChampionClaimStatus] = useState<'idle' | 'connecting' | 'signing' | 'confirmed' | 'error'>('idle');
  const [championClaimMessage, setChampionClaimMessage] = useState('');
  const [missionMintStatus, setMissionMintStatus] = useState<'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error'>('idle');
  const [missionMintMessage, setMissionMintMessage] = useState('');

  const clearIntroStoryTimeout = () => {
    if (introStoryTimeoutRef.current) {
      window.clearTimeout(introStoryTimeoutRef.current);
      introStoryTimeoutRef.current = null;
    }
  };

  const clearWeeklyProposalTransition = () => {
    if (weeklyProposalTransitionRef.current) {
      window.clearTimeout(weeklyProposalTransitionRef.current);
      weeklyProposalTransitionRef.current = null;
    }
  };

  /** Keeps presentation state and the launch-time authority cache in lockstep.
   *  The owner binding prevents a late response from one wallet being reused
   *  after Base Account switches to another wallet. */
  const applyWeeklyRunAttemptQuota = useCallback((
    quota: WeeklyRunAttemptQuota | null,
    ownerAddress: string | null
  ) => {
    const normalizedOwner = ownerAddress?.toLowerCase() ?? null;
    weeklyRunAttemptQuotaRef.current = quota;
    weeklyRunAttemptQuotaOwnerRef.current = normalizedOwner;
    setWeeklyRunAttemptQuota(quota);
    setWeeklyRunAttemptQuotaOwner(normalizedOwner);
  }, []);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const beginResumeCountdown = useCallback(() => {
    if (gameStateRef.current !== GameState.PAUSED) return;
    setOwnerFrameFrozen(false);
    setResumeCountdown(current => current ?? RESUME_COUNTDOWN_START);
  }, []);

  useEffect(() => {
    if (!resumeCountdownActive) return undefined;
    if (gameState !== GameState.PAUSED) {
      setResumeCountdown(null);
      return undefined;
    }

    let current = RESUME_COUNTDOWN_START;
    let timeoutId: number | null = null;
    let cancelled = false;

    const clearTick = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleTick = () => {
      if (cancelled || document.hidden) return;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (cancelled || document.hidden) return;
        if (current > 1) {
          current -= 1;
          setResumeCountdown(current);
          scheduleTick();
          return;
        }

        setResumeCountdown(null);
        setOwnerFrameFrozen(false);
        setGameState(GameState.PLAYING);
      }, RESUME_COUNTDOWN_STEP_MS);
    };

    const handleVisibilityChange = () => {
      clearTick();
      if (document.hidden) return;
      current = RESUME_COUNTDOWN_START;
      setResumeCountdown(current);
      scheduleTick();
    };

    setResumeCountdown(current);
    scheduleTick();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearTick();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameState, resumeCountdownActive]);

  // Warm the wallet chunk during idle so the first Connect click can open its
  // popup while the browser still honours the user activation.
  useEffect(() => { warmWalletRuntime(); }, []);

  useEffect(() => {
    weeklySquadStateRef.current = weeklySquadState;
  }, [weeklySquadState]);

  useEffect(() => {
    permanentSquadStateRef.current = permanentSquadState;
  }, [permanentSquadState]);

  useEffect(() => {
    rewardClaimInFlightRef.current = false;
  }, [permanentSquadState]);

  useEffect(() => () => {
    missionLaunchNonceRef.current += 1;
    missionLaunchPendingRef.current = false;
    pendingMissionRuntimeRef.current = null;
    onboardingRunSessionPendingRef.current = null;
    clearIntroStoryTimeout();
    clearWeeklyProposalTransition();
  }, []);

  useEffect(() => {
    trackInitialVisit();
  }, []);

  useEffect(() => {
    if (proposalStatus === 'loading' || gameplayPreloadReady || gameplayPreloadPromise) {
      return undefined;
    }

    // Proposal data and its first images get network priority on slower phones.
    // Mission modules and textures warm only after that feed settles and the
    // browser has idle time. A pilot who launches first joins the same preload
    // promise and sees the existing progress presentation.
    return runAfterFirstPaint(() => {
      void preloadGameplayComponents().catch(() => undefined);
    }, {
      delayMs: 1_200,
      timeoutMs: 5_000
    });
  }, [proposalStatus]);

  useEffect(() => {
    let cancelled = false;
    let checkInFlight = false;

    const applyOrDeferUpdate = (entryAsset: string) => {
      if (gameStateRef.current === GameState.MENU) {
        reloadForDeploymentUpdate(entryAsset);
        return;
      }
      pendingDeploymentEntryRef.current = entryAsset;
    };

    const checkForUpdate = async () => {
      if (cancelled || checkInFlight || document.hidden) return;
      checkInFlight = true;
      const entryAsset = await checkForDeploymentUpdate();
      checkInFlight = false;
      if (!cancelled && entryAsset) applyOrDeferUpdate(entryAsset);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) void checkForUpdate();
    };
    const handlePageShow = () => {
      void checkForUpdate();
    };

    const initialCheckId = window.setTimeout(() => {
      void checkForUpdate();
    }, INITIAL_DEPLOYMENT_UPDATE_CHECK_MS);
    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, DEPLOYMENT_UPDATE_CHECK_MS);
    window.addEventListener('focus', handlePageShow);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(initialCheckId);
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handlePageShow);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (gameState !== GameState.MENU || !pendingDeploymentEntryRef.current) return;
    reloadForDeploymentUpdate(pendingDeploymentEntryRef.current);
  }, [gameState]);

  const wallet = useMemo<WalletSession>(() => {
    const address = walletSession.address ?? null;
    const isWalletBusy = walletRuntimeAction?.type === 'connect'
      || walletRuntimeAction?.type === 'switch-account'
      || walletRuntimeAction?.type === 'continue';

    return {
      ...walletSession,
      address,
      status: isWalletBusy || walletSession.status === 'connecting'
        ? 'connecting'
        : address
          ? 'connected'
          : walletError
            ? 'error'
            : walletSession.status,
      error: walletError,
      hasDonated: address ? Boolean(donatedWallets[address.toLowerCase()]) : false
    };
  }, [donatedWallets, walletError, walletRuntimeAction?.type, walletSession]);
  const activeWalletAddress = wallet.address ?? null;
  const isOwnerWallet = activeWalletAddress?.toLowerCase() === DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase();
  const founderAuthorizationRef = useRef(Boolean(isOwnerWallet));
  founderAuthorizationRef.current = Boolean(isOwnerWallet);
  const isOwnerTestRun = activeRunMode === 'owner-test';
  const isBossArchiveRun = activeRunMode === 'boss-archive';
  const isCampaignBranchRun = activeRunMode === 'campaign-branch';
  const isCampaignLabRun = activeRunMode === 'campaign-lab';
  const isWeeklyCampaignRun = activeRunMode === 'weekly-streak';
  const isCompetitiveCampaignRun = activeRunMode === 'campaign' || activeRunMode === 'campaign-replay';
  const isCampaignRun = isCompetitiveCampaignRun || isCampaignLabRun || isWeeklyCampaignRun;
  const isFounderSandboxRun = isOwnerWallet || isOwnerTestRun;
  const isNonCompetitiveRun = isFounderSandboxRun || isBossArchiveRun || isCampaignLabRun || isCampaignBranchRun;
  /**
   * Whether this run may update Weekly Run stats or post to its leaderboard.
   *
   * Weekly Run is a separate competition. Campaign Missions still award
   * unlocks, mastery, lifetime stats, and Hangar credits, but neither Campaign
   * nor a legacy standard run may populate the Weekly Run best score.
   *
   * Deliberately separate from isNonCompetitiveRun, which also gates run
   * payout and lifetime recording that Campaign still needs.
   */
  const isWeeklyLeaderboardRun = isWeeklyCampaignRun && !isNonCompetitiveRun;
  const activeBossReplay = useMemo(() => (
    activeBossEncounterId ? getBossArchiveEntry(activeBossEncounterId) : null
  ), [activeBossEncounterId]);
  const activeBossReplayCampaign = useMemo(() => (
    activeBossEncounterId
      ? buildBossReplayCampaign(
          activeBossEncounterId,
          activeBossArchiveRun?.difficultyId ?? 'easy'
        ) ?? undefined
      : undefined
  ), [activeBossArchiveRun?.difficultyId, activeBossEncounterId]);
  const activeCampaignBranch = useMemo(() => (
    activeCampaignBranchId
      ? getCampaignBranchDefinition(DEFAULT_GAME_CAMPAIGN, activeCampaignBranchId)
      : null
  ), [activeCampaignBranchId]);
  const activeCampaignBranchCampaign = useMemo(() => (
    activeCampaignBranch
      ? buildCampaignBranchRuntimeCampaign(DEFAULT_GAME_CAMPAIGN, activeCampaignBranch, {
          spawnSeed: isOwnerWallet ? campaignBranchSpawnSeed : 0,
          valueMultiplier: isOwnerWallet ? campaignBranchValueMultiplier : 1
        })
      : undefined
  ), [activeCampaignBranch, campaignBranchSpawnSeed, campaignBranchValueMultiplier, isOwnerWallet]);
  const campaignMapBranchProgress = useMemo<Record<string, CampaignMapBranchProgress>>(() => (
    Object.fromEntries(CAMPAIGN_BRANCH_DEFINITIONS.map((branch) => {
      const progress = permanentSquadState.campaignProgress.branchProgress;
      const founderLocked = progress.founderLockedBranchIds.includes(branch.branchId);
      const claimed = !founderLocked && progress.claimedBranchIds.includes(branch.branchId);
      const completed = !founderLocked && progress.completedBranchIds.includes(branch.branchId);
      const unlocked = !founderLocked && progress.unlockedBranchIds.includes(branch.branchId);
      const isNew = !founderLocked && progress.newBranchIds.includes(branch.branchId);
      const lastReceipt = [...progress.attemptReceipts]
        .reverse()
        .find((receipt) => receipt.branchId === branch.branchId && receipt.outcome === 'success');
      const baseCacheReward = branch.completionReward.baseCoins;
      const oneTimeCompletionBonus = branch.completionReward.oneTimeBonusCoins;
      const branchKind = isPresentDropBranchDefinition(branch) ? 'present-drop' : 'combat';
      const objectiveLabel = branch.missionType === 'support-trial'
        ? 'Trial encounters'
        : branch.missionType === 'formation-challenge'
          ? 'Formation encounters'
          : 'Elite encounters';
      return [branch.branchId, {
        discoveryState: claimed
          ? 'claimed'
          : completed
            ? 'completed'
            : isNew
              ? 'new'
              : unlocked
                ? 'unlocked'
                : 'locked',
        unlocked,
        completed,
        claimed,
        isNew,
        lastResult: lastReceipt ? {
          kind: branchKind,
          objectiveLabel,
          objectiveUnitsCompleted: lastReceipt.presentsDestroyed,
          presentsDestroyed: lastReceipt.presentsDestroyed,
          standard: lastReceipt.destroyedByType.standard,
          armored: lastReceipt.destroyedByType.armored,
          fast: lastReceipt.destroyedByType.fast,
          golden: lastReceipt.destroyedByType.golden,
          collectedPresentCoins: Math.max(
            0,
            lastReceipt.coinsAwarded - baseCacheReward - oneTimeCompletionBonus
          ),
          baseReward: baseCacheReward,
          oneTimeCompletionBonus,
          totalCoins: lastReceipt.coinsAwarded,
          completedAt: lastReceipt.completedAt
        } : undefined
      } satisfies CampaignMapBranchProgress];
    }))
  ), [permanentSquadState.campaignProgress.branchProgress]);
  const campaignCheckpoint = useMemo(() => (
    getCampaignCheckpointLabel(permanentSquadState.campaignProgress)
  ), [permanentSquadState.campaignProgress]);
  const campaignNotificationCount = useMemo(() => (
    getCampaignNotificationCount(permanentSquadState.campaignProgress)
  ), [permanentSquadState.campaignProgress]);
  const previewPilotName = missionRecordPilotName || playerNameInput || 'PILOT';
  const missionRecordWeeklyFunding = useMemo(() => runReceipt ? getMissionRecordWeeklyFunding({
    receipt: runReceipt,
    pilotName: previewPilotName,
    weeklyLeaderboard: monthlyLeaderboard,
    archivedWinners
  }) : null, [archivedWinners, monthlyLeaderboard, previewPilotName, runReceipt]);
  const weeklyLeaderProposalId = monthlyLeaderboard[0]?.proposalId?.trim() || null;
  weeklyLeaderProposalIdRef.current = weeklyLeaderProposalId;
  const weeklyProposalLifecycle = useMemo(() => getWeeklyProposalLifecycle({
    selectedProposalId: weeklyLeaderProposalId,
    referencedProposals: proposalReferences
  }), [proposalReferences, weeklyLeaderProposalId]);
  const weeklyProposalRecovery = useMemo(() => getWeeklyProposalRecovery({
    weeklyLeaderboard: monthlyLeaderboard,
    walletRuns,
    walletAddress: activeWalletAddress,
    proposalLifecycle: weeklyProposalLifecycle
  }), [activeWalletAddress, monthlyLeaderboard, walletRuns, weeklyProposalLifecycle]);
  const shipUnlocks = useMemo(() => {
    const unlocks = getPlayerShipUnlocks(activeWalletAddress, walletRecords, { unlockAll: isOwnerWallet });
    return {
      ...unlocks,
      eth: unlocks.eth || permanentSquadState.unlockedPlayerShips.includes('eth'),
      btc: unlocks.btc || permanentSquadState.unlockedPlayerShips.includes('btc')
    };
  }, [activeWalletAddress, isOwnerWallet, permanentSquadState.unlockedPlayerShips, walletRecords]);
  const usableShipId = getUsablePlayerShip(selectedShipId, shipUnlocks);
  const activeMissionPlayerShipUrl = PLAYER_SHIPS[activeMissionShipId].assetUrl;

  const updateWeeklySquadState = useCallback((
    update: (current: WeeklySquadState) => WeeklySquadState,
    persist = true
  ) => {
    setWeeklySquadState((current) => {
      const next = update(current);
      if (next !== current) weeklySquadStateRef.current = next;
      if (persist && next !== current) saveWeeklySquadState(next);
      return next;
    });
  }, []);

  const updatePermanentSquadState = useCallback((
    update: (current: PermanentSquadState) => PermanentSquadState
  ) => {
    setPermanentSquadState((current) => {
      const next = update(current);
      if (next !== current) {
        permanentSquadStateRef.current = next;
        savePermanentSquadState(next);
      }
      return next;
    });
  }, []);

  const handleBossArchiveViewed = useCallback((eventId: string) => {
    updatePermanentSquadState((current) => markBossArchiveViewed(current, eventId));
  }, [updatePermanentSquadState]);
  const handleBossArchiveSelection = useCallback((eventId: string) => {
    updatePermanentSquadState((current) => {
      const nextArchive = selectBossArchiveEntry(current.bossArchive, eventId);
      return nextArchive === current.bossArchive
        ? current
        : { ...current, bossArchive: nextArchive, updatedAt: new Date().toISOString() };
    });
  }, [updatePermanentSquadState]);
  const bossArchiveDeveloperApi = useMemo(
    () => isOwnerWallet
      ? createBossArchiveDeveloperControls(() => founderAuthorizationRef.current)
      : null,
    [isOwnerWallet]
  );
  const runBossArchiveFounderAction = useCallback((action: () => void) => {
    if (!founderAuthorizationRef.current) return false;
    action();
    return true;
  }, []);

  const persistWeeklyCampaignStreak = useCallback((streak: WeeklyCampaignStreakState | null) => {
    const next = {
      ...weeklySquadStateRef.current,
      weeklyCampaignStreak: streak,
      updatedAt: new Date().toISOString()
    };
    weeklySquadStateRef.current = next;
    saveWeeklySquadState(next);
    setWeeklySquadState(next);
  }, []);

  const presentWeeklyCampaignFinalScore = useCallback((streak: WeeklyCampaignStreakState) => {
    const enemiesDefeated = streak.scoreEvents.reduce((total, event) => (
      total
      + event.outcome.regularEnemyKills
      + event.outcome.eliteKills
      + event.outcome.miniBossKills
      + event.outcome.majorBossKills
    ), 0);
    const lastOutcome = streak.scoreEvents.at(-1)?.outcome;
    setStats((current) => ({
      ...current,
      score: streak.score.totalPoints,
      wave: Math.max(1, streak.score.completedNodeCount),
      coins: 0,
      enemiesDefeated,
      lives: lastOutcome?.livesRemaining ?? current.lives
    }));
  }, []);
  const updateBossArchiveProgress = useCallback((
    update: (current: PermanentSquadState['bossArchive']) => PermanentSquadState['bossArchive']
  ) => {
    updatePermanentSquadState((current) => {
      const bossArchive = update(current.bossArchive);
      return bossArchive === current.bossArchive
        ? current
        : { ...current, bossArchive, updatedAt: new Date().toISOString() };
    });
  }, [updatePermanentSquadState]);
  const beginRunSession = useCallback((testRun: boolean, runMode: ActiveRunMode) => {
    if (runSessionPromiseRef.current) return;

    const weeklyStreak = runMode === 'weekly-streak'
      ? weeklySquadStateRef.current.weeklyCampaignStreak
      : null;
    weeklyRunSessionKeyRef.current = weeklyStreak
      ? `${weeklyStreak.weeklyId}:${weeklyStreak.startNodeId}:${weeklyStreak.createdAtMs}`
      : null;
    runStartedAtRef.current = Date.now();
    setRunReceiptStatus('starting');
    runSessionPromiseRef.current = startRunSession({
      testRun,
      playerShipId: activeRunShipIdRef.current,
      runMode: runMode === 'weekly-streak' ? 'weekly-streak' : 'standard',
      profileId: weeklySquadStateRef.current.profileId,
      weeklyCampaignProof: weeklyStreak
    }).then((session) => {
      setRunReceiptStatus(session.localOnly ? 'local' : 'idle');
      return session;
    });
  }, []);
  const offerFirstFlightGuideBeforeRun = useCallback((testRun: boolean, runMode: ActiveRunMode) => {
    onboardingRunSessionPendingRef.current = { testRun, runMode };
    // Freeze synchronously. SciconOnboarding opens the invitation on its next
    // render, but no flight frame or mission timer should advance first.
    setOnboardingGameplayFreeze(true);
    setOnboardingInvitationNonce((current) => current + 1);
  }, []);
  const handleOnboardingGameplayFreezeChange = useCallback((frozen: boolean) => {
    setOnboardingGameplayFreeze(frozen || Boolean(onboardingRunSessionPendingRef.current));
  }, []);
  const handleOnboardingInvitationDecision = useCallback((_accepted: boolean) => {
    const pendingRun = onboardingRunSessionPendingRef.current;
    onboardingRunSessionPendingRef.current = null;
    setOnboardingGameplayFreeze(false);
    if (!pendingRun || gameStateRef.current !== GameState.PLAYING) return;
    beginRunSession(pendingRun.testRun, pendingRun.runMode);
  }, [beginRunSession]);
  const continueRscCost = (continuesUsed + 1) * 5;
  const isContinuePaymentBusy = continuePaymentStatus === 'switching_network'
    || continuePaymentStatus === 'processing'
    || continuePaymentStatus === 'confirming';

  useEffect(() => {
    let active = true;
    let cancelDeferredFetch: (() => void) | null = null;
    let leaderboardRefreshId: number | null = null;
    let weeklyPublishRefreshId: number | null = null;
    let dashboardFetchInFlight = false;

    const fetchDashboardData = async (background = false) => {
      if (!active || dashboardFetchInFlight) return;
      dashboardFetchInFlight = true;
      const alreadyHasData = leaderboard.length > 0;
      if (!background && !alreadyHasData) {
        setLoadingLeaderboard(true);
      }

      try {
        const [data, archive] = await Promise.all([
          getLeaderboardData(),
          getArchivedWeeklyWinners()
        ]);
        if (!active) return;
        // Do not expose half of a rollover. The weekly board and Past Picks
        // advance in the same React commit only after both sources respond.
        if (archive === null) return;

        const publication = resolveWeeklyDashboardPublication(archive.completedWeekKeys);
        const presentedWeeklyScores = await getLeaderboardWeekScores(publication.visibleWeekKey);
        if (!active || presentedWeeklyScores === null) return;

        if (data.scores.length > 0) {
          setLeaderboard(data.scores);
        }
        setMonthlyLeaderboard(presentedWeeklyScores);
        setArchivedWinners(archive.winners);
        setWeeklyPresentationTime(publication.presentationTime);
      } catch (error) {
        console.error("Failed to refresh weekly dashboard", error);
      } finally {
        dashboardFetchInFlight = false;
        if (active && !background && !alreadyHasData) {
          setLoadingLeaderboard(false);
        }
      }
    };

    const refreshDashboardInBackground = () => {
      if (!document.hidden) void fetchDashboardData(true);
    };
    const refreshWeeklyPublication = () => {
      if (!active || document.hidden) return;
      if (dashboardFetchInFlight) {
        // The cutoff timer must not be lost behind a slower request that began
        // just before publication. Retry until the atomic board/archive fetch
        // can own the slot instead of waiting for the 60-second poll.
        weeklyPublishRefreshId = window.setTimeout(refreshWeeklyPublication, 500);
        return;
      }
      void fetchDashboardData(true);
    };
    const handleDashboardVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDashboardInBackground();
    };

    if (gameState === GameState.GAMEOVER) {
      void fetchDashboardData();
    } else if (gameState === GameState.MENU) {
      cancelDeferredFetch = runAfterFirstPaint(() => { void fetchDashboardData(); }, {
        delayMs: leaderboard.length > 0 ? 900 : 450,
        timeoutMs: 2200
      });
      leaderboardRefreshId = window.setInterval(
        refreshDashboardInBackground,
        BACKGROUND_LEADERBOARD_REFRESH_MS
      );
      window.addEventListener('focus', refreshDashboardInBackground);
      document.addEventListener('visibilitychange', handleDashboardVisibilityChange);

      const presentation = getWeeklyPresentationMeta();
      const publishDelay = Math.max(250, presentation.publishesAt.getTime() - Date.now() + 250);
      weeklyPublishRefreshId = window.setTimeout(refreshWeeklyPublication, publishDelay);
    }

    return () => {
      active = false;
      cancelDeferredFetch?.();
      if (leaderboardRefreshId !== null) {
        window.clearInterval(leaderboardRefreshId);
      }
      if (weeklyPublishRefreshId !== null) {
        window.clearTimeout(weeklyPublishRefreshId);
      }
      window.removeEventListener('focus', refreshDashboardInBackground);
      document.removeEventListener('visibilitychange', handleDashboardVisibilityChange);
    };
  }, [gameState, leaderboard.length]);

  const refreshFundingProposals = useCallback(async (background = false) => {
    const refreshNonce = proposalRefreshNonceRef.current + 1;
    const requestedProposalId = weeklyLeaderProposalId;
    proposalRefreshNonceRef.current = refreshNonce;
    const isCurrentRefresh = () => (
      proposalRefreshNonceRef.current === refreshNonce
      && weeklyLeaderProposalIdRef.current === requestedProposalId
    );

    if (!background) setProposalStatus('loading');
    try {
      const feed = await getResearchHubProposalFeed({
        includeProposalIds: requestedProposalId ? [requestedProposalId] : []
      });
      if (!isCurrentRefresh()) return;
      setFundingProposals(feed.eligibleProposals);
      setProposalReferences(feed.referencedProposals);
      setProposalStatus(feed.eligibleProposals.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      if (!isCurrentRefresh()) return;
      console.error('ResearchHub proposal feed failed:', error);

      // A referenced completed proposal uses ResearchHub's CLOSED feed, which
      // may fail independently of the normal OPEN feed. Keep proposal browsing
      // available without guessing the selected proposal's status.
      if (requestedProposalId) {
        try {
          const openFeed = await getResearchHubProposalFeed();
          if (!isCurrentRefresh()) return;
          setFundingProposals(openFeed.eligibleProposals);
          setProposalReferences([]);
          setProposalStatus(openFeed.eligibleProposals.length > 0 ? 'ready' : 'empty');
          return;
        } catch (openFeedError) {
          if (!isCurrentRefresh()) return;
          console.error('ResearchHub open proposal fallback failed:', openFeedError);
        }
      }

      if (!background && isCurrentRefresh()) {
        setFundingProposals([]);
        setProposalReferences([]);
        setProposalStatus('error');
      }
    }
  }, [weeklyLeaderProposalId]);

  useEffect(() => {
    const cancelDeferredFetch = runAfterFirstPaint(() => {
      void refreshFundingProposals();
    }, {
      // Prefer the exact leader proposal when scores respond promptly, but do
      // not let a stalled leaderboard strand proposals or gameplay preloading.
      delayMs: loadingLeaderboard ? 2_000 : 150,
      timeoutMs: 3200
    });

    return cancelDeferredFetch;
  }, [loadingLeaderboard, refreshFundingProposals]);

  useEffect(() => {
    if (gameState !== GameState.MENU) return undefined;

    const refreshId = window.setInterval(() => {
      void refreshFundingProposals(true);
    }, PROPOSAL_REFRESH_MS);

    return () => window.clearInterval(refreshId);
  }, [gameState, refreshFundingProposals]);

  const getInitialStats = (): Stats => {
    const parsed = readPilotStats(activeProfileId);

    return {
      score: 0,
      highScore: parsed.highScore || 0,
      wave: 1,
      coins: 0,
      totalCoins: parsed.totalCoins || 0,
      enemiesDefeated: 0,
      bombs: 2,
      bombCharge: 0,
      bombChargeMax: BASE_FLASK_CHARGE_MAX,
      shipAbilityCooldown: 0,
      shipAbilityCooldownMax: 16 * 60,
      lives: 3,
      repairsCount: 0,
      upgrades: { ...defaultMissionUpgrades },
      powerupUses: { ...defaultPowerupUses },
      bossProgress: 0,
      isBossActive: false,
      bossHp: 0,
      bossMaxHp: 100
    };
  };

  const [stats, setStats] = useState<Stats>(getInitialStats);
  const [pauseMissionPosition, setPauseMissionPosition] = useState<PauseMissionPosition | null>(null);
  const [polishSettings, setPolishSettings] = useState<GamePolishSettings>(getInitialPolishSettings);
  const [matchMusicTrackId, setMatchMusicTrackId] = useState<MatchMusicTrackId>(() => (
    audioService.getMatchMusicTrackId()
  ));
  const campaignMusicMissionId = isCampaignBranchRun
    ? activeCampaignBranch?.missionDefinition.id ?? null
    : isCompetitiveCampaignRun
      ? activeCampaignLaunch?.missionId ?? null
      : null;
  const campaignMusicSectorOrder = campaignMusicMissionId
    ? DEFAULT_GAME_CAMPAIGN.sectors.find((sector) => (
        sector.id === getCampaignMissionById(campaignMusicMissionId)?.sectorId
      ))?.order ?? 1
    : null;
  const activeMatchMusicTrackId = campaignMusicSectorOrder === null
    ? matchMusicTrackId
    : getSectorMatchMusicTrackId(campaignMusicSectorOrder, matchMusicTrackId);
  /**
   * Background music follows what is on screen: the menu bed at rest, combat
   * during waves, and the boss bed the moment a boss is live. The swap itself
   * is a cue -- the player hears the boss before they see it.
   */
  useEffect(() => {
    if (gameState === GameState.PAUSED) {
      audioService.pauseMusic();
      return;
    }

    const targetMusic = gameState === GameState.PLAYING
      ? (stats.isBossActive ? 'boss' : activeMatchMusicTrackId)
      : gameState === GameState.GAMEOVER && !campaignCompletedRun
        ? 'defeat'
        : 'menu';
    if (audioService.getCurrentMusic() === targetMusic) {
      audioService.resumeMusic();
      return;
    }
    void audioService.playMusic(targetMusic);
  }, [activeMatchMusicTrackId, campaignCompletedRun, gameState, stats.isBossActive]);

  const [audioMuted, setAudioMuted] = useState(() => audioService.isMuted());
  const [sfxVolumeLevel, setSfxVolumeLevel] = useState(() => audioService.getSfxVolumeLevel());
  const [musicVolumeLevel, setMusicVolumeLevel] = useState(() => audioService.getMusicVolumeLevel());

  useEffect(() => installUiAudioFeedback(document), []);

  const handleRuntimeState = useCallback((runtime: GameRuntimeState) => {
    bossArchiveDamageTakenRef.current = runtime.damageTaken;
    updatePlayerReportContext({
      missionId: runtime.levelId,
      waveId: runtime.waveId,
      waveNumber: runtime.absoluteWaveNumber,
      waveTotal: runtime.waveTotal,
      bossActive: runtime.bossActive
    });
    const diagnosticWaveKey = `${runtime.levelId}:${runtime.waveId}:${runtime.absoluteWaveNumber}`;
    if (diagnosticWaveRef.current !== diagnosticWaveKey) {
      diagnosticWaveRef.current = diagnosticWaveKey;
      recordPlayerReportBreadcrumb('wave_started', {
        level_id: runtime.levelId,
        wave_id: runtime.waveId,
        wave_number: runtime.absoluteWaveNumber,
        continuous_run: runtime.continuousRun
      });
    }
    const nextPosition: PauseMissionPosition = {
      levelId: runtime.levelId,
      levelNumber: runtime.levelNumber,
      levelName: runtime.levelName,
      waveId: runtime.waveId,
      waveNumber: runtime.waveNumber,
      waveTotal: runtime.waveTotal,
      absoluteWaveNumber: runtime.absoluteWaveNumber,
      continuousRun: runtime.continuousRun
    };
    setPauseMissionPosition((current) => (
      current
      && current.levelId === nextPosition.levelId
      && current.levelNumber === nextPosition.levelNumber
      && current.levelName === nextPosition.levelName
      && current.waveId === nextPosition.waveId
      && current.waveNumber === nextPosition.waveNumber
      && current.waveTotal === nextPosition.waveTotal
      && current.absoluteWaveNumber === nextPosition.absoluteWaveNumber
      && current.continuousRun === nextPosition.continuousRun
        ? current
        : nextPosition
    ));
  }, []);

  useEffect(() => {
    savePilotStats(activeProfileId, {
      highScore: stats.highScore,
      totalCoins: stats.totalCoins,
      playerName: playerNameInput
    });
  }, [activeProfileId, playerNameInput, stats.highScore, stats.totalCoins]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.POLISH_SETTINGS, JSON.stringify(polishSettings));
  }, [polishSettings]);

  useEffect(() => {
    localStorage.setItem(
      getSelectedShipStorageKey(activeProfileId),
      selectedShipId
    );
  }, [activeProfileId, selectedShipId]);

  const togglePolishSetting = (key: keyof GamePolishSettings) => {
    setPolishSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const hydrateActiveProfile = useCallback(({
    profileId,
    snapshot,
    founderSandbox = false
  }: {
    profileId: string;
    snapshot?: WalletProfileSnapshot;
    founderSandbox?: boolean;
  }) => {
    walletProfileHydratingRef.current = true;

    if (snapshot) {
      saveWeeklySquadState({
        ...snapshot.weeklyState,
        profileId
      });
      savePermanentSquadState({
        ...snapshot.permanentState,
        profileId,
        // Minted ownership is always derived from wallet records/onchain data.
        mintedMiniShips: []
      });
      savePilotStats(profileId, snapshot.stats);
      localStorage.setItem(
        getSelectedShipStorageKey(profileId),
        snapshot.selectedShipId
      );
    }

    const storedWeekly = loadWeeklySquadState(profileId);
    const nextWeekly = founderSandbox
      ? createFounderSquadSandboxState(storedWeekly)
      : storedWeekly;
    const nextPermanent = loadPermanentSquadState(profileId);
    const nextStats = readPilotStats(profileId);
    const nextShip = parsePlayerShipId(
      localStorage.getItem(getSelectedShipStorageKey(profileId))
    );

    setActiveProfileId(profileId);
    setWeeklySquadState(nextWeekly);
    setPermanentSquadState(nextPermanent);
    setPlayerNameInput(nextStats.playerName);
    setSelectedShipId(nextShip);
    setStats((current) => ({
      ...current,
      highScore: nextStats.highScore,
      totalCoins: nextStats.totalCoins
    }));
    window.queueMicrotask(() => {
      walletProfileHydratingRef.current = false;
    });
    return {
      stats: nextStats,
      weeklyState: nextWeekly,
      permanentState: {
        ...nextPermanent,
        mintedMiniShips: []
      },
      selectedShipId: nextShip
    } satisfies WalletProfileSnapshot;
  }, []);

  useEffect(() => {
    updatePlayerReportContext({
      gameState,
      gameId,
      runMode: activeRunMode,
      missionId: pauseMissionPosition?.levelId ?? activeCampaignLaunch?.missionId ?? 'menu',
      waveId: pauseMissionPosition?.waveId ?? activeCampaignLaunch?.waveId ?? '',
      waveNumber: pauseMissionPosition?.absoluteWaveNumber ?? stats.wave,
      waveTotal: pauseMissionPosition?.waveTotal ?? 0,
      score: stats.score,
      lives: stats.lives,
      selectedShipId: activeMissionShipId,
      loadingPhase: missionLoading?.phase ?? 'none',
      bossActive: stats.isBossActive
    });
  }, [
    activeCampaignLaunch?.missionId,
    activeCampaignLaunch?.waveId,
    activeMissionShipId,
    activeRunMode,
    gameId,
    gameState,
    missionLoading?.phase,
    pauseMissionPosition?.absoluteWaveNumber,
    pauseMissionPosition?.levelId,
    pauseMissionPosition?.levelName,
    pauseMissionPosition?.waveId,
    pauseMissionPosition?.waveTotal,
    stats.isBossActive,
    stats.lives,
    stats.score,
    stats.wave
  ]);

  useEffect(() => {
    recordPlayerReportBreadcrumb('app_state_changed', {
      game_state: gameState,
      game_id: gameId,
      run_mode: activeRunMode,
      loading_phase: missionLoading?.phase ?? 'none'
    });
  }, [activeRunMode, gameId, gameState, missionLoading?.phase]);

  const applyAuthoritativeHangarSpend = useCallback(async (
    action: WalletTokenSpendAction
  ) => {
    if (!activeWalletAddress || walletProfileStatus !== 'ready') {
      setWalletError(
        activeWalletAddress
          ? 'Reconnect this wallet profile before spending Tokens.'
          : 'Connect a wallet to use purchased Tokens in the Hangar.'
      );
      return false;
    }
    if (walletTokenSpendInFlightRef.current) return false;

    const normalizedAddress = activeWalletAddress.toLowerCase();
    const pendingSpend = walletTokenSpendPendingRef.current.get(normalizedAddress);
    if (
      pendingSpend
      && JSON.stringify(pendingSpend.action) !== JSON.stringify(action)
    ) {
      setWalletError('Finish retrying the previous Hangar purchase before starting another.');
      return false;
    }
    walletTokenSpendInFlightRef.current = true;
    setWalletError('');

    const spendTask = walletProfileSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
        if (walletProfileAddressRef.current !== normalizedAddress) {
          throw new Error('The connected wallet changed before the Hangar purchase completed.');
        }
        if (flushedProfile) {
          walletProfileRevisionRef.current = flushedProfile.revision;
          walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
          cacheWalletProfile(flushedProfile);
        }

        const pending = walletTokenSpendPendingRef.current.get(normalizedAddress) ?? {
          spendId: crypto.randomUUID(),
          expectedRevision: walletProfileRevisionRef.current,
          action
        };
        walletTokenSpendPendingRef.current.set(normalizedAddress, pending);
        const settlement = await applyWalletTokenSpend(pending);
        if (
          walletProfileAddressRef.current !== normalizedAddress
          || settlement.profile.walletAddress.toLowerCase() !== normalizedAddress
        ) {
          throw new Error('The Hangar purchase returned a different wallet profile.');
        }

        const rebasedDirty = rebaseWalletProfileDirtyAfterServerTokenSpend({
          address: normalizedAddress,
          savedProfile: settlement.profile
        });
        cacheWalletProfile(settlement.profile);
        walletProfileRevisionRef.current = settlement.profile.revision;
        walletProfileSyncedSnapshotRef.current = settlement.profile.snapshot;
        const hydratedSnapshot = hydrateActiveProfile({
          profileId: settlement.profile.profileId,
          snapshot: rebasedDirty?.snapshot ?? settlement.profile.snapshot,
          founderSandbox: false
        });
        walletProfileLocalBaselineRef.current = hydratedSnapshot;
        weeklySquadStateRef.current = hydratedSnapshot.weeklyState;
        permanentSquadStateRef.current = hydratedSnapshot.permanentState;

        if (rebasedDirty) {
          const rebasedProfile = await flushDirtyWalletProfile(normalizedAddress);
          if (
            rebasedProfile
            && walletProfileAddressRef.current === normalizedAddress
          ) {
            cacheWalletProfile(rebasedProfile);
            walletProfileRevisionRef.current = rebasedProfile.revision;
            walletProfileSyncedSnapshotRef.current = rebasedProfile.snapshot;
            const finalSnapshot = hydrateActiveProfile({
              profileId: rebasedProfile.profileId,
              snapshot: rebasedProfile.snapshot,
              founderSandbox: false
            });
            walletProfileLocalBaselineRef.current = finalSnapshot;
            weeklySquadStateRef.current = finalSnapshot.weeklyState;
            permanentSquadStateRef.current = finalSnapshot.permanentState;
          }
        }
        setWalletProfileStatus('ready');
        setWalletError('');
        walletTokenSpendPendingRef.current.delete(normalizedAddress);
        return true;
      });
    walletProfileSaveChainRef.current = spendTask.then(
      () => undefined,
      () => undefined
    );

    try {
      return await spendTask;
    } catch (error) {
      console.error('Wallet Token spend failed:', error);
      if (
        error instanceof WalletTokenSpendRequestError
        && error.status >= 400
        && error.status < 500
      ) {
        walletTokenSpendPendingRef.current.delete(normalizedAddress);
      }
      setWalletError(
        error instanceof Error
          ? error.message
          : 'The Hangar Token purchase could not be completed.'
      );
      return false;
    } finally {
      walletTokenSpendInFlightRef.current = false;
    }
  }, [activeWalletAddress, hydrateActiveProfile, walletProfileStatus]);

  const handleUnlockSquadSlot = useCallback((slot: SquadSlotId) => {
    if (isOwnerWallet) return;
    if (activeWalletAddress) {
      if (slot === 'left') {
        void applyAuthoritativeHangarSpend({ kind: 'unlock-left-slot' });
      }
      return;
    }
    updateWeeklySquadState((current) => unlockSquadSlot(current, slot));
  }, [activeWalletAddress, applyAuthoritativeHangarSpend, isOwnerWallet, updateWeeklySquadState]);

  const handlePurchaseMiniShip = useCallback((id: MiniShipId) => {
    if (isOwnerWallet) return;
    if (activeWalletAddress) {
      void applyAuthoritativeHangarSpend({ kind: 'purchase-mini-ship', miniShipId: id });
      return;
    }
    updateWeeklySquadState((current) => purchaseMiniShip(current, id));
  }, [activeWalletAddress, applyAuthoritativeHangarSpend, isOwnerWallet, updateWeeklySquadState]);

  const handleUpgradeMiniShip = useCallback((id: MiniShipId) => {
    if (isOwnerWallet) {
      updateWeeklySquadState((current) => adjustFounderMiniShipLevel(current, id, 1), false);
      return;
    }
    if (activeWalletAddress) {
      void applyAuthoritativeHangarSpend({ kind: 'upgrade-mini-ship', miniShipId: id });
      return;
    }
    updateWeeklySquadState((current) => upgradeMiniShip(current, id));
  }, [activeWalletAddress, applyAuthoritativeHangarSpend, isOwnerWallet, updateWeeklySquadState]);

  const handleDowngradeMiniShip = useCallback((id: MiniShipId) => {
    if (!isOwnerWallet) return;
    updateWeeklySquadState((current) => adjustFounderMiniShipLevel(current, id, -1), false);
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleEquipMiniShip = useCallback((slot: SquadSlotId, id: MiniShipId | null) => {
    updateWeeklySquadState((current) => equipMiniShip(current, slot, id), !isOwnerWallet);
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleUpgradeMainShip = useCallback((id: MainShipUpgradeId) => {
    if (isOwnerWallet) {
      // Founder adjustments are a debug affordance, not a purchase, so they do
      // not feed the Hangar Engineer achievement.
      updateWeeklySquadState((current) => adjustFounderMainShipUpgrade(current, usableShipId, id, 1), false);
      return;
    }
    if (activeWalletAddress) {
      void applyAuthoritativeHangarSpend({
        kind: 'upgrade-main-ship',
        shipId: usableShipId,
        upgradeId: id
      });
      return;
    }
    updateWeeklySquadState((current) => {
      const next = upgradeMainShip(current, usableShipId, id);
      // upgradeMainShip returns the same state when the purchase is refused for
      // cost or max level, so only a real change counts.
      if (next !== current) {
        updatePermanentSquadState((permanent) => ({
          ...permanent,
          lifetimeStats: {
            ...permanent.lifetimeStats,
            hangarUpgradesPurchased: permanent.lifetimeStats.hangarUpgradesPurchased + 1
          },
          updatedAt: new Date().toISOString()
        }));
      }
      return next;
    });
  }, [
    activeWalletAddress,
    applyAuthoritativeHangarSpend,
    isOwnerWallet,
    updatePermanentSquadState,
    updateWeeklySquadState,
    usableShipId
  ]);

  const handleDowngradeMainShip = useCallback((id: MainShipUpgradeId) => {
    if (!isOwnerWallet) return;
    updateWeeklySquadState((current) => adjustFounderMainShipUpgrade(current, usableShipId, id, -1), false);
  }, [isOwnerWallet, updateWeeklySquadState, usableShipId]);

  const createWalletSeedSnapshot = useCallback((
    walletAddress: string,
    walletProfileId: string
  ): WalletProfileSnapshot => {
    const normalizedAddress = walletAddress.toLowerCase();

    // Only import saves that already belong to this exact verified wallet.
    migrateLegacySquadProfile(normalizedAddress, walletProfileId);
    if (pilotProfile.migratedFromWallet === normalizedAddress) {
      migrateLegacySquadProfile(pilotProfile.id, walletProfileId);
      const pilotStats = readPilotStats(pilotProfile.id);
      const walletStats = readPilotStats(walletProfileId);
      savePilotStats(walletProfileId, {
        highScore: Math.max(walletStats.highScore, pilotStats.highScore),
        totalCoins: Math.max(walletStats.totalCoins, pilotStats.totalCoins),
        playerName: walletStats.playerName || pilotStats.playerName
      });
    } else {
      const legacyStats = readPilotStats(normalizedAddress);
      const walletStats = readPilotStats(walletProfileId);
      savePilotStats(walletProfileId, {
        highScore: Math.max(walletStats.highScore, legacyStats.highScore),
        totalCoins: Math.max(walletStats.totalCoins, legacyStats.totalCoins),
        playerName: walletStats.playerName || legacyStats.playerName
      });
    }

    const selectedShip = pilotProfile.migratedFromWallet === normalizedAddress
      ? parsePlayerShipId(localStorage.getItem(STORAGE_KEYS.SELECTED_SHIP))
      : parsePlayerShipId(
        localStorage.getItem(getSelectedShipStorageKey(walletProfileId))
      );
    localStorage.setItem(
      getSelectedShipStorageKey(walletProfileId),
      selectedShip
    );

    return {
      stats: readPilotStats(walletProfileId),
      weeklyState: loadWeeklySquadState(walletProfileId),
      permanentState: {
        ...loadPermanentSquadState(walletProfileId),
        mintedMiniShips: []
      },
      selectedShipId: selectedShip
    };
  }, [pilotProfile.id, pilotProfile.migratedFromWallet]);

  useEffect(() => {
    const transitionNonce = profileTransitionNonceRef.current + 1;
    profileTransitionNonceRef.current = transitionNonce;
    let cancelled = false;
    const isCurrent = () => (
      !cancelled
      && profileTransitionNonceRef.current === transitionNonce
    );
    const normalizedAddress = activeWalletAddress?.toLowerCase() ?? null;
    const interactiveAuthorization = walletProfileInteractiveAuthorizationRef.current;
    walletProfileInteractiveAuthorizationRef.current = false;

    walletProfileAddressRef.current = normalizedAddress;
    walletProfileRevisionRef.current = 0;
    walletProfileSyncedSnapshotRef.current = null;
    walletProfileLocalBaselineRef.current = null;

    if (!normalizedAddress) {
      setWalletProfileStatus('guest');
      walletProfileLocalBaselineRef.current = hydrateActiveProfile({
        profileId: pilotProfile.id
      });
    } else {
      const walletProfileId = getWalletProfileId(normalizedAddress);
      setWalletProfileStatus('authenticating');
      setWalletError('');
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, normalizedAddress);
      const dirty = readWalletProfileDirty(normalizedAddress);
      const cached = readCachedWalletProfile(normalizedAddress);
      walletProfileRevisionRef.current = dirty?.expectedRevision
        ?? cached?.revision
        ?? 0;
      walletProfileSyncedSnapshotRef.current = dirty?.baseSnapshot
        ?? cached?.snapshot
        ?? null;
      walletProfileLocalBaselineRef.current = hydrateActiveProfile({
        profileId: walletProfileId,
        snapshot: dirty?.snapshot ?? cached?.snapshot,
        founderSandbox: isOwnerWallet
      });
    }
    preloadMiniShipTextures();

    walletProfileSessionChainRef.current = walletProfileSessionChainRef.current
      .catch(() => undefined)
      .then(async () => {
        const sessionWalletAddress = walletProfileSessionAddressRef.current;
        if (
          sessionWalletAddress
          && sessionWalletAddress !== normalizedAddress
        ) {
          try {
            await flushDirtyWalletProfile(sessionWalletAddress);
          } catch (error) {
            // The address-scoped dirty record remains queued for its next login.
            console.warn('Previous wallet profile flush remains queued', error);
          }
        }
        if (!isCurrent()) return;

        if (!normalizedAddress) {
          // Disconnecting the wallet detaches the active profile without
          // revoking this device's time-limited, HttpOnly profile session.
          // Reconnecting the same wallet can therefore resume without another
          // gas-free signature until the server session expires.
          return;
        }

        const walletProfileId = getWalletProfileId(normalizedAddress);
        const authenticatedSession = await loadAuthenticatedWalletProfile(
          activeWalletAddress as Address,
          { interactive: interactiveAuthorization }
        );
        let profile = authenticatedSession.profile;
        walletProfileSessionAddressRef.current =
          authenticatedSession.walletAddress;
        if (!isCurrent()) return;

        const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
        if (!isCurrent()) return;
        if (flushedProfile) profile = flushedProfile;
        if (!profile) {
          const seed = createWalletSeedSnapshot(
            normalizedAddress,
            walletProfileId
          );
          profile = await saveAuthenticatedWalletProfile({
            walletAddress: normalizedAddress,
            expectedRevision: 0,
            snapshot: seed
          });
        }
        if (!isCurrent()) return;
        cacheWalletProfile(profile);
        walletProfileRevisionRef.current = profile.revision;
        walletProfileSyncedSnapshotRef.current = profile.snapshot;
        walletProfileLocalBaselineRef.current = hydrateActiveProfile({
          profileId: walletProfileId,
          snapshot: profile.snapshot,
          founderSandbox: isOwnerWallet
        });
        setWalletProfileStatus('ready');
      })
      .catch((error) => {
        if (!isCurrent()) return;
        if (
          !interactiveAuthorization
          && error instanceof WalletProfileRequestError
          && error.status === 401
        ) {
          // A remembered wallet may have an expired HttpOnly profile session.
          // Keep its device cache available without opening Base Account during
          // app startup; the next explicit wallet action may reauthorize it.
          walletProfileSessionAddressRef.current = null;
          setWalletProfileStatus('guest');
          setWalletError('');
          return;
        }
        if (
          error instanceof WalletProfileRequestError
          && error.code === 'profile_sync_busy'
        ) {
          const policy = getWalletProfileSyncFailurePolicy(error, 0);
          console.warn('Wallet profile sync remains queued', error);
          const queued = readWalletProfileDirty(normalizedAddress);
          if (queued) {
            walletProfileRevisionRef.current = queued.expectedRevision;
            walletProfileSyncedSnapshotRef.current = queued.baseSnapshot;
            walletProfileLocalBaselineRef.current = hydrateActiveProfile({
              profileId: getWalletProfileId(normalizedAddress),
              snapshot: queued.snapshot,
              founderSandbox: isOwnerWallet
            });
          }
          walletProfileSyncRetryCountRef.current = 1;
          walletProfileSyncNotBeforeRef.current = policy.retryDelayMs === null
            ? Number.POSITIVE_INFINITY
            : Date.now() + policy.retryDelayMs;
          // hydrateActiveProfile releases its autosave guard in the preceding
          // microtask. Publish `ready` afterward so the retry effect observes
          // the conflict-merged queued snapshot instead of stale React state.
          window.queueMicrotask(() => {
            if (!isCurrent()) return;
            setWalletProfileStatus(policy.status);
            setWalletError(policy.message);
          });
          return;
        }
        console.error('Wallet profile authentication failed', error);
        setWalletProfileStatus('error');
        setWalletError(
          /rejected|denied|cancelled|canceled/i.test(error?.message || '')
            ? 'Profile authorization was cancelled. This wallet is using its device-only save until you reconnect.'
            : error?.message || 'This wallet profile could not sync. Its device-only save remains separate.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeWalletAddress,
    createWalletSeedSnapshot,
    hydrateActiveProfile,
    isOwnerWallet,
    pilotProfile.id,
    walletProfileAuthorizationNonce
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWalletAddress || walletProfileStatus !== 'ready' || isOwnerWallet) {
      applyWeeklyRunAttemptQuota(null, null);
      return () => {
        cancelled = true;
      };
    }

    const quotaOwner = activeWalletAddress.toLowerCase();
    if (weeklyRunAttemptQuotaOwnerRef.current !== quotaOwner) {
      applyWeeklyRunAttemptQuota(null, quotaOwner);
    }

    void loadWeeklyRunAttemptQuota(activeWalletAddress as Address, { interactive: false })
      .then((quota) => {
        if (!cancelled) applyWeeklyRunAttemptQuota(quota, quotaOwner);
      })
      .catch((error) => {
        // A quota read is only a presentation aid. The run-start endpoint
        // remains authoritative and will still reject an unavailable entry.
        console.warn('Weekly Run quota could not be refreshed', error);
        // Preserve a previously verified value for this wallet/week. If there
        // is none, the Home action remains available and run-start verifies it
        // atomically instead of mistaking the free-only local counter for the
        // wallet's complete paid allowance.
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeWalletAddress,
    applyWeeklyRunAttemptQuota,
    isOwnerWallet,
    walletProfileStatus,
    weeklySquadState.weekKey
  ]);

  useEffect(() => {
    let cancelled = false;
    if (!activeWalletAddress) {
      setWalletRecords([]);
      setWalletRuns([]);
      setWalletRunsLoading(false);
      return undefined;
    }

    trackEvent('wallet_connected');

    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, activeWalletAddress);

    setWalletRunsLoading(true);
    void Promise.all([
      getWalletRecords(activeWalletAddress),
      getWalletRuns(activeWalletAddress)
    ]).then(([records, runs]) => {
      if (cancelled) return;
      setWalletRecords(records);
      setWalletRuns(runs);
    }).finally(() => {
      if (!cancelled) setWalletRunsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeWalletAddress]);

  useEffect(() => {
    let retryTimer: number | null = null;
    if (
      !activeWalletAddress
      || walletProfileHydratingRef.current
      || isOwnerWallet
    ) return undefined;

    const normalizedAddress = activeWalletAddress.toLowerCase();
    const expectedProfileId = getWalletProfileId(normalizedAddress);
    if (
      activeProfileId !== expectedProfileId
      || weeklySquadState.profileId !== expectedProfileId
      || permanentSquadState.profileId !== expectedProfileId
    ) return undefined;

    const snapshot: WalletProfileSnapshot = {
      stats: {
        highScore: stats.highScore,
        totalCoins: stats.totalCoins,
        playerName: playerNameInput
      },
      weeklyState: weeklySquadState,
      permanentState: {
        ...permanentSquadState,
        mintedMiniShips: []
      },
      selectedShipId
    };
    const currentDirty = readWalletProfileDirty(normalizedAddress);
    const comparisonSnapshot = currentDirty?.snapshot
      ?? walletProfileSyncedSnapshotRef.current
      ?? walletProfileLocalBaselineRef.current;
    const snapshotChanged = !comparisonSnapshot
      || !walletProfileSnapshotsEqual(snapshot, comparisonSnapshot);
    if (!snapshotChanged && !currentDirty) return undefined;

    if (snapshotChanged) {
      markWalletProfileDirty({
        address: normalizedAddress,
        expectedRevision: walletProfileRevisionRef.current,
        baseSnapshot: walletProfileSyncedSnapshotRef.current,
        snapshot
      });
      walletProfileSyncRetryCountRef.current = 0;
      walletProfileSyncNotBeforeRef.current = 0;
    }
    if (walletProfileStatus !== 'ready') return undefined;

    const retryDelayRemaining = walletProfileSyncNotBeforeRef.current - Date.now();
    if (retryDelayRemaining > 0) {
      if (Number.isFinite(retryDelayRemaining)) {
        retryTimer = window.setTimeout(() => {
          if (walletProfileAddressRef.current !== normalizedAddress) return;
          setWalletProfileRetryNonce((current) => current + 1);
        }, retryDelayRemaining);
      }
      return () => {
        if (retryTimer !== null) window.clearTimeout(retryTimer);
      };
    }

    const saveTimer = window.setTimeout(() => {
      walletProfileSaveChainRef.current = walletProfileSaveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          if (walletProfileAddressRef.current !== normalizedAddress) return;
          try {
            const saved = await flushDirtyWalletProfile(normalizedAddress);
            if (!saved) {
              if (!readWalletProfileDirty(normalizedAddress)) {
                walletProfileSyncRetryCountRef.current = 0;
                walletProfileSyncNotBeforeRef.current = 0;
                setWalletError((current) => (
                  current === WALLET_PROFILE_SYNC_BUSY_MESSAGE ? '' : current
                ));
              }
              return;
            }
            if (walletProfileAddressRef.current !== normalizedAddress) return;
            walletProfileRevisionRef.current = saved.revision;
            walletProfileSyncedSnapshotRef.current = saved.snapshot;
            cacheWalletProfile(saved);
            walletProfileSyncRetryCountRef.current = 0;
            walletProfileSyncNotBeforeRef.current = 0;
            setWalletError((current) => (
              current === WALLET_PROFILE_SYNC_BUSY_MESSAGE ? '' : current
            ));
          } catch (error) {
            if (walletProfileAddressRef.current !== normalizedAddress) return;
            const retryAttempt = walletProfileSyncRetryCountRef.current;
            const policy = getWalletProfileSyncFailurePolicy(error, retryAttempt);
            if (policy.status === 'ready') {
              console.warn('Wallet profile sync remains queued', error);
              const queued = readWalletProfileDirty(normalizedAddress);
              if (queued) {
                walletProfileRevisionRef.current = queued.expectedRevision;
                walletProfileSyncedSnapshotRef.current = queued.baseSnapshot;
                walletProfileLocalBaselineRef.current = hydrateActiveProfile({
                  profileId: expectedProfileId,
                  snapshot: queued.snapshot,
                  founderSandbox: false
                });
              }
              walletProfileSyncRetryCountRef.current = retryAttempt + 1;
              walletProfileSyncNotBeforeRef.current = policy.retryDelayMs === null
                ? Number.POSITIVE_INFINITY
                : Date.now() + policy.retryDelayMs;
              window.queueMicrotask(() => {
                if (walletProfileAddressRef.current !== normalizedAddress) return;
                setWalletProfileStatus(policy.status);
                setWalletError(policy.message);
              });
              return;
            } else {
              console.error('Wallet profile sync failed', error);
            }
            setWalletProfileStatus(policy.status);
            setWalletError(policy.message);
          }
        });
    }, 650);

    return () => {
      window.clearTimeout(saveTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [
    activeProfileId,
    activeWalletAddress,
    hydrateActiveProfile,
    isOwnerWallet,
    permanentSquadState,
    playerNameInput,
    selectedShipId,
    stats.highScore,
    stats.totalCoins,
    walletProfileRetryNonce,
    walletProfileStatus,
    weeklySquadState
  ]);

  useEffect(() => {
    const flushCurrentWallet = () => {
      const address = walletProfileAddressRef.current;
      if (!address) return;
      void flushDirtyWalletProfile(address, {
        keepalive: true,
        maxAttempts: 1
      })
        .then((saved) => {
          if (walletProfileAddressRef.current !== address) return;
          if (!saved) {
            if (!readWalletProfileDirty(address)) {
              walletProfileSyncRetryCountRef.current = 0;
              walletProfileSyncNotBeforeRef.current = 0;
              setWalletError((current) => (
                current === WALLET_PROFILE_SYNC_BUSY_MESSAGE ? '' : current
              ));
            }
            return;
          }
          walletProfileRevisionRef.current = saved.revision;
          walletProfileSyncedSnapshotRef.current = saved.snapshot;
          cacheWalletProfile(saved);
          walletProfileSyncRetryCountRef.current = 0;
          walletProfileSyncNotBeforeRef.current = 0;
          setWalletError((current) => (
            current === WALLET_PROFILE_SYNC_BUSY_MESSAGE ? '' : current
          ));
        })
        .catch(() => {
          // The address-scoped local record survives when the browser cannot
          // complete a keepalive request during page shutdown.
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushCurrentWallet();
    };

    window.addEventListener('pagehide', flushCurrentWallet);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushCurrentWallet);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeRunMode]);

  useEffect(() => {
    if (
      !isOwnerWallet
      || activeRunMode === 'owner-test'
      || activeRunMode === 'boss-archive'
      || activeRunMode === 'campaign'
      || activeRunMode === 'campaign-replay'
      || activeRunMode === 'weekly-streak'
      || activeRunMode === 'campaign-lab'
      || activeRunMode === 'campaign-branch'
    ) return;
    if (gameState !== GameState.PLAYING && gameState !== GameState.PAUSED) return;

    setActiveRunMode('owner-test');
    setStats(prev => ({
      ...prev,
      bombCharge: Math.max(prev.bombCharge || 0, OWNER_TEST_FLASK_CHARGE)
    }));
    setTestFlaskCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, charge: OWNER_TEST_FLASK_CHARGE }));
    setRunReceipt(null);
    setRunReceiptStatus('starting');
    finalizedRunGameIdRef.current = null;
    runReceiptPromiseRef.current = null;
    runSessionPromiseRef.current = null;
    weeklyRunSessionKeyRef.current = null;
    beginRunSession(true, 'owner-test');
  }, [activeRunMode, beginRunSession, gameState, isOwnerWallet]);

  const launchGame = async (
    bossEncounterId: string | null = null,
    bossMode: BossArchiveRunMode = 'challenge',
    bossVariantId = 'standard',
    campaignRequest: CampaignMapLaunchRequest | null = null,
    branchRequest: CampaignMapBranchLaunchRequest | null = null,
    campaignLabRequest: CampaignLabLaunchRequest | null = null,
    bossDifficultyId: BossArchiveDifficultyId = 'easy',
    reusableBossArchiveRun: BossArchiveRunContext | null = null
  ) => {
    if (missionLaunchPendingRef.current) return;
    const launchNonce = missionLaunchNonceRef.current + 1;
    missionLaunchNonceRef.current = launchNonce;
    missionLaunchPendingRef.current = true;
    const releaseLaunchReservation = () => {
      if (missionLaunchNonceRef.current === launchNonce) {
        missionLaunchPendingRef.current = false;
      }
    };

    const authorizedCampaignLabRequest = campaignLabRequest && founderAuthorizationRef.current
      ? campaignLabRequest
      : null;
    if (campaignLabRequest && !authorizedCampaignLabRequest) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError('Campaign Lab launch rejected: connect the authorized founder wallet.');
      releaseLaunchReservation();
      return;
    }

    const requestedBossReplay = bossEncounterId ? getBossArchiveEntry(bossEncounterId) : null;
    const matchingReusableArchiveRun = requestedBossReplay
      && reusableBossArchiveRun?.eventId === requestedBossReplay.eventId
      && reusableBossArchiveRun.difficultyId === bossDifficultyId
      && !processedBossArchiveResultsRef.current.has(reusableBossArchiveRun.resultId)
        ? reusableBossArchiveRun
        : null;
    const reservedArchiveRunId = requestedBossReplay && !matchingReusableArchiveRun
      ? (globalThis.crypto?.randomUUID?.()
          ?? `${Date.now().toString(36)}-${launchNonce.toString(36)}`)
      : null;
    const reservedArchiveResultId = reservedArchiveRunId
      ? `boss-archive:${reservedArchiveRunId}`
      : null;
    const requestedWeeklyRunLevel = campaignRequest?.kind === 'weekly-streak'
      ? weeklyRun.campaign.levels.find((level) => level.id === campaignRequest.missionId) ?? null
      : null;
    const requestedCampaignMission = campaignRequest && campaignRequest.kind !== 'weekly-streak'
      ? getCampaignMissionById(campaignRequest.missionId)
      : null;
    const requestedCampaignBranch = branchRequest
      ? getCampaignBranchDefinition(DEFAULT_GAME_CAMPAIGN, branchRequest.branchId)
      : null;
    const normalizedCampaignRequest = authorizedCampaignLabRequest
      ?? (campaignRequest && requestedWeeklyRunLevel
        ? {
            ...campaignRequest,
            waveId: requestedWeeklyRunLevel.waves[0]?.id ?? campaignRequest.waveId,
            kind: 'weekly-streak' as const
          }
        : campaignRequest && requestedCampaignMission
        ? {
            ...campaignRequest,
            waveId: requestedCampaignMission.waveIds[0],
            kind: campaignRequest.kind === 'replay' ? 'replay' as const : 'mission' as const
          }
        : campaignRequest);
    // The Weekly Run is a fixed gauntlet route, not a Campaign Map walk, so it
    // is authorized purely by membership in that route: not by a graph node,
    // not by Campaign unlock progress, and deliberately not by the streak
    // record. The streak is bookkeeping written through React state, so
    // requiring it here raced the launch that starts it and silently refused
    // the very first Weekly Run of the week.
    const weeklyLaunchAllowed = Boolean(
      campaignRequest?.kind === 'weekly-streak'
      && weeklyRun.missionIds.has(campaignRequest.missionId)
    );
    if (
      campaignRequest
      && !authorizedCampaignLabRequest
      && !weeklyLaunchAllowed
      && (
        !requestedCampaignMission
        || !isCampaignMissionUnlocked(
          permanentSquadStateRef.current.campaignProgress,
          campaignRequest.missionId
        )
        || !isCampaignWaveUnlocked(
          permanentSquadStateRef.current.campaignProgress,
          campaignRequest.missionId,
          normalizedCampaignRequest?.waveId ?? requestedCampaignMission.waveIds[0]
        )
      )
    ) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError('That Mission checkpoint is still locked. Continue the illuminated route first.');
      releaseLaunchReservation();
      return;
    }
    if (
      branchRequest
      && (
        !requestedCampaignBranch
        || !canLaunchCampaignBranch(
          permanentSquadStateRef.current.campaignProgress.branchProgress,
          requestedCampaignBranch
        )
      )
    ) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError('This optional route is still encrypted or its one-time cache was already recovered.');
      showCampaignMapRoute();
      releaseLaunchReservation();
      return;
    }
    if (
      bossEncounterId
      && (
        !requestedBossReplay
        || (
          !isOwnerWallet
          && !permanentSquadState.bossArchive.unlockedEventIds.includes(requestedBossReplay.eventId)
        )
      )
    ) {
      // Refusing here without a reason made the Play button look dead.
      setBossArchiveLaunchError(requestedBossReplay
        ? 'This boss is still locked. Defeat it in the Campaign to add it to the Archive.'
        : 'This Archive entry could not be loaded. Close the Archive and reopen it.');
      releaseLaunchReservation();
      return;
    }
    if (
      requestedBossReplay
      && bossMode === 'challenge'
      && !matchingReusableArchiveRun
      && !(activeWalletAddress && !isOwnerWallet && !import.meta.env.DEV)
      && getBossArchiveDailyChargeStatus(
        permanentSquadState.bossArchive,
        new Date(),
        bossArchiveDailyLimit
      ).remaining <= 0
    ) {
      setBossArchiveLaunchError('All Boss Archive charges have been used for today. They reset at 00:00 UTC.');
      releaseLaunchReservation();
      return;
    }

    const requiresServerChallengeSettlement = Boolean(
      requestedBossReplay
      && bossMode === 'challenge'
      && !matchingReusableArchiveRun
      && activeWalletAddress
      && !isOwnerWallet
      && !import.meta.env.DEV
    );
    let serverChallengeRun: WalletBossArchiveChallengeRun | null =
      matchingReusableArchiveRun?.serverChallengeRun ?? null;
    let serverWalletAddress: string | null =
      matchingReusableArchiveRun?.serverWalletAddress ?? null;
    if (requiresServerChallengeSettlement) {
      if (walletProfileStatus !== 'ready') {
        const reconnectMessage = 'Reconnect this wallet profile before starting a Boss Archive fight.';
        setWalletError(reconnectMessage);
        setBossArchiveLaunchError(reconnectMessage);
        releaseLaunchReservation();
        return;
      }
      try {
        const normalizedAddress = activeWalletAddress!.toLowerCase();
        serverWalletAddress = normalizedAddress;
        const startTask = walletProfileSaveChainRef.current
          .catch(() => undefined)
          .then(async () => {
            const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
            if (flushedProfile) {
              walletProfileRevisionRef.current = flushedProfile.revision;
              walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
              cacheWalletProfile(flushedProfile);
            }
            return startWalletBossArchiveChallenge({
              walletAddress: normalizedAddress,
              eventId: requestedBossReplay!.eventId,
              variantId: 'standard',
              difficultyId: bossDifficultyId
            });
          });
        walletProfileSaveChainRef.current = startTask.then(
          () => undefined,
          () => undefined
        );
        const started = await startTask;
        if (missionLaunchNonceRef.current !== launchNonce) return;
        serverChallengeRun = started.run;
        cacheWalletProfile(started.profile);
        discardWalletProfileDirty(normalizedAddress);
        if (walletProfileAddressRef.current === normalizedAddress) {
          walletProfileRevisionRef.current = started.profile.revision;
          walletProfileSyncedSnapshotRef.current = started.profile.snapshot;
          const hydratedSnapshot = hydrateActiveProfile({
            profileId: started.profile.profileId,
            snapshot: started.profile.snapshot,
            founderSandbox: false
          });
          walletProfileLocalBaselineRef.current = hydratedSnapshot;
          permanentSquadStateRef.current = hydratedSnapshot.permanentState;
          weeklySquadStateRef.current = hydratedSnapshot.weeklyState;
          setWalletProfileStatus('ready');
        }
        setWalletError('');
      } catch (error) {
        if (missionLaunchNonceRef.current !== launchNonce) return;
        console.error('Boss Archive Challenge start failed', error);
        const startFailureMessage = error instanceof Error
          ? error.message
          : 'This Boss Archive fight could not start. Reconnect and try again.';
        setWalletError(startFailureMessage);
        setBossArchiveLaunchError(startFailureMessage);
        releaseLaunchReservation();
        return;
      }
    }

    if (
      requestedBossReplay
      && !matchingReusableArchiveRun
      && !requiresServerChallengeSettlement
    ) {
      const reservation = beginBossArchiveFightEconomy(
        permanentSquadStateRef.current,
        weeklySquadStateRef.current,
        {
          eventId: requestedBossReplay.eventId,
          difficultyId: bossDifficultyId,
          attemptId: reservedArchiveResultId!
        },
        { dailyLimit: bossArchiveDailyLimit }
      );
      if (!reservation.result.accepted) {
        const reservationMessage = reservation.result.reason === 'no-charges'
          ? 'All Boss Archive charges have been used for today. They reset at 00:00 UTC.'
          : 'This Boss Archive fight could not be reserved. Please try again.';
        setWalletError(reservationMessage);
        setBossArchiveLaunchError(reservationMessage);
        releaseLaunchReservation();
        return;
      }
      if (!persistRewardClaim(reservation.permanentState, reservation.weeklyState)) {
        const persistMessage = 'This Boss Archive charge could not be saved. Please try again.';
        setWalletError(persistMessage);
        setBossArchiveLaunchError(persistMessage);
        releaseLaunchReservation();
        return;
      }
      permanentSquadStateRef.current = reservation.permanentState;
      weeklySquadStateRef.current = reservation.weeklyState;
      setWalletError('');
      setBossArchiveLaunchError(null);
    }

    const requiresServerBranchSettlement = Boolean(
      requestedCampaignBranch
      && activeWalletAddress
      && !isOwnerWallet
      && !import.meta.env.DEV
    );
    let serverBranchAttempt: WalletCampaignBranchAttempt | null = null;
    let serverBranchWalletAddress: string | null = null;
    if (requiresServerBranchSettlement) {
      if (walletProfileStatus !== 'ready') {
        setCampaignMapStatus('launch-error');
        setCampaignMapError('Reconnect this wallet profile before starting the one-time bonus route.');
        showCampaignMapRoute();
        releaseLaunchReservation();
        return;
      }
      try {
        const normalizedAddress = activeWalletAddress!.toLowerCase();
        serverBranchWalletAddress = normalizedAddress;
        const startTask = walletProfileSaveChainRef.current
          .catch(() => undefined)
          .then(async () => {
            const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
            if (flushedProfile) {
              walletProfileRevisionRef.current = flushedProfile.revision;
              walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
              cacheWalletProfile(flushedProfile);
            }
            return startWalletCampaignBranch({
              walletAddress: normalizedAddress,
              branchId: requestedCampaignBranch!.branchId
            });
          });
        walletProfileSaveChainRef.current = startTask.then(
          () => undefined,
          () => undefined
        );
        serverBranchAttempt = await startTask;
        if (missionLaunchNonceRef.current !== launchNonce) return;
        setWalletError('');
      } catch (error) {
        if (missionLaunchNonceRef.current !== launchNonce) return;
        console.error('Campaign bonus route start failed', error);
        setCampaignMapStatus('launch-error');
        setCampaignMapError(
          error instanceof Error
            ? error.message
            : 'The one-time bonus route could not be authorized. Reconnect and try again.'
        );
        showCampaignMapRoute();
        releaseLaunchReservation();
        return;
      }
    }

    const runMode: ActiveRunMode = authorizedCampaignLabRequest
      ? 'campaign-lab'
      : requestedBossReplay
      ? 'boss-archive'
      : requestedCampaignBranch
        ? 'campaign-branch'
      : normalizedCampaignRequest?.kind === 'weekly-streak'
        ? 'weekly-streak'
      : normalizedCampaignRequest?.kind === 'replay'
        ? 'campaign-replay'
        : normalizedCampaignRequest
          ? 'campaign'
        : isOwnerWallet
        ? 'owner-test'
        : 'standard';
    recordPlayerReportBreadcrumb('launch_requested', {
      run_mode: runMode,
      mission_id: normalizedCampaignRequest?.missionId ?? requestedCampaignBranch?.missionDefinitionId ?? '',
      wave_id: normalizedCampaignRequest?.waveId ?? '',
      boss_event_id: requestedBossReplay?.eventId ?? ''
    });
    updatePlayerReportContext({
      runMode,
      missionId: normalizedCampaignRequest?.missionId ?? requestedCampaignBranch?.missionDefinitionId ?? '',
      waveId: normalizedCampaignRequest?.waveId ?? '',
      loadingPhase: 'module-load'
    });
    setActiveRunMode(runMode);
    setActiveBossEncounterId(requestedBossReplay?.eventId ?? null);
    setActiveCampaignLaunch(normalizedCampaignRequest);
    // A Weekly Run rolls straight from one Mission into the next without
    // returning home, so depth is tracked here, at the single launch funnel,
    // rather than in any one Mission's completion path.
    if (runMode === 'weekly-streak') {
      const sector = getWeeklyRunDepth(normalizedCampaignRequest?.missionId);
      if (sector > 0) {
        weeklyRunSectorReachedRef.current = Math.max(weeklyRunSectorReachedRef.current, sector);
        weeklyRunSectorsClearedRef.current = Math.max(weeklyRunSectorsClearedRef.current, sector - 1);
      }
    } else {
      weeklyRunSectorReachedRef.current = 0;
      weeklyRunSectorsClearedRef.current = 0;
    }
    setActiveCampaignBranchId(requestedCampaignBranch?.branchId ?? null);

    const archiveRunId = requestedBossReplay && !matchingReusableArchiveRun
      ? (serverChallengeRun?.runId ?? reservedArchiveRunId)
      : null;
    const nextArchiveRun = matchingReusableArchiveRun
      ?? (requestedBossReplay && archiveRunId
      ? {
          eventId: requestedBossReplay.eventId,
          mode: bossMode,
          variantId: bossVariantId,
          difficultyId: bossDifficultyId,
          seed: `boss-archive:${requestedBossReplay.eventId}:${bossDifficultyId}:${archiveRunId}`,
          resultId: `boss-archive:${archiveRunId}`,
          serverChallengeRun,
          serverWalletAddress
        } satisfies BossArchiveRunContext
      : null);
    setActiveBossArchiveRun(nextArchiveRun);
    if (nextArchiveRun) {
      setBossArchiveResult(null);
      setBossArchiveLaunchError(null);
    }
    campaignBranchRunRef.current = requestedCampaignBranch
      ? {
          branchId: requestedCampaignBranch.branchId,
          serverAttempt: serverBranchAttempt,
          serverWalletAddress: serverBranchWalletAddress
        }
      : null;
    bossArchiveDamageTakenRef.current = 0;
    const shouldShowMissionLoading = !gameplayPreloadReady;
    const loadingTip = missionLoading?.phase === 'error'
      ? missionLoading.tip
      : getRandomMissionLoadingTip();
    audioService.init();
    if (shouldShowMissionLoading) {
      recordPlayerReportBreadcrumb('preload_started', { run_mode: runMode });
      setMissionLoading({
        progress: gameplayPreloadProgress,
        phase: gameplayPreloadPhase,
        tip: loadingTip
      });
    } else {
      setMissionLoading(null);
    }

    try {
      await preloadGameplayComponents(shouldShowMissionLoading
        ? (progress, phase) => {
            if (missionLaunchNonceRef.current !== launchNonce) return;
            setMissionLoading({
              progress,
              phase,
              tip: loadingTip
            });
          }
        : undefined);
      recordPlayerReportBreadcrumb('preload_ready', {
        run_mode: runMode,
        loading_screen_shown: shouldShowMissionLoading
      });
    } catch (error) {
      console.error('Gameplay preload failed.', error);
      if (recoverFromModulePreloadFailure(error)) return;
      audioService.playUiSound('error');
      recordPlayerReportBreadcrumb('preload_failed', { run_mode: runMode });
      capturePlayerRuntimeError(error, {
        source: 'gameplay_preload',
        run_mode: runMode
      });
      if (missionLaunchNonceRef.current === launchNonce) {
        missionLaunchPendingRef.current = false;
        setMissionLoading((current) => ({
          progress: current?.progress ?? 0,
          phase: 'error',
          tip: current?.tip ?? loadingTip
        }));
      }
      return;
    }

    if (missionLaunchNonceRef.current !== launchNonce) return;

    const startInTestMode = runMode === 'owner-test' || runMode === 'campaign-lab';
    const nextGameId = gameId + 1;
    const requestedLabShipId = authorizedCampaignLabRequest?.shipId
      ? parsePlayerShipId(authorizedCampaignLabRequest.shipId)
      : null;
    const runShipId = requestedLabShipId ?? usableShipId;
    const requestedSupportIds = authorizedCampaignLabRequest
      ? [authorizedCampaignLabRequest.supportId, authorizedCampaignLabRequest.rightSupportId]
      : [];
    const campaignLabSupports = requestedSupportIds.reduce<Array<(typeof MINI_SHIP_CATALOG)[number]>>(
      (supports, supportId) => {
        if (!supportId || supportId === 'none' || supports.some((entry) => entry.id === supportId)) {
          return supports;
        }
        const support = MINI_SHIP_CATALOG.find((entry) => entry.id === supportId);
        if (support && supports.length < 2) supports.push(support);
        return supports;
      },
      []
    );
    const campaignLabLeftSupport = campaignLabSupports[0] ?? null;
    const campaignLabRightSupport = campaignLabSupports[1] ?? null;
    const clampLabLevel = (value: number | undefined, maximum: number) => (
      Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)))
    );
    const campaignLabState: WeeklySquadState = authorizedCampaignLabRequest
      ? {
          ...weeklySquadState,
          unlockedSlots: {
            ...weeklySquadState.unlockedSlots,
            left: Boolean(campaignLabLeftSupport),
            right: Boolean(campaignLabRightSupport)
          },
          ownedMiniShips: campaignLabSupports.reduce((owned, support) => ({
            ...owned,
            [support.id]: Math.max(
              1,
              clampLabLevel(authorizedCampaignLabRequest.upgradeLevels.supportLevel, MINI_SHIP_MAX_LEVEL)
            )
          }), { ...weeklySquadState.ownedMiniShips }),
          equipped: {
            ...weeklySquadState.equipped,
            left: campaignLabLeftSupport?.id ?? null,
            right: campaignLabRightSupport?.id ?? null
          },
          shipUpgrades: {
            ...weeklySquadState.shipUpgrades,
            [runShipId]: {
              fireRate: clampLabLevel(
                authorizedCampaignLabRequest.upgradeLevels.fireRate,
                MAIN_SHIP_UPGRADES.find((upgrade) => upgrade.id === 'fireRate')?.costs.length
                  ?? MAIN_SHIP_FIRE_RATE_MAX_LEVEL
              ),
              speed: clampLabLevel(
                authorizedCampaignLabRequest.upgradeLevels.speed,
                MAIN_SHIP_UPGRADES.find((upgrade) => upgrade.id === 'speed')?.costs.length ?? 7
              ),
              startingHearts: clampLabLevel(
                authorizedCampaignLabRequest.upgradeLevels.startingHearts,
                MAIN_SHIP_UPGRADES.find((upgrade) => upgrade.id === 'startingHearts')?.costs.length ?? 7
              )
            }
          }
        }
      : weeklySquadState;
    const squadLoadout = buildRuntimeSquadLoadout(campaignLabState, runShipId);
    const weeklyStreakForLaunch = runMode === 'weekly-streak'
      ? weeklySquadStateRef.current.weeklyCampaignStreak
      : null;
    // Weekly Run is the competitive endurance mode and always starts on the
    // same footing: exactly ten lives, regardless of Campaign Starting Hearts.
    // Lives persist only inside the mounted engine; a later launch is always a
    // new attempt and never restores a saved checkpoint.
    const startingLives = resolveRunStartingLives({
      weeklyRun: runMode === 'weekly-streak',
      startingHeartLevel: squadLoadout.upgrades.startingHearts
    });
    setActiveRunLifeCapacity(startingLives);
    const weeklyRunKeyForLaunch = weeklyStreakForLaunch
      ? `${weeklyStreakForLaunch.weeklyId}:${weeklyStreakForLaunch.startNodeId}:${weeklyStreakForLaunch.createdAtMs}`
      : null;
    const preserveConnectedWeeklySession = Boolean(
      weeklyRunKeyForLaunch
      && weeklyRunSessionKeyRef.current === weeklyRunKeyForLaunch
      && runSessionPromiseRef.current
    );
    activeRunSquadLoadoutRef.current = squadLoadout;
    squadRunAppliedGameIdRef.current = null;
    permanentRunAppliedGameIdRef.current = null;
    permanentBossAppliedKeysRef.current.clear();
    processedCampaignSummaryKeysRef.current.clear();
    campaignResultPreviewRef.current = false;
    campaignRunCreditedEnemiesRef.current = 0;
    campaignRunMasteryEligibleRef.current = Boolean(
      normalizedCampaignRequest
      && requestedCampaignMission
      && normalizedCampaignRequest.waveId === requestedCampaignMission.waveIds[0]
    );
    campaignAttemptIdRef.current = normalizedCampaignRequest || requestedCampaignBranch
      ? (serverBranchAttempt?.attemptId
          ?? globalThis.crypto?.randomUUID?.()
          ?? `${Date.now().toString(36)}-${launchNonce.toString(36)}`)
      : '';
    campaignBranchAttemptSettledRef.current = false;
    campaignBranchCoinBaselineRef.current = requestedCampaignBranch ? stats.totalCoins : null;
    setMissionRecordPilotName(null);
    clearIntroStoryTimeout();
    lastStoryWaveRef.current = 0;
    setActiveStoryBeat(null);
    setPauseMissionPosition(null);
    setStats(prev => ({
      ...prev,
      score: 0,
      wave: requestedBossReplay?.missionNumber
        ?? (requestedWeeklyRunLevel ? getWeeklyRunDepth(requestedWeeklyRunLevel.id) : undefined)
        ?? requestedCampaignMission?.number
        ?? getCampaignMissionById(requestedCampaignBranch?.sourceMissionId ?? '')?.number
        ?? 1,
      coins: 0,
      enemiesDefeated: 0,
      bombs: 2,
      bombCharge: startInTestMode ? OWNER_TEST_FLASK_CHARGE : 0,
      bombChargeMax: BASE_FLASK_CHARGE_MAX,
      shipAbilityCooldown: 0,
      shipAbilityCooldownMax: 16 * 60,
      lives: startingLives,
      repairsCount: 0,
      upgrades: {
        ...defaultMissionUpgrades,
        fireRate: squadLoadout.upgrades.fireRate,
        speed: squadLoadout.upgrades.speed,
        ability: squadLoadout.upgrades.ability
      },
      powerupUses: { ...defaultPowerupUses },
      bossProgress: 0,
      isBossActive: false,
      bossHp: 0,
      bossMaxHp: 100
    }));
    setContinuePaymentStatus('idle');
    setContinuePaymentHash('');
    setContinuePaymentError('');
    setContinuesUsed(0);
    setBombCommand(null);
    setShipAbilityCommand(null);
    setContinueCommand(null);
    setWaveContinueCommand(null);
    setWaveVictorySummary(null);
    setCampaignResultPresentation(null);
    setCampaignBranchResult(null);
    setCampaignCompletedRun(false);
    setTestWaveCommand(null);
    setTestBossCommand(null);
    setTestFlaskCommand(null);
    setShowTestChampionPreview(false);
    setOwnerFrameFrozen(false);
    setIntroMissionLocked(true);
    setShowNameInput(false);
    setPlayerNameInput('');
    setIsSubmittingScore(false);
    setScoreSaved(false);
    setRunReceipt(null);
    setShowMissionRecordPreview(false);
    setShowWeeklyProposalSelection(false);
    setWeeklyProposalSelectionStatus('idle');
    setWeeklyProposalSelectionMessage('');
    setWeeklyProposalSelectionMode('recovery');
    clearWeeklyProposalTransition();
    setScorecardChampionWinner(null);
    setMissionMintStatus('idle');
    setMissionMintMessage('');
    finalizedRunGameIdRef.current = null;
    activeRunShipIdRef.current = runShipId;
    setActiveMissionShipId(runShipId);
    campaignLabActiveRequestRef.current = authorizedCampaignLabRequest;
    if (authorizedCampaignLabRequest) setCampaignLabTelemetry(null);
    if (!preserveConnectedWeeklySession) {
      runStartedAtRef.current = null;
      runReceiptPromiseRef.current = null;
      runSessionPromiseRef.current = null;
      weeklyRunSessionKeyRef.current = null;
    }
    setRunReceiptStatus('idle');
    submittingScoreRef.current = false;
    pendingMissionRuntimeRef.current = {
      launchNonce,
      gameId: nextGameId,
      startInTestMode,
      tip: loadingTip,
      squadLoadout,
      runMode,
      missionNumber: requestedBossReplay?.missionNumber
        ?? (requestedWeeklyRunLevel ? getWeeklyRunDepth(requestedWeeklyRunLevel.id) : undefined)
        ?? requestedCampaignMission?.number
        ?? getCampaignMissionById(requestedCampaignBranch?.sourceMissionId ?? '')?.number
        ?? 1
    };
    setGameRuntimeReady(false);
    setMissionLoading({
      progress: 96,
      phase: 'runtime-sync',
      tip: loadingTip
    });
    setGameId(nextGameId);
    lastStoryWaveRef.current = requestedBossReplay?.missionNumber
      ?? (requestedWeeklyRunLevel ? getWeeklyRunDepth(requestedWeeklyRunLevel.id) : undefined)
      ?? requestedCampaignMission?.number
      ?? getCampaignMissionById(requestedCampaignBranch?.sourceMissionId ?? '')?.number
      ?? 1;
    setGameState(GameState.PLAYING);
  };

  const startGame = () => {
    const mission = getCampaignMissionById(campaignCheckpoint.missionId);
    void launchGame(null, 'challenge', 'standard', {
      missionId: campaignCheckpoint.missionId,
      waveId: mission?.waveIds[0] ?? campaignCheckpoint.waveId,
      kind: 'mission'
    });
  };

  const retryGame = () => {
    if (isWeeklyCampaignRun) {
      // A Weekly loss ends that flight. Retry must pass through the same fresh
      // admission path as Home so it spends a new attempt and starts at Wave 1.
      void startWeeklyRunFromHome();
      return;
    }
    if (isCampaignBranchRun && activeCampaignBranch) {
      void launchGame(null, 'challenge', 'standard', null, {
        branchId: activeCampaignBranch.branchId,
        sourceMissionId: activeCampaignBranch.sourceMissionId,
        missionDefinitionId: activeCampaignBranch.missionDefinitionId,
        kind: 'branch'
      });
      return;
    }
    if (isCampaignRun && activeCampaignLaunch) {
      const mission = getCampaignMissionById(activeCampaignLaunch.missionId);
      const retryRequest = {
        missionId: activeCampaignLaunch.missionId,
        waveId: mission?.waveIds[0] ?? activeCampaignLaunch.waveId,
        kind: activeCampaignLaunch.kind === 'replay' ? 'replay' as const : 'mission' as const
      };
      void launchGame(null, 'challenge', 'standard', retryRequest);
      return;
    }
    startGame();
  };

  const startBossArchiveFight = (
    entry: BossArchiveEntry,
    request: {
      mode: BossArchiveRunMode;
      variantId: string;
      difficultyId: BossArchiveDifficultyId;
    } = {
      mode: 'challenge',
      variantId: 'standard',
      difficultyId: 'easy'
    }
  ) => {
    void launchGame(
      entry.eventId,
      request.mode,
      request.variantId,
      null,
      null,
      null,
      request.difficultyId
    );
  };

  const completeMissionRuntimeLaunch = (runtimeGameId: number) => {
    const pendingLaunch = pendingMissionRuntimeRef.current;
    if (
      !pendingLaunch
      || pendingLaunch.gameId !== runtimeGameId
      || pendingLaunch.launchNonce !== missionLaunchNonceRef.current
    ) return;

    pendingMissionRuntimeRef.current = null;
    missionLaunchPendingRef.current = false;
    setGameRuntimeReady(true);
    setMissionLoading(null);
    recordPlayerReportBreadcrumb('runtime_ready', {
      game_id: runtimeGameId,
      run_mode: pendingLaunch.runMode
    });
    if (pendingLaunch.runMode === 'boss-archive' || pendingLaunch.runMode === 'campaign-branch') {
      setIntroMissionLocked(false);
      return;
    }
    trackEvent('mission_started');
    emitSquadDomainEvent('run_started', {
      profileId: pendingLaunch.squadLoadout.profileId,
      weekKey: pendingLaunch.squadLoadout.weekKey,
      companions: pendingLaunch.squadLoadout.companions.map((companion) => companion.id)
    });

    clearIntroStoryTimeout();
    introStoryTimeoutRef.current = window.setTimeout(() => {
      introStoryTimeoutRef.current = null;
      setIntroMissionLocked(false);
      if (gameStateRef.current === GameState.PLAYING) {
        // Campaign narrative only. The Weekly Run has no missions to brief, so
        // opening it with "Mission 1: Research Frontier" would be wrong.
        const introBeat = pendingLaunch.runMode === 'weekly-streak'
          ? null
          : getStoryBeatForPhase(pendingLaunch.missionNumber);
        const launchProfileId = pendingLaunch.squadLoadout.profileId;
        if (introBeat && !hasSeenStoryBeatTodayForProfile(introBeat, launchProfileId)) {
          setActiveStoryBeat(introBeat);
        } else {
          const campaignAlreadyCleared = permanentSquadStateRef.current.campaignProgress.completedMissionIds.length > 0
            || permanentSquadStateRef.current.lifetimeStats.campaignMissionsCleared > 0;
          if (
            pendingLaunch.missionNumber === 1
            && pendingLaunch.runMode !== 'weekly-streak'
            && !campaignAlreadyCleared
            && loadOnboardingProgress(launchProfileId).decision === 'unasked'
          ) {
            // If the app closed while the first invitation was visible, offer
            // it again on the next first-Mission launch even though Brian's
            // briefing is already marked seen for this profile today.
            offerFirstFlightGuideBeforeRun(
              pendingLaunch.startInTestMode || isOwnerWallet,
              pendingLaunch.runMode
            );
          } else {
            beginRunSession(
              pendingLaunch.startInTestMode || isOwnerWallet,
              pendingLaunch.runMode
            );
          }
        }
      }
    }, 2650);
  };

  const failMissionRuntimeLaunch = (runtimeGameId: number, error: unknown) => {
    const pendingLaunch = pendingMissionRuntimeRef.current;
    if (
      !pendingLaunch
      || pendingLaunch.gameId !== runtimeGameId
      || pendingLaunch.launchNonce !== missionLaunchNonceRef.current
    ) return;

    console.error('Gameplay runtime launch failed.', error);
    recordPlayerReportBreadcrumb('runtime_failed', {
      game_id: runtimeGameId,
      run_mode: pendingLaunch.runMode
    });
    capturePlayerRuntimeError(error, {
      source: 'gameplay_runtime_initialization',
      game_id: runtimeGameId,
      run_mode: pendingLaunch.runMode
    });
    pendingMissionRuntimeRef.current = null;
    onboardingRunSessionPendingRef.current = null;
    setOnboardingGameplayFreeze(false);
    missionLaunchPendingRef.current = false;
    clearIntroStoryTimeout();
    setGameRuntimeReady(false);
    setIntroMissionLocked(true);
    setMissionLoading({
      progress: 96,
      phase: 'error',
      tip: pendingLaunch.tip
    });
  };

  const resetGame = () => {
    recordPlayerReportBreadcrumb('runtime_reset_requested', {
      game_id: gameId,
      game_state: gameState,
      run_mode: activeRunMode
    });
    if (isCampaignBranchRun && campaignBranchCoinBaselineRef.current !== null) {
      const baseline = campaignBranchCoinBaselineRef.current;
      setStats((current) => ({ ...current, coins: 0, totalCoins: baseline }));
    }
    missionLaunchNonceRef.current += 1;
    missionLaunchPendingRef.current = false;
    pendingMissionRuntimeRef.current = null;
    onboardingRunSessionPendingRef.current = null;
    setOnboardingGameplayFreeze(false);
    clearIntroStoryTimeout();
    setGameRuntimeReady(false);
    setMissionLoading(null);
    setPauseMissionPosition(null);
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    setShowTestChampionPreview(false);
    setWaveVictorySummary(null);
    setCampaignResultPresentation(null);
    setCampaignBranchResult(null);
    setCampaignMapOpen(false);
    setCampaignMapStatus('ready');
    setCampaignMapError('');
    setCampaignMapFocusMissionId(null);
    setCampaignMapFocusBranchId(null);
    setCampaignMapUnlockingBranchId(null);
    setCampaignMapNewMissionIds([]);
    setWeeklyCampaignConfirmation(null);
    setCampaignCompletedRun(false);
    setWaveContinueCommand(null);
    setShowWeeklyProposalSelection(false);
    setWeeklyProposalSelectionStatus('idle');
    setWeeklyProposalSelectionMessage('');
    setWeeklyProposalSelectionMode('recovery');
    clearWeeklyProposalTransition();
    setScorecardChampionWinner(null);
    setActiveRunMode('standard');
    setActiveBossEncounterId(null);
    setActiveBossArchiveRun(null);
    setActiveCampaignLaunch(null);
    setActiveCampaignBranchId(null);
    processedCampaignSummaryKeysRef.current.clear();
    campaignAttemptIdRef.current = '';
    campaignRunMasteryEligibleRef.current = false;
    campaignBranchRunRef.current = null;
    campaignBranchAttemptSettledRef.current = false;
    campaignBranchCoinBaselineRef.current = null;
    campaignRunCreditedEnemiesRef.current = 0;
    campaignResultPreviewRef.current = false;
    setOwnerFrameFrozen(false);
    runStartedAtRef.current = null;
    runSessionPromiseRef.current = null;
    weeklyRunSessionKeyRef.current = null;
    setGameState(GameState.MENU);
  };

  const returnToBossArchive = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'bosses');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    resetGame();
  };

  const returnToMainMenu = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('view');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    resetGame();
  };

  const cancelMissionLoading = () => {
    resetGame();
  };

  const openSquadHangar = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'hangar');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setShowMissionRecordPreview(false);
    resetGame();
  };

  const toggleGameAudio = () => {
    const nextMuted = audioService.toggleMute();
    setAudioMuted(nextMuted);
    setSfxVolumeLevel(audioService.getSfxVolumeLevel());
    if (!nextMuted) audioService.playUiSound('confirm');
  };

  const setGameSfxVolume = (level: number) => {
    setSfxVolumeLevel(audioService.setSfxVolumeLevel(level));
    setAudioMuted(audioService.isMuted());
    audioService.playUiSound('click');
  };

  const setGameMusicVolume = (level: number) => {
    setMusicVolumeLevel(audioService.setMusicVolumeLevel(level));
    setAudioMuted(audioService.isMuted());
    audioService.playUiSound('click');
  };

  const setGameMatchMusicTrack = (trackId: MatchMusicTrackId) => {
    setMatchMusicTrackId(audioService.setMatchMusicTrackId(trackId));
    audioService.playUiSound('click');
  };

  const setActiveGameMatchMusicTrack = (trackId: MatchMusicTrackId) => {
    const startingTrackId = campaignMusicSectorOrder === null
      ? trackId
      : cycleMatchMusicTrackId(trackId, -(campaignMusicSectorOrder - 1));
    setGameMatchMusicTrack(startingTrackId);
  };

  const clearCampaignMapRoute = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== 'campaign-map') return;
    url.searchParams.delete('view');
    const nextState = window.history.state && typeof window.history.state === 'object'
      ? { ...window.history.state }
      : {};
    delete nextState.sciconCampaignMap;
    window.history.replaceState(nextState, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const showCampaignMapRoute = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('view') !== 'campaign-map') {
      url.searchParams.set('view', 'campaign-map');
      window.history.pushState(
        { ...(window.history.state ?? {}), sciconCampaignMap: true },
        '',
        `${url.pathname}${url.search}${url.hash}`
      );
    }
    setCampaignMapOpen(true);
  };

  const openCampaignMap = (focusMissionId?: string | null) => {
    if (gameStateRef.current !== GameState.MENU || missionLaunchPendingRef.current) resetGame();
    const progress = permanentSquadStateRef.current.campaignProgress;
    const newlyUnlocked = [...progress.unviewedMissionIds];
    const newlyUnlockedBranches = [...progress.branchProgress.newBranchIds];
    showCampaignMapRoute();
    setCampaignMapNewMissionIds(newlyUnlocked);
    setCampaignMapFocusBranchId(newlyUnlockedBranches.at(-1) ?? null);
    setCampaignMapUnlockingBranchId(newlyUnlockedBranches.at(-1) ?? null);
    setCampaignMapFocusMissionId(
      focusMissionId
      ?? newlyUnlocked.at(-1)
      ?? progress.recommendedMissionId
    );
    setCampaignMapError('');
    setCampaignMapStatus('ready');
    if (getCampaignNotificationCount(progress) > 0) {
      updatePermanentSquadState((current) => ({
        ...current,
        campaignProgress: markCampaignMapViewed(current.campaignProgress),
        updatedAt: new Date().toISOString()
      }));
    }
  };
  openCampaignMapRef.current = openCampaignMap;

  const closeCampaignMap = () => {
    const url = new URL(window.location.href);
    if (
      url.searchParams.get('view') === 'campaign-map'
      && window.history.state?.sciconCampaignMap === true
    ) {
      window.history.back();
      return;
    }
    clearCampaignMapRoute();
    setCampaignMapOpen(false);
    setGameState(GameState.MENU);
    setCampaignMapStatus('ready');
    setCampaignMapError('');
    setCampaignMapUnlockingBranchId(null);
  };

  const launchCampaignFromMap = (request: CampaignMapLaunchRequest) => {
    setCampaignMapStatus('launch-pending');
    setCampaignMapError('');
    clearCampaignMapRoute();
    setCampaignMapOpen(false);
    void launchGame(null, 'challenge', 'standard', request);
  };

  const startWeeklyCampaignFromMap = useCallback((
    request: CampaignMapLaunchRequest & { nodeId: string }
  ) => {
    const now = new Date();
    const boundary = getWeeklyBoundaryMeta(now);
    try {
      const streak = startWeeklyCampaignStreak(weeklyRun.graph, {
        weeklyId: boundary.weekKey,
        resetAtMs: boundary.endsAt.getTime(),
        startNodeId: request.nodeId,
        unlockedNodeIds: permanentSquadStateRef.current.campaignProgress.unlockedGraphNodeIds,
        nowMs: now.getTime()
      });
      persistWeeklyCampaignStreak(streak);
      setWeeklyCampaignConfirmation(null);
      launchCampaignFromMap({ ...request, kind: 'weekly-streak' });
    } catch (error) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError(error instanceof Error ? error.message : 'Weekly Streak could not start.');
    }
  }, [persistWeeklyCampaignStreak]);

  /**
   * Launches the Weekly Run: one continuous gauntlet through every
   * production-ready boss, starting on exactly ten lives.
   *
   * It does not route through the Campaign Map. The run has its own ordered
   * campaign (weeklyRun.campaign), so clearing a boss rolls straight into the
   * next sector rather than bouncing the player back to the home screen.
   */
  const startWeeklyRunFromHome = useCallback(async () => {
    if (weeklyRunAdmissionPendingRef.current || missionLaunchPendingRef.current) return;
    weeklyRunAdmissionPendingRef.current = true;
    try {
      setWeeklyRunLaunchError(null);
    const now = new Date();
    const boundary = getWeeklyBoundaryMeta(now);
    const quotaOwner = activeWalletAddress?.toLowerCase() ?? null;
    const currentQuota = weeklyRunAttemptQuotaOwnerRef.current === quotaOwner
      && weeklyRunAttemptQuotaRef.current?.weeklyId === boundary.weekKey
      ? weeklyRunAttemptQuotaRef.current
      : null;
    const staleStreak = weeklySquadStateRef.current.weeklyCampaignStreak;
    if (staleStreak?.finalization.status === 'active') {
      // Weekly Run is a single-flight attempt. Returning to Home, reloading the
      // webview, or reopening the app forfeits that flight; it must never
      // rebuild the engine at a saved Depth with restored checkpoint hearts.
      persistWeeklyCampaignStreak(finalizeWeeklyCampaignDeliberateEnd(staleStreak, now.getTime()));
    }
    const stateBeforeLaunch = weeklySquadStateRef.current;
    const entry = weeklyRun.entry;
    if (!entry?.waveId) {
      setCampaignMapError('The Weekly Run route is unavailable. Please reload and try again.');
      setCampaignMapStatus('launch-error');
      openCampaignMapRef.current();
      return;
    }

    const attemptsRemaining = currentQuota?.attemptsRemaining
      ?? getWeeklyRunAttemptsRemaining(weeklySquadStateRef.current);
    const serverCanVerifyUnknownWalletQuota = Boolean(
      activeWalletAddress
      && walletProfileStatus === 'ready'
      && !currentQuota
    );
    if (attemptsRemaining <= 0 && !serverCanVerifyUnknownWalletQuota) {
      setCampaignMapError(
        `All ${WEEKLY_RUN_ATTEMPT_LIMIT} free Weekly Run attempts have been used. `
        + 'Connect a Base Account to add one attempt for 3 RSC, or wait for the weekly reset.'
      );
      setCampaignMapStatus('launch-error');
      return;
    }
    try {
      const startedStreak = startWeeklyCampaignStreak(weeklyRun.graph, {
        weeklyId: boundary.weekKey,
        resetAtMs: boundary.endsAt.getTime(),
        startNodeId: weeklyRun.graph.definition.nodes[0]?.nodeId ?? '',
        // Every click starts a new flight at Depth 1. Weekly Run is not gated
        // on Campaign progress, but its deterministic graph still proves each
        // later Depth was earned in sequence during this one flight.
        unlockedNodeIds: weeklyRun.graph.definition.nodes.map((node) => node.nodeId),
        nowMs: now.getTime()
      });
      const withReservedAttempt = consumeWeeklyRunAttempt(weeklySquadStateRef.current);
      weeklySquadStateRef.current = withReservedAttempt;
      saveWeeklySquadState(withReservedAttempt);
      setWeeklySquadState(withReservedAttempt);
      persistWeeklyCampaignStreak(startedStreak);
    } catch (error) {
      setCampaignMapError(error instanceof Error ? error.message : 'The Weekly Run could not start.');
      setCampaignMapStatus('launch-error');
      openCampaignMapRef.current();
      return;
    }

    const weeklyStreakForReservation = weeklySquadStateRef.current.weeklyCampaignStreak;
    if (!weeklyStreakForReservation || weeklyStreakForReservation.finalization.status !== 'active') {
      setCampaignMapError('The Weekly Run attempt could not be prepared. Please try again.');
      setCampaignMapStatus('launch-error');
      return;
    }
    const sessionKey = `${weeklyStreakForReservation.weeklyId}:${weeklyStreakForReservation.startNodeId}:${weeklyStreakForReservation.createdAtMs}`;
    try {
      setRunReceiptStatus('starting');
      weeklyRunSessionKeyRef.current = sessionKey;
      runStartedAtRef.current = Date.now();
      const sessionPromise = startRunSession({
        testRun: isOwnerWallet,
        playerShipId: usableShipId,
        runMode: 'weekly-streak',
        profileId: weeklySquadStateRef.current.profileId,
        weeklyCampaignProof: weeklyStreakForReservation
      });
      runSessionPromiseRef.current = sessionPromise;
      const session = await sessionPromise;
      if (session.weeklyAttempt) {
        const reconciled = reconcileWeeklyRunAttempts(
          weeklySquadStateRef.current,
          session.weeklyAttempt.attemptsUsed
        );
        weeklySquadStateRef.current = reconciled;
        saveWeeklySquadState(reconciled);
        setWeeklySquadState(reconciled);
        applyWeeklyRunAttemptQuota({
          weeklyId: session.weeklyAttempt.weeklyId,
          freeAttempts: session.weeklyAttempt.freeAttempts,
          purchasedAttempts: session.weeklyAttempt.purchasedAttempts,
          attemptsUsed: session.weeklyAttempt.attemptsUsed,
          attemptsRemaining: session.weeklyAttempt.attemptsRemaining,
          resetAt: new Date(session.weeklyAttempt.resetAtMs).toISOString()
        }, quotaOwner);
      }
      setRunReceiptStatus('idle');
      setWeeklyRunLaunchError(null);
    } catch (error) {
      runSessionPromiseRef.current = null;
      weeklyRunSessionKeyRef.current = null;
      runStartedAtRef.current = null;
      setRunReceiptStatus('error');
      const details = (error as { details?: string[] })?.details;
      if (details?.includes('weekly_run_attempts_exhausted')) {
        const restored = reconcileWeeklyRunAttempts(stateBeforeLaunch, WEEKLY_RUN_ATTEMPT_LIMIT);
        weeklySquadStateRef.current = restored;
        saveWeeklySquadState(restored);
        setWeeklySquadState(restored);
        const purchasedAttempts = currentQuota?.purchasedAttempts ?? 0;
        applyWeeklyRunAttemptQuota({
          weeklyId: boundary.weekKey,
          freeAttempts: WEEKLY_RUN_ATTEMPT_LIMIT,
          purchasedAttempts,
          attemptsUsed: WEEKLY_RUN_ATTEMPT_LIMIT + purchasedAttempts,
          attemptsRemaining: 0,
          resetAt: boundary.endsAt.toISOString()
        }, quotaOwner);
      } else {
        // Keep the same pending streak key so a lost HTTP response can retry
        // the idempotent server reservation, but do not consume the displayed
        // local attempt until the reservation is actually acknowledged.
        const pending = {
          ...weeklySquadStateRef.current,
          weeklyStats: stateBeforeLaunch.weeklyStats,
          updatedAt: new Date().toISOString()
        };
        weeklySquadStateRef.current = pending;
        saveWeeklySquadState(pending);
        setWeeklySquadState(pending);
      }
      setCampaignMapError(error instanceof Error ? error.message : 'The Weekly Run attempt could not be verified.');
      setWeeklyRunLaunchError(error instanceof Error ? error.message : 'The Weekly Run attempt could not be verified.');
      setCampaignMapStatus('launch-error');
      return;
    }

    setActiveRunMode('weekly-streak');
    setActiveCampaignLaunch({ missionId: entry.levelId, waveId: entry.waveId ?? undefined, kind: 'weekly-streak' });
    setActiveBossEncounterId(null);
      await launchGame(null, 'challenge', 'standard', {
        missionId: entry.levelId,
        waveId: entry.waveId ?? undefined,
        kind: 'weekly-streak'
      });
    } finally {
      weeklyRunAdmissionPendingRef.current = false;
    }
  }, [
    activeWalletAddress,
    applyWeeklyRunAttemptQuota,
    isOwnerWallet,
    launchGame,
    persistWeeklyCampaignStreak,
    usableShipId,
    walletProfileStatus,
    weeklyRun
  ]);

  const selectWeeklyCampaignMissionFromMap = useCallback((
    request: CampaignMapLaunchRequest & { nodeId: string }
  ) => {
    const streak = weeklySquadStateRef.current.weeklyCampaignStreak;
    if (!streak || streak.finalization.status !== 'active') {
      setCampaignMapStatus('launch-error');
      setCampaignMapError('Start a Weekly Campaign Streak before choosing its route.');
      return;
    }
    if (request.nodeId === streak.currentNodeId && !streak.scoredNodeIds.includes(request.nodeId)) {
      setWeeklyCampaignConfirmation(null);
      launchCampaignFromMap({ ...request, kind: 'weekly-streak' });
      return;
    }
    const result = requestWeeklyCampaignAdvance(
      streak,
      weeklyRun.graph,
      request.nodeId,
      Date.now()
    );
    if (result.kind === 'advanced') {
      persistWeeklyCampaignStreak(result.state);
      setWeeklyCampaignConfirmation(null);
      launchCampaignFromMap({ ...request, kind: 'weekly-streak' });
      return;
    }
    if (result.kind === 'confirmation-required') {
      // The Weekly Run no longer offers free route selection, so reaching this
      // branch means the requested node would abandon the live run. Say so
      // rather than dropping the launch on the floor.
      setCampaignMapStatus('launch-error');
      setCampaignMapError(result.confirmation.message);
      openCampaignMapRef.current();
      return;
    }
    setCampaignMapStatus('launch-error');
    setCampaignMapError(`Weekly route blocked: ${result.reason.replace(/-/g, ' ')}.`);
    openCampaignMapRef.current();
  }, [persistWeeklyCampaignStreak]);
  selectWeeklyCampaignMissionFromMapRef.current = selectWeeklyCampaignMissionFromMap;


  const endWeeklyCampaignStreak = useCallback(() => {
    const streak = weeklySquadStateRef.current.weeklyCampaignStreak;
    if (!streak || streak.finalization.status !== 'active') return;
    // Leaving is a forfeit, not a score-finalization path. The attempt remains
    // consumed, but none of its score, receipt, rewards, or leaderboard UI is
    // saved. A backgrounded/closed tab is different: its active streak remains
    // resumable because browsers cannot reliably distinguish that from a crash.
    persistWeeklyCampaignStreak(finalizeWeeklyCampaignDeliberateEnd(streak, Date.now()));
    resetGame();
  }, [persistWeeklyCampaignStreak]);

  const launchCampaignBranchFromMap = (request: CampaignMapBranchLaunchRequest) => {
    setCampaignMapStatus('launch-pending');
    setCampaignMapError('');
    clearCampaignMapRoute();
    setCampaignMapOpen(false);
    void launchGame(null, 'challenge', 'standard', null, request);
  };

  const launchCampaignLabFromMap = (request: CampaignLabLaunchRequest) => {
    if (!founderAuthorizationRef.current) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError('Campaign Lab launch rejected: connect the authorized founder wallet.');
      return;
    }
    const mission = getCampaignMissionById(request.missionId);
    if (!mission) return;
    const normalizedRequest: CampaignLabLaunchRequest = {
      ...request,
      waveId: mission.waveIds.includes(request.waveId) ? request.waveId : mission.waveIds[0]
    };
    campaignLabActiveRequestRef.current = normalizedRequest;
    setCampaignLabShipId(parsePlayerShipId(normalizedRequest.shipId) ?? usableShipId);
    setCampaignLabSupportId(normalizedRequest.supportId ?? 'none');
    setCampaignLabRightSupportId(normalizedRequest.rightSupportId ?? 'none');
    setCampaignLabPreset(normalizedRequest.preset);
    setCampaignLabUpgradeLevels({ ...normalizedRequest.upgradeLevels });
    setCampaignLabMissionId(normalizedRequest.missionId);
    setCampaignLabWaveId(normalizedRequest.waveId);
    setCampaignMapStatus('launch-pending');
    setCampaignMapError('');
    clearCampaignMapRoute();
    setCampaignMapOpen(false);
    void launchGame(null, 'challenge', 'standard', normalizedRequest, null, normalizedRequest);
  };

  useEffect(() => {
    const syncCampaignMapRoute = () => {
      const requested = new URLSearchParams(window.location.search).get('view') === 'campaign-map';
      if (requested) {
        openCampaignMapRef.current();
      } else {
        setCampaignMapOpen(false);
        setCampaignMapStatus('ready');
        setCampaignMapError('');
        setCampaignMapUnlockingBranchId(null);
      }
    };
    syncCampaignMapRoute();
    window.addEventListener('popstate', syncCampaignMapRoute);
    return () => window.removeEventListener('popstate', syncCampaignMapRoute);
  }, []);

  const applyDeveloperCampaignCompletion = useCallback((missionId: string, waveId: string, stageComplete: boolean) => {
    if (!founderAuthorizationRef.current) return;
    updatePermanentSquadState((current) => {
      const result = applyCampaignCompletion(current.campaignProgress, {
        resultId: `campaign-dev:${missionId}:${waveId}:${Date.now()}`,
        playerId: current.profileId,
        campaignId: DEFAULT_GAME_CAMPAIGN.id,
        campaignRevision: DEFAULT_GAME_CAMPAIGN.revision,
        missionId,
        waveId,
        stageComplete,
        score: 999_999,
        coinsCollected: 999,
        damageTaken: 0,
        elapsedSeconds: 1
      });
      let next: PermanentSquadState = {
        ...current,
        campaignProgress: result.progress,
        updatedAt: new Date().toISOString()
      };
      const mission = getCampaignMissionById(missionId);
      if (stageComplete && mission?.bossEventId) {
        next = recordBossVictory(next, mission.bossEventId);
      }
      return next;
    });
  }, [updatePermanentSquadState]);

  const previewDeveloperCampaignResult = useCallback((missionId: string) => {
    if (!founderAuthorizationRef.current) return;
    const mission = getCampaignMissionById(missionId);
    const waveId = mission?.waveIds.at(-1);
    const waveIndex = waveId ? mission?.waveIds.indexOf(waveId) ?? -1 : -1;
    const wave = mission?.waves[waveIndex];
    if (!mission || !wave || waveIndex < 0) return;
    const previewId = `campaign-dev-preview:${mission.id}:${wave.id}:${Date.now()}`;
    const completion = applyCampaignCompletion(
      unlockAllCampaignMissions(createCampaignProgress()),
      {
        resultId: previewId,
        playerId: 'campaign-dev-preview',
        campaignId: DEFAULT_GAME_CAMPAIGN.id,
        campaignRevision: DEFAULT_GAME_CAMPAIGN.revision,
        missionId: mission.id,
        waveId: wave.id,
        stageComplete: true,
        score: 8_750,
        coinsCollected: 18,
        damageTaken: 0,
        elapsedSeconds: 42
      }
    );
    const collectedGrant = {
      id: `${previewId}:collected`,
      label: 'Collected Tokens',
      amount: 18,
      kind: 'wave' as const,
      oneTime: false
    };
    const grants = [collectedGrant, ...completion.settlement.grants];
    const nextMission = mission.nextMissionId ? getCampaignMissionById(mission.nextMissionId) : null;
    const summary: WaveVictorySummary = {
      id: previewId,
      campaignId: DEFAULT_GAME_CAMPAIGN.id,
      campaignRevision: DEFAULT_GAME_CAMPAIGN.revision,
      levelId: mission.id,
      waveId: wave.id,
      waveNumber: wave.number,
      waveTotal: mission.waveIds.length,
      stageComplete: true,
      bossEncounterId: mission.bossEventId,
      stage: mission.number,
      stageName: mission.name,
      finalWaveName: wave.name,
      scoreEarned: 4_200,
      totalScore: 8_750,
      enemiesDefeated: 36,
      regularEnemyKills: 36,
      eliteKills: 0,
      miniBossKills: 0,
      majorBossKills: 0,
      coinsCollected: 18,
      waveCoinsCollected: 18,
      damageTaken: 0,
      elapsedSeconds: 42,
      remainingLives: 3,
      nextLevelId: nextMission?.id ?? null,
      nextWaveId: nextMission?.waveIds[0] ?? null,
      nextWaveNumber: nextMission ? 1 : null,
      nextStage: nextMission?.number ?? mission.number,
      hasNextStage: Boolean(nextMission),
      campaignComplete: !nextMission
    };
    campaignResultPreviewRef.current = true;
    setActiveRunMode('campaign');
    setActiveCampaignLaunch({ missionId: mission.id, waveId: wave.id, kind: 'mission' });
    setCampaignResultPresentation({
      summaryId: summary.id,
      settlement: {
        ...completion.settlement,
        grants,
        coinsAwarded: grants.reduce((total, grant) => total + grant.amount, 0)
      },
      collectedCoins: 18,
      newlyAffordableUpgrade: null
    });
    setWaveVictorySummary(summary);
    clearCampaignMapRoute();
    setCampaignMapOpen(false);
    setCampaignMapStatus('ready');
    setOwnerFrameFrozen(false);
    setGameState(GameState.WAVE_COMPLETE);
  }, []);

  const campaignMapDeveloperControls = useMemo<CampaignMapDeveloperControls | null>(() => {
    if (!isOwnerWallet) return null;
    const founderAuthorization = {
      walletAddress: activeWalletAddress,
      founderWalletAddresses: [DONATION_CONFIG.RECIPIENT_ADDRESS]
    };
    const commitFounderBranchAction = (
      branchId: string,
      action: 'unlock' | 'lock' | 'reset-completion'
    ) => {
      if (!founderAuthorizationRef.current) return null;
      const current = permanentSquadStateRef.current;
      const result = applyFounderCampaignBranchAction(
        current.campaignProgress.branchProgress,
        founderAuthorization,
        action,
        branchId,
        CAMPAIGN_BRANCH_DEFINITIONS
      );
      if (!result.authorized) return null;
      const next: PermanentSquadState = {
        ...current,
        campaignProgress: {
          ...current.campaignProgress,
          branchProgress: result.progress
        },
        updatedAt: new Date().toISOString()
      };
      permanentSquadStateRef.current = next;
      savePermanentSquadState(next);
      setPermanentSquadState(next);
      return next;
    };
    const simulateFounderBranchOutcome = (branchId: string, outcome: 'failed' | 'success') => {
      if (!founderAuthorizationRef.current) return;
      const branch = getCampaignBranchDefinition(DEFAULT_GAME_CAMPAIGN, branchId);
      const unlocked = commitFounderBranchAction(branchId, 'unlock');
      if (!branch || !unlocked) return;
      const runtimeOptions = {
        spawnSeed: campaignBranchSpawnSeed,
        valueMultiplier: campaignBranchValueMultiplier
      };
      const verified: CampaignBranchVerifiedResult | null = isPresentDropBranchDefinition(branch)
        ? {
            kind: 'present-drop',
            ...verifyPresentDropRuntimeResult(branch, {
              destroyed: { standard: 999, armored: 999, fast: 999, golden: 999 },
              coinsCollected: 999_999
            }, runtimeOptions)
          }
        : isCombatBranchDefinition(branch)
          ? {
              kind: 'combat',
              ...verifyCampaignCombatBranchRuntimeResult(branch, {
                stageComplete: outcome === 'success',
                objectiveUnitsCompleted: branch.missionDefinition.events.length
              }, runtimeOptions)
            }
          : null;
      if (!verified) {
        setCampaignMapError(`Founder simulation rejected: unsupported branch type ${String(branch.missionType)}.`);
        return;
      }
      const attemptId = `founder-branch-${outcome}:${branchId}:${Date.now()}`;
      const settlement = settleCampaignBranchAttempt(
        unlocked.campaignProgress.branchProgress,
        {
          branchId,
          attemptId,
          playerId: activeProfileId,
          outcome,
          verifiedDestroyedByType: outcome === 'success' && verified.kind === 'present-drop'
            ? verified.destroyed
            : null,
          verifiedPresentsDestroyed: outcome === 'success' && verified.kind === 'present-drop'
            ? verified.destroyedTotal
            : 0,
          verifiedCoinsAwarded: outcome === 'success' ? verified.totalCoins : 0,
          rewardReceiptId: outcome === 'success'
            ? `campaign-branch:${activeProfileId}:${branchId}:reward:v1`
            : null,
          completedAt: new Date().toISOString()
        },
        CAMPAIGN_BRANCH_DEFINITIONS
      );
      if (!settlement.accepted) {
        setCampaignMapError(settlement.duplicate
          ? 'Duplicate protection verified: the reward was rejected and 0 Tokens were added.'
          : `Founder simulation rejected: ${settlement.reason}.`);
        return;
      }
      const credit = creditCampaignRewardGrants(
        weeklySquadStateRef.current,
        settlement.grant ? [settlement.grant] : []
      );
      const nextPermanent: PermanentSquadState = {
        ...unlocked,
        campaignProgress: {
          ...unlocked.campaignProgress,
          branchProgress: settlement.progress
        },
        updatedAt: new Date().toISOString()
      };
      const resultId = `founder-branch-simulation:${activeProfileId}:${attemptId}`;
      commitCampaignSquadSettlement({
        resultId,
        weeklyState: credit.state,
        permanentState: nextPermanent
      });
      weeklySquadStateRef.current = credit.state;
      permanentSquadStateRef.current = nextPermanent;
      saveWeeklySquadState(credit.state);
      savePermanentSquadState(nextPermanent);
      setWeeklySquadState(credit.state);
      setPermanentSquadState(nextPermanent);
      if (credit.creditedAmount > 0) {
        setStats((current) => ({ ...current, totalCoins: current.totalCoins + credit.creditedAmount }));
      }
      setCampaignMapError(outcome === 'success'
        ? `Founder success simulated: ${credit.creditedAmount} Tokens settled once.`
        : 'Founder failure simulated: 0 Tokens settled and retry remains available.');
    };
    const buildCampaignLabRequest = (
      missionId: string,
      waveId?: string
    ): CampaignLabLaunchRequest | null => {
      const mission = getCampaignMissionById(missionId);
      if (!mission) return null;
      return {
        missionId: mission.id,
        waveId: waveId && mission.waveIds.includes(waveId) ? waveId : mission.waveIds[0],
        kind: 'mission',
        sectorId: mission.sectorId,
        shipId: campaignLabShipId,
        supportId: campaignLabSupportId,
        rightSupportId: campaignLabRightSupportId,
        preset: campaignLabPreset,
        upgradeLevels: { ...campaignLabUpgradeLevels }
      };
    };
    const launchCampaignLabRole = (
      role: 'elite-checkpoint' | 'major-boss',
      useFinalWave: boolean
    ) => {
      if (!founderAuthorizationRef.current) return;
      const selectedMission = getCampaignMissionById(campaignLabMissionId) ?? CAMPAIGN_MISSIONS[0];
      const target = CAMPAIGN_MISSIONS.find((mission) => (
        mission.sectorId === selectedMission?.sectorId && mission.missionRole === role
      ));
      if (!target) return;
      const request = buildCampaignLabRequest(
        target.id,
        useFinalWave ? target.waveIds.at(-1) : target.waveIds[0]
      );
      if (request) launchCampaignLabFromMap(request);
    };
    const campaignLabSupportLevel = Math.max(
      1,
      Math.min(MINI_SHIP_MAX_LEVEL, Math.floor(campaignLabUpgradeLevels.supportLevel ?? 1))
    );
    const campaignLabPowerSupportIds = [campaignLabSupportId, campaignLabRightSupportId]
      .filter((id, index, ids): id is MiniShipId => (
        id !== 'none'
        && ids.indexOf(id) === index
        && MINI_SHIP_CATALOG.some((ship) => ship.id === id)
      ));
    const campaignLabLoadoutPower = calculateSquadPowerRating(
      {
        fireRate: Math.max(0, Math.min(
          MAIN_SHIP_FIRE_RATE_MAX_LEVEL,
          Math.floor(campaignLabUpgradeLevels.fireRate ?? 0)
        )),
        speed: Math.max(0, Math.min(7, Math.floor(campaignLabUpgradeLevels.speed ?? 0))),
        ability: Math.max(0, Math.min(MAIN_SHIP_ABILITY_MAX_LEVEL, Math.floor(campaignLabUpgradeLevels.ability ?? 0))),
        startingHearts: Math.max(0, Math.min(7, Math.floor(campaignLabUpgradeLevels.startingHearts ?? 0)))
      },
      campaignLabPowerSupportIds.map((id) => ({ id, level: campaignLabSupportLevel }))
    );
    return {
      enabled: true,
      onUnlockAll: () => {
        if (!founderAuthorizationRef.current) return;
        updatePermanentSquadState((current) => ({
          ...current,
          campaignProgress: unlockAllCampaignMissions(current.campaignProgress),
          updatedAt: new Date().toISOString()
        }));
      },
      onCompleteMission: (missionId) => {
        if (!founderAuthorizationRef.current) return;
        const mission = getCampaignMissionById(missionId);
        const finalWaveId = mission?.waveIds.at(-1);
        if (finalWaveId) applyDeveloperCampaignCompletion(missionId, finalWaveId, true);
      },
      onResetProgress: () => {
        if (!founderAuthorizationRef.current) return;
        updatePermanentSquadState((current) => ({
          ...current,
          campaignProgress: createCampaignProgress(),
          updatedAt: new Date().toISOString()
        }));
      },
      onResetStars: () => {
        if (!founderAuthorizationRef.current) return;
        updatePermanentSquadState((current) => ({
          ...current,
          campaignProgress: resetCampaignStars(current.campaignProgress),
          updatedAt: new Date().toISOString()
        }));
      },
      onPreviewLocked: () => {
        if (!founderAuthorizationRef.current) return;
      },
      onPreviewNew: (missionId) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignMapNewMissionIds([missionId]);
        setCampaignMapFocusMissionId(missionId);
      },
      onPreviewResult: previewDeveloperCampaignResult,
      onUnlockBranch: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        commitFounderBranchAction(branchId, 'unlock');
        setCampaignMapError('Founder test: branch unlocked.');
      },
      onLockBranch: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        commitFounderBranchAction(branchId, 'lock');
        setCampaignMapError('Founder test: branch locked.');
      },
      onGrantThreeStars: (missionId) => {
        if (!founderAuthorizationRef.current) return;
        const mission = getCampaignMissionById(missionId);
        const finalWaveId = mission?.waveIds.at(-1);
        if (finalWaveId) applyDeveloperCampaignCompletion(missionId, finalWaveId, true);
      },
      onResetBranch: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        commitFounderBranchAction(branchId, 'reset-completion');
        setCampaignMapError('Founder test: branch completion reset.');
      },
      onPreviewBranch: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        const branch = getCampaignBranchDefinition(DEFAULT_GAME_CAMPAIGN, branchId);
        if (!branch || !commitFounderBranchAction(branchId, 'unlock')) return;
        clearCampaignMapRoute();
        setCampaignMapOpen(false);
        void launchGame(null, 'challenge', 'standard', null, {
          branchId: branch.branchId,
          sourceMissionId: branch.sourceMissionId,
          missionDefinitionId: branch.missionDefinitionId,
          kind: 'branch'
        });
      },
      onSimulateBranchFailure: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        simulateFounderBranchOutcome(branchId, 'failed');
      },
      onSimulateBranchSuccess: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        simulateFounderBranchOutcome(branchId, 'success');
      },
      onVerifyDuplicateReward: (branchId) => {
        if (!founderAuthorizationRef.current) return;
        const branch = getCampaignBranchDefinition(DEFAULT_GAME_CAMPAIGN, branchId);
        if (!branch) return;
        const unlocked = applyFounderCampaignBranchAction(
          permanentSquadStateRef.current.campaignProgress.branchProgress,
          founderAuthorization,
          'unlock',
          branchId,
          CAMPAIGN_BRANCH_DEFINITIONS
        ).progress;
        const receiptId = `campaign-branch:${activeProfileId}:${branchId}:founder-duplicate-proof`;
        const first = settleCampaignBranchAttempt(unlocked, {
          branchId,
          attemptId: `founder-duplicate-proof:first:${branchId}`,
          playerId: activeProfileId,
          outcome: 'success',
          verifiedPresentsDestroyed: 1,
          verifiedCoinsAwarded: branch.completionReward.totalMinimumCoins,
          rewardReceiptId: receiptId,
          completedAt: new Date().toISOString()
        }, CAMPAIGN_BRANCH_DEFINITIONS);
        const duplicate = settleCampaignBranchAttempt(first.progress, {
          branchId,
          attemptId: `founder-duplicate-proof:second:${branchId}`,
          playerId: activeProfileId,
          outcome: 'success',
          verifiedPresentsDestroyed: 999,
          verifiedCoinsAwarded: 999_999,
          rewardReceiptId: receiptId,
          completedAt: new Date().toISOString()
        }, CAMPAIGN_BRANCH_DEFINITIONS);
        setCampaignMapError(
          duplicate.duplicate && duplicate.coinsAwarded === 0
            ? 'Duplicate protection verified: second settlement awarded 0 Tokens.'
            : 'Duplicate protection check failed.'
        );
      },
      spawnSeed: campaignBranchSpawnSeed,
      valueMultiplier: campaignBranchValueMultiplier,
      onSpawnSeedChange: (seed) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignBranchSpawnSeed(Math.max(0, Math.min(9_999, Math.floor(seed || 0))));
      },
      onValueMultiplierChange: (multiplier) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignBranchValueMultiplier(
          Math.max(0.25, Math.min(5, Number.isFinite(multiplier) ? multiplier : 1))
        );
      },
      shipOptions: Object.values(PLAYER_SHIPS).map((ship) => ({
        id: ship.id,
        label: ship.name
      })),
      supportOptions: [
        { id: 'none', label: 'No support ship' },
        ...MINI_SHIP_CATALOG.map((ship) => ({
          id: ship.id,
          label: `${ship.name} / ${ship.role} / ${getCampaignSupportTagsForMiniShip(ship.id).join(', ')}`
        }))
      ],
      upgradeTracks: [
        ...MAIN_SHIP_UPGRADES.map((upgrade) => ({
          id: upgrade.id,
          label: upgrade.name,
          level: campaignLabUpgradeLevels[upgrade.id] ?? 0,
          minLevel: 0,
          maxLevel: upgrade.costs.length
        })),
        {
          id: 'supportLevel',
          label: 'Support level',
          level: campaignLabUpgradeLevels.supportLevel ?? 1,
          minLevel: 1,
          maxLevel: MINI_SHIP_MAX_LEVEL
        }
      ],
      selectedShipId: campaignLabShipId,
      selectedSupportId: campaignLabSupportId,
      selectedRightSupportId: campaignLabRightSupportId,
      loadoutPower: campaignLabLoadoutPower,
      selectedPreset: campaignLabPreset,
      loopFormation: campaignLabLoopFormation,
      telemetry: {
        ...(campaignLabTelemetry ?? {}),
        weeklyPointsEarned:
          weeklySquadStateRef.current.weeklyCampaignStreak?.score.totalPoints ?? 0
      },
      onSelectSector: (sectorId) => {
        if (!founderAuthorizationRef.current) return;
        const mission = CAMPAIGN_MISSIONS.find((candidate) => candidate.sectorId === sectorId);
        if (!mission) return;
        setCampaignLabMissionId(mission.id);
        setCampaignLabWaveId(mission.waveIds[0]);
      },
      onSelectMission: (missionId) => {
        if (!founderAuthorizationRef.current) return;
        const mission = getCampaignMissionById(missionId);
        if (!mission) return;
        setCampaignLabMissionId(mission.id);
        setCampaignLabWaveId(mission.waveIds[0]);
      },
      onSelectWave: (missionId, waveId) => {
        if (!founderAuthorizationRef.current) return;
        const mission = getCampaignMissionById(missionId);
        if (!mission?.waveIds.includes(waveId)) return;
        setCampaignLabMissionId(missionId);
        setCampaignLabWaveId(waveId);
      },
      onSelectShip: (shipId) => {
        if (!founderAuthorizationRef.current) return;
        const parsed = parsePlayerShipId(shipId);
        if (parsed) setCampaignLabShipId(parsed);
      },
      onSelectSupport: (supportId) => {
        if (!founderAuthorizationRef.current) return;
        if (supportId === 'none' || MINI_SHIP_CATALOG.some((ship) => ship.id === supportId)) {
          setCampaignLabSupportId(supportId);
          if (supportId !== 'none' && supportId === campaignLabRightSupportId) {
            setCampaignLabRightSupportId('none');
          }
        }
      },
      onSelectRightSupport: (supportId) => {
        if (!founderAuthorizationRef.current) return;
        if (supportId === 'none' || MINI_SHIP_CATALOG.some((ship) => ship.id === supportId)) {
          setCampaignLabRightSupportId(supportId);
          if (supportId !== 'none' && supportId === campaignLabSupportId) {
            setCampaignLabSupportId('none');
          }
        }
      },
      onSetUpgradeLevel: (upgradeId, level) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignLabUpgradeLevels((current) => ({
          ...current,
          [upgradeId]: Math.max(0, Math.floor(Number(level) || 0))
        }));
      },
      onApplyLoadoutPreset: (preset) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignLabPreset(preset);
        const selectedMission = getCampaignMissionById(campaignLabMissionId);
        const recommendedSupports = getCampaignRecommendedSupportIds(
          selectedMission?.recommendedSupportTags ?? [],
          2
        );
        setCampaignLabSupportId(preset === 'low-power' ? 'none' : recommendedSupports[0] ?? 'none');
        setCampaignLabRightSupportId(preset === 'upgraded' ? recommendedSupports[1] ?? 'none' : 'none');
        setCampaignLabUpgradeLevels(preset === 'low-power'
          ? { fireRate: 0, speed: 0, startingHearts: 0, supportLevel: 1 }
          : preset === 'upgraded'
            ? { fireRate: MAIN_SHIP_FIRE_RATE_MAX_LEVEL, speed: 7, startingHearts: 7, supportLevel: MINI_SHIP_MAX_LEVEL }
            : { fireRate: 7, speed: 3, startingHearts: 1, supportLevel: 2 });
      },
      onLaunchSelectedMission: (request) => {
        if (!founderAuthorizationRef.current) return;
        launchCampaignLabFromMap(request);
      },
      onStartWeeklyStreak: (request) => {
        if (!founderAuthorizationRef.current) return;
        startWeeklyCampaignFromMap(request);
      },
      onSimulateRouteChoice: (sourceNodeId, targetNodeId) => {
        if (!founderAuthorizationRef.current) return;
        const activeStreak = weeklySquadStateRef.current.weeklyCampaignStreak;
        if (activeStreak?.finalization.status === 'active') {
          const targetNode = weeklyRun.graph.nodeById.get(targetNodeId);
          const targetMission = targetNode
            ? getCampaignMissionById(targetNode.missionDefinitionId)
            : null;
          const waveId = targetMission?.waveIds[0];
          if (!targetNode || !targetMission || !waveId) {
            setCampaignMapError('Campaign Lab route simulation rejected: unknown target node.');
            return;
          }
          selectWeeklyCampaignMissionFromMap({
            nodeId: targetNode.nodeId,
            missionId: targetMission.id,
            waveId,
            kind: 'weekly-streak'
          });
          return;
        }
        const result = selectCampaignRoute(
          permanentSquadStateRef.current.campaignProgress,
          sourceNodeId,
          targetNodeId
        );
        if (!result.accepted) {
          setCampaignMapError(`Campaign Lab route simulation rejected: ${result.reason.replace(/-/g, ' ')}.`);
          return;
        }
        updatePermanentSquadState((current) => ({
          ...current,
          campaignProgress: result.progress,
          updatedAt: new Date().toISOString()
        }));
        setCampaignMapError(`Campaign Lab route committed: ${sourceNodeId} → ${targetNodeId}.`);
      },
      onSimulateBackwardSelection: (targetNodeId) => {
        if (!founderAuthorizationRef.current) return;
        const activeStreak = weeklySquadStateRef.current.weeklyCampaignStreak;
        if (!activeStreak || activeStreak.finalization.status !== 'active') {
          setCampaignMapError('Campaign Lab backward simulation requires an active Weekly Streak.');
          return;
        }
        const targetNode = weeklyRun.graph.nodeById.get(targetNodeId);
        const targetMission = targetNode
          ? getCampaignMissionById(targetNode.missionDefinitionId)
          : null;
        const waveId = targetMission?.waveIds[0];
        if (!targetNode || !targetMission || !waveId) {
          setCampaignMapError('Campaign Lab backward simulation rejected: unknown target node.');
          return;
        }
        selectWeeklyCampaignMissionFromMap({
          nodeId: targetNode.nodeId,
          missionId: targetMission.id,
          waveId,
          kind: 'weekly-streak'
        });
      },
      onPreviewAuthenticationFlow: (flow) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignMapError(flow === 'guest'
          ? 'Authentication preview: guest play uses the local Pilot profile and requests no wallet signature.'
          : `Authentication preview: wallet profile status is ${walletProfileStatus}; a matching cached session is reused before any signature request.`);
      },
      onRestartFormation: () => {
        if (!founderAuthorizationRef.current) return;
        const request = campaignLabActiveRequestRef.current
          ?? buildCampaignLabRequest(campaignLabMissionId, campaignLabWaveId);
        if (request) launchCampaignLabFromMap(request);
      },
      onLoopFormationChange: (enabled) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignLabLoopFormation(Boolean(enabled));
      },
      onSkipToMiniBoss: () => launchCampaignLabRole('elite-checkpoint', true),
      onSkipToMajorBoss: () => launchCampaignLabRole('major-boss', false),
      onPreviewNodeState: (missionId, state) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignMapError(`Campaign Lab preview: ${missionId} is shown as ${state}.`);
      },
      onPreviewBranchState: (branchId, state) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignMapError(`Campaign Lab preview: ${branchId} is shown as ${state}.`);
      },
      onPreviewStarClaim: (missionId, starNumber) => {
        if (!founderAuthorizationRef.current) return;
        setCampaignMapError(`Campaign Lab: previewing Star ${starNumber} settlement.`);
        previewDeveloperCampaignResult(missionId);
      },
      onPreviewRewardClaim: (missionId, rewardType) => {
        if (!founderAuthorizationRef.current) return;
        if (rewardType === 'wave-clear') {
          setCampaignMapError('Campaign Lab: internal Waves have no standalone result or saved reward.');
          return;
        }
        setCampaignMapError(`Campaign Lab: previewing ${rewardType} reward settlement.`);
        previewDeveloperCampaignResult(missionId);
      }
    };
  }, [
    activeProfileId,
    activeWalletAddress,
    applyDeveloperCampaignCompletion,
    campaignLabLoopFormation,
    campaignLabMissionId,
    campaignLabPreset,
    campaignLabShipId,
    campaignLabRightSupportId,
    campaignLabSupportId,
    campaignLabTelemetry,
    campaignLabUpgradeLevels,
    campaignLabWaveId,
    campaignBranchSpawnSeed,
    campaignBranchValueMultiplier,
    isOwnerWallet,
    launchCampaignLabFromMap,
    launchGame,
    previewDeveloperCampaignResult,
    selectWeeklyCampaignMissionFromMap,
    startWeeklyCampaignFromMap,
    walletProfileStatus,
    updatePermanentSquadState
  ]);

  const markCampaignSettlementWalletDirty = useCallback((
    nextWeeklyState: WeeklySquadState,
    nextPermanentState: PermanentSquadState
  ) => {
    if (!activeWalletAddress || isOwnerWallet) return;
    const normalizedAddress = activeWalletAddress.toLowerCase();
    const expectedProfileId = getWalletProfileId(normalizedAddress);
    if (
      nextWeeklyState.profileId !== expectedProfileId
      || nextPermanentState.profileId !== expectedProfileId
      || activeProfileId !== expectedProfileId
    ) return;
    const snapshot: WalletProfileSnapshot = {
      stats: {
        highScore: stats.highScore,
        totalCoins: stats.totalCoins,
        playerName: playerNameInput
      },
      weeklyState: nextWeeklyState,
      permanentState: {
        ...nextPermanentState,
        mintedMiniShips: []
      },
      selectedShipId
    };
    const currentDirty = readWalletProfileDirty(normalizedAddress);
    const comparisonSnapshot = currentDirty?.snapshot
      ?? walletProfileSyncedSnapshotRef.current
      ?? walletProfileLocalBaselineRef.current;
    if (comparisonSnapshot && walletProfileSnapshotsEqual(snapshot, comparisonSnapshot)) return;
    markWalletProfileDirty({
      address: normalizedAddress,
      expectedRevision: walletProfileRevisionRef.current,
      baseSnapshot: walletProfileSyncedSnapshotRef.current,
      snapshot
    });
  }, [
    activeProfileId,
    activeWalletAddress,
    isOwnerWallet,
    playerNameInput,
    selectedShipId,
    stats.highScore,
    stats.totalCoins
  ]);

  const selectCampaignRouteFromMap = useCallback((request: CampaignMapRouteSelectionRequest) => {
    const current = permanentSquadStateRef.current;
    const selection = selectCampaignRoute(
      current.campaignProgress,
      request.sourceNodeId,
      request.targetNodeId,
      DEFAULT_GAME_CAMPAIGN
    );
    if (!selection.accepted) {
      setCampaignMapStatus('launch-error');
      setCampaignMapError(`That route is no longer available (${selection.reason.replace(/-/g, ' ')}).`);
      return;
    }
    const nextPermanent: PermanentSquadState = {
      ...current,
      campaignProgress: selection.progress,
      updatedAt: new Date().toISOString()
    };
    permanentSquadStateRef.current = nextPermanent;
    savePermanentSquadState(nextPermanent);
    setPermanentSquadState(nextPermanent);
    markCampaignSettlementWalletDirty(weeklySquadStateRef.current, nextPermanent);
    launchCampaignFromMap({
      missionId: request.missionId,
      waveId: request.waveId,
      kind: 'mission'
    });
  }, [launchCampaignFromMap, markCampaignSettlementWalletDirty]);

  const settleCampaignBranchOutcome = useCallback(async (
    outcome: 'failed' | 'interrupted' | 'success',
    summary?: WaveVictorySummary | null
  ) => {
    const branch = activeCampaignBranch;
    if (!branch || campaignBranchAttemptSettledRef.current) return null;
    const attemptId = campaignAttemptIdRef.current || `branch-${gameId}`;
    const runtimeOptions = {
      spawnSeed: isOwnerWallet ? campaignBranchSpawnSeed : 0,
      valueMultiplier: isOwnerWallet ? campaignBranchValueMultiplier : 1
    };
    const verified: CampaignBranchVerifiedResult = isPresentDropBranchDefinition(branch)
      ? {
          kind: 'present-drop',
          ...verifyPresentDropRuntimeResult(branch, {
            destroyed: summary?.presentDrop?.destroyed,
            coinsCollected: outcome === 'success' ? summary?.waveCoinsCollected : 0
          }, runtimeOptions)
        }
      : isCombatBranchDefinition(branch)
        ? {
            kind: 'combat',
            ...verifyCampaignCombatBranchRuntimeResult(branch, {
              stageComplete: outcome === 'success' && summary?.stageComplete === true,
              objectiveUnitsCompleted: summary?.enemiesDefeated ?? 0
            }, runtimeOptions)
          }
        : (() => {
            throw new Error(`Unsupported Campaign branch type: ${String(branch.missionType)}`);
          })();
    if (outcome === 'success' && verified.kind === 'combat' && !verified.success) {
      setCampaignMapError('The optional combat route did not reach its authored completion state. Retry safely.');
      return null;
    }
    const serverRun = campaignBranchRunRef.current;
    if (
      serverRun?.branchId === branch.branchId
      && serverRun.serverAttempt
      && serverRun.serverWalletAddress
    ) {
      const weeklyBeforeCredit = weeklySquadStateRef.current;
      campaignBranchAttemptSettledRef.current = true;
      try {
        const settlementTask = walletProfileSaveChainRef.current
          .catch(() => undefined)
          .then(async () => {
            const flushedProfile = await flushDirtyWalletProfile(serverRun.serverWalletAddress!);
            if (flushedProfile) {
              walletProfileRevisionRef.current = flushedProfile.revision;
              walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
              cacheWalletProfile(flushedProfile);
            }
            const settled = await settleWalletCampaignBranch({
              walletAddress: serverRun.serverWalletAddress!,
              attemptToken: serverRun.serverAttempt!.attemptToken,
              outcome,
              destroyedByType: outcome === 'success' && verified.kind === 'present-drop'
                ? verified.destroyed
                : undefined,
              collectedPresentCoins: outcome === 'success' && verified.kind === 'present-drop'
                ? verified.collectedPresentCoins
                : undefined,
              stageComplete: verified.kind === 'combat'
                ? outcome === 'success' && verified.success
                : undefined,
              objectiveUnitsCompleted: outcome === 'success' && verified.kind === 'combat'
                ? verified.objectiveUnitsCompleted
                : undefined
            });
            discardWalletProfileDirty(serverRun.serverWalletAddress!);
            return settled;
          });
        walletProfileSaveChainRef.current = settlementTask.then(
          () => undefined,
          () => undefined
        );
        const { profile, settlement } = await settlementTask;
        cacheWalletProfile(profile);
        let hydratedSnapshot = profile.snapshot;
        if (walletProfileAddressRef.current === serverRun.serverWalletAddress) {
          walletProfileRevisionRef.current = profile.revision;
          walletProfileSyncedSnapshotRef.current = profile.snapshot;
          hydratedSnapshot = hydrateActiveProfile({
            profileId: profile.profileId,
            snapshot: profile.snapshot,
            founderSandbox: false
          });
          walletProfileLocalBaselineRef.current = hydratedSnapshot;
          weeklySquadStateRef.current = hydratedSnapshot.weeklyState;
          permanentSquadStateRef.current = hydratedSnapshot.permanentState;
          setWalletProfileStatus('ready');
        }
        setCampaignMapError('');

        if (outcome === 'success') {
          campaignBranchCoinBaselineRef.current = null;
          const canonicalResult = isPresentDropBranchDefinition(branch)
            ? {
                kind: 'present-drop' as const,
                ...verifyPresentDropRuntimeResult(branch, {
                  destroyed: settlement.destroyedByType,
                  coinsCollected: settlement.performanceCoins
                })
              }
            : {
                kind: 'combat' as const,
                ...verifyCampaignCombatBranchRuntimeResult(branch, {
                  stageComplete: settlement.stageComplete,
                  objectiveUnitsCompleted: settlement.objectiveUnitsCompleted
                })
              };
          const newlyAffordableUpgrade = settlement.duplicate
            ? null
            : getNewlyAffordableSquadUpgrade(
                weeklyBeforeCredit,
                hydratedSnapshot.weeklyState.coins,
                usableShipId
              );
          const presentation: CampaignBranchResultPresentation = {
            ...canonicalResult,
            totalCoins: settlement.coinsAwarded,
            branchId: branch.branchId,
            branchName: branch.displayName,
            summaryId: summary?.id ?? settlement.rewardReceiptId ?? settlement.attemptId,
            duplicate: settlement.duplicate,
            newlyAffordableUpgrade
          };
          setCampaignBranchResult(presentation);
          return presentation;
        }

        const baseline = campaignBranchCoinBaselineRef.current;
        campaignBranchCoinBaselineRef.current = null;
        if (baseline !== null) {
          setStats((current) => ({ ...current, coins: 0, totalCoins: baseline }));
        }
        return null;
      } catch (error) {
        campaignBranchAttemptSettledRef.current = false;
        console.error('Campaign branch server settlement failed', error);
        setCampaignMapError(
          'The bonus result could not be verified by the wallet profile service. No provisional Tokens were kept; retry safely.'
        );
        const baseline = campaignBranchCoinBaselineRef.current;
        if (baseline !== null) {
          setStats((current) => ({ ...current, coins: 0, totalCoins: baseline }));
        }
        return null;
      }
    }

    const rewardReceiptId = outcome === 'success'
      ? `campaign-branch:${activeProfileId}:${branch.branchId}:reward:v1`
      : null;
    const currentPermanent = permanentSquadStateRef.current;
    const settlement = settleCampaignBranchAttempt(
      currentPermanent.campaignProgress.branchProgress,
      {
        branchId: branch.branchId,
        attemptId,
        playerId: activeProfileId,
        outcome,
        verifiedDestroyedByType: outcome === 'success' && verified.kind === 'present-drop'
          ? verified.destroyed
          : null,
        verifiedPresentsDestroyed: outcome === 'success'
          ? verified.kind === 'present-drop'
            ? verified.destroyedTotal
            : verified.objectiveUnitsCompleted
          : 0,
        verifiedCoinsAwarded: outcome === 'success' ? verified.totalCoins : 0,
        rewardReceiptId,
        completedAt: new Date().toISOString()
      },
      CAMPAIGN_BRANCH_DEFINITIONS
    );
    campaignBranchAttemptSettledRef.current = settlement.accepted || settlement.duplicate;
    if (!settlement.accepted && !settlement.duplicate) {
      setCampaignMapError('The bonus result could not be verified. Retry the optional route.');
      return null;
    }
    const grants = settlement.grant ? [settlement.grant] : [];
    const weeklyBeforeCredit = weeklySquadStateRef.current;
    const credit = creditCampaignRewardGrants(weeklyBeforeCredit, grants);
    const newlyAffordableUpgrade = settlement.duplicate
      ? null
      : getNewlyAffordableSquadUpgrade(weeklyBeforeCredit, credit.state.coins, usableShipId);
    const nextPermanent: PermanentSquadState = {
      ...currentPermanent,
      campaignProgress: {
        ...currentPermanent.campaignProgress,
        branchProgress: settlement.progress
      },
      lifetimeStats: outcome === 'success' && !settlement.duplicate
        ? {
            ...currentPermanent.lifetimeStats,
            coinsCollected: currentPermanent.lifetimeStats.coinsCollected + credit.creditedAmount
          }
        : currentPermanent.lifetimeStats,
      updatedAt: new Date().toISOString()
    };
    const settlementId = `campaign-branch:${activeProfileId}:${branch.branchId}:${attemptId}:${outcome}`;
    try {
      commitCampaignSquadSettlement({
        resultId: settlementId,
        weeklyState: credit.state,
        permanentState: nextPermanent
      });
    } catch (error) {
      campaignBranchAttemptSettledRef.current = false;
      console.error('Campaign branch settlement failed', error);
      setCampaignMapError('The bonus result could not be saved. Retry the optional route.');
      return null;
    }
    weeklySquadStateRef.current = credit.state;
    setWeeklySquadState(credit.state);
    permanentSquadStateRef.current = nextPermanent;
    setPermanentSquadState(nextPermanent);
    markCampaignSettlementWalletDirty(credit.state, nextPermanent);

    if (outcome === 'success') {
      const baseline = campaignBranchCoinBaselineRef.current ?? stats.totalCoins;
      campaignBranchCoinBaselineRef.current = null;
      setStats((current) => ({
        ...current,
        totalCoins: baseline + credit.creditedAmount
      }));
      const presentation: CampaignBranchResultPresentation = {
        ...verified,
        branchId: branch.branchId,
        branchName: branch.displayName,
        summaryId: summary?.id ?? settlementId,
        duplicate: settlement.duplicate,
        newlyAffordableUpgrade
      };
      setCampaignBranchResult(presentation);
      return presentation;
    }

    const baseline = campaignBranchCoinBaselineRef.current;
    if (baseline !== null) setStats((current) => ({ ...current, coins: 0, totalCoins: baseline }));
    return null;
  }, [
    activeCampaignBranch,
    activeProfileId,
    campaignBranchSpawnSeed,
    campaignBranchValueMultiplier,
    gameId,
    hydrateActiveProfile,
    isOwnerWallet,
    markCampaignSettlementWalletDirty,
    stats.totalCoins,
    usableShipId
  ]);

  const returnToCampaignMapAfterBranchAttempt = async (outcome?: 'failed' | 'interrupted') => {
    const branchId = activeCampaignBranch?.branchId ?? null;
    const sourceMissionId = activeCampaignBranch?.sourceMissionId ?? null;
    if (outcome) await settleCampaignBranchOutcome(outcome);
    openCampaignMap(sourceMissionId);
    setCampaignMapFocusBranchId(branchId);
    setCampaignMapStatus('ready');
    setCampaignMapError('');
  };

  /**
   * Advances only the persisted Weekly proof. The live GameEngine owns the
   * immediate Wave transition, so React must never pause it or command it to
   * replay the next Depth. A deterministic suffix is kept comfortably ahead
   * of the player and GameCanvas hot-swaps that suffix into the mounted engine.
   */
  const advanceWeeklyRunAfterDepth = useCallback((
    summary: WaveVictorySummary,
    scoredStreak: WeeklyCampaignStreakState
  ) => {
    if (!summary.stageComplete || scoredStreak.finalization.status !== 'active') return false;

    let runForAdvance = weeklyRun;
    const scoredNode = runForAdvance.graph.nodeById.get(scoredStreak.currentNodeId);
    if (!scoredNode || scoredNode.missionDefinitionId !== summary.levelId) return false;

    let outgoing = runForAdvance.graph.edgesBySourceNodeId.get(scoredStreak.currentNodeId) ?? [];
    if (outgoing.length === 0) {
      // This is a defensive edge extension. Normal play expands much earlier,
      // but reconstructing the graph here keeps persisted proof deterministic
      // if a very old tab reaches the end of its materialized runway.
      const extendedStageCount = runForAdvance.campaign.levels.length + WEEKLY_RUN_STAGE_CHUNK;
      runForAdvance = getWeeklyRun(weeklySquadStateRef.current.weekKey, extendedStageCount);
      setWeeklyRunStageCount((current) => Math.max(current, extendedStageCount));
      outgoing = runForAdvance.graph.edgesBySourceNodeId.get(scoredStreak.currentNodeId) ?? [];
    }
    if (outgoing.length !== 1) {
      setCampaignMapError('Weekly Run runway could not extend. This attempt has ended safely.');
      return false;
    }

    const result = requestWeeklyCampaignAdvance(
      scoredStreak,
      runForAdvance.graph,
      outgoing[0].toNodeId,
      Date.now()
    );
    if (result.kind !== 'advanced') {
      setCampaignMapError(result.kind === 'blocked'
        ? `Weekly route blocked: ${result.reason.replace(/-/g, ' ')}.`
        : result.confirmation.message);
      return false;
    }

    const nextNode = runForAdvance.graph.nodeById.get(result.state.currentNodeId);
    const nextMission = nextNode
      ? runForAdvance.campaign.levels.find((level) => level.id === nextNode.missionDefinitionId) ?? null
      : null;
    const nextWaveId = nextMission?.waves[0]?.id;
    if (!nextMission || !nextWaveId) return false;

    // Keep at least one full generation chunk beyond the cleared Depth. This
    // updates only the campaign prop; the mounted GameStage key remains stable.
    const runwayTarget = getWeeklyRunMaterializedStageCount(
      result.state.score.completedNodeCount + WEEKLY_RUN_STAGE_CHUNK
    );
    setWeeklyRunStageCount((current) => Math.max(current, runwayTarget));
    persistWeeklyCampaignStreak(result.state);
    setActiveCampaignLaunch({
      missionId: nextMission.id,
      waveId: nextWaveId,
      kind: 'weekly-streak'
    });
    weeklyRunSectorReachedRef.current = Math.max(
      weeklyRunSectorReachedRef.current,
      result.state.score.completedNodeCount + 1
    );
    weeklyRunSectorsClearedRef.current = Math.max(
      weeklyRunSectorsClearedRef.current,
      result.state.score.completedNodeCount
    );
    return true;
  }, [persistWeeklyCampaignStreak, weeklyRun]);

  const handleCampaignProgress = useCallback((summary: WaveVictorySummary) => {
    if (activeRunMode === 'weekly-streak') {
      if (!summary.stageComplete) return;
      const streak = weeklySquadStateRef.current.weeklyCampaignStreak;
      const node = streak ? weeklyRun.graph.nodeById.get(streak.currentNodeId) : null;
      const mission = weeklyRun.campaign.levels.find((level) => level.id === summary.levelId) ?? null;
      const resultId = streak
        ? `weekly:${streak.weeklyId}:${summary.id}`
        : `weekly:missing:${summary.id}`;
      if (
        !streak
        || streak.finalization.status !== 'active'
        || !node
        || node.missionDefinitionId !== summary.levelId
        || processedCampaignSummaryKeysRef.current.has(resultId)
      ) return;
      const masteryObjectives: CampaignMasteryObjectiveDefinition[] = (
        mission?.campaignProgression?.masteryObjectives ?? []
      );
      const performanceStars = masteryObjectives.length > 0
        ? masteryObjectives.filter((objective) => {
            if (objective.kind === 'complete') return true;
            if (objective.kind === 'damage-at-most') return summary.damageTaken <= objective.target;
            if (objective.kind === 'coins-at-least') return summary.coinsCollected >= objective.target;
            if (objective.kind === 'score-at-least') return summary.scoreEarned >= objective.target;
            if (objective.kind === 'time-at-most') return summary.elapsedSeconds <= objective.target;
            return false;
          }).length
        : 0;
      const parTimeSeconds = masteryObjectives.find((objective) => (
        objective.kind === 'time-at-most'
      ))?.target;
      try {
        const nextStreak = recordWeeklyCampaignNodeScore(streak, weeklyRun.graph, {
          eventId: resultId,
          nodeId: node.nodeId,
          occurredAtMs: Date.now(),
          outcome: buildWeeklyCampaignRuntimeOutcome(summary, {
            parTimeSeconds,
            performanceStars: Math.min(3, performanceStars) as 0 | 1 | 2 | 3
          })
        });
        processedCampaignSummaryKeysRef.current.add(resultId);
        persistWeeklyCampaignStreak(nextStreak);
        advanceWeeklyRunAfterDepth(summary, nextStreak);
      } catch (error) {
        console.error('Weekly Campaign score settlement failed', error);
        setCampaignMapError('Weekly Streak score could not be secured. Retry this Mission.');
      }
      return;
    }
    if (activeRunMode !== 'campaign' && activeRunMode !== 'campaign-replay') return;
    if (!summary.stageComplete) return;
    const attemptId = campaignAttemptIdRef.current || `game-${gameId}`;
    const resultId = `${activeProfileId}:${attemptId}:${summary.levelId}:${summary.waveId}`;
    if (processedCampaignSummaryKeysRef.current.has(resultId)) return;

    const currentPermanent = permanentSquadStateRef.current;
    const completion = applyCampaignCompletion(currentPermanent.campaignProgress, {
      resultId,
      playerId: activeProfileId,
      campaignId: summary.campaignId,
      campaignRevision: summary.campaignRevision,
      missionId: summary.levelId,
      waveId: summary.waveId,
      stageComplete: summary.stageComplete,
      score: summary.totalScore,
      coinsCollected: summary.coinsCollected,
      damageTaken: summary.damageTaken,
      elapsedSeconds: summary.elapsedSeconds,
      masteryEligible: summary.stageComplete && campaignRunMasteryEligibleRef.current
    });

    if (!completion.settlement.accepted && !completion.settlement.duplicate) {
      console.error('Campaign checkpoint settlement rejected', completion.settlement.reason);
      setCampaignMapError('Campaign progress could not be verified. Retry this Mission to record the clear.');
      return;
    }

    const rewardGrants = completion.settlement.duplicate
      ? []
      : completion.settlement.grants;
    const weeklyBeforeCredit = weeklySquadStateRef.current;
    const credit = creditCampaignRewardGrants(weeklyBeforeCredit, rewardGrants);
    const newlyAffordableUpgrade = completion.settlement.duplicate
      ? null
      : getNewlyAffordableSquadUpgrade(weeklyBeforeCredit, credit.state.coins, usableShipId);

    const creditedEnemies = completion.settlement.duplicate
      ? 0
      : Math.max(0, Math.floor(summary.enemiesDefeated));
    let nextPermanent: PermanentSquadState = {
      ...currentPermanent,
      campaignProgress: completion.progress,
      lifetimeStats: completion.settlement.duplicate ? currentPermanent.lifetimeStats : {
        ...currentPermanent.lifetimeStats,
        highestWave: Math.max(currentPermanent.lifetimeStats.highestWave, summary.stage),
        enemiesDefeated: currentPermanent.lifetimeStats.enemiesDefeated + creditedEnemies,
        coinsCollected: currentPermanent.lifetimeStats.coinsCollected,
        bestScore: Math.max(currentPermanent.lifetimeStats.bestScore, summary.totalScore),
        // Counted on first clear and first full mastery only, so replaying a
        // Mission cannot farm the Campaign achievements.
        campaignMissionsCleared: currentPermanent.lifetimeStats.campaignMissionsCleared
          + (completion.settlement.firstClear && summary.stageComplete ? 1 : 0),
        campaignMissionsMastered: currentPermanent.lifetimeStats.campaignMissionsMastered
          + (completion.settlement.stars >= CAMPAIGN_MISSION_MASTERY_STARS
            && completion.settlement.previousStars < CAMPAIGN_MISSION_MASTERY_STARS ? 1 : 0),
        eliteBossesDefeated: currentPermanent.lifetimeStats.eliteBossesDefeated
          + Math.max(0, Math.floor(summary.miniBossKills ?? 0))
      },
      updatedAt: new Date().toISOString()
    };
    if (!completion.settlement.duplicate && summary.stageComplete && summary.bossEncounterId) {
      nextPermanent = recordBossVictory(nextPermanent, summary.bossEncounterId);
    }

    try {
      commitCampaignSquadSettlement({
        resultId,
        weeklyState: credit.state,
        permanentState: nextPermanent
      });
    } catch (error) {
      console.error('Campaign checkpoint settlement failed', error);
      setCampaignMapError('Campaign progress could not be saved on this device. Retry the Mission to secure it.');
      return;
    }
    processedCampaignSummaryKeysRef.current.add(resultId);
    if (!completion.settlement.duplicate) {
      campaignRunCreditedEnemiesRef.current += creditedEnemies;
    }
    weeklySquadStateRef.current = credit.state;
    setWeeklySquadState(credit.state);
    permanentSquadStateRef.current = nextPermanent;
    setPermanentSquadState(nextPermanent);
    markCampaignSettlementWalletDirty(credit.state, nextPermanent);
    setCampaignResultPresentation({
      summaryId: summary.id,
      settlement: {
        ...completion.settlement,
        grants: rewardGrants,
        coinsAwarded: credit.creditedAmount
      },
      collectedCoins: 0,
      newlyAffordableUpgrade
    });
  }, [activeProfileId, activeRunMode, advanceWeeklyRunAfterDepth, gameId, markCampaignSettlementWalletDirty, persistWeeklyCampaignStreak, usableShipId, weeklyRun]);

  const finalizeCampaignCollectedCoins = useCallback((summary: WaveVictorySummary) => {
    if (activeRunMode !== 'campaign' && activeRunMode !== 'campaign-replay') return;
    const collectedCoins = Math.max(0, Math.floor(summary.coinsCollected));
    const attemptId = campaignAttemptIdRef.current || `game-${gameId}`;
    const resultId = `${activeProfileId}:${attemptId}:${summary.levelId}:${summary.waveId}`;
    const collectedGrant = {
      id: `campaign:${resultId}:collected`,
      label: 'Collected Tokens',
      amount: collectedCoins,
      kind: 'wave' as const,
      oneTime: false
    };
    const currentPermanent = permanentSquadStateRef.current;
    const metrics = finalizeCampaignCompletionMetrics(currentPermanent.campaignProgress, {
      resultId,
      playerId: activeProfileId,
      campaignId: summary.campaignId,
      campaignRevision: summary.campaignRevision,
      missionId: summary.levelId,
      waveId: summary.waveId,
      stageComplete: summary.stageComplete,
      score: summary.totalScore,
      coinsCollected: summary.coinsCollected,
      damageTaken: summary.damageTaken,
      elapsedSeconds: summary.elapsedSeconds,
      masteryEligible: summary.stageComplete && campaignRunMasteryEligibleRef.current
    });
    if (!metrics.accepted) return;
    const finalGrants = [
      ...(collectedCoins > 0 ? [collectedGrant] : []),
      ...metrics.grants
    ];
    const weeklyBeforeCredit = weeklySquadStateRef.current;
    const credit = creditCampaignRewardGrants(
      weeklyBeforeCredit,
      finalGrants
    );
    const newlyAffordableUpgrade = getNewlyAffordableSquadUpgrade(
      weeklyBeforeCredit,
      credit.state.coins,
      usableShipId
    );

    const creditedCollectedCoins = credit.creditedRewardIds.includes(collectedGrant.id)
      ? collectedCoins
      : 0;
    const nextPermanent: PermanentSquadState = {
      ...currentPermanent,
      campaignProgress: metrics.progress,
      lifetimeStats: {
        ...currentPermanent.lifetimeStats,
        coinsCollected: currentPermanent.lifetimeStats.coinsCollected + creditedCollectedCoins
      },
      updatedAt: new Date().toISOString()
    };
    try {
      commitCampaignSquadSettlement({
        resultId: `${resultId}:final`,
        weeklyState: credit.state,
        permanentState: nextPermanent
      });
    } catch (error) {
      console.error('Campaign final reward settlement failed', error);
      setCampaignMapError('Final Campaign rewards could not be saved. Return to the result to retry.');
      return;
    }
    weeklySquadStateRef.current = credit.state;
    setWeeklySquadState(credit.state);
    permanentSquadStateRef.current = nextPermanent;
    setPermanentSquadState(nextPermanent);
    markCampaignSettlementWalletDirty(credit.state, nextPermanent);

    setCampaignResultPresentation((current) => {
      if (!current || current.summaryId !== summary.id) return current;
      const creditedGrantIds = new Set(credit.creditedRewardIds);
      const creditedFinalGrants = finalGrants.filter((grant) => creditedGrantIds.has(grant.id));
      return {
        ...current,
        collectedCoins,
        newlyAffordableUpgrade: current.newlyAffordableUpgrade ?? newlyAffordableUpgrade,
        settlement: {
          ...current.settlement,
          previousStars: Math.min(current.settlement.previousStars, metrics.previousStars),
          stars: Math.max(current.settlement.stars, metrics.stars),
          newStarIds: Array.from(new Set([
            ...current.settlement.newStarIds,
            ...metrics.newStarIds
          ])),
          newBestScore: current.settlement.newBestScore || metrics.newBestScore,
          newBestTime: current.settlement.newBestTime || metrics.newBestTime,
          newBestCoins: current.settlement.newBestCoins || metrics.newBestCoins,
          grants: [...creditedFinalGrants, ...current.settlement.grants],
          coinsAwarded: current.settlement.coinsAwarded + credit.creditedAmount
        }
      };
    });
  }, [activeProfileId, activeRunMode, gameId, markCampaignSettlementWalletDirty, usableShipId]);

  const showWaveVictory = async (summary: WaveVictorySummary) => {
    if (!summary.stageComplete) {
      setWaveContinueCommand(current => ({ nonce: (current?.nonce ?? 0) + 1 }));
      setGameState(GameState.PLAYING);
      return;
    }
    // Weekly boundaries are published through onCampaignProgress while the
    // engine keeps flying. Ignore any legacy victory notification so React can
    // never advance the same retained summary twice.
    if (isWeeklyCampaignRun) {
      return;
    }
    audioService.playSound('mission_victory', 1, { pitchJitter: 0 });
    if (isBossArchiveRun) {
      setOwnerFrameFrozen(true);
      await finalizeBossArchiveFight(true, summary);
      returnToBossArchive();
      return;
    }
    if (isCampaignBranchRun) {
      const result = await settleCampaignBranchOutcome('success', summary);
      if (!result) {
        setGameState(GameState.GAMEOVER);
        return;
      }
      setOwnerFrameFrozen(false);
      setWaveVictorySummary(summary);
      setGameState(GameState.WAVE_COMPLETE);
      return;
    }
    if (isCampaignLabRun && campaignLabLoopFormation && campaignLabActiveRequestRef.current) {
      const loopRequest = campaignLabActiveRequestRef.current;
      setOwnerFrameFrozen(false);
      setWaveVictorySummary(summary);
      setGameState(GameState.WAVE_COMPLETE);
      window.setTimeout(() => {
        if (!founderAuthorizationRef.current || !campaignLabLoopFormation) return;
        launchCampaignLabFromMap(loopRequest);
      }, 650);
      return;
    }
    if (isCampaignRun) {
      finalizeCampaignCollectedCoins(summary);
    }
    if (!isCampaignRun && !isNonCompetitiveRun && summary.bossEncounterId) {
      const victoryKey = `${gameId}:${summary.id}`;
      if (!permanentBossAppliedKeysRef.current.has(victoryKey)) {
        permanentBossAppliedKeysRef.current.add(victoryKey);
        updatePermanentSquadState((current) => recordBossVictory(current, summary.bossEncounterId as string));
      }
    }
    setOwnerFrameFrozen(false);
    setWaveVictorySummary(summary);
    setGameState(GameState.WAVE_COMPLETE);
  };

  const continueAfterWaveVictory = () => {
    if (!waveVictorySummary) return;
    if (isWeeklyCampaignRun) {
      setWaveVictorySummary(null);
      return;
    }
    if (isCampaignBranchRun && activeCampaignBranch) {
      const branchId = activeCampaignBranch.branchId;
      const sourceMissionId = activeCampaignBranch.sourceMissionId;
      setWaveVictorySummary(null);
      setCampaignBranchResult(null);
      setActiveRunMode('standard');
      setActiveCampaignBranchId(null);
      campaignAttemptIdRef.current = '';
      campaignBranchRunRef.current = null;
      campaignBranchAttemptSettledRef.current = false;
      campaignBranchCoinBaselineRef.current = null;
      openCampaignMap(sourceMissionId);
      setCampaignMapFocusBranchId(branchId);
      setCampaignMapUnlockingBranchId(null);
      setCampaignMapStatus('ready');
      setCampaignMapError('');
      return;
    }
    if (campaignResultPreviewRef.current) {
      const focusMissionId = campaignResultPresentation?.settlement.newlyUnlockedMissionId
        ?? waveVictorySummary.levelId;
      campaignResultPreviewRef.current = false;
      setWaveVictorySummary(null);
      setCampaignResultPresentation(null);
      setActiveRunMode('standard');
      setActiveCampaignLaunch(null);
      setGameState(GameState.MENU);
      openCampaignMap(focusMissionId);
      return;
    }
    if (isCampaignRun) {
      const campaignProgress = permanentSquadStateRef.current.campaignProgress;
      const pendingChoice = campaignProgress.pendingRouteChoice;
      if (pendingChoice) {
        const firstOption = DEFAULT_GAME_CAMPAIGN.campaignGraph?.nodes.find((node) => (
          node.nodeId === pendingChoice.optionNodeIds[0]
        ));
        setWaveVictorySummary(null);
        setCampaignResultPresentation(null);
        setActiveRunMode('standard');
        setActiveCampaignLaunch(null);
        campaignAttemptIdRef.current = '';
        setGameState(GameState.MENU);
        openCampaignMap(firstOption?.missionDefinitionId ?? waveVictorySummary.levelId);
        setCampaignMapError('Choose one connected route to continue. The other route remains available for replay.');
        return;
      }
    }
    if (waveVictorySummary.campaignComplete || !waveVictorySummary.hasNextStage) {
      if (isCampaignRun) {
        openCampaignMap(waveVictorySummary.levelId);
        return;
      }
      setCampaignCompletedRun(true);
      setWaveVictorySummary(null);
      setGameState(GameState.GAMEOVER);
      return;
    }
    let continuationTarget: { targetLevelId: string; targetWaveId: string } | null = null;
    if (isCampaignRun && waveVictorySummary.nextLevelId) {
      const nextMission = getCampaignMissionById(waveVictorySummary.nextLevelId);
      const nextWaveId = nextMission?.waveIds[0] ?? waveVictorySummary.nextWaveId;
      if (nextMission && nextWaveId) {
        const nextKind = permanentSquadStateRef.current.campaignProgress
          .missionRecords[nextMission.id]?.completed
          ? 'replay' as const
          : 'mission' as const;
        setActiveCampaignLaunch({
          missionId: nextMission.id,
          waveId: nextWaveId,
          kind: nextKind
        });
        setActiveRunMode(nextKind === 'replay' ? 'campaign-replay' : 'campaign');
        continuationTarget = {
          targetLevelId: nextMission.id,
          targetWaveId: nextWaveId
        };
      }
    }
    setWaveContinueCommand(current => ({
      nonce: (current?.nonce ?? 0) + 1,
      ...(continuationTarget ?? {})
    }));
    setWaveVictorySummary(null);
    setGameState(GameState.PLAYING);
  };

  const completeStoryTransmission = () => {
    const completedPhase = activeStoryBeat?.phase;
    const shouldOfferFirstFlightGuide = completedPhase === 1
      && isCompetitiveCampaignRun
      && activeCampaignLaunch?.missionId === CAMPAIGN_MISSIONS[0]?.id
      && !hasCampaignClear;
    if (activeStoryBeat) {
      markStoryBeatSeenTodayForProfile(activeStoryBeat, activeProfileId);
    }
    if (shouldOfferFirstFlightGuide) {
      offerFirstFlightGuideBeforeRun(isOwnerTestRun || isOwnerWallet, activeRunMode);
    } else if (completedPhase !== undefined && !isBossArchiveRun) {
      beginRunSession(isOwnerTestRun || isOwnerWallet, activeRunMode);
    }
    setActiveStoryBeat(null);
  };

  const handleFieldUpgrade = (type: FieldUpgradeType) => {
    const bombChargeMax = stats.bombChargeMax || BASE_FLASK_CHARGE_MAX;
    const flaskCount = getFlaskProgress(stats.bombCharge || 0, bombChargeMax).storedFlasks;
    const flaskCost = getFieldUpgradeFlaskCost(stats, type);
    const config = FIELD_UPGRADE_CONFIG[type];
    const level = getFieldUpgradeLevel(stats, type);
    const isLifeUpgrade = type === 'extraLife';
    const isAtCap = isLifeUpgrade ? stats.lives >= GAME_CONFIG.MAX_LIVES : level >= config.maxLevel;

    if (flaskCount < flaskCost || isAtCap) {
      return;
    }

    audioService.playSound(isLifeUpgrade || flaskCost > 1 ? 'powerup' : 'coin');

    setStats(prev => {
      const prevChargeMax = prev.bombChargeMax || bombChargeMax;
      const prevFlaskCount = getFlaskProgress(prev.bombCharge || 0, prevChargeMax).storedFlasks;
      const prevLevel = getFieldUpgradeLevel(prev, type);
      const prevFlaskCost = getFieldUpgradeFlaskCost(prev, type);
      const prevIsAtCap = isLifeUpgrade ? prev.lives >= GAME_CONFIG.MAX_LIVES : prevLevel >= config.maxLevel;
      if (prevFlaskCount < prevFlaskCost || prevIsAtCap) {
        return prev;
      }

      const nextCharge = spendStoredFlasks(prev.bombCharge || 0, prevFlaskCost, prevChargeMax);

      if (type === 'extraLife') {
        return {
          ...prev,
          bombCharge: nextCharge,
          lives: Math.min(GAME_CONFIG.MAX_LIVES, prev.lives + 1),
          repairsCount: (prev.repairsCount || 0) + 1
        };
      }

      return {
        ...prev,
        bombCharge: nextCharge,
        upgrades: {
          ...prev.upgrades,
          [type]: prev.upgrades[type] + 1
        }
      };
    });
  };

  const jumpOwnerTestWave = (wave: number) => {
    if (!isOwnerWallet || !isOwnerTestRun) return;
    const safeWave = Math.max(1, Math.min(AUTHORED_CAMPAIGN_STAGE_COUNT, Math.floor(wave)));
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    lastStoryWaveRef.current = safeWave;
    setTestWaveCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, wave: safeWave }));
  };

  const jumpOwnerTestBoss = () => {
    if (!isOwnerWallet || !isOwnerTestRun) return;
    const safeWave = Math.max(1, Math.min(AUTHORED_CAMPAIGN_STAGE_COUNT, Math.floor(stats.wave || 1)));
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    lastStoryWaveRef.current = safeWave;
    setTestBossCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, wave: safeWave }));
  };

  const refillOwnerTestFlasks = () => {
    if (!isOwnerWallet || !isOwnerTestRun) return;
    setStats(prev => ({
      ...prev,
      bombCharge: Math.max(prev.bombCharge || 0, OWNER_TEST_FLASK_CHARGE)
    }));
    setTestFlaskCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, charge: OWNER_TEST_FLASK_CHARGE }));
  };

  const finishOwnerTestRun = () => {
    if (!isOwnerWallet || !isOwnerTestRun) return;
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    setShowTestChampionPreview(false);
    setWaveVictorySummary(null);
    setOwnerFrameFrozen(false);
    setGameState(GameState.GAMEOVER);
  };

  const requestWalletRuntimeAction = useCallback((type: 'connect' | 'switch-account' | 'disconnect') => {
    // Kick the chunk off immediately as well, so a first-ever click does not
    // have to wait on a cold network fetch before the popup can open.
    warmWalletRuntime();
    setWalletRuntimeEnabled(true);
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({ type, nonce: walletActionNonceRef.current });
  }, []);

  const connectWallet = useCallback(() => {
    walletProfileInteractiveAuthorizationRef.current = true;
    if (activeWalletAddress) {
      setWalletError('');
      setWalletProfileAuthorizationNonce((current) => current + 1);
      return;
    }

    requestWalletRuntimeAction('connect');
  }, [activeWalletAddress, requestWalletRuntimeAction]);

  const refreshRscBalance = useCallback(() => {
    if (!activeWalletAddress) {
      connectWallet();
      return;
    }
    warmWalletRuntime();
    setWalletRuntimeEnabled(true);
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({
      type: 'refresh-rsc-balance',
      nonce: walletActionNonceRef.current
    });
  }, [activeWalletAddress, connectWallet]);

  const requestRscPurchase = useCallback(async (skuId: RscPurchaseSkuId) => {
    if (isOwnerWallet) {
      if (skuId === 'right-support') {
        handleUnlockSquadSlot('right');
        return;
      }
      setWalletPurchaseStatus({
        status: 'error',
        skuId,
        error: 'This wallet receives Scicon Shooter payments. Switch to a different Base wallet to make a purchase.'
      });
      return;
    }
    if (!RSC_PURCHASE_SKUS[skuId].enabled) {
      setWalletPurchaseStatus({
        status: 'error',
        skuId,
        error: 'Token packs are coming soon while secure server-owned Token balances are completed.'
      });
      return;
    }
    setWalletPurchaseStatus({ status: 'connecting', skuId });
    if (activeWalletAddress && walletProfileStatus === 'ready') {
      const normalizedAddress = activeWalletAddress.toLowerCase();
      const flushTask = walletProfileSaveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
          if (!flushedProfile || walletProfileAddressRef.current !== normalizedAddress) return;
          walletProfileRevisionRef.current = flushedProfile.revision;
          walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
          cacheWalletProfile(flushedProfile);
        });
      walletProfileSaveChainRef.current = flushTask.then(
        () => undefined,
        () => undefined
      );
      try {
        await flushTask;
      } catch (error) {
        setWalletPurchaseStatus({
          status: 'error',
          skuId,
          error: error instanceof Error
            ? error.message
            : 'Your wallet profile could not sync before this purchase.'
        });
        return;
      }
    }

    warmWalletRuntime();
    setWalletRuntimeEnabled(true);
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({
      type: 'purchase-rsc',
      skuId,
      nonce: walletActionNonceRef.current
    });
  }, [activeWalletAddress, handleUnlockSquadSlot, isOwnerWallet, walletProfileStatus]);

  const handleWalletPurchaseSuccess = useCallback((settlement: WalletPurchaseSettlement) => {
    const normalizedAddress = settlement.profile.walletAddress.toLowerCase();
    // A first purchase can connect and authenticate the wallet inside the same
    // trusted tap. In that path the authoritative settlement may arrive one
    // render before App's wallet-profile effect has copied the new address into
    // its ref. Accept that first profile, but never hydrate a profile belonging
    // to a different wallet after an account switch.
    if (activeWalletAddress && activeWalletAddress.toLowerCase() !== normalizedAddress) return;
    walletProfileAddressRef.current = normalizedAddress;

    if (settlement.weeklyRunQuota) {
      applyWeeklyRunAttemptQuota(settlement.weeklyRunQuota, normalizedAddress);
    }

    if (
      settlement.grantsRightSupport
      && !settlement.profile.snapshot.weeklyState.unlockedSlots.right
    ) {
      setWalletError('Purchase confirmed, but its support entitlement could not be verified. Your local progress was not changed.');
      return;
    }

    let rebasedDirty: ReturnType<typeof rebaseWalletProfileDirtyAfterServerPurchase> = null;
    try {
      rebasedDirty = rebaseWalletProfileDirtyAfterServerPurchase({
        address: normalizedAddress,
        savedProfile: settlement.profile
      });
    } catch (error) {
      console.error('Wallet purchase profile merge failed:', error);
      setWalletError('Purchase confirmed, but this device could not safely merge its newest progress. Your local progress was not changed.');
      return;
    }

    cacheWalletProfile(settlement.profile);
    walletProfileRevisionRef.current = settlement.profile.revision;
    walletProfileSyncedSnapshotRef.current = settlement.profile.snapshot;
    // If gameplay changed while the transfer was open, render the purchase-
    // aware rebased snapshot. Hydrating the older server snapshot here would
    // let the normal autosave effect replace the queued local progress before
    // it flushes.
    const hydratedSnapshot = hydrateActiveProfile({
      profileId: settlement.profile.profileId,
      snapshot: rebasedDirty?.snapshot ?? settlement.profile.snapshot,
      founderSandbox: false
    });
    walletProfileLocalBaselineRef.current = hydratedSnapshot;
    weeklySquadStateRef.current = hydratedSnapshot.weeklyState;
    permanentSquadStateRef.current = hydratedSnapshot.permanentState;
    setWalletProfileStatus('ready');
    setWalletError('');

    if (rebasedDirty) {
      const flushTask = walletProfileSaveChainRef.current
        .then(async () => {
          const flushedProfile = await flushDirtyWalletProfile(normalizedAddress);
          if (!flushedProfile || walletProfileAddressRef.current !== normalizedAddress) return;
          walletProfileRevisionRef.current = flushedProfile.revision;
          walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
          cacheWalletProfile(flushedProfile);
          const flushedSnapshot = hydrateActiveProfile({
            profileId: flushedProfile.profileId,
            snapshot: flushedProfile.snapshot,
            founderSandbox: false
          });
          walletProfileLocalBaselineRef.current = flushedSnapshot;
          weeklySquadStateRef.current = flushedSnapshot.weeklyState;
          permanentSquadStateRef.current = flushedSnapshot.permanentState;
          setWalletError('');
        })
        .catch(() => {
          setWalletError('Purchase confirmed. Your newer local progress is preserved and will retry syncing.');
        });
      walletProfileSaveChainRef.current = flushTask.then(
        () => undefined,
        () => undefined
      );
    }
  }, [activeWalletAddress, applyWeeklyRunAttemptQuota, hydrateActiveProfile]);

  const persistRewardClaim = useCallback((
    nextPermanentState: PermanentSquadState,
    nextWeeklyState: WeeklySquadState
  ) => {
    const previousPermanentState = permanentSquadState;
    const previousWeeklyState = weeklySquadState;
    try {
      savePermanentSquadState(nextPermanentState);
      saveWeeklySquadState(nextWeeklyState);
    } catch {
      try {
        savePermanentSquadState(previousPermanentState);
      } catch {
        // The original in-memory state remains authoritative when storage is unavailable.
      }
      try {
        saveWeeklySquadState(previousWeeklyState);
      } catch {
        // Keep both React states unchanged so the player can retry after storage recovers.
      }
      return false;
    }

    setPermanentSquadState(nextPermanentState);
    setWeeklySquadState(nextWeeklyState);
    return true;
  }, [permanentSquadState, weeklySquadState]);

  const finalizeBossArchiveFight = useCallback(async (
    victory: boolean,
    summary: WaveVictorySummary | null = null
  ) => {
    const run = activeBossArchiveRun;
    if (!run || processedBossArchiveResultsRef.current.has(run.resultId)) return false;
    const clearTimeMs = victory && summary
      ? Math.max(1, Math.round(summary.elapsedSeconds * 1000))
      : null;
    const damageTaken = Math.max(
      0,
      summary?.damageTaken ?? bossArchiveDamageTakenRef.current
    );

    if (
      victory
      && clearTimeMs !== null
      && run.mode === 'challenge'
      && run.serverChallengeRun
      && run.serverWalletAddress
    ) {
      processedBossArchiveResultsRef.current.add(run.resultId);
      try {
        const settlementTask = walletProfileSaveChainRef.current
          .catch(() => undefined)
          .then(async () => {
            const flushedProfile = await flushDirtyWalletProfile(run.serverWalletAddress!);
            if (flushedProfile) {
              walletProfileRevisionRef.current = flushedProfile.revision;
              walletProfileSyncedSnapshotRef.current = flushedProfile.snapshot;
              cacheWalletProfile(flushedProfile);
            }
            const settled = await settleWalletBossArchiveChallenge({
              walletAddress: run.serverWalletAddress!,
              runToken: run.serverChallengeRun!.runToken,
              clearTimeMs,
              damageTaken
            });
            discardWalletProfileDirty(run.serverWalletAddress!);
            return settled;
          });
        walletProfileSaveChainRef.current = settlementTask.then(
          () => undefined,
          () => undefined
        );
        const { profile, settlement } = await settlementTask;
        cacheWalletProfile(profile);
        if (walletProfileAddressRef.current === run.serverWalletAddress) {
          walletProfileRevisionRef.current = profile.revision;
          walletProfileSyncedSnapshotRef.current = profile.snapshot;
          walletProfileLocalBaselineRef.current = hydrateActiveProfile({
            profileId: profile.profileId,
            snapshot: profile.snapshot,
            founderSandbox: false
          });
          setWalletProfileStatus('ready');
        }
        setBossArchiveResult({
          eventId: settlement.eventId,
          outcome: 'victory',
          clearTimeMs: settlement.clearTimeMs,
          damageTaken: settlement.damageTaken,
          noHit: settlement.noHit,
          newPersonalRecord: settlement.newBestChallengeTime
            || settlement.newBestClearTime,
          rewardCoins: settlement.rewardCoins,
          chargesRemaining: settlement.chargesRemaining,
          masteryCompletedIds: settlement.newlyCompletedObjectiveIds,
          mode: 'challenge',
          variantId: settlement.variantId,
          difficultyId: settlement.difficultyId ?? run.difficultyId,
          notice: settlement.duplicate
            ? 'This Challenge result was already settled. Your canonical wallet profile was restored.'
            : undefined
        });
        return true;
      } catch (error) {
        console.error('Boss Archive Challenge settlement failed', error);
        const noCharges = error instanceof WalletProfileRequestError
          && error.code === 'no_charges';
        setBossArchiveResult({
          eventId: run.eventId,
          outcome: 'victory',
          clearTimeMs,
          damageTaken,
          noHit: damageTaken === 0,
          newPersonalRecord: false,
          rewardCoins: 0,
          chargesRemaining: noCharges
            ? 0
            : getBossArchiveDailyChargeStatus(
                permanentSquadState.bossArchive,
                new Date(),
                bossArchiveDailyLimit
              ).remaining,
          masteryCompletedIds: [],
          mode: run.mode,
          variantId: run.variantId,
          difficultyId: run.difficultyId,
          notice: noCharges
            ? 'The server reports that no Challenge charges remain today. No reward was applied.'
            : 'Server verification is temporarily unavailable. This result may already be recorded; reconnect to refresh your canonical profile. Duplicate rewards cannot be granted.'
        });
        return true;
      }
    }

    const economy = resolveBossArchiveFightEconomy(
      permanentSquadStateRef.current,
      weeklySquadStateRef.current,
      {
        eventId: run.eventId,
        mode: run.mode,
        difficultyId: run.difficultyId,
        victory,
        clearTimeMs,
        damageTaken,
        resultId: run.resultId
      },
      { dailyLimit: bossArchiveDailyLimit }
    );
    if (!economy.result.accepted && !economy.result.duplicate) {
      if (economy.result.reason !== 'no-charges') return false;
      processedBossArchiveResultsRef.current.add(run.resultId);
      setBossArchiveResult({
        eventId: run.eventId,
        outcome: victory ? 'victory' : 'defeat',
        clearTimeMs,
        damageTaken,
        noHit: victory && damageTaken === 0,
        newPersonalRecord: false,
        rewardCoins: 0,
        chargesRemaining: 0,
        masteryCompletedIds: [],
        mode: run.mode,
        variantId: run.variantId,
        difficultyId: run.difficultyId
      });
      return true;
    }
    if (!economy.result.duplicate && !persistRewardClaim(
      economy.permanentState,
      economy.weeklyState
    )) {
      processedBossArchiveResultsRef.current.add(run.resultId);
      setBossArchiveResult({
        eventId: run.eventId,
        outcome: victory ? 'victory' : 'defeat',
        clearTimeMs,
        damageTaken,
        noHit: victory && damageTaken === 0,
        newPersonalRecord: false,
        rewardCoins: 0,
        chargesRemaining: getBossArchiveDailyChargeStatus(
          permanentSquadState.bossArchive,
          new Date(),
          bossArchiveDailyLimit
        ).remaining,
        masteryCompletedIds: [],
        mode: run.mode,
        variantId: run.variantId,
        difficultyId: run.difficultyId,
        notice: 'This result could not be saved. The launch charge was already used; reconnect before another fight.'
      });
      return true;
    }

    processedBossArchiveResultsRef.current.add(run.resultId);
    const chargeStatus = getBossArchiveDailyChargeStatus(
      economy.result.state,
      new Date(),
      bossArchiveDailyLimit
    );
    setBossArchiveResult({
      eventId: run.eventId,
      outcome: victory ? 'victory' : 'defeat',
      clearTimeMs,
      damageTaken,
      noHit: economy.result.noHit,
      newPersonalRecord: economy.result.newBestChallengeTime
        || economy.result.newBestClearTime,
      rewardCoins: economy.result.challengeRewardCoins,
      chargesRemaining: chargeStatus.remaining,
      masteryCompletedIds: economy.result.newlyCompletedObjectiveIds,
      mode: run.mode,
      variantId: run.variantId,
      difficultyId: run.difficultyId
    });
    return true;
  }, [
    activeBossArchiveRun,
    bossArchiveDailyLimit,
    hydrateActiveProfile,
    permanentSquadState,
    persistRewardClaim,
    weeklySquadState
  ]);

  const bossArchiveDailyChargeStatus = useMemo(() => getBossArchiveDailyChargeStatus(
    permanentSquadState.bossArchive,
    new Date(),
    bossArchiveDailyLimit
  ), [bossArchiveDailyLimit, permanentSquadState.bossArchive]);

  const bossArchiveDeveloperControls = useMemo(() => {
    if (!isOwnerWallet || !bossArchiveDeveloperApi) return null;
    return {
      enabled: true,
      dailyLimit: bossArchiveDailyLimit,
      onDailyLimitChange: (nextLimit: number) => {
        runBossArchiveFounderAction(() => setBossArchiveDailyLimit(nextLimit));
      },
      onUnlockAll: () => {
        runBossArchiveFounderAction(() => updateBossArchiveProgress(bossArchiveDeveloperApi.unlockAll));
      },
      onResetProgress: () => {
        runBossArchiveFounderAction(() => {
          updateBossArchiveProgress((current) => bossArchiveDeveloperApi.resetProgress(current));
          setBossArchiveResult(null);
        });
      },
      onResetDailyCharges: () => {
        runBossArchiveFounderAction(() => updateBossArchiveProgress((current) => (
          bossArchiveDeveloperApi.resetDailyCharges(current)
        )));
      },
      onSimulateNewUnlock: (eventId: string) => {
        runBossArchiveFounderAction(() => updateBossArchiveProgress((current) => (
          bossArchiveDeveloperApi.simulateNewUnlock(current, eventId)
        )));
      },
      onSimulateMastery: (eventId: string) => {
        runBossArchiveFounderAction(() => updateBossArchiveProgress((current) => (
          bossArchiveDeveloperApi.simulateMasteryComplete(current, eventId)
        )));
      },
      onPreviewResult: (outcome: 'victory' | 'defeat') => {
        runBossArchiveFounderAction(() => {
          const eventId = permanentSquadState.bossArchive.lastSelectedEventId
            ?? permanentSquadState.bossArchive.unlockedEventIds[0]
            ?? BOSS_ARCHIVE_CATALOG[0]?.eventId;
          if (!eventId) return;
          setBossArchiveResult({
            eventId,
            outcome,
            clearTimeMs: outcome === 'victory' ? 45_000 : null,
            damageTaken: outcome === 'victory' ? 0 : 3,
            noHit: outcome === 'victory',
            newPersonalRecord: outcome === 'victory',
            rewardCoins: outcome === 'victory' ? 125 : 0,
            chargesRemaining: bossArchiveDailyChargeStatus.remaining,
            masteryCompletedIds: outcome === 'victory' ? ['challenge-clear'] : [],
            mode: 'challenge',
            variantId: 'standard',
            difficultyId: 'easy'
          });
        });
      }
    };
  }, [
    bossArchiveDailyChargeStatus.remaining,
    bossArchiveDailyLimit,
    bossArchiveDeveloperApi,
    isOwnerWallet,
    permanentSquadState.bossArchive.lastSelectedEventId,
    permanentSquadState.bossArchive.unlockedEventIds,
    runBossArchiveFounderAction,
    updateBossArchiveProgress
  ]);

  const handleClaimDailyGift = useCallback(() => {
    if (isOwnerWallet) return null;
    if (rewardClaimInFlightRef.current) return null;
    if (
      permanentSquadState.profileId !== activeProfileId
      || weeklySquadState.profileId !== activeProfileId
    ) return null;

    rewardClaimInFlightRef.current = true;
    try {
      const result = claimDailyGiftReward(permanentSquadState);
      if (!result) {
        rewardClaimInFlightRef.current = false;
        return null;
      }

      const nextWeeklyState = awardWeeklySquadCoins(
        weeklySquadState,
        result.reward.coins,
        'daily-gift'
      );
      if (!persistRewardClaim(result.state, nextWeeklyState)) {
        rewardClaimInFlightRef.current = false;
        return null;
      }
      return result.reward;
    } catch {
      rewardClaimInFlightRef.current = false;
      return null;
    }
  }, [
    isOwnerWallet,
    permanentSquadState,
    activeProfileId,
    persistRewardClaim,
    weeklySquadState
  ]);

  const handleClaimAchievement = useCallback((id: AchievementId) => {
    if (isOwnerWallet) return null;
    if (rewardClaimInFlightRef.current) return null;
    if (
      permanentSquadState.profileId !== activeProfileId
      || weeklySquadState.profileId !== activeProfileId
    ) return null;

    rewardClaimInFlightRef.current = true;
    try {
      const result = claimAchievementReward(permanentSquadState, id);
      if (!result) {
        rewardClaimInFlightRef.current = false;
        return null;
      }

      const nextWeeklyState = awardWeeklySquadCoins(
        weeklySquadState,
        result.rewardCoins,
        `achievement:${id}`
      );
      if (!persistRewardClaim(result.state, nextWeeklyState)) {
        rewardClaimInFlightRef.current = false;
        return null;
      }
      return result.rewardCoins;
    } catch {
      rewardClaimInFlightRef.current = false;
      return null;
    }
  }, [
    isOwnerWallet,
    permanentSquadState,
    activeProfileId,
    persistRewardClaim,
    weeklySquadState
  ]);

  const disconnectWallet = useCallback(() => {
    walletProfileInteractiveAuthorizationRef.current = false;
    requestWalletRuntimeAction('disconnect');
  }, [requestWalletRuntimeAction]);

  const switchWallet = useCallback(() => {
    walletProfileInteractiveAuthorizationRef.current = true;
    requestWalletRuntimeAction('switch-account');
  }, [requestWalletRuntimeAction]);

  const handleContinueWithRsc = useCallback(async () => {
    if (isContinuePaymentBusy || runReceipt || runReceiptPromiseRef.current) return;
    setContinuePaymentStatus('processing');
    setContinuePaymentError('');
    setContinuePaymentHash('');
    try {
      const sessionPromise = runSessionPromiseRef.current ?? startRunSession({
        testRun: isOwnerTestRun,
        playerShipId: activeRunShipIdRef.current,
        runMode: 'standard',
        profileId: weeklySquadStateRef.current.profileId
      });
      runSessionPromiseRef.current = sessionPromise;
      const session = await sessionPromise;
      if (session.localOnly || !session.startToken) {
        throw new Error('Secure Continues require an online run session. Check your connection, then start a new run.');
      }
      warmWalletRuntime();
      setWalletRuntimeEnabled(true);
      walletActionNonceRef.current += 1;
      setWalletRuntimeAction({
        type: 'continue',
        nonce: walletActionNonceRef.current,
        runId: session.runId,
        startToken: session.startToken,
        expectedContinueSequence: continuesUsed + 1
      });
    } catch (error) {
      setContinuePaymentStatus('error');
      setContinuePaymentError(
        error instanceof Error ? error.message : 'The Continue could not be prepared.'
      );
    }
  }, [continuesUsed, isContinuePaymentBusy, isOwnerTestRun, runReceipt]);

  const handleWalletRuntimeActionHandled = useCallback((nonce: number) => {
    setWalletRuntimeAction((current) => current?.nonce === nonce ? null : current);
  }, []);

  const handleWalletRuntimeChange = useCallback((nextWallet: WalletSession) => {
    setWalletSession(nextWallet);
    if (nextWallet.address && !nextWallet.error) {
      setWalletError('');
    }
  }, []);

  const handleContinueStatusChange = useCallback((update: { status: DonationStatus; error?: string; hash?: string }) => {
    setContinuePaymentStatus(update.status);
    if (update.error !== undefined) {
      setContinuePaymentError(update.error);
    }
    if (update.hash !== undefined) {
      setContinuePaymentHash(update.hash);
    }
  }, []);

  const handleContinueSuccess = useCallback((settlement: ContinuePaymentSettlement) => {
    setContinuePaymentHash(settlement.transactionHash);
    setContinuePaymentStatus('success');
    setContinuePaymentError('');
    setContinuesUsed(settlement.continueSequence);
    setShowNameInput(false);
    setActiveStoryBeat(null);
    setStats(prev => ({
      ...prev,
      lives: settlement.livesReward
    }));
    setContinueCommand({ nonce: Date.now(), lives: settlement.livesReward });
    setGameState(GameState.PLAYING);
    audioService.playSound('powerup');

    window.setTimeout(() => {
      setContinuePaymentStatus('idle');
    }, 4000);
  }, []);

  useEffect(() => {
    if (gameState !== GameState.PLAYING || activeStoryBeat) {
      return;
    }

    // Story transmissions are Campaign narrative. The Weekly Run is a separate
    // mode with no missions and no story, so a generated depth-3 wave must not
    // interrupt the run with "Mission 1: Research Frontier".
    if (isWeeklyCampaignRun) {
      return;
    }

    if (stats.wave <= lastStoryWaveRef.current) {
      return;
    }

    const nextBeat = getStoryBeatForPhase(stats.wave);
    lastStoryWaveRef.current = stats.wave;

    if (nextBeat && !hasSeenStoryBeatTodayForProfile(nextBeat, activeProfileId)) {
      setActiveStoryBeat(nextBeat);
    }
  }, [activeProfileId, activeStoryBeat, gameState, isWeeklyCampaignRun, stats.wave]);

  const finalizeCurrentRun = async (): Promise<RunReceipt | null> => {
    if (isBossArchiveRun) return null;
    if (runReceipt) return runReceipt;
    if (runReceiptPromiseRef.current) return runReceiptPromiseRef.current;
    if (finalizedRunGameIdRef.current === gameId) return null;
    const weeklyCampaignProof = isWeeklyCampaignRun
      ? weeklySquadStateRef.current.weeklyCampaignStreak
      : null;
    if (isWeeklyCampaignRun && weeklyCampaignProof?.finalization.status !== 'finalized') {
      throw new Error('Weekly Streak proof must be finalized before leaderboard verification.');
    }

    trackEvent('mission_completed', { score: stats.score, wave: stats.wave });
    finalizedRunGameIdRef.current = gameId;
    setRunReceiptStatus('finalizing');
    const gameplayStartedAt = runStartedAtRef.current ?? Date.now();
    runStartedAtRef.current = gameplayStartedAt;
    const sessionPromise = runSessionPromiseRef.current ?? startRunSession({
      testRun: isOwnerTestRun,
      playerShipId: activeRunShipIdRef.current,
      runMode: isWeeklyCampaignRun ? 'weekly-streak' : 'standard',
      profileId: weeklySquadStateRef.current.profileId,
      weeklyCampaignProof
    });
    runSessionPromiseRef.current = sessionPromise;
    const receiptPromise = sessionPromise
      .then((session) => finishRunSession(session, {
        score: stats.score,
        wave: stats.wave,
        durationMs: Math.max(0, Date.now() - gameplayStartedAt),
        enemiesDefeated: stats.enemiesDefeated,
        coinsCollected: stats.coins,
        playerShipId: activeRunShipIdRef.current
      }, weeklyCampaignProof))
      .then((receipt) => {
        setRunReceipt(receipt);
        setRunReceiptStatus(receipt.integrity === 'local-unverified' ? 'local' : 'ready');
        return receipt;
      })
      .catch((error) => {
        console.error('Run receipt finalization failed:', error);
        finalizedRunGameIdRef.current = null;
        runReceiptPromiseRef.current = null;
        setRunReceiptStatus('error');
        throw error;
      });
    runReceiptPromiseRef.current = receiptPromise;
    return receiptPromise;
  };

  useEffect(() => {
    if (gameState === GameState.GAMEOVER) {
      if (isBossArchiveRun) {
        setShowNameInput(false);
        setScoreSubmitError('');
        return;
      }
      const unsettledLifetimeCampaignEnemies = isCampaignRun
        ? Math.max(0, stats.enemiesDefeated - campaignRunCreditedEnemiesRef.current)
        : stats.enemiesDefeated;
      if (isWeeklyLeaderboardRun && squadRunAppliedGameIdRef.current !== gameId) {
        squadRunAppliedGameIdRef.current = gameId;
        updateWeeklySquadState((current) => applySquadRunResult(current, {
          score: stats.score,
          enemiesDefeated: stats.enemiesDefeated,
          coinsCollected: stats.coins
        }));
      }
      if (!isNonCompetitiveRun && permanentRunAppliedGameIdRef.current !== gameId) {
        permanentRunAppliedGameIdRef.current = gameId;
        updatePermanentSquadState((current) => recordLifetimeRun(current, {
          score: stats.score,
          wave: stats.wave,
          enemiesDefeated: unsettledLifetimeCampaignEnemies,
          coinsCollected: isCampaignRun ? 0 : stats.coins,
          weeklyRun: isWeeklyCampaignRun
            ? {
                // Endless Weekly Runs have no terminal clear. Loss records the
                // depth reached; a manual forfeit never enters this settlement.
                completed: false,
                sectorReached: weeklyRunSectorReachedRef.current
              }
            : undefined
        }));
      }
      const scoreKey = `${gameId}:${stats.score}:${stats.wave}`;
      if (submittedScoreKeysRef.current.has(scoreKey)) {
        setShowNameInput(false);
        return;
      }

      // High scores belong to the Weekly Run. Campaign is for playing,
      // upgrading, and reaching bosses -- it deliberately records no score.
      if (isWeeklyLeaderboardRun && stats.score > stats.highScore) {
        setStats(s => ({ ...s, highScore: s.score }));
      }

      setScoreSubmitError('');
      setShowNameInput(isWeeklyLeaderboardRun);
    }
  }, [gameId, gameState, isBossArchiveRun, isCampaignRun, isNonCompetitiveRun, isWeeklyLeaderboardRun, stats.coins, stats.enemiesDefeated, stats.score, stats.wave, stats.highScore, updatePermanentSquadState, updateWeeklySquadState]);

  const updateWeeklyCampaignSubmission = useCallback((
    status: 'pending' | 'submitted' | 'failed',
    submissionId: string | null = null
  ) => {
    if (!isWeeklyCampaignRun) return;
    const streak = weeklySquadStateRef.current.weeklyCampaignStreak;
    if (!streak || streak.finalization.status !== 'finalized') return;
    persistWeeklyCampaignStreak(markWeeklyCampaignStreakSubmission(
      streak,
      status,
      Date.now(),
      submissionId
    ));
  }, [isWeeklyCampaignRun, persistWeeklyCampaignStreak]);

  const persistHighScore = async () => {
    if (!isWeeklyLeaderboardRun || !playerNameInput.trim() || submittingScoreRef.current) return false;

    submittingScoreRef.current = true;
    setIsSubmittingScore(true);
    setScoreSubmitError('');

    const name = playerNameInput.trim().substring(0, 15).toUpperCase();
    const score = stats.score;
    const wave = stats.wave;
    const scoreKey = `${gameId}:${score}:${wave}`;
    const submittedAt = new Date().toISOString();
    updateWeeklyCampaignSubmission('pending');

    if (isFounderSandboxRun) {
      let recordReady = false;
      try {
        const verifiedReceipt = await finalizeCurrentRun();
        if (!verifiedReceipt) {
          throw new Error('Test record is still preparing. Please try again.');
        }
        submittedScoreKeysRef.current.add(scoreKey);
        recordReady = true;
        return true;
      } catch (error) {
        console.error('Test record preparation error', error);
        setScoreSubmitError(error instanceof Error ? error.message : 'Test record could not be prepared.');
        return false;
      } finally {
        submittingScoreRef.current = false;
        setIsSubmittingScore(false);
        if (recordReady) {
          setShowNameInput(false);
          setShowMissionRecordPreview(true);
        }
      }
    }

    const newEntry: LeaderboardEntry = {
      name,
      score,
      wave,
      date: submittedAt,
      walletAddress: activeWalletAddress || undefined,
      donated: wallet.hasDonated
    };
    const scoreSorter = (a: LeaderboardEntry, b: LeaderboardEntry) => (
      b.score !== a.score
        ? b.score - a.score
        : new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    );
    const previousLeaderboard = leaderboard;
    const previousMonthlyLeaderboard = monthlyLeaderboard;
    const optimisticList = [...leaderboard, newEntry].sort(scoreSorter).slice(0, ALL_TIME_SCORE_LIMIT);
    const optimisticMonthlyList = [...monthlyLeaderboard, newEntry].sort(scoreSorter).slice(0, WEEKLY_SCORE_LIMIT);
    setLeaderboard(optimisticList);
    setMonthlyLeaderboard(optimisticMonthlyList);

    let confirmedSave = false;
    let requiresWeeklyProposal = false;
    try {
      const verifiedReceipt = await finalizeCurrentRun();
      if (!verifiedReceipt) {
        throw new Error('Run verification is still preparing. Please try again.');
      }
      const updatedData = await saveScore(name, score, wave, {
        date: submittedAt,
        walletAddress: activeWalletAddress,
        donated: wallet.hasDonated,
        receipt: verifiedReceipt
      });
      if (updatedData.remoteSaved === false) {
        throw new Error(updatedData.remoteError || 'Global leaderboard save did not confirm');
      }
      if (updatedData.scores.length > 0) {
        setLeaderboard(updatedData.scores);
      }
      setMonthlyLeaderboard(updatedData.monthlyScores);
      const savedWeeklyLeader = updatedData.monthlyScores[0];
      const savedLeaderMatchesRun = savedWeeklyLeader?.runId
        ? savedWeeklyLeader.runId === verifiedReceipt.runId
        : savedWeeklyLeader?.score === score
          && (savedWeeklyLeader.wave ?? 1) === wave
          && savedWeeklyLeader.name === name;
      requiresWeeklyProposal = Boolean(savedLeaderMatchesRun && !savedWeeklyLeader?.proposalId);
      submittedScoreKeysRef.current.add(scoreKey);
      setScoreSaved(true);
      trackEvent('score_submitted', { score, wave, integrity: verifiedReceipt.integrity });
      emitSquadDomainEvent('score_submitted', {
        profileId: weeklySquadState.profileId,
        score,
        wave,
        runId: verifiedReceipt.runId
      });
      if (activeWalletAddress) {
        setWalletRuns(current => [
          { pilotName: name, receipt: verifiedReceipt },
          ...current.filter(run => run.receipt.runId !== verifiedReceipt.runId)
        ].slice(0, 5));
        void getWalletRuns(activeWalletAddress).then(setWalletRuns);
      }
      updateWeeklyCampaignSubmission('submitted', verifiedReceipt.runId);
      confirmedSave = true;
      return true;
    } catch (error) {
      updateWeeklyCampaignSubmission('failed');
      console.error("Score submission error", error);
      submittedScoreKeysRef.current.delete(scoreKey);
      setLeaderboard(previousLeaderboard);
      setMonthlyLeaderboard(previousMonthlyLeaderboard);
      setScoreSubmitError(error instanceof Error ? error.message : 'Global save did not confirm. Please try again.');
      return false;
    } finally {
      submittingScoreRef.current = false;
      setIsSubmittingScore(false);
      if (confirmedSave) {
        setShowNameInput(false);
        if (requiresWeeklyProposal) {
          weeklyProposalReturnRef.current = 'results';
          setWeeklyProposalSelectionStatus('idle');
          setWeeklyProposalSelectionMessage('');
          setWeeklyProposalSelectionMode('required');
          setShowMissionRecordPreview(false);
          setShowWeeklyProposalSelection(true);
        } else {
          setShowMissionRecordPreview(true);
        }
      }
    }
  };

  const submitScore = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    await persistHighScore();
  };

  const handleChampionClaimStatus = (
    status: 'idle' | 'connecting' | 'signing' | 'confirmed' | 'error',
    message = ''
  ) => {
    setChampionClaimStatus(status);
    setChampionClaimMessage(message);
    if (status === 'confirmed') {
      trackEvent('weekly_champion_claimed');
      trackEvent('proposal_selected');
      void getArchivedWeeklyWinners().then((archive) => {
        if (archive !== null) setArchivedWinners(archive.winners);
      });
    }
  };

  const claimWeeklyChampion = (winner: ArchivedWinner, proposal: ResearchHubProposal) => {
    setWalletRuntimeEnabled(true);
    setChampionClaimStatus('connecting');
    setChampionClaimMessage('');
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({
      nonce: walletActionNonceRef.current,
      type: 'claim-champion',
      weekKey: winner.periodKey,
      proposal
    });
  };

  const missionRecordChainId = Number(import.meta.env.VITE_MISSION_RECORD_CHAIN_ID || 8453);
  const mintConfigured = Boolean((import.meta.env.VITE_MISSION_RECORD_CONTRACT_ADDRESS as string | undefined)?.trim());

  const mintCurrentMissionRecord = () => {
    if (!runReceipt || runReceipt.integrity === 'local-unverified') return;
    emitSquadDomainEvent('mint_started', {
      profileId: weeklySquadState.profileId,
      runId: runReceipt.runId
    });
    setWalletRuntimeEnabled(true);
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({ nonce: walletActionNonceRef.current, type: 'mint-mission', receipt: runReceipt });
  };

  const handleMissionMintStatus = (
    status: 'idle' | 'authorizing' | 'confirming' | 'confirmed' | 'error',
    message = '',
    _hash = ''
  ) => {
    setMissionMintStatus(status);
    setMissionMintMessage(message);
    if (status === 'confirmed') {
      emitSquadDomainEvent('mint_confirmed', {
        profileId: weeklySquadState.profileId,
        runId: runReceipt?.runId || null
      });
      trackEvent('mission_record_minted', {
        chain: missionRecordChainId === 8453 ? 'base' : 'base_sepolia'
      });
      if (activeWalletAddress) {
        void Promise.all([
          getWalletRecords(activeWalletAddress),
          getWalletRuns(activeWalletAddress)
        ]).then(([records, runs]) => {
          setWalletRecords(records);
          setWalletRuns(runs);
        });
      }
    }
  };

  const openWalletRunRecord = (record: WalletRunRecord) => {
    const existingMint = walletRecords.find((mint) => (
      mint.recordType === 'mission'
      && mint.runId === record.receipt.runId
      && mint.status === 'confirmed'
    ));
    setRunReceipt(record.receipt);
    setMissionRecordPilotName(record.pilotName);
    setMissionMintStatus(existingMint ? 'confirmed' : 'idle');
    setMissionMintMessage(existingMint ? 'This Mission Record is already minted.' : '');
    setShowMissionRecordPreview(true);
    trackEvent('mint_preview_opened', { record_type: 'mission', source: 'wallet_run_history' });
  };

  const openWeeklyLeaderProposal = (record: WalletRunRecord) => {
    if (weeklyProposalRecovery?.record.receipt.runId !== record.receipt.runId) return;
    setRunReceipt(record.receipt);
    setMissionRecordPilotName(record.pilotName);
    weeklyProposalReturnRef.current = 'record';
    setWeeklyProposalSelectionStatus('idle');
    setWeeklyProposalSelectionMessage('');
    setWeeklyProposalSelectionMode('recovery');
    setShowMissionRecordPreview(false);
    setShowWeeklyProposalSelection(true);
  };

  const skipScoreSubmission = () => {
    submittingScoreRef.current = false;
    setIsSubmittingScore(false);
    setShowNameInput(false);
    setPlayerNameInput('');
    setScoreSubmitError('');
    setActiveRunMode('standard');
    setGameState(GameState.MENU);
  };

  const confirmWeeklyLeaderProposal = async (proposal: ResearchHubProposal) => {
    if (!runReceipt || weeklyProposalSelectionStatus === 'saving') return;

    clearWeeklyProposalTransition();
    setWeeklyProposalSelectionStatus('saving');
    setWeeklyProposalSelectionMessage('Saving your weekly funding choice...');
    try {
      const walletAuthorization = activeWalletAddress
        ? {
          address: activeWalletAddress as Address,
          signMessage: (await import('./services/baseAccountWallet')).signBaseAccountMessage
        }
        : undefined;
      const updatedData = await saveWeeklyLeaderProposal(runReceipt, proposal, walletAuthorization);
      if (updatedData.scores.length > 0) {
        setLeaderboard(updatedData.scores);
      }
      setMonthlyLeaderboard(updatedData.monthlyScores);
      setWeeklyProposalSelectionStatus('confirmed');
      setWeeklyProposalSelectionMessage(`${proposal.title} is saved with your weekly-leading score.`);
      trackEvent('proposal_selected', {
        proposal_id: proposal.id,
        source: 'weekly_high_score'
      });
      weeklyProposalTransitionRef.current = window.setTimeout(() => {
        weeklyProposalTransitionRef.current = null;
        setShowWeeklyProposalSelection(false);
        setShowMissionRecordPreview(weeklyProposalReturnRef.current === 'record');
      }, 650);
    } catch (error) {
      console.error('Weekly proposal selection failed:', error);
      setWeeklyProposalSelectionStatus('error');
      setWeeklyProposalSelectionMessage(
        error instanceof Error ? error.message : 'Your weekly proposal could not be saved. Please try again.'
      );
    }
  };

  const closeWeeklyProposalSelection = () => {
    clearWeeklyProposalTransition();
    setShowWeeklyProposalSelection(false);
    setWeeklyProposalSelectionStatus('idle');
    setWeeklyProposalSelectionMessage('');
    if (weeklyProposalReturnRef.current === 'record') {
      setShowMissionRecordPreview(true);
    }
  };

  const openMissionRecordWeeklyFunding = () => {
    if (!missionRecordWeeklyFunding) return;
    if (missionRecordWeeklyFunding.status === 'selected' && !missionRecordWeeklyFunding.canEditProposal) {
      return;
    }

    if (missionRecordWeeklyFunding.status === 'current-leader'
      || (missionRecordWeeklyFunding.status === 'selected' && missionRecordWeeklyFunding.canEditProposal)) {
      weeklyProposalReturnRef.current = gameStateRef.current === GameState.GAMEOVER ? 'results' : 'record';
      setWeeklyProposalSelectionStatus('idle');
      setWeeklyProposalSelectionMessage('');
      setWeeklyProposalSelectionMode('recovery');
      setShowMissionRecordPreview(false);
      setShowWeeklyProposalSelection(true);
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'proposals');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setScorecardChampionWinner(
      missionRecordWeeklyFunding.status === 'claimable'
        ? missionRecordWeeklyFunding.winner ?? null
        : null
    );
    setShowMissionRecordPreview(false);
    setGameState(GameState.MENU);
  };

  const openReferral = async () => {
    window.location.assign(ASSETS.REFERRAL_LINK);
  };

  const openBaseAppInvite = async () => {
    window.location.assign(DONATION_CONFIG.BASE_APP_INVITE_URL);
  };

  const openResearchHubFund = async () => {
    await openExternalUrl('https://www.researchhub.com/fund');
  };

  const openResearchHubProposal = async (url: string) => {
    await openExternalUrl(url);
  };

  const openTreasurySend = async () => {
    await openExternalUrl(`ethereum:${DONATION_CONFIG.RECIPIENT_ADDRESS}@${DONATION_CONFIG.BASE_CHAIN_ID}`);
  };

  const openRscSwap = async () => {
    window.location.assign(DONATION_CONFIG.RSC_SWAP_URL);
  };

  const openRscInBase = async () => {
    window.location.assign(DONATION_CONFIG.RSC_BASE_APP_URL);
  };

  const nextContinueRscCost = continueRscCost + 5;
  const continueStatusText = continuePaymentStatus === 'switching_network'
    ? 'Switching wallet to Base...'
    : continuePaymentStatus === 'processing'
      ? 'Preparing RSC continue...'
      : continuePaymentStatus === 'confirming'
        ? 'Confirming RSC payment...'
        : continuePaymentStatus === 'success'
          ? 'Continue confirmed.'
          : continuePaymentStatus === 'error'
            ? continuePaymentError
            : '';
  const continueRunControls = (
    <div className="rounded-[8px] border border-emerald-200/25 bg-[radial-gradient(circle_at_20%_0%,rgba(16,185,129,0.2),transparent_48%),rgba(6,78,59,0.16)] p-3 text-left">
      <div className="grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">Continue run</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <strong className="text-xl font-black uppercase tracking-wide text-white">{continueRscCost} RSC</strong>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">+5 lives</span>
          </div>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Next continue: {nextContinueRscCost} RSC</p>
        </div>
        <button
          type="button"
          onClick={() => void handleContinueWithRsc()}
          disabled={isContinuePaymentBusy}
          className="min-h-11 rounded-[7px] border border-emerald-100/40 bg-emerald-300 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-400"
        >
          {isContinuePaymentBusy ? 'Confirm' : activeWalletAddress ? 'Continue' : 'Connect + Continue'}
        </button>
      </div>

      {continueStatusText ? (
        <div className={`mt-2 text-center text-[9px] font-black uppercase tracking-[0.1em] ${continuePaymentStatus === 'error' ? 'text-red-200' : continuePaymentStatus === 'success' ? 'text-emerald-100' : 'text-slate-300'}`}>
          {continueStatusText}
        </div>
      ) : null}

      {continuePaymentHash ? (
        <a
          href={`${DONATION_CONFIG.EXPLORER_BASE_URL}/tx/${continuePaymentHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-center font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300 underline underline-offset-2 hover:text-white"
        >
          View continue payment
        </a>
      ) : null}
    </div>
  );
  const gameOverContinueControls = !campaignCompletedRun && !isCampaignRun && !isNonCompetitiveRun && !runReceipt && runReceiptStatus !== 'finalizing'
    ? continueRunControls
    : null;
  const resultEncounter = getStageName(stats.wave);
  const testChampionWinner: ArchivedWinner = {
    periodKey: 'PILOT-TEST',
    periodLabel: 'Pilot Test Preview',
    winnerName: playerNameInput.trim().toUpperCase() || 'PROJECT WALLET',
    score: stats.score,
    wave: stats.wave,
    scoreDate: new Date().toISOString(),
    allocationRsc: 100,
    status: 'finalized'
  };
  /**
   * A Weekly Run that ends used to show the same generic Defeated panel as an
   * arcade run: no indication of how deep the gauntlet got, how many Sector
   * bosses fell, or that the score counts for the week. Built from the
   * persisted streak rather than a ref so it survives a re-render.
   */
  const weeklyRunResultSummary = useMemo(() => {
    if (!isWeeklyCampaignRun) return null;
    const streak = weeklySquadState.weeklyCampaignStreak;
    if (!streak) return null;
    const visitedSectors = new Set<number>();
    let bossesCleared = 0;
    for (const nodeId of streak.visitedNodeIds) {
      const node = weeklyRun.graph.nodeById.get(nodeId);
      const sector = getWeeklyRunDepth(node?.missionDefinitionId);
      if (sector > 0) visitedSectors.add(sector);
      if ((node?.bossId || (node?.miniBossIds?.length ?? 0) > 0) && streak.scoredNodeIds.includes(nodeId)) bossesCleared += 1;
    }
    return {
      sectorReached: visitedSectors.size > 0 ? Math.max(...visitedSectors) : 1,
      bossesCleared,
      points: streak.score.totalPoints
    };
  }, [isWeeklyCampaignRun, weeklySquadState.weeklyCampaignStreak]);

  const missionResultBanner = (
    <div className="relative overflow-hidden border border-cyan-200/30 bg-[radial-gradient(circle_at_82%_48%,rgba(59,130,246,0.24),transparent_27%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] px-4 py-3 shadow-[0_0_36px_rgba(34,211,238,0.12)] [clip-path:polygon(18px_0,calc(50%_-_26px)_0,calc(50%_-_16px)_8px,calc(50%_+_16px)_8px,calc(50%_+_26px)_0,calc(100%_-_18px)_0,100%_18px,100%_calc(100%_-_18px),calc(100%_-_18px)_100%,18px_100%,0_calc(100%_-_18px),0_18px)]">
      <div className="pointer-events-none absolute left-0 top-5 h-12 w-24 -translate-x-10 -skew-x-[24deg] border-y border-r border-yellow-200/35 bg-yellow-300/10" />
      <div className="pointer-events-none absolute right-0 top-5 h-12 w-24 translate-x-10 skew-x-[24deg] border-y border-l border-yellow-200/35 bg-yellow-300/10" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-3 w-14 -translate-x-1/2 bg-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.55)] [clip-path:polygon(12%_0,88%_0,100%_50%,88%_100%,12%_100%,0_50%)]" />
      <div className="relative">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Mission {stats.wave} - {resultEncounter}</p>
        <h2 className="arcade-font mt-1 text-xl font-black uppercase tracking-widest text-cyan-100">{campaignCompletedRun ? 'Campaign Record' : 'Mission Record'}</h2>
        <p className="mt-1 text-3xl font-black text-white">{stats.score.toLocaleString()}</p>
      </div>

      <div className="relative mt-2 grid grid-cols-3 divide-x divide-white/10 border-t border-cyan-100/15 pt-2 text-center">
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Mission</span><strong className="text-sm text-cyan-100">{stats.wave}</strong></div>
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Targets</span><strong className="text-sm text-emerald-100">{stats.enemiesDefeated}</strong></div>
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Tokens</span><strong className="text-sm text-yellow-200">{stats.coins}</strong></div>
      </div>
    </div>
  );

  const onboardingSurface: OnboardingSurface = gameState === GameState.MENU && campaignMapOpen
    ? 'campaign-map'
    : gameState === GameState.MENU
      ? 'menu'
      : gameState === GameState.PLAYING && isCompetitiveCampaignRun
        ? 'gameplay'
        : gameState === GameState.WAVE_COMPLETE
          && isCompetitiveCampaignRun
          && Boolean(waveVictorySummary?.stageComplete)
          ? 'mission-complete'
          : 'other';
  const hasCampaignClear = permanentSquadState.campaignProgress.completedMissionIds.length > 0
    || permanentSquadState.lifetimeStats.campaignMissionsCleared > 0;
  const onboardingSuspended = Boolean(
    missionLoading
    || activeStoryBeat
    || introMissionLocked
    || showNameInput
    || showWeeklyProposalSelection
    || showMissionRecordPreview
    || (campaignMapOpen && campaignMapStatus !== 'ready')
  );
  const onboardingDailyGiftStatus = getDailyGiftStatus(permanentSquadState);
  const onboardingBombLocked = onboardingStepId === 'flight-steer';
  const onboardingAbilityLocked = onboardingStepId === 'flight-steer'
    || onboardingStepId === 'flight-bomb';

  return (
    <div className="relative h-full w-full select-none bg-[#0b1020]">
      {walletRuntimeEnabled ? (
        <React.Suspense fallback={null}>
          <WalletRuntime
            action={walletRuntimeAction}
            donatedWallets={donatedWallets}
            walletError={walletError}
            onActionHandled={handleWalletRuntimeActionHandled}
            onContinueStatusChange={handleContinueStatusChange}
            onContinueSuccess={handleContinueSuccess}
            onWalletChange={handleWalletRuntimeChange}
            onWalletError={setWalletError}
            onRscBalanceChange={setRscBalanceUpdate}
            onWalletPurchaseStatus={setWalletPurchaseStatus}
            onWalletPurchaseSuccess={handleWalletPurchaseSuccess}
            onChampionClaimStatus={handleChampionClaimStatus}
            onMissionMintStatus={handleMissionMintStatus}
          />
        </React.Suspense>
      ) : null}

      {missionLoading ? (
        <MissionLoadingScreen
          progress={missionLoading.progress}
          phase={missionLoading.phase}
          tip={missionLoading.tip}
          onRetry={() => {
            void launchGame(
              activeBossEncounterId,
              activeBossArchiveRun?.mode ?? 'challenge',
              activeBossArchiveRun?.variantId ?? 'standard',
              activeCampaignLaunch,
              activeCampaignBranch ? {
                branchId: activeCampaignBranch.branchId,
                sourceMissionId: activeCampaignBranch.sourceMissionId,
                missionDefinitionId: activeCampaignBranch.missionDefinitionId,
                kind: 'branch'
              } : null,
              isCampaignLabRun ? campaignLabActiveRequestRef.current : null,
              activeBossArchiveRun?.difficultyId ?? 'easy',
              activeBossArchiveRun
            );
          }}
          onCancel={cancelMissionLoading}
        />
      ) : null}

      {!campaignMapOpen && (gameState === GameState.PLAYING || gameState === GameState.WAVE_COMPLETE || gameState === GameState.PAUSED || gameState === GameState.GAMEOVER) && (
        <React.Suspense fallback={null}>
          <GameStage
            key={gameId}
            resumeCountdown={resumeCountdown}
            canvas={{
              stats,
              onStatsChange: (nextStats) => {
                if (!isCampaignBranchRun) {
                  setStats(nextStats);
                  return;
                }
                const baseline = campaignBranchCoinBaselineRef.current;
                setStats(baseline === null ? nextStats : {
                  ...nextStats,
                  totalCoins: baseline
                });
              },
              onRuntimeState: handleRuntimeState,
              onDebugSnapshot: isCampaignLabRun
                ? (snapshot: Readonly<GameEngineDebugSnapshot>) => {
                    if (!founderAuthorizationRef.current) return;
                    setCampaignLabTelemetry({
                      ...snapshot.campaignLab,
                      weeklyPointsEarned:
                        weeklySquadStateRef.current.weeklyCampaignStreak?.score.totalPoints ?? 0
                    });
                  }
                : undefined,
              running: gameState === GameState.PLAYING
                && gameRuntimeReady
                && !ownerFrameFrozen
                && !onboardingGameplayFreeze,
              onReady: () => completeMissionRuntimeLaunch(gameId),
              onInitializationError: (error) => failMissionRuntimeLaunch(gameId, error),
              onGameOver: async () => {
                setOwnerFrameFrozen(false);
                if (isWeeklyCampaignRun) {
                  const streak = weeklySquadStateRef.current.weeklyCampaignStreak;
                  if (streak?.finalization.status === 'active') {
                    const finalized = finalizeWeeklyCampaignLoss(streak, Date.now());
                    persistWeeklyCampaignStreak(finalized);
                    presentWeeklyCampaignFinalScore(finalized);
                  }
                  setGameState(GameState.GAMEOVER);
                  return;
                }
                if (isBossArchiveRun) {
                  await finalizeBossArchiveFight(false);
                  returnToBossArchive();
                  return;
                }
                if (isCampaignBranchRun) {
                  await settleCampaignBranchOutcome('failed');
                }
                setGameState(GameState.GAMEOVER);
              },
              onContinueStarted: () => setGameState(GameState.PLAYING),
              onCampaignProgress: handleCampaignProgress,
              onWaveVictory: showWaveVictory,
              isTransmissionOpen: introMissionLocked || Boolean(activeStoryBeat),
              bombLocked: onboardingGameplayFreeze
                || onboardingBombLocked
                || introMissionLocked
                || Boolean(activeStoryBeat),
              bombCommand,
              shipAbilityCommand,
              continueCommand,
              waveContinueCommand,
              polishSettings,
              playerShipUrl: activeMissionPlayerShipUrl,
              playerShipId: activeMissionShipId,
              squadLoadout: activeRunSquadLoadoutRef.current,
              campaign: activeBossReplayCampaign
                ?? activeCampaignBranchCampaign
                // Weekly Run reorders the authored levels into one continuous
                // boss gauntlet instead of duplicating any boss content.
                ?? (isWeeklyCampaignRun ? weeklyRun.campaign : undefined)
                ?? (isCampaignRun ? DEFAULT_GAME_CAMPAIGN : undefined),
              levelId: activeBossReplay?.missionId
                ?? activeCampaignBranch?.missionDefinition.id
                ?? (isCampaignRun ? activeCampaignLaunch?.missionId : undefined),
              waveId: activeBossReplay?.waveId
                ?? (activeCampaignBranch ? getCampaignBranchRuntimeWaveId(activeCampaignBranch) : undefined)
                ?? (isCampaignRun ? activeCampaignLaunch?.waveId : undefined),
              refillLivesAtMissionBoundary: !isWeeklyCampaignRun,
              continuousStageBoundaries: isWeeklyCampaignRun,
              maxPlayerDamagePerHit: isWeeklyCampaignRun ? 1 : undefined,
              randomSeed: isWeeklyCampaignRun
                ? `weekly-run:${weeklySquadState.weekKey}`
                : activeBossArchiveRun?.seed,
              testMode: isOwnerTestRun,
              testWaveCommand,
              testBossCommand,
              testFlaskCommand
            }}
            hud={gameRuntimeReady && (
              gameState === GameState.PLAYING
              || resumeCountdownActive
              || (gameState === GameState.PAUSED && isOwnerWallet && isOwnerTestRun)
            ) ? {
              showLabGlow,
              onDisableLabGlow: () => setShowLabGlow(false),
              isUpgradeReady: false,
              paused: gameState === GameState.PAUSED,
              frozen: ownerFrameFrozen,
              showFreezeControl: isOwnerWallet && isOwnerTestRun,
              onPause: () => {
                setOwnerFrameFrozen(false);
                if (gameState === GameState.PAUSED) {
                  beginResumeCountdown();
                  return;
                }
                setResumeCountdown(null);
                setGameState(GameState.PAUSED);
              },
              onToggleFreeze: isOwnerWallet && isOwnerTestRun
                ? () => setOwnerFrameFrozen(frozen => !frozen)
                : undefined,
              bombLocked: gameState !== GameState.PLAYING
                || ownerFrameFrozen
                || onboardingGameplayFreeze
                || onboardingBombLocked
                || introMissionLocked
                || Boolean(activeStoryBeat),
              onUseBomb: () => {
                if (onboardingGameplayFreeze || onboardingBombLocked || introMissionLocked || activeStoryBeat) return;
                setBombCommand({ nonce: Date.now() });
              },
              selectedShipId: activeMissionShipId,
              shipAbilityLocked: gameState !== GameState.PLAYING
                || ownerFrameFrozen
                || onboardingGameplayFreeze
                || onboardingAbilityLocked
                || introMissionLocked
                || Boolean(activeStoryBeat),
              onUseShipAbility: () => {
                if (onboardingGameplayFreeze || onboardingAbilityLocked || introMissionLocked || activeStoryBeat) return;
                setShipAbilityCommand({ nonce: Date.now() });
              },
              lifeCapacity: activeRunLifeCapacity,
              fieldUpgradesEnabled: false,
              onUpgrade: handleFieldUpgrade
            } : false}
          />
        </React.Suspense>
      )}

      {!campaignMapOpen && gameState === GameState.WAVE_COMPLETE && waveVictorySummary && isCampaignBranchRun && campaignBranchResult ? (
        <React.Suspense fallback={null}>
          <CampaignBranchResultOverlay
            branchName={campaignBranchResult.branchName}
            result={campaignBranchResult}
            onReturnToMap={continueAfterWaveVictory}
          />
        </React.Suspense>
      ) : null}

      {!campaignMapOpen && gameState === GameState.WAVE_COMPLETE && waveVictorySummary?.stageComplete && !isCampaignBranchRun && !isWeeklyCampaignRun ? (
        <React.Suspense fallback={null}>
          <WaveVictoryOverlay
            summary={waveVictorySummary}
            onContinue={continueAfterWaveVictory}
            bossArchiveReplay={isBossArchiveRun}
            campaignSettlement={isCampaignRun && campaignResultPresentation?.summaryId === waveVictorySummary.id
              ? campaignResultPresentation.settlement
              : null}
            guideRequiresHome={onboardingStepId === 'mission-home'}
            onOpenHangar={isCompetitiveCampaignRun ? openSquadHangar : undefined}
            onOpenCampaignMap={isCampaignRun
              ? () => openCampaignMap(
                  campaignResultPresentation?.settlement.newlyUnlockedMissionId
                  ?? waveVictorySummary.levelId
                )
              : undefined}
            onReturnHome={isCampaignRun ? resetGame : undefined}
          />
        </React.Suspense>
      ) : null}

      {gameState === GameState.MENU && !campaignMapOpen && (
        <StartScreen
          onStart={startGame}
          onOpenCampaignMap={() => openCampaignMap()}
          campaignNotificationCount={campaignNotificationCount}
          campaignCheckpoint={campaignCheckpoint}
          allTimeLeaderboard={leaderboard}
          monthlyLeaderboard={monthlyLeaderboard}
          archivedWinners={archivedWinners}
          weeklyPresentationTime={weeklyPresentationTime}
          walletRecords={walletRecords}
          walletRuns={walletRuns}
          walletRunsLoading={walletRunsLoading}
          weeklyProposalRecovery={weeklyProposalRecovery}
          onOpenWeeklyLeaderProposal={openWeeklyLeaderProposal}
          walletAddress={activeWalletAddress}
          selectedShipId={usableShipId}
          shipUnlocks={shipUnlocks}
          onSelectShip={setSelectedShipId}
          weeklySquadState={weeklySquadState}
          permanentSquadState={permanentSquadState}
          onClaimDailyGift={handleClaimDailyGift}
          onClaimAchievement={handleClaimAchievement}
          onRequestWalletConnect={connectWallet}
          rscBalance={rscBalanceUpdate.balance}
          rscBalanceStatus={rscBalanceUpdate.status}
          walletPurchaseStatus={walletPurchaseStatus}
          onPurchaseWithRsc={requestRscPurchase}
          onRefreshRscBalance={refreshRscBalance}
          audioMuted={audioMuted}
          sfxVolumeLevel={sfxVolumeLevel}
          musicVolumeLevel={musicVolumeLevel}
          matchMusicTrackId={matchMusicTrackId}
          onToggleAudio={toggleGameAudio}
          onSfxVolumeChange={setGameSfxVolume}
          onMusicVolumeChange={setGameMusicVolume}
          onMatchMusicTrackChange={setGameMatchMusicTrack}
          onBossArchiveViewed={handleBossArchiveViewed}
          onBossArchiveSelection={handleBossArchiveSelection}
          onStartBossFight={startBossArchiveFight}
          bossArchiveDailyChargeStatus={bossArchiveDailyChargeStatus}
          bossArchiveResult={bossArchiveResult ? {
            eventId: bossArchiveResult.eventId,
            outcome: bossArchiveResult.outcome,
            mode: bossArchiveResult.mode,
            variantId: bossArchiveResult.variantId,
            difficultyId: bossArchiveResult.difficultyId,
            clearTimeMs: bossArchiveResult.clearTimeMs,
            damageTaken: bossArchiveResult.damageTaken,
            noHit: bossArchiveResult.noHit,
            newPersonalRecord: bossArchiveResult.newPersonalRecord,
            reward: bossArchiveResult.rewardCoins > 0 ? [{
              id: `${bossArchiveResult.eventId}:challenge-result`,
              label: 'Tokens',
              amount: bossArchiveResult.rewardCoins,
              tone: 'coin'
            }] : [],
            chargesRemaining: bossArchiveResult.chargesRemaining,
            masteryCompletedIds: bossArchiveResult.masteryCompletedIds,
            notice: bossArchiveResult.notice
          } : null}
          onDismissBossArchiveResult={() => setBossArchiveResult(null)}
          bossArchiveLaunchError={bossArchiveLaunchError}
          onDismissBossArchiveLaunchError={() => setBossArchiveLaunchError(null)}
          onStartWeeklyRun={startWeeklyRunFromHome}
          onRestartOnboarding={() => setOnboardingRestartNonce((nonce) => nonce + 1)}
          weeklyRunLaunchError={weeklyRunLaunchError}
          onDismissWeeklyRunLaunchError={() => setWeeklyRunLaunchError(null)}
          weeklyRunBestScore={weeklySquadState.weeklyStats.score}
          weeklyRunAttemptsRemaining={weeklyRunAttemptQuotaOwner === activeWalletAddress?.toLowerCase()
            && weeklyRunAttemptQuota?.weeklyId === weeklySquadState.weekKey
            ? weeklyRunAttemptQuota.attemptsRemaining
            : getWeeklyRunAttemptsRemaining(weeklySquadState)}
          weeklyRunAttemptQuotaUnknown={Boolean(
            activeWalletAddress
            && walletProfileStatus === 'ready'
            && (
              weeklyRunAttemptQuotaOwner !== activeWalletAddress.toLowerCase()
              || weeklyRunAttemptQuota?.weeklyId !== weeklySquadState.weekKey
            )
          )}
          bossArchiveDeveloperControls={bossArchiveDeveloperControls}
          founderSandbox={isOwnerWallet}
          onUnlockSquadSlot={handleUnlockSquadSlot}
          onPurchaseMiniShip={handlePurchaseMiniShip}
          onUpgradeMiniShip={handleUpgradeMiniShip}
          onDowngradeMiniShip={handleDowngradeMiniShip}
          onEquipMiniShip={handleEquipMiniShip}
          onUpgradeMainShip={handleUpgradeMainShip}
          onDowngradeMainShip={handleDowngradeMainShip}
          isLoading={loadingLeaderboard}
          proposals={fundingProposals}
          proposalReferences={proposalReferences}
          proposalStatus={proposalStatus}
          onOpenReferral={openReferral}
          onOpenBaseAppReferral={openBaseAppInvite}
          onOpenFund={openResearchHubFund}
          onOpenProposal={openResearchHubProposal}
          onOpenXProfile={() => openExternalUrl(DONATION_CONFIG.X_PROFILE_URL)}
          onOpenTreasurySend={openTreasurySend}
          onOpenSwap={openRscSwap}
          onOpenRscInBase={openRscInBase}
          onOpenWalletRun={openWalletRunRecord}
          championClaimStatus={championClaimStatus}
          championClaimMessage={championClaimMessage}
          onClaimWeeklyChampion={claimWeeklyChampion}
          requestedChampionWinner={scorecardChampionWinner}
          onCloseRequestedChampion={() => setScorecardChampionWinner(null)}
          walletControl={!activeStoryBeat ? (
            <WalletControl
              wallet={wallet}
              onConnect={connectWallet}
              onSwitchAccount={switchWallet}
              onDisconnect={disconnectWallet}
              onOpenSwap={openRscSwap}
              placement="mission"
            />
          ) : null}
        />
      )}

      {gameState === GameState.MENU && campaignMapOpen ? (
        <React.Suspense fallback={null}>
          <CampaignMap
            open
            progress={permanentSquadState.campaignProgress}
            status={campaignMapStatus}
            errorMessage={campaignMapError}
            initialMissionId={campaignMapFocusMissionId}
            newMissionIds={campaignMapNewMissionIds}
            branches={CAMPAIGN_MAP_BRANCHES}
            branchProgressById={campaignMapBranchProgress}
            newBranchIds={permanentSquadState.campaignProgress.branchProgress.newBranchIds}
            initialBranchId={campaignMapFocusBranchId}
            unlockingBranchId={campaignMapUnlockingBranchId}
            onClose={closeCampaignMap}
            onLaunch={launchCampaignFromMap}
            onSelectRoute={selectCampaignRouteFromMap}
            onLaunchBranch={launchCampaignBranchFromMap}
            onSkipBranchAnimation={() => setCampaignMapUnlockingBranchId(null)}
            developerControls={campaignMapDeveloperControls}
          />
        </React.Suspense>
      ) : null}

      {gameState === GameState.PAUSED && isOwnerWallet && isOwnerTestRun && showTestChampionPreview ? (
        <div className="absolute inset-0 z-40">
          <StartScreen
            onStart={() => setShowTestChampionPreview(false)}
            campaignCheckpoint={campaignCheckpoint}
            allTimeLeaderboard={leaderboard}
            monthlyLeaderboard={monthlyLeaderboard}
            archivedWinners={archivedWinners}
            weeklyPresentationTime={weeklyPresentationTime}
            walletRecords={walletRecords}
            walletRuns={walletRuns}
            walletRunsLoading={walletRunsLoading}
            walletAddress={activeWalletAddress}
            selectedShipId={usableShipId}
            shipUnlocks={shipUnlocks}
            onSelectShip={setSelectedShipId}
            weeklySquadState={weeklySquadState}
            permanentSquadState={permanentSquadState}
            onClaimDailyGift={handleClaimDailyGift}
            onClaimAchievement={handleClaimAchievement}
            onRequestWalletConnect={connectWallet}
            rscBalance={rscBalanceUpdate.balance}
            rscBalanceStatus={rscBalanceUpdate.status}
            walletPurchaseStatus={walletPurchaseStatus}
            onPurchaseWithRsc={requestRscPurchase}
            onRefreshRscBalance={refreshRscBalance}
            audioMuted={audioMuted}
            sfxVolumeLevel={sfxVolumeLevel}
            musicVolumeLevel={musicVolumeLevel}
            matchMusicTrackId={matchMusicTrackId}
            onToggleAudio={toggleGameAudio}
            onSfxVolumeChange={setGameSfxVolume}
            onMusicVolumeChange={setGameMusicVolume}
            onMatchMusicTrackChange={setGameMatchMusicTrack}
            founderSandbox={isOwnerWallet}
            onUnlockSquadSlot={handleUnlockSquadSlot}
            onPurchaseMiniShip={handlePurchaseMiniShip}
            onUpgradeMiniShip={handleUpgradeMiniShip}
            onDowngradeMiniShip={handleDowngradeMiniShip}
            onEquipMiniShip={handleEquipMiniShip}
            onUpgradeMainShip={handleUpgradeMainShip}
            onDowngradeMainShip={handleDowngradeMainShip}
            isLoading={loadingLeaderboard}
            proposals={fundingProposals}
            proposalReferences={proposalReferences}
            proposalStatus={proposalStatus}
            onOpenReferral={openReferral}
            onOpenBaseAppReferral={openBaseAppInvite}
            onOpenFund={openResearchHubFund}
            onOpenProposal={openResearchHubProposal}
            onOpenXProfile={() => openExternalUrl(DONATION_CONFIG.X_PROFILE_URL)}
            onOpenTreasurySend={openTreasurySend}
            onOpenSwap={openRscSwap}
            onOpenRscInBase={openRscInBase}
            onOpenWalletRun={openWalletRunRecord}
            championClaimStatus="idle"
            championClaimMessage=""
            onClaimWeeklyChampion={claimWeeklyChampion}
            testChampionWinner={testChampionWinner}
            onCloseTestChampionPreview={() => setShowTestChampionPreview(false)}
          />
        </div>
      ) : null}

      {gameState === GameState.PAUSED && !resumeCountdownActive && !showTestChampionPreview && (
        <PauseMenu
          audioMuted={audioMuted}
          missionNumber={pauseMissionPosition?.levelNumber ?? Math.max(1, Math.floor(stats.wave))}
          missionName={pauseMissionPosition?.levelName ?? getStageName(Math.max(1, Math.floor(stats.wave)))}
          waveNumber={pauseMissionPosition?.waveNumber ?? 1}
          waveTotal={pauseMissionPosition?.waveTotal ?? 1}
          absoluteWaveNumber={pauseMissionPosition?.absoluteWaveNumber ?? 1}
          continuousRun={pauseMissionPosition?.continuousRun ?? isWeeklyCampaignRun}
          sfxVolumeLevel={sfxVolumeLevel}
          musicVolumeLevel={musicVolumeLevel}
          matchMusicTrackId={activeMatchMusicTrackId}
          onMusicVolumeChange={setGameMusicVolume}
          onMatchMusicTrackChange={setActiveGameMatchMusicTrack}
          polishSettings={polishSettings}
          quitLabel={isWeeklyCampaignRun ? 'Forfeit Run' : 'Exit Run'}
          onResume={beginResumeCountdown}
          onQuit={isBossArchiveRun
            ? returnToBossArchive
            : isWeeklyCampaignRun
              ? endWeeklyCampaignStreak
            : isCampaignBranchRun
              ? () => { void returnToCampaignMapAfterBranchAttempt('interrupted'); }
              : resetGame}
          onToggleAudio={toggleGameAudio}
          onSfxVolumeChange={setGameSfxVolume}
          onTogglePolishSetting={togglePolishSetting}
          founderControls={isOwnerWallet && isOwnerTestRun ? (
            <div className="text-left">
                  <div className="mb-3 border-b border-cyan-200/18 pb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Founder Test Controls</p>
                    <p className="mt-1 text-[9px] font-bold leading-relaxed text-slate-400">Jump missions, refill upgrades, or preview the winner flow. This test run cannot enter the leaderboard.</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">Select mission</p>
                      <div className="grid grid-cols-5 overflow-hidden border border-cyan-200/30">
                        {Array.from({ length: AUTHORED_CAMPAIGN_STAGE_COUNT }, (_, index) => index + 1).map((wave) => (
                          <button
                            key={wave}
                            type="button"
                            onClick={() => jumpOwnerTestWave(wave)}
                            className={`min-h-10 border-r border-cyan-200/20 px-2 text-[10px] font-black last:border-r-0 ${stats.wave === wave ? 'bg-cyan-300/25 text-white' : 'bg-slate-950/55 text-cyan-200'}`}
                            aria-label={`Jump to mission ${wave}`}
                          >
                            M{wave}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={jumpOwnerTestBoss}
                        className="mt-2 min-h-10 w-full border border-red-200/35 bg-red-300/12 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-red-50 transition hover:border-red-100/60 hover:bg-red-300/20"
                        aria-label={`Jump to boss of mission ${stats.wave}`}
                      >
                        Jump to Mission {stats.wave} boss
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={refillOwnerTestFlasks} className="border border-cyan-200/35 bg-cyan-300/12 px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-50">
                        Refill 40 flasks
                      </button>
                      <button type="button" onClick={() => setShowTestChampionPreview(true)} className="border border-yellow-200/35 bg-yellow-300/12 px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-yellow-50">
                        Preview winner
                      </button>
                      <button type="button" onClick={finishOwnerTestRun} className="col-span-2 border border-violet-200/35 bg-violet-300/12 px-2 py-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-violet-50">
                        Finish test run
                      </button>
                    </div>
                  </div>
            </div>
          ) : undefined}
        />
      )}

      {gameState === GameState.GAMEOVER && (
        <GameOverPresentation footer={gameOverContinueControls} campaignComplete={campaignCompletedRun}>
          {isBossArchiveRun ? (
            <div className="sci-gameover-result-content relative z-10 grid gap-3 p-2 text-center">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-red-200">
                Boss Archive / {activeBossArchiveRun?.difficultyId ?? 'easy'}
              </p>
              <h2 className="arcade-font text-2xl font-black uppercase tracking-widest text-white">
                Challenge Failed
              </h2>
              {activeBossReplay ? (
                <div className="mx-auto grid w-full max-w-xs grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 border border-cyan-200/25 bg-cyan-300/8 p-3 text-left">
                  <img
                    src={activeBossReplay.artUrl}
                    alt=""
                    className="h-[4.5rem] w-[4.5rem] object-contain [image-rendering:pixelated]"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black uppercase text-cyan-50">{activeBossReplay.label}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                      Mission {activeBossReplay.missionNumber} / {activeBossReplay.missionName}
                    </p>
                  </div>
                </div>
              ) : null}
              <p className="text-xs font-semibold text-slate-300">
                This fight used one daily charge and does not affect the weekly leaderboard.
              </p>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => activeBossReplay && startBossArchiveFight(activeBossReplay, {
                    mode: 'challenge',
                    variantId: 'standard',
                    difficultyId: activeBossArchiveRun?.difficultyId ?? 'easy'
                  })}
                  disabled={!activeBossReplay || bossArchiveDailyChargeStatus.remaining <= 0}
                  className="scicon-btn min-h-11 w-full py-2.5 text-xs font-bold disabled:opacity-50"
                >
                  RETRY BOSS
                </button>
                <button type="button" onClick={returnToBossArchive} className="scicon-btn min-h-11 w-full py-2.5 text-xs font-bold">
                  BOSS ARCHIVE
                </button>
                <button type="button" onClick={returnToMainMenu} className="scicon-btn scicon-btn-secondary min-h-11 w-full py-2.5 text-xs font-bold text-gray-300">
                  MAIN MENU
                </button>
              </div>
            </div>
          ) : isCampaignBranchRun ? (
            <div className="sci-gameover-result-content relative z-10 grid gap-3 p-2 text-center">
              <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
                Optional Mastery Route
              </p>
              <h2 className="arcade-font text-2xl font-black uppercase tracking-widest text-white">
                Supply Signal Lost
              </h2>
              <div className="mx-auto w-full max-w-xs border border-cyan-200/25 bg-cyan-300/8 p-3">
                <p className="text-sm font-black uppercase text-cyan-50">
                  {activeCampaignBranch?.displayName ?? 'Research Supply Drop'}
                </p>
                <p className="mt-2 text-[10px] font-bold leading-relaxed text-slate-300">
                  Provisional Tokens were discarded. This optional route remains available and your main Mission checkpoint was not changed.
                </p>
              </div>
              <div className="grid gap-2">
                <PixelActionButton tone="green" ready shine onClick={retryGame} className="min-h-11 w-full">
                  Retry Supply Drop
                </PixelActionButton>
                <PixelActionButton tone="neutral" onClick={() => { void returnToCampaignMapAfterBranchAttempt(); }} className="min-h-11 w-full">
                  Return to Campaign Map
                </PixelActionButton>
              </div>
            </div>
          ) : (
            <div className="sci-gameover-result-content relative z-10 grid gap-2 p-1 text-center">
              {weeklyRunResultSummary ? (
                <div className="sci-weekly-run-result">
                  <p className="sci-weekly-run-result__eyebrow">Weekly Run</p>
                  <div className="sci-weekly-run-result__grid">
                    <div>
                      <strong>{weeklyRunResultSummary.sectorReached}</strong>
                      <span>Wave</span>
                    </div>
                    <div>
                      <strong>{weeklyRunResultSummary.bossesCleared}</strong>
                      <span>Bosses</span>
                    </div>
                    <div>
                      <strong>{weeklyRunResultSummary.points.toLocaleString()}</strong>
                      <span>Score</span>
                    </div>
                  </div>
                </div>
              ) : null}
              {weeklyRunResultSummary ? null : missionResultBanner}

              {showNameInput ? (
                <>
                  <form onSubmit={submitScore} className="grid gap-2">
                    {scoreSubmitError ? (
                      <p className="rounded-[7px] border border-red-300/20 bg-red-500/10 px-3 py-2 text-center text-[10px] font-semibold leading-snug text-red-100">
                        {scoreSubmitError}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <label htmlFor="pilot-score-name" className="sr-only">Pilot name</label>
                      <input
                        id="pilot-score-name"
                        type="text"
                        maxLength={15}
                        value={playerNameInput}
                        onChange={(e) => setPlayerNameInput(e.target.value.toUpperCase())}
                        className="min-h-11 min-w-0 rounded-[7px] border border-indigo-400/70 bg-black/55 px-3 py-2.5 text-center font-mono text-lg uppercase text-white focus:border-yellow-300 focus:outline-none disabled:opacity-50"
                        placeholder="PILOT NAME"
                        disabled={isSubmittingScore}
                      />
                      <button
                        type="submit"
                        disabled={!playerNameInput || isSubmittingScore}
                        className="scicon-btn min-h-11 min-w-28 px-3 py-2 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                      >
                        {isSubmittingScore ? 'Saving...' : 'Submit'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={skipScoreSubmission}
                      disabled={isSubmittingScore}
                      className="sci-gameover-skip-score justify-self-center px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400 transition hover:text-red-100 disabled:opacity-50"
                    >
                      {isFounderSandboxRun ? 'Exit test' : 'Skip score'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    {runReceipt && runReceipt.integrity !== 'local-unverified' ? (
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[8px] border border-cyan-200/20 bg-cyan-300/8 p-3 text-left">
                        <div>
                          <p className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-cyan-200">Mission Record</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-300">Share it free or mint it on Base.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMissionRecordPreview(true);
                            trackEvent('mint_preview_opened', { record_type: 'mission' });
                          }}
                          className="rounded-[7px] border border-cyan-100/35 bg-cyan-300/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/25"
                        >
                          View / mint
                        </button>
                      </div>
                    ) : null}
                    {scoreSaved && !isFounderSandboxRun ? (
                      <p className="text-center text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100">
                        Global score saved
                      </p>
                    ) : null}
                    <div className="sci-gameover-actions">
                      <button type="button" onClick={retryGame} className="scicon-btn sci-gameover-action sci-gameover-action--retry">
                        {isWeeklyCampaignRun ? 'NEW WEEKLY RUN' : 'RETRY MISSION'}
                      </button>
                      <button type="button" onClick={openSquadHangar} className="scicon-btn sci-gameover-action sci-gameover-action--hangar">HANGAR</button>
                      <button type="button" onClick={resetGame} className="scicon-btn sci-gameover-action sci-gameover-action--home">MAIN MENU</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </GameOverPresentation>
      )}



      {gameState === GameState.ABOUT && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col p-1">
            <div className="scicon-border-container"></div>
            <div className="scicon-inner-bg"></div>
            <div className="scicon-node node-tl-1"></div>
            <div className="scicon-node node-tr-1"></div>
            <div className="scicon-node node-bl-1"></div>
            <div className="scicon-node node-br-1"></div>

            <div className="relative z-10 space-y-6 overflow-y-auto p-6 text-center custom-scrollbar">
              <h2 className="arcade-font text-3xl font-black tracking-widest text-white">MISSION BRIEFING</h2>

              <div className="space-y-4 text-left font-mono text-sm leading-relaxed text-gray-300">
                <p>
                  <strong className="text-indigo-400">OBJECTIVE:</strong> Pilot the <span className="text-white">Research Flask</span> through the bottlenecks slowing open science. Score high, tune the ship in the lab, and fight for proposals that deserve funding.
                </p>
                <div>
                  <strong className="text-indigo-400">ENEMIES:</strong>
                  <ul className="mt-1 list-inside list-disc space-y-1 pl-2">
                    <li><span className="text-red-400">Predatory Journals:</span> Fast, aggressive, and relentless.</li>
                    <li><span className="text-yellow-500">Bureaucracy Bricks:</span> Heavy moving obstacles that clog the lane.</li>
                    <li><span className="text-green-500">Misinformation Swarms:</span> Weak individually but deadly in numbers.</li>
                    <li><span className="font-bold text-red-600">THE GATEKEEPER:</span> A towering boss that guards the path to publication.</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-indigo-400">RSC LAB:</strong>
                  <ul className="mt-1 list-inside list-disc space-y-1 pl-2">
                    <li><span className="text-yellow-300">Continues:</span> After a crash, pay RSC to revive this run with five hearts.</li>
                    <li><span className="text-cyan-300">Upgrades:</span> Dock at the lab for fire rate, handling, your signature move, and emergency repairs.</li>
                    <li><span className="text-purple-400">Current Run:</span> Lab upgrades reset each mission, so the best pilots decide when to tune up.</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-indigo-400">FUNDING EVENT:</strong>
                  <p className="mt-1">
                    The weekly leaderboard drives the funding allocation. After the week closes, the verified No. 1 pilot gets a claim window to connect a Base Account and choose an eligible ResearchHub proposal. Funding is only marked directed after its transaction confirms.
                  </p>
                </div>
                <p className="mt-4 border-t border-gray-700 pt-2 text-xs italic text-gray-500">
                  "Upgrade the ship. Clear the bottleneck. Fund the future."
                </p>
              </div>

              <button
                onClick={() => setGameState(GameState.MENU)}
                className="scicon-btn w-full py-3 text-lg font-bold"
              >
                ACKNOWLEDGED
              </button>
            </div>
          </div>
        </div>
      )}

      {activeStoryBeat ? (
        <React.Suspense fallback={null}>
          <StoryTransmission
            beat={activeStoryBeat}
            onComplete={completeStoryTransmission}
          />
        </React.Suspense>
      ) : null}

      {showWeeklyProposalSelection && runReceipt ? (
        <React.Suspense fallback={null}>
          <WeeklyProposalSelection
            pilotName={missionRecordPilotName || playerNameInput || 'PILOT'}
            score={runReceipt.metrics.score}
            proposals={fundingProposals}
            proposalStatus={proposalStatus}
            selectionStatus={weeklyProposalSelectionStatus}
            selectionMessage={weeklyProposalSelectionMessage}
            initialProposalId={monthlyLeaderboard.find((entry) => entry.runId === runReceipt.runId)?.proposalId ?? null}
            dismissible={weeklyProposalSelectionMode === 'recovery'}
            onConfirm={(proposal) => void confirmWeeklyLeaderProposal(proposal)}
            onProposalChange={() => {
              if (weeklyProposalSelectionStatus !== 'error') return;
              setWeeklyProposalSelectionStatus('idle');
              setWeeklyProposalSelectionMessage('');
            }}
            onRetry={() => void refreshFundingProposals()}
            onClose={closeWeeklyProposalSelection}
          />
        </React.Suspense>
      ) : null}

      {showMissionRecordPreview && runReceipt ? (
        <React.Suspense fallback={null}>
          <MissionRecordPreview
            pilotName={previewPilotName}
            receipt={runReceipt}
            walletAddress={activeWalletAddress}
            walletStatus={wallet.status}
            mintConfigured={mintConfigured}
            mintStatus={missionMintStatus}
            mintMessage={missionMintMessage}
            onConnect={connectWallet}
            onSwitchAccount={switchWallet}
            onDisconnect={disconnectWallet}
            onGetBaseApp={openBaseAppInvite}
            onMint={mintCurrentMissionRecord}
            weeklyFunding={missionRecordWeeklyFunding}
            onOpenWeeklyFunding={openMissionRecordWeeklyFunding}
            onRetryRun={retryGame}
            onHangar={openSquadHangar}
            onMainMenu={() => {
              setShowMissionRecordPreview(false);
              resetGame();
            }}
            onClose={() => setShowMissionRecordPreview(false)}
          />
        </React.Suspense>
      ) : null}

      <SciconOnboarding
        profileId={activeProfileId}
        surface={onboardingSurface}
        invitationNonce={onboardingInvitationNonce}
        suspended={onboardingSuspended}
        restartNonce={onboardingRestartNonce}
        onGameplayFreezeChange={handleOnboardingGameplayFreezeChange}
        onInvitationDecision={handleOnboardingInvitationDecision}
        onStepChange={setOnboardingStepId}
        dailyGiftClaimedToday={onboardingDailyGiftStatus.claimedToday}
        leftWingUnlocked={weeklySquadState.unlockedSlots.left}
        skipRewardEconomy={isOwnerWallet}
      />

    </div>
  );
};

export default App;
