// Mechanical chroma-key extraction of the generated, evenly registered sheet.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = require('pngjs');
const source = process.argv[2] ?? 'docs/assets/combat-evolution-energy-sheet.png';
const sheet = PNG.sync.read(readFileSync(source));
if (sheet.width !== 1536 || sheet.height !== 1024) throw new Error('Unexpected grid size');
const output = path.resolve('public/game-art/generated/scicon-combat-evolution-v1');
mkdirSync(output, { recursive: true });
for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
  const size = 256;
  const cell = new PNG({ width: size, height: size });
  PNG.bitblt(sheet, cell, col * size, row * size, size, size, 0, 0);
  // Remove the flat magenta key, including gaps between impact sparks.
  // White energy cores and the blue-dominant ETH outline stay opaque.
  for (let i = 0; i < cell.data.length; i += 4) {
    const [r, g, b] = cell.data.subarray(i, i + 3);
    if (r > 180 && b > 180 && g < 95 && Math.abs(r - b) < 45) {
      cell.data.fill(0, i, i + 4);
    }
  }
  // Fixed-grid nearest-neighbor extraction keeps registrations and pixel edges.
  const target = new PNG({ width: 128, height: 128 });
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const from = ((y * 2) * 256 + x * 2) * 4;
    cell.data.copy(target.data, (y * 128 + x) * 4, from, from + 4);
  }
  const name = row < 3 ? ['bio', 'eth', 'btc'][row] : 'impact';
  writeFileSync(path.join(output, `${name}-${col + 1}.png`), PNG.sync.write(target));
}
console.log(`Extracted 24 alpha sprites to ${output}`);
