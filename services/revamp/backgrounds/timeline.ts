import type { BackdropSetPiece, MissionBackdropLayout } from './layout';

export const SET_PIECE_DURATION = Object.freeze({ 'capital-flyby': 10, 'station-flythrough': 14, 'asteroid-shower': 10 });
export const BACKDROP_CYCLE_SECONDS = 58;
export const WARP_DURATION_SECONDS = 1.8;

/** Pure cosmetic timeline, sampled from simulation ticks; no timers or callbacks. */
export function sampleBackdropEvent(layout: MissionBackdropLayout, seconds: number): { event: BackdropSetPiece; progress: number } | null {
  const time = Math.max(0, seconds) % BACKDROP_CYCLE_SECONDS;
  for (const event of layout.setPieces) {
    const elapsed = time - event.atSeconds;
    if (elapsed >= 0 && elapsed < SET_PIECE_DURATION[event.kind]) return { event, progress: elapsed / SET_PIECE_DURATION[event.kind] };
  }
  return null;
}
export function warpEnvelope(elapsed: number, reducedMotion: boolean): number {
  if (reducedMotion || elapsed < 0 || elapsed > WARP_DURATION_SECONDS) return 0;
  return Math.sin(elapsed / WARP_DURATION_SECONDS * Math.PI) ** 2;
}
export const backdropDetailBudget = (scale: number) => ({
  stars: scale <= .5 ? 24 : scale <= .75 ? 39 : 54,
  debris: scale <= .5 ? 4 : scale <= .75 ? 8 : 12,
  battle: scale > .5,
  secondary: scale > .5,
});
