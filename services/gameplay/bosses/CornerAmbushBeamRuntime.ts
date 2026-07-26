export const CORNER_AMBUSH_BEAM_MIN_WARNING_SECONDS = 0.8;
export const CORNER_AMBUSH_BEAM_MAX_WARNING_SECONDS = 2.5;
export const CORNER_AMBUSH_BEAM_MIN_LIVE_SECONDS = 0.3;
export const CORNER_AMBUSH_BEAM_MAX_LIVE_SECONDS = 1.25;
export const CORNER_AMBUSH_BEAM_HUB_Y_RATIO = 0.72;

export type CornerAmbushSide = 'upper-left' | 'upper-right';

export interface CornerAmbushBeamLock {
  side: CornerAmbushSide;
  sequence: number;
  bossX: number;
  bossY: number;
  originX: number;
  originY: number;
  targetX: number;
  targetY: number;
  angleRadians: number;
  beamCenterX: number;
  beamCenterY: number;
  beamLength: number;
}

export interface CornerAmbushBeamLockInput {
  sequence: number;
  arenaWidth: number;
  arenaHeight: number;
  bossWidth: number;
  bossHeight: number;
  playerCenterX: number;
  playerCenterY: number;
  mobileProfile: boolean;
}

export interface RotatedBeamRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  angleRadians: number;
}

export interface AxisAlignedRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export const resolveCornerAmbushSide = (sequence: number): CornerAmbushSide => (
  Math.abs(Math.floor(Number.isFinite(sequence) ? sequence : 0)) % 2 === 0
    ? 'upper-left'
    : 'upper-right'
);

const resolveForwardBoundaryDistance = (
  originX: number,
  originY: number,
  directionX: number,
  directionY: number,
  arenaWidth: number,
  arenaHeight: number
) => {
  const candidates: number[] = [];
  const epsilon = 0.000001;
  if (directionX > epsilon) candidates.push((arenaWidth - originX) / directionX);
  if (directionX < -epsilon) candidates.push((0 - originX) / directionX);
  if (directionY > epsilon) candidates.push((arenaHeight - originY) / directionY);
  if (directionY < -epsilon) candidates.push((0 - originY) / directionY);
  const positive = candidates.filter((distance) => Number.isFinite(distance) && distance > 0);
  return positive.length > 0 ? Math.min(...positive) : Math.hypot(arenaWidth, arenaHeight);
};

/**
 * Resolves the complete warning/fire geometry once, at warning time. The
 * returned lock is shared by the warning and damaging beam so player movement
 * after the warning cannot silently rotate the damaging lane.
 */
export const resolveCornerAmbushBeamLock = (
  input: CornerAmbushBeamLockInput
): CornerAmbushBeamLock => {
  const arenaWidth = Math.max(1, Number(input.arenaWidth) || 1);
  const arenaHeight = Math.max(1, Number(input.arenaHeight) || 1);
  const bossWidth = clamp(Number(input.bossWidth) || 1, 1, arenaWidth);
  const bossHeight = clamp(Number(input.bossHeight) || 1, 1, arenaHeight);
  const side = resolveCornerAmbushSide(input.sequence);
  const sequence = Math.max(0, Math.floor(Number(input.sequence) || 0));

  const horizontalMargin = Math.max(
    input.mobileProfile ? 12 : 24,
    arenaWidth * (input.mobileProfile ? 0.035 : 0.04)
  );
  const combatAnchorY = Math.max(72, Math.min(arenaHeight * 0.13, 116));
  const verticalMargin = Math.max(
    combatAnchorY,
    input.mobileProfile ? 48 : 60,
    arenaHeight * 0.065
  );
  const minimumBossX = Math.min(horizontalMargin, Math.max(0, arenaWidth - bossWidth));
  const maximumBossX = Math.max(
    minimumBossX,
    arenaWidth - bossWidth - horizontalMargin
  );
  const bossX = side === 'upper-left' ? minimumBossX : maximumBossX;
  const bossY = clamp(
    verticalMargin,
    8,
    Math.max(8, arenaHeight - bossHeight - 8)
  );

  const originX = bossX + bossWidth / 2;
  const originY = bossY + bossHeight * CORNER_AMBUSH_BEAM_HUB_Y_RATIO;
  const targetMargin = Math.max(
    input.mobileProfile ? 24 : 36,
    Math.min(arenaWidth, arenaHeight) * 0.035
  );
  const targetX = clamp(
    Number(input.playerCenterX) || arenaWidth / 2,
    Math.min(targetMargin, arenaWidth / 2),
    Math.max(arenaWidth / 2, arenaWidth - targetMargin)
  );
  const targetY = clamp(
    Number(input.playerCenterY) || arenaHeight * 0.78,
    Math.min(targetMargin, arenaHeight / 2),
    Math.max(arenaHeight / 2, arenaHeight - targetMargin)
  );
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const targetDistance = Math.hypot(deltaX, deltaY);
  const directionX = targetDistance > 0.001 ? deltaX / targetDistance : 0;
  const directionY = targetDistance > 0.001 ? deltaY / targetDistance : 1;
  const angleRadians = Math.atan2(directionY, directionX);
  const boundaryDistance = resolveForwardBoundaryDistance(
    originX,
    originY,
    directionX,
    directionY,
    arenaWidth,
    arenaHeight
  );
  const overscan = input.mobileProfile ? 8 : 12;
  const beamLength = Math.max(1, boundaryDistance + overscan);

  return {
    side,
    sequence,
    bossX,
    bossY,
    originX,
    originY,
    targetX,
    targetY,
    angleRadians,
    beamCenterX: originX + directionX * beamLength / 2,
    beamCenterY: originY + directionY * beamLength / 2,
    beamLength
  };
};

/**
 * Collision for a beam whose width is its along-ray length and whose height is
 * its damaging thickness. This uses the same center and angle consumed by the
 * renderer rather than an axis-aligned approximation.
 */
export const rotatedBeamRectangleIntersectsBox = (
  beam: RotatedBeamRectangle,
  box: AxisAlignedRectangle
) => {
  const cosine = Math.cos(beam.angleRadians);
  const sine = Math.sin(beam.angleRadians);
  const beamCenterX = beam.x + beam.width / 2;
  const beamCenterY = beam.y + beam.height / 2;
  const boxCenterX = box.x + box.width / 2;
  const boxCenterY = box.y + box.height / 2;
  const deltaX = boxCenterX - beamCenterX;
  const deltaY = boxCenterY - beamCenterY;
  const localX = cosine * deltaX + sine * deltaY;
  const localY = -sine * deltaX + cosine * deltaY;
  const projectedHalfWidth = (
    Math.abs(cosine) * box.width + Math.abs(sine) * box.height
  ) / 2;
  const projectedHalfHeight = (
    Math.abs(sine) * box.width + Math.abs(cosine) * box.height
  ) / 2;
  const beamProjectionOnWorldX = (
    Math.abs(cosine) * beam.width + Math.abs(sine) * beam.height
  ) / 2;
  const beamProjectionOnWorldY = (
    Math.abs(sine) * beam.width + Math.abs(cosine) * beam.height
  ) / 2;
  return Math.abs(deltaX) <= beamProjectionOnWorldX + box.width / 2
    && Math.abs(deltaY) <= beamProjectionOnWorldY + box.height / 2
    && Math.abs(localX) <= beam.width / 2 + projectedHalfWidth
    && Math.abs(localY) <= beam.height / 2 + projectedHalfHeight;
};
