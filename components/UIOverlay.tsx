import React, { useEffect, useState } from 'react';
import { FieldUpgradeType, Stats } from '../types';
import { audioService } from '../services/audioService';
import { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from '../constants';
import { BASE_FLASK_CHARGE_MAX, getFlaskProgress } from '../services/flaskProgress';
import { DEFAULT_GAME_CAMPAIGN, getPrimaryAssetPath } from '../services/levelConfig';

export interface UIOverlayProps {
  stats: Stats;
  showLabGlow: boolean;
  onDisableLabGlow: () => void;
  isUpgradeReady?: boolean;
  paused?: boolean;
  onPause: () => void;
  onUseBomb: () => void;
  onUpgrade: (type: FieldUpgradeType) => void;
  bombIconSrc?: string;
  bombLocked?: boolean;
  muted?: boolean;
  onToggleMute?: () => boolean | void;
}

type HudIconName = 'sound' | 'muted' | 'play' | 'pause' | 'lab' | 'ship' | 'heart' | 'bomb' | 'flask' | 'bolt' | 'plus';

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
      {name === 'play' ? (
        <path {...common} fill="currentColor" d="m8.5 5.5 9 6.5-9 6.5z" />
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

const BombSprite = ({ active, src }: { active: boolean; src: string }) => (
  <img
    src={src}
    alt=""
    aria-hidden="true"
    draggable={false}
    className={`relative h-14 w-14 object-contain drop-shadow-[0_0_18px_rgba(163,230,53,0.5)] transition ${active ? '' : 'grayscale opacity-55'}`}
  />
);

const fieldUpgradeOrder: FieldUpgradeType[] = ['fireRate', 'speed', 'extraLife'];

const fieldUpgradeSprites: Record<FieldUpgradeType, string> = {
  fireRate: '/game-art/powerups/rapid-fire.png',
  speed: '/game-art/powerups/speed.png',
  extraLife: '/game-art/powerups/extra-life.png'
};

const FieldUpgradeSprite = ({ type, highlighted }: { type: FieldUpgradeType; highlighted: boolean }) => (
  <img
    src={fieldUpgradeSprites[type]}
    alt=""
    aria-hidden="true"
    draggable={false}
    decoding="async"
    className={`h-14 w-14 object-contain [image-rendering:pixelated] transition duration-200 ${type === 'speed' ? '-rotate-90' : ''} ${
      highlighted
        ? 'opacity-100 saturate-125 brightness-110 drop-shadow-[0_0_12px_currentColor]'
        : 'grayscale opacity-35 brightness-50'
    }`}
  />
);

const fieldUpgradeColors: Record<FieldUpgradeType, {
  active: string;
  idle: string;
  glow: string;
}> = {
  fireRate: {
    active: 'border-yellow-200/80 bg-yellow-300/18 text-yellow-50 shadow-[0_0_30px_rgba(250,204,21,0.18)]',
    idle: 'border-yellow-100/14 bg-slate-950/42 text-yellow-100/55',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(250,204,21,0.26),transparent_60%)]'
  },
  speed: {
    active: 'border-cyan-200/80 bg-cyan-300/18 text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.18)]',
    idle: 'border-cyan-100/14 bg-slate-950/42 text-cyan-100/55',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.26),transparent_60%)]'
  },
  extraLife: {
    active: 'border-rose-200/80 bg-rose-300/18 text-rose-50 shadow-[0_0_30px_rgba(251,113,133,0.18)]',
    idle: 'border-rose-100/14 bg-slate-950/42 text-rose-100/55',
    glow: 'bg-[radial-gradient(circle_at_50%_0%,rgba(251,113,133,0.26),transparent_60%)]'
  }
};

const UIOverlay: React.FC<UIOverlayProps> = ({
  stats,
  showLabGlow,
  onDisableLabGlow,
  isUpgradeReady = false,
  paused = false,
  onPause,
  onUseBomb,
  onUpgrade,
  bombIconSrc = getPrimaryAssetPath(DEFAULT_GAME_CAMPAIGN.hudAssets.bombIconAssetKey),
  bombLocked = false,
  muted: controlledMuted,
  onToggleMute
}) => {
  const [internalMuted, setInternalMuted] = useState(false);
  const muted = controlledMuted ?? internalMuted;

  useEffect(() => {
    if (!showLabGlow) return;

    const timer = setTimeout(() => {
      onDisableLabGlow();
    }, 3000);

    return () => clearTimeout(timer);
  }, [showLabGlow, onDisableLabGlow]);

  const toggleMute = () => {
    const result = onToggleMute ? onToggleMute() : audioService.toggleMute();
    if (controlledMuted === undefined) {
      setInternalMuted(typeof result === 'boolean' ? result : !muted);
    }
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
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden rounded-[8px] border border-cyan-200/18 bg-slate-950/70 px-1.5 py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.28)] backdrop-blur-md sm:gap-2 sm:px-2.5 sm:py-2">
          <div className="flex h-8 shrink-0 items-center gap-1 rounded-[6px] border border-red-300/24 bg-red-500/12 px-2 text-red-100 sm:h-9">
            <HudIcon name="heart" className="h-4 w-4 text-red-400 sm:h-5 sm:w-5" />
            <span className="arcade-font min-w-4 text-lg font-black leading-none text-white">{stats.lives}</span>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <HudIcon name="flask" className="h-5 w-5 shrink-0 text-cyan-200 sm:h-6 sm:w-6" />
            <div className="min-w-0 max-w-full flex-1 overflow-hidden">
              <div className="h-3 w-full max-w-full overflow-hidden rounded-full border border-cyan-100/10 bg-slate-700/70">
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
            type="button"
            onClick={onPause}
            className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-cyan-200/18 bg-white text-slate-950 shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition hover:bg-blue-100 sm:h-10 sm:w-10"
            aria-label={paused ? 'Resume mission' : 'Pause mission'}
            aria-pressed={paused}
          >
            <HudIcon name={paused ? 'play' : 'pause'} className="h-5 w-5" />
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
          <BombSprite active={canUseBomb} src={bombIconSrc} />
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
        className="pointer-events-auto absolute right-2 z-20 flex w-[4.6rem] flex-col gap-1.5 sm:right-4"
        style={{ bottom: 'max(2.75rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))' }}
      >
        <div className={`relative rounded-[8px] border px-1.5 py-1.5 text-center shadow-[0_12px_32px_rgba(0,0,0,0.3)] backdrop-blur-md ${
          flaskReady || isUpgradeReady
            ? 'border-emerald-200/55 bg-emerald-300/16 text-emerald-100'
            : 'border-cyan-200/18 bg-slate-950/52 text-cyan-100/70'
        }`}>
          {showLabGlow && !flaskReady ? (
            <span className="pointer-events-none absolute -inset-1 rounded-[10px] bg-cyan-300/8 blur-md" />
          ) : null}
          <div className="relative flex items-center justify-center gap-1.5">
            <HudIcon name="flask" className="h-4 w-4" />
            <span className="arcade-font text-sm font-black leading-none">x{flaskCount}</span>
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
          const highlighted = canPick || isAtCap;
          const displayedLevel = Math.min(config.maxLevel, level + 1);
          const accessibleLabel = isAtCap
            ? `${config.title} is at max level`
            : `Upgrade ${config.title} for ${flaskCost} flask${flaskCost === 1 ? '' : 's'}`;

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
              className={`group relative flex h-[4.6rem] w-[4.6rem] items-center justify-center overflow-visible rounded-[10px] border p-0.5 shadow-[0_14px_38px_rgba(0,0,0,0.3)] backdrop-blur-md transition active:scale-95 ${
                highlighted
                  ? `${colors.active} ${canPick ? 'hover:border-white hover:brightness-125' : ''}`
                  : colors.idle
              }`}
              aria-label={accessibleLabel}
              title={accessibleLabel}
            >
              {canPick ? (
                <span className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[9px] ${colors.glow}`} />
              ) : null}
              {!isAtCap ? (
                <span className={`absolute -left-1.5 -top-1.5 z-20 flex h-6 min-w-6 items-center justify-center rounded-full border px-1 text-xs font-black ${
                  canPick
                    ? 'border-emerald-100/80 bg-emerald-300 text-slate-950'
                    : 'border-slate-400/35 bg-slate-950 text-slate-300'
                }`}>
                  x{flaskCost}
                </span>
              ) : null}
              <span className={`absolute -right-1.5 -top-1.5 z-20 flex items-center justify-center rounded-full border font-black ${
                isAtCap
                  ? 'h-8 min-w-8 border-yellow-100/85 bg-yellow-300 px-1 text-[8px] text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.5)]'
                  : 'h-6 min-w-6 border-cyan-100/55 bg-slate-950 px-1 text-xs text-cyan-100'
              }`}>
                {isAtCap ? 'MAX' : `L${displayedLevel}`}
              </span>
              <span className="relative flex h-full w-full items-center justify-center">
                <FieldUpgradeSprite type={type} highlighted={highlighted} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default UIOverlay;
