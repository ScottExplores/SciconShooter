export const RENDER_FRAME_INTERVAL_MS = 1000 / 60;
export const RENDER_FRAME_TOLERANCE_MS = 0.5;

/** Presentation cadence only; the simulation keeps its independent fixed step. */
export const nextRenderTimestamp = (timestamp: number, previous: number): number | null => {
  const elapsed = timestamp - previous;
  if (!Number.isFinite(elapsed) || elapsed + RENDER_FRAME_TOLERANCE_MS < RENDER_FRAME_INTERVAL_MS) return null;
  let remainder = elapsed % RENDER_FRAME_INTERVAL_MS;
  // A 16.6ms rAF interval is a rounded 60Hz frame, not a reason to skip it.
  // Correct the remainder as well as admission so rounding cannot leave almost
  // one full frame of debt and accidentally admit two 120Hz callbacks in a row.
  if (remainder > RENDER_FRAME_INTERVAL_MS - RENDER_FRAME_TOLERANCE_MS) remainder -= RENDER_FRAME_INTERVAL_MS;
  return timestamp - remainder;
};
