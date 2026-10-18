import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['services/revamp/feel/FeelEffects.ts'], bundle: true, format: 'esm', platform: 'node', write: false
});
const { FeelEffects, EXPLOSION_TIERS, impactSparkVelocity, scoreSparkPosition, BOSS_FLASH_MAX_ALPHA } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('boss defeat is a 1.6 second chain with a single capped final flash', () => {
  const bursts = [];
  const feel = new FeelEffects({ spawnTieredExplosion: (...args) => bursts.push(args) });
  feel.startBossDefeat(195, 200, 240, 120);
  assert.equal(bursts.length, 1);
  for (let index = 0; index < 15; index++) {
    feel.update(100);
    assert.equal(feel.screenFlashAlpha, 0);
  }
  assert.equal(feel.bossChainActive, true);
  feel.update(100);
  assert.equal(bursts.length, 12);
  assert.equal(feel.bossChainActive, false);
  assert.equal(bursts.at(-1)[3], 'boss-part');
  assert.equal(feel.screenFlashAlpha, BOSS_FLASH_MAX_ALPHA);
  feel.setReducedFlash(true);
  assert.ok(feel.screenFlashAlpha < 0.04);
  feel.update(140);
  assert.equal(feel.screenFlashAlpha, 0);
  assert.ok(bursts.every(([x, y, size]) => Number.isFinite(x + y + size)));
});

test('resuming a background tab skips stale bursts and fullscreen flash', () => {
  const bursts = [];
  const feel = new FeelEffects({ spawnTieredExplosion: (...args) => bursts.push(args) });
  feel.startBossDefeat(50, 50, 200, 150);
  feel.update(10_000);
  assert.ok(bursts.length <= 4);
  assert.equal(feel.bossChainActive, false);
  assert.equal(feel.screenFlashAlpha, 0);
  feel.startBossDefeat(10, 10, 10, 10);
  feel.reset();
  feel.update(2000);
  assert.equal(feel.bossChainActive, false);
});

test('directional contact sparks rotate with the bullet and armor scatters wider', () => {
  const upward = impactSparkVelocity(0, -8, 0, false);
  const rightward = impactSparkVelocity(8, 0, 0, false);
  assert.equal(rightward.x, -upward.y);
  assert.equal(rightward.y, upward.x);
  const armor = impactSparkVelocity(0, -8, 0, true);
  assert.ok(Math.abs(armor.x) > Math.abs(upward.x));
  assert.deepEqual(impactSparkVelocity(0, 0, 0, false), upward);
});

test('magnet spark easing starts at contact and lands exactly on the HUD', () => {
  assert.deepEqual(scoreSparkPosition(0, 80, 300, 240, 25, -50), { x: 80, y: 300 });
  assert.deepEqual(scoreSparkPosition(1, 80, 300, 240, 25, -50), { x: 240, y: 25 });
  assert.deepEqual(scoreSparkPosition(2, 80, 300, 240, 25, -50), { x: 240, y: 25 });
  const early = scoreSparkPosition(0.1, 80, 300, 240, 25, -50);
  assert.ok(early.x < 80, 'spark kicks outward before accelerating to HUD');
});

test('explosion tiers increase sparkle, debris, and local light without giant coverage', () => {
  assert.ok(EXPLOSION_TIERS.small.sparks < EXPLOSION_TIERS.elite.sparks);
  assert.ok(EXPLOSION_TIERS.elite.debris < EXPLOSION_TIERS['boss-part'].debris);
  assert.ok(EXPLOSION_TIERS['boss-part'].glow < 0.5);
});

// Pixi transforms are stubbed so resource limits can be tested without a GPU.
const pixiStub = `
export class Container {
  children=[]; x=0; y=0; alpha=1; rotation=0; visible=true;
  position={ set:(x,y=x)=>{this.x=x; this.y=y;} }; scale={set:()=>{}};
  addChild(...items){ for (const item of items) { this.children.push(item); item.parent=this; } return items[0]; }
  destroy(){ for(const child of [...this.children]) child.destroy(); this.children=[]; if(this.parent) this.parent.children=this.parent.children.filter(c=>c!==this); }
}
export class Graphics extends Container { clear(){return this} circle(){return this} stroke(){return this} moveTo(){return this} lineTo(){return this} closePath(){return this} fill(){return this} roundRect(){return this} }
export class Texture { static WHITE={}; static EMPTY={}; }
export class Sprite extends Container { anchor={set:()=>{}}; constructor(texture){super();this.texture=texture;} }
`;
const poolBundle = await build({ entryPoints: ['services/pixi/ArcadeEffectPool.ts'], bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'pixi-no-gpu', setup(build) {
    build.onResolve({ filter: /^pixi.js$/ }, () => ({ path: 'pixi', namespace: 'mock' }));
    build.onLoad({ filter: /^pixi$/, namespace: 'mock' }, () => ({ contents: pixiStub }));
    build.onResolve({ filter: /SoftRadialLight$/ }, () => ({ path: 'light', namespace: 'mock' }));
    build.onLoad({ filter: /^light$/, namespace: 'mock' }, () => ({ contents: `import { Container } from 'pixi.js'; export const createSoftRadialLight=()=>({root:new Container()}); export const hideSoftRadialLight=l=>{l.root.visible=false}; export const showSoftRadialLight=l=>{l.root.visible=true};` }));
  } }]
});
const { ArcadeEffectPool } = await import(`data:text/javascript;base64,${Buffer.from(poolBundle.outputFiles[0].text).toString('base64')}`);

test('particle and light pools remain bounded under burst spam and quality step-down', () => {
  const layer = { children: [], addChild(node) { this.children.push(node); node.parent = this; } };
  const pool = new ArcadeEffectPool(layer);
  pool.setQuality(false, false);
  for (let index = 0; index < 200; index++) pool.spawnTieredExplosion(150, 200, 80, 'boss-part');
  let stats = pool.getStats();
  assert.equal(stats.allocated, 170);
  assert.ok(stats.active <= stats.cap && stats.lights <= stats.lightCap);
  pool.setQuality(true, true);
  stats = pool.getStats();
  assert.equal(stats.cap, 54);
  assert.ok(stats.active <= 54 && stats.lights <= 3);
  pool.setQuality(false, true, 0.4);
  stats = pool.getStats();
  assert.equal(stats.cap, 41);
  assert.ok(stats.active <= 41 && stats.lights <= 2, 'adaptive scale retires existing particles and lights');
  for (let index = 0; index < 20; index++) pool.update(100);
  assert.equal(pool.getStats().active, 0);
  assert.equal(pool.getStats().lights, 0);
  pool.destroy();
  assert.equal(layer.children.length, 0, 'pool releases display objects on renderer unmount');
});
