#!/usr/bin/env node
// Generates dedicated FX art for each hull's signature move.
//
// The four signature moves shipped without their own art: shipAbilityService
// pointed all of them at getGalleryAbilityFrames(...), which is the *primary
// weapon* FX pack. So the move a player picked their ship for looked like their
// normal gun. This draws each one procedurally instead, giving the four moves
// four genuinely different silhouettes:
//
//   research-charge    expanding containment ring with a bright core
//   bio-genome-lance   twin-helix piercing lance
//   eth-prism-volley   three crystalline shards fanning out
//   btc-hash-burst     hexagonal hash lattice detonating outward
//
// Everything is drawn on a 40x50 logical grid and upscaled 4x nearest-neighbour
// to 160x200, so the output is crisp blocky pixel art rather than a smooth
// render. No image generator is involved.
//
// Usage: node tools/generate-signature-move-fx.mjs [--write]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelCanvas, encodePng } from './pixel-canvas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK_ID = 'scicon-signature-move-fx-v1';
const OUT_DIR = path.join(root, 'public', 'game-art', 'generated', PACK_ID);
const PUBLIC_ROOT = `/game-art/generated/${PACK_ID}`;

// Each move is drawn on a grid matching the aspect ratio of the projectile the
// engine actually spawns for it, so the frames drop straight into
// spawnShipAbilityProjectile without being squashed. A single shared canvas
// looked fine in isolation and wrong in play.
const SCALE = 4;
const FRAMES = 6;

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255
];

const WHITE = [1, 1, 1];

/** Eased 0..1 progress across the animation. */
const progress = (frame) => frame / (FRAMES - 1);

const drawResearchCharge = (c, t, tint) => {
  const cx = c.width / 2 - 0.5;
  const cy = c.height / 2 - 0.5;
  // A containment ring that expands and thins as it releases, with the core
  // collapsing inward -- energy leaving the hull, not a generic explosion.
  const radius = 3 + t * 15;
  const thickness = 2.4 - t * 1.5;
  c.ring(cx, cy, radius, Math.max(0.6, thickness), tint, 1.15 - t * 0.35);
  c.ring(cx, cy, radius * 0.62, Math.max(0.5, thickness * 0.7), tint, 0.55 - t * 0.2);
  c.glow(cx, cy, 6.5 - t * 4.5, WHITE, 1.4 - t * 0.5, 1.6);
  // Four cardinal spokes tie the ring back to the emitter.
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const inner = 2 + t * 3;
    c.line(
      cx + Math.cos(angle) * inner,
      cy + Math.sin(angle) * inner,
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      tint,
      0.5 - t * 0.28
    );
  }
};

const drawGenomeLance = (c, t, tint) => {
  const cx = c.width / 2 - 0.5;
  // A lance that extends upward from the hull, wrapped in a double helix. The
  // shape reads as piercing, which is what the ability actually does.
  // Stop short of the top edge so the fully extended frame is not clipped.
  const tipY = c.height - 3 - t * (c.height - 8);
  const baseY = c.height - 2;
  // Tint carries the body and white only sharpens the centre line, otherwise
  // the additive core saturates and the hull's colour is lost.
  c.line(cx, baseY, cx, tipY, tint, 1.35, 4.2);
  c.line(cx, baseY, cx, tipY, WHITE, 0.16, 1.4);

  const turns = 3.1;
  const amplitude = 4.4 + t * 1.2;
  for (let y = tipY; y <= baseY; y += 0.34) {
    const span = (baseY - y) / Math.max(1, baseY - tipY);
    const phase = span * turns * Math.PI * 2 + t * 4.2;
    const width = amplitude * Math.sin(Math.PI * Math.min(1, span * 1.15));
    c.add(cx + Math.cos(phase) * width, y, tint, 0.85);
    c.add(cx + Math.cos(phase + Math.PI) * width, y, tint, 0.85);
    // Rungs every half turn make it read as a helix rather than two waves.
    if (Math.abs(Math.sin(phase)) < 0.12) {
      c.line(
        cx + Math.cos(phase) * width, y,
        cx + Math.cos(phase + Math.PI) * width, y,
        tint, 0.4
      );
    }
  }
  c.glow(cx, tipY, 3.2 + t * 1.2, tint, 1.2, 1.5);
  c.glow(cx, tipY, 1.5, WHITE, 0.9, 1.5);
};

const drawPrismVolley = (c, t, tint) => {
  const cx = c.width / 2 - 0.5;
  // ONE shard, not the fan. The engine spawns eth-prism-volley three times with
  // its own angle bias, so a three-shard sprite would render nine shards.
  const py = c.height * 0.38 - t * 1.5;
  const size = 5.0 + t * 3.2;

  // Crystalline diamond: tint-filled with a white spine, so the shard keeps its
  // violet instead of saturating to a white blob.
  for (let dy = -size; dy <= size; dy += 0.4) {
    const taper = 1 - Math.abs(dy) / size;
    const halfWidth = taper * size * 0.52;
    for (let dx = -halfWidth; dx <= halfWidth; dx += 0.4) {
      c.add(cx + dx, py + dy, tint, 1.2);
    }
  }
  c.line(cx, py - size * 0.72, cx, py + size * 0.72, WHITE, 0.45);
  // Facet lines give it a cut-crystal read rather than a plain diamond.
  c.line(cx - size * 0.3, py, cx, py - size * 0.55, WHITE, 0.22);
  c.line(cx + size * 0.3, py, cx, py - size * 0.55, WHITE, 0.22);
  // Energy tail back toward the emitter so it reads as launched.
  c.line(cx, py + size, cx, c.height - 2, tint, 1.0 * (1 - t * 0.3), 1.8);
  c.glow(cx, py - size * 0.62, 1.8, WHITE, 0.8, 1.6);
};

const drawHashBurst = (c, t, tint) => {
  const cx = c.width / 2 - 0.5;
  const cy = c.height / 2 - 0.5;
  // A hexagonal lattice blowing outward: blocky and angular, so it cannot be
  // confused with the Research Charge's smooth ring.
  const radius = 2.5 + t * 16;
  const corners = [];
  for (let k = 0; k < 6; k += 1) {
    const angle = (k / 6) * Math.PI * 2 + t * 0.5;
    corners.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  for (let k = 0; k < 6; k += 1) {
    const [ax, ay] = corners[k];
    const [bx, by] = corners[(k + 1) % 6];
    c.line(ax, ay, bx, by, tint, 1.05 - t * 0.3, 1.6);
    c.line(cx, cy, ax, ay, tint, 0.42 - t * 0.22);
    c.glow(ax, ay, 1.9, WHITE, 0.85 - t * 0.3, 1.5);
  }
  // Inner counter-rotating hex keeps the middle busy while the outer expands.
  const inner = radius * 0.45;
  for (let k = 0; k < 6; k += 1) {
    const a0 = (k / 6) * Math.PI * 2 - t * 0.9;
    const a1 = ((k + 1) / 6) * Math.PI * 2 - t * 0.9;
    c.line(
      cx + Math.cos(a0) * inner, cy + Math.sin(a0) * inner,
      cx + Math.cos(a1) * inner, cy + Math.sin(a1) * inner,
      tint, 0.6 - t * 0.25
    );
  }
  c.glow(cx, cy, 5 - t * 3, WHITE, 1.3 - t * 0.55, 1.6);
};

const MOVES = [
  // Grid aspects mirror spawnShipAbilityProjectile: research 76x92, bio 34x126,
  // eth 42x66 per shard, btc 72x96.
  { shipId: 'researchhub', abilityId: 'research-charge', name: 'Research Charge', colour: '#67e8f9', grid: [38, 46], draw: drawResearchCharge },
  { shipId: 'bio', abilityId: 'bio-genome-lance', name: 'Genome Lance', colour: '#86efac', grid: [17, 63], draw: drawGenomeLance },
  { shipId: 'eth', abilityId: 'eth-prism-volley', name: 'Prism Volley', colour: '#c4b5fd', grid: [21, 33], draw: drawPrismVolley },
  { shipId: 'btc', abilityId: 'btc-hash-burst', name: 'Hash Burst', colour: '#fcd34d', grid: [36, 48], draw: drawHashBurst }
];

const write = process.argv.includes('--write');
const manifest = {
  id: PACK_ID,
  generator: 'tools/generate-signature-move-fx.mjs',
  note: 'Procedurally drawn. No image generator was used; see the tool header.',
  frameCount: FRAMES,
  scale: SCALE,
  moves: []
};

for (const move of MOVES) {
  const tint = rgb(move.colour);
  const [gw, gh] = move.grid;
  const dir = path.join(OUT_DIR, move.shipId);
  if (write) fs.mkdirSync(dir, { recursive: true });

  const scaled = [];
  const frameUrls = [];
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const canvas = new PixelCanvas(gw, gh);
    move.draw(canvas, progress(frame), tint);
    const resolved = canvas.resolve();
    const up = PixelCanvas.upscale(resolved, gw, gh, SCALE);
    scaled.push(up.data);
    const file = `frame-${frame + 1}.png`;
    if (write) fs.writeFileSync(path.join(dir, file), encodePng(up.width, up.height, up.data));
    frameUrls.push(`${PUBLIC_ROOT}/${move.shipId}/${file}`);
  }

  const sheet = PixelCanvas.sheet(scaled, gw * SCALE, gh * SCALE);
  if (write) {
    fs.writeFileSync(path.join(dir, 'sprite-sheet.png'), encodePng(sheet.width, sheet.height, sheet.data));
  }

  manifest.moves.push({
    shipId: move.shipId,
    abilityId: move.abilityId,
    name: move.name,
    colour: move.colour,
    frameSize: [gw * SCALE, gh * SCALE],
    logicalSize: [gw, gh],
    frames: frameUrls,
    spriteSheet: `${PUBLIC_ROOT}/${move.shipId}/sprite-sheet.png`,
    spriteSheetSize: [sheet.width, sheet.height]
  });
  console.log(`${move.name.padEnd(16)} ${FRAMES} frames + ${sheet.width}x${sheet.height} sheet`);
}

if (write) {
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(root, OUT_DIR)}`);
} else {
  console.log('\nDry run. Pass --write to emit PNGs.');
}
