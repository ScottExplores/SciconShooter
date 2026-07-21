import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StartScreen from './components/StartScreen';
import MissionLoadingScreen, { type MissionLoadingPhase } from './components/MissionLoadingScreen';
import { ArchivedWinner, DonationStatus, FieldUpgradeType, GamePolishSettings, GameState, LeaderboardEntry, MintRecord, PowerupType, Stats, Upgrades, WalletSession } from './types';
import { audioService } from './services/audioService';
import { ASSETS, DONATION_CONFIG, FIELD_UPGRADE_CONFIG, GAME_CONFIG, STORAGE_KEYS, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from './constants';
import { ALL_TIME_SCORE_LIMIT, WEEKLY_SCORE_LIMIT, getLeaderboardData, saveScore, saveWeeklyLeaderProposal } from './services/leaderboardService';
import { getArchivedWeeklyWinners } from './services/winnerArchiveService';
import { getMissionRecordWeeklyFunding } from './services/weeklyFundingFlow';
import { getResearchHubFundingProposals, ResearchHubProposal } from './services/researchHubProposals';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';
import { hasSeenStoryBeatToday, markStoryBeatSeenToday } from './services/storyTransmissionSchedule';
import { BASE_FLASK_CHARGE_MAX, getChargeForStoredFlasks, getFlaskProgress, spendStoredFlasks } from './services/flaskProgress';
import type { WalletRuntimeAction } from './components/WalletRuntime';
import {
  finishRunSession,
  startRunSession,
  type RunReceipt,
  type RunSession
} from './services/runReceiptService';
import { trackEvent, trackInitialVisit } from './services/analyticsService';
import { getWalletRecords } from './services/recordService';
import { getWalletRuns, type WalletRunRecord } from './services/playerRunService';
import {
  getUsablePlayerShip,
  getPlayerShipUnlocks,
  parsePlayerShipId,
  PLAYER_SHIPS,
  type PlayerShipId
} from './services/playerShipService';
import type { WaveVictorySummary } from './services/gameLogic';
import PauseMenu from './components/PauseMenu';
import GameOverPresentation from './components/GameOverPresentation';
import { WalletControl } from './components/WalletControl';
import {
  adjustFounderMainShipUpgrade,
  adjustFounderMiniShipLevel,
  applySquadRunResult,
  awardWeeklySquadCoins,
  buildRuntimeSquadLoadout,
  createFounderSquadSandboxState,
  emitSquadDomainEvent,
  equipMiniShip,
  loadPermanentSquadState,
  loadWeeklySquadState,
  preloadMiniShipTextures,
  purchaseMiniShip,
  savePermanentSquadState,
  saveWeeklySquadState,
  unlockSquadSlot,
  upgradeMainShip,
  upgradeMiniShip,
  type MainShipUpgradeId,
  type MiniShipId,
  type PermanentSquadState,
  type RuntimeSquadLoadout,
  type SquadSlotId,
  type WeeklySquadState
} from './services/squadProgression';
import {
  claimAchievement as claimAchievementReward,
  claimDailyGift as claimDailyGiftReward,
  recordBossVictory,
  recordLifetimeRun,
  type AchievementId
} from './services/rewardProgression';
import { getStageName } from './services/stagePresentation';

const WalletRuntime = React.lazy(() => import('./components/WalletRuntime'));
const loadGameStage = () => import('./components/GameStage');
const loadStoryTransmission = () => import('./components/StoryTransmission');
const MissionRecordPreview = React.lazy(() => import('./components/MissionRecordPreview'));
const WeeklyProposalSelection = React.lazy(() => import('./components/WeeklyProposalSelection'));
const WaveVictoryOverlay = React.lazy(() => import('./components/WaveVictoryOverlay'));
const GameStage = React.lazy(loadGameStage);
const StoryTransmission = React.lazy(loadStoryTransmission);

type GameplayPreloadPhase = Exclude<MissionLoadingPhase, 'error' | 'runtime-sync'>;
type GameplayPreloadListener = (progress: number, phase: GameplayPreloadPhase) => void;

const MISSION_LOADING_TIPS = [
  'Break boss cannons first to remove their fire lanes before attacking the hull.',
  'Coins fund weekly upgrades. Minted mission records remain part of your permanent collection.',
  'Companion ships have distinct roles. Match their abilities to the bottleneck ahead.',
  'A warm mission launch reuses decoded systems, so retries can deploy immediately.',
  'Collect dropped research coins quickly, or bring a magnet companion to pull them in.',
  'Save bombs for dense swarms or the moment a boss fills the screen with projectiles.'
] as const;

const getRandomMissionLoadingTip = () => (
  MISSION_LOADING_TIPS[Math.floor(Math.random() * MISSION_LOADING_TIPS.length)]
);

let gameplayPreloadPromise: Promise<void> | null = null;
let gameplayPreloadReady = false;
let gameplayPreloadProgress = 0;
let gameplayPreloadPhase: GameplayPreloadPhase = 'flight-systems';
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

  const gameStageModule = loadGameStage().then((gameplay) => {
    updateGameplayPreload(gameplayPreloadProgress + 34, 'mission-interface');
    return gameplay;
  });
  const storyTransmissionModule = loadStoryTransmission().then((storyTransmission) => {
    updateGameplayPreload(
      gameplayPreloadProgress + 12,
      gameplayPreloadPhase === 'mission-art' || gameplayPreloadPhase === 'ready'
        ? gameplayPreloadPhase
        : 'mission-interface'
    );
    return storyTransmission;
  });
  const productionAssets = gameStageModule.then(async (gameplay) => {
    updateGameplayPreload(gameplayPreloadProgress, 'mission-art');
    await gameplay.preloadGameplayAssets();
    updateGameplayPreload(gameplayPreloadProgress + 46, 'mission-art');
  });

  gameplayPreloadPromise = Promise.all([
    gameStageModule,
    storyTransmissionModule,
    productionAssets
  ]).then(() => {
    updateGameplayPreload(92, 'mission-art');
    gameplayPreloadReady = true;
  }).catch((error: unknown) => {
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
type ActiveRunMode = 'standard' | 'owner-test';
type MissionLoadingState = {
  progress: number;
  phase: MissionLoadingPhase;
  tip: string;
};
type PendingMissionRuntimeLaunch = {
  launchNonce: number;
  gameId: number;
  startInTestMode: boolean;
  tip: string;
  squadLoadout: RuntimeSquadLoadout;
};

const OWNER_TEST_FLASK_COUNT = 40;
const OWNER_TEST_FLASK_CHARGE = getChargeForStoredFlasks(OWNER_TEST_FLASK_COUNT);
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
  missile: 0
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
  [PowerupType.MAX_SHOT]: 0,
  [PowerupType.MAGNET]: 0,
  [PowerupType.SHIELD]: 0,
  [PowerupType.EXTRA_LIFE]: 0,
  [PowerupType.RESEARCH_BEAM]: 0
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [gameId, setGameId] = useState<number>(0);
  const [gameRuntimeReady, setGameRuntimeReady] = useState(false);
  const [missionLoading, setMissionLoading] = useState<MissionLoadingState | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [archivedWinners, setArchivedWinners] = useState<ArchivedWinner[]>([]);
  const [walletRecords, setWalletRecords] = useState<MintRecord[]>([]);
  const [walletRuns, setWalletRuns] = useState<WalletRunRecord[]>([]);
  const [walletRunsLoading, setWalletRunsLoading] = useState(false);
  const [selectedShipId, setSelectedShipId] = useState<PlayerShipId>(() => (
    parsePlayerShipId(localStorage.getItem(STORAGE_KEYS.SELECTED_SHIP))
  ));
  const [weeklySquadState, setWeeklySquadState] = useState<WeeklySquadState>(() => (
    loadWeeklySquadState(null)
  ));
  const [permanentSquadState, setPermanentSquadState] = useState<PermanentSquadState>(() => (
    loadPermanentSquadState(null)
  ));
  const [fundingProposals, setFundingProposals] = useState<ResearchHubProposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState<ProposalFeedStatus>('loading');
  const [playerNameInput, setPlayerNameInput] = useState<string>('');
  const [showNameInput, setShowNameInput] = useState<boolean>(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [scoreSaved, setScoreSaved] = useState<boolean>(false);
  const [scoreSubmitError, setScoreSubmitError] = useState<string>('');
  const [showLabGlow, setShowLabGlow] = useState<boolean>(true);
  const [walletError, setWalletError] = useState<string>('');
  const [walletRuntimeEnabled, setWalletRuntimeEnabled] = useState(() => (
    Boolean(localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS))
  ));
  const [walletRuntimeAction, setWalletRuntimeAction] = useState<WalletRuntimeAction | null>(null);
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
  const [waveContinueCommand, setWaveContinueCommand] = useState<{ nonce: number } | null>(null);
  const [waveVictorySummary, setWaveVictorySummary] = useState<WaveVictorySummary | null>(null);
  const [activeRunMode, setActiveRunMode] = useState<ActiveRunMode>('standard');
  const [testWaveCommand, setTestWaveCommand] = useState<{ nonce: number; wave: number } | null>(null);
  const [testBossCommand, setTestBossCommand] = useState<{ nonce: number; wave: number } | null>(null);
  const [testFlaskCommand, setTestFlaskCommand] = useState<{ nonce: number; charge: number } | null>(null);
  const [showTestChampionPreview, setShowTestChampionPreview] = useState(false);
  const [ownerFrameFrozen, setOwnerFrameFrozen] = useState(false);
  const [introMissionLocked, setIntroMissionLocked] = useState(false);
  const [donatedWallets] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DONATED_WALLETS) || '{}');
    } catch {
      return {};
    }
  });
  const lastStoryWaveRef = useRef(0);
  const missionLaunchNonceRef = useRef(0);
  const missionLaunchPendingRef = useRef(false);
  const pendingMissionRuntimeRef = useRef<PendingMissionRuntimeLaunch | null>(null);
  const introStoryTimeoutRef = useRef<number | null>(null);
  const weeklyProposalTransitionRef = useRef<number | null>(null);
  const weeklyProposalReturnRef = useRef<'results' | 'record'>('results');
  const gameStateRef = useRef<GameState>(GameState.MENU);
  const submittingScoreRef = useRef(false);
  const submittedScoreKeysRef = useRef<Set<string>>(new Set());
  const runSessionPromiseRef = useRef<Promise<RunSession> | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const activeRunShipIdRef = useRef<PlayerShipId>('researchhub');
  const runReceiptPromiseRef = useRef<Promise<RunReceipt> | null>(null);
  const finalizedRunGameIdRef = useRef<number | null>(null);
  const squadRunAppliedGameIdRef = useRef<number | null>(null);
  const permanentRunAppliedGameIdRef = useRef<number | null>(null);
  const permanentBossAppliedKeysRef = useRef<Set<string>>(new Set());
  const activeRunSquadLoadoutRef = useRef<RuntimeSquadLoadout>(
    buildRuntimeSquadLoadout(weeklySquadState, 'researchhub')
  );
  const walletActionNonceRef = useRef(0);
  const rewardClaimInFlightRef = useRef(false);
  const walletProfileAddressRef = useRef<string | null>(null);
  const hasLoadedWalletProfileRef = useRef(walletRuntimeEnabled);
  const [runReceipt, setRunReceipt] = useState<RunReceipt | null>(null);
  const [runReceiptStatus, setRunReceiptStatus] = useState<'idle' | 'starting' | 'finalizing' | 'ready' | 'local' | 'error'>('idle');
  const [showMissionRecordPreview, setShowMissionRecordPreview] = useState(false);
  const [missionRecordPilotName, setMissionRecordPilotName] = useState<string | null>(null);
  const [showWeeklyProposalSelection, setShowWeeklyProposalSelection] = useState(false);
  const [weeklyProposalSelectionStatus, setWeeklyProposalSelectionStatus] = useState<ProposalSelectionStatus>('idle');
  const [weeklyProposalSelectionMessage, setWeeklyProposalSelectionMessage] = useState('');
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

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    rewardClaimInFlightRef.current = false;
  }, [permanentSquadState]);

  useEffect(() => () => {
    missionLaunchNonceRef.current += 1;
    missionLaunchPendingRef.current = false;
    pendingMissionRuntimeRef.current = null;
    clearIntroStoryTimeout();
    clearWeeklyProposalTransition();
  }, []);

  useEffect(() => {
    trackInitialVisit();
  }, []);

  useEffect(() => {
    if (gameState !== GameState.MENU) return undefined;

    return runAfterFirstPaint(() => {
      void preloadGameplayComponents().catch(() => {
        // A foreground launch can retry a background preload interrupted by the network.
      });
    }, {
      delayMs: 280,
      timeoutMs: 1200
    });
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
  const isOwnerTestRun = activeRunMode === 'owner-test';
  const isFounderSandboxRun = isOwnerWallet || isOwnerTestRun;
  const previewPilotName = missionRecordPilotName || playerNameInput || 'PILOT';
  const missionRecordWeeklyFunding = useMemo(() => runReceipt ? getMissionRecordWeeklyFunding({
    receipt: runReceipt,
    pilotName: previewPilotName,
    weeklyLeaderboard: monthlyLeaderboard,
    archivedWinners
  }) : null, [archivedWinners, monthlyLeaderboard, previewPilotName, runReceipt]);
  const shipUnlocks = useMemo(() => {
    const unlocks = getPlayerShipUnlocks(activeWalletAddress, walletRecords, { unlockAll: isOwnerWallet });
    return {
      ...unlocks,
      eth: unlocks.eth || permanentSquadState.unlockedPlayerShips.includes('eth'),
      btc: unlocks.btc || permanentSquadState.unlockedPlayerShips.includes('btc')
    };
  }, [activeWalletAddress, isOwnerWallet, permanentSquadState.unlockedPlayerShips, walletRecords]);
  const usableShipId = getUsablePlayerShip(selectedShipId, shipUnlocks);
  const playerShipUrl = PLAYER_SHIPS[usableShipId].assetUrl;

  const updateWeeklySquadState = useCallback((
    update: (current: WeeklySquadState) => WeeklySquadState,
    persist = true
  ) => {
    setWeeklySquadState((current) => {
      const next = update(current);
      if (persist && next !== current) saveWeeklySquadState(next);
      return next;
    });
  }, []);

  const updatePermanentSquadState = useCallback((
    update: (current: PermanentSquadState) => PermanentSquadState
  ) => {
    setPermanentSquadState((current) => {
      const next = update(current);
      if (next !== current) savePermanentSquadState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const loaded = loadWeeklySquadState(activeWalletAddress);
    const next = isOwnerWallet ? createFounderSquadSandboxState(loaded) : loaded;
    setWeeklySquadState(next);
    setPermanentSquadState(loadPermanentSquadState(activeWalletAddress));
    activeRunSquadLoadoutRef.current = buildRuntimeSquadLoadout(next, 'researchhub');
    preloadMiniShipTextures();
  }, [activeWalletAddress, isOwnerWallet]);

  const handleUnlockSquadSlot = useCallback((slot: SquadSlotId) => {
    if (isOwnerWallet) return;
    updateWeeklySquadState((current) => unlockSquadSlot(current, slot));
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handlePurchaseMiniShip = useCallback((id: MiniShipId) => {
    if (isOwnerWallet) return;
    updateWeeklySquadState((current) => purchaseMiniShip(current, id));
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleUpgradeMiniShip = useCallback((id: MiniShipId) => {
    if (isOwnerWallet) {
      updateWeeklySquadState((current) => adjustFounderMiniShipLevel(current, id, 1), false);
      return;
    }
    updateWeeklySquadState((current) => upgradeMiniShip(current, id));
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleDowngradeMiniShip = useCallback((id: MiniShipId) => {
    if (!isOwnerWallet) return;
    updateWeeklySquadState((current) => adjustFounderMiniShipLevel(current, id, -1), false);
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleEquipMiniShip = useCallback((slot: SquadSlotId, id: MiniShipId | null) => {
    updateWeeklySquadState((current) => equipMiniShip(current, slot, id), !isOwnerWallet);
  }, [isOwnerWallet, updateWeeklySquadState]);

  const handleUpgradeMainShip = useCallback((id: MainShipUpgradeId) => {
    if (isOwnerWallet) {
      updateWeeklySquadState((current) => adjustFounderMainShipUpgrade(current, usableShipId, id, 1), false);
      return;
    }
    updateWeeklySquadState((current) => upgradeMainShip(current, usableShipId, id));
  }, [isOwnerWallet, updateWeeklySquadState, usableShipId]);

  const handleDowngradeMainShip = useCallback((id: MainShipUpgradeId) => {
    if (!isOwnerWallet) return;
    updateWeeklySquadState((current) => adjustFounderMainShipUpgrade(current, usableShipId, id, -1), false);
  }, [isOwnerWallet, updateWeeklySquadState, usableShipId]);
  const beginRunSession = useCallback((testRun: boolean) => {
    if (runSessionPromiseRef.current) return;

    runStartedAtRef.current = Date.now();
    setRunReceiptStatus('starting');
    runSessionPromiseRef.current = startRunSession({
      testRun,
      playerShipId: activeRunShipIdRef.current
    }).then((session) => {
      setRunReceiptStatus(session.localOnly ? 'local' : 'idle');
      return session;
    });
  }, []);
  const continueRscCost = (continuesUsed + 1) * 5;
  const isContinuePaymentBusy = continuePaymentStatus === 'switching_network'
    || continuePaymentStatus === 'processing'
    || continuePaymentStatus === 'confirming';

  const getWalletProfileKey = (walletAddress?: string | null) => (
    walletAddress ? `${STORAGE_KEYS.PLAYER_STATS}:${walletAddress.toLowerCase()}` : STORAGE_KEYS.PLAYER_STATS
  );

  const readSavedStats = (walletAddress?: string | null) => {
    if (!walletAddress) {
      return {
        highScore: parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_SCORE) || '0'),
        totalCoins: 0,
        playerName: ''
      };
    }

    const savedStats = localStorage.getItem(getWalletProfileKey(walletAddress));

    if (savedStats) {
      try {
        return JSON.parse(savedStats);
      } catch (e) {
        console.error("Failed to parse saved stats", e);
      }
    }

    return {
      highScore: 0,
      totalCoins: 0,
      playerName: ''
    };
  };

  useEffect(() => {
    let active = true;
    let cancelDeferredFetch: (() => void) | null = null;

    const fetchScores = async () => {
      const alreadyHasData = leaderboard.length > 0;
      if (!alreadyHasData) {
        setLoadingLeaderboard(true);
      }

      try {
        const data = await getLeaderboardData();
        if (!active) return;
        if (data.scores.length > 0) {
          setLeaderboard(data.scores);
        }
        setMonthlyLeaderboard(data.monthlyScores);
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        if (active && !alreadyHasData) {
          setLoadingLeaderboard(false);
        }
      }
    };

    const fetchArchivedWinners = async () => {
      const winners = await getArchivedWeeklyWinners();
      if (!active) return;
      setArchivedWinners(winners);
    };

    const fetchDashboardData = () => {
      void Promise.all([fetchScores(), fetchArchivedWinners()]);
    };

    if (gameState === GameState.GAMEOVER) {
      fetchDashboardData();
    } else if (gameState === GameState.MENU) {
      cancelDeferredFetch = runAfterFirstPaint(fetchDashboardData, {
        delayMs: leaderboard.length > 0 ? 900 : 450,
        timeoutMs: 2200
      });
    }

    return () => {
      active = false;
      cancelDeferredFetch?.();
    };
  }, [gameState, leaderboard.length]);

  const refreshFundingProposals = useCallback(async (background = false) => {
    if (!background) setProposalStatus('loading');
    try {
      const nextProposals = await getResearchHubFundingProposals();
      setFundingProposals(nextProposals);
      setProposalStatus(nextProposals.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      console.error('ResearchHub proposal feed failed:', error);
      if (!background) {
        setFundingProposals([]);
        setProposalStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    const cancelDeferredFetch = runAfterFirstPaint(() => {
      void refreshFundingProposals();
    }, {
      delayMs: 950,
      timeoutMs: 3200
    });

    return cancelDeferredFetch;
  }, [refreshFundingProposals]);

  useEffect(() => {
    if (gameState !== GameState.MENU) return undefined;

    const refreshId = window.setInterval(() => {
      void refreshFundingProposals(true);
    }, PROPOSAL_REFRESH_MS);

    return () => window.clearInterval(refreshId);
  }, [gameState, refreshFundingProposals]);

  const getInitialStats = (): Stats => {
    const parsed = readSavedStats(activeWalletAddress);

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
  const [polishSettings, setPolishSettings] = useState<GamePolishSettings>(getInitialPolishSettings);
  const [audioMuted, setAudioMuted] = useState(() => audioService.isMuted());

  useEffect(() => {
    const statsToSave = {
      highScore: stats.highScore,
      totalCoins: stats.totalCoins,
      playerName: playerNameInput
    };
    const walletProfileAddress = walletProfileAddressRef.current;
    const normalizedActiveWalletAddress = activeWalletAddress?.toLowerCase() || null;
    if (walletProfileAddress && walletProfileAddress === normalizedActiveWalletAddress) {
      localStorage.setItem(getWalletProfileKey(walletProfileAddress), JSON.stringify(statsToSave));
    } else if (!walletProfileAddress && !normalizedActiveWalletAddress) {
      localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.highScore.toString());
    }
  }, [activeWalletAddress, playerNameInput, stats.highScore, stats.totalCoins]);

  useEffect(() => {
    if (activeWalletAddress) return;

    walletProfileAddressRef.current = null;
    if (gameState !== GameState.MENU) return;

    setStats((current) => ({
      ...current,
      highScore: parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_SCORE) || '0'),
      totalCoins: 0
    }));
  }, [activeWalletAddress, gameState]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.POLISH_SETTINGS, JSON.stringify(polishSettings));
  }, [polishSettings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_SHIP, selectedShipId);
  }, [selectedShipId]);

  const togglePolishSetting = (key: keyof GamePolishSettings) => {
    setPolishSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

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
    const savedStats = readSavedStats(activeWalletAddress);
    const shouldMergeLocalProgress = !hasLoadedWalletProfileRef.current;
    walletProfileAddressRef.current = activeWalletAddress.toLowerCase();
    hasLoadedWalletProfileRef.current = true;
    const nextWalletProfile = {
      highScore: shouldMergeLocalProgress
        ? Math.max(stats.highScore, savedStats.highScore || 0)
        : savedStats.highScore || 0,
      totalCoins: shouldMergeLocalProgress
        ? Math.max(stats.totalCoins, savedStats.totalCoins || 0)
        : savedStats.totalCoins || 0,
      playerName: shouldMergeLocalProgress
        ? playerNameInput || savedStats.playerName || ''
        : savedStats.playerName || ''
    };
    localStorage.setItem(
      getWalletProfileKey(activeWalletAddress),
      JSON.stringify(nextWalletProfile)
    );
    setStats(prev => ({
      ...prev,
      highScore: nextWalletProfile.highScore,
      totalCoins: nextWalletProfile.totalCoins
    }));
    setPlayerNameInput(nextWalletProfile.playerName);

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
    if (!isOwnerWallet || activeRunMode === 'owner-test') return;
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
    beginRunSession(true);
  }, [activeRunMode, beginRunSession, gameState, isOwnerWallet]);

  const startGame = async () => {
    if (missionLaunchPendingRef.current) return;

    const launchNonce = missionLaunchNonceRef.current + 1;
    const shouldShowMissionLoading = !gameplayPreloadReady || missionLoading?.phase === 'error';
    const loadingTip = missionLoading?.phase === 'error'
      ? missionLoading.tip
      : getRandomMissionLoadingTip();
    missionLaunchNonceRef.current = launchNonce;
    missionLaunchPendingRef.current = true;
    audioService.init();

    if (shouldShowMissionLoading) {
      setMissionLoading({
        progress: gameplayPreloadProgress,
        phase: gameplayPreloadPhase,
        tip: loadingTip
      });
    }

    try {
      await preloadGameplayComponents((progress, phase) => {
        if (!shouldShowMissionLoading || missionLaunchNonceRef.current !== launchNonce) return;
        setMissionLoading((current) => current ? { ...current, progress, phase } : current);
      });
    } catch {
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

    const startInTestMode = isOwnerWallet;
    const nextGameId = gameId + 1;
    const squadLoadout = buildRuntimeSquadLoadout(weeklySquadState, usableShipId);
    const startingLives = Math.min(
      GAME_CONFIG.MAX_LIVES,
      3 + squadLoadout.upgrades.startingHearts
    );
    activeRunSquadLoadoutRef.current = squadLoadout;
    squadRunAppliedGameIdRef.current = null;
    permanentRunAppliedGameIdRef.current = null;
    permanentBossAppliedKeysRef.current.clear();
    setMissionRecordPilotName(null);
    clearIntroStoryTimeout();
    lastStoryWaveRef.current = 0;
    setActiveStoryBeat(null);
    setStats(prev => ({
      ...prev,
      score: 0,
      wave: 1,
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
        speed: squadLoadout.upgrades.speed
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
    setTestWaveCommand(null);
    setTestBossCommand(null);
    setTestFlaskCommand(null);
    setActiveRunMode(startInTestMode ? 'owner-test' : 'standard');
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
    clearWeeklyProposalTransition();
    setScorecardChampionWinner(null);
    setMissionMintStatus('idle');
    setMissionMintMessage('');
    finalizedRunGameIdRef.current = null;
    activeRunShipIdRef.current = usableShipId;
    runStartedAtRef.current = null;
    runReceiptPromiseRef.current = null;
    runSessionPromiseRef.current = null;
    setRunReceiptStatus('idle');
    submittingScoreRef.current = false;
    pendingMissionRuntimeRef.current = {
      launchNonce,
      gameId: nextGameId,
      startInTestMode,
      tip: loadingTip,
      squadLoadout
    };
    setGameRuntimeReady(false);
    if (shouldShowMissionLoading) {
      setMissionLoading({
        progress: 96,
        phase: 'runtime-sync',
        tip: loadingTip
      });
    }
    setGameId(nextGameId);
    lastStoryWaveRef.current = 1;
    setGameState(GameState.PLAYING);
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
        const introBeat = getStoryBeatForPhase(1);
        if (introBeat && !hasSeenStoryBeatToday(introBeat)) {
          setActiveStoryBeat(introBeat);
        } else {
          beginRunSession(pendingLaunch.startInTestMode || isOwnerWallet);
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

    void error;
    pendingMissionRuntimeRef.current = null;
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
    missionLaunchNonceRef.current += 1;
    missionLaunchPendingRef.current = false;
    pendingMissionRuntimeRef.current = null;
    clearIntroStoryTimeout();
    setGameRuntimeReady(false);
    setMissionLoading(null);
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    setShowTestChampionPreview(false);
    setWaveVictorySummary(null);
    setWaveContinueCommand(null);
    setShowWeeklyProposalSelection(false);
    setWeeklyProposalSelectionStatus('idle');
    setWeeklyProposalSelectionMessage('');
    clearWeeklyProposalTransition();
    setScorecardChampionWinner(null);
    setActiveRunMode('standard');
    setOwnerFrameFrozen(false);
    runStartedAtRef.current = null;
    runSessionPromiseRef.current = null;
    setGameState(GameState.MENU);
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
    setAudioMuted(audioService.toggleMute());
  };

  const showWaveVictory = (summary: WaveVictorySummary) => {
    if (activeWalletAddress && !isFounderSandboxRun) {
      const victoryKey = `${gameId}:${summary.id}`;
      if (!permanentBossAppliedKeysRef.current.has(victoryKey)) {
        permanentBossAppliedKeysRef.current.add(victoryKey);
        updatePermanentSquadState(recordBossVictory);
      }
    }
    setOwnerFrameFrozen(false);
    setWaveVictorySummary(summary);
    setGameState(GameState.WAVE_COMPLETE);
  };

  const continueAfterWaveVictory = () => {
    if (!waveVictorySummary) return;
    setWaveContinueCommand(current => ({ nonce: (current?.nonce ?? 0) + 1 }));
    setWaveVictorySummary(null);
    setGameState(GameState.PLAYING);
  };

  const completeStoryTransmission = () => {
    const completedPhase = activeStoryBeat?.phase;
    if (activeStoryBeat) {
      markStoryBeatSeenToday(activeStoryBeat);
    }
    if (completedPhase === 1) {
      beginRunSession(isOwnerTestRun || isOwnerWallet);
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
    const safeWave = Math.max(1, Math.min(5, Math.floor(wave)));
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    lastStoryWaveRef.current = safeWave;
    setTestWaveCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, wave: safeWave }));
  };

  const jumpOwnerTestBoss = () => {
    if (!isOwnerWallet || !isOwnerTestRun) return;
    const safeWave = Math.max(1, Math.min(5, Math.floor(stats.wave || 1)));
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

  const requestWalletRuntimeAction = useCallback((type: 'connect' | 'switch-account' | 'disconnect' | 'continue') => {
    setWalletRuntimeEnabled(true);
    walletActionNonceRef.current += 1;
    setWalletRuntimeAction({ type, nonce: walletActionNonceRef.current });
  }, []);

  const connectWallet = useCallback(() => {
    if (activeWalletAddress) {
      setWalletError('');
      return;
    }

    requestWalletRuntimeAction('connect');
  }, [activeWalletAddress, requestWalletRuntimeAction]);

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

  const handleClaimDailyGift = useCallback(() => {
    if (!activeWalletAddress) {
      connectWallet();
      return null;
    }
    if (rewardClaimInFlightRef.current) return null;
    const activeProfileId = activeWalletAddress.trim().toLowerCase();
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
    activeWalletAddress,
    connectWallet,
    permanentSquadState,
    persistRewardClaim,
    weeklySquadState
  ]);

  const handleClaimAchievement = useCallback((id: AchievementId) => {
    if (!activeWalletAddress) {
      connectWallet();
      return null;
    }
    if (rewardClaimInFlightRef.current) return null;
    const activeProfileId = activeWalletAddress.trim().toLowerCase();
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
    activeWalletAddress,
    connectWallet,
    permanentSquadState,
    persistRewardClaim,
    weeklySquadState
  ]);

  const disconnectWallet = useCallback(() => {
    requestWalletRuntimeAction('disconnect');
  }, [requestWalletRuntimeAction]);

  const switchWallet = useCallback(() => {
    requestWalletRuntimeAction('switch-account');
  }, [requestWalletRuntimeAction]);

  const handleContinueWithRsc = useCallback(() => {
    if (isContinuePaymentBusy || runReceipt || runReceiptPromiseRef.current) return;
    requestWalletRuntimeAction('continue');
  }, [isContinuePaymentBusy, requestWalletRuntimeAction, runReceipt]);

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

  const handleContinueSuccess = useCallback((transactionHash: string) => {
    setContinuePaymentHash(transactionHash);
    setContinuePaymentStatus('success');
    setContinuePaymentError('');
    setContinuesUsed(prev => prev + 1);
    setShowNameInput(false);
    setActiveStoryBeat(null);
    setStats(prev => ({
      ...prev,
      lives: 5
    }));
    setContinueCommand({ nonce: Date.now(), lives: 5 });
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

    if (stats.wave <= lastStoryWaveRef.current) {
      return;
    }

    const nextBeat = getStoryBeatForPhase(stats.wave);
    lastStoryWaveRef.current = stats.wave;

    if (nextBeat && !hasSeenStoryBeatToday(nextBeat)) {
      setActiveStoryBeat(nextBeat);
    }
  }, [activeStoryBeat, gameState, stats.wave]);

  const finalizeCurrentRun = async (): Promise<RunReceipt | null> => {
    if (runReceipt) return runReceipt;
    if (runReceiptPromiseRef.current) return runReceiptPromiseRef.current;
    if (finalizedRunGameIdRef.current === gameId) return null;

    trackEvent('mission_completed', { score: stats.score, wave: stats.wave });
    finalizedRunGameIdRef.current = gameId;
    setRunReceiptStatus('finalizing');
    const gameplayStartedAt = runStartedAtRef.current ?? Date.now();
    runStartedAtRef.current = gameplayStartedAt;
    const sessionPromise = runSessionPromiseRef.current ?? startRunSession({
      testRun: isOwnerTestRun,
      playerShipId: activeRunShipIdRef.current
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
      }))
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
      if (activeWalletAddress && !isFounderSandboxRun && squadRunAppliedGameIdRef.current !== gameId) {
        squadRunAppliedGameIdRef.current = gameId;
        updateWeeklySquadState((current) => applySquadRunResult(current, {
          score: stats.score,
          enemiesDefeated: stats.enemiesDefeated,
          coinsCollected: stats.coins
        }));
      }
      if (activeWalletAddress && !isFounderSandboxRun && permanentRunAppliedGameIdRef.current !== gameId) {
        permanentRunAppliedGameIdRef.current = gameId;
        updatePermanentSquadState((current) => recordLifetimeRun(current, {
          score: stats.score,
          wave: stats.wave,
          enemiesDefeated: stats.enemiesDefeated,
          coinsCollected: stats.coins
        }));
      }
      const scoreKey = `${gameId}:${stats.score}:${stats.wave}`;
      if (submittedScoreKeysRef.current.has(scoreKey)) {
        setShowNameInput(false);
        return;
      }

      if (!isFounderSandboxRun && stats.score > stats.highScore) {
        if (!activeWalletAddress) {
          localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.score.toString());
        }
        setStats(s => ({ ...s, highScore: s.score }));
      }

      setScoreSubmitError('');
      setShowNameInput(true);
    }
  }, [activeWalletAddress, gameId, gameState, isFounderSandboxRun, stats.coins, stats.enemiesDefeated, stats.score, stats.wave, stats.highScore, updatePermanentSquadState, updateWeeklySquadState]);

  const persistHighScore = async () => {
    if (!playerNameInput.trim() || submittingScoreRef.current) return false;

    submittingScoreRef.current = true;
    setIsSubmittingScore(true);
    setScoreSubmitError('');

    const name = playerNameInput.trim().substring(0, 15).toUpperCase();
    const score = stats.score;
    const wave = stats.wave;
    const scoreKey = `${gameId}:${score}:${wave}`;
    const submittedAt = new Date().toISOString();

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
      confirmedSave = true;
      return true;
    } catch (error) {
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
      void getArchivedWeeklyWinners().then(setArchivedWinners);
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
      const updatedData = await saveWeeklyLeaderProposal(runReceipt, proposal);
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
    setActiveRunMode('standard');
    setGameState(GameState.MENU);
  };

  const openMissionRecordWeeklyFunding = () => {
    if (!missionRecordWeeklyFunding) return;
    if (missionRecordWeeklyFunding.status === 'selected') {
      return;
    }

    if (missionRecordWeeklyFunding.status === 'current-leader') {
      weeklyProposalReturnRef.current = gameStateRef.current === GameState.GAMEOVER ? 'results' : 'record';
      setWeeklyProposalSelectionStatus('idle');
      setWeeklyProposalSelectionMessage('');
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
    await openExternalUrl(ASSETS.REFERRAL_LINK);
  };

  const openBaseAppInvite = async () => {
    await openExternalUrl(DONATION_CONFIG.BASE_APP_INVITE_URL);
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
    await openExternalUrl(DONATION_CONFIG.RSC_SWAP_URL);
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
  const gameOverContinueControls = !isFounderSandboxRun && !runReceipt && runReceiptStatus !== 'finalizing'
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
  const missionResultBanner = (
    <div className="relative overflow-hidden border border-cyan-200/30 bg-[radial-gradient(circle_at_82%_48%,rgba(59,130,246,0.24),transparent_27%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] px-4 py-3 shadow-[0_0_36px_rgba(34,211,238,0.12)] [clip-path:polygon(18px_0,calc(50%_-_26px)_0,calc(50%_-_16px)_8px,calc(50%_+_16px)_8px,calc(50%_+_26px)_0,calc(100%_-_18px)_0,100%_18px,100%_calc(100%_-_18px),calc(100%_-_18px)_100%,18px_100%,0_calc(100%_-_18px),0_18px)]">
      <div className="pointer-events-none absolute left-0 top-5 h-12 w-24 -translate-x-10 -skew-x-[24deg] border-y border-r border-yellow-200/35 bg-yellow-300/10" />
      <div className="pointer-events-none absolute right-0 top-5 h-12 w-24 translate-x-10 skew-x-[24deg] border-y border-l border-yellow-200/35 bg-yellow-300/10" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-3 w-14 -translate-x-1/2 bg-yellow-300 shadow-[0_0_16px_rgba(250,204,21,0.55)] [clip-path:polygon(12%_0,88%_0,100%_50%,88%_100%,12%_100%,0_50%)]" />
      <div className="relative">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Stage {stats.wave} - {resultEncounter}</p>
        <h2 className="arcade-font mt-1 text-xl font-black uppercase tracking-widest text-cyan-100">Mission Record</h2>
        <p className="mt-1 text-3xl font-black text-white">{stats.score.toLocaleString()}</p>
      </div>

      <div className="relative mt-2 grid grid-cols-3 divide-x divide-white/10 border-t border-cyan-100/15 pt-2 text-center">
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Stage</span><strong className="text-sm text-cyan-100">{stats.wave}</strong></div>
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Targets</span><strong className="text-sm text-emerald-100">{stats.enemiesDefeated}</strong></div>
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Coins</span><strong className="text-sm text-yellow-200">{stats.coins}</strong></div>
      </div>
    </div>
  );

  return (
    <div className="relative h-full w-full select-none bg-[#0b1020]">
      {walletRuntimeEnabled ? (
        <React.Suspense fallback={null}>
          <WalletRuntime
            action={walletRuntimeAction}
            continueCost={continueRscCost}
            donatedWallets={donatedWallets}
            isContinuePaymentBusy={isContinuePaymentBusy}
            walletError={walletError}
            onActionHandled={handleWalletRuntimeActionHandled}
            onContinueStatusChange={handleContinueStatusChange}
            onContinueSuccess={handleContinueSuccess}
            onWalletChange={handleWalletRuntimeChange}
            onWalletError={setWalletError}
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
          onRetry={() => { void startGame(); }}
          onCancel={cancelMissionLoading}
        />
      ) : null}

      {(gameState === GameState.PLAYING || gameState === GameState.WAVE_COMPLETE || gameState === GameState.PAUSED || gameState === GameState.GAMEOVER) && (
        <React.Suspense fallback={null}>
          <GameStage
            key={gameId}
            canvas={{
              stats,
              onStatsChange: setStats,
              running: gameState === GameState.PLAYING && gameRuntimeReady && !ownerFrameFrozen,
              onReady: () => completeMissionRuntimeLaunch(gameId),
              onInitializationError: (error) => failMissionRuntimeLaunch(gameId, error),
              onGameOver: () => {
                setOwnerFrameFrozen(false);
                setGameState(GameState.GAMEOVER);
              },
              onContinueStarted: () => setGameState(GameState.PLAYING),
              onWaveVictory: showWaveVictory,
              isTransmissionOpen: introMissionLocked || Boolean(activeStoryBeat),
              bombCommand,
              shipAbilityCommand,
              continueCommand,
              waveContinueCommand,
              polishSettings,
              playerShipUrl,
              playerShipId: usableShipId,
              squadLoadout: activeRunSquadLoadoutRef.current,
              testMode: isOwnerTestRun,
              testWaveCommand,
              testBossCommand,
              testFlaskCommand
            }}
            hud={gameRuntimeReady && (gameState === GameState.PLAYING || (gameState === GameState.PAUSED && isOwnerWallet && isOwnerTestRun)) ? {
              showLabGlow,
              onDisableLabGlow: () => setShowLabGlow(false),
              isUpgradeReady: false,
              paused: gameState === GameState.PAUSED,
              frozen: ownerFrameFrozen,
              showFreezeControl: isOwnerWallet && isOwnerTestRun,
              onPause: () => {
                setOwnerFrameFrozen(false);
                setGameState(gameState === GameState.PAUSED ? GameState.PLAYING : GameState.PAUSED);
              },
              onToggleFreeze: isOwnerWallet && isOwnerTestRun
                ? () => setOwnerFrameFrozen(frozen => !frozen)
                : undefined,
              bombLocked: gameState !== GameState.PLAYING || ownerFrameFrozen || introMissionLocked || Boolean(activeStoryBeat),
              onUseBomb: () => {
                if (introMissionLocked || activeStoryBeat) return;
                setBombCommand({ nonce: Date.now() });
              },
              selectedShipId: usableShipId,
              shipAbilityLocked: gameState !== GameState.PLAYING || ownerFrameFrozen || introMissionLocked || Boolean(activeStoryBeat),
              onUseShipAbility: () => {
                if (introMissionLocked || activeStoryBeat) return;
                setShipAbilityCommand({ nonce: Date.now() });
              },
              fieldUpgradesEnabled: false,
              onUpgrade: handleFieldUpgrade
            } : false}
          />
        </React.Suspense>
      )}

      {gameState === GameState.WAVE_COMPLETE && waveVictorySummary ? (
        <React.Suspense fallback={null}>
          <WaveVictoryOverlay summary={waveVictorySummary} onContinue={continueAfterWaveVictory} />
        </React.Suspense>
      ) : null}

      {gameState === GameState.MENU && (
        <StartScreen
          onStart={startGame}
          allTimeLeaderboard={leaderboard}
          monthlyLeaderboard={monthlyLeaderboard}
          archivedWinners={archivedWinners}
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
          proposalStatus={proposalStatus}
          onOpenReferral={openReferral}
          onOpenFund={openResearchHubFund}
          onOpenProposal={openResearchHubProposal}
          onOpenXProfile={() => openExternalUrl(DONATION_CONFIG.X_PROFILE_URL)}
          onOpenTreasurySend={openTreasurySend}
          onOpenSwap={openRscSwap}
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

      {gameState === GameState.PAUSED && isOwnerWallet && isOwnerTestRun && showTestChampionPreview ? (
        <div className="absolute inset-0 z-40">
          <StartScreen
            onStart={() => setShowTestChampionPreview(false)}
            allTimeLeaderboard={leaderboard}
            monthlyLeaderboard={monthlyLeaderboard}
            archivedWinners={archivedWinners}
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
            proposalStatus={proposalStatus}
            onOpenReferral={openReferral}
            onOpenFund={openResearchHubFund}
            onOpenProposal={openResearchHubProposal}
            onOpenXProfile={() => openExternalUrl(DONATION_CONFIG.X_PROFILE_URL)}
            onOpenTreasurySend={openTreasurySend}
            onOpenSwap={openRscSwap}
            onOpenWalletRun={openWalletRunRecord}
            championClaimStatus="idle"
            championClaimMessage=""
            onClaimWeeklyChampion={claimWeeklyChampion}
            testChampionWinner={testChampionWinner}
            onCloseTestChampionPreview={() => setShowTestChampionPreview(false)}
          />
        </div>
      ) : null}

      {gameState === GameState.PAUSED && !showTestChampionPreview && (
        <PauseMenu
          audioMuted={audioMuted}
          polishSettings={polishSettings}
          onResume={() => {
            setOwnerFrameFrozen(false);
            setGameState(GameState.PLAYING);
          }}
          onQuit={resetGame}
          onToggleAudio={toggleGameAudio}
          onTogglePolishSetting={togglePolishSetting}
          founderControls={isOwnerWallet && isOwnerTestRun ? (
            <div className="text-left">
                  <div className="mb-3 border-b border-cyan-200/18 pb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Founder Test Controls</p>
                    <p className="mt-1 text-[9px] font-bold leading-relaxed text-slate-400">Jump stages, refill upgrades, or preview the winner flow. This test run cannot enter the leaderboard.</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">Select stage</p>
                      <div className="grid grid-cols-5 overflow-hidden border border-cyan-200/30">
                        {[1, 2, 3, 4, 5].map((wave) => (
                          <button
                            key={wave}
                            type="button"
                            onClick={() => jumpOwnerTestWave(wave)}
                            className={`min-h-10 border-r border-cyan-200/20 px-2 text-[10px] font-black last:border-r-0 ${stats.wave === wave ? 'bg-cyan-300/25 text-white' : 'bg-slate-950/55 text-cyan-200'}`}
                            aria-label={`Jump to stage ${wave}`}
                          >
                            S{wave}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={jumpOwnerTestBoss}
                        className="mt-2 min-h-10 w-full border border-red-200/35 bg-red-300/12 px-3 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-red-50 transition hover:border-red-100/60 hover:bg-red-300/20"
                        aria-label={`Jump to boss of stage ${stats.wave}`}
                      >
                        Jump to Stage {stats.wave} boss
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
        <GameOverPresentation footer={gameOverContinueControls}>
            <div className="sci-gameover-result-content relative z-10 grid gap-2 p-1 text-center">
              {missionResultBanner}

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
                    <div className="grid gap-2">
                      <button onClick={startGame} className="scicon-btn min-h-11 w-full py-2.5 text-xs font-bold">RETRY MISSION</button>
                      <button onClick={openSquadHangar} className="scicon-btn min-h-11 w-full py-2.5 text-xs font-bold">HANGAR</button>
                      <button onClick={resetGame} className="scicon-btn scicon-btn-secondary min-h-11 w-full py-2.5 text-xs font-bold text-gray-300">MAIN MENU</button>
                    </div>
                  </div>
                </>
              )}
            </div>
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
                    <li><span className="text-cyan-300">Upgrades:</span> Dock at the lab for fire rate, handling, missiles, and emergency repairs.</li>
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
            pilotName={playerNameInput || 'PILOT'}
            score={runReceipt.metrics.score}
            proposals={fundingProposals}
            proposalStatus={proposalStatus}
            selectionStatus={weeklyProposalSelectionStatus}
            selectionMessage={weeklyProposalSelectionMessage}
            onConfirm={(proposal) => void confirmWeeklyLeaderProposal(proposal)}
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
            onRetryRun={startGame}
            onHangar={openSquadHangar}
            onMainMenu={() => {
              setShowMissionRecordPreview(false);
              resetGame();
            }}
            onClose={() => setShowMissionRecordPreview(false)}
          />
        </React.Suspense>
      ) : null}

    </div>
  );
};

export default App;
