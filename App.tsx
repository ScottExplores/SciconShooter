import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StartScreen from './components/StartScreen';
import { ArchivedWinner, DonationStatus, FieldUpgradeType, GamePolishSettings, GameState, LeaderboardEntry, MintRecord, PowerupType, Stats, Upgrades, WalletSession } from './types';
import { audioService } from './services/audioService';
import { ASSETS, DONATION_CONFIG, FIELD_UPGRADE_CONFIG, GAME_CONFIG, STORAGE_KEYS, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from './constants';
import { ALL_TIME_SCORE_LIMIT, WEEKLY_SCORE_LIMIT, getLeaderboardData, saveScore, saveWeeklyLeaderProposal } from './services/leaderboardService';
import { getArchivedWeeklyWinners } from './services/winnerArchiveService';
import { getMissionRecordWeeklyFunding } from './services/weeklyFundingFlow';
import { getResearchHubFundingProposals, ResearchHubProposal } from './services/researchHubProposals';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';
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

const WalletRuntime = React.lazy(() => import('./components/WalletRuntime'));
const loadGameStage = () => import('./components/GameStage');
const loadStoryTransmission = () => import('./components/StoryTransmission');
const MissionRecordPreview = React.lazy(() => import('./components/MissionRecordPreview'));
const WeeklyProposalSelection = React.lazy(() => import('./components/WeeklyProposalSelection'));
const GameStage = React.lazy(loadGameStage);
const StoryTransmission = React.lazy(loadStoryTransmission);

const preloadGameplayComponents = () => {
  const gameStageModule = loadGameStage();
  void Promise.all([
    gameStageModule,
    loadStoryTransmission()
  ]).then(async ([gameplay]) => {
    await gameplay.preloadGameplayAssets();
  }).catch(() => {
    // Gameplay still loads on demand if a background preload is interrupted.
  });
};

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type ProposalSelectionStatus = 'idle' | 'saving' | 'confirmed' | 'error';
type ActiveRunMode = 'standard' | 'owner-test';

const OWNER_TEST_FLASK_COUNT = 40;
const OWNER_TEST_FLASK_CHARGE = getChargeForStoredFlasks(OWNER_TEST_FLASK_COUNT);
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
  [PowerupType.MAGNET]: 0,
  [PowerupType.SHIELD]: 0,
  [PowerupType.EXTRA_LIFE]: 0,
  [PowerupType.RESEARCH_BEAM]: 0
};

const getProjectedScoreQualification = (
  allTimeEntries: LeaderboardEntry[],
  monthlyEntries: LeaderboardEntry[],
  score: number
) => {
  const sortByScoreThenFirstClaim = (entries: LeaderboardEntry[]) => [...entries].sort((a, b) => (
    b.score !== a.score
      ? b.score - a.score
      : new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  ));
  const allTimeSorted = sortByScoreThenFirstClaim(allTimeEntries);
  const monthlySorted = sortByScoreThenFirstClaim(monthlyEntries);
  const allTimeRank = allTimeSorted.filter((entry) => entry.score >= score).length + 1;
  const monthlyRank = monthlySorted.filter((entry) => entry.score >= score).length + 1;

  return {
    allTimeRank,
    monthlyRank,
    qualifiesAllTimeTop25: score > 0 && allTimeRank <= 25,
    qualifiesMonthlyTop5: score > 0 && monthlyRank <= 5,
    isMonthlyChampion: score > 0 && monthlyRank === 1
  };
};

interface WalletControlProps {
  wallet: WalletSession;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSwap: () => void;
  placement?: 'floating' | 'mission';
}

const WalletControl: React.FC<WalletControlProps> = ({
  wallet,
  onConnect,
  onDisconnect,
  onOpenSwap,
  placement = 'mission'
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const wrapperClassName = placement === 'mission'
    ? 'relative z-30 inline-flex justify-center font-mono text-white'
    : 'absolute right-3 top-3 z-50 font-mono text-white';
  const walletMenuClassName = placement === 'mission'
    ? 'absolute left-1/2 top-full mt-2 w-[224px] -translate-x-1/2 overflow-hidden rounded-[20px] border border-cyan-200/22 bg-[#06111f]/96 text-cyan-50 shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.14)] backdrop-blur-xl'
    : 'absolute right-0 mt-2 w-[224px] overflow-hidden rounded-[20px] border border-cyan-200/22 bg-[#06111f]/96 text-cyan-50 shadow-[0_22px_70px_rgba(0,0,0,0.55),0_0_36px_rgba(34,211,238,0.14)] backdrop-blur-xl';
  const isConnected = Boolean(wallet.address);
  const label = isConnected
    ? `${wallet.address!.slice(0, 6)}...${wallet.address!.slice(-4)}`
    : wallet.status === 'connecting'
      ? 'Loading'
      : 'Connect';

  return (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={() => {
          if (!isConnected) {
            onConnect();
            return;
          }
          setIsMenuOpen((current) => !current);
        }}
        className="rounded-full border border-cyan-300/40 bg-black/75 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-md transition hover:border-cyan-100 disabled:cursor-wait disabled:opacity-70"
        disabled={wallet.status === 'connecting'}
        aria-expanded={isConnected ? isMenuOpen : undefined}
      >
        {label}
      </button>

      {isMenuOpen && isConnected ? (
        <div className={walletMenuClassName}>
          <div className="border-b border-cyan-200/14 p-3">
            <div className="truncate text-sm font-black text-white">{label}</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">{wallet.connectorName || 'Base wallet'}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onOpenSwap();
            }}
            className="block w-full px-3.5 py-3 text-left text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/10"
          >
            Swap for RSC
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              onDisconnect();
            }}
            className="block w-full border-t border-cyan-200/12 px-3.5 py-3 text-left text-sm font-black text-red-200 transition hover:bg-red-500/10"
          >
            Sign out
          </button>
        </div>
      ) : null}

      {wallet.error ? (
        <div className="absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 rounded-2xl border border-red-300/25 bg-black/90 p-3 text-[10px] leading-relaxed text-red-100 shadow-xl">
          {wallet.error}
        </div>
      ) : null}
    </div>
  );
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [gameId, setGameId] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [archivedWinners, setArchivedWinners] = useState<ArchivedWinner[]>([]);
  const [walletRecords, setWalletRecords] = useState<MintRecord[]>([]);
  const [walletRuns, setWalletRuns] = useState<WalletRunRecord[]>([]);
  const [walletRunsLoading, setWalletRunsLoading] = useState(false);
  const [selectedShipId, setSelectedShipId] = useState<PlayerShipId>(() => (
    parsePlayerShipId(localStorage.getItem(STORAGE_KEYS.SELECTED_SHIP))
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
  const [walletRuntimeEnabled, setWalletRuntimeEnabled] = useState(false);
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
  const [continueCommand, setContinueCommand] = useState<{ nonce: number; lives: number } | null>(null);
  const [activeRunMode, setActiveRunMode] = useState<ActiveRunMode>('standard');
  const [testWaveCommand, setTestWaveCommand] = useState<{ nonce: number; wave: number } | null>(null);
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
  const introStoryTimeoutRef = useRef<number | null>(null);
  const weeklyProposalTransitionRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameState>(GameState.MENU);
  const submittingScoreRef = useRef(false);
  const submittedScoreKeysRef = useRef<Set<string>>(new Set());
  const runSessionPromiseRef = useRef<Promise<RunSession> | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const activeRunShipIdRef = useRef<PlayerShipId>('researchhub');
  const runReceiptPromiseRef = useRef<Promise<RunReceipt> | null>(null);
  const finalizedRunGameIdRef = useRef<number | null>(null);
  const walletActionNonceRef = useRef(0);
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

  useEffect(() => () => {
    clearIntroStoryTimeout();
    clearWeeklyProposalTransition();
  }, []);

  useEffect(() => {
    trackInitialVisit();
  }, []);

  useEffect(() => {
    if (gameState !== GameState.MENU) return undefined;

    return runAfterFirstPaint(preloadGameplayComponents, {
      delayMs: 280,
      timeoutMs: 1200
    });
  }, [gameState]);

  const wallet = useMemo<WalletSession>(() => {
    const address = walletSession.address ?? null;
    const isWalletBusy = walletRuntimeAction?.type === 'connect' || walletRuntimeAction?.type === 'continue';

    return {
      ...walletSession,
      address,
      status: address ? 'connected' : isWalletBusy ? 'connecting' : walletError ? 'error' : walletSession.status,
      error: walletError,
      hasDonated: address ? Boolean(donatedWallets[address.toLowerCase()]) : false
    };
  }, [donatedWallets, walletError, walletRuntimeAction?.type, walletSession]);
  const activeWalletAddress = wallet.address ?? null;
  const isOwnerWallet = activeWalletAddress?.toLowerCase() === DONATION_CONFIG.RECIPIENT_ADDRESS.toLowerCase();
  const isOwnerTestRun = activeRunMode === 'owner-test';
  const previewPilotName = missionRecordPilotName || playerNameInput || 'PILOT';
  const missionRecordWeeklyFunding = useMemo(() => runReceipt ? getMissionRecordWeeklyFunding({
    receipt: runReceipt,
    pilotName: previewPilotName,
    weeklyLeaderboard: monthlyLeaderboard,
    archivedWinners
  }) : null, [archivedWinners, monthlyLeaderboard, previewPilotName, runReceipt]);
  const shipUnlocks = useMemo(
    () => getPlayerShipUnlocks(activeWalletAddress, walletRecords, { unlockAll: isOwnerWallet }),
    [activeWalletAddress, isOwnerWallet, walletRecords]
  );
  const usableShipId = getUsablePlayerShip(selectedShipId, shipUnlocks);
  const playerShipUrl = PLAYER_SHIPS[usableShipId].assetUrl;
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
    const profileKey = getWalletProfileKey(walletAddress);
    const savedStats = localStorage.getItem(profileKey) || (!walletAddress ? null : localStorage.getItem(STORAGE_KEYS.PLAYER_STATS));

    if (savedStats) {
      try {
        return JSON.parse(savedStats);
      } catch (e) {
        console.error("Failed to parse saved stats", e);
      }
    }

    return {
      highScore: parseInt(localStorage.getItem(STORAGE_KEYS.HIGH_SCORE) || '0'),
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

  const refreshFundingProposals = useCallback(async () => {
    setProposalStatus('loading');
    try {
      const nextProposals = await getResearchHubFundingProposals();
      setFundingProposals(nextProposals);
      setProposalStatus(nextProposals.length > 0 ? 'ready' : 'empty');
    } catch (error) {
      console.error('ResearchHub proposal feed failed:', error);
      setFundingProposals([]);
      setProposalStatus('error');
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

  useEffect(() => {
    const statsToSave = {
      highScore: stats.highScore,
      totalCoins: stats.totalCoins,
      playerName: playerNameInput
    };
    localStorage.setItem(getWalletProfileKey(activeWalletAddress), JSON.stringify(statsToSave));
    localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.highScore.toString());
  }, [activeWalletAddress, playerNameInput, stats.highScore, stats.totalCoins]);

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
    setStats(prev => ({
      ...prev,
      highScore: Math.max(prev.highScore, savedStats.highScore || 0),
      totalCoins: Math.max(prev.totalCoins, savedStats.totalCoins || 0)
    }));

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

  const startGame = () => {
    const startInTestMode = isOwnerWallet;
    setMissionRecordPilotName(null);
    preloadGameplayComponents();
    audioService.init();
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
      lives: 3,
      repairsCount: 0,
      upgrades: { ...defaultMissionUpgrades },
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
    setContinueCommand(null);
    setTestWaveCommand(null);
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
    setGameId(prev => prev + 1);
    lastStoryWaveRef.current = 1;
    setGameState(GameState.PLAYING);
    trackEvent('mission_started');
    introStoryTimeoutRef.current = window.setTimeout(() => {
      introStoryTimeoutRef.current = null;
      setIntroMissionLocked(false);
      if (gameStateRef.current === GameState.PLAYING) {
        setActiveStoryBeat(getStoryBeatForPhase(1));
      }
    }, 2650);
  };

  const resetGame = () => {
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    setShowTestChampionPreview(false);
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

  const completeStoryTransmission = () => {
    const completedPhase = activeStoryBeat?.phase;
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
    const safeWave = Math.max(1, Math.min(4, Math.floor(wave)));
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    lastStoryWaveRef.current = safeWave;
    setTestWaveCommand(current => ({ nonce: (current?.nonce ?? 0) + 1, wave: safeWave }));
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
    setOwnerFrameFrozen(false);
    setGameState(GameState.GAMEOVER);
  };

  const requestWalletRuntimeAction = useCallback((type: 'connect' | 'disconnect' | 'continue') => {
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

  const disconnectWallet = useCallback(() => {
    requestWalletRuntimeAction('disconnect');
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
    if (nextWallet.address) {
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

    if (nextBeat) {
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
      const scoreKey = `${gameId}:${stats.score}:${stats.wave}`;
      if (submittedScoreKeysRef.current.has(scoreKey)) {
        return;
      }

      if (!isOwnerTestRun && stats.score > stats.highScore) {
        localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.score.toString());
        setStats(s => ({ ...s, highScore: s.score }));
      }

      if (stats.score > 0 || isOwnerTestRun) {
        setScoreSubmitError('');
        setShowNameInput(true);
      }
    }
  }, [gameId, gameState, isOwnerTestRun, stats.score, stats.wave, stats.highScore]);

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

    if (isOwnerTestRun) {
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
        setShowMissionRecordPreview(true);
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

  const getPubStatus = (score: number) => {
    if (score < 500) return { title: "DESK REJECTED", color: "text-red-500", desc: "Try adding more novelty." };
    if (score < 1500) return { title: "UNDER REVIEW", color: "text-yellow-400", desc: "Reviewer #2 has some notes." };
    if (score < 3000) return { title: "ACCEPTED W/ REVISIONS", color: "text-blue-400", desc: "So close to the cover." };
    return { title: "NATURE COVER", color: "text-purple-400", desc: "Scientific breakthrough!" };
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

  const pubStatus = getPubStatus(stats.score);
  const scoreQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, stats.score);
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
  const resultEncounter = stats.wave <= 1
    ? 'Gatekeeper Sector'
    : stats.wave === 2
      ? 'Replication Rift'
      : 'Deep Review Space';
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
      <img src={ASSETS.FINAL_BOSS} alt="" aria-hidden="true" className="pointer-events-none absolute right-5 top-8 h-20 w-20 object-contain opacity-35 [image-rendering:pixelated]" />

      <div className="relative">
        <p className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">Stage {stats.wave} - {resultEncounter}</p>
        <h2 className={`arcade-font mt-1 text-xl font-black uppercase tracking-widest ${isOwnerTestRun || (showNameInput && scoreQualification.isMonthlyChampion) ? 'text-yellow-300' : pubStatus.color}`}>
          {isOwnerTestRun ? 'Pilot Test Record' : showNameInput ? (scoreQualification.isMonthlyChampion ? 'Current Weekly Lead' : 'Mission Record') : pubStatus.title}
        </h2>
        <p className="mt-1 text-3xl font-black text-white">{stats.score.toLocaleString()}</p>
      </div>

      <div className="relative mt-2 grid grid-cols-3 divide-x divide-white/10 border-t border-cyan-100/15 pt-2 text-center">
        <div><span className="block text-[8px] font-black uppercase tracking-wider text-slate-500">Wave</span><strong className="text-sm text-cyan-100">{stats.wave}</strong></div>
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

      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED || gameState === GameState.GAMEOVER) && (
        <React.Suspense fallback={null}>
          <GameStage
            key={gameId}
            canvas={{
              stats,
              onStatsChange: setStats,
              running: gameState === GameState.PLAYING && !ownerFrameFrozen,
              onGameOver: () => {
                setOwnerFrameFrozen(false);
                setGameState(GameState.GAMEOVER);
              },
              onContinueStarted: () => setGameState(GameState.PLAYING),
              isTransmissionOpen: introMissionLocked || Boolean(activeStoryBeat),
              bombCommand,
              continueCommand,
              polishSettings,
              playerShipUrl,
              testMode: isOwnerTestRun,
              testWaveCommand,
              testFlaskCommand
            }}
            hud={gameState === GameState.PLAYING || (gameState === GameState.PAUSED && isOwnerWallet && isOwnerTestRun) ? {
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
              onUpgrade: handleFieldUpgrade
            } : false}
          />
        </React.Suspense>
      )}

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
        <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm">
          <div className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto p-1">
            <div className="scicon-border-container"></div>
            <div className="scicon-inner-bg"></div>
            <div className="scicon-node node-tl-1"></div>
            <div className="scicon-node node-tr-1"></div>
            <div className="scicon-node node-bl-1"></div>
            <div className="scicon-node node-br-1"></div>

            <div className="relative z-10 space-y-4 p-5 text-center sm:p-7">
              <h2 className="arcade-font text-3xl font-bold tracking-widest text-white text-shadow-neon">PAUSED</h2>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setOwnerFrameFrozen(false);
                    setGameState(GameState.PLAYING);
                  }}
                  className="scicon-btn w-full py-3 text-sm font-bold"
                >
                  RESUME
                </button>
                <button
                  onClick={resetGame}
                  className="scicon-btn scicon-btn-secondary w-full py-3 text-sm font-bold text-gray-300"
                >
                  QUIT
                </button>
              </div>
              <div className="rounded-[8px] border border-cyan-300/18 bg-cyan-300/8 p-3 text-left">
                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">Performance FX</p>
                <div className="space-y-2">
                  {([
                    ['screenShake', 'Screen Shake'],
                    ['highDensityParticles', 'High-Density Particles']
                  ] as Array<[keyof GamePolishSettings, string]>).map(([key, label]) => {
                    const enabled = polishSettings[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => togglePolishSetting(key)}
                        className="flex w-full items-center justify-between rounded-[6px] border border-white/10 bg-slate-950/55 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-200 transition hover:border-cyan-200/40 hover:bg-cyan-300/10"
                      >
                        <span>{label}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${enabled ? 'border-emerald-200/35 bg-emerald-300/15 text-emerald-100' : 'border-slate-300/20 bg-slate-700/30 text-slate-400'}`}>
                          {enabled ? 'On' : 'Off'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {isOwnerWallet && isOwnerTestRun ? (
                <div className="rounded-[8px] border border-cyan-200/35 bg-slate-950/72 p-3 text-left shadow-[0_0_26px_rgba(34,211,238,0.12)]">
                  <div className="mb-3 border-b border-cyan-200/18 pb-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Founder Test Controls</p>
                    <p className="mt-1 text-[9px] font-bold leading-relaxed text-slate-400">Jump sectors, refill upgrades, or preview the winner flow. This test run cannot enter the leaderboard.</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-200">Select wave</p>
                      <div className="grid grid-cols-4 overflow-hidden border border-cyan-200/30">
                        {[1, 2, 3, 4].map((wave) => (
                          <button
                            key={wave}
                            type="button"
                            onClick={() => jumpOwnerTestWave(wave)}
                            className={`min-h-10 border-r border-cyan-200/20 px-2 text-[10px] font-black last:border-r-0 ${stats.wave === wave ? 'bg-cyan-300/25 text-white' : 'bg-slate-950/55 text-cyan-200'}`}
                            aria-label={`Jump to wave ${wave}`}
                          >
                            W{wave}
                          </button>
                        ))}
                      </div>
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
              ) : null}
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-black/82 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
          <div className="relative w-full max-w-md overflow-hidden border border-red-300/20 bg-slate-950/94 shadow-[0_24px_90px_rgba(0,0,0,0.62)] backdrop-blur-xl animate-bounce-in [clip-path:polygon(18px_0,100%_0,100%_calc(100%_-_18px),calc(100%_-_18px)_100%,0_100%,0_18px)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/70 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent"></div>

            <div className="relative z-10 grid gap-3 p-3 text-center">
              {missionResultBanner}

              {showNameInput ? (
                <>
                  {runReceiptStatus === 'local' || runReceiptStatus === 'error' ? (
                    <div className="rounded-[7px] border border-amber-200/25 bg-amber-300/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
                      {isOwnerTestRun ? 'Test record verification is offline. Reconnect before preparing the mint preview.' : 'Run verification is offline. Retry when connected to submit globally.'}
                    </div>
                  ) : null}
                  {!isOwnerTestRun && !runReceipt && runReceiptStatus !== 'finalizing' ? continueRunControls : null}

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
                        autoFocus
                        disabled={isSubmittingScore}
                      />
                      <button
                        type="submit"
                        disabled={!playerNameInput || isSubmittingScore}
                        className="scicon-btn min-h-11 min-w-28 px-3 py-2 text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
                      >
                        {isSubmittingScore ? 'Saving...' : isOwnerTestRun ? 'Prepare record' : 'Submit'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={skipScoreSubmission}
                      disabled={isSubmittingScore}
                      className="justify-self-center px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500 transition hover:text-red-100 disabled:opacity-50"
                    >
                      {isOwnerTestRun ? 'Exit test' : 'Skip score'}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {!isOwnerTestRun && !runReceipt && runReceiptStatus !== 'finalizing' ? continueRunControls : null}

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
                          Preview
                        </button>
                      </div>
                    ) : null}
                    {scoreSaved && !isOwnerTestRun ? (
                      <p className="text-center text-[9px] font-black uppercase tracking-[0.14em] text-emerald-100">
                        Global score saved
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={startGame} className="scicon-btn py-3 text-sm font-bold">RETRY</button>
                      <button onClick={() => setGameState(GameState.MENU)} className="scicon-btn scicon-btn-secondary py-3 text-xs font-bold text-gray-300">MAIN MENU</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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
            onGetBaseApp={openBaseAppInvite}
            onMint={mintCurrentMissionRecord}
            weeklyFunding={missionRecordWeeklyFunding}
            onOpenWeeklyFunding={openMissionRecordWeeklyFunding}
            onClose={() => setShowMissionRecordPreview(false)}
          />
        </React.Suspense>
      ) : null}

    </div>
  );
};

export default App;
