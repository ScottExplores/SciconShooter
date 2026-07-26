#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromDirector = createRequire(path.join(repositoryRoot, 'director', 'package.json'));
const { PNG } = requireFromDirector('pngjs');

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) {
    throw new Error('Expected paired --input/--output/--x/--y/--width/--height arguments.');
  }
  args.set(key.slice(2), value);
}

const input = args.get('input');
const output = args.get('output');
const rectangle = {
  x: Number(args.get('x')),
  y: Number(args.get('y')),
  width: Number(args.get('width')),
  height: Number(args.get('height'))
};
if (!input || !output) throw new Error('--input and --output are required.');
if (Object.values(rectangle).some((value) => !Number.isInteger(value) || value < 0)) {
  throw new Error('Crop coordinates and dimensions must be non-negative integers.');
}
if (rectangle.width < 1 || rectangle.height < 1) {
  throw new Error('Crop width and height must be positive.');
}

const inputPath = path.resolve(repositoryRoot, input);
const outputPath = path.resolve(repositoryRoot, output);
const source = PNG.sync.read(await readFile(inputPath));
if (
  rectangle.x + rectangle.width > source.width
  || rectangle.y + rectangle.height > source.height
) throw new Error('Crop rectangle exceeds the source PNG bounds.');

const cropped = new PNG({ width: rectangle.width, height: rectangle.height });
for (let y = 0; y < rectangle.height; y += 1) {
  for (let x = 0; x < rectangle.width; x += 1) {
    const sourceOffset = ((rectangle.y + y) * source.width + rectangle.x + x) * 4;
    const targetOffset = (y * cropped.width + x) * 4;
    source.data.copy(cropped.data, targetOffset, sourceOffset, sourceOffset + 4);
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, PNG.sync.write(cropped, { colorType: 6 }));
process.stdout.write(`${path.relative(repositoryRoot, outputPath)} ${cropped.width}x${cropped.height}\n`);
