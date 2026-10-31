const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export const FORMATION_ENEMY_MAX_BANK_RADIANS = 0.58;
export const FORMATION_ATTACK_TELEGRAPH_WINDOW_FRAMES = 60;

export interface FormationEnemyPresentationInput {
  angle?: number;
  flightHeading?: number;
  formationState?: string;
  formationAttackSelected?: boolean;
  formationAttackActive?: boolean;
  formationDiveFrame?: number;
  currentFrame: number;
  formationIndex?: number;
  variant?: number;
}

export interface FormationEnemyPresentationSample {
  configured: boolean;
  bankRadians: number;
  telegraphVisible: boolean;
  telegraphReadiness: number;
  telegraphPulse: number;
}

/**
 * Samples presentation-only formation cues from simulation-owned state. The
 * returned bank and telegraph never move the entity or change its collision
 * geometry, targeting, firing, or attack timing.
 */
export const sampleFormationEnemyPresentation = (
  input: FormationEnemyPresentationInput
): FormationEnemyPresentationSample => {
  const configured = Boolean(input.formationState);
  const authoredAngle = Number(input.angle);
  const bankRadians = configured && Number.isFinite(input.flightHeading)
    ? input.flightHeading!
    : configured && Number.isFinite(authoredAngle)
    ? clamp(authoredAngle, -FORMATION_ENEMY_MAX_BANK_RADIANS, FORMATION_ENEMY_MAX_BANK_RADIANS)
    : 0;
  const telegraphVisible = configured
    && input.formationAttackSelected === true
    && input.formationAttackActive !== true;
  const diveFrame = Number(input.formationDiveFrame);
  const framesUntilAttack = Number.isFinite(diveFrame)
    ? Math.max(0, diveFrame - input.currentFrame)
    : FORMATION_ATTACK_TELEGRAPH_WINDOW_FRAMES;
  const telegraphReadiness = telegraphVisible
    ? clamp(
      1 - (framesUntilAttack / FORMATION_ATTACK_TELEGRAPH_WINDOW_FRAMES),
      0,
      1
    )
    : 0;
  const phaseOffset = Math.abs((input.variant ?? 0) * 13 + (input.formationIndex ?? 0) * 7);
  const telegraphPulse = telegraphVisible
    ? 0.5 + Math.sin((input.currentFrame + phaseOffset) * 0.18) * 0.5
    : 0;

  return {
    configured,
    bankRadians,
    telegraphVisible,
    telegraphReadiness,
    telegraphPulse
  };
};

/**
 * Presentation-only "alive" motion for formation fighters: a slow wing-flap
 * squash and a gentle sway that ripples across the formation by slot index.
 * Transform-only (no position offset), so the hull never leaves its collision
 * footprint. Period is ~1.05 s at 60 fps, so nothing reads as blinking.
 */
export const FORMATION_IDLE_LIFE_RADIANS_PER_FRAME = 0.1;

export interface FormationIdleLifeSample {
  scaleX: number;
  scaleY: number;
  swayRadians: number;
}

export const sampleFormationIdleLife = (input: {
  currentFrame: number;
  formationIndex?: number;
  variant?: number;
  formationState?: string | null;
  reducedMotion?: boolean;
}): FormationIdleLifeSample => {
  if (input.reducedMotion || !input.formationState) return { scaleX: 1, scaleY: 1, swayRadians: 0 };
  const strength = input.formationState === 'hold'
    ? 1
    : input.formationState === 'dive' ? 0.35 : 0.6;
  const phase = input.currentFrame * FORMATION_IDLE_LIFE_RADIANS_PER_FRAME
    + (input.formationIndex ?? 0) * 0.55
    + (input.variant ?? 0) * 0.31;
  const flap = Math.sin(phase);
  return {
    scaleX: 1 - (0.5 + flap * 0.5) * 0.07 * strength,
    scaleY: 1 + flap * 0.018 * strength,
    swayRadians: Math.sin(phase * 0.5) * 0.06 * strength
  };
};

/** Brief hit squash (impact pop) driven by the simulation's flashFrames. */
export const sampleHitSquash = (flashFrames: number, reducedMotion = false) => {
  if (reducedMotion || !(flashFrames > 0)) return { scaleX: 1, scaleY: 1 };
  const t = Math.min(1, flashFrames / 12);
  return { scaleX: 1 + 0.07 * t, scaleY: 1 - 0.09 * t };
};
