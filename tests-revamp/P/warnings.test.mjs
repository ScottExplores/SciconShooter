import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['services/revamp/presentation/CompactBossWarning.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { CompactBossWarning } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const point = () => ({ x: 0, y: 0, set(x, y = x) { this.x = x; this.y = y; } });
function node() {
  return { visible: true, position: point(), scale: point(), style: {}, width: 420, commands: [],
    clear() { this.commands = []; return this; }, rect(...rect) { this.commands.push(rect); return this; }, fill() { return this; } };
}
function fixture() {
  const nodes = Array.from({ length: 9 }, node);
  const presenter = new CompactBossWarning(...nodes);
  const engine = { inBossWarningSequence: true, bossWarningDuration: 120, bossWarningFrame: 100,
    pendingBossType: 'gatekeeper', pendingConfiguredEncounter: { label: 'Gatekeeper Prime' } };
  return { nodes, presenter, engine };
}

test('boss warning preserves its simulation window and leaves the central flight lane clear', () => {
  const { nodes: [root, shade, edge, banner, ring, scan, crystal, title], presenter, engine } = fixture();
  const before = structuredClone(engine);
  presenter.sync(engine, 390, false);
  assert.deepEqual(engine, before);
  assert.equal(root.visible, true);
  assert.equal(shade.visible, false, 'no full-screen red strobe');
  assert.equal(title.text, 'WARNING: BOSS');
  assert.ok(root.position.y + banner.height / 2 < 100, 'compact header stays above enemies');
  assert.ok(edge.commands.every(([, y,, height]) => y + height <= 53));
  assert.ok([ring, scan, crystal].every(sprite => !sprite.visible));
  engine.inBossWarningSequence = false;
  presenter.sync(engine, 390, false);
  assert.equal(root.visible, false);
  assert.equal(edge.visible, false);
});

test('live reduced motion removes entrance travel while preserving readable threat labels', () => {
  const { nodes: [root,,,,,,, title, subtitle], presenter, engine } = fixture();
  for (const remaining of [119, 115, 100, 2]) {
    engine.bossWarningFrame = remaining;
    presenter.sync(engine, 390, true);
    assert.equal(root.position.y, 77);
    assert.equal(root.alpha, 1);
    assert.equal(title.text, 'WARNING: BOSS');
  }
  engine.pendingBossType = 'wall';
  presenter.sync(engine, 390, true);
  assert.equal(title.text, 'WARNING: ELITE');
  assert.equal(subtitle.text, 'GATEKEEPER PRIME');
});
