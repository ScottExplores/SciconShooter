import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const requireFromDirector = createRequire(new URL('../package.json', import.meta.url));
const { PNG } = requireFromDirector('pngjs');
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const packageDirectory = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'prism-moth-broodkeeper'
);
const packagePath = (...segments) => path.join(packageDirectory, ...segments);
const repositoryPath = (...segments) => path.join(repositoryRoot, ...segments);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (...segments) => JSON.parse(await readFile(packagePath(...segments), 'utf8'));

const [layout, rigSource, rig, atlasMetadata, manifest, usage, pivotManifest, attackSpriteMap] = await Promise.all([
  readJson('source-layout.json'),
  readJson('rig.source.json'),
  readJson('prism-moth-broodkeeper.rig.json'),
  readJson('prism-moth-broodkeeper-atlas.json'),
  readJson('prism-moth-broodkeeper.asset-manifest.json'),
  readJson('prism-moth-broodkeeper.asset-usage.json'),
  readJson('prism-moth-broodkeeper.rig-pivot-manifest.json'),
  readJson('prism-moth-broodkeeper.attack-sprite-map.json')
]);

const vite = await createServer({
  root: repositoryRoot,
  configFile: false,
  resolve: {
    alias: {
      '@game': repositoryRoot,
      '@director': path.join(repositoryRoot, 'director', 'src')
    }
  },
  server: { middlewareMode: true, hmr: false },
  appType: 'custom'
});
after(async () => vite.close());

const hierarchy = await vite.ssrLoadModule('/services/pixi/boss-rigs/ModularHierarchyRig.ts');
const poseModule = await vite.ssrLoadModule('/services/pixi/boss-rigs/PrismMothModularPose.ts');

const normalizeRig = () => ({
  kind: hierarchy.MODULAR_BOSS_RIG_KIND,
  id: rig.bossId,
  designSize: { width: rig.canvas.width, height: rig.canvas.height },
  atlas: {
    url: '/__director/test/prism-moth-broodkeeper-atlas.png',
    contentHash: rig.atlas.sha256,
    width: atlasMetadata.image.width,
    height: atlasMetadata.image.height,
    frames: atlasMetadata.frames
  },
  parts: rig.parts.map((part) => ({
    id: part.id,
    role: part.role,
    parentId: part.parentId,
    frameId: part.frameId,
    transform: {
      x: part.parentId === null ? part.transform.x - rig.canvas.width / 2 : part.transform.x,
      y: part.parentId === null ? part.transform.y - rig.canvas.height / 2 : part.transform.y,
      rotation: part.transform.rotationDegrees * Math.PI / 180,
      scaleX: part.transform.scaleX,
      scaleY: part.transform.scaleY
    },
    anchor: part.anchor ?? null,
    layer: part.layer,
    visible: part.neutralVisible
  })),
  animations: rig.animations.map((animation) => ({
    kind: hierarchy.FIXED_FRAME_ANIMATION_KIND,
    id: animation.id,
    partId: animation.partId,
    frameIds: animation.frameIds,
    frameHold: Math.max(1, Math.round(60 / animation.fps)),
    loop: animation.loop
  })),
  sockets: rig.sockets.map((socket) => ({
    id: socket.id,
    role: socket.role,
    partId: socket.partId,
    x: socket.x,
    y: socket.y,
    rotation: socket.rotationDegrees * Math.PI / 180
  }))
});

const countVisiblePixels = (image) => {
  let visible = 0;
  let semitransparent = 0;
  const colors = new Set();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = image.data[offset + 3];
    if (alpha !== 0) visible += 1;
    if (alpha !== 0 && alpha !== 255) semitransparent += 1;
    if (alpha === 255) {
      colors.add(`${image.data[offset]},${image.data[offset + 1]},${image.data[offset + 2]}`);
    }
  }
  return { visible, semitransparent, paletteSize: colors.size };
};

const countVisibleBorderPixels = (image) => {
  let visible = 0;
  for (let x = 0; x < image.width; x += 1) {
    if (image.data[x * 4 + 3] !== 0) visible += 1;
    if (image.data[(((image.height - 1) * image.width + x) * 4) + 3] !== 0) visible += 1;
  }
  for (let y = 1; y < image.height - 1; y += 1) {
    if (image.data[(y * image.width * 4) + 3] !== 0) visible += 1;
    if (image.data[((y * image.width + image.width - 1) * 4) + 3] !== 0) visible += 1;
  }
  return visible;
};

const connectedComponents = (image) => {
  const pixelCount = image.width * image.height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];
  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || image.data[start * 4 + 3] === 0) continue;
    let head = 0;
    let tail = 0;
    let count = 0;
    let left = image.width;
    let top = image.height;
    let right = -1;
    let bottom = -1;
    visited[start] = 1;
    queue[tail] = start;
    tail += 1;
    while (head < tail) {
      const pixel = queue[head];
      head += 1;
      count += 1;
      const x = pixel % image.width;
      const y = Math.floor(pixel / image.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
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
    components.push({
      x: left,
      y: top,
      width: right - left + 1,
      height: bottom - top + 1,
      count
    });
  }
  return components.sort((left, right) => left.y - right.y || left.x - right.x);
};

test('Prism source atlas resolves to the exact 16 audited components without legacy crop contamination', async () => {
  const sourceDescriptor = layout.sources['component-atlas'];
  const sourceBytes = await readFile(repositoryPath(...sourceDescriptor.repositoryFile.split('/')));
  const source = PNG.sync.read(sourceBytes);
  assert.equal(sha256(sourceBytes), sourceDescriptor.sha256);
  assert.deepEqual({ width: source.width, height: source.height }, { width: 1254, height: 1254 });
  const components = connectedComponents(source);
  assert.equal(components.length, 16);
  const expected = layout.anatomyComponents
    .map((component) => ({
      ...component.sourceBounds,
      count: component.expectedVisiblePixels
    }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
  assert.deepEqual(components, expected);
});

test('Prism package extracts all anatomy and lifecycle art with stable equal-canvas families', async () => {
  assert.equal(layout.anatomyComponents.length, 16);
  assert.equal(layout.lifecycleFrames.length, 8);
  assert.equal(manifest.outputs.components.length, 24);
  const records = new Map(manifest.outputs.components.map((record) => [record.frameId, record]));
  for (const component of layout.anatomyComponents) {
    const record = records.get(component.frameId);
    assert.ok(record, `missing ${component.frameId}`);
    assert.equal(record.width, component.sourceBounds.width + 16);
    assert.equal(record.height, component.sourceBounds.height + 16);
    assert.equal(record.visiblePixels, component.expectedVisiblePixels);
  }
  for (const family of [
    ['broodling.flutter.', { width: 314, height: 294 }],
    ['cocoon.lifecycle.', { width: 190, height: 375 }]
  ]) {
    const [prefix, dimensions] = family;
    const frames = [...records.values()].filter((record) => record.frameId.startsWith(prefix));
    assert.equal(frames.length, 4);
    assert.deepEqual(
      frames.map(({ width, height }) => ({ width, height })),
      Array.from({ length: 4 }, () => dimensions)
    );
    assert.equal(new Set(frames.map((record) => record.sha256)).size, 4);
  }

  const decodedFrames = await Promise.all([...records.values()].map(async (record) => {
    const bytes = await readFile(packagePath(...record.file.split('/')));
    return { record, bytes, image: PNG.sync.read(bytes) };
  }));
  for (const { record, bytes, image } of decodedFrames) {
    assert.equal(sha256(bytes), record.sha256, `${record.frameId} hash`);
    const analysis = countVisiblePixels(image);
    assert.equal(analysis.visible, record.visiblePixels, `${record.frameId} visible pixels`);
    assert.equal(analysis.semitransparent, 0, `${record.frameId} binary alpha`);
    assert.ok(analysis.paletteSize <= 48, `${record.frameId} palette ${analysis.paletteSize}`);
    assert.equal(countVisibleBorderPixels(image), 0, `${record.frameId} transparent outer gutter`);
  }
});

test('Prism runtime atlas is hash-pinned, bounded, binary-alpha, and accounts for every frame exactly once', async () => {
  const atlasBytes = await readFile(packagePath('prism-moth-broodkeeper-atlas.png'));
  const atlas = PNG.sync.read(atlasBytes);
  assert.equal(sha256(atlasBytes), manifest.outputs.atlas.sha256);
  assert.equal(sha256(atlasBytes), atlasMetadata.image.sha256);
  assert.deepEqual({ width: atlas.width, height: atlas.height }, { width: 2048, height: 2048 });
  const analysis = countVisiblePixels(atlas);
  assert.equal(analysis.semitransparent, 0);
  assert.equal(analysis.paletteSize, atlasMetadata.image.opaquePaletteSize);
  assert.ok(analysis.paletteSize <= 96);
  const expectedIds = [
    ...layout.anatomyComponents.map((component) => component.frameId),
    ...layout.lifecycleFrames.map((frame) => frame.frameId)
  ];
  assert.deepEqual(Object.keys(atlasMetadata.frames), expectedIds);
  assert.equal(new Set(expectedIds).size, 24);
  const componentById = new Map(manifest.outputs.components.map((record) => [record.frameId, record]));
  for (const [frameId, frame] of Object.entries(atlasMetadata.frames)) {
    assert.ok(frame.x >= 0 && frame.y >= 0);
    assert.ok(frame.x + frame.width <= atlas.width);
    assert.ok(frame.y + frame.height <= atlas.height);
    let visible = 0;
    for (let y = frame.y; y < frame.y + frame.height; y += 1) {
      for (let x = frame.x; x < frame.x + frame.width; x += 1) {
        if (atlas.data[((y * atlas.width + x) * 4) + 3] !== 0) visible += 1;
      }
    }
    assert.equal(visible, componentById.get(frameId).visiblePixels, `${frameId} atlas pixels`);
  }
});

test('Prism rig is one compatible parented hierarchy with live anatomy-owned sockets and no mirroring', () => {
  assert.deepEqual(rig, {
    ...rigSource,
    format: 'modular-hierarchy-v1',
    atlas: rig.atlas,
    lifecycleFamilies: rig.lifecycleFamilies,
    provenance: rig.provenance
  });
  const registration = hierarchy.registerModularBossRig(normalizeRig());
  assert.deepEqual(poseModule.validatePrismMothRigCompatibility(registration), []);
  assert.deepEqual(
    registration.manifest.parts.map((part) => part.id),
    [...poseModule.PRISM_MOTH_MODULAR_PART_IDS]
  );
  assert.deepEqual(
    registration.manifest.sockets.map((socket) => socket.id),
    [...poseModule.PRISM_MOTH_MODULAR_SOCKET_IDS]
  );
  assert.deepEqual(
    registration.manifest.parts.filter((part) => part.parentId === null).map((part) => part.id),
    ['root']
  );
  for (const part of registration.manifest.parts) {
    assert.equal(part.transform.scaleX, part.transform.scaleY, `${part.id} uniform scale`);
    assert.ok(part.transform.scaleX > 0, `${part.id} positive scale`);
    if (part.id.includes('.left')) assert.doesNotMatch(part.frameId ?? '', /\.right(?:\.|$)/);
    if (part.id.includes('.right')) assert.doesNotMatch(part.frameId ?? '', /\.left(?:\.|$)/);
    const visited = new Set();
    let current = part;
    while (current.parentId !== null) {
      assert.equal(visited.has(current.id), false, `${part.id} parent cycle`);
      visited.add(current.id);
      current = registration.partById[current.parentId];
      assert.ok(current, `${part.id} missing ancestor`);
    }
    assert.equal(current.id, 'root', `${part.id} remains connected`);
  }
  const pose = poseModule.samplePrismMothModularPose({
    frameCount: 180,
    reducedMotion: false,
    healthRatio: 0.42,
    phaseIndex: 2,
    entranceProgress: 1,
    damageStage: 2,
    action: {
      primitiveId: 'prism-kaleidoscope',
      motionCue: 'prism-kaleidoscope-peak',
      stage: 'fire',
      progress: 0.5,
      sequence: 1
    }
  });
  const resolved = hierarchy.resolveModularBossRigHierarchy(registration, pose);
  for (const socketId of poseModule.PRISM_MOTH_MODULAR_SOCKET_IDS) {
    const socket = resolved.socketById[socketId];
    assert.ok(socket);
    assert.ok(Number.isFinite(socket.worldX) && Number.isFinite(socket.worldY));
  }
});

test('Prism usage, pivots, and attack art make every retained asset disposition explicit', () => {
  const atlasIds = Object.keys(atlasMetadata.frames).sort();
  assert.equal(usage.complete, true);
  assert.deepEqual(usage.frames.map((entry) => entry.frameId).sort(), atlasIds);
  assert.deepEqual(usage.archivedRuntimeFrames, []);
  assert.deepEqual(usage.missingRuntimeFrames, []);
  assert.equal(usage.sourceAssets.find((entry) => entry.id === 'brood-lifecycle-chroma').classification, 'archived');
  assert.equal(usage.sourceAssets.find((entry) => entry.id === 'canonical-reference').classification, 'forbidden');
  assert.equal(usage.retainedExternalAssets[0].id, 'prism-feather');
  assert.equal(usage.retainedExternalAssets[0].sha256, layout.retainedExternalAttackArt['prism-feather'].sha256);
  assert.deepEqual(
    attackSpriteMap.assets['prism-broodling'].frameIds,
    ['broodling.flutter.0', 'broodling.flutter.1', 'broodling.flutter.2', 'broodling.flutter.3']
  );
  assert.deepEqual(
    attackSpriteMap.assets['prism-cocoon'].frameIds,
    ['cocoon.lifecycle.0', 'cocoon.lifecycle.1', 'cocoon.lifecycle.2', 'cocoon.lifecycle.3']
  );
  assert.deepEqual(attackSpriteMap.assets['prism-cocoon'].states, ['closed', 'armed', 'cracked', 'hatched']);
  assert.equal(pivotManifest.parts.length, 17);
  assert.equal(pivotManifest.sockets.length, 7);
  assert.ok(pivotManifest.parts.every((part) => part.neutralLocalTransform.scaleX === part.neutralLocalTransform.scaleY));
  assert.ok(pivotManifest.sockets.every((socket) => socket.followsLivePartTransform));
});

test('Prism neutral assembly stays cohesive and measurably comparable to the canonical silhouette', async () => {
  const [neutralBytes, comparison, metrics] = await Promise.all([
    readFile(packagePath('prism-moth-broodkeeper-neutral.png')),
    readFile(packagePath('review', 'prism-moth-broodkeeper-reference-comparison.png')),
    readJson('review', 'prism-moth-broodkeeper-reference-comparison.json')
  ]);
  assert.equal(sha256(neutralBytes), manifest.outputs.neutralPreview.sha256);
  assert.equal(sha256(comparison), manifest.outputs.referenceComparison.sha256);
  const neutral = PNG.sync.read(neutralBytes);
  const analysis = countVisiblePixels(neutral);
  assert.deepEqual({ width: neutral.width, height: neutral.height }, { width: 512, height: 512 });
  assert.equal(analysis.semitransparent, 0);
  assert.ok(analysis.visible > 140_000);
  assert.ok(metrics.silhouetteIntersectionOverUnion >= 0.7);
  assert.ok(metrics.neutralBounds.x > 0 && metrics.neutralBounds.y > 0);
  assert.ok(metrics.neutralBounds.x + metrics.neutralBounds.width < neutral.width);
  assert.ok(metrics.neutralBounds.y + metrics.neutralBounds.height < neutral.height);
});

test('Prism asset extractor reproduces every generated byte without rewriting in verify mode', () => {
  const result = spawnSync(
    process.execPath,
    ['tools/extract-prism-moth-broodkeeper-assets.mjs', '--verify'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 120_000
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.mode, 'verify');
  assert.equal(report.files, 36);
  assert.equal(report.atlas.sha256, manifest.outputs.atlas.sha256);
  assert.equal(report.neutralPreview.sha256, manifest.outputs.neutralPreview.sha256);
});
