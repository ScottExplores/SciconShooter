import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type PlayerShipId, PLAYER_SHIPS } from '../services/playerShipService';
import {
  PLAYER_SHIP_MOTION,
  PLAYER_SHIP_SELECTION_FPS
} from '../services/playerShipMotion';
import {
  getPlayerWeaponPreviewActiveVolleyLimit,
  getPlayerWeaponPreviewFrames,
  getPlayerWeaponPreviewShots,
  getPlayerWeaponPreviewVolleyIntervalMs,
  getPlayerWeaponPreviewVolleyLifetimeMs,
  PLAYER_SHIP_WEAPON_PREVIEW_SPECS,
  PLAYER_WEAPON_PREVIEW_FLIGHT_MS,
  PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX
} from '../services/playerWeaponPreview';
import { getFireRateTier } from '../services/weaponTierProgression';
import { preloadDecodedImageUrls } from '../services/browserImagePreload';
import PixelActionButton from './PixelActionButton';

interface ShipWeaponPreviewDialogProps {
  shipId: PlayerShipId | null;
  fireRateLevel: number;
  selected: boolean;
  onClose: () => void;
  onSelect: (shipId: PlayerShipId) => void;
}

type PreviewShotStyle = React.CSSProperties & {
  '--shot-start-x': string;
  '--shot-travel-x': string;
  '--shot-static-x': string;
  '--shot-angle': string;
  '--shot-delay': string;
  '--shot-flight-ms': string;
  '--shot-travel-y': string;
};

interface ActivePreviewVolley {
  readonly id: number;
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const STATIC_PREVIEW_VOLLEYS: readonly ActivePreviewVolley[] = Object.freeze([{ id: 0 }]);

const readReducedMotionPreference = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(REDUCED_MOTION_QUERY).matches
);

const usePrefersReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  return reducedMotion;
};

const getFocusableElements = (dialog: HTMLElement | null) => Array.from(
  dialog?.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  ) ?? []
);

const ShipWeaponPreviewDialog: React.FC<ShipWeaponPreviewDialogProps> = ({
  shipId,
  fireRateLevel,
  selected,
  onClose,
  onSelect
}) => {
  const [shipFrame, setShipFrame] = useState(0);
  const [activeVolleys, setActiveVolleys] = useState<readonly ActivePreviewVolley[]>([]);
  const volleyIdRef = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const shots = useMemo(() => (
    shipId ? getPlayerWeaponPreviewShots(shipId, fireRateLevel) : []
  ), [fireRateLevel, shipId]);
  const projectileFrames = useMemo(() => (
    shipId ? getPlayerWeaponPreviewFrames(shipId) : []
  ), [shipId]);
  const volleyIntervalMs = getPlayerWeaponPreviewVolleyIntervalMs(fireRateLevel, shipId ?? 'researchhub');
  const volleyLifetimeMs = getPlayerWeaponPreviewVolleyLifetimeMs(shots);
  const activeVolleyLimit = getPlayerWeaponPreviewActiveVolleyLimit(fireRateLevel, shots, shipId ?? 'researchhub');

  useEffect(() => {
    if (!shipId) return undefined;
    setShipFrame(0);
    void preloadDecodedImageUrls([
      ...getPlayerWeaponPreviewFrames(shipId),
      ...PLAYER_SHIP_MOTION[shipId].selectionIdleFrames
    ]).catch(() => undefined);

    return undefined;
  }, [shipId]);

  useEffect(() => {
    if (!shipId || reducedMotion) {
      setShipFrame(0);
      return undefined;
    }

    const shipTimer = window.setInterval(() => {
      setShipFrame((current) => (
        (current + 1) % PLAYER_SHIP_MOTION[shipId].selectionIdleFrames.length
      ));
    }, 1000 / PLAYER_SHIP_SELECTION_FPS);

    return () => {
      window.clearInterval(shipTimer);
    };
  }, [reducedMotion, shipId]);

  useEffect(() => {
    if (!shipId || reducedMotion) {
      setActiveVolleys([]);
      return undefined;
    }

    let disposed = false;
    const cleanupTimers = new Set<number>();
    setActiveVolleys([]);

    const launchVolley = () => {
      if (disposed) return;
      const id = ++volleyIdRef.current;
      setActiveVolleys((current) => (
        [...current, { id }].slice(-activeVolleyLimit)
      ));
      const cleanupTimer = window.setTimeout(() => {
        cleanupTimers.delete(cleanupTimer);
        if (disposed) return;
        setActiveVolleys((current) => current.filter((volley) => volley.id !== id));
      }, volleyLifetimeMs);
      cleanupTimers.add(cleanupTimer);
    };

    launchVolley();
    const volleyTimer = window.setInterval(launchVolley, volleyIntervalMs);

    return () => {
      disposed = true;
      window.clearInterval(volleyTimer);
      cleanupTimers.forEach((timer) => window.clearTimeout(timer));
      cleanupTimers.clear();
    };
  }, [activeVolleyLimit, reducedMotion, shipId, volleyIntervalMs, volleyLifetimeMs]);

  useEffect(() => {
    if (!shipId) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (previousFocus && document.body.contains(previousFocus)) previousFocus.focus();
    };
  }, [shipId]);

  if (!shipId) return null;

  const ship = PLAYER_SHIPS[shipId];
  const shipFrames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;
  const projectileFrame = projectileFrames[projectileFrames.length - 1];
  const displayedVolleys = reducedMotion ? STATIC_PREVIEW_VOLLEYS : activeVolleys;
  const titleId = `sci-weapon-preview-title-${shipId}`;
  const descriptionId = `sci-weapon-preview-description-${shipId}`;
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-black/88 backdrop-blur-sm"
        onClick={onClose}
        aria-label={`Close ${ship.name} weapon preview`}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-testid="ship-weapon-preview-dialog"
        data-ship-id={shipId}
        onKeyDown={handleKeyDown}
        className="custom-scrollbar relative z-10 max-h-[calc(100svh-1.5rem)] w-full max-w-md overflow-y-auto overscroll-contain border border-cyan-200/40 bg-[#030817] p-3 shadow-[0_0_56px_rgba(34,211,238,0.3)] sm:p-4"
      >
        <header className="flex items-start justify-between gap-3 border-b border-cyan-200/16 pb-3">
          <div className="min-w-0">
            <p className="font-mono text-[0.58rem] font-black uppercase tracking-[0.16em] text-cyan-200">Weapon simulation</p>
            <h2 id={titleId} className="mt-1 text-lg font-black uppercase leading-tight text-white sm:text-xl">
              {ship.name} firing preview
            </h2>
            <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-yellow-200">
              Primary weapon · Tier {getFireRateTier(fireRateLevel)}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="sci-icon-button min-h-11 min-w-11 shrink-0"
            aria-label={`Close ${ship.name} weapon preview`}
          >
            <span aria-hidden="true" className="text-lg leading-none">X</span>
          </button>
        </header>

        <div
          className="sci-hangar-weapon-preview relative mx-auto mt-3 aspect-[4/5] w-full max-w-[18rem] overflow-hidden border border-cyan-200/22 bg-[#020617]"
          data-preview-weapon={shipId}
          data-active-volleys={displayedVolleys.length}
          data-reduced-motion={reducedMotion ? 'true' : 'false'}
          aria-label={`${ship.name} repeatedly firing its primary weapon pattern`}
        >
          <div className="sci-hangar-weapon-preview__stars" aria-hidden="true" />
          <div className="sci-hangar-weapon-preview__target" aria-hidden="true">
            <span />
          </div>
          {displayedVolleys.flatMap((volley) => shots.map((shot) => {
              const shotStyle: PreviewShotStyle = {
                '--shot-start-x': `${shot.startX}px`,
                '--shot-travel-x': `${shot.travelX}px`,
                '--shot-static-x': `${shot.travelX * 0.46}px`,
                '--shot-angle': `${shot.angleDegrees}deg`,
                '--shot-delay': `${shot.delayMs}ms`,
                '--shot-flight-ms': `${PLAYER_WEAPON_PREVIEW_FLIGHT_MS}ms`,
                '--shot-travel-y': `-${PLAYER_WEAPON_PREVIEW_TRAVEL_DISTANCE_PX}px`
              };
              return (
                <img
                  key={`${volley.id}:${shot.id}`}
                  src={projectileFrame}
                  alt=""
                  draggable={false}
                  className="sci-hangar-weapon-preview__shot"
                  style={shotStyle}
                  aria-hidden="true"
                />
              );
            }))}
          <div className="sci-hangar-weapon-preview__ship-aura" aria-hidden="true" />
          <img
            src={shipFrames[shipFrame % shipFrames.length]}
            alt=""
            draggable={false}
            className="sci-hangar-weapon-preview__ship"
            aria-hidden="true"
          />
          <div className="sci-hangar-weapon-preview__deck" aria-hidden="true" />
        </div>

        <div className="mt-3 border border-cyan-200/18 bg-cyan-300/5 px-3 py-2.5">
          <p className="text-[0.56rem] font-black uppercase tracking-[0.14em] text-cyan-200">Fire pattern</p>
          <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-slate-200">
            {PLAYER_SHIP_WEAPON_PREVIEW_SPECS[shipId]}
          </p>
        </div>

        <div className="mt-3 grid gap-2 min-[390px]:grid-cols-2">
          <PixelActionButton
            type="button"
            tone="cyan"
            onClick={onClose}
            className="min-h-11 px-3 text-[0.68rem] font-black uppercase"
          >
            Back to fleet
          </PixelActionButton>
          <PixelActionButton
            type="button"
            tone={selected ? 'neutral' : 'green'}
            disabled={selected}
            shine={!selected}
            onClick={() => {
              onSelect(shipId);
              onClose();
            }}
            className="min-h-11 px-3 text-[0.68rem] font-black uppercase"
          >
            {selected ? 'Currently equipped' : `Equip ${ship.name.replace(/ ship$/i, '')}`}
          </PixelActionButton>
        </div>
      </section>
    </div>
  );
};

export default ShipWeaponPreviewDialog;
