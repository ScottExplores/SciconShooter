/** Presentation tuning shared by the game renderer and the isolated effects lab. */
export type ExplosionTier = 'small' | 'elite' | 'boss-part';

export const EXPLOSION_TIERS = {
  small: { sparks: 4, debris: 2, duration: 280, ring: 0.55, glow: 0.24 },
  elite: { sparks: 8, debris: 4, duration: 420, ring: 0.78, glow: 0.36 },
  'boss-part': { sparks: 12, debris: 6, duration: 520, ring: 1, glow: 0.44 }
} as const;

export const BOSS_CHAIN_DURATION_MS = 1600;
export const BOSS_CHAIN_COUNT = 12;
export const BOSS_FLASH_MAX_ALPHA = 0.16;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Millisecond easing, never frame-count based; score sparks are cosmetic only. */
export function scoreSparkPosition(
  progress: number,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  bend: number,
  out = { x: 0, y: 0 }
) {
  const t = clamp(progress, 0, 1);
  // A brief outward kick followed by a visibly accelerating magnet flight.
  const eased = t * t * (2 - t);
  const inverse = 1 - eased;
  out.x = inverse * inverse * startX + 2 * inverse * eased * (startX + bend) + eased * eased * targetX;
  out.y = inverse * inverse * startY + 2 * inverse * eased * (startY + 42) + eased * eased * targetY;
  return out;
}

export function impactSparkVelocity(vx: number, vy: number, index: number, armored: boolean) {
  const magnitude = Math.hypot(vx, vy);
  const directionX = magnitude > 0.0001 ? vx / magnitude : 0;
  const directionY = magnitude > 0.0001 ? vy / magnitude : -1;
  const side = index % 2 === 0 ? -1 : 1;
  const sideways = (armored ? 2.3 : 1.5) * (1 + Math.floor(index / 2) * 0.3);
  return {
    x: -directionY * side * sideways - directionX * 0.55,
    y: directionX * side * sideways - directionY * 0.55
  };
}

export interface FeelEffectSink {
  spawnTieredExplosion(x: number, y: number, size: number, tier: ExplosionTier, color?: string): void;
}

/**
 * The existing ArcadeEffectPool owns every particle. This controller only owns
 * a bounded, real-time boss choreography; it never schedules browser timers or
 * mutates simulation entities. Advance even while simulation is in hit-stop.
 */
export class FeelEffects {
  private elapsed = 0;
  private nextBurst = 0;
  private active = false;
  private x = 0;
  private y = 0;
  private width = 0;
  private height = 0;
  private flashRemaining = 0;
  private reducedFlash = false;

  constructor(private readonly pool: FeelEffectSink) {}

  get screenFlashAlpha() {
    const maximum = this.reducedFlash ? 0.035 : BOSS_FLASH_MAX_ALPHA;
    return maximum * Math.pow(clamp(this.flashRemaining / 140, 0, 1), 2);
  }

  get bossChainActive() { return this.active; }

  setReducedFlash(reduced: boolean) { this.reducedFlash = reduced; }

  startBossDefeat(x: number, y: number, width: number, height: number) {
    this.x = x;
    this.y = y;
    this.width = Math.max(24, width);
    this.height = Math.max(24, height);
    this.elapsed = 0;
    this.nextBurst = 0;
    this.active = true;
    this.flashRemaining = 0;
    this.update(0);
  }

  update(deltaMs: number) {
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.flashRemaining = Math.max(0, this.flashRemaining - delta);
    if (!this.active) return;
    this.elapsed += delta;
    // A resumed background tab must not dump a full chain in one frame.
    const resumed = delta > 250;
    let emitted = 0;
    while (this.nextBurst < BOSS_CHAIN_COUNT) {
      const index = this.nextBurst;
      const at = index * BOSS_CHAIN_DURATION_MS / (BOSS_CHAIN_COUNT - 1);
      if (at > this.elapsed) break;
      this.nextBurst++;
      const final = index === BOSS_CHAIN_COUNT - 1;
      if (resumed && !final && emitted >= 2) continue;
      const angle = index * 2.399963;
      const reach = final ? 0 : Math.sqrt((index + 0.5) / BOSS_CHAIN_COUNT) * 0.38;
      this.pool.spawnTieredExplosion(
        this.x + Math.cos(angle) * this.width * reach,
        this.y + Math.sin(angle) * this.height * reach,
        final ? Math.min(150, this.width * 0.65) : Math.min(64, this.width * 0.22 + index * 2),
        final ? 'boss-part' : index % 3 === 0 ? 'elite' : 'small',
        index % 2 ? '#fb923c' : '#fef08a'
      );
      emitted++;
      // One low-opacity white pulse, rather than repeated fullscreen strobing.
      if (final && !resumed) this.flashRemaining = 140;
    }
    if (this.nextBurst === BOSS_CHAIN_COUNT) this.active = false;
  }

  reset() {
    this.active = false;
    this.nextBurst = 0;
    this.elapsed = 0;
    this.flashRemaining = 0;
  }
}
