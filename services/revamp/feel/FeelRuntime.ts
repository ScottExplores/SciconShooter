/** Fixed 60 Hz presentation state. Never owns damage, score, currency, or RNG. */
export const FEEL_TUNING = Object.freeze({
  eventCapacity: 96,
  comboFrames: 150,
  pickupComboFrames: 60,
  maxCombo: 10,
  maxPickupLadder: 7,
  traumaDecayPerFrame: 0.018,
  maxShakePixels: 5,
  reducedShakePixels: 0.75,
  eliteHitStopFrames: 3,
  partHitStopFrames: 4,
  bossSlowMotionFrames: 24
});

export type FeelExplosionTier = 'small' | 'elite' | 'boss';
interface FeelPosition { readonly frame: number; readonly x: number; readonly y: number; }
interface KillInput extends FeelPosition { readonly tier: FeelExplosionTier; readonly score: number; readonly color?: string; readonly width?: number; readonly height?: number; }
interface PartInput extends FeelPosition { readonly score?: number; readonly color?: string; }
interface PickupInput extends FeelPosition {
  readonly pickupType: 'coin' | 'power' | 'other';
  readonly amount?: number;
  readonly powerLevel?: number;
}
type FeelReceipt =
  | (KillInput & { readonly type: 'kill'; readonly combo: number })
  | (PartInput & { readonly type: 'part-break'; readonly tier: 'boss-part' })
  | (PickupInput & { readonly type: 'pickup'; readonly ladder: number })
  | (FeelPosition & { readonly type: 'phase-change'; readonly cancelledBullets: number })
  | (FeelPosition & { readonly type: 'bullet-cancel' })
  | (FeelPosition & { readonly type: 'perfect-wave' });
export type FeelEvent = FeelReceipt & { readonly sequence: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validPosition = (input: FeelPosition) => Number.isFinite(input.frame) && Number.isFinite(input.x) && Number.isFinite(input.y);
const nonNegative = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, value!) : 0;

/**
 * advanceFrame() runs once for every fixed engine step, including hit-stop.
 * The engine's existing hitStopFrames remains the sole hit-stop scheduler;
 * recordKill/recordPartBreak return requests for that existing scheduler.
 */
export class FeelRuntime {
  private retained: FeelEvent[] = [];
  private snapshot: readonly FeelEvent[] | null = Object.freeze([]);
  private sequence = 0;
  private generation = 0;
  private trauma = 0;
  private clock = 0;
  private chain = 0;
  private chainFrames = 0;
  private pickupChain = 0;
  private pickupFrames = 0;
  private slowMotionFrames = 0;
  private waveDamaged = false;
  readonly capacity: number;

  constructor(capacity = FEEL_TUNING.eventCapacity) {
    this.capacity = Number.isFinite(capacity)
      ? clamp(Math.floor(capacity), 1, FEEL_TUNING.eventCapacity)
      : FEEL_TUNING.eventCapacity;
  }

  get latestSequence() { return this.sequence; }
  get resetGeneration() { return this.generation; }
  get events(): readonly FeelEvent[] { return this.snapshot ??= Object.freeze(this.retained.slice()); }
  get comboMultiplier() { return this.chainFrames > 0 ? Math.max(1, this.chain) : 1; }
  get comboRemaining() { return this.chainFrames / FEEL_TUNING.comboFrames; }
  get pickupLadder() { return this.pickupFrames > 0 ? Math.max(0, this.pickupChain - 1) : 0; }
  get slowMotionRemaining() { return this.slowMotionFrames; }
  get traumaLevel() { return this.trauma; }
  get presentationFrame() { return this.clock; }

  advanceFrame() {
    this.clock++;
    this.trauma = Math.max(0, this.trauma - FEEL_TUNING.traumaDecayPerFrame);
    if (this.chainFrames > 0 && --this.chainFrames === 0) this.chain = 0;
    if (this.pickupFrames > 0 && --this.pickupFrames === 0) this.pickupChain = 0;
  }

  /** Consume once per fixed engine step, before simulation work or shot flushing. */
  shouldSkipSlowMotionStep() {
    if (this.slowMotionFrames <= 0) return false;
    return --this.slowMotionFrames % 2 === 1;
  }

  addTrauma(amount: number) {
    if (Number.isFinite(amount) && amount > 0) this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Pure deterministic noise: feedback cannot consume gameplay's random stream. */
  getShake(frame = this.clock, enabled = true, reduceScreenShake = false, reducedMotion = false) {
    const cap = !enabled || reducedMotion ? 0
      : reduceScreenShake ? FEEL_TUNING.reducedShakePixels : FEEL_TUNING.maxShakePixels;
    const strength = this.trauma * this.trauma * cap;
    const time = Number.isFinite(frame) ? frame : this.clock;
    return {
      x: (Math.sin(time * 2.39996) + Math.sin(time * 1.173 + 2.1) * 0.5) / 1.5 * strength,
      y: (Math.cos(time * 2.071 + 1.2) + Math.sin(time * 1.819) * 0.5) / 1.5 * strength,
      strength
    };
  }

  recordKill(input: KillInput) {
    if (!validPosition(input)) return 0;
    this.chain = Math.min(FEEL_TUNING.maxCombo, this.chainFrames > 0 ? this.chain + 1 : 1);
    this.chainFrames = FEEL_TUNING.comboFrames;
    this.record({ ...input, score: nonNegative(input.score), type: 'kill', combo: this.chain });
    this.addTrauma(input.tier === 'boss' ? 0.65 : input.tier === 'elite' ? 0.3 : 0.075);
    if (input.tier === 'boss') this.slowMotionFrames = FEEL_TUNING.bossSlowMotionFrames;
    return input.tier === 'elite' ? FEEL_TUNING.eliteHitStopFrames : 0;
  }

  recordPartBreak(input: PartInput) {
    if (!validPosition(input)) return 0;
    this.record({ ...input, score: nonNegative(input.score), type: 'part-break', tier: 'boss-part' });
    this.addTrauma(0.38);
    return FEEL_TUNING.partHitStopFrames;
  }

  recordPhaseChange(input: FeelPosition & { readonly cancelledBullets?: number }) {
    if (!validPosition(input)) return;
    this.record({ ...input, cancelledBullets: Math.floor(nonNegative(input.cancelledBullets)), type: 'phase-change' });
    this.addTrauma(0.12);
  }

  recordBulletCancel(input: FeelPosition) {
    if (validPosition(input)) this.record({ ...input, type: 'bullet-cancel' });
  }

  recordPickup(input: PickupInput) {
    if (!validPosition(input)) return 0;
    this.pickupChain = Math.min(FEEL_TUNING.maxPickupLadder + 1, this.pickupFrames > 0 ? this.pickupChain + 1 : 1);
    this.pickupFrames = FEEL_TUNING.pickupComboFrames;
    const ladder = this.pickupLadder;
    this.record({ ...input, amount: nonNegative(input.amount), powerLevel: nonNegative(input.powerLevel), type: 'pickup', ladder });
    return ladder;
  }

  recordDamage(amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.waveDamaged = true;
    this.chain = this.chainFrames = 0;
  }

  /** A new wave must not erase the preceding wave's banner or boss defeat. */
  beginWave() { this.waveDamaged = false; }

  recordWaveClear(input: FeelPosition & { readonly damageTaken?: number }) {
    if (!validPosition(input) || this.waveDamaged || nonNegative(input.damageTaken) > 0) return false;
    this.record({ frame: input.frame, x: input.x, y: input.y, type: 'perfect-wave' });
    return true;
  }

  /** Sequence stays monotonic so renderer cursors never replay old receipts. */
  reset() {
    this.generation++;
    this.retained.length = 0;
    this.snapshot = Object.freeze([]);
    this.trauma = 0;
    this.clock = 0;
    this.chain = this.chainFrames = this.pickupChain = this.pickupFrames = this.slowMotionFrames = 0;
    this.waveDamaged = false;
  }

  private record(input: FeelReceipt) {
    const event = Object.freeze({ ...input, frame: Math.max(0, Math.floor(input.frame)), sequence: ++this.sequence }) as FeelEvent;
    if (this.retained.length === this.capacity) this.retained.shift();
    this.retained.push(event);
    this.snapshot = null;
  }
}
