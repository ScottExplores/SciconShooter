import {
  clampWingLevel, getWingCooldownFrames, getWingPassiveDamage, getWingSpecial,
  stepWingSpring, WING_EVOLUTION_LABELS, WING_OFFSET, WING_SPECIAL_LABELS,
  type WingSlot, type WingSpecial, type WingSpring
} from './wingTuning';

export interface WingCompanion {
  slot: WingSlot; id: string; ability: string; level: number; x: number; y: number;
  frameIndex: number; entryProgress: number; fireTimer: number; fireIntervalFrames: number;
  projectileDamage: number; frames: readonly string[]; utilityActive?: boolean;
}
export interface WingTarget {
  type: string; x: number; y: number; width: number; height: number;
  markedForDeletion: boolean; isPlayerShot?: boolean; isBeam?: boolean; damage?: number;
}
export interface WingProjectileOptions {
  angle?: number; offsetX?: number; damageScale?: number; widthScale?: number;
  heightScale?: number; speedScale?: number; pierceCount?: number; missile?: boolean;
}
export interface WingHudEntry {
  slot: WingSlot; id: string; image: string; level: number; special: WingSpecial;
  label: string; evolved: boolean; cooldownFrames: number; cooldownMax: number; ready: boolean;
}
export interface WingHudSnapshot { enabled: boolean; autoCast: boolean; wings: WingHudEntry[] }
export const EMPTY_WING_SNAPSHOT: WingHudSnapshot = { enabled: false, autoCast: true, wings: [] };
export interface WingFrame {
  centerX: number; centerY: number; width: number; height: number; frame: number;
  canFire: boolean; mainDps: number; entities: readonly WingTarget[];
  supportDpsMultiplier?: number; supportCooldownMultiplier?: number;
  spawn: (companion: WingCompanion, options: WingProjectileOptions) => unknown;
  ring: (x: number, y: number, color: string) => void;
  shield: (frames: number) => void;
  magnet: (frames: number) => void;
}
interface WingState {
  spring: WingSpring; cooldown: number; cooldownMax: number; activeFrames: number;
}

const inRange = (entity: WingTarget, frame: WingFrame, radius: number) => (
  (entity.x + entity.width / 2 - frame.centerX) ** 2 + (entity.y + entity.height / 2 - frame.centerY) ** 2 <= radius ** 2
);
const isHostileBullet = (entity: WingTarget) => entity.type === 'PROJECTILE'
  && !entity.markedForDeletion && !entity.isPlayerShot && !entity.isBeam && (entity.damage ?? 1) > 0;
const isEnemy = (entity: WingTarget) => !entity.markedForDeletion
  && (entity.type.startsWith('ENEMY_') || entity.type === 'BOSS' || entity.type === 'MINI_BOSS');

/** One controller per engine. No global listeners, browser timers or profile writes. */
export class WingSupportRuntime {
  autoCast = true;
  private states = new WeakMap<WingCompanion, WingState>();
  private lastFrame: WingFrame | null = null;
  private flightFrames = 0;
  constructor(readonly enabled: boolean, readonly firstFlight = false, autoCast = true) { this.autoCast = autoCast; }

  private state(companion: WingCompanion) {
    let state = this.states.get(companion);
    if (!state) {
      state = {
        spring: { x: companion.x, y: companion.y, vx: 0, vy: 0, tilt: 0 },
        cooldown: 0, cooldownMax: getWingCooldownFrames(getWingSpecial(companion.slot, companion.ability), companion.level),
        activeFrames: 0
      };
      this.states.set(companion, state);
    }
    return state;
  }

  getTilt(companion: WingCompanion) { return this.enabled ? this.states.get(companion)?.spring.tilt ?? 0 : 0; }
  isDeployed() { return !this.enabled || !this.firstFlight || this.flightFrames >= 600; }
  reset(companions: readonly WingCompanion[]) {
    // Resize/respawn may reset formation, but can never recharge a special.
    for (const companion of companions) {
      const state = this.states.get(companion);
      if (state) { state.spring.x = NaN; state.spring.vx = 0; state.spring.vy = 0; state.spring.tilt = 0; }
    }
    this.lastFrame = null;
  }
  setAutoCast(value: boolean) { this.autoCast = Boolean(value); }

  snapshot(companions: readonly WingCompanion[]): WingHudSnapshot {
    if (!this.enabled) return EMPTY_WING_SNAPSHOT;
    return { enabled: true, autoCast: this.autoCast, wings: companions.map(companion => {
      const state = this.state(companion);
      const special = getWingSpecial(companion.slot, companion.ability);
      const evolved = clampWingLevel(companion.level) === 5;
      return {
        slot: companion.slot, id: companion.id, image: companion.frames[0], level: clampWingLevel(companion.level), special,
        label: evolved ? WING_EVOLUTION_LABELS[special] : WING_SPECIAL_LABELS[special], evolved,
        cooldownFrames: state.cooldown, cooldownMax: state.cooldownMax,
        ready: state.cooldown <= 0 && companion.entryProgress >= 0.9 && Boolean(this.lastFrame?.canFire)
      };
    }) };
  }

  update(companions: readonly WingCompanion[], frame: WingFrame) {
    if (!this.enabled) return;
    this.lastFrame = frame;
    if (frame.canFire) this.flightFrames++;
    for (const companion of companions) {
      if (this.firstFlight && this.flightFrames < 600) { companion.entryProgress = 0; continue; }
      const state = this.state(companion);
      const side = companion.slot === 'left' ? -1 : 1;
      // Ship centers remain clear of the player's central hitbox, including near edges.
      const targetX = Math.max(18, Math.min(frame.width - 18, frame.centerX + side * WING_OFFSET));
      const targetY = Math.max(18, Math.min(frame.height - 18, frame.centerY + 14));
      if (this.firstFlight && this.flightFrames === 600) {
        companion.x = targetX; companion.y = frame.height + 50;
        state.spring.x = companion.x; state.spring.y = companion.y;
      }
      if (!Number.isFinite(state.spring.x) || Math.hypot(state.spring.x - companion.x, state.spring.y - companion.y) > 100) {
        state.spring.x = companion.x; state.spring.y = companion.y;
        state.spring.vx = 0; state.spring.vy = 0;
      }
      stepWingSpring(state.spring, targetX, targetY);
      // Constrain the lag to its own side; hard reversals cannot obscure the hitbox.
      state.spring.x = companion.slot === 'left' ? Math.min(frame.centerX - 30, state.spring.x)
        : Math.max(frame.centerX + 30, state.spring.x);
      companion.x = Math.max(18, Math.min(frame.width - 18, state.spring.x));
      companion.y = Math.max(18, Math.min(frame.height - 18, state.spring.y));
      companion.entryProgress = Math.min(1, companion.entryProgress + 0.04);
      companion.frameIndex = Math.floor(frame.frame / 10) % companion.frames.length;
      state.cooldownMax = getWingCooldownFrames(getWingSpecial(companion.slot, companion.ability), companion.level, frame.supportCooldownMultiplier);
      state.activeFrames = Math.max(0, state.activeFrames - 1);
      companion.utilityActive = state.activeFrames > 0;
      if (!frame.canFire) continue;
      state.cooldown = Math.max(0, state.cooldown - 1);
      if (this.autoCast && state.cooldown <= 0 && this.shouldAutoCast(companion, frame)) this.cast(companion, frame);
      companion.fireTimer--;
      if (companion.entryProgress < 0.9 || companion.fireTimer > 0) continue;
      this.passive(companion, frame);
      companion.fireTimer = companion.fireIntervalFrames;
    }
  }

  activate(slot: WingSlot, companions: readonly WingCompanion[], canFire: boolean) {
    const companion = companions.find(wing => wing.slot === slot);
    return Boolean(this.enabled && canFire && companion && this.lastFrame?.canFire && this.cast(companion, this.lastFrame));
  }

  private shouldAutoCast(companion: WingCompanion, frame: WingFrame) {
    const special = getWingSpecial(companion.slot, companion.ability);
    if (companion.slot === 'left') return frame.entities.some(entity => isEnemy(entity) && entity.y >= 0 && entity.y < companion.y);
    const magnet = special === 'magnet-field';
    const required = magnet || special === 'bullet-eraser' ? 3 : 1;
    let found = 0;
    for (const entity of frame.entities) {
      const relevant = magnet ? entity.type === 'COIN' && !entity.markedForDeletion : isHostileBullet(entity);
      if (relevant && inRange(entity, frame, magnet ? 320 : 130) && ++found >= required) return true;
    }
    return false;
  }

  private passive(companion: WingCompanion, frame: WingFrame) {
    const count = companion.level >= 5 ? 3 : companion.level >= 3 ? 2 : 1;
    const damage = getWingPassiveDamage(frame.mainDps, companion.level, companion.fireIntervalFrames, frame.supportDpsMultiplier) / count;
    const fan = companion.ability === 'prism-fan' || companion.ability === 'nova-volley';
    for (let index = 0; index < count; index++) {
      const step = index - (count - 1) / 2;
      frame.spawn({ ...companion, projectileDamage: damage }, {
        angle: step * (fan ? 0.12 : 0.025), offsetX: step * 7,
        missile: companion.slot === 'left' && companion.ability === 'homing-missile',
        heightScale: companion.ability === 'piercing-laser' ? 1.6 : 1
      });
    }
  }

  private cast(companion: WingCompanion, frame: WingFrame) {
    const state = this.state(companion);
    if (!frame.canFire || state.cooldown > 0 || companion.entryProgress < 0.9) return false;
    const special = getWingSpecial(companion.slot, companion.ability);
    const evolved = clampWingLevel(companion.level) === 5;
    state.cooldown = state.cooldownMax;
    state.activeFrames = evolved ? 90 : 50;
    if (special === 'shield-pulse') frame.shield(evolved ? 150 : 90);
    else if (special === 'magnet-field') frame.magnet(evolved ? 360 : 240);
    else if (special === 'bullet-eraser') {
      let remaining = evolved ? 40 : 24;
      for (const entity of frame.entities) {
        if (remaining <= 0) break;
        if (isHostileBullet(entity) && inRange(entity, frame, evolved ? 170 : 125)) {
          entity.markedForDeletion = true; remaining--;
        }
      }
    } else {
      const count = special === 'laser-lance' ? (evolved ? 2 : 1) : special === 'homing-swarm' ? (evolved ? 8 : 4) : (evolved ? 9 : 5);
      const damage = frame.mainDps * (evolved ? 1.6 : 1.1) / count;
      for (let index = 0; index < count; index++) {
        const step = index - (count - 1) / 2;
        frame.spawn({ ...companion, projectileDamage: damage }, {
          angle: special === 'laser-lance' ? 0 : step * 0.105,
          offsetX: step * (special === 'laser-lance' ? 16 : 5),
          missile: special === 'homing-swarm',
          pierceCount: special === 'laser-lance' ? (evolved ? 5 : 3) : 0,
          widthScale: special === 'laser-lance' ? 1.5 : 1.2,
          heightScale: special === 'laser-lance' ? 3.2 : 1.3
        });
      }
    }
    frame.ring(companion.x, companion.y, companion.slot === 'left' ? '#67e8f9' : '#a7f3d0');
    return true;
  }
}
