import type { BossProfile, BossAttackProfile } from './catalog';
import { createBossAttackPlan, type BossAttackPlan } from './patterns';

export const BOSS_INTRO_FRAMES = 72;
export const BOSS_TRANSITION_FRAMES = 60;
export const BOSS_STAGGER_FRAMES = 72;
export const BOSS_RAGE_RATIO = 0.15;
export type BossStage = 'intro' | 'transition' | 'warning' | 'fire' | 'recovery' | 'stagger' | 'defeated';
export interface BossEncounterState {
  definition: BossProfile;
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
export const createBossEncounter = (boss: object, definition: BossProfile, maxHp: number): BossEncounterState => {
  const partHp = Math.max(1, maxHp * definition.part.healthRatio);
  const state: BossEncounterState = {
    definition, ageFrames: 0, stage: 'intro', remainingFrames: BOSS_INTRO_FRAMES,
    phase: 1, rage: false, sequence: 0, attack: null, plan: null,
    part: { id: definition.part.id, name: definition.part.name, hp: partHp, maxHp: partHp, broken: false, x: 0, y: 0, radius: 21 }
  };
  encounters.set(boss, state);
  return state;
};
export const bossCanTakeDamage = (state: BossEncounterState): boolean => (
  !['intro', 'transition', 'defeated'].includes(state.stage)
);
export const bossDamageMultiplier = (state: BossEncounterState): number => (
  state.stage === 'stagger' ? 1.75 : state.stage === 'recovery' ? 1.45 : 1
);
export const bossPhaseFloor = (state: BossEncounterState, maxHp: number): number => (
  state.phase === 1 ? maxHp * 0.66 : state.phase === 2 ? maxHp * 0.33 : 0
);
export const beginBossPhaseTransition = (state: BossEncounterState): void => {
  state.phase = Math.min(3, state.phase + 1) as 1 | 2 | 3;
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
