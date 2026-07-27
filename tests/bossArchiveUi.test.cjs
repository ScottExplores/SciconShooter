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
  vm.runInNewContext(
    `(function(exports, require, module) { ${compiled} })(module.exports, require, module);`,
    { module, require, Object, Map, Set, Array, Boolean, Math, Number, String }
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
});

test('Boss Archive surface exposes polished carousel, modes, mastery, results, and accessible input hooks', () => {
  const archive = read('components/BossArchive.tsx');
  const carousel = read('components/boss-archive/BossArchiveCarousel.tsx');
  const css = read('components/boss-archive/boss-archive.css');

  assert.match(archive, /BossArchiveCarousel/);
  assert.match(archive, /Recovered[\s\S]*Daily charges/);
  assert.match(archive, /Practice[\s\S]*Challenge/);
  assert.match(archive, /A charge is spent only after victory\. Failed attempts are free\./);
  assert.match(archive, /Mastery Protocol/);
  assert.match(archive, /BossArchiveResultPanel/);
  assert.match(archive, /Archive Index/);
  assert.match(archive, /onNewEncounterViewed\?/);
  assert.match(carousel, /aria-roledescription="carousel"/);
  assert.match(carousel, /onPointerMove/);
  assert.match(carousel, /onWheel/);
  assert.match(carousel, /ArrowLeft/);
  assert.match(carousel, /navigator\.getGamepads/);
  assert.match(carousel, /data-idle-preview=\{selected \? 'active' : 'static'\}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('locked carousel and index entries never request real boss artwork', () => {
  const archive = read('components/BossArchive.tsx');
  const carousel = read('components/boss-archive/BossArchiveCarousel.tsx');
  assert.match(carousel, /if \(!item\.unlocked\) return;/);
  assert.match(carousel, /boss-archive-carousel__unknown[\s\S]*<i \/>/);
  assert.doesNotMatch(
    carousel.match(/: \(\s*<div className="boss-archive-carousel__unknown"[\s\S]*?\);/m)?.[0] ?? '',
    /<img/
  );
  assert.match(archive, /item\.unlocked\s*\? <img[\s\S]*boss-archive-index__unknown/);
});
