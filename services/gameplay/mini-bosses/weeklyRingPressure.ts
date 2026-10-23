const TAU = Math.PI * 2;

/**
 * Weekly elite rings used to appear as one dense volley. The first bursts are
 * smaller and more open, then the pattern fills in. A telegraph is always
 * required before the live shots.
 */
export const stageWeeklyRingVolley = (
  emissionIndex: number,
  requestedCount: number,
  baseGapArc: number
) => {
  const stage = Math.max(0, Math.floor(Number(emissionIndex) || 0));
  const requested = Math.max(1, Math.floor(Number(requestedCount) || 1));
  const scale = stage <= 0 ? 0.42 : stage === 1 ? 0.7 : 1;
  const count = Math.max(4, Math.min(14, Math.round(requested * scale)));
  const gapScale = stage <= 0 ? 2.15 : stage === 1 ? 1.55 : 1.18;
  const gapArc = Math.max(0.72, Math.min(TAU * 0.42, baseGapArc * gapScale));
  return {
    count,
    gapArc,
    onScreenCap: stage <= 0 ? 10 : stage === 1 ? 14 : 18,
    telegraph: true
  };
};
