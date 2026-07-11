import React, { useEffect, useState } from 'react';
import { FieldUpgradeType, Stats, GameState } from '../types';
import { audioService } from '../services/audioService';
import { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from '../constants';
import { BASE_FLASK_CHARGE_MAX, getFlaskProgress } from '../services/flaskProgress';

interface UIOverlayProps {
  stats: Stats;
  setGameState: (s: GameState) => void;
  lives: number;
  showLabGlow: boolean;
  onDisableLabGlow: () => void;
  isUpgradeReady?: boolean;
  onUseBomb: () => void;
  onUpgrade: (type: FieldUpgradeType) => void;
  bombLocked?: boolean;
}

type HudIconName = 'sound' | 'muted' | 'pause' | 'lab' | 'ship' | 'heart' | 'bomb' | 'flask' | 'bolt' | 'plus';

const HudIcon = ({
  name,
  className = 'h-5 w-5',
  strokeWidth = 1.9
}: {
  name: HudIconName;
  className?: string;
  strokeWidth?: number;
}) => {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
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
        <path {...common} d="M8 5.5v13M16 5.5v13" />
      ) : null}
      {name === 'lab' || name === 'flask' ? (
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
      {name === 'heart' ? (
        <path
          {...common}
          fill="currentColor"
          stroke="currentColor"
          d="M12 20.4S4.8 16.2 3.3 10.4C2.4 6.9 4.4 4.2 7.4 4.2c1.8 0 3.1 1 4 2.2.9-1.2 2.2-2.2 4-2.2 3 0 5 2.7 4.1 6.2C18 16.2 12 20.4 12 20.4Z"
        />
      ) : null}
      {name === 'bolt' ? (
        <path {...common} fill="currentColor" stroke="currentColor" d="M13 2.8 5.5 13h5.3L10 21.2 18.5 10h-5.7z" />
      ) : null}
      {name === 'plus' ? (
        <>
          <path
            {...common}
            fill="currentColor"
            stroke="currentColor"
            d="M12 20.4S4.8 16.2 3.3 10.4C2.4 6.9 4.4 4.2 7.4 4.2c1.8 0 3.1 1 4 2.2.9-1.2 2.2-2.2 4-2.2 3 0 5 2.7 4.1 6.2C18 16.2 12 20.4 12 20.4Z"
          />
          <path {...common} stroke="#07111f" strokeWidth="2.4" d="M12 8.5v6.2M8.9 11.6h6.2" />
        </>
      ) : null}
      {name === 'bomb' ? (
        <>
          <circle {...common} cx="12" cy="13" r="6" />
          <path {...common} d="M15.8 8.2 18 6" />
          <path {...common} d="M17.2 5.2c1.5.2 2.7 1.1 3.3 2.5" />
          <path {...common} d="M9.3 13h5.4" />
          <path {...common} d="M12 10.3v5.4" />
        </>
      ) : null}
    </svg>
  );
};

const BombSprite = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 64 64"
    className="relative h-12 w-12 drop-shadow-[0_0_18px_rgba(251,191,36,0.45)]"
    aria-hidden="true"
    style={{ imageRendering: 'pixelated' }}
  >
    <defs>
      <radialGradient id="scicon-bomb-core" cx="34%" cy="28%" r="70%">
        <stop offset="0%" stopColor="#fff7ad" />
        <stop offset="28%" stopColor="#facc15" />
        <stop offset="62%" stopColor="#f97316" />
        <stop offset="100%" stopColor="#7c2d12" />
      </radialGradient>
      <linearGradient id="scicon-bomb-fuse" x1="31" y1="10" x2="52" y2="4" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f8fafc" />
        <stop offset="1" stopColor="#67e8f9" />
      </linearGradient>
    </defs>
    <rect x="21" y="8" width="18" height="9" rx="2" fill="#f59e0b" />
    <rect x="29" y="4" width="9" height="8" rx="2" fill="#fde68a" />
    <path d="M36 8 C44 3 50 5 55 10" fill="none" stroke="url(#scicon-bomb-fuse)" strokeWidth="4" strokeLinecap="round" />
    <path d="M54 5h4v4h-4zM57 11h3v3h-3zM48 1h3v3h-3z" fill={active ? '#fef08a' : '#64748b'} />
    <circle cx="31" cy="35" r="22" fill="url(#scicon-bomb-core)" />
    <circle cx="24" cy="26" r="6" fill="#fff7ad" opacity="0.82" />
    <path d="M15 45h6v5h-6zM40 17h6v5h-6zM45 40h5v5h-5z" fill="#fef3c7" opacity="0.72" />
    <path d="M16 54h30" stroke="#451a03" strokeWidth="4" strokeLinecap="round" opacity="0.45" />
    <path d="M31 15c10 0 20 8 22 19" fill="none" stroke="#fff7ed" strokeWidth="2" opacity="0.34" />
  </svg>
);

const fieldUpgradeOrder: FieldUpgradeType[] = ['fireRate', 'speed', 'extraLife'];

const fieldUpgradeIcons: Record<FieldUpgradeType, HudIconName> = {
  fireRate: 'bolt',
  speed: 'ship',
  extraLife: 'plus'
};

const fieldUpgradeColors: Record<FieldUpgradeType, {
  active: string;
  idle: string;
  iconActive: string;
  iconIdle: string;
  meter: string;
  glow: string;
}> = {
  fireRate: {
    active: 'border-yellow-200/80 bg-yellow-300/18 text-yellow-50 shadow-[0_0_30px_rgba(250,204,21,0.18)]',
    idle: 'border-yellow-100/14 bg-slate-950/42 text-yellow-100/55',
    iconActive: 'border-yellow-100/60 bg-yellow-300/24 text-yellow-100',
    iconIdle: 'border-white/10 bg-white/[0.04] text-yellow-100/55',
    meter: 'bg-yellow-300',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,0.26),transparent_60%)]'
  },
  speed: {
    active: 'border-cyan-200/80 bg-cyan-300/18 text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.18)]',
    idle: 'border-cyan-100/14 bg-slate-950/42 text-cyan-100/55',
    iconActive: 'border-cyan-100/60 bg-cyan-300/24 text-cyan-100',
    iconIdle: 'border-white/10 bg-white/[0.04] text-cyan-100/55',
    meter: 'bg-cyan-300',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.26),transparent_60%)]'
  },
  extraLife: {
    active: 'border-rose-200/80 bg-rose-300/18 text-rose-50 shadow-[0_0_30px_rgba(251,113,133,0.18)]',
    idle: 'border-rose-100/14 bg-slate-950/42 text-rose-100/55',
    iconActive: 'border-rose-100/60 bg-rose-300/24 text-rose-100',
    iconIdle: 'border-white/10 bg-white/[0.04] text-rose-100/55',
    meter: 'bg-rose-300',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(251,113,133,0.26),transparent_60%)]'
  }
};

const UIOverlay: React.FC<UIOverlayProps> = ({
  stats,
  setGameState,
  showLabGlow,
  onDisableLabGlow,
  isUpgradeReady = false,
  onUseBomb,
  onUpgrade,
  bombLocked = false
}) => {
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

  const bombChargeMax = stats.bombChargeMax || BASE_FLASK_CHARGE_MAX;
  const flaskCharge = Math.max(0, stats.bombCharge || 0);
  const flaskProgress = getFlaskProgress(flaskCharge, bombChargeMax);
  const flaskCount = flaskProgress.storedFlasks;
  const nextFlaskPct = flaskProgress.nextFlaskPct;
  const flaskReady = flaskCount > 0;
  const bombs = stats.bombs || 0;
  const canUseBomb = bombs > 0 && !bombLocked;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2 sm:p-4">
      <div className="flex w-full items-start justify-between gap-1.5">
        <div className="pointer-events-auto flex max-w-[calc(100vw-10.75rem)] flex-1 min-w-0 items-center gap-1.5 rounded-[8px] border border-cyan-200/18 bg-slate-950/70 px-1.5 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-md sm:max-w-none sm:gap-2 sm:px-2.5 sm:py-2">
          <div className="flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-red-300/24 bg-red-500/12 px-2 text-red-100 sm:h-9">
            <HudIcon name="heart" className="h-4 w-4 text-red-400 sm:h-5 sm:w-5" />
            <span className="arcade-font min-w-4 text-lg font-black leading-none text-white">{stats.lives}</span>
          </div>

          <div className="hidden h-8 shrink-0 items-center rounded-[6px] border border-cyan-300/18 bg-cyan-300/8 px-2 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100 min-[560px]:flex sm:h-9 sm:text-[10px] sm:tracking-[0.12em]">
            Wave {stats.wave}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:w-32 sm:flex-none">
            <HudIcon name="flask" className="h-5 w-5 shrink-0 text-cyan-200 sm:h-6 sm:w-6" />
            <div className="min-w-0 flex-1">
              <div className="h-3 overflow-hidden rounded-full border border-cyan-100/10 bg-slate-700/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-yellow-300 transition-all duration-300"
                  style={{ width: `${nextFlaskPct}%` }}
                />
              </div>
              <div className="mt-0.5 truncate text-[8px] font-black uppercase tracking-[0.08em] text-cyan-100/75 sm:text-[9px] sm:tracking-[0.12em]">
                Flasks {flaskCount}
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-start gap-1">
          <div className="flex h-9 min-w-[70px] items-center justify-center rounded-[6px] border border-cyan-200/18 bg-slate-950/72 px-2 shadow-[0_10px_28px_rgba(0,0,0,0.24)] backdrop-blur-md sm:h-10 sm:min-w-[96px] sm:px-2.5">
            <div className="arcade-font text-base font-black tracking-wider text-white sm:text-2xl">
              {stats.score.toString().padStart(6, '0')}
            </div>
          </div>

          <button
            onClick={toggleMute}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-cyan-200/18 bg-white text-slate-950 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:bg-blue-100 sm:h-10 sm:w-10"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
          >
            <HudIcon name={muted ? 'muted' : 'sound'} className="h-5 w-5" />
          </button>

          <button
            onClick={() => setGameState(GameState.PAUSED)}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-cyan-200/18 bg-white text-slate-950 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:bg-blue-100 sm:h-10 sm:w-10"
            aria-label="Pause mission"
          >
            <HudIcon name="pause" className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-auto absolute left-3 top-[57%] z-20 -translate-y-1/2 sm:left-5">
        <button
          type="button"
          onClick={onUseBomb}
          disabled={!canUseBomb}
          className={`relative flex h-[4.6rem] w-[4.6rem] items-center justify-center rounded-[22px] border shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-md transition active:scale-95 ${
            canUseBomb
              ? 'border-yellow-200/70 bg-slate-950/70 text-white shadow-[0_0_34px_rgba(251,191,36,0.2)] hover:border-yellow-100 hover:brightness-110'
              : 'border-slate-400/20 bg-slate-900/54 text-slate-400 opacity-75'
          }`}
          aria-label="Use RSC bomb"
        >
          {nextFlaskPct > 84 && bombs < 3 ? (
            <span className="pointer-events-none absolute -inset-2 rounded-[28px] border border-yellow-200/35 bg-yellow-300/12 animate-ping" />
          ) : null}
          <span className="absolute -left-1.5 -top-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-cyan-100/60 bg-slate-950 px-1 text-xs font-black text-cyan-100">
            {bombs}
          </span>
          <div className="absolute inset-1 rounded-[18px] bg-[radial-gradient(circle_at_50%_20%,rgba(250,204,21,0.2),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(0,0,0,0.42))]" />
          <BombSprite active={canUseBomb} />
        </button>
      </div>

      {!stats.isBossActive && (
        <div className="pointer-events-auto absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center min-[520px]:flex sm:right-4">
          <div className="flex h-[240px] w-4 items-end overflow-hidden rounded-full border border-white/10 bg-slate-950/68 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.32)] backdrop-blur-md">
            <div className="relative h-full w-full overflow-hidden rounded-full bg-black/45">
              <div
                className="absolute bottom-0 left-0 w-full rounded-full bg-gradient-to-t from-emerald-400 via-cyan-300 to-yellow-300 transition-all duration-300 ease-linear"
                style={{ height: `${stats.bossProgress * 100}%` }}
              />
              <div className="absolute bottom-[33%] left-0 h-px w-full bg-white/18" />
              <div className="absolute bottom-[66%] left-0 h-px w-full bg-white/18" />
            </div>
          </div>
        </div>
      )}

      <div
        className="pointer-events-auto absolute right-2 z-20 flex w-[4.85rem] flex-col gap-2 sm:right-4 sm:w-24"
        style={{ bottom: 'max(2.75rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))' }}
      >
        <div className={`relative rounded-[10px] border px-2 py-1.5 text-center shadow-[0_12px_32px_rgba(0,0,0,0.3)] backdrop-blur-md ${
          flaskReady || isUpgradeReady
            ? 'border-emerald-200/55 bg-emerald-300/16 text-emerald-100'
            : 'border-cyan-200/18 bg-slate-950/52 text-cyan-100/70'
        }`}>
          {showLabGlow && !flaskReady ? (
            <span className="pointer-events-none absolute -inset-1 rounded-[12px] bg-cyan-300/8 blur-md" />
          ) : null}
          <div className="relative flex items-center justify-center gap-1">
            <HudIcon name="flask" className="h-3.5 w-3.5" />
            <span className="font-mono text-[8px] font-black uppercase tracking-[0.12em]">x{flaskCount}</span>
          </div>
          <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-yellow-300 transition-all duration-300"
              style={{ width: `${nextFlaskPct}%` }}
            />
          </div>
        </div>

        {fieldUpgradeOrder.map((type) => {
          const config = FIELD_UPGRADE_CONFIG[type];
          const colors = fieldUpgradeColors[type];
          const level = getFieldUpgradeLevel(stats, type);
          const flaskCost = getFieldUpgradeFlaskCost(stats, type);
          const isLifeUpgrade = type === 'extraLife';
          const isAtCap = isLifeUpgrade ? stats.lives >= GAME_CONFIG.MAX_LIVES : level >= config.maxLevel;
          const canPick = flaskCount >= flaskCost && !isAtCap;
          const shortTitle = type === 'fireRate'
            ? level >= 5
              ? 'Nova'
              : level >= 3
                ? 'Plasma'
                : config.shortTitle
            : config.shortTitle;
          const upgradeStatus = isAtCap
            ? 'MAX'
            : flaskCost > 1
              ? `x${flaskCost}`
              : canPick
                ? 'PICK'
                : `L${level + 1}`;

          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                if (!canPick) return;
                onDisableLabGlow();
                onUpgrade(type);
              }}
              disabled={!canPick}
              className={`group relative overflow-hidden rounded-[12px] border p-1.5 text-left shadow-[0_14px_38px_rgba(0,0,0,0.3)] backdrop-blur-md transition active:scale-95 sm:p-2 ${
                canPick
                  ? `${colors.active} hover:border-white hover:brightness-125`
                  : colors.idle
              }`}
              aria-label={`Upgrade ${config.title} for ${flaskCost} flask${flaskCost === 1 ? '' : 's'}`}
            >
              {canPick ? (
                <span className={`pointer-events-none absolute inset-0 ${colors.glow}`} />
              ) : null}
              <div className="relative flex items-center justify-between gap-1">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border ${
                  canPick ? colors.iconActive : colors.iconIdle
                }`}>
                  <HudIcon name={fieldUpgradeIcons[type]} className="h-5 w-5" />
                </span>
                <span className="font-mono text-[9px] font-black text-white/85">{upgradeStatus}</span>
              </div>
              <div className="relative mt-1 text-[9px] font-black uppercase leading-tight tracking-[0.08em] text-white sm:text-[10px]">
                {shortTitle}
              </div>
              <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full ${canPick ? colors.meter : 'bg-white/25'}`}
                  style={{ width: `${Math.min(100, (level / config.maxLevel) * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default UIOverlay;
