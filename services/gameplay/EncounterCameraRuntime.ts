export type EncounterCameraMode = 'auto' | 'normal' | 'expanded';

export interface EncounterCameraProfile {
  readonly eventId: string;
  readonly normalScale: number;
  readonly expandedScale: number;
  readonly zoomDelayFrames: number;
  readonly zoomDurationFrames: number;
  readonly restoreDurationFrames: number;
  /** Keep the colossal entrance aligned to the upper world edge. */
  readonly verticalAnchor: 'top' | 'center';
}

export interface EncounterCameraTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly progress: number;
  readonly expanded: boolean;
}

export interface EncounterWorldSize {
  readonly width: number;
  readonly height: number;
}

export interface EncounterVisibleWorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);

const finitePositive = (value: number, fallback = 1) => (
  Number.isFinite(value) && value > 0 ? value : fallback
);

const smoothstep = (value: number) => {
  const progress = clamp(Number(value) || 0, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const createEncounterCameraTransform = ({
  scale,
  progress,
  displayWidth,
  displayHeight,
  worldWidth,
  worldHeight,
  verticalAnchor
}: {
  readonly scale: number;
  readonly progress: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly verticalAnchor: EncounterCameraProfile['verticalAnchor'];
}): EncounterCameraTransform => {
  const safeWorldWidth = finitePositive(worldWidth);
  const safeWorldHeight = finitePositive(worldHeight);
  const safeDisplayWidth = finitePositive(displayWidth);
  const safeDisplayHeight = finitePositive(displayHeight);
  const safeScale = finitePositive(scale);
  const scaledWidth = safeWorldWidth * safeScale;
  const scaledHeight = safeWorldHeight * safeScale;
  const safeProgress = clamp(progress, 0, 1);
  return Object.freeze({
    scale: safeScale,
    offsetX: (safeDisplayWidth - scaledWidth) / 2,
    offsetY: verticalAnchor === 'center'
      ? (safeDisplayHeight - scaledHeight) / 2
      : 0,
    progress: safeProgress,
    expanded: safeProgress >= 0.999
  });
};

export const normalizeEncounterCameraProfile = (
  profile: EncounterCameraProfile | undefined
): EncounterCameraProfile | undefined => {
  if (!profile?.eventId) return undefined;
  const normalScale = clamp(Number(profile.normalScale) || 1, 0.5, 1.5);
  const expandedScale = clamp(
    Number(profile.expandedScale) || 1,
    0.5,
    normalScale
  );
  return Object.freeze({
    eventId: profile.eventId,
    normalScale,
    expandedScale,
    zoomDelayFrames: Math.max(0, Math.floor(Number(profile.zoomDelayFrames) || 0)),
    zoomDurationFrames: Math.max(1, Math.floor(Number(profile.zoomDurationFrames) || 1)),
    restoreDurationFrames: Math.max(1, Math.floor(Number(profile.restoreDurationFrames) || 1)),
    verticalAnchor: profile.verticalAnchor === 'center' ? 'center' : 'top'
  });
};

export const resolveEncounterWorldSize = (
  displayWidth: number,
  displayHeight: number,
  profile: EncounterCameraProfile | undefined
): EncounterWorldSize => {
  const width = Math.max(1, Math.round(finitePositive(displayWidth)));
  const height = Math.max(1, Math.round(finitePositive(displayHeight)));
  const normalized = normalizeEncounterCameraProfile(profile);
  if (!normalized) return Object.freeze({ width, height });
  return Object.freeze({
    width: Math.max(width, Math.round(width / normalized.expandedScale)),
    height: Math.max(height, Math.round(height / normalized.expandedScale))
  });
};

export const sampleEncounterCameraTransform = ({
  frame,
  displayWidth,
  displayHeight,
  worldWidth,
  worldHeight,
  profile,
  mode = 'auto'
}: {
  readonly frame: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly profile: EncounterCameraProfile | undefined;
  readonly mode?: EncounterCameraMode;
}): EncounterCameraTransform => {
  const normalized = normalizeEncounterCameraProfile(profile);
  if (!normalized) {
    return Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, progress: 1, expanded: false });
  }
  const rawProgress = mode === 'normal'
    ? 0
    : mode === 'expanded'
      ? 1
      : (
          Math.max(0, Math.floor(Number(frame) || 0)) - normalized.zoomDelayFrames
        ) / normalized.zoomDurationFrames;
  const progress = smoothstep(rawProgress);
  const scale = normalized.normalScale
    + (normalized.expandedScale - normalized.normalScale) * progress;
  return createEncounterCameraTransform({
    scale,
    progress,
    displayWidth,
    displayHeight,
    worldWidth,
    worldHeight,
    verticalAnchor: normalized.verticalAnchor
  });
};

export const sampleEncounterCameraRestoreTransform = ({
  elapsedFrames,
  startScale,
  displayWidth,
  displayHeight,
  worldWidth,
  worldHeight,
  profile
}: {
  readonly elapsedFrames: number;
  readonly startScale: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly profile: EncounterCameraProfile | undefined;
}): EncounterCameraTransform => {
  const normalized = normalizeEncounterCameraProfile(profile);
  if (!normalized) {
    return Object.freeze({ scale: 1, offsetX: 0, offsetY: 0, progress: 1, expanded: false });
  }
  const restoreProgress = smoothstep(
    Math.max(0, Math.floor(Number(elapsedFrames) || 0)) / normalized.restoreDurationFrames
  );
  const safeStartScale = clamp(
    Number(startScale) || normalized.expandedScale,
    normalized.expandedScale,
    normalized.normalScale
  );
  const scale = safeStartScale
    + (normalized.normalScale - safeStartScale) * restoreProgress;
  const scaleRange = Math.max(0.0001, normalized.normalScale - normalized.expandedScale);
  const expansionProgress = clamp(
    (normalized.normalScale - scale) / scaleRange,
    0,
    1
  );
  return createEncounterCameraTransform({
    scale,
    progress: expansionProgress,
    displayWidth,
    displayHeight,
    worldWidth,
    worldHeight,
    verticalAnchor: normalized.verticalAnchor
  });
};

export const resolveEncounterVisibleWorldBounds = ({
  transform,
  displayWidth,
  displayHeight,
  worldWidth,
  worldHeight
}: {
  readonly transform: EncounterCameraTransform;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}): EncounterVisibleWorldBounds => {
  const safeWorldWidth = finitePositive(worldWidth);
  const safeWorldHeight = finitePositive(worldHeight);
  const safeDisplayWidth = finitePositive(displayWidth);
  const safeDisplayHeight = finitePositive(displayHeight);
  const scale = Math.max(0.0001, finitePositive(transform.scale));
  const minX = clamp(-transform.offsetX / scale, 0, safeWorldWidth);
  const maxX = clamp(
    (safeDisplayWidth - transform.offsetX) / scale,
    minX,
    safeWorldWidth
  );
  const minY = clamp(-transform.offsetY / scale, 0, safeWorldHeight);
  const maxY = clamp(
    (safeDisplayHeight - transform.offsetY) / scale,
    minY,
    safeWorldHeight
  );
  return Object.freeze({
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY)
  });
};

export const mapEncounterDisplayPointToWorld = ({
  x,
  y,
  transform,
  worldWidth,
  worldHeight
}: {
  readonly x: number;
  readonly y: number;
  readonly transform: EncounterCameraTransform;
  readonly worldWidth: number;
  readonly worldHeight: number;
}) => Object.freeze({
  x: clamp(
    ((Number.isFinite(x) ? x : 0) - (Number.isFinite(transform.offsetX) ? transform.offsetX : 0))
      / Math.max(0.0001, finitePositive(transform.scale)),
    0,
    finitePositive(worldWidth)
  ),
  y: clamp(
    ((Number.isFinite(y) ? y : 0) - (Number.isFinite(transform.offsetY) ? transform.offsetY : 0))
      / Math.max(0.0001, finitePositive(transform.scale)),
    0,
    finitePositive(worldHeight)
  )
});
