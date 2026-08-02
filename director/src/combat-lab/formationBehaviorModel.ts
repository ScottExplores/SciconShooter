import type {
  FormationAttackBehaviorId,
  FormationBehaviorOverride,
  FormationEntryPathId,
  FormationFiringBehaviorId,
  FormationMovementId,
  FormationPackDefinition,
  FormationReturnBehaviorId,
  SpawnEvent,
  SpawnPatternId
} from '@game/game-config/types';

export interface FormationBehaviorOption<T extends string> {
  id: T;
  label: string;
}

export const FORMATION_ENTRY_OPTIONS: readonly FormationBehaviorOption<FormationEntryPathId>[] = [
  { id: 'sweep-bank-reentry', label: 'Sweep, bank, re-entry' },
  { id: 'formation-drop', label: 'Formation drop' },
  { id: 'spiral-entry', label: 'Spiral entry' },
  { id: 'paired-flank', label: 'Paired flank' },
  { id: 'diamond-lock', label: 'Diamond lock' },
  { id: 'double-helix', label: 'Double helix' },
  { id: 'side-wall-entry', label: 'Side wall entry' },
  { id: 'lane-stagger', label: 'Staggered lanes' },
  { id: 'ring-assemble', label: 'Ring assembly' },
  { id: 'armored-grid', label: 'Armored grid' },
  { id: 'mirrored-swoop', label: 'Mirrored swoop' },
  { id: 'pod-converge', label: 'Pod convergence' },
  { id: 'convoy-column', label: 'Convoy column' }
];

export const FORMATION_MOVEMENT_OPTIONS: readonly FormationBehaviorOption<FormationMovementId>[] = [
  { id: 'gentle-drift', label: 'Gentle drift' },
  { id: 'lateral-sweep', label: 'Lateral sweep' },
  { id: 'expand-collapse', label: 'Expand and collapse' },
  { id: 'rotating-wheel', label: 'Rotating wheel' },
  { id: 'snake-weave', label: 'Snake weave' },
  { id: 'split-pods', label: 'Split pods' },
  { id: 'lane-shift', label: 'Lane shift' }
];

export const FORMATION_ATTACK_OPTIONS: readonly FormationBehaviorOption<FormationAttackBehaviorId>[] = [
  { id: 'single-dive', label: 'Single dive' },
  { id: 'paired-dive', label: 'Paired dive' },
  { id: 'alternating-wings', label: 'Alternating wings' },
  { id: 'leader-escorts', label: 'Leader and escorts' },
  { id: 'row-sequence', label: 'Row sequence' },
  { id: 'diagonal-groups', label: 'Diagonal groups' },
  { id: 'sweep-strafe', label: 'Sweep strafe' },
  { id: 'pincer-pass', label: 'Pincer pass' },
  { id: 'ring-collapse', label: 'Ring collapse' },
  { id: 'aimed-volley', label: 'Aimed volley' },
  { id: 'spread-volley', label: 'Spread volley' },
  { id: 'lane-pass', label: 'Lane pass' },
  { id: 'split-hunt', label: 'Split hunt' }
];

export const FORMATION_FIRING_OPTIONS: readonly FormationBehaviorOption<FormationFiringBehaviorId>[] = [
  { id: 'none', label: 'No formation fire' },
  { id: 'post-formation', label: 'After assembly' },
  { id: 'staggered', label: 'Staggered fire' },
  { id: 'priority', label: 'Priority attackers' }
];

export const FORMATION_RETURN_OPTIONS: readonly FormationBehaviorOption<FormationReturnBehaviorId>[] = [
  { id: 'reform', label: 'Reform formation' },
  { id: 'transform', label: 'Transform formation' },
  { id: 'retreat', label: 'Retreat' },
  { id: 'exit', label: 'Exit encounter' }
];

type FormationMode = Exclude<SpawnPatternId, 'single-random' | 'asteroid-lanes'>;

const groupedMode = (patternId: SpawnPatternId): FormationMode => (
  patternId === 'single-random' || patternId === 'asteroid-lanes' ? 'row' : patternId
);

const entryForPattern = (patternId: SpawnPatternId): FormationEntryPathId => {
  const mode = groupedMode(patternId);
  if (mode === 'spiral' || mode === 'wheel') return 'spiral-entry';
  if (mode === 'pincer') return 'paired-flank';
  if (mode === 'diamond' || mode === 'crescent' || mode === 'arc') return 'diamond-lock';
  if (mode === 'ring') return 'ring-assemble';
  if (mode === 'pods') return 'pod-converge';
  if (mode === 'escort') return 'convoy-column';
  if (mode === 'shield-wall' || mode === 'lanes') return 'lane-stagger';
  if (mode === 'snake' || mode === 'sine') return 'double-helix';
  if (mode === 'grid') return 'formation-drop';
  return 'mirrored-swoop';
};

const movementForPattern = (patternId: SpawnPatternId): FormationMovementId => {
  const mode = groupedMode(patternId);
  if (mode === 'wheel' || mode === 'ring' || mode === 'spiral') return 'rotating-wheel';
  if (mode === 'crescent' || mode === 'arc' || mode === 'diamond') return 'expand-collapse';
  if (mode === 'snake' || mode === 'sine') return 'snake-weave';
  if (mode === 'pods' || mode === 'double-v') return 'split-pods';
  if (mode === 'lanes' || mode === 'shield-wall') return 'lane-shift';
  if (mode === 'pincer') return 'lateral-sweep';
  return 'gentle-drift';
};

const attackForPattern = (patternId: SpawnPatternId): FormationAttackBehaviorId => {
  const mode = groupedMode(patternId);
  if (mode === 'pincer') return 'pincer-pass';
  if (mode === 'ring' || mode === 'wheel' || mode === 'spiral') return 'ring-collapse';
  if (mode === 'double-v' || mode === 'pods') return 'alternating-wings';
  if (mode === 'escort') return 'leader-escorts';
  if (mode === 'shield-wall' || mode === 'lanes') return 'lane-pass';
  if (mode === 'diamond' || mode === 'crescent' || mode === 'arc') return 'diagonal-groups';
  if (mode === 'row' || mode === 'staggered-row' || mode === 'grid') return 'row-sequence';
  return 'paired-dive';
};

export interface ResolvedEditableFormationBehavior {
  entryPathId: FormationEntryPathId;
  movementId: FormationMovementId;
  attackId: FormationAttackBehaviorId;
  firingBehavior: FormationFiringBehaviorId;
  returnId: FormationReturnBehaviorId;
  holdSeconds: number;
  telegraphSeconds: number;
  attackDurationSeconds: number;
  recoverySeconds: number;
  attackGroupSize: number;
  attackCycles: number;
}

export const resolveEditableFormationBehavior = (
  event: SpawnEvent,
  pack?: FormationPackDefinition
): ResolvedEditableFormationBehavior => ({
  entryPathId: event.formationBehavior?.entryPathId ?? pack?.entryPath ?? entryForPattern(event.patternId),
  movementId: event.formationBehavior?.movementId ?? pack?.movementBehavior ?? movementForPattern(event.patternId),
  attackId: event.formationBehavior?.attackId ?? pack?.attackBehavior ?? attackForPattern(event.patternId),
  firingBehavior: event.formationBehavior?.firingBehavior ?? pack?.firingBehavior ?? 'post-formation',
  returnId: event.formationBehavior?.returnId ?? pack?.returnBehavior ?? 'reform',
  holdSeconds: event.formationBehavior?.holdSeconds ?? pack?.holdSeconds ?? 1.5,
  telegraphSeconds: event.formationBehavior?.telegraphSeconds ?? pack?.telegraphSeconds ?? 0.65,
  attackDurationSeconds: event.formationBehavior?.attackDurationSeconds ?? pack?.attackDurationSeconds ?? 1.25,
  recoverySeconds: event.formationBehavior?.recoverySeconds ?? pack?.attackRecoverySeconds ?? 1.25,
  attackGroupSize: event.formationBehavior?.attackGroupSize ?? pack?.attackGroupSize ?? 2,
  attackCycles: event.formationBehavior?.attackCycles ?? pack?.attackCycles ?? 0
});

export const updateFormationBehavior = (
  event: SpawnEvent,
  patch: Partial<FormationBehaviorOverride>
): SpawnEvent => ({
  ...event,
  formationBehavior: { ...event.formationBehavior, ...patch }
});

export const clearFormationBehavior = (event: SpawnEvent): SpawnEvent => {
  const next = { ...event };
  delete next.formationBehavior;
  return next;
};
