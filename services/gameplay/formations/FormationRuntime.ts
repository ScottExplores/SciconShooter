import type {
  FormationAttackBehaviorId,
  FormationBehaviorOverride,
  FormationEntryPathId,
  FormationFiringBehaviorId,
  FormationMovementId,
  FormationPackDefinition,
  FormationReturnBehaviorId,
  SpawnPatternId
} from '../../../game-config/types';

export type ConfiguredFormationMode =
  | 'row'
  | 'staggered-row'
  | 'v'
  | 'double-v'
  | 'sine'
  | 'pincer'
  | 'grid'
  | 'diamond'
  | 'crescent'
  | 'arc'
  | 'ring'
  | 'pods'
  | 'wheel'
  | 'snake'
  | 'escort'
  | 'shield-wall'
  | 'lanes'
  | 'spiral';

/**
 * How many hostiles ride in one escort ring before a second pod is started.
 * One leader plus a ring that still reads as a ring on a phone.
 */
export const ESCORT_POD_SIZE = 7;

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

export interface FormationSeparationMember extends FormationPoint {
  id: string;
  order: number;
  width: number;
  height: number;
}

export interface FormationSeparationBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ResolvedFormationSeparationPoint extends FormationPoint {
  id: string;
}

export interface FormationSlotTransitionInput {
  current: FormationPoint;
  previousTarget: FormationPoint;
  resolvedTarget: FormationPoint;
}

export interface FormationSlotTransitionPlan {
  changed: boolean;
  start: FormationPoint;
  target: FormationPoint;
  durationFrames: number;
}

export interface FormationSlotTransitionSampleInput {
  start: FormationPoint;
  target: FormationPoint;
  progress: number;
}

export interface FormationGeometryEvent {
  id: string;
  patternId?: string;
  positionId?: string;
  entryPathId?: FormationEntryPathId;
  spawnAnchor?: FormationPoint;
  formationSlots?: readonly FormationPoint[];
  enemySpriteKeys?: readonly string[];
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationChoreographyEvent {
  patternId?: SpawnPatternId | string;
  formationBehavior?: FormationBehaviorOverride;
}

export interface ResolvedFormationChoreography {
  entryPathId: FormationEntryPathId;
  movementId: FormationMovementId;
  attackId: FormationAttackBehaviorId;
  firingBehavior: FormationFiringBehaviorId;
  returnId: FormationReturnBehaviorId;
  holdSeconds: number;
  telegraphSeconds: number;
  attackDurationSeconds: number;
  recoverySeconds: number;
  attackGroupSize: number;
  attackCycles: number;
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
  entryPathId?: FormationEntryPathId;
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

/**
 * A complete member pose on the shared inbound ribbon used by authored
 * squadrons. Unlike `FormationEntryMotion`, this is an absolute simulation
 * position: the whole cohort follows one readable route before its local slot
 * blooms out of the procession.
 */
export interface FormationCohortEntryPoseInput {
  mode: ConfiguredFormationMode;
  index: number;
  count: number;
  groupSeed: number;
  progress: number;
  viewport: FormationViewport;
  entityWidth: number;
  entityHeight: number;
  start: FormationPoint;
  target: FormationPoint;
  entryDirection?: FormationEntryDirection;
  entryPath?: string;
  entryBehavior?: FormationEntryBehavior;
}

export interface FormationCohortEntryPose extends FormationPoint {
  angle: number;
  assemblyProgress: number;
  phase: 'procession' | 'maneuver' | 'assembly' | 'settle';
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
  attackId?: FormationAttackBehaviorId;
}

export interface FormationDiveMotion {
  maneuver: FormationManeuverKind;
  velocityX: number;
  velocityY: number;
  angle: number;
  steering: number;
}

export interface FormationMovementPointInput {
  movementId: FormationMovementId;
  base: FormationPoint;
  groupCenter: FormationPoint;
  frame: number;
  groupSeed: number;
  index: number;
  count: number;
  viewport: FormationViewport;
  transformCycle?: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

type MutableFormationSeparationMember = FormationSeparationMember & FormationPoint;

const clampSeparatedMember = (
  member: MutableFormationSeparationMember,
  bounds: FormationSeparationBounds
) => {
  member.x = clamp(member.x, bounds.minX, Math.max(bounds.minX, bounds.maxX - member.width));
  member.y = clamp(member.y, bounds.minY, Math.max(bounds.minY, bounds.maxY - member.height));
};

const separationMembersOverlap = (
  left: MutableFormationSeparationMember,
  right: MutableFormationSeparationMember,
  padding: number
) => (
  left.x < right.x + right.width + padding
  && left.x + left.width + padding > right.x
  && left.y < right.y + right.height + padding
  && left.y + left.height + padding > right.y
);

const buildPackedFormationFallback = (
  members: readonly MutableFormationSeparationMember[],
  bounds: FormationSeparationBounds,
  padding: number
): ResolvedFormationSeparationPoint[] => {
  const availableWidth = Math.max(1, bounds.maxX - bounds.minX);
  const availableHeight = Math.max(1, bounds.maxY - bounds.minY);
  const desiredMinX = Math.min(...members.map((member) => member.x));
  const desiredMaxX = Math.max(...members.map((member) => member.x + member.width));
  const desiredMinY = Math.min(...members.map((member) => member.y));
  const desiredMaxY = Math.max(...members.map((member) => member.y + member.height));
  const desiredRatio = clamp(
    (desiredMaxX - desiredMinX) / Math.max(1, desiredMaxY - desiredMinY),
    0.2,
    5
  );

  type PackedRow = { members: readonly MutableFormationSeparationMember[]; width: number; height: number };
  type PackedCandidate = { rows: readonly PackedRow[]; width: number; height: number; score: number };
  const candidates: PackedCandidate[] = [];

  for (let columnCount = 1; columnCount <= members.length; columnCount++) {
    const rows: PackedRow[] = [];
    for (let start = 0; start < members.length; start += columnCount) {
      const rowMembers = members.slice(start, start + columnCount);
      rows.push({
        members: rowMembers,
        width: rowMembers.reduce((total, member, index) => total + member.width + (index > 0 ? padding : 0), 0),
        height: Math.max(...rowMembers.map((member) => member.height))
      });
    }
    const width = Math.max(...rows.map((row) => row.width));
    const height = rows.reduce((total, row, index) => total + row.height + (index > 0 ? padding : 0), 0);
    const overflowX = Math.max(0, width - availableWidth) / availableWidth;
    const overflowY = Math.max(0, height - availableHeight) / availableHeight;
    const ratio = width / Math.max(1, height);
    candidates.push({
      rows,
      width,
      height,
      score: overflowX * 100 + overflowY * 100 + Math.abs(Math.log(Math.max(0.01, ratio) / desiredRatio))
    });
  }

  const layout = candidates.sort((left, right) => left.score - right.score)[0];
  const desiredCenterX = members.reduce((sum, member) => sum + member.x + member.width / 2, 0) / members.length;
  const desiredCenterY = members.reduce((sum, member) => sum + member.y + member.height / 2, 0) / members.length;
  const originX = clamp(
    desiredCenterX - layout.width / 2,
    bounds.minX,
    Math.max(bounds.minX, bounds.maxX - layout.width)
  );
  const originY = clamp(
    desiredCenterY - layout.height / 2,
    bounds.minY,
    Math.max(bounds.minY, bounds.maxY - layout.height)
  );

  const result: ResolvedFormationSeparationPoint[] = [];
  let rowY = originY;
  layout.rows.forEach((row) => {
    let memberX = originX + (layout.width - row.width) / 2;
    row.members.forEach((member) => {
      result.push({ id: member.id, x: memberX, y: rowY + (row.height - member.height) / 2 });
      memberX += member.width + padding;
    });
    rowY += row.height + padding;
  });
  return result;
};

/**
 * Separates a complete assembled squad using its live collision dimensions.
 * The solve starts from immutable per-frame desired points and is therefore
 * deterministic: it never accumulates drift or jitter from the previous tick.
 * A compact packing fallback handles formations whose authored topology cannot
 * physically fit their current heterogeneous hulls on a phone.
 */
export const resolveNonOverlappingFormationPositions = (
  inputMembers: readonly FormationSeparationMember[],
  bounds: FormationSeparationBounds,
  padding = 6
): ResolvedFormationSeparationPoint[] => {
  if (inputMembers.length === 0) return [];
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
  const members: MutableFormationSeparationMember[] = inputMembers
    .map((member) => ({
      ...member,
      x: Number.isFinite(member.x) ? member.x : bounds.minX,
      y: Number.isFinite(member.y) ? member.y : bounds.minY,
      width: Math.max(1, Number.isFinite(member.width) ? member.width : 1),
      height: Math.max(1, Number.isFinite(member.height) ? member.height : 1),
      order: Number.isFinite(member.order) ? member.order : 0
    }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  members.forEach((member) => clampSeparatedMember(member, bounds));
  for (let pass = 0; pass < 36; pass++) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < members.length; leftIndex++) {
      const left = members[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < members.length; rightIndex++) {
        const right = members[rightIndex];
        const dx = (right.x + right.width / 2) - (left.x + left.width / 2);
        const dy = (right.y + right.height / 2) - (left.y + left.height / 2);
        const overlapX = (left.width + right.width) / 2 + safePadding - Math.abs(dx);
        const overlapY = (left.height + right.height) / 2 + safePadding - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        if (overlapX <= overlapY) {
          const direction = dx === 0 ? (leftIndex % 2 === 0 ? 1 : -1) : Math.sign(dx);
          const shift = overlapX / 2 + 0.01;
          left.x -= direction * shift;
          right.x += direction * shift;
        } else {
          const direction = dy === 0 ? (leftIndex % 2 === 0 ? 1 : -1) : Math.sign(dy);
          const shift = overlapY / 2 + 0.01;
          left.y -= direction * shift;
          right.y += direction * shift;
        }
        clampSeparatedMember(left, bounds);
        clampSeparatedMember(right, bounds);
      }
    }
    if (!moved) break;
  }

  const hasOverlap = members.some((left, leftIndex) => (
    members.slice(leftIndex + 1).some((right) => separationMembersOverlap(left, right, safePadding))
  ));
  if (hasOverlap) return buildPackedFormationFallback(members, bounds, safePadding);
  return members.map((member) => ({ id: member.id, x: member.x, y: member.y }));
};

const dedupeFiniteOffsets = (values: readonly number[]) => [...new Set(
  values
    .filter(Number.isFinite)
    .map((value) => Math.round(value * 1000) / 1000)
)];

const hasReservedFormationOverlap = (
  member: FormationSeparationMember,
  reservations: readonly FormationSeparationMember[],
  padding: number
) => reservations.some((reserved) => separationMembersOverlap(
  member as MutableFormationSeparationMember,
  reserved as MutableFormationSeparationMember,
  padding
));

/**
 * Locks one complete cohort around immutable targets already reserved by other
 * concurrently assembling or holding cohorts. Existing cohorts never move.
 * A whole-cohort translation preserves the authored silhouette whenever it can;
 * a stable edge-packing fallback handles a tight mobile viewport.
 */
export const resolveNonOverlappingFormationCohortPositions = (
  inputMembers: readonly FormationSeparationMember[],
  inputReservations: readonly FormationSeparationMember[],
  bounds: FormationSeparationBounds,
  padding = 6
): ResolvedFormationSeparationPoint[] => {
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
  const separated = resolveNonOverlappingFormationPositions(inputMembers, bounds, safePadding);
  if (separated.length === 0 || inputReservations.length === 0) return separated;

  const memberById = new Map(inputMembers.map((member) => [member.id, member]));
  const members: FormationSeparationMember[] = separated.map((point) => {
    const source = memberById.get(point.id)!;
    return { ...source, x: point.x, y: point.y };
  });
  const reservations: FormationSeparationMember[] = inputReservations
    .map((member) => ({
      ...member,
      x: Number.isFinite(member.x) ? member.x : bounds.minX,
      y: Number.isFinite(member.y) ? member.y : bounds.minY,
      width: Math.max(1, Number.isFinite(member.width) ? member.width : 1),
      height: Math.max(1, Number.isFinite(member.height) ? member.height : 1)
    }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));

  const minX = Math.min(...members.map((member) => member.x));
  const maxX = Math.max(...members.map((member) => member.x + member.width));
  const minY = Math.min(...members.map((member) => member.y));
  const maxY = Math.max(...members.map((member) => member.y + member.height));
  const minimumDx = bounds.minX - minX;
  const maximumDx = bounds.maxX - maxX;
  const minimumDy = bounds.minY - minY;
  const maximumDy = bounds.maxY - maxY;
  const step = Math.max(10, safePadding * 2);
  const xOffsets = [clamp(0, minimumDx, maximumDx), minimumDx, maximumDx];
  const yOffsets = [clamp(0, minimumDy, maximumDy), minimumDy, maximumDy];
  for (let offset = minimumDx; offset <= maximumDx + 0.001; offset += step) xOffsets.push(offset);
  for (let offset = minimumDy; offset <= maximumDy + 0.001; offset += step) yOffsets.push(offset);
  members.forEach((member) => reservations.forEach((reserved) => {
    xOffsets.push(clamp(reserved.x - safePadding - member.width - member.x, minimumDx, maximumDx));
    xOffsets.push(clamp(reserved.x + reserved.width + safePadding - member.x, minimumDx, maximumDx));
    yOffsets.push(clamp(reserved.y - safePadding - member.height - member.y, minimumDy, maximumDy));
    yOffsets.push(clamp(reserved.y + reserved.height + safePadding - member.y, minimumDy, maximumDy));
  }));

  const shortlistAxisOffsets = (offsets: readonly number[], minimum: number, maximum: number) => {
    const sorted = dedupeFiniteOffsets(offsets).sort((left, right) => (
      Math.abs(left) - Math.abs(right) || left - right
    ));
    return dedupeFiniteOffsets([...sorted.slice(0, 64), minimum, maximum]);
  };
  const shortlistedXOffsets = shortlistAxisOffsets(xOffsets, minimumDx, maximumDx);
  const shortlistedYOffsets = shortlistAxisOffsets(yOffsets, minimumDy, maximumDy);
  const translations = shortlistedXOffsets.flatMap((x) => (
    shortlistedYOffsets.map((y) => ({ x, y }))
  )).sort((left, right) => (
    (left.x * left.x + left.y * left.y) - (right.x * right.x + right.y * right.y)
    || Math.abs(left.y) - Math.abs(right.y)
    || left.y - right.y
    || left.x - right.x
  ));
  const translation = translations.find((candidate) => members.every((member) => (
    !hasReservedFormationOverlap(
      { ...member, x: member.x + candidate.x, y: member.y + candidate.y },
      reservations,
      safePadding
    )
  )));
  if (translation) {
    return members.map((member) => ({
      id: member.id,
      x: member.x + translation.x,
      y: member.y + translation.y
    }));
  }

  const placed: FormationSeparationMember[] = [];
  const result: ResolvedFormationSeparationPoint[] = [];
  members
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .forEach((member) => {
      const obstacles = [...reservations, ...placed];
      const candidateXs = [
        member.x,
        bounds.minX,
        bounds.maxX - member.width,
        ...obstacles.flatMap((obstacle) => [
          obstacle.x - safePadding - member.width,
          obstacle.x + obstacle.width + safePadding
        ])
      ];
      const candidateYs = [
        member.y,
        bounds.minY,
        bounds.maxY - member.height,
        ...obstacles.flatMap((obstacle) => [
          obstacle.y - safePadding - member.height,
          obstacle.y + obstacle.height + safePadding
        ])
      ];
      const candidates = dedupeFiniteOffsets(candidateXs).flatMap((x) => (
        dedupeFiniteOffsets(candidateYs).map((y) => ({
          x: clamp(x, bounds.minX, Math.max(bounds.minX, bounds.maxX - member.width)),
          y: clamp(y, bounds.minY, Math.max(bounds.minY, bounds.maxY - member.height))
        }))
      )).sort((left, right) => (
        ((left.x - member.x) ** 2 + (left.y - member.y) ** 2)
        - ((right.x - member.x) ** 2 + (right.y - member.y) ** 2)
        || left.y - right.y
        || left.x - right.x
      ));
      const point = candidates.find((candidate) => !hasReservedFormationOverlap(
        { ...member, ...candidate },
        obstacles,
        safePadding
      )) ?? { x: member.x, y: member.y };
      const positioned = { ...member, ...point };
      placed.push(positioned);
      result.push({ id: member.id, x: point.x, y: point.y });
    });
  return result;
};

/**
 * Plans the one-time move from an authored slot to its collision-safe slot.
 * The live position is always the start of the move. Reusing the old target as
 * the start was the source of the visible one-frame snap when the last member
 * of a staggered squadron spawned.
 */
export const resolveFormationSlotTransition = ({
  current,
  previousTarget,
  resolvedTarget
}: FormationSlotTransitionInput): FormationSlotTransitionPlan => {
  const targetShift = Math.hypot(
    resolvedTarget.x - previousTarget.x,
    resolvedTarget.y - previousTarget.y
  );
  const travelDistance = Math.hypot(
    resolvedTarget.x - current.x,
    resolvedTarget.y - current.y
  );
  return {
    changed: targetShift > 0.01,
    start: { x: current.x, y: current.y },
    target: { x: resolvedTarget.x, y: resolvedTarget.y },
    // Roughly 0.3-0.6 seconds at 60 Hz. Longer corrections receive more time,
    // keeping the maximum per-frame travel bounded on narrow phones.
    durationFrames: Math.round(clamp(18 + travelDistance * 0.16, 20, 36))
  };
};

/** Pure fixed-step sample for a locked-slot settle; endpoints are exact. */
export const sampleFormationSlotTransition = ({
  start,
  target,
  progress
}: FormationSlotTransitionSampleInput): FormationPoint => {
  const normalizedProgress = clamp(Number(progress) || 0, 0, 1);
  const eased = start.y < 0
    // The last member may lock its collision-safe slot while it is still above
    // the viewport. Reveal that correction promptly, then settle gently; an
    // on-screen member keeps the symmetric no-snap transition below.
    ? 1 - Math.pow(1 - normalizedProgress, 2.4)
    : normalizedProgress * normalizedProgress * (3 - 2 * normalizedProgress);
  return {
    x: start.x + (target.x - start.x) * eased,
    y: start.y + (target.y - start.y) * eased
  };
};

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

interface FormationEntryPathProfile {
  /** Fixed-step travel time before per-member cadence variation. */
  entryFrames: number;
  /** Width of the shared maneuver, expressed as a viewport-width ratio. */
  lateralScale: number;
  /** Number of visual turns/braids sampled during the maneuver phase. */
  turns: number;
  /** When the compact procession begins blooming into authored slots. */
  bloomStart: number;
}

/**
 * Every authored path has a complete motion profile. Keeping this exhaustive
 * prevents newly authored IDs from silently degrading into the same diagonal
 * lerp. Values target a 60 Hz fixed step and intentionally give the spiral,
 * helix, pod, and convoy routes enough time to read on a phone.
 */
const FORMATION_ENTRY_PATH_PROFILES: Readonly<Record<FormationEntryPathId, FormationEntryPathProfile>> = Object.freeze({
  'sweep-bank-reentry': { entryFrames: 102, lateralScale: 0.22, turns: 0.65, bloomStart: 0.48 },
  'formation-drop': { entryFrames: 84, lateralScale: 0.07, turns: 0, bloomStart: 0.52 },
  'spiral-entry': { entryFrames: 132, lateralScale: 0.28, turns: 2.05, bloomStart: 0.58 },
  'paired-flank': { entryFrames: 104, lateralScale: 0.2, turns: 0.5, bloomStart: 0.5 },
  'diamond-lock': { entryFrames: 108, lateralScale: 0.14, turns: 0.5, bloomStart: 0.46 },
  'double-helix': { entryFrames: 126, lateralScale: 0.18, turns: 1.5, bloomStart: 0.56 },
  'side-wall-entry': { entryFrames: 96, lateralScale: 0.16, turns: 0.35, bloomStart: 0.48 },
  'lane-stagger': { entryFrames: 90, lateralScale: 0.08, turns: 0, bloomStart: 0.5 },
  'ring-assemble': { entryFrames: 138, lateralScale: 0.3, turns: 2.2, bloomStart: 0.6 },
  'armored-grid': { entryFrames: 94, lateralScale: 0.06, turns: 0, bloomStart: 0.5 },
  'mirrored-swoop': { entryFrames: 112, lateralScale: 0.2, turns: 0.75, bloomStart: 0.5 },
  'pod-converge': { entryFrames: 118, lateralScale: 0.2, turns: 0.8, bloomStart: 0.55 },
  'convoy-column': { entryFrames: 124, lateralScale: 0.12, turns: 0.6, bloomStart: 0.62 }
});

const getFormationEntryPathProfile = (
  path: string | undefined,
  mode: ConfiguredFormationMode
) => {
  const normalized = normalizeEntryPath(path) as FormationEntryPathId | undefined;
  return FORMATION_ENTRY_PATH_PROFILES[normalized ?? defaultEntryPathForMode(mode)];
};

export const resolveConfiguredFormationMode = (
  patternId?: string
): ConfiguredFormationMode => {
  const pattern = String(patternId || 'row').toLowerCase();
  if (pattern.includes('shield-wall')) return 'shield-wall';
  if (pattern.includes('staggered-row')) return 'staggered-row';
  if (pattern.includes('double-v')) return 'double-v';
  if (pattern.includes('crescent')) return 'crescent';
  if (pattern === 'arc' || pattern.includes('arc-')) return 'arc';
  if (pattern.includes('ring')) return 'ring';
  if (pattern.includes('wheel')) return 'wheel';
  if (pattern.includes('snake') || pattern.includes('chain')) return 'snake';
  // Checked before the bare 'v' match. Existing escort-pod and pod-converge
  // events retain the guarded-pod geometry, while the authored plural `pods`
  // preset remains an independent choreography shape.
  if (pattern.includes('escort') || pattern.includes('convoy')) return 'escort';
  if (pattern === 'pod' || pattern.includes('pod-')) return 'escort';
  if (pattern.includes('pods')) return 'pods';
  if (pattern === 'lanes' || pattern.includes('lane-')) return 'lanes';
  if (pattern.includes('grid') || pattern.includes('wall')) return 'grid';
  if (pattern.includes('diamond')) return 'diamond';
  if (pattern.includes('spiral')) return 'spiral';
  if (pattern.includes('pincer')) return 'pincer';
  if (pattern.includes('sine') || pattern.includes('wave')) return 'sine';
  if (pattern.includes('v')) return 'v';
  return 'row';
};

const defaultEntryPathForMode = (mode: ConfiguredFormationMode): FormationEntryPathId => {
  if (mode === 'spiral' || mode === 'wheel') return 'spiral-entry';
  if (mode === 'pincer') return 'paired-flank';
  if (mode === 'diamond' || mode === 'crescent' || mode === 'arc') return 'diamond-lock';
  if (mode === 'ring') return 'ring-assemble';
  if (mode === 'pods') return 'pod-converge';
  if (mode === 'escort') return 'convoy-column';
  if (mode === 'shield-wall' || mode === 'lanes') return 'lane-stagger';
  if (mode === 'snake' || mode === 'sine') return 'double-helix';
  if (mode === 'grid') return 'formation-drop';
  return 'mirrored-swoop';
};

const defaultMovementForMode = (mode: ConfiguredFormationMode): FormationMovementId => {
  if (mode === 'wheel' || mode === 'ring' || mode === 'spiral') return 'rotating-wheel';
  if (mode === 'crescent' || mode === 'arc' || mode === 'diamond') return 'expand-collapse';
  if (mode === 'snake' || mode === 'sine') return 'snake-weave';
  if (mode === 'pods' || mode === 'double-v') return 'split-pods';
  if (mode === 'lanes' || mode === 'shield-wall') return 'lane-shift';
  if (mode === 'pincer') return 'lateral-sweep';
  return 'gentle-drift';
};

const defaultAttackForMode = (mode: ConfiguredFormationMode): FormationAttackBehaviorId => {
  if (mode === 'pincer') return 'pincer-pass';
  if (mode === 'ring' || mode === 'wheel' || mode === 'spiral') return 'ring-collapse';
  if (mode === 'double-v' || mode === 'pods') return 'alternating-wings';
  if (mode === 'escort') return 'leader-escorts';
  if (mode === 'shield-wall' || mode === 'lanes') return 'lane-pass';
  if (mode === 'diamond' || mode === 'crescent' || mode === 'arc') return 'diagonal-groups';
  if (mode === 'row' || mode === 'staggered-row' || mode === 'grid') return 'row-sequence';
  return 'paired-dive';
};

/** Resolves pack defaults plus a Wave's surgical choreography overrides. */
export const resolveFormationChoreography = (
  event: FormationChoreographyEvent,
  pack?: FormationPackDefinition
): ResolvedFormationChoreography => {
  const mode = resolveConfiguredFormationMode(event.patternId);
  const override = event.formationBehavior;
  return {
    entryPathId: override?.entryPathId ?? pack?.entryPath ?? defaultEntryPathForMode(mode),
    movementId: override?.movementId ?? pack?.movementBehavior ?? defaultMovementForMode(mode),
    attackId: override?.attackId ?? pack?.attackBehavior ?? defaultAttackForMode(mode),
    firingBehavior: override?.firingBehavior ?? pack?.firingBehavior ?? 'post-formation',
    returnId: override?.returnId ?? pack?.returnBehavior ?? 'reform',
    holdSeconds: clamp(override?.holdSeconds ?? pack?.holdSeconds ?? 1.5, 0.35, 12),
    telegraphSeconds: clamp(override?.telegraphSeconds ?? pack?.telegraphSeconds ?? 0.65, 0.2, 4),
    attackDurationSeconds: clamp(
      override?.attackDurationSeconds ?? pack?.attackDurationSeconds ?? 1.25,
      0.3,
      8
    ),
    recoverySeconds: clamp(override?.recoverySeconds ?? pack?.attackRecoverySeconds ?? 1.25, 0.35, 12),
    attackGroupSize: Math.max(1, Math.floor(override?.attackGroupSize ?? pack?.attackGroupSize ?? 2)),
    attackCycles: Math.max(0, Math.floor(override?.attackCycles ?? pack?.attackCycles ?? 0))
  };
};

/** Deterministic subgroup selection keeps every authored attack readable and replayable. */
export const resolveFormationAttackIndices = (
  attackId: FormationAttackBehaviorId,
  cycle: number,
  count: number,
  requestedGroupSize: number
) => {
  const size = Math.max(0, Math.floor(count));
  if (size === 0) return [];
  const groupSize = Math.min(size, Math.max(1, Math.floor(requestedGroupSize)));
  const normalizedCycle = Math.max(0, Math.floor(cycle));
  const unique = (values: number[]) => [...new Set(values.map((value) => ((value % size) + size) % size))]
    .slice(0, groupSize);

  if (attackId === 'paired-dive' || attackId === 'pincer-pass') {
    const offset = normalizedCycle % Math.ceil(size / 2);
    return unique([offset, size - 1 - offset]);
  }
  if (attackId === 'alternating-wings' || attackId === 'split-hunt') {
    const half = Math.max(1, Math.ceil(size / 2));
    const start = normalizedCycle % 2 === 0 ? 0 : Math.floor(size / 2);
    return unique(Array.from({ length: groupSize }, (_, index) => start + (index % half)));
  }
  if (attackId === 'leader-escorts') {
    const leader = Math.floor((size - 1) / 2);
    const values = [leader];
    for (let distance = 1; values.length < groupSize; distance++) values.push(leader - distance, leader + distance);
    return unique(values);
  }
  if (attackId === 'diagonal-groups') {
    const parity = normalizedCycle % 2;
    return unique(Array.from({ length: size }, (_, index) => index).filter((index) => index % 2 === parity));
  }
  if (attackId === 'ring-collapse') {
    const step = Math.max(1, Math.floor(size / groupSize));
    return unique(Array.from({ length: groupSize }, (_, index) => normalizedCycle + index * step));
  }
  if (attackId === 'sweep-strafe') {
    const reverse = normalizedCycle % 2 === 1;
    return unique(Array.from({ length: groupSize }, (_, index) => reverse ? size - 1 - index : index));
  }

  const start = (normalizedCycle * groupSize) % size;
  return unique(Array.from({ length: groupSize }, (_, index) => start + index));
};

export const isFormationVolleyAttack = (attackId: FormationAttackBehaviorId) => (
  attackId === 'aimed-volley' || attackId === 'spread-volley'
);

/**
 * Shapes the loose `single-*`/`*-random` spawn groups fly.
 *
 * These groups are deliberately excluded from formation-pack budgeting, so
 * their shape is presentation only and can vary freely. Every one of them used
 * to fall through to `row`, which is why the loose traffic in a Mission all
 * looked the same. Picking from the event id keeps a given group's shape stable
 * across runs and previews while giving a Mission real squadron variety.
 */
const LOOSE_FORMATION_SHAPES: readonly ConfiguredFormationMode[] = Object.freeze([
  'v',
  'sine',
  'diamond',
  'pincer',
  'grid',
  'spiral'
]);
// Dropping a shape from this table was tried and does not help: removing
// 'sine' left the same number of dead-air breaches, simply relocated to other
// waves, and cost clears as well. Loose shape variety has a small, uniform
// pacing cost against a baseline that was tuned when every loose group flew
// 'row'. It is paid back in authored spawn timing on the specific waves that
// breach, not by shrinking the vocabulary.

export const isLooseFormationPattern = (patternId?: string) => {
  const pattern = String(patternId || '').toLowerCase();
  return pattern.includes('single') || pattern.includes('random');
};

export const resolveLooseFormationMode = (
  eventId: string,
  patternId?: string
): ConfiguredFormationMode => {
  if (!isLooseFormationPattern(patternId)) return resolveConfiguredFormationMode(patternId);
  const seed = getFormationGroupSeed(eventId);
  return LOOSE_FORMATION_SHAPES[seed % LOOSE_FORMATION_SHAPES.length];
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

  const mode = resolveLooseFormationMode(event.id, event.patternId);
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
  } else if (mode === 'ring' || mode === 'wheel') {
    const ringSize = Math.min(12, count);
    const ring = Math.floor(index / ringSize);
    const localIndex = index % ringSize;
    const localCount = Math.min(ringSize, count - ring * ringSize);
    const angle = (localIndex / Math.max(1, localCount)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = Math.min(width * (0.2 + ring * 0.07), mobile ? 92 + ring * 24 : 142 + ring * 30);
    const radiusY = mobile ? 42 + ring * 20 : 52 + ring * 24;
    targetCenterX = centerX + Math.cos(angle) * radiusX;
    targetCenterY = topY + 58 + ring * (mobile ? 70 : 82) + Math.sin(angle) * radiusY;
  } else if (mode === 'crescent' || mode === 'arc') {
    const progress = count <= 1 ? 0.5 : index / (count - 1);
    const angle = Math.PI * (0.12 + progress * 0.76);
    const radiusX = Math.min(width * 0.38, mobile ? 150 : 230);
    const radiusY = mobile ? 72 : 88;
    targetCenterX = centerX + Math.cos(angle) * radiusX;
    targetCenterY = topY + Math.sin(angle) * radiusY + (mode === 'crescent' ? Math.abs(progress - 0.5) * 28 : 0);
  } else if (mode === 'pods') {
    const podCount = count >= 8 ? 4 : 2;
    const pod = index % podCount;
    const member = Math.floor(index / podCount);
    const columns = podCount === 4 ? [-1.35, -0.45, 0.45, 1.35] : [-0.8, 0.8];
    targetCenterX = centerX + columns[pod] * Math.min(width * 0.2, mobile ? 70 : 104) + (member % 2) * 18 - 9;
    targetCenterY = topY + member * (mobile ? 42 : 48) + (pod % 2) * 18;
  } else if (mode === 'snake') {
    const progress = count <= 1 ? 0 : index / (count - 1);
    targetCenterX = centerX + Math.sin(progress * Math.PI * 2.35 - Math.PI / 2) * Math.min(width * 0.31, mobile ? 118 : 188);
    targetCenterY = topY + progress * Math.min(height * 0.26, mobile ? 210 : 248);
  } else if (mode === 'shield-wall' || mode === 'lanes') {
    const columns = Math.min(mode === 'lanes' ? 4 : (mobile ? 5 : 7), count);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const gapX = Math.min(mode === 'lanes' ? (mobile ? 72 : 96) : (mobile ? 58 : 72), (width - left * 2) / Math.max(1, columns - 1));
    targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX;
    targetCenterY = topY + row * (mode === 'lanes' ? (mobile ? 76 : 88) : (mobile ? 44 : 50));
  } else if (mode === 'grid' || mode === 'staggered-row') {
    const columns = Math.min(mobile ? 5 : 8, Math.max(3, Math.ceil(Math.sqrt(count * 1.45))));
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    const gapX = Math.min(mobile ? 58 : 70, (width - left * 2) / Math.max(1, columns - 1));
    targetCenterX = centerX + (column - (rowCount - 1) / 2) * gapX
      + (mode === 'staggered-row' && row % 2 === 1 ? gapX * 0.5 : 0);
    targetCenterY = topY + row * (mobile ? 48 : 56);
  } else if (mode === 'v' || mode === 'double-v') {
    const squadSize = Math.min(7, count);
    const squad = Math.floor(index / squadSize);
    const localIndex = index % squadSize;
    const localCount = Math.min(squadSize, count - squad * squadSize);
    const offset = localIndex - (localCount - 1) / 2;
    const gapX = Math.min(mobile ? 48 : 58, (width - left * 2) / Math.max(1, localCount - 1));
    targetCenterX = centerX + offset * gapX;
    targetCenterY = topY + squad * (mobile ? 70 : 78) + Math.abs(offset) * (mobile ? 17 : 20);
    if (mode === 'double-v' && squad % 2 === 1) targetCenterX += (squad % 4 === 1 ? -1 : 1) * (mobile ? 42 : 58);
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
  } else if (mode === 'escort') {
    // Elite pod: one leader holds the pod centre and its escorts ring it, so
    // the player reads "guarded target" and has to break the ring to reach the
    // thing actually worth shooting. Pods tile left-to-right across the lane.
    const pod = Math.floor(index / ESCORT_POD_SIZE);
    const localIndex = index % ESCORT_POD_SIZE;
    const podCount = Math.max(1, Math.ceil(count / ESCORT_POD_SIZE));
    const podSpacing = Math.min(width * 0.42, mobile ? 150 : 210);
    const podCenterX = centerX + (pod - (podCount - 1) / 2) * podSpacing;
    const podCenterY = topY + 46 + (pod % 2) * (mobile ? 34 : 42);
    if (localIndex === 0) {
      targetCenterX = podCenterX;
      targetCenterY = podCenterY;
    } else {
      const escortCount = Math.max(1, Math.min(ESCORT_POD_SIZE, count - pod * ESCORT_POD_SIZE) - 1);
      const angle = ((localIndex - 1) / escortCount) * Math.PI * 2 - Math.PI / 2;
      targetCenterX = podCenterX + Math.cos(angle) * Math.min(width * 0.15, mobile ? 52 : 74);
      targetCenterY = podCenterY + Math.sin(angle) * (mobile ? 40 : 54);
    }
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
  const entryPathId = event.entryPathId
    ?? entryPath as FormationEntryPathId | undefined
    ?? defaultEntryPathForMode(resolveConfiguredFormationMode(patternId));
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

  const side = (index + getFormationGroupSeed(event.id)) % 2 === 0 ? -1 : 1;
  const pair = Math.floor(index / 2);
  let direction = authoredDirection ?? 'top';
  if (entryBehavior === 'lane') direction = 'top';
  if (entryBehavior === 'flank' && direction === 'top') direction = 'split';

  // Direction is an independent authored dimension. Side and split entries
  // retain main's off-screen lanes; top entries are then shaped by the resolved
  // choreography path (pack default or per-Wave override).
  if (direction === 'left' || direction === 'right' || direction === 'split') {
    const resolvedSide = direction === 'left' ? -1 : direction === 'right' ? 1 : side;
    const sideDepth = pair % 5;
    x = resolvedSide < 0
      ? -76 - sideDepth * 16
      : width + 76 + sideDepth * 16;
    y = Math.max(18, height * 0.065) + sideDepth * Math.min(28, height * 0.032);
  } else if (entryPathId === 'formation-drop' || entryPathId === 'armored-grid') {
    // Grid members enter as a compact three-lane procession and bloom outward
    // near the hold area. Spawning every column over its final slot was the
    // visual equivalent of dropping unrelated enemies from the ceiling.
    x = width / 2 + ((index % 3) - 1) * Math.min(22, width * 0.055);
    y = -74 - Math.floor(index / 3) * 16;
  } else if (entryPathId === 'paired-flank' || entryPathId === 'mirrored-swoop' || entryPathId === 'side-wall-entry') {
    x = side < 0 ? -72 : width + 72;
    y = Math.max(24, height * 0.08) + pair * 22;
  } else if (entryPathId === 'spiral-entry' || entryPathId === 'ring-assemble') {
    // Two close gates feed the same orbital ribbon. The spiral is created by
    // the shared fixed-step sampler, not by scattering starting positions.
    x = width / 2 + side * Math.min(width * 0.26, 102);
    y = -88 - pair * 13;
  } else if (entryPathId === 'double-helix') {
    x = width / 2 + side * Math.min(24, width * 0.06);
    y = -82 - pair * 15;
  } else if (entryPathId === 'lane-stagger') {
    const lanes = Math.min(5, Math.max(2, count));
    x = ((index % lanes) + 0.5) * (width / lanes);
    y = -90 - Math.floor(index / lanes) * 42;
  } else if (entryPathId === 'pod-converge') {
    const pod = index % (count >= 8 ? 4 : 2);
    x = count >= 8
      ? [width * 0.08, width * 0.32, width * 0.68, width * 0.92][pod]
      : (pod === 0 ? width * 0.12 : width * 0.88);
    y = -80 - Math.floor(index / (count >= 8 ? 4 : 2)) * 30;
  } else if (entryPathId === 'convoy-column') {
    x = width / 2 + side * (index % 3) * 22;
    y = -90 - index * 34;
  } else {
    x = side < 0 ? -78 - (index % 3) * 18 : width + 78 + (index % 3) * 18;
    y = -104 - pair * 14;
  }

  if (entryBehavior === 'dive') y -= Math.min(36, height * 0.04);

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

const smoothUnit = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const mix = (start: number, end: number, progress: number) => (
  start + (end - start) * progress
);

const cubicBezier = (
  start: number,
  controlA: number,
  controlB: number,
  end: number,
  progress: number
) => {
  const inverse = 1 - progress;
  return inverse * inverse * inverse * start
    + 3 * inverse * inverse * progress * controlA
    + 3 * inverse * progress * progress * controlB
    + progress * progress * progress * end;
};

const sampleFormationCohortRoutePoint = (
  input: FormationCohortEntryPoseInput,
  sampleProgress: number
): FormationPoint & { assemblyProgress: number } => {
  const progress = clamp(sampleProgress, 0, 1);
  const path = (normalizeEntryPath(input.entryPath)
    ?? defaultEntryPathForMode(input.mode)) as FormationEntryPathId;
  const profile = getFormationEntryPathProfile(path, input.mode);
  const direction = normalizeEntryDirection(input.entryDirection);
  const behavior = normalizeEntryBehavior(input.entryBehavior);
  const viewportWidth = Math.max(1, input.viewport.width);
  const viewportHeight = Math.max(1, input.viewport.height);
  const memberSide = (input.index + input.groupSeed) % 2 === 0 ? -1 : 1;
  const originSide = direction === 'left'
    ? -1
    : direction === 'right'
      ? 1
      : direction === 'split'
        ? memberSide
        : 0;
  const routeSide = originSide || memberSide;
  const anchorX = viewportWidth / 2 - input.entityWidth / 2;
  const anchorY = clamp(
    viewportHeight * 0.185 - input.entityHeight / 2,
    54,
    viewportHeight * 0.32
  );
  const sideControl = originSide === 0 ? memberSide * viewportWidth * 0.1 : originSide * viewportWidth * 0.2;
  const controlAX = originSide === 0
    ? mix(input.start.x, anchorX + sideControl, 0.34)
    : input.start.x - originSide * viewportWidth * 0.22;
  const controlAY = originSide === 0
    ? Math.max(-24, viewportHeight * 0.035)
    : clamp(input.start.y + viewportHeight * 0.08, 24, viewportHeight * 0.2);
  const controlBX = anchorX + sideControl * (behavior === 'flank' ? 1.35 : behavior === 'lane' ? 0.45 : 0.85);
  const controlBY = anchorY - viewportHeight * (behavior === 'dive' ? 0.12 : 0.075);
  // Pull the shared route onto the screen quickly, then spend the remainder
  // of the deliberately long entry on visible spirals, braids, and assembly.
  // A linear base curve left a late cohort completely offscreen after the
  // previous group was cleared, creating dead air even though its simulation
  // was active. The maneuver envelope below remains on linear fixed-step time,
  // so this changes visibility rather than shortening the authored arrival.
  const approachProgress = 1 - Math.pow(1 - progress, 2.15);
  let x = cubicBezier(input.start.x, controlAX, controlBX, anchorX, approachProgress);
  let y = cubicBezier(input.start.y, controlAY, controlBY, anchorY, approachProgress);

  const envelope = Math.pow(Math.sin(progress * Math.PI), 0.82);
  const turnPhase = progress * Math.PI * 2 * profile.turns + (input.groupSeed % 17) * 0.035;
  const lateral = Math.min(viewportWidth * profile.lateralScale, 122);

  if (path === 'spiral-entry' || path === 'ring-assemble') {
    // One shrinking orbital ribbon. Members share its center/tangent and only
    // take on their final slot during the late bloom.
    x += Math.cos(turnPhase) * lateral * envelope;
    y += Math.sin(turnPhase) * lateral * 0.38 * envelope;
  } else if (path === 'double-helix') {
    // Even and odd members occupy opposite sides of the same moving
    // centerline, producing a legible braid instead of unrelated sine lerps.
    const strand = input.index % 2 === 0 ? -1 : 1;
    x += Math.sin(turnPhase) * lateral * strand * envelope;
    y += Math.cos(turnPhase) * Math.min(20, lateral * 0.22) * strand * envelope;
  } else if (path === 'paired-flank' || path === 'mirrored-swoop' || path === 'side-wall-entry') {
    x += routeSide * Math.sin(progress * Math.PI * Math.max(0.5, profile.turns)) * lateral * envelope;
    y -= Math.sin(progress * Math.PI) * Math.min(34, lateral * 0.3);
  } else if (path === 'sweep-bank-reentry') {
    x += routeSide * Math.sin(turnPhase) * lateral * envelope;
    y -= Math.sin(progress * Math.PI) * Math.min(46, lateral * 0.38);
  } else if (path === 'diamond-lock') {
    x += memberSide * Math.sin(progress * Math.PI * 2) * lateral * 0.58 * envelope;
    y -= Math.abs(Math.sin(progress * Math.PI * 2)) * Math.min(28, lateral * 0.3) * envelope;
  } else if (path === 'pod-converge') {
    const podCount = Math.min(4, Math.max(2, Math.ceil(input.count / 3)));
    const pod = input.index % podCount;
    const podOffset = pod - (podCount - 1) / 2;
    x += podOffset * Math.min(24, lateral * 0.28) * envelope;
    y += Math.sin(turnPhase + pod) * 8 * envelope;
  } else if (path === 'convoy-column') {
    x += Math.sin(turnPhase) * lateral * 0.42 * envelope;
    y -= Math.floor(input.index / 2) * 3.5 * envelope;
  } else if (path === 'lane-stagger') {
    const lane = input.index % Math.min(5, Math.max(2, input.count));
    x += (lane - (Math.min(5, Math.max(2, input.count)) - 1) / 2) * 5 * envelope;
  } else if (path === 'formation-drop' || path === 'armored-grid') {
    x += memberSide * Math.sin(progress * Math.PI) * lateral * 0.32;
    y -= Math.floor(input.index / 3) * 2.5 * envelope;
  }

  // A tiny local procession offset keeps multiple same-frame arrivals
  // readable without turning the route into a scattered cloud.
  const processionEnvelope = Math.sin(progress * Math.PI) * (1 - smoothUnit((progress - 0.45) / 0.4));
  x += ((input.index % 3) - 1) * 5 * processionEnvelope;
  y -= Math.floor(input.index / 3) * 3 * processionEnvelope;

  const assemblyProgress = smoothUnit(
    (progress - profile.bloomStart) / Math.max(0.001, 1 - profile.bloomStart)
  );
  return {
    x: mix(x, input.target.x, assemblyProgress),
    y: mix(y, input.target.y, assemblyProgress),
    assemblyProgress
  };
};

/**
 * Samples an absolute, fixed-step pose for one member of a shared inbound
 * squadron. The first and final samples are exact, and every intermediate
 * member uses the same deterministic center route. Rendering remains a pure
 * consumer of these simulation-owned positions.
 */
export const resolveFormationCohortEntryPose = (
  input: FormationCohortEntryPoseInput
): FormationCohortEntryPose => {
  const progress = clamp(Number(input.progress) || 0, 0, 1);
  const point = sampleFormationCohortRoutePoint(input, progress);
  const nextPoint = sampleFormationCohortRoutePoint(input, Math.min(1, progress + 0.006));
  const dx = nextPoint.x - point.x;
  const dy = nextPoint.y - point.y;
  const angle = progress >= 0.995
    ? 0
    : clamp(Math.atan2(dx, Math.max(0.001, dy)), -0.82, 0.82);
  const phase = progress < 0.25
    ? 'procession'
    : point.assemblyProgress <= 0.01
      ? 'maneuver'
      : point.assemblyProgress < 0.82
        ? 'assembly'
        : 'settle';
  return { ...point, angle, phase };
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

const resolveFormationAttackManeuverKind = (
  attackId: FormationAttackBehaviorId | undefined,
  fallback: FormationManeuverKind
): FormationManeuverKind => {
  if (attackId === 'ring-collapse') return 'corkscrew';
  if (attackId === 'pincer-pass' || attackId === 'sweep-strafe' || attackId === 'split-hunt') {
    return 'crossing-flanks';
  }
  if (attackId === 'alternating-wings' || attackId === 'diagonal-groups' || attackId === 'paired-dive') {
    return 'synchronized-break';
  }
  if (attackId === 'leader-escorts') return 'feint-dive';
  if (attackId === 'row-sequence' || attackId === 'lane-pass') return 'sequential-peel';
  return fallback;
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
  entryBehavior,
  attackId
}: FormationDiveMotionInput): FormationDiveMotion => {
  const maneuver = resolveFormationAttackManeuverKind(
    attackId,
    resolveFormationManeuverKind(mode, entryBehavior)
  );
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
  'staggered-row': 92,
  v: 84,
  'double-v': 84,
  sine: 62,
  pincer: 54,
  grid: 104,
  diamond: 76,
  crescent: 88,
  arc: 82,
  ring: 98,
  pods: 78,
  wheel: 92,
  snake: 72,
  'shield-wall': 112,
  lanes: 86,
  spiral: 68,
  // Escorts hold longest: the pod is meant to be dismantled in place before
  // anything peels off at the player.
  escort: 118
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
  target,
  entryPathId
}: FormationEntryPlanInput): FormationEntryPlan => {
  const mode = resolveLooseFormationMode(eventId, patternId);
  const legacyEntryPath = normalizeEntryPath(entryPath) as FormationEntryPathId | undefined;
  const resolvedEntryPath = entryPathId ?? legacyEntryPath ?? defaultEntryPathForMode(mode);
  const looseFormation = isLooseFormationPattern(patternId);
  const entryProfile = getFormationEntryPathProfile(resolvedEntryPath, mode);
  const entryFrames = looseFormation
    ? 44 + (index % 4) * 4 + (mode === 'spiral' ? 12 : 0)
    : entryProfile.entryFrames
      + (index % 3) * 3
      + (resolvedEntryPath === 'convoy-column' ? Math.floor(index / 2) * 2 : 0);
  const diveCadence = looseFormation
    ? mode === 'grid' || mode === 'row'
      ? 14
      : mode === 'v'
        ? 12
        : 10
    : mode === 'grid' || mode === 'shield-wall'
      ? 18
      : mode === 'row' || mode === 'staggered-row'
        ? 20
        : mode === 'v' || mode === 'double-v'
          ? 16
          : 12;
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

/** Group movement is sampled from immutable slot geometry, never accumulated. */
export const resolveFormationMovementPoint = ({
  movementId,
  base,
  groupCenter,
  frame,
  groupSeed,
  index,
  count,
  viewport,
  transformCycle = 0
}: FormationMovementPointInput): FormationPoint => {
  const phase = (frame + groupSeed) * 0.018;
  const memberPhase = phase + index * 0.42;
  let relativeX = base.x - groupCenter.x;
  let relativeY = base.y - groupCenter.y;
  let groupX = 0;
  let groupY = Math.sin(memberPhase * 1.7) * 2.5;

  if (movementId === 'lateral-sweep') {
    groupX = Math.sin(phase) * Math.min(viewport.width * 0.12, 58);
    groupY += Math.cos(phase * 1.4) * 4;
  } else if (movementId === 'expand-collapse') {
    const scale = 1 + Math.sin(phase * 1.25) * 0.13;
    relativeX *= scale;
    relativeY *= scale;
    groupX = Math.sin(phase * 0.72) * 10;
  } else if (movementId === 'rotating-wheel') {
    const angle = Math.sin(phase * 0.72) * 0.34 + transformCycle * 0.18;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedX = relativeX * cos - relativeY * sin;
    relativeY = relativeX * sin + relativeY * cos;
    relativeX = rotatedX;
  } else if (movementId === 'snake-weave') {
    groupX = Math.sin(memberPhase * 1.25) * Math.min(viewport.width * 0.055, 28);
    groupY += Math.cos(memberPhase * 1.05) * 6;
  } else if (movementId === 'split-pods') {
    const side = index < Math.ceil(count / 2) ? -1 : 1;
    groupX = side * (8 + (Math.sin(phase * 1.2) + 1) * 7);
  } else if (movementId === 'lane-shift') {
    groupX = Math.sin(phase * 0.88) * Math.min(viewport.width * 0.075, 34);
    groupY = Math.sin(memberPhase * 0.65) * 3;
  } else {
    groupX = Math.sin(phase) * Math.min(viewport.width * 0.045, 20);
  }

  if (transformCycle % 2 === 1) relativeX *= -1;
  return {
    x: groupCenter.x + relativeX + groupX,
    y: groupCenter.y + relativeY + groupY
  };
};
