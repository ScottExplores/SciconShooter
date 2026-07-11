import React, { useEffect, useRef } from 'react';
import type { GameCampaign } from '../game-config/types';
import { GameEngine, type GameRuntimeState } from '../services/gameLogic';
import { PowerupType, type Stats } from '../types';

const SIMULATION_STEP_MS = 1000 / 60;
const MAX_SIMULATION_STEPS_PER_FRAME = 4;
const RUNTIME_STATE_INTERVAL_MS = 200;

const createPreviewStats = (): Stats => ({
  score: 0,
  highScore: 0,
  wave: 1,
  coins: 0,
  totalCoins: 0,
  enemiesDefeated: 0,
  bombs: 2,
  bombCharge: 0,
  bombChargeMax: 100,
  lives: 3,
  repairsCount: 0,
  upgrades: { fireRate: 2, speed: 1, missile: 0 },
  powerupUses: {
    [PowerupType.DOUBLE_SHOT]: 0,
    [PowerupType.TRIPLE_SHOT]: 0,
    [PowerupType.MAGNET]: 0,
    [PowerupType.SHIELD]: 0,
    [PowerupType.EXTRA_LIFE]: 0,
    [PowerupType.RESEARCH_BEAM]: 0
  },
  bossProgress: 0,
  isBossActive: false,
  bossHp: 0,
  bossMaxHp: 100
});

export interface GameEditorCanvasProps {
  campaign: GameCampaign;
  levelId: string;
  waveId: string;
  playing: boolean;
  restartToken: number;
  onRuntimeState?: (state: GameRuntimeState) => void;
}

export const GameEditorCanvas: React.FC<GameEditorCanvasProps> = ({
  campaign,
  levelId,
  waveId,
  playing,
  restartToken,
  onRuntimeState
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const playingRef = useRef(playing);
  const callbackRef = useRef(onRuntimeState);
  const keysRef = useRef<Record<string, boolean>>({ ' ': true });
  const lastRestartTokenRef = useRef(restartToken);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    callbackRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const engine = new GameEngine(createPreviewStats(), {
      campaign,
      previewMode: true,
      audioEnabled: false,
      initialLevelId: levelId,
      initialWaveId: waveId
    });
    engineRef.current = engine;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width || 720));
      const height = Math.max(1, Math.round(bounds.height || 720));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = false;
      if (engine.width === 0 || engine.height === 0) engine.init(width, height);
      else engine.resize(width, height);
    };

    resize();
    if (engine.width === 0 || engine.height === 0) engine.init(canvas.width || 720, canvas.height || 720);
    engine.loadPreviewWave(levelId, waveId);
    engine.handleInput(keysRef.current, null);
    callbackRef.current?.(engine.getRuntimeState());

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);

    let frameId = 0;
    let previousTime = 0;
    let accumulator = 0;
    let lastRuntimePublish = 0;
    const frame = (timestamp: number) => {
      if (!previousTime) previousTime = timestamp;
      const elapsed = Math.min(100, Math.max(0, timestamp - previousTime));
      previousTime = timestamp;

      if (playingRef.current && engine.gameActive) {
        accumulator += elapsed;
        let simulationSteps = 0;
        while (accumulator >= SIMULATION_STEP_MS && simulationSteps < MAX_SIMULATION_STEPS_PER_FRAME) {
          engine.update(false);
          accumulator -= SIMULATION_STEP_MS;
          simulationSteps++;
        }
        if (simulationSteps >= MAX_SIMULATION_STEPS_PER_FRAME) accumulator = 0;
      } else {
        accumulator = 0;
      }

      engine.draw(context);
      if (timestamp - lastRuntimePublish >= RUNTIME_STATE_INTERVAL_MS) {
        lastRuntimePublish = timestamp;
        callbackRef.current?.(engine.getRuntimeState());
      }
      frameId = window.requestAnimationFrame(frame);
    };
    frameId = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      engine.gameActive = false;
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [campaign, levelId, waveId]);

  useEffect(() => {
    if (lastRestartTokenRef.current === restartToken) return;
    lastRestartTokenRef.current = restartToken;
    const engine = engineRef.current;
    if (!engine) return;
    engine.restartPreview();
    engine.handleInput(keysRef.current, null);
    callbackRef.current?.(engine.getRuntimeState());
  }, [restartToken]);

  const updatePointerTarget = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    engine.handleInput(keysRef.current, {
      x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
      y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top))
    });
  };

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="Live Scicon Shooter wave preview"
      onKeyDown={(event) => {
        keysRef.current[event.key] = true;
        engineRef.current?.handleInput(keysRef.current, null);
      }}
      onKeyUp={(event) => {
        keysRef.current[event.key] = false;
        engineRef.current?.handleInput(keysRef.current, null);
      }}
      onPointerDown={(event) => {
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePointerTarget(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons > 0) updatePointerTarget(event);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        engineRef.current?.handleInput(keysRef.current, null);
      }}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        background: '#0b1020',
        imageRendering: 'pixelated',
        outline: 'none',
        touchAction: 'none'
      }}
    />
  );
};

export default GameEditorCanvas;
