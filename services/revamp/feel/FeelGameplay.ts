import { EntityType } from '../../../types';
import type { Entity, GameEngine } from '../../gameLogic';

const aimedShots = new WeakSet<object>();
export const markAimedShot = (shot: object) => { aimedShots.add(shot); };
export const isAimedShot = (shot: object) => aimedShots.has(shot);

/** Receipts are presentation only; rewards remain owned by the existing economy. */
export function recordFeelKill(engine: GameEngine, target: Entity, score: number) {
  const tier = target.type === EntityType.BOSS ? 'boss'
    : target.isElite || target.type === EntityType.MINI_BOSS
      || target.type === EntityType.ENEMY_BRICK || target.type === EntityType.ENEMY_JOURNAL
      || target.type === EntityType.ENEMY_INVADER ? 'elite' : 'small';
  const freeze = engine.feel.recordKill({
    frame: engine.frameCount, x: target.x + target.width / 2, y: target.y + target.height / 2,
    tier, score, color: target.color || '#67e8f9', width: target.width, height: target.height
  });
  if (freeze) engine.addHitStop(freeze);
}

/** Phase relief is simulation-owned, identical at every viewport and quality. */
export function cancelPhaseBullets(engine: GameEngine, boss: Entity) {
  let cancelledBullets = 0;
  for (const shot of engine.entities) {
    if (shot.markedForDeletion || shot.isPlayerShot || shot.type !== EntityType.PROJECTILE) continue;
    // Destructible brood and persistent boss mechanisms are enemies, not rounds.
    if (shot.prismMothArtifactState?.kind === 'brood') continue;
    shot.markedForDeletion = true;
    if (cancelledBullets < 32) engine.feel.recordBulletCancel({
      frame: engine.frameCount, x: shot.x + shot.width / 2, y: shot.y + shot.height / 2
    });
    cancelledBullets++;
  }
  engine.feel.recordPhaseChange({
    frame: engine.frameCount, x: boss.x + boss.width / 2, y: boss.y + boss.height / 2, cancelledBullets
  });
  engine.playSound('phase_change');
}

export function recordPerfectWave(engine: GameEngine) {
  engine.feel.recordWaveClear({
    frame: engine.frameCount, x: engine.width / 2, y: engine.height * 0.32,
    damageTaken: engine.tacticalWaveDamageTaken
  });
}

/** Reuse the established burst physics; no extra coins or gameplay RNG draws. */
export function kickCredit(coin: Entity) {
  coin.coinBurstFrames = 18;
  coin.vx = ((coin.variant % 7) - 3) * 0.36;
  coin.vy = -1.8 - (coin.variant % 3) * 0.2;
  coin.coinGravity = 0.17;
}
