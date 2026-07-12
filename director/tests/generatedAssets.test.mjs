import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import pngjs from 'pngjs';
import {
  GeneratedAssetRepository,
  normalizeGeneratedAssetRequest,
  removeMagentaChroma
} from '../server/generatedAssetRepository.mjs';
import {
  DIRECTOR_CHROMA_KEY,
  DIRECTOR_IMAGE_MODEL,
  OPENAI_IMAGE_ENDPOINT,
  OpenAIImageGenerationClient,
  normalizeSpritePrompt
} from '../server/imageGenerationClient.mjs';
import { createDirectorRequestHandler } from '../server/localApi.mjs';

const { PNG } = pngjs;

const createSpriteSource = ({ includeChroma = true } = {}) => {
  const image = new PNG({ width: 16, height: 16 });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = ((y * image.width) + x) * 4;
      const subject = x >= 4 && x <= 11 && y >= 4 && y <= 11;
      image.data[offset] = subject ? 12 : includeChroma ? 255 : 10;
      image.data[offset + 1] = subject ? 210 : includeChroma ? 0 : 20;
      image.data[offset + 2] = subject ? 245 : includeChroma ? 255 : 30;
      image.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(image);
};

const createTemporaryRepository = async (t) => {
  const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'scicon-generated-assets-'));
  await mkdir(path.join(repositoryRoot, 'game-config'), { recursive: true });
  t.after(() => rm(repositoryRoot, { force: true, recursive: true }));
  return {
    repositoryRoot,
    repository: new GeneratedAssetRepository({
      repositoryRoot,
      clock: () => new Date('2026-07-11T18:00:00.000Z')
    })
  };
};

const startApi = async (t, options) => {
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

const requestJson = async (port, pathname, { method = 'GET', body, mutationHeaders = true } = {}) => (
  new Promise((resolve, reject) => {
    const encoded = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = {
      Host: `127.0.0.1:${port}`,
      Accept: 'application/json'
    };
    if (encoded) {
      headers.Origin = `http://127.0.0.1:${port}`;
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = encoded.length;
      if (mutationHeaders) headers['X-Scicon-Director'] = 'local';
    }
    const request = httpRequest({ hostname: '127.0.0.1', port, path: pathname, method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    request.on('error', reject);
    if (encoded) request.write(encoded);
    request.end();
  })
);

test('sprite prompts add a flat removable backdrop without changing the user request', () => {
  const result = normalizeSpritePrompt({
    prompt: 'a biohazard reactor bomb with a strong silhouette',
    label: 'Biohazard bomb',
    role: 'hud'
  });
  assert.match(result, /biohazard reactor bomb/);
  assert.match(result, new RegExp(DIRECTOR_CHROMA_KEY, 'i'));
  assert.match(result, /one uniform/i);
  assert.match(result, /no shadows/i);
  assert.match(result, /do not use #ff00ff anywhere in the subject/i);
});

test('OpenAI image client fixes the endpoint and model server-side and returns only decoded image data', async () => {
  const source = createSpriteSource();
  let outbound;
  const client = new OpenAIImageGenerationClient({
    apiKey: 'test-secret-key',
    fetchImpl: async (url, options) => {
      outbound = { url, options };
      return new Response(JSON.stringify({ data: [{ b64_json: source.toString('base64') }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  });

  assert.deepEqual(client.getPublicStatus(), {
    available: true,
    model: DIRECTOR_IMAGE_MODEL,
    backgroundRemoval: 'local-chroma-key'
  });
  assert.doesNotMatch(JSON.stringify(client.getPublicStatus()), /test-secret-key/);
  const generated = await client.generateSprite({ prompt: 'biohazard bomb', label: 'Biohazard bomb', role: 'hud' });
  assert.equal(outbound.url, OPENAI_IMAGE_ENDPOINT);
  assert.equal(outbound.options.method, 'POST');
  assert.equal(outbound.options.redirect, 'error');
  assert.equal(outbound.options.headers.Authorization, 'Bearer test-secret-key');
  const requestBody = JSON.parse(outbound.options.body);
  assert.deepEqual({
    model: requestBody.model,
    size: requestBody.size,
    quality: requestBody.quality,
    output_format: requestBody.output_format
  }, {
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'high',
    output_format: 'png'
  });
  assert.ok(generated.png.equals(source));
  assert.doesNotMatch(JSON.stringify({ model: generated.model, prompt: generated.normalizedPrompt }), /test-secret-key/);
});

test('request validation rejects unsupported roles and fields before generation', () => {
  assert.deepEqual(normalizeGeneratedAssetRequest({
    prompt: ' hostile drone ',
    label: ' Drone ',
    role: 'ENEMY'
  }), { prompt: 'hostile drone', label: 'Drone', role: 'enemy' });
  assert.equal(normalizeGeneratedAssetRequest({
    prompt: 'hostile drone',
    label: 'D'.repeat(80),
    role: 'enemy'
  }).label.length, 80);
  assert.throws(() => normalizeGeneratedAssetRequest({
    prompt: 'hostile drone',
    label: 'D'.repeat(81),
    role: 'enemy'
  }), (error) => error.errors.some((item) => /between 1 and 80 characters/.test(item)));
  assert.throws(() => normalizeGeneratedAssetRequest({
    prompt: 'hostile drone',
    label: 'Drone',
    role: 'powerup'
  }), (error) => error.errors.some((item) => /role must be one of/.test(item)));
  assert.throws(() => normalizeGeneratedAssetRequest({
    prompt: 'hostile drone',
    label: 'Drone',
    role: 'enemy',
    path: '../../escape.png'
  }), (error) => error.errors.some((item) => /unsupported fields/.test(item)));
});

test('chroma removal requires both a transparent backdrop and a visible subject', () => {
  const converted = removeMagentaChroma(createSpriteSource());
  const image = PNG.sync.read(converted.png);
  assert.equal(image.data[3], 0);
  const centerOffset = ((8 * image.width) + 8) * 4;
  assert.ok(image.data[centerOffset + 3] > 240);
  assert.throws(
    () => removeMagentaChroma(createSpriteSource({ includeChroma: false })),
    (error) => error.errors.some((item) => /removable flat #ff00ff/.test(item))
  );
});

test('generated assets are immutable, content-hashed, deduplicated, and keep prompts out of the tracked manifest', async (t) => {
  const { repositoryRoot, repository } = await createTemporaryRepository(t);
  const request = { prompt: 'a crystalline hostile drone', label: 'Crystal Drone', role: 'enemy' };
  const first = await repository.createAsset({
    request,
    sourcePng: createSpriteSource(),
    model: 'gpt-image-2',
    normalizedPrompt: 'normalized private prompt'
  });
  assert.equal(first.created, true);
  assert.match(first.asset.id, /^GENERATED_ENEMY_[A-F0-9]{12}$/);
  assert.match(first.asset.path, /^\/game-art\/generated\/crystal-drone-[a-f0-9]{12}\.png$/);
  assert.match(first.asset.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.asset.roles, ['enemy', 'scorecard']);

  const assetFile = path.join(repositoryRoot, 'public', 'game-art', 'generated', path.basename(first.asset.path));
  const written = await readFile(assetFile);
  assert.equal(createHash('sha256').update(written).digest('hex'), first.asset.sha256);
  const output = PNG.sync.read(written);
  assert.equal(output.data[3], 0);

  const manifestText = await readFile(path.join(repositoryRoot, 'game-config', 'generated-assets.json'), 'utf8');
  assert.doesNotMatch(manifestText, /crystalline|normalized private prompt|gpt-image-2/);
  const manifest = JSON.parse(manifestText);
  assert.deepEqual(manifest.assets, [first.asset]);

  const sidecar = await readFile(path.join(repositoryRoot, 'director-data', 'generated-assets', `${first.asset.id}.json`), 'utf8');
  assert.match(sidecar, /crystalline hostile drone/);
  assert.match(sidecar, /normalized private prompt/);

  const duplicate = await repository.createAsset({
    request,
    sourcePng: createSpriteSource(),
    model: 'gpt-image-2',
    normalizedPrompt: 'normalized private prompt'
  });
  assert.equal(duplicate.created, false);
  assert.deepEqual(duplicate.asset, first.asset);
  assert.equal((await repository.listAssets()).length, 1);
});

test('local generated-asset API reports missing configuration without exposing secrets or calling a provider', async (t) => {
  const { repository } = await createTemporaryRepository(t);
  const imageClient = new OpenAIImageGenerationClient({ apiKey: '' });
  const port = await startApi(t, { generatedAssetRepository: repository, imageGenerationClient: imageClient });
  const listing = await requestJson(port, '/__director/api/generated-assets');
  assert.equal(listing.status, 200);
  assert.equal(listing.body.generator.available, false);
  assert.deepEqual(listing.body.assets, []);

  const response = await requestJson(port, '/__director/api/generated-assets', {
    method: 'POST',
    body: { prompt: 'biohazard bomb', label: 'Biohazard bomb', role: 'hud' }
  });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /OPENAI_API_KEY/);
  assert.doesNotMatch(JSON.stringify(response.body), /Bearer|sk-/);
});

test('local generated-asset API validates before generation and persists only a sanitized response', async (t) => {
  const { repositoryRoot, repository } = await createTemporaryRepository(t);
  let generationCalls = 0;
  const imageClient = {
    isConfigured: () => true,
    getPublicStatus: () => ({ available: true, model: 'gpt-image-2', backgroundRemoval: 'local-chroma-key' }),
    generateSprite: async (request) => {
      generationCalls += 1;
      return { png: createSpriteSource(), model: 'gpt-image-2', normalizedPrompt: `private ${request.prompt}` };
    }
  };
  const port = await startApi(t, { generatedAssetRepository: repository, imageGenerationClient: imageClient });

  const invalid = await requestJson(port, '/__director/api/generated-assets', {
    method: 'POST',
    body: { prompt: 'boss', label: 'Boss', role: 'unknown' }
  });
  assert.equal(invalid.status, 422);
  assert.equal(generationCalls, 0);

  const created = await requestJson(port, '/__director/api/generated-assets', {
    method: 'POST',
    body: { prompt: 'a luminous gatekeeper', label: 'Luminous Gatekeeper', role: 'boss' }
  });
  assert.equal(created.status, 201);
  assert.equal(generationCalls, 1);
  assert.deepEqual(created.body.asset.roles, ['boss', 'scorecard']);
  assert.doesNotMatch(JSON.stringify(created.body), /a luminous gatekeeper|private|OPENAI_API_KEY/i);
  assert.equal((await repository.listAssets()).length, 1);
  assert.ok((await readFile(
    path.join(repositoryRoot, 'public', 'game-art', 'generated', path.basename(created.body.asset.path))
  )).length > 0);
});
