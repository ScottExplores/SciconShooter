const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const loadModel = () => {
  const source = read('components/boss-archive/BossArchiveModel.ts');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request === '../../services/bossArchive') {
      return {
        BOSS_ARCHIVE_DIFFICULTIES: Object.freeze([
          Object.freeze({ id: 'easy', label: 'Easy', description: 'Easy', healthMultiplier: 0.75, tempoMultiplier: 0.9 }),
          Object.freeze({ id: 'medium', label: 'Medium', description: 'Medium', healthMultiplier: 1, tempoMultiplier: 1 }),
          Object.freeze({ id: 'heroic', label: 'Heroic', description: 'Heroic', healthMultiplier: 1.5, tempoMultiplier: 1.2 })
        ])
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

const model = loadModel();
const entry = (id, missionNumber) => ({
  eventId: id,
  bossId: 'gatekeeper',
  label: `Boss ${missionNumber}`,
  missionId: `mission-${missionNumber}`,
  missionName: `Mission ${missionNumber}`,
  missionNumber,
  waveId: `wave-${missionNumber}`,
  waveName: 'Final Wave',
  waveNumber: 3,
  spriteKey: `boss-${missionNumber}`,
  artUrl: `/boss-${missionNumber}.png`
});

test('archive view model stays data-driven and never promotes locked entries to unlocked', () => {
  const first = entry('first-boss', 1);
  const second = entry('second-boss', 2);
  const third = entry('third-boss', 3);
  const items = model.buildBossArchiveViewEntries({
    unlockedEntries: [second, first],
    catalogEntries: [third, second, first],
    newEncounterIds: ['second-boss'],
    presentations: {
      'second-boss': {
        subtitle: 'Authored subtitle',
        mechanicTags: ['Beam lanes'],
        idleFrameUrls: ['/idle-1.png', '/idle-2.png']
      }
    },
    records: { 'second-boss': { timesDefeated: 4 } },
    revealLockedEntries: true
  });

  assert.deepEqual(Array.from(items, (item) => item.entry.eventId), [
    'first-boss',
    'second-boss',
    'third-boss'
  ]);
  assert.equal(items[0].unlocked, true);
  assert.equal(items[1].isNew, true);
  assert.equal(items[1].presentation.subtitle, 'Authored subtitle');
  assert.deepEqual(Array.from(items[1].presentation.mechanicTags), ['Beam lanes']);
  assert.equal(items[1].record.timesDefeated, 4);
  assert.equal(items[2].unlocked, false);
  assert.equal(items[2].isNew, false);
});

test('new unlock wins initial focus, followed by profile selection and remembered fallback', () => {
  const items = [1, 2, 3].map((missionNumber) => ({
    entry: entry(`boss-${missionNumber}`, missionNumber),
    unlocked: true,
    isNew: missionNumber === 3,
    presentation: {},
    record: {}
  }));
  assert.equal(model.resolveBossArchiveInitialIndex(items, 'boss-2', 'boss-1'), 2);
  const withoutNew = items.map((item) => ({ ...item, isNew: false }));
  assert.equal(model.resolveBossArchiveInitialIndex(withoutNew, 'boss-2', 'boss-1'), 1);
  assert.equal(model.resolveBossArchiveInitialIndex(withoutNew, null, 'boss-1'), 0);
});

test('cover-flow index helpers loop and choose the shortest neighbor path', () => {
  assert.equal(model.getLoopedBossArchiveIndex(4, -1), 3);
  assert.equal(model.getLoopedBossArchiveIndex(4, 4), 0);
  assert.equal(model.getBossArchiveRelativePosition(3, 0, 4), -1);
  assert.equal(model.getBossArchiveRelativePosition(1, 0, 4), 1);
});

test('records and daily challenge copy are formatted without false reward claims', () => {
  assert.equal(model.formatBossArchiveClearTime(null), '--:--.--');
  assert.equal(model.formatBossArchiveClearTime(65_430), '01:05.43');
  const unlocked = {
    entry: entry('boss-1', 1),
    unlocked: true,
    isNew: false,
    presentation: {},
    record: {}
  };
  assert.match(model.getBossArchiveChallengeDisabledReason(unlocked, undefined), /not connected/i);
  assert.match(model.getBossArchiveChallengeDisabledReason(unlocked, {
    limit: 3,
    remaining: 0,
    resetLabel: 'Reset 4h'
  }), /Reset 4h/);
  assert.equal(model.getBossArchiveChallengeDisabledReason(unlocked, {
    limit: 3,
    remaining: 2,
    resetLabel: 'Reset 4h'
  }), null);

  const heroic = model.getBossArchiveDifficultyRecord({
    difficultyRecords: {
      heroic: {
        attempts: 4,
        clears: 2,
        noHitClears: 1,
        bestClearTimeMs: 54_000,
        bestNoHitTimeMs: 54_000
      }
    }
  }, 'heroic');
  assert.equal(heroic.clears, 2);
  assert.equal(heroic.bestClearTimeMs, 54_000);
  const migratedMedium = model.getBossArchiveDifficultyRecord({
    challengeAttempts: 3,
    challengeClears: 2,
    noHitClears: 1,
    bestChallengeTimeMs: 61_000
  }, 'medium');
  assert.equal(migratedMedium.attempts, 3);
  assert.equal(migratedMedium.clears, 2);
  assert.equal(migratedMedium.bestClearTimeMs, 61_000);
});

test('Boss Archive exposes one charge-based fight flow with difficulty records and stable artwork', () => {
  const archive = read('components/BossArchive.tsx');
  const carousel = read('components/boss-archive/BossArchiveCarousel.tsx');
  const portrait = read('components/boss-archive/BossArchivePortrait.tsx');
  const css = read('components/boss-archive/boss-archive.css');

  assert.match(archive, /BossArchiveCarousel/);
  assert.match(archive, /Recovered[\s\S]*Daily charges/);
  assert.deepEqual(
    Array.from(model.BOSS_ARCHIVE_DIFFICULTIES, (difficulty) => difficulty.label),
    ['Easy', 'Medium', 'Heroic']
  );
  assert.match(archive, /BOSS_ARCHIVE_DIFFICULTIES\.map/);
  assert.match(archive, /Defeated[\s\S]*Best clear[\s\S]*No-hit/);
  assert.match(archive, /Each fight costs 1 daily charge\./);
  assert.match(archive, /Play Boss/);
  assert.doesNotMatch(archive, />\s*Practice\s*</i);
  assert.doesNotMatch(archive, /Mastery Protocol|>\s*Variant\s*<|Practice rewards/i);
  assert.match(archive, /BossArchiveResultPanel/);
  assert.match(archive, /Archive Index/);
  assert.match(archive, /onNewEncounterViewed\?/);
  assert.match(carousel, /aria-roledescription="carousel"/);
  assert.match(carousel, /onPointerMove/);
  assert.match(carousel, /onWheel/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /navigator\.getGamepads/);
  assert.match(carousel, /BossArchivePortrait/);
  assert.match(archive, /className="boss-archive-index__portrait"/);
  assert.match(archive, /className="boss-archive-reveal__portrait"/);
  assert.match(portrait, /composition\.layers\.map/);
  assert.match(portrait, /preserveAspectRatio="xMidYMid meet"/);
  assert.doesNotMatch(`${carousel}\n${portrait}`, /setInterval|idleFrameUrls|frameIndex/);
  assert.doesNotMatch(css, /boss-archive-selected-idle|boss-archive-new-pulse/);
  assert.doesNotMatch(
    css.match(/\.boss-archive-carousel__portrait\s*\{[\s\S]*?\}/)?.[0] ?? '',
    /animation|filter/
  );
  assert.doesNotMatch(carousel, /\.filter\(\(\{ relative \}\) => Math\.abs\(relative\) <= 2\)/);
  assert.match(carousel, /image\.decode\?\.\(\)/);
  assert.doesNotMatch(css, /backdrop-filter|mix-blend-mode|boss-archive-ambient-turn/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('locked carousel and index entries never request real boss artwork', () => {
  const archive = read('components/BossArchive.tsx');
  const carousel = read('components/boss-archive/BossArchiveCarousel.tsx');
  assert.match(carousel, /if \(!item\.unlocked\) return \(/);
  assert.match(carousel, /boss-archive-carousel__unknown[\s\S]*<i \/>/);
  assert.doesNotMatch(
    carousel.match(/: \(\s*<div className="boss-archive-carousel__unknown"[\s\S]*?\);/m)?.[0] ?? '',
    /<img|BossArchivePortrait/
  );
  assert.match(archive, /item\.unlocked\s*\? <BossArchivePortrait[\s\S]*boss-archive-index__unknown/);
});
