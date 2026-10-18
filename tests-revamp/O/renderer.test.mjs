import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the actual renderer method without constructing a browser/WebGL app.
// Its retained Graphics/Sprites and encounter state are real, not source matches.
globalThis.navigator ??= { userAgent: 'node-test' };
const output = await build({
  stdin: { contents: `
    export { PixiGameRenderer } from './services/pixi/PixiGameRenderer';
    export { attachRevampBoss } from './services/revamp/bosses/engineAdapter';
    export { getBossEncounter } from './services/revamp/bosses/runtime';
    export { createInteractiveArenaPlan } from './services/revamp/bosses/interactive';
    export { sampleInteractiveSweep } from './services/revamp/bosses/interactiveArena';
    export { ASSETS } from './constants';
    export { EntityType } from './types';
    export { Container, Graphics, Sprite, Texture } from 'pixi.js';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent',
  define: { 'import.meta.env': '{}' }
});
const directory = await mkdtemp(join(tmpdir(), 'scicon-O-renderer-'));
after(() => rm(directory, { recursive: true, force: true }));
await writeFile(join(directory, 'bundle.mjs'), output.outputFiles[0].text);
const { PixiGameRenderer, attachRevampBoss, getBossEncounter, createInteractiveArenaPlan, sampleInteractiveSweep, ASSETS,
  EntityType, Container, Graphics, Sprite, Texture } = await import(pathToFileURL(join(directory, 'bundle.mjs')));

function fixture(profile, rigId, frames, interactive = true) {
  const entity = {
    id: `render:${profile}`, type: EntityType.BOSS, sourceItemId: profile,
    sourceEventId: `revamp:${profile}`, bossRigId: rigId,
    spriteUrl: frames[0], spriteFrames: frames, x: 80, y: 148, width: 220, height: 200,
    hp: 1000, maxHp: 1000, attackTimer: 0, color: '#ffcc66', bossComponents: []
  };
  const engine = { width: 390, height: 844, frameCount: 0, playSound() {} };
  attachRevampBoss(engine, entity, { interactive });
  const rig = {
    parts: new Container(), thrust: new Container(), componentHealth: new Graphics(),
    crownClaw: { root: new Container() },
    partSprites: { 'left-cannon': new Sprite(Texture.WHITE), 'right-cannon': new Sprite(Texture.WHITE) },
    thrusterSprites: [new Sprite(Texture.WHITE), new Sprite(Texture.WHITE)]
  };
  const hull = new Sprite(Texture.WHITE);
  hull.width = 220; hull.height = 200; hull.position.set(80, 148); hull.tint = 0xf2c567;
  const view = { bossRig: rig, sprite: hull };
  const calls = { explosions: 0, debris: 0, healthBars: 0 };
  const renderer = Object.create(PixiGameRenderer.prototype);
  Object.assign(renderer, {
    seenBossComponents: new Map(), phaseText: { text: '', style: {} },
    effectPool: {
      spawnBossExplosion() { calls.explosions++; },
      spawnDetachedSprite() { calls.debris++; }
    },
    textureBank: { get() { return Texture.WHITE; } },
    getPreviewBossArtwork() { return undefined; }, getPreviewBossAtlas() { return undefined; },
    getOrRequestBossComponentTexture() { return Texture.WHITE; },
    getBossComponentVisualScale() { return 1; },
    shouldDrawBossComponentHealthBars() { return true; },
    drawBossComponentHealthBar() { calls.healthBars++; }
  });
  return { entity, engine, rig, hull, calls, renderer,
    draw() { renderer.drawBossComponents(view, entity, engine); engine.frameCount++; },
    destroy() {
      for (const object of [rig.parts, rig.thrust, rig.componentHealth, rig.crownClaw.root,
        ...Object.values(rig.partSprites), ...rig.thrusterSprites, hull]) object.destroy({ children: true });
    }
  };
}

for (const [profile, rigId, frames] of [
  ['gatekeeper-prime', 'open-orbit', ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES],
  ['paywall-decimator', 'paywall-siege', ASSETS.PIXI_BOSS_PAYWALL_FRAMES]
]) {
  test(`${profile}: broken outer armament cannot replay legacy effects while its inner layer survives`, () => {
    const f = fixture(profile, rigId, frames);
    try {
      const sourceFrames = f.entity.spriteFrames;
      const sourceUrl = f.entity.spriteUrl;
      const hullTexture = f.hull.texture;
      const hullPose = [f.hull.x, f.hull.y, f.hull.width, f.hull.height, f.hull.tint, f.hull.visible];
      const state = getBossEncounter(f.entity);
      assert.equal(f.entity.bossComponents.length, 4);
      assert.equal(f.entity.bossComponents[0].id, f.entity.bossComponents[2].id,
        'the legacy cache ID is deliberately shared across distinct armament layers');
      state.interactive.parts[0].broken = true;
      state.interactive.parts[0].hp = 0;
      f.entity.bossComponents[0].destroyed = true;
      assert.equal(f.entity.bossComponents[2].destroyed, false);
      // A recycled renderer may already have a prior-frame legacy receipt.
      f.renderer.seenBossComponents.set(f.entity.id, { 'left-cannon': false, 'right-cannon': false });
      for (let frame = 0; frame < 120; frame++) f.draw();
      assert.deepEqual(f.calls, { explosions: 0, debris: 0, healthBars: 0 },
        'the O overlay owns breaks/HP; no per-render legacy explosion or detached sprite');
      assert.equal(f.renderer.seenBossComponents.has(f.entity.id), false);
      assert.equal(f.rig.parts.visible, false);
      assert.equal(f.rig.thrust.visible, false);
      assert.ok(Object.values(f.rig.partSprites).every(sprite => !sprite.visible));
      assert.equal(f.entity.spriteFrames, sourceFrames, 'existing animated hull frame list remains intact');
      assert.equal(f.entity.spriteUrl, sourceUrl);
      assert.equal(f.hull.texture, hullTexture);
      assert.deepEqual([f.hull.x, f.hull.y, f.hull.width, f.hull.height, f.hull.tint, f.hull.visible], hullPose,
        'component suppression does not hide, replace or reshape the original hull');
    } finally { f.destroy(); }
  });
}

test('a legacy encounter still renders original armaments and emits one break effect', () => {
  const f = fixture('gatekeeper-prime', 'open-orbit', ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES, false);
  try {
    f.draw();
    assert.equal(f.rig.parts.visible, true);
    assert.equal(f.calls.healthBars, 1);
    assert.equal(f.calls.explosions, 0);
    f.entity.bossComponents[0].destroyed = true;
    for (let frame = 0; frame < 120; frame++) f.draw();
    assert.equal(f.calls.explosions, 1, 'the control proves the real legacy break path was exercised');
    assert.equal(f.calls.debris, 1);
  } finally { f.destroy(); }
});

function beamFixture(mode, interactive = true, modular = false) {
  const f = fixture('prism-moth', 'open-orbit', ASSETS.PIXI_BOSS_OPEN_ORBIT_FRAMES, interactive);
  const geometry = mode === 'wall' ? createInteractiveArenaPlan(2, 2).zones[0]
    : sampleInteractiveSweep(195, 300, 35)[0];
  const beam = {
    ...geometry, id: 'long-beam', type: EntityType.PROJECTILE, bossOwnerId: f.entity.id,
    isBeam: true, isDetachedBeam: true, isTelegraph: false, isPlayerShot: false,
    beamAxis: 'vertical', beamAngleRadians: mode === 'wall' ? null : geometry.angle,
    color: '#ffcc66', vx: 0, vy: 0, life: 72, maxLife: 72
  };
  f.engine.entities = [f.entity, beam];
  const root = new Container();
  const view = { root, body: new Graphics(), trail: new Graphics(), aura: new Graphics(),
    sprite: new Sprite(Texture.WHITE), textureKey: null, displayedTextureKey: null, textureRequest: 0,
    projectileCopies: Array.from({ length: 3 }, () => new Sprite(Texture.WHITE)) };
  root.addChild(view.body, view.trail, view.aura, view.sprite, ...view.projectileCopies);
  const calls = { modularBeam: 0, textures: [], impactCopies: 0 };
  Object.assign(f.renderer, {
    previewBossRuntimeEntityIds: new Set([f.entity.id]),
    getPreviewBossModularProjectileTexture(_entity, _frame, allowBeam) {
      if (!allowBeam) return undefined;
      calls.modularBeam++;
      return modular ? { texture: Texture.WHITE } : undefined;
    },
    getPreviewBossProjectileVfxTexture() { return undefined; },
    getPreviewBossPodTexture() { return undefined; },
    getPreviewBossVfxTexture(id) { calls.textures.push(id); return Texture.WHITE; },
    ensureProjectileCopySprites(_view, count) { calls.impactCopies++; assert.equal(count, 3); return view.projectileCopies; }
  });
  return { ...f, beam, view, calls,
    drawBeam() { f.renderer.drawProjectile(view, beam, f.engine); },
    destroy() { root.destroy({ children: true }); f.destroy(); }
  };
}

for (const mode of ['wall', 'sweep']) {
  test(`long O ${mode} beams retain exact procedural bounds without legacy flame textures`, () => {
    for (const modular of [false, true]) {
      const f = beamFixture(mode, true, modular);
      try {
        assert.ok(f.beam.height >= 444, 'use the real long arena hazard, not a short fixture');
        for (let frame = 0; frame < 12; frame++) {
          // A recycled projectile view can arrive with legacy impact sprites visible.
          f.view.sprite.visible = true;
          for (const copy of f.view.projectileCopies) { copy.visible = true; copy.width = copy.height = 2600; }
          f.drawBeam();
          assert.equal(f.view.sprite.visible, false);
          assert.ok(f.view.projectileCopies.every(copy => !copy.visible), 'pooled flame copies are hidden');
          assert.equal(f.view.aura.context.bounds.width, f.beam.width);
          assert.equal(f.view.aura.context.bounds.height, f.beam.height);
          assert.ok(f.view.body.context.instructions.length >= 2, 'the visible damaging core and boundary still draw');
          assert.equal(f.view.root.rotation, f.beam.beamAngleRadians ?? 0);
          f.engine.frameCount++;
        }
        assert.deepEqual(f.calls, { modularBeam: 0, textures: [], impactCopies: 0 },
          'O geometry never enters authored preview beam/impact rendering');
      } finally { f.destroy(); }
    }
  });
}

test('a non-O compiled-art beam retains its original beam and impact rendering', () => {
  const f = beamFixture('wall', false);
  try {
    f.drawBeam();
    assert.equal(f.calls.modularBeam, 1);
    assert.deepEqual(f.calls.textures, ['beamLive', 'beamImpact']);
    assert.equal(f.calls.impactCopies, 1);
    assert.equal(f.view.sprite.visible, true);
    assert.ok(f.view.projectileCopies.every(copy => copy.visible && copy.width === f.beam.height * 2.6));
    assert.equal(f.view.aura.context.bounds.width, f.beam.width);
    assert.equal(f.view.aura.context.bounds.height, f.beam.height);
  } finally { f.destroy(); }
});
