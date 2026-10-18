import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Real Pixi containers, textures, meshes, shaders and resource lifetimes. Only
// GPU rasterization is replaced; the browser gallery proves actual pixels.
globalThis.navigator ??= { userAgent: 'node-test' };
globalThis.document = { createElement: () => ({ getContext: () => ({ isContextLost: () => false, getShaderPrecisionFormat: () => ({ precision: 23 }) }) }) };
const mediaListeners = new Set();
globalThis.window = {
  location: { search: '' }, addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener: (_type, listener) => mediaListeners.add(listener) }),
};
const bundle = await build({
  stdin: {
    contents: `export { SectorBackdrop } from './services/revamp/backgrounds/SectorBackdrop';
      export { bakeNebula } from './services/revamp/backgrounds/pixelArt';
      export { Container, Texture, Shader } from 'pixi.js';`,
    resolveDir: process.cwd(), loader: 'ts',
  }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-N-runtime-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), bundle.outputFiles[0].text);
const { SectorBackdrop, bakeNebula, Container, Texture, Shader } = await import(pathToFileURL(join(directory, 'bundle.mjs')));
const campaign = JSON.parse(await readFile(new URL('../../game-config/campaign.json', import.meta.url), 'utf8'));

function fixture() {
  const calls = [], contexts = new Set();
  const renderer = {
    runners: { contextChange: { add(listener) { contexts.add(listener); }, remove(listener) { contexts.delete(listener); } } },
    render({ container, target, clear }) { calls.push({ original: container.texture, source: container.texture.source, target, targetSource: target.source, clear }); },
  };
  const parent = new Container(), preserved = new Container({ label: 'unrelated-art' });
  parent.addChild(preserved);
  const backdrop = new SectorBackdrop(parent, () => renderer);
  let missionId = campaign.sectors[0].missionIds[0];
  const runtime = { waveId: 'opening', wavePresentationRevision: 1, majorBossActive: false, stageHyperspeedStrength: 0 };
  const engine = {
    campaign, frameCount: 0, width: 390, height: 844,
    player: { x: 200, y: 700 }, gameActive: true,
    getCurrentLevelDefinition: () => campaign.levels.find(level => level.id === missionId),
    getRuntimeState: () => runtime,
  };
  return {
    calls, contexts, renderer, parent, preserved, backdrop, engine, runtime,
    mission(id) { missionId = id; },
    step(frames, quality = 1) { for (let i = 0; i < frames; i++) { engine.frameCount++; backdrop.update(engine, quality); } },
    restore() { for (const listener of [...contexts]) listener.contextChange(); },
    destroy() { backdrop.destroy(); parent.destroy({ children: true }); },
  };
}
const setReducedMotion = value => { for (const listener of mediaListeners) listener({ matches: value }); };
const allSprites = backdrop => backdrop.planes.flatMap(plane => plane.children);
const visibleCount = backdrop => allSprites(backdrop).filter(sprite => sprite.visible).length;

test('six retained planes and one small atlas do not allocate textures during animation or write game state', () => {
  const f = fixture();
  try {
    const simulation = JSON.stringify({ campaign: f.engine.campaign, player: f.engine.player, runtime: f.runtime });
    assert.equal(f.backdrop.update(f.engine, 1), true);
    const first = f.backdrop.snapshot(), objects = allSprites(f.backdrop), copies = f.calls.length;
    assert.equal(first.layers, 6);
    assert.ok(first.objects < 100);
    assert.equal(first.atlas.allocatedBytes, 4 * 1024 * 1024);
    assert.ok(first.atlas.sourceBytes < 1024 * 1024);
    assert.ok(first.atlas.entries > 0 && first.atlas.entries < 32);
    assert.equal(f.contexts.size, 1);
    f.step(1200);
    assert.equal(f.calls.length, copies, 'no noise baking or texture copying per frame');
    assert.deepEqual(allSprites(f.backdrop), objects, 'animation reuses every display object');
    assert.equal(JSON.stringify({ campaign: f.engine.campaign, player: f.engine.player, runtime: f.runtime }), simulation);
    const stopped = f.backdrop.snapshot().seconds;
    for (let i = 0; i < 10; i++) f.backdrop.update(f.engine, 1);
    assert.equal(f.backdrop.snapshot().seconds, stopped, 'a paused simulation does not advance cosmetic events');
    assert.equal(f.parent.children[0], f.preserved);
  } finally { f.destroy(); }
});

test('the opaque nebula preserves its native pixels and blend-free output while silhouettes stay blended', () => {
  const f = fixture();
  try {
    f.backdrop.update(f.engine, 1);
    const meshes = f.backdrop.nebula, texture = meshes[0].texture, source = texture.source;
    const expected = bakeNebula(f.backdrop.selection.theme, f.backdrop.layout.nebulae[0].seed);
    assert.deepEqual([source.width, source.height], [128, 256]);
    assert.equal(source.scaleMode, 'nearest');
    assert.equal(source.autoGenerateMipmaps, false);
    assert.deepEqual(source.resource, expected.pixels, 'all authored color bytes survive without an atlas blit');
    for (let i = 3; i < source.resource.length; i += 4) assert.equal(source.resource[i], 255, 'no destination color is needed for any base pixel');
    assert.equal(texture.textureMatrix.isSimple, true, 'native UVs cover only the nebula source');
    assert.ok(!f.calls.some(call => call.original === texture), 'the unbatched base is never copied into an atlas');
    assert.ok(f.calls.every(call => call.targetSource !== source));
    assert.equal(f.parent.groupBlendMode, 'normal');
    assert.ok(allSprites(f.backdrop).filter(sprite => !meshes.includes(sprite)).every(sprite => {
      for (let node = sprite; node; node = node.parent) {
        if (node.blendMode !== 'inherit') return node.blendMode === 'normal';
      }
      return f.parent.groupBlendMode === 'normal';
    }), 'transparent silhouettes keep normal alpha blending through their parent chain');
    f.step(180);
    const y = meshes[1].y, tint = meshes[1].tint;
    f.runtime.majorBossActive = true;
    f.step(60);
    assert.notEqual(meshes[1].y, y, 'the native plane keeps scrolling');
    assert.notEqual(meshes[1].tint, tint, 'boss color grading still animates');
    for (const mesh of meshes) {
      assert.equal(mesh.texture, texture);
      assert.equal(mesh.blendMode, 'none');
      assert.equal(mesh.alpha, 1);
    }
  } finally { f.destroy(); }
});

test('Low quality culls optional objects and keeps the same seeded primary landmark and world', () => {
  const f = fixture();
  try {
    f.backdrop.update(f.engine, 1);
    f.step(180);
    const high = f.backdrop.snapshot(), highVisible = visibleCount(f.backdrop), copies = f.calls.length;
    const signature = f.backdrop.landmarks[0];
    const position = { x: signature.sprite.x, y: signature.sprite.y };
    f.backdrop.update(f.engine, 0.5);
    assert.ok(visibleCount(f.backdrop) < highVisible);
    assert.equal(signature.sprite.visible, true);
    assert.deepEqual({ x: signature.sprite.x, y: signature.sprite.y }, position);
    assert.equal(f.backdrop.snapshot().seed, high.seed);
    assert.equal(f.backdrop.snapshot().objects, high.objects);
    assert.equal(f.backdrop.snapshot().seconds, high.seconds);
    assert.deepEqual([f.engine.width, f.engine.height], [390, 844]);
    f.backdrop.update(f.engine, 1);
    assert.equal(visibleCount(f.backdrop), highVisible);
    assert.equal(f.calls.length, copies);
  } finally { f.destroy(); }
});

test('mission replacement, restart and unknown fallback retire owned textures without touching other art', () => {
  const f = fixture();
  try {
    f.backdrop.update(f.engine, 1);
    const old = f.calls.slice();
    const oldNebula = f.backdrop.nebula[0].texture, oldNebulaSource = oldNebula.source;
    f.step(120);
    f.mission(campaign.sectors[0].missionIds[1]);
    assert.equal(f.backdrop.update(f.engine, 1), true);
    assert.equal(f.backdrop.snapshot().seconds, 0);
    for (const call of old) {
      assert.equal(call.original.destroyed, true); assert.equal(call.source.destroyed, true);
      assert.equal(call.target.destroyed, true); assert.equal(call.targetSource.destroyed, true);
    }
    assert.equal(oldNebula.destroyed, true);
    assert.equal(oldNebulaSource.destroyed, true, 'standalone source shares mission ownership with atlas sources');
    assert.equal(f.contexts.size, 1);
    assert.equal(f.preserved.destroyed, false);
    f.step(120);
    f.engine.frameCount = 0;
    f.backdrop.update(f.engine, 1);
    assert.equal(f.backdrop.snapshot().seconds, 0, 'restarting the same mission resets event timing');
    assert.equal(f.contexts.size, 1, 'replacement does not leak restoration listeners');
    f.mission('unmapped-weekly-scene');
    assert.equal(f.backdrop.update(f.engine, 1), false);
    assert.equal(f.backdrop.snapshot().themeId, null);
    assert.equal(f.backdrop.snapshot().objects, 0);
    assert.equal(f.backdrop.root.visible, false);
    assert.equal(f.contexts.size, 0);
    assert.equal(f.preserved.visible, true);
    assert.equal(f.preserved.destroyed, false);
    f.backdrop.destroy(); f.backdrop.destroy();
    assert.equal(f.parent.children.length, 1);
    assert.equal(Texture.WHITE.destroyed, false);
  } finally { f.destroy(); }
});

test('wave and boss entry produce edge-only warp and a smooth grade; reduced motion suppresses fast pieces', () => {
  const f = fixture();
  try {
    f.backdrop.update(f.engine, 1); f.step(180);
    assert.equal(f.backdrop.snapshot().warp, 0);
    f.runtime.waveId = 'second'; f.runtime.wavePresentationRevision++;
    f.backdrop.update(f.engine, 1); f.step(54);
    assert.ok(f.backdrop.snapshot().warp > 0.99);
    for (const star of f.backdrop.stars) if (star.sprite.height > 2) assert.ok(star.x < 0.16 || star.x > 0.84, 'streaks never enter the attack lane');
    f.runtime.majorBossActive = true;
    f.backdrop.update(f.engine, 1); f.step(30);
    assert.ok(f.backdrop.snapshot().bossGrade > 0 && f.backdrop.snapshot().bossGrade < 1);
    const before = f.backdrop.snapshot().bossGrade;
    f.step(30);
    assert.ok(f.backdrop.snapshot().bossGrade > before);
    f.step(220);
    assert.equal(f.backdrop.snapshot().event, 'capital-flyby');
    assert.equal(f.backdrop.flyby.visible, true);
    setReducedMotion(true);
    f.backdrop.update(f.engine, 1);
    assert.equal(f.backdrop.snapshot().reducedMotion, true);
    assert.equal(f.backdrop.snapshot().warp, 0);
    assert.equal(f.backdrop.flyby.visible, false);
    assert.ok(f.backdrop.gate.every(sprite => !sprite.visible));
    assert.ok(f.backdrop.shower.every(sprite => !sprite.visible));
    assert.ok(f.backdrop.battleBeams.every(sprite => !sprite.visible));
    assert.ok(f.backdrop.stars.every(star => star.sprite.height <= 2));
  } finally { setReducedMotion(false); f.destroy(); }
});

test('context restoration falls back to live CPU-backed originals without new baking or lost UVs', () => {
  const f = fixture();
  try {
    f.backdrop.update(f.engine, 1);
    const nebula = f.backdrop.nebula[0], nativeSource = nebula.texture.source;
    const landmark = f.backdrop.landmarks[0].sprite, packedSource = landmark.texture.source;
    const copies = f.calls.length, expected = f.calls[0].original;
    f.restore();
    assert.equal(nebula.texture.source, nativeSource, 'native CPU-backed pixels survive without atlas restoration');
    assert.notEqual(landmark.texture.source, packedSource);
    assert.equal(landmark.texture.source, expected.source);
    assert.deepEqual(landmark.texture.frame, expected.frame);
    f.step(1);
    assert.equal(f.calls.length, copies);
    assert.equal(f.backdrop.snapshot().atlas.disabled, true);
    for (const sprite of allSprites(f.backdrop)) {
      assert.equal(sprite.texture.destroyed, false);
      assert.equal(sprite.texture.source.destroyed, false);
    }
  } finally { f.destroy(); }
});

test('disposing native, atlas or restored sources detaches real Pixi shared mesh bindings before destruction', () => {
  for (const restored of [false, true]) for (const kind of ['native', 'atlas']) {
    const f = fixture();
    let shader;
    try {
      f.backdrop.update(f.engine, 1);
      if (restored) f.restore();
      const source = kind === 'native' ? f.backdrop.nebula[0].texture.source : f.backdrop.landmarks[0].sprite.texture.source;
      shader = new Shader({ resources: { uTexture: source, uSampler: source.style } });
      const group = shader.groups[99];
      f.renderer.renderPipes = { mesh: { _adaptor: { _shader: shader } } };
      f.mission(campaign.sectors[1].missionIds[0]);
      f.backdrop.update(f.engine, 1);
      assert.notEqual(group.resources, null, 'disposing bound art must preserve the shared shader resource group');
      assert.equal(shader.resources.uTexture, Texture.EMPTY.source);
      assert.equal(shader.resources.uSampler, Texture.EMPTY.source.style);
      assert.doesNotThrow(() => {
        shader.resources.uTexture = f.backdrop.nebula[0].texture.source;
        shader.resources.uSampler = f.backdrop.nebula[0].texture.source.style;
      }, 'a subsequent mission can bind its atlas');
      f.backdrop.destroy();
      assert.notEqual(group.resources, null, 'final destruction follows the same safe ownership rule');
    } finally { f.destroy(); shader?.destroy(); }
  }
});

test('QA snapshots are opt-in and one renderer cannot delete another renderer inspection bridge', () => {
  window.location.search = '';
  const ordinary = fixture();
  assert.equal(window.__sciconBackgroundQA, undefined);
  ordinary.destroy();
  window.location.search = '?qa=1';
  const first = fixture(), second = fixture();
  try {
    const bridge = window.__sciconBackgroundQA;
    first.destroy();
    assert.equal(window.__sciconBackgroundQA, bridge);
    second.backdrop.update(second.engine, 1);
    const snapshot = bridge.snapshot();
    snapshot.themeId = 'mutated-copy'; snapshot.atlas.entries = -1;
    assert.notEqual(bridge.snapshot().themeId, 'mutated-copy');
    assert.ok(bridge.snapshot().atlas.entries > 0);
    second.destroy();
    assert.equal(window.__sciconBackgroundQA, undefined);
  } finally { first.destroy(); second.destroy(); window.location.search = ''; }
});
