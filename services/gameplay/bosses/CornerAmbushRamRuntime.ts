export const CORNER_AMBUSH_RAM_MIN_WARNING_SECONDS = 0.8;
export const CORNER_AMBUSH_RAM_MAX_WARNING_SECONDS = 2.5;
export const CORNER_AMBUSH_RAM_MIN_LIVE_SECONDS = 0.45;
export const CORNER_AMBUSH_RAM_MAX_LIVE_SECONDS = 1.4;

export type CornerAmbushRamSide =
  | 'lower-left'
  | 'lower-right'
  | 'mid-left'
  | 'mid-right';

export interface CornerAmbushRamLock {
  side: CornerAmbushRamSide;
  sequence: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  exitX: number;
  exitY: number;
  angleRadians: number;
}

export interface CornerAmbushRamLockInput {
  sequence: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  bossHeight: number;
  playerCenterX: number;
  playerCenterY: number;
  mobileProfile: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export const resolveCornerAmbushRamSide = (sequence: number): CornerAmbushRamSide => (
  ([
    'lower-left',
    'lower-right',
    'mid-left',
    'mid-right'
  ] as const)[Math.abs(Math.floor(Number.isFinite(sequence) ? sequence : 0)) % 4]
);

/**
 * Resolves the entire charge lane at warning time. The boss starts in a lower
 * corner, crosses the locked player position, and exits beyond the opposite
 * upper boundary. Player movement after the warning never bends the charge.
 */
export const resolveCornerAmbushRamLock = (
  input: CornerAmbushRamLockInput
): CornerAmbushRamLock => {
  const arenaWidth = Math.max(1, Number(input.arenaWidth) || 1);
  const arenaHeight = Math.max(1, Number(input.arenaHeight) || 1);
  const bossWidth = clamp(Number(input.bossWidth) || 1, 1, arenaWidth);
  const bossHeight = clamp(Number(input.bossHeight) || 1, 1, arenaHeight);
  const sequence = Math.max(0, Math.floor(Number(input.sequence) || 0));
  const side = resolveCornerAmbushRamSide(sequence);
  const leftEntry = side === 'lower-left' || side === 'mid-left';
  const middleEntry = side === 'mid-left' || side === 'mid-right';
  const sideMargin = Math.max(input.mobileProfile ? 8 : 18, arenaWidth * 0.025);
  const startX = leftEntry
    ? sideMargin
    : Math.max(sideMargin, arenaWidth - bossWidth - sideMargin);
  const startY = middleEntry
    ? clamp(
        arenaHeight * (input.mobileProfile ? 0.48 : 0.44) - bossHeight / 2,
        sideMargin,
        Math.max(sideMargin, arenaHeight - bossHeight - sideMargin)
      )
    : clamp(
        Math.max(
          arenaHeight * 0.62,
          arenaHeight - bossHeight * (input.mobileProfile ? 0.72 : 0.78)
        ),
        0,
        Math.max(0, arenaHeight - bossHeight)
      );
  const targetMargin = Math.max(input.mobileProfile ? 28 : 42, arenaWidth * 0.045);
  const targetX = clamp(
    Number(input.playerCenterX) || arenaWidth / 2,
    Math.min(targetMargin, arenaWidth / 2),
    Math.max(arenaWidth / 2, arenaWidth - targetMargin)
  );
  const targetY = clamp(
    Number(input.playerCenterY) || arenaHeight * 0.76,
    Math.min(arenaHeight * 0.38, arenaHeight / 2),
    Math.max(arenaHeight / 2, arenaHeight - Math.max(30, targetMargin))
  );
  const startCenterX = startX + bossWidth / 2;
  const startCenterY = startY + bossHeight / 2;
  const deltaX = targetX - startCenterX;
  const deltaY = targetY - startCenterY;
  const targetDistance = Math.max(1, Math.hypot(deltaX, deltaY));
  const directionX = deltaX / targetDistance;
  const directionY = deltaY / targetDistance;
  const travelDistance = Math.hypot(arenaWidth, arenaHeight) * 1.35;
  const exitCenterX = startCenterX + directionX * travelDistance;
  const exitCenterY = startCenterY + directionY * travelDistance;

  return {
    side,
    sequence,
    startX,
    startY,
    targetX,
    targetY,
    exitX: exitCenterX - bossWidth / 2,
    exitY: exitCenterY - bossHeight / 2,
    angleRadians: Math.atan2(directionY, directionX)
  };
};

/** Fast launch with a short readable acceleration before full speed. */
export const sampleCornerAmbushRamProgress = (progress: number) => {
  const t = clamp(Number(progress) || 0, 0, 1);
  return t < 0.28
    ? 0.5 * Math.pow(t / 0.28, 2) * 0.28
    : 0.14 + (t - 0.28) / 0.72 * 0.86;
};
