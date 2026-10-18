import type { BossProfile, BossAttackProfile } from './catalog';
import { createBossAttackPlan, type BossAttackPlan } from './patterns';
import { activeInteractiveParts, createInteractiveArenaPlan, createInteractiveBossState, createInteractiveWeaponPlan, setInteractiveLayer, type InteractiveBossState } from './interactive';

export const BOSS_INTRO_FRAMES = 72;
export const BOSS_TRANSITION_FRAMES = 60;
export const BOSS_STAGGER_FRAMES = 72;
export const BOSS_RAGE_RATIO = 0.15;
export type BossStage = 'intro' | 'transition' | 'warning' | 'fire' | 'recovery' | 'stagger' | 'defeated';
export interface BossEncounterState {
  definition: BossProfile;
  /** REVAMP(O): Optional so C's pure timeline/proof API stays usable. */
  interactive?: InteractiveBossState;
  ageFrames: number;
  stage: BossStage;
  remainingFrames: number;
  phase: 1 | 2 | 3;
  rage: boolean;
  sequence: number;
  attack: BossAttackProfile | null;
  plan: BossAttackPlan | null;
  part: { id: string; name: string; hp: number; maxHp: number; broken: boolean; x: number; y: number; radius: number };
}
const encounters = new WeakMap<object, BossEncounterState>();
export const getBossEncounter = (boss: object): BossEncounterState | undefined => encounters.get(boss);
export const createBossEncounter = (boss: object, definition: BossProfile, maxHp: number, interactive: false | 'major' | 'mini' = false): BossEncounterState => {
  const partHp = Math.max(1, maxHp * definition.part.healthRatio);
  const state: BossEncounterState = {
    definition, ageFrames: 0, stage: 'intro', remainingFrames: BOSS_INTRO_FRAMES,
    phase: 1, rage: false, sequence: 0, attack: null, plan: null,
    part: { id: definition.part.id, name: definition.part.name, hp: partHp, maxHp: partHp, broken: false, x: 0, y: 0, radius: 21 }
  };
  if (interactive) {
    state.interactive = createInteractiveBossState(definition, maxHp, interactive);
    state.part = state.interactive.parts[0];
  }
  encounters.set(boss, state);
  return state;
};
export const bossCanTakeDamage = (state: BossEncounterState): boolean => (
  !['intro', 'transition', 'defeated'].includes(state.stage)
);
export const bossDamageMultiplier = (state: BossEncounterState): number => (
  state.interactive ? (state.interactive.coreOpen >= 0.8 ? 1.85 : 0.8)
    : state.stage === 'stagger' ? 1.75 : state.stage === 'recovery' ? 1.45 : 1
);
export const bossPhaseFloor = (state: BossEncounterState, maxHp: number): number => (
  state.phase === 1 ? maxHp * 0.66 : state.phase === 2 ? maxHp * 0.33 : 0
);
export const beginBossPhaseTransition = (state: BossEncounterState): void => {
  state.phase = Math.min(3, state.phase + 1) as 1 | 2 | 3;
  if (state.interactive) setInteractiveLayer(state.interactive, state.phase);
  state.stage = 'transition';
  state.remainingFrames = BOSS_TRANSITION_FRAMES;
  state.sequence = 0;
  state.attack = null;
  state.plan = null;
};
/** Breaking a part preempts its committed attack, not just the next selection. */
export const breakBossPart = (state: BossEncounterState): boolean => {
  if (state.part.broken || !bossCanTakeDamage(state)) return false;
  state.part.hp = 0;
  state.part.broken = true;
  state.stage = 'stagger';
  state.remainingFrames = BOSS_STAGGER_FRAMES;
  state.attack = null;
  state.plan = null;
  return true;
};

export interface BossPlanContext {
  origin: { x: number; y: number };
  player: { x: number; y: number };
  worldWidth: number;
  worldHeight: number;
}
export type BossStep = 'none' | 'warning' | 'fire' | 'recovery';
/** One call is exactly one simulation frame. No wall time or device flags. */
export const advanceBossEncounter = (state: BossEncounterState, context: BossPlanContext): BossStep => {
  if (state.stage === 'defeated') return 'none';
  state.ageFrames++;
  const anatomy = state.interactive;
  if (anatomy) {
    const opening = !anatomy.shielded && (state.stage === 'recovery' || state.stage === 'stagger');
    const before = anatomy.coreOpen;
    anatomy.coreOpen = Math.max(0, Math.min(1, before + (opening ? 1 : -1) / 18));
    anatomy.hatchStage = anatomy.coreOpen === 0 ? 'closed' : anatomy.coreOpen === 1 ? 'open' : opening ? 'opening' : 'closing';
    anatomy.transform = Math.min(1, anatomy.transform + (state.phase > 1 ? 1 / 60 : 0));
    anatomy.hatchOpen = Math.max(0, Math.min(1, anatomy.hatchOpen + (anatomy.attackMode === 'summon' && ['warning', 'fire'].includes(state.stage) ? 1 : -1) / 18));
    for (const part of anatomy.parts) if (part.flashFrames > 0) part.flashFrames--;
    anatomy.arena.warningFrames = anatomy.attackMode === 'arena' && state.stage === 'warning' ? state.remainingFrames : 0;
    anatomy.arena.activeFrames = anatomy.attackMode === 'arena' && state.stage === 'fire' ? Math.max(0, state.remainingFrames - 108) : 0;
  }
  if (--state.remainingFrames > 0) return 'none';
  if (state.stage === 'warning') {
    state.stage = 'fire';
    state.remainingFrames = state.plan!.liveFrames;
    return 'fire';
  }
  if (state.stage === 'fire') {
    state.stage = 'recovery';
    state.remainingFrames = state.plan!.recoveryFrames;
    return 'recovery';
  }
  if (anatomy) return beginInteractiveWarning(state, context);
  const phase = state.definition.phases[state.phase - 1];
  const attacks = phase.attackIds
    .map((id) => state.definition.attacks.find((attack) => attack.id === id))
    .filter((attack): attack is BossAttackProfile => Boolean(attack)
      && !(state.part.broken && attack!.id === state.definition.part.disablesAttackId));
  // Catalog validation guarantees at least one operational attack in each phase.
  const attack = attacks[state.sequence % attacks.length];
  state.attack = attack;
  state.plan = createBossAttackPlan({
    ...context, attack, phase: state.phase, sequence: state.sequence + state.definition.patternOffset, rage: state.rage
  });
  state.sequence++;
  state.stage = 'warning';
  state.remainingFrames = Math.max(36, state.plan.warningFrames);
  return 'warning';
};

/** Surviving weapon anatomy owns the next sentence; core fallback is a new visible emitter. */
const beginInteractiveWarning = (state: BossEncounterState, context: BossPlanContext): BossStep => {
  const anatomy = state.interactive!;
  const parts = activeInteractiveParts(anatomy);
  // REVAMP(O): Show each new phase's arena and hangar before its weapon pair.
  const sequence = state.sequence++ + (state.phase > 1 ? 2 : 0);
  anatomy.attackMode = state.phase > 1 && sequence % 4 === 2 ? 'arena'
    : state.phase > 1 && sequence % 4 === 3 ? 'summon' : 'weapon';
  const part = parts.length ? parts[sequence % parts.length] : undefined;
  anatomy.ownerPartId = anatomy.attackMode === 'weapon' ? part?.id ?? 'core' : null;
  const original = part ? state.definition.attacks.find(attack => attack.id === part.attackId)!
    : state.definition.attacks[sequence % 2 === 0 ? 1 : 3];
  state.attack = part ? original : { ...original, id: `${state.definition.id}:core-${original.kind}` };
  // Lower-hull sockets need more runway than C's central muzzle for the two-lane wall.
  if (state.attack.kind === 'weave-wall' || state.attack.kind === 'gap-ring') state.attack = { ...state.attack, telegraphFrames: Math.max(108, state.attack.telegraphFrames) };
  if (anatomy.attackMode === 'arena') {
    state.attack = { ...original, id: `${state.definition.id}:arena`, name: 'Reactor Grid', kind: 'lane-salvo', telegraphFrames: 84 };
    state.plan = createInteractiveArenaPlan(state.phase, sequence, context.worldWidth, context.worldHeight, { x: anatomy.coreX, y: anatomy.coreY });
    anatomy.arena.zones = state.plan.zones;
    anatomy.arena.safeLaneX = state.plan.safeRoute.x;
    anatomy.arena.pattern = state.phase === 2 ? 'walls' : sequence % 8 === 6 ? 'chevron' : 'sweep';
    anatomy.arena.safeLaneWidth = state.phase === 2 ? 206 : anatomy.arena.pattern === 'sweep' ? 98 : 162;
  } else if (anatomy.attackMode === 'summon') {
    state.attack = { ...original, id: `${state.definition.id}:hangar`, name: 'Escort Deployment', kind: 'gap-ring', telegraphFrames: 60 };
    state.plan = Object.freeze({ projectiles: Object.freeze([]), zones: Object.freeze([]), lines: Object.freeze([]),
      sockets: Object.freeze([{ x: anatomy.hangarX, y: anatomy.hangarY }]), safeRoute: Object.freeze({ x: context.worldWidth / 2, y: context.worldHeight * 0.8 }),
      warningFrames: 60, liveFrames: 180, recoveryFrames: 72, color: 'amber' });
    anatomy.arena.zones = [];
  } else {
    state.plan = createInteractiveWeaponPlan({ ...context, origin: part ? { x: part.x, y: part.y } : { x: anatomy.coreX, y: anatomy.coreY },
      attack: state.attack, phase: state.phase, sequence: sequence + state.definition.patternOffset, rage: state.rage });
    anatomy.arena.zones = [];
  }
  state.stage = 'warning';
  state.remainingFrames = Math.max(36, state.plan.warningFrames);
  return 'warning';
};
