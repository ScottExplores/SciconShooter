const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getPublicPrizeState, SCICON_BIG_EVENT } = require('../shared/weeklyCompetitionBoundary.js');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the Umbra loading screen follows the 25K event window and the existing load timing', () => {
  const closesAt = new Date(SCICON_BIG_EVENT.closesAt);

  assert.equal(getPublicPrizeState(new Date('2026-10-27T15:00:00.000Z')).phase, 'big-event');
  assert.equal(getPublicPrizeState(new Date(closesAt.getTime() - 1)).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(closesAt).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(new Date('2026-12-07T20:00:00.000Z')).phase, 'big-event');
  assert.notEqual(getPublicPrizeState(new Date('2026-10-25T12:00:00.000Z')).phase, 'big-event');

  const app = read('App.tsx');
  const screen = read('components/MissionLoadingScreen.tsx');
  const styles = read('components/event-loading-screen.css');
  const startup = read('services/startupPreload.ts');
  const entry = read('index.tsx');

  assert.match(app, /const eventLoadingScreen = getPublicPrizeState\(\)\.phase === 'big-event'/);
  assert.equal(app.match(/presentation=\{eventLoadingScreen \? 'event' : 'standard'\}/g)?.length, 2);
  assert.match(app, /const STARTUP_LOADING_MINIMUM_MS = 650/);
  assert.match(app, /const STARTUP_LOADING_READY_HOLD_MS = 180/);
  assert.doesNotMatch(app, /EVENT_LOADING_MINIMUM|eventLoadingMinimum/);
  assert.doesNotMatch(entry, /event-loader=|EventLoadingMockup|helios-clawcarrier/);
  assert.doesNotMatch(screen, /helios-clawcarrier|event-loader=/);
  assert.match(screen, /presentation === 'event' && !hasError/);
  assert.match(screen, /umbra-needlewing\/assembled\.png/);
  assert.match(screen, /nih-ship\.png/);
  assert.match(screen, /25,000 <span>RSC<\/span>/);
  assert.match(screen, /Ends Nov 29/);
  assert.match(screen, /Play Campaign first to upgrade your ship\./);
  assert.match(screen, /style=\{\{ width: `\$\{safeProgress\}%` \}\}/);
  assert.doesNotMatch(styles, /@keyframes sci-event-loader-fill/);
  assert.doesNotMatch(startup, /umbra-needlewing|nih-ship\.png|event-loading-screen/);
});
