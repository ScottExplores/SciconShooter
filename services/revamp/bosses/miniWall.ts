import type { Entity, GameEngine } from '../../gameLogic';
import { getInteractiveMini } from './miniInteractive';

interface WallFire { event: string; sequence: number; total: number; next: number; pending?: Entity; fireAt: number; lastFrame: number }
const encounters = new WeakMap<GameEngine, WallFire>();

/** Preserve the rigid original wall and individually destructible segments. Every
 * surviving vent now owns a full 0.8s charge before its single committed volley. */
export function updateInteractiveWallFire(engine: GameEngine, invaders: Entity[]): boolean {
  const segments = invaders.filter(entity => getInteractiveMini(entity)?.wall);
  if (!segments.length) return false;
  const event = segments[0].sourceEventId ?? '';
  let fire = encounters.get(engine);
  if (!fire || fire.event !== event || engine.frameCount < fire.lastFrame) {
    fire = { event, sequence: 0, total: segments.length, next: engine.frameCount + 60, fireAt: 0, lastFrame: engine.frameCount };
    encounters.set(engine, fire);
  }
  fire.lastFrame = engine.frameCount;
  const secondForm = segments.length <= Math.ceil(fire.total / 2);
  if (secondForm) for (const segment of segments) getInteractiveMini(segment)!.phase = 2;
  const shooter = fire.pending;
  if (shooter) {
    if (!segments.includes(shooter) || shooter.markedForDeletion || shooter.hp <= 0 || shooter.y < 0 || shooter.y + shooter.height > engine.height * 0.55) {
      shooter.isCharging = false; fire.pending = undefined; fire.next = engine.frameCount + 60;
    } else if (engine.frameCount >= fire.fireAt) {
      const offsets = secondForm ? [-0.12, 0.12] : [0];
      for (const [index, offset] of offsets.entries()) engine.spawnGeneratedBossProjectile(shooter,
        shooter.x + shooter.width / 2, shooter.y + shooter.height, Math.PI / 2 + offset,
        Math.min(4.2, shooter.projectileSpeed ?? 4.2), '#ffcc66', 12, index);
      shooter.isCharging = false; fire.pending = undefined; fire.next = engine.frameCount + 66;
      engine.playSound('boss_shoot', 0.6);
    }
  } else if (engine.frameCount >= fire.next) {
    const eligible = segments.filter(segment => segment.y >= 0 && segment.y + segment.height < engine.height * 0.55);
    if (!eligible.length) return true;
    fire.pending = eligible[fire.sequence++ % eligible.length];
    fire.pending.isCharging = true; fire.fireAt = engine.frameCount + 48;
    engine.playSound('boss_alert', 0.45);
  }
  return true;
}
