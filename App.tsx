import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getContract, sendAndConfirmTransaction } from 'thirdweb';
import { getBalance, transfer } from 'thirdweb/extensions/erc20';
import {
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
  useConnectModal,
  useDisconnect as useThirdwebDisconnect
} from 'thirdweb/react';
import type { Account } from 'thirdweb/wallets';
import GameCanvas from './components/GameCanvas';
import StartScreen from './components/StartScreen';
import UIOverlay from './components/UIOverlay';
import UpgradeShop from './components/UpgradeShop';
import Tutorial from './components/Tutorial';
import SupportPanel from './components/SupportPanel';
import WalletButton from './components/WalletButton';
import FundingWidgetModal, { FundingCreditToken, FundingWidgetMode } from './components/FundingWidgetModal';
import StoryTransmission from './components/StoryTransmission';
import UpgradeCoach from './components/UpgradeCoach';
import { ArchivedWinner, DonationStatus, GameState, LeaderboardEntry, MiniAppState, PowerupType, Stats, Upgrades, WalletSession } from './types';
import { audioService } from './services/audioService';
import { ASSETS, DONATION_CONFIG, STORAGE_KEYS, UPGRADE_BASE_COSTS } from './constants';
import { getLeaderboardData, saveScore } from './services/leaderboardService';
import { getArchivedWeeklyWinners } from './services/winnerArchiveService';
import { getResearchHubFundingProposals, ResearchHubProposal } from './services/researchHubProposals';
import { miniAppService } from './services/miniAppService';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';
import {
  thirdwebAppMetadata,
  thirdwebBaseChain,
  thirdwebBscChain,
  thirdwebClient,
  thirdwebConnectModal,
  thirdwebRecommendedWallets,
  thirdwebTheme,
  thirdwebWallets
} from './services/thirdwebWallet';

type ProposalFeedStatus = 'loading' | 'ready' | 'empty' | 'error';

const defaultMiniAppState: MiniAppState = {
  isMiniApp: false,
  clientFid: null,
  added: false,
  userFid: null,
  platformType: null
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
  [PowerupType.KARMA_LASER]: 0
};

const purchasablePowerups = [
  PowerupType.DOUBLE_SHOT,
  PowerupType.TRIPLE_SHOT,
  PowerupType.MAGNET,
  PowerupType.SHIELD
];

const getUpgradeCost = (type: keyof Upgrades, upgrades: Upgrades) => (
  UPGRADE_BASE_COSTS[type] + (5 * (Math.pow(2, upgrades[type]) - 1))
);

const getRepairCost = (stats: Stats) => (
  UPGRADE_BASE_COSTS.repair + ((stats.repairsCount || 0) * 5)
);

const getPowerupCost = (stats: Stats, type: PowerupType) => (
  UPGRADE_BASE_COSTS.powerup + ((stats.powerupUses?.[type] || 0) * 10)
);

const canAffordUpgrade = (stats: Stats) => (
  (Object.keys(stats.upgrades) as Array<keyof Upgrades>).some((type) => stats.upgrades[type] < 5 && stats.coins >= getUpgradeCost(type, stats.upgrades))
  || stats.coins >= getRepairCost(stats)
  || purchasablePowerups.some((type) => stats.coins >= getPowerupCost(stats, type))
);

const getUserFacingMessage = (error: any, fallback: string, tokenLabel = 'RSC') => {
  const message = error?.shortMessage || error?.message || fallback;

  if (/rejected|denied|cancelled|canceled|closed modal|request rejected/i.test(message)) {
    return fallback;
  }

  if (/insufficient/i.test(message)) {
    return `Not enough ${tokenLabel} or gas for that action.`;
  }

  return message;
};

const getInsufficientCreditTokenMessage = (
  token: FundingCreditToken,
  requiredAmount: number,
  availableDisplayValue = '0'
) => {
  if (token === 'KRMA') {
    return `You need ${requiredAmount} KRMA on BNB Smart Chain to buy this credit pack. Your wallet shows ${availableDisplayValue} KRMA. Get KARMA first, then return to Buy Credits.`;
  }

  return `You need ${requiredAmount} RSC on Base to buy this credit pack. Your wallet shows ${availableDisplayValue} RSC. Swap or buy RSC first, then return to Buy Credits.`;
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

const buildHighScoreShareUrl = ({
  score,
  wave,
  monthlyRank,
  allTimeRank,
  isMonthlyChampion,
  selectedProposal
}: {
  score: number;
  wave: number;
  monthlyRank?: number;
  allTimeRank?: number;
  isMonthlyChampion: boolean;
  selectedProposal?: ResearchHubProposal;
}) => {
  const compactProposalTitle = selectedProposal?.title && selectedProposal.title.length > 86
    ? `${selectedProposal.title.slice(0, 83)}...`
    : selectedProposal?.title;
  const rankParts = [
    monthlyRank ? `Weekly #${monthlyRank}` : '',
    allTimeRank ? `All-Time #${allTimeRank}` : ''
  ].filter(Boolean);
  const scoreLine = `I scored ${score.toLocaleString()} in SciCon Shooter${rankParts.length ? ` (${rankParts.join(' / ')})` : ''}.`;
  const missionLine = isMonthlyChampion && compactProposalTitle
    ? `I picked "${compactProposalTitle}" for the 100 RSC weekly funding-credit allocation.`
    : 'Trying to climb the leaderboard and win weekly RSC funding credits for science.';
  const playLine = `Play here: ${DONATION_CONFIG.GAME_URL}`;
  const shareUrl = isMonthlyChampion && selectedProposal?.url
    ? selectedProposal.url
    : '';
  const params = new URLSearchParams({ text: `${scoreLine}\n${missionLine}\nWave ${wave}. ${playLine}` });

  if (shareUrl) {
    params.set('url', shareUrl);
  }

  return `https://x.com/intent/tweet?${params.toString()}`;
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
  const [showLabGlow, setShowLabGlow] = useState<boolean>(true);
  const [miniApp, setMiniApp] = useState<MiniAppState>(defaultMiniAppState);
  const [walletError, setWalletError] = useState<string>('');
  const [labFundingStatus, setLabFundingStatus] = useState<DonationStatus>('idle');
  const [labFundingHash, setLabFundingHash] = useState<string>('');
  const [labFundingExplorerBaseUrl, setLabFundingExplorerBaseUrl] = useState<string>(DONATION_CONFIG.EXPLORER_BASE_URL);
  const [labFundingError, setLabFundingError] = useState<string>('');
  const [fundingWidget, setFundingWidget] = useState<{ mode: FundingWidgetMode; rscAmount?: number; source: 'lab' | 'profile'; creditToken?: FundingCreditToken } | null>(null);
  const [activeStoryBeat, setActiveStoryBeat] = useState<StoryBeat | null>(null);
  const [showUpgradeCoach, setShowUpgradeCoach] = useState(false);
  const [upgradeCoachSeenGameId, setUpgradeCoachSeenGameId] = useState(0);
  const [purchasedPowerup, setPurchasedPowerup] = useState<{ type: PowerupType; nonce: number } | null>(null);
  const [donatedWallets, setDonatedWallets] = useState<Record<string, boolean>>(() => {
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

  const thirdwebAccount = useActiveAccount();
  const thirdwebWallet = useActiveWallet();
  const thirdwebChain = useActiveWalletChain();
  const { connect: openThirdwebConnectModal, isConnecting: isThirdwebConnecting } = useConnectModal();
  const { disconnect: disconnectThirdweb } = useThirdwebDisconnect();
  const activeWalletAddress = thirdwebAccount?.address ?? null;
  const activeWalletChainId = thirdwebChain?.id ?? null;

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

  const wallet: WalletSession = {
    address: activeWalletAddress,
    chainId: activeWalletChainId,
    status: activeWalletAddress ? 'connected' : isThirdwebConnecting ? 'connecting' : walletError ? 'error' : 'idle',
    error: walletError,
    connectorName: thirdwebWallet?.id,
    hasDonated: activeWalletAddress ? Boolean(donatedWallets[activeWalletAddress.toLowerCase()]) : false
  };

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
      profileCredits: 0,
      totalCoins: 0,
      playerName: ''
    };
  };

  useEffect(() => {
    const fetchScores = async () => {
      const alreadyHasData = leaderboard.length > 0;
      if (!alreadyHasData) {
        setLoadingLeaderboard(true);
      }

      try {
        const data = await getLeaderboardData();
        if (data.scores.length > 0) {
          setLeaderboard(data.scores);
        }
        setMonthlyLeaderboard(data.monthlyScores);
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        if (!alreadyHasData) {
          setLoadingLeaderboard(false);
        }
      }
    };

    const fetchArchivedWinners = async () => {
      const winners = await getArchivedWeeklyWinners();
      setArchivedWinners(winners);
    };

    if (gameState === GameState.MENU || gameState === GameState.GAMEOVER) {
      fetchScores();
      fetchArchivedWinners();
    }
  }, [gameState, leaderboard.length]);

  useEffect(() => {
    let active = true;

    getResearchHubFundingProposals()
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

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showNameInput || selectedProposalId || sortedFundingProposals.length === 0) {
      return;
    }

    setSelectedProposalId(sortedFundingProposals[0].id);
  }, [selectedProposalId, showNameInput, sortedFundingProposals]);

  const getInitialStats = (): Stats => {
    const parsed = readSavedStats(activeWalletAddress);

    return {
      score: 0,
      highScore: parsed.highScore || 0,
      wave: 1,
      coins: 0,
      profileCredits: parsed.profileCredits || 0,
      totalCoins: parsed.totalCoins || 0,
      enemiesDefeated: 0,
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
      profileCredits: stats.profileCredits || 0,
      totalCoins: stats.totalCoins,
      playerName: playerNameInput
    };
    localStorage.setItem(getWalletProfileKey(activeWalletAddress), JSON.stringify(statsToSave));
    localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.highScore.toString());
  }, [activeWalletAddress, playerNameInput, stats.highScore, stats.profileCredits, stats.totalCoins]);

  useEffect(() => {
    if (!activeWalletAddress) return;

    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, activeWalletAddress);
    const savedStats = readSavedStats(activeWalletAddress);
    setStats(prev => ({
      ...prev,
      highScore: Math.max(prev.highScore, savedStats.highScore || 0),
      profileCredits: Math.max(prev.profileCredits || 0, savedStats.profileCredits || 0),
      totalCoins: Math.max(prev.totalCoins, savedStats.totalCoins || 0)
    }));

  }, [activeWalletAddress]);

  useEffect(() => {
    let active = true;

    const setupMiniApp = async () => {
      const state = await miniAppService.getState();
      if (!active) return;

      setMiniApp(state);
      if (state.isMiniApp) {
        await miniAppService.ready();
      }
    };

    setupMiniApp();

    return () => {
      active = false;
    };
  }, []);

  const startGame = () => {
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
      lives: 3,
      repairsCount: 0,
      upgrades: { ...defaultMissionUpgrades },
      powerupUses: { ...defaultPowerupUses },
      bossProgress: 0,
      isBossActive: false,
      bossHp: 0,
      bossMaxHp: 100
    }));
    setLabFundingStatus('idle');
    setLabFundingHash('');
    setLabFundingError('');
    setShowUpgradeCoach(false);
    setPurchasedPowerup(null);
    setShowNameInput(false);
    setPlayerNameInput('');
    setSelectedProposalId('');
    setIsSubmittingScore(false);
    submittingScoreRef.current = false;
    setGameId(prev => prev + 1);
    setGameState(GameState.TUTORIAL);
  };

  const handleTutorialComplete = () => {
    clearIntroStoryTimeout();
    lastStoryWaveRef.current = 1;
    setGameState(GameState.PLAYING);
    introStoryTimeoutRef.current = window.setTimeout(() => {
      introStoryTimeoutRef.current = null;
      if (gameStateRef.current === GameState.PLAYING) {
        setActiveStoryBeat(getStoryBeatForPhase(1));
      }
    }, 900);
  };

  const resetGame = () => {
    clearIntroStoryTimeout();
    setActiveStoryBeat(null);
    setGameState(GameState.MENU);
  };

  const handleUpgrade = (type: keyof Upgrades | 'repair') => {
    if (type === 'repair') {
      const currentRepairs = stats.repairsCount || 0;
      const cost = UPGRADE_BASE_COSTS.repair + (currentRepairs * 5);

      if (stats.coins >= cost) {
        audioService.playSound('powerup');
        setStats(prev => ({
          ...prev,
          coins: prev.coins - cost,
          lives: prev.lives + 1,
          repairsCount: (prev.repairsCount || 0) + 1
        }));
      }
      return;
    }

    const currentLevel = stats.upgrades[type];
    const cost = getUpgradeCost(type, stats.upgrades);

    if (stats.coins >= cost && currentLevel < 5) {
      audioService.playSound('coin');
      setStats(prev => ({
        ...prev,
        coins: prev.coins - cost,
        upgrades: {
          ...prev.upgrades,
          [type]: prev.upgrades[type] + 1
        }
      }));
    }
  };

  const handleDeposit = (amount: number) => {
    setStats(prev => ({
      ...prev,
      coins: prev.coins + amount
    }));
    audioService.playSound('coin');
  };

  const handleBuyPowerup = (type: PowerupType) => {
    const cost = getPowerupCost(stats, type);
    if (stats.coins < cost) return;

    setStats(prev => ({
      ...prev,
      coins: prev.coins - cost,
      powerupUses: {
        ...prev.powerupUses,
        [type]: (prev.powerupUses?.[type] || 0) + 1
      }
    }));
    setPurchasedPowerup({ type, nonce: Date.now() });
  };

  const openThirdwebWallet = async (): Promise<Account | null> => {
    if (!thirdwebClient) {
      const message = 'Add VITE_THIRDWEB_CLIENT_ID to enable the thirdweb wallet connection.';
      setWalletError(message);
      setLabFundingError(message);
      return null;
    }

    try {
      setWalletError('');
      const connectedWallet = await openThirdwebConnectModal({
        client: thirdwebClient,
        wallets: thirdwebWallets,
        recommendedWallets: thirdwebRecommendedWallets,
        chain: thirdwebBaseChain,
        appMetadata: thirdwebAppMetadata,
        theme: thirdwebTheme,
        ...thirdwebConnectModal
      });

      if (connectedWallet.getChain()?.id !== DONATION_CONFIG.BASE_CHAIN_ID) {
        await connectedWallet.switchChain(thirdwebBaseChain);
      }

      const account = connectedWallet.getAccount();
      if (!account) {
        throw new Error('Wallet connected without an active account.');
      }

      return account;
    } catch (error: any) {
      console.error("Wallet connection failed", error);
      setWalletError(getUserFacingMessage(error, 'Wallet connection was cancelled.'));
      return null;
    }
  };

  const connectWallet = async (_connectorId?: string) => {
    if (activeWalletAddress) {
      setWalletError('');
      return;
    }

    await openThirdwebWallet();
  };

  const disconnectWallet = () => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    if (thirdwebWallet) {
      disconnectThirdweb(thirdwebWallet);
    }
    setWalletError('');
    setLabFundingStatus('idle');
    setLabFundingHash('');
    setLabFundingExplorerBaseUrl(DONATION_CONFIG.EXPLORER_BASE_URL);
    setLabFundingError('');
  };

  const openFundingWidget = (
    mode: FundingWidgetMode,
    rscAmount = DONATION_CONFIG.PRESET_RSC_AMOUNTS[0],
    source: 'lab' | 'profile' = 'profile',
    creditToken: FundingCreditToken = 'RSC'
  ) => {
    setLabFundingError('');
    setLabFundingHash('');
    setLabFundingExplorerBaseUrl(DONATION_CONFIG.EXPLORER_BASE_URL);
    setFundingWidget({ mode, rscAmount, source, creditToken });
  };

  const fundCurrentMission = (rscAmount: number, token: FundingCreditToken = 'RSC') => {
    setLabFundingStatus('processing');
    openFundingWidget('checkout', rscAmount, 'lab', token);
  };

  const handleFundingWidgetSuccess = (rscAmount: number, txHash = '', token: FundingCreditToken = 'RSC') => {
    const credits = rscAmount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC;
    const explorerBaseUrl = token === 'KRMA'
      ? DONATION_CONFIG.EXPLORER_BSC_BASE_URL
      : DONATION_CONFIG.EXPLORER_BASE_URL;
    setStats(prev => ({
      ...prev,
      coins: prev.coins,
      profileCredits: (prev.profileCredits || 0) + credits,
      totalCoins: prev.totalCoins + credits
    }));
    audioService.playSound('coin');

    setLabFundingStatus('success');
    setLabFundingHash(txHash);
    setLabFundingExplorerBaseUrl(explorerBaseUrl);
    setLabFundingError('');

    if (activeWalletAddress) {
      const walletKey = activeWalletAddress.toLowerCase();
      setDonatedWallets(prev => {
        const next = { ...prev, [walletKey]: true };
        localStorage.setItem(STORAGE_KEYS.DONATED_WALLETS, JSON.stringify(next));
        return next;
      });
    }

    setTimeout(() => {
      setLabFundingStatus('idle');
    }, 5000);
  };

  const handleDirectRscCreditPayment = async (rscAmount: number, token: FundingCreditToken = 'RSC') => {
    if (!thirdwebClient) {
      throw new Error('Add VITE_THIRDWEB_CLIENT_ID to enable token payments.');
    }

    let account = thirdwebAccount;
    if (!account) {
      account = await openThirdwebWallet();
    }

    if (!account) {
      throw new Error('Connect a wallet before funding mission credits.');
    }

    const tokenChain = token === 'KRMA' ? thirdwebBscChain : thirdwebBaseChain;
    const tokenAddress = token === 'KRMA'
      ? DONATION_CONFIG.KARMA_CONTRACT_ADDRESS
      : DONATION_CONFIG.RSC_CONTRACT_ADDRESS;
    const tokenLabel = token === 'KRMA' ? 'KRMA' : 'RSC';

    if (thirdwebWallet && thirdwebWallet.getChain()?.id !== tokenChain.id) {
      setLabFundingStatus('switching_network');
      await thirdwebWallet.switchChain(tokenChain);
    }

    setLabFundingStatus('processing');
    setLabFundingError('');
    setLabFundingHash('');
    setLabFundingExplorerBaseUrl(token === 'KRMA' ? DONATION_CONFIG.EXPLORER_BSC_BASE_URL : DONATION_CONFIG.EXPLORER_BASE_URL);

    const creditTokenContract = getContract({
      client: thirdwebClient,
      chain: tokenChain,
      address: tokenAddress as `0x${string}`
    });

    let balanceDisplayValue = '0';
    try {
      const balance = await getBalance({
        contract: creditTokenContract,
        address: account.address
      });
      balanceDisplayValue = balance.displayValue;
      const availableBalance = Number(balance.displayValue);

      if (Number.isFinite(availableBalance) && availableBalance + 0.000000001 < rscAmount) {
        const message = getInsufficientCreditTokenMessage(token, rscAmount, balanceDisplayValue);
        setLabFundingStatus('error');
        setLabFundingError(message);
        throw new Error(message);
      }
    } catch (error: any) {
      const message = error?.message || '';
      if (message.includes('Swap or buy RSC') || message.includes('Get KARMA')) {
        throw error;
      }

      console.warn(`${tokenLabel} balance preflight failed; continuing to wallet confirmation.`, error);
    }

    const transaction = transfer({
      contract: creditTokenContract,
      to: DONATION_CONFIG.RECIPIENT_ADDRESS,
      amount: rscAmount.toString()
    });

    try {
      setLabFundingStatus('confirming');
      const receipt = await sendAndConfirmTransaction({ account, transaction });
      const txHash = receipt.transactionHash || '';
      handleFundingWidgetSuccess(rscAmount, txHash, token);
      return txHash;
    } catch (error: any) {
      const message = getUserFacingMessage(error, `${tokenLabel} payment was cancelled before credits were added.`, tokenLabel);
      setLabFundingStatus('error');
      setLabFundingError(message);
      throw new Error(message);
    }
  };

  const handleFundingWidgetError = (message: string) => {
    setLabFundingStatus('error');
    setLabFundingError(message || 'Payment flow could not complete.');
  };

  const handleClaimProfileCredits = (amount: number) => {
    setStats(prev => {
      const profileCredits = prev.profileCredits || 0;
      const creditsToDeploy = Math.max(0, Math.min(profileCredits, Math.floor(amount || 0)));

      if (creditsToDeploy <= 0) {
        return prev;
      }

      audioService.playSound('coin');
      return {
        ...prev,
        coins: prev.coins + creditsToDeploy,
        profileCredits: profileCredits - creditsToDeploy
      };
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        if (gameState === GameState.PLAYING) {
          setGameState(GameState.SHOP);
        } else if (gameState === GameState.SHOP) {
          setGameState(GameState.PLAYING);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

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
    if (gameState !== GameState.PLAYING || activeStoryBeat || showUpgradeCoach) {
      return;
    }

    if (upgradeCoachSeenGameId === gameId || !canAffordUpgrade(stats)) {
      return;
    }

    setUpgradeCoachSeenGameId(gameId);
    setShowUpgradeCoach(true);
  }, [activeStoryBeat, gameId, gameState, showUpgradeCoach, stats, upgradeCoachSeenGameId]);

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
        if (scoreQualification.isMonthlyChampion && !selectedProposalId && sortedFundingProposals.length > 0) {
          setSelectedProposalId(sortedFundingProposals[0].id);
        }
        setScoreSubmitError('');
        setShowNameInput(true);
      }
    }
  }, [gameId, gameState, monthlyLeaderboard, selectedProposalId, sortedFundingProposals, stats.score, stats.wave, stats.highScore, leaderboard]);

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
    const submitQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, score);
    const isMonthlyChampionSubmission = submitQualification.isMonthlyChampion;
    const selectedProposal = isMonthlyChampionSubmission
      ? sortedFundingProposals.find((proposal) => proposal.id === selectedProposalId) || sortedFundingProposals[0]
      : undefined;
    const proposalPickData = selectedProposal ? {
      proposalId: selectedProposal.id,
      proposalTitle: selectedProposal.title,
      proposalUrl: selectedProposal.url,
      proposalAuthor: selectedProposal.author
    } : {};

    const newEntry: LeaderboardEntry = {
      name,
      score,
      wave,
      date: submittedAt,
      walletAddress: activeWalletAddress || undefined,
      donated: wallet.hasDonated,
      ...proposalPickData
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
        walletAddress: activeWalletAddress,
        donated: wallet.hasDonated,
        ...proposalPickData
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
        setGameState(GameState.MENU);
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

  const skipScoreSubmission = () => {
    submittingScoreRef.current = false;
    setIsSubmittingScore(false);
    setShowNameInput(false);
    setPlayerNameInput('');
    setSelectedProposalId('');
    setScoreSubmitError('');
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

  const openRscSwap = () => {
    openFundingWidget('buy');
  };

  const openKarmaSwap = async () => {
    await miniAppService.openUrl(DONATION_CONFIG.KARMA_SWAP_URL);
  };

  const openTreasurySend = async () => {
    await miniAppService.openUrl(`ethereum:${DONATION_CONFIG.RECIPIENT_ADDRESS}@${DONATION_CONFIG.BASE_CHAIN_ID}`);
  };

  const pubStatus = getPubStatus(stats.score);
  const scoreQualification = getProjectedScoreQualification(leaderboard, monthlyLeaderboard, stats.score);
  const selectedShareProposal = fundingProposals.find((proposal) => proposal.id === selectedProposalId);
  const highScoreShareUrl = buildHighScoreShareUrl({
    score: stats.score,
    wave: stats.wave,
    monthlyRank: scoreQualification.qualifiesMonthlyTop5 ? scoreQualification.monthlyRank : undefined,
    allTimeRank: scoreQualification.qualifiesAllTimeTop25 ? scoreQualification.allTimeRank : undefined,
    isMonthlyChampion: scoreQualification.isMonthlyChampion,
    selectedProposal: selectedShareProposal
  });
  const shareHighScore = async () => {
    if (!playerNameInput.trim() || submittingScoreRef.current) return;

    const shareUrl = highScoreShareUrl;
    const saved = await persistHighScore();
    if (saved) {
      await miniAppService.openUrl(shareUrl);
    }
  };
  const canSelectFundingProposal = showNameInput
    && scoreQualification.isMonthlyChampion;
  const scoreQualificationMessage = scoreQualification.isMonthlyChampion
    ? 'Weekly champion run. Pick the proposal that should receive the 100 RSC funding-credit allocation.'
    : scoreQualification.qualifiesMonthlyTop5 && scoreQualification.qualifiesAllTimeTop25
      ? 'This score qualifies for weekly Top 5 and all-time Top 25. It is saved once and appears on both boards while it ranks on both.'
      : scoreQualification.qualifiesMonthlyTop5
        ? `Weekly Top 5 run at projected rank #${scoreQualification.monthlyRank}. Push for #1 to unlock the champion proposal pick.`
        : scoreQualification.qualifiesAllTimeTop25
          ? `All-time Top 25 run at projected rank #${scoreQualification.allTimeRank}. Try again this week for #1 so you can steer funding credits.`
          : '';
  const sharePrompt = scoreQualification.isMonthlyChampion && selectedShareProposal
    ? 'Share your No. 1 run and proposal pick.'
    : 'Share your score and invite pilots to chase the funding-credit board.';
  const highScoreActionControls = (
    <div className="sticky top-0 z-20 rounded-2xl border border-white/10 bg-slate-950/92 p-3 shadow-[0_16px_46px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {scoreSubmitError ? (
        <p className="mb-3 rounded-xl border border-red-300/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-semibold leading-relaxed text-red-100">
          {scoreSubmitError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <button
          type="button"
          onClick={shareHighScore}
          disabled={!playerNameInput || isSubmittingScore || (scoreQualification.isMonthlyChampion && fundingProposals.length > 0 && !selectedShareProposal)}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-slate-100 transition hover:border-sky-300/50 hover:bg-sky-300/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save & Share on X
        </button>
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
        {sharePrompt} Your score saves before X opens.
      </p>
      {canSelectFundingProposal ? (
        <p className="mt-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">
          Champion funding pick is below.
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="relative h-full w-full select-none bg-[#0b1020]">
      {gameState === GameState.MENU && !activeStoryBeat ? (
        <WalletButton
          wallet={wallet}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
          onOpenFunding={openFundingWidget}
          credits={stats.profileCredits || 0}
        />
      ) : null}

      {(gameState === GameState.PLAYING || gameState === GameState.PAUSED || gameState === GameState.GAMEOVER || gameState === GameState.SHOP || gameState === GameState.TUTORIAL) && (
        <GameCanvas
          key={gameId}
          stats={stats}
          setStats={setStats}
          setGameState={setGameState}
          gameState={gameState}
          isTransmissionOpen={Boolean(activeStoryBeat || showUpgradeCoach)}
          purchasedPowerup={purchasedPowerup}
        />
      )}

      {gameState === GameState.TUTORIAL && (
        <Tutorial onReady={handleTutorialComplete} />
      )}

      {gameState === GameState.PLAYING && (
        <UIOverlay
          stats={stats}
          setGameState={setGameState}
          lives={stats.lives}
          showLabGlow={showLabGlow}
          onDisableLabGlow={() => setShowLabGlow(false)}
          isUpgradeReady={canAffordUpgrade(stats)}
        />
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

      {gameState === GameState.SHOP && (
        <UpgradeShop
          stats={stats}
          wallet={wallet}
          onUpgrade={handleUpgrade}
          onDeposit={handleDeposit}
          onBuyPowerup={handleBuyPowerup}
          onClose={() => setGameState(GameState.PLAYING)}
          onConnectWallet={connectWallet}
          onBuyMissionCredits={fundCurrentMission}
          onOpenRscSwap={openRscSwap}
          onOpenKarmaSwap={openKarmaSwap}
          onClaimProfileCredits={handleClaimProfileCredits}
          labFundingStatus={labFundingStatus}
          labFundingHash={labFundingHash}
          labFundingExplorerBaseUrl={labFundingExplorerBaseUrl}
          labFundingError={labFundingError}
          gameId={gameId}
        />
      )}

      {fundingWidget ? (
        <FundingWidgetModal
          mode={fundingWidget.mode}
          rscAmount={fundingWidget.rscAmount}
          initialCreditToken={fundingWidget.creditToken}
          walletAddress={activeWalletAddress}
          onClose={() => setFundingWidget(null)}
          onModeChange={(mode, rscAmount) => setFundingWidget({ ...fundingWidget, mode, rscAmount })}
          onCreditPayment={handleDirectRscCreditPayment}
          onWidgetError={handleFundingWidgetError}
        />
      ) : null}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 z-20 flex touch-pan-y items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden border border-red-300/20 bg-slate-950/88 shadow-[0_24px_90px_rgba(0,0,0,0.58)] backdrop-blur-xl animate-bounce-in [clip-path:polygon(18px_0,100%_0,100%_92%,96%_100%,0_100%,0_18px)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/70 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent"></div>

            <div className="relative z-10 min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain p-6 text-center custom-scrollbar">
              {showNameInput ? (
                <div className="space-y-4">
                  <h2 className="arcade-font animate-pulse text-2xl font-black tracking-widest text-yellow-400">NEW HIGH SCORE!</h2>
                  <div className="text-4xl font-bold text-white">{stats.score}</div>
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
                    {scoreQualification.isMonthlyChampion ? (
                      <span className="rounded-full border border-yellow-200/30 bg-yellow-200/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-100">
                        RSC Pick
                      </span>
                    ) : null}
                  </div>
                  {scoreQualificationMessage ? (
                    <p className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-300">
                      {scoreQualificationMessage}
                    </p>
                  ) : null}
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

                    {canSelectFundingProposal ? (
                      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-left">
                        <div className="mb-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Weekly No. 1 Funding Pick</div>
                          <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-300">
                            You are taking the weekly lead. Scroll the live ResearchHub proposal list and choose one for the 100 RSC funding-credit allocation.
                          </p>
                        </div>

                        {proposalStatus === 'loading' ? (
                          <div className="rounded-xl bg-black/25 px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 animate-pulse">
                            Loading live proposals...
                          </div>
                        ) : null}

                        {(proposalStatus === 'empty' || proposalStatus === 'error') ? (
                          <div className="rounded-xl bg-black/25 px-3 py-3 text-center text-[11px] font-semibold text-slate-400">
                            Live proposal choices are unavailable. Your score can still be submitted.
                          </div>
                        ) : null}

                        {fundingProposals.length > 0 ? (
                          <>
                          <div className="mb-3 rounded-xl border border-white/10 bg-black/20 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                              <span>{visibleFundingProposals.length} of {fundingProposals.length} proposals</span>
                              <span className="text-emerald-200">Top votes first</span>
                            </div>
                            <input
                              type="search"
                              value={proposalSearchQuery}
                              onChange={(event) => setProposalSearchQuery(event.target.value)}
                              placeholder="Search title, author, or topic"
                              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-200/60"
                              disabled={isSubmittingScore}
                            />
                          </div>

                          {topVotedFundingProposals.length > 0 ? (
                            <div className="mb-3 rounded-2xl border border-yellow-200/20 bg-yellow-200/10 p-2">
                              <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-yellow-100">Most voted right now</div>
                              <div className="grid gap-2">
                                {topVotedFundingProposals.map((proposal) => {
                                  const isSelected = selectedProposalId === proposal.id;

                                  return (
                                    <button
                                      type="button"
                                      key={`top-${proposal.id}`}
                                      onClick={() => setSelectedProposalId(proposal.id)}
                                      disabled={isSubmittingScore}
                                      className={`rounded-xl border px-3 py-2 text-left transition ${isSelected ? 'border-yellow-100 bg-yellow-100 text-slate-950' : 'border-yellow-100/20 bg-black/25 text-yellow-50 hover:border-yellow-100/50'}`}
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

                          <div className="custom-scrollbar max-h-[42vh] touch-pan-y space-y-3 overflow-y-auto overscroll-contain pr-1">
                            {visibleFundingProposals.length === 0 ? (
                              <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-6 text-center text-[11px] font-semibold text-slate-400">
                                No proposals match that search yet.
                              </div>
                            ) : null}
                            {visibleFundingProposals.map((proposal) => {
                              const isSelected = selectedProposalId === proposal.id;

                              return (
                                <button
                                  type="button"
                                  key={proposal.id}
                                  onClick={() => setSelectedProposalId(proposal.id)}
                                  disabled={isSubmittingScore}
                                  className={`w-full rounded-2xl border bg-white p-2 text-left text-slate-950 shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition ${isSelected ? 'border-emerald-300 ring-2 ring-emerald-300/60' : 'border-slate-200 hover:border-emerald-300/70'}`}
                                >
                                  <span className="flex gap-3">
                                    <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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
                                      <span className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-50 p-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
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
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center text-[11px] font-semibold leading-relaxed text-slate-400">
                        {scoreQualification.qualifiesAllTimeTop25 && !scoreQualification.qualifiesMonthlyTop5
                          ? 'This score lands on the all-time board. Try again before week-end for weekly No. 1 and the champion proposal pick.'
                        : 'Proposal selection unlocks only for the weekly No. 1 pilot. This score still submits to each leaderboard it qualifies for.'}
                      </div>
                    )}
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

                  <SupportPanel
                    wallet={wallet}
                    isMiniApp={miniApp.isMiniApp}
                    onConnect={connectWallet}
                    onDisconnect={disconnectWallet}
                    compact
                  />

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
                  <strong className="text-indigo-400">OBJECTIVE:</strong> Pilot the <span className="text-white">Research Flask</span> through the bottlenecks slowing open science. Score high, upgrade with RSC-powered mission credits, and fight for proposals that deserve funding.
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
                    <li><span className="text-yellow-300">Mission Credits:</span> Collect them in-run or fund more at 100 credits per 1 RSC.</li>
                    <li><span className="text-cyan-300">Upgrades:</span> Spend credits on fire rate, handling, missiles, and emergency repairs.</li>
                    <li><span className="text-purple-400">Current Run:</span> Lab upgrades reset each mission, so the best pilots decide when to invest.</li>
                  </ul>
                </div>
                <div>
                  <strong className="text-indigo-400">FUNDING EVENT:</strong>
                  <p className="mt-1">
                    The weekly leaderboard now drives the funding allocation: the No. 1 pilot chooses a ResearchHub proposal, and Scott can direct funding credits toward that winner's pick.
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
        <StoryTransmission
          beat={activeStoryBeat}
          onComplete={() => setActiveStoryBeat(null)}
        />
      ) : null}

      {showUpgradeCoach ? (
        <UpgradeCoach
          credits={stats.coins}
          onOpenLab={() => {
            setShowUpgradeCoach(false);
            setShowLabGlow(false);
            setGameState(GameState.SHOP);
          }}
          onContinue={() => setShowUpgradeCoach(false)}
        />
      ) : null}
    </div>
  );
};

export default App;
