import type { BossProfile } from './catalog';
import { createBossAttackPlan, type BossAttackPlan, type BossAttackPlanInput, type BossDangerZone, type BossPoint } from './patterns';

/** REVAMP(O): Fixed-step anatomy shared by combat and the retained Pixi overlay. */
export interface InteractiveBossPart {
  id: string; name: string; hp: number; maxHp: number; broken: boolean;
  x: number; y: number; radius: number; xRatio: number; yRatio: number;
  kind: 'cannon' | 'generator' | 'armor'; layer: 1 | 2;
  damageState: 'intact' | 'cracked' | 'smoking' | 'destroyed';
  active: boolean; attackId: string; flashFrames: number;
}
export interface InteractiveBossState {
  scale: 'major' | 'mini'; parts: InteractiveBossPart[]; layer: 1 | 2 | 3;
  shielded: boolean; coreOpen: number; coreX: number; coreY: number; coreRadius: number;
  hatchStage: 'closed' | 'opening' | 'open' | 'closing'; hatchOpen: number;
  hangarX: number; hangarY: number; transform: number;
  arena: { kind: 'clear' | 'walls' | 'grid' | 'debris'; pattern: 'walls' | 'sweep' | 'chevron'; phase: number; warningFrames: number;
    activeFrames: number; safeLaneX: number; safeLaneWidth: number; zones: readonly BossDangerZone[] };
  escorts: { id: string; x: number; y: number; stage: 'deploy' | 'active' | 'exit' }[];
  ownerPartId: string | null; attackMode: 'weapon' | 'arena' | 'summon';
  breakCount: number; rewardCoins: number;
}

export const createInteractiveBossState = (definition: BossProfile, maxHp: number, scale: 'major' | 'mini' = 'major'): InteractiveBossState => {
  const names = [definition.part.name, 'Shield Generator', 'Inner Battery', 'Reactor Armor'];
  const firstLeft = definition.part.side === 'left';
  const parts = (scale === 'major' ? [0, 1, 2, 3] : [0, 1]).map((index): InteractiveBossPart => {
    const layer = index < 2 ? 1 : 2;
    const ratio = layer === 1 ? 0.14 : 0.12;
    const left = index % 2 === 0 ? firstLeft : !firstLeft;
    const hp = Math.max(1, maxHp * ratio);
    // Broad, shallow sprites have transparent lower canvas; mount on their painted chassis.
    const yRatio = definition.sourceBossId === 'frontier-crownclaw' ? (layer === 1 ? 0.66 : 0.70)
      : ['orbit-gyroscope', 'hammerhead-siege'].includes(definition.sourceBossId) ? (layer === 1 ? 0.68 : 0.72)
      : layer === 1 ? 0.94 : 0.98;
    return {
      id: index === 0 ? definition.part.id : `${definition.id}:armament-${index}`,
      name: names[index], hp, maxHp: hp, broken: false, x: 0, y: 0, radius: scale === 'major' ? 19 : 13,
      xRatio: left ? (layer === 1 ? 0.27 : 0.38) : (layer === 1 ? 0.73 : 0.62),
      yRatio, kind: ['cannon', 'generator', 'cannon', 'armor'][index] as InteractiveBossPart['kind'],
      layer, damageState: 'intact', active: layer === 1, attackId: definition.attacks[index].id, flashFrames: 0
    };
  });
  return { scale, parts, layer: 1, shielded: true, coreOpen: 0, coreX: 0, coreY: 0, coreRadius: 22,
    hatchStage: 'closed', hatchOpen: 0, hangarX: 0, hangarY: 0, transform: 0,
    arena: { kind: 'clear', pattern: 'walls', phase: 1, warningFrames: 0, activeFrames: 0, safeLaneX: 195, safeLaneWidth: 190, zones: [] },
    escorts: [], ownerPartId: null, attackMode: 'weapon', breakCount: 0, rewardCoins: 0 };
};

export const updateInteractivePartDamage = (part: InteractiveBossPart): void => {
  part.damageState = part.broken ? 'destroyed' : part.hp <= part.maxHp * 0.3 ? 'smoking'
    : part.hp <= part.maxHp * 0.65 ? 'cracked' : 'intact';
};
export const activeInteractiveParts = (state: InteractiveBossState): InteractiveBossPart[] => state.parts.filter(part => part.active && !part.broken);
export const interactiveLayerDestroyed = (state: InteractiveBossState): boolean => state.parts.filter(part => part.layer === state.layer).every(part => part.broken);
export const setInteractiveLayer = (state: InteractiveBossState, phase: 1 | 2 | 3): void => {
  state.layer = phase;
  state.shielded = phase < (state.scale === 'mini' ? 2 : 3);
  for (const part of state.parts) part.active = part.layer === phase && !part.broken;
  state.arena.phase = phase;
  state.arena.kind = phase === 1 ? 'clear' : phase === 2 ? 'walls' : 'grid';
  state.arena.zones = []; state.arena.warningFrames = state.arena.activeFrames = 0;
};

/** Independent arena sentence: no C projectiles coexist with its generous central lane. */
export const createInteractiveArenaPlan = (phase: 1 | 2 | 3, sequence: number, width = 390, height = 844, origin: BossPoint = { x: width / 2, y: 300 }): BossAttackPlan => {
  if (phase === 3 && sequence % 8 === 6) {
    const projectiles = [0, 1].flatMap(row => [26, 66, 106, width - 106, width - 66, width - 26].map(x =>
      Object.freeze({ x, y: 300 - Math.abs(x - width / 2) * 0.3 - row * 66, vx: 0, vy: 2.7, size: 16 })));
    return Object.freeze({ projectiles: Object.freeze(projectiles), zones: Object.freeze([]),
      lines: Object.freeze(projectiles.map(shot => Object.freeze({ x1: shot.x, y1: shot.y, x2: shot.x, y2: height, width: shot.size }))),
      sockets: Object.freeze([Object.freeze({ ...origin })]), safeRoute: Object.freeze({ x: width / 2, y: height * 0.8 }),
      warningFrames: 84, liveFrames: 180, recoveryFrames: 84, color: 'amber' });
  }
  const gap = phase === 2 ? 206 : 98;
  const center = width / 2 + (phase === 2 ? (sequence % 2 === 0 ? -12 : 12) : 0);
  const left = center - gap / 2; const right = center + gap / 2;
  const zones: BossDangerZone[] = [
    { x: 0, y: 400, width: left, height: height - 400, durationFrames: 72 },
    { x: right, y: 400, width: width - right, height: height - 400, durationFrames: 72 }
  ];
  return Object.freeze({ projectiles: Object.freeze([]), zones: Object.freeze(zones.map(zone => Object.freeze(zone))),
    lines: Object.freeze(phase === 3 ? [-1, 1].map(side => {
      const angle = Math.PI / 2 + side * Math.PI / 6;
      return Object.freeze({ x1: origin.x, y1: origin.y, x2: origin.x + Math.cos(angle) * 1000, y2: origin.y + Math.sin(angle) * 1000, width: 14 });
    }) : zones.map(zone => Object.freeze({ x1: zone.x + zone.width / 2, y1: zone.y, x2: zone.x + zone.width / 2, y2: height, width: zone.width }))),
    sockets: Object.freeze(phase === 3 ? [Object.freeze({ ...origin })] : [Object.freeze({ x: left, y: 370 }), Object.freeze({ x: right, y: 370 })]), safeRoute: Object.freeze({ x: center, y: height * 0.8 }),
    warningFrames: 84, liveFrames: 180, recoveryFrames: 84, color: phase === 2 ? 'amber' : 'magenta' });
};

/** A lower side-mounted prism needs a broader aperture than C's high central ring. */
export const createInteractiveWeaponPlan = (input: BossAttackPlanInput): BossAttackPlan => {
  const warning = input.origin.y > 330 ? 108 : input.attack.telegraphFrames;
  const plan = createBossAttackPlan({ ...input, attack: { ...input.attack, telegraphFrames: Math.max(input.attack.telegraphFrames, warning) } });
  if (input.attack.kind !== 'gap-ring') return plan;
  const angle = Math.atan2(plan.safeRoute.y - input.origin.y, plan.safeRoute.x - input.origin.x);
  const keep = plan.projectiles.map(shot => Math.abs(Math.atan2(Math.sin(Math.atan2(shot.vy, shot.vx) - angle), Math.cos(Math.atan2(shot.vy, shot.vx) - angle))) >= 1.05);
  return Object.freeze({ ...plan, projectiles: Object.freeze(plan.projectiles.filter((_, index) => keep[index])),
    lines: Object.freeze(plan.lines.filter((_, index) => keep[index])) });
};
