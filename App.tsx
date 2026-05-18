import React, { useEffect, useRef, useState } from 'react';
import { erc20Abi, parseUnits } from 'viem';
import type { Address } from 'viem';
import {
  useAccount,
  useChainId,
  useConfig,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  useWriteContract
} from 'wagmi';
import { waitForTransactionReceipt } from 'wagmi/actions';
import GameCanvas from './components/GameCanvas';
import StartScreen from './components/StartScreen';
import UIOverlay from './components/UIOverlay';
import UpgradeShop from './components/UpgradeShop';
import Tutorial from './components/Tutorial';
import SupportPanel from './components/SupportPanel';
import WalletButton from './components/WalletButton';
import StoryTransmission from './components/StoryTransmission';
import UpgradeCoach from './components/UpgradeCoach';
import { DonationStatus, GameState, LeaderboardEntry, MiniAppState, PowerupType, Stats, Upgrades, WalletSession } from './types';
import { audioService } from './services/audioService';
import { ASSETS, DONATION_CONFIG, STORAGE_KEYS, UPGRADE_BASE_COSTS } from './constants';
import { getScores, saveScore } from './services/leaderboardService';
import { miniAppService } from './services/miniAppService';
import { getStoryBeatForPhase, StoryBeat } from './services/storyBeats';

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
  [PowerupType.EXTRA_LIFE]: 0
};

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
  || (Object.values(PowerupType) as PowerupType[]).some((type) => stats.coins >= getPowerupCost(stats, type))
);

const readCreditedFundingTxs = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CREDITED_FUNDING_TXS) || '{}');
  } catch {
    return {};
  }
};

const markFundingTxCredited = (hash: string) => {
  const credited = readCreditedFundingTxs();
  credited[hash.toLowerCase()] = true;
  localStorage.setItem(STORAGE_KEYS.CREDITED_FUNDING_TXS, JSON.stringify(credited));
};

const getUserFacingMessage = (error: any, fallback: string) => {
  const message = error?.shortMessage || error?.message || fallback;

  if (/rejected|denied|cancelled|canceled|closed modal|request rejected/i.test(message)) {
    return fallback;
  }

  if (/insufficient/i.test(message)) {
    return 'Not enough RSC or gas for that action.';
  }

  return message;
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [gameId, setGameId] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerNameInput, setPlayerNameInput] = useState<string>('');
  const [showNameInput, setShowNameInput] = useState<boolean>(false);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [showLabGlow, setShowLabGlow] = useState<boolean>(true);
  const [miniApp, setMiniApp] = useState<MiniAppState>(defaultMiniAppState);
  const [walletError, setWalletError] = useState<string>('');
  const [donationStatus, setDonationStatus] = useState<DonationStatus>('idle');
  const [donationHash, setDonationHash] = useState<string>('');
  const [donationError, setDonationError] = useState<string>('');
  const [labFundingStatus, setLabFundingStatus] = useState<DonationStatus>('idle');
  const [labFundingHash, setLabFundingHash] = useState<string>('');
  const [labFundingError, setLabFundingError] = useState<string>('');
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
  const attemptedMiniAppConnect = useRef(false);
  const lastStoryWaveRef = useRef(0);

  const { address, connector, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const config = useConfig();
  const connectors = useConnectors();
  const { connectAsync, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const wallet: WalletSession = {
    address: address ?? null,
    chainId: isConnected ? chainId : null,
    status: isConnected ? 'connected' : (isConnecting || connectStatus === 'pending') ? 'connecting' : walletError ? 'error' : 'idle',
    error: walletError,
    connectorName: connector?.name,
    hasDonated: address ? Boolean(donatedWallets[address.toLowerCase()]) : false
  };

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
    const fetchScores = async () => {
      const alreadyHasData = leaderboard.length > 0;
      if (!alreadyHasData) {
        setLoadingLeaderboard(true);
      }

      try {
        const scores = await getScores();
        if (scores && scores.length > 0) {
          setLeaderboard(scores);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        if (!alreadyHasData) {
          setLoadingLeaderboard(false);
        }
      }
    };

    if (gameState === GameState.MENU || gameState === GameState.GAMEOVER) {
      fetchScores();
    }
  }, [gameState, leaderboard.length]);

  const getInitialStats = (): Stats => {
    const parsed = readSavedStats(address);

    return {
      score: 0,
      highScore: parsed.highScore || 0,
      wave: 1,
      coins: 0,
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
      totalCoins: stats.totalCoins,
      playerName: playerNameInput
    };
    localStorage.setItem(getWalletProfileKey(address), JSON.stringify(statsToSave));
    localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.highScore.toString());
  }, [address, playerNameInput, stats.highScore, stats.totalCoins]);

  useEffect(() => {
    if (!address) return;

    localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
    const savedStats = readSavedStats(address);
    setStats(prev => ({
      ...prev,
      highScore: Math.max(prev.highScore, savedStats.highScore || 0),
      totalCoins: Math.max(prev.totalCoins, savedStats.totalCoins || 0)
    }));

    if (savedStats.playerName && !playerNameInput) {
      setPlayerNameInput(savedStats.playerName);
    }
  }, [address]);

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

  useEffect(() => {
    if (!miniApp.isMiniApp || attemptedMiniAppConnect.current || isConnected) {
      return;
    }

    const farcasterConnector = connectors.find((connector) => connector.id === 'farcaster');
    if (!farcasterConnector) {
      return;
    }

    attemptedMiniAppConnect.current = true;
    connectAsync({
      connector: farcasterConnector,
      chainId: DONATION_CONFIG.BASE_CHAIN_ID
    }).catch((error) => {
      console.error("Mini app wallet connection failed", error);
      setWalletError('Open this from a compatible Base mini app host to use the embedded wallet.');
    });
  }, [miniApp.isMiniApp, isConnected, connectors, connectAsync]);

  const startGame = () => {
    audioService.init();
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
    setIsSubmittingScore(false);
    setGameId(prev => prev + 1);
    setGameState(GameState.TUTORIAL);
  };

  const handleTutorialComplete = () => {
    lastStoryWaveRef.current = 1;
    setActiveStoryBeat(getStoryBeatForPhase(1));
    setGameState(GameState.PLAYING);
  };

  const resetGame = () => {
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

  const connectWallet = async (connectorId?: string) => {
    if (isConnected) {
      setWalletError('');
      return;
    }

    const preferredConnector = connectorId
      ? connectors.find((connector) => connector.id === connectorId)
      : miniApp.isMiniApp
        ? connectors.find((connector) => connector.id === 'farcaster') ?? connectors.find((connector) => connector.id === 'baseAccount')
        : connectors.find((connector) => connector.id === 'injected')
          ?? connectors.find((connector) => connector.id === 'coinbaseWalletSDK')
          ?? connectors.find((connector) => connector.id === 'walletConnect')
          ?? connectors.find((connector) => connector.id === 'baseAccount');

    if (!preferredConnector) {
      setWalletError('No compatible Base wallet connector is available.');
      return;
    }

    try {
      setWalletError('');
      await connectAsync({
        connector: preferredConnector,
        chainId: DONATION_CONFIG.BASE_CHAIN_ID
      });
    } catch (error: any) {
      console.error("Wallet connection failed", error);
      setWalletError(getUserFacingMessage(error, 'Wallet connection was cancelled.'));
    }
  };

  const disconnectWallet = () => {
    localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    disconnect();
    setWalletError('');
    setDonationStatus('idle');
    setDonationHash('');
    setDonationError('');
    setLabFundingStatus('idle');
    setLabFundingHash('');
    setLabFundingError('');
  };

  const ensureBaseConnection = async () => {
    if (!isConnected || !address) {
      await connectWallet();
      return false;
    }

    if (chainId !== DONATION_CONFIG.BASE_CHAIN_ID) {
      await switchChainAsync({ chainId: DONATION_CONFIG.BASE_CHAIN_ID });
    }

    return true;
  };

  const donateRsc = async (amount: number) => {
    setDonationError('');

    try {
      const isReady = await ensureBaseConnection();
      if (!isReady) {
        return;
      }

      setDonationStatus(chainId === DONATION_CONFIG.BASE_CHAIN_ID ? 'processing' : 'switching_network');
      setDonationHash('');

      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address,
        functionName: 'transfer',
        args: [
          DONATION_CONFIG.RECIPIENT_ADDRESS as Address,
          parseUnits(amount.toString(), 18)
        ]
      });

      setDonationHash(hash);
      setDonationStatus('confirming');

      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== 'success') {
        throw new Error('Donation transaction reverted.');
      }

      setDonationStatus('success');
      if (address) {
        const walletKey = address.toLowerCase();
        setDonatedWallets(prev => {
          const next = { ...prev, [walletKey]: true };
          localStorage.setItem(STORAGE_KEYS.DONATED_WALLETS, JSON.stringify(next));
          return next;
        });
      }
      setTimeout(() => {
        setDonationStatus('idle');
        setDonationHash('');
      }, 5000);
    } catch (error: any) {
      console.error("Donation error", error);
      setDonationStatus('error');
      setDonationError(getUserFacingMessage(error, 'Donation cancelled.'));
    }
  };

  const fundCurrentMission = async (rscAmount: number) => {
    setLabFundingError('');

    try {
      const isReady = await ensureBaseConnection();
      if (!isReady) {
        return;
      }

      setLabFundingStatus(chainId === DONATION_CONFIG.BASE_CHAIN_ID ? 'processing' : 'switching_network');
      setLabFundingHash('');

      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: DONATION_CONFIG.RSC_CONTRACT_ADDRESS as Address,
        functionName: 'transfer',
        args: [
          DONATION_CONFIG.RECIPIENT_ADDRESS as Address,
          parseUnits(rscAmount.toString(), 18)
        ]
      });

      setLabFundingHash(hash);
      setLabFundingStatus('confirming');

      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== 'success') {
        throw new Error('Funding transaction reverted.');
      }

      const txKey = hash.toLowerCase();
      const alreadyCredited = Boolean(readCreditedFundingTxs()[txKey]);
      if (!alreadyCredited) {
        const credits = rscAmount * DONATION_CONFIG.MISSION_CREDITS_PER_RSC;
        setStats(prev => ({
          ...prev,
          coins: prev.coins + credits
        }));
        markFundingTxCredited(hash);
        audioService.playSound('coin');
      }

      setLabFundingStatus('success');
      if (address) {
        const walletKey = address.toLowerCase();
        setDonatedWallets(prev => {
          const next = { ...prev, [walletKey]: true };
          localStorage.setItem(STORAGE_KEYS.DONATED_WALLETS, JSON.stringify(next));
          return next;
        });
      }

      setTimeout(() => {
        setLabFundingStatus('idle');
        setLabFundingHash('');
      }, 5000);
    } catch (error: any) {
      console.error("Lab funding error", error);
      setLabFundingStatus('error');
      setLabFundingError(getUserFacingMessage(error, 'Funding cancelled.'));
    }
  };

  const fundCurrentMissionWithUsdc = async (usdcAmount: number) => {
    setLabFundingError('');
    setLabFundingHash('');

    try {
      setLabFundingStatus('processing');
      const { pay } = await import('@base-org/account/payment');
      const payment = await pay({
        amount: usdcAmount.toFixed(2),
        to: DONATION_CONFIG.RECIPIENT_ADDRESS,
        testnet: false,
        telemetry: false
      });

      const paymentKey = `basepay:${payment.id}`.toLowerCase();
      const alreadyCredited = Boolean(readCreditedFundingTxs()[paymentKey]);

      if (!alreadyCredited) {
        const credits = usdcAmount * DONATION_CONFIG.MISSION_CREDITS_PER_USDC;
        setStats(prev => ({
          ...prev,
          coins: prev.coins + credits
        }));
        markFundingTxCredited(paymentKey);
        audioService.playSound('coin');
      }

      setLabFundingStatus('success');
      setTimeout(() => {
        setLabFundingStatus('idle');
      }, 5000);
    } catch (error: any) {
      console.error("Base Pay funding error", error);
      setLabFundingStatus('error');
      setLabFundingError(getUserFacingMessage(error, 'Base Pay cancelled.'));
    }
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
      if (stats.score > stats.highScore) {
        localStorage.setItem(STORAGE_KEYS.HIGH_SCORE, stats.score.toString());
        setStats(s => ({ ...s, highScore: s.score }));
      }

      const sorted = [...leaderboard].sort((a, b) => b.score - a.score);
      const lowestScore = sorted.length < 25 ? 0 : sorted[Math.min(sorted.length - 1, 24)].score;

      if (stats.score > 0 && (sorted.length < 25 || stats.score >= lowestScore)) {
        if (!playerNameInput && address) {
          setPlayerNameInput(`0X${address.slice(2, 6)}`.toUpperCase());
        }
        setShowNameInput(true);
      }
    }
  }, [address, gameState, playerNameInput, stats.score, stats.highScore, leaderboard]);

  const submitScore = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!playerNameInput.trim() || isSubmittingScore) return;

    setIsSubmittingScore(true);

    const name = playerNameInput.trim().substring(0, 15).toUpperCase();
    const score = stats.score;
    const wave = stats.wave;

    const newEntry: LeaderboardEntry = {
      name,
      score,
      wave,
      walletAddress: address || undefined,
      donated: wallet.hasDonated
    };
    const optimisticList = [...leaderboard, newEntry].sort((a, b) => b.score - a.score).slice(0, 25);
    setLeaderboard(optimisticList);

    try {
      const updatedScores = await saveScore(name, score, wave, {
        walletAddress: address,
        donated: wallet.hasDonated
      });
      if (updatedScores.length > 0) {
        setLeaderboard(updatedScores);
      }
    } catch (error) {
      console.error("Score submission error", error);
    }

    setIsSubmittingScore(false);
    setShowNameInput(false);
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

  const openRscSwap = async () => {
    await miniAppService.openUrl(DONATION_CONFIG.RSC_SWAP_URL);
  };

  const pubStatus = getPubStatus(stats.score);

  return (
    <div className="relative h-full w-full select-none bg-[#0b1020]">
      {gameState === GameState.MENU && !activeStoryBeat ? (
        <WalletButton
          wallet={wallet}
          connectors={connectors}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
          onDonate={donateRsc}
          onOpenSwap={openRscSwap}
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
          onAbout={() => setGameState(GameState.ABOUT)}
          leaderboard={leaderboard}
          isLoading={loadingLeaderboard}
          onOpenReferral={openReferral}
          onOpenFund={openResearchHubFund}
          onOpenProposal={openResearchHubProposal}
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
          connectors={connectors}
          onUpgrade={handleUpgrade}
          onDeposit={handleDeposit}
          onBuyPowerup={handleBuyPowerup}
          onClose={() => setGameState(GameState.PLAYING)}
          onConnectWallet={connectWallet}
          onBuyMissionCredits={fundCurrentMission}
          onBuyMissionCreditsUsdc={fundCurrentMissionWithUsdc}
          onOpenRscSwap={openRscSwap}
          labFundingStatus={labFundingStatus}
          labFundingHash={labFundingHash}
          labFundingError={labFundingError}
          gameId={gameId}
        />
      )}

      {gameState === GameState.GAMEOVER && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="relative flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden border border-red-300/20 bg-slate-950/88 shadow-[0_24px_90px_rgba(0,0,0,0.58)] backdrop-blur-xl animate-bounce-in [clip-path:polygon(18px_0,100%_0,100%_92%,96%_100%,0_100%,0_18px)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/70 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent"></div>

            <div className="relative z-10 space-y-4 overflow-y-auto p-6 text-center custom-scrollbar">
              {showNameInput ? (
                <div className="space-y-4">
                  <h2 className="arcade-font animate-pulse text-2xl font-black tracking-widest text-yellow-400">NEW HIGH SCORE!</h2>
                  <div className="text-4xl font-bold text-white">{stats.score}</div>
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
                    <button
                      type="submit"
                      disabled={!playerNameInput || isSubmittingScore}
                      className={`scicon-btn w-full py-3 text-lg font-bold ${isSubmittingScore ? 'cursor-wait opacity-70' : ''}`}
                    >
                      {isSubmittingScore ? 'TRANSMITTING...' : 'SUBMIT RECORD'}
                    </button>
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
                    donationStatus={donationStatus}
                    donationHash={donationHash}
                    donationError={donationError}
                    onConnect={connectWallet}
                    onDisconnect={disconnectWallet}
                    onDonate={donateRsc}
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
                    The monthly leaderboard can be used as a community signal: top pilots nominate a ResearchHub proposal, and Scott can direct funding credits toward the winner's pick.
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
