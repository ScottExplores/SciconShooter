import type { WatchFrame, WatchManifest } from './watchData';
import type { InputSignalTrace } from './watchSignals';
export type ExhibitClip = { manifest: WatchManifest; timeline: WatchFrame[]; input: InputSignalTrace | null };
export type ExhibitSequence = { clips: ExhibitClip[]; seconds: number; pointsBefore: number[]; secondsBefore: number[] };
export function validateSequence(clips: ExhibitClip[]): ExhibitSequence {
  if (!clips.length || new Set(clips.map(clip => clip.manifest.runId)).size !== clips.length) throw new Error('The sequence must contain unique recordings.');
  let seconds = 0, points = 0; const pointsBefore: number[] = [], secondsBefore: number[] = [];
  for (const { manifest, timeline } of clips) {
    if (!timeline.length || timeline.length !== manifest.timeline.entries || !Number.isFinite(manifest.media.durationSeconds) || manifest.media.durationSeconds <= 0 || timeline.some((row, index) => !Number.isFinite(row.score) || row.score < 0 || !Number.isFinite(row.videoTimeSeconds) || row.videoTimeSeconds < 0 || row.videoTimeSeconds > manifest.media.durationSeconds || !Number.isFinite(row.simTimeMs) || row.simTimeMs < 0 || index > 0 && (row.videoTimeSeconds < timeline[index - 1].videoTimeSeconds || row.score < timeline[index - 1].score))) throw new Error('The recorded points or timeline could not be verified.');
    pointsBefore.push(points); secondsBefore.push(seconds);
    points += timeline[timeline.length - 1].score; seconds += manifest.media.durationSeconds;
  }
  return { clips, seconds, pointsBefore, secondsBefore };
}
/** Pure position-derived totals: refresh, seeks and repeat plays never earn new points. */
export function sequenceAt(sequence: ExhibitSequence | null, clip: number, index: number) {
  const row = sequence?.clips[clip]?.timeline[index];
  return row ? { points: sequence!.pointsBefore[clip] + row.score, seconds: sequence!.secondsBefore[clip] + row.videoTimeSeconds } : { points: 0, seconds: 0 };
}
/** A points illustration, deliberately separate from the scientific reward channel. */
export function recentPoints(timeline: WatchFrame[], index: number) {
  const current = timeline[index];
  if (!current) return { amount: 0, strength: 0 };
  for (let i = index; i > 0; i--) {
    const age = (current.simTimeMs - timeline[i].simTimeMs) / 1000;
    if (age < 0 || age > .8) break;
    const amount = timeline[i].score - timeline[i - 1].score;
    if (amount > 0) return { amount, strength: Math.exp(-age / .35) };
  }
  return { amount: 0, strength: 0 };
}
