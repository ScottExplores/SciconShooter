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

test('five stages own their internal waves and only stage finales may use boss-defeat', () => {
  assert.deepEqual(campaign.levels.map((level) => level.name), [
    'OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY', 'BASTION PROTOCOL'
  ]);
  assert.deepEqual(campaign.levels.map((level) => level.waves.length), [3, 3, 3, 3, 5]);

  campaign.levels.forEach((level) => {
    level.waves.forEach((wave, index) => {
      const gatekeepers = wave.events.filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper');
      assert.equal(gatekeepers.length, wave.completionRule === 'boss-defeat' ? 1 : 0, wave.id);
      if (index < level.waves.length - 1) assert.equal(wave.completionRule, 'clear-after-duration');
    });
  });
});

test('bossless stages finish with authored asteroid and elite climaxes', () => {
  const bosslessStages = [campaign.levels[1], campaign.levels[3]];
  const packsByStage = bosslessStages.map((level) => level.waves.flatMap((wave) => wave.events).filter((event) => (
    event.kind === 'spawn' && event.enemies.every((enemy) => enemy.rank === 'elite')
  )));

  assert.deepEqual(packsByStage.map((packs) => packs.map((pack) => pack.count)), [[3, 4], [3, 4]]);
  packsByStage.flat().forEach((pack) => {
    assert.notEqual(pack.patternId, 'single-random');
    assert.ok(pack.enemies.every((enemy) => enemy.attackPatternId === 'aimed-burst'));
    assert.ok(pack.enemies.every((enemy) => enemy.sizeMultiplier > 1));
  });

  const earlyHealth = packsByStage[0].map((pack) => pack.enemies[0].health);
  const lateHealth = packsByStage[1].map((pack) => pack.enemies[0].health);
  assert.ok(Math.min(...lateHealth) > Math.max(...earlyHealth));
  const asteroidClimax = bosslessStages[0].waves.at(-1).events.at(-1);
  assert.equal(asteroidClimax.id, 'citation-storm-asteroid-belt');
  assert.equal(asteroidClimax.count, 36);
  assert.equal(asteroidClimax.spriteStyle.brightness, 0.56);
  assert.equal(bosslessStages[1].waves.at(-1).events.at(-1).id, 'open-galaxy-elite-frontier-pack');
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

test('internal waves advance immediately while stage finales own departure and records', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /if \(!this\.isCurrentWaveStageFinal\(\)\) \{[\s\S]*?this\.startNextWave\(\);/);
  assert.match(engine, /const stageBoundary = [\s\S]*?previousEntry\.level\.id !== nextEntry\.level\.id/);
  assert.match(engine, /this\.resetWaveProgress\(stageBoundary\)/);
  assert.match(engine, /this\.introFlightDuration = stageBoundary/);
  assert.match(engine, /this\.wave = this\.getStageNumberForCampaignIndex\(\)/);
});

test('Gatekeeper stages expose a five-second movable reward window before fixed takeoff', () => {
  const bossStages = [campaign.levels[0], campaign.levels[2], campaign.levels[4]];
  bossStages.forEach((level) => assert.equal(level.waves.at(-1).delayAfterSeconds, 5));
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /const STAGE_TAKEOFF_FRAMES = 120/);
  assert.match(engine, /if \(this\.stageRewardCollectionFrames > 0\) \{[\s\S]*?this\.updateStageRewardCollection\(\)/);
  assert.match(engine, /updateStageRewardCollection\(\) \{[\s\S]*?this\.updatePlayerMovement\(this\.getPlayerMovementSpeed\(\)\)/);
  assert.match(engine, /this\.bankDepartingBossCoins\(\)/);
});
