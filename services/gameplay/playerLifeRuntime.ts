export interface PlayerLifeDamageTransition {
  readonly previousLives: number;
  readonly lives: number;
  readonly damageApplied: number;
  readonly defeated: boolean;
}

const toWholeNumber = (value: number, fallback: number = 0) => (
  Number.isFinite(value) ? Math.trunc(value) : fallback
);

/** Keeps every runtime/published life count inside the legal non-negative range. */
export const clampPlayerLives = (lives: number, maxLives: number): number => {
  const upperBound = Math.max(0, toWholeNumber(maxLives));
  return Math.min(upperBound, Math.max(0, toWholeNumber(lives)));
};

/** Resolves one damage event without allowing overkill damage to underflow lives. */
export const resolvePlayerLifeDamage = (
  currentLives: number,
  incomingDamage: number,
  maxLives: number
): PlayerLifeDamageTransition => {
  const previousLives = clampPlayerLives(currentLives, maxLives);
  const requestedDamage = Math.max(0, toWholeNumber(incomingDamage));
  const lives = Math.max(0, previousLives - requestedDamage);
  return {
    previousLives,
    lives,
    damageApplied: previousLives - lives,
    defeated: lives === 0
  };
};

/** A Continue/revival always restores a playable, bounded life count. */
export const resolvePlayerRevivalLives = (
  requestedLives: number,
  maxLives: number
): number => {
  const upperBound = Math.max(1, toWholeNumber(maxLives, 1));
  const restoredLives = Math.max(1, toWholeNumber(requestedLives, 1));
  return Math.min(upperBound, restoredLives);
};
