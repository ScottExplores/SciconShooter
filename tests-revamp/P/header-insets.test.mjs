import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['services/revamp/presentation/CombatHeaderInsets.ts'], bundle: true,
  write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { combatHeaderOffset, CombatHeaderInsets } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('notch padding offsets only cosmetic headers in the same world at both phone aspects', () => {
  assert.equal(combatHeaderOffset(48, 0, 844, 844), 0);
  assert.equal(combatHeaderOffset(48, 0, 640, 844), 0);
  assert.equal(combatHeaderOffset(91, 0, 844, 844), 43);
  assert.ok(Math.abs(combatHeaderOffset(91, 0, 640, 844) * 640 / 844 - 43) < 1e-9);
  assert.equal(combatHeaderOffset(111, 20, 844, 844), 43, 'parent offsets do not alter the inset');
  assert.equal(combatHeaderOffset(48, 0, 0, 844), 0);
});

test('ordinary render frames reuse the measured header inset and disposal removes observers', () => {
  const savedWindow = globalThis.window, savedObserver = globalThis.ResizeObserver;
  let reads = 0, disconnected = 0;
  const listeners = new Set();
  globalThis.window = { addEventListener(_, fn) { listeners.add(fn); }, removeEventListener(_, fn) { listeners.delete(fn); } };
  globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() {} disconnect() { disconnected++; } };
  let bottom = 91;
  const row = { getBoundingClientRect() { reads++; return { bottom }; } };
  const canvas = { closest: () => ({ querySelector: () => row }), getBoundingClientRect: () => ({ top: 0, height: 844 }) };
  try {
    const insets = new CombatHeaderInsets();
    assert.equal(insets.read(canvas, 844), 43);
    for (let i = 0; i < 120; i++) assert.equal(insets.read(canvas, 844), 43);
    assert.equal(reads, 1, 'no repeated layout reads at 60 Hz');
    bottom = 48;
    for (const invalidate of listeners) invalidate();
    assert.equal(insets.read(canvas, 844), 0);
    assert.equal(reads, 2);
    insets.destroy();
    assert.equal(disconnected, 1);
    assert.equal(listeners.size, 0);
  } finally { globalThis.window = savedWindow; globalThis.ResizeObserver = savedObserver; }
});
