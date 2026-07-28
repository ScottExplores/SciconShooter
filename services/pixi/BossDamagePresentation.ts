export const BOSS_LOW_HEALTH_DAMAGE_THRESHOLD = 0.52;
export const BOSS_DAMAGE_NORMAL_CADENCE_FRAMES = 30;
export const BOSS_DAMAGE_PERFORMANCE_CADENCE_FRAMES = 48;

const BOSS_DAMAGE_POINTS = Object.freeze([
  Object.freeze({ xRatio: 0.42, yRatio: 0.36 }),
  Object.freeze({ xRatio: 0.58, yRatio: 0.43 }),
  Object.freeze({ xRatio: 0.47, yRatio: 0.61 }),
  Object.freeze({ xRatio: 0.61, yRatio: 0.57 }),
  Object.freeze({ xRatio: 0.39, yRatio: 0.51 })
]);

export interface BossLowHealthDamageCue {
  readonly xRatio: number;
  readonly yRatio: number;
  readonly size: number;
  readonly durationMs: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hashBossId = (bossId: string | number) => {
  const text = String(bossId ?? 'boss');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
};

export const sampleBossLowHealthDamageCue = ({
  healthRatio,
  frameCount,
  performanceMode,
  bossId,
  bossWidth
}: {
  healthRatio: number;
  frameCount: number;
  performanceMode: boolean;
  bossId: string | number;
  bossWidth: number;
}): BossLowHealthDamageCue | undefined => {
  const ratio = Number.isFinite(healthRatio) ? healthRatio : 1;
  const frame = Math.max(0, Math.floor(Number(frameCount) || 0));
  const cadence = performanceMode
    ? BOSS_DAMAGE_PERFORMANCE_CADENCE_FRAMES
    : BOSS_DAMAGE_NORMAL_CADENCE_FRAMES;
  if (ratio >= BOSS_LOW_HEALTH_DAMAGE_THRESHOLD || frame % cadence !== 0) return undefined;

  const cadenceTick = Math.floor(frame / cadence);
  const stableId = hashBossId(bossId);
  const point = BOSS_DAMAGE_POINTS[(stableId + cadenceTick) % BOSS_DAMAGE_POINTS.length];
  return Object.freeze({
    ...point,
    size: clamp((Number(bossWidth) || 0) * 0.1, 12, 24),
    durationMs: 220
  });
};
