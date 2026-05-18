import React, { useEffect, useState } from 'react';
import { Stats, GameState } from '../types';
import { audioService } from '../services/audioService';

interface UIOverlayProps {
  stats: Stats;
  setGameState: (s: GameState) => void;
  lives: number;
  showLabGlow: boolean;
  onDisableLabGlow: () => void;
  isUpgradeReady?: boolean;
}

type HudIconName = 'sound' | 'muted' | 'pause' | 'lab' | 'ship';

const HudIcon = ({ name, className = 'h-5 w-5' }: { name: HudIconName; className?: string }) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === 'sound' ? (
        <>
          <path {...common} d="M4.5 14.5h3.2l5.1 4.1V5.4L7.7 9.5H4.5z" />
          <path {...common} d="M16 9c.9.9 1.3 1.9 1.3 3s-.4 2.1-1.3 3" />
          <path {...common} d="M18.7 6.5a7.6 7.6 0 0 1 0 11" />
        </>
      ) : null}
      {name === 'muted' ? (
        <>
          <path {...common} d="M4.5 14.5h3.2l5.1 4.1V5.4L7.7 9.5H4.5z" />
          <path {...common} d="m16.5 9.5 4 5M20.5 9.5l-4 5" />
        </>
      ) : null}
      {name === 'pause' ? (
        <>
          <path {...common} d="M8 5.5v13M16 5.5v13" />
        </>
      ) : null}
      {name === 'lab' ? (
        <>
          <path {...common} d="M9 4.5h6" />
          <path {...common} d="M10 4.5v4.2l-4.6 7.6c-1 1.7.2 3.8 2.2 3.8h8.8c2 0 3.2-2.1 2.2-3.8L14 8.7V4.5" />
          <path {...common} d="M8 15h8M9.5 11.5h5" />
        </>
      ) : null}
      {name === 'ship' ? (
        <>
          <path {...common} d="M12 3.8 17 19l-5-2.6L7 19z" />
          <path {...common} d="M9.2 14.2h5.6" />
        </>
      ) : null}
    </svg>
  );
};

const UIOverlay: React.FC<UIOverlayProps> = ({ stats, setGameState, showLabGlow, onDisableLabGlow, isUpgradeReady = false }) => {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!showLabGlow) return;

    const timer = setTimeout(() => {
      onDisableLabGlow();
    }, 3000);

    return () => clearTimeout(timer);
  }, [showLabGlow, onDisableLabGlow]);

  const toggleMute = () => {
    const isMuted = audioService.toggleMute();
    setMuted(isMuted);
  };

  const handleOpenLab = () => {
    onDisableLabGlow();
    setGameState(GameState.SHOP);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3 sm:p-4">
      <div className="flex w-full items-start justify-between gap-3">
        <div className="pointer-events-auto space-y-2">
          <div className="min-w-[156px] rounded-[20px] border border-white/10 bg-slate-950/74 px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,0.34)] backdrop-blur-md">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200/80">Impact Factor</span>
            <div className="arcade-font text-2xl font-black tracking-wider text-white">
              {stats.score.toString().padStart(6, '0')}
            </div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-300">
              Wave {stats.wave}
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-slate-950/64 px-2 py-1 backdrop-blur-md">
            {[...Array(Math.max(0, stats.lives))].map((_, i) => (
              <span key={i} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-base shadow-[0_0_16px_rgba(96,165,250,0.18)]" aria-label="Life">
                🧪
              </span>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto flex items-start gap-2">
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/74 px-3 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-md">
            <img src="https://www.researchhub.com/icons/gold2.svg" className="h-5 w-5" alt="RSC" />
            <span className="font-mono text-base font-black text-white">{stats.coins}</span>
          </div>

          <button
            onClick={toggleMute}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white text-slate-950 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:bg-blue-100"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            <HudIcon name={muted ? 'muted' : 'sound'} className="h-5 w-5" />
          </button>

          <button
            onClick={() => setGameState(GameState.PAUSED)}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white text-slate-950 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:bg-blue-100"
            aria-label="Pause mission"
          >
            <HudIcon name="pause" className="h-5 w-5" />
          </button>
        </div>
      </div>

      {!stats.isBossActive && (
        <div className="pointer-events-auto absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center sm:right-4">
          <div className="flex h-[240px] w-4 items-end overflow-hidden rounded-full border border-white/10 bg-slate-950/68 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.32)] backdrop-blur-md">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-black/45">
              <div
                className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-emerald-400 via-cyan-300 to-yellow-300 transition-all duration-300 ease-linear"
                style={{ height: `${stats.bossProgress * 100}%` }}
              ></div>
              <div className="absolute bottom-[33%] left-0 h-px w-full bg-white/18"></div>
              <div className="absolute bottom-[66%] left-0 h-px w-full bg-white/18"></div>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-5 right-5 z-20 sm:bottom-7 sm:right-7">
        <button
          onClick={handleOpenLab}
          className={`group relative flex h-16 w-16 items-center justify-center rounded-[22px] border bg-white text-slate-950 shadow-[0_18px_50px_rgba(0,0,0,0.36)] outline-none transition hover:-translate-y-0.5 hover:bg-blue-100 active:translate-y-0 ${isUpgradeReady ? 'border-yellow-300' : 'border-white/20'}`}
          aria-label="Open upgrade lab"
        >
          {(showLabGlow || isUpgradeReady) ? (
            <>
              <div className={`absolute -inset-3 rounded-[28px] ${isUpgradeReady ? 'bg-yellow-300/24' : 'bg-blue-300/18'} animate-ping`}></div>
              <div className={`absolute -inset-1 rounded-[24px] ${isUpgradeReady ? 'bg-yellow-300/24' : 'bg-blue-400/16'} blur-md`}></div>
            </>
          ) : null}

          <span className="relative flex flex-col items-center justify-center">
            <HudIcon name="lab" className="h-7 w-7" />
            <span className="mt-0.5 text-[9px] font-black uppercase tracking-[0.16em]">Lab</span>
          </span>

          {isUpgradeReady ? (
            <span className="absolute -right-1 -top-1 flex h-6 w-6 animate-pulse items-center justify-center rounded-full border-2 border-slate-950 bg-yellow-300 text-xs font-black text-slate-950">!</span>
          ) : null}
        </button>
      </div>
    </div>
  );
};

export default UIOverlay;
