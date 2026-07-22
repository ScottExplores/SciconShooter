import React, { useEffect, useRef } from 'react';
import {
  GameEngine,
  preloadGameplayAssets as preloadEngineGameplayAssets,
  type GameEngineDebugSnapshot,
  type GameEditorSnapshot,
  type GameRuntimeState,
  type WaveVictorySummary
} from '../services/gameLogic';
import type { GameCampaign } from '../game-config/types';
import { Stats, GamePolishSettings } from '../types';
import { getFlaskProgress } from '../services/flaskProgress';
import { audioService } from '../services/audioService';
import { PixiGameRenderer, preloadPixiGameplayTextures } from '../services/pixi/PixiGameRenderer';
import { resolveCampaignEnvironmentWindow } from '../services/pixi/PixiEnvironment';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import type { RuntimeSquadLoadout } from '../services/squadProgression';
import type { PlayerShipId } from '../services/playerShipService';

export const preloadGameplayAssets = async () => {
  await Promise.all([
    preloadEngineGameplayAssets(),
    preloadPixiGameplayTextures()
  ]);
};

const HUD_STATS_SYNC_INTERVAL_MS = 650;
const RUNTIME_STATE_SYNC_INTERVAL_MS = 200;
const SIMULATION_STEP_MS = 1000 / 60;
const MAX_SIMULATION_STEPS_PER_FRAME = 4;

const cloneStatsForReact = (stats: Stats): Stats => ({
  ...stats,
  upgrades: { ...stats.upgrades },
  powerupUses: { ...stats.powerupUses }
});

const getFlaskBucket = (stats: Stats) => {
  const max = stats.bombChargeMax || 1;
  const charge = Math.max(0, stats.bombCharge || 0);
  const progress = getFlaskProgress(charge, max);
  return (progress.storedFlasks * 12) + Math.floor((progress.nextFlaskPct / 100) * 12);
};

const getProgressBucket = (progress: number) => Math.floor(Math.max(0, Math.min(1, progress)) * 16);
const getShipAbilityBucket = (stats: Stats) => {
  const max = Math.max(1, stats.shipAbilityCooldownMax || 1);
  return Math.floor((1 - Math.min(1, Math.max(0, stats.shipAbilityCooldown || 0) / max)) * 16);
};

const upgradesEqual = (previous: Stats['upgrades'], next: Stats['upgrades']) => {
  const keys = Object.keys(next) as Array<keyof Stats['upgrades']>;
  return keys.every((key) => previous[key] === next[key]);
};

const shouldPublishHudStats = (previous: Stats | null, next: Stats, elapsedMs: number) => {
  if (!previous) return true;

  if (
    previous.lives !== next.lives
    || previous.wave !== next.wave
    || previous.bombs !== next.bombs
    || previous.isBossActive !== next.isBossActive
    || previous.bossMaxHp !== next.bossMaxHp
    || previous.highScore !== next.highScore
  ) {
    return true;
  }

  if (getFlaskBucket(previous) !== getFlaskBucket(next)) {
    const previousFlasks = getFlaskProgress(previous.bombCharge || 0, previous.bombChargeMax || 1).storedFlasks;
    const nextFlasks = getFlaskProgress(next.bombCharge || 0, next.bombChargeMax || 1).storedFlasks;
    return elapsedMs >= 220 || previousFlasks !== nextFlasks;
  }

  if (getShipAbilityBucket(previous) !== getShipAbilityBucket(next)) {
    return elapsedMs >= 180 || (previous.shipAbilityCooldown > 0 && next.shipAbilityCooldown <= 0);
  }

  if (previous.isBossActive && previous.bossHp !== next.bossHp) {
    return elapsedMs >= 180;
  }

  if (!next.isBossActive && getProgressBucket(previous.bossProgress) !== getProgressBucket(next.bossProgress)) {
    return elapsedMs >= 360;
  }

  if (
    previous.score !== next.score
    || previous.coins !== next.coins
    || previous.totalCoins !== next.totalCoins
    || previous.enemiesDefeated !== next.enemiesDefeated
  ) {
    return elapsedMs >= HUD_STATS_SYNC_INTERVAL_MS;
  }

  return false;
};

export interface GameCanvasProps {
  stats: Stats;
  onStatsChange: (stats: Stats) => void;
  running: boolean;
  onGameOver?: () => void;
  /** Fires after Pixi, the simulation, listeners, and the first rendered frame are ready. */
  onReady?: () => void;
  onInitializationError?: (error: unknown) => void;
  onContinueStarted?: () => void;
  onWaveVictory?: (summary: WaveVictorySummary) => void;
  isTransmissionOpen?: boolean;
  bombCommand?: { nonce: number } | null;
  shipAbilityCommand?: { nonce: number } | null;
  continueCommand?: { nonce: number; lives: number } | null;
  waveContinueCommand?: { nonce: number } | null;
  polishSettings: GamePolishSettings;
  playerShipUrl?: string;
  playerShipId?: PlayerShipId;
  squadLoadout?: RuntimeSquadLoadout;
  campaign?: GameCampaign;
  levelId?: string;
  waveId?: string;
  previewMode?: boolean;
  audioEnabled?: boolean;
  autoFire?: boolean;
  /** Preview-only simulation speed multiplier. The production game stays at 1x. */
  timeScale?: number;
  /** Allow preview tools to exercise real damage without changing production behavior. */
  previewInvincible?: boolean;
  /** Stable life count used when a preview runtime is reconstructed from an edited campaign. */
  previewStartingLives?: number;
  /** Fixed logical viewport used only by local preview tools. */
  previewViewport?: Readonly<{ width: number; height: number }>;
  restartToken?: number;
  testMode?: boolean;
  testWaveCommand?: { nonce: number; wave: number } | null;
  testBossCommand?: { nonce: number; wave: number } | null;
  testFlaskCommand?: { nonce: number; charge: number } | null;
  onRuntimeState?: (state: GameRuntimeState) => void;
  /** Low-frequency, read-only runtime telemetry for local development tools. */
  onDebugSnapshot?: (snapshot: GameEngineDebugSnapshot) => void;
  /** Preview-only entity positions for direct manipulation in the local editor. */
  onEditorSnapshot?: (snapshot: GameEditorSnapshot) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
  stats,
  onStatsChange,
  running,
  onGameOver,
  onReady,
  onInitializationError,
  onContinueStarted,
  onWaveVictory,
  isTransmissionOpen = false,
  bombCommand = null,
  shipAbilityCommand = null,
  continueCommand = null,
  waveContinueCommand = null,
  polishSettings,
  playerShipUrl,
  playerShipId = 'researchhub',
  squadLoadout,
  campaign,
  levelId,
  waveId,
  previewMode = false,
  audioEnabled = !previewMode,
  autoFire = false,
  timeScale = 1,
  previewInvincible = true,
  previewStartingLives,
  previewViewport,
  restartToken = 0,
  testMode = false,
  testWaveCommand = null,
  testBossCommand = null,
  testFlaskCommand = null,
  onRuntimeState,
  onDebugSnapshot,
  onEditorSnapshot
}) => {
  const previewViewportWidth = previewMode && previewViewport
    ? Math.max(1, Math.round(previewViewport.width))
    : undefined;
  const previewViewportHeight = previewMode && previewViewport
    ? Math.max(1, Math.round(previewViewport.height))
    : undefined;
  const hostRef = useRef<HTMLDivElement>(null);
  const pixiRendererRef = useRef<PixiGameRenderer | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const handledBombNonceRef = useRef<number | null>(null);
  const handledShipAbilityNonceRef = useRef<number | null>(null);
  const handledContinueNonceRef = useRef<number | null>(null);
  const handledWaveContinueNonceRef = useRef<number | null>(null);
  const handledRestartTokenRef = useRef(restartToken);
  const handledTestWaveNonceRef = useRef<number | null>(null);
  const handledTestBossNonceRef = useRef<number | null>(null);
  const handledTestFlaskNonceRef = useRef<number | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPublishedStatsRef = useRef<Stats | null>(null);
  const lastStatsPublishTimeRef = useRef<number>(0);
  const gameOverSentRef = useRef(false);
  const lastWaveVictoryIdRef = useRef<string | null>(null);
  const keysRef = useRef<Record<string, boolean>>(autoFire ? { ' ': true } : {});
  const runningRef = useRef(running);
  const testModeRef = useRef(testMode);
  const timeScaleRef = useRef(Math.max(0.25, Math.min(2, timeScale)));
  const previewInvincibleRef = useRef(previewInvincible);
  const isTransmissionOpenRef = useRef(isTransmissionOpen);
  const onStatsChangeRef = useRef(onStatsChange);
  const onGameOverRef = useRef(onGameOver);
  const onReadyRef = useRef(onReady);
  const onInitializationErrorRef = useRef(onInitializationError);
  const onContinueStartedRef = useRef(onContinueStarted);
  const onWaveVictoryRef = useRef(onWaveVictory);
  const onRuntimeStateRef = useRef(onRuntimeState);
  const onDebugSnapshotRef = useRef(onDebugSnapshot);
  const onEditorSnapshotRef = useRef(onEditorSnapshot);

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  useEffect(() => {
    onGameOverRef.current = onGameOver;
  }, [onGameOver]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onInitializationErrorRef.current = onInitializationError;
  }, [onInitializationError]);

  useEffect(() => {
    onContinueStartedRef.current = onContinueStarted;
  }, [onContinueStarted]);

  useEffect(() => {
    onWaveVictoryRef.current = onWaveVictory;
  }, [onWaveVictory]);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    onDebugSnapshotRef.current = onDebugSnapshot;
  }, [onDebugSnapshot]);

  useEffect(() => {
    timeScaleRef.current = Math.max(0.25, Math.min(2, timeScale));
  }, [timeScale]);

  useEffect(() => {
    previewInvincibleRef.current = previewInvincible;
    engineRef.current?.setPreviewInvincible(previewInvincible);
  }, [previewInvincible]);

  useEffect(() => {
    onEditorSnapshotRef.current = onEditorSnapshot;
  }, [onEditorSnapshot]);

  useEffect(() => {
    runningRef.current = running;
    if (!running) {
      activeTouchIdRef.current = null;
      activePointerIdRef.current = null;
      engineRef.current?.handleInput({}, null);
    } else {
      gameOverSentRef.current = false;
      if (autoFire) keysRef.current[' '] = true;
      engineRef.current?.handleInput(keysRef.current, null);
    }
    if (engineRef.current && onEditorSnapshotRef.current) {
      onEditorSnapshotRef.current(engineRef.current.getEditorSnapshot());
    }
  }, [autoFire, running]);

  useEffect(() => {
    isTransmissionOpenRef.current = isTransmissionOpen;
  }, [isTransmissionOpen]);

  useEffect(() => {
    testModeRef.current = testMode;
    engineRef.current?.setTestMode(testMode);
  }, [testMode]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.polishSettings = polishSettings;
    }
  }, [polishSettings]);

  useEffect(() => {
    if (!bombCommand || !engineRef.current) return;
    if (handledBombNonceRef.current === bombCommand.nonce) return;
    handledBombNonceRef.current = bombCommand.nonce;

    engineRef.current.stats = {
      ...engineRef.current.stats,
      ...stats
    };

    if (engineRef.current.triggerBomb()) {
      onStatsChangeRef.current(cloneStatsForReact(engineRef.current.stats));
    }
  }, [bombCommand, stats]);

  useEffect(() => {
    if (!shipAbilityCommand || !engineRef.current) return;
    if (handledShipAbilityNonceRef.current === shipAbilityCommand.nonce) return;
    handledShipAbilityNonceRef.current = shipAbilityCommand.nonce;

    engineRef.current.stats = {
      ...engineRef.current.stats,
      ...stats
    };

    if (engineRef.current.triggerShipAbility()) {
      onStatsChangeRef.current(cloneStatsForReact(engineRef.current.stats));
    }
  }, [shipAbilityCommand, stats]);

  useEffect(() => {
    if (!continueCommand || !engineRef.current) return;
    if (handledContinueNonceRef.current === continueCommand.nonce) return;
    handledContinueNonceRef.current = continueCommand.nonce;

    engineRef.current.stats = {
      ...engineRef.current.stats,
      ...stats
    };
    engineRef.current.continueRun(continueCommand.lives);
    onStatsChangeRef.current(cloneStatsForReact(engineRef.current.stats));
    onContinueStartedRef.current?.();
  }, [continueCommand, stats]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!waveContinueCommand || !engine) return;
    if (handledWaveContinueNonceRef.current === waveContinueCommand.nonce) return;
    handledWaveContinueNonceRef.current = waveContinueCommand.nonce;
    if (!engine.continueToNextWave()) return;

    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
  }, [waveContinueCommand]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!testWaveCommand || !engine) return;
    if (handledTestWaveNonceRef.current === testWaveCommand.nonce) return;
    handledTestWaveNonceRef.current = testWaveCommand.nonce;
    if (!engine.jumpToCampaignWave(testWaveCommand.wave)) return;

    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
  }, [testWaveCommand]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!testBossCommand || !engine) return;
    if (handledTestBossNonceRef.current === testBossCommand.nonce) return;
    handledTestBossNonceRef.current = testBossCommand.nonce;
    if (!engine.jumpToCampaignBoss(testBossCommand.wave)) return;

    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
  }, [testBossCommand]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!testFlaskCommand || !engine) return;
    if (handledTestFlaskNonceRef.current === testFlaskCommand.nonce) return;
    handledTestFlaskNonceRef.current = testFlaskCommand.nonce;
    engine.stats.bombCharge = Math.max(engine.stats.bombCharge || 0, testFlaskCommand.charge);
    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
  }, [testFlaskCommand]);

  // Sync Stats (specifically upgrades/coins modified by React UI) to Engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const engineStats = engine.stats;
    const uiChangedUpgrades = !upgradesEqual(engineStats.upgrades, stats.upgrades);
    const uiUsedRepair = stats.repairsCount > (engineStats.repairsCount || 0);

    if (uiChangedUpgrades) {
      engineStats.upgrades = { ...stats.upgrades };
    }

    if (uiChangedUpgrades || uiUsedRepair) {
      engineStats.bombCharge = Math.min(engineStats.bombCharge || 0, stats.bombCharge || 0);
      engineStats.repairsCount = stats.repairsCount;
    }

    // Sync lives only when the UI intentionally raises them, such as a Repair upgrade.
    if (stats.lives > engine.lives) {
      engine.lives = stats.lives;
      engineStats.lives = stats.lives;
    }
  }, [stats.bombCharge, stats.lives, stats.repairsCount, stats.upgrades]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!previewMode || !engine || !levelId || !waveId) return;
    if (!engine.loadPreviewWave(levelId, waveId)) return;

    if (autoFire) keysRef.current[' '] = true;
    engine.handleInput(runningRef.current ? keysRef.current : {}, null);
    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
  }, [autoFire, levelId, previewMode, waveId]);

  useEffect(() => {
    if (handledRestartTokenRef.current === restartToken) return;
    handledRestartTokenRef.current = restartToken;
    const engine = engineRef.current;
    if (!previewMode || !engine) return;

    engine.restartPreview();
    if (autoFire) keysRef.current[' '] = true;
    engine.handleInput(runningRef.current ? keysRef.current : {}, null);
    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
  }, [autoFire, previewMode, restartToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disposeRuntime = () => {};
    let pendingRenderer: PixiGameRenderer | null = null;

    const setupRuntime = async () => {
      const initialRect = host.getBoundingClientRect();
      const initialWidth = previewViewportWidth ?? Math.max(1, Math.round(initialRect.width || 720));
      const initialHeight = previewViewportHeight ?? Math.max(1, Math.round(initialRect.height || 720));
      const renderer = new PixiGameRenderer();
      pendingRenderer = renderer;
      const initialEnvironmentWindow = resolveCampaignEnvironmentWindow(
        campaign ?? DEFAULT_GAME_CAMPAIGN,
        levelId,
        waveId
      );
      await renderer.init(host, initialWidth, initialHeight, initialEnvironmentWindow);
      if (disposed) {
        renderer.destroy();
        return;
      }
      pixiRendererRef.current = renderer;
      const canvas = renderer.canvas;
      canvas.tabIndex = previewMode ? 0 : -1;
      canvas.setAttribute(
        'aria-label',
        previewMode ? 'Live Scicon Shooter Pixi wave preview' : 'Scicon Shooter Pixi gameplay'
      );

      const initialStats = cloneStatsForReact(stats);
      if (previewMode && previewStartingLives !== undefined) {
        initialStats.lives = previewStartingLives;
      }

      const engine = new GameEngine(initialStats, {
        campaign,
        previewMode,
        previewInvincible: previewInvincibleRef.current,
        audioEnabled,
        playerShipUrl,
        playerShipId,
        squadLoadout,
        initialLevelId: levelId,
        initialWaveId: waveId,
        testMode: testModeRef.current
      });
      engine.polishSettings = polishSettings;
      engineRef.current = engine;
      let targetFPS = 60;
      let frameInterval = 1000 / targetFPS;
      let mobileFrameBudget = false;
      let slowFrameScore = 0;
      let recoveryFrameScore = 0;
      let simulationAccumulator = 0;
      let lastRenderTime = 0;
      let lastRuntimeStatePublishTime = 0;
      let deathSequenceSafetyTimer: number | null = null;
      let readinessReported = false;

    const refreshFrameBudget = () => {
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const mobileViewport = engine.width < 560 || (coarsePointer && engine.height > engine.width);
      mobileFrameBudget = mobileViewport;
      targetFPS = mobileViewport ? 50 : 60;
      frameInterval = 1000 / targetFPS;
    };

    const updateAdaptivePerformanceMode = (deltaTime: number) => {
      const slowThreshold = frameInterval * (mobileFrameBudget ? 1.55 : 1.42);
      const recoveryThreshold = frameInterval * (mobileFrameBudget ? 1.18 : 1.12);
      const heavyScene = engine.heavySceneLoad;

      if (deltaTime > slowThreshold || heavyScene) {
        slowFrameScore = Math.min(40, slowFrameScore + 2);
        recoveryFrameScore = heavyScene ? Math.max(0, recoveryFrameScore - 2) : 0;
      } else if (deltaTime < recoveryThreshold) {
        recoveryFrameScore++;
        slowFrameScore = Math.max(0, slowFrameScore - 1);
      } else {
        slowFrameScore = Math.max(0, slowFrameScore - 0.5);
        recoveryFrameScore = 0;
      }

      if (!engine.performanceMode && slowFrameScore >= 18) {
        engine.setPerformanceMode(true);
        slowFrameScore = 0;
        recoveryFrameScore = 0;
      } else if (engine.performanceMode && recoveryFrameScore >= 150) {
        engine.setPerformanceMode(false);
        slowFrameScore = 0;
        recoveryFrameScore = 0;
      }
    };
    
    // Resize Handler
      const handleResize = () => {
        const rect = host.getBoundingClientRect();
        const width = previewViewportWidth ?? Math.max(1, Math.round(rect.width || 720));
        const height = previewViewportHeight ?? Math.max(1, Math.round(rect.height || 720));
        if (engine.width === width && engine.height === height) return;
        renderer.resize(width, height);
        refreshFrameBudget();
        engine.resize(width, height);
      };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(handleResize);
    resizeObserver?.observe(host);
    engine.init(initialWidth, initialHeight);
    if (autoFire) keysRef.current[' '] = true;
    engine.handleInput(runningRef.current ? keysRef.current : {}, null);
    lastPublishedStatsRef.current = null;
    lastWaveVictoryIdRef.current = null;
    lastStatsPublishTimeRef.current = 0;
    lastTimeRef.current = 0;
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onDebugSnapshotRef.current?.(engine.getDebugSnapshot());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());

    const publishHudStats = (force = false, timestamp = performance.now()) => {
      const elapsedMs = timestamp - lastStatsPublishTimeRef.current;
      const nextStats = engine.stats;

      if (!force && !shouldPublishHudStats(lastPublishedStatsRef.current, nextStats, elapsedMs)) {
        return;
      }

      const statsSnapshot = cloneStatsForReact(nextStats);
      lastPublishedStatsRef.current = statsSnapshot;
      lastStatsPublishTimeRef.current = timestamp;
      onStatsChangeRef.current(statsSnapshot);
    };

    const dispatchGameOver = (timestamp = performance.now()) => {
      if (previewMode || engine.lives > 0 || gameOverSentRef.current) return;

      if (deathSequenceSafetyTimer !== null) {
        window.clearTimeout(deathSequenceSafetyTimer);
        deathSequenceSafetyTimer = null;
      }
      gameOverSentRef.current = true;
      runningRef.current = false;
      publishHudStats(true, timestamp);
      onGameOverRef.current?.();
    };

    const armDeathSequenceSafetyTimer = () => {
      if (previewMode || engine.deathSequenceFrames <= 0 || deathSequenceSafetyTimer !== null) return;

      deathSequenceSafetyTimer = window.setTimeout(() => {
        deathSequenceSafetyTimer = null;
        if (engine.lives > 0 || engine.deathSequenceFrames <= 0 || gameOverSentRef.current) return;

        engine.finishDeathSequence();
        dispatchGameOver();
      }, engine.deathSequenceMaxDurationMs);
    };

    const keys = keysRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!runningRef.current) return;
      keys[e.key] = true;
      if (autoFire) keys[' '] = true;
      engine.handleInput(keys, engine.touchPos);
      if (!e.repeat && (e.key === 'b' || e.key === 'B') && engine.triggerBomb()) {
        publishHudStats(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key] = autoFire && e.key === ' ';
      if (autoFire) keys[' '] = true;
      engine.handleInput(keys, engine.touchPos);
    };
    
    const updateClientTarget = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.max(1, rect.width);
      const displayHeight = Math.max(1, rect.height);
      const x = Math.max(0, Math.min(engine.width, (clientX - rect.left) * (engine.width / displayWidth)));
      const y = Math.max(0, Math.min(engine.height, (clientY - rect.top) * (engine.height / displayHeight)));
      engine.handleInput(keys, { x, y });
    };

    const updateTouchTarget = (touch: Touch) => {
      updateClientTarget(touch.clientX, touch.clientY);
    };

    const findTrackedTouch = (touches: TouchList) => {
      if (activeTouchIdRef.current === null) return null;

      for (let index = 0; index < touches.length; index += 1) {
        if (touches[index].identifier === activeTouchIdRef.current) {
          return touches[index];
        }
      }

      return null;
    };

    const includesTrackedTouch = (touches: TouchList) => {
      if (activeTouchIdRef.current === null) return false;

      for (let index = 0; index < touches.length; index += 1) {
        if (touches[index].identifier === activeTouchIdRef.current) return true;
      }

      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!runningRef.current) return;
      // The first contact on the canvas owns steering until it ends. Additional
      // contacts remain available to the HUD in legacy touch-only WebViews.
      if (activeTouchIdRef.current !== null) return;
      const touch = e.changedTouches[0] || e.touches[0];
      if (!touch) return;

      if (e.cancelable) e.preventDefault();
      activeTouchIdRef.current = touch.identifier;
      updateTouchTarget(touch);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!runningRef.current) return;
      const touch = findTrackedTouch(e.touches);
      if (!touch) return;

      if (e.cancelable) e.preventDefault();
      updateTouchTarget(touch);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
      if (previewMode) canvas.focus();
      if (!runningRef.current) return;
      // Never let a second pointer steal the steering capture. This leaves that
      // pointer free to press bomb, ability, pause, and upgrade HUD controls.
      if (activePointerIdRef.current !== null) return;

      if (e.cancelable) e.preventDefault();
      activePointerIdRef.current = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Some embedded browsers reject capture while transitioning surfaces.
      }
      updateClientTarget(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!runningRef.current) return;
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) return;
      if (e.cancelable) e.preventDefault();

      updateClientTarget(e.clientX, e.clientY);
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) return;

      activePointerIdRef.current = null;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Capture may already be released by the browser.
      }
      engine.handleInput(runningRef.current ? keys : {}, null);
    };
    
    const handleTouchEnd: EventListener = (event) => {
      const e = event as TouchEvent;
      // Ending a HUD tap must not release the separate steering finger.
      if (!includesTrackedTouch(e.changedTouches)) return;
      activeTouchIdRef.current = null;
      engine.handleInput(runningRef.current ? keys : {}, null);
    };

    const handleTouchCancel: EventListener = (event) => {
      const e = event as TouchEvent;
      if (!includesTrackedTouch(e.changedTouches)) return;
      activeTouchIdRef.current = null;
      engine.handleInput(runningRef.current ? keys : {}, null);
    };

    const handleWindowBlur = () => {
      activeTouchIdRef.current = null;
      activePointerIdRef.current = null;
      Object.keys(keys).forEach((key) => {
        keys[key] = false;
      });
      if (autoFire) keys[' '] = true;
      engine.handleInput(runningRef.current ? keys : {}, null);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        lastTimeRef.current = performance.now();
        simulationAccumulator = 0;
      }
    };

    const keyboardTarget: Window | HTMLCanvasElement = previewMode ? canvas : window;
    const pointerTarget: Window | HTMLCanvasElement = previewMode ? canvas : window;
    const touchTarget: Window | HTMLCanvasElement = previewMode ? canvas : window;

    keyboardTarget.addEventListener('keydown', handleKeyDown as EventListener);
    keyboardTarget.addEventListener('keyup', handleKeyUp as EventListener);
    const supportsPointerEvents = typeof window.PointerEvent !== 'undefined';
    if (supportsPointerEvents) {
      canvas.addEventListener('pointerdown', handlePointerDown);
      pointerTarget.addEventListener('pointermove', handlePointerMove as EventListener, { passive: false });
      pointerTarget.addEventListener('pointerup', handlePointerEnd as EventListener);
      pointerTarget.addEventListener('pointercancel', handlePointerEnd as EventListener);
      canvas.addEventListener('lostpointercapture', handlePointerEnd);
    } else {
      // Touch Events are a fallback only. Registering both input models causes
      // preventDefault on the steering stream to cancel a second finger's HUD tap.
      canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      touchTarget.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
      touchTarget.addEventListener('touchend', handleTouchEnd);
      touchTarget.addEventListener('touchcancel', handleTouchCancel);
    }
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Loop
    const animate = (timestamp: number) => {
      if (document.hidden) {
        lastTimeRef.current = timestamp;
        simulationAccumulator = 0;
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
        lastRenderTime = timestamp - frameInterval;
      }

      const elapsed = Math.min(100, Math.max(0, timestamp - lastTimeRef.current));
      lastTimeRef.current = timestamp;

      if (runningRef.current && engine.gameActive) {
        simulationAccumulator += elapsed * timeScaleRef.current;
        let simulationSteps = 0;

        while (simulationAccumulator >= SIMULATION_STEP_MS && simulationSteps < MAX_SIMULATION_STEPS_PER_FRAME) {
          engine.update(isTransmissionOpenRef.current);
          simulationAccumulator -= SIMULATION_STEP_MS;
          simulationSteps++;
        }

        if (simulationSteps >= MAX_SIMULATION_STEPS_PER_FRAME && simulationAccumulator >= SIMULATION_STEP_MS) {
          simulationAccumulator = 0;
          engine.setPerformanceMode(true);
        }

        armDeathSequenceSafetyTimer();

      } else {
        simulationAccumulator = 0;
      }

      if (!previewMode && !engine.gameActive && engine.lives <= 0 && !gameOverSentRef.current) {
        dispatchGameOver(timestamp);
      }

      const waveVictory = previewMode ? null : engine.getWaveVictorySummary();
      if (waveVictory && lastWaveVictoryIdRef.current !== waveVictory.id) {
        lastWaveVictoryIdRef.current = waveVictory.id;
        publishHudStats(true, timestamp);
        onWaveVictoryRef.current?.(waveVictory);
      }

      const renderElapsed = timestamp - lastRenderTime;
      if (renderElapsed >= frameInterval) {
        lastRenderTime = timestamp - (renderElapsed % frameInterval);
        updateAdaptivePerformanceMode(renderElapsed);
        publishHudStats(false, timestamp);
        renderer.sync(engine, timestamp);
        if (!readinessReported) {
          readinessReported = true;
          onReadyRef.current?.();
        }
      }

      if (timestamp - lastRuntimeStatePublishTime >= RUNTIME_STATE_SYNC_INTERVAL_MS) {
        lastRuntimeStatePublishTime = timestamp;
        onRuntimeStateRef.current?.(engine.getRuntimeState());
        onDebugSnapshotRef.current?.(engine.getDebugSnapshot());
        onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    disposeRuntime = () => {
      // Cleanup: Stop loop and remove listeners
      if (engineRef.current) engineRef.current.gameActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (deathSequenceSafetyTimer !== null) window.clearTimeout(deathSequenceSafetyTimer);
      
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      keyboardTarget.removeEventListener('keydown', handleKeyDown as EventListener);
      keyboardTarget.removeEventListener('keyup', handleKeyUp as EventListener);
      if (supportsPointerEvents) {
        canvas.removeEventListener('pointerdown', handlePointerDown);
        pointerTarget.removeEventListener('pointermove', handlePointerMove as EventListener);
        pointerTarget.removeEventListener('pointerup', handlePointerEnd as EventListener);
        pointerTarget.removeEventListener('pointercancel', handlePointerEnd as EventListener);
        canvas.removeEventListener('lostpointercapture', handlePointerEnd);
      } else {
        canvas.removeEventListener('touchstart', handleTouchStart);
        touchTarget.removeEventListener('touchmove', handleTouchMove as EventListener);
        touchTarget.removeEventListener('touchend', handleTouchEnd);
        touchTarget.removeEventListener('touchcancel', handleTouchCancel);
      }
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (audioEnabled) audioService.stopMusic();
      if (engineRef.current === engine) engineRef.current = null;
      if (pixiRendererRef.current === renderer) pixiRendererRef.current = null;
      renderer.destroy();
      pendingRenderer = null;
      requestRef.current = null;
    };
    };

    void setupRuntime().catch((error) => {
      pendingRenderer?.destroy();
      pendingRenderer = null;
      console.error('Failed to initialize the Pixi gameplay renderer.', error);
      if (!disposed) onInitializationErrorRef.current?.(error);
    });

    return () => {
      disposed = true;
      disposeRuntime();
      pendingRenderer?.destroy();
      pendingRenderer = null;
    };
  }, [audioEnabled, campaign, playerShipId, playerShipUrl, previewMode, previewStartingLives, previewViewportHeight, previewViewportWidth, squadLoadout]);

  return (
    <div
      ref={hostRef}
      tabIndex={previewMode ? 0 : undefined}
      aria-label={previewMode ? 'Live Scicon Shooter wave preview' : 'Scicon Shooter game stage'}
      className="absolute left-0 top-0 z-0 block h-full w-full overflow-hidden"
      style={{ touchAction: 'none', outline: 'none', background: '#020617' }}
    />
  );
};

export default GameCanvas;
