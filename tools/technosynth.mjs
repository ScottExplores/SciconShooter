// Techno synthesis engine. Pure Node, no dependencies.
//
// The chiptune module (tools/chiptune.mjs) speaks 1983: bare oscillators and
// ADSR. Modern techno needs the other half of the vocabulary: synthesized
// drums, a resonant filter, detuned supersaws, and -- above all -- sidechain
// pumping, the ducking of everything melodic under each kick that makes a
// track breathe. This module owns those. Chiptune stays for the SFX cues,
// where it belongs.
//
// Everything is deterministic, so a regenerated track is byte-identical.

export const MUSIC_SAMPLE_RATE = 32000;

const TWO_PI = Math.PI * 2;

/** Deterministic noise. */
const createNoise = (seed = 777) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
};

/**
 * Chamberlin state-variable filter: the classic cheap resonant filter. Keeps
 * cutoff clamped well under Nyquist for stability.
 */
class Filter {
  constructor(rate) {
    this.rate = rate;
    this.low = 0;
    this.band = 0;
  }

  step(input, cutoff, resonance = 0.85) {
    const clamped = Math.min(this.rate * 0.22, Math.max(20, cutoff));
    const f = 2 * Math.sin((Math.PI * clamped) / this.rate);
    this.low += f * this.band;
    const high = input - this.low - resonance * this.band;
    this.band += f * high;
    return { low: this.low, band: this.band, high };
  }
}

const envelopeAt = (t, duration, env) => {
  const { attack = 0.003, decay = 0.06, sustain = 0.55, release = 0.08 } = env ?? {};
  const releaseStart = Math.max(0, duration - release);
  if (t < attack) return t / Math.max(attack, 1e-6);
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / Math.max(decay, 1e-6));
  if (t < releaseStart) return sustain;
  return sustain * Math.max(0, 1 - (t - releaseStart) / Math.max(release, 1e-6));
};

export class TechnoSong {
  /**
   * Two buses: `duck` carries everything melodic and is pumped by the kick
   * pattern; `dry` carries drums and risers, which must not duck themselves.
   * Writes wrap modulo the loop length, so decay tails fold around into the
   * loop start and the bed loops seamlessly.
   */
  constructor({ bars, bpm, rate = MUSIC_SAMPLE_RATE, wrap = true }) {
    this.bpm = bpm;
    this.rate = rate;
    this.wrap = wrap;
    this.beatSeconds = 60 / bpm;
    this.barSeconds = this.beatSeconds * 4;
    this.length = Math.round(bars * this.barSeconds * rate);
    this.duck = new Float32Array(this.length);
    this.dry = new Float32Array(this.length);
    this.noise = createNoise();
    this.kickBeats = new Set();
  }

  write(bus, index, value) {
    if (this.wrap) {
      bus[((index % this.length) + this.length) % this.length] += value;
    } else if (index >= 0 && index < this.length) {
      bus[index] += value;
    }
  }

  bar(barIndex) { return barIndex * this.barSeconds; }
  beat(barIndex, beatIndex) { return this.bar(barIndex) + beatIndex * this.beatSeconds; }
  sixteenth(barIndex, stepIndex) { return this.bar(barIndex) + stepIndex * (this.beatSeconds / 4); }

  // ------------------------------------------------------------------ drums

  /** Pitch-swept sine with a click: the four-on-the-floor anchor. */
  kick(start, gain = 1) {
    this.kickBeats.add(Math.round((start / this.beatSeconds) * 4) / 4);
    const startSample = Math.floor(start * this.rate);
    const bodySamples = Math.floor(0.24 * this.rate);
    let phase = 0;
    for (let index = 0; index < bodySamples; index += 1) {
      const t = index / this.rate;
      const frequency = 38 + 122 * Math.exp(-t / 0.028);
      phase += (TWO_PI * frequency) / this.rate;
      const amp = Math.exp(-t / 0.11) * gain;
      this.write(this.dry, startSample + index, Math.sin(phase) * amp * 0.95);
    }
    const clickSamples = Math.floor(0.004 * this.rate);
    for (let index = 0; index < clickSamples; index += 1) {
      this.write(this.dry, startSample + index, this.noise() * gain * 0.4);
    }
  }

  /** Three noise bursts and a tail: a techno clap. */
  clap(start, gain = 0.6) {
    const filter = new Filter(this.rate);
    for (const offset of [0, 0.011, 0.021]) {
      const startSample = Math.floor((start + offset) * this.rate);
      const burst = Math.floor(0.012 * this.rate);
      for (let index = 0; index < burst; index += 1) {
        const band = filter.step(this.noise(), 1900, 0.6).band;
        this.write(this.dry, startSample + index, band * gain * 1.6);
      }
    }
    const tailStart = Math.floor((start + 0.03) * this.rate);
    const tail = Math.floor(0.16 * this.rate);
    for (let index = 0; index < tail; index += 1) {
      const t = index / this.rate;
      const band = filter.step(this.noise(), 1700, 0.6).band;
      this.write(this.dry, tailStart + index, band * gain * 1.3 * Math.exp(-t / 0.05));
    }
  }

  hat(start, { open = false, gain = 0.3 } = {}) {
    const filter = new Filter(this.rate);
    const startSample = Math.floor(start * this.rate);
    const duration = open ? 0.22 : 0.045;
    const samples = Math.floor(duration * this.rate);
    for (let index = 0; index < samples; index += 1) {
      const t = index / this.rate;
      const high = filter.step(this.noise(), 6800, 0.5).high;
      this.write(this.dry, startSample + index, high * gain * Math.exp(-t / (open ? 0.09 : 0.016)));
    }
  }

  /** Accelerating snare roll: the last-bar fill that launches the loop over. */
  roll(start, beats, gain = 0.5) {
    const steps = Math.round(beats * 4);
    for (let step = 0; step < steps; step += 1) {
      const progress = step / Math.max(1, steps - 1);
      this.clap(start + step * (this.beatSeconds / 4), gain * (0.35 + 0.65 * progress));
    }
  }

  // ----------------------------------------------------------------- voices

  oscillatorSample(kind, phase) {
    switch (kind) {
      case 'saw': return ((phase % TWO_PI) / Math.PI) - 1;
      case 'square': return Math.sin(phase) >= 0 ? 1 : -1;
      case 'pulse': return (phase % TWO_PI) < Math.PI * 0.5 ? 1 : -1;
      case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(phase));
      default: return Math.sin(phase);
    }
  }

  /**
   * One filtered note on the duck bus. `detune` > 0 stacks supersaw voices,
   * which is where the wide trance-lead sound comes from. Cutoff can be a
   * function of note progress, which is where filter movement comes from.
   */
  note({
    frequency,
    start,
    duration,
    gain = 0.28,
    kind = 'saw',
    detune = 0,
    voices = 1,
    cutoff = 2200,
    resonance = 0.85,
    envelope,
    vibrato = 0,
    vibratoHz = 5.4
  }) {
    const startSample = Math.floor(start * this.rate);
    const samples = Math.ceil(duration * this.rate);
    const detunes = [];
    for (let voice = 0; voice < voices; voice += 1) {
      const spread = voices > 1 ? (voice / (voices - 1)) * 2 - 1 : 0;
      detunes.push(1 + spread * detune);
    }
    const filter = new Filter(this.rate);
    const phases = detunes.map((_, index) => (index * 1.7) % TWO_PI);
    for (let index = 0; index < samples; index += 1) {
      const t = index / this.rate;
      const progress = t / duration;
      const wobble = vibrato > 0 ? Math.sin(TWO_PI * vibratoHz * t) * vibrato : 0;
      let mixed = 0;
      for (let voice = 0; voice < detunes.length; voice += 1) {
        phases[voice] += (TWO_PI * (frequency * detunes[voice] + wobble)) / this.rate;
        mixed += this.oscillatorSample(kind, phases[voice]);
      }
      mixed /= detunes.length;
      const cut = typeof cutoff === 'function' ? cutoff(progress) : cutoff;
      const filtered = filter.step(mixed, cut, resonance).low;
      this.write(this.duck, startSample + index, filtered * gain * envelopeAt(t, duration, envelope));
    }
  }

  chord(frequencies, options) {
    for (const frequency of frequencies) {
      this.note({ ...options, frequency, gain: (options.gain ?? 0.28) / Math.sqrt(frequencies.length) });
    }
  }

  /** Noise sweep rising into the loop point: the classic two-bar riser. */
  riser(start, duration, gain = 0.3) {
    const filter = new Filter(this.rate);
    const startSample = Math.floor(start * this.rate);
    const samples = Math.ceil(duration * this.rate);
    for (let index = 0; index < samples; index += 1) {
      const t = index / this.rate;
      const progress = t / duration;
      const cutoff = 300 + 6200 * progress * progress;
      const band = filter.step(this.noise(), cutoff, 0.6).band;
      this.write(this.dry, startSample + index, band * gain * (0.25 + 0.75 * progress));
    }
  }

  // -------------------------------------------------------------------- mix

  /**
   * Applies the sidechain pump to the duck bus and folds the buses together.
   * The pump follows the actual kick placements, so off-grid kicks duck too.
   */
  render({ duckDepth = 0.42, duckRelease = 0.11, peak = 0.9 } = {}) {
    const kickTimes = [...this.kickBeats].map((beat) => beat * this.beatSeconds).sort((a, b) => a - b);
    const mixed = new Float32Array(this.length);
    const loopSeconds = this.length / this.rate;
    for (let index = 0; index < this.length; index += 1) {
      const t = index / this.rate;
      let sinceKick = Infinity;
      for (const kickTime of kickTimes) {
        const direct = t - kickTime;
        if (direct >= 0 && direct < sinceKick) sinceKick = direct;
        // The loop wraps, so the last kick of the loop also ducks the first
        // milliseconds after the wrap point.
        const wrapped = t + loopSeconds - kickTime;
        if (wrapped >= 0 && wrapped < sinceKick) sinceKick = wrapped;
      }
      const pump = sinceKick === Infinity ? 1 : 1 - duckDepth * Math.exp(-sinceKick / duckRelease);
      mixed[index] = this.duck[index] * pump + this.dry[index];
    }

    let max = 0;
    for (let index = 0; index < this.length; index += 1) max = Math.max(max, Math.abs(mixed[index]));
    const scale = max > 0 ? peak / max : 1;
    for (let index = 0; index < this.length; index += 1) {
      mixed[index] = Math.tanh(mixed[index] * scale * 1.25) * 0.94;
    }
    return mixed;
  }

  toWav(options) {
    const data = this.render(options ?? this.renderOptions);
    const buffer = Buffer.alloc(44 + data.length * 2);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + data.length * 2, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(this.rate, 24);
    buffer.writeUInt32LE(this.rate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(data.length * 2, 40);
    for (let index = 0; index < data.length; index += 1) {
      buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[index])) * 32767), 44 + index * 2);
    }
    return buffer;
  }
}

/** Note frequencies, extended low for techno bass. */
export const HZ = (() => {
  const names = ['C', 'Cs', 'D', 'Eb', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'Bb', 'B'];
  const table = {};
  for (let octave = 0; octave <= 6; octave += 1) {
    names.forEach((name, index) => {
      const midi = 12 * (octave + 1) + index;
      table[`${name}${octave}`] = 440 * (2 ** ((midi - 69) / 12));
    });
  }
  return table;
})();
