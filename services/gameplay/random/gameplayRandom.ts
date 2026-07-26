export type GameplayRandomSeed = number | string;

export interface GameplayRandom {
  readonly seed: number;
  next(): number;
  range(min: number, max: number): number;
  integer(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
}

const UINT32_RANGE = 0x1_0000_0000;

const hashStringSeed = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const normalizeGameplayRandomSeed = (seed: GameplayRandomSeed): number => {
  if (typeof seed === 'string') return hashStringSeed(seed);
  if (!Number.isFinite(seed)) return 0;
  return Math.trunc(seed) >>> 0;
};

const createNonDeterministicSeed = () => {
  const cryptoObject = typeof globalThis.crypto === 'object' ? globalThis.crypto : undefined;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);
    return values[0] >>> 0;
  }

  return (
    Math.trunc(Date.now())
    ^ Math.trunc((typeof performance === 'object' ? performance.now() : 0) * 1000)
    ^ Math.trunc(Math.random() * UINT32_RANGE)
  ) >>> 0;
};

/**
 * Small deterministic PRNG for simulation choices. Presentation effects keep
 * their own randomness so changing particle density cannot change combat.
 */
export const createSeededGameplayRandom = (seed: GameplayRandomSeed): GameplayRandom => {
  const normalizedSeed = normalizeGameplayRandomSeed(seed);
  let state = normalizedSeed;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };

  return Object.freeze({
    seed: normalizedSeed,
    next,
    range: (min: number, max: number) => {
      const lower = Number.isFinite(min) ? min : 0;
      const upper = Number.isFinite(max) ? max : lower;
      return lower + next() * (upper - lower);
    },
    integer: (minInclusive: number, maxExclusive: number) => {
      const lower = Math.ceil(Number.isFinite(minInclusive) ? minInclusive : 0);
      const upper = Math.floor(Number.isFinite(maxExclusive) ? maxExclusive : lower);
      if (upper <= lower) return lower;
      return lower + Math.floor(next() * (upper - lower));
    },
    chance: (probability: number) => next() < Math.max(0, Math.min(1, probability))
  });
};

export const createGameplayRandom = (seed?: GameplayRandomSeed): GameplayRandom => (
  createSeededGameplayRandom(seed ?? createNonDeterministicSeed())
);
