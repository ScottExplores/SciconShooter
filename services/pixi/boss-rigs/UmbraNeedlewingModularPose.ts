import type {
  ModularBossPartPoseOverride,
  ModularBossRigPoseOverrides,
  ModularBossRigRegistration
} from './ModularHierarchyRig';
import type { PreviewBossModularPoseInput } from './PreviewBossRigContracts';

export const UMBRA_NEEDLEWING_PART_IDS = Object.freeze([
  'root',
  'wing.port.0.mount',
  'wing.port.0',
  'wing.starboard.0.mount',
  'wing.starboard.0',
  'wing.port.1.mount',
  'wing.port.1',
  'wing.starboard.1.mount',
  'wing.starboard.1',
  'wing.port.2.mount',
  'wing.port.2',
  'wing.starboard.2.mount',
  'wing.starboard.2',
  'wing.port.3.mount',
  'wing.port.3',
  'wing.starboard.3.mount',
  'wing.starboard.3',
  'body',
  'eye.port',
  'eye.starboard',
  'core',
  'needle.mount.port',
  'needle.mount.starboard',
  'needle.launcher',
  'escape.module',
  'projectile.needle',
  'projectile.shard',
  'vfx.reentry',
  'vfx.reticle',
  'vfx.dash-trail',
  'vfx.damage-spark',
  'vfx.escape-flame'
] as const);

export type UmbraNeedlewingPartId = (typeof UMBRA_NEEDLEWING_PART_IDS)[number];

export const UMBRA_NEEDLEWING_SOCKET_IDS = Object.freeze([
  'wing.port.0.joint',
  'wing.port.1.joint',
  'wing.port.2.joint',
  'wing.port.3.joint',
  'wing.starboard.0.joint',
  'wing.starboard.1.joint',
  'wing.starboard.2.joint',
  'wing.starboard.3.joint',
  'wing.port.0.tip',
  'wing.port.1.tip',
  'wing.port.2.tip',
  'wing.port.3.tip',
  'wing.starboard.0.tip',
  'wing.starboard.1.tip',
  'wing.starboard.2.tip',
  'wing.starboard.3.tip',
  'needle.port.muzzle',
  'needle.starboard.muzzle',
  'needle.launcher.muzzle',
  'core.emitter',
  'escape.thrust.port',
  'escape.thrust.starboard'
] as const);

export type UmbraNeedlewingSocketId = (typeof UMBRA_NEEDLEWING_SOCKET_IDS)[number];

export interface UmbraNeedlewingRigCompatibilityIssue {
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
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const freezeOverride = (
  override: ModularBossPartPoseOverride
): ModularBossPartPoseOverride => Object.freeze(override);

const sampleActionEnergy = (stage: string, progress: number) => {
  if (stage === 'preparation' || stage === 'transition') return smoothstep(progress) * 0.58;
  if (stage === 'telegraph' || stage === 'warning') return 0.58 + smoothstep(progress) * 0.42;
  if (stage === 'fire') return 1;
  if (stage === 'recovery' || stage === 'cooldown') return 1 - smoothstep(progress);
  return 0;
};

const selectedSides = (side: string | null | undefined) => {
  if (side === 'port' || side === 'left') {
    return Object.freeze({ port: true, starboard: false });
  }
  if (side === 'starboard' || side === 'right') {
    return Object.freeze({ port: false, starboard: true });
  }
  return Object.freeze({ port: true, starboard: true });
};

const REENTRY_FRAME_IDS = Object.freeze([
  'reentry.0',
  'reentry.1',
  'reentry.2',
  'reentry.3'
] as const);

/**
 * Verifies the complete eight-wing silhouette, attack-owned emitters, and the
 * two lifecycle effect chains used by Umbra's encounter runtime.
 */
export const validateUmbraNeedlewingRigCompatibility = (
  registration: ModularBossRigRegistration
): readonly UmbraNeedlewingRigCompatibilityIssue[] => {
  const issues: UmbraNeedlewingRigCompatibilityIssue[] = [];
  UMBRA_NEEDLEWING_PART_IDS.forEach((partId) => {
    if (!registration.partById[partId]) {
      issues.push(Object.freeze({
        path: `/parts/${partId}`,
        message: `Missing Umbra Needlewing part ${partId}.`
      }));
    }
  });

  const expectedParents = Object.freeze({
    'wing.port.0': 'wing.port.0.mount',
    'wing.port.1': 'wing.port.1.mount',
    'wing.port.2': 'wing.port.2.mount',
    'wing.port.3': 'wing.port.3.mount',
    'wing.starboard.0': 'wing.starboard.0.mount',
    'wing.starboard.1': 'wing.starboard.1.mount',
    'wing.starboard.2': 'wing.starboard.2.mount',
    'wing.starboard.3': 'wing.starboard.3.mount',
    body: 'root',
    core: 'body',
    'needle.mount.port': 'body',
    'needle.mount.starboard': 'body',
    'needle.launcher': 'core',
    'escape.module': 'body',
    'vfx.reentry': 'root',
    'vfx.escape-flame': 'escape.module'
  } as const);
  Object.entries(expectedParents).forEach(([partId, parentId]) => {
    const part = registration.partById[partId];
    if (part && part.parentId !== parentId) {
      issues.push(Object.freeze({
        path: `/parts/${partId}/parentId`,
        message: `${partId} must remain parented to ${parentId}.`
      }));
    }
  });

  UMBRA_NEEDLEWING_SOCKET_IDS.forEach((socketId) => {
    if (!registration.socketById[socketId]) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `Missing Umbra Needlewing socket ${socketId}.`
      }));
    }
  });
  const expectedSocketOwners = Object.freeze({
    'needle.port.muzzle': Object.freeze({
      partId: 'needle.mount.port',
      role: 'projectile-muzzle'
    }),
    'needle.starboard.muzzle': Object.freeze({
      partId: 'needle.mount.starboard',
      role: 'projectile-muzzle'
    }),
    'needle.launcher.muzzle': Object.freeze({
      partId: 'needle.launcher',
      role: 'beam-origin'
    }),
    'core.emitter': Object.freeze({ partId: 'core', role: 'core-origin' }),
    'escape.thrust.port': Object.freeze({
      partId: 'escape.module',
      role: 'effect-origin'
    }),
    'escape.thrust.starboard': Object.freeze({
      partId: 'escape.module',
      role: 'effect-origin'
    })
  } as const);
  Object.entries(expectedSocketOwners).forEach(([socketId, expected]) => {
    const socket = registration.socketById[socketId];
    if (
      socket
      && (socket.partId !== expected.partId || socket.role !== expected.role)
    ) {
      issues.push(Object.freeze({
        path: `/sockets/${socketId}`,
        message: `${socketId} must follow ${expected.partId} as ${expected.role}.`
      }));
    }
  });
  return Object.freeze(issues);
};

/**
 * Deterministic Umbra pose sampling. The generic lifecycle runtime owns
 * gameplay state and root travel; this sampler turns those snapshots into
 * anatomy changes and atlas-frame choices without changing collision.
 */
export const sampleUmbraNeedlewingModularPose = (
  input: PreviewBossModularPoseInput
): ModularBossRigPoseOverrides => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const phaseIndex = clamp(Math.floor(finiteOr(input.phaseIndex, 1)), 1, 3);
  const damageStage = clamp(Math.floor(finiteOr(input.damageStage, 0)), 0, 5);
  const entrance = smoothstep(finiteOr(input.entranceProgress, 1));
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '').toLowerCase();
  const motionCue = String(action?.motionCue ?? '').toLowerCase();
  const stage = String(action?.stage ?? '').toLowerCase();
  const progress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const actionEnergy = sampleActionEnergy(stage, progress);
  const sides = selectedSides(action?.side);
  const reducedScale = input.reducedMotion ? 0.26 : 1;
  const reactionProgress = clamp(finiteOr(input.reaction?.progress, 1), 0, 1);
  const reactionEnergy = input.reaction
    ? Math.sin(reactionProgress * Math.PI)
      * clamp(finiteOr(input.reaction.strength, 0), 0, 2)
      * (input.reaction.kind === 'stagger' ? 1 : 0.48)
    : 0;
  const reactionDirection = input.reaction?.direction ?? 1;
  const isWingShear = primitiveId === 'side-barrage'
    || motionCue === 'umbra-needle-lattice';
  const isOrbitGap = primitiveId === 'gap-ring'
    || motionCue === 'umbra-wing-shard-gate';
  const isCornerNeedle = primitiveId === 'corner-ambush-beam'
    || motionCue === 'umbra-predator-lock';
  const isBlackout = motionCue === 'umbra-blackout-ambush';
  const isRam = primitiveId === 'corner-ambush-ram';
  const warningStage = stage === 'preparation'
    || stage === 'transition'
    || stage === 'telegraph'
    || stage === 'warning';

  const vanish = input.vanishReentry;
  const vanishProgress = clamp(finiteOr(vanish?.progress, 0), 0, 1);
  const escape = input.escape;
  const escapeProgress = clamp(finiteOr(escape?.progress, 0), 0, 1);
  const phaseTransitionActive = input.phaseProgress !== null
    && input.phaseProgress !== undefined;
  const phaseTransitionProgress = clamp(finiteOr(input.phaseProgress, 0), 0, 1);
  const phaseTransitionPulse = phaseTransitionActive
    ? Math.sin(phaseTransitionProgress * Math.PI)
    : 0;
  const authoredOpacity = clamp(
    finiteOr(escape?.opacity, finiteOr(vanish?.opacity, 1)),
    0,
    1
  );
  // The corner charge keeps Scott's sprite readable on the black field.
  // Only the short hidden beat stays fully invisible.
  const cornerChargeVisible = isRam && vanish?.stage !== 'hidden';
  const structuralOpacity = cornerChargeVisible
    ? Math.max(authoredOpacity, vanish?.stage === 'fade-out' ? authoredOpacity : 0.92)
    : authoredOpacity;
  const bodyVisible = structuralOpacity > 0.001 && escape?.stage !== 'complete';
  const vanishFold = !vanish
    ? 0
    : vanish.stage === 'fade-out'
      ? smoothstep(vanishProgress)
    : vanish.stage === 'hidden'
      ? 1
      : vanish.stage === 'reentry-warning'
        ? (cornerChargeVisible ? 0.16 : 1)
        : vanish.stage === 'reappear'
          ? 1 - smoothstep(vanishProgress)
          : (1 - smoothstep(vanishProgress)) * 0.22;
  const escapeFold = !escape
    ? 0
    : escape.stage === 'damaged-stagger'
      ? 0.18 * smoothstep(escapeProgress)
      : escape.stage === 'false-finish'
        ? 0.22 + 0.28 * smoothstep(escapeProgress)
        : escape.stage === 'escape-charge' || escape.stage === 'escaping'
          ? 0.5 + 0.5 * smoothstep(escapeProgress)
          : 1;
  const attackFold = isRam ? actionEnergy * 0.22 : isBlackout ? actionEnergy * 0.24 : 0;
  const fold = clamp(
    Math.max(
      1 - entrance,
      vanishFold,
      escapeFold,
      attackFold,
      phaseTransitionPulse * 0.18
    ),
    0,
    1
  );
  const phaseSpread = (phaseIndex - 1) * 0.045 + phaseTransitionPulse * 0.12;
  const orbitSpread = isOrbitGap ? actionEnergy * 0.13 : 0;
  const hover = Math.sin(frame * 0.043) * 2.8 * reducedScale;
  const drift = Math.sin(frame * 0.019 + 0.8) * 2.1 * reducedScale;
  const breathing = Math.sin(frame * 0.052 + 0.35) * 0.025 * reducedScale;
  const criticalJitter = healthRatio <= 0.3
    ? Math.sin(frame * 0.21) * 1.2 * reducedScale
    : 0;
  const actionSequence = Math.floor(finiteOr(action?.sequence, 0));
  const firingPulse = stage === 'fire'
    ? Math.max(0, Math.sin((frame + actionSequence * 7) * 0.82))
    : 0;
  const portRecoil = isWingShear && sides.port ? firingPulse : 0;
  const starboardRecoil = isWingShear && sides.starboard ? firingPulse : 0;

  const overrides: Record<string, ModularBossPartPoseOverride> = {
    root: freezeOverride({
      xOffset: drift + criticalJitter + reactionDirection * reactionEnergy * 4.5,
      yOffset: hover - (1 - entrance) * 18 + reactionEnergy * 1.6,
      rotationOffset: drift * 0.004 + criticalJitter * 0.007
        + reactionDirection * reactionEnergy * 0.038
    }),
    body: freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible,
      rotationOffset: breathing * 0.16 + reactionDirection * reactionEnergy * 0.012,
      scaleXMultiplier: 1 + breathing * 0.12,
      scaleYMultiplier: 1 + breathing * 0.12
    }),
    'eye.port': freezeOverride({
      alpha: cornerChargeVisible
        ? 1
        : structuralOpacity * (0.6 + Math.max(actionEnergy, phaseTransitionPulse) * 0.4),
      visible: bodyVisible && (
        (
          (warningStage || isWingShear || isCornerNeedle || isBlackout)
          && (sides.port || !isWingShear)
        )
        || phaseTransitionPulse > 0.05
      )
    }),
    'eye.starboard': freezeOverride({
      alpha: cornerChargeVisible
        ? 1
        : structuralOpacity * (0.6 + Math.max(actionEnergy, phaseTransitionPulse) * 0.4),
      visible: bodyVisible && (
        (
          (warningStage || isWingShear || isCornerNeedle || isBlackout)
          && (sides.starboard || !isWingShear)
        )
        || phaseTransitionPulse > 0.05
      )
    }),
    core: freezeOverride({
      frameId: isOrbitGap && actionEnergy > 0.08
        || escape?.stage === 'escape-charge'
        || phaseTransitionPulse > 0.08
        ? 'core.open'
        : 'core.closed',
      alpha: structuralOpacity,
      visible: bodyVisible,
      rotationOffset: isOrbitGap
        ? (actionSequence % 2 === 0 ? 1 : -1) * actionEnergy * 0.16
        : breathing * 0.2,
      scaleXMultiplier: 1
        + actionEnergy * (isOrbitGap ? 0.12 : 0.035)
        + phaseTransitionPulse * 0.12,
      scaleYMultiplier: 1
        + actionEnergy * (isOrbitGap ? 0.12 : 0.035)
        + phaseTransitionPulse * 0.12
    }),
    'needle.mount.port': freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible && isWingShear && sides.port && actionEnergy > 0.05,
      xOffset: -portRecoil * 5,
      yOffset: portRecoil * 7,
      rotationOffset: -actionEnergy * 0.08 + portRecoil * 0.11
    }),
    'needle.mount.starboard': freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible && isWingShear && sides.starboard && actionEnergy > 0.05,
      xOffset: starboardRecoil * 5,
      yOffset: starboardRecoil * 7,
      rotationOffset: actionEnergy * 0.08 - starboardRecoil * 0.11
    }),
    'needle.launcher': freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible && isCornerNeedle && actionEnergy > 0.05,
      yOffset: -actionEnergy * 8 + firingPulse * 5,
      scaleXMultiplier: 0.9 + actionEnergy * 0.1,
      scaleYMultiplier: 0.9 + actionEnergy * 0.1
    }),
    'escape.module': freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible && Boolean(escape),
      yOffset: escape?.stage === 'escape-charge' ? smoothstep(escapeProgress) * 8 : 0,
      scaleXMultiplier: 0.92 + clamp(finiteOr(escape?.trailIntensity, 0), 0, 1) * 0.08,
      scaleYMultiplier: 0.92 + clamp(finiteOr(escape?.trailIntensity, 0), 0, 1) * 0.08
    }),
    'projectile.needle': freezeOverride({ visible: false }),
    'projectile.shard': freezeOverride({ visible: false })
  };

  for (let index = 0; index < 4; index += 1) {
    const wingWave = Math.sin(frame * 0.037 + index * 0.72) * (0.018 + index * 0.003)
      * reducedScale;
    const portId = `wing.port.${index}`;
    const starboardId = `wing.starboard.${index}`;
    const portMountId = `${portId}.mount`;
    const starboardMountId = `${starboardId}.mount`;
    const layerFactor = 1 - index * 0.08;
    overrides[portMountId] = freezeOverride({
      xOffset: -phaseSpread * 54 + fold * 12,
      yOffset: fold * (index * 3.5 + 2) + portRecoil * 3,
      rotationOffset: -phaseSpread - orbitSpread - breathing - wingWave
        + fold * 0.46 * layerFactor + portRecoil * 0.08
    });
    overrides[starboardMountId] = freezeOverride({
      xOffset: phaseSpread * 54 - fold * 12,
      yOffset: fold * (index * 3.5 + 2) + starboardRecoil * 3,
      rotationOffset: phaseSpread + orbitSpread + breathing + wingWave
        - fold * 0.46 * layerFactor - starboardRecoil * 0.08
    });
    overrides[portId] = freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible
    });
    overrides[starboardId] = freezeOverride({
      alpha: structuralOpacity,
      visible: bodyVisible
    });
  }

  const showReentry = vanish?.stage === 'reentry-warning'
    || vanish?.stage === 'reappear'
    || phaseTransitionPulse > 0.01;
  const reentryProgress = vanish ? vanishProgress : phaseTransitionProgress;
  const reentryIndex = Math.min(3, Math.floor(reentryProgress * 4));
  const reentryAlpha = vanish?.stage === 'reentry-warning'
    ? 0.32 + Math.sin(vanishProgress * Math.PI) * 0.68
    : vanish?.stage === 'reappear'
      ? 1 - smoothstep(vanishProgress)
      : phaseTransitionPulse * 0.72;
  overrides['vfx.reentry'] = freezeOverride({
    frameId: REENTRY_FRAME_IDS[reentryIndex],
    visible: showReentry,
    alpha: showReentry ? clamp(reentryAlpha, 0, 1) : 0,
    rotationOffset: Math.sin(frame * 0.08) * 0.07 * reducedScale,
    scaleXMultiplier: 0.84 + reentryProgress * 0.24,
    scaleYMultiplier: 0.84 + reentryProgress * 0.24
  });

  const showReticle = warningStage && (isCornerNeedle || isRam || isBlackout);
  overrides['vfx.reticle'] = freezeOverride({
    visible: showReticle,
    alpha: showReticle ? 0.45 + actionEnergy * 0.5 : 0,
    rotationOffset: frame * 0.012 * reducedScale,
    scaleXMultiplier: 0.82 + actionEnergy * 0.18,
    scaleYMultiplier: 0.82 + actionEnergy * 0.18
  });

  const ramTrail = isRam && stage === 'fire' ? 1 - smoothstep(progress) * 0.35 : 0;
  const escapeTrail = clamp(finiteOr(escape?.trailIntensity, 0), 0, 1);
  const trailIntensity = Math.max(ramTrail, escapeTrail);
  overrides['vfx.dash-trail'] = freezeOverride({
    visible: trailIntensity > 0.03,
    alpha: clamp(trailIntensity * structuralOpacity, 0, 1),
    yOffset: 22 + trailIntensity * 18,
    scaleXMultiplier: 0.82 + trailIntensity * 0.3,
    scaleYMultiplier: 0.82 + trailIntensity * 0.3
  });

  const escapeDamage = escape?.stage === 'damaged-stagger'
    || escape?.stage === 'false-finish';
  const showDamageSpark = damageStage >= 3 || reactionEnergy > 0.12 || escapeDamage;
  overrides['vfx.damage-spark'] = freezeOverride({
    visible: showDamageSpark && bodyVisible,
    alpha: showDamageSpark
      ? structuralOpacity * (0.52 + Math.abs(Math.sin(frame * 0.31)) * 0.48)
      : 0,
    rotationOffset: Math.sin(frame * 0.17) * 0.12 * reducedScale
  });

  const flameIntensity = escape?.stage === 'escape-charge'
    ? smoothstep(escapeProgress)
    : escape?.stage === 'escaping'
      ? Math.max(escapeTrail, 0.24)
      : 0;
  overrides['vfx.escape-flame'] = freezeOverride({
    visible: bodyVisible && flameIntensity > 0.03,
    alpha: clamp(structuralOpacity * flameIntensity, 0, 1),
    scaleXMultiplier: 0.8 + flameIntensity * 0.38,
    scaleYMultiplier: 0.8 + flameIntensity * 0.38
  });

  return Object.freeze(overrides);
};

export const sampleUmbraNeedlewingSandboxPose = sampleUmbraNeedlewingModularPose;
