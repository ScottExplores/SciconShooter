#!/usr/bin/env node
// Generates three original, loopable in-match music beds for Scicon Shooter.
//
// The pack deliberately shares the existing audio system's deterministic
// techno vocabulary (synthesised drums, filtered saw bass, supersaw colour,
// and sidechain ducking) without copying any third-party recording or melody.
// Keeping every track on the same 148 BPM / eight-bar grid also lets the game
// crossfade between tracks without a large rhythmic or duration discontinuity.
//
// Usage: node tools/generate-match-music.mjs [--write]

// Without --write this is a dry run. With --write it emits the WAV files and
// their measured manifest under public/audio/scicon-match-music-v1/.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HZ, TechnoSong } from './technosynth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_ID = 'scicon-match-music-v1';
const OUT_DIR = path.join(root, 'public', 'audio', PACK_ID);
const PUBLIC_ROOT = `/audio/${PACK_ID}`;
const BPM = 148;
const BARS = 8;
const TARGET_PEAK = 0.54;
const SEAM_FADE_SECONDS = 0.006;

const note = (song, frequency, start, duration, options = {}) => {
  song.note({
    frequency,
    start,
    duration,
    kind: 'saw',
    cutoff: 1800,
    gain: 0.22,
    envelope: { attack: 0.003, decay: 0.055, sustain: 0.52, release: 0.045 },
    ...options
  });
};

const addSteadyDrums = (song, bar, { drive = 1, hats = 0.2, openHat = true } = {}) => {
  for (let beat = 0; beat < 4; beat += 1) song.kick(song.beat(bar, beat), drive);
  song.clap(song.beat(bar, 1), 0.38 * drive);
  song.clap(song.beat(bar, 3), 0.38 * drive);
  for (let step = 0; step < 16; step += 1) {
    if (step % 2 === 1 || step === 6 || step === 14) {
      song.hat(song.sixteenth(bar, step), {
        gain: hats * (step % 4 === 2 ? 1.15 : 0.68)
      });
    }
  }
  if (openHat) song.hat(song.sixteenth(bar, 14), { open: true, gain: hats * 0.62 });
};

const addPad = (song, bar, chord, { cutoff = 1320, gain = 0.18 } = {}) => {
  song.chord(chord, {
    start: song.bar(bar),
    duration: song.barSeconds,
    kind: 'saw',
    voices: 3,
    detune: 0.005,
    cutoff,
    gain,
    envelope: { attack: 0.045, decay: 0.18, sustain: 0.65, release: 0.24 }
  });
};

/**
 * OPEN ORBIT RELAY
 *
 * The welcoming combat loop: E minor, forward rolling bass, a compact
 * call-and-response lead, and enough air between phrases for weapon SFX.
 */
const openOrbitRelay = () => {
  const song = new TechnoSong({ bars: BARS, bpm: BPM });
  const chords = [
    [HZ.E3, HZ.G3, HZ.B3],
    [HZ.C3, HZ.E3, HZ.G3],
    [HZ.G2, HZ.B2, HZ.D3],
    [HZ.D3, HZ.Fs3, HZ.A3]
  ];
  const roots = [HZ.E1, HZ.C2, HZ.G1, HZ.D2];
  const bassPattern = [0, 3, 4, 6, 8, 11, 12, 14];

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chords[bar % chords.length];
    const root = roots[bar % roots.length];
    addSteadyDrums(song, bar, { drive: 0.83, hats: 0.17 });
    addPad(song, bar, chord, { cutoff: 1380, gain: 0.16 });

    for (const step of bassPattern) {
      note(song, step === 11 ? root * 2 : root, song.sixteenth(bar, step), song.beatSeconds * 0.2, {
        cutoff: 690,
        gain: 0.31,
        resonance: 0.92
      });
    }

    const arp = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 2];
    for (const step of [1, 5, 9, 13]) {
      note(song, arp[(step - 1) / 4], song.sixteenth(bar, step), song.beatSeconds * 0.34, {
        kind: 'pulse',
        cutoff: 2500,
        gain: 0.105,
        envelope: { attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.035 }
      });
    }
  }

  const lead = [
    [0, 0, HZ.E5, 1], [0, 1.5, HZ.G5, 0.5], [0, 2, HZ.B5, 1],
    [1, 0, HZ.G5, 1], [1, 2, HZ.E5, 1.5],
    [4, 0, HZ.B4, 1], [4, 1, HZ.D5, 1], [4, 2, HZ.E5, 1],
    [5, 0, HZ.G5, 1], [5, 2, HZ.Fs5, 1], [5, 3, HZ.D5, 0.75]
  ];
  for (const [bar, beat, frequency, beats] of lead) {
    note(song, frequency, song.beat(bar, beat), song.beatSeconds * beats * 0.9, {
      voices: 3,
      detune: 0.006,
      cutoff: 3300,
      gain: 0.13,
      vibrato: 2.4,
      envelope: { attack: 0.012, decay: 0.09, sustain: 0.58, release: 0.1 }
    });
  }
  song.roll(song.beat(7, 3), 1, 0.18);
  song.renderOptions = { duckDepth: 0.48, duckRelease: 0.105, peak: TARGET_PEAK };
  return song;
};

/**
 * ION VEIL PURSUIT
 *
 * F-sharp minor with a clipped syncopated bass and glassy pulse figures. It
 * raises urgency for middle waves without occupying the boss-warning range.
 */
const ionVeilPursuit = () => {
  const song = new TechnoSong({ bars: BARS, bpm: BPM });
  const chords = [
    [HZ.Fs3, HZ.A3, HZ.Cs4],
    [HZ.D3, HZ.Fs3, HZ.A3],
    [HZ.A2, HZ.Cs3, HZ.E3],
    [HZ.E3, HZ.Gs3, HZ.B3]
  ];
  const roots = [HZ.Fs1, HZ.D2, HZ.A1, HZ.E2];
  const bassPattern = [0, 2, 5, 7, 8, 10, 13, 15];

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chords[bar % chords.length];
    const root = roots[bar % roots.length];
    addSteadyDrums(song, bar, { drive: 0.88, hats: 0.19, openHat: bar % 2 === 1 });
    song.kick(song.sixteenth(bar, 11), 0.32);
    addPad(song, bar, chord, { cutoff: 1180 + (bar % 4) * 110, gain: 0.14 });

    for (const step of bassPattern) {
      const octave = step === 7 || step === 15 ? 2 : 1;
      note(song, root * octave, song.sixteenth(bar, step), song.beatSeconds * 0.19, {
        cutoff: 760,
        gain: 0.3,
        resonance: 0.96
      });
    }

    const pulse = [chord[0] * 2, chord[2] * 2, chord[1] * 2, chord[2] * 2];
    for (const step of [2, 6, 10, 14]) {
      note(song, pulse[(step - 2) / 4], song.sixteenth(bar, step), song.beatSeconds * 0.29, {
        kind: 'pulse',
        cutoff: 2850,
        resonance: 0.72,
        gain: 0.1,
        envelope: { attack: 0.002, decay: 0.035, sustain: 0.25, release: 0.03 }
      });
    }
  }

  const lead = [
    [2, 0, HZ.Cs5], [2, 1, HZ.E5], [2, 2, HZ.Fs5], [2, 3, HZ.A5],
    [3, 0, HZ.Gs5], [3, 1, HZ.Fs5], [3, 2, HZ.E5],
    [6, 0, HZ.A4], [6, 1, HZ.Cs5], [6, 2, HZ.E5], [6, 3, HZ.Fs5],
    [7, 0, HZ.E5], [7, 2, HZ.Cs5]
  ];
  for (const [bar, beat, frequency] of lead) {
    note(song, frequency, song.beat(bar, beat), song.beatSeconds * 0.78, {
      voices: 3,
      detune: 0.007,
      cutoff: 3500,
      gain: 0.12,
      vibrato: 2.8,
      envelope: { attack: 0.008, decay: 0.07, sustain: 0.56, release: 0.09 }
    });
  }
  song.roll(song.beat(7, 3), 1, 0.2);
  song.renderOptions = { duckDepth: 0.5, duckRelease: 0.1, peak: TARGET_PEAK };
  return song;
};

/**
 * EVENT HORIZON RUN
 *
 * D phrygian shares the boss bed's dark harmonic colour, but the sparser
 * percussion and two-note answer motif leave room for boss attacks and cues.
 */
const eventHorizonRun = () => {
  const song = new TechnoSong({ bars: BARS, bpm: BPM });
  const chords = [
    [HZ.D3, HZ.F3, HZ.A3],
    [HZ.Eb3, HZ.G3, HZ.Bb3],
    [HZ.Bb2, HZ.D3, HZ.F3],
    [HZ.C3, HZ.Eb3, HZ.G3]
  ];
  const roots = [HZ.D1, HZ.Eb1, HZ.Bb1, HZ.C2];
  const bassPattern = [0, 1, 4, 6, 8, 9, 12, 14];

  song.note({
    frequency: HZ.D1,
    start: 0,
    duration: song.barSeconds * BARS,
    kind: 'saw',
    voices: 3,
    detune: 0.003,
    cutoff: 250,
    gain: 0.1,
    envelope: { attack: 0.18, decay: 0.3, sustain: 0.78, release: 0.32 }
  });

  for (let bar = 0; bar < BARS; bar += 1) {
    const chord = chords[bar % chords.length];
    const root = roots[bar % roots.length];
    addSteadyDrums(song, bar, { drive: 0.86, hats: 0.15, openHat: bar % 2 === 0 });
    if (bar % 2 === 1) song.kick(song.sixteenth(bar, 11), 0.38);
    addPad(song, bar, chord, { cutoff: 980, gain: 0.13 });

    for (const step of bassPattern) {
      const frequency = (step === 6 || step === 14) ? root * 2 : root;
      note(song, frequency, song.sixteenth(bar, step), song.beatSeconds * 0.2, {
        cutoff: 620,
        gain: 0.32,
        resonance: 1
      });
    }

    for (const step of [3, 7, 11, 15]) {
      song.chord(chord.slice(0, 2), {
        start: song.sixteenth(bar, step),
        duration: song.beatSeconds * 0.18,
        kind: 'saw',
        voices: 3,
        detune: 0.006,
        cutoff: 1850,
        resonance: 0.9,
        gain: 0.12,
        envelope: { attack: 0.002, decay: 0.035, sustain: 0.32, release: 0.03 }
      });
    }
  }

  const lead = [
    [1, 0, HZ.D5, 1.5], [1, 2, HZ.Eb5, 1.5],
    [3, 0, HZ.C5, 1.5], [3, 2, HZ.D5, 1.5],
    [5, 0, HZ.F5, 1], [5, 1, HZ.Eb5, 1], [5, 2, HZ.D5, 1.5],
    [7, 0, HZ.C5, 1], [7, 1, HZ.Eb5, 1], [7, 2, HZ.D5, 1.5]
  ];
  for (const [bar, beat, frequency, beats] of lead) {
    note(song, frequency, song.beat(bar, beat), song.beatSeconds * beats * 0.9, {
      voices: 3,
      detune: 0.008,
      cutoff: 2900,
      gain: 0.115,
      vibrato: 3.2,
      vibratoHz: 4.8,
      envelope: { attack: 0.025, decay: 0.11, sustain: 0.6, release: 0.12 }
    });
  }
  song.roll(song.beat(7, 3), 1, 0.17);
  song.renderOptions = { duckDepth: 0.51, duckRelease: 0.11, peak: TARGET_PEAK };
  return song;
};

const TRACKS = [
  {
    id: 'open-orbit-relay',
    title: 'Open Orbit Relay',
    file: 'music-open-orbit-relay.wav',
    build: openOrbitRelay,
    key: 'E minor',
    intensity: 'standard',
    use: 'Opening and standard combat waves',
    character: 'Forward rolling bass, bright relay arpeggio, compact call-and-response lead.'
  },
  {
    id: 'ion-veil-pursuit',
    title: 'Ion Veil Pursuit',
    file: 'music-ion-veil-pursuit.wav',
    build: ionVeilPursuit,
    key: 'F-sharp minor',
    intensity: 'elevated',
    use: 'Mid-run combat and denser formations',
    character: 'Syncopated bass, glassy pulse figures, and a restrained ascending pursuit motif.'
  },
  {
    id: 'event-horizon-run',
    title: 'Event Horizon Run',
    file: 'music-event-horizon-run.wav',
    build: eventHorizonRun,
    key: 'D phrygian',
    intensity: 'high',
    use: 'Late-run pressure and boss-adjacent combat',
    character: 'Dark drone, phrygian stabs, galloped accents, and sparse warning-range melody.'
  }
];

const softenLoopSeam = (wav, rate, seconds = SEAM_FADE_SECONDS) => {
  const output = Buffer.from(wav);
  const sampleCount = output.readUInt32LE(40) / 2;
  const fadeSamples = Math.max(1, Math.min(Math.floor(rate * seconds), Math.floor(sampleCount / 4)));
  for (let index = 0; index < fadeSamples; index += 1) {
    const gain = Math.sin((index / Math.max(1, fadeSamples - 1)) * Math.PI * 0.5);
    const startOffset = 44 + index * 2;
    const endOffset = 44 + (sampleCount - 1 - index) * 2;
    output.writeInt16LE(Math.round(output.readInt16LE(startOffset) * gain), startOffset);
    output.writeInt16LE(Math.round(output.readInt16LE(endOffset) * gain), endOffset);
  }
  return output;
};

const measureWav = (wav) => {
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitDepth = wav.readUInt16LE(34);
  const dataBytes = wav.readUInt32LE(40);
  const sampleCount = dataBytes / 2;
  let sumSquares = 0;
  let peak = 0;
  for (let offset = 44; offset < 44 + dataBytes; offset += 2) {
    const sample = wav.readInt16LE(offset) / 32768;
    peak = Math.max(peak, Math.abs(sample));
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / sampleCount);
  const toDb = (value) => Number((20 * Math.log10(Math.max(value, 1e-9))).toFixed(2));
  return {
    durationSeconds: Number((sampleCount / channels / sampleRate).toFixed(3)),
    sampleRateHz: sampleRate,
    channels,
    bitDepth,
    byteLength: wav.length,
    measuredSamplePeakDbfs: toDb(peak),
    measuredRmsDbfs: toDb(rms),
    seamEndpointDelta: Math.abs(wav.readInt16LE(44) - wav.readInt16LE(44 + (sampleCount - 1) * 2))
  };
};

const write = process.argv.includes('--write');
if (write) fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = {
  schemaVersion: 1,
  id: PACK_ID,
  generator: 'tools/generate-match-music.mjs',
  provenance: {
    type: 'project-owned original procedural synthesis',
    samplesUsed: false,
    thirdPartyMelodiesUsed: false,
    note: 'Deterministic synthesis only. These compositions do not imitate or derive from a named recording.'
  },
  sharedTiming: {
    bpm: BPM,
    bars: BARS,
    meter: '4/4',
    loop: true,
    reason: 'Matching grids and durations keep playlist crossfades rhythmically coherent.'
  },
  mixPolicy: {
    intent: 'In-match beds with baked headroom for player shots, enemy fire, warnings, and defeat/victory stingers.',
    renderPeak: TARGET_PEAK,
    seamFadeMilliseconds: SEAM_FADE_SECONDS * 1000,
    integrationNote: 'Route through the existing music bus; do not normalize these files upward per track.'
  },
  tracks: []
};

let totalBytes = 0;
for (const track of TRACKS) {
  const song = track.build();
  const wav = softenLoopSeam(song.toWav(), song.rate);
  const measurements = measureWav(wav);
  const sha256 = crypto.createHash('sha256').update(wav).digest('hex');
  totalBytes += wav.length;
  if (write) fs.writeFileSync(path.join(OUT_DIR, track.file), wav);
  manifest.tracks.push({
    id: track.id,
    title: track.title,
    url: `${PUBLIC_ROOT}/${track.file}`,
    key: track.key,
    intensity: track.intensity,
    use: track.use,
    character: track.character,
    loop: true,
    sha256,
    ...measurements
  });
  console.log(`${track.title.padEnd(23)} ${measurements.durationSeconds.toFixed(2)}s  ${measurements.measuredRmsDbfs.toFixed(2)} dBFS RMS  ${(wav.length / 1024).toFixed(0)} KB`);
}

console.log(`\n${TRACKS.length} original match loops, ${(totalBytes / 1024 / 1024).toFixed(2)} MB total.`);
if (write) {
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, OUT_DIR)}`);
} else {
  console.log('Dry run. Pass --write to emit WAVs and the manifest.');
}
