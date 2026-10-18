// REVAMP(G): Reconcile intended contracts documented in REVAMP_NOTES_D.md (sector narrative and contextual radio headings).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

test('top-level run progress is presented as Mission without renaming compatibility fields', () => {
  const app = read('App.tsx');
  const startScreen = read('components', 'StartScreen.tsx');
  const missionRecord = read('components', 'MissionRecordPreview.tsx');
  const gameCanvas = read('components', 'GameCanvas.tsx');
  const victoryOverlay = read('components', 'WaveVictoryOverlay.tsx');
  const storyTransmission = read('components', 'StoryTransmission.tsx');
  const stagePresentation = read('services', 'stagePresentation.ts');
  const engine = read('services', 'gameLogic.ts');
  const pixiRenderer = read('services', 'pixi', 'PixiGameRenderer.ts');
  const rewards = read('services', 'rewardProgression.ts');
  const storyBeats = read('services', 'storyBeats.ts');
  const recordRenderer = read('shared', 'record-card', 'renderRecordCardSvg.mjs');
  const recordDefaults = read('game-config', 'recordCard.ts');
  const campaign = JSON.parse(read('game-config', 'campaign.json'));

  assert.match(app, />Mission<\/span><strong[^>]*>\{stats\.wave\}/);
  assert.match(app, /Select mission/);
  assert.match(app, />\s*M\{wave\}\s*</);
  assert.doesNotMatch(app, />Stage<\/span>|Select stage|Jump to Stage \{stats\.wave\} boss/);
  // Campaign progress is named Mission. Weekly Run is an endless wave mode and
  // intentionally uses "Wave" in its compact defeat summary.
  assert.doesNotMatch(app, />Wave<\/span><strong[^>]*>\{stats\.wave\}|Select wave|Jump to W\{stats\.wave\} boss/);

  assert.match(startScreen, /`Mission \$\{entry\.wave \?\? '-'\}`/);
  assert.match(startScreen, /Mission \{winner\.wave \|\| 1\}/);
  assert.match(startScreen, /pts - Mission \{run\.receipt\.metrics\.wave\}/);
  assert.doesNotMatch(startScreen, /`Stage \$\{entry\.wave|\/> Stage \{winner\.wave|pts - Stage/);
  assert.doesNotMatch(startScreen, /`Wave \$\{entry\.wave|\/> Wave \{winner\.wave|pts - Wave/);

  assert.match(missionRecord, /reached Mission \$\{receipt\.metrics\.wave\}/);
  assert.match(missionRecord, /getStageName\(receipt\.metrics\.wave\)/);
  assert.doesNotMatch(missionRecord, /reached Stage \$\{receipt\.metrics\.wave\}/);
  assert.doesNotMatch(missionRecord, /reached wave \$\{receipt\.metrics\.wave\}/);
  assert.match(app, /getStageName\(stats\.wave\)/);
  assert.match(gameCanvas, /'Scicon Shooter mission'/);
  assert.doesNotMatch(gameCanvas, /'Scicon Shooter game stage'/);
  for (const stageName of [
    'Open Orbit',
    'Citation Storm',
    'Paywall Siege',
    'Open Galaxy',
    'Bastion Protocol',
    'Helix Convergence',
    'Redline Corridor',
    'Dark Matter Run',
    'Mirror Array',
    'Null Sector',
    'Shard Tempest',
    'Quantum Cage',
    'Gravity Well',
    'Event Horizon',
    'Ion Citadel',
    'Crimson Vector',
    'Eclipse Swarm',
    'Fracture Engine',
    'Last Light Gauntlet',
    'Terminus Ascendant'
  ]) {
    assert.match(stagePresentation, new RegExp(`'${stageName}'`));
  }
  assert.match(stagePresentation, /STAGE_NAMES\[Math\.min\(stage, STAGE_NAMES\.length\) - 1\]/);
  assert.doesNotMatch(app, /Gatekeeper Sector|Replication Rift|Deep Review Space/);
  assert.doesNotMatch(missionRecord, /Gatekeeper Sector|Replication Rift|Deep Review Space/);

  assert.match(victoryOverlay, /Mission \{summary\.stage\}/);
  assert.match(victoryOverlay, /All 20 missions cleared/);
  assert.doesNotMatch(victoryOverlay, /All 20 stages cleared|>Stage \{summary\.stage\}</);
  // Beats are keyed to Sectors now, one per Sector, so the header names the
  // Sector. Rendering "Mission 3" for Sector 3 would have been simply wrong.
  assert.match(storyTransmission, /\{beat\.kicker \?\? `Sector \$\{beat\.phase\}`\}: \{beat\.title\}/);
  assert.doesNotMatch(storyTransmission, /Stage \{beat\.phase\}: \{beat\.title\}/);
  assert.match(rewards, /description: 'Reach Mission \{target\}'/);
  assert.match(engine, /beginStageCompletion\('MISSION COMPLETE!'/);
  assert.match(pixiRenderer, /MISSION \$\{String\(state\.levelNumber\)\.padStart\(2, '0'\)\}/);
  assert.match(storyBeats, /chapter: 'Singularity Archive'[\s\S]*All ten stations are sharing the sky/);
  assert.doesNotMatch(storyBeats, /Final stage\./);
  assert.doesNotMatch(storyBeats, /Final wave\./);
  assert.match(recordRenderer, /wave: 'MISSION'/);
  assert.match(recordRenderer, /RECORD_CARD_RENDER_VERSION = '2026-08-02-token-1'/);
  assert.match(recordDefaults, /wave: 'MISSION'/);
  assert.equal(campaign.recordCard.copy.metricLabels.wave, 'MISSION');

  assert.match(app, /stats\.wave/);
  assert.match(missionRecord, /receipt\.metrics\.wave/);
  assert.match(recordRenderer, /record\.wave/);
});

test('stage names cover all authored stages without wrapping after stage five', async () => {
  const source = read('services', 'stagePresentation.ts');
  const executable = source
    .replace(/export const /g, 'const ')
    .replace(/ as const/g, '')
    .replace(/: string/g, '')
    .replace(/\(wave: number\)/g, '(wave)');
  const getStageName = Function(`${executable}; return getStageName;`)();

  assert.equal(getStageName(1), 'Open Orbit');
  assert.equal(getStageName(5), 'Bastion Protocol');
  assert.equal(getStageName(6), 'Helix Convergence');
  assert.equal(getStageName(10), 'Null Sector');
  assert.equal(getStageName(15), 'Ion Citadel');
  assert.equal(getStageName(20), 'Terminus Ascendant');
  assert.equal(getStageName(21), 'Terminus Ascendant');
});
