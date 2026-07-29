import {
  getMiniBossEncounterDefinition
} from './MiniBossEncounterRegistry.ts';
import type {
  MiniBossAnimationState,
  MiniBossAttackDefinition,
  MiniBossCleanupCommand,
  MiniBossEncounterDefinition,
  MiniBossEncounterFrameState,
  MiniBossEncounterId,
  MiniBossEncounterSampleContext,
  MiniBossGuardFrameState,
  MiniBossHazardCommand,
  MiniBossMemberFrameState,
  MiniBossMemberInstance,
  MiniBossReinforcementCommand
} from './types.ts';

const TAU = Math.PI * 2;
const DEFAULT_FPS = 60;
const DEFAULT_VIEWPORT_WIDTH = 390;
const DEFAULT_VIEWPORT_HEIGHT = 844;
const DEATH_PRESENTATION_SECONDS = 0.8;

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);

const positiveInteger = (value: number, fallback: number) => (
  Math.max(1, Math.round(Number.isFinite(value) ? value : fallback))
);

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
};

const stableUnit = (value: string) => hashText(value) / 0x1_0000_0000;

const easeOutCubic = (value: number) => 1 - ((1 - clamp(value, 0, 1)) ** 3);

const triangleWave = (value: number) => {
  const wrapped = ((value % 1) + 1) % 1;
  return wrapped < 0.5 ? wrapped * 2 : (1 - wrapped) * 2;
};

const resolveDefinition = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId
): MiniBossEncounterDefinition => {
  if (typeof definitionOrId !== 'string') return definitionOrId;
  const definition = getMiniBossEncounterDefinition(definitionOrId);
  if (!definition) throw new Error(`Unknown Mini-Boss Lab encounter: ${definitionOrId}`);
  return definition;
};

export const createMiniBossMemberInstances = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId
): readonly MiniBossMemberInstance[] => {
  const definition = resolveDefinition(definitionOrId);
  const instances = definition.memberArchetypes.flatMap((archetype) => (
    Array.from({ length: archetype.count }, (_, index) => Object.freeze({
      id: `${definition.id}:${archetype.id}:${index + 1}`,
      archetypeId: archetype.id,
      label: archetype.count > 1 ? `${archetype.label} ${index + 1}` : archetype.label,
      role: archetype.roles[index] ?? archetype.roles[archetype.roles.length - 1] ?? 'primary',
      maxHealth: archetype.maxHealth,
      collisionRadiusPixels: archetype.collisionRadiusPixels,
      widthPixels: archetype.widthPixels,
      heightPixels: archetype.heightPixels,
      assetId: archetype.assetId,
      damageable: archetype.damageable
    })))
  );
  return Object.freeze(instances);
};

interface AttackWindow {
  readonly attack: MiniBossAttackDefinition;
  readonly kind: 'signature' | 'support';
  readonly beat: 'warning' | 'action' | 'recovery';
  readonly executionIndex: number;
  readonly localFrame: number;
  readonly actionFrame: number;
}

const attackDurationFrames = (attackDefinition: MiniBossAttackDefinition, fps: number) => ({
  warning: Math.max(1, Math.round(attackDefinition.telegraphSeconds * fps)),
  action: Math.max(1, Math.round(attackDefinition.activeSeconds * fps)),
  recovery: Math.max(1, Math.round(attackDefinition.recoverySeconds * fps))
});

const resolveAttackWindow = (
  definition: MiniBossEncounterDefinition,
  elapsedFrame: number,
  fps: number
): AttackWindow => {
  const signatureFrames = attackDurationFrames(definition.signature, fps);
  const supportFrames = attackDurationFrames(definition.support, fps);
  const signatureTotal = signatureFrames.warning + signatureFrames.action + signatureFrames.recovery;
  const supportTotal = supportFrames.warning + supportFrames.action + supportFrames.recovery;
  const cycleFrames = signatureTotal + supportTotal;
  const executionIndex = Math.floor(elapsedFrame / cycleFrames);
  const cycleFrame = elapsedFrame % cycleFrames;
  const isSignature = cycleFrame < signatureTotal;
  const attackDefinition = isSignature ? definition.signature : definition.support;
  const durations = isSignature ? signatureFrames : supportFrames;
  const localFrame = isSignature ? cycleFrame : cycleFrame - signatureTotal;
  const beat = localFrame < durations.warning
    ? 'warning'
    : localFrame < durations.warning + durations.action
      ? 'action'
      : 'recovery';
  return {
    attack: attackDefinition,
    kind: isSignature ? 'signature' : 'support',
    beat,
    executionIndex,
    localFrame,
    actionFrame: Math.max(0, localFrame - durations.warning)
  };
};

interface RuntimeMember {
  readonly instance: MiniBossMemberInstance;
  readonly health: number;
  readonly healthRatio: number;
  readonly alive: boolean;
}

const resolveRuntimeMembers = (
  definition: MiniBossEncounterDefinition,
  context: MiniBossEncounterSampleContext
): readonly RuntimeMember[] => {
  const overrides = new Map((context.members ?? []).map((memberState) => [memberState.id, memberState]));
  return createMiniBossMemberInstances(definition).map((instance) => {
    const override = overrides.get(instance.id);
    const health = clamp(override?.health ?? instance.maxHealth, 0, instance.maxHealth);
    const alive = (override?.alive ?? true) && health > 0;
    return {
      instance,
      health: alive ? health : 0,
      healthRatio: alive ? health / instance.maxHealth : 0,
      alive
    };
  });
};

const membersForArchetype = (
  members: readonly RuntimeMember[],
  archetypeId: string
) => members.filter((memberState) => memberState.instance.archetypeId === archetypeId);

const chooseSafeRouteId = (
  definition: MiniBossEncounterDefinition,
  seedKey: string,
  executionIndex: number
) => {
  const variants = definition.safeRoute.variants;
  if (variants.length === 0) return `${definition.id}:route-missing`;
  const start = Math.floor(stableUnit(`${seedKey}:route`) * variants.length);
  return variants[(start + executionIndex) % variants.length].id;
};

const resolvePairArchetypeId = (definition: MiniBossEncounterDefinition): string | undefined => {
  if (definition.choreography.kind === 'paired-crossfire') return definition.choreography.coreArchetypeId;
  if (definition.choreography.kind === 'mirror-exchange') return definition.choreography.sentinelArchetypeId;
  return undefined;
};

const resolveGuardState = (
  definition: MiniBossEncounterDefinition,
  members: readonly RuntimeMember[],
  elapsedSeconds: number,
  executionIndex: number,
  seedKey: string
): MiniBossGuardFrameState => {
  const choreography = definition.choreography;
  if (choreography.kind === 'guardian-halo') {
    const guardians = membersForArchetype(members, choreography.guardianArchetypeId).filter((member) => member.alive);
    const core = membersForArchetype(members, choreography.coreArchetypeId).find((member) => member.alive);
    const exposed = guardians.length <= choreography.exposedWhenGuardianCountAtMost;
    const direction = stableUnit(`${seedKey}:halo-direction`) < 0.5 ? -1 : 1;
    const gapCenterRadians = ((elapsedSeconds * 0.7 * direction) + stableUnit(`${seedKey}:halo-gap`) * TAU) % TAU;
    return {
      active: Boolean(core) && !exposed,
      primaryExposed: exposed,
      survivingGuardianCount: guardians.length,
      guardedMemberIds: core && !exposed ? [core.instance.id] : [],
      gapCenterRadians,
      gapArcRadians: choreography.gapArcDegrees * Math.PI / 180
    };
  }

  if (choreography.kind === 'convoy-command') {
    const escorts = membersForArchetype(members, choreography.escortArchetypeId).filter((member) => member.alive);
    const captain = membersForArchetype(members, choreography.captainArchetypeId).find((member) => member.alive);
    const exposed = escorts.length <= choreography.exposeCaptainWhenEscortsAtMost;
    return {
      active: Boolean(captain) && !exposed,
      primaryExposed: exposed,
      survivingGuardianCount: escorts.length,
      guardedMemberIds: captain && !exposed ? [captain.instance.id] : []
    };
  }

  if (choreography.kind === 'mirror-exchange') {
    const sentinels = membersForArchetype(members, choreography.sentinelArchetypeId).filter((member) => member.alive);
    if (sentinels.length < 2) {
      return {
        active: false,
        primaryExposed: true,
        survivingGuardianCount: 0,
        guardedMemberIds: []
      };
    }
    const guardedIndex = (executionIndex + (stableUnit(`${seedKey}:guard-first`) < 0.5 ? 0 : 1)) % 2;
    return {
      active: true,
      primaryExposed: true,
      survivingGuardianCount: 1,
      guardedMemberIds: [sentinels[guardedIndex].instance.id]
    };
  }

  return {
    active: false,
    primaryExposed: true,
    survivingGuardianCount: 0,
    guardedMemberIds: []
  };
};

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly rotationRadians: number;
  readonly scale: number;
  readonly edgeAttached: boolean;
}

const resolveMemberPose = (
  definition: MiniBossEncounterDefinition,
  memberState: RuntimeMember,
  members: readonly RuntimeMember[],
  elapsedSeconds: number,
  entranceProgress: number,
  executionIndex: number,
  viewportWidth: number,
  viewportHeight: number,
  seedKey: string,
  lowHealth: boolean
): Pose => {
  const member = memberState.instance;
  const sameArchetype = membersForArchetype(members, member.archetypeId);
  const index = sameArchetype.findIndex((candidate) => candidate.instance.id === member.id);
  const phase = stableUnit(`${seedKey}:pose:${member.id}`) * TAU;
  const motionMultiplier = lowHealth ? 1.24 : 1;
  const bob = Math.sin(elapsedSeconds * 2.15 * motionMultiplier + phase) * 5;
  const sway = Math.sin(elapsedSeconds * 1.2 * motionMultiplier + phase) * 9;
  let xRatio = 0.5;
  let yRatio = 0.23;
  let rotationRadians = Math.sin(elapsedSeconds * 1.5 + phase) * 0.05;
  let scale = 1 + Math.sin(elapsedSeconds * 2.1 + phase) * 0.018;
  let edgeAttached = false;
  const choreography = definition.choreography;

  switch (choreography.kind) {
    case 'paired-crossfire': {
      if (member.archetypeId === choreography.coreArchetypeId) {
        xRatio = index === 0 ? 0.29 : 0.71;
        yRatio = 0.22;
        rotationRadians += index === 0 ? -0.08 : 0.08;
      } else {
        const leaderIndex = index % 2;
        const orbitIndex = Math.floor(index / 2);
        const centerX = leaderIndex === 0 ? 0.29 : 0.71;
        const angle = elapsedSeconds * (leaderIndex === 0 ? 1.3 : -1.3) + orbitIndex * Math.PI;
        xRatio = centerX + Math.cos(angle) * 0.105;
        yRatio = 0.22 + Math.sin(angle) * 0.055;
        rotationRadians = angle + Math.PI / 2;
        scale = 0.78;
      }
      break;
    }
    case 'guardian-halo': {
      if (member.archetypeId === choreography.coreArchetypeId) {
        xRatio = 0.5;
        yRatio = 0.22;
      } else {
        const count = Math.max(1, sameArchetype.length);
        const direction = stableUnit(`${seedKey}:guardian-direction`) < 0.5 ? -1 : 1;
        const angle = (index / count) * TAU + elapsedSeconds * 0.72 * direction;
        xRatio = 0.5 + Math.cos(angle) * choreography.haloRadiusRatio;
        yRatio = 0.23 + Math.sin(angle) * choreography.haloRadiusRatio * 0.48;
        rotationRadians = angle + Math.PI / 2;
        scale = 0.72;
      }
      break;
    }
    case 'edge-rail': {
      const startsLeft = (executionIndex + (stableUnit(`${seedKey}:edge-first`) < 0.5 ? 0 : 1)) % 2 === 0;
      xRatio = startsLeft ? choreography.edgeInsetRatio : 1 - choreography.edgeInsetRatio;
      yRatio = 0.22 + triangleWave(elapsedSeconds / choreography.traverseSeconds) * 0.43;
      rotationRadians = startsLeft ? Math.PI / 2 : -Math.PI / 2;
      edgeAttached = true;
      break;
    }
    case 'carrier-release': {
      xRatio = 0.5 + Math.sin(elapsedSeconds * 0.7 + phase) * 0.13;
      yRatio = 0.21 + Math.sin(elapsedSeconds * 1.4 + phase) * 0.012;
      scale = 1 + Math.sin(elapsedSeconds * 1.8 + phase) * 0.028;
      break;
    }
    case 'mirror-exchange': {
      xRatio = index === 0 ? 0.28 : 0.72;
      yRatio = 0.22 + Math.sin(elapsedSeconds * 1.6 + index * Math.PI) * 0.035;
      rotationRadians += index === 0 ? -0.06 : 0.06;
      break;
    }
    case 'rotating-gap': {
      xRatio = 0.5 + Math.sin(elapsedSeconds * 0.85) * 0.12;
      yRatio = 0.22 + Math.cos(elapsedSeconds * 1.15) * 0.02;
      rotationRadians = elapsedSeconds * (choreography.clockwiseFirst ? 0.24 : -0.24);
      break;
    }
    case 'convoy-command': {
      if (member.archetypeId === choreography.captainArchetypeId) {
        xRatio = 0.5;
        yRatio = 0.2;
      } else {
        const spread = choreography.formationWidthRatio;
        const morph = (Math.sin(elapsedSeconds * 0.9) + 1) * 0.5;
        const slot = sameArchetype.length <= 1 ? 0.5 : index / (sameArchetype.length - 1);
        xRatio = 0.5 + (slot - 0.5) * spread * (0.65 + morph * 0.35);
        yRatio = 0.28 + Math.abs(slot - 0.5) * 0.13 * (1 - morph);
        rotationRadians = (slot - 0.5) * 0.24;
        scale = 0.74;
      }
      break;
    }
    case 'quadrant-grid': {
      edgeAttached = true;
      if (member.role === 'sentry-west') {
        xRatio = choreography.boundaryInsetRatio;
        yRatio = 0.47;
        rotationRadians = Math.PI / 2;
      } else if (member.role === 'sentry-east') {
        xRatio = 1 - choreography.boundaryInsetRatio;
        yRatio = 0.47;
        rotationRadians = -Math.PI / 2;
      } else if (member.role === 'sentry-north') {
        xRatio = 0.5;
        yRatio = 0.12;
        rotationRadians = Math.PI;
      } else {
        xRatio = 0.5;
        yRatio = 0.84;
        rotationRadians = 0;
      }
      break;
    }
  }

  const targetX = clamp(xRatio * viewportWidth + (edgeAttached ? 0 : sway), 0, viewportWidth);
  const targetY = clamp(yRatio * viewportHeight + bob, 0, viewportHeight);
  const startY = -member.heightPixels;
  return {
    x: targetX,
    y: startY + (targetY - startY) * easeOutCubic(entranceProgress),
    rotationRadians,
    scale,
    edgeAttached
  };
};

const resolveAnimationState = ({
  alive,
  healthRatio,
  entranceProgress,
  attacking,
  hit
}: {
  alive: boolean;
  healthRatio: number;
  entranceProgress: number;
  attacking: boolean;
  hit: boolean;
}): MiniBossAnimationState => {
  if (!alive) return 'death';
  if (hit) return 'hit';
  if (healthRatio <= 0.15) return 'critical';
  if (healthRatio <= 0.5) return 'damage';
  if (entranceProgress < 1) return 'entrance';
  if (attacking) return 'attack';
  return 'idle';
};

const makeHazard = ({
  definition,
  attackWindow,
  safeCorridorId,
  kind,
  source,
  origin,
  target,
  projectileCount,
  warning,
  emitNow,
  emissionIndex,
  angleRadians,
  gapCenterRadians,
  gapArcRadians
}: {
  definition: MiniBossEncounterDefinition;
  attackWindow: AttackWindow;
  safeCorridorId: string;
  kind: MiniBossHazardCommand['kind'];
  source?: MiniBossMemberFrameState;
  origin: Readonly<{ x: number; y: number }>;
  target: Readonly<{ x: number; y: number }>;
  projectileCount: number;
  warning: boolean;
  emitNow: boolean;
  emissionIndex: number;
  angleRadians?: number;
  gapCenterRadians?: number;
  gapArcRadians?: number;
}): MiniBossHazardCommand => ({
  id: `${definition.eventId}:${attackWindow.attack.id}:${attackWindow.executionIndex}:${emissionIndex}:${source?.id ?? 'arena'}`,
  ownerEventId: definition.eventId,
  sourceMemberId: source?.id,
  attackId: attackWindow.attack.id,
  kind,
  warning,
  damaging: !warning,
  emitNow,
  emissionIndex,
  projectileCount,
  projectileAssetId: attackWindow.attack.projectileAssetId,
  origin,
  target,
  angleRadians,
  gapCenterRadians,
  gapArcRadians,
  safeCorridorId
});

const resolveEmission = (
  attackWindow: AttackWindow,
  cadenceFrames: number
) => {
  const interval = positiveInteger(cadenceFrames, 1);
  return {
    index: Math.floor(attackWindow.actionFrame / interval),
    emitNow: attackWindow.beat === 'action' && attackWindow.actionFrame % interval === 0
  };
};

const findAliveFrameMembers = (
  members: readonly MiniBossMemberFrameState[],
  archetypeId: string
) => members.filter((member) => member.archetypeId === archetypeId && member.alive);

const buildHazards = (
  definition: MiniBossEncounterDefinition,
  attackWindow: AttackWindow,
  members: readonly MiniBossMemberFrameState[],
  guard: MiniBossGuardFrameState,
  safeCorridorId: string,
  viewportWidth: number,
  viewportHeight: number,
  fps: number,
  survivorMode: boolean,
  seedKey: string
): readonly MiniBossHazardCommand[] => {
  if (attackWindow.beat === 'recovery') return [];
  const warning = attackWindow.beat === 'warning';
  const choreography = definition.choreography;
  const hazards: MiniBossHazardCommand[] = [];

  if (choreography.kind === 'paired-crossfire') {
    const cores = findAliveFrameMembers(members, choreography.coreArchetypeId);
    const satellites = findAliveFrameMembers(members, choreography.satelliteArchetypeId);
    const cadence = survivorMode
      ? Math.round(choreography.baseCadenceFrames * choreography.survivorCadenceMultiplier)
      : choreography.baseCadenceFrames;
    const emission = resolveEmission(attackWindow, cadence);
    const startSide = stableUnit(`${seedKey}:crossfire-first:${attackWindow.executionIndex}`) < 0.5 ? 0 : 1;
    const source = cores.length <= 1
      ? cores[0]
      : cores[(startSide + emission.index) % cores.length];
    if (!source) return [];
    const sourceIsLeft = source.x < viewportWidth / 2;
    const target = {
      // Keep the crossing pair aimed into opposite outer lanes so the ordered
      // volleys preserve one continuous center seam as their shots overlap.
      x: viewportWidth * (
        sourceIsLeft
          ? 1 - choreography.diagonalInsetRatio
          : choreography.diagonalInsetRatio
      ),
      y: viewportHeight * 0.94
    };
    const activeKind = attackWindow.kind === 'signature' ? 'diagonal-crossfire' : 'projectile-burst';
    const supportSource = attackWindow.kind === 'support' && satellites.length > 0
      ? satellites[(startSide + emission.index) % satellites.length]
      : source;
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: activeKind,
      source: supportSource,
      origin: { x: supportSource.x, y: supportSource.y },
      target,
      projectileCount: survivorMode ? 2 : attackWindow.attack.maximumProjectilesPerEmission,
      warning,
      emitNow: warning || emission.emitNow,
      emissionIndex: emission.index,
      angleRadians: Math.atan2(target.y - supportSource.y, target.x - supportSource.x)
    }));
    return hazards;
  }

  if (choreography.kind === 'guardian-halo') {
    const core = findAliveFrameMembers(members, choreography.coreArchetypeId)[0];
    const guardians = findAliveFrameMembers(members, choreography.guardianArchetypeId);
    if (!core) return [];
    const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
    const gapCenterRadians = guard.gapCenterRadians ?? 0;
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: attackWindow.kind === 'signature' ? 'ring-with-gap' : 'guardian-pulse',
      source: core,
      origin: { x: core.x, y: core.y },
      target: { x: viewportWidth / 2, y: viewportHeight * 0.9 },
      projectileCount: Math.min(
        attackWindow.attack.maximumProjectilesPerEmission,
        Math.max(4, guardians.length * (attackWindow.kind === 'signature' ? 2 : 1))
      ),
      warning,
      emitNow: warning || emission.emitNow,
      emissionIndex: emission.index,
      gapCenterRadians,
      gapArcRadians: guard.gapArcRadians
    }));
    return hazards;
  }

  if (choreography.kind === 'edge-rail') {
    const wall = findAliveFrameMembers(members, choreography.wallArchetypeId)[0];
    if (!wall) return [];
    const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
    const fromLeft = wall.x < viewportWidth / 2;
    const target = {
      x: fromLeft ? viewportWidth : 0,
      y: attackWindow.kind === 'signature'
        ? wall.y + Math.sin(attackWindow.actionFrame / Math.max(1, fps) * 2.1) * viewportHeight * 0.12
        : viewportHeight * (0.38 + (emission.index % 3) * 0.18)
    };
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: attackWindow.kind === 'signature' ? 'rail-sweep' : 'projectile-burst',
      source: wall,
      origin: { x: wall.x, y: wall.y },
      target,
      projectileCount: attackWindow.kind === 'signature' ? 1 : attackWindow.attack.maximumProjectilesPerEmission,
      warning,
      emitNow: warning || attackWindow.kind === 'signature' || emission.emitNow,
      emissionIndex: emission.index,
      angleRadians: Math.atan2(target.y - wall.y, target.x - wall.x)
    }));
    return hazards;
  }

  if (choreography.kind === 'carrier-release') {
    const carrier = findAliveFrameMembers(members, choreography.carrierArchetypeId)[0];
    if (!carrier) return [];
    const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
    const lane = (emission.index + (stableUnit(`${seedKey}:carrier-lane`) < 0.5 ? 0 : 1)) % 2;
    const target = { x: viewportWidth * (lane === 0 ? 0.36 : 0.64), y: viewportHeight * 0.92 };
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: attackWindow.kind === 'signature' ? 'formation-burst' : 'projectile-burst',
      source: carrier,
      origin: { x: carrier.x, y: carrier.y + 18 },
      target,
      projectileCount: attackWindow.kind === 'signature' ? choreography.releaseCount : attackWindow.attack.maximumProjectilesPerEmission,
      warning,
      emitNow: warning || emission.emitNow,
      emissionIndex: emission.index,
      angleRadians: Math.atan2(target.y - carrier.y, target.x - carrier.x)
    }));
    return hazards;
  }

  if (choreography.kind === 'mirror-exchange') {
    const sentinels = findAliveFrameMembers(members, choreography.sentinelArchetypeId);
    if (sentinels.length === 0) return [];
    const guarded = new Set(guard.guardedMemberIds);
    const source = sentinels.find((sentinel) => !guarded.has(sentinel.id)) ?? sentinels[0];
    const cadence = survivorMode
      ? Math.round(attackWindow.attack.emissionIntervalFrames * choreography.survivorCadenceMultiplier)
      : attackWindow.attack.emissionIntervalFrames;
    const emission = resolveEmission(attackWindow, cadence);
    const target = {
      x: viewportWidth * (source.x < viewportWidth / 2 ? 0.63 : 0.37),
      y: viewportHeight * 0.93
    };
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: attackWindow.kind === 'support' ? 'beam' : 'projectile-burst',
      source,
      origin: { x: source.x, y: source.y },
      target,
      projectileCount: attackWindow.kind === 'support' ? 1 : survivorMode ? 2 : attackWindow.attack.maximumProjectilesPerEmission,
      warning,
      emitNow: warning || attackWindow.kind === 'support' || emission.emitNow,
      emissionIndex: emission.index,
      angleRadians: Math.atan2(target.y - source.y, target.x - source.x)
    }));
    return hazards;
  }

  if (choreography.kind === 'rotating-gap') {
    const core = findAliveFrameMembers(members, choreography.coreArchetypeId)[0];
    if (!core) return [];
    const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
    const baseDirection = choreography.clockwiseFirst ? 1 : -1;
    const direction = (attackWindow.executionIndex + (attackWindow.kind === 'support' ? 1 : 0)) % 2 === 0
      ? baseDirection
      : -baseDirection;
    const gapCenterRadians = (
      stableUnit(`${seedKey}:prism-gap`) * TAU
      + direction * (emission.index * (TAU / Math.max(1, choreography.projectileCount)))
    ) % TAU;
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: 'ring-with-gap',
      source: core,
      origin: { x: core.x, y: core.y },
      target: { x: viewportWidth / 2, y: viewportHeight * 0.88 },
      projectileCount: Math.min(
        attackWindow.attack.maximumProjectilesPerEmission,
        choreography.projectileCount - choreography.gapSlots
      ),
      warning,
      emitNow: warning || emission.emitNow,
      emissionIndex: emission.index,
      gapCenterRadians,
      gapArcRadians: (choreography.gapSlots / choreography.projectileCount) * TAU
    }));
    return hazards;
  }

  if (choreography.kind === 'convoy-command') {
    const captain = findAliveFrameMembers(members, choreography.captainArchetypeId)[0];
    const escorts = findAliveFrameMembers(members, choreography.escortArchetypeId);
    if (!captain) return [];
    const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
    const source = attackWindow.kind === 'support' && escorts.length > 0
      ? escorts[emission.index % escorts.length]
      : captain;
    const side = (emission.index + (stableUnit(`${seedKey}:convoy-side`) < 0.5 ? 0 : 1)) % 2;
    const target = { x: viewportWidth * (side === 0 ? 0.33 : 0.67), y: viewportHeight * 0.93 };
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: 'formation-burst',
      source,
      origin: { x: source.x, y: source.y },
      target,
      projectileCount: Math.min(
        attackWindow.attack.maximumProjectilesPerEmission,
        Math.max(2, escorts.length + 1)
      ),
      warning,
      emitNow: warning || emission.emitNow,
      emissionIndex: emission.index,
      angleRadians: Math.atan2(target.y - source.y, target.x - source.x)
    }));
    return hazards;
  }

  const sentries = findAliveFrameMembers(members, choreography.sentryArchetypeId);
  if (sentries.length === 0) return [];
  const emission = resolveEmission(attackWindow, attackWindow.attack.emissionIntervalFrames);
  const variantIndex = definition.safeRoute.variants.findIndex((variant) => variant.id === safeCorridorId);
  const safeQuadrant = Math.max(0, variantIndex);
  const verticalRatio = safeQuadrant % 2 === 0 ? 0.61 : 0.39;
  const horizontalRatio = safeQuadrant < 2 ? 0.43 : 0.62;
  const west = sentries.find((member) => member.role === 'sentry-west');
  const north = sentries.find((member) => member.role === 'sentry-north');
  if (west) {
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: 'grid-boundary',
      source: west,
      origin: { x: 0, y: viewportHeight * horizontalRatio },
      target: { x: viewportWidth, y: viewportHeight * horizontalRatio },
      projectileCount: 1,
      warning,
      emitNow: warning || attackWindow.kind === 'signature' || emission.emitNow,
      emissionIndex: emission.index
    }));
  }
  if (north) {
    hazards.push(makeHazard({
      definition,
      attackWindow,
      safeCorridorId,
      kind: 'grid-boundary',
      source: north,
      origin: { x: viewportWidth * verticalRatio, y: 0 },
      target: { x: viewportWidth * verticalRatio, y: viewportHeight },
      projectileCount: 1,
      warning,
      emitNow: warning || attackWindow.kind === 'signature' || emission.emitNow,
      emissionIndex: emission.index
    }));
  }
  return hazards;
};

const buildReinforcements = (
  definition: MiniBossEncounterDefinition,
  attackWindow: AttackWindow,
  members: readonly MiniBossMemberFrameState[],
  context: MiniBossEncounterSampleContext,
  viewportWidth: number,
  viewportHeight: number
): readonly MiniBossReinforcementCommand[] => {
  const choreography = definition.choreography;
  if (
    choreography.kind !== 'carrier-release'
    || attackWindow.kind !== 'signature'
    || attackWindow.beat !== 'action'
    || attackWindow.actionFrame % attackWindow.attack.emissionIntervalFrames !== 0
  ) return [];
  const carrier = members.find((member) => (
    member.archetypeId === choreography.carrierArchetypeId && member.alive
  ));
  if (!carrier) return [];
  const alreadySpawned = Math.max(0, Math.floor(context.reinforcementsSpawned ?? 0));
  const remaining = Math.max(0, definition.budgets.maximumReinforcements - alreadySpawned);
  const requestedCount = Math.min(choreography.releaseCount, remaining);
  if (requestedCount <= 0) return [];
  const emissionIndex = Math.floor(attackWindow.actionFrame / attackWindow.attack.emissionIntervalFrames);
  return [{
    id: `${definition.eventId}:reinforcement:${attackWindow.executionIndex}:${emissionIndex}`,
    ownerEventId: definition.eventId,
    count: requestedCount,
    assetId: 'maw-spawn-art',
    target: {
      x: viewportWidth * (emissionIndex % 2 === 0 ? 0.36 : 0.64),
      y: viewportHeight * 0.88
    },
    speedPixelsPerSecond: choreography.approachSpeedPixelsPerSecond
  }];
};

const cleanupCommand = (
  definition: MiniBossEncounterDefinition,
  requested: boolean
): MiniBossCleanupCommand => ({
  requested,
  ownerEventId: definition.eventId,
  removeOwnedProjectiles: requested,
  removeOwnedBeams: requested,
  removeOwnedReinforcements: requested,
  preserveUnrelatedEntities: true
});

export const sampleMiniBossEncounter = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId,
  context: MiniBossEncounterSampleContext
): MiniBossEncounterFrameState => {
  const definition = resolveDefinition(definitionOrId);
  const fps = positiveInteger(context.fps ?? DEFAULT_FPS, DEFAULT_FPS);
  const frame = Math.max(0, Math.floor(Number.isFinite(context.frame) ? context.frame : 0));
  const viewportWidth = Math.max(1, Number.isFinite(context.viewportWidth) ? context.viewportWidth! : DEFAULT_VIEWPORT_WIDTH);
  const viewportHeight = Math.max(1, Number.isFinite(context.viewportHeight) ? context.viewportHeight! : DEFAULT_VIEWPORT_HEIGHT);
  const elapsedSeconds = frame / fps;
  const seedKey = `${definition.deterministicSeed}:${String(context.seed ?? definition.deterministicSeed)}`;
  const runtimeMembers = resolveRuntimeMembers(definition, context);
  const aliveDamageable = runtimeMembers.filter((member) => member.instance.damageable && member.alive);
  const damageableMembers = runtimeMembers.filter((member) => member.instance.damageable);
  const aggregateHealthRatio = damageableMembers.length > 0
    ? damageableMembers.reduce((sum, member) => sum + member.healthRatio, 0) / damageableMembers.length
    : 0;
  const lowHealth = aggregateHealthRatio <= 0.5 && aliveDamageable.length > 0;
  const pairArchetypeId = resolvePairArchetypeId(definition);
  const survivingPairMembers = pairArchetypeId
    ? membersForArchetype(runtimeMembers, pairArchetypeId).filter((member) => member.alive)
    : [];
  const survivorMode = Boolean(pairArchetypeId) && survivingPairMembers.length === 1;
  const entranceFrames = Math.max(1, Math.round(definition.entranceSeconds * fps));
  const entranceProgress = clamp(frame / entranceFrames, 0, 1);
  const combatFrame = Math.max(0, frame - entranceFrames);
  const attackWindow = resolveAttackWindow(definition, combatFrame, fps);
  const safeCorridorId = chooseSafeRouteId(definition, seedKey, attackWindow.executionIndex);
  const defeated = aliveDamageable.length === 0;
  const defeatElapsedFrames = Math.max(0, Math.floor(context.defeatElapsedFrames ?? 0));
  const deathPresentationComplete = defeatElapsedFrames >= Math.round(DEATH_PRESENTATION_SECONDS * fps);
  const cleanupRequested = defeated && deathPresentationComplete;
  const guard = resolveGuardState(
    definition,
    runtimeMembers,
    elapsedSeconds,
    attackWindow.executionIndex,
    seedKey
  );
  const guardedMemberIds = new Set(guard.guardedMemberIds);
  const hitMemberIds = new Set(context.hitMemberIds ?? []);
  const attacking = !defeated && entranceProgress >= 1 && attackWindow.beat !== 'recovery';

  const members = runtimeMembers.map((memberState) => {
    const pose = resolveMemberPose(
      definition,
      memberState,
      runtimeMembers,
      elapsedSeconds,
      entranceProgress,
      attackWindow.executionIndex,
      viewportWidth,
      viewportHeight,
      seedKey,
      lowHealth
    );
    return {
      id: memberState.instance.id,
      archetypeId: memberState.instance.archetypeId,
      role: memberState.instance.role,
      assetId: memberState.instance.assetId,
      ...pose,
      opacity: memberState.alive ? 1 : cleanupRequested ? 0 : clamp(1 - defeatElapsedFrames / Math.max(1, fps * DEATH_PRESENTATION_SECONDS), 0, 1),
      health: memberState.health,
      healthRatio: memberState.healthRatio,
      alive: memberState.alive,
      animationState: resolveAnimationState({
        alive: memberState.alive,
        healthRatio: memberState.healthRatio,
        entranceProgress,
        attacking,
        hit: hitMemberIds.has(memberState.instance.id)
      }),
      damageable: memberState.instance.damageable && !guardedMemberIds.has(memberState.instance.id)
    } satisfies MiniBossMemberFrameState;
  });

  const hazards = defeated || entranceProgress < 1
    ? []
    : buildHazards(
        definition,
        attackWindow,
        members,
        guard,
        safeCorridorId,
        viewportWidth,
        viewportHeight,
        fps,
        survivorMode,
        seedKey
      );
  const reinforcements = defeated || entranceProgress < 1
    ? []
    : buildReinforcements(
        definition,
        attackWindow,
        members,
        context,
        viewportWidth,
        viewportHeight
      );

  const stage = cleanupRequested
    ? 'cleanup'
    : defeated
      ? 'death'
      : entranceProgress < 1
        ? 'entrance'
        : survivorMode
          ? 'survivor'
          : lowHealth
            ? 'low-health'
            : attackWindow.beat === 'recovery'
              ? 'idle'
              : attackWindow.kind;

  return Object.freeze({
    encounterId: definition.id,
    eventId: definition.eventId,
    frame,
    stage,
    activeAttackId: defeated || entranceProgress < 1 ? undefined : attackWindow.attack.id,
    activeAttackName: defeated || entranceProgress < 1 ? undefined : attackWindow.attack.name,
    attackBeat: defeated || entranceProgress < 1 ? 'none' : attackWindow.beat,
    lowHealth,
    survivorMode,
    members: Object.freeze(members),
    hazards: Object.freeze([...hazards]),
    reinforcements: Object.freeze([...reinforcements]),
    guard: Object.freeze({ ...guard, guardedMemberIds: Object.freeze([...guard.guardedMemberIds]) }),
    safeCorridorId,
    cleanup: Object.freeze(cleanupCommand(definition, cleanupRequested))
  });
};

export const resolveMiniBossMemberAssetUrl = (
  definitionOrId: MiniBossEncounterDefinition | MiniBossEncounterId,
  memberState: Pick<MiniBossMemberFrameState, 'assetId' | 'animationState' | 'healthRatio'>,
  frame = 0
): string | undefined => {
  const definition = resolveDefinition(definitionOrId);
  const binding = definition.assets.find((candidate) => candidate.id === memberState.assetId);
  if (!binding) return undefined;
  if (binding.url) return binding.url;
  const frames = binding.frames ?? [];
  if (frames.length === 0) return undefined;
  if (frames.length >= 5) {
    if (memberState.animationState === 'critical' || memberState.healthRatio <= 0.15) return frames[4];
    if (memberState.animationState === 'damage' || memberState.animationState === 'hit' || memberState.healthRatio <= 0.5) return frames[3];
    if (memberState.animationState === 'attack') return frames[2];
    if (memberState.animationState === 'idle') return frames[Math.floor(frame / 24) % 2];
    return frames[0];
  }
  return frames[Math.floor(Math.max(0, frame) / 6) % frames.length];
};
