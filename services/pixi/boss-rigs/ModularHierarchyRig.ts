export const MODULAR_BOSS_RIG_KIND = 'modular-hierarchy-v1' as const;
export const FIXED_FRAME_ANIMATION_KIND = 'fixed-frame-sequence-v1' as const;

export const MODULAR_BOSS_PART_ROLES = [
  'joint',
  'body',
  'armor',
  'arm',
  'weapon',
  'pod',
  'stabilizer',
  'exhaust',
  'effect',
  'phase-attachment',
  'decorative'
] as const;

export type ModularBossPartRole = (typeof MODULAR_BOSS_PART_ROLES)[number];

export const MODULAR_BOSS_SOCKET_ROLES = [
  'projectile-muzzle',
  'beam-origin',
  'detachable-pod',
  'core-origin',
  'melee-root',
  'effect-origin'
] as const;

export type ModularBossSocketRole = (typeof MODULAR_BOSS_SOCKET_ROLES)[number];

export interface ModularBossAtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ModularBossRigAtlas {
  readonly url: string;
  readonly contentHash: string;
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, ModularBossAtlasFrame>>;
}

export interface ModularBossLocalTransform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface ModularBossSpriteAnchor {
  readonly x: number;
  readonly y: number;
}

export interface ModularBossRigPart {
  readonly id: string;
  readonly role: ModularBossPartRole;
  readonly parentId: string | null;
  /** Null identifies a transform-only joint that creates no Pixi Sprite. */
  readonly frameId: string | null;
  readonly transform: ModularBossLocalTransform;
  readonly anchor: ModularBossSpriteAnchor | null;
  readonly layer: number;
  readonly visible: boolean;
}

export interface ModularBossFixedFrameAnimation {
  readonly kind: typeof FIXED_FRAME_ANIMATION_KIND;
  readonly id: string;
  readonly partId: string;
  readonly frameIds: readonly string[];
  readonly frameHold: number;
  readonly loop: boolean;
}

/**
 * One authored piece of a modular boss destruction sequence. Travel values
 * are total design-space displacement over the sequence, which keeps the
 * result deterministic and independent from render frame rate.
 */
export interface ModularBossDestructionFragment {
  readonly partId: string;
  readonly delayFrames: number;
  readonly travelX: number;
  readonly travelY: number;
  readonly rotationRadians: number;
}

export interface ModularBossDestructionSequence {
  readonly durationFrames: number;
  readonly fragments: readonly ModularBossDestructionFragment[];
}

export interface ModularBossRigSocket {
  readonly id: string;
  readonly role: ModularBossSocketRole;
  readonly partId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

export interface ModularBossRigManifest {
  readonly kind: typeof MODULAR_BOSS_RIG_KIND;
  readonly id: string;
  /** Authored neutral-pose bounds used to scale the rig into an entity box. */
  readonly designSize: Readonly<{ width: number; height: number }>;
  /**
   * Keeps structural pixels on one uniform scale when the simulation entity's
   * collision box has a different aspect ratio from the authored rig canvas.
   */
  readonly preserveAspectRatio?: boolean;
  /**
   * The primary atlas remains required for backward compatibility. Additional
   * atlases may extend the same globally unique frame namespace.
   */
  readonly atlas: ModularBossRigAtlas;
  readonly supplementalAtlases?: readonly ModularBossRigAtlas[];
  readonly parts: readonly ModularBossRigPart[];
  readonly animations: readonly ModularBossFixedFrameAnimation[];
  readonly sockets: readonly ModularBossRigSocket[];
  /** Optional explicit breakup used by the canonical Pixi death presenter. */
  readonly destruction?: ModularBossDestructionSequence;
}

export type ModularBossRigValidationCode =
  | 'invalid_type'
  | 'invalid_value'
  | 'out_of_bounds'
  | 'limit_exceeded'
  | 'duplicate_id'
  | 'missing_reference'
  | 'cycle';

export interface ModularBossRigValidationIssue {
  readonly path: string;
  readonly code: ModularBossRigValidationCode;
  readonly message: string;
}

export interface ModularBossAffineTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;
}

export interface ModularBossPartPoseOverride {
  readonly xOffset?: number;
  readonly yOffset?: number;
  readonly rotationOffset?: number;
  readonly scaleXMultiplier?: number;
  readonly scaleYMultiplier?: number;
  readonly frameId?: string;
  readonly alpha?: number;
  readonly visible?: boolean;
}

export type ModularBossRigPoseOverrides = Readonly<
  Record<string, ModularBossPartPoseOverride | undefined>
>;

export interface ResolvedModularBossRigPart {
  readonly id: string;
  readonly role: ModularBossPartRole;
  readonly parentId: string | null;
  readonly frameId: string | null;
  readonly frame: ModularBossAtlasFrame | null;
  readonly anchor: ModularBossSpriteAnchor | null;
  readonly layer: number;
  readonly alpha: number;
  readonly visible: boolean;
  readonly localTransform: ModularBossLocalTransform;
  readonly worldTransform: ModularBossAffineTransform;
}

export interface ResolvedModularBossRigSocket {
  readonly id: string;
  readonly role: ModularBossSocketRole;
  readonly partId: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldRotation: number;
  readonly worldTransform: ModularBossAffineTransform;
}

export interface ResolvedModularBossRigHierarchy {
  /** Stable render order: authored layer first, manifest declaration order second. */
  readonly parts: readonly ResolvedModularBossRigPart[];
  readonly partById: Readonly<Record<string, ResolvedModularBossRigPart>>;
  readonly sockets: readonly ResolvedModularBossRigSocket[];
  readonly socketById: Readonly<Record<string, ResolvedModularBossRigSocket>>;
}

export interface ModularBossRigRegistration {
  readonly manifest: ModularBossRigManifest;
  /** Primary atlas first, followed by authored supplemental atlases. */
  readonly atlases: readonly ModularBossRigAtlas[];
  /** Frozen global frame index spanning every registered atlas. */
  readonly frameById: Readonly<Record<string, ModularBossAtlasFrame>>;
  /** Frozen ownership index used by renderers to bind a frame to its sheet. */
  readonly atlasByFrameId: Readonly<Record<string, ModularBossRigAtlas>>;
  /** Parents always precede their descendants. */
  readonly topologicalPartIds: readonly string[];
  /** Stable layer/declaration order for Pixi display-list construction. */
  readonly renderPartIds: readonly string[];
  readonly partById: Readonly<Record<string, ModularBossRigPart>>;
  readonly animationById: Readonly<Record<string, ModularBossFixedFrameAnimation>>;
  readonly socketById: Readonly<Record<string, ModularBossRigSocket>>;
}

const MAX_ATLAS_FRAMES = 512;
const MAX_SUPPLEMENTAL_ATLASES = 8;
const MAX_TOTAL_ATLAS_FRAMES = 2_048;
const MAX_PARTS = 128;
const MAX_ANIMATIONS = 128;
const MAX_ANIMATION_FRAMES = 64;
const MAX_DESTRUCTION_FRAGMENTS = 32;
const MAX_DESTRUCTION_FRAMES = 600;
const MAX_SOCKETS = 128;
const MAX_ID_LENGTH = 96;
const MAX_ATLAS_SIZE = 16_384;
const MAX_ABSOLUTE_COORDINATE = 100_000;
const MAX_ABSOLUTE_ROTATION = Math.PI * 64;
const MAX_ABSOLUTE_SCALE = 32;
const MAX_ABSOLUTE_LAYER = 4_096;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const issue = (
  issues: ModularBossRigValidationIssue[],
  path: string,
  code: ModularBossRigValidationCode,
  message: string
) => {
  issues.push(Object.freeze({ path, code, message }));
};

const validateId = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[]
) => {
  if (typeof value !== 'string') {
    issue(issues, path, 'invalid_type', 'Expected a string identifier.');
    return false;
  }
  if (value.length === 0 || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) {
    issue(
      issues,
      path,
      'invalid_value',
      'Identifiers must be lowercase, bounded, and contain only letters, numbers, dot, dash, or underscore.'
    );
    return false;
  }
  return true;
};

const validateFinite = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[],
  minimum: number,
  maximum: number
) => {
  if (!isFiniteNumber(value)) {
    issue(issues, path, 'invalid_type', 'Expected a finite number.');
    return false;
  }
  if (value < minimum || value > maximum) {
    issue(issues, path, 'out_of_bounds', `Expected a value from ${minimum} through ${maximum}.`);
    return false;
  }
  return true;
};

const validateInteger = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[],
  minimum: number,
  maximum: number
) => {
  if (!Number.isInteger(value)) {
    issue(issues, path, 'invalid_type', 'Expected an integer.');
    return false;
  }
  return validateFinite(value, path, issues, minimum, maximum);
};

const validateStringMember = <T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  path: string,
  issues: ModularBossRigValidationIssue[]
) => {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    issue(issues, path, 'invalid_value', `Expected one of: ${allowedValues.join(', ')}.`);
    return false;
  }
  return true;
};

const validateAtlas = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[]
) => {
  if (!isRecord(value)) {
    issue(issues, path, 'invalid_type', 'Expected an atlas object.');
    return;
  }
  if (typeof value.url !== 'string' || value.url.length === 0 || value.url.length > 2_048) {
    issue(issues, `${path}/url`, 'invalid_value', 'Atlas URL must be a non-empty bounded string.');
  }
  if (typeof value.contentHash !== 'string' || !SHA256_PATTERN.test(value.contentHash)) {
    issue(issues, `${path}/contentHash`, 'invalid_value', 'Atlas contentHash must be a lowercase SHA-256 hex digest.');
  }
  const widthValid = validateInteger(value.width, `${path}/width`, issues, 1, MAX_ATLAS_SIZE);
  const heightValid = validateInteger(value.height, `${path}/height`, issues, 1, MAX_ATLAS_SIZE);
  if (!isRecord(value.frames)) {
    issue(issues, `${path}/frames`, 'invalid_type', 'Expected an atlas frame record.');
    return;
  }
  const entries = Object.entries(value.frames);
  if (entries.length === 0) {
    issue(issues, `${path}/frames`, 'invalid_value', 'At least one atlas frame is required.');
  }
  if (entries.length > MAX_ATLAS_FRAMES) {
    issue(issues, `${path}/frames`, 'limit_exceeded', `Atlas frame count exceeds ${MAX_ATLAS_FRAMES}.`);
  }
  entries.forEach(([frameId, frame], index) => {
    const framePath = `${path}/frames/${frameId || index}`;
    validateId(frameId, framePath, issues);
    if (!isRecord(frame)) {
      issue(issues, framePath, 'invalid_type', 'Expected an atlas frame object.');
      return;
    }
    const xValid = validateInteger(frame.x, `${framePath}/x`, issues, 0, MAX_ATLAS_SIZE);
    const yValid = validateInteger(frame.y, `${framePath}/y`, issues, 0, MAX_ATLAS_SIZE);
    const frameWidthValid = validateInteger(frame.width, `${framePath}/width`, issues, 1, MAX_ATLAS_SIZE);
    const frameHeightValid = validateInteger(frame.height, `${framePath}/height`, issues, 1, MAX_ATLAS_SIZE);
    if (
      widthValid
      && xValid
      && frameWidthValid
      && Number(frame.x) + Number(frame.width) > Number(value.width)
    ) {
      issue(issues, framePath, 'out_of_bounds', 'Frame extends beyond the atlas width.');
    }
    if (
      heightValid
      && yValid
      && frameHeightValid
      && Number(frame.y) + Number(frame.height) > Number(value.height)
    ) {
      issue(issues, framePath, 'out_of_bounds', 'Frame extends beyond the atlas height.');
    }
  });
};

const validatePartTransform = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[]
) => {
  if (!isRecord(value)) {
    issue(issues, path, 'invalid_type', 'Expected a local transform object.');
    return;
  }
  validateFinite(value.x, `${path}/x`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
  validateFinite(value.y, `${path}/y`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
  validateFinite(value.rotation, `${path}/rotation`, issues, -MAX_ABSOLUTE_ROTATION, MAX_ABSOLUTE_ROTATION);
  const scaleXValid = validateFinite(value.scaleX, `${path}/scaleX`, issues, -MAX_ABSOLUTE_SCALE, MAX_ABSOLUTE_SCALE);
  const scaleYValid = validateFinite(value.scaleY, `${path}/scaleY`, issues, -MAX_ABSOLUTE_SCALE, MAX_ABSOLUTE_SCALE);
  if (scaleXValid && value.scaleX === 0) {
    issue(issues, `${path}/scaleX`, 'invalid_value', 'Scale cannot be zero.');
  }
  if (scaleYValid && value.scaleY === 0) {
    issue(issues, `${path}/scaleY`, 'invalid_value', 'Scale cannot be zero.');
  }
};

const validateAnchor = (
  value: unknown,
  path: string,
  issues: ModularBossRigValidationIssue[]
) => {
  if (!isRecord(value)) {
    issue(issues, path, 'invalid_type', 'Expected a sprite anchor object.');
    return;
  }
  validateFinite(value.x, `${path}/x`, issues, 0, 1);
  validateFinite(value.y, `${path}/y`, issues, 0, 1);
};

const detectParentCycles = (
  partIds: readonly string[],
  parentById: Readonly<Record<string, string | null>>,
  issues: ModularBossRigValidationIssue[]
) => {
  const state: Record<string, 0 | 1 | 2> = Object.create(null) as Record<string, 0 | 1 | 2>;
  const stack: string[] = [];
  const visit = (partId: string) => {
    if (state[partId] === 2) return;
    if (state[partId] === 1) {
      const start = Math.max(0, stack.indexOf(partId));
      const cycleIds = [...stack.slice(start), partId];
      issue(
        issues,
        `/parts/${partId}/parentId`,
        'cycle',
        `Part hierarchy contains a cycle: ${cycleIds.join(' -> ')}.`
      );
      return;
    }
    state[partId] = 1;
    stack.push(partId);
    const parentId = parentById[partId];
    if (parentId && Object.prototype.hasOwnProperty.call(parentById, parentId)) {
      visit(parentId);
    }
    stack.pop();
    state[partId] = 2;
  };
  partIds.forEach(visit);
};

export const validateModularBossRigManifest = (
  value: unknown
): readonly ModularBossRigValidationIssue[] => {
  const issues: ModularBossRigValidationIssue[] = [];
  if (!isRecord(value)) {
    return Object.freeze([
      Object.freeze({
        path: '/',
        code: 'invalid_type' as const,
        message: 'Expected a modular boss rig manifest object.'
      })
    ]);
  }

  if (value.kind !== MODULAR_BOSS_RIG_KIND) {
    issue(issues, '/kind', 'invalid_value', `Expected ${MODULAR_BOSS_RIG_KIND}.`);
  }
  validateId(value.id, '/id', issues);
  if (!isRecord(value.designSize)) {
    issue(issues, '/designSize', 'invalid_type', 'Expected an authored design-size object.');
  } else {
    validateFinite(value.designSize.width, '/designSize/width', issues, 1, MAX_ATLAS_SIZE);
    validateFinite(value.designSize.height, '/designSize/height', issues, 1, MAX_ATLAS_SIZE);
  }
  if (
    value.preserveAspectRatio !== undefined
    && typeof value.preserveAspectRatio !== 'boolean'
  ) {
    issue(
      issues,
      '/preserveAspectRatio',
      'invalid_type',
      'Aspect-ratio preservation must be a boolean when provided.'
    );
  }
  validateAtlas(value.atlas, '/atlas', issues);
  const atlasCandidates: Array<Readonly<{ atlas: unknown; path: string }>> = [
    Object.freeze({ atlas: value.atlas, path: '/atlas' })
  ];
  if (value.supplementalAtlases !== undefined) {
    if (!Array.isArray(value.supplementalAtlases)) {
      issue(
        issues,
        '/supplementalAtlases',
        'invalid_type',
        'Expected a supplemental atlas array.'
      );
    } else {
      if (value.supplementalAtlases.length > MAX_SUPPLEMENTAL_ATLASES) {
        issue(
          issues,
          '/supplementalAtlases',
          'limit_exceeded',
          `Supplemental atlas count exceeds ${MAX_SUPPLEMENTAL_ATLASES}.`
        );
      }
      value.supplementalAtlases.forEach((atlas, index) => {
        const path = `/supplementalAtlases/${index}`;
        validateAtlas(atlas, path, issues);
        atlasCandidates.push(Object.freeze({ atlas, path }));
      });
    }
  }

  const atlasFrames: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let totalAtlasFrameCount = 0;
  atlasCandidates.forEach(({ atlas, path }) => {
    if (!isRecord(atlas) || !isRecord(atlas.frames)) return;
    Object.entries(atlas.frames).forEach(([frameId, frame]) => {
      totalAtlasFrameCount += 1;
      if (Object.prototype.hasOwnProperty.call(atlasFrames, frameId)) {
        issue(
          issues,
          `${path}/frames/${frameId}`,
          'duplicate_id',
          `Atlas frame identifiers must be globally unique: ${frameId}.`
        );
        return;
      }
      atlasFrames[frameId] = frame;
    });
  });
  if (totalAtlasFrameCount > MAX_TOTAL_ATLAS_FRAMES) {
    issue(
      issues,
      '/supplementalAtlases',
      'limit_exceeded',
      `Total atlas frame count exceeds ${MAX_TOTAL_ATLAS_FRAMES}.`
    );
  }

  const partIds: string[] = [];
  const partIdSet = new Set<string>();
  const parentById: Record<string, string | null> = Object.create(null) as Record<string, string | null>;
  if (!Array.isArray(value.parts)) {
    issue(issues, '/parts', 'invalid_type', 'Expected a part array.');
  } else {
    if (value.parts.length === 0) {
      issue(issues, '/parts', 'invalid_value', 'At least one rig part is required.');
    }
    if (value.parts.length > MAX_PARTS) {
      issue(issues, '/parts', 'limit_exceeded', `Part count exceeds ${MAX_PARTS}.`);
    }
    value.parts.forEach((part, index) => {
      const path = `/parts/${index}`;
      if (!isRecord(part)) {
        issue(issues, path, 'invalid_type', 'Expected a rig part object.');
        return;
      }
      const idValid = validateId(part.id, `${path}/id`, issues);
      if (idValid) {
        const id = String(part.id);
        if (partIdSet.has(id)) {
          issue(issues, `${path}/id`, 'duplicate_id', `Duplicate part identifier: ${id}.`);
        } else {
          partIdSet.add(id);
          partIds.push(id);
          parentById[id] = typeof part.parentId === 'string' ? part.parentId : null;
        }
      }
      validateStringMember(part.role, MODULAR_BOSS_PART_ROLES, `${path}/role`, issues);
      if (part.parentId !== null && typeof part.parentId !== 'string') {
        issue(issues, `${path}/parentId`, 'invalid_type', 'Parent ID must be a string or null.');
      } else if (typeof part.parentId === 'string') {
        validateId(part.parentId, `${path}/parentId`, issues);
      }
      if (
        part.frameId !== null
        && (typeof part.frameId !== 'string' || !Object.prototype.hasOwnProperty.call(atlasFrames, part.frameId))
      ) {
        issue(issues, `${path}/frameId`, 'missing_reference', `Unknown atlas frame: ${String(part.frameId)}.`);
      }
      validatePartTransform(part.transform, `${path}/transform`, issues);
      if (part.anchor === null) {
        if (part.frameId !== null) {
          issue(issues, `${path}/anchor`, 'invalid_value', 'A sprite-backed part requires an anchor.');
        }
      } else {
        validateAnchor(part.anchor, `${path}/anchor`, issues);
      }
      validateInteger(part.layer, `${path}/layer`, issues, -MAX_ABSOLUTE_LAYER, MAX_ABSOLUTE_LAYER);
      if (typeof part.visible !== 'boolean') {
        issue(issues, `${path}/visible`, 'invalid_type', 'Part visibility must be a boolean.');
      }
      if (part.frameId === null && part.visible === true) {
        issue(issues, `${path}/visible`, 'invalid_value', 'A transform-only joint cannot be visible.');
      }
    });
    value.parts.forEach((part, index) => {
      if (!isRecord(part) || typeof part.parentId !== 'string') return;
      if (part.parentId === part.id) {
        issue(issues, `/parts/${index}/parentId`, 'cycle', 'A part cannot parent itself.');
      } else if (!partIdSet.has(part.parentId)) {
        issue(issues, `/parts/${index}/parentId`, 'missing_reference', `Unknown parent part: ${part.parentId}.`);
      }
    });
    detectParentCycles(partIds, parentById, issues);
  }

  const animationIds = new Set<string>();
  if (!Array.isArray(value.animations)) {
    issue(issues, '/animations', 'invalid_type', 'Expected an animation array.');
  } else {
    if (value.animations.length > MAX_ANIMATIONS) {
      issue(issues, '/animations', 'limit_exceeded', `Animation count exceeds ${MAX_ANIMATIONS}.`);
    }
    value.animations.forEach((animation, index) => {
      const path = `/animations/${index}`;
      if (!isRecord(animation)) {
        issue(issues, path, 'invalid_type', 'Expected a fixed animation object.');
        return;
      }
      if (animation.kind !== FIXED_FRAME_ANIMATION_KIND) {
        issue(issues, `${path}/kind`, 'invalid_value', `Expected ${FIXED_FRAME_ANIMATION_KIND}.`);
      }
      const idValid = validateId(animation.id, `${path}/id`, issues);
      if (idValid) {
        const id = String(animation.id);
        if (animationIds.has(id)) {
          issue(issues, `${path}/id`, 'duplicate_id', `Duplicate animation identifier: ${id}.`);
        }
        animationIds.add(id);
      }
      if (typeof animation.partId !== 'string' || !partIdSet.has(animation.partId)) {
        issue(issues, `${path}/partId`, 'missing_reference', `Unknown animation part: ${String(animation.partId)}.`);
      }
      if (!Array.isArray(animation.frameIds) || animation.frameIds.length === 0) {
        issue(issues, `${path}/frameIds`, 'invalid_value', 'A fixed animation requires at least one frame.');
      } else {
        if (animation.frameIds.length > MAX_ANIMATION_FRAMES) {
          issue(issues, `${path}/frameIds`, 'limit_exceeded', `Animation frame count exceeds ${MAX_ANIMATION_FRAMES}.`);
        }
        animation.frameIds.forEach((frameId, frameIndex) => {
          if (typeof frameId !== 'string' || !Object.prototype.hasOwnProperty.call(atlasFrames, frameId)) {
            issue(
              issues,
              `${path}/frameIds/${frameIndex}`,
              'missing_reference',
              `Unknown animation frame: ${String(frameId)}.`
            );
          }
        });
      }
      validateInteger(animation.frameHold, `${path}/frameHold`, issues, 1, 600);
      if (typeof animation.loop !== 'boolean') {
        issue(issues, `${path}/loop`, 'invalid_type', 'Animation loop must be a boolean.');
      }
    });
  }

  const socketIds = new Set<string>();
  if (!Array.isArray(value.sockets)) {
    issue(issues, '/sockets', 'invalid_type', 'Expected a socket array.');
  } else {
    if (value.sockets.length > MAX_SOCKETS) {
      issue(issues, '/sockets', 'limit_exceeded', `Socket count exceeds ${MAX_SOCKETS}.`);
    }
    value.sockets.forEach((socket, index) => {
      const path = `/sockets/${index}`;
      if (!isRecord(socket)) {
        issue(issues, path, 'invalid_type', 'Expected a rig socket object.');
        return;
      }
      const idValid = validateId(socket.id, `${path}/id`, issues);
      if (idValid) {
        const id = String(socket.id);
        if (socketIds.has(id)) {
          issue(issues, `${path}/id`, 'duplicate_id', `Duplicate socket identifier: ${id}.`);
        }
        socketIds.add(id);
      }
      validateStringMember(socket.role, MODULAR_BOSS_SOCKET_ROLES, `${path}/role`, issues);
      if (typeof socket.partId !== 'string' || !partIdSet.has(socket.partId)) {
        issue(issues, `${path}/partId`, 'missing_reference', `Unknown socket part: ${String(socket.partId)}.`);
      }
      validateFinite(socket.x, `${path}/x`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
      validateFinite(socket.y, `${path}/y`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
      validateFinite(socket.rotation, `${path}/rotation`, issues, -MAX_ABSOLUTE_ROTATION, MAX_ABSOLUTE_ROTATION);
    });
  }

  if (value.destruction !== undefined) {
    if (!isRecord(value.destruction)) {
      issue(issues, '/destruction', 'invalid_type', 'Expected a destruction sequence object.');
    } else {
      const destruction = value.destruction;
      const durationValid = validateInteger(
        destruction.durationFrames,
        '/destruction/durationFrames',
        issues,
        1,
        MAX_DESTRUCTION_FRAMES
      );
      if (!Array.isArray(destruction.fragments)) {
        issue(issues, '/destruction/fragments', 'invalid_type', 'Expected a destruction fragment array.');
      } else {
        if (destruction.fragments.length === 0) {
          issue(issues, '/destruction/fragments', 'invalid_value', 'At least one destruction fragment is required.');
        }
        if (destruction.fragments.length > MAX_DESTRUCTION_FRAGMENTS) {
          issue(
            issues,
            '/destruction/fragments',
            'limit_exceeded',
            `Destruction fragment count exceeds ${MAX_DESTRUCTION_FRAGMENTS}.`
          );
        }
        const referencedParts = new Set<string>();
        destruction.fragments.forEach((fragment, index) => {
          const path = `/destruction/fragments/${index}`;
          if (!isRecord(fragment)) {
            issue(issues, path, 'invalid_type', 'Expected a destruction fragment object.');
            return;
          }
          if (typeof fragment.partId !== 'string' || !partIdSet.has(fragment.partId)) {
            issue(issues, `${path}/partId`, 'missing_reference', `Unknown destruction part: ${String(fragment.partId)}.`);
          } else {
            if (referencedParts.has(fragment.partId)) {
              issue(issues, `${path}/partId`, 'duplicate_id', `Duplicate destruction part: ${fragment.partId}.`);
            }
            referencedParts.add(fragment.partId);
            const part = Array.isArray(value.parts)
              ? value.parts.find((candidate) => isRecord(candidate) && candidate.id === fragment.partId)
              : undefined;
            if (!isRecord(part) || typeof part.frameId !== 'string') {
              issue(issues, `${path}/partId`, 'invalid_value', 'A destruction fragment must reference a sprite-backed part.');
            }
          }
          const maximumDelay = durationValid
            ? Math.max(0, Number(destruction.durationFrames) - 1)
            : MAX_DESTRUCTION_FRAMES - 1;
          validateInteger(fragment.delayFrames, `${path}/delayFrames`, issues, 0, maximumDelay);
          validateFinite(fragment.travelX, `${path}/travelX`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
          validateFinite(fragment.travelY, `${path}/travelY`, issues, -MAX_ABSOLUTE_COORDINATE, MAX_ABSOLUTE_COORDINATE);
          validateFinite(
            fragment.rotationRadians,
            `${path}/rotationRadians`,
            issues,
            -MAX_ABSOLUTE_ROTATION,
            MAX_ABSOLUTE_ROTATION
          );
        });
      }
    }
  }

  return Object.freeze(issues);
};

export class ModularBossRigValidationError extends Error {
  readonly issues: readonly ModularBossRigValidationIssue[];

  constructor(issues: readonly ModularBossRigValidationIssue[]) {
    super(`Invalid modular boss rig manifest (${issues.length} issue${issues.length === 1 ? '' : 's'}).`);
    this.name = 'ModularBossRigValidationError';
    this.issues = issues;
  }
}

const cloneAndFreezeAtlas = (atlas: ModularBossRigAtlas): ModularBossRigAtlas => {
  const frames = Object.freeze(Object.fromEntries(
    Object.entries(atlas.frames).map(([id, frame]) => [
      id,
      Object.freeze({ x: frame.x, y: frame.y, width: frame.width, height: frame.height })
    ])
  ));
  return Object.freeze({
    url: atlas.url,
    contentHash: atlas.contentHash,
    width: atlas.width,
    height: atlas.height,
    frames
  });
};

const cloneAndFreezeManifest = (manifest: ModularBossRigManifest): ModularBossRigManifest => {
  const atlas = cloneAndFreezeAtlas(manifest.atlas);
  const supplementalAtlases = manifest.supplementalAtlases === undefined
    ? undefined
    : Object.freeze(manifest.supplementalAtlases.map(cloneAndFreezeAtlas));
  const parts = Object.freeze(manifest.parts.map((part) => Object.freeze({
    id: part.id,
    role: part.role,
    parentId: part.parentId,
    frameId: part.frameId,
    transform: Object.freeze({ ...part.transform }),
    anchor: part.anchor === null ? null : Object.freeze({ ...part.anchor }),
    layer: part.layer,
    visible: part.visible
  })));
  const animations = Object.freeze(manifest.animations.map((animation) => Object.freeze({
    kind: animation.kind,
    id: animation.id,
    partId: animation.partId,
    frameIds: Object.freeze([...animation.frameIds]),
    frameHold: animation.frameHold,
    loop: animation.loop
  })));
  const sockets = Object.freeze(manifest.sockets.map((socket) => Object.freeze({ ...socket })));
  const destruction = manifest.destruction === undefined
    ? undefined
    : Object.freeze({
        durationFrames: manifest.destruction.durationFrames,
        fragments: Object.freeze(manifest.destruction.fragments.map((fragment) => Object.freeze({ ...fragment })))
      });
  return Object.freeze({
    kind: manifest.kind,
    id: manifest.id,
    designSize: Object.freeze({
      width: manifest.designSize.width,
      height: manifest.designSize.height
    }),
    ...(manifest.preserveAspectRatio === undefined
      ? {}
      : { preserveAspectRatio: manifest.preserveAspectRatio }),
    atlas,
    ...(supplementalAtlases === undefined ? {} : { supplementalAtlases }),
    parts,
    animations,
    sockets,
    ...(destruction === undefined ? {} : { destruction })
  });
};

const createTopologicalPartOrder = (manifest: ModularBossRigManifest) => {
  const childrenByParent: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const roots: string[] = [];
  manifest.parts.forEach((part) => {
    if (part.parentId === null) {
      roots.push(part.id);
      return;
    }
    (childrenByParent[part.parentId] ??= []).push(part.id);
  });
  const ordered: string[] = [];
  const visit = (partId: string) => {
    ordered.push(partId);
    (childrenByParent[partId] ?? []).forEach(visit);
  };
  roots.forEach(visit);
  return Object.freeze(ordered);
};

const asFrozenRecord = <T extends { readonly id: string }>(
  values: readonly T[]
): Readonly<Record<string, T>> => Object.freeze(Object.fromEntries(
  values.map((value) => [value.id, value])
));

/**
 * Validates, copies, and freezes one complete rig registration. The returned
 * registration never discovers frames dynamically; every frame, part,
 * animation, and socket is fixed by the validated manifest.
 */
export const registerModularBossRig = (
  value: unknown
): ModularBossRigRegistration => {
  const issues = validateModularBossRigManifest(value);
  if (issues.length > 0) throw new ModularBossRigValidationError(issues);
  const manifest = cloneAndFreezeManifest(value as ModularBossRigManifest);
  const atlases = Object.freeze([
    manifest.atlas,
    ...(manifest.supplementalAtlases ?? [])
  ]);
  const frameById: Record<string, ModularBossAtlasFrame> = Object.create(null) as Record<string, ModularBossAtlasFrame>;
  const atlasByFrameId: Record<string, ModularBossRigAtlas> = Object.create(null) as Record<string, ModularBossRigAtlas>;
  atlases.forEach((atlas) => {
    Object.entries(atlas.frames).forEach(([frameId, frame]) => {
      frameById[frameId] = frame;
      atlasByFrameId[frameId] = atlas;
    });
  });
  const declarationIndex = new Map(
    manifest.parts.map((part, index) => [part.id, index] as const)
  );
  const renderPartIds = Object.freeze([...manifest.parts]
    .sort((left, right) => (
      left.layer - right.layer
      || Number(declarationIndex.get(left.id)) - Number(declarationIndex.get(right.id))
    ))
    .map((part) => part.id));
  return Object.freeze({
    manifest,
    atlases,
    frameById: Object.freeze(frameById),
    atlasByFrameId: Object.freeze(atlasByFrameId),
    topologicalPartIds: createTopologicalPartOrder(manifest),
    renderPartIds,
    partById: asFrozenRecord(manifest.parts),
    animationById: asFrozenRecord(manifest.animations),
    socketById: asFrozenRecord(manifest.sockets)
  });
};

export const sampleRegisteredModularBossAnimationFrame = (
  registration: ModularBossRigRegistration,
  animationId: string,
  elapsedFrames: number
): string => {
  const animation = registration.animationById[animationId];
  if (!animation) throw new Error(`Unknown modular boss animation: ${animationId}.`);
  if (!Number.isFinite(elapsedFrames)) throw new Error('Animation elapsedFrames must be finite.');
  const step = Math.max(0, Math.floor(elapsedFrames / animation.frameHold));
  const index = animation.loop
    ? step % animation.frameIds.length
    : Math.min(animation.frameIds.length - 1, step);
  return animation.frameIds[index];
};

const createLocalMatrix = (
  transform: ModularBossLocalTransform
): ModularBossAffineTransform => {
  const cosine = Math.cos(transform.rotation);
  const sine = Math.sin(transform.rotation);
  return Object.freeze({
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    tx: transform.x,
    ty: transform.y
  });
};

export const multiplyModularBossTransforms = (
  parent: ModularBossAffineTransform,
  child: ModularBossAffineTransform
): ModularBossAffineTransform => Object.freeze({
  a: parent.a * child.a + parent.c * child.b,
  b: parent.b * child.a + parent.d * child.b,
  c: parent.a * child.c + parent.c * child.d,
  d: parent.b * child.c + parent.d * child.d,
  tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
  ty: parent.b * child.tx + parent.d * child.ty + parent.ty
});

const validatePoseOverride = (
  partId: string,
  override: ModularBossPartPoseOverride,
  registration: ModularBossRigRegistration
) => {
  const finiteKeys = [
    'xOffset',
    'yOffset',
    'rotationOffset',
    'scaleXMultiplier',
    'scaleYMultiplier',
    'alpha'
  ] as const;
  finiteKeys.forEach((key) => {
    if (override[key] !== undefined && !Number.isFinite(override[key])) {
      throw new Error(`Pose override ${partId}.${key} must be finite.`);
    }
  });
  if (override.scaleXMultiplier === 0 || override.scaleYMultiplier === 0) {
    throw new Error(`Pose override ${partId} cannot use a zero scale multiplier.`);
  }
  if (override.alpha !== undefined && (override.alpha < 0 || override.alpha > 1)) {
    throw new Error(`Pose override ${partId}.alpha must be from 0 through 1.`);
  }
  if (
    override.frameId !== undefined
    && !Object.prototype.hasOwnProperty.call(registration.frameById, override.frameId)
  ) {
    throw new Error(`Pose override ${partId} references unknown frame ${override.frameId}.`);
  }
};

/**
 * Resolves part and socket transforms without touching Pixi or simulation
 * state. Part anchors are intentionally returned separately: they configure
 * each Sprite anchor and do not change the hierarchy's attachment origins.
 */
export const resolveModularBossRigHierarchy = (
  registration: ModularBossRigRegistration,
  overrides: ModularBossRigPoseOverrides = Object.freeze({})
): ResolvedModularBossRigHierarchy => {
  Object.keys(overrides).forEach((partId) => {
    if (!registration.partById[partId]) {
      throw new Error(`Pose override references unknown modular boss part: ${partId}.`);
    }
    const override = overrides[partId];
    if (override) validatePoseOverride(partId, override, registration);
  });

  const resolvedById: Record<string, ResolvedModularBossRigPart> = Object.create(null) as Record<string, ResolvedModularBossRigPart>;
  registration.topologicalPartIds.forEach((partId) => {
    const part = registration.partById[partId];
    const override = overrides[partId];
    const localTransform = Object.freeze({
      x: part.transform.x + (override?.xOffset ?? 0),
      y: part.transform.y + (override?.yOffset ?? 0),
      rotation: part.transform.rotation + (override?.rotationOffset ?? 0),
      scaleX: part.transform.scaleX * (override?.scaleXMultiplier ?? 1),
      scaleY: part.transform.scaleY * (override?.scaleYMultiplier ?? 1)
    });
    const localMatrix = createLocalMatrix(localTransform);
    const parentWorld = part.parentId ? resolvedById[part.parentId]?.worldTransform : undefined;
    if (part.parentId && !parentWorld) {
      throw new Error(`Registered part order did not resolve parent ${part.parentId}.`);
    }
    const worldTransform = parentWorld
      ? multiplyModularBossTransforms(parentWorld, localMatrix)
      : localMatrix;
    const frameId = override?.frameId ?? part.frameId;
    resolvedById[partId] = Object.freeze({
      id: part.id,
      role: part.role,
      parentId: part.parentId,
      frameId,
      frame: frameId === null ? null : registration.frameById[frameId],
      anchor: part.anchor,
      layer: part.layer,
      alpha: override?.alpha ?? 1,
      visible: override?.visible ?? part.visible,
      localTransform,
      worldTransform
    });
  });

  const resolvedParts = Object.freeze(registration.renderPartIds.map((id) => resolvedById[id]));
  const resolvedSockets = Object.freeze(registration.manifest.sockets.map((socket) => {
    const partWorld = resolvedById[socket.partId].worldTransform;
    const socketLocal = createLocalMatrix({
      x: socket.x,
      y: socket.y,
      rotation: socket.rotation,
      scaleX: 1,
      scaleY: 1
    });
    const worldTransform = multiplyModularBossTransforms(partWorld, socketLocal);
    return Object.freeze({
      id: socket.id,
      role: socket.role,
      partId: socket.partId,
      worldX: worldTransform.tx,
      worldY: worldTransform.ty,
      worldRotation: Math.atan2(worldTransform.b, worldTransform.a),
      worldTransform
    });
  }));
  const resolvedSocketById = Object.freeze(Object.fromEntries(
    resolvedSockets.map((socket) => [socket.id, socket])
  ));
  return Object.freeze({
    parts: resolvedParts,
    partById: Object.freeze({ ...resolvedById }),
    sockets: resolvedSockets,
    socketById: resolvedSocketById
  });
};
