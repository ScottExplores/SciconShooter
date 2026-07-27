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

const loadBossArchive = () => {
  const source = fs.readFileSync(path.join(root, 'services', 'bossArchive.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === './levelConfig') {
      return {
        DEFAULT_GAME_CAMPAIGN: campaign,
        cloneGameCampaign: clone,
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

const authoredGatekeepers = campaign.levels
  .slice()
  .sort((left, right) => left.order - right.order)
  .flatMap((level) => level.waves
    .slice()
    .sort((left, right) => left.order - right.order)
    .flatMap((wave) => wave.events
      .filter((event) => event.kind === 'boss' && event.bossId === 'gatekeeper')
      .map((event) => ({ level, wave, event }))));

test('catalog uses exact authored gatekeeper event IDs in campaign order', () => {
  assert.equal(archive.BOSS_ARCHIVE_CATALOG.length, authoredGatekeepers.length);
  assert.deepEqual(
    Array.from(archive.BOSS_ARCHIVE_CATALOG, (entry) => entry.eventId),
    authoredGatekeepers.map(({ event }) => event.id)
  );
  assert.equal(new Set(archive.BOSS_ARCHIVE_CATALOG.map((entry) => entry.eventId)).size, authoredGatekeepers.length);

  archive.BOSS_ARCHIVE_CATALOG.forEach((entry, index) => {
    const authored = authoredGatekeepers[index];
    assert.equal(entry.bossId, 'gatekeeper');
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
  const selected = archive.BOSS_ARCHIVE_CATALOG.find((entry) => entry.missionNumber === 9);
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
  assert.notEqual(originalSelected.startSeconds, 0);
  assert.equal(archive.buildBossReplayCampaign('unknown-event'), null);
});

test('service imports the canonical art resolver rather than constructing asset paths', () => {
  const source = fs.readFileSync(path.join(root, 'services', 'bossArchive.ts'), 'utf8');
  assert.match(source, /getPrimaryAssetPath/);
  assert.match(source, /artUrl: getPrimaryAssetPath\(event\.spriteKey\)/);
  assert.doesNotMatch(source, /\/game-art\//);
});

test('production integration unlocks only authored boss victories and keeps replays noncompetitive', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'services', 'gameLogic.ts'), 'utf8');
  const startScreen = fs.readFileSync(path.join(root, 'components', 'StartScreen.tsx'), 'utf8');

  assert.match(engine, /bossEncounterId: defeatedMainBoss\?\.id \?\? null/);
  assert.match(engine, /event\.kind === 'boss' && event\.bossId === 'gatekeeper'/);
  assert.match(app, /!isNonCompetitiveRun && summary\.bossEncounterId/);
  assert.match(app, /recordBossVictory\(current, summary\.bossEncounterId as string\)/);
  assert.match(app, /pendingLaunch\.runMode === 'boss-archive'/);
  assert.match(app, /if \(isBossArchiveRun\) return null/);
  assert.match(app, /campaign: activeBossReplayCampaign/);
  assert.match(app, /levelId: activeBossReplay\?\.missionId/);
  assert.match(app, /waveId: activeBossReplay\?\.waveId/);
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
  assert.match(startScreen, /founderSandbox\s*\? BOSS_ARCHIVE_CATALOG\s*:\s*earnedBossArchiveEntries/);
  assert.match(startScreen, /permanentSquadState\.bossArchive\.unlockedEventIds/);
  assert.match(startScreen, /permanentSquadState\.bossArchive\.seenEventIds/);
  assert.match(startScreen, /data-boss-archive-command-row=\{canOpenBossArchive \? 'true' : 'false'\}/);
  assert.match(startScreen, /grid-cols-\[clamp\(3\.25rem,14vw,3\.6rem\)_minmax\(0,1fr\)_clamp\(3\.25rem,14vw,3\.6rem\)\]/);
  assert.match(startScreen, /data-boss-archive-trigger="true"/);
  assert.match(startScreen, /data-boss-archive-wallet-slot="true"/);
  assert.match(startScreen, />\s*Bosses\s*<\/span>/);
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
