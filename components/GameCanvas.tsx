import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../services/gameLogic';
import { Stats, GameState, GamePolishSettings } from '../types';

const HUD_STATS_SYNC_INTERVAL_MS = 650;

const cloneStatsForReact = (stats: Stats): Stats => ({
  ...stats,
  upgrades: { ...stats.upgrades },
  powerupUses: { ...stats.powerupUses }
});

const getFlaskBucket = (stats: Stats) => {
  const max = stats.bombChargeMax || 1;
  return Math.floor((Math.max(0, stats.bombCharge || 0) / max) * 12);
};

const getProgressBucket = (progress: number) => Math.floor(Math.max(0, Math.min(1, progress)) * 16);

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
    return elapsedMs >= 220 || next.bombCharge >= next.bombChargeMax;
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

interface GameCanvasProps {
  setStats: (stats: Stats) => void;
  setGameState: (state: GameState) => void;
  stats: Stats;
  gameState: GameState;
  isTransmissionOpen?: boolean;
  bombCommand?: { nonce: number } | null;
  continueCommand?: { nonce: number; lives: number } | null;
  polishSettings: GamePolishSettings;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ setStats, setGameState, stats, gameState, isTransmissionOpen = false, bombCommand = null, continueCommand = null, polishSettings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const handledBombNonceRef = useRef<number | null>(null);
  const handledContinueNonceRef = useRef<number | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastPublishedStatsRef = useRef<Stats | null>(null);
  const lastStatsPublishTimeRef = useRef<number>(0);
  const gameOverSentRef = useRef(false);
  
  // Use a ref to track gameState inside the animation loop closure
  const gameStateRef = useRef(gameState);
  const isTransmissionOpenRef = useRef(isTransmissionOpen);

  // Sync the ref whenever the prop changes
  useEffect(() => {
    gameStateRef.current = gameState;
    if (gameState !== GameState.PLAYING) {
      activeTouchIdRef.current = null;
      activePointerIdRef.current = null;
      engineRef.current?.handleInput({}, null);
    } else {
      gameOverSentRef.current = false;
    }
  }, [gameState]);

  useEffect(() => {
    isTransmissionOpenRef.current = isTransmissionOpen;
  }, [isTransmissionOpen]);

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
      setStats({ ...engineRef.current.stats });
    }
  }, [bombCommand, setStats, stats]);

  useEffect(() => {
    if (!continueCommand || !engineRef.current) return;
    if (handledContinueNonceRef.current === continueCommand.nonce) return;
    handledContinueNonceRef.current = continueCommand.nonce;

    engineRef.current.stats = {
      ...engineRef.current.stats,
      ...stats
    };
    engineRef.current.continueRun(continueCommand.lives);
    setStats({ ...engineRef.current.stats });
    setGameState(GameState.PLAYING);
  }, [continueCommand, setGameState, setStats, stats]);

  // Sync Stats (specifically upgrades/coins modified by React UI) to Engine
  useEffect(() => {
    if (engineRef.current) {
        engineRef.current.stats = stats;
        
        // Fix: Explicitly sync lives if the UI has a higher value (e.g., bought Repair)
        if (stats.lives > engineRef.current.lives) {
            engineRef.current.lives = stats.lives;
        }
        
        // Also sync upgrades immediately
        if (engineRef.current.stats.upgrades !== stats.upgrades) {
            engineRef.current.stats.upgrades = stats.upgrades;
        }
    }
  }, [stats]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize Engine
    const engine = new GameEngine(stats);
    engine.polishSettings = polishSettings;
    engineRef.current = engine;
    let targetFPS = 60;
    let frameInterval = 1000 / targetFPS;

    const refreshFrameBudget = () => {
      const rect = canvas.getBoundingClientRect();
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const mobileViewport = rect.width < 560 || (coarsePointer && rect.height > rect.width);
      targetFPS = mobileViewport ? 50 : 60;
      frameInterval = 1000 / targetFPS;
    };
    
    // Resize Handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      ctx.imageSmoothingEnabled = false;
      refreshFrameBudget();
      engine.resize(canvas.width, canvas.height);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    engine.init(canvas.width, canvas.height);
    lastPublishedStatsRef.current = null;
    lastStatsPublishTimeRef.current = 0;

    const publishHudStats = (force = false, timestamp = performance.now()) => {
      const elapsedMs = timestamp - lastStatsPublishTimeRef.current;
      const nextStats = engine.stats;

      if (!force && !shouldPublishHudStats(lastPublishedStatsRef.current, nextStats, elapsedMs)) {
        return;
      }

      const statsSnapshot = cloneStatsForReact(nextStats);
      lastPublishedStatsRef.current = statsSnapshot;
      lastStatsPublishTimeRef.current = timestamp;
      setStats(statsSnapshot);
    };

    // Input Handlers
    const keys: Record<string, boolean> = {};
    engine.handleInput(keys, null);

    const handleKeyDown = (e: KeyboardEvent) => { 
      keys[e.key] = true; 
      if (!e.repeat && (e.key === 'b' || e.key === 'B') && engine.triggerBomb()) {
        publishHudStats(true);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => { 
      keys[e.key] = false; 
    };
    
    const updateClientTarget = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
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

      const fallbackTouch = touches[0] || null;
      if (fallbackTouch) {
        activeTouchIdRef.current = fallbackTouch.identifier;
      }

      return fallbackTouch;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.changedTouches[0] || e.touches[0];
      if (!touch) return;

      activeTouchIdRef.current = touch.identifier;
      updateTouchTarget(touch);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = findTrackedTouch(e.touches);
      if (!touch) return;

      if (e.cancelable) e.preventDefault();
      updateTouchTarget(touch);
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
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
      if (activePointerIdRef.current === null || e.pointerId !== activePointerIdRef.current) return;
      if (e.cancelable) e.preventDefault();

      updateClientTarget(e.clientX, e.clientY);
    };

    const handlePointerEnd = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) return;

      activePointerIdRef.current = null;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Capture may already be released by the browser.
      }
      engine.handleInput(keys, null);
    };
    
    const handleTouchEnd = () => {
      activeTouchIdRef.current = null;
      engine.handleInput(keys, null);
    };

    const handleTouchCancel = () => {
      activeTouchIdRef.current = null;
      engine.handleInput(keys, null);
    };

    const handleWindowBlur = () => {
      activeTouchIdRef.current = null;
      activePointerIdRef.current = null;
      engine.handleInput(keys, null);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        lastTimeRef.current = performance.now();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    canvas.addEventListener('lostpointercapture', handlePointerEnd);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchCancel);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Loop
    const animate = (timestamp: number) => {
      if (document.hidden) {
        lastTimeRef.current = timestamp;
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp - frameInterval;
      }
      
      const deltaTime = timestamp - lastTimeRef.current;

      // Only update and draw if enough time has passed. This keeps high-refresh
      // mobile browsers from redrawing the full canvas more often than gameplay advances.
      if (deltaTime >= frameInterval) {
          lastTimeRef.current = timestamp - (deltaTime % frameInterval);

          // Use the REF current value to check state, avoiding stale closure issues
          if (gameStateRef.current === GameState.PLAYING) {
            engine.update(isTransmissionOpenRef.current);

            // Keep the React HUD in sync at a mobile-friendly cadence while
            // allowing canvas gameplay to continue at the frame budget.
            publishHudStats(false, timestamp);

            if (!engine.gameActive && engine.lives <= 0 && !gameOverSentRef.current) {
              gameOverSentRef.current = true;
              gameStateRef.current = GameState.GAMEOVER;
              publishHudStats(true, timestamp);
              setGameState(GameState.GAMEOVER);
            }
          }

          engine.draw(ctx);
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      // Cleanup: Stop loop and remove listeners
      if (engineRef.current) engineRef.current.gameActive = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      canvas.removeEventListener('lostpointercapture', handlePointerEnd);
      canvas.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute left-0 top-0 z-0 block h-full w-full"
      style={{ touchAction: 'none' }}
    />
  );
};

export default GameCanvas;
