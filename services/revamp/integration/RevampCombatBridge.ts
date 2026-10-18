import type { Entity, GameEngine } from '../../gameLogic';
import { EntityType } from '../../../types';
import { crossedDiveShot, resolveDiveCadenceSeconds } from '../formations/galagaDive';
import { DenseFormationFire } from '../formations/DenseFormationFire';
import { markProjectileFamily } from '../feel/ProjectileReadability';
import { OpeningPeerReviewer } from '../enemies/OpeningPeerReviewer';
import {
  RevampEnemyDirector, getEnemyBulletCap,
  type EnemyBehaviorContext, type EnemyBehaviorCallbacks, type EnemyTelegraph
} from '../enemies/EnemyBehaviorRuntime';

const regularTypes = new Set([EntityType.ENEMY_DRONE, EntityType.ENEMY_JOURNAL, EntityType.ENEMY_BRICK, EntityType.ENEMY_SWARM]);
export const isRevampRole = (enemy: Pick<Entity, 'campaignRoleId'>) => Boolean(enemy.campaignRoleId?.startsWith('role-revamp-'));
export const isOpeningMission = (engine: GameEngine) => engine.getCurrentCampaignEntry()?.level.id === 'operation-open-galaxy';

export interface EntryWarning { id: string; x: number; y: number; edge: 'top' | 'left' | 'right' | 'bottom'; until: number }

/** The engine owns entities; this adapter owns only combat-time choreography state. */
export class RevampCombatBridge {
  readonly director = new RevampEnemyDirector();
  readonly denseFire = new DenseFormationFire();
  readonly openingBoss = new OpeningPeerReviewer();
  readonly warnings = new Map<string, EntryWarning>();
  frame = 0;
  private waveId = '';
  private transientShots = new Map<Entity, number>();
  private announcedWaves = new Set<string>();
  private waveHadEnemies = false;
  private lastWaveKills = 0;
  private openingLives = 0;

  constructor(private readonly create: (type: EntityType, x: number, y: number) => Entity) {}

  clear() {
    this.director.clear();
    this.denseFire.clear();
    this.openingBoss.clear();
    this.warnings.clear();
    this.transientShots.clear();
    this.announcedWaves.clear();
    this.frame = 0;
    this.waveId = '';
    this.waveHadEnemies = false;
  }

  tier(engine: GameEngine): 'easy' | 'normal' | 'hard' | 'expert' {
    const mission = engine.getStageNumberForCampaignIndex();
    return mission <= 3 ? 'easy' : mission <= 10 ? 'normal' : mission <= 25 ? 'hard' : 'expert';
  }

  cap(engine: GameEngine) { return getEnemyBulletCap(this.tier(engine)); }

  cadenceScale(enemy: Entity) {
    return enemy.formationChoreography?.attackId.startsWith('revamp-')
      ? Math.max(0.5, Math.min(1.5, (enemy.attackIntervalFrames || 180) / 180)) : 1;
  }

  private diveCadence(engine: GameEngine) {
    return resolveDiveCadenceSeconds({
      waveProgress: engine.getWaveElapsedSeconds() / engine.getConfiguredWaveDurationSeconds(),
      difficultyTier: Math.min(3, engine.getCampaignCycle()), mission: engine.wave
    });
  }

  diveHoldSeconds(engine: GameEngine, enemy: Entity, authoredSeconds: number) {
    return enemy.formationChoreography?.attackId.startsWith('revamp-')
      ? Math.max(0.8, authoredSeconds * this.cadenceScale(enemy) * this.diveCadence(engine) / 5.4)
      : authoredSeconds;
  }

  finishDiveStep(engine: GameEngine, enemy: Entity) {
    const flight = enemy.formationFlight;
    if (!flight?.revampReturnsToSlot) return false;
    if (flight.revampShotAtAge !== undefined && crossedDiveShot(
      enemy.formationFlightAge - 1, enemy.formationFlightAge, flight.revampShotAtAge
    )) this.fire(engine, enemy, {
      x: engine.player.x + engine.player.width / 2, y: engine.player.y + engine.player.height / 2
    }, enemy.projectileSpeed ?? 2.7);
    if (enemy.formationFlightAge >= flight.duration) {
      enemy.x = enemy.formationTargetX ?? enemy.x; enemy.y = enemy.formationTargetY ?? enemy.y;
      enemy.formationState = 'hold'; enemy.formationStateFrame = engine.frameCount;
      enemy.formationAttackActive = false; enemy.formationFlight = undefined;
      enemy.formationMotionStartFrame = engine.frameCount;
      enemy.formationDiveFrame = engine.frameCount + Math.round(60 * this.diveCadence(engine));
      enemy.formationMotionCycleSeen = -1; enemy.formationMotionPreviousCycle = -1;
      enemy.formationCycle++;
    }
    return true;
  }

  getTelegraphs(): readonly EnemyTelegraph[] {
    return [...this.director.getTelegraphs(), ...this.openingBoss.getTelegraphs(), ...[...this.warnings.values()].map(w => ({
      kind: 'edge' as const, x: w.x, y: w.y, direction: w.edge,
      progress: Math.max(0, 1 - (w.until - this.frame) / 48)
    }))];
  }

  bulletCount(engine: GameEngine) {
    return engine.entities.filter(e => !e.markedForDeletion && e.type === EntityType.PROJECTILE
      && !e.isPlayerShot && !e.isTelegraph).length + this.director.activeMineCount;
  }

  private context(engine: GameEngine): EnemyBehaviorContext {
    return {
      frame: this.frame, width: engine.width, height: engine.height,
      player: { x: engine.player.x + engine.player.width / 2, y: engine.player.y + engine.player.height / 2,
        radius: Math.min(engine.player.width, engine.player.height) * 0.35 },
      enemies: engine.entities.filter(e => regularTypes.has(e.type) && !e.markedForDeletion && !e.supportOwnerId),
      enemyBulletCount: this.bulletCount(engine) - this.director.activeMineCount,
      difficultyTier: this.tier(engine)
    };
  }

  private callbacks(engine: GameEngine): EnemyBehaviorCallbacks {
    return {
      fireAimed: (enemy, target, speed) => { this.fire(engine, enemy as Entity, target, speed); },
      spawnChild: (parent, child) => {
        const source = parent as Entity;
        if (engine.getActiveThreatCount() >= 24) return false;
        const e = engine.createEnemy(EntityType.ENEMY_SWARM, child.x, child.y, {
          health: Math.max(1, source.maxHp * child.healthScale), speed: 1.8,
          contactDamage: 1, projectileDamage: 1, scoreValue: child.mini ? 25 : 0,
          powerupDropChance: 0, sizeMultiplier: child.scale,
          spriteUrl: source.spriteUrl, spriteFrames: source.spriteFrames
        });
        e.campaignSpawnFrame = engine.frameCount;
        e.campaignFireBehavior = 'none';
        e.campaignFiller = !child.mini;
        e.splitterChild = true;
        e.revampCarrierId = child.mini ? source.id : undefined;
        e.spriteStyle = source.spriteStyle;
        e.color = source.color;
        e.sourceEventId = source.sourceEventId;
        e.vx = (child.mini ? child.index - 1 : child.index === 0 ? -1 : 1) * 0.65;
        this.ensureClearance(engine, e);
        return true;
      },
      explodeMine: mine => {
        // Use the normal projectile collision path so shields and i-frames work.
        const halfSide = mine.radius / Math.SQRT2;
        const shot = this.create(EntityType.PROJECTILE, mine.x - halfSide, mine.y - halfSide);
        shot.width = shot.height = halfSide * 2;
        shot.damage = mine.damage;
        shot.color = '#fb923c';
        shot.isPlayerShot = false;
        engine.entities.push(shot);
        this.transientShots.set(shot, this.frame + 1);
        engine.spawnRingEffect(mine.x, mine.y, '#fb923c');
      },
      callout: text => engine.spawnFloatingText(engine.width / 2, engine.height * 0.27, text, '#fde68a', 16),
      teleport: (enemy, point) => {
        const e = enemy as Entity;
        e.x = point.x; e.y = point.y;
        e.formationTargetX = point.x; e.formationTargetY = point.y;
        e.formationSlotLocked = true;
        e.formationMotionCycleSeen = -1;
        e.formationMotionPreviousCycle = -1;
      }
    };
  }

  tick(engine: GameEngine) {
    if (engine.inBossWarningSequence) return;
    this.openingBoss.beginFrame();
    this.frame++;
    const waveId = engine.getCurrentWaveDefinition()?.id ?? '';
    if (waveId !== this.waveId) {
      this.director.clearEncounter();
      this.waveId = waveId;
      this.waveHadEnemies = false;
      this.lastWaveKills = engine.stats.enemiesDefeated;
      this.openingLives = engine.lives;
    }
    for (const [shot, until] of this.transientShots) {
      if (this.frame >= until) { shot.markedForDeletion = true; this.transientShots.delete(shot); }
    }
    const context = this.context(engine);
    this.director.tick(context, this.callbacks(engine));
    this.denseFire.tick(engine, (source, target, speed) => this.fire(engine, source, target, speed));
    if (context.enemies.length) this.waveHadEnemies = true;
    // A short first clear acknowledgement uses the existing floating-text pool.
    if (isOpeningMission(engine) && this.waveHadEnemies && !context.enemies.length
      && engine.stats.enemiesDefeated - this.lastWaveKills >= (engine.getConfiguredSpawnEvents()[0]?.count ?? 1)
      && engine.lives === this.openingLives && !this.announcedWaves.has(waveId)) {
      this.announcedWaves.add(waveId);
      engine.spawnFloatingText(engine.width / 2, engine.height * 0.3, 'PERFECT WAVE', '#67e8f9', 20);
    }
    const living = new Set(context.enemies.map(e => e.id));
    for (const id of this.warnings.keys()) if (!living.has(id)) this.warnings.delete(id);
  }

  canLegacyFire(enemy: Entity) {
    return enemy.campaignRoleId !== 'role-revamp-linefighter' && !this.director.ownsFiring(enemy) && this.director.canFire(enemy, this.frame);
  }

  updateOpeningBoss(engine: GameEngine, boss: Entity) {
    return this.openingBoss.update(engine, boss, target => this.fire(engine, boss, target, 2.7, true));
  }

  fire(engine: GameEngine, source: Entity, target: {x: number; y: number}, speed = 4.2, graceSatisfied = false) {
    if (engine.inBossWarningSequence) return false;
    if ((!graceSatisfied && !this.director.canFire(source, this.frame)) || this.bulletCount(engine) >= this.cap(engine)) return false;
    const x = source.x + source.width / 2, y = source.y + source.height * 0.7;
    const distance = Math.max(1, Math.hypot(target.x - x, target.y - y));
    const shot = this.create(EntityType.PROJECTILE, x - 4, y - 6);
    shot.width = 8; shot.height = 12;
    shot.vx = (target.x - x) / distance * speed;
    shot.vy = (target.y - y) / distance * speed;
    shot.color = '#fb7185'; shot.damage = Math.max(1, source.projectileDamage || 1);
    shot.sourceEventId = source.sourceEventId;
    shot.isPlayerShot = false;
    markProjectileFamily(shot, source);
    source.campaignLastFireFrame = engine.frameCount;
    engine.entities.push(shot);
    return true;
  }

  onDeath(engine: GameEngine, enemy: Entity) {
    this.director.onEnemyDeath(enemy, this.context(engine), this.callbacks(engine));
    this.warnings.delete(enemy.id);
    if (enemy.campaignRoleId === 'role-revamp-carrier') {
      for (let i = 0; i < 3; i++) engine.spawnCoin(enemy.x + enemy.width * (i + 1) / 4, enemy.y + enemy.height / 2);
    }
  }

  ensureClearance(engine: GameEngine, enemy: Entity) {
    const player = engine.player;
    const safeX = (enemy.width + player.width) / 2 + 48;
    const safeY = (enemy.height + player.height) / 2 + 48;
    if (Math.abs(enemy.x + enemy.width / 2 - player.x - player.width / 2) < safeX
      && Math.abs(enemy.y + enemy.height / 2 - player.y - player.height / 2) < safeY) {
      enemy.y = -enemy.height - 32;
      enemy.formationStartY = enemy.y;
    }
  }

  register(engine: GameEngine, enemy: Entity) {
    this.ensureClearance(engine, enemy);
    const path = enemy.formationEntryPath ?? '';
    const edge = path.includes('bottom-flank') ? 'bottom'
      : enemy.x < 0 ? 'left' : enemy.x >= engine.width ? 'right'
      : enemy.campaignCharacteristic === 'kamikaze' ? 'top' : undefined;
    if (!edge) return;
    const clamp = (n: number, max: number) => Math.max(24, Math.min(max - 24, n));
    this.warnings.set(enemy.id, { id: enemy.id, edge,
      x: edge === 'left' ? 18 : edge === 'right' ? engine.width - 18 : clamp(enemy.x + enemy.width / 2, engine.width),
      y: edge === 'bottom' ? engine.height - 24 : edge === 'top' ? 30 : clamp(enemy.y + enemy.height / 2, engine.height),
      until: this.frame + 48 });
  }

  holdForWarning(engine: GameEngine, enemy: Entity) {
    const warning = this.warnings.get(enemy.id);
    if (!warning) return false;
    enemy.formationStateFrame = engine.frameCount;
    enemy.vx = enemy.vy = 0;
    if (this.frame >= warning.until) { this.warnings.delete(enemy.id); return false; }
    return true;
  }

  /** Apply the same total projectile ceiling after every source (including boss/support) updates. */
  enforceBulletCap(engine: GameEngine) {
    let remaining = Math.max(0, this.cap(engine) - this.director.activeMineCount);
    for (const e of engine.entities) {
      if (e.markedForDeletion || e.type !== EntityType.PROJECTILE || e.isPlayerShot || e.isTelegraph) continue;
      if (remaining-- <= 0) e.markedForDeletion = true;
    }
  }
}
