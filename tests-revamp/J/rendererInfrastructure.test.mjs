import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after } from 'node:test';

globalThis.navigator ??= { userAgent: 'node-test' };
// Only shader capability discovery is mocked; Graphics, filters and cache
// ownership are real Pixi objects. Browser captures verify actual raster output.
globalThis.document = { createElement: () => ({ getContext: () => ({ isContextLost: () => false, getShaderPrecisionFormat: () => ({ precision: 23 }) }) }) };
const result = await build({
  stdin: { contents: `
    export * from './services/revamp/performance/RendererBudget';
    export * from './services/revamp/performance/EntityPresentationBudget';
    export * from './services/revamp/performance/BackgroundTextureCache';
    export * from './services/revamp/performance/HitFlashTextureCache';
    export * from './services/revamp/performance/BackgroundQuad';
    export { EntityType } from './types';
    export { Graphics, Sprite, Texture } from 'pixi.js';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent'
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-J-infra-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), result.outputFiles[0].text);
const { renderResolution, configureRenderBudget, MAX_BATCH_TEXTURES, isTransientOutsideViewport, syncPixelParticle, visibleBackgroundDetail, BackgroundTextureCache, backgroundGradeMatrix, canBakeBackgroundGrade, HitFlashTextureCache, createBackgroundQuad, EntityType, Graphics, Sprite, Texture } = await import(pathToFileURL(join(directory, 'bundle.mjs')));

test('pixel resolution caps high DPR; batch budget respects lower hardware limits', () => {
  assert.deepEqual([1, 2, 3, NaN].map(renderResolution), [1, 2, 2, 1]);
  for (const limit of [2, 8, 32]) {
    const renderer = { limits: { maxBatchableTextures: limit, maxTextures: limit } };
    configureRenderBudget(renderer);
    assert.equal(renderer.limits.maxBatchableTextures, Math.min(limit, MAX_BATCH_TEXTURES));
    assert.equal(renderer.limits.maxTextures, limit);
  }
});

test('culling includes wakes and camera zoom; beams/telegraphs/enemies always remain eligible', () => {
  const camera = { scale: 1, offsetX: 0, offsetY: 0 };
  const entity = { type: EntityType.PROJECTILE, x: 200, y: -50, width: 8, height: 20 };
  const before = structuredClone(entity);
  assert.equal(isTransientOutsideViewport(entity, 390, 844, camera), false);
  assert.equal(isTransientOutsideViewport({ ...entity, y: -200 }, 390, 844, camera), true);
  assert.equal(isTransientOutsideViewport({ ...entity, y: -200 }, 390, 844, { ...camera, offsetY: 220 }), false);
  assert.equal(isTransientOutsideViewport({ ...entity, x: 500, y: 400 }, 390, 844, { ...camera, scale: 0.5 }), false);
  for (const flag of ['isBeam', 'isTelegraph']) assert.equal(isTransientOutsideViewport({ ...entity, y: -900, [flag]: true }, 390, 844, camera), false);
  assert.equal(isTransientOutsideViewport({ ...entity, type: EntityType.BOSS, y: -900 }, 390, 844, camera), false);
  assert.deepEqual(entity, before, 'presentation never changes entity state');
});

test('pixel particles use a shared sprite quad and preserve exact rectangle/opacity', () => {
  const view = { sprite: new Sprite(), body: new Graphics().rect(0, 0, 5, 5).fill(0xffffff) };
  const entity = { width: 4, height: 6, color: '#67e8f9', life: 5, maxLife: 10 };
  syncPixelParticle(view, entity);
  assert.equal(view.sprite.texture, Texture.WHITE);
  assert.equal(view.sprite.width, 4); assert.equal(view.sprite.height, 6);
  assert.equal(view.sprite.alpha, 0.5); assert.equal(view.sprite.anchor.x, 0.5);
  view.body.clear = () => { throw Error('unchanged particle must not clear'); };
  syncPixelParticle(view, { ...entity, life: 2 });
  assert.equal(view.sprite.alpha, 0.2);
  view.body.destroy(); view.sprite.destroy();
});

test('every tier keeps base and near stars; authored two-plane landmarks survive Low', () => {
  for (const scale of [1, 0.75, 0.5]) {
    for (const index of [0, 4]) assert.equal(visibleBackgroundDetail(index, scale), true);
  }
  assert.equal(visibleBackgroundDetail(2, 0.75), true);
  assert.equal(visibleBackgroundDetail(2, 0.5), false);
  assert.equal(visibleBackgroundDetail(1, 1), true);
  assert.equal(visibleBackgroundDetail(1, 0.5), false);
  assert.equal(visibleBackgroundDetail(3, 0.75), false);
  assert.equal(visibleBackgroundDetail(1, 0.5, 2), true, 'two-plane Breakwater landmarks are mandatory');
});

test('background softness bakes once per viewport and releases only derived textures', () => {
  const calls = [];
  let destroyed = 0;
  const renderer = { resolution: 2, generateTexture(options) { calls.push({ frame: options.frame.clone(), resolution: options.resolution, tiles: options.target.children.length }); return { destroy(deep) { assert.equal(deep, true); destroyed++; } }; } };
  const cache = new BackgroundTextureCache(() => renderer);
  const source = Texture.WHITE;
  assert.equal(cache.get(source, 400, 800, 0), source);
  assert.equal(cache.get(source, 400, 800, 0.55), cache.get(source, 400, 800, 0.55));
  assert.equal(calls.length, 1); assert.equal(calls[0].tiles, 3);
  assert.equal(calls[0].resolution, 2);
  cache.get(source, 500, 1000, 0.55); assert.equal(calls.length, 2);
  cache.clear(); assert.equal(destroyed, 2); assert.equal(source.destroyed, false);
});

test('hit silhouettes reuse alpha geometry, preserve orig bounds and free cached textures', () => {
  let calls = 0; let destroyed = 0;
  const cache = new HitFlashTextureCache(() => ({ generateTexture(options) {
    calls++;
    assert.equal(options.frame.width, Texture.WHITE.orig.width);
    assert.equal(options.target.filters[0].matrix[18], 1);
    return { destroy() { destroyed++; } };
  } }));
  assert.equal(cache.get(Texture.WHITE), cache.get(Texture.WHITE));
  assert.equal(calls, 1); cache.destroy(); assert.equal(destroyed, 1);
  assert.equal(Texture.WHITE.destroyed, false);
});

test('full-plane quads use the single-texture path and dispose their geometry only', () => {
  const quad = createBackgroundQuad();
  assert.equal(quad.batched, false);
  assert.deepEqual([...quad.geometry.uvs], [0, 0, 1, 0, 1, 1, 0, 1]);
  quad.width = 390; quad.height = 844;
  assert.equal(quad.width, 390); assert.equal(quad.height, 844);
  const geometry = quad.geometry;
  quad.destroy();
  assert.equal(geometry.buffers, null);
  assert.equal(Texture.WHITE.destroyed, false);
});

test('baked grade matches the original overlay through transparent layers and source holes', () => {
  const over = (front, back) => {
    const alpha = front[3] + back[3] * (1 - front[3]);
    return [...front.slice(0, 3).map((color, i) => (color * front[3] + back[i] * back[3] * (1 - front[3])) / alpha), alpha];
  };
  const apply = (matrix, rgba) => [0, 1, 2, 3].map(row => matrix[row * 5 + 4] + rgba.reduce((total, value, column) => total + matrix[row * 5 + column] * value, 0));
  const clear = [2 / 255, 6 / 255, 23 / 255, 1];
  for (const tint of [0, 0xffffff, 0x123456, 0x623079]) {
    for (const grade of [0, 0.03, 0.12, 0.4, 1]) {
      const matrix = backgroundGradeMatrix(tint, grade);
      for (const alpha of [0, 0.02, 0.35, 1]) {
        const base = over([0.5, 0.2, 0.8, alpha], clear);
        const planes = [[0.8, 0.1, 0.6, 0.1], [0.1, 0.6, 0.9, alpha], [0.7, 1, 0.2, 0.22]];
        const original = over([(tint >> 16 & 255) / 255, (tint >> 8 & 255) / 255, (tint & 255) / 255, grade], planes.reduce((back, front) => over(front, back), base));
        const baked = planes.reduce((back, front) => {
          const graded = apply(matrix, front);
          assert.equal(graded[3], front[3], 'grading preserves each plane alpha');
          return over(graded, back);
        }, apply(matrix, base));
        original.forEach((value, i) => assert.ok(Math.abs(value - baked[i]) < 1e-12));
      }
    }
  }
  assert.equal(canBakeBackgroundGrade({ alpha: 1, coverViewport: true }), true);
  for (const base of [undefined, { alpha: 0.9, coverViewport: true }, { alpha: 1 }, { alpha: 1, coverViewport: false }]) {
    assert.equal(canBakeBackgroundGrade(base), false, 'unsupported/ground profiles retain the overlay');
  }
});

test('grade/underlay keys invalidate once; temporary filters and derived textures have bounded ownership', () => {
  const calls = [];
  let destroyedTextures = 0, destroyedFilters = 0;
  const renderer = { resolution: 2, generateTexture({ target }) {
    const nested = target.children.find(child => child.filters?.length);
    const filters = [...(target.filters ?? []), ...(nested?.filters ?? [])];
    const matrices = filters.filter(filter => filter.matrix).map(filter => [...filter.matrix]);
    for (const filter of filters) {
      const destroy = filter.destroy.bind(filter);
      filter.destroy = () => { destroyedFilters++; destroy(); };
    }
    calls.push({ target, filters, matrices, underlay: nested ? target.children[0].tint : undefined });
    return { destroy(deep) { assert.equal(deep, true); destroyedTextures++; } };
  } };
  const cache = new BackgroundTextureCache(() => renderer);
  const source = Texture.WHITE;
  const first = cache.get(source, 390, 844, 0.55, '#123456', 0.12);
  assert.equal(cache.get(source, 390, 844, 0.55, 0x123456, 0.12), first, 'equivalent tint encodings share a bake');
  assert.equal(calls.length, 1); assert.equal(calls[0].filters.length, 2);
  assert.equal(calls[0].filters[1].resolution, 'inherit', 'grading cannot downsample crisp source art to 1x');
  assert.deepEqual(calls[0].matrices[0], backgroundGradeMatrix(0x123456, 0.12));
  assert.equal(calls[0].target.destroyed, true); assert.equal(destroyedFilters, 2);
  cache.get(source, 390, 844, 0.55, 0x654321, 0.12);
  cache.get(source, 390, 844, 0.55, 0x654321, 0.2);
  cache.get(source, 390, 844, 0.55, 0x654321, 0.2, 0x020617);
  assert.equal(calls.length, 4);
  assert.equal(calls[3].underlay, 0x020617, 'opaque base reproduces the renderer clear behind source alpha');
  assert.equal(destroyedFilters, 8);
  cache.clear(); cache.clear();
  assert.equal(destroyedTextures, 4); assert.equal(source.destroyed, false);
});
