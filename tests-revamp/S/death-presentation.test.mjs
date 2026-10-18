import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
// Use real Pixi display objects, bounds, textures and ownership. Only GPU copies,
// the independently tested shader, and OS motion preferences use small facades.
const bundle = await build({
  stdin: { contents: `
    export * from './services/revamp/vfx/BossDeathPresentation';
    export * from './services/revamp/vfx/BossDeathSequence';
    export { setRenderQualityMode } from './services/revamp/performance/RenderQualitySettings';
    export { setSettings } from './services/revamp/feel/FeelSettings';
    export { Container, Graphics, Sprite, Texture, TextureSource, RenderTexture } from 'pixi.js';
  `, loader: 'ts', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'death-gpu-boundary', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)FeelSettings$/ }, () => ({ path: 'settings', namespace: 'death-test' }));
    builder.onResolve({ filter: /(?:^|\/)BossShockwave$/ }, () => ({ path: 'shockwave', namespace: 'death-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'death-test' }, args => ({ loader: 'js', contents: args.path === 'settings'
      ? `let settings = { reducedMotion: false, reduceScreenShake: false, showScoreNumbers: true };
         export const getFeelSettings = () => settings;
         export const setSettings = value => { settings = { reducedMotion: false, reduceScreenShake: false, showScoreNumbers: true, ...value }; };`
      : `export const BOSS_SHOCKWAVE_DURATION_MS = 360;
         export class BossShockwave {
           active = false; updates = []; destroyed = false;
           update(x, y, age, width, height, enabled) { this.updates.push({ x, y, age, width, height, enabled }); this.active = enabled && age >= 0 && age < 360; }
           disable() { this.active = false; }
           destroy() { this.disable(); this.destroyed = true; }
         }`
    }));
  } }]
});
const { BossDeathPresentation, playBossDeathSequence, setSettings, setRenderQualityMode,
  BOSS_DEATH_FINALE_MS, MINI_DEATH_FINALE_MS, BOSS_DEATH_DURATION_MS, MAX_BOSS_DEATHS,
  Container, Graphics, Sprite, Texture, TextureSource, RenderTexture } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const high = { tier: 'high', particleScale: 1, trailScale: 1, backgroundLayerScale: 1 };
const low = { tier: 'low', particleScale: 0.4, trailScale: 0.4, backgroundLayerScale: 0.5 };
const entity = (id = 'boss') => ({ id, x: 135, y: 205, width: 120, height: 90 });

function createView() {
  const root = new Container();
  root.position.set(195, 250); root.rotation = 0.23; root.scale.set(1.1, 0.9);
  const original = new Texture({ source: new TextureSource({ width: 120, height: 90 }) });
  const sprite = new Sprite(original); sprite.anchor.set(0.5); root.addChild(sprite);
  const decorations = Array.from({ length: 7 }, (_, i) => {
    const graphic = new Graphics().rect(-1000 - i, -1000, 20, 20).fill('#ffffff');
    graphic.visible = i % 2 === 0; root.addChild(graphic); return graphic;
  });
  const [aura, trail, flash, health, label, hitFlash, componentHealth] = decorations;
  return { root, original, sprite, decorations, aura, trail, flash, health, label, hitFlash,
    bossRig: { componentHealth } };
}

function fixture() {
  setSettings({}); setRenderQualityMode('high');
  const hullLayer = new Container(), overlay = new Container(), background = new Container();
  const listeners = new Set(), captures = [], bursts = [], views = new Map();
  const engine = { frameCount: 120, feel: { resetGeneration: 0 }, width: 390, height: 844,
    polishSettings: { screenShake: true },
    getEncounterCameraTransform: () => ({ scale: 0.8, offsetX: 10, offsetY: 20 }) };
  const renderer = {
    runners: { contextChange: { add: l => listeners.add(l), remove: l => listeners.delete(l) } },
    generateTexture(options) {
      const texture = RenderTexture.create({ width: options.frame.width, height: options.frame.height,
        resolution: options.resolution, ...options.textureSourceOptions });
      captures.push({ options, texture, source: texture.source,
        visible: options.target.visible,
        childrenVisible: options.target.children.map(child => child.visible) });
      return texture;
    }
  };
  const pool = { spawnPixelExplosion: (...args) => bursts.push(args) };
  const presentation = new BossDeathPresentation(pool, hullLayer, overlay, background, () => renderer);
  const sync = (ms, quality = high) => presentation.sync(engine, ms, quality, id => views.get(id));
  const queue = (id = 'boss', mini = false) => {
    const hull = entity(id), view = createView(); views.set(id, view);
    playBossDeathSequence(engine, hull, mini); return { hull, view };
  };
  const destroy = () => {
    presentation.destroy();
    for (const view of views.values()) {
      if (!view.root.destroyed) view.root.destroy({ children: true });
      view.original.destroy(true);
    }
    hullLayer.destroy({ children: true }); overlay.destroy({ children: true }); background.destroy({ children: true });
  };
  return { engine, renderer, listeners, captures, bursts, views, hullLayer, overlay, background,
    presentation, sync, queue, destroy };
}

test('capture reads the still-live rendered view, strips UI only for copying, and survives actor removal', () => {
  const f = fixture();
  try {
    const { view } = f.queue();
    view.root.visible = false;
    const visibility = view.decorations.map(item => item.visible);
    f.sync(1);
    assert.equal(f.captures.length, 1);
    const { options, visible, childrenVisible } = f.captures[0];
    assert.equal(options.target, view.root);
    assert.equal(visible, true);
    assert.equal(childrenVisible[0], true);
    assert.ok(childrenVisible.slice(1).every(flag => flag === false), 'HUD/flash/aura cannot enter the retained hull');
    assert.deepEqual([options.frame.x, options.frame.y, options.frame.width, options.frame.height], [-60, -45, 120, 90]);
    assert.equal(options.resolution, 1);
    assert.equal(options.textureSourceOptions.scaleMode, 'nearest');
    assert.equal(options.antialias, false);
    assert.equal(view.root.visible, false);
    assert.deepEqual(view.decorations.map(item => item.visible), visibility);
    const death = f.presentation.deaths[0];
    assert.equal(death.root.rotation, view.root.rotation);
    assert.equal(death.root.scale.x, view.root.scale.x);
    assert.equal(death.root.scale.y, view.root.scale.y);
    view.root.destroy({ children: true });
    f.sync(100);
    assert.equal(death.hull.visible, true);
    assert.equal(death.texture.destroyed, false);
    assert.equal(view.original.destroyed, false, 'snapshot never takes ownership of Scott\'s art');
  } finally { f.destroy(); }
});

test('High has six fragments and Low three, all slicing one snapshot source', () => {
  for (const [quality, count] of [[high, 6], [low, 3]]) {
    const f = fixture();
    try {
      f.queue(); f.sync(1, quality);
      const death = f.presentation.deaths[0];
      assert.equal(death.pieces.length, count);
      assert.ok(death.pieces.every(piece => piece.sprite.texture.source === death.texture.source));
      assert.ok(death.pieces.every(piece => !piece.sprite.visible && piece.sprite.roundPixels));
      const coveredArea = death.pieces.reduce((sum, piece) => sum + piece.sprite.texture.frame.width * piece.sprite.texture.frame.height, 0);
      assert.equal(coveredArea, death.texture.width * death.texture.height);
      assert.equal(f.captures.length, 1, 'fragmenting requires no repeated GPU copies');
    } finally { f.destroy(); }
  }
});

test('major and mini hulls remain visible until finale, then become drifting art fragments', () => {
  for (const mini of [false, true]) {
    const f = fixture();
    try {
      const finale = mini ? MINI_DEATH_FINALE_MS : BOSS_DEATH_FINALE_MS;
      f.queue('boss', mini); f.sync(1);
      const death = f.presentation.deaths[0];
      f.sync(finale - 2);
      assert.equal(death.hull.visible, true);
      assert.ok(death.pieces.every(piece => !piece.sprite.visible));
      f.sync(2);
      assert.equal(death.hull.visible, false);
      assert.ok(death.pieces.every(piece => piece.sprite.visible));
      assert.equal(f.bursts.filter(burst => burst[3] === 'mega').length, 1);
      const before = death.pieces.map(piece => [piece.sprite.x, piece.sprite.y]);
      f.sync(100);
      assert.ok(death.pieces.some((piece, index) => piece.sprite.x !== before[index][0] || piece.sprite.y !== before[index][1]));
      assert.ok(death.pieces.some(piece => piece.sprite.rotation !== 0));
      assert.equal(f.presentation.flash.visible, false, 'white pulse expires after 55ms');
    } finally { f.destroy(); }
  }
});

test('terminal IDs suppress duplicate presentation through completion but reset for replay', () => {
  const f = fixture();
  try {
    f.queue(); f.sync(1);
    assert.equal(f.presentation.hasHandled('boss'), true);
    playBossDeathSequence(f.engine, entity('boss'));
    f.sync(10);
    assert.equal(f.captures.length, 1);
    const death = f.presentation.deaths[0];
    const pieces = death.pieces.map(piece => piece.sprite.texture);
    const source = death.texture.source;
    f.sync(BOSS_DEATH_DURATION_MS);
    assert.equal(f.presentation.deaths.length, 0);
    assert.equal(f.presentation.hasHandled('boss'), true, 'legacy final receipt stays suppressed');
    assert.equal(source.destroyed, true);
    assert.ok(pieces.every(texture => texture.destroyed));
    f.engine.feel.resetGeneration++;
    f.sync(0);
    assert.equal(f.presentation.hasHandled('boss'), false);
    playBossDeathSequence(f.engine, entity('boss')); f.sync(1);
    assert.equal(f.captures.length, 2);
  } finally { f.destroy(); }
});

test('context restoration releases transient art without nested GPU work and disposal unregisters', () => {
  const f = fixture();
  try {
    f.queue(); f.sync(1);
    const source = f.captures[0].source;
    assert.equal(f.listeners.size, 1);
    for (const listener of [...f.listeners]) listener.contextChange();
    assert.equal(source.destroyed, true);
    assert.equal(f.presentation.deaths.length, 0);
    assert.equal(f.captures.length, 1);
    assert.equal(f.presentation.flash.visible, false);
    assert.deepEqual(f.presentation.cameraOffset, { x: 0, y: 0 });
    f.sync(16);
    assert.equal(f.captures.length, 1, 'restore cannot replay already consumed deaths');
  } finally { f.destroy(); }
  assert.equal(f.listeners.size, 0);
  assert.equal(f.presentation.shockwave.destroyed, true);
});

test('background-tab resume skips stale fireworks and flash while freeing finished hulls', () => {
  const f = fixture();
  try {
    f.queue(); f.sync(1);
    const emitted = f.bursts.length;
    f.sync(10000);
    assert.equal(f.bursts.length, emitted);
    assert.equal(f.presentation.flash.visible, false);
    assert.equal(f.presentation.shockwave.active, false);
    assert.equal(f.presentation.deaths.length, 0);
    assert.equal(f.captures[0].source.destroyed, true);
  } finally { f.destroy(); }
});

test('explicit High gates distortion, Auto/high and downshift remove it, and reduced motion removes shake and spin', () => {
  const f = fixture();
  try {
    f.queue(); f.sync(BOSS_DEATH_FINALE_MS + 1);
    assert.equal(f.presentation.shockwave.active, true);
    const call = f.presentation.shockwave.updates.at(-1);
    assert.equal(call.x, 195 * 0.8 + 10);
    assert.equal(call.y, 250 * 0.8 + 20);
    setRenderQualityMode('auto'); f.sync(16);
    assert.equal(f.presentation.shockwave.active, false, 'Auto high tier is not explicit High');
    setRenderQualityMode('high'); f.sync(16, low);
    assert.equal(f.presentation.shockwave.active, false);
    setSettings({ reducedMotion: true }); f.sync(16);
    assert.equal(f.presentation.shockwave.active, false);
    assert.equal(f.presentation.flash.visible, false);
    assert.deepEqual(f.presentation.cameraOffset, { x: 0, y: 0 });
    assert.ok(f.presentation.deaths[0].pieces.every(piece => piece.sprite.rotation === 0));
  } finally { f.destroy(); }
});

test('Screen shake OFF stops death camera motion independently of flash and distortion', () => {
  const f = fixture();
  try {
    f.queue(); f.sync(120);
    assert.ok(Object.values(f.presentation.cameraOffset).some(value => value !== 0));
    f.engine.polishSettings.screenShake = false;
    f.sync(16);
    assert.deepEqual(f.presentation.cameraOffset, { x: 0, y: 0 });
    f.sync(BOSS_DEATH_FINALE_MS - 136);
    f.sync(1);
    assert.deepEqual(f.presentation.cameraOffset, { x: 0, y: 0 });
    assert.equal(f.presentation.flash.visible, true, 'shake toggle does not change independent flash preference');
    assert.equal(f.presentation.shockwave.active, true, 'High distortion remains independent');
    assert.ok(f.bursts.some(burst => burst[3] === 'mega'));
  } finally { f.destroy(); }
});

test('an older simultaneous death cannot disable a newer finale distortion', () => {
  const f = fixture();
  try {
    f.queue('older'); f.sync(500);
    f.queue('newer'); f.sync(BOSS_DEATH_FINALE_MS + 1);
    assert.equal(f.presentation.deaths.length, 2);
    assert.equal(f.presentation.shockwave.active, true);
    assert.ok(f.presentation.shockwave.updates.at(-1).age < 1);
  } finally { f.destroy(); }
});

test('an older finale flash decays while a newer simultaneous death is still showing its hull', () => {
  const f = fixture();
  try {
    f.queue('older'); f.sync(BOSS_DEATH_FINALE_MS - 40);
    f.queue('newer'); f.sync(41);
    assert.equal(f.presentation.flash.visible, true);
    const ignition = f.presentation.flash.alpha;
    assert.ok(ignition > 0 && ignition <= 0.11);
    f.sync(16);
    assert.equal(f.presentation.flash.visible, true);
    assert.ok(f.presentation.flash.alpha < ignition, 'previous-frame alpha cannot pin the older flash');
    assert.equal(f.presentation.deaths[1].hull.visible, true);
    f.sync(55);
    assert.equal(f.presentation.flash.visible, false);
  } finally { f.destroy(); }
});

test('copy failure restores the live view and retains the explosion choreography', () => {
  const f = fixture();
  try {
    const { view } = f.queue();
    const visibility = view.decorations.map(item => item.visible);
    f.renderer.generateTexture = () => { throw new Error('context lost during snapshot'); };
    assert.doesNotThrow(() => f.sync(1));
    assert.deepEqual(view.decorations.map(item => item.visible), visibility);
    assert.equal(view.root.visible, true);
    assert.equal(f.presentation.deaths[0].hull, null);
    assert.equal(f.presentation.deaths[0].pieces.length, 0);
    assert.equal(f.bursts.length, 1);
    assert.equal(view.original.destroyed, false);
  } finally { f.destroy(); }
});

test('unseen deaths retain effects, and admitting a fifth active death retires the oldest snapshot', () => {
  const f = fixture();
  try {
    playBossDeathSequence(f.engine, entity('unseen')); f.sync(1);
    assert.equal(f.presentation.deaths[0].hull, null);
    assert.equal(f.bursts.length, 1);
    for (let index = 0; index < MAX_BOSS_DEATHS + 1; index++) { f.queue(`boss-${index}`); f.sync(1); }
    assert.equal(f.presentation.deaths.length, MAX_BOSS_DEATHS);
    assert.equal(f.captures[0].source.destroyed, true);
    assert.ok(f.captures.slice(1).every(capture => !capture.source.destroyed));
  } finally { f.destroy(); }
});
