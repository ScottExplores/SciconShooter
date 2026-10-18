import type { BossComponentState, Entity, GameEngine } from '../../gameLogic';
import { getBossCoinBurstCount } from '../../bossCoinBurst';
import { revampEvents } from '../events';
import { playBossDeathSequence } from '../vfx/BossDeathSequence';
import { resolveRevampBoss } from './catalog';
import {
  advanceBossEncounter, beginBossPhaseTransition, bossCanTakeDamage,
  bossDamageMultiplier, bossPhaseFloor, breakBossPart, createBossEncounter,
  getBossEncounter, BOSS_RAGE_RATIO, type BossEncounterState
} from './runtime';

const payload = (engine: GameEngine, boss: Entity, state: BossEncounterState) => ({
  bossId: state.definition.id, entityId: boss.id, frame: engine.frameCount,
  x: boss.x + boss.width / 2, y: boss.y + boss.height / 2, phase: state.phase
});

/** Cancel in simulation first; the event only asks job A to visualize the result. */
export const cancelBossHazards = (engine: GameEngine, boss: Entity, reason: string): void => {
  const state = getBossEncounter(boss);
  if (!state) return;
  const bullets: { x: number; y: number }[] = [];
  for (const entity of engine.entities) {
    if (entity.bossOwnerId !== boss.id || entity.isPlayerShot || entity.markedForDeletion) continue;
    bullets.push({ x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 });
    entity.markedForDeletion = true;
  }
  revampEvents.emit('boss:bullet-cancel', { ...payload(engine, boss, state), reason, bullets });
};

const syncPart = (boss: Entity, state: BossEncounterState): void => {
  const component = boss.bossComponents[0];
  state.part.x = boss.x + boss.width * component.centerXRatio;
  state.part.y = boss.y + boss.height * component.centerYRatio;
  component.hp = state.part.hp;
  component.destroyed = state.part.broken;
  component.exposed = bossCanTakeDamage(state);
};

/** One opt-in registry lookup; legacy/editor-only identities retain their original runtime. */
export const attachRevampBoss = (engine: GameEngine, boss: Entity): void => {
  const definition = resolveRevampBoss(boss.sourceItemId ?? 'gatekeeper-prime', boss.sourceEventId ?? '');
  if (!definition) return;
  const state = createBossEncounter(boss, definition, boss.maxHp);
  const fit = Math.min(1, Math.min(engine.width * 0.72, 280) / Math.max(1, boss.width), 245 / Math.max(1, boss.height));
  boss.width *= fit;
  boss.height *= fit;
  boss.x = (engine.width - boss.width) / 2;
  boss.y = -boss.height;
  boss.vx = boss.vy = 0;
  boss.text = definition.name.toUpperCase();
  // The polish controller owns combat phases; preserve provenance and all art/rig references.
  boss.bossTimeline = undefined;
  boss.bossRevival = undefined;
  boss.bossRevivalStage = undefined;
  boss.bossEscapeConsumed = true;
  boss.bossPhaseBreathFrames = 0;
  boss.phaseThresholds = [1, 0.66, 0.33];
  boss.activeBossPhaseIndex = 0;
  boss.bossComponents = [{
    id: definition.part.side === 'left' ? 'left-cannon' : 'right-cannon',
    label: definition.part.name, hp: state.part.hp, maxHp: state.part.maxHp,
    centerXRatio: definition.part.side === 'left' ? 0.27 : 0.73,
    // Lower-edge attachment: upward player rounds must reach the part before the hull.
    centerYRatio: 0.96, widthRatio: 42 / boss.width, heightRatio: 42 / boss.height,
    destroyed: false, exposed: false, flashFrames: 0, lastDamageFlashFrame: -999
  }];
  syncPart(boss, state);
  revampEvents.emit('boss:intro', { ...payload(engine, boss, state), name: definition.name, epithet: definition.epithet, durationFrames: 72 });
};

export const updateRevampBoss = (engine: GameEngine, boss: Entity): boolean => {
  const state = getBossEncounter(boss);
  if (!state) return false;
  if (state.stage === 'defeated') return true;
  boss.attackTimer++;
  boss.vx = boss.vy = 0;
  // Entry ends before the first warning; live attacks freeze their emitting pose.
  if (state.stage === 'intro') {
    const t = Math.min(1, (state.ageFrames + 1) / 72);
    boss.y = -boss.height + (boss.height + 148) * (1 - Math.pow(1 - t, 3));
  }
  syncPart(boss, state);
  const floor = bossPhaseFloor(state, boss.maxHp);
  // Editor health controls follow the same phase gate as real damage.
  if (bossCanTakeDamage(state) && state.phase < 3 && boss.hp <= floor) transition(engine, boss, state);
  if (!state.rage && boss.hp <= boss.maxHp * BOSS_RAGE_RATIO + 1e-9) {
    state.rage = true;
    revampEvents.emit('boss:rage', payload(engine, boss, state));
    engine.playSound('boss_roar', 0.6);
  }
  const result = advanceBossEncounter(state, {
    origin: { x: boss.x + boss.width / 2, y: boss.y + boss.height * 0.62 },
    player: { x: engine.player.x + engine.player.width / 2, y: engine.player.y + engine.player.height / 2 },
    worldWidth: engine.width, worldHeight: engine.height
  });
  boss.activeBossPhaseIndex = state.phase - 1;
  boss.activeBossPhaseId = `revamp-phase-${state.phase}`;
  boss.bossWeakPointOpen = state.stage === 'recovery' || state.stage === 'stagger';
  if (result === 'warning') {
    revampEvents.emit('boss:warning', {
      ...payload(engine, boss, state), attackId: state.attack!.id,
      durationFrames: state.plan!.warningFrames, sockets: state.plan!.sockets,
      lines: state.plan!.lines, zones: state.plan!.zones, color: state.attack!.color, sound: 'boss_alert'
    });
    engine.playSound('boss_alert', 0.7);
  } else if (result === 'fire') {
    const color = state.attack!.color === 'magenta' ? '#f08bdb' : '#ffcc66';
    for (const [index, shot] of state.plan!.projectiles.entries()) {
      engine.spawnGeneratedBossProjectile(boss, shot.x, shot.y, Math.atan2(shot.vy, shot.vx),
        Math.hypot(shot.vx, shot.vy), color, shot.size, index);
    }
    for (const zone of state.plan!.zones) {
      const beam = engine.spawnEnemyLaneLaser(boss.id, 'vertical', zone.x + zone.width / 2, 1, false, zone.durationFrames);
      beam.x = zone.x; beam.y = zone.y; beam.width = zone.width; beam.height = zone.height;
      beam.color = color;
    }
    revampEvents.emit('boss:attack', { ...payload(engine, boss, state), attackId: state.attack!.id });
    engine.playSound('boss_shoot', 0.8);
  } else if (result === 'recovery') {
    cancelBossHazards(engine, boss, 'recovery');
    revampEvents.emit('boss:recovery', { ...payload(engine, boss, state), durationFrames: state.remainingFrames, damageMultiplier: 1.45 });
  }
  return true;
};

const transition = (engine: GameEngine, boss: Entity, state: BossEncounterState): void => {
  beginBossPhaseTransition(state);
  cancelBossHazards(engine, boss, 'phase');
  revampEvents.emit('boss:phase-transition', { ...payload(engine, boss, state), durationFrames: 60, sound: 'boss_roar' });
  engine.pulseDamageFlash(boss, 12);
  engine.playSound('boss_roar', 0.8);
};

/** Damage cannot skip a phase, including several player shots landing in one tick. */
export const revampHullDamage = (boss: Entity, damage: number): number | undefined => {
  const state = getBossEncounter(boss);
  if (!state) return undefined;
  if (!bossCanTakeDamage(state) || !Number.isFinite(damage)) return 0;
  return Math.min(Math.max(0, damage) * bossDamageMultiplier(state), Math.max(0, boss.hp - bossPhaseFloor(state, boss.maxHp)));
};
export const afterRevampHullDamage = (engine: GameEngine, boss: Entity): void => {
  const state = getBossEncounter(boss);
  if (!state) return;
  if (state.phase < 3 && boss.hp <= bossPhaseFloor(state, boss.maxHp)) transition(engine, boss, state);
};

export const getRevampPartHit = (boss: Entity, box: { x: number; y: number; width: number; height: number }): BossComponentState | undefined => {
  const state = getBossEncounter(boss);
  if (!state || state.part.broken || !bossCanTakeDamage(state)) return undefined;
  const part = state.part;
  const dx = part.x - Math.max(box.x, Math.min(part.x, box.x + box.width));
  const dy = part.y - Math.max(box.y, Math.min(part.y, box.y + box.height));
  return dx * dx + dy * dy <= part.radius * part.radius ? boss.bossComponents[0] : undefined;
};

export const damageRevampPart = (engine: GameEngine, boss: Entity, component: BossComponentState, damage: number): boolean => {
  const state = getBossEncounter(boss);
  if (!state) return false;
  if (!bossCanTakeDamage(state) || state.part.broken || !Number.isFinite(damage)) return true;
  state.part.hp = Math.max(0, state.part.hp - Math.max(0, damage));
  engine.pulseBossComponentFlash(component);
  if (state.part.hp <= 0 && breakBossPart(state)) {
    cancelBossHazards(engine, boss, 'part-break');
    revampEvents.emit('boss:part-break', {
      ...payload(engine, boss, state), partId: state.part.id, x: state.part.x, y: state.part.y,
      disablesAttackId: state.definition.part.disablesAttackId, durationFrames: 72, damageMultiplier: 1.75
    });
    engine.playSound('explode', 0.8);
    engine.pulseDamageFlash(boss, 8);
  }
  syncPart(boss, state);
  return true;
};

/** Visual sequence is scheduled by offset, without wall timers or duplicate coin awards. */
export const defeatRevampBoss = (engine: GameEngine, boss: Entity): void => {
  const state = getBossEncounter(boss);
  if (!state || state.stage === 'defeated') return;
  state.stage = 'defeated'; state.plan = null; state.attack = null;
  cancelBossHazards(engine, boss, 'defeat');
  // REVAMP(S): Safe to call again from the common feel receipt or O's terminal hook.
  playBossDeathSequence(engine, boss);
  const base = payload(engine, boss, state);
  revampEvents.emit('boss:defeat', base);
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI * 0.8;
    revampEvents.emit('boss:explosion', { ...base, offsetFrames: index * 5,
      x: base.x + Math.cos(angle) * boss.width * 0.26,
      y: base.y + Math.sin(angle) * boss.height * 0.26, scale: index === 5 ? 2 : 0.7 });
  }
  revampEvents.emit('boss:debris', { ...base, count: 12, color: boss.color });
  revampEvents.emit('boss:coin-burst', { ...base, count: getBossCoinBurstCount('main-boss', engine.stats.wave), visualOnly: true });
  revampEvents.emit('boss:slow-mo', { ...base, durationMs: 400, timeScale: 0.3 });
};
