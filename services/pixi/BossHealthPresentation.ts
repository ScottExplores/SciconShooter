// Simulation-frame timing freezes with pause and does not need a wall-clock timer.
const DAMAGE_HOLD_FRAMES = 7;
const DAMAGE_SETTLE_FRAMES = 20;

const normalizedHealth = (hp: number, maxHp: number) => (
  Math.max(0, Math.min(1, (Number.isFinite(hp) ? hp : 0) / maxHp))
);

/** Small, allocation-free presentation state; never changes combat health. */
export class BossHealthPresentation {
  actualRatio = 0;
  trailRatio = 0;
  private bossId: string | number | null = null;
  private maxHp = 1;
  private previousFrame = -1;
  private damageStartFrame: number | null = null;
  private damageStartRatio = 0;

  reset(): void {
    this.actualRatio = 0;
    this.trailRatio = 0;
    this.bossId = null;
    this.maxHp = 1;
    this.previousFrame = -1;
    this.damageStartFrame = null;
    this.damageStartRatio = 0;
  }

  update(
    bossId: string | number,
    hp: number,
    maxHp: number,
    frame: number,
    reducedMotion = false
  ): this {
    const capacity = Math.max(1, Number.isFinite(maxHp) ? maxHp : 1);
    const currentFrame = Math.max(0, Number.isFinite(frame) ? frame : 0);
    const ratio = normalizedHealth(hp, capacity);
    const reset = this.bossId !== bossId
      || this.maxHp !== capacity
      || currentFrame < this.previousFrame
      || ratio > this.actualRatio
      || reducedMotion;

    if (reset) {
      this.trailRatio = ratio;
      this.damageStartFrame = null;
      this.damageStartRatio = ratio;
    } else {
      if (ratio < this.actualRatio && this.damageStartFrame === null) {
        this.damageStartFrame = currentFrame;
        this.damageStartRatio = this.trailRatio;
      }
      if (this.damageStartFrame !== null) {
        // Further hits use the same deadline: sustained fire cannot keep the
        // old-health chip hanging indefinitely behind the real health fill.
        const elapsed = currentFrame - this.damageStartFrame;
        const progress = Math.max(0, Math.min(1,
          (elapsed - DAMAGE_HOLD_FRAMES) / DAMAGE_SETTLE_FRAMES));
        this.trailRatio = Math.max(ratio,
          this.damageStartRatio + (ratio - this.damageStartRatio) * progress);
        if (progress >= 1) {
          this.trailRatio = ratio;
          this.damageStartFrame = null;
        }
      } else {
        this.trailRatio = ratio;
      }
    }

    this.bossId = bossId;
    this.maxHp = capacity;
    this.previousFrame = currentFrame;
    this.actualRatio = ratio;
    return this;
  }
}
