const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const serverModulePath = path.resolve(__dirname, '..', 'tools', 'scicon-sprite-gallery-server.mjs');

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+2Q0qWQAAAABJRU5ErkJggg==',
  'base64',
);

test('gallery delete service protects in-game sprites and deletes confirmed files', async (t) => {
  const { createGalleryServer } = await import(pathToFileURL(serverModulePath));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scicon-gallery-delete-'));
  const projectArtRoot = path.join(root, 'project-art');
  const projectPrototypeArtRoot = path.join(root, 'project-prototype-art');
  const projectAudioRoot = path.join(root, 'project-audio');
  const legacyRoot = path.join(root, 'legacy');
  fs.mkdirSync(projectArtRoot, { recursive: true });
  fs.mkdirSync(projectPrototypeArtRoot, { recursive: true });
  fs.mkdirSync(projectAudioRoot, { recursive: true });
  fs.mkdirSync(legacyRoot, { recursive: true });

  const unusedPath = path.join(projectArtRoot, 'unused.png');
  const usedPath = path.join(projectArtRoot, 'used.png');
  const prototypePath = path.join(projectPrototypeArtRoot, 'test-boss-sheet.png');
  fs.writeFileSync(unusedPath, onePixelPng);
  fs.writeFileSync(usedPath, onePixelPng);
  fs.writeFileSync(prototypePath, onePixelPng);

  const assets = [
    { name: 'unused.png', absolutePath: unusedPath, inGame: false, usageLocations: [] },
    { name: 'used.png', absolutePath: usedPath, inGame: true, usageLocations: ['services/game.ts:12'] },
    { name: 'test-boss-sheet.png', absolutePath: prototypePath, inGame: false, usageLocations: [] },
  ];
  const galleryPath = path.join(root, 'gallery.html');
  fs.writeFileSync(galleryPath, `const assets = ${JSON.stringify(assets)};\nconst sounds = [];\n`);

  const deleted = [];
  const service = createGalleryServer({
    port: 0,
    galleryPath,
    projectArtRoot,
    projectPrototypeArtRoot,
    projectAudioRoot,
    legacyRoot,
    deleteFile(filePath) {
      deleted.push(filePath);
      fs.unlinkSync(filePath);
    },
  });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => service.server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const port = service.server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const getFile = (absolutePath) => fetch(
    `${origin}/api/file?path=${encodeURIComponent(absolutePath)}`,
  );
  const postDelete = (absolutePath, confirmInGame) => fetch(`${origin}/api/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ absolutePath, confirmInGame }),
  });

  const prototypePreview = await getFile(prototypePath);
  assert.equal(prototypePreview.status, 200);
  assert.equal(prototypePreview.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await prototypePreview.arrayBuffer()), onePixelPng);

  const blocked = await postDelete(usedPath, false);
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).requiresConfirmation, true);
  assert.equal(fs.existsSync(usedPath), true);

  const confirmed = await postDelete(usedPath, true);
  assert.equal(confirmed.status, 200);
  assert.equal(fs.existsSync(usedPath), false);

  const ordinary = await postDelete(unusedPath, false);
  assert.equal(ordinary.status, 200);
  assert.equal(fs.existsSync(unusedPath), false);

  const prototype = await postDelete(prototypePath, false);
  assert.equal(prototype.status, 403);
  assert.equal(fs.existsSync(prototypePath), true);

  assert.deepEqual(deleted, [usedPath, unusedPath]);
  const updatedGallery = fs.readFileSync(galleryPath, 'utf8');
  assert.match(updatedGallery, /test-boss-sheet\.png/);
  assert.doesNotMatch(updatedGallery, /unused\.png|used\.png/);
});

test('gallery delete service rejects paths outside its catalog and allowed roots', async (t) => {
  const { createGalleryServer } = await import(pathToFileURL(serverModulePath));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scicon-gallery-boundary-'));
  const projectArtRoot = path.join(root, 'project-art');
  const projectPrototypeArtRoot = path.join(root, 'project-prototype-art');
  const projectAudioRoot = path.join(root, 'project-audio');
  const legacyRoot = path.join(root, 'legacy');
  fs.mkdirSync(projectArtRoot, { recursive: true });
  fs.mkdirSync(projectPrototypeArtRoot, { recursive: true });
  fs.mkdirSync(projectAudioRoot, { recursive: true });
  fs.mkdirSync(legacyRoot, { recursive: true });
  const unlistedPrototypePath = path.join(projectPrototypeArtRoot, 'unlisted.png');
  const outsidePrototypeRoot = path.join(root, 'project-prototype-art-outside');
  const outsidePrototypePath = path.join(outsidePrototypeRoot, 'cataloged-outside.png');
  fs.mkdirSync(outsidePrototypeRoot, { recursive: true });
  fs.writeFileSync(unlistedPrototypePath, onePixelPng);
  fs.writeFileSync(outsidePrototypePath, onePixelPng);
  const galleryPath = path.join(root, 'gallery.html');
  fs.writeFileSync(
    galleryPath,
    `const assets = ${JSON.stringify([
      {
        name: 'cataloged-outside.png',
        absolutePath: outsidePrototypePath,
        inGame: false,
        usageLocations: [],
      },
    ])};\nconst sounds = [];\n`,
  );

  const deleted = [];
  const service = createGalleryServer({
    port: 0,
    galleryPath,
    projectArtRoot,
    projectPrototypeArtRoot,
    projectAudioRoot,
    legacyRoot,
    deleteFile(filePath) {
      deleted.push(filePath);
    },
  });
  await new Promise((resolve) => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => service.server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const port = service.server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  const getFile = (absolutePath) => fetch(
    `${origin}/api/file?path=${encodeURIComponent(absolutePath)}`,
  );
  const postDelete = (absolutePath) => fetch(`${origin}/api/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ absolutePath, confirmInGame: true }),
  });

  const unlistedPreview = await getFile(unlistedPrototypePath);
  assert.equal(unlistedPreview.status, 403);
  const unlistedDelete = await postDelete(unlistedPrototypePath);
  assert.equal(unlistedDelete.status, 403);

  const outsidePreview = await getFile(outsidePrototypePath);
  assert.equal(outsidePreview.status, 403);
  const outsideDelete = await postDelete(outsidePrototypePath);
  assert.equal(outsideDelete.status, 403);

  assert.deepEqual(deleted, []);
  assert.equal(fs.existsSync(unlistedPrototypePath), true);
  assert.equal(fs.existsSync(outsidePrototypePath), true);
});
