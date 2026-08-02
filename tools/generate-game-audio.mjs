#!/usr/bin/env node
// Generates the game's sound effects and music as chiptune WAVs.
//
// Everything is synthesised from square/pulse/triangle/noise oscillators, the
// same palette arcade sound hardware actually had, so the audio sits with the
// pixel art rather than against it. No sample library and no audio generator is
// involved; see tools/chiptune.mjs.
//
// Usage: node tools/generate-game-audio.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Track, NOTES as N } from './chiptune.mjs';
import { TechnoSong, HZ } from './technosynth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_ID = 'scicon-audio-v1';
const OUT_DIR = path.join(root, 'public', 'audio', PACK_ID);
const PUBLIC_ROOT = `/audio/${PACK_ID}`;

/** Linear sweep helper: frequency as a function of normalised time. */
const sweep = (from, to) => (t) => from + (to - from) * t;
const sweepExp = (from, to) => (t) => from * ((to / from) ** t);

// ---------------------------------------------------------------- interface
const uiTap = () => new Track(0.09)
  .tone({ kind: 'pulse', frequency: N.E5, duration: 0.05, gain: 0.32, envelope: { attack: 0.001, decay: 0.02, sustain: 0.3, release: 0.03 } })
  .tone({ kind: 'square', frequency: N.B5, start: 0.012, duration: 0.04, gain: 0.16, envelope: { attack: 0.001, decay: 0.015, sustain: 0.2, release: 0.02 } })
  .normalize(0.55);

const uiConfirm = () => new Track(0.26)
  .sequence({ notes: [N.E5, N.A5], noteSeconds: 0.09, kind: 'pulse', gain: 0.3, envelope: { attack: 0.002, decay: 0.03, sustain: 0.55, release: 0.05 } })
  .tone({ kind: 'triangle', frequency: N.A4, duration: 0.22, gain: 0.16, envelope: { attack: 0.004, decay: 0.06, sustain: 0.4, release: 0.09 } })
  .normalize(0.62);

const uiBack = () => new Track(0.16)
  .tone({ kind: 'pulse', frequency: sweep(N.A4, N.D4), duration: 0.12, gain: 0.28, envelope: { attack: 0.002, decay: 0.03, sustain: 0.45, release: 0.06 } })
  .normalize(0.55);

const uiDenied = () => new Track(0.22)
  .tone({ kind: 'square', frequency: N.D3, duration: 0.09, gain: 0.3, envelope: { attack: 0.001, decay: 0.02, sustain: 0.7, release: 0.04 } })
  .tone({ kind: 'square', frequency: N.C3, start: 0.1, duration: 0.11, gain: 0.3, envelope: { attack: 0.001, decay: 0.02, sustain: 0.7, release: 0.05 } })
  .normalize(0.6);

const uiUpgrade = () => new Track(0.5)
  .sequence({ notes: [N.C5, N.E5, N.G5, N.C6], noteSeconds: 0.085, kind: 'pulse', gain: 0.26, envelope: { attack: 0.002, decay: 0.04, sustain: 0.5, release: 0.06 } })
  .tone({ kind: 'triangle', frequency: N.C4, duration: 0.46, gain: 0.18, envelope: { attack: 0.01, decay: 0.1, sustain: 0.45, release: 0.16 } })
  .tone({ kind: 'noise', frequency: 900, start: 0.33, duration: 0.14, gain: 0.06, envelope: { attack: 0.005, decay: 0.05, sustain: 0.2, release: 0.08 } })
  .normalize(0.7);

// ------------------------------------------------------------------ enemies
const enemyShoot = () => new Track(0.13)
  .tone({ kind: 'square', frequency: sweepExp(720, 210), duration: 0.1, gain: 0.24, envelope: { attack: 0.001, decay: 0.03, sustain: 0.35, release: 0.05 } })
  .normalize(0.5);

const enemyDive = () => new Track(0.34)
  .tone({ kind: 'saw', frequency: sweepExp(240, 1150), duration: 0.3, gain: 0.2, envelope: { attack: 0.02, decay: 0.08, sustain: 0.55, release: 0.12 }, vibrato: 18, vibratoHz: 11 })
  .normalize(0.55);

const enemyDeath = () => new Track(0.26)
  .tone({ kind: 'noise', frequency: 1, duration: 0.22, gain: 0.34, envelope: { attack: 0.001, decay: 0.09, sustain: 0.2, release: 0.11 } })
  .tone({ kind: 'square', frequency: sweepExp(430, 90), duration: 0.18, gain: 0.16, envelope: { attack: 0.001, decay: 0.05, sustain: 0.3, release: 0.09 } })
  .normalize(0.65);

const enemyArmored = () => new Track(0.16)
  .tone({ kind: 'square', frequency: 150, duration: 0.11, gain: 0.26, envelope: { attack: 0.001, decay: 0.03, sustain: 0.5, release: 0.06 } })
  .tone({ kind: 'noise', frequency: 1, duration: 0.07, gain: 0.14, envelope: { attack: 0.001, decay: 0.03, sustain: 0.2, release: 0.03 } })
  .normalize(0.55);

// ------------------------------------------------------------------- bosses
const eliteBossWarning = () => new Track(1.15)
  .sequence({ notes: [N.A3, N.A3, N.C4, N.A3], noteSeconds: 0.26, kind: 'pulse', gain: 0.26, envelope: { attack: 0.01, decay: 0.06, sustain: 0.6, release: 0.1 } })
  .tone({ kind: 'triangle', frequency: N.A2, duration: 1.1, gain: 0.2, envelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 0.3 } })
  .normalize(0.72);

const majorBossWarning = () => new Track(1.7)
  .sequence({ notes: [N.D3, N.D3, N.F3, N.A3, N.D4], noteSeconds: 0.3, kind: 'pulse', gain: 0.28, envelope: { attack: 0.01, decay: 0.07, sustain: 0.62, release: 0.12 } })
  .tone({ kind: 'saw', frequency: sweep(N.D2, N.D3), duration: 1.6, gain: 0.2, envelope: { attack: 0.08, decay: 0.3, sustain: 0.55, release: 0.4 }, vibrato: 4, vibratoHz: 5 })
  .tone({ kind: 'noise', frequency: 1, start: 1.4, duration: 0.28, gain: 0.1, envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.14 } })
  .normalize(0.8);

const bossHit = () => new Track(0.15)
  .tone({ kind: 'noise', frequency: 1, duration: 0.1, gain: 0.26, envelope: { attack: 0.001, decay: 0.04, sustain: 0.25, release: 0.05 } })
  .tone({ kind: 'square', frequency: 210, duration: 0.09, gain: 0.2, envelope: { attack: 0.001, decay: 0.03, sustain: 0.4, release: 0.04 } })
  .normalize(0.58);

const bossDefeat = () => {
  const track = new Track(1.9);
  for (let index = 0; index < 6; index += 1) {
    track.tone({ kind: 'noise', frequency: 1, start: index * 0.16, duration: 0.3, gain: 0.22, envelope: { attack: 0.002, decay: 0.1, sustain: 0.2, release: 0.16 } });
  }
  return track
    .sequence({ notes: [N.C4, N.G4, N.C5, N.E5, N.G5], start: 0.95, noteSeconds: 0.16, kind: 'pulse', gain: 0.26, envelope: { attack: 0.004, decay: 0.05, sustain: 0.6, release: 0.09 } })
    .tone({ kind: 'triangle', frequency: N.C3, start: 0.95, duration: 0.9, gain: 0.2, envelope: { attack: 0.02, decay: 0.2, sustain: 0.5, release: 0.3 } })
    .normalize(0.82);
};

// -------------------------------------------------------------------- music
//
// The first music pass was chiptune, and it read as 1983 next to the neon art.
// These beds are techno, built on tools/technosynth.mjs: four-on-the-floor
// kicks, sidechain pump, filtered saw bass, supersaw pads and leads, and a
// riser into every loop point. Each bed INTENSIFIES across its eight bars --
// layers enter as it runs -- then the riser hands it back to the top.

/**
 * Home bed: techno optimist. 122 BPM in C major on the classic I-V-vi-IV,
 * warm pads under a plucked arp, gentle kick. Confident, not aggressive.
 */
const menuTheme = () => {
  const song = new TechnoSong({ bars: 8, bpm: 122 });
  const chords = [
    [HZ.C3, HZ.E3, HZ.G3], [HZ.G2, HZ.B2, HZ.D3],
    [HZ.A2, HZ.C3, HZ.E3], [HZ.F2, HZ.A2, HZ.C3]
  ];
  const roots = [HZ.C2, HZ.G1, HZ.A1, HZ.F1];

  for (let bar = 0; bar < 8; bar += 1) {
    const chord = chords[bar % 4];
    const root = roots[bar % 4];

    // The build IS the track: bars 0-1 are pads and arp alone, the floor
    // arrives at bar 2, the claps and lead at bar 4, the riser at bar 7.
    if (bar >= 2) {
      for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) song.kick(song.beat(bar, beatIndex), 0.8);
    }
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (eighth % 2 === 1) song.hat(song.sixteenth(bar, eighth * 2), { gain: bar >= 2 ? 0.2 : 0.1 });
    }
    if (bar >= 4) { song.clap(song.beat(bar, 1), 0.34); song.clap(song.beat(bar, 3), 0.34); }
    if (bar >= 4) song.hat(song.sixteenth(bar, 14), { open: true, gain: 0.16 });

    // Warm sidechained pad carries the harmony.
    song.chord(chord, {
      start: song.bar(bar), duration: song.barSeconds, kind: 'saw',
      voices: 5, detune: 0.006, cutoff: 1500, gain: 0.34,
      envelope: { attack: 0.03, decay: 0.2, sustain: 0.72, release: 0.28 }
    });
    // Root bass in eighths, entering with the floor.
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (bar < 2) break;
      song.note({
        frequency: eighth === 7 ? root * 2 : root,
        start: song.sixteenth(bar, eighth * 2), duration: song.beatSeconds * 0.42,
        kind: 'saw', cutoff: 620, gain: 0.4,
        envelope: { attack: 0.004, decay: 0.05, sustain: 0.6, release: 0.05 }
      });
    }
    // Plucked arp enters at bar 2 and never stops: the optimism engine.
    {
      const tones = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 4];
      for (let step = 0; step < 16; step += 1) {
        song.note({
          frequency: tones[step % 4],
          start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.85,
          kind: 'saw', cutoff: 3000, gain: 0.16, resonance: 0.7,
          envelope: { attack: 0.002, decay: 0.05, sustain: 0.25, release: 0.03 }
        });
      }
    }
  }
  // Hopeful supersaw lead across the back half.
  const lead = [
    [4, 0, HZ.E4, 2], [4, 2, HZ.G4, 1], [4, 3, HZ.A4, 1],
    [5, 0, HZ.G4, 2], [5, 2, HZ.E4, 2],
    [6, 0, HZ.F4, 1], [6, 1, HZ.A4, 1], [6, 2, HZ.G4, 1], [6, 3, HZ.E4, 1],
    [7, 0, HZ.D4, 2], [7, 2, HZ.G4, 2]
  ];
  for (const [bar, beatIndex, frequency, beats] of lead) {
    song.note({
      frequency, start: song.beat(bar, beatIndex), duration: song.beatSeconds * beats * 0.94,
      kind: 'saw', voices: 5, detune: 0.009, cutoff: 3600, gain: 0.24,
      vibrato: 4, envelope: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.14 }
    });
  }
  song.riser(song.bar(7), song.barSeconds, 0.14);
  return song;
};

/**
 * Combat bed: 148 BPM in E minor. Rolling sixteenth bass, offbeat stabs, an
 * arp whose filter opens bar over bar, lead octaves in the back half, snare
 * roll and riser into the loop.
 */
const combatTheme = () => {
  const song = new TechnoSong({ bars: 8, bpm: 148 });
  const chordByBar = [
    [HZ.E3, HZ.G3, HZ.B3], [HZ.E3, HZ.G3, HZ.B3], [HZ.C3, HZ.E3, HZ.G3], [HZ.D3, HZ.Fs3, HZ.A3],
    [HZ.E3, HZ.G3, HZ.B3], [HZ.E3, HZ.G3, HZ.B3], [HZ.C3, HZ.E3, HZ.G3], [HZ.D3, HZ.Fs3, HZ.A3]
  ];
  const rootByBar = [HZ.E1, HZ.E1, HZ.C2, HZ.D2, HZ.E1, HZ.E1, HZ.C2, HZ.D2];
  const bassSteps = [0, 1, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15];

  for (let bar = 0; bar < 8; bar += 1) {
    const chord = chordByBar[bar];
    const root = rootByBar[bar];

    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) song.kick(song.beat(bar, beatIndex), 1);
    if (bar >= 2) { song.clap(song.beat(bar, 1), 0.5); song.clap(song.beat(bar, 3), 0.5); }
    for (let step = 0; step < 16; step += 1) {
      // Offbeat eighths early, full sixteenths once the arp arrives.
      if (bar < 2 && step % 4 !== 2) continue;
      song.hat(song.sixteenth(bar, step), { gain: step % 4 === 2 ? 0.3 : 0.13 });
    }
    if (bar >= 2) song.hat(song.sixteenth(bar, 14), { open: true, gain: 0.2 });

    // Rolling bass with octave jumps.
    for (const step of bassSteps) {
      song.note({
        frequency: step === 3 || step === 10 ? root * 2 : root,
        start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.9,
        kind: 'saw', cutoff: 780, gain: 0.46, resonance: 0.95,
        envelope: { attack: 0.002, decay: 0.04, sustain: 0.62, release: 0.03 }
      });
    }
    // Offbeat stabs from bar 1.
    for (const step of bar >= 1 ? [2, 6, 10, 14] : []) {
      song.chord(chord, {
        start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.8,
        kind: 'saw', voices: 3, detune: 0.007, cutoff: 2100, gain: 0.3,
        envelope: { attack: 0.002, decay: 0.05, sustain: 0.4, release: 0.04 }
      });
    }
    // Arp whose filter opens as the loop runs: the intensifier.
    const arpTones = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[0] * 4];
    for (let step = 0; step < 16; step += 1) {
      if (bar < 2) break;
      song.note({
        frequency: arpTones[step % 4],
        start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.8,
        kind: 'pulse', cutoff: 1500 + bar * 420, gain: 0.13, resonance: 0.75,
        envelope: { attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.02 }
      });
    }
  }
  // Lead octaves in the back half.
  const lead = [
    [4, 0, HZ.E5], [4, 1, HZ.D5], [4, 2, HZ.B4], [4, 3, HZ.D5],
    [5, 0, HZ.E5], [5, 2, HZ.G5], [5, 3, HZ.Fs5],
    [6, 0, HZ.E5], [6, 1, HZ.D5], [6, 2, HZ.C5], [6, 3, HZ.D5],
    [7, 0, HZ.E5], [7, 2, HZ.B4]
  ];
  for (const [bar, beatIndex, frequency] of lead) {
    song.note({
      frequency, start: song.beat(bar, beatIndex), duration: song.beatSeconds * 0.9,
      kind: 'saw', voices: 5, detune: 0.011, cutoff: 4200, gain: 0.22,
      vibrato: 5, envelope: { attack: 0.008, decay: 0.08, sustain: 0.62, release: 0.08 }
    });
  }
  song.roll(song.beat(7, 2), 2, 0.4);
  song.riser(song.bar(6), song.barSeconds * 2, 0.2);
  song.renderOptions = { duckDepth: 0.5 };
  return song;
};

/**
 * Boss bed: 150 BPM, D phrygian. A drone under relentless bass, the flat-two
 * stab that makes phrygian read as menace, galloped kicks, heavier pump.
 */
const bossTheme = () => {
  const song = new TechnoSong({ bars: 8, bpm: 150 });

  // The drone runs the whole loop under everything.
  song.note({
    frequency: HZ.D1, start: 0, duration: song.barSeconds * 8,
    kind: 'saw', voices: 3, detune: 0.004, cutoff: 300, gain: 0.3,
    envelope: { attack: 0.4, decay: 0.5, sustain: 0.85, release: 0.6 }
  });

  for (let bar = 0; bar < 8; bar += 1) {
    const dark = bar % 2 === 1;
    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) song.kick(song.beat(bar, beatIndex), 1);
    // The gallop and the claps join at bar 2; the first bars are pure dread.
    if (bar >= 2) song.kick(song.sixteenth(bar, 11), 0.6);
    if (bar >= 2) { song.clap(song.beat(bar, 1), 0.5); song.clap(song.beat(bar, 3), 0.5); }
    for (let step = 0; step < 16; step += 1) {
      if (bar < 2 && step % 4 !== 2) continue;
      song.hat(song.sixteenth(bar, step), { gain: step % 4 === 2 ? 0.26 : 0.11 });
    }
    if (bar % 2 === 0) song.hat(song.bar(bar), { open: true, gain: 0.24 });

    // Relentless bass; the tail of every even bar bends to the flat two.
    for (let step = 0; step < 16; step += 1) {
      if (step === 7 || step === 15) continue;
      const frequency = dark && step >= 12 ? HZ.Eb1 : HZ.D1;
      song.note({
        frequency, start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.9,
        kind: 'saw', cutoff: 700, gain: 0.44, resonance: 1,
        envelope: { attack: 0.002, decay: 0.04, sustain: 0.6, release: 0.03 }
      });
    }
    // Alternating stabs: D minor against the flat-two dyad.
    const stab = dark ? [HZ.Eb3, HZ.G3] : [HZ.D3, HZ.F3, HZ.A3];
    for (const step of bar >= 1 ? [2, 6, 10, 14] : []) {
      song.chord(stab, {
        start: song.sixteenth(bar, step), duration: (song.beatSeconds / 4) * 0.8,
        kind: 'saw', voices: 3, detune: 0.008, cutoff: 1600, gain: 0.3, resonance: 0.95,
        envelope: { attack: 0.002, decay: 0.05, sustain: 0.4, release: 0.04 }
      });
    }
  }
  // Long menacing lead across the back half.
  const lead = [[3, HZ.D4, 4], [4, HZ.Eb4, 4], [5, HZ.C4, 4], [6, HZ.D4, 8]];
  for (const [bar, frequency, beats] of lead) {
    song.note({
      frequency, start: song.bar(bar), duration: song.beatSeconds * beats * 0.96,
      kind: 'saw', voices: 5, detune: 0.012, cutoff: 3200, gain: 0.22,
      vibrato: 7, vibratoHz: 4.6, envelope: { attack: 0.05, decay: 0.2, sustain: 0.72, release: 0.2 }
    });
  }
  song.roll(song.beat(7, 2), 2, 0.42);
  song.riser(song.bar(6), song.barSeconds * 2, 0.2);
  song.renderOptions = { duckDepth: 0.52 };
  return song;
};

/** Victory: one rising supersaw burst that resolves onto a held major chord. */
const victoryStinger = () => {
  const song = new TechnoSong({ bars: 2, bpm: 132, wrap: false });
  song.kick(0, 1);
  const run = [HZ.C4, HZ.E4, HZ.G4, HZ.C5, HZ.E5, HZ.G5, HZ.C6];
  run.forEach((frequency, index) => {
    song.note({
      frequency, start: index * (song.beatSeconds / 4), duration: (song.beatSeconds / 4) * 1.1,
      kind: 'saw', voices: 3, detune: 0.008, cutoff: 3800, gain: 0.26,
      envelope: { attack: 0.002, decay: 0.05, sustain: 0.5, release: 0.05 }
    });
  });
  song.hat(song.beat(0, 2), { open: true, gain: 0.28 });
  song.chord([HZ.C4, HZ.E4, HZ.G4, HZ.C5], {
    start: song.beat(0, 2), duration: song.barSeconds * 1.4,
    kind: 'saw', voices: 5, detune: 0.009,
    cutoff: (progress) => 1200 + 2600 * progress, gain: 0.4,
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.7, release: 0.5 }
  });
  return song;
};

/** Defeat: a falling line into a low boom. Resolved, not punishing. */
const defeatStinger = () => {
  const song = new TechnoSong({ bars: 2, bpm: 100, wrap: false });
  song.kick(0, 0.9);
  const fall = [[0, HZ.A3], [1, HZ.F3], [2, HZ.D3]];
  for (const [beatIndex, frequency] of fall) {
    song.note({
      frequency, start: song.beat(0, beatIndex), duration: song.beatSeconds * 0.95,
      kind: 'saw', voices: 3, detune: 0.008, cutoff: 1500 - beatIndex * 300, gain: 0.3,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.12 }
    });
  }
  song.note({
    frequency: HZ.D2, start: song.beat(0, 3), duration: song.barSeconds,
    kind: 'saw', voices: 3, detune: 0.006, cutoff: 500, gain: 0.42, vibrato: 2,
    envelope: { attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.5 }
  });
  return song;
};


const CUES = [
  { id: 'ui-tap', group: 'ui', build: uiTap, use: 'Any button press' },
  { id: 'ui-confirm', group: 'ui', build: uiConfirm, use: 'Launch, claim, accept' },
  { id: 'ui-back', group: 'ui', build: uiBack, use: 'Close or go back' },
  { id: 'ui-denied', group: 'ui', build: uiDenied, use: 'Locked or unaffordable' },
  { id: 'ui-upgrade', group: 'ui', build: uiUpgrade, use: 'Hangar purchase' },

  { id: 'enemy-shoot', group: 'enemy', build: enemyShoot, use: 'Hostile fires' },
  { id: 'enemy-dive', group: 'enemy', build: enemyDive, use: 'Diver or kamikaze commits' },
  { id: 'enemy-death', group: 'enemy', build: enemyDeath, use: 'Hostile destroyed' },
  { id: 'enemy-armored-hit', group: 'enemy', build: enemyArmored, use: 'Shot lands on armour' },

  { id: 'elite-boss-warning', group: 'boss', build: eliteBossWarning, use: 'Elite Boss inbound' },
  { id: 'major-boss-warning', group: 'boss', build: majorBossWarning, use: 'Major boss inbound' },
  { id: 'boss-hit', group: 'boss', build: bossHit, use: 'Boss takes damage' },
  { id: 'boss-defeat', group: 'boss', build: bossDefeat, use: 'Boss destroyed' },

  { id: 'music-menu', group: 'music', build: menuTheme, use: 'Home and menus', loop: true },
  { id: 'music-combat', group: 'music', build: combatTheme, use: 'Normal waves', loop: true },
  { id: 'music-boss', group: 'music', build: bossTheme, use: 'Boss encounters', loop: true },
  { id: 'stinger-victory', group: 'music', build: victoryStinger, use: 'Mission cleared' },
  { id: 'stinger-defeat', group: 'music', build: defeatStinger, use: 'Run over' }
];

const write = process.argv.includes('--write');
if (write) fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = {
  id: PACK_ID,
  generator: 'tools/generate-game-audio.mjs',
  note: 'Chiptune, synthesised procedurally. No sample library or audio generator was used.',
  sampleRate: 44100,
  cues: []
};

let totalBytes = 0;
for (const cue of CUES) {
  const wav = cue.build().toWav();
  const file = `${cue.id}.wav`;
  if (write) fs.writeFileSync(path.join(OUT_DIR, file), wav);
  totalBytes += wav.length;
  const rate = wav.readUInt32LE(24);
  const seconds = (wav.length - 44) / 2 / rate;
  manifest.cues.push({
    id: cue.id,
    group: cue.group,
    url: `${PUBLIC_ROOT}/${file}`,
    seconds: Number(seconds.toFixed(3)),
    sampleRate: rate,
    loop: Boolean(cue.loop),
    use: cue.use
  });
  console.log(`${cue.group.padEnd(6)} ${cue.id.padEnd(20)} ${seconds.toFixed(2)}s  ${(wav.length / 1024).toFixed(0)}KB`);
}

console.log(`\n${CUES.length} cues, ${(totalBytes / 1024).toFixed(0)}KB total.`);

if (write) {
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, OUT_DIR)}`);
} else {
  console.log('Dry run. Pass --write to emit WAVs.');
}
