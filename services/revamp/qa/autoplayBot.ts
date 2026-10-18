/** Inputs use world coordinates and simulation frames, never wall-clock or viewport size. */
export interface BotEntity {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy?: number;
  hp?: number;
  markedForDeletion?: boolean;
  isPlayerShot?: boolean;
  isTelegraph?: boolean;
}

export interface AutoplayWorld {
  width: number;
  height: number;
  frameCount: number;
  player: Pick<BotEntity, 'x' | 'y' | 'width' | 'height'>;
  entities: readonly BotEntity[];
  getPlayerMovementSpeed?: () => number;
}

export const isQAEnemy = (entity: BotEntity) => (
  entity.type.startsWith('ENEMY_') || entity.type === 'BOSS' || entity.type === 'MINI_BOSS'
);

export const isQAEnemyBullet = (entity: BotEntity) => (
  entity.type === 'PROJECTILE' && !entity.isPlayerShot && !entity.isTelegraph
);

export const isQAOnScreen = (entity: BotEntity, width: number, height: number) => (
  !entity.markedForDeletion
  && entity.x + entity.width > 0 && entity.x < width
  && entity.y + entity.height > 0 && entity.y < height
);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const DIRECTIONS = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;

/**
 * Small reactive pilot: sweep below enemies, predict nearby bullet paths, and
 * choose the safest normal keyboard direction. It receives no hidden spawns,
 * teleports, buffs, or simulation speed changes. Boss pattern mastery is outside
 * its scope; failed runs are useful QA evidence. Fixed input state => fixed output.
 */
export function getAutoplayInput(world: AutoplayWorld, seed = 1701): Record<string, boolean> {
  const { player, width, height, frameCount } = world;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  const marginX = Math.max(24, player.width * 0.65);
  const marginY = Math.max(30, player.height * 0.65);
  const sweep = 0.5 + Math.sin(frameCount / 135 + (seed >>> 0) % 97) * 0.33;
  let targetX = width * sweep;
  const targetY = height * 0.79;
  let nearestEnemy: BotEntity | null = null;
  let nearestDistance = Infinity;
  const hazards: BotEntity[] = [];

  for (const entity of world.entities) {
    if (entity.markedForDeletion || entity.isPlayerShot || !isQAOnScreen(entity, width, height)) continue;
    if (isQAEnemy(entity) && (entity.hp ?? 1) > 0 && entity.y < py - 80) {
      const distance = Math.abs(entity.x + entity.width / 2 - px) + Math.abs(entity.y - py) * 0.1;
      if (distance < nearestDistance) {
        nearestEnemy = entity;
        nearestDistance = distance;
      }
    }
    if (isQAEnemyBullet(entity) || (isQAEnemy(entity) && entity.y + entity.height > py - 180)) {
      hazards.push(entity);
    }
  }
  if (nearestEnemy) targetX = (nearestEnemy.x + nearestEnemy.width / 2) * 0.72 + targetX * 0.28;
  targetX = clamp(targetX, marginX, width - marginX);
  const speed = Math.max(1, world.getPlayerMovementSpeed?.() ?? 3);
  let best: typeof DIRECTIONS[number] = DIRECTIONS[0];
  let bestCost = Infinity;

  for (const direction of DIRECTIONS) {
    const length = Math.hypot(direction[0], direction[1]) || 1;
    const vx = direction[0] / length * speed;
    const vy = direction[1] / length * speed;
    const futureX = px + vx * 18;
    const futureY = py + vy * 18;
    let cost = Math.hypot(futureX - targetX, (futureY - targetY) * 1.3) * 0.045;
    if (futureX < marginX || futureX > width - marginX || futureY < height * 0.48 || futureY > height - marginY) cost += 250;
    for (const hazard of hazards) {
      // Closest relative approach over the next 0.4 s; a stationary mine is a threat too.
      const dx = hazard.x + hazard.width / 2 - px;
      const dy = hazard.y + hazard.height / 2 - py;
      const rvx = (hazard.vx ?? 0) - vx;
      const rvy = (hazard.vy ?? 0) - vy;
      const t = clamp(-(dx * rvx + dy * rvy) / (rvx * rvx + rvy * rvy || 1), 0, 24);
      const clearanceX = Math.max(0, Math.abs(dx + rvx * t) - hazard.width / 2 - player.width * 0.28);
      const clearanceY = Math.max(0, Math.abs(dy + rvy * t) - hazard.height / 2 - player.height * 0.28);
      const clearance = Math.hypot(clearanceX, clearanceY);
      if (clearance < 100) cost += 500 / (clearance + 3) * (1 - t / 48);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = direction;
    }
  }
  return {
    ' ': true,
    ArrowLeft: best[0] < 0,
    ArrowRight: best[0] > 0,
    ArrowUp: best[1] < 0,
    ArrowDown: best[1] > 0
  };
}
