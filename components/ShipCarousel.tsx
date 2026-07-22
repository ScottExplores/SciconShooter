import React, { useEffect, useRef, useState } from 'react';
import {
  PLAYER_SHIP_MOTION,
  PLAYER_SHIP_SELECTION_FPS,
  type PlayerSteeringState,
  preloadPlayerShipCarouselFrames
} from '../services/playerShipMotion';
import { PLAYER_SHIPS, type PlayerShipId } from '../services/playerShipService';

export type ShipCarouselDirection = -1 | 1;

type ShipCarouselFramePhase = 'edge' | 'bank' | 'center';

type ShipCarouselTransition = {
  outgoingId: PlayerShipId;
  incomingId: PlayerShipId;
  direction: ShipCarouselDirection;
  framePhase: ShipCarouselFramePhase;
  revision: number;
};

type ShipSwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  latestX: number;
  latestY: number;
  startedAt: number;
  horizontal: boolean;
};

export const SHIP_CAROUSEL_TRANSITION_MS = 540;
export const SHIP_CAROUSEL_BANK_PHASE_MS = 150;
export const SHIP_CAROUSEL_SETTLE_PHASE_MS = 370;

const SHIP_SWIPE_MIN_DISTANCE = 42;
const SHIP_SWIPE_MIN_VELOCITY_DISTANCE = 28;
const SHIP_SWIPE_MAX_VELOCITY_MS = 420;
const SHIP_SWIPE_MAX_PREVIEW_PX = 72;

export const getShipCarouselFramePair = (
  direction: ShipCarouselDirection,
  phase: ShipCarouselFramePhase
): { outgoing: PlayerSteeringState; incoming: PlayerSteeringState } => {
  if (direction === 1) {
    if (phase === 'edge') return { outgoing: 'neutral', incoming: 'hard-right' };
    if (phase === 'bank') return { outgoing: 'bank-left', incoming: 'bank-right' };
    return { outgoing: 'hard-left', incoming: 'neutral' };
  }

  if (phase === 'edge') return { outgoing: 'neutral', incoming: 'hard-left' };
  if (phase === 'bank') return { outgoing: 'bank-right', incoming: 'bank-left' };
  return { outgoing: 'hard-right', incoming: 'neutral' };
};

export const getLoopedShipId = (
  shipIds: readonly PlayerShipId[],
  focusedShipId: PlayerShipId,
  direction: ShipCarouselDirection
) => {
  const currentIndex = Math.max(0, shipIds.indexOf(focusedShipId));
  return shipIds[(currentIndex + direction + shipIds.length) % shipIds.length];
};

const PlayerShipSelectionImage = ({
  shipId,
  className,
  steeringState = null
}: {
  shipId: PlayerShipId;
  className: string;
  steeringState?: PlayerSteeringState | null;
}) => {
  const [activeFrame, setActiveFrame] = useState<{ shipId: PlayerShipId | null; index: number }>({
    shipId: null,
    index: -1
  });

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const frames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;

    setActiveFrame({ shipId: null, index: -1 });
    preloadPlayerShipCarouselFrames().then(() => {
      if (disposed) return;
      let frameIndex = 0;
      setActiveFrame({ shipId, index: frameIndex });
      timer = window.setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        setActiveFrame({ shipId, index: frameIndex });
      }, 1000 / PLAYER_SHIP_SELECTION_FPS);
    });

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [shipId]);

  const frameReady = activeFrame.shipId === shipId && activeFrame.index >= 0;
  const src = steeringState
    ? PLAYER_SHIP_MOTION[shipId].steeringFrames[steeringState]
    : frameReady
      ? PLAYER_SHIP_MOTION[shipId].selectionIdleFrames[activeFrame.index]
      : PLAYER_SHIPS[shipId].assetUrl;

  return (
    <img
      src={src}
      alt=""
      className={className}
      draggable={false}
      data-player-ship={shipId}
      data-steering-state={steeringState ?? 'idle'}
      data-selection-frame={frameReady ? activeFrame.index : 'preloading'}
    />
  );
};

interface ShipCarouselProps {
  shipIds: readonly PlayerShipId[];
  focusedShipId: PlayerShipId;
  compact?: boolean;
  isShipLocked: (shipId: PlayerShipId) => boolean;
  getShipAriaLabel: (shipId: PlayerShipId) => string;
  getLockedMessage: (shipId: PlayerShipId) => string;
  onFocusShip: (shipId: PlayerShipId) => void;
  onSettleShip: (shipId: PlayerShipId) => void;
  onActivateFocusedShip: () => void;
  previousIcon: React.ReactNode;
  nextIcon: React.ReactNode;
  lockIcon: React.ReactNode;
  lockNudgeRevision?: number;
}

/**
 * A bank-frame carousel: two ships travel concurrently along a shallow oval,
 * using authored left/right sprites rather than rotating a static image.
 */
const ShipCarousel: React.FC<ShipCarouselProps> = ({
  shipIds,
  focusedShipId,
  compact = false,
  isShipLocked,
  getShipAriaLabel,
  getLockedMessage,
  onFocusShip,
  onSettleShip,
  onActivateFocusedShip,
  previousIcon,
  nextIcon,
  lockIcon,
  lockNudgeRevision = 0
}) => {
  const [transition, setTransition] = useState<ShipCarouselTransition | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [framesReady, setFramesReady] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const revisionRef = useRef(0);
  const transitionTimersRef = useRef<number[]>([]);
  const swipeGestureRef = useRef<ShipSwipeGesture | null>(null);
  const suppressTapRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    preloadPlayerShipCarouselFrames().then(() => {
      if (!disposed) setFramesReady(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const syncPreference = () => setPrefersReducedMotion(query.matches);
    query.addEventListener?.('change', syncPreference);
    return () => query.removeEventListener?.('change', syncPreference);
  }, []);

  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
  }, []);

  const cycleShip = (direction: ShipCarouselDirection) => {
    if (transition || !framesReady || shipIds.length < 2) return;
    const nextShipId = getLoopedShipId(shipIds, focusedShipId, direction);
    const nextRevision = revisionRef.current + 1;
    revisionRef.current = nextRevision;

    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    setDragOffset(0);

    if (prefersReducedMotion) {
      onFocusShip(nextShipId);
      onSettleShip(nextShipId);
      return;
    }

    setTransition({
      outgoingId: focusedShipId,
      incomingId: nextShipId,
      direction,
      framePhase: 'edge',
      revision: nextRevision
    });
    onFocusShip(nextShipId);

    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision
        ? { ...current, framePhase: 'bank' }
        : current);
    }, SHIP_CAROUSEL_BANK_PHASE_MS));
    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision
        ? { ...current, framePhase: 'center' }
        : current);
    }, SHIP_CAROUSEL_SETTLE_PHASE_MS));
    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision ? null : current);
      transitionTimersRef.current = [];
      onSettleShip(nextShipId);
    }, SHIP_CAROUSEL_TRANSITION_MS));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || transition || !framesReady) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    suppressTapRef.current = false;
    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      latestX: event.clientX,
      latestY: event.clientY,
      startedAt: performance.now(),
      horizontal: false
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    gesture.latestX = event.clientX;
    gesture.latestY = event.clientY;
    const deltaX = gesture.latestX - gesture.startX;
    const deltaY = gesture.latestY - gesture.startY;
    if (!gesture.horizontal && Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      gesture.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!gesture.horizontal) return;

    event.preventDefault();
    setDragOffset(Math.max(-SHIP_SWIPE_MAX_PREVIEW_PX, Math.min(SHIP_SWIPE_MAX_PREVIEW_PX, deltaX)));
  };

  const finishPointerGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    swipeGestureRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const deltaX = gesture.latestX - gesture.startX;
    const elapsed = performance.now() - gesture.startedAt;
    const isSwipe = !cancelled
      && gesture.horizontal
      && (Math.abs(deltaX) >= SHIP_SWIPE_MIN_DISTANCE
        || (Math.abs(deltaX) >= SHIP_SWIPE_MIN_VELOCITY_DISTANCE && elapsed <= SHIP_SWIPE_MAX_VELOCITY_MS));

    setDragOffset(0);
    if (!isSwipe) return;

    suppressTapRef.current = true;
    cycleShip(deltaX < 0 ? 1 : -1);
    window.setTimeout(() => { suppressTapRef.current = false; }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    cycleShip(event.key === 'ArrowLeft' ? -1 : 1);
  };

  const transitionDirectionClass = transition?.direction === 1
    ? 'sci-ship-carousel-item--next'
    : 'sci-ship-carousel-item--previous';
  const transitionFrames = transition
    ? getShipCarouselFramePair(transition.direction, transition.framePhase)
    : null;
  const dragFrame: PlayerSteeringState | null = prefersReducedMotion || dragOffset === 0
    ? null
    : dragOffset < 0 ? 'bank-left' : 'bank-right';
  const focusedShipLocked = isShipLocked(focusedShipId);

  return (
    <div className={`sci-rh-ship sci-ship-carousel ${compact ? 'sci-rh-ship--compact sci-ship-carousel--compact' : ''}`}>
      <button
        type="button"
        onClick={() => cycleShip(-1)}
        disabled={Boolean(transition) || !framesReady}
        className="sci-ship-carousel-control sci-ship-carousel-control--left"
        aria-label="Previous ship"
      >
        {previousIcon}
      </button>

      <div
        className={`sci-ship-carousel-stage ${dragOffset !== 0 ? 'sci-ship-carousel-stage--dragging' : ''}`}
        style={{ '--sci-ship-drag-x': `${dragOffset}px` } as React.CSSProperties}
        role="group"
        tabIndex={0}
        aria-live="polite"
        aria-label="Ship selection. Swipe or use the arrow keys to change ships."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        onKeyDown={handleKeyDown}
      >
        {transition ? (
          <span
            key={`outgoing-${transition.revision}-${transition.outgoingId}`}
            className={`sci-ship-carousel-item sci-ship-carousel-item--outgoing ${transitionDirectionClass}`}
            aria-hidden="true"
          >
            <span className="sci-rh-ship-core sci-ship-carousel-core">
              <PlayerShipSelectionImage
                shipId={transition.outgoingId}
                steeringState={transitionFrames?.outgoing}
                className={transition.outgoingId === 'researchhub' ? 'sci-ship-carousel-image--researchhub' : 'sci-ship-carousel-image--pixel'}
              />
            </span>
          </span>
        ) : null}

        <button
          type="button"
          key={`${compact ? 'compact' : 'full'}-${transition?.revision ?? revisionRef.current}`}
          className={`sci-ship-carousel-item sci-ship-carousel-item--active ${transition ? `sci-ship-carousel-item--incoming ${transitionDirectionClass}` : ''} ${focusedShipLocked ? 'sci-ship-carousel-item--locked' : ''}`}
          onClick={() => {
            if (suppressTapRef.current || transition) {
              suppressTapRef.current = false;
              return;
            }
            onActivateFocusedShip();
          }}
          aria-label={getShipAriaLabel(focusedShipId)}
          aria-disabled={transition ? true : undefined}
        >
          <span className="sci-rh-ship-core sci-ship-carousel-core">
            <PlayerShipSelectionImage
              shipId={focusedShipId}
              steeringState={transitionFrames?.incoming ?? dragFrame}
              className={focusedShipId === 'researchhub' ? 'sci-ship-carousel-image--researchhub' : 'sci-ship-carousel-image--pixel'}
            />
          </span>
          {focusedShipLocked ? (
            <span
              key={`${focusedShipId}-${lockNudgeRevision}`}
              className={`sci-ship-carousel-lock ${lockNudgeRevision > 0 ? 'sci-ship-carousel-lock--nudged' : ''}`}
              aria-hidden="true"
            >
              {lockIcon}
            </span>
          ) : null}
        </button>

        {focusedShipLocked ? (
          <p className="sci-ship-carousel-status">{getLockedMessage(focusedShipId)}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => cycleShip(1)}
        disabled={Boolean(transition) || !framesReady}
        className="sci-ship-carousel-control sci-ship-carousel-control--right"
        aria-label="Next ship"
      >
        {nextIcon}
      </button>
    </div>
  );
};

export default ShipCarousel;
