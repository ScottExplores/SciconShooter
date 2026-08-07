import { createRequire } from 'node:module';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [inputArg, outputArg = inputArg] = process.argv.slice(2);

if (!inputArg) {
  throw new Error('Usage: node tools/strip-boss-chroma-key.mjs <input.png> [output.png]');
}

const workspaceRoot = path.resolve(import.meta.dirname, '..');
const directorRequire = createRequire(path.join(workspaceRoot, 'director', 'package.json'));
const { PNG } = directorRequire('pngjs');
const inputPath = path.resolve(workspaceRoot, inputArg);
const outputPath = path.resolve(workspaceRoot, outputArg);
const png = PNG.sync.read(await readFile(inputPath));

let clearedPixels = 0;

for (let offset = 0; offset < png.data.length; offset += 4) {
  const red = png.data[offset];
  const green = png.data[offset + 1];
  const blue = png.data[offset + 2];
  const isBrightMagentaChroma = (
    red > 120
    && blue > 100
    && green < 140
    && red + blue > green * 2.7
  );
  const isDarkMagentaFringe = (
    Math.min(red, blue) > 12
    && Math.abs(red - blue) <= 60
    && green * 1.65 < Math.min(red, blue)
  );
  const isMagentaChroma = isBrightMagentaChroma || isDarkMagentaFringe;

  if (!isMagentaChroma) continue;

  png.data[offset] = 0;
  png.data[offset + 1] = 0;
  png.data[offset + 2] = 0;
  png.data[offset + 3] = 0;
  clearedPixels += 1;
}

const encoded = PNG.sync.write(png, {
  colorType: 6,
  inputColorType: 6,
  inputHasAlpha: true
});

if (inputPath === outputPath) {
  const temporaryPath = `${outputPath}.chroma-clean.tmp`;
  await writeFile(temporaryPath, encoded);
  await rename(temporaryPath, outputPath);
} else {
  await writeFile(outputPath, encoded);
}

process.stdout.write(JSON.stringify({
  input: path.relative(workspaceRoot, inputPath).replaceAll('\\', '/'),
  output: path.relative(workspaceRoot, outputPath).replaceAll('\\', '/'),
  width: png.width,
  height: png.height,
  clearedPixels,
  binaryAlpha: true
}, null, 2));
