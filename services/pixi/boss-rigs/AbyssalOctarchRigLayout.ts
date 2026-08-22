/**
 * Canonical neutral attachment rows for the eight Octarch tentacles.
 *
 * `x` is the positive distance from the root; port mirrors it negative and
 * starboard keeps it positive. Keeping this table separate from pose sampling
 * prevents targeted attacks from calculating against stale mount locations.
 */
export const ABYSSAL_OCTARCH_NEUTRAL_TENTACLE_MOUNTS = Object.freeze([
  Object.freeze({ x: 79, y: -85, portRotation: 5, starboardRotation: -5 }),
  Object.freeze({ x: 96, y: -36, portRotation: -1, starboardRotation: 1 }),
  Object.freeze({ x: 94, y: 38, portRotation: -10, starboardRotation: 10 }),
  Object.freeze({ x: 72, y: 98, portRotation: -20, starboardRotation: 20 })
] as const);
