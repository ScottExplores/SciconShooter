/** Render-only receipts of damage that the collision system already accepted. */
export interface CombatImpactInput {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly size: number;
  readonly vx: number;
  readonly vy: number;
  readonly targetId: string;
  readonly projectileId: string;
  readonly componentId?: string;
  readonly boss: boolean;
  /** REVAMP(A): Accepted armor deflection, even when hull HP is unchanged. */
  readonly armored?: boolean;
}

export interface CombatImpactEvent extends CombatImpactInput {
  readonly sequence: number;
}

export const COMBAT_IMPACT_CAPACITY = 64;

/** No random numbers, entities, timers, damage, or score are owned here. */
export class CombatImpactBuffer {
  private readonly retained: CombatImpactEvent[] = [];
  private snapshot: readonly CombatImpactEvent[] | null = Object.freeze([]);
  private sequence = 0;
  readonly capacity: number;

  constructor(capacity = COMBAT_IMPACT_CAPACITY) {
    this.capacity = Number.isFinite(capacity)
      ? Math.max(1, Math.min(COMBAT_IMPACT_CAPACITY, Math.floor(capacity)))
      : COMBAT_IMPACT_CAPACITY;
  }

  get latestSequence() { return this.sequence; }

  /** Stable, immutable snapshot until another hit is recorded. */
  get events(): readonly CombatImpactEvent[] {
    return this.snapshot ??= Object.freeze(this.retained.slice());
  }

  record(input: CombatImpactInput): CombatImpactEvent | undefined {
    if (![input.frame, input.x, input.y, input.size, input.vx, input.vy].every(Number.isFinite)) return;
    const event = Object.freeze({
      ...input,
      sequence: ++this.sequence,
      frame: Math.max(0, Math.floor(input.frame)),
      size: Math.max(4, Math.min(32, input.size)),
      color: /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(input.color) ? input.color : '#67e8f9'
    });
    if (this.retained.length >= this.capacity) this.retained.shift();
    this.retained.push(event);
    this.snapshot = null;
    return event;
  }

  /** Keep the sequence monotonic so a renderer cursor cannot replay old hits. */
  clear() {
    this.retained.length = 0;
    this.snapshot = Object.freeze([]);
  }
}

interface ImpactBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }

/**
 * Estimate the projectile's leading tip inside the bounds already hit. This
 * only positions a spark; it neither re-tests nor expands collision geometry.
 */
export const getProjectileCombatContact = (shot: ImpactBox, target: ImpactBox, vx: number, vy: number) => {
  const moving = Math.abs(vx) + Math.abs(vy) > .0001;
  const directionX = moving ? vx : 0;
  const directionY = moving ? vy : -1;
  const halfWidth = Math.max(0, shot.width) / 2;
  const halfHeight = Math.max(0, shot.height) / 2;
  const reachX = Math.abs(directionX) > .0001 ? halfWidth / Math.abs(directionX) : Infinity;
  const reachY = Math.abs(directionY) > .0001 ? halfHeight / Math.abs(directionY) : Infinity;
  const reach = Math.min(reachX, reachY);
  const tipX = shot.x + halfWidth + directionX * reach;
  const tipY = shot.y + halfHeight + directionY * reach;
  return {
    x: Math.max(target.x, Math.min(target.x + Math.max(0, target.width), tipX)),
    y: Math.max(target.y, Math.min(target.y + Math.max(0, target.height), tipY))
  };
};
