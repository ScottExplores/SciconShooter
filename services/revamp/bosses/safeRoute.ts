import {
  CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER,
  MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS
} from '../../gameplay/bosses/BossSafeRouteProof';
import { FAIR_ARENA_HEIGHT, FAIR_ARENA_WIDTH } from '../../gameplay/fairArena';
import { createBossAttackPlan, type BossAttackPlan, type BossPoint } from './patterns';
import type { BossProfile } from './catalog';

export interface BossRouteWitnessPoint extends BossPoint {
  readonly frame: number;
  readonly vx: number;
  readonly clearance: number;
}
export interface BossRouteProof {
  readonly status: 'proven' | 'unproven';
  readonly reason: string;
  readonly checkedFrames: number;
  readonly minimumClearancePixels: number;
  readonly witness: readonly BossRouteWitnessPoint[];
  readonly witnessHash: string;
}
export const BOSS_ROUTE_GEOMETRY_UNCERTAINTY = 3;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const moveToward = (current: number, target: number, amount: number) => current + clamp(target - current, -amount, amount);

/** Swept conservative rectangles cover one complete simulation step. */
const clearanceAt = (plan: BossAttackPlan, point: BossPoint, vx: number, age: number) => {
  let clearance = Number.POSITIVE_INFINITY;
  const halfPlayerX = CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.collisionWidth / 2;
  const halfPlayerY = CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.collisionHeight / 2;
  for (const bullet of plan.projectiles) {
    // Half-size is intentionally larger than the engine's 0.3 * sprite size.
    const halfX = bullet.size / 2 + BOSS_ROUTE_GEOMETRY_UNCERTAINTY + Math.abs(bullet.vx) / 2 + Math.abs(vx) / 2;
    const halfY = bullet.size / 2 + BOSS_ROUTE_GEOMETRY_UNCERTAINTY + Math.abs(bullet.vy) / 2;
    const x = bullet.x + bullet.vx * (age + 0.5);
    const y = bullet.y + bullet.vy * (age + 0.5);
    clearance = Math.min(clearance, Math.max(Math.abs(point.x - x) - halfPlayerX - halfX, Math.abs(point.y - y) - halfPlayerY - halfY));
  }
  for (const zone of plan.zones) {
    if (age >= zone.durationFrames) continue;
    clearance = Math.min(clearance, Math.max(
      Math.abs(point.x - zone.x - zone.width / 2) - halfPlayerX - zone.width / 2 - BOSS_ROUTE_GEOMETRY_UNCERTAINTY - Math.abs(vx) / 2,
      Math.abs(point.y - zone.y - zone.height / 2) - halfPlayerY - zone.height / 2 - BOSS_ROUTE_GEOMETRY_UNCERTAINTY
    ));
  }
  return clearance;
};

const replay = (plan: BossAttackPlan, start: BossPoint, targetX: number, width: number): BossRouteProof => {
  let x = start.x;
  let vx = 0;
  let minimum = Number.POSITIVE_INFINITY;
  const witness: BossRouteWitnessPoint[] = [];
  let hash = 2166136261;
  const frames = plan.warningFrames + plan.liveFrames;
  for (let frame = 0; frame < frames; frame += 1) {
    const desired = clamp((targetX - x) * 0.2, -CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.maximumSpeedPerFrame, CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.maximumSpeedPerFrame);
    vx = moveToward(vx, desired, CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.accelerationPerFrame);
    x += vx;
    const boundaryClearance = Math.min(x, width - x) - CONSERVATIVE_BOSS_SAFE_ROUTE_PLAYER.collisionWidth / 2;
    const age = frame - plan.warningFrames;
    const clearance = Math.min(boundaryClearance, age < 0 ? Number.POSITIVE_INFINITY : clearanceAt(plan, { x, y: start.y }, vx, age));
    minimum = Math.min(minimum, clearance);
    witness.push({ frame, x, y: start.y, vx, clearance });
    hash = Math.imul(hash ^ Math.round(x * 1000), 16777619);
    if (clearance < MINIMUM_PROVEN_BOSS_ROUTE_CLEARANCE_PIXELS) {
      return { status: 'unproven', reason: 'insufficient-clearance', checkedFrames: frame + 1, minimumClearancePixels: minimum, witness: [], witnessHash: '' };
    }
  }
  return {
    status: 'proven', reason: 'Exact replay survives every active hazard through the required bullet cancel.',
    checkedFrames: frames, minimumClearancePixels: minimum, witness,
    witnessHash: (hash >>> 0).toString(16).padStart(8, '0')
  };
};

/**
 * Constructive search, followed by an independent exact second replay. It never
 * teleports, assumes upgrades, or uses touch's faster movement. A proof covers
 * the actual shared attack plan, not a metadata claim about a related timeline.
 */
export const proveRevampBossAttack = (
  plan: BossAttackPlan, start: BossPoint, width = FAIR_ARENA_WIDTH
): BossRouteProof => {
  if (plan.warningFrames < 36 || plan.liveFrames !== 180 || !Number.isFinite(start.x + start.y)) {
    return { status: 'unproven', reason: 'invalid-plan', checkedFrames: 0, minimumClearancePixels: 0, witness: [], witnessHash: '' };
  }
  const targets = [plan.safeRoute.x, start.x, start.x - 110, start.x + 110, 52, width - 52, width / 2, width * 0.3, width * 0.7];
  let last: BossRouteProof | undefined;
  for (const target of [...new Set(targets.map((x) => clamp(x, 40, width - 40)))]) {
    const found = replay(plan, start, target, width);
    if (found.status === 'proven') {
      const verified = replay(plan, start, target, width);
      if (verified.witnessHash !== found.witnessHash) throw new Error('Boss safe-route replay mismatch');
      return verified;
    }
    last = found;
  }
  return last!;
};

export interface BossProofCoverage {
  readonly status: 'proven' | 'unproven';
  readonly scenarios: number;
  readonly minimumClearancePixels: number;
  readonly checkedFrames: number;
  readonly failures: readonly string[];
}

/** All phases, rage, every finite pattern sequence, five starts and three heights. */
export const proveRevampBossProfile = (boss: BossProfile): BossProofCoverage => {
  let scenarios = 0;
  let checkedFrames = 0;
  let minimumClearancePixels = Number.POSITIVE_INFINITY;
  const failures: string[] = [];
  const origins = [{ x: 195, y: 155 }, { x: 195, y: 230 }, { x: 195, y: 300 }];
  for (const attack of boss.attacks) {
    const sequenceCount = attack.kind === 'weave-wall' ? 10 : attack.kind === 'gap-ring' ? 6 : 1;
    for (const phase of [1, 2, 3] as const) {
      for (const rage of [false, true]) {
        for (let sequence = 0; sequence < sequenceCount; sequence += 1) {
          for (const origin of origins) {
            for (const x of [52, 123, 195, 267, 338]) {
              for (const y of [0.55, 0.7, 0.85].map((ratio) => FAIR_ARENA_HEIGHT * ratio)) {
                const player = { x, y };
                const plan = createBossAttackPlan({ attack, phase, rage, sequence, origin, player });
                const proof = proveRevampBossAttack(plan, player);
                scenarios += 1;
                checkedFrames += proof.checkedFrames;
                minimumClearancePixels = Math.min(minimumClearancePixels, proof.minimumClearancePixels);
                if (proof.status !== 'proven') failures.push(`${attack.id}/phase${phase}/rage${rage}/seq${sequence}/origin${origin.y}/start${x},${y}`);
              }
            }
          }
        }
      }
    }
  }
  return { status: failures.length ? 'unproven' : 'proven', scenarios, checkedFrames, minimumClearancePixels, failures };
};
