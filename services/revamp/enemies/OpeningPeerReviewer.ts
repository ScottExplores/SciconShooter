import type { Entity, GameEngine } from '../../gameLogic';
import type { EnemyTelegraph } from './EnemyBehaviorRuntime';

export const isOpeningPeerReviewer = (enemy: Pick<Entity, 'sourceEventId'>) =>
  Boolean(enemy.sourceEventId?.endsWith('-revamp-peer-reviewer'));

interface PeerState {
  age: number;
  visibleAge: number;
  shieldHp: number;
  nextShot: number;
  charge?: { start: number; x: number; y: number };
}

/** A small teaching encounter; later campaign bosses keep their existing runtimes. */
export class OpeningPeerReviewer {
  private states = new WeakMap<Entity, PeerState>();
  private visuals: EnemyTelegraph[] = [];
  clear() { this.states = new WeakMap(); this.visuals = []; }
  getTelegraphs() { return this.visuals; }
  beginFrame() { this.visuals = []; }

  update(engine: GameEngine, boss: Entity, fire: (target: {x: number; y: number}) => void) {
    if (!isOpeningPeerReviewer(boss)) return false;
    let state = this.states.get(boss);
    if (!state) {
      state = { age: 0, visibleAge: 0, shieldHp: 8, nextShot: 180 };
      this.states.set(boss, state);
      boss.text = 'PEER REVIEWER';
      engine.spawnFloatingText(engine.width / 2, 100, 'PEER REVIEWER', '#fde68a', 20);
    }
    state.age++;
    if (boss.y + boss.height / 2 >= 0) state.visibleAge++;
    if (boss.y < 96) {
      boss.vy = 1.8;
    } else {
      boss.vy = 0;
      boss.x += ((engine.width - boss.width) / 2 + Math.sin(state.age / 90) * 34 - boss.x) * 0.035;
    }
    const center = { x: boss.x + boss.width / 2, y: boss.y + boss.height * 0.74 };
    if (state.shieldHp > 0) {
      this.visuals.push({ kind: 'shield', ...center, radius: boss.width * 0.5 });
    }
    if (state.age >= state.nextShot && state.visibleAge >= 42 && !state.charge && boss.y >= 80) {
      state.charge = { start: state.age, x: engine.player.x + engine.player.width / 2,
        y: engine.player.y + engine.player.height / 2 };
    }
    if (state.charge) {
      const progress = (state.age - state.charge.start) / 48;
      if (progress >= 1) {
        fire(state.charge);
        state.nextShot = state.age + 180;
        state.charge = undefined;
        boss.isCharging = false;
      } else {
        boss.isCharging = true;
        this.visuals.push({ kind: 'sniper', ...center, targetX: state.charge.x, targetY: state.charge.y, progress });
      }
    }
    return true;
  }

  absorbShield(engine: GameEngine, boss: Entity, damage: number) {
    if (!isOpeningPeerReviewer(boss)) return false;
    const state = this.states.get(boss);
    if (!state || state.shieldHp <= 0) return false;
    state.shieldHp = Math.max(0, state.shieldHp - Math.max(0, damage));
    engine.flashDamageTarget(boss, 4);
    if (state.shieldHp === 0) {
      const x = boss.x + boss.width / 2, y = boss.y + boss.height * 0.8;
      engine.spawnRingEffect(x, y, '#67e8f9');
      engine.spawnBurst(x, y, '#e0f2fe', 10, 3, 3);
      engine.spawnFloatingText(x, y, 'SHIELD BREAK', '#67e8f9', 18);
      engine.addHitStop(3);
      engine.spawnCoin(x, y);
    }
    return true;
  }
}
