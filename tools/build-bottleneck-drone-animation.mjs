import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyzeBossPixelArtPng, quantizeBossPixelArt } from './quantize-boss-pixel-art.mjs';
import {
  analyzeOpaqueComponents,
  assertTransparentFrameGutters,
  assertTransparentFrameMargin,
  calculateOpaqueCentroid,
  keepLargestOpaqueComponent
} from './sprite-frame-safety.mjs';

const requireFromDirector = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const FRAME_NAMES = Object.freeze(['neutral', 'idle', 'charge', 'fire', 'recovery']);
const TARGET_WIDTH = 140;
const TARGET_HEIGHT = 160;
const CONTENT_WIDTH = 128;
const CONTENT_HEIGHT = 146;
const MAXIMUM_COLORS = 32;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const [sourceArgument, outputArgument] = process.argv.slice(2);

if (!sourceArgument || !outputArgument) {
  throw new Error(
    'Usage: node tools/build-bottleneck-drone-animation.mjs <transparent-sheet.png> <output-directory>'
  );
}

const sourcePath = path.resolve(sourceArgument);
const outputDirectory = path.resolve(outputArgument);
const packageId = path.basename(outputDirectory);
const relativeOutputDirectory = path.relative(workspaceRoot, outputDirectory);
if (
  !relativeOutputDirectory
  || relativeOutputDirectory.startsWith('..')
  || path.isAbsolute(relativeOutputDirectory)
) {
  throw new Error('Output directory must be inside the SciCon Shooter workspace.');
}

const sourceBytes = await readFile(sourcePath);
const source = PNG.sync.read(sourceBytes);
if (source.width < FRAME_NAMES.length * 100 || source.height < 200) {
  throw new Error(`Animation sheet is unexpectedly small: ${source.width}x${source.height}.`);
}
assertTransparentFrameGutters(source, FRAME_NAMES.length, 4);

const frameCells = FRAME_NAMES.map((name, index) => {
  const left = Math.floor(index * source.width / FRAME_NAMES.length);
  const right = Math.floor((index + 1) * source.width / FRAME_NAMES.length) - 1;
  const cleanup = keepLargestOpaqueComponent(
    source,
    { left, right, top: 0, bottom: source.height - 1 },
    { maximumDetachedRatio: 0.15 }
  );
  const [primary] = analyzeOpaqueComponents(
    source,
    { left, right, top: 0, bottom: source.height - 1 }
  );
  if (!primary) throw new Error(`${name} contains no visible pixels.`);
  const minimumX = primary.bounds.x;
  const maximumX = primary.bounds.x + primary.bounds.width - 1;
  const minimumY = primary.bounds.y;
  const maximumY = primary.bounds.y + primary.bounds.height - 1;
  const opaquePixelCount = primary.pixelCount;
  return Object.freeze({
    name,
    left,
    right,
    width: right - left + 1,
    bounds: Object.freeze({
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX + 1,
      height: maximumY - minimumY + 1
    }),
    opaquePixelCount,
    discardedComponentCount: cleanup.discardedComponentCount,
    discardedPixelCount: cleanup.discardedPixelCount
  });
});

const commonTop = Math.min(...frameCells.map((frame) => frame.bounds.y));
const commonBottom = Math.max(...frameCells.map((frame) => frame.bounds.y + frame.bounds.height - 1));
const commonHeight = commonBottom - commonTop + 1;
const widestCell = Math.max(...frameCells.map((frame) => frame.width));
const commonWidth = Math.max(widestCell, Math.ceil(commonHeight * TARGET_WIDTH / TARGET_HEIGHT));

const resizeCell = (cell) => {
  const output = new PNG({ width: TARGET_WIDTH, height: TARGET_HEIGHT, colorType: 6 });
  const horizontalPadding = Math.floor((commonWidth - cell.width) / 2);
  const contentLeft = Math.floor((TARGET_WIDTH - CONTENT_WIDTH) / 2);
  const contentTop = Math.floor((TARGET_HEIGHT - CONTENT_HEIGHT) / 2);

  for (let targetY = 0; targetY < TARGET_HEIGHT; targetY += 1) {
    for (let targetX = 0; targetX < TARGET_WIDTH; targetX += 1) {
      const targetOffset = (targetY * TARGET_WIDTH + targetX) * 4;
      const contentX = targetX - contentLeft;
      const contentY = targetY - contentTop;
      if (
        contentX < 0
        || contentY < 0
        || contentX >= CONTENT_WIDTH
        || contentY >= CONTENT_HEIGHT
      ) {
        output.data[targetOffset] = 0;
        output.data[targetOffset + 1] = 0;
        output.data[targetOffset + 2] = 0;
        output.data[targetOffset + 3] = 0;
        continue;
      }
      const sourceY = commonTop + Math.min(
        commonHeight - 1,
        Math.floor(contentY * commonHeight / CONTENT_HEIGHT)
      );
      const commonX = Math.min(
        commonWidth - 1,
        Math.floor(contentX * commonWidth / CONTENT_WIDTH)
      );
      const cellX = commonX - horizontalPadding;
      if (cellX < 0 || cellX >= cell.width) continue;
      const sourceX = cell.left + cellX;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      output.data[targetOffset] = source.data[sourceOffset];
      output.data[targetOffset + 1] = source.data[sourceOffset + 1];
      output.data[targetOffset + 2] = source.data[sourceOffset + 2];
      output.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }
  return output;
};

const resizedFrames = frameCells.map(resizeCell);
const unquantizedSheet = new PNG({
  width: TARGET_WIDTH * resizedFrames.length,
  height: TARGET_HEIGHT,
  colorType: 6
});

resizedFrames.forEach((frame, frameIndex) => {
  for (let y = 0; y < TARGET_HEIGHT; y += 1) {
    const sourceOffset = y * TARGET_WIDTH * 4;
    const targetOffset = (y * unquantizedSheet.width + frameIndex * TARGET_WIDTH) * 4;
    frame.data.copy(unquantizedSheet.data, targetOffset, sourceOffset, sourceOffset + TARGET_WIDTH * 4);
  }
});

const quantized = quantizeBossPixelArt(unquantizedSheet, MAXIMUM_COLORS);
await mkdir(path.join(outputDirectory, 'frames'), { recursive: true });

const outputFrames = [];
for (let frameIndex = 0; frameIndex < FRAME_NAMES.length; frameIndex += 1) {
  const frame = new PNG({ width: TARGET_WIDTH, height: TARGET_HEIGHT, colorType: 6 });
  for (let y = 0; y < TARGET_HEIGHT; y += 1) {
    const sourceOffset = (y * quantized.image.width + frameIndex * TARGET_WIDTH) * 4;
    const targetOffset = y * TARGET_WIDTH * 4;
    quantized.image.data.copy(
      frame.data,
      targetOffset,
      sourceOffset,
      sourceOffset + TARGET_WIDTH * 4
    );
  }
  const fileName = `bottleneck-drone-${String(frameIndex + 1).padStart(2, '0')}-${FRAME_NAMES[frameIndex]}.png`;
  const relativePath = path.posix.join('frames', fileName);
  const finalCleanup = keepLargestOpaqueComponent(
    frame,
    {},
    { maximumDetachedRatio: 0.15 }
  );
  assertTransparentFrameMargin(frame, 4);
  const frameComponents = analyzeOpaqueComponents(frame);
  if (frameComponents.length !== 1) {
    throw new Error(`${FRAME_NAMES[frameIndex]} retained ${frameComponents.length} structural components.`);
  }
  for (let y = 0; y < TARGET_HEIGHT; y += 1) {
    const sourceOffset = y * TARGET_WIDTH * 4;
    const targetOffset = (y * quantized.image.width + frameIndex * TARGET_WIDTH) * 4;
    frame.data.copy(
      quantized.image.data,
      targetOffset,
      sourceOffset,
      sourceOffset + TARGET_WIDTH * 4
    );
  }
  await writeFile(path.join(outputDirectory, relativePath), PNG.sync.write(frame, { colorType: 6 }));
  outputFrames.push(Object.freeze({
    id: FRAME_NAMES[frameIndex],
    path: relativePath,
    analysis: analyzeBossPixelArtPng(frame),
    centroid: calculateOpaqueCentroid(frame),
    discardedComponentCount: finalCleanup.discardedComponentCount,
    discardedPixelCount: finalCleanup.discardedPixelCount
  }));
}

const sheetPath = path.join(outputDirectory, 'bottleneck-drone-sprite-sheet.png');
await writeFile(sheetPath, PNG.sync.write(quantized.image, { colorType: 6 }));

const manifest = Object.freeze({
  schemaVersion: 1,
  id: packageId,
  source: Object.freeze({
    path: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    width: source.width,
    height: source.height,
    frameCells
  }),
  processing: Object.freeze({
    frameOrder: FRAME_NAMES,
    commonCrop: Object.freeze({
      width: commonWidth,
      height: commonHeight,
      top: commonTop,
      bottom: commonBottom
    }),
    targetFrame: Object.freeze({ width: TARGET_WIDTH, height: TARGET_HEIGHT }),
    contentBox: Object.freeze({
      x: Math.floor((TARGET_WIDTH - CONTENT_WIDTH) / 2),
      y: Math.floor((TARGET_HEIGHT - CONTENT_HEIGHT) / 2),
      width: CONTENT_WIDTH,
      height: CONTENT_HEIGHT
    }),
    paletteLimit: MAXIMUM_COLORS,
    sharedPaletteSize: quantized.after.opaquePaletteSize,
    alpha: 'binary',
    scaling: 'nearest-neighbor',
    structuralComponentPolicy: 'largest-connected-component-only',
    sourceFrameGutterPixels: 4,
    transparentSafetyMarginPixels: 4
  }),
  runtime: Object.freeze({
    canvasWidth: TARGET_WIDTH,
    canvasHeight: TARGET_HEIGHT,
    anchor: Object.freeze({ x: 0.5, y: 0.5 }),
    projectileSocket: Object.freeze({ x: 0.5, y: 1 }),
    stateOrder: FRAME_NAMES
  }),
  frames: outputFrames,
  spriteSheet: 'bottleneck-drone-sprite-sheet.png'
});

await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

process.stdout.write(`${JSON.stringify({
  outputDirectory,
  frameCount: outputFrames.length,
  frameSize: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
  paletteSize: quantized.after.opaquePaletteSize,
  commonCrop: manifest.processing.commonCrop
})}\n`);
