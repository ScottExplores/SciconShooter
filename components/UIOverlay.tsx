import React, { useEffect, useRef } from 'react';
import { FieldUpgradeType, Stats } from '../types';
import { FIELD_UPGRADE_CONFIG, GAME_CONFIG, getFieldUpgradeFlaskCost, getFieldUpgradeLevel } from '../constants';
import { BASE_FLASK_CHARGE_MAX, getFlaskProgress } from '../services/flaskProgress';
import { DEFAULT_GAME_CAMPAIGN, getPrimaryAssetPath } from '../services/levelConfig';
import { ONBOARDING_GAMEPLAY_ACTION_EVENT } from '../services/onboardingProgress';
import type { PlayerShipId } from '../services/playerShipService';
import { formatTokenAmount } from '../services/tokenTerminology';
import {
  getShipAbilityDefinition,
  getShipAbilityUpgradeProfile
} from '../services/shipAbilityService';
import { getFireRateTier, getFireRateTierProgress } from '../services/weaponTierProgression';

export interface UIOverlayProps {
  stats: Stats;
  showLabGlow: boolean;
  onDisableLabGlow: () => void;
  isUpgradeReady?: boolean;
  paused?: boolean;
  frozen?: boolean;
  showFreezeControl?: boolean;
  onPause: () => void;
  onToggleFreeze?: () => void;
  onUseBomb: () => void;
  selectedShipId?: PlayerShipId;
  onUseShipAbility?: () => void;
  shipAbilityLocked?: boolean;
  fieldUpgradesEnabled?: boolean;
  onUpgrade: (type: FieldUpgradeType) => void;
  bombIconSrc?: string;
  bombLocked?: boolean;
  /** Shows an infinite count and keeps the preview bomb action enabled. */
  unlimitedBombs?: boolean;
  /** Permanent capacity for this Mission; temporary Extra Hearts may exceed it. */
  lifeCapacity?: number;
}

type HudIconName = 'play' | 'pause' | 'freeze' | 'lab' | 'ship' | 'heart' | 'bomb' | 'flask' | 'bolt' | 'plus';

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
      {name === 'pause' ? (
        <path {...common} d="M8 5.5v13M16 5.5v13" />
      ) : null}
      {name === 'play' ? (
        <path {...common} fill="currentColor" d="m8.5 5.5 9 6.5-9 6.5z" />
      ) : null}
      {name === 'freeze' ? (
        <>
          <path {...common} d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4 4 16.6" />
          <path {...common} d="m12 2.8 2 2M12 2.8l-2 2M12 21.2l2-2M12 21.2l-2-2M4 7.4l2.7-.7M4 7.4l.7 2.7M20 16.6l-2.7.7M20 16.6l-.7-2.7M20 7.4l-2.7-.7M20 7.4l-.7 2.7M4 16.6l2.7.7M4 16.6l.7-2.7" />
        </>
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
    className={`relative h-[3.325rem] w-[3.325rem] object-contain drop-shadow-[0_0_18px_rgba(163,230,53,0.5)] transition ${active ? '' : 'grayscale opacity-55'}`}
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
    className={`h-[3.5rem] w-[3.5rem] object-contain [image-rendering:pixelated] transition duration-200 ${type === 'speed' ? '-rotate-90' : ''} ${
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

const compactHudRoot = '/game-art/generated/ui/scicon-compact-top-hud-v1';

const compactHudAssets = {
  heartShell: `${compactHudRoot}/meter-parts/heart-health-shell.png`,
  heartFill: `${compactHudRoot}/meter-parts/heart-health-fill.png`,
  matchCoin: '/game-art/generated/rsc-coin-flip-v1/rsc-coin-pixel-front.png',
  pauseNormal: `${compactHudRoot}/buttons/pause-button-normal.png`,
  pauseSelected: `${compactHudRoot}/buttons/pause-button-selected.png`
} as const;

const pixelSpriteClass = 'pointer-events-none absolute select-none object-contain [image-rendering:pixelated]';
const SYNTHETIC_TOUCH_CLICK_WINDOW_MS = 800;

const useMultitouchAction = (onActivate?: () => void) => {
  const suppressSyntheticClickUntilRef = useRef(0);

  const activate = (button: HTMLButtonElement) => {
    if (!onActivate) return;
    onActivate();
    // The guide listens to the same successful activation used by every input
    // path. A raw pointer event can otherwise advance before the gameplay
    // callback runs or miss keyboard/legacy touch activation entirely.
    button.dispatchEvent(new CustomEvent(ONBOARDING_GAMEPLAY_ACTION_EVENT, {
      bubbles: true,
      detail: { target: button.dataset.onboardingTarget }
    }));
  };

  return {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      // Non-primary touch pointers do not reliably synthesize click in iOS and
      // embedded wallet browsers, so gameplay actions fire directly on press.
      if ((event.pointerType !== 'touch' && event.pointerType !== 'pen') || !onActivate) return;
      event.preventDefault();
      suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_TOUCH_CLICK_WINDOW_MS;
      activate(event.currentTarget);
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') {
        suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_TOUCH_CLICK_WINDOW_MS;
      }
    },
    onTouchStart: (event: React.TouchEvent<HTMLButtonElement>) => {
      // Old WebViews without Pointer Events still need a direct secondary-touch
      // activation path. Modern browsers take the pointer path above exactly once.
      if (typeof window.PointerEvent !== 'undefined' || !onActivate) return;
      event.preventDefault();
      suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_TOUCH_CLICK_WINDOW_MS;
      activate(event.currentTarget);
    },
    onTouchEnd: () => {
      if (typeof window.PointerEvent === 'undefined') {
        suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_TOUCH_CLICK_WINDOW_MS;
      }
    },
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      const isSyntheticPointerClick = event.detail > 0
        && Date.now() <= suppressSyntheticClickUntilRef.current;
      if (isSyntheticPointerClick) {
        suppressSyntheticClickUntilRef.current = 0;
        return;
      }
      activate(event.currentTarget);
    }
  };
};

const UIOverlay: React.FC<UIOverlayProps> = ({
  stats,
  showLabGlow,
  onDisableLabGlow,
  paused = false,
  frozen = false,
  showFreezeControl = false,
  onPause,
  onToggleFreeze,
  onUseBomb,
  selectedShipId,
  onUseShipAbility,
  shipAbilityLocked = false,
  fieldUpgradesEnabled = true,
  onUpgrade,
  bombIconSrc = getPrimaryAssetPath(DEFAULT_GAME_CAMPAIGN.hudAssets.bombIconAssetKey),
  bombLocked = false,
  unlimitedBombs = false,
  lifeCapacity
}) => {
  useEffect(() => {
    if (!showLabGlow) return;

    const timer = setTimeout(() => {
      onDisableLabGlow();
    }, 3000);

    return () => clearTimeout(timer);
  }, [showLabGlow, onDisableLabGlow]);

  const bombChargeMax = stats.bombChargeMax || BASE_FLASK_CHARGE_MAX;
  const flaskCharge = Math.max(0, stats.bombCharge || 0);
  const flaskProgress = getFlaskProgress(flaskCharge, bombChargeMax);
  const flaskCount = flaskProgress.storedFlasks;
  const nextFlaskPct = flaskProgress.nextFlaskPct;
  const bombs = stats.bombs || 0;
  const canUseBomb = (unlimitedBombs || bombs > 0) && !bombLocked;
  const abilityDefinition = getShipAbilityDefinition(selectedShipId ?? 'researchhub');
  const abilityUpgradeProfile = getShipAbilityUpgradeProfile(stats.upgrades?.ability ?? 0);
  const abilityIconUrl = selectedShipId === 'researchhub'
    ? abilityUpgradeProfile.projectileIconUrl
    : abilityDefinition.iconUrl;
  const abilityCooldownMax = stats.shipAbilityCooldownMax || abilityDefinition.cooldownFrames;
  const abilityCooldown = Math.max(0, stats.shipAbilityCooldown || 0);
  const abilityReady = abilityCooldown <= 0 && !shipAbilityLocked;
  const abilityRevealDegrees = Math.round((1 - Math.min(1, abilityCooldown / abilityCooldownMax)) * 360);
  const abilitySeconds = Math.max(1, Math.ceil(abilityCooldown / 60));
  const lifeCapacityMissionRef = useRef(stats.wave);
  const lifeCapacityRef = useRef(Math.max(1, lifeCapacity ?? stats.lives));
  if (lifeCapacityMissionRef.current !== stats.wave) {
    lifeCapacityMissionRef.current = stats.wave;
    lifeCapacityRef.current = Math.max(1, lifeCapacity ?? stats.lives);
  } else {
    lifeCapacityRef.current = Math.max(lifeCapacityRef.current, lifeCapacity ?? 0, stats.lives);
  }
  const remainingLifePct = Math.max(0, Math.min(100, (stats.lives / lifeCapacityRef.current) * 100));
  const bombActionHandlers = useMultitouchAction(onUseBomb);
  const shipAbilityActionHandlers = useMultitouchAction(onUseShipAbility);

  return (
    <div className="scicon-hud-shell pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-1.5 sm:p-3">
      <div className="flex w-full items-start justify-between gap-2">
        <div
          className="sci-compact-status-hud pointer-events-auto h-[2.125rem] w-[10.75rem] shrink-0"
          data-testid="compact-status-hud"
        >
          <div className="sci-compact-status-hud__inner flex h-full w-full">
            <div className="relative z-10 flex h-full w-[3.625rem] shrink-0 items-center pl-[0.22rem] pr-[0.38rem]" aria-label={`${stats.lives} lives remaining`}>
              <div className="relative h-[1.5rem] w-[1.5rem] shrink-0">
                <img
                  src={compactHudAssets.heartFill}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={`${pixelSpriteClass} inset-0 h-full w-full transition-[clip-path] duration-200`}
                  style={{ clipPath: `inset(${100 - remainingLifePct}% 0 0 0)` }}
                />
                <img
                  src={compactHudAssets.heartShell}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={`${pixelSpriteClass} inset-0 h-full w-full`}
                />
              </div>
              <span className="arcade-font ml-auto -translate-y-[3%] text-[0.8rem] font-black leading-none tracking-[0.04em] text-slate-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                {stats.lives}
              </span>
              <span className="sci-compact-status-hud__separator" aria-hidden="true" />
            </div>

            <div className="relative z-10 flex h-full min-w-0 flex-1 items-center pl-[0.3rem] pr-[0.75rem]" aria-label={`${formatTokenAmount(stats.coins)} collected this match`}>
              <div className="relative h-[1.5rem] w-[1.5rem] shrink-0">
                <img
                  src={compactHudAssets.matchCoin}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className={`${pixelSpriteClass} inset-0 h-full w-full drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]`}
                />
              </div>
              <span className={`arcade-font ml-[0.35rem] min-w-[3.25rem] flex-1 -translate-y-[3%] whitespace-nowrap text-center font-black leading-none text-slate-50 drop-shadow-[0_1px_2px_rgba(245,158,11,0.42)] [font-variant-numeric:tabular-nums] ${stats.coins >= 1000000 ? 'text-[0.66rem] tracking-[-0.04em]' : stats.coins >= 10000 ? 'text-[0.74rem] tracking-[-0.01em]' : 'text-[0.82rem] tracking-[0.04em]'}`}>
                x{stats.coins}
              </span>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex shrink-0 items-start gap-1">
          <div
            className="sci-compact-score-hud h-[2.125rem] w-[6.5rem] shrink-0"
            data-testid="compact-score-hud"
            aria-label={`Score ${stats.score}`}
          >
            <div className="sci-compact-score-hud__inner flex h-full w-full items-center">
              <span className={`arcade-font relative z-10 w-full -translate-y-[2%] whitespace-nowrap pl-[0.8rem] pr-[0.3rem] text-center font-black leading-none text-slate-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] [font-variant-numeric:tabular-nums] ${stats.score >= 100000000 ? 'text-[0.58rem] tracking-[0]' : stats.score >= 1000000 ? 'text-[0.68rem] tracking-[0.02em]' : 'text-[0.78rem] tracking-[0.06em]'}`}>
                {stats.score.toString().padStart(6, '0')}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={onPause}
              className="group relative h-[2.625rem] w-[2.625rem] shrink-0 transition-transform active:scale-90"
              aria-label={paused ? 'Resume mission' : 'Pause mission'}
              aria-pressed={paused}
            >
              <img
                src={paused ? compactHudAssets.pauseSelected : compactHudAssets.pauseNormal}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="h-full w-full select-none object-contain [image-rendering:pixelated] transition group-hover:brightness-125 group-focus-visible:brightness-125"
              />
            </button>
            {showFreezeControl && onToggleFreeze ? (
              <button
                type="button"
                onClick={onToggleFreeze}
                className={`scicon-freeze-control flex h-9 w-9 items-center justify-center rounded-[8px] border shadow-[0_10px_28px_rgba(0,0,0,0.24)] transition sm:h-10 sm:w-10 ${
                  frozen
                    ? 'border-cyan-100/75 bg-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(34,211,238,0.42)]'
                    : 'border-cyan-200/24 bg-slate-950/78 text-cyan-100 hover:bg-cyan-300/18'
                }`}
                aria-label={frozen ? 'Unfreeze test frame' : 'Freeze test frame'}
                aria-pressed={frozen}
                title={frozen ? 'Unfreeze frame' : 'Freeze frame'}
              >
                <HudIcon name="freeze" className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="scicon-left-actions pointer-events-auto absolute left-3 top-[57%] z-20 flex -translate-y-1/2 flex-col gap-2 sm:left-5">
        <button
          type="button"
          data-audio="none"
          data-onboarding-target="flight-bomb"
          {...bombActionHandlers}
          disabled={!canUseBomb}
          className={`relative flex h-[4.375rem] w-[4.375rem] items-center justify-center rounded-[22px] border shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-md transition active:scale-95 ${
            canUseBomb
              ? 'border-yellow-200/70 bg-slate-950/70 text-white shadow-[0_0_34px_rgba(251,191,36,0.2)] hover:border-yellow-100 hover:brightness-110'
              : 'border-slate-400/20 bg-slate-900/54 text-slate-400 opacity-75'
          }`}
          aria-label="Use RSC bomb"
        >
          {nextFlaskPct > 84 ? (
            <span className="pointer-events-none absolute -inset-2 rounded-[28px] border border-yellow-200/35 bg-yellow-300/12 animate-ping" />
          ) : null}
          <span className="absolute -left-1.5 -top-1.5 z-10 flex h-6 min-w-6 items-center justify-center rounded-full border border-cyan-100/60 bg-slate-950 px-1 text-xs font-black text-cyan-100">
            {unlimitedBombs ? '∞' : bombs}
          </span>
          <div className="absolute inset-1 rounded-[18px] bg-[radial-gradient(circle_at_50%_20%,rgba(250,204,21,0.2),transparent_42%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(0,0,0,0.42))]" />
          <BombSprite active={canUseBomb} src={bombIconSrc} />
        </button>
        {selectedShipId && onUseShipAbility ? (
          <button
            type="button"
            data-audio="none"
            data-onboarding-target="flight-special"
            {...shipAbilityActionHandlers}
            disabled={!abilityReady}
            className={`relative flex h-[4.375rem] w-[4.375rem] items-center justify-center overflow-hidden rounded-[22px] border shadow-[0_18px_44px_rgba(0,0,0,0.38)] backdrop-blur-md transition active:scale-95 ${
              abilityReady
                ? 'border-cyan-200/75 bg-slate-950/72 shadow-[0_0_34px_rgba(34,211,238,0.26)] hover:border-cyan-100 hover:brightness-110'
                : 'border-slate-400/20 bg-slate-900/62'
            }`}
            aria-label={abilityReady ? abilityDefinition.actionLabel : `${abilityDefinition.name} ready in ${abilitySeconds} seconds`}
            title={abilityReady ? abilityDefinition.name : `${abilitySeconds}s recharge`}
            style={abilityReady ? { boxShadow: `0 0 34px ${abilityDefinition.glow}, 0 18px 44px rgba(0,0,0,0.38)` } : undefined}
          >
            <div
              className="absolute inset-1 rounded-[18px]"
              style={{ background: `radial-gradient(circle at 50% 35%, ${abilityDefinition.glow}, transparent 48%), linear-gradient(180deg, rgba(15,23,42,0.1), rgba(0,0,0,0.48))` }}
            />
            <img
              src={abilityIconUrl}
              alt=""
              className="absolute h-[78%] w-[78%] object-contain opacity-30 grayscale [image-rendering:pixelated]"
              style={{ transform: `rotate(${abilityDefinition.iconRotationDegrees}deg)` }}
            />
            <img
              src={abilityIconUrl}
              alt=""
              className="absolute h-[78%] w-[78%] object-contain [image-rendering:pixelated]"
              style={{
                transform: `rotate(${abilityDefinition.iconRotationDegrees}deg)`,
                WebkitMaskImage: `conic-gradient(from 0deg, #000 0deg ${abilityRevealDegrees}deg, transparent ${abilityRevealDegrees}deg 360deg)`,
                maskImage: `conic-gradient(from 0deg, #000 0deg ${abilityRevealDegrees}deg, transparent ${abilityRevealDegrees}deg 360deg)`
              }}
            />
            {!abilityReady ? (
              <span className="absolute bottom-1.5 right-1.5 rounded-full border border-cyan-100/35 bg-slate-950/88 px-1.5 py-0.5 text-[10px] font-black text-cyan-100">
                {abilitySeconds}s
              </span>
            ) : (
              <span className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]" />
            )}
          </button>
        ) : null}
      </div>

      {!stats.isBossActive && (
        <div className="scicon-wave-progress pointer-events-auto absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center min-[520px]:flex sm:right-4">
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

      {fieldUpgradesEnabled ? (
        <div
          className="scicon-field-upgrades pointer-events-auto absolute right-2 z-20 flex w-[4.375rem] flex-col gap-1.5 sm:right-4"
          style={{ bottom: 'max(2.75rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))' }}
        >
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
          const displayedLevelLabel = type === 'fireRate'
            ? `T${getFireRateTier(displayedLevel)}-${getFireRateTierProgress(displayedLevel)}`
            : `L${displayedLevel}`;
          const accessibleLabel = isAtCap
            ? `${config.title} is at max level`
            : `Upgrade ${config.title} for ${flaskCost} flask${flaskCost === 1 ? '' : 's'}`;

          return (
            <button
              key={type}
              type="button"
              data-audio="none"
              onClick={() => {
                if (!canPick) return;
                onDisableLabGlow();
                onUpgrade(type);
              }}
              disabled={!canPick}
              className={`group relative flex h-[4.375rem] w-[4.375rem] items-center justify-center overflow-visible rounded-[10px] border p-0.5 shadow-[0_14px_38px_rgba(0,0,0,0.3)] backdrop-blur-md transition active:scale-95 ${
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
              {(isAtCap || !isLifeUpgrade) ? (
                <span className={`absolute -right-1.5 -top-1.5 z-20 flex items-center justify-center rounded-full border font-black ${
                  isAtCap
                    ? 'h-8 min-w-8 border-yellow-100/85 bg-yellow-300 px-1 text-[8px] text-slate-950 shadow-[0_0_18px_rgba(250,204,21,0.5)]'
                    : 'h-6 min-w-6 border-cyan-100/55 bg-slate-950 px-1 text-xs text-cyan-100'
                }`}>
                  {isAtCap ? 'MAX' : displayedLevelLabel}
                </span>
              ) : null}
              <span className="relative flex h-full w-full items-center justify-center">
                <FieldUpgradeSprite type={type} highlighted={highlighted} />
              </span>
            </button>
          );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default UIOverlay;
