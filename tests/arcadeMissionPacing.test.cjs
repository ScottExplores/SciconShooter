const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);
const migration = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign-migration-v24.json'), 'utf8')
);
const breakwaterMissionIds = new Set(campaign.sectors[0].missionIds);

test('revision 24 uses compact continuous Missions with authored pressure through every climax', () => {
  assert.equal(campaign.revision, 24);
  // 220 authored at revision 24, plus 91 surge waves. Counts vary by sector so
  // the campaign grows richer as it goes: introductions run six waves (seven
  // from sector 7), each sector's first formation-remix runs eight from sector
  // 4, and boss-ended Missions stay compact per the pre-boss taper.
  assert.equal(campaign.levels.reduce((total, level) => total + level.waves.length, 0), 311);

  const regularMissions = campaign.levels.filter(
    (level) => level.campaignProgression.missionRole !== 'major-boss'
  );
  assert.equal(regularMissions.length, 50);

  const sectorOrderById = new Map(campaign.sectors.map((sector) => [sector.id, sector.order]));
  const firstRemixIds = new Set(campaign.sectors.map((sector) => (
    sector.missionIds.find((missionId) => (
      campaign.levels.find((level) => level.id === missionId)
        ?.campaignProgression.missionRole === 'formation-remix'
    ))
  )).filter(Boolean));

  for (const mission of regularMissions) {
    // Cadence is role- and sector-aware: pure-combat Missions carry surge
    // waves that deepen through the campaign, and boss-ended Missions stay
    // compact so the climax remains the fourth beat.
    const sectorOrder = sectorOrderById.get(mission.campaignProgression.sectorId);
    const role = mission.campaignProgression.missionRole;
    const expectedWaves = role === 'introduction'
      ? (sectorOrder >= 7 ? 7 : 6)
      : role === 'formation-remix'
        ? (firstRemixIds.has(mission.id) && sectorOrder >= 4 ? 8 : 7)
        : 4;
    assert.equal(mission.waves.length, expectedWaves, `${mission.id} keeps its role cadence`);
    const isBreakwater = breakwaterMissionIds.has(mission.id);
    if (isBreakwater) {
      // The first-sector pass corrects the stale pre-surge Mission estimate;
      // actual wave scheduling remains bounded and does not add idle time.
      const duration = mission.waves.reduce((sum, wave) => sum + wave.durationSeconds + wave.introSeconds + wave.delayAfterSeconds, 0);
      assert.ok(Math.abs(mission.durationSeconds - duration) < .001);
      assert.ok(mission.waves.every(wave => wave.durationSeconds <= 11.5));
    } else assert.ok(mission.durationSeconds <= 43.1);
    assert.equal(mission.waves.some((wave) => wave.rhythm === 'recovery'), false);

    for (const wave of mission.waves) {
      const spawns = wave.events.filter((event) => event.kind === 'spawn');
      assert.ok(spawns.length > 0, `${mission.id}/${wave.id} has active traffic`);
      assert.equal(Math.min(...spawns.map((event) => event.startSeconds)), 0);
      const starts = [...new Set(spawns.map((event) => event.startSeconds))].sort((a, b) => a - b);
      for (let index = 1; index < starts.length; index += 1) {
        assert.ok(
          starts[index] - starts[index - 1] <= (isBreakwater ? 3.6 : 2.5),
          `${mission.id}/${wave.id} never leaves a long authored entry gap`
        );
        if (isBreakwater) assert.ok(spawns.some(event => (
          event.startSeconds === starts[index - 1]
          && event.startSeconds + event.durationSeconds >= starts[index]
        )), 'the incoming wing overlaps the preceding combat beat');
      }
    }

    const climaxSpawns = mission.waves.at(-1).events.filter((event) => event.kind === 'spawn');
    const checkpoint = mission.waves.at(-1).events.find(event => event.kind === 'boss');
    if (isBreakwater && checkpoint) {
      assert.equal(climaxSpawns.length, 1, 'a deliberate escort beat clears the lane for the checkpoint');
      assert.ok(climaxSpawns[0].count >= 4);
      assert.ok(climaxSpawns[0].startSeconds + (climaxSpawns[0].count - 1) * climaxSpawns[0].spawnIntervalSeconds < checkpoint.startSeconds);
    } else {
      assert.ok(climaxSpawns.length >= 3, `${mission.id} ends with overlapping encounter groups`);
      assert.ok(Math.max(...climaxSpawns.map((event) => event.startSeconds)) >= 3.1);
    }

    const recoveryPressure = mission.waves.find((wave) => (
      wave.events.some((event) => event.kind === 'recovery')
    ));
    assert.ok(recoveryPressure);
    const recoverySpawns = recoveryPressure.events.filter((event) => event.kind === 'spawn');
    if (isBreakwater) {
      assert.equal(recoverySpawns.length, 2, 'salvage deliberately lowers pressure instead of adding another attack group');
      const targets = recoverySpawns.reduce((sum, event) => sum + event.count, 0);
      assert.ok(targets >= 7 && targets <= 9);
    } else assert.ok(recoverySpawns.length >= 3);
  }
});

test('major bosses follow one active intercept and a short direct alert', () => {
  const bossMissions = campaign.levels.filter(
    (level) => level.campaignProgression.missionRole === 'major-boss'
  );
  assert.equal(bossMissions.length, 10);

  for (const mission of bossMissions) {
    assert.equal(mission.waves.length, 2);
    const [intercept, finale] = mission.waves;
    assert.equal(intercept.durationSeconds, 12);
    assert.ok(intercept.events.filter((event) => event.kind === 'spawn').length >= 3);
    assert.ok(intercept.events.some((event) => event.kind === 'recovery'));
    assert.equal(finale.completionRule, 'boss-defeat');
    const boss = finale.events.find((event) => event.kind === 'boss');
    assert.ok(boss);
    assert.equal(boss.startSeconds, 0);
    assert.ok(boss.warningSeconds >= 1.2 && boss.warningSeconds <= 1.5);
  }
});

test('formation concurrency and migration metadata match the faster Campaign', async () => {
  const originalPacks = campaign.formationPacks.filter(pack => !pack.id.startsWith('pack-breakwater-'));
  const breakwaterPacks = campaign.formationPacks.filter(pack => pack.id.startsWith('pack-breakwater-'));
  assert.ok(originalPacks.every((pack) => pack.maximumSimultaneousInstances === 3));
  assert.ok(originalPacks.every((pack) => pack.recoveryRequiredSeconds === 0.4));
  assert.equal(breakwaterPacks.length, 25);
  assert.ok(breakwaterPacks.every(pack => pack.maximumSimultaneousInstances === 2 && pack.recoveryRequiredSeconds === .35));

  assert.equal(migration.fromRevision, 23);
  assert.equal(migration.toRevision, 24);
  assert.ok(migration.notes.some((note) => (
    note.includes('three formations')
    && note.includes('first 1.9 seconds')
    && note.includes('earlier sectors')
  )));
  assert.deepEqual(new Set(migration.preservedMissionIds), new Set(campaign.levels.map((level) => level.id)));
  assert.equal(Object.keys(migration.waveAliases).length, campaign.levels.length);
  for (const level of campaign.levels) {
    const currentWaveIds = new Set(level.waves.map((wave) => wave.id));
    const aliases = migration.waveAliases[level.id];
    assert.ok(aliases && Object.keys(aliases).length >= level.waves.length);
    assert.ok(Object.values(aliases).every((waveId) => currentWaveIds.has(waveId)));
  }

  const validator = await import(pathToFileURL(
    path.join(root, 'director', 'server', 'gameCampaignValidation.mjs')
  ).href);
  assert.deepEqual(validator.validateGameCampaign(campaign), { valid: true, errors: [] });
});

test('late pressure Waves author a readable third formation without front-loading early sectors', () => {
  const sectorOrderById = new Map(campaign.sectors.map((sector) => [sector.id, sector.order]));
  const tripleBurstWaves = [];

  for (const level of campaign.levels) {
    const sectorOrder = sectorOrderById.get(level.campaignProgression.sectorId);
    for (const wave of level.waves) {
      const groupedSpawns = wave.events
        .filter((event) => (
          event.kind === 'spawn'
          && !String(event.patternId).includes('single')
          && !String(event.patternId).includes('random')
        ))
        .sort((left, right) => left.startSeconds - right.startSeconds);
      if (groupedSpawns.length < 3) continue;

      const firstThree = groupedSpawns.slice(0, 3);
      const burstSpanSeconds = firstThree[2].startSeconds - firstThree[0].startSeconds;
      if (burstSpanSeconds > 2) continue;

      tripleBurstWaves.push({ level, wave, sectorOrder, firstThree });
      assert.ok(sectorOrder >= 7, `${level.id}/${wave.id} reserves triple overlap for late sectors`);
      assert.ok(wave.order >= 3, `${level.id}/${wave.id} teaches before combining three groups`);
      assert.deepEqual(
        firstThree.map((event) => event.startSeconds),
        [0, 0.95, 1.9],
        `${level.id}/${wave.id} uses a staggered, not simultaneous, triple entrance`
      );
      assert.ok(firstThree.every((event) => event.count >= 6));
      assert.ok(
        firstThree[0].startSeconds
          + (firstThree[0].count - 1) * firstThree[0].spawnIntervalSeconds
          >= firstThree[2].startSeconds,
        `${level.id}/${wave.id} starts group three while group one is visibly entering`
      );
    }
  }

  assert.equal(tripleBurstWaves.length, 12);
  assert.deepEqual(
    Object.fromEntries([7, 8, 9, 10].map((sectorOrder) => [
      sectorOrder,
      tripleBurstWaves.filter((entry) => entry.sectorOrder === sectorOrder).length
    ])),
    { 7: 3, 8: 3, 9: 3, 10: 3 }
  );
});

test('arcade swarms grow by sector and later sectors do not recycle one formation script', () => {
  const sectorOrderById = new Map(campaign.sectors.map((sector) => [sector.id, sector.order]));
  const groupedEvents = campaign.levels.flatMap((level) => {
    const sectorOrder = sectorOrderById.get(level.campaignProgression.sectorId);
    const minimumCount = Math.min(6, 4 + Math.floor((sectorOrder - 1) / 3));
    return level.waves.flatMap((wave) => wave.events
      .filter((event) => (
        event.kind === 'spawn'
        && !String(event.patternId).includes('single')
        && !String(event.patternId).includes('random')
      ))
      .map((event) => ({ level, wave, event, minimumCount })));
  });
  assert.ok(groupedEvents.length >= 380);
  for (const { level, wave, event, minimumCount } of groupedEvents) {
    if (event.id === 'stage-bastion-protocol-wave-1-breakwater-2') {
      assert.equal(event.count, 3, 'the final gate lead-in uses three armored escorts before the boss');
      assert.deepEqual(event.enemies.map(enemy => enemy.roleId), ['role-protocol-vanguard']);
      continue;
    }
    assert.ok(
      event.count >= minimumCount,
      `${level.id}/${wave.id}/${event.id} keeps a full ${minimumCount}-enemy arcade group`
    );
  }

  const mainMissionByDepth = new Map(campaign.campaignGraph.nodes
    .filter((node) => !node.nodeId.endsWith('b'))
    .map((node) => [
      node.depth,
      campaign.levels.find((level) => level.id === node.missionDefinitionId)
    ]));
  for (const slotOffset of [1, 2, 3, 4]) {
    const signatures = [];
    for (let depth = 16 + slotOffset - 1; depth <= 46 + slotOffset - 1; depth += 5) {
      const mission = mainMissionByDepth.get(depth);
      signatures.push(mission.waves.map((wave) => wave.events
        .filter((event) => event.kind === 'spawn')
        .map((event) => event.patternId)
        .join('+')).join('|'));
    }
    assert.ok(
      new Set(signatures).size >= 5,
      `later Campaign slot ${slotOffset} rotates formation choreography across sectors`
    );
  }
});

test('runtime keeps the compact cadence active without deleting player fire', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  assert.match(engine, /startY = anchoredPosition\?\.y \?\? -\(\(blockH \+ gap\) \* rows\) - 12/);
  assert.doesNotMatch(engine, /if \(this\.wave < 2\) return/);
  assert.match(
    engine,
    /clearThreatsForMainBoss\(\)[\s\S]*?entity\.isPlayerShot[\s\S]*?EntityType\.PROJECTILE[\s\S]*?EntityType\.MISSILE/
  );
  assert.match(engine, /CLEAR_FIELD_CURRENT_SQUADRON_BEAT_CEILING = 6/);
  assert.match(
    engine,
    /canAdvanceCurrentBeat[\s\S]*?getVisibleActiveThreatCount\(\) === 0[\s\S]*?getActiveCampaignPerformanceCost\(\)[\s\S]*?getCurrentMobilePerformanceBudget\(\) \* 0\.6/
  );
  assert.match(
    engine,
    /nextEncounterStart <= earliestSquadronStart/,
    'a later checkpoint cannot suppress an earlier pending squadron release'
  );
});

test('no disposable filler hostile is ever spawned to cover the authored Wave clock', () => {
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  // Continuity/lead-in drifters spawned non-scoring hostiles purely to plug
  // dead air and deleted them again at the clock boundary, which is what made
  // squadrons visibly evaporate mid-fight. The whole mechanism is gone.
  assert.doesNotMatch(engine, /INTERNAL_WAVE_LOOSE_ENTRY_/);
  assert.doesNotMatch(engine, /WAVE_CONTINUITY_LOOSE_ENEMY_INTERVAL_FRAMES/);
  assert.doesNotMatch(engine, /WAVE_CONTINUITY_MAX_LOOSE_ENEMIES/);
  assert.doesNotMatch(engine, /getWaveContinuityLooseEnemyCap/);
  assert.doesNotMatch(engine, /getLooseConfiguredSpawnEvent/);
  assert.doesNotMatch(engine, /internalWaveLooseEntriesRemaining/);
  assert.doesNotMatch(engine, /:continuity`/);
  assert.doesNotMatch(engine, /:lead-in`/);
});

test('every authored campaign hostile joins a formation so it can loop back instead of escaping', () => {
  // Normalized: this test slices method bodies by searching for '\n  }\n', and
  // a CRLF checkout (exactly what a Windows merge produces) made that
  // terminator unfindable -- indexOf returned -1 and slice(start, -1) silently
  // became "the rest of the file", so the assertions ran on the wrong region.
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8').replace(/\r\n/g, '\n');
  const configureStart = engine.indexOf('  configureEnemyFormation(');
  assert.ok(configureStart >= 0);
  const configureBody = engine.slice(configureStart, engine.indexOf('\n  }\n', configureStart));
  // The old early return excluded `single-*`/`*-random` patterns from the
  // entry -> hold -> dive -> return loop, so those hostiles flew straight off
  // the bottom of the playfield and could never be engaged again.
  assert.doesNotMatch(
    configureBody,
    /if \(patternId\.includes\('single'\) \|\| patternId\.includes\('random'\)\) return;/
  );
  assert.match(configureBody, /enemy\.formationState = 'entry'/);

  // The wave-end retire pass must leave formation members alone; they are
  // mid dive-and-return, not stranded.
  const retireStart = engine.indexOf('  retireStrandedRegularThreatsAtWaveEnd()');
  assert.ok(retireStart >= 0, 'the retire pass is scoped to stranded hostiles');
  const retireEnd = engine.indexOf('\n  }\n', retireStart);
  assert.ok(retireEnd > retireStart, 'the retire body terminator must be found');
  const retireBody = engine.slice(retireStart, retireEnd);
  assert.match(retireBody, /if \(entity\.formationState\) continue;/);
  assert.doesNotMatch(retireBody, /campaignFiller/);
});
