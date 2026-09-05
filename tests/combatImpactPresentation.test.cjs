const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const load = (name) => {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const box = { exports: {} };
  vm.runInNewContext(compiled, { exports: box.exports, module: box, require });
  return box.exports;
};
const { CombatImpactPresentation } = load('services/pixi/CombatImpactPresentation.ts');
const { CombatImpactBuffer } = load('services/gameplay/CombatImpactBuffer.ts');
const record = (source, frame, x = 100) => source.record({
  frame, x, y: 130, vx: 0, vy: -10, size: 18, color: '#a6ff68',
  targetId: 'target', projectileId: `shot-${frame}-${x}`, boss: true
});
const collect = (cursor, source, frame, reduced = false) => {
  const results = [];
  cursor.visitNew(source, frame, reduced, (event) => results.push(event));
  return results;
};

test('hit presentation replays each accepted contact once, independently per renderer', () => {
  const source = new CombatImpactBuffer();
  const a = new CombatImpactPresentation();
  const b = new CombatImpactPresentation();
  record(source, 12, 110);
  record(source, 12, 190);
  assert.deepEqual(collect(a, source, 12).map(e => e.x), [190, 110]);
  assert.equal(collect(a, source, 12).length, 0);
  assert.equal(collect(b, source, 12).length, 2);
  assert.equal(source.events.length, 2, 'rendering cannot drain simulation evidence');
});

test('dense fire is capped and slow/resumed renderers do not play stale hit bursts', () => {
  const source = new CombatImpactBuffer();
  const cursor = new CombatImpactPresentation();
  for (let i = 0; i < 90; i++) record(source, 20, i);
  assert.equal(collect(cursor, source, 20).length, 8);
  assert.equal(collect(cursor, source, 21).length, 0, 'skipped effects do not accumulate');
  for (let i = 0; i < 30; i++) record(source, 22, i);
  assert.equal(collect(cursor, source, 22, true).length, 4);
  record(source, 23);
  assert.equal(collect(cursor, source, 40).length, 0);
  record(source, 45);
  assert.equal(collect(cursor, source, 40).length, 0, 'future events do not play');
});

test('new engines, preview resets, and disposal cannot replay old receipts', () => {
  const cursor = new CombatImpactPresentation();
  const source = new CombatImpactBuffer();
  record(source, 0);
  assert.equal(collect(cursor, source, 0).length, 1);
  source.clear();
  record(source, 0);
  assert.equal(collect(cursor, source, 0).length, 1);
  const next = new CombatImpactBuffer();
  record(next, 0);
  assert.equal(collect(cursor, next, 0).length, 1);
  cursor.reset();
  assert.equal(collect(cursor, next, 20).length, 0);
});

test('renderer uses local pixel hits and actual sprite silhouettes, never regular hit rings', () => {
  const renderer = fs.readFileSync(path.join(root, 'services/pixi/PixiGameRenderer.ts'), 'utf8');
  const pool = fs.readFileSync(path.join(root, 'services/pixi/ArcadeEffectPool.ts'), 'utf8');
  const flash = renderer.slice(renderer.indexOf('  private drawFlash('), renderer.indexOf('  private updateEntityView('));
  assert.match(flash, /view\.hitFlash\.texture = view\.sprite\.texture/);
  assert.match(flash, /view\.hitFlash\.scale\.copyFrom\(view\.sprite\.scale\)/);
  assert.match(flash, /view\.hitFlash\.anchor\.copyFrom\(view\.sprite\.anchor\)/);
  assert.match(flash, /view\.hitFlash\.blendMode = 'add'/);
  const impact = pool.slice(pool.indexOf('  spawnProjectileHit('), pool.indexOf('  spawnBossDamageSprite('));
  assert.match(impact, /spawnBossSpriteExplosion/);
  assert.doesNotMatch(impact, /spawnLightPulse|spawn\('(?:ring|shockwave)'/);
  assert.doesNotMatch(renderer, /entity\.flashFrames > view\.lastFlashFrames \+ 2/);
  assert.match(renderer, /this\.syncCombatImpacts\(engine\)/);
});
