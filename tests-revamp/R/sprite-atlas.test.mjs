import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
globalThis.navigator ??= { userAgent: 'node-test' };
const bundle = await build({ stdin: { contents: `export * from './services/revamp/theme/SpriteIdleAtlas';
 export { BufferImageSource, Sprite, Texture } from 'pixi.js';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20' });
const { SpriteIdleAtlas, BufferImageSource, Sprite, Texture } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const palette = [0x284455, 0x5894aa, 0xbbedff];
const pixels = { width: 8, height: 8, pixels: Uint8Array.from({ length: 256 }, (_, i) => i % 4 === 3 ? 255 : i % 4 === 0 ? 45 : 180) };
function fixture() {
  const contexts = new Set(), calls = [];
  const renderer = { runners: { contextChange: { add(x) { contexts.add(x); }, remove(x) { contexts.delete(x); } } }, render(x) { calls.push(x); } };
  const source = new Texture({ source: new BufferImageSource({ width: 32, height: 32, resource: new Uint8Array(4096), scaleMode: 'nearest' }) });
  let reads = 0;
  const atlas = new SpriteIdleAtlas(renderer, palette, () => { reads++; return pixels; });
  return { atlas, source, renderer, contexts, calls, reads: () => reads };
}

test('prepares a loaded pose once, four nearest frames share one atlas and retain original dimensions', () => {
  const { atlas, source, calls, reads } = fixture();
  assert.equal(atlas.request('enemy:one', source, 'enemy', true), null);
  atlas.prepareNext();
  const entry = atlas.request('enemy:one', source, 'enemy', true);
  assert.equal(entry.frames.length, 4); assert.ok(entry.outline);
  assert.equal(new Set(entry.frames.map(frame => frame.source)).size, 1);
  const sprite = new Sprite(entry.frames[0]);
  assert.equal(sprite.width, source.width); assert.equal(sprite.height, source.height);
  assert.equal(entry.frames[0].frame.width, 8); assert.equal(entry.frames[0].source.scaleMode, 'nearest');
  const copies = calls.length;
  for (let i = 0; i < 100; i++) { atlas.prepareNext(); assert.equal(atlas.request('enemy:one', source, 'enemy', true), entry); }
  assert.equal(reads(), 1); assert.equal(calls.length, copies);
  assert.ok(atlas.stats().allocatedBytes <= 16 * 1024 * 1024);
  sprite.destroy(); atlas.destroy(); assert.equal(source.destroyed, false); source.destroy(true);
});

test('context restoration rebinds current derived frames to CPU-backed pixels with intact logical bounds', () => {
  const { atlas, source, contexts } = fixture();
  atlas.request('player:one', source, 'player', false); atlas.prepareNext();
  const entry = atlas.request('player:one', source, 'player', false);
  const packedSource = entry.frames[0].source;
  for (const listener of contexts) listener.contextChange();
  assert.notEqual(entry.frames[0].source, packedSource);
  assert.ok(entry.frames[0].source.resource instanceof Uint8Array);
  assert.equal(entry.frames[0].orig.width, 32);
  assert.equal(entry.shimmer.length, 4); assert.equal(atlas.stats().disabled, true);
  atlas.destroy(); assert.equal(contexts.size, 0); source.destroy(true);
});

test('source mutation falls back and destroying a loaded source before atlas teardown is safe', () => {
  const { atlas, source } = fixture();
  atlas.request('enemy:one', source, 'enemy', false); atlas.prepareNext();
  source.source.update();
  assert.equal(atlas.request('enemy:one', source, 'enemy', false), null);
  source.destroy(true);
  assert.doesNotThrow(() => atlas.destroy()); assert.doesNotThrow(() => atlas.destroy());
});

test('player steering poses have a reserved cap and enemies have preparation priority', () => {
  const { atlas, source, reads } = fixture();
  for (let i = 0; i < 40; i++) atlas.request(`player:${i}`, source, 'player', false);
  atlas.request('enemy:urgent', source, 'enemy', true);
  assert.equal(atlas.stats().pending, 7);
  atlas.prepareNext();
  assert.ok(atlas.request('enemy:urgent', source, 'enemy', true));
  assert.equal(reads(), 1);
  for (let i = 0; i < 10; i++) atlas.prepareNext();
  assert.equal(atlas.stats().sets, 7);
  assert.equal(atlas.stats().frames, 28);
  atlas.destroy(); source.destroy(true);
});
