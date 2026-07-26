import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const requireFromDirector = createRequire(
  new URL('../director/package.json', import.meta.url)
);
const { PNG } = requireFromDirector('pngjs');

const PART_ORDERS = Object.freeze({
  'segmented-crescent-v1': Object.freeze([
    'assembled',
    'coreBody',
    'coreClosed',
    'coreOpen',
    'leftOuter',
    'rightOuter',
    'leftMidA',
    'rightMidA',
    'leftMidB',
    'rightMidB',
    'leftBase',
    'rightBase',
    'leftPod',
    'rightPod',
    'ring',
    'tailA',
    'tailB',
    'tailC'
  ]),
  'articulated-pincer-v1': Object.freeze([
    'assembled',
    'bodyClosed',
    'bodyOpen',
    'leftClaw',
    'rightClaw',
    'leftMandible',
    'rightMandible',
    'legOuterLeft',
    'legInnerLeft',
    'legInnerRight',
    'legOuterRight',
    'gatlingLeft',
    'gatlingRight',
    'mineLeft',
    'mineRight',
    'shieldLeft',
    'shieldRight',
    'shockBlade',
    'flameSmall',
    'flameMedium',
    'flameLarge'
  ]),
  'transforming-orbiter-v1': Object.freeze([
    'assembled',
    'coreClosed',
    'coreOpen',
    'leftWing',
    'rightWing',
    'leftEmitter',
    'rightEmitter',
    'finTop',
    'finRight',
    'finBottom',
    'finLeft',
    'nodeA',
    'nodeB',
    'nodeC',
    'nodeD',
    'haloSmall',
    'haloMedium',
    'haloLarge',
    'haloXL',
    'perimeterRing',
    'laserHub',
    'pulseSmall',
    'pulseMedium',
    'pulseLarge'
  ]),
  'rotating-emitter-core-v1': Object.freeze([
    'assembled',
    'chassisClosed',
    'chassisOpen',
    'perimeterRing',
    'rotorHub',
    'arm0',
    'muzzle0',
    'muzzle1',
    'relayNorthWest',
    'relayNorthEast',
    'relaySouthEast',
    'relaySouthWest',
    'portal0',
    'pulseSmall',
    'pulseMedium',
    'pulseLarge',
    'eyeCometLeft',
    'eyeCometRight'
  ])
});

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..');
const [inputArg, outputDirectoryArg, bossId, rigKind] = process.argv.slice(2);

if (!inputArg || !outputDirectoryArg || !bossId || !rigKind) {
  throw new Error(
    'Usage: node tools/process-sandbox-boss-sheet.mjs <input.png> <output-directory> <boss-id> <rig-kind>'
  );
}

const partOrder = PART_ORDERS[rigKind];
if (!partOrder) throw new Error(`Unsupported rig kind: ${rigKind}`);
if (partOrder.length > 25) throw new Error(`${rigKind} exceeds the 5x5 source grid`);

const inputPath = path.resolve(inputArg);
const outputDirectory = path.resolve(outputDirectoryArg);
const relativeOutput = path.relative(workspaceRoot, outputDirectory);
if (
  relativeOutput.startsWith('..')
  || path.isAbsolute(relativeOutput)
  || relativeOutput === ''
) {
  throw new Error('Output directory must be a child of the SciCon Shooter workspace');
}

const sourceBuffer = await readFile(inputPath);
const source = PNG.sync.read(sourceBuffer);
if (source.width < 500 || source.height < 500) {
  throw new Error(`Generated sheet is unexpectedly small: ${source.width}x${source.height}`);
}

const isChromaPixel = (red, green, blue) => (
  green >= 150
  && green >= red * 1.42
  && green >= blue * 1.42
  && Math.hypot(red, green - 255, blue) <= 170
);

let transparentPixelCount = 0;
let opaquePixelCount = 0;
for (let offset = 0; offset < source.data.length; offset += 4) {
  const red = source.data[offset];
  const green = source.data[offset + 1];
  const blue = source.data[offset + 2];
  const alpha = source.data[offset + 3];
  if (alpha === 0 || isChromaPixel(red, green, blue)) {
    source.data[offset] = 0;
    source.data[offset + 1] = 0;
    source.data[offset + 2] = 0;
    source.data[offset + 3] = 0;
    transparentPixelCount += 1;
  } else {
    // Physical boss sheets use binary alpha. Glows and translucent effects
    // belong in the separate VFX atlas, never in a body-part texture.
    // Chroma-key antialiasing can leave a narrow green fringe around an
    // otherwise opaque pixel. Generated physical rigs never use that key hue,
    // so contract the spill without softening the pixel-art silhouette.
    if (green > red * 1.15 && green > blue * 1.1) {
      source.data[offset + 1] = Math.max(red, blue);
    }
    source.data[offset + 3] = 255;
    opaquePixelCount += 1;
  }
}

if (transparentPixelCount === 0 || opaquePixelCount === 0) {
  throw new Error('Chroma removal did not produce both transparent and opaque pixels');
}

const visited = new Uint8Array(source.width * source.height);
const queueX = new Int32Array(source.width * source.height);
const queueY = new Int32Array(source.width * source.height);
const components = [];
for (let y = 0; y < source.height; y += 1) {
  for (let x = 0; x < source.width; x += 1) {
    const pixelIndex = y * source.width + x;
    if (visited[pixelIndex] || source.data[pixelIndex * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    let area = 0;
    let left = x;
    let right = x;
    let top = y;
    let bottom = y;
    visited[pixelIndex] = 1;
    queueX[tail] = x;
    queueY[tail] = y;
    tail += 1;
    while (head < tail) {
      const currentX = queueX[head];
      const currentY = queueY[head];
      head += 1;
      area += 1;
      left = Math.min(left, currentX);
      right = Math.max(right, currentX);
      top = Math.min(top, currentY);
      bottom = Math.max(bottom, currentY);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = currentX + offsetX;
          const nextY = currentY + offsetY;
          if (
            nextX < 0
            || nextY < 0
            || nextX >= source.width
            || nextY >= source.height
          ) {
            continue;
          }
          const nextIndex = nextY * source.width + nextX;
          if (visited[nextIndex] || source.data[nextIndex * 4 + 3] === 0) continue;
          visited[nextIndex] = 1;
          queueX[tail] = nextX;
          queueY[tail] = nextY;
          tail += 1;
        }
      }
    }
    components.push({
      area,
      x: left,
      y: top,
      width: right - left + 1,
      height: bottom - top + 1,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2
    });
  }
}

const principalComponents = components
  .sort((left, right) => right.area - left.area)
  .slice(0, partOrder.length);
if (
  principalComponents.length !== partOrder.length
  || principalComponents.some((component) => component.area < 400)
) {
  throw new Error(
    `Expected ${partOrder.length} isolated sprite panels; found ${principalComponents.length}`
  );
}

// Image generation may use a little more room for the assembled silhouette
// than one mathematical grid cell. Connected components preserve that sprite
// as one panel and avoid accidentally slicing a wing into its neighbor.
const rows = [];
for (const component of [...principalComponents].sort((left, right) => (
  left.centerY - right.centerY
))) {
  const row = rows.find((candidate) => (
    Math.abs(candidate.centerY - component.centerY) <= source.height / 10
  ));
  if (row) {
    row.components.push(component);
    row.centerY = row.components.reduce((sum, item) => sum + item.centerY, 0)
      / row.components.length;
  } else {
    rows.push({ centerY: component.centerY, components: [component] });
  }
}
const orderedComponents = rows
  .sort((left, right) => left.centerY - right.centerY)
  .flatMap((row) => row.components.sort((left, right) => left.centerX - right.centerX));
if (orderedComponents.length !== partOrder.length) {
  throw new Error('Could not resolve generated sprite-panel order');
}

const padding = 14;
const rawFrames = Object.fromEntries(partOrder.map((partId, index) => {
  const component = orderedComponents[index];
  const x = Math.max(0, component.x - padding);
  const y = Math.max(0, component.y - padding);
  const right = Math.min(source.width, component.x + component.width + padding);
  const bottom = Math.min(source.height, component.y + component.height + padding);
  return [partId, {
    x,
    y,
    width: right - x,
    height: bottom - y
  }];
}));
const assembledFrame = rawFrames.assembled;
const frames = Object.fromEntries(
  Object.entries(rawFrames).filter(([partId]) => partId !== 'assembled')
);

const assembled = new PNG({
  width: assembledFrame.width,
  height: assembledFrame.height,
  colorType: 6
});
PNG.bitblt(
  source,
  assembled,
  assembledFrame.x,
  assembledFrame.y,
  assembledFrame.width,
  assembledFrame.height,
  0,
  0
);

await mkdir(outputDirectory, { recursive: true });
const sheetPath = path.join(outputDirectory, `${bossId}-modular-sheet.png`);
const assembledPath = path.join(outputDirectory, `${bossId}-assembled.png`);
const metadataPath = path.join(outputDirectory, `${bossId}.prototype.json`);
const sheetBuffer = PNG.sync.write(source, { colorType: 6 });
const assembledBuffer = PNG.sync.write(assembled, { colorType: 6 });
await writeFile(sheetPath, sheetBuffer);
await writeFile(assembledPath, assembledBuffer);

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const metadata = {
  schemaVersion: 1,
  bossId,
  rigKind,
  source: path.basename(inputPath),
  assembled: {
    file: path.basename(assembledPath),
    sha256: sha256(assembledBuffer),
    width: assembled.width,
    height: assembled.height
  },
  sheet: {
    file: path.basename(sheetPath),
    sha256: sha256(sheetBuffer),
    width: source.width,
    height: source.height,
    frames
  },
  validation: {
    binaryAlpha: true,
    transparentPixelCount,
    opaquePixelCount
  }
};
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

process.stdout.write(`${JSON.stringify(metadata)}\n`);
