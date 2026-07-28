import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildModularBossAssets } from '../../tools/build-modular-boss-assets.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const assetRoot = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'helios-clawcarrier-v2'
);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const readJson = async (file) => JSON.parse(await readFile(path.join(assetRoot, file), 'utf8'));

test('Helios asset usage classifies every source-grid cell and every used frame has a consumer', async () => {
  const [usage, manifest] = await Promise.all([
    readJson('helios-clawcarrier-v2.asset-usage.json'),
    readJson('helios-clawcarrier-v2.asset-manifest.json')
  ]);
  const usageBytes = await readFile(
    path.join(assetRoot, manifest.outputs.assetUsage.file)
  );

  assert.equal(usage.format, 'scicon-boss-asset-usage-v1');
  assert.equal(sha256(usageBytes), manifest.outputs.assetUsage.sha256);
  assert.equal(manifest.outputs.assetUsage.complete, true);
  assert.equal(manifest.validation.assetUsageComplete, true);
  assert.deepEqual(usage.sourceCoverage, {
    complete: true,
    totalCells: 60,
    classifiedCells: 60,
    unclassifiedCells: []
  });
  assert.deepEqual(usage.classificationCounts, {
    frames: { used: 40, future: 12, archived: 10, forbidden: 0 },
    sourceCells: { used: 38, future: 12, archived: 10, forbidden: 0 }
  });
  assert.deepEqual(usage.validation, {
    allUsedFramesHaveConsumers: true,
    unreferencedUsedFrames: []
  });

  const sourceKeys = usage.sourceCells.map(({ sourceId, cell }) => (
    `${sourceId}:${cell[0]}:${cell[1]}`
  ));
  assert.equal(new Set(sourceKeys).size, 60);
  for (const sourceCell of usage.sourceCells) {
    assert.ok(
      ['used', 'future', 'archived', 'forbidden'].includes(sourceCell.classification),
      `${sourceCell.sourceId}/${sourceCell.cell.join(',')} is classified`
    );
  }
  for (const frame of usage.frames) {
    if (frame.classification === 'used') {
      assert.equal(frame.disposition, 'runtime', `${frame.frameId} is runtime`);
      assert.ok(frame.usedBy.length > 0, `${frame.frameId} has a concrete consumer`);
    } else {
      assert.notEqual(frame.disposition, 'runtime', `${frame.frameId} cannot enter runtime output`);
    }
  }
  assert.deepEqual(
    manifest.outputs.components.map((component) => component.frameId).sort(),
    usage.frames
      .filter((frame) => frame.classification === 'used')
      .map((frame) => frame.frameId)
      .sort(),
    'only explicitly used frames enter the runtime component package'
  );

  const projectileCells = usage.sourceCells.filter((cell) => cell.sourceId === 'projectile-vfx');
  assert.equal(projectileCells.length, 32);
  assert.ok(projectileCells.filter((cell) => cell.cell[0] === 5).every((cell) => (
    cell.classification === 'future'
  )));
  assert.ok(projectileCells.filter((cell) => cell.cell[0] === 6).every((cell) => (
    cell.classification === 'future'
  )));
  assert.ok(projectileCells.filter((cell) => cell.cell[0] === 7).every((cell) => (
    cell.classification === 'archived'
  )));
});

test('Helios package keeps handed claws stable, body-owns its guns and legs, and exposes only the starburst muzzle frame', async () => {
  const [usage, rig, atlas, sourceLayout] = await Promise.all([
    readJson('helios-clawcarrier-v2.asset-usage.json'),
    readJson('helios-clawcarrier-v2.rig.json'),
    readJson('helios-clawcarrier-v2-atlas.json'),
    readJson('source-layout.json')
  ]);
  const partById = Object.fromEntries(rig.parts.map((part) => [part.id, part]));
  const animationById = Object.fromEntries(rig.animations.map((animation) => [animation.id, animation]));
  const usageById = Object.fromEntries(usage.frames.map((frame) => [frame.frameId, frame]));
  const sourceCellById = Object.fromEntries(sourceLayout.cells.map((cell) => [cell.id, cell]));

  assert.equal(partById['claw.port'].transform.scaleX, 0.88);
  assert.equal(partById['claw.starboard'].transform.scaleX, 0.88);
  assert.deepEqual(partById['claw.port'].anchor, { x: 0.88, y: 0.12 });
  assert.deepEqual(partById['claw.starboard'].anchor, { x: 0.12, y: 0.12 });
  assert.equal(
    atlas.frames['claw.port.shell'].componentSha256,
    atlas.frames['claw.port.attack'].componentSha256,
    'port strike IDs must retain the same handed registered image'
  );
  assert.deepEqual(
    atlas.frames['claw.port.shell'].anchor,
    atlas.frames['claw.port.attack'].anchor,
    'port strike frames must keep one registration point'
  );
  assert.equal(
    atlas.frames['claw.starboard.shell'].componentSha256,
    atlas.frames['claw.starboard.attack'].componentSha256,
    'starboard strike IDs must retain the same handed registered image'
  );
  assert.deepEqual(
    atlas.frames['claw.starboard.shell'].anchor,
    atlas.frames['claw.starboard.attack'].anchor,
    'starboard strike frames must keep one registration point'
  );
  assert.notEqual(
    atlas.frames['claw.port.shell'].componentSha256,
    atlas.frames['claw.starboard.shell'].componentSha256,
    'the two sides must use their proper distinct handed images'
  );
  assert.equal(rig.sockets.find((socket) => socket.id === 'claw-tip-port').x, -132);
  assert.equal(rig.sockets.find((socket) => socket.id === 'claw-tip-starboard').x, 132);
  assert.equal(rig.parts.some((part) => part.transform.scaleX < 0), false);

  assert.equal(partById['weapons.mount'].parentId, 'body');
  assert.equal(partById['rotary.port'].parentId, 'weapons.mount');
  assert.equal(partById['rotary.starboard'].parentId, 'weapons.mount');
  const expectedRotaryRegistration = {
    'rotary.port.0': { x: 182, y: 157, unit: 'pixels' },
    'rotary.port.1': { x: 165, y: 157, unit: 'pixels' },
    'rotary.port.2': { x: 143, y: 157, unit: 'pixels' },
    'rotary.port.3': { x: 120, y: 157, unit: 'pixels' },
    'rotary.starboard.0': { x: 176, y: 156.5, unit: 'pixels' },
    'rotary.starboard.1': { x: 169, y: 156.5, unit: 'pixels' },
    'rotary.starboard.2': { x: 140, y: 156.5, unit: 'pixels' },
    'rotary.starboard.3': { x: 122, y: 156.5, unit: 'pixels' }
  };
  for (const [frameId, registrationPoint] of Object.entries(expectedRotaryRegistration)) {
    assert.deepEqual(
      sourceCellById[frameId].registration,
      registrationPoint,
      `${frameId} must keep its visible bore registered to the live socket`
    );
  }
  for (const frameIds of [
    ['rotary.port.0', 'rotary.port.1', 'rotary.port.2', 'rotary.port.3'],
    ['rotary.starboard.0', 'rotary.starboard.1', 'rotary.starboard.2', 'rotary.starboard.3']
  ]) {
    const firstAnchor = atlas.frames[frameIds[0]].anchor;
    frameIds.slice(1).forEach((frameId) => assert.deepEqual(
      atlas.frames[frameId].anchor,
      firstAnchor,
      `${frameId} must retain one stable mounted bore across the spin cycle`
    ));
  }
  assert.equal(partById['mandible.port'].parentId, 'claw.port');
  assert.equal(partById['mandible.starboard'].parentId, 'claw.starboard');
  assert.deepEqual(partById['mandible.port'].transform, {
    x: -41,
    y: 80,
    rotationDegrees: -6,
    scaleX: 0.75,
    scaleY: 0.75
  });
  assert.deepEqual(partById['mandible.starboard'].transform, {
    x: 41,
    y: 80,
    rotationDegrees: 6,
    scaleX: 0.75,
    scaleY: 0.75
  });
  for (const partId of [
    'leg.outer-port',
    'leg.inner-port',
    'leg.inner-starboard',
    'leg.outer-starboard'
  ]) {
    assert.equal(partById[partId].parentId, 'body', `${partId} follows the hull`);
    assert.equal(partById[partId].layer, 7, `${partId} stays behind the hull and rotaries`);
    assert.ok(partById[partId].transform.scaleX >= 0.23, `${partId} remains visibly leg-sized`);
    assert.ok(partById[partId].transform.scaleY >= 0.23, `${partId} remains visibly leg-sized`);
    assert.equal(partById[partId].damageable, false, `${partId} is decorative`);
    assert.equal(partById[partId].socketless, true, `${partId} owns no gameplay socket`);
    assert.equal(rig.sockets.some((socket) => socket.partId === partId), false);
    assert.equal(usageById[partId].classification, 'used');
  }

  assert.deepEqual(animationById['muzzle-port-cycle'].frameIds, ['muzzle.flash.2']);
  assert.deepEqual(animationById['muzzle-starboard-cycle'].frameIds, ['muzzle.flash.2']);
  assert.equal(partById['muzzle.port'].frameId, 'muzzle.flash.2');
  assert.equal(partById['muzzle.starboard'].frameId, 'muzzle.flash.2');
  for (const frameId of ['muzzle.flash.0', 'muzzle.flash.1', 'muzzle.flash.3']) {
    assert.equal(usageById[frameId].classification, 'archived');
    assert.equal(Object.prototype.hasOwnProperty.call(atlas.frames, frameId), false);
  }
  assert.equal(usageById['exhaust.module'].classification, 'archived');
  assert.equal(Object.prototype.hasOwnProperty.call(partById, 'exhaust'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(atlas.frames, 'exhaust.module'), false);
});

test('Helios asset-usage artifact is deterministic without changing runtime atlas pixels', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'helios-asset-usage-'));
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));
  const rebuilt = await buildModularBossAssets({
    layoutPath: path.join(assetRoot, 'source-layout.json'),
    rigSourcePath: path.join(assetRoot, 'rig.source.json'),
    outputDirectory: temporaryRoot
  });
  const checkedIn = await readJson('helios-clawcarrier-v2.asset-manifest.json');

  assert.equal(rebuilt.outputs.assetUsage.sha256, checkedIn.outputs.assetUsage.sha256);
  assert.equal(rebuilt.outputs.assetUsage.complete, true);
  assert.equal(rebuilt.validation.assetUsageComplete, true);
  assert.equal(rebuilt.outputs.atlas.sha256, checkedIn.outputs.atlas.sha256);
  assert.equal(rebuilt.outputs.neutralPreview.sha256, checkedIn.outputs.neutralPreview.sha256);
  assert.equal(rebuilt.validation.runtimeFrameCount, 40);
});
