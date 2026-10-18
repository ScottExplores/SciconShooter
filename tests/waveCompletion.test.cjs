const { isRevampMission, assertMissionCadence, assertRevampMission, bosses } = require('./helpers/campaignRevampAssertions.cjs');
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

test('ten five-Mission sectors own tactical Waves and reserve boss-defeat for major-boss finales', () => {
  assert.equal(campaign.levels.length, 60);
  assert.equal(campaign.sectors.length, 10);
  assert.deepEqual(campaign.levels.slice(0, 5).map((level) => level.name), [
    'ORBIT ENTRY', 'CITATION CROSSING', 'PAYWALL CHECKPOINT', 'BASTION APPROACH', 'BASTION PROTOCOL'
  ]);
  // Sector-aware surge cadence: introductions 7 from sector 7, first remixes
  // 8 from sector 4, boss-ended Missions stay compact.
  const expectedRoles = ['introduction', 'formation-remix', 'elite-checkpoint', 'boss-preparation', 'major-boss'];

  campaign.sectors.forEach((sector) => {
    const levels = sector.missionIds.map((missionId) => campaign.levels.find((level) => level.id === missionId));
    assert.ok(levels.every(Boolean), `${sector.id} references five real Missions`);
    levels.forEach(assertMissionCadence);
    assert.deepEqual(levels.map((level) => level.campaignProgression.missionRole), expectedRoles);
  });

  campaign.levels.forEach((level) => {
    const isMajorBossMission = level.campaignProgression.missionRole === 'major-boss';
    level.waves.forEach((wave, index) => {
      const isMajorBossFinale = isMajorBossMission && index === level.waves.length - 1;
      const sector = campaign.sectors.find((candidate) => candidate.id === level.campaignProgression.sectorId);
      const majorBosses = wave.events.filter((event) => event.kind === 'boss' && event.bossId === sector.majorBossId);
      assert.equal(majorBosses.length, wave.completionRule === 'boss-defeat' ? 1 : 0, wave.id);
      assert.equal(wave.completionRule, isMajorBossFinale ? 'boss-defeat' : 'clear-after-duration');
      if (isMajorBossFinale) {
        assert.ok(level.waves.length >= 2 && level.waves.length <= 8);
        assert.equal(index, level.waves.length - 1);
        assert.equal(wave.events.length, 1);
        assert.equal(wave.events[0].startSeconds, 0);
        assert.ok(wave.events[0].warningSeconds <= 1.5);
      }
    });
  });
});

test('elite checkpoints and boss-preparation Missions finish with authored blocking climaxes', () => {
  const authoredMiniBossIds = new Set(campaign.miniBosses.map((entry) => entry.bossId));
  const roleClimaxes = new Map([
    ['elite-checkpoint', authoredMiniBossIds],
    ['boss-preparation', authoredMiniBossIds]
  ]);

  for (const [role, allowedBossIds] of roleClimaxes) {
    const missions = campaign.levels.filter((level) => level.campaignProgression.missionRole === role);
    assert.equal(missions.length, campaign.sectors.length);
    missions.forEach((level) => {
      const finalWave = level.waves.find(wave => wave.events.some(event => event.kind === 'boss'));
      const climax = finalWave.events.find((event) => event.kind === 'boss');
      assert.ok(climax, `${level.id} authors a ${role} climax`);
      assert.equal(allowedBossIds.has(climax.bossId), true);
      assert.equal(climax.blocksWaveClock, true);
      assert.equal(finalWave.completionRule, 'clear-after-duration');
      assert.ok(finalWave.delayAfterSeconds >= 0 && finalWave.delayAfterSeconds <= 1);
      if (isRevampMission(level)) assertRevampMission(level, campaign);
    });
  }
});

test('clear-wave completion waits for schedules, warnings, and every hostile', () => {
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
  assert.equal(shouldCompleteClearWave({ ...ready, scheduledSpawnsComplete: false }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, scheduledEncountersComplete: false }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, activeThreatCount: 1 }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, warningActive: true }), false);
  assert.equal(shouldCompleteClearWave({ ...ready, transitionPending: true }), false);
});

test('a cleared squadron ends the Wave immediately instead of idling out the clock', () => {
  const { shouldCompleteClearWave } = loadWaveCompletion();
  const clearedEarly = {
    completionRule: 'clear-after-duration',
    elapsedFrames: 120,
    durationFrames: 3600,
    scheduledSpawnsComplete: true,
    scheduledEncountersComplete: true,
    activeThreatCount: 0,
    warningActive: false,
    transitionPending: false
  };

  // durationSeconds is a spawning schedule, not a stopwatch. Making the player
  // stare at an empty playfield until it expires is the dead air that the old
  // continuity-drifter system existed to hide.
  assert.equal(shouldCompleteClearWave(clearedEarly), true);
  // Authored pacing still holds: an unreleased spawn group keeps the Wave open.
  assert.equal(shouldCompleteClearWave({ ...clearedEarly, scheduledSpawnsComplete: false }), false);
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

test('internal waves advance seamlessly and only Mission boundaries create results', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /if \(!this\.isCurrentWaveStageFinal\(\)\) \{[\s\S]*?this\.beginTacticalWaveCompletion\(\)/);
  assert.doesNotMatch(engine, /pauseAtInternalWaveResults/);
  const tacticalStart = engine.indexOf('  beginTacticalWaveCompletion()');
  const tacticalEnd = engine.indexOf('\n  beginStageCompletion(', tacticalStart);
  const tacticalSource = engine.slice(tacticalStart, tacticalEnd);
  assert.ok(tacticalStart >= 0 && tacticalEnd > tacticalStart);
  assert.match(tacticalSource, /this\.startNextWave\(\)/);
  assert.doesNotMatch(tacticalSource, /buildWaveVictorySummary|spawnFloatingText|playSound|waveVictoryReady|gameActive = false/);
  assert.match(engine, /continueToNextWave\(\)[\s\S]*?this\.startNextWave\(\);/);
  assert.match(engine, /const stageBoundary = [\s\S]*?previousEntry\.level\.id !== nextEntry\.level\.id/);
  assert.match(engine, /const seamlessStageBoundary = stageBoundary && this\.continuousStageBoundaries/);
  assert.match(engine, /this\.resetWaveProgress\(stageBoundary\)/);
  assert.match(engine, /if \(stageBoundary && !seamlessStageBoundary\) \{[\s\S]*?this\.beginWavePresentation\('mission'\);[\s\S]*?this\.playSound\('wave'\);[\s\S]*?\} else \{[\s\S]*?this\.beginWavePresentation\('internal-wave'\);[\s\S]*?\}/);
  assert.match(engine, /this\.introFlightDuration = stageBoundary && !seamlessStageBoundary/);
  assert.match(engine, /this\.wave = this\.getStageNumberForCampaignIndex\(\)/);
  assert.match(tacticalSource, /this\.clearStageBoundaryDebris\(false, true, false, true\)/);
  assert.match(
    engine,
    /retireStrandedRegularThreatsAtWaveEnd\(\)[\s\S]*?this\.waveProgressFrames < this\.getConfiguredWaveDurationFrames\(\)[\s\S]*?getConfiguredSpawnsComplete\(\)[\s\S]*?if \(entity\.formationState\) continue;[\s\S]*?entity\.markedForDeletion = true/
  );
  assert.match(
    engine,
    /this\.applyResearchBeamDamage\(\);[\s\S]*?this\.retireStrandedRegularThreatsAtWaveEnd\(\);[\s\S]*?this\.compactEntities\(\);[\s\S]*?this\.completeClearWaveIfReady\(\)/
  );
  assert.match(
    engine,
    /recordWaveVictoryKill[\s\S]*?stats\.enemiesDefeated\+\+[\s\S]*?countsTowardCampaignRewards\)[\s\S]*?this\.spawnCoin/
  );
  assert.doesNotMatch(engine, /internalWaveLooseEntriesRemaining|INTERNAL_WAVE_LOOSE_ENTRY/);
  assert.doesNotMatch(engine, /getLooseConfiguredSpawnEvent|WAVE_CONTINUITY_LOOSE_ENEMY/);
  assert.match(engine, /spawnConfiguredEnemies\(\)[\s\S]*?for \(const event of events\)/);
  assert.match(engine, /this\.playerVel = \{ x: 0, y: 0 \};[\s\S]*?this\.playerTilt = 0;[\s\S]*?if \(this\.introFlightFrames > 0\)/);
});

test('major-boss Missions expose a five-second movable reward window before the full takeoff cinematic', () => {
  const bossStages = campaign.levels.filter((level) => level.campaignProgression.missionRole === 'major-boss');
  assert.equal(bossStages.length, campaign.sectors.length);
  const { loadService } = require('./helpers/loadService.cjs');
  const { getMissionRewardCollectionSeconds } = loadService(path.join(root, 'services/gameplay/missionRewardWindow.ts'));
  bossStages.forEach((level) => assert.equal(getMissionRewardCollectionSeconds({
    authoredSeconds: level.waves.at(-1).delayAfterSeconds, liveCoins: true, majorBossFinale: true
  }), 5));
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /const collectionSeconds = getMissionRewardCollectionSeconds\(/);
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
