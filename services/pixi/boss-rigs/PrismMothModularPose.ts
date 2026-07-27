import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type {
  PreviewBossModularPoseInput,
  PreviewBossModularPoseSampler
} from './PreviewBossRigContracts';

/**
 * Prism Moth keeps its complete silhouette on one body-rooted hierarchy. Wing
 * pieces remain children of their authored shoulder group, so an attack pose
 * cannot leave a loose panel behind when the body banks, staggers, or dies.
 */
export const PRISM_MOTH_MODULAR_PART_IDS = [
  'root',
  'body',
  'core',
  'abdomen',
  'crest',
  'shoulder.left',
  'shoulder.right',
  'wing.left.upper',
  'wing.right.upper',
  'wing.left.mid',
  'wing.right.mid',
  'wing.left.lower-inner',
  'wing.right.lower-inner',
  'wing.left.lower-outer',
  'wing.right.lower-outer',
  'brood-pod.left',
  'brood-pod.right'
] as const;

export type PrismMothModularPartId = (typeof PRISM_MOTH_MODULAR_PART_IDS)[number];

export const PRISM_MOTH_MODULAR_SOCKET_IDS = [
  'wing-edge-left',
  'wing-edge-right',
  'wing-tip-left',
  'wing-tip-right',
  'brood-release-left',
  'brood-release-right',
  'prism-core'
] as const;

export type PrismMothModularSocketId = (typeof PRISM_MOTH_MODULAR_SOCKET_IDS)[number];

export const PRISM_MOTH_MOTION_CUES = Object.freeze({
  fold: 'prism-fold',
  open: 'prism-open',
  wingbeatLeft: 'prism-wingbeat-left',
  wingbeatRight: 'prism-wingbeat-right',
  broodDeploy: 'prism-brood-deploy',
  swoopPrep: 'prism-swoop-prep',
  swoopMid: 'prism-swoop-mid',
  kaleidoscopeCharge: 'prism-kaleidoscope-charge',
  kaleidoscopePeak: 'prism-kaleidoscope-peak',
  metamorphosis: 'prism-metamorphosis',
  death: 'prism-death'
} as const);

export interface PrismMothRigCompatibilityIssue {
  readonly path: string;
  readonly message: string;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const smoothstep = (value: number) => {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const actionEnvelope = (stage: string, progress: number) => {
  if (stage === 'warning' || stage === 'prepare' || stage === 'telegraph') {
    return smoothstep(progress);
  }
  if (stage === 'fire' || stage === 'active' || stage === 'peak') return 1;
  if (stage === 'recovery' || stage === 'cooldown' || stage === 'return') {
    return 1 - smoothstep(progress);
  }
  return 0;
};

const cueMatches = (cue: string, ...values: readonly string[]) => (
  values.some((value) => cue === value)
);

const expectedParents = Object.freeze({
  body: 'root',
  core: 'body',
  abdomen: 'body',
  crest: 'body',
  'shoulder.left': 'body',
  'shoulder.right': 'body',
  'wing.left.upper': 'shoulder.left',
  'wing.left.mid': 'shoulder.left',
  'wing.left.lower-inner': 'shoulder.left',
  'wing.left.lower-outer': 'shoulder.left',
  'brood-pod.left': 'shoulder.left',
  'wing.right.upper': 'shoulder.right',
  'wing.right.mid': 'shoulder.right',
  'wing.right.lower-inner': 'shoulder.right',
  'wing.right.lower-outer': 'shoulder.right',
  'brood-pod.right': 'shoulder.right'
} as const satisfies Readonly<Partial<Record<PrismMothModularPartId, PrismMothModularPartId>>>);

const expectedSockets = Object.freeze({
  'wing-edge-left': Object.freeze({
    partId: 'wing.left.mid',
    role: 'projectile-muzzle'
  }),
  'wing-edge-right': Object.freeze({
    partId: 'wing.right.mid',
    role: 'projectile-muzzle'
  }),
  'wing-tip-left': Object.freeze({
    partId: 'wing.left.upper',
    role: 'projectile-muzzle'
  }),
  'wing-tip-right': Object.freeze({
    partId: 'wing.right.upper',
    role: 'projectile-muzzle'
  }),
  'brood-release-left': Object.freeze({
    partId: 'brood-pod.left',
    role: 'detachable-pod'
  }),
  'brood-release-right': Object.freeze({
    partId: 'brood-pod.right',
    role: 'detachable-pod'
  }),
  'prism-core': Object.freeze({
    partId: 'core',
    role: 'core-origin'
  })
} as const);

/**
 * Checks the anatomy relationships used by the pose sampler. This deliberately
 * validates semantic ownership rather than frame names, allowing the art
 * package to add equal-canvas animation frames without changing choreography.
 */
export const validatePrismMothRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly PrismMothRigCompatibilityIssue[] => {
  const issues: PrismMothRigCompatibilityIssue[] = [];
  PRISM_MOTH_MODULAR_PART_IDS.forEach((partId) => {
    const part = registration.partById[partId];
    if (!part) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Prism Moth part ${partId}.`
      }));
      return;
    }
    const expectedParent = expectedParents[partId as keyof typeof expectedParents];
    if (expectedParent !== undefined && part.parentId !== expectedParent) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain attached to ${expectedParent}.`
      }));
    }
  });
  PRISM_MOTH_MODULAR_SOCKET_IDS.forEach((socketId) => {
    const socket = registration.socketById[socketId];
    const expected = expectedSockets[socketId];
    if (!socket) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Prism Moth socket ${socketId}.`
      }));
      return;
    }
    if (socket.partId !== expected.partId || socket.role !== expected.role) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `${socketId} must follow ${expected.partId} as ${expected.role}.`
      }));
    }
  });
  return Object.freeze(issues);
};

/**
 * Pure simulation-frame-driven pose sampling for Prism Moth Broodkeeper.
 *
 * The sampler uses only local translations, rotations, opacity, and uniform
 * structural scale. It never mirrors a handed part, performs wall-time reads,
 * or reproduces another boss's claw/cannon choreography. The result can be assigned
 * directly to PreviewBossArtwork.sampleModularPose.
 */
export const samplePrismMothModularPose = (
  input: PreviewBossModularPoseInput
): ModularBossRigPoseOverrides => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = Math.max(1, Math.floor(finiteOr(input.phaseIndex, 1)));
  const phaseProgress = phaseIndex >= 2
    ? smoothstep(finiteOr(input.phaseProgress, 1))
    : 0;
  const damageStage = clamp(
    Math.floor(finiteOr(input.damageStage, 0)),
    0,
    5
  );
  const persistentDamage = damageStage / 5;
  const entranceProgress = smoothstep(finiteOr(input.entranceProgress, 1));
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const cue = String(action?.motionCue ?? '').toLowerCase();
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const envelope = actionEnvelope(stage, progress);
  const side = action?.side;

  const reducedAmbient = input.reducedMotion ? 0.22 : 1;
  const pressure = 1 - healthRatio;
  const hoverPhase = frame * (0.031 + pressure * 0.003);
  const idleBeatPhase = frame * (0.069 + pressure * 0.006);
  const hover = Math.sin(hoverPhase) * (2.15 + pressure * 0.75) * reducedAmbient;
  const sway = Math.sin(frame * 0.018 + 0.45) * 1.8 * reducedAmbient;
  const idleBeat = Math.sin(idleBeatPhase) * 0.036 * reducedAmbient;
  const idleFeather = Math.sin(idleBeatPhase * 0.52 + 1.15) * 0.022 * reducedAmbient;
  const damagedWingTremor = Math.sin(frame * 0.23 + 0.6)
    * 0.026
    * persistentDamage
    * reducedAmbient;

  const isFold = cueMatches(cue, PRISM_MOTH_MOTION_CUES.fold, 'fold', 'wing-fold');
  const isOpen = cueMatches(cue, PRISM_MOTH_MOTION_CUES.open, 'open', 'wing-open');
  const isLeftBeat = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.wingbeatLeft,
    'wingbeat-left',
    'left-wingbeat'
  );
  const isRightBeat = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.wingbeatRight,
    'wingbeat-right',
    'right-wingbeat'
  );
  const isGenericBeat = cueMatches(cue, 'prism-wingbeat', 'wingbeat');
  const isBroodDeploy = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.broodDeploy,
    'brood-deploy'
  );
  const isSwoopPrep = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.swoopPrep,
    'swoop-prep'
  );
  const isSwoopMid = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.swoopMid,
    'swoop-mid'
  );
  const isSwoop = isSwoopPrep
    || isSwoopMid
    || cueMatches(cue, 'prism-swoop', 'swoop');
  const isKaleidoscopeCharge = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.kaleidoscopeCharge,
    'kaleidoscope-charge'
  );
  const isKaleidoscopePeak = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.kaleidoscopePeak,
    'kaleidoscope-peak'
  );
  const isKaleidoscope = isKaleidoscopeCharge
    || isKaleidoscopePeak
    || cueMatches(cue, 'prism-kaleidoscope', 'kaleidoscope')
    || primitiveId === 'prism-kaleidoscope';
  const isMetamorphosis = cueMatches(
    cue,
    PRISM_MOTH_MOTION_CUES.metamorphosis,
    'metamorphosis',
    'phase2'
  );
  const isDeath = cueMatches(cue, PRISM_MOTH_MOTION_CUES.death, 'death')
    || primitiveId === 'prism-death';

  const entranceFold = 1 - entranceProgress;
  const explicitFold = isFold ? envelope : 0;
  const explicitOpen = isOpen ? envelope : 0;
  const swoopPrep = isSwoop
    ? isSwoopPrep || stage === 'warning' || stage === 'prepare'
      ? smoothstep(progress)
      : 0
    : 0;
  const swoopMid = isSwoop
    ? isSwoopMid || stage === 'fire' || stage === 'active'
      ? stage === 'recovery' || stage === 'cooldown'
        ? 1 - smoothstep(progress)
        : 1
      : 0
    : 0;
  const foldAmount = clamp(
    entranceFold * 0.9 + explicitFold + swoopPrep * 0.72 + swoopMid,
    0,
    1
  );

  const metamorphosis = isMetamorphosis ? smoothstep(progress) : phaseProgress;
  const kaleidoscopeCharge = isKaleidoscope
    ? isKaleidoscopePeak || stage === 'fire' || stage === 'peak'
      ? 1
      : smoothstep(progress)
    : 0;
  const kaleidoscopePeak = isKaleidoscope
    && (isKaleidoscopePeak || stage === 'fire' || stage === 'peak')
    ? 1 - progress * 0.12
    : 0;
  const openAmount = clamp(
    phaseProgress * 0.58
      + metamorphosis * 0.34
      + explicitOpen
      + kaleidoscopeCharge * 0.72
      + kaleidoscopePeak * 0.24
      + (isBroodDeploy ? envelope * 0.25 : 0),
    0,
    1
  );

  const beatSelectedLeft = isLeftBeat
    || (isGenericBeat && (side === 'left' || side === 'port' || side == null));
  const beatSelectedRight = isRightBeat
    || (isGenericBeat && (side === 'right' || side === 'starboard' || side == null));
  const actionStroke = stage === 'warning' || stage === 'prepare'
    ? -smoothstep(progress)
    : stage === 'fire' || stage === 'active'
      ? Math.sin(progress * Math.PI * 2 - Math.PI * 0.5)
      : stage === 'recovery' || stage === 'cooldown'
        ? (1 - smoothstep(progress)) * 0.45
        : 0;
  const leftBeat = beatSelectedLeft ? actionStroke * 0.3 : 0;
  const rightBeat = beatSelectedRight ? -actionStroke * 0.3 : 0;
  const leftBrace = beatSelectedRight ? -envelope * 0.055 : 0;
  const rightBrace = beatSelectedLeft ? envelope * 0.055 : 0;

  const broodDeploy = isBroodDeploy
    ? stage === 'fire' || stage === 'active'
      ? 1
      : envelope
    : 0;
  const swoopDirection = side === 'right' || side === 'starboard'
    ? 1
    : side === 'left' || side === 'port'
      ? -1
      : sequence % 2 === 0 ? -1 : 1;

  const reaction = input.reaction;
  const reactionStrength = clamp(finiteOr(reaction?.strength, 0), 0, 2);
  const significantReaction = Boolean(
    reaction && (reaction.kind === 'stagger' || reactionStrength >= 0.75)
  );
  const reactionProgress = clamp(finiteOr(reaction?.progress, 1), 0, 1);
  const stagger = significantReaction
    ? Math.sin(reactionProgress * Math.PI)
      * reactionStrength
      * (reaction?.kind === 'stagger' ? 1 : 0.48)
    : 0;
  const reactionDirection = reaction?.direction ?? 1;

  const deathProgress = isDeath ? smoothstep(progress) : 0;
  const deathBrace = smoothstep(clamp(deathProgress / 0.28, 0, 1));
  const deathBreak = smoothstep(clamp((deathProgress - 0.24) / 0.46, 0, 1));
  const deathFade = smoothstep(clamp((deathProgress - 0.68) / 0.32, 0, 1));
  const deathDirection = sequence % 2 === 0 ? -1 : 1;

  const phaseFan = phaseProgress * 0.12 + metamorphosis * 0.08;
  const foldRotation = foldAmount * 0.38;
  const openRotation = openAmount * 0.24;
  const deathDroop = deathBrace * 0.22 + deathBreak * 0.26;
  const leftShoulderRotation = idleBeat
    + foldRotation
    - openRotation
    + leftBeat
    + leftBrace
    + persistentDamage * 0.04
    + damagedWingTremor
    + stagger * 0.045
    + deathDroop;
  const rightShoulderRotation = -idleBeat
    - foldRotation
    + openRotation
    + rightBeat
    + rightBrace
    - persistentDamage * 0.025
    - damagedWingTremor * 0.62
    - stagger * 0.045
    - deathDroop;

  const structuralAlpha = clamp(1 - deathFade * 0.92, 0, 1);
  const corePulse = 1
    + phaseProgress * 0.055
    + kaleidoscopeCharge * 0.12
    + kaleidoscopePeak * 0.08
    + persistentDamage * (
      Math.floor(frame / 5) % 3 === 0 ? 0.065 : 0.018
    )
    + Math.sin(frame * 0.12) * 0.012 * reducedAmbient * (phaseIndex >= 2 ? 1 : 0.45);
  const bodyDeathScale = 1 - deathFade * 0.08;
  const podScale = 1 - deathBreak * 0.12;

  const partOverrides = Object.freeze({
    root: freezeOverride({
      xOffset: sway
        + swoopDirection * swoopPrep * 2.2
        + reactionDirection * stagger * 4.5
        + deathDirection * deathBreak * 8,
      yOffset: hover
        + persistentDamage * 2.5
        + swoopPrep * 4.5
        - swoopMid * 7
        + stagger * 1.4
        + deathBreak * 10,
      rotationOffset: Math.sin(hoverPhase + Math.PI * 0.5) * 0.012 * reducedAmbient
        + damagedWingTremor * 0.42
        + swoopDirection * (swoopPrep * 0.055 + swoopMid * 0.095)
        + reactionDirection * stagger * 0.038
        + deathDirection * deathBreak * 0.16
    }),
    body: freezeOverride({
      alpha: structuralAlpha,
      scaleXMultiplier: bodyDeathScale,
      scaleYMultiplier: bodyDeathScale
    }),
    core: freezeOverride({
      alpha: structuralAlpha,
      rotationOffset: kaleidoscopeCharge * (sequence % 2 === 0 ? -0.08 : 0.08),
      scaleXMultiplier: corePulse,
      scaleYMultiplier: corePulse
    }),
    abdomen: freezeOverride({
      yOffset: phaseProgress * 4
        + broodDeploy * 2
        + persistentDamage * 4
        + deathBreak * 13,
      rotationOffset: -swoopDirection * swoopMid * 0.055
        + damagedWingTremor * 0.75
        + deathDirection * deathBreak * 0.18,
      alpha: structuralAlpha,
      scaleXMultiplier: bodyDeathScale,
      scaleYMultiplier: bodyDeathScale
    }),
    crest: freezeOverride({
      yOffset: -metamorphosis * 5 - kaleidoscopeCharge * 3 + deathBreak * 4,
      rotationOffset: -swoopDirection * swoopPrep * 0.08
        - damagedWingTremor * 0.55
        - deathDirection * deathBreak * 0.12,
      alpha: structuralAlpha,
      scaleXMultiplier: bodyDeathScale,
      scaleYMultiplier: bodyDeathScale
    }),
    'shoulder.left': freezeOverride({
      xOffset: -phaseFan * 18 - broodDeploy * 2.5 - deathBreak * 10,
      yOffset: broodDeploy * 1.5 + deathBreak * 5,
      rotationOffset: leftShoulderRotation,
      alpha: structuralAlpha
    }),
    'shoulder.right': freezeOverride({
      xOffset: phaseFan * 18 + broodDeploy * 2.5 + deathBreak * 10,
      yOffset: broodDeploy * 1.5 + deathBreak * 5,
      rotationOffset: rightShoulderRotation,
      alpha: structuralAlpha
    }),
    'wing.left.upper': freezeOverride({
      rotationOffset: -openAmount * 0.2
        + foldAmount * 0.3
        + leftBeat * 0.82
        + idleFeather
        + deathDroop * 0.72,
      alpha: structuralAlpha
    }),
    'wing.right.upper': freezeOverride({
      rotationOffset: openAmount * 0.2
        - foldAmount * 0.3
        + rightBeat * 0.82
        - idleFeather
        - deathDroop * 0.72,
      alpha: structuralAlpha
    }),
    'wing.left.mid': freezeOverride({
      rotationOffset: -openAmount * 0.13
        + foldAmount * 0.24
        + leftBeat * 0.66
        - idleFeather * 0.72
        + deathDroop * 0.86,
      alpha: structuralAlpha
    }),
    'wing.right.mid': freezeOverride({
      rotationOffset: openAmount * 0.13
        - foldAmount * 0.24
        + rightBeat * 0.66
        + idleFeather * 0.72
        - deathDroop * 0.86,
      alpha: structuralAlpha
    }),
    'wing.left.lower-inner': freezeOverride({
      rotationOffset: -openAmount * 0.08
        + foldAmount * 0.17
        + leftBeat * 0.48
        + idleFeather * 0.52
        + deathDroop,
      alpha: structuralAlpha
    }),
    'wing.right.lower-inner': freezeOverride({
      rotationOffset: openAmount * 0.08
        - foldAmount * 0.17
        + rightBeat * 0.48
        - idleFeather * 0.52
        - deathDroop,
      alpha: structuralAlpha
    }),
    'wing.left.lower-outer': freezeOverride({
      rotationOffset: -openAmount * 0.17
        + foldAmount * 0.27
        + leftBeat * 0.74
        - idleFeather * 0.88
        + deathDroop * 1.12,
      alpha: structuralAlpha
    }),
    'wing.right.lower-outer': freezeOverride({
      rotationOffset: openAmount * 0.17
        - foldAmount * 0.27
        + rightBeat * 0.74
        + idleFeather * 0.88
        - deathDroop * 1.12,
      alpha: structuralAlpha
    }),
    'brood-pod.left': freezeOverride({
      xOffset: -broodDeploy * 5 - deathBreak * 7,
      yOffset: broodDeploy * 9 + deathBreak * 12,
      rotationOffset: -broodDeploy * 0.18 - deathBreak * 0.24,
      alpha: structuralAlpha,
      scaleXMultiplier: podScale,
      scaleYMultiplier: podScale
    }),
    'brood-pod.right': freezeOverride({
      xOffset: broodDeploy * 5 + deathBreak * 7,
      yOffset: broodDeploy * 9 + deathBreak * 12,
      rotationOffset: broodDeploy * 0.18 + deathBreak * 0.24,
      alpha: structuralAlpha,
      scaleXMultiplier: podScale,
      scaleYMultiplier: podScale
    })
  } satisfies Record<PrismMothModularPartId, ModularBossPartPoseOverride>);

  return partOverrides;
};

/** Compile-time assertion and explicit artwork-registration export. */
export const samplePrismMothSandboxPose: PreviewBossModularPoseSampler = (
  input
) => samplePrismMothModularPose(input);
