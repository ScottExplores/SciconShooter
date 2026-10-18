import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after } from 'node:test';

globalThis.navigator ??= { userAgent: 'node-test' };
const output = await build({
  stdin: { contents: `
    export { BossCueGeometry } from './services/revamp/performance/BossCueGeometry';
    export { Container, Graphics } from 'pixi.js';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-J-boss-cues-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), output.outputFiles[0].text);
const { BossCueGeometry, Container, Graphics } = await import(pathToFileURL(join(directory, 'bundle.mjs')));

const fixture = () => {
  const part = new Graphics(), halo = new Container(), status = new Graphics(), card = new Graphics();
  const cues = new BossCueGeometry(part, halo, status, card);
  const state = { stage: 'warning', ageFrames: 10, part: { x: 82.4, y: 126, hp: 80, maxHp: 100, radius: 21, broken: false } };
  const boss = { x: 50, y: 30, width: 120, height: 100 };
  return { cues, state, boss, part, halo, status, card,
    destroy() { for (const item of [part, halo, status, card]) item.destroy({ children: true }); } };
};
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≈ ${expected}`);
const countClears = (...graphics) => {
  let count = 0;
  for (const graphic of graphics) {
    const clear = graphic.clear.bind(graphic);
    graphic.clear = () => { count++; return clear(); };
  }
  return () => count;
};

test('moving boss hardware retains geometry while its world bounds follow every frame', () => {
  const f = fixture();
  try {
    f.cues.syncPart(f.state, f.boss);
    const shape = f.part.context.instructions[0];
    const bounds = f.part.getBounds().rectangle.clone();
    const clears = countClears(f.part);
    const stateBefore = structuredClone(f.state);
    f.cues.syncPart(f.state, f.boss);
    assert.deepEqual(f.state, stateBefore, 'presentation does not mutate encounter state');
    for (let frame = 1; frame <= 120; frame++) {
      f.boss.x += 0.125; f.boss.y += 0.1;
      f.state.part.x += 0.125; f.state.part.y += 0.1;
      f.cues.syncPart(f.state, f.boss);
      const moved = f.part.getBounds().rectangle;
      approx(moved.x, bounds.x + frame * 0.125);
      approx(moved.y, bounds.y + frame * 0.1);
      approx(moved.width, bounds.width); approx(moved.height, bounds.height);
    }
    assert.equal(f.part.context.instructions[0], shape);
    assert.equal(clears(), 0, 'sub-pixel translation never rebuilds paths');
  } finally { f.destroy(); }
});

test('damage, exposure, break and connector changes immediately update retained hardware', () => {
  const f = fixture();
  try {
    f.cues.syncPart(f.state, f.boss);
    const fullShapeCount = f.part.context.instructions.length;
    const fullHealth = f.part.context.instructions.at(-1).data.path.bounds;
    f.state.part.hp = 40;
    f.cues.syncPart(f.state, f.boss);
    const damagedHealth = f.part.context.instructions.at(-1).data.path.bounds;
    approx(damagedHealth.width, fullHealth.width / 2);
    f.state.stage = 'recovery';
    f.cues.syncPart(f.state, f.boss);
    assert.equal(f.part.context.instructions.at(-1).data.style.color, 0x8cf2e5);
    f.state.part.broken = true;
    f.cues.syncPart(f.state, f.boss);
    assert.ok(f.part.context.instructions.length < fullShapeCount, 'broken emitter has no brackets or health bar');
    const broken = f.part.context.instructions[0];
    f.boss.height += 20;
    f.cues.syncPart(f.state, f.boss);
    assert.notEqual(f.part.context.instructions[0], broken, 'changed hull connection updates its shape');
    f.state.part.broken = false; f.state.stage = 'intro';
    f.cues.syncPart(f.state, f.boss);
    assert.ok(f.part.context.instructions.length < fullShapeCount, 'intro still hides the target brackets');
    f.state.stage = 'warning'; f.state.part.radius = 30;
    f.cues.syncPart(f.state, f.boss);
    assert.ok(f.part.getLocalBounds().width > 60, 'radius changes update the collision brackets');
  } finally { f.destroy(); }
});

test('transition halo pulses continuously with constant fill and unscaled stroke', () => {
  const f = fixture();
  try {
    f.state.stage = 'transition';
    f.cues.syncHalo(f.state, f.boss, false);
    const [fill, rim] = f.halo.children;
    const clears = countClears(fill, rim);
    for (let frame = 0; frame < 100; frame++) {
      f.state.ageFrames = frame;
      f.boss.x += 0.25;
      f.cues.syncHalo(f.state, f.boss, false);
      approx(rim.alpha, 0.25 + Math.sin(frame * 0.16) * 0.12);
      assert.equal(fill.context.instructions[0].data.style.alpha, 0.045);
      assert.equal(rim.context.instructions[0].data.style.width, 2);
      approx(f.halo.x, f.boss.x + f.boss.width / 2);
    }
    assert.equal(clears(), 0);
    f.cues.syncHalo(f.state, f.boss, true); assert.equal(rim.alpha, 0.42);
    f.state.stage = 'warning'; f.cues.syncHalo(f.state, f.boss, false); assert.equal(f.halo.visible, false);
    f.state.stage = 'recovery'; f.cues.syncHalo(f.state, f.boss, false);
    assert.equal(f.halo.visible, true); assert.equal(rim.alpha, 0.4);
    assert.equal(fill.context.instructions.length, 0, 'exposed halo has no transition fill');
    approx(rim.getLocalBounds().width, f.boss.width * 0.96 + 2);
  } finally { f.destroy(); }
});

test('HUD/card backgrounds survive text, opacity and capped-width movement; style/resize redraws', () => {
  const f = fixture();
  try {
    f.cues.syncStatus(390, null); f.cues.syncCard(362);
    const clears = countClears(f.status, f.card);
    for (let i = 0; i < 120; i++) {
      f.card.alpha = i / 120;
      f.cues.syncStatus(390 + i, null); f.cues.syncCard(362);
    }
    assert.equal(clears(), 0);
    assert.equal(f.status.x, 509 / 2); assert.equal(f.status.y, 103);
    f.cues.syncStatus(600, 0xffcc66);
    assert.equal(f.status.y, 107); assert.equal(f.status.context.instructions.length, 2);
    assert.equal(f.status.context.instructions[1].data.style.color, 0xffcc66);
    f.cues.syncStatus(600, 0xf799e5);
    assert.equal(f.status.context.instructions[1].data.style.color, 0xf799e5);
    f.cues.syncStatus(300, null); approx(f.status.getLocalBounds().width, 278);
    f.cues.syncCard(272); approx(f.card.getLocalBounds().width, 273);
    assert.equal(clears(), 4);
  } finally { f.destroy(); }
});
