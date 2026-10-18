import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['services/revamp/enemies/OpeningPeerReviewer.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { OpeningPeerReviewer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('Peer Reviewer locks a visible 0.8-second warning before one shot and has a separately breakable shield', () => {
  const runtime = new OpeningPeerReviewer();
  const boss = { sourceEventId: 'operation-open-galaxy-revamp-peer-reviewer', x: 120, y: 100,
    width: 140, height: 160, hp: 64 };
  const calls = [];
  const engine = { width: 390, player: { x: 150, y: 700, width: 40, height: 40 },
    spawnFloatingText: (...args) => calls.push(args), flashDamageTarget() {}, spawnRingEffect() {},
    spawnBurst() {}, addHitStop() {}, spawnCoin() {} };
  const shots = [];
  let warningFrame, target;
  for (let frame = 1; frame <= 228; frame++) {
    runtime.beginFrame();
    runtime.update(engine, boss, shot => shots.push({ frame, ...shot }));
    const warning = runtime.getTelegraphs().find(v => v.kind === 'sniper');
    if (warning && !warningFrame) { warningFrame = frame; target = { x: warning.targetX, y: warning.targetY }; }
    if (warningFrame) engine.player.x = 300;
  }
  assert.equal(shots.length, 1);
  assert.equal(shots[0].frame - warningFrame, 48);
  assert.deepEqual({ x: shots[0].x, y: shots[0].y }, target);
  assert.equal(runtime.absorbShield(engine, boss, 4), true);
  assert.equal(runtime.absorbShield(engine, boss, 4), true);
  assert.equal(runtime.absorbShield(engine, boss, 4), false);
  assert.equal(boss.hp, 64);
  assert.ok(calls.some(args => args.includes('SHIELD BREAK')));
});
