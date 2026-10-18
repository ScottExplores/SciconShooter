import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

globalThis.navigator ??= { userAgent: 'node-test' };
// Real death presenter, Pixi objects, pixel recipes and effect-pool lifecycle.
// Only GPU copies/lights/shader and OS preferences need browser-free facades.
const bundle = await build({
  stdin: { contents: `export * from './services/revamp/vfx/BossDeathPresentation';
    export * from './services/revamp/vfx/BossDeathSequence';
    export * from './services/revamp/vfx/BossCompletionGate';
    export { ArcadeEffectPool } from './services/pixi/ArcadeEffectPool';
    export { setSettings } from './services/revamp/feel/FeelSettings';
    export { Container, Sprite, Texture, TextureSource, RenderTexture } from 'pixi.js';`,
    loader: 'ts', resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  plugins: [{ name: 'completion-gpu-boundary', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)(FeelSettings|BossShockwave|SoftRadialLight)$/ }, args =>
      ({ path: args.path.split('/').at(-1), namespace: 'completion-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'completion-test' }, args => ({ loader: 'js', resolveDir: process.cwd(),
      contents: args.path === 'FeelSettings'
        ? `let settings = { reducedMotion: false, reduceScreenShake: false };
           export const getFeelSettings = () => settings;
           export const setSettings = value => { settings = { reducedMotion: false, reduceScreenShake: false, ...value }; };`
        : args.path === 'SoftRadialLight'
          ? `import { Container } from 'pixi.js';
             export const createSoftRadialLight = () => ({ root: new Container() });
             export const hideSoftRadialLight = light => { light.root.visible = false; };
             export const showSoftRadialLight = light => { light.root.visible = true; };`
          : `export const BOSS_SHOCKWAVE_DURATION_MS = 360;
             export class BossShockwave { update() {} disable() {} destroy() {} }`
    }));
  } }]
});
const { BossDeathPresentation, playBossDeathSequence, deferBossCompletion, takeBossCompletion,
  BOSS_DEATH_DURATION_MS, MINI_DEATH_DURATION_MS, ArcadeEffectPool, setSettings,
  Container, Sprite, Texture, TextureSource, RenderTexture } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

function runSequence({ mini = false, low = false, reduced = false, delta = 16 } = {}) {
  let now = 0;
  const previous = Object.getOwnPropertyDescriptor(performance, 'now');
  Object.defineProperty(performance, 'now', { configurable: true, value: () => now });
  setSettings({ reducedMotion: reduced });
  const layers = Array.from({ length: 4 }, () => new Container());
  const pool = new ArcadeEffectPool(layers[0]);
  pool.setQuality(low, true, low ? 0.4 : 1);
  pool.setReducedMotion(reduced);
  const quality = { tier: low ? 'low' : 'high', particleScale: low ? 0.4 : 1,
    trailScale: 1, backgroundLayerScale: 1 };
  const engine = { frameCount: 0, feel: { resetGeneration: 0 }, width: 390, height: 844,
    polishSettings: { screenShake: true },
    getEncounterCameraTransform: () => ({ scale: 1, offsetX: 0, offsetY: 0 }) };
  const renderer = { generateTexture: options => RenderTexture.create({
    width: options.frame.width, height: options.frame.height, resolution: 1 }) };
  const presentation = new BossDeathPresentation(pool, layers[1], layers[2], layers[3], () => renderer);
  const original = new Texture({ source: new TextureSource({ width: 160, height: 120 }) });
  const root = new Container();
  const sprite = new Sprite(original); sprite.anchor.set(0.5); root.addChild(sprite);
  const [aura, trail, flash, health, label] = Array.from({ length: 5 }, () => new Container());
  const view = { root, aura, trail, flash, health, label };
  const hullDuration = mini ? MINI_DEATH_DURATION_MS : BOSS_DEATH_DURATION_MS;
  try {
    playBossDeathSequence(engine, { id: 'terminal', x: 100, y: 100, width: 160, height: 120 }, mini);
    assert.equal(deferBossCompletion(engine, 'MISSION COMPLETE!', '#fff'), true);
    let finishedAt;
    while (now < 3900) {
      now += delta;
      presentation.sync(engine, delta, quality, () => view);
      pool.update(Math.min(50, delta)); // Same capped input as PixiGameRenderer.sync.
      if (presentation.deaths.length === 0) {
        finishedAt = now;
        assert.equal(pool.getStats().active, 0, 'finish receipt must include the last particle tail');
        break;
      }
      assert.equal(takeBossCompletion(engine), undefined, 'active hull or explosion cannot reveal results');
    }
    assert.ok(finishedAt, 'presentation finishes before the hard cap at ordinary frame rates');
    assert.ok(finishedAt >= hullDuration, 'hull breakup must finish as well as particles');
    assert.equal(takeBossCompletion(engine, finishedAt + 299), undefined);
    assert.deepEqual(takeBossCompletion(engine, finishedAt + 300), { label: 'MISSION COMPLETE!', color: '#fff' });
    return finishedAt;
  } finally {
    presentation.destroy(); pool.destroy(); root.destroy({ children: true }); original.destroy(true);
    for (const decoration of [aura, trail, flash, health, label]) decoration.destroy();
    for (const layer of layers) layer.destroy({ children: true });
    if (previous) Object.defineProperty(performance, 'now', previous);
    else delete performance.now;
  }
}

test('major and mini completion wait for real hull breakup and final pixel-particle tails', () => {
  const bossFinish = runSequence();
  const miniFinish = runSequence({ mini: true });
  assert.ok(bossFinish > BOSS_DEATH_DURATION_MS, 'full-quality smoke outlasts nominal major hull duration');
  assert.ok(miniFinish < bossFinish, 'mini uses its own shorter presentation');
});

test('Low and reduced motion use their own shorter particle completion instead of a fixed high-quality wait', () => {
  for (const mini of [false, true]) {
    const high = runSequence({ mini });
    assert.ok(runSequence({ mini, low: true }) < high);
    assert.ok(runSequence({ mini, reduced: true }) < high);
    assert.ok(runSequence({ mini, low: true, reduced: true }) <= high);
  }
});

test('slow render frames retain particle ownership on the pool capped clock', () => {
  const normal = runSequence();
  const slow = runSequence({ delta: 66 });
  assert.ok(slow > normal, '66 ms presentation steps must not age a 50 ms-capped particle pool too quickly');
});
