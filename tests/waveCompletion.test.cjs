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

test('four five-Mission sectors own tactical Waves and reserve boss-defeat for direct major-boss Missions', () => {
  assert.equal(campaign.levels.length, 20);
  assert.equal(campaign.sectors.length, 4);
  assert.deepEqual(campaign.levels.slice(0, 5).map((level) => level.name), [
    'OPEN ORBIT', 'CITATION STORM', 'PAYWALL SIEGE', 'OPEN GALAXY', 'BASTION PROTOCOL'
  ]);
  const expectedWaveCounts = [5, 6, 5, 7, 1];
  const expectedRoles = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];

  campaign.sectors.forEach((sector) => {
    const levels = sector.missionIds.map((missionId) => campaign.levels.find((level) => level.id === missionId));
    assert.ok(levels.every(Boolean), `${sector.id} references five real Missions`);
    assert.deepEqual(levels.map((level) => level.waves.length), expectedWaveCounts);
    assert.deepEqual(levels.map((level) => level.campaignProgression.missionRole), expectedRoles);
  });

  campaign.levels.forEach((level) => {
    const isMajorBossMission = level.campaignProgression.missionRole === 'major-boss';
    level.waves.forEach((wave, index) => {
      const sector = campaign.sectors.find((candidate) => candidate.id === level.campaignProgression.sectorId);
      const majorBosses = wave.events.filter((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
      assert.equal(majorBosses.length, wave.completionRule === 'boss-defeat' ? 1 : 0, wave.id);
      assert.equal(wave.completionRule, isMajorBossMission ? 'boss-defeat' : 'clear-after-duration');
      if (isMajorBossMission) {
        assert.equal(level.waves.length, 1);
        assert.equal(index, 0);
        assert.equal(wave.events.length, 1);
      }
    });
  });
});

test('elite checkpoints and boss-preparation Missions finish with authored blocking climaxes', () => {
  const roleClimaxes = new Map([
    ['elite-checkpoint', new Set(['bottleneck-drone', 'paywall-wall'])],
    ['boss-preparation', new Set(['bottleneck-drone', 'paywall-wall'])]
  ]);

  for (const [role, allowedBossIds] of roleClimaxes) {
    const missions = campaign.levels.filter((level) => level.campaignProgression.missionRole === role);
    assert.equal(missions.length, 4);
    missions.forEach((level) => {
      const finalWave = level.waves.at(-1);
      const climax = finalWave.events.find((event) => event.kind === 'boss');
      assert.ok(climax, `${level.id} authors a ${role} climax`);
      assert.equal(allowedBossIds.has(climax.bossId), true);
      assert.equal(climax.blocksWaveClock, true);
      assert.equal(finalWave.completionRule, 'clear-after-duration');
      assert.equal(finalWave.delayAfterSeconds, 1.8);
    });
  }
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

test('internal waves pause only when Campaign checkpoint results are enabled', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /if \(!this\.isCurrentWaveStageFinal\(\)\) \{[\s\S]*?this\.beginTacticalWaveCompletion\('WAVE CLEAR!'/);
  assert.match(engine, /pauseAtInternalWaveResults\?: boolean/);
  assert.match(engine, /this\.pauseAtInternalWaveResults = options\.pauseAtInternalWaveResults \?\? false/);
  assert.match(engine, /beginTacticalWaveCompletion\([\s\S]*?if \(this\.pauseAtInternalWaveResults\) \{[\s\S]*?this\.waveVictoryReady = true;[\s\S]*?this\.gameActive = false;[\s\S]*?return;[\s\S]*?this\.startNextWave\(\);/);
  assert.match(engine, /continueToNextWave\(\)[\s\S]*?this\.startNextWave\(\);/);
  assert.match(engine, /const stageBoundary = [\s\S]*?previousEntry\.level\.id !== nextEntry\.level\.id/);
  assert.match(engine, /this\.resetWaveProgress\(stageBoundary\)/);
  assert.match(engine, /this\.introFlightDuration = stageBoundary/);
  assert.match(engine, /this\.wave = this\.getStageNumberForCampaignIndex\(\)/);
});

test('major-boss Missions expose a five-second movable reward window before the full takeoff cinematic', () => {
  const bossStages = campaign.levels.filter((level) => level.campaignProgression.missionRole === 'major-boss');
  assert.equal(bossStages.length, 4);
  bossStages.forEach((level) => assert.equal(level.waves.at(-1).delayAfterSeconds, 5));
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /STAGE_TAKEOFF_FRAMES = 180/);
  assert.match(engine, /STAGE_TAKEOFF_HOLD_FRAMES = 24/);
  assert.match(engine, /STAGE_TAKEOFF_LIFT_FRAMES = 30/);
  assert.match(engine, /STAGE_TAKEOFF_LAUNCH_FRAMES = 126/);
  assert.match(engine, /if \(this\.stageRewardCollectionFrames > 0\) \{[\s\S]*?this\.updateStageRewardCollection\(\)/);
  assert.match(engine, /updateStageRewardCollection\(\) \{[\s\S]*?this\.updatePlayerMovement\(this\.getPlayerMovementSpeed\(\)\)/);
  assert.match(
    engine,
    /beginStageTakeoff\(\) \{[\s\S]*?this\.clearStageBoundaryDebris\(true\);[\s\S]*?this\.refreshWaveVictorySummaryMetrics\(\)/
  );
});
