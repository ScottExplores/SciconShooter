/** Procedural layers feed the existing AudioService SFX bus; no audio assets or timers. */
export type FeelAudioCue = 'shoot' | 'impact' | 'hit' | 'armored_hit' | 'explosion_small'
  | 'explosion_elite' | 'explosion_boss_part' | 'coin' | 'powerup' | 'boss_alert' | 'siren'
  | 'phase_change' | 'ui_click' | 'ui_confirm' | 'ui_back' | 'ui_error' | 'ui_open' | 'ui_close';

export interface AudioLayer {
  wave: OscillatorType | 'noise';
  startHz: number;
  endHz: number;
  duration: number;
  gain: number;
  delay?: number;
  attack?: number;
  filterHz?: number;
  sweep?: readonly [number, number][];
}

export const FEEL_AUDIO_MAX_VOICES = 24;
export const PICKUP_LADDER_RESET_MS = 650;
// Preserve each hull's established voice while adding a quiet transient layer.
export const PLAYER_WEAPON_VOICE_PROFILES = {
  bio: { waveform: 'triangle', startHz: 760, shoulderHz: 560, endHz: 240, duration: 0.068, attack: 0.0025, gain: 0.12 },
  eth: { waveform: 'sine', startHz: 1320, shoulderHz: 1760, endHz: 620, duration: 0.055, attack: 0.0015, gain: 0.11 },
  btc: { waveform: 'triangle', startHz: 510, shoulderHz: 330, endHz: 155, duration: 0.09, attack: 0.003, gain: 0.13 }
} as const;
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;

export function pickupPitch(combo: number): number {
  return 2 ** (PENTATONIC[clamp(Math.floor(finite(combo, 1)) - 1, 0, 9)] / 12);
}

export class PickupAudioLadder {
  private lastAt = -Infinity;
  private count = 0;

  next(nowMs: number, explicitCombo?: number): number {
    this.count = explicitCombo === undefined
      ? (nowMs - this.lastAt <= PICKUP_LADDER_RESET_MS ? Math.min(10, this.count + 1) : 1)
      : clamp(Math.floor(finite(explicitCombo, 1)), 1, 10);
    this.lastAt = nowMs;
    return this.count;
  }
}

export interface FeelAudioOptions {
  pitch?: number;
  intensity?: number;
  pickupCombo?: number;
  family?: 'research' | 'bio' | 'eth' | 'btc';
}

/** Pure recipes keep tuning and envelope/voice-budget tests independent of WebAudio. */
export function createCueLayers(cue: FeelAudioCue, options: FeelAudioOptions = {}): AudioLayer[] {
  const pitch = clamp(finite(options.pitch, 1), 0.5, 1.8);
  const intensity = clamp(finite(options.intensity, 1), 0.4, 1.4);
  const tone = (wave: OscillatorType, startHz: number, endHz: number, duration: number, gain: number, delay = 0): AudioLayer => (
    { wave, startHz: startHz * pitch, endHz: endHz * pitch, duration, gain, delay, attack: 0.003 }
  );
  const noise = (duration: number, gain: number, filterHz: number, delay = 0): AudioLayer => (
    { wave: 'noise', startHz: 0, endHz: 0, duration, gain, filterHz, delay, attack: 0.002 }
  );

  switch (cue) {
    case 'shoot': {
      const voice = options.family && options.family !== 'research' ? PLAYER_WEAPON_VOICE_PROFILES[options.family] : null;
      return [voice ? {
        ...tone(voice.waveform, voice.startHz, voice.endHz, voice.duration, voice.gain),
        sweep: [[0.012, voice.shoulderHz * pitch]], attack: voice.attack
      } : tone('triangle', 620, 180, 0.065, 0.10), noise(0.022, 0.022, 4200)];
    }
    case 'impact':
      return [tone('triangle', 360, 105, 0.052, 0.075), noise(0.038, 0.06, 2900)];
    case 'hit':
      return [tone('triangle', 155, 46, 0.17, 0.22), noise(0.13, 0.17, 1800)];
    case 'armored_hit':
      return [tone('sine', 2350, 1850, 0.115, 0.07), tone('sine', 3470, 2890, 0.065, 0.036), noise(0.022, 0.045, 4800)];
    case 'explosion_small':
    case 'explosion_elite':
    case 'explosion_boss_part': {
      const tier = cue === 'explosion_small' ? 0 : cue === 'explosion_elite' ? 1 : 2;
      const duration = [0.24, 0.44, 0.65][tier];
      const layers = [
        tone('sine', [145, 108, 82][tier], [48, 33, 26][tier], duration, (0.18 + tier * 0.04) * intensity),
        noise(duration * 0.86, (0.17 + tier * 0.035) * intensity, [2200, 1500, 1050][tier]),
        noise(0.075 + tier * 0.03, 0.07 * intensity, 4200, 0.012)
      ];
      if (tier > 0) layers.push(tone('triangle', 420, 95, 0.15 + tier * 0.04, 0.065, 0.045));
      return layers;
    }
    case 'coin': {
      const ladder = pickupPitch(options.pickupCombo ?? 1);
      return [tone('sine', 880 * ladder, 1174 * ladder, 0.115, 0.095), tone('sine', 1760 * ladder, 1760 * ladder, 0.075, 0.026, 0.015)];
    }
    case 'powerup':
      return [tone('triangle', 392, 784, 0.16, 0.11), tone('sine', 659, 1318, 0.22, 0.10, 0.09), tone('sine', 988, 1976, 0.26, 0.085, 0.18)];
    case 'boss_alert':
    case 'siren':
      return [
        { ...tone('triangle', 174, 174, 0.82, 0.14), sweep: [[0.20, 258 * pitch], [0.4, 174 * pitch], [0.6, 258 * pitch]] },
        { ...tone('sine', 696, 696, 0.82, 0.085), sweep: [[0.20, 516 * pitch], [0.4, 696 * pitch], [0.6, 516 * pitch]] }
      ];
    case 'phase_change':
      return [tone('sine', 140, 560, 0.32, 0.16), tone('triangle', 1120, 280, 0.36, 0.075, 0.035), noise(0.26, 0.08, 3000)];
    case 'ui_confirm':
      return [tone('sine', 660, 660, 0.07, 0.09), tone('sine', 990, 990, 0.12, 0.075, 0.05)];
    case 'ui_error':
      return [tone('triangle', 210, 170, 0.10, 0.08), tone('sine', 160, 120, 0.10, 0.06, 0.06)];
    case 'ui_back':
    case 'ui_close':
      return [tone('sine', 780, 440, 0.08, 0.08)];
    case 'ui_open':
      return [tone('sine', 440, 880, 0.10, 0.08)];
    case 'ui_click':
      return [tone('sine', 1050, 720, 0.045, 0.075), noise(0.016, 0.018, 3500)];
  }
}

type SynthSource = OscillatorNode | AudioBufferSourceNode;
type PlayingLayer = { source: SynthSource; gain: GainNode; filter?: BiquadFilterNode; priority: number };

/** A bounded synth bank. Short shot/hit voices yield capacity to important cues. */
export class FeelAudioSynth {
  private readonly active = new Set<PlayingLayer>();
  private noiseBuffer: AudioBuffer | null = null;

  constructor(private readonly context: AudioContext, private readonly output: GainNode) {}

  get activeVoiceCount() { return this.active.size; }

  private getNoiseBuffer() {
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate), this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    // One reusable seeded noise second avoids buffer allocation in combat.
    let seed = 0x51c0a;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[i] = (seed >>> 0) / 0x80000000 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private release(layer: PlayingLayer) {
    this.active.delete(layer);
    layer.source.disconnect();
    layer.gain.disconnect();
    layer.filter?.disconnect();
  }

  stop() {
    for (const layer of this.active) {
      try { layer.source.stop(); } catch { /* Already ended. */ }
      this.release(layer);
    }
  }

  play(cue: FeelAudioCue, options: FeelAudioOptions = {}): boolean {
    if (this.context.state !== 'running') return false;
    const layers = createCueLayers(cue, options);
    const priority = cue === 'shoot' || cue === 'impact' || cue === 'armored_hit' ? 0
      : cue === 'boss_alert' || cue === 'siren' || cue === 'explosion_boss_part' || cue === 'phase_change' ? 2 : 1;
    while (this.active.size + layers.length > FEEL_AUDIO_MAX_VOICES) {
      const victim = [...this.active].find((layer) => layer.priority < priority);
      if (!victim) return false;
      try { victim.source.stop(); } catch { /* Already ended. */ }
      this.release(victim);
    }

    const now = this.context.currentTime;
    for (const recipe of layers) {
      const start = now + (recipe.delay ?? 0);
      const end = start + recipe.duration;
      const gain = this.context.createGain();
      const source = recipe.wave === 'noise' ? this.context.createBufferSource() : this.context.createOscillator();
      let filter: BiquadFilterNode | undefined;
      if (recipe.wave === 'noise') {
        (source as AudioBufferSourceNode).buffer = this.getNoiseBuffer();
        filter = this.context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(recipe.filterHz ?? 2500, start);
        filter.frequency.exponentialRampToValueAtTime(350, end);
        source.connect(filter);
        filter.connect(gain);
      } else {
        const oscillator = source as OscillatorNode;
        oscillator.type = recipe.wave;
        oscillator.frequency.setValueAtTime(recipe.startHz, start);
        for (const [time, hz] of recipe.sweep ?? []) oscillator.frequency.linearRampToValueAtTime(hz, start + time);
        oscillator.frequency.exponentialRampToValueAtTime(recipe.endHz, end);
        source.connect(gain);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(recipe.gain, start + (recipe.attack ?? 0.003));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(this.output);
      const playing = { source, gain, filter, priority };
      this.active.add(playing);
      source.onended = () => this.release(playing);
      source.start(start);
      source.stop(end + 0.008);
    }
    return true;
  }
}
