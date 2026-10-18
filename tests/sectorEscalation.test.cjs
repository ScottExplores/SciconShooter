const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8').replace(/\r\n/g, '\n');

const loadModule = (relativePath) => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, relativePath)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent'
  });
  const module = { exports: {} };
  Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
};

const { getSectorOrderForDepth, getSectorAggression, applySectorAggression } = loadModule('services/sectorEscalation.ts');

const baseChoreography = Object.freeze({
  entryPathId: 'loop-the-loop',
  movementId: 'gentle-drift',
  attackId: 'paired-dive',
  firingBehavior: 'post-formation',
  returnId: 'reform',
  holdSeconds: 1.8,
  telegraphSeconds: 0.7,
  attackDurationSeconds: 1.4,
  recoverySeconds: 1.15,
  attackGroupSize: 2,
  attackCycles: 3
});

test('campaign depth maps onto ten five-Mission sectors', () => {
  assert.equal(getSectorOrderForDepth(1), 1);
  assert.equal(getSectorOrderForDepth(5), 1);
  assert.equal(getSectorOrderForDepth(6), 2);
  assert.equal(getSectorOrderForDepth(25), 5);
  assert.equal(getSectorOrderForDepth(50), 10);
  assert.equal(getSectorOrderForDepth(999), 10, 'clamped to the last sector');
  assert.equal(getSectorOrderForDepth(0), 1, 'clamped to the first sector');
});

test('the first four sectors keep the authored cadence untouched', () => {
  for (const depth of [1, 7, 12, 20]) {
    assert.equal(applySectorAggression(baseChoreography, depth), baseChoreography, `depth ${depth} is a no-op`);
  }
});

test('aggression ramps monotonically from sector 5 and respects the readable floors', () => {
  let previous = applySectorAggression(baseChoreography, 20);
  for (let sector = 5; sector <= 10; sector++) {
    const depth = sector * 5;
    const aggression = getSectorAggression(depth);
    const next = applySectorAggression(baseChoreography, depth);
    assert.equal(aggression.sectorOrder, sector);
    assert.ok(next.attackGroupSize >= previous.attackGroupSize, `sector ${sector} never shrinks attack groups`);
    assert.ok(next.holdSeconds <= previous.holdSeconds, `sector ${sector} never lengthens the hold`);
    assert.ok(next.telegraphSeconds <= previous.telegraphSeconds);
    assert.ok(next.recoverySeconds <= previous.recoverySeconds);
    assert.ok(next.attackGroupSize <= 4, 'attack groups cap at four');
    assert.ok(next.holdSeconds >= 0.9 && next.telegraphSeconds >= 0.45 && next.recoverySeconds >= 0.7, 'floors hold');
    previous = next;
  }
  const finale = applySectorAggression(baseChoreography, 50);
  assert.equal(finale.attackGroupSize, 4);
  assert.ok(Math.abs(finale.holdSeconds - 1.8 * 0.75) < 1e-9);
  assert.equal(finale.attackCycles, baseChoreography.attackCycles, 'cycles, entry, and movement are untouched');
  assert.equal(finale.entryPathId, baseChoreography.entryPathId);
});

test('the engine applies sector aggression when a formation member is configured', () => {
  const engine = read('services', 'gameLogic.ts');
  assert.match(engine, /applySectorAggression\(\n\s*this\.resolveRuntimeFormationChoreography\(event, formationPack\),\n\s*this\.getStageNumberForCampaignIndex\(\)\n\s*\)/);
  const digest = read('tools', 'simulate-campaign-nonboss-balance.mjs');
  assert.match(digest, /'services\/sectorEscalation\.ts'/);
  assert.match(digest, /'services\/playerShipWeapons\.ts'/);
});
