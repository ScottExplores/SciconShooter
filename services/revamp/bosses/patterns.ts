import { FAIR_ARENA_HEIGHT, FAIR_ARENA_WIDTH } from '../../gameplay/fairArena';
import {
  buildBossWeaveWallSlots, resolveBossGapRoute, resolveBossWeaveWallLayout
} from '../../gameplay/bosses/BossPatternRuntime';
import type { BossAttackProfile, BossWarningColor } from './catalog';

export interface BossPoint { readonly x: number; readonly y: number }
export interface BossProjectile extends BossPoint {
  readonly vx: number; readonly vy: number; readonly size: number;
}
export interface BossDangerZone extends BossPoint {
  /** Zone coordinates are top-left, matching Pixi rect and the engine adapter. */
  readonly width: number; readonly height: number; readonly durationFrames: number;
}
export interface BossPreviewLine {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly width: number;
}
export interface BossAttackPlan {
  readonly projectiles: readonly BossProjectile[];
  readonly zones: readonly BossDangerZone[];
  readonly lines: readonly BossPreviewLine[];
  readonly sockets: readonly BossPoint[];
  readonly safeRoute: BossPoint;
  readonly warningFrames: number;
  /** All surviving hazards MUST be cancelled at this age after fire. */
  readonly liveFrames: number;
  /** Quiet, vulnerable-core time AFTER liveFrames, never overlapping a new warning. */
  readonly recoveryFrames: number;
  readonly color: BossWarningColor;
}
export interface BossAttackPlanInput {
  readonly attack: BossAttackProfile;
  readonly phase: 1 | 2 | 3;
  readonly sequence: number;
  readonly origin: BossPoint;
  readonly player: BossPoint;
  readonly worldWidth?: number;
  readonly worldHeight?: number;
  readonly rage?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Warning snapshots and damaging geometry share one immutable plan. No targeting
 * is sampled again on fire, and neither DPR nor mobile/desktop enters simulation.
 */
export const createBossAttackPlan = ({
  attack, phase, sequence, origin, player,
  worldWidth = FAIR_ARENA_WIDTH, worldHeight = FAIR_ARENA_HEIGHT, rage = false
}: BossAttackPlanInput): BossAttackPlan => {
  const projectiles: BossProjectile[] = [];
  const zones: BossDangerZone[] = [];
  const lines: BossPreviewLine[] = [];
  const sockets: BossPoint[] = [{ ...origin }];
  const speed = attack.speed * (1 + (phase - 1) * 0.05 + (rage ? 0.08 : 0));
  const safeY = Math.max(worldHeight * 0.78, player.y);
  let safeRoute: BossPoint = {
    x: player.x < worldWidth / 2 ? Math.min(worldWidth - 52, player.x + 130) : Math.max(52, player.x - 130),
    y: safeY
  };
  const addProjectile = (point: BossPoint, angle: number, velocity: number, size: number) => {
    const vx = Math.cos(angle) * velocity;
    const vy = Math.sin(angle) * velocity;
    projectiles.push({ ...point, vx, vy, size });
    // Exact trajectory preview, clipped by the renderer to the arena.
    const duration = vy > 0.01 ? Math.min(240, (worldHeight - point.y) / vy) : 80;
    lines.push({ x1: point.x, y1: point.y, x2: point.x + vx * duration, y2: point.y + vy * duration, width: size });
  };

  if (attack.kind === 'aimed-fan') {
    const count = Math.min(7, attack.projectileCount + (phase === 3 ? 2 : 0));
    const aim = Math.atan2(player.y - origin.y, player.x - origin.x);
    for (let index = 0; index < count; index += 1) {
      addProjectile(origin, aim + (index - (count - 1) / 2) * 0.05, speed * 1.1, 14);
    }
  } else if (attack.kind === 'gap-ring') {
    const route = resolveBossGapRoute({
      arenaWidth: worldWidth, arenaHeight: worldHeight, originX: origin.x, originY: origin.y,
      sequence, direction: phase === 2 ? 'counterclockwise' : 'clockwise'
    });
    safeRoute = { x: route.x, y: route.y };
    const count = Math.min(24, attack.projectileCount + (phase - 1) * 2);
    for (let index = 0; index < count; index += 1) {
      const angle = Math.PI * 2 * index / count;
      const gapDistance = Math.abs(Math.atan2(Math.sin(angle - route.angleRadians), Math.cos(angle - route.angleRadians)));
      if (gapDistance >= 0.55) addProjectile(origin, angle, speed * 0.9, 13);
    }
  } else if (attack.kind === 'weave-wall') {
    // Seven columns and a two-column opening on every host, using the existing
    // mobile-safe ping-pong route rather than wrapping the gap across the arena.
    const layout = resolveBossWeaveWallLayout(worldWidth, true, sequence);
    safeRoute = { x: layout.safeGapCenterX, y: safeY };
    for (const slot of buildBossWeaveWallSlots(layout, Math.min(20, attack.projectileCount + (phase - 1) * 5), sequence)) {
      addProjectile({ x: slot.x, y: origin.y - slot.rowIndex * 38 }, Math.PI / 2, speed, 16);
    }
  } else {
    // The lock is visible for >=1.1s. Both columns commit to that old location;
    // they never track the ship while active. Each remains only 0.4–0.5s.
    const lockX = clamp(player.x, 60, worldWidth - 60);
    const top = Math.min(origin.y, worldHeight * 0.35);
    for (const side of [-1, 1]) {
      const x = lockX + side * 24;
      zones.push({ x: x - 14, y: top, width: 28, height: worldHeight - top, durationFrames: 24 + (phase - 1) * 3 });
      lines.push({ x1: x, y1: top, x2: x, y2: worldHeight, width: 28 });
    }
  }

  return Object.freeze({
    projectiles: Object.freeze(projectiles.map((value) => Object.freeze(value))),
    zones: Object.freeze(zones.map((value) => Object.freeze(value))),
    lines: Object.freeze(lines.map((value) => Object.freeze(value))),
    sockets: Object.freeze(sockets.map((value) => Object.freeze(value))),
    safeRoute: Object.freeze(safeRoute),
    warningFrames: Math.max(36, attack.telegraphFrames),
    liveFrames: 180,
    recoveryFrames: attack.recoveryFrames,
    color: attack.color
  });
};
