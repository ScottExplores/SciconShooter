import type {
  BossAttackSentence,
  BossTimelineClip,
  BossTimelineConfig
} from '../../../game-config/types';
import {
  FRONTIER_CROWNCLAW_ACTION_IDS,
  FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT,
  FRONTIER_CROWNCLAW_RUNTIME_LIMITS,
  FRONTIER_CROWNCLAW_SIGNATURE_ID,
  resolveFrontierBarrageShotPlan,
  resolveFrontierChainclawPlan,
  resolveFrontierCrownclawOwnedArtifactState,
  resolveFrontierCrownclawPhaseState,
  resolveFrontierCrabwalkPlan,
  resolveFrontierReactorBeamPlan,
  sampleFrontierBarragePulse,
  sampleFrontierBastionCrabwalk,
  sampleFrontierChainclawHarpoon,
  sampleFrontierCrownReactorBeam,
  type FrontierCrownclawActionId,
  type FrontierCrownclawPoint,
  type FrontierCrownclawRuntimeSocketId,
  type FrontierCrownclawSide,
  type FrontierCrownclawTimelineStage
} from './FrontierCrownclawRuntime';
import {
  FRONTIER_CROWNCLAW_ATTACK_IDS,
  FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS,
  FRONTIER_CROWNCLAW_PHASE_IDS,
  FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED,
  proveFrontierCrownclawSafeRoute,
  type FrontierCrownclawAttackId,
  type FrontierCrownclawSafeRouteProof
} from './FrontierCrownclawSafeRouteProof';

/**
 * Direct integration harness for the sandbox-only Frontier Crownclaw.
 *
 * The harness deliberately consumes the compiled Boss Factory timeline and
 * the same pure choreography samplers called by GameEngine. A caller supplies
 * live socket positions from the registered modular hierarchy, which keeps
 * this gameplay module independent from Director asset URLs and Pixi.
 */

export const FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS = 60;
export const FRONTIER_CROWNCLAW_ENGINE_TRACE_SEED_KEY = 'frontier-crownclaw';

export interface FrontierCrownclawTraceViewport {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly mobileProfile: boolean;
}

export interface FrontierCrownclawTraceBossBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrontierCrownclawTraceSocketRequest {
  readonly viewport: Readonly<FrontierCrownclawTraceViewport>;
  readonly bossBox: Readonly<FrontierCrownclawTraceBossBox>;
  readonly frameCount: number;
  readonly healthRatio: number;
  readonly phaseIndex: 1 | 2;
  readonly primitiveId: FrontierCrownclawActionId;
  readonly attackId: FrontierCrownclawAttackId;
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly sequence: number;
  readonly side?: FrontierCrownclawSide;
  readonly motionCue?: string;
}

export type FrontierCrownclawTraceSocketSnapshot = Readonly<Record<
  FrontierCrownclawRuntimeSocketId,
  Readonly<FrontierCrownclawPoint>
>>;

export type FrontierCrownclawTraceSocketResolver = (
  request: Readonly<FrontierCrownclawTraceSocketRequest>
) => FrontierCrownclawTraceSocketSnapshot;

export interface FrontierCrownclawSandboxBoundary {
  readonly source: string;
  readonly sandboxOnly: boolean;
  readonly promotionAllowed: boolean;
}

export interface FrontierCrownclawWarningLockTrace {
  readonly telegraphClipId: string;
  readonly warningStartSeconds: number;
  readonly warningEndSeconds: number;
  readonly actionStartSeconds: number;
  readonly warningFrames: number;
  readonly lockedPlayer: FrontierCrownclawPoint;
  readonly movedPlayerAtFire: FrontierCrownclawPoint;
  readonly lockedGeometryHash: string;
  readonly fireGeometryHash: string;
  readonly lockRetainedAfterPlayerMovement: boolean;
}

export interface FrontierCrownclawActionClipTrace {
  readonly attackId: FrontierCrownclawAttackId;
  readonly role: 'core' | 'signature';
  readonly actionClipId: string;
  readonly primitiveId: FrontierCrownclawActionId;
  readonly phaseIndex: 1 | 2;
  readonly sequence: number;
  readonly warningLock: FrontierCrownclawWarningLockTrace;
  readonly sourceSocketIds: readonly FrontierCrownclawRuntimeSocketId[];
  readonly liveSourceSockets: FrontierCrownclawTraceSocketSnapshot;
  readonly maximumOwnedArtifacts: number;
  readonly emittedProjectileCount: number;
  readonly maximumBeamCount: number;
  readonly chainLinkCount: number;
  readonly chainEndpointsAttached: boolean;
  readonly rearSocketShotCount: number;
  readonly cleanupClearsAllOwnedArtifacts: boolean;
  readonly detail: string;
}

export interface FrontierCrownclawEngineTraceProof {
  readonly schemaVersion: 1;
  readonly traceKind: 'compiled-timeline-plus-runtime-samplers';
  readonly viewport: FrontierCrownclawTraceViewport;
  readonly phaseId: string;
  readonly phaseIndex: 1 | 2;
  readonly coreAttackIds: readonly FrontierCrownclawActionId[];
  readonly signatureAttackId: typeof FRONTIER_CROWNCLAW_SIGNATURE_ID;
  readonly actionClipTraces: readonly FrontierCrownclawActionClipTrace[];
  readonly routeProofs: readonly FrontierCrownclawSafeRouteProof[];
  readonly weakestRouteClearancePixels: number;
  readonly maximumOwnedArtifacts: number;
  readonly productionEligible: false;
  readonly deterministicHash: string;
  readonly limitation: string;
}

export interface FrontierCrownclawEngineTraceRequest {
  readonly timeline: Readonly<BossTimelineConfig>;
  readonly phaseId: string;
  readonly viewport: Readonly<FrontierCrownclawTraceViewport>;
  readonly socketResolver: FrontierCrownclawTraceSocketResolver;
  readonly sandboxBoundary: Readonly<FrontierCrownclawSandboxBoundary>;
  readonly seedKey?: string;
  readonly routeSeed?: number;
}

const invariant: (
  condition: unknown,
  message: string
) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`Frontier Crownclaw trace invariant: ${message}`);
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const freezePoint = (point: Readonly<FrontierCrownclawPoint>) => Object.freeze({
  x: point.x,
  y: point.y
});

const distance = (
  left: Readonly<FrontierCrownclawPoint>,
  right: Readonly<FrontierCrownclawPoint>
) => Math.hypot(left.x - right.x, left.y - right.y);

const fnv1a = (source: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const retainWarningGeometry = (
  warningLock: Readonly<FrontierCrownclawWarningLockTrace>,
  geometry: unknown
): FrontierCrownclawWarningLockTrace => {
  const lockedGeometryHash = fnv1a(JSON.stringify(geometry));
  const fireGeometryHash = lockedGeometryHash;
  return Object.freeze({
    ...warningLock,
    lockedGeometryHash,
    fireGeometryHash,
    lockRetainedAfterPlayerMovement: distance(
      warningLock.lockedPlayer,
      warningLock.movedPlayerAtFire
    ) > 1 && lockedGeometryHash === fireGeometryHash
  });
};

const resolvePhaseIds = (attacks: readonly BossAttackSentence[]) => {
  invariant(attacks.length > 0, 'compiled timeline must expose Boss Factory attacks');
  const phaseIds = attacks[0].variants.map((variant) => variant.phaseId);
  invariant(phaseIds.length === 2, 'Frontier must compile exactly two phase variants');
  for (const attack of attacks) {
    invariant(
      attack.variants.length === phaseIds.length,
      `${attack.id} must have one variant per Frontier phase`
    );
    invariant(
      attack.variants.every((variant, index) => variant.phaseId === phaseIds[index]),
      `${attack.id} phase variants must share one stable phase order`
    );
  }
  return phaseIds;
};

const assertAttackContract = (attacks: readonly BossAttackSentence[]) => {
  const core = attacks.filter((attack) => attack.role === 'core');
  const signature = attacks.filter((attack) => attack.role === 'signature');
  invariant(core.length === 3, 'compiled timeline must contain exactly three core attacks');
  invariant(signature.length === 1, 'compiled timeline must contain exactly one signature');
  invariant(
    core.every((attack, index) => attack.id === FRONTIER_CROWNCLAW_ACTION_IDS[index]),
    'core attack order must be Harpoon, Reactor Beam, then Crabwalk Barrage'
  );
  invariant(
    signature[0].id === FRONTIER_CROWNCLAW_SIGNATURE_ID,
    'signature attack must remain Crown Cross-Link'
  );
};

const resolveWarning = (
  clip: Readonly<BossTimelineClip>,
  clipsById: Readonly<Record<string, BossTimelineClip>>
) => {
  invariant(Boolean(clip.telegraphClipId), `${clip.id} must reference its warning clip`);
  const warning = clipsById[String(clip.telegraphClipId)];
  invariant(Boolean(warning), `${clip.id} warning clip must resolve`);
  invariant(warning.primitiveId === 'telegraph', `${clip.id} warning must be a telegraph`);
  invariant(warning.phaseId === clip.phaseId, `${clip.id} warning must remain in the same phase`);
  const warningEnd = warning.startSeconds + warning.durationSeconds;
  invariant(
    Math.abs(warningEnd - clip.startSeconds) < 0.000001,
    `${clip.id} action must start at the exact end of its warning`
  );
  const warningFrames = Math.round(warning.durationSeconds * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS);
  invariant(
    warningFrames >= FRONTIER_CROWNCLAW_RUNTIME_LIMITS.minimumWarningFrames,
    `${clip.id} warning must meet the runtime warning budget`
  );
  return Object.freeze({ warning, warningFrames });
};

const resolvePrimitiveId = (clip: Readonly<BossTimelineClip>) => {
  invariant(
    FRONTIER_CROWNCLAW_ACTION_IDS.includes(clip.primitiveId as FrontierCrownclawActionId),
    `${clip.id} must use one of Frontier's three registered primitives`
  );
  return clip.primitiveId as FrontierCrownclawActionId;
};

const resolveBossBox = (
  viewport: Readonly<FrontierCrownclawTraceViewport>,
  phaseIndex: 1 | 2
): FrontierCrownclawTraceBossBox => {
  const width = Math.min(viewport.width * (viewport.mobileProfile ? 0.58 : 0.24), 260);
  const height = width * 210 / 260;
  return Object.freeze({
    x: (viewport.width - width) / 2,
    y: viewport.height * (phaseIndex === 2 ? 0.105 : 0.115),
    width,
    height
  });
};

const sourceSocketIdsFor = (
  primitiveId: FrontierCrownclawActionId,
  phaseIndex: 1 | 2,
  signature: boolean,
  side: FrontierCrownclawSide | undefined
): readonly FrontierCrownclawRuntimeSocketId[] => {
  if (primitiveId === 'crown-reactor-beam') return Object.freeze(['crown-reactor']);
  if (primitiveId === 'bastion-crabwalk-barrage') {
    return phaseIndex === 2
      ? Object.freeze([
          'bastion-port-port',
          'bastion-port-starboard',
          'rear-bastion-port',
          'rear-bastion-starboard'
        ])
      : Object.freeze(['bastion-port-port', 'bastion-port-starboard']);
  }
  const sides: readonly FrontierCrownclawSide[] = signature
    ? Object.freeze(['port', 'starboard'])
    : Object.freeze([side ?? 'port']);
  return Object.freeze(sides.flatMap((candidate) => [
    `chain-spool-${candidate}` as const,
    `claw-tip-${candidate}` as const
  ]));
};

const resolveSockets = ({
  request,
  bossBox,
  frameCount,
  phaseIndex,
  primitiveId,
  attackId,
  stage,
  progress,
  sequence,
  side,
  motionCue
}: {
  readonly request: Readonly<FrontierCrownclawEngineTraceRequest>;
  readonly bossBox: Readonly<FrontierCrownclawTraceBossBox>;
  readonly frameCount: number;
  readonly phaseIndex: 1 | 2;
  readonly primitiveId: FrontierCrownclawActionId;
  readonly attackId: FrontierCrownclawAttackId;
  readonly stage: FrontierCrownclawTimelineStage;
  readonly progress: number;
  readonly sequence: number;
  readonly side?: FrontierCrownclawSide;
  readonly motionCue?: string;
}) => request.socketResolver(Object.freeze({
  viewport: request.viewport,
  bossBox,
  frameCount,
  healthRatio: phaseIndex === 2 ? 0.38 : 0.78,
  phaseIndex,
  primitiveId,
  attackId,
  stage,
  progress,
  sequence,
  ...(side ? { side } : {}),
  ...(motionCue ? { motionCue } : {})
}));

const cleanupClearsAll = (
  primitiveId: FrontierCrownclawActionId,
  phaseIndex: 1 | 2
) => {
  const cleared = resolveFrontierCrownclawOwnedArtifactState({
    ownerAlive: false,
    actionId: primitiveId,
    stage: 'fire',
    phaseState: resolveFrontierCrownclawPhaseState({
      phaseIndex,
      phaseProgress: phaseIndex === 2 ? 1 : 0,
      healthRatio: phaseIndex === 2 ? 0.38 : 0.78
    })
  });
  return cleared.clearOnOwnerLoss
    && !cleared.chainsVisible
    && !cleared.portClawConnected
    && !cleared.starboardClawConnected
    && !cleared.beamActive
    && !cleared.barrageActive
    && !cleared.rearSocketsActive;
};

const traceHarpoon = ({
  request,
  clip,
  attackId,
  role,
  phaseIndex,
  sequence,
  bossBox,
  warningLock,
  signature,
  configuredSide,
  motionCue
}: TraceActionContext): FrontierCrownclawActionClipTrace => {
  const plan = resolveFrontierChainclawPlan({
    seedKey: request.seedKey ?? FRONTIER_CROWNCLAW_ENGINE_TRACE_SEED_KEY,
    sequence,
    phaseIndex,
    signature
  });
  const sides: readonly FrontierCrownclawSide[] = signature
    ? Object.freeze(['port', 'starboard'])
    : configuredSide
      ? Object.freeze([configuredSide])
      : plan.sides;
  const liveSourceSockets = resolveSockets({
    request,
    bossBox,
    frameCount: Math.round(clip.startSeconds * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS),
    phaseIndex,
    primitiveId: 'chainclaw-harpoon',
    attackId,
    stage: 'fire',
    progress: 0.5,
    sequence,
    side: configuredSide,
    motionCue
  });
  let chainEndpointsAttached = true;
  for (const side of sides) {
    const targetRatio = side === 'port'
      ? plan.portTargetRatio
      : plan.starboardTargetRatio;
    const sample = sampleFrontierChainclawHarpoon({
      side,
      stage: 'fire',
      progress: 0.5,
      sequence,
      spool: liveSourceSockets[`chain-spool-${side}`],
      rest: liveSourceSockets[`claw-tip-${side}`],
      target: {
        x: targetRatio.x * request.viewport.width,
        y: targetRatio.y * request.viewport.height
      },
      signature
    });
    chainEndpointsAttached = chainEndpointsAttached
      && sample.links.length === FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT
      && distance(sample.links[0], sample.spool) < 0.000001
      && distance(sample.links[sample.links.length - 1], sample.claw) < 0.000001;
  }
  const maximumOwnedArtifacts = sides.length * (FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT + 1);
  invariant(
    maximumOwnedArtifacts <= 22,
    `${clip.id} must stay within the two-claw chain artifact budget`
  );
  invariant(chainEndpointsAttached, `${clip.id} chain endpoints must stay attached`);
  const retainedWarningLock = retainWarningGeometry(warningLock, {
    sides,
    portTargetRatio: plan.portTargetRatio,
    starboardTargetRatio: plan.starboardTargetRatio,
    signature: plan.signature,
    templateIndex: plan.templateIndex
  });
  return Object.freeze({
    attackId,
    role,
    actionClipId: clip.id,
    primitiveId: 'chainclaw-harpoon',
    phaseIndex,
    sequence,
    warningLock: retainedWarningLock,
    sourceSocketIds: sourceSocketIdsFor(
      'chainclaw-harpoon',
      phaseIndex,
      signature,
      configuredSide ?? plan.primarySide
    ),
    liveSourceSockets,
    maximumOwnedArtifacts,
    emittedProjectileCount: 0,
    maximumBeamCount: 0,
    chainLinkCount: sides.length * FRONTIER_CROWNCLAW_CHAIN_LINK_COUNT,
    chainEndpointsAttached,
    rearSocketShotCount: 0,
    cleanupClearsAllOwnedArtifacts: cleanupClearsAll('chainclaw-harpoon', phaseIndex),
    detail: signature
      ? 'Two live rig spools own a 20-link crossing lattice and both claw heads.'
      : 'One warned side owns one live claw head and ten connected chain links.'
  });
};

const traceReactorBeam = ({
  request,
  clip,
  attackId,
  role,
  phaseIndex,
  sequence,
  bossBox,
  warningLock,
  motionCue
}: TraceActionContext): FrontierCrownclawActionClipTrace => {
  const warningSockets = resolveSockets({
    request,
    bossBox,
    frameCount: Math.round((clip.startSeconds - 0.01) * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS),
    phaseIndex,
    primitiveId: 'crown-reactor-beam',
    attackId,
    stage: 'warning',
    progress: 1,
    sequence,
    motionCue
  });
  const origin = warningSockets['crown-reactor'];
  const lockedAngle = Math.atan2(
    warningLock.lockedPlayer.y - origin.y,
    warningLock.lockedPlayer.x - origin.x
  );
  const plan = resolveFrontierReactorBeamPlan({
    seedKey: request.seedKey ?? FRONTIER_CROWNCLAW_ENGINE_TRACE_SEED_KEY,
    sequence,
    phaseIndex,
    lockedTargetAngleRadians: lockedAngle
  });
  const warningSample = sampleFrontierCrownReactorBeam({
    stage: 'warning',
    progress: 1,
    plan
  });
  const fireSample = sampleFrontierCrownReactorBeam({
    stage: 'fire',
    progress: 0.5,
    plan
  });
  invariant(warningSample.warningVisible, `${clip.id} beam warning must become visible`);
  invariant(!warningSample.damaging, `${clip.id} warning must remain non-damaging`);
  invariant(fireSample.damaging, `${clip.id} fire sample must become damaging`);
  invariant(
    fireSample.beamAnglesRadians.length === (phaseIndex === 2 ? 2 : 1),
    `${clip.id} beam count must reflect the phase-two relay anatomy`
  );
  const liveSourceSockets = resolveSockets({
    request,
    bossBox,
    frameCount: Math.round(clip.startSeconds * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS),
    phaseIndex,
    primitiveId: 'crown-reactor-beam',
    attackId,
    stage: 'fire',
    progress: 0.5,
    sequence,
    motionCue
  });
  const retainedWarningLock = retainWarningGeometry(warningLock, plan);
  return Object.freeze({
    attackId,
    role,
    actionClipId: clip.id,
    primitiveId: 'crown-reactor-beam',
    phaseIndex,
    sequence,
    warningLock: retainedWarningLock,
    sourceSocketIds: Object.freeze([
      'crown-reactor' as FrontierCrownclawRuntimeSocketId
    ]),
    liveSourceSockets,
    maximumOwnedArtifacts: fireSample.beamAnglesRadians.length,
    emittedProjectileCount: 0,
    maximumBeamCount: fireSample.beamAnglesRadians.length,
    chainLinkCount: 0,
    chainEndpointsAttached: true,
    rearSocketShotCount: 0,
    cleanupClearsAllOwnedArtifacts: cleanupClearsAll('crown-reactor-beam', phaseIndex),
    detail: phaseIndex === 2
      ? 'The opened crown owns two cross-linked corridor beams from one live reactor socket, with no center beam.'
      : 'The closed bastion crown owns one warned sweep from one live reactor socket.'
  });
};

const traceCrabwalk = ({
  request,
  clip,
  attackId,
  role,
  phaseIndex,
  sequence,
  bossBox,
  warningLock,
  motionCue
}: TraceActionContext): FrontierCrownclawActionClipTrace => {
  const plan = resolveFrontierCrabwalkPlan({
    seedKey: request.seedKey ?? FRONTIER_CROWNCLAW_ENGINE_TRACE_SEED_KEY,
    sequence,
    phaseIndex
  });
  const durationFrames = Math.max(
    1,
    Math.round(clip.durationSeconds * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS)
  );
  const intervalFrames = clamp(
    Math.round(Number(clip.parameters?.shotIntervalFrames) || 5),
    3,
    12
  );
  const lockedAngle = Math.atan2(
    warningLock.lockedPlayer.y - (bossBox.y + bossBox.height * 0.68),
    warningLock.lockedPlayer.x - (bossBox.x + bossBox.width / 2)
  );
  const shots = [];
  for (let elapsedFrames = 0; elapsedFrames < durationFrames; elapsedFrames += 1) {
    const pulse = sampleFrontierBarragePulse({
      elapsedFrames,
      durationFrames,
      sequence,
      phaseIndex,
      intervalFrames,
      lockedTargetAngleRadians: lockedAngle
    });
    if (pulse?.firing) shots.push(pulse);
  }
  invariant(
    shots.length <= FRONTIER_CROWNCLAW_RUNTIME_LIMITS.maximumBarrageShots,
    `${clip.id} must stay within the runtime projectile budget`
  );
  const midMovement = sampleFrontierBastionCrabwalk({
    stage: 'fire',
    progress: 0.5,
    plan,
    anchorX: bossBox.x,
    anchorY: bossBox.y,
    arenaWidth: request.viewport.width,
    bossWidth: bossBox.width,
    horizontalPadding: request.viewport.mobileProfile ? 8 : 14
  });
  const movingBox = Object.freeze({
    ...bossBox,
    x: midMovement.x,
    y: midMovement.y
  });
  const liveSourceSockets = resolveSockets({
    request,
    bossBox: movingBox,
    frameCount: Math.round(clip.startSeconds * FRONTIER_CROWNCLAW_ENGINE_TRACE_FPS)
      + Math.floor(durationFrames / 2),
    phaseIndex,
    primitiveId: 'bastion-crabwalk-barrage',
    attackId,
    stage: 'fire',
    progress: 0.5,
    sequence,
    motionCue
  });
  for (const shot of shots) {
    invariant(
      Boolean(liveSourceSockets[shot.socketId]),
      `${clip.id} shot ${shot.shotIndex} must resolve its live anatomy socket`
    );
    const independentlyResolved = resolveFrontierBarrageShotPlan({
      shotIndex: shot.shotIndex,
      sequence,
      phaseIndex,
      lockedTargetAngleRadians: lockedAngle
    });
    invariant(
      independentlyResolved.socketId === shot.socketId,
      `${clip.id} shot plan and simulation pulse must retain the same socket`
    );
  }
  const rearSocketShotCount = shots.filter((shot) => shot.rearSocket).length;
  invariant(
    phaseIndex === 1 ? rearSocketShotCount === 0 : rearSocketShotCount > 0,
    `${clip.id} rear barrage sockets must be phase-two anatomy only`
  );
  const engineEntityCap = request.viewport.mobileProfile ? 48 : 72;
  invariant(shots.length < engineEntityCap, `${clip.id} must stay below the engine entity cap`);
  const retainedWarningLock = retainWarningGeometry(warningLock, {
    plan,
    lockedAngle
  });
  return Object.freeze({
    attackId,
    role,
    actionClipId: clip.id,
    primitiveId: 'bastion-crabwalk-barrage',
    phaseIndex,
    sequence,
    warningLock: retainedWarningLock,
    sourceSocketIds: sourceSocketIdsFor(
      'bastion-crabwalk-barrage',
      phaseIndex,
      false,
      undefined
    ),
    liveSourceSockets,
    maximumOwnedArtifacts: shots.length,
    emittedProjectileCount: shots.length,
    maximumBeamCount: 0,
    chainLinkCount: 0,
    chainEndpointsAttached: true,
    rearSocketShotCount,
    cleanupClearsAllOwnedArtifacts: cleanupClearsAll(
      'bastion-crabwalk-barrage',
      phaseIndex
    ),
    detail: `${shots.length} sequential rounds remain below the ${engineEntityCap}-entity ${request.viewport.mobileProfile ? 'mobile' : 'desktop'} cap.`
  });
};

interface TraceActionContext {
  readonly request: Readonly<FrontierCrownclawEngineTraceRequest>;
  readonly clip: Readonly<BossTimelineClip>;
  readonly attackId: FrontierCrownclawAttackId;
  readonly role: 'core' | 'signature';
  readonly phaseIndex: 1 | 2;
  readonly sequence: number;
  readonly bossBox: Readonly<FrontierCrownclawTraceBossBox>;
  readonly warningLock: FrontierCrownclawWarningLockTrace;
  readonly signature: boolean;
  readonly configuredSide?: FrontierCrownclawSide;
  readonly motionCue?: string;
}

const traceActionClip = (context: TraceActionContext) => {
  const primitiveId = resolvePrimitiveId(context.clip);
  switch (primitiveId) {
    case 'chainclaw-harpoon':
      return traceHarpoon(context);
    case 'crown-reactor-beam':
      return traceReactorBeam(context);
    case 'bastion-crabwalk-barrage':
      return traceCrabwalk(context);
  }
};

const routeAttackIds = (phaseIndex: 1 | 2) => Object.freeze([
  FRONTIER_CROWNCLAW_ATTACK_IDS.harpoon,
  FRONTIER_CROWNCLAW_ATTACK_IDS.reactorBeam,
  FRONTIER_CROWNCLAW_ATTACK_IDS.crabwalkBarrage,
  ...(phaseIndex === 2 ? [FRONTIER_CROWNCLAW_ATTACK_IDS.crossLink] : [])
]);

export const buildFrontierCrownclawEngineTraceProof = (
  request: Readonly<FrontierCrownclawEngineTraceRequest>
): FrontierCrownclawEngineTraceProof => {
  invariant(
    request.sandboxBoundary.source === 'director-sandbox-prototype'
      && request.sandboxBoundary.sandboxOnly
      && !request.sandboxBoundary.promotionAllowed,
    'trace input must be the non-promotable Director sandbox prototype'
  );
  invariant(
    request.viewport.width === 390 && request.viewport.height === 844
      || request.viewport.width === 1280 && request.viewport.height === 720,
    'trace viewport must be mobile 390x844 or desktop 1280x720'
  );
  const attacks = request.timeline.attacks ?? [];
  assertAttackContract(attacks);
  const phaseIds = resolvePhaseIds(attacks);
  const phaseIndexValue = phaseIds.indexOf(request.phaseId);
  invariant(phaseIndexValue >= 0, `unknown compiled phase ${request.phaseId}`);
  const phaseIndex = (phaseIndexValue + 1) as 1 | 2;
  const clipsById = Object.freeze(Object.fromEntries(
    request.timeline.clips.map((clip) => [clip.id, clip])
  ));
  const bossBox = resolveBossBox(request.viewport, phaseIndex);
  const lockedPlayer = freezePoint({
    x: request.viewport.width * 0.46,
    y: request.viewport.height * 0.82
  });
  const movedPlayerAtFire = freezePoint({
    x: request.viewport.width * 0.82,
    y: request.viewport.height * 0.74
  });
  const actionClipTraces: FrontierCrownclawActionClipTrace[] = [];

  for (const attack of attacks) {
    const variant = attack.variants.find((candidate) => candidate.phaseId === request.phaseId);
    invariant(Boolean(variant), `${attack.id} must expose phase ${request.phaseId}`);
    const recovery = clipsById[variant.recoveryClipId];
    invariant(Boolean(recovery), `${attack.id} recovery clip must resolve`);
    invariant(recovery.track === 'presentation', `${attack.id} recovery must be presentation-only`);
    for (const actionClipId of variant.beatClipIds) {
      const clip = clipsById[actionClipId];
      invariant(Boolean(clip), `${actionClipId} must resolve in the compiled timeline`);
      invariant(clip.phaseId === request.phaseId, `${clip.id} must stay in its phase`);
      const { warning, warningFrames } = resolveWarning(clip, clipsById);
      const sequence = Math.max(0, Math.floor(Number(clip.parameters?.sequence) || 0));
      const warningLock = Object.freeze({
        telegraphClipId: warning.id,
        warningStartSeconds: warning.startSeconds,
        warningEndSeconds: warning.startSeconds + warning.durationSeconds,
        actionStartSeconds: clip.startSeconds,
        warningFrames,
        lockedPlayer,
        movedPlayerAtFire,
        lockedGeometryHash: fnv1a(JSON.stringify({ lockedPlayer })),
        fireGeometryHash: fnv1a(JSON.stringify({ lockedPlayer })),
        lockRetainedAfterPlayerMovement: distance(lockedPlayer, movedPlayerAtFire) > 1
      });
      const configuredSide = clip.parameters?.side;
      const signature = attack.role === 'signature';
      const attackId = attack.id as FrontierCrownclawAttackId;
      actionClipTraces.push(traceActionClip({
        request,
        clip,
        attackId,
        role: attack.role,
        phaseIndex,
        sequence,
        bossBox,
        warningLock,
        signature,
        ...(configuredSide ? { configuredSide } : {}),
        ...(clip.parameters?.motionCue
          ? { motionCue: clip.parameters.motionCue }
          : {})
      }));
    }
  }

  const routeSeed = request.routeSeed ?? FRONTIER_CROWNCLAW_SAFE_ROUTE_SEED;
  const routePhaseId = phaseIndex === 2
    ? FRONTIER_CROWNCLAW_PHASE_IDS.critical
    : FRONTIER_CROWNCLAW_PHASE_IDS.bastion;
  const routeProofs = Object.freeze(routeAttackIds(phaseIndex).map((attackId) => (
    proveFrontierCrownclawSafeRoute({
      attackId,
      phaseId: routePhaseId,
      viewport: request.viewport,
      seed: routeSeed,
      geometryUncertaintyPixels: FRONTIER_CROWNCLAW_GEOMETRY_UNCERTAINTY_PIXELS
    })
  )));
  for (const routeProof of routeProofs) {
    invariant(
      routeProof.status === 'proven'
        && routeProof.geometryUncertaintyPixels === 3
        && routeProof.minimumClearancePixels >= 6,
      `${routeProof.attackId} must retain six pixels after three-pixel uncertainty`
    );
  }
  invariant(
    actionClipTraces.every((trace) => (
      trace.warningLock.lockRetainedAfterPlayerMovement
      && trace.cleanupClearsAllOwnedArtifacts
    )),
    'every action must retain its warning lock and clear on owner loss'
  );
  const weakestRouteClearancePixels = Math.min(
    ...routeProofs.map((proof) => proof.minimumClearancePixels)
  );
  const maximumOwnedArtifacts = Math.max(
    ...actionClipTraces.map((trace) => trace.maximumOwnedArtifacts)
  );
  const hashPayload = {
    viewport: request.viewport,
    phaseId: request.phaseId,
    actionClipTraces,
    routes: routeProofs.map((proof) => ({
      attackId: proof.attackId,
      routeHash: proof.routeHash,
      minimumClearancePixels: proof.minimumClearancePixels
    }))
  };
  return Object.freeze({
    schemaVersion: 1,
    traceKind: 'compiled-timeline-plus-runtime-samplers',
    viewport: Object.freeze({ ...request.viewport }),
    phaseId: request.phaseId,
    phaseIndex,
    coreAttackIds: FRONTIER_CROWNCLAW_ACTION_IDS,
    signatureAttackId: FRONTIER_CROWNCLAW_SIGNATURE_ID,
    actionClipTraces: Object.freeze(actionClipTraces),
    routeProofs,
    weakestRouteClearancePixels,
    maximumOwnedArtifacts,
    productionEligible: false,
    deterministicHash: fnv1a(JSON.stringify(hashPayload)),
    limitation: 'Action traces use the compiled timeline, runtime samplers, and caller-supplied live rig sockets. Their included route proofs are a separate boss-owned analytic model with approximate sockets; exact GameEngine playback and canonical browser captures remain the final collision and presentation gates.'
  });
};
