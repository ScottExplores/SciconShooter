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
