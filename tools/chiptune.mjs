// Minimal chiptune synthesis + WAV encoder. Pure Node, no dependencies.
//
// Square, triangle, saw, and noise oscillators with ADSR envelopes: the actual
// vocabulary of arcade-era sound hardware, which is what makes the output sit
// with the game's pixel art instead of against it.

const SAMPLE_RATE = 44100;

export const NOTES = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
  C6: 1046.50, D6: 1174.66, E6: 1318.51, G6: 1567.98
};

/** Deterministic noise, so a regenerated asset is byte-identical. */
const createNoise = (seed = 12345) => {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  };
};

const oscillator = (kind, phase, noise) => {
  switch (kind) {
    case 'square': return Math.sin(phase) >= 0 ? 1 : -1;
    // 25% duty reads thinner and more "arcade" than a plain square.
    case 'pulse': return (phase % (Math.PI * 2)) < Math.PI * 0.5 ? 1 : -1;
    case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(phase));
    case 'saw': return ((phase % (Math.PI * 2)) / Math.PI) - 1;
    case 'sine': return Math.sin(phase);
    case 'noise': return noise();
    default: return 0;
  }
};

const envelopeAt = (t, duration, env) => {
  const { attack = 0.005, decay = 0.05, sustain = 0.6, release = 0.08 } = env ?? {};
  const releaseStart = Math.max(0, duration - release);
  if (t < attack) return t / Math.max(attack, 1e-6);
  if (t < attack + decay) return 1 - (1 - sustain) * ((t - attack) / Math.max(decay, 1e-6));
  if (t < releaseStart) return sustain;
  return sustain * Math.max(0, 1 - (t - releaseStart) / Math.max(release, 1e-6));
};

export class Track {
  /**
   * Music loops run several seconds and dominate download size, so they are
   * generated at a lower rate. Chiptune has almost no content above 10kHz, so
   * 22050Hz halves the bytes with no audible cost.
   */
  constructor(durationSeconds, sampleRate = SAMPLE_RATE) {
    this.rate = sampleRate;
    this.length = Math.ceil(durationSeconds * sampleRate);
    this.data = new Float32Array(this.length);
    this.noise = createNoise();
  }

  /**
   * Adds one voice. `frequency` may be a number or a function of normalised
   * time, which is what produces sweeps: lasers falling, warnings rising.
   */
  tone({
    kind = 'square',
    frequency = 440,
    start = 0,
    duration = 0.2,
    gain = 0.3,
    envelope,
    vibrato = 0,
    vibratoHz = 6
  }) {
    const startSample = Math.floor(start * this.rate);
    const sampleCount = Math.ceil(duration * this.rate);
    let phase = 0;
    for (let index = 0; index < sampleCount; index += 1) {
      const target = startSample + index;
      if (target < 0 || target >= this.length) continue;
      const t = index / this.rate;
      const progress = t / duration;
      const base = typeof frequency === 'function' ? frequency(progress) : frequency;
      const wobble = vibrato > 0 ? Math.sin(2 * Math.PI * vibratoHz * t) * vibrato : 0;
      phase += (2 * Math.PI * Math.max(1, base + wobble)) / this.rate;
      this.data[target] += oscillator(kind, phase, this.noise)
        * gain * envelopeAt(t, duration, envelope);
    }
    return this;
  }

  /** Plays a sequence of notes back to back from `start`. */
  sequence({ notes, start = 0, noteSeconds = 0.12, ...voice }) {
    notes.forEach((note, index) => {
      if (note === null) return;
      this.tone({ ...voice, frequency: note, start: start + index * noteSeconds, duration: noteSeconds * 0.92 });
    });
    return this;
  }

  /** Soft-clips into range so stacked voices distort musically, not harshly. */
  normalize(peak = 0.86) {
    let max = 0;
    for (let index = 0; index < this.length; index += 1) max = Math.max(max, Math.abs(this.data[index]));
    if (max === 0) return this;
    const scale = peak / max;
    for (let index = 0; index < this.length; index += 1) {
      this.data[index] = Math.tanh(this.data[index] * scale * 1.15) * 0.92;
    }
    return this;
  }

  toWav() {
    const samples = this.length;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + samples * 2, 4);
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
    buffer.writeUInt32LE(samples * 2, 40);
    for (let index = 0; index < samples; index += 1) {
      const clamped = Math.max(-1, Math.min(1, this.data[index]));
      buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
    }
    return buffer;
  }
}

export { SAMPLE_RATE };
