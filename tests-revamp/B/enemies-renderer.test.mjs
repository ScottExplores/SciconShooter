import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Pixi reads the user agent during module initialization; this test only builds
// vector geometry, so it does not need a browser, canvas or WebGL renderer.
globalThis.navigator ??= { userAgent: 'node' };
const { Graphics } = await import('pixi.js');
const bundle = await build({ entryPoints: ['services/revamp/enemies/EnemyTelegraphRenderer.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { drawRevampEnemyTelegraphs } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('isolated mine arcs stay within the warning circle without rays from world origin', () => {
  const graphics = new Graphics();
  drawRevampEnemyTelegraphs(graphics, [{ kind: 'mine', x: 280, y: 400, radius: 34, progress: 0.8 }], 42);
  const bounds = graphics.getBounds();
  assert.ok(bounds.minX > 240);
  assert.ok(bounds.minY > 360);
  assert.ok(bounds.maxX < 320);
  assert.ok(bounds.maxY < 440);
  graphics.destroy();
});

test('all telegraph geometries render with finite phone-sized bounds', () => {
  const graphics = new Graphics();
  drawRevampEnemyTelegraphs(graphics, [
    { kind: 'shield', x: 80, y: 120, radius: 22 },
    { kind: 'sniper', x: 300, y: 120, targetX: 195, targetY: 620, progress: 0.7 },
    { kind: 'ghost', x: 75, y: 280, width: 40, height: 44, progress: 0.4 },
    { kind: 'blast', x: 280, y: 400, radius: 34, progress: 0.2 },
    { kind: 'edge', x: 18, y: 540, direction: 'left', progress: 0.6 },
    { kind: 'edge', x: 330, y: 690, direction: 'bottom', progress: 0.6 }
  ], 42);
  const bounds = graphics.getBounds();
  assert.ok([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite));
  assert.ok(bounds.minX >= 0 && bounds.minY >= 0 && bounds.maxX <= 390 && bounds.maxY <= 720);
  graphics.destroy();
});
