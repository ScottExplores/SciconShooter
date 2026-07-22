import type { AssetKey } from '../game-config/types';

export const GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY = Object.freeze({
  CAMPAIGN_BOSS_RAIL_SERPENT: 'rail-serpent',
  CAMPAIGN_BOSS_PRISM_MOTH: 'prism-moth',
  CAMPAIGN_BOSS_SINGULARITY_CRAB: 'singularity-crab',
  CAMPAIGN_BOSS_ORBIT_GYROSCOPE: 'orbit-gyroscope',
  CAMPAIGN_BOSS_HELIX_LEVIATHAN: 'helix-leviathan',
  CAMPAIGN_BOSS_HAMMERHEAD_SIEGE: 'hammerhead-siege',
  CAMPAIGN_BOSS_ECLIPSE_ENGINE: 'eclipse-engine',
  CAMPAIGN_BOSS_TRIBUNAL_DREADNOUGHT: 'tribunal-dreadnought'
} as const satisfies Partial<Record<AssetKey, string>>);

export type GeneratedBossArchetype = (
  typeof GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY
)[keyof typeof GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY];

export type GeneratedBossTechnique =
  | 'rail-telegraph'
  | 'rail-fire'
  | 'prism-gap-ring'
  | 'singularity-collapse'
  | 'orbit-cross'
  | 'helix-left'
  | 'helix-right'
  | 'hammerhead-port'
  | 'hammerhead-starboard'
  | 'eclipse-dark-pulse';

export interface GeneratedBossTechniqueCue {
  readonly technique: GeneratedBossTechnique;
  readonly sequence: number;
  readonly cycleFrame: number;
  readonly cycleLength: number;
}

export const MAX_GENERATED_BOSS_PROJECTILES_PER_CUE = 24;

export const resolveGeneratedBossArchetype = (
  spriteKey?: AssetKey
): GeneratedBossArchetype | null => {
  if (!spriteKey) return null;
  return (GENERATED_BOSS_ARCHETYPE_BY_ASSET_KEY as Partial<Record<AssetKey, GeneratedBossArchetype>>)[spriteKey]
    ?? null;
};

const positiveModulo = (value: number, divisor: number) => (
  ((value % divisor) + divisor) % divisor
);

const buildCue = (
  technique: GeneratedBossTechnique,
  sequence: number,
  cycleFrame: number,
  cycleLength: number
): GeneratedBossTechniqueCue => ({ technique, sequence, cycleFrame, cycleLength });

/**
 * Returns the single authored attack cue for this simulation frame. All timing
 * is derived from the boss timer and phase, so replays and tests never depend
 * on random rolls. `null` means movement/telegraph state only for that frame.
 */
export const getGeneratedBossTechniqueCue = (
  archetype: GeneratedBossArchetype,
  attackTimer: number,
  phase: number
): GeneratedBossTechniqueCue | null => {
  const safeTimer = Math.max(0, Math.floor(Number(attackTimer) || 0));
  const safePhase = Math.max(1, Math.min(3, Math.floor(Number(phase) || 1)));

  if (archetype === 'rail-serpent') {
    const cycleLength = 204 - (safePhase - 1) * 16;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    if (cycleFrame === 86) return buildCue('rail-telegraph', sequence, cycleFrame, cycleLength);
    if (cycleFrame === 118) return buildCue('rail-fire', sequence, cycleFrame, cycleLength);
    return null;
  }

  if (archetype === 'prism-moth') {
    const cycleLength = 150 - (safePhase - 1) * 10;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return cycleFrame === 72
      ? buildCue('prism-gap-ring', sequence, cycleFrame, cycleLength)
      : null;
  }

  if (archetype === 'singularity-crab') {
    const cycleLength = 176 - (safePhase - 1) * 12;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return cycleFrame === 82
      ? buildCue('singularity-collapse', sequence, cycleFrame, cycleLength)
      : null;
  }

  if (archetype === 'orbit-gyroscope') {
    const cycleLength = 116 - (safePhase - 1) * 8;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return cycleFrame === 48
      ? buildCue('orbit-cross', sequence, cycleFrame, cycleLength)
      : null;
  }

  if (archetype === 'helix-leviathan') {
    const cycleLength = 94 - (safePhase - 1) * 8;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    if (cycleFrame !== 44) return null;
    return buildCue(sequence % 2 === 0 ? 'helix-left' : 'helix-right', sequence, cycleFrame, cycleLength);
  }

  if (archetype === 'hammerhead-siege') {
    const cycleLength = 128 - (safePhase - 1) * 8;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    if (cycleFrame !== 52) return null;
    return buildCue(
      sequence % 2 === 0 ? 'hammerhead-port' : 'hammerhead-starboard',
      sequence,
      cycleFrame,
      cycleLength
    );
  }

  if (archetype === 'eclipse-engine') {
    const cycleLength = 164 - (safePhase - 1) * 12;
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return cycleFrame === 76
      ? buildCue('eclipse-dark-pulse', sequence, cycleFrame, cycleLength)
      : null;
  }

  // The Tribunal deliberately changes vocabulary by health phase. Its final
  // phase deterministically rotates through four techniques instead of stacking
  // them in the same frame, keeping the final encounter readable on phones.
  const cycleLength = safePhase === 1 ? 196 : safePhase === 2 ? 140 : 112;
  const cycleFrame = positiveModulo(safeTimer, cycleLength);
  const sequence = Math.floor(safeTimer / cycleLength);
  if (safePhase === 1) {
    if (cycleFrame === 78) return buildCue('rail-telegraph', sequence, cycleFrame, cycleLength);
    if (cycleFrame === 110) return buildCue('rail-fire', sequence, cycleFrame, cycleLength);
    return null;
  }
  if (safePhase === 2) {
    if (cycleFrame !== 66) return null;
    return buildCue(
      sequence % 2 === 0 ? 'prism-gap-ring' : 'orbit-cross',
      sequence,
      cycleFrame,
      cycleLength
    );
  }
  if (cycleFrame !== 54) return null;
  const finalTechniques: readonly GeneratedBossTechnique[] = [
    'helix-left',
    'hammerhead-port',
    'eclipse-dark-pulse',
    'singularity-collapse',
    'helix-right',
    'hammerhead-starboard'
  ];
  return buildCue(
    finalTechniques[positiveModulo(sequence, finalTechniques.length)],
    sequence,
    cycleFrame,
    cycleLength
  );
};
