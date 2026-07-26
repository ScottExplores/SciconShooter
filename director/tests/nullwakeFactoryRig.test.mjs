import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
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

const model = await vite.ssrLoadModule('/director/src/tools/bosses/bossSandboxModel.ts');
const hierarchy = await vite.ssrLoadModule('/services/pixi/boss-rigs/ModularHierarchyRig.ts');
const nullwake = await vite.ssrLoadModule('/services/pixi/boss-rigs/NullwakeModularPose.ts');
const registration = model.getSandboxBossArtworkRegistration('nullwake-revenant');
const rig = registration?.modularRig;
const samplePose = registration?.sampleModularPose;

const relativeToCore = (resolved, socketId) => {
  const socket = resolved.socketById[socketId];
  const core = resolved.socketById['revenant-core'];
  return { x: socket.worldX - core.worldX, y: socket.worldY - core.worldY };
};

const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);

test('Nullwake registration is one connected, compatible, opaque modular hierarchy', () => {
  assert.ok(registration);
  assert.ok(rig);
  assert.equal(typeof samplePose, 'function');
  assert.equal(nullwake.validateNullwakeRigCompatibility(rig).length, 0);

  const roots = rig.manifest.parts.filter((part) => part.parentId === null);
  assert.deepEqual(roots.map((part) => part.id), ['root']);
  assert.equal(rig.topologicalPartIds.length, rig.manifest.parts.length);
  assert.equal(new Set(rig.topologicalPartIds).size, rig.manifest.parts.length);

  for (const part of rig.manifest.parts) {
    const visited = new Set();
    let current = part;
    while (current.parentId !== null) {
      assert.equal(visited.has(current.id), false, `${part.id} must not enter a parent cycle`);
      visited.add(current.id);
      current = rig.partById[current.parentId];
      assert.ok(current, `${part.id} must resolve every parent`);
    }
    assert.equal(current.id, 'root', `${part.id} must reach the Nullwake root`);
  }

  const resolved = hierarchy.resolveModularBossRigHierarchy(rig, samplePose({
    frameCount: 120,
    reducedMotion: false,
    healthRatio: 0.72,
    phaseIndex: 1,
    revivalStage: 'armed',
    revivalProgress: 0,
    revived: false
  }));
  resolved.parts.filter((part) => part.visible).forEach((part) => {
    assert.equal(part.alpha, 1, `${part.id} must remain opaque in its neutral pose`);
  });
  assert.equal(rig.atlases.length, 2);
  assert.equal(rig.manifest.supplementalAtlases.length, 1);
  assert.equal(rig.manifest.supplementalAtlases[0].contentHash, model.NULLWAKE_REVENANT_FACTORY_ATLAS_V3_SHA256);
  assert.equal(Object.keys(rig.manifest.supplementalAtlases[0].frames).length, 15);
  assert.deepEqual(
    rig.manifest.destruction.fragments.map((fragment) => fragment.partId),
    Array.from({ length: 5 }, (_, index) => `destruction.fragment.${index}`)
  );
  rig.manifest.destruction.fragments.forEach((fragment) => {
    assert.equal(rig.partById[fragment.partId].visible, false);
    assert.ok(Math.hypot(fragment.travelX, fragment.travelY) > 150);
  });
});

test('Nullwake hierarchy carries selected limb animation into its muzzle sockets', () => {
  assert.ok(rig);
  assert.equal(typeof samplePose, 'function');
  const base = {
    frameCount: 120,
    reducedMotion: false,
    healthRatio: 0.72,
    phaseIndex: 1,
    revivalStage: 'armed',
    revivalProgress: 0,
    revived: false
  };
  const idle = hierarchy.resolveModularBossRigHierarchy(
    rig,
    samplePose(base)
  );
  const portWarning = hierarchy.resolveModularBossRigHierarchy(
    rig,
    samplePose({
      ...base,
      action: {
        primitiveId: 'side-barrage',
        stage: 'warning',
        progress: 0.8,
        side: 'port',
        sequence: 0
      }
    })
  );

  for (const socketId of ['muzzle-upper-port', 'muzzle-lower-port']) {
    const movement = distance(
      relativeToCore(idle, socketId),
      relativeToCore(portWarning, socketId)
    );
    assert.ok(
      movement > 0.01,
      `${socketId} must follow its animated port limb (moved ${movement})`
    );
  }
  for (const socketId of ['muzzle-upper-starboard', 'muzzle-lower-starboard']) {
    assert.ok(
      distance(relativeToCore(idle, socketId), relativeToCore(portWarning, socketId)) < 1e-9,
      `${socketId} must remain stable when only port limbs anticipate`
    );
  }
});

test('Nullwake registers explicit entrance, large-hit, stagger, and persistent damage poses', () => {
  const base = {
    frameCount: 120,
    reducedMotion: false,
    healthRatio: 0.72,
    phaseIndex: 1,
    revivalStage: 'armed',
    revivalProgress: 0,
    revived: false,
    entranceProgress: 1
  };
  const neutral = samplePose(base);
  const entrance = samplePose({ ...base, entranceProgress: 0 });
  const hit = samplePose({
    ...base,
    reaction: { kind: 'impact', progress: 0.5, direction: 1, strength: 1 }
  });
  const stagger = samplePose({
    ...base,
    reaction: { kind: 'stagger', progress: 0.5, direction: 1, strength: 1 }
  });
  const damaged = samplePose({ ...base, damageStage: 4 });

  assert.notDeepEqual(entrance, neutral);
  assert.notDeepEqual(hit, neutral);
  assert.notDeepEqual(stagger, hit);
  assert.notDeepEqual(damaged, neutral);
});

test('Nullwake registers padded body animation cells and explicit hidden effect sequences', () => {
  const coreFrames = rig.animationById['body-core-charge'].frameIds.map((frameId) => rig.frameById[frameId]);
  const damageFrames = rig.animationById['body-damage-cycle'].frameIds.map((frameId) => rig.frameById[frameId]);
  const muzzleFrames = rig.animationById['core-muzzle-cycle'].frameIds;

  const neutralBodyFrame = rig.frameById['body.shell'];
  assert.deepEqual(coreFrames.map(({ width, height }) => ({ width, height })),
    Array.from({ length: 4 }, () => ({
      width: neutralBodyFrame.width,
      height: neutralBodyFrame.height
    })));
  assert.deepEqual(damageFrames.map(({ width, height }) => ({ width, height })),
    Array.from({ length: 3 }, () => ({
      width: neutralBodyFrame.width,
      height: neutralBodyFrame.height
    })));
  assert.deepEqual(Array.from(muzzleFrames), [
    'effect.core-muzzle.0',
    'effect.core-muzzle.1',
    'effect.core-muzzle.2'
  ]);
  assert.equal(rig.partById['effect.core-muzzle'].visible, false);
  for (let index = 0; index < 5; index += 1) {
    assert.equal(rig.partById[`destruction.fragment.${index}`].visible, false);
  }
});
