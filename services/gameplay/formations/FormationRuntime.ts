export type ConfiguredFormationMode =
  | 'row'
  | 'v'
  | 'sine'
  | 'pincer'
  | 'grid'
  | 'diamond'
  | 'spiral';

export type FormationEntryDirection = 'top' | 'left' | 'right' | 'split';
export type FormationEntryBehavior = 'formation' | 'dive' | 'flank' | 'lane';
export type FormationManeuverKind =
  | 'sequential-peel'
  | 'synchronized-break'
  | 'feint-dive'
  | 'crossing-flanks'
  | 'corkscrew';

export interface FormationPoint {
  x: number;
  y: number;
}

export interface FormationGeometryEvent {
  id: string;
  patternId?: string;
  positionId?: string;
  spawnAnchor?: FormationPoint;
  formationSlots?: readonly FormationPoint[];
  enemySpriteKeys?: readonly string[];
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationViewport {
  width: number;
  height: number;
}

export interface FormationTargetInput {
  event: FormationGeometryEvent;
  index: number;
  count: number;
  entityWidth: number;
  entityHeight: number;
  viewport: FormationViewport;
}

export interface FormationSpawnPointInput {
  event: FormationGeometryEvent;
  index: number;
  count: number;
  viewport: FormationViewport;
  /**
   * A gameplay-RNG sample supplied by the engine. Keeping randomness outside
   * this pure module makes deterministic previews and focused tests repeatable.
   */
  randomSample: number;
}

export interface FormationEntryPlanInput {
  eventId: string;
  patternId?: string;
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
  index: number;
  count: number;
  currentFrame: number;
  waveProgressFrames: number;
  baseVerticalSpeed: number;
  sideSentry: boolean;
  framesPerSecond: number;
  target: FormationPoint;
}

export interface FormationEntryPlan {
  mode: ConfiguredFormationMode;
  index: number;
  groupSize: number;
  seed: number;
  groupSeed: number;
  target: FormationPoint;
  entryFrames: number;
  diveFrame: number;
  baseSpeed: number;
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationEntryMotionInput {
  mode: ConfiguredFormationMode;
  index: number;
  groupSeed: number;
  progress: number;
  viewportWidth: number;
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationEntryMotion {
  xOffset: number;
  yOffset: number;
  angle: number;
}

export interface FormationDiveMotionInput {
  mode: ConfiguredFormationMode;
  index: number;
  groupSize: number;
  groupSeed: number;
  cycle: number;
  ageFrames: number;
  baseSpeed: number;
  current: FormationPoint;
  anchorX: number;
  player: FormationPoint;
  playerVelocityX: number;
  viewportWidth: number;
  mobile: boolean;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationDiveMotion {
  maneuver: FormationManeuverKind;
  velocityX: number;
  velocityY: number;
  angle: number;
  steering: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeAnchor = (anchor: FormationPoint | undefined) => {
  const x = Number(anchor?.x);
  const y = Number(anchor?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1)
  };
};

export const getFormationGroupSeed = (eventId: string) => {
  let hash = 0;
  for (let index = 0; index < eventId.length; index++) {
    hash = ((hash << 5) - hash + eventId.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 10000);
};

const normalizeEntryDirection = (
  value: FormationEntryDirection | undefined
): FormationEntryDirection | undefined => (
  value === 'top' || value === 'left' || value === 'right' || value === 'split'
    ? value
    : undefined
);

const normalizeEntryBehavior = (
  value: FormationEntryBehavior | undefined
): FormationEntryBehavior | undefined => (
  value === 'formation' || value === 'dive' || value === 'flank' || value === 'lane'
    ? value
    : undefined
);

const normalizeEntryPath = (value: string | undefined) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || undefined;
};

const getAuthoredEntrySide = (eventId: string, index: number): -1 | 1 => (
  (index + getFormationGroupSeed(eventId)) % 2 === 0 ? -1 : 1
);

export const resolveConfiguredFormationMode = (
  patternId?: string
): ConfiguredFormationMode => {
  const pattern = String(patternId || 'row').toLowerCase();
  if (pattern.includes('grid') || pattern.includes('wall')) return 'grid';
  if (pattern.includes('diamond')) return 'diamond';
  if (pattern.includes('spiral')) return 'spiral';
  if (pattern.includes('pincer')) return 'pincer';
  if (pattern.includes('sine') || pattern.includes('wave')) return 'sine';
  if (pattern.includes('v')) return 'v';
  return 'row';
};

/**
 * Resolves both custom normalized slots and the built-in compatibility
 * layouts. The sprite/event special cases intentionally remain explicit here
 * until their campaign data is migrated to reusable formation resources.
 */
export const resolveConfiguredFormationTarget = ({
  event,
  index,
  count,
  entityWidth,
  entityHeight,
  viewport
}: FormationTargetInput): FormationPoint => {
  const { width, height } = viewport;
  const authoredSlot = event.formationSlots?.[index];
  if (
    authoredSlot
    && Number.isFinite(authoredSlot.x)
    && Number.isFinite(authoredSlot.y)
  ) {
    const left = Math.max(entityWidth * 0.6, 24);
    const right = Math.max(left, width - left);
    return {
      x: clamp((authoredSlot.x * width) - (entityWidth / 2), left - entityWidth / 2, right - entityWidth / 2),
      y: clamp((authoredSlot.y * height) - (entityHeight / 2), 54, (height * 0.46) - (entityHeight / 2))
    };
  }

  const mode = resolveConfiguredFormationMode(event.patternId);
  const anchor = normalizeAnchor(event.spawnAnchor);
  const centerX = (anchor?.x ?? 0.5) * width;
  const topY = (anchor?.y ?? 0.16) * height;
  const left = Math.max(entityWidth * 0.6, 24);
  const right = Math.max(left, width - left);
  const mobile = width < 520;
  let targetCenterX = centerX;
  let targetCenterY = topY;
  const spriteKeys = event.enemySpriteKeys ?? [];
  const usesDnaFleet = spriteKeys.includes('CAMPAIGN_ENEMY_DNA_CONDUCTOR');
  const usesRingFleet = spriteKeys.some((key) => (
    key === 'CAMPAIGN_ENEMY_RING_SENTINEL'
    || key === 'CAMPAIGN_ENEMY_BULLET_RING_EMITTER'
  ));

  if (usesDnaFleet) {
    const sCurve = event.id.includes('null-sector') || event.id.includes('event-horizon');
    if (sCurve) {
      const progress = index / Math.max(1, count - 1);
      targetCenterX = centerX + Math.sin((progress * Math.PI * 2) - Math.PI / 2)
        * Math.min(width * 0.28, mobile ? 112 : 172);
      targetCenterY = topY + progress * Math.min(height * 0.25, mobile ? 210 : 250);
    } else {
      const pair = Math.floor(index / 2);
      const pairCount = Math.max(1, Math.ceil(count / 2));
      const strand = index % 2 === 0 ? -1 : 1;
      const angle = pair * 0.84 + (strand > 0 ? Math.PI : 0);
      targetCenterX = centerX + Math.cos(angle) * Math.min(width * 0.24, mobile ? 96 : 152);
      targetCenterY = topY + (pair / Math.max(1, pairCount - 1))
        * Math.min(height * 0.25, mobile ? 210 : 250);
    }
  } else if (usesRingFleet) {
    const ringSize = Math.min(12, count);
    const ring = Math.floor(index / ringSize);
    const localIndex = index % ringSize;
    const localCount = Math.min(ringSize, count - ring * ringSize);
    const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = Math.min(width * (0.21 + ring * 0.075), mobile ? 108 + ring * 28 : 158 + ring * 34);
    const radiusY = mobile ? 42 + ring * 24 : 52 + ring * 28;
    targetCenterX = centerX + Math.cos(angle) * radiusX;
    targetCenterY = topY + 62 + ring * (mobile ? 76 : 90) + Math.sin(angle) * radiusY;
  }

  if (usesDnaFleet || usesRingFleet) {
    // Compatibility layouts above intentionally bypass the generic shapes.
  } else if (mode === 'grid') {
    const columns = Math.min(mobile ? 5 : 8, Math.max(3, Math.ceil(Math.sqrt(count * 1.45))));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const gapX = Math.min(mobile ? 58 : 70, (width - left * 2) / Math.max(1, columns - 1));
    targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX;
    targetCenterY = topY + row * (mobile ? 48 : 56);
  } else if (mode === 'v') {
    const squadSize = Math.min(7, count);
    const squad = Math.floor(index / squadSize);
    const localIndex = index % squadSize;
    const localCount = Math.min(squadSize, count - squad * squadSize);
    const offset = localIndex - (localCount - 1) / 2;
    const gapX = Math.min(mobile ? 48 : 58, (width - left * 2) / Math.max(1, localCount - 1));
    targetCenterX = centerX + offset * gapX;
    targetCenterY = topY + squad * (mobile ? 70 : 78) + Math.abs(offset) * (mobile ? 17 : 20);
  } else if (mode === 'diamond') {
    const squadSize = Math.min(8, count);
    const squad = Math.floor(index / squadSize);
    const localIndex = index % squadSize;
    const localCount = Math.min(squadSize, count - squad * squadSize);
    const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
    const denominator = Math.max(0.001, Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    const diamondX = Math.cos(angle) / denominator;
    const diamondY = Math.sin(angle) / denominator;
    targetCenterX = centerX + diamondX * Math.min(width * 0.24, mobile ? 88 : 132);
    targetCenterY = topY + 38 + squad * (mobile ? 92 : 108) + diamondY * (mobile ? 44 : 52);
  } else if (mode === 'spiral') {
    const ringSize = Math.min(10, count);
    const ring = Math.floor(index / ringSize);
    const localIndex = index % ringSize;
    const localCount = Math.min(ringSize, count - ring * ringSize);
    const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
    targetCenterX = centerX + Math.cos(angle) * Math.min(width * (0.2 + ring * 0.08), mobile ? 104 : 158);
    targetCenterY = topY + 54 + ring * (mobile ? 82 : 96) + Math.sin(angle) * (mobile ? 40 : 52);
  } else if (mode === 'pincer') {
    const row = Math.floor(index / 2);
    targetCenterX = centerX + (index % 2 === 0 ? -1 : 1) * Math.min(width * 0.24, mobile ? 92 : 138);
    targetCenterY = topY + row * (mobile ? 40 : 46);
  } else {
    const columns = Math.min(mode === 'sine' ? (mobile ? 6 : 9) : (mobile ? 6 : 10), count);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const gapX = Math.min(mobile ? 54 : 66, (width - left * 2) / Math.max(1, columns - 1));
    targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX;
    targetCenterY = topY + row * (mobile ? 54 : 62) + (mode === 'sine' ? Math.sin(column * 1.25) * 24 : 0);
  }

  return {
    x: clamp(targetCenterX - entityWidth / 2, left - entityWidth / 2, right - entityWidth / 2),
    y: clamp(targetCenterY - entityHeight / 2, 54, height * 0.42)
  };
};

export const resolveConfiguredFormationSpawnPoint = ({
  event,
  index,
  count,
  viewport,
  randomSample
}: FormationSpawnPointInput): FormationPoint => {
  const { width, height } = viewport;
  const positionId = String(event.positionId || 'top-random').toLowerCase();
  const patternId = String(event.patternId || 'row').toLowerCase();
  const authoredDirection = normalizeEntryDirection(event.entryDirection);
  const entryPath = normalizeEntryPath(event.entryPath);
  const entryBehavior = normalizeEntryBehavior(event.entryBehavior);
  let x = clamp(Number(randomSample) || 0, 0, 0.999999999999) * Math.max(1, width - 56);
  let y = -60;

  if (positionId.includes('left')) x = width * 0.2;
  else if (positionId.includes('right')) x = width * 0.8;
  else if (positionId.includes('center')) x = width * 0.5;

  const anchor = normalizeAnchor(event.spawnAnchor);
  if (patternId.includes('single') || patternId.includes('random')) {
    if (!anchor && positionId.includes('fast')) y = 12;
    return anchor
      ? { x: anchor.x * width, y: anchor.y * height }
      : { x, y };
  }

  if (authoredDirection || entryPath || entryBehavior) {
    const side = getAuthoredEntrySide(event.id, index);
    const pair = Math.floor(index / 2);
    let direction = authoredDirection ?? 'top';
    if (entryBehavior === 'lane') direction = 'top';
    if (
      entryBehavior === 'flank'
      && direction === 'top'
    ) direction = 'split';

    if (direction === 'left' || direction === 'right' || direction === 'split') {
      const resolvedSide = direction === 'left'
        ? -1
        : direction === 'right'
          ? 1
          : side;
      const sideDepth = pair % 5;
      x = resolvedSide < 0
        ? -76 - sideDepth * 16
        : width + 76 + sideDepth * 16;
      y = Math.max(18, height * 0.065) + sideDepth * Math.min(28, height * 0.032);
      if (entryBehavior === 'dive') y -= Math.min(36, height * 0.04);
      return { x, y };
    }

    const spread = count <= 1 ? 0.5 : index / Math.max(1, count - 1);
    const seedNudge = ((getFormationGroupSeed(event.id) % 5) - 2) * 0.012;
    const topEntryRight = Math.max(20, width - 56);
    x = clamp(width * (0.12 + spread * 0.76 + seedNudge), 20, topEntryRight);
    y = -72 - (index % 3) * 18;
    if (entryPath?.includes('sweep-bank')) {
      x = side < 0 ? width * 0.08 : width * 0.92;
      y = -48 - pair * 14;
    } else if (entryPath?.includes('ring-assemble')) {
      const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
      x = clamp(
        width / 2 + Math.cos(angle) * Math.min(width * 0.36, 152),
        20,
        topEntryRight
      );
      y = -84 - Math.round((Math.sin(angle) + 1) * 18);
    } else if (entryBehavior === 'dive') {
      y = -56 - (index % 2) * 12;
    }
    return { x, y };
  }

  const mode = resolveConfiguredFormationMode(patternId);
  const side = (index + getFormationGroupSeed(event.id)) % 2 === 0 ? -1 : 1;
  const pair = Math.floor(index / 2);
  if (mode === 'pincer') {
    x = side < 0 ? -72 : width + 72;
    y = Math.max(24, height * 0.08) + pair * 22;
  } else if (mode === 'spiral') {
    const angle = index * 0.92;
    x = width / 2 + Math.cos(angle) * Math.min(width * 0.42, 190);
    y = -96 - pair * 18;
  } else if (mode === 'sine') {
    x = 24 + (index / Math.max(1, count - 1)) * Math.max(1, width - 72);
    y = -80 - (Math.sin(index * 1.35) + 1) * 30;
  } else {
    x = side < 0 ? -78 - (index % 3) * 18 : width + 78 + (index % 3) * 18;
    y = -104 - pair * 14;
  }

  return { x, y };
};

/**
 * Samples the presentation-neutral formation entry curve. Authored pack and
 * role metadata only changes offsets along the existing simulation path; the
 * target, hitbox, and completion state remain owned by the engine.
 */
export const resolveFormationEntryMotion = ({
  mode,
  index,
  groupSeed,
  progress,
  viewportWidth,
  entryDirection,
  entryPath,
  entryBehavior
}: FormationEntryMotionInput): FormationEntryMotion => {
  const normalizedProgress = clamp(Number(progress) || 0, 0, 1);
  const normalizedDirection = normalizeEntryDirection(entryDirection);
  const normalizedPath = normalizeEntryPath(entryPath);
  const normalizedBehavior = normalizeEntryBehavior(entryBehavior);
  const arcEnvelope = Math.sin(normalizedProgress * Math.PI);
  const legacyDirection = index % 2 === 0 ? 1 : -1;
  const baseArcStrength = mode === 'spiral'
    ? Math.min(viewportWidth * 0.2, 92)
    : mode === 'pincer'
      ? Math.min(viewportWidth * 0.14, 66)
      : Math.min(viewportWidth * 0.11, 52);

  if (!normalizedDirection && !normalizedPath && !normalizedBehavior) {
    const spiralOffset = mode === 'spiral'
      ? Math.sin(normalizedProgress * Math.PI * 2 + index * 0.55)
        * (1 - normalizedProgress)
        * 38
      : 0;
    return {
      xOffset: arcEnvelope * baseArcStrength * legacyDirection + spiralOffset,
      yOffset: -arcEnvelope * (mode === 'spiral' ? 42 : 26),
      angle: arcEnvelope * legacyDirection * (mode === 'spiral' ? 0.5 : 0.32)
    };
  }

  const authoredSide = (index + groupSeed) % 2 === 0 ? -1 : 1;
  const originSide = normalizedDirection === 'left'
    ? -1
    : normalizedDirection === 'right'
      ? 1
      : normalizedDirection === 'split'
        ? authoredSide
        : 0;
  const curveDirection = originSide === 0 ? legacyDirection : originSide < 0 ? 1 : -1;
  let arcScale = 1;
  let liftScale = 1;
  let bankScale = 1;
  let waveAmplitude = 0;
  let waveCycles = 2;

  if (normalizedPath?.includes('sweep-bank')) {
    arcScale = 1.55;
    liftScale = 0.9;
    bankScale = 1.35;
    waveAmplitude = 18;
  } else if (normalizedPath?.includes('formation-drop')) {
    arcScale = 0.35;
    liftScale = 0.55;
    bankScale = 0.7;
  } else if (normalizedPath?.includes('spiral-entry')) {
    arcScale = 1.1;
    liftScale = 1.25;
    bankScale = 1.2;
    waveAmplitude = 32;
    waveCycles = 4;
  } else if (normalizedPath?.includes('paired-flank')) {
    arcScale = 1.3;
    liftScale = 0.75;
    bankScale = 1.2;
    waveAmplitude = 14;
  } else if (normalizedPath?.includes('diamond-lock')) {
    arcScale = 0.65;
    liftScale = 0.7;
    bankScale = 0.85;
    waveAmplitude = 8;
  } else if (normalizedPath?.includes('double-helix')) {
    arcScale = 0.85;
    liftScale = 1.05;
    bankScale = 1.15;
    waveAmplitude = 28;
    waveCycles = 3;
  } else if (normalizedPath?.includes('side-wall')) {
    arcScale = 1.05;
    liftScale = 0.45;
    bankScale = 0.9;
    waveAmplitude = 10;
  } else if (normalizedPath?.includes('lane-stagger')) {
    arcScale = 0.25;
    liftScale = 0.45;
    bankScale = 0.6;
    waveAmplitude = 4;
  } else if (normalizedPath?.includes('ring-assemble')) {
    arcScale = 1.15;
    liftScale = 1;
    bankScale = 1.1;
    waveAmplitude = 26;
    waveCycles = 4;
  } else if (normalizedPath?.includes('armored-grid')) {
    arcScale = 0.3;
    liftScale = 0.55;
    bankScale = 0.7;
  }

  if (normalizedBehavior === 'dive') {
    arcScale *= 0.8;
    liftScale *= 1.25;
    bankScale *= 1.1;
    waveAmplitude *= 0.8;
  } else if (normalizedBehavior === 'flank') {
    arcScale *= 1.35;
    liftScale *= 0.75;
    bankScale *= 1.25;
    waveAmplitude *= 1.2;
  } else if (normalizedBehavior === 'lane') {
    arcScale *= 0.35;
    liftScale *= 0.55;
    bankScale *= 0.75;
    waveAmplitude *= 0.25;
  }

  const waveDirection = authoredSide < 0 ? -1 : 1;
  const pathWave = Math.sin(normalizedProgress * Math.PI * waveCycles)
    * arcEnvelope
    * waveAmplitude
    * waveDirection;
  return {
    xOffset: arcEnvelope * baseArcStrength * curveDirection * arcScale + pathWave,
    yOffset: -arcEnvelope * (mode === 'spiral' ? 42 : 26) * liftScale,
    angle: arcEnvelope
      * curveDirection
      * (mode === 'spiral' ? 0.5 : 0.32)
      * bankScale
  };
};

/**
 * Selects a compact combat verb from existing formation and role metadata.
 * This intentionally adds no authored schema or random state: a formation
 * always resolves to the same readable maneuver in Campaign and Director.
 */
export const resolveFormationManeuverKind = (
  mode: ConfiguredFormationMode,
  entryBehavior?: FormationEntryBehavior
): FormationManeuverKind => {
  const behavior = normalizeEntryBehavior(entryBehavior);
  if (behavior === 'flank') return 'crossing-flanks';
  if (behavior === 'lane') return 'sequential-peel';
  if (behavior === 'dive') return 'feint-dive';
  if (mode === 'pincer') return 'crossing-flanks';
  if (mode === 'spiral') return 'corkscrew';
  if (mode === 'sine') return 'feint-dive';
  if (mode === 'v' || mode === 'diamond') return 'synchronized-break';
  return 'sequential-peel';
};

/**
 * Samples one deterministic dive velocity. The caller still owns integration,
 * collision, and return-state transitions. Output speed is capped relative to
 * the authored enemy speed, so richer choreography never creates an unbounded
 * mobile simulation or an unreadable teleport.
 */
export const resolveFormationDiveMotion = ({
  mode,
  index,
  groupSize,
  groupSeed,
  cycle,
  ageFrames,
  baseSpeed,
  current,
  anchorX,
  player,
  playerVelocityX,
  viewportWidth,
  mobile,
  entryBehavior
}: FormationDiveMotionInput): FormationDiveMotion => {
  const maneuver = resolveFormationManeuverKind(mode, entryBehavior);
  const age = Math.max(0, Math.floor(Number(ageFrames) || 0));
  const speed = Math.max(2.2, Math.abs(Number(baseSpeed) || 0));
  const width = Math.max(240, Number(viewportWidth) || 0);
  const safeGroupSize = Math.max(1, Math.floor(Number(groupSize) || 1));
  const sequenceSide: -1 | 1 = (index + groupSeed + cycle) % 2 === 0 ? -1 : 1;
  const breakSide: -1 | 1 = index < safeGroupSize / 2 ? -1 : 1;
  const centeredIndex = index - ((safeGroupSize - 1) / 2);
  const readableLaneIndex = Math.abs(centeredIndex) < 0.001
    ? sequenceSide * 0.65
    : centeredIndex;
  const laneOffset = clamp(
    readableLaneIndex * (mobile ? 34 : 46),
    -width * 0.32,
    width * 0.32
  );
  const leadX = player.x + playerVelocityX * 6 + laneOffset;
  const aimX = clamp(leadX, 24, width - 24);
  const dx = aimX - current.x;
  const dy = Math.max(90, player.y - current.y);
  const aimLength = Math.max(1, Math.hypot(dx, dy));
  const aimVelocityX = (dx / aimLength) * speed;
  const aimVelocityY = Math.max(speed * 0.72, (dy / aimLength) * speed);
  let velocityX = aimVelocityX;
  let velocityY = aimVelocityY;
  let steering = 0.24;

  if (maneuver === 'crossing-flanks') {
    const crossingSide: -1 | 1 = anchorX <= width / 2 ? 1 : -1;
    const crossingProgress = clamp(age / 30, 0, 1);
    if (age < 30) {
      velocityX = crossingSide * speed * (1.22 - crossingProgress * 0.3)
        + aimVelocityX * crossingProgress * 0.32;
      velocityY = speed * (0.62 + crossingProgress * 0.34);
      steering = 0.3;
    } else {
      const settle = 1 - clamp((age - 30) / 32, 0, 1);
      velocityX = aimVelocityX * 1.08 + crossingSide * speed * settle * 0.38;
      velocityY = aimVelocityY * 1.08;
      steering = 0.1;
    }
  } else if (maneuver === 'synchronized-break') {
    const breakProgress = clamp(age / 14, 0, 1);
    if (age < 14) {
      velocityX = breakSide * speed * (1.08 - breakProgress * 0.22);
      velocityY = speed * (0.44 + breakProgress * 0.28);
      steering = 0.32;
    } else {
      const converge = clamp((age - 14) / 22, 0, 1);
      velocityX = (
        breakSide * speed * 0.46 * (1 - converge)
        + aimVelocityX * 1.15 * converge
      );
      velocityY = speed * 0.72 * (1 - converge) + aimVelocityY * 1.12 * converge;
      steering = 0.12;
    }
  } else if (maneuver === 'feint-dive') {
    if (age < 12) {
      velocityX = aimVelocityX * 0.25 + sequenceSide * speed * 0.75;
      velocityY = speed * 0.5;
      steering = 0.3;
    } else if (age < 22) {
      const feintProgress = (age - 12) / 10;
      velocityX = -sequenceSide * speed * (0.5 + feintProgress * 0.18);
      velocityY = -speed * (0.2 - feintProgress * 0.08);
      steering = 0.34;
    } else {
      const weave = Math.sin((age - 22) * 0.11 + (groupSeed % 17) * 0.13);
      velocityX = aimVelocityX * 1.1 + weave * sequenceSide * speed * 0.18;
      velocityY = aimVelocityY * 1.1;
      steering = 0.1;
    }
  } else if (maneuver === 'corkscrew') {
    const phase = age * 0.16
      + (index / safeGroupSize) * Math.PI * 2
      + (groupSeed % 17) * 0.11
      + cycle * 0.45;
    velocityX = aimVelocityX * 0.38 + Math.cos(phase) * speed * 1.02;
    velocityY = speed * (0.86 + Math.sin(phase) * 0.16);
    steering = 0.16;
  } else {
    const peelFrames = 14 + (index % 3) * 3;
    if (age < peelFrames) {
      const peelProgress = age / peelFrames;
      velocityX = sequenceSide * speed * (0.95 - peelProgress * 0.62)
        + aimVelocityX * peelProgress * 0.55;
      velocityY = speed * (0.48 + peelProgress * 0.37);
      steering = 0.28;
    } else {
      const weave = Math.sin((age - peelFrames) * 0.075 + (groupSeed % 13) * 0.17);
      velocityX = aimVelocityX * 1.05 + weave * sequenceSide * speed * 0.16;
      velocityY = aimVelocityY * 1.06;
      steering = 0.08;
    }
  }

  const maxSpeed = speed * 1.32;
  const outputSpeed = Math.hypot(velocityX, velocityY);
  if (outputSpeed > maxSpeed) {
    const scale = maxSpeed / outputSpeed;
    velocityX *= scale;
    velocityY *= scale;
  }
  const angle = clamp(
    Math.atan2(velocityX, Math.max(0.001, Math.abs(velocityY))) * 0.72,
    -0.62,
    0.62
  );

  return {
    maneuver,
    velocityX,
    velocityY,
    angle,
    steering
  };
};

const FORMATION_HOLD_FRAMES: Readonly<Record<ConfiguredFormationMode, number>> = Object.freeze({
  row: 92,
  v: 84,
  sine: 62,
  pincer: 54,
  grid: 104,
  diamond: 76,
  spiral: 68
});

export const resolveFormationEntryPlan = ({
  eventId,
  patternId,
  entryDirection,
  entryPath,
  entryBehavior,
  index,
  count,
  currentFrame,
  waveProgressFrames,
  baseVerticalSpeed,
  sideSentry,
  framesPerSecond,
  target
}: FormationEntryPlanInput): FormationEntryPlan => {
  const mode = resolveConfiguredFormationMode(patternId);
  const entryFrames = 44 + (index % 4) * 4 + (mode === 'spiral' ? 12 : 0);
  const diveCadence = mode === 'grid' ? 14 : mode === 'row' ? 14 : mode === 'v' ? 12 : 10;
  return {
    mode,
    index,
    groupSize: count,
    seed: waveProgressFrames + index * 19,
    groupSeed: getFormationGroupSeed(eventId),
    target,
    entryFrames,
    diveFrame: currentFrame
      + entryFrames
      + (sideSentry ? framesPerSecond * 12 : FORMATION_HOLD_FRAMES[mode])
      + (index % 6) * diveCadence,
    baseSpeed: Math.max(2.2, Math.abs(baseVerticalSpeed)),
    entryDirection: normalizeEntryDirection(entryDirection),
    entryPath: normalizeEntryPath(entryPath),
    entryBehavior: normalizeEntryBehavior(entryBehavior)
  };
};
