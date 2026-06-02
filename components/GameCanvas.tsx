import React, { useEffect, useRef } from 'react';
import { GameEngine } from '../services/gameLogic';
import { Stats, GameState, PowerupType } from '../types';

interface GameCanvasProps {
  setStats: (stats: Stats) => void;
  setGameState: (state: GameState) => void;
  stats: Stats;
  gameState: GameState;
  isTransmissionOpen?: boolean;
  purchasedPowerup?: { type: PowerupType; nonce: number } | null;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ setStats, setGameState, stats, gameState, isTransmissionOpen = false, purchasedPowerup = null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const handledPowerupNonceRef = useRef<number | null>(null);
  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  
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
    }
  }, [gameState]);

  useEffect(() => {
    isTransmissionOpenRef.current = isTransmissionOpen;
  }, [isTransmissionOpen]);

  useEffect(() => {
    if (!purchasedPowerup || !engineRef.current) return;
    if (handledPowerupNonceRef.current === purchasedPowerup.nonce) return;
    handledPowerupNonceRef.current = purchasedPowerup.nonce;

    engineRef.current.stats = {
      ...engineRef.current.stats,
      ...stats
    };
    if (stats.lives > engineRef.current.lives) {
      engineRef.current.lives = stats.lives;
    }

    engineRef.current.activatePowerup(purchasedPowerup.type, false);
    setStats({ ...engineRef.current.stats });
  }, [purchasedPowerup, setStats, stats]);

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
    engineRef.current = engine;
    
    // Resize Handler
    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      engine.resize(canvas.width, canvas.height);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    engine.init(canvas.width, canvas.height);

    // Input Handlers
    const keys: Record<string, boolean> = {};
    engine.handleInput(keys, null);

    const handleKeyDown = (e: KeyboardEvent) => { 
      keys[e.key] = true; 
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
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
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

    // FPS Control
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    // Loop
    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      
      const deltaTime = timestamp - lastTimeRef.current;

      // Only update if enough time has passed (cap at 60 FPS)
      if (deltaTime >= frameInterval) {
          lastTimeRef.current = timestamp - (deltaTime % frameInterval);

          // Use the REF current value to check state, avoiding stale closure issues
          if (gameStateRef.current === GameState.PLAYING && !isTransmissionOpenRef.current) {
            engine.update();
          }

          // Sync Stats to React for HUD every 30 logical frames (0.5s)
          if (engine.frameCount % 30 === 0) {
            setStats({ 
                ...engine.stats,
            });
          }

          // Check Game Over
          if (!engine.gameActive && engine.lives <= 0) {
            setGameState(GameState.GAMEOVER);
          }
      }

      // ALWAYS draw the game so it appears in the background (interpolate if needed, but simple draw is fine here)
      engine.draw(ctx);
      
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
