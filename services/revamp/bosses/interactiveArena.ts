import type { Entity, GameEngine } from '../../gameLogic';
import type { BossEncounterState } from './runtime';
export const INTERACTIVE_SWEEP_FRAMES = 72;
export interface InteractiveSweepSample { x: number; y: number; width: number; height: number; angle: number }
/** Both rays unfold outward from the exposed core; they never cross the central safe lane. */
export const sampleInteractiveSweep = (originX: number, originY: number, frame: number): readonly InteractiveSweepSample[] => {
  const progress = Math.max(0, Math.min(1, frame / (INTERACTIVE_SWEEP_FRAMES - 1)));
  const spread = (30 + Math.sin(progress * Math.PI) * 22) * Math.PI / 180;
  return [-1, 1].map(side => {
    const angle = Math.PI / 2 + side * spread;
    const length = 1000;
    return { x: originX + Math.cos(angle) * length / 2 - 7,
      y: originY + Math.sin(angle) * length / 2 - length / 2,
      width: 14, height: length, angle: angle - Math.PI / 2 };
  });
};
const beams = new WeakMap<Entity, Entity[]>();
export const beginInteractiveSweep = (engine: GameEngine, owner: Entity, state: BossEncounterState): void => {
  const anatomy = state.interactive!;
  const spawned = sampleInteractiveSweep(anatomy.coreX, anatomy.coreY, 0).map(sample => {
    const beam = engine.spawnEnemyLaneLaser(owner.id, 'vertical', 0, 1, false, INTERACTIVE_SWEEP_FRAMES);
    beam.x = sample.x; beam.y = sample.y; beam.width = sample.width; beam.height = sample.height;
    beam.beamAngleRadians = sample.angle; beam.color = '#f08bdb';
    return beam;
  });
  beams.set(owner, spawned);
};
export const updateInteractiveSweep = (owner: Entity, state: BossEncounterState): void => {
  const live = beams.get(owner);
  if (!live) return;
  const anatomy = state.interactive!;
  const age = 180 - state.remainingFrames;
  if (state.stage !== 'fire' || anatomy.attackMode !== 'arena' || anatomy.arena.pattern !== 'sweep' || age >= INTERACTIVE_SWEEP_FRAMES) {
    for (const beam of live) beam.markedForDeletion = true;
    beams.delete(owner); return;
  }
  sampleInteractiveSweep(anatomy.coreX, anatomy.coreY, age).forEach((sample, index) => {
    const beam = live[index];
    if (beam.markedForDeletion) return;
    beam.x = sample.x; beam.y = sample.y; beam.width = sample.width; beam.height = sample.height;
    beam.beamAngleRadians = sample.angle;
  });
};
