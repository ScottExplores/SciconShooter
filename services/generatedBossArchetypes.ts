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
  | 'rail-tail-telegraph'
  | 'rail-tail-volley'
  | 'prism-telegraph'
  | 'prism-gap-ring'
  | 'singularity-telegraph'
  | 'singularity-collapse'
  | 'orbit-telegraph'
  | 'orbit-cross'
  | 'helix-left-telegraph'
  | 'helix-right-telegraph'
  | 'helix-left'
  | 'helix-right'
  | 'hammerhead-port-telegraph'
  | 'hammerhead-starboard-telegraph'
  | 'hammerhead-port'
  | 'hammerhead-starboard'
  | 'eclipse-telegraph'
  | 'eclipse-dark-pulse';

export type GeneratedBossCueStage = 'warning' | 'fire';

export interface GeneratedBossTechniqueCue {
  readonly technique: GeneratedBossTechnique;
  readonly stage: GeneratedBossCueStage;
  readonly sequence: number;
  readonly cycleFrame: number;
  readonly cycleLength: number;
  /** Frames between this warning and its paired fire cue. */
  readonly warningFrames: number;
  /** Minimum quiet frames after firing before another warning may begin. */
  readonly recoveryFrames: number;
}

export const MAX_GENERATED_BOSS_PROJECTILES_PER_CUE = 24;
export const MIN_GENERATED_BOSS_WARNING_FRAMES = 24;
export const MIN_GENERATED_BOSS_RECOVERY_FRAMES = 32;

export const GENERATED_BOSS_FIRE_TELEGRAPH: Readonly<Partial<Record<
  GeneratedBossTechnique,
  GeneratedBossTechnique
>>> = Object.freeze({
  'rail-fire': 'rail-telegraph',
  'rail-tail-volley': 'rail-tail-telegraph',
  'prism-gap-ring': 'prism-telegraph',
  'singularity-collapse': 'singularity-telegraph',
  'orbit-cross': 'orbit-telegraph',
  'helix-left': 'helix-left-telegraph',
  'helix-right': 'helix-right-telegraph',
  'hammerhead-port': 'hammerhead-port-telegraph',
  'hammerhead-starboard': 'hammerhead-starboard-telegraph',
  'eclipse-dark-pulse': 'eclipse-telegraph'
});

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
  stage: GeneratedBossCueStage,
  sequence: number,
  cycleFrame: number,
  cycleLength: number,
  warningFrames: number,
  recoveryFrames: number
): GeneratedBossTechniqueCue => ({
  technique,
  stage,
  sequence,
  cycleFrame,
  cycleLength,
  warningFrames,
  recoveryFrames
});

const buildWarningCue = (
  technique: GeneratedBossTechnique,
  sequence: number,
  cycleFrame: number,
  cycleLength: number,
  warningFrames: number
) => buildCue(technique, 'warning', sequence, cycleFrame, cycleLength, warningFrames, 0);

const buildFireCue = (
  technique: GeneratedBossTechnique,
  sequence: number,
  cycleFrame: number,
  cycleLength: number,
  warningFrames: number,
  recoveryFrames: number
) => buildCue(
  technique,
  'fire',
  sequence,
  cycleFrame,
  cycleLength,
  warningFrames,
  recoveryFrames
);

const buildPairedTechniqueCue = (
  warningTechnique: GeneratedBossTechnique,
  fireTechnique: GeneratedBossTechnique,
  sequence: number,
  cycleFrame: number,
  cycleLength: number,
  warningFrame: number,
  fireFrame: number,
  recoveryFrames: number
): GeneratedBossTechniqueCue | null => {
  const warningFrames = fireFrame - warningFrame;
  if (cycleFrame === warningFrame) {
    return buildWarningCue(
      warningTechnique,
      sequence,
      cycleFrame,
      cycleLength,
      warningFrames
    );
  }
  if (cycleFrame === fireFrame) {
    return buildFireCue(
      fireTechnique,
      sequence,
      cycleFrame,
      cycleLength,
      warningFrames,
      recoveryFrames
    );
  }
  return null;
};

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
    const cycleLength = [196, 184, 172][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    const warningFrame = [78, 72, 66][safePhase - 1];
    const fireFrame = [112, 106, 100][safePhase - 1];
    const railCue = buildPairedTechniqueCue(
      'rail-telegraph',
      'rail-fire',
      sequence,
      cycleFrame,
      cycleLength,
      warningFrame,
      fireFrame,
      42
    );
    if (railCue) return railCue;

    // The later phases add a slow tail fan after the rail lane has cleared.
    // It never overlaps the primary rail warning or the next cycle's warning.
    if (safePhase >= 2) {
      const tailWarningFrame = safePhase === 2 ? 148 : 142;
      const tailFireFrame = safePhase === 2 ? 172 : 166;
      return buildPairedTechniqueCue(
        'rail-tail-telegraph',
        'rail-tail-volley',
        sequence,
        cycleFrame,
        cycleLength,
        tailWarningFrame,
        tailFireFrame,
        38
      );
    }
    return null;
  }

  if (archetype === 'prism-moth') {
    const cycleLength = [150, 136, 124][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return buildPairedTechniqueCue(
      'prism-telegraph',
      'prism-gap-ring',
      sequence,
      cycleFrame,
      cycleLength,
      42,
      72,
      40
    );
  }

  if (archetype === 'singularity-crab') {
    const cycleLength = [176, 160, 146][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return buildPairedTechniqueCue(
      'singularity-telegraph',
      'singularity-collapse',
      sequence,
      cycleFrame,
      cycleLength,
      48,
      82,
      42
    );
  }

  if (archetype === 'orbit-gyroscope') {
    const cycleLength = [116, 104, 94][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return buildPairedTechniqueCue(
      'orbit-telegraph',
      'orbit-cross',
      sequence,
      cycleFrame,
      cycleLength,
      22,
      48,
      34
    );
  }

  if (archetype === 'helix-leviathan') {
    const cycleLength = [96, 84, 74][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    const leftHanded = sequence % 2 === 0;
    return buildPairedTechniqueCue(
      leftHanded ? 'helix-left-telegraph' : 'helix-right-telegraph',
      leftHanded ? 'helix-left' : 'helix-right',
      sequence,
      cycleFrame,
      cycleLength,
      20,
      44,
      32
    );
  }

  if (archetype === 'hammerhead-siege') {
    const cycleLength = [132, 116, 104][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    const portSide = sequence % 2 === 0;
    return buildPairedTechniqueCue(
      portSide ? 'hammerhead-port-telegraph' : 'hammerhead-starboard-telegraph',
      portSide ? 'hammerhead-port' : 'hammerhead-starboard',
      sequence,
      cycleFrame,
      cycleLength,
      24,
      52,
      36
    );
  }

  if (archetype === 'eclipse-engine') {
    const cycleLength = [164, 148, 132][safePhase - 1];
    const cycleFrame = positiveModulo(safeTimer, cycleLength);
    const sequence = Math.floor(safeTimer / cycleLength);
    return buildPairedTechniqueCue(
      'eclipse-telegraph',
      'eclipse-dark-pulse',
      sequence,
      cycleFrame,
      cycleLength,
      44,
      76,
      40
    );
  }

  // The Tribunal deliberately changes vocabulary by health phase. Its final
  // phase deterministically rotates through four techniques instead of stacking
  // them in the same frame, keeping the final encounter readable on phones.
  const cycleLength = safePhase === 1 ? 196 : safePhase === 2 ? 140 : 112;
  const cycleFrame = positiveModulo(safeTimer, cycleLength);
  const sequence = Math.floor(safeTimer / cycleLength);
  if (safePhase === 1) {
    return buildPairedTechniqueCue(
      'rail-telegraph',
      'rail-fire',
      sequence,
      cycleFrame,
      cycleLength,
      78,
      110,
      42
    );
  }
  if (safePhase === 2) {
    const prismAttack = sequence % 2 === 0;
    return buildPairedTechniqueCue(
      prismAttack ? 'prism-telegraph' : 'orbit-telegraph',
      prismAttack ? 'prism-gap-ring' : 'orbit-cross',
      sequence,
      cycleFrame,
      cycleLength,
      34,
      66,
      40
    );
  }
  const finalTechniques: readonly GeneratedBossTechnique[] = [
    'helix-left',
    'hammerhead-port',
    'eclipse-dark-pulse',
    'singularity-collapse',
    'helix-right',
    'hammerhead-starboard'
  ];
  const fireTechnique = finalTechniques[positiveModulo(sequence, finalTechniques.length)];
  const warningTechnique = GENERATED_BOSS_FIRE_TELEGRAPH[fireTechnique];
  if (!warningTechnique) return null;
  return buildPairedTechniqueCue(
    warningTechnique,
    fireTechnique,
    sequence,
    cycleFrame,
    cycleLength,
    22,
    54,
    40
  );
};
