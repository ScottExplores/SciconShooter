import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StartScreen from './components/StartScreen';
import { ArchivedWinner, DonationStatus, FieldUpgradeType, GameState, LeaderboardEntry, MiniAppState, PowerupType, Stats, Upgrades, WalletSession } from './types';
import { audioService } from './services/audioService';
import { ASSETS, DONATION_CONFIG, FIELD_UPGRADE_CONFIG, GAME_CONFIG, STORAGE_KEYS, getFieldUpgradeLevel } from './constants';
import { getLeaderboardData, saveScore } from './services/leaderboardService';
import { getArchivedWeeklyWinners } from './services/winnerArchiveService';
import { getResearchHubFundingProposals, ResearchHubProposal } from './services/researchHubProposals';
import { miniAppService } from './services/miniAppService';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';
import type { WalletRuntimeAction } from './components/WalletRuntime';

const WalletRuntime = React.lazy(() => import('./components/WalletRuntime'));
const loadGameCanvas = () => import('./components/GameCanvas');
const loadUIOverlay = () => import('./components/UIOverlay');
const loadStoryTransmission = () => import('./components/StoryTransmission');
const GameCanvas = React.lazy(loadGameCanvas);
const UIOverlay = React.lazy(loadUIOverlay);
const StoryTransmission = React.lazy(loadStoryTransmission);

const preloadGameplayComponents = () => {
  void loadGameCanvas();
  void loadUIOverlay();
  void loadStoryTransmission();
};

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';
type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface PendingFundingPickRecord {
  pilotName: string;
  score: number;
  wave: number;
  date: string;
  walletAddress?: string | null;
  donated?: boolean;
  monthlyRank?: number;
  allTimeRank?: number;
}

const defaultMiniAppState: MiniAppState = {
  isMiniApp: false,
  clientFid: null,
  added: false,
  userFid: null,
  platformType: null
};

const runAfterFirstPaint = (
  callback: () => void,
  options: { delayMs?: number; timeoutMs?: number } = {}
) => {
  const { delayMs = 650, timeoutMs = 2400 } = options;
  const idleWindow = window as IdleWindow;
  let cancelled = false;
  let frameHandle: number | null = null;
  let delayHandle: ReturnType<typeof window.setTimeout> | null = null;
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

const defaultMissionUpgrades: Upgrades = {
  fireRate: 0,
  speed: 0,
  missile: 0
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
  const [fundingProposals, setFundingProposals] = useState<ResearchHubProposal[]>([]);
  const [proposalStatus, setProposalStatus] = useState<ProposalFeedStatus>('loading');
  const [selectedProposalId, setSelectedProposalId] = useState<string>('');
  const [proposalSearchQuery, setProposalSearchQuery] = useState<string>('');
  const [playerNameInput, setPlayerNameInput] = useState<string>('');
  const [showNameInput, setShowNameInput] = useState<boolean>(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [scoreSubmitError, setScoreSubmitError] = useState<string>('');
  const [pendingFundingPick, setPendingFundingPick] = useState<PendingFundingPickRecord | null>(null);
  const [fundingPickSubmitError, setFundingPickSubmitError] = useState<string>('');
  const [isSubmittingFundingPick, setIsSubmittingFundingPick] = useState(false);
  const [showLabGlow, setShowLabGlow] = useState<boolean>(true);
  const [miniApp, setMiniApp] = useState<MiniAppState>(defaultMiniAppState);
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
  const [introMissionLocked, setIntroMissionLocked] = useState(false);
  const [donatedWallets] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DONATED_WALLETS) || '{}');
    } catch {
      return {};
    }
  });
  const lastStoryWaveRef = useRef(0);
  const introStoryTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const gameStateRef = useRef<GameState>(GameState.MENU);
  const submittingScoreRef = useRef(false);
  const submittedScoreKeysRef = useRef<Set<string>>(new Set());

  const clearIntroStoryTimeout = () => {
    if (introStoryTimeoutRef.current) {
      window.clearTimeout(introStoryTimeoutRef.current);
      introStoryTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => () => clearIntroStoryTimeout(), []);

  useEffect(() => {
    if (gameState !== GameState.MENU) return undefined;

    return runAfterFirstPaint(preloadGameplayComponents, {
      delayMs: 1200,
      timeoutMs: 4200
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
  const continueRscCost = (continuesUsed + 1) * 5;
  const isContinuePaymentBusy = continuePaymentStatus === 'switching_network'
    || continuePaymentStatus === 'processing'
    || continuePaymentStatus === 'confirming';

  const sortedFundingProposals = useMemo(() => (
    [...fundingProposals].sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      if (b.backers !== a.backers) return b.backers - a.backers;
      if ((b.raisedUsd || 0) !== (a.raisedUsd || 0)) return (b.raisedUsd || 0) - (a.raisedUsd || 0);
      return a.title.localeCompare(b.title);
    })
  ), [fundingProposals]);
  const topVotedFundingProposals = sortedFundingProposals.slice(0, 3);
  const visibleFundingProposals = useMemo(() => {
    const query = proposalSearchQuery.trim().toLowerCase();
    if (!query) return sortedFundingProposals;

    return sortedFundingProposals.filter((proposal) => [
      proposal.title,
      proposal.author,
      proposal.organization,
      proposal.status
    ].some((value) => value?.toLowerCase().includes(query)));
  }, [proposalSearchQuery, sortedFundingProposals]);

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

  useEffect(() => {
    let active = true;
    let cancelDeferredFetch: (() => void) | null = null;

    const fetchProposals = () => getResearchHubFundingProposals()
      .then((nextProposals) => {
        if (!active) return;
        setFundingProposals(nextProposals);
        setProposalStatus(nextProposals.length > 0 ? 'ready' : 'empty');
      })
      .catch((error) => {
        console.error('ResearchHub proposal feed failed:', error);
        if (!active) return;
        setFundingProposals([]);
        setProposalStatus('error');
      });

    cancelDeferredFetch = runAfterFirstPaint(() => {
      void fetchProposals();
    }, {
      delayMs: 950,
      timeoutMs: 3200
    });

    return () => {
      active = false;
      cancelDeferredFetch?.();
    };
  }, []);

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
      bombChargeMax: 58,
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
    if (!activeWalletAddress) return;

    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, activeWalletAddress);
    const savedStats = readSavedStats(activeWalletAddress);
    setStats(prev => ({
      ...prev,
      highScore: Math.max(prev.highScore, savedStats.highScore || 0),
      totalCoins: Math.max(prev.totalCoins, savedStats.totalCoins || 0)
    }));

  }, [activeWalletAddress]);

  useEffect(() => {
    let active = true;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const idleWindow = window as IdleWindow;

    const setupMiniApp = async () => {
      try {
        const state = await miniAppService.getState();
        if (!active) return;

        setMiniApp(state);
        if (state.isMiniApp) {
          await miniAppService.ready();
        }
      } catch (error) {
        console.warn('Mini app setup skipped', error);
      }
    };

    const runSetup = () => {
      void setupMiniApp();
    };

    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(runSetup, { timeout: 1800 });
    } else {
      timeoutHandle = window.setTimeout(runSetup, 900);
    }

    return () => {
      active = false;
      if (idleHandle !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);

  const startGame = () => {
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
      bombCharge: 0,
      bombChargeMax: 58,
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
    setPendingFundingPick(null);
    setFundingPickSubmitError('');
    setIsSubmittingFundingPick(false);
    setBombCommand(null);
    setContinueCommand(null);
    setIntroMissionLocked(true);
    setShowNameInput(false);
    setPlayerNameInput('');
    setSelectedProposalId('');
    setIsSubmittingScore(false);
    submittingScoreRef.current = false;
    setGameId(prev => prev + 1);
    lastStoryWaveRef.current = 1;
    setGameState(GameState.PLAYING);
    introStoryTimeoutRef.current = window.setTimeout(() => {
      introStoryTimeoutRef.current = null;
      setIntroMissionLocked(false);
      if (gameStateRef.current === GameState.PLAYING) {
        setActiveStoryBeat(getStoryBeatForPhase(1));
      }
    }, 3600);
  };

  const resetGame = () => {
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setIntroMissionLocked(false);
    setPendingFundingPick(null);
    setFundingPickSubmitError('');
    setIsSubmittingFundingPick(false);
    setGameState(GameState.MENU);
  };

  const handleFieldUpgrade = (type: FieldUpgradeType) => {
    const bombChargeMax = stats.bombChargeMax || 58;
    const flaskReady = (stats.bombCharge || 0) >= bombChargeMax;
    const config = FIELD_UPGRADE_CONFIG[type];
    const level = getFieldUpgradeLevel(stats, type);
    const isLifeUpgrade = type === 'extraLife';
    const isAtCap = isLifeUpgrade ? stats.lives >= GAME_CONFIG.MAX_LIVES : level >= config.maxLevel;

    if (!flaskReady || isAtCap) {
      return;
    }

    audioService.playSound(isLifeUpgrade ? 'powerup' : 'coin');

    setStats(prev => {
      if (type === 'extraLife') {
        return {
          ...prev,
          bombCharge: 0,
          lives: Math.min(GAME_CONFIG.MAX_LIVES, prev.lives + 1),
          repairsCount: (prev.repairsCount || 0) + 1
        };
      }

      return {
        ...prev,
        bombCharge: 0,
        upgrades: {
          ...prev.upgrades,
          [type]: prev.upgrades[type] + 1
        }
      };
    });
  };

  const handleDeposit = (amount: number) => {
    setStats(prev => ({
      ...prev,
      coins: prev.coins + amount
    }));
    audioService.playSound('coin');
  };

  const requestWalletRuntimeAction = useCallback((type: WalletRuntimeAction['type']) => {
    setWalletRuntimeEnabled(true);
    setWalletRuntimeAction({ type, nonce: Date.now() });
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
    if (isContinuePaymentBusy) return;
    requestWalletRuntimeAction('continue');
  }, [isContinuePaymentBusy, requestWalletRuntimeAction]);

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
      lives: 3
    }));
    setContinueCommand({ nonce: Date.now(), lives: 3 });
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

  useEffect(() => {
    if (gameState === GameState.GAMEOVER) {
      const scoreKey = `${gameId}:${stats.score}:${stats.wave}`;
      if (submittedScoreKeysRef.current.has(scoreKey)) {
        return;
      }

      if (stats.score > stats.highScore) {
        localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.score.toString());
        setStats(s => ({ ...s, highScore: s.score }));
      }

      const scoreQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, stats.score);

      if (scoreQualification.qualifiesMonthlyTop5 || scoreQualification.qualifiesAllTimeTop25) {
        setScoreSubmitError('');
        setShowNameInput(true);
      }
    }
  }, [gameId, gameState, monthlyLeaderboard, stats.score, stats.wave, stats.highScore, leaderboard]);

  const persistHighScore = async (options: { returnToMenuOnSuccess?: boolean } = {}) => {
    if (!playerNameInput.trim() || submittingScoreRef.current) return false;

    const returnToMenuOnSuccess = options.returnToMenuOnSuccess ?? true;

    submittingScoreRef.current = true;
    setIsSubmittingScore(true);
    setScoreSubmitError('');

    const name = playerNameInput.trim().substring(0, 15).toUpperCase();
    const score = stats.score;
    const wave = stats.wave;
    const scoreKey = `${gameId}:${score}:${wave}`;
    const submittedAt = new Date().toISOString();
    const submitQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, score);
    const shouldPromptFundingPick = submitQualification.isMonthlyChampion && sortedFundingProposals.length > 0;

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
    const optimisticList = [...leaderboard, newEntry].sort(scoreSorter).slice(0, 25);
    const optimisticMonthlyList = [...monthlyLeaderboard, newEntry].sort(scoreSorter).slice(0, 5);
    setLeaderboard(optimisticList);
    setMonthlyLeaderboard(optimisticMonthlyList);

    let confirmedSave = false;
    try {
      const updatedData = await saveScore(name, score, wave, {
        date: submittedAt,
        walletAddress: activeWalletAddress,
        donated: wallet.hasDonated
      });
      if (updatedData.remoteSaved === false) {
        throw new Error('Global leaderboard save did not confirm');
      }
      if (updatedData.scores.length > 0) {
        setLeaderboard(updatedData.scores);
      }
      setMonthlyLeaderboard(updatedData.monthlyScores);
      submittedScoreKeysRef.current.add(scoreKey);
      confirmedSave = true;
      return true;
    } catch (error) {
      console.error("Score submission error", error);
      submittedScoreKeysRef.current.delete(scoreKey);
      setLeaderboard(previousLeaderboard);
      setMonthlyLeaderboard(previousMonthlyLeaderboard);
      setScoreSubmitError('Global save did not confirm. Please submit again before sharing.');
      return false;
    } finally {
      submittingScoreRef.current = false;
      setIsSubmittingScore(false);
      if (confirmedSave) {
        setShowNameInput(false);
        if (shouldPromptFundingPick) {
          setSelectedProposalId('');
          setProposalSearchQuery('');
          setFundingPickSubmitError('');
          setPendingFundingPick({
            pilotName: name,
            score,
            wave,
            date: submittedAt,
            walletAddress: activeWalletAddress,
            donated: wallet.hasDonated,
            monthlyRank: submitQualification.monthlyRank,
            allTimeRank: submitQualification.qualifiesAllTimeTop25 ? submitQualification.allTimeRank : undefined
          });
        } else if (returnToMenuOnSuccess) {
          setGameState(GameState.MENU);
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

  const submitFundingPick = async () => {
    if (!pendingFundingPick || !selectedShareProposal || isSubmittingFundingPick) return;

    setIsSubmittingFundingPick(true);
    setFundingPickSubmitError('');

    try {
      const updatedData = await saveScore(pendingFundingPick.pilotName, pendingFundingPick.score, pendingFundingPick.wave, {
        date: pendingFundingPick.date,
        walletAddress: pendingFundingPick.walletAddress,
        donated: pendingFundingPick.donated,
        proposalId: selectedShareProposal.id,
        proposalTitle: selectedShareProposal.title,
        proposalUrl: selectedShareProposal.url,
        proposalAuthor: selectedShareProposal.author
      });

      if (updatedData.remoteSaved === false) {
        throw new Error('Global leaderboard save did not confirm');
      }

      if (updatedData.scores.length > 0) {
        setLeaderboard(updatedData.scores);
      }
      setMonthlyLeaderboard(updatedData.monthlyScores);
      setPendingFundingPick(null);
      setSelectedProposalId('');
      setProposalSearchQuery('');
      setGameState(GameState.MENU);
    } catch (error) {
      console.error("Funding pick submission error", error);
      setFundingPickSubmitError('Funding pick did not confirm. Please try again.');
    } finally {
      setIsSubmittingFundingPick(false);
    }
  };

  const skipScoreSubmission = () => {
    submittingScoreRef.current = false;
    setIsSubmittingScore(false);
    setShowNameInput(false);
    setPlayerNameInput('');
    setSelectedProposalId('');
    setScoreSubmitError('');
    setPendingFundingPick(null);
    setFundingPickSubmitError('');
    setGameState(GameState.MENU);
  };

  const getPubStatus = (score: number) => {
    if (score < 500) return { title: "DESK REJECTED", color: "text-red-500", desc: "Try adding more novelty." };
    if (score < 1500) return { title: "UNDER REVIEW", color: "text-yellow-400", desc: "Reviewer #2 has some notes." };
    if (score < 3000) return { title: "ACCEPTED W/ REVISIONS", color: "text-blue-400", desc: "So close to the cover." };
    return { title: "NATURE COVER", color: "text-purple-400", desc: "Scientific breakthrough!" };
  };

  const openReferral = async () => {
    await miniAppService.openUrl(ASSETS.REFERRAL_LINK);
  };

  const openResearchHubFund = async () => {
    await miniAppService.openUrl('https://www.researchhub.com/fund');
  };

  const openResearchHubProposal = async (url: string) => {
    await miniAppService.openUrl(url);
  };

  const openTreasurySend = async () => {
    await miniAppService.openUrl(`ethereum:${DONATION_CONFIG.RECIPIENT_ADDRESS}@${DONATION_CONFIG.BASE_CHAIN_ID}`);
  };

  const openRscSwap = async () => {
    await miniAppService.openUrl(DONATION_CONFIG.RSC_SWAP_URL);
  };

  const pubStatus = getPubStatus(stats.score);
  const scoreQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, stats.score);
  const selectedShareProposal = fundingProposals.find((proposal) => proposal.id === selectedProposalId);
  const scoreQualificationMessage = scoreQualification.isMonthlyChampion
    ? 'Weekly #1 run. Submit your pilot name first, then choose the ResearchHub proposal for the 100 RSC allocation.'
    : scoreQualification.qualifiesMonthlyTop5 && scoreQualification.qualifiesAllTimeTop25
      ? 'This score qualifies for weekly Top 5 and all-time Top 25. It is saved once and appears on both boards while it ranks on both.'
      : scoreQualification.qualifiesMonthlyTop5
        ? `Weekly Top 5 run at projected rank #${scoreQualification.monthlyRank}. Push for #1 to unlock the champion proposal pick.`
        : scoreQualification.qualifiesAllTimeTop25
          ? `All-time Top 25 run at projected rank #${scoreQualification.allTimeRank}. Try again this week for #1 so you can steer the RSC allocation.`
          : '';
  const scoreSubmitHint = scoreQualification.isMonthlyChampion
    ? 'After the record saves, the weekly funding pick opens next.'
    : 'Scores save to every leaderboard they qualify for.';
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
            : `Next continue costs ${continueRscCost} RSC.`;
  const continueRunControls = (
    <div className="rounded-[8px] border border-emerald-200/25 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.22),transparent_44%),rgba(6,78,59,0.18)] p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Continue run</p>
          <h3 className="mt-1 text-xl font-black uppercase tracking-wide text-white">{continueRscCost} RSC</h3>
        </div>
        <div className="rounded-[6px] border border-emerald-100/25 bg-emerald-300/12 px-3 py-2 text-right">
          <div className="font-mono text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/70">Lives</div>
          <div className="text-2xl font-black text-white">3</div>
        </div>
      </div>

      <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-300">
        Pay {continueRscCost} RSC to continue this run with three hearts.
        {continuesUsed === 0 ? ' The next continue costs 10 RSC.' : ` The next continue costs ${continueRscCost + 5} RSC.`}
      </p>

      <button
        type="button"
        onClick={() => void handleContinueWithRsc()}
        disabled={isContinuePaymentBusy}
        className="mt-3 w-full rounded-[8px] border border-emerald-100/40 bg-emerald-300 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-400"
      >
        {isContinuePaymentBusy ? 'Confirm in wallet' : activeWalletAddress ? `Continue for ${continueRscCost} RSC` : `Connect + Continue for ${continueRscCost} RSC`}
      </button>

      <div className={`mt-2 min-h-4 text-center text-[10px] font-black uppercase tracking-[0.12em] ${continuePaymentStatus === 'error' ? 'text-red-200' : continuePaymentStatus === 'success' ? 'text-emerald-100' : 'text-slate-400'}`}>
        {continueStatusText}
      </div>

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
  const highScoreActionControls = (
    <div className="sticky top-0 z-20 rounded-2xl border border-white/10 bg-slate-950/92 p-3 shadow-[0_16px_46px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {scoreSubmitError ? (
        <p className="mb-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-red-100">
          {scoreSubmitError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <button
          type="submit"
          disabled={!playerNameInput || isSubmittingScore}
          className={`scicon-btn w-full py-3 text-lg font-bold ${isSubmittingScore ? 'cursor-wait opacity-70' : ''}`}
        >
          {isSubmittingScore ? 'TRANSMITTING...' : 'SUBMIT RECORD'}
        </button>
        <button
          type="button"
          onClick={skipScoreSubmission}
          disabled={isSubmittingScore}
          className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-400 transition hover:border-red-200/45 hover:bg-red-300/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Do Not Submit Score
        </button>
      </div>

      <p className="mt-2 text-center text-[10px] font-semibold leading-relaxed text-slate-500">
        {scoreSubmitHint}
      </p>
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
          />
        </React.Suspense>
      ) : null}

      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED || gameState === GameState.GAMEOVER) && (
        <React.Suspense fallback={null}>
          <GameCanvas
            key={gameId}
            stats={stats}
            setStats={setStats}
            setGameState={setGameState}
            gameState={gameState}
            isTransmissionOpen={Boolean(activeStoryBeat)}
            bombCommand={bombCommand}
            continueCommand={continueCommand}
          />
        </React.Suspense>
      )}

      {gameState === GameState.PLAYING && (
        <React.Suspense fallback={null}>
          <UIOverlay
            stats={stats}
            setGameState={setGameState}
            lives={stats.lives}
            showLabGlow={showLabGlow}
            onDisableLabGlow={() => setShowLabGlow(false)}
            isUpgradeReady={false}
            bombLocked={introMissionLocked || Boolean(activeStoryBeat)}
            onUseBomb={() => {
              if (introMissionLocked || activeStoryBeat) return;
              setBombCommand({ nonce: Date.now() });
            }}
            onUpgrade={handleFieldUpgrade}
          />
        </React.Suspense>
      )}

      {gameState === GameState.MENU && (
        <StartScreen
          onStart={startGame}
          allTimeLeaderboard={leaderboard}
          monthlyLeaderboard={monthlyLeaderboard}
          archivedWinners={archivedWinners}
          isLoading={loadingLeaderboard}
          proposals={fundingProposals}
          proposalStatus={proposalStatus}
          onOpenReferral={openReferral}
          onOpenFund={openResearchHubFund}
          onOpenProposal={openResearchHubProposal}
          onOpenXProfile={() => miniAppService.openUrl(DONATION_CONFIG.X_PROFILE_URL)}
          onOpenTreasurySend={openTreasurySend}
          onOpenSwap={openRscSwap}
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

      {gameState === GameState.PAUSED && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-sm p-1">
            <div className="scicon-border-container"></div>
            <div className="scicon-inner-bg"></div>
            <div className="scicon-node node-tl-1"></div>
            <div className="scicon-node node-tr-1"></div>
            <div className="scicon-node node-bl-1"></div>
            <div className="scicon-node node-br-1"></div>

            <div className="relative z-10 space-y-6 p-8 text-center">
              <h2 className="arcade-font text-3xl font-bold tracking-widest text-white text-shadow-neon">PAUSED</h2>
              <div className="space-y-3">
                <button
                  onClick={() => setGameState(GameState.PLAYING)}
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
            </div>
          </div>
        </div>
      )}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 z-20 flex touch-pan-y items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden border border-red-300/20 bg-slate-950/88 shadow-[0_24px_90px_rgba(0,0,0,0.58)] backdrop-blur-xl animate-bounce-in [clip-path:polygon(18px_0,100%_0,100%_92%,96%_100%,0_100%,0_18px)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/70 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent"></div>

            <div className="relative z-10 min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain p-6 text-center custom-scrollbar">
              {showNameInput ? (
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-[8px] border border-cyan-200/25 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.22),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.96))] px-4 py-5 shadow-[0_0_36px_rgba(34,211,238,0.12)]">
                    <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/80 to-transparent" />
                    <div className="pointer-events-none absolute left-3 top-1/2 h-12 w-16 -translate-y-1/2 skew-x-[-18deg] border-y border-l border-cyan-200/30 bg-cyan-300/8" />
                    <div className="pointer-events-none absolute right-3 top-1/2 h-12 w-16 -translate-y-1/2 skew-x-[18deg] border-y border-r border-cyan-200/30 bg-cyan-300/8" />
                    <p className="relative text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">Stage {stats.wave} - Mission Result</p>
                    <h2 className="arcade-font relative mt-2 text-2xl font-black tracking-widest text-yellow-300 drop-shadow-[0_0_12px_rgba(250,204,21,0.45)]">
                      {scoreQualification.isMonthlyChampion ? 'WEEKLY #1 PILOT' : 'NEW HIGH SCORE'}
                    </h2>
                    <p className="relative mt-2 text-4xl font-black text-white">{stats.score.toLocaleString()}</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {scoreQualification.qualifiesMonthlyTop5 ? (
                      <span className="rounded-full border border-emerald-200/25 bg-emerald-300/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">
                        Weekly #{scoreQualification.monthlyRank}
                      </span>
                    ) : null}
                    {scoreQualification.qualifiesAllTimeTop25 ? (
                      <span className="rounded-full border border-blue-200/25 bg-blue-300/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-100">
                        All-Time #{scoreQualification.allTimeRank}
                      </span>
                    ) : null}
                  </div>
                  {scoreQualificationMessage ? (
                    <p className="rounded-[8px] border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-300">
                      {scoreQualificationMessage}
                    </p>
                  ) : null}
                  {continueRunControls}
                  <p className="font-mono text-sm text-gray-300">ENTER YOUR NAME:</p>

                  <form onSubmit={submitScore} className="space-y-4">
                    <input
                      type="text"
                      maxLength={15}
                      value={playerNameInput}
                      onChange={(e) => setPlayerNameInput(e.target.value.toUpperCase())}
                      className="w-full border border-indigo-500 bg-black/50 p-2 text-center font-mono text-xl uppercase text-white focus:border-yellow-400 focus:outline-none disabled:opacity-50"
                      placeholder="NAME"
                      autoFocus
                      disabled={isSubmittingScore}
                    />

                    {highScoreActionControls}
                  </form>
                </div>
              ) : (
                <>
                  <div>
                    <h2 className={`arcade-font mb-1 text-3xl font-black tracking-widest ${pubStatus.color}`}>{pubStatus.title}</h2>
                    <p className="font-mono text-sm uppercase text-gray-400">{pubStatus.desc}</p>
                  </div>

                  <div className="border border-white/10 bg-white/[0.04] p-4 [clip-path:polygon(12px_0,100%_0,100%_90%,96%_100%,0_100%,0_12px)]">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-gray-400">SCORE</span>
                      <span className="text-2xl font-bold text-white">{stats.score}</span>
                    </div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-gray-400">WAVE</span>
                      <span className="text-xl font-bold text-indigo-400">{stats.wave}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">HIGH SCORE</span>
                      <span className="text-xl font-bold text-yellow-400">{Math.max(stats.score, stats.highScore)}</span>
                    </div>
                  </div>

                  {continueRunControls}

                  <div className="space-y-3 pt-2">
                    <button
                      onClick={startGame}
                      className="scicon-btn w-full py-4 text-xl font-bold animate-pulse"
                    >
                      RETRY MISSION
                    </button>
                    <button
                      onClick={() => setGameState(GameState.MENU)}
                      className="scicon-btn scicon-btn-secondary w-full py-3 text-sm font-bold text-gray-400"
                    >
                      MAIN MENU
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {pendingFundingPick && gameState === GameState.GAMEOVER ? (
        <div className="absolute inset-0 z-40 flex touch-pan-y items-center justify-center bg-black/86 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-[8px] border border-emerald-200/30 bg-slate-950/96 shadow-[0_0_60px_rgba(16,185,129,0.18)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.2),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]" />
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent" />

            <div className="relative z-10 border-b border-white/10 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200">Weekly No. 1 Confirmed</p>
              <h2 className="arcade-font mt-2 text-2xl font-black uppercase tracking-widest text-white">Choose Funding Pick</h2>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-300">
                {pendingFundingPick.pilotName} saved {pendingFundingPick.score.toLocaleString()} points. Select the ResearchHub proposal for the 100 RSC allocation.
              </p>
            </div>

            <div className="relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain p-4 custom-scrollbar">
              {fundingPickSubmitError ? (
                <div className="mb-3 rounded-[8px] border border-red-300/25 bg-red-500/10 px-3 py-2 text-center text-[11px] font-semibold text-red-100">
                  {fundingPickSubmitError}
                </div>
              ) : null}

              <div className="mb-3 rounded-[8px] border border-white/10 bg-black/24 p-2">
                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                  <span>{visibleFundingProposals.length} of {fundingProposals.length} proposals</span>
                  <span className="text-emerald-200">Top votes first</span>
                </div>
                <input
                  type="search"
                  value={proposalSearchQuery}
                  onChange={(event) => setProposalSearchQuery(event.target.value)}
                  placeholder="Search title, author, or topic"
                  className="w-full rounded-[8px] border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-200/60"
                  disabled={isSubmittingFundingPick}
                />
              </div>

              {proposalStatus === 'loading' ? (
                <div className="rounded-[8px] bg-black/25 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 animate-pulse">
                  Loading live proposals...
                </div>
              ) : null}

              {(proposalStatus === 'empty' || proposalStatus === 'error') ? (
                <div className="rounded-[8px] bg-black/25 px-3 py-3 text-center text-[11px] font-semibold text-slate-400">
                  Live proposal choices are unavailable. Your score is already saved.
                </div>
              ) : null}

              {topVotedFundingProposals.length > 0 ? (
                <div className="mb-3 rounded-[8px] border border-yellow-200/20 bg-yellow-200/10 p-2">
                  <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-yellow-100">Most voted right now</div>
                  <div className="grid gap-2">
                    {topVotedFundingProposals.map((proposal) => {
                      const isSelected = selectedProposalId === proposal.id;

                      return (
                        <button
                          type="button"
                          key={`funding-top-${proposal.id}`}
                          onClick={() => setSelectedProposalId(proposal.id)}
                          disabled={isSubmittingFundingPick}
                          className={`rounded-[8px] border px-3 py-2 text-left transition ${isSelected ? 'border-yellow-100 bg-yellow-100 text-slate-950' : 'border-yellow-100/20 bg-black/25 text-yellow-50 hover:border-yellow-100/50'}`}
                        >
                          <span className="line-clamp-1 text-xs font-black">{proposal.title}</span>
                          <span className={`mt-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] ${isSelected ? 'text-slate-700' : 'text-yellow-100/80'}`}>
                            <span>{proposal.votes} votes</span>
                            <span>{proposal.backers} backers</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {visibleFundingProposals.length === 0 ? (
                  <div className="rounded-[8px] border border-white/10 bg-black/25 px-3 py-6 text-center text-[11px] font-semibold text-slate-400">
                    No proposals match that search yet.
                  </div>
                ) : null}
                {visibleFundingProposals.map((proposal) => {
                  const isSelected = selectedProposalId === proposal.id;

                  return (
                    <button
                      type="button"
                      key={`funding-${proposal.id}`}
                      onClick={() => setSelectedProposalId(proposal.id)}
                      disabled={isSubmittingFundingPick}
                      className={`w-full rounded-[8px] border bg-white p-2 text-left text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition ${isSelected ? 'border-emerald-300 ring-2 ring-emerald-300/70' : 'border-slate-200 hover:border-emerald-300/70'}`}
                    >
                      <span className="flex gap-3">
                        <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[8px] border border-slate-200 bg-slate-100">
                          {proposal.imageUrl ? (
                            <img src={proposal.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-slate-950 text-lg font-black text-white">
                              {(proposal.author || 'RH').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'RH'}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-black leading-snug">{proposal.title}</span>
                          <span className="mt-1 block truncate text-[11px] font-semibold text-slate-500">{proposal.author}</span>
                          <span className="mt-2 grid grid-cols-3 gap-1 rounded-[8px] bg-slate-50 p-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                            <span>Ask <strong className="block text-xs text-blue-600">{proposal.requestedUsd ? `$${Math.round(proposal.requestedUsd / 1000)}K` : 'N/A'}</strong></span>
                            <span>Raised <strong className="block text-xs text-slate-950">{proposal.raisedUsd ? `$${Math.round(proposal.raisedUsd / 1000)}K` : 'N/A'}</strong></span>
                            <span>Review <strong className="block text-xs text-slate-950">{proposal.peerReview?.toFixed(1) ?? 'N/A'}</strong></span>
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative z-10 border-t border-white/10 bg-slate-950/96 p-3">
              <button
                type="button"
                onClick={() => void submitFundingPick()}
                disabled={!selectedShareProposal || isSubmittingFundingPick}
                className="scicon-btn w-full py-3 text-base font-bold disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmittingFundingPick ? 'SAVING PICK...' : 'SAVE FUNDING PICK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}


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
                    <li><span className="text-yellow-300">Continues:</span> After a crash, pay RSC to revive this run with three hearts.</li>
                    <li><span className="text-cyan-300">Upgrades:</span> Dock at the lab for fire rate, handling, missiles, and emergency repairs.</li>
                    <li><span className="text-purple-400">Current Run:</span> Lab upgrades reset each mission, so the best pilots decide when to tune up.</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-indigo-400">FUNDING EVENT:</strong>
                  <p className="mt-1">
                    The weekly leaderboard now drives the funding allocation: the No. 1 pilot chooses a ResearchHub proposal, and Scott can direct the RSC award toward that winner's pick.
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
            onComplete={() => setActiveStoryBeat(null)}
          />
        </React.Suspense>
      ) : null}

    </div>
  );
};

export default App;
