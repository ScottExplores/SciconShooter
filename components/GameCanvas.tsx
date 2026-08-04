import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
import {
  PixiGameRenderer,
  preloadPixiGameplayTextures,
  type PreviewBossArtwork
} from '../services/pixi/PixiGameRenderer';
import { resolveCampaignEnvironmentWindow } from '../services/pixi/PixiEnvironment';
import { DEFAULT_GAME_CAMPAIGN } from '../services/levelConfig';
import type { RuntimeSquadLoadout } from '../services/squadProgression';
import type { PlayerShipId } from '../services/playerShipService';
import {
  clampPreviewTimeScale,
  type PreviewCommand,
  type PreviewCommandResult,
  type PreviewSnapshot
} from '../services/gameplay/previewSession';
import type { GameplayRandomSeed } from '../services/gameplay/random';
import {
  createBoundedGameplayTelemetrySink,
  type GameplayTelemetrySnapshot
} from '../services/gameplay/telemetry';
import { waitForGameplayAssetPreload } from '../services/gameplayAssetPreloadBudget';
import { createModularBossWeaponSocketPoseSampler } from '../services/pixi/boss-rigs/ModularBossWeaponSocketRuntime';
import { resolveCampaignBossArtwork } from '../services/pixi/boss-rigs/CampaignBossArtworkRegistry';
import type { BossModularProjectileVisualKind } from '../services/gameplay/bosses/BossProjectilePresentationRuntime';
import { ONBOARDING_GAMEPLAY_ACTION_EVENT } from '../services/onboardingProgress';

export const preloadGameplayAssets = async () => {
  const productionAssetWarmup = Promise.all([
    preloadEngineGameplayAssets(),
    preloadPixiGameplayTextures()
  ]);
  await waitForGameplayAssetPreload(productionAssetWarmup);
};

const HUD_STATS_SYNC_INTERVAL_MS = 650;
const RUNTIME_STATE_SYNC_INTERVAL_MS = 200;
const TELEMETRY_SYNC_INTERVAL_MS = 500;
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
  /** Fires at the logical Wave clear boundary, before an optional Mission takeoff cinematic. */
  onCampaignProgress?: (summary: WaveVictorySummary) => void;
  onWaveVictory?: (summary: WaveVictorySummary) => void;
  isTransmissionOpen?: boolean;
  /** Blocks direct keyboard bomb input while a modal or tutorial lesson owns it. */
  bombLocked?: boolean;
  bombCommand?: { nonce: number } | null;
  shipAbilityCommand?: { nonce: number } | null;
  continueCommand?: { nonce: number; lives: number } | null;
  waveContinueCommand?: {
    nonce: number;
    /** Explicit directed-graph destination for a completed Mission. */
    targetLevelId?: string;
    targetWaveId?: string;
  } | null;
  polishSettings: GamePolishSettings;
  playerShipUrl?: string;
  playerShipId?: PlayerShipId;
  squadLoadout?: RuntimeSquadLoadout;
  campaign?: GameCampaign;
  levelId?: string;
  waveId?: string;
  /** Campaign Missions refill at level boundaries; endless modes may opt out. */
  refillLivesAtMissionBoundary?: boolean;
  /** Generated endless depths stay inside one live engine and one continuous fight. */
  continuousStageBoundaries?: boolean;
  previewMode?: boolean;
  audioEnabled?: boolean;
  autoFire?: boolean;
  /** Preview-only simulation speed multiplier. The production game stays at 1x. */
  timeScale?: number;
  /** Allow preview tools to exercise real damage without changing production behavior. */
  previewInvincible?: boolean;
  /** Preview-only infinite bomb inventory. */
  previewUnlimitedBombs?: boolean;
  /** Preview-only immediate reuse of the selected ship ability. */
  previewShipAbilityNoCooldown?: boolean;
  /** Stable life count used when a preview runtime is reconstructed from an edited campaign. */
  previewStartingLives?: number;
  /** Fixed logical viewport used only by local preview tools. */
  previewViewport?: Readonly<{ width: number; height: number }>;
  /** Optional presentation-only boss art for one exact preview event. */
  previewBossArtwork?: PreviewBossArtwork;
  /** Stable deterministic seed for an authored production replay, such as a Boss Archive run. */
  randomSeed?: GameplayRandomSeed;
  /** Stable deterministic seed used only when explicitly supplied by preview/test tools. */
  previewSeed?: GameplayRandomSeed;
  /** Unified idempotent command channel for local preview tools. */
  previewCommand?: PreviewCommand | null;
  onPreviewPlayingChange?: (playing: boolean) => void;
  onPreviewCommandResult?: (result: PreviewCommandResult) => void;
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
  /** Bounded, low-frequency local simulation telemetry. Ignored outside preview mode. */
  onTelemetrySnapshot?: (snapshot: GameplayTelemetrySnapshot) => void;
  /** Compact preview state published on the existing low-frequency runtime cadence. */
  onPreviewSnapshot?: (snapshot: PreviewSnapshot) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
  stats,
  onStatsChange,
  running,
  onGameOver,
  onReady,
  onInitializationError,
  onContinueStarted,
  onCampaignProgress,
  onWaveVictory,
  isTransmissionOpen = false,
  bombLocked = false,
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
  refillLivesAtMissionBoundary = true,
  continuousStageBoundaries = false,
  previewMode = false,
  audioEnabled = !previewMode,
  autoFire = false,
  timeScale = 1,
  previewInvincible = true,
  previewUnlimitedBombs = false,
  previewShipAbilityNoCooldown = false,
  previewStartingLives,
  previewViewport,
  previewBossArtwork,
  randomSeed,
  previewSeed,
  previewCommand = null,
  onPreviewPlayingChange,
  onPreviewCommandResult,
  restartToken = 0,
  testMode = false,
  testWaveCommand = null,
  testBossCommand = null,
  testFlaskCommand = null,
  onRuntimeState,
  onDebugSnapshot,
  onEditorSnapshot,
  onTelemetrySnapshot,
  onPreviewSnapshot
}) => {
  const previewViewportWidth = previewMode && previewViewport
    ? Math.max(1, Math.round(previewViewport.width))
    : undefined;
  const previewViewportHeight = previewMode && previewViewport
    ? Math.max(1, Math.round(previewViewport.height))
    : undefined;
  const activeBossArtwork = useMemo(
    () => previewBossArtwork ?? resolveCampaignBossArtwork(
      campaign ?? DEFAULT_GAME_CAMPAIGN,
      levelId,
      waveId
    ),
    [campaign, levelId, previewBossArtwork, waveId]
  );
  const setupPlayerShipIdDependency = previewMode ? null : playerShipId;
  const setupPlayerShipUrlDependency = previewMode ? null : playerShipUrl;
  const setupSquadLoadoutDependency = previewMode ? null : squadLoadout;
  const setupCampaignDependency = continuousStageBoundaries
    ? campaign?.id ?? null
    : campaign;
  const setupBossArtworkDependency = continuousStageBoundaries
    ? previewBossArtwork ?? null
    : activeBossArtwork;
  const runtimeCampaignRef = useRef(campaign);
  const runtimeBossArtworkRef = useRef(activeBossArtwork);
  runtimeCampaignRef.current = campaign;
  runtimeBossArtworkRef.current = activeBossArtwork;
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
  const handledPreviewCommandNonceRef = useRef<number | null>(null);
  const previewCommandRef = useRef<PreviewCommand | null>(previewCommand);
  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPublishedStatsRef = useRef<Stats | null>(null);
  const lastStatsPublishTimeRef = useRef<number>(0);
  const gameOverSentRef = useRef(false);
  const lastCampaignCompletionIdRef = useRef<string | null>(null);
  const lastWaveVictoryIdRef = useRef<string | null>(null);
  const keysRef = useRef<Record<string, boolean>>(autoFire ? { ' ': true } : {});
  const runningRef = useRef(running);
  const testModeRef = useRef(testMode);
  const timeScaleRef = useRef(clampPreviewTimeScale(timeScale));
  const previewInvincibleRef = useRef(previewInvincible);
  const isTransmissionOpenRef = useRef(isTransmissionOpen);
  const bombLockedRef = useRef(bombLocked);
  const onStatsChangeRef = useRef(onStatsChange);
  const onGameOverRef = useRef(onGameOver);
  const onReadyRef = useRef(onReady);
  const onInitializationErrorRef = useRef(onInitializationError);
  const onContinueStartedRef = useRef(onContinueStarted);
  const onCampaignProgressRef = useRef(onCampaignProgress);
  const onWaveVictoryRef = useRef(onWaveVictory);
  const onRuntimeStateRef = useRef(onRuntimeState);
  const onDebugSnapshotRef = useRef(onDebugSnapshot);
  const onEditorSnapshotRef = useRef(onEditorSnapshot);
  const onTelemetrySnapshotRef = useRef(onTelemetrySnapshot);
  const onPreviewSnapshotRef = useRef(onPreviewSnapshot);
  const onPreviewPlayingChangeRef = useRef(onPreviewPlayingChange);
  const onPreviewCommandResultRef = useRef(onPreviewCommandResult);
  const runtimeLoadoutRef = useRef({
    playerShipId,
    playerShipUrl,
    squadLoadout
  });
  runtimeLoadoutRef.current = {
    playerShipId,
    playerShipUrl,
    squadLoadout
  };
  bombLockedRef.current = bombLocked;

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
    onCampaignProgressRef.current = onCampaignProgress;
  }, [onCampaignProgress]);

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
    timeScaleRef.current = clampPreviewTimeScale(timeScale);
  }, [timeScale]);

  useEffect(() => {
    previewInvincibleRef.current = previewInvincible;
    engineRef.current?.setPreviewInvincible(previewInvincible);
  }, [previewInvincible]);

  useEffect(() => {
    onEditorSnapshotRef.current = onEditorSnapshot;
  }, [onEditorSnapshot]);

  useEffect(() => {
    onTelemetrySnapshotRef.current = onTelemetrySnapshot;
  }, [onTelemetrySnapshot]);

  useEffect(() => {
    onPreviewSnapshotRef.current = onPreviewSnapshot;
  }, [onPreviewSnapshot]);

  useEffect(() => {
    onPreviewPlayingChangeRef.current = onPreviewPlayingChange;
  }, [onPreviewPlayingChange]);

  useEffect(() => {
    onPreviewCommandResultRef.current = onPreviewCommandResult;
  }, [onPreviewCommandResult]);

  const publishPreviewEngineState = useCallback((engine: GameEngine) => {
    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onDebugSnapshotRef.current?.(engine.getDebugSnapshot());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
    const previewSnapshot = engine.getPreviewSnapshot({
      playing: runningRef.current,
      timeScale: timeScaleRef.current,
      invincible: previewInvincibleRef.current
    });
    onPreviewSnapshotRef.current?.(previewSnapshot);
    return previewSnapshot;
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!previewMode || !engine) return;
    if (!engine.applyPreviewLoadout({
      playerShipId,
      playerShipUrl,
      squadLoadout
    })) return;
    publishPreviewEngineState(engine);
  }, [
    playerShipId,
    playerShipUrl,
    previewMode,
    publishPreviewEngineState,
    squadLoadout
  ]);

  const applyPreviewCommand = useCallback(async (
    engine: GameEngine,
    command: PreviewCommand
  ) => {
    if (handledPreviewCommandNonceRef.current === command.nonce) return;
    handledPreviewCommandNonceRef.current = command.nonce;
    let handled = true;
    let capture: PreviewCommandResult['capture'];

    switch (command.type) {
      case 'play':
        runningRef.current = true;
        gameOverSentRef.current = false;
        if (autoFire) keysRef.current[' '] = true;
        engine.handleInput(keysRef.current, null);
        onPreviewPlayingChangeRef.current?.(true);
        break;
      case 'pause':
        runningRef.current = false;
        engine.handleInput({}, null);
        onPreviewPlayingChangeRef.current?.(false);
        break;
      case 'restart':
        engine.restartPreview();
        engine.handleInput(runningRef.current ? keysRef.current : {}, null);
        break;
      case 'set-time-scale':
        timeScaleRef.current = clampPreviewTimeScale(command.timeScale);
        break;
      case 'set-invincibility':
        previewInvincibleRef.current = command.enabled;
        engine.setPreviewInvincible(command.enabled);
        break;
      case 'set-seed':
        engine.setGameplayRandomSeed(command.seed);
        engine.restartPreview();
        engine.handleInput(runningRef.current ? keysRef.current : {}, null);
        break;
      case 'step-frame':
        handled = !runningRef.current && engine.stepPreviewFrame();
        break;
      case 'set-boss-health':
        handled = engine.setPreviewBossHealthRatio(
          command.healthRatio,
          command.eventId
        );
        break;
      case 'set-boss-max-health':
        handled = engine.setPreviewBossMaxHealth(
          command.maxHealth,
          command.eventId
        );
        break;
      case 'set-boss-component-max-health':
        handled = engine.setPreviewBossComponentMaxHealth(
          command.componentId,
          command.maxHealth,
          command.eventId
        );
        break;
      case 'set-boss-hull-invincibility':
        handled = engine.setPreviewBossHullInvincibility(
          command.enabled,
          command.eventId
        );
        break;
      case 'set-boss-component-invincibility':
        handled = engine.setPreviewBossComponentInvincibility(
          command.componentId,
          command.enabled,
          command.eventId
        );
        break;
      case 'set-debug-overlays':
        handled = pixiRendererRef.current?.setPreviewDebugOverlays(command.overlays) ?? false;
        break;
      case 'set-boss-reference-comparison':
        handled = pixiRendererRef.current?.setPreviewBossReferenceComparison(
          command.comparison
        ) ?? false;
        break;
      case 'capture-frame': {
        const dataUrl = await pixiRendererRef.current?.capturePngDataUrl();
        handled = Boolean(dataUrl);
        capture = dataUrl
          ? { mimeType: 'image/png', dataUrl }
          : undefined;
        break;
      }
      case 'load-target':
        handled = engine.loadPreviewWave(command.levelId, command.waveId);
        break;
      case 'jump-to-stage':
        handled = engine.jumpToCampaignWave(Math.max(1, Math.floor(command.stage)));
        break;
      case 'jump-to-boss':
        handled = engine.jumpToCampaignBoss(Math.max(1, Math.floor(command.stage)));
        break;
      case 'spawn-event-now':
        handled = engine.spawnPreviewEventNow(command.eventId);
        break;
      case 'jump-to-boss-phase':
        handled = engine.jumpToAuthoredBossPhase(command.phaseId, command.eventId);
        break;
      case 'trigger-boss-attack':
        handled = engine.triggerAuthoredBossAttack(
          command.attackId,
          command.eventId,
          command.phaseId,
          command.loop ?? false
        );
        break;
      case 'set-mini-boss-signature-loop':
        handled = engine.setPreviewMiniBossSignatureLoop(command.eventId, command.enabled);
        break;
      case 'trigger-mini-boss-support':
        handled = engine.triggerPreviewMiniBossSupport(command.eventId);
        break;
      case 'set-mini-boss-low-health':
        handled = engine.setPreviewMiniBossLowHealth(command.eventId);
        break;
      case 'trigger-mini-boss-hit':
        handled = engine.triggerPreviewMiniBossHit(command.eventId);
        break;
      case 'trigger-mini-boss-death':
        handled = engine.triggerPreviewMiniBossDeath(command.eventId);
        break;
      case 'destroy-mini-boss-unit':
        handled = engine.destroyPreviewMiniBossUnit(command.eventId);
        break;
      case 'destroy-mini-boss-guardians':
        handled = engine.destroyPreviewMiniBossGuardians(command.eventId);
        break;
      case 'set-mini-boss-shield':
        handled = engine.setPreviewMiniBossShield(command.eventId, command.enabled);
        break;
      case 'set-mini-boss-wall-side':
        handled = engine.setPreviewMiniBossWallSide(command.eventId, command.side);
        break;
      case 'set-compact-health-bars':
        handled = engine.setPreviewCompactHealthBars(command.enabled);
        break;
      case 'seek-to-frame':
        handled = engine.seekPreviewToFrame(command.frame);
        break;
      case 'fast-forward':
        handled = engine.fastForwardPreviewFrames(command.frames);
        break;
    }

    const snapshot = handled ? publishPreviewEngineState(engine) : undefined;
    onPreviewCommandResultRef.current?.({
      nonce: command.nonce,
      type: command.type,
      handled,
      snapshot,
      capture
    });
  }, [autoFire, publishPreviewEngineState]);

  const applyPreviewCommandRef = useRef(applyPreviewCommand);
  applyPreviewCommandRef.current = applyPreviewCommand;

  useEffect(() => {
    previewCommandRef.current = previewCommand;
    if (!previewMode || !previewCommand || !engineRef.current) return;
    void applyPreviewCommand(engineRef.current, previewCommand);
  }, [applyPreviewCommand, previewCommand, previewMode]);

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
    if (
      continuousStageBoundaries
      && campaign
      && !engine.replaceCampaignRunway(campaign)
    ) return;
    const continued = waveContinueCommand.targetLevelId
      ? engine.continueToCampaignMission(
          waveContinueCommand.targetLevelId,
          waveContinueCommand.targetWaveId
        )
      : engine.continueToNextWave();
    if (!continued) return;
    handledWaveContinueNonceRef.current = waveContinueCommand.nonce;

    const statsSnapshot = cloneStatsForReact(engine.stats);
    lastPublishedStatsRef.current = statsSnapshot;
    onStatsChangeRef.current(statsSnapshot);
    onRuntimeStateRef.current?.(engine.getRuntimeState());
  }, [campaign, continuousStageBoundaries, waveContinueCommand]);

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
    onPreviewSnapshotRef.current?.(engine.getPreviewSnapshot({
      playing: runningRef.current,
      timeScale: timeScaleRef.current,
      invincible: previewInvincibleRef.current
    }));
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
    onPreviewSnapshotRef.current?.(engine.getPreviewSnapshot({
      playing: runningRef.current,
      timeScale: timeScaleRef.current,
      invincible: previewInvincibleRef.current
    }));
  }, [autoFire, previewMode, restartToken]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let disposeRuntime = () => {};
    let pendingRenderer: PixiGameRenderer | null = null;

    const setupRuntime = async () => {
      const setupCampaign = runtimeCampaignRef.current;
      const setupBossArtwork = runtimeBossArtworkRef.current;
      const initialRect = host.getBoundingClientRect();
      const initialWidth = previewViewportWidth ?? Math.max(1, Math.round(initialRect.width || 720));
      const initialHeight = previewViewportHeight ?? Math.max(1, Math.round(initialRect.height || 720));
      const renderer = new PixiGameRenderer({
        previewBossArtwork: setupBossArtwork,
        startupTextureUrls: [
          ...(runtimeLoadoutRef.current.playerShipUrl
            ? [runtimeLoadoutRef.current.playerShipUrl]
            : []),
          ...(
            runtimeLoadoutRef.current.squadLoadout?.companions
              .flatMap((companion) => companion.frames)
            ?? []
          )
        ]
      });
      pendingRenderer = renderer;
      const initialEnvironmentWindow = resolveCampaignEnvironmentWindow(
        setupCampaign ?? DEFAULT_GAME_CAMPAIGN,
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

      const telemetrySink = previewMode
        ? createBoundedGameplayTelemetrySink({ maxEvents: 1024 })
        : undefined;
      const initialLoadout = runtimeLoadoutRef.current;
      const previewBossReducedMotion = Boolean(setupBossArtwork)
        && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
      const previewBossWeaponSocketPoseSampler = (
        setupBossArtwork?.modularRig
        && setupBossArtwork.sampleModularPose
      )
        ? createModularBossWeaponSocketPoseSampler(
            setupBossArtwork.modularRig,
            setupBossArtwork.sampleModularPose
          )
        : undefined;
      const engine = new GameEngine(initialStats, {
        campaign: setupCampaign,
        previewMode,
        previewInvincible: previewInvincibleRef.current,
        previewUnlimitedBombs,
        previewShipAbilityNoCooldown,
        audioEnabled,
        playerShipUrl: initialLoadout.playerShipUrl,
        playerShipId: initialLoadout.playerShipId,
        squadLoadout: initialLoadout.squadLoadout,
        initialLevelId: levelId,
        initialWaveId: waveId,
        refillLivesAtMissionBoundary,
        continuousStageBoundaries,
        testMode: testModeRef.current,
        randomSeed: previewMode ? previewSeed : randomSeed,
        previewBossCollisionEventId: setupBossArtwork?.eventId,
        previewBossCollisionMask: setupBossArtwork?.collisionMask,
        previewBossArtworkDesignSize:
          setupBossArtwork?.modularRig?.manifest.designSize,
        previewBossWeaponSockets: setupBossArtwork?.weaponSockets,
        previewBossWeaponSocketPoseSampler,
        previewBossReducedMotion,
        previewBossWeaponSocketEventId: setupBossArtwork?.eventId,
        previewBossProjectileVisualKinds: setupBossArtwork?.projectileAnimations
          ? Object.keys(
              setupBossArtwork.projectileAnimations
            ) as BossModularProjectileVisualKind[]
          : undefined,
        telemetrySink
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
      let lastTelemetryPublishTime = 0;
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
    lastCampaignCompletionIdRef.current = null;
    lastWaveVictoryIdRef.current = null;
    lastStatsPublishTimeRef.current = 0;
    lastTimeRef.current = 0;
    onRuntimeStateRef.current?.(engine.getRuntimeState());
    onDebugSnapshotRef.current?.(engine.getDebugSnapshot());
    onEditorSnapshotRef.current?.(engine.getEditorSnapshot());
    if (previewMode) {
      onPreviewSnapshotRef.current?.(engine.getPreviewSnapshot({
        playing: runningRef.current,
        timeScale: timeScaleRef.current,
        invincible: previewInvincibleRef.current
      }));
    }
    if (previewMode && telemetrySink) {
      onTelemetrySnapshotRef.current?.(telemetrySink.getSnapshot());
    }
    if (previewMode && previewCommandRef.current) {
      void applyPreviewCommandRef.current(engine, previewCommandRef.current);
    }

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
      onRuntimeStateRef.current?.(engine.getRuntimeState());
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
      if (!bombLockedRef.current && !e.repeat && (e.key === 'b' || e.key === 'B') && engine.triggerBomb()) {
        window.dispatchEvent(new CustomEvent(ONBOARDING_GAMEPLAY_ACTION_EVENT, {
          detail: { target: 'flight-bomb' }
        }));
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

      const campaignCompletion = previewMode ? null : engine.getCampaignCompletionSummary();
      if (campaignCompletion && lastCampaignCompletionIdRef.current !== campaignCompletion.id) {
        lastCampaignCompletionIdRef.current = campaignCompletion.id;
        onCampaignProgressRef.current?.(campaignCompletion);
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
        if (previewMode) {
          onPreviewSnapshotRef.current?.(engine.getPreviewSnapshot({
            playing: runningRef.current,
            timeScale: timeScaleRef.current,
            invincible: previewInvincibleRef.current
          }));
        }
      }
      if (
        previewMode
        && telemetrySink
        && timestamp - lastTelemetryPublishTime >= TELEMETRY_SYNC_INTERVAL_MS
      ) {
        lastTelemetryPublishTime = timestamp;
        onTelemetrySnapshotRef.current?.(telemetrySink.getSnapshot());
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    disposeRuntime = () => {
      // Cleanup: Stop loop and remove listeners
      engine.stopTelemetrySession('disposed');
      if (previewMode && telemetrySink) {
        onTelemetrySnapshotRef.current?.(telemetrySink.getSnapshot());
      }
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
      if (engineRef.current === engine) engineRef.current = null;
      if (pixiRendererRef.current === renderer) pixiRendererRef.current = null;
      renderer.destroy();
      pendingRenderer = null;
      requestRef.current = null;
    };
    };

    void setupRuntime().catch((error) => {
      if (disposed) return;
      pendingRenderer?.destroy();
      pendingRenderer = null;
      console.error('Failed to initialize the Pixi gameplay renderer.', error);
      onInitializationErrorRef.current?.(error);
    });

    return () => {
      disposed = true;
      disposeRuntime();
      pendingRenderer?.destroy();
      pendingRenderer = null;
    };
  }, [audioEnabled, continuousStageBoundaries, previewMode, previewSeed, previewShipAbilityNoCooldown, previewStartingLives, previewUnlimitedBombs, previewViewportHeight, previewViewportWidth, randomSeed, refillLivesAtMissionBoundary, setupBossArtworkDependency, setupCampaignDependency, setupPlayerShipIdDependency, setupPlayerShipUrlDependency, setupSquadLoadoutDependency]);

  return (
    <div
      ref={hostRef}
      data-onboarding-target={previewMode ? undefined : 'flight-stage'}
      tabIndex={previewMode ? 0 : undefined}
      aria-label={previewMode ? 'Live Scicon Shooter wave preview' : 'Scicon Shooter mission'}
      className="absolute left-0 top-0 z-0 block h-full w-full overflow-hidden"
      style={{ touchAction: 'none', outline: 'none', background: '#020617' }}
    />
  );
};

export default GameCanvas;
