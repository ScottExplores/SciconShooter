import type { BossTimelineRotationDirection } from '../../../game-config/types';
import { createSeededGameplayRandom } from '../random';

const normalizeSequence = (sequence: number) => (
  Math.max(0, Math.floor(Number.isFinite(sequence) ? sequence : 0))
);

const withDirectionParity = (
  sequence: number,
  direction: Exclude<BossTimelineRotationDirection, 'seeded-random'>
) => {
  const normalized = normalizeSequence(sequence);
  const wantsClockwise = direction === 'clockwise';
  const isClockwise = normalized % 2 === 1;
  return wantsClockwise === isClockwise ? normalized : normalized + 1;
};

/**
 * Resolves an authored rotor direction without advancing the simulation's
 * shared random stream. A stable seed key lets a telegraph, its damaging
 * action, replay, and deterministic seek all select the same direction.
 */
export const resolveBossRotationSequence = ({
  sequence,
  rotationDirection,
  seedKey
}: {
  sequence: number;
  rotationDirection?: BossTimelineRotationDirection;
  seedKey: string;
}) => {
  const normalized = normalizeSequence(sequence);
  if (!rotationDirection) return normalized;
  const resolvedDirection = rotationDirection === 'seeded-random'
    ? createSeededGameplayRandom(seedKey).chance(0.5)
      ? 'clockwise'
      : 'counterclockwise'
    : rotationDirection;
  return withDirectionParity(normalized, resolvedDirection);
};
