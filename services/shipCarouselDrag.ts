export type CarouselDragResolution<T extends string> = {
  focusedItemId: T;
  remainderX: number;
  stepCount: number;
};

export const SHIP_CAROUSEL_DRAG_STEP_RATIO = 0.72;
export const SHIP_CAROUSEL_MIN_DRAG_STEP_PX = 88;
export const SHIP_CAROUSEL_MAX_DRAG_STEP_PX = 164;

const normalizeIndex = (index: number, length: number) => ((index % length) + length) % length;

const resolveCarouselDrag = <T extends string>(
  itemIds: readonly T[],
  originItemId: T,
  deltaX: number,
  stepPx: number,
  stepCount: number
): CarouselDragResolution<T> => {
  const safeStepPx = Math.max(1, stepPx);
  const originIndex = Math.max(0, itemIds.indexOf(originItemId));
  const focusedItemId = itemIds[normalizeIndex(originIndex + stepCount, itemIds.length)];

  return {
    focusedItemId,
    remainderX: deltaX + stepCount * safeStepPx,
    stepCount
  };
};

export const getShipCarouselDragStep = (stageWidth: number) => Math.max(
  SHIP_CAROUSEL_MIN_DRAG_STEP_PX,
  Math.min(SHIP_CAROUSEL_MAX_DRAG_STEP_PX, stageWidth * SHIP_CAROUSEL_DRAG_STEP_RATIO)
);

/**
 * Resolves the ship under the finger while it remains held. A full ship spacing
 * advances immediately and leaves the unconsumed pointer distance as the next
 * segment's visual offset.
 */
export const resolveHeldCarouselDrag = <T extends string>(
  itemIds: readonly T[],
  originItemId: T,
  deltaX: number,
  stepPx: number
) => {
  if (itemIds.length === 0) throw new Error('Carousel requires at least one item');
  const safeStepPx = Math.max(1, stepPx);
  const stepCount = Math.trunc(-deltaX / safeStepPx);
  return resolveCarouselDrag(itemIds, originItemId, deltaX, safeStepPx, stepCount);
};

/** Resolves the nearest ship for the short centering animation on release. */
export const resolveReleasedCarouselDrag = <T extends string>(
  itemIds: readonly T[],
  originItemId: T,
  deltaX: number,
  stepPx: number
) => {
  if (itemIds.length === 0) throw new Error('Carousel requires at least one item');
  const safeStepPx = Math.max(1, stepPx);
  const rawSteps = -deltaX / safeStepPx;
  const stepCount = Math.sign(rawSteps) * Math.floor(Math.abs(rawSteps) + 0.5);
  return resolveCarouselDrag(itemIds, originItemId, deltaX, safeStepPx, stepCount);
};
