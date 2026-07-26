import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pngjs from 'pngjs';
import { PROTOTYPE_ASSET_DEFINITIONS } from '../server/prototypeAssetCatalog.mjs';

const { PNG } = pngjs;
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const sourcePath = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'helios-clawcarrier-v2',
  'source',
  'reference-board.png'
);
const referencePath = path.join(
  repositoryRoot,
  'director-data',
  'prototype-assets',
  'helios-clawcarrier-v2',
  'helios-clawcarrier-v2-canonical-reference.png'
);
const expectedHash = '8d6ce675283e1bb3dfd684247c13efaf80f1230400b529032dea3467f9177cb4';
const modelSource = await readFile(
  path.join(repositoryRoot, 'director', 'src', 'tools', 'bosses', 'bossSandboxModel.ts'),
  'utf8'
);

test('Helios canonical reference is the exact tight top-left neutral crop', async () => {
  const source = PNG.sync.read(await readFile(sourcePath));
  const bytes = await readFile(referencePath);
  const cropped = PNG.sync.read(bytes);
  assert.equal(cropped.width, 394);
  assert.equal(cropped.height, 271);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);

  for (let y = 0; y < cropped.height; y += 1) {
    for (let x = 0; x < cropped.width; x += 1) {
      const targetOffset = (y * cropped.width + x) * 4;
      const sourceOffset = ((y + 34) * source.width + x + 12) * 4;
      assert.deepEqual(
        [...cropped.data.subarray(targetOffset, targetOffset + 4)],
        [...source.data.subarray(sourceOffset, sourceOffset + 4)]
      );
      assert.ok(cropped.data[targetOffset + 3] === 0 || cropped.data[targetOffset + 3] === 255);
    }
  }
});

test('Helios registers a hashed review-only descriptor and integrity asset', () => {
  assert.match(modelSource, new RegExp(expectedHash));
  assert.match(modelSource, /modularReferenceComparison: Object\.freeze\(\{/);
  assert.match(modelSource, /kind: MODULAR_BOSS_REFERENCE_COMPARISON_KIND/);
  assert.match(modelSource, /width: 394/);
  assert.match(modelSource, /height: 271/);
  assert.match(modelSource, /id: 'reactor-core'/);
  assert.match(modelSource, /id: 'heavy-muzzle-port'/);
  assert.match(modelSource, /id: 'heavy-muzzle-starboard'/);
  assert.match(modelSource, /kind: 'socket', socketId: 'reactor-core'/);
  assert.match(modelSource, /kind: 'socket', socketId: 'heavy-muzzle-port'/);
  assert.match(modelSource, /kind: 'socket', socketId: 'heavy-muzzle-starboard'/);
  assert.doesNotMatch(modelSource, /360\.277 \/ 720|263\.88 \/ 620/);
  assert.match(modelSource, /\? \{ modularReferenceComparison: registration\.modularReferenceComparison \}/);
  const catalogAsset = PROTOTYPE_ASSET_DEFINITIONS.find((asset) => (
    asset.prototypeId === 'helios-clawcarrier' && asset.variant === 'reference'
  ));
  assert.ok(catalogAsset);
  assert.equal(catalogAsset.sha256, expectedHash);
  assert.equal(catalogAsset.width, 394);
  assert.equal(catalogAsset.height, 271);
});

test('sandbox artwork keeps assembled pixels authoritative for gameplay', () => {
  assert.match(modelSource, /url: registration\.assembled\.url/);
  assert.match(modelSource, /contentHash: registration\.assembled\.contentHash/);
  assert.match(
    modelSource,
    /collisionMaskAsset\.contentHash !== registration\.assembled\.contentHash/
  );
  assert.doesNotMatch(
    modelSource,
    /url: registration\.modularReferenceComparison\.url/
  );
});
