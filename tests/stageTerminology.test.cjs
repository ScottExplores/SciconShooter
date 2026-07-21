const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('top-level run progress is presented as Stage without renaming compatibility fields', () => {
  const app = read('App.tsx');
  const startScreen = read('components', 'StartScreen.tsx');
  const missionRecord = read('components', 'MissionRecordPreview.tsx');
  const stagePresentation = read('services', 'stagePresentation.ts');
  const storyBeats = read('services', 'storyBeats.ts');
  const recordRenderer = read('shared', 'record-card', 'renderRecordCardSvg.mjs');
  const recordDefaults = read('game-config', 'recordCard.ts');
  const campaign = JSON.parse(read('game-config', 'campaign.json'));

  assert.match(app, />Stage<\/span><strong[^>]*>\{stats\.wave\}/);
  assert.match(app, /Select stage/);
  assert.match(app, />\s*S\{wave\}\s*</);
  assert.doesNotMatch(app, />Wave<\/span>|Select wave|Jump to W\{stats\.wave\} boss/);

  assert.match(startScreen, /`Stage \$\{entry\.wave \?\? '-'\}`/);
  assert.match(startScreen, /Stage \{winner\.wave \|\| 1\}/);
  assert.match(startScreen, /pts - Stage \{run\.receipt\.metrics\.wave\}/);
  assert.doesNotMatch(startScreen, /`Wave \$\{entry\.wave|\/> Wave \{winner\.wave|pts - Wave/);

  assert.match(missionRecord, /reached Stage \$\{receipt\.metrics\.wave\}/);
  assert.match(missionRecord, /getStageName\(receipt\.metrics\.wave\)/);
  assert.doesNotMatch(missionRecord, /reached wave \$\{receipt\.metrics\.wave\}/);
  assert.match(app, /getStageName\(stats\.wave\)/);
  for (const stageName of ['Open Orbit', 'Citation Storm', 'Paywall Siege', 'Open Galaxy', 'Bastion Protocol']) {
    assert.match(stagePresentation, new RegExp(`'${stageName}'`));
  }
  assert.match(stagePresentation, /STAGE_NAMES\[\(stage - 1\) % STAGE_NAMES\.length\]/);
  assert.doesNotMatch(app, /Gatekeeper Sector|Replication Rift|Deep Review Space/);
  assert.doesNotMatch(missionRecord, /Gatekeeper Sector|Replication Rift|Deep Review Space/);

  assert.match(storyBeats, /Final stage\./);
  assert.doesNotMatch(storyBeats, /Final wave\./);
  assert.match(recordRenderer, /wave: 'STAGE'/);
  assert.match(recordRenderer, /RECORD_CARD_RENDER_VERSION = '2026-07-21-stage-2'/);
  assert.match(recordDefaults, /wave: 'STAGE'/);
  assert.equal(campaign.recordCard.copy.metricLabels.wave, 'STAGE');

  assert.match(app, /stats\.wave/);
  assert.match(missionRecord, /receipt\.metrics\.wave/);
  assert.match(recordRenderer, /record\.wave/);
});

test('stage names follow the same five-stage loop used by campaign progression', async () => {
  const source = read('services', 'stagePresentation.ts');
  const executable = source
    .replace(/export const /g, 'const ')
    .replace(/ as const/g, '')
    .replace(/: string/g, '')
    .replace(/\(wave: number\)/g, '(wave)');
  const getStageName = Function(`${executable}; return getStageName;`)();

  assert.equal(getStageName(1), 'Open Orbit');
  assert.equal(getStageName(5), 'Bastion Protocol');
  assert.equal(getStageName(6), 'Open Orbit');
  assert.equal(getStageName(10), 'Bastion Protocol');
});
