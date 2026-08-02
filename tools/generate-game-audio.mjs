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
/**
 * Menu bed: slow, wide, unhurried. It sits under the home screen for a long
 * time, so it stays sparse and loops cleanly.
 */
const MUSIC_RATE = 22050;

const menuTheme = () => {
  const bars = 4;
  const beat = 0.5;
  const track = new Track(bars * 4 * beat, MUSIC_RATE);
  const bass = [N.A2, N.A2, N.F2, N.F2, N.C3, N.C3, N.G2, N.G2];
  const lead = [N.E4, null, N.A4, null, N.C5, null, N.B4, N.A4, N.G4, null, N.E4, null, N.F4, null, N.A4, null];

  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 4 * beat;
    bass.forEach((note, index) => track.tone({
      kind: 'triangle', frequency: note, start: start + index * beat * 0.5, duration: beat * 0.46,
      gain: 0.22, envelope: { attack: 0.01, decay: 0.08, sustain: 0.55, release: 0.1 }
    }));
    lead.forEach((note, index) => {
      if (note === null) return;
      track.tone({
        kind: 'pulse', frequency: note, start: start + index * beat * 0.25, duration: beat * 0.22,
        gain: 0.13, envelope: { attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.05 }
      });
    });
  }
  return track.normalize(0.6);
};

/** Combat bed: driving eighth-note bass, tense minor lead, room to breathe. */
const combatTheme = () => {
  const bars = 4;
  const beat = 0.34;
  const track = new Track(bars * 8 * beat, MUSIC_RATE);
  const bassPattern = [N.D2, N.D2, N.D3, N.D2, N.F2, N.F2, N.C3, N.A2];
  const leadPattern = [N.D4, N.F4, N.A4, N.D5, N.C5, N.A4, N.F4, N.A4];

  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 8 * beat;
    bassPattern.forEach((note, index) => track.tone({
      kind: 'square', frequency: note, start: start + index * beat, duration: beat * 0.6,
      gain: 0.2, envelope: { attack: 0.002, decay: 0.05, sustain: 0.5, release: 0.06 }
    }));
    // The lead drops out on bar 3 so the loop has a lift when it returns.
    if (bar !== 2) leadPattern.forEach((note, index) => track.tone({
      kind: 'pulse', frequency: note, start: start + index * beat, duration: beat * 0.5,
      gain: 0.12, envelope: { attack: 0.003, decay: 0.04, sustain: 0.45, release: 0.05 }
    }));
    // Hi-hat on the offbeat keeps it moving without a drum kit.
    for (let index = 0; index < 8; index += 1) {
      track.tone({
        kind: 'noise', frequency: 1, start: start + index * beat + beat * 0.5, duration: 0.04,
        gain: index % 2 === 0 ? 0.05 : 0.08, envelope: { attack: 0.001, decay: 0.02, sustain: 0.1, release: 0.015 }
      });
    }
  }
  return track.normalize(0.66);
};

/** Boss bed: half-step menace, heavier low end, no lead melody. */
const bossTheme = () => {
  const bars = 4;
  const beat = 0.3;
  const track = new Track(bars * 8 * beat, MUSIC_RATE);
  const pattern = [N.C2, N.C2, N.D2, N.C2, N.G2, N.F2, N.D2, N.C2];

  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * 8 * beat;
    pattern.forEach((note, index) => {
      track.tone({
        kind: 'saw', frequency: note, start: start + index * beat, duration: beat * 0.72,
        gain: 0.2, envelope: { attack: 0.003, decay: 0.06, sustain: 0.6, release: 0.07 }
      });
      track.tone({
        kind: 'square', frequency: note * 2, start: start + index * beat, duration: beat * 0.3,
        gain: 0.07, envelope: { attack: 0.002, decay: 0.03, sustain: 0.35, release: 0.04 }
      });
    });
    for (let index = 0; index < 8; index += 1) {
      track.tone({
        kind: 'noise', frequency: 1, start: start + index * beat, duration: 0.06,
        gain: index % 4 === 0 ? 0.13 : 0.05, envelope: { attack: 0.001, decay: 0.03, sustain: 0.15, release: 0.02 }
      });
    }
  }
  return track.normalize(0.7);
};

const victoryStinger = () => new Track(1.5)
  .sequence({ notes: [N.C5, N.E5, N.G5, N.C6, null, N.G5, N.C6], noteSeconds: 0.17, kind: 'pulse', gain: 0.28, envelope: { attack: 0.003, decay: 0.05, sustain: 0.6, release: 0.1 } })
  .tone({ kind: 'triangle', frequency: N.C3, duration: 1.4, gain: 0.2, envelope: { attack: 0.02, decay: 0.25, sustain: 0.5, release: 0.4 } })
  .normalize(0.8);

const defeatStinger = () => new Track(1.6)
  .sequence({ notes: [N.A4, N.G4, N.F4, N.D4], noteSeconds: 0.3, kind: 'pulse', gain: 0.24, envelope: { attack: 0.006, decay: 0.08, sustain: 0.55, release: 0.14 } })
  .tone({ kind: 'triangle', frequency: sweep(N.A3, N.D3), duration: 1.5, gain: 0.2, envelope: { attack: 0.03, decay: 0.3, sustain: 0.45, release: 0.5 } })
  .normalize(0.72);

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
