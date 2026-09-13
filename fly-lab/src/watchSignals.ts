import type { WatchFrame } from './watchData';

/** Display cues, never inferred spikes, dopamine concentrations or neural pathways. */
export type WatchSignals = { timeSeconds: number; inputChange: number; movement: number; fire: number; reward: number; valid: boolean };
export type InputSignalTrace = { version: 1; source: 'recorded-grayscale'; gain: number; frames: { seq: number; tick: number; inputChange: number }[] };
export const NO_SIGNALS: WatchSignals = { timeSeconds: 0, inputChange: 0, movement: 0, fire: 0, reward: 0, valid: false };

export function validateInputTrace(value: InputSignalTrace, timeline: WatchFrame[]): InputSignalTrace {
  if (value?.version !== 1 || value.source !== 'recorded-grayscale' || value.gain !== 8 || !Array.isArray(value.frames) || value.frames.length !== timeline.length
    || value.frames.some((row, index) => row.seq !== timeline[index].seq || row.tick !== timeline[index].tick || !Number.isFinite(row.inputChange) || row.inputChange < 0 || row.inputChange > 1)) {
    throw new Error('Image-change trace does not match this recording.');
  }
  return value;
}

/** Outcome display only. Coin/score changes never enter the reinforcement channel. */
export function recentReward(timeline: WatchFrame[], index: number) {
  const current = timeline[index];
  if (!current) return { amount: 0, strength: 0 };
  for (let i = index; i >= 0; i--) {
    const age = (current.simTimeMs - timeline[i].simTimeMs) / 1000;
    if (age > .8 || age < 0) break;
    const amount = timeline[i].reward;
    if (Number.isFinite(amount) && amount !== 0) return { amount, strength: Math.exp(-age / .35) };
  }
  return { amount: 0, strength: 0 };
}

export function signalIllustration(frame: WatchFrame, inputChange: number | null, reward: number, valid: boolean): WatchSignals {
  if (!valid) return NO_SIGNALS;
  return { timeSeconds: frame.simTimeMs / 1000, inputChange: Number.isFinite(inputChange) ? Math.max(0, Math.min(1, inputChange)) : 0,
    movement: frame.movement !== 'idle' ? 1 : 0, fire: frame.fire ? 1 : 0, reward, valid: true };
}
