import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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

test('Abyssal Octarch catalog pins its neutral, modular atlas, and canonical reference', () => {
  const definitions = PROTOTYPE_ASSET_DEFINITIONS
    .filter((asset) => asset.prototypeId === 'abyssal-octarch')
    .map(({ variant, fileName, sha256, width, height, route }) => ({
      variant,
      fileName,
      sha256,
      width,
      height,
      route
    }));

  assert.deepEqual(definitions, [
    {
      variant: 'assembled',
      fileName: 'abyssal-octarch/assembled.png',
      sha256: 'a9fc10f01d3d6abcb51ff00b8be1a2b6ead7c02b10e7ee697369b2c1c1b7854d',
      width: 720,
      height: 480,
      route: '/api/v1/prototype-assets/abyssal-octarch/a9fc10f01d3d6abcb51ff00b8be1a2b6ead7c02b10e7ee697369b2c1c1b7854d/assembled.png'
    },
    {
      variant: 'sheet',
      fileName: 'abyssal-octarch/sheet.png',
      sha256: 'dae4d697b30ee0a7f6509022fc4273907452b7a71a02377bfe885a3523f4cf30',
      width: 2048,
      height: 512,
      route: '/api/v1/prototype-assets/abyssal-octarch/dae4d697b30ee0a7f6509022fc4273907452b7a71a02377bfe885a3523f4cf30/sheet.png'
    },
    {
      variant: 'reference',
      fileName: 'abyssal-octarch/abyssal-octarch-reference-runtime.png',
      sha256: '32e3b0b8989342a8fcf1c1df3e41894b714a0e896621ebb5218a8c9f1e685831',
      width: 720,
      height: 480,
      route: '/api/v1/prototype-assets/abyssal-octarch/32e3b0b8989342a8fcf1c1df3e41894b714a0e896621ebb5218a8c9f1e685831/reference.png'
    }
  ]);
});

test('Abyssal Octarch generated collision mask is bound to the assembled artwork hash', () => {
  const generatedSource = readFileSync(
    path.join(
      repositoryRoot,
      'director',
      'src',
      'tools',
      'bosses',
      'generatedSandboxBossCollisionMasks.ts'
    ),
    'utf8'
  );
  const entry = generatedSource.match(
    /"abyssal-octarch": Object\.freeze\(\{ contentHash: "([a-f0-9]{64})", mask: Object\.freeze\(\{ width: (\d+), height: (\d+), rowWords: Object\.freeze\(\[([^\]]+)\]\) \}\) \}\)/
  );
  assert.ok(entry, 'Abyssal Octarch generated collision-mask entry is missing.');
  const rowWords = entry[4].split(',').map((value) => Number(value.trim()));
  assert.equal(entry[1], 'a9fc10f01d3d6abcb51ff00b8be1a2b6ead7c02b10e7ee697369b2c1c1b7854d');
  assert.equal(Number(entry[2]), 64);
  assert.equal(Number(entry[3]), 64);
  assert.equal(rowWords.length, 128);
  assert.ok(rowWords.some((value) => value !== 0));
  assert.ok(rowWords.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));
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

test('Prism Moth catalog pins its neutral, modular atlas, and canonical reference', () => {
  const definitions = PROTOTYPE_ASSET_DEFINITIONS
    .filter((asset) => asset.prototypeId === 'prism-moth-broodkeeper')
    .map(({ variant, fileName, sha256, width, height, maxBytes, route }) => ({
      variant,
      fileName,
      sha256,
      width,
      height,
      maxBytes,
      route
    }));

  assert.deepEqual(definitions, [
    {
      variant: 'assembled',
      fileName: 'prism-moth-broodkeeper/prism-moth-broodkeeper-neutral.png',
      sha256: 'cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39',
      width: 512,
      height: 512,
      maxBytes: 2_500_000,
      route: '/api/v1/prototype-assets/prism-moth-broodkeeper/cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39/assembled.png'
    },
    {
      variant: 'sheet',
      fileName: 'prism-moth-broodkeeper/prism-moth-broodkeeper-atlas.png',
      sha256: '5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292',
      width: 2048,
      height: 2048,
      maxBytes: 2_500_000,
      route: '/api/v1/prototype-assets/prism-moth-broodkeeper/5ef8ca7e395c94b3777d4f85808b5701f8bc952d96a335438e8353dcc82b6292/sheet.png'
    },
    {
      variant: 'reference',
      fileName: 'prism-moth-broodkeeper/source/prism-moth-canonical-reference.png',
      sha256: 'b006c73ab1b027d5dce5ac2dc5cf841a2b2e30a202da264b91c00f8f93b77ade',
      width: 384,
      height: 384,
      maxBytes: 2_500_000,
      route: '/api/v1/prototype-assets/prism-moth-broodkeeper/b006c73ab1b027d5dce5ac2dc5cf841a2b2e30a202da264b91c00f8f93b77ade/reference.png'
    }
  ]);
});

test('Prism Moth generated collision mask is bound to the assembled-neutral hash', () => {
  const generatedSource = readFileSync(
    path.join(
      repositoryRoot,
      'director',
      'src',
      'tools',
      'bosses',
      'generatedSandboxBossCollisionMasks.ts'
    ),
    'utf8'
  );
  const entry = generatedSource.match(
    /"prism-moth-brood": Object\.freeze\(\{ contentHash: "([a-f0-9]{64})", mask: Object\.freeze\(\{ width: (\d+), height: (\d+), rowWords: Object\.freeze\(\[([^\]]+)\]\) \}\) \}\)/
  );
  assert.ok(entry, 'Prism Moth generated collision-mask entry is missing.');
  const rowWords = entry[4].split(',').map((value) => Number(value.trim()));
  assert.equal(entry[1], 'cd0381398cbfb5003822f126192dc0d18af3fe874eff11defec9d57202109f39');
  assert.equal(Number(entry[2]), 64);
  assert.equal(Number(entry[3]), 64);
  assert.equal(rowWords.length, 128);
  assert.ok(rowWords.some((value) => value !== 0));
  assert.ok(rowWords.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));
});

test('Umbra Needlewing catalog pins its neutral, lifecycle atlas, and locked reference', () => {
  const definitions = PROTOTYPE_ASSET_DEFINITIONS
    .filter((asset) => asset.prototypeId === 'umbra-needlewing')
    .map(({ variant, fileName, sha256, width, height }) => ({
      variant,
      fileName,
      sha256,
      width,
      height
    }));

  assert.deepEqual(definitions, [
    {
      variant: 'assembled',
      fileName: 'umbra-needlewing/umbra-needlewing-neutral.png',
      sha256: 'a1635e616add1b99336c366bc51499311f130ce62fbecd8d4a8956e1c9b2aba2',
      width: 512,
      height: 320
    },
    {
      variant: 'sheet',
      fileName: 'umbra-needlewing/umbra-needlewing-atlas.png',
      sha256: 'c98290efd065277225b9d64bbcf06f23e5013cd29ca9ae501f404c18750321d1',
      width: 2048,
      height: 1024
    },
    {
      variant: 'reference',
      fileName: 'umbra-needlewing/umbra-needlewing-reference.png',
      sha256: '2db71f4a183415e9851be2363b2224b8d7912e272922b55c7cfb8c1043e0ac21',
      width: 1511,
      height: 1041
    }
  ]);
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

  assert.equal(PROTOTYPE_ASSET_DEFINITIONS.length, 33);
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
