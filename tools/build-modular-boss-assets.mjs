import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromDirector = createRequire(new URL('../director/package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const MAX_ATLAS_SIZE = 2048;
const DEFAULT_GUTTER = 2;
const ID_PATTERN = /^[a-z][a-z0-9.-]*$/;
const ASSET_USAGE_STATUSES = new Set([
  'neutral',
  'animation',
  'attack',
  'phase2',
  'damage',
  'death',
  'future alternate',
  'removed',
  'archived'
]);
const ASSET_USAGE_CLASSIFICATIONS = new Set([
  'used',
  'future',
  'archived',
  'forbidden'
]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const isFiniteNumber = (value) => Number.isFinite(value);

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const inferAssetUsageStatus = (cell) => {
  if (ASSET_USAGE_STATUSES.has(cell.usageStatus)) return cell.usageStatus;
  if (cell.disposition !== 'runtime') return 'archived';
  if (cell.id === 'body.damaged') return 'damage';
  if (cell.id === 'body.open' || cell.id === 'exhaust.module') return 'phase2';
  if (
    cell.id === 'body.closed'
    || cell.id.endsWith('.shell')
    || cell.id.startsWith('mandible.')
    || cell.id.endsWith('.0') && cell.id.startsWith('rotary.')
  ) return 'neutral';
  if (cell.id.startsWith('rotary.')) return 'animation';
  return 'attack';
};

const classifyAssetUsageCell = (cell) => {
  if (ASSET_USAGE_CLASSIFICATIONS.has(cell.usageClassification)) {
    return cell.usageClassification;
  }
  if (cell.disposition === 'runtime') return 'used';
  if (cell.usageStatus === 'future alternate') return 'future';
  if (cell.usageStatus === 'archived' || cell.usageStatus === 'removed') return 'archived';
  return 'forbidden';
};

const normalizeUsageConsumers = (value, label) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const consumers = value.map((consumer) => {
    if (
      typeof consumer !== 'string'
      || consumer.trim() !== consumer
      || consumer.length === 0
      || /[\r\n]/.test(consumer)
    ) {
      throw new Error(`${label} entries must be non-empty single-line strings`);
    }
    return consumer;
  });
  if (new Set(consumers).size !== consumers.length) {
    throw new Error(`${label} must not contain duplicates`);
  }
  return consumers;
};

const assertObject = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
};

const assertId = (value, label) => {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`${label} must match ${ID_PATTERN}`);
  }
};

const assertUniqueIds = (items, label) => {
  const seen = new Set();
  for (const item of items) {
    assertId(item.id, `${label} id`);
    if (seen.has(item.id)) throw new Error(`Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
};

const validateRect = (rect, width, height, label) => {
  assertObject(rect, label);
  const { x, y, width: rectWidth, height: rectHeight } = rect;
  if (![x, y, rectWidth, rectHeight].every(Number.isInteger)) {
    throw new Error(`${label} must contain integer x/y/width/height`);
  }
  if (x < 0 || y < 0 || rectWidth <= 0 || rectHeight <= 0) {
    throw new Error(`${label} must be positive and in bounds`);
  }
  if (x + rectWidth > width || y + rectHeight > height) {
    throw new Error(`${label} exceeds source bounds ${width}x${height}`);
  }
  return rect;
};

const deriveGridRect = (source, cell, label) => {
  if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) {
    throw new Error(`${label}.cell must be [row, column]`);
  }
  const [row, column] = cell;
  const { rows, columns } = source.grid;
  if (row < 0 || row >= rows || column < 0 || column >= columns) {
    throw new Error(`${label}.cell is outside the ${columns}x${rows} grid`);
  }
  const x = Math.round((column * source.image.width) / columns);
  const y = Math.round((row * source.image.height) / rows);
  const right = Math.round(((column + 1) * source.image.width) / columns);
  const bottom = Math.round(((row + 1) * source.image.height) / rows);
  return { x, y, width: right - x, height: bottom - y };
};

const cropPng = (source, rect) => {
  const output = new PNG({ width: rect.width, height: rect.height, colorType: 6 });
  PNG.bitblt(source, output, rect.x, rect.y, rect.width, rect.height, 0, 0);
  return output;
};

const isMagentaChroma = (red, green, blue) => (
  red >= 70
  && blue >= 70
  && Math.min(red, blue) - green >= 28
  && Math.abs(red - blue) <= 128
);

const sanitizeBinaryAlpha = (image) => {
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const alpha = image.data[offset + 3];
    if (alpha <= 8 || isMagentaChroma(red, green, blue)) {
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 0;
    } else {
      image.data[offset + 3] = 255;
    }
  }
};

const retainLargestComponent = (image) => {
  const pixelCount = image.width * image.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let largest = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || image.data[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    const component = [];
    visited[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      component.push(pixel);
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
          if (xOffset === 0 && yOffset === 0) continue;
          const nextX = x + xOffset;
          const nextY = y + yOffset;
          if (nextX < 0 || nextY < 0 || nextX >= image.width || nextY >= image.height) continue;
          const next = nextY * image.width + nextX;
          if (visited[next] || image.data[next * 4 + 3] === 0) continue;
          visited[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const keep = new Uint8Array(pixelCount);
  for (const pixel of largest) keep[pixel] = 1;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (keep[pixel]) continue;
    const offset = pixel * 4;
    image.data[offset] = 0;
    image.data[offset + 1] = 0;
    image.data[offset + 2] = 0;
    image.data[offset + 3] = 0;
  }
  return largest.length;
};

const visibleBounds = (image, label) => {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let visiblePixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
      visiblePixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (visiblePixels < 100) throw new Error(`${label} contains only ${visiblePixels} visible pixels`);
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    visiblePixels
  };
};

const paste = (source, target, targetX, targetY) => {
  const sourceX = Math.max(0, -targetX);
  const sourceY = Math.max(0, -targetY);
  const x = Math.max(0, targetX);
  const y = Math.max(0, targetY);
  const width = Math.min(source.width - sourceX, target.width - x);
  const height = Math.min(source.height - sourceY, target.height - y);
  if (width > 0 && height > 0) PNG.bitblt(source, target, sourceX, sourceY, width, height, x, y);
};

const resolveRegistrationPoint = (cell, rect) => {
  if (!cell.registration) return { x: rect.width / 2, y: rect.height / 2 };
  const { x, y, unit = 'pixels' } = cell.registration;
  if (![x, y].every(isFiniteNumber)) throw new Error(`${cell.id}.registration must be finite`);
  if (unit === 'normalized') return { x: x * rect.width, y: y * rect.height };
  if (unit !== 'pixels') throw new Error(`${cell.id}.registration.unit is unsupported`);
  return { x, y };
};

const prepareFrames = (layout, sources) => {
  const runtimeCells = layout.cells.filter((cell) => cell.disposition === 'runtime');
  const frameIds = assertUniqueIds(runtimeCells, 'runtime frame');
  const forbiddenIds = new Set(layout.cells
    .filter((cell) => cell.disposition === 'forbidden')
    .map((cell) => cell.id));
  for (const frameId of frameIds) {
    if (forbiddenIds.has(frameId)) throw new Error(`${frameId} is both runtime and forbidden`);
  }

  const frames = new Map();
  for (const cell of runtimeCells) {
    const source = sources.get(cell.sourceId);
    if (!source) throw new Error(`${cell.id} references missing source ${cell.sourceId}`);
    const rect = validateRect(
      cell.rect ?? deriveGridRect(source, cell.cell, cell.id),
      source.image.width,
      source.image.height,
      `${cell.id}.rect`
    );
    const image = cropPng(source.image, rect);
    sanitizeBinaryAlpha(image);
    const componentPixels = cell.isolation === 'largest-component'
      ? retainLargestComponent(image)
      : undefined;
    const bounds = visibleBounds(image, cell.id);
    frames.set(cell.id, {
      id: cell.id,
      cell,
      rect,
      rawImage: image,
      bounds,
      componentPixels,
      registration: resolveRegistrationPoint(cell, rect)
    });
  }

  const grouped = new Set();
  for (const group of layout.registrationGroups ?? []) {
    assertId(group.id, 'registration group id');
    if (!Array.isArray(group.frames) || group.frames.length < 2) {
      throw new Error(`${group.id} must contain at least two frames`);
    }
    const groupFrames = group.frames.map((frameId) => {
      const frame = frames.get(frameId);
      if (!frame) throw new Error(`${group.id} references missing runtime frame ${frameId}`);
      if (grouped.has(frameId)) throw new Error(`${frameId} belongs to multiple registration groups`);
      grouped.add(frameId);
      return frame;
    });
    const padding = Number.isInteger(group.padding) ? group.padding : 2;
    const union = groupFrames.reduce((result, frame) => ({
      left: Math.min(result.left, frame.bounds.x - frame.registration.x - padding),
      top: Math.min(result.top, frame.bounds.y - frame.registration.y - padding),
      right: Math.max(
        result.right,
        frame.bounds.x + frame.bounds.width - frame.registration.x + padding
      ),
      bottom: Math.max(
        result.bottom,
        frame.bounds.y + frame.bounds.height - frame.registration.y + padding
      )
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const width = Math.ceil(union.right - union.left);
    const height = Math.ceil(union.bottom - union.top);
    for (const frame of groupFrames) {
      const image = new PNG({ width, height, colorType: 6 });
      paste(
        frame.rawImage,
        image,
        Math.round(-frame.registration.x - union.left),
        Math.round(-frame.registration.y - union.top)
      );
      frame.image = image;
      frame.outputRegistration = { x: -union.left, y: -union.top };
      frame.registrationGroup = group.id;
    }
  }

  for (const frame of frames.values()) {
    if (frame.image) continue;
    const padding = Number.isInteger(frame.cell.padding) ? frame.cell.padding : 2;
    const left = Math.max(0, frame.bounds.x - padding);
    const top = Math.max(0, frame.bounds.y - padding);
    const right = Math.min(frame.rawImage.width, frame.bounds.x + frame.bounds.width + padding);
    const bottom = Math.min(frame.rawImage.height, frame.bounds.y + frame.bounds.height + padding);
    frame.image = cropPng(frame.rawImage, {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    });
    frame.outputRegistration = {
      x: frame.registration.x - left,
      y: frame.registration.y - top
    };
  }
  return { frames, forbiddenIds };
};

const packFrames = (frames, gutter = DEFAULT_GUTTER) => {
  const ordered = [...frames.values()].sort((left, right) => (
    right.image.height - left.image.height
    || right.image.width - left.image.width
    || left.id.localeCompare(right.id)
  ));
  let x = gutter;
  let y = gutter;
  let shelfHeight = 0;
  let usedWidth = 0;
  const placements = new Map();
  for (const frame of ordered) {
    if (frame.image.width + gutter * 2 > MAX_ATLAS_SIZE) {
      throw new Error(`${frame.id} is wider than the ${MAX_ATLAS_SIZE}px atlas limit`);
    }
    if (x + frame.image.width + gutter > MAX_ATLAS_SIZE) {
      x = gutter;
      y += shelfHeight + gutter;
      shelfHeight = 0;
    }
    if (y + frame.image.height + gutter > MAX_ATLAS_SIZE) {
      throw new Error(`Frames do not fit inside a ${MAX_ATLAS_SIZE}x${MAX_ATLAS_SIZE} atlas`);
    }
    placements.set(frame.id, { x, y, width: frame.image.width, height: frame.image.height });
    x += frame.image.width + gutter;
    shelfHeight = Math.max(shelfHeight, frame.image.height);
    usedWidth = Math.max(usedWidth, x);
  }
  const usedHeight = y + shelfHeight + gutter;
  const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));
  const width = Math.min(MAX_ATLAS_SIZE, Math.max(256, nextPowerOfTwo(usedWidth)));
  const height = Math.min(MAX_ATLAS_SIZE, Math.max(256, nextPowerOfTwo(usedHeight)));
  const atlas = new PNG({ width, height, colorType: 6 });
  for (const frame of ordered) {
    const placement = placements.get(frame.id);
    PNG.bitblt(
      frame.image,
      atlas,
      0,
      0,
      frame.image.width,
      frame.image.height,
      placement.x,
      placement.y
    );
  }
  return { atlas, placements };
};

export const validateRigSource = (rig, frameIds, forbiddenIds) => {
  assertObject(rig, 'rig source');
  assertId(rig.bossId, 'rig bossId');
  if (rig.format !== 'modular-hierarchy-v1') {
    throw new Error('rig format must be modular-hierarchy-v1');
  }
  if (!isFiniteNumber(rig.canvas?.width) || !isFiniteNumber(rig.canvas?.height)) {
    throw new Error('rig canvas width/height must be finite');
  }
  const partIds = assertUniqueIds(rig.parts ?? [], 'rig part');
  const partById = new Map(rig.parts.map((part) => [part.id, part]));
  for (const part of rig.parts) {
    if (part.parentId !== null && !partIds.has(part.parentId)) {
      throw new Error(`${part.id} has missing parent ${part.parentId}`);
    }
    if (part.parentId === part.id) throw new Error(`${part.id} cannot parent itself`);
    if (part.frameId !== null && part.frameId !== undefined) {
      if (!frameIds.has(part.frameId)) throw new Error(`${part.id} references missing frame ${part.frameId}`);
      if (forbiddenIds.has(part.frameId)) throw new Error(`${part.id} references forbidden frame ${part.frameId}`);
    }
    const transform = part.transform ?? {};
    for (const [key, fallback] of Object.entries({
      x: 0,
      y: 0,
      rotationDegrees: 0,
      scaleX: 1,
      scaleY: 1
    })) {
      if (!isFiniteNumber(transform[key] ?? fallback)) {
        throw new Error(`${part.id}.transform.${key} must be finite`);
      }
    }
    if (part.frameId) {
      if (![part.anchor?.x, part.anchor?.y].every(isFiniteNumber)) {
        throw new Error(`${part.id}.anchor must be finite`);
      }
      if (part.anchor.x < 0 || part.anchor.x > 1 || part.anchor.y < 0 || part.anchor.y > 1) {
        throw new Error(`${part.id}.anchor must be normalized`);
      }
    }
    if (!isFiniteNumber(part.layer)) throw new Error(`${part.id}.layer must be finite`);
  }

  const visitState = new Map();
  const visit = (partId, trail = []) => {
    const state = visitState.get(partId);
    if (state === 'done') return;
    if (state === 'visiting') throw new Error(`Rig parent cycle: ${[...trail, partId].join(' -> ')}`);
    visitState.set(partId, 'visiting');
    const parentId = partById.get(partId).parentId;
    if (parentId !== null) visit(parentId, [...trail, partId]);
    visitState.set(partId, 'done');
  };
  for (const partId of partIds) visit(partId);

  const socketNames = new Set();
  for (const socket of rig.sockets ?? []) {
    assertId(socket.id, 'socket id');
    if (socketNames.has(socket.id)) throw new Error(`Duplicate socket id: ${socket.id}`);
    socketNames.add(socket.id);
    if (!partIds.has(socket.partId)) throw new Error(`${socket.id} references missing part ${socket.partId}`);
    if (![socket.x, socket.y].every(isFiniteNumber)) {
      throw new Error(`${socket.id} x/y must be finite`);
    }
  }

  const animationIds = assertUniqueIds(rig.animations ?? [], 'animation');
  for (const animation of rig.animations ?? []) {
    if (!partIds.has(animation.partId)) {
      throw new Error(`${animation.id} references missing part ${animation.partId}`);
    }
    if (!Array.isArray(animation.frameIds) || animation.frameIds.length === 0) {
      throw new Error(`${animation.id} needs at least one frame`);
    }
    for (const frameId of animation.frameIds) {
      if (!frameIds.has(frameId)) throw new Error(`${animation.id} references missing frame ${frameId}`);
      if (forbiddenIds.has(frameId)) throw new Error(`${animation.id} references forbidden frame ${frameId}`);
    }
    if (!isFiniteNumber(animation.fps) || animation.fps <= 0 || animation.fps > 60) {
      throw new Error(`${animation.id}.fps must be between 0 and 60`);
    }
  }
  return { partIds, socketNames, animationIds };
};

const multiplyMatrices = (left, right) => ({
  a: left.a * right.a + left.c * right.b,
  b: left.b * right.a + left.d * right.b,
  c: left.a * right.c + left.c * right.d,
  d: left.b * right.c + left.d * right.d,
  tx: left.a * right.tx + left.c * right.ty + left.tx,
  ty: left.b * right.tx + left.d * right.ty + left.ty
});

const matrixForTransform = (transform = {}) => {
  const angle = ((transform.rotationDegrees ?? 0) * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const scaleX = transform.scaleX ?? 1;
  const scaleY = transform.scaleY ?? 1;
  return {
    a: cosine * scaleX,
    b: sine * scaleX,
    c: -sine * scaleY,
    d: cosine * scaleY,
    tx: transform.x ?? 0,
    ty: transform.y ?? 0
  };
};

const invertMatrix = (matrix) => {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-8) throw new Error('Rig transform is not invertible');
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant
  };
};

const transformPoint = (matrix, x, y) => ({
  x: matrix.a * x + matrix.c * y + matrix.tx,
  y: matrix.b * x + matrix.d * y + matrix.ty
});

const drawTransformed = (source, target, matrix, anchor) => {
  const anchorX = source.width * anchor.x;
  const anchorY = source.height * anchor.y;
  const corners = [
    transformPoint(matrix, -anchorX, -anchorY),
    transformPoint(matrix, source.width - anchorX, -anchorY),
    transformPoint(matrix, -anchorX, source.height - anchorY),
    transformPoint(matrix, source.width - anchorX, source.height - anchorY)
  ];
  const left = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y))));
  const right = Math.min(target.width, Math.ceil(Math.max(...corners.map((point) => point.x))));
  const bottom = Math.min(target.height, Math.ceil(Math.max(...corners.map((point) => point.y))));
  const inverse = invertMatrix(matrix);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const local = transformPoint(inverse, x + 0.5, y + 0.5);
      const sourceX = Math.floor(local.x + anchorX);
      const sourceY = Math.floor(local.y + anchorY);
      if (sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height) continue;
      const sourceOffset = (sourceY * source.width + sourceX) * 4;
      if (source.data[sourceOffset + 3] === 0) continue;
      const targetOffset = (y * target.width + x) * 4;
      target.data[targetOffset] = source.data[sourceOffset];
      target.data[targetOffset + 1] = source.data[sourceOffset + 1];
      target.data[targetOffset + 2] = source.data[sourceOffset + 2];
      target.data[targetOffset + 3] = 255;
    }
  }
};

const composeNeutralPreview = (rig, frames) => {
  const canvas = new PNG({
    width: Math.round(rig.canvas.width),
    height: Math.round(rig.canvas.height),
    colorType: 6
  });
  const byId = new Map(rig.parts.map((part) => [part.id, part]));
  const worldMatrices = new Map();
  const resolveMatrix = (part) => {
    if (worldMatrices.has(part.id)) return worldMatrices.get(part.id);
    const local = matrixForTransform(part.transform);
    const world = part.parentId === null
      ? local
      : multiplyMatrices(resolveMatrix(byId.get(part.parentId)), local);
    worldMatrices.set(part.id, world);
    return world;
  };
  const visibleParts = rig.parts
    .filter((part) => part.frameId && part.neutralVisible !== false)
    .sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
  for (const part of visibleParts) {
    drawTransformed(frames.get(part.frameId).image, canvas, resolveMatrix(part), part.anchor);
  }
  return canvas;
};

const assertBinaryAlpha = (image, label) => {
  for (let offset = 3; offset < image.data.length; offset += 4) {
    if (image.data[offset] !== 0 && image.data[offset] !== 255) {
      throw new Error(`${label} contains non-binary alpha at pixel ${Math.floor(offset / 4)}`);
    }
  }
};

export const buildModularBossAssets = async ({ layoutPath, rigSourcePath, outputDirectory }) => {
  const resolvedLayoutPath = path.resolve(layoutPath);
  const resolvedRigPath = path.resolve(rigSourcePath);
  const resolvedOutput = path.resolve(outputDirectory);
  const [layoutBuffer, rigBuffer] = await Promise.all([
    readFile(resolvedLayoutPath),
    readFile(resolvedRigPath)
  ]);
  const layout = JSON.parse(layoutBuffer.toString('utf8'));
  const rigSource = JSON.parse(rigBuffer.toString('utf8'));
  assertObject(layout, 'source layout');
  if (layout.schemaVersion !== 1) throw new Error('source layout schemaVersion must be 1');
  assertId(layout.bossId, 'layout bossId');
  if (rigSource.bossId !== layout.bossId) throw new Error('layout and rig bossId must match');
  assertUniqueIds(layout.sources ?? [], 'source');
  assertUniqueIds(layout.cells ?? [], 'source cell');

  const layoutDirectory = path.dirname(resolvedLayoutPath);
  const sources = new Map();
  for (const descriptor of layout.sources) {
    if (!Number.isInteger(descriptor.grid?.columns) || !Number.isInteger(descriptor.grid?.rows)) {
      throw new Error(`${descriptor.id}.grid must define integer columns and rows`);
    }
    const sourcePath = path.resolve(layoutDirectory, descriptor.file);
    const buffer = await readFile(sourcePath);
    const image = PNG.sync.read(buffer);
    sources.set(descriptor.id, {
      ...descriptor,
      sourcePath,
      buffer,
      image,
      sha256: sha256(buffer)
    });
  }
  for (const cell of layout.cells ?? []) {
    if (!sources.has(cell.sourceId)) throw new Error(`${cell.id} references missing source ${cell.sourceId}`);
    if (!['runtime', 'forbidden', 'empty'].includes(cell.disposition)) {
      throw new Error(`${cell.id} has unsupported disposition ${cell.disposition}`);
    }
    if (cell.usageStatus !== undefined && !ASSET_USAGE_STATUSES.has(cell.usageStatus)) {
      throw new Error(`${cell.id} has unsupported usageStatus ${cell.usageStatus}`);
    }
    if (
      cell.usageClassification !== undefined
      && !ASSET_USAGE_CLASSIFICATIONS.has(cell.usageClassification)
    ) {
      throw new Error(
        `${cell.id} has unsupported usageClassification ${cell.usageClassification}`
      );
    }
    const classification = classifyAssetUsageCell(cell);
    if (cell.disposition === 'runtime' && classification !== 'used') {
      throw new Error(`${cell.id} is runtime and must be classified used`);
    }
    if (cell.disposition !== 'runtime' && classification === 'used') {
      throw new Error(`${cell.id} is non-runtime and cannot be classified used`);
    }
    normalizeUsageConsumers(cell.usedBy, `${cell.id}.usedBy`);
    if (cell.cell !== undefined) {
      deriveGridRect(sources.get(cell.sourceId), cell.cell, cell.id);
    }
  }
  for (const group of layout.registrationGroups ?? []) {
    normalizeUsageConsumers(group.usedBy, `${group.id}.usedBy`);
  }

  const { frames, forbiddenIds } = prepareFrames(layout, sources);
  const frameIds = new Set(frames.keys());
  validateRigSource(rigSource, frameIds, forbiddenIds);
  const { atlas, placements } = packFrames(frames, layout.atlas?.gutter ?? DEFAULT_GUTTER);
  assertBinaryAlpha(atlas, 'atlas');
  const neutral = composeNeutralPreview(rigSource, frames);
  assertBinaryAlpha(neutral, 'neutral preview');

  await mkdir(path.join(resolvedOutput, 'components'), { recursive: true });
  const componentRecords = [];
  for (const frame of [...frames.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    assertBinaryAlpha(frame.image, frame.id);
    const buffer = PNG.sync.write(frame.image, { colorType: 6 });
    const file = `components/${frame.id}.png`;
    await writeFile(path.join(resolvedOutput, file), buffer);
    componentRecords.push({
      frameId: frame.id,
      file,
      sha256: sha256(buffer),
      width: frame.image.width,
      height: frame.image.height,
      visiblePixels: visibleBounds(frame.image, frame.id).visiblePixels,
      source: {
        sourceId: frame.cell.sourceId,
        cell: frame.cell.cell,
        rect: frame.rect,
        sourceSha256: sources.get(frame.cell.sourceId).sha256
      },
      registrationGroup: frame.registrationGroup ?? null
    });
  }

  const atlasFile = `${layout.bossId}-atlas.png`;
  const atlasBuffer = PNG.sync.write(atlas, { colorType: 6 });
  await writeFile(path.join(resolvedOutput, atlasFile), atlasBuffer);
  const atlasMetadata = {
    schemaVersion: 1,
    bossId: layout.bossId,
    format: 'scicon-modular-atlas-v1',
    image: {
      file: atlasFile,
      sha256: sha256(atlasBuffer),
      width: atlas.width,
      height: atlas.height,
      binaryAlpha: true
    },
    frames: Object.fromEntries([...frames.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((frame) => {
        const placement = placements.get(frame.id);
        return [frame.id, {
          ...placement,
          anchor: {
            x: frame.outputRegistration.x / frame.image.width,
            y: frame.outputRegistration.y / frame.image.height
          },
          registrationGroup: frame.registrationGroup ?? null,
          componentSha256: componentRecords.find((record) => record.frameId === frame.id).sha256
        }];
      })),
    provenance: {
      sourceLayoutSha256: sha256(layoutBuffer),
      sources: Object.fromEntries([...sources.values()].map((source) => [source.id, {
        file: source.file,
        sha256: source.sha256,
        width: source.image.width,
        height: source.image.height,
        grid: source.grid
      }]))
    }
  };
  const atlasMetadataFile = `${layout.bossId}-atlas.json`;
  const atlasMetadataBuffer = Buffer.from(stableJson(atlasMetadata));
  await writeFile(path.join(resolvedOutput, atlasMetadataFile), atlasMetadataBuffer);

  const rig = {
    schemaVersion: 1,
    format: 'modular-hierarchy-v1',
    bossId: layout.bossId,
    canvas: rigSource.canvas,
    atlas: {
      file: atlasFile,
      metadataFile: atlasMetadataFile,
      sha256: sha256(atlasBuffer),
      width: atlas.width,
      height: atlas.height
    },
    parts: rigSource.parts,
    sockets: rigSource.sockets,
    animations: rigSource.animations,
    states: rigSource.states,
    provenance: {
      rigSourceSha256: sha256(rigBuffer),
      sourceLayoutSha256: sha256(layoutBuffer)
    }
  };
  const rigFile = `${layout.bossId}.rig.json`;
  const rigBufferOut = Buffer.from(stableJson(rig));
  await writeFile(path.join(resolvedOutput, rigFile), rigBufferOut);

  const neutralFile = `${layout.bossId}-neutral.png`;
  const neutralBuffer = PNG.sync.write(neutral, { colorType: 6 });
  await writeFile(path.join(resolvedOutput, neutralFile), neutralBuffer);

  const usedBy = new Map([...frames.keys()].map((frameId) => [frameId, new Set()]));
  const addConsumer = (frameId, consumer) => {
    if (usedBy.has(frameId)) usedBy.get(frameId).add(consumer);
  };
  for (const part of rigSource.parts ?? []) {
    if (part.frameId && usedBy.has(part.frameId)) {
      addConsumer(part.frameId, `rig-part:${part.id}`);
    }
  }
  for (const animation of rigSource.animations ?? []) {
    for (const frameId of animation.frameIds ?? []) {
      addConsumer(frameId, `animation:${animation.id}`);
    }
  }
  for (const group of layout.registrationGroups ?? []) {
    for (const consumer of normalizeUsageConsumers(group.usedBy, `${group.id}.usedBy`)) {
      for (const frameId of group.frames ?? []) addConsumer(frameId, consumer);
    }
  }
  for (const cell of layout.cells ?? []) {
    for (const consumer of normalizeUsageConsumers(cell.usedBy, `${cell.id}.usedBy`)) {
      addConsumer(cell.id, consumer);
    }
  }

  const sourceCellsByKey = new Map();
  for (const cell of layout.cells ?? []) {
    if (cell.cell === undefined) continue;
    const [row, column] = cell.cell;
    const key = `${cell.sourceId}:${row}:${column}`;
    const records = sourceCellsByKey.get(key) ?? [];
    records.push(cell);
    sourceCellsByKey.set(key, records);
  }
  const sourceCells = [];
  const unclassifiedSourceCells = [];
  for (const source of [...sources.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    for (let row = 0; row < source.grid.rows; row += 1) {
      for (let column = 0; column < source.grid.columns; column += 1) {
        const key = `${source.id}:${row}:${column}`;
        const records = sourceCellsByKey.get(key) ?? [];
        const classifications = new Set(records.map(classifyAssetUsageCell));
        if (classifications.size > 1) {
          throw new Error(`${key} has conflicting asset-usage classifications`);
        }
        const classification = classifications.values().next().value ?? null;
        if (classification === null) unclassifiedSourceCells.push(key);
        const frameIds = records.map((cell) => cell.id).sort();
        sourceCells.push({
          sourceId: source.id,
          cell: [row, column],
          rect: deriveGridRect(source, [row, column], key),
          classification,
          frameIds,
          dispositions: [...new Set(records.map((cell) => cell.disposition))].sort(),
          statuses: [...new Set(records.map(inferAssetUsageStatus))].sort(),
          usedBy: [...new Set(frameIds.flatMap((frameId) => [
            ...(usedBy.get(frameId) ?? [])
          ]))].sort(),
          reasons: [...new Set(records.flatMap((cell) => (
            typeof cell.reason === 'string' ? [cell.reason] : []
          )))].sort()
        });
      }
    }
  }

  const usageFrames = layout.cells.map((cell) => ({
    frameId: cell.id,
    disposition: cell.disposition,
    classification: classifyAssetUsageCell(cell),
    status: inferAssetUsageStatus(cell),
    sourceId: cell.sourceId,
    sourceCell: cell.cell ?? null,
    sourceRect: cell.rect ?? null,
    usedBy: [...(usedBy.get(cell.id) ?? [])].sort(),
    reason: cell.reason ?? null
  }));
  const unreferencedUsedFrames = usageFrames
    .filter((frame) => frame.classification === 'used' && frame.usedBy.length === 0)
    .map((frame) => frame.frameId);
  if (
    layout.assetUsage?.requireCompleteSourceGrid === true
    && unclassifiedSourceCells.length > 0
  ) {
    throw new Error(
      `Unclassified source cells: ${unclassifiedSourceCells.join(', ')}`
    );
  }
  if (
    layout.assetUsage?.requireConsumerForUsed === true
    && unreferencedUsedFrames.length > 0
  ) {
    throw new Error(
      `Used frames without consumers: ${unreferencedUsedFrames.join(', ')}`
    );
  }

  const countClassifications = (items) => Object.fromEntries(
    [...ASSET_USAGE_CLASSIFICATIONS].map((classification) => [
      classification,
      items.filter((item) => item.classification === classification).length
    ])
  );
  const assetUsage = {
    schemaVersion: 1,
    bossId: layout.bossId,
    format: 'scicon-boss-asset-usage-v1',
    classificationCounts: {
      frames: countClassifications(usageFrames),
      sourceCells: countClassifications(sourceCells)
    },
    sourceCoverage: {
      complete: unclassifiedSourceCells.length === 0,
      totalCells: sourceCells.length,
      classifiedCells: sourceCells.length - unclassifiedSourceCells.length,
      unclassifiedCells: unclassifiedSourceCells
    },
    validation: {
      allUsedFramesHaveConsumers: unreferencedUsedFrames.length === 0,
      unreferencedUsedFrames
    },
    sourceCells,
    frames: usageFrames
  };
  const assetUsageFile = `${layout.bossId}.asset-usage.json`;
  const assetUsageBuffer = Buffer.from(stableJson(assetUsage));
  await writeFile(path.join(resolvedOutput, assetUsageFile), assetUsageBuffer);

  const manifest = {
    schemaVersion: 1,
    bossId: layout.bossId,
    format: 'scicon-modular-boss-package-v1',
    inputs: {
      sourceLayout: {
        file: path.basename(resolvedLayoutPath),
        sha256: sha256(layoutBuffer)
      },
      rigSource: {
        file: path.basename(resolvedRigPath),
        sha256: sha256(rigBuffer)
      },
      sources: atlasMetadata.provenance.sources
    },
    outputs: {
      atlas: atlasMetadata.image,
      atlasMetadata: {
        file: atlasMetadataFile,
        sha256: sha256(atlasMetadataBuffer)
      },
      rig: {
        file: rigFile,
        sha256: sha256(rigBufferOut)
      },
      neutralPreview: {
        file: neutralFile,
        sha256: sha256(neutralBuffer),
        width: neutral.width,
        height: neutral.height,
        binaryAlpha: true
      },
      assetUsage: {
        file: assetUsageFile,
        sha256: sha256(assetUsageBuffer),
        frameCount: assetUsage.frames.length,
        sourceCellCount: assetUsage.sourceCoverage.totalCells,
        complete: (
          assetUsage.sourceCoverage.complete
          && assetUsage.validation.allUsedFramesHaveConsumers
        )
      },
      components: componentRecords
    },
    validation: {
      hierarchy: 'valid',
      atlasWithin2048: atlas.width <= MAX_ATLAS_SIZE && atlas.height <= MAX_ATLAS_SIZE,
      binaryAlpha: true,
      runtimeFrameCount: frames.size,
      forbiddenRuntimeFrames: [],
      assetUsageComplete: (
        assetUsage.sourceCoverage.complete
        && assetUsage.validation.allUsedFramesHaveConsumers
      )
    }
  };
  const manifestFile = `${layout.bossId}.asset-manifest.json`;
  const manifestBuffer = Buffer.from(stableJson(manifest));
  await writeFile(path.join(resolvedOutput, manifestFile), manifestBuffer);
  return manifest;
};

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [layoutArg, rigArg, outputArg] = process.argv.slice(2);
  if (!layoutArg || !rigArg || !outputArg) {
    throw new Error(
      'Usage: node tools/build-modular-boss-assets.mjs <source-layout.json> <rig.source.json> <output-directory>'
    );
  }
  const manifest = await buildModularBossAssets({
    layoutPath: layoutArg,
    rigSourcePath: rigArg,
    outputDirectory: outputArg
  });
  process.stdout.write(`${JSON.stringify({
    bossId: manifest.bossId,
    atlas: manifest.outputs.atlas,
    rig: manifest.outputs.rig,
    neutralPreview: manifest.outputs.neutralPreview,
    runtimeFrameCount: manifest.validation.runtimeFrameCount
  })}\n`);
}
