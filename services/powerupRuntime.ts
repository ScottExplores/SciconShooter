/**
 * Timed power-up state belongs to the fixed-step simulation. Keeping the
 * countdown helpers pure makes pickup duration, immunity, and expiry share
 * one authoritative definition instead of relying on renderer visibility.
 */
export const getTimedPowerupRemainingFrames = (remainingFrames: number | undefined) => {
  const numeric = Number(remainingFrames);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
};

export const isTimedPowerupActive = <T>(
  timers: ReadonlyMap<T, number>,
  type: T
) => getTimedPowerupRemainingFrames(timers.get(type)) > 0;

export const isMaxShotShieldActive = <T>(
  timers: ReadonlyMap<T, number>,
  maxShotType: T
) => isTimedPowerupActive(timers, maxShotType);

/** Advances every active timer by exactly one fixed simulation frame. */
export const tickTimedPowerups = <T>(timers: Map<T, number>) => {
  for (const [type, remainingFrames] of timers) {
    const nextFrames = getTimedPowerupRemainingFrames(remainingFrames) - 1;
    if (nextFrames > 0) timers.set(type, nextFrames);
    else timers.delete(type);
  }
};
