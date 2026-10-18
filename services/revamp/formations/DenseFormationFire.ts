import type { Entity, GameEngine } from '../../gameLogic';

/** One shared firing clock makes a full grid readable: no thirty-gun volleys.
 * The emitter rotates across the rank; each hull also retains its authored cooldown.
 * Simulation-only state and a fixed world keep touch/keyboard pressure identical. */
export class DenseFormationFire {
  private nextShotFrame = 0;
  private cursor = 0;
  private regrouped = new WeakSet<Entity>();

  clear() { this.nextShotFrame = 0; this.cursor = 0; this.regrouped = new WeakSet<Entity>(); }

  tick(engine: GameEngine, fire: (enemy: Entity, target: { x: number; y: number }, speed: number) => boolean) {
    // Stragglers regroup through the normal eased slot transition. They remain
    // shootable and dangerous, but no lone edge ship stalls an otherwise clean beat.
    if (engine.getWaveElapsedSeconds() > 15 && engine.getConfiguredSpawnEvents().some(event =>
      event.enemies.some(setting => setting.roleId === 'role-revamp-linefighter'))) {
      const survivors = engine.entities.filter(enemy => !enemy.markedForDeletion && enemy.hp > 0
        && enemy.campaignRoleId?.startsWith('role-revamp-'));
      if (survivors.length <= 6) survivors.forEach((enemy, index) => {
        if (enemy.formationState !== 'hold' || this.regrouped.has(enemy)) return;
        this.regrouped.add(enemy);
        enemy.campaignCharacteristic = 'holder';
        enemy.formationStartX = enemy.x; enemy.formationStartY = enemy.y;
        enemy.formationTargetX = engine.width * (0.31 + index % 3 * 0.16) - enemy.width / 2;
        enemy.formationTargetY = engine.height * 0.24 + Math.floor(index / 3) * 48;
        enemy.formationState = 'entry'; enemy.formationStateFrame = engine.frameCount;
        enemy.formationEntryFrames = 42; enemy.formationSlotTransitionActive = true;
        enemy.formationGroupReady = false;
      });
    }
    if (engine.frameCount < this.nextShotFrame || engine.stats.isBossActive || engine.inBossWarningSequence) return;
    const candidates = engine.entities.filter(enemy => !enemy.markedForDeletion
      && (enemy.campaignRoleId === 'role-revamp-linefighter'
        || (this.regrouped.has(enemy) && (enemy.campaignRoleId === 'role-revamp-diver' || enemy.campaignRoleId === 'role-revamp-escort')))
      && enemy.formationState === 'hold' && enemy.formationGroupReady
      && enemy.y >= 40 && enemy.y < engine.height * 0.5
      && engine.frameCount - enemy.campaignLastFireFrame >= (enemy.attackIntervalFrames || 180));
    if (!candidates.length) return;
    const source = candidates[this.cursor++ % candidates.length];
    const target = engine.getStageNumberForCampaignIndex() === 1
      ? { x: engine.player.x + engine.player.width / 2, y: engine.player.y + engine.player.height / 2 }
      : { x: source.x + source.width / 2, y: engine.height };
    if (fire(source, target, source.projectileSpeed ?? 2.15)) {
      const mission = engine.getStageNumberForCampaignIndex();
      this.nextShotFrame = engine.frameCount + Math.max(28, 66 - Math.floor((mission - 1) * 1.6));
    }
  }
}
