import type { BossComponentState, Entity, GameEngine } from '../../gameLogic';
import { getBossCoinBurstCount } from '../../bossCoinBurst';
import { revampEvents } from '../events';
import { resolveRevampBoss } from './catalog';
import { activeInteractiveParts, interactiveLayerDestroyed, updateInteractivePartDamage } from './interactive';
import { summonInteractiveBossEscorts } from './interactiveEscorts';
import { beginInteractiveSweep, updateInteractiveSweep } from './interactiveArena';
import {
  advanceBossEncounter, beginBossPhaseTransition, bossCanTakeDamage,
  bossDamageMultiplier, bossPhaseFloor, breakBossPart, createBossEncounter,
  getBossEncounter, BOSS_RAGE_RATIO, type BossEncounterState
} from './runtime';

const encounterEngines = new WeakMap<object, GameEngine>();

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
  if (state.interactive) state.interactive.escorts = [];
  revampEvents.emit('boss:bullet-cancel', { ...payload(engine, boss, state), reason, bullets });
};

const syncPart = (boss: Entity, state: BossEncounterState): void => {
  const anatomy = state.interactive;
  if (anatomy) {
    anatomy.coreX = boss.x + boss.width / 2;
    const coreRatio = state.definition.sourceBossId === 'frontier-crownclaw' ? 0.50
      : state.definition.sourceBossId === 'orbit-gyroscope' ? 0.52 : 0.62;
    anatomy.coreY = boss.y + boss.height * coreRatio;
    anatomy.hangarX = boss.x + boss.width / 2;
    anatomy.hangarY = boss.y + boss.height * 0.35;
    anatomy.parts.forEach((part, index) => {
      const component = boss.bossComponents[index];
      part.x = boss.x + boss.width * part.xRatio;
      part.y = boss.y + boss.height * part.yRatio;
      component.hp = part.hp; component.destroyed = part.broken;
      component.exposed = part.active && !part.broken && bossCanTakeDamage(state);
      updateInteractivePartDamage(part);
    });
    return;
  }
  const component = boss.bossComponents[0];
  state.part.x = boss.x + boss.width * component.centerXRatio;
  state.part.y = boss.y + boss.height * component.centerYRatio;
  component.hp = state.part.hp;
  component.destroyed = state.part.broken;
  component.exposed = bossCanTakeDamage(state);
};

/** One opt-in registry lookup; legacy/editor-only identities retain their original runtime. */
export const attachRevampBoss = (engine: GameEngine, boss: Entity, options: { interactive?: boolean } = {}): void => {
  const definition = resolveRevampBoss(boss.sourceItemId ?? 'gatekeeper-prime', boss.sourceEventId ?? '');
  if (!definition) return;
  const state = createBossEncounter(boss, definition, boss.maxHp, options.interactive === false ? false : 'major');
  encounterEngines.set(boss, engine);
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
  if (state.interactive) boss.bossComponents = state.interactive.parts.map((part, index) => ({
    id: index % 2 === 0 ? 'left-cannon' : 'right-cannon', label: part.name, hp: part.hp, maxHp: part.maxHp,
    centerXRatio: part.xRatio, centerYRatio: part.yRatio, widthRatio: part.radius * 2 / boss.width,
    heightRatio: part.radius * 2 / boss.height, destroyed: false, exposed: false, flashFrames: 0, lastDamageFlashFrame: -999
  }));
  syncPart(boss, state);
  revampEvents.emit('boss:intro', { ...payload(engine, boss, state), name: definition.name, epithet: definition.epithet, durationFrames: 72 });
  if (state.interactive) engine.playSound('boss_alert', 0.85);
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
    if (state.interactive && state.ageFrames === 71 && typeof engine.addShake === 'function') engine.addShake(2.4);
  }
  syncPart(boss, state);
  const floor = bossPhaseFloor(state, boss.maxHp);
  // Editor health controls follow the same phase gate as real damage.
  if (bossCanTakeDamage(state) && state.phase < 3 && boss.hp <= floor) {
    // Explicit lab HP presets reconstruct anatomy; combat damage itself cannot bypass a layer.
    if (state.interactive) for (const part of state.interactive.parts) if (part.layer === state.phase) {
      part.hp = 0; part.broken = true; part.active = false; updateInteractivePartDamage(part);
    }
    transition(engine, boss, state);
  }
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
  if (state.interactive) updateInteractiveSweep(boss, state);
  boss.activeBossPhaseIndex = state.phase - 1;
  boss.activeBossPhaseId = `revamp-phase-${state.phase}`;
  boss.bossWeakPointOpen = state.interactive ? state.interactive.coreOpen >= 0.8 : state.stage === 'recovery' || state.stage === 'stagger';
  if (result === 'warning') {
    revampEvents.emit('boss:warning', {
      ...payload(engine, boss, state), attackId: state.attack!.id,
      durationFrames: state.plan!.warningFrames, sockets: state.plan!.sockets,
      lines: state.plan!.lines, zones: state.plan!.zones, color: state.attack!.color, sound: 'boss_alert'
    });
    engine.playSound('boss_alert', 0.7);
  } else if (result === 'fire') {
    if (state.interactive?.attackMode === 'summon') summonInteractiveBossEscorts(engine, boss, state);
    const color = state.attack!.color === 'magenta' ? '#f08bdb' : '#ffcc66';
    for (const [index, shot] of state.plan!.projectiles.entries()) {
      engine.spawnGeneratedBossProjectile(boss, shot.x, shot.y, Math.atan2(shot.vy, shot.vx),
        Math.hypot(shot.vx, shot.vy), color, shot.size, index);
    }
    const sweep = state.interactive?.attackMode === 'arena' && state.interactive.arena.pattern === 'sweep';
    if (sweep) beginInteractiveSweep(engine, boss, state);
    for (const zone of sweep ? [] : state.plan!.zones) {
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
  if (state.interactive) {
    revampEvents.emit('boss:transformation', { ...payload(engine, boss, state), durationFrames: 60 });
    if (typeof engine.addShake === 'function') engine.addShake(2.8);
  }
  engine.pulseDamageFlash(boss, 3);
  engine.playSound('boss_roar', 0.8);
};

/** Damage cannot skip a phase, including several player shots landing in one tick. */
export const revampHullDamage = (boss: Entity, damage: number): number | undefined => {
  const state = getBossEncounter(boss);
  if (!state) return undefined;
  if (!bossCanTakeDamage(state) || !Number.isFinite(damage)) return 0;
  if (state.interactive?.shielded) {
    const engine = encounterEngines.get(boss);
    const parts = activeInteractiveParts(state.interactive);
    if (engine && parts.length) {
      const playerX = engine.player.x + engine.player.width / 2;
      const part = parts.reduce((nearest, candidate) => Math.abs(candidate.x - playerX) < Math.abs(nearest.x - playerX) ? candidate : nearest);
      damageRevampPart(engine, boss, boss.bossComponents[state.interactive.parts.indexOf(part)], damage);
    }
    return 0;
  }
  return Math.min(Math.max(0, damage) * bossDamageMultiplier(state), Math.max(0, boss.hp - bossPhaseFloor(state, boss.maxHp)));
};
export const afterRevampHullDamage = (engine: GameEngine, boss: Entity): void => {
  const state = getBossEncounter(boss);
  if (!state) return;
  if (!state.interactive?.shielded && state.phase < 3 && boss.hp <= bossPhaseFloor(state, boss.maxHp)) transition(engine, boss, state);
};

export const getRevampPartHit = (boss: Entity, box: { x: number; y: number; width: number; height: number }): BossComponentState | undefined => {
  const state = getBossEncounter(boss);
  if (!state || !bossCanTakeDamage(state)) return undefined;
  if (state.interactive) {
    for (const part of activeInteractiveParts(state.interactive)) {
      const dx = part.x - Math.max(box.x, Math.min(part.x, box.x + box.width));
      const dy = part.y - Math.max(box.y, Math.min(part.y, box.y + box.height));
      if (dx * dx + dy * dy <= part.radius * part.radius) return boss.bossComponents[state.interactive.parts.indexOf(part)];
    }
    return undefined;
  }
  if (state.part.broken) return undefined;
  const part = state.part;
  const dx = part.x - Math.max(box.x, Math.min(part.x, box.x + box.width));
  const dy = part.y - Math.max(box.y, Math.min(part.y, box.y + box.height));
  return dx * dx + dy * dy <= part.radius * part.radius ? boss.bossComponents[0] : undefined;
};

export const damageRevampPart = (engine: GameEngine, boss: Entity, component: BossComponentState, damage: number): boolean => {
  const state = getBossEncounter(boss);
  if (!state) return false;
  if (state.interactive) return damageInteractivePart(engine, boss, state, component, damage);
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
  if (state.interactive) {
    state.interactive.coreOpen = 1; state.interactive.arena.zones = [];
    for (const part of state.interactive.parts) { part.broken = true; part.active = false; updateInteractivePartDamage(part); }
    engine.invincibleTimer = Math.max(engine.invincibleTimer || 0, 120);
  }
  cancelBossHazards(engine, boss, 'defeat');
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

const damageInteractivePart = (engine: GameEngine, boss: Entity, state: BossEncounterState, component: BossComponentState, damage: number): boolean => {
  const anatomy = state.interactive!;
  const part = anatomy.parts[boss.bossComponents.indexOf(component)];
  if (!part || !part.active || part.broken || !bossCanTakeDamage(state) || !Number.isFinite(damage) || damage <= 0) return true;
  part.hp = Math.max(0, part.hp - damage);
  part.flashFrames = 3;
  engine.pulseBossComponentFlash(component, 3);
  if (part.hp <= 0) {
    part.broken = true; part.active = false; anatomy.breakCount++;
    state.stage = 'stagger'; state.remainingFrames = 72; state.attack = null; state.plan = null;
    cancelBossHazards(engine, boss, 'part-break');
    // Real pickups use the common coin path; optional VFX never awards currency.
    if (typeof engine.spawnCoin === 'function') for (let index = 0; index < 2; index++) {
      engine.spawnCoin(part.x + (index ? 7 : -7), part.y); anatomy.rewardCoins++;
    }
    if (typeof engine.spawnExplosion === 'function') engine.spawnExplosion(part.x - 12, part.y - 12, '#ffcc66', 0.65);
    if (engine.feel && typeof engine.addHitStop === 'function') engine.addHitStop(engine.feel.recordPartBreak({ frame: engine.frameCount, x: part.x, y: part.y }));
    if (typeof engine.spawnBurst === 'function') engine.spawnBurst(part.x, part.y, '#ffcc66', 8, 2.8, 3);
    revampEvents.emit('boss:part-break', { ...payload(engine, boss, state), partId: part.id,
      x: part.x, y: part.y, disablesAttackId: part.attackId, durationFrames: 72, damageMultiplier: 1.85 });
    revampEvents.emit('boss:debris', { ...payload(engine, boss, state), x: part.x, y: part.y, count: 4, color: boss.color });
    engine.playSound('explode', 0.8);
    if (interactiveLayerDestroyed(anatomy)) {
      boss.hp = Math.min(boss.hp, bossPhaseFloor(state, boss.maxHp));
      transition(engine, boss, state);
    }
  }
  syncPart(boss, state);
  return true;
};
