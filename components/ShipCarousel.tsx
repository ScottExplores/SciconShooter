import React, { useEffect, useRef, useState } from 'react';
// REVAMP(H): Idle sprite playback follows the live reduced-motion preference.
import { useReducedMotion } from './revamp/UiMotion';
import {
  PLAYER_SHIP_MOTION,
  PLAYER_SHIP_SELECTION_FPS,
  type PlayerSteeringState,
  preloadPlayerShipCarouselFrames
} from '../services/playerShipMotion';
import {
  SHIP_CAROUSEL_MIN_DRAG_STEP_PX,
  getShipCarouselDragStep,
  resolveHeldCarouselDrag,
  resolveReleasedCarouselDrag
} from '../services/shipCarouselDrag';
import { type PlayerShipId } from '../services/playerShipService';

export type ShipCarouselDirection = -1 | 1;

type ShipCarouselFramePhase = 'edge' | 'bank' | 'crossing' | 'settle';

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
  originShipId: PlayerShipId;
  stepPx: number;
  horizontal: boolean;
};

export const SHIP_CAROUSEL_TRANSITION_MS = 540;
export const SHIP_CAROUSEL_BANK_PHASE_MS = 130;
export const SHIP_CAROUSEL_CROSSING_PHASE_MS = 285;
export const SHIP_CAROUSEL_SETTLE_PHASE_MS = 475;
export const SHIP_CAROUSEL_MAX_QUEUED_STEPS = 8;
export const SHIP_CAROUSEL_SNAP_MS = 210;

type ShipCarouselInteraction = 'idle' | 'pending' | 'timed' | 'drag' | 'snap';

export const getShipCarouselFramePair = (
  direction: ShipCarouselDirection,
  phase: ShipCarouselFramePhase
): { outgoing: PlayerSteeringState; incoming: PlayerSteeringState } => {
  if (direction === 1) {
    if (phase === 'edge') return { outgoing: 'neutral', incoming: 'hard-right' };
    if (phase === 'bank') return { outgoing: 'bank-left', incoming: 'bank-right' };
    if (phase === 'crossing') return { outgoing: 'hard-left', incoming: 'bank-right' };
    return { outgoing: 'hard-left', incoming: 'neutral' };
  }

  if (phase === 'edge') return { outgoing: 'neutral', incoming: 'hard-left' };
  if (phase === 'bank') return { outgoing: 'bank-right', incoming: 'bank-left' };
  if (phase === 'crossing') return { outgoing: 'hard-right', incoming: 'bank-left' };
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
  const reducedMotion = useReducedMotion();
  const [activeFrame, setActiveFrame] = useState<{ shipId: PlayerShipId; index: number }>(() => ({
    shipId,
    index: 0
  }));

  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    const frames = PLAYER_SHIP_MOTION[shipId].selectionIdleFrames;

    setActiveFrame({ shipId, index: 0 });
    if (steeringState || reducedMotion) {
      return () => { disposed = true; };
    }

    preloadPlayerShipCarouselFrames().then(() => {
      if (disposed) return;
      let frameIndex = 0;
      setActiveFrame({ shipId, index: frameIndex });
      timer = window.setInterval(() => {
        if (document.hidden) return;
        frameIndex = (frameIndex + 1) % frames.length;
        setActiveFrame({ shipId, index: frameIndex });
      }, 1000 / PLAYER_SHIP_SELECTION_FPS);
    });

    return () => {
      disposed = true;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [shipId, steeringState, reducedMotion]);

  const frameReady = activeFrame.shipId === shipId && activeFrame.index >= 0;
  const selectionFrame = reducedMotion ? 0 : activeFrame.index;
  const src = steeringState
    ? PLAYER_SHIP_MOTION[shipId].steeringFrames[steeringState]
    : frameReady
      ? PLAYER_SHIP_MOTION[shipId].selectionIdleFrames[selectionFrame]
      : PLAYER_SHIP_MOTION[shipId].selectionIdleFrames[0];

  return (
    <img
      src={src}
      alt=""
      className={className}
      draggable={false}
      data-player-ship={shipId}
      data-steering-state={steeringState ?? 'idle'}
      data-selection-frame={frameReady ? selectionFrame : 'preloading'}
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
  const [dragStepPx, setDragStepPx] = useState(SHIP_CAROUSEL_MIN_DRAG_STEP_PX);
  const [dragDirection, setDragDirection] = useState<ShipCarouselDirection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [scrubFocusedShipId, setScrubFocusedShipId] = useState(focusedShipId);
  const [framesReady, setFramesReady] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const revisionRef = useRef(0);
  const transitionRef = useRef<ShipCarouselTransition | null>(null);
  const focusedShipIdRef = useRef(focusedShipId);
  const queuedDirectionsRef = useRef<ShipCarouselDirection[]>([]);
  const transitionTimersRef = useRef<number[]>([]);
  const swipeGestureRef = useRef<ShipSwipeGesture | null>(null);
  const suppressTapRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const interactionRef = useRef<ShipCarouselInteraction>('idle');
  const snapTimerRef = useRef<number | undefined>(undefined);
  const snapAnimationFramesRef = useRef<number[]>([]);
  const pendingPointerEndRef = useRef<((event: PointerEvent) => void) | null>(null);

  const updateDragOffset = (nextOffset: number) => {
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  };

  const clearSnapWork = () => {
    if (snapTimerRef.current !== undefined) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = undefined;
    }
    snapAnimationFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    snapAnimationFramesRef.current = [];
  };

  const clearPendingPointerListeners = () => {
    const handler = pendingPointerEndRef.current;
    if (!handler) return;
    window.removeEventListener('pointerup', handler);
    window.removeEventListener('pointercancel', handler);
    pendingPointerEndRef.current = null;
  };

  useEffect(() => {
    let disposed = false;
    preloadPlayerShipCarouselFrames().then(() => {
      if (!disposed) setFramesReady(true);
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    focusedShipIdRef.current = focusedShipId;
    if (interactionRef.current === 'idle') setScrubFocusedShipId(focusedShipId);
  }, [focusedShipId]);

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
    queuedDirectionsRef.current = [];
    transitionRef.current = null;
    clearSnapWork();
    clearPendingPointerListeners();
    interactionRef.current = 'idle';
  }, []);

  const startShipTransition = (
    outgoingId: PlayerShipId,
    direction: ShipCarouselDirection
  ) => {
    const nextShipId = getLoopedShipId(shipIds, outgoingId, direction);
    const nextRevision = revisionRef.current + 1;
    revisionRef.current = nextRevision;

    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    transitionTimersRef.current = [];
    clearSnapWork();
    updateDragOffset(0);
    setDragDirection(null);
    setIsDragging(false);
    setIsSnapping(false);
    interactionRef.current = 'timed';

    if (prefersReducedMotion) {
      focusedShipIdRef.current = nextShipId;
      setScrubFocusedShipId(nextShipId);
      onFocusShip(nextShipId);
      onSettleShip(nextShipId);
      const queuedDirection = queuedDirectionsRef.current.shift();
      if (queuedDirection !== undefined) startShipTransition(nextShipId, queuedDirection);
      else interactionRef.current = 'idle';
      return;
    }

    const nextTransition: ShipCarouselTransition = {
      outgoingId,
      incomingId: nextShipId,
      direction,
      framePhase: 'edge',
      revision: nextRevision
    };
    transitionRef.current = nextTransition;
    focusedShipIdRef.current = nextShipId;
    setScrubFocusedShipId(nextShipId);
    setTransition(nextTransition);
    onFocusShip(nextShipId);

    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision
        ? { ...current, framePhase: 'bank' }
        : current);
    }, SHIP_CAROUSEL_BANK_PHASE_MS));
    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision
        ? { ...current, framePhase: 'crossing' }
        : current);
    }, SHIP_CAROUSEL_CROSSING_PHASE_MS));
    transitionTimersRef.current.push(window.setTimeout(() => {
      setTransition((current) => current?.revision === nextRevision
        ? { ...current, framePhase: 'settle' }
        : current);
    }, SHIP_CAROUSEL_SETTLE_PHASE_MS));
    transitionTimersRef.current.push(window.setTimeout(() => {
      if (transitionRef.current?.revision !== nextRevision) return;
      onSettleShip(nextShipId);

      const queuedDirection = queuedDirectionsRef.current.shift();
      if (queuedDirection !== undefined) {
        startShipTransition(nextShipId, queuedDirection);
        return;
      }

      transitionRef.current = null;
      transitionTimersRef.current = [];
      interactionRef.current = 'idle';
      setTransition(null);
    }, SHIP_CAROUSEL_TRANSITION_MS));
  };

  const cycleShip = (direction: ShipCarouselDirection) => {
    if (!framesReady || shipIds.length < 2) return;
    if (interactionRef.current === 'pending'
      || interactionRef.current === 'drag'
      || interactionRef.current === 'snap') return;
    if (interactionRef.current === 'timed' || transitionRef.current) {
      if (queuedDirectionsRef.current.length < SHIP_CAROUSEL_MAX_QUEUED_STEPS) {
        queuedDirectionsRef.current.push(direction);
      }
      return;
    }
    startShipTransition(focusedShipIdRef.current, direction);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || !framesReady || shipIds.length < 2) return;
    if (interactionRef.current !== 'idle') return;
    if (swipeGestureRef.current !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const stepPx = getShipCarouselDragStep(event.currentTarget.getBoundingClientRect().width);
    suppressTapRef.current = false;
    interactionRef.current = 'pending';
    clearPendingPointerListeners();
    const pointerId = event.pointerId;
    const clearPendingContact = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId !== pointerId) return;
      clearPendingPointerListeners();
      const activeGesture = swipeGestureRef.current;
      if (!activeGesture || activeGesture.pointerId !== pointerId || activeGesture.horizontal) return;
      swipeGestureRef.current = null;
      interactionRef.current = 'idle';
      setDragDirection(null);
    };
    pendingPointerEndRef.current = clearPendingContact;
    window.addEventListener('pointerup', clearPendingContact);
    window.addEventListener('pointercancel', clearPendingContact);
    setDragStepPx(stepPx);
    setScrubFocusedShipId(focusedShipIdRef.current);
    swipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      latestX: event.clientX,
      latestY: event.clientY,
      originShipId: focusedShipIdRef.current,
      stepPx,
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
      if (interactionRef.current !== 'pending' || transitionRef.current) {
        swipeGestureRef.current = null;
        interactionRef.current = transitionRef.current ? 'timed' : 'idle';
        return;
      }
      gesture.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      interactionRef.current = 'drag';
      setIsDragging(true);
      suppressTapRef.current = true;
    }
    if (!gesture.horizontal) return;

    event.preventDefault();
    const resolution = resolveHeldCarouselDrag(
      shipIds,
      gesture.originShipId,
      deltaX,
      gesture.stepPx
    );
    if (resolution.focusedItemId !== focusedShipIdRef.current) {
      focusedShipIdRef.current = resolution.focusedItemId;
      setScrubFocusedShipId(resolution.focusedItemId);
      onFocusShip(resolution.focusedItemId);
    }
    updateDragOffset(resolution.remainderX);
    if (deltaX !== 0) setDragDirection(deltaX < 0 ? 1 : -1);
  };

  const snapToFocusedShip = (
    finalShipId: PlayerShipId,
    remainderX: number,
    direction: ShipCarouselDirection
  ) => {
    clearSnapWork();
    focusedShipIdRef.current = finalShipId;
    setScrubFocusedShipId(finalShipId);
    onFocusShip(finalShipId);
    setDragDirection(direction);
    updateDragOffset(remainderX);
    setIsDragging(false);

    const finishSnap = () => {
      clearSnapWork();
      updateDragOffset(0);
      setDragDirection(null);
      setIsDragging(false);
      setIsSnapping(false);
      interactionRef.current = 'idle';
      onSettleShip(finalShipId);
    };

    if (prefersReducedMotion || Math.abs(remainderX) < 0.5) {
      finishSnap();
      return;
    }

    interactionRef.current = 'snap';
    setIsSnapping(true);
    const firstFrame = window.requestAnimationFrame(() => {
      const secondFrame = window.requestAnimationFrame(() => updateDragOffset(0));
      snapAnimationFramesRef.current.push(secondFrame);
    });
    snapAnimationFramesRef.current.push(firstFrame);
    snapTimerRef.current = window.setTimeout(finishSnap, SHIP_CAROUSEL_SNAP_MS + 40);
  };

  const finishPointerGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled = false
  ) => {
    const gesture = swipeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    swipeGestureRef.current = null;
    clearPendingPointerListeners();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!gesture.horizontal) {
      interactionRef.current = 'idle';
      setDragDirection(null);
      return;
    }

    const deltaX = gesture.latestX - gesture.startX;
    const direction: ShipCarouselDirection = deltaX <= 0 ? 1 : -1;
    const resolution = cancelled
      ? resolveHeldCarouselDrag(shipIds, gesture.originShipId, deltaX, gesture.stepPx)
      : resolveReleasedCarouselDrag(shipIds, gesture.originShipId, deltaX, gesture.stepPx);

    suppressTapRef.current = true;
    snapToFocusedShip(resolution.focusedItemId, resolution.remainderX, direction);
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
  const isScrubbing = !prefersReducedMotion
    && !transition
    && (isDragging || isSnapping)
    && dragDirection !== null;
  const displayFocusedShipId = isScrubbing ? scrubFocusedShipId : focusedShipId;
  const focusedShipLocked = isShipLocked(displayFocusedShipId);
  const getScrubSteeringState = (offsetX: number): PlayerSteeringState => {
    const positionProgress = Math.min(1, Math.abs(offsetX) / Math.max(1, dragStepPx));
    if (positionProgress < 0.18) return 'neutral';
    if (positionProgress < 0.58) return offsetX < 0 ? 'bank-left' : 'bank-right';
    return offsetX < 0 ? 'hard-left' : 'hard-right';
  };
  const getScrubItemStyle = (offsetX: number) => {
    const distance = Math.min(1, Math.abs(offsetX) / Math.max(1, dragStepPx));
    return {
      '--sci-ship-drag-x': `${offsetX}px`,
      '--sci-ship-drag-y': `${-3 - distance * 9}%`,
      '--sci-ship-drag-scale': `${1 - distance * 0.18}`,
      '--sci-ship-drag-opacity': `${1 - distance * 0.78}`
    } as React.CSSProperties;
  };
  const scrubItems = isScrubbing && dragDirection !== null
    ? [
      {
        shipId: getLoopedShipId(shipIds, displayFocusedShipId, -1),
        role: 'outgoing' as const,
        offsetX: dragOffset - dragStepPx,
        steeringState: getScrubSteeringState(dragOffset - dragStepPx)
      },
      {
        shipId: displayFocusedShipId,
        role: 'active' as const,
        offsetX: dragOffset,
        steeringState: isSnapping ? null : getScrubSteeringState(dragOffset)
      },
      {
        shipId: getLoopedShipId(shipIds, displayFocusedShipId, 1),
        role: 'incoming' as const,
        offsetX: dragOffset + dragStepPx,
        steeringState: getScrubSteeringState(dragOffset + dragStepPx)
      }
    ]
    : [];

  return (
    <div className={`sci-rh-ship sci-ship-carousel ${compact ? 'sci-rh-ship--compact sci-ship-carousel--compact' : ''}`}>
      <button
        type="button"
        onClick={() => cycleShip(-1)}
        disabled={!framesReady}
        className="sci-ship-carousel-control sci-ship-carousel-control--left"
        aria-label="Previous ship"
      >
        {previousIcon}
      </button>

      <div
        className={`sci-ship-carousel-stage ${isDragging ? 'sci-ship-carousel-stage--dragging' : ''} ${isSnapping ? 'sci-ship-carousel-stage--snapping' : ''}`}
        role="group"
        tabIndex={0}
        aria-live="polite"
        aria-busy={Boolean(transition) || isSnapping}
        aria-label="Ship selection. Swipe or use the arrow keys to change ships."
        data-focused-ship={displayFocusedShipId}
        data-dragging={isDragging ? 'true' : 'false'}
        data-snapping={isSnapping ? 'true' : 'false'}
        data-drag-offset={Math.round(dragOffset)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerGesture(event)}
        onPointerCancel={(event) => finishPointerGesture(event, true)}
        onLostPointerCapture={(event) => finishPointerGesture(event, true)}
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

        {isScrubbing ? scrubItems.map((item) => {
          const itemLocked = isShipLocked(item.shipId);
          return (
            <span
              key={`scrub-${item.shipId}`}
              className={`sci-ship-carousel-item sci-ship-carousel-item--scrubbing sci-ship-carousel-item--scrub-${item.role} ${item.role === 'active' ? 'sci-ship-carousel-item--active' : ''} ${itemLocked ? 'sci-ship-carousel-item--locked' : ''}`}
              style={getScrubItemStyle(item.offsetX)}
              aria-hidden={item.role === 'active' ? undefined : true}
              data-carousel-role={item.role}
            >
              <span className="sci-rh-ship-core sci-ship-carousel-core">
                <PlayerShipSelectionImage
                  shipId={item.shipId}
                  steeringState={item.steeringState}
                  className={item.shipId === 'researchhub' ? 'sci-ship-carousel-image--researchhub' : 'sci-ship-carousel-image--pixel'}
                />
              </span>
              {item.role === 'active' && itemLocked ? (
                <span className="sci-ship-carousel-lock" aria-hidden="true">
                  {lockIcon}
                </span>
              ) : null}
            </span>
          );
        }) : (
          <button
            type="button"
            key={`${compact ? 'compact' : 'full'}-${transition?.revision ?? revisionRef.current}`}
            className={`sci-ship-carousel-item sci-ship-carousel-item--active ${transition ? `sci-ship-carousel-item--incoming ${transitionDirectionClass}` : ''} ${focusedShipLocked ? 'sci-ship-carousel-item--locked' : ''}`}
            onClick={() => {
              if (suppressTapRef.current || transition || isSnapping) {
                suppressTapRef.current = false;
                return;
              }
              onActivateFocusedShip();
            }}
            aria-label={getShipAriaLabel(displayFocusedShipId)}
            aria-disabled={transition || isSnapping ? true : undefined}
          >
            <span className="sci-rh-ship-core sci-ship-carousel-core">
              <PlayerShipSelectionImage
                shipId={displayFocusedShipId}
                steeringState={transitionFrames?.incoming ?? null}
                className={displayFocusedShipId === 'researchhub' ? 'sci-ship-carousel-image--researchhub' : 'sci-ship-carousel-image--pixel'}
              />
            </span>
            {focusedShipLocked ? (
              <span
                key={`${displayFocusedShipId}-${lockNudgeRevision}`}
                className={`sci-ship-carousel-lock ${lockNudgeRevision > 0 ? 'sci-ship-carousel-lock--nudged' : ''}`}
                aria-hidden="true"
              >
                {lockIcon}
              </span>
            ) : null}
          </button>
        )}

        {focusedShipLocked ? (
          <p className="sci-ship-carousel-status">{getLockedMessage(displayFocusedShipId)}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => cycleShip(1)}
        disabled={!framesReady}
        className="sci-ship-carousel-control sci-ship-carousel-control--right"
        aria-label="Next ship"
      >
        {nextIcon}
      </button>
    </div>
  );
};

export default ShipCarousel;
