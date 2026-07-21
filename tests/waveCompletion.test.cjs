const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8'));

const loadWaveCompletion = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'waveCompletion.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(exports, require, module) { ${compiled} })(module.exports, require, module);`, {
    module,
    require,
    Math,
    Number,
    String
  });
  return module.exports;
};

test('the five-wave level alternates clear waves with milestone boss waves', () => {
  const waves = campaign.levels[0].waves;
  assert.equal(campaign.levels[0].name, 'Research Frontier');
  assert.deepEqual(
    waves.map((wave) => wave.completionRule),
    ['boss-defeat', 'clear-after-duration', 'boss-defeat', 'clear-after-duration', 'boss-defeat']
  );

  waves.forEach((wave) => {
    const gatekeepers = wave.events.filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper');
    assert.equal(gatekeepers.length, wave.completionRule === 'boss-defeat' ? 1 : 0, wave.id);
  });
});

test('interstitial waves contain readable three- and four-enemy elite attack packs', () => {
  const clearWaves = campaign.levels[0].waves.filter((wave) => wave.completionRule === 'clear-after-duration');
  const packsByWave = clearWaves.map((wave) => wave.events.filter((event) => (
    event.kind === 'spawn' && event.enemies.every((enemy) => enemy.rank === 'elite')
  )));

  assert.deepEqual(packsByWave.map((packs) => packs.map((pack) => pack.count)), [[3, 4], [3, 4]]);
  packsByWave.flat().forEach((pack) => {
    assert.notEqual(pack.patternId, 'single-random');
    assert.ok(pack.enemies.every((enemy) => enemy.attackPatternId === 'aimed-burst'));
    assert.ok(pack.enemies.every((enemy) => enemy.sizeMultiplier > 1));
  });

  const earlyHealth = packsByWave[0].map((pack) => pack.enemies[0].health);
  const lateHealth = packsByWave[1].map((pack) => pack.enemies[0].health);
  assert.ok(Math.min(...lateHealth) > Math.max(...earlyHealth));
  assert.ok(clearWaves[1].threatCap > clearWaves[0].threatCap);
});

test('clear-wave completion waits for the timer, schedules, warnings, and every hostile', () => {
  const { shouldCompleteClearWave } = loadWaveCompletion();
  const ready = {
    completionRule: 'clear-after-duration',
    elapsedFrames: 3600,
    durationFrames: 3600,
    scheduledSpawnsComplete: true,
    scheduledEncountersComplete: true,
    activeThreatCount: 0,
    warningActive: false,
    transitionPending: false
  };

  assert.equal(shouldCompleteClearWave(ready), true);
  assert.equal(shouldCompleteClearWave({ ...ready, completionRule: 'boss-defeat' }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, elapsedFrames: 3599 }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, scheduledSpawnsComplete: false }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, scheduledEncountersComplete: false }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, activeThreatCount: 1 }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, warningActive: true }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, transitionPending: true }), false);
});

test('authored clear waves never fall through to legacy boss milestones', () => {
  const { shouldUseLegacyMilestoneEncounters } = loadWaveCompletion();

  assert.equal(shouldUseLegacyMilestoneEncounters({
    completionRule: 'clear-after-duration',
    configuredEventCount: 9,
    configuredEncounterCount: 0
  }), false);
  assert.equal(shouldUseLegacyMilestoneEncounters({
    completionRule: 'boss-defeat',
    configuredEventCount: 4,
    configuredEncounterCount: 0
  }), false);
  assert.equal(shouldUseLegacyMilestoneEncounters({
    completionRule: 'boss-defeat',
    configuredEventCount: 0,
    configuredEncounterCount: 0
  }), true);

  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /else if \(useLegacyMilestones\) \{\s*\/\/ Legacy milestone fallback/);
});

test('spawn escalation targets are shared by spawning and clear-wave completion', () => {
  const { getCampaignSpawnTargetCount } = loadWaveCompletion();
  assert.equal(getCampaignSpawnTargetCount({ count: 10, patternId: 'grid', campaignCycle: 0 }), 10);
  assert.equal(getCampaignSpawnTargetCount({ count: 10, patternId: 'grid', campaignCycle: 2 }), 12);
  assert.equal(getCampaignSpawnTargetCount({ count: 10, patternId: 'grid', campaignCycle: 10 }), 15);
  assert.equal(getCampaignSpawnTargetCount({ count: 4, patternId: 'single-random', campaignCycle: 5 }), 6);

  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /const count = this\.getConfiguredSpawnTargetCount\(event\)/);
  assert.match(engine, /this\.completeClearWaveIfReady\(\)/);
  assert.match(engine, /scheduledSpawnsComplete: this\.getConfiguredSpawnsComplete\(\)/);
  assert.match(engine, /activeThreatCount: this\.getActiveThreatCount\(\)/);
});
