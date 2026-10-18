/** REVAMP(J): Geometry is presentation-only; time, motion and opacity remain continuous. */
export const EFFECT_GEOMETRY_FRAME_COUNT = 96;
export const EFFECT_GEOMETRY_CACHE_CAPACITY = 512;

export const effectGeometryFrame = (progress: number) => Math.round(
  Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) * EFFECT_GEOMETRY_FRAME_COUNT
);

/** Shared GPU geometry stays alive while any pooled display object references it. */
export class EffectGeometryCache<T extends { destroy(): void }> {
  private readonly entries = new Map<string, { value: T; users: number }>();
  private builds = 0;
  private hits = 0;

  constructor(private readonly capacity = EFFECT_GEOMETRY_CACHE_CAPACITY) {}

  acquire(key: string, create: () => T): T {
    let entry = this.entries.get(key);
    if (entry) {
      this.hits++;
      this.entries.delete(key);
    } else {
      this.builds++;
      entry = { value: create(), users: 0 };
    }
    entry.users++;
    this.entries.set(key, entry);
    this.trim();
    return entry.value;
  }

  release(key: string) {
    const entry = this.entries.get(key);
    if (entry) entry.users = Math.max(0, entry.users - 1);
    this.trim();
  }

  private trim() {
    if (this.entries.size <= this.capacity) return;
    for (const [key, entry] of this.entries) {
      if (entry.users > 0) continue;
      this.entries.delete(key);
      entry.value.destroy();
      if (this.entries.size <= this.capacity) break;
    }
  }

  getStats() {
    return { retained: this.entries.size, capacity: this.capacity, builds: this.builds, hits: this.hits };
  }

  destroy() {
    for (const entry of this.entries.values()) entry.value.destroy();
    this.entries.clear();
  }
}
