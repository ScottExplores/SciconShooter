import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createDirectorRequestHandler } from '../server/localApi.mjs';
import {
  createLocalPrototypeAssetCatalog,
  PROTOTYPE_ASSET_DEFINITIONS
} from '../server/prototypeAssetCatalog.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..', '..');
const dataRoot = path.join(repositoryRoot, 'director-data');
const localPrototypeAssets = createLocalPrototypeAssetCatalog(dataRoot);
const allPrototypeAssetsInstalled = localPrototypeAssets.every((asset) => existsSync(asset.filePath));

const startApi = async (t, options = {}) => {
  const handler = createDirectorRequestHandler({
    repository: { bootstrap: async () => ({}) },
    realRunReader: { listRuns: async () => [] },
    ...options
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return server.address().port;
};

const requestBuffer = async (port, pathname) => new Promise((resolve, reject) => {
  const request = httpRequest({
    hostname: '127.0.0.1',
    port,
    path: pathname,
    headers: { Host: `127.0.0.1:${port}` }
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve({
      status: response.statusCode,
      headers: response.headers,
      body: Buffer.concat(chunks)
    }));
  });
  request.on('error', reject);
  request.end();
});

test('Gloamforge Mantis catalog pins its neutral preview and modular atlas', () => {
  const definitions = PROTOTYPE_ASSET_DEFINITIONS
    .filter((asset) => asset.prototypeId === 'gloamforge-mantis')
    .map(({ variant, fileName, sha256, width, height, maxBytes }) => ({
      variant,
      fileName,
      sha256,
      width,
      height,
      maxBytes
    }));

  assert.deepEqual(definitions, [
    {
      variant: 'assembled',
      fileName: 'gloamforge-mantis/gloamforge-mantis-neutral.png',
      sha256: '1f120a336cbd05bce0955b657964e35fb724ed59664b2301540a39b7c2c9bca8',
      width: 720,
      height: 620,
      maxBytes: 2_500_000
    },
    {
      variant: 'sheet',
      fileName: 'gloamforge-mantis/gloamforge-mantis-atlas.png',
      sha256: 'eb08e5b68bdbc6cc999f8d1e45d293628248308d338004d86be6d4f2e6857f60',
      width: 2048,
      height: 2048,
      maxBytes: 2_500_000
    }
  ]);
  assert.ok(definitions.every(({ maxBytes }) => maxBytes > 1_940_930));
});

test('Nullwake catalog pins its supplemental factory animation atlas', () => {
  const factoryAtlas = PROTOTYPE_ASSET_DEFINITIONS.find((asset) => (
    asset.prototypeId === 'nullwake-revenant'
    && asset.variant === 'factory-atlas-v3'
  ));

  assert.deepEqual(factoryAtlas && {
    variant: factoryAtlas.variant,
    fileName: factoryAtlas.fileName,
    sha256: factoryAtlas.sha256,
    width: factoryAtlas.width,
    height: factoryAtlas.height
  }, {
    variant: 'factory-atlas-v3',
    fileName: 'nullwake-revenant-factory-atlas-v3.png',
    sha256: 'a0d29566c3e925c764267f48202ce1a18247f28007b43ad7fdcba7c8573da2cd',
    width: 1536,
    height: 1024
  });
});

test('fixed content-addressed prototype routes serve only hash-verified PNG assets', {
  skip: !allPrototypeAssetsInstalled
}, async (t) => {
  const port = await startApi(t, {
    prototypeAssets: localPrototypeAssets
  });

  assert.equal(PROTOTYPE_ASSET_DEFINITIONS.length, 23);
  for (const asset of PROTOTYPE_ASSET_DEFINITIONS) {
    const response = await requestBuffer(port, `/__director${asset.route}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(createHash('sha256').update(response.body).digest('hex'), asset.sha256);
  }

  const unhashed = await requestBuffer(
    port,
    '/__director/api/v1/prototype-assets/meridian-harrower/assembled.png'
  );
  assert.equal(unhashed.status, 404);
});

test('prototype routes fail closed when local artwork is unavailable', async (t) => {
  const port = await startApi(t);
  const sheet = PROTOTYPE_ASSET_DEFINITIONS.find((asset) => (
    asset.prototypeId === 'aurora-storm-engine' && asset.variant === 'sheet'
  ));
  const response = await requestBuffer(
    port,
    `/__director${sheet.route}`
  );
  assert.equal(response.status, 404);
  assert.match(response.body.toString('utf8'), /not installed locally/);
});
