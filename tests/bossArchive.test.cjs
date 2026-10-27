const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const campaign = JSON.parse(
  fs.readFileSync(path.join(root, 'game-config', 'campaign.json'), 'utf8')
);

const clone = (value) => JSON.parse(JSON.stringify(value));

const loadBossArchive = (campaignFixture = campaign) => {
  const source = fs.readFileSync(path.join(root, 'services', 'bossArchive.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === '../constants') {
      return {
        ASSETS: {
          PIXI_BOSS_OPEN_ORBIT_ARM_LEFT: '/components/open-orbit-left.png',
          PIXI_BOSS_OPEN_ORBIT_ARM_RIGHT: '/components/open-orbit-right.png',
          PIXI_BOSS_PAYWALL_CANNON_LEFT: '/components/paywall-left.png',
          PIXI_BOSS_PAYWALL_CANNON_RIGHT: '/components/paywall-right.png',
          PIXI_BOSS_PAYWALL_HELMET: '/components/paywall-helmet.png'
        }
      };
    }
    if (request === '../game-config/catalog') {
      const majorBossIds = new Set([
        'gatekeeper',
        ...(campaignFixture.sectors || []).map((sector) => sector.majorBossId)
      ]);
      return { isMajorBossId: (bossId) => majorBossIds.has(bossId) };
    }
    if (request === './levelConfig') {
      return {
        DEFAULT_GAME_CAMPAIGN: campaignFixture,
        cloneGameCampaign: clone,
        getAssetPaths: (assetKey) => [`/resolved/${assetKey}/frame-1`, `/resolved/${assetKey}/frame-2`],
        getPrimaryAssetPath: (assetKey) => `/resolved/${assetKey}`
      };
    }
    return require(request);
  };
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, localRequire, module);`,
    { module, localRequire, Object, Map, Set, Array, Boolean, Math, Number, String }
  );
  return module.exports;
};

const archive = loadBossArchive();

const majorBossIds = new Set(['gatekeeper', ...(campaign.sectors || []).map((sector) => sector.majorBossId)]);
const authoredMajorBosses = campaign.levels
  .slice()
  .sort((left, right) => left.order - right.order)
  .flatMap((level) => level.waves
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((wave) => wave.events
      .filter((event) => event.kind === 'boss' && majorBossIds.has(event.bossId))
      .map((event) => ({ level, wave, event }))));

test('catalog uses exact authored canonical major-boss event IDs in campaign order', () => {
  assert.equal(archive.BOSS_ARCHIVE_CATALOG.length, authoredMajorBosses.length);
  assert.deepEqual(
    Array.from(archive.BOSS_ARCHIVE_CATALOG, (entry) => entry.eventId),
    authoredMajorBosses.map(({ event }) => event.id)
  );
  assert.equal(new Set(archive.BOSS_ARCHIVE_CATALOG.map((entry) => entry.eventId)).size, authoredMajorBosses.length);

  archive.BOSS_ARCHIVE_CATALOG.forEach((entry, index) => {
    const authored = authoredMajorBosses[index];
    assert.equal(entry.bossId, authored.event.bossId);
    assert.equal(entry.missionId, authored.level.id);
    assert.equal(entry.missionNumber, authored.level.order);
    assert.equal(entry.waveId, authored.wave.id);
    assert.equal(entry.waveNumber, authored.wave.order);
    assert.equal(entry.spriteKey, authored.event.spriteKey);
    assert.equal(entry.artUrl, `/resolved/${authored.event.spriteKey}`);
    assert.equal(Object.isFrozen(entry), true);
  });
  assert.equal(Object.isFrozen(archive.BOSS_ARCHIVE_CATALOG), true);
});

test('every archive entry carries immutable presentation, reward, and three-objective mastery data', () => {
  archive.BOSS_ARCHIVE_CATALOG.forEach((entry) => {
    const expectedReward = 100 + (20 * Math.floor((entry.missionNumber - 1) / 5));
    const expectedSpeedTarget = 75 + (2.5 * (entry.missionNumber - 1));

    assert.ok(entry.subtitle.length > 0);
    assert.ok(entry.description.length > 0);
    assert.ok(entry.mechanicTags.length > 0);
    assert.ok(entry.mechanicTags.length <= 4);
    assert.ok(entry.difficulty.tier >= 1 && entry.difficulty.tier <= 5);
    assert.equal(entry.theme.backgroundId, authoredMajorBosses.find(({ event }) => event.id === entry.eventId).wave.backgroundId);
    assert.match(entry.theme.accentColor, /^#[0-9a-f]{6}$/i);
    assert.equal(entry.preview.portraitUrl, entry.artUrl);
    assert.deepEqual(Array.from(entry.preview.idleFrameUrls), [entry.artUrl]);
    assert.equal(entry.preview.idleFramesPerSecond, 0);
    assert.equal(entry.variants.length, 1);
    assert.equal(entry.variants[0].id, 'standard');
    assert.equal(entry.challenge.dailyChargeCost, 1);
    assert.equal(entry.challenge.reward.resource, 'coins');
    assert.equal(entry.challenge.reward.amount, expectedReward);
    assert.equal(entry.masteryObjectives.length, 3);
    assert.deepEqual(
      Array.from(entry.masteryObjectives, (objective) => objective.id),
      ['challenge-clear', 'no-hit-clear', 'timed-clear']
    );
    assert.equal(entry.masteryObjectives[2].target, expectedSpeedTarget);
    assert.deepEqual(
      Array.from(entry.masteryObjectives, (objective) => objective.rewardCoins),
      [0.75, 1, 1.25].map((multiplier) => Math.round(expectedReward * multiplier))
    );

    [
      entry.mechanicTags,
      entry.difficulty,
      entry.theme,
      entry.preview,
      entry.preview.idleFrameUrls,
      ...(entry.preview.composition
        ? [entry.preview.composition, entry.preview.composition.layers, ...entry.preview.composition.layers]
        : []),
      entry.variants,
      entry.variants[0],
      entry.challenge,
      entry.challenge.reward,
      entry.masteryObjectives,
      ...entry.masteryObjectives,
      entry.lockedPresentation,
      entry.lockedPresentation.mechanicTags
    ].forEach((value) => assert.equal(Object.isFrozen(value), true));
  });
});

test('detachable Archive bosses expose complete static neutral compositions', () => {
  const gatekeeper = archive.BOSS_ARCHIVE_CATALOG.find(
    (entry) => entry.spriteKey === 'PIXI_BOSS_OPEN_ORBIT_FRAMES'
  );
  const paywall = archive.BOSS_ARCHIVE_CATALOG.find(
    (entry) => entry.spriteKey === 'PIXI_BOSS_PAYWALL_FRAMES'
  );
  assert.ok(gatekeeper?.preview.composition);
  assert.ok(paywall?.preview.composition);
  assert.deepEqual(
    Array.from(gatekeeper.preview.composition.layers, (layer) => layer.url),
    [
      gatekeeper.artUrl,
      '/components/open-orbit-left.png',
      '/components/open-orbit-right.png'
    ]
  );
  assert.deepEqual(
    Array.from(paywall.preview.composition.layers, (layer) => layer.url),
    [
      paywall.artUrl,
      '/components/paywall-left.png',
      '/components/paywall-right.png',
      '/components/paywall-helmet.png'
    ]
  );
  assert.equal(gatekeeper.preview.composition.layers[1].rotationDegrees, -2.292);
  assert.equal(gatekeeper.preview.composition.layers[2].rotationDegrees, 2.292);
  assert.equal(paywall.preview.composition.layers[3].width, 70.4);
  archive.BOSS_ARCHIVE_CATALOG
    .filter((entry) => ![gatekeeper.eventId, paywall.eventId].includes(entry.eventId))
    .forEach((entry) => assert.equal(entry.preview.composition, undefined));
});

test('future authored bosses receive safe defaults and spoiler-free locked presentation', () => {
  const futureCampaign = clone(campaign);
  const level = futureCampaign.levels.find((candidate) => candidate.waves.some((wave) => wave.events.some(
    (event) => event.kind === 'boss' && majorBossIds.has(event.bossId)
  )));
  const wave = level.waves.find((candidate) => candidate.events.some(
    (event) => event.kind === 'boss' && majorBossIds.has(event.bossId)
  ));
  const template = wave.events.find(
    (event) => event.kind === 'boss' && majorBossIds.has(event.bossId)
  );
  const futureEvent = {
    ...clone(template),
    id: 'future-authored-gatekeeper',
    label: 'Spoiler Boss Name',
    rigId: 'future-rig',
    movementPatternId: 'future-movement',
    weapons: template.weapons.map((weapon, index) => ({
      ...clone(weapon),
      weaponId: `future-weapon-${index}`
    }))
  };
  wave.events.push(futureEvent);

  const futureArchive = loadBossArchive(futureCampaign);
  const entry = futureArchive.getBossArchiveEntry(futureEvent.id);
  assert.ok(entry);
  assert.equal(entry.eventId, futureEvent.id);
  assert.equal(entry.subtitle, 'MAJOR BOSS');
  assert.equal(entry.description, `${futureEvent.label} commands the final defense of ${level.name}.`);
  assert.deepEqual(Array.from(entry.mechanicTags), ['Combat Pattern']);
  assert.equal(entry.lockedPresentation.label, 'Unknown Signal');
  assert.equal(entry.lockedPresentation.portraitUrl, null);
  assert.deepEqual(Array.from(entry.lockedPresentation.mechanicTags), []);
  assert.doesNotMatch(entry.lockedPresentation.description, new RegExp(futureEvent.label, 'i'));
  assert.doesNotMatch(entry.lockedPresentation.subtitle, new RegExp(futureEvent.label, 'i'));
  assert.doesNotMatch(entry.lockedPresentation.campaignHint, new RegExp(futureEvent.label, 'i'));

  const replay = futureArchive.buildBossReplayCampaign(futureEvent.id);
  const replayWave = replay.levels
    .find((candidate) => candidate.id === level.id)
    .waves.find((candidate) => candidate.id === wave.id);
  assert.equal(replayWave.events.length, 1);
  assert.equal(replayWave.events[0].id, futureEvent.id);
  assert.equal(replayWave.events[0].startSeconds, 0);
});

test('normalization rejects unknown IDs, removes duplicates, and restores campaign order', () => {
  const first = archive.BOSS_ARCHIVE_CATALOG[0];
  const second = archive.BOSS_ARCHIVE_CATALOG[1];

  assert.equal(
    archive.normalizeBossArchiveEventId(`  ${first.eventId.toUpperCase()}  `),
    first.eventId
  );
  assert.equal(archive.normalizeBossArchiveEventId('gatekeeper'), null);
  assert.equal(archive.normalizeBossArchiveEventId(null), null);
  assert.deepEqual(
    archive.normalizeBossArchiveEventIds([
      second.eventId,
      'unknown-event',
      first.eventId.toUpperCase(),
      second.eventId
    ]),
    [first.eventId, second.eventId]
  );
  assert.deepEqual(Array.from(archive.normalizeBossArchiveEventIds('not-an-array')), []);
  assert.equal(archive.getBossArchiveEntry(first.eventId)?.eventId, first.eventId);
  assert.equal(archive.getBossArchiveEntry('unknown-event'), null);
});

test('unlocked entries and unseen counts never expose locked or repeated bosses', () => {
  const [first, second, third] = archive.BOSS_ARCHIVE_CATALOG;
  const unlocked = [third.eventId, first.eventId, first.eventId, 'unknown-event'];

  assert.deepEqual(
    Array.from(archive.getUnlockedBossArchiveEntries(unlocked), (entry) => entry.eventId),
    [first.eventId, third.eventId]
  );
  assert.equal(archive.isBossArchiveEntryUnlocked(first.eventId, unlocked), true);
  assert.equal(archive.isBossArchiveEntryUnlocked(second.eventId, unlocked), false);
  assert.equal(archive.getNewBossArchiveCount(unlocked, [first.eventId]), 1);
  assert.equal(archive.getNewBossArchiveCount(unlocked, [first.eventId, third.eventId]), 0);
});

test('legacy inference is conservative and can recover final-campaign and counter-only saves', () => {
  const throughMissionFive = archive.BOSS_ARCHIVE_CATALOG
    .filter((entry) => entry.missionNumber <= 5)
    .map((entry) => entry.eventId);
  assert.deepEqual(
    archive.inferLegacyBossArchiveEventIds({ highestWave: 6, bossesDefeated: 5 }),
    throughMissionFive
  );

  const beforeFinal = archive.BOSS_ARCHIVE_CATALOG
    .filter((entry) => entry.missionNumber < 20)
    .map((entry) => entry.eventId);
  assert.deepEqual(
    archive.inferLegacyBossArchiveEventIds({ highestMission: 20, bossesDefeated: 19 }),
    beforeFinal
  );
  assert.deepEqual(
    archive.inferLegacyBossArchiveEventIds({ highestMission: 20, bossesDefeated: 20 }),
    archive.BOSS_ARCHIVE_CATALOG.map((entry) => entry.eventId)
  );
  assert.deepEqual(
    archive.inferLegacyBossArchiveEventIds({ bossesDefeated: 2 }),
    archive.BOSS_ARCHIVE_CATALOG.slice(0, 2).map((entry) => entry.eventId)
  );
  assert.deepEqual(Array.from(archive.inferLegacyBossArchiveEventIds(null)), []);
});

test('replay campaign preserves structure and replaces only the selected boss wave events', () => {
  const selected = archive.BOSS_ARCHIVE_CATALOG.find((entry) => entry.missionNumber === 10);
  assert.ok(selected);
  const replay = archive.buildBossReplayCampaign(selected.eventId);
  assert.ok(replay);
  assert.notEqual(replay, campaign);
  assert.equal(replay.levels.length, campaign.levels.length);
  assert.deepEqual(
    replay.levels.map((level) => level.waves.length),
    campaign.levels.map((level) => level.waves.length)
  );

  for (const originalMission of campaign.levels) {
    const replayMission = replay.levels.find((mission) => mission.id === originalMission.id);
    assert.ok(replayMission);
    for (const originalWave of originalMission.waves) {
      const replayWave = replayMission.waves.find((wave) => wave.id === originalWave.id);
      assert.ok(replayWave);
      if (originalWave.id !== selected.waveId) {
        assert.deepEqual(replayWave, originalWave);
        continue;
      }

      const { events: originalEvents, ...originalWaveMetadata } = originalWave;
      const { events: replayEvents, ...replayWaveMetadata } = replayWave;
      assert.deepEqual(replayWaveMetadata, originalWaveMetadata);
      assert.equal(replayEvents.length, 1);
      assert.equal(replayEvents[0].id, selected.eventId);
      assert.equal(replayEvents[0].startSeconds, 0);
      const originalBoss = originalEvents.find((event) => event.id === selected.eventId);
      assert.ok(originalBoss);
      assert.deepEqual(
        { ...replayEvents[0], startSeconds: originalBoss.startSeconds },
        originalBoss
      );
    }
  }

  const originalSelected = campaign.levels
    .flatMap((level) => level.waves)
    .flatMap((wave) => wave.events)
    .find((event) => event.id === selected.eventId);
  assert.equal(originalSelected.startSeconds, 0);
  assert.equal(archive.buildBossReplayCampaign('unknown-event'), null);
});

test('archive Easy stays authored while Medium and Heroic scale only the cloned boss', () => {
  const selected = archive.BOSS_ARCHIVE_CATALOG.find((entry) => entry.missionNumber === 10)
    ?? archive.BOSS_ARCHIVE_CATALOG[0];
  const originalSnapshot = clone(campaign);
  const authoredBoss = campaign.levels
    .find((level) => level.id === selected.missionId)
    .waves.find((wave) => wave.id === selected.waveId)
    .events.find((event) => event.id === selected.eventId);
  const replayBoss = (difficultyId) => archive.buildBossReplayCampaign(selected.eventId, difficultyId)
    .levels.find((level) => level.id === selected.missionId)
    .waves.find((wave) => wave.id === selected.waveId)
    .events[0];

  const easy = replayBoss('easy');
  const medium = replayBoss('medium');
  const heroic = replayBoss('heroic');
  assert.equal(archive.normalizeBossArchiveDifficultyId(undefined), 'easy');
  assert.equal(archive.normalizeBossArchiveDifficultyId('unknown'), 'easy');
  assert.deepEqual(replayBoss(undefined), easy);
  assert.equal(easy.health, authoredBoss.health);
  assert.equal(easy.speed, authoredBoss.speed);
  assert.equal(medium.health, authoredBoss.health * 1.25);
  assert.equal(heroic.health, authoredBoss.health * 1.65);
  assert.equal(medium.speed, authoredBoss.speed * 1.12);
  assert.equal(heroic.speed, authoredBoss.speed * 1.28);
  assert.equal(easy.weapons[0].damage, authoredBoss.weapons[0].damage);
  assert.equal(heroic.weapons[0].damage, authoredBoss.weapons[0].damage);
  assert.equal(easy.weapons[0].attackIntervalSeconds, authoredBoss.weapons[0].attackIntervalSeconds);
  assert.ok(medium.weapons[0].attackIntervalSeconds < authoredBoss.weapons[0].attackIntervalSeconds);
  assert.ok(heroic.weapons[0].attackIntervalSeconds < authoredBoss.weapons[0].attackIntervalSeconds);
  assert.deepEqual(
    easy.phases.map((phase) => phase.speedMultiplier),
    authoredBoss.phases.map((phase) => phase.speedMultiplier)
  );
  assert.deepEqual(
    heroic.phases.map((phase) => phase.speedMultiplier),
    authoredBoss.phases.map((phase) => phase.speedMultiplier)
  );
  if (authoredBoss.componentHealth) {
    for (const [componentId, health] of Object.entries(authoredBoss.componentHealth)) {
      assert.equal(easy.componentHealth[componentId], health);
      assert.equal(medium.componentHealth[componentId], health * 1.25);
      assert.equal(heroic.componentHealth[componentId], health * 1.65);
    }
  }
  assert.deepEqual(campaign, originalSnapshot);
  assert.deepEqual(
    Array.from(archive.BOSS_ARCHIVE_DIFFICULTIES, ({ id, healthMultiplier, tempoMultiplier }) => ({
      id,
      healthMultiplier,
      tempoMultiplier
    })),
    [
      { id: 'easy', healthMultiplier: 1, tempoMultiplier: 1 },
      { id: 'medium', healthMultiplier: 1.25, tempoMultiplier: 1.12 },
      { id: 'heroic', healthMultiplier: 1.65, tempoMultiplier: 1.28 }
    ]
  );
});

test('every Archive boss keeps exact Easy combat data and carries exact hard-mode tempo', () => {
  for (const entry of archive.BOSS_ARCHIVE_CATALOG) {
    const authored = campaign.levels
      .find((level) => level.id === entry.missionId)
      .waves.find((wave) => wave.id === entry.waveId)
      .events.find((event) => event.id === entry.eventId);
    const replayBoss = (difficultyId) => archive.buildBossReplayCampaign(entry.eventId, difficultyId)
      .levels.find((level) => level.id === entry.missionId)
      .waves.find((wave) => wave.id === entry.waveId)
      .events[0];
    const easy = replayBoss('easy');
    const medium = replayBoss('medium');
    const heroic = replayBoss('heroic');
    const { startSeconds: authoredStartSeconds, ...authoredCombatData } = authored;
    const { startSeconds: easyStartSeconds, ...easyCombatData } = easy;

    assert.notEqual(authoredStartSeconds, undefined);
    assert.equal(easyStartSeconds, 0);
    assert.deepEqual(easyCombatData, authoredCombatData, entry.eventId);
    assert.equal('attackTempoMultiplier' in easy, false, entry.eventId);
    assert.equal(medium.attackTempoMultiplier, 1.12, entry.eventId);
    assert.equal(heroic.attackTempoMultiplier, 1.28, entry.eventId);
    assert.ok(medium.health > easy.health, entry.eventId);
    assert.ok(heroic.health > medium.health, entry.eventId);
    assert.ok(medium.weapons.every((weapon, index) => (
      weapon.attackIntervalSeconds < easy.weapons[index].attackIntervalSeconds
      && weapon.damage === easy.weapons[index].damage
      && weapon.projectileSpeed === easy.weapons[index].projectileSpeed
    )), entry.eventId);
    assert.ok(heroic.weapons.every((weapon, index) => (
      weapon.attackIntervalSeconds < medium.weapons[index].attackIntervalSeconds
      && weapon.damage === easy.weapons[index].damage
      && weapon.projectileSpeed === easy.weapons[index].projectileSpeed
    )), entry.eventId);
  }
});

test('service imports the canonical art resolver rather than constructing asset paths', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'bossArchive.ts'), 'utf8');
  assert.match(source, /getPrimaryAssetPath/);
  assert.match(source, /const artUrl = getPrimaryAssetPath\(event\.spriteKey\)/);
  assert.doesNotMatch(source, /getAssetPaths\(event\.spriteKey\)/);
  assert.doesNotMatch(source, /\/game-art\//);
});

test('production integration unlocks only authored boss victories and keeps replays noncompetitive', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const startScreen = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'styles', 'tailwind.input.css'), 'utf8');

  assert.match(engine, /bossEncounterId: defeatedMainBoss\?\.id \?\? null/);
  assert.match(engine, /event\.kind === 'boss' && isMajorBossId\(event\.bossId\)/);
  assert.match(app, /recordBossVictory\(current, summary\.bossEncounterId as string\)/);
  assert.match(app, /pendingLaunch\.runMode === 'boss-archive'/);
  assert.match(app, /if \(isBossArchiveRun\) return null/);
  assert.match(
    app,
    /if \(\s*!isCampaignRun\s*&&\s*!isNonCompetitiveRun\s*&&\s*summary\.bossEncounterId\s*&&\s*summary\.bossTerminalOutcome !== 'escaped'\s*\)/
  );
  assert.match(app, /campaign:\s*activeBossReplayCampaign\s*\?\?/);
  assert.match(app, /buildBossReplayCampaign\(\s*activeBossEncounterId,\s*activeBossArchiveRun\?\.difficultyId \?\? 'easy'/);
  assert.match(app, /beginBossArchiveFightEconomy\([\s\S]*?difficultyId: bossDifficultyId,[\s\S]*?attemptId: reservedArchiveResultId!/);
  assert.match(app, /difficultyId: bossDifficultyId,[\s\S]*?seed: `boss-archive:/);
  assert.doesNotMatch(app, /'practice'|Practice Run|Practice remains available/);
  assert.match(app, /levelId:\s*activeBossReplay\?\.missionId\s*\?\?/);
  assert.match(app, /waveId:\s*activeBossReplay\?\.waveId\s*\?\?/);
  assert.match(
    engine,
    /requestedInitialCampaignIndex = this\.findCampaignWaveIndex\(\s*this\.initialLevelId,\s*this\.initialWaveId\s*\)/
  );
  assert.match(
    engine,
    /this\.currentCampaignIndex = requestedInitialCampaignIndex >= 0\s*\? requestedInitialCampaignIndex\s*:\s*0/
  );
  assert.doesNotMatch(
    engine,
    /if \(!this\.previewMode\) \{\s*this\.currentCampaignIndex = 0/
  );
  assert.match(startScreen, /walletControl \|\| canOpenBossArchive/);
  assert.match(
    startScreen,
    /availableBossArchiveEntries = founderSandbox\s*\?\s*BOSS_ARCHIVE_CATALOG\s*:\s*earnedBossArchiveEntries/
  );
  assert.match(startScreen, /catalogEntries=\{founderSandbox \? BOSS_ARCHIVE_CATALOG : undefined\}/);
  assert.match(startScreen, /revealLockedEntries=\{false\}/);
  assert.match(startScreen, /data-boss-lab-trigger="true"/);
  assert.doesNotMatch(startScreen, /bossArchiveDevUnlockAll|bossArchiveDeveloperControls/);
  assert.match(startScreen, /permanentSquadState\.bossArchive\.unlockedEventIds/);
  assert.match(startScreen, /permanentSquadState\.bossArchive\.seenEventIds/);
  assert.match(startScreen, /data-boss-archive-command-row=\{canOpenBossArchive \? 'true' : 'false'\}/);
  assert.match(startScreen, /grid-cols-\[clamp\(3\.25rem,14vw,3\.6rem\)_minmax\(0,1fr\)_clamp\(3\.25rem,14vw,3\.6rem\)\]/);
  assert.match(startScreen, /data-boss-archive-trigger="true"/);
  assert.match(startScreen, /data-boss-archive-wallet-slot="true"/);
  assert.match(startScreen, /const bossArchiveNotificationCount = newBossArchiveEventIds\.length/);
  assert.match(startScreen, /data-attention=\{bossArchiveNotificationCount > 0 \? 'true' : 'false'\}/);
  assert.match(startScreen, /sci-home-command-icon__art--boss/);
  assert.match(
    styles,
    /\.sci-home-command-icon__art--boss\s*\{[\s\S]*?width:\s*118%;[\s\S]*?height:\s*118%;/
  );
  assert.doesNotMatch(startScreen, /boss-alert-banners-v1\/effects\/warning-ring-red\.png/);
  assert.doesNotMatch(startScreen, />\s*Bosses\s*<\/span>/);
  assert.match(
    app,
    /!requestedBossReplay[\s\S]*?!isOwnerWallet[\s\S]*?!permanentSquadState\.bossArchive\.unlockedEventIds\.includes\(requestedBossReplay\.eventId\)/
  );
  assert.ok(
    startScreen.indexOf('onClick={openBossArchive}') < startScreen.indexOf('{walletControl}'),
    'Boss Archive trigger must render to the left of the wallet control'
  );
  assert.match(startScreen, /newBossArchiveEventIds\.length > 0/);
});
