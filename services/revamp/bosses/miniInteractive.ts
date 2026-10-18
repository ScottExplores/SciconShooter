import type { BossComponentState, Entity, GameEngine } from '../../gameLogic';
import { revampEvents } from '../events';
import { isInteractiveMiniId } from './labRoster';
import { getRevampBoss } from './catalog';
import { createBossAttackPlan, type BossAttackPlan } from './patterns';

export interface MiniInteractivePart {
  id: 'left-cannon' | 'right-cannon';
  kind: 'cannon' | 'generator';
  hp: number; maxHp: number; broken: boolean;
  x: number; y: number; radius: number;
}
export interface MiniInteractiveState {
  ageFrames: number;
  phase: 1 | 2;
  openAmount: number;
  parts: MiniInteractivePart[];
  stage: 'intro' | 'warning' | 'fire' | 'recovery' | 'transition';
  transitionFrames: number;
  lastFrame: number;
  wall: boolean;
  defeated?: boolean;
  generation?: number;
  drone?: { remainingFrames: number; sequence: number; plan: BossAttackPlan | null };
}
const states = new WeakMap<object, MiniInteractiveState>();
const warnings = new WeakMap<Entity, Map<string, { start: number; last: number }>>();
export const interactiveMiniGeneration = (boss: Entity) => states.get(boss)?.generation ?? 0;
export const interactiveMiniSocket = (boss: Entity, xRatio: number, yRatio: number) => {
  const mirror = boss.miniBossLabWallSide === 'right' ? -1 : 1;
  const x = (xRatio - 0.5) * boss.width * mirror;
  const y = (yRatio - 0.5) * boss.height;
  const angle = boss.bossPresentationBankRadians || 0;
  return { x: boss.x + boss.width / 2 + x * Math.cos(angle) - y * Math.sin(angle),
    y: boss.y + boss.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) };
};
const syncMiniPose = (boss: Entity, state: MiniInteractiveState) => {
  state.parts.forEach((part, index) => {
    const component = boss.bossComponents?.[index];
    if (!component) return;
    Object.assign(part, interactiveMiniSocket(boss, component.centerXRatio, component.centerYRatio));
  });
};
export const getInteractiveMini = (entity: Entity) => {
  const state = states.get(entity);
  // Sample live sockets after original choreography moves the hull, including for collision.
  if (state) syncMiniPose(entity, state);
  return state;
};

/** Existing paired/guardian/wall choreography remains authoritative. Only the primary
 * hardware gets this two-stage shell; guards already have their own HP and attacks. */
export function attachInteractiveMini(engine: GameEngine, boss: Entity): void {
  if (!isInteractiveMiniId(boss.sourceItemId) || boss.sourceEventId?.startsWith('sandbox')) return;
  // The first-minute teaching encounter already has its authored plate -> core gate.
  if (boss.sourceEventId?.endsWith('-revamp-peer-reviewer')) return;
  if (boss.miniBossLabRole && !['primary', 'leader', 'partner', 'sentry-west', 'sentry-north'].includes(boss.miniBossLabRole)) return;
  const wall = boss.sourceItemId === 'paywall-wall';
  // Wall segments are already individually destructible armaments, with original art.
  const partHp = Math.max(1, boss.maxHp * 0.09);
  const parts: MiniInteractivePart[] = wall ? [] : (['left-cannon', 'right-cannon'] as const).map((id, index) => ({
    id, kind: index === 0 ? 'cannon' : 'generator', hp: partHp, maxHp: partHp,
    broken: false, x: 0, y: 0, radius: Math.min(14, boss.width * 0.1)
  }));
  // Reviewed short/rotated hulls need supports above their transparent canvas edge.
  const partYRatio = ['bottleneck-drone', 'railspine-wallcrawler', 'gridline-sentries'].includes(boss.sourceItemId ?? '')
    ? 0.68 : boss.sourceItemId === 'aegis-convoy-captain' ? 0.74 : 0.9;
  states.set(boss, { ageFrames: 0, phase: 1, openAmount: 0, parts, stage: 'intro', transitionFrames: 0, lastFrame: -1, wall,
    ...(boss.sourceItemId === 'bottleneck-drone' ? { drone: { remainingFrames: 72, sequence: 0, plan: null } } : {}) });
  if (!wall) boss.bossComponents = parts.map((part, index) => ({
    id: part.id, label: index === 0 ? 'Support cannon' : 'Shield generator', hp: partHp, maxHp: partHp,
    centerXRatio: index === 0 ? 0.27 : 0.73, centerYRatio: partYRatio,
    widthRatio: part.radius * 2 / boss.width, heightRatio: part.radius * 2 / boss.height,
    destroyed: false, exposed: false, flashFrames: 0, lastDamageFlashFrame: -999
  }));
  updateInteractiveMini(engine, boss);
}

export function updateInteractiveMini(engine: GameEngine, boss: Entity): void {
  const state = states.get(boss);
  if (!state || state.lastFrame === engine.frameCount) return;
  state.lastFrame = engine.frameCount;
  state.ageFrames++;
  state.transitionFrames = Math.max(0, state.transitionFrames - 1);
  if (state.wall && boss.hp <= boss.maxHp * 0.5) state.phase = 2;
  const visual = boss.miniBossLabVisualState as string | undefined;
  if (!state.drone) state.stage = state.transitionFrames > 0 ? 'transition'
    : state.ageFrames < 72 || boss.y < 0 ? 'intro'
    : boss.isCharging ? 'warning'
    : visual === 'recovery' || (state.phase === 2 && state.ageFrames % 180 < 60) ? 'recovery' : 'fire';
  const open = state.phase === 2 && (state.stage === 'recovery' || state.stage === 'warning');
  state.openAmount = Math.max(0, Math.min(1, state.openAmount + (open ? 1 : -1) / 12));
  if (!state.wall) boss.bossWeakPointOpen = state.openAmount >= 0.8;
  for (const [index, part] of state.parts.entries()) {
    const component = boss.bossComponents?.[index];
    if (!component) continue;
    Object.assign(part, interactiveMiniSocket(boss, component.centerXRatio, component.centerYRatio));
    component.hp = part.hp;
    component.destroyed = part.broken;
    component.exposed = miniCanDamage(boss, state) && !part.broken;
  }
}

/** The small drone teaches one locked fan and one opening core ring. Uses C's
 * proven plan geometry; each shot comes from the live, attached cannon/core. */
export function updateInteractiveDrone(engine: GameEngine, boss: Entity): boolean {
  const state = states.get(boss);
  const drone = state?.drone;
  if (!state || !drone) return false;
  boss.vx = boss.vy = 0;
  if (state.stage === 'intro') {
    const t = Math.min(1, state.ageFrames / 72);
    boss.y = -boss.height + (boss.height + 110) * (1 - Math.pow(1 - t, 3));
  }
  if (state.transitionFrames > 0) { drone.remainingFrames = 1; return true; }
  if (--drone.remainingFrames > 0) return true;
  if (state.stage === 'warning' && drone.plan) {
    state.stage = 'fire'; drone.remainingFrames = drone.plan.liveFrames;
    boss.isCharging = false;
    drone.plan.projectiles.forEach((shot, index) => engine.spawnGeneratedBossProjectile(boss, shot.x, shot.y,
      Math.atan2(shot.vy, shot.vx), Math.hypot(shot.vx, shot.vy), '#ffcc66', shot.size, index));
    engine.playSound('boss_shoot', 0.6);
    return true;
  }
  if (state.stage === 'fire') {
    state.stage = 'recovery'; drone.remainingFrames = 72;
    for (const entity of engine.entities) if (entity.bossOwnerId === boss.id && !entity.isPlayerShot) entity.markedForDeletion = true;
    return true;
  }
  const cannon = state.parts.find(part => part.kind === 'cannon' && !part.broken);
  const attack = getRevampBoss('gatekeeper-prime')!.attacks[cannon && drone.sequence % 2 === 0 ? 0 : 1];
  const origin = attack.kind === 'aimed-fan' && cannon ? cannon
    : { x: boss.x + boss.width / 2, y: boss.y + boss.height * 0.68 };
  drone.plan = createBossAttackPlan({ origin, attack, phase: state.phase, sequence: drone.sequence++, rage: false,
    player: { x: engine.player.x + engine.player.width / 2, y: engine.player.y + engine.player.height / 2 },
    worldWidth: engine.width, worldHeight: engine.height });
  state.stage = 'warning'; drone.remainingFrames = drone.plan.warningFrames; boss.isCharging = true;
  engine.playSound('boss_alert', 0.55);
  return true;
}

const miniCanDamage = (boss: Entity, state: MiniInteractiveState) => state.stage !== 'intro'
  && state.stage !== 'transition' && !boss.markedForDeletion && boss.hp > 0
  && (!boss.miniBossLabEncounterId || boss.miniBossLabDamageable);

export function getInteractiveMiniHit(boss: Entity, box: { x: number; y: number; width: number; height: number }): BossComponentState | undefined {
  const state = getInteractiveMini(boss);
  if (!state || !miniCanDamage(boss, state)) return undefined;
  for (const [index, part] of state.parts.entries()) {
    if (part.broken) continue;
    const dx = part.x - Math.max(box.x, Math.min(part.x, box.x + box.width));
    const dy = part.y - Math.max(box.y, Math.min(part.y, box.y + box.height));
    if (dx * dx + dy * dy <= part.radius * part.radius) return boss.bossComponents?.[index];
  }
  return undefined;
}

export function damageInteractiveMiniPart(engine: GameEngine, boss: Entity, component: BossComponentState, damage: number): boolean {
  const state = states.get(boss);
  if (!state || state.wall) return false;
  const part = state.parts.find(part => part.id === component.id);
  if (!part || part.broken || !miniCanDamage(boss, state) || !Number.isFinite(damage)) return true;
  part.hp = Math.max(0, part.hp - Math.max(0, damage));
  component.hp = part.hp;
  engine.pulseBossComponentFlash(component);
  if (part.hp > 0) return true;
  part.broken = component.destroyed = true;
  state.generation = (state.generation ?? 0) + 1;
  warnings.delete(boss);
  component.exposed = false;
  // Every queued/active hazard is cancelled before the quiet shell opening.
  for (const hazard of engine.entities) {
    if (hazard.bossOwnerId === boss.id && !hazard.isPlayerShot) hazard.markedForDeletion = true;
  }
  engine.spawnExplosion(part.x - 8, part.y - 8, '#ffcc66', 0.6);
  engine.spawnCoin(part.x, part.y);
  engine.addHitStop(engine.feel.recordPartBreak({ frame: engine.frameCount, x: part.x, y: part.y }));
  engine.playSound('explode', 0.65);
  revampEvents.emit('boss:part-break', { bossId: boss.sourceItemId, entityId: boss.id, partId: part.id,
    frame: engine.frameCount, phase: state.phase, x: part.x, y: part.y, mini: true });
  state.transitionFrames = 48;
  state.stage = 'transition';
  if (state.parts.every(part => part.broken)) {
    state.phase = 2;
    // Shell damage counts toward the encounter budget instead of doubling its TTK.
    boss.hp = Math.min(boss.hp, boss.maxHp * 0.6);
    boss.activeBossPhaseIndex = 1;
    boss.activeBossPhaseId = 'revamp-mini-core';
    engine.invincibleTimer = Math.max(engine.invincibleTimer, 48);
    engine.playSound('phase_change', 0.6);
  }
  return true;
}

/** A centred shot still chips visible armour, so fixed autofire cannot soft-lock. */
export function absorbInteractiveMiniHull(engine: GameEngine, boss: Entity, damage: number): boolean {
  const state = states.get(boss);
  if (!state || state.wall) return false;
  if (!miniCanDamage(boss, state)) return true;
  const part = state.parts.find(part => !part.broken);
  if (!part) return false;
  const component = boss.bossComponents?.find(component => component.id === part.id);
  if (component) damageInteractiveMiniPart(engine, boss, component, damage);
  return true;
}

/** Signature remains owned by the core. Breaking the cannon removes the supporting
 * attack, including queued rounds. Guardians without added hardware keep their rules. */
export function interactiveMiniCanEmit(boss: Entity, support = false, generation?: number): boolean {
  const state = states.get(boss);
  if (!state) return true;
  if (generation !== undefined && generation !== (state.generation ?? 0)) return false;
  if (state.stage === 'intro' || state.transitionFrames > 0) return false;
  return !support || !state.parts.some(part => part.kind === 'cannon' && part.broken);
}

/** Original mini clocks keep moving during a shell break. A live sampled beat can
 * only resume after this same weapon actually showed another full warning. */
export function acceptInteractiveMiniHazard(boss: Entity, attackId: string, warning: boolean, frame: number, support: boolean): boolean {
  if (!states.has(boss)) return true;
  if (!interactiveMiniCanEmit(boss, support)) return false;
  let armed = warnings.get(boss);
  if (!armed) { armed = new Map(); warnings.set(boss, armed); }
  const receipt = armed.get(attackId);
  if (warning) {
    armed.set(attackId, { start: receipt && frame - receipt.last <= 2 ? receipt.start : frame, last: frame });
    return true;
  }
  return Boolean(receipt && frame - receipt.start >= 36);
}

export function defeatInteractiveMini(engine: GameEngine, boss: Entity): void {
  const state = states.get(boss);
  if (!state || state.defeated) return;
  state.defeated = true;
  revampEvents.emit('boss:member-defeat', { bossId: boss.sourceItemId, entityId: boss.id,
    frame: engine.frameCount, phase: state.phase, mini: true });
  state.parts.forEach(part => { part.broken = true; part.hp = 0; });
  engine.invincibleTimer = Math.max(engine.invincibleTimer, state.wall ? 18 : 72);
  for (const hazard of engine.entities) {
    if (hazard.bossOwnerId === boss.id && !hazard.isPlayerShot) hazard.markedForDeletion = true;
  }
}
