export type WatchFrame = {
  seq: number; tick: number; videoTimeSeconds: number; simTimeMs: number;
  movement: string; fire: boolean; score: number; lives: number; kills: number;
  player?: { x: number; y: number } | null;
};
export type WatchManifest = {
  runId: string; controllerLabel: string;
  media: { url: string; posterUrl: string; width: number; height: number; fps: number; durationSeconds: number; sha256: string };
  timeline: { url: string; entries: number };
  evidence: string; sourceCommit: string;
};
export type WatchJob = { status: string; stage?: string; runId?: string; done: number; total: number; error?: string };
export type WatchCatalog = {
  runs: { runId: string; controllerLabel: string; status: string; sourceMatched: boolean; summary: Record<string, unknown> }[];
  job: WatchJob;
};
export type WatchLive = Omit<WatchFrame, 'movement' | 'fire' | 'videoTimeSeconds'> & {
  action: { movement: string; fire: boolean }; frameUrl: string | null; running: boolean;
  status: string; runId: string | null; controllerLabel: string; error?: string;
};
export const EMPTY_FRAME: WatchFrame = { seq: 0, tick: 0, videoTimeSeconds: 0, simTimeMs: 0, movement: 'idle', fire: false, score: 0, lives: 0, kills: 0 };
export const DIRECTIONS: Record<string, { angle: number; label: string }> = {
  N: { angle: 0, label: 'north' }, NE: { angle: 45, label: 'northeast' }, E: { angle: 90, label: 'east' },
  SE: { angle: 135, label: 'southeast' }, S: { angle: 180, label: 'south' }, SW: { angle: 225, label: 'southwest' },
  W: { angle: 270, label: 'west' }, NW: { angle: 315, label: 'northwest' },
};
/** Last observation whose completed frame is at or before the decoded video time. */
export function frameIndexAt(frames: WatchFrame[], time: number): number {
  let low = 0, high = frames.length;
  while (low < high) { const mid = (low + high) >>> 1; if (frames[mid].videoTimeSeconds <= time + 0.000001) low = mid + 1; else high = mid; }
  return Math.max(0, low - 1);
}
export function clockLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}
