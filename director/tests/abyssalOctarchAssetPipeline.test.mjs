import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildAbyssalOctarchAssets } from '../../tools/build-abyssal-octarch-assets.mjs';

const requireFromDirector = createRequire(new URL('../package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');

const assetRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../director-data/prototype-assets/abyssal-octarch'
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (root, file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const readPng = async (root, file) => PNG.sync.read(await readFile(path.join(root, file)));

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

const renderAlphaMask = ({ image, matrix, anchor, width, height }) => {
  const output = new Uint8Array(width * height);
  const anchorX = image.width * anchor.x;
  const anchorY = image.height * anchor.y;
  const corners = [
    transformPoint(matrix, -anchorX, -anchorY),
    transformPoint(matrix, image.width - anchorX, -anchorY),
    transformPoint(matrix, -anchorX, image.height - anchorY),
    transformPoint(matrix, image.width - anchorX, image.height - anchorY)
  ];
  const left = Math.max(0, Math.floor(Math.min(...corners.map(({ x }) => x))));
  const top = Math.max(0, Math.floor(Math.min(...corners.map(({ y }) => y))));
  const right = Math.min(width, Math.ceil(Math.max(...corners.map(({ x }) => x))));
  const bottom = Math.min(height, Math.ceil(Math.max(...corners.map(({ y }) => y))));
  const inverse = invertMatrix(matrix);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const local = transformPoint(inverse, x + 0.5, y + 0.5);
      const sourceX = Math.floor(local.x + anchorX);
      const sourceY = Math.floor(local.y + anchorY);
      if (
        sourceX < 0
        || sourceY < 0
        || sourceX >= image.width
        || sourceY >= image.height
      ) continue;
      if (image.data[(sourceY * image.width + sourceX) * 4 + 3] > 0) {
        output[y * width + x] = 1;
      }
    }
  }
  return output;
};

const alphaMask = (image) => {
  const output = new Uint8Array(image.width * image.height);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = image.data[index * 4 + 3] > 0 ? 1 : 0;
  }
  return output;
};

const countConnectedComponents = (mask, width, height) => {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let count = 0;
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    count += 1;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      for (let nextY = Math.max(0, y - 1); nextY <= Math.min(height - 1, y + 1); nextY += 1) {
        for (let nextX = Math.max(0, x - 1); nextX <= Math.min(width - 1, x + 1); nextX += 1) {
          const next = nextY * width + nextX;
          if (!mask[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  return count;
};

const visibleBounds = (mask, width, height) => {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2
  };
};

test('Abyssal Octarch assets rebuild deterministically without source-grid clipping', async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'scicon-abyssal-octarch-'));
  context.after(async () => rm(temporaryRoot, { recursive: true, force: true }));

  const rebuilt = await buildAbyssalOctarchAssets({ sourceRoot: assetRoot, outputRoot: temporaryRoot });
  const checkedIn = await readJson(assetRoot, 'abyssal-octarch.build-manifest.json');
  assert.deepEqual(rebuilt.outputs, checkedIn.outputs);
  assert.deepEqual(rebuilt.validation, checkedIn.validation);
  assert.equal(rebuilt.validation.extractedTentacleSubjects, 12);
  assert.equal(rebuilt.validation.equalTentacleCanvases, true);
  assert.equal(rebuilt.validation.sourceGridClippingPrevented, true);
  assert.equal(rebuilt.validation.processedSheetMargins, 'pass');
  assert.equal(rebuilt.validation.atlasTransparentGutters, 'pass');
  assert.equal(rebuilt.validation.structuralPaletteSize <= 32, true);
  assert.equal(rebuilt.validation.vfxPaletteSize <= 48, true);
  assert.equal(rebuilt.gateStatus.gate1ReferenceLock, 'pass');
  assert.match(rebuilt.gateStatus.gate2NeutralPoseMatch, /^blocked-/);

  const extraction = await readJson(temporaryRoot, 'abyssal-octarch.source-extraction.json');
  assert.equal(extraction.frames.length, 12);
  assert.equal(extraction.uniformTentacleScale, 0.5);
  assert.deepEqual(extraction.targetTentacleCell.socket, { x: 244, y: 93 });
  for (const frame of extraction.frames) {
    assert.equal(frame.outputBounds.x >= 6, true);
    assert.equal(frame.outputBounds.y >= 6, true);
    assert.equal(frame.outputBounds.x + frame.outputBounds.width <= 250, true);
    assert.equal(frame.outputBounds.y + frame.outputBounds.height <= 154, true);
  }

  const atlas = await readJson(temporaryRoot, 'abyssal-octarch-atlas.json');
  assert.equal(Object.keys(atlas.frames).length, 32);
  assert.equal(atlas.image.binaryAlpha, true);
  assert.equal(atlas.image.width <= 2048, true);
  assert.equal(atlas.image.height <= 2048, true);

  const rig = await readJson(temporaryRoot, 'abyssal-octarch.rig.json');
  const tentacleParts = rig.parts.filter((part) => /^tentacle\.(port|starboard)\.(upper|middle-upper|middle-lower|lower)$/.test(part.id));
  assert.equal(tentacleParts.length, 8);
  assert.equal(tentacleParts.filter((part) => part.id.includes('.port.')).every((part) => part.transform.scaleX > 0), true);
  assert.equal(tentacleParts.filter((part) => part.id.includes('.starboard.')).every((part) => part.transform.scaleX < 0), true);
  assert.equal(rig.referenceComparison.status, 'blocked-pending-boss-sandbox-overlay');

  const partById = new Map(rig.parts.map((part) => [part.id, part]));
  const worldByPart = new Map();
  const resolveWorld = (part) => {
    if (worldByPart.has(part.id)) return worldByPart.get(part.id);
    const local = matrixForTransform(part.transform);
    const world = part.parentId === null
      ? local
      : multiplyMatrices(resolveWorld(partById.get(part.parentId)), local);
    worldByPart.set(part.id, world);
    return world;
  };
  const structuralMasks = new Map();
  for (const part of [partById.get('body'), ...tentacleParts]) {
    const image = await readPng(temporaryRoot, path.join('components', `${part.frameId}.png`));
    structuralMasks.set(part.id, renderAlphaMask({
      image,
      matrix: resolveWorld(part),
      anchor: part.anchor,
      width: rig.canvas.width,
      height: rig.canvas.height
    }));
  }
  const bodyMask = structuralMasks.get('body');
  for (const part of tentacleParts) {
    const mount = partById.get(part.parentId);
    const limbMask = structuralMasks.get(part.id);
    let overlapPixels = 0;
    for (let index = 0; index < bodyMask.length; index += 1) {
      if (bodyMask[index] && limbMask[index]) overlapPixels += 1;
    }
    assert.ok(
      overlapPixels >= mount.requiredOverlapPx,
      `${part.id} must overlap the central body by at least ${mount.requiredOverlapPx}px; found ${overlapPixels}px`
    );
  }

  const liveNeutralMasks = [bodyMask];
  for (const part of tentacleParts) {
    const index = Number(/middle-upper/.test(part.id)
      ? 1
      : /middle-lower/.test(part.id)
        ? 2
        : /\.lower$/.test(part.id)
          ? 3
          : 0);
    const liveFrameId = [
      'tentacle.sweep.neutral',
      'tentacle.slam.hanging',
      'tentacle.constrict.loose',
      'tentacle.grasp.open'
    ][index];
    const liveImage = await readPng(
      temporaryRoot,
      path.join('components', `${liveFrameId}.png`)
    );
    const liveMask = renderAlphaMask({
      image: liveImage,
      matrix: resolveWorld(part),
      anchor: atlas.frames[liveFrameId].anchor,
      width: rig.canvas.width,
      height: rig.canvas.height
    });
    liveNeutralMasks.push(liveMask);
    let liveOverlapPixels = 0;
    for (let pixel = 0; pixel < bodyMask.length; pixel += 1) {
      if (bodyMask[pixel] && liveMask[pixel]) liveOverlapPixels += 1;
    }
    assert.ok(
      liveOverlapPixels >= partById.get(part.parentId).requiredOverlapPx,
      `${part.id}/${liveFrameId} runtime neutral must remain mechanically seated; found ${liveOverlapPixels}px overlap`
    );
  }
  const liveNeutralMask = new Uint8Array(bodyMask.length);
  for (const mask of liveNeutralMasks) {
    for (let pixel = 0; pixel < mask.length; pixel += 1) {
      liveNeutralMask[pixel] |= mask[pixel];
    }
  }
  assert.equal(
    countConnectedComponents(liveNeutralMask, rig.canvas.width, rig.canvas.height),
    1,
    'the actual runtime neutral frame set must remain one connected silhouette'
  );

  const neutral = await readPng(temporaryRoot, 'abyssal-octarch-neutral.png');
  const reference = await readPng(temporaryRoot, 'abyssal-octarch-reference-runtime.png');
  const neutralMask = alphaMask(neutral);
  const referenceMask = alphaMask(reference);
  assert.equal(
    countConnectedComponents(referenceMask, reference.width, reference.height),
    1,
    'the locked complete reference must remain one connected silhouette'
  );
  assert.equal(
    countConnectedComponents(neutralMask, neutral.width, neutral.height),
    1,
    'the neutral modular boss must remain one connected silhouette'
  );
  const neutralBounds = visibleBounds(neutralMask, neutral.width, neutral.height);
  const referenceBounds = visibleBounds(referenceMask, reference.width, reference.height);
  assert.ok(Math.abs(neutralBounds.centerX - referenceBounds.centerX) <= 1);
  assert.ok(Math.abs(neutralBounds.centerY - referenceBounds.centerY) <= 2);
  assert.ok(neutralBounds.width / referenceBounds.width >= 0.77);
  assert.ok(neutralBounds.height / referenceBounds.height >= 0.78);
  assert.ok(
    Math.abs(
      neutralBounds.width / neutralBounds.height
      - referenceBounds.width / referenceBounds.height
    ) <= 0.02,
    'the connected neutral silhouette must preserve the locked reference aspect balance'
  );
  let silhouetteIntersection = 0;
  let neutralPixels = 0;
  let referencePixels = 0;
  for (let pixel = 0; pixel < neutralMask.length; pixel += 1) {
    silhouetteIntersection += neutralMask[pixel] && referenceMask[pixel] ? 1 : 0;
    neutralPixels += neutralMask[pixel];
    referencePixels += referenceMask[pixel];
  }
  assert.ok(
    2 * silhouetteIntersection / (neutralPixels + referencePixels) >= 0.62,
    'the connected neutral silhouette must retain a close locked-reference Dice match'
  );

  const usage = await readJson(temporaryRoot, 'abyssal-octarch.asset-usage-inventory.json');
  assert.equal(usage.assets.length, 32);
  assert.equal(usage.audit.allAcceptedExportsListed, true);
  assert.equal(usage.audit.silentUnusedAssetCount, 0);
  assert.equal(usage.audit.textureSmoothingDisabled, false);

  const referenceLock = await readJson(temporaryRoot, 'abyssal-octarch.reference-lock.json');
  const referenceBuffer = await readFile(path.join(temporaryRoot, referenceLock.canonicalReference.file));
  assert.equal(referenceLock.canonicalReference.sha256, sha256(referenceBuffer));
  assert.equal(referenceLock.verdict, 'pass');
});
