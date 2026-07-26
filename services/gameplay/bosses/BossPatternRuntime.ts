export const MAX_BOSS_PATTERN_PROJECTILES = 24;

export interface BossWeaveWallLayout {
  laneCount: number;
  laneWidth: number;
  margin: number;
  safeGapStartLane: number;
  safeGapEndLane: number;
  safeGapLeftX: number;
  safeGapRightX: number;
  safeGapCenterX: number;
}

export interface BossWeaveWallSlot {
  laneIndex: number;
  rowIndex: number;
  x: number;
  variant: number;
}

export type BossGapRouteDirection = 'clockwise' | 'counterclockwise';

export type BossGapRouteDirectionPolicy = BossGapRouteDirection | 'seeded-random';

export interface BossGapRoute {
  routeIndex: number;
  x: number;
  y: number;
  angleRadians: number;
}

const normalizeSequence = (sequence: number) => (
  Math.max(0, Math.floor(Number.isFinite(sequence) ? sequence : 0))
);

/**
 * Moves across a bounded lane set and then reverses instead of wrapping from
 * one edge to the other. Long boss sentences therefore remain physically
 * traversable and visually learnable.
 */
export const resolveBossPingPongIndex = (
  sequence: number,
  maximumIndex: number
) => {
  const maximum = Math.max(0, Math.floor(maximumIndex));
  if (maximum === 0) return 0;
  const span = maximum * 2;
  const step = normalizeSequence(sequence) % span;
  return step <= maximum ? step : span - step;
};

export const resolveBossWeaveWallLayout = (
  arenaWidth: number,
  mobileProfile: boolean,
  sequence: number
): BossWeaveWallLayout => {
  const width = Math.max(160, Number.isFinite(arenaWidth) ? arenaWidth : 160);
  const laneCount = mobileProfile ? 7 : 10;
  const margin = mobileProfile ? 12 : 20;
  const laneWidth = Math.max(1, (width - margin * 2) / laneCount);
  const safeGapStartLane = resolveBossPingPongIndex(sequence, laneCount - 2);
  const safeGapLeftX = margin + safeGapStartLane * laneWidth;
  const safeGapRightX = safeGapLeftX + laneWidth * 2;
  return {
    laneCount,
    laneWidth,
    margin,
    safeGapStartLane,
    safeGapEndLane: safeGapStartLane + 1,
    safeGapLeftX,
    safeGapRightX,
    safeGapCenterX: (safeGapLeftX + safeGapRightX) / 2
  };
};

/**
 * Resolves one exact incomplete-ring opening into a lower-arena waypoint.
 * The four taught positions advance one reachable step at a time; reversing
 * direction mirrors the same rule without introducing unrestricted random
 * angles or sampling the player's location at fire time.
 */
export const resolveBossGapRoute = ({
  arenaWidth,
  arenaHeight,
  originX,
  originY,
  sequence,
  direction
}: {
  arenaWidth: number;
  arenaHeight: number;
  originX: number;
  originY: number;
  sequence: number;
  direction: BossGapRouteDirection;
}): BossGapRoute => {
  const width = Math.max(160, Number.isFinite(arenaWidth) ? arenaWidth : 160);
  const height = Math.max(240, Number.isFinite(arenaHeight) ? arenaHeight : 240);
  const routeIndexForward = resolveBossPingPongIndex(sequence, 3);
  const routeIndex = direction === 'counterclockwise'
    ? 3 - routeIndexForward
    : routeIndexForward;
  const xRatios = [0.2, 0.4, 0.6, 0.8] as const;
  const x = width * xRatios[routeIndex];
  const y = Math.max(originY + height * 0.22, height * 0.78);
  return {
    routeIndex,
    x,
    y,
    angleRadians: Math.atan2(y - originY, x - originX)
  };
};

/**
 * Resolves the authoring policy once per deterministic execution. "Random"
 * means seed-derived here; it never reads ambient randomness, so warning,
 * damage, replay, and safety analysis all choose the same direction.
 */
export const resolveBossGapRouteDirection = (
  policy: BossGapRouteDirectionPolicy | undefined,
  sequence: number
): BossGapRouteDirection => {
  if (policy === 'counterclockwise') return 'counterclockwise';
  if (policy === 'seeded-random') {
    return normalizeSequence(sequence) % 2 === 0
      ? 'clockwise'
      : 'counterclockwise';
  }
  return 'clockwise';
};

export const buildBossWeaveWallSlots = (
  layout: BossWeaveWallLayout,
  projectileCount: number,
  sequence: number
): readonly BossWeaveWallSlot[] => {
  const count = Math.max(
    1,
    Math.min(
      MAX_BOSS_PATTERN_PROJECTILES,
      Math.floor(Number.isFinite(projectileCount) ? projectileCount : 1)
    )
  );
  const slots: BossWeaveWallSlot[] = [];
  const normalizedSequence = normalizeSequence(sequence);
  for (let rowIndex = 0; slots.length < count; rowIndex += 1) {
    for (let laneIndex = 0; laneIndex < layout.laneCount && slots.length < count; laneIndex += 1) {
      if (
        laneIndex === layout.safeGapStartLane
        || laneIndex === layout.safeGapEndLane
      ) continue;
      slots.push({
        laneIndex,
        rowIndex,
        x: layout.margin + (laneIndex + 0.5) * layout.laneWidth,
        variant: normalizedSequence * 100 + rowIndex * layout.laneCount + laneIndex
      });
    }
  }
  return slots;
};

export const resolveBossPodSide = (
  sequence: number,
  projectileIndex: number
): 'left' | 'right' => (
  (normalizeSequence(sequence) + Math.max(0, Math.floor(projectileIndex))) % 2 === 0
    ? 'left'
    : 'right'
);

export const resolveBossPatternSequence = (
  configuredSequence: number | undefined,
  executionIndex: number
) => (
  normalizeSequence(configuredSequence ?? 0)
  + Math.max(0, Math.floor(Number.isFinite(executionIndex) ? executionIndex : 0))
);
