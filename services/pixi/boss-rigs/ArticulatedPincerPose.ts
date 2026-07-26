export interface ArticulatedPincerActionPresentation {
  readonly primitiveId?: string | null;
  readonly stage?: string | null;
  readonly progress?: number | null;
  readonly side?: 'port' | 'starboard' | 'left' | 'right' | null;
  readonly sequence?: number | null;
  readonly motionCue?: string | null;
}

export interface ArticulatedPincerPoseInput {
  readonly frameCount: number;
  readonly reducedMotion: boolean;
  readonly healthRatio: number;
  readonly bankRadians: number;
  readonly charging: boolean;
  readonly coreExposed: boolean;
  readonly finalPhase: boolean;
  readonly shieldActive?: boolean;
  readonly action?: ArticulatedPincerActionPresentation | null;
}

export interface ArticulatedPincerPose {
  readonly bodyBob: number;
  readonly scuttleX: number;
  readonly bodyRoll: number;
  readonly bodyOpenAmount: number;
  readonly coreHeartbeatScale: number;
  readonly leftClawOpen: number;
  readonly rightClawOpen: number;
  readonly leftClawRaise: number;
  readonly rightClawRaise: number;
  readonly leftWeaponRecoil: number;
  readonly rightWeaponRecoil: number;
  readonly legOuterLeftRotation: number;
  readonly legInnerLeftRotation: number;
  readonly legInnerRightRotation: number;
  readonly legOuterRightRotation: number;
  readonly leftMineDetach: number;
  readonly rightMineDetach: number;
  readonly shieldDeploy: number;
  readonly shockBladeAlpha: number;
  readonly shockBladeRotation: number;
  readonly shockBladeScale: number;
  readonly flameFrame: 0 | 1 | 2;
  readonly flameScale: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

const finiteOr = (value: number | null | undefined, fallback: number) => (
  Number.isFinite(value) ? Number(value) : fallback
);

const sampleActionEnvelope = (
  action: ArticulatedPincerActionPresentation | null | undefined
) => {
  if (!action) return 0;
  const progress = clamp(finiteOr(action.progress, 0.5), 0, 1);
  const stage = String(action.stage ?? '').toLowerCase();
  if (stage === 'warning') return Math.sin(progress * Math.PI * 0.5);
  if (stage === 'fire') return 1 - progress * 0.45;
  if (stage === 'death') return 1 - progress;
  return Math.sin(progress * Math.PI);
};

/**
 * Presentation-only pose sampling. All output is derived from simulation
 * frames and authored action state, never wall time or gameplay mutation.
 */
export const sampleArticulatedPincerPose = (
  input: ArticulatedPincerPoseInput
): ArticulatedPincerPose => {
  const frame = Math.max(0, Math.floor(finiteOr(input.frameCount, 0)));
  const healthRatio = clamp(finiteOr(input.healthRatio, 1), 0, 1);
  const pressure = 1 - healthRatio;
  const idleScale = input.reducedMotion ? 0.24 : 1;
  const action = input.action;
  const primitiveId = String(action?.primitiveId ?? '');
  const actionEnvelope = sampleActionEnvelope(action);
  const actionProgress = clamp(finiteOr(action?.progress, 0), 0, 1);
  const side = action?.side;
  const gatlingBarrage = action?.motionCue === 'gatling-barrage';
  const heavyCannon = action?.motionCue === 'heavy-cannon';
  const leftSelected = side === 'left' || side === 'port';
  const rightSelected = side === 'right' || side === 'starboard';
  const bothSelected = gatlingBarrage || (!leftSelected && !rightSelected);
  const warningOrFire = action?.stage === 'warning' || action?.stage === 'fire';
  const podVolley = primitiveId === 'pod-volley';
  const weaveBrace = primitiveId === 'weave-wall' ? actionEnvelope : 0;
  const gapPulse = primitiveId === 'gap-ring' ? actionEnvelope : 0;
  const isWeaponAction = primitiveId === 'aimed-burst'
    || primitiveId === 'side-barrage'
    || primitiveId === 'pod-volley'
    || primitiveId === 'weave-wall'
    || primitiveId === 'cross-beam'
    || primitiveId === 'rail-sweep'
    || primitiveId === 'tail-fan';
  const gatlingPulse = gatlingBarrage && action?.stage === 'fire'
    ? 0.46 + Math.abs(Math.sin(frame * 0.72)) * 0.54
    : 1;
  const weaponEnergy = warningOrFire && isWeaponAction
    ? actionEnvelope * gatlingPulse * (heavyCannon ? 1.12 : 1)
    : 0;
  const sequence = Math.max(0, Math.floor(finiteOr(action?.sequence, 0)));
  const sequenceLeadsLeft = sequence % 2 === 0;
  const leftWeaponRecoil = podVolley && bothSelected
    ? weaponEnergy * (sequenceLeadsLeft ? 1 : 0.48)
    : (leftSelected || bothSelected) ? weaponEnergy : 0;
  const rightWeaponRecoil = podVolley && bothSelected
    ? weaponEnergy * (sequenceLeadsLeft ? 0.48 : 1)
    : (rightSelected || bothSelected) ? weaponEnergy : 0;
  const clawIdle = Math.sin(frame * 0.048) * 0.08 * idleScale;
  const alternateClawIdle = Math.sin(frame * 0.048 + Math.PI * 0.72) * 0.08 * idleScale;
  const gait = frame * (0.054 + pressure * 0.008);
  const gaitAmplitude = 0.09 * idleScale;
  const mineAttack = podVolley ? actionEnvelope : 0;
  const bladeAttack = primitiveId === 'rail-sweep'
    || primitiveId === 'cross-beam'
    || primitiveId === 'tail-fan';
  const bladeEnergy = bladeAttack ? actionEnvelope : 0;
  const openTarget = input.coreExposed || input.finalPhase ? 1 : 0;
  const coreHeartbeat = input.finalPhase
    ? (Math.sin(frame * 0.145) + 1) * 0.5 * idleScale
    : 0;
  const charging = input.charging ? 0.18 : 0;
  const bank = clamp(finiteOr(input.bankRadians, 0) / 0.4, -1, 1);
  const brace = Math.max(weaveBrace, gapPulse * 0.72);
  const selectedClawEnergy = primitiveId === 'side-barrage' && !gatlingBarrage
    ? actionEnvelope
    : 0;
  const leftClawRaise = (
    (leftSelected || bothSelected ? selectedClawEnergy : 0)
    + weaveBrace * 0.28
    + gapPulse * 0.42
  );
  const rightClawRaise = (
    (rightSelected || bothSelected ? selectedClawEnergy : 0)
    + weaveBrace * 0.28
    + gapPulse * 0.42
  );
  const shieldDeploy = input.shieldActive
    ? clamp(0.7 + brace * 0.3 + (Math.sin(frame * 0.08) + 1) * 0.04 * idleScale, 0, 1)
    : 0;
  const bladeRotation = primitiveId === 'rail-sweep'
    ? -0.52 + actionProgress * 1.04
    : primitiveId === 'tail-fan'
      ? 0.14 + Math.sin(actionProgress * Math.PI) * 0.22
      : 0;

  return {
    bodyBob: Math.sin(frame * 0.041) * (3.2 + pressure) * idleScale
      - brace * 4
      + Math.sin(frame * 0.12) * coreHeartbeat * 1.5,
    scuttleX: Math.sin(frame * 0.021) * (8 + pressure * 3) * idleScale,
    bodyRoll: Math.sin(frame * 0.021 + Math.PI * 0.5) * 0.025 * idleScale
      + bank * 0.035
      + Math.sin(frame * 0.083) * coreHeartbeat * 0.018,
    bodyOpenAmount: openTarget,
    coreHeartbeatScale: 1 + coreHeartbeat * 0.075 + gapPulse * 0.045,
    leftClawOpen: clamp(
      0.18 + clawIdle + leftWeaponRecoil * 0.72 + gapPulse * 0.36 - weaveBrace * 0.12,
      0,
      1
    ),
    rightClawOpen: clamp(
      0.18 + alternateClawIdle + rightWeaponRecoil * 0.72 + gapPulse * 0.36 - weaveBrace * 0.12,
      0,
      1
    ),
    leftClawRaise,
    rightClawRaise,
    leftWeaponRecoil,
    rightWeaponRecoil,
    legOuterLeftRotation: Math.sin(gait) * gaitAmplitude - brace * 0.065,
    legInnerLeftRotation: Math.sin(gait + Math.PI) * gaitAmplitude * 0.8 + brace * 0.04,
    legInnerRightRotation: Math.sin(gait) * -gaitAmplitude * 0.8 - brace * 0.04,
    legOuterRightRotation: Math.sin(gait + Math.PI) * -gaitAmplitude + brace * 0.065,
    leftMineDetach: mineAttack * (
      leftSelected ? 1 : rightSelected ? 0 : sequenceLeadsLeft ? 1 : 0.62
    ),
    rightMineDetach: mineAttack * (
      rightSelected ? 1 : leftSelected ? 0 : sequenceLeadsLeft ? 0.62 : 1
    ),
    shieldDeploy,
    shockBladeAlpha: clamp(bladeEnergy, 0, 1),
    shockBladeRotation: bladeRotation + Math.sin(frame * 0.12) * 0.03 * bladeEnergy,
    shockBladeScale: primitiveId === 'tail-fan'
      ? 0.76 + bladeEnergy * 0.32
      : 0.82 + bladeEnergy * 0.22,
    flameFrame: (
      Math.floor(frame / (
        input.finalPhase
          ? input.reducedMotion ? 7 : 3
          : input.reducedMotion ? 10 : 5
      )) % 3
    ) as 0 | 1 | 2,
    flameScale: 0.86
      + (Math.sin(frame * 0.17) + 1) * 0.08 * idleScale
      + charging
      + coreHeartbeat * 0.22
  };
};
