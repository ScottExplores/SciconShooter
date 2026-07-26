export type ConfiguredFormationMode =
  | 'row'
  | 'v'
  | 'sine'
  | 'pincer'
  | 'grid'
  | 'diamond'
  | 'spiral';

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
  let x = clamp(Number(randomSample) || 0, 0, 0.999999999999) * Math.max(1, width - 56);
  let y = -60;

  if (positionId.includes('left')) x = width * 0.2;
  else if (positionId.includes('right')) x = width * 0.8;
  else if (positionId.includes('center')) x = width * 0.5;

  const anchor = normalizeAnchor(event.spawnAnchor);
  if (patternId.includes('single') || patternId.includes('random')) {
    return anchor
      ? { x: anchor.x * width, y: anchor.y * height }
      : { x, y };
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

const FORMATION_HOLD_FRAMES: Readonly<Record<ConfiguredFormationMode, number>> = Object.freeze({
  row: 116,
  v: 106,
  sine: 72,
  pincer: 64,
  grid: 136,
  diamond: 96,
  spiral: 82
});

export const resolveFormationEntryPlan = ({
  eventId,
  patternId,
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
  const entryFrames = 52 + (index % 4) * 5 + (mode === 'spiral' ? 14 : 0);
  const diveCadence = mode === 'grid' ? 18 : mode === 'row' ? 20 : mode === 'v' ? 16 : 12;
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
    baseSpeed: Math.max(2.2, Math.abs(baseVerticalSpeed))
  };
};
