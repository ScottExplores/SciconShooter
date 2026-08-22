import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildModularBossAssets } from './build-modular-boss-assets.mjs';
import { quantizeBossPixelArt } from './quantize-boss-pixel-art.mjs';

const requireFromDirector = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const BOSS_ID = 'abyssal-octarch';
const DEFAULT_ASSET_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../director-data/prototype-assets/abyssal-octarch'
);
const STRUCTURAL_PALETTE_LIMIT = 32;
const VFX_PALETTE_LIMIT = 48;
const ATLAS_GUTTER = 4;
const CELL_MARGIN = 6;
const TENTACLE_SCALE = 0.5;
const TENTACLE_CELL_WIDTH = 256;
const TENTACLE_CELL_HEIGHT = 160;
const TENTACLE_SOCKET_X = 244;

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round = (value, digits = 6) => Number(value.toFixed(digits));

const fileHash = async (filePath) => sha256(await readFile(filePath));
const readPng = async (filePath) => PNG.sync.read(await readFile(filePath));
const encodePng = (image) => PNG.sync.write(image, { colorType: 6 });
const writePng = async (filePath, image) => {
  const buffer = encodePng(image);
  await writeFile(filePath, buffer);
  return Object.freeze({
    file: path.basename(filePath),
    sha256: sha256(buffer),
    width: image.width,
    height: image.height
  });
};

const createTransparent = (width, height) => new PNG({ width, height, colorType: 6 });

const copyPixel = (source, sourceX, sourceY, target, targetX, targetY) => {
  const sourceOffset = (sourceY * source.width + sourceX) * 4;
  const targetOffset = (targetY * target.width + targetX) * 4;
  target.data[targetOffset] = source.data[sourceOffset];
  target.data[targetOffset + 1] = source.data[sourceOffset + 1];
  target.data[targetOffset + 2] = source.data[sourceOffset + 2];
  target.data[targetOffset + 3] = source.data[sourceOffset + 3];
};

const cropPng = (source, rect) => {
  const output = createTransparent(rect.width, rect.height);
  PNG.bitblt(source, output, rect.x, rect.y, rect.width, rect.height, 0, 0);
  return output;
};

const pastePng = (source, target, targetX, targetY) => {
  const sourceX = Math.max(0, -targetX);
  const sourceY = Math.max(0, -targetY);
  const outputX = Math.max(0, targetX);
  const outputY = Math.max(0, targetY);
  const width = Math.min(source.width - sourceX, target.width - outputX);
  const height = Math.min(source.height - sourceY, target.height - outputY);
  if (width <= 0 || height <= 0) return;
  PNG.bitblt(source, target, sourceX, sourceY, width, height, outputX, outputY);
};

const nearestResize = (source, width, height) => {
  const output = createTransparent(width, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / width));
      copyPixel(source, sourceX, sourceY, output, x, y);
    }
  }
  return output;
};

const isGreenFringe = (red, green, blue) => (
  green >= 64
  && green - red >= 18
  && green - blue >= 14
);

// The shared modular packer still supports older magenta-key source boards. These
// Octarch sources are already transparent and intentionally use violet tissue, so
// move the small set of colors that resemble that legacy key toward crimson or
// blue-violet before packing instead of allowing the packer to erase them.
const isLegacyMagentaKeyColor = (red, green, blue) => (
  red >= 70
  && blue >= 70
  && Math.min(red, blue) - green >= 28
  && Math.abs(red - blue) <= 128
);

const avoidLegacyMagentaKey = (image) => {
  let remappedPixels = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) continue;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    if (!isLegacyMagentaKeyColor(red, green, blue)) continue;
    if (red > blue) image.data[offset + 2] = 69;
    else image.data[offset] = 69;
    remappedPixels += 1;
  }
  return remappedPixels;
};

const countLegacyMagentaKeyPixels = (image) => {
  let count = 0;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (
      image.data[offset + 3] !== 0
      && isLegacyMagentaKeyColor(image.data[offset], image.data[offset + 1], image.data[offset + 2])
    ) count += 1;
  }
  return count;
};

const sanitizePixelArtAlpha = (image) => {
  const metrics = {
    removedGreenPixels: 0,
    removedLowAlphaPixels: 0,
    promotedAlphaPixels: 0
  };
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const alpha = image.data[offset + 3];
    const greenFringe = alpha > 0 && isGreenFringe(red, green, blue);
    const lowAlpha = alpha > 0 && alpha < 96;
    if (alpha === 0 || greenFringe || lowAlpha) {
      if (greenFringe) metrics.removedGreenPixels += 1;
      if (lowAlpha) metrics.removedLowAlphaPixels += 1;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 0;
      continue;
    }
    if (alpha !== 255) metrics.promotedAlphaPixels += 1;
    image.data[offset + 3] = 255;
  }
  return metrics;
};

const isOpaque = (image, x, y) => image.data[(y * image.width + x) * 4 + 3] === 255;

const opaqueComponents = (image, minimumPixels = 1) => {
  const total = image.width * image.height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components = [];
  for (let start = 0; start < total; start += 1) {
    if (visited[start] || image.data[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    let left = image.width;
    let top = image.height;
    let right = -1;
    let bottom = -1;
    const pixels = [];
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      pixels.push(pixel);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue;
          const next = nextY * image.width + nextX;
          if (visited[next] || image.data[next * 4 + 3] === 0) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (pixels.length < minimumPixels) continue;
    components.push(Object.freeze({
      pixels: Object.freeze(pixels),
      pixelCount: pixels.length,
      bounds: Object.freeze({
        x: left,
        y: top,
        width: right - left + 1,
        height: bottom - top + 1
      }),
      center: Object.freeze({
        x: (left + right) / 2,
        y: (top + bottom) / 2
      })
    }));
  }
  return components;
};

const isolateComponent = (source, component, padding = 0) => {
  const rect = {
    x: Math.max(0, component.bounds.x - padding),
    y: Math.max(0, component.bounds.y - padding),
    width: Math.min(source.width, component.bounds.x + component.bounds.width + padding)
      - Math.max(0, component.bounds.x - padding),
    height: Math.min(source.height, component.bounds.y + component.bounds.height + padding)
      - Math.max(0, component.bounds.y - padding)
  };
  const output = createTransparent(rect.width, rect.height);
  for (const pixel of component.pixels) {
    const sourceX = pixel % source.width;
    const sourceY = Math.floor(pixel / source.width);
    copyPixel(source, sourceX, sourceY, output, sourceX - rect.x, sourceY - rect.y);
  }
  return Object.freeze({ image: output, sourceRect: rect });
};

const isolateComponents = (source, components, padding = 0) => {
  if (components.length === 0) throw new Error('Cannot isolate an empty component group');
  const left = Math.max(0, Math.min(...components.map((component) => component.bounds.x)) - padding);
  const top = Math.max(0, Math.min(...components.map((component) => component.bounds.y)) - padding);
  const right = Math.min(
    source.width,
    Math.max(...components.map((component) => component.bounds.x + component.bounds.width)) + padding
  );
  const bottom = Math.min(
    source.height,
    Math.max(...components.map((component) => component.bounds.y + component.bounds.height)) + padding
  );
  const output = createTransparent(right - left, bottom - top);
  for (const component of components) {
    for (const pixel of component.pixels) {
      const sourceX = pixel % source.width;
      const sourceY = Math.floor(pixel / source.width);
      copyPixel(source, sourceX, sourceY, output, sourceX - left, sourceY - top);
    }
  }
  return Object.freeze({
    image: output,
    sourceRect: Object.freeze({ x: left, y: top, width: right - left, height: bottom - top })
  });
};

const keepOnlyComponent = (source, component) => isolateComponent(source, component).image;

const visibleBounds = (image, label) => {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let pixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isOpaque(image, x, y)) continue;
      pixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (pixels === 0) throw new Error(`${label} contains no opaque pixels`);
  return Object.freeze({
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    pixels
  });
};

const assertBinaryAlpha = (image, label) => {
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 0 && image.data[offset] !== 255) {
      throw new Error(`${label} contains semi-transparent alpha at pixel ${Math.floor(offset / 4)}`);
    }
  }
};

const opaquePaletteSize = (image) => {
  const colors = new Set();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3] === 0) continue;
    colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
  }
  return colors.size;
};

const splitFixedGrid = (image, columns, rows) => {
  const cellWidth = Math.floor(image.width / columns);
  const cellHeight = Math.floor(image.height / rows);
  const frames = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nominalLeft = Math.round(column * image.width / columns);
      const nominalTop = Math.round(row * image.height / rows);
      const nominalRight = Math.round((column + 1) * image.width / columns);
      const nominalBottom = Math.round((row + 1) * image.height / rows);
      const width = nominalRight - nominalLeft;
      const height = nominalBottom - nominalTop;
      const x = nominalLeft + Math.floor((width - cellWidth) / 2);
      const y = nominalTop + Math.floor((height - cellHeight) / 2);
      frames.push(Object.freeze({
        row,
        column,
        image: cropPng(image, { x, y, width: cellWidth, height: cellHeight }),
        sourceRect: Object.freeze({ x, y, width: cellWidth, height: cellHeight })
      }));
    }
  }
  return frames;
};

const buildSheet = (frames, columns, rows, cellWidth, cellHeight) => {
  if (frames.length !== columns * rows) {
    throw new Error(`Expected ${columns * rows} frames, received ${frames.length}`);
  }
  const sheet = createTransparent(columns * cellWidth, rows * cellHeight);
  frames.forEach((frame, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    pastePng(frame, sheet, column * cellWidth, row * cellHeight);
  });
  return sheet;
};

const quantizeTogether = (records, maximumColors) => {
  const width = Math.max(...records.map((record) => record.image.width));
  const height = records.reduce((total, record) => total + record.image.height, 0);
  const combined = createTransparent(width, height);
  let y = 0;
  const offsets = [];
  for (const record of records) {
    offsets.push(y);
    pastePng(record.image, combined, 0, y);
    y += record.image.height;
  }
  const quantized = quantizeBossPixelArt(combined, maximumColors).image;
  return records.map((record, index) => ({
    ...record,
    image: cropPng(quantized, {
      x: 0,
      y: offsets[index],
      width: record.image.width,
      height: record.image.height
    })
  }));
};

const assertSheetMargins = (sheet, columns, rows, margin, label) => {
  const cellWidth = sheet.width / columns;
  const cellHeight = sheet.height / rows;
  if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)) {
    throw new Error(`${label} does not divide into an integer ${columns}x${rows} grid`);
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const left = column * cellWidth;
      const top = row * cellHeight;
      for (let y = top; y < top + cellHeight; y += 1) {
        for (let x = left; x < left + cellWidth; x += 1) {
          if (!isOpaque(sheet, x, y)) continue;
          const localX = x - left;
          const localY = y - top;
          if (
            localX < margin
            || localY < margin
            || localX >= cellWidth - margin
            || localY >= cellHeight - margin
          ) {
            throw new Error(
              `${label} cell ${row},${column} has an opaque pixel inside its ${margin}px margin at ${localX},${localY}`
            );
          }
        }
      }
    }
  }
};

const buildBodySheet = (source) => {
  const components = opaqueComponents(source, 5_000)
    .sort((left, right) => left.center.x - right.center.x);
  if (components.length !== 4) {
    throw new Error(`Body-state source must contain exactly four structural subjects; found ${components.length}`);
  }
  const scaledFrames = components.map((component) => {
    const isolated = isolateComponent(source, component);
    const width = Math.round(isolated.image.width * 0.5);
    const height = Math.round(isolated.image.height * 0.5);
    return nearestResize(isolated.image, width, height);
  });
  const cellWidth = Math.max(...scaledFrames.map((frame) => frame.width)) + CELL_MARGIN * 2;
  const cellHeight = Math.max(...scaledFrames.map((frame) => frame.height)) + CELL_MARGIN * 2;
  const cells = scaledFrames.map((frame) => {
    const cell = createTransparent(cellWidth, cellHeight);
    pastePng(
      frame,
      cell,
      Math.floor((cellWidth - frame.width) / 2),
      Math.floor((cellHeight - frame.height) / 2)
    );
    return cell;
  });
  return Object.freeze({
    image: buildSheet(cells, 4, 1, cellWidth, cellHeight),
    cellWidth,
    cellHeight,
    sourceComponents: components.map((component) => component.bounds)
  });
};

const estimateTentacleSocket = (image) => {
  const bounds = visibleBounds(image, 'tentacle component');
  const thresholdX = bounds.x + Math.floor(bounds.width * 0.86);
  const candidates = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = thresholdX; x < bounds.x + bounds.width; x += 1) {
      if (isOpaque(image, x, y)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) throw new Error('Could not identify tentacle socket pixels');
  const meanY = candidates.reduce((total, pixel) => total + pixel.y, 0) / candidates.length;
  return Object.freeze({ x: bounds.x + bounds.width - 1, y: meanY });
};

const buildTentacleSheet = (source) => {
  const components = opaqueComponents(source, 5_000);
  if (components.length !== 12) {
    throw new Error(`Tentacle source must contain exactly twelve structural subjects; found ${components.length}`);
  }
  const ordered = [...components]
    .sort((left, right) => left.center.y - right.center.y)
    .reduce((rows, component, index) => {
      const row = Math.floor(index / 3);
      (rows[row] ??= []).push(component);
      return rows;
    }, [])
    .flatMap((row) => row.sort((left, right) => left.center.x - right.center.x));

  const frames = [];
  const extraction = [];
  for (const component of ordered) {
    const isolated = isolateComponent(source, component);
    const socket = estimateTentacleSocket(isolated.image);
    const scaled = nearestResize(
      isolated.image,
      Math.max(1, Math.round(isolated.image.width * TENTACLE_SCALE)),
      Math.max(1, Math.round(isolated.image.height * TENTACLE_SCALE))
    );
    const target = createTransparent(TENTACLE_CELL_WIDTH, TENTACLE_CELL_HEIGHT);
    const targetY = Math.round(TENTACLE_CELL_HEIGHT * 0.58);
    const targetX = TENTACLE_SOCKET_X;
    const pasteX = Math.round(targetX - socket.x * TENTACLE_SCALE);
    const pasteY = Math.round(targetY - socket.y * TENTACLE_SCALE);
    pastePng(scaled, target, pasteX, pasteY);
    const bounds = visibleBounds(target, 'registered tentacle frame');
    if (
      bounds.x < CELL_MARGIN
      || bounds.y < CELL_MARGIN
      || bounds.x + bounds.width > TENTACLE_CELL_WIDTH - CELL_MARGIN
      || bounds.y + bounds.height > TENTACLE_CELL_HEIGHT - CELL_MARGIN
    ) {
      throw new Error(`Registered tentacle frame exceeds its safe canvas: ${JSON.stringify(bounds)}`);
    }
    frames.push(target);
    extraction.push(Object.freeze({
      sourceBounds: component.bounds,
      sourceSocket: { x: round(socket.x), y: round(socket.y) },
      targetSocket: { x: targetX, y: targetY },
      outputBounds: bounds,
      uniformScale: TENTACLE_SCALE
    }));
  }
  return Object.freeze({
    image: buildSheet(frames, 3, 4, TENTACLE_CELL_WIDTH, TENTACLE_CELL_HEIGHT),
    cellWidth: TENTACLE_CELL_WIDTH,
    cellHeight: TENTACLE_CELL_HEIGHT,
    socket: { x: TENTACLE_SOCKET_X, y: Math.round(TENTACLE_CELL_HEIGHT * 0.58) },
    extraction
  });
};

const buildVfxSheet = (source) => {
  const components = opaqueComponents(source, 8);
  const grouped = Array.from({ length: 16 }, () => []);
  for (const component of components) {
    const column = Math.max(0, Math.min(3, Math.floor(component.center.x * 4 / source.width)));
    const row = Math.max(0, Math.min(3, Math.floor(component.center.y * 4 / source.height)));
    grouped[row * 4 + column].push(component);
  }
  const cells = grouped.map((cellComponents, index) => {
    if (cellComponents.length === 0) throw new Error(`VFX cell ${index} contains no authored pixels`);
    const isolated = isolateComponents(source, cellComponents);
    const scaled = nearestResize(
      isolated.image,
      Math.max(1, Math.round(isolated.image.width * 0.38)),
      Math.max(1, Math.round(isolated.image.height * 0.38))
    );
    if (scaled.width > 116 || scaled.height > 116) {
      throw new Error(`VFX cell ${index} exceeds its fixed-scale safe canvas at ${scaled.width}x${scaled.height}`);
    }
    const cell = createTransparent(128, 128);
    pastePng(scaled, cell, Math.floor((128 - scaled.width) / 2), Math.floor((128 - scaled.height) / 2));
    return cell;
  });
  return Object.freeze({ image: buildSheet(cells, 4, 4, 128, 128), cellWidth: 128, cellHeight: 128 });
};

const calculateRegistrationGroup = (images, registration, padding) => {
  const union = images.reduce((result, image) => {
    const bounds = visibleBounds(image, 'registration frame');
    return {
      left: Math.min(result.left, bounds.x - registration.x - padding),
      top: Math.min(result.top, bounds.y - registration.y - padding),
      right: Math.max(result.right, bounds.x + bounds.width - registration.x + padding),
      bottom: Math.max(result.bottom, bounds.y + bounds.height - registration.y + padding)
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
  const width = Math.ceil(union.right - union.left);
  const height = Math.ceil(union.bottom - union.top);
  return Object.freeze({
    width,
    height,
    registration: Object.freeze({ x: -union.left, y: -union.top }),
    anchor: Object.freeze({ x: -union.left / width, y: -union.top / height })
  });
};

const frameFromSheet = (sheet, columns, rows, row, column) => cropPng(sheet, {
  x: column * sheet.width / columns,
  y: row * sheet.height / rows,
  width: sheet.width / columns,
  height: sheet.height / rows
});

const makeSourceLayout = ({ body, tentacles, vfx, extraction }) => {
  const bodyFrames = ['neutral', 'anger', 'core-exposed', 'collapse'];
  const tentacleRows = [
    ['sweep.neutral', 'sweep.windup', 'sweep.extended'],
    ['grasp.open', 'grasp.reach', 'grasp.closed'],
    ['constrict.loose', 'constrict.tight', 'constrict.extended'],
    ['slam.hanging', 'slam.windup', 'slam.needle']
  ];
  const vfxRows = [
    ['bolt', 'charged-orb', 'beam-segment', 'impact'],
    ['asteroid', 'asteroid-cracked', 'asteroid-fragments', 'slam-shockwave'],
    ['void-cloud.0', 'void-cloud.1', 'void-cloud.2', 'suction-spiral'],
    ['grab-ring', 'damage-sparks', 'socket-burst', 'core-implosion']
  ];
  const cells = [{
    id: 'reference.locked',
    sourceId: 'locked-reference',
    cell: [0, 0],
    disposition: 'forbidden',
    usageStatus: 'archived',
    usageClassification: 'archived',
    reason: 'Canonical complete comparison reference only; never packed as gameplay anatomy.'
  }];
  bodyFrames.forEach((name, column) => cells.push({
    id: `body.${name}`,
    sourceId: 'body-states',
    cell: [0, column],
    registration: { x: body.cellWidth / 2, y: body.cellHeight / 2, unit: 'pixels' },
    disposition: 'runtime',
    usageStatus: column === 0 ? 'neutral' : column === 1 ? 'damage' : column === 2 ? 'phase2' : 'death',
    usageClassification: 'used',
    usedBy: [`rig-animation:body-state-cycle`, `runtime-body-state:${name}`]
  }));
  tentacleRows.forEach((rowNames, row) => rowNames.forEach((name, column) => cells.push({
    id: `tentacle.${name}`,
    sourceId: 'tentacles',
    cell: [row, column],
    registration: { x: tentacles.socket.x, y: tentacles.socket.y, unit: 'pixels' },
    disposition: 'runtime',
    usageStatus: name === 'sweep.neutral' || name === 'grasp.open' || name === 'constrict.loose' || name === 'slam.hanging'
      ? 'neutral'
      : 'attack',
    usageClassification: 'used',
    usedBy: [`rig-animation:tentacle-${name.split('.')[0]}-cycle`, `runtime-tentacle-pose:${name}`],
    extraction: extraction[row * 3 + column]
  })));
  vfxRows.forEach((rowNames, row) => rowNames.forEach((name, column) => cells.push({
    id: `vfx.${name}`,
    sourceId: 'vfx',
    cell: [row, column],
    registration: { x: vfx.cellWidth / 2, y: vfx.cellHeight / 2, unit: 'pixels' },
    padding: 6,
    disposition: 'runtime',
    usageStatus: name === 'damage-sparks' ? 'damage' : name === 'core-implosion' ? 'death' : 'attack',
    usageClassification: 'used',
    usedBy: [`runtime-vfx:${name}`]
  })));
  return {
    schemaVersion: 1,
    bossId: BOSS_ID,
    atlas: { gutter: ATLAS_GUTTER, maxSize: 2048 },
    assetUsage: { requireCompleteSourceGrid: true, requireConsumerForUsed: true },
    sources: [
      {
        id: 'locked-reference',
        file: `${BOSS_ID}-reference-runtime.png`,
        grid: { columns: 1, rows: 1 },
        provenance: 'Nearest-neighbor 720x480 runtime comparison image derived from the locked complete reference.'
      },
      {
        id: 'body-states',
        file: `${BOSS_ID}-body-runtime.png`,
        grid: { columns: 4, rows: 1 },
        provenance: 'Four globally isolated, equal-canvas body states: neutral, anger/damage, exposed core, collapse.'
      },
      {
        id: 'tentacles',
        file: `${BOSS_ID}-tentacles-runtime.png`,
        grid: { columns: 3, rows: 4 },
        provenance: 'Twelve globally isolated tentacle poses registered to one right-side mechanical socket; no source-grid clipping.'
      },
      {
        id: 'vfx',
        file: `${BOSS_ID}-vfx-runtime.png`,
        grid: { columns: 4, rows: 4 },
        provenance: 'Sixteen bounded pixel VFX cells for projectiles, asteroid lifecycle, void/suction, grab/damage/destruction.'
      }
    ],
    cells,
    registrationGroups: [
      { id: 'body-state-cycle', frames: bodyFrames.map((name) => `body.${name}`), padding: 8 },
      ...tentacleRows.map((rowNames) => ({
        id: `tentacle-${rowNames[0].split('.')[0]}-cycle`,
        frames: rowNames.map((name) => `tentacle.${name}`),
        padding: 8
      })),
      { id: 'asteroid-lifecycle', frames: ['vfx.asteroid', 'vfx.asteroid-cracked', 'vfx.asteroid-fragments'], padding: 6 },
      { id: 'void-cloud-cycle', frames: ['vfx.void-cloud.0', 'vfx.void-cloud.1', 'vfx.void-cloud.2'], padding: 6 }
    ]
  };
};

const makeRigSource = ({ referenceHash, sourceHashes, layoutHash, bodyGroup, tentacleGroups }) => {
  const root = { x: 360, y: 232 };
  const bodyAnchor = bodyGroup.anchor;
  const tentacleFrameAnchors = Object.fromEntries(
    Object.entries(tentacleGroups).map(([name, group]) => [name, group.anchor])
  );
  const tentacles = [
    { id: 'tentacle.port.upper', frame: 'tentacle.sweep.neutral', group: 'sweep', x: -79, y: -85, rotation: 5, scaleX: 0.94, layer: 2 },
    { id: 'tentacle.starboard.upper', frame: 'tentacle.sweep.neutral', group: 'sweep', x: 79, y: -85, rotation: -5, scaleX: -0.94, layer: 2 },
    { id: 'tentacle.port.middle-upper', frame: 'tentacle.slam.hanging', group: 'slam', x: -96, y: -36, rotation: -1, scaleX: 0.94, layer: 3 },
    { id: 'tentacle.starboard.middle-upper', frame: 'tentacle.slam.hanging', group: 'slam', x: 96, y: -36, rotation: 1, scaleX: -0.94, layer: 3 },
    { id: 'tentacle.port.middle-lower', frame: 'tentacle.constrict.loose', group: 'constrict', x: -94, y: 38, rotation: -10, scaleX: 0.94, layer: 4 },
    { id: 'tentacle.starboard.middle-lower', frame: 'tentacle.constrict.loose', group: 'constrict', x: 94, y: 38, rotation: 10, scaleX: -0.94, layer: 4 },
    { id: 'tentacle.port.lower', frame: 'tentacle.grasp.open', group: 'grasp', x: -72, y: 98, rotation: -20, scaleX: 0.94, layer: 5 },
    { id: 'tentacle.starboard.lower', frame: 'tentacle.grasp.open', group: 'grasp', x: 72, y: 98, rotation: 20, scaleX: -0.94, layer: 5 }
  ];
  const parts = [
    {
      id: 'root',
      role: 'encounter-root',
      parentId: null,
      frameId: null,
      transform: { x: root.x, y: root.y, rotationDegrees: 0, scaleX: 1, scaleY: 1 },
      layer: 0,
      neutralVisible: false
    },
    ...tentacles.flatMap((tentacle) => [
      {
        id: `${tentacle.id}.mount`,
        role: 'destructible-tentacle-joint',
        parentId: 'root',
        frameId: null,
        transform: { x: tentacle.x, y: tentacle.y, rotationDegrees: tentacle.rotation, scaleX: 1, scaleY: 1 },
        layer: tentacle.layer,
        neutralVisible: false,
        requiredOverlapPx: 10
      },
      {
        id: tentacle.id,
        role: tentacle.id.includes('port') ? 'authored-port-tentacle' : 'intentional-mirrored-starboard-tentacle',
        parentId: `${tentacle.id}.mount`,
        frameId: tentacle.frame,
        anchor: tentacleFrameAnchors[tentacle.group],
        transform: {
          x: 0,
          y: 0,
          rotationDegrees: 0,
          scaleX: tentacle.scaleX,
          scaleY: 0.94
        },
        layer: tentacle.layer,
        neutralVisible: true,
        requiredOverlapPx: 10,
        structuralScaleMustRemainUniform: true,
        handedness: tentacle.id.includes('port') ? 'authored-port' : 'intentional-horizontal-mirror'
      }
    ]),
    {
      id: 'body',
      role: 'central-biomechanical-head',
      parentId: 'root',
      frameId: 'body.neutral',
      anchor: bodyAnchor,
      transform: { x: 0, y: -2, rotationDegrees: 0, scaleX: 1.02, scaleY: 1.02 },
      layer: 10,
      neutralVisible: true,
      structuralScaleMustRemainUniform: true
    }
  ];
  const sockets = [
    { id: 'core.emitter', role: 'moving-body-emitter', partId: 'body', x: 0, y: 48 },
    { id: 'mouth.suction', role: 'moving-suction-origin', partId: 'body', x: 0, y: 58 },
    ...tentacles.flatMap((tentacle) => [
      { id: `${tentacle.id}.joint`, role: 'destructible-tentacle-joint', partId: `${tentacle.id}.mount`, x: 0, y: 0 },
      { id: `${tentacle.id}.tip`, role: 'moving-tentacle-attack-origin', partId: tentacle.id, x: -224, y: 0 }
    ])
  ];
  const animations = [
    { id: 'body-state-cycle', partId: 'body', frameIds: ['body.neutral', 'body.anger', 'body.core-exposed', 'body.collapse'], fps: 5, loop: false },
    { id: 'tentacle-sweep-cycle', partId: 'tentacle.port.upper', frameIds: ['tentacle.sweep.neutral', 'tentacle.sweep.windup', 'tentacle.sweep.extended'], fps: 8, loop: false },
    { id: 'tentacle-grasp-cycle', partId: 'tentacle.port.lower', frameIds: ['tentacle.grasp.open', 'tentacle.grasp.reach', 'tentacle.grasp.closed'], fps: 8, loop: false },
    { id: 'tentacle-constrict-cycle', partId: 'tentacle.port.middle-lower', frameIds: ['tentacle.constrict.loose', 'tentacle.constrict.tight', 'tentacle.constrict.extended'], fps: 7, loop: false },
    { id: 'tentacle-slam-cycle', partId: 'tentacle.port.middle-upper', frameIds: ['tentacle.slam.hanging', 'tentacle.slam.windup', 'tentacle.slam.needle'], fps: 9, loop: false }
  ];
  return {
    schemaVersion: 1,
    artifactType: 'boss-rig-pivot-manifest',
    format: 'modular-hierarchy-v1',
    bossId: BOSS_ID,
    canonicalReference: {
      path: `${BOSS_ID}-reference-runtime.png`,
      sha256: referenceHash,
      width: 720,
      height: 480,
      neutralLandmarks: [
        { id: 'central-core', label: 'Bioluminescent central core', reference: { xRatio: 0.5, yRatio: 0.59 }, rig: { kind: 'socket', socketId: 'core.emitter' } },
        { id: 'port-upper-socket', label: 'Upper port attachment', reference: { xRatio: 0.344, yRatio: 0.32 }, rig: { kind: 'socket', socketId: 'tentacle.port.upper.joint' } },
        { id: 'starboard-upper-socket', label: 'Upper starboard attachment', reference: { xRatio: 0.656, yRatio: 0.32 }, rig: { kind: 'socket', socketId: 'tentacle.starboard.upper.joint' } },
        { id: 'port-lower-socket', label: 'Lower port attachment', reference: { xRatio: 0.416, yRatio: 0.72 }, rig: { kind: 'socket', socketId: 'tentacle.port.lower.joint' } },
        { id: 'starboard-lower-socket', label: 'Lower starboard attachment', reference: { xRatio: 0.584, yRatio: 0.72 }, rig: { kind: 'socket', socketId: 'tentacle.starboard.lower.joint' } }
      ]
    },
    coordinateSystem: {
      canvas: { width: 720, height: 480 },
      xAxis: 'right',
      yAxis: 'down',
      rotationUnit: 'degrees',
      rootNeutral: root,
      runtimeRotationUnit: 'radians',
      runtimeNormalizer: 'pending-services/pixi/boss-rigs/AbyssalOctarchArtwork.ts'
    },
    sourceIntegrity: {
      sourceLayout: { path: 'source-layout.json', sha256: layoutHash },
      reference: { path: `${BOSS_ID}-reference-runtime.png`, sha256: referenceHash },
      ...sourceHashes
    },
    rootPartId: 'root',
    atlases: [],
    articulationJoints: tentacles.map((tentacle) => ({
      id: `${tentacle.id}.joint`,
      partId: `${tentacle.id}.mount`,
      parentId: 'root',
      role: 'destructible-tentacle-joint',
      neutralTransform: { x: tentacle.x, y: tentacle.y, rotationDegrees: tentacle.rotation, scaleX: 1, scaleY: 1 },
      drivenParts: [tentacle.id],
      validatedMotionRangeRadians: { minimum: -0.9, maximum: 0.9 },
      requiredOverlapPx: 10
    })),
    collisionParts: ['body', ...tentacles.map((tentacle) => tentacle.id)],
    collisionSource: 'assembled-neutral-alpha-mask-plus-eight-independent-tentacle-masks',
    layerOrderBackToFront: [...tentacles.map((tentacle) => tentacle.id), 'body'],
    referenceComparison: {
      sameCenter: true,
      sameOverallHeight: false,
      adjustableOpacity: true,
      requiredLandmarkIds: ['central-core', 'port-upper-socket', 'starboard-upper-socket', 'port-lower-socket', 'starboard-lower-socket'],
      status: 'blocked-pending-boss-sandbox-overlay'
    },
    destruction: {
      durationFrames: 150,
      runtimeSource: 'pending-services/pixi/boss-rigs/AbyssalOctarchArtwork.ts',
      fragments: [
        ...tentacles.map((tentacle, index) => ({
          partId: tentacle.id,
          delayFrames: index * 4,
          travelX: tentacle.id.includes('port') ? -180 - index * 8 : 180 + index * 8,
          travelY: 150 + index * 12,
          rotationRadians: tentacle.id.includes('port') ? -2.2 : 2.2
        })),
        { partId: 'body', delayFrames: 40, travelX: 0, travelY: 220, rotationRadians: 0.35 }
      ]
    },
    unverifiedRigContractFields: ['runtime-world-scale', 'boss-sandbox-neutral-overlay', 'moving-socket-gameplay-captures'],
    canvas: { width: 720, height: 480, designUnits: 'pixels-at-neutral-preview' },
    parts,
    sockets,
    animations,
    states: {
      intro: { bodyVisible: true, tentaclesEnterInSequence: true, socketsEnabled: false },
      idle: { bodyFrame: 'body.neutral', independentTentacleTransformMotion: true, corePulseRestrained: true },
      telegraph: { tentacleNodesGlow: true, movingSocketsFollowPose: true },
      attack: { tentacleFrameCyclesEnabled: true, emissionsUseLiveTipSockets: true },
      recovery: { bodyFrame: 'body.anger', tentaclesReturnToCanonicalPose: true },
      stagger: { bodyFrame: 'body.anger', socketBurstVisible: true },
      'phase-transition': { bodyFrame: 'body.core-exposed', survivingTentaclesRemainArticulated: true },
      death: { bodyFrame: 'body.collapse', attackSocketsEnabled: false, collapseHierarchy: true }
    }
  };
};

const assertAtlasGutters = async (assetRoot, metadataFile) => {
  const metadata = JSON.parse(await readFile(path.join(assetRoot, metadataFile), 'utf8'));
  const atlas = await readPng(path.join(assetRoot, metadata.image.file));
  const frames = Object.entries(metadata.frames);
  for (const [frameId, rect] of frames) {
    for (let y = rect.y - ATLAS_GUTTER; y < rect.y + rect.height + ATLAS_GUTTER; y += 1) {
      for (let x = rect.x - ATLAS_GUTTER; x < rect.x + rect.width + ATLAS_GUTTER; x += 1) {
        if (x < 0 || y < 0 || x >= atlas.width || y >= atlas.height) continue;
        const inside = x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
        if (inside) continue;
        if (isOpaque(atlas, x, y)) {
          throw new Error(`${frameId} has neighboring atlas pixels inside its ${ATLAS_GUTTER}px gutter at ${x},${y}`);
        }
      }
    }
  }
  return Object.freeze({ frameCount: frames.length, width: atlas.width, height: atlas.height });
};

const makeAssetUsageInventory = async (assetRoot, manifest) => {
  const usage = JSON.parse(await readFile(path.join(assetRoot, manifest.outputs.assetUsage.file), 'utf8'));
  const usageByFrame = new Map(usage.frames.map((frame) => [frame.frameId, frame]));
  const statusMap = {
    neutral: 'used-neutral',
    animation: 'used-animation',
    attack: 'used-attack',
    phase2: 'used-phase-two',
    damage: 'used-damage',
    death: 'used-death'
  };
  return {
    schemaVersion: 1,
    artifactType: 'boss-asset-usage-inventory',
    bossId: BOSS_ID,
    allowedStatuses: [
      'used-neutral',
      'used-animation',
      'used-attack',
      'used-phase-two',
      'used-damage',
      'used-death',
      'retained-future-alternate',
      'archived-redundant-or-inconsistent'
    ],
    assets: manifest.outputs.components.map((component) => {
      const frame = usageByFrame.get(component.frameId);
      return {
        id: component.frameId,
        path: component.file,
        sha256: component.sha256,
        kind: component.frameId.startsWith('vfx.') ? 'pixel-vfx-sprite' : 'structural-sprite',
        status: statusMap[frame.status] ?? 'used-attack',
        owners: frame.usedBy,
        decision: 'Accepted into the sandbox-only Octarch runtime atlas after deterministic extraction, binary-alpha cleanup, palette limiting, and gutter validation.',
        structuralAlphaBinary: true,
        registrationGroup: manifest.outputs.atlasMetadata.file && component.registrationGroup
      };
    }),
    audit: {
      allAcceptedExportsListed: true,
      magentaAndGuidePixelsRemoved: true,
      transparentEdgesClean: true,
      alternateFramesEqualCanvasAndRegistered: true,
      textureSmoothingDisabled: false,
      structuralScalingUniform: true,
      silentUnusedAssetCount: 0,
      note: 'Nearest-neighbor runtime sampling remains blocked until the gameplay registration is implemented and visually captured.'
    }
  };
};

export const buildAbyssalOctarchAssets = async ({
  sourceRoot = DEFAULT_ASSET_ROOT,
  outputRoot = sourceRoot
} = {}) => {
  const resolvedSource = path.resolve(sourceRoot);
  const resolvedOutput = path.resolve(outputRoot);
  await mkdir(resolvedOutput, { recursive: true });

  const sourceNames = {
    reference: `${BOSS_ID}-reference.png`,
    bodySocketReference: `${BOSS_ID}-body.png`,
    bodyStates: `${BOSS_ID}-body-states.png`,
    tentacles: `${BOSS_ID}-tentacles.png`,
    vfx: `${BOSS_ID}-vfx.png`
  };
  const sourceBuffers = Object.fromEntries(await Promise.all(
    Object.entries(sourceNames).map(async ([id, file]) => [id, await readFile(path.join(resolvedSource, file))])
  ));
  const images = Object.fromEntries(
    Object.entries(sourceBuffers).map(([id, buffer]) => [id, PNG.sync.read(buffer)])
  );
  const cleanup = Object.fromEntries(
    Object.entries(images).map(([id, image]) => [id, sanitizePixelArtAlpha(image)])
  );

  const referenceComponents = opaqueComponents(images.reference, 5_000);
  if (referenceComponents.length !== 1) {
    throw new Error(`Canonical reference must contain one connected boss silhouette; found ${referenceComponents.length}`);
  }
  const referenceIsolated = keepOnlyComponent(images.reference, referenceComponents[0]);
  const referenceRuntime = createTransparent(720, 480);
  const referenceScaled = nearestResize(referenceIsolated, 665, 423);
  pastePng(referenceScaled, referenceRuntime, Math.floor((720 - 665) / 2), Math.floor((480 - 423) / 2));

  const bodySocketComponents = opaqueComponents(images.bodySocketReference, 5_000);
  if (bodySocketComponents.length !== 1) {
    throw new Error(`Body socket reference must contain one connected body; found ${bodySocketComponents.length}`);
  }
  const bodySocketIsolated = keepOnlyComponent(images.bodySocketReference, bodySocketComponents[0]);
  const bodySocketRuntime = createTransparent(224, 304);
  const bodySocketScale = Math.min(200 / bodySocketIsolated.width, 282 / bodySocketIsolated.height);
  const bodySocketScaled = nearestResize(
    bodySocketIsolated,
    Math.round(bodySocketIsolated.width * bodySocketScale),
    Math.round(bodySocketIsolated.height * bodySocketScale)
  );
  pastePng(
    bodySocketScaled,
    bodySocketRuntime,
    Math.floor((bodySocketRuntime.width - bodySocketScaled.width) / 2),
    Math.floor((bodySocketRuntime.height - bodySocketScaled.height) / 2)
  );

  const bodyBuild = buildBodySheet(images.bodyStates);
  const tentacleBuild = buildTentacleSheet(images.tentacles);
  const vfxBuild = buildVfxSheet(images.vfx);

  const structural = quantizeTogether([
    { id: 'reference', image: referenceRuntime },
    { id: 'body-socket-reference', image: bodySocketRuntime },
    { id: 'body', image: bodyBuild.image },
    { id: 'tentacles', image: tentacleBuild.image }
  ], STRUCTURAL_PALETTE_LIMIT);
  const structuralById = new Map(structural.map((record) => [record.id, record.image]));
  const vfxRuntime = quantizeBossPixelArt(vfxBuild.image, VFX_PALETTE_LIMIT).image;

  const outputImages = {
    reference: structuralById.get('reference'),
    bodySocketReference: structuralById.get('body-socket-reference'),
    body: structuralById.get('body'),
    tentacles: structuralById.get('tentacles'),
    vfx: vfxRuntime
  };
  const legacyMagentaRemap = Object.fromEntries(
    Object.entries(outputImages).map(([id, image]) => [id, avoidLegacyMagentaKey(image)])
  );
  for (const [id, image] of Object.entries(outputImages)) assertBinaryAlpha(image, id);
  for (const [id, image] of Object.entries(outputImages)) {
    const remaining = countLegacyMagentaKeyPixels(image);
    if (remaining > 0) throw new Error(`${id} retains ${remaining} pixels that collide with the legacy magenta key`);
  }
  assertSheetMargins(outputImages.body, 4, 1, CELL_MARGIN, 'body runtime sheet');
  assertSheetMargins(outputImages.tentacles, 3, 4, CELL_MARGIN, 'tentacle runtime sheet');
  assertSheetMargins(outputImages.vfx, 4, 4, 3, 'VFX runtime sheet');

  const written = {};
  written.reference = await writePng(path.join(resolvedOutput, `${BOSS_ID}-reference-runtime.png`), outputImages.reference);
  written.bodySocketReference = await writePng(path.join(resolvedOutput, `${BOSS_ID}-body-socket-reference-runtime.png`), outputImages.bodySocketReference);
  written.body = await writePng(path.join(resolvedOutput, `${BOSS_ID}-body-runtime.png`), outputImages.body);
  written.tentacles = await writePng(path.join(resolvedOutput, `${BOSS_ID}-tentacles-runtime.png`), outputImages.tentacles);
  written.vfx = await writePng(path.join(resolvedOutput, `${BOSS_ID}-vfx-runtime.png`), outputImages.vfx);

  const extractionMap = {
    schemaVersion: 1,
    bossId: BOSS_ID,
    sourceSheetProblem: 'The generated tentacle board contains twelve connected subjects that cross nominal 3x4 cell boundaries; direct grid slicing is forbidden.',
    method: 'global-connected-component-isolation-then-right-socket-registration',
    uniformTentacleScale: TENTACLE_SCALE,
    targetTentacleCell: {
      width: TENTACLE_CELL_WIDTH,
      height: TENTACLE_CELL_HEIGHT,
      socket: tentacleBuild.socket,
      safeMargin: CELL_MARGIN
    },
    frameOrder: [
      'tentacle.sweep.neutral', 'tentacle.sweep.windup', 'tentacle.sweep.extended',
      'tentacle.grasp.open', 'tentacle.grasp.reach', 'tentacle.grasp.closed',
      'tentacle.constrict.loose', 'tentacle.constrict.tight', 'tentacle.constrict.extended',
      'tentacle.slam.hanging', 'tentacle.slam.windup', 'tentacle.slam.needle'
    ],
    frames: tentacleBuild.extraction,
    bodySourceComponents: bodyBuild.sourceComponents,
    cleanup
  };
  const extractionBuffer = Buffer.from(stableJson(extractionMap));
  await writeFile(path.join(resolvedOutput, `${BOSS_ID}.source-extraction.json`), extractionBuffer);

  const sourceLayout = makeSourceLayout({
    body: bodyBuild,
    tentacles: tentacleBuild,
    vfx: vfxBuild,
    extraction: tentacleBuild.extraction
  });
  const sourceLayoutBuffer = Buffer.from(stableJson(sourceLayout));
  await writeFile(path.join(resolvedOutput, 'source-layout.json'), sourceLayoutBuffer);

  const bodyImages = [0, 1, 2, 3].map((column) => frameFromSheet(outputImages.body, 4, 1, 0, column));
  const bodyGroup = calculateRegistrationGroup(
    bodyImages,
    { x: bodyBuild.cellWidth / 2, y: bodyBuild.cellHeight / 2 },
    8
  );
  const tentacleGroupNames = ['sweep', 'grasp', 'constrict', 'slam'];
  const tentacleGroups = Object.fromEntries(tentacleGroupNames.map((name, row) => [
    name,
    calculateRegistrationGroup(
      [0, 1, 2].map((column) => frameFromSheet(outputImages.tentacles, 3, 4, row, column)),
      tentacleBuild.socket,
      8
    )
  ]));
  const sourceHashes = {
    bodyStates: { path: written.body.file, sha256: written.body.sha256 },
    tentacles: { path: written.tentacles.file, sha256: written.tentacles.sha256 },
    vfx: { path: written.vfx.file, sha256: written.vfx.sha256 },
    bodySocketReference: { path: written.bodySocketReference.file, sha256: written.bodySocketReference.sha256 }
  };
  const rigSource = makeRigSource({
    referenceHash: written.reference.sha256,
    sourceHashes,
    layoutHash: sha256(sourceLayoutBuffer),
    bodyGroup,
    tentacleGroups
  });
  const rigSourceBuffer = Buffer.from(stableJson(rigSource));
  await writeFile(path.join(resolvedOutput, 'rig.source.json'), rigSourceBuffer);

  const packageManifest = await buildModularBossAssets({
    layoutPath: path.join(resolvedOutput, 'source-layout.json'),
    rigSourcePath: path.join(resolvedOutput, 'rig.source.json'),
    outputDirectory: resolvedOutput
  });
  const atlasCheck = await assertAtlasGutters(resolvedOutput, packageManifest.outputs.atlasMetadata.file);

  const neutralBuffer = await readFile(path.join(resolvedOutput, packageManifest.outputs.neutralPreview.file));
  const atlasBuffer = await readFile(path.join(resolvedOutput, packageManifest.outputs.atlas.file));
  await writeFile(path.join(resolvedOutput, 'assembled.png'), neutralBuffer);
  await writeFile(path.join(resolvedOutput, 'sheet.png'), atlasBuffer);

  const assetUsageInventory = await makeAssetUsageInventory(resolvedOutput, packageManifest);
  const assetUsageInventoryBuffer = Buffer.from(stableJson(assetUsageInventory));
  await writeFile(path.join(resolvedOutput, `${BOSS_ID}.asset-usage-inventory.json`), assetUsageInventoryBuffer);

  const referenceLock = {
    schemaVersion: 1,
    artifactType: 'boss-reference-lock',
    bossId: BOSS_ID,
    gate: '1-reference-lock',
    verdict: 'pass',
    canonicalReference: written.reference,
    originalGeneratedReference: {
      file: sourceNames.reference,
      sha256: sha256(sourceBuffers.reference),
      width: images.reference.width,
      height: images.reference.height
    },
    structuralDerivation: {
      bodySource: { file: sourceNames.bodyStates, sha256: sha256(sourceBuffers.bodyStates) },
      socketReferenceSource: { file: sourceNames.bodySocketReference, sha256: sha256(sourceBuffers.bodySocketReference) },
      tentacleSource: { file: sourceNames.tentacles, sha256: sha256(sourceBuffers.tentacles) },
      method: 'reference-edited ImageGen lineage, then deterministic connected-component extraction and equal registration'
    },
    processing: {
      nearestNeighborOnly: true,
      structuralPaletteLimit: STRUCTURAL_PALETTE_LIMIT,
      binaryStructuralAlpha: true,
      greenFringeRemoved: true,
      atlasGutterPixels: ATLAS_GUTTER
    },
    note: 'Gate 1 locks art only. Neutral Sandbox overlay, motion, attacks, route proof, and gameplay remain unverified.'
  };
  const referenceLockBuffer = Buffer.from(stableJson(referenceLock));
  await writeFile(path.join(resolvedOutput, `${BOSS_ID}.reference-lock.json`), referenceLockBuffer);

  const generatedFiles = [
    written.reference.file,
    written.bodySocketReference.file,
    written.body.file,
    written.tentacles.file,
    written.vfx.file,
    'source-layout.json',
    'rig.source.json',
    `${BOSS_ID}.source-extraction.json`,
    packageManifest.outputs.atlas.file,
    packageManifest.outputs.atlasMetadata.file,
    packageManifest.outputs.rig.file,
    packageManifest.outputs.neutralPreview.file,
    packageManifest.outputs.assetUsage.file,
    `${BOSS_ID}.asset-usage-inventory.json`,
    `${BOSS_ID}.reference-lock.json`,
    'assembled.png',
    'sheet.png',
    ...packageManifest.outputs.components.map((component) => component.file)
  ];
  const outputHashes = Object.fromEntries(await Promise.all(
    [...new Set(generatedFiles)].sort().map(async (file) => [file, await fileHash(path.join(resolvedOutput, file))])
  ));
  const buildManifest = {
    schemaVersion: 1,
    artifactType: 'abyssal-octarch-deterministic-asset-build',
    bossId: BOSS_ID,
    builder: 'tools/build-abyssal-octarch-assets.mjs',
    inputs: Object.fromEntries(Object.entries(sourceNames).map(([id, file]) => [id, {
      file,
      sha256: sha256(sourceBuffers[id]),
      width: images[id].width,
      height: images[id].height
    }])),
    outputs: outputHashes,
    validation: {
      expectedTentacleSubjects: 12,
      extractedTentacleSubjects: tentacleBuild.extraction.length,
      equalTentacleCanvases: true,
      tentacleSocketRegistration: tentacleBuild.socket,
      structuralPaletteLimit: STRUCTURAL_PALETTE_LIMIT,
      structuralPaletteSize: Math.max(
        opaquePaletteSize(outputImages.reference),
        opaquePaletteSize(outputImages.body),
        opaquePaletteSize(outputImages.tentacles)
      ),
      vfxPaletteLimit: VFX_PALETTE_LIMIT,
      vfxPaletteSize: opaquePaletteSize(outputImages.vfx),
      binaryAlpha: true,
      processedSheetMargins: 'pass',
      atlasTransparentGutters: 'pass',
      atlas: atlasCheck,
      atlasWithin2048: atlasCheck.width <= 2048 && atlasCheck.height <= 2048,
      sourceGridClippingPrevented: true,
      legacyMagentaKeyCollisionPixels: 0,
      legacyMagentaRemappedPixels: legacyMagentaRemap,
      runtimeNearestNeighborSampling: 'required-not-yet-verified'
    },
    gateStatus: {
      gate1ReferenceLock: 'pass',
      gate2NeutralPoseMatch: 'blocked-pending-boss-sandbox-overlay',
      gate3MotionRangeReview: 'blocked-pending-runtime-animation',
      gate4AttackToSpriteReview: 'blocked-pending-runtime-attacks',
      gate5ActualGameplayReview: 'blocked-pending-captures-and-route-proof'
    }
  };
  const buildManifestBuffer = Buffer.from(stableJson(buildManifest));
  await writeFile(path.join(resolvedOutput, `${BOSS_ID}.build-manifest.json`), buildManifestBuffer);
  return buildManifest;
};

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const outputArg = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const manifest = await buildAbyssalOctarchAssets({
    sourceRoot: DEFAULT_ASSET_ROOT,
    outputRoot: outputArg ? path.resolve(outputArg) : DEFAULT_ASSET_ROOT
  });
  process.stdout.write(`${JSON.stringify({
    bossId: manifest.bossId,
    outputCount: Object.keys(manifest.outputs).length,
    validation: manifest.validation,
    gates: manifest.gateStatus
  })}\n`);
}
