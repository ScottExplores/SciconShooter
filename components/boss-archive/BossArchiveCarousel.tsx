import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getBossArchiveRelativePosition,
  getLoopedBossArchiveIndex,
  type BossArchiveViewEntry
} from './BossArchiveModel';
import BossArchivePortrait from './BossArchivePortrait';

const DRAG_THRESHOLD_PX = 42;
const WHEEL_COOLDOWN_MS = 320;
const ART_RENDER_RADIUS = 2;
const ART_PRELOAD_RADIUS = ART_RENDER_RADIUS + 1;

const BossPreviewArt = ({
  item,
  selected,
  eager
}: {
  item: BossArchiveViewEntry;
  selected: boolean;
  eager: boolean;
}) => {
  if (!item.unlocked) return (
    <div className="boss-archive-carousel__unknown" aria-hidden="true">
      <i />
      <span>?</span>
    </div>
  );
  return (
    <BossArchivePortrait
      entry={item.entry}
      portraitUrl={item.presentation.portraitUrl ?? item.entry.artUrl}
      eager={eager}
      className="boss-archive-carousel__portrait"
      idlePreview={selected ? 'active' : 'static'}
    />
  );
};

export interface BossArchiveCarouselProps {
  readonly items: readonly BossArchiveViewEntry[];
  readonly selectedIndex: number;
  readonly onSelectIndex: (index: number) => void;
  readonly onOpenIndex: () => void;
}

/**
 * Lightweight DOM cover-flow. It never mounts a gameplay renderer or advances
 * combat frames; the selected intact portrait receives only a gentle CSS hover.
 */
const BossArchiveCarousel: React.FC<BossArchiveCarouselProps> = ({
  items,
  selectedIndex,
  onSelectIndex,
  onOpenIndex
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    horizontal: boolean;
  } | null>(null);
  const lastWheelAtRef = useRef(0);
  const selectedIndexRef = useRef(selectedIndex);
  const onSelectIndexRef = useRef(onSelectIndex);
  const preloadedArtRef = useRef(new Map<string, HTMLImageElement>());
  const suppressClickRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  selectedIndexRef.current = selectedIndex;
  onSelectIndexRef.current = onSelectIndex;

  const stepPx = Math.max(138, Math.min(240, (viewportRef.current?.clientWidth ?? 390) * 0.53));
  const selectedItem = items[selectedIndex];

  useEffect(() => {
    const urls = new Set<string>();
    items.forEach((item, index) => {
      if (!item.unlocked) return;
      const relative = getBossArchiveRelativePosition(index, selectedIndex, items.length);
      if (Math.abs(relative) > ART_PRELOAD_RADIUS) return;
      urls.add(item.presentation.portraitUrl ?? item.entry.artUrl);
      item.entry.preview.composition?.layers.forEach((layer) => urls.add(layer.url));
    });
    urls.forEach((url) => {
      if (preloadedArtRef.current.has(url)) return;
      const image = new Image();
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = url;
      preloadedArtRef.current.set(url, image);
    });
  }, [items, selectedIndex]);

  useEffect(() => () => {
    preloadedArtRef.current.forEach((image) => {
      image.onload = null;
      image.onerror = null;
    });
    preloadedArtRef.current.clear();
  }, []);

  const move = useCallback((direction: -1 | 1) => {
    if (items.length < 2) return;
    onSelectIndexRef.current(getLoopedBossArchiveIndex(
      items.length,
      selectedIndexRef.current + direction
    ));
  }, [items.length]);

  useEffect(() => {
    if (items.length < 2 || typeof navigator.getGamepads !== 'function') return undefined;
    let frame = 0;
    let previousDirection = 0;
    const poll = () => {
      const pad = Array.from(navigator.getGamepads()).find(Boolean);
      const axis = pad?.axes?.[0] ?? 0;
      const direction = pad?.buttons?.[14]?.pressed || axis < -0.62
        ? -1
        : pad?.buttons?.[15]?.pressed || axis > 0.62
          ? 1
          : 0;
      if (direction !== 0 && previousDirection === 0) move(direction as -1 | 1);
      previousDirection = direction;
      frame = window.requestAnimationFrame(poll);
    };
    frame = window.requestAnimationFrame(poll);
    return () => window.cancelAnimationFrame(frame);
  }, [items.length, move]);

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const gesture = dragRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const finalDragX = dragX;
    setDragging(false);
    setDragX(0);
    if (cancelled) suppressClickRef.current = false;
    if (cancelled || !gesture.horizontal || items.length < 2) return;
    const steps = Math.max(
      -(items.length - 1),
      Math.min(items.length - 1, Math.round(-finalDragX / stepPx))
    );
    if (steps !== 0) {
      onSelectIndex(getLoopedBossArchiveIndex(items.length, selectedIndex + steps));
    } else if (Math.abs(finalDragX) >= DRAG_THRESHOLD_PX) {
      move(finalDragX < 0 ? 1 : -1);
    }
  };

  // Keep every card mounted so revisiting a boss never remounts and re-decodes
  // its artwork. Off-window cards remain hidden and non-interactive.
  const carouselItems = useMemo(() => items.map((item, index) => ({
    item,
    index,
    relative: getBossArchiveRelativePosition(index, selectedIndex, items.length)
  })), [items, selectedIndex]);

  return (
    <section
      className="boss-archive-carousel"
      aria-label="Recovered boss carousel"
      aria-roledescription="carousel"
      data-dragging={dragging ? 'true' : 'false'}
    >
      <div className="boss-archive-carousel__toolbar">
        <span aria-live="polite">
          {selectedItem
            ? `${selectedItem.unlocked ? selectedItem.entry.label : 'Unknown Signal'}, ${selectedIndex + 1} of ${items.length}`
            : 'No boss records'}
        </span>
        <button
          type="button"
          className="boss-archive-icon-button boss-archive-carousel__index-button"
          onClick={onOpenIndex}
          aria-label="Open Boss Archive index"
          title="Archive index"
        >
          <span aria-hidden="true">&#9638;</span>
          <small>Index</small>
        </button>
      </div>

      <div
        ref={viewportRef}
        className="boss-archive-carousel__viewport"
        tabIndex={0}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'Home' && items.length > 0) {
            event.preventDefault();
            onSelectIndex(0);
          } else if (event.key === 'End' && items.length > 0) {
            event.preventDefault();
            onSelectIndex(items.length - 1);
          }
        }}
        onWheel={(event) => {
          const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.shiftKey
              ? event.deltaY
              : 0;
          if (Math.abs(horizontalDelta) < 8) return;
          event.preventDefault();
          const now = performance.now();
          if (now - lastWheelAtRef.current < WHEEL_COOLDOWN_MS) return;
          lastWheelAtRef.current = now;
          move(horizontalDelta > 0 ? 1 : -1);
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || items.length < 2) return;
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          suppressClickRef.current = false;
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            horizontal: false
          };
        }}
        onPointerMove={(event) => {
          const gesture = dragRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          const deltaX = event.clientX - gesture.startX;
          const deltaY = event.clientY - gesture.startY;
          if (!gesture.horizontal) {
            if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15 && Math.abs(deltaY) > 8) {
              dragRef.current = null;
              setDragging(false);
              setDragX(0);
              return;
            }
            if (Math.abs(deltaX) > 7 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
              gesture.horizontal = true;
              suppressClickRef.current = true;
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.setPointerCapture(event.pointerId);
              }
              setDragging(true);
            }
          }
          if (!gesture.horizontal) return;
          event.preventDefault();
          const maxDrag = stepPx * Math.max(1, Math.min(2, items.length - 1));
          setDragX(Math.max(-maxDrag, Math.min(maxDrag, deltaX)));
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => {
          const gesture = dragRef.current;
          if (!gesture || gesture.pointerId !== event.pointerId) return;
          dragRef.current = null;
          suppressClickRef.current = false;
          setDragging(false);
          setDragX(0);
        }}
      >
        <div className="boss-archive-carousel__scanner" aria-hidden="true" />
        <div className="boss-archive-carousel__platform" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {carouselItems.map(({ item, index, relative }) => {
          const isVisible = Math.abs(relative) <= ART_RENDER_RADIUS;
          const adjustedSlot = relative + dragX / stepPx;
          const isSelected = index === selectedIndex && !dragging;
          const distance = Math.min(2, Math.abs(adjustedSlot));
          const style = {
            '--boss-slot': adjustedSlot,
            '--boss-distance': distance,
            '--boss-x': `${adjustedSlot * stepPx}px`,
            '--boss-y': `${distance * 14}px`,
            '--boss-scale': 1 - distance * 0.18,
            '--boss-angle': `${adjustedSlot * -10}deg`,
            '--boss-opacity': Math.max(0.18, 1 - distance * 0.36),
            '--boss-accent': item.presentation.accentColor ?? '#22d3ee',
            visibility: isVisible ? 'visible' : 'hidden',
            pointerEvents: isVisible ? 'auto' : 'none'
          } as React.CSSProperties;
          return (
            <button
              type="button"
              key={item.entry.eventId}
              className="boss-archive-carousel__card"
              style={style}
              data-selected={isSelected ? 'true' : 'false'}
              data-locked={item.unlocked ? 'false' : 'true'}
              data-new={item.isNew ? 'true' : 'false'}
              aria-hidden={isVisible ? undefined : true}
              tabIndex={isSelected ? 0 : -1}
              aria-label={item.unlocked
                ? `${item.entry.label}, Mission ${item.entry.missionNumber}${item.isNew ? ', newly unlocked' : ''}`
                : `Unknown Signal, Mission ${item.entry.missionNumber}`}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => {
                if (!dragging) onSelectIndex(index);
              }}
            >
              <span className="boss-archive-carousel__card-grid" aria-hidden="true" />
              {item.isNew ? <span className="boss-archive-carousel__new">New</span> : null}
              <span className="boss-archive-carousel__mission">
                M-{String(item.entry.missionNumber).padStart(2, '0')}
              </span>
              <span className="boss-archive-carousel__artwell">
                {isVisible ? (
                  <BossPreviewArt
                    item={item}
                    selected={isSelected}
                    eager
                  />
                ) : null}
              </span>
              <span className="boss-archive-carousel__card-copy">
                <strong>{item.unlocked ? item.entry.label : 'Unknown Signal'}</strong>
                <small>{item.unlocked
                  ? item.presentation.difficultyLabel
                  : 'Telemetry encrypted'}</small>
              </span>
            </button>
          );
        })}
      </div>

      {items.length > 1 ? (
        <>
          <button
            type="button"
            className="boss-archive-carousel__arrow boss-archive-carousel__arrow--previous"
            onClick={() => move(-1)}
            aria-label="Previous boss"
          >
            <span aria-hidden="true">&#8249;</span>
          </button>
          <button
            type="button"
            className="boss-archive-carousel__arrow boss-archive-carousel__arrow--next"
            onClick={() => move(1)}
            aria-label="Next boss"
          >
            <span aria-hidden="true">&#8250;</span>
          </button>
        </>
      ) : null}
    </section>
  );
};

export default BossArchiveCarousel;
