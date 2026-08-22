import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from '../director/node_modules/pngjs/lib/png.js';

const FRAME_NAMES = Object.freeze([
  'neutral',
  'idle',
  'charge',
  'attack-a',
  'attack-b',
  'damage',
  'critical'
]);
const PROJECTILE_ASSET_IDS = Object.freeze({
  'fracture-engine-elite': 'fracture-shard',
  'aegis-brood-core': 'aegis-pulse',
  'railspine-wallcrawler': 'railspine-needle',
  'maw-carrier': 'maw-seed',
  'twin-meridian-sentinels': 'meridian-bolt',
  'prism-bloom': 'prism-petal',
  'aegis-convoy-captain': 'convoy-command-bolt',
  'gridline-sentries': 'gridline-bolt'
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

const isChromaPixel = (red, green, blue) => (
  green >= 180 && red <= 90 && blue <= 90 && green >= red * 2 && green >= blue * 2
);

const isBorderGuidePixel = (red, green, blue) => red >= 238 && green >= 238 && blue >= 238;

const readPng = async (filePath) => PNG.sync.read(await readFile(filePath));

const cropCell = (source, cellIndex, columns, rows) => {
  const column = cellIndex % columns;
  const row = Math.floor(cellIndex / columns);
  const x0 = Math.round(column * source.width / columns);
  const x1 = Math.round((column + 1) * source.width / columns);
  const y0 = Math.round(row * source.height / rows);
  const y1 = Math.round((row + 1) * source.height / rows);
  const output = new PNG({ width: x1 - x0, height: y1 - y0 });
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = ((y - y0) * output.width + (x - x0)) * 4;
      const red = source.data[sourceIndex];
      const green = source.data[sourceIndex + 1];
      const blue = source.data[sourceIndex + 2];
      const alpha = source.data[sourceIndex + 3];
      const transparent = alpha < 16 || isChromaPixel(red, green, blue) || isBorderGuidePixel(red, green, blue);
      output.data[targetIndex] = red;
      output.data[targetIndex + 1] = green;
      output.data[targetIndex + 2] = blue;
      output.data[targetIndex + 3] = transparent ? 0 : 255;
    }
  }
  return output;
};

const keepLargestOpaqueComponent = (png) => {
  const visited = new Uint8Array(png.width * png.height);
  const components = [];
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const start = y * png.width + x;
      if (visited[start] || png.data[start * 4 + 3] === 0) continue;
      visited[start] = 1;
      const queue = [start];
      const pixels = [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const pixel = queue[cursor];
        pixels.push(pixel);
        const pixelX = pixel % png.width;
        const pixelY = Math.floor(pixel / png.width);
        for (const [dx, dy] of directions) {
          const nextX = pixelX + dx;
          const nextY = pixelY + dy;
          if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) continue;
          const next = nextY * png.width + nextX;
          if (visited[next] || png.data[next * 4 + 3] === 0) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      components.push(pixels);
    }
  }
  components.sort((left, right) => right.length - left.length);
  if (components.length === 0) throw new Error('Generated cell has no structural component.');
  const keep = new Uint8Array(png.width * png.height);
  for (const pixel of components[0]) keep[pixel] = 1;
  let discardedPixels = 0;
  for (let pixel = 0; pixel < keep.length; pixel += 1) {
    if (keep[pixel] || png.data[pixel * 4 + 3] === 0) continue;
    png.data[pixel * 4 + 3] = 0;
    discardedPixels += 1;
  }
  return { componentCount: components.length, discardedPixels };
};

const opaqueBounds = (png) => {
  let left = png.width;
  let top = png.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error('Generated cell has no opaque subject.');
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
};

const resizeNearest = (source, width, height) => {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      source.data.copy(output.data, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return output;
};

const fitCell = (source, canvasSize = 192, margin = 8) => {
  const bounds = opaqueBounds(source);
  const maximumVisible = canvasSize - margin * 2;
  const scale = Math.min(maximumVisible / bounds.width, maximumVisible / bounds.height, 1);
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const cropped = new PNG({ width: bounds.width, height: bounds.height });
  PNG.bitblt(source, cropped, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0);
  const resized = resizeNearest(cropped, width, height);
  const output = new PNG({ width: canvasSize, height: canvasSize });
  const x = Math.round((canvasSize - width) / 2);
  const y = Math.round((canvasSize - height) / 2);
  PNG.bitblt(resized, output, 0, 0, width, height, x, y);
  return output;
};

const colorDistance = (left, right) => (
  ((left[0] - right[0]) ** 2) + ((left[1] - right[1]) ** 2) + ((left[2] - right[2]) ** 2)
);

const quantizeSharedPalette = (frames, maximumColors = 32) => {
  const counts = new Map();
  for (const frame of frames) {
    for (let index = 0; index < frame.data.length; index += 4) {
      if (frame.data[index + 3] === 0) continue;
      const red = Math.round(frame.data[index] / 17) * 17;
      const green = Math.round(frame.data[index + 1] / 17) * 17;
      const blue = Math.round(frame.data[index + 2] / 17) * 17;
      const key = `${red},${green},${blue}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const palette = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, maximumColors)
    .map(([key]) => key.split(',').map(Number));
  for (const frame of frames) {
    for (let index = 0; index < frame.data.length; index += 4) {
      if (frame.data[index + 3] === 0) continue;
      const source = [frame.data[index], frame.data[index + 1], frame.data[index + 2]];
      const color = palette.reduce((best, candidate) => (
        colorDistance(source, candidate) < colorDistance(source, best) ? candidate : best
      ), palette[0]);
      frame.data[index] = clampByte(color[0]);
      frame.data[index + 1] = clampByte(color[1]);
      frame.data[index + 2] = clampByte(color[2]);
      frame.data[index + 3] = 255;
    }
  }
  return palette;
};

const buildSheet = (frames, gutter = 4) => {
  const size = frames[0].width;
  const sheet = new PNG({ width: size * frames.length + gutter * (frames.length - 1), height: size });
  frames.forEach((frame, index) => PNG.bitblt(frame, sheet, 0, 0, size, size, index * (size + gutter), 0));
  return sheet;
};

const main = async () => {
  const [sourcePath, outputRoot, encounterId, columnsRaw = '4', rowsRaw = '2'] = process.argv.slice(2);
  if (!sourcePath || !outputRoot || !encounterId) {
    throw new Error('Usage: node tools/build-elite-pixel-state-pack.mjs <source-board.png> <output-root> <encounter-id> [columns] [rows]');
  }
  const source = await readPng(sourcePath);
  const columns = Math.max(1, Number(columnsRaw));
  const rows = Math.max(1, Number(rowsRaw));
  const structuralReports = [];
  const frames = FRAME_NAMES.map((_, index) => {
    const cell = cropCell(source, index, columns, rows);
    const sourceCleanup = keepLargestOpaqueComponent(cell);
    const fitted = fitCell(cell);
    const outputCleanup = keepLargestOpaqueComponent(fitted);
    structuralReports.push({
      sourceComponentCount: sourceCleanup.componentCount,
      sourceDiscardedPixels: sourceCleanup.discardedPixels,
      outputComponentCount: outputCleanup.componentCount,
      outputDiscardedPixels: outputCleanup.discardedPixels
    });
    return fitted;
  });
  const palette = quantizeSharedPalette(frames);
  await mkdir(outputRoot, { recursive: true });
  const manifestFrames = [];
  for (let index = 0; index < frames.length; index += 1) {
    const fileName = `${encounterId}-${FRAME_NAMES[index]}.png`;
    const bytes = PNG.sync.write(frames[index], { colorType: 6 });
    await writeFile(path.join(outputRoot, fileName), bytes);
    manifestFrames.push({ state: FRAME_NAMES[index], fileName, sha256: sha256(bytes) });
  }
  const sheet = buildSheet(frames);
  const sheetName = `${encounterId}-sheet.png`;
  const sheetBytes = PNG.sync.write(sheet, { colorType: 6 });
  await writeFile(path.join(outputRoot, sheetName), sheetBytes);
  const generatedFileNames = new Set([
    ...manifestFrames.map((frame) => frame.fileName),
    sheetName
  ]);
  const projectileAssetId = PROJECTILE_ASSET_IDS[encounterId];
  if (!projectileAssetId) throw new Error(`No projectile asset ID is registered for ${encounterId}.`);
  const projectileFrames = [];
  for (const entry of (await readdir(outputRoot, { withFileTypes: true }))
    .filter((candidate) => (
      candidate.isFile()
      && candidate.name.toLowerCase().endsWith('.png')
      && !generatedFileNames.has(candidate.name)
    ))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.startsWith(`${projectileAssetId}-`)) {
      throw new Error(`Unclassified PNG in ${encounterId}: ${entry.name}`);
    }
    const bytes = await readFile(path.join(outputRoot, entry.name));
    const projectile = PNG.sync.read(bytes);
    projectileFrames.push({
      assetId: projectileAssetId,
      fileName: entry.name,
      sha256: sha256(bytes),
      width: projectile.width,
      height: projectile.height
    });
  }
  if (projectileFrames.length !== 4) {
    throw new Error(`${encounterId} must inventory exactly four projectile frames.`);
  }
  await writeFile(path.join(outputRoot, 'pack-manifest.json'), `${JSON.stringify({
    schemaVersion: 2,
    encounterId,
    sourceSha256: sha256(await readFile(sourcePath)),
    canvas: { width: 192, height: 192 },
    runtimeContract: { sampling: 'nearest', alpha: 'binary', maximumSharedColors: 32, minimumMarginPixels: 8 },
    palette,
    frames: manifestFrames.map((frame, index) => ({ ...frame, structuralCleanup: structuralReports[index] })),
    projectileFrames,
    sheet: { fileName: sheetName, sha256: sha256(sheetBytes), gutterPixels: 4, usage: 'review-only' }
  }, null, 2)}\n`);
};

await main();
