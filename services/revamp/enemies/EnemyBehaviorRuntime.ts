/** Regular-enemy rules use simulation frames, never renderer time or screen DPI. */
export const ENEMY_ENTRY_GRACE_FRAMES = 42;
export const SNIPER_CHARGE_FRAMES = 48;
export const TELEPORT_PREVIEW_FRAMES = 24;
export const EDGE_WARNING_FRAMES = 48;

export type EnemyDifficultyTier = 'easy' | 'normal' | 'hard' | 'expert';
export type RevampEnemyKind = 'diver' | 'escort' | 'shield-bearer' | 'splitter' | 'mine-layer' | 'sniper' | 'teleporter' | 'carrier';
export interface EnemyPoint { x: number; y: number }
export interface RevampEnemy extends EnemyPoint {
  id: string;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  markedForDeletion?: boolean;
  campaignRoleId?: string;
  campaignSpawnFrame?: number;
  formationState?: string;
  formationTargetX?: number;
  formationTargetY?: number;
  formationIndex?: number;
  sourceEventId?: string;
  revampCarrierId?: string;
  contactDamage?: number;
  projectileDamage?: number;
  attackIntervalFrames?: number;
}
export interface EnemyBehaviorContext {
  frame: number;
  width: number;
  height: number;
  player: EnemyPoint & { radius: number };
  enemies: readonly RevampEnemy[];
  enemyBulletCount: number;
  difficultyTier: EnemyDifficultyTier;
}
export interface EnemyChildSpawn extends EnemyPoint {
  scale: number;
  healthScale: number;
  mini: boolean;
  index: number;
}
export interface EnemyMineExplosion extends EnemyPoint { radius: number; damage: number }
export interface EnemyBehaviorCallbacks {
  fireAimed(enemy: RevampEnemy, target: EnemyPoint, speed: number): void;
  spawnChild(parent: RevampEnemy, child: EnemyChildSpawn): void | boolean;
  explodeMine(mine: EnemyMineExplosion): void;
  callout(text: string): void;
  teleport?(enemy: RevampEnemy, position: EnemyPoint): void;
}
export type EnemyTelegraph =
  | { kind: 'shield'; x: number; y: number; radius: number }
  | { kind: 'sniper'; x: number; y: number; targetX: number; targetY: number; progress: number }
  | { kind: 'ghost'; x: number; y: number; width: number; height: number; progress: number }
  | { kind: 'mine'; x: number; y: number; radius: number; progress: number }
  | { kind: 'blast'; x: number; y: number; radius: number; progress: number }
  | { kind: 'edge'; x: number; y: number; direction: 'left' | 'right' | 'top' | 'bottom'; progress: number };

const BULLET_CAPS: Readonly<Record<EnemyDifficultyTier, number>> = Object.freeze({ easy: 18, normal: 28, hard: 40, expert: 52 });
export const getEnemyBulletCap = (tier: EnemyDifficultyTier) => BULLET_CAPS[tier] ?? BULLET_CAPS.normal;
const KIND_LABELS: Readonly<Record<RevampEnemyKind, string>> = {
  diver: 'DIVER', escort: 'ESCORT TRIO', 'shield-bearer': 'SHIELD BEARER', splitter: 'SPLITTER',
  'mine-layer': 'MINE LAYER', sniper: 'SNIPER', teleporter: 'TELEPORTER', carrier: 'CARRIER'
};
export function getRevampEnemyKind(enemy: Pick<RevampEnemy, 'campaignRoleId'>): RevampEnemyKind | undefined {
  const kind = enemy.campaignRoleId?.replace(/^role-revamp-/, '') as RevampEnemyKind;
  return enemy.campaignRoleId?.startsWith('role-revamp-') && Object.hasOwn(KIND_LABELS, kind) ? kind : undefined;
}
const center = (enemy: RevampEnemy): EnemyPoint => ({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 });
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const hash = (value: string) => [...value].reduce((seed, letter) => (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0, 17);
const seedFor = (enemy: RevampEnemy) => hash(`${enemy.sourceEventId ?? enemy.campaignRoleId ?? 'enemy'}:${enemy.campaignSpawnFrame ?? 0}:${enemy.formationIndex ?? 0}`);
const actionPeriod = (enemy: RevampEnemy, fallback: number, ratio: number, minimum: number) =>
  Math.max(minimum, Math.round(Number.isFinite(enemy.attackIntervalFrames) && enemy.attackIntervalFrames > 0
    ? enemy.attackIntervalFrames * ratio : fallback));
const distance = (a: EnemyPoint, b: EnemyPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Returns a center point, or null when the arena cannot fit a fair spawn. */
export function findSafeSpawnPoint(
  desired: EnemyPoint,
  context: Pick<EnemyBehaviorContext, 'width' | 'height' | 'player'>,
  radius: number,
  clearance = 56
): EnemyPoint | null {
  const { width, height, player } = context;
  const inset = Math.max(12, radius + 4);
  if (width < inset * 2 || height < inset * 2) return null;
  const safe = (point: EnemyPoint) => distance(point, player) >= radius + player.radius + clearance;
  const preferred = { x: clamp(desired.x, inset, width - inset), y: clamp(desired.y, inset, height - inset) };
  if (safe(preferred)) return preferred;
  // Prefer a nearby lateral release. Top-lane fallbacks keep summons away from thumbs.
  const candidates = [
    { x: preferred.x - 96, y: preferred.y }, { x: preferred.x + 96, y: preferred.y },
    { x: width * 0.2, y: height * 0.2 }, { x: width * 0.8, y: height * 0.2 },
    { x: width * 0.5, y: height * 0.32 }
  ];
  return candidates.map((point) => ({ x: clamp(point.x, inset, width - inset), y: clamp(point.y, inset, height - inset) })).find(safe) ?? null;
}

interface EnemyState {
  visibleSince?: number;
  visible: boolean;
  nextActionFrame: number;
  charge?: { startFrame: number; target: EnemyPoint };
  ghost?: { startFrame: number; target: EnemyPoint };
  blinkShotFrame?: number;
  broods: number;
}
interface TimedMine extends EnemyMineExplosion { spawnFrame: number; fuseFrames: number }
interface MineBlast extends EnemyMineExplosion { startFrame: number }

/**
 * Engine adapters create real projectiles/children; this director owns only timing,
 * safe targeting and presentation data. No imports from the engine or Pixi.
 */
export class RevampEnemyDirector {
  private states = new Map<string, EnemyState>();
  private announced = new Set<RevampEnemyKind>();
  private handledDeaths = new WeakSet<RevampEnemy>();
  private mines: TimedMine[] = [];
  private blasts: MineBlast[] = [];
  private visuals: EnemyTelegraph[] = [];
  private lastFrame = -1;

  get activeMineCount() { return this.mines.length; }
  getTelegraphs(): readonly EnemyTelegraph[] { return this.visuals; }
  /** Wave boundaries retire old hazards while keeping run-level introduction callouts. */
  clearEncounter() {
    this.states.clear();
    this.mines = [];
    this.blasts = [];
    this.visuals = [];
    this.lastFrame = -1;
  }
  clear() {
    this.states.clear();
    this.announced.clear();
    this.handledDeaths = new WeakSet();
    this.mines = [];
    this.blasts = [];
    this.visuals = [];
    this.lastFrame = -1;
  }

  /** Also gate legacy regular shots through this method after tick(). */
  canFire(enemy: RevampEnemy, frame: number) {
    const state = this.states.get(enemy.id);
    return !enemy.markedForDeletion && enemy.hp > 0 && state?.visible === true
      && state.visibleSince !== undefined && frame - state.visibleSince >= ENEMY_ENTRY_GRACE_FRAMES;
  }

  ownsFiring(enemy: RevampEnemy) {
    // Diver/escort shots are emitted by the formation director at the arc bottom.
    return getRevampEnemyKind(enemy) !== undefined;
  }

  /** Down-facing 126-degree shield: side/rear shots hit the hull immediately. */
  blocksShieldHit(enemy: RevampEnemy, sourceX: number, sourceY: number) {
    if (getRevampEnemyKind(enemy) !== 'shield-bearer' || enemy.hp <= 0) return false;
    const dx = (sourceX - enemy.x - enemy.width / 2) / Math.max(1, enemy.width / 2);
    const dy = (sourceY - enemy.y - enemy.height / 2) / Math.max(1, enemy.height / 2);
    return dy > 0 && dy / Math.max(0.001, Math.hypot(dx, dy)) >= 0.45;
  }

  tick(context: EnemyBehaviorContext, callbacks: EnemyBehaviorCallbacks) {
    const { frame, width, height } = context;
    if (frame < this.lastFrame) this.clear();
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.visuals = [];
    let shotsAvailable = Math.max(0, getEnemyBulletCap(context.difficultyTier) - context.enemyBulletCount - this.mines.length);
    const emitShot = (enemy: RevampEnemy, target: EnemyPoint, speed: number) => {
      if (shotsAvailable <= 0 || !this.canFire(enemy, frame)) return false;
      shotsAvailable--;
      callbacks.fireAimed(enemy, target, speed);
      return true;
    };
    const living = new Set<string>();
    let childSlots = Math.max(0, 26 - context.enemies.filter((enemy) => enemy.hp > 0 && !enemy.markedForDeletion).length);
    for (const enemy of context.enemies) {
      if (enemy.markedForDeletion || enemy.hp <= 0) continue;
      living.add(enemy.id);
      const position = center(enemy);
      const isVisible = position.x >= 0 && position.x <= width && position.y >= 0 && position.y <= height;
      let state = this.states.get(enemy.id);
      if (!state) {
        state = { visible: false, nextActionFrame: frame + 90 + seedFor(enemy) % 24, broods: 0 };
        this.states.set(enemy.id, state);
      }
      if (isVisible && !state.visible) {
        state.visibleSince = frame;
        state.nextActionFrame = frame + 90 + seedFor(enemy) % 24;
      }
      state.visible = isVisible;
      if (!isVisible) {
        state.visibleSince = undefined;
        state.charge = undefined;
        state.ghost = undefined;
        continue;
      }
      const kind = getRevampEnemyKind(enemy);
      if (!kind) continue;
      if (!this.announced.has(kind)) {
        this.announced.add(kind);
        callbacks.callout(`NEW ENEMY: ${KIND_LABELS[kind]}`);
      }
      if (kind === 'shield-bearer') {
        this.visuals.push({ kind: 'shield', ...position, radius: Math.max(enemy.width, enemy.height) * 0.64 });
      }
      const settled = enemy.formationState === undefined || enemy.formationState === 'hold';
      if (!settled) {
        state.charge = undefined;
        state.ghost = undefined;
        continue;
      }
      if ((kind === 'shield-bearer' || kind === 'splitter') && frame >= state.nextActionFrame) {
        emitShot(enemy, context.player, 4.2);
        state.nextActionFrame = frame + actionPeriod(enemy, 180, 1, 72);
      } else if (kind === 'sniper') {
        if (!state.charge && frame >= state.nextActionFrame && this.canFire(enemy, frame)) {
          state.charge = { startFrame: frame, target: { x: context.player.x, y: context.player.y } };
        }
        if (state.charge) {
          const progress = (frame - state.charge.startFrame) / SNIPER_CHARGE_FRAMES;
          if (progress >= 1) {
            emitShot(enemy, state.charge.target, 7.2);
            state.charge = undefined;
            state.nextActionFrame = frame + actionPeriod(enemy, 258, 1, 78) - SNIPER_CHARGE_FRAMES;
          } else {
            this.visuals.push({ kind: 'sniper', ...position, targetX: state.charge.target.x, targetY: state.charge.target.y, progress });
          }
        }
      } else if (kind === 'teleporter') {
        if (state.blinkShotFrame !== undefined && frame >= state.blinkShotFrame) {
          emitShot(enemy, context.player, 4.8);
          state.blinkShotFrame = undefined;
        }
        if (!state.ghost && frame >= state.nextActionFrame && this.canFire(enemy, frame)) {
          const side = position.x < width / 2 ? 0.77 : 0.23;
          const target = findSafeSpawnPoint({ x: width * side, y: height * (0.22 + (seedFor(enemy) % 3) * 0.07) }, context, Math.max(enemy.width, enemy.height) / 2);
          if (target && distance(target, position) > enemy.width) state.ghost = { startFrame: frame, target };
          else state.nextActionFrame = frame + 90;
        }
        if (state.ghost) {
          const progress = (frame - state.ghost.startFrame) / TELEPORT_PREVIEW_FRAMES;
          if (progress >= 1) {
            const target = state.ghost.target;
            // If the player moved into the locked preview, cancel instead of snapping
            // to a fresh untelegraphed location or materializing on their ship.
            if (distance(target, context.player) >= Math.max(enemy.width, enemy.height) / 2 + context.player.radius + 56) {
              const topLeft = { x: target.x - enemy.width / 2, y: target.y - enemy.height / 2 };
              if (callbacks.teleport) callbacks.teleport(enemy, topLeft);
              else {
                enemy.x = topLeft.x;
                enemy.y = topLeft.y;
                enemy.formationTargetX = topLeft.x;
                enemy.formationTargetY = topLeft.y;
              }
              state.visibleSince = frame;
              state.blinkShotFrame = frame + ENEMY_ENTRY_GRACE_FRAMES;
            }
            state.ghost = undefined;
            state.nextActionFrame = frame + actionPeriod(enemy, 264, 2, 150) - TELEPORT_PREVIEW_FRAMES;
          } else {
            this.visuals.push({ kind: 'ghost', ...state.ghost.target, width: enemy.width, height: enemy.height, progress });
          }
        }
      } else if (kind === 'mine-layer' && frame >= state.nextActionFrame && this.canFire(enemy, frame)) {
        if (this.mines.length < 6 && shotsAvailable > 0) {
          const target = findSafeSpawnPoint({ x: position.x, y: enemy.y + enemy.height + 18 }, context, 34);
          if (target) {
            this.mines.push({ ...target, radius: 34, damage: Math.max(1, enemy.projectileDamage ?? 1), spawnFrame: frame, fuseFrames: 156 });
            shotsAvailable--;
          }
        }
        state.nextActionFrame = frame + actionPeriod(enemy, 240, 1.4, 120);
      } else if (kind === 'carrier' && state.broods < 2 && frame >= state.nextActionFrame && this.canFire(enemy, frame)) {
        const owned = context.enemies.filter((child) => child.revampCarrierId === enemy.id && child.hp > 0 && !child.markedForDeletion).length;
        let spawned = 0;
        for (let index = 0; index < Math.min(3 - owned, childSlots); index++) {
          const spawn = this.childSpawn(enemy, context, index, true);
          if (spawn && callbacks.spawnChild(enemy, spawn) !== false) spawned++;
        }
        childSlots -= spawned;
        if (spawned > 0) state.broods++;
        state.nextActionFrame = frame + actionPeriod(enemy, 360, 2.5, 240);
      }
    }
    for (const id of this.states.keys()) if (!living.has(id)) this.states.delete(id);
    const remainingMines: TimedMine[] = [];
    for (const mine of this.mines) {
      const progress = clamp((frame - mine.spawnFrame) / mine.fuseFrames, 0, 1);
      if (progress >= 1) {
        // Each mine reserved one hostile slot when deployed; detonation exchanges
        // that reservation for one collision projectile, never a hidden radial burst.
        callbacks.explodeMine(mine);
        this.blasts.push({ ...mine, startFrame: frame });
      } else {
        remainingMines.push(mine);
        this.visuals.push({ kind: 'mine', x: mine.x, y: mine.y, radius: mine.radius, progress });
      }
    }
    this.mines = remainingMines;
    this.blasts = this.blasts.filter((blast) => frame - blast.startFrame < 18);
    for (const blast of this.blasts) this.visuals.push({ kind: 'blast', x: blast.x, y: blast.y, radius: blast.radius, progress: (frame - blast.startFrame) / 18 });
  }

  private childSpawn(enemy: RevampEnemy, context: EnemyBehaviorContext, index: number, mini: boolean): EnemyChildSpawn | null {
    const scale = mini ? 0.48 : 0.6;
    const radius = Math.max(enemy.width, enemy.height) * scale / 2;
    const offset = mini ? (index - 1) * (radius * 2 + 7) : (index === 0 ? -1 : 1) * (radius + 5);
    const point = findSafeSpawnPoint({ x: enemy.x + enemy.width / 2 + offset, y: enemy.y + enemy.height * 0.7 }, context, radius);
    return point ? { x: point.x - enemy.width * scale / 2, y: point.y - enemy.height * scale / 2, scale, healthScale: mini ? 0.22 : 0.36, mini, index } : null;
  }

  onEnemyDeath(enemy: RevampEnemy, context: EnemyBehaviorContext, callbacks: EnemyBehaviorCallbacks) {
    if (this.handledDeaths.has(enemy)) return;
    this.handledDeaths.add(enemy);
    if (getRevampEnemyKind(enemy) !== 'splitter') return;
    const available = Math.max(0, 26 - context.enemies.filter((other) => other !== enemy && !other.markedForDeletion && other.hp > 0).length);
    for (let index = 0; index < Math.min(2, available); index++) {
      const spawn = this.childSpawn(enemy, context, index, false);
      if (spawn) callbacks.spawnChild(enemy, spawn);
    }
  }
}
