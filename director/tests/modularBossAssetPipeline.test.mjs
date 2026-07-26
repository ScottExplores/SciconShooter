import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import {
  buildModularBossAssets,
  validateRigSource
} from '../../tools/build-modular-boss-assets.mjs';

const { PNG } = pngjs;
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const assetRoot = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'gloamforge-mantis'
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const assertBinaryAlpha = (image, label) => {
  for (let offset = 3; offset < image.data.length; offset += 4) {
    assert.ok(
      image.data[offset] === 0 || image.data[offset] === 255,
      `${label} must use binary alpha`
    );
  }
};

test('Gloamforge package is deterministic and excludes every forbidden flattened source cell', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'gloamforge-modular-'));
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const rebuilt = await buildModularBossAssets({
    layoutPath: path.join(assetRoot, 'source-layout.json'),
    rigSourcePath: path.join(assetRoot, 'rig.source.json'),
    outputDirectory: temporaryRoot
  });
  const checkedIn = JSON.parse(await readFile(
    path.join(assetRoot, 'gloamforge-mantis.asset-manifest.json'),
    'utf8'
  ));

  assert.equal(rebuilt.outputs.atlas.sha256, checkedIn.outputs.atlas.sha256);
  assert.equal(rebuilt.outputs.rig.sha256, checkedIn.outputs.rig.sha256);
  assert.equal(rebuilt.outputs.neutralPreview.sha256, checkedIn.outputs.neutralPreview.sha256);
  assert.equal(rebuilt.validation.runtimeFrameCount, 29);
  assert.deepEqual(rebuilt.validation.forbiddenRuntimeFrames, []);

  const runtimeFrameIds = new Set(rebuilt.outputs.components.map((component) => component.frameId));
  for (const forbidden of [
    'guide.assembled',
    'arm.port.original',
    'arm.starboard.original',
    'cannon.port.board',
    'cannon.starboard.board'
  ]) {
    assert.equal(runtimeFrameIds.has(forbidden), false, `${forbidden} must never enter runtime output`);
  }
});

test('Gloamforge atlas, components, and neutral assembly are bounded, hashed binary-alpha assets', async () => {
  const manifest = JSON.parse(await readFile(
    path.join(assetRoot, 'gloamforge-mantis.asset-manifest.json'),
    'utf8'
  ));
  const atlasMetadata = JSON.parse(await readFile(
    path.join(assetRoot, manifest.outputs.atlasMetadata.file),
    'utf8'
  ));
  const atlasBuffer = await readFile(path.join(assetRoot, manifest.outputs.atlas.file));
  const atlas = PNG.sync.read(atlasBuffer);

  assert.equal(sha256(atlasBuffer), manifest.outputs.atlas.sha256);
  assert.ok(atlas.width <= 2048 && atlas.height <= 2048);
  assertBinaryAlpha(atlas, 'atlas');
  assert.equal(Object.keys(atlasMetadata.frames).length, 29);
  for (const [frameId, frame] of Object.entries(atlasMetadata.frames)) {
    assert.ok(frame.x >= 0 && frame.y >= 0, `${frameId} starts in bounds`);
    assert.ok(frame.width > 0 && frame.height > 0, `${frameId} has dimensions`);
    assert.ok(frame.x + frame.width <= atlas.width, `${frameId} width is in bounds`);
    assert.ok(frame.y + frame.height <= atlas.height, `${frameId} height is in bounds`);
  }

  for (const component of manifest.outputs.components) {
    const buffer = await readFile(path.join(assetRoot, component.file));
    const image = PNG.sync.read(buffer);
    assert.equal(sha256(buffer), component.sha256, `${component.frameId} hash is current`);
    assert.deepEqual(
      { width: image.width, height: image.height },
      { width: component.width, height: component.height }
    );
    assertBinaryAlpha(image, component.frameId);
    assert.ok(component.visiblePixels > 100);
  }

  const neutralBuffer = await readFile(path.join(assetRoot, manifest.outputs.neutralPreview.file));
  const neutral = PNG.sync.read(neutralBuffer);
  assert.equal(sha256(neutralBuffer), manifest.outputs.neutralPreview.sha256);
  assert.deepEqual({ width: neutral.width, height: neutral.height }, { width: 720, height: 620 });
  assertBinaryAlpha(neutral, 'neutral preview');
  assert.ok(neutral.data.some((value, offset) => offset % 4 === 3 && value === 255));
});

test('Gloamforge rig references valid parents, frames, sockets, and registered animation canvases', async () => {
  const rig = JSON.parse(await readFile(path.join(assetRoot, 'gloamforge-mantis.rig.json'), 'utf8'));
  const atlas = JSON.parse(await readFile(path.join(assetRoot, 'gloamforge-mantis-atlas.json'), 'utf8'));
  const partIds = new Set(rig.parts.map((part) => part.id));
  const frameIds = new Set(Object.keys(atlas.frames));

  assert.equal(rig.format, 'modular-hierarchy-v1');
  assert.equal(partIds.size, rig.parts.length);
  for (const part of rig.parts) {
    if (part.parentId !== null) assert.ok(partIds.has(part.parentId), `${part.id} parent exists`);
    if (part.frameId) assert.ok(frameIds.has(part.frameId), `${part.id} frame exists`);
  }
  assert.equal(new Set(rig.sockets.map((socket) => socket.id)).size, rig.sockets.length);
  for (const socket of rig.sockets) assert.ok(partIds.has(socket.partId), `${socket.id} owner exists`);
  for (const animation of rig.animations) {
    assert.ok(partIds.has(animation.partId), `${animation.id} target exists`);
    animation.frameIds.forEach((frameId) => assert.ok(frameIds.has(frameId)));
    const dimensions = animation.frameIds.map((frameId) => ({
      width: atlas.frames[frameId].width,
      height: atlas.frames[frameId].height
    }));
    assert.deepEqual(
      dimensions,
      dimensions.map(() => dimensions[0]),
      `${animation.id} must preserve one registered canvas`
    );
  }
});

test('modular rig validation rejects duplicate IDs, cycles, broken sockets, and missing frames', async () => {
  const rig = JSON.parse(await readFile(path.join(assetRoot, 'rig.source.json'), 'utf8'));
  const atlas = JSON.parse(await readFile(path.join(assetRoot, 'gloamforge-mantis-atlas.json'), 'utf8'));
  const frameIds = new Set(Object.keys(atlas.frames));
  const validate = (candidate) => validateRigSource(candidate, frameIds, new Set(['guide.assembled']));

  const duplicate = structuredClone(rig);
  duplicate.parts.push(structuredClone(duplicate.parts[0]));
  assert.throws(() => validate(duplicate), /Duplicate rig part id/);

  const cycle = structuredClone(rig);
  cycle.parts.find((part) => part.id === 'root').parentId = 'body';
  assert.throws(() => validate(cycle), /Rig parent cycle/);

  const brokenSocket = structuredClone(rig);
  brokenSocket.sockets[0].partId = 'missing-part';
  assert.throws(() => validate(brokenSocket), /references missing part/);

  const missingFrame = structuredClone(rig);
  missingFrame.parts.find((part) => part.id === 'body').frameId = 'body.missing';
  assert.throws(() => validate(missingFrame), /references missing frame/);
});
