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

const FRAME_NAMES = Object.freeze(['idle', 'neutral', 'attack', 'damage-50', 'critical-15']);
const TARGET_WIDTH = 84;
const TARGET_HEIGHT = 100;
const BODY_TARGET_HEIGHT = 72;
const BODY_TARGET_WIDTH = 76;
const BODY_TOP = 6;
const SAFETY_MARGIN = 4;
const SHEET_GUTTER = 4;
const MAXIMUM_COLORS = 32;
const ALPHA_THRESHOLD = 96;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const [sourceArgument, outputArgument] = process.argv.slice(2);

if (!sourceArgument || !outputArgument) {
  throw new Error(
    'Usage: node tools/build-paywall-wall-animation.mjs <transparent-sheet.png> <output-directory>'
  );
}

const sourcePath = path.resolve(sourceArgument);
const outputDirectory = path.resolve(outputArgument);
const relativeOutputDirectory = path.relative(workspaceRoot, outputDirectory);
if (
  !relativeOutputDirectory
  || relativeOutputDirectory.startsWith('..')
  || path.isAbsolute(relativeOutputDirectory)
) {
  throw new Error('Output directory must be inside the SciCon Shooter workspace.');
}

const sourceBytes = await readFile(sourcePath);
const decodedSource = PNG.sync.read(sourceBytes);
if (decodedSource.width < FRAME_NAMES.length * 100 || decodedSource.height < 200) {
  throw new Error(`Animation sheet is unexpectedly small: ${decodedSource.width}x${decodedSource.height}.`);
}

// Chroma removal deliberately leaves a soft authoring matte. Runtime structure
// is binary-alpha pixel art, so normalize it before any slicing or geometry
// analysis. This also makes cell-boundary checks deterministic.
const source = new PNG({
  width: decodedSource.width,
  height: decodedSource.height,
  colorType: 6
});
for (let offset = 0; offset < decodedSource.data.length; offset += 4) {
  const opaque = decodedSource.data[offset + 3] >= ALPHA_THRESHOLD;
  source.data[offset] = opaque ? decodedSource.data[offset] : 0;
  source.data[offset + 1] = opaque ? decodedSource.data[offset + 1] : 0;
  source.data[offset + 2] = opaque ? decodedSource.data[offset + 2] : 0;
  source.data[offset + 3] = opaque ? 255 : 0;
}

assertTransparentFrameGutters(source, FRAME_NAMES.length, 1);

const sourceCells = FRAME_NAMES.map((name, index) => {
  const left = Math.floor(index * source.width / FRAME_NAMES.length);
  const right = Math.floor((index + 1) * source.width / FRAME_NAMES.length) - 1;
  const cleanup = keepLargestOpaqueComponent(
    source,
    { left, right, top: 0, bottom: source.height - 1 },
    { maximumDetachedRatio: 0.08 }
  );
  const [primary] = analyzeOpaqueComponents(
    source,
    { left, right, top: 0, bottom: source.height - 1 }
  );
  if (!primary) throw new Error(`${name} contains no visible pixels.`);
  return Object.freeze({
    name,
    left,
    right,
    bounds: primary.bounds,
    opaquePixelCount: primary.pixelCount,
    discardedComponentCount: cleanup.discardedComponentCount,
    discardedPixelCount: cleanup.discardedPixelCount
  });
});

const structuralCells = sourceCells.filter(({ name }) => name !== 'attack');
const structuralTop = Math.min(...structuralCells.map(({ bounds }) => bounds.y));
const structuralBottom = Math.max(...structuralCells.map(({ bounds }) => (
  bounds.y + bounds.height - 1
)));
const structuralHeight = structuralBottom - structuralTop + 1;
const structuralWidth = Math.max(...sourceCells.map(({ bounds }) => bounds.width));
const scale = Math.min(
  BODY_TARGET_WIDTH / structuralWidth,
  BODY_TARGET_HEIGHT / structuralHeight
);
const targetCenterX = (TARGET_WIDTH - 1) / 2;

const renderCell = (cell) => {
  const output = new PNG({ width: TARGET_WIDTH, height: TARGET_HEIGHT, colorType: 6 });
  const sourceCenterX = cell.bounds.x + (cell.bounds.width - 1) / 2;
  for (let targetY = 0; targetY < TARGET_HEIGHT; targetY += 1) {
    const sourceY = Math.round(structuralTop + (targetY - BODY_TOP) / scale);
    if (sourceY < 0 || sourceY >= source.height) continue;
    for (let targetX = 0; targetX < TARGET_WIDTH; targetX += 1) {
      const sourceX = Math.round(sourceCenterX + (targetX - targetCenterX) / scale);
      if (sourceX < cell.left || sourceX > cell.right) continue;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      if (source.data[sourceOffset + 3] === 0) continue;
      const targetOffset = (targetY * TARGET_WIDTH + targetX) * 4;
      output.data[targetOffset] = source.data[sourceOffset];
      output.data[targetOffset + 1] = source.data[sourceOffset + 1];
      output.data[targetOffset + 2] = source.data[sourceOffset + 2];
      output.data[targetOffset + 3] = 255;
    }
  }
  keepLargestOpaqueComponent(output, {}, { maximumDetachedRatio: 0.08 });
  assertTransparentFrameMargin(output, SAFETY_MARGIN);
  return output;
};

const unquantizedFrames = sourceCells.map(renderCell);
const combined = new PNG({
  width: TARGET_WIDTH * FRAME_NAMES.length,
  height: TARGET_HEIGHT,
  colorType: 6
});
unquantizedFrames.forEach((frame, frameIndex) => {
  for (let y = 0; y < TARGET_HEIGHT; y += 1) {
    const sourceOffset = y * TARGET_WIDTH * 4;
    const targetOffset = (y * combined.width + frameIndex * TARGET_WIDTH) * 4;
    frame.data.copy(combined.data, targetOffset, sourceOffset, sourceOffset + TARGET_WIDTH * 4);
  }
});
const quantized = quantizeBossPixelArt(combined, MAXIMUM_COLORS);

await mkdir(path.join(outputDirectory, 'frames'), { recursive: true });
const outputFrames = [];
const finalFrames = [];
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
  const components = analyzeOpaqueComponents(frame);
  if (components.length !== 1) {
    throw new Error(`${FRAME_NAMES[frameIndex]} retained ${components.length} structural components.`);
  }
  assertTransparentFrameMargin(frame, SAFETY_MARGIN);
  const fileName = `paywall-wall-${String(frameIndex + 1).padStart(2, '0')}-${FRAME_NAMES[frameIndex]}.png`;
  const relativePath = path.posix.join('frames', fileName);
  const bytes = PNG.sync.write(frame, { colorType: 6 });
  await writeFile(path.join(outputDirectory, relativePath), bytes);
  finalFrames.push(frame);
  outputFrames.push(Object.freeze({
    id: FRAME_NAMES[frameIndex],
    path: relativePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    analysis: analyzeBossPixelArtPng(frame),
    centroid: calculateOpaqueCentroid(frame),
    sourceCleanup: Object.freeze({
      discardedComponentCount: sourceCells[frameIndex].discardedComponentCount,
      discardedPixelCount: sourceCells[frameIndex].discardedPixelCount
    })
  }));
}

const sheetWidth = TARGET_WIDTH * finalFrames.length + SHEET_GUTTER * (finalFrames.length - 1);
const sheet = new PNG({ width: sheetWidth, height: TARGET_HEIGHT, colorType: 6 });
const frameRectangles = [];
finalFrames.forEach((frame, frameIndex) => {
  const frameX = frameIndex * (TARGET_WIDTH + SHEET_GUTTER);
  frameRectangles.push(Object.freeze({ x: frameX, y: 0, width: TARGET_WIDTH, height: TARGET_HEIGHT }));
  for (let y = 0; y < TARGET_HEIGHT; y += 1) {
    const sourceOffset = y * TARGET_WIDTH * 4;
    const targetOffset = (y * sheet.width + frameX) * 4;
    frame.data.copy(sheet.data, targetOffset, sourceOffset, sourceOffset + TARGET_WIDTH * 4);
  }
});
const spriteSheet = 'paywall-wall-sprite-sheet.png';
await writeFile(path.join(outputDirectory, spriteSheet), PNG.sync.write(sheet, { colorType: 6 }));

const manifest = Object.freeze({
  schemaVersion: 1,
  id: path.basename(outputDirectory),
  source: Object.freeze({
    path: path.relative(workspaceRoot, sourcePath).replaceAll('\\', '/'),
    sha256: createHash('sha256').update(sourceBytes).digest('hex'),
    width: source.width,
    height: source.height,
    cells: sourceCells
  }),
  processing: Object.freeze({
    frameOrder: FRAME_NAMES,
    targetFrame: Object.freeze({ width: TARGET_WIDTH, height: TARGET_HEIGHT }),
    runtimeFrame: Object.freeze({ width: 42, height: 50 }),
    sourceToRuntimeScale: 0.5,
    structuralReference: Object.freeze({
      top: structuralTop,
      bottom: structuralBottom,
      width: structuralWidth,
      height: structuralHeight,
      scale
    }),
    bodyPlacement: Object.freeze({ top: BODY_TOP, targetWidth: BODY_TARGET_WIDTH, targetHeight: BODY_TARGET_HEIGHT }),
    paletteLimit: MAXIMUM_COLORS,
    sharedPaletteSize: quantized.after.opaquePaletteSize,
    alpha: 'binary',
    scaling: 'nearest-neighbor',
    structuralComponentPolicy: 'single-connected-component',
    sourceFrameGutterPixels: 1,
    transparentSafetyMarginPixels: SAFETY_MARGIN,
    sheetGutterPixels: SHEET_GUTTER
  }),
  runtime: Object.freeze({
    anchor: Object.freeze({ x: 0.5, y: 0.5 }),
    projectileSocket: Object.freeze({ x: 0.5, y: 1 }),
    stateOrder: FRAME_NAMES
  }),
  frames: outputFrames,
  spriteSheet: Object.freeze({ path: spriteSheet, width: sheetWidth, height: TARGET_HEIGHT, frames: frameRectangles })
});

await writeFile(
  path.join(outputDirectory, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

process.stdout.write(`${JSON.stringify({
  outputDirectory,
  frames: outputFrames.map(({ id, path: framePath, sha256 }) => ({ id, path: framePath, sha256 })),
  paletteSize: quantized.after.opaquePaletteSize,
  frameSize: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
  runtimeSize: '42x50'
})}\n`);
